import { safeGetItem, safeGetJson, safeRemoveItem, safeSetJson } from "@/app/components/safe-storage";
import { IMAGE_STORAGE_LOCAL_KEY } from "./image-storage";
import { buildSupabasePublicHeaders, supabaseFunctionBase } from "./supabase-env";

const API_BASE = supabaseFunctionBase;
const LOCAL_DM_LEVEL_CATEGORIES_KEY = "inet-dm-player-level-categories";
const LEVEL_CATEGORIES_FALLBACK_STATE_KEY = "inet-dm-player-level-categories-fallback";
const LOCAL_DM_MAGIC_LISTS_KEY = "inet-dm-player-magic-lists";
const MAGIC_LISTS_FALLBACK_STATE_KEY = "inet-dm-player-magic-lists-fallback";
const LOCAL_WIKI_BLOCK_PRESETS_KEY = "inet-wiki-block-presets";
const LOCAL_WIKI_ARTICLE_REVISIONS_KEY = "inet-wiki-article-revisions";
const IMAGE_STORAGE_FALLBACK_STATE_KEY = "inet-dm-image-storage-fallback";
const WIKI_BLOCK_PRESETS_FALLBACK_STATE_KEY = "inet-wiki-block-presets-fallback";
const LEVEL_CATEGORIES_TRANSIENT_FALLBACK_COOLDOWN_MS = 5 * 60 * 1000;
const LEVEL_CATEGORIES_DEPLOYMENT_FALLBACK_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type DMTagKind = "item" | "card" | "info" | "status" | "wiki";
type LocalLevelCategoryMap = Record<string, Record<string, unknown>[]>;
type LocalMagicListMap = Record<string, Record<string, unknown>[]>;
type LocalCollectionFallbackState = {
  mode: "local";
  reason: "deployment" | "transient";
  retryAfter: number;
};
let inMemoryLevelCategoriesFallbackState: LocalCollectionFallbackState | null = null;
let hasLoggedLevelCategoriesFallback = false;
let inMemoryMagicListsFallbackState: LocalCollectionFallbackState | null = null;
let hasLoggedMagicListsFallback = false;
let inMemoryImageStorageFallbackState: LocalCollectionFallbackState | null = null;
let hasLoggedImageStorageFallback = false;
let inMemoryWikiBlockPresetsFallbackState: LocalCollectionFallbackState | null = null;
let hasLoggedWikiBlockPresetsFallback = false;

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
  return (
    isDeploymentLevelCategoriesFailure(err) ||
    /Failed to fetch|NetworkError|Load failed|timed out|timeout/i.test(message)
  );
}

function isDeploymentLevelCategoriesFailure(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || "");
  return /404|Unknown DM collection|Invalid API key|No API key found|Request failed: 404|42501|row-level security/i.test(message);
}

function shouldFallbackPlayerMagicLists(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || "");
  return (
    isDeploymentMagicListsFailure(err) ||
    /Failed to fetch|NetworkError|Load failed|timed out|timeout/i.test(message)
  );
}

function isDeploymentMagicListsFailure(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || "");
  return /404|Unknown DM collection|Invalid API key|No API key found|Request failed: 404|42501|row-level security/i.test(message);
}

function shouldFallbackImageStorage(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || "");
  return (
    isDeploymentImageStorageFailure(err) ||
    /Failed to fetch|NetworkError|Load failed|timed out|timeout/i.test(message)
  );
}

function isDeploymentImageStorageFailure(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || "");
  return /404|Unknown DM collection|Invalid API key|No API key found|Request failed: 404|42501|row-level security/i.test(message);
}

function shouldFallbackWikiBlockPresets(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || "");
  return (
    isDeploymentWikiBlockPresetsFailure(err) ||
    /Failed to fetch|NetworkError|Load failed|timed out|timeout/i.test(message)
  );
}

function isDeploymentWikiBlockPresetsFailure(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || "");
  return /404|Invalid API key|No API key found|Request failed: 404|42501|row-level security/i.test(message);
}

function shouldFallbackWikiArticleRevisions(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || "");
  return (
    /404|Invalid API key|No API key found|Request failed: 404|42501|row-level security/i.test(message) ||
    /Failed to fetch|NetworkError|Load failed|timed out|timeout/i.test(message)
  );
}

