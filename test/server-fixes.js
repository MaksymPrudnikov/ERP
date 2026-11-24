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
    eq('Т3: Void оплаты, пока её заказ ушёл в архив на другом ПК, — конфликт: на сервере оплата цела', { archived, voided, srvVoid, warn: await w.A.p.evaluate(() => /Changed on another computer/.test(cloudSync.warn)) }, { archived: true, voided: true, srvVoid: false, warn: true });
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
    await w.close();
  }
};
