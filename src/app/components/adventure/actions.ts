import { ADVENTURE_CLASSES, ADVENTURE_OBJECTIVES, DEFAULT_ENCOUNTER_SETTINGS } from "./data";
import {
  abandonSession,
  advanceTurn,
  basicAttack,
  blockWithActivePlayer,
  joinAdventureSession,
  makeId,
  nowIso,
  setPlayerClass,
  setPlayerReady,
  startAdventureEncounter,
  useAbility,
  useItem,
  voteToFlee,
  moveActivePlayer,
} from "./engine";
import { createAdventureProfile, normalizeAdventureProfile, applyRewardToProfile } from "./profile";
import { ensurePendingRewards, markRewardClaimed } from "./rewards";
import type {
  AdventureActionRecord,
  AdventureActionRequest,
  AdventureActionResult,
  AdventureEncounterSettings,
  AdventureProfilesByPlayer,
  AdventureSession,
} from "./types";

function actionSummary(request: AdventureActionRequest) {
  switch (request.type) {
    case "join": return "joined the room";
    case "set_class": return "changed class";
    case "set_ready": return request.payload.ready ? "readied up" : "unreadied";
    case "configure": return "updated encounter setup";
    case "start": return "started the encounter";
    case "move": return "moved";
    case "basic_attack": return "used a basic attack";
    case "ability": return "used an ability";
    case "item": return "used an item";
    case "block": return "blocked";
    case "vote_flee": return "voted to flee";
    case "end_turn": return "ended turn";
    case "skip_turn": return "skipped a turn";
    case "abandon": return "abandoned the room";
    case "reset_to_lobby": return "reset the room";
    case "close": return "closed the room";
    case "claim_rewards": return "claimed rewards";
    default: return "acted";
  }
}

function pushActionRecord(session: AdventureSession, request: AdventureActionRequest): AdventureSession {
  const record: AdventureActionRecord = {
    id: request.id,
    at: nowIso(),
    actorId: request.actorId,
    type: request.type,
    summary: actionSummary(request),
  };
  return {
    ...session,
    actionHistory: [record, ...(session.actionHistory || [])].slice(0, 100),
    lastResolvedActionId: request.id,
  };
}

function bump(session: AdventureSession, request: AdventureActionRequest): AdventureSession {
  return pushActionRecord({
    ...ensurePendingRewards(session),
    version: (session.version || 1) + 1,
    updatedAt: nowIso(),
  }, request);
}

function reject(session: AdventureSession, profiles: AdventureProfilesByPlayer, reason: string): AdventureActionResult {
  return { ok: false, session, profiles, reason };
}

function ok(session: AdventureSession, profiles: AdventureProfilesByPlayer): AdventureActionResult {
  return { ok: true, session, profiles };
}

function isHost(session: AdventureSession, actorId: string) {
  return session.hostPlayerId === actorId;
}

function activePlayerForActor(session: AdventureSession, actorId: string) {
  const activeId = session.turnOrder[session.activeTurnIndex] || "";
  return session.players.find((player) => player.id === activeId && player.playerId === actorId && player.hp > 0) || null;
}

function applyConfigure(session: AdventureSession, settings: Partial<AdventureEncounterSettings> & { name?: string }): AdventureSession {
  const nextSettings: AdventureEncounterSettings = {
    ...DEFAULT_ENCOUNTER_SETTINGS,
    ...(session.settings || {}),
    ...settings,
  };
  const objective = ADVENTURE_OBJECTIVES[nextSettings.objectiveType] || ADVENTURE_OBJECTIVES.defeat_all;
  return {
    ...session,
    name: settings.name?.trim() || session.name,
    mapSize: nextSettings.mapSize,
    theme: nextSettings.theme,
    settings: nextSettings,
    objective: { ...objective, completed: false },
    updatedAt: nowIso(),
  };
}

