#!/usr/bin/env node
/* Хаб двойника и MCP-сервер без браузера: node tests/twin.test.mjs
   Запускает tools/twin-mcp.mjs на случайном порту, подключается к хабу как «страница»
   (встроенный WebSocket node ≥ 22) и гоняет MCP по stdio: initialize, tools/list,
   tools/call get_state / move_all / set_arm, ошибка без страницы; peer_left при обрыве
   страницы; --serve: страница отдаётся по http, корень ведёт на ?twin=auto. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, failed = 0;
const test = async (name, fn) => { try { await fn(); n++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '—', e.message); } };

const srv = spawn(process.execPath, [path.join(root, 'tools', 'twin-mcp.mjs'), '--port', '0'], { stdio: ['pipe', 'pipe', 'pipe'] });
const port = await new Promise((ok, bad) => {
  srv.stderr.on('data', d => { const m = /ws:\/\/127\.0\.0\.1:(\d+)/.exec(String(d)); if (m) ok(+m[1]); });
  srv.on('exit', c => bad(new Error('server exited ' + c)));
});
const replies = new Map(); // id → resolve
readline.createInterface({ input: srv.stdout }).on('line', line => {
  const msg = JSON.parse(line);
  if (replies.has(msg.id)) { replies.get(msg.id)(msg); replies.delete(msg.id); }
});
let rpcId = 0;
const rpc = (method, params) => new Promise(ok => {
  const id = ++rpcId;
  replies.set(id, ok);
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args = {}) => {
  const r = await rpc('tools/call', { name, arguments: args });
  return { ...r.result, data: r.result.isError ? null : JSON.parse(r.result.content[0].text) };
};

await test('initialize и tools/list', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'robo-arm-twin');
  const list = await rpc('tools/list', {});
  const names = list.result.tools.map(t => t.name);
  for (const t of ['get_state', 'move_all', 'set_joint', 'gripper', 'home', 'ik', 'get_arm', 'set_arm', 'stop']) assert.ok(names.includes(t), t);
});
await test('без страницы инструмент отвечает ошибкой, а не виснет', async () => {
  const r = await call('get_state');
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /no page connected/);
});

/* «страница»: отвечает на get_state / get_arm / set_arm, запоминает команды */
const pose = { angles: [0, 40, -60, 0], open: 60 };
const got = [];
const ws = new WebSocket(`ws://127.0.0.1:${port}`);
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
ws.onmessage = e => {
  const m = JSON.parse(String(e.data));
  got.push(m);
  if (m.type === 'move_all') { pose.angles = m.angles.map((v, i) => (v == null ? pose.angles[i] : v)); if (m.open != null) pose.open = m.open; }
  if (m.type === 'gripper') pose.open = m.open;
  if (m.type === 'get_state') ws.send(JSON.stringify({ type: 'state', source: '3d', id: m.id, ...pose, tip: [1, 2, 0] }));
  if (m.type === 'set_arm') ws.send(JSON.stringify({ type: 'arm', source: '3d', id: m.id, components: m.components }));
};
await new Promise(r => setTimeout(r, 100));

await test('get_state приходит от страницы с тем же id', async () => {
  const r = await call('get_state');
  assert.deepEqual(r.data.angles, [0, 40, -60, 0]);
  assert.equal(r.data.source, '3d');
});
await test('move_all: команда ушла странице, вернулось новое состояние', async () => {
  const r = await call('move_all', { angles: [10, null, 20, 0], open: 30 });
  assert.deepEqual(r.data.angles, [10, 40, 20, 0]);
  assert.equal(r.data.open, 30);
  assert.ok(got.some(m => m.type === 'move_all' && m.angles[0] === 10), 'move_all получен страницей');
});
await test('set_arm возвращает состав от страницы', async () => {
  const r = await call('set_arm', { components: [{ type: 'yaw', angle: 0 }, { type: 'gripper', open: 50 }] });
  assert.equal(r.data.components.length, 2);
});
await test('ответ страницы source:3d не считается состоянием железа (нет эха в stdout вне MCP)', async () => {
  assert.ok(!got.some(m => m.type === 'state'), 'страница не получала state обратно');
});
await test('хаб пересылает сообщения между клиентами: скрипт получает ответ страницы по своему id', async () => {
  const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((ok, bad) => { ws2.onopen = ok; ws2.onerror = bad; });
  const reply = new Promise(ok => { ws2.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id === 'script1') ok(m); }; });
  ws2.send(JSON.stringify({ type: 'get_state', id: 'script1' }));
  const m = await Promise.race([reply, new Promise((_, bad) => setTimeout(() => bad(new Error('нет ответа')), 2000))]);
  assert.equal(m.type, 'state');
  assert.ok(got.some(g => g.type === 'get_state' && g.id === 'script1'), 'запрос дошёл до страницы');
  ws2.close();
});

