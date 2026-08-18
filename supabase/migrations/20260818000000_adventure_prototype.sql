-- Minimal multiplayer Adventure rooms. The browser uses application sessions,
-- so rows remain private and all reads/writes flow through the Edge Function.

create table if not exists public.adventure_prototype_rooms (
  id uuid primary key,
  host_player_id text not null references public.app_players(id) on delete cascade,
  invited_player_ids text[] not null default '{}',
  status text not null check (status in ('lobby', 'active', 'completed', 'closed')),
  version integer not null default 1 check (version > 0),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adventure_prototype_rooms_host_updated_idx
  on public.adventure_prototype_rooms(host_player_id, updated_at desc);

create index if not exists adventure_prototype_rooms_invited_idx
  on public.adventure_prototype_rooms using gin(invited_player_ids);

create index if not exists adventure_prototype_rooms_status_updated_idx
  on public.adventure_prototype_rooms(status, updated_at desc);

alter table public.adventure_prototype_rooms enable row level security;
revoke all on table public.adventure_prototype_rooms from anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.adventure_prototype_rooms;
exception
  when duplicate_object then null;
end $$;
