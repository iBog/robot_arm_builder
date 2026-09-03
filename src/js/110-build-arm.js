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

function mat(color, roughness = 0.45, metalness = 0.35) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function decorative(mesh) {
  mesh.userData.decorative = true;
  return mesh;
}

/* ---- Форма деталей по стилю (STYLE, см. 045-style.js) ----
   Скруглённые геометрии получают type/parameters цилиндра или коробки тех же габаритов:
   так их видят armCapsules() (столкновения) и золотой снимок; кинематика от стиля не зависит. */

/* цилиндр; при fillet > 0 — тело вращения со скруглёнными рёбрами */
function cylGeo(rTop, rBot, h, seg = 24) {
  const rr = Math.min(rTop, rBot, h / 2) * STYLE.fillet;
  if (rr < 0.01) return new THREE.CylinderGeometry(rTop, rBot, h, seg);
  const pts = [new THREE.Vector2(0, -h / 2)], N = 5;
  for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + i / N * Math.PI / 2; pts.push(new THREE.Vector2(rBot - rr + Math.cos(a) * rr, -h / 2 + rr + Math.sin(a) * rr)); }
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI / 2; pts.push(new THREE.Vector2(rTop - rr + Math.cos(a) * rr, h / 2 - rr + Math.sin(a) * rr)); }
  pts.push(new THREE.Vector2(0, h / 2));
  const g = new THREE.LatheGeometry(pts, seg);
  g.type = 'CylinderGeometry';
  g.parameters = { radiusTop: rTop, radiusBottom: rBot, height: h };
  return g;
}
/* коробка; при boxRadius > 0 — со скруглёнными рёбрами (выдавливание с фаской) */
function boxGeo(w, h, d) {
  if (!STYLE.boxRadius) return new THREE.BoxGeometry(w, h, d);
  const r = Math.min(w, h, d) * STYLE.boxRadius / 2, iw = w / 2 - r, ih = h / 2 - r, cr = r * 0.6;
  const sh = new THREE.Shape();
  sh.moveTo(-iw + cr, -ih);
  sh.lineTo(iw - cr, -ih); sh.absarc(iw - cr, -ih + cr, cr, -Math.PI / 2, 0, false);
  sh.lineTo(iw, ih - cr); sh.absarc(iw - cr, ih - cr, cr, 0, Math.PI / 2, false);
  sh.lineTo(-iw + cr, ih); sh.absarc(-iw + cr, ih - cr, cr, Math.PI / 2, Math.PI, false);
  sh.lineTo(-iw, -ih + cr); sh.absarc(-iw + cr, -ih + cr, cr, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 5 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  g.type = 'BoxGeometry';
  g.parameters = { width: w, height: h, depth: d };
  return g;
}

/* плоская скруглённая пластина в XY; нужна для печатных звеньев и их вставок */
function plateGeo(w, h, d, radius = w / 2) {
  const r = Math.min(radius, w / 2, h / 2), x = w / 2, y = h / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-x + r, -y);
  sh.lineTo(x - r, -y); sh.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  sh.lineTo(x, y - r); sh.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  sh.lineTo(-x + r, y); sh.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  sh.lineTo(-x, -y + r); sh.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  const bevel = Math.min(d * 0.18, r * 0.15), depth = Math.max(0.005, d - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(sh, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8,
  });
  g.translate(0, 0, -depth / 2);
  g.type = 'BoxGeometry';
  g.parameters = { width: w, height: h, depth: d };
  return g;
}

function bodyMat(color) {
  if (STYLE.shell) return mat(SCN.shell, 0.22, 0.08);
  if (STYLE.panels) return mat(color, 0.72, 0.05);
  return mat(color);
}
function housingMat() {
  if (STYLE.shell) return mat(SCN.shell, 0.22, 0.08);
  if (STYLE.panels) return mat(SCN.joint, 0.72, 0.05);
  return mat(SCN.joint);
}
function metalMat() { return mat(SCN.metal, 0.24, 0.82); }

/* головка винта с шайбой; ось направлена вдоль локальной Z */
function fastenerMesh(radius = 0.035) {
  const g = new THREE.Group();
  const washer = decorative(new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, radius * 0.18, 7, 16), metalMat()));
  const head = decorative(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, radius * 0.24, 12), mat(SCN.fastener, 0.28, 0.75)));
  head.rotation.x = Math.PI / 2;
  const socket = decorative(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, radius * 0.27, 10), mat(SCN.inset, 0.5, 0.25)));
  socket.rotation.x = Math.PI / 2;
  g.add(washer, head, socket);
  return g;
}

/* металлический воротник поперёк вертикального корпуса */
function collarMesh(radius, width = 0.035) {
  return decorative(shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.015, radius * 1.015, width, 32), metalMat(),
  )));
}

