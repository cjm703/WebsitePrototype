export const ITEM_EQUIPMENT_SLOTS_KEY = "Equipment::Slots";
export const ITEM_EQUIPMENT_HANDS_KEY = "Equipment::Hands";
export const ITEM_WEAPON_DAMAGE_KEY = "Weapon::Damage";
export const ITEM_WEAPON_DAMAGE_ATTRIBUTE_KEY = "Weapon::Damage Attribute";
export const ITEM_INFO_PREFIX = "Info Field::";
export const ITEM_INFO_WEAPON_DAMAGE_KEY = "Weapon Damage";
export const ITEM_INFO_DAMAGE_ATTRIBUTE_KEY = "Damage Attribute";

const ITEM_INFO_LABEL_KEY = "Label";
const ITEM_INFO_CONTENT_KEY = "Content";
const ITEM_INFO_ROLL_LABEL_KEY = "Roll Label";
const ITEM_INFO_ROLL_EXPRESSION_KEY = "Roll Expression";

export type WeaponDamageAttribute = "STR" | "AGI" | "CON" | "KNOW" | "WIS" | "WILL";

const WEAPON_DAMAGE_ATTRIBUTES = new Set<WeaponDamageAttribute>([
  "STR",
  "AGI",
  "CON",
  "KNOW",
  "WIS",
  "WILL",
]);

interface CombatItemLike {
  name?: string;
  type?: string;
  description?: string;
  tags?: string[];
  customFields?: Record<string, string>;
}

const WEAPON_TYPE_PATTERN = /\b(weapon|firearm|pistol|revolver|shotgun|rifle|carbine|submachine gun|smg|machine gun|launcher|bow|crossbow|sword|blade|axe|mace|hammer|spear|staff|wand)\b/i;

function fieldText(fields: Record<string, string>, key: string) {
  return String(fields[key] ?? "").trim();
}

function normalizedTags(item: CombatItemLike) {
  return (item.tags || []).map((tag) => String(tag || "").trim().toLowerCase());
}

function getWeaponDamageInfoFieldId(item: CombatItemLike | null | undefined) {
  const fields = item?.customFields || {};
  const fieldIds = Array.from(new Set(
    Object.keys(fields)
      .filter((key) => key.startsWith(ITEM_INFO_PREFIX))
      .map((key) => key.slice(ITEM_INFO_PREFIX.length).split("::")[0])
      .filter(Boolean),
  ));
  const marked = fieldIds.find((fieldId) => ["1", "true", "yes"].includes(
    fieldText(fields, `${ITEM_INFO_PREFIX}${fieldId}::${ITEM_INFO_WEAPON_DAMAGE_KEY}`).toLowerCase(),
  ));
  if (marked) return marked;
  return fieldIds.find((fieldId) => /^(?:weapon\s+)?damage(?:\s+(?:roll|dice))?\s*:?$/i.test(
    fieldText(fields, `${ITEM_INFO_PREFIX}${fieldId}::${ITEM_INFO_LABEL_KEY}`),
  )) || "";
}

function getWeaponDamageInfoValue(item: CombatItemLike | null | undefined, key: string) {
  const fieldId = getWeaponDamageInfoFieldId(item);
  return fieldId ? fieldText(item?.customFields || {}, `${ITEM_INFO_PREFIX}${fieldId}::${key}`) : "";
}

function firstDiceExpression(value: string) {
  return value.match(/\b\d*d\d+(?:\s*[+-]\s*\d+)?\b/i)?.[0]?.replace(/\s+/g, "") || "";
}

export function extractDiceExpressions(value: string): string[] {
  const plain = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const matches = plain.match(/\b(?:\d*d\d+|Pd\d+|P)(?:\s*(?:[+\-*/]\s*)(?:\d*d\d+|Pd\d+|\d+|P))*\b/gi) || [];
  return matches.reduce<string[]>((expressions, match) => {
    const cleaned = match.replace(/\s+/g, " ").trim();
    if (cleaned && !expressions.includes(cleaned)) expressions.push(cleaned);
    return expressions;
  }, []);
}

function getFallbackDamageValue(item: CombatItemLike | null | undefined) {
  const fields = item?.customFields || {};
  const candidate = Object.entries(fields).find(([key, rawValue]) => {
    const normalizedKey = key.replace(/[_-]+/g, " ").toLowerCase();
    if (!/damage/.test(normalizedKey) || /attribute|label|potency|buff|resistance|reduction/.test(normalizedKey)) return false;
    return Boolean(firstDiceExpression(String(rawValue ?? "")));
  });
  if (candidate) return String(candidate[1] ?? "").trim();

  if (!WEAPON_TYPE_PATTERN.test(`${item?.type || ""} ${item?.name || ""}`)) return "";
  const description = String(item?.description || "").replace(/<[^>]*>/g, " ");
  const damageClause = description.match(/\bdamage\s*:?\s*([^.;\n]+)/i)?.[1] || "";
  return firstDiceExpression(damageClause) ? damageClause.trim() : "";
}

export function isWeaponItem(item: CombatItemLike | null | undefined) {
  if (!item) return false;
  const fields = item.customFields || {};
  const allowedSlots = (fields[ITEM_EQUIPMENT_SLOTS_KEY] || "")
    .split(",")
    .map((slot) => slot.trim());
  return String(item.type || "").toLowerCase().includes("weapon")
    || WEAPON_TYPE_PATTERN.test(`${item.type || ""} ${item.name || ""}`)
    || normalizedTags(item).includes("weapon")
    || allowedSlots.some((slot) => slot === "weapon_l" || slot === "weapon_r")
    || Boolean((fields[ITEM_WEAPON_DAMAGE_KEY] || "").trim())
    || Boolean(getWeaponDamageInfoFieldId(item));
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
  return getWeaponDamageInfoValue(item, ITEM_INFO_ROLL_EXPRESSION_KEY)
    || firstDiceExpression(getWeaponDamageInfoValue(item, ITEM_INFO_CONTENT_KEY))
    || firstDiceExpression(fieldText(item?.customFields || {}, ITEM_WEAPON_DAMAGE_KEY))
    || firstDiceExpression(getFallbackDamageValue(item))
    || "";
}

export function getWeaponDamageDisplay(item: CombatItemLike | null | undefined) {
  return getWeaponDamageInfoValue(item, ITEM_INFO_CONTENT_KEY)
    || fieldText(item?.customFields || {}, ITEM_WEAPON_DAMAGE_KEY)
    || getFallbackDamageValue(item)
    || "";
}

export function getWeaponDamageRollLabel(item: CombatItemLike | null | undefined) {
  return getWeaponDamageInfoValue(item, ITEM_INFO_ROLL_LABEL_KEY) || "Use / Roll Damage";
}

export function getWeaponDamageAttribute(item: CombatItemLike | null | undefined): WeaponDamageAttribute {
  const stored = getWeaponDamageInfoValue(item, ITEM_INFO_DAMAGE_ATTRIBUTE_KEY)
    || fieldText(item?.customFields || {}, ITEM_WEAPON_DAMAGE_ATTRIBUTE_KEY)
    || "";
  return WEAPON_DAMAGE_ATTRIBUTES.has(stored as WeaponDamageAttribute)
    ? stored as WeaponDamageAttribute
    : "STR";
}

export function resolveWeaponDamageAttribute(
  item: CombatItemLike,
  effectiveStats: Record<WeaponDamageAttribute, number>,
): WeaponDamageAttribute {
  if (!isVersatileItem(item)) return getWeaponDamageAttribute(item);
  return effectiveStats.AGI > effectiveStats.STR ? "AGI" : "STR";
}
