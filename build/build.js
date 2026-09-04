#!/usr/bin/env node
/* =====================================================================
   build/build.js
   Собирает ДВЕ версии системы из одних и тех же исходников:

     src/index.html      — по модулям: правишь модуль в src/, жмёшь F5,
                           пересобирать не нужно;
     dist/GLASS_ERP.html — один самодостаточный файл: открывается двойным
                           кликом без сервера.

   Обе берут разметку шапки из src/shell.html и порядок модулей из
   build/manifest.json, поэтому разойтись они не могут. Раньше шапка жила
   в трёх копиях, и добавленный в одну из них элемент не попадал ни в одну
   рабочую версию — такая ошибка теперь невозможна.

   node build/build.js         обе версии (так делает CI на main)
   node build/build.js --web   только src/index.html — так работают в ветке

   Порядок подключения задан в build/manifest.json.
   Руками не редактируют ни src/index.html, ни dist/GLASS_ERP.html.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const normalizeNewlines = text => String(text).replace(/\r\n?/g, '\n');
const readRaw = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* В манифесте путь записан от корня проекта, а src/index.html лежит внутри
   src/ — ему нужен путь без этого префикса. */
const fromSrc = f => f.replace(/^src\//, '');

/* Общая часть обеих версий: содержимое модулей, разметка шапки и один
   fingerprint на обе сборки.

   Git may check files out with LF or CRLF depending on the workstation.
   Canonicalize every source before both hashing and assembly so the same
   repository tree produces byte-identical output on macOS, Windows and CI. */
function sources(loader) {
  loader = loader || readRaw;
  const read = p => normalizeNewlines(loader(p));
  const css = M.styles.map(f => `/* ---- ${f} ---- */\n${read(f)}`).join('\n');
  const js  = M.scripts.map(f => `/* ==== ${f} ==== */\n${read(f)}`).join('\n');
  const shell = read('src/shell.html').replace(/^<body>\s*/, '').replace(/<\/body>[\s\S]*$/, '').trim();
  const buildFingerprint = crypto.createHash('sha256')
    .update(css + '\n' + js + '\n' + shell)
    .digest('hex')
    .slice(0, 12);

  /* Метка сборки одна на обе версии: разные значения в шапках означают, что
     открыты разные сборки, и это видно сразу, без сверки файлов. */
  const stamp = `/* Метка сборки: видно, та ли версия файла открыта. Это fingerprint исходников,
   а не текущее время, поэтому повторная сборка остаётся воспроизводимой. */
var ERP_BUILD='${buildFingerprint}';`;

  return { css, js, shell, buildFingerprint, stamp };
}

/* ---- Standalone: стили и модули внутри одного файла ---- */
function renderHtml(loader) {
  const { css, js, shell, stamp } = sources(loader);
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
${stamp}
${js}
</script>
</body>
</html>
`;
}

/* ---- Web: те же стили и модули отдельными файлами ---- */
function renderWeb(loader) {
  const { shell, stamp } = sources(loader);
  return `<!DOCTYPE html>
<!--
  ${M.title} — версия по модулям.
  СБОРКА — не редактировать руками. Генерируется из build/manifest.json и
  src/shell.html через build/build.js.

  Правишь код модуля — достаточно F5, пересобирать не нужно. Пересборка нужна
  только при смене состава модулей (build/manifest.json) или правке шапки
  (src/shell.html). Работает и с сервера, и при открытии с диска (file://).
  Состав: ${M.scripts.length} модулей, ${M.styles.length} стиля.
-->
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${M.title} — по модулям</title>
${M.styles.map(f => `<link rel="stylesheet" href="${fromSrc(f)}">`).join('\n')}
</head>
<body>
${shell}
<script>
${stamp}
</script>
${M.scripts.map(f => `<script src="${fromSrc(f)}"></script>`).join('\n')}
</body>
</html>
`;
}

/* --web не трогает dist/GLASS_ERP.html. Так работают в feature-ветке:
   собранный standalone туда попадать не должен — его пересобирает CI после
   слияния в main, а две разные версии полуторамегабайтного файла не слить. */
function build(options) {
  const onlyWeb = !!(options && options.onlyWeb);
  const { buildFingerprint } = sources();

  const web = renderWeb();
  fs.writeFileSync(path.join(ROOT, 'src/index.html'), web);
  console.log(`src/index.html     — по модулям · ${M.scripts.length} модулей · build ${buildFingerprint}`);

  let html = null;
  if (onlyWeb) {
    console.log('dist/GLASS_ERP.html — пропущен (--web): в ветке собранный файл не обновляют');
  } else {
    html = renderHtml();
    fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'dist/GLASS_ERP.html'), html);
    console.log(`dist/GLASS_ERP.html — ${(html.length / 1024).toFixed(1)} KB · ${M.scripts.length} модулей · build ${buildFingerprint}`);
  }
  return html;
}

if (require.main === module) build({ onlyWeb: process.argv.includes('--web') });

module.exports = { build, normalizeNewlines, renderHtml, renderWeb };
