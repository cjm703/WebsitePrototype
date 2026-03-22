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

function loadDMCollection<T>(path: string, responseKey: string): Promise<T[]> {
  return apiFetch(path, { method: "GET" }).then((body) => (body?.[responseKey] ?? []) as T[]);
}

function saveDMCollection(path: string, requestKey: string, rows: Record<string, unknown>[]): Promise<void> {
  return apiFetch(path, {
    method: "POST",
    body: JSON.stringify({ [requestKey]: rows }),
  }).then(() => undefined);
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

export const loadDMPlayers = <T = Record<string, unknown>>() => loadDMCollection<T>("/dm/players", "players");
export const saveDMPlayers = (players: Record<string, unknown>[]) => saveDMCollection("/dm/players/save", "players", players);

export const loadDMDeletedPlayers = <T = Record<string, unknown>>() => loadDMCollection<T>("/dm/deleted-players", "players");
export const saveDMDeletedPlayers = (players: Record<string, unknown>[]) => saveDMCollection("/dm/deleted-players/save", "players", players);

export const loadDMItems = <T = Record<string, unknown>>() => loadDMCollection<T>("/dm/items", "items");
export const saveDMItems = (items: Record<string, unknown>[]) => saveDMCollection("/dm/items/save", "items", items);

export const loadDMCards = <T = Record<string, unknown>>() => loadDMCollection<T>("/dm/cards", "cards");
export const saveDMCards = (cards: Record<string, unknown>[]) => saveDMCollection("/dm/cards/save", "cards", cards);

export const loadDMInfos = <T = Record<string, unknown>>() => loadDMCollection<T>("/dm/infos", "infos");
export const saveDMInfos = (infos: Record<string, unknown>[]) => saveDMCollection("/dm/infos/save", "infos", infos);

export const loadDMNodeTrees = <T = Record<string, unknown>>() => loadDMCollection<T>("/dm/node-trees", "nodeTrees");
export const saveDMNodeTrees = (nodeTrees: Record<string, unknown>[]) => saveDMCollection("/dm/node-trees/save", "nodeTrees", nodeTrees);

export const loadDMNotifications = <T = Record<string, unknown>>() => loadDMCollection<T>("/dm/notifications", "notifications");
export const saveDMNotifications = (notifications: Record<string, unknown>[]) => saveDMCollection("/dm/notifications/save", "notifications", notifications);

export const loadDMInfoSubTabs = <T = Record<string, unknown>>() => loadDMCollection<T>("/dm/info-subtabs", "infoSubTabs");
export const saveDMInfoSubTabs = (infoSubTabs: Record<string, unknown>[]) => saveDMCollection("/dm/info-subtabs/save", "infoSubTabs", infoSubTabs);

export const loadDMCustomReactions = <T = Record<string, unknown>>() => loadDMCollection<T>("/dm/custom-reactions", "reactions");
export const saveDMCustomReactions = (reactions: Record<string, unknown>[]) => saveDMCollection("/dm/custom-reactions/save", "reactions", reactions);

export async function loadDMPlayerLevelCategories(playerId: string) {
  const body = await apiFetch(`/dm/player-level-categories/${playerId}`, { method: "GET" });
  return (body?.levelCategories ?? []) as Record<string, unknown>[];
}

export async function saveDMPlayerLevelCategories(playerId: string, levelCategories: Record<string, unknown>[]) {
  await apiFetch("/dm/player-level-categories/save", {
    method: "POST",
    body: JSON.stringify({ playerId, levelCategories }),
  });
}
