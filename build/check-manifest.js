#!/usr/bin/env node
/* =====================================================================
   build/check-manifest.js
   Ловит самую частую ошибку при замене модуля: файл добавили в src/,
   но не зарегистрировали — и он молча не подключается. Проверяет, что
   каждый .js из src/ есть и в build/manifest.json, и в src/index.html,
   и наоборот — что манифест не ссылается на удалённый файл.

   Запуск: node build/check-manifest.js
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const devHtml = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

const onDisk = walk('src').sort();
const inManifest = M.scripts.slice().sort();
const problems = [];

for (const f of onDisk) {
  if (!inManifest.includes(f))
    problems.push(`НЕ ПОДКЛЮЧЁН: ${f} лежит в src/, но его нет в build/manifest.json — код не выполняется.`);
  const srcAttr = f.replace(/^src\//, '');
  if (!devHtml.includes('"' + srcAttr + '"'))
    problems.push(`НЕ ПОДКЛЮЧЁН в dev-режиме: добавь <script src="${srcAttr}"></script> в src/index.html (тот же порядок, что в манифесте).`);
}
for (const f of inManifest) {
  if (!onDisk.includes(f))
    problems.push(`ПОТЕРЯН: build/manifest.json ссылается на ${f}, а файла нет.`);
  else if (!fs.existsSync(path.join(ROOT, f)))
    problems.push(`ПОТЕРЯН: ${f} не читается.`);
}
for (const f of M.styles) {
  if (!fs.existsSync(path.join(ROOT, f))) problems.push(`ПОТЕРЯН стиль: ${f}`);
}

if (problems.length) {
  console.error('Манифест и файлы разошлись:\n');
  problems.forEach(p => console.error('  · ' + p));
  console.error(`\nЧто делать: открой build/manifest.json и src/index.html и приведи список файлов в соответствие.
Порядок важен — core → modules/shape → modules/muntin → erp → erp/storage.js последним.`);
  process.exit(1);
}
console.log(`Манифест в порядке: ${onDisk.length} модулей подключены и в сборке, и в dev-режиме.`);
