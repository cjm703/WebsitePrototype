import { safeGetItem } from "./safe-storage";
import { appStore } from "@/lib/app-store";

export interface LeaderboardEntry {
  id: string;
  gameId: string;
  gameName: string;
  player: string;
  score: number;
  date: string;
}

export interface ArcadeProfile {
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

const LEGACY_STORAGE_KEY = "inet-arcade-leaderboard";
const LEGACY_CREDITS_KEY = "inet-arcade-credits";
const LEGACY_OWNED_COLORS_KEY = "inet-arcade-owned-colors";
const LEGACY_OWNED_PACKS_KEY = "inet-arcade-owned-packs";
const LEGACY_OWNED_STICKERS_KEY = "inet-arcade-owned-stickers";
const LEGACY_OWNED_MYSTERY_KEY = "inet-arcade-owned-mystery";
const LEGACY_OWNED_SOUNDS_KEY = "inet-arcade-owned-sounds";
const CREDIT_RATES: Record<string, number> = {
  snake: 2,
  runner: 100,
  osu: 500,
  doodlejump: 200,
  bossfight: 50,
  adventure: 100,
};

const profileCache = new Map<string, ArcadeProfile>();
let leaderboardCache: LeaderboardEntry[] | null = null;
const profileHydrating = new Set<string>();
let leaderboardHydrating = false;

const PROFILE_EVENT = "inet-arcade-profile-updated";
const LEADERBOARD_EVENT = "inet-arcade-leaderboard-updated";

function emitProfileUpdate(playerId: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: { playerId } }));
  }
}

function emitLeaderboardUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LEADERBOARD_EVENT));
  }
}

function getCurrentPlayerId(): string {
  return safeGetItem("inet-user-id") || "default";
}

function playerKey(base: string, playerId?: string): string {
  return `${base}-${playerId || getCurrentPlayerId()}`;
}

