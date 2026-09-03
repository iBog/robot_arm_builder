'use strict';
/* ================= Подсказка «с чего начать» ================= */

const startHint = document.getElementById('startHint');
startHint.onclick = () => { startHint.hidden = true; };

/* показывается после очистки проекта и гаснет, как только появился компонент */
function showStartHint() {
  startHint.classList.remove('warn');
  startHint.textContent = t('startHint');
  startHint.hidden = false;
}

/* предупреждение о битом коде в ссылке (рука при этом пустая) */
function showBadLink() {
  startHint.classList.add('warn');
  startHint.textContent = t('badLink');
  startHint.hidden = false;
}
