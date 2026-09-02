#!/usr/bin/env node
/* Быстрая проверка: синтаксис JS-модуля из index.html (node --check). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
if (!m) { console.error('модуль не найден'); process.exit(2); }
const tmp = path.join(os.tmpdir(), 'robo-arm-check.mjs');
fs.writeFileSync(tmp, m[1].replace(/import .*?;/g, ''));
const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
process.stdout.write(r.stdout); process.stderr.write(r.stderr);
console.log(r.status === 0 ? 'syntax OK' : 'syntax FAIL');
process.exit(r.status ?? 1);
