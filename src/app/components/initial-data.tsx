// ========================
// Shared initial data used by both dm-area.tsx and login-page.tsx
// This ensures the login page can display profiles even before the DM Area is visited.
// Cache-bust v3
// ========================
import { safeGetItem, safeSetItem, safeSetJson } from "./safe-storage";

export interface InitialPlayerData {
  id: string;
  name: string;
  race?: string;
  class: string;
  level: number;
  hpIncreasePerLevel?: string;
  authCode: string;
  stats: { STR: number; AGI: number; CON: number; KNOW: number; WIS: number; WILL: number };
  currentHP: number;
  maxHP: number;
  armorClass: number;
  speed: string;
  woundDice: string;
  currentWounds: number;
  totalWounds: number;
  damageReduction: number;
  tempHP: number;
  currentWeight: number;
  maxWeight: number;
  autoMaxWeight?: boolean;
  exhaustion: number;
  maxExhaustion: number;
}

export const initialPlayers: InitialPlayerData[] = [
  {
    id: "player-1", name: "Agent Phoenix", race: "Human", class: "Operative", level: 5, hpIncreasePerLevel: "+9",
    stats: { STR: 14, AGI: 12, CON: 13, KNOW: 10, WIS: 11, WILL: 8 },
    currentHP: 45, maxHP: 45, armorClass: 15, speed: "30 ft",
    woundDice: "1d6", currentWounds: 0, totalWounds: 5, authCode: "",
    damageReduction: 0, tempHP: 0, currentWeight: 22, maxWeight: 140, autoMaxWeight: false, exhaustion: 0, maxExhaustion: 6,
  },
  {
    id: "player-2", name: "Agent Shadow", race: "Human", class: "Infiltrator", level: 4, hpIncreasePerLevel: "+7",
    stats: { STR: 8, AGI: 16, CON: 10, KNOW: 12, WIS: 14, WILL: 10 },
    currentHP: 32, maxHP: 32, armorClass: 14, speed: "35 ft",
    woundDice: "1d6", currentWounds: 1, totalWounds: 4, authCode: "",
    damageReduction: 0, tempHP: 0, currentWeight: 15, maxWeight: 80, autoMaxWeight: false, exhaustion: 0, maxExhaustion: 6,
  },
  {
    id: "player-3", name: "Agent Atlas", race: "Human", class: "Enforcer", level: 5, hpIncreasePerLevel: "+11",
    stats: { STR: 18, AGI: 8, CON: 16, KNOW: 8, WIS: 10, WILL: 12 },
    currentHP: 58, maxHP: 58, armorClass: 17, speed: "25 ft",
    woundDice: "1d8", currentWounds: 0, totalWounds: 6, authCode: "",
    damageReduction: 2, tempHP: 0, currentWeight: 65, maxWeight: 180, autoMaxWeight: false, exhaustion: 0, maxExhaustion: 6,
  },
];

// ========================
// Initial Items, Cards, Info, and Tags
// Shared so that all consumers (personal-files, intelli-interface, etc.)
// can access default data even before the DM Area has been visited.
// ========================

export type { TagField, TagDefinition } from "./types";
import type { TagField, TagDefinition } from "./types";

export interface InitialItem {
  id: string;
  name: string;
  rarity: string;
  type: string;
  tags: string[];
  description: string;
  assignedTo: string[];
  customFields: Record<string, string>;
}

export interface InitialCard {
  id: string;
  name: string;
  type: string;
  actionCost: string;
  tags: string[];
  effect: string;
  assignedTo: string[];
  customFields: Record<string, string>;
  nodeTreeId?: string;
  nodeId?: string;
}

const LEGACY_USE_BUTTON_TAG = "use-able";
const USE_BUTTON_ENABLED_TAG = "Use Button Enabled";

export interface InfoFollowUp {
  id: string;
  content: string;
  createdAt: string;
}

export interface InitialInfo {
  id: string;
  title: string;
  tags: string[];
  content: string;
  assignedTo: string[];
  customFields: Record<string, string>;
  category?: string;
  followUps?: InfoFollowUp[];
}

