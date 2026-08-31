insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'business-map-assets',
  'business-map-assets',
  true,
  10485760,
  array['image/gif', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.app_nexus_nomad_state replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_nexus_nomad_state'
  ) then
    alter publication supabase_realtime add table public.app_nexus_nomad_state;
  end if;
end
$$;

