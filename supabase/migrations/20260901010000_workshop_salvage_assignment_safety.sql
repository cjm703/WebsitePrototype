-- Preserve other players' copies when a shared legacy item is salvaged.

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
  v_assigned jsonb;
  v_remaining jsonb;
  v_component_id text;
  v_count integer;
  v_available integer;
  v_is_assigned boolean := false;
begin
  select * into v_item from public.app_items where id = p_item_id for update;
  if not found then raise exception 'Item was not found'; end if;
  v_assigned := coalesce(v_item.data->'assignedTo', '[]'::jsonb);
  if jsonb_typeof(v_assigned) = 'array' then
    v_is_assigned := v_assigned ? p_player_id;
  elsif jsonb_typeof(v_assigned) = 'string' then
    v_is_assigned := trim(both '"' from v_assigned::text) = p_player_id;
  end if;
  if not v_is_assigned then raise exception 'That item is not assigned to this player'; end if;

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

  if jsonb_typeof(v_assigned) = 'array' and jsonb_array_length(v_assigned) > 1 then
    select coalesce(jsonb_agg(to_jsonb(assigned.value)), '[]'::jsonb)
      into v_remaining
      from jsonb_array_elements_text(v_assigned) as assigned(value)
      where assigned.value <> p_player_id;
    update public.app_items
      set data = jsonb_set(v_item.data, '{assignedTo}', v_remaining, true), updated_at = now()
      where id = p_item_id;
  else
    delete from public.app_items where id = p_item_id;
  end if;

  update public.player_equipment_slots
    set data = coalesce((select jsonb_object_agg(key, value) from jsonb_each(data) where value->>'itemId' is distinct from p_item_id), '{}'::jsonb), updated_at = now()
    where player_id = p_player_id;
  insert into public.app_workshop_ledger(id, player_id, build_id, action, data)
    values (p_ledger_id, p_player_id, null, 'scrapped', p_ledger_data);
  return jsonb_build_object('storage', v_storage, 'itemId', p_item_id);
end;
$$;

revoke all on function public.workshop_scrap_existing_item(text, text, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.workshop_scrap_existing_item(text, text, jsonb, text, text, jsonb) to service_role;
