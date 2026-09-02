/* Чистые куски index.html (без DOM): реестр типов, кодек ссылок, валидатор.
   В файле они обёрнуты маркерами `/* @pure <имя> *​/` … `/* @pure end *​/`.
   loadPure() склеивает их в порядке файла и выполняет в песочнице node,
   подставляя заглушки для локализации — так кодек и схему можно гонять
   за секунды без браузера. Единственный файл проекта остаётся единственным. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function pureSource() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const parts = [...html.matchAll(/\/\* @pure ([a-z]+) \*\/([\s\S]*?)\/\* @pure end \*\//g)];
  if (!parts.length) throw new Error('маркеры @pure не найдены в index.html');
  return { names: parts.map(m => m[1]), code: parts.map(m => m[2]).join('\n') };
}

/* выполняет чистый код и возвращает объект с экспортами по списку имён */
export function loadPure(exportNames) {
  const { code } = pureSource();
  const prelude = `
    const t = (key, ...args) => key + (args.length ? ' ' + args.join(' ') : '');
    let components = [];
  `;
  const src = `${prelude}\n${code}\nreturn { ${exportNames.join(', ')} };`;
  return vm.runInNewContext(`(function () {\n${src}\n})()`, { console, Math, JSON, String, Number, Object, Array });
}
