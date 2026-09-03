'use strict';
/* ---- Пол: рука и инструмент об него останавливаются ---- */

/* самая нижняя точка деталей руки (AABB мешей, зоны не считаются) */
function armMinY() {
  let minY = Infinity;
  armRoot.updateWorldMatrix(true, true);
  armRoot.traverse(o => {
    if (o.userData.zone) return;
    for (let p = o.parent; p && p !== armRoot; p = p.parent) if (p.userData.zone) return;
    const g = o.geometry;
    if (!o.isMesh || !g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    _tmpBox.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    minY = Math.min(minY, _tmpBox.min.y);
  });
  return minY;
}

/* Применяет параметр компонента; значение принимается, только пока рука не уходит
   под пол — иначе бинарным поиском берётся крайнее допустимое. Возвращает принятое. */
function applyParamChecked(c, key, v) {
  const old = c[key] ?? v;
  const ok = x => { c[key] = x; if (!applyParam3D(c, key)) buildArm(); return armMinY() >= -0.005; };
  if (ok(v)) return v;
  let lo = old, hi = v;
  for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
  ok(lo);
  return lo;
}

/* то же плюс обновление JSON/URDF (для build-параметров их обновляет buildArm) */
function setParamChecked(c, key, v) {
  const acc = applyParamChecked(c, key, v);
  if (!TYPES[c.type].params.find(p => p.key === key)?.build) { updateJSONView(); updateURDFView(); }
  return acc;
}
