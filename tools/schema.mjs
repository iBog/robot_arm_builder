#!/usr/bin/env node
/* Генерирует schema.json (JSON Schema 2020-12) для конфигурации руки из реестра
   TYPES внутри index.html: node tools/schema.mjs [--check].
   --check — только сравнить с существующим файлом (для тестов), код выхода 1
   при расхождении. Схему читают агенты и внешние инструменты, чтобы валидировать
   JSON руки без запуска страницы. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPure, root } from './pure.mjs';

export function buildSchema() {
  const { TYPES } = loadPure(['TYPES']);
  const variants = Object.entries(TYPES).map(([type, ty]) => {
    const props = { type: { const: type, description: ty.label.en + ' / ' + ty.label.ru } };
    for (const p of ty.params) {
      props[p.key] = {
        type: 'number', minimum: p.min, maximum: p.max, multipleOf: p.step, default: p.def,
        description: p.label.en + ' / ' + p.label.ru
          + (p.build ? '; build-time size, editable only while the component is last in the chain' : '')
          + (p.maxOf ? `; must not exceed "${p.maxOf}"` : ''),
      };
    }
    return { type: 'object', properties: props, required: ['type'], additionalProperties: false };
  });
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://robot.experimentalui.com/schema.json',
    title: 'Robo-Arm Builder arm configuration',
    description: 'Chain of components from the base to the arm tip, as shown in the JSON tab and accepted by "Apply" and the ?config= link parameter. Missing parameters take their defaults; values are clamped to their ranges.',
    type: 'array',
    items: { oneOf: variants },
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const file = path.join(root, 'schema.json');
  const text = JSON.stringify(buildSchema(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : ''; // рабочая копия может быть CRLF
    if (cur !== text) { console.error('schema.json устарел: node tools/schema.mjs'); process.exit(1); }
    console.log('schema.json актуален');
  } else {
    fs.writeFileSync(file, text);
    console.log('schema.json записан');
  }
}
