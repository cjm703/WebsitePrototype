import { safeGetItem, safeGetJson, safeRemoveItem, safeSetJson } from "@/app/components/safe-storage";
import { loadPlayerDoc, savePlayerDoc } from "./db-core";
import { buildSupabasePublicHeaders, supabaseFunctionBase } from "./supabase-env";

const API_BASE = supabaseFunctionBase;
const LOCAL_DM_LEVEL_CATEGORIES_KEY = "inet-dm-player-level-categories";
const LEVEL_CATEGORIES_FALLBACK_STATE_KEY = "inet-dm-player-level-categories-fallback";
const LEVEL_CATEGORIES_TRANSIENT_FALLBACK_COOLDOWN_MS = 5 * 60 * 1000;
const LEVEL_CATEGORIES_DEPLOYMENT_FALLBACK_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type DMTagKind = "item" | "card" | "info" | "status" | "wiki";
type LocalLevelCategoryMap = Record<string, Record<string, unknown>[]>;
type LevelCategoriesFallbackState = {
  mode: "local";
  reason: "deployment" | "transient";
  retryAfter: number;
};

function buildHeaders(includeJson = true): HeadersInit {
  const sessionToken = safeGetItem("inet-session-token") || "";

  const headers: Record<string, string> = {
    ...buildSupabasePublicHeaders(includeJson),
    "X-Session-Token": sessionToken,
  };

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
    const message =
      typeof body?.error === "string" ? body.error : "Player session expired";
    if (/session|expired|revoked|invalid session|missing session token/i.test(message)) {
      safeRemoveItem("inet-session-token");
    }
    throw new Error(message);
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

function shouldFallbackPlayerLevelCategories(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || "");
  return /404|401|Unknown DM collection|Invalid API key|No API key found|Request failed: 404/i.test(message);
}

function isDeploymentLevelCategoriesFailure(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || "");
  return /404|Unknown DM collection|Invalid API key|No API key found|Request failed: 404/i.test(message);
}

function loadLocalDMPlayerLevelCategories(playerId: string) {
  const stored = safeGetJson<LocalLevelCategoryMap>(LOCAL_DM_LEVEL_CATEGORIES_KEY, {});
  return Array.isArray(stored[playerId]) ? stored[playerId] : [];
}

function saveLocalDMPlayerLevelCategories(
  playerId: string,
  levelCategories: Record<string, unknown>[],
) {
  const stored = safeGetJson<LocalLevelCategoryMap>(LOCAL_DM_LEVEL_CATEGORIES_KEY, {});
  safeSetJson(LOCAL_DM_LEVEL_CATEGORIES_KEY, {
    ...stored,
    [playerId]: levelCategories,
  });
}

function shouldUseLocalLevelCategoriesFallback() {
  const fallbackState = safeGetJson<LevelCategoriesFallbackState | null>(
    LEVEL_CATEGORIES_FALLBACK_STATE_KEY,
    null,
  );

  return (
    fallbackState?.mode === "local" &&
    typeof fallbackState.retryAfter === "number" &&
    fallbackState.retryAfter > Date.now()
  );
}

function activateLocalLevelCategoriesFallback(reason: "deployment" | "transient") {
  safeSetJson(LEVEL_CATEGORIES_FALLBACK_STATE_KEY, {
    mode: "local",
    reason,
    retryAfter:
      Date.now() +
      (reason === "deployment"
        ? LEVEL_CATEGORIES_DEPLOYMENT_FALLBACK_COOLDOWN_MS
        : LEVEL_CATEGORIES_TRANSIENT_FALLBACK_COOLDOWN_MS),
  } satisfies LevelCategoriesFallbackState);
}

function clearLocalLevelCategoriesFallback() {
  safeRemoveItem(LEVEL_CATEGORIES_FALLBACK_STATE_KEY);
}

export async function loadDMPlayerLevelCategories(playerId: string) {
  if (shouldUseLocalLevelCategoriesFallback()) {
    return loadLocalDMPlayerLevelCategories(playerId);
  }

  try {
    const body = await apiFetch(`/dm/player-level-categories/${playerId}`, {
      method: "GET",
    });

    clearLocalLevelCategoriesFallback();
    return (body?.levelCategories ?? []) as Record<string, unknown>[];
  } catch (err) {
    if (!shouldFallbackPlayerLevelCategories(err)) throw err;
    try {
      const levelCategories = await loadPlayerDoc<Record<string, unknown>[]>(
        "player_level_categories",
        playerId,
        [],
      );
      clearLocalLevelCategoriesFallback();
      return levelCategories;
    } catch (fallbackErr) {
      activateLocalLevelCategoriesFallback(
        isDeploymentLevelCategoriesFailure(err) ||
          isDeploymentLevelCategoriesFailure(fallbackErr)
          ? "deployment"
          : "transient",
      );
      console.warn("Falling back to local DM level categories storage", fallbackErr);
      return loadLocalDMPlayerLevelCategories(playerId);
    }
  }
}

export async function saveDMPlayerLevelCategories(
  playerId: string,
  levelCategories: Record<string, unknown>[],
) {
  if (shouldUseLocalLevelCategoriesFallback()) {
    saveLocalDMPlayerLevelCategories(playerId, levelCategories);
    return;
  }

  try {
    await apiFetch("/dm/player-level-categories/save", {
      method: "POST",
      body: JSON.stringify({ playerId, levelCategories }),
    });
    clearLocalLevelCategoriesFallback();
  } catch (err) {
    if (!shouldFallbackPlayerLevelCategories(err)) throw err;
    try {
      await savePlayerDoc<Record<string, unknown>[]>("player_level_categories", playerId, levelCategories);
      clearLocalLevelCategoriesFallback();
    } catch (fallbackErr) {
      activateLocalLevelCategoriesFallback(
        isDeploymentLevelCategoriesFailure(err) ||
          isDeploymentLevelCategoriesFailure(fallbackErr)
          ? "deployment"
          : "transient",
      );
      console.warn("Saving DM level categories to local storage fallback", fallbackErr);
      saveLocalDMPlayerLevelCategories(playerId, levelCategories);
    }
  }
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
