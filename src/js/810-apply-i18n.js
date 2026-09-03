'use strict';
/* ================= Применение языка ================= */

const TAB_STR = { components: 'tabParts', jsonarea: 'tabJson', urdfarea: 'tabUrdf', actarea: 'tabLog', twinarea: 'tabTwin', bom: 'tabBom' };

/* Статические подписи + перерисовка кнопок добавления */
function applyI18n() {
  document.documentElement.lang = lang;
  document.title = t('docTitle');
  document.getElementById('metaDesc').content = t('metaDesc');
  document.getElementById('appTitle').textContent = t('appTitle');
  document.getElementById('version').textContent = 'v' + VERSION;
  for (const b of document.querySelectorAll('#themeSw button')) {
    b.title = t(b.dataset.theme === 'dark' ? 'themeDark' : 'themeLight');
  }
  document.getElementById('hint').textContent = t('hint');
  document.getElementById('animLbl').textContent = t('animate');
  document.getElementById('animToggle').title = t('animateTip');
  document.getElementById('btnGenerate').textContent = t('generate');
  const btnNew = document.getElementById('btnNew');
  btnNew.textContent = t('newProject');
  btnNew.title = t('newTip');
  document.getElementById('jsonTitle').textContent = t('jsonTitle');
  document.getElementById('btnApply').textContent = t('apply');
  document.getElementById('btnCopy').textContent = t('copy');
  document.getElementById('urdfTitle').textContent = t('urdfTitle');
  document.getElementById('btnUrdfCopy').textContent = t('copy');
  document.getElementById('btnUrdfSave').textContent = t('save');
  const btnShare = document.getElementById('btnShare');
  btnShare.textContent = t('share');
  btnShare.title = t('shareTip');
  btnIK.textContent = t('ik');
  btnIK.title = t('ikTip');
  const bUndo = document.getElementById('btnUndo');
  bUndo.textContent = t('undo');
  bUndo.title = t('undoTip');
  document.getElementById('fitLbl').textContent = t('fit');
  document.getElementById('fitToggle').title = t('fitTip');
  document.getElementById('btnPanel').title = t('panelTip');
  const bExpand = document.getElementById('btnExpand');
  bExpand.title = t(document.body.classList.contains('expanded') ? 'collapseTip' : 'expandTip');
  const authorLink = document.getElementById('authorLink');
  authorLink.textContent = t('author');
  authorLink.title = t('authorTip');
  const licLink = document.getElementById('licenseLink');
  licLink.textContent = t('license');
  licLink.title = t('licenseTip');
  document.getElementById('btnHelp').title = t('helpTip');
  renderChalButton();
  if (chal) { renderChalHUD(); renderLog(); }
  if (tutStep >= 0) showTutStep(); // renderAddRow пересоздал кнопки — вернуть подсветку
  document.getElementById('bomTitle').textContent = t('bomTitle');
  document.getElementById('bomNote').textContent = t('bomNote');
  document.getElementById('cartTitle').textContent = t('cartTitle');
  document.getElementById('twinTitle').textContent = t('twinTitle');
  document.getElementById('twinNote').textContent = t('twinNote');
  document.getElementById('twinSendLbl').textContent = t('twinSend');
  document.getElementById('twinRecvLbl').textContent = t('twinRecv');
  document.getElementById('btnTwinHome').textContent = t('twinHome');
  document.getElementById('btnTwinStop').textContent = t('twinStop');
  document.getElementById('twinProto').textContent = t('twinProto');
  document.getElementById('twinLogTitle').textContent = t('twinLogTitle');
  document.getElementById('btnTwinLogClear').textContent = t('twinLogClear');
  twinRenderStatus();
  twinRenderAxes(true);
  document.getElementById('cartNote').textContent = t('cartNote');
  btnCartCopy.textContent = t('cartCopy');
  btnCartClear.textContent = t('cartClear');
  startHint.textContent = t(startHint.classList.contains('warn') ? 'badLink' : 'startHint');
  for (const b of document.querySelectorAll('#tabs button')) b.textContent = t(TAB_STR[b.dataset.tab]);
  for (const b of document.querySelectorAll('#langSw button')) b.classList.toggle('active', b.dataset.lang === lang);
  renderAddRow();
}

/* Смена языка: подписи + производные представления (карточки, BOM) */
function setLang(l) {
  if (!LANGS.includes(l) || l === lang) return;
  lang = l;
  langChosen = true;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* file:// без хранилища */ }
  applyI18n();
  renderPanel();
  updateBOM();
}

for (const b of document.querySelectorAll('#langSw button')) {
  b.onclick = () => setLang(b.dataset.lang);
}
