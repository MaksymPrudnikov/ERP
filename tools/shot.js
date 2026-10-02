#!/usr/bin/env node
/* =====================================================================
   Скриншот «сейчас / после» одной командой.

   Зачем. Владелец проверяет правку по картинке собранного файла: слева то,
   что работает сейчас (dist из main), справа то же место после правки
   ветки. Раньше Playwright-скрипт для этого писали заново в каждой
   сессии; теперь он здесь.

   «Сейчас» — `git show origin/main:dist/GLASS_ERP.html` (или --before).
   «После»  — сборка рабочего дерева во временный файл; dist/ и src/ не
              трогаются, дерево остаётся чистым.
   В обе страницы загружается одна и та же выгрузка (Export JSON), затем
   выполняются шаги — по порядку, как записаны в командной строке.

   Примеры:
     node tools/shot.js --data latest --tab sales
     node tools/shot.js --data latest --tab optimization --click "text=Cut preview" --selector ".modal"
     node tools/shot.js --tab production --mobile --dark --only after
     node tools/shot.js --data ~/Downloads/x.json --eval "openSalesOrder('SO-1001')" --print --pdf

   Данные:   --data <файл.json>   выгрузка Export JSON
             --data latest        самая свежая ~/Downloads/glazing_system_data*.json
   Шаги:     --tab <раздел>       sales, optimization, production, shipping, finance,
                                  customers, masterdata, users, dashboard
             --click <селектор>   CSS или Playwright: "text=Save", "button:has-text('Cut')"
             --eval <js>          выражение в странице, например "subtab='batches';render()"
             --wait <мс>
   Снимок:   --selector <css>     только этот элемент (первый найденный)
             --full               страница целиком, а не окно
             --width 1440 --height 900 | --mobile (390×844, касания)
             --dark               тёмная тема
             --print              вид для печати; --pdf ещё и PDF Letter рядом с PNG
   Версии:   --before <ref|файл>  по умолчанию origin/main
             --after <файл>       по умолчанию сборка рабочего дерева
             --only before|after  один снимок без склейки
   Вывод:    --out <файл.png>     по умолчанию <tmp>/glass-erp-shots/shot-<время>.png

   Ошибки консоли страницы печатаются по каждой версии — «после» без новых
   ошибок тоже часть проверки. Диалоги confirm/alert принимаются сами.
   ===================================================================== */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const EXE = process.env.CHROME_PATH || undefined;

const o = { before: 'origin/main', after: null, only: null, data: null, steps: [], selector: null, full: false,
  width: 1440, height: 900, mobile: false, dark: false, print: false, pdf: false, out: null };
const argv = process.argv.slice(2);
const need = (flag, v) => { if (v === undefined) { console.error('Нет значения для ' + flag); process.exit(2); } return v; };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], v = () => need(a, argv[++i]);
  if (a === '--tab' || a === '--click' || a === '--eval' || a === '--wait') o.steps.push({ kind: a.slice(2), value: v() });
  else if (a === '--before') o.before = v();
  else if (a === '--after') o.after = v();
  else if (a === '--only') o.only = v();
  else if (a === '--data') o.data = v();
  else if (a === '--selector') o.selector = v();
  else if (a === '--width') o.width = +v();
  else if (a === '--height') o.height = +v();
  else if (a === '--out') o.out = v();
  else if (a === '--full') o.full = true;
  else if (a === '--mobile') o.mobile = true;
  else if (a === '--dark') o.dark = true;
  else if (a === '--print') o.print = true;
  else if (a === '--pdf') o.pdf = o.print = true;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
  else { console.error('Неизвестный ключ: ' + a + '   (справка: node tools/shot.js --help)'); process.exit(2); }
}
if (o.only && o.only !== 'before' && o.only !== 'after') { console.error('--only: before или after'); process.exit(2); }
if (o.mobile) { o.width = 390; o.height = 844; }

const sh = cmd => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-erp-shot-'));
const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
const out = path.resolve(o.out || path.join(os.tmpdir(), 'glass-erp-shots', 'shot-' + stamp + '.png'));
fs.mkdirSync(path.dirname(out), { recursive: true });