function loadLocalDMPlayerLevelCategories(playerId: string) {
  const stored = safeGetJson<LocalLevelCategoryMap>(LOCAL_DM_LEVEL_CATEGORIES_KEY, {});
  return Array.isArray(stored[playerId]) ? stored[playerId] : [];
}

function loadLocalDMPlayerMagicLists(playerId: string) {
  const stored = safeGetJson<LocalMagicListMap>(LOCAL_DM_MAGIC_LISTS_KEY, {});
  return Array.isArray(stored[playerId]) ? stored[playerId] : [];
}

function loadLocalDMImageStorage() {
  return safeGetJson<Record<string, unknown>[]>(IMAGE_STORAGE_LOCAL_KEY, []);
}

function loadLocalWikiBlockPresets() {
  return safeGetJson<Record<string, unknown>[]>(LOCAL_WIKI_BLOCK_PRESETS_KEY, []);
}

function loadLocalWikiArticleRevisions() {
  return safeGetJson<Record<string, unknown>[]>(LOCAL_WIKI_ARTICLE_REVISIONS_KEY, []);
}

function getActiveLevelCategoriesFallbackState() {
  if (
    inMemoryLevelCategoriesFallbackState?.mode === "local" &&
    typeof inMemoryLevelCategoriesFallbackState.retryAfter === "number" &&
    inMemoryLevelCategoriesFallbackState.retryAfter > Date.now()
  ) {
    return inMemoryLevelCategoriesFallbackState;
  }

  const persisted = safeGetJson<LocalCollectionFallbackState | null>(
    LEVEL_CATEGORIES_FALLBACK_STATE_KEY,
    null,
  );

  if (
    persisted?.mode === "local" &&
    typeof persisted.retryAfter === "number" &&
    persisted.retryAfter > Date.now()
  ) {
    inMemoryLevelCategoriesFallbackState = persisted;
    return persisted;
  }

  inMemoryLevelCategoriesFallbackState = null;
  return null;
}

function getActiveMagicListsFallbackState() {
  if (
    inMemoryMagicListsFallbackState?.mode === "local" &&
    typeof inMemoryMagicListsFallbackState.retryAfter === "number" &&
    inMemoryMagicListsFallbackState.retryAfter > Date.now()
  ) {
    return inMemoryMagicListsFallbackState;
  }

  const persisted = safeGetJson<LocalCollectionFallbackState | null>(
    MAGIC_LISTS_FALLBACK_STATE_KEY,
    null,
  );

  if (
    persisted?.mode === "local" &&
    typeof persisted.retryAfter === "number" &&
    persisted.retryAfter > Date.now()
  ) {
    inMemoryMagicListsFallbackState = persisted;
    return persisted;
  }

  inMemoryMagicListsFallbackState = null;
  return null;
}

function getActiveImageStorageFallbackState() {
  if (
    inMemoryImageStorageFallbackState?.mode === "local" &&
    typeof inMemoryImageStorageFallbackState.retryAfter === "number" &&
    inMemoryImageStorageFallbackState.retryAfter > Date.now()
  ) {
    return inMemoryImageStorageFallbackState;
  }

  const persisted = safeGetJson<LocalCollectionFallbackState | null>(
    IMAGE_STORAGE_FALLBACK_STATE_KEY,
    null,
  );

  if (
    persisted?.mode === "local" &&
    typeof persisted.retryAfter === "number" &&
    persisted.retryAfter > Date.now()
  ) {
    inMemoryImageStorageFallbackState = persisted;
    return persisted;
  }

  inMemoryImageStorageFallbackState = null;
  return null;
}

function getActiveWikiBlockPresetsFallbackState() {
  if (
    inMemoryWikiBlockPresetsFallbackState?.mode === "local" &&
    typeof inMemoryWikiBlockPresetsFallbackState.retryAfter === "number" &&
    inMemoryWikiBlockPresetsFallbackState.retryAfter > Date.now()
  ) {
    return inMemoryWikiBlockPresetsFallbackState;
  }

  const persisted = safeGetJson<LocalCollectionFallbackState | null>(
    WIKI_BLOCK_PRESETS_FALLBACK_STATE_KEY,
    null,
  );

  if (
    persisted?.mode === "local" &&
    typeof persisted.retryAfter === "number" &&
    persisted.retryAfter > Date.now()
  ) {
    inMemoryWikiBlockPresetsFallbackState = persisted;
    return persisted;
  }

  inMemoryWikiBlockPresetsFallbackState = null;
  return null;
}

