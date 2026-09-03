'use strict';
/* ---- Столкновения: рука жёсткая, свободные предметы она сдвигает ---- */

const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();

/* ближайшие точки двух отрезков p1q1 и p2q2 → c1, c2 (Ericson, Real-Time Collision Detection) */
function segSegClosest(p1, q1, p2, q2, c1, c2) {
  const d1 = _s1.subVectors(q1, p1), d2 = _s2.subVectors(q2, p2), r = _cv.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), clamp = THREE.MathUtils.clamp;
  let s = 0, t = 0;
  if (a > 1e-12 || e > 1e-12) {
    if (a <= 1e-12) t = clamp(f / e, 0, 1);
    else {
      const c = d1.dot(r);
      if (e <= 1e-12) s = clamp(-c / a, 0, 1);
      else {
        const b = d1.dot(d2), denom = a * e - b * b;
        s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
        else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
      }
    }
  }
  c1.copy(p1).addScaledVector(d1, s);
  c2.copy(p2).addScaledVector(d2, t);
}

/* капсулы (отрезок + радиус) всех деталей руки в мире, по параметрам их геометрий;
   skip — группы, чьи детали не учитываются (пальцы схвата вокруг предмета, диск фрезы).
   Считаются один раз за кадр (ключ — время тика), каждая помнит своих предков,
   чтобы фильтр по skip обходился без пересчёта; buildArm() сбрасывает кеш. */
let capsFrame = null, capsCache = [];
function armCapsules(skip) {
  const key = chal ? chal.lastNow : null;
  if (key === null || key !== capsFrame) { capsCache = buildCapsules(); capsFrame = key; }
  return skip.size ? capsCache.filter(c => !c.anc.some(a => skip.has(a))) : capsCache;
}
function buildCapsules() {
  const caps = [];
  armRoot.traverseVisible(o => {
    if (!o.isMesh || o.userData.decorative || !o.geometry?.parameters) return;
    const anc = [];
    for (let p = o.parent; p && p !== armRoot; p = p.parent) anc.push(p);
    const g = o.geometry, p = g.parameters;
    let ax = 1, half = 0, r;
    if (g.type === 'CylinderGeometry' || g.type === 'ConeGeometry') {
      r = Math.max(p.radiusTop ?? p.radius ?? 0, p.radiusBottom ?? p.radius ?? 0);
      half = Math.max(0, p.height / 2 - r); // капсула не длиннее цилиндра
    } else if (g.type === 'BoxGeometry') {
      const d = [p.width, p.height, p.depth];
      ax = d.indexOf(Math.max(...d));
      r = Math.max(...d.filter((_, i) => i !== ax)) / 2;
      half = Math.max(0, d[ax] / 2 - r);
    } else if (g.type === 'SphereGeometry') r = p.radius;
    else return;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    a.setComponent(ax, -half); b.setComponent(ax, half);
    o.localToWorld(a); o.localToWorld(b);
    /* радиус масштабируется поперечными осями (звено растянуто только вдоль оси) */
    const el = o.matrixWorld.elements, sc = [Math.hypot(el[0], el[1], el[2]), Math.hypot(el[4], el[5], el[6]), Math.hypot(el[8], el[9], el[10])];
    caps.push({ a, b, r: r * Math.max(...sc.filter((_, i) => i !== ax)), anc });
  });
  return caps;
}

/* отрезок-ось и радиус предмета для столкновений */
function objSegment(h) {
  if (h.kind === 'cube') return { a: h.obj.position.clone(), b: h.obj.position.clone(), r: CHAL.cube.size * 0.58 };
  const B = CHAL.billet, a = new THREE.Vector3(0, 0, 1).applyQuaternion(h.obj.quaternion).multiplyScalar(B.len / 2);
  return { a: h.obj.position.clone().sub(a), b: h.obj.position.clone().add(a), r: B.r };
}

/* Результат выполненного задания замирает: распиленная чушка остаётся на экране такой,
   какой её оставил пропил, — до «Сбросить» или перехода к другому заданию. */
function taskFrozen(h) { return h.kind === 'billet' && chal.done[2]; }

