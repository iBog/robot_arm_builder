'use strict';
/* ---- Задание 3: воксельная чушка и фреза ---- */

function buildTask3() {
  const B = CHAL.billet, vs = B.voxel;
  const nz = Math.round(B.len / vs), nr = Math.ceil(B.r / vs);
  const xs = [], sl = [], cells = [], nxy = nr * 2;
  const grid = new Int32Array(nxy * nxy * nz).fill(-1); // ячейка сетки → индекс вокселя
  for (let iz = 0; iz < nz; iz++) {
    const z = -B.len / 2 + (iz + 0.5) * vs;
    for (let ix = -nr; ix < nr; ix++) for (let iy = -nr; iy < nr; iy++) {
      const x = (ix + 0.5) * vs, y = (iy + 0.5) * vs;
      if (Math.hypot(x, y) > B.r - vs * 0.2) continue;
      grid[((ix + nr) * nxy + iy + nr) * nz + iz] = sl.length;
      cells.push(ix + nr, iy + nr, iz);
      xs.push(x, y, z);
      sl.push(iz);
    }
  }
  const n = sl.length;
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(vs, vs, vs),
    new THREE.MeshStandardMaterial({ color: B.color, roughness: 0.35, metalness: 0.6 }), n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) im.setMatrixAt(i, m.makeTranslation(xs[3 * i], xs[3 * i + 1], xs[3 * i + 2]));
  im.castShadow = im.receiveShadow = true;
  const sliceCount = new Int32Array(nz), sliceTotal = new Int32Array(nz);
  for (const s of sl) { sliceCount[s]++; sliceTotal[s]++; }
  /* чушка — группа (ось — локальная Z), лежит на боку; её можно взять схватом и перенести */
  const group = new THREE.Group();
  group.position.set(B.pos[0], B.r, B.pos[1]);
  /* пунктирное кольцо посередине — линия распила, едет вместе с чушкой */
  const pts = [];
  for (let k = 0; k <= 48; k++) {
    const a = k / 48 * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * (B.r + 0.015), Math.sin(a) * (B.r + 0.015), 0));
  }
  group.add(im, makeDashedLine(0xff5c5c, pts));
  chalRoot.add(group);
  chal.holdables = [holdable(group, 'billet')];
  chal.t3 = { im, group, pos: new Float32Array(xs), slice: sl, alive: new Uint8Array(n).fill(1),
              sliceCount, sliceTotal, nz, nxy, grid, cells: new Int16Array(cells), offCut: false, progress: 0 };
}

/* Разделена ли чушка: обход живых вокселей по 6-связности; при разделении — отношение
   меньшей части к большей (любой рез, хоть наклонный, считается «пополам» при ratio ≥ 0.6) */
const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function billetSplit(T) {
  const { alive, grid, cells, nxy, nz } = T, n = alive.length;
  let start = -1, total = 0;
  for (let i = 0; i < n; i++) if (alive[i]) { total++; if (start < 0) start = i; }
  if (start < 0) return { split: false };
  const seen = new Uint8Array(n), stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop();
    count++;
    const x = cells[3 * i], y = cells[3 * i + 1], z = cells[3 * i + 2];
    for (const [dx, dy, dz] of NB6) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= nxy || Y >= nxy || Z >= nz) continue;
      const j = grid[(X * nxy + Y) * nz + Z];
      if (j < 0 || !alive[j] || seen[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  if (count === total) return { split: false };
  const big = Math.max(count, total - count);
  return { split: true, ratio: (total - big) / big };
}

function tickMill() {
  const T = chal.t3, M = CHAL.mill, B = CHAL.billet;
  if (chal.done[2]) return; // задание выполнено — распил сохраняется как есть (см. taskFrozen)
  let changed = false;
  T.group.updateMatrixWorld(true);
  for (const c of components) {
    if (c.type !== 'mill' || !c._spin) continue;
    c._millCutting = false;
    const near = c._spin.getWorldPosition(_cv).distanceTo(T.group.position) <= B.len / 2 + B.r + M.r;
    /* матрица «из системы чушки в систему диска» — текущая и прошлого кадра */
    const cur = new THREE.Matrix4().copy(c._spin.matrixWorld).invert().multiply(T.group.matrixWorld);
    const prev = c._prevMillM;
    c._prevMillM = cur;
    if (!near || !prev || (c.speed ?? 0) <= 0) continue; // без оборотов диск — обычная деталь (толкает)
    /* Режет ли диск: движение его центра относительно чушки за кадр (по ближайшей к диску
       точке её оси) в плоскости диска — режет кромка, всё внутри диска исчезает; вдоль оси —
       диск упирается боком и лишь толкает чушку как любая деталь руки (pushObjects). */
    const cl = T.group.worldToLocal(_cv.clone());
    const p = new THREE.Vector3(0, 0, THREE.MathUtils.clamp(cl.z, -B.len / 2, B.len / 2));
    const now = p.clone().applyMatrix4(cur), was = p.applyMatrix4(prev);
    const dy = Math.abs(now.y - was.y), inPlane = Math.hypot(now.x - was.x, now.z - was.z);
    if (dy > 0.75 * inPlane + B.voxel * 0.2) continue;
    c._millCutting = true;
    const e = cur.elements, P = T.pos, r2 = M.r * M.r;
    for (let i = 0; i < T.alive.length; i++) {
      if (!T.alive[i]) continue;
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
      const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
      if (Math.abs(ly) > M.halfThick) continue;
      const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (lx * lx + lz * lz > r2) continue;
      T.alive[i] = 0;
      T.sliceCount[T.slice[i]]--;
      T.im.setMatrixAt(i, _zeroM);
      changed = true;
    }
  }
  if (!changed) return;
  T.im.instanceMatrix.needsUpdate = true;
  /* прогресс — по самому тонкому слою около середины; засчитывается разделение
     на две примерно равные части, пропил в другом месте — подсказка offCut */
  const mid = (T.nz - 1) / 2;
  let minFrac = 1;
  for (let iz = 0; iz < T.nz; iz++) {
    if (Math.abs(iz - mid) <= CHAL.billet.midTol) minFrac = Math.min(minFrac, T.sliceCount[iz] / T.sliceTotal[iz]);
  }
  T.progress = Math.round((1 - minFrac) * 100);
  const s = billetSplit(T);
  if (s.split && s.ratio >= 0.6) completeTask();
  else if (s.split) T.offCut = true;
}