export const initialItemTags: TagDefinition[] = [
  { id: "itag-1", name: "Weapon", description: "An item used for combat, dealing damage to enemies.", fields: [{ id: "f1", name: "Damage", type: "dice", placeholder: "e.g. 2d6+3" }, { id: "f2", name: "Damage Type" }] },
  { id: "itag-2", name: "Armor", description: "Protective gear that increases AC or damage resistance.", fields: [{ id: "f3", name: "AC Bonus", type: "number" }] },
  { id: "itag-3", name: "Tool", description: "Utility items used outside of combat for skill checks.", fields: [] },
  { id: "itag-4", name: "Consumable", description: "Single-use items that are destroyed after activation.", fields: [{ id: "f4", name: "Uses", type: "number", min: 0, placeholder: "Number of uses" }] },
  { id: "itag-5", name: "Ranged", description: "Items effective at a distance, typically requiring ammunition.", fields: [{ id: "f5", name: "Range" }, { id: "f6", name: "Ammo Type" }] },
  { id: "itag-6", name: "Electronic", description: "Devices powered by technology or electricity.", fields: [] },
  { id: "itag-7", name: "Standard Issue", description: "Equipment provided by the agency to all agents.", fields: [] },
  { id: "itag-8", name: "Tactical", description: "Specialized equipment for strategic operations.", fields: [] },
  { id: "itag-9", name: "Equipment", description: "Restricts this item to a specific equipment slot when equipping.", fields: [{ id: "f7", name: "Slot", type: "slot" }] },
  { id: "itag-10", name: "Attribute Buff", description: "Grants a bonus (or penalty) to one of the six core attributes.", fields: [{ id: "f8", name: "Attribute", type: "attribute", required: true }, { id: "f9", name: "Amount", type: "number", required: true, placeholder: "e.g. +2 or -1" }] },
  { id: "itag-11", name: "Skill Buff", description: "Grants a bonus (or penalty) to a specific skill.", fields: [{ id: "f10", name: "Skill", type: "skill", required: true }, { id: "f11", name: "Amount", type: "number", required: true, placeholder: "e.g. +2 or -1" }] },
  { id: "itag-12", name: "Resources Buff", description: "Grants a bonus (or penalty) to a resource such as Max HP, Armor Class, or Speed.", fields: [{ id: "f12", name: "Resource", type: "resource", required: true }, { id: "f13", name: "Amount", type: "number", required: true, placeholder: "e.g. +2 or -1" }] },
  { id: "itag-13", name: "Status Effect", description: "This item applies or grants a status effect while equipped or used.", fields: [{ id: "f14", name: "Effect Name" }, { id: "f15", name: "Description", type: "textarea" }] },
  { id: "itag-14", name: "Disadvantageous", description: "Imposes disadvantage on a specific skill while equipped or active.", fields: [{ id: "f16", name: "Skill", type: "skill", required: true }] },
  { id: "itag-15", name: "Effect", description: "Adds one or more rich-text effect descriptions to the item. Effects of equipped items are displayed in the Equipped Item Effects panel.", fields: [] },
  { id: "itag-16", name: "Source", description: "Marks this item as a source item (e.g. mana crystal, spell slot). Source items appear in the Source Items panel under Consumables.", fields: [{ id: "f-src-1", name: "Source Points", type: "number", min: 0, required: true }] },
  { id: "itag-17", name: "Source Type: Fire", description: "Designates this source item as Fire-type source. Used for matching when cards consume source by type.", fields: [] },
  { id: "itag-18", name: "Source Type: Ice", description: "Designates this source item as Ice-type source. Used for matching when cards consume source by type.", fields: [] },
  { id: "itag-19", name: "Source Type: Arcane", description: "Designates this source item as Arcane-type source. Used for matching when cards consume source by type.", fields: [] },
  { id: "itag-20", name: "Source Type: Divine", description: "Designates this source item as Divine-type source. Used for matching when cards consume source by type.", fields: [] },
  { id: "itag-21", name: "Currency", description: "Marks this item as a currency. Currency items appear in shop currency selectors and can be spent at shops. The item's Quantity tag value represents the player's balance.", fields: [] },
  { id: "itag-22", name: "Quantity", description: "Tracks a numeric quantity for this item. Used for stackable items, currency balances, and consumable counts.", fields: [{ id: "f-qty-1", name: "Amount", type: "number", min: 0, required: true, placeholder: "e.g. 1000" }] },
];

