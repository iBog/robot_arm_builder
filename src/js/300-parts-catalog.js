'use strict';
/* ================= Каталог деталей: названия, цены, ссылки, замены, состав ================= */

/* Это файл ДАННЫХ — единственное место, которое правится при пополнении каталога;
   движок BOM (310-bom.js) и корзина код не меняют. Три реестра:
     PARTS — каталог деталей (название на двух языках, цена, ссылка на товар);
     ALTS  — распространённые замены: базовая деталь → до 4 альтернатив;
     NEEDS — что докупать на каждый тип компонента руки (ключи TYPES).
   Ключ, упомянутый в ALTS/NEEDS, но отсутствующий в PARTS, — ошибка: checkCatalog()
   (310-bom.js) сообщает о ней в консоль при старте. Новая деталь: сначала запись
   в PARTS, потом ссылка из NEEDS и/или ALTS. Цены сверяй с E:\Work\gemini\Robo-Arm
   (README §3.4 — BOM физического манипулятора). */

/* Формат записи: ключ (латиница, без пробелов — на него ссылаются ALTS и NEEDS) →
     { ru: 'название', en: 'name', price: число (~USD, ориентир), url: 'https://…' }
   url — необязательный: страница товара (AliExpress и т.п.); с ним деталь получает
   ссылку «↗» в BOM и в корзине, а адрес попадает в скопированный список заказа.
   Порядок записей = порядок строк внутри группы BOM и в корзине; комментарии
   «--- группа ---» только для навигации. Пример с ссылкой:
     nema17: { ru: 'Шаговый двигатель NEMA 17', en: 'NEMA 17 stepper motor', price: 12,
               url: 'https://aliexpress.com/item/…' }, */
