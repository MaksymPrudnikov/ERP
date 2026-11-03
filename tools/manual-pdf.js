#!/usr/bin/env node
/* =====================================================================
   Руководство Glass ERP одним PDF на язык: обложка, оглавление, главы по
   разделам, номера страниц.

   Владелец, 03.11.2026: «руководство потом соберём в один большой PDF со
   структурой». Разделы и их порядок — таблица в docs/manual/README.md
   (ссылки *.ru.md и *.en.md). Markdown разбирается здесь же (заголовки,
   абзацы, списки, таблицы, `код`, **жирный**, ссылки) — внешних библиотек нет;
   печатает Chromium из Playwright, как tools/shot.js.

     node tools/manual-pdf.js                  — оба языка в ~/Downloads
     node tools/manual-pdf.js --lang ru --out <папка>
   ===================================================================== */
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), DIR = path.join(ROOT, 'docs/manual');
const o = { langs: ['ru', 'en'], out: path.join(os.homedir(), 'Downloads') };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--lang') o.langs = [argv[++i]];
  else if (argv[i] === '--out') o.out = argv[++i].replace(/^~(?=\/|$)/, os.homedir());
  else if (argv[i] === '-h' || argv[i] === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
}
const T = {
  ru: { title: 'Руководство', toc: 'Содержание', page: 'стр.' },
  en: { title: 'Manual', toc: 'Contents', page: 'page' }
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* Строка Markdown → HTML: `код`, **жирный**, [ссылка](адрес) — текстом. */
function inline(s) {
  const parts = String(s).split(/(`[^`]*`)/);
  return parts.map(p => p.startsWith('`') && p.endsWith('`') && p.length > 1 ? '<code>' + esc(p.slice(1, -1)) + '</code>'
    : esc(p).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')).join('');
}
let slugN = 0;
const slug = () => 's' + (++slugN);
/* Файл раздела → HTML и заголовки для оглавления. */
function md(text) {
  const lines = text.replace(/<!--[\s\S]*?-->/g, '').split('\n'), out = [], heads = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m = /^(#{1,4})\s+(.*)$/.exec(l);
    if (m) { const n = m[1].length, id = slug(); heads.push({ n, id, text: m[2] }); out.push(`<h${n} id="${id}">${inline(m[2])}</h${n}>`); i++; continue; }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const body = rows.filter((r, j) => !(j === 1 && /^\|[\s:|-]+\|?\s*$/.test(r)));
      out.push('<table><thead><tr>' + cells(body[0]).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'
        + body.slice(1).map(r => '<tr>' + cells(r).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l), items = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (/^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')); else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      out.push((ordered ? '<ol>' : '<ul>') + items.map(x => '<li>' + inline(x) + '</li>').join('') + (ordered ? '</ol>' : '</ul>'));
      continue;
    }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\||---+\s*$|\s*([-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++].trim());
    out.push('<p>' + inline(para.join(' ')) + '</p>');
  }
  return { html: out.join('\n'), heads };
}
/* Разделы по порядку таблицы README: ссылки на *.<язык>.md. */
function sections(lang) {
  const readme = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
  return [...new Set([...readme.matchAll(new RegExp('\\(([a-z0-9-]+)\\.' + lang + '\\.md\\)', 'g'))].map(m => m[1]))]
    .filter(n => fs.existsSync(path.join(DIR, n + '.' + lang + '.md')));
}
function build(lang) {
  slugN = 0;
  const t = T[lang], parts = sections(lang).map(n => md(fs.readFileSync(path.join(DIR, n + '.' + lang + '.md'), 'utf8')));
  let build = '';
  try { build = (fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8').match(/ERP_BUILD\s*=\s*['"]([^'"]+)/) || [])[1] || ''; } catch (e) {}
  const date = new Date().toISOString().slice(0, 10);
  const toc = parts.map(p => p.heads.filter(h => h.n <= 2).map(h => `<a class="toc${h.n}" href="#${h.id}">${inline(h.text)}</a>`).join('')).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
@page{size:Letter;margin:18mm 16mm 18mm 16mm}
body{font:10.5pt/1.5 Inter,"Helvetica Neue",Arial,sans-serif;color:#1d2321;margin:0}
.cover{height:230mm;display:flex;flex-direction:column;justify-content:center;break-after:page}
.cover h1{font-size:34pt;margin:0 0 4mm;color:#2f6b5e}.cover p{margin:1mm 0;color:#5b6662;font-size:12pt}
.tocp{break-after:page}.tocp h2{font-size:18pt;margin:0 0 6mm}.toc1,.toc2{display:block;color:#1d2321;text-decoration:none;padding:1.2mm 0}
.toc1{font-weight:700;font-size:12pt;margin-top:3mm}.toc2{padding-left:7mm;color:#3d4743}
.chapter{break-before:page}h1{font-size:22pt;color:#2f6b5e;margin:0 0 5mm}h2{font-size:14pt;margin:7mm 0 2mm;break-after:avoid}
h3{font-size:11.5pt;margin:5mm 0 1.5mm;break-after:avoid}h4{font-size:10.5pt;margin:4mm 0 1mm}
table{border-collapse:collapse;width:100%;margin:2mm 0 4mm;font-size:9.5pt;break-inside:auto}th,td{border:1px solid #d5dbd8;padding:1.2mm 2mm;text-align:left;vertical-align:top}
th{background:#eef3f1}tr{break-inside:avoid}code{font:9pt Menlo,Consolas,monospace;background:#eef3f1;padding:0 1mm;border-radius:2px}
hr{border:0;border-top:1px solid #d5dbd8;margin:5mm 0}ul,ol{margin:1mm 0 3mm;padding-left:6mm}li{margin:.6mm 0}
</style></head><body>
<section class="cover"><h1>Glass ERP</h1><p style="font-size:20pt;color:#1d2321">${esc(t.title)}</p><p>${esc(date)}${build ? ' · build ' + esc(build) : ''}</p></section>
<section class="tocp"><h2>${esc(t.toc)}</h2>${toc}</section>
${parts.map(p => '<section class="chapter">' + p.html + '</section>').join('\n')}
</body></html>`;
}
async function main() {
  const { chromium } = require('playwright');
  fs.mkdirSync(o.out, { recursive: true });
  const b = await chromium.launch(), page = await b.newPage();
  for (const lang of o.langs) {
    if (!T[lang]) { console.error('Язык: ru или en'); process.exit(2); }
    const html = build(lang), file = path.join(o.out, 'Glass-ERP-manual-' + lang.toUpperCase() + '.pdf');
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: file, format: 'Letter', printBackground: true, displayHeaderFooter: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
      headerTemplate: '<div></div>', footerTemplate: `<div style="font:8pt Arial;color:#8a948f;width:100%;text-align:center">Glass ERP · ${T[lang].title} · ${T[lang].page} <span class="pageNumber"></span> / <span class="totalPages"></span></div>` });
    console.log(file);
  }
  await b.close();
}
module.exports = { md, sections, build };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
