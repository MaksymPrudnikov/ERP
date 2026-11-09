/* Сервер для тестов двух компьютеров — настоящий SQL сервера
   (tools/supabase/schema.sql) на PGlite, а не его модель на JS (план «до
   10», этап 2, 09.11.2026): ошибка в erp_apply ловится тестом сценария.
   server(records) — база со строками records (ver 1, как после Upload),
   один вход администратора. s.rpc(name, args) — как PostgREST: вызов
   функции public.<name> с именованными аргументами, ответ — её JSON.
   s.calls — что пришло в erp_apply (staged, таблицы expect, конфликты);
   s.fail(name, args) — обрыв связи; s.row(tbl, id) — строка на сервере. */
const { pgliteServer } = require('../tools/supabase/pglite');

const ADMIN = '00000000-0000-0000-0000-0000000000a1';
const RPC = new Set(['erp_apply', 'erp_get', 'erp_changes', 'erp_take', 'erp_whoami', 'erp_cold_of', 'erp_cold']);

async function server(records) {
  const db = await pgliteServer();
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@glass-erp.test')`, [ADMIN]);
  await db.query(`insert into public.erp_member (user_id, name, admin) values ($1, 'Admin', true) on conflict (user_id) do nothing`, [ADMIN]);
  if (records.length) {
    await db.query(`insert into public.erp_record (tbl, id, data, ver, seq)
      select x.tbl, x.id, to_jsonb(x.data), 1, coalesce(x.seq, 0) from jsonb_to_recordset($1::jsonb) as x(tbl text, id text, data text, seq float8)`,
      [JSON.stringify(records)]);
  }
  /* Новые записи — с rev 2: версия 1 у строк базы своя. */
  await db.query(`select setval(pg_get_serial_sequence('public.erp_log', 'rev'), 1)`);
  let queue = Promise.resolve();
  const one = fn => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };
  const s = {
    calls: [], fail: null,
    rpc(name, a) {
      return one(async () => {
        if (s.fail && s.fail(name, a)) throw new Error('No connection to the server.');
        if (!RPC.has(name)) throw new Error('Unexpected ' + name);
        const keys = Object.keys(a || {}), vals = keys.map(k => a[k] !== null && typeof a[k] === 'object' ? JSON.stringify(a[k]) : a[k]);
        const args = keys.map((k, i) => k + ' => $' + (i + 1) + (a[k] !== null && typeof a[k] === 'object' ? '::jsonb' : '')).join(', ');
        await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ADMIN]);
        await db.exec('set role authenticated');
        let out;
        try { out = (await db.query(`select public.${name}(${args}) as r`, vals)).rows[0].r; }
        finally { await db.exec('reset role'); }
        if (typeof out === 'bigint' || typeof out === 'string' && /^\d+$/.test(out)) out = Number(out);
        if (name === 'erp_apply') s.calls.push(out.staged ? { staged: a.changes.length } : { rows: a.changes.length, expect: [...new Set((a.expect || []).map(e => e.tbl))], conflict: (out.conflict || []).length });
        return out;
      });
    },
    async row(tbl, id) {
      const r = (await db.query(`select data #>> '{}' as data, deleted from public.erp_record where tbl = $1 and id = $2`, [tbl, id])).rows[0];
      return r && !r.deleted ? { data: r.data } : null;
    },
    async count(tbl) { return Number((await db.query(`select count(*) as n from public.erp_record where tbl = $1 and not deleted`, [tbl])).rows[0].n); },
    close: () => db.close()
  };
  return s;
}
module.exports = server;
