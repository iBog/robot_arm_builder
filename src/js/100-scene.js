'use strict';
/* ================= Сцена three.js ================= */

const viewport = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(SCN.bg);
scene.fog = new THREE.Fog(SCN.bg, 14, 30);

/* Туман не должен глотать руку: дистанции подстраиваются под отход камеры
   (при Fit камера отъезжает далеко, и статичный туман «съедал» дальние детали) */
const FOG = { near: 14, far: 30 };
function updateFog() {
  const d = camera.position.distanceTo(controls.target);
  scene.fog.near = Math.max(FOG.near, d * 1.6);
  scene.fog.far = Math.max(FOG.far, d * 3.2);
}

/* стартовый вид камеры: к нему возвращает «Start New Project» */
const CAM_HOME = { pos: new THREE.Vector3(4.5, 3.5, 5.5), target: new THREE.Vector3(0, 1.3, 0) };

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.copy(CAM_HOME.pos);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(CAM_HOME.target);
controls.enableDamping = true;
controls.addEventListener('change', () => invalidate());

const hemi = new THREE.HemisphereLight(SCN.hemiSky, SCN.hemiGround, SCN.hemiInt);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, SCN.sunInt);
sun.position.set(5, 9, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -7;
sun.shadow.camera.right = sun.shadow.camera.top = 7;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(9, 64),
  new THREE.MeshStandardMaterial({ color: SCN.ground, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
/* сетка пересоздаётся при смене темы: цвета GridHelper запечены в геометрию */
function makeGrid() {
  const g = new THREE.GridHelper(14, 28, SCN.grid1, SCN.grid2);
  g.position.y = 0.001;
  return g;
}
let grid = makeGrid();
scene.add(grid);

/* Рендер только когда есть что показать: движение камеры, анимация, задания,
   вращающиеся шпиндели или явная пометка invalidate() после любого изменения
   сцены. Иначе цикл крутится вхолостую — на телефонах это батарея. Несколько
   кадров подряд, чтобы дорисовались тени и затухание камеры. */
let renderPending = 3;
function invalidate() { renderPending = 3; }

function resize() {
  invalidate();
  const w = viewport.clientWidth, h = viewport.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
}
new ResizeObserver(resize).observe(viewport);
resize();