export const initialCardTags: TagDefinition[] = [
  { id: "ctag-1", name: "Combat", description: "Abilities used during combat encounters.", fields: [{ id: "cf1", name: "Damage", type: "dice", placeholder: "e.g. 2d8+P" }] },
  { id: "ctag-2", name: "Utility", description: "Non-combat abilities for exploration and interaction.", fields: [] },
  { id: "ctag-3", name: "Tactical", description: "Strategic abilities for battlefield control.", fields: [{ id: "cf2", name: "Area of Effect" }] },
  { id: "ctag-4", name: "Passive", description: "Always-active abilities that require no action.", fields: [] },
  { id: "ctag-5", name: "Defensive", description: "Abilities focused on protection and damage mitigation.", fields: [{ id: "cf3", name: "Damage Reduction", type: "number" }] },
  { id: "ctag-6", name: "Buff", description: "Abilities that enhance the user's capabilities.", fields: [{ id: "cf4", name: "Duration", type: "number", placeholder: "Turns" }, { id: "cf5", name: "Stat" }, { id: "cf6", name: "Amount", type: "number", placeholder: "e.g. +2 or -1" }] },
  { id: "ctag-7", name: "Use Button Enabled", description: "Cards with this tag can be activated via the 'Use' button on the player side. Combine with Buff, Timed Effect, or other tags to define what happens on use.", fields: [] },
  { id: "ctag-8", name: "Timed Effect", description: "When used, automatically adds a Status Effect to the player's tracker with the configured name, duration, potency, damage, description, and optional stat buff.", fields: [{ id: "cf7", name: "Effect Name" }, { id: "cf8", name: "Duration", type: "number", placeholder: "Turns", required: true }, { id: "cf9", name: "Potency", type: "number" }, { id: "cf10", name: "Damage", type: "dice", placeholder: "e.g. 1d6" }, { id: "cf11", name: "Description", type: "textarea" }, { id: "cf12", name: "Buff Type", type: "dropdown", options: ["attribute", "skill", "resource"] }, { id: "cf13", name: "Buff Target" }, { id: "cf14", name: "Buff Value", placeholder: "e.g. +2, P, -1" }] },
  { id: "ctag-9", name: "Source Type: Fire", description: "This card consumes Fire-type source when used. The card's Level determines how much source is consumed.", fields: [] },
  { id: "ctag-10", name: "Source Type: Ice", description: "This card consumes Ice-type source when used. The card's Level determines how much source is consumed.", fields: [] },
  { id: "ctag-11", name: "Source Type: Arcane", description: "This card consumes Arcane-type source when used. The card's Level determines how much source is consumed.", fields: [] },
  { id: "ctag-12", name: "Source Type: Divine", description: "This card consumes Divine-type source when used. The card's Level determines how much source is consumed.", fields: [] },
  { id: "ctag-13", name: "Target: Self", description: "This ability targets the user. Buff/debuff effects from timed effects will apply to your stats.", fields: [] },
  { id: "ctag-14", name: "Target: Enemy", description: "This ability targets an enemy. Timed effects are tracked in your Status Effects panel for duration tracking, but their buff/debuff values will NOT affect your stats.", fields: [] },
];

export const initialInfoTags: TagDefinition[] = [
  { id: "ntag-1", name: "Mission", description: "Official mission briefings and objectives.", fields: [{ id: "nf1", name: "Priority Level" }] },
  { id: "ntag-2", name: "Intel", description: "Intelligence gathered from investigations.", fields: [{ id: "nf2", name: "Source" }] },
  { id: "ntag-3", name: "Lore", description: "World-building and background information.", fields: [] },
  { id: "ntag-4", name: "Personal", description: "Private notes and character observations.", fields: [] },
];

