import { sessionApiFetch } from "./api-client";
import { supabase } from "./supabaseClient";

export interface FacilityAdditionAction {
  action: "install" | "remove";
  scopeId: "global" | string;
  sectorId: string;
  slotId: string;
  additionId?: string;
}

export interface FacilityExpansionAction {
  action: "fund" | "complete";
  facilityId: string;
  expansionId: string;
}

export interface PersonalFundUpdate {
  playerId: string;
  balance?: number;
  delta?: number;
  note?: string;
}

export interface FacilityMonthAdvanceAction {
  facilityId: string;
  expectedMonth: number;
  eventAdjustment?: number;
  manualAdjustment?: number;
  note?: string;
}

export async function saveOfficeState<T>(state: T, expectedRevision: number): Promise<T> {
  const body = await sessionApiFetch("/office/state/save", {
    method: "POST",
    body: JSON.stringify({ state, expectedRevision }),
  });
  return body.state as T;
}

export async function applyFacilityAdditionAction<T>(action: FacilityAdditionAction): Promise<T> {
  const body = await sessionApiFetch("/office/facility-addition/action", {
    method: "POST",
    body: JSON.stringify(action),
  });
  return body.state as T;
}

export async function applyFacilityExpansionAction<T>(action: FacilityExpansionAction): Promise<T> {
  const body = await sessionApiFetch("/office/facility-expansion/action", {
    method: "POST",
    body: JSON.stringify(action),
  });
  return body.state as T;
}

export async function updateOfficePersonalFund<T>(update: PersonalFundUpdate): Promise<T> {
  const body = await sessionApiFetch("/office/personal-funds/update", {
    method: "POST",
    body: JSON.stringify(update),
  });
  return body.state as T;
}

export async function advanceFacilityMonth<T>(action: FacilityMonthAdvanceAction): Promise<T> {
  const body = await sessionApiFetch("/office/facility-month/advance", {
    method: "POST",
    body: JSON.stringify(action),
  });
  return body.state as T;
}

type OfficeRealtimeChannel = ReturnType<typeof supabase.channel>;

interface OfficeSignalRegistry {
  channel: OfficeRealtimeChannel | null;
  listeners: Set<() => void>;
}

const OFFICE_SIGNAL_REGISTRY_KEY = "__inetOfficeSignalRegistryV2";
const officeSignalGlobal = globalThis as typeof globalThis & {
  [OFFICE_SIGNAL_REGISTRY_KEY]?: OfficeSignalRegistry;
};
const officeSignalRegistry = officeSignalGlobal[OFFICE_SIGNAL_REGISTRY_KEY] ?? {
  channel: null,
  listeners: new Set<() => void>(),
};
officeSignalGlobal[OFFICE_SIGNAL_REGISTRY_KEY] = officeSignalRegistry;

function dispatchOfficeStateSignal() {
  for (const listener of [...officeSignalRegistry.listeners]) {
    try {
      listener();
    } catch (error) {
      console.warn("Office state signal listener failed", error);
    }
  }
}

function getOfficeStateSignalChannel() {
  if (officeSignalRegistry.channel) return officeSignalRegistry.channel;

  // Supabase reuses channels by topic. Bind callbacks exactly once, then fan out
  // locally so React remounts and multiple Office views cannot mutate a joined channel.
  const channel = supabase
    .channel("office-state-updates-v2")
    .on("broadcast", { event: "office-state-updated" }, dispatchOfficeStateSignal)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_nexus_nomad_state", filter: "id=eq.default" },
      dispatchOfficeStateSignal,
    )
    .subscribe();

  officeSignalRegistry.channel = channel;
  return channel;
}

export function subscribeToOfficeStateSignals(onSignal: () => void) {
  officeSignalRegistry.listeners.add(onSignal);
  const channel = getOfficeStateSignalChannel();
  let subscribed = true;

  return {
    notify: () => channel.httpSend("office-state-updated", { updatedAt: new Date().toISOString() }),
    unsubscribe: () => {
      if (!subscribed) return;
      subscribed = false;
      officeSignalRegistry.listeners.delete(onSignal);
    },
  };
}
