#!/usr/bin/env node
/* Проверяет не только повторный запуск на одной машине, но и главный
   кросс-платформенный случай: один и тот же tree, выданный loader с LF или
   CRLF, обязан собраться в побайтово одинаковый HTML и получить один build id.

   Проверяются ОБЕ версии — собранный файл и версия по модулям, — и сверх того
   то, что метка сборки у них одна: разные значения означали бы, что версии
   собраны из разных исходников. */
const fs = require('fs');
const path = require('path');
const { normalizeNewlines, renderHtml, renderWeb } = require('./build');

const ROOT = path.resolve(__dirname, '..');
const loadLf = rel => normalizeNewlines(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const loadCrlf = rel => loadLf(rel).replace(/\n/g, '\r\n');

const targets = [
  { name: 'dist/GLASS_ERP.html', render: renderHtml },
  { name: 'src/index.html', render: renderWeb }
];

const ids = [];
for (const t of targets) {
  const lf = t.render(loadLf);
  const crlf = t.render(loadCrlf);

  if (lf !== crlf) {
    console.error(`Сборка ${t.name} зависит от LF/CRLF: файл или ERP_BUILD будут разными на разных компьютерах.`);
    process.exit(1);
  }
  if (lf.includes('\r')) {
    console.error(`Каноническая сборка ${t.name} содержит CR; ожидается только LF.`);
    process.exit(1);
  }
  ids.push((lf.match(/var ERP_BUILD='([^']+)'/) || [])[1] || '?');
}

if (ids[0] !== ids[1]) {
  console.error(`Метка сборки разошлась: ${targets[0].name} — ${ids[0]}, ${targets[1].name} — ${ids[1]}.`);
  console.error('Обе версии обязаны собираться из одних и тех же исходников.');
  process.exit(1);
}

console.log(`Обе версии воспроизводимы для LF/CRLF · ERP_BUILD ${ids[0]}`);
