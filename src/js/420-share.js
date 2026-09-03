'use strict';
/* ---- Ссылка на текущую конфигурацию: цифровой код в параметре ?c= ---- */

/* Язык и тема попадают в ссылку, если заданы явно: пришли из ссылки при открытии
   или переключены в процессе работы (флаги langChosen/themeChosen/styleChosen). Иначе
   получатель откроет страницу со своими настройками. */
function shareExtras() {
  return (langChosen ? `&lang=${lang}` : '') + (themeChosen ? `&theme=${theme}` : '') + (styleChosen ? `&style=${style}` : '');
}
function shareURL() {
  return `${SHARE_BASE}?c=${groupCode(encodeArmCode())}${shareExtras()}`;
}
function structShareURL() {
  return `${SHARE_BASE}?s=${groupCode(encodeStructCode())}${shareExtras()}`;
}

/* Клик — короткая ссылка (?s=, только состав, позы по умолчанию: её легко
   запомнить и продиктовать), долгое нажатие (≥600 мс) — полная (?c=, с позами
   и длинами). Обе сразу уходят в буфер обмена. */
const btnShare = document.getElementById('btnShare');
const LONG_PRESS_MS = 600;
let sharePressTimer = null;
let shareLongFired = false;

async function copyShare(struct) {
  if (!await copyText(struct ? structShareURL() : shareURL())) return;
  btnShare.textContent = t(struct ? 'shortCopied' : 'shareCopied');
  btnShare.classList.add('done');
  setTimeout(() => {
    btnShare.textContent = t('share');
    btnShare.classList.remove('done');
  }, 2000);
}

btnShare.onclick = () => {
  if (shareLongFired) { shareLongFired = false; return; } // клик после долгого нажатия
  copyShare(true);
};
btnShare.addEventListener('pointerdown', () => {
  shareLongFired = false;
  clearTimeout(sharePressTimer);
  sharePressTimer = setTimeout(() => { shareLongFired = true; copyShare(false); }, LONG_PRESS_MS);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
  btnShare.addEventListener(ev, () => clearTimeout(sharePressTimer));
}
/* долгое касание на мобильных не должно открывать контекстное меню */
btnShare.addEventListener('contextmenu', e => e.preventDefault());