function logLevelCategoriesFallback(action: "load" | "save", err: unknown) {
  if (hasLoggedLevelCategoriesFallback) return;
  hasLoggedLevelCategoriesFallback = true;
  const message = err instanceof Error ? err.message : String(err || "Unknown fallback reason");
  console.warn(
    `${action === "load" ? "Loading" : "Saving"} DM level categories in local fallback mode (${message}).`,
  );
}

function logMagicListsFallback(action: "load" | "save", err: unknown) {
  if (hasLoggedMagicListsFallback) return;
  hasLoggedMagicListsFallback = true;
  const message = err instanceof Error ? err.message : String(err || "Unknown fallback reason");
  console.warn(
    `${action === "load" ? "Loading" : "Saving"} DM magic lists in local fallback mode (${message}).`,
  );
}

function logImageStorageFallback(action: "load" | "save", err: unknown) {
  if (hasLoggedImageStorageFallback) return;
  hasLoggedImageStorageFallback = true;
  const message = err instanceof Error ? err.message : String(err || "Unknown fallback reason");
  console.warn(
    `${action === "load" ? "Loading" : "Saving"} DM image storage in local fallback mode (${message}).`,
  );
}

function logWikiBlockPresetsFallback(action: "load" | "save", err: unknown) {
  if (hasLoggedWikiBlockPresetsFallback) return;
  hasLoggedWikiBlockPresetsFallback = true;
  const message = err instanceof Error ? err.message : String(err || "Unknown fallback reason");
  console.warn(
    `${action === "load" ? "Loading" : "Saving"} wiki block presets in local fallback mode (${message}).`,
  );
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

function saveLocalDMPlayerMagicLists(
  playerId: string,
  magicLists: Record<string, unknown>[],
) {
  const stored = safeGetJson<LocalMagicListMap>(LOCAL_DM_MAGIC_LISTS_KEY, {});
  safeSetJson(LOCAL_DM_MAGIC_LISTS_KEY, {
    ...stored,
    [playerId]: magicLists,
  });
}

function saveLocalDMImageStorage(images: Record<string, unknown>[]) {
  safeSetJson(IMAGE_STORAGE_LOCAL_KEY, images);
}

function saveLocalWikiBlockPresets(presets: Record<string, unknown>[]) {
  safeSetJson(LOCAL_WIKI_BLOCK_PRESETS_KEY, presets);
}

function saveLocalWikiArticleRevisions(revisions: Record<string, unknown>[]) {
  safeSetJson(LOCAL_WIKI_ARTICLE_REVISIONS_KEY, revisions);
}

function shouldUseLocalLevelCategoriesFallback() {
  return getActiveLevelCategoriesFallbackState() !== null;
}

function shouldUseLocalMagicListsFallback() {
  return getActiveMagicListsFallbackState() !== null;
}

function shouldUseLocalImageStorageFallback() {
  return getActiveImageStorageFallbackState() !== null;
}

function shouldUseLocalWikiBlockPresetsFallback() {
  return getActiveWikiBlockPresetsFallbackState() !== null;
}

function activateLocalLevelCategoriesFallback(reason: "deployment" | "transient") {
  const fallbackState = {
    mode: "local",
    reason,
    retryAfter:
      Date.now() +
      (reason === "deployment"
        ? LEVEL_CATEGORIES_DEPLOYMENT_FALLBACK_COOLDOWN_MS
        : LEVEL_CATEGORIES_TRANSIENT_FALLBACK_COOLDOWN_MS),
  } satisfies LocalCollectionFallbackState;
  inMemoryLevelCategoriesFallbackState = fallbackState;
  safeSetJson(LEVEL_CATEGORIES_FALLBACK_STATE_KEY, fallbackState);
}

function activateLocalMagicListsFallback(reason: "deployment" | "transient") {
  const fallbackState = {
    mode: "local",
    reason,
    retryAfter:
      Date.now() +
      (reason === "deployment"
        ? LEVEL_CATEGORIES_DEPLOYMENT_FALLBACK_COOLDOWN_MS
        : LEVEL_CATEGORIES_TRANSIENT_FALLBACK_COOLDOWN_MS),
  } satisfies LocalCollectionFallbackState;
  inMemoryMagicListsFallbackState = fallbackState;
  safeSetJson(MAGIC_LISTS_FALLBACK_STATE_KEY, fallbackState);
}

function activateLocalImageStorageFallback(reason: "deployment" | "transient") {
  const fallbackState = {
    mode: "local",
    reason,
    retryAfter:
      Date.now() +
      (reason === "deployment"
        ? LEVEL_CATEGORIES_DEPLOYMENT_FALLBACK_COOLDOWN_MS
        : LEVEL_CATEGORIES_TRANSIENT_FALLBACK_COOLDOWN_MS),
  } satisfies LocalCollectionFallbackState;
  inMemoryImageStorageFallbackState = fallbackState;
  safeSetJson(IMAGE_STORAGE_FALLBACK_STATE_KEY, fallbackState);
}

function activateLocalWikiBlockPresetsFallback(reason: "deployment" | "transient") {
  const fallbackState = {
    mode: "local",
    reason,
    retryAfter:
      Date.now() +
      (reason === "deployment"
        ? LEVEL_CATEGORIES_DEPLOYMENT_FALLBACK_COOLDOWN_MS
        : LEVEL_CATEGORIES_TRANSIENT_FALLBACK_COOLDOWN_MS),
  } satisfies LocalCollectionFallbackState;
  inMemoryWikiBlockPresetsFallbackState = fallbackState;
  safeSetJson(WIKI_BLOCK_PRESETS_FALLBACK_STATE_KEY, fallbackState);
}

function clearLocalLevelCategoriesFallback() {
  inMemoryLevelCategoriesFallbackState = null;
  hasLoggedLevelCategoriesFallback = false;
  safeRemoveItem(LEVEL_CATEGORIES_FALLBACK_STATE_KEY);
}

function clearLocalMagicListsFallback() {
  inMemoryMagicListsFallbackState = null;
  hasLoggedMagicListsFallback = false;
  safeRemoveItem(MAGIC_LISTS_FALLBACK_STATE_KEY);
}

function clearLocalImageStorageFallback() {
  inMemoryImageStorageFallbackState = null;
  hasLoggedImageStorageFallback = false;
  safeRemoveItem(IMAGE_STORAGE_FALLBACK_STATE_KEY);
}

function clearLocalWikiBlockPresetsFallback() {
  inMemoryWikiBlockPresetsFallbackState = null;
  hasLoggedWikiBlockPresetsFallback = false;
  safeRemoveItem(WIKI_BLOCK_PRESETS_FALLBACK_STATE_KEY);
}

export function getDMImageStorageFallbackState() {
  return getActiveImageStorageFallbackState();
}

export function getWikiBlockPresetsFallbackState() {
  return getActiveWikiBlockPresetsFallbackState();
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
    activateLocalLevelCategoriesFallback(
      isDeploymentLevelCategoriesFailure(err) ? "deployment" : "transient",
    );
    logLevelCategoriesFallback("load", err);
    return loadLocalDMPlayerLevelCategories(playerId);
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
    activateLocalLevelCategoriesFallback(
      isDeploymentLevelCategoriesFailure(err) ? "deployment" : "transient",
    );
    logLevelCategoriesFallback("save", err);
    saveLocalDMPlayerLevelCategories(playerId, levelCategories);
  }
}

