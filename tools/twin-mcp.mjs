#!/usr/bin/env node
/* Хаб двойника + MCP-сервер: node tools/twin-mcp.mjs [--port 8765] [--arm ws://192.168.4.1/ws] [--serve] [--host 0.0.0.0]
   Без зависимостей (WebSocket-сервер и MCP по stdio написаны здесь же).

   1. WebSocket-хаб на 127.0.0.1:PORT — к нему подключается страница (вкладка «Двойник»,
      адрес по умолчанию ws://127.0.0.1:8765) и любые скрипты: сообщения одного клиента
      уходят всем остальным. С --arm хаб сам подключается к железной руке
      и мостит: всё от страницы уходит в руку (кроме её ответов source:'3d'), всё от руки —
      во все страницы. Так 3D-рука и железная двигаются вместе даже без прямого Wi-Fi/USB.
      Несколько страниц на одном хабе делят одну руку (замок — на страницах, см.
      src/js/540-twin.js); хаб запоминает peer id каждой страницы и при обрыве сообщает
      остальным peer_left.
   2. --serve: хаб раздаёт и саму страницу — склейку index.html + src/ (tools/bundle.mjs,
      собирается в памяти при старте) по http://<адрес>:PORT/ — и слушает все интерфейсы,
      чтобы другой компьютер в локальной сети открыл ссылку и подключился к этому же хабу
      сам (страница читает ?twin=auto; корень без параметров перенаправляет на него).
      --host задаёт адрес явно (по умолчанию 127.0.0.1, с --serve — 0.0.0.0).
   3. MCP-сервер (JSON-RPC 2.0 по stdio, одно сообщение на строку) — инструменты для агента
      (Claude Code через .mcp.json, любой другой MCP-клиент): get_state, move_all, set_joint,
      gripper, home, ik, get_arm, set_arm, stop. Каждый инструмент шлёт команду странице
      и возвращает её ответ (после движения — свежий get_state).
      Если stdin — терминал, MCP не запускается: набранные строки JSON уходят страницам как есть.
   Протокол сообщений — src/js/540-twin.js и §5.4 README проекта Robo-Arm. */
import http from 'node:http';
import crypto from 'node:crypto';
import readline from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def; };
const PORT = +opt('--port', 8765);
const ARM_URL = opt('--arm', null);
const SERVE = args.includes('--serve');
const HOST = opt('--host', SERVE ? '0.0.0.0' : '127.0.0.1');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const logErr = (...a) => process.stderr.write(a.join(' ') + '\n');

/* ---------- --serve: страница одним файлом из памяти + картинки scr/ ---------- */
let pageHtml = null;
if (SERVE) {
  const { buildBundle } = await import('./bundle.mjs');
  pageHtml = buildBundle();
}
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function servePage(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (!url.search) { res.writeHead(302, { Location: '/?twin=auto' }); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(pageHtml); return;
  }
  const m = /^\/scr\/([\w.-]+)$/.exec(url.pathname); // og-картинка и иконка из <head>
  const file = m && path.join(root, 'scr', m[1]);
  if (file && fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res); return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found');
}

/* ---------- минимальный WebSocket-сервер (RFC 6455: текстовые кадры, ping/pong, close) ---------- */
const pages = new Set(); // сокеты страниц (и любых других клиентов хаба)
const waiters = new Map(); // id → resolve: ответы страниц на запросы MCP

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
}
function wsFrame(text, opcode = 1) {
  const payload = Buffer.from(text, 'utf8');
  const n = payload.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | opcode, n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, payload]);
}
/* разбор входящего буфера: вызывает onText для каждого целого текстового кадра */
function wsParse(sock, state, onText) {
  for (;;) {
    const b = state.buf;
    if (b.length < 2) return;
    const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (masked) off += 4;
    if (b.length < off + len) return;
    let payload = b.subarray(off, off + len);
    if (masked) { const m = b.subarray(off - 4, off); payload = Buffer.from(payload.map((x, i) => x ^ m[i & 3])); }
    state.buf = b.subarray(off + len);
    if (op === 8) { sock.end(wsFrame('', 8)); return; }
    if (op === 9) { sock.write(wsFrame(payload.toString(), 10)); continue; }
    if (op === 10) continue;
    if (op === 0 || !fin) { state.frag += payload.toString('utf8'); if (fin) { onText(state.frag); state.frag = ''; } continue; }
    if (op === 1) onText(payload.toString('utf8'));
  }
}

