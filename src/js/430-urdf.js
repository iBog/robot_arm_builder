'use strict';
/* ================= URDF: описание руки для ROS ================= */

/* URDF (Unified Robot Description Format) — стандартное XML-описание робота:
   дерево звеньев (link), соединённых суставами (joint). Выгрузка полностью
   самодостаточна: геометрия — примитивы (cylinder/box/sphere), внешних мешей
   нет, файл открывается в RViz, MoveIt, Gazebo, PyBullet, urdf-loaders.

   Оси. В сцене three.js «вдоль руки» — локальный +Y, в URDF — +Z. Экспорт
   разворачивает систему на Rx(+90°): (x, y, z)_three → (x, −z, y)_urdf.
   Развороты вокруг X от этого не меняются, поэтому оси суставов простые:
   yaw/roll (three .rotation.y) → «0 0 1», pitch (.rotation.x) → «1 0 0»,
   знак угла тот же. Цилиндр в three лежит вдоль Y, в URDF — вдоль Z: после
   разворота осей это одна и та же ось, дополнительный rpy нужен только оси
   сустава pitch (она лежит поперёк, rpy «0 π/2 0»).

   Единицы: 1 единица сцены = URDF_SCALE метров, углы — радианы.
   Массы, тензоры инерции и effort/velocity — оценочные (равномерная плотность
   URDF_DENSITY по объёму примитивов): для визуализации и кинематики этого
   достаточно, для динамики их нужно заменить настоящими (см. вкладку BOM).

   URDF описывает модель, а не позу, поэтому текущие значения слайдеров уходят
   в комментарий-шапку — оттуда их можно перенести в joint_states. */

const URDF_SCALE = 1;          // метров в одной единице сцены
const URDF_DENSITY = 400;      // кг/м³, «полая» конструкция — оценка массы
const URDF_NEUTRAL = 0x8a94a6; // корпусные детали (не зависят от темы UI)
const URDF_MARK = 0xe2e8f0;    // метки-риски на поворотных узлах

const urdfPane = document.getElementById('urdfarea');
const urdfText = document.getElementById('urdfText');
const urdfStatus = document.getElementById('urdfStatus');

/* ---- Примитивы: те же формы, что в buildArm(), но уже в осях URDF ---- */
const uCyl = (r, l, p, col, rpy) => ({ g: 'cylinder', r, l, p, col, rpy });
const uBox = (s, p, col, rpy) => ({ g: 'box', s, p, col, rpy });
const uSph = (r, p, col) => ({ g: 'sphere', r, p, col });
const uAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const uNum = v => (Math.abs(v) < 1e-9 ? '0' : String(+v.toFixed(5)));
const uLen = v => uNum(v * URDF_SCALE);
const uXYZ = p => p.map(uLen).join(' ');
const uRPY = r => (r ? r.map(uNum).join(' ') : '0 0 0');
const uRad = deg => deg * Math.PI / 180;

function uGeom(s) {
  if (s.g === 'cylinder') return `<cylinder radius="${uLen(s.r)}" length="${uLen(s.l)}"/>`;
  if (s.g === 'box') return `<box size="${s.s.map(uLen).join(' ')}"/>`;
  return `<sphere radius="${uLen(s.r)}"/>`;
}

const uMatName = col => 'c_' + col.toString(16).padStart(6, '0');

function uShape(s) {
  const org = `<origin xyz="${uXYZ(s.p)}" rpy="${uRPY(s.rpy)}"/>`;
  return `    <visual>\n      ${org}\n      <geometry>${uGeom(s)}</geometry>\n`
       + `      <material name="${uMatName(s.col)}"/>\n    </visual>\n`
       + `    <collision>\n      ${org}\n      <geometry>${uGeom(s)}</geometry>\n    </collision>`;
}

/* ---- Оценка масс-инерционных свойств звена по его примитивам ---- */

function uMass(s) {
  const S = URDF_SCALE;
  const vol = s.g === 'cylinder' ? Math.PI * (s.r * S) ** 2 * (s.l * S)
    : s.g === 'box' ? (s.s[0] * S) * (s.s[1] * S) * (s.s[2] * S)
      : 4 / 3 * Math.PI * (s.r * S) ** 3;
  return vol * URDF_DENSITY;
}

