'use strict';
/* ================= Построение руки ================= */

const armRoot = new THREE.Group();
scene.add(armRoot);
/* pivots[i] — группа, чьё вращение/размер управляется слайдером компонента i */
let pivots = [];
/* конец цепочки: узел и высота в нём, куда крепился бы следующий компонент */
let tipNode = null, tipY = 0;
function armTip(out = new THREE.Vector3()) {
  if (!tipNode) return out.set(0, 0, 0);
  tipNode.updateWorldMatrix(true, false);
  return tipNode.localToWorld(out.set(0, tipY, 0));
}

function mat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 });
}
function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ---- Зоны вращения/движения (dashed motion zones) ---- */

function dashMat(color) {
  return new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: SCN.zoneLine });
}

/* Полупрозрачный сектор с пунктирной границей в плоскости XY:
   углы в градусах от локальной оси +X против часовой */
function makeSector(color, radius, startDeg, lengthDeg) {
  const g = new THREE.Group();
  const seg = Math.max(12, Math.round(lengthDeg / 5));
  const circ = new THREE.CircleGeometry(radius, seg,
    THREE.MathUtils.degToRad(startDeg), THREE.MathUtils.degToRad(lengthDeg));
  const fill = new THREE.Mesh(circ, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: SCN.zoneFill, side: THREE.DoubleSide, depthWrite: false,
  }));
  g.add(fill);
  const pts = [];
  const full = lengthDeg >= 359.9;
  if (!full) pts.push(new THREE.Vector3(0, 0, 0));
  for (let i = 0; i <= seg; i++) {
    const a = THREE.MathUtils.degToRad(startDeg + lengthDeg * i / seg);
    pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  if (!full) pts.push(new THREE.Vector3(0, 0, 0));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), dashMat(color));
  line.computeLineDistances();
  g.add(line);
  return g;
}

/* цвет зоны: цвет типа, приведённый к фону текущей темы */
const _zoneCol = new THREE.Color(), _hsl = {};
function zoneColor(hex) {
  if (SCN.zoneShade === 1 && SCN.zoneSat === 1) return hex;
  _zoneCol.setHex(hex).getHSL(_hsl);
  return _zoneCol.setHSL(_hsl.h, Math.min(1, _hsl.s * SCN.zoneSat), _hsl.l * SCN.zoneShade).getHex();
}

function makeDashedLine(color, points) {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), dashMat(color));
  line.computeLineDistances();
  return line;
}

/* Создаёт зону для компонента и добавляет её в нужный узел.
   holder — узел, который НЕ вращается вместе с суставом (зона показывает диапазон). */
