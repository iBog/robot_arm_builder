'use strict';
/* @pure codec */
/* ---- Цифровой код руки: любой конфигурации соответствует число ----
   Формат (версия 1): первая цифра — версия, дальше на каждый компонент
   цифра-код типа (TYPES[*].code) и его параметры фиксированной ширины,
   нормированные в целое: idx = round((v - min) / step), ширина — по числу
   цифр в максимальном idx. Разделители в коде допускаются любые нецифровые
   (группы 4227-8474-... для удобной диктовки) и отсекаются перед разбором. */

/* Версии формата: 1 — типы одной цифрой (коды 0–9), 2 — типы двумя цифрами
   (00–99, для новых типов с кодами 10+), 3 — как 2, но у телескопа два параметра
   (length и ext до 2). Энкодер выбирает минимально достаточную версию, декодер
   читает все. */
const CODE_VERSIONS = { 1: 1, 2: 2, 3: 2, 4: 1, 5: 2 }; // версия → ширина кода типа в цифрах
/* 4 и 5 — структурный код с габаритами (?s=): типы + build-параметры (длины),
   позы по умолчанию; 4 — типы одной цифрой, 5 — двумя. Версии 1–3 в ?s= —
   старые структурные коды без размеров. */
const STRUCT_SIZED = { 4: true, 5: true };

/* параметры типов в старых версиях (заморожены): в v1/v2 у телескопа был только ext */
const LEGACY_PARAMS = {
  prismatic: [{ key: 'ext', min: 0, max: 1.2, step: 0.05, def: 0.4 }],
};
function codecParams(type, ver) {
  return (ver < 3 && LEGACY_PARAMS[type]) || TYPES[type].params;
}

/* сколько цифр занимает параметр в коде */
function paramDigits(p) {
  return String(Math.round((p.max - p.min) / p.step)).length;
}

const CODE_TO_TYPE = Object.fromEntries(
  Object.entries(TYPES).map(([type, ty]) => [String(ty.code), type]));

/* Контрольная цифра по алгоритму Дамма — ловит все одиночные опечатки и все
   перестановки соседних цифр (Лун пропускал 09↔90). Считается по всем цифрам
   кода (включая версию) и дописывается в конец. Таблица — квазигруппа Дамма. */
