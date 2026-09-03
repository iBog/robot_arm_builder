'use strict';
/* ---- Задание 1: кубик, кольцо, загон ---- */

function buildTask1() {
  const S = CHAL.cube, R = CHAL.ring, P = CHAL.pen;
  const cube = shadowed(new THREE.Mesh(new THREE.BoxGeometry(S.size, S.size, S.size), mat(S.color)));
  cube.position.set(S.pos[0], S.size / 2, S.pos[1]);
  /* синее кольцо нулевой высоты */
  const ring = new THREE.Mesh(new THREE.RingGeometry(R.rIn, R.rOut, 64),
    new THREE.MeshBasicMaterial({ color: R.color, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(R.pos[0], 0.003, R.pos[1]);
  /* зелёный квадрат-загон: четыре низкие стенки + едва заметная заливка */
  const pen = new THREE.Group();
  pen.position.set(P.pos[0], 0, P.pos[1]);
  const o = P.half + P.wall, wm = mat(P.color);
  for (const [x, z, w, d] of [[o - P.wall / 2, 0, P.wall, o * 2], [P.wall / 2 - o, 0, P.wall, o * 2],
                              [0, o - P.wall / 2, o * 2, P.wall], [0, P.wall / 2 - o, o * 2, P.wall]]) {
    const side = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, P.height, d), wm));
    side.position.set(x, P.height / 2, z);
    pen.add(side);
  }
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(P.half * 2, P.half * 2),
    new THREE.MeshBasicMaterial({ color: P.color, transparent: true, opacity: 0.18, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.003;
  pen.add(fill);
  chalRoot.add(cube, ring, pen);
  chal.holdables = [holdable(cube, 'cube')];
  chal.t1 = { cube, phase: 0 };
}

/* цели по порядку: сначала кольцо, потом загон; кубик должен стоять на полу */
function tickTask1() {
  const T = chal.t1, h = chal.holdables[0];
  if (!h.resting || chal.held?.h === h) return;
  const fp = cubeFootprint(h.obj);
  if (fp.minY > 0.01 || penRest(fp) !== 0) return;
  if (T.phase === 0 && cubeInRing(fp)) T.phase = 1;
  else if (T.phase === 1 && cubeInPen(fp)) { T.phase = 2; completeTask(); }
}
