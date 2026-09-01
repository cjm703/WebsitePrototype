import {
  BUSINESS_MAP_LAYER_DEFAULTS,
  createDefaultBusinessSlot,
  normalizeFacilityAdditions,
  normalizeOfficeBusinessMap,
  type BusinessMapShape,
  type BusinessSlotCategory,
  type FacilityAddition,
  type FacilityStatKey,
  type FacilityStatModifier,
  type OfficeBusinessMapState,
} from "./business-map-model";

export type FacilityStats = Record<FacilityStatKey, number>;

export interface PersonalFund {
  playerId: string;
  balance: number;
  currency: string;
  note: string;
  updatedAt: string;
  updatedBy: string;
}

export interface FacilityDepthFields {
  ownerPlayerId: string;
  presetId: string;
  baseStats: FacilityStats;
  revenueDestination: "owner-personal-fund";
}

export const FACILITY_STAT_KEYS: FacilityStatKey[] = [
  "capacity",
  "appeal",
  "revenue",
  "expenses",
  "security",
  "maintenance",
  "staff",
  "condition",
];

export const FACILITY_STAT_META: Record<FacilityStatKey, { label: string; unit: string; higherIsBetter: boolean }> = {
  capacity: { label: "Guest Capacity", unit: "", higherIsBetter: true },
  appeal: { label: "Appeal", unit: "", higherIsBetter: true },
  revenue: { label: "Revenue / Month", unit: " CR", higherIsBetter: true },
  expenses: { label: "Expenses / Month", unit: " CR", higherIsBetter: false },
  security: { label: "Security", unit: "", higherIsBetter: true },
  maintenance: { label: "Maintenance", unit: "", higherIsBetter: true },
  staff: { label: "Staff Required", unit: "", higherIsBetter: false },
  condition: { label: "Condition", unit: "", higherIsBetter: true },
};

export const DEFAULT_FACILITY_STATS: FacilityStats = {
  capacity: 0,
  appeal: 0,
  revenue: 0,
  expenses: 0,
  security: 0,
  maintenance: 0,
  staff: 0,
  condition: 100,
};

export const MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v13";
export const LEGACY_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v1";
export const PREVIOUS_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v2";
export const RECENT_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v3";
export const FOURTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v4";
export const LAST_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v5";
export const SIXTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v6";
export const SEVENTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v7";
export const EIGHTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v8";
export const NINTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v9";
export const TENTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v10";
export const ELEVENTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v11";
export const TWELFTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v12";

const MYSTIC_BASE_STATS: FacilityStats = {
  capacity: 1200,
  appeal: 35,
  revenue: 7200,
  expenses: 3200,
  security: 45,
  maintenance: 70,
  staff: 38,
  condition: 88,
};

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function text(value: unknown, fallback = "", max = 500) {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

export function normalizeFacilityStats(raw: unknown, fallback: FacilityStats = DEFAULT_FACILITY_STATS): FacilityStats {
  const source = raw && typeof raw === "object" ? raw as Partial<FacilityStats> : {};
  return Object.fromEntries(FACILITY_STAT_KEYS.map((key) => [key, Math.round(finite(source[key], fallback[key]))])) as FacilityStats;
}

export function normalizePersonalFunds(raw: unknown): PersonalFund[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.slice(0, 200).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const source = candidate as Partial<PersonalFund>;
    const playerId = text(source.playerId, "", 100).trim();
    if (!playerId || playerId === "dm" || seen.has(playerId)) return [];
    seen.add(playerId);
    return [{
      playerId,
      balance: Math.max(0, Math.round(finite(source.balance, 0))),
      currency: text(source.currency, "CR", 12).trim() || "CR",
      note: text(source.note, "", 300),
      updatedAt: text(source.updatedAt, "", 80),
      updatedBy: text(source.updatedBy, "", 100),
    }];
  });
}

export function normalizeFacilityDepthFields(raw: unknown): FacilityDepthFields {
  const source = raw && typeof raw === "object" ? raw as Partial<FacilityDepthFields> : {};
  return {
    ownerPlayerId: text(source.ownerPlayerId, "", 100).trim(),
    presetId: text(source.presetId, "", 100).trim(),
    baseStats: normalizeFacilityStats(source.baseStats),
    revenueDestination: "owner-personal-fund",
  };
}

export function ensurePersonalFund(funds: PersonalFund[], playerId: string): PersonalFund[] {
  if (!playerId || playerId === "dm" || funds.some((fund) => fund.playerId === playerId)) return funds;
  return [...funds, { playerId, balance: 0, currency: "CR", note: "", updatedAt: "", updatedBy: "" }];
}

