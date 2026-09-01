import {
  MYSTIC_LANDS_PARK_PRESET_ID,
  createMysticLandsParkFacility,
  ensureMysticLandsAdditions,
  ensurePersonalFund,
  isMysticLandsPark,
  normalizeFacilityDepthFields,
  normalizeFacilityStats,
  normalizePersonalFunds,
  type FacilityDepthFields,
  type FacilityStats,
  type PersonalFund,
} from "./facility-depth-model";
import { normalizeOfficeBusinessMap, type FacilityAddition, type OfficeBusinessMapState } from "./business-map-model";

export interface FacilityRecord extends FacilityDepthFields {
  id: string;
  name: string;
  type: "Facility" | "Commercial" | "Utility";
  location?: string;
  description?: string;
  status?: string;
  statusColor?: string;
  capacity?: string;
  condition?: string;
  notes?: string;
  revenue?: string;
  expenses?: string;
  employeesOnSite?: string;
  businessMap?: OfficeBusinessMapState;
  [key: string]: unknown;
}

export interface FacilityOfficeState extends Record<string, unknown> {
  id: string;
  version: number;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  companyFunds: number;
  personalFunds: PersonalFund[];
  facilities: FacilityRecord[];
  facilityCats: Array<{ id: string; name: string; facilityIds: string[]; collapsed: boolean; [key: string]: unknown }>;
  facilityAdditions: FacilityAddition[];
}

