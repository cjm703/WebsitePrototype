import { CAMP_SLEEP_LIMIT, STARTER_GOLD } from "./data";
import { getAdventureClass, getAdventureEventTemplates, getAdventureLevelUpRule, getAdventureShopItems } from "./content";
import { clamp, makeId, nowIso } from "./engine";
import { addItemToInventory, applyEquipmentStats, removeOneInventoryItem } from "./kit";
import type {
  AdventureCampaignNode,
  AdventureCampaignNodeKind,
  AdventureCampaignState,
  AdventureContentCatalog,
  AdventureEquipmentSlot,
  AdventureLogEntry,
  AdventurePlayer,
  AdventureSession,
  AdventureShopItem,
} from "./types";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function logEntry(text: string, tone: AdventureLogEntry["tone"] = "system"): AdventureLogEntry {
  return { id: makeId("log"), at: nowIso(), tone, text };
}

function withLog(session: AdventureSession, text: string, tone: AdventureLogEntry["tone"] = "system"): AdventureSession {
  return {
    ...session,
    log: [logEntry(text, tone), ...session.log].slice(0, 100),
    updatedAt: nowIso(),
  };
}

function shopItem(shopItemId: string): AdventureShopItem | null {
  return null;
}

function getPlayer(session: AdventureSession, playerId: string) {
  return session.players.find((player) => player.playerId === playerId) || null;
}

function updatePlayer(session: AdventureSession, playerId: string, updater: (player: AdventurePlayer) => AdventurePlayer): AdventureSession {
  return {
    ...session,
    players: session.players.map((player) => player.playerId === playerId ? updater(player) : player),
    updatedAt: nowIso(),
  };
}

function campaignNodeKind(depth: number, maxDepth: number, roll: number): AdventureCampaignNodeKind {
  if (depth === 0) return "start";
  if (depth >= maxDepth) return "boss";
  if (roll < 0.36) return "combat";
  if (roll < 0.70) return "event";
  return "town";
}

function nodeTitle(kind: AdventureCampaignNodeKind, depth: number) {
  if (kind === "start") return "Empty Cube";
  if (kind === "combat") return `Combat Route ${depth}`;
  if (kind === "town") return `Wayside Town ${depth}`;
  if (kind === "boss") return "Campaign Gate";
  return `Strange Event ${depth}`;
}

function nodeDescription(kind: AdventureCampaignNodeKind) {
  if (kind === "start") return "The party starts on a quiet empty cube. Lines show the next possible blocks.";
  if (kind === "combat") return "A tactical fight placeholder. Enemy sets and boss behavior can be swapped by the framework.";
  if (kind === "town") return "A safe town block for buying, selling, and resting before the road continues.";
  if (kind === "boss") return "A larger combat slot reserved for later boss expansion.";
  return "A text event placeholder that can become a choice, skill check, puzzle, reward, or complication.";
}

export function generateCampaign(seed: number, maxDepth = 6, content?: AdventureContentCatalog): AdventureCampaignState {
  const random = seededRandom(seed + 404);
  const layers: AdventureCampaignNode[][] = [];
  const eventTemplates = getAdventureEventTemplates(content);

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const count = depth === 0 ? 1 : depth === maxDepth ? 1 : 1 + Math.floor(random() * 3);
    const nodes: AdventureCampaignNode[] = [];
    for (let index = 0; index < count; index += 1) {
      const kind = campaignNodeKind(depth, maxDepth, random());
      const eventTemplate = kind === "event" ? eventTemplates[Math.floor(random() * eventTemplates.length) % eventTemplates.length] : null;
      nodes.push({
        id: `node-${depth}-${index}`,
        kind,
        title: eventTemplate?.title || nodeTitle(kind, depth),
        description: eventTemplate?.description || nodeDescription(kind),
        depth,
        lane: index,
        x: depth * 180,
        y: (index - (count - 1) / 2) * 92,
        connectedNodeIds: [],
        rewardXp: eventTemplate?.rewardXp ?? (kind === "event" ? 35 : kind === "town" ? 10 : kind === "boss" ? 120 : 55),
        rewardGold: eventTemplate?.rewardGold ?? (kind === "event" ? 18 : kind === "town" ? 0 : kind === "boss" ? 80 : 32),
        tags: kind === "boss" ? ["boss-slot"] : eventTemplate?.tags || [kind],
      });
    }
    layers.push(nodes);
  }

  for (let depth = 0; depth < layers.length - 1; depth += 1) {
    const nextLayer = layers[depth + 1];
    layers[depth] = layers[depth].map((node) => {
      const linkCount = clamp(1 + Math.floor(random() * 3), 1, Math.min(3, nextLayer.length));
      const shuffled = [...nextLayer].sort(() => random() - 0.5);
      return { ...node, connectedNodeIds: shuffled.slice(0, linkCount).map((entry) => entry.id) };
    });
  }

  const nodes = layers.flat();
  return {
    id: makeId("campaign"),
    seed,
    currentNodeId: "node-0-0",
    visitedNodeIds: ["node-0-0"],
    nodes,
    maxDepth,
    sleepUsesRemaining: CAMP_SLEEP_LIMIT,
    awaitingPostNodeVote: false,
    campVotes: [],
    moveVotes: [],
  };
}

