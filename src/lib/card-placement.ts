import type {
  LevelAbilityEntry,
  LevelCategory,
  MagicTierKey,
  ManagedCard,
  PlayerMagicList,
} from "@/app/components/types";

export const MAGIC_TIER_ORDER: MagicTierKey[] = [
  "cantrip",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
];

export const MAGIC_TIER_LABELS: Record<MagicTierKey, string> = {
  cantrip: "Cantrips",
  "1": "Level 1",
  "2": "Level 2",
  "3": "Level 3",
  "4": "Level 4",
  "5": "Level 5",
  "6": "Level 6",
  "7": "Level 7",
  "8": "Level 8",
};

export function createEmptyMagicTiers(): Record<MagicTierKey, string[]> {
  return {
    cantrip: [],
    "1": [],
    "2": [],
    "3": [],
    "4": [],
    "5": [],
    "6": [],
    "7": [],
    "8": [],
  };
}

export function isPassiveCard(card: ManagedCard | null | undefined) {
  if (!card) return false;
  const actionCost = String(card.actionCost || "").trim().toLowerCase();
  const passiveMode = String(card.customFields?.["Use Profile::Passive Mode"] || "").trim().toLowerCase();
  const family = String(card.customFields?.["Card Family"] || "").trim().toLowerCase();
  const blob = `${card.type || ""} ${card.effect || ""} ${card.tags.join(" ")}`.toLowerCase();
  return (
    actionCost.includes("passive") ||
    passiveMode.includes("passive") ||
    card.tags.some((tag) => tag.trim().toLowerCase() === "passive") ||
    /passive|always active|innate|granted|lineage|blood/.test(blob) ||
    (family === "ability" && actionCost === "")
  );
}

export function normalizeLevelAbilityEntry(
  raw: unknown,
  cardsById?: Map<string, ManagedCard>,
): LevelAbilityEntry | null {
  if (typeof raw === "string" && raw.trim()) {
    return {
      cardId: raw.trim(),
      showInCards: !isPassiveCard(cardsById?.get(raw.trim())),
    };
  }

  if (!raw || typeof raw !== "object") return null;
  const entry = raw as { cardId?: unknown; showInCards?: unknown };
  const cardId = typeof entry.cardId === "string" ? entry.cardId.trim() : "";
  if (!cardId) return null;
  return {
    cardId,
    showInCards:
      typeof entry.showInCards === "boolean"
        ? entry.showInCards
        : !isPassiveCard(cardsById?.get(cardId)),
  };
}

export function normalizeLevelCategories(
  raw: unknown,
  cards: ManagedCard[] = [],
): LevelCategory[] {
  if (!Array.isArray(raw)) return [];
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  return raw
    .map((value, index) => {
      if (!value || typeof value !== "object") return null;
      const source = value as Record<string, unknown>;
      const id = typeof source.id === "string" && source.id.trim()
        ? source.id.trim()
        : `lvl-${index}`;
      const name = typeof source.name === "string" && source.name.trim()
        ? source.name.trim()
        : `Level ${index + 1}`;
      const order = typeof source.order === "number" && Number.isFinite(source.order)
        ? source.order
        : index;
      const description = typeof source.description === "string" ? source.description : "";
      const rawEntries = Array.isArray(source.cardEntries)
        ? source.cardEntries
        : Array.isArray(source.cardIds)
          ? source.cardIds
          : [];
      const cardEntries = rawEntries
        .map((entry) => normalizeLevelAbilityEntry(entry, cardsById))
        .filter(Boolean) as LevelAbilityEntry[];

      return {
        id,
        name,
        order,
        description,
        cardEntries,
      } satisfies LevelCategory;
    })
    .filter(Boolean) as LevelCategory[];
}

export function isRaceLevelCategory(level: Pick<LevelCategory, "name"> | string | null | undefined) {
  const name = typeof level === "string" ? level : level?.name;
  return (name || "").trim().toLowerCase() === "race";
}

export function getLevelCategoryNumber(level: Pick<LevelCategory, "name"> | string | null | undefined) {
  const name = typeof level === "string" ? level : level?.name;
  const match = (name || "").trim().match(/^level\s*(\d+)$/i);
  return match ? parseInt(match[1], 10) : null;
}

