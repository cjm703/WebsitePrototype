import {
  BUSINESS_MAP_LAYER_DEFAULTS,
  createDefaultBusinessSlot,
  normalizeFacilityAdditions,
  normalizeOfficeBusinessMap,
  type BusinessMapShape,
  type FacilityAdditionCategory,
  type BusinessSlotCategory,
  type FacilityAddition,
  type FacilitySlotRole,
  type FacilitySlotTier,
  type FacilityStatKey,
  type FacilityStatModifierKey,
  type FacilityStatModifier,
  type OfficeBusinessMapState,
} from "./business-map-model";

export type FacilityStats = Record<FacilityStatKey, number>;

export interface FacilityMonthlyReport {
  id: string;
  monthNumber: number;
  label: string;
  baseRevenue: number;
  appeal: number;
  appealMultiplier: number;
  condition: number;
  conditionMultiplier: number;
  adjustedRevenue: number;
  monthlyUpkeep: number;
  staffRequired: number;
  staffProvided: number;
  autoHiredStaff: number;
  staffPresent: number;
  staffCostPerPerson: number;
  staffPayroll: number;
  totalMonthlyCosts: number;
  eventAdjustment: number;
  manualAdjustment: number;
  netIncome: number;
  fundTransfer: number;
  unpaidCosts: number;
  ownerPlayerId: string;
  note: string;
  advancedAt: string;
  advancedBy: string;
}

export interface FacilityEconomySnapshot {
  stats: FacilityStats;
  appealMultiplier: number;
  conditionMultiplier: number;
  adjustedRevenue: number;
  autoHiredStaff: number;
  staffPresent: number;
  staffPayroll: number;
  totalMonthlyCosts: number;
  eventAdjustment: number;
  manualAdjustment: number;
  netIncome: number;
}

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
  staffCostPerPerson: number;
  currentMonth: number;
  monthlyReports: FacilityMonthlyReport[];
  revenueDestination: "owner-personal-fund";
}

export const FACILITY_STAT_KEYS: FacilityStatKey[] = [
  "capacity",
  "appeal",
  "revenue",
  "monthlyUpkeep",
  "security",
  "staffRequired",
  "staffProvided",
  "condition",
];

export const FACILITY_ADDITION_STAT_KEYS: FacilityStatModifierKey[] = [
  "capacity",
  "appeal",
  "revenue",
  "security",
  "condition",
];

export const FACILITY_STAT_META: Record<FacilityStatKey, { label: string; unit: string; higherIsBetter: boolean }> = {
  capacity: { label: "Guest Capacity", unit: "", higherIsBetter: true },
  appeal: { label: "Appeal", unit: "", higherIsBetter: true },
  revenue: { label: "Revenue / Month", unit: " CR", higherIsBetter: true },
  monthlyUpkeep: { label: "Monthly Upkeep", unit: " CR", higherIsBetter: false },
  security: { label: "Security", unit: "", higherIsBetter: true },
  staffRequired: { label: "Staff Required", unit: "", higherIsBetter: false },
  staffProvided: { label: "Staff Provided", unit: "", higherIsBetter: true },
  condition: { label: "Condition", unit: "", higherIsBetter: true },
};

export const DEFAULT_FACILITY_STATS: FacilityStats = {
  capacity: 0,
  appeal: 0,
  revenue: 0,
  monthlyUpkeep: 0,
  security: 0,
  staffRequired: 0,
  staffProvided: 0,
  condition: 100,
};

export const DEFAULT_STAFF_COST_PER_PERSON = 50;

export const MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v14";
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
export const THIRTEENTH_MYSTIC_LANDS_PARK_PRESET_ID = "mystic-lands-park-v13";

