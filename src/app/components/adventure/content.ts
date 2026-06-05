import { ADVENTURE_CLASSES, ADVENTURE_SHOP_ITEMS, CAMP_LEVEL_UP_XP_COST } from "./data";
import type {
  AdventureBehaviorDef,
  AdventureCampaignTemplate,
  AdventureClassDef,
  AdventureContentCatalog,
  AdventureEnemyTemplate,
  AdventureEventTemplate,
  AdventureLevelUpRule,
  AdventureShopItem,
} from "./types";

const BUILTIN_CAMPAIGNS: AdventureCampaignTemplate[] = [
  {
    id: "first-cube-road-v2",
    name: "First Cube Road",
    description: "A short starter road that teaches shop setup, branching blocks, events, towns, camping, and tactical combat.",
    maxDepth: 6,
    preferredTheme: "forest",
    introText: "The party wakes on a silent cube with three glowing lines pointing right. Somewhere ahead, a gate waits.",
  },
];

const BUILTIN_ENEMIES: AdventureEnemyTemplate[] = [
  { id: "skirmisher", enemyType: "Skirmisher", name: "Skirmisher", maxHp: 18, damage: 5, attackRange: 1, intent: "Rushes the nearest ally", behaviorId: "simple-pursuit-v2" },
  { id: "slinger", enemyType: "Slinger", name: "Slinger", maxHp: 14, damage: 4, attackRange: 3, intent: "Harasses from range", behaviorId: "simple-pursuit-v2" },
  { id: "brute", enemyType: "Brute", name: "Brute", maxHp: 26, damage: 7, attackRange: 1, intent: "Crushes blocked paths", behaviorId: "simple-pursuit-v2" },
  { id: "hexer", enemyType: "Hexer", name: "Hexer", maxHp: 16, damage: 6, attackRange: 3, intent: "Targets wounded allies", behaviorId: "wounded-focus-v2" },
];

const BUILTIN_BOSSES: AdventureEnemyTemplate[] = [
  { id: "gate-warden", enemyType: "Boss", name: "Gate Warden", maxHp: 42, damage: 9, attackRange: 2, intent: "Holds the campaign gate", behaviorId: "simple-pursuit-v2", boss: true },
];

const BUILTIN_BEHAVIORS: AdventureBehaviorDef[] = [
  { id: "simple-pursuit-v2", name: "Simple Pursuit", description: "Move toward the nearest living player and attack in range.", targeting: "nearest", aggression: 1 },
  { id: "wounded-focus-v2", name: "Wounded Focus", description: "Prefer damaged players when possible.", targeting: "wounded", aggression: 1.2 },
];

const BUILTIN_LEVEL_UPS: AdventureLevelUpRule[] = [
  { id: "simple-100xp-v2", name: "Simple Camp Level-Up", xpCost: CAMP_LEVEL_UP_XP_COST, hpGain: 4, damageGain: 1, description: "Spend XP at camp to gain HP and a light damage bump." },
];

const BUILTIN_EVENTS: AdventureEventTemplate[] = [
  { id: "strange-cache", title: "Strange Cache", description: "The party finds a half-buried cache and decides how to split the supplies.", rewardXp: 35, rewardGold: 18, tags: ["event", "reward"] },
  { id: "old-warning", title: "Old Warning", description: "A warning carved into the cube hints at enemy behavior ahead.", rewardXp: 25, rewardGold: 10, tags: ["event", "lore"] },
  { id: "merchant-signal", title: "Merchant Signal", description: "A blinking sign advertises a town route, but the shortcut hums with danger.", rewardXp: 30, rewardGold: 15, tags: ["event", "choice"] },
  { id: "broken-shrine", title: "Broken Shrine", description: "A cracked shrine grants a moment of calm and leaves behind a handful of old coins.", rewardXp: 28, rewardGold: 22, tags: ["event", "rest"] },
  { id: "cube-storm", title: "Cube Storm", description: "The road shudders. The party braces, shares supplies, and learns how the cubes drift.", rewardXp: 40, rewardGold: 8, tags: ["event", "hazard"] },
];