export function sortLevelCategories(levels: LevelCategory[]) {
  return [...levels].sort((a, b) => {
    const aIsRace = isRaceLevelCategory(a);
    const bIsRace = isRaceLevelCategory(b);
    if (aIsRace && !bIsRace) return -1;
    if (!aIsRace && bIsRace) return 1;

    const aLevel = getLevelCategoryNumber(a);
    const bLevel = getLevelCategoryNumber(b);
    if (aLevel !== null && bLevel !== null) return aLevel - bLevel;
    if (aLevel !== null && bLevel === null) return -1;
    if (aLevel === null && bLevel !== null) return 1;

    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

export function getLevelCategoryEntries(level: LevelCategory) {
  return Array.isArray(level.cardEntries) ? level.cardEntries : [];
}

export function getLevelCategoryCardIds(level: LevelCategory) {
  return getLevelCategoryEntries(level).map((entry) => entry.cardId);
}

export function createLevelAbilityEntry(
  cardId: string,
  showInCards = true,
): LevelAbilityEntry {
  return {
    cardId,
    showInCards,
  };
}

export function createEmptyMagicList(
  name: string,
  order: number,
): PlayerMagicList {
  return {
    id: `magic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    order,
    description: "",
    tiers: createEmptyMagicTiers(),
    learnedCardIds: [],
  };
}

export function normalizeMagicLists(raw: unknown): PlayerMagicList[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((value, index) => {
      if (!value || typeof value !== "object") return null;
      const source = value as Record<string, unknown>;
      const id = typeof source.id === "string" && source.id.trim()
        ? source.id.trim()
        : `magic-${index}`;
      const name = typeof source.name === "string" && source.name.trim()
        ? source.name.trim()
        : `Magic ${index + 1}`;
      const order = typeof source.order === "number" && Number.isFinite(source.order)
        ? source.order
        : index;
      const description = typeof source.description === "string" ? source.description : "";
      const rawTiers = source.tiers && typeof source.tiers === "object"
        ? source.tiers as Record<string, unknown>
        : {};
      const tiers = createEmptyMagicTiers();

      for (const tier of MAGIC_TIER_ORDER) {
        const tierValues = rawTiers[tier];
        tiers[tier] = Array.isArray(tierValues)
          ? tierValues.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          : [];
      }

      const tierCardIds = new Set(MAGIC_TIER_ORDER.flatMap((tier) => tiers[tier] || []));
      const learnedCardIds = Array.isArray(source.learnedCardIds)
        ? source.learnedCardIds.filter((entry): entry is string => typeof entry === "string" && tierCardIds.has(entry))
        : [];

      return {
        id,
        name,
        order,
        description,
        tiers,
        learnedCardIds,
      } satisfies PlayerMagicList;
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order) as PlayerMagicList[];
}

export function getMagicListCardIds(list: PlayerMagicList) {
  return MAGIC_TIER_ORDER.flatMap((tier) => list.tiers[tier] || []);
}

export function getMagicListLearnedCardIds(list: PlayerMagicList) {
  const available = new Set(getMagicListCardIds(list));
  return (list.learnedCardIds || []).filter((cardId) => available.has(cardId));
}

export function collectMagicCardIds(lists: PlayerMagicList[]) {
  const ids = new Set<string>();
  for (const list of lists) {
    for (const cardId of getMagicListCardIds(list)) {
      ids.add(cardId);
    }
  }
  return ids;
}

export function collectLearnedMagicCardIds(lists: PlayerMagicList[]) {
  const ids = new Set<string>();
  for (const list of lists) {
    for (const cardId of getMagicListLearnedCardIds(list)) {
      ids.add(cardId);
    }
  }
  return ids;
}

export function collectLevelCardsForCards(levels: LevelCategory[]) {
  const ids = new Set<string>();
  for (const level of levels) {
    for (const entry of getLevelCategoryEntries(level)) {
      if (entry.showInCards) ids.add(entry.cardId);
    }
  }
  return ids;
}
