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
  const road = (id: string, points: Array<{ x: number; y: number }>, curved = true): BusinessMapShape => ({
    id,
    kind: "pathway",
    layerId: "pathways",
    name: "Guest Path",
    points,
    color: "#D7C48A",
    fillColor: "#D7C48A",
    opacity: 0.82,
    strokeWidth: 0.42,
    label: "",
    curved,
    visible: true,
    locked: true,
  });
  const label = (id: string, name: string, x: number, y: number): BusinessMapShape => ({
    id,
    kind: "label",
    layerId: "labels",
    name,
    points: [{ x, y }],
    color: "#DDF8E8",
    fillColor: "#DDF8E8",
    opacity: 0.9,
    strokeWidth: 0.1,
    label: name,
    curved: false,
    visible: true,
    locked: true,
  });
  const sector = (data: Record<string, unknown>) => ({ ...surface(), state: "active", unlockExpansionId: "", zoneType: "Attraction", ...data });
  const expansionId = "mystic-north-expansion";

  return normalizeOfficeBusinessMap({
    version: 3,
    name: "Mystic Lands Park",
    description: "A purpose-built commercial park organized around a central commons, five themed rings, a ceremonial entrance, a western service annex, and a reserved northern expansion.",
    grid: { width: 28, height: 22, showGrid: true, snapToGrid: true },
    background: { mode: "solid", color: "#06110D", imageUrl: "", opacity: 1, fit: "cover" },
    layers: BUSINESS_MAP_LAYER_DEFAULTS,
    permissions: { playerCanInstall: true, playerCanRemove: true, allowedPlayerIds: [] },
    shapes: [
      { id: "park-boundary", kind: "area", layerId: "areas", name: "Park Grounds", points: [{ x: 2, y: 4 }, { x: 26, y: 4 }, { x: 27, y: 21 }, { x: 2, y: 21 }], color: "#2F7655", fillColor: "#123B2A", opacity: 0.34, strokeWidth: 0.18, label: "", curved: false, visible: true, locked: true },
      road("path-entrance", [{ x: 14, y: 20 }, { x: 14, y: 15 }, { x: 14, y: 12 }]),
      road("path-northwest", [{ x: 12, y: 11 }, { x: 8, y: 9 }, { x: 6, y: 7 }]),
      road("path-northeast", [{ x: 16, y: 10 }, { x: 20, y: 8 }, { x: 22, y: 7 }]),
      road("path-east", [{ x: 17, y: 12 }, { x: 21, y: 12 }, { x: 23, y: 12 }]),
      road("path-southeast", [{ x: 16, y: 14 }, { x: 19, y: 17 }, { x: 20, y: 18 }]),
      road("path-southwest", [{ x: 11, y: 14 }, { x: 8, y: 17 }, { x: 6, y: 18 }]),
      road("west-service-road", [{ x: 10, y: 12 }, { x: 6, y: 12 }, { x: 2, y: 12 }], false),
      label("park-label", "MYSTIC LANDS PARK", 10.7, 21.3),
      label("road-label", "WEST SERVICE ROAD", 2.4, 11.5),
    ],
    sectors: [
      sector({ id: "mystic-entrance", name: "Moonstone Entrance", description: "The park's ceremonial entrance, ticketing, guest services, and first security checkpoint.", color: "#79B8FF", zoneType: "Entrance", x: 11, y: 19, width: 6, height: 3, slots: [parkSlot("entrance-gates", "Enchanted Gatehouse", "Commercial", 1, 1, 5, 3, ["entrance", "guest-service"]), parkSlot("entrance-security", "Arrival Security", "Security", 7, 1, 4, 3, ["security", "entrance"]), parkSlot("entrance-information", "Guest Information", "Office", 13, 1, 4, 3, ["guest-service"])] }),
      sector({ id: "mystic-center", name: "Aetherheart Commons", description: "The central landmark and circulation hub. Every public zone connects back to the Commons.", color: "#C084FC", zoneType: "Central Hub", x: 10, y: 9, width: 8, height: 6, slots: [parkSlot("center-landmark", "Grand Landmark", "Commercial", 2, 2, 6, 5, ["landmark", "attraction"]), parkSlot("center-food", "Central Food Concourse", "Commercial", 10, 2, 6, 4, ["food", "guest-service"]), parkSlot("center-stage", "Festival Stage", "Operations", 2, 9, 6, 4, ["entertainment", "event"]), parkSlot("center-utility", "Central Utilities", "Utility", 11, 9, 4, 3, ["power", "maintenance"])] }),
      sector({ id: "mystic-northwest", name: "Whisperwood Gardens", description: "A shaded enchanted-garden district designed for gentle attractions and exploration.", color: "#54C7A0", zoneType: "Garden", x: 3, y: 5, width: 6, height: 4, slots: [parkSlot("whisperwood-attraction", "Garden Attraction", "Commercial", 1, 1, 7, 5, ["nature", "attraction"]), parkSlot("whisperwood-kiosk", "Garden Kiosk", "Commercial", 10, 2, 4, 3, ["retail", "food"])] }),
      sector({ id: "mystic-northeast", name: "Dragonspire Heights", description: "The park's high-energy ride district, visible from across the grounds.", color: "#F47A91", zoneType: "Thrill", x: 19, y: 5, width: 6, height: 4, slots: [parkSlot("dragonspire-anchor", "Signature Thrill Ride", "Commercial", 1, 1, 9, 6, ["thrill", "attraction"]), parkSlot("dragonspire-support", "Ride Operations", "Operations", 12, 2, 4, 4, ["ride-support", "staff"])] }),
      sector({ id: "mystic-east", name: "Crystal Carnival", description: "Games, midway entertainment, colorful stalls, and quick-service attractions.", color: "#5CC8D7", zoneType: "Midway", x: 20, y: 10, width: 6, height: 5, slots: [parkSlot("carnival-games", "Midway Games", "Commercial", 1, 1, 7, 4, ["games", "attraction"]), parkSlot("carnival-retail", "Prize and Retail Hall", "Commercial", 10, 1, 6, 4, ["retail", "prizes"]), parkSlot("carnival-food", "Carnival Food Stall", "Commercial", 3, 8, 5, 3, ["food"])] }),
      sector({ id: "mystic-southeast", name: "Starlight Promenade", description: "An evening-focused entertainment district with performances and premium dining.", color: "#D7A24A", zoneType: "Entertainment", x: 17, y: 16, width: 7, height: 4, slots: [parkSlot("starlight-theater", "Promenade Theater", "Commercial", 1, 1, 8, 5, ["entertainment", "theater"]), parkSlot("starlight-dining", "Premium Dining", "Commercial", 11, 1, 6, 4, ["food", "premium"])] }),
      sector({ id: "mystic-southwest", name: "Runebrook Hollow", description: "A family district organized around water, quiet rides, and sheltered rest areas.", color: "#79B8FF", zoneType: "Family", x: 3, y: 16, width: 7, height: 4, slots: [parkSlot("runebrook-family", "Family Attraction", "Commercial", 1, 1, 8, 5, ["family", "attraction"]), parkSlot("runebrook-rest", "Sheltered Rest Area", "Utility", 11, 1, 5, 4, ["guest-service", "rest"])] }),
      sector({ id: "mystic-annex", name: "Wayfarer Annex", description: "A compact off-site operations zone reached by the western service road.", color: "#E18A5B", zoneType: "Service Annex", x: 0, y: 10, width: 5, height: 4, slots: [parkSlot("annex-workshop", "Maintenance Workshop", "Industrial", 1, 1, 7, 5, ["maintenance", "repair"]), parkSlot("annex-storage", "Park Storage", "Storage", 10, 1, 6, 4, ["storage", "supplies"]), parkSlot("annex-security", "Service Gate Security", "Security", 4, 8, 4, 3, ["security", "service"])] }),
      sector({ id: "mystic-expansion-west", name: "Celestial Wilds", description: "The western half of the northern expansion, ready for a new themed district.", color: "#8B7BE8", zoneType: "Expansion", x: 9, y: 1, width: 5, height: 4, state: "locked", unlockExpansionId: expansionId, slots: [parkSlot("celestial-anchor", "Expansion Anchor A", "Commercial", 2, 2, 9, 6, ["attraction", "expansion"]), parkSlot("celestial-support", "Expansion Support A", "Utility", 13, 3, 4, 4, ["utility", "expansion"])] }),
      sector({ id: "mystic-expansion-east", name: "Astral Frontier", description: "The eastern half of the northern expansion, built for another major park experience.", color: "#9B8CFF", zoneType: "Expansion", x: 14, y: 1, width: 5, height: 4, state: "locked", unlockExpansionId: expansionId, slots: [parkSlot("astral-anchor", "Expansion Anchor B", "Commercial", 2, 2, 9, 6, ["attraction", "expansion"]), parkSlot("astral-support", "Expansion Support B", "Operations", 13, 3, 4, 4, ["operations", "expansion"])] }),
    ],
    expansions: [{ id: expansionId, name: "Northern Expansion Grounds", description: "A funded development unlocks Celestial Wilds and Astral Frontier immediately after DM completion.", x: 9, y: 0, width: 10, height: 6, cost: 15000, currency: "CR", status: "available", unlockSectorIds: ["mystic-expansion-west", "mystic-expansion-east"], fundedBy: "", fundedAt: "", completedBy: "", completedAt: "" }],
  });
}