export const initialStatusTags: TagDefinition[] = [
  { id: "stag-1", name: "Poisoned", description: "Disadvantage on attack rolls and ability checks.", fields: [{ id: "sf1", name: "Save DC" }] },
  { id: "stag-2", name: "Stunned", description: "Incapacitated, can't move, fails STR/AGI saves.", fields: [] },
  { id: "stag-3", name: "Blinded", description: "Can't see. Auto-fail sight checks. Attacks have disadvantage.", fields: [] },
  { id: "stag-4", name: "Burning", description: "Taking fire damage at the start of each turn.", fields: [{ id: "sf2", name: "Damage per Round" }] },
  { id: "stag-5", name: "Shield Boost", description: "Temporary energy shield providing bonus AC.", fields: [{ id: "sf3", name: "AC Bonus" }] },
  { id: "stag-6", name: "Haste", description: "Movement speed doubled. +2 bonus to AC. Additional action each turn.", fields: [{ id: "sf4", name: "Duration" }] },
];

export const initialWikiTags: TagDefinition[] = [
  { id: "wtag-1", name: "Location", description: "A place in the world — city, dungeon, region, etc.", fields: [{ id: "wf1", name: "Region", type: "text" }, { id: "wf2", name: "Danger Level", type: "dropdown", options: ["Safe", "Low", "Moderate", "High", "Extreme"] }] },
  { id: "wtag-2", name: "NPC", description: "A non-player character encountered or referenced.", fields: [{ id: "wf3", name: "Affiliation", type: "text" }, { id: "wf4", name: "Disposition", type: "dropdown", options: ["Friendly", "Neutral", "Hostile", "Unknown"] }] },
  { id: "wtag-3", name: "Faction", description: "An organization, guild, cult, or political group.", fields: [{ id: "wf5", name: "Alignment", type: "text" }] },
  { id: "wtag-4", name: "History", description: "Historical events, legends, and lore entries.", fields: [{ id: "wf6", name: "Era", type: "text" }] },
  { id: "wtag-5", name: "Rules", description: "Homebrew rules, rulings, and mechanical reference.", fields: [] },
  { id: "wtag-6", name: "Secret", description: "Hidden knowledge — DM eyes only.", fields: [{ id: "wf7", name: "Reveal Condition", type: "textarea", placeholder: "When should this be revealed?" }] },
];

export const initialItems: InitialItem[] = [
  { id: "mi-1", name: "Standard Issue Pistol", rarity: "Common", type: "Weapon", tags: ["Weapon", "Ranged", "Standard Issue"], description: "Agency-issued sidearm. Reliable and accurate.", assignedTo: ["player-1"], customFields: { "Weapon::Damage": "2d6", "Weapon::Damage Type": "Piercing", "Ranged::Range": "80/320 ft", "Ranged::Ammo Type": "9mm" } },
  { id: "mi-2", name: "Lockpick Set", rarity: "Uncommon", type: "Tool", tags: ["Tool"], description: "Professional-grade lockpicking tools. Grants advantage on lock-picking checks.", assignedTo: ["player-2"], customFields: {} },
  { id: "mi-3", name: "Heavy Armor", rarity: "Uncommon", type: "Armor", tags: ["Armor"], description: "Reinforced full-body armor. Disadvantage on Stealth.", assignedTo: ["player-3"], customFields: { "Armor::AC Bonus": "+5" } },
  { id: "mi-test-source-1", name: "Inferno Shard", rarity: "Rare", type: "Source", tags: ["Source", "Source Type: Fire", "Consumable"], description: "A crystallized fragment of elemental fire. Radiates intense heat. Used to fuel fire-based abilities.", assignedTo: ["player-1", "player-2", "player-3"], customFields: { "Source::Source Points": "5", "Consumable::Uses": "5" } },
  { id: "mi-test-source-2", name: "Frost Core", rarity: "Rare", type: "Source", tags: ["Source", "Source Type: Ice", "Consumable"], description: "A sphere of permanently frozen energy. Cold to the touch. Powers ice-based abilities.", assignedTo: ["player-1", "player-2"], customFields: { "Source::Source Points": "3", "Consumable::Uses": "3" } },
  { id: "mi-test-currency-1", name: "Credits", rarity: "Common", type: "Currency", tags: ["Currency", "Quantity"], description: "Standard digital currency used across the city. Accepted at most shops and vendors.", assignedTo: ["player-1", "player-2", "player-3"], customFields: { "Quantity::Amount": "1000" } },
];