export async function loadDMPlayerMagicLists(playerId: string) {
  if (shouldUseLocalMagicListsFallback()) {
    return loadLocalDMPlayerMagicLists(playerId);
  }

  try {
    const body = await apiFetch(`/dm/player-magic-lists/${playerId}`, {
      method: "GET",
    });

    clearLocalMagicListsFallback();
    return (body?.magicLists ?? []) as Record<string, unknown>[];
  } catch (err) {
    if (!shouldFallbackPlayerMagicLists(err)) throw err;
    activateLocalMagicListsFallback(
      isDeploymentMagicListsFailure(err) ? "deployment" : "transient",
    );
    logMagicListsFallback("load", err);
    return loadLocalDMPlayerMagicLists(playerId);
  }
}

export async function saveDMPlayerMagicLists(
  playerId: string,
  magicLists: Record<string, unknown>[],
) {
  if (shouldUseLocalMagicListsFallback()) {
    saveLocalDMPlayerMagicLists(playerId, magicLists);
    return;
  }

  try {
    await apiFetch("/dm/player-magic-lists/save", {
      method: "POST",
      body: JSON.stringify({ playerId, magicLists }),
    });
    clearLocalMagicListsFallback();
  } catch (err) {
    if (!shouldFallbackPlayerMagicLists(err)) throw err;
    activateLocalMagicListsFallback(
      isDeploymentMagicListsFailure(err) ? "deployment" : "transient",
    );
    logMagicListsFallback("save", err);
    saveLocalDMPlayerMagicLists(playerId, magicLists);
  }
}

