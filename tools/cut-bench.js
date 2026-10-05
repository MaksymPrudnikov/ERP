#!/usr/bin/env node
/* =====================================================================
   Раскрой против Perfect Cut на настоящих батчах владельца.

   Зачем. Владелец, 5 октября 2026: один эталон «23 листа» — мало; правка,
   логичная сама по себе, тихо добавляла лист на другом батче. Перед любой
   правкой раскроя (`src/erp/production/cut-layout.js`) прогнать все батчи:
   у ERP не должно стать больше листов ни на одном.

   Данные — ТОЛЬКО на машине владельца, в Git их нет и класть нельзя:
   в исходных проектах Perfect Cut клиенты и заказы. Где лежит файл —
   переменная CUT_BENCH или первая строка ~/.glass-erp-cut-bench.
   Формат: [{name, mm, sizes:{"W x H": листов}, pieces:{"W x H": штук},
   trims:{trimY,borderX,borderY}, sheets (листов у Perfect Cut), count}],
   размеры в дюймах.

   Запуск:  node tools/cut-bench.js            по src/index.html рабочего дерева
            node tools/cut-bench.js --all      ещё и батчи больше 1000 стёкол
            node tools/cut-bench.js --only 5MM  только батчи с этим в имени
            node tools/cut-bench.js --target <файл.html>
   Код выхода 1 — где-то ERP взял больше листов, чем Perfect Cut. Известные
   (владелец согласовал): SUPERGRAY — Min distance 3/4″ строже Perfect Cut,
   базу не меняем; батчи больше 1000 стёкол — квоты, по умолчанию не гоняются.
   ===================================================================== */
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const KNOWN = ['SUPERGRAY'];

function benchFile() {
  if (process.env.CUT_BENCH) return process.env.CUT_BENCH;
  const cfg = path.join(os.homedir(), '.glass-erp-cut-bench');
  if (fs.existsSync(cfg)) return fs.readFileSync(cfg, 'utf8').split('\n')[0].trim();
  return '';
}

(async () => {
  const file = benchFile();
  if (!file || !fs.existsSync(file)) {
    console.log('Нет данных эталонов: задай CUT_BENCH или путь в ~/.glass-erp-cut-bench.\n' +
      'Данные есть только на машине владельца. Без них сравнение не сделано — так и напиши в PR.');
    process.exit(2);
  }
  let { chromium } = {};
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('Нет playwright — сначала: npm ci'); process.exit(2); }
  const only = opt('--only'), all = args.includes('--all');
  const target = opt('--target') ? path.resolve(opt('--target')) : path.join(ROOT, 'src/index.html');
  const bench = JSON.parse(fs.readFileSync(file, 'utf8'))
    .filter(b => (!only || b.name.includes(only)) && (all || only || b.count <= 1000));

  const br = await chromium.launch();
  const c = await br.newContext();
  await c.addInitScript(() => { window.GF_NO_SIGNIN = true; });
  const p = await c.newPage();
  p.on('dialog', d => d.accept());
  await p.goto('file://' + target);
  await p.waitForTimeout(300);
  await require(path.join(ROOT, 'test/optimization-fixture'))(p);

  let worse = 0;
  console.log('батч'.padEnd(40) + 'PC  ERP');
  for (const b of bench) {
    /* Perfect Cut иногда пишет толщину в «дюймах × 25,4»: 152.4 — это 6 мм. */
    const mm = b.mm > 25 ? Math.round(b.mm / 25.4 * 10) / 10 : b.mm;
    const t0 = Date.now();
    const r = await p.evaluate(({ b, mm }) => {
      oqReset(); DB.glassSheet = []; DB.cutting = cutSettingsDefault();
      Object.keys(b.sizes).forEach(k => { const [w, h] = k.split('x').map(Number); DB.glassSheet.push(normalizeGlassSheet({ productCode: '6CLEAR', supplier: 'Vitro', sheetWIn: w, sheetHIn: h, availability: 'stock' })); });
      const id = oqOrder(oqCustomer({ legalName: 'Bench' }), { dueDate: '2026-09-25' });
      salesOrderEdit(id); const m = soDraft.makeups[0]; m.unitType = 'single'; m.panes = [m.panes[0]]; m.cavities = [];
      soDraft.lines = Object.entries(b.pieces).map(([k, q], i) => { const [w, h] = k.split('x').map(Number); const l = normalizeSalesOrderLine({ makeupId: m.id, width16: Math.round(w * 16), height16: Math.round(h * 16), qty: q, mark: 'M' + (i + 1) }); salesEnsureLineShape(l); return l; });
      soDraft.lines.forEach(l => salesLineChargeRows(l).forEach(r => { salesEnsureChargePricing(l, r).orderRate = 0.013; }));
      if (!salesOrderSave()) return { error: 'order not saved' };
      soDraft = null; soEdit = null; oqThrough(id, 'verified');
      glassBatchAssign(glassBatchRows([salesRecord(id)]), {}); const n = DB.glassBatch[0].number;
      /* Отступы — как в проекте Perfect Cut (низ = лево: его первый рез по Y
         равен TRIMLEFT); Min distance — из таблицы цеха по толщине. */
      const row = cutRowsDefault().reduce((a, r) => Math.abs(r.mm - mm) < Math.abs(a.mm - mm) ? r : a);
      const t = b.trims, edits = { trimX: t.trimY, trimY: t.trimY, borderX: t.borderX, borderY: t.borderY, minDist: row.minDist };
      const pl = cutPlanFor(n); if (pl && !pl.reset) cutPlanReset(n);
      for (const [f, v] of Object.entries(edits)) { const e = cutSetParam(n, '6CLEAR', f, frac16(v)); if (e && e.error) return { error: f + ': ' + e.error }; }
      const res = cutPlanRun(n); if (res.error) return { error: res.error };
      const g = res.plan.groups[0];
      return { sheets: g.sheets.length, placed: res.plan.stats.placed === res.plan.stats.total, safe: cutGroupCutQuality(g).bad === 0, strategy: g.strategy };
    }, { b, mm });
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const bad = r.error || !r.placed || !r.safe || r.sheets > b.sheets;
    const known = KNOWN.some(k => b.name.includes(k));
    if (bad && !known) worse++;
    console.log((bad ? (known ? '~ ' : '✗ ') : '  ') + b.name.slice(0, 38).padEnd(38) + String(b.sheets).padStart(4) + String(r.sheets || '-').padStart(5) +
      '  ' + (r.error || (!r.placed ? 'не всё разложено' : !r.safe ? 'не режется' : r.strategy)) + ' · ' + sec + ' с');
  }
  await br.close();
  console.log(worse ? `\nХУЖЕ Perfect Cut: ${worse}` : '\nНигде не хуже Perfect Cut (~ — известные, согласованы с владельцем).');
  process.exit(worse ? 1 : 0);
})();