const MYSTIC_ADDITION_SEEDS: Array<Omit<FacilityAddition, "createdAt" | "updatedAt" | "thumbnailUrl">> = [
  { id: "mystic-add-gatehouse", name: "Enchanted Gatehouse", description: "A high-throughput themed arrival complex with ticketing and guest orientation.", category: "Commercial", tags: ["entrance", "guest-service"], quantity: 1, width: 5, height: 3, cost: 4200, monthlyUpkeep: 180, ownerPlayerId: "", statModifiers: [{ stat: "capacity", amount: 180 }, { stat: "appeal", amount: 3 }, { stat: "revenue", amount: 350 }, { stat: "expenses", amount: 180 }, { stat: "staff", amount: 4 }] },
  { id: "mystic-add-dragon-coaster", name: "Dragonspire Skyrail", description: "A signature suspended thrill ride that defines the park skyline.", category: "Commercial", tags: ["thrill", "attraction"], quantity: 1, width: 9, height: 6, cost: 18000, monthlyUpkeep: 900, ownerPlayerId: "", statModifiers: [{ stat: "capacity", amount: 260 }, { stat: "appeal", amount: 12 }, { stat: "revenue", amount: 2400 }, { stat: "expenses", amount: 900 }, { stat: "maintenance", amount: -8 }, { stat: "staff", amount: 9 }] },
  { id: "mystic-add-carousel", name: "Moonpetal Carousel", description: "A family ride of illuminated mythic creatures and rotating seasonal scenes.", category: "Commercial", tags: ["family", "attraction"], quantity: 1, width: 7, height: 5, cost: 7600, monthlyUpkeep: 320, ownerPlayerId: "", statModifiers: [{ stat: "capacity", amount: 140 }, { stat: "appeal", amount: 6 }, { stat: "revenue", amount: 900 }, { stat: "expenses", amount: 320 }, { stat: "staff", amount: 4 }] },
  { id: "mystic-add-theater", name: "Illusion Theater", description: "A programmable performance venue for magical spectacles and evening shows.", category: "Commercial", tags: ["entertainment", "theater"], quantity: 1, width: 8, height: 5, cost: 9800, monthlyUpkeep: 450, ownerPlayerId: "", statModifiers: [{ stat: "capacity", amount: 220 }, { stat: "appeal", amount: 8 }, { stat: "revenue", amount: 1500 }, { stat: "expenses", amount: 450 }, { stat: "staff", amount: 7 }] },
  { id: "mystic-add-food-court", name: "Crystal Food Court", description: "A central multi-vendor dining hall with efficient guest circulation.", category: "Commercial", tags: ["food", "guest-service"], quantity: 1, width: 6, height: 4, cost: 5200, monthlyUpkeep: 260, ownerPlayerId: "", statModifiers: [{ stat: "capacity", amount: 100 }, { stat: "appeal", amount: 3 }, { stat: "revenue", amount: 1100 }, { stat: "expenses", amount: 260 }, { stat: "staff", amount: 6 }] },
  { id: "mystic-add-gift-shop", name: "Arcane Gift Emporium", description: "A themed retail hall for park merchandise, curios, and prize fulfillment.", category: "Commercial", tags: ["retail", "prizes"], quantity: 1, width: 6, height: 4, cost: 3900, monthlyUpkeep: 140, ownerPlayerId: "", statModifiers: [{ stat: "appeal", amount: 2 }, { stat: "revenue", amount: 850 }, { stat: "expenses", amount: 140 }, { stat: "staff", amount: 3 }] },
  { id: "mystic-add-security", name: "Wardstone Security Grid", description: "Linked wardstones, cameras, and response stations covering public approaches.", category: "Security", tags: ["security", "entrance", "service"], quantity: 2, width: 4, height: 3, cost: 3000, monthlyUpkeep: 110, ownerPlayerId: "", statModifiers: [{ stat: "security", amount: 14 }, { stat: "expenses", amount: 110 }, { stat: "staff", amount: 2 }] },
  { id: "mystic-add-workshop", name: "Runic Maintenance Workshop", description: "A repair and fabrication shop that improves park-wide maintenance response.", category: "Industrial", tags: ["maintenance", "repair"], quantity: 1, width: 7, height: 5, cost: 4600, monthlyUpkeep: 190, ownerPlayerId: "", statModifiers: [{ stat: "maintenance", amount: 16 }, { stat: "condition", amount: 4 }, { stat: "expenses", amount: 190 }, { stat: "staff", amount: 4 }] },
  { id: "mystic-add-garden", name: "Whispering Hedge Maze", description: "A living garden attraction suited to the quiet northwest grounds.", category: "Commercial", tags: ["nature", "attraction"], quantity: 1, width: 7, height: 5, cost: 6400, monthlyUpkeep: 240, ownerPlayerId: "", statModifiers: [{ stat: "capacity", amount: 120 }, { stat: "appeal", amount: 7 }, { stat: "revenue", amount: 700 }, { stat: "expenses", amount: 240 }, { stat: "maintenance", amount: -2 }, { stat: "staff", amount: 3 }] },
  { id: "mystic-add-expansion", name: "Astral Expedition", description: "A future headline attraction sized for either northern expansion anchor.", category: "Commercial", tags: ["attraction", "expansion"], quantity: 1, width: 9, height: 6, cost: 14000, monthlyUpkeep: 650, ownerPlayerId: "", statModifiers: [{ stat: "capacity", amount: 240 }, { stat: "appeal", amount: 10 }, { stat: "revenue", amount: 1900 }, { stat: "expenses", amount: 650 }, { stat: "staff", amount: 8 }] },
];