export function openStarterShop(session: AdventureSession): AdventureSession {
  if (session.status !== "lobby" || session.phase !== "setup") return session;
  return withLog({
    ...session,
    phase: "shop",
    players: session.players.map((player) => {
      const classDef = getAdventureClass(session.content, player.classId);
      return applyEquipmentStats({
        ...player,
        classDef,
        hp: classDef.maxHp,
        maxHp: classDef.maxHp,
        inventory: [],
        equipment: {},
        gold: STARTER_GOLD,
        xpBank: 0,
        campaignLevel: 1,
        shopReady: false,
        ready: true,
      });
    }),
    updatedAt: nowIso(),
  }, `Starter shop opened. Each player has ${STARTER_GOLD} gold to build a kit.`, "system");
}

export function setShopReady(session: AdventureSession, playerId: string, ready: boolean): AdventureSession {
  if (session.phase !== "shop") return session;
  return updatePlayer(session, playerId, (player) => ({ ...player, shopReady: ready, lastSeenAt: nowIso() }));
}

export function buyShopItem(session: AdventureSession, playerId: string, shopItemId: string): AdventureSession {
  if (session.phase !== "shop" && session.phase !== "town") return session;
  const item = getAdventureShopItems(session.content).find((entry) => entry.id === shopItemId) || shopItem(shopItemId);
  const player = getPlayer(session, playerId);
  if (!item || !player || (player.gold || 0) < item.price) return session;

  let next = updatePlayer(session, playerId, (entry) => {
    const gold = (entry.gold || 0) - item.price;
    if (item.kind === "equipment" && item.equipment) {
      const previous = entry.equipment?.[item.equipment.slot];
      const refund = previous ? previous.sellValue : 0;
      return applyEquipmentStats({
        ...entry,
        gold: gold + refund,
        equipment: { ...(entry.equipment || {}), [item.equipment.slot]: item.equipment },
        shopReady: false,
      });
    }
    if (item.item) {
      return {
        ...entry,
        gold,
        inventory: addItemToInventory(entry.inventory, { ...item.item, quantity: 1 }),
        shopReady: false,
      };
    }
    return entry;
  });
  next = withLog(next, `${player.playerName} bought ${item.name}.`, "player");
  return next;
}

export function sellPlayerItem(session: AdventureSession, playerId: string, itemId: string, equipmentSlot?: AdventureEquipmentSlot): AdventureSession {
  if (session.phase !== "shop" && session.phase !== "town") return session;
  const player = getPlayer(session, playerId);
  if (!player) return session;

  if (equipmentSlot && player.equipment?.[equipmentSlot]?.id === itemId) {
    const equipment = player.equipment[equipmentSlot];
    const nextEquipment = { ...(player.equipment || {}) };
    delete nextEquipment[equipmentSlot];
    return withLog(updatePlayer(session, playerId, (entry) => applyEquipmentStats({
      ...entry,
      gold: (entry.gold || 0) + (equipment?.sellValue || 0),
      equipment: nextEquipment,
      shopReady: false,
    })), `${player.playerName} sold ${equipment?.name || "equipment"}.`, "player");
  }

  const existing = player.inventory.find((entry) => entry.id === itemId && entry.quantity > 0);
  if (!existing) return session;
  const { inventory } = removeOneInventoryItem(player.inventory, itemId);
  return withLog(updatePlayer(session, playerId, (entry) => ({
    ...entry,
    inventory,
    gold: (entry.gold || 0) + (existing.sellValue || Math.max(1, Math.floor((existing.price || 10) / 2))),
    shopReady: false,
  })), `${player.playerName} sold ${existing.name}.`, "player");
}

export function beginCampaign(session: AdventureSession): AdventureSession {
  if (session.phase !== "shop") return session;
  const campaign = generateCampaign(session.seed || Date.now(), 6, session.content);
  return withLog({
    ...session,
    status: "playing",
    phase: "campaign",
    campaign,
    map: null,
    enemies: [],
    turnOrder: [],
    activeTurnIndex: 0,
    round: 1,
    fleeVotes: [],
    players: session.players.map((player) => applyEquipmentStats({ ...player, shopReady: true, ready: true })),
    updatedAt: nowIso(),
  }, "Campaign started. The party begins on the empty cube and must move right through linked blocks.", "system");
}

