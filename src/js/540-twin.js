'use strict';
/* ================= Двойник: связь с реальной рукой и внешними программами ================= */

/* Вкладка «Двойник»: страница — клиент, который подключается к железной руке или к внешней
   программе и обменивается с ней JSON-сообщениями (протокол — §5.4 README проекта Robo-Arm:
   set_joint / move_all / gripper / home / emergency_stop, ответ state). Каналы:
     • WebSocket — прошивка ESP32 (ws://192.168.4.1/ws) или хаб tools/twin-mcp.mjs
       (ws://127.0.0.1:8765), через который рукой управляет MCP-агент (LLM) или скрипт;
     • Web Serial — USB-кабель в контроллер, те же JSON по строкам (Chrome/Edge).
   Каналов может быть несколько сразу (хаб + USB): входящие команды применяются к 3D-руке,
   а изменение позы — от слайдера, IK, анимации или команды — уходит во все каналы
   (`move_all` + `gripper`, не чаще раза в 50 мс, только при изменении).
   Оси двойника: все позные параметры цепочки по порядку, кроме раскрытия схвата и
   параметров инструмента (IK_SKIP) — J1…Jn как в move_all; раскрытие — gripper.
   Состояние `state` от руки применяется к 3D, только если включён приём и страница
   не двигала руку последние TWIN_IDLE_MS (иначе отстающая рука дёргала бы слайдеры).
   Своё состояние страница отдаёт по get_state с полем source:'3d' и тем же id. */

const TWIN_URL_KEY = 'roboArmTwinUrl', TWIN_BAUD_KEY = 'roboArmTwinBaud';
const TWIN_DEFAULT_URL = 'ws://127.0.0.1:8765';
const TWIN_SEND_MS = 50;      // не чаще: поза в канал
const TWIN_IDLE_MS = 400;     // столько после своей отправки state руки не применяется
const TWIN_RECONNECT_MS = 3000;
const TWIN_LOG_MAX = 60;

const twin = {
  links: [],            // { kind: 'ws' | 'serial', name, send(text), close() }
  wsWanted: false, ws: null, wsTimer: null,
  send: true, recv: true,
  lastPose: null,       // строка позы, ушедшей в каналы (или принятой от руки)
  lastSendAt: 0, renderAt: 0,
  armState: null,       // последний state от руки: { angles, open, moving, homing, at }
  log: [],
};

const twinUrl = document.getElementById('twinUrl');
const twinBaud = document.getElementById('twinBaud');
const btnTwinWs = document.getElementById('btnTwinWs');
const btnTwinSerial = document.getElementById('btnTwinSerial');
const chkTwinSend = document.getElementById('chkTwinSend');
const chkTwinRecv = document.getElementById('chkTwinRecv');
const twinStatus = document.getElementById('twinStatus');
const twinAxesEl = document.getElementById('twinAxes');
const twinLogEl = document.getElementById('twinLog');

/* ---- оси: позные параметры цепочки по порядку → J1…Jn; раскрытие схвата — отдельно ---- */
function twinAxes() {
  const out = [];
  components.forEach((c, i) => {
    for (const p of TYPES[c.type].params) if (!p.build && !IK_SKIP.has(p.key)) out.push({ c, p, i });
  });
  return out;
}
function twinGripper() {
  for (const c of components) if (TYPES[c.type].params.some(p => p.key === 'open')) return c;
  return null;
}
function twinPose() {
  const axes = twinAxes(), g = twinGripper();
  return {
    angles: axes.map(a => quantParam(a.c[a.p.key] ?? a.p.def, a.p)),
    open: g ? quantParam(g.open ?? 100, TYPES[g.type].params.find(p => p.key === 'open')) : null,
  };
}
function twinStateMessage(id) {
  const axes = twinAxes(), pose = twinPose();
  return {
    type: 'state', source: '3d', ...(id !== undefined ? { id } : {}),
    angles: pose.angles, open: pose.open, tip: armTip().toArray().map(v => +v.toFixed(3)),
    axes: axes.map((a, k) => ({ joint: k + 1, index: a.i, type: a.c.type, key: a.p.key, label: tr(a.p.label),
                                 min: a.p.min, max: paramMax(a.c, a.p), value: pose.angles[k] })),
    moving: false, homing: false,
  };
}

