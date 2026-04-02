import { safeGetItem, safeSetItem, safeRemoveItem, safeSetJson } from "./safe-storage";
import { appStore } from "@/lib/app-store";

export interface LeaderboardEntry {
  id: string;
  gameId: string;
  gameName: string;
  player: string;
  score: number;
  date: string;
}

interface ArcadeProfile {
  credits: number;
  ownedColors: string[];
  ownedPacks: string[];
  ownedStickers: string[];
  ownedMystery: string[];
  ownedSounds: string[];
}

interface LeaderboardDoc {
  entries: LeaderboardEntry[];
}

const STORAGE_KEY = "inet-arcade-leaderboard";
const CREDITS_KEY = "inet-arcade-credits";
const OWNED_COLORS_KEY = "inet-arcade-owned-colors";
const OWNED_PACKS_KEY = "inet-arcade-owned-packs";
const OWNED_STICKERS_KEY = "inet-arcade-owned-stickers";
const OWNED_MYSTERY_KEY = "inet-arcade-owned-mystery";
const OWNED_SOUNDS_KEY = "inet-arcade-owned-sounds";
const CREDIT_RATES: Record<string, number> = {
  snake: 2,
  runner: 100,
  osu: 500,
  doodlejump: 200,
  bossfight: 50,
};

const profileCache = new Map<string, ArcadeProfile>();
let leaderboardCache: LeaderboardEntry[] | null = null;
const profileHydrating = new Set<string>();
let leaderboardHydrating = false;

function getCurrentPlayerId(): string {
  return safeGetItem("inet-user-id") || "default";
}
function playerKey(base: string, playerId?: string): string {
  return `${base}-${playerId ?? getCurrentPlayerId()}`;
}
function defaultProfile(): ArcadeProfile {
  return { credits: 0, ownedColors: [], ownedPacks: [], ownedStickers: [], ownedMystery: [], ownedSounds: [] };
}
function normalizeProfile(raw: Partial<ArcadeProfile> | null | undefined): ArcadeProfile {
  const f = defaultProfile();
  return {
    credits: typeof raw?.credits === 'number' ? raw.credits : f.credits,
    ownedColors: Array.isArray(raw?.ownedColors) ? [...raw.ownedColors] : f.ownedColors,
    ownedPacks: Array.isArray(raw?.ownedPacks) ? [...raw.ownedPacks] : f.ownedPacks,
    ownedStickers: Array.isArray(raw?.ownedStickers) ? [...raw.ownedStickers] : f.ownedStickers,
    ownedMystery: Array.isArray(raw?.ownedMystery) ? [...raw.ownedMystery] : f.ownedMystery,
    ownedSounds: Array.isArray(raw?.ownedSounds) ? [...raw.ownedSounds] : f.ownedSounds,
  };
}
function readLocalProfile(playerId?: string): ArcadeProfile {
  const pid = playerId ?? getCurrentPlayerId();
  if (profileCache.has(pid)) return normalizeProfile(profileCache.get(pid));
  try {
    const legacyCredits = parseInt(safeGetItem(playerKey(CREDITS_KEY, pid)) || '0', 10) || 0;
    const readList = (key: string) => {
      const raw = safeGetItem(playerKey(key, pid));
      return raw ? JSON.parse(raw) : [];
    };
    const profile = normalizeProfile({
      credits: legacyCredits,
      ownedColors: readList(OWNED_COLORS_KEY),
      ownedPacks: readList(OWNED_PACKS_KEY),
      ownedStickers: readList(OWNED_STICKERS_KEY),
      ownedMystery: readList(OWNED_MYSTERY_KEY),
      ownedSounds: readList(OWNED_SOUNDS_KEY),
    });
    profileCache.set(pid, profile);
    return profile;
  } catch {
    const profile = defaultProfile();
    profileCache.set(pid, profile);
    return profile;
  }
}
function persistLocalProfile(pid: string, profile: ArcadeProfile): void {
  profileCache.set(pid, normalizeProfile(profile));
  safeSetItem(playerKey(CREDITS_KEY, pid), String(profile.credits));
  safeSetJson(playerKey(OWNED_COLORS_KEY, pid), profile.ownedColors);
  safeSetJson(playerKey(OWNED_PACKS_KEY, pid), profile.ownedPacks);
  safeSetJson(playerKey(OWNED_STICKERS_KEY, pid), profile.ownedStickers);
  safeSetJson(playerKey(OWNED_MYSTERY_KEY, pid), profile.ownedMystery);
  safeSetJson(playerKey(OWNED_SOUNDS_KEY, pid), profile.ownedSounds);
}
async function hydrateProfile(pid: string): Promise<void> {
  if (profileHydrating.has(pid)) return;
  profileHydrating.add(pid);
  try {
    const remote = await appStore.loadPlayerArcadeProfile<ArcadeProfile | null>(pid, null);
    if (remote) persistLocalProfile(pid, normalizeProfile(remote));
  } catch {}
  finally { profileHydrating.delete(pid); }
}
function saveProfileRemote(pid: string): void {
  const profile = readLocalProfile(pid);
  void appStore.savePlayerArcadeProfile(pid, profile).catch(() => {});
}
function readLocalLeaderboard(): LeaderboardEntry[] {
  if (leaderboardCache) return [...leaderboardCache];
  try {
    const raw = safeGetItem(STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) as LeaderboardEntry[] : [];
    leaderboardCache = Array.isArray(entries) ? entries : [];
  } catch { leaderboardCache = []; }
  return [...leaderboardCache!];
}
function persistLocalLeaderboard(entries: LeaderboardEntry[]): void {
  leaderboardCache = [...entries];
  safeSetJson(STORAGE_KEY, entries);
}
async function hydrateLeaderboard(): Promise<void> {
  if (leaderboardHydrating) return;
  leaderboardHydrating = true;
  try {
    const remote = await appStore.loadArcadeLeaderboardState<LeaderboardDoc>({ entries: [] });
    persistLocalLeaderboard(Array.isArray(remote?.entries) ? remote.entries : []);
  } catch {}
  finally { leaderboardHydrating = false; }
}
function saveLeaderboardRemote(entries: LeaderboardEntry[]): void {
  persistLocalLeaderboard(entries);
  void appStore.saveArcadeLeaderboardState<LeaderboardDoc>({ entries }).catch(() => {});
}

