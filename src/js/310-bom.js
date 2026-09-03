'use strict';
/* ================= BOM: список закупки и корзина ================= */

/* Данные (PARTS, ALTS, NEEDS) — в 300-parts-catalog.js; здесь только движок:
   группы закупки по составу руки, замены, таблица, корзина. */

/* Самопроверка каталога при старте — в духе checkCodeSpec(): у каждой детали есть
   названия и число-цена, url (если задан) — строка-адрес, ALTS и NEEDS ссылаются
   только на существующие детали, NEEDS покрывает все типы TYPES. */
function checkCatalog() {
  const errors = [];
  for (const [key, p] of Object.entries(PARTS)) {
    if (!/^[a-z][a-z0-9]*$/.test(key)) errors.push(`PARTS.${key}: ключ — латиница и цифры без пробелов`);
    if (typeof p.ru !== 'string' || typeof p.en !== 'string' || !p.ru || !p.en) errors.push(`PARTS.${key}: нужны названия ru и en`);
    if (typeof p.price !== 'number' || !(p.price >= 0)) errors.push(`PARTS.${key}: price должна быть числом ≥ 0`);
    if (p.url !== undefined && !/^https?:\/\/\S+$/.test(p.url)) errors.push(`PARTS.${key}: url должен быть адресом http(s)`);
  }
  for (const [key, alts] of Object.entries(ALTS)) {
    if (!PARTS[key]) errors.push(`ALTS.${key}: нет такой детали в PARTS`);
    for (const a of alts) if (!PARTS[a]) errors.push(`ALTS.${key}: замена "${a}" отсутствует в PARTS`);
    if (alts.length > 4) errors.push(`ALTS.${key}: больше 4 замен`);
  }
  for (const [type, needs] of Object.entries(NEEDS)) {
    if (!TYPES[type]) errors.push(`NEEDS.${type}: нет такого типа компонента`);
    for (const [k, n] of Object.entries(needs)) {
      if (!PARTS[k]) errors.push(`NEEDS.${type}: деталь "${k}" отсутствует в PARTS`);
      if (!Number.isInteger(n) || n <= 0) errors.push(`NEEDS.${type}.${k}: количество должно быть целым > 0`);
    }
  }
  for (const type of Object.keys(TYPES)) if (!NEEDS[type]) errors.push(`NEEDS: нет записи для типа ${type}`);
  for (const e of errors) console.error(`Robo-Arm: каталог деталей (300-parts-catalog.js): ${e}`);
  return !errors.length;
}

/* выбранные замены: базовый ключ → ключ альтернативы */
const swaps = {};
function usedPart(key) { return swaps[key] || key; }
const bomTable = document.getElementById('bomTable');
const armNameEl = document.getElementById('armName');
const printInfo = document.getElementById('printInfo');

/* название руки в принятой номенклатуре: «N-осевой манипулятор с захватом» */
function armName() {
  if (!components.length) return { ru: 'Пустая конфигурация', en: 'Empty configuration' };

  const AXES = { yaw: 1, pitch: 1, roll: 1, prismatic: 1, spherical: 2 };
  /* наконечник → его название в имени руки (творительный падеж / with …) */
  const EFFECTORS = {
    gripper: { ru: 'захватом', en: 'gripper' },
    suction: { ru: 'вакуумной присоской', en: 'suction cup' },
    drill:   { ru: 'сверлом', en: 'drill' },
    mill:    { ru: 'фрезой', en: 'milling cutter' },
  };
  let axes = 0, rails = 0;
  const effRu = [], effEn = [];
  for (const c of components) {
    axes += AXES[c.type] ?? 0;
    if (c.type === 'rail') rails++;
    const eff = EFFECTORS[c.type];
    if (eff && !effRu.includes(eff.ru)) { effRu.push(eff.ru); effEn.push(eff.en); }
  }

  let ru, en;
  if (axes === 0) { ru = 'Статическая конструкция'; en = 'Static structure'; }
  else { ru = `${axes}-осевой манипулятор`; en = `${axes}-axis manipulator`; }

  if (rails) { ru += ' на линейном рельсе'; en += ' on linear rail'; }

  if (effRu.length) {
    /* «со сверлом», но «с захватом» */
    ru += (effRu[0][0] === 'с' ? ' со ' : ' с ') + effRu.join(' и ');
    en += ' with ' + effEn.join(' and ');
  } else if (axes > 0) { ru += ' без концевого эффектора'; en += ' without end effector'; }

  return { ru, en };
}

function fmt$(v) { return '$' + (Math.round(v * 100) / 100).toLocaleString('en-US'); }

/* Группы закупки: одна на каждый тип компонента в руке + базовый комплект.
   Порядок групп — как в руке, от основания к концу. */