export const initialCards: InitialCard[] = [
  {
    id: "mc-test-fire",
    name: "Inferno Burst",
    type: "Spell",
    actionCost: "1 Action",
    tags: ["Combat", "Use Button Enabled", "Timed Effect", "Source Type: Fire", "Target: Enemy", "Tactical"],
    effect: "Conjure a roaring sphere of elemental fire that detonates on impact, engulfing enemies in searing flames. Targets struck continue to burn, taking residual fire damage each turn as cinders eat through armor and flesh alike. <b>Critical hits</b> double the burn duration.",
    assignedTo: ["player-1", "player-2", "player-3"],
    customFields: {
      "Level": "3",
      "Combat::Damage": "2d8+P",
      "Tactical::Area of Effect": "15 ft cone",
      "Timed Effect::Effect Name": "Searing Flames",
      "Timed Effect::Duration": "3",
      "Timed Effect::Potency": "4",
      "Timed Effect::Damage": "1d6",
      "Timed Effect::Description": "Burning. Take 1d6 fire damage at start of each turn. Potency decreases by 1 each turn.",
      "Timed Effect::Buff Type": "",
      "Timed Effect::Buff Target": "",
      "Timed Effect::Buff Value": "",
    },
  },
  {
    id: "mc-test-ice",
    name: "Glacial Aegis",
    type: "Spell",
    actionCost: "1 Bonus Action",
    tags: ["Defensive", "Buff", "Use Button Enabled", "Timed Effect", "Source Type: Ice", "Target: Self"],
    effect: "Encase yourself in a shimmering shell of enchanted ice that absorbs incoming blows and chills attackers on contact. While active, your Armor Class is bolstered and melee attackers suffer frost recoil. The barrier <i>shatters dramatically</i> when the effect expires.",
    assignedTo: ["player-1", "player-2", "player-3"],
    customFields: {
      "Level": "2",
      "Defensive::Damage Reduction": "3",
      "Buff::Duration": "4",
      "Buff::Stat": "Armor Class",
      "Buff::Amount": "2",
      "Timed Effect::Effect Name": "Frost Barrier",
      "Timed Effect::Duration": "4",
      "Timed Effect::Potency": "2",
      "Timed Effect::Damage": "",
      "Timed Effect::Description": "Ice shield active. +2 AC. Melee attackers take 1d4 cold damage on hit. Potency represents shield thickness.",
      "Timed Effect::Buff Type": "resource",
      "Timed Effect::Buff Target": "Armor Class",
      "Timed Effect::Buff Value": "P",
    },
  },
];

export const initialInfos: InitialInfo[] = [];

// ========================
// Mascot Trigger Config
// ========================
export interface MascotTrigger {
  id: string;
  name: string;
  type: "random" | "low_hp" | "high_wounds" | "high_weight" | "high_exhaustion" | "status_effect" | "status_effect_count";
  chance: number;
  enabled: boolean;
  lines: string[];
  threshold: number;
  statusEffectName: string;
}

