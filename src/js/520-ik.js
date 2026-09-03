'use strict';
/* ================= Обратная кинематика: мишень на конце руки ================= */

/* Кнопка «🎯 IK» показывает мишень в точке armTip(); её тянут мышью/пальцем в
   плоскости экрана, а ikSolve() координатным спуском подбирает все позные
   параметры (углы, выдвижение, каретку — не габариты и не инструменты), чтобы
   конец руки пришёл к цели: штраф за пол, лёгкая регуляризация к исходной позе,
   чтобы суставы не перекидывались. В журнал заданий изменения пишутся по
   окончании перетаскивания — по одной записи на параметр. */
const IK_SKIP = new Set(['open', 'power', 'speed']); // инструмент целью не управляет
const btnIK = document.getElementById('btnIK');
let ikOn = false;
const ikGizmo = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.65, depthTest: false }));
ikGizmo.renderOrder = 10;
ikGizmo.visible = false;
scene.add(ikGizmo);
const ikRay = new THREE.Raycaster(), ikNDC = new THREE.Vector2(), ikPlane = new THREE.Plane();
const _ikTip = new THREE.Vector3(), _ikTarget = new THREE.Vector3(), _ikDir = new THREE.Vector3();
const _ikScr = new THREE.Vector3();
/* Тач: пальцем в шарик радиусом 0.09 не попасть — на грубом указателе мишень крупнее,
   а попадание засчитывается и мимо меша, в пределах IK_GRAB_PX пикселей от его центра. */
const IK_GRAB_PX = { mouse: 8, pen: 16, touch: 26 };
const ikCoarse = !!window.matchMedia?.('(pointer: coarse)').matches;
if (ikCoarse) ikGizmo.scale.setScalar(1.7);
let ikDrag = null; // { start: [{c, p, i, v0}] } во время перетаскивания
/* Недостижимая цель: мишень краснеет и остаётся там, куда её поставили, пунктир
   тянется от конца руки, подсказка называет недостающее расстояние. Рука может
   оказаться непригодной — тогда пользователь перестраивает её; buildArm() зовёт
   ikRetry(), и цель принимается, как только становится достижимой. */
const IK_TOL = 0.03;
const IK_COLOR = { ok: 0x4da3ff, miss: 0xff5c5c };
let ikMiss = null; // { target: Vector3 }
const ikHint = document.getElementById('ikHint');
const ikLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineDashedMaterial({ color: IK_COLOR.miss, dashSize: 0.06, gapSize: 0.05, depthTest: false }));
ikLine.renderOrder = 9;
ikLine.visible = false;
scene.add(ikLine);

function ikSetMiss(target, residual) {
  ikMiss = { target: target.clone() };
  ikGizmo.material.color.setHex(IK_COLOR.miss);
  ikGizmo.position.copy(target);
  ikLine.visible = true;
  ikHint.innerHTML = `<span class="tut-exit" title="${t('ikMissTip')}">✕</span>${t('ikMiss', residual.toFixed(2))}`;
  ikHint.querySelector('.tut-exit').onclick = ikClearMiss;
  ikHint.hidden = false;
  invalidate();
}
function ikClearMiss() {
  ikMiss = null;
  ikGizmo.material.color.setHex(IK_COLOR.ok);
  ikLine.visible = false;
  ikHint.hidden = true;
  invalidate();
}
/* после перестройки руки — попробовать цель снова. Найденная поза — такое же изменение
   руки, как перетаскивание мишени: без записи в журнал повтор шёл бы со старой позой
   (кронштейн вверх, а не к стене) и все дальнейшие шаги проходили бы мимо цели. */
function ikRetry() {
  if (!ikMiss || !ikOn) return;
  const target = ikMiss.target;
  const start = ikParams().map(x => ({ ...x, v0: x.c[x.p.key] ?? x.p.def }));
  ikSolve(target);
  ikCommit(start);
  const res = armTip(_ikTip).distanceTo(target);
  if (res <= IK_TOL) ikClearMiss(); else ikSetMiss(target, res);
}
/* Итог решения IK: параметры доводятся до шага слайдера (с ограничением пола), слайдеры
   синхронизируются, изменение позы пишется в журнал заданий одной записью «поза» —
   параметры менялись вместе, и повторять их надо вместе (см. applyPose). start — [{c, p, i, v0}]. */
function ikCommit(start) {
  const items = [];
  for (const x of start) {
    const v = quantParam(x.c[x.p.key], x.p);
    if (v !== x.c[x.p.key]) applyParamChecked(x.c, x.p.key, v);
    syncSlider(x.c, x.p.key);
    if (x.c[x.p.key] !== x.v0) items.push({ i: x.i, type: x.c.type, key: x.p.key, from: x.v0, to: x.c[x.p.key] });
  }
  if (items.length) recordAction({ kind: 'pose', items });
  updateJSONView();
  updateURDFView();
}
/* пунктир от конца руки к цели — обновляется в кадре */
function ikUpdateLine() {
  const pos = ikLine.geometry.attributes.position;
  armTip(_ikTip);
  pos.setXYZ(0, _ikTip.x, _ikTip.y, _ikTip.z);
  pos.setXYZ(1, ikGizmo.position.x, ikGizmo.position.y, ikGizmo.position.z);
  pos.needsUpdate = true;
  ikLine.computeLineDistances();
}

