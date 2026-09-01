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

export const MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v9";
export const LEGACY_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v1";
export const PREVIOUS_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v2";
export const RECENT_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v3";
export const FOURTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v4";
export const LAST_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v5";
export const SIXTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v6";
export const SEVENTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v7";
export const EIGHTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v8";

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
  const walkway = (id: string, points: Array<{ x: number; y: number }>, curved = true): BusinessMapShape => ({
    id,
    kind: "pathway",
    layerId: "pathways",
    name: "Guest Walkway",
    points,
    color: "#C8BFA5",
    fillColor: "#C8BFA5",
    opacity: 0.96,
    strokeWidth: id === "park-ring" ? 1.5 : 1.15,
    label: "",
    curved,
    visible: true,
    locked: true,
  });
  const fence = (id: string, points: Array<{ x: number; y: number }>): BusinessMapShape => ({
    id,
    kind: "wall",
    layerId: "walls",
    name: "Park Perimeter Fence",
    points,
    color: "#E0F0C8",
    fillColor: "#E0F0C8",
    opacity: 0.95,
    strokeWidth: 1.5,
    label: "",
    curved: false,
    visible: true,
    locked: true,
  });
  const sector = (data: Record<string, unknown>) => ({ ...surface(), state: "active", unlockExpansionId: "", zoneType: "Attraction", ...data });
  const expansionId = "mystic-north-expansion";

  return normalizeOfficeBusinessMap({
    version: 3,
    name: "Mystic Lands Park",
    description: "A fenced destination park organized around a circular central commons and promenade loop, with five adjoining themed districts, a single southern entrance, a compact northwest alley, and a reserved northern expansion beyond the fence.",
    grid: { width: 32, height: 24, showGrid: true, snapToGrid: false },
    background: { mode: "solid", color: "#06110D", imageUrl: "", opacity: 1, fit: "cover" },
    layers: BUSINESS_MAP_LAYER_DEFAULTS,
    permissions: { playerCanInstall: true, playerCanRemove: true, allowedPlayerIds: [] },
    shapes: [
      { id: "park-boundary", kind: "area", layerId: "areas", name: "Park Grounds", points: [{ x: 1, y: 5 }, { x: 31, y: 5 }, { x: 31, y: 23 }, { x: 1, y: 23 }], color: "#77B993", fillColor: "#0E3B29", opacity: 0.52, strokeWidth: 1.2, label: "", curved: false, visible: true, locked: true },
      { id: "north-expansion-ground", kind: "area", layerId: "areas", name: "Northern Expansion Grounds", points: [{ x: 11, y: 0 }, { x: 21, y: 0 }, { x: 21, y: 4 }, { x: 11, y: 4 }], color: "#7D6BCD", fillColor: "#211B3B", opacity: 0.42, strokeWidth: 1.2, label: "", curved: false, visible: true, locked: true },
      fence("fence-north", [{ x: 1, y: 5 }, { x: 31, y: 5 }]),
      fence("fence-west", [{ x: 1, y: 5 }, { x: 1, y: 23 }]),
      fence("fence-east", [{ x: 31, y: 5 }, { x: 31, y: 23 }]),
      fence("fence-southwest", [{ x: 1, y: 23 }, { x: 13, y: 23 }]),
      fence("fence-southeast", [{ x: 19, y: 23 }, { x: 31, y: 23 }]),
      fence("entrance-gate-west", [{ x: 13, y: 22.2 }, { x: 13, y: 23.8 }]),
      fence("entrance-gate-east", [{ x: 19, y: 22.2 }, { x: 19, y: 23.8 }]),
      walkway("park-ring", [{ x: 16, y: 9 }, { x: 17.75, y: 9.25 }, { x: 19.5, y: 10.5 }, { x: 20.75, y: 12.25 }, { x: 21, y: 14 }, { x: 20.75, y: 15.75 }, { x: 19.5, y: 17.5 }, { x: 17.75, y: 18.75 }, { x: 16, y: 19 }, { x: 14.25, y: 18.75 }, { x: 12.5, y: 17.5 }, { x: 11.25, y: 15.75 }, { x: 11, y: 14 }, { x: 11.25, y: 12.25 }, { x: 12.5, y: 10.5 }, { x: 14.25, y: 9.25 }, { x: 16, y: 9 }]),
      walkway("path-north", [{ x: 11, y: 9 }, { x: 16, y: 9 }, { x: 21, y: 9 }], false),
      walkway("path-northwest", [{ x: 11, y: 14 }, { x: 11, y: 13 }, { x: 11, y: 9 }, { x: 11, y: 6 }], false),
      walkway("path-northeast", [{ x: 21, y: 14 }, { x: 21, y: 13 }, { x: 21, y: 9 }, { x: 21, y: 5.5 }], false),
      walkway("path-west", [{ x: 11, y: 13 }, { x: 5, y: 13 }], false),
      walkway("path-east", [{ x: 21, y: 13 }, { x: 27, y: 13 }], false),
      walkway("path-alley", [{ x: 11, y: 6 }, { x: 5, y: 6 }, { x: 5, y: 6.5 }], false),
    ],
    sectors: [
      sector({ id: "mystic-entrance", name: "Moonstone Entrance", description: "The park's only public entrance, extending directly from Aetherheart Commons to the southern gate for ticketing, guest services, and security.", color: "#79B8FF", zoneType: "Entrance", visualShape: "organic", x: 13, y: 19, width: 6, height: 4, slots: [parkSlot("entrance-gates", "Enchanted Gatehouse", "Commercial", 1, 1, 5, 3, ["entrance", "guest-service"]), parkSlot("entrance-security", "Arrival Security", "Security", 7, 1, 4, 3, ["security", "entrance"]), parkSlot("entrance-information", "Guest Information", "Office", 13, 1, 4, 3, ["guest-service"])] }),
      sector({ id: "mystic-center", name: "Aetherheart Commons", description: "The park's circular central landmark and circulation hub, edged by the Grand Promenade footpath loop.", color: "#C084FC", zoneType: "Central Hub", visualShape: "ellipse", x: 11, y: 9, width: 10, height: 10, slots: [parkSlot("center-landmark", "Grand Landmark", "Commercial", 2, 2, 6, 5, ["landmark", "attraction"]), parkSlot("center-food", "Central Food Concourse", "Commercial", 10, 2, 6, 4, ["food", "guest-service"]), parkSlot("center-stage", "Festival Stage", "Operations", 2, 9, 6, 4, ["entertainment", "event"]), parkSlot("center-utility", "Central Utilities", "Utility", 11, 9, 4, 3, ["power", "maintenance"])] }),
      sector({ id: "mystic-northwest", name: "Whisperwood Gardens", description: "A shaded enchanted-garden district north of the Commons, designed for gentle attractions and exploration.", color: "#54C7A0", zoneType: "Garden", visualShape: "organic", x: 5, y: 6, width: 6, height: 7, slots: [parkSlot("whisperwood-attraction", "Garden Attraction", "Commercial", 1, 1, 7, 5, ["nature", "attraction"]), parkSlot("whisperwood-kiosk", "Garden Kiosk", "Commercial", 10, 2, 4, 3, ["retail", "food"])] }),
      sector({ id: "mystic-northeast", name: "Dragonspire Heights", description: "The park's high-energy northern ride district, visible from across the grounds.", color: "#F47A91", zoneType: "Thrill", visualShape: "organic", x: 11, y: 5, width: 10, height: 4, slots: [parkSlot("dragonspire-anchor", "Signature Thrill Ride", "Commercial", 1, 1, 9, 6, ["thrill", "attraction"]), parkSlot("dragonspire-support", "Ride Operations", "Operations", 12, 2, 4, 4, ["ride-support", "staff"])] }),
      sector({ id: "mystic-east", name: "Crystal Carnival", description: "Games, midway entertainment, colorful stalls, and quick-service attractions northeast of the Commons.", color: "#5CC8D7", zoneType: "Midway", visualShape: "organic", x: 21, y: 6, width: 6, height: 7, slots: [parkSlot("carnival-games", "Midway Games", "Commercial", 1, 1, 7, 4, ["games", "attraction"]), parkSlot("carnival-retail", "Prize and Retail Hall", "Commercial", 10, 1, 6, 4, ["retail", "prizes"]), parkSlot("carnival-food", "Carnival Food Stall", "Commercial", 3, 8, 5, 3, ["food"])] }),
      sector({ id: "mystic-southeast", name: "Starlight Promenade", description: "An eastern entertainment district with performances and premium dining.", color: "#D7A24A", zoneType: "Entertainment", visualShape: "organic", x: 21, y: 13, width: 6, height: 7, slots: [parkSlot("starlight-theater", "Promenade Theater", "Commercial", 1, 1, 8, 5, ["entertainment", "theater"]), parkSlot("starlight-dining", "Premium Dining", "Commercial", 11, 1, 6, 4, ["food", "premium"])] }),
      sector({ id: "mystic-southwest", name: "Runebrook Hollow", description: "A western family district organized around water, quiet rides, and sheltered rest areas.", color: "#79B8FF", zoneType: "Family", visualShape: "organic", x: 5, y: 13, width: 6, height: 7, slots: [parkSlot("runebrook-family", "Family Attraction", "Commercial", 1, 1, 8, 5, ["family", "attraction"]), parkSlot("runebrook-rest", "Sheltered Rest Area", "Utility", 11, 1, 5, 4, ["guest-service", "rest"])] }),
      sector({ id: "mystic-annex", name: "Wayfarer Alley", description: "A tiny northwest service alley attached directly to Whisperwood Gardens and the park's edge walkway.", color: "#E18A5B", zoneType: "Alley", visualShape: "organic", x: 3, y: 6, width: 2, height: 1, slots: [parkSlot("annex-storage", "Alley Storage", "Storage", 2, 2, 6, 4, ["storage", "supplies"]), parkSlot("annex-security", "Alley Service Gate", "Security", 10, 2, 4, 4, ["security", "service"])] }),
      sector({ id: "mystic-expansion-west", name: "Celestial Wilds", description: "The western half of the northern expansion, ready for a new themed district.", color: "#8B7BE8", zoneType: "Expansion", x: 11, y: 0, width: 4, height: 4, state: "locked", unlockExpansionId: expansionId, slots: [parkSlot("celestial-anchor", "Expansion Anchor A", "Commercial", 2, 2, 9, 6, ["attraction", "expansion"]), parkSlot("celestial-support", "Expansion Support A", "Utility", 13, 3, 4, 4, ["utility", "expansion"])] }),
      sector({ id: "mystic-expansion-east", name: "Astral Frontier", description: "The eastern half of the northern expansion, built for another major park experience.", color: "#9B8CFF", zoneType: "Expansion", x: 17, y: 0, width: 4, height: 4, state: "locked", unlockExpansionId: expansionId, slots: [parkSlot("astral-anchor", "Expansion Anchor B", "Commercial", 2, 2, 9, 6, ["attraction", "expansion"]), parkSlot("astral-support", "Expansion Support B", "Operations", 13, 3, 4, 4, ["operations", "expansion"])] }),
    ],
    expansions: [{ id: expansionId, name: "Northern Expansion Grounds", description: "A funded development outside the current fence unlocks Celestial Wilds and Astral Frontier immediately after DM completion.", x: 11, y: 0, width: 10, height: 4, cost: 15000, currency: "CR", status: "available", unlockSectorIds: ["mystic-expansion-west", "mystic-expansion-east"], fundedBy: "", fundedAt: "", completedBy: "", completedAt: "" }],
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
    description: "A player-owned destination park organized around Aetherheart Commons, five surrounding themed districts, a ceremonial entrance, and a walkway-connected service annex.",
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
    || source.name === "Mystic Lands Park";
}
