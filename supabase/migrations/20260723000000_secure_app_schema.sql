-- Reproducible application schema and security baseline.
-- This migration is additive: it creates missing objects and does not delete application rows.

create table if not exists public.app_players (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  token_hash text primary key,
  player_id text not null references public.app_players(id) on delete cascade,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists app_sessions_player_id_idx on public.app_sessions(player_id);
create index if not exists app_sessions_expires_at_idx on public.app_sessions(expires_at);

create table if not exists public.kv_store_8a5950b5 (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'app_deleted_players',
    'app_node_trees',
    'app_items',
    'app_cards',
    'app_infos',
    'app_info_subtabs',
    'app_notifications',
    'app_news',
    'app_sites',
    'app_custom_panel_styles',
    'app_nexus_nomad_state',
    'app_commerce_shops',
    'app_commerce_ledger',
    'app_campaign_timeline_state',
    'app_timeline_calendar_presets',
    'app_intelli_maps_state',
    'app_session_log_state',
    'app_session_player_notes',
    'app_party_color_state',
    'app_party_color_cursors',
    'app_calendar_weather_state',
    'app_dm_customize_state',
    'app_arcade_catalog_state',
    'app_arcade_leaderboard_state',
    'community_messages',
    'community_images',
    'community_npc_accounts',
    'community_custom_reactions',
    'app_metadata'
  ]
  loop
    execute format(
      'create table if not exists public.%I (
        id text primary key,
        data jsonb not null default ''{}''::jsonb,
        updated_at timestamptz not null default now()
      )',
      table_name
    );
    execute format(
      'create index if not exists %I on public.%I(updated_at desc)',
      table_name || '_updated_at_idx',
      table_name
    );
  end loop;
end $$;

create table if not exists public.app_tags (
  id text primary key,
  kind text not null check (kind in ('item', 'card', 'info', 'status', 'wiki')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists app_tags_kind_updated_at_idx
  on public.app_tags(kind, updated_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'player_quick_items',
    'player_source_usage_log',
    'player_activity_log',
    'player_skill_settings',
    'player_skill_proficiencies',
    'player_equipment_slots',
    'player_status_effects',
    'player_level_categories',
    'player_node_tree_unlocks',
    'player_commerce_cart',
    'player_customization',
    'player_wiki_editor_drafts',
    'player_placed_stickers',
    'player_arcade_profiles',
    'player_community_profile',
    'community_read_state'
  ]
  loop
    execute format(
      'create table if not exists public.%I (
        player_id text primary key references public.app_players(id) on delete cascade,
        data jsonb not null default ''{}''::jsonb,
        updated_at timestamptz not null default now()
      )',
      table_name
    );
  end loop;
end $$;

-- The browser authenticates with the application session token, not Supabase Auth.
-- All table access therefore flows through the service-role Edge Function.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'app_players',
    'app_sessions',
    'kv_store_8a5950b5',
    'app_deleted_players',
    'app_node_trees',
    'app_items',
    'app_cards',
    'app_infos',
    'app_info_subtabs',
    'app_notifications',
    'app_news',
    'app_sites',
    'app_custom_panel_styles',
    'app_nexus_nomad_state',
    'app_commerce_shops',
    'app_commerce_ledger',
    'app_campaign_timeline_state',
    'app_timeline_calendar_presets',
    'app_intelli_maps_state',
    'app_session_log_state',
    'app_session_player_notes',
    'app_party_color_state',
    'app_party_color_cursors',
    'app_calendar_weather_state',
    'app_dm_customize_state',
    'app_arcade_catalog_state',
    'app_arcade_leaderboard_state',
    'app_tags',
    'app_metadata',
    'community_messages',
    'community_images',
    'community_npc_accounts',
    'community_custom_reactions',
    'player_quick_items',
    'player_source_usage_log',
    'player_activity_log',
    'player_skill_settings',
    'player_skill_proficiencies',
    'player_equipment_slots',
    'player_status_effects',
    'player_level_categories',
    'player_node_tree_unlocks',
    'player_commerce_cart',
    'player_customization',
    'player_wiki_editor_drafts',
    'player_placed_stickers',
    'player_arcade_profiles',
    'player_community_profile',
    'community_read_state'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'combat-music',
  'combat-music',
  true,
  52428800,
  array[
    'audio/aac',
    'audio/flac',
    'audio/m4a',
    'audio/mp3',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wave',
    'audio/wav',
    'audio/webm',
    'audio/x-flac',
    'audio/x-m4a',
    'audio/x-wav'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "combat_music_upload" on storage.objects;
drop policy if exists "combat_music_delete" on storage.objects;
drop policy if exists "combat_music_read" on storage.objects;
create policy "combat_music_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'combat-music');

insert into public.app_metadata (id, data, updated_at)
values ('schema', '{"version": 1, "seedVersion": 0}'::jsonb, now())
on conflict (id) do nothing;
