import type { AdventureClassDef, AdventureDifficulty, AdventureEncounterSettings, AdventureFrameworkConfig, AdventureObjectiveState, AdventureObjectiveType, AdventureShopItem, AdventureTheme } from "./types";

export const STARTER_GOLD = 100;
export const CAMP_SLEEP_LIMIT = 3;
export const CAMP_LEVEL_UP_XP_COST = 100;

export const ADVENTURE_CLASSES: Record<string, AdventureClassDef> = {
  warrior: {
    id: "warrior",
    name: "Warrior",
    role: "Front-line defender",
    maxHp: 34,
    move: 4,
    basicDamage: 7,
    color: "#FF8A5B",
    abilities: [
      { id: "power-cleave", name: "Power Cleave", description: "Heavy melee hit against one nearby enemy.", kind: "damage", range: 1, power: 11 },
      { id: "shield-rush", name: "Shield Rush", description: "Strike from close range and mark the target.", kind: "mark", range: 1, power: 6 },
      { id: "battle-guard", name: "Battle Guard", description: "Brace yourself and reduce the next hit.", kind: "guard", range: 0, power: 0 },
    ],
    inventory: [
      { id: "minor-potion", name: "Minor Potion", description: "Restore HP to an ally in range.", kind: "heal", range: 2, power: 10, quantity: 1 },
      { id: "ember-bomb", name: "Ember Bomb", description: "Throw a small bomb at an enemy.", kind: "damage", range: 3, power: 8, quantity: 1 },
    ],
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    role: "Mobile ranged striker",
    maxHp: 26,
    move: 5,
    basicDamage: 6,
    color: "#8EE88E",
    abilities: [
      { id: "piercing-shot", name: "Piercing Shot", description: "Long-range shot with reliable damage.", kind: "damage", range: 5, power: 9 },
      { id: "snare-shot", name: "Snare Shot", description: "Damage and mark an enemy for the party.", kind: "mark", range: 4, power: 5 },
      { id: "field-dress", name: "Field Dress", description: "Patch up a nearby ally.", kind: "heal", range: 2, power: 8 },
    ],
    inventory: [
      { id: "minor-potion", name: "Minor Potion", description: "Restore HP to an ally in range.", kind: "heal", range: 2, power: 10, quantity: 1 },
      { id: "smoke-bomb", name: "Smoke Bomb", description: "Guard yourself with a quick smoke screen.", kind: "guard", range: 0, power: 0, quantity: 1 },
    ],
  },
  mage: {
    id: "mage",
    name: "Mage",
    role: "Arcane area pressure",
    maxHp: 22,
    move: 4,
    basicDamage: 6,
    color: "#A78BFA",
    abilities: [
      { id: "arc-bolt", name: "Arc Bolt", description: "Precise magic strike at medium range.", kind: "damage", range: 4, power: 10 },
      { id: "fire-bloom", name: "Fire Bloom", description: "Blast one enemy with unstable flame.", kind: "damage", range: 3, power: 12 },
      { id: "ward-spark", name: "Ward Spark", description: "Raise a flickering shield around yourself.", kind: "guard", range: 0, power: 0 },
    ],
    inventory: [
      { id: "minor-potion", name: "Minor Potion", description: "Restore HP to an ally in range.", kind: "heal", range: 2, power: 10, quantity: 1 },
      { id: "ember-bomb", name: "Ember Bomb", description: "Throw a small bomb at an enemy.", kind: "damage", range: 3, power: 8, quantity: 1 },
    ],
  },
  cleric: {
    id: "cleric",
    name: "Cleric",
    role: "Support and recovery",
    maxHp: 28,
    move: 4,
    basicDamage: 5,
    color: "#FFD166",
    abilities: [
      { id: "mend", name: "Mend", description: "Restore a strong burst of HP to an ally.", kind: "heal", range: 3, power: 13 },
      { id: "radiant-smite", name: "Radiant Smite", description: "Strike an enemy with radiant force.", kind: "damage", range: 3, power: 8 },
      { id: "protective-rite", name: "Protective Rite", description: "Guard yourself while holding the line.", kind: "guard", range: 0, power: 0 },
    ],
    inventory: [
      { id: "minor-potion", name: "Minor Potion", description: "Restore HP to an ally in range.", kind: "heal", range: 2, power: 10, quantity: 2 },
      { id: "antitoxin", name: "Antitoxin", description: "Cleanse a dangerous condition and restore a small amount of HP.", kind: "cleanse", range: 2, power: 6, quantity: 1 },
    ],
  },
};