export function getCurrentCampaignNode(session: AdventureSession) {
  return session.campaign?.nodes.find((node) => node.id === session.campaign?.currentNodeId) || null;
}

export function getAvailableCampaignNodes(session: AdventureSession) {
  const campaign = session.campaign;
  const current = getCurrentCampaignNode(session);
  if (!campaign || !current || campaign.awaitingPostNodeVote) return [];
  return current.connectedNodeIds
    .map((id) => campaign.nodes.find((node) => node.id === id))
    .filter(Boolean) as AdventureCampaignNode[];
}

export function chooseCampaignNode(session: AdventureSession, nodeId: string): AdventureSession {
  const campaign = session.campaign;
  const available = getAvailableCampaignNodes(session);
  const node = available.find((entry) => entry.id === nodeId);
  if (!campaign || !node || session.phase !== "campaign") return session;
  return withLog({
    ...session,
    phase: node.kind === "town" ? "town" : "campaign",
    campaign: {
      ...campaign,
      currentNodeId: node.id,
      visitedNodeIds: Array.from(new Set([...campaign.visitedNodeIds, node.id])),
      campVotes: [],
      moveVotes: [],
      lastNodeOutcome: undefined,
    },
    updatedAt: nowIso(),
  }, `The party moved to ${node.title}.`, node.kind === "town" ? "reward" : "system");
}

function awardCurrentNode(session: AdventureSession, summary: string): AdventureSession {
  const campaign = session.campaign;
  const node = getCurrentCampaignNode(session);
  if (!campaign || !node) return session;
  const xp = node.rewardXp || 0;
  const gold = node.rewardGold || 0;
  return withLog({
    ...session,
    campaign: {
      ...campaign,
      nodes: campaign.nodes.map((entry) => entry.id === node.id ? { ...entry, resolved: true } : entry),
      awaitingPostNodeVote: true,
      campVotes: [],
      moveVotes: [],
      lastNodeOutcome: summary,
    },
    players: session.players.map((player) => ({
      ...player,
      xpBank: (player.xpBank || 0) + xp,
      gold: (player.gold || 0) + gold,
    })),
    updatedAt: nowIso(),
  }, `${summary} Each player gained ${xp} XP and ${gold} gold. Vote to camp or move on.`, "reward");
}

export function resolveCampaignEvent(session: AdventureSession): AdventureSession {
  const node = getCurrentCampaignNode(session);
  if (!node || node.kind !== "event" || session.phase !== "campaign") return session;
  return awardCurrentNode(session, `${node.title} resolved.`);
}

export function resolveTownBlock(session: AdventureSession): AdventureSession {
  const node = getCurrentCampaignNode(session);
  if (!node || node.kind !== "town" || session.phase !== "town") return session;
  return awardCurrentNode({ ...session, phase: "campaign" }, `${node.title} visited.`);
}

export function completeCampaignCombatBlock(session: AdventureSession): AdventureSession {
  const node = getCurrentCampaignNode(session);
  if (!node || (node.kind !== "combat" && node.kind !== "boss")) return session;
  return awardCurrentNode({
    ...session,
    status: "playing",
    phase: "campaign",
    outcome: undefined,
    map: null,
    enemies: [],
    turnOrder: [],
    activeTurnIndex: 0,
    fleeVotes: [],
  }, `${node.title} cleared.`);
}

function voteThreshold(session: AdventureSession) {
  const living = session.players.filter((player) => player.hp > 0);
  return Math.max(1, Math.ceil(living.length / 2));
}

export function voteAfterNode(session: AdventureSession, playerId: string, choice: "camp" | "move"): AdventureSession {
  const campaign = session.campaign;
  if (!campaign?.awaitingPostNodeVote || !session.players.some((player) => player.playerId === playerId && player.hp > 0)) return session;
  const campVotes = choice === "camp"
    ? Array.from(new Set([...campaign.campVotes, playerId]))
    : campaign.campVotes.filter((id) => id !== playerId);
  const moveVotes = choice === "move"
    ? Array.from(new Set([...campaign.moveVotes, playerId]))
    : campaign.moveVotes.filter((id) => id !== playerId);
  const needed = voteThreshold(session);
  if (campVotes.length >= needed) {
    return withLog({
      ...session,
      phase: "camp",
      campaign: { ...campaign, campVotes, moveVotes, awaitingPostNodeVote: false },
      updatedAt: nowIso(),
    }, "The party voted to camp.", "system");
  }
  if (moveVotes.length >= needed) {
    return withLog({
      ...session,
      phase: "campaign",
      campaign: { ...campaign, campVotes: [], moveVotes: [], awaitingPostNodeVote: false },
      updatedAt: nowIso(),
    }, "The party voted to move on.", "system");
  }
  return withLog({
    ...session,
    campaign: { ...campaign, campVotes, moveVotes },
    updatedAt: nowIso(),
  }, `${getPlayer(session, playerId)?.playerName || "A player"} voted to ${choice}.`, "player");
}

