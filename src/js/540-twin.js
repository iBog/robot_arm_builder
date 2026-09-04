'use strict';
/* ================= Двойник: связь с реальной рукой, внешними программами и соседними страницами ================= */

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
   Своё состояние страница отдаёт по get_state с полем source:'3d' и тем же id.

   Соседние страницы (несколько браузеров или компьютеров через один хаб — `node
   tools/twin-mcp.mjs --serve` раздаёт страницу по локальной сети): у каждой страницы
   случайный id `peer` и имя; поза (`move_all`/`gripper`) и состав (`arm`) уходят с полями
   peer/name, по ним сосед отличает страницу от железа и MCP. Одна рука на всех: кто первый
   начал двигать, тот держит замок (`twin.lock`) — соседи блокируются (body.twinLocked,
   плашка #twinLockHint) и зеркалят его действия, замок отпускается через TWIN_LOCK_MS после
   последнего действия владельца. Срок считается по локальному времени приёма, часы машин
   не участвуют. Двое схватили в одно окно — побеждает меньший peer id, второй уступает.
   Подключение: `hello` → каждый отвечает `peer` со своим составом; новичок принимает состав
   комнаты (если она не пуста и это не гонка одновременного входа), иначе рассылает свой.
   `peer_left` шлёт хаб (или сама страница при закрытии) — участник выбывает, его замок снимается.
   Пока есть соседи, авто-анимация выключена: общая рука сама не крутится (иначе анимация держала бы замок).
   Сообщения только для страниц помечены source:'3d' — хаб не пересылает их железу. */

const TWIN_URL_KEY = 'roboArmTwinUrl', TWIN_BAUD_KEY = 'roboArmTwinBaud', TWIN_NAME_KEY = 'roboArmTwinName';
const TWIN_DEFAULT_URL = 'ws://127.0.0.1:8765';
const TWIN_SEND_MS = 50;      // не чаще: поза в канал
const TWIN_IDLE_MS = 400;     // столько после своей отправки state руки не применяется
const TWIN_RECONNECT_MS = 3000;
const TWIN_LOCK_MS = 2000;    // замок: столько после последнего действия рука остаётся за участником
const TWIN_HELLO_MS = 1500;   // столько новичок ждёт ответа peer; без ответа комната его
const TWIN_LOG_MAX = 60;

const twin = {
  links: [],            // { kind: 'ws' | 'serial', name, send(text), close() }
  wsWanted: false, ws: null, wsTimer: null,
  send: true, recv: true,
  lastPose: null,       // строка позы, ушедшей в каналы (или принятой от руки/соседа)
  lastSendAt: 0, renderAt: 0, lockRenderAt: 0,
  armState: null,       // последний state от руки: { angles, open, moving, homing, at }
  log: [],
  me: { peer: Math.random().toString(16).slice(2, 10), name: '' },
  peers: new Map(),     // peer → { name, at } — соседние страницы
  lock: null,           // { peer, name, until } — кто держит руку; null — свободна
  lockUI: false,        // body.twinLocked выставлен
  lastArm: null,        // JSON состава, ушедшего соседям или принятого от них
  adopted: true,        // состав комнаты принят (или комната пуста / своя); false — только что вошли
  adopting: false,      // идёт пересборка по составу соседа — не рассылать его обратно
  adoptTimer: null,
};

const twinUrl = document.getElementById('twinUrl');
const twinBaud = document.getElementById('twinBaud');
const twinName = document.getElementById('twinName');
const btnTwinWs = document.getElementById('btnTwinWs');
const btnTwinSerial = document.getElementById('btnTwinSerial');
const chkTwinSend = document.getElementById('chkTwinSend');
const chkTwinRecv = document.getElementById('chkTwinRecv');
const twinStatus = document.getElementById('twinStatus');
const twinPeersEl = document.getElementById('twinPeers');
const twinAxesEl = document.getElementById('twinAxes');
const twinLogEl = document.getElementById('twinLog');
const twinLockHint = document.getElementById('twinLockHint');

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
  twinRenderPeers();
}