function makeZone(c, holder, attachY) {
  const t = TYPES[c.type];
  const p = t.params[0];
  const col = zoneColor(t.color); // цвет типа, подогнанный под фон темы
  const zone = new THREE.Group();

  if (c.type === 'yaw' || c.type === 'roll') {
    /* горизонтальный диск в плоскости вращения (вокруг вертикальной оси) */
    const r = c.type === 'yaw' ? 0.72 : 0.5;
    const sector = makeSector(col, r, p.min - 90, p.max - p.min);
    sector.rotation.x = -Math.PI / 2;
    zone.add(sector);
    zone.position.y = attachY + (t.height ?? 0) / 2;
  } else if (c.type === 'pitch') {
    /* вертикальный сектор в плоскости качания (перпендикулярно оси сустава) */
    const sector = makeSector(col, 0.8, 90 - p.max, p.max - p.min);
    sector.rotation.y = -Math.PI / 2;
    zone.add(sector);
    zone.position.y = attachY + t.height / 2;
  } else if (c.type === 'link') {
    /* пунктир диапазона длины звена вдоль оси */
    zone.add(makeDashedLine(col, [
      new THREE.Vector3(0, p.min, 0), new THREE.Vector3(0, p.max, 0),
    ]));
    zone.add(makeDashedLine(col, [
      new THREE.Vector3(-0.12, p.max, 0), new THREE.Vector3(0.12, p.max, 0),
    ]));
    zone.position.y = attachY;
  } else if (c.type === 'gripper') {
    /* пунктир хода пальцев схвата */
    const y = GEOM.gripper.fingerY, xMax = GEOM.gripper.gap0 + GEOM.gripper.gapRange + 0.06;
    zone.add(makeDashedLine(col, [
      new THREE.Vector3(-xMax, y, 0), new THREE.Vector3(xMax, y, 0),
    ]));
    zone.add(makeDashedLine(col, [new THREE.Vector3(-xMax, y - 0.12, 0), new THREE.Vector3(-xMax, y + 0.12, 0)]));
    zone.add(makeDashedLine(col, [new THREE.Vector3(xMax, y - 0.12, 0), new THREE.Vector3(xMax, y + 0.12, 0)]));
    zone.position.y = attachY;
  } else if (c.type === 'prismatic') {
    /* пунктир хода конца штока: от длины корпуса до удвоенной */
    const x = 0.3, L = c.length ?? 0.7;
    zone.add(makeDashedLine(col, [new THREE.Vector3(x, L, 0), new THREE.Vector3(x, 2 * L, 0)]));
    zone.add(makeDashedLine(col, [new THREE.Vector3(x - 0.1, L, 0), new THREE.Vector3(x + 0.1, L, 0)]));
    zone.add(makeDashedLine(col, [new THREE.Vector3(x - 0.1, 2 * L, 0), new THREE.Vector3(x + 0.1, 2 * L, 0)]));
  } else if (c.type === 'spherical') {
    /* два диапазона: диск yaw + вертикальный сектор pitch */
    const pPitch = t.params[0], pYaw = t.params[1];
    const disc = makeSector(col, 0.5, pYaw.min - 90, pYaw.max - pYaw.min);
    disc.rotation.x = -Math.PI / 2;
    const sector = makeSector(col, 0.62, 90 - pPitch.max, pPitch.max - pPitch.min);
    sector.rotation.y = -Math.PI / 2;
    zone.add(disc, sector);
    zone.position.y = 0.32;
  } else if (c.type === 'rail') {
    /* пунктир хода каретки по рельсу */
    const y = 0.34;
    zone.add(makeDashedLine(col, [
      new THREE.Vector3(p.min, y, 0), new THREE.Vector3(p.max, y, 0),
    ]));
    zone.add(makeDashedLine(col, [new THREE.Vector3(p.min, y - 0.12, 0), new THREE.Vector3(p.min, y + 0.12, 0)]));
    zone.add(makeDashedLine(col, [new THREE.Vector3(p.max, y - 0.12, 0), new THREE.Vector3(p.max, y + 0.12, 0)]));
  }

  zone.userData.zone = true; // не деталь руки: не участвует в столкновениях с полом
  zone.visible = c.showZone !== false;
  c._zone = zone;
  holder.add(zone);
}