function ikParams() {
  const out = [];
  components.forEach((c, i) => {
    for (const p of TYPES[c.type].params) if (!p.build && !IK_SKIP.has(p.key)) out.push({ c, p, i });
  });
  return out;
}

/* подгоняет позу под цель; возвращает остаточное расстояние */
function ikSolve(target) {
  const P = ikParams();
  if (!P.length) return Infinity;
  const v0 = P.map(x => x.c[x.p.key] ?? x.p.def);
  const evalF = () => {
    for (const x of P) applyParam3D(x.c);
    armRoot.updateWorldMatrix(true, true);
    const d = armTip(_ikTip).distanceToSquared(target);
    /* пол — жёсткое ограничение: из допустимой позы шаг под пол не принимается,
       из недопустимой (так уже стояли) — принимаются шаги, уменьшающие глубину */
    const under = Math.max(0, -0.005 - armMinY());
    let reg = 0;
    P.forEach((x, k) => { const r = (x.c[x.p.key] - v0[k]) / (paramMax(x.c, x.p) - x.p.min); reg += r * r; });
    return d + 0.002 * reg + (under > 0 ? 1000 + under : 0);
  };
  let f = evalF(), evals = 0;
  for (let scale = 0.05; scale > 0.0005; scale *= 0.5) {
    let improved = true;
    while (improved && evals < 6000) {
      improved = false;
      for (const x of P) {
        const max = paramMax(x.c, x.p), step = (max - x.p.min) * scale;
        for (const d of [-1, 1]) {
          const old = x.c[x.p.key];
          x.c[x.p.key] = Math.min(max, Math.max(x.p.min, old + d * step));
          const f2 = evalF();
          evals++;
          if (f2 < f - 1e-9) { f = f2; improved = true; } else x.c[x.p.key] = old;
        }
      }
    }
  }
  evalF();
  for (const x of P) syncSlider(x.c, x.p.key);
  invalidate();
  return armTip(_ikTip).distanceTo(target);
}

function setIK(on) {
  ikOn = on;
  btnIK.classList.toggle('on', on);
  ikGizmo.visible = on;
  if (on) armTip(ikGizmo.position); else ikClearMiss();
  invalidate();
}
btnIK.onclick = () => setIK(!ikOn);

function ikPointerNDC(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ikNDC.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
  ikRay.setFromCamera(ikNDC, camera);
}
function ikHit(e) {
  if (!ikOn) return false;
  ikPointerNDC(e);
  if (ikRay.intersectObject(ikGizmo).length) return true;
  const r = renderer.domElement.getBoundingClientRect();
  const p = _ikScr.copy(ikGizmo.position).project(camera);
  if (p.z > 1) return false; // мишень за камерой
  const dx = e.clientX - (r.left + (p.x + 1) / 2 * r.width);
  const dy = e.clientY - (r.top + (1 - p.y) / 2 * r.height);
  return Math.hypot(dx, dy) <= (IK_GRAB_PX[e.pointerType] ?? IK_GRAB_PX.touch);
}

renderer.domElement.addEventListener('pointerdown', e => {
  if (!ikOn || chal?.replay || !ikHit(e)) return;
  e.preventDefault();
  controls.enabled = false;
  renderer.domElement.setPointerCapture(e.pointerId);
  /* плоскость перетаскивания — параллельна экрану, через мишень */
  camera.getWorldDirection(_ikDir);
  ikPlane.setFromNormalAndCoplanarPoint(_ikDir, ikGizmo.position);
  ikDrag = { start: ikParams().map(x => ({ ...x, v0: x.c[x.p.key] ?? x.p.def })) };
  ikHint.hidden = true; // промах переоценим по отпусканию
  renderer.domElement.style.cursor = 'grabbing';
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!ikOn) return;
  if (!ikDrag) { renderer.domElement.style.cursor = ikHit(e) ? 'grab' : ''; return; }
  ikPointerNDC(e);
  if (!ikRay.ray.intersectPlane(ikPlane, _ikTarget)) return;
  ikGizmo.position.copy(_ikTarget); // мишень там, куда тянут; рука догоняет, насколько может
  const res = ikSolve(_ikTarget);
  ikGizmo.material.color.setHex(res > IK_TOL ? IK_COLOR.miss : IK_COLOR.ok);
  ikLine.visible = res > IK_TOL;
  updateJSONView();
});
function ikDragEnd(e) {
  if (!ikDrag) return;
  const d = ikDrag;
  ikDrag = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = '';
  try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* уже отпущен */ }
  ikCommit(d.start);
  /* достали или нет: промах остаётся на экране, пока руку не перестроят */
  const res = armTip(_ikTip).distanceTo(ikGizmo.position);
  if (res > IK_TOL) ikSetMiss(ikGizmo.position, res); else ikClearMiss();
}
renderer.domElement.addEventListener('pointerup', ikDragEnd);
renderer.domElement.addEventListener('pointercancel', ikDragEnd);
