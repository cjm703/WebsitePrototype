
import React, { useMemo, useRef, useState } from "react";
import { retro } from "./retro-styles";
import { RichTextEditor } from "./rich-text-editor";
import { DISPLAY_CONTENTS } from "./shared-styles";
import type { ManagedItem, PlayerData, TagDefinition } from "./types";
import {
  formatItemWeight,
  formatWeightValue,
  getItemWeightTier,
  getItemWeightValue,
  ITEM_WEIGHT_OPTIONS,
} from "@/lib/weight-rules";
import {
  ITEM_EQUIPMENT_HANDS_KEY,
  ITEM_EQUIPMENT_SLOTS_KEY,
  ITEM_INFO_DAMAGE_ATTRIBUTE_KEY,
  ITEM_INFO_WEAPON_DAMAGE_KEY,
  ITEM_WEAPON_DAMAGE_ATTRIBUTE_KEY,
  ITEM_WEAPON_DAMAGE_KEY,
  isVersatileItem,
  isWeaponItem,
} from "@/lib/item-combat-rules";
import {
  DM_DIVIDER,
  DM_LOCKED_BADGE,
  DM_PANEL_ALT,
  DM_TAG_BADGE,
  dmActiveBtn,
  dmAssignDim,
  dmLockColor,
  dmRarityBadge,
  dmTabStyle,
  S_ACCENT,
  S_ACCENT_HDR,
  S_GREEN_BTN,
  S_MUTED,
  S_RED,
  S_SECTION_HDR,
  S_SUBTLE,
  S_TEXT,
  S_TEXT_BOLD,
} from "./dm-styles";
import {
  Plus,
  Save,
  Edit,
  Trash2,
  X,
  Lock,
  Copy,
  Search,
  Sparkles,
  Users,
  Tags,
  Eye,
  Layers3,
  WandSparkles,
  Dices,
  Play,
  ChevronDown,
} from "lucide-react";

interface DMItemManagerSectionProps {
  players: PlayerData[];
  managedItems: ManagedItem[];
  itemTags: TagDefinition[];
  onPersistItems: (next: ManagedItem[]) => Promise<void>;
  onPersistTags?: (next: TagDefinition[]) => Promise<void>;
  creationOnly?: boolean;
  onCreatedItem?: (item: ManagedItem) => void;
  onCancelCreation?: () => void;
}

type ItemEditorPanel = "basics" | "assignment" | "tags" | "details" | "effects" | "preview";
type ItemTemplateId = "blank" | "weapon" | "armor" | "consumable" | "source" | "tool" | "effect";

interface ItemTemplateDef {
  id: ItemTemplateId;
  label: string;
  description: string;
  name: string;
  type: string;
  rarity: string;
  tags: string[];
  starterDescription: string;
  starterEffects?: number;
}

type InfoFieldPlacement = "above" | "below";
type TrackerMode = "" | "status" | "ability";
type TrackerBuffType = "" | "attribute" | "skill" | "resource";

interface ItemInfoField {
  fieldId: string;
  label: string;
  content: string;
  placement: InfoFieldPlacement;
  rollLabel: string;
  rollExpression: string;
  rollPotency: string;
  equippedEffect: boolean;
  equippedEffectText: string;
  trackerMode: TrackerMode;
  trackerName: string;
  trackerDuration: string;
  trackerPotency: string;
  trackerDamage: string;
  trackerDescription: string;
  trackerBuffType: TrackerBuffType;
  trackerBuffTarget: string;
  trackerBuffValue: string;
  weaponDamage: boolean;
  damageAttribute: "" | "STR" | "AGI";
}

interface ItemInfoFieldPreset {
  id: string;
  label: string;
  helper: string;
  seed: Partial<ItemInfoField>;
}

const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;
const inputStyle = { color: "#C0D0F0" } as const;
const labelStyle = { color: "#5A6A8A" } as const;

const ITEM_TEMPLATES: ItemTemplateDef[] = [
  { id: "blank", label: "Blank", description: "Start from an empty item shell.", name: "", type: "", rarity: "Common", tags: [], starterDescription: "" },
  { id: "weapon", label: "Weapon", description: "Combat item with equipment-friendly defaults.", name: "New Weapon", type: "Weapon", rarity: "Common", tags: ["Weapon", "Equipment"], starterDescription: "<p>A weapon meant for combat use.</p>" },
  { id: "armor", label: "Armor", description: "Protective equipment with armor-style framing.", name: "New Armor", type: "Armor", rarity: "Common", tags: ["Armor", "Equipment"], starterDescription: "<p>Protective gear worn to reduce danger and improve survivability.</p>" },
  { id: "consumable", label: "Consumable", description: "Potion, food, scroll, bomb, or one-use resource.", name: "New Consumable", type: "Consumable", rarity: "Common", tags: ["Consumable"], starterDescription: "<p>An item meant to be consumed, expended, or used up.</p>" },
  { id: "source", label: "Source Item", description: "Material or crystal that stores usable source.", name: "New Source Item", type: "Material", rarity: "Uncommon", tags: ["Source Item", "Material"], starterDescription: "<p>An item that contains or represents source that can be spent.</p>" },
  { id: "tool", label: "Tool / Utility", description: "Problem-solving item, focus, utility gear, or kit.", name: "New Tool", type: "Tool", rarity: "Common", tags: ["Utility"], starterDescription: "<p>A practical item used to solve problems or support a task.</p>" },
  { id: "effect", label: "Effect Item", description: "Item with one or more player-facing effect text blocks.", name: "New Effect Item", type: "Relic", rarity: "Rare", tags: ["Effect"], starterDescription: "<p>An item whose most important value is the effect it applies or grants.</p>", starterEffects: 1 },
];

const EDITOR_PANELS: Array<{ id: ItemEditorPanel; label: string; icon: React.ComponentType<{ size?: number }>; }> = [
  { id: "basics", label: "Basics", icon: WandSparkles },
  { id: "assignment", label: "Assignment", icon: Users },
  { id: "tags", label: "Tags", icon: Tags },
  { id: "details", label: "Item Data", icon: Layers3 },
  { id: "effects", label: "Effects", icon: Sparkles },
  { id: "preview", label: "Preview", icon: Eye },
];

const EQUIP_SLOT_PRESETS: Array<{ id: string; label: string; slots: string[]; hands?: "1" | "2" }> = [
  { id: "weaponPair", label: "One-Handed Weapon", slots: ["weapon_l", "weapon_r"], hands: "1" },
  { id: "twoHandedWeapon", label: "Two-Handed Weapon", slots: ["weapon_l", "weapon_r"], hands: "2" },
  { id: "armorSet", label: "Armor Slot", slots: ["armor"] },
  { id: "trinket", label: "Accessory", slots: ["neck", "belt", "belt_slot"] },
  { id: "rings", label: "Ring", slots: ["ring"] },
  { id: "headwear", label: "Head / Face", slots: ["head", "face"] },
  { id: "outerwear", label: "Cloak / Jacket", slots: ["jacket"] },
] as const;

const ITEM_INFO_FIELD_PRESETS: ItemInfoFieldPreset[] = [
  {
    id: "damage",
    label: "Damage Field",
    helper: "Visible damage block with a ready dice roll button.",
    seed: {
      label: "Damage",
      placement: "above",
      rollLabel: "Use / Roll Damage",
      rollExpression: "1d6",
      weaponDamage: true,
      damageAttribute: "STR",
    },
  },
  {
    id: "passive",
    label: "Passive Note",
    helper: "A passive rules text field for ongoing item behavior.",
    seed: {
      label: "Passive",
      placement: "above",
      content: "<p>Describe the passive benefit this item grants while carried or equipped.</p>",
    },
  },
  {
    id: "equipped",
    label: "Equipped Effect",
    helper: "Displays in Equipped → Effects while the item is slotted.",
    seed: {
      label: "Equipped Effect",
      placement: "below",
      equippedEffect: true,
      content: "<p>Describe what this item provides while equipped.</p>",
    },
  },
  {
    id: "status",
    label: "Status Effect",
    helper: "Pushes a status effect into the Personal Files tracker area.",
    seed: {
      label: "Apply Status",
      placement: "below",
      trackerMode: "status",
      trackerDuration: "1",
      content: "<p>Describe the status this item applies.</p>",
    },
  },
  {
    id: "ability",
    label: "Card Effect",
    helper: "Pushes a card effect into the Personal Files tracker area.",
    seed: {
      label: "Apply Card Effect",
      placement: "below",
      trackerMode: "ability",
      trackerDuration: "1",
      content: "<p>Describe the temporary card-like effect this item grants.</p>",
    },
  },
  {
    id: "lore",
    label: "Lore / Detail",
    helper: "Flavor, origin, maker marks, or identification notes.",
    seed: {
      label: "Lore",
      placement: "below",
      content: "<p>Add lore, identification notes, crafting details, or ownership clues.</p>",
    },
  },
] as const;

const WEAPON_INFO_FIELD_SEEDS: Array<Partial<ItemInfoField>> = [
  { label: "Weapon Type", placement: "above" },
  {
    label: "Damage",
    placement: "above",
    rollLabel: "Use / Roll Damage",
    rollExpression: "1d6",
    weaponDamage: true,
    damageAttribute: "STR",
  },
  { label: "Range", placement: "above" },
  { label: "Reload", placement: "above" },
  { label: "Capacity", placement: "above" },
  { label: "Ammunition", placement: "above" },
];

const INFO_FIELD_CONTENT_PLACEHOLDERS: Record<string, string> = {
  "weapon type": "Firearm (Ranged, Two-Handed, Shotgun)",
  damage: "3d6 piercing damage (10 ft) / 2d6 (20 ft) / 1d6 (30 ft)",
  range: "30 ft / 90 ft (Disadvantage beyond 30 ft)",
  reload: "2 shots (requires an action to reload both barrels)",
  capacity: "2 shots before reloading",
  ammunition: "Just about any type of bullet that can fit within the barrel",
};

