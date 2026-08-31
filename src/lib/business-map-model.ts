export const DEFAULT_BUSINESS_MAP_GRID_WIDTH = 12;
export const DEFAULT_BUSINESS_MAP_GRID_HEIGHT = 8;
export const MIN_BUSINESS_MAP_GRID_WIDTH = 8;
export const MIN_BUSINESS_MAP_GRID_HEIGHT = 6;
export const MAX_BUSINESS_MAP_GRID_WIDTH = 32;
export const MAX_BUSINESS_MAP_GRID_HEIGHT = 24;

export const BUSINESS_SLOT_CATEGORIES = [
  "Unassigned",
  "Office",
  "Operations",
  "Industrial",
  "Commercial",
  "Research",
  "Security",
  "Storage",
  "Utility",
] as const;

export type BusinessSlotCategory = typeof BUSINESS_SLOT_CATEGORIES[number];
export type BusinessMapShapeKind = "wall" | "pathway" | "area" | "label";
export type BusinessMapBackgroundFit = "cover" | "contain" | "stretch";
export type FacilityStatKey = "capacity" | "appeal" | "revenue" | "expenses" | "security" | "maintenance" | "staff" | "condition";
export type BusinessSectorState = "active" | "locked";
export type BusinessSectorVisualShape = "rectangle" | "ellipse" | "organic";
export type BusinessExpansionStatus = "available" | "funded" | "complete";

export interface FacilityStatModifier {
  stat: FacilityStatKey;
  amount: number;
}

export interface BusinessMapAssetRef {
  kind: "supabase-storage";
  bucket: string;
  path: string;
  publicUrl: string;
  contentType: string;
  size: number;
  originalName: string;
  createdAt: string;
}

export interface BusinessMapGrid {
  width: number;
  height: number;
  showGrid: boolean;
  snapToGrid: boolean;
}

export interface BusinessMapBackground {
  mode: "solid" | "image";
  color: string;
  imageUrl: string;
  imageAsset?: BusinessMapAssetRef;
  opacity: number;
  fit: BusinessMapBackgroundFit;
}

export interface BusinessMapLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface BusinessMapPoint {
  x: number;
  y: number;
}

export interface BusinessMapShape {
  id: string;
  kind: BusinessMapShapeKind;
  layerId: string;
  name: string;
  points: BusinessMapPoint[];
  color: string;
  fillColor: string;
  opacity: number;
  strokeWidth: number;
  label: string;
  curved: boolean;
  visible: boolean;
  locked: boolean;
}

export interface OfficeBusinessSlot {
  id: string;
  name: string;
  category: BusinessSlotCategory;
  acceptedCategories: BusinessSlotCategory[];
  acceptedTags: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  filled: boolean;
  occupant: string;
  linkedFacilityId: string;
  installedAdditionId: string;
  installedBy: string;
  installedAt: string;
  notes: string;
}

export interface OfficeBusinessSector {
  id: string;
  name: string;
  description: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  background: BusinessMapBackground;
  layers: BusinessMapLayer[];
  shapes: BusinessMapShape[];
  slots: OfficeBusinessSlot[];
  state: BusinessSectorState;
  unlockExpansionId: string;
  zoneType: string;
  visualShape?: BusinessSectorVisualShape;
}

export interface OfficeBusinessExpansion {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cost: number;
  currency: string;
  status: BusinessExpansionStatus;
  unlockSectorIds: string[];
  fundedBy: string;
  fundedAt: string;
  completedBy: string;
  completedAt: string;
}

export interface BusinessMapPermissions {
  playerCanInstall: boolean;
  playerCanRemove: boolean;
  allowedPlayerIds: string[];
}

export interface OfficeBusinessMapState {
  version: 3;
  name: string;
  description: string;
  grid: BusinessMapGrid;
  background: BusinessMapBackground;
  layers: BusinessMapLayer[];
  shapes: BusinessMapShape[];
  permissions: BusinessMapPermissions;
  sectors: OfficeBusinessSector[];
  expansions: OfficeBusinessExpansion[];
}

export interface FacilityAddition {
  id: string;
  name: string;
  description: string;
  category: BusinessSlotCategory;
  tags: string[];
  quantity: number;
  width: number;
  height: number;
  thumbnailUrl: string;
  thumbnailAsset?: BusinessMapAssetRef;
  cost: number;
  monthlyUpkeep: number;
  ownerPlayerId: string;
  statModifiers: FacilityStatModifier[];
  createdAt: string;
  updatedAt: string;
}