export const initialMascotTriggers: MascotTrigger[] = [
  {
    id: "mt-random",
    name: "Random Idle",
    type: "random",
    chance: 5,
    enabled: true,
    lines: ["Insert funny joke"],
    threshold: 0,
    statusEffectName: "",
  },
  {
    id: "mt-lowhp",
    name: "Low HP Warning",
    type: "low_hp",
    chance: 40,
    enabled: true,
    lines: ["Insert funny joke"],
    threshold: 25,
    statusEffectName: "",
  },
  {
    id: "mt-highwounds",
    name: "High Wounds",
    type: "high_wounds",
    chance: 35,
    enabled: true,
    lines: ["Insert funny joke"],
    threshold: 75,
    statusEffectName: "",
  },
  {
    id: "mt-heavyload",
    name: "Heavy Load",
    type: "high_weight",
    chance: 30,
    enabled: true,
    lines: ["Insert funny joke"],
    threshold: 80,
    statusEffectName: "",
  },
  {
    id: "mt-exhausted",
    name: "Exhausted",
    type: "high_exhaustion",
    chance: 35,
    enabled: true,
    lines: ["Insert funny joke"],
    threshold: 50,
    statusEffectName: "",
  },
  {
    id: "mt-poisoned",
    name: "Poisoned Status",
    type: "status_effect",
    chance: 50,
    enabled: true,
    lines: ["Insert funny joke"],
    threshold: 0,
    statusEffectName: "Poisoned",
  },
  {
    id: "mt-statuscount",
    name: "Too Many Status Effects",
    type: "status_effect_count",
    chance: 40,
    enabled: true,
    lines: ["Insert funny joke"],
    threshold: 3,
    statusEffectName: "",
  },
];

