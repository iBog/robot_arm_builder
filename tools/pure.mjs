/* Чистые куски модуля (без DOM): реестры типов и геометрии, кодек ссылок,
   валидатор. В исходниках src/js/*.js они обёрнуты маркерами
   `/* @pure <имя> *​/` … `/* @pure end *​/`. loadPure() склеивает их в порядке
   модуля (по списку загрузчика index.html) и выполняет в песочнице node,
   подставляя заглушки для локализации — так кодек и схему можно гонять за
   секунды без браузера. */
import vm from 'node:vm';
import { buildModule, root } from './bundle.mjs';

export { root };

export function pureSource() {
  const { code } = buildModule();
  const parts = [...code.matchAll(/\/\* @pure ([a-z]+) \*\/([\s\S]*?)\/\* @pure end \*\//g)];
  if (!parts.length) throw new Error('маркеры @pure не найдены в src/js');
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