/* NEMA-подобный мотор: квадратный корпус, передняя плита, вал и четыре винта */
function motorMesh(size) {
  const g = new THREE.Group(), depth = size * 1.3;
  g.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(size, size, depth), mat(SCN.motor, 0.58, 0.28))));
  const face = decorative(shadowed(new THREE.Mesh(new THREE.BoxGeometry(size * 0.88, size * 0.88, size * 0.08), metalMat())));
  face.position.z = depth / 2 + size * 0.04;
  g.add(face);
  const boss = decorative(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.16, size * 0.16, size * 0.12, 20), metalMat())));
  boss.rotation.x = Math.PI / 2; boss.position.z = depth / 2 + size * 0.12;
  g.add(boss);
  if (STYLE.fasteners) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const screw = fastenerMesh(size * 0.055);
    screw.position.set(sx * size * 0.31, sy * size * 0.31, depth / 2 + size * 0.085);
    g.add(screw);
  }
  return g;
}

/* ступица печатной оси: утопленное кольцо, металлический подшипник и винт */
function hubMesh(r) {
  const g = new THREE.Group();
  g.add(decorative(new THREE.Mesh(new THREE.TorusGeometry(r * 0.58, r * 0.11, 8, 24), mat(SCN.inset, 0.7, 0.08))));
  const core = decorative(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.27, r * 0.27, r * 0.16, 20), metalMat()));
  core.rotation.x = Math.PI / 2;
  g.add(core);
  const bolt = fastenerMesh(r * 0.16);
  bolt.position.z = r * 0.09;
  g.add(bolt);
  return g;
}

/* отделка турели: печатные канавки либо металлические стыки кожуха и внешний мотор */
function styleTrim(pivot, r, h) {
  if (STYLE.hub) {
    for (const y of [h * 0.23, h * 0.77]) {
      const ring = decorative(new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.018, 7, 32), mat(SCN.inset, 0.72, 0.08)));
      ring.rotation.x = Math.PI / 2; ring.position.y = y;
      pivot.add(ring);
    }
  }
  if (STYLE.collars) {
    for (const y of [h * 0.16, h * 0.84]) {
      const collar = collarMesh(r * 1.015, 0.032); collar.position.y = y;
      pivot.add(collar);
    }
  }
  if (STYLE.motors) {
    const m = motorMesh(r * 0.7);
    m.rotation.y = Math.PI / 2;
    m.position.set(-r * 1.28, h * 0.45, 0);
    pivot.add(m);
  }
}