function text(value: unknown, fallback = "", max = 1000) {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function number(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function inferredStats(source: Record<string, unknown>): FacilityStats {
  const numericText = (value: unknown) => number(String(value || "").replace(/[^0-9.-]/g, ""), 0);
  return normalizeFacilityStats(source.baseStats, {
    capacity: numericText(source.capacity),
    appeal: 0,
    revenue: numericText(source.revenue),
    expenses: numericText(source.expenses),
    security: 0,
    maintenance: 0,
    staff: numericText(source.employeesOnSite),
    condition: 100,
  });
}

export function normalizeFacilityRecord(raw: unknown, index = 0): FacilityRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = text(source.id, `facility-${index + 1}`, 100).trim() || `facility-${index + 1}`;
  const depth = normalizeFacilityDepthFields({ ...source, baseStats: inferredStats(source) });
  const type = source.type === "Commercial" || source.type === "Utility" ? source.type : "Facility";
  const businessMap = source.businessMap && typeof source.businessMap === "object" ? normalizeOfficeBusinessMap(source.businessMap) : undefined;
  const ownedMap = businessMap && depth.ownerPlayerId ? {
    ...businessMap,
    permissions: {
      ...businessMap.permissions,
      playerCanInstall: true,
      playerCanRemove: true,
      allowedPlayerIds: [depth.ownerPlayerId],
    },
  } : businessMap;
  return {
    ...source,
    id,
    name: text(source.name, `Facility ${index + 1}`, 80).trim() || `Facility ${index + 1}`,
    type,
    ...depth,
    businessMap: ownedMap,
  } as FacilityRecord;
}

function mergeMysticPark(existing: FacilityRecord | undefined): FacilityRecord {
  const preset = createMysticLandsParkFacility();
  if (!existing) return normalizeFacilityRecord(preset)!;
  const existingMap = existing.businessMap;
  const presetMap = preset.businessMap;

  // Preset geometry is authoritative only while upgrading an older park. Once
  // the current preset has been applied, the saved map is the editable source
  // of truth and must survive subsequent normalize/save/load passes unchanged.
  if (existing.presetId === MYSTIC_LANDS_PARK_PRESET_ID) {
    return normalizeFacilityRecord({
      ...preset,
      ...existing,
      presetId: MYSTIC_LANDS_PARK_PRESET_ID,
      baseStats: existing.baseStats || preset.baseStats,
      businessMap: existingMap || presetMap,
    })!;
  }

  const mergeById = <T extends { id: string }>(defaults: T[], current: T[]) => {
    const currentById = new Map(current.map((entry) => [entry.id, entry]));
    const defaultIds = new Set(defaults.map((entry) => entry.id));
    return [
      ...defaults.map((entry) => currentById.has(entry.id) ? { ...entry, ...currentById.get(entry.id)! } : entry),
      ...current.filter((entry) => !defaultIds.has(entry.id)),
    ];
  };
  const mergeParkSectors = () => {
    if (!existingMap) return presetMap.sectors;
    const currentById = new Map(existingMap.sectors.map((sector) => [sector.id, sector]));
    const presetIds = new Set(presetMap.sectors.map((sector) => sector.id));
    const isGeneratedMainFloor = (sector: (typeof existingMap.sectors)[number]) => sector.name.trim().toLowerCase() === "main floor"
      && sector.description.trim().toLowerCase().startsWith("primary interior layout for mystic lands park");
    return [
      ...presetMap.sectors.map((presetSector) => {
        const currentSector = currentById.get(presetSector.id);
        if (!currentSector) return presetSector;
        const slots = mergeById(presetSector.slots, currentSector.slots);
        return {
          ...presetSector,
          ...currentSector,
          x: presetSector.x,
          y: presetSector.y,
          width: presetSector.width,
          height: presetSector.height,
          unlockExpansionId: presetSector.unlockExpansionId,
          visualShape: presetSector.visualShape,
          slots,
        };
      }),
      ...existingMap.sectors.filter((sector) => !presetIds.has(sector.id) && !isGeneratedMainFloor(sector)),
    ];
  };
  const legacyParkShapeIds = new Set([
    "park-boundary",
    "path-entrance",
    "path-northwest",
    "path-north",
    "path-northeast",
    "path-east",
    "path-southeast",
    "path-southwest",
    "west-service-road",
    "alley-road",
    "alley-label",
    "park-label",
    "road-label",
  ]);
  presetMap.shapes.forEach((shape) => legacyParkShapeIds.add(shape.id));
  const mergeParkShapes = () => existingMap
    ? [...presetMap.shapes, ...existingMap.shapes.filter((shape) => !legacyParkShapeIds.has(shape.id))]
    : presetMap.shapes;
  const mergeParkExpansions = () => {
    if (!existingMap) return presetMap.expansions;
    const currentById = new Map(existingMap.expansions.map((expansion) => [expansion.id, expansion]));
    const presetIds = new Set(presetMap.expansions.map((expansion) => expansion.id));
    return [
      ...presetMap.expansions.map((presetExpansion) => {
        const currentExpansion = currentById.get(presetExpansion.id);
        return currentExpansion ? {
          ...presetExpansion,
          ...currentExpansion,
          x: presetExpansion.x,
          y: presetExpansion.y,
          width: presetExpansion.width,
          height: presetExpansion.height,
          unlockSectorIds: presetExpansion.unlockSectorIds,
        } : presetExpansion;
      }),
      ...existingMap.expansions.filter((expansion) => !presetIds.has(expansion.id)),
    ];
  };
  const mergedMap = existingMap ? {
    ...presetMap,
    ...existingMap,
    name: existingMap.name || presetMap.name,
    description: existingMap.description || presetMap.description,
    grid: {
      ...existingMap.grid,
      width: Math.max(existingMap.grid.width, presetMap.grid.width),
      height: Math.max(existingMap.grid.height, presetMap.grid.height),
    },
    layers: mergeById(presetMap.layers, existingMap.layers),
    shapes: mergeParkShapes(),
    sectors: mergeParkSectors(),
    expansions: mergeParkExpansions(),
  } : presetMap;
  return normalizeFacilityRecord({
    ...preset,
    ...existing,
    presetId: MYSTIC_LANDS_PARK_PRESET_ID,
    baseStats: existing.baseStats || preset.baseStats,
    businessMap: mergedMap,
  })!;
}

export function normalizeFacilityOfficeState(raw: unknown): FacilityOfficeState {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  let facilities = Array.isArray(source.facilities)
    ? source.facilities.map((facility, index) => normalizeFacilityRecord(facility, index)).filter((facility): facility is FacilityRecord => Boolean(facility))
    : [];
  const parkIndex = facilities.findIndex(isMysticLandsPark);
  if (parkIndex >= 0) facilities = facilities.map((facility, index) => index === parkIndex ? mergeMysticPark(facility) : facility);
  else facilities = [...facilities, mergeMysticPark(undefined)];

  let personalFunds = normalizePersonalFunds(source.personalFunds);
  facilities.forEach((facility) => {
    personalFunds = ensurePersonalFund(personalFunds, facility.ownerPlayerId);
  });

  const rawCategories = Array.isArray(source.facilityCats) ? source.facilityCats : [];
  const facilityCats = rawCategories.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const category = candidate as Record<string, unknown>;
    return [{
      ...category,
      id: text(category.id, `facility-category-${index + 1}`, 100),
      name: text(category.name, `Category ${index + 1}`, 80),
      facilityIds: Array.isArray(category.facilityIds) ? category.facilityIds.map(String).filter(Boolean) : [],
      collapsed: Boolean(category.collapsed),
    }];
  });
  const parkId = facilities.find(isMysticLandsPark)!.id;
  if (!facilityCats.some((category) => category.facilityIds.includes(parkId))) {
    const commercial = facilityCats.find((category) => category.name.toLowerCase().includes("commercial"));
    if (commercial) commercial.facilityIds = [...commercial.facilityIds, parkId];
    else facilityCats.push({ id: "facility-category-commercial-properties", name: "Commercial Properties", facilityIds: [parkId], collapsed: false });
  }

  return {
    ...source,
    id: text(source.id, "default", 100) || "default",
    version: Math.max(5, Math.floor(number(source.version, 5))),
    revision: Math.max(0, Math.floor(number(source.revision, 0))),
    updatedAt: text(source.updatedAt, "", 80),
    updatedBy: text(source.updatedBy, "", 100),
    companyFunds: Math.max(0, Math.round(number(source.companyFunds, 50000))),
    personalFunds,
    facilities,
    facilityCats,
    facilityAdditions: ensureMysticLandsAdditions(source.facilityAdditions),
  };
}

