/* Восстановить построчные окончания строк после того, как редактор
   нормализовал файл целиком (репозиторий смешанный CRLF/LF).

   Безопасность по построению: скрипт НИКОГДА не меняет содержимое. Он
   сопоставляет строки по тексту с версией из HEAD и переиспользует её
   окончание; для новых строк берёт преобладающее в файле. В конце —
   проверка инварианта: текст без CR обязан совпасть байт в байт с тем,
   что было до запуска. Не совпал — файл возвращается как был.  */
const {execSync} = require('child_process');
const fs = require('fs');

const relPath = process.argv[2];
if (!relPath) { console.error('usage: node fix-eol.js <repo-relative-path>'); process.exit(1); }

const splitKeepEol = text => {
  const out = []; let start = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') { out.push(text.slice(start, i + 1)); start = i + 1; }
  if (start < text.length) out.push(text.slice(start));
  return out;
};
const body = line => line.replace(/\r?\n$/, '');
const eolOf = line => (line.endsWith('\r\n') ? '\r\n' : (line.endsWith('\n') ? '\n' : ''));

const head = execSync(`git show HEAD:${relPath}`, { maxBuffer: 1 << 28 }).toString('utf8');
const desired = fs.readFileSync(relPath, 'utf8');

const headLines = splitKeepEol(head);
let crlf = 0, lf = 0;
headLines.forEach(l => { if (l.endsWith('\r\n')) crlf++; else if (l.endsWith('\n')) lf++; });
const dominant = crlf >= lf ? '\r\n' : '\n';

/* Точное выравнивание, а не угадывание по тексту: просим git показать весь
   файл одним хунком (`-U<много>`), игнорируя CR. Тогда у каждой строки есть
   честная пометка — общая с HEAD, удалённая или новая. Общая забирает
   окончание своей строки из HEAD, новая получает преобладающее. Совпадающих
   пустых строк это больше не путает: их различает позиция в выравнивании. */
const aligned = execSync(
  `git diff --ignore-cr-at-eol -U1000000 -- "${relPath}"`,
  { maxBuffer: 1 << 28 }
).toString('utf8');

const rebuilt = [];
let headIdx = 0, sawHunk = false, ok = true;
for (const raw of aligned.split('\n')) {
  if (!sawHunk) { if (raw.startsWith('@@')) sawHunk = true; continue; }
  if (raw === '') continue;                         // хвост после split('\n')
  if (raw.startsWith('\\')) continue;               // "\ No newline at end of file"
  /* Строка вывода несёт CR исходного файла: `--ignore-cr-at-eol` влияет на
     сравнение, но не на печать. Снимаем — окончание доклеиваем сами. */
  const mark = raw[0], text = raw.slice(1).replace(/\r$/, '');
  if (mark === '-') { headIdx++; continue; }        // строка ушла — окончание не нужно
  if (mark === '+') { rebuilt.push(text + dominant); continue; }
  if (mark === ' ') {                               // общая: окончание берём из HEAD
    const src = headLines[headIdx++];
    rebuilt.push(text + (src ? (eolOf(src) || dominant) : dominant));
    continue;
  }
  ok = false;                                       // неожиданная строка вывода
}
if (!sawHunk || !ok) { console.error('ОТКАЗ: не удалось разобрать выравнивание'); process.exit(3); }
/* Последняя строка файла могла быть без перевода — вернём как в исходнике. */
if (rebuilt.length && !desired.endsWith('\n')) rebuilt[rebuilt.length - 1] = body(rebuilt[rebuilt.length - 1]);

const out = rebuilt.join('');
const strip = s => s.replace(/\r\n/g, '\n');
if (strip(out) !== strip(desired)) {
  console.error('ОТКАЗ: содержимое изменилось бы — файл оставлен как был');
  process.exit(2);
}
fs.writeFileSync(relPath, out, 'utf8');
console.log('ok:', relPath, '— содержимое не тронуто, окончания восстановлены');
