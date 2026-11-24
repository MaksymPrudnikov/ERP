/* Офис (аудит 24.11.2026, PR 2 «офис»): ошибки, найденные проходом офиса
   кликами и клавиатурой. Имена — номера аудита (О1…О9, Т4). */
const fixture = require('./optimization-fixture');

module.exports = async function ({ page, eq, ok }) {
  console.log('office fixes');
  const t = await page();
  await fixture(t.p);
  const p = t.p;

  /* О1: Display Name нового клиента — первая буква Legal Name. */
  await p.evaluate(() => { tab = 'customers'; customerNew(); render(); });
  await p.locator('input[data-on-input="custSetLegal"]').type('Northwind Test Glass Ltd');
  eq('О1: Display Name идёт за Legal Name, а не первая буква', await p.evaluate(() => cDraft.displayName), 'Northwind Test Glass Ltd');
  await p.locator('input[data-on-input="custSet"][data-args-input*=\'"displayName"\']').fill('Northwind');
  await p.locator('input[data-on-input="custSetLegal"]').click(); await p.keyboard.press('End'); await p.keyboard.type(' Inc');
  eq('О1: Display Name, который человек поменял, остаётся его', await p.evaluate(() => [cDraft.legalName, cDraft.displayName]), ['Northwind Test Glass Ltd Inc', 'Northwind']);
  await p.evaluate(() => { cEdit = null; cDraft = null; tab = 'dashboard'; render(); });

  /* О2: двойной Save нового заказа открывал Copy; тот же PO — вопрос. */
  {
    const r = await p.evaluate(() => {
      oqReset(); const c = oqCustomer(); const first = oqOrder(c); salesDraftDrop(true);
      const po = salesRecord(first).customerPo;
      tab = 'sales'; salesOrderNew('order'); salesApplyCustomerDefaults(c.id); soDraft.customerPo = po;
      soDraft.lines = JSON.parse(JSON.stringify(salesRecord(first).lines)).map(l => Object.assign(l, { id: salesUid('L') }));
      const asked = []; const keep = window.confirm; window.confirm = m => { asked.push(m); return false; };
      const saved = salesOrderSave(); window.confirm = keep;
      const n = DB.salesOrder.length;
      return { asked: asked.length === 1 && /already on order/.test(asked[0]), saved, n };
    });
    eq('О2: тот же PO у того же клиента — вопрос, «нет» — заказ не записан', r, { asked: true, saved: false, n: 1 });
    const r2 = await p.evaluate(() => {
      const keep = window.confirm; window.confirm = () => true;
      const saved = salesOrderSave(); window.confirm = keep;
      render(); document.querySelector('[data-copy-order]').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      const copy = soEdit === 'new';
      salesDraftDrop(true);
      return { saved, copy, n: DB.salesOrder.length };
    });
    eq('О2: Copy сразу после Save (второй клик двойного) не открывает копию', r2, { saved: true, copy: false, n: 2 });
  }

  /* О8, О9: жёсткие пределы строки. */
  eq('О8, О9: больше 10 000 в строке и больше 999″ — отказ с причиной', await p.evaluate(() => {
    const id = DB.salesOrder[0].id, out = {};
    const tryLine = patch => { tab = 'sales'; salesOrderEdit(id); Object.assign(soDraft.lines[0], patch); const keep = window.confirm; window.confirm = () => true; const okSave = salesOrderSave(); window.confirm = keep; const e = document.getElementById('e_sales_order'); const msg = okSave ? 'saved' : e && e.textContent; salesDraftDrop(true); return msg; };
    out.qty = tryLine({ qty: 99999999 });
    out.dim = tryLine({ width16: 999999 * 16 });
    out.okQty = tryLine({ qty: 10000 });
    return out;
  }), { qty: 'Line 1: up to 10,000 units.', dim: 'Line 1: width and height up to 999″.', okQty: 'saved' });

  /* О3: сумма с запятой — в 100 раз больше. */
  eq('О3: разбор суммы — US и десятичная запятая, неоднозначное — отказ', await p.evaluate(() =>
    ['592,40', '1,234.50', '1.234,50', '4,07', '1,234', '1,2,3', '12,345.678', '$1 200', '99.999'].map(finMoneyIn)),
    [592.4, 1234.5, 1234.5, 4.07, 1234, null, null, 1200, 99.999]);
  {
    const cid = await p.evaluate(() => { tab = 'finance'; const c = DB.customer[0]; finNewReceipt(c.id); render(); return c.id; });
    await p.locator('#finAmount').fill('592,40');
    const r = await p.evaluate(() => { finSaveReceipt(); const rc = DB.receipt.filter(x => !x.voided).slice(-1)[0]; return rc && rc.amount; });
    eq('О3: квитанция 592,40 записана как $592.40', r, 592.4);
    await p.evaluate(id => { finNewReceipt(id); render(); }, cid);
    await p.locator('#finAmount').fill('1,2,3');
    const bad = await p.evaluate(() => { const n = DB.receipt.length; finSaveReceipt(); const e = document.getElementById('e_fin'); const r = { n: DB.receipt.length - n, err: e && e.style.display !== 'none' && e.textContent }; finDraft = null; finEdit = null; render(); return r; });
    eq('О3: «1,2,3» — не записано, причина видна', bad, { n: 0, err: 'Enter a positive amount with a maximum of 10 billion.' });
  }

  /* О4: поле Apply now перекрывала ячейка Balance — клик мышью не попадал. */
  eq('О4: клик в середину поля Apply now попадает в поле', await p.evaluate(() => {
    oqReset(); const cu = oqCustomer(); const id = oqOrder(cu); salesDraftDrop(true); oqThrough(id, 'verified');
    tab = 'finance'; finNewReceipt(cu.id); render();
    const el = document.querySelector('[data-fin-apply]'); if (!el) return 'no field';
    const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    finDraft = null; finEdit = null; render(); return hit === el;
  }), true);

  /* О6: отказ проверки — не «Not saved». */
  eq('О6: после отказа проверки в подвале нет «Not saved» и полосы', await p.evaluate(() => {
    const out = storageCommand(() => { throw new Error('Allocation exceeds the order balance.'); });
    render();
    const bar = document.getElementById('storageAlert');
    return { failed: !out.ok, error: out.error, last: storageLastError, bar: !!bar && !bar.hidden, foot: /Not saved/.test(document.getElementById('storageStatus').textContent) };
  }), { failed: true, error: 'Allocation exceeds the order balance.', last: '', bar: false, foot: false });

  /* О7: приёмка с боем больше, чем пришло. */
  eq('О7: боя больше, чем пришло, — отказ; половина — можно', await p.evaluate(() => {
    const sup = purSupplierSave({ name: 'Broken Glass Co' }).value;
    const rec = (sheets, broken) => { const r = purFulfilSave('receipt', { supplierId: sup.id, date: '2026-11-24', lines: [{ id: 'L0', kind: 'glass', productId: glassProductByCode('6CLEAR').id, unit: 'sheet', qty: sheets, damaged: broken, widthIn: 130, heightIn: 96 }] }); return r.ok ? 'ok' : r.error; };
    return { over: rec(40, 50), half: rec(40, 30) };
  }), { over: 'Line 1: broken is more than received.', half: 'ok' });

  /* Т4: первый клик по Create packing slip после ввода количества терялся. */
  {
    const id = await p.evaluate(() => { oqReset(); const c = oqCustomer(); const id = oqOrder(c); salesDraftDrop(true); oqThrough(id, 'ready'); return id; });
    const ready = await p.evaluate(id => { tab = 'shipping'; shippingTab = 'shipments'; const o = salesRecord(id); shippingOpen(o.customerId); render(); return !!shippingDraft; }, id);
    if (ready) {
      const input = p.locator('[data-ps-qty]').first();
      await input.fill('1');
      const before = await p.evaluate(() => (DB.shipment || []).length);
      await p.locator('[data-save-ps]').click();
      eq('Т4: ввели количество и сразу Create packing slip — PS создан первым кликом', await p.evaluate(n => (DB.shipment || []).length - n, before), 1);
    } else ok('Т4: окно packing slip открылось', false);
  }

  eq('офис: без ошибок страницы', t.errs, []);
  await t.c.close();

  /* О5: две вкладки — первый Update в невладеющей вкладке записывает. */
  {
    const a = await page(); await fixture(a.p);
    const id = await a.p.evaluate(() => { oqReset(); const c = oqCustomer(); const id = oqOrder(c); salesDraftDrop(true); return id; });
    await a.p.evaluate(() => storageFlush());
    const b = await a.c.newPage(); await b.goto(a.p.url()); await b.evaluate(() => window.storageReady);
    await b.waitForFunction(() => storageWriter, null, { timeout: 5000 }).catch(() => {});
    await a.p.waitForFunction(() => !storageWriter, null, { timeout: 5000 }).catch(() => {});
    await a.p.evaluate(id => { tab = 'sales'; salesOrderEdit(id); soDraft.notes = 'two tabs'; render(); }, id);
    await a.p.locator('[data-order-save]').click();
    await a.p.waitForFunction(id => { const o = salesRecord(id); return o && o.notes === 'two tabs'; }, id, { timeout: 8000 }).catch(() => {});
    eq('О5: Update во второй вкладке записан с первого клика', await a.p.evaluate(id => [salesRecord(id).notes, salesSaveState(soDraft).dirty], id), ['two tabs', false]);
    await a.c.close();
  }
};
