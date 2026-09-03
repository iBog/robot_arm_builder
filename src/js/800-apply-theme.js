'use strict';
/* ================= Применение темы ================= */

/* Обновляет сцену и состояние переключателя; рука перекрашивается пересборкой */
function applyTheme() {
  SCN = SCENE_THEME[theme];
  document.documentElement.dataset.theme = theme;
  document.getElementById('metaTheme').content =
    getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  scene.background.setHex(SCN.bg);
  scene.fog.color.setHex(SCN.bg);
  ground.material.color.setHex(SCN.ground);
  hemi.color.setHex(SCN.hemiSky);
  hemi.groundColor.setHex(SCN.hemiGround);
  hemi.intensity = SCN.hemiInt;
  sun.intensity = SCN.sunInt;
  scene.remove(grid);
  grid.geometry.dispose();
  grid.material.dispose();
  grid = makeGrid();
  scene.add(grid);
  for (const b of document.querySelectorAll('#themeSw button')) {
    b.classList.toggle('active', b.dataset.theme === theme);
  }
  invalidate();
}

function setTheme(th) {
  if (!THEMES.includes(th) || th === theme) return;
  theme = th;
  themeChosen = true;
  try { localStorage.setItem(THEME_KEY, th); } catch { /* file:// без хранилища */ }
  applyTheme();
  buildArm(); // цвета деталей берутся из SCN при сборке
}

for (const b of document.querySelectorAll('#themeSw button')) {
  b.onclick = () => setTheme(b.dataset.theme);
}

/* ---- Стиль деталей (см. 045-style.js): форма меняется пересборкой руки ---- */
function applyStyle() {
  STYLE = STYLES[style];
  for (const b of document.querySelectorAll('#styleSw button')) b.classList.toggle('active', b.dataset.style === style);
}
function setStyle(st) {
  if (!STYLES[st] || st === style) return;
  style = st;
  styleChosen = true;
  try { localStorage.setItem(STYLE_KEY, st); } catch { /* file:// без хранилища */ }
  applyStyle();
  buildArm(); // форма деталей и объём печати (BOM) зависят от стиля
}
for (const b of document.querySelectorAll('#styleSw button')) b.onclick = () => setStyle(b.dataset.style);