const MYSTIC_BASE_STATS: FacilityStats = {
  capacity: 1200,
  appeal: 35,
  revenue: 7200,
  monthlyUpkeep: 3200,
  security: 45,
  staffRequired: 38,
  staffProvided: 38,
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
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const legacyStaff = finite(source.staff, fallback.staffRequired);
  const normalized: FacilityStats = {
    capacity: Math.max(0, Math.round(finite(source.capacity, fallback.capacity))),
    appeal: Math.max(0, Math.min(100, Math.round(finite(source.appeal, fallback.appeal)))),
    revenue: Math.max(0, Math.round(finite(source.revenue, fallback.revenue))),
    monthlyUpkeep: Math.max(0, Math.round(finite(source.monthlyUpkeep, finite(source.expenses, fallback.monthlyUpkeep)))),
    security: Math.max(0, Math.min(100, Math.round(finite(source.security, fallback.security)))),
    staffRequired: Math.max(0, Math.round(finite(source.staffRequired, legacyStaff))),
    staffProvided: Math.max(0, Math.round(finite(source.staffProvided, legacyStaff))),
    condition: Math.max(0, Math.min(100, Math.round(finite(source.condition, fallback.condition)))),
  };
  return normalized;
}

export function normalizeFacilityMonthlyReports(raw: unknown): FacilityMonthlyReport[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-120).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const source = candidate as Partial<FacilityMonthlyReport>;
    const monthNumber = Math.max(1, Math.floor(finite(source.monthNumber, index + 1)));
    const staffRequired = Math.max(0, Math.round(finite(source.staffRequired, 0)));
    const staffProvided = Math.max(0, Math.round(finite(source.staffProvided, staffRequired)));
    const autoHiredStaff = Math.max(0, Math.round(finite(source.autoHiredStaff, staffRequired - staffProvided)));
    const staffPresent = Math.max(staffProvided + autoHiredStaff, Math.round(finite(source.staffPresent, staffRequired)));
    const staffCostPerPerson = Math.max(0, Math.round(finite(source.staffCostPerPerson, DEFAULT_STAFF_COST_PER_PERSON)));
    const staffPayroll = Math.max(0, Math.round(finite(source.staffPayroll, staffPresent * staffCostPerPerson)));
    const monthlyUpkeep = Math.max(0, Math.round(finite(source.monthlyUpkeep, 0)));
    const adjustedRevenue = Math.max(0, Math.round(finite(source.adjustedRevenue, source.baseRevenue)));
    const totalMonthlyCosts = Math.max(0, Math.round(finite(source.totalMonthlyCosts, monthlyUpkeep + staffPayroll)));
    const eventAdjustment = Math.round(finite(source.eventAdjustment, 0));
    const manualAdjustment = Math.round(finite(source.manualAdjustment, 0));
    return [{
      id: text(source.id, `facility-month-${monthNumber}-${index + 1}`, 120),
      monthNumber,
      label: text(source.label, `Month ${monthNumber}`, 80),
      baseRevenue: Math.max(0, Math.round(finite(source.baseRevenue, adjustedRevenue))),
      appeal: Math.max(0, Math.min(100, Math.round(finite(source.appeal, 0)))),
      appealMultiplier: Math.max(0, finite(source.appealMultiplier, 1)),
      condition: Math.max(0, Math.min(100, Math.round(finite(source.condition, 100)))),
      conditionMultiplier: Math.max(0, finite(source.conditionMultiplier, 1)),
      adjustedRevenue,
      monthlyUpkeep,
      staffRequired,
      staffProvided,
      autoHiredStaff,
      staffPresent,
      staffCostPerPerson,
      staffPayroll,
      totalMonthlyCosts,
      eventAdjustment,
      manualAdjustment,
      netIncome: Math.round(finite(source.netIncome, adjustedRevenue - totalMonthlyCosts + eventAdjustment + manualAdjustment)),
      fundTransfer: Math.round(finite(source.fundTransfer, 0)),
      unpaidCosts: Math.max(0, Math.round(finite(source.unpaidCosts, 0))),
      ownerPlayerId: text(source.ownerPlayerId, "", 100).trim(),
      note: text(source.note, "", 500),
      advancedAt: text(source.advancedAt, "", 80),
      advancedBy: text(source.advancedBy, "", 100),
    }];
  });
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
  const monthlyReports = normalizeFacilityMonthlyReports(source.monthlyReports);
  const nextReportMonth = monthlyReports.reduce((next, report) => Math.max(next, report.monthNumber + 1), 1);
  return {
    ownerPlayerId: text(source.ownerPlayerId, "", 100).trim(),
    presetId: text(source.presetId, "", 100).trim(),
    baseStats: normalizeFacilityStats(source.baseStats),
    staffCostPerPerson: Math.max(0, Math.round(finite(source.staffCostPerPerson, DEFAULT_STAFF_COST_PER_PERSON))),
    currentMonth: Math.max(nextReportMonth, Math.floor(finite(source.currentMonth, nextReportMonth))),
    monthlyReports,
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
  const totals = installedFacilityAdditionIds(map).reduce((stats, additionId) => {
    const addition = byId.get(additionId);
    if (!addition) return stats;
    const next = addFacilityStatModifiers(stats, addition.statModifiers);
    next.monthlyUpkeep += addition.monthlyUpkeep;
    next.staffRequired += addition.staffRequired;
    next.staffProvided += addition.staffProvided;
    return next;
  }, { ...baseStats });
  return normalizeFacilityStats(totals, baseStats);
}

