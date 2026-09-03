'use strict';
/* ================= Обучение: пошаговая сборка первой руки ================= */

/* Сценарий: турель → звено → наклон → звено → вращение → схват */
const TUTORIAL = ['yaw', 'link', 'pitch', 'link', 'roll', 'gripper'];
const TUT_FLAVOR = [
  { en: 'Let\'s start with the base! The turntable spins the whole arm left and right.',
    ru: 'Начнём с основания! Турель — поворотный стол, она крутит всю руку влево-вправо.' },
  { en: 'Now a link — the "bone" of the arm: it makes the arm longer.',
    ru: 'Теперь звено — «кость» руки: оно делает её длиннее.' },
  { en: 'Add a pitch joint — the "elbow" that bends the arm.',
    ru: 'Добавим наклон — это сустав-«локоть», он сгибает руку.' },
  { en: 'One more link so the arm can reach farther.',
    ru: 'Ещё одно звено, чтобы рука дотягивалась дальше.' },
  { en: 'A roll joint — the "wrist": it spins the tool around its axis.',
    ru: 'Вращение — «запястье»: оно крутит инструмент вокруг своей оси.' },
  { en: 'And finally the gripper — the "fingers" that grab things!',
    ru: 'И последнее — схват! Это «пальцы», которыми рука хватает предметы.' },
];

let tutStep = -1; // -1 — обучение неактивно
const tutHint = document.getElementById('tutHint');
const tutModal = document.getElementById('tutModal');
const btnHelp = document.getElementById('btnHelp');

function hideTutModal() { tutModal.hidden = true; }

/* Оболочка модалки — общая для обучения и подтверждений: заголовок, текст и
   колонка кнопок `[{label, cb, primary}]`; клик по фону равносилен отмене. */
function showModal(title, text, buttons) {
  document.getElementById('tutTitle').textContent = title;
  document.getElementById('tutText').textContent = text;
  const actions = document.getElementById('tutActions');
  actions.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b.primary) el.className = 'primary';
    el.onclick = b.cb;
    actions.appendChild(el);
  }
  tutModal.hidden = false;
}

/* Диалоги: ask — два вопроса, about — «что это такое», done — поздравление */
function showTutModal(mode) {
  if (mode === 'ask') showModal(t('tutAskTitle'), t('tutAskText'), [
    { label: t('tutBtnWhat'), cb: () => showTutModal('about') },
    { label: t('tutBtnGuide'), cb: startTutorial, primary: true },
    { label: t('tutBtnLater'), cb: hideTutModal },
  ]);
  else if (mode === 'about') showModal(t('tutAboutTitle'), t('tutAboutText'), [
    { label: t('tutBtnTry'), cb: startTutorial, primary: true },
    { label: t('tutBtnOk'), cb: hideTutModal },
  ]);
  else showModal(t('tutDoneTitle'), t('tutDoneText'), [
    { label: t('tutBtnDone'), cb: hideTutModal, primary: true },
  ]);
}

btnHelp.onclick = () => showTutModal('ask');
tutModal.onclick = e => { if (e.target === tutModal) hideTutModal(); };

function clearTutHighlight() {
  for (const b of addRow.querySelectorAll('.tut-target')) b.classList.remove('tut-target');
}

/* Показ текущего шага: подсветка кнопки-цели + подсказка-попап */
function showTutStep(msgOverride) {
  clearTutHighlight();
  const type = TUTORIAL[tutStep];
  const btn = addRow.querySelector(`button[data-type="${type}"]`);
  if (btn) {
    btn.classList.add('tut-target');
    btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
  const name = tr(TYPES[type].label);
  tutHint.innerHTML = `<span class="tut-exit" title="${t('tutExitTip')}">✕</span>`
    + `<span class="tut-step">${t('tutStepTitle', tutStep + 1, TUTORIAL.length)}</span><div></div>`;
  tutHint.lastChild.textContent = msgOverride ?? `${tr(TUT_FLAVOR[tutStep])} ${t('tutPress', name)}`;
  tutHint.querySelector('.tut-exit').onclick = cancelTutorial;
  tutHint.hidden = false;
}

function startTutorial() {
  hideTutModal();
  stopChallenge(); // задания и обучение одновременно не ведём
  document.body.classList.remove('expanded'); // панель кнопок должна быть видна
  btnExpand.classList.remove('on');
  setPanelCollapsed(true); // панель не должна закрывать руку (особенно на мобильных)
  if (components.length) pushUndo();
  components = [];
  buildArm();
  renderPanel();
  camera.position.copy(CAM_HOME.pos);
  controls.target.copy(CAM_HOME.target);
  invalidate();
  startHint.hidden = true; // ведём своей подсказкой, стартовая не нужна
  tutStep = 0;
  showTutStep();
}

function advanceTutorial() {
  tutStep++;
  if (tutStep >= TUTORIAL.length) {
    cancelTutorial();
    showTutModal('done');
    return;
  }
  showTutStep();
}

/* нажата не та кнопка: мягкое напоминание, компонент не добавляем */
let tutFlashTimer = null;
function tutWrongFlash() {
  showTutStep(t('tutWrong', tr(TYPES[TUTORIAL[tutStep]].label)));
  clearTimeout(tutFlashTimer);
  tutFlashTimer = setTimeout(() => { if (tutStep >= 0) showTutStep(); }, 1800);
}

/* выход из обучения (крестик, генерация, Apply, отмена, удаление, новый проект) */
function cancelTutorial() {
  if (tutStep < 0) return;
  tutStep = -1;
  clearTutHighlight();
  tutHint.hidden = true;
  setPanelCollapsed(false); // обучение закончено — вернуть панель
}