/* ---- журнал и статус ---- */
function twinLog(dir, text) {
  const line = `${new Date().toLocaleTimeString()} ${dir} ${text}`;
  twin.log.push(line);
  if (twin.log.length > TWIN_LOG_MAX) twin.log.shift();
  twinLogEl.textContent = twin.log.join('\n');
  twinLogEl.scrollTop = twinLogEl.scrollHeight;
}
function twinRenderStatus() {
  const n = twin.links.length;
  twinStatus.textContent = n ? t('twinOn', twin.links.map(l => l.name).join(' + ')) : (twin.wsWanted ? t('twinConnecting') : t('twinOff'));
  twinStatus.className = n ? 'on' : '';
  btnTwinWs.textContent = t(twin.wsWanted ? 'twinDisconnect' : 'twinConnect');
  btnTwinWs.classList.toggle('on', twin.wsWanted);
  const serial = twin.links.find(l => l.kind === 'serial');
  btnTwinSerial.textContent = t(serial ? 'twinSerialOff' : 'twinSerial');
  btnTwinSerial.classList.toggle('on', !!serial);
  document.querySelector('#tabs button[data-tab="twinarea"]').classList.toggle('linked', n > 0);
}

/* таблица осей: J, деталь, значение в 3D, значение с руки (последний state) */
let _twinAxesSig = '';
function twinRenderAxes(force) {
  const axes = twinAxes(), pose = twinPose(), st = twin.armState;
  const sig = axes.map(a => a.c.type + a.p.key).join();
  if (force || sig !== _twinAxesSig) {
    _twinAxesSig = sig;
    let html = `<tr><th>J</th><th>${t('twinColPart')}</th><th class="num">3D</th><th class="num">${t('twinColArm')}</th></tr>`;
    axes.forEach((a, k) => {
      html += `<tr><td class="j">${k + 1}</td><td>${iconSVG(a.c.type, 12)} ${tr(TYPES[a.c.type].label)} #${a.i + 1} · ${tr(a.p.label)}</td>
        <td class="num v3d"></td><td class="num varm"></td></tr>`;
    });
    html += `<tr><td class="j">G</td><td>${t('twinGripperRow')}</td><td class="num v3d"></td><td class="num varm"></td></tr>`;
    if (!axes.length) html = `<tr><td class="empty">${t('twinNoAxes')}</td></tr>`;
    twinAxesEl.innerHTML = html;
  }
  const v3d = twinAxesEl.querySelectorAll('.v3d'), varm = twinAxesEl.querySelectorAll('.varm');
  axes.forEach((a, k) => {
    v3d[k].textContent = pose.angles[k];
    varm[k].textContent = st && st.angles?.[k] != null ? +(+st.angles[k]).toFixed(1) : '—';
  });
  if (axes.length) {
    v3d[axes.length].textContent = pose.open ?? '—';
    varm[axes.length].textContent = st && st.open != null ? +(+st.open).toFixed(1) : '—';
  }
}

/* ---- каналы ---- */
function twinAddLink(link) {
  twin.links.push(link);
  twinLog('•', t('twinLinked', link.name));
  twinRenderStatus();
  /* новому каналу — текущая поза целиком */
  if (twin.send) { twin.lastPose = null; twinTick(performance.now(), true); }
}
function twinRemoveLink(link) {
  const k = twin.links.indexOf(link);
  if (k < 0) return;
  twin.links.splice(k, 1);
  twinLog('•', t('twinUnlinked', link.name));
  twinRenderStatus();
}
function twinBroadcast(obj, except) {
  const text = JSON.stringify(obj);
  let sent = 0;
  for (const l of twin.links) if (l !== except) { try { l.send(text); sent++; } catch (e) { twinLog('!', e.message); } }
  if (sent) twinLog('→', text);
  return sent;
}
function twinReply(link, obj) {
  const text = JSON.stringify(obj);
  try { link.send(text); twinLog('→', text); } catch (e) { twinLog('!', e.message); }
}

