'use strict';
/* ---- Предметы, которые можно взять схватом (кубик, чушка): захват, удержание, гравитация ---- */

function holdable(obj, kind) {
  return { obj, kind, vy: 0, resting: true, grabbed: false,
           prevPos: obj.position.clone(), prevQuat: obj.quaternion.clone() };
}

/* след кубика на полу: AABB проекций 8 вершин, самая нижняя точка, сами вершины */
function cubeFootprint(cube) {
  cube.updateMatrixWorld(true);
  const h = CHAL.cube.size / 2;
  const fp = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, pts: [] };
  for (const o of CUBE_CORNERS) {
    const p = _cv.copy(o).multiplyScalar(h).applyMatrix4(cube.matrixWorld);
    fp.minX = Math.min(fp.minX, p.x); fp.maxX = Math.max(fp.maxX, p.x);
    fp.minZ = Math.min(fp.minZ, p.z); fp.maxZ = Math.max(fp.maxZ, p.z);
    fp.minY = Math.min(fp.minY, p.y);
    fp.pts.push(p.clone());
  }
  return fp;
}

function cubeInPen(fp) {
  const P = CHAL.pen, cx = P.pos[0], cz = P.pos[1];
  return fp.minX >= cx - P.half && fp.maxX <= cx + P.half && fp.minZ >= cz - P.half && fp.maxZ <= cz + P.half;
}

function cubeInRing(fp) {
  const R = CHAL.ring;
  return fp.pts.every(p => Math.hypot(p.x - R.pos[0], p.z - R.pos[1]) < R.rIn);
}

/* высота, на которой кубик остановится: пол или верх стенки загона, если след её задевает */
function penRest(fp) {
  const P = CHAL.pen, cx = P.pos[0], cz = P.pos[1], o = P.half + P.wall;
  const hitsOuter = fp.minX < cx + o && fp.maxX > cx - o && fp.minZ < cz + o && fp.maxZ > cz - o;
  if (!hitsOuter) return 0;
  return cubeInPen(fp) ? 0 : P.height;
}

/* самая нижняя точка предмета */
function lowestY(h) {
  if (h.kind === 'cube') return cubeFootprint(h.obj).minY;
  const B = CHAL.billet, a = _cv.set(0, 0, 1).applyQuaternion(h.obj.quaternion);
  return h.obj.position.y - (B.len / 2 * Math.abs(a.y) + B.r * Math.sqrt(Math.max(0, 1 - a.y * a.y)));
}

/* высота покоя предмета: стенки загона учитываются только для кубика в задании 1 */
function restHeight(h) {
  return h.kind === 'cube' && chal.t1 ? penRest(cubeFootprint(h.obj)) : 0;
}

/* ширина предмета между пальцами */
function holdSize(h) { return h.kind === 'cube' ? CHAL.cube.size : CHAL.billet.r * 2; }

/* точка предмета, которую сжимают пальцы, в системе схвата:
   центр кубика или ближайшая к пальцам точка оси чушки */
function graspPoint(h, pivot) {
  if (h.kind === 'cube') return pivot.worldToLocal(h.obj.position.clone());
  const B = CHAL.billet, a = new THREE.Vector3(0, 0, 1).applyQuaternion(h.obj.quaternion);
  const fingers = pivot.localToWorld(new THREE.Vector3(0, GEOM.gripper.fingerY, 0));
  const t = THREE.MathUtils.clamp(fingers.sub(h.obj.position).dot(a), -B.len / 2, B.len / 2);
  return pivot.worldToLocal(h.obj.position.clone().addScaledVector(a, t));
}

/* приземление: предмет выравнивается по полу, сохраняя поворот вокруг вертикали */
function settle(h, rest) {
  const o = h.obj;
  if (h.kind === 'cube') {
    _cv.set(1, 0, 0).applyQuaternion(o.quaternion);
    o.rotation.set(0, Math.atan2(-_cv.z, _cv.x), 0);
    o.position.y = rest + CHAL.cube.size / 2;
    return;
  }
  const B = CHAL.billet, a = _cv.set(0, 0, 1).applyQuaternion(o.quaternion);
  if (Math.abs(a.y) > 0.7) { o.rotation.set(-Math.PI / 2, 0, 0); o.position.y = rest + B.len / 2; } // на торец
  else { o.rotation.set(0, Math.atan2(a.x, a.z), 0); o.position.y = rest + B.r; }                  // на бок
}