export function personalFundBalance(funds: PersonalFund[], playerId: string) {
  return funds.find((fund) => fund.playerId === playerId)?.balance || 0;
}

export function emptyFacilityStats(): FacilityStats {
  return { ...DEFAULT_FACILITY_STATS, condition: 0 };
}

export function addFacilityStatModifiers(stats: FacilityStats, modifiers: FacilityStatModifier[]) {
  const next = { ...stats };
  modifiers.forEach(({ stat, amount }) => {
    next[stat] += amount;
  });
  return next;
}

export function installedFacilityAdditionIds(map: OfficeBusinessMapState) {
  return map.sectors.flatMap((sector) => sector.slots.map((slot) => slot.installedAdditionId).filter(Boolean));
}

export function calculateFacilityStats(baseStats: FacilityStats, map: OfficeBusinessMapState, additions: FacilityAddition[]) {
  const byId = new Map(additions.map((addition) => [addition.id, addition]));
  return installedFacilityAdditionIds(map).reduce((stats, additionId) => {
    const addition = byId.get(additionId);
    return addition ? addFacilityStatModifiers(stats, addition.statModifiers) : stats;
  }, { ...baseStats });
}

export function facilityStatDelta(addition: FacilityAddition | null | undefined) {
  return addFacilityStatModifiers(emptyFacilityStats(), addition?.statModifiers || []);
}

function parkSlot(id: string, name: string, category: BusinessSlotCategory, x: number, y: number, width: number, height: number, tags: string[]) {
  return {
    ...createDefaultBusinessSlot(id, name, category, x, y),
    width,
    height,
    acceptedTags: tags,
  };
}

const surface = () => ({
  background: { mode: "solid" as const, color: "#07130F", imageUrl: "", opacity: 1, fit: "cover" as const },
  layers: BUSINESS_MAP_LAYER_DEFAULTS.map((layer) => ({ ...layer })),
  shapes: [] as BusinessMapShape[],
});