/* WebSocket: кнопка-тумблер; пока «хочу подключение», обрыв переподключается сам */
function twinWsConnect() {
  const url = twinUrl.value.trim() || TWIN_DEFAULT_URL;
  try { localStorage.setItem(TWIN_URL_KEY, url); } catch { /* file:// без хранилища */ }
  let ws;
  try { ws = new WebSocket(url); } catch (e) { twinLog('!', e.message); twin.wsWanted = false; twinRenderStatus(); return; }
  twin.ws = ws;
  const link = { kind: 'ws', name: 'WebSocket', send: text => ws.send(text), close: () => ws.close() };
  ws.onopen = () => twinAddLink(link);
  ws.onmessage = e => twinHandle(String(e.data), link);
  ws.onerror = () => twinLog('!', t('twinWsError', url));
  ws.onclose = () => {
    twinRemoveLink(link);
    if (twin.ws === ws) twin.ws = null;
    if (twin.wsWanted) twin.wsTimer = setTimeout(twinWsConnect, TWIN_RECONNECT_MS);
    twinRenderStatus();
  };
  twinRenderStatus();
}
function twinWsToggle() {
  twin.wsWanted = !twin.wsWanted;
  clearTimeout(twin.wsTimer);
  if (twin.wsWanted) twinWsConnect();
  else if (twin.ws) twin.ws.close();
  twinRenderStatus();
}

/* Web Serial: USB в контроллер, JSON по строкам; в браузерах без API кнопка скрыта */
async function twinSerialToggle() {
  const cur = twin.links.find(l => l.kind === 'serial');
  if (cur) { await cur.close(); return; }
  if (!navigator.serial) return;
  const baudRate = Math.max(300, +twinBaud.value || 115200);
  try { localStorage.setItem(TWIN_BAUD_KEY, String(baudRate)); } catch { /* file:// без хранилища */ }
  let port;
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate });
  } catch (e) { twinLog('!', e.message); return; }
  const enc = new TextEncoder(), writer = port.writable.getWriter();
  let reader = null, closing = false;
  const link = {
    kind: 'serial', name: 'USB',
    send: text => writer.write(enc.encode(text + '\n')),
    close: async () => {
      closing = true;
      try { await reader?.cancel(); } catch { /* уже закрыт */ }
      try { writer.releaseLock(); await port.close(); } catch { /* уже закрыт */ }
      twinRemoveLink(link);
    },
  };
  twinAddLink(link);
  (async () => {
    const dec = new TextDecoder();
    let buf = '';
    try {
      reader = port.readable.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop();
        for (const line of lines) if (line.trim()) twinHandle(line, link);
      }
    } catch (e) { if (!closing) twinLog('!', e.message); }
    if (!closing) link.close();
  })();
}

/* ---- входящие сообщения: команды применяются всегда, state — по правилам приёма ---- */
function twinHandle(text, link) {
  for (const line of String(text).split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let msg;
    try { msg = JSON.parse(s); } catch { twinLog('?', s.slice(0, 120)); continue; }
    twinLog('←', s.length > 200 ? s.slice(0, 200) + '…' : s);
    try { twinApply(msg, link); } catch (e) { twinLog('!', e.message); if (msg?.id !== undefined) twinReply(link, { type: 'error', id: msg.id, message: e.message }); }
  }
}

function twinSetAxes(angles, open) {
  const axes = twinAxes();
  if (Array.isArray(angles)) axes.forEach((a, k) => {
    const v = angles[k];
    if (typeof v !== 'number' || !isFinite(v)) return;
    setParamChecked(a.c, a.p.key, Math.min(paramMax(a.c, a.p), Math.max(a.p.min, v)));
    syncSlider(a.c, a.p.key);
  });
  const g = twinGripper();
  if (g && typeof open === 'number' && isFinite(open)) {
    const p = TYPES[g.type].params.find(q => q.key === 'open');
    setParamChecked(g, 'open', Math.min(p.max, Math.max(p.min, open)));
    syncSlider(g, 'open');
  }
  invalidate();
}

/* внешняя команда движения выключает авто-анимацию: иначе она тут же уводит суставы от заданного */
function twinStopAnimation() {
  if (chkAnimate.checked) { chkAnimate.checked = false; syncAnimToggle(); }
}