/* участники: я и соседи, у владельца замка — 🔒 */
function twinRenderPeers() {
  const now = performance.now(), holder = twin.lock && now < twin.lock.until ? twin.lock.peer : null;
  const row = [{ peer: twin.me.peer, name: t('twinMe', twin.me.name) }, ...[...twin.peers].map(([peer, p]) => ({ peer, name: p.name }))]
    .map(p => (p.peer === holder ? '🔒 ' : '') + p.name);
  twinPeersEl.textContent = twin.peers.size ? t('twinPeersRow', row.join(' · ')) : t('twinPeersNone', twin.me.name);
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

/* ---- замок: одна рука на всех соседей ---- */
function twinPeerFields() { return { peer: twin.me.peer, name: twin.me.name }; }
/* руку держит сосед и срок не вышел */
function twinLockOther(now = performance.now()) {
  const l = twin.lock;
  return !!l && l.peer !== twin.me.peer && now < l.until;
}
/* моё действие: замок свободен, истёк или мой → он мой ещё TWIN_LOCK_MS; чужой → false */
function twinClaim(now = performance.now()) {
  if (twinLockOther(now)) return false;
  twin.lock = { peer: twin.me.peer, name: twin.me.name, until: now + TWIN_LOCK_MS };
  return true;
}
/* действие соседа: отдать ли ему замок. Держит третий — нет; держу я и мой id меньше —
   нет (гонка: он уступит сам); иначе замок его и авто-анимация у меня гаснет */
function twinAccept(msg, now = performance.now()) {
  const l = twin.lock;
  if (l && now < l.until && l.peer !== msg.peer) {
    if (l.peer !== twin.me.peer || twin.me.peer < msg.peer) { twinLog('⊘', t('twinBusy', l.name)); return false; }
  }
  twin.lock = { peer: msg.peer, name: msg.name || msg.peer, until: now + TWIN_LOCK_MS };
  twinPeerSeen(msg);
  twinStopAnimation();
  return true;
}
function twinPeerSeen(msg) {
  if (!msg.peer || msg.peer === twin.me.peer) return;
  const known = twin.peers.get(msg.peer);
  twin.peers.set(msg.peer, { name: msg.name || msg.peer, at: performance.now() });
  if (!known) twinStopAnimation(); // общая рука сама не крутится: иначе анимация держала бы замок вечно
  if (!known || known.name !== (msg.name || msg.peer)) twinRenderPeers();
}
/* плашка над 3D-видом и блокировка панели, пока руку держит сосед */
function twinRenderLock(now = performance.now()) {
  if (twin.lock && now >= twin.lock.until) { twin.lock = null; twinRenderPeers(); }
  const other = twinLockOther(now);
  if (other !== twin.lockUI) {
    twin.lockUI = other;
    document.body.classList.toggle('twinLocked', other);
    twinLockHint.hidden = !other;
    if (other) twinStopAnimation();
    twinRenderPeers();
  }
  if (other) twinLockHint.textContent = t('twinLockedBy', twin.lock.name, ((twin.lock.until - now) / 1000).toFixed(1));
  twin.lockRenderAt = now;
}

/* ---- состав: своя перестройка уходит соседям, чужая принимается ---- */
/* зовётся из buildArm(): состав изменился → arm соседям (если замок не чужой) */
function twinArmChanged(force) {
  const json = JSON.stringify(cleanConfig());
  if (!force && json === twin.lastArm) return;
  twin.lastArm = json;
  if (twin.adopting || !twin.adopted || !twin.links.length || !twin.send) return;
  if (!twinClaim()) return; // чужой замок (set_arm от MCP при занятой руке): сосед получил ту же команду от хаба
  twinBroadcast({ type: 'arm', source: '3d', ...twinPeerFields(), components: cleanConfig() });
}
/* состав соседа: перестроить руку (с «Отменой»), не рассылая его обратно */
function twinAdopt(list) {
  const cfg = validateConfig(clone(list));
  twin.adopting = true;
  try {
    if (JSON.stringify(cfg) !== JSON.stringify(cleanConfig())) {
      pushUndo();
      components = cfg;
      buildArm();
      renderPanel();
    }
    twin.lastArm = JSON.stringify(cleanConfig());
  } finally { twin.adopting = false; }
  twin.lastPose = JSON.stringify(twinPose()); // поза пришла вместе с составом — не отправлять обратно
}
/* новичок дождался ответа peer (или нет): комната решена */
function twinAdopted() {
  clearTimeout(twin.adoptTimer);
  twin.adoptTimer = null;
  twin.adopted = true;
  twin.lastArm = null; twin.lastPose = null; // если состав свой — он и поза уйдут соседям
}

/* ---- каналы ---- */
function twinAddLink(link) {
  twin.links.push(link);
  twinLog('•', t('twinLinked', link.name));
  twinRenderStatus();
  if (link.kind === 'ws') {
    /* представиться; соседи ответят peer со своим составом, без ответа комната наша */
    twin.adopted = false;
    clearTimeout(twin.adoptTimer);
    twin.adoptTimer = setTimeout(() => { twinAdopted(); twinArmChanged(false); twinTick(performance.now(), true); }, TWIN_HELLO_MS);
    twinReply(link, { type: 'hello', source: '3d', ...twinPeerFields() });
  } else if (twin.send) { twin.lastPose = null; twinTick(performance.now(), true); } // железу — текущая поза целиком
}
function twinRemoveLink(link) {
  const k = twin.links.indexOf(link);
  if (k < 0) return;
  twin.links.splice(k, 1);
  twinLog('•', t('twinUnlinked', link.name));
  if (link.kind === 'ws' && !twin.links.some(l => l.kind === 'ws')) {
    twin.peers.clear();
    if (twin.lock && twin.lock.peer !== twin.me.peer) twin.lock = null;
    if (!twin.adopted) twinAdopted();
    twinRenderLock();
  }
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

/* ---- входящие сообщения: команды применяются всегда, state — по правилам приёма,
        сообщения соседей (с peer) — по замку ---- */
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
function twinHome() {
  const axes = twinAxes(), g = twinGripper();
  twinSetAxes(axes.map(a => Math.min(paramMax(a.c, a.p), Math.max(a.p.min, a.p.def))),
              g ? TYPES[g.type].params.find(p => p.key === 'open').def : undefined);
}

/* внешняя команда движения выключает авто-анимацию: иначе она тут же уводит суставы от заданного */
function twinStopAnimation() {
  if (chkAnimate.checked) { chkAnimate.checked = false; syncAnimToggle(); }
}

/* link === null — своя кнопка вкладки; сообщение с peer — от соседней страницы */
function twinApply(msg, link) {
  if (!msg || typeof msg !== 'object') return;
  const { type, id } = msg;
  if (msg.peer !== undefined && msg.peer === twin.me.peer) return; // своё эхо
  const fromPeer = msg.peer !== undefined;
  if (fromPeer && ['move_all', 'gripper', 'home', 'arm'].includes(type)) {
    if (!twinAccept(msg)) return; // руку держит другой
    twinRenderLock();
  } else if (['move_all', 'set_joint', 'gripper', 'home', 'ik', 'emergency_stop'].includes(type)) twinStopAnimation();
  switch (type) {
    case 'move_all': twinSetAxes(msg.angles, msg.open); if (fromPeer) twin.lastPose = JSON.stringify(twinPose()); break;
    case 'set_joint': {
      const axes = twinAxes(), a = axes[(msg.joint | 0) - 1];
      if (!a) throw new Error(`no joint ${msg.joint} (have ${axes.length})`);
      const angles = axes.map(() => null); angles[(msg.joint | 0) - 1] = +msg.angle;
      twinSetAxes(angles); break;
    }
    case 'gripper': twinSetAxes(null, +msg.open); if (fromPeer) twin.lastPose = JSON.stringify(twinPose()); break;
    case 'home': {
      if (link === null && !twinClaim()) break; // своя кнопка при чужом замке
      twinHome();
      if (fromPeer) twin.lastPose = JSON.stringify(twinPose());
      else twinBroadcast(msg, link); // хоуминг нужен и железу, если оно на другом канале
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
    case 'arm': if (fromPeer) twinAdopt(msg.components); break; // без peer — ответ соседа на чужой get_arm
    case 'hello': {
      twinPeerSeen(msg);
      /* оба только что вошли: комната остаётся за меньшим id, второй примет его состав */
      if (!twin.adopted && twin.me.peer < msg.peer) { twinAdopted(); twinArmChanged(false); }
      const l = twin.lock, now = performance.now();
      twinReply(link, { type: 'peer', source: '3d', ...twinPeerFields(), components: cleanConfig(),
                        lock: l && now < l.until ? { peer: l.peer, name: l.name, ms: Math.round(l.until - now) } : null });
      break;
    }
    case 'peer': {
      twinPeerSeen(msg);
      if (!twin.adopted && Array.isArray(msg.components)) {
        twinAdopted();
        if (msg.components.length) twinAdopt(msg.components);
        else twinArmChanged(true); // комната пуста — наша рука становится общей
        if (msg.lock && msg.lock.peer !== twin.me.peer) {
          twin.lock = { peer: msg.lock.peer, name: msg.lock.name || msg.lock.peer, until: performance.now() + (+msg.lock.ms || 0) };
          twinRenderLock();
        }
      }
      break;
    }
    case 'peer_left': {
      if (twin.peers.delete(msg.peer)) twinRenderPeers();
      if (twin.lock?.peer === msg.peer) { twin.lock = null; twinRenderLock(); }
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

/* ---- кадр: поза изменилась → move_all (+ gripper) во все каналы, с троттлингом; замок ---- */
function twinTick(now, force) {
  if (twin.lock && (now - twin.lockRenderAt > 100 || now >= twin.lock.until)) twinRenderLock(now);
  if (twin.links.length && twin.send && twin.adopted) {
    const pose = twinPose(), key = JSON.stringify(pose);
    if (key !== twin.lastPose && (force || now - twin.lastSendAt >= TWIN_SEND_MS)) {
      if (twinLockOther(now)) twin.lastPose = key; // чужой замок: панель заблокирована, принятое уже наше
      else {
        twinClaim(now);
        const prev = twin.lastPose ? JSON.parse(twin.lastPose) : null;
        if (!prev || JSON.stringify(prev.angles) !== JSON.stringify(pose.angles)) twinBroadcast({ type: 'move_all', angles: pose.angles, ...twinPeerFields() });
        if (pose.open != null && (!prev || prev.open !== pose.open)) twinBroadcast({ type: 'gripper', open: pose.open, ...twinPeerFields() });
        twin.lastPose = key;
        twin.lastSendAt = now;
      }
    }
  }
  if (document.getElementById('twinarea').classList.contains('active') && now - twin.renderAt > 200) {
    twin.renderAt = now;
    twinRenderAxes(false);
  }
}

/* ---- разметка: сохранённый адрес, скорость и имя, кнопки, ?twin= в ссылке ---- */
try {
  twinUrl.value = localStorage.getItem(TWIN_URL_KEY) || TWIN_DEFAULT_URL;
  twinBaud.value = localStorage.getItem(TWIN_BAUD_KEY) || '115200';
  twin.me.name = localStorage.getItem(TWIN_NAME_KEY) || '';
} catch { twinUrl.value = TWIN_DEFAULT_URL; }
if (!twin.me.name) twin.me.name = t('twinGuest', twin.me.peer.slice(0, 4));
twinName.value = twin.me.name;
if (!navigator.serial) document.getElementById('twinSerialRow').hidden = true;
btnTwinWs.onclick = twinWsToggle;
btnTwinSerial.onclick = twinSerialToggle;
chkTwinSend.onchange = () => { twin.send = chkTwinSend.checked; twin.lastPose = null; };
chkTwinRecv.onchange = () => { twin.recv = chkTwinRecv.checked; };
twinName.onchange = () => {
  twin.me.name = twinName.value.trim().slice(0, 24) || t('twinGuest', twin.me.peer.slice(0, 4));
  twinName.value = twin.me.name;
  try { localStorage.setItem(TWIN_NAME_KEY, twin.me.name); } catch { /* file:// без хранилища */ }
  if (twin.lock?.peer === twin.me.peer) twin.lock.name = twin.me.name;
  twinRenderPeers();
  if (twin.links.length) twinBroadcast({ type: 'peer', source: '3d', ...twinPeerFields() });
};
document.getElementById('btnTwinHome').onclick = () => twinApply({ type: 'home' }, null);
document.getElementById('btnTwinStop').onclick = () => twinApply({ type: 'emergency_stop' }, null);
document.getElementById('btnTwinLogClear').onclick = () => { twin.log.length = 0; twinLogEl.textContent = ''; };
window.addEventListener('beforeunload', () => { if (twin.links.length) twinBroadcast({ type: 'peer_left', source: '3d', ...twinPeerFields() }); });
/* ?twin=auto — хаб, раздавший страницу (--serve): тот же хост, что и страница; ?twin=ws://… — явный адрес */
{
  const p = urlParam('twin');
  if (p) {
    twinUrl.value = p === 'auto' ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` : p;
    twin.wsWanted = true;
    twinWsConnect();
  }
}