export type BusinessMapRect = Pick<OfficeBusinessSector, "x" | "y" | "width" | "height">;

export const BUSINESS_MAP_LAYER_DEFAULTS: BusinessMapLayer[] = [
  { id: "areas", name: "Areas", visible: true, locked: false },
  { id: "pathways", name: "Pathways", visible: true, locked: false },
  { id: "walls", name: "Walls", visible: true, locked: false },
  { id: "slots", name: "Slots", visible: true, locked: false },
  { id: "labels", name: "Labels", visible: true, locked: false },
];

const SHAPE_LAYER_BY_KIND: Record<BusinessMapShapeKind, string> = {
  area: "areas",
  pathway: "pathways",
  wall: "walls",
  label: "labels",
};

const DEFAULT_BACKGROUND: BusinessMapBackground = {
  mode: "solid",
  color: "#030306",
  imageUrl: "",
  opacity: 1,
  fit: "cover",
};

const DEFAULT_PERMISSIONS: BusinessMapPermissions = {
  playerCanInstall: true,
  playerCanRemove: false,
  allowedPlayerIds: [],
};

const CATEGORY_COLORS: Record<BusinessSlotCategory, string> = {
  Unassigned: "#6B7280",
  Office: "#79B8FF",
  Operations: "#54C7A0",
  Industrial: "#D7A24A",
  Commercial: "#C084FC",
  Research: "#5CC8D7",
  Security: "#F47A91",
  Storage: "#9AA8C7",
  Utility: "#E18A5B",
};

export function businessSlotCategoryColor(category: BusinessSlotCategory) {
  return CATEGORY_COLORS[category];
}

export function createBusinessMapId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneLayers() {
  return BUSINESS_MAP_LAYER_DEFAULTS.map((layer) => ({ ...layer }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cleanText(value: unknown, fallback = "", max = 1000) {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function cleanId(value: unknown, fallback: string) {
  const normalized = cleanText(value, "", 100).trim();
  return normalized || fallback;
}

function cleanColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function cleanStringList(value: unknown, maxItems = 30) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => cleanText(entry, "", 60).trim()).filter(Boolean))).slice(0, maxItems);
}

function normalizeStatModifiers(value: unknown): FacilityStatModifier[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<FacilityStatKey>(["capacity", "appeal", "revenue", "expenses", "security", "maintenance", "staff", "condition"]);
  return value.slice(0, 24).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const source = candidate as Partial<FacilityStatModifier>;
    if (!allowed.has(source.stat as FacilityStatKey)) return [];
    return [{ stat: source.stat as FacilityStatKey, amount: clamp(finiteNumber(source.amount, 0), -1000000, 1000000) }];
  });
}

export function normalizeBusinessMapGrid(raw: unknown): BusinessMapGrid {
  const source = raw && typeof raw === "object" ? raw as Partial<BusinessMapGrid> : {};
  return {
    width: clamp(Math.round(finiteNumber(source.width, DEFAULT_BUSINESS_MAP_GRID_WIDTH)), MIN_BUSINESS_MAP_GRID_WIDTH, MAX_BUSINESS_MAP_GRID_WIDTH),
    height: clamp(Math.round(finiteNumber(source.height, DEFAULT_BUSINESS_MAP_GRID_HEIGHT)), MIN_BUSINESS_MAP_GRID_HEIGHT, MAX_BUSINESS_MAP_GRID_HEIGHT),
    showGrid: source.showGrid !== false,
    snapToGrid: source.snapToGrid !== false,
  };
}

export function normalizeBusinessMapBackground(raw: unknown): BusinessMapBackground {
  const source = raw && typeof raw === "object" ? raw as Partial<BusinessMapBackground> : {};
  const imageAsset = source.imageAsset && typeof source.imageAsset === "object"
    ? source.imageAsset as BusinessMapAssetRef
    : undefined;
  const imageUrl = cleanText(source.imageUrl, imageAsset?.publicUrl || "", 3000).trim();
  const fit = source.fit === "contain" || source.fit === "stretch" ? source.fit : "cover";
  return {
    mode: source.mode === "image" && imageUrl ? "image" : "solid",
    color: cleanColor(source.color, DEFAULT_BACKGROUND.color),
    imageUrl,
    imageAsset,
    opacity: clamp(finiteNumber(source.opacity, 1), 0.1, 1),
    fit,
  };
}

