'use strict';
/* ================= Авто-кадрирование камеры ================= */

const _box = new THREE.Box3(), _tmpBox = new THREE.Box3(), _sphere = new THREE.Sphere();
const _frustum = new THREE.Frustum(), _projScreen = new THREE.Matrix4();

/* ограничивающая сфера видимой геометрии перечисленных корней */
function boundsSphere(roots) {
  _box.makeEmpty();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverseVisible(o => {
      const g = o.geometry;
      if (!g) return;
      if (o.isInstancedMesh) {
        if (!o.boundingBox) o.computeBoundingBox();
        _tmpBox.copy(o.boundingBox);
      } else {
        if (!g.boundingBox) g.computeBoundingBox();
        _tmpBox.copy(g.boundingBox);
      }
      _box.union(_tmpBox.applyMatrix4(o.matrixWorld));
    });
  }
  return _box.isEmpty() ? null : _box.getBoundingSphere(_sphere);
}

/* ограничивающая сфера видимой части руки */
function armSphere() { return boundsSphere([armRoot]); }

/* плавно отодвигает камеру, если рука вылезает за кадр (только наружу);
   возвращает true, если камера сдвинулась */
function cameraAutoExpand() {
  const s = armSphere();
  if (!s) return false;
  camera.updateMatrixWorld();
  _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_projScreen);
  for (const plane of _frustum.planes) {
    if (plane.distanceToPoint(s.center) < s.radius * 0.92) {
      const dir = camera.position.clone().sub(controls.target);
      const dist = dir.length();
      if (dist < 80) {
        camera.position.copy(controls.target).addScaledVector(dir.normalize(), dist * 1.03);
        return true;
      }
      return false;
    }
  }
  return false;
}

/* полный сброс кадра под текущую руку (после генерации) */
function fitCameraToArm() { fitCameraToSphere(armSphere()); }

function fitCameraToSphere(s) {
  if (!s) return;
  invalidate();
  const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const needed = s.radius * 1.15 / Math.sin(Math.min(vHalf, hHalf));
  controls.target.copy(s.center);
  const dir = new THREE.Vector3(1, 0.62, 1.25).normalize();
  camera.position.copy(s.center).addScaledVector(dir, Math.max(needed, 3.5));
}
