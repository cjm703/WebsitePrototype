import { ADVENTURE_CLASSES } from "./data";
import { nowIso } from "./engine";
import type { AdventureClassId, AdventureItem, AdventureProfile, AdventureProfileStats, AdventureRewardBundle } from "./types";

const emptyStats = (): AdventureProfileStats => ({
  sessionsPlayed: 0,
  victories: 0,
  defeats: 0,
  retreats: 0,
  enemiesDefeated: 0,
  damageDealt: 0,
  damageTaken: 0,
});

export function xpForLevel(level: number) {
  return Math.max(0, (level - 1) * 100);
}

export function levelFromXp(xp: number) {
  return Math.max(1, Math.floor(Math.max(0, xp) / 100) + 1);
}

export function createAdventureProfile(playerId: string, playerName: string, preferredClassId: AdventureClassId = "warrior"): AdventureProfile {
  const classDef = ADVENTURE_CLASSES[preferredClassId] || ADVENTURE_CLASSES.warrior;
  return {
    playerId,
    playerName: playerName || "Player",
    preferredClassId,
    level: 1,
    xp: 0,
    currency: 0,
    inventory: classDef.inventory.map((item) => ({ ...item })),
    unlockedAbilityIds: classDef.abilities.map((ability) => ability.id),
    completedSessionIds: [],
    claimedRewardIds: [],
    stats: emptyStats(),
    updatedAt: nowIso(),
  };
}

export function normalizeAdventureProfile(value: unknown, playerId: string, playerName: string, preferredClassId: AdventureClassId = "warrior"): AdventureProfile {
  const base = createAdventureProfile(playerId, playerName, preferredClassId);
  const raw = (value && typeof value === "object" ? value : {}) as Partial<AdventureProfile>;
  const xp = Math.max(0, Number(raw.xp ?? base.xp) || 0);
  return {
    ...base,
    ...raw,
    playerId,
    playerName: String(raw.playerName || playerName || base.playerName),
    preferredClassId: (raw.preferredClassId || preferredClassId || base.preferredClassId) as AdventureClassId,
    level: levelFromXp(xp),
    xp,
    currency: Math.max(0, Number(raw.currency ?? base.currency) || 0),
    inventory: Array.isArray(raw.inventory) ? raw.inventory : base.inventory,
    unlockedAbilityIds: Array.isArray(raw.unlockedAbilityIds) ? raw.unlockedAbilityIds : base.unlockedAbilityIds,
    completedSessionIds: Array.isArray(raw.completedSessionIds) ? raw.completedSessionIds : [],
    claimedRewardIds: Array.isArray(raw.claimedRewardIds) ? raw.claimedRewardIds : [],
    stats: { ...base.stats, ...(raw.stats || {}) },
    updatedAt: raw.updatedAt || nowIso(),
  };
}

function mergeInventory(inventory: AdventureItem[], rewards: AdventureItem[]) {
  const merged = inventory.map((item) => ({ ...item }));
  for (const item of rewards) {
    const existing = merged.find((entry) => entry.id === item.id);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

export function applyRewardToProfile(profile: AdventureProfile, rewardId: string, sessionId: string, outcome: string | undefined, reward: AdventureRewardBundle): AdventureProfile {
  if (profile.claimedRewardIds.includes(rewardId)) return profile;
  const nextXp = Math.max(0, profile.xp + reward.xp);
  return {
    ...profile,
    xp: nextXp,
    level: levelFromXp(nextXp),
    currency: Math.max(0, profile.currency + reward.currency),
    inventory: mergeInventory(profile.inventory, reward.items),
    completedSessionIds: profile.completedSessionIds.includes(sessionId) ? profile.completedSessionIds : [...profile.completedSessionIds, sessionId],
    claimedRewardIds: [...profile.claimedRewardIds, rewardId],
    stats: {
      ...profile.stats,
      sessionsPlayed: profile.stats.sessionsPlayed + 1,
      victories: profile.stats.victories + (outcome === "victory" ? 1 : 0),
      defeats: profile.stats.defeats + (outcome === "defeat" ? 1 : 0),
      retreats: profile.stats.retreats + (outcome === "retreat" ? 1 : 0),
    },
    updatedAt: nowIso(),
  };
}
