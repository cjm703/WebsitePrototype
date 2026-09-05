-- Unified, server-authoritative Credits wallets and immutable transaction history.
-- Legacy Personal Funds and assigned items named exactly "Credits" are imported once.

create table if not exists public.player_credit_accounts (
  player_id text primary key references public.app_players(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0 and balance <= 9007199254740991),
  currency text not null default 'CR' check (currency = 'CR'),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_credit_transactions (
  id text primary key default gen_random_uuid()::text,
  player_id text not null references public.app_players(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  balance_before bigint not null check (balance_before >= 0),
  balance_after bigint not null check (balance_after >= 0),
  category text not null,
  source text not null,
  reason text not null,
  actor_id text not null,
  related_id text,
  idempotency_key text,
  reversal_of text references public.player_credit_transactions(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (balance_after = balance_before + amount)
);

create unique index if not exists player_credit_transactions_idempotency_idx
  on public.player_credit_transactions(idempotency_key)
  where idempotency_key is not null;
create unique index if not exists player_credit_transactions_reversal_idx
  on public.player_credit_transactions(reversal_of)
  where reversal_of is not null;
create index if not exists player_credit_transactions_player_created_idx
  on public.player_credit_transactions(player_id, created_at desc);
create index if not exists player_credit_transactions_source_idx
  on public.player_credit_transactions(source, created_at desc);

create table if not exists public.player_credit_migrations (
  player_id text primary key references public.app_players(id) on delete cascade,
  personal_funds_amount bigint not null default 0,
  inventory_credits_amount bigint not null default 0,
  migrated_at timestamptz not null default now()
);

create table if not exists public.commerce_credit_orders (
  id text primary key,
  player_id text not null references public.app_players(id) on delete cascade,
  idempotency_key text not null unique,
  total bigint not null check (total >= 0),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists commerce_credit_orders_player_created_idx
  on public.commerce_credit_orders(player_id, created_at desc);

alter table public.player_credit_accounts enable row level security;
alter table public.player_credit_transactions enable row level security;
alter table public.player_credit_migrations enable row level security;
alter table public.commerce_credit_orders enable row level security;
revoke all on public.player_credit_accounts from anon, authenticated;
revoke all on public.player_credit_transactions from anon, authenticated;
revoke all on public.player_credit_migrations from anon, authenticated;
revoke all on public.commerce_credit_orders from anon, authenticated;

-- Correct only the legacy stock description; custom DM-authored tag descriptions are preserved.
update public.app_tags
set data = jsonb_set(
  data,
  '{description}',
  to_jsonb('Marks a physical currency or token kept as inventory. Player Credits use the separate audited account balance.'::text),
  true
), updated_at = now()
where kind = 'item'
  and lower(trim(coalesce(data->>'name', ''))) = 'currency'
  and data->>'description' = 'Marks this item as a currency. Currency items appear in shop currency selectors and can be spent at shops. The item''s Quantity tag value represents the player''s balance.';

update public.app_tags
set data = jsonb_set(
  data,
  '{description}',
  to_jsonb('Tracks a numeric quantity for stackable items, physical tokens, and consumable counts.'::text),
  true
), updated_at = now()
where kind = 'item'
  and lower(trim(coalesce(data->>'name', ''))) = 'quantity'
  and data->>'description' = 'Tracks a numeric quantity for this item. Used for stackable items, currency balances, and consumable counts.';

-- Commerce now has one denomination. Preserve every product while normalizing its price label.
update public.app_commerce_shops shop
set data = jsonb_set(
  shop.data,
  '{items}',
  coalesce((
    select jsonb_agg(item.value || jsonb_build_object('currency', 'Credits') order by item.ordinality)
    from jsonb_array_elements(
      case when jsonb_typeof(shop.data->'items') = 'array' then shop.data->'items' else '[]'::jsonb end
    ) with ordinality item(value, ordinality)
  ), '[]'::jsonb),
  true
) || jsonb_build_object(
  'revision', case when coalesce(shop.data->>'revision', '') ~ '^[0-9]+$' then (shop.data->>'revision')::integer else 0 end
), updated_at = now();

-- Build one opening balance per player. Original JSON and item rows are intentionally retained.
with legacy_personal_rows as (
  select
    fund.value->>'playerId' as player_id,
    greatest(0::numeric, case
      when coalesce(fund.value->>'balance', '') ~ '^-?[0-9]{1,16}$' then (fund.value->>'balance')::numeric
      else 0
    end) as amount
  from public.app_nexus_nomad_state office
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(office.data->'personalFunds') = 'array' then office.data->'personalFunds' else '[]'::jsonb end
  ) fund(value)
  where office.id = 'default'
),
legacy_personal as (
  select player_id, least(9007199254740991::numeric, sum(amount))::bigint as amount
  from legacy_personal_rows
  where nullif(trim(coalesce(player_id, '')), '') is not null
  group by player_id
),
legacy_managed_inventory as (
  select
    player.id as player_id,
    coalesce(sum(greatest(0::numeric, case
      when coalesce(item.data #>> '{customFields,Quantity::Amount}', '') ~ '^-?[0-9]{1,16}$'
        then (item.data #>> '{customFields,Quantity::Amount}')::numeric
      else 0
    end)), 0) as amount
  from public.app_players player
  join public.app_items item
    on lower(trim(coalesce(item.data->>'name', ''))) = 'credits'
   and jsonb_typeof(item.data->'assignedTo') = 'array'
   and ((item.data->'assignedTo') ? player.id or (item.data->'assignedTo') ? 'all')
  where player.id <> 'dm'
  group by player.id
),
legacy_quick_inventory as (
  select
    row.player_id,
    coalesce(sum(greatest(0::numeric, case
      when coalesce(item.value->>'qty', '') ~ '^-?[0-9]{1,16}$' then (item.value->>'qty')::numeric
      else 0
    end)), 0) as amount
  from public.player_quick_items row
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(row.data) = 'array' then row.data else '[]'::jsonb end
  ) item(value)
  where row.player_id <> 'dm'
    and lower(trim(coalesce(item.value->>'name', ''))) = 'credits'
  group by row.player_id
),
legacy_inventory as (
  select player_id, least(9007199254740991::numeric, sum(amount))::bigint as amount
  from (
    select player_id, amount from legacy_managed_inventory
    union all
    select player_id, amount from legacy_quick_inventory
  ) sources
  group by player_id
),
opening as (
  select
    player.id as player_id,
    coalesce(personal.amount, 0)::bigint as personal_amount,
    coalesce(inventory.amount, 0)::bigint as inventory_amount
  from public.app_players player
  left join legacy_personal personal on personal.player_id = player.id
  left join legacy_inventory inventory on inventory.player_id = player.id
  where player.id <> 'dm'
),
inserted_migrations as (
  insert into public.player_credit_migrations(player_id, personal_funds_amount, inventory_credits_amount)
  select player_id, personal_amount, inventory_amount from opening
  on conflict (player_id) do nothing
  returning player_id, personal_funds_amount, inventory_credits_amount
),
inserted_accounts as (
  insert into public.player_credit_accounts(player_id, balance)
  select player_id, least(9007199254740991::numeric, personal_funds_amount::numeric + inventory_credits_amount::numeric)::bigint
  from inserted_migrations
  on conflict (player_id) do nothing
  returning player_id, balance
)
insert into public.player_credit_transactions(
  id, player_id, amount, balance_before, balance_after, category, source,
  reason, actor_id, idempotency_key, metadata
)
select
  'credits-opening-' || account.player_id,
  account.player_id,
  account.balance,
  0,
  account.balance,
  'migration',
  'legacy-migration',
  'Opening balance migrated from legacy money systems.',
  'system',
  'unified-credits-v1:' || account.player_id,
  jsonb_build_object(
    'personalFunds', migration.personal_funds_amount,
    'inventoryCredits', migration.inventory_credits_amount
  )
from inserted_accounts account
join inserted_migrations migration on migration.player_id = account.player_id
where account.balance > 0
on conflict do nothing;

create or replace function public.prevent_credit_transaction_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Credit audit transactions are immutable; create a reversal instead';
end;
$$;

drop trigger if exists prevent_credit_transaction_mutation on public.player_credit_transactions;
create trigger prevent_credit_transaction_mutation
before update or delete on public.player_credit_transactions
for each row execute function public.prevent_credit_transaction_mutation();

create or replace function public.ensure_player_credit_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id <> 'dm' then
    insert into public.player_credit_accounts(player_id, balance)
    values (new.id, 0)
    on conflict (player_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_player_credit_account_after_insert on public.app_players;
create trigger ensure_player_credit_account_after_insert
after insert on public.app_players
for each row execute function public.ensure_player_credit_account();

create or replace function public.wallet_apply_transaction(
  p_player_id text,
  p_amount bigint,
  p_category text,
  p_source text,
  p_reason text,
  p_actor_id text,
  p_related_id text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.player_credit_accounts%rowtype;
  v_transaction public.player_credit_transactions%rowtype;
  v_after bigint;
begin
  if p_player_id is null or trim(p_player_id) = '' or p_player_id = 'dm' then
    raise exception 'A valid player account is required';
  end if;
  if p_amount = 0 then raise exception 'Credit transaction amount cannot be zero'; end if;
  if p_reason is null or length(trim(p_reason)) < 2 then raise exception 'A transaction reason is required'; end if;
  if p_amount < -1000000000000 or p_amount > 1000000000000 then raise exception 'Credit transaction amount is too large'; end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is not null then
    select * into v_transaction
    from public.player_credit_transactions
    where idempotency_key = trim(p_idempotency_key);
    if found then
      if v_transaction.player_id <> p_player_id
        or v_transaction.amount <> p_amount
        or v_transaction.source <> coalesce(nullif(trim(p_source), ''), 'manual')
        or coalesce(v_transaction.related_id, '') <> coalesce(nullif(left(trim(coalesce(p_related_id, '')), 160), ''), '') then
        raise exception 'Credit request key is already in use for a different transaction';
      end if;
      select * into v_account from public.player_credit_accounts where player_id = v_transaction.player_id;
      return jsonb_build_object('account', to_jsonb(v_account), 'transaction', to_jsonb(v_transaction), 'duplicate', true);
    end if;
  end if;

  insert into public.player_credit_accounts(player_id, balance)
  values (p_player_id, 0)
  on conflict (player_id) do nothing;
  select * into v_account
  from public.player_credit_accounts
  where player_id = p_player_id
  for update;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is not null then
    select * into v_transaction
    from public.player_credit_transactions
    where idempotency_key = trim(p_idempotency_key);
    if found then
      if v_transaction.player_id <> p_player_id
        or v_transaction.amount <> p_amount
        or v_transaction.source <> coalesce(nullif(trim(p_source), ''), 'manual')
        or coalesce(v_transaction.related_id, '') <> coalesce(nullif(left(trim(coalesce(p_related_id, '')), 160), ''), '') then
        raise exception 'Credit request key is already in use for a different transaction';
      end if;
      return jsonb_build_object('account', to_jsonb(v_account), 'transaction', to_jsonb(v_transaction), 'duplicate', true);
    end if;
  end if;

  v_after := v_account.balance + p_amount;
  if v_after < 0 then
    raise exception 'Insufficient Credits. Available: % CR; required: % CR.', v_account.balance, abs(p_amount);
  end if;
  if v_after > 9007199254740991 then raise exception 'Credit balance exceeds the supported maximum'; end if;

  update public.player_credit_accounts
  set balance = v_after, currency = 'CR', updated_at = now()
  where player_id = p_player_id
  returning * into v_account;

  insert into public.player_credit_transactions(
    player_id, amount, balance_before, balance_after, category, source, reason,
    actor_id, related_id, idempotency_key, metadata
  ) values (
    p_player_id,
    p_amount,
    v_account.balance - p_amount,
    v_account.balance,
    left(coalesce(nullif(trim(p_category), ''), 'adjustment'), 60),
    left(coalesce(nullif(trim(p_source), ''), 'manual'), 80),
    left(trim(p_reason), 500),
    left(coalesce(nullif(trim(p_actor_id), ''), 'system'), 120),
    nullif(left(trim(coalesce(p_related_id, '')), 160), ''),
    nullif(left(trim(coalesce(p_idempotency_key, '')), 200), ''),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_transaction;

  return jsonb_build_object('account', to_jsonb(v_account), 'transaction', to_jsonb(v_transaction), 'duplicate', false);
end;
$$;

-- Profiles created after this migration can still import pre-unification money once.
create or replace function public.wallet_migrate_player_legacy(
  p_player_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.player_credit_accounts%rowtype;
  v_personal numeric := 0;
  v_managed numeric := 0;
  v_quick numeric := 0;
  v_inventory bigint := 0;
  v_discovered bigint := 0;
  v_applied bigint := 0;
  v_before bigint := 0;
begin
  if p_player_id is null or trim(p_player_id) = '' or p_player_id = 'dm' then
    raise exception 'A valid player account is required';
  end if;
  if not exists (select 1 from public.app_players where id = p_player_id) then
    raise exception 'Player account was not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('credits-migration:' || p_player_id, 0));
  insert into public.player_credit_accounts(player_id, balance)
  values (p_player_id, 0)
  on conflict (player_id) do nothing;
  select * into v_account from public.player_credit_accounts where player_id = p_player_id for update;

  if exists (select 1 from public.player_credit_migrations where player_id = p_player_id) then
    return jsonb_build_object('account', to_jsonb(v_account), 'migrated', false);
  end if;

  select coalesce(sum(greatest(0::numeric, case
    when coalesce(fund.value->>'balance', '') ~ '^-?[0-9]{1,16}$' then (fund.value->>'balance')::numeric
    else 0
  end)), 0)
  into v_personal
  from public.app_nexus_nomad_state office
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(office.data->'personalFunds') = 'array' then office.data->'personalFunds' else '[]'::jsonb end
  ) fund(value)
  where office.id = 'default' and fund.value->>'playerId' = p_player_id;

  select coalesce(sum(greatest(0::numeric, case
    when coalesce(item.data #>> '{customFields,Quantity::Amount}', '') ~ '^-?[0-9]{1,16}$'
      then (item.data #>> '{customFields,Quantity::Amount}')::numeric
    else 0
  end)), 0)
  into v_managed
  from public.app_items item
  where lower(trim(coalesce(item.data->>'name', ''))) = 'credits'
    and jsonb_typeof(item.data->'assignedTo') = 'array'
    and ((item.data->'assignedTo') ? p_player_id or (item.data->'assignedTo') ? 'all');

  select coalesce(sum(greatest(0::numeric, case
    when coalesce(item.value->>'qty', '') ~ '^-?[0-9]{1,16}$' then (item.value->>'qty')::numeric
    else 0
  end)), 0)
  into v_quick
  from public.player_quick_items row
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(row.data) = 'array' then row.data else '[]'::jsonb end
  ) item(value)
  where row.player_id = p_player_id
    and lower(trim(coalesce(item.value->>'name', ''))) = 'credits';

  v_personal := least(9007199254740991::numeric, v_personal);
  v_inventory := least(9007199254740991::numeric, v_managed + v_quick)::bigint;
  v_discovered := least(9007199254740991::numeric, v_personal + v_inventory::numeric)::bigint;
  insert into public.player_credit_migrations(player_id, personal_funds_amount, inventory_credits_amount)
  values (p_player_id, v_personal::bigint, v_inventory);

  v_before := v_account.balance;
  v_applied := least(v_discovered::numeric, 9007199254740991::numeric - v_before::numeric)::bigint;
  if v_applied > 0 then
    update public.player_credit_accounts
    set balance = v_before + v_applied, currency = 'CR', updated_at = now()
    where player_id = p_player_id
    returning * into v_account;
    insert into public.player_credit_transactions(
      id, player_id, amount, balance_before, balance_after, category, source,
      reason, actor_id, idempotency_key, metadata
    ) values (
      'credits-opening-' || p_player_id,
      p_player_id,
      v_applied,
      v_before,
      v_before + v_applied,
      'migration',
      'legacy-migration',
      'Opening balance migrated from legacy money systems.',
      'system',
      'unified-credits-v1:' || p_player_id,
      jsonb_build_object('personalFunds', v_personal::bigint, 'inventoryCredits', v_inventory, 'discovered', v_discovered)
    );
  end if;

  return jsonb_build_object('account', to_jsonb(v_account), 'migrated', true, 'applied', v_applied);
end;
$$;

create or replace function public.wallet_reverse_transaction(
  p_transaction_id text,
  p_actor_id text,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.player_credit_transactions%rowtype;
  v_existing public.player_credit_transactions%rowtype;
  v_account public.player_credit_accounts%rowtype;
  v_after bigint;
begin
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is not null then
    select * into v_existing from public.player_credit_transactions where idempotency_key = trim(p_idempotency_key);
    if found then
      if v_existing.reversal_of is distinct from p_transaction_id then
        raise exception 'Credit request key is already in use for a different reversal';
      end if;
      select * into v_account from public.player_credit_accounts where player_id = v_existing.player_id;
      return jsonb_build_object('account', to_jsonb(v_account), 'transaction', to_jsonb(v_existing), 'duplicate', true);
    end if;
  end if;

  select * into v_original
  from public.player_credit_transactions
  where id = p_transaction_id
  for update;
  if not found then raise exception 'Credit transaction was not found'; end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is not null then
    select * into v_existing from public.player_credit_transactions where idempotency_key = trim(p_idempotency_key);
    if found then
      if v_existing.reversal_of is distinct from p_transaction_id then
        raise exception 'Credit request key is already in use for a different reversal';
      end if;
      select * into v_account from public.player_credit_accounts where player_id = v_existing.player_id;
      return jsonb_build_object('account', to_jsonb(v_account), 'transaction', to_jsonb(v_existing), 'duplicate', true);
    end if;
  end if;

  if v_original.reversal_of is not null then raise exception 'A reversal transaction cannot be reversed'; end if;
  if exists (select 1 from public.player_credit_transactions where reversal_of = v_original.id) then
    raise exception 'That transaction has already been reversed';
  end if;

  select * into v_account
  from public.player_credit_accounts
  where player_id = v_original.player_id
  for update;
  v_after := v_account.balance - v_original.amount;
  if v_after < 0 then raise exception 'This reversal would make the player balance negative'; end if;

  update public.player_credit_accounts
  set balance = v_after, updated_at = now()
  where player_id = v_original.player_id
  returning * into v_account;

  insert into public.player_credit_transactions(
    player_id, amount, balance_before, balance_after, category, source, reason,
    actor_id, related_id, idempotency_key, reversal_of, metadata
  ) values (
    v_original.player_id,
    -v_original.amount,
    v_account.balance + v_original.amount,
    v_account.balance,
    'reversal',
    'dm-reversal',
    left(trim(coalesce(nullif(p_reason, ''), 'DM reversal: ' || v_original.reason)), 500),
    p_actor_id,
    v_original.related_id,
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    v_original.id,
    jsonb_build_object('originalCategory', v_original.category, 'originalSource', v_original.source)
  ) returning * into v_existing;

  return jsonb_build_object('account', to_jsonb(v_account), 'transaction', to_jsonb(v_existing), 'duplicate', false);
end;
$$;

-- Trusted Edge Function helper: commits an office-state revision and its wallet transfer together.
create or replace function public.wallet_commit_office_state(
  p_expected_revision integer,
  p_next_state jsonb,
  p_player_id text,
  p_amount bigint,
  p_expected_balance bigint,
  p_category text,
  p_source text,
  p_reason text,
  p_actor_id text,
  p_related_id text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office public.app_nexus_nomad_state%rowtype;
  v_account public.player_credit_accounts%rowtype;
  v_wallet jsonb := null;
begin
  select * into v_office from public.app_nexus_nomad_state where id = 'default' for update;
  if not found then raise exception 'Office state is not available'; end if;
  if coalesce((v_office.data->>'revision')::integer, 0) <> p_expected_revision then
    raise exception 'Office state changed in another session';
  end if;

  if p_amount <> 0 then
    insert into public.player_credit_accounts(player_id, balance) values (p_player_id, 0) on conflict (player_id) do nothing;
    select * into v_account from public.player_credit_accounts where player_id = p_player_id for update;
    if p_expected_balance is not null and v_account.balance <> p_expected_balance then
      raise exception 'Player Credits changed in another session';
    end if;
    v_wallet := public.wallet_apply_transaction(
      p_player_id, p_amount, p_category, p_source, p_reason, p_actor_id,
      p_related_id, p_idempotency_key, p_metadata
    );
  end if;

  update public.app_nexus_nomad_state
  set data = p_next_state, updated_at = now()
  where id = 'default';
  return jsonb_build_object('state', p_next_state, 'wallet', v_wallet);
end;
$$;

create or replace function public.wallet_commerce_purchase(
  p_player_id text,
  p_buyer_name text,
  p_cart jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_order public.commerce_credit_orders%rowtype;
  v_account public.player_credit_accounts%rowtype;
  v_shop_id text;
  v_shop jsonb;
  v_items jsonb;
  v_cart_line jsonb;
  v_item jsonb;
  v_item_index integer;
  v_quantity integer;
  v_stock integer;
  v_price bigint;
  v_limit integer;
  v_prior_quantity integer;
  v_total bigint := 0;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_wallet jsonb := null;
  v_order_id text := 'commerce-order-' || gen_random_uuid()::text;
  v_ledger_id text;
  v_template jsonb;
  v_template_id text;
  v_grant_id text;
  v_grant_quantity integer;
  v_custom_fields jsonb;
  v_tags jsonb;
  v_granted_item jsonb;
  v_granted_items jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_player_id is null or trim(p_player_id) = '' or p_player_id = 'dm' then raise exception 'A valid player account is required'; end if;
  if jsonb_typeof(p_cart) <> 'array' or jsonb_array_length(p_cart) = 0 then raise exception 'The cart is empty'; end if;
  if jsonb_array_length(p_cart) > 100 then raise exception 'The cart contains too many lines'; end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then raise exception 'A purchase request key is required'; end if;

  select * into v_existing_order from public.commerce_credit_orders where idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing_order.player_id <> p_player_id then raise exception 'Commerce request key is already in use'; end if;
    return v_existing_order.data || jsonb_build_object('duplicate', true);
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_cart) line(value)
    group by line.value->>'shopId', line.value->>'itemId'
    having count(*) > 1
  ) then raise exception 'Duplicate cart lines are not allowed'; end if;

  insert into public.player_credit_accounts(player_id, balance) values (p_player_id, 0) on conflict (player_id) do nothing;
  select * into v_account from public.player_credit_accounts where player_id = p_player_id for update;

  select * into v_existing_order from public.commerce_credit_orders where idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing_order.player_id <> p_player_id then raise exception 'Commerce request key is already in use'; end if;
    return v_existing_order.data || jsonb_build_object('duplicate', true);
  end if;

  for v_shop_id in
    select distinct line.value->>'shopId'
    from jsonb_array_elements(p_cart) line(value)
    order by 1
  loop
    if nullif(trim(coalesce(v_shop_id, '')), '') is null then raise exception 'A cart line is missing its shop'; end if;
    select data into v_shop from public.app_commerce_shops where id = v_shop_id for update;
    if not found then raise exception 'A shop in this cart no longer exists'; end if;
    if coalesce((v_shop->>'hidden')::boolean, false) then raise exception 'A shop in this cart is unavailable'; end if;
    if coalesce(v_shop->>'status', 'Open') = 'Closed' then raise exception 'A shop in this cart is closed'; end if;
    v_items := case when jsonb_typeof(v_shop->'items') = 'array' then v_shop->'items' else '[]'::jsonb end;

    for v_cart_line in
      select line.value
      from jsonb_array_elements(p_cart) line(value)
      where line.value->>'shopId' = v_shop_id
    loop
      v_quantity := greatest(0, least(999, coalesce((v_cart_line->>'quantity')::integer, 0)));
      if v_quantity < 1 then raise exception 'Purchase quantities must be at least one'; end if;
      v_item := null;
      v_item_index := null;
      select entry.value, (entry.ordinality - 1)::integer
      into v_item, v_item_index
      from jsonb_array_elements(v_items) with ordinality entry(value, ordinality)
      where entry.value->>'id' = v_cart_line->>'itemId'
      limit 1;
      if v_item is null then raise exception 'An item in this cart no longer exists'; end if;
      if coalesce((v_item->>'hidden')::boolean, false) then raise exception 'An item in this cart is unavailable'; end if;
      if lower(coalesce(v_item->>'currency', 'credits')) not in ('credits', 'cr') then
        raise exception 'Commerce items must use Credits';
      end if;

      v_price := greatest(0, coalesce((v_item->>'price')::bigint, 0));
      if v_price > (9007199254740991::bigint / v_quantity) then raise exception 'Purchase line total is too large'; end if;
      v_stock := coalesce((v_item->>'quantity')::integer, -1);
      if v_stock >= 0 and v_stock < v_quantity then raise exception 'Not enough stock remains for %', coalesce(v_item->>'name', 'this item'); end if;
      if v_stock >= 0 then
        v_items := jsonb_set(v_items, array[v_item_index::text, 'quantity'], to_jsonb(v_stock - v_quantity), false);
      end if;

      v_limit := greatest(0, coalesce((v_item->>'purchaseLimit')::integer, 0));
      if v_limit > 0 then
        select coalesce(sum(case when coalesce(row.data->>'quantity', '') ~ '^[0-9]+$' then (row.data->>'quantity')::integer else 0 end), 0)
        into v_prior_quantity
        from public.app_commerce_ledger row
        where row.data->>'buyerId' = p_player_id
          and row.data->>'shopId' = v_shop_id
          and row.data->>'itemId' = v_item->>'id';
        if v_prior_quantity + v_quantity > v_limit then raise exception 'Purchase limit reached for %', coalesce(v_item->>'name', 'this item'); end if;
      end if;

      if v_total + (v_price * v_quantity) > 9007199254740991 then raise exception 'Purchase total is too large'; end if;
      v_total := v_total + (v_price * v_quantity);
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'shopId', v_shop_id,
        'shopName', coalesce(v_shop->>'name', 'Shop'),
        'itemId', v_item->>'id',
        'itemName', coalesce(v_item->>'name', 'Item'),
        'quantity', v_quantity,
        'unitPrice', v_price,
        'lineTotal', v_price * v_quantity,
        'item', v_item
      ));
    end loop;

    v_shop := jsonb_set(v_shop, '{items}', v_items, true) || jsonb_build_object(
      'revision', greatest(0, case when coalesce(v_shop->>'revision', '') ~ '^[0-9]+$' then (v_shop->>'revision')::integer else 0 end) + 1,
      'updatedAt', now()::text,
      'updatedBy', 'commerce'
    );
    update public.app_commerce_shops set data = v_shop, updated_at = now() where id = v_shop_id;
  end loop;

  if v_account.balance < v_total then
    raise exception 'Insufficient Credits. Available: % CR; required: % CR.', v_account.balance, v_total;
  end if;

  if v_total > 0 then
    v_wallet := public.wallet_apply_transaction(
      p_player_id,
      -v_total,
      'purchase',
      'commerce',
      'Commerce purchase',
      p_player_id,
      v_order_id,
      'commerce:' || trim(p_idempotency_key),
      jsonb_build_object('lines', v_lines)
    );
  end if;

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    v_ledger_id := 'commerce-ledger-' || gen_random_uuid()::text;
    insert into public.app_commerce_ledger(id, data, updated_at)
    values (
      v_ledger_id,
      jsonb_build_object(
        'id', v_ledger_id,
        'orderId', v_order_id,
        'shopId', v_line->>'shopId',
        'shopName', v_line->>'shopName',
        'itemId', v_line->>'itemId',
        'itemName', v_line->>'itemName',
        'quantity', (v_line->>'quantity')::integer,
        'unitPrice', (v_line->>'unitPrice')::bigint,
        'currency', 'Credits',
        'buyerName', left(coalesce(p_buyer_name, p_player_id), 160),
        'buyerId', p_player_id,
        'timestamp', floor(extract(epoch from clock_timestamp()) * 1000)
      ),
      now()
    );

    if coalesce(((v_line->'item')->>'addsToInventory')::boolean, false) then
      v_template_id := nullif(trim(coalesce((v_line->'item')->>'inventoryItemId', '')), '');
      v_template := null;
      if v_template_id is not null then
        select data into v_template from public.app_items where id = v_template_id;
      end if;
      if v_template is null then
        v_template := jsonb_build_object(
          'name', v_line->>'itemName',
          'description', coalesce((v_line->'item')->>'description', ''),
          'rarity', coalesce((v_line->'item')->>'rarity', 'Common'),
          'type', coalesce((v_line->'item')->>'category', 'Item'),
          'tags', '[]'::jsonb,
          'customFields', '{}'::jsonb,
          'weightTier', 'M',
          'weightValue', 1
        );
      end if;
      if lower(trim(coalesce(v_template->>'name', v_line->>'itemName', ''))) = 'credits' then
        raise exception 'Credits cannot be delivered as an inventory item';
      end if;

      v_grant_quantity := greatest(1, coalesce((nullif((v_line->'item')->>'inventoryQuantity', ''))::integer, 1)) * (v_line->>'quantity')::integer;
      v_custom_fields := case when jsonb_typeof(v_template->'customFields') = 'object' then v_template->'customFields' else '{}'::jsonb end;
      v_tags := case when jsonb_typeof(v_template->'tags') = 'array' then v_template->'tags' else '[]'::jsonb end;
      if v_grant_quantity > 1 or v_tags ? 'Quantity' then
        if not (v_tags ? 'Quantity') then v_tags := v_tags || '["Quantity"]'::jsonb; end if;
        v_custom_fields := jsonb_set(v_custom_fields, array['Quantity::Amount'], to_jsonb(v_grant_quantity::text), true);
      end if;

      v_grant_id := 'commerce-item-' || gen_random_uuid()::text;
      v_granted_item := v_template || jsonb_build_object(
        'id', v_grant_id,
        'assignedTo', jsonb_build_array(p_player_id),
        'duplicatedFrom', coalesce(v_template->>'name', v_line->>'itemName'),
        'tags', v_tags,
        'customFields', v_custom_fields
      );
      insert into public.app_items(id, data, updated_at) values (v_grant_id, v_granted_item, now());
      v_granted_items := v_granted_items || jsonb_build_array(v_granted_item);
    end if;
  end loop;

  select * into v_account from public.player_credit_accounts where player_id = p_player_id;
  v_result := jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'orderId', v_order_id,
    'total', v_total,
    'account', to_jsonb(v_account),
    'transaction', v_wallet->'transaction',
    'lines', v_lines,
    'grantedItems', v_granted_items
  );
  insert into public.commerce_credit_orders(id, player_id, idempotency_key, total, data)
  values (v_order_id, p_player_id, trim(p_idempotency_key), v_total, v_result);
  return v_result;
end;
$$;

-- Catalog edits use optimistic revisions so a DM save cannot restore stock sold concurrently.
create or replace function public.wallet_save_commerce_catalog(
  p_changes jsonb,
  p_deletions jsonb,
  p_actor_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
  v_id text;
  v_expected integer;
  v_current public.app_commerce_shops%rowtype;
  v_revision integer;
  v_next jsonb;
  v_shops jsonb;
begin
  if jsonb_typeof(coalesce(p_changes, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_deletions, '[]'::jsonb)) <> 'array' then
    raise exception 'Commerce catalog changes must be arrays';
  end if;
  if jsonb_array_length(coalesce(p_changes, '[]'::jsonb)) > 500
    or jsonb_array_length(coalesce(p_deletions, '[]'::jsonb)) > 500 then
    raise exception 'Commerce catalog update is too large';
  end if;
  if exists (
    select 1 from (
      select value->>'id' as id from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb))
      union all
      select value->>'id' as id from jsonb_array_elements(coalesce(p_deletions, '[]'::jsonb))
    ) entries
    group by id having count(*) > 1
  ) then raise exception 'Commerce catalog contains duplicate changes'; end if;

  for v_id in
    select id from (
      select value->>'id' as id from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb))
      union
      select value->>'id' as id from jsonb_array_elements(coalesce(p_deletions, '[]'::jsonb))
    ) entries
    where nullif(trim(coalesce(id, '')), '') is not null
    order by id
  loop
    perform 1 from public.app_commerce_shops where id = v_id for update;
  end loop;

  for v_entry in select value from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb))
  loop
    v_id := trim(coalesce(v_entry->>'id', ''));
    if v_id = '' then raise exception 'A Commerce shop is missing its ID'; end if;
    v_entry := jsonb_set(
      v_entry,
      '{items}',
      coalesce((
        select jsonb_agg(item.value || jsonb_build_object('currency', 'Credits') order by item.ordinality)
        from jsonb_array_elements(
          case when jsonb_typeof(v_entry->'items') = 'array' then v_entry->'items' else '[]'::jsonb end
        ) with ordinality item(value, ordinality)
      ), '[]'::jsonb),
      true
    );
    v_expected := greatest(0, case when coalesce(v_entry->>'revision', '') ~ '^[0-9]+$' then (v_entry->>'revision')::integer else 0 end);
    select * into v_current from public.app_commerce_shops where id = v_id;
    if found then
      v_revision := greatest(0, case when coalesce(v_current.data->>'revision', '') ~ '^[0-9]+$' then (v_current.data->>'revision')::integer else 0 end);
      if v_revision <> v_expected then raise exception 'COMMERCE_CATALOG_CONFLICT:%', v_id; end if;
      v_next := (v_entry - 'revision' - 'updatedAt' - 'updatedBy') || jsonb_build_object(
        'id', v_id,
        'revision', v_revision + 1,
        'updatedAt', now()::text,
        'updatedBy', p_actor_id
      );
      update public.app_commerce_shops set data = v_next, updated_at = now() where id = v_id;
    else
      if v_expected <> 0 then raise exception 'COMMERCE_CATALOG_CONFLICT:%', v_id; end if;
      v_next := (v_entry - 'revision' - 'updatedAt' - 'updatedBy') || jsonb_build_object(
        'id', v_id,
        'revision', 1,
        'updatedAt', now()::text,
        'updatedBy', p_actor_id
      );
      insert into public.app_commerce_shops(id, data, updated_at) values (v_id, v_next, now());
    end if;
  end loop;

  for v_entry in select value from jsonb_array_elements(coalesce(p_deletions, '[]'::jsonb))
  loop
    v_id := trim(coalesce(v_entry->>'id', ''));
    v_expected := greatest(0, case when coalesce(v_entry->>'revision', '') ~ '^[0-9]+$' then (v_entry->>'revision')::integer else 0 end);
    select * into v_current from public.app_commerce_shops where id = v_id;
    if not found then continue; end if;
    v_revision := greatest(0, case when coalesce(v_current.data->>'revision', '') ~ '^[0-9]+$' then (v_current.data->>'revision')::integer else 0 end);
    if v_revision <> v_expected then raise exception 'COMMERCE_CATALOG_CONFLICT:%', v_id; end if;
    delete from public.app_commerce_shops where id = v_id;
  end loop;

  select coalesce(jsonb_agg(row.data || jsonb_build_object('id', row.id) order by row.updated_at desc), '[]'::jsonb)
  into v_shops
  from public.app_commerce_shops row;
  return jsonb_build_object('shops', v_shops);
end;
$$;

-- Workshop completion now charges the same Credits wallet in the existing atomic transaction.
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
  v_storage jsonb;
  v_component_id text;
  v_delta integer;
  v_available integer;
  v_wallet jsonb := null;
  v_balance bigint;
begin
  if p_total_cost < 0 then raise exception 'Construction cost cannot be negative'; end if;
  select * into v_build from public.app_workshop_builds where id = p_build_id for update;
  if not found then raise exception 'Workshop build was not found'; end if;
  if v_build.status <> 'building' then raise exception 'Only Building work orders can be completed'; end if;
  if v_build.revision <> p_expected_revision then raise exception 'Workshop build changed on another client'; end if;

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

  if p_total_cost > 0 then
    v_wallet := public.wallet_apply_transaction(
      v_build.player_id,
      -p_total_cost,
      'construction',
      'workshop',
      coalesce(nullif(p_build_data->>'name', ''), 'Workshop construction') || ' completed',
      p_dm_id,
      p_build_id,
      'workshop-complete:' || p_build_id || ':' || (p_expected_revision + 1)::text,
      jsonb_build_object('buildId', p_build_id, 'itemId', p_item_id)
    );
  end if;

  update public.player_workshop_storage set data = v_storage, updated_at = now() where player_id = v_build.player_id;
  insert into public.app_items(id, data, updated_at) values (p_item_id, p_item_data, now())
    on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;
  update public.app_workshop_builds set status = 'completed', revision = p_expected_revision + 1, data = p_build_data, updated_at = now() where id = p_build_id;
  insert into public.app_workshop_ledger(id, player_id, build_id, action, data)
    values (p_ledger_id, v_build.player_id, p_build_id, 'completed', p_ledger_data);
  select balance into v_balance from public.player_credit_accounts where player_id = v_build.player_id;
  return jsonb_build_object('build', p_build_data, 'storage', v_storage, 'personalFunds', v_balance, 'credits', v_balance, 'item', p_item_data, 'creditTransaction', v_wallet->'transaction');
end;
$$;

revoke all on function public.wallet_apply_transaction(text, bigint, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.wallet_migrate_player_legacy(text) from public, anon, authenticated;
revoke all on function public.wallet_reverse_transaction(text, text, text, text) from public, anon, authenticated;
revoke all on function public.wallet_commit_office_state(integer, jsonb, text, bigint, bigint, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.wallet_commerce_purchase(text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.wallet_save_commerce_catalog(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.workshop_complete_build(text, integer, text, bigint, jsonb, text, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.wallet_apply_transaction(text, bigint, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.wallet_migrate_player_legacy(text) to service_role;
grant execute on function public.wallet_reverse_transaction(text, text, text, text) to service_role;
grant execute on function public.wallet_commit_office_state(integer, jsonb, text, bigint, bigint, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.wallet_commerce_purchase(text, text, jsonb, text) to service_role;
grant execute on function public.wallet_save_commerce_catalog(jsonb, jsonb, text) to service_role;
grant execute on function public.workshop_complete_build(text, integer, text, bigint, jsonb, text, jsonb, jsonb, text, jsonb) to service_role;
revoke all on function public.prevent_credit_transaction_mutation() from public, anon, authenticated;
