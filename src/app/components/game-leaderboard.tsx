// Cache-bust v3
import { safeGetItem, safeSetItem, safeRemoveItem, safeSetJson } from "./safe-storage";

export interface LeaderboardEntry {
  id: string;
  gameId: string;
  gameName: string;
  player: string;
  score: number;
  date: string; // ISO string
}

const STORAGE_KEY = "inet-arcade-leaderboard";

export function getLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = safeGetItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LeaderboardEntry[];
  } catch {
    return [];
  }
}

export function saveScore(gameId: string, gameName: string, player: string, score: number): LeaderboardEntry {
  const entries = getLeaderboard();
  const entry: LeaderboardEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    gameId,
    gameName,
    player,
    score,
    date: new Date().toISOString(),
  };
  entries.push(entry);
  safeSetJson(STORAGE_KEY, entries);
  return entry;
}

export function getLeaderboardByGame(gameId: string): LeaderboardEntry[] {
  return getLeaderboard()
    .filter((e) => e.gameId === gameId)
    .sort((a, b) => b.score - a.score);
}

export function getTopScores(gameId: string, limit = 10): LeaderboardEntry[] {
  return getLeaderboardByGame(gameId).slice(0, limit);
}

export function getAllTopScores(limit = 10): LeaderboardEntry[] {
  return getLeaderboard()
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function clearLeaderboard(gameId?: string): void {
  if (gameId) {
    const entries = getLeaderboard().filter((e) => e.gameId !== gameId);
    safeSetJson(STORAGE_KEY, entries);
  } else {
    safeRemoveItem(STORAGE_KEY);
  }
}

// ========================
// Credits System
// ========================
const CREDITS_KEY = "inet-arcade-credits";

// Credit rates per game: how many score points per 1 credit
const CREDIT_RATES: Record<string, number> = {
  snake: 2,        // 1 credit per 2 score
  runner: 100,     // 1 credit per 100 score
  osu: 500,        // 1 credit per 500 score
  doodlejump: 200, // 1 credit per 200 score
  bossfight: 50,   // 1 credit per 50 score
};

// Helper: resolve the current player ID from localStorage
function getCurrentPlayerId(): string {
  return safeGetItem("inet-user-id") || "default";
}

// Per-player key builder
function playerKey(base: string, playerId?: string): string {
  const pid = playerId ?? getCurrentPlayerId();
  return `${base}-${pid}`;
}

// Migrate legacy global data → per-player on first access
function migrateGlobalCredits(pid: string): void {
  const perPlayerKey = `${CREDITS_KEY}-${pid}`;
  if (safeGetItem(perPlayerKey) !== null) return; // already migrated
  const globalRaw = safeGetItem(CREDITS_KEY);
  if (globalRaw !== null) {
    safeSetItem(perPlayerKey, globalRaw);
    safeRemoveItem(CREDITS_KEY);
  }
}

export function getCredits(playerId?: string): number {
  const pid = playerId ?? getCurrentPlayerId();
  migrateGlobalCredits(pid);
  try {
    return parseInt(safeGetItem(playerKey(CREDITS_KEY, pid)) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

export function setCreditsDirectly(amount: number, playerId?: string): void {
  const pid = playerId ?? getCurrentPlayerId();
  safeSetItem(playerKey(CREDITS_KEY, pid), String(amount));
}

export function addCredits(amount: number, playerId?: string): void {
  const pid = playerId ?? getCurrentPlayerId();
  const current = getCredits(pid);
  safeSetItem(playerKey(CREDITS_KEY, pid), String(current + amount));
}

export function spendCredits(amount: number, playerId?: string): boolean {
  const pid = playerId ?? getCurrentPlayerId();
  const current = getCredits(pid);
  if (current < amount) return false;
  safeSetItem(playerKey(CREDITS_KEY, pid), String(current - amount));
  return true;
}

// ========================
// Per-player owned items helpers
// ========================
const OWNED_COLORS_KEY = "inet-arcade-owned-colors";
const OWNED_PACKS_KEY = "inet-arcade-owned-packs";
const OWNED_STICKERS_KEY = "inet-arcade-owned-stickers";
const OWNED_MYSTERY_KEY = "inet-arcade-owned-mystery";

function migrateGlobalOwned(baseKey: string, pid: string): void {
  const perPlayerKeyStr = `${baseKey}-${pid}`;
  if (safeGetItem(perPlayerKeyStr) !== null) return;
  const globalRaw = safeGetItem(baseKey);
  if (globalRaw !== null) {
    safeSetItem(perPlayerKeyStr, globalRaw);
    safeRemoveItem(baseKey);
  }
}

function getOwnedList(baseKey: string, playerId?: string): string[] {
  const pid = playerId ?? getCurrentPlayerId();
  migrateGlobalOwned(baseKey, pid);
  try {
    const raw = safeGetItem(playerKey(baseKey, pid));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function setOwnedList(baseKey: string, list: string[], playerId?: string): void {
  const pid = playerId ?? getCurrentPlayerId();
  safeSetItem(playerKey(baseKey, pid), JSON.stringify(list));
}

function addOwned(baseKey: string, id: string, playerId?: string): void {
  const pid = playerId ?? getCurrentPlayerId();
  const list = getOwnedList(baseKey, pid);
  if (!list.includes(id)) {
    list.push(id);
    setOwnedList(baseKey, list, pid);
  }
}

// Colors
export function getOwnedColors(playerId?: string): string[] { return getOwnedList(OWNED_COLORS_KEY, playerId); }
export function setOwnedColors(list: string[], playerId?: string): void { setOwnedList(OWNED_COLORS_KEY, list, playerId); }
export function addOwnedColor(id: string, playerId?: string): void { addOwned(OWNED_COLORS_KEY, id, playerId); }

// Packs
export function getOwnedPacks(playerId?: string): string[] { return getOwnedList(OWNED_PACKS_KEY, playerId); }
export function setOwnedPacks(list: string[], playerId?: string): void { setOwnedList(OWNED_PACKS_KEY, list, playerId); }
export function addOwnedPack(id: string, playerId?: string): void { addOwned(OWNED_PACKS_KEY, id, playerId); }

// Stickers
export function getOwnedStickers(playerId?: string): string[] { return getOwnedList(OWNED_STICKERS_KEY, playerId); }
export function setOwnedStickers(list: string[], playerId?: string): void { setOwnedList(OWNED_STICKERS_KEY, list, playerId); }
export function addOwnedSticker(id: string, playerId?: string): void { addOwned(OWNED_STICKERS_KEY, id, playerId); }

// Mystery
export function getOwnedMystery(playerId?: string): string[] { return getOwnedList(OWNED_MYSTERY_KEY, playerId); }
export function setOwnedMystery(list: string[], playerId?: string): void { setOwnedList(OWNED_MYSTERY_KEY, list, playerId); }
export function addOwnedMystery(id: string, playerId?: string): void { addOwned(OWNED_MYSTERY_KEY, id, playerId); }

// Sounds
const OWNED_SOUNDS_KEY = "inet-arcade-owned-sounds";
export function getOwnedSounds(playerId?: string): string[] { return getOwnedList(OWNED_SOUNDS_KEY, playerId); }
export function setOwnedSounds(list: string[], playerId?: string): void { setOwnedList(OWNED_SOUNDS_KEY, list, playerId); }
export function addOwnedSound(id: string, playerId?: string): void { addOwned(OWNED_SOUNDS_KEY, id, playerId); }

export function scoreToCredits(gameId: string, score: number): number {
  const rate = CREDIT_RATES[gameId] || 100;
  return Math.floor(score / rate);
}