import { sessionApiFetch } from "./api-client";
import { removeSupabaseChannelSafely, supabase } from "./supabaseClient";

export interface FacilityAdditionAction {
  action: "install" | "remove";
  scopeId: "global" | string;
  sectorId: string;
  slotId: string;
  additionId?: string;
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
    notify: () => channel.send({
      type: "broadcast",
      event: "office-state-updated",
      payload: { updatedAt: new Date().toISOString() },
    }),
    unsubscribe: () => removeSupabaseChannelSafely(channel),
  };
}