export function createMysticLandsParkMap(): OfficeBusinessMapState {
  const horizontalTrim = 3;
  const parkX = (x: number) => x - horizontalTrim;
  const parkPoint = (x: number, y: number) => ({ x: parkX(x), y });
  const walkway = (id: string, points: Array<{ x: number; y: number }>, curved = true): BusinessMapShape => ({
    id,
    kind: "pathway",
    layerId: "pathways",
    name: "Guest Walkway",
    points: points.map((point) => parkPoint(point.x, point.y)),
    color: "#C8BFA5",
    fillColor: "#C8BFA5",
    opacity: 0.96,
    strokeWidth: id === "park-ring" ? 1.5 : 1.15,
    label: "",
    curved,
    visible: true,
    locked: true,
  });
  const perimeterWalkway = (sectorId: string, x: number, y: number, width: number, height: number): BusinessMapShape => ({
    ...walkway(`perimeter-${sectorId}`, [{ x, y }, { x: x + width, y: y + height }], false),
    name: "Area Perimeter Walkway",
    strokeWidth: 1,
  });
  const fence = (id: string, points: Array<{ x: number; y: number }>): BusinessMapShape => ({
    id,
    kind: "wall",
    layerId: "walls",
    name: "Park Perimeter Fence",
    points: points.map((point) => parkPoint(point.x, point.y)),
    color: "#E0F0C8",
    fillColor: "#E0F0C8",
    opacity: 0.95,
    strokeWidth: 1.5,
    label: "",
    curved: false,
    visible: true,
    locked: true,
  });
  const sector = (data: Record<string, unknown>) => ({ ...surface(), state: "active", unlockExpansionId: "", zoneType: "Attraction", ...data, x: parkX(finite(data.x, 0)) });
  const expansionId = "mystic-north-expansion";

  return normalizeOfficeBusinessMap({
    version: 3,
    name: "Mystic Lands Park",
    description: "A seven-zone destination park centered on Magic Mountain, with six connected lands arranged clockwise from the southern Enchanted Gardens entrance and future parkland reserved beyond the northern fence.",
    grid: { width: 26, height: 24, showGrid: true, snapToGrid: false },
    background: { mode: "solid", color: "#06110D", imageUrl: "", opacity: 1, fit: "cover" },
    layers: BUSINESS_MAP_LAYER_DEFAULTS,
    permissions: { playerCanInstall: true, playerCanRemove: true, allowedPlayerIds: [] },
    shapes: [
      { id: "park-boundary", kind: "area", layerId: "areas", name: "Park Grounds", points: [parkPoint(4, 5), parkPoint(28, 5), parkPoint(28, 23), parkPoint(4, 23)], color: "#77B993", fillColor: "#0E3B29", opacity: 0.52, strokeWidth: 1.2, label: "", curved: false, visible: true, locked: true },
      { id: "north-expansion-ground", kind: "area", layerId: "areas", name: "Northern Future Parkland", points: [parkPoint(11, 0), parkPoint(21, 0), parkPoint(21, 4), parkPoint(11, 4)], color: "#7D6BCD", fillColor: "#211B3B", opacity: 0.42, strokeWidth: 1.2, label: "", curved: false, visible: true, locked: true },
      fence("fence-north", [{ x: 4, y: 5 }, { x: 28, y: 5 }]),
      fence("fence-west", [{ x: 4, y: 5 }, { x: 4, y: 23 }]),
      fence("fence-east", [{ x: 28, y: 5 }, { x: 28, y: 23 }]),
      fence("fence-southwest", [{ x: 4, y: 23 }, { x: 13, y: 23 }]),
      fence("fence-southeast", [{ x: 19, y: 23 }, { x: 28, y: 23 }]),
      fence("entrance-gate-west", [{ x: 13, y: 22.2 }, { x: 13, y: 23.8 }]),
      fence("entrance-gate-east", [{ x: 19, y: 22.2 }, { x: 19, y: 23.8 }]),
      walkway("park-ring", [{ x: 16, y: 9 }, { x: 17.75, y: 9.25 }, { x: 19.5, y: 10.5 }, { x: 20.75, y: 12.25 }, { x: 21, y: 14 }, { x: 20.75, y: 15.75 }, { x: 19.5, y: 17.5 }, { x: 17.75, y: 18.75 }, { x: 16, y: 19 }, { x: 14.25, y: 18.75 }, { x: 12.5, y: 17.5 }, { x: 11.25, y: 15.75 }, { x: 11, y: 14 }, { x: 11.25, y: 12.25 }, { x: 12.5, y: 10.5 }, { x: 14.25, y: 9.25 }, { x: 16, y: 9 }]),
      walkway("path-north", [{ x: 11, y: 9 }, { x: 16, y: 9 }, { x: 21, y: 9 }], false),
      walkway("path-northwest", [{ x: 11, y: 14 }, { x: 11, y: 13 }, { x: 11, y: 9 }, { x: 11, y: 6 }], false),
      walkway("path-northeast", [{ x: 21, y: 14 }, { x: 21, y: 13 }, { x: 21, y: 9 }, { x: 21, y: 5.5 }], false),
      walkway("path-west", [{ x: 11, y: 13 }, { x: 5, y: 13 }], false),
      walkway("path-east", [{ x: 21, y: 13 }, { x: 27, y: 13 }], false),
      walkway("path-alley", [{ x: 11, y: 6 }, { x: 5, y: 6 }, { x: 5, y: 6.5 }], false),
      perimeterWalkway("mystic-northwest", 5, 6, 6, 7),
      perimeterWalkway("mystic-northeast", 11, 5, 10, 4),
      perimeterWalkway("mystic-east", 21, 6, 6, 7),
      perimeterWalkway("mystic-southeast", 21, 13, 6, 7),
      perimeterWalkway("mystic-southwest", 5, 13, 6, 7),
      perimeterWalkway("mystic-annex", 4, 6, 1, 1),
    ],
    sectors: [
      sector({ id: "mystic-entrance", name: "Enchanted Gardens", description: "The park entrance beneath cherry-blossom trees, with family rides, a kiddie coaster, and a boat journey through the gardens into indoor show scenes.", color: "#F08FB5", zoneType: "Entrance & Family", decorationTheme: "enchanted-gardens", visualShape: "organic", x: 13, y: 19, width: 6, height: 4, slots: [parkSlot("entrance-gates", "Blossom Gatehouse", "Commercial", 1, 1, 5, 3, ["entrance", "guest-service"]), parkSlot("entrance-security", "Enchanted Gardens Security", "Security", 7, 1, 4, 3, ["security", "entrance"]), parkSlot("entrance-information", "Garden Guest Services", "Office", 13, 1, 4, 3, ["guest-service"])] }),
      sector({ id: "mystic-center", name: "Magic Mountain", description: "A giant snow-capped hollow mountain containing an indoor story coaster about tracking the original fairy, becoming lost in a magical forest, and finding the way home.", color: "#8FBDE8", zoneType: "Landmark & Indoor Coaster", decorationTheme: "magic-mountain", visualShape: "ellipse", x: 11, y: 9, width: 10, height: 10, slots: [parkSlot("center-landmark", "Original Fairy Expedition", "Commercial", 2, 2, 6, 5, ["landmark", "attraction"]), parkSlot("center-food", "Mountain Concourse", "Commercial", 10, 2, 6, 4, ["food", "guest-service"]), parkSlot("center-stage", "Fairy Story Theater", "Operations", 2, 9, 6, 4, ["entertainment", "event"]), parkSlot("center-utility", "Mountain Operations", "Utility", 11, 9, 4, 3, ["power", "maintenance"])] }),
      sector({ id: "mystic-northwest", name: "World Tree", description: "A natural land with serious undertones, dominated by a colossal tree and a 110-foot wooden coaster twisting through airtime hills around the trunk before ending inside it.", color: "#6EAD72", zoneType: "Nature & Wooden Coaster", decorationTheme: "world-tree", visualShape: "organic", x: 5, y: 6, width: 6, height: 7, slots: [parkSlot("whisperwood-attraction", "World Tree Coaster", "Commercial", 1, 1, 7, 5, ["nature", "attraction"]), parkSlot("whisperwood-kiosk", "Rootwood Kiosk", "Commercial", 10, 2, 4, 3, ["retail", "food"])] }),
      sector({ id: "mystic-northeast", name: "Stormlands", description: "A rugged land of jagged cliffs, narrow-feeling paths, fog machines, and misters, anchored by a multi-launch coaster with inversions and a drop track.", color: "#7889A2", zoneType: "Cliffs & Launch Coaster", decorationTheme: "stormlands", visualShape: "organic", x: 11, y: 5, width: 10, height: 4, slots: [parkSlot("dragonspire-anchor", "Tempest Launch Coaster", "Commercial", 1, 1, 9, 6, ["thrill", "attraction"]), parkSlot("dragonspire-support", "Stormlands Operations", "Operations", 12, 2, 4, 4, ["ride-support", "staff"])] }),
      sector({ id: "mystic-east", name: "Mushroom Forest", description: "An eerie forest defined by dimly glowing giant mushrooms and a steel hypercoaster over 200 feet tall, focused on airtime and sweeping hills.", color: "#9A79D2", zoneType: "Bioluminescent Forest", decorationTheme: "mushroom-forest", visualShape: "organic", x: 21, y: 6, width: 6, height: 7, slots: [parkSlot("carnival-games", "Giant Mushroom Hypercoaster", "Commercial", 1, 1, 7, 4, ["thrill", "attraction"]), parkSlot("carnival-retail", "Sporelight Market", "Commercial", 10, 1, 6, 4, ["retail", "prizes"]), parkSlot("carnival-food", "Mushroom Forest Food Stall", "Commercial", 3, 8, 5, 3, ["food"])] }),
      sector({ id: "mystic-southeast", name: "Whispering Woods", description: "A dim, foggy forest of towering trees where a two-mile wooden coaster is under construction, planned around three lift hills rising to 150, 170, and 200 feet.", color: "#4F806A", zoneType: "Forest & Construction", decorationTheme: "whispering-woods", visualShape: "organic", x: 21, y: 13, width: 6, height: 7, slots: [parkSlot("starlight-theater", "Whispering Woods Coaster", "Commercial", 1, 1, 8, 5, ["entertainment", "attraction"]), parkSlot("starlight-dining", "Woods Construction Operations", "Operations", 11, 1, 6, 4, ["construction", "staff"])] }),
      sector({ id: "mystic-southwest", name: "Dream Land", description: "A whimsical land of colorful trees, bright bushes, tiny singing animatronics, playful shops, and a family steel coaster, entered to the left of Enchanted Gardens.", color: "#E28FD0", zoneType: "Whimsical Family", decorationTheme: "dream-land", visualShape: "organic", x: 5, y: 13, width: 6, height: 7, slots: [parkSlot("runebrook-family", "Dream Land Family Coaster", "Commercial", 1, 1, 8, 5, ["family", "attraction"]), parkSlot("runebrook-rest", "Dream Land Rest Area", "Utility", 11, 1, 5, 4, ["guest-service", "rest"])] }),
      sector({ id: "mystic-annex", name: "World Tree Service Access", description: "A compact backstage service access attached to World Tree. It supports supplies and security without counting as a public themed zone.", color: "#55745D", zoneType: "Backstage Service", visualShape: "organic", x: 4, y: 6, width: 1, height: 1, slots: [parkSlot("annex-storage", "World Tree Service Storage", "Storage", 2, 2, 6, 4, ["storage", "supplies"]), parkSlot("annex-security", "World Tree Service Gate", "Security", 10, 2, 4, 4, ["security", "service"])] }),
      sector({ id: "mystic-expansion-west", name: "Future Parkland West", description: "The western half of the reserved northern park expansion, awaiting a future themed land.", color: "#766AA8", zoneType: "Future Expansion", x: 11, y: 0, width: 4, height: 4, state: "locked", unlockExpansionId: expansionId, slots: [parkSlot("celestial-anchor", "Future Attraction Pad West", "Commercial", 2, 2, 9, 6, ["attraction", "expansion"]), parkSlot("celestial-support", "Future Utility Pad West", "Utility", 13, 3, 4, 4, ["utility", "expansion"])] }),
      sector({ id: "mystic-expansion-east", name: "Future Parkland East", description: "The eastern half of the reserved northern park expansion, awaiting a future themed land.", color: "#8175B6", zoneType: "Future Expansion", x: 17, y: 0, width: 4, height: 4, state: "locked", unlockExpansionId: expansionId, slots: [parkSlot("astral-anchor", "Future Attraction Pad East", "Commercial", 2, 2, 9, 6, ["attraction", "expansion"]), parkSlot("astral-support", "Future Operations Pad East", "Operations", 13, 3, 4, 4, ["operations", "expansion"])] }),
    ],
    expansions: [{ id: expansionId, name: "Northern Future Parkland", description: "A funded development beyond the northern fence unlocks two future parkland plots immediately after DM completion.", x: parkX(11), y: 0, width: 10, height: 4, cost: 15000, currency: "CR", status: "available", unlockSectorIds: ["mystic-expansion-west", "mystic-expansion-east"], fundedBy: "", fundedAt: "", completedBy: "", completedAt: "" }],
  });
}