await test('страница с peer id обрывается — остальным уходит peer_left', async () => {
  const ws3 = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((ok, bad) => { ws3.onopen = ok; ws3.onerror = bad; });
  ws3.send(JSON.stringify({ type: 'hello', source: '3d', peer: 'p3', name: 'Three' }));
  await new Promise(r => setTimeout(r, 100));
  assert.ok(got.some(m => m.type === 'hello' && m.peer === 'p3'), 'hello дошёл до страницы');
  const k = got.length;
  ws3.close();
  const m = await new Promise((ok, bad) => {
    const t = setTimeout(() => { clearInterval(iv); bad(new Error('нет peer_left')); }, 2000);
    const iv = setInterval(() => { const x = got.slice(k).find(y => y.type === 'peer_left'); if (x) { clearInterval(iv); clearTimeout(t); ok(x); } }, 20);
  });
  assert.equal(m.peer, 'p3');
  assert.equal(m.name, 'Three');
  assert.equal(m.source, '3d');
});

ws.close();
srv.stdin.end();
await new Promise(r => setTimeout(r, 100));
srv.kill();
/* --serve: отдельный хаб раздаёт склейку страницы */
const srv2 = spawn(process.execPath, [path.join(root, 'tools', 'twin-mcp.mjs'), '--port', '0', '--serve', '--host', '127.0.0.1'], { stdio: ['pipe', 'pipe', 'pipe'] });
let err2 = '';
const port2 = await new Promise((ok, bad) => {
  srv2.stderr.on('data', d => { err2 += String(d); const m = /ws:\/\/127\.0\.0\.1:(\d+)/.exec(err2); if (m) ok(+m[1]); });
  srv2.on('exit', c => bad(new Error('serve exited ' + c)));
});
await new Promise(r => setTimeout(r, 100));
await test('--serve: корень ведёт на ?twin=auto, страница отдаётся целиком, исходники — нет', async () => {
  const r0 = await fetch(`http://127.0.0.1:${port2}/`, { redirect: 'manual' });
  assert.equal(r0.status, 302);
  assert.equal(r0.headers.get('location'), '/?twin=auto');
  const r1 = await fetch(`http://127.0.0.1:${port2}/?twin=auto`);
  assert.equal(r1.status, 200);
  const html = await r1.text();
  assert.match(html, /<title>/);
  assert.match(html, /twinLockOther/, 'склейка содержит модуль двойника');
  assert.ok(!/src\/js\/540-twin\.js/.test(html), 'страница одним файлом, без ссылок на src/');
  const r2 = await fetch(`http://127.0.0.1:${port2}/src/js/540-twin.js`);
  assert.equal(r2.status, 404, 'исходники не раздаются');
  assert.ok(err2.includes(`page: http://127.0.0.1:${port2}/?twin=auto`), 'ссылка напечатана в консоль');
});
await test('--serve: WebSocket на том же порту', async () => {
  const w = new WebSocket(`ws://127.0.0.1:${port2}`);
  await new Promise((ok, bad) => { w.onopen = ok; w.onerror = bad; });
  w.close();
});
srv2.stdin.end();
await new Promise(r => setTimeout(r, 100));
srv2.kill();
console.log(`${n} проверок прошли${failed ? `, ${failed} упали` : ''}`);
process.exit(failed ? 1 : 0);
