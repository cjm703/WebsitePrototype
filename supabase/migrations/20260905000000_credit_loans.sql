create table if not exists public.player_credit_loans (
  player_id text primary key references public.app_players(id) on delete cascade,
  data jsonb not null default '{"offers":[],"loans":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists player_credit_loans_updated_at_idx
  on public.player_credit_loans(updated_at desc);

alter table public.player_credit_loans enable row level security;
revoke all on public.player_credit_loans from anon, authenticated;
grant all on public.player_credit_loans to service_role;
