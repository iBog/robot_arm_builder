#!/usr/bin/env node
/* Кодек ссылок и валидатор — в node за секунды, без браузера:
   node tests/codec.test.mjs. Код берётся из index.html по маркерам @pure. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadPure, root } from '../tools/pure.mjs';

const P = loadPure(['TYPES', 'paramMax', 'GEOM', 'checkCodeSpec', 'encodeArmCode', 'decodeArmCode', 'encodeStructCode',
  'decodeStructCode', 'dammDigit', 'dammValid', 'groupCode', 'validateConfig', 'cleanConfig', 'midParam', 'CODE_VERSIONS']);
const J = x => JSON.parse(JSON.stringify(x)); // объекты из песочницы vm — другой прототип
let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, '—', e.message); process.exitCode = 1; } };

test('CODE_SPEC совпадает с TYPES', () => assert.equal(P.checkCodeSpec(), true));
test('контрольная цифра Дамма', () => {
  const code = P.encodeArmCode([{ type: 'yaw', angle: 45 }, { type: 'link', length: 1 }]);
  assert.equal(P.dammValid(code), true);
  const broken = code.slice(0, 3) + String((+code[3] + 1) % 10) + code.slice(4);
  assert.equal(P.decodeArmCode(broken), null, 'опечатка должна ловиться');
});
test('полный код: туда-обратно, v1 без новых типов', () => {
  const cfg = [{ type: 'yaw', angle: 45 }, { type: 'pitch', angle: -30 }, { type: 'link', length: 1.25 }, { type: 'gripper', open: 70 }];
  const code = P.encodeArmCode(cfg);
  assert.equal(code[0], '1');
  assert.deepEqual(J(P.decodeArmCode(code)), cfg);
});
test('полный код: v2 с типами 10+, v3 с телескопом', () => {
  assert.equal(P.encodeArmCode([{ type: 'drill', speed: 50 }])[0], '2');
  const cfg = [{ type: 'prismatic', length: 1.0, ext: 0.6 }, { type: 'mill', speed: 10 }];
  const code = P.encodeArmCode(cfg);
  assert.equal(code[0], '3');
  assert.deepEqual(J(P.decodeArmCode(code)), cfg);
});
test('старые коды v1/v2 с телескопом читаются', () => {
  const l1 = '10190508314', d1 = P.validateConfig(P.decodeArmCode(l1 + P.dammDigit(l1)));
  assert.deepEqual(J(d1[1]), { type: 'prismatic', ext: 0.4, length: 0.7 });
  const l2 = '201190052410050', d2 = P.validateConfig(P.decodeArmCode(l2 + P.dammDigit(l2)));
  assert.equal(d2[1].ext, 0.7, 'выдвижение зажато до длины');
  assert.equal(d2[2].type, 'drill');
});
test('структурный код с размерами (v4/v5), позы по умолчанию', () => {
  const cfg = [{ type: 'yaw', angle: 40 }, { type: 'link', length: 1.55 }, { type: 'offset', length: 0.35 }, { type: 'prismatic', length: 0.8, ext: 0.2 }];
  const s = P.encodeStructCode(cfg), d = P.validateConfig(P.decodeStructCode(s));
  assert.equal(s[0], '4');
  assert.deepEqual(J(d.map(c => c.length ?? null)), [null, 1.55, 0.35, 0.8]);
  assert.equal(d[0].angle, 0); assert.equal(d[3].ext, 0.4);
  assert.equal(P.encodeStructCode([{ type: 'mill', speed: 1 }])[0], '5');
  assert.equal(P.decodeArmCode(s), null, 'полный декодер отвергает структурный код');
});
test('старый структурный код v1 — середина диапазона', () => {
  const l = '10131240', d = P.decodeStructCode(l + P.dammDigit(l));
  assert.equal(d.length, 7); assert.equal(d[2].length, P.midParam(P.TYPES.link.params[0]));
});
test('оборванный, пустой и мусорный ввод', () => {
  assert.equal(P.decodeStructCode('431' + P.dammDigit('431')), null);
  assert.deepEqual(J(P.decodeStructCode(P.encodeStructCode([]))), []);
  assert.equal(P.decodeArmCode('abc'), null);
  assert.equal(P.decodeArmCode('9' + P.dammDigit('9')), null, 'неизвестная версия');
});
test('validateConfig: типы, диапазоны, зависимые границы', () => {
  assert.throws(() => P.validateConfig({}), /errArray/);
  assert.throws(() => P.validateConfig([{ type: 'nope' }]), /errType/);
  const v = P.validateConfig([{ type: 'yaw', angle: 999 }, { type: 'prismatic', length: 0.5, ext: 1.5 }, { type: 'gripper' }]);
  assert.equal(v[0].angle, 180); assert.equal(v[1].ext, 0.5); assert.equal(v[2].open, 50);
});
test('groupCode бьёт по 4 цифры', () => assert.equal(P.groupCode('123456789'), '1234-5678-9'));
test('schema.json актуален', () => {
  execFileSync(process.execPath, [path.join(root, 'tools', 'schema.mjs'), '--check'], { stdio: 'pipe' });
});
console.log(`${n} проверок прошли${process.exitCode ? ', есть провалы' : ''}`);