export function normalizeBusinessMapLayers(raw: unknown): BusinessMapLayer[] {
  const stored = Array.isArray(raw) ? raw : [];
  const byId = new Map<string, Partial<BusinessMapLayer>>();
  stored.forEach((candidate) => {
    if (!candidate || typeof candidate !== "object") return;
    const source = candidate as Partial<BusinessMapLayer>;
    if (typeof source.id === "string") byId.set(source.id, source);
  });
  const orderedIds = stored
    .map((candidate) => candidate && typeof candidate === "object" ? cleanText((candidate as Partial<BusinessMapLayer>).id).trim() : "")
    .filter((id) => BUSINESS_MAP_LAYER_DEFAULTS.some((layer) => layer.id === id));
  const missingIds = BUSINESS_MAP_LAYER_DEFAULTS.map((layer) => layer.id).filter((id) => !orderedIds.includes(id));
  return [...orderedIds, ...missingIds].map((id) => {
    const fallback = BUSINESS_MAP_LAYER_DEFAULTS.find((layer) => layer.id === id)!;
    const source = byId.get(id) || {};
    return {
      id,
      name: cleanText(source.name, fallback.name, 40).trim() || fallback.name,
      visible: source.visible !== false,
      locked: Boolean(source.locked),
    };
  });
}

export function normalizeBusinessMapRect(raw: unknown, fallback: BusinessMapRect, grid: BusinessMapGrid): BusinessMapRect {
  const source = raw && typeof raw === "object" ? raw as Partial<BusinessMapRect> : {};
  const width = clamp(Math.round(finiteNumber(source.width, fallback.width)), 1, grid.width);
  const height = clamp(Math.round(finiteNumber(source.height, fallback.height)), 1, grid.height);
  return {
    width,
    height,
    x: clamp(Math.round(finiteNumber(source.x, fallback.x)), 0, grid.width - width),
    y: clamp(Math.round(finiteNumber(source.y, fallback.y)), 0, grid.height - height),
  };
}

function normalizePoint(raw: unknown, grid: BusinessMapGrid): BusinessMapPoint {
  const source = raw && typeof raw === "object" ? raw as Partial<BusinessMapPoint> : {};
  const precision = grid.snapToGrid ? 1 : 4;
  return {
    x: clamp(Math.round(finiteNumber(source.x, 0) * precision) / precision, 0, grid.width),
    y: clamp(Math.round(finiteNumber(source.y, 0) * precision) / precision, 0, grid.height),
  };
}

export function normalizeBusinessMapShape(raw: unknown, index: number, grid: BusinessMapGrid): BusinessMapShape | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<BusinessMapShape>;
  const kind: BusinessMapShapeKind = source.kind === "pathway" || source.kind === "area" || source.kind === "label" ? source.kind : "wall";
  const points = Array.isArray(source.points) ? source.points.slice(0, 80).map((point) => normalizePoint(point, grid)) : [];
  const minimumPoints = kind === "label" ? 1 : kind === "area" ? 3 : 2;
  if (points.length < minimumPoints) return null;
  return {
    id: cleanId(source.id, `shape-${index + 1}`),
    kind,
    layerId: cleanId(source.layerId, SHAPE_LAYER_BY_KIND[kind]),
    name: cleanText(source.name, `${kind[0].toUpperCase()}${kind.slice(1)} ${index + 1}`, 60).trim() || `${kind} ${index + 1}`,
    points,
    color: cleanColor(source.color, kind === "wall" ? "#E5ECFF" : kind === "pathway" ? "#D7A24A" : "#79B8FF"),
    fillColor: cleanColor(source.fillColor, "#79B8FF"),
    opacity: clamp(finiteNumber(source.opacity, kind === "area" ? 0.25 : 0.9), 0.05, 1),
    strokeWidth: clamp(finiteNumber(source.strokeWidth, kind === "wall" ? 0.18 : 0.35), 0.08, 1.5),
    label: cleanText(source.label, kind === "label" ? "Label" : "", 100),
    curved: Boolean(source.curved),
    visible: source.visible !== false,
    locked: Boolean(source.locked),
  };
}

function defaultAcceptedCategories(category: BusinessSlotCategory) {
  return category === "Unassigned" ? [] : [category];
}

