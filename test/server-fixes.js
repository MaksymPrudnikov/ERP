/* Сервер, номера, архив (аудит 24.11.2026, PR 3): сценарии нескольких ПК
   против настоящего schema.sql на PGlite. Имена — номера аудита. SQL-only
   проверки (В4, С4, С5, Н6) — в tools/supabase/check.sql. */
const { twoPcs } = require('./two-pcs');
const { shopPcs } = require('./shop-pcs');

module.exports = async function ({ page, eq, ok }) {
  console.log('server fixes');

  /* Т3: Void оплаты на ПК A, пока B отправил её заказ в архив. */
  {
    const w = await twoPcs(page, () => {
      const c = a8Cust('C-T3'); a8Order('SO-T3A', c.id, '99501'); a8Order('SO-T3B', c.id, '99502', '2026-11-20', 'ready');
      const r = a8Pay(c.id, '2026-08-02', 200, [{ orderId: 'SO-T3A', amount: 100 }, { orderId: 'SO-T3B', amount: 100 }]);
      return { r: r.id };
    });
    const archived = await w.B.p.evaluate(async () => { archiveRun('2026-11-24'); await storageFlush(); await cloudPushAll(); return !!archiveKnown('SO-T3A') && !salesRecord('SO-T3A'); });
    const voided = await w.A.p.evaluate(id => finPersist(() => finVoidReceipt(id, 'Bounced')).ok, w.seed.r);
    await w.sync();
    const srvVoid = JSON.parse((await w.srv.row('receipt', w.seed.r)).data).voided;
    eq('Т3: Void оплаты, пока её заказ ушёл в архив на другом ПК, — конфликт: на сервере оплата цела, предупреждение «ушёл в архив» (Т5)', { archived, voided, srvVoid, warn: await w.A.p.evaluate(() => /Went to the archive on another computer: 99501/.test(cloudSync.warn)) }, { archived: true, voided: true, srvVoid: false, warn: true });
    await w.close();
  }

  /* Т2: Shipped сверяет сканы погрузки своих стёкол. */
  {
    const t = await page();
    eq('Т2: PS planned → shipped сверяет активные сканы погрузки своих стёкол', await t.p.evaluate(() => {
      const ship = shippingStations().ship;
      DB.stationScan.push({ id: 'SC-9000001', station: ship, piece: 'G-0000901', at: '2026-11-24T10:00:00Z' }, { id: 'SC-9000002', station: ship, piece: 'G-0000999', at: '2026-11-24T10:00:00Z' }, { id: 'SC-9000003', station: ship, piece: 'G-0000902', at: '2026-11-24T10:00:00Z', undoneAt: '2026-11-24T10:01:00Z' });
      const unit = { label: 'U-1', orderId: 'SO-X', lineId: 'L1', pieces: ['G-0000901', 'G-0000902'] };
      const keys = CLOUD_CHECK.shipment({ status: 'shipped', items: [unit] }, { status: 'planned', items: [unit] }).filter(k => k[0] === 'stationScan').map(k => k[1]);
      const again = CLOUD_CHECK.shipment({ status: 'shipped', items: [unit] }, { status: 'shipped', items: [unit] }).filter(k => k[0] === 'stationScan').length;
      DB.stationScan = DB.stationScan.filter(s => !/^SC-900000/.test(s.id));
      return { keys, again };
    }), { keys: ['SC-9000001'], again: 0 });
    await t.c.close();
  }

  /* В1, С3: два ПК без связи завели клиента и оплату — коды и номера
     одинаковые. Номер оплаты до сервера — DRAFT; сервер дал второму
     следующий — второй видит «Number changed». */
  {
    const w = await twoPcs(page, () => ({}));
    const mk = p => p.evaluate(async tag => {
      const c = normalizeCustomer({ id: 'CUS-B1' + tag, code: nextCustomerCode(), legalName: 'Offline ' + tag, paymentMode: 'credit', creditDays: 30 });
      storageCommand(() => { DB.customer.push(c); });
      const r = a8Pay(c.id, '2026-11-24', 10, []); await storageFlush();
      const pages = docDraftMark(finReceiptDoc(r.id), 'receipt', r.id);
      return { id: c.id, code: c.code, r: r.id, num: r.number, pending: cloudNumberPending('receipt', r.id), draft: pages.length > 0 && pages.every(pg => pg.items.some(x => x.s === 'DRAFT')) };
    }, 'A');
    const a = await mk(w.A.p), b = await w.B.p.evaluate(async () => {
      const c = normalizeCustomer({ id: 'CUS-B1B', code: nextCustomerCode(), legalName: 'Offline B', paymentMode: 'credit', creditDays: 30 });
      storageCommand(() => { DB.customer.push(c); });
      const r = a8Pay(c.id, '2026-11-24', 10, []); await storageFlush();
      return { code: c.code, r: r.id, num: r.number };
    });
    eq('В1, С3: без связи — одинаковые код клиента и номер оплаты; номер ждёт сервера — печать DRAFT', { same: a.code === b.code && a.num === b.num, pending: a.pending, draft: a.draft }, { same: true, pending: true, draft: true });
    await w.sync(); await w.sync();
    const after = await w.B.p.evaluate(x => {
      const c = DB.customer.find(y => y.id === 'CUS-B1B'), r = DB.receipt.find(y => y.id === x.r);
      const pages = docDraftMark(finReceiptDoc(x.r), 'receipt', x.r);
      return { code: c && c.code, num: r && r.number, pending: cloudNumberPending('receipt', x.r), draft: pages.some(pg => pg.items.some(i => i.s === 'DRAFT')), warn: cloudSync.warn };
    }, b);
    eq('В1, С3: сервер дал второму ПК следующий код и номер, DRAFT снят, «Number changed» видно', {
      code: after.code !== a.code && /^C-\d{5}$/.test(after.code), num: after.num !== a.num, pending: after.pending, draft: after.draft,
      warn: after.warn.includes('Number changed:') && after.warn.includes(a.num + ' → ' + after.num) && after.warn.includes(a.code + ' → ' + after.code)
    }, { code: true, num: true, pending: false, draft: false, warn: true });
    eq('В1: дубль кода в Download/Import не ломает загрузку — у второго созданного «-2»', await w.A.p.evaluate(() => {
      const keep = DB.customer, src = [{ id: 'X1', code: 'C-00001', legalName: 'Late', createdAt: '2026-01-02' }, { id: 'X2', code: 'c-00001', legalName: 'Early', createdAt: '2026-01-01' }];
      let err = ''; try { validateCustomersPayload({ customer: src }); } catch (e) { err = e.message; }
      DB.customer = src; normalizeCustomers(); const out = DB.customer.map(c => c.id + ':' + c.code); DB.customer = keep;
      return { err, out };
    }), { err: '', out: ['X1:C-00001-2', 'X2:c-00001'] });
    await w.close();
  }

  /* В3: участнику дали раздел — старые строки этого раздела приходят. */
  {
    const w = await shopPcs(page, 2, () => ({}));
    const [A, B] = w.pcs, OFFICE = '00000000-0000-0000-0000-0000000000b3';
    await w.srv.member(OFFICE, 'office-b3@glass-erp.test', ['production']);
    B.user = OFFICE;
    await B.p.evaluate(() => { cloudSync.rightsAt = 0; }); await w.tick(B);
    await w.srv.rpc('erp_apply', { command_id: 'b3-pay', build: 'x', device: 'seed', expect: [], changes: [{ tbl: 'receipt', id: 'RCPT-B3', seq: 0, data: JSON.stringify({ id: 'RCPT-B3', number: 'R-0901', customerId: 'C-1', amount: 5, allocations: [] }) }] });
    await w.tick(B);
    const before = await B.p.evaluate(() => (DB.receipt || []).some(r => r.id === 'RCPT-B3'));
    await w.srv.member(OFFICE, 'office-b3@glass-erp.test', ['production', 'finance']);
    await B.p.evaluate(() => { cloudSync.rightsAt = 0; }); await w.tick(B);
    const after = await B.p.evaluate(() => (DB.receipt || []).some(r => r.id === 'RCPT-B3'));
    eq('В3: без Finance оплаты не приходят; дали Finance — старая оплата пришла', { before, after }, { before: false, after: true });
    /* Н3: права сузили — оплаты уходят с ПК (и из Export), на сервере целы. */
    await w.srv.member(OFFICE, 'office-b3@glass-erp.test', ['production']);
    await B.p.evaluate(() => { cloudSync.rightsAt = 0; }); await w.tick(B);
    const cut = await B.p.evaluate(async () => { await storageFlush(); return { local: (DB.receipt || []).some(r => r.id === 'RCPT-B3'), export: JSON.stringify(storageExportEnvelope()).includes('RCPT-B3'), out: cloudSync.out.length }; });
    eq('Н3: сняли Finance — оплата ушла с ПК и из Export, на сервер ничего не ушло, там она цела', Object.assign(cut, { server: !!(await w.srv.row('receipt', 'RCPT-B3')) }), { local: false, export: false, out: 0, server: true });
    await w.close();
  }
};