export const ADVENTURE_THEMES: Record<AdventureTheme, {
  name: string;
  accent: string;
  floor: string;
  wall: string;
  cover: string;
  hazard: string;
  water: string;
  decor: string[];
}> = {
  forest: {
    name: "Forest",
    accent: "#6DFF8E",
    floor: "#14351F",
    wall: "#1F2B1A",
    cover: "#2E5D2E",
    hazard: "#5B2D1F",
    water: "#174C5A",
    decor: ["tree", "rock", "fern", "log"],
  },
  desert: {
    name: "Desert",
    accent: "#FFD27A",
    floor: "#4A3518",
    wall: "#3A2610",
    cover: "#8A6428",
    hazard: "#8D3A18",
    water: "#1E5668",
    decor: ["cactus", "stone", "dune", "bones"],
  },
  dungeon: {
    name: "Dungeon",
    accent: "#8AA4FF",
    floor: "#20243A",
    wall: "#111624",
    cover: "#313852",
    hazard: "#5A1E2E",
    water: "#123A52",
    decor: ["pillar", "rubble", "bars", "torch"],
  },
  ruins: {
    name: "Ruins",
    accent: "#B8D7FF",
    floor: "#242B2F",
    wall: "#171D21",
    cover: "#3B474C",
    hazard: "#653320",
    water: "#183F4C",
    decor: ["column", "glyph", "crack", "statue"],
  },
  swamp: {
    name: "Swamp",
    accent: "#95FFB8",
    floor: "#183323",
    wall: "#102417",
    cover: "#2C4A2E",
    hazard: "#58421B",
    water: "#123F36",
    decor: ["mire", "root", "moss", "reed"],
  },
  snowfield: {
    name: "Snowfield",
    accent: "#C7F4FF",
    floor: "#273A45",
    wall: "#13242E",
    cover: "#4A6270",
    hazard: "#5D342F",
    water: "#16445C",
    decor: ["ice", "pine", "drift", "stone"],
  },
  arcane: {
    name: "Arcane Lab",
    accent: "#FF8DFF",
    floor: "#231A3A",
    wall: "#120C21",
    cover: "#3A2A61",
    hazard: "#6B1A5A",
    water: "#1C3E6B",
    decor: ["crystal", "coil", "sigil", "lens"],
  },
};

export const MAP_SIZE_OPTIONS = [12, 16, 20, 24];
export const DEFAULT_THEME: AdventureTheme = "forest";

export const ADVENTURE_DIFFICULTIES: Record<AdventureDifficulty, {
  name: string;
  enemyScale: number;
  rewardScale: number;
  description: string;
}> = {
  standard: {
    name: "Standard",
    enemyScale: 1,
    rewardScale: 1,
    description: "Balanced expedition rules for casual party play.",
  },
  dangerous: {
    name: "Dangerous",
    enemyScale: 1.25,
    rewardScale: 1.3,
    description: "More pressure and better rewards.",
  },
  heroic: {
    name: "Heroic",
    enemyScale: 1.5,
    rewardScale: 1.6,
    description: "Harder encounter framework for later high-stakes content.",
  },
};

export const ADVENTURE_OBJECTIVES: Record<AdventureObjectiveType, Omit<AdventureObjectiveState, "completed">> = {
  defeat_all: {
    type: "defeat_all",
    label: "Defeat All",
    description: "Win by clearing every enemy on the tactical board.",
  },
  survive_rounds: {
    type: "survive_rounds",
    label: "Survive",
    description: "Win by surviving until the target round.",
    targetRounds: 5,
  },
  recover_relic: {
    type: "recover_relic",
    label: "Recover Relic",
    description: "Win by reaching the relic marker and holding the field.",
  },
  escape: {
    type: "escape",
    label: "Escape",
    description: "Win by reaching the extraction edge after the fight turns bad.",
  },
};

export const DEFAULT_ENCOUNTER_SETTINGS: AdventureEncounterSettings = {
  mapSize: 12,
  theme: DEFAULT_THEME,
  difficulty: "standard",
  objectiveType: "defeat_all",
  maxPlayers: 6,
  profilesEnabled: true,
  rewardsEnabled: true,
};

