'use strict';
/* ================= Описание типов компонентов ================= */

/* У каждого типа есть code — цифра в «цифровом коде руки» (?c= в ссылке).
   Коды НЕ переиспользовать и не менять: они застолблены за типами навсегда.
   Все 10 цифр заняты; 11-й тип потребует новой версии кода (CODE_VERSION). */
/* Порядок ключей = порядок кнопок в тулбаре, сгруппирован по назначению:
   движение (поворот, рельс, суставы) → структура (звено, кронштейн) →
   наконечники в конце (сборка идёт от основания, они нужны последними).
   Порядок НЕ влияет на коды ссылок — code застолблен за типом навсегда. */
/* @pure types */
const TYPES = {
  /* --- движение --- */
  yaw: {
    code: 0,
    icon: '🔄',
    label: { en: 'Turntable', ru: 'Турель' }, // не «Поворот»: с «Вращением» это синонимы, а деталь — тяжёлая ось у основания
    color: 0x4da3ff,
    params: [{ key: 'angle', label: { en: 'Angle, °', ru: 'Угол, °' }, min: -180, max: 180, step: 1, def: 0 }],
    height: 0.5,
  },
  rail: {
    code: 8,
    icon: '🛤️',
    label: { en: 'Rail', ru: 'Рельс' },
    color: 0xd9c34d,
    params: [{ key: 'pos', label: { en: 'Position', ru: 'Позиция' }, min: -2, max: 2, step: 0.05, def: 0 }],
  },
  pitch: {
    code: 1,
    icon: '📐',
    label: { en: 'Pitch', ru: 'Наклон' },
    color: 0xffa14d,
    params: [{ key: 'angle', label: { en: 'Angle, °', ru: 'Угол, °' }, min: -120, max: 120, step: 1, def: 0 }],
    height: 0.44,
  },
  roll: {
    code: 2,
    icon: '🌀',
    label: { en: 'Roll', ru: 'Вращение' },
    color: 0xc07dff,
    params: [{ key: 'angle', label: { en: 'Angle, °', ru: 'Угол, °' }, min: -180, max: 180, step: 1, def: 0 }],
    height: 0.4,
  },
  spherical: {
    code: 6,
    icon: '🕹️',
    label: { en: 'Ball joint', ru: 'Шаровой шарнир' },
    color: 0xff6fa5,
    params: [
      { key: 'pitch', label: { en: 'Pitch, °', ru: 'Наклон, °' }, min: -90, max: 90, step: 1, def: 0 },
      { key: 'yaw', label: { en: 'Yaw, °', ru: 'Поворот, °' }, min: -180, max: 180, step: 1, def: 0 },
    ],
  },
  prismatic: {
    code: 5,
    icon: '🔭',
    label: { en: 'Prismatic', ru: 'Телескоп' },
    color: 0x4dd9cf,
    /* length — габарит корпуса (build: только при сборке), ext — выдвижение штока,
       не дальше длины корпуса (maxOf: 'length') */
    params: [
      { key: 'length', label: { en: 'Length', ru: 'Длина' }, min: 0.3, max: 2, step: 0.05, def: 0.7, build: true },
      { key: 'ext', label: { en: 'Extension', ru: 'Выдвижение' }, min: 0, max: 2, step: 0.05, def: 0.4, maxOf: 'length' },
    ],
  },
  /* --- структура --- */
  link: {
    code: 3,
    icon: '📏',
    label: { en: 'Link', ru: 'Звено' },
    color: 0x9aa7b8,
    params: [{ key: 'length', label: { en: 'Length', ru: 'Длина' }, min: 0.3, max: 3, step: 0.05, def: 1, build: true }],
  },
  offset: {
    code: 7,
    icon: '↪️',
    label: { en: 'Offset', ru: 'Кронштейн' },
    color: 0xb8a58f,
    params: [{ key: 'length', label: { en: 'Length', ru: 'Длина' }, min: 0.2, max: 1.5, step: 0.05, def: 0.5, build: true }],
  },
  /* --- наконечники (концевые эффекторы) --- */
  gripper: {
    code: 4,
    icon: '🤏',
    label: { en: 'Gripper', ru: 'Схват' },
    color: 0x57d98a,
    params: [{ key: 'open', label: { en: 'Opening, %', ru: 'Раскрытие, %' }, min: 0, max: 100, step: 1, def: 50 }],
    height: 0.55,
  },
  suction: {
    code: 9,
    icon: '🪠',
    label: { en: 'Suction cup', ru: 'Присоска' },
    color: 0x7fd94d,
    params: [{ key: 'power', label: { en: 'Suction, %', ru: 'Присос, %' }, min: 0, max: 100, step: 1, def: 0 }],
  },
  drill: {
    code: 10, /* коды 10+ доступны только в версии 2 цифрового кода */
    icon: '🔩',
    label: { en: 'Drill', ru: 'Сверло' },
    color: 0xff5c5c,
    params: [{ key: 'speed', label: { en: 'Speed, %', ru: 'Обороты, %' }, min: 0, max: 100, step: 1, def: 0 }],
  },
  mill: {
    code: 11,
    icon: '⚙️',
    label: { en: 'Mill', ru: 'Фреза' },
    color: 0x7a86e8,
    params: [{ key: 'speed', label: { en: 'Speed, %', ru: 'Обороты, %' }, min: 0, max: 100, step: 1, def: 0 }],
  },
};

/* Параметры с build: true — габариты, задаются только при сборке: слайдер доступен,
   пока компонент последний в цепочке; авто-анимация и позы их не трогают.
   maxOf: 'key' — верхняя граница параметра ограничена другим параметром компонента. */
function paramMax(c, p) { return p.maxOf ? Math.min(p.max, c[p.maxOf] ?? p.max) : p.max; }
/* @pure end */
