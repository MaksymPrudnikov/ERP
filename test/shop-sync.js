/* Цех на нескольких компьютерах (аудит 24.11.2026, PR 1 «цех»): скан не
   теряется, правки не теряются в очереди, станция видит связь. Каждый
   сценарий — ошибка аудита, повторённая настоящим путём синхронизации
   (test/shop-pcs.js: склад cloud, cloudSyncTick, F5) против настоящего SQL
   сервера на PGlite. Имена — номера аудита (К1, В2, А1…). */
const { shopPcs } = require('./shop-pcs');

/* База: клиент и заказ в батче — 6 стёкол на станциях. */
const make = () => {
  oqReset(); const c = oqCustomer(); const id = oqOrder(c); salesDraftDrop(); oqThrough(id, 'batched');
  return { id, pieces: shopPieces().filter(x => x.o === id).map(x => x.k) };
};
const scans = x => x.p.evaluate(() => (DB.stationScan || []).filter(s => !s.undoneAt).map(s => s.piece).sort());
const live = async (srv, pieces) => {
  const out = [];
  for (const id of await srv.ids('stationScan')) { const r = await srv.row('stationScan', id); const s = r && JSON.parse(r.data); if (s && !s.undoneAt) out.push(s.piece); }
  return out.filter(p => !pieces || pieces.includes(p)).sort();
};
const save = (x, id, notes) => x.p.evaluate(([id, notes]) => { tab = 'sales'; salesOrderEdit(id); soDraft.notes = notes; const ok = salesOrderSave(); salesDraftDrop(); return ok; }, [id, notes]);

