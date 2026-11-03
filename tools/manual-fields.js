#!/usr/bin/env node
/* =====================================================================
   Приложение руководства Reports «Все поля и показатели» — из кода.

   Владелец, 03.11.2026: «руководство с объяснениями — тогда сам сможешь
   проверять на ошибки, если что-то дублируется или показывает
   неправильно». Таблицы полей и показателей каждого источника берутся из
   src/erp/reports/sources.js и стоят в docs/manual/reports.*.md между
   метками <!-- fields:start --> и <!-- fields:end -->. Тест (test/docs.js)
   сверяет их с кодом: поле переименовали или добавили, а руководство
   старое — красный.

     node tools/manual-fields.js          — показать, что изменится
     node tools/manual-fields.js --write  — записать в оба руководства
   ===================================================================== */
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILES = ['docs/manual/reports.ru.md', 'docs/manual/reports.en.md'];
const START = '<!-- fields:start -->', END = '<!-- fields:end -->';

function sources() {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/erp/reports/sources.js'), 'utf8') + ';this.REP_SRC=REP_SRC;', ctx);
  return ctx.REP_SRC;
}
const KIND = { date: 'Date', dim: 'List', text: 'Text', num: 'Number' };
function how(m, S) {
  const label = k => { const f = S.fields().find(x => x.k === k); return f ? f.label : k; };
  if (m.agg === 'count') return 'Count of rows';
  if (m.agg === 'sum') return 'Sum of ' + label(m.f);
  if (m.agg === 'avg') return 'Average of ' + label(m.f);
  if (m.agg === 'distinct') return 'Distinct ' + label(m.f);
  if (m.agg === 'ratio') return label(m.num) + ' ÷ ' + label(m.den) + (m.pct ? ' × 100' : '');
  return m.agg;
}
/* Markdown приложения: источник — подсказка, поля, показатели. */
function appendix() {
  const S = sources(), out = [START, ''];
  Object.keys(S).forEach(k => {
    const s = S[k], f = s.fields();
    out.push('### ' + s.label + (s.access ? ' · ' + s.access : '') + (s.now ? ' · now' : ''), '', s.hint + '.', '');
    out.push('| Field | Kind |', '|---|---|', ...f.map(x => '| ' + x.label + ' | ' + KIND[x.type] + ' |'), '');
    out.push('| Metric | How |', '|---|---|', ...(s.metrics || []).map(m => '| ' + m.label + ' | ' + how(m, s) + (m.unitBy ? ' (one unit only)' : '') + ' |'), '');
  });
  out.push(END);
  return out.join('\n');
}
function current(file) {
  const t = fs.readFileSync(path.join(ROOT, file), 'utf8'), a = t.indexOf(START), b = t.indexOf(END);
  return a < 0 || b < 0 ? null : t.slice(a, b + END.length);
}
module.exports = { appendix, current, FILES };
if (require.main === module) {
  const want = appendix();
  FILES.forEach(file => {
    const p = path.join(ROOT, file), t = fs.readFileSync(p, 'utf8'), a = t.indexOf(START), b = t.indexOf(END);
    if (a < 0 || b < 0) { console.error(file + ': нет меток ' + START + ' … ' + END); process.exitCode = 1; return; }
    const same = t.slice(a, b + END.length) === want;
    console.log(file + ': ' + (same ? 'совпадает с кодом' : 'отличается от кода'));
    if (!same && process.argv.includes('--write')) { fs.writeFileSync(p, t.slice(0, a) + want + t.slice(b + END.length)); console.log('  записано'); }
  });
}
