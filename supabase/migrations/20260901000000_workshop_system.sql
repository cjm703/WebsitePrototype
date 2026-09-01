-- Modular Workshop persistence and atomic construction transactions.
-- Additive only: no existing application rows are modified or removed.

create table if not exists public.app_workshop_blueprints (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_workshop_components (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.player_workshop_access (
  player_id text primary key references public.app_players(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.player_workshop_storage (
  player_id text primary key references public.app_players(id) on delete cascade,
  data jsonb not null default '{"quantities":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_workshop_builds (
  id text primary key,
  player_id text not null references public.app_players(id) on delete cascade,
  status text not null check (status in ('draft', 'building', 'completed', 'scrapped')),
  revision integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists app_workshop_builds_player_updated_idx on public.app_workshop_builds(player_id, updated_at desc);
create index if not exists app_workshop_builds_status_updated_idx on public.app_workshop_builds(status, updated_at desc);

create table if not exists public.app_workshop_salvage_recipes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_workshop_ledger (
  id text primary key,
  player_id text not null references public.app_players(id) on delete cascade,
  build_id text,
  action text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists app_workshop_ledger_player_created_idx on public.app_workshop_ledger(player_id, created_at desc);

alter table public.app_workshop_blueprints enable row level security;
alter table public.app_workshop_components enable row level security;
alter table public.player_workshop_access enable row level security;
alter table public.player_workshop_storage enable row level security;
alter table public.app_workshop_builds enable row level security;
alter table public.app_workshop_salvage_recipes enable row level security;
alter table public.app_workshop_ledger enable row level security;

revoke all on public.app_workshop_blueprints from anon, authenticated;
revoke all on public.app_workshop_components from anon, authenticated;
revoke all on public.player_workshop_access from anon, authenticated;
revoke all on public.player_workshop_storage from anon, authenticated;
revoke all on public.app_workshop_builds from anon, authenticated;
revoke all on public.app_workshop_salvage_recipes from anon, authenticated;
revoke all on public.app_workshop_ledger from anon, authenticated;

create or replace function public.workshop_complete_build(
  p_build_id text,
  p_expected_revision integer,
  p_dm_id text,
  p_total_cost bigint,
  p_storage_delta jsonb,
  p_item_id text,
  p_item_data jsonb,
  p_build_data jsonb,
  p_ledger_id text,
  p_ledger_data jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_build public.app_workshop_builds%rowtype;
  v_office jsonb;
  v_funds jsonb;
  v_fund_index integer := -1;
  v_balance bigint := 0;
  v_storage jsonb;
  v_component_id text;
  v_delta integer;
  v_available integer;
  v_office_revision integer;
begin
  if p_total_cost < 0 then raise exception 'Construction cost cannot be negative'; end if;

  select * into v_build from public.app_workshop_builds where id = p_build_id for update;
  if not found then raise exception 'Workshop build was not found'; end if;
  if v_build.status <> 'building' then raise exception 'Only Building work orders can be completed'; end if;
  if v_build.revision <> p_expected_revision then raise exception 'Workshop build changed on another client'; end if;

  select data into v_office from public.app_nexus_nomad_state where id = 'default' for update;
  if v_office is null then raise exception 'Company Funds are not available'; end if;
  v_funds := coalesce(v_office->'personalFunds', '[]'::jsonb);
  select (ordinality - 1)::integer, coalesce((value->>'balance')::bigint, 0)
    into v_fund_index, v_balance
    from jsonb_array_elements(v_funds) with ordinality
    where value->>'playerId' = v_build.player_id
    limit 1;
  if v_fund_index < 0 then v_balance := 0; end if;
  if v_balance < p_total_cost then
    raise exception 'Player does not have enough credits. Required: % CR · Available: % CR.', p_total_cost, v_balance;
  end if;

  insert into public.player_workshop_storage(player_id, data)
    values (v_build.player_id, jsonb_build_object('playerId', v_build.player_id, 'quantities', '{}'::jsonb))
    on conflict (player_id) do nothing;
  select data into v_storage from public.player_workshop_storage where player_id = v_build.player_id for update;
  v_storage := coalesce(v_storage, jsonb_build_object('playerId', v_build.player_id, 'quantities', '{}'::jsonb));

  for v_component_id, v_delta in select key, value::text::integer from jsonb_each(coalesce(p_storage_delta, '{}'::jsonb))
  loop
    v_available := coalesce((v_storage #>> array['quantities', v_component_id])::integer, 0);
    if v_available + v_delta < 0 then raise exception 'A reserved Workshop component is no longer available: %', v_component_id; end if;
    v_storage := jsonb_set(v_storage, array['quantities', v_component_id], to_jsonb(v_available + v_delta), true);
  end loop;
  v_storage := jsonb_set(v_storage, '{updatedAt}', to_jsonb(now()::text), true);

  if v_fund_index >= 0 then
    v_funds := jsonb_set(v_funds, array[v_fund_index::text, 'balance'], to_jsonb(v_balance - p_total_cost), false);
    v_funds := jsonb_set(v_funds, array[v_fund_index::text, 'updatedAt'], to_jsonb(now()::text), true);
    v_funds := jsonb_set(v_funds, array[v_fund_index::text, 'updatedBy'], to_jsonb(p_dm_id), true);
  end if;
  v_office_revision := coalesce((v_office->>'revision')::integer, 0) + 1;
  v_office := jsonb_set(v_office, '{personalFunds}', v_funds, true);
  v_office := jsonb_set(v_office, '{revision}', to_jsonb(v_office_revision), true);
  v_office := jsonb_set(v_office, '{updatedAt}', to_jsonb(now()::text), true);
  v_office := jsonb_set(v_office, '{updatedBy}', to_jsonb(p_dm_id), true);

  update public.app_nexus_nomad_state set data = v_office, updated_at = now() where id = 'default';
  update public.player_workshop_storage set data = v_storage, updated_at = now() where player_id = v_build.player_id;
  insert into public.app_items(id, data, updated_at) values (p_item_id, p_item_data, now())
    on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;
  update public.app_workshop_builds set status = 'completed', revision = p_expected_revision + 1, data = p_build_data, updated_at = now() where id = p_build_id;
  insert into public.app_workshop_ledger(id, player_id, build_id, action, data)
    values (p_ledger_id, v_build.player_id, p_build_id, 'completed', p_ledger_data);

  return jsonb_build_object('build', p_build_data, 'storage', v_storage, 'personalFunds', v_balance - p_total_cost, 'item', p_item_data);
end;
$$;

create or replace function public.workshop_return_components(
  p_player_id text,
  p_build_id text,
  p_expected_revision integer,
  p_item_id text,
  p_component_counts jsonb,
  p_build_data jsonb,
  p_actor_id text,
  p_action text,
  p_ledger_id text,
  p_ledger_data jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_build public.app_workshop_builds%rowtype;
  v_storage jsonb;
  v_component_id text;
  v_count integer;
  v_available integer;
begin
  if p_action not in ('scrapped', 'rebuild-started') then raise exception 'Invalid Workshop return action'; end if;
  select * into v_build from public.app_workshop_builds where id = p_build_id and player_id = p_player_id for update;
  if not found then raise exception 'Workshop build was not found'; end if;
  if v_build.status <> 'completed' then raise exception 'Only completed Workshop items can be changed'; end if;
  if v_build.revision <> p_expected_revision then raise exception 'Workshop build changed on another client'; end if;

  insert into public.player_workshop_storage(player_id, data)
    values (p_player_id, jsonb_build_object('playerId', p_player_id, 'quantities', '{}'::jsonb))
    on conflict (player_id) do nothing;
  select data into v_storage from public.player_workshop_storage where player_id = p_player_id for update;
  for v_component_id, v_count in select key, value::text::integer from jsonb_each(coalesce(p_component_counts, '{}'::jsonb))
  loop
    v_available := coalesce((v_storage #>> array['quantities', v_component_id])::integer, 0);
    v_storage := jsonb_set(v_storage, array['quantities', v_component_id], to_jsonb(v_available + greatest(0, v_count)), true);
  end loop;
  v_storage := jsonb_set(v_storage, '{updatedAt}', to_jsonb(now()::text), true);
  update public.player_workshop_storage set data = v_storage, updated_at = now() where player_id = p_player_id;
  delete from public.app_items where id = p_item_id;
  update public.player_equipment_slots
    set data = coalesce((select jsonb_object_agg(key, value) from jsonb_each(data) where value->>'itemId' is distinct from p_item_id), '{}'::jsonb), updated_at = now()
    where player_id = p_player_id;
  update public.app_workshop_builds set status = case when p_action = 'scrapped' then 'scrapped' else 'building' end, revision = p_expected_revision + 1, data = p_build_data, updated_at = now() where id = p_build_id;
  insert into public.app_workshop_ledger(id, player_id, build_id, action, data)
    values (p_ledger_id, p_player_id, p_build_id, p_action, p_ledger_data);
  return jsonb_build_object('build', p_build_data, 'storage', v_storage);
end;
$$;

create or replace function public.workshop_scrap_existing_item(
  p_player_id text,
  p_item_id text,
  p_component_counts jsonb,
  p_actor_id text,
  p_ledger_id text,
  p_ledger_data jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.app_items%rowtype;
  v_storage jsonb;
  v_component_id text;
  v_count integer;
  v_available integer;
begin
  select * into v_item from public.app_items where id = p_item_id for update;
  if not found then raise exception 'Item was not found'; end if;
  if not coalesce(v_item.data->'assignedTo', '[]'::jsonb) ? p_player_id then
    raise exception 'That item is not assigned to this player';
  end if;

  insert into public.player_workshop_storage(player_id, data)
    values (p_player_id, jsonb_build_object('playerId', p_player_id, 'quantities', '{}'::jsonb))
    on conflict (player_id) do nothing;
  select data into v_storage from public.player_workshop_storage where player_id = p_player_id for update;
  for v_component_id, v_count in select key, value::text::integer from jsonb_each(coalesce(p_component_counts, '{}'::jsonb))
  loop
    v_available := coalesce((v_storage #>> array['quantities', v_component_id])::integer, 0);
    v_storage := jsonb_set(v_storage, array['quantities', v_component_id], to_jsonb(v_available + greatest(0, v_count)), true);
  end loop;
  v_storage := jsonb_set(v_storage, '{updatedAt}', to_jsonb(now()::text), true);
  update public.player_workshop_storage set data = v_storage, updated_at = now() where player_id = p_player_id;
  delete from public.app_items where id = p_item_id;
  update public.player_equipment_slots
    set data = coalesce((select jsonb_object_agg(key, value) from jsonb_each(data) where value->>'itemId' is distinct from p_item_id), '{}'::jsonb), updated_at = now()
    where player_id = p_player_id;
  insert into public.app_workshop_ledger(id, player_id, build_id, action, data)
    values (p_ledger_id, p_player_id, null, 'scrapped', p_ledger_data);
  return jsonb_build_object('storage', v_storage, 'itemId', p_item_id);
end;
$$;

create or replace function public.workshop_adjust_storage(
  p_player_id text,
  p_component_id text,
  p_delta integer,
  p_actor_id text,
  p_ledger_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_storage jsonb;
  v_available integer;
  v_next integer;
  v_ledger_data jsonb;
begin
  if p_component_id is null or btrim(p_component_id) = '' or p_delta = 0 then
    raise exception 'A component and non-zero adjustment are required';
  end if;
  insert into public.player_workshop_storage(player_id, data)
    values (p_player_id, jsonb_build_object('playerId', p_player_id, 'quantities', '{}'::jsonb))
    on conflict (player_id) do nothing;
  select data into v_storage from public.player_workshop_storage where player_id = p_player_id for update;
  v_available := coalesce((v_storage #>> array['quantities', p_component_id])::integer, 0);
  v_next := v_available + p_delta;
  if v_next < 0 then raise exception 'Component storage cannot go below zero'; end if;
  v_storage := jsonb_set(v_storage, array['quantities', p_component_id], to_jsonb(v_next), true);
  v_storage := jsonb_set(v_storage, '{updatedAt}', to_jsonb(now()::text), true);
  update public.player_workshop_storage set data = v_storage, updated_at = now() where player_id = p_player_id;
  v_ledger_data := jsonb_build_object(
    'id', p_ledger_id, 'playerId', p_player_id, 'buildId', '', 'action', 'storage-adjusted',
    'amount', 0, 'detail', format('%s component %s by %s.', case when p_delta > 0 then 'Added' else 'Removed' end, p_component_id, abs(p_delta)),
    'createdAt', now()::text, 'createdBy', p_actor_id
  );
  insert into public.app_workshop_ledger(id, player_id, build_id, action, data)
    values (p_ledger_id, p_player_id, null, 'storage-adjusted', v_ledger_data);
  return v_storage;
end;
$$;

revoke all on function public.workshop_complete_build(text, integer, text, bigint, jsonb, text, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.workshop_return_components(text, text, integer, text, jsonb, jsonb, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.workshop_scrap_existing_item(text, text, jsonb, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.workshop_adjust_storage(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.workshop_complete_build(text, integer, text, bigint, jsonb, text, jsonb, jsonb, text, jsonb) to service_role;
grant execute on function public.workshop_return_components(text, text, integer, text, jsonb, jsonb, text, text, text, jsonb) to service_role;
grant execute on function public.workshop_scrap_existing_item(text, text, jsonb, text, text, jsonb) to service_role;
grant execute on function public.workshop_adjust_storage(text, text, integer, text, text) to service_role;