function buildArm() {
  armRoot.clear();
  pivots = [];
  capsFrame = null; // капсулы столкновений пересчитать

  /* Неподвижное основание */
  const base = new THREE.Group();
  base.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(...GEOM.base.r, GEOM.base.h, 32), mat(SCN.base))));
  base.children[0].position.y = GEOM.base.h / 2;
  armRoot.add(base);

  let parent = base;        // группа, к которой крепим следующий компонент
  let attachY = GEOM.base.h; // высота точки крепления в системе parent

  for (const c of components) {
    const t = TYPES[c.type];
    const pivot = new THREE.Group();
    pivot.position.y = attachY;
    parent.add(pivot);
    pivots.push(pivot);

    if (c.type === 'yaw') {
      const G = GEOM.yaw;
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(...G.body, t.height, 28), mat(t.color)));
      body.position.y = t.height / 2;
      pivot.add(body);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(G.mark.w, t.height * G.mark.hFrac, G.mark.d), mat(SCN.mark));
      mark.position.set(0, t.height / 2, G.mark.z);
      pivot.add(mark);
      pivot.rotation.y = THREE.MathUtils.degToRad(c.angle ?? 0);
      makeZone(c, parent, attachY);
      parent = pivot;
      attachY = t.height;

    } else if (c.type === 'pitch') {
      /* корпус-ось лежит горизонтально; вращение вокруг X */
      const G = GEOM.pitch;
      const axle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(G.axle.r, G.axle.r, G.axle.len, 24), mat(t.color)));
      axle.rotation.z = Math.PI / 2;
      axle.position.y = t.height / 2;
      const cap1 = new THREE.Mesh(new THREE.CylinderGeometry(G.cap.r, G.cap.r, G.cap.w, 24), mat(SCN.joint));
      cap1.rotation.z = Math.PI / 2; cap1.position.set(G.cap.x, t.height / 2, 0);
      const cap2 = cap1.clone(); cap2.position.x = -G.cap.x;
      /* внутренняя группа вращается вокруг оси */
      const rot = new THREE.Group();
      rot.position.y = t.height / 2;
      pivot.add(axle, cap1, cap2, rot);
      rot.rotation.x = THREE.MathUtils.degToRad(c.angle ?? 0);
      c._rot = rot;
      makeZone(c, pivot, 0);
      parent = rot;
      attachY = t.height / 2;

    } else if (c.type === 'roll') {
      const G = GEOM.roll;
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(...G.body, t.height, 24), mat(t.color)));
      body.position.y = t.height / 2;
      pivot.add(body);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(G.mark.w, t.height * G.mark.hFrac, G.mark.d), mat(SCN.mark));
      mark.position.set(0, t.height / 2, G.mark.z);
      pivot.add(mark);
      pivot.rotation.y = THREE.MathUtils.degToRad(c.angle ?? 0);
      makeZone(c, parent, attachY);
      parent = pivot;
      attachY = t.height;

    } else if (c.type === 'link') {
      const len = c.length ?? 1;
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(...GEOM.link.r, 1, 20), mat(t.color)));
      body.position.y = 0.5;
      const linkScale = new THREE.Group();
      linkScale.add(body);
      linkScale.scale.y = len;
      pivot.add(linkScale);
      c._scale = linkScale;
      makeZone(c, pivot, 0);
      parent = pivot;
      attachY = len;

    } else if (c.type === 'gripper') {
      const G = GEOM.gripper;
      const palm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(...G.palm), mat(SCN.joint)));
      palm.position.y = G.palm[1] / 2;
      pivot.add(palm);
      const fGeo = new THREE.BoxGeometry(...G.finger);
      const f1 = shadowed(new THREE.Mesh(fGeo, mat(t.color)));
      const f2 = shadowed(new THREE.Mesh(fGeo, mat(t.color)));
      f1.position.y = f2.position.y = G.fingerY;
      pivot.add(f1, f2);
      c._fingers = [f1, f2];
      applyGripper(c);
      makeZone(c, pivot, 0);
      parent = pivot;
      attachY = t.height;

    } else if (c.type === 'prismatic') {
      /* телескопический линейный привод: шток выдвигается вдоль оси */
      const L = c.length ?? 0.7;
      const outer = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(...GEOM.prismatic.body, L, 20), mat(t.color)));
      outer.position.y = L / 2;
      pivot.add(outer);
      /* шток той же длины: втянутый прячется в корпусе, выдвигается не дальше него */
      const rod = new THREE.Group();
      const rodMesh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(GEOM.prismatic.rod, GEOM.prismatic.rod, L, 16), mat(SCN.metal)));
      rodMesh.position.y = L / 2;
      rod.add(rodMesh);
      rod.position.y = Math.min(c.ext ?? 0.4, L);
      pivot.add(rod);
      c._rod = rod;
      makeZone(c, pivot, 0);
      parent = rod;
      attachY = L;

    } else if (c.type === 'spherical') {
      /* шаровой шарнир: два вращения (yaw + pitch) в одном узле */
      const G = GEOM.spherical;
      const socket = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(...G.socket.r, G.socket.h, 24), mat(SCN.joint)));
      socket.position.y = G.socket.h / 2;
      const ball = shadowed(new THREE.Mesh(new THREE.SphereGeometry(G.ball.r, 24, 18), mat(t.color)));
      ball.position.y = G.ball.y;
      pivot.add(socket, ball);
      const g1 = new THREE.Group(); g1.position.y = G.ball.y;
      const g2 = new THREE.Group();
      const stub = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(G.stub.r, G.stub.r, G.stub.len, 14), mat(SCN.metal)));
      stub.position.y = G.stub.len / 2;
      g2.add(stub);
      g1.add(g2);
      pivot.add(g1);
      g1.rotation.y = THREE.MathUtils.degToRad(c.yaw ?? 0);
      g2.rotation.x = THREE.MathUtils.degToRad(c.pitch ?? 0);
      c._g1 = g1; c._g2 = g2;
      makeZone(c, pivot, 0);
      parent = g2;
      attachY = G.stub.len;

    } else if (c.type === 'offset') {
      /* Г-образный кронштейн: боковое смещение оси */
      const len = c.length ?? 0.5, G = GEOM.offset;
      const vert = shadowed(new THREE.Mesh(new THREE.BoxGeometry(G.block, G.block, G.block), mat(t.color)));
      vert.position.y = G.block / 2;
      const horiz = shadowed(new THREE.Mesh(new THREE.BoxGeometry(G.arm.w, G.arm.h, len + G.arm.extra), mat(t.color)));
      horiz.position.set(0, G.arm.y, len / 2);
      pivot.add(vert, horiz);
      const end = new THREE.Group();
      end.position.set(0, G.endY, len);
      pivot.add(end);
      parent = end;
      attachY = 0;

    } else if (c.type === 'rail') {
      /* линейный рельс: каретка ездит вдоль X, несёт всё, что выше */
      const G = GEOM.rail;
      const track = shadowed(new THREE.Mesh(new THREE.BoxGeometry(...G.track), mat(SCN.joint)));
      track.position.y = G.track[1] / 2;
      pivot.add(track);
      const car = new THREE.Group();
      const carBody = shadowed(new THREE.Mesh(new THREE.BoxGeometry(...G.car), mat(t.color)));
      carBody.position.y = G.carY;
      car.add(carBody);
      car.position.x = c.pos ?? 0;
      pivot.add(car);
      c._car = car;
      makeZone(c, pivot, 0);
      parent = car;
      attachY = G.attach;

    } else if (c.type === 'suction') {
      /* вакуумная присоска: сила присоса сжимает манжету */
      const G = GEOM.suction;
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(...G.body.r, G.body.h, 18), mat(SCN.joint)));
      body.position.y = G.body.h / 2;
      pivot.add(body);
      const cup = shadowed(new THREE.Mesh(new THREE.ConeGeometry(G.cup.r, G.cup.h, 22), mat(t.color)));
      cup.rotation.x = Math.PI;
      pivot.add(cup);
      c._cup = cup;
      applySuction(c);
      parent = pivot;
      attachY = G.attach;

    } else if (c.type === 'drill') {
      /* дрель: корпус + вращающееся сверло; скорость крутит группу _spin */
      const G = GEOM.drill;
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(...G.body.r, G.body.h, 20), mat(SCN.joint)));
      body.position.y = G.body.h / 2;
      pivot.add(body);
      const spin = new THREE.Group();
      spin.position.y = G.body.h;
      const bit = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(...G.bit.r, G.bit.len, 10), mat(t.color)));
      bit.position.y = G.bit.len / 2;
      const flute = new THREE.Mesh(new THREE.BoxGeometry(...G.flute), mat(SCN.metal));
      flute.position.y = G.fluteY;
      spin.add(bit, flute);
      pivot.add(spin);
      c._spin = spin;
      parent = pivot;
      attachY = G.attach;

    } else if (c.type === 'mill') {
      /* фреза: шток + вращающаяся шестерня с зубьями */
      const G = GEOM.mill, T = G.teeth;
      const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(...G.stem.r, G.stem.h, 14), mat(SCN.joint)));
      stem.position.y = G.stem.h / 2;
      pivot.add(stem);
      const spin = new THREE.Group();
      spin.position.y = G.spinY;
      const disk = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(G.disk.r, G.disk.r, G.disk.h, 24), mat(t.color)));
      spin.add(disk);
      for (let k = 0; k < T.n; k++) {
        const tooth = shadowed(new THREE.Mesh(new THREE.BoxGeometry(T.size, T.size, T.size), mat(t.color)));
        const a = k / T.n * Math.PI * 2;
        tooth.position.set(Math.cos(a) * T.r, 0, Math.sin(a) * T.r);
        tooth.rotation.y = -a;
        spin.add(tooth);
      }
      pivot.add(spin);
      c._spin = spin;
      parent = pivot;
      attachY = G.attach;
    }
  }
  tipNode = parent; tipY = attachY;
  if (ikMiss) queueMicrotask(ikRetry); // рука перестроена — цель проверить заново (после renderPanel)
  updateJSONView();
  updateURDFView();
  updateBOM();
  invalidate();
  if (components.length) startHint.hidden = true; // рука уже не пуста
}