function dataText() {
  if (!o.data) return null;
  let file = o.data.replace(/^~(?=\/|$)/, os.homedir());
  if (o.data === 'latest') {
    const dir = path.join(os.homedir(), 'Downloads');
    const found = fs.readdirSync(dir).filter(f => /^glazing_system_data.*\.json$/.test(f))
      .map(f => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (!found.length) { console.error('В ~/Downloads нет glazing_system_data*.json'); process.exit(1); }
    file = found[0];
  }
  console.log('Данные: ' + file);
  return fs.readFileSync(file, 'utf8');
}

function beforeFile() {
  if (fs.existsSync(o.before)) return { file: path.resolve(o.before), label: 'NOW · ' + path.basename(o.before) };
  const file = path.join(tmp, 'before.html');
  fs.writeFileSync(file, sh('git show ' + JSON.stringify(o.before + ':dist/GLASS_ERP.html')));
  const sha = sh('git rev-parse --short ' + JSON.stringify(o.before)).trim();
  return { file, label: 'NOW · ' + o.before + ' ' + sha };
}

function afterFile() {
  if (o.after) return { file: path.resolve(o.after), label: 'AFTER · ' + path.basename(o.after) };
  const { renderHtml } = require('../build/build');
  const file = path.join(tmp, 'after.html');
  fs.writeFileSync(file, renderHtml());
  const branch = sh('git rev-parse --abbrev-ref HEAD').trim();
  const dirty = sh('git status --porcelain -- src build').trim() ? ' + uncommitted' : '';
  return { file, label: 'AFTER · ' + branch + dirty };
}

const ready = page => page.waitForFunction(() => {
  const app = document.getElementById('app');
  return !!app && app.innerHTML.length > 200;
}, null, { timeout: 20000 });

async function shoot(browser, side, json) {
  const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height },
    isMobile: o.mobile, hasTouch: o.mobile, deviceScaleFactor: o.mobile ? 2 : 1 });
  await ctx.addInitScript(() => { window.GF_NO_SIGNIN = true; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(pathToFileURL(side.file).href);
  await ready(page);
  if (json || o.dark) {
    await page.evaluate(([text, dark]) => {
      /* Тот же путь, что у кнопки Import, только без вопроса «заменить базу?». */
      if (text) localStorage.setItem('glazing_system_v1', JSON.stringify(prepareImportedState(JSON.parse(text))));
      if (dark) localStorage.setItem('glass_farm_theme', 'dark');
    }, [json, o.dark]);
    await page.reload();
    await ready(page);
  }
  for (const s of o.steps) {
    if (s.kind === 'tab') await page.evaluate(k => navGo(k), s.value);
    else if (s.kind === 'click') await page.click(s.value, { timeout: 10000 });
    else if (s.kind === 'eval') await page.evaluate(s.value);
    else if (s.kind === 'wait') await page.waitForTimeout(+s.value);
    await page.waitForTimeout(150);
  }
  if (o.print) await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(300);
  const png = path.join(tmp, side.name + '.png');
  if (o.selector) await page.locator(o.selector).first().screenshot({ path: png });
  else await page.screenshot({ path: png, fullPage: o.full });
  if (o.pdf) {
    const pdf = out.replace(/\.png$/i, '') + '-' + side.name + '.pdf';
    await page.pdf({ path: pdf, format: 'Letter', preferCSSPageSize: true, printBackground: true });
    console.log('PDF ' + side.name + ': ' + pdf);
  }
  await ctx.close();
  console.log(side.label + ' — ошибок в консоли: ' + errors.length + errors.map(e => '\n    ' + e.slice(0, 300)).join(''));
  return Object.assign({ png }, side);
}

/* Склейка: широкие снимки — друг под другом, узкие — рядом. */
async function stitch(browser, shots) {
  const width = f => fs.readFileSync(f).readUInt32BE(16);
  const row = shots.every(s => width(s.png) <= 1000);
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const figs = shots.map(s => '<figure><figcaption>' + esc(s.label) + '</figcaption><img src="data:image/png;base64,' +
    fs.readFileSync(s.png).toString('base64') + '"></figure>').join('');
  const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
  await page.setContent('<style>body{margin:0;background:#fff}#w{display:inline-flex;flex-direction:' + (row ? 'row' : 'column') +
    ';gap:24px;padding:16px;font:600 18px -apple-system,"Segoe UI",sans-serif;color:#111}figure{margin:0}' +
    'figcaption{padding:0 0 8px}img{display:block;border:1px solid #888}</style><div id="w">' + figs + '</div>');
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
  await page.locator('#w').screenshot({ path: out });
  await page.close();
}

(async () => {
  const json = dataText();
  const sides = [];
  if (o.only !== 'after') sides.push(Object.assign({ name: 'before' }, beforeFile()));
  if (o.only !== 'before') sides.push(Object.assign({ name: 'after' }, afterFile()));
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  try {
    const shots = [];
    for (const side of sides) shots.push(await shoot(browser, side, json));
    if (shots.length === 1) fs.copyFileSync(shots[0].png, out);
    else await stitch(browser, shots);
  } finally {
    await browser.close();
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nСнимок: ' + out);
})().catch(e => { console.error('\nНе вышло: ' + e.message); process.exit(1); });
