-- DM-facing storage telemetry. The browser cannot call this function directly;
-- only the service role used by the application Edge Function may execute it.
create or replace function public.app_system_storage_status()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with table_stats as (
    select
      c.relname as table_name,
      pg_total_relation_size(c.oid) as total_bytes,
      greatest(c.reltuples::bigint, 0) as estimated_rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
    order by pg_total_relation_size(c.oid) desc
  )
  select jsonb_build_object(
    'databaseBytes', pg_database_size(current_database()),
    'tables', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', table_name,
          'bytes', total_bytes,
          'estimatedRows', estimated_rows
        )
        order by total_bytes desc
      ),
      '[]'::jsonb
    )
  )
  from table_stats;
$$;

revoke all on function public.app_system_storage_status() from public, anon, authenticated;
grant execute on function public.app_system_storage_status() to service_role;
