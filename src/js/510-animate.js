'use strict';
/* ================= Animate ================= */

const chkAnimate = document.getElementById('chkAnimate');
let lastJsonSync = 0;

/* подсветка кнопки в такт состоянию: включённая анимация видна сразу */
function syncAnimToggle() {
  document.getElementById('animToggle').classList.toggle('on', chkAnimate.checked);
}

/* ---- Fit: авто-вписывание руки в кадр (выкл — полностью свободная камера) ---- */
const chkFit = document.getElementById('chkFit');

function syncFitToggle() {
  document.getElementById('fitToggle').classList.toggle('on', chkFit.checked);
}
chkFit.onchange = syncFitToggle;

/* ---- Сворачиваемая панель Parts/JSON/BOM ---- */
const btnPanel = document.getElementById('btnPanel');

function setPanelCollapsed(v) {
  document.body.classList.toggle('panelCollapsed', v);
  btnPanel.classList.toggle('on', v);
}

btnPanel.onclick = () => setPanelCollapsed(!document.body.classList.contains('panelCollapsed'));

/* ---- Развёрнутый 3D-вид: скрывает всё, кроме шапки и вьюпорта ---- */
const btnExpand = document.getElementById('btnExpand');
btnExpand.onclick = () => {
  const on = document.body.classList.toggle('expanded');
  btnExpand.classList.toggle('on', on);
  btnExpand.title = t(on ? 'collapseTip' : 'expandTip');
};

/* значение, приведённое к шагу слайдера (для подписей и фиксации поз) */
function quantParam(v, p) { return p.step >= 1 ? Math.round(v) : +v.toFixed(2); }

chkAnimate.onchange = () => {
  syncAnimToggle();
  if (chkAnimate.checked) {
    /* анимация качается вокруг текущих поз */
    for (const c of components) delete c._anim;
  } else {
    /* при остановке — привести плавающие значения анимации к шагу слайдера */
    for (const c of components) {
      for (const p of TYPES[c.type].params) {
        if (p.build || typeof c[p.key] !== 'number') continue;
        applyParamChecked(c, p.key, quantParam(c[p.key], p)); // округление не должно увести под пол
        const s = c._sliders?.[p.key];
        if (s) { s.slider.value = c[p.key]; s.val.textContent = quantParam(c[p.key], p); }
      }
    }
    updateJSONView(); // зафиксировать финальные значения
    updateURDFView();
  }
};

let lastAnimNow = 0;
function animateArm(now) {
  const dt = lastAnimNow ? Math.min(0.05, Math.max(0, (now - lastAnimNow) / 1000)) : 0;
  lastAnimNow = now;
  components.forEach((c, i) => {
    const params = TYPES[c.type].params.filter(p => !p.build); // габариты не анимируются
    if (!params.length) return;
    if (!c._anim) {
      /* качание вокруг текущих поз; фаза своя, чтобы у пола развернуться */
      c._anim = {};
      for (const p of params) c._anim[p.key] = { base: c[p.key] ?? p.def, phase: 0, dir: 1 };
    }
    for (const [j, p] of params.entries()) {
      const a = c._anim[p.key], max = paramMax(c, p);
      const amp = (max - p.min) * 0.25;
      const speed = 0.5 + ((i * 2 + j) % 4) * 0.22;
      a.phase += speed * dt * a.dir;
      const v = Math.min(max, Math.max(p.min, a.base + amp * Math.sin(a.phase + i * 1.3 + j * 2.1)));
      /* в 3D идёт точное значение — квантование до шага слайдера дёргало
         дальние звенья цепочки; округляем только подпись */
      const acc = applyParamChecked(c, p.key, v);
      if (acc !== v) {
        /* упёрлись в пол: колебание продолжается от принятого значения в обратную сторону */
        a.base += acc - v;
        a.dir = -a.dir;
      }
      const s = c._sliders?.[p.key];
      if (s) { s.slider.value = acc; s.val.textContent = quantParam(acc, p); }
    }
  });
  if (now - lastJsonSync > 300) { lastJsonSync = now; updateJSONView(); }
}