/* Диагональ собственного тензора в осях звена. Из разворотов в модели важен
   только цилиндр, положенный вдоль X (корпус сустава pitch); повороты вокруг Z
   у зубьев фрезы на диагональ влияют пренебрежимо. */
function uInertiaDiag(s, m) {
  const S = URDF_SCALE;
  if (s.g === 'box') {
    const [x, y, z] = s.s.map(v => v * S);
    return [m * (y * y + z * z) / 12, m * (x * x + z * z) / 12, m * (x * x + y * y) / 12];
  }
  if (s.g === 'sphere') { const i = 0.4 * m * (s.r * S) ** 2; return [i, i, i]; }
  const across = m * (3 * (s.r * S) ** 2 + (s.l * S) ** 2) / 12;
  const along = 0.5 * m * (s.r * S) ** 2;
  const alongX = s.rpy && Math.abs(Math.abs(s.rpy[1]) - Math.PI / 2) < 1e-6;
  return alongX ? [along, across, across] : [across, across, along];
}

/* Суммарные масса, центр масс и тензор (диагональ, теорема Гюйгенса–Штейнера).
   Пустое звено (промежуточное у шарового сустава, tool0) получает символическую
   массу — многие парсеры спотыкаются о звенья вообще без inertial. */
function uInertial(shapes) {
  if (!shapes.length) {
    return '    <inertial>\n      <mass value="0.001"/>\n'
         + '      <inertia ixx="1e-6" ixy="0" ixz="0" iyy="1e-6" iyz="0" izz="1e-6"/>\n    </inertial>\n';
  }
  let m = 0;
  let c = [0, 0, 0];
  for (const s of shapes) {
    const mi = uMass(s);
    m += mi;
    for (let k = 0; k < 3; k++) c[k] += mi * s.p[k] * URDF_SCALE;
  }
  c = c.map(v => v / m);
  let ixx = 0, iyy = 0, izz = 0;
  for (const s of shapes) {
    const mi = uMass(s);
    const [a, b, d] = uInertiaDiag(s, mi);
    const [dx, dy, dz] = [0, 1, 2].map(k => s.p[k] * URDF_SCALE - c[k]);
    ixx += a + mi * (dy * dy + dz * dz);
    iyy += b + mi * (dx * dx + dz * dz);
    izz += d + mi * (dx * dx + dy * dy);
  }
  return `    <inertial>\n      <origin xyz="${c.map(uNum).join(' ')}" rpy="0 0 0"/>\n`
       + `      <mass value="${uNum(m)}"/>\n`
       + `      <inertia ixx="${uNum(ixx)}" ixy="0" ixz="0" iyy="${uNum(iyy)}" iyz="0" izz="${uNum(izz)}"/>\n`
       + '    </inertial>\n';
}

/* ---- Имя робота и файла: латиница из английского названия руки ---- */
function urdfName() {
  return armName().en.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'robo_arm';
}