const PARTS = {
  /* --- контроллеры --- */
  esp32:      { ru: 'Контроллер ESP32-S3',              en: 'ESP32-S3 board',              price: 8 },
  arduinomega:{ ru: 'Arduino Mega 2560 + RAMPS',        en: 'Arduino Mega 2560 + RAMPS',   price: 16 },
  rpipico:    { ru: 'Raspberry Pi Pico',                en: 'Raspberry Pi Pico',           price: 5 },
  rpizero:    { ru: 'Raspberry Pi Zero 2 W',            en: 'Raspberry Pi Zero 2 W',       price: 18 },
  rpi4:       { ru: 'Raspberry Pi 4, 4 ГБ',             en: 'Raspberry Pi 4, 4 GB',        price: 55 },
  /* --- моторы --- */
  nema17:     { ru: 'Шаговый двигатель NEMA 17',        en: 'NEMA 17 stepper motor',       price: 12 },
  nema17hi:   { ru: 'NEMA 17 повышенного момента',      en: 'NEMA 17 high-torque',         price: 16 },
  nema23:     { ru: 'Шаговый двигатель NEMA 23',        en: 'NEMA 23 stepper motor',       price: 22 },
  nema14:     { ru: 'Шаговый двигатель NEMA 14',        en: 'NEMA 14 stepper motor',       price: 10 },
  servods3218:{ ru: 'Сервопривод DS3218, 20 кг·см',     en: 'DS3218 servo, 20 kg·cm',      price: 9 },
  servomg996: { ru: 'Сервопривод MG996R',               en: 'MG996R servo',                price: 4 },
  servomg90:  { ru: 'Микросервопривод MG90S',           en: 'MG90S micro servo',           price: 3 },
  /* --- драйверы --- */
  tmc2209:    { ru: 'Драйвер шагового TMC2209',         en: 'Stepper driver TMC2209',      price: 4 },
  a4988:      { ru: 'Драйвер шагового A4988',           en: 'Stepper driver A4988',        price: 1.5 },
  drv8825:    { ru: 'Драйвер шагового DRV8825',         en: 'Stepper driver DRV8825',      price: 2 },
  tmc5160:    { ru: 'Драйвер шагового TMC5160',         en: 'Stepper driver TMC5160',      price: 12 },
  tb6600:     { ru: 'Драйвер TB6600 (внешний)',         en: 'TB6600 external driver',      price: 9 },
  /* --- редукторы и передачи --- */
  gearbox:    { ru: 'Планетарный редуктор 1:10…1:30',   en: 'Planetary gearbox',           price: 25 },
  cycloidal:  { ru: 'Циклоидальный редуктор (печатный)', en: 'Printed cycloidal drive',    price: 12 },
  wormgear:   { ru: 'Червячный редуктор',               en: 'Worm gearbox',                price: 18 },
  harmonic:   { ru: 'Волновой редуктор (harmonic)',     en: 'Harmonic drive',              price: 120 },
  belt:       { ru: 'Ремень GT2 + шкивы',               en: 'GT2 belt + pulleys',          price: 6 },
  belthtd:    { ru: 'Ремень HTD-3M + шкивы',            en: 'HTD-3M belt + pulleys',       price: 9 },
  chain:      { ru: 'Цепная передача',                  en: 'Chain drive',                 price: 10 },
  gears:      { ru: 'Зубчатые шестерни (печатные)',     en: 'Printed spur gears',          price: 3 },
  /* --- линейные передачи и направляющие --- */
  leadscrew:  { ru: 'Ходовой винт T8 + гайка',          en: 'T8 lead screw + nut',         price: 8 },
  ballscrew:  { ru: 'ШВП SFU1204',                      en: 'SFU1204 ball screw',          price: 28 },
  threadrod:  { ru: 'Шпилька M8 + гайка (бюджет)',      en: 'M8 threaded rod (budget)',    price: 3 },
  rackpinion: { ru: 'Рейка + шестерня',                 en: 'Rack and pinion',             price: 12 },
  linrail:    { ru: 'Направляющая MGN12 + каретка',     en: 'MGN12 rail + carriage',       price: 18 },
  mgn9:       { ru: 'Направляющая MGN9 + каретка',      en: 'MGN9 rail + carriage',        price: 14 },
  sbr12:      { ru: 'Круглая направляющая SBR12',       en: 'SBR12 round rail + blocks',   price: 16 },
  vslot:      { ru: 'V-slot профиль + ролики',          en: 'V-slot extrusion + wheels',   price: 12 },
  /* --- подшипники --- */
  bearings:   { ru: 'Шарикоподшипники 608 (компл.)',    en: '608 ball bearings set',       price: 3 },
  flanged:    { ru: 'Фланцевые подшипники (компл.)',    en: 'Flanged bearings set',        price: 4 },
  thinring:   { ru: 'Тонкостенные подшипники 6805',     en: '6805 thin-section bearings',  price: 7 },
  bushings:   { ru: 'Втулки скольжения (бюджет)',       en: 'Plain bushings (budget)',     price: 1.5 },
  thrust:     { ru: 'Упорный подшипник (турель)',       en: 'Thrust bearing (turntable)',  price: 5 },
  slewring:   { ru: 'Поворотный круг (slewing ring)',   en: 'Slewing ring bearing',        price: 14 },
  lazysusan:  { ru: 'Опорно-поворотный круг',           en: 'Lazy-susan turntable',        price: 4 },
  /* --- датчики --- */
  endstop:    { ru: 'Концевой выключатель',             en: 'Limit switch (endstop)',      price: 1 },
  optical:    { ru: 'Оптический концевик',              en: 'Optical endstop',             price: 2 },
  inductive:  { ru: 'Индуктивный датчик LJ12A3',        en: 'LJ12A3 inductive sensor',     price: 4 },
  hall:       { ru: 'Датчик Холла',                     en: 'Hall effect sensor',          price: 1.5 },
  encoder:    { ru: 'Магнитный энкодер AS5600',         en: 'AS5600 magnetic encoder',     price: 3 },
  /* --- питание --- */
  psu:        { ru: 'Блок питания 12 В / 8 А',          en: 'Power supply 12 V / 8 A',     price: 20 },
  psu24:      { ru: 'Блок питания 24 В / 6 А',          en: 'Power supply 24 V / 6 A',     price: 24 },
  psuatx:     { ru: 'ATX-блок питания (б/у)',           en: 'Reused ATX power supply',     price: 12 },
  battery4s:  { ru: 'LiPo-аккумулятор 4S',              en: 'LiPo battery 4S',             price: 25 },
  buck:       { ru: 'DC-DC преобразователь 12→5 В',     en: 'Buck converter 12→5 V',       price: 2 },
  lm2596:     { ru: 'Модуль LM2596',                    en: 'LM2596 module',               price: 1.5 },
  ubec:       { ru: 'UBEC 5 В / 5 А',                   en: 'UBEC 5 V / 5 A',              price: 4 },
  /* --- вакуум --- */
  pump:       { ru: 'Мини вакуумный насос',             en: 'Mini vacuum pump',            price: 12 },
  venturi:    { ru: 'Вакуумный эжектор (Вентури)',      en: 'Venturi vacuum ejector',      price: 8 },
  aquapump:   { ru: 'Аквариумный компрессор',           en: 'Aquarium pump (modified)',    price: 6 },
  valve:      { ru: 'Электромагнитный клапан 12 В',     en: 'Solenoid valve 12 V',         price: 4 },
  relay:      { ru: 'Модуль реле',                      en: 'Relay module',                price: 2 },
  mosfet:     { ru: 'MOSFET-модуль IRF520',             en: 'IRF520 MOSFET module',        price: 1.5 },
  cup:        { ru: 'Вакуумная присоска',               en: 'Suction cup',                 price: 2 },
  /* --- шпиндель и инструмент --- */
  spindle775: { ru: 'Мотор-шпиндель 775, 12 В',        en: '775 spindle motor, 12 V',     price: 14 },
  er11:       { ru: 'Цанговый патрон ER11 на вал',     en: 'ER11 collet chuck',           price: 8 },
  drillbits:  { ru: 'Свёрла 1–6 мм (набор)',           en: 'Drill bit set 1–6 mm',        price: 5 },
  millbits:   { ru: 'Фрезы по дереву/пластику (набор)', en: 'End mill set (wood/plastic)', price: 9 },
  /* --- корпусные детали и мелочь --- */
  /* печать считается по массе: количество в BOM = граммы / 100 (объём — из GEOM и стиля, 045-style.js) */
  print:      { ru: '3D-печать: пластик PLA, 100 г',    en: '3D printing: PLA, 100 g',     price: 2.5 },
  petg:       { ru: '3D-печать: PETG, 100 г',           en: '3D printing: PETG, 100 g',    price: 3 },
  abs:        { ru: '3D-печать: ABS/ASA, 100 г',        en: '3D printing: ABS/ASA, 100 g', price: 3 },
  resin:      { ru: 'Фотополимер SLA, 100 г',           en: 'SLA resin, 100 g',            price: 5 },
  nylon:      { ru: 'Нейлон SLS (сервис печати), 100 г', en: 'SLS nylon (print service), 100 g', price: 12 },
  cap:        { ru: 'Конденсатор 1000 мкФ',             en: 'Capacitor 1000 µF',           price: 0.5 },
  hw:         { ru: 'Крепёж M3, провода, разъёмы',      en: 'M3 hardware, wires',          price: 10 },
};

