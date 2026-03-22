import { safeGetItem, safeRemoveItem } from "@/app/components/safe-storage";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const API_BASE = `${SUPABASE_URL}/functions/v1/make-server-8a5950b5`;

function buildHeaders(includeJson = true): HeadersInit {
  const sessionToken = safeGetItem("inet-session-token") || "";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
    "X-Session-Token": sessionToken,
  };

  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const sessionToken = safeGetItem("inet-session-token");
  if (!sessionToken) throw new Error("Missing player session token");

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(init.body != null),
      ...(init.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));

  if (res.status === 401) {
    safeRemoveItem("inet-session-token");
    throw new Error(typeof body?.error === "string" ? body.error : "Player session expired");
  }

  if (!res.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed: ${res.status}`);
  }

  return body;
}

export async function loadPlayerState() {
  return apiFetch("/player-state", { method: "GET" });
}

export async function savePlayerState(payload: Record<string, unknown>) {
  return apiFetch("/player-state", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logoutPlayerSession() {
  try {
    await apiFetch("/session/logout", { method: "POST" });
  } finally {
    safeRemoveItem("inet-session-token");
  }
}

async function dmGet(path: string) {
  const body = await apiFetch(path, { method: "GET" });
  return body?.rows ?? [];
}

async function dmSave(path: string, rows: Record<string, unknown>[]) {
  return apiFetch(path, {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

export async function loadDMPlayers() { return dmGet("/dm/players"); }
export async function saveDMPlayers(rows: Record<string, unknown>[]) { return dmSave("/dm/players/save", rows); }
export async function loadDMDeletedPlayers() { return dmGet("/dm/deleted-players"); }
export async function saveDMDeletedPlayers(rows: Record<string, unknown>[]) { return dmSave("/dm/deleted-players/save", rows); }
export async function loadDMItems() { return dmGet("/dm/items"); }
export async function saveDMItems(rows: Record<string, unknown>[]) { return dmSave("/dm/items/save", rows); }
export async function loadDMCards() { return dmGet("/dm/cards"); }
export async function saveDMCards(rows: Record<string, unknown>[]) { return dmSave("/dm/cards/save", rows); }
export async function loadDMInfos() { return dmGet("/dm/infos"); }
export async function saveDMInfos(rows: Record<string, unknown>[]) { return dmSave("/dm/infos/save", rows); }
export async function loadDMNodeTrees() { return dmGet("/dm/node-trees"); }
export async function saveDMNodeTrees(rows: Record<string, unknown>[]) { return dmSave("/dm/node-trees/save", rows); }
export async function loadDMNotifications() { return dmGet("/dm/notifications"); }
export async function saveDMNotifications(rows: Record<string, unknown>[]) { return dmSave("/dm/notifications/save", rows); }
export async function loadDMInfoSubTabs() { return dmGet("/dm/info-subtabs"); }
export async function saveDMInfoSubTabs(rows: Record<string, unknown>[]) { return dmSave("/dm/info-subtabs/save", rows); }
export async function loadDMCustomReactions() { return dmGet("/dm/custom-reactions"); }
export async function saveDMCustomReactions(rows: Record<string, unknown>[]) { return dmSave("/dm/custom-reactions/save", rows); }
export async function loadDMPlayerLevelCategories(playerId: string) {
  const body = await apiFetch(`/dm/player-level-categories/${playerId}`, { method: "GET" });
  return body?.rows ?? [];
}
export async function saveDMPlayerLevelCategories(playerId: string, rows: Record<string, unknown>[]) {
  return apiFetch("/dm/player-level-categories/save", {
    method: "POST",
    body: JSON.stringify({ playerId, rows }),
  });
}