export function ensureMysticLandsAdditions(raw: unknown): FacilityAddition[] {
  const existing = normalizeFacilityAdditions(raw);
  const ids = new Set(existing.map((addition) => addition.id));
  const now = new Date().toISOString();
  return normalizeFacilityAdditions([
    ...existing,
    ...MYSTIC_ADDITION_SEEDS.filter((addition) => !ids.has(addition.id)).map((addition) => ({ ...addition, thumbnailUrl: "", createdAt: now, updatedAt: now })),
  ]);
}

export function createMysticLandsParkFacility() {
  return {
    id: "facility-mystic-lands-park",
    name: "Mystic Lands Park",
    type: "Commercial" as const,
    location: "Mystic Lands District",
    description: "A player-owned destination park organized around Aetherheart Commons, five surrounding themed districts, a ceremonial entrance, and a service-road annex.",
    status: "Active",
    statusColor: "#4ACA6A",
    capacity: "1200 guests",
    condition: "Excellent",
    notes: "Facility revenue is assigned to the owner's Personal Fund ledger. The DM adjusts deposited income manually.",
    revenue: String(MYSTIC_BASE_STATS.revenue),
    expenses: String(MYSTIC_BASE_STATS.expenses),
    employeesOnSite: String(MYSTIC_BASE_STATS.staff),
    ownerPlayerId: "",
    presetId: "mystic-lands-park-v1",
    baseStats: { ...MYSTIC_BASE_STATS },
    revenueDestination: "owner-personal-fund" as const,
    businessMap: createMysticLandsParkMap(),
  };
}

export function isMysticLandsPark(candidate: unknown) {
  if (!candidate || typeof candidate !== "object") return false;
  const source = candidate as { id?: unknown; name?: unknown; presetId?: unknown };
  return source.id === "facility-mystic-lands-park" || source.presetId === "mystic-lands-park-v1" || source.name === "Mystic Lands Park";
}