export function leaveCamp(session: AdventureSession): AdventureSession {
  if (session.phase !== "camp" || !session.campaign) return session;
  return withLog({
    ...session,
    phase: "campaign",
    campaign: { ...session.campaign, awaitingPostNodeVote: false, campVotes: [], moveVotes: [] },
    updatedAt: nowIso(),
  }, "Camp packed up. The party can choose the next connected block.", "system");
}

export function campSleep(session: AdventureSession): AdventureSession {
  const campaign = session.campaign;
  if (session.phase !== "camp" || !campaign || campaign.sleepUsesRemaining <= 0) return session;
  return withLog({
    ...session,
    campaign: { ...campaign, sleepUsesRemaining: campaign.sleepUsesRemaining - 1 },
    players: session.players.map((player) => ({ ...player, hp: clamp(player.hp + Math.ceil(player.maxHp * 0.35), 0, player.maxHp) })),
    updatedAt: nowIso(),
  }, `The party slept and recovered HP. Sleeps left this campaign: ${campaign.sleepUsesRemaining - 1}.`, "reward");
}

export function campLevelUp(session: AdventureSession, playerId: string): AdventureSession {
  if (session.phase !== "camp") return session;
  const player = getPlayer(session, playerId);
  const levelRule = getAdventureLevelUpRule(session.content, session.framework.levelUpSetId);
  if (!player || (player.xpBank || 0) < levelRule.xpCost) return session;
  return withLog(updatePlayer(session, playerId, (entry) => applyEquipmentStats({
    ...entry,
    xpBank: (entry.xpBank || 0) - levelRule.xpCost,
    campaignLevel: (entry.campaignLevel || 1) + 1,
    hp: entry.hp + levelRule.hpGain,
  })), `${player.playerName} converted ${levelRule.xpCost} XP into ${levelRule.name}.`, "reward");
}

export function campUseItem(session: AdventureSession, playerId: string, itemId: string, targetPlayerId?: string): AdventureSession {
  if (session.phase !== "camp") return session;
  const actor = getPlayer(session, playerId);
  const target = getPlayer(session, targetPlayerId || playerId);
  const item = actor?.inventory.find((entry) => entry.id === itemId && entry.quantity > 0);
  if (!actor || !target || !item || (item.kind !== "heal" && item.kind !== "cleanse" && item.kind !== "guard")) return session;
  const { inventory } = removeOneInventoryItem(actor.inventory, itemId);
  return withLog({
    ...session,
    players: session.players.map((player) => {
      if (player.playerId === actor.playerId && player.playerId === target.playerId) {
        return { ...player, inventory, hp: clamp(player.hp + item.power, 0, player.maxHp) };
      }
      if (player.playerId === actor.playerId) return { ...player, inventory };
      if (player.playerId === target.playerId) return { ...player, hp: clamp(player.hp + item.power, 0, player.maxHp) };
      return player;
    }),
    updatedAt: nowIso(),
  }, `${actor.playerName} used ${item.name} at camp.`, "player");
}

export function campTradeItem(session: AdventureSession, playerId: string, itemId: string, targetPlayerId: string): AdventureSession {
  if (session.phase !== "camp" || playerId === targetPlayerId) return session;
  const actor = getPlayer(session, playerId);
  const target = getPlayer(session, targetPlayerId);
  const item = actor?.inventory.find((entry) => entry.id === itemId && entry.quantity > 0);
  if (!actor || !target || !item) return session;
  const { inventory } = removeOneInventoryItem(actor.inventory, itemId);
  return withLog({
    ...session,
    players: session.players.map((player) => {
      if (player.playerId === actor.playerId) return { ...player, inventory };
      if (player.playerId === target.playerId) return { ...player, inventory: addItemToInventory(player.inventory, { ...item, quantity: 1 }) };
      return player;
    }),
    updatedAt: nowIso(),
  }, `${actor.playerName} traded ${item.name} to ${target.playerName}.`, "player");
}

export function townRest(session: AdventureSession, playerId: string): AdventureSession {
  if (session.phase !== "town") return session;
  const player = getPlayer(session, playerId);
  if (!player || (player.gold || 0) < 10) return session;
  return withLog(updatePlayer(session, playerId, (entry) => ({
    ...entry,
    gold: (entry.gold || 0) - 10,
    hp: clamp(entry.hp + Math.ceil(entry.maxHp * 0.5), 0, entry.maxHp),
  })), `${player.playerName} rested in town for 10 gold.`, "reward");
}
