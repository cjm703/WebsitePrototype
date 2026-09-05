export const ITEM_EQUIPMENT_SLOTS_KEY = "Equipment::Slots";
export const ITEM_EQUIPMENT_HANDS_KEY = "Equipment::Hands";
export const ITEM_WEAPON_DAMAGE_KEY = "Weapon::Damage";
export const ITEM_WEAPON_DAMAGE_ATTRIBUTE_KEY = "Weapon::Damage Attribute";

export type WeaponDamageAttribute = "STR" | "AGI";

interface CombatItemLike {
  name?: string;
  type?: string;
  tags?: string[];
  customFields?: Record<string, string>;
}

function normalizedTags(item: CombatItemLike) {
  return (item.tags || []).map((tag) => String(tag || "").trim().toLowerCase());
}

export function isWeaponItem(item: CombatItemLike | null | undefined) {
  if (!item) return false;
  const fields = item.customFields || {};
  const allowedSlots = (fields[ITEM_EQUIPMENT_SLOTS_KEY] || "")
    .split(",")
    .map((slot) => slot.trim());
  return String(item.type || "").toLowerCase().includes("weapon")
    || normalizedTags(item).includes("weapon")
    || allowedSlots.some((slot) => slot === "weapon_l" || slot === "weapon_r")
    || Boolean((fields[ITEM_WEAPON_DAMAGE_KEY] || "").trim());
}

export function isTwoHandedItem(item: CombatItemLike | null | undefined) {
  if (!item) return false;
  if (item.customFields?.[ITEM_EQUIPMENT_HANDS_KEY] === "2") return true;

  const legacyText = [item.name, item.type, ...(item.tags || [])]
    .join(" ")
    .toLowerCase();
  return legacyText.includes("two-handed")
    || legacyText.includes("two handed")
    || legacyText.includes("2-handed")
    || /(?:^|\s)2h(?:\s|$)/.test(legacyText);
}

export function isVersatileItem(item: CombatItemLike | null | undefined) {
  return Boolean(item && normalizedTags(item).includes("versatile"));
}

export function getWeaponDamageExpression(item: CombatItemLike | null | undefined) {
  return item?.customFields?.[ITEM_WEAPON_DAMAGE_KEY]?.trim() || "";
}

export function getWeaponDamageAttribute(item: CombatItemLike | null | undefined): WeaponDamageAttribute {
  return item?.customFields?.[ITEM_WEAPON_DAMAGE_ATTRIBUTE_KEY] === "AGI" ? "AGI" : "STR";
}

export function resolveWeaponDamageAttribute(
  item: CombatItemLike,
  effectiveStats: Record<WeaponDamageAttribute, number>,
): WeaponDamageAttribute {
  if (!isVersatileItem(item)) return getWeaponDamageAttribute(item);
  return effectiveStats.AGI > effectiveStats.STR ? "AGI" : "STR";
}
