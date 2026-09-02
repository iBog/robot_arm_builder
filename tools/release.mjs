#!/usr/bin/env node
/* Релиз: node tools/release.mjs 1.7.0 [--no-git]
   1. пишет версию в package.json и в `const VERSION` внутри index.html;
   2. переносит раздел «Unreleased» CHANGELOG.md в «[версия] — дата»;
   3. коммитит и ставит тег vВЕРСИЯ (без --no-git).
   Сборки у проекта нет (один файл), поэтому «подстановка версии при сборке» —
   это этот скрипт: единственное место, где номер версии правится. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [ver, ...flags] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(ver || '')) { console.error('использование: node tools/release.mjs X.Y.Z [--no-git]'); process.exit(2); }
const noGit = flags.includes('--no-git');
const date = new Date().toISOString().slice(0, 10);

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = ver;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const idxPath = path.join(root, 'index.html');
let idx = fs.readFileSync(idxPath, 'utf8');
const re = /const VERSION = '[^']*';/;
if (!re.test(idx)) { console.error('const VERSION не найдена в index.html'); process.exit(2); }
idx = idx.replace(re, `const VERSION = '${ver}';`);
fs.writeFileSync(idxPath, idx);

const chPath = path.join(root, 'CHANGELOG.md');
let ch = fs.readFileSync(chPath, 'utf8');
if (!/^## \[Unreleased\]\s*$/m.test(ch)) { console.error('в CHANGELOG.md нет раздела ## [Unreleased]'); process.exit(2); }
ch = ch.replace(/^## \[Unreleased\]\s*$/m, `## [Unreleased]\n\n## [${ver}] — ${date}`);
fs.writeFileSync(chPath, ch);
console.log(`версия ${ver}: package.json, index.html, CHANGELOG.md обновлены`);

if (noGit) process.exit(0);
const git = (...a) => { const r = spawnSync('git', a, { cwd: root, encoding: 'utf8' }); if (r.status) { console.error(r.stderr); process.exit(r.status); } return r.stdout; };
git('add', 'package.json', 'index.html', 'CHANGELOG.md');
git('commit', '-q', '-m', `Release v${ver}`);
git('tag', '-a', `v${ver}`, '-m', `Robo-Arm Builder v${ver}`);
console.log(`коммит и тег v${ver} созданы; не забудьте git push --follow-tags`);
