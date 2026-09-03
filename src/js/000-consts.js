'use strict';
/* ================= Константы: версия и адрес ссылок ================= */

/* Версия проекта — инкрементируется при каждом заметном изменении */
const VERSION = '1.7.0';

/* Адрес для ссылок кнопки «Ссылка» — тот, откуда открыта страница (свой домен,
   GitHub Pages, локальный сервер), чтобы шэринг не уводил трафик с нового адреса;
   завершающий index.html отбрасывается. При file:// — публичный адрес-запасной. */
const SHARE_FALLBACK = 'https://robot.experimentalui.com/';
const SHARE_BASE = /^https?:$/.test(location.protocol)
  ? location.origin + location.pathname.replace(/index.html?$/i, '')
  : SHARE_FALLBACK;