/* свободные предметы выталкиваются из деталей руки по горизонтали (пол и стенки загона не переезжаются) */
function pushObjects() {
  for (const h of chal.holdables) {
    if (chal.held?.h === h || taskFrozen(h)) continue;
    const skip = new Set();
    for (const c of components) {
      const pv = pivots[components.indexOf(c)];
      if (!pv) continue;
      if (c.type === 'gripper') {
        /* предмет между пальцами — их не считаем, иначе они выталкивали бы его при смыкании */
        const lp = graspPoint(h, pv);
        if (gripInner(c) >= holdSize(h) - CHAL.grip.tol && Math.abs(lp.x) < 0.12 && Math.abs(lp.z) < 0.2
            && lp.y > 0.1 && lp.y < 0.7) skip.add(pv); // сомкнутые пальцы предмет толкают
      }
      if (c.type === 'mill' && c._millCutting && c._spin) skip.add(c._spin); // режущий диск не толкает
    }
    const seg = objSegment(h);
    let moved = false;
    for (const cap of armCapsules(skip)) {
      segSegClosest(cap.a, cap.b, seg.a, seg.b, _c1, _c2);
      const d = _c2.distanceTo(_c1), pen = cap.r + seg.r - d;
      if (pen <= 0) continue;
      _s1.subVectors(_c2, _c1);
      if (Math.abs(_s1.y) > d * 0.85) continue; // контакт сверху/снизу: вниз не продавить
      _s1.y = 0;
      if (_s1.lengthSq() < 1e-8) continue;
      _s1.normalize().multiplyScalar(Math.min(pen, 0.08));
      h.obj.position.add(_s1); seg.a.add(_s1); seg.b.add(_s1);
      moved = true;
    }
    if (moved && h.kind === 'cube' && chal.t1) {
      const fp = cubeFootprint(h.obj);
      if (penRest(fp) > 0 && fp.minY < CHAL.pen.height - 0.01) h.obj.position.copy(h.prevPos);
    }
  }
}

function releaseHeld() {
  const H = chal.held;
  if (!H) return;
  chal.held = null;
  delete H.comp._holdSize;
  if (H.comp._fingers) applyGripper(H.comp);
  H.h.vy = 0;
}

/* захват, удержание, столкновения и падение всех предметов задания */
function tickHold(dt) {
  const G = CHAL.grip, H = chal.held;
  if (H) {
    const i = components.indexOf(H.comp), h = H.h, o = h.obj;
    if (i < 0 || gripInner(H.comp) > holdSize(h) + G.tol) releaseHeld(); // пальцы разжались
    else {
      _cm.multiplyMatrices(pivots[i].matrixWorld, H.holdM).decompose(o.position, o.quaternion, _cs);
      const rest = restHeight(h), low = lowestY(h);
      if (low < rest - 0.004) {
        /* упёрся в пол или стенку загона — выскальзывает из пальцев */
        releaseHeld();
        if (rest === 0) o.position.y -= low;
        else { o.position.copy(h.prevPos); o.quaternion.copy(h.prevQuat); }
      }
    }
  }
  if (!chal.held) {
    /* попытка захвата: предмет между пальцами, и пальцы только что сомкнулись на нём */
    for (const c of components) {
      if (c.type !== 'gripper') continue;
      const pivot = pivots[components.indexOf(c)];
      const inner = gripInner(c), prev = c._prevInner ?? inner;
      c._prevInner = inner;
      if (!pivot) continue;
      for (const h of chal.holdables) {
        const size = holdSize(h);
        if (inner > size + G.tol) continue;
        if (inner < size - G.tol && prev < size + G.tol) continue; // были сомкнуты и раньше
        const lp = graspPoint(h, pivot);
        if (Math.abs(lp.x) > G.maxX || Math.abs(lp.z) > G.maxZ || lp.y < G.minY || lp.y > G.maxY) continue;
        h.obj.updateMatrixWorld(true);
        chal.held = { h, comp: c, holdM: pivot.matrixWorld.clone().invert().multiply(h.obj.matrixWorld) };
        c._holdSize = size;
        applyGripper(c);
        h.vy = 0; h.resting = false; h.grabbed = true;
        break;
      }
      if (chal.held) break;
    }
  }
  for (const h of chal.holdables) {
    if (chal.held?.h !== h) {
      /* гравитация */
      let rest = restHeight(h), low = lowestY(h);
      if (low > rest + 0.003 || h.vy !== 0) {
        h.vy -= CHAL.g * dt;
        h.obj.position.y += h.vy * dt;
        h.resting = false;
        rest = restHeight(h); low = lowestY(h);
        if (low <= rest) { settle(h, rest); h.vy = 0; h.resting = true; }
      } else if (!h.resting) { settle(h, rest); h.resting = true; } // отпущен у самого пола — укладывается
    }
  }
}

/* столкновения с рукой и фиксация поз для следующего кадра — после тика задания */
function tickPush() {
  pushObjects();
  for (const h of chal.holdables) {
    h.prevPos.copy(h.obj.position);
    h.prevQuat.copy(h.obj.quaternion);
  }
}
