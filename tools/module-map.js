#!/usr/bin/env node
/* =====================================================================
   Список модулей в карте проекта — из шапок самих файлов.

   Владелец, 09.11.2026: «чтобы код был легко читаемый для любой ИИ и даже
   для человека, чтобы карта, документация, мануалы были чёткие». Карта
   отставала: 60 из 205 модулей в ней не было, потому что список вёлся
   руками. Теперь таблица «файл → что делает» собирается из build/manifest.json
   (порядок подключения) и первой фразы шапки каждого файла и стоит в
   КАРТА-ПРОЕКТА.md между метками <!-- modules:start --> и <!-- modules:end -->.
   Тест (test/docs.js) сверяет её с кодом: добавили модуль или поменяли
   шапку, а карта старая — красный.

     node tools/module-map.js          — показать, совпадает ли
     node tools/module-map.js --write  — записать в карту
   ===================================================================== */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILE = 'КАРТА-ПРОЕКТА.md';
const START = '<!-- modules:start -->', END = '<!-- modules:end -->';

/* Первая фраза шапки: без рамки «=====», строки «путь · версия», IN/OUT. */
function about(src) {
  const m = src.match(/^\s*\/\*([\s\S]*?)\*\//);
  if (!m) return '';
  const all = m[1].split('\n').map(l => l.replace(/^\s*\*?\s?/, '').trim()).filter(l => l && !/^[=\-*]{5,}$/.test(l));
  /* Описание кончается на IN:/OUT: — дальше перечень входов и выходов. */
  const stop = all.findIndex(l => /^(IN|OUT)\s*:/.test(l)), lines = stop < 0 ? all : all.slice(0, stop);
  if (lines.length && /^[\w/.-]+\s+·\s/.test(lines[0])) {
    const rest = lines[0].replace(/^[\w/.-]+\s+·\s+/, '');
    /* «путь · версия» — пропустить; «путь · название» — название и есть ответ. */
    if (/^[\w.-]+$/.test(rest)) lines.shift(); else return rest.replace(/\|/g, '/');
  }
  if (!lines.length && stop >= 0) return '';
  const text = lines.join(' ').replace(/\s+/g, ' ');
  const cut = text.search(/[.!?](\s|$)/);
  const one = (cut > 0 ? text.slice(0, cut + 1) : text).replace(/\|/g, '/');
  return one.length > 160 ? one.slice(0, 157).replace(/\s+\S*$/, '') + '…' : one;
}
function table() {
  const files = require(path.join(ROOT, 'build/manifest.json')).scripts, out = [START, ''];
  let dir = '';
  files.forEach(f => {
    const d = path.dirname(f).replace(/^src\//, '');
    if (d !== dir) { if (dir) out.push(''); dir = d; out.push('**' + d + '/**', '', '| Файл | Что делает |', '|---|---|'); }
    out.push('| `' + path.basename(f) + '` | ' + (about(fs.readFileSync(path.join(ROOT, f), 'utf8')) || '—') + ' |');
  });
  out.push('', END);
  return out.join('\n');
}
function current() {
  const t = fs.readFileSync(path.join(ROOT, FILE), 'utf8'), a = t.indexOf(START), b = t.indexOf(END);
  return a < 0 || b < 0 ? null : t.slice(a, b + END.length);
}
module.exports = { table, current, about };
if (require.main === module) {
  const want = table(), p = path.join(ROOT, FILE), t = fs.readFileSync(p, 'utf8'), a = t.indexOf(START), b = t.indexOf(END);
  if (a < 0 || b < 0) { console.error(FILE + ': нет меток ' + START + ' … ' + END); process.exit(1); }
  const same = t.slice(a, b + END.length) === want;
  console.log(FILE + ': ' + (same ? 'совпадает с кодом' : 'отличается от кода'));
  if (!same && process.argv.includes('--write')) { fs.writeFileSync(p, t.slice(0, a) + want + t.slice(b + END.length)); console.log('  записано'); }
}