export const DEFAULT_ADVENTURE_CONTENT: AdventureContentCatalog = {
  campaignTemplates: BUILTIN_CAMPAIGNS,
  classes: ADVENTURE_CLASSES,
  shopItems: ADVENTURE_SHOP_ITEMS,
  enemyTemplates: BUILTIN_ENEMIES,
  bossTemplates: BUILTIN_BOSSES,
  behaviors: BUILTIN_BEHAVIORS,
  levelUpRules: BUILTIN_LEVEL_UPS,
  eventTemplates: BUILTIN_EVENTS,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeClasses(value: unknown): Record<string, AdventureClassDef> {
  const raw = isRecord(value) ? value : {};
  const classes: Record<string, AdventureClassDef> = { ...ADVENTURE_CLASSES };
  for (const [id, entry] of Object.entries(raw)) {
    if (!isRecord(entry)) continue;
    const classId = String(entry.id || id).trim();
    if (!classId) continue;
    classes[classId] = {
      id: classId,
      name: String(entry.name || classId),
      role: String(entry.role || "Custom class"),
      maxHp: Math.max(1, Number(entry.maxHp || 24)),
      move: Math.max(1, Number(entry.move || 4)),
      basicDamage: Math.max(1, Number(entry.basicDamage || 5)),
      color: String(entry.color || "#64E0FF"),
      abilities: Array.isArray(entry.abilities) ? entry.abilities as AdventureClassDef["abilities"] : [],
      inventory: Array.isArray(entry.inventory) ? entry.inventory as AdventureClassDef["inventory"] : [],
    };
  }
  return classes;
}

function normalizeArray<T>(value: unknown, fallback: T[]) {
  return Array.isArray(value) && value.length ? value as T[] : fallback;
}

export function normalizeAdventureContent(value: unknown): AdventureContentCatalog {
  const raw = isRecord(value) ? value : {};
  return {
    campaignTemplates: normalizeArray<AdventureCampaignTemplate>(raw.campaignTemplates, BUILTIN_CAMPAIGNS),
    classes: normalizeClasses(raw.classes),
    shopItems: normalizeArray<AdventureShopItem>(raw.shopItems, ADVENTURE_SHOP_ITEMS),
    enemyTemplates: normalizeArray<AdventureEnemyTemplate>(raw.enemyTemplates, BUILTIN_ENEMIES),
    bossTemplates: normalizeArray<AdventureEnemyTemplate>(raw.bossTemplates, BUILTIN_BOSSES),
    behaviors: normalizeArray<AdventureBehaviorDef>(raw.behaviors, BUILTIN_BEHAVIORS),
    levelUpRules: normalizeArray<AdventureLevelUpRule>(raw.levelUpRules, BUILTIN_LEVEL_UPS),
    eventTemplates: normalizeArray<AdventureEventTemplate>(raw.eventTemplates, BUILTIN_EVENTS),
  };
}

export function getAdventureCampaignTemplates(content?: AdventureContentCatalog | null) {
  return normalizeAdventureContent(content).campaignTemplates;
}

export function getAdventureCampaignTemplate(content: AdventureContentCatalog | null | undefined, templateId?: string) {
  const templates = getAdventureCampaignTemplates(content);
  return templates.find((template) => template.id === templateId) || templates[0] || BUILTIN_CAMPAIGNS[0];
}

export function getAdventureClasses(content?: AdventureContentCatalog | null) {
  return normalizeAdventureContent(content).classes;
}

export function getAdventureClass(content: AdventureContentCatalog | null | undefined, classId: string): AdventureClassDef {
  const classes = getAdventureClasses(content);
  return classes[classId] || classes.warrior || ADVENTURE_CLASSES.warrior;
}

export function getAdventureShopItems(content?: AdventureContentCatalog | null) {
  return normalizeAdventureContent(content).shopItems;
}

export function getAdventureEnemyTemplates(content?: AdventureContentCatalog | null, boss = false) {
  const normalized = normalizeAdventureContent(content);
  return boss ? normalized.bossTemplates : normalized.enemyTemplates;
}

export function getAdventureLevelUpRule(content?: AdventureContentCatalog | null, ruleId?: string) {
  const rules = normalizeAdventureContent(content).levelUpRules;
  return rules.find((rule) => rule.id === ruleId) || rules[0] || BUILTIN_LEVEL_UPS[0];
}

export function getAdventureEventTemplates(content?: AdventureContentCatalog | null) {
  return normalizeAdventureContent(content).eventTemplates;
}

export function getAdventureBehavior(content: AdventureContentCatalog | null | undefined, behaviorId?: string) {
  const behaviors = normalizeAdventureContent(content).behaviors;
  return behaviors.find((behavior) => behavior.id === behaviorId) || behaviors[0] || BUILTIN_BEHAVIORS[0];
}
