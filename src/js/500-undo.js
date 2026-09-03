'use strict';
/* ================= Отмена: откат структурных изменений руки ================= */

/* Снимки cleanConfig() перед каждым изменением состава (добавление, удаление,
   генерация, Apply, новый проект). Кнопка видна, только когда есть что отменять. */
const undoStack = [];
const btnUndo = document.getElementById('btnUndo');

function pushUndo() {
  const snap = JSON.stringify(cleanConfig());
  if (undoStack[undoStack.length - 1] === snap) return; // состав не менялся
  undoStack.push(snap);
  if (undoStack.length > 50) undoStack.shift();
  btnUndo.hidden = false;
}

btnUndo.onclick = () => {
  if (!undoStack.length) return;
  cancelTutorial();
  const snap = undoStack.pop();
  btnUndo.hidden = !undoStack.length;
  withLog(() => { components = JSON.parse(snap); buildArm(); renderPanel(); });
};

/* Восстановление руки из ссылки: ?c= — цифровой код (основной формат),
   ?s= — структурный код, ?config= — base64url(JSON), старые ссылки.
   Работает и через #hash. Если параметр есть, но битый — стартуем с ПУСТОЙ
   руки: демо-рука вводила бы в заблуждение, будто её собрал этот код. */
let badLink = false;
function loadFromURL() {
  const code = urlParam('c'), struct = urlParam('s'), legacy = urlParam('config');
  if (code === null && struct === null && legacy === null) return false;
  try {
    let data;
    if (code !== null) data = decodeArmCode(code);
    else if (struct !== null) data = decodeStructCode(struct);
    else data = JSON.parse(atob(legacy.replace(/-/g, '+').replace(/_/g, '/')));
    components = validateConfig(data); // null/битое — бросит исключение
    return true;
  } catch {
    badLink = true;
    components = [];
    return false;
  }
}
