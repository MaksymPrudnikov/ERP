/* Сверка по остатку с двух компьютеров (план «до 10», этап 1, 09.11.2026).
   Реестр CLOUD_CHECK / CLOUD_FACT (erp/cloud-sync) объявляет, какие строки
   остатка сервер сверяет, когда команда по нему создаёт новую строку.
   Тест-сторож: таблица, которую пишут модули денег и склада, есть в
   реестре (сверка или факт); стражей руками никто не ставит; у каждой
   сверки — сценарий двух компьютеров против настоящего SQL сервера
   (test/two-pcs.js, PGlite). Ниже — сценарии правил, которые держались
   только на версии самой строки, и кусок S- (сверки не было). */
const fs = require('fs');
const path = require('path');
const { twoPcs: pcs } = require('./two-pcs');

const ROOT = path.resolve(__dirname, '..');
/* Модули денег и склада: что они пишут в DB, то и должно быть в реестре. */
const MONEY_STOCK = ['src/erp/finance', 'src/erp/inventory', 'src/erp/purchasing', 'src/erp/shipping',
  'src/erp/production/cut-layout.js', 'src/erp/production/stock-offcuts.js'];
/* Сценарий двух ПК для каждой сверки: файл теста и начало имени проверки. */
const COVERED = {
  receipt: ['audit-2026-11-08.js', 'C4: два компьютера разносят по полной оплате'],
  refund: ['audit-2026-11-08.js', 'C4: два компьютера возвращают те же $100'],
  referrerPayout: ['audit-2026-11-08.js', 'F06: два компьютера платят агенту'],
  shipment: ['audit-2026-11-08.js', 'C12: два компьютера ставят те же 3 юнита в PS'],
  stockItemEvent: ['audit-2026-11-08.js', 'C13: два пересчёта «80»'],
  consumableEvent: ['audit-2026-11-08.js', 'F09: два пересчёта расходника'],
  inventoryEvent: ['cloud-guards.js', 'до 10: Not found одного куска S- с двух ПК'],
  cutPlan: ['audit-2026-11-08.js', 'аудит Claude: кусок S- в раскроях двух батчей']
};

function files(rel) {
  const p = path.join(ROOT, rel);
  if (fs.statSync(p).isFile()) return [p];
  return fs.readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(rel, e.name)) : e.name.endsWith('.js') ? [path.join(p, e.name)] : []);
}
/* Таблицы, которые код пишет: DB.x.push(, DB.x = …, DB.x[i] = …;
   счётчики …Seq на сервер не ходят. */
function writtenTables() {
  const out = new Map();
  MONEY_STOCK.flatMap(files).forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bDB\.(\w+)\s*(?:\.push\(|\.splice\(|=(?!=)|\[[^\]]+\]\s*=(?!=))/g))
      if (!/Seq$/.test(m[1])) out.set(m[1], path.relative(ROOT, f));
  });
  return out;
}

