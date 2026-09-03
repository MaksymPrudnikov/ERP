#!/usr/bin/env node
/* =====================================================================
   build/build.js
   Собирает dist/GLASS_ERP.html — один самодостаточный файл,
   который открывается двойным кликом без сервера.

   Правишь ОДИН модуль в src/ → node build/build.js → готовый файл.
   Полный HTML руками пересобирать не нужно.

   Порядок подключения задан в build/manifest.json.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const normalizeNewlines = text => String(text).replace(/\r\n?/g, '\n');
const readRaw = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

function renderHtml(loader) {
  loader = loader || readRaw;
  /* Git may check files out with LF or CRLF depending on the workstation.
     Canonicalize every source before both hashing and assembly so the same
     repository tree produces byte-identical dist on macOS, Windows and CI. */
  const read = p => normalizeNewlines(loader(p));
  const css = M.styles.map(f => `/* ---- ${f} ---- */\n${read(f)}`).join('\n');
  const js  = M.scripts.map(f => `/* ==== ${f} ==== */\n${read(f)}`).join('\n');
  const shell = read('src/shell.html').replace(/^<body>\s*/, '').replace(/<\/body>[\s\S]*$/, '').trim();
  const buildFingerprint = crypto.createHash('sha256')
    .update(css + '\n' + js + '\n' + shell)
    .digest('hex')
    .slice(0, 12);

  return `<!DOCTYPE html>
<!--
  ${M.title}
  СБОРКА — не редактировать руками. Детерминированно собрано из src/ через build/build.js.
  Правки вносить в отдельные модули src/**, затем: node build/build.js
  Состав сборки: ${M.scripts.length} модулей, ${M.styles.length} стиля.
-->
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${M.title}</title>
<style>
${css}
</style>
</head>
<body>
${shell}
<script>
/* Метка сборки: видно, та ли версия файла открыта. Это fingerprint исходников,
   а не текущее время, поэтому повторная сборка остаётся воспроизводимой. */
var ERP_BUILD='${buildFingerprint}';
${js}
</script>
</body>
</html>
`;
}

function build() {
  const html = renderHtml();
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dist/GLASS_ERP.html'), html);
  console.log(`dist/GLASS_ERP.html — ${(html.length / 1024).toFixed(1)} KB · ${M.scripts.length} модулей`);
  return html;
}

if (require.main === module) build();

module.exports = { build, normalizeNewlines, renderHtml };
