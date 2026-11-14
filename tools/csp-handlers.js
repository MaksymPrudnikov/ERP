#!/usr/bin/env node
/* =====================================================================
   Встроенные обработчики (onclick="…" в разметке): счёт и перевод на
   действия core/actions.js. Задание «CSP без inline» (хвост этапа 3
   плана «до 10», 13.11.2026): пока в разметке есть on<событие>="код",
   из script-src нельзя убрать 'unsafe-inline'.

     node tools/csp-handlers.js                 — сколько осталось по файлам
     node tools/csp-handlers.js --list <файл…>  — обработчики файла: что
                                                  переведёт скрипт, что руками
     node tools/csp-handlers.js --write <файл…> — перевести простые формы

   Скрипт переводит только то, что переводится без смысла кода:
     fn(…)                              → onAct('click',fn,…)
     event.stopPropagation();fn(…)      → onActStop('click',fn,…)
     event.stopPropagation()            → onAct('click',actStop,EVENT)
     if(event.target===this)fn(…)       → onActSelf('click',fn,…)
     event.preventDefault()             → onAct('dragover',actPrevent,EVENT)
   Аргументы: 'текст', числа, true/false/null, '${выражение}', ${выражение},
   this → EL, this.value → EL_VALUE, this.checked → EL_CHECKED, event → EVENT,
   this.dataset.x → elData('x'). Остальное (несколько шагов, условия,
   присваивания, имя функции из переменной, вызов в аргументе) печатается как
   «руками»: это маленькая функция рядом со своим экраном.

   ЧТО ПРОВЕРИТЬ ГЛАЗАМИ после --write (git diff по каждому файлу):
   - '${x}' стало String(x), '${esc(x)}' — String(x??''): в кавычках функция
     получала строку, и число должно остаться строкой. Где x — заведомо
     строка, String можно снять, но не обязательно.
   - ${x} без кавычек стало x: верно для числа и true/false. Если x — кусок
     кода строкой ('null', '"id"', имя переменной) — переделать руками.
   - Аргумент считается при отрисовке. Раньше выражение без ${} считалось в
     момент клика — такие скрипт не трогает, но проверить стоит.

   Сторож перехода — INLINE_LEFT ниже: «файл → сколько обработчиков ещё
   осталось». test/docs.js сверяет список с кодом. Число может только
   уменьшаться; у переведённого файла строки нет (ноль). Новый onclick в
   любом файле — красный тест: писать через onAct.
   ===================================================================== */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

/* Файл → сколько встроенных обработчиков осталось. Только уменьшать.
   PR 1 (13.11.2026): Sales, фигуры, списки, общее; PR 2 (14.11.2026): Optimization,
   Production, станции; PR 3 (14.11.2026): Master Data, формы, Customers, прайсы — переведены (их тут нет). */
const INLINE_LEFT = {
  'src/erp/views/dashboard.js': 3,
  'src/erp/views/users.js': 43,
  'src/erp/signin.js': 10,
  'src/erp/views/shipping.js': 30,
  'src/erp/views/finance.js': 23,
  'src/erp/views/finance-workspace.js': 49,
  'src/erp/views/finance-lists.js': 27,
  'src/erp/views/finance-allocate.js': 16,
  'src/erp/views/commissions.js': 28,
  'src/erp/views/purchasing.js': 16,
  'src/erp/views/purchase-orders.js': 26,
  'src/erp/views/purchasing-catalog.js': 22,
  'src/erp/views/purchase-documents.js': 9,
  'src/erp/views/purchasing-receiving.js': 28,
  'src/erp/views/purchasing-delivery-documents.js': 7,
  'src/erp/views/purchasing-invoices.js': 20,
  'src/erp/views/inventory.js': 52,
  'src/erp/views/shipping-lookup.js': 9,
  'src/erp/views/delivery.js': 18,
  'src/erp/views/reports.js': 156,
};

/* Функции, которыми аргумент экранировали под разметку: onAct экранирует сам,
   поэтому обёртка снимается. esc(x) и shapeXml(x) дают String(x ?? ''). */
const ESCAPES = ['esc', 'shapeXml'];

