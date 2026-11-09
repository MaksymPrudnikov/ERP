#!/usr/bin/env node
/* Проверка tools/supabase/schema.sql без своего Postgres — то же, что
   check.sh: чистая база, заглушка Supabase, схема дважды (повторный запуск
   безопасен), check.sql. Гоняет CI (.github/workflows/build.yml) и prepush:
   ошибка в SQL сервера не доходит до main. Код выхода 1 — не прошло. */
const { pgliteServer } = require('./pglite');

(async () => {
  const t = Date.now();
  try {
    const db = await pgliteServer(['local-stub.sql', 'schema.sql', 'schema.sql', 'check.sql']);
    await db.close();
  } catch (e) {
    console.error('SQL сервера: ' + e.message);
    process.exit(1);
  }
  console.log('SQL сервера: local-stub, schema ×2, check — ok (' + (Date.now() - t) + ' мс)');
})();
