'use strict';
/* ================= Challenge mode: три задания для собранной руки ================= */

/* Объекты заданий живут в chalRoot отдельно от руки: в JSON/URDF/BOM они не попадают.
   Состояние режима — chal (null = выключен). Задание 1 — кубик, плоское кольцо и
   квадрат-загон со стенками (захват схватом + гравитация); задание 2 — стена, в
   которой сверло вырезает цилиндры (шейдер стены отбрасывает фрагменты внутри
   отверстий, стенки отверстия — отдельный меш); задание 3 — воксельная чушка,
   которую фреза пилит пополам (воксели внутри диска фрезы исчезают).
   Все действия пользователя в режиме пишутся в chal.log (вкладка «Запись»):
   последнее можно отменить, всю последовательность — проиграть заново с физикой. */
const chalRoot = new THREE.Group();
scene.add(chalRoot);

const CHAL = {
  cube:   { size: 0.24, pos: [0.4, 1.6], color: 0xf2a03d },
  ring:   { pos: [1.5, 0.5], rIn: 0.3, rOut: 0.36, color: 0x2f7fff },
  /* загон дальше от основания, чем кольцо (радиус 2.2 против 1.6): одним поворотом
     руки кубик не перенести, нужен ещё и вылет */
  pen:    { pos: [-1.4, 1.7], half: 0.25, wall: 0.03, height: 0.08, color: 0x35c26a },
  /* стена дальше и выше, разметка на высоте плеча: сверлить удобно движением
     параллельно полу, а не снизу вверх */
  wall:   { x: -2.1, thick: 0.12, height: 2.0, width: 1.4, color: 0xcdbfa3, bore: 0x454a52,
            square: { y: 1.3, side: 0.5 }, tol: 0.075, maxHoles: 12 },
  drill:  { r: GEOM.drill.bit.r[0], len: GEOM.drill.bit.len }, // из реестра GEOM
  /* чушка дальше от основания, чем кольцо: вплотную к базе рука не складывается —
     не хватает габаритов, до чушки должно доставать вытянутое, а не сложенное плечо */
  billet: { pos: [-0.3, 1.9], r: 0.14, len: 0.8, voxel: 0.02, color: 0xaeb6c0, midTol: 4 },
  mill:   { r: GEOM.mill.cutR, halfThick: GEOM.mill.cutHalf },  // из реестра GEOM
  /* окно захвата в системе координат схвата: где должен быть центр кубика */
  grip:   { minY: 0.2, maxY: 0.62, maxX: 0.07, maxZ: 0.14, tol: 0.03 },
  g: 6,                                    // ускорение падения, ед/с²
};
const CHAL_TOOLS = ['gripper', 'drill', 'mill']; // нужный наконечник для каждого задания

/* Самопроверка реестра геометрии — в духе checkCodeSpec(): у каждого типа есть
   запись, размеры положительны и согласованы между собой и с заданиями.
   При старте ругается в консоль; тесты зовут напрямую. */
function checkGeomSpec() {
  const errors = [], G = GEOM;
  const pos = (v, what) => { if (!(v > 0)) errors.push(`${what}: ожидается > 0, есть ${v}`); };
  for (const type of Object.keys(TYPES)) if (!G[type]) errors.push(`нет GEOM.${type}`);
  for (const k of ['yaw', 'pitch', 'roll', 'gripper']) pos(TYPES[k].height, `TYPES.${k}.height`);
  pos(G.base.h, 'base.h');
  for (const k of ['yaw', 'roll']) { pos(G[k].body[0], k + '.body'); pos(G[k].mark.hFrac, k + '.mark.hFrac'); }
  if (G.pitch.cap.x - G.pitch.cap.w / 2 > G.pitch.axle.len / 2) errors.push('pitch: крышки не касаются оси');
  for (const k of ['rail', 'suction', 'drill', 'mill']) pos(G[k].attach, k + '.attach');
  const g = G.gripper;
  if (2 * g.gap0 <= g.finger[0]) errors.push('gripper: сомкнутые пальцы пересекаются');
  if (g.fingerY - g.finger[1] / 2 < g.palm[1]) errors.push('gripper: пальцы врезаются в ладонь');
  if (TYPES.gripper.height < g.fingerY) errors.push('gripper: точка крепления ниже пальцев');
  if (2 * (g.gap0 + g.gapRange) - g.finger[0] < CHAL.cube.size + CHAL.grip.tol) errors.push('gripper: кубик задания не проходит между пальцами');
  if (CHAL.grip.minY > g.fingerY || CHAL.grip.maxY < g.fingerY) errors.push('CHAL.grip: окно захвата не накрывает пальцы');
  /* «за один проход по глубине»: ниже вершин зубьев диск не опустить — пол; чтобы он
     всё же прошёл лежащую чушку насквозь, режущая кромка должна доставать глубже них */
  const millTip = G.mill.teeth.r + G.mill.teeth.size / 2;
  if (G.mill.cutR < millTip) errors.push('mill.cutR меньше вершин зубьев');
  if (G.mill.cutR - millTip < CHAL.billet.r * 0.4) errors.push('mill: кромка не проходит чушку насквозь, пока диск не упёрся в пол');
  if (G.mill.cutHalf < G.mill.disk.h / 2) errors.push('mill.cutHalf тоньше диска');
  if (G.mill.attach < G.mill.spinY + G.mill.disk.h / 2) errors.push('mill: диск выше точки крепления');
  if (G.mill.spinY < G.mill.stem.h) errors.push('mill: диск внутри штока');
  if (G.drill.bit.len > G.drill.attach - G.drill.body.h) errors.push('drill: сверло длиннее вылета');
  if (G.drill.fluteY + G.drill.flute[1] / 2 > G.drill.bit.len) errors.push('drill: канавка длиннее сверла');
  if (G.suction.attach < G.suction.body.h + G.suction.cup.h) errors.push('suction: манжета выше точки крепления');
  if (G.spherical.ball.y < G.spherical.socket.h) errors.push('spherical: шар внутри чашки');
  if (G.rail.attach < G.rail.carY + G.rail.car[1] / 2) errors.push('rail: каретка выше точки крепления');
  if (G.offset.endY < G.offset.arm.y + G.offset.arm.h / 2) errors.push('offset: конец кронштейна ниже полки');
  for (const e of errors) console.error(`Robo-Arm GEOM нарушен: ${e}`);
  return !errors.length;
}

let chal = null;
const btnChal = document.getElementById('btnChal');
const chalPanel = document.getElementById('chalPanel');
/* Окно задания сворачивается в кнопку «🏆» (на телефоне оно закрывает весь 3D-вид):
   при активном режиме кнопка прячет/показывает окно и несёт компактный прогресс
   «🏆 2/3 ✓»; выход из режима — ✕ в шапке окна. Выполненное задание разворачивает
   окно само, чтобы поздравление не потерялось. */
let chalCollapsed = false;
function setChalCollapsed(v) {
  chalCollapsed = v;
  chalPanel.hidden = v;
  btnChal.classList.toggle('collapsed', v);
  renderChalButton();
}
function renderChalButton() {
  if (!chal) { btnChal.textContent = t('chalBtn'); btnChal.title = t('chalTip'); return; }
  btnChal.textContent = `🏆 ${chal.task + 1}/3${chal.done[chal.task] ? ' ✓' : ''}`;
  btnChal.title = t('chalToggleTip');
}
const actList = document.getElementById('actList');
