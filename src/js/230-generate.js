'use strict';
/* ================= Генератор случайных рук ================= */

function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.round(rand(a, b)); }
function randLen(a, b) { return +rand(a, b).toFixed(2); }

function generateArm() {
  cancelTutorial();
  stopChallenge(); // руку посреди задания не подменить — только достроить по шагам
  const c = [];

  /* иногда — рельс в основании */
  if (Math.random() < 0.3) c.push({ type: 'rail', pos: randLen(-1.5, 1.5) });

  /* база: чаще турель-yaw, иногда шаровой шарнир */
  if (Math.random() < 0.8) c.push({ type: 'yaw', angle: randi(-90, 90) });
  else c.push({ type: 'spherical', pitch: randi(-30, 30), yaw: randi(-60, 60) });

  /* 2–4 секции руки в разных вариациях */
  const sections = randi(2, 4);
  for (let i = 0; i < sections; i++) {
    const r = Math.random();
    if (r < 0.5) {
      c.push({ type: 'pitch', angle: randi(-70, 70) });
      c.push({ type: 'link', length: randLen(0.6, 1.6) });
    } else if (r < 0.65) {
      const L = randLen(0.5, 1.2);
      c.push({ type: 'prismatic', length: L, ext: randLen(0, L) });
    } else if (r < 0.78) {
      c.push({ type: 'spherical', pitch: randi(-45, 45), yaw: randi(-90, 90) });
      c.push({ type: 'link', length: randLen(0.5, 1.2) });
    } else if (r < 0.88) {
      c.push({ type: 'offset', length: randLen(0.3, 1.0) });
    } else {
      c.push({ type: 'roll', angle: randi(-90, 90) });
      c.push({ type: 'link', length: randLen(0.5, 1.2) });
    }
  }

  /* запястье */
  if (Math.random() < 0.6) c.push({ type: 'roll', angle: randi(-90, 90) });
  if (Math.random() < 0.5) c.push({ type: 'pitch', angle: randi(-45, 45) });

  /* концевой эффектор — не всегда */
  if (Math.random() < 0.85) {
    const r = Math.random();
    if (r < 0.5) c.push({ type: 'gripper', open: randi(0, 100) });
    else if (r < 0.7) c.push({ type: 'suction', power: randi(0, 100) });
    else if (r < 0.85) c.push({ type: 'drill', speed: randi(20, 100) });
    else c.push({ type: 'mill', speed: randi(20, 100) });
  }

  pushUndo();
  withLog(() => { components = c; buildArm(); renderPanel(); });
  fitCameraToArm(); // сброс камеры — только при генерации новой руки
}

document.getElementById('btnGenerate').onclick = generateArm;
