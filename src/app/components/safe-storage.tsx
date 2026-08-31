// ════════════════════════════════════════════════════════
// Safe localStorage wrapper — prevents QuotaExceededError
// from crashing the React component tree. Also includes
// quota monitoring and auto-pruning of expendable data.
// ════════════════════════════════════════════════════════

// Keys ordered by pruning priority (most expendable first).
// When storage is near capacity, these are trimmed/removed first.
const PRUNABLE_KEYS_ORDERED: string[] = [
  "inet-error-log",
  "inet-arcade-leaderboard",
  "inet-community-images",
];

// Prefix patterns that can be safely trimmed (activity logs, old read markers)
const PRUNABLE_PREFIXES: string[] = [
  "inet-activity-log-",
  "inet-community-lastread-",
  "inet-read-",
  "inet-deleted-",
];

const RETIRED_STORAGE_KEYS = ["inet-adventure-sessions"];

export function clearRetiredStorage(): number {
  let removed = 0;
  try {
    RETIRED_STORAGE_KEYS.forEach((key) => {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        removed += 1;
      }
    });
  } catch {
    return removed;
  }
  return removed;
}

if (typeof window !== "undefined") clearRetiredStorage();

const CRITICAL_KEYS = new Set([
  "inet-session-token",
  "inet-user",
  "inet-user-id",
  "inet-profiles",
]);

const CRITICAL_PREFIXES = [
  "inet-auth",
  "inet-login",
  "inet-wiki-draft",
  "inet-editor-draft",
  "inet-pending-",
  "inet-unsaved-",
];

export type StorageImportance = "critical" | "saved" | "cache";

export interface StorageClassification {
  importance: StorageImportance;
  clearable: boolean;
  description: string;
}

function isPrunableStorageKey(key: string) {
  return PRUNABLE_KEYS_ORDERED.includes(key) || PRUNABLE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function classifyStorageKey(key: string): StorageClassification {
  if (CRITICAL_KEYS.has(key) || CRITICAL_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return {
      importance: "critical",
      clearable: false,
      description: "Session, identity, or unsaved editor data",
    };
  }
  if (isPrunableStorageKey(key)) {
    return {
      importance: "cache",
      clearable: true,
      description: "Disposable cache or diagnostic history",
    };
  }
  return {
    importance: "saved",
    clearable: false,
    description: "Saved application state or a server-synced local mirror",
  };
}

export function clearPrunableStorageKey(key: string): boolean {
  if (!isPrunableStorageKey(key)) return false;
  try {
    const existed = localStorage.getItem(key) !== null;
    localStorage.removeItem(key);
    return existed;
  } catch {
    return false;
  }
}

export function clearPrunableStorage(): { keysRemoved: number; bytesFreed: number } {
  const keys: string[] = [];
  let bytesFreed = 0;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !isPrunableStorageKey(key)) continue;
      const value = localStorage.getItem(key) || "";
      bytesFreed += (key.length + value.length) * 2;
      keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
    return { keysRemoved: keys.length, bytesFreed };
  } catch {
    return { keysRemoved: 0, bytesFreed: 0 };
  }
}

// Rough localStorage quota (browsers typically allow ~5MB)
const QUOTA_BYTES = 5 * 1024 * 1024;
const PRUNE_THRESHOLD = 0.85; // start pruning at 85% capacity

/** Estimate total localStorage usage in bytes */
export function getStorageUsageBytes(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        total += key.length * 2; // UTF-16
        const val = localStorage.getItem(key);
        if (val) total += val.length * 2;
      }
    }
  } catch {
    // ignore
  }
  return total;
}

/** Get usage as a fraction (0-1) */
export function getStorageUsageFraction(): number {
  return getStorageUsageBytes() / QUOTA_BYTES;
}

/** Trim an array stored as JSON to at most `maxLen` entries (keeps newest) */
function trimArrayKey(key: string, maxLen: number): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length <= maxLen) return false;
    localStorage.setItem(key, JSON.stringify(arr.slice(0, maxLen)));
    return true;
  } catch {
    return false;
  }
}

/** Auto-prune expendable data when storage usage exceeds threshold */
export function pruneIfNeeded(): void {
  if (getStorageUsageFraction() < PRUNE_THRESHOLD) return;

  // Phase 1: trim known large array keys
  trimArrayKey("inet-error-log", 50);
  trimArrayKey("inet-arcade-leaderboard", 50);
  if (getStorageUsageFraction() < PRUNE_THRESHOLD) return;

  // Phase 2: trim activity logs per player
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("inet-activity-log-")) {
        trimArrayKey(key, 20);
      }
    }
  } catch { /* ignore */ }
  if (getStorageUsageFraction() < PRUNE_THRESHOLD) return;

  // Phase 3: prune expired community images
  try {
    const raw = localStorage.getItem("inet-community-images");
    if (raw) {
      const store = JSON.parse(raw) as Record<string, { data: string; timestamp: number }>;
      const now = Date.now();
      const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
      const cleaned: Record<string, { data: string; timestamp: number }> = {};
      for (const [k, v] of Object.entries(store)) {
        if (now - v.timestamp < THREE_DAYS) cleaned[k] = v;
      }
      localStorage.setItem("inet-community-images", JSON.stringify(cleaned));
    }
  } catch { /* ignore */ }
  if (getStorageUsageFraction() < PRUNE_THRESHOLD) return;

  // Phase 4: remove prunable prefix keys (oldest first)
  try {
    const keysToCheck: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && PRUNABLE_PREFIXES.some(p => key.startsWith(p))) {
        keysToCheck.push(key);
      }
    }
    // Remove the smallest/oldest ones first
    for (const key of keysToCheck) {
      localStorage.removeItem(key);
      if (getStorageUsageFraction() < PRUNE_THRESHOLD) return;
    }
  } catch { /* ignore */ }

  // Phase 5: nuclear — remove entire prunable keys
  for (const key of PRUNABLE_KEYS_ORDERED) {
    try {
      localStorage.removeItem(key);
      if (getStorageUsageFraction() < PRUNE_THRESHOLD) return;
    } catch { /* ignore */ }
  }
}

// ════════════════════════════════════════════════════════
// Safe wrappers — drop-in replacements for localStorage
// ════════════════════════════════════════════════════════

/** Safe wrapper for localStorage.setItem — never throws */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    // Likely QuotaExceededError — attempt pruning and retry
    console.warn(`[safe-storage] setItem failed for "${key}", attempting prune...`, e);
    try {
      pruneIfNeeded();
      localStorage.setItem(key, value);
      return true;
    } catch (e2) {
      console.error(`[safe-storage] setItem failed for "${key}" even after pruning`, e2);
      return false;
    }
  }
}

/** Safe wrapper for localStorage.getItem — never throws */
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Safe wrapper for localStorage.removeItem — never throws */
export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

/** Safe JSON setter — serializes and safely stores */
export function safeSetJson(key: string, data: unknown): boolean {
  try {
    return safeSetItem(key, JSON.stringify(data));
  } catch {
    return false;
  }
}

/** Safe JSON getter — deserializes with fallback */
export function safeGetJson<T>(key: string, fallback: T): T {
  try {
    const raw = safeGetItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
