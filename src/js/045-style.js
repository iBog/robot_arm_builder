'use strict';
/* ================= Стиль оформления деталей: каркас / гладкий / корпус ================= */

/* Переключатель в шапке рядом с темой. Стиль меняет ФОРМУ деталей в 3D (buildArm() строит
   геометрию через cylGeo()/boxGeo()/linkGeo() с параметрами текущего стиля), а с ней — объём
   3D-печати и строку «3D-печать» в BOM. Кинематика, зоны, URDF, коды ссылок и столкновения
   от стиля не зависят: точки крепления те же, у скруглённых геометрий сохраняются
   `parameters` цилиндра/коробки для armCapsules(). Новый стиль — запись здесь плюс кнопка
   в #styleSw (index.html) и подпись в STR.style*. */
const STYLES = {
  /* как было: цилиндры и коробки, открытая конструкция из печатных деталей и покупного железа */
  frame:  { label: { en: 'Frame',    ru: 'Каркас' },
            fillet: 0, boxRadius: 0, link: 'cyl', hub: false, flange: false, motors: false,
            panels: false, fasteners: false, collars: false, shell: false,
            bulk: 1.0, solidity: 0.25 },
  /* печатная монолитная рука: скруглённые рёбра, плоские звенья-лепестки, ступицы на осях,
     квадратный фланец основания (референс — серый SLS-принт) */
  smooth: { label: { en: 'Smooth',   ru: 'Гладкий' },
            fillet: 0.45, boxRadius: 0.3, link: 'lozenge', hub: true, flange: true, motors: false,
            panels: true, fasteners: true, collars: false, shell: false,
            bulk: 1.25, solidity: 0.35 },
  /* закрытые белые корпуса-капсулы с выступающими блоками моторов (референс — белая
     рука с NEMA-моторами снаружи) */
  shell:  { label: { en: 'Enclosed', ru: 'Корпус' },
            fillet: 0.7, boxRadius: 0.4, link: 'capsule', hub: false, flange: false, motors: true,
            panels: false, fasteners: true, collars: true, shell: true,
            bulk: 1.6, solidity: 0.22 },
};
const STYLE_LIST = Object.keys(STYLES);
const STYLE_KEY = 'roboArmStyle';

function storedStyle() {
  try { return localStorage.getItem(STYLE_KEY); } catch { return null; }
}
const urlStyle = (urlParam('style') || '').toLowerCase();
let styleChosen = STYLE_LIST.includes(urlStyle); // стиль задан явно — уйдёт и в ссылку «Share»
let style = styleChosen ? urlStyle : STYLE_LIST.includes(storedStyle()) ? storedStyle() : 'frame';
/* STYLE — параметры текущего стиля; перечитывается в applyStyle() */
let STYLE = STYLES[style];

/* ---- Объём 3D-печати ----
   Единица сцены в BOM — PRINT_SCALE метров (настольная рука: звено 1.0 ≈ 15 см, турель ⌀11 см, NEMA 17).
   Объём напечатанных деталей компонента = «сплошной» объём его корпусных форм из GEOM ×
   bulk стиля (скруглённые и закрытые формы объёмнее) × solidity (стенки + заполнение,
   а не монолит) → см³ → граммы PLA. Покупное железо (шток, направляющая, диск фрезы,
   сверло, присоска) в объём не входит. */
const PRINT_SCALE = 0.15;    // м на единицу сцены
const PRINT_DENSITY = 1.24;  // г/см³, PLA
const PRINT_UNIT_G = 100;    // строка BOM «3D-печать: PLA, 100 г» — количество в этих единицах

/* сплошной объём печатных форм компонента в единицах сцены³ */
function partSolidVolume(c) {
  const t = TYPES[c.type], G = GEOM[c.type];
  const R = r => (Array.isArray(r) ? (r[0] + r[1]) / 2 : r);
  const cyl = (r, h) => Math.PI * R(r) ** 2 * h;
  const box = ([w, h, d]) => w * h * d;
  switch (c.type) {
    case 'yaw': case 'roll': return cyl(G.body, t.height);
    case 'pitch':     return cyl(G.axle.r, G.axle.len) + 2 * cyl(G.cap.r, G.cap.w);
    case 'link':      return cyl(G.r, c.length ?? 1);
    case 'offset':    return G.block ** 3 + G.arm.w * G.arm.h * ((c.length ?? 0.5) + G.arm.extra);
    case 'prismatic': return cyl(G.body, c.length ?? 0.7);
    case 'spherical': return cyl(G.socket.r, G.socket.h) + 4 / 3 * Math.PI * G.ball.r ** 3;
    case 'rail':      return box(G.car);
    case 'gripper':   return box(G.palm) + 2 * box(G.finger);
    case 'suction':   return cyl(G.body.r, G.body.h);
    case 'drill':     return cyl(G.body.r, G.body.h);
    case 'mill':      return cyl(G.stem.r, G.stem.h);
    default:          return 0;
  }
}
/* см³ и граммы пластика для объёма в единицах сцены³ по текущему стилю */
function printMass(solidVolume, st = STYLE) {
  const cm3 = solidVolume * st.bulk * st.solidity * (PRINT_SCALE * 100) ** 3;
  return { cm3: Math.round(cm3), grams: Math.round(cm3 * PRINT_DENSITY) };
}
function partPrint(c) { return printMass(partSolidVolume(c)); }
function basePrint() { return printMass(Math.PI * ((GEOM.base.r[0] + GEOM.base.r[1]) / 2) ** 2 * GEOM.base.h); }
/* вся рука: сумма по компонентам + основание (есть, пока рука не пуста) */
function armPrint() {
  const sum = { cm3: 0, grams: 0 };
  const add = m => { sum.cm3 += m.cm3; sum.grams += m.grams; };
  for (const c of components) add(partPrint(c));
  if (components.length) add(basePrint());
  return sum;
}