const files = () => require(path.join(ROOT, 'build/manifest.json')).scripts.concat('src/shell.html');
const ATTR = /(?<=[\s"'`])on([a-z]+)=(\\?["'])/g;

/* В какой строке JS лежит каждая позиция файла: 0 код, 1 шаблон `…`,
   2 '…', 3 "…", 4 комментарий, 5 регулярное выражение. */
function contexts(src) {
  const ctx = new Uint8Array(src.length), stack = [], n = src.length;
  let i = 0, prev = '';
  const reOk = () => prev === '' || /[(,=:\[!&|?{};+\-*%<>~^]/.test(prev) ||
    /\b(return|typeof|case|in|of|delete|void|throw|new|else)$/.test(src.slice(Math.max(0, i - 10), i).trimEnd());
  while (i < n) {
    const top = stack[stack.length - 1];
    if (top && top.t === 'tpl') {
      if (src[i] === '\\') { ctx[i] = ctx[i + 1] = 1; i += 2; continue; }
      if (src[i] === '`') { ctx[i] = 1; stack.pop(); i++; prev = '`'; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { ctx[i] = ctx[i + 1] = 1; stack.push({ t: 'expr', depth: 0 }); i += 2; prev = '{'; continue; }
      ctx[i] = 1; i++; continue;
    }
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') { ctx[i] = 4; i++; } continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2), end = e < 0 ? n : e + 2; for (; i < end; i++) ctx[i] = 4; continue; }
    if (c === "'" || c === '"') {
      const k = c === "'" ? 2 : 3; ctx[i] = k; i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') { ctx[i] = k; i++; } ctx[i] = k; i++; }
      ctx[i] = k; i++; prev = c; continue;
    }
    if (c === '`') { ctx[i] = 1; stack.push({ t: 'tpl' }); i++; continue; }
    if (c === '/' && reOk()) {
      ctx[i] = 5; i++; let cls = false;
      while (i < n && (src[i] !== '/' || cls)) { if (src[i] === '\\') { ctx[i] = 5; i++; } else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; ctx[i] = 5; i++; }
      ctx[i] = 5; i++; while (/[a-z]/.test(src[i] || '')) { ctx[i] = 5; i++; }
      prev = '/'; continue;
    }
    if (top && top.t === 'expr') {
      if (c === '{') top.depth++;
      else if (c === '}') { if (top.depth === 0) { stack.pop(); ctx[i] = 1; i++; prev = '}'; continue; } top.depth--; }
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return ctx;
}

/* Конец выражения JS с позиции i: до закрывающей «}» шаблона (stop='}'),
   закрывающей «)» вызова (stop=')') или до «+» перед продолжением строки
   (stop='+'). Возвращает индекс стоп-символа, -1 — не нашёлся. */
function exprEnd(src, i, stop) {
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '`') {
      i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { i = exprEnd(src, i + 2, '}'); if (i < 0) return -1; i++; continue; }
        i++;
      }
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return stop === c ? i : -1;
      depth--;
    } else if (stop === '+' && depth === 0 && c === '+' && /^\+\s*'/.test(src.slice(i))) return i;
  }
  return -1;
}

/* Все встроенные обработчики файла. У каждого: событие, место в файле и
   значение атрибута частями — текст разметки и выражения JS между ним. */
function handlers(src, html) {
  const ctx = html ? null : contexts(src), out = [];
  let m; ATTR.lastIndex = 0;
  while ((m = ATTR.exec(src))) {
    const kind = html ? 'html' : ['code', 'tpl', 'sq', 'dq', 'comment', 'regex'][ctx[m.index]];
    const h = { ev: m[1], idx: m.index, line: src.slice(0, m.index).split('\n').length, kind, parts: null, end: -1 };
    out.push(h);
    if (kind !== 'tpl' && kind !== 'sq' && kind !== 'html') continue;
    const quote = m[2].slice(-1), parts = [];
    let i = m.index + m[0].length, lit = '', ok = false;
    const push = () => { if (lit) parts.push({ lit }); lit = ''; };
    while (i < src.length) {
      const c = src[i];
      if (c === '\n') break;
      if (kind !== 'html' && c === '\\') {
        const e = src[i + 1];
        if (e === quote) { i += 2; ok = m[2].length === 2; if (ok) break; lit += e; continue; }
        lit += e === 'n' ? '\n' : e; i += 2; continue;
      }
      if (c === quote && !(kind === 'sq' && quote === "'")) { i++; ok = m[2].length === 1; break; }
      if (kind === 'tpl' && c === '$' && src[i + 1] === '{') {
        const e = exprEnd(src, i + 2, '}'); if (e < 0) break;
        push(); parts.push({ expr: src.slice(i + 2, e).trim() }); i = e + 1; continue;
      }
      if (kind === 'tpl' && c === '`') break;
      if (kind === 'sq' && c === "'") {
        const plus = /^'\s*\+/.exec(src.slice(i)); if (!plus) break;
        const from = i + plus[0].length, e = exprEnd(src, from, '+'); if (e < 0) break;
        push(); parts.push({ expr: src.slice(from, e).trim() });
        i = e + /^\+\s*'/.exec(src.slice(e))[0].length; continue;
      }
      lit += c; i++;
    }
    if (ok) { push(); h.parts = parts; h.end = i; }
  }
  return out;
}
const text = h => h.parts ? h.parts.map(p => p.lit != null ? p.lit : '${' + p.expr + '}').join('') : '(not parsed)';

/* Имена функций и переменных верхнего уровня во всех модулях: действие —
   только функция модуля. */
let topNames = null;
function declared() {
  if (topNames) return topNames;
  topNames = new Set();
  files().filter(f => f.endsWith('.js')).forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8'), re = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm;
    let m; while ((m = re.exec(src))) topNames.add(m[1]);
  });
  return topNames;
}

const P0 = '\u0001', P1 = '\u0002';
function splitArgs(s) {
  const out = []; let depth = 0, cur = '', q = '';
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = ''; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (q || depth) return null;
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}
/* Снять обёртку esc(…) целиком: 'esc(a)+esc(b)' — не обёртка. */
function unwrap(expr, names) {
  for (const n of names) {
    if (!expr.startsWith(n + '(')) continue;
    const close = exprEnd(expr, n.length + 1, ')');
    if (close === expr.length - 1) return expr.slice(n.length + 1, -1).trim();
  }
  return null;
}

/* Перевод одного обработчика: {code} — готовый вызов помощника, {why} — руками. */
function translate(h, html) {
  if (!h.parts) return { why: h.kind === 'dq' ? 'строка в двойных кавычках' : 'не разобрано' };
  const exprs = [];
  const sk = h.parts.map(p => p.lit != null ? p.lit : (exprs.push(p.expr), P0 + (exprs.length - 1) + P1)).join('').trim().replace(/;$/, '').trim();
  if (sk === 'event.stopPropagation()') return { code: `onAct('${h.ev}',actStop,EVENT)` };
  if (sk === 'event.preventDefault()') return { code: `onAct('${h.ev}',actPrevent,EVENT)` };
  let body = sk, helper = 'onAct';
  if (body.startsWith('event.stopPropagation();')) { body = body.slice(24).trim(); helper = 'onActStop'; }
  else if (body.startsWith('if(event.target===this)')) { body = body.slice(23).trim(); helper = 'onActSelf'; }
  const m = /^([A-Za-z_$][\w$]*)\((.*)\)$/s.exec(body);
  if (!m) return { why: 'не один вызов функции' };
  if (!declared().has(m[1])) return { why: 'нет функции модуля ' + m[1] };
  const raw = splitArgs(m[2]); if (!raw) return { why: 'аргументы не разобраны' };
  const args = [];
  for (const a of raw) {
    const one = new RegExp('^' + P0 + '(\\d+)' + P1 + '$').exec(a);
    const str = /^(['"])([\s\S]*)\1$/.exec(a);
    if (a === 'this') args.push('EL');
    else if (a === 'this.value') args.push('EL_VALUE');
    else if (a === 'this.checked') args.push('EL_CHECKED');
    else if (a === 'event') args.push('EVENT');
    else if (/^this\.dataset\.[A-Za-z_$][\w$]*$/.test(a)) args.push(`elData('${a.slice(13)}')`);
    else if (/^-?\d+(\.\d+)?$/.test(a) || /^(true|false|null)$/.test(a)) args.push(a);
    else if (one) {
      const e = exprs[+one[1]], json = unwrap(unwrap(e, ['esc']) || e, ['JSON.stringify']);
      if (json) args.push(json);
      else if (/['"`?]/.test(e)) return { why: 'выражение без кавычек со строкой или условием: ' + e };
      else args.push(e);
    } else if (str) {
      const inner = str[2], sole = new RegExp('^' + P0 + '(\\d+)' + P1 + '$').exec(inner);
      if (sole) { const e = exprs[+sole[1]], bare = unwrap(e, ESCAPES); args.push(bare ? `String(${/^[\w$.\[\]]+$/.test(bare) ? bare : '(' + bare + ')'}??'')` : `String(${e})`); }
      else if (inner.includes(P0)) return { why: 'строка из текста и выражения: ' + a.replace(/[\u0001\u0002]/g, '#') };
      else if (/[&\\\n]/.test(inner) || inner.includes(str[1])) return { why: 'строка со спецсимволами' };
      else args.push("'" + inner.replace(/'/g, "\\'") + "'");
    } else return { why: 'аргумент считается в момент события: ' + a.replace(/[\u0001\u0002]/g, '#') };
  }
  if (html) return { why: 'готовая разметка: data-on-… и actAllow руками' };
  return { code: `${helper}('${h.ev}',${[m[1]].concat(args).join(',')})` };
}

/* Перевести простые обработчики файла. Возвращает новый текст и что осталось. */
function rewrite(src, html) {
  const hs = handlers(src, html), left = []; let out = '', at = 0, done = 0;
  hs.forEach(h => {
    const t = translate(h, html);
    if (!t.code) { left.push({ h, why: t.why }); return; }
    out += src.slice(at, h.idx) + (h.kind === 'tpl' ? '${' + t.code + '}' : "'+" + t.code + "+'"); at = h.end; done++;
  });
  return { src: out + src.slice(at), done, left };
}

/* Сколько встроенных обработчиков в каждом файле (файлы без них пропущены).
   Примеры «было → стало» в комментариях не считаются. */
function count() {
  const out = {};
  files().forEach(f => {
    const n = handlers(fs.readFileSync(path.join(ROOT, f), 'utf8'), f.endsWith('.html')).filter(h => h.kind !== 'comment').length;
    if (n) out[f] = n;
  });
  return out;
}
/* Расхождения списка INLINE_LEFT с кодом: [] — совпадает. */
function leftProblems() {
  const now = count(), bad = [];
  Object.keys(now).forEach(f => {
    const want = INLINE_LEFT[f] || 0;
    if (now[f] > want) bad.push(`${f}: ${now[f]} встроенных обработчиков, в INLINE_LEFT ${want} — новые писать через onAct (core/actions.js)`);
    if (now[f] < want) bad.push(`${f}: осталось ${now[f]}, в INLINE_LEFT ${want} — уменьшить число`);
  });
  Object.keys(INLINE_LEFT).forEach(f => { if (!now[f]) bad.push(`${f}: переведён — убрать из INLINE_LEFT`); });
  return bad;
}
module.exports = { INLINE_LEFT, count, leftProblems, handlers, translate, rewrite, contexts };

if (require.main === module) {
  const argv = process.argv.slice(2), mode = argv[0] && argv[0].startsWith('--') ? argv[0] : '', names = argv.filter(a => !a.startsWith('--'));
  const rel = f => path.relative(ROOT, path.resolve(f));
  if (mode === '--list' || mode === '--write') {
    if (!names.length) { console.error('Укажи файлы: node tools/csp-handlers.js ' + mode + ' src/erp/views/x.js'); process.exit(1); }
    names.map(rel).forEach(f => {
      const p = path.join(ROOT, f), src = fs.readFileSync(p, 'utf8'), html = f.endsWith('.html'), r = rewrite(src, html);
      if (mode === '--write' && r.done) {
        if (!html) { try { new vm.Script(r.src, { filename: f }); } catch (e) { console.error(f + ': после перевода не разбирается (' + e.message + ') — файл не тронут'); process.exitCode = 1; return; } }
        fs.writeFileSync(p, r.src);
      }
      console.log(`${f}: ${mode === '--write' ? 'переведено' : 'переведёт скрипт'} ${r.done}, руками ${r.left.length}`);
      r.left.forEach(x => console.log(`  ${x.h.line}: on${x.h.ev}="${text(x.h)}" — ${x.why}`));
    });
  } else {
    const now = count(), total = Object.values(now).reduce((a, b) => a + b, 0);
    Object.entries(now).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(String(n).padStart(5) + '  ' + f));
    console.log(`Всего встроенных обработчиков: ${total} в ${Object.keys(now).length} файлах`);
    const bad = leftProblems();
    console.log('INLINE_LEFT: ' + (bad.length ? 'не совпадает с кодом —\n  ' + bad.join('\n  ') : 'совпадает с кодом'));
  }
}
