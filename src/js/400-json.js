'use strict';
/* ================= JSON ================= */

const jsonText = document.getElementById('jsonText');
const jsonStatus = document.getElementById('jsonStatus');

/* @pure config */
function cleanConfig(list = components) {
  return list.map(c => {
    const out = { type: c.type };
    for (const p of TYPES[c.type].params) {
      const v = c[p.key] ?? p.def;
      /* во время анимации значения плавающие — в JSON без длинных хвостов */
      out[p.key] = typeof v === 'number' ? +v.toFixed(2) : v;
    }
    return out;
  });
}
/* @pure end */

function updateJSONView() {
  if (document.activeElement === jsonText) return; // не мешаем ручному редактированию
  jsonText.value = JSON.stringify(cleanConfig(), null, 2);
}

function flashStatus(el, text, cls) {
  el.textContent = text;
  el.className = cls || '';
  if (text) setTimeout(() => { if (el.textContent === text) { el.textContent = ''; el.className = ''; } }, 3000);
}

function setStatus(text, cls) { flashStatus(jsonStatus, text, cls); }

/* @pure validate */
/* Валидация конфигурации (Apply и ?config= из URL): неизвестный тип — ошибка,
   значения зажимаются в min/max, пропущенные параметры добираются из def */
function validateConfig(data) {
  if (!Array.isArray(data)) throw new Error(t('errArray'));
  for (const [i, c] of data.entries()) {
    if (!c || !TYPES[c.type]) throw new Error(t('errType', i + 1, c && c.type));
    for (const p of TYPES[c.type].params) {
      if (c[p.key] === undefined) c[p.key] = p.def;
      c[p.key] = Math.min(p.max, Math.max(p.min, +c[p.key] || 0));
    }
    for (const p of TYPES[c.type].params) c[p.key] = Math.min(c[p.key], paramMax(c, p)); // ext ≤ length
  }
  return data;
}
/* @pure end */

document.getElementById('btnApply').onclick = () => {
  try {
    const data = validateConfig(JSON.parse(jsonText.value));
    cancelTutorial();
    pushUndo();
    withLog(() => { components = data; buildArm(); renderPanel(); });
    setStatus(t('applied'), 'ok');
  } catch (e) {
    setStatus(t('errPrefix', e.message), 'err');
  }
};

/* Копирование в буфер: clipboard API → временная textarea (execCommand;
   выделять #jsonText нельзя — на мобильных его вкладка скрыта и select()
   не срабатывает) → системная шторка «Поделиться», если и это не вышло */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* дальше фолбэк */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.readOnly = true;
  /* font-size 16px — iOS не зумит страницу при фокусе */
  ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0;font-size:16px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length); // iOS игнорирует select()
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* нет execCommand */ }
  ta.remove();
  if (!ok && navigator.share) {
    try {
      await navigator.share(/^https?:/.test(text) ? { url: text } : { text });
      ok = true;
    } catch { /* пользователь закрыл шторку */ }
  }
  return ok;
}

document.getElementById('btnCopy').onclick = async () => {
  if (await copyText(jsonText.value)) setStatus(t('copied'), 'ok');
};
