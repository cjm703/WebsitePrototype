const STALE_CHUNK_RELOAD_KEY = "inet-stale-chunk-reload";

const STALE_CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk [\w-]+ failed/i,
  /chunkloaderror/i,
  /unable to preload css/i,
];

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "");
  }
  return "";
}

function currentLocationKey() {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search + window.location.hash;
}

function clearReloadMarker() {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) === currentLocationKey()) {
      window.sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY);
    }
  } catch {
    // Recovery still works through the route error screen when storage is unavailable.
  }
}

export function isStaleChunkError(error: unknown) {
  const message = errorMessage(error);
  return STALE_CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function reloadOnceForStaleChunk(error: unknown) {
  if (!isStaleChunkError(error) || typeof window === "undefined") return false;

  const locationKey = currentLocationKey();
  try {
    if (window.sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) === locationKey) {
      window.sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY);
      return false;
    }
    window.sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, locationKey);
  } catch {
    return false;
  }

  window.location.reload();
  return true;
}

export async function importWithStaleChunkRecovery<T>(importer: () => Promise<T>): Promise<T> {
  try {
    const loadedModule = await importer();
    clearReloadMarker();
    return loadedModule;
  } catch (error) {
    if (reloadOnceForStaleChunk(error)) {
      return await new Promise<T>(() => {});
    }
    throw error;
  }
}
