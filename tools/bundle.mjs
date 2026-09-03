#!/usr/bin/env node
/* Сборка одностраничного файла для деплоя: node tools/bundle.mjs [выход]
   (по умолчанию dist/index.html, каталог dist/ в .gitignore).
   Исходник — сам index.html: стили из его <link rel="stylesheet" href="src/css/…">
   вшиваются в один <style>, скрипты из списка SRC загрузчика — в один
   <script type="module"> вместе с import three.js. Получается тот самый «один
   файл»: удобно отдавать с сервера одним запросом и пересылать вложением.
   Приложение работает и без сборки — index.html открывается с file:// как есть.
   Отсюда же тесты берут модуль целиком: buildModule() (склейка src/js в порядке
   списка), locate() переводит строку склейки в «src/js/файл:строка». */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const indexFile = path.join(root, 'index.html');

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const trimmed = f => read(f).replace(/\s+$/, '') + '\n';

/* разбор index.html: список стилей, список скриптов загрузчика, import-строки three.js */
export function readIndex() {
  const html = read(indexFile);
  const css = [...html.matchAll(/<link rel="stylesheet" href="(src\/css\/[^"]+)">/g)].map(m => m[1]);
  const mod = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  if (!mod) throw new Error('в index.html нет <script type="module"> загрузчика');
  const scripts = [...mod[1].matchAll(/'(src\/js\/[^']+)'/g)].map(m => m[1]);
  const imports = mod[1].split('\n').filter(l => /^import /.test(l));
  if (!css.length || !scripts.length || !imports.length) throw new Error('index.html: не найдены стили, скрипты или import three.js');
  return { html, css, scripts, imports, module: mod[0] };
}

/* JS-модуль: import three.js + склейка src/js в порядке списка через пустую
   строку; директива 'use strict' каждого файла в модуле лишняя и снимается.
   parts — с какой строки модуля начинается каждый файл */
export function buildModule() {
  const { scripts, imports } = readIndex();
  const parts = [];
  let code = imports.join('\n') + '\n';
  let line = code.split('\n').length; // первая строка первого файла
  for (const rel of scripts) {
    const text = trimmed(path.join(root, rel)).replace(/^'use strict';\n/, '');
    code += '\n'; line++;
    parts.push({ rel, line });
    code += text;
    line += text.split('\n').length - 1;
  }
  return { code, parts, scripts };
}

/* строка склеенного модуля → «src/js/файл:строка» */
export function locate(parts, moduleLine) {
  let p = null;
  for (const q of parts) if (q.line <= moduleLine) p = q;
  return p ? `${p.rel}:${moduleLine - p.line + 1}` : `модуль:${moduleLine}`;
}

export function buildBundle() {
  const { html, css, module } = readIndex();
  const { code } = buildModule();
  const style = '<style>\n' + css.map(rel => trimmed(path.join(root, rel)).replace(/^(?=.)/gm, '  ')).join('\n') + '</style>';
  let out = html, first = true;
  out = out.replace(/[ \t]*<link rel="stylesheet" href="src\/css\/[^"]+">\n/g, () => { const r = first ? style + '\n' : ''; first = false; return r; });
  out = out.replace(module, () => '<script type="module">\n' + code + '</script>');
  return out.replace(/^(<!DOCTYPE html>\n)/, '$1<!-- Собрано из index.html и src/ скриптом tools/bundle.mjs — правь исходники, не этот файл. -->\n');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const out = path.resolve(root, process.argv[2] || 'dist/index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const html = buildBundle();
  fs.writeFileSync(out, html);
  console.log(`${path.relative(root, out)}: ${html.split('\n').length - 1} строк, ${(html.length / 1024).toFixed(0)} КБ`);
}