module.exports = async function ({ page, eq, ok }) {
  console.log('cloud guards');
  const twoPcs = make => pcs(page, make);

  /* ---------------- тест-сторож ---------------- */
  {
    const t = await page();
    const reg = await t.p.evaluate(() => ({ check: Object.keys(CLOUD_CHECK), fact: Object.keys(CLOUD_FACT),
      pur: [...Object.values(PUR_MONEY), ...Object.values(PUR_FULFIL)].map(c => c.key) }));
    await t.c.close();
    const known = new Set(reg.check.concat(reg.fact)), written = writtenTables();
    reg.pur.forEach(k => written.set(k, 'src/erp/purchasing (DB[c.key])'));
    const missing = [...written].filter(([tbl]) => !known.has(tbl)).map(([tbl, f]) => tbl + ' ← ' + f);
    eq('до 10: каждая таблица денег и склада в реестре сверки — сверка или факт (CLOUD_CHECK / CLOUD_FACT, erp/cloud-sync)', missing, []);
    eq('до 10: сверка и факт не пересекаются', reg.check.filter(k => reg.fact.includes(k)), []);
    const hand = files('src/erp').filter(f => /\bcloudGuard\w*\(/.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(ROOT, f));
    eq('до 10: стражей руками никто не ставит — только реестр', hand, []);
    const noScenario = reg.check.filter(k => { const c = COVERED[k]; return !c || !fs.readFileSync(path.join(__dirname, c[0]), 'utf8').includes("'" + c[1]); });
    eq('до 10: у каждой сверки — сценарий двух компьютеров', noScenario, []);
  }

  /* ---------------- кусок S-: Not found (сверки не было) ---------------- */
  const offcut = () => {
    oqReset();DB.stockOffcut = [{ id: 'S-0099002', glass: '6CLEAR', mm: 6, w: 40, h: 30, batch: '', sheet: 0, x: 0, y: 0, at: '2026-11-01T10:00:00Z', status: 'stock' }];DB.inventoryEvent = [];
    storageCommand(() => {});touch();return {};
  };
  {
    const w = await twoPcs(offcut);
    const local = [];for (const x of [w.A, w.B]) local.push(await x.p.evaluate(() => invOffcutLost(['S-0099002'], 'Not on rack').ok));
    await w.sync();
    eq('до 10: Not found одного куска S- с двух ПК — одно списание, у второго конфликт', await w.B.p.evaluate(() => ({ lost: DB.inventoryEvent.filter(e => e.offcut === 'S-0099002').length,
      status: invOffcutFind('S-0099002').status, warn: /Changed on another computer/.test(cloudSync.warn) })).then(x => Object.assign(x, { local })),
    { lost: 1, status: 'Written off', warn: true, local: [true, true] });
    await w.close();
  }
  {
    const w = await twoPcs(offcut);
    await w.A.p.evaluate(() => { DB.cutPlan.push({ batch: 'B-AUD3', sheetPick: { '6CLEAR': { sizes: [{ key: 'S-0099002', off: false }] } }, groups: [] });cutSave('B-AUD3'); });
    await w.B.p.evaluate(() => invOffcutLost(['S-0099002'], 'Not on rack').ok);
    await w.sync();
    eq('до 10: кусок S- взял раскрой на одном ПК, на другом его списали Not found — второе не записано',
      await w.B.p.evaluate(() => ({ plan: (DB.cutPlan || []).some(p => p.batch === 'B-AUD3'), lost: DB.inventoryEvent.filter(e => e.offcut === 'S-0099002').length,
        warn: /Changed on another computer/.test(cloudSync.warn) })), { plan: true, lost: 0, warn: true });
    await w.close();
  }

  /* ---------------- деньги: правила на версии самой оплаты ---------------- */
  {
    const w = await twoPcs(() => { oqReset();const c = oqCustomer();const a = oqOrder(c);salesDraftDrop();const b = oqOrder(c);salesDraftDrop();
      const due = finOrderBalance(salesRecord(a)).total;a8Pay(c.id, finToday(), due);return { cid: c.id, a, b, due }; });
    for (const [x, id] of [[w.A, w.seed.a], [w.B, w.seed.b]]) await x.p.evaluate(s => finPersist(() => finApplyDeposit(s.s.cid, s.id, s.s.due)).ok, { s: w.seed, id });
    await w.sync();
    eq('до 10: одна оплата на счёте — зачёт в два заказа с двух ПК: деньги в одном, у второго конфликт, депозит не уходит в минус',
      await w.B.p.evaluate(s => ({ paid: [s.a, s.b].map(id => finOrderPaid(id).paid).sort((x, y) => x - y), deposit: finCustomerDeposit(s.cid), warn: /Changed on another computer/.test(cloudSync.warn) }), w.seed),
      { paid: [0, w.seed.due], deposit: 0, warn: true });
    await w.close();
  }
  {
    const w = await twoPcs(() => { oqReset();const c = oqCustomer();const r = a8Pay(c.id, finToday(), 100);return { cid: c.id, rid: r.id }; });
    await w.A.p.evaluate(s => finPersist(() => finCreateRefund({ receiptId: s.rid, amount: 100, date: finToday(), method: 'cash', reason: 'Back' })).ok, w.seed);
    await w.B.p.evaluate(s => finPersist(() => finVoidReceipt(s.rid, 'Bounced')).ok, w.seed);
    await w.sync();
    eq('до 10: возврат по оплате на одном ПК и Void той же оплаты на другом — записано одно, у второго конфликт',
      await w.B.p.evaluate(s => ({ refunds: DB.refund.length, voided: DB.receipt.find(r => r.id === s.rid).voided, warn: /Changed on another computer/.test(cloudSync.warn) }), w.seed),
      { refunds: 1, voided: false, warn: true });
    await w.close();
  }
  {
    const w = await twoPcs(() => { oqReset();const c = oqCustomer();a8Pay(c.id, finToday(), 100);return {}; });
    for (const x of [w.A, w.B]) await x.p.evaluate(() => finPersist(() => finExportMark(finExportPending())).ok);
    await w.sync();
    eq('до 10: выгрузка в QuickBooks тех же оплат с двух ПК — одна пачка, у второго конфликт',
      await w.B.p.evaluate(() => ({ batches: DB.financeExportBatch.length, pending: finExportPending().length, warn: /Changed on another computer/.test(cloudSync.warn) })),
      { batches: 1, pending: 0, warn: true });
    await w.close();
  }

  /* ---------------- батч: одно стекло в два батча ---------------- */
  {
    const w = await twoPcs(() => { oqReset();const id = oqOrder(oqCustomer());salesDraftDrop();salesSetRecordStatus(id, 'verified');return { oid: id }; });
    for (const x of [w.A, w.B]) await x.p.evaluate(s => !!glassBatchAssign(glassBatchRows([salesRecord(s.oid)]), {}), w.seed);
    await w.sync();
    eq('до 10: одни стёкла в батч с двух ПК — каждое стекло в одном батче, у второго конфликт',
      await w.B.p.evaluate(s => { const pieces = DB.glassBatch.flatMap(b => b.items.filter(i => !i.releasedAt).map(i => i.piece));
        return { twice: pieces.length - new Set(pieces).size, batched: pieces.length > 0, warn: /Changed on another computer/.test(cloudSync.warn) }; }, w.seed),
      { twice: 0, batched: true, warn: true });
    await w.close();
  }
};
