/* Сервер ERP на PGlite (настоящий Postgres в Node, без установки): чистая
   база, заглушка того, что есть в Supabase (local-stub.sql), schema.sql.
   Нужен проверке SQL в CI (check-pglite.js) и тестам двух компьютеров
   (test/cloud-server.js) — они гоняют команды ERP против того же SQL, что
   стоит в Supabase, а не против его модели. Строки \set — команды psql,
   PGlite их не знает: убираются. */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const sqlOf = f => fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(l => !/^\\set\b/.test(l)).join('\n');

async function pgliteServer(files) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  for (const f of files || ['local-stub.sql', 'schema.sql']) {
    try { await db.exec(sqlOf(f)); } catch (e) { throw new Error(f + ': ' + e.message); }
  }
  return db;
}
module.exports = { pgliteServer, sqlOf };
