'use strict';
/* ================= Тема: dark / light ================= */

/* Палитра интерфейса — в CSS (`:root[data-theme]`), здесь — цвета 3D-сцены. */
const SCENE_THEME = {
  dark: {
    bg: 0x14171c, ground: 0x1b2027, grid1: 0x3a4656, grid2: 0x242c37,
    base: 0x3d4654, joint: 0x2c333f, metal: 0xcfd6e0, mark: 0xffffff,
    shell: 0xe4e7ec, motor: 0x1f2329, inset: 0x202630, fastener: 0xaeb7c3,
    hemiSky: 0xcfe4ff, hemiGround: 0x2a2620, hemiInt: 0.9, sunInt: 1.6,
    zoneFill: 0.10, zoneLine: 0.55, zoneShade: 1, zoneSat: 1,
  },
  light: {
    bg: 0xb7bbc2, ground: 0xd0d4d9, grid1: 0x767c85, grid2: 0x9aa1a9,
    base: 0x7d848e, joint: 0x6b727c, metal: 0xeaedf1, mark: 0x2b3038,
    shell: 0xf4f5f7, motor: 0x2a2e35, inset: 0x555d68, fastener: 0x9da5af,
    hemiSky: 0xffffff, hemiGround: 0x9aa0a8, hemiInt: 1.15, sunInt: 1.35,
    /* на светлом полу цвет типа выцветает — зоны берут его затемнённым и насыщенным */
    zoneFill: 0.26, zoneLine: 1, zoneShade: 0.5, zoneSat: 1.25,
  },
};

const THEMES = ['dark', 'light'];
const THEME_KEY = 'roboArmTheme';

function storedTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}
const urlTheme = (urlParam('theme') || '').toLowerCase();
let themeChosen = THEMES.includes(urlTheme); // тема задана явно — уйдёт и в ссылку «Share»
let theme = themeChosen ? urlTheme : THEMES.includes(storedTheme()) ? storedTheme() : 'light';
/* SCN — цвета сцены текущей темы; перечитывается в applyTheme() */
let SCN = SCENE_THEME[theme];
document.documentElement.dataset.theme = theme; // до отрисовки, чтобы не мигало
