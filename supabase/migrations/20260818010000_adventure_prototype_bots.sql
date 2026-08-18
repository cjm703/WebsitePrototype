-- Reusable DM-controlled test players for the Adventure prototype.
-- These are not login accounts and can only be managed through the DM API.

create table if not exists public.adventure_prototype_bots (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 40),
  created_by text not null references public.app_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adventure_prototype_bots_updated_idx
  on public.adventure_prototype_bots(updated_at desc);

alter table public.adventure_prototype_bots enable row level security;
revoke all on table public.adventure_prototype_bots from anon, authenticated;