const LEGACY_MYSTIC_ADDITION_IDS = new Set([
  "mystic-add-gatehouse",
  "mystic-add-dragon-coaster",
  "mystic-add-carousel",
  "mystic-add-theater",
  "mystic-add-food-court",
  "mystic-add-gift-shop",
  "mystic-add-security",
  "mystic-add-workshop",
  "mystic-add-garden",
  "mystic-add-expansion",
]);

export function ensureMysticLandsAdditions(raw: unknown): FacilityAddition[] {
  return normalizeFacilityAdditions(raw).filter((addition) => !LEGACY_MYSTIC_ADDITION_IDS.has(addition.id));
}

export function createMysticLandsParkFacility() {
  return {
    id: "facility-mystic-lands-park",
    name: "Mystic Lands Park",
    type: "Commercial" as const,
    location: "Mystic Lands District",
    description: "A player-owned seven-zone destination park centered on Magic Mountain, with six connected lands arranged clockwise from Enchanted Gardens.",
    status: "Active",
    statusColor: "#4ACA6A",
    capacity: "1200 guests",
    condition: "Excellent",
    notes: "Facility revenue is assigned to the owner's Personal Fund ledger. The DM adjusts deposited income manually.",
    revenue: String(MYSTIC_BASE_STATS.revenue),
    expenses: String(MYSTIC_BASE_STATS.expenses),
    employeesOnSite: String(MYSTIC_BASE_STATS.staff),
    ownerPlayerId: "",
    presetId: MYSTIC_LANDS_PARK_PRESET_ID,
    baseStats: { ...MYSTIC_BASE_STATS },
    revenueDestination: "owner-personal-fund" as const,
    businessMap: createMysticLandsParkMap(),
  };
}

export function isMysticLandsPark(candidate: unknown) {
  if (!candidate || typeof candidate !== "object") return false;
  const source = candidate as { id?: unknown; name?: unknown; presetId?: unknown };
  return source.id === "facility-mystic-lands-park"
    || source.presetId === MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === LEGACY_MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === PREVIOUS_MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === RECENT_MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === FOURTH_MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === LAST_MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === SIXTH_MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === SEVENTH_MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === EIGHTH_MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === NINTH_MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === TENTH_MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === ELEVENTH_MYSTIC_LANDS_PARK_PRESET_ID
    || source.presetId === TWELFTH_MYSTIC_LANDS_PARK_PRESET_ID
    || source.name === "Mystic Lands Park";
}
