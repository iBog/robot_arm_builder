#!/usr/bin/env node
/* Релиз: node tools/release.mjs 1.7.0 [--no-git]
   1. пишет версию в package.json и в `const VERSION` (src/js/000-consts.js);
   2. переносит раздел «Unreleased» CHANGELOG.md в «[версия] — дата»;
   3. коммитит и ставит тег vВЕРСИЯ (без --no-git).
   Это единственное место, где номер версии правится. */
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

const constPath = path.join(root, 'src', 'js', '000-consts.js');
let src = fs.readFileSync(constPath, 'utf8');
const re = /const VERSION = '[^']*';/;
if (!re.test(src)) { console.error('const VERSION не найдена в src/js/000-consts.js'); process.exit(2); }
src = src.replace(re, `const VERSION = '${ver}';`);
fs.writeFileSync(constPath, src);

const chPath = path.join(root, 'CHANGELOG.md');
let ch = fs.readFileSync(chPath, 'utf8');
if (!/^## \[Unreleased\]\s*$/m.test(ch)) { console.error('в CHANGELOG.md нет раздела ## [Unreleased]'); process.exit(2); }
ch = ch.replace(/^## \[Unreleased\]\s*$/m, `## [Unreleased]\n\n## [${ver}] — ${date}`);
fs.writeFileSync(chPath, ch);
console.log(`версия ${ver}: package.json, src/js/000-consts.js, CHANGELOG.md обновлены`);

if (noGit) process.exit(0);
const git = (...a) => { const r = spawnSync('git', a, { cwd: root, encoding: 'utf8' }); if (r.status) { console.error(r.stderr); process.exit(r.status); } return r.stdout; };
git('add', 'package.json', 'src/js/000-consts.js', 'CHANGELOG.md');
git('commit', '-q', '-m', `Release v${ver}`);
git('tag', '-a', `v${ver}`, '-m', `Robo-Arm Builder v${ver}`);
console.log(`коммит и тег v${ver} созданы; не забудьте git push --follow-tags`);