export function buildFacilityOfficeStateFallback(): FacilityOfficeState {
  return normalizeFacilityOfficeState({ id: "default", version: 5, revision: 0, facilities: [], facilityCats: [], facilityAdditions: [], personalFunds: [], companyFunds: 50000 });
}

export function replaceFacilityInOfficeState(state: FacilityOfficeState, facility: FacilityRecord): FacilityOfficeState {
  return { ...state, facilities: state.facilities.map((entry) => entry.id === facility.id ? facility : entry) };
}

function mergeRemoteFacilityActions(local: FacilityRecord, remote: FacilityRecord): FacilityRecord {
  if (!local.businessMap || !remote.businessMap) return local;
  const remoteSectors = new Map(remote.businessMap.sectors.map((sector) => [sector.id, sector]));
  const remoteExpansions = new Map(remote.businessMap.expansions.map((expansion) => [expansion.id, expansion]));
  return {
    ...local,
    businessMap: {
      ...local.businessMap,
      sectors: local.businessMap.sectors.map((sector) => {
        const remoteSector = remoteSectors.get(sector.id);
        if (!remoteSector) return sector;
        const remoteSlots = new Map(remoteSector.slots.map((slot) => [slot.id, slot]));
        return {
          ...sector,
          state: remoteSector.state,
          slots: sector.slots.map((slot) => {
            const remoteSlot = remoteSlots.get(slot.id);
            if (!remoteSlot || remoteSlot.installedAdditionId === slot.installedAdditionId) return slot;
            return {
              ...slot,
              filled: remoteSlot.filled,
              occupant: remoteSlot.occupant,
              linkedFacilityId: remoteSlot.linkedFacilityId,
              installedAdditionId: remoteSlot.installedAdditionId,
              installedBy: remoteSlot.installedBy,
              installedAt: remoteSlot.installedAt,
            };
          }),
        };
      }),
      expansions: local.businessMap.expansions.map((expansion) => remoteExpansions.get(expansion.id) || expansion),
    },
  };
}

export function rebaseFacilityOfficeEdits(local: FacilityOfficeState, remote: FacilityOfficeState, facilityId: string): FacilityOfficeState {
  const localFacility = local.facilities.find((facility) => facility.id === facilityId);
  const remoteFacility = remote.facilities.find((facility) => facility.id === facilityId);
  if (!localFacility || !remoteFacility) return remote;
  return normalizeFacilityOfficeState({
    ...remote,
    facilities: remote.facilities.map((facility) => facility.id === facilityId ? mergeRemoteFacilityActions(localFacility, remoteFacility) : facility),
    facilityAdditions: local.facilityAdditions,
  });
}
