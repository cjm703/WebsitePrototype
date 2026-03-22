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

async function loadDMRows(path: string, key: string) {
  const body = await apiFetch(path, { method: "GET" });
  return body?.[key] ?? [];
}

async function saveDMRows(path: string, key: string, rows: Record<string, unknown>[]) {
  return apiFetch(path, {
    method: "POST",
    body: JSON.stringify({ [key]: rows }),
  });
}

export async function loadDMPlayers() {
  return loadDMRows("/dm/players", "players");
}

export async function saveDMPlayers(players: Record<string, unknown>[]) {
  return saveDMRows("/dm/players/save", "players", players);
}

export async function loadDMDeletedPlayers() {
  return loadDMRows("/dm/deleted-players", "players");
}

export async function saveDMDeletedPlayers(players: Record<string, unknown>[]) {
  return saveDMRows("/dm/deleted-players/save", "players", players);
}

export async function loadDMItems() {
  return loadDMRows("/dm/items", "items");
}

export async function saveDMItems(items: Record<string, unknown>[]) {
  return saveDMRows("/dm/items/save", "items", items);
}

export async function loadDMCards() {
  return loadDMRows("/dm/cards", "cards");
}

export async function saveDMCards(cards: Record<string, unknown>[]) {
  return saveDMRows("/dm/cards/save", "cards", cards);
}

export async function loadDMInfos() {
  return loadDMRows("/dm/infos", "infos");
}

export async function saveDMInfos(infos: Record<string, unknown>[]) {
  return saveDMRows("/dm/infos/save", "infos", infos);
}

export async function loadDMNodeTrees() {
  return loadDMRows("/dm/node-trees", "nodeTrees");
}

export async function saveDMNodeTrees(nodeTrees: Record<string, unknown>[]) {
  return saveDMRows("/dm/node-trees/save", "nodeTrees", nodeTrees);
}

export async function loadDMNotifications() {
  return loadDMRows("/dm/notifications", "notifications");
}

export async function saveDMNotifications(notifications: Record<string, unknown>[]) {
  return saveDMRows("/dm/notifications/save", "notifications", notifications);
}

export async function loadDMInfoSubTabs() {
  return loadDMRows("/dm/info-subtabs", "infoSubTabs");
}

export async function saveDMInfoSubTabs(infoSubTabs: Record<string, unknown>[]) {
  return saveDMRows("/dm/info-subtabs/save", "infoSubTabs", infoSubTabs);
}

export async function loadDMCustomReactions() {
  return loadDMRows("/dm/custom-reactions", "reactions");
}

export async function saveDMCustomReactions(reactions: Record<string, unknown>[]) {
  return saveDMRows("/dm/custom-reactions/save", "reactions", reactions);
}

export async function loadDMPlayerLevelCategories(playerId: string) {
  const body = await apiFetch(`/dm/player-level-categories/${encodeURIComponent(playerId)}`, { method: "GET" });
  return body?.levelCategories ?? [];
}

export async function saveDMPlayerLevelCategories(playerId: string, levelCategories: unknown[]) {
  return apiFetch("/dm/player-level-categories/save", {
    method: "POST",
    body: JSON.stringify({ playerId, levelCategories }),
  });
}