function bomGroups() {
  const byType = new Map();
  for (const c of components) {
    const needs = NEEDS[c.type];
    if (!needs) continue;
    let g = byType.get(c.type);
    if (!g) byType.set(c.type, g = { label: tr(TYPES[c.type].label), count: 0, parts: {} });
    g.count++;
    for (const [key, n] of Object.entries(needs)) g.parts[key] = (g.parts[key] || 0) + n;
  }
  /* печать — по массе: NEEDS лишь отмечает, что деталь печатная, количество (в единицах
     по 100 г) считается из объёма форм компонента и текущего стиля */
  const printQty = grams => Math.max(0.1, Math.round(grams / PRINT_UNIT_G * 10) / 10);
  for (const [type, g] of byType) if (g.parts.print) {
    g.grams = components.filter(c => c.type === type).reduce((s, c) => s + partPrint(c).grams, 0);
    g.parts.print = printQty(g.grams);
  }
  const groups = [...byType.values()];
  if (components.length) {
    /* базовая электроника — один комплект на руку, по конденсатору на драйвер; основание печатное */
    const drivers = groups.reduce((s, g) => s + (g.parts.tmc2209 || 0), 0);
    const grams = basePrint().grams;
    const parts = { esp32: 1, buck: 1, psu: 1, hw: 1, print: printQty(grams) };
    if (drivers) parts.cap = drivers;
    groups.push({ label: t('bomBase'), count: 1, parts, grams });
  }
  return groups;
}

/* ссылка «↗» на страницу товара, если у детали задан url */
function partLink(key) {
  const url = PARTS[key].url;
  return url ? ` <a class="plink" href="${url}" target="_blank" rel="noopener" title="${t('partLinkTip')}">↗</a>` : '';
}

/* Ячейка названия: список замен, если они есть для этой детали */
function partCell(key) {
  const use = usedPart(key);
  if (!ALTS[key]) return tr(PARTS[use]) + partLink(use);
  const opts = [key, ...ALTS[key]]
    .map(k => `<option value="${k}"${k === use ? ' selected' : ''}>${tr(PARTS[k])}</option>`)
    .join('');
  return `<span class="pname"><select data-part="${key}"${use === key ? '' : ' class="swapped"'}
    title="${t('bomAltTip')}">${opts}</select>${partLink(use)}</span>`;
}

function updateBOM() {
  const name = armName();
  armNameEl.textContent = `🦾 ${tr(name)}`;

  const groups = bomGroups();
  const pr = armPrint();
  printInfo.textContent = components.length
    ? t('printInfo', tr(STYLE.label), pr.cm3, pr.grams, fmt$(pr.grams / PRINT_UNIT_G * PARTS[usedPart('print')].price))
    : '';
  if (!groups.length) {
    bomTable.innerHTML = `<tr><td>${t('bomEmpty')}</td></tr>`;
    renderCart();
    return;
  }

  let html = `<tr>
    <th>${t('colName')}<button class="cart-btn cart-all" title="${t('cartAddAllTip')}">${t('cartAddAll')}</button></th>
    <th class="num">${t('colQty')}</th>
    <th class="num">${t('colPrice')}</th>
    <th class="num">${t('colSum')}</th>
    <th></th>
  </tr>`;
  let total = 0;

  groups.forEach((g, gi) => {
    let rows = '', sub = 0;
    for (const key of Object.keys(PARTS)) {
      const n = g.parts[key];
      if (!n) continue;
      const use = usedPart(key);
      const price = PARTS[use].price;
      sub += n * price;
      rows += `<tr>
        <td>${partCell(key)}</td>
        <td class="num">${n}</td>
        <td class="num">${fmt$(price)}</td>
        <td class="num">${fmt$(n * price)}</td>
        <td class="cart"><button class="cart-btn cart-add" data-part="${use}" data-n="${n}" title="${t('cartAddTip')}">+</button></td>
      </tr>`;
    }
    if (!rows) return;
    total += sub;
    html += `<tr class="group">
      <td colspan="3">${g.label}${g.count > 1 ? ` <span class="mult">×${g.count}</span>` : ''}${g.grams ? ` <span class="grams">${g.grams} ${t('gramsShort')}</span>` : ''}
        <button class="cart-btn cart-group" data-group="${gi}" title="${t('cartAddGroupTip')}">${t('cartAddGroup')}</button></td>
      <td class="num">${fmt$(sub)}</td>
      <td></td>
    </tr>${rows}`;
  });

  html += `<tr class="total">
    <td colspan="3">${t('total')}</td>
    <td class="num">${fmt$(total)}</td>
    <td></td>
  </tr>`;
  bomTable.innerHTML = html;

  for (const sel of bomTable.querySelectorAll('select')) {
    sel.onchange = () => {
      const key = sel.dataset.part;
      if (sel.value === key) delete swaps[key]; else swaps[key] = sel.value;
      updateBOM();
    };
  }
  /* в корзину: строка (в количестве строки, деталь — с учётом замены), секция, весь список */
  const groupParts = g => Object.entries(g.parts).map(([key, n]) => [usedPart(key), Math.ceil(n)]); // печать — дробные сотни граммов
  for (const b of bomTable.querySelectorAll('.cart-add')) b.onclick = () => cartAdd([[b.dataset.part, Math.ceil(+b.dataset.n)]]);
  for (const b of bomTable.querySelectorAll('.cart-group')) b.onclick = () => cartAdd(groupParts(groups[+b.dataset.group]));
  bomTable.querySelector('.cart-all').onclick = () => cartAdd(groups.flatMap(groupParts));
  renderCart();
}

