#!/usr/bin/env node
/* Быстрая проверка (секунда):
   1. список скриптов в загрузчике index.html совпадает с содержимым src/js
      (в алфавитном порядке), а стили — с src/css;
   2. каждый файл src/js начинается с 'use strict' (как классический скрипт он
      иначе выполнялся бы в нестрогом режиме, а в сборке модуль строгий);
   3. синтаксис каждого файла (node --check) и всего склеенного модуля — второе
      ловит дубли объявлений между файлами; строки переводятся в src/js/файл:строка. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildModule, locate, readIndex, root } from '../tools/bundle.mjs';

let bad = 0;
const fail = msg => { console.error('FAIL', msg); bad++; };
const listed = (dir, ext) => fs.readdirSync(path.join(root, 'src', dir)).filter(f => f.endsWith(ext)).sort().map(f => `src/${dir}/${f}`);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const idx = readIndex();
if (!same(idx.scripts, listed('js', '.js'))) fail(`список SRC в index.html не совпадает с src/js:\n  в index.html: ${idx.scripts.join(', ')}\n  в каталоге:   ${listed('js', '.js').join(', ')}`);
if (!same(idx.css, listed('css', '.css'))) fail(`стили в index.html не совпадают с src/css:\n  в index.html: ${idx.css.join(', ')}\n  в каталоге:   ${listed('css', '.css').join(', ')}`);

const tmp = path.join(os.tmpdir(), 'robo-arm-check.mjs');
const nodeCheck = code => {
  fs.writeFileSync(tmp, code);
  return spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
};
for (const rel of idx.scripts) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
  if (!text.startsWith("'use strict';\n")) fail(`${rel}: первая строка должна быть 'use strict';`);
  const r = nodeCheck(text);
  if (r.status !== 0) fail(`${rel}\n` + r.stderr.replace(/\S*robo-arm-check\.mjs/g, rel));
}
const { code, parts } = buildModule();
const r = nodeCheck(code.replace(/^import .*?;$/gm, ''));
if (r.status !== 0) fail('склеенный модуль\n' + r.stderr.replace(/\S*robo-arm-check\.mjs:(\d+)/g, (_, n) => locate(parts, +n)));

console.log(bad ? `${bad} проблем` : `OK: ${idx.scripts.length} скриптов, ${idx.css.length} стилей, синтаксис в порядке`);
process.exit(bad ? 1 : 0);
