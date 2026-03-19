// ========================
// Error & Problem Report Logger
// Catches unhandled JS errors and unhandled promise rejections,
// and provides a function for players to submit manual reports.
// All entries are persisted to localStorage under "inet-error-log".
// Cache-bust v3
// ========================

export interface ErrorLogEntry {
  id: string;
  type: "error" | "report";
  message: string;
  source: string; // file:line for errors, player name for reports
  player: string; // which user was logged in at the time
  timestamp: string;
}

const STORAGE_KEY = "inet-error-log";
const MAX_ENTRIES = 200;
import { safeGetItem, safeSetItem, safeRemoveItem, safeSetJson } from "./safe-storage";

function getEntries(): ErrorLogEntry[] {
  try {
    const raw = safeGetItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(entries: ErrorLogEntry[]): void {
  try {
    safeSetJson(STORAGE_KEY, entries.slice(0, MAX_ENTRIES));
  } catch {
    // localStorage might be full — silently fail
  }
}

function now(): string {
  const d = new Date();
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function currentPlayer(): string {
  try {
    return safeGetItem("inet-user") || "Unknown";
  } catch {
    return "Unknown";
  }
}

/** Add an auto-caught error entry */
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

/** Add a player-submitted problem report */
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

/** Read all log entries (for DM Area) */
export function readErrorLog(): ErrorLogEntry[] {
  return getEntries();
}

/** Clear all log entries */
export function clearErrorLog(): void {
  safeRemoveItem(STORAGE_KEY);
}

/** Remove a single entry by id */
export function removeLogEntry(id: string): void {
  const entries = getEntries().filter((e) => e.id !== id);
  persist(entries);
}

/** Install global error handlers. Call once at app startup. */
export function installErrorHandlers(): void {
  // Unhandled JS errors
  window.addEventListener("error", (event) => {
    const msg = event.message || "Unknown error";
    const src = event.filename
      ? `${event.filename}:${event.lineno}:${event.colno}`
      : "unknown source";
    logError(msg, src);
  });

  // Unhandled promise rejections
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