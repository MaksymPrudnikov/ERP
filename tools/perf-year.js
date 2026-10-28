#!/usr/bin/env node
/* =====================================================================
   Годовой прогон: быстро ли ERP на годе работы цеха (задание «База»,
   этап 2). Одна команда отвечает: где тормозит, сколько памяти берёт
   вкладка, на сколько лет хватит места.

   Как устроено.
   · База загружается через настоящий Import (кнопка Import JSON): любая —
     симуляция tools/sim-shop.js (.ndjson / .json) или выгрузка ERP.
   · Замеры: Import, F5 (и по частям: чтение записей, сборка, нормализация,
     отрисовка), каждый экран, действия — Save заказа, Convert квоты, батч с
     раскроем, скан на станции (поле скана + Enter), PS и Shipped, оплата —
     всего и по частям (сравнение с базой, нормализация, перерисовка, запись
     в IndexedDB в фоне), вторая вкладка, память вкладки, размер и самые
     тяжёлые таблицы.
   · Два прохода: обычный и процессор ×4 медленнее (слабый ПК станции).
     Пороги владельца для прохода ×4 — свой у каждого действия (28.10.2026:
     «мой порог может варьироваться в зависимости от действия»): скан ≤ 1 с
     («никто не сканирует быстрее секунды»), действие офиса (Save, Convert,
     батч, правка листа, PS, Shipped, оплата) ≤ 5 с, экран ≤ 1 с, F5 ≤ 5 с
     (20.10), память вкладки ≤ 1 ГБ.
   · Экран или действие дольше --timeout не ждём: «больше N с ✗», вкладка
     перезапускается (база в профиле на диске остаётся) — иначе прогон шёл бы
     сутки.

   · Честно (проверка Codex 22.10.2026): действие засчитано, только если
     сделало своё (заказ сохранён, квота стала заказом, батч с раскроем,
     накладная отгружена, оплата записана) и дошло до базы; время — вместе
     с перерисовкой экрана. «Нет данных» и тайм-аут — ✗, не ✓; вторая
     вкладка без ответа — тоже ✗.
   · Контрольные ответы: до замеров (проход ×1, база как после Import) —
     строка каждого заказа из списка Sales: статус, готово/всего, стекло,
     батчи, площадь, сумма, оплачено, баланс, кто создал. --compare <папка
     прошлого прогона> сверяет их: ускорение принимается, только если
     ответы те же (расхождение — ✗ «answers»).
   · --years N (вместе с --archive): архив размножается на N−1 прошлых
     лет — копии записей склада cold и строк указателя со сдвигом дат на k
     лет и своими ключами (суффикс ~k у ключей записей, заказов, номеров
     стёкол, батчей, оплат и прочих номеров); клиенты, справочники и год в
     работе — те же. Так получается база за N лет без Import N лет.
   · --archive <день> (задание «База», А5): после Import заказы, которым
     к этому дню пора в архив, уходят (archiveRun) — время и сколько ушло;
     замеры идут уже с архивом. Ответы «после» сверяются с «до»: заказ в
     работе — вся строка, ушедший — колонки списка Sales из указателя
     архива (✗ «archive answers», если что-то не так).

   Выход: ~/.glass-erp-walk/perf/<дата>-<имя>/ — report.md, report.json,
   PNG медленных экранов. В Git не класть: это рабочие и тестовые данные.

   Примеры:
     node tools/perf-year.js ~/.glass-erp-walk/sim/year2-12m.ndjson --name year --required
     node tools/perf-year.js ~/Downloads/glazing_system_data.ndjson --cpu 1
     node tools/perf-year.js ~/.glass-erp-walk/sim/year2-3m.ndjson --name 3m-after --compare ~/.glass-erp-walk/perf/2026-10-22-3m-before
   Ключи: --name --out --cpu 1,4 --timeout 120 (с) --dist (собранный файл)
          --required (пороги обязательны: ✗ — код выхода 1)
          --compare <папка или report.json прошлого прогона> (контрольные ответы)
          --archive <YYYY-MM-DD> (уход в архив после Import, сверка ответов)
          --years N (с --archive: архив за N лет)
   ===================================================================== */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const o = { base: '', name: '', out: path.join(os.homedir(), '.glass-erp-walk', 'perf'), cpu: [1, 4], timeout: 120, dist: false, required: false, compare: '', archive: '', years: 1 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], v = () => argv[++i];
  if (a === '--name') o.name = v(); else if (a === '--out') o.out = v(); else if (a === '--cpu') o.cpu = v().split(',').map(Number);
  else if (a === '--timeout') o.timeout = +v(); else if (a === '--dist') o.dist = true; else if (a === '--required') o.required = true;
  else if (a === '--compare') o.compare = v().replace(/^~(?=\/|$)/, os.homedir());
  else if (a === '--years') o.years = Math.max(1, Math.floor(+v() || 1));
  else if (a === '--archive') { o.archive = v(); if (!/^\d{4}-\d{2}-\d{2}$/.test(o.archive)) { console.error('--archive: день YYYY-MM-DD'); process.exit(2); } }
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
  else if (!o.base && !a.startsWith('--')) o.base = a.replace(/^~(?=\/|$)/, os.homedir());
  else { console.error('Неизвестный ключ: ' + a); process.exit(2); }
}
if (!o.base || !fs.existsSync(o.base)) { console.error('Укажите базу: node tools/perf-year.js <файл .ndjson|.json>'); process.exit(2); }
if (!o.name) o.name = path.basename(o.base).replace(/\.(nd)?json$/, '');
const TH = { scan: 1000, action: 5000, screen: 1000, f5: 5000, heapMB: 1024 };
const day = new Date().toISOString().slice(0, 10), dir = path.join(o.out, day + '-' + o.name), profile = path.join(dir, 'profile');
const URL = 'file://' + path.join(ROOT, o.dist ? 'dist/GLASS_ERP.html' : 'src/index.html');
fs.rmSync(profile, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });

const SCREENS = [['Overview', 'dashboard'], ['Sales', 'sales'], ['Sales order', '@order'], ['Production', 'production'], ['Optimization', 'optimization'],
  ['Station', '@station'], ['Shipping', 'shipping'], ['Finance', 'finance'], ['Reports', 'reports'], ['Inventory', 'inventory'],
  ['Purchasing', 'purchasing'], ['Master Data', 'masterdata'], ['Users', 'users']];
const ACTIONS = ['Save order', 'Save 100 lines', 'Convert quote', 'Batch + cut', 'Sheet edit', 'Packing slip', 'Shipped', 'Payment'];

/* В странице: открыть экран, выполнить действие с замером по частям. */
function pageSetup() {
  const T = () => performance.now(), layout = () => document.getElementById('app').getBoundingClientRect();
  const parts = () => {
    const p = { compare: 0, normalize: 0, render: 0 }, keep = [];
    [['storageDiff', 'compare'], ['normalizeSalesData', 'normalize'], ['normalizeDB', 'normalize'], ['render', 'render']].forEach(([name, key]) => {
      const f = window[name]; if (typeof f !== 'function') return; keep.push([name, f]);
      window[name] = function () { const t = T(); try { return f.apply(this, arguments); } finally { p[key] += T() - t; } };
    });
    return { p, undo: () => keep.forEach(([n, f]) => { window[n] = f; }) };
  };
  const pick = (list, test) => { for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return list[i]; return null; };
  const worker = () => (DB.user || []).find(u => u.pin && u.no);
  window.PERF = {
    /* Экран — от вызова до готовой разметки; прежний экран не перерисовывается. */
    screen(k) {
      const t = T();
      if (k === '@order') { const ord = pick(DB.salesOrder, x => !salesIsQuote(x) && x.status !== 'cancelled'); if (!ord) return { skip: 'no order' }; tab = 'sales'; salesOrderEdit(ord.id); }
      else if (k === '@station') { const u = worker(); if (!u) return { skip: 'no station worker' }; tab = 'station'; stationCode = 'CUT'; stationLogin(u.viewProfileId); }
      else navGo(k);
      layout(); return { ms: T() - t };
    },
    async action(name) {
      /* Перерисовка входит в действие, как у клика: команда без своей — рисуем экран. */
      const run = fn => { const pr = parts(), t = T(); let out; try { out = fn(); if (!pr.p.render) render(); } finally { pr.undo(); } return { ms: T() - t, parts: pr.p, out }; };
      const flush = async r => { const t = T(); if (!await storageFlush() && !r.error) r.error = 'not saved to the database'; r.idb = T() - t; if (r.parts) Object.keys(r.parts).forEach(k => { r.parts[k] = Math.round(r.parts[k]); }); return r; };
      /* Действие — на своём экране: его перерисовка входит в замер, как у человека. */
      tab = { 'Save order': 'sales', 'Save 100 lines': 'sales', 'Convert quote': 'sales', 'Batch + cut': 'optimization', 'Sheet edit': 'optimization', 'Packing slip': 'shipping', Shipped: 'shipping', Payment: 'finance' }[name] || 'sales';
      await storageFlush();
      if (name === 'Save order') {
        const ord = pick(DB.salesOrder, x => !salesIsQuote(x) && ['new', 'verified', 'batched'].includes(x.status)); if (!ord) return { skip: 'no open order' };
        const note = 'perf ' + Date.now(); salesOrderEdit(ord.id); soDraft.notes = note;
        const r = run(() => salesOrderSave()); salesDraftDrop(); r.note = ord.businessNumber; delete r.out;
        if ((salesRecord(ord.id) || {}).notes !== note) r.error = 'order not saved'; return flush(r);
      }
      /* Заказ на 100 строк (владелец, 28.10.2026: «в нашей системе 100 линий
         сохраняет более 10 минут»): новый заказ дописывается до 100 строк. */
      if (name === 'Save 100 lines') {
        const ord = pick(DB.salesOrder, x => !salesIsQuote(x) && x.status === 'new' && (x.lines || []).length); if (!ord) return { skip: 'no new order' };
        salesOrderEdit(ord.id); const l0 = soDraft.lines[0];
        while (soDraft.lines.length < 100) { const l = normalizeSalesOrderLine({ makeupId: l0.makeupId, width16: l0.width16, height16: l0.height16, qty: 1, mark: 'P' + soDraft.lines.length }); salesEnsureLineShape(l); soDraft.lines.push(l); }
        const r = run(() => salesOrderSave()); salesDraftDrop(); delete r.out; const n = ((salesRecord(ord.id) || {}).lines || []).length;
        r.note = ord.businessNumber + ' · ' + n + ' lines'; if (n < 100) r.error = 'order not saved'; return flush(r);
      }
      if (name === 'Convert quote') {
        const q = pick(DB.salesOrder, x => salesIsQuote(x) && !x.wonOrderId && !salesQuoteWonMember(x) && !['lost', 'expired', 'cancelled'].includes(x.status)); if (!q) return { skip: 'no open quote' };
        const n = DB.salesOrder.length, r = run(() => salesConvertQuoteRecord(q.id)); r.note = q.businessNumber; delete r.out; if (DB.salesOrder.length === n) r.error = 'quote not converted'; return flush(r);
      }
      if (name === 'Batch + cut') {
        let rows = [];
        for (let i = DB.salesOrder.length - 1; i >= 0 && !rows.length; i--) {
          const x = DB.salesOrder[i]; if (x.status !== 'verified' || x.onHold) continue;
          glassPieceEnsure(x); rows = glassBatchRows([x]).filter(r => !r.reason && r.cut && r.piece && !r.l.onHold);
        }
        if (!rows.length) return { skip: 'no verified order to batch' };
        const g = rows.filter(r => r.glassId === rows[0].glassId);
        const r = run(() => { const b = glassBatchAssign(g, {}); if (b) cutPlanRun(b.number); return b; }), b = r.out; r.note = (b && b.number || '—') + ' · ' + g.length + ' glass'; delete r.out;
        if (!b || !b.number || !cutPlanFor(b.number)) r.error = 'not batched or not cut'; else PERF.lastBatch = b.number; return flush(r);
      }
      /* Правка листа руками — замок на стекле только что собранного батча. */
      if (name === 'Sheet edit') {
        const plan = PERF.lastBatch && cutPlanFor(PERF.lastBatch), p = plan && plan.groups.flatMap(x => x.sheets).flatMap(x => x.pieces)[0];
        if (!p) return { skip: 'no built batch' };
        const was = !!p.locked, r = run(() => cutPieceLock(PERF.lastBatch, p.piece)); r.note = PERF.lastBatch + ' · ' + p.piece;
        if (!r.out || r.out.error || !!cutFind(cutPlanFor(PERF.lastBatch), p.piece).piece.locked === was) r.error = r.out && r.out.error || 'lock not saved'; delete r.out; return flush(r);
      }
      /* PS и Shipped — два нажатия, порознь; готовое стекло выбрано до замера,
         как его выбирает человек на экране. */
      if (name === 'Packing slip') {
        const ord = pick(DB.salesOrder, x => !x.onHold && !['cancelled', 'closed', 'done'].includes(x.status) && shippingAvailable(x).length);
        if (!ord) return { skip: 'no ready glass' };
        const items = shippingAvailable(ord).map(shippingItem);
        const r = run(() => shippingCreate({ customerId: ord.customerId, method: 'pickup', shipTo: {}, date: new Date().toISOString().slice(0, 10), items, extras: [], note: '' }));
        r.note = ord.businessNumber + ' · ' + items.length + ' units'; if (!r.out || !r.out.ok) r.error = r.out && r.out.error || 'packing slip not made'; else PERF.lastPs = r.out.value.id; delete r.out; return flush(r);
      }
      if (name === 'Shipped') {
        const s0 = PERF.lastPs && (DB.shipment || []).find(x => x.id === PERF.lastPs); if (!s0) return { skip: 'no packing slip' };
        const r = run(() => shippingMarkShipped(s0.id)); r.note = s0.number; const s = (DB.shipment || []).find(x => x.id === s0.id);
        if (!s || s.status !== 'shipped') r.error = r.out && r.out.error || 'packing slip not shipped'; delete r.out; return flush(r);
      }
      if (name === 'Payment') {
        const c = (DB.customer || [])[0]; if (!c) return { skip: 'no customer' };
        const n = (DB.receipt || []).length, d = { customerId: c.id, date: new Date().toISOString().slice(0, 10), method: 'cash', reference: '', note: 'perf', amount: 1, allocations: [], currency: 'CAD' };
        /* Как кнопка Save receipt: с областью записи, если она есть (задание «База»). */
        const r = run(() => finPersist(() => finSaveReceiptRecord(d, '', '', true), typeof finReceiptScope === 'function' ? finReceiptScope(d, '') : undefined));
        if ((DB.receipt || []).length !== n + 1) r.error = r.out && r.out.error || 'payment not recorded'; delete r.out; return flush(r);
      }
      return { skip: 'unknown action' };
    },
    /* Скан для настоящего поля скана: стекло, которое ждёт на станции. */
    scanTarget() {
      const u = worker(); if (!u) return null;
      for (const st of ['CUT', 'ARRIS', 'POLISH', 'HEAT', 'IGU', 'SHIPR']) {
        for (let i = (DB.glassPiece || []).length - 1, seen = 0; i >= 0 && seen < 400; i--) {
          for (const id of DB.glassPiece[i].ids || []) { if (!id) continue; seen++; const c = stationCheck(st, id); if (STATION_RECORDED.includes(c.kind)) return { st, id, user: u.viewProfileId }; }
        }
      }
      return null;
    },
    /* Контрольные ответы: строка каждого заказа из списка Sales — в области
       отрисовки (erp/read-scope), как на экране: сверка проверяет тот путь,
       которым экран отвечает. */
    answers() {
      const keys = ['number', 'status', 'readyQty', 'glass', 'batch', 'newLines', 'pcs', 'area', 'total', 'receipts', 'balance', 'createdBy'];
      const all = () => (DB.salesOrder || []).map(o => { const i = salesListInfo(o); return [o.id].concat(keys.map(k => { try { const v = salesListValue(i, k); return v == null ? null : v; } catch (e) { return 'error: ' + e.message; } })); });
      return { keys, rows: typeof readScope === 'function' ? readScope(all) : all() };
    },
    /* Уход в архив на день (--archive) и строки ушедших из указателя. */
    archive(day) { storageTakeControl(); const t = performance.now(), r = archiveRun(day); return { ms: Math.round(performance.now() - t), ok: r.ok, error: r.error || '', orders: r.value && r.value.orders, records: r.value && r.value.records }; },
    /* --years: копии архива на прошлые годы. Ключи — суффикс ~k у строк из
       набора (ключи записей cold, заказы, номера); даты — минус k лет.
       Читается частями по ключу — память не растёт с размером архива. */
    async years(n) {
      const t = performance.now(), ids = new Set(), num = /^(?:G-\d{5,}|B-\d+|R-\d+|RF-\d+|NCR\d+|PS-\d+|Q-\d+(?:-R\d+)?|\d{5,6})$/;
      const chunk = (store, after) => storageIdbTx([store], 'readonly', tx => { const out = { rows: [] }; tx.objectStore(store).getAll(after ? IDBKeyRange.lowerBound(after, true) : null, 4000).onsuccess = e => { out.rows = e.target.result || []; }; return out; }).then(x => x.rows);
      const each = async (store, fn) => { let after = null; for (;;) { const rows = await chunk(store, after); if (!rows.length) return; await fn(rows); const r = rows[rows.length - 1]; after = store === 'cold' ? [r.tbl, r.id] : r.id; } };
      await each('cold', rows => { rows.forEach(r => { ids.add(r.id); (r.owners || []).forEach(x => ids.add(x)); }); });
      await each('archive', rows => { rows.forEach(r => { if (!String(r.id).startsWith('L:')) ids.add(r.id); }); });
      const day = (y, m, d, k) => { const yy = +y - k; return yy + '-' + m + '-' + (m === '02' && d === '29' ? '28' : d); };
      const T = (text, k) => text.replace(/"((?:[^"\\]|\\.)*)"/g, (q, v) => ids.has(v) || num.test(v) ? '"' + v + '~' + k + '"' : q.replace(/(\d{4})-(\d{2})-(\d{2})/g, (x, y, m, d) => day(y, m, d, k)));
      let cold = 0, rows = 0;
      for (let k = 1; k < n; k++) {
        await each('cold', list => storageIdbTx(['cold'], 'readwrite', tx => { const st = tx.objectStore('cold'); list.forEach(r => { st.put({ tbl: r.tbl, id: JSON.parse(T(JSON.stringify(r.id), k)), seq: r.seq, data: T(r.data, k), owners: (r.owners || []).map(x => JSON.parse(T(JSON.stringify(x), k))), month: r.month ? day(r.month.slice(0, 4), r.month.slice(5, 7), '01', k).slice(0, 7) : '' }); cold++; }); }));
        await each('archive', list => storageIdbTx(['archive'], 'readwrite', tx => { const st = tx.objectStore('archive'); list.forEach(r => { if (String(r.id).indexOf('~') >= 0) return; const id = String(r.id).startsWith('L:') ? String(r.id).replace(/^(L:[^:]+:)(.*)$/, (x, p, v) => p + JSON.parse(T(JSON.stringify(v), k))) : JSON.parse(T(JSON.stringify(r.id), k)); st.put({ id, row: JSON.parse(T(JSON.stringify(r.row), k)) }); rows++; }); }));
      }
      return { ms: Math.round(performance.now() - t), cold, rows };
    },
    answersArchived(keys) { return [...archiveIndex].map(([id, a]) => [id].concat(keys.map(k => Object.prototype.hasOwnProperty.call(a.row, k) ? a.row[k] : '∅'))); },
    f5parts() { const m = typeof storageBootMs !== 'undefined' && storageBootMs || {}; return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)])); },
    size() {
      const by = {}; let total = 0;
      storageBase.forEach((m, tbl) => { let n = 0; m.forEach(x => { n += x.t.length; }); by[tbl] = n; total += n; });
      const orders = (DB.salesOrder || []).map(x => Date.parse(x.createdAt)).filter(Number.isFinite);
      return { total, top: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10), months: orders.length ? (Math.max(...orders) - Math.min(...orders)) / (30.44 * 864e5) : 0,
        orders: (DB.salesOrder || []).length, scans: (DB.stationScan || []).length, batches: (DB.glassBatch || []).length };
    }
  };
}