export const DEFAULT_ADVENTURE_FRAMEWORK: AdventureFrameworkConfig = {
  campaignTemplateId: "first-cube-road-v2",
  classSetId: "core-v2",
  abilitySetId: "core-v2",
  itemSetId: "starter-kit-v2",
  enemySetId: "placeholder-v2",
  bossSetId: "placeholder-v2",
  behaviorSetId: "simple-pursuit-v2",
  levelUpSetId: "simple-100xp-v2",
  notes: "Framework slots are intentionally data-driven so a later DM tool can swap class, enemy, boss, behavior, item, and level-up registries without rewriting the campaign shell.",
};

export const ADVENTURE_SHOP_ITEMS: AdventureShopItem[] = [
  {
    id: "minor-potion",
    kind: "consumable",
    name: "Minor Potion",
    description: "Restore HP to an ally. Useful in combat, camp, or town travel.",
    price: 15,
    sellValue: 7,
    item: { id: "minor-potion", name: "Minor Potion", description: "Restore HP to an ally in range.", kind: "heal", range: 2, power: 10, price: 15, sellValue: 7 },
  },
  {
    id: "ember-bomb",
    kind: "consumable",
    name: "Ember Bomb",
    description: "A throwable burst of fire for opening a fight.",
    price: 25,
    sellValue: 12,
    item: { id: "ember-bomb", name: "Ember Bomb", description: "Throw a small bomb at an enemy.", kind: "damage", range: 3, power: 8, price: 25, sellValue: 12 },
  },
  {
    id: "antitoxin",
    kind: "consumable",
    name: "Antitoxin",
    description: "Cleanse a dangerous condition and recover a little HP.",
    price: 20,
    sellValue: 10,
    item: { id: "antitoxin", name: "Antitoxin", description: "Cleanse a dangerous condition and restore a small amount of HP.", kind: "cleanse", range: 2, power: 6, price: 20, sellValue: 10 },
  },
  {
    id: "iron-blade",
    kind: "equipment",
    name: "Iron Blade",
    description: "Weapon slot. Adds a small bonus to basic attacks.",
    price: 45,
    sellValue: 22,
    equipment: { id: "iron-blade", name: "Iron Blade", description: "A dependable starter weapon.", slot: "weapon", price: 45, sellValue: 22, basicDamageBonus: 2 },
  },
  {
    id: "guard-vest",
    kind: "equipment",
    name: "Guard Vest",
    description: "Armor slot. Increases max HP for the campaign.",
    price: 40,
    sellValue: 20,
    equipment: { id: "guard-vest", name: "Guard Vest", description: "A reinforced vest for rough roads.", slot: "armor", price: 40, sellValue: 20, maxHpBonus: 8 },
  },
  {
    id: "trail-boots",
    kind: "equipment",
    name: "Trail Boots",
    description: "Trinket slot. Adds one movement during tactical fights.",
    price: 35,
    sellValue: 17,
    equipment: { id: "trail-boots", name: "Trail Boots", description: "Light boots built for quick repositioning.", slot: "trinket", price: 35, sellValue: 17, moveBonus: 1 },
  },
];

export const ADVENTURE_FRAMEWORK_REGISTRY = {
  classSets: [{ id: "core-v2", name: "Core Classes", count: Object.keys(ADVENTURE_CLASSES).length }],
  abilitySets: [{ id: "core-v2", name: "Core Starter Abilities", count: Object.values(ADVENTURE_CLASSES).reduce((total, def) => total + def.abilities.length, 0) }],
  itemSets: [{ id: "starter-kit-v2", name: "Starter Kit Catalog", count: ADVENTURE_SHOP_ITEMS.length }],
  enemySets: [{ id: "placeholder-v2", name: "Placeholder Enemy Set", count: 4 }],
  bossSets: [{ id: "placeholder-v2", name: "Placeholder Boss Slots", count: 1 }],
  behaviorSets: [{ id: "simple-pursuit-v2", name: "Simple Pursuit AI", count: 1 }],
  levelUpSets: [{ id: "simple-100xp-v2", name: "100 XP Camp Level-Ups", count: 1 }],
};
