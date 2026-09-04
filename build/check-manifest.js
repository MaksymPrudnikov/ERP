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
const htmlScripts=[...devHtml.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)].map(m=>'src/'+m[1].replace(/^\.\//,''));
const htmlStyles=[...devHtml.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)].map(m=>'src/'+m[1].replace(/^\.\//,''));

for (const f of onDisk) {
  if (!inManifest.includes(f))
    problems.push(`НЕ ПОДКЛЮЧЁН: ${f} лежит в src/, но его нет в build/manifest.json — код не выполняется.`);
  const srcAttr = f.replace(/^src\//, '');
  if (!devHtml.includes('"' + srcAttr + '"'))
    problems.push(`НЕ ПОДКЛЮЧЁН в dev-режиме: в src/index.html нет ${srcAttr} — пересобери: node build/build.js`);
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
if(JSON.stringify(htmlScripts)!==JSON.stringify(M.scripts))
  problems.push('ПОРЯДОК скриптов в src/index.html не совпадает с build/manifest.json — пересобери: node build/build.js');
if(JSON.stringify(htmlStyles)!==JSON.stringify(M.styles))
  problems.push('ПОРЯДОК стилей в src/index.html не совпадает с build/manifest.json — пересобери: node build/build.js');


/* ---------------------------------------------------------------------
   Шапка должна быть в ОДНОМ месте — src/shell.html.
   Так уже ломалось: элемент метки сборки добавили в src/erp/shell.html,
   которую не подключает никто, и метка не работала ни в dist, ни в dev,
   а проверки этого не видели — они смотрели только на скрипты и стили.
   --------------------------------------------------------------------- */
const norm = s => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
const shellSrc = norm(fs.readFileSync(path.join(ROOT, 'src/shell.html'), 'utf8')
  .replace(/^<body>\s*/, '').replace(/<\/body>[\s\S]*$/, ''));
const devShell = norm((devHtml.match(/<body>([\s\S]*?)<script/) || ['', ''])[1]);
if (devShell !== shellSrc)
  problems.push('ШАПКА разошлась: разметка в src/index.html не совпадает с src/shell.html. Обе версии собираются из shell.html — пересобери: node build/build.js');

function walkShells(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walkShells(rel, out);
    else if (e.name.endsWith('shell.html')) out.push(rel);
  }
  return out;
}
for (const f of walkShells('src')) {
  if (f !== 'src/shell.html')
    problems.push(`ЛИШНЯЯ КОПИЯ ШАПКИ: ${f} — её никто не подключает, а правки в ней молча пропадут. Разметка живёт только в src/shell.html.`);
}
if (problems.length) {
  console.error('Манифест и файлы разошлись:\n');
  problems.forEach(p => console.error('  · ' + p));
  console.error(`\nЧто делать: состав и порядок правятся в build/manifest.json, шапка — в src/shell.html.
После правки пересобери обе версии: node build/build.js
Порядок важен — core → modules/shape → modules/muntin → erp → erp/storage.js последним.
src/index.html и dist/GLASS_ERP.html руками не редактируют: их пишет build/build.js.`);
  process.exit(1);
}
console.log(`Манифест в порядке: ${onDisk.length} модулей подключены и в сборке, и в dev-режиме.`);