export function createDefaultBusinessSlot(
  id: string,
  name: string,
  category: BusinessSlotCategory,
  x: number,
  y: number,
): OfficeBusinessSlot {
  return {
    id,
    name,
    category,
    acceptedCategories: defaultAcceptedCategories(category),
    acceptedTags: [],
    x,
    y,
    width: 3,
    height: 2,
    filled: false,
    occupant: "",
    linkedFacilityId: "",
    installedAdditionId: "",
    installedBy: "",
    installedAt: "",
    notes: "",
  };
}

function normalizeSlot(raw: unknown, index: number, grid: BusinessMapGrid): OfficeBusinessSlot {
  const source = raw && typeof raw === "object" ? raw as Partial<OfficeBusinessSlot> : {};
  const category = BUSINESS_SLOT_CATEGORIES.includes(source.category as BusinessSlotCategory)
    ? source.category as BusinessSlotCategory
    : "Unassigned";
  const fallback = createDefaultBusinessSlot(`slot-${index + 1}`, `Business Slot ${index + 1}`, category, (index * 3) % Math.max(3, grid.width - 2), Math.floor(index / 3) * 2);
  const acceptedCategories = Array.isArray(source.acceptedCategories)
    ? source.acceptedCategories.filter((entry): entry is BusinessSlotCategory => BUSINESS_SLOT_CATEGORIES.includes(entry as BusinessSlotCategory))
    : defaultAcceptedCategories(category);
  const installedAdditionId = cleanText(source.installedAdditionId, "", 100).trim();
  return {
    ...fallback,
    ...normalizeBusinessMapRect(source, fallback, grid),
    id: cleanId(source.id, fallback.id),
    name: cleanText(source.name, fallback.name, 60).trim() || fallback.name,
    category,
    acceptedCategories: Array.from(new Set(acceptedCategories)),
    acceptedTags: cleanStringList(source.acceptedTags),
    filled: Boolean(source.filled || installedAdditionId),
    occupant: cleanText(source.occupant, "", 100),
    linkedFacilityId: cleanText(source.linkedFacilityId, "", 100),
    installedAdditionId,
    installedBy: cleanText(source.installedBy, "", 100),
    installedAt: cleanText(source.installedAt, "", 80),
    notes: cleanText(source.notes, "", 1200),
  };
}

function normalizeSector(raw: unknown, index: number, grid: BusinessMapGrid, fallback?: OfficeBusinessSector): OfficeBusinessSector {
  const source = raw && typeof raw === "object" ? raw as Partial<OfficeBusinessSector> : {};
  const base = fallback || {
    id: `sector-${index + 1}`,
    name: `Sector ${index + 1}`,
    description: "",
    color: "#79B8FF",
    x: 0,
    y: 0,
    width: 3,
    height: 3,
    background: { ...DEFAULT_BACKGROUND },
    layers: cloneLayers(),
    shapes: [],
    slots: [],
    state: "active" as BusinessSectorState,
    unlockExpansionId: "",
    zoneType: "General",
    visualShape: "rectangle" as BusinessSectorVisualShape,
  };
  return {
    ...normalizeBusinessMapRect(source, base, grid),
    id: cleanId(source.id, base.id),
    name: cleanText(source.name, base.name, 60).trim() || base.name,
    description: cleanText(source.description, "", 600),
    color: cleanColor(source.color, base.color),
    background: normalizeBusinessMapBackground(source.background),
    layers: normalizeBusinessMapLayers(source.layers),
    shapes: Array.isArray(source.shapes)
      ? source.shapes.slice(0, 300).map((shape, shapeIndex) => normalizeBusinessMapShape(shape, shapeIndex, grid)).filter((shape): shape is BusinessMapShape => Boolean(shape))
      : [],
    slots: Array.isArray(source.slots) ? source.slots.slice(0, 160).map((slot, slotIndex) => normalizeSlot(slot, slotIndex, grid)) : [],
    state: source.state === "locked" ? "locked" : "active",
    unlockExpansionId: cleanText(source.unlockExpansionId, "", 100).trim(),
    zoneType: cleanText(source.zoneType, "General", 60).trim() || "General",
    visualShape: source.visualShape === "ellipse" || source.visualShape === "organic" ? source.visualShape : "rectangle",
  };
}