function twinApply(msg, link) {
  if (!msg || typeof msg !== 'object') return;
  const { type, id } = msg;
  if (['move_all', 'set_joint', 'gripper', 'home', 'ik', 'emergency_stop'].includes(type)) twinStopAnimation();
  switch (type) {
    case 'move_all': twinSetAxes(msg.angles, msg.open); break;
    case 'set_joint': {
      const axes = twinAxes(), a = axes[(msg.joint | 0) - 1];
      if (!a) throw new Error(`no joint ${msg.joint} (have ${axes.length})`);
      const angles = axes.map(() => null); angles[(msg.joint | 0) - 1] = +msg.angle;
      twinSetAxes(angles); break;
    }
    case 'gripper': twinSetAxes(null, +msg.open); break;
    case 'home': {
      const axes = twinAxes(), g = twinGripper();
      twinSetAxes(axes.map(a => Math.min(paramMax(a.c, a.p), Math.max(a.p.min, a.p.def))),
                  g ? TYPES[g.type].params.find(p => p.key === 'open').def : undefined);
      twinBroadcast(msg, link); // хоуминг нужен и железу, если оно на другом канале
      break;
    }
    case 'emergency_stop': twinBroadcast(msg, link); break;
    case 'set_speed': twinBroadcast(msg, link); break;
    case 'ik': {
      const tgt = Array.isArray(msg.target) ? msg.target : [msg.x, msg.y, msg.z];
      if (tgt.some(v => typeof v !== 'number')) throw new Error('ik: target [x, y, z] expected');
      const start = ikParams().map(x => ({ ...x, v0: x.c[x.p.key] }));
      const dist = ikSolve(new THREE.Vector3(...tgt));
      ikCommit(start);
      twinReply(link, { type: 'ik_result', source: '3d', ...(id !== undefined ? { id } : {}),
                        reached: dist <= IK_TOL, distance: +dist.toFixed(3), tip: armTip().toArray().map(v => +v.toFixed(3)) });
      break;
    }
    case 'get_state': twinReply(link, twinStateMessage(id)); break;
    case 'get_arm': twinReply(link, { type: 'arm', source: '3d', ...(id !== undefined ? { id } : {}), components: cleanConfig() }); break;
    case 'set_arm': {
      const cfg = validateConfig(clone(msg.components));
      pushUndo();
      components = cfg;
      buildArm();
      renderPanel();
      twinReply(link, { type: 'arm', source: '3d', ...(id !== undefined ? { id } : {}), components: cleanConfig() });
      break;
    }
    case 'state': {
      if (msg.source === '3d') break; // эхо другой страницы через хаб
      twin.armState = { angles: msg.angles, open: msg.open ?? msg.gripper, moving: !!msg.moving, homing: !!msg.homing, at: performance.now() };
      if (twin.recv && performance.now() - twin.lastSendAt > TWIN_IDLE_MS) {
        twinSetAxes(msg.angles, twin.armState.open);
        twin.lastPose = JSON.stringify(twinPose()); // принятое не отправляется обратно
      }
      break;
    }
    case 'error': break; // уже в журнале
    default: throw new Error(`unknown type "${type}"`);
  }
}

/* ---- кадр: поза изменилась → move_all (+ gripper) во все каналы, с троттлингом ---- */
function twinTick(now, force) {
  if (twin.links.length && twin.send) {
    const pose = twinPose(), key = JSON.stringify(pose);
    if (key !== twin.lastPose && (force || now - twin.lastSendAt >= TWIN_SEND_MS)) {
      const prev = twin.lastPose ? JSON.parse(twin.lastPose) : null;
      if (!prev || JSON.stringify(prev.angles) !== JSON.stringify(pose.angles)) twinBroadcast({ type: 'move_all', angles: pose.angles });
      if (pose.open != null && (!prev || prev.open !== pose.open)) twinBroadcast({ type: 'gripper', open: pose.open });
      twin.lastPose = key;
      twin.lastSendAt = now;
    }
  }
  if (document.getElementById('twinarea').classList.contains('active') && now - twin.renderAt > 200) {
    twin.renderAt = now;
    twinRenderAxes(false);
  }
}

/* ---- разметка: сохранённый адрес и скорость, кнопки ---- */
try {
  twinUrl.value = localStorage.getItem(TWIN_URL_KEY) || TWIN_DEFAULT_URL;
  twinBaud.value = localStorage.getItem(TWIN_BAUD_KEY) || '115200';
} catch { twinUrl.value = TWIN_DEFAULT_URL; }
if (!navigator.serial) document.getElementById('twinSerialRow').hidden = true;
btnTwinWs.onclick = twinWsToggle;
btnTwinSerial.onclick = twinSerialToggle;
chkTwinSend.onchange = () => { twin.send = chkTwinSend.checked; twin.lastPose = null; };
chkTwinRecv.onchange = () => { twin.recv = chkTwinRecv.checked; };
document.getElementById('btnTwinHome').onclick = () => twinApply({ type: 'home' }, null);
document.getElementById('btnTwinStop').onclick = () => twinApply({ type: 'emergency_stop' }, null);
document.getElementById('btnTwinLogClear').onclick = () => { twin.log.length = 0; twinLogEl.textContent = ''; };
