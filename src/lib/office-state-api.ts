import { sessionApiFetch } from "./api-client";
import { removeSupabaseChannelSafely, supabase } from "./supabaseClient";

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

export function subscribeToOfficeStateSignals(onSignal: () => void) {
  const channel = supabase
    .channel("office-state-updates")
    .on("broadcast", { event: "office-state-updated" }, onSignal)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_nexus_nomad_state", filter: "id=eq.default" },
      onSignal,
    )
    .subscribe();

  return {
    notify: () => channel.httpSend("office-state-updated", { updatedAt: new Date().toISOString() }),
    unsubscribe: () => removeSupabaseChannelSafely(channel),
  };
}
