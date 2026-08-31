-- Adventure and its multiplayer prototype have been retired from the application.
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'adventure_prototype_rooms'
  ) then
    alter publication supabase_realtime drop table public.adventure_prototype_rooms;
  end if;
end
$$;

drop table if exists public.adventure_prototype_bots;
drop table if exists public.adventure_prototype_rooms;

delete from public.app_arcade_catalog_state where id = 'adventure-sessions';