// ========================
// Seed localStorage with initial data if keys don't exist yet.
// Called at app startup so all consumers see data even before the DM Area is visited.
// ========================
export function seedInitialData(): void {
  const seeds: [string, unknown][] = [
    ["inet-dm-players", initialPlayers],
    ["inet-dm-items", initialItems],
    ["inet-dm-cards", initialCards],
    ["inet-dm-infos", initialInfos],
    ["inet-dm-itemTags", initialItemTags],
    ["inet-dm-cardTags", initialCardTags],
    ["inet-dm-infoTags", initialInfoTags],
    ["inet-dm-statusTags", initialStatusTags],
    ["inet-dm-wikiTags", initialWikiTags],
    ["inet-dm-mascotTriggers", initialMascotTriggers],
    ["inet-dm-party-color-prompt", "box"],
  ];
  for (const [key, fallback] of seeds) {
    try {
      if (safeGetItem(key) === null) {
        safeSetJson(key, fallback);
      }
    } catch {}
  }

  // Migrate: rename legacy "use-able" card tag and tag definition to "Use Button Enabled"
  try {
    const rawCardTags = safeGetItem("inet-dm-cardTags");
    if (rawCardTags) {
      const tags: TagDefinition[] = JSON.parse(rawCardTags);
      let changed = false;
      for (const tag of tags) {
        if (String(tag.name || "").trim().toLowerCase() === LEGACY_USE_BUTTON_TAG) {
          tag.name = USE_BUTTON_ENABLED_TAG;
          changed = true;
        }
      }
      if (changed) safeSetJson("inet-dm-cardTags", tags);
    }
  } catch { /* ignore */ }
  try {
    const rawCards = safeGetItem("inet-dm-cards");
    if (rawCards) {
      const cards: InitialCard[] = JSON.parse(rawCards);
      let changed = false;
      for (const card of cards) {
        const nextTags = card.tags.map((tag) =>
          String(tag || "").trim().toLowerCase() === LEGACY_USE_BUTTON_TAG ? USE_BUTTON_ENABLED_TAG : tag,
        );
        if (nextTags.some((tag, index) => tag !== card.tags[index])) {
          card.tags = nextTags;
          changed = true;
        }
      }
      if (changed) safeSetJson("inet-dm-cards", cards);
    }
  } catch { /* ignore */ }

  // Merge any new default tags into existing tag lists (so new built-in tags
  // like Equipment, Attribute Buff, Skill Buff appear even for returning users)
  const tagMerges: [string, TagDefinition[]][] = [
    ["inet-dm-itemTags", initialItemTags],
    ["inet-dm-cardTags", initialCardTags],
    ["inet-dm-infoTags", initialInfoTags],
    ["inet-dm-statusTags", initialStatusTags],
    ["inet-dm-wikiTags", initialWikiTags],
  ];
  for (const [key, defaults] of tagMerges) {
    try {
      const raw = safeGetItem(key);
      if (!raw) continue;
      const existing: TagDefinition[] = JSON.parse(raw);
      const existingIds = new Set(existing.map(t => t.id));
      const existingNames = new Set(existing.map(t => t.name));
      const missing = defaults.filter(d => !existingIds.has(d.id) && !existingNames.has(d.name));
      if (missing.length > 0) {
        safeSetJson(key, [...existing, ...missing]);
      }
    } catch { /* ignore parse errors */ }
  }

  // Migrate: update existing built-in tag fields with type metadata for returning users
  const TAG_FIELD_TYPE_MAP: Record<string, Record<string, Partial<TagField>>> = {
    "Weapon": { "Damage": { type: "dice", placeholder: "e.g. 2d6+3" } },
    "Armor": { "AC Bonus": { type: "number" } },
    "Consumable": { "Uses": { type: "number", min: 0, placeholder: "Number of uses" } },
    "Equipment": { "Slot": { type: "slot" } },
    "Attribute Buff": { "Attribute": { type: "attribute", required: true }, "Amount": { type: "number", required: true, placeholder: "e.g. +2 or -1" } },
    "Skill Buff": { "Skill": { type: "skill", required: true }, "Amount": { type: "number", required: true, placeholder: "e.g. +2 or -1" } },
    "Resources Buff": { "Resource": { type: "resource", required: true }, "Amount": { type: "number", required: true, placeholder: "e.g. +2 or -1" } },
    "Status Effect": { "Description": { type: "textarea" } },
    "Disadvantageous": { "Skill": { type: "skill", required: true } },
    "Source": { "Source Points": { type: "number", min: 0, required: true } },
    "Combat": { "Damage": { type: "dice", placeholder: "e.g. 2d8+P" } },
    "Defensive": { "Damage Reduction": { type: "number" } },
    "Buff": { "Duration": { type: "number", placeholder: "Turns" }, "Amount": { type: "number", placeholder: "e.g. +2 or -1" } },
    "Timed Effect": { "Duration": { type: "number", placeholder: "Turns", required: true }, "Potency": { type: "number" }, "Damage": { type: "dice", placeholder: "e.g. 1d6" }, "Description": { type: "textarea" }, "Buff Type": { type: "dropdown", options: ["attribute", "skill", "resource"] }, "Buff Value": { placeholder: "e.g. +2, P, -1" } },
  };
  for (const [storageKey] of tagMerges) {
    try {
      const raw = safeGetItem(storageKey);
      if (!raw) continue;
      const tags: TagDefinition[] = JSON.parse(raw);
      let changed = false;
      for (const tag of tags) {
        const fieldMap = TAG_FIELD_TYPE_MAP[tag.name];
        if (!fieldMap) continue;
        for (const field of tag.fields) {
          const updates = fieldMap[field.name];
          if (updates && !field.type) {
            Object.assign(field, updates);
            changed = true;
          }
        }
      }
      if (changed) safeSetJson(storageKey, tags);
    } catch { /* ignore */ }
  }

  // Migrate: rename "Amount" -> "Potency" in Timed Effect tag field and card customFields
  try {
    const rawCT = safeGetItem("inet-dm-cardTags");
    if (rawCT) {
      const tags: TagDefinition[] = JSON.parse(rawCT);
      let changed = false;
      for (const tag of tags) {
        if (tag.name === "Timed Effect") {
          for (const f of tag.fields) {
            if (f.name === "Amount") { f.name = "Potency"; changed = true; }
          }
        }
      }
      if (changed) safeSetJson("inet-dm-cardTags", tags);
    }
  } catch { /* ignore */ }
  try {
    const rawCards = safeGetItem("inet-dm-cards");
    if (rawCards) {
      const cards: InitialCard[] = JSON.parse(rawCards);
      let changed = false;
      for (const card of cards) {
        if ("Timed Effect::Amount" in card.customFields) {
          card.customFields["Timed Effect::Potency"] = card.customFields["Timed Effect::Amount"];
          delete card.customFields["Timed Effect::Amount"];
          changed = true;
        }
        const dmgKey = "Timed Effect::Damage";
        if (card.customFields[dmgKey] && /(?<![a-zA-Z])A(?![a-ce-zA-CE-Z])/.test(card.customFields[dmgKey])) {
          card.customFields[dmgKey] = card.customFields[dmgKey].replace(/(?<![a-zA-Z])A(?![a-ce-zA-CE-Z])/g, "P");
          changed = true;
        }
      }
      if (changed) safeSetJson("inet-dm-cards", cards);
    }
  } catch { /* ignore */ }

  // Migrate: fix common buff target aliases (e.g. "AC" → "Armor Class", "HP" → "Max HP")
  const BUFF_TARGET_ALIASES: Record<string, string> = {
    "AC": "Armor Class", "ac": "Armor Class", "Ac": "Armor Class",
    "HP": "Max HP", "hp": "Max HP", "Hp": "Max HP",
    "DR": "Damage Reduction", "dr": "Damage Reduction",
    "THP": "Temp HP", "thp": "Temp HP",
    "MW": "Max Weight", "mw": "Max Weight",
    "TW": "Total Wounds", "tw": "Total Wounds",
    "ME": "Max Exhaustion", "me": "Max Exhaustion",
    "Str": "STR", "str": "STR",
    "Agi": "AGI", "agi": "AGI",
    "Con": "CON", "con": "CON",
    "Know": "KNOW", "know": "KNOW",
    "Wis": "WIS", "wis": "WIS",
    "Will": "WILL", "will": "WILL",
  };
  try {
    const rawCardsAlias = safeGetItem("inet-dm-cards");
    if (rawCardsAlias) {
      const cards: InitialCard[] = JSON.parse(rawCardsAlias);
      let changed = false;
      for (const card of cards) {
        const btKey = "Timed Effect::Buff Target";
        if (card.customFields[btKey] && BUFF_TARGET_ALIASES[card.customFields[btKey]]) {
          card.customFields[btKey] = BUFF_TARGET_ALIASES[card.customFields[btKey]];
          changed = true;
        }
        const bsKey = "Buff::Stat";
        if (card.customFields[bsKey] && BUFF_TARGET_ALIASES[card.customFields[bsKey]]) {
          card.customFields[bsKey] = BUFF_TARGET_ALIASES[card.customFields[bsKey]];
          changed = true;
        }
      }
      if (changed) safeSetJson("inet-dm-cards", cards);
    }
  } catch { /* ignore */ }

  // Merge any new default items (like test source items) into existing item lists
  try {
    const rawItems = safeGetItem("inet-dm-items");
    if (rawItems) {
      const existingItems: InitialItem[] = JSON.parse(rawItems);
      const testItemDefaults = new Map(initialItems.filter(i => i.id.startsWith("mi-test-")).map(i => [i.id, i]));
      const existingItemIds = new Set(existingItems.map(i => i.id));
      const updatedItems = existingItems.map(i => testItemDefaults.has(i.id) ? testItemDefaults.get(i.id)! : i);
      const missingItems = initialItems.filter(i => !existingItemIds.has(i.id));
      if (missingItems.length > 0 || testItemDefaults.size > 0) {
        safeSetJson("inet-dm-items", [...updatedItems, ...missingItems]);
      }
    }
  } catch { /* ignore parse errors */ }

  // Merge any new default cards (like test fire/ice cards) into existing card lists
  try {
    const rawCards2 = safeGetItem("inet-dm-cards");
    if (rawCards2) {
      const existingCards: InitialCard[] = JSON.parse(rawCards2);
      const testCardDefaults = new Map(initialCards.filter(c => c.id.startsWith("mc-test-")).map(c => [c.id, c]));
      const existingCardIds = new Set(existingCards.map(c => c.id));
      const updatedCards = existingCards.map(c => testCardDefaults.has(c.id) ? testCardDefaults.get(c.id)! : c);
      const missingCards = initialCards.filter(c => !existingCardIds.has(c.id));
      if (missingCards.length > 0 || testCardDefaults.size > 0) {
        safeSetJson("inet-dm-cards", [...updatedCards, ...missingCards]);
      }
    }
  } catch { /* ignore parse errors */ }
}
