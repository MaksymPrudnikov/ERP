-- Сервер ERP на Supabase, этап 4 задания «База» (docs/ЗАДАЧА_БАЗА.md,
-- «Серверный контракт»). Запуск: Supabase → SQL Editor → вставить файл →
-- Run. Повторный запуск безопасен: таблицы не пересоздаются, функции
-- заменяются.
--
-- Одна модель записей: строка таблицы ERP (tbl, id) с JSON-данными. Читать и
-- писать — только функциями ниже; прямого доступа к таблицам нет ни у кого,
-- кроме владельца базы. Каждая функция сначала проверяет, что вошедший
-- человек есть в erp_member и не отключён.

create table if not exists public.erp_record (
  tbl text not null,
  id text not null,
  data jsonb,
  cold boolean not null default false,          -- архив (этап 3)
  month text not null default '',               -- месяц архива, YYYY-MM
  ver bigint not null,                          -- rev последней записи
  deleted boolean not null default false,       -- удалённая — строка остаётся, data пустая
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (tbl, id)
);
create index if not exists erp_record_cold on public.erp_record (cold, tbl);

-- Курсор изменений: каждая запись строки — новая строка журнала по порядку.
create table if not exists public.erp_log (
  rev bigserial primary key,
  tbl text not null,
  id text not null,
  at timestamptz not null default now()
);

-- Команда с номером: повтор (ответ потерялся, команда ушла снова) получает
-- прежний ответ и ничего не пишет второй раз.
create table if not exists public.erp_command (
  id text primary key,
  user_id uuid not null,
  device text not null default '',
  build text not null default '',
  at timestamptz not null default now(),
  result jsonb not null
);

-- Счётчики: заказы, счета, PS — по одному подряд внутри команды;
-- внутренние номера (стёкла, юниты, сканы, обрезки) — блоками.
create table if not exists public.erp_counter (
  name text primary key,
  next bigint not null default 1
);

