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
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import http from 'node:http';

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
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n'); // рабочая копия может быть CRLF
const anchor = 'renderPanel();\nif (fromLink) {';
if (index.split(anchor).length !== 2) { console.error('якорь старта не найден в index.html'); process.exit(2); }
const goldenPath = path.join(here, 'golden.json');
const golden = fs.existsSync(goldenPath) ? fs.readFileSync(goldenPath, 'utf8') : 'null';

/* --http — отдать страницу с локального сервера (ветки для http(s): адрес ссылок,
   параметры запроса); по умолчанию — file://, как при двойном клике */
let server = null, port = 0;
if (flags.has('--http')) {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
  server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (flags.has('--verbose')) console.error('http', req.url);
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  port = server.address().port;
}

/* Chrome запускается асинхронно: синхронный spawn блокировал цикл событий, и
   локальный http-сервер (--http) не мог ответить странице */
function runChrome(args, timeout = 300000) {
  return new Promise(resolve => {
    const child = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('close', () => { clearTimeout(timer); resolve(out); });
  });
}

let failed = 0;
for (const name of names) {
  const inject = scenarios.replace("'__SCEN__'", () => `'${name}'`).replace("'__GOLDEN__'", () => golden);
  const html = index.replace(anchor, () => 'renderPanel();\n' + inject + '\nif (fromLink) {');
  const file = path.join(outDir, `test_${name}.html`);
  fs.writeFileSync(file, html);
  const url = (server ? `http://127.0.0.1:${port}/tests/out/test_${name}.html` : pathToFileURL(file).href)
    + (name === 'debug' ? '?debug=1' : ''); // сценарий debug проверяет API под флагом
  /* сценарии синхронные: дамп DOM сразу после выполнения модуля; виртуальное время
     нужно только скриншоту (дать three.js дорисовать), с --dump-dom оно вешало Chrome */
  const base = ['--headless=new', '--disable-gpu', '--window-size=1600,1000'];
  const t0 = Date.now();
  const stdout = await runChrome([...base, '--dump-dom', url]);
  const m = /<pre id="testlog">([\s\S]*?)<\/pre>/.exec(stdout);
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
    await runChrome([...base, '--virtual-time-budget=12000', `--screenshot=${shot}`, url]);
    console.log(`скриншот: ${shot}`);
  }
}
if (server) server.close();
console.log(`\n${names.length - failed}/${names.length} сценариев прошли`);
process.exit(failed ? 1 : 0);