function resetToLobby(session: AdventureSession): AdventureSession {
  return {
    ...session,
    status: "lobby",
    phase: "setup",
    outcome: undefined,
    map: null,
    enemies: [],
    turnOrder: [],
    activeTurnIndex: 0,
    round: 1,
    fleeVotes: [],
    pendingRewards: [],
    players: session.players.map((player) => {
      const classDef = ADVENTURE_CLASSES[player.classId] || ADVENTURE_CLASSES.warrior;
      return {
        ...player,
        hp: classDef.maxHp,
        maxHp: classDef.maxHp,
        position: { x: 1, y: 1 },
        ready: false,
        moveRemaining: classDef.move,
        actionTaken: false,
        blockActive: false,
        marked: false,
        abilities: classDef.abilities.map((ability) => ({ ...ability })),
        inventory: classDef.inventory.map((item) => ({ ...item })),
      };
    }),
    updatedAt: nowIso(),
  };
}

function closeSession(session: AdventureSession): AdventureSession {
  return {
    ...session,
    phase: "closed",
    status: session.status === "playing" ? "abandoned" : session.status,
    updatedAt: nowIso(),
  };
}

function skipActiveTurn(session: AdventureSession): AdventureSession {
  if (session.status !== "playing") return session;
  return advanceTurn(session);
}

function ensureProfile(profiles: AdventureProfilesByPlayer, playerId: string, playerName: string, classId: string): AdventureProfilesByPlayer {
  return {
    ...profiles,
    [playerId]: normalizeAdventureProfile(profiles[playerId], playerId, playerName, (classId || "warrior") as any),
  };
}

function claimRewards(session: AdventureSession, profiles: AdventureProfilesByPlayer, playerId: string): { session: AdventureSession; profiles: AdventureProfilesByPlayer; claimed: boolean } {
  let nextSession = ensurePendingRewards(session);
  const reward = nextSession.pendingRewards.find((entry) => entry.playerId === playerId && !entry.claimed);
  if (!reward) return { session: nextSession, profiles, claimed: false };
  const player = nextSession.players.find((entry) => entry.playerId === playerId);
  const currentProfile = normalizeAdventureProfile(profiles[playerId], playerId, player?.playerName || "Player", player?.classId || "warrior");
  const nextProfile = applyRewardToProfile(currentProfile, reward.id, nextSession.id, nextSession.outcome, reward.reward);
  nextSession = markRewardClaimed(nextSession, reward.id);
  return {
    session: nextSession,
    profiles: { ...profiles, [playerId]: nextProfile },
    claimed: true,
  };
}

export function makeAdventureAction(
  session: AdventureSession,
  actorId: string,
  type: AdventureActionRequest["type"],
  extras: Omit<AdventureActionRequest, "id" | "sessionId" | "actorId" | "actorKind" | "type" | "expectedVersion"> = {} as any,
): AdventureActionRequest {
  return {
    ...(extras as any),
    id: makeId("act"),
    sessionId: session.id,
    actorId,
    actorKind: actorId === session.hostPlayerId ? "host" : "player",
    type,
    expectedVersion: session.version,
  } as AdventureActionRequest;
}

