/* Несколько компьютеров цеха против настоящего SQL сервера (PGlite) —
   настоящим путём синхронизации: склад cloud в базе браузера, cloudSyncTick
   (cloudLoad, сверка базы, отправка, опрос, блоки номеров), F5 и вход.
   test/two-pcs.js ставит состояние синхронизации в память — F5 его теряет;
   здесь оно записано, как после Upload (аудит 24.11.2026, PR 1 «цех»).
   shopPcs(page, n, make) → {pcs, seed, srv, tick(x), f5(x), close}:
   pcs[0] делает базу (make), остальные получают её копией; у каждого свой
   выключатель связи x.offline. В странице: shopScan(piece, who) — скан на
   следующей станции стекла, shopPieces() — стёкла по заказам. */
const server = require('./cloud-server');
const fixture = require('./optimization-fixture');
const { helpers } = require('./two-pcs');
const URL_ = 'https://audit.invalid';

async function install(x) {
  await fixture(x.p); await helpers(x.p);
  await x.p.evaluate(() => {
    cloudRpc = (n, a) => window.a8rpc(n, a);
    window.shopScan = (piece, who) => {
      const g = stationGlass(piece), pl = g && stationPlace(g);
      if (!pl || !pl.waiting) return { err: 'no place' };
      const c = stationCheck(pl.waiting, piece);
      if (!c || c.kind !== 'ok') return { err: 'check ' + (c && c.kind) };
      const r = stationMove(pl.waiting, c, { name: who || 'Op' }, {});
      return r.ok ? { ok: true, station: pl.waiting, id: r.value.rec.id } : { err: r.error };
    };
    window.shopPieces = () => [...stationPieceIndex()].map(([k, h]) => ({ k, o: h.orderId }));
    window.shopSession = on => { const c = cloudConfig(); if (on) c.session = { access: 'x', refresh: 'y', exp: Date.now() + 864e5, email: 'admin@glass-erp.test' }; else delete c.session; cloudConfigSave(c); };
  });
}

async function shopPcs(page, n, make) {
  const open = async () => {
    const x = await page();
    await x.c.addInitScript(() => { window.GF_CLOUD_MANUAL = true; });
    x.offline = false;
    return x;
  };
  const A = await open();
  await A.p.reload(); await A.p.evaluate(() => storageReady);
  await install(A);
  const seed = await A.p.evaluate(make);
  await A.p.evaluate(() => storageFlush());
  const records = await A.p.evaluate(() => [...storageBase].flatMap(([tbl, m]) => [...m].map(([id, r]) => ({ tbl, id, data: r.t, seq: r.s || 0 }))));
  const state = await A.p.evaluate(() => JSON.stringify(DB));
  const srv = await server(records);
  const build = await A.p.evaluate(() => storageBuildId());
  await srv.rpc('erp_apply', { command_id: 'up-mark', build, device: 'seed', expect: [], changes: [{ tbl: '_upload', id: 'state', seq: 0, data: JSON.stringify({ id: 'M1', device: 'seed', done: true }) }] });
  const keys = records.map(r => r.tbl + '\u0000' + r.id);
  const pcs = [A];
  for (let i = 1; i < n; i++) {
    const x = await open();
    await x.p.reload(); await x.p.evaluate(() => storageReady);
    await x.p.evaluate(async s => { await storageSeed(JSON.parse(s)); }, state);
    pcs.push(x);
  }
  for (const [i, x] of pcs.entries()) {
    x.name = 'ABCDEFGH'[i];
    await x.p.exposeFunction('a8rpc', (fn, a) => {
      if (x.offline) return Promise.reject(new Error('No connection to the server.'));
      if (x.hang && x.hang(fn, a)) return new Promise(() => {});
      const bad = x.err && x.err(fn, a);
      if (bad) return Promise.reject(new Error(bad));
      return srv.rpc(fn, a, x.user);
    });
    await x.p.evaluate(async ({ keys, url, i }) => {
      cloudConfigSave({ url, key: 'k', device: 'dev-' + i, session: { access: 'x', refresh: 'y', exp: Date.now() + 864e5, email: 'admin@glass-erp.test' } });
      await cloudSaveAll(url, 0, new Map(keys.map(k => [k, 1])), 'M1');
    }, { keys, url: URL_, i });
  }
  const f5 = async x => { await x.p.reload(); await x.p.evaluate(() => storageReady); await install(x); };
  for (const x of pcs) { await f5(x); await x.p.evaluate(() => cloudSyncTick()); }
  const tick = async x => { await x.p.evaluate(() => cloudSyncTick()); await x.p.evaluate(() => storageFlush()); };
  const quiet = async () => { for (let r = 0; r < 3; r++) for (const x of pcs) if (!x.offline) await tick(x); };
  return { pcs, seed, srv, tick, f5, quiet, close: async () => { for (const x of pcs) await x.c.close(); await srv.close(); } };
}
module.exports = { shopPcs };