function defaultProfile(): ArcadeProfile {
  return {
    credits: 0,
    ownedColors: [],
    ownedPacks: [],
    ownedStickers: [],
    ownedMystery: [],
    ownedSounds: [],
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function normalizeProfile(raw: Partial<ArcadeProfile> | null | undefined): ArcadeProfile {
  const fallback = defaultProfile();
  return {
    credits: typeof raw?.credits === "number" && Number.isFinite(raw.credits) ? raw.credits : fallback.credits,
    ownedColors: normalizeStringArray(raw?.ownedColors),
    ownedPacks: normalizeStringArray(raw?.ownedPacks),
    ownedStickers: normalizeStringArray(raw?.ownedStickers),
    ownedMystery: normalizeStringArray(raw?.ownedMystery),
    ownedSounds: normalizeStringArray(raw?.ownedSounds),
  };
}

function hasProfileData(profile: ArcadeProfile): boolean {
  return (
    profile.credits !== 0 ||
    profile.ownedColors.length > 0 ||
    profile.ownedPacks.length > 0 ||
    profile.ownedStickers.length > 0 ||
    profile.ownedMystery.length > 0 ||
    profile.ownedSounds.length > 0
  );
}

function readLegacyList(base: string, playerId: string): string[] {
  try {
    const raw = safeGetItem(playerKey(base, playerId));
    return raw ? normalizeStringArray(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function seedProfileFromLegacy(playerId: string): ArcadeProfile {
  if (profileCache.has(playerId)) {
    return normalizeProfile(profileCache.get(playerId));
  }
  let legacyCredits = 0;
  try {
    legacyCredits = parseInt(safeGetItem(playerKey(LEGACY_CREDITS_KEY, playerId)) || "0", 10) || 0;
  } catch {
    legacyCredits = 0;
  }
  const profile = normalizeProfile({
    credits: legacyCredits,
    ownedColors: readLegacyList(LEGACY_OWNED_COLORS_KEY, playerId),
    ownedPacks: readLegacyList(LEGACY_OWNED_PACKS_KEY, playerId),
    ownedStickers: readLegacyList(LEGACY_OWNED_STICKERS_KEY, playerId),
    ownedMystery: readLegacyList(LEGACY_OWNED_MYSTERY_KEY, playerId),
    ownedSounds: readLegacyList(LEGACY_OWNED_SOUNDS_KEY, playerId),
  });
  profileCache.set(playerId, profile);
  return profile;
}

function setProfileCache(playerId: string, profile: Partial<ArcadeProfile> | null | undefined): ArcadeProfile {
  const normalized = normalizeProfile(profile);
  profileCache.set(playerId, normalized);
  emitProfileUpdate(playerId);
  return normalized;
}

async function hydrateProfile(playerId: string): Promise<void> {
  if (profileHydrating.has(playerId)) return;
  profileHydrating.add(playerId);
  try {
    const remote = await appStore.loadPlayerArcadeProfile<ArcadeProfile | null>(playerId, null);
    if (remote) {
      setProfileCache(playerId, remote);
      return;
    }
    const legacy = seedProfileFromLegacy(playerId);
    if (hasProfileData(legacy)) {
      await appStore.savePlayerArcadeProfile(playerId, legacy).catch(() => {});
    }
  } catch {
    seedProfileFromLegacy(playerId);
  } finally {
    profileHydrating.delete(playerId);
  }
}

function saveProfileRemote(playerId: string): void {
  const profile = seedProfileFromLegacy(playerId);
  void appStore.savePlayerArcadeProfile(playerId, profile).catch(() => {});
}

function readLegacyLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = safeGetItem(LEGACY_STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function getLeaderboardSnapshot(): LeaderboardEntry[] {
  if (!leaderboardCache) {
    leaderboardCache = readLegacyLeaderboard();
  }
  return [...leaderboardCache];
}

function setLeaderboardCache(entries: LeaderboardEntry[]): void {
  leaderboardCache = Array.isArray(entries) ? [...entries] : [];
  emitLeaderboardUpdate();
}

async function hydrateLeaderboard(): Promise<void> {
  if (leaderboardHydrating) return;
  leaderboardHydrating = true;
  try {
    const remote = await appStore.loadArcadeLeaderboardState<LeaderboardDoc>({ entries: [] });
    const remoteEntries = Array.isArray(remote?.entries) ? remote.entries : [];
    if (remoteEntries.length > 0) {
      setLeaderboardCache(remoteEntries);
      return;
    }
    const legacy = getLeaderboardSnapshot();
    if (legacy.length > 0) {
      await appStore.saveArcadeLeaderboardState<LeaderboardDoc>({ entries: legacy }).catch(() => {});
    }
  } catch {
    getLeaderboardSnapshot();
  } finally {
    leaderboardHydrating = false;
  }
}

function saveLeaderboardRemote(entries: LeaderboardEntry[]): void {
  setLeaderboardCache(entries);
  void appStore.saveArcadeLeaderboardState<LeaderboardDoc>({ entries }).catch(() => {});
}

export function subscribeArcadeProfile(listener: () => void, playerId?: string): () => void {
  const pid = playerId || getCurrentPlayerId();
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ playerId?: string }>).detail;
    if (!detail?.playerId || detail.playerId === pid) listener();
  };
  if (typeof window !== "undefined") {
    window.addEventListener(PROFILE_EVENT, handler as EventListener);
  }
  void hydrateProfile(pid);
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener(PROFILE_EVENT, handler as EventListener);
    }
  };
}

export function subscribeArcadeLeaderboard(listener: () => void): () => void {
  if (typeof window !== "undefined") {
    window.addEventListener(LEADERBOARD_EVENT, listener as EventListener);
  }
  void hydrateLeaderboard();
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener(LEADERBOARD_EVENT, listener as EventListener);
    }
  };
}

export function getLeaderboard(): LeaderboardEntry[] {
  void hydrateLeaderboard();
  return getLeaderboardSnapshot();
}

