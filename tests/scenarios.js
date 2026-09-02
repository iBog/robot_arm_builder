/* ---- Сценарии для tests/run.mjs. Код вставляется в модуль index.html после старта
   (buildArm(); renderPanel();) и видит все внутренние функции и состояние.
   log() пишет строки в элемент pre#testlog, expect() — строку PASS/FAIL. ---- */
const SCEN = '__SCEN__';
const GOLDEN = '__GOLDEN__';
const LOG = [];
window.addEventListener('error', e => { LOG.push('ERR ' + e.message + ' @' + e.lineno); flush(); });
function flush() {
  let pre = document.getElementById('testlog');
  if (!pre) { pre = document.createElement('pre'); pre.id = 'testlog'; document.body.appendChild(pre); }
  pre.textContent = LOG.join(String.fromCharCode(10));
}
setTimeout(() => { LOG.push('frames rendered ' + renderer.info.render.frame); flush(); }, 4000);
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

try {
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
    const stray = new THREE.Vector3(CHAL.wall.x - 0.03, 0.65, 0);
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
    chkFit.checked = false; camera.position.set(-0.5, 1.15, 1.0); controls.target.set(-1.85, 0.65, 0);
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
    pushObjects = function () {}; // капсулы руки проверяет сценарий push; здесь — только логика диска
    const poseAt = off => solve(() => ctr().distanceTo(grp.position.clone().add(off)) + 1.5 * (1 - Math.abs(axis().z)), J);
    const sweepTo = (off, n) => sweepLine(J, ctr, ctr(), grp.position.clone().add(off), () => 1.5 * (1 - Math.abs(axis().z)), n);
    poseAt(new THREE.Vector3(0, 0.05, -0.55)); mill.speed = 50; ticks(2);
    const a0 = alive(); sweepTo(new THREE.Vector3(0, 0.05, -0.2), 30);
    expect(a0 - alive() < 60, `боковой подход вдоль оси почти не режет (снято ${a0 - alive()} из ${total})`);
    mill.speed = 0; poseAt(new THREE.Vector3(0, 0.45, 0.25)); ticks(2); mill.speed = 50;
    sweepTo(new THREE.Vector3(0, 0.11, 0.25), 40);
    expect(chal.t3.offCut && !chal.done[2], 'пропил не посередине разделил чушку, но не засчитан');
    resetTask(); grp = chal.t3.group;
    mill.speed = 0; poseAt(new THREE.Vector3(0, 0.45, 0)); ticks(2);
    const a1 = alive(); sweepTo(new THREE.Vector3(0, 0.2, 0), 25);
    expect(a1 === alive(), 'без оборотов диск не режет');
    poseAt(new THREE.Vector3(0, 0.45, 0)); ticks(2); mill.speed = 50;
    sweepTo(new THREE.Vector3(0, 0.06, 0), 40);
    sweepTo(new THREE.Vector3(0.16, 0.06, 0), 20); sweepTo(new THREE.Vector3(-0.16, 0.06, 0), 30);
    expect(chal.done[2], 'погружение и протяжка посередине — чушка распилена пополам');
    chkFit.checked = false; camera.position.set(1.1, 1.1, 3.0); controls.target.set(-0.2, 0.2, 1.5);
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
    setLang(lang === 'en' ? 'ru' : 'en'); expect(actList.querySelectorAll('.act').length === 3, 'смена языка перерисовала журнал');
    stopChallenge(); expect(chal === null && !document.body.className, 'режим выключен');
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
    const n0 = components.length; startChallenge();
    expect(components.length === n0 && components.filter(c => 'angle' in c).every(c => c.angle === 0), 'режим заданий берёт текущую руку, только сбрасывает позу');
    stopChallenge();
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
} catch (e) { log('EXCEPTION', e.message, e.stack); }
flush();
