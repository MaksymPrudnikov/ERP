#!/usr/bin/env node
/* Проверяет не только повторный запуск на одной машине, но и главный
   кросс-платформенный случай: один и тот же tree, выданный loader с LF или
   CRLF, обязан собраться в побайтово одинаковый HTML и получить один build id. */
const fs = require('fs');
const path = require('path');
const { normalizeNewlines, renderHtml } = require('./build');

const ROOT = path.resolve(__dirname, '..');
const loadLf = rel => normalizeNewlines(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const loadCrlf = rel => loadLf(rel).replace(/\n/g, '\r\n');
const lf = renderHtml(loadLf);
const crlf = renderHtml(loadCrlf);

if (lf !== crlf) {
  console.error('Сборка зависит от LF/CRLF: dist или ERP_BUILD будут разными на разных компьютерах.');
  process.exit(1);
}
if (lf.includes('\r')) {
  console.error('Каноническая сборка содержит CR; ожидается только LF.');
  process.exit(1);
}

const id = (lf.match(/var ERP_BUILD='([^']+)'/) || [])[1] || '?';
console.log(`Сборка воспроизводима для LF/CRLF · ERP_BUILD ${id}`);