/* Распространённые замены: базовая деталь → до 4 альтернатив (базовая тоже в списке).
   Замена меняет только цену и название строки — состав руки от неё не зависит. */
const ALTS = {
  esp32:     ['arduinomega', 'rpipico', 'rpizero', 'rpi4'],
  tmc2209:   ['a4988', 'drv8825', 'tmc5160', 'tb6600'],
  nema17:    ['nema17hi', 'nema23', 'servods3218', 'servomg996'],
  nema14:    ['nema17', 'servods3218', 'servomg996', 'servomg90'],
  gearbox:   ['cycloidal', 'wormgear', 'belthtd', 'harmonic'],
  belt:      ['belthtd', 'chain', 'gears'],
  leadscrew: ['ballscrew', 'threadrod', 'rackpinion'],
  linrail:   ['mgn9', 'sbr12', 'vslot'],
  bearings:  ['flanged', 'thinring', 'bushings'],
  thrust:    ['slewring', 'lazysusan', 'bearings'],
  endstop:   ['optical', 'inductive', 'hall', 'encoder'],
  psu:       ['psu24', 'psuatx', 'battery4s'],
  buck:      ['lm2596', 'ubec'],
  pump:      ['venturi', 'aquapump'],
  relay:     ['mosfet'],
  print:     ['petg', 'abs', 'resin', 'nylon'],
};

/* Что нужно докупить на каждый компонент руки.
   Правило: каждая вращающаяся ось — мотор + драйвер + опора (подшипник) + концевик,
   передача (ремень/редуктор) там, где мотор не сидит на оси напрямую. */
const NEEDS = {
  yaw:       { nema17: 1, belt: 1, tmc2209: 1, endstop: 1, thrust: 1, bearings: 1, print: 1 },
  pitch:     { nema17: 1, gearbox: 1, tmc2209: 1, endstop: 1, bearings: 1, print: 1 },
  roll:      { nema14: 1, belt: 1, tmc2209: 1, endstop: 1, bearings: 1, print: 1 },
  spherical: { nema14: 2, belt: 1, tmc2209: 2, endstop: 2, bearings: 2, print: 1 },
  link:      { print: 1 },
  offset:    { print: 1 },
  prismatic: { nema17: 1, leadscrew: 1, linrail: 1, bearings: 1, tmc2209: 1, endstop: 1, print: 1 },
  rail:      { linrail: 1, nema17: 1, belt: 1, bearings: 1, tmc2209: 1, endstop: 1, print: 1 },
  gripper:   { nema14: 1, leadscrew: 1, bearings: 1, tmc2209: 1, endstop: 1, print: 1 },
  suction:   { pump: 1, valve: 1, relay: 1, cup: 1, print: 1 },
  /* шпиндельные наконечники: DC-мотор + патрон + инструмент, управление MOSFET */
  drill:     { spindle775: 1, er11: 1, drillbits: 1, mosfet: 1, print: 1 },
  mill:      { spindle775: 1, er11: 1, millbits: 1, mosfet: 1, print: 1 },
};
