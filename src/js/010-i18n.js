'use strict';
/* ================= Локализация: English / Русский ================= */

/* Строки интерфейса. Значение — либо строка, либо функция от аргументов t(). */
const STR = {
  appTitle:   { en: '🦾 Robo-Arm Builder',            ru: '🦾 Конструктор робо-руки' },
  docTitle:   { en: 'Robo-Arm Builder',               ru: 'Конструктор робо-руки' },
  metaDesc:   { en: 'Free 3D robot-arm configurator in the browser: joints, links, grippers and tools, motion zones, IK, URDF export and a parts list with prices.',
                ru: 'Бесплатный 3D-конструктор робо-руки в браузере: суставы, звенья, схваты и инструменты, зоны движения, IK, экспорт URDF и список деталей с ценами.' },
  hint:       { en: 'LMB — rotate · wheel — zoom · RMB — pan',
                ru: 'ЛКМ — вращение · колесо — зум · ПКМ — панорама' },
  animate:    { en: 'Animate',                        ru: 'Анимация' },
  themeDark:  { en: 'Dark theme',                     ru: 'Тёмная тема' },
  themeLight: { en: 'Light theme',                    ru: 'Светлая тема' },
  styleTip:   { en: name => `Part style: ${name}`,    ru: name => `Стиль деталей: ${name}` },
  animateTip: { en: 'Auto-animate the joints',        ru: 'Авто-анимация суставов' },
  generate:   { en: '🎲 Generate Arm',                ru: '🎲 Случайная рука' },
  newProject: { en: '✨ Start New Project',           ru: '✨ Новый проект' },
  newTip:     { en: 'Clear the arm and start from scratch',
                ru: 'Очистить руку и начать с нуля' },
  startHint:  { en: '👆 Click a button above to add the first component of your arm',
                ru: '👆 Нажмите кнопку выше, чтобы добавить первый компонент руки' },
  badLink:    { en: '⚠️ The code in the link is invalid — the arm was not loaded. Check the link or build your own arm with the buttons above.',
                ru: '⚠️ Код в ссылке повреждён или неверный — рука не загружена. Проверьте ссылку или соберите свою руку кнопками выше.' },
  tabParts:   { en: 'Parts',                          ru: 'Состав' },
  tabJson:    { en: 'JSON',                           ru: 'JSON' },
  tabUrdf:    { en: 'URDF',                           ru: 'URDF' },
  tabBom:     { en: '🛒 BOM',                         ru: '🛒 Закупка' },
  tabTwin:    { en: '🔗 Twin',                        ru: '🔗 Двойник' },
  addTip:     { en: name => `Add: ${name}`,           ru: name => `Добавить: ${name}` },
  empty:      { en: 'Arm is empty.',                  ru: 'Рука пуста.' },
  emptyHint:  { en: 'Add components with the buttons above — they stack up from the base.',
                ru: 'Добавляйте компоненты кнопками выше — они наращиваются от основания.' },
  orderNote:  { en: '⬇ order from the base to the arm tip',
                ru: '⬇ порядок — от основания к концу руки' },
  zone:       { en: 'zone',                           ru: 'зона' },
  zoneTip:    { en: 'Motion zone — show/hide the dashed range',
                ru: 'Зона движения — вкл/выкл пунктирную область' },
  remove:     { en: 'Remove component',               ru: 'Удалить компонент' },
  lockedTip:  { en: 'Size is fixed: the next component is already attached. Remove the components above it to change it.',
                ru: 'Габарит зафиксирован: дальше уже добавлен следующий компонент. Чтобы изменить, удалите компоненты после него.' },
  jsonTitle:  { en: 'JSON configuration',             ru: 'Конфигурация JSON' },
  urdfTitle:  { en: 'URDF description',               ru: 'Описание URDF' },
  save:       { en: 'Download',                       ru: 'Скачать' },
  saved:      { en: '✓ file saved',                   ru: '✓ файл сохранён' },
  apply:      { en: 'Apply',                          ru: 'Применить' },
  copy:       { en: 'Copy',                           ru: 'Копировать' },
  applied:    { en: '✓ applied',                      ru: '✓ применено' },
  copied:     { en: '✓ copied',                       ru: '✓ скопировано' },
  share:      { en: '🔗 Share',                       ru: '🔗 Ссылка' },
  shareTip:   { en: 'Copy a short link with the arm structure and sizes (default poses). Long press — a full link with the exact poses too',
                ru: 'Скопировать короткую ссылку с составом и размерами руки (позы по умолчанию). Долгое нажатие — полная ссылка ещё и с точными позами' },
  shareCopied:{ en: '✓ full link copied',             ru: '✓ полная ссылка скопирована' },
  shortCopied:{ en: '✓ short link copied',            ru: '✓ короткая ссылка скопирована' },
  ik:         { en: '🎯 IK',                          ru: '🎯 ИК' },
  ikTip:      { en: 'Inverse kinematics: drag the target at the arm tip, the joints follow',
                ru: 'Обратная кинематика: тяните мишень на конце руки — суставы подберутся сами' },
  ikMiss:     { en: d => `🎯 <b>Target out of reach by ${d} m.</b> This arm can't get there: rebuild it — a longer link, another joint or a telescope — and the target will be tried again automatically. Drag the red target to move it.`,
                ru: d => `🎯 <b>До цели не хватает ${d} м.</b> Этой руке туда не дотянуться: перестройте её — длиннее звено, ещё сустав или телескоп — и цель проверится заново сама. Красную мишень можно перетащить.` },
  ikMissTip:  { en: 'Dismiss', ru: 'Скрыть' },
  undo:       { en: '↩️ Undo',                        ru: '↩️ Отмена' },
  undoTip:    { en: 'Revert the last change to the arm',
                ru: 'Откатить последнее изменение руки' },
  fit:        { en: 'Fit',                            ru: 'Вписать' },
  fitTip:     { en: 'Auto-fit the whole arm into the view',
                ru: 'Автоматически вписывать всю руку в кадр' },
  panelTip:   { en: 'Show/hide the parts panel',      ru: 'Показать/скрыть панель деталей' },
  expandTip:  { en: 'Expand the 3D view',             ru: 'Развернуть 3D-вид на всё окно' },
  collapseTip:{ en: 'Back to the normal layout',      ru: 'Вернуть обычный вид' },
  helpTip:    { en: 'Help & tutorial',                ru: 'Помощь и обучение' },
  tutAskTitle:{ en: '👋 Hi!',                         ru: '👋 Привет!' },
  tutAskText: { en: 'I can walk you through building your first robo-arm, or just tell you what this app is about.',
                ru: 'Могу провести тебя по шагам и собрать первую робо-руку, а могу просто рассказать, что это за приложение.' },
  tutBtnGuide:{ en: '🧭 Step-by-step guide to get started', ru: '🧭 Пошаговая инструкция как начать' },
  tutBtnWhat: { en: 'ℹ️ About this app',              ru: 'ℹ️ Общая информация о приложении' },
  tutBtnLater:{ en: 'Later',                          ru: 'Позже' },
  tutAboutTitle: { en: '🦾 What is this?',            ru: '🦾 Что это такое?' },
  tutAboutText: {
    en: 'This is a robo-arm builder — you design real robot manipulators, like the ones in factories and labs!\n\n'
      + 'Build your own arm from blocks: turntables, joints, links and grippers. Drag the sliders — and the arm comes alive right on the screen. You don\'t need to know anything in advance: just try things, nothing can break 😊\n\n'
      + 'And when you like your arm, the app shows which real parts it takes and roughly what they cost. Many engineers started exactly like this!',
    ru: 'Это конструктор робо-рук — настоящих роботов-манипуляторов, как на заводах и в лабораториях!\n\n'
      + 'Собери свою руку из деталей: поворотных столов, суставов, звеньев и схватов. Покрути слайдеры — и рука оживёт прямо на экране. Заранее ничего знать не нужно: просто пробуй, сломать тут нечего 😊\n\n'
      + 'А когда рука понравится — приложение покажет, из каких настоящих деталей её собрать и сколько они примерно стоят. Многие инженеры начинали именно так!' },
  tutBtnTry:  { en: 'Let\'s try it! 🚀',              ru: 'Давай попробуем! 🚀' },
  tutBtnOk:   { en: 'Got it',                         ru: 'Понятно' },
  tutStepTitle: { en: (i, n) => `Step ${i} of ${n}`,  ru: (i, n) => `Шаг ${i} из ${n}` },
  tutPress:   { en: name => `Press the "+ ${name}" button above 👆`,
                ru: name => `Нажми кнопку «+ ${name}» наверху 👆` },
  tutWrong:   { en: name => `Oops, not that one — we need "+ ${name}" 😊`,
                ru: name => `Ой, не та кнопка — нам нужна «+ ${name}» 😊` },
  tutExitTip: { en: 'Quit the tutorial',              ru: 'Выйти из обучения' },
  tutDoneTitle: { en: '🎉 Congratulations!',          ru: '🎉 Поздравляем!' },
  tutDoneText: {
    en: 'You\'ve built your first robo-arm! 🦾\n\n'
      + 'Drag the sliders in the parts panel — the arm will move. Also try:\n\n'
      + '🔗 The "Share" button saves your arm as a link you can send to friends.\n'
      + '🛒 The "BOM" tab shows which real parts your arm needs and roughly what they cost.\n\n'
      + 'You\'re a robot builder now. Keep creating!',
    ru: 'Ты собрал свою первую робо-руку! 🦾\n\n'
      + 'Покрути слайдеры в панели с деталями — рука будет двигаться. А ещё попробуй:\n\n'
      + '🔗 Кнопка «Ссылка» — сохранит руку и даст поделиться ею с друзьями.\n'
      + '🛒 Вкладка «Закупка» — покажет, из каких настоящих деталей её собрать и сколько это примерно стоит.\n\n'
      + 'Теперь ты — конструктор роботов. Твори!' },
  tutBtnDone: { en: 'Awesome!',                       ru: 'Здорово!' },
  author:     { en: '© iBog',                         ru: '© iBog' },
  authorTip:  { en: 'Contact the author: ibog.dev@yandex.by',
                ru: 'Написать автору: ibog.dev@yandex.by' },
  license:    { en: 'Licensed under CC BY-NC-ND 4.0', ru: 'Лицензия CC BY-NC-ND 4.0' },
  licenseTip: { en: 'Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International',
                ru: 'Creative Commons «С указанием авторства — Некоммерческая — Без производных» 4.0' },
  errPrefix:  { en: e => `Error: ${e}`,               ru: e => `Ошибка: ${e}` },
  errArray:   { en: 'an array of components is expected',
                ru: 'ожидается массив компонентов' },
  errType:    { en: (i, ty) => `component #${i}: unknown type "${ty}"`,
                ru: (i, ty) => `компонент #${i}: неизвестный type "${ty}"` },
  bomTitle:   { en: '🛒 BOM — parts to buy',          ru: '🛒 BOM — список закупки' },
  bomNote:    { en: 'Approximate prices, ~USD (AliExpress), grouped by the component they belong to. '
                  + 'Parts with a dropdown have common alternatives — pick one to see how the price changes.',
                ru: 'Ориентировочные цены, ~USD (AliExpress), сгруппированы по компоненту, к которому относятся. '
                  + 'У деталей со списком есть распространённые замены — выберите, чтобы увидеть, как изменится цена.' },
  colName:    { en: 'Component',                      ru: 'Компонент' },
  colQty:     { en: 'Qty',                            ru: 'Кол-во' },
  colPrice:   { en: 'Price',                          ru: 'Цена' },
  colSum:     { en: 'Sum',                            ru: 'Сумма' },
  total:      { en: 'Total',                          ru: 'Итого' },
  bomEmpty:   { en: 'Arm is empty — nothing to buy.', ru: 'Рука пуста — покупать нечего.' },
  printInfo:  { en: (st, cm3, g, cost) => `🖨 3D printing, style «${st}»: ~${cm3} cm³ of plastic, ~${g} g PLA (${cost})`,
                ru: (st, cm3, g, cost) => `🖨 3D-печать, стиль «${st}»: ~${cm3} см³ пластика, ~${g} г PLA (${cost})` },
  gramsShort: { en: 'g',                              ru: 'г' },
  bomBase:    { en: 'Base kit & electronics',         ru: 'Базовый комплект и электроника' },
  bomAltTip:  { en: 'Common alternatives for this part',
                ru: 'Распространённые замены для этой детали' },
  partLinkTip:{ en: 'Open the product page',           ru: 'Открыть страницу товара' },
  /* --- корзина --- */
  cartTitle:  { en: '🧺 Cart',                        ru: '🧺 Корзина' },
  cartNote:   { en: 'Add single parts with «+», a whole section with «+ section» or the entire list with «+ all». '
                  + 'The cart is kept in this browser.',
                ru: 'Добавляйте отдельные детали кнопкой «+», секцию целиком — «+ секция», весь список — «+ всё». '
                  + 'Корзина хранится в этом браузере.' },
  cartEmpty:  { en: 'Cart is empty — add parts from the list above.',
                ru: 'Корзина пуста — добавьте детали из списка выше.' },
  cartAddTip: { en: 'Add to cart',                    ru: 'В корзину' },
  cartAddGroup:    { en: '+ section',                 ru: '+ секция' },
  cartAddGroupTip: { en: 'Add the whole section to the cart', ru: 'Добавить всю секцию в корзину' },
  cartAddAll:      { en: '+ all',                     ru: '+ всё' },
  cartAddAllTip:   { en: 'Add the entire list to the cart',   ru: 'Добавить весь список в корзину' },
  cartRemoveTip:   { en: 'Remove from cart',          ru: 'Убрать из корзины' },
  cartClear:  { en: 'Clear',                          ru: 'Очистить' },
  cartCopy:   { en: 'Copy list',                      ru: 'Скопировать список' },
  cartSummary:{ en: (items, qty) => `${items} item${items === 1 ? '' : 's'} · ${qty} pcs`,
                ru: (items, qty) => `${items} поз. · ${qty} шт.` },
  /* --- Двойник --- */
  twinTitle:  { en: '🔗 Twin — real arm & external control', ru: '🔗 Двойник — железная рука и внешнее управление' },
  twinNote:   { en: 'The page connects to the physical arm (ESP32 firmware over Wi-Fi, ws://192.168.4.1/ws) or to the hub '
                  + '«node tools/twin-mcp.mjs» (ws://127.0.0.1:8765) that bridges the arm and lets an MCP agent or a script drive it. '
                  + 'USB: Web Serial, one JSON per line. Every pose change goes out as move_all + gripper; incoming commands move the 3D arm. '
                  + 'Several pages on one hub share one arm («node tools/twin-mcp.mjs --serve» hands the page out over the LAN): '
                  + 'whoever moves first holds it, others mirror and take over 2 s after the last action.',
                ru: 'Страница подключается к железной руке (прошивка ESP32 по Wi-Fi, ws://192.168.4.1/ws) или к хабу '
                  + '«node tools/twin-mcp.mjs» (ws://127.0.0.1:8765), который мостит руку и даёт управлять ею MCP-агенту или скрипту. '
                  + 'USB: Web Serial, по одному JSON в строке. Каждое изменение позы уходит как move_all + gripper; входящие команды двигают 3D-руку. '
                  + 'Несколько страниц на одном хабе делят одну руку («node tools/twin-mcp.mjs --serve» раздаёт страницу по локальной сети): '
                  + 'кто первый начал двигать, тот держит её, остальные зеркалят и могут перехватить через 2 с после последнего действия.' },
  twinNameLbl:    { en: 'Your name:',                  ru: 'Ваше имя:' },
  twinGuest:      { en: id => `Guest-${id}`,           ru: id => `Гость-${id}` },
  twinMe:         { en: name => `${name} (you)`,      ru: name => `${name} (вы)` },
  twinPeersRow:   { en: list => `Pages: ${list}`,     ru: list => `Страницы: ${list}` },
  twinPeersNone:  { en: name => `No other pages on this hub — you are ${name}.`,
                    ru: name => `Других страниц на хабе нет — вы ${name}.` },
  twinLockedBy:   { en: (name, s) => `🔒 ${name} is driving the arm · free in ${s} s`,
                    ru: (name, s) => `🔒 Рукой управляет ${name} · свободна через ${s} с` },
  twinBusy:       { en: name => `busy: ${name} holds the arm`, ru: name => `занято: руку держит ${name}` },
  twinConnect:    { en: 'Connect',                     ru: 'Подключить' },
  twinDisconnect: { en: 'Disconnect',                  ru: 'Отключить' },
  twinConnecting: { en: 'connecting…',                 ru: 'подключение…' },
  twinSerial:     { en: 'USB (Web Serial)',            ru: 'USB (Web Serial)' },
  twinSerialOff:  { en: 'Close USB',                   ru: 'Закрыть USB' },
  twinSend:       { en: 'send moves',                  ru: 'отправлять движения' },
  twinRecv:       { en: 'accept arm state',            ru: 'принимать положение руки' },
  twinHome:       { en: '⌂ Home',                      ru: '⌂ В исходное' },
  twinStop:       { en: '■ Stop',                      ru: '■ Стоп' },
  twinOff:        { en: 'not connected',               ru: 'нет подключения' },
  twinOn:         { en: names => `connected: ${names}`, ru: names => `подключено: ${names}` },
  twinLinked:     { en: name => `${name}: connected`,  ru: name => `${name}: подключено` },
  twinUnlinked:   { en: name => `${name}: closed`,     ru: name => `${name}: отключено` },
  twinWsError:    { en: url => `cannot reach ${url}`,  ru: url => `нет связи с ${url}` },
  twinColPart:    { en: 'Part · parameter',            ru: 'Деталь · параметр' },
  twinColArm:     { en: 'Arm',                         ru: 'Рука' },
  twinGripperRow: { en: 'Gripper opening, %',          ru: 'Раскрытие схвата, %' },
  twinNoAxes:     { en: 'Arm is empty — no joints to drive.', ru: 'Рука пуста — нечем управлять.' },
  twinProto:      { en: 'Messages: {"type":"move_all","angles":[…]}, {"type":"set_joint","joint":2,"angle":45}, {"type":"gripper","open":40}, '
                      + '{"type":"home"}, {"type":"ik","target":[x,y,z]}, {"type":"get_state"}, {"type":"get_arm"}, {"type":"set_arm","components":[…]}. '
                      + 'The arm reports {"type":"state","angles":[…]}. Joints J1…Jn = pose parameters of the chain in order (see the table).',
                    ru: 'Сообщения: {"type":"move_all","angles":[…]}, {"type":"set_joint","joint":2,"angle":45}, {"type":"gripper","open":40}, '
                      + '{"type":"home"}, {"type":"ik","target":[x,y,z]}, {"type":"get_state"}, {"type":"get_arm"}, {"type":"set_arm","components":[…]}. '
                      + 'Рука сообщает {"type":"state","angles":[…]}. Суставы J1…Jn — позные параметры цепочки по порядку (см. таблицу).' },
  twinLogTitle:   { en: 'Log',                         ru: 'Журнал' },
  twinLogClear:   { en: 'clear',                       ru: 'очистить' },
  /* --- Challenge mode --- */
  chalBtn:    { en: '🏆 Challenge',                   ru: '🏆 Задания' },
  chalTip:    { en: 'Challenge mode: three tasks for your arm',
                ru: 'Режим заданий: три задачи для вашей руки' },
  chalToggleTip: { en: 'Show or hide the task panel (exit — ✕ in its header)',
                   ru: 'Свернуть или развернуть окно задания (выход — ✕ в его шапке)' },
  chalTitle:  { en: '🏆 Challenge',                   ru: '🏆 Задания' },
  chalExit:   { en: 'Exit challenge mode',            ru: 'Выйти из режима заданий' },
  chalMin:    { en: 'Collapse the panel (the 🏆 button brings it back)',
                ru: 'Свернуть окно (вернуть — кнопкой 🏆)' },
  chalQuitTitle: { en: 'Interrupt the challenge?', ru: 'Прервать задания?' },
  chalQuitText: { en: d => `Tasks done: ${d} of 3. Leaving clears the progress and the action log — the arm itself stays as it is.`,
                  ru: d => `Выполнено заданий: ${d} из 3. Выход сбросит прогресс и запись действий — сама рука останется как есть.` },
  chalQuitStay: { en: 'Keep going',                   ru: 'Продолжить' },
  chalQuitLeave: { en: 'Leave anyway',                ru: 'Всё равно выйти' },
  chalTask1:  { en: 'Pick & place the cube',          ru: 'Перенести кубик' },
  chalTask2:  { en: 'Drill 4 holes',                  ru: 'Просверлить 4 отверстия' },
  chalTask3:  { en: 'Cut the billet in half',         ru: 'Распилить чушку пополам' },
  chalDesc1:  { en: 'Grab the orange cube with a gripper, set it down inside the blue ring without touching the ring, then lift it over the walls into the green square.',
                ru: 'Возьмите оранжевый кубик схватом, поставьте его внутрь синего кольца, не задев кольцо, а потом перенесите через стенки в зелёный квадрат.' },
  chalDesc2:  { en: 'Drill the four corners of the square marked on the wall. The spindle must be running (Speed > 0); any depth counts.',
                ru: 'Просверлите четыре угла квадрата, размеченного на стене. Шпиндель должен вращаться (Обороты > 0); глубина — любая.' },
  chalDesc3:  { en: 'Cut the metal billet into two equal halves with the spinning mill — along the dashed ring.',
                ru: 'Распилите металлическую чушку на две равные половины вращающейся фрезой — по пунктирному кольцу.' },
  chalNeed:   { en: name => `⚠️ Add a "${name}" to the arm`, ru: name => `⚠️ Добавьте к руке «${name}»` },
  chalStepGrab: { en: 'grab the cube',                ru: 'взять кубик' },
  chalStepRing: { en: 'set it inside the ring',       ru: 'поставить в кольцо' },
  chalStepPen:  { en: 'lift it into the square',      ru: 'перенести в квадрат' },
  chalHeld:   { en: '✋ held by the gripper',          ru: '✋ предмет в схвате' },
  chalGoTip:  { en: 'Click to switch to this task',    ru: 'Нажмите, чтобы перейти к этому заданию' },
  chalHoles:  { en: (k, n) => `Holes drilled: ${k} / ${n}`, ru: (k, n) => `Отверстий: ${k} / ${n}` },
  chalSpindleOff: { en: '🔩 the bit touches the wall, but the spindle is off',
                    ru: '🔩 сверло касается стены, но шпиндель не вращается' },
  chalCut:    { en: p => `Cut: ${p}%`,               ru: p => `Пропил: ${p}%` },
  chalOffCut: { en: '✂️ an off-center cut doesn\'t count — the halves must be equal',
                ru: '✂️ пропил не посередине не засчитан — половины должны быть равными' },
  chalTaskDone: { en: '✅ Task complete!',            ru: '✅ Задание выполнено!' },
  chalLeft:   { en: n => `Still to do: ${n}`,        ru: n => `Осталось: ${n}` },
  chalAllDone: { en: '🎉 All three tasks are done — your arm is a real worker!',
                 ru: '🎉 Все три задания выполнены — ваша рука настоящий работяга!' },
  chalReset:  { en: '↺ Reset task',                   ru: '↺ Сбросить' },
  chalNext:   { en: 'Next task ▸',                    ru: 'Следующее ▸' },
  tabLog:     { en: '📼 Log',                         ru: '📼 Запись' },
  logTitle:   { en: 'Action log',                     ru: 'Запись действий' },
  logEmpty:   { en: 'No actions yet — move the sliders or add components; every step is recorded here.',
                ru: 'Действий пока нет — двигайте слайдеры или добавляйте компоненты; каждый шаг записывается сюда.' },
  logUndo:    { en: '↶ Undo last',                    ru: '↶ Отменить' },
  logReplay:  { en: '▶ Replay',                       ru: '▶ Проиграть' },
  logStop:    { en: '⏹ Stop',                         ru: '⏹ Стоп' },
  logLoop:    { en: '🔁 Loop',                         ru: '🔁 Цикл' },
  logLoopTip: { en: 'Replay in a loop, from the start again after the last action',
                ru: 'Повторять по кругу: после последнего действия — снова с начала' },
  logParam:   { en: (name, i, p, a, b) => `${name} #${i} · ${p}: ${a} → ${b}`,
                ru: (name, i, p, a, b) => `${name} #${i} · ${p}: ${a} → ${b}` },
  logAdd:     { en: name => `Add: ${name}`,          ru: name => `Добавить: ${name}` },
  logDel:     { en: (name, i) => `Remove: ${name} #${i}`, ru: (name, i) => `Удалить: ${name} #${i}` },
  logConfig:  { en: n => `Rebuild the arm (${n} parts)`, ru: n => `Пересборка руки (${n} дет.)` },
  logTask:    { en: i => `Go to task ${i}`,          ru: i => `Перейти к заданию ${i}` },
  logReset:   { en: i => `Reset task ${i}`,          ru: i => `Сброс задания ${i}` },
  logReplaying: { en: (i, n) => `▶ replaying ${i} / ${n}`, ru: (i, n) => `▶ воспроизведение ${i} / ${n}` },
  logPose:    { en: 'IK target:',                    ru: 'Мишень IK:' },
  logBack:    { en: 'Roll the log back to this step', ru: 'Откатить запись до этого шага' },
  logBackTitle: { en: 'Roll back the log?',          ru: 'Откатить запись?' },
  logBackText: { en: (n, m) => `Steps ${n + 1}–${m} will be removed. The arm, the task objects and the ✅ marks return to how they were right after step ${n} (the log is replayed up to it). New actions will be recorded after it.`,
                 ru: (n, m) => `Шаги ${n + 1}–${m} будут удалены. Рука, предметы заданий и отметки ✅ вернутся к состоянию сразу после шага ${n} (запись проигрывается до него заново). Новые действия запишутся следом за ним.` },
  logBackYes: { en: 'Roll back',                     ru: 'Откатить' },
  logBackNo:  { en: 'Keep everything',               ru: 'Оставить' },
};

const LANGS = ['en', 'ru'];
const LANG_KEY = 'roboArmLang';

function storedLang() {
  try { return localStorage.getItem(LANG_KEY); } catch { return null; }
}

/* Параметр ссылки: ?k=v в query или #k=v во фрагменте (как и код руки).
   Язык и тема из ссылки применяются только к этой загрузке — сохранённый
   выбор получателя не перезаписывают, пока он сам не переключит. */
function urlParam(k) {
  const qs = new URLSearchParams(location.search);
  const hs = new URLSearchParams(location.hash.replace(/^#\??/, ''));
  return qs.get(k) ?? hs.get(k);
}

const urlLang = (urlParam('lang') || '').toLowerCase().slice(0, 2);
let langChosen = LANGS.includes(urlLang); // язык задан явно — уйдёт и в ссылку «Share»
let lang = langChosen ? urlLang
  : LANGS.includes(storedLang()) ? storedLang()
  : (navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';

/* t('key', ...args) — строка интерфейса; tr({en,ru}) — двуязычное поле данных */
function t(key, ...args) {
  const v = STR[key]?.[lang];
  return typeof v === 'function' ? v(...args) : (v ?? key);
}
function tr(o) { return (o && o[lang]) ?? ''; }
