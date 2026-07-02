import { ADVENTURE_DIFFICULTIES } from "./data";
import { makeId, nowIso } from "./engine";
import type { AdventurePendingReward, AdventureRewardBundle, AdventureSession } from "./types";

export function buildRewardBundle(session: AdventureSession): AdventureRewardBundle {
  const difficulty = ADVENTURE_DIFFICULTIES[session.settings?.difficulty || "standard"] || ADVENTURE_DIFFICULTIES.standard;
  const baseXp = session.outcome === "victory" ? 60 : session.outcome === "retreat" ? 25 : 15;
  const baseCurrency = session.outcome === "victory" ? 20 : session.outcome === "retreat" ? 8 : 4;
  const scale = session.settings?.rewardsEnabled === false ? 0 : difficulty.rewardScale;
  const xp = Math.round(baseXp * scale);
  const currency = Math.round(baseCurrency * scale);
  return {
    xp,
    currency,
    items: session.outcome === "victory" ? [{
      id: "minor-potion",
      name: "Minor Potion",
      description: "Restore HP to an ally in range.",
      kind: "heal",
      range: 2,
      power: 10,
      quantity: 1,
    }] : [],
    summary: `${xp} XP, ${currency} currency${session.outcome === "victory" ? ", and a supply item" : ""}`,
  };
}

export function ensurePendingRewards(session: AdventureSession): AdventureSession {
  if (session.status !== "completed" || session.phase !== "rewards") return session;
  if (session.pendingRewards.length > 0) return session;
  const reward = buildRewardBundle(session);
  return {
    ...session,
    pendingRewards: session.players.map((player): AdventurePendingReward => ({
      id: makeId("reward"),
      playerId: player.playerId,
      sessionId: session.id,
      reward,
      claimed: false,
      createdAt: nowIso(),
    })),
    updatedAt: nowIso(),
  };
}

export function markRewardClaimed(session: AdventureSession, rewardId: string): AdventureSession {
  return {
    ...session,
    pendingRewards: session.pendingRewards.map((entry) => entry.id === rewardId ? { ...entry, claimed: true, claimedAt: nowIso() } : entry),
    updatedAt: nowIso(),
  };
}