/* смещение пальца от оси по раскрытию (ширина пальца 0.09) */
function gripGap(c) { return GEOM.gripper.gap0 + (c.open ?? 50) / 100 * GEOM.gripper.gapRange; }

function applyGripper(c) {
  let gap = gripGap(c);
  /* в режиме заданий пальцы упираются в удерживаемый кубик (c._holdSize) */
  if (c._holdSize) gap = Math.max(gap, c._holdSize / 2 + GEOM.gripper.finger[0] / 2);
  c._fingers[0].position.x = gap;
  c._fingers[1].position.x = -gap;
}

function applySuction(c) {
  const squash = 1 - (c.power ?? 0) / 100 * 0.45;
  c._cup.scale.y = squash;
  c._cup.position.y = GEOM.suction.body.h + GEOM.suction.cup.h / 2 * squash;
}

/* Быстрое применение параметра без пересборки сцены;
   возвращает false, если нужна полная пересборка (link/offset) */
function applyParam3D(c, key) {
  /* габариты (build) меняют геометрию цепочки — нужна пересборка */
  if (key && TYPES[c.type].params.find(p => p.key === key)?.build) return false;
  if (c.type === 'yaw' || c.type === 'roll') {
    pivots[components.indexOf(c)].rotation.y = THREE.MathUtils.degToRad(c.angle);
  } else if (c.type === 'pitch') {
    c._rot.rotation.x = THREE.MathUtils.degToRad(c.angle);
  } else if (c.type === 'gripper') {
    applyGripper(c);
  } else if (c.type === 'prismatic') {
    c._rod.position.y = Math.min(c.ext, c.length ?? c.ext);
  } else if (c.type === 'spherical') {
    c._g1.rotation.y = THREE.MathUtils.degToRad(c.yaw ?? 0);
    c._g2.rotation.x = THREE.MathUtils.degToRad(c.pitch ?? 0);
  } else if (c.type === 'rail') {
    c._car.position.x = c.pos;
  } else if (c.type === 'suction') {
    applySuction(c);
  } else if (c.type === 'link' || c.type === 'offset') {
    /* длина меняет положение потомков — проще пересобрать */
    return false;
  }
  invalidate();
  return true;
}

function applyParam(c, key) {
  if (!applyParam3D(c, key)) { buildArm(); return; }
  updateJSONView();
  updateURDFView(); // в URDF от позы зависит только комментарий-шапка
}