export function getLeaderboard(): LeaderboardEntry[] {
  void hydrateLeaderboard();
  return readLocalLeaderboard();
}
export function saveScore(gameId: string, gameName: string, player: string, score: number): LeaderboardEntry {
  const entries = getLeaderboard();
  const entry: LeaderboardEntry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, gameId, gameName, player, score, date: new Date().toISOString() };
  entries.push(entry);
  saveLeaderboardRemote(entries);
  return entry;
}
export function getLeaderboardByGame(gameId: string): LeaderboardEntry[] {
  return getLeaderboard().filter((e) => e.gameId === gameId).sort((a, b) => b.score - a.score);
}
export function getTopScores(gameId: string, limit = 10): LeaderboardEntry[] {
  return getLeaderboardByGame(gameId).slice(0, limit);
}
export function getAllTopScores(limit = 10): LeaderboardEntry[] {
  return getLeaderboard().sort((a, b) => b.score - a.score).slice(0, limit);
}
export function clearLeaderboard(gameId?: string): void {
  if (gameId) saveLeaderboardRemote(getLeaderboard().filter((e) => e.gameId !== gameId));
  else saveLeaderboardRemote([]);
}
export function getCredits(playerId?: string): number {
  const pid = playerId ?? getCurrentPlayerId();
  void hydrateProfile(pid);
  return readLocalProfile(pid).credits;
}
export function setCreditsDirectly(amount: number, playerId?: string): void {
  const pid = playerId ?? getCurrentPlayerId();
  const next = { ...readLocalProfile(pid), credits: amount };
  persistLocalProfile(pid, next);
  saveProfileRemote(pid);
}
export function addCredits(amount: number, playerId?: string): void {
  setCreditsDirectly(getCredits(playerId) + amount, playerId);
}
export function spendCredits(amount: number, playerId?: string): boolean {
  const current = getCredits(playerId);
  if (current < amount) return false;
  setCreditsDirectly(current - amount, playerId);
  return true;
}
function getOwnedList(key: keyof ArcadeProfile, playerId?: string): string[] {
  const pid = playerId ?? getCurrentPlayerId();
  void hydrateProfile(pid);
  return [...readLocalProfile(pid)[key] as string[]];
}
function setOwnedList(key: keyof ArcadeProfile, list: string[], playerId?: string): void {
  const pid = playerId ?? getCurrentPlayerId();
  const next = { ...readLocalProfile(pid), [key]: [...list] } as ArcadeProfile;
  persistLocalProfile(pid, next);
  saveProfileRemote(pid);
}
function addOwned(key: keyof ArcadeProfile, id: string, playerId?: string): void {
  const list = getOwnedList(key, playerId);
  if (!list.includes(id)) {
    list.push(id);
    setOwnedList(key, list, playerId);
  }
}
export function getOwnedColors(playerId?: string): string[] { return getOwnedList('ownedColors', playerId); }
export function setOwnedColors(list: string[], playerId?: string): void { setOwnedList('ownedColors', list, playerId); }
export function addOwnedColor(id: string, playerId?: string): void { addOwned('ownedColors', id, playerId); }
export function getOwnedPacks(playerId?: string): string[] { return getOwnedList('ownedPacks', playerId); }
export function setOwnedPacks(list: string[], playerId?: string): void { setOwnedList('ownedPacks', list, playerId); }
export function addOwnedPack(id: string, playerId?: string): void { addOwned('ownedPacks', id, playerId); }
export function getOwnedStickers(playerId?: string): string[] { return getOwnedList('ownedStickers', playerId); }
export function setOwnedStickers(list: string[], playerId?: string): void { setOwnedList('ownedStickers', list, playerId); }
export function addOwnedSticker(id: string, playerId?: string): void { addOwned('ownedStickers', id, playerId); }
export function getOwnedMystery(playerId?: string): string[] { return getOwnedList('ownedMystery', playerId); }
export function setOwnedMystery(list: string[], playerId?: string): void { setOwnedList('ownedMystery', list, playerId); }
export function addOwnedMystery(id: string, playerId?: string): void { addOwned('ownedMystery', id, playerId); }
export function getOwnedSounds(playerId?: string): string[] { return getOwnedList('ownedSounds', playerId); }
export function setOwnedSounds(list: string[], playerId?: string): void { setOwnedList('ownedSounds', list, playerId); }
export function addOwnedSound(id: string, playerId?: string): void { addOwned('ownedSounds', id, playerId); }
export function scoreToCredits(gameId: string, score: number): number { const rate = CREDIT_RATES[gameId] || 100; return Math.floor(score / rate); }