const DAMM = [
  [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
  [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
  [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
  [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
  [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
  [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
  [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
  [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
];
function dammDigit(digits) {
  let i = 0;
  for (const ch of digits) i = DAMM[i][+ch];
  return String(i);
}
/* свойство квазигруппы: строка вместе с контрольной цифрой сворачивается в 0 */
function dammValid(digits) {
  return digits.length > 1 && dammDigit(digits) === '0';
}

/* нормализация ввода: любые разделители отсекаются; затем проверка Дамма и
   версии; возвращает {tw: ширина кода типа, body: тело без версии и
   контрольной цифры} либо null */
function codeBody(str) {
  const d = String(str).replace(/\D+/g, '');
  /* минимум 2 цифры: версия + контрольная (пустое тело = пустая рука) */
  if (d.length < 2 || !CODE_VERSIONS[d[0]] || !dammValid(d)) return null;
  return { ver: +d[0], tw: CODE_VERSIONS[d[0]], body: d.slice(1, -1) };
}

/* минимально достаточная версия: 3 — если есть телескоп (его параметры изменились),
   2 — если есть типы с кодами 10+, иначе 1 */
function codeVersionFor(list) {
  if (list.some(c => LEGACY_PARAMS[c.type])) return '3';
  return list.some(c => TYPES[c.type].code > 9) ? '2' : '1';
}

function encodeArmCode(cfg = cleanConfig()) {
  const ver = codeVersionFor(cfg);
  const tw = CODE_VERSIONS[ver];
  let s = ver;
  for (const c of cfg) {
    const ty = TYPES[c.type];
    s += String(ty.code).padStart(tw, '0');
    for (const p of ty.params) {
      const v = Math.min(p.max, Math.max(p.min, c[p.key] ?? p.def));
      s += String(Math.round((v - p.min) / p.step)).padStart(paramDigits(p), '0');
    }
  }
  return s + dammDigit(s);
}

/* ---- Замороженная спецификация формата кода (см. docs/CODEC.md) ----
   Коды типов и диапазоны/шаги параметров — часть протокола ссылок: их
   изменение молча ломает ВСЕ разосланные коды. Новые типы добавляются в
   конец с новыми кодами; менять существующие строки нельзя без новой версии.
   Самопроверка при старте кричит в консоль, если TYPES разошёлся со спекой. */
const CODE_SPEC = {
  /* v1: коды 0–9 */
  0: 'yaw|angle:-180:180:1:3',
  1: 'pitch|angle:-120:120:1:3',
  2: 'roll|angle:-180:180:1:3',
  3: 'link|length:0.3:3:0.05:2',
  4: 'gripper|open:0:100:1:3',
  5: 'prismatic|length:0.3:2:0.05:2|ext:0:2:0.05:2', // с v3; в v1/v2 — см. CODE_SPEC_LEGACY
  6: 'spherical|pitch:-90:90:1:3|yaw:-180:180:1:3',
  7: 'offset|length:0.2:1.5:0.05:2',
  8: 'rail|pos:-2:2:0.05:2',
  9: 'suction|power:0:100:1:3',
  /* v2: коды 10+ (двухзначные) */
  10: 'drill|speed:0:100:1:3',
  11: 'mill|speed:0:100:1:3',
};

/* строки прежних версий, по которым декодируются старые ссылки (LEGACY_PARAMS) */
const CODE_SPEC_LEGACY = { 5: 'prismatic|ext:0:1.2:0.05:2' };

function checkCodeSpec() {
  const errors = [];
  for (const [type, params] of Object.entries(LEGACY_PARAMS)) {
    const actual = type + '|' + params.map(p => [p.key, p.min, p.max, p.step, paramDigits(p)].join(':')).join('|');
    if (CODE_SPEC_LEGACY[TYPES[type].code] !== actual) errors.push(`legacy code ${TYPES[type].code}: "${actual}"`);
  }
  for (const [type, ty] of Object.entries(TYPES)) {
    const actual = type + '|' + ty.params.map(p =>
      [p.key, p.min, p.max, p.step, paramDigits(p)].join(':')).join('|');
    if (CODE_SPEC[ty.code] !== actual) {
      errors.push(`code ${ty.code}: spec "${CODE_SPEC[ty.code]}" != actual "${actual}"`);
    }
  }
  if (Object.keys(TYPES).length !== Object.keys(CODE_SPEC).length) {
    errors.push('количество типов разошлось со спекой кода');
  }
  for (const e of errors) {
    console.error(`Robo-Arm CODEC нарушен — старые ссылки сломаются! ${e}\n`
      + 'Изменение кодов/min/max/step требует новой версии формата (см. docs/CODEC.md).');
  }
  return !errors.length;
}

/* полный код (типы + параметры) → массив компонентов; null, если код битый */
function decodeArmCode(str) {
  const parsed = codeBody(str);
  if (parsed === null || STRUCT_SIZED[parsed.ver]) return null; // структурный код — не сюда
  const { ver, tw, body: d } = parsed;
  const out = [];
  let i = 0;
  while (i < d.length) {
    if (i + tw > d.length) return null;
    const type = CODE_TO_TYPE[String(parseInt(d.slice(i, i + tw), 10))];
    i += tw;
    if (!type) return null;
    const c = { type };
    for (const p of codecParams(type, ver)) {
      const w = paramDigits(p);
      if (i + w > d.length) return null; // код оборван
      const idx = Math.min(parseInt(d.slice(i, i + w), 10),
        Math.round((p.max - p.min) / p.step));
      i += w;
      const v = p.min + idx * p.step;
      c[p.key] = p.step >= 1 ? Math.round(v) : +v.toFixed(2);
    }
    out.push(c);
  }
  return out;
}

/* ---- Структурный код (?s=): только цифры типов, суперкороткий ----
   Параметры выставляются в середину диапазона — «нейтральная» поза. */

function midParam(p) {
  const steps = Math.round((p.max - p.min) / p.step);
  const v = p.min + Math.round(steps / 2) * p.step;
  return p.step >= 1 ? Math.round(v) : +v.toFixed(2);
}

function decodeStructCode(str) {
  const parsed = codeBody(str);
  if (parsed === null) return null;
  const { ver, tw, body: d } = parsed;
  const sized = !!STRUCT_SIZED[ver];
  const out = [];
  let i = 0;
  while (i < d.length) {
    if (i + tw > d.length) return null;
    const type = CODE_TO_TYPE[String(parseInt(d.slice(i, i + tw), 10))];
    i += tw;
    if (!type) return null;
    const c = { type };
    for (const p of codecParams(type, ver)) {
      if (sized && p.build) {
        /* габарит записан в коде */
        const w = paramDigits(p);
        if (i + w > d.length) return null;
        const idx = Math.min(parseInt(d.slice(i, i + w), 10), Math.round((p.max - p.min) / p.step));
        i += w;
        c[p.key] = +(p.min + idx * p.step).toFixed(2);
      } else c[p.key] = sized ? p.def : midParam(p); // позы: по умолчанию (старые коды — середина диапазона)
    }
    out.push(c);
  }
  return out;
}

/* короткий код: типы + габариты (длины), позы — по умолчанию */
function encodeStructCode(cfg = cleanConfig()) {
  const ver = cfg.some(c => TYPES[c.type].code > 9) ? '5' : '4';
  const tw = CODE_VERSIONS[ver];
  let s = ver;
  for (const c of cfg) {
    const ty = TYPES[c.type];
    s += String(ty.code).padStart(tw, '0');
    for (const p of ty.params) {
      if (!p.build) continue;
      const v = Math.min(p.max, Math.max(p.min, c[p.key] ?? p.def));
      s += String(Math.round((v - p.min) / p.step)).padStart(paramDigits(p), '0');
    }
  }
  return s + dammDigit(s);
}

/* группы по 4 цифры через дефис — легче диктовать и запоминать */
function groupCode(code) {
  return code.replace(/(\d{4})(?=\d)/g, '$1-');
}
/* @pure end */
