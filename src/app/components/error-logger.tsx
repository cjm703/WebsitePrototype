// ========================
// Error & Problem Report Logger
// Current setup note:
// This remains local because the current Supabase schema/appStore layer does not
// expose a dedicated remote error-log document or table.
// ========================

import { safeGetItem, safeRemoveItem, safeSetJson } from "./safe-storage";

export interface ErrorLogEntry {
  id: string;
  type: "error" | "report";
  message: string;
  source: string;
  player: string;
  timestamp: string;
}

const STORAGE_KEY = "inet-error-log";
const MAX_ENTRIES = 200;
const LOG_EVENT = "inet-error-log-updated";

function getEntries(): ErrorLogEntry[] {
  try {
    const raw = safeGetItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function emitUpdate(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOG_EVENT));
  }
}

function persist(entries: ErrorLogEntry[]): void {
  try {
    safeSetJson(STORAGE_KEY, entries.slice(0, MAX_ENTRIES));
    emitUpdate();
  } catch {
    // local storage may be unavailable/full
  }
}

function now(): string {
  const d = new Date();
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function currentPlayer(): string {
  try {
    return (
      safeGetItem("inet-user") ||
      safeGetItem("inet-user-id") ||
      "Unknown"
    );
  } catch {
    return "Unknown";
  }
}

function logError(message: string, source: string): void {
  const entry: ErrorLogEntry = {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "error",
    message,
    source,
    player: currentPlayer(),
    timestamp: now(),
  };
  const entries = getEntries();
  entries.unshift(entry);
  persist(entries);
}

export function submitReport(message: string): void {
  const player = currentPlayer();
  const entry: ErrorLogEntry = {
    id: `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "report",
    message,
    source: player,
    player,
    timestamp: now(),
  };
  const entries = getEntries();
  entries.unshift(entry);
  persist(entries);
}

export function readErrorLog(): ErrorLogEntry[] {
  return getEntries();
}

export function clearErrorLog(): void {
  safeRemoveItem(STORAGE_KEY);
  emitUpdate();
}

export function removeLogEntry(id: string): void {
  const entries = getEntries().filter((entry) => entry.id !== id);
  persist(entries);
}

export function installErrorHandlers(): void {
  window.addEventListener("error", (event) => {
    const msg = event.message || "Unknown error";
    const src = event.filename
      ? `${event.filename}:${event.lineno}:${event.colno}`
      : "unknown source";
    logError(msg, src);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const msg =
      event.reason instanceof Error
        ? event.reason.message
        : typeof event.reason === "string"
          ? event.reason
          : "Unhandled promise rejection";
    const src =
      event.reason instanceof Error && event.reason.stack
        ? event.reason.stack.split("\n")[1]?.trim() || "promise"
        : "promise";
    logError(msg, src);
  });
}

export function subscribeErrorLog(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(LOG_EVENT, handler);
  return () => window.removeEventListener(LOG_EVENT, handler);
}