module.exports = async function ({ page, eq, ok }) {
  console.log('shop sync');
  const run = async (n, fn) => { const w = await shopPcs(page, n, make); try { await fn(w); } finally { await w.close(); } };

  /* К1: офис сохранил заказ, пока станция сканировала его стекло. */
  await run(2, async ({ pcs: [A, B], seed, srv, tick, quiet }) => {
    eq('К1: скан станции записан', (await B.p.evaluate(p => shopScan(p, 'Op B'), seed.pieces[0])).ok, true);
    eq('К1: офис сохранил тот же заказ', await save(A, seed.id, 'office note'), true);
    await tick(A); await tick(B); await quiet();
    eq('К1: скан не пропал после Save офиса — на сервере', await live(srv), [seed.pieces[0]]);
    eq('К1: … и на обоих компьютерах', [await scans(A), await scans(B)], [[seed.pieces[0]], [seed.pieces[0]]]);
    eq('К1: заметка офиса тоже на месте', JSON.parse((await srv.row('salesOrder', seed.id)).data).notes, 'office note');
    eq('К1: о скане, который удалось повторить, не предупреждают', await B.p.evaluate(() => cloudSync.warn), '');
  });

  /* К1: две станции сканируют разные стёкла одного батча в ту же минуту. */
  await run(3, async ({ pcs: [A, B, C], seed, srv, tick, quiet }) => {
    eq('К1: две станции — оба скана записаны', [(await B.p.evaluate(p => shopScan(p, 'Op B'), seed.pieces[0])).ok, (await C.p.evaluate(p => shopScan(p, 'Op C'), seed.pieces[1])).ok], [true, true]);
    await tick(B); await tick(C); await quiet();
    const want = [seed.pieces[0], seed.pieces[1]].sort();
    eq('К1: две станции на одном батче — оба скана на сервере', await live(srv), want);
    eq('К1: … и на всех компьютерах', [await scans(A), await scans(B), await scans(C)], [want, want, want]);
  });

  /* К1: станция без связи сделала 3 скана, офис тем временем сохранил заказ. */
  await run(3, async ({ pcs: [A, , C], seed, srv, tick, quiet }) => {
    C.offline = true;
    for (const p of seed.pieces.slice(0, 3)) await C.p.evaluate(p => shopScan(p, 'Op C'), p);
    eq('К1: офис сохранил заказ, пока станция без связи', await save(A, seed.id, 'office while offline'), true);
    await tick(A); await tick(C);
    C.offline = false; await quiet();
    eq('К1: все 3 скана без связи дошли до сервера', await live(srv), seed.pieces.slice(0, 3).sort());
  });

  /* В2: без входа на сервер после F5 правки не вставали в очередь. */
  await run(2, async ({ pcs: [, B], seed, srv, f5, quiet }) => {
    await B.p.evaluate(() => shopSession(false)); await f5(B);
    eq('В2: скан без входа записан', (await B.p.evaluate(p => shopScan(p, 'Op B'), seed.pieces[0])).ok, true);
    eq('В2: без входа очередь видна — 1 waiting', await B.p.evaluate(() => cloudSyncText()), 'Sign in to sync · 1 waiting');
    await f5(B);
    await B.p.evaluate(() => { shopSession(true); cloudSync.loaded = false; }); await quiet();
    eq('В2: после входа скан без входа ушёл на сервер (и пережил F5)', await live(srv), [seed.pieces[0]]);
  });

  /* А3: правка после F5 до первого такта синхронизации — второй F5 её терял. */
  await run(2, async ({ pcs: [, B], seed, srv, f5, quiet }) => {
    await f5(B);
    await B.p.evaluate(p => shopScan(p, 'Op B'), seed.pieces[0]);
    await B.p.evaluate(() => storageFlush()); await f5(B); await quiet();
    eq('А3: скан до первого такта пережил второй F5 и ушёл на сервер', await live(srv), [seed.pieces[0]]);
  });

  /* А1: после F5 новой сборки компьютер отправлял чужие сканы — Undo станции отклонялся. */
  await run(3, async ({ pcs: [, B, C], seed, srv, tick, f5, quiet }) => {
    const r = await B.p.evaluate(p => shopScan(p, 'Op B'), seed.pieces[0]);
    await quiet();
    await C.p.evaluate(() => storageIdbMetaPut('build', 'old-build')); await f5(C);
    eq('А1: F5 новой сборки не делает чужие сканы изменёнными', await C.p.evaluate(() => storageDiff(DB).filter(c => c.tbl === 'stationScan').length), 0);
    await tick(C);
    eq('А1: Undo станции записан', !!(await B.p.evaluate(id => stationUndo(id, { name: 'Op B' }), r.id)).ok, true);
    await tick(B); await quiet();
    eq('А1: Undo станции дошёл до сервера', await live(srv), []);
    eq('А1: … и на компьютере, сделавшем F5', await scans(C), []);
  });

  /* А2: сразу после входа номер скана брался из своего счётчика и совпадал с номером из блока. */
  await run(2, async ({ pcs: [, B], seed, srv, tick, quiet }) => {
    const ids = [];
    ids.push((await B.p.evaluate(p => shopScan(p, 'Op B'), seed.pieces[0])).id); await tick(B);
    await B.p.evaluate(() => { shopSession(false); shopSession(true); cloudSync.loaded = false; });
    ids.push((await B.p.evaluate(p => shopScan(p, 'Op B'), seed.pieces[1])).id); await tick(B);
    ids.push((await B.p.evaluate(p => shopScan(p, 'Op B'), seed.pieces[2])).id); await quiet();
    eq('А2: номера сканов после входа не повторяются', new Set(ids).size, 3);
    eq('А2: журнал сканов на сервере — строками, а не одной записью «*»', (await srv.ids('stationScan')).includes('*'), false);
    eq('А2: все 3 скана на сервере', await live(srv), seed.pieces.slice(0, 3).sort());
  });

  /* Т1: порядок сканов для Undo — по маршруту, а не по номеру из блока своего компьютера. */
  await run(3, async ({ pcs: [, B, C], seed, tick, quiet }) => {
    const p = seed.pieces[0];
    const first = await C.p.evaluate(p => shopScan(p, 'Op C'), p); await tick(C); await tick(B);
    const second = await B.p.evaluate(p => shopScan(p, 'Op B'), p); await tick(B); await quiet();
    ok('Т1: номер второго скана меньше первого (блоки разных ПК)', +second.id.slice(3) < +first.id.slice(3), [first.id, second.id]);
    eq('Т1: отменить первый скан, когда стекло прошло дальше, нельзя', (await C.p.evaluate(id => stationUndo(id, { name: 'Op C' }), first.id)).error, 'Glass has moved on — undo the later scan first.');
    eq('Т1: последний скан отменяется', !!(await B.p.evaluate(id => stationUndo(id, { name: 'Op B' }), second.id)).ok, true);
  });

  /* С2: команда, которую сервер раз за разом не принимает, не держит очередь. */
  await run(2, async ({ pcs: [, B], seed, srv, tick, quiet }) => {
    await B.p.evaluate(p => shopScan(p, 'Op B'), seed.pieces[0]);
    await B.p.evaluate(p => shopScan(p, 'Op B'), seed.pieces[1]);
    let bad = 0; const first = await B.p.evaluate(() => cloudSync.out[0].id);
    B.err = (fn, a) => fn === 'erp_apply' && a.command_id === first && ++bad ? 'canceling statement due to statement timeout' : '';
    for (let i = 0; i < 4; i++) await tick(B);
    eq('С2: очередь не стоит за командой, которую сервер не принимает', (await live(srv)).includes(seed.pieces[1]), true);
    eq('С2: очередь пуста', await B.p.evaluate(() => cloudSync.out.length), 0);
    B.err = null;
  });

  /* А4: отклонено несколько команд — предупреждение называет все, а не последнюю. */
  await run(2, async ({ pcs: [A, B], srv, tick }) => {
    const ids = await A.p.evaluate(() => { const c = DB.customer[0]; const a = oqOrder(c); salesDraftDrop(); const b = oqOrder(c); salesDraftDrop(); return [a, b]; });
    await tick(A); await tick(B);
    const nums = await A.p.evaluate(ids => ids.map(id => salesRecord(id).businessNumber), ids);
    for (const id of ids) await save(A, id, 'A');
    for (const id of ids) await save(B, id, 'B');
    await tick(A); await tick(B);
    const w = await B.p.evaluate(() => cloudSync.warn);
    eq('А4: предупреждение называет оба отклонённых заказа', nums.every(n => w.includes(n)), true);
  });

  /* С1: зависший запрос к серверу кончается сам — синхронизация не встаёт до F5. */
  {
    const { p, c } = await page();
    const r = await p.evaluate(async () => {
      cloudConfigSave({ url: 'https://audit.invalid', key: 'k' });
      window.fetch = () => new Promise(() => {}); CLOUD_FETCH_MS = 200;
      const t = Date.now(); let e = '';
      try { await cloudFetch('/rest/v1/rpc/erp_whoami', {}); } catch (x) { e = x.message; }
      return { e, fast: Date.now() - t < 3000 };
    });
    eq('С1: зависший запрос кончается сам — «No connection»', r, { e: 'No connection to the server.', fast: true });
    await c.close();
  }

  /* А5: Convert квоты сразу выдаёт номера стёкол заказа. */
  {
    const { p, c } = await page();
    await require('./optimization-fixture')(p);
    const r = await p.evaluate(() => {
      oqReset(); const cu = oqCustomer(); const q = oqOrder(cu, { kind: 'quote' }); salesDraftDrop();
      salesConvertQuoteRecord(q, 'PO-A5'); const o = DB.salesOrder.find(x => x.fromQuoteId === q); salesDraftDrop();
      const mine = DB.glassPiece.filter(r => r.key.startsWith(o.id + '|'));
      const saved = storageBase.get('glassPiece');
      return { n: mine.reduce((n, r) => n + r.ids.filter(Boolean).length, 0), saved: mine.every(r => saved && saved.has(r.key)) };
    });
    eq('А5: Convert выдал номера всем стёклам и записал их', r, { n: 6, saved: true });
    await c.close();
  }

  /* К2: станция видит связь с сервером и сканы, которые не удалось записать. */
  await run(2, async ({ pcs: [, B], seed, tick }) => {
    await B.p.evaluate(() => { stationCode = 'CUT'; tab = 'station'; DB.user = DB.user.filter(u => u.name !== 'Op'); DB.user.push({ name: 'Op', role: 'Shop', station: 'CUT', skills: [], pin: '0000' }); normalizeUsers(); stationLogin(DB.user[DB.user.length - 1].viewProfileId); render(); });
    const chip = () => B.p.evaluate(() => { const el = document.querySelector('[data-station-sync]'); return el ? el.textContent.trim() : null; });
    await tick(B);
    eq('К2: на станции виден статус сервера', await chip(), 'Synced');
    B.offline = true; await B.p.evaluate(p => shopScan(p, 'Op'), seed.pieces[0]); await tick(B);
    eq('К2: без связи станция пишет «Offline» и сколько ждёт', await chip(), 'Offline · 1');
    B.offline = false; await tick(B);
    eq('К2: связь вернулась — снова Synced', await chip(), 'Synced');
    await B.p.evaluate(() => { cloudSync.scanFail = [{ piece: 'G-0000001', station: 'CUT', at: new Date().toISOString(), why: 'Glass has moved on' }]; afterRender(); });
    const bar = await B.p.evaluate(() => { const el = document.getElementById('storageAlert'); return el && !el.hidden ? el.textContent : ''; });
    ok('К2: скан, который не удалось записать, — красная полоса с номером стекла', /G-0000001/.test(bar) && /Scan again/i.test(bar), bar);
  });
};
