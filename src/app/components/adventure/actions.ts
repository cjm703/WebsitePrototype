import { ADVENTURE_OBJECTIVES, DEFAULT_ADVENTURE_FRAMEWORK, DEFAULT_ENCOUNTER_SETTINGS } from "./data";
import { getAdventureClass } from "./content";
import {
  beginCampaign,
  buyShopItem,
  campLevelUp,
  campSleep,
  campTradeItem,
  campUseItem,
  chooseCampaignNode,
  getCurrentCampaignNode,
  leaveCamp,
  openStarterShop,
  resolveCampaignEvent,
  resolveTownBlock,
  sellPlayerItem,
  setShopReady,
  townRest,
  voteAfterNode,
} from "./campaign";
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
    case "configure_framework": return "updated framework slots";
    case "start": return "opened the starter shop";
    case "shop_buy": return "bought starter gear";
    case "shop_sell": return "sold gear";
    case "shop_ready": return "readied in the starter shop";
    case "start_campaign": return "started the campaign";
    case "choose_campaign_node": return "chose a campaign block";
    case "resolve_campaign_event": return "resolved a campaign event";
    case "vote_camp": return "voted to camp";
    case "vote_move": return "voted to move on";
    case "leave_camp": return "left camp";
    case "camp_sleep": return "slept at camp";
    case "camp_level_up": return "leveled up at camp";
    case "camp_use_item": return "used an item at camp";
    case "camp_trade": return "traded an item at camp";
    case "town_buy": return "bought town goods";
    case "town_sell": return "sold town goods";
    case "town_rest": return "rested in town";
    case "leave_town": return "left town";
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
    campaign: null,
    framework: session.framework || { ...DEFAULT_ADVENTURE_FRAMEWORK },
    players: session.players.map((player) => {
      const classDef = getAdventureClass(session.content, player.classId);
      return {
        ...player,
        classDef,
        hp: classDef.maxHp,
        maxHp: classDef.maxHp,
        position: { x: 1, y: 1 },
        ready: false,
        shopReady: false,
        moveRemaining: classDef.move,
        actionTaken: false,
        blockActive: false,
        marked: false,
        abilities: classDef.abilities.map((ability) => ({ ...ability })),
        inventory: classDef.inventory.map((item) => ({ ...item })),
        equipment: {},
        gold: 0,
        xpBank: 0,
        campaignLevel: 1,
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
    case "configure_framework": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can configure framework slots.");
      if (session.phase !== "setup") return reject(session, profiles, "Framework slots are locked once the starter shop opens.");
      nextSession = {
        ...session,
        framework: { ...DEFAULT_ADVENTURE_FRAMEWORK, ...(session.framework || {}), ...request.payload },
        updatedAt: nowIso(),
      };
      break;
    }
    case "start": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can start the encounter.");
      if (session.players.length === 0) return reject(session, profiles, "At least one player must join.");
      if (!session.players.every((player) => player.ready)) return reject(session, profiles, "All joined players must be ready.");
      if (session.phase !== "setup") return reject(session, profiles, "Starter shop can only open from room setup.");
      nextSession = openStarterShop(session);
      break;
    }
    case "shop_buy": {
      if (!session.players.some((player) => player.playerId === request.actorId)) return reject(session, profiles, "Join the room first.");
      nextSession = buyShopItem(session, request.actorId, request.payload.shopItemId);
      if (nextSession === session) return reject(session, profiles, "That shop purchase is not available.");
      break;
    }
    case "shop_sell": {
      if (!session.players.some((player) => player.playerId === request.actorId)) return reject(session, profiles, "Join the room first.");
      nextSession = sellPlayerItem(session, request.actorId, request.payload.itemId, request.payload.equipmentSlot);
      if (nextSession === session) return reject(session, profiles, "That item cannot be sold right now.");
      break;
    }
    case "shop_ready": {
      if (session.phase !== "shop") return reject(session, profiles, "Starter shop is not open.");
      if (!session.players.some((player) => player.playerId === request.actorId)) return reject(session, profiles, "Join the room first.");
      nextSession = setShopReady(session, request.actorId, request.payload.ready);
      break;
    }
    case "start_campaign": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can start the campaign.");
      if (session.phase !== "shop") return reject(session, profiles, "The starter shop must be open first.");
      if (!session.players.every((player) => player.shopReady)) return reject(session, profiles, "All players must finish shopping.");
      nextSession = beginCampaign(session);
      break;
    }
    case "choose_campaign_node": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can choose the next campaign block for now.");
      if (session.phase !== "campaign") return reject(session, profiles, "The party is not on the campaign map.");
      const chosen = chooseCampaignNode(session, request.payload.nodeId);
      if (chosen === session) return reject(session, profiles, "That campaign block is not connected.");
      const node = getCurrentCampaignNode(chosen);
      nextSession = node?.kind === "combat" || node?.kind === "boss" ? startAdventureEncounter(chosen) : chosen;
      break;
    }
    case "resolve_campaign_event": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can resolve event placeholders for now.");
      nextSession = resolveCampaignEvent(session);
      if (nextSession === session) return reject(session, profiles, "No unresolved event is active.");
      break;
    }
    case "vote_camp": {
      nextSession = voteAfterNode(session, request.actorId, "camp");
      if (nextSession === session) return reject(session, profiles, "Camp voting is not open.");
      break;
    }
    case "vote_move": {
      nextSession = voteAfterNode(session, request.actorId, "move");
      if (nextSession === session) return reject(session, profiles, "Move voting is not open.");
      break;
    }
    case "leave_camp": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can break camp.");
      nextSession = leaveCamp(session);
      if (nextSession === session) return reject(session, profiles, "The party is not camping.");
      break;
    }
    case "camp_sleep": {
      nextSession = campSleep(session);
      if (nextSession === session) return reject(session, profiles, "No campaign sleeps remain.");
      break;
    }
    case "camp_level_up": {
      nextSession = campLevelUp(session, request.actorId);
      if (nextSession === session) return reject(session, profiles, "You need more banked XP to level up at camp.");
      break;
    }
    case "camp_use_item": {
      nextSession = campUseItem(session, request.actorId, request.payload.itemId, request.payload.targetPlayerId);
      if (nextSession === session) return reject(session, profiles, "That camp item cannot be used.");
      break;
    }
    case "camp_trade": {
      nextSession = campTradeItem(session, request.actorId, request.payload.itemId, request.payload.targetPlayerId);
      if (nextSession === session) return reject(session, profiles, "That trade cannot be completed.");
      break;
    }
    case "town_buy": {
      nextSession = buyShopItem(session, request.actorId, request.payload.shopItemId);
      if (nextSession === session) return reject(session, profiles, "That town purchase is not available.");
      break;
    }
    case "town_sell": {
      nextSession = sellPlayerItem(session, request.actorId, request.payload.itemId, request.payload.equipmentSlot);
      if (nextSession === session) return reject(session, profiles, "That item cannot be sold in town.");
      break;
    }
    case "town_rest": {
      nextSession = townRest(session, request.actorId);
      if (nextSession === session) return reject(session, profiles, "Town rest costs 10 gold.");
      break;
    }
    case "leave_town": {
      if (!isHost(session, request.actorId)) return reject(session, profiles, "Only the host can leave town.");
      nextSession = resolveTownBlock(session);
      if (nextSession === session) return reject(session, profiles, "The party is not in town.");
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