let ctx, page, cdp, rate = 1;
const errors = [];
const within = (ms, p) => { let timer; return Promise.race([p.then(v => ({ v }), e => ({ error: String(e.message).split('\n')[0] })), new Promise(r => { timer = setTimeout(() => r({ timeout: true }), ms); })]).finally(() => clearTimeout(timer)); };
async function open() {
  ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1440, height: 900 }, timezoneId: 'America/Toronto', locale: 'en-CA' });
  await ctx.addInitScript(() => { window.GF_NO_SIGNIN = true; window.GF_NO_ARCHIVE = true; });
  page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept().catch(() => {}));
  cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}
/* Открыть ERP (или F5) — до готового первого экрана. Старт ждём дольше
   экрана: на годе это и есть главный замер. */
async function boot(reload) {
  const t = Date.now();
  if (reload) await page.reload({ timeout: 0 }); else await page.goto(URL, { timeout: 0 });
  await page.evaluate(() => window.storageReady);
  await page.waitForFunction(() => document.getElementById('app').innerHTML.length > 200, null, { timeout: 0 });
  const ms = Date.now() - t; await page.evaluate(`(${pageSetup.toString()})()`); return ms;
}
/* Вкладка зависла на экране — закрыть, открыть заново: база в профиле на диске. */
async function restart() { await ctx.close().catch(() => {}); await open(); await boot(); }
async function heapMB() {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const m = (await cdp.send('Performance.getMetrics')).metrics.find(x => x.name === 'JSHeapUsedSize'); return Math.round(m.value / 1048576);
}
const fmt = ms => ms == null ? '—' : ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : Math.round(ms) + ' ms';

