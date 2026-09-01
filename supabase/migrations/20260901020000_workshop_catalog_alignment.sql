-- Align the original Workshop starter catalog without replacing user-authored data.
-- Existing prices, effects, descriptions, tags, assignments, and build records remain intact.

with component_changes(id, name, category) as (
  values
    ('component-basic-head', 'Standard Robot Head', 'Sensor'),
    ('component-rapture-ai', 'Rapture Combat and Assistance AI', 'Artificial Identity'),
    ('component-basic-chest', 'Standard Robot Frame', 'Robot Frame'),
    ('component-basic-arm', 'Standard Robot Arm', 'Robot Arm'),
    ('component-basic-leg', 'Standard Robot Leg', 'Robot Leg'),
    ('component-heavy-chest-mount', 'Large Firearm Chest Mount', 'Robot Chest Auxiliary'),
    ('component-steel-plating', 'Standard Steel Armor', 'Robot Armor'),
    ('component-pistol-frame', 'Standard Pistol Frame', 'Firearm Frame'),
    ('component-revolver-frame', 'Standard Revolver Frame', 'Firearm Frame'),
    ('component-shotgun-frame', 'Standard Shotgun Frame', 'Firearm Frame'),
    ('component-rifle-frame', 'Standard Rifle Frame', 'Firearm Frame'),
    ('component-automatic-frame', 'Standard Automatic Frame', 'Firearm Frame'),
    ('component-suppressor', 'Sound Suppressor', 'Muzzle Attachment')
)
update public.app_workshop_components as component
set data = component.data || jsonb_build_object('name', changes.name, 'category', changes.category),
    updated_at = now()
from component_changes as changes
where component.id = changes.id;

update public.app_workshop_blueprints as blueprint
set data = jsonb_set(
      blueprint.data,
      '{slots}',
      (
        select jsonb_agg(
          case slot_data->>'id'
            when 'robot-chest' then slot_data || jsonb_build_object('group', 'FRAME', 'label', 'Chassis Frame', 'acceptedCategories', jsonb_build_array('Robot Frame'))
            when 'robot-back' then slot_data || jsonb_build_object('acceptedCategories', jsonb_build_array('Robot Back Auxiliary'))
            when 'robot-shoulder-left' then slot_data || jsonb_build_object('acceptedCategories', jsonb_build_array('Robot Shoulder Auxiliary'))
            when 'robot-shoulder-right' then slot_data || jsonb_build_object('acceptedCategories', jsonb_build_array('Robot Shoulder Auxiliary'))
            when 'robot-aux-chest' then slot_data || jsonb_build_object('label', 'Chest Auxiliary Slot', 'acceptedCategories', jsonb_build_array('Robot Chest Auxiliary'))
            when 'robot-hip-left' then slot_data || jsonb_build_object('acceptedCategories', jsonb_build_array('Robot Hip Auxiliary'))
            when 'robot-hip-right' then slot_data || jsonb_build_object('acceptedCategories', jsonb_build_array('Robot Hip Auxiliary'))
            when 'robot-plating' then slot_data || jsonb_build_object('group', 'ARMOR', 'label', 'Exterior Armor', 'acceptedCategories', jsonb_build_array('Robot Armor'))
            else slot_data
          end
          order by slot_order
        )
        from jsonb_array_elements(blueprint.data->'slots') with ordinality as slots(slot_data, slot_order)
      ),
      false
    ),
    updated_at = now()
where blueprint.id = 'blueprint-humanoid-robot'
  and jsonb_typeof(blueprint.data->'slots') = 'array';

update public.app_workshop_blueprints as blueprint
set data = jsonb_set(
      blueprint.data,
      '{slots}',
      (
        select jsonb_agg(
          case slot_data->>'id'
            when 'gun-muzzle' then slot_data || jsonb_build_object('acceptedCategories', jsonb_build_array('Muzzle Attachment'))
            when 'gun-underbarrel' then slot_data || jsonb_build_object('acceptedCategories', jsonb_build_array('Underbarrel Attachment'))
            when 'gun-side' then slot_data || jsonb_build_object('acceptedCategories', jsonb_build_array('Side Attachment'))
            else slot_data
          end
          order by slot_order
        )
        from jsonb_array_elements(blueprint.data->'slots') with ordinality as slots(slot_data, slot_order)
      ),
      false
    ),
    updated_at = now()
where blueprint.id = 'blueprint-modular-firearm'
  and jsonb_typeof(blueprint.data->'slots') = 'array';
