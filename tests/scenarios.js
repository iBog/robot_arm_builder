/* ---- Сценарии для tests/run.mjs. Код вставляется в модуль index.html после старта
   (buildArm(); renderPanel();) и видит все внутренние функции и состояние.
   log() пишет строки в элемент pre#testlog, expect() — строку PASS/FAIL. ---- */
const SCEN = '__SCEN__';
const GOLDEN = '__GOLDEN__';
const LOG = [];
/* детерминированные прогоны: солвер поз использует случайные рестарты */
Math.random = (seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(20260902);
window.addEventListener('error', e => { LOG.push('ERR ' + e.message + ' @' + e.lineno); flush(); });
function flush() {
  let pre = document.getElementById('testlog');
  if (!pre) { pre = document.createElement('pre'); pre.id = 'testlog'; document.body.appendChild(pre); }
  pre.textContent = LOG.join(String.fromCharCode(10));
}
const log = (...a) => LOG.push(a.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
const expect = (ok, msg) => log((ok ? 'PASS' : 'FAIL') + ' ' + msg);
const f3 = v => (Array.isArray(v) ? v : v.toArray()).map(x => +x.toFixed(3));
let T_NOW = 1000;
function ticks(n, dtMs = 16) { for (let k = 0; k < n; k++) { T_NOW += dtMs; challengeTick(T_NOW); } }
function setArm(cfg) { components = validateConfig(clone(cfg)); buildArm(); renderPanel(); }
function joints(idx) {
  return idx.map(i => ({ c: components[i], key: 'angle', min: TYPES[components[i].type].params[0].min,
                         max: TYPES[components[i].type].params[0].max }));
}
/* координатный спуск со случайными рестартами: подбор углов под objective() */
function solve(objective, params, restarts = 20) {
  const ev = () => { for (const p of params) applyParam3D(p.c); armRoot.updateWorldMatrix(true, true); return objective(); };
  let best = null, bestF = Infinity;
  for (let r = 0; r < restarts; r++) {
    for (const p of params) p.c[p.key] = p.min + Math.random() * (p.max - p.min);
    let f = ev(), step = 40;
    while (step > 0.02) {
      let improved = false;
      for (const p of params) for (const d of [-1, 1]) {
        const old = p.c[p.key];
        p.c[p.key] = Math.min(p.max, Math.max(p.min, old + d * step));
        const f2 = ev();
        if (f2 < f) { f = f2; improved = true; } else p.c[p.key] = old;
      }
      if (!improved) step *= 0.5;
    }
    if (f < bestF) { bestF = f; best = params.map(p => p.c[p.key]); }
  }
  params.forEach((p, i) => { p.c[p.key] = best[i]; });
  ev();
  return bestF;
}
/* локальный спуск из текущей позы — непрерывная траектория */
function solveLocal(objective, params) {
  const ev = () => { for (const p of params) applyParam3D(p.c); armRoot.updateWorldMatrix(true, true); return objective(); };
  let f = ev(), step = 4;
  while (step > 0.01) {
    let improved = false;
    for (const p of params) for (const d of [-1, 1]) {
      const old = p.c[p.key];
      p.c[p.key] = Math.min(p.max, Math.max(p.min, old + d * step));
      const f2 = ev();
      if (f2 < f) { f = f2; improved = true; } else p.c[p.key] = old;
    }
    if (!improved) step *= 0.5;
  }
  return f;
}
/* прямолинейный проход инструмента: цель интерполируется, поза решается локально на каждом кадре */
function sweepLine(J, posFn, from, to, extra, n = 40) {
  let f = 0;
  for (let k = 1; k <= n; k++) {
    const pt = from.clone().lerp(to, k / n);
    f = solveLocal(() => posFn().distanceTo(pt) + (extra ? extra() : 0), J);
    ticks(1);
  }
  return f;
}
const GRIP_ARM = [{ type: 'yaw', angle: 0 }, { type: 'pitch', angle: 0 }, { type: 'link', length: 1.0 },
                  { type: 'pitch', angle: 0 }, { type: 'link', length: 0.8 }, { type: 'pitch', angle: 0 }, { type: 'gripper', open: 100 }];
const held = () => !!chal.held;
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };

await (async () => { try {
  /* ---------- золотой снимок геометрии и URDF: ловит регрессии в размерах деталей ---------- */
  if (SCEN === 'golden') {
    const ARMS = [
      [{ type: 'yaw', angle: 0 }, { type: 'pitch', angle: 40 }, { type: 'link', length: 1.2 }, { type: 'pitch', angle: -60 }, { type: 'link', length: 1.0 }, { type: 'roll', angle: 0 }, { type: 'gripper', open: 60 }],
      [{ type: 'rail', pos: 0.5 }, { type: 'spherical', pitch: 20, yaw: 30 }, { type: 'link', length: 0.7 }, { type: 'offset', length: 0.6 }, { type: 'prismatic', length: 0.9, ext: 0.3 }, { type: 'suction', power: 40 }],
      [{ type: 'yaw', angle: 30 }, { type: 'pitch', angle: 70 }, { type: 'link', length: 1.5 }, { type: 'roll', angle: 45 }, { type: 'drill', speed: 50 }],
      [{ type: 'yaw', angle: -30 }, { type: 'pitch', angle: 50 }, { type: 'link', length: 1.1 }, { type: 'pitch', angle: 30 }, { type: 'mill', speed: 50 }],
      [{ type: 'gripper', open: 0 }], [{ type: 'gripper', open: 100 }], [{ type: 'prismatic', length: 0.3, ext: 0.3 }],
    ];
    const snap = ARMS.map(cfg => {
      setArm(cfg);
      armRoot.updateWorldMatrix(true, true);
      const pts = [];
      armRoot.traverse(o => { if (o.isMesh && !o.userData.zone) { const p = o.getWorldPosition(new THREE.Vector3()); pts.push(...f3(p)); } });
      const last = pivots[pivots.length - 1], tip = last.localToWorld(new THREE.Vector3(0, 0, 0));
      const sph = boundsSphere([armRoot]);
      return { urdf: hashStr(buildURDF().replace(/Source configuration:.*$/m, '')), meshes: pts.length / 3, hash: hashStr(pts.join(',')),
               tip: f3(tip), minY: +armMinY().toFixed(3), r: +sph.radius.toFixed(3), caps: armCapsules(new Set()).length,
               grip: components[0].type === 'gripper' ? +gripInner(components[0]).toFixed(3) : null };
    });
    log('GOLDEN ' + JSON.stringify(snap));
    if (GOLDEN) {
      snap.forEach((s, i) => expect(JSON.stringify(s) === JSON.stringify(GOLDEN[i]), `arm ${i}: ${JSON.stringify(s) === JSON.stringify(GOLDEN[i]) ? 'совпадает' : 'было ' + JSON.stringify(GOLDEN[i]) + ' стало ' + JSON.stringify(s)}`));
    } else log('golden.json пока нет: запустите с --update');
  }

  /* ---------- задание 1: захват, кольцо, стенки загона, гравитация ---------- */
  if (SCEN === 'pick') {
    startChallenge();
    setArm(GRIP_ARM);
    const J = joints([0, 1, 3, 5]), grip = components[6], gp = () => pivots[6], cube = chal.t1.cube, h = chal.holdables[0];
    const target = new THREE.Vector3(0, 0.4, 0);
    const graspObj = () => gp().worldToLocal(cube.position.clone()).distanceTo(target);
    const cubePos = () => new THREE.Vector3().setFromMatrixPosition(_cm.multiplyMatrices(gp().matrixWorld, chal.held.holdM));
    solve(graspObj, J); ticks(5);
    expect(!held(), 'раскрытый схват кубик не держит');
    grip.open = 60; applyParam3D(grip); ticks(5);
    expect(held() && h.grabbed, 'смыкание пальцев на кубике — захват');
    expect(Math.abs(grip._fingers[0].position.x - 0.165) < 1e-6, 'пальцы упираются в кубик');
    const ringT = new THREE.Vector3(CHAL.ring.pos[0], 0.18, CHAL.ring.pos[1]);
    solve(() => cubePos().distanceTo(ringT), J); ticks(5);
    grip.open = 100; applyParam3D(grip); ticks(150);
    expect(!held() && chal.t1.phase === 1 && h.resting && Math.abs(cube.position.y - 0.12) < 1e-3, 'отпущен над кольцом — упал, лёг плашмя, кольцо засчитано');
    solve(graspObj, J); ticks(3); grip.open = 60; applyParam3D(grip); ticks(5); expect(held(), 'повторный захват');
    const lowT = new THREE.Vector3(CHAL.pen.pos[0] + CHAL.pen.half + 0.02, 0.14, CHAL.pen.pos[1]);
    solve(() => cubePos().distanceTo(lowT), J); ticks(20);
    expect(!held() && chal.t1.phase === 1, 'кубик упёрся в стенку загона понизу — выскользнул, загон не засчитан');
    solve(graspObj, J); ticks(3); grip.open = 60; applyParam3D(grip); ticks(5);
    const penT = new THREE.Vector3(CHAL.pen.pos[0], 0.27, CHAL.pen.pos[1]);
    solve(() => cubePos().distanceTo(penT), J); ticks(5); expect(held(), 'кубик над загоном в схвате');
    grip.open = 100; applyParam3D(grip); ticks(150);
    expect(chal.t1.phase === 2 && chal.done[0], 'сброшен в загон сверху — задание выполнено');
  }

  /* ---------- задание 2: сверление только вдоль оси, лишние отверстия допустимы ---------- */
  if (SCEN === 'drill') {
    startChallenge(); setTask(1);
    setArm([{ type: 'yaw', angle: 0 }, { type: 'pitch', angle: 0 }, { type: 'link', length: 1.2 },
            { type: 'pitch', angle: 0 }, { type: 'link', length: 0.9 }, { type: 'pitch', angle: 0 }, { type: 'drill', speed: 0 }]);
    const J = joints([0, 1, 3, 5]), drill = components[6];
    const tipOf = () => drill._spin.localToWorld(new THREE.Vector3(0, CHAL.drill.len, 0));
    const dirOf = () => tipOf().sub(drill._spin.getWorldPosition(new THREE.Vector3())).normalize();
    const want = new THREE.Vector3(-1, 0, 0), aim = tgt => () => tipOf().distanceTo(tgt) + 0.2 * dirOf().distanceTo(want);
    const stray = new THREE.Vector3(CHAL.wall.x - 0.03, CHAL.wall.square.y, 0);
    solve(aim(stray), J); drill.speed = 50; ticks(3);
    expect(chal.t2.holes.length === 1 && !chal.t2.drilled.some(Boolean), 'лишнее отверстие в центре — есть, но не засчитано');
    solve(aim(stray.clone().add(new THREE.Vector3(0, 0.15, 0))), J); ticks(3);
    expect(chal.t2.holes.length === 1, 'сдвиг вбок внутри стены нового отверстия не даёт');
    for (const [k, ck] of chal.t2.corners.entries()) {
      const outside = ck.clone().add(new THREE.Vector3(0.3, 0, 0)), tgt = ck.clone().add(new THREE.Vector3(-0.03, 0, 0));
      drill.speed = 0; solve(aim(outside), J); ticks(2);
      sweepLine(J, tipOf, tipOf(), tgt, () => 0.2 * dirOf().distanceTo(want), 40);
      expect(!chal.t2.drilled[k] && chal.t2.spindleOff, `угол ${k}: без оборотов не сверлит`);
      solve(aim(outside), J, 10); ticks(2); drill.speed = 50;
      sweepLine(J, tipOf, tipOf(), tgt, () => 0.2 * dirOf().distanceTo(want), 40);
      expect(chal.t2.drilled[k], `угол ${k}: просверлен`);
    }
    expect(chal.done[1], 'задание 2 выполнено');
    chkFit.checked = false; camera.position.set(CHAL.wall.x + 1.4, CHAL.wall.square.y + 0.5, 1.0); controls.target.set(CHAL.wall.x, CHAL.wall.square.y, 0);
  }

  /* ---------- задание 3: фреза режет в плоскости, боком толкает, половины по связности ---------- */
  if (SCEN === 'mill') {
    startChallenge(); setTask(2);
    setArm([{ type: 'yaw', angle: 0 }, { type: 'pitch', angle: 0 }, { type: 'link', length: 1.0 },
            { type: 'pitch', angle: 0 }, { type: 'link', length: 0.8 }, { type: 'pitch', angle: 0 }, { type: 'mill', speed: 0 }]);
    const J = joints([0, 1, 3, 5]), mill = components[6]; let grp = chal.t3.group;
    const ctr = () => mill._spin.getWorldPosition(new THREE.Vector3());
    const axis = () => mill._spin.localToWorld(new THREE.Vector3(0, 1, 0)).sub(ctr()).normalize();
    const alive = () => chal.t3.alive.reduce((a, b) => a + b, 0), total = alive();
    const push0 = pushObjects;
    pushObjects = function () {}; // капсулы руки проверяет сценарий push; здесь — только логика диска
    const poseAt = off => solve(() => ctr().distanceTo(grp.position.clone().add(off)) + 1.5 * (1 - Math.abs(axis().z)), J);
    const sweepTo = (off, n) => sweepLine(J, ctr, ctr(), grp.position.clone().add(off), () => 1.5 * (1 - Math.abs(axis().z)), n);
    poseAt(new THREE.Vector3(0, 0.3, -0.55)); mill.speed = 50; ticks(2);
    const a0 = alive(); sweepTo(new THREE.Vector3(0, 0.3, -0.2), 30);
    expect(a0 - alive() < 60, `боковой подход вдоль оси почти не режет (снято ${a0 - alive()} из ${total})`);
    mill.speed = 0; poseAt(new THREE.Vector3(0, 0.7, 0.25)); ticks(2); mill.speed = 50;
    sweepTo(new THREE.Vector3(0, 0.3, 0.25), 40);
    expect(chal.t3.offCut && !chal.done[2], 'пропил не посередине разделил чушку, но не засчитан');
    resetTask(); grp = chal.t3.group;
    mill.speed = 0; poseAt(new THREE.Vector3(0, 0.7, 0)); ticks(2);
    const a1 = alive(); sweepTo(new THREE.Vector3(0, 0.35, 0), 25);
    expect(a1 === alive(), 'без оборотов диск не режет');
    poseAt(new THREE.Vector3(0, 0.7, 0)); ticks(2); mill.speed = 50;
    /* одно погружение по глубине, без протяжки вбок: диск обязан пройти чушку насквозь,
       не уходя под пол — ради этого cutR с запасом больше вершин зубьев */
    sweepTo(new THREE.Vector3(0, 0.3, 0), 40);
    expect(chal.done[2] && armMinY() >= -0.005,
           `одно погружение посередине распилило чушку, рука над полом (minY ${armMinY().toFixed(3)})`);
    expect(!chal.done[0] && !chal.done[1] && renderChalStatus() === undefined
           && chalStatus.textContent.includes(t('chalLeft', '1, 2')), 'засчитано только третье: ' + chalStatus.textContent);
    /* результат распила остаётся на экране: диск в пропиле чушку не сдувает,
       выключенные обороты и движение вдоль оси — тоже */
    pushObjects = push0;
    const aDone = alive(), pDone = grp.position.clone();
    mill.speed = 0; ticks(60);
    sweepTo(new THREE.Vector3(0, 0.06, 0.3), 20); sweepTo(new THREE.Vector3(0, 0.5, 0.3), 20);
    expect(grp.parent === chalRoot && alive() === aDone && grp.position.distanceTo(pDone) < 0.05,
           `распиленная чушка осталась на месте (сдвиг ${grp.position.distanceTo(pDone).toFixed(2)}, вокселей ${alive()} из ${aDone})`);
    pushObjects = function () {};
    chkFit.checked = false; camera.position.set(1.1, 1.1, 3.0); controls.target.set(CHAL.billet.pos[0], 0.2, CHAL.billet.pos[1]);
  }

  /* ---------- чушку можно взять схватом, перенести и распилить на новом месте ---------- */
  if (SCEN === 'billet') {
    startChallenge(); setTask(2);
    setArm(GRIP_ARM);
    const J = joints([0, 1, 3, 5]), grip = components[6], gp = () => pivots[6], h = chal.holdables[0], grp = h.obj;
    solve(() => graspPoint(h, gp()).distanceTo(new THREE.Vector3(0, 0.4, 0)), J);
    ticks(3); grip.open = 80; applyParam3D(grip); ticks(3); expect(held(), 'чушка взята схватом');
    const objPos = () => new THREE.Vector3().setFromMatrixPosition(_cm.multiplyMatrices(gp().matrixWorld, chal.held.holdM));
    const objAxisY = () => { _cm.multiplyMatrices(gp().matrixWorld, chal.held.holdM); return Math.abs(new THREE.Vector3(0, 0, 1).transformDirection(_cm).y); };
    solve(() => objPos().distanceTo(new THREE.Vector3(0.6, 0.9, 1.2)) + 0.5 * objAxisY(), J); ticks(3);
    expect(held() && lowestY(h) > 0.4, 'поднята');
    grip.open = 100; applyParam3D(grip); ticks(200);
    expect(!held() && h.resting && Math.abs(grp.position.y - CHAL.billet.r) < 1e-3, 'отпущена — упала и легла на бок');
    setArm([{ type: 'yaw', angle: 0 }, { type: 'pitch', angle: 0 }, { type: 'link', length: 1.0 },
            { type: 'pitch', angle: 0 }, { type: 'link', length: 0.8 }, { type: 'pitch', angle: 0 }, { type: 'mill', speed: 0 }]);
    const J2 = joints([0, 1, 3, 5]), mill = components[6];
    pushObjects = function () {};
    const ctr = () => mill._spin.getWorldPosition(new THREE.Vector3());
    const axisW = () => mill._spin.localToWorld(new THREE.Vector3(0, 1, 0)).sub(ctr()).normalize();
    const bAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(grp.quaternion);
    solve(() => ctr().distanceTo(grp.position.clone().add(new THREE.Vector3(0, 0.45, 0))) + 1.5 * (1 - Math.abs(axisW().dot(bAxis))), J2);
    ticks(2); mill.speed = 50;
    sweepLine(J2, ctr, ctr(), grp.position.clone().add(new THREE.Vector3(0, 0.06, 0)), () => 1.5 * (1 - Math.abs(axisW().dot(bAxis))), 40);
    expect(chal.done[2], 'распилена на новом месте');
  }

  /* ---------- повторный вход и сброс возвращают позу в ноль, даже при промахе IK ---------- */
  if (SCEN === 'restart') {
    const drag = (c, key, v) => { const s = c._sliders[key].slider; s.value = v; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); };
    const pitch = components.find(c => c.type === 'pitch');
    startChallenge();
    drag(components[0], 'angle', 45); drag(pitch, 'angle', 30);
    chal.done[0] = true;
    document.getElementById('chalClose').click(); tutActions.querySelectorAll('button')[1].click();
    expect(chal === null && components[0].angle === 45, 'вышли с подтверждением, поза осталась');
    btnChal.click();
    expect(!!chal && components.every(c => !c.angle) && components[0]._sliders.angle.slider.value === '0', 'повторный вход: углы и слайдеры в нуле');
    /* мишень IK осталась у старой цели (промах): buildArm() зовёт ikRetry(), который тянул бы
       руку обратно к ней сразу после сброса позы — сброс должен снимать промах */
    drag(components[0], 'angle', 45); drag(pitch, 'angle', 30);
    setIK(true);
    ikSetMiss(armTip(new THREE.Vector3()).add(new THREE.Vector3(0, 0.03, 0)), 0.03);
    chal.done[0] = true;
    document.getElementById('chalClose').click(); tutActions.querySelectorAll('button')[1].click();
    btnChal.click();
    ikRetry(); // то, что сделала бы микрозадача из buildArm()
    expect(!ikMiss && ikHint.hidden, 'повторный вход снял промах IK');
    expect(components.every(c => !c.angle), 'повторный вход при промахе IK: углы в нуле, рука не вернулась к старой цели');
    drag(components[0], 'angle', 45); drag(pitch, 'angle', 30);
    ikSetMiss(armTip(new THREE.Vector3()).add(new THREE.Vector3(0, 0.03, 0)), 0.03);
    resetTask(); ikRetry();
    expect(!ikMiss && components.every(c => !c.angle), 'сброс при промахе IK: углы в нуле');
    drag(components[0], 'angle', 45);
    ikSetMiss(armTip(new THREE.Vector3()).add(new THREE.Vector3(0, 0.03, 0)), 0.03);
    document.querySelectorAll('#chalTasks .chal-task')[1].click(); ikRetry();
    expect(!ikMiss && components.every(c => !c.angle) && chal.task === 1, 'переход к заданию при промахе IK: углы в нуле');
    setIK(false);
    stopChallenge();
  }

  /* ---------- откат записи до шага: стрелка на строке, подтверждение, дальше запись продолжается ---------- */
  if (SCEN === 'rollback') {
    const drag = (c, key, v) => { const s = c._sliders[key].slider; s.value = v; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); };
    startChallenge();
    const pitch = components.find(c => c.type === 'pitch');
    drag(components[0], 'angle', 45);
    addRow.querySelector('button[data-type="roll"]').click();
    const n = components.length;
    drag(components[n - 1], 'angle', -90);
    document.querySelectorAll('#chalTasks .chal-task')[1].click();
    drag(pitch, 'angle', 20);
    expect(chal.log.map(a => a.kind).join() === 'param,add,param,task,param', 'журнал: ' + chal.log.map(a => a.kind).join());
    let backs = actList.querySelectorAll('.act-back');
    expect(backs.length === 4 && !actList.querySelectorAll('.act')[4].querySelector('.act-back'), 'стрелка на всех шагах, кроме последнего');
    backs[2].click();
    expect(!tutModal.hidden && chal.log.length === 5, 'откат переспрашивает, пока ничего не тронуто');
    tutActions.querySelector('button').click();
    expect(tutModal.hidden && chal.log.length === 5 && chal.task === 1 && pitch.angle === 20, '«Оставить» ничего не меняет');
    camera.position.set(9, 4, 9); controls.target.set(1, 1, 1);
    chal.done[0] = true; // отметка, полученная позже шага отката, должна сняться
    backs[2].click(); tutActions.querySelectorAll('button')[1].click();
    expect(tutModal.hidden && chal.log.length === 3 && chal.task === 0 && !chal.replay && !document.body.classList.contains('replaying'),
           'откат до шага 3: журнал обрезан, задание 1, повтор не висит');
    /* рука пересобрана из startConfig — объекты компонентов новые, старую ссылку на наклон не использовать */
    const pitch2 = components.find(c => c.type === 'pitch');
    expect(components.length === n && components[0].angle === 45 && components[n - 1].angle === -90 && pitch2.angle === 0
           && components[0]._sliders.angle.slider.value === '45', `рука — как после шага 3: состав и поза, слайдеры синхронны (${components.map(c => c.angle)})`);
    expect(chal.holdables[0]?.kind === 'cube' && !chal.done[0] && chal.lastNow === 0, 'предметы задания 1 заново, ✅ снята, dt следующего кадра нулевой');
    expect(f3(camera.position).join() === '9,4,9', 'камера не тронута');
    backs = actList.querySelectorAll('.act-back');
    expect(actList.querySelectorAll('.act').length === 3 && backs.length === 2, 'журнал перерисован: 3 шага, 2 стрелки');
    drag(components[0], 'angle', 10);
    expect(chal.log.length === 4 && chal.log[3].kind === 'param' && chal.log[3].from === 45 && chal.log[3].to === 10, 'новое действие записано следом за шагом отката');
    ticks(5); expect(chal.log.length === 4 && chal.task === 0, 'живые кадры после отката ничего не ломают');
    /* откат до первого шага; во время повтора стрелки спрятаны */
    rollbackLog(1);
    expect(chal.log.length === 1 && components.length === n - 1 && components[0].angle === 45, 'откат до шага 1: добавленное снято, поза шага 1');
    drag(components[0], 'angle', 20);
    startReplay();
    expect(getComputedStyle(actList.querySelector('.act-back')).display === 'none', 'во время повтора стрелок нет');
    stopReplay(); stopChallenge();
  }

  /* ---------- запись IK: поза применяется целиком, а не по параметру ---------- */
  if (SCEN === 'pose') {
    setArm([{ type: 'pitch', angle: 0 }, { type: 'link', length: 0.5 }, { type: 'pitch', angle: 0 }, { type: 'link', length: 1 }, { type: 'drill', speed: 0 }]);
    startChallenge();
    const p1 = components[0], p2 = components[2];
    /* конечная поза допустима, но первый её параметр в одиночку уводит руку под пол */
    const seq = setParamChecked(p1, 'angle', 120), a1 = Math.ceil(seq) + 1;
    expect(seq < a1, `наклон 1 в одиночку упирается в пол: ${seq.toFixed(1)}, берём ${a1}`);
    /* второй наклон подбираем: первый угол, при котором вся рука над полом */
    let a2 = -120;
    for (; a2 <= 0; a2 += 5) { p1.angle = a1; p2.angle = a2; applyParam3D(p1); applyParam3D(p2); if (armMinY() >= -0.005) break; }
    expect(a2 <= 0 && armMinY() >= -0.005, `та же поза целиком — над полом при наклоне 2 = ${a2}`);
    const items = [{ i: 0, type: 'pitch', key: 'angle', from: 0, to: a1 }, { i: 2, type: 'pitch', key: 'angle', from: 0, to: a2 }];
    recordAction({ kind: 'pose', items });
    expect(actList.querySelector('.act-txt').textContent.includes('IK') && actList.querySelector('.act-txt').textContent.includes(String(a1)), 'подпись записи: мишень IK и параметры');
    undoLastAction();
    expect(p1.angle === 0 && p2.angle === 0 && chal.log.length === 0, 'отмена возвращает всю позу');
    recordAction({ kind: 'pose', items });
    startReplay(); ticks(300);
    expect(!chal.replay && components[0].angle === a1 && components[2].angle === a2 && components[0]._sliders.angle.slider.value === String(a1),
           `повтор позы IK: оба параметра дошли до записанных (${components[0].angle}, ${components[2].angle})`);
    expect(armMinY() >= -0.005, 'после повтора рука над полом');
    rollbackLog(1);
    expect(components[0].angle === a1 && components[2].angle === a2, 'откат до записи позы даёт ту же позу');
    /* поза для другой руки: параметры дожимаются с ограничением пола, без исключений */
    components[0].angle = 0; components[2].angle = 0; applyParam3D(components[0]); applyParam3D(components[2]);
    applyPose([{ i: 0, type: 'pitch', key: 'angle', from: 0, to: a1 }, { i: 7, type: 'pitch', key: 'angle', from: 0, to: a2 }], 1, true);
    expect(components[0].angle < a1 && armMinY() >= -0.005, 'поза с несуществующим звеном: остальное применено с полом');
    /* ikRetry после перестройки руки (висящий промах) — та же запись «поза», иначе повтор
       идёт со старой позой и все шаги проходят мимо цели */
    resetTask(); setIK(true);
    const tgt = armTip(new THREE.Vector3()).add(new THREE.Vector3(0, -0.6, 0.6)); // в плоскости наклонов: турели нет
    ikSetMiss(tgt, 1);
    addRow.querySelector('button[data-type="link"]').click(); // buildArm() ставит ikRetry в микрозадачу
    ikRetry(); // то, что она сделает
    const solved = components.map(c => c.angle);
    expect(chal.log.length === 2 && chal.log[0].kind === 'add' && chal.log[1].kind === 'pose' && chal.log[1].items.length > 0 && solved.some(Boolean),
           `ikRetry записан как поза после добавления: ${chal.log.map(a => a.kind).join()}`);
    startReplay(); ticks(400);
    expect(!chal.replay && components.map(c => c.angle).join() === solved.join(), `повтор воспроизводит позу ikRetry: ${components.map(c => c.angle).join()} = ${solved.join()}`);
    setIK(false); stopChallenge();
  }

  /* ---------- запись действий: журнал, отмена, повтор, цикл, камера ---------- */
  if (SCEN === 'replay') {
    startChallenge();
    const yaw = components[0], s = yaw._sliders.angle.slider;
    s.value = 45; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change'));
    addRow.querySelector('button[data-type="roll"]').click();
    const rs = components[components.length - 1]._sliders.angle.slider;
    rs.value = -90; rs.dispatchEvent(new Event('input')); rs.dispatchEvent(new Event('change'));
    compList.querySelectorAll('.del')[2].click();
    document.querySelectorAll('#chalTasks .chal-task')[2].click();
    expect(chal.task === 2 && components[0].angle === 0 && chal.holdables[0]?.kind === 'billet', 'клик по заданию: переход и сброс позы');
    expect(chal.log.map(a => a.kind).join() === 'param,add,param,del,task', 'журнал: ' + chal.log.map(a => a.kind).join());
    undoLastAction(); expect(chal.task === 0, 'отмена перехода');
    undoLastAction(); expect(components.length === 8 && components[2].type === 'link', 'отмена удаления');
    camera.position.set(9, 4, 9); controls.target.set(1, 1, 1);
    chkLoop.checked = true; startReplay();
    expect(!!chal.replay && components[0].angle === 0 && document.body.classList.contains('replaying'), 'повтор начат с исходной руки');
    ticks(60); expect(chal.replay.idx >= 1 && !!actList.querySelector('.act.cur'), 'идёт по записям');
    ticks(400); expect(!!chal.replay, 'цикл: повтор не остановился');
    chkLoop.checked = false; ticks(500);
    expect(!chal.replay && components[0].angle === 45 && components[components.length - 1].angle === -90, 'однократный повтор дошёл до конца');
    expect(f3(camera.position).join() === '9,4,9', 'камера не тронута');
    /* сброс без переходов в записи — к её началу: журнал пуст, рука — исходная (добавленное
       по ходу задания снято), поза нулевая */
    const n0 = chal.startConfig.length; resetTask();
    expect(chal.log.length === 0 && components[0].angle === 0 && components.length === n0 && chal.startConfig.length === n0 && actList.querySelectorAll('.act').length === 0 && !chal.replay, 'сброс: журнал очищен, поза нулевая, рука исходная');
    const s2 = components[0]._sliders.angle.slider; s2.value = 45; s2.dispatchEvent(new Event('input')); s2.dispatchEvent(new Event('change'));
    expect(chal.log.length === 1, 'после сброса запись идёт заново');
    setLang(lang === 'en' ? 'ru' : 'en'); expect(actList.querySelectorAll('.act').length === 1, 'смена языка перерисовала журнал');
    /* сброс после перехода — к записи «перейти к заданию»: шаги внутри задания сняты
       (включая добавленное), состав на момент перехода и выполненное ранее задание сохранены */
    chal.done[0] = true;
    document.querySelectorAll('#chalTasks .chal-task')[1].click();
    const n1 = components.length;
    const s3 = components[0]._sliders.angle.slider; s3.value = 30; s3.dispatchEvent(new Event('input')); s3.dispatchEvent(new Event('change'));
    addRow.querySelector('button[data-type="roll"]').click();
    const s4 = components[components.length - 1]._sliders.angle.slider; s4.value = 20; s4.dispatchEvent(new Event('input')); s4.dispatchEvent(new Event('change'));
    expect(chal.log.map(a => a.kind).join() === 'param,task,param,add,param' && components.length === n1 + 1, 'шаги внутри задания 2: ' + chal.log.map(a => a.kind).join());
    resetTask();
    expect(chal.log.map(a => a.kind).join() === 'param,task' && chal.task === 1 && components.length === n1 && components.every(c => !c.angle)
           && chal.done[0] && !chal.done[1] && actList.querySelectorAll('.act').length === 2 && chal.t2, 'сброс после перехода: откат к «перейти к заданию 2», состав и ✅ задания 1 сохранены');
    /* остановленный на середине повтор: сброс всё равно собирает руку из записи, а не откатывает хвост */
    const s5 = components[0]._sliders.angle.slider; s5.value = 40; s5.dispatchEvent(new Event('input')); s5.dispatchEvent(new Event('change'));
    addRow.querySelector('button[data-type="link"]').click();
    startReplay(); ticks(3); stopReplay();
    expect(chal.log.length === 4 && chal.task === 0, 'повтор остановлен в начале: журнал цел, задание 1');
    gotoTask(1); resetTask();
    expect(chal.log.map(a => a.kind).join() === 'param,task,param,add,task' && components.length === n1 + 1 && components.every(c => !c.angle), 'сброс после прерванного повтора: состав собран из записи');
    chal.log = []; chal.done = [false, false, false]; replayReset();
    /* ✕ с чистого листа закрывает молча, с прогрессом — переспрашивает */
    const close = document.getElementById('chalClose');
    chal.log = []; chal.done = [false, false, false];
    close.click(); expect(chal === null && tutModal.hidden, '✕ без прогресса закрывает сразу');
    startChallenge(); chal.done[0] = true;
    close.click(); expect(!!chal && !tutModal.hidden, '✕ с прогрессом переспрашивает, режим не выключен');
    tutActions.querySelector('button').click();
    expect(!!chal && tutModal.hidden, '«Продолжить» оставляет в режиме');
    close.click(); tutActions.querySelectorAll('button')[1].click();
    expect(chal === null && tutModal.hidden, '«Всё равно выйти» выключает режим');
    startChallenge();
    stopChallenge(); expect(chal === null && !document.body.className, 'режим выключен');
    /* «Случайная рука» и «Новый проект» выходят из режима: подменить руку посреди
       задания нельзя, её можно только достраивать по шагам */
    startChallenge(); setTask(1); document.getElementById('btnGenerate').click();
    expect(chal === null && !document.body.classList.contains('challenge') && chalPanel.hidden && chalRoot.children.length === 0,
           'генерация вышла из режима заданий и убрала объекты');
    startChallenge(); setTask(2);
    document.getElementById('btnNew').click();
    expect(chal === null && !document.body.classList.contains('challenge') && chalRoot.children.length === 0 && components.length === 0,
           'новый проект вышел из режима заданий');
  }

  /* ---------- пол: слайдер, анимация, вне режима заданий ---------- */
  if (SCEN === 'floor') {
    startChallenge(); setArm(GRIP_ARM);
    const pitch = components[1], s = pitch._sliders.angle.slider;
    const v = setParamChecked(pitch, 'angle', 120);
    expect(v < 110 && armMinY() >= -0.005, `наклон 120° остановлен у пола на ${v.toFixed(1)}°`);
    s.value = -120; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change'));
    expect(+s.value > -110 && armMinY() >= -0.005 && chal.log.length === 1, 'слайдер: значение зажато, запись одна');
    stopChallenge();
    setArm([{ type: 'yaw', angle: 0 }, { type: 'pitch', angle: 95 }, { type: 'link', length: 1.5 }, { type: 'prismatic', length: 0.6, ext: 0.3 }, { type: 'drill', speed: 10 }]);
    chkAnimate.checked = true; let minSeen = 1, maxExt = 0, minPitch = 999;
    for (let k = 0; k < 400; k++) { animateArm(1000 + k * 16); minSeen = Math.min(minSeen, armMinY()); maxExt = Math.max(maxExt, components[3].ext); minPitch = Math.min(minPitch, components[1].angle); }
    chkAnimate.checked = false; chkAnimate.onchange();
    expect(minSeen >= -0.005 && minPitch < 60, `анимация у пола разворачивается (minY ${minSeen.toFixed(3)}, наклон до ${minPitch.toFixed(0)}°)`);
    expect(components[2].length === 1.5 && components[3].length === 0.6 && maxExt <= 0.6, 'анимация не трогает длины, выдвижение ≤ длины');
    expect(setParamChecked(components[1], 'angle', 120) < 115 && armMinY() >= -0.005, 'ограничение пола действует вне режима заданий');
  }

  /* ---------- рука толкает свободные предметы, стенки загона не переезжаются ---------- */
  if (SCEN === 'push') {
    startChallenge(); setArm(GRIP_ARM);
    const J = joints([0, 1, 3, 5]), grip = components[6], gp = () => pivots[6], cube = chal.t1.cube;
    grip.open = 0; applyParam3D(grip);
    const S = CHAL.cube, R = Math.hypot(S.pos[0], S.pos[1]), ang = Math.atan2(S.pos[0], S.pos[1]) + 12 * Math.PI / 180;
    const tgt = new THREE.Vector3(Math.sin(ang) * R, 0.5, Math.cos(ang) * R), down = new THREE.Vector3(0, -1, 0);
    const axis = () => gp().localToWorld(new THREE.Vector3(0, 1, 0)).sub(gp().getWorldPosition(new THREE.Vector3())).normalize();
    solve(() => gp().getWorldPosition(new THREE.Vector3()).distanceTo(tgt) + 0.2 * axis().distanceTo(down), J); ticks(3);
    const p0 = cube.position.clone();
    for (let k = 0; k < 24; k++) { components[0].angle -= 1; applyParam3D(components[0]); ticks(2); }
    expect(!held() && cube.position.distanceTo(p0) > 0.3, `закрытый схват сдвинул кубик на ${cube.position.distanceTo(p0).toFixed(2)}`);
    cube.position.set(CHAL.pen.pos[0] + CHAL.pen.half + CHAL.pen.wall + 0.16, 0.12, CHAL.pen.pos[1]); cube.rotation.set(0, 0, 0); ticks(2);
    const fromRight = new THREE.Vector3(cube.position.x + 0.3, 0.5, cube.position.z);
    solve(() => gp().getWorldPosition(new THREE.Vector3()).distanceTo(fromRight) + 0.2 * axis().distanceTo(down), J, 12); ticks(2);
    for (let k = 0; k < 30; k++) { const tt = fromRight.clone(); tt.x -= 0.02 * (k + 1); solve(() => gp().getWorldPosition(new THREE.Vector3()).distanceTo(tt) + 0.2 * axis().distanceTo(down), J, 3); ticks(2); }
    expect(!cubeInPen(cubeFootprint(cube)) && penRest(cubeFootprint(cube)) === 0, 'в загон сквозь стенку понизу не протолкнуть');
  }

  /* ---------- сборка: кодек v3, блокировка длин, зависимые границы ---------- */
  if (SCEN === 'build') {
    expect(checkCodeSpec(), 'CODE_SPEC совпадает с TYPES');
    expect(checkGeomSpec(), 'GEOM согласован (см. консоль при провале)');
    setArm([{ type: 'yaw', angle: 10 }, { type: 'prismatic', length: 1.0, ext: 0.6 }, { type: 'gripper', open: 50 }]);
    const code = encodeArmCode();
    expect(code[0] === '3' && JSON.stringify(decodeArmCode(code)) === JSON.stringify(cleanConfig()), 'полный код v3 туда-обратно: ' + code);
    setArm([{ type: 'yaw', angle: 10 }, { type: 'link', length: 1 }]);
    expect(encodeArmCode()[0] === '1', 'без телескопа и новых типов — v1');
    const l1 = '10190508314'; const d1 = validateConfig(decodeArmCode(l1 + dammDigit(l1)));
    expect(d1[1].ext === 0.4 && d1[1].length === 0.7, 'старый код v1 с телескопом: ext 0.4, длина по умолчанию');
    const l2 = '2011900524' + '10050'; const d2 = validateConfig(decodeArmCode(l2 + dammDigit(l2)));
    expect(d2[1].ext === 0.7 && d2[2].type === 'drill', 'старый код v2: выдвижение зажато до длины');
    expect(validateConfig([{ type: 'prismatic', length: 0.5, ext: 1.5 }])[0].ext === 0.5, 'validateConfig: ext ≤ length');
    setArm([{ type: 'yaw', angle: 0 }, { type: 'link', length: 1 }, { type: 'prismatic', length: 0.8, ext: 0.3 }]);
    const rows = [...compList.querySelectorAll('.ctrl')];
    expect(rows[1].querySelector('input').disabled && !rows[2].querySelector('input').disabled && rows[3].querySelector('input').max === '0.8', 'длина не последнего заблокирована, у последнего свободна, max выдвижения = длина');
    const pr = components[2], ls = pr._sliders.length.slider;
    ls.value = 0.4; ls.dispatchEvent(new Event('input'));
    expect(pr.ext === 0.3 && pr._sliders.ext.slider.max === '0.4', 'после смены длины диапазон выдвижения подтянут');
    addRow.querySelector('button[data-type="roll"]').click();
    expect(components[2]._sliders.length.slider.disabled && !components[2]._sliders.ext.slider.disabled, 'добавили следующий компонент — длина телескопа заблокирована, выдвижение свободно');
  }

  /* ---------- структурный код с габаритами ---------- */
  if (SCEN === 'struct') {
    setArm([{ type: 'yaw', angle: 40 }, { type: 'pitch', angle: 30 }, { type: 'link', length: 1.55 }, { type: 'offset', length: 0.35 }, { type: 'prismatic', length: 0.8, ext: 0.2 }, { type: 'gripper', open: 10 }]);
    let s = encodeStructCode(); const d = validateConfig(decodeStructCode(s));
    expect(s[0] === '4' && d[2].length === 1.55 && d[3].length === 0.35 && d[4].length === 0.8 && d[0].angle === 0 && d[4].ext === 0.4, 'v4: размеры сохранены, позы по умолчанию: ' + groupCode(s));
    expect(decodeArmCode(s) === null, 'полный декодер структурный код отвергает');
    setArm([{ type: 'link', length: 2.2 }, { type: 'drill', speed: 50 }]);
    s = encodeStructCode(); expect(s[0] === '5' && decodeStructCode(s)[0].length === 2.2, 'v5 с двузначными типами');
    const l1 = '10131240'; expect(decodeStructCode(l1 + dammDigit(l1)).length === 7, 'старый структурный код v1 читается');
    expect(decodeStructCode('431' + dammDigit('431')) === null, 'оборванный код — null');
    setArm([]); expect(decodeStructCode(encodeStructCode()).length === 0, 'пустая рука');
  }

  /* ---------- ссылки: язык/тема, короткая по клику ---------- */
  if (SCEN === 'share') {
    expect(!/lang=|theme=/.test(shareURL()), 'без явного выбора языка и темы хвоста нет');
    expect(shareURL().includes('?c=') && structShareURL().includes('?s='), 'полная — ?c=, короткая — ?s=');
    if (location.protocol === 'file:') expect(SHARE_BASE === SHARE_FALLBACK, 'file:// → запасной публичный адрес');
    else expect(SHARE_BASE === location.origin + location.pathname.replace(/index\.html?$/i, '') && shareURL().startsWith(location.origin), 'http(s): ссылки ведут на адрес страницы ' + SHARE_BASE);
    const n0 = components.length; startChallenge();
    expect(components.length === n0 && components.filter(c => 'angle' in c).every(c => c.angle === 0), 'режим заданий берёт текущую руку, только сбрасывает позу');
    /* сворачивание окна задания в кнопку */
    expect(!chalPanel.hidden && btnChal.textContent === '🏆 1/3', 'окно открыто, на кнопке прогресс');
    btnChal.click(); expect(chalPanel.hidden && !!chal && btnChal.classList.contains('collapsed'), 'клик по кнопке сворачивает окно, режим не выключается');
    btnChal.click(); expect(!chalPanel.hidden, 'повторный клик разворачивает');
    btnChal.click(); completeTask(); expect(!chalPanel.hidden && btnChal.textContent === '🏆 1/3 ✓', 'выполнение задания разворачивает окно, на кнопке галочка');
    document.getElementById('chalClose').click(); // задание выполнено — ✕ переспрашивает
    tutActions.querySelectorAll('button')[1].click();
    expect(chal === null && btnChal.textContent === t('chalBtn'), '✕ с подтверждением выходит из режима, кнопка обычная');
    startChallenge(); stopChallenge();
    setLang(lang === 'en' ? 'ru' : 'en'); setTheme(theme === 'dark' ? 'light' : 'dark');
    expect(new RegExp(`lang=${lang}&theme=${theme}$`).test(shareURL()) && structShareURL().includes(`lang=${lang}`), 'после переключения язык и тема в обеих ссылках');
  }

  /* ---------- связность чушки: любой рез, делящий на равные части ---------- */
  if (SCEN === 'split') {
    startChallenge(); setTask(2);
    const T = chal.t3;
    const kill = (T, pred) => { for (let i = 0; i < T.alive.length; i++) if (T.alive[i] && pred(i)) { T.alive[i] = 0; T.sliceCount[T.slice[i]]--; } };
    expect(!billetSplit(T).split, 'целая — не разделена');
    kill(T, i => T.slice[i] === 30); expect(billetSplit(T).ratio < 0.6, 'рез в 3/4 длины — части неравные');
    kill(T, i => T.slice[i] === 20); expect(billetSplit(T).ratio >= 0.6, 'плюс рез посередине — засчитано');
    setTask(2); const T2 = chal.t3;
    kill(T2, i => Math.abs(T2.pos[3 * i + 2] - 0.4 * T2.pos[3 * i + 1]) < 0.03);
    expect(chal.t3.alive === T2.alive && billetSplit(T2).split && billetSplit(T2).ratio > 0.9, 'наклонный рез через центр — равные половины');
  }

  /* ---------- скриншот стартового вида режима заданий (для --shot) ---------- */
  if (SCEN === 'shot') {
    startChallenge(); selectTab('actarea');
    expect(chal.task === 0 && document.querySelector('#tabs button.active').dataset.tab === 'actarea', 'режим включён, вкладка «Запись»');
  }
  /* ---------- дамп URDF дрели: для ручного diff при правке геометрии ---------- */
  if (SCEN === 'urdf') {
    setArm([{ type: 'yaw', angle: 30 }, { type: 'pitch', angle: 70 }, { type: 'link', length: 1.5 }, { type: 'roll', angle: 45 }, { type: 'drill', speed: 50 }]);
    log(buildURDF());
    setArm([{ type: 'rail', pos: 0.5 }, { type: 'spherical', pitch: 20, yaw: 30 }, { type: 'link', length: 0.7 }, { type: 'offset', length: 0.6 }, { type: 'prismatic', length: 0.9, ext: 0.3 }, { type: 'suction', power: 40 }]);
    log(buildURDF());
    setArm([{ type: 'gripper', open: 60 }, { type: 'mill', speed: 10 }]);
    log(buildURDF());
  }
  /* ---------- отладочный API страницы (?debug=1) ---------- */
  if (SCEN === 'debug') {
    const api = window.roboArm;
    expect(!!api, 'window.roboArm есть под ?debug=1');
    const cfg = api.setArm([{ type: 'yaw', angle: 10 }, { type: 'pitch', angle: 20 }, { type: 'link', length: 2.5 }, { type: 'gripper', open: 30 }]);
    expect(cfg.length === 4 && api.components.length === 4, 'setArm вернул конфигурацию');
    expect(api.setParam(1, 'angle', 120) < 115 && api.minY() >= -0.005, 'setParam с ограничением пола');
    const st = api.state();
    expect(st.version === VERSION && st.tip.length === 3 && st.challenge === null, 'state(): версия, tip, режим');
    api.challenge.start(); api.tick(1000); api.tick(1016);
    expect(api.state().challenge?.task === 0 && api.challenge.data.holdables.length === 1, 'challenge.start + tick');
    api.challenge.stop();
    expect(api.share.decode(api.share.encode(cfg)).length === 4 && api.share.short().includes('?s='), 'share.encode/decode/short');
  }
  /* ---------- обратная кинематика: солвер и перетаскивание мишени ---------- */
  if (SCEN === 'ik') await (async () => {
    setArm([{ type: 'yaw', angle: 0 }, { type: 'pitch', angle: 0 }, { type: 'link', length: 1.0 }, { type: 'pitch', angle: 0 }, { type: 'link', length: 0.8 }, { type: 'roll', angle: 0 }, { type: 'gripper', open: 50 }]);
    const tgt = new THREE.Vector3(1.4, 1.6, 1.2); // в пределах ±120° наклона
    const res = ikSolve(tgt);
    expect(res < 0.02, `солвер довёл конец руки до цели (остаток ${res.toFixed(3)})`);
    expect(armMinY() >= -0.006 && components[6].open === 50 && components[2].length === 1, 'пол не нарушен, схват и длины не тронуты');
    const far = ikSolve(new THREE.Vector3(5, 0.5, 5));
    expect(far > 1 && armMinY() >= -0.006, 'недостижимая цель — максимально близко, над полом');
    const low = ikSolve(new THREE.Vector3(1.2, -0.3, 0.5));
    expect(armMinY() >= -0.006, `цель под полом — рука остаётся над полом (остаток ${low.toFixed(2)})`);
    /* перетаскивание мышью: мишень → экран → pointer-события */
    startChallenge();
    setIK(true);
    const cv = renderer.domElement, r = cv.getBoundingClientRect();
    const toClient = p => { const v = p.clone().project(camera); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; };
    renderer.render(scene, camera);
    const start = toClient(ikGizmo.position), before = cleanConfig();
    const ev = (type, x, y, pointerType) => cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType, bubbles: true }));
    ev('pointerdown', start.x, start.y);
    expect(!!ikDrag && !controls.enabled, 'нажатие на мишень начало перетаскивание');
    for (let k = 1; k <= 10; k++) ev('pointermove', start.x - 12 * k, start.y + 6 * k);
    ev('pointerup', start.x - 120, start.y + 60);
    const after = cleanConfig();
    expect(!ikDrag && controls.enabled && JSON.stringify(before) !== JSON.stringify(after), 'после отпускания камера свободна, поза изменилась');
    expect(chal.log.length === 1 && chal.log[0].kind === 'pose' && chal.log[0].items.length > 0, `перетаскивание — одна запись «поза» с параметрами: ${chal.log[0]?.items?.length}`);
    ev('pointerdown', 5, 5); expect(!ikDrag, 'нажатие мимо мишени ничего не начинает');
    /* тач: пальцем в маленький шарик не попасть — рядом с ним касание всё равно берёт мишень */
    renderer.render(scene, camera);
    const near = toClient(ikGizmo.position), miss = { x: near.x + 20, y: near.y };
    ev('pointerdown', miss.x, miss.y, 'mouse');
    expect(!ikDrag, 'мышью мимо меша мишени — промах (иначе проверка ниже ничего не значит)');
    ev('pointerdown', miss.x, miss.y, 'touch');
    expect(!!ikDrag, 'пальцем на том же месте мишень взята');
    ev('pointerup', miss.x, miss.y, 'touch');
    stopChallenge();
    /* недостижимая цель: мишень краснеет и остаётся, подсказка с расстоянием; перестройка руки принимает цель */
    setArm([{ type: 'yaw', angle: 0 }, { type: 'pitch', angle: 0 }, { type: 'link', length: 0.5 }, { type: 'gripper', open: 50 }]);
    renderer.render(scene, camera);
    const s0 = toClient(ikGizmo.position);
    ev('pointerdown', s0.x, s0.y); ev('pointermove', s0.x - 200, s0.y + 300); ev('pointerup', s0.x - 200, s0.y + 300);
    expect(!!ikMiss && ikGizmo.material.color.getHex() === IK_COLOR.miss && !ikHint.hidden && ikLine.visible, 'промах: мишень красная, пунктир и подсказка');
    const missPos = ikGizmo.position.clone(), gap0 = armTip().distanceTo(missPos);
    expect(gap0 > IK_TOL && ikHint.textContent.includes(gap0.toFixed(2)), `подсказка называет недостающее расстояние ${gap0.toFixed(2)}`);
    ticks; renderer.render(scene, camera);
    expect(ikGizmo.position.distanceTo(missPos) < 1e-6, 'мишень осталась на месте, не прыгнула к руке');
    addRow.querySelector('button[data-type="link"]').click(); // перестроили руку: длиннее
    components[components.length - 1]._sliders.length.slider.value = 3;
    components[components.length - 1]._sliders.length.slider.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 0));
    const gap1 = armTip().distanceTo(missPos);
    expect(gap1 < gap0, `после перестройки цель проверена заново: было ${gap0.toFixed(2)}, стало ${gap1.toFixed(2)}`);
    expect((gap1 <= IK_TOL) === (ikMiss === null), gap1 <= IK_TOL ? 'цель достигнута — промах снят' : 'всё ещё не достаёт — промах остаётся');
    setIK(false); expect(ikHint.hidden && !ikLine.visible, 'выключение IK убирает подсказку');
  })();
} catch (e) { log('EXCEPTION', e.message, e.stack); }
flush(); })();
