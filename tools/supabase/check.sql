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
        '[{"tbl":"salesOrder","id":"SO-1","data":{"id":"SO-1","no":null},"number":{"name":"order","path":["no"]}}]');
  assert (a->>'ok')::boolean, 'запись не прошла: ' || a;
  assert (a->'numbers'->>'salesOrder|SO-1')::int = 1, 'номер заказа не 1: ' || a;
  b := public.erp_apply('cmd-1', 'b1', 'pc1', '[]', '[{"tbl":"salesOrder","id":"SO-1","data":{"id":"SO-1","x":1}}]');
  assert b = a, 'повтор команды записал снова';
  c := public.erp_apply('cmd-2', 'b1', 'pc2', '[{"tbl":"salesOrder","id":"SO-1","ver":0}]', '[{"tbl":"salesOrder","id":"SO-1","data":{"id":"SO-1"}}]');
  assert not (c->>'ok')::boolean and c->'conflict'->0->>'id' = 'SO-1', 'конфликт не пойман: ' || c;
  d := public.erp_apply('cmd-3', 'b1', 'pc1', '[]',
        '[{"tbl":"salesOrder","id":"SO-2","data":{"id":"SO-2"},"number":{"name":"order","path":["no"]}}]');
  assert (d->'numbers'->>'salesOrder|SO-2')::int = 2, 'второй номер не 2: ' || d;
  ch := public.erp_changes(0);
  assert jsonb_array_length(ch->'rows') = 2, 'изменений не 2: ' || ch;
  assert ch->'rows'->0->'data'->>'no' = '1', 'номер не в данных: ' || ch;
  -- Удаление приходит пометкой; повтор чтения с last — пусто.
  d := public.erp_apply('cmd-4', 'b1', 'pc1', format('[{"tbl":"salesOrder","id":"SO-2","ver":%s}]', d->'vers'->>'salesOrder|SO-2')::jsonb,
        '[{"tbl":"salesOrder","id":"SO-2","data":null}]');
  assert (d->>'ok')::boolean, 'удаление не прошло: ' || d;
  ch := public.erp_changes((ch->>'last')::bigint);
  assert jsonb_array_length(ch->'rows') = 1 and (ch->'rows'->0->>'deleted')::boolean, 'удаление не пришло: ' || ch;
  assert jsonb_array_length(public.erp_changes((ch->>'last')::bigint)->'rows') = 0, 'после last не пусто';
  -- Блоки номеров не пересекаются.
  assert public.erp_take('glass', 100) = 1 and public.erp_take('glass', 100) = 101, 'блоки номеров';
  -- Архив по запросу.
  perform public.erp_apply('cmd-5', 'b1', 'pc1', '[]', '[{"tbl":"stationScan","id":"S-1","data":{"id":"S-1"},"cold":true,"month":"2025-01"}]');
  assert (public.erp_changes(0)->'rows'->-1->'data') = 'null', 'архив пришёл с данными в горячем';
  assert public.erp_cold('[{"tbl":"stationScan","id":"S-1"}]')->0->'data'->>'id' = 'S-1', 'архив по ключу';
  assert pg_temp.fails('select public.erp_take(''glass'', 0)', 'Block size%'), 'пустой блок';
end $$;

-- Отключённый человек больше ничего не может.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.erp_member_set('office@glass-erp.test', 'Office', false, false);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin assert pg_temp.fails('select public.erp_changes(0)', 'Not a member%'), 'отключённый читает'; end $$;
reset role;
select 'schema check: ok' as result;