/* ---- Корзина: что решили купить. Конкретные детали (замена — та, что была выбрана в момент
   добавления) → количество. Хранится в localStorage этого браузера; в JSON руки и в ссылку не
   попадает, как и swaps. ---- */
const CART_KEY = 'roboArmCart';
const cart = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    const out = {};
    for (const [k, n] of Object.entries(raw)) if (PARTS[k] && Number.isInteger(n) && n > 0) out[k] = n;
    return out;
  } catch { return {}; } // file:// без хранилища или битая запись
})();
const cartTable = document.getElementById('cartTable');
const cartSummary = document.getElementById('cartSummary');
const btnCartCopy = document.getElementById('btnCartCopy');
const btnCartClear = document.getElementById('btnCartClear');

function saveCart() {
  try {
    if (Object.keys(cart).length) localStorage.setItem(CART_KEY, JSON.stringify(cart));
    else localStorage.removeItem(CART_KEY);
  } catch { /* file:// без хранилища */ }
}

/* items — пары [ключ PARTS, количество]; отрицательное убавляет, до нуля — строка уходит */
function cartAdd(items) {
  for (const [key, n] of items) {
    if (!PARTS[key]) continue;
    const q = (cart[key] || 0) + n;
    if (q > 0) cart[key] = q; else delete cart[key];
  }
  saveCart();
  renderCart();
}

function cartClear() {
  for (const k of Object.keys(cart)) delete cart[k];
  saveCart();
  renderCart();
}

/* строки корзины в порядке каталога PARTS */
function cartRows() {
  return Object.keys(PARTS).filter(k => cart[k]).map(k => ({ key: k, n: cart[k], price: PARTS[k].price }));
}

/* текст для заказа: «название × количество — сумма [ссылка]», в конце итог */
function cartText() {
  const rows = cartRows();
  const lines = rows.map(r => `${tr(PARTS[r.key])} × ${r.n} — ${fmt$(r.n * r.price)}${PARTS[r.key].url ? `  ${PARTS[r.key].url}` : ''}`);
  lines.push(`${t('total')}: ${fmt$(rows.reduce((s, r) => s + r.n * r.price, 0))}`);
  return lines.join('\n');
}

function renderCart() {
  const rows = cartRows();
  const total = rows.reduce((s, r) => s + r.n * r.price, 0);
  const qty = rows.reduce((s, r) => s + r.n, 0);
  cartSummary.textContent = rows.length ? t('cartSummary', rows.length, qty) : '';
  btnCartCopy.disabled = btnCartClear.disabled = !rows.length;
  if (!rows.length) { cartTable.innerHTML = `<tr><td class="empty">${t('cartEmpty')}</td></tr>`; return; }

  let html = `<tr>
    <th>${t('colName')}</th>
    <th class="num">${t('colQty')}</th>
    <th class="num">${t('colPrice')}</th>
    <th class="num">${t('colSum')}</th>
    <th></th>
  </tr>`;
  for (const r of rows) {
    html += `<tr data-part="${r.key}">
      <td>${tr(PARTS[r.key])}${partLink(r.key)}</td>
      <td class="num qty"><button class="cart-btn" data-d="-1" title="−1">−</button><span>${r.n}</span><button class="cart-btn" data-d="1" title="+1">+</button></td>
      <td class="num">${fmt$(r.price)}</td>
      <td class="num">${fmt$(r.n * r.price)}</td>
      <td class="cart"><button class="cart-btn cart-del" title="${t('cartRemoveTip')}">✕</button></td>
    </tr>`;
  }
  html += `<tr class="total">
    <td colspan="3">${t('total')}</td>
    <td class="num">${fmt$(total)}</td>
    <td></td>
  </tr>`;
  cartTable.innerHTML = html;

  const partOf = b => b.closest('tr').dataset.part;
  for (const b of cartTable.querySelectorAll('button[data-d]')) b.onclick = () => cartAdd([[partOf(b), +b.dataset.d]]);
  for (const b of cartTable.querySelectorAll('.cart-del')) b.onclick = () => cartAdd([[partOf(b), -cart[partOf(b)]]]);
}

btnCartClear.onclick = cartClear;
btnCartCopy.onclick = async () => {
  if (!await copyText(cartText())) return;
  btnCartCopy.textContent = t('copied');
  setTimeout(() => { btnCartCopy.textContent = t('cartCopy'); }, 1500);
};