const server = http.createServer((req, res) => {
  if (pageHtml) servePage(req, res);
  else { res.writeHead(426, { 'Content-Type': 'text/plain' }); res.end('Robo-Arm twin hub: WebSocket only (start with --serve to get the page)'); }
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || !/websocket/i.test(req.headers.upgrade || '')) { sock.destroy(); return; }
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`);
  const client = { sock, peer: null, name: null, send: text => sock.write(wsFrame(text)) };
  const state = { buf: Buffer.alloc(0), frag: '' };
  pages.add(client);
  logErr(`page connected (${pages.size})`);
  sock.on('data', chunk => { state.buf = Buffer.concat([state.buf, chunk]); wsParse(sock, state, text => onPageMessage(text, client)); });
  const bye = () => {
    if (!pages.delete(client)) return;
    logErr(`page disconnected (${pages.size})${client.name ? `: ${client.name}` : ''}`);
    /* страница представилась peer id — остальным сообщить, что она выбыла (её замок снимается) */
    if (client.peer) toPages({ type: 'peer_left', source: '3d', peer: client.peer, name: client.name });
  };
  sock.on('close', bye); sock.on('error', bye); sock.on('end', bye);
});

/* сообщение от клиента хаба: ответ на запрос MCP (по id), остальным клиентам (страницам,
   скриптам) — как есть, железу — всё, кроме сообщений страниц (source:'3d') */
function onPageMessage(text, client) {
  let msg = null;
  try { msg = JSON.parse(text); } catch { /* не JSON — пусть уйдёт как есть */ }
  if (msg?.id !== undefined && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); }
  if (typeof msg?.peer === 'string') { client.peer = msg.peer; if (msg.name) client.name = String(msg.name); }
  for (const p of pages) if (p !== client) p.send(text);
  if (arm && arm.readyState === 1 && msg?.source !== '3d') arm.send(text);
  if (!mcpMode) process.stdout.write(text + '\n');
}
function toPages(obj) {
  const text = JSON.stringify(obj);
  for (const p of pages) p.send(text);
  return pages.size;
}

/* ---------- мост к железной руке (--arm): клиент WebSocket, переподключение ---------- */
let arm = null;
function connectArm() {
  if (!ARM_URL) return;
  arm = new WebSocket(ARM_URL);
  arm.onopen = () => logErr(`arm connected: ${ARM_URL}`);
  arm.onmessage = e => toPages(JSON.parse(String(e.data)));
  arm.onerror = () => {};
  arm.onclose = () => { logErr('arm disconnected, retry in 3 s'); setTimeout(connectArm, 3000); };
}

/* ---------- запрос к странице с ожиданием ответа по id ---------- */
let seq = 0;
function ask(obj, timeout = 3000) {
  return new Promise((resolve, reject) => {
    if (!pages.size) { reject(new Error('no page connected: open index.html, tab "Twin", connect to ws://127.0.0.1:' + PORT)); return; }
    const id = `mcp${++seq}`;
    const timer = setTimeout(() => { waiters.delete(id); reject(new Error('page did not answer in time')); }, timeout);
    waiters.set(id, msg => { clearTimeout(timer); resolve(msg); });
    toPages({ ...obj, id });
  });
}
async function command(obj) {  // команда без ответа → затем состояние
  toPages(obj);
  await new Promise(r => setTimeout(r, 120));
  return ask({ type: 'get_state' });
}

/* ---------- MCP: инструменты ---------- */
const num = (d, extra = {}) => ({ type: 'number', description: d, ...extra });
const TOOLS = [
  { name: 'get_state', description: 'Current pose of the 3D arm: joints J1..Jn (axes with type, key, range, value), gripper opening, tip position [x,y,z] in scene units (1 = ~1 m).',
    inputSchema: { type: 'object', properties: {} }, run: () => ask({ type: 'get_state' }) },
  { name: 'move_all', description: 'Set all joint values at once (angles in degrees for joints, scene units for prismatic/rail). Array order = J1..Jn from get_state; null keeps a joint unchanged. Values are clamped to ranges and to the floor.',
    inputSchema: { type: 'object', properties: { angles: { type: 'array', items: { type: ['number', 'null'] } }, open: num('gripper opening 0..100, optional') }, required: ['angles'] },
    run: a => command({ type: 'move_all', angles: a.angles, ...(a.open !== undefined ? { open: a.open } : {}) }) },
  { name: 'set_joint', description: 'Set one joint (1-based index from get_state) to a value.',
    inputSchema: { type: 'object', properties: { joint: num('1-based joint number'), angle: num('target value') }, required: ['joint', 'angle'] },
    run: a => command({ type: 'set_joint', joint: a.joint, angle: a.angle }) },
  { name: 'gripper', description: 'Open the gripper: 0 = closed, 100 = fully open.',
    inputSchema: { type: 'object', properties: { open: num('0..100') }, required: ['open'] }, run: a => command({ type: 'gripper', open: a.open }) },
  { name: 'home', description: 'Return every joint to its default pose (and send home to the hardware, if bridged).',
    inputSchema: { type: 'object', properties: {} }, run: () => command({ type: 'home' }) },
  { name: 'ik', description: 'Move the arm tip to a point [x, y, z] (scene units, y is up, base at the origin) with the built-in inverse kinematics. Returns whether the point was reached and the resulting tip.',
    inputSchema: { type: 'object', properties: { x: num('x'), y: num('y, up'), z: num('z') }, required: ['x', 'y', 'z'] },
    run: async a => { const r = await ask({ type: 'ik', target: [a.x, a.y, a.z] }, 15000); return { ...r, state: await ask({ type: 'get_state' }) }; } },
  { name: 'get_arm', description: 'Structure of the 3D arm: the chain of components from base to tip with their parameters (the JSON of the JSON tab).',
    inputSchema: { type: 'object', properties: {} }, run: () => ask({ type: 'get_arm' }) },
  { name: 'set_arm', description: 'Rebuild the 3D arm from a component chain (same format as get_arm / schema.json): types yaw, pitch, roll, spherical, prismatic, rail, link, offset, gripper, suction, drill, mill.',
    inputSchema: { type: 'object', properties: { components: { type: 'array', items: { type: 'object' } } }, required: ['components'] },
    run: a => ask({ type: 'set_arm', components: a.components }) },
  { name: 'stop', description: 'Emergency stop: stops the auto-animation of the 3D arm and forwards emergency_stop to the hardware.',
    inputSchema: { type: 'object', properties: {} }, run: () => command({ type: 'emergency_stop' }) },
];

const mcpMode = !process.stdin.isTTY;
const out = obj => process.stdout.write(JSON.stringify(obj) + '\n');
async function onRpc(req) {
  const { id, method, params } = req;
  const reply = result => { if (id !== undefined) out({ jsonrpc: '2.0', id, result }); };
  const fail = (code, message) => { if (id !== undefined) out({ jsonrpc: '2.0', id, error: { code, message } }); };
  try {
    switch (method) {
      case 'initialize': reply({ protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } },
                                 serverInfo: { name: 'robo-arm-twin', version: VERSION } }); break;
      case 'ping': reply({}); break;
      case 'tools/list': reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) }); break;
      case 'tools/call': {
        const tool = TOOLS.find(t => t.name === params?.name);
        if (!tool) { fail(-32602, `unknown tool ${params?.name}`); break; }
        try { const r = await tool.run(params.arguments || {}); reply({ content: [{ type: 'text', text: JSON.stringify(r, null, 1) }] }); }
        catch (e) { reply({ content: [{ type: 'text', text: e.message }], isError: true }); }
        break;
      }
      default: if (!method?.startsWith('notifications/')) fail(-32601, `method not found: ${method}`);
    }
  } catch (e) { fail(-32603, e.message); }
}

/* адреса, по которым страницу откроют с других машин: IPv4 всех внешних интерфейсов */
function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(a => a.family === 'IPv4' && !a.internal).map(a => a.address);
}

server.listen(PORT, HOST, () => {
  const port = server.address().port;
  logErr(`hub ws://127.0.0.1:${port}${ARM_URL ? ` ⇄ arm ${ARM_URL}` : ''}${mcpMode ? ' · MCP on stdio' : ' · type JSON lines to send'}`);
  if (SERVE) {
    const hosts = HOST === '0.0.0.0' || HOST === '::' ? ['127.0.0.1', ...lanAddresses()] : [HOST];
    logErr('page: ' + hosts.map(h => `http://${h}:${port}/?twin=auto`).join('  '));
  }
  connectArm();
});
readline.createInterface({ input: process.stdin, terminal: false }).on('line', line => {
  const s = line.trim();
  if (!s) return;
  if (mcpMode) { let req; try { req = JSON.parse(s); } catch { return; } onRpc(req); }
  else if (!toPages(JSON.parse(s))) logErr('no page connected');
}).on('close', () => { if (mcpMode) process.exit(0); });