export function facilityStatDelta(addition: FacilityAddition | null | undefined) {
  const delta = addFacilityStatModifiers(emptyFacilityStats(), addition?.statModifiers || []);
  if (addition) {
    delta.monthlyUpkeep = addition.monthlyUpkeep;
    delta.staffRequired = addition.staffRequired;
    delta.staffProvided = addition.staffProvided;
  }
  return delta;
}

export function facilityAppealMultiplier(appeal: number) {
  if (appeal < 20) return 0.65;
  if (appeal < 40) return 0.85;
  if (appeal < 60) return 1;
  if (appeal < 80) return 1.15;
  return 1.3;
}

export function facilityConditionMultiplier(condition: number) {
  if (condition < 20) return 0;
  if (condition < 40) return 0.5;
  if (condition < 60) return 0.8;
  if (condition < 80) return 0.95;
  return 1;
}

export function facilitySecurityRisk(security: number) {
  const value = Math.max(0, Math.min(100, Math.round(security)));
  if (value < 20) return { label: "Critical", chance: 50, color: "#F06773" };
  if (value < 40) return { label: "High Risk", chance: 35, color: "#E99856" };
  if (value < 60) return { label: "Exposed", chance: 20, color: "#D5B85A" };
  if (value < 80) return { label: "Guarded", chance: 10, color: "#69B6D8" };
  return { label: "Secure", chance: 5, color: "#62D6A6" };
}

export function calculateFacilityEconomy(stats: FacilityStats, staffCostPerPerson: number, eventAdjustment = 0, manualAdjustment = 0): FacilityEconomySnapshot {
  const appealMultiplier = facilityAppealMultiplier(stats.appeal);
  const conditionMultiplier = facilityConditionMultiplier(stats.condition);
  const adjustedRevenue = Math.max(0, Math.round(stats.revenue * appealMultiplier * conditionMultiplier));
  const autoHiredStaff = Math.max(0, stats.staffRequired - stats.staffProvided);
  const staffPresent = stats.staffProvided + autoHiredStaff;
  const staffPayroll = Math.max(0, Math.round(staffPresent * Math.max(0, staffCostPerPerson)));
  const totalMonthlyCosts = stats.monthlyUpkeep + staffPayroll;
  return {
    stats,
    appealMultiplier,
    conditionMultiplier,
    adjustedRevenue,
    autoHiredStaff,
    staffPresent,
    staffPayroll,
    totalMonthlyCosts,
    eventAdjustment: Math.round(eventAdjustment),
    manualAdjustment: Math.round(manualAdjustment),
    netIncome: adjustedRevenue - totalMonthlyCosts + Math.round(eventAdjustment) + Math.round(manualAdjustment),
  };
}