export function saveScore(gameId: string, gameName: string, player: string, score: number): LeaderboardEntry {
  const entries = getLeaderboardSnapshot();
  const entry: LeaderboardEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    gameId,
    gameName,
    player,
    score,
    date: new Date().toISOString(),
  };
  entries.push(entry);
  saveLeaderboardRemote(entries);
  return entry;
}

export function getLeaderboardByGame(gameId: string): LeaderboardEntry[] {
  return getLeaderboard().filter((entry) => entry.gameId === gameId).sort((a, b) => b.score - a.score);
}

export function getTopScores(gameId: string, limit = 10): LeaderboardEntry[] {
  return getLeaderboardByGame(gameId).slice(0, limit);
}

export function getAllTopScores(limit = 10): LeaderboardEntry[] {
  return getLeaderboard().sort((a, b) => b.score - a.score).slice(0, limit);
}

export function clearLeaderboard(gameId?: string): void {
  if (gameId) {
    saveLeaderboardRemote(getLeaderboardSnapshot().filter((entry) => entry.gameId !== gameId));
  } else {
    saveLeaderboardRemote([]);
  }
}

function getProfileSnapshot(playerId?: string): ArcadeProfile {
  const pid = playerId || getCurrentPlayerId();
  void hydrateProfile(pid);
  return seedProfileFromLegacy(pid);
}

export function getCredits(playerId?: string): number {
  return getProfileSnapshot(playerId).credits;
}

export function setCreditsDirectly(amount: number, playerId?: string): void {
  const pid = playerId || getCurrentPlayerId();
  const next = { ...getProfileSnapshot(pid), credits: amount };
  setProfileCache(pid, next);
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
  return [...(getProfileSnapshot(playerId)[key] as string[])];
}

function setOwnedList(key: keyof ArcadeProfile, list: string[], playerId?: string): void {
  const pid = playerId || getCurrentPlayerId();
  const next = { ...getProfileSnapshot(pid), [key]: [...list] } as ArcadeProfile;
  setProfileCache(pid, next);
  saveProfileRemote(pid);
}

function addOwned(key: keyof ArcadeProfile, id: string, playerId?: string): void {
  const list = getOwnedList(key, playerId);
  if (!list.includes(id)) {
    list.push(id);
    setOwnedList(key, list, playerId);
  }
}

export function getOwnedColors(playerId?: string): string[] { return getOwnedList("ownedColors", playerId); }
export function setOwnedColors(list: string[], playerId?: string): void { setOwnedList("ownedColors", list, playerId); }
export function addOwnedColor(id: string, playerId?: string): void { addOwned("ownedColors", id, playerId); }
export function getOwnedPacks(playerId?: string): string[] { return getOwnedList("ownedPacks", playerId); }
export function setOwnedPacks(list: string[], playerId?: string): void { setOwnedList("ownedPacks", list, playerId); }
export function addOwnedPack(id: string, playerId?: string): void { addOwned("ownedPacks", id, playerId); }
export function getOwnedStickers(playerId?: string): string[] { return getOwnedList("ownedStickers", playerId); }
export function setOwnedStickers(list: string[], playerId?: string): void { setOwnedList("ownedStickers", list, playerId); }
export function addOwnedSticker(id: string, playerId?: string): void { addOwned("ownedStickers", id, playerId); }
export function getOwnedMystery(playerId?: string): string[] { return getOwnedList("ownedMystery", playerId); }
export function setOwnedMystery(list: string[], playerId?: string): void { setOwnedList("ownedMystery", list, playerId); }
export function addOwnedMystery(id: string, playerId?: string): void { addOwned("ownedMystery", id, playerId); }
export function getOwnedSounds(playerId?: string): string[] { return getOwnedList("ownedSounds", playerId); }
export function setOwnedSounds(list: string[], playerId?: string): void { setOwnedList("ownedSounds", list, playerId); }
export function addOwnedSound(id: string, playerId?: string): void { addOwned("ownedSounds", id, playerId); }

export function scoreToCredits(gameId: string, score: number): number {
  const rate = CREDIT_RATES[gameId] || 100;
  return Math.floor(score / rate);
}