export async function loadDMImageStorage<T>() {
  if (shouldUseLocalImageStorageFallback()) {
    return loadLocalDMImageStorage() as T[];
  }

  try {
    const body = await apiFetch("/dm/image-storage", { method: "GET" });
    clearLocalImageStorageFallback();
    const images = (body?.images ?? []) as T[];
    saveLocalDMImageStorage(images as unknown as Record<string, unknown>[]);
    return images;
  } catch (err) {
    if (!shouldFallbackImageStorage(err)) throw err;
    activateLocalImageStorageFallback(
      isDeploymentImageStorageFailure(err) ? "deployment" : "transient",
    );
    logImageStorageFallback("load", err);
    return loadLocalDMImageStorage() as T[];
  }
}

export async function saveDMImageStorage(images: Record<string, unknown>[]) {
  if (shouldUseLocalImageStorageFallback()) {
    saveLocalDMImageStorage(images);
    return;
  }

  try {
    await apiFetch("/dm/image-storage/save", {
      method: "POST",
      body: JSON.stringify({ images }),
    });
    clearLocalImageStorageFallback();
    saveLocalDMImageStorage(images);
  } catch (err) {
    if (!shouldFallbackImageStorage(err)) throw err;
    activateLocalImageStorageFallback(
      isDeploymentImageStorageFailure(err) ? "deployment" : "transient",
    );
    logImageStorageFallback("save", err);
    saveLocalDMImageStorage(images);
  }
}

export async function loadWikiBlockPresets<T>() {
  if (shouldUseLocalWikiBlockPresetsFallback()) {
    return loadLocalWikiBlockPresets() as T[];
  }

  try {
    const body = await apiFetch("/wiki/block-presets", { method: "GET" });
    clearLocalWikiBlockPresetsFallback();
    const presets = (body?.wikiBlockPresets ?? []) as T[];
    saveLocalWikiBlockPresets(presets as unknown as Record<string, unknown>[]);
    return presets;
  } catch (err) {
    if (!shouldFallbackWikiBlockPresets(err)) throw err;
    activateLocalWikiBlockPresetsFallback(
      isDeploymentWikiBlockPresetsFailure(err) ? "deployment" : "transient",
    );
    logWikiBlockPresetsFallback("load", err);
    return loadLocalWikiBlockPresets() as T[];
  }
}

export async function saveWikiBlockPresets(presets: Record<string, unknown>[]) {
  if (shouldUseLocalWikiBlockPresetsFallback()) {
    saveLocalWikiBlockPresets(presets);
    return;
  }

  try {
    await apiFetch("/wiki/block-presets/save", {
      method: "POST",
      body: JSON.stringify({ wikiBlockPresets: presets }),
    });
    clearLocalWikiBlockPresetsFallback();
    saveLocalWikiBlockPresets(presets);
  } catch (err) {
    if (!shouldFallbackWikiBlockPresets(err)) throw err;
    activateLocalWikiBlockPresetsFallback(
      isDeploymentWikiBlockPresetsFailure(err) ? "deployment" : "transient",
    );
    logWikiBlockPresetsFallback("save", err);
    saveLocalWikiBlockPresets(presets);
  }
}

export async function loadWikiArticleRevisions<T>() {
  try {
    const body = await apiFetch("/wiki/article-revisions", { method: "GET" });
    const revisions = (body?.wikiArticleRevisions ?? []) as T[];
    saveLocalWikiArticleRevisions(revisions as unknown as Record<string, unknown>[]);
    return revisions;
  } catch (err) {
    if (!shouldFallbackWikiArticleRevisions(err)) throw err;
    return loadLocalWikiArticleRevisions() as T[];
  }
}

export async function saveWikiArticleRevisions(revisions: Record<string, unknown>[]) {
  try {
    await apiFetch("/wiki/article-revisions/save", {
      method: "POST",
      body: JSON.stringify({ wikiArticleRevisions: revisions }),
    });
    saveLocalWikiArticleRevisions(revisions);
  } catch (err) {
    if (!shouldFallbackWikiArticleRevisions(err)) throw err;
    saveLocalWikiArticleRevisions(revisions);
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
