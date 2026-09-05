-- Give the known starter firearm parts complete, frame-driven combat profiles.
-- Custom components, Workshop builds, storage, assignments, and salvage data are untouched.

with component_changes(id, price, name, tags, effects) as (
  values
    (
      'component-pistol-frame', 350, null::text, null::jsonb,
      '[{"id":"pistol-damage","label":"Pistol Damage","kind":"dice","key":"Damage","mode":"add","value":0,"text":"2d6 piercing damage","applyWhenEquipped":true},{"id":"pistol-range","label":"Pistol Range","kind":"rule","key":"","mode":"grant","value":0,"text":"Normal range 50 ft; maximum range 150 ft.","applyWhenEquipped":true},{"id":"pistol-magazine","label":"Pistol Magazine","kind":"rule","key":"","mode":"grant","value":0,"text":"Capacity 10; reload as a bonus action.","applyWhenEquipped":true},{"id":"pistol-handling","label":"Sidearm Handling","kind":"rule","key":"","mode":"grant","value":0,"text":"One-handed firearm with no inherent accuracy modifier.","applyWhenEquipped":true}]'::jsonb
    ),
    (
      'component-revolver-frame', 400, null::text, null::jsonb,
      '[{"id":"revolver-damage","label":"Revolver Damage","kind":"dice","key":"Damage","mode":"add","value":0,"text":"2d8 piercing damage","applyWhenEquipped":true},{"id":"revolver-range","label":"Revolver Range","kind":"rule","key":"","mode":"grant","value":0,"text":"Normal range 60 ft; maximum range 180 ft.","applyWhenEquipped":true},{"id":"revolver-cylinder","label":"Revolver Cylinder","kind":"rule","key":"","mode":"grant","value":0,"text":"Capacity 6; reload as a bonus action.","applyWhenEquipped":true},{"id":"revolver-handling","label":"High-Impact Sidearm","kind":"rule","key":"","mode":"grant","value":0,"text":"One-handed firearm that trades magazine size for stronger individual hits.","applyWhenEquipped":true}]'::jsonb
    ),
    (
      'component-shotgun-frame', 650, null::text, null::jsonb,
      '[{"id":"shotgun-damage","label":"Shotgun Damage","kind":"dice","key":"Damage","mode":"add","value":0,"text":"3d6 piercing within 15 ft; 2d6 at 16-30 ft; 1d6 at 31-90 ft.","applyWhenEquipped":true},{"id":"shotgun-range","label":"Shotgun Range","kind":"rule","key":"","mode":"grant","value":0,"text":"Normal range 30 ft; maximum range 90 ft. Attacks beyond normal range have disadvantage.","applyWhenEquipped":true},{"id":"shotgun-capacity","label":"Shotgun Capacity","kind":"rule","key":"","mode":"grant","value":0,"text":"Capacity 2; reload both shells as an action.","applyWhenEquipped":true},{"id":"shotgun-handling","label":"Close-Range Longarm","kind":"rule","key":"","mode":"grant","value":0,"text":"Two-handed firearm; its damage falls with distance.","applyWhenEquipped":true}]'::jsonb
    ),
    (
      'component-rifle-frame', 1000, null::text, null::jsonb,
      '[{"id":"rifle-damage","label":"Rifle Damage","kind":"dice","key":"Damage","mode":"add","value":0,"text":"2d10 piercing damage","applyWhenEquipped":true},{"id":"rifle-range","label":"Rifle Range","kind":"rule","key":"","mode":"grant","value":0,"text":"Normal range 140 ft; maximum range 360 ft.","applyWhenEquipped":true},{"id":"rifle-magazine","label":"Rifle Magazine","kind":"rule","key":"","mode":"grant","value":0,"text":"Capacity 5; reload as an action.","applyWhenEquipped":true},{"id":"rifle-brace","label":"Aimed Brace","kind":"rule","key":"","mode":"grant","value":0,"text":"Two-handed firearm. If stationary and braced, the next shot ignores disadvantage caused by long range.","applyWhenEquipped":true}]'::jsonb
    ),
    (
      'component-automatic-frame', 900, null::text, null::jsonb,
      '[{"id":"automatic-damage","label":"Automatic Damage","kind":"dice","key":"Damage","mode":"add","value":0,"text":"2d6 piercing damage","applyWhenEquipped":true},{"id":"automatic-range","label":"Automatic Range","kind":"rule","key":"","mode":"grant","value":0,"text":"Normal range 60 ft; maximum range 180 ft.","applyWhenEquipped":true},{"id":"automatic-magazine","label":"Automatic Magazine","kind":"rule","key":"","mode":"grant","value":0,"text":"Capacity 15; reload as a bonus action.","applyWhenEquipped":true},{"id":"automatic-handling","label":"Compact Longarm","kind":"rule","key":"","mode":"grant","value":0,"text":"Two-handed firearm.","applyWhenEquipped":true},{"id":"automatic-burst","label":"Controlled Burst","kind":"rule","key":"","mode":"grant","value":0,"text":"Spend 3 rounds to make two attacks with disadvantage instead of one attack.","applyWhenEquipped":true}]'::jsonb
    ),
    (
      'component-9mm-ammo', 80, 'Standard Crystal Ammunition System', '["magic-crystal","standard"]'::jsonb,
      '[{"id":"ammo-feed-rule","label":"Standard Crystal Feed","kind":"rule","key":"","mode":"grant","value":0,"text":"Uses one standard magic crystal per reload. The installed frame determines base damage, range, and capacity.","applyWhenEquipped":true}]'::jsonb
    ),
    (
      'component-9mm-barrel', 220, 'Standard Modular Barrel', '["modular","standard"]'::jsonb,
      '[{"id":"barrel-range","label":"Extended Barrel","kind":"stat","key":"Range","mode":"add","value":30,"text":"+30 ft to normal and maximum range","applyWhenEquipped":true}]'::jsonb
    ),
    (
      'component-tactical-stock', 180, null::text, null::jsonb,
      '[{"id":"stock-accuracy","label":"Braced Fire","kind":"stat","key":"Accuracy","mode":"add","value":1,"text":"+1 Accuracy while braced","applyWhenEquipped":true}]'::jsonb
    ),
    (
      'component-reflex-sight', 240, null::text, null::jsonb,
      '[{"id":"sight-accuracy","label":"Reflex Sight","kind":"stat","key":"Accuracy","mode":"add","value":1,"text":"+1 Accuracy","applyWhenEquipped":true}]'::jsonb
    ),
    (
      'component-suppressor', 320, null::text, '["muzzle","suppressed"]'::jsonb,
      '[{"id":"suppressor-rule","label":"Suppressed","kind":"rule","key":"","mode":"grant","value":0,"text":"Greatly reduces the sound of firing and visible muzzle flash.","applyWhenEquipped":true},{"id":"suppressor-tradeoff","label":"Subsonic Tradeoff","kind":"rule","key":"","mode":"grant","value":0,"text":"Reduce normal range by 10 ft while installed.","applyWhenEquipped":true}]'::jsonb
    )
)
update public.app_workshop_components as component
set data = component.data || jsonb_strip_nulls(jsonb_build_object(
      'price', changes.price,
      'name', changes.name,
      'tags', changes.tags,
      'effects', changes.effects
    )),
    updated_at = now()
from component_changes as changes
where component.id = changes.id;