function normalizeExpansion(raw: unknown, index: number, grid: BusinessMapGrid): OfficeBusinessExpansion {
  const source = raw && typeof raw === "object" ? raw as Partial<OfficeBusinessExpansion> : {};
  const rect = normalizeBusinessMapRect(source, { x: 0, y: 0, width: 4, height: 3 }, grid);
  const status: BusinessExpansionStatus = source.status === "funded" || source.status === "complete" ? source.status : "available";
  return {
    ...rect,
    id: cleanId(source.id, `expansion-${index + 1}`),
    name: cleanText(source.name, `Expansion ${index + 1}`, 80).trim() || `Expansion ${index + 1}`,
    description: cleanText(source.description, "", 900),
    cost: clamp(Math.floor(finiteNumber(source.cost, 0)), 0, 1000000000),
    currency: cleanText(source.currency, "CR", 12).trim() || "CR",
    status,
    unlockSectorIds: cleanStringList(source.unlockSectorIds, 20),
    fundedBy: cleanText(source.fundedBy, "", 100),
    fundedAt: cleanText(source.fundedAt, "", 80),
    completedBy: cleanText(source.completedBy, "", 100),
    completedAt: cleanText(source.completedAt, "", 80),
  };
}

export function createDefaultOfficeBusinessMap(): OfficeBusinessMapState {
  const grid = normalizeBusinessMapGrid(null);
  const sector = (raw: Omit<OfficeBusinessSector, "background" | "layers" | "shapes" | "state" | "unlockExpansionId" | "zoneType">): OfficeBusinessSector => ({
    ...raw,
    background: { ...DEFAULT_BACKGROUND },
    layers: cloneLayers(),
    shapes: [],
    state: "active",
    unlockExpansionId: "",
    zoneType: "General",
    visualShape: "rectangle",
  });
  return {
    version: 3,
    name: "Wasp Office Business Layout",
    description: "General company facility layout.",
    grid,
    background: { ...DEFAULT_BACKGROUND },
    layers: cloneLayers(),
    shapes: [],
    permissions: { ...DEFAULT_PERMISSIONS },
    expansions: [],
    sectors: [
      sector({ id: "sector-front", name: "Front Office", description: "Reception, intake, and public-facing business.", color: "#79B8FF", x: 0, y: 0, width: 4, height: 3, slots: [createDefaultBusinessSlot("slot-reception", "Reception Slot", "Office", 0, 0), createDefaultBusinessSlot("slot-client", "Client Service Slot", "Commercial", 4, 0)] }),
      sector({ id: "sector-operations", name: "Operations", description: "Planning, dispatch, and active business coordination.", color: "#54C7A0", x: 4, y: 0, width: 5, height: 4, slots: [createDefaultBusinessSlot("slot-command", "Command Slot", "Operations", 0, 0), createDefaultBusinessSlot("slot-team", "Team Slot", "Office", 4, 0)] }),
      sector({ id: "sector-industrial", name: "Industrial Wing", description: "Production, fabrication, and heavy business functions.", color: "#D7A24A", x: 9, y: 0, width: 3, height: 5, slots: [createDefaultBusinessSlot("slot-workshop", "Workshop Slot", "Industrial", 0, 0), createDefaultBusinessSlot("slot-utility", "Utility Slot", "Utility", 4, 0)] }),
      sector({ id: "sector-storage", name: "Storage", description: "Inventory, supplies, and secured holdings.", color: "#9AA8C7", x: 0, y: 3, width: 4, height: 3, slots: [createDefaultBusinessSlot("slot-stock", "Stock Slot", "Storage", 0, 0), createDefaultBusinessSlot("slot-secure", "Secure Slot", "Security", 4, 0)] }),
      sector({ id: "sector-open", name: "Open Floor", description: "Flexible space ready for new business functions.", color: "#C084FC", x: 4, y: 4, width: 5, height: 4, slots: [createDefaultBusinessSlot("slot-flex-a", "Flexible Slot A", "Unassigned", 0, 0), createDefaultBusinessSlot("slot-flex-b", "Flexible Slot B", "Unassigned", 4, 0)] }),
      sector({ id: "sector-support", name: "Support", description: "Utilities, staff support, and back-office services.", color: "#E18A5B", x: 9, y: 5, width: 3, height: 3, slots: [createDefaultBusinessSlot("slot-support", "Support Slot", "Utility", 0, 0), createDefaultBusinessSlot("slot-security", "Security Slot", "Security", 4, 0)] }),
    ],
  };
}