-- Люди: вход Supabase Auth + запись здесь. Без записи (или отключённый) —
-- ни чтения, ни записи. admin заводит и отключает других.
create table if not exists public.erp_member (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  admin boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.erp_record enable row level security;
alter table public.erp_log enable row level security;
alter table public.erp_command enable row level security;
alter table public.erp_counter enable row level security;
alter table public.erp_member enable row level security;
revoke all on public.erp_record, public.erp_log, public.erp_command, public.erp_counter, public.erp_member from public, anon, authenticated;
revoke all on sequence public.erp_log_rev_seq from public, anon, authenticated;

-- Кто вошёл: ошибка, если не участник.
create or replace function public.erp_me() returns public.erp_member
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m public.erp_member;
begin
  select * into m from public.erp_member where user_id = auth.uid() and active;
  if not found then raise exception 'Not a member of this shop.' using errcode = '42501'; end if;
  return m;
end $$;

-- Запись: change-set целиком или ничего.
--   expect  — [{tbl,id,ver}]: ver строки сейчас; 0 — строки ещё нет.
--             Не совпал хоть один — конфликт, ничего не записано.
--   changes — [{tbl,id,data,cold?,month?,number?}]; data null — удалить.
--             number {name, path:[...]} — сервер ставит в data по пути
--             следующий номер счётчика name (номера подряд).
-- Ответ: {ok, rev, vers:{"tbl|id":ver}, numbers:{"tbl|id":n}} или
--        {ok:false, conflict:[{tbl,id,ver,now}]}.
create or replace function public.erp_apply(command_id text, build text, device text, expect jsonb, changes jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me public.erp_member := public.erp_me();
  prev jsonb; e jsonb; c jsonb; cur bigint; bad jsonb := '[]'::jsonb;
  r bigint; d jsonb; n bigint; vers jsonb := '{}'::jsonb; nums jsonb := '{}'::jsonb; res jsonb;
begin
  if coalesce(command_id, '') = '' then raise exception 'Command id is required.'; end if;
  if jsonb_typeof(coalesce(changes, 'null')) <> 'array' or jsonb_typeof(coalesce(expect, '[]')) <> 'array' then
    raise exception 'Changes and expect must be arrays.';
  end if;
  -- Одна запись за раз: rev в журнале идут в порядке записи.
  perform pg_advisory_xact_lock(7240001);
  select result into prev from public.erp_command where id = command_id;
  if found then return prev; end if;

  for e in select * from jsonb_array_elements(coalesce(expect, '[]')) loop
    select ver into cur from public.erp_record where tbl = e->>'tbl' and id = e->>'id' and not deleted;
    if coalesce(cur, 0) <> coalesce((e->>'ver')::bigint, 0) then
      bad := bad || jsonb_build_object('tbl', e->>'tbl', 'id', e->>'id', 'ver', (e->>'ver')::bigint, 'now', coalesce(cur, 0));
    end if;
  end loop;

  if jsonb_array_length(bad) > 0 then
    res := jsonb_build_object('ok', false, 'conflict', bad);
  else
    for c in select * from jsonb_array_elements(changes) loop
      if coalesce(c->>'tbl', '') = '' or coalesce(c->>'id', '') = '' then raise exception 'Each change needs tbl and id.'; end if;
      d := case when jsonb_typeof(c->'data') = 'null' or c->'data' is null then null else c->'data' end;
      if d is not null and c ? 'number' then
        insert into public.erp_counter as k (name, next) values (c->'number'->>'name', 2)
          on conflict (name) do update set next = k.next + 1
          returning next - 1 into n;
        d := jsonb_set(d, array(select jsonb_array_elements_text(c->'number'->'path')), to_jsonb(n), true);
        nums := nums || jsonb_build_object((c->>'tbl') || '|' || (c->>'id'), n);
      end if;
      insert into public.erp_log (tbl, id) values (c->>'tbl', c->>'id') returning rev into r;
      insert into public.erp_record as x (tbl, id, data, cold, month, ver, deleted, updated_at, updated_by)
        values (c->>'tbl', c->>'id', d, coalesce((c->>'cold')::boolean, false), coalesce(c->>'month', ''), r, d is null, now(), me.user_id)
        on conflict (tbl, id) do update set data = excluded.data, cold = excluded.cold, month = excluded.month,
          ver = excluded.ver, deleted = excluded.deleted, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
      vers := vers || jsonb_build_object((c->>'tbl') || '|' || (c->>'id'), r);
    end loop;
    res := jsonb_build_object('ok', true, 'rev', (select coalesce(max(rev), 0) from public.erp_log), 'vers', vers, 'numbers', nums);
  end if;

  insert into public.erp_command (id, user_id, device, build, result)
    values (command_id, me.user_id, coalesce(device, ''), coalesce(build, ''), res);
  return res;
end $$;

-- Блок внутренних номеров: первый номер блока из n подряд. Пропуски
-- допустимы (решение владельца 22.10.2026).
create or replace function public.erp_take(counter text, n int)
returns bigint language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare first bigint;
begin
  perform public.erp_me();
  if n is null or n < 1 or n > 10000 then raise exception 'Block size must be 1–10000.'; end if;
  insert into public.erp_counter as k (name, next) values (counter, n + 1)
    on conflict (name) do update set next = k.next + n
    returning next - n into first;
  return first;
end $$;

-- Изменения после rev since (горячее; архив — erp_cold). Удалённые приходят
-- с deleted = true. last — rev, с которого спрашивать дальше.
create or replace function public.erp_changes(since bigint, lim int default 2000)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare rows jsonb; last bigint;
begin
  perform public.erp_me();
  with l as (
    select tbl, id, max(rev) as rev from (
      select tbl, id, rev from public.erp_log where rev > coalesce(since, 0) order by rev limit greatest(1, least(coalesce(lim, 2000), 10000))
    ) s group by tbl, id
  )
  select coalesce(jsonb_agg(jsonb_build_object('tbl', r.tbl, 'id', r.id, 'ver', r.ver, 'deleted', r.deleted,
           'cold', r.cold, 'data', case when r.cold then null else r.data end) order by l.rev), '[]'::jsonb),
         max(l.rev)
    into rows, last
    from l join public.erp_record r on r.tbl = l.tbl and r.id = l.id;
  return jsonb_build_object('rows', rows, 'last', coalesce(last, since, 0));
end $$;

-- Архивные строки по ключам (этап 3 просит их по запросу).
create or replace function public.erp_cold(keys jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.erp_me();
  return coalesce((select jsonb_agg(jsonb_build_object('tbl', r.tbl, 'id', r.id, 'ver', r.ver, 'month', r.month, 'data', r.data))
    from jsonb_array_elements(coalesce(keys, '[]')) k
    join public.erp_record r on r.tbl = k->>'tbl' and r.id = k->>'id' and r.cold and not r.deleted), '[]'::jsonb);
end $$;

-- Размер базы — в индикатор места (Free: 500 МБ).
create or replace function public.erp_size()
returns bigint language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.erp_me();
  return pg_database_size(current_database());
end $$;

-- Кто я: имя и права для экрана.
create or replace function public.erp_whoami()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me public.erp_member := public.erp_me();
begin
  return jsonb_build_object('user_id', me.user_id, 'name', me.name, 'admin', me.admin);
end $$;

-- Администратор заводит, переименовывает и отключает людей. Сам вход
-- (почта и пароль) создаётся в Supabase → Authentication → Users.
create or replace function public.erp_member_set(email text, name text, admin boolean, active boolean)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare me public.erp_member := public.erp_me(); uid uuid;
begin
  if not me.admin then raise exception 'Only an administrator can change people.' using errcode = '42501'; end if;
  select id into uid from auth.users u where lower(u.email) = lower(erp_member_set.email);
  if uid is null then raise exception 'No login with this email. Create it in Authentication first.'; end if;
  if uid = me.user_id and (not admin or not active) then raise exception 'You cannot remove your own administrator access.'; end if;
  insert into public.erp_member as m (user_id, name, admin, active, updated_at) values (uid, coalesce(name, ''), admin, active, now())
    on conflict (user_id) do update set name = excluded.name, admin = excluded.admin, active = excluded.active, updated_at = now();
  return jsonb_build_object('user_id', uid);
end $$;

revoke all on function public.erp_me(), public.erp_apply(text, text, text, jsonb, jsonb), public.erp_take(text, int),
  public.erp_changes(bigint, int), public.erp_cold(jsonb), public.erp_size(), public.erp_whoami(),
  public.erp_member_set(text, text, boolean, boolean) from public, anon;
revoke all on function public.erp_me() from authenticated;
grant execute on function public.erp_apply(text, text, text, jsonb, jsonb), public.erp_take(text, int),
  public.erp_changes(bigint, int), public.erp_cold(jsonb), public.erp_size(), public.erp_whoami(),
  public.erp_member_set(text, text, boolean, boolean) to authenticated;

-- Первый администратор — вход admin@glass-erp.test (тестовый проект). Для
-- другого адреса поменяйте его здесь перед запуском.
insert into public.erp_member (user_id, name, admin)
  select id, 'Admin', true from auth.users where lower(email) = 'admin@glass-erp.test'
  on conflict (user_id) do nothing;
