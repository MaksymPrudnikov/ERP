-- Проверка schema.sql на своём Postgres (после local-stub.sql и schema.sql).
-- Каждая проверка — assert; первая же неудача останавливает прогон.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@glass-erp.test'),
  ('00000000-0000-0000-0000-00000000000b', 'office@glass-erp.test'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@glass-erp.test');
-- schema.sql заводит первого администратора, когда его вход уже есть.
insert into public.erp_member (user_id, name, admin)
  select id, 'Admin', true from auth.users where lower(email) = 'admin@glass-erp.test'
  on conflict (user_id) do nothing;

create or replace function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false), set_config('role', 'authenticated', false)
$$;
create or replace function pg_temp.fails(sql text, pattern text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return sqlerrm like pattern; end $$;
grant execute on function pg_temp.fails(text, text) to authenticated;

-- Нет входа и чужой вход: ничего.
reset role;
select pg_temp.as_user('');
do $$ begin assert pg_temp.fails('select public.erp_changes(0)', 'Not a member%'), 'без входа читает'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin assert pg_temp.fails('select public.erp_apply(''c0'',''b'',''d'',''[]'',''[{"tbl":"x","id":"1","data":{}}]'')', 'Not a member%'), 'чужой пишет'; end $$;
do $$ begin assert pg_temp.fails('select * from public.erp_record', 'permission denied%'), 'таблица открыта напрямую'; end $$;

-- Администратор заводит офис.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.erp_member_set('office@glass-erp.test', 'Office', false, true);
do $$ begin assert pg_temp.fails('select public.erp_member_set(''admin@glass-erp.test'', ''A'', false, true)', 'You cannot remove%'), 'админ снял себя'; end $$;

-- Офис: запись, номер заказа подряд, повтор команды, конфликт.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin assert pg_temp.fails('select public.erp_member_set(''office@glass-erp.test'', ''O'', true, true)', 'Only an administrator%'), 'офис сделал себя админом'; end $$;
do $$
declare a jsonb; b jsonb; c jsonb; d jsonb; ch jsonb;
begin
  a := public.erp_apply('cmd-1', 'b1', 'pc1', '[{"tbl":"salesOrder","id":"SO-1","ver":0}]',
        '[{"tbl":"salesOrder","id":"SO-1","data":{"id":"SO-1","no":"76002"},"number":{"name":"order","value":"76002"}}]');
  assert (a->>'ok')::boolean, 'запись не прошла: ' || a;
  assert a->'numbers'->>'salesOrder|SO-1' = '76002', 'первый номер — с компьютера: ' || a;
  b := public.erp_apply('cmd-1', 'b1', 'pc1', '[]', '[{"tbl":"salesOrder","id":"SO-1","data":{"id":"SO-1","x":1}}]');
  assert b = a, 'повтор команды записал снова';
  c := public.erp_apply('cmd-2', 'b1', 'pc2', '[{"tbl":"salesOrder","id":"SO-1","ver":0}]', '[{"tbl":"salesOrder","id":"SO-1","data":{"id":"SO-1"}}]');
  assert not (c->>'ok')::boolean and c->'conflict'->0->>'id' = 'SO-1', 'конфликт не пойман: ' || c;
  d := public.erp_apply('cmd-3', 'b1', 'pc1', '[]',
        '[{"tbl":"salesOrder","id":"SO-2","data":{"id":"SO-2","no":"76002"},"number":{"name":"order","value":"76002"}},{"tbl":"orderEvent","id":"E-1","data":{"id":"E-1","detail":"76002","note":"x76002"}}]');
  assert d->'numbers'->>'salesOrder|SO-2' = '76003', 'занятый номер не сдвинут: ' || d;
  ch := public.erp_changes(0);
  assert jsonb_array_length(ch->'rows') = 3, 'изменений не 3: ' || ch;
  assert ch->'rows'->0->'data'->>'no' = '76002' and ch->'rows'->1->'data'->>'no' = '76003', 'номер не в данных: ' || ch;
  assert ch->'rows'->2->'data' = '{"id":"E-1","detail":"76003","note":"x76002"}', 'ссылка на номер в команде: ' || ch;
  assert pg_temp.fails($q$select public.erp_apply('cmd-bad', 'b1', 'pc1', '[]', '[{"tbl":"salesOrder","id":"R-9","data":{},"number":{"name":"receipt","value":"X-1","prefix":"R-"}}]')$q$, 'Bad document number%'), 'чужой номер';
  -- Удаление приходит пометкой; повтор чтения с last — пусто.
  d := public.erp_apply('cmd-4', 'b1', 'pc1', format('[{"tbl":"salesOrder","id":"SO-2","ver":%s},{"tbl":"orderEvent","id":"E-1","ver":%s}]', d->'vers'->>'salesOrder|SO-2', d->'vers'->>'orderEvent|E-1')::jsonb,
        '[{"tbl":"salesOrder","id":"SO-2","data":null},{"tbl":"orderEvent","id":"E-1","data":null}]');
  assert (d->>'ok')::boolean, 'удаление не прошло: ' || d;
  ch := public.erp_changes((ch->>'last')::bigint);
  assert jsonb_array_length(ch->'rows') = 2 and (ch->'rows'->0->>'deleted')::boolean, 'удаление не пришло: ' || ch;
  assert jsonb_array_length(public.erp_changes((ch->>'last')::bigint)->'rows') = 0, 'после last не пусто';
  -- Блоки номеров не пересекаются.
  assert public.erp_take('glass', 100) = 1 and public.erp_take('glass', 100) = 101, 'блоки номеров';
  assert public.erp_take('scan', 10, 500) = 500 and public.erp_take('scan', 10, 3) = 510, 'блок — после уже выданных';
  -- Архив по запросу.
  perform public.erp_apply('cmd-5', 'b1', 'pc1', '[]', '[{"tbl":"stationScan","id":"S-1","data":{"id":"S-1"},"cold":true,"month":"2025-01"}]');
  assert (public.erp_changes(0)->'rows'->-1->'data') = 'null', 'архив пришёл с данными в горячем';
  assert public.erp_cold('[{"tbl":"stationScan","id":"S-1"}]')->0->'data'->>'id' = 'S-1', 'архив по ключу';
  assert pg_temp.fails('select public.erp_take(''glass'', 0)', 'Block size%'), 'пустой блок';
end $$;

-- Права по разделам: офис с Sales не пишет и не читает оплаты, пишет журнал
-- входов, но не читает его, людей не меняет; с Finance — читает оплаты.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.erp_member_set('office@glass-erp.test', 'Office', false, true, '{sales}');
do $$
declare r jsonb;
begin
  r := public.erp_apply('adm-1', 'b1', 'pc1', '[]', '[{"tbl":"receipt","id":"R-1","data":{"id":"R-1","amount":100}}]');
  assert (r->>'ok')::boolean, 'админ не записал оплату: ' || r;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$
declare r jsonb; ch jsonb;
begin
  assert public.erp_whoami()->'sections' = '["sales"]', 'whoami без разделов';
  r := public.erp_apply('off-1', 'b1', 'pc2', '[]', '[{"tbl":"salesOrder","id":"SO-9","data":{"id":"SO-9"}},{"tbl":"receipt","id":"R-2","data":{"id":"R-2"}}]');
  assert not (r->>'ok')::boolean and r->'denied' = '["receipt"]', 'оплата без Finance: ' || r;
  assert public.erp_apply('off-1', 'b1', 'pc2', '[]', '[]') = r, 'повтор отказа — другой ответ';
  assert not exists (select 1 from jsonb_array_elements(public.erp_changes(0)->'rows') x where x->>'tbl' in ('receipt') or x->>'id' = 'SO-9'), 'отказ записал заказ или видна оплата';
  r := public.erp_apply('off-2', 'b1', 'pc2', '[]', '[{"tbl":"authEvent","id":"A-1","data":{"id":"A-1"}}]');
  assert (r->>'ok')::boolean, 'журнал входов не пишется: ' || r;
  assert not exists (select 1 from jsonb_array_elements(public.erp_changes(0)->'rows') x where x->>'tbl' = 'authEvent'), 'журнал входов виден без Users';
  r := public.erp_apply('off-3', 'b1', 'pc2', '[]', '[{"tbl":"user","id":"U-1","data":{"id":"U-1"}}]');
  assert r->'denied' = '["user"]', 'люди без Users: ' || r;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.erp_member_set('office@glass-erp.test', 'Office', false, true, '{sales,finance}');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert exists (select 1 from jsonb_array_elements(public.erp_changes(0)->'rows') x where x->>'tbl' = 'receipt'), 'с Finance оплата не видна';
end $$;

-- Порядок строки (seq) хранится и приходит; erp_get — строки как сейчас.
do $$
declare r jsonb; g jsonb;
begin
  r := public.erp_apply('off-4', 'b1', 'pc2', '[]', '[{"tbl":"customer","id":"C-1","seq":7,"data":{"id":"C-1"}}]');
  r := public.erp_apply('off-4b', 'b1', 'pc2', '[]', '[{"tbl":"customer","id":"C-2","seq":7.5,"data":{"id":"C-2"}}]');
  assert (r->>'ok')::boolean and exists (select 1 from jsonb_array_elements(public.erp_changes(0)->'rows') x where x->>'id' = 'C-2' and (x->>'seq')::float8 = 7.5), 'дробный seq: ' || r;
  assert (r->>'ok')::boolean, 'клиент не записан: ' || r;
  assert exists (select 1 from jsonb_array_elements(public.erp_changes(0)->'rows') x where x->>'id' = 'C-1' and (x->>'seq')::int = 7), 'seq не пришёл';
  g := public.erp_get('[{"tbl":"customer","id":"C-1"},{"tbl":"customer","id":"C-404"},{"tbl":"salesOrder","id":"SO-2"}]');
  assert jsonb_array_length(g) = 2, 'erp_get: ' || g;
  assert g @> '[{"id":"C-1","seq":7,"deleted":false,"data":{"id":"C-1"}}]' and g @> '[{"id":"SO-2","deleted":true}]', 'erp_get: ' || g;
  -- Строка текстом JSON (так шлёт ERP): номер встаёт в текст, текст остаётся текстом.
  r := public.erp_apply('off-5', 'b1', 'pc2', '[]', '[{"tbl":"salesOrder","id":"SO-3","data":"{\"id\":\"SO-3\",\"no\":\"R-0001\",\"ref\":\"R-0001\"}","number":{"name":"receipt","value":"R-0001","prefix":"R-","pad":4}}]');
  r := public.erp_apply('off-6', 'b1', 'pc2', '[]', '[{"tbl":"salesOrder","id":"SO-4","data":"{\"id\":\"SO-4\",\"no\":\"R-0001\"}","number":{"name":"receipt","value":"R-0001","prefix":"R-","pad":4}}]');
  g := public.erp_get('[{"tbl":"salesOrder","id":"SO-3"},{"tbl":"salesOrder","id":"SO-4"}]');
  assert jsonb_typeof(g->0->'data') = 'string' and g->0->>'data' = '{"id":"SO-3","no":"R-0001","ref":"R-0001"}', 'номер в тексте: ' || g;
  -- Тот же номер с другого компьютера — следующий, с нулями.
  assert g->1->>'data' = '{"id":"SO-4","no":"R-0002"}' and r->'numbers'->>'salesOrder|SO-4' = 'R-0002', 'второй в команде: ' || r || g;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.erp_member_set('office@glass-erp.test', 'Office', false, true, '{sales}');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert public.erp_get('[{"tbl":"receipt","id":"R-1"}]') = '[]', 'erp_get отдаёт оплату без Finance';
end $$;

-- Отключённый человек больше ничего не может.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.erp_member_set('office@glass-erp.test', 'Office', false, false);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin assert pg_temp.fails('select public.erp_changes(0)', 'Not a member%'), 'отключённый читает'; end $$;
do $$ begin assert pg_temp.fails('select public.erp_get(''[]'')', 'Not a member%'), 'отключённый читает строки'; end $$;
reset role;
select 'schema check: ok' as result;