type ParkSlotSeed = {
  id: string;
  name: string;
  role: FacilitySlotRole;
  tier?: FacilitySlotTier;
  tags?: string[];
  acceptedAdditionCategories?: FacilityAdditionCategory[];
  notes?: string;
};

const PARK_SLOT_POSITIONS = [
  { x: 1, y: 1 }, { x: 9, y: 1 }, { x: 17, y: 1 },
  { x: 1, y: 6 }, { x: 9, y: 6 }, { x: 17, y: 6 },
  { x: 1, y: 11 }, { x: 9, y: 11 }, { x: 17, y: 11 },
  { x: 1, y: 16 },
];

function businessCategoryForParkRole(role: FacilitySlotRole): BusinessSlotCategory {
  if (role === "Reception") return "Office";
  if (role === "Flexible") return "Unassigned";
  return "Commercial";
}

function additionCategoriesForParkRole(role: FacilitySlotRole): FacilityAdditionCategory[] {
  if (role === "Minor Ride") return ["Minor Ride"];
  if (role === "Minor Attraction") return ["Minor Attraction", "Recreation"];
  if (role === "Shop") return ["Shop", "Dining"];
  if (role === "Reception") return ["Guest Service"];
  if (role === "Flexible") return ["Minor Ride", "Minor Attraction", "Shop", "Dining", "Guest Service", "Security", "Recreation", "Operations", "Flexible"];
  return [];
}