/* ---- Сборка URDF из цепочки components ---- */
function buildURDF() {
  const nodes = [];  // звенья и суставы в порядке цепочки
  const pose = [];   // текущие значения суставов — в комментарий-шапку
  let cur = { name: 'base_link', shapes: [] };
  nodes.push({ link: cur });
  cur.shapes.push(uCyl(gAvgR(GEOM.base.r), GEOM.base.h, [0, 0, GEOM.base.h / 2], URDF_NEUTRAL));
  let org = [0, 0, GEOM.base.h]; // точка крепления следующего компонента в осях cur

  /* Сустав + звено-потомок; дальше собираем в это новое звено */
  function joint(name, type, child, at, axis, lower, upper, effort, vel, mimic) {
    const x = [`  <joint name="${name}" type="${type}">`,
      `    <parent link="${cur.name}"/>`,
      `    <child link="${child}"/>`,
      `    <origin xyz="${uXYZ(at)}" rpy="0 0 0"/>`];
    if (axis) x.push(`    <axis xyz="${axis.join(' ')}"/>`);
    if (type === 'revolute' || type === 'prismatic') {
      x.push(`    <limit lower="${uNum(lower)}" upper="${uNum(upper)}" effort="${effort}" velocity="${vel}"/>`);
    } else if (type === 'continuous') {
      x.push(`    <limit effort="${effort}" velocity="${vel}"/>`);
    }
    if (mimic) x.push(`    <mimic joint="${mimic}" multiplier="1" offset="0"/>`);
    x.push('  </joint>');
    nodes.push({ xml: x.join('\n') });
    cur = { name: child, shapes: [] };
    nodes.push({ link: cur });
    return cur;
  }

  components.forEach((c, i) => {
    const ty = TYPES[c.type];
    const k = i + 1;
    const jn = `joint_${k}_${c.type}`, ln = `link_${k}_${c.type}`;

    if (c.type === 'yaw' || c.type === 'roll') {
      const h = ty.height, p = ty.params[0];
      const L = joint(jn, 'revolute', ln, org, [0, 0, 1], uRad(p.min), uRad(p.max), 10, 2);
      pose.push([jn, uRad(c.angle ?? 0)]);
      const G = GEOM[c.type], gm = G.mark;
      L.shapes.push(uCyl(gAvgR(G.body), h, [0, 0, h / 2], ty.color));
      L.shapes.push(uBox([gm.w, gm.d, h * gm.hFrac], [0, -gm.z, h / 2], URDF_MARK));
      org = [0, 0, h];

    } else if (c.type === 'pitch') {
      /* корпус-ось и крышки не вращаются — остаются на звене-родителе */
      const h = ty.height, p = ty.params[0], axleRPY = [0, Math.PI / 2, 0];
      const G = GEOM.pitch;
      cur.shapes.push(uCyl(G.axle.r, G.axle.len, uAdd(org, [0, 0, h / 2]), ty.color, axleRPY));
      cur.shapes.push(uCyl(G.cap.r, G.cap.w, uAdd(org, [G.cap.x, 0, h / 2]), URDF_NEUTRAL, axleRPY));
      cur.shapes.push(uCyl(G.cap.r, G.cap.w, uAdd(org, [-G.cap.x, 0, h / 2]), URDF_NEUTRAL, axleRPY));
      joint(jn, 'revolute', ln, uAdd(org, [0, 0, h / 2]), [1, 0, 0], uRad(p.min), uRad(p.max), 10, 2);
      pose.push([jn, uRad(c.angle ?? 0)]);
      org = [0, 0, h / 2];

    } else if (c.type === 'link') {
      /* звено — статика: отдельный сустав не нужен, форма идёт в текущее звено */
      const len = c.length ?? 1;
      cur.shapes.push(uCyl(gAvgR(GEOM.link.r), len, uAdd(org, [0, 0, len / 2]), ty.color));
      org = uAdd(org, [0, 0, len]);

    } else if (c.type === 'offset') {
      const len = c.length ?? 0.5, G = GEOM.offset;
      cur.shapes.push(uBox([G.block, G.block, G.block], uAdd(org, [0, 0, G.block / 2]), ty.color));
      cur.shapes.push(uBox([G.arm.w, len + G.arm.extra, G.arm.h], uAdd(org, [0, -len / 2, G.arm.y]), ty.color));
      org = uAdd(org, [0, -len, G.endY]);

    } else if (c.type === 'prismatic') {
      const p = ty.params.find(q => q.key === 'ext'), len = c.length ?? 0.7;
      cur.shapes.push(uCyl(gAvgR(GEOM.prismatic.body), len, uAdd(org, [0, 0, len / 2]), ty.color));
      const L = joint(jn, 'prismatic', ln, org, [0, 0, 1],
        p.min * URDF_SCALE, paramMax(c, p) * URDF_SCALE, 100, 0.5);
      pose.push([jn, Math.min(c.ext ?? p.def, len) * URDF_SCALE]);
      L.shapes.push(uCyl(GEOM.prismatic.rod, len, [0, 0, len / 2], URDF_NEUTRAL));
      org = [0, 0, len];

    } else if (c.type === 'spherical') {
      /* шарового сустава в URDF нет: два revolute + промежуточное звено */
      const [pPitch, pYaw] = ty.params, G = GEOM.spherical;
      cur.shapes.push(uCyl(gAvgR(G.socket.r), G.socket.h, uAdd(org, [0, 0, G.socket.h / 2]), URDF_NEUTRAL));
      cur.shapes.push(uSph(G.ball.r, uAdd(org, [0, 0, G.ball.y]), ty.color));
      joint(`joint_${k}_ball_yaw`, 'revolute', `link_${k}_ball_yaw`,
        uAdd(org, [0, 0, G.ball.y]), [0, 0, 1], uRad(pYaw.min), uRad(pYaw.max), 10, 2);
      pose.push([`joint_${k}_ball_yaw`, uRad(c.yaw ?? 0)]);
      const L = joint(`joint_${k}_ball_pitch`, `revolute`, `link_${k}_ball`,
        [0, 0, 0], [1, 0, 0], uRad(pPitch.min), uRad(pPitch.max), 10, 2);
      pose.push([`joint_${k}_ball_pitch`, uRad(c.pitch ?? 0)]);
      L.shapes.push(uCyl(G.stub.r, G.stub.len, [0, 0, G.stub.len / 2], URDF_NEUTRAL));
      org = [0, 0, G.stub.len];

    } else if (c.type === 'rail') {
      const p = ty.params[0], G = GEOM.rail;
      cur.shapes.push(uBox([G.track[0], G.track[2], G.track[1]], uAdd(org, [0, 0, G.track[1] / 2]), URDF_NEUTRAL));
      const L = joint(jn, 'prismatic', ln, org, [1, 0, 0],
        p.min * URDF_SCALE, p.max * URDF_SCALE, 200, 0.5);
      pose.push([jn, (c.pos ?? 0) * URDF_SCALE]);
      L.shapes.push(uBox([G.car[0], G.car[2], G.car[1]], [0, 0, G.carY], ty.color));
      org = [0, 0, G.attach];

    } else if (c.type === 'gripper') {
      /* пальцы — две призматические оси; правая повторяет левую через mimic */
      const base = cur, at = org, G = GEOM.gripper, gMin = G.gap0, gMax = G.gap0 + G.gapRange;
      const gap = gripGap(c);
      const finger = [G.finger[0], G.finger[2], G.finger[1]];
      cur.shapes.push(uBox([G.palm[0], G.palm[2], G.palm[1]], uAdd(org, [0, 0, G.palm[1] / 2]), URDF_NEUTRAL));
      const lj = `joint_${k}_finger_left`;
      joint(lj, 'prismatic', `link_${k}_finger_left`, at, [1, 0, 0],
        gMin * URDF_SCALE, gMax * URDF_SCALE, 20, 0.05)
        .shapes.push(uBox(finger, [0, 0, G.fingerY], ty.color));
      pose.push([lj, gap * URDF_SCALE]);
      cur = base;
      const rj = `joint_${k}_finger_right`;
      joint(rj, 'prismatic', `link_${k}_finger_right`, at, [-1, 0, 0],
        gMin * URDF_SCALE, gMax * URDF_SCALE, 20, 0.05, lj)
        .shapes.push(uBox(finger, [0, 0, G.fingerY], ty.color));
      pose.push([rj, gap * URDF_SCALE]);
      cur = base;
      org = uAdd(at, [0, 0, ty.height]);

    } else if (c.type === 'suction') {
      const G = GEOM.suction;
      cur.shapes.push(uCyl(gAvgR(G.body.r), G.body.h, uAdd(org, [0, 0, G.body.h / 2]), URDF_NEUTRAL));
      /* конуса в URDF нет — манжета приближена цилиндром (без учёта присоса) */
      cur.shapes.push(uCyl(G.cup.r, G.cup.h, uAdd(org, [0, 0, G.body.h + G.cup.h / 2]), ty.color));
      org = uAdd(org, [0, 0, G.attach]);

    } else if (c.type === 'drill' || c.type === 'mill') {
      /* шпиндель крутится без ограничений — continuous */
      const base = cur, drill = c.type === 'drill', GD = GEOM.drill, GM = GEOM.mill;
      const holder = drill ? GD.body : GM.stem; // корпус дрели / шток фрезы — до шпинделя
      const at = uAdd(org, [0, 0, drill ? GD.body.h : GM.spinY]);
      const sj = `joint_${k}_spindle`;
      cur.shapes.push(uCyl(gAvgR(holder.r), holder.h, uAdd(org, [0, 0, holder.h / 2]), URDF_NEUTRAL));
      const L = joint(sj, 'continuous', `link_${k}_${drill ? 'bit' : 'cutter'}`,
        at, [0, 0, 1], null, null, 3, 30);
      pose.push([sj, 0]);
      if (drill) {
        L.shapes.push(uCyl(gAvgR(GD.bit.r), GD.bit.len, [0, 0, GD.bit.len / 2], ty.color));
        L.shapes.push(uBox([GD.flute[0], GD.flute[2], GD.flute[1]], [0, 0, GD.fluteY], URDF_NEUTRAL));
      } else {
        const T = GM.teeth;
        L.shapes.push(uCyl(GM.disk.r, GM.disk.h, [0, 0, 0], ty.color));
        for (let q = 0; q < T.n; q++) {
          const a = q / T.n * Math.PI * 2;
          L.shapes.push(uBox([T.size, T.size, T.size],
            [Math.cos(a) * T.r, -Math.sin(a) * T.r, 0], ty.color, [0, 0, -a]));
        }
      }
      cur = base;
      org = uAdd(org, [0, 0, drill ? GD.attach : GM.attach]);
    }
  });

  /* Рабочая точка на конце руки — общепринятый tool0 из ROS-Industrial */
  joint('joint_tool0', 'fixed', 'tool0', org, null);

  const links = nodes.filter(n => n.link).map(n => n.link);
  const materials = [...new Set(links.flatMap(L => L.shapes.map(s => s.col)))].map(col => {
    const rgb = [16, 8, 0].map(sh => (((col >> sh) & 255) / 255).toFixed(3));
    return `  <material name="${uMatName(col)}">\n    <color rgba="${rgb.join(' ')} 1"/>\n  </material>`;
  }).join('\n');

  const body = nodes.map(n => n.xml ?? (
    `  <link name="${n.link.name}">\n${uInertial(n.link.shapes)}`
    + (n.link.shapes.length ? n.link.shapes.map(uShape).join('\n') + '\n' : '')
    + '  </link>'
  )).join('\n');

  const head = [
    `  Generated by Robo-Arm Builder v${VERSION} — ${armName().en}`,
    `  Source configuration: ${shareURL()}`,
    '',
    `  Units: meters, radians (1 builder unit = ${URDF_SCALE} m); Z points along the arm.`,
    `  Masses, inertias and joint effort/velocity are estimates (uniform density`,
    `  ${URDF_DENSITY} kg/m^3) — replace them with real values from the datasheets`,
    '  of the parts you actually buy (see the BOM tab).',
    '',
    '  Current pose (joint positions, rad / m):',
    ...(pose.length ? pose.map(([nm, v]) => `    ${nm} = ${uNum(v)}`) : ['    (no movable joints)']),
  ].join('\n');

  return `<?xml version="1.0"?>\n<!--\n${head}\n-->\n<robot name="${urdfName()}">\n`
       + (materials ? materials + '\n' : '') + body + '\n</robot>\n';
}

/* Невидимую вкладку не пересобираем — при переключении на неё вызов повторится */
function updateURDFView() {
  if (!urdfPane.classList.contains('active')) return;
  urdfText.value = buildURDF();
}

document.getElementById('btnUrdfCopy').onclick = async () => {
  if (await copyText(buildURDF())) flashStatus(urdfStatus, t('copied'), 'ok');
};

/* Сохранение файла: blob-ссылка работает и с file://; если браузер запретил —
   остаётся кнопка «Копировать» */
document.getElementById('btnUrdfSave').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buildURDF()], { type: 'application/xml' }));
  a.download = urdfName() + '.urdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  flashStatus(urdfStatus, t('saved'), 'ok');
};