(async () => {
  const t0 = Date.now(), report = { base: o.base, name: o.name, date: new Date().toISOString(), machine: os.cpus()[0].model + ' · ' + Math.round(os.totalmem() / 1073741824) + ' GB', thresholds: TH, passes: [] };
  await open(); await boot();
  report.build = await page.evaluate(() => typeof ERP_BUILD !== 'undefined' ? ERP_BUILD : 'dev');
  console.log('Import', o.base, (fs.statSync(o.base).size / 1048576).toFixed(0) + ' МБ…');
  await page.evaluate(() => { const f = window.storageImportFile; window.PERF_IMPORT = new Promise(res => { window.storageImportFile = file => f(file).then(r => { res(r); return r; }, e => { res('error: ' + e.message); throw e; }); }); });
  const ti = Date.now(); await page.setInputFiles('#imp', o.base);
  const imp = await within(30 * 60000, page.evaluate(() => window.PERF_IMPORT));
  report.import = { ms: Date.now() - ti, result: imp.v === true ? 'ok' : imp.timeout ? 'timeout' : String(imp.v || imp.error) };
  console.log('Import', fmt(report.import.ms), report.import.result);
  if (report.import.result !== 'ok') { fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 1)); console.error('Import не прошёл'); await ctx.close(); process.exit(1); }
  /* --archive: ответы «до» — по базе как после Import; уход — одним действием. */
  if (o.archive) {
    await boot(true);
    const a = await within(30 * 60000, page.evaluate(() => PERF.answers()));
    report.answers = a.v || { error: a.timeout ? 'timeout' : a.error };
    const ar = await within(60 * 60000, page.evaluate(d => PERF.archive(d), o.archive));
    await page.evaluate(() => storageFlush());
    report.archive = ar.v || { error: ar.timeout ? 'timeout' : ar.error };
    console.log('архив на', o.archive, ar.v ? fmt(ar.v.ms) + ' · ушло заказов ' + ar.v.orders + ', записей ' + ar.v.records : report.archive.error);
    if (o.years > 1) {
      const y = await within(6 * 3600000, page.evaluate(n => PERF.years(n), o.years));
      report.years = y.v ? Object.assign({ n: o.years }, y.v) : { n: o.years, error: y.timeout ? 'timeout' : y.error };
      console.log('архив за', o.years, 'лет:', y.v ? fmt(y.v.ms) + ' · копий записей ' + y.v.cold + ', строк указателя ' + y.v.rows : report.years.error);
    }
  }
  report.size = await page.evaluate(() => PERF.size());
  report.size.disk = await page.evaluate(async () => navigator.storage && navigator.storage.estimate ? (await navigator.storage.estimate()) : null);

  for (const cpu of o.cpu) {
    rate = cpu; await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const pass = { cpu, screens: [], actions: [] }; console.log('\n== процессор ×' + cpu);
    pass.f5 = { ms: await boot(true) }; pass.f5.parts = await page.evaluate(() => PERF.f5parts());
    console.log('F5', fmt(pass.f5.ms), JSON.stringify(pass.f5.parts));
    /* Ответы — один раз, до действий: база как после Import. */
    if (!report.answers) {
      const a = await within(30 * 60000, page.evaluate(() => PERF.answers()));
      report.answers = a.v || { error: a.timeout ? 'timeout' : a.error };
      if (a.timeout) await restart();
      console.log('контрольные ответы', a.v ? a.v.rows.length + ' заказов' : report.answers.error);
    }
    /* Ответы после ухода: в работе — вся строка, ушедший — колонки Sales из указателя. */
    if (o.archive && report.answers && report.answers.rows && !report.archiveCheck) {
      const keys = report.answers.keys, hot = await page.evaluate(() => PERF.answers()), arch = await page.evaluate(k => PERF.answersArchived(k), keys);
      const now = new Map(hot.rows.map(r => [r[0], r])), old = new Map(arch.map(r => [r[0], r])), diffs = [];
      report.answers.rows.forEach(r => {
        const h = now.get(r[0]), a = old.get(r[0]);
        if (h) { if (JSON.stringify(h) !== JSON.stringify(r)) diffs.push(r[1] + ' в работе: ' + JSON.stringify(r) + ' → ' + JSON.stringify(h)); return; }
        if (!a) { diffs.push(r[1] + ' пропал'); return; }
        keys.forEach((k, i) => { if (a[i + 1] !== '∅' && JSON.stringify(a[i + 1]) !== JSON.stringify(r[i + 1])) diffs.push(r[1] + ' в архиве: ' + k + ' ' + JSON.stringify(r[i + 1]) + ' → ' + JSON.stringify(a[i + 1])); });
      });
      report.archiveCheck = { hot: hot.rows.length, archived: arch.length, same: !diffs.length, diffs: diffs.slice(0, 20) };
      console.log('ответы после архива:', hot.rows.length, 'в работе,', arch.length, 'в архиве,', diffs.length ? '✗ ' + diffs.length + ' расхождений' : 'все те же');
    }
    for (const [label, key] of SCREENS) {
      const r = await within(o.timeout * 1000, page.evaluate(k => PERF.screen(k), key));
      const row = { name: label, ms: r.v && r.v.ms, skip: r.v && r.v.skip, error: r.error, timeout: !!r.timeout };
      if (r.timeout) { row.ms = null; await restart(); }
      row.ok = !row.timeout && !row.error && !row.skip && row.ms <= TH.screen;
      if (!row.ok && !row.timeout && cpu === Math.max(...o.cpu)) await page.screenshot({ path: path.join(dir, 'slow-' + label.toLowerCase().replace(/\W+/g, '-') + '.png') }).catch(() => {});
      pass.screens.push(row); console.log((row.ok ? '✓ ' : '✗ ') + label.padEnd(14), row.timeout ? '> ' + o.timeout + ' s' : row.skip || row.error || fmt(row.ms));
    }
    /* Скан — настоящим полем: код и Enter, время — «Last action» ERP. */
    await page.evaluate(() => storageTakeControl());
    const target = await within(o.timeout * 1000, page.evaluate(() => PERF.scanTarget()));
    if (target.timeout) await restart();
    if (target.v) {
      const sc = await within(o.timeout * 1000, (async () => {
        await page.evaluate(t => { tab = 'station'; stationCode = t.st; stationLogin(t.user); render(); }, target.v);
        const inp = page.locator('[data-station-scan]').first();
        await inp.fill(target.v.id); await page.evaluate(() => { storageLastAction = null; });
        await inp.press('Enter'); await page.waitForFunction(() => storageLastAction != null, null, { timeout: o.timeout * 1000 });
        return page.evaluate(() => storageLastAction);
      })());
      const row = { name: 'Scan (' + target.v.st + ')', ms: sc.v, timeout: !!sc.timeout, error: sc.error, limit: TH.scan, note: target.v.id };
      if (sc.timeout) await restart();
      row.ok = !row.timeout && !row.error && row.ms <= TH.scan; pass.actions.push(row);
      console.log((row.ok ? '✓ ' : '✗ ') + row.name.padEnd(14), row.timeout ? '> ' + o.timeout + ' s' : row.error || fmt(row.ms));
      /* Второй скан подряд — как у стола: звук уже включён, экран станции открыт. */
      if (!sc.timeout) {
        const next = await within(o.timeout * 1000, page.evaluate(st => { for (let i = (DB.glassPiece || []).length - 1, seen = 0; i >= 0 && seen < 400; i--) for (const id of DB.glassPiece[i].ids || []) { if (!id) continue; seen++; if (STATION_RECORDED.includes(stationCheck(st, id).kind)) return id; } return null; }, target.v.st));
        const again = next.v ? await within(o.timeout * 1000, (async () => {
          const inp = page.locator('[data-station-scan]').first();
          await inp.fill(next.v); await page.evaluate(() => { storageLastAction = null; });
          await inp.press('Enter'); await page.waitForFunction(() => storageLastAction != null, null, { timeout: o.timeout * 1000 });
          return page.evaluate(() => storageLastAction);
        })()) : { skip: true };
        const row2 = { name: 'Scan again', ms: again.v, timeout: !!again.timeout, error: again.error, skip: again.skip ? 'no second glass' : undefined, limit: TH.scan, note: next.v || '' };
        if (again.timeout) await restart();
        row2.ok = !row2.timeout && !row2.error && !row2.skip && row2.ms <= TH.scan; pass.actions.push(row2);
        console.log((row2.ok ? '✓ ' : '✗ ') + row2.name.padEnd(14), row2.timeout ? '> ' + o.timeout + ' s' : row2.skip || row2.error || fmt(row2.ms));
      }
    } else pass.actions.push({ name: 'Scan', skip: target.timeout ? 'timeout looking for glass' : 'no glass waiting at a station', ok: false });
    for (const name of ACTIONS) {
      await page.evaluate(() => storageTakeControl());
      const r = await within(o.timeout * 1000, page.evaluate(n => PERF.action(n), name));
      const row = Object.assign({ name, limit: TH.action }, r.v || {}, { timeout: !!r.timeout, error: r.error || r.v && r.v.error });
      if (r.timeout) { row.ms = null; await restart(); }
      row.ok = !row.timeout && !row.error && !row.skip && row.ms <= TH.action; pass.actions.push(row);
      console.log((row.ok ? '✓ ' : '✗ ') + name.padEnd(14), row.timeout ? '> ' + o.timeout + ' s' : row.skip || row.error || fmt(row.ms) + ' ' + JSON.stringify(row.parts || {}) + ' · IndexedDB ' + fmt(row.idb) + (row.note ? ' · ' + row.note : ''));
    }
    /* Вторая вкладка: правка в первой — когда её видит вторая. */
    const p2 = await ctx.newPage(); p2.on('dialog', d => d.accept().catch(() => {}));
    const cdp2 = await ctx.newCDPSession(p2); await cdp2.send('Emulation.setCPUThrottlingRate', { rate });
    const two = await within(o.timeout * 1000, (async () => {
      await p2.goto(URL); await p2.evaluate(() => window.storageReady); await page.bringToFront();
      /* Открытая вкладка сама забирает запись; правка — после того, как
         первая снова писатель, иначе она не запишется (и это не замер). */
      const name = 'Perf ' + Date.now();
      let saved = false, t = 0;
      for (let i = 0; i < 5 && !saved; i++) {
        await page.evaluate(() => storageTakeControl()); t = Date.now();
        saved = await page.evaluate(n => storageCommand(() => { DB.customer[0].legalName = n; }, { customer: [DB.customer[0].id] }).ok, name);
        if (!saved) await page.waitForTimeout(500);
      }
      if (!saved) throw new Error('the first tab could not save');
      await p2.waitForFunction(n => DB.customer[0] && DB.customer[0].legalName === n, name, { timeout: o.timeout * 1000, polling: 20 });
      return Date.now() - t;
    })());
    pass.secondTab = { ms: two.v, timeout: !!two.timeout, error: two.error }; await p2.close().catch(() => {});
    console.log('вторая вкладка', two.timeout ? '> ' + o.timeout + ' s' : two.error || fmt(two.v));
    pass.heapMB = await heapMB(); pass.heapOk = pass.heapMB <= TH.heapMB; console.log('память вкладки', pass.heapMB + ' МБ');
    pass.f5.ok = pass.f5.ms <= TH.f5;
    report.passes.push(pass);
  }
  await ctx.close();
  /* Прогноз места: МБ в месяц по датам заказов. */
  const mb = report.size.total / 1048576, perMonth = report.size.months > 0.5 ? mb / report.size.months : null;
  report.forecast = { mb: +mb.toFixed(1), perMonth: perMonth && +perMonth.toFixed(1), supabaseYears: perMonth ? +((500 - mb) / perMonth / 12).toFixed(1) : null,
    browserYears: perMonth && report.size.disk && report.size.disk.quota ? +(((report.size.disk.quota * 0.8) / 1048576 - mb) / perMonth / 12).toFixed(1) : null };
  const slow = report.passes.find(p => p.cpu === Math.max(...o.cpu));
  report.fail = slow ? [...slow.screens, ...slow.actions].filter(r => !r.ok).map(r => r.name).concat(slow.f5.ok ? [] : ['F5']).concat(slow.heapOk ? [] : ['memory'])
    .concat(slow.secondTab.timeout || slow.secondTab.error ? ['second tab'] : []) : [];
  if (o.compare) { report.compare = compareAnswers(report.answers, o.compare); if (!report.compare.same) report.fail.push('answers'); }
  if (report.archiveCheck && !report.archiveCheck.same || report.archive && report.archive.error) report.fail.push('archive answers');
  report.errors = errors; report.minutes = +((Date.now() - t0) / 60000).toFixed(1);
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(dir, 'report.md'), reportMd(report));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log('\nОтчёт:', path.join(dir, 'report.md'), '· за', report.minutes, 'мин · ✗:', report.fail.join(', ') || 'нет');
  process.exit(o.required && report.fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

function reportMd(r) {
  const mark = ok => ok ? '✓' : '✗', cell = x => x.timeout ? '> ' + o.timeout + ' s' : x.skip ? 'нет данных: ' + x.skip : x.error ? 'ошибка: ' + x.error : fmt(x.ms);
  const s = r.size, L = [];
  L.push('# Годовой прогон · ' + r.name, '', 'База: `' + path.basename(r.base) + '` · ' + (s.total / 1048576).toFixed(0) + ' МБ · ' + s.orders + ' заказов · ' + s.scans + ' сканов · ' + s.batches + ' батчей · ' + s.months.toFixed(1) + ' мес.',
    'Сборка ' + r.build + ' · ' + r.machine + ' · ' + r.date.slice(0, 16).replace('T', ' ') + ' · прогон ' + r.minutes + ' мин.', '',
    'Пороги (проход ×' + Math.max(...o.cpu) + ', слабый ПК): скан ≤ 1 с · действие офиса ≤ 5 с · экран ≤ 1 с · F5 ≤ 5 с · память ≤ 1 ГБ.', '',
    '**Красное:** ' + (r.fail.join(', ') || 'нет') + '.', '', 'Import: ' + fmt(r.import.ms) + ' (×1).', '');
  if (r.years) L.push('Архив за ' + r.years.n + ' лет: ' + (r.years.error ? 'ошибка: ' + r.years.error : 'копии на прошлые годы — ' + r.years.cold + ' записей, ' + r.years.rows + ' строк указателя, ' + fmt(r.years.ms)) + '.', '');
  if (r.archive) {
    const a = r.archive, c = r.archiveCheck;
    L.push('Архив на ' + o.archive + ': ' + (a.error ? 'ошибка: ' + a.error : fmt(a.ms) + ' (×1) · ушло заказов ' + a.orders + ', записей ' + a.records) + '.',
      c ? '- Ответы после ухода: ' + c.hot + ' в работе, ' + c.archived + ' в архиве — ' + (c.same ? 'все те же.' : '**расходятся** (' + c.diffs.length + '):') : '', ...(c && c.diffs || []).map(d => '  - ' + d), '');
  }
  const passes = r.passes;
  L.push('| | ' + passes.map(p => '×' + p.cpu).join(' | ') + ' |', '|---|' + passes.map(() => '---').join('|') + '|');
  L.push('| F5 | ' + passes.map(p => fmt(p.f5.ms) + ' ' + mark(p.f5.ok)).join(' | ') + ' |');
  r.passes[0].screens.forEach((x, i) => L.push('| ' + x.name + ' | ' + passes.map(p => cell(p.screens[i]) + ' ' + mark(p.screens[i].ok)).join(' | ') + ' |'));
  r.passes[0].actions.forEach((x, i) => L.push('| ' + x.name + ' | ' + passes.map(p => cell(p.actions[i]) + ' ' + mark(p.actions[i].ok)).join(' | ') + ' |'));
  L.push('| Вторая вкладка видит правку | ' + passes.map(p => p.secondTab.timeout ? '> ' + o.timeout + ' s' : p.secondTab.error ? 'ошибка' : fmt(p.secondTab.ms)).join(' | ') + ' |');
  L.push('| Память вкладки | ' + passes.map(p => p.heapMB + ' МБ ' + mark(p.heapOk)).join(' | ') + ' |', '');
  L.push('## По частям (×' + Math.max(...o.cpu) + ')', '');
  const last = passes[passes.length - 1];
  if (last.f5.parts) L.push('- F5: чтение записей ' + fmt(last.f5.parts.read) + ', сборка ' + fmt(last.f5.parts.join) + ', нормализация ' + fmt(last.f5.parts.normalize) + ', запись дописанного ' + fmt(last.f5.parts.write) + ', первая отрисовка ' + fmt(last.f5.parts.render) + '.');
  last.actions.filter(a => a.parts).forEach(a => L.push('- ' + a.name + ': сравнение с базой ' + fmt(a.parts.compare) + ', нормализация ' + fmt(a.parts.normalize) + ', отрисовка ' + fmt(a.parts.render) + ', запись в IndexedDB в фоне ' + fmt(a.idb) + (a.note ? ' · ' + a.note : '') + '.'));
  if (r.compare) {
    const c = r.compare;
    L.push('', '## Контрольные ответы', '', c.error ? '- Сравнение не сделано: ' + c.error + '.' : c.same ? '- Совпали с `' + c.with + '`: ' + c.orders + ' заказов, каждый столбец ✓.'
      : '- **Расходятся** с `' + c.with + '` — ' + c.diffs.length + ' (первые 30):', ...(c.diffs || []).slice(0, 30).map(d => '  - ' + d));
  } else if (r.answers && r.answers.rows) L.push('', '## Контрольные ответы', '', '- Записаны: ' + r.answers.rows.length + ' заказов (сверка — `--compare` в следующем прогоне).');
  L.push('', '## Место', '', '- База: ' + r.forecast.mb + ' МБ' + (s.disk ? ', на диске браузера ' + Math.round(s.disk.usage / 1048576) + ' МБ' : '') + '.');
  if (r.forecast.perMonth) L.push('- Рост: ' + r.forecast.perMonth + ' МБ в месяц. Supabase Free (500 МБ): ' + (r.forecast.supabaseYears > 0 ? 'хватит на ' + r.forecast.supabaseYears + ' г.' : 'уже не помещается') + '.' + (r.forecast.browserYears != null ? ' Браузер этого прогона (квота ' + Math.round(s.disk.quota / 1073741824) + ' ГБ): на ' + r.forecast.browserYears + ' г.' : ''));
  L.push('- Самые тяжёлые таблицы: ' + s.top.map(([t, n]) => t + ' ' + (n / 1048576).toFixed(1) + ' МБ').join(', ') + '.');
  if (r.errors.length) L.push('', '## Ошибки страницы', '', ...r.errors.slice(0, 20).map(e => '- ' + e));
  return L.join('\n') + '\n';
}

/* Сверить контрольные ответы с прошлым прогоном: та же база — те же ответы. */
function compareAnswers(now, ref) {
  let old;
  try { old = JSON.parse(fs.readFileSync(fs.statSync(ref).isDirectory() ? path.join(ref, 'report.json') : ref, 'utf8')).answers; } catch (e) { return { same: false, with: ref, error: e.message }; }
  if (!old || !old.rows || !now || !now.rows) return { same: false, with: ref, error: 'no answers in one of the runs' };
  const was = new Map(old.rows.map(r => [r[0], r])), diffs = [];
  now.rows.forEach(r => {
    const w = was.get(r[0]); if (!w) { diffs.push((r[1] || r[0]) + ': нет в прошлом прогоне'); return; }
    now.keys.forEach((k, i) => { if (JSON.stringify(r[i + 1]) !== JSON.stringify(w[old.keys.indexOf(k) + 1])) diffs.push((r[1] || r[0]) + ' · ' + k + ': ' + JSON.stringify(w[old.keys.indexOf(k) + 1]) + ' → ' + JSON.stringify(r[i + 1])); });
    was.delete(r[0]);
  });
  was.forEach(w => diffs.push((w[1] || w[0]) + ': пропал'));
  return { same: !diffs.length, with: path.basename(ref.replace(/\/report\.json$/, '')), orders: now.rows.length, diffs };
}