function parkSlots(seeds: ParkSlotSeed[]) {
  return seeds.map((seed, index) => {
    const position = PARK_SLOT_POSITIONS[index] || PARK_SLOT_POSITIONS[PARK_SLOT_POSITIONS.length - 1];
    const tier = seed.tier || "minor";
    const slot = createDefaultBusinessSlot(seed.id, seed.name, businessCategoryForParkRole(seed.role), position.x, position.y);
    return {
      ...slot,
      role: seed.role,
      tier,
      width: 7,
      height: 4,
      acceptedCategories: [],
      acceptedAdditionCategories: seed.acceptedAdditionCategories || additionCategoriesForParkRole(seed.role),
      acceptedTags: seed.tags || [],
      filled: tier === "major",
      occupant: tier === "major" ? seed.name : "",
      notes: seed.notes || "",
    };
  });
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
      sector({
        id: "mystic-entrance", name: "Enchanted Gardens", description: "The park entrance beneath cherry-blossom trees, with family rides, a kiddie coaster, and a boat journey through the gardens into indoor show scenes.", color: "#F08FB5", zoneType: "Entrance & Family", decorationTheme: "enchanted-gardens", visualShape: "organic", x: 13, y: 19, width: 6, height: 4,
        slots: parkSlots([
          { id: "entrance-river-journey", name: "Blossom River Journey", role: "Ride", tier: "major", tags: ["family", "boat", "show"] },
          { id: "entrance-kiddie-coaster", name: "Petal Dash Kiddie Coaster", role: "Ride", tier: "major", tags: ["family", "kiddie-coaster"] },
          { id: "entrance-minor-ride-1", name: "Minor Ride Slot 1", role: "Minor Ride", tags: ["family", "outdoor"] },
          { id: "entrance-minor-attraction-1", name: "Minor Attraction Slot 1", role: "Minor Attraction", tags: ["garden", "family"] },
          { id: "entrance-minor-attraction-2", name: "Minor Attraction Slot 2", role: "Minor Attraction", tags: ["garden", "family"] },
          { id: "entrance-shop-1", name: "Shop Slot 1", role: "Shop", tags: ["entrance", "retail"] },
          { id: "entrance-shop-2", name: "Shop Slot 2", role: "Shop", tags: ["entrance", "food"] },
          { id: "entrance-reception", name: "Reception Slot", role: "Reception", tags: ["entrance", "guest-service"] },
          { id: "entrance-flexible", name: "Flexible Addition Slot", role: "Flexible", tags: ["entrance", "family"] },
        ]),
      }),
      sector({
        id: "mystic-center", name: "Magic Mountain", description: "A giant snow-capped hollow mountain containing an indoor story coaster about tracking the original fairy, becoming lost in a magical forest, and finding the way home.", color: "#8FBDE8", zoneType: "Landmark & Indoor Coaster", decorationTheme: "magic-mountain", visualShape: "ellipse", x: 11, y: 9, width: 10, height: 10,
        slots: parkSlots([
          { id: "center-landmark", name: "Original Fairy Expedition", role: "Ride", tier: "major", tags: ["indoor", "story", "thrill"] },
          { id: "center-minor-ride-1", name: "Minor Ride Slot 1", role: "Minor Ride", tags: ["mountain", "indoor"] },
          { id: "center-minor-ride-2", name: "Minor Ride Slot 2", role: "Minor Ride", tags: ["mountain", "family"] },
          { id: "center-minor-attraction-1", name: "Minor Attraction Slot 1", role: "Minor Attraction", tags: ["story", "indoor"] },
          { id: "center-minor-attraction-2", name: "Minor Attraction Slot 2", role: "Minor Attraction", tags: ["mountain", "view"] },
          { id: "center-minor-attraction-3", name: "Minor Attraction Slot 3", role: "Minor Attraction", tags: ["fairy", "archive"] },
          { id: "center-shop-1", name: "Shop Slot 1", role: "Shop", tags: ["mountain", "food"] },
          { id: "center-shop-2", name: "Shop Slot 2", role: "Shop", tags: ["mountain", "retail"] },
          { id: "center-shop-3", name: "Shop Slot 3", role: "Shop", tags: ["fairy", "retail"] },
          { id: "center-flexible", name: "Flexible Addition Slot", role: "Flexible", tags: ["mountain", "operations"] },
        ]),
      }),
      sector({
        id: "mystic-northwest", name: "World Tree", description: "A natural land with serious undertones, dominated by a colossal tree and a 110-foot wooden coaster twisting through airtime hills around the trunk before ending inside it.", color: "#6EAD72", zoneType: "Nature & Wooden Coaster", decorationTheme: "world-tree", visualShape: "organic", x: 5, y: 6, width: 6, height: 7,
        slots: parkSlots([
          { id: "whisperwood-attraction", name: "World Tree Coaster", role: "Ride", tier: "major", tags: ["wooden-coaster", "family-thrill", "nature"] },
          { id: "world-tree-minor-ride-1", name: "Minor Ride Slot 1", role: "Minor Ride", tags: ["nature", "family"] },
          { id: "world-tree-minor-attraction-1", name: "Minor Attraction Slot 1", role: "Minor Attraction", tags: ["tree", "view"] },
          { id: "world-tree-minor-attraction-2", name: "Minor Attraction Slot 2", role: "Minor Attraction", tags: ["roots", "walkthrough"] },
          { id: "world-tree-minor-attraction-3", name: "Minor Attraction Slot 3", role: "Minor Attraction", tags: ["nature", "trail"] },
          { id: "world-tree-shop-1", name: "Shop Slot 1", role: "Shop", tags: ["nature", "retail"] },
          { id: "world-tree-shop-2", name: "Shop Slot 2", role: "Shop", tags: ["nature", "food"] },
          { id: "world-tree-flexible", name: "Flexible Addition Slot", role: "Flexible", tags: ["nature", "grove"] },
        ]),
      }),
      sector({
        id: "mystic-northeast", name: "Stormlands", description: "A rugged land of jagged cliffs, narrow-feeling paths, fog machines, and misters, anchored by a multi-launch coaster with inversions and a drop track.", color: "#7889A2", zoneType: "Cliffs & Launch Coaster", decorationTheme: "stormlands", visualShape: "organic", x: 11, y: 5, width: 10, height: 4,
        slots: parkSlots([
          { id: "dragonspire-anchor", name: "Tempest Launch Coaster", role: "Ride", tier: "major", tags: ["launch-coaster", "thrill", "inversions"] },
          { id: "stormlands-minor-ride-1", name: "Minor Ride Slot 1", role: "Minor Ride", tags: ["thrill", "storm"] },
          { id: "stormlands-minor-attraction-1", name: "Minor Attraction Slot 1", role: "Minor Attraction", tags: ["fog", "cliff"] },
          { id: "stormlands-minor-attraction-2", name: "Minor Attraction Slot 2", role: "Minor Attraction", tags: ["storm", "indoor"] },
          { id: "stormlands-shop-1", name: "Shop Slot 1", role: "Shop", tags: ["storm", "supplies"] },
          { id: "stormlands-flexible", name: "Flexible Addition Slot", role: "Flexible", tags: ["storm", "operations"] },
        ]),
      }),
      sector({
        id: "mystic-east", name: "Mushroom Forest", description: "An eerie forest defined by dimly glowing giant mushrooms and a steel hypercoaster over 200 feet tall, focused on airtime and sweeping hills.", color: "#9A79D2", zoneType: "Bioluminescent Forest", decorationTheme: "mushroom-forest", visualShape: "organic", x: 21, y: 6, width: 6, height: 7,
        slots: parkSlots([
          { id: "carnival-games", name: "Giant Mushroom Hypercoaster", role: "Ride", tier: "major", tags: ["hypercoaster", "thrill", "airtime"] },
          { id: "mushroom-minor-ride-1", name: "Minor Ride Slot 1", role: "Minor Ride", tags: ["mushroom", "family"] },
          { id: "mushroom-minor-attraction-1", name: "Minor Attraction Slot 1", role: "Minor Attraction", tags: ["glowing", "trail"] },
          { id: "mushroom-minor-attraction-2", name: "Minor Attraction Slot 2", role: "Minor Attraction", tags: ["mushroom", "games"] },
          { id: "mushroom-shop-1", name: "Shop Slot 1", role: "Shop", tags: ["mushroom", "retail"] },
          { id: "mushroom-shop-2", name: "Shop Slot 2", role: "Shop", tags: ["mushroom", "food"] },
          { id: "mushroom-flexible", name: "Flexible Addition Slot", role: "Flexible", tags: ["mushroom", "services"] },
        ]),
      }),
      sector({
        id: "mystic-southeast", name: "Whispering Woods", description: "A dim, foggy forest of towering trees where a two-mile wooden coaster is under construction, planned around three lift hills rising to 150, 170, and 200 feet.", color: "#4F806A", zoneType: "Forest & Construction", decorationTheme: "whispering-woods", visualShape: "organic", x: 21, y: 13, width: 6, height: 7,
        slots: parkSlots([
          { id: "starlight-theater", name: "Whispering Woods Coaster", role: "Ride", tier: "major", tags: ["wooden-coaster", "construction", "thrill"] },
          { id: "whispering-minor-attraction-1", name: "Minor Attraction Slot 1", role: "Minor Attraction", tags: ["woods", "trail"] },
          { id: "whispering-minor-attraction-2", name: "Minor Attraction Slot 2", role: "Minor Attraction", tags: ["coaster", "view"] },
          { id: "whispering-shop-1", name: "Shop Slot 1", role: "Shop", tags: ["woods", "retail"] },
          { id: "whispering-flexible", name: "Flexible Addition Slot", role: "Flexible", tags: ["woods", "operations"] },
        ]),
      }),
      sector({
        id: "mystic-southwest", name: "Dream Land", description: "A whimsical land of colorful trees, bright bushes, tiny singing animatronics, playful shops, and a family steel coaster, entered to the left of Enchanted Gardens.", color: "#E28FD0", zoneType: "Whimsical Family", decorationTheme: "dream-land", visualShape: "organic", x: 5, y: 13, width: 6, height: 7,
        slots: parkSlots([
          { id: "runebrook-family", name: "Dream Land Family Coaster", role: "Ride", tier: "major", tags: ["family-coaster", "whimsical"] },
          { id: "dream-pizzeria", name: "Dream Land Pizzeria", role: "Major Attraction", tier: "major", tags: ["pizzeria", "dining", "landmark"] },
          { id: "dream-minor-attraction-1", name: "Minor Attraction Slot 1", role: "Minor Attraction", tags: ["animatronic", "music"] },
          { id: "dream-minor-attraction-2", name: "Minor Attraction Slot 2", role: "Minor Attraction", tags: ["whimsical", "garden"] },
          { id: "dream-minor-attraction-3", name: "Minor Attraction Slot 3", role: "Minor Attraction", tags: ["family", "play"] },
          { id: "dream-shop-1", name: "Shop Slot 1", role: "Shop", tags: ["whimsical", "retail"] },
          { id: "dream-shop-2", name: "Shop Slot 2", role: "Shop", tags: ["toy", "retail"] },
          { id: "dream-shop-3", name: "Shop Slot 3", role: "Shop", tags: ["sweets", "food"] },
          { id: "dream-flexible", name: "Flexible Addition Slot", role: "Flexible", tags: ["family", "services"] },
        ]),
      }),
      sector({ id: "mystic-annex", name: "World Tree Service Access", description: "A compact backstage service access attached to World Tree. It supports supplies and security without counting as a public themed zone.", color: "#55745D", zoneType: "Backstage Service", visualShape: "organic", x: 4, y: 6, width: 1, height: 1, slots: parkSlots([{ id: "annex-storage", name: "Service Addition Slot", role: "Flexible", tags: ["storage", "supplies"] }, { id: "annex-security", name: "Security Addition Slot", role: "Flexible", acceptedAdditionCategories: ["Security"], tags: ["security", "service"] }]) }),
      sector({ id: "mystic-expansion-west", name: "Future Parkland West", description: "The western half of the reserved northern park expansion, awaiting a future themed land.", color: "#766AA8", zoneType: "Future Expansion", x: 11, y: 0, width: 4, height: 4, state: "locked", unlockExpansionId: expansionId, slots: parkSlots([{ id: "celestial-anchor", name: "Future Attraction Slot", role: "Flexible", tags: ["attraction", "expansion"] }, { id: "celestial-support", name: "Future Support Slot", role: "Flexible", tags: ["utility", "expansion"] }]) }),
      sector({ id: "mystic-expansion-east", name: "Future Parkland East", description: "The eastern half of the reserved northern park expansion, awaiting a future themed land.", color: "#8175B6", zoneType: "Future Expansion", x: 17, y: 0, width: 4, height: 4, state: "locked", unlockExpansionId: expansionId, slots: parkSlots([{ id: "astral-anchor", name: "Future Attraction Slot", role: "Flexible", tags: ["attraction", "expansion"] }, { id: "astral-support", name: "Future Support Slot", role: "Flexible", tags: ["operations", "expansion"] }]) }),
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
    notes: "The DM advances this facility's accounting month manually. Confirmed net income is recorded in the monthly ledger and applied to the owner's Credits account.",
    revenue: String(MYSTIC_BASE_STATS.revenue),
    expenses: String(MYSTIC_BASE_STATS.monthlyUpkeep),
    employeesOnSite: String(MYSTIC_BASE_STATS.staffProvided),
    ownerPlayerId: "",
    presetId: MYSTIC_LANDS_PARK_PRESET_ID,
    baseStats: { ...MYSTIC_BASE_STATS },
    staffCostPerPerson: DEFAULT_STAFF_COST_PER_PERSON,
    currentMonth: 1,
    monthlyReports: [] as FacilityMonthlyReport[],
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
    || source.presetId === THIRTEENTH_MYSTIC_LANDS_PARK_PRESET_ID
    || source.name === "Mystic Lands Park";
}
