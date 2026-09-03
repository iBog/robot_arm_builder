'use strict';
/* ---- общие утилиты ---- */
const _cm = new THREE.Matrix4(), _cs = new THREE.Vector3(), _cv = new THREE.Vector3();
const _inv = new THREE.Matrix4(), _zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const CUBE_CORNERS = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) CUBE_CORNERS.push(new THREE.Vector3(sx, sy, sz));

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function disposeGroup(g) {
  g.traverse(o => {
    o.geometry?.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
  g.clear();
}

function insideBox(p, min, max) {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;
}

/* пересечение луча с AABB (slab): [tNear, tFar] или null */
function rayBox(o, d, min, max) {
  let tn = -Infinity, tf = Infinity;
  for (const k of ['x', 'y', 'z']) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < min[k] || o[k] > max[k]) return null; continue; }
    let t1 = (min[k] - o[k]) / d[k], t2 = (max[k] - o[k]) / d[k];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tn = Math.max(tn, t1); tf = Math.min(tf, t2);
    if (tn > tf) return null;
  }
  return [tn, tf];
}

/* просвет между пальцами схвата по текущему раскрытию */
function gripInner(c) { return 2 * gripGap(c) - GEOM.gripper.finger[0]; }
