import { safeGetItem, safeRemoveItem } from "@/app/components/safe-storage";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const API_BASE = `${SUPABASE_URL}/functions/v1/make-server-8a5950b5`;

type DMTagKind = "item" | "card" | "info" | "status" | "wiki";

function buildHeaders(includeJson = true): HeadersInit {
  const sessionToken = safeGetItem("inet-session-token") || "";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
    "X-Session-Token": sessionToken,
  };

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const sessionToken = safeGetItem("inet-session-token");
  if (!sessionToken) {
    throw new Error("Missing player session token");
  }

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
    throw new Error(
      typeof body?.error === "string" ? body.error : "Player session expired",
    );
  }

  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Request failed: ${res.status}`,
    );
  }

  return body;
}

function loadDMCollection<T>(path: string, responseKey: string): Promise<T[]> {
  return apiFetch(path, { method: "GET" }).then(
    (body) => (body?.[responseKey] ?? []) as T[],
  );
}

function saveDMCollection(
  path: string,
  requestKey: string,
  rows: Record<string, unknown>[],
): Promise<void> {
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

export const loadDMPlayers = <T>() => loadDMCollection<T>("/dm/players", "players");
export const saveDMPlayers = (players: Record<string, unknown>[]) =>
  saveDMCollection("/dm/players/save", "players", players);

export const loadDMDeletedPlayers = <T>() =>
  loadDMCollection<T>("/dm/deleted-players", "players");
export const saveDMDeletedPlayers = (players: Record<string, unknown>[]) =>
  saveDMCollection("/dm/deleted-players/save", "players", players);

export const loadDMItems = <T>() => loadDMCollection<T>("/dm/items", "items");
export const saveDMItems = (items: Record<string, unknown>[]) =>
  saveDMCollection("/dm/items/save", "items", items);

export const loadDMCards = <T>() => loadDMCollection<T>("/dm/cards", "cards");
export const saveDMCards = (cards: Record<string, unknown>[]) =>
  saveDMCollection("/dm/cards/save", "cards", cards);

export const loadDMInfos = <T>() => loadDMCollection<T>("/dm/infos", "infos");
export const saveDMInfos = (infos: Record<string, unknown>[]) =>
  saveDMCollection("/dm/infos/save", "infos", infos);

export const loadDMNodeTrees = <T>() =>
  loadDMCollection<T>("/dm/node-trees", "nodeTrees");
export const saveDMNodeTrees = (nodeTrees: Record<string, unknown>[]) =>
  saveDMCollection("/dm/node-trees/save", "nodeTrees", nodeTrees);

export const loadDMNotifications = <T>() =>
  loadDMCollection<T>("/dm/notifications", "notifications");
export const saveDMNotifications = (notifications: Record<string, unknown>[]) =>
  saveDMCollection("/dm/notifications/save", "notifications", notifications);

export const loadDMInfoSubTabs = <T>() =>
  loadDMCollection<T>("/dm/info-subtabs", "infoSubTabs");
export const saveDMInfoSubTabs = (infoSubTabs: Record<string, unknown>[]) =>
  saveDMCollection("/dm/info-subtabs/save", "infoSubTabs", infoSubTabs);

export const loadDMCustomReactions = <T>() =>
  loadDMCollection<T>("/dm/custom-reactions", "reactions");
export const saveDMCustomReactions = (reactions: Record<string, unknown>[]) =>
  saveDMCollection("/dm/custom-reactions/save", "reactions", reactions);

export async function loadDMTags<T>(kind: DMTagKind) {
  const body = await apiFetch(`/dm/tags/${encodeURIComponent(kind)}`, {
    method: "GET",
  });

  return (body?.tags ?? []) as T[];
}

export async function saveDMTags(
  kind: DMTagKind,
  tags: Record<string, unknown>[],
) {
  return apiFetch(`/dm/tags/${encodeURIComponent(kind)}/save`, {
    method: "POST",
    body: JSON.stringify({ tags }),
  });
}

export async function loadDMPlayerLevelCategories(playerId: string) {
  const body = await apiFetch(`/dm/player-level-categories/${playerId}`, {
    method: "GET",
  });

  return (body?.levelCategories ?? []) as Record<string, unknown>[];
}

export async function saveDMPlayerLevelCategories(
  playerId: string,
  levelCategories: Record<string, unknown>[],
) {
  await apiFetch("/dm/player-level-categories/save", {
    method: "POST",
    body: JSON.stringify({ playerId, levelCategories }),
  });
}

export async function purgeDMDeletedPlayer(playerId: string) {
  return apiFetch("/dm/deleted-player/purge", {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });
}

export async function clearDMDeletedPlayers() {
  return apiFetch("/dm/deleted-players/clear", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function deleteDMPlayer(playerId: string) {
  return apiFetch("/dm/player/delete", {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });
}


export async function loadWikiBootstrap() {
  return apiFetch("/wiki/bootstrap", { method: "GET" });
}

export async function saveWikiSites(sites: Record<string, unknown>[]) {
  await apiFetch("/wiki/sites/save", {
    method: "POST",
    body: JSON.stringify({ sites }),
  });
}

export async function saveWikiCustomPanelStyles(
  customPanelStyles: Record<string, unknown>[],
) {
  await apiFetch("/wiki/custom-panel-styles/save", {
    method: "POST",
    body: JSON.stringify({ customPanelStyles }),
  });
}
