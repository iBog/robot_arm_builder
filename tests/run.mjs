#!/usr/bin/env node
/* Прогон сценариев в headless Chrome.
   node tests/run.mjs                — все сценарии
   node tests/run.mjs pick drill     — выбранные
   node tests/run.mjs golden --update — перезаписать tests/golden.json
   --shot — сохранить скриншот сценария в tests/out/
   Требуется Chrome (переменная CHROME или стандартный путь) и доступ к CDN three.js.

   Как это работает: копия index.html с кодом сценария, вставленным в модуль после
   старта (у него есть доступ ко всем внутренним функциям), открывается headless
   Chrome с --dump-dom; сценарий пишет строки в <pre id="testlog">, раннер их
   печатает. Строка FAIL/EXCEPTION/ERR — провал, код выхода 1. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
let names = args.filter(a => !a.startsWith('--'));

const scenarios = fs.readFileSync(path.join(here, 'scenarios.js'), 'utf8');
const ALL = [...scenarios.matchAll(/SCEN === '([a-z0-9]+)'/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i);
if (!names.length || names.includes('all')) names = ALL;
for (const n of names) if (!ALL.includes(n)) { console.error(`нет сценария "${n}"; есть: ${ALL.join(', ')}`); process.exit(2); }

function chromePath() {
  const cands = [process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const p = cands.find(c => fs.existsSync(c));
  if (!p) { console.error('Chrome не найден: задайте переменную CHROME'); process.exit(2); }
  return p;
}
const CHROME = chromePath();
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const anchor = 'renderPanel();\nif (fromLink) {';
if (index.split(anchor).length !== 2) { console.error('якорь старта не найден в index.html'); process.exit(2); }
const goldenPath = path.join(here, 'golden.json');
const golden = fs.existsSync(goldenPath) ? fs.readFileSync(goldenPath, 'utf8') : 'null';

let failed = 0;
for (const name of names) {
  const inject = scenarios.replace("'__SCEN__'", () => `'${name}'`).replace("'__GOLDEN__'", () => golden);
  const html = index.replace(anchor, () => 'renderPanel();\n' + inject + '\nif (fromLink) {');
  const file = path.join(outDir, `test_${name}.html`);
  fs.writeFileSync(file, html);
  const url = pathToFileURL(file).href;
  const base = ['--headless=new', '--disable-gpu', '--window-size=1600,1000', '--virtual-time-budget=12000'];
  const t0 = Date.now();
  const r = spawnSync(CHROME, [...base, '--dump-dom', url], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 300000 });
  const m = /<pre id="testlog">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
  const log = m ? m[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO TESTLOG (страница не дошла до сценария или Chrome завис)';
  const bad = /^(FAIL|EXCEPTION|ERR)\b/m.test(log) || !m;
  if (bad) failed++;
  console.log(`\n=== ${name} ${bad ? '✗' : '✓'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log(log.split('\n').filter(l => !l.startsWith('frames rendered')).join('\n'));
  if (name === 'golden' && flags.has('--update')) {
    const g = /^GOLDEN (.*)$/m.exec(log);
    if (g) { fs.writeFileSync(goldenPath, g[1] + '\n'); console.log('golden.json обновлён'); }
  }
  if (flags.has('--shot')) {
    const shot = path.join(outDir, `shot_${name}.png`);
    spawnSync(CHROME, [...base, `--screenshot=${shot}`, url], { timeout: 300000 });
    console.log(`скриншот: ${shot}`);
  }
}
console.log(`\n${names.length - failed}/${names.length} сценариев прошли`);
process.exit(failed ? 1 : 0);