const rarities = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
const ATTRS = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL"];
const ALL_SKILLS = ["Athletics", "Grappling", "Acrobatics", "Sleight of Hand", "Stealth", "Endurance", "Shock", "History", "Investigation", "Arcana", "Religion", "Medicine", "Nature", "Technology/Tinkering", "Perception", "Insight", "Survival", "Persuasion", "Charm", "Control", "Clear Mind"];
const ALL_RESOURCES = ["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
const EQUIP_SLOT_OPTIONS = [
  { id: "head", label: "Head" },
  { id: "face", label: "Face" },
  { id: "neck", label: "Neck" },
  { id: "jacket", label: "Jacket / Cloak" },
  { id: "armor", label: "Armor" },
  { id: "shirt", label: "Shirt" },
  { id: "armguards", label: "Armguards" },
  { id: "gloves", label: "Gloves" },
  { id: "weapon_l", label: "Weapon (L)" },
  { id: "weapon_r", label: "Weapon (R)" },
  { id: "belt", label: "Belt" },
  { id: "belt_slot", label: "Belt Slot" },
  { id: "leggings", label: "Leggings" },
  { id: "shoes", label: "Shoes" },
  { id: "ring", label: "Ring (any)" },
];

const FIELD_KEYS = {
  equipmentSlots: ITEM_EQUIPMENT_SLOTS_KEY,
  equipmentSlotLegacy: "Equipment::Slot",
  equipmentHands: ITEM_EQUIPMENT_HANDS_KEY,
  weaponDamage: ITEM_WEAPON_DAMAGE_KEY,
  weaponDamageAttribute: ITEM_WEAPON_DAMAGE_ATTRIBUTE_KEY,
  attributeName: "Attribute Buff::Attribute",
  attributeAmount: "Attribute Buff::Amount",
  skillName: "Skill Buff::Skill",
  skillAmount: "Skill Buff::Amount",
  resourceName: "Resources Buff::Resource",
  resourceAmount: "Resources Buff::Amount",
  disadvantageSkill: "Disadvantageous::Skill",
  sourcePoints: "Source::Source Points",
} as const;

const EFFECT_PREFIX = "Effect::";
const ITEM_INFO_PREFIX = "Info Field::";
const INFO_LABEL = "Label";
const INFO_CONTENT = "Content";
const INFO_PLACEMENT = "Placement";
const INFO_ROLL_LABEL = "Roll Label";
const INFO_ROLL_EXPRESSION = "Roll Expression";
const INFO_ROLL_POTENCY = "Roll Potency";
const INFO_EQUIPPED = "Equipped Effect";
const INFO_EQUIPPED_TEXT = "Equipped Effect Text";
const INFO_TRACKER_MODE = "Tracker Mode";
const INFO_TRACKER_NAME = "Tracker Name";
const INFO_TRACKER_DURATION = "Tracker Duration";
const INFO_TRACKER_POTENCY = "Tracker Potency";
const INFO_TRACKER_DAMAGE = "Tracker Damage";
const INFO_TRACKER_DESCRIPTION = "Tracker Description";
const INFO_TRACKER_BUFF_TYPE = "Tracker Buff Type";
const INFO_TRACKER_BUFF_TARGET = "Tracker Buff Target";
const INFO_TRACKER_BUFF_VALUE = "Tracker Buff Value";
const INFO_WEAPON_DAMAGE = ITEM_INFO_WEAPON_DAMAGE_KEY;
const INFO_DAMAGE_ATTRIBUTE = ITEM_INFO_DAMAGE_ATTRIBUTE_KEY;

function rarityColor(r: string) {
  switch (r) {
    case "Uncommon": return "#7ACA8A";
    case "Rare": return "#4A9AFF";
    case "Very Rare": return "#C4A0FF";
    case "Legendary": return "#FFAA4A";
    default: return "#9AAACC";
  }
}

function formatOwners(assignedTo: string[], players: { id: string; name: string }[]) {
  if (assignedTo.includes("all")) return "All Players";
  if (assignedTo.length === 0) return "Unassigned";
  return assignedTo.map((id) => players.find((p) => p.id === id)?.name || "Unknown").join(", ");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function countItemEffects(item: ManagedItem | null) {
  if (!item) return 0;
  return Object.keys(item.customFields || {}).filter((key) => key.startsWith(EFFECT_PREFIX) && (item.customFields[key] || "").trim()).length;
}

function getAllowedSlots(customFields: Record<string, string>) {
  const multi = (customFields[FIELD_KEYS.equipmentSlots] || "").split(",").map((slot) => slot.trim()).filter(Boolean);
  if (multi.length > 0) return Array.from(new Set(multi));
  const legacy = (customFields[FIELD_KEYS.equipmentSlotLegacy] || "").trim();
  return legacy ? [legacy] : [];
}

function setAllowedSlots(customFields: Record<string, string>, slots: string[]) {
  const next = { ...customFields };
  const normalized = Array.from(new Set(slots.filter(Boolean)));
  if (normalized.length > 0) next[FIELD_KEYS.equipmentSlots] = normalized.join(",");
  else delete next[FIELD_KEYS.equipmentSlots];
  delete next[FIELD_KEYS.equipmentSlotLegacy];
  return next;
}

function getInfoFieldKey(fieldId: string, key: string) {
  return `${ITEM_INFO_PREFIX}${fieldId}::${key}`;
}

function getInfoFieldIds(customFields: Record<string, string>) {
  return Array.from(new Set(
    Object.keys(customFields || {})
      .filter((key) => key.startsWith(ITEM_INFO_PREFIX))
      .map((key) => key.replace(ITEM_INFO_PREFIX, "").split("::")[0])
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function buildInfoFields(customFields: Record<string, string>): ItemInfoField[] {
  return getInfoFieldIds(customFields).map((fieldId) => ({
    fieldId,
    label: customFields[getInfoFieldKey(fieldId, INFO_LABEL)] || "",
    content: customFields[getInfoFieldKey(fieldId, INFO_CONTENT)] || "",
    placement: customFields[getInfoFieldKey(fieldId, INFO_PLACEMENT)] === "below" ? "below" : "above",
    rollLabel: customFields[getInfoFieldKey(fieldId, INFO_ROLL_LABEL)] || "",
    rollExpression: customFields[getInfoFieldKey(fieldId, INFO_ROLL_EXPRESSION)] || "",
    rollPotency: customFields[getInfoFieldKey(fieldId, INFO_ROLL_POTENCY)] || "",
    equippedEffect: customFields[getInfoFieldKey(fieldId, INFO_EQUIPPED)] === "1",
    equippedEffectText: customFields[getInfoFieldKey(fieldId, INFO_EQUIPPED_TEXT)] || "",
    trackerMode: (customFields[getInfoFieldKey(fieldId, INFO_TRACKER_MODE)] || "") as TrackerMode,
    trackerName: customFields[getInfoFieldKey(fieldId, INFO_TRACKER_NAME)] || "",
    trackerDuration: customFields[getInfoFieldKey(fieldId, INFO_TRACKER_DURATION)] || "",
    trackerPotency: customFields[getInfoFieldKey(fieldId, INFO_TRACKER_POTENCY)] || "",
    trackerDamage: customFields[getInfoFieldKey(fieldId, INFO_TRACKER_DAMAGE)] || "",
    trackerDescription: customFields[getInfoFieldKey(fieldId, INFO_TRACKER_DESCRIPTION)] || "",
    trackerBuffType: (customFields[getInfoFieldKey(fieldId, INFO_TRACKER_BUFF_TYPE)] || "") as TrackerBuffType,
    trackerBuffTarget: customFields[getInfoFieldKey(fieldId, INFO_TRACKER_BUFF_TARGET)] || "",
    trackerBuffValue: customFields[getInfoFieldKey(fieldId, INFO_TRACKER_BUFF_VALUE)] || "",
    weaponDamage: customFields[getInfoFieldKey(fieldId, INFO_WEAPON_DAMAGE)] === "1",
    damageAttribute: customFields[getInfoFieldKey(fieldId, INFO_DAMAGE_ATTRIBUTE)] === "AGI"
      ? "AGI"
      : customFields[getInfoFieldKey(fieldId, INFO_DAMAGE_ATTRIBUTE)] === "STR" ? "STR" : "",
  }));
}

function applyInfoFieldSeed(customFields: Record<string, string>, fieldId: string, seed: Partial<ItemInfoField>) {
  const next = { ...customFields };
  const setValue = (key: string, value: string | boolean | undefined) => {
    const normalized = typeof value === "boolean" ? (value ? "1" : "") : (value || "");
    const fullKey = getInfoFieldKey(fieldId, key);
    if (normalized) next[fullKey] = normalized;
    else delete next[fullKey];
  };

  setValue(INFO_LABEL, seed.label || "New Field");
  setValue(INFO_CONTENT, seed.content || "");
  setValue(INFO_PLACEMENT, seed.placement || "above");
  setValue(INFO_ROLL_LABEL, seed.rollLabel || "");
  setValue(INFO_ROLL_EXPRESSION, seed.rollExpression || "");
  setValue(INFO_ROLL_POTENCY, seed.rollPotency || "");
  setValue(INFO_EQUIPPED, seed.equippedEffect || false);
  setValue(INFO_EQUIPPED_TEXT, seed.equippedEffectText || "");
  setValue(INFO_TRACKER_MODE, seed.trackerMode || "");
  setValue(INFO_TRACKER_NAME, seed.trackerName || "");
  setValue(INFO_TRACKER_DURATION, seed.trackerDuration || "");
  setValue(INFO_TRACKER_POTENCY, seed.trackerPotency || "");
  setValue(INFO_TRACKER_DAMAGE, seed.trackerDamage || "");
  setValue(INFO_TRACKER_DESCRIPTION, seed.trackerDescription || "");
  setValue(INFO_TRACKER_BUFF_TYPE, seed.trackerBuffType || "");
  setValue(INFO_TRACKER_BUFF_TARGET, seed.trackerBuffTarget || "");
  setValue(INFO_TRACKER_BUFF_VALUE, seed.trackerBuffValue || "");
  setValue(INFO_WEAPON_DAMAGE, seed.weaponDamage || false);
  setValue(INFO_DAMAGE_ATTRIBUTE, seed.damageAttribute || "");
  return next;
}

function makeInfoFieldId(customFields: Record<string, string>) {
  const nextIndex = getInfoFieldIds(customFields)
    .map((fieldId) => parseInt(fieldId, 10))
    .reduce((highest, value) => (Number.isNaN(value) ? highest : Math.max(highest, value)), 0) + 1;
  return String(nextIndex);
}

function extractFirstDiceExpression(value: string) {
  return value.match(/\b\d*d\d+(?:\s*[+-]\s*\d+)?\b/i)?.[0]?.replace(/\s+/g, "") || "";
}

function migrateLegacyWeaponDamage(item: ManagedItem) {
  const legacyDamage = (item.customFields[FIELD_KEYS.weaponDamage] || "").trim();
  const hasDamageInfoField = buildInfoFields(item.customFields).some((field) => field.weaponDamage || field.label.trim().toLowerCase() === "damage");
  if (!legacyDamage || hasDamageInfoField) return item;

  const fieldId = makeInfoFieldId(item.customFields);
  const nextCustomFields = applyInfoFieldSeed(item.customFields, fieldId, {
    label: "Damage",
    content: legacyDamage,
    placement: "above",
    rollLabel: "Use / Roll Damage",
    rollExpression: extractFirstDiceExpression(legacyDamage),
    weaponDamage: true,
    damageAttribute: item.customFields[FIELD_KEYS.weaponDamageAttribute] === "AGI" ? "AGI" : "STR",
  });
  delete nextCustomFields[FIELD_KEYS.weaponDamage];
  delete nextCustomFields[FIELD_KEYS.weaponDamageAttribute];
  return { ...item, customFields: nextCustomFields };
}

function deleteKeys(item: ManagedItem, keys: string[]) {
  const nextCustomFields = { ...item.customFields };
  keys.forEach((key) => delete nextCustomFields[key]);
  return { ...item, customFields: nextCustomFields };
}

function buildDisplayFacts(item: ManagedItem) {
  const slotLabels = Object.fromEntries(EQUIP_SLOT_OPTIONS.map((slot) => [slot.id, slot.label])) as Record<string, string>;
  const hiddenPrefixes = [EFFECT_PREFIX, ITEM_INFO_PREFIX];
  const facts = Object.entries(item.customFields || {})
    .filter(([key, value]) => !!String(value || "").trim() && !hiddenPrefixes.some((prefix) => key.startsWith(prefix)))
    .map(([key, value]) => {
      const [group, ...rest] = key.split("::");
      let label = rest.join("::") || group;
      let displayValue = String(value);

      if (key === FIELD_KEYS.equipmentSlots || key === FIELD_KEYS.equipmentSlotLegacy) {
        label = "Allowed Slots";
        displayValue = getAllowedSlots(item.customFields).map((slot) => slotLabels[slot] || slot).join(", ");
      }

      if (key === FIELD_KEYS.equipmentHands) {
        label = "Hands Required";
        displayValue = value === "2" ? "Two-handed" : "One-handed";
      }

      if (key === FIELD_KEYS.weaponDamageAttribute) {
        label = "Damage Attribute";
        displayValue = value === "AGI" ? "Agility" : "Strength";
      }

      if ([FIELD_KEYS.attributeAmount, FIELD_KEYS.skillAmount, FIELD_KEYS.resourceAmount].includes(key as any)) {
        const numeric = Number(value);
        if (!Number.isNaN(numeric) && numeric > 0) displayValue = `+${numeric}`;
      }

      return { key, label, value: displayValue };
    })
    .filter((fact) => fact.value.trim());

  const weight = getItemWeightValue(item);
  if (weight !== null) {
    facts.push({
      key: "weight",
      label: "Weight",
      value: `${formatWeightValue(weight)} W`,
    });
  }

  return facts.sort((a, b) => a.label.localeCompare(b.label));
}

function stripUnusedCustomFields(item: ManagedItem) {
  const nextCustomFields: Record<string, string> = {};
  Object.entries(item.customFields || {}).forEach(([key, value]) => {
    const trimmedValue = String(value || "").trim();
    if (trimmedValue) nextCustomFields[key] = String(value);
    if (key.startsWith(ITEM_INFO_PREFIX) && (value === "1")) nextCustomFields[key] = "1";
  });
  return {
    ...item,
    customFields: nextCustomFields,
    tags: Array.from(new Set(item.tags)),
  };
}

function makeItemFromTemplate(template: ItemTemplateDef, itemTags: TagDefinition[]): ManagedItem {
  const existingTagNames = new Set(itemTags.map((tag) => tag.name));
  const tags = template.tags.filter((tag) => existingTagNames.has(tag));
  let customFields: Record<string, string> = {};

  if (template.id === "weapon") {
    customFields[FIELD_KEYS.equipmentSlots] = "weapon_l,weapon_r";
    customFields[FIELD_KEYS.equipmentHands] = "1";
    WEAPON_INFO_FIELD_SEEDS.forEach((seed) => {
      const fieldId = makeInfoFieldId(customFields);
      customFields = applyInfoFieldSeed(customFields, fieldId, seed);
    });
  }
  if (template.id === "armor") customFields[FIELD_KEYS.equipmentSlots] = "armor";
  if (template.id === "source") customFields[FIELD_KEYS.sourcePoints] = "";
  if (template.starterEffects) {
    for (let index = 0; index < template.starterEffects; index += 1) {
      customFields[`${EFFECT_PREFIX}${index}`] = "";
    }
  }

  return {
    id: `mi-${Date.now()}`,
    name: template.name,
    rarity: template.rarity,
    type: template.type,
    weightTier: "M",
    weightValue: 1,
    tags,
    description: template.starterDescription,
    assignedTo: [],
    customFields,
  };
}

function getSuggestedTags(editingItem: ManagedItem | null, itemTags: TagDefinition[]) {
  if (!editingItem) return [] as TagDefinition[];
  const textBlob = `${editingItem.name} ${editingItem.type} ${stripHtml(editingItem.description)}`.toLowerCase();
  return itemTags.filter((tag) => {
    if (editingItem.tags.includes(tag.name)) return false;
    const tagText = `${tag.name} ${tag.description}`.toLowerCase();
    if (!tagText.trim()) return false;
    if (textBlob.includes(tag.name.toLowerCase())) return true;
    if (tag.name.toLowerCase().includes("weapon") && /weapon|blade|sword|axe|bow|staff/.test(textBlob)) return true;
    if (tag.name.toLowerCase().includes("armor") && /armor|shield|helmet|plate|mail|cloak/.test(textBlob)) return true;
    if (tag.name.toLowerCase().includes("consumable") && /consumable|potion|food|drink|scroll|bomb/.test(textBlob)) return true;
    if (tag.name.toLowerCase().includes("effect") && countItemEffects(editingItem) > 0) return true;
    if (tag.name.toLowerCase().includes("source") && /source|crystal|mana|fuel/.test(textBlob)) return true;
    return false;
  }).slice(0, 8);
}

export function DMItemManagerSection({ players, managedItems, itemTags, onPersistItems, onPersistTags, creationOnly = false, onCreatedItem, onCancelCreation }: DMItemManagerSectionProps) {
  const [itemFilterTab, setItemFilterTab] = useState<string>("all");
  const [itemSearch, setItemSearch] = useState("");
  const [editingItem, setEditingItem] = useState<ManagedItem | null>(() => creationOnly ? makeItemFromTemplate(ITEM_TEMPLATES[0], itemTags) : null);
  const [isAddingNewItem, setIsAddingNewItem] = useState(creationOnly);
  const [editorPanel, setEditorPanel] = useState<ItemEditorPanel>("basics");
  const [tagSearch, setTagSearch] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagDescription, setNewTagDescription] = useState("");
  const [tagSaveError, setTagSaveError] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [activeInfoFieldId, setActiveInfoFieldId] = useState<string | null>(null);
  const originalAssignedToRef = useRef<string[]>([]);

  const updateItemField = <K extends keyof ManagedItem>(key: K, value: ManagedItem[K]) => {
    if (editingItem) setEditingItem({ ...editingItem, [key]: value });
  };

  const updateItemWeightTier = (tier: ManagedItem["weightTier"]) => {
    if (!editingItem) return;
    const nextWeightValue =
      tier === "S" ? 0.5 :
      tier === "M" ? 1 :
      tier === "L" ? 2 :
      tier === "XL" ? 5 :
      editingItem.weightValue ?? 0;
    setEditingItem({ ...editingItem, weightTier: tier, weightValue: nextWeightValue });
  };

  const updateItemCustomField = (key: string, value: string) => {
    if (!editingItem) return;
    setEditingItem({ ...editingItem, customFields: { ...editingItem.customFields, [key]: value } });
  };

  const updateAllowedSlots = (slotId: string, checked: boolean) => {
    if (!editingItem) return;
    const current = getAllowedSlots(editingItem.customFields);
    const next = checked ? [...current, slotId] : current.filter((slot) => slot !== slotId);
    const nextCustomFields = setAllowedSlots(editingItem.customFields, next);
    if (
      nextCustomFields[FIELD_KEYS.equipmentHands] === "2"
      && (!next.includes("weapon_l") || !next.includes("weapon_r"))
    ) {
      nextCustomFields[FIELD_KEYS.equipmentHands] = "1";
    }
    setEditingItem({ ...editingItem, customFields: nextCustomFields });
  };

  const setEquipmentHands = (hands: "1" | "2") => {
    if (!editingItem) return;
    let nextCustomFields = { ...editingItem.customFields, [FIELD_KEYS.equipmentHands]: hands };
    const allowedSlots = getAllowedSlots(nextCustomFields);
    if (hands === "2") {
      nextCustomFields = setAllowedSlots(nextCustomFields, [...allowedSlots, "weapon_l", "weapon_r"]);
    }
    setEditingItem({ ...editingItem, customFields: nextCustomFields });
  };

  const addEffectBlock = () => {
    if (!editingItem) return;
    const nextIndex = Object.keys(editingItem.customFields || {})
      .filter((key) => key.startsWith(EFFECT_PREFIX))
      .map((key) => parseInt(key.split("::")[1] || "0", 10))
      .reduce((highest, value) => (Number.isNaN(value) ? highest : Math.max(highest, value)), -1) + 1;
    updateItemCustomField(`${EFFECT_PREFIX}${nextIndex}`, "");
  };

  const removeEffectBlock = (key: string) => {
    if (!editingItem) return;
    setEditingItem(deleteKeys(editingItem, [key]));
  };

  const addInfoField = () => {
    if (!editingItem) return;
    const nextId = makeInfoFieldId(editingItem.customFields);
    const nextCustomFields = applyInfoFieldSeed(editingItem.customFields, nextId, {
      label: "New Field",
      placement: "above",
    });
    setEditingItem({ ...editingItem, customFields: nextCustomFields });
    setActiveInfoFieldId(nextId);
  };

  const addInfoFieldPreset = (preset: ItemInfoFieldPreset) => {
    if (!editingItem) return;
    const nextId = makeInfoFieldId(editingItem.customFields);
    const nextCustomFields = applyInfoFieldSeed(editingItem.customFields, nextId, preset.seed);
    setEditingItem({ ...editingItem, customFields: nextCustomFields });
    setActiveInfoFieldId(nextId);
    setEditorPanel("details");
  };

  const addWeaponInfoFields = () => {
    if (!editingItem) return;
    const migratedItem = migrateLegacyWeaponDamage(editingItem);
    let nextCustomFields = { ...migratedItem.customFields };
    const existingLabels = new Set(buildInfoFields(nextCustomFields).map((field) => field.label.trim().toLowerCase()));
    const addedFieldIds: string[] = [];

    WEAPON_INFO_FIELD_SEEDS.forEach((seed) => {
      const label = seed.label?.trim().toLowerCase() || "";
      if (label && existingLabels.has(label)) return;
      const nextId = makeInfoFieldId(nextCustomFields);
      nextCustomFields = applyInfoFieldSeed(nextCustomFields, nextId, seed);
      addedFieldIds.push(nextId);
      if (label) existingLabels.add(label);
    });

    setEditingItem({ ...migratedItem, customFields: nextCustomFields });
    const damageField = buildInfoFields(nextCustomFields).find((field) => field.weaponDamage || field.label.trim().toLowerCase() === "damage");
    setActiveInfoFieldId(addedFieldIds[0] || damageField?.fieldId || null);
    setEditorPanel("details");
  };

  const updateInfoField = (fieldId: string, key: string, value: string | boolean) => {
    if (!editingItem) return;
    const nextCustomFields = { ...editingItem.customFields };
    const fullKey = getInfoFieldKey(fieldId, key);
    const normalized = typeof value === "boolean" ? (value ? "1" : "") : value;
    if (normalized) nextCustomFields[fullKey] = normalized;
    else delete nextCustomFields[fullKey];
    setEditingItem({ ...editingItem, customFields: nextCustomFields });
  };

  const removeInfoField = (fieldId: string) => {
    if (!editingItem) return;
    const fields = buildInfoFields(editingItem.customFields);
    const removedIndex = fields.findIndex((field) => field.fieldId === fieldId);
    const keys = Object.keys(editingItem.customFields).filter((key) => key.startsWith(`${ITEM_INFO_PREFIX}${fieldId}::`));
    setEditingItem(deleteKeys(editingItem, keys));
    if (activeInfoFieldId === fieldId) {
      const remaining = fields.filter((field) => field.fieldId !== fieldId);
      setActiveInfoFieldId(remaining[Math.min(Math.max(removedIndex, 0), remaining.length - 1)]?.fieldId || null);
    }
  };

  const duplicateInfoField = (fieldId: string) => {
    if (!editingItem) return;
    const field = buildInfoFields(editingItem.customFields).find((entry) => entry.fieldId === fieldId);
    if (!field) return;
    const nextId = makeInfoFieldId(editingItem.customFields);
    const nextCustomFields = applyInfoFieldSeed(editingItem.customFields, nextId, {
      ...field,
      label: field.label ? `${field.label} Copy` : "Field Copy",
    });
    setEditingItem({ ...editingItem, customFields: nextCustomFields });
    setActiveInfoFieldId(nextId);
  };

  const moveInfoField = (fieldId: string, direction: -1 | 1) => {
    if (!editingItem) return;
    const fields = buildInfoFields(editingItem.customFields);
    const index = fields.findIndex((field) => field.fieldId === fieldId);
    if (index < 0) return;
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= fields.length) return;

    const reordered = [...fields];
    const [picked] = reordered.splice(index, 1);
    reordered.splice(swapIndex, 0, picked);

    const preserved = { ...editingItem.customFields };
    Object.keys(preserved).forEach((key) => {
      if (key.startsWith(ITEM_INFO_PREFIX)) delete preserved[key];
    });

    reordered.forEach((field, idx) => {
      const nextId = String(idx + 1);
      Object.assign(preserved, applyInfoFieldSeed({}, nextId, field));
    });

    setEditingItem({ ...editingItem, customFields: preserved });
    setActiveInfoFieldId(String(swapIndex + 1));
  };

  const applyEquipSlotPreset = (slotIds: string[], hands?: string) => {
    if (!editingItem) return;
    const nextCustomFields = setAllowedSlots(editingItem.customFields, slotIds);
    if (hands) nextCustomFields[FIELD_KEYS.equipmentHands] = hands;
    else delete nextCustomFields[FIELD_KEYS.equipmentHands];
    setEditingItem({ ...editingItem, customFields: nextCustomFields });
    setEditorPanel("details");
  };

  const toggleItemTag = (tagName: string) => {
    if (!editingItem) return;
    const has = editingItem.tags.includes(tagName);
    const nextTags = has ? editingItem.tags.filter((tag) => tag !== tagName) : [...editingItem.tags, tagName];
    setEditingItem({ ...editingItem, tags: nextTags });
  };

  const resetTagCreator = () => {
    setCreatingTag(false);
    setNewTagName("");
    setNewTagDescription("");
    setTagSaveError("");
  };

  const createItemTag = async () => {
    if (!editingItem || !onPersistTags || tagSaving) return;
    const name = newTagName.trim();
    if (!name) {
      setTagSaveError("Enter a tag name.");
      return;
    }

    const existing = itemTags.find((tag) => tag.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setEditingItem((current) => current && !current.tags.includes(existing.name)
        ? { ...current, tags: [...current.tags, existing.name] }
        : current);
      resetTagCreator();
      return;
    }

    const nextTag: TagDefinition = {
      id: `itag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      description: newTagDescription.trim(),
      fields: [],
    };

    setTagSaving(true);
    setTagSaveError("");
    try {
      await onPersistTags([...itemTags, nextTag]);
      setEditingItem((current) => current && !current.tags.includes(nextTag.name)
        ? { ...current, tags: [...current.tags, nextTag.name] }
        : current);
      setTagSearch("");
      resetTagCreator();
    } catch (error) {
      setTagSaveError(error instanceof Error ? error.message : "Tag could not be saved.");
    } finally {
      setTagSaving(false);
    }
  };

  const startEditingItem = (item: ManagedItem) => {
    const normalizedItem = migrateLegacyWeaponDamage(item);
    originalAssignedToRef.current = [...item.assignedTo];
    setEditingItem({
      ...normalizedItem,
      weightTier: getItemWeightTier(item) ?? "M",
      weightValue: getItemWeightValue(item) ?? 1,
      customFields: { ...normalizedItem.customFields },
    });
    setIsAddingNewItem(false);
    setEditorPanel("basics");
    setTagSearch("");
    setActiveInfoFieldId(getInfoFieldIds(normalizedItem.customFields)[0] || null);
    resetTagCreator();
  };

  const handleAddItem = (templateId: ItemTemplateId = "blank") => {
    const template = ITEM_TEMPLATES.find((entry) => entry.id === templateId) || ITEM_TEMPLATES[0];
    setEditingItem(makeItemFromTemplate(template, itemTags));
    originalAssignedToRef.current = [];
    setIsAddingNewItem(true);
    setEditorPanel("basics");
    setTagSearch("");
    setActiveInfoFieldId(null);
    resetTagCreator();
  };

  const duplicateAsNew = () => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      id: `mi-${Date.now()}`,
      name: editingItem.name ? `${editingItem.name} Copy` : "Item Copy",
      assignedTo: [],
      duplicatedFrom: editingItem.name || "Unknown Item",
      customFields: { ...editingItem.customFields },
    });
    originalAssignedToRef.current = [];
    setIsAddingNewItem(true);
  };

  const handleCancelItemEdit = () => {
    setEditingItem(null);
    setIsAddingNewItem(false);
    setActiveInfoFieldId(null);
    resetTagCreator();
    onCancelCreation?.();
  };

  const handleSaveItem = async () => {
    if (!editingItem) return;

    const trimmedItem = stripUnusedCustomFields({
      ...editingItem,
      name: editingItem.name.trim(),
      type: editingItem.type.trim(),
      description: editingItem.description,
      assignedTo: creationOnly ? [] : editingItem.assignedTo,
    });

    if (isAddingNewItem) {
      await onPersistItems([...managedItems, trimmedItem]);
      onCreatedItem?.(trimmedItem);
    } else {
      const originalPlayers = originalAssignedToRef.current;
      const resolveIds = (arr: string[]) => arr.includes("all") ? players.map((p) => p.id) : arr;
      const oldIds = new Set(resolveIds(originalPlayers));
      const newIds = resolveIds(trimmedItem.assignedTo);
      const newlyAdded = newIds.filter((id) => !oldIds.has(id));

      let updated = managedItems.map((item) => item.id === trimmedItem.id ? trimmedItem : item);

      for (const playerId of newlyAdded) {
        const duplicate: ManagedItem = {
          ...trimmedItem,
          id: `mi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          assignedTo: [playerId],
          customFields: { ...trimmedItem.customFields },
          duplicatedFrom: trimmedItem.name || "Unknown Item",
        };
        updated = [...updated, duplicate];
      }

      if (newlyAdded.length > 0) {
        const newlyAddedSet = new Set(newlyAdded);
        updated = updated.map((item) => {
          if (item.id === trimmedItem.id) {
            const kept = trimmedItem.assignedTo.includes("all")
              ? resolveIds(trimmedItem.assignedTo).filter((id) => !newlyAddedSet.has(id))
              : trimmedItem.assignedTo.filter((id) => !newlyAddedSet.has(id));
            return { ...item, assignedTo: kept };
          }
          return item;
        });
      }

      await onPersistItems(updated);
    }

    setEditingItem(null);
    setIsAddingNewItem(false);
  };

  const handleDeleteItem = async (id: string) => {
    const next = managedItems.filter((item) => item.id !== id);
    await onPersistItems(next);
    if (editingItem?.id === id) {
      setEditingItem(null);
      setIsAddingNewItem(false);
    }
  };

  const effectKeys = useMemo(() => {
    if (!editingItem) return [] as string[];
    return Object.keys(editingItem.customFields || {})
      .filter((key) => key.startsWith(EFFECT_PREFIX))
      .sort((a, b) => parseInt(a.split("::")[1] || "0", 10) - parseInt(b.split("::")[1] || "0", 10));
  }, [editingItem]);

  const infoFields = useMemo(() => editingItem ? buildInfoFields(editingItem.customFields) : [], [editingItem]);
  const displayFacts = useMemo(() => editingItem ? buildDisplayFacts(editingItem) : [], [editingItem]);

  const filteredItems = useMemo(() => {
    const base = itemFilterTab === "all"
      ? managedItems
      : itemFilterTab === "ownerless"
        ? managedItems.filter((item) => item.assignedTo.length === 0)
        : managedItems.filter((item) => item.assignedTo.includes("all") || item.assignedTo.includes(itemFilterTab));

    const query = itemSearch.trim().toLowerCase();
    if (!query) return base;

    return base.filter((item) => {
      const ownerText = formatOwners(item.assignedTo, players).toLowerCase();
      return (
        item.name.toLowerCase().includes(query)
        || item.type.toLowerCase().includes(query)
        || item.tags.some((tag) => tag.toLowerCase().includes(query))
        || ownerText.includes(query)
        || stripHtml(item.description || "").toLowerCase().includes(query)
      );
    });
  }, [itemFilterTab, itemSearch, managedItems, players]);

  const filteredEditorTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    if (!query) return itemTags;
    return itemTags.filter((tag) => (`${tag.name} ${tag.description}`).toLowerCase().includes(query));
  }, [itemTags, tagSearch]);

  const suggestedTags = useMemo(() => getSuggestedTags(editingItem, itemTags), [editingItem, itemTags]);

  const editorSummary = useMemo(() => {
    if (!editingItem) return null;
    const allowedSlots = getAllowedSlots(editingItem.customFields);
    const quickRollCount = infoFields.filter((field) => field.rollExpression.trim()).length;
    const equippedEffectCount = infoFields.filter((field) => field.equippedEffect).length;
    const trackerCount = infoFields.filter((field) => field.trackerMode).length;
    return {
      tagCount: editingItem.tags.length,
      detailCount: infoFields.length,
      effectCount: countItemEffects(editingItem),
      ownerCount: editingItem.assignedTo.includes("all") ? players.length : editingItem.assignedTo.length,
      allowedSlots,
      quickRollCount,
      equippedEffectCount,
      trackerCount,
    };
  }, [editingItem, infoFields, players.length]);

  const showAttributeBuff = !!editingItem && ((editingItem.customFields[FIELD_KEYS.attributeName] || "").trim() || (editingItem.customFields[FIELD_KEYS.attributeAmount] || "").trim());
  const showSkillBuff = !!editingItem && ((editingItem.customFields[FIELD_KEYS.skillName] || "").trim() || (editingItem.customFields[FIELD_KEYS.skillAmount] || "").trim());
  const showResourceBuff = !!editingItem && ((editingItem.customFields[FIELD_KEYS.resourceName] || "").trim() || (editingItem.customFields[FIELD_KEYS.resourceAmount] || "").trim());
  const showDisadvantage = !!editingItem && !!(editingItem.customFields[FIELD_KEYS.disadvantageSkill] || "").trim();
  const showSource = !!editingItem && ((editingItem.customFields[FIELD_KEYS.sourcePoints] || "").trim() || editingItem.tags.some((tag) => /source/i.test(tag)));
  const showWeaponData = isWeaponItem(editingItem);

  return (
    <div className="space-y-4">
      {!creationOnly && <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage Player Items</h2>
          <div className="text-[11px] mt-1" style={S_MUTED}>
            Tags are descriptors only. Item fields, equipped effects, tracker actions, dice rolls, and slot availability are configured directly here.
          </div>
        </div>
        <button onClick={() => handleAddItem("blank")} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
          <Plus size={14} /> Add Item
        </button>
      </div>}

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} style={S_ACCENT} />
          <div className="text-[11px]" style={S_SECTION_HDR}>QUICK START TEMPLATES</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          {ITEM_TEMPLATES.map((template) => (
            <button key={template.id} onClick={() => handleAddItem(template.id)} className={`${retro.raised} text-left p-3 hover:bg-[#1A1A48] transition-colors`} style={DM_PANEL_ALT}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12px]" style={S_TEXT_BOLD}>{template.label}</span>
                <span className="text-[9px] px-1.5 py-0.5" style={dmRarityBadge(rarityColor(template.rarity))}>{template.rarity}</span>
              </div>
              <div className="text-[10px] mb-2" style={S_MUTED}>{template.description}</div>
              {template.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {template.tags.map((tag) => <span key={tag} className="text-[8px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{tag}</span>)}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {editingItem && (
        <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div>
              <div className="text-[12px]" style={S_SECTION_HDR}>
                {isAddingNewItem ? "ADD NEW ITEM" : `EDITING: ${editingItem.name || "(unnamed)"}`}
              </div>
              {editorSummary && (
                <div className="text-[10px] mt-1 flex flex-wrap gap-3" style={S_MUTED}>
                  <span>{editorSummary.tagCount} tag{editorSummary.tagCount === 1 ? "" : "s"}</span>
                  <span>{editorSummary.detailCount} information field{editorSummary.detailCount === 1 ? "" : "s"}</span>
                  <span>{editorSummary.effectCount} effect block{editorSummary.effectCount === 1 ? "" : "s"}</span>
                  <span>{editorSummary.ownerCount} owner{editorSummary.ownerCount === 1 ? "" : "s"}</span>
                  <span>{editorSummary.quickRollCount} quick roll{editorSummary.quickRollCount === 1 ? "" : "s"}</span>
                  <span>{editorSummary.equippedEffectCount} equipped effect{editorSummary.equippedEffectCount === 1 ? "" : "s"}</span>
                  <span>{editorSummary.trackerCount} tracker action{editorSummary.trackerCount === 1 ? "" : "s"}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isAddingNewItem && (
                <button onClick={duplicateAsNew} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1.5`} style={{ color: "#C4A0FF" }}>
                  <Copy size={12} /> Duplicate as New
                </button>
              )}
              <button onClick={handleCancelItemEdit} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
            </div>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {EDITOR_PANELS.filter((panel) => !creationOnly || panel.id !== "assignment").map((panel) => {
              const Icon = panel.icon;
              const active = editorPanel === panel.id;
              return (
                <button
                  key={panel.id}
                  onClick={() => setEditorPanel(panel.id)}
                  className={`${active ? retro.sunken + " bg-[#0E0E35]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-1.5 text-[11px] flex items-center gap-1.5`}
                  style={dmTabStyle(active)}
                >
                  <Icon size={12} />
                  {panel.label}
                </button>
              );
            })}
          </div>

          <div className={`${retro.raised} bg-[#101038] p-3 mb-4`}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <div>
                <div className="text-[10px]" style={S_SECTION_HDR}>ITEM WORKFLOW QUICK ACTIONS</div>
                <div className="text-[10px] mt-1" style={S_MUTED}>
                  Jump-start common item setups instead of building every field from scratch.
                </div>
              </div>
              {editorSummary && editorSummary.allowedSlots.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {editorSummary.allowedSlots.map((slot) => {
                    const slotLabel = EQUIP_SLOT_OPTIONS.find((entry) => entry.id === slot)?.label || slot;
                    return <span key={slot} className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{slotLabel}</span>;
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {ITEM_INFO_FIELD_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => addInfoFieldPreset(preset)}
                  className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1.5`}
                  style={S_ACCENT}
                  title={preset.helper}
                >
                  <Plus size={10} />
                  {preset.label}
                </button>
              ))}
              <button onClick={addEffectBlock} className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1.5`} style={{ color: "#C4A0FF" }}>
                <Sparkles size={10} /> Add Effect Block
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4">
            <div className="space-y-4">

          {editorPanel === "basics" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)] gap-4">
                <div className={`${retro.raised} bg-[#0E0E35] p-4`}>
                  <div className="text-[10px] mb-3" style={S_SECTION_HDR}>ITEM IDENTITY</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Item Name</label>
                      <input type="text" value={editingItem.name} onChange={(e) => updateItemField("name", e.target.value)} placeholder="Enter item name..." className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Item Type</label>
                      <input type="text" value={editingItem.type} onChange={(e) => updateItemField("type", e.target.value)} placeholder="e.g. Weapon, Armor, Tool..." className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Rarity</label>
                      <select value={editingItem.rarity} onChange={(e) => updateItemField("rarity", e.target.value)} className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full`} style={{ color: rarityColor(editingItem.rarity) }}>
                        {rarities.map((rarity) => <option key={rarity} value={rarity} style={{ color: rarityColor(rarity) }}>{rarity}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Weight</label>
                      <select
                        value={getItemWeightTier(editingItem) || "M"}
                        onChange={(e) => updateItemWeightTier(e.target.value as ManagedItem["weightTier"])}
                        className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full`}
                        style={inputStyle}
                      >
                        {ITEM_WEIGHT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      {(getItemWeightTier(editingItem) || "M") === "Custom" && (
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={editingItem.weightValue ?? 0}
                          onChange={(e) => updateItemField("weightValue", Math.max(0, parseFloat(e.target.value) || 0))}
                          placeholder="Custom weight"
                          className={`${inputClass} mt-2`}
                          style={inputStyle}
                        />
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="text-[10px] block mb-1" style={labelStyle}>Description</label>
                    <RichTextEditor value={editingItem.description} onChange={(html) => updateItemField("description", html)} placeholder="Describe the item, its appearance, what it does, and what makes it notable..." minHeight={160} />
                  </div>
                </div>

                <div className={`${retro.raised} bg-[#0E0E35] p-4`}>
                  <div className="text-[10px] mb-3" style={S_SECTION_HDR}>AUTHORING SNAPSHOT</div>
                  <div className={`${retro.sunken} bg-[#0A0A28] p-4 mb-3`}>
                    <div className="text-[15px] mb-1" style={S_TEXT_BOLD}>{editingItem.name || "(unnamed item)"}</div>
                    <div className="text-[11px] mb-2" style={S_MUTED}>{editingItem.type || "No type yet"}</div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="text-[9px] px-1.5 py-0.5" style={dmRarityBadge(rarityColor(editingItem.rarity))}>{editingItem.rarity}</span>
                      <span className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>Weight {formatItemWeight(editingItem)}</span>
                      {editingItem.tags.slice(0, 4).map((tag) => <span key={tag} className="text-[8px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{tag}</span>)}
                    </div>
                    <div className="text-[11px]" style={S_TEXT}>{stripHtml(editingItem.description || "") || "Add a description to see how the item reads at a glance."}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className={`${retro.sunken} bg-[#0A0A28] px-3 py-2`}>
                      <div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Allowed Slots</div>
                      <div className="text-[11px]" style={S_TEXT}>{getAllowedSlots(editingItem.customFields).length || 0}</div>
                    </div>
                    <div className={`${retro.sunken} bg-[#0A0A28] px-3 py-2`}>
                      <div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Visible Fields</div>
                      <div className="text-[11px]" style={S_TEXT}>{infoFields.length}</div>
                    </div>
                    <div className={`${retro.sunken} bg-[#0A0A28] px-3 py-2`}>
                      <div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Effect Blocks</div>
                      <div className="text-[11px]" style={S_TEXT}>{countItemEffects(editingItem)}</div>
                    </div>
                    <div className={`${retro.sunken} bg-[#0A0A28] px-3 py-2`}>
                      <div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Weight</div>
                      <div className="text-[11px]" style={S_TEXT}>{formatItemWeight(editingItem)}</div>
                    </div>
                    <div className={`${retro.sunken} bg-[#0A0A28] px-3 py-2`}>
                      <div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Tracker Fields</div>
                      <div className="text-[11px]" style={S_TEXT}>{infoFields.filter((field) => field.trackerMode).length}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {editorPanel === "assignment" && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] block mb-1" style={labelStyle}>Assign to Players</label>
                <div className={`${retro.sunken} bg-[#0A0A28] p-3`}>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editingItem.assignedTo.includes("all")} onChange={(e) => updateItemField("assignedTo", e.target.checked ? ["all"] : [])} className="accent-[#4A9A5A]" />
                      <span className="text-[12px]" style={S_GREEN_BTN}>All Players</span>
                    </label>
                    <button onClick={() => updateItemField("assignedTo", [])} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_TEXT}>Clear</button>
                  </div>
                  <div className="h-[1px] mb-3" style={DM_DIVIDER} />
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {players.map((player) => (
                      <label key={player.id} className={`${retro.raised} bg-[#11113C] px-3 py-2 flex items-center gap-2 cursor-pointer`}>
                        <input
                          type="checkbox"
                          disabled={editingItem.assignedTo.includes("all")}
                          checked={editingItem.assignedTo.includes("all") || editingItem.assignedTo.includes(player.id)}
                          onChange={(e) => {
                            const current = editingItem.assignedTo.filter((id) => id !== "all");
                            if (e.target.checked) updateItemField("assignedTo", [...current, player.id]);
                            else updateItemField("assignedTo", current.filter((id) => id !== player.id));
                          }}
                          className="accent-[#4A7BFF]"
                        />
                        <span className="text-[12px]" style={dmAssignDim(editingItem.assignedTo.includes("all"))}>{player.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!editingItem.locked} onChange={(e) => updateItemField("locked", e.target.checked)} className="accent-[#FF6A6A]" />
                  <span className="text-[12px] flex items-center gap-1.5" style={dmLockColor(!!editingItem.locked)}>
                    <Lock size={12} />
                    {editingItem.locked ? "Locked. Players cannot edit this item." : "Unlocked. Players can edit this item."}
                  </span>
                </label>
              </div>
            </div>
          )}

          {editorPanel === "tags" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] gap-4">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="text-[10px]" style={labelStyle}>Search Tags</label>
                    {onPersistTags && (
                      <button
                        type="button"
                        onClick={() => {
                          if (creatingTag) resetTagCreator();
                          else {
                            setCreatingTag(true);
                            setNewTagName(tagSearch.trim());
                            setTagSaveError("");
                          }
                        }}
                        className={`${retro.button} px-2 py-1 text-[9px] inline-flex items-center gap-1`}
                        style={creatingTag ? S_RED : S_GREEN_BTN}
                      >
                        {creatingTag ? <X size={9} /> : <Plus size={9} />}
                        {creatingTag ? "Cancel" : "Create Tag"}
                      </button>
                    )}
                  </div>
                  <div className="relative mb-3">
                    <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2" style={S_MUTED} />
                    <input value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="Search item tags..." className={`${inputClass} pl-7`} style={inputStyle} />
                  </div>
                  {creatingTag && (
                    <div className={`${retro.raised} mb-3 bg-[#101038] p-3`}>
                      <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,0.7fr)_minmax(240px,1.3fr)_auto] gap-2 items-end">
                        <div>
                          <label className="text-[9px] block mb-1" style={labelStyle}>Tag Name</label>
                          <input
                            autoFocus
                            value={newTagName}
                            onChange={(event) => setNewTagName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void createItemTag();
                            }}
                            placeholder="e.g. Versatile"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] block mb-1" style={labelStyle}>Description</label>
                          <input
                            value={newTagDescription}
                            onChange={(event) => setNewTagDescription(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void createItemTag();
                            }}
                            placeholder="Optional tag meaning"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void createItemTag()}
                          disabled={tagSaving}
                          className={`${retro.button} h-[34px] px-3 text-[10px] inline-flex items-center justify-center gap-1.5`}
                          style={tagSaving ? S_MUTED : S_GREEN_BTN}
                        >
                          <Save size={10} /> {tagSaving ? "Saving..." : "Save Tag"}
                        </button>
                      </div>
                      {tagSaveError && <div className="text-[10px] mt-2" style={S_RED}>{tagSaveError}</div>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {filteredEditorTags.map((tag) => {
                      const active = editingItem.tags.includes(tag.name);
                      return (
                        <button key={tag.id} onClick={() => toggleItemTag(tag.name)} className="text-[10px] px-2.5 py-1 transition-colors flex items-center gap-1" style={dmActiveBtn(active)}>
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                  <div className="text-[10px] mb-2" style={S_SECTION_HDR}>SELECTED TAGS</div>
                  {editingItem.tags.length === 0 ? (
                    <div className="text-[11px]" style={S_MUTED}>No tags selected yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {editingItem.tags.map((tag) => <span key={tag} className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{tag}</span>)}
                    </div>
                  )}

                  <div className="text-[10px] mb-2" style={S_SECTION_HDR}>SUGGESTED TAGS</div>
                  {suggestedTags.length === 0 ? (
                    <div className="text-[11px]" style={S_MUTED}>Suggestions appear based on the item name, type, description, and effect state.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedTags.map((tag) => (
                        <button key={tag.id} onClick={() => toggleItemTag(tag.name)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>
                          Add {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {editorPanel === "details" && (
            <div className="space-y-4">
              <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <div>
                    <div className="text-[10px]" style={S_SECTION_HDR}>EQUIPMENT AVAILABILITY</div>
                    <div className="text-[10px] mt-1" style={S_MUTED}>
                      Pick every Equipped slot this item is allowed to use in Personal Files.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {EQUIP_SLOT_PRESETS.map((preset) => (
                      <button key={preset.id} onClick={() => applyEquipSlotPreset([...preset.slots], preset.hands)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_ACCENT}>
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
                  {EQUIP_SLOT_OPTIONS.map((slot) => {
                    const checked = getAllowedSlots(editingItem.customFields).includes(slot.id);
                    return (
                      <label key={slot.id} className={`${retro.raised} bg-[#11113C] px-3 py-2 flex items-center gap-2 cursor-pointer`}>
                        <input type="checkbox" checked={checked} onChange={(e) => updateAllowedSlots(slot.id, e.target.checked)} className="accent-[#4A7BFF]" />
                        <span className="text-[11px]" style={S_TEXT}>{slot.label}</span>
                      </label>
                    );
                  })}
                </div>
                {showWeaponData && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#272752] pt-3">
                    <span className="text-[10px] mr-1" style={labelStyle}>Hands Required</span>
                    {(["1", "2"] as const).map((hands) => {
                      const active = (editingItem.customFields[FIELD_KEYS.equipmentHands] || "1") === hands;
                      return (
                        <button
                          key={hands}
                          type="button"
                          onClick={() => setEquipmentHands(hands)}
                          className="px-3 py-1.5 text-[10px]"
                          style={dmActiveBtn(active)}
                        >
                          {hands === "2" ? "Two-Handed" : "One-Handed"}
                        </button>
                      );
                    })}
                    {editingItem.customFields[FIELD_KEYS.equipmentHands] === "2" && (
                      <span className="text-[9px]" style={S_MUTED}>Occupies both weapon slots when equipped.</span>
                    )}
                  </div>
                )}
              </div>

              <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>ITEM DATA</div>
                <div className="text-[10px] mb-3" style={S_MUTED}>
                  Use these structured fields for buffs, resources, and equipment behavior. Tags do not create fields anymore.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] block mb-1" style={labelStyle}>Attribute Buff</label>
                    <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                      <select value={editingItem.customFields[FIELD_KEYS.attributeName] || ""} onChange={(e) => updateItemCustomField(FIELD_KEYS.attributeName, e.target.value)} className={inputClass} style={inputStyle}>
                        <option value="">None</option>
                        {ATTRS.map((attr) => <option key={attr} value={attr}>{attr}</option>)}
                      </select>
                      <input type="number" value={editingItem.customFields[FIELD_KEYS.attributeAmount] || ""} onChange={(e) => updateItemCustomField(FIELD_KEYS.attributeAmount, e.target.value)} placeholder="Amt" className={inputClass} style={inputStyle} />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] block mb-1" style={labelStyle}>Skill Buff</label>
                    <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                      <select value={editingItem.customFields[FIELD_KEYS.skillName] || ""} onChange={(e) => updateItemCustomField(FIELD_KEYS.skillName, e.target.value)} className={inputClass} style={inputStyle}>
                        <option value="">None</option>
                        {ALL_SKILLS.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
                      </select>
                      <input type="number" value={editingItem.customFields[FIELD_KEYS.skillAmount] || ""} onChange={(e) => updateItemCustomField(FIELD_KEYS.skillAmount, e.target.value)} placeholder="Amt" className={inputClass} style={inputStyle} />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] block mb-1" style={labelStyle}>Resource Buff</label>
                    <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                      <select value={editingItem.customFields[FIELD_KEYS.resourceName] || ""} onChange={(e) => updateItemCustomField(FIELD_KEYS.resourceName, e.target.value)} className={inputClass} style={inputStyle}>
                        <option value="">None</option>
                        {ALL_RESOURCES.map((resource) => <option key={resource} value={resource}>{resource}</option>)}
                      </select>
                      <input type="number" value={editingItem.customFields[FIELD_KEYS.resourceAmount] || ""} onChange={(e) => updateItemCustomField(FIELD_KEYS.resourceAmount, e.target.value)} placeholder="Amt" className={inputClass} style={inputStyle} />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] block mb-1" style={labelStyle}>Disadvantage Skill</label>
                    <select value={editingItem.customFields[FIELD_KEYS.disadvantageSkill] || ""} onChange={(e) => updateItemCustomField(FIELD_KEYS.disadvantageSkill, e.target.value)} className={inputClass} style={inputStyle}>
                      <option value="">None</option>
                      {ALL_SKILLS.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] block mb-1" style={labelStyle}>Source Points</label>
                    <input type="number" value={editingItem.customFields[FIELD_KEYS.sourcePoints] || ""} onChange={(e) => updateItemCustomField(FIELD_KEYS.sourcePoints, e.target.value)} placeholder="e.g. 3" className={inputClass} style={inputStyle} />
                  </div>
                </div>
              </div>

              <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <div>
                    <div className="text-[10px]" style={S_SECTION_HDR}>ITEM INFORMATION FIELDS</div>
                    <div className="text-[10px] mt-1" style={S_MUTED}>
                      Create visible item fields, place them above or below the description, and optionally give them dice rolls, equipped effects, or tracker actions.
                    </div>
                  </div>
                  <button onClick={addInfoField} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={S_ACCENT}>
                    <Plus size={10} /> Add Information Field
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {showWeaponData && (
                    <button
                      type="button"
                      onClick={addWeaponInfoFields}
                      className={`${retro.button} px-2 py-1 text-[9px] inline-flex items-center gap-1`}
                      style={{ color: "#FFD166" }}
                      title="Add Weapon Type, Damage, Range, Reload, Capacity, and Ammunition fields"
                    >
                      <Plus size={10} /> Add Weapon Details
                    </button>
                  )}
                  {ITEM_INFO_FIELD_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => addInfoFieldPreset(preset)}
                      className={`${retro.button} px-2 py-1 text-[9px]`}
                      style={{ color: "#8AB8FF" }}
                      title={preset.helper}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {infoFields.length === 0 ? (
                  <div className="text-[11px]" style={S_MUTED}>No information fields yet.</div>
                ) : (
                  <div className="space-y-4">
                    {infoFields.map((field, index) => {
                      const expanded = (activeInfoFieldId || infoFields[0]?.fieldId) === field.fieldId;
                      const isWeaponDamageField = showWeaponData
                        && (field.weaponDamage || field.label.trim().toLowerCase() === "damage");
                      return (
                      <div key={field.fieldId} className={`${retro.sunken} bg-[#0A0A28] p-3`}>
                        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setActiveInfoFieldId(field.fieldId)}
                            className="min-w-0 text-left inline-flex items-start gap-2"
                            aria-expanded={expanded}
                          >
                            <ChevronDown size={12} className="mt-0.5 shrink-0 transition-transform" style={{ ...S_ACCENT, transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }} />
                            <span className="min-w-0">
                              <span className="text-[10px] block" style={S_SECTION_HDR}>FIELD #{index + 1}: {field.label || "New Field"}</span>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {field.rollExpression && <span className="text-[8px] px-1.5 py-0.5" style={DM_TAG_BADGE}><Dices size={8} className="inline mr-1" />Dice</span>}
                              {field.equippedEffect && <span className="text-[8px] px-1.5 py-0.5" style={DM_TAG_BADGE}><Sparkles size={8} className="inline mr-1" />Equipped</span>}
                              {field.trackerMode && <span className="text-[8px] px-1.5 py-0.5" style={DM_TAG_BADGE}><Play size={8} className="inline mr-1" />{field.trackerMode === "ability" ? "Card" : "Status"}</span>}
                            </div>
                            </span>
                          </button>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => moveInfoField(field.fieldId, -1)} disabled={index === 0} className={`${retro.button} px-2 py-1 text-[9px]`} style={index === 0 ? S_MUTED : S_TEXT}>Up</button>
                            <button onClick={() => moveInfoField(field.fieldId, 1)} disabled={index === infoFields.length - 1} className={`${retro.button} px-2 py-1 text-[9px]`} style={index === infoFields.length - 1 ? S_MUTED : S_TEXT}>Down</button>
                            <button onClick={() => duplicateInfoField(field.fieldId)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_ACCENT}>Duplicate</button>
                            <button onClick={() => removeInfoField(field.fieldId)} className="hover:opacity-80"><X size={12} style={S_RED} /></button>
                          </div>
                        </div>

                        {expanded && <>
                        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px] gap-3 mb-3">
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Field Label</label>
                            <input type="text" value={field.label} onChange={(e) => updateInfoField(field.fieldId, INFO_LABEL, e.target.value)} placeholder="e.g. Damage, Trigger, Passive Note" className={inputClass} style={inputStyle} />
                          </div>
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Display Position</label>
                            <select value={field.placement} onChange={(e) => updateInfoField(field.fieldId, INFO_PLACEMENT, e.target.value)} className={inputClass} style={inputStyle}>
                              <option value="above">Above Description</option>
                              <option value="below">Below Description</option>
                            </select>
                          </div>
                        </div>

                        {isWeaponDamageField ? (
                          <div className={`${retro.raised} bg-[#0E0E35] p-3 mb-3`}>
                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(160px,0.7fr)_170px] gap-3 mb-3">
                              <div>
                                <label className="text-[10px] block mb-1" style={labelStyle}>Displayed Damage</label>
                                <textarea
                                  value={stripHtml(field.content)}
                                  onChange={(event) => updateInfoField(field.fieldId, INFO_CONTENT, event.target.value)}
                                  placeholder={INFO_FIELD_CONTENT_PLACEHOLDERS.damage}
                                  rows={2}
                                  className={`${inputClass} resize-y`}
                                  style={inputStyle}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] block mb-1" style={labelStyle}>Damage Dice</label>
                                <input type="text" value={field.rollExpression} onChange={(event) => updateInfoField(field.fieldId, INFO_ROLL_EXPRESSION, event.target.value)} placeholder="e.g. 3d6" className={inputClass} style={inputStyle} />
                              </div>
                              <div>
                                <label className="text-[10px] block mb-1" style={labelStyle}>Damage Attribute</label>
                                <select value={field.damageAttribute || "STR"} onChange={(event) => updateInfoField(field.fieldId, INFO_DAMAGE_ATTRIBUTE, event.target.value)} className={inputClass} style={inputStyle}>
                                  <option value="STR">Strength</option>
                                  <option value="AGI">Agility</option>
                                </select>
                              </div>
                            </div>
                            <div className="max-w-sm">
                              <label className="text-[10px] block mb-1" style={labelStyle}>Use Button Label</label>
                              <input type="text" value={field.rollLabel} onChange={(event) => updateInfoField(field.fieldId, INFO_ROLL_LABEL, event.target.value)} placeholder="Use / Roll Damage" className={inputClass} style={inputStyle} />
                            </div>
                            {isVersatileItem(editingItem) && (
                              <div className="text-[9px] mt-2" style={S_ACCENT}>
                                Versatile uses the higher effective Strength or Agility modifier when the player rolls damage.
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="mb-3">
                              <label className="text-[10px] block mb-1" style={labelStyle}>Field Content</label>
                              <RichTextEditor
                                value={field.content}
                                onChange={(html) => updateInfoField(field.fieldId, INFO_CONTENT, html)}
                                placeholder={INFO_FIELD_CONTENT_PLACEHOLDERS[field.label.trim().toLowerCase()] || "Write the player-facing content for this field..."}
                                minHeight={70}
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_160px] gap-3 mb-3">
                              <div>
                                <label className="text-[10px] block mb-1" style={labelStyle}>Dice Button Label</label>
                                <input type="text" value={field.rollLabel} onChange={(e) => updateInfoField(field.fieldId, INFO_ROLL_LABEL, e.target.value)} placeholder="Defaults to field label" className={inputClass} style={inputStyle} />
                              </div>
                              <div>
                                <label className="text-[10px] block mb-1" style={labelStyle}>Dice Roll Expression</label>
                                <input type="text" value={field.rollExpression} onChange={(e) => updateInfoField(field.fieldId, INFO_ROLL_EXPRESSION, e.target.value)} placeholder="e.g. 2d6+P" className={inputClass} style={inputStyle} />
                              </div>
                              <div>
                                <label className="text-[10px] block mb-1" style={labelStyle}>Dice Potency</label>
                                <input type="text" value={field.rollPotency} onChange={(e) => updateInfoField(field.fieldId, INFO_ROLL_POTENCY, e.target.value)} placeholder="Optional" className={inputClass} style={inputStyle} />
                              </div>
                            </div>
                          </>
                        )}

                        <div className={`${retro.raised} bg-[#0E0E35] p-3 mb-3`}>
                          <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input type="checkbox" checked={field.equippedEffect} onChange={(e) => updateInfoField(field.fieldId, INFO_EQUIPPED, e.target.checked)} className="accent-[#4A7BFF]" />
                            <span className="text-[11px]" style={S_TEXT}>Show this field in Personal Files → Equipped → Effects when the item is equipped.</span>
                          </label>
                          {field.equippedEffect && (
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Equipped Effect Text Override</label>
                              <RichTextEditor value={field.equippedEffectText} onChange={(html) => updateInfoField(field.fieldId, INFO_EQUIPPED_TEXT, html)} placeholder="Leave empty to reuse the field content." minHeight={60} />
                            </div>
                          )}
                        </div>

                        <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Play size={12} style={S_ACCENT} />
                            <div className="text-[10px]" style={S_SECTION_HDR}>TRACKER ACTION</div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)_140px] gap-3 mb-3">
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Tracker Mode</label>
                              <select value={field.trackerMode} onChange={(e) => updateInfoField(field.fieldId, INFO_TRACKER_MODE, e.target.value)} className={inputClass} style={inputStyle}>
                                <option value="">None</option>
                                <option value="status">Status Effect</option>
                                <option value="ability">Card Effect</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Tracker Name</label>
                              <input type="text" value={field.trackerName} onChange={(e) => updateInfoField(field.fieldId, INFO_TRACKER_NAME, e.target.value)} placeholder="Defaults to field label or item name" className={inputClass} style={inputStyle} />
                            </div>
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Duration</label>
                              <input type="text" value={field.trackerDuration} onChange={(e) => updateInfoField(field.fieldId, INFO_TRACKER_DURATION, e.target.value)} placeholder="1" className={inputClass} style={inputStyle} />
                            </div>
                          </div>

                          {field.trackerMode && (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                <div>
                                  <label className="text-[10px] block mb-1" style={labelStyle}>Tracker Potency</label>
                                  <input type="text" value={field.trackerPotency} onChange={(e) => updateInfoField(field.fieldId, INFO_TRACKER_POTENCY, e.target.value)} placeholder="Optional" className={inputClass} style={inputStyle} />
                                </div>
                                <div>
                                  <label className="text-[10px] block mb-1" style={labelStyle}>Tracker Damage</label>
                                  <input type="text" value={field.trackerDamage} onChange={(e) => updateInfoField(field.fieldId, INFO_TRACKER_DAMAGE, e.target.value)} placeholder="e.g. 1d6+P" className={inputClass} style={inputStyle} />
                                </div>
                                <div>
                                  <label className="text-[10px] block mb-1" style={labelStyle}>Buff Type</label>
                                  <select value={field.trackerBuffType} onChange={(e) => updateInfoField(field.fieldId, INFO_TRACKER_BUFF_TYPE, e.target.value)} className={inputClass} style={inputStyle}>
                                    <option value="">None</option>
                                    <option value="attribute">Attribute</option>
                                    <option value="skill">Skill</option>
                                    <option value="resource">Resource</option>
                                  </select>
                                </div>
                              </div>

                              {field.trackerBuffType && (
                                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px] gap-3 mb-3">
                                  <div>
                                    <label className="text-[10px] block mb-1" style={labelStyle}>Buff Target</label>
                                    <select value={field.trackerBuffTarget} onChange={(e) => updateInfoField(field.fieldId, INFO_TRACKER_BUFF_TARGET, e.target.value)} className={inputClass} style={inputStyle}>
                                      <option value="">Select target</option>
                                      {(field.trackerBuffType === "attribute" ? ATTRS : field.trackerBuffType === "skill" ? ALL_SKILLS : ALL_RESOURCES).map((entry) => (
                                        <option key={entry} value={entry}>{entry}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] block mb-1" style={labelStyle}>Buff Value</label>
                                    <input type="text" value={field.trackerBuffValue} onChange={(e) => updateInfoField(field.fieldId, INFO_TRACKER_BUFF_VALUE, e.target.value)} placeholder="e.g. +2 or P" className={inputClass} style={inputStyle} />
                                  </div>
                                </div>
                              )}

                              <div>
                                <label className="text-[10px] block mb-1" style={labelStyle}>Tracker Description</label>
                                <RichTextEditor value={field.trackerDescription} onChange={(html) => updateInfoField(field.fieldId, INFO_TRACKER_DESCRIPTION, html)} placeholder="Leave empty to reuse the field content." minHeight={60} />
                              </div>
                            </>
                          )}
                        </div>
                        </>}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {editorPanel === "effects" && (
            <div className="space-y-4">
              <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <div>
                    <div className="text-[10px]" style={S_SECTION_HDR}>EFFECT DESCRIPTIONS</div>
                    <div className="text-[10px] mt-1" style={S_MUTED}>Use multiple effect blocks when an item grants more than one player-facing rule or benefit.</div>
                  </div>
                  <button onClick={addEffectBlock} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: "#C4A0FF" }}>
                    <Plus size={10} /> Add Effect
                  </button>
                </div>

                {effectKeys.length === 0 ? (
                  <div className="text-[11px]" style={S_MUTED}>No effect blocks yet.</div>
                ) : (
                  <div className="space-y-3">
                    {effectKeys.map((key, index) => (
                      <div key={key} className={`${retro.sunken} bg-[#0A0A28] p-3`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="text-[9px]" style={S_SUBTLE}>Effect #{index + 1}</label>
                          <button onClick={() => removeEffectBlock(key)} className="hover:opacity-80"><X size={12} style={S_RED} /></button>
                        </div>
                        <RichTextEditor value={editingItem.customFields[key] || ""} onChange={(html) => updateItemCustomField(key, html)} placeholder="Describe the effect this item grants..." minHeight={80} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>NOTES</div>
                <div className="text-[10px]" style={S_MUTED}>
                  Dice roll buttons now belong on information fields. Use Item Data for buffs/resources/slot availability, and use Information Fields when you want visible content above or below the description.
                </div>
              </div>
            </div>
          )}

          {editorPanel === "preview" && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)] gap-4">
              <div className={`${retro.raised} bg-[#0E0E35] p-4`}>
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div>
                    <div className="text-[16px]" style={S_TEXT_BOLD}>{editingItem.name || "(unnamed item)"}</div>
                    <div className="text-[11px] mt-0.5" style={S_MUTED}>
                      {editingItem.type || "No type yet"} | Weight {formatItemWeight(editingItem)} | Assigned to: {formatOwners(editingItem.assignedTo, players)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5" style={dmRarityBadge(rarityColor(editingItem.rarity))}>{editingItem.rarity}</span>
                    {editingItem.locked && <span className="text-[8px] px-1.5 py-0.5 flex items-center gap-0.5" style={DM_LOCKED_BADGE}><Lock size={8} /> LOCKED</span>}
                  </div>
                </div>

                {editingItem.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {editingItem.tags.map((tag) => <span key={tag} className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{tag}</span>)}
                  </div>
                )}

                {infoFields.filter((field) => field.placement === "above").map((field) => (
                  <div key={field.fieldId} className={`${retro.sunken} bg-[#0A0A28] p-3 mb-3`}>
                    <div className="text-[9px] mb-1" style={S_SECTION_HDR}>{field.label || "Field"}</div>
                    <div className="text-[11px]" style={S_TEXT}>{stripHtml(field.content)}</div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {field.rollExpression && <span className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}><Dices size={9} className="inline mr-1" />{field.rollLabel || field.rollExpression}</span>}
                      {field.equippedEffect && <span className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}><Sparkles size={9} className="inline mr-1" />Equipped Effect</span>}
                      {field.trackerMode && <span className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}><Play size={9} className="inline mr-1" />{field.trackerMode === "ability" ? "Card Effect" : "Status Effect"}</span>}
                    </div>
                  </div>
                ))}

                {stripHtml(editingItem.description || "") ? (
                  <div className={`${retro.sunken} bg-[#0A0A28] p-3 mb-3`}>
                    <div className="text-[9px] mb-1" style={S_SECTION_HDR}>DESCRIPTION</div>
                    <div className="text-[11px]" style={S_TEXT}>{stripHtml(editingItem.description)}</div>
                  </div>
                ) : (
                  <div className="text-[11px] mb-3" style={S_MUTED}>No description written yet.</div>
                )}

                {infoFields.filter((field) => field.placement === "below").map((field) => (
                  <div key={field.fieldId} className={`${retro.sunken} bg-[#0A0A28] p-3 mb-3`}>
                    <div className="text-[9px] mb-1" style={S_SECTION_HDR}>{field.label || "Field"}</div>
                    <div className="text-[11px]" style={S_TEXT}>{stripHtml(field.content)}</div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {field.rollExpression && <span className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}><Dices size={9} className="inline mr-1" />{field.rollLabel || field.rollExpression}</span>}
                      {field.equippedEffect && <span className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}><Sparkles size={9} className="inline mr-1" />Equipped Effect</span>}
                      {field.trackerMode && <span className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}><Play size={9} className="inline mr-1" />{field.trackerMode === "ability" ? "Card Effect" : "Status Effect"}</span>}
                    </div>
                  </div>
                ))}

                {effectKeys.filter((key) => (editingItem.customFields[key] || "").trim()).length > 0 && (
                  <div className="space-y-2">
                    {effectKeys.filter((key) => (editingItem.customFields[key] || "").trim()).map((key, index) => (
                      <div key={key} className={`${retro.sunken} bg-[#0A0A28] p-3`}>
                        {effectKeys.length > 1 && <div className="text-[9px] mb-1" style={{ color: "#7A6ABB", fontWeight: 600 }}>Effect #{index + 1}</div>}
                        <div className="text-[11px]" style={S_TEXT}>{stripHtml(editingItem.customFields[key])}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={`${retro.raised} bg-[#0E0E35] p-4`}>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PREVIEW DATA</div>
                {displayFacts.length > 0 ? (
                  <div className="space-y-2">
                    {displayFacts.map((fact) => (
                      <div key={fact.key} className={`${retro.sunken} bg-[#0A0A28] px-3 py-2`}>
                        <div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>{fact.label}</div>
                        <div className="text-[11px]" style={S_TEXT}>{fact.value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px]" style={S_MUTED}>No structured item data yet.</div>
                )}
              </div>
            </div>
          )}

            </div>

            <div className="space-y-4 xl:sticky xl:top-4 self-start">
              <div className={`${retro.raised} bg-[#101038] p-4`}>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>ITEM CREATION SUMMARY</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Tags", value: String(editorSummary?.tagCount || 0) },
                    { label: "Info Fields", value: String(editorSummary?.detailCount || 0) },
                    { label: "Effects", value: String(editorSummary?.effectCount || 0) },
                    { label: "Quick Rolls", value: String(editorSummary?.quickRollCount || 0) },
                    { label: "Equipped Effects", value: String(editorSummary?.equippedEffectCount || 0) },
                    { label: "Tracker Actions", value: String(editorSummary?.trackerCount || 0) },
                  ].map((entry) => (
                    <div key={entry.label} className={`${retro.sunken} bg-[#0A0A28] px-3 py-2`}>
                      <div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>{entry.label}</div>
                      <div className="text-[12px]" style={S_TEXT_BOLD}>{entry.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${retro.raised} bg-[#101038] p-4`}>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>SLOT PRESETS</div>
                <div className="text-[10px] mb-3" style={S_MUTED}>
                  Fast-apply common slot layouts, then fine tune in Item Data.
                </div>
                <div className="flex flex-wrap gap-2">
                  {EQUIP_SLOT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => applyEquipSlotPreset([...preset.slots])}
                      className={`${retro.button} px-2.5 py-1.5 text-[10px]`}
                      style={S_ACCENT}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`${retro.raised} bg-[#101038] p-4`}>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>AUTHORING GUIDANCE</div>
                <div className="space-y-2 text-[10px]" style={S_MUTED}>
                  <div>Use <span style={S_TEXT_BOLD}>Basics</span> for identity and full write-up.</div>
                  <div>Use <span style={S_TEXT_BOLD}>Tags</span> for discovery and filtering only.</div>
                  <div>Use <span style={S_TEXT_BOLD}>Item Data</span> for slot access, buffs, source points, and information fields.</div>
                  <div>Use <span style={S_TEXT_BOLD}>Effects</span> for freeform rule blocks that sit below the core description.</div>
                  <div>Use <span style={S_TEXT_BOLD}>Preview</span> to verify the player-facing presentation before saving.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4 flex-wrap">
            <button onClick={handleSaveItem} disabled={!editingItem.name.trim()} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={editingItem.name.trim() ? S_GREEN_BTN : { color: "#5A6A8A", border: "1px solid #2A2A4A", background: "#121233" }}>
              <Save size={14} /> {isAddingNewItem ? "Add Item" : "Save Changes"}
            </button>
            <button onClick={handleCancelItemEdit} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
          </div>
        </div>
      )}

      {!creationOnly && <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div className="text-[12px]" style={S_SECTION_HDR}>ITEM LIBRARY ({filteredItems.length})</div>
            <div className="text-[10px] mt-1" style={S_MUTED}>Browse templates, player items, and duplicated variants.</div>
          </div>
          <div className="relative min-w-[220px]">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2" style={S_MUTED} />
            <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search items..." className={`${inputClass} pl-7`} style={inputStyle} />
          </div>
        </div>

        <div className="flex items-center gap-1 mb-3 overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#2A2A5B #0C0C2E" }}>
          {[{ id: "all", label: "All" }, { id: "ownerless", label: "Templates" }, ...players.map((player) => ({ id: player.id, label: player.name }))].map((tab) => {
            const count = tab.id === "all"
              ? managedItems.length
              : tab.id === "ownerless"
                ? managedItems.filter((item) => item.assignedTo.length === 0).length
                : managedItems.filter((item) => item.assignedTo.includes("all") || item.assignedTo.includes(tab.id)).length;
            return (
              <button key={tab.id} onClick={() => setItemFilterTab(tab.id)} className={`${itemFilterTab === tab.id ? retro.sunken + " bg-[#0E0E35]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-1.5 text-[10px] shrink-0 transition-colors`} style={dmTabStyle(itemFilterTab === tab.id)}>
                {tab.label}<span className="ml-1 text-[8px] opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-[12px] text-center py-6" style={S_MUTED}>No items match this view.</div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((item) => {
              const ownerStr = formatOwners(item.assignedTo, players);
              const previewText = stripHtml(item.description || "");
              const facts = buildDisplayFacts(item);
              const fieldCount = buildInfoFields(item.customFields || {}).length;
              return (
                <div key={item.id} className={`${retro.raised} bg-[#0E0E35] p-3`}>
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[13px]" style={S_TEXT_BOLD}>{item.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5" style={dmRarityBadge(rarityColor(item.rarity))}>{item.rarity}</span>
                        {getItemWeightValue(item) !== null && <span className="text-[8px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{formatItemWeight(item)}</span>}
                        {item.locked && <span className="text-[8px] px-1.5 py-0.5 flex items-center gap-0.5" style={DM_LOCKED_BADGE}><Lock size={8} /> LOCKED</span>}
                      </div>
                      <div className="text-[10px] mb-1" style={S_MUTED}>{item.type || "No type"} · {ownerStr}</div>
                      {previewText && <div className="text-[11px] line-clamp-2" style={S_TEXT}>{previewText}</div>}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {item.tags.map((tag) => <span key={tag} className="text-[8px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{tag}</span>)}
                        {fieldCount > 0 && <span className="text-[8px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{fieldCount} field{fieldCount === 1 ? "" : "s"}</span>}
                      </div>
                      {facts.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                          {facts.slice(0, 4).map((fact) => (
                            <span key={fact.key} className="text-[9px]">
                              <span style={S_MUTED}>{fact.label}:</span> <span style={S_TEXT}>{fact.value}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={() => startEditingItem(item)} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1.5`} style={S_ACCENT}>
                        <Edit size={12} /> Edit
                      </button>
                      <button onClick={() => handleDeleteItem(item.id)} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1.5`} style={S_RED}>
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>}
    </div>
  );
}