/* звено длиной len вдоль +Y: исходный цилиндр, печатная щека или закрытая капсула */
function linkMesh(len, color) {
  const [r0, r1] = GEOM.link.r, rr = (r0 + r1) / 2;
  if (STYLE.link === 'cyl') {
    const m = shadowed(new THREE.Mesh(cylGeo(r0, r1, len, 20), bodyMat(color)));
    m.position.y = len / 2;
    return m;
  }

  const g = new THREE.Group();
  if (STYLE.link === 'lozenge') {
    const width = rr * 2.45, depth = rr * 1.3;
    const body = shadowed(new THREE.Mesh(plateGeo(width, len, depth), bodyMat(color)));
    body.position.y = len / 2;
    g.add(body);

    if (STYLE.panels && len > width * 1.2) {
      const panelH = len - width * 1.18;
      const panel = decorative(new THREE.Mesh(plateGeo(width * 0.54, panelH, 0.018, width * 0.16), mat(SCN.inset, 0.78, 0.05)));
      panel.position.set(0, len / 2, depth / 2 + 0.008);
      g.add(panel);
    }
    for (const y of [width / 2, len - width / 2]) {
      const boss = decorative(shadowed(new THREE.Mesh(
        new THREE.CylinderGeometry(width * 0.43, width * 0.43, depth * 1.08, 28), bodyMat(color),
      )));
      boss.rotation.x = Math.PI / 2; boss.position.y = y;
      g.add(boss);
      const bolt = fastenerMesh(width * 0.12);
      bolt.position.set(0, y, depth * 0.57);
      g.add(bolt);
    }
  } else {
    const rc = rr * 1.15;
    const bodyGeo = new THREE.CapsuleGeometry(rc, Math.max(0.01, len - 2 * rc), 6, 24);
    bodyGeo.type = 'CylinderGeometry';
    bodyGeo.parameters = { radiusTop: rc, radiusBottom: rc, height: len };
    const body = shadowed(new THREE.Mesh(bodyGeo, bodyMat(color)));
    body.position.y = len / 2;
    g.add(body);
    if (STYLE.collars) for (const y of [rc * 0.78, len - rc * 0.78]) {
      const collar = collarMesh(rc * 1.01, 0.028); collar.position.y = y;
      g.add(collar);
    }
  }
  return g;
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

  /* Неподвижное основание: цилиндр; в стиле «Гладкий» — квадратный фланец с отверстиями + тумба */
  const base = new THREE.Group();
  if (STYLE.flange) {
    const B = GEOM.base, plateH = 0.08, side = B.r[1] * 2.3;
    const plate = shadowed(new THREE.Mesh(boxGeo(side, plateH, side), mat(SCN.base)));
    plate.position.y = plateH / 2;
    base.add(plate);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const bolt = fastenerMesh(0.06);
      bolt.rotation.x = -Math.PI / 2;
      bolt.position.set(sx * B.r[1] * 0.95, plateH + 0.005, sz * B.r[1] * 0.95);
      base.add(bolt);
    }
    const ped = shadowed(new THREE.Mesh(cylGeo(B.r[0], B.r[1] * 0.85, B.h - plateH, 32), mat(SCN.base)));
    ped.position.y = plateH + (B.h - plateH) / 2;
    base.add(ped);
  } else {
    base.add(shadowed(new THREE.Mesh(cylGeo(...GEOM.base.r, GEOM.base.h, 32), STYLE.shell ? bodyMat(SCN.base) : mat(SCN.base))));
    base.children[0].position.y = GEOM.base.h / 2;
    if (STYLE.collars) for (const y of [0.035, GEOM.base.h - 0.035]) {
      const collar = collarMesh(GEOM.base.r[1], 0.035); collar.position.y = y;
      base.add(collar);
    }
  }
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
      const body = shadowed(new THREE.Mesh(cylGeo(...G.body, t.height, 28), bodyMat(t.color)));
      body.position.y = t.height / 2;
      pivot.add(body);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(G.mark.w, t.height * G.mark.hFrac, G.mark.d), mat(STYLE.shell ? t.color : SCN.mark));
      mark.position.set(0, t.height / 2, G.mark.z);
      pivot.add(mark);
      styleTrim(pivot, G.body[1], t.height);
      pivot.rotation.y = THREE.MathUtils.degToRad(c.angle ?? 0);
      makeZone(c, parent, attachY);
      parent = pivot;
      attachY = t.height;

    } else if (c.type === 'pitch') {
      /* корпус-ось лежит горизонтально; вращение вокруг X */
      const G = GEOM.pitch;
      const axle = shadowed(new THREE.Mesh(cylGeo(G.axle.r, G.axle.r, G.axle.len, 24), bodyMat(t.color)));
      axle.rotation.z = Math.PI / 2;
      axle.position.y = t.height / 2;
      const cap1 = new THREE.Mesh(cylGeo(G.cap.r, G.cap.r, G.cap.w, 24), STYLE.shell ? bodyMat(t.color) : housingMat());
      cap1.rotation.z = Math.PI / 2; cap1.position.set(G.cap.x, t.height / 2, 0);
      const cap2 = cap1.clone(); cap2.position.x = -G.cap.x;
      /* внутренняя группа вращается вокруг оси */
      const rot = new THREE.Group();
      rot.position.y = t.height / 2;
      pivot.add(axle, cap1, cap2, rot);
      if (STYLE.hub) for (const sx of [1, -1]) { // ступицы на торцах оси
        const hub = hubMesh(G.cap.r); hub.rotation.y = sx * Math.PI / 2;
        hub.position.set(sx * (G.cap.x + G.cap.w / 2 + 0.005), t.height / 2, 0);
        pivot.add(hub);
      }
      if (STYLE.motors) { // мотор на торце оси
        const m = motorMesh(G.cap.r * 1.1); m.rotation.y = Math.PI / 2;
        m.position.set(-(G.cap.x + G.cap.w / 2 + G.cap.r * 0.7), t.height / 2, 0);
        pivot.add(m);
        for (const sx of [1, -1]) {
          const collar = collarMesh(G.cap.r * 1.02, G.cap.w * 0.5);
          collar.rotation.z = Math.PI / 2;
          collar.position.set(sx * (G.cap.x + G.cap.w * 0.55), t.height / 2, 0);
          pivot.add(collar);
        }
      }
      rot.rotation.x = THREE.MathUtils.degToRad(c.angle ?? 0);
      c._rot = rot;
      makeZone(c, pivot, 0);
      parent = rot;
      attachY = t.height / 2;

    } else if (c.type === 'roll') {
      const G = GEOM.roll;
      const body = shadowed(new THREE.Mesh(cylGeo(...G.body, t.height, 24), bodyMat(t.color)));
      body.position.y = t.height / 2;
      pivot.add(body);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(G.mark.w, t.height * G.mark.hFrac, G.mark.d), mat(STYLE.shell ? t.color : SCN.mark));
      mark.position.set(0, t.height / 2, G.mark.z);
      pivot.add(mark);
      styleTrim(pivot, G.body[1], t.height);
      pivot.rotation.y = THREE.MathUtils.degToRad(c.angle ?? 0);
      makeZone(c, parent, attachY);
      parent = pivot;
      attachY = t.height;

    } else if (c.type === 'link') {
      const len = c.length ?? 1;
      pivot.add(linkMesh(len, t.color));
      makeZone(c, pivot, 0);
      parent = pivot;
      attachY = len;

    } else if (c.type === 'gripper') {
      const G = GEOM.gripper;
      const palm = shadowed(new THREE.Mesh(boxGeo(...G.palm), housingMat()));
      palm.position.y = G.palm[1] / 2;
      pivot.add(palm);
      const fGeo = boxGeo(...G.finger);
      const f1 = shadowed(new THREE.Mesh(fGeo, bodyMat(t.color)));
      const f2 = shadowed(new THREE.Mesh(fGeo, bodyMat(t.color)));
      f1.position.y = f2.position.y = G.fingerY;
      pivot.add(f1, f2);
      if (STYLE.fasteners) for (const sx of [-1, 1]) {
        const bolt = fastenerMesh(0.038);
        bolt.position.set(sx * 0.17, G.palm[1] / 2, G.palm[2] / 2 + 0.01);
        pivot.add(bolt);
      }
      c._fingers = [f1, f2];
      applyGripper(c);
      makeZone(c, pivot, 0);
      parent = pivot;
      attachY = t.height;

    } else if (c.type === 'prismatic') {
      /* телескопический линейный привод: шток выдвигается вдоль оси */
      const L = c.length ?? 0.7;
      const outer = shadowed(new THREE.Mesh(cylGeo(...GEOM.prismatic.body, L, 20), bodyMat(t.color)));
      outer.position.y = L / 2;
      pivot.add(outer);
      if (STYLE.collars) for (const y of [0.04, L - 0.04]) {
        const collar = collarMesh(GEOM.prismatic.body[1], 0.035); collar.position.y = y;
        pivot.add(collar);
      }
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
      const socket = shadowed(new THREE.Mesh(cylGeo(...G.socket.r, G.socket.h, 24), housingMat()));
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
      const vert = shadowed(new THREE.Mesh(boxGeo(G.block, G.block, G.block), bodyMat(t.color)));
      vert.position.y = G.block / 2;
      const horiz = shadowed(new THREE.Mesh(boxGeo(G.arm.w, G.arm.h, len + G.arm.extra), bodyMat(t.color)));
      horiz.position.set(0, G.arm.y, len / 2);
      pivot.add(vert, horiz);
      if (STYLE.panels && len > 0.3) {
        const panel = decorative(new THREE.Mesh(boxGeo(0.014, G.arm.h * 0.5, len * 0.62), mat(SCN.inset, 0.78, 0.05)));
        panel.position.set(G.arm.w / 2 + 0.006, G.arm.y, len / 2);
        pivot.add(panel);
      }
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
      const carBody = shadowed(new THREE.Mesh(boxGeo(...G.car), bodyMat(t.color)));
      carBody.position.y = G.carY;
      car.add(carBody);
      if (STYLE.motors) {
        const m = motorMesh(0.28); m.rotation.y = -Math.PI / 2;
        m.position.set(-G.car[0] * 0.65, G.carY, 0);
        car.add(m);
      }
      car.position.x = c.pos ?? 0;
      pivot.add(car);
      c._car = car;
      makeZone(c, pivot, 0);
      parent = car;
      attachY = G.attach;

    } else if (c.type === 'suction') {
      /* вакуумная присоска: сила присоса сжимает манжету */
      const G = GEOM.suction;
      const body = shadowed(new THREE.Mesh(cylGeo(...G.body.r, G.body.h, 18), housingMat()));
      body.position.y = G.body.h / 2;
      pivot.add(body);
      if (STYLE.collars) {
        const collar = collarMesh(G.body.r[1], 0.025); collar.position.y = G.body.h - 0.025;
        pivot.add(collar);
      }
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
      const body = shadowed(new THREE.Mesh(cylGeo(...G.body.r, G.body.h, 20), housingMat()));
      body.position.y = G.body.h / 2;
      pivot.add(body);
      if (STYLE.collars) for (const y of [0.035, G.body.h - 0.035]) {
        const collar = collarMesh(G.body.r[1], 0.028); collar.position.y = y;
        pivot.add(collar);
      }
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
      const stem = shadowed(new THREE.Mesh(cylGeo(...G.stem.r, G.stem.h, 14), housingMat()));
      stem.position.y = G.stem.h / 2;
      pivot.add(stem);
      if (STYLE.collars) {
        const collar = collarMesh(G.stem.r[1], 0.025); collar.position.y = G.stem.h - 0.035;
        pivot.add(collar);
      }
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