export function createFacilityBusinessMap(facilityName: string): OfficeBusinessMapState {
  const name = facilityName.trim() || "Facility";
  const map = createDefaultOfficeBusinessMap();
  return {
    ...map,
    name: `${name} Layout`,
    description: `Dedicated facility map for ${name}.`,
    sectors: [{
      id: createBusinessMapId("sector"),
      name: "Main Floor",
      description: `Primary interior layout for ${name}.`,
      color: "#79B8FF",
      x: 0,
      y: 0,
      width: map.grid.width,
      height: map.grid.height,
      background: { ...DEFAULT_BACKGROUND },
      layers: cloneLayers(),
      shapes: [],
      slots: [],
      state: "active",
      unlockExpansionId: "",
      zoneType: "General",
      visualShape: "rectangle",
    }],
  };
}

export function normalizeOfficeBusinessMap(raw: unknown): OfficeBusinessMapState {
  const fallback = createDefaultOfficeBusinessMap();
  if (!raw || typeof raw !== "object") return fallback;
  const source = raw as Partial<OfficeBusinessMapState> & { version?: number };
  const grid = normalizeBusinessMapGrid(source.grid);
  return {
    version: 3,
    name: cleanText(source.name, fallback.name, 100).trim() || fallback.name,
    description: cleanText(source.description, fallback.description, 1200),
    grid,
    background: normalizeBusinessMapBackground(source.background),
    layers: normalizeBusinessMapLayers(source.layers),
    shapes: Array.isArray(source.shapes)
      ? source.shapes.slice(0, 300).map((shape, index) => normalizeBusinessMapShape(shape, index, grid)).filter((shape): shape is BusinessMapShape => Boolean(shape))
      : [],
    permissions: {
      playerCanInstall: source.permissions?.playerCanInstall !== false,
      playerCanRemove: Boolean(source.permissions?.playerCanRemove),
      allowedPlayerIds: cleanStringList(source.permissions?.allowedPlayerIds, 100),
    },
    sectors: Array.isArray(source.sectors)
      ? source.sectors.slice(0, 60).map((sector, index) => normalizeSector(sector, index, grid, fallback.sectors[index % fallback.sectors.length]))
      : fallback.sectors,
    expansions: Array.isArray(source.expansions)
      ? source.expansions.slice(0, 20).map((expansion, index) => normalizeExpansion(expansion, index, grid))
      : [],
  };
}

export function resizeOfficeBusinessMapGrid(map: OfficeBusinessMapState, nextGrid: Partial<BusinessMapGrid>): OfficeBusinessMapState {
  const grid = normalizeBusinessMapGrid({ ...map.grid, ...nextGrid });
  return normalizeOfficeBusinessMap({ ...map, grid });
}

export function normalizeFacilityAdditions(raw: unknown): FacilityAddition[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 300).map((candidate, index) => {
    const source = candidate && typeof candidate === "object" ? candidate as Partial<FacilityAddition> : {};
    const category = BUSINESS_SLOT_CATEGORIES.includes(source.category as BusinessSlotCategory)
      ? source.category as BusinessSlotCategory
      : "Unassigned";
    const createdAt = cleanText(source.createdAt, new Date().toISOString(), 80);
    return {
      id: cleanId(source.id, `addition-${index + 1}`),
      name: cleanText(source.name, `Facility Addition ${index + 1}`, 80).trim() || `Facility Addition ${index + 1}`,
      description: cleanText(source.description, "", 1200),
      category,
      tags: cleanStringList(source.tags),
      quantity: clamp(Math.floor(finiteNumber(source.quantity, 1)), 0, 999),
      width: clamp(Math.floor(finiteNumber(source.width, 1)), 1, MAX_BUSINESS_MAP_GRID_WIDTH),
      height: clamp(Math.floor(finiteNumber(source.height, 1)), 1, MAX_BUSINESS_MAP_GRID_HEIGHT),
      thumbnailUrl: cleanText(source.thumbnailUrl, source.thumbnailAsset?.publicUrl || "", 3000),
      thumbnailAsset: source.thumbnailAsset && typeof source.thumbnailAsset === "object" ? source.thumbnailAsset as BusinessMapAssetRef : undefined,
      cost: clamp(Math.floor(finiteNumber(source.cost, 0)), 0, 1000000000),
      monthlyUpkeep: clamp(Math.floor(finiteNumber(source.monthlyUpkeep, 0)), 0, 1000000000),
      ownerPlayerId: cleanText(source.ownerPlayerId, "", 100).trim(),
      statModifiers: normalizeStatModifiers(source.statModifiers),
      createdAt,
      updatedAt: cleanText(source.updatedAt, createdAt, 80),
    };
  });
}

