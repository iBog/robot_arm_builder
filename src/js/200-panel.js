'use strict';
/* ================= UI: панель компонентов ================= */

const addRow = document.getElementById('addRow');
const compList = document.getElementById('components');

function renderAddRow() {
  addRow.innerHTML = '';
  for (const [type, ty] of Object.entries(TYPES)) {
    const b = document.createElement('button');
    const hex = '#' + ty.color.toString(16).padStart(6, '0');
    b.innerHTML = `${iconSVG(type, 18)}+ ${tr(ty.label)}`;
    b.style.borderColor = hex + '55';
    b.title = t('addTip', tr(ty.label));
    b.dataset.type = type; // для подсветки шага обучения
    b.onclick = () => {
      /* в обучении принимаем только кнопку текущего шага */
      if (tutStep >= 0 && type !== TUTORIAL[tutStep]) { tutWrongFlash(); return; }
      const c = { type };
      for (const p of ty.params) c[p.key] = p.def;
      pushUndo();
      components.push(c);
      recordAction({ kind: 'add', i: components.length - 1, comp: clone(c) });
      buildArm();
      renderPanel();
      if (tutStep >= 0) advanceTutorial();
    };
    addRow.appendChild(b);
  }
}

function renderPanel() {
  compList.innerHTML = '';
  if (!components.length) {
    compList.innerHTML = `<div id="empty">${t('empty')}<br>${t('emptyHint')}</div>`;
    return;
  }
  const note = document.createElement('div');
  note.id = 'orderNote';
  note.textContent = t('orderNote');
  compList.appendChild(note);
  components.forEach((c, i) => {
    const ty = TYPES[c.type];
    const card = document.createElement('div');
    card.className = 'comp';

    const head = document.createElement('div');
    head.className = 'comp-head';
    head.innerHTML = `<span class="num" style="background:#${ty.color.toString(16).padStart(6,'0')}">${i + 1}</span>
      ${iconSVG(c.type, 24)}<span class="name">${tr(ty.label)}</span>`;
    if (c._zone) {
      const zoneLbl = document.createElement('label');
      zoneLbl.className = 'zone-lbl';
      zoneLbl.title = t('zoneTip');
      const zoneToggle = document.createElement('input');
      zoneToggle.type = 'checkbox';
      zoneToggle.className = 'zone-toggle';
      zoneToggle.checked = c.showZone !== false;
      zoneToggle.onchange = () => {
        c.showZone = zoneToggle.checked;
        if (c._zone) c._zone.visible = zoneToggle.checked;
        invalidate();
      };
      zoneLbl.appendChild(zoneToggle);
      zoneLbl.appendChild(document.createTextNode(t('zone')));
      head.appendChild(zoneLbl);
    }
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '✕'; del.title = t('remove');
    del.onclick = () => {
      cancelTutorial();
      pushUndo();
      const snap = cleanConfig()[i];
      components.splice(i, 1);
      buildArm();
      renderPanel();
      recordAction({ kind: 'del', i, comp: snap });
    };
    head.appendChild(del);
    card.appendChild(head);

    for (const p of ty.params) {
      const row = document.createElement('div');
      row.className = 'ctrl';
      const label = document.createElement('label');
      label.textContent = tr(p.label);
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = p.min; slider.max = paramMax(c, p); slider.step = p.step;
      slider.value = c[p.key] ?? p.def;
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = slider.value;
      /* габарит настраивается, только пока компонент последний в цепочке */
      if (p.build && i !== components.length - 1) {
        slider.disabled = true;
        row.classList.add('locked');
        row.title = t('lockedTip');
        label.textContent = '🔒 ' + label.textContent;
      }
      slider.oninput = () => {
        /* запись действий: одно перетаскивание слайдера — одна запись (from фиксируется в начале) */
        if (chal && !chal.replay && c._actFrom?.[p.key] === undefined) {
          (c._actFrom = c._actFrom || {})[p.key] = c[p.key] ?? p.def;
        }
        const v = setParamChecked(c, p.key, parseFloat(slider.value));
        if (v !== parseFloat(slider.value)) slider.value = v; // упёрлись в пол
        val.textContent = quantParam(v, p);
        /* зависимые параметры (ext ≤ length): подтянуть диапазон слайдера */
        for (const q of ty.params) {
          if (q.maxOf !== p.key) continue;
          const s = c._sliders?.[q.key];
          if (s) { s.slider.max = paramMax(c, q); s.slider.value = c[q.key]; s.val.textContent = quantParam(c[q.key], q); }
        }
      };
      slider.onchange = () => {
        const from = c._actFrom?.[p.key];
        if (from === undefined) return;
        delete c._actFrom[p.key];
        recordAction({ kind: 'param', i: components.indexOf(c), type: c.type, key: p.key, from, to: c[p.key] });
      };
      c._sliders = c._sliders || {};
      c._sliders[p.key] = { slider, val };
      row.append(label, slider, val);
      card.appendChild(row);
    }
    compList.appendChild(card);
  });
}