export function resolveAdventureAction(
  session: AdventureSession,
  request: AdventureActionRequest,
  profiles: AdventureProfilesByPlayer,
): AdventureActionResult {
  if (!session || session.id !== request.sessionId) return reject(session, profiles, "Session mismatch.");
  if (request.expectedVersion != null && session.version !== request.expectedVersion) {
    return reject(session, profiles, "This room changed before your action resolved. Reloaded the latest room state.");
  }
  if (session.lastResolvedActionId === request.id) return ok(session, profiles);

  let nextProfiles = profiles;
  let nextSession = session;

  switch (request.type) {
    case "join": {
      if (session.status !== "lobby") return reject(session, profiles, "This room has already started.");
      if (session.players.length >= (session.settings?.maxPlayers || DEFAULT_ENCOUNTER_SETTINGS.maxPlayers) && !session.players.some((player) => player.playerId === request.actorId)) {
        return reject(session, profiles, "This room is full.");
      }
      nextSession = joinAdventureSession(session, request.actorId, request.payload.playerName, request.payload.classId);
      nextProfiles = ensureProfile(profiles, request.actorId, request.payload.playerName, request.payload.classId);
      break;
    }
    case "set_class": {
      if (session.status !== "lobby") return reject(session, profiles, "Class can only be changed before the encounter starts.");
      nextSession = setPlayerClass(session, request.actorId, request.payload.classId);
      const player = nextSession.players.find((entry) => entry.playerId === request.actorId);
      nextProfiles = ensureProfile(profiles, request.actorId, player?.playerName || "Player", request.payload.classId);
      nextProfiles[request.actorId] = { ...nextProfiles[request.actorId], preferredClassId: request.payload.classId, updatedAt: nowIso() };
      break;
    }
    case "set_ready": {
      if (session.status !== "lobby") return reject(session, profiles, "Ready state can only change in setup.");
      if (!session.players.some((player) => player.playerId === request.actorId)) return reject(session, profiles, "Join the room first.");
      nextSession = setPlayerReady(session, request.actorId, request.payload.ready);
      break;
    }
    case "configure": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can configure the encounter.");
      if (session.status !== "lobby") return reject(session, profiles, "Encounter settings are locked after start.");
      nextSession = applyConfigure(session, request.payload);
      break;
    }
    case "start": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can start the encounter.");
      if (session.players.length === 0) return reject(session, profiles, "At least one player must join.");
      if (!session.players.every((player) => player.ready)) return reject(session, profiles, "All joined players must be ready.");
      nextSession = startAdventureEncounter(session);
      break;
    }
    case "move": {
      if (!activePlayerForActor(session, request.actorId)) return reject(session, profiles, "It is not your turn.");
      nextSession = moveActivePlayer(session, request.actorId, request.target);
      if (nextSession === session) return reject(session, profiles, "That movement is not valid.");
      break;
    }
    case "basic_attack": {
      if (!activePlayerForActor(session, request.actorId)) return reject(session, profiles, "It is not your turn.");
      nextSession = basicAttack(session, request.actorId, request.targetId);
      if (nextSession === session) return reject(session, profiles, "That attack is not valid.");
      break;
    }
    case "ability": {
      if (!activePlayerForActor(session, request.actorId)) return reject(session, profiles, "It is not your turn.");
      nextSession = useAbility(session, request.actorId, request.payload.abilityId, request.payload.targetId);
      if (nextSession === session) return reject(session, profiles, "That ability target is not valid.");
      break;
    }
    case "item": {
      if (!activePlayerForActor(session, request.actorId)) return reject(session, profiles, "It is not your turn.");
      nextSession = useItem(session, request.actorId, request.payload.itemId, request.payload.targetId);
      if (nextSession === session) return reject(session, profiles, "That item target is not valid.");
      break;
    }
    case "block": {
      if (!activePlayerForActor(session, request.actorId)) return reject(session, profiles, "It is not your turn.");
      nextSession = blockWithActivePlayer(session, request.actorId);
      if (nextSession === session) return reject(session, profiles, "Block is not available.");
      break;
    }
    case "vote_flee": {
      if (!session.players.some((player) => player.playerId === request.actorId && player.hp > 0)) return reject(session, profiles, "Only living party members can vote to flee.");
      nextSession = voteToFlee(session, request.actorId);
      break;
    }
    case "end_turn": {
      if (!activePlayerForActor(session, request.actorId)) return reject(session, profiles, "It is not your turn.");
      nextSession = advanceTurn(session);
      break;
    }
    case "skip_turn": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can skip turns.");
      nextSession = skipActiveTurn(session);
      break;
    }
    case "abandon": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can abandon the room.");
      nextSession = abandonSession(session);
      break;
    }
    case "reset_to_lobby": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can reset the room.");
      nextSession = resetToLobby(session);
      break;
    }
    case "close": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can close the room.");
      nextSession = closeSession(session);
      break;
    }
    case "claim_rewards": {
      const claimed = claimRewards(session, profiles, request.actorId);
      if (!claimed.claimed) return reject(claimed.session, claimed.profiles, "No unclaimed rewards are available.");
      nextSession = claimed.session;
      nextProfiles = claimed.profiles;
      break;
    }
    default:
      return reject(session, profiles, "Unknown Adventure action.");
  }

  return ok(bump(nextSession, request), nextProfiles);
}
