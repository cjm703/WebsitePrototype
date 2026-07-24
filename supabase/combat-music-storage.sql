-- Run this in the Supabase SQL editor to enable permanent Combat music uploads.
-- This keeps the bucket public so player browsers can stream tracks directly.
-- Uploads and deletes go through the DM-authenticated Edge Function.

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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'combat_music_read'
  ) then
    create policy "combat_music_read"
      on storage.objects
      for select
      to anon
      using (bucket_id = 'combat-music');
  end if;

  drop policy if exists "combat_music_upload" on storage.objects;
  drop policy if exists "combat_music_delete" on storage.objects;
end $$;
