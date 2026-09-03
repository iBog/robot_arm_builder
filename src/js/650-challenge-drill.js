'use strict';
/* ---- Задание 2: стена и четыре отверстия ---- */

function buildTask2() {
  const W = CHAL.wall;
  const vec3s = () => Array.from({ length: W.maxHoles }, () => new THREE.Vector3(0, 1, 0));
  const uni = {
    uHoleN: { value: 0 },
    uHoleP: { value: vec3s() },
    uHoleD: { value: vec3s() },
    uHoleLR: { value: Array.from({ length: W.maxHoles }, () => new THREE.Vector2()) },
  };
  /* стена — обычный материал, но фрагменты внутри цилиндров отверстий отбрасываются */
  const wm = new THREE.MeshStandardMaterial({ color: W.color, roughness: 0.85, metalness: 0.05 });
  wm.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHolePos;')
      .replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvHolePos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vHolePos;
        uniform int uHoleN;
        uniform vec3 uHoleP[${W.maxHoles}];
        uniform vec3 uHoleD[${W.maxHoles}];
        uniform vec2 uHoleLR[${W.maxHoles}];`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        for (int i = 0; i < ${W.maxHoles}; i++) {
          if (i >= uHoleN) break;
          vec3 q = vHolePos - uHoleP[i];
          float tt = dot(q, uHoleD[i]);
          if (tt > -0.01 && tt < uHoleLR[i].x + 0.004 && length(q - tt * uHoleD[i]) < uHoleLR[i].y) discard;
        }`);
  };
  const wall = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W.thick, W.height, W.width), wm));
  wall.position.set(W.x - W.thick / 2, W.height / 2, 0);
  /* разметка на лицевой грани (смотрит на руку, +X): контур квадрата и метки по углам */
  const fx = W.x + 0.003, s = W.square.side / 2, cy = W.square.y;
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(fx, cy - s, -s), new THREE.Vector3(fx, cy - s, s),
    new THREE.Vector3(fx, cy + s, s), new THREE.Vector3(fx, cy + s, -s),
  ]), new THREE.LineBasicMaterial({ color: 0x2b3038 }));
  const corners = [], marks = [];
  for (const [dy, dz] of [[-s, -s], [-s, s], [s, s], [s, -s]]) {
    corners.push(new THREE.Vector3(W.x, cy + dy, dz));
    const m = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.065, 24),
      new THREE.MeshBasicMaterial({ color: 0xff5c5c, side: THREE.DoubleSide }));
    m.rotation.y = Math.PI / 2;
    m.position.set(fx, cy + dy, dz);
    marks.push(m);
  }
  chalRoot.add(wall, outline, ...marks);
  chal.holdables = [];
  chal.t2 = {
    uni, holes: [], corners, marks, drilled: [false, false, false, false], spindleOff: false,
    min: new THREE.Vector3(W.x - W.thick, 0, -W.width / 2), max: new THREE.Vector3(W.x, W.height, W.width / 2),
  };
}

/* внутренняя поверхность отверстия: трубка (изнутри) + дно, пока отверстие глухое */
function makeBore() {
  const W = CHAL.wall, r = CHAL.drill.r * 1.03; // чуть шире выреза — стык не просвечивает
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: W.bore, roughness: 0.9, side: THREE.BackSide }));
  const cap = new THREE.Mesh(new THREE.CircleGeometry(r, 20),
    new THREE.MeshStandardMaterial({ color: W.bore, roughness: 0.9 }));
  cap.rotation.x = Math.PI / 2; // нормаль −Y — ко входу отверстия
  g.add(tube, cap);
  g.visible = false;
  chalRoot.add(g);
  return g;
}

function updateBore(h) {
  const g = h.mesh;
  g.position.copy(h.p).addScaledVector(h.d, h.L / 2);
  g.quaternion.setFromUnitVectors(Y_AXIS, h.d);
  g.children[0].scale.y = h.L;
  g.children[1].position.y = h.L / 2;
  g.children[1].visible = h.L < h.maxL - 0.003; // сквозное — без дна
  g.visible = h.L > 0.002;
}

function syncHoleUniforms() {
  const T = chal.t2, u = T.uni;
  u.uHoleN.value = T.holes.length;
  T.holes.forEach((h, i) => {
    u.uHoleP.value[i].copy(h.p);
    u.uHoleD.value[i].copy(h.d);
    u.uHoleLR.value[i].set(h.L, CHAL.drill.r);
  });
}

function tickDrill() {
  const T = chal.t2, W = CHAL.wall, D = CHAL.drill;
  T.spindleOff = false;
  let changed = false;
  for (const c of components) {
    if (c.type !== 'drill' || !c._spin) continue;
    const base = c._spin.getWorldPosition(new THREE.Vector3());
    const tip = c._spin.localToWorld(new THREE.Vector3(0, D.len, 0));
    const inside = insideBox(tip, T.min, T.max), wasInside = c._tipInside;
    c._tipInside = inside;
    if (!inside) continue;
    if ((c.speed ?? 0) <= 0) { T.spindleOff = true; continue; } // без оборотов не сверлит
    const dir = tip.clone().sub(base).normalize();
    /* сверло уже в своём отверстии? иначе — новое от точки входа в стену */
    let hole = T.holes.find(h => {
      const q = tip.clone().sub(h.p), tt = q.dot(h.d);
      return tt > -0.05 && h.d.dot(dir) > 0.8 && q.addScaledVector(h.d, -tt).length() < D.r * 2.5;
    });
    if (!hole) {
      /* сверлит только вдоль оси: новое отверстие — лишь в момент входа в стену,
         сдвиг вбок внутри стены ничего не режет */
      if (wasInside) continue;
      const hit = rayBox(base, dir, T.min, T.max);
      if (!hit || hit[0] < 0 || T.holes.length >= W.maxHoles) continue;
      hole = { p: base.clone().addScaledVector(dir, hit[0]), d: dir, L: 0,
               maxL: Math.min(D.len, hit[1] - hit[0]), mesh: makeBore() };
      T.holes.push(hole);
    }
    const depth = Math.min(hole.maxL, tip.clone().sub(hole.p).dot(hole.d));
    if (depth > hole.L) { hole.L = depth; updateBore(hole); changed = true; }
  }
  if (!changed) return;
  syncHoleUniforms();
  T.drilled = T.corners.map((ck, k) => T.drilled[k]
    || T.holes.some(h => h.L > 0.003 && h.p.distanceTo(ck) < W.tol));
  T.marks.forEach((m, k) => m.material.color.setHex(T.drilled[k] ? 0x35c26a : 0xff5c5c));
  if (T.drilled.every(Boolean)) completeTask();
}