export function createFacilityAddition(index = 0): FacilityAddition {
  const now = new Date().toISOString();
  return {
    id: createBusinessMapId("addition"),
    name: `Facility Addition ${index + 1}`,
    description: "",
    category: "Unassigned",
    tags: [],
    quantity: 1,
    width: 1,
    height: 1,
    thumbnailUrl: "",
    cost: 0,
    monthlyUpkeep: 0,
    ownerPlayerId: "",
    statModifiers: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function isFacilityAdditionCompatible(slot: OfficeBusinessSlot, addition: FacilityAddition) {
  const categoryCompatible = slot.acceptedCategories.length === 0 || slot.acceptedCategories.includes(addition.category);
  const tagsCompatible = slot.acceptedTags.length === 0 || addition.tags.some((tag) => slot.acceptedTags.includes(tag));
  const footprintCompatible = addition.width <= slot.width && addition.height <= slot.height;
  return categoryCompatible && tagsCompatible && footprintCompatible;
}

export function countInstalledFacilityAdditions(maps: Array<OfficeBusinessMapState | null | undefined> | OfficeBusinessMapState | null | undefined) {
  const counts: Record<string, number> = {};
  const mapList = Array.isArray(maps) ? maps : maps ? [maps] : [];
  mapList.forEach((map) => map?.sectors.forEach((sector) => sector.slots.forEach((slot) => {
    if (!slot.installedAdditionId) return;
    counts[slot.installedAdditionId] = (counts[slot.installedAdditionId] || 0) + 1;
  })));
  return counts;
}

export function countInstalledFacilityAdditionSlots(maps: Array<OfficeBusinessMapState | null | undefined> | OfficeBusinessMapState | null | undefined) {
  return Object.values(countInstalledFacilityAdditions(maps)).reduce((total, count) => total + count, 0);
}

export function isBusinessSectorUnlocked(map: OfficeBusinessMapState, sector: OfficeBusinessSector) {
  if (sector.state !== "locked" || !sector.unlockExpansionId) return sector.state !== "locked";
  return map.expansions.some((expansion) => expansion.id === sector.unlockExpansionId && expansion.status === "complete");
}

export function canPlayerEditBusinessMap(map: OfficeBusinessMapState, playerId: string, action: "install" | "remove") {
  if (!playerId || playerId === "dm") return playerId === "dm";
  if (map.permissions.allowedPlayerIds.length > 0 && !map.permissions.allowedPlayerIds.includes(playerId)) return false;
  return action === "install" ? map.permissions.playerCanInstall : map.permissions.playerCanRemove;
}

export function installFacilityAddition(
  map: OfficeBusinessMapState,
  sectorId: string,
  slotId: string,
  addition: FacilityAddition,
  playerId: string,
): OfficeBusinessMapState {
  return {
    ...map,
    sectors: map.sectors.map((sector) => sector.id !== sectorId ? sector : {
      ...sector,
      slots: sector.slots.map((slot) => slot.id !== slotId ? slot : {
        ...slot,
        filled: true,
        occupant: addition.name,
        linkedFacilityId: "",
        installedAdditionId: addition.id,
        installedBy: playerId,
        installedAt: new Date().toISOString(),
      }),
    }),
  };
}

export function removeFacilityAddition(map: OfficeBusinessMapState, sectorId: string, slotId: string): OfficeBusinessMapState {
  return {
    ...map,
    sectors: map.sectors.map((sector) => sector.id !== sectorId ? sector : {
      ...sector,
      slots: sector.slots.map((slot) => slot.id !== slotId ? slot : {
        ...slot,
        filled: false,
        occupant: "",
        installedAdditionId: "",
        installedBy: "",
        installedAt: "",
      }),
    }),
  };
}

export function cloneOfficeBusinessMap(map: OfficeBusinessMapState) {
  return JSON.parse(JSON.stringify(map)) as OfficeBusinessMapState;
}

export function collectBusinessMapAssets(map: OfficeBusinessMapState) {
  const assets: BusinessMapAssetRef[] = [];
  if (map.background.imageAsset) assets.push(map.background.imageAsset);
  map.sectors.forEach((sector) => {
    if (sector.background.imageAsset) assets.push(sector.background.imageAsset);
  });
  return assets;
}
