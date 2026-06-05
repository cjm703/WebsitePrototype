import { ADVENTURE_CLASSES, ADVENTURE_DIFFICULTIES, ADVENTURE_OBJECTIVES, ADVENTURE_THEMES, DEFAULT_ENCOUNTER_SETTINGS, DEFAULT_THEME } from "./data";
import type {
  AdventureAbility,
  AdventureClassId,
  AdventureEnemy,
  AdventureItem,
  AdventureLogEntry,
  AdventureMap,
  AdventurePlayer,
  AdventurePoint,
  AdventureSession,
  AdventureTheme,
  AdventureTile,
  AdventureTileKind,
} from "./types";

const PLAYER_SPAWNS = [
  { x: 1, yOffset: -1 },
  { x: 1, yOffset: 0 },
  { x: 1, yOffset: 1 },
  { x: 2, yOffset: 0 },
  { x: 2, yOffset: -1 },
  { x: 2, yOffset: 1 },
];

const ENEMY_TYPES = [
  { enemyType: "Skirmisher", name: "Skirmisher", maxHp: 18, damage: 5, attackRange: 1, intent: "Rushes the nearest ally" },
  { enemyType: "Slinger", name: "Slinger", maxHp: 14, damage: 4, attackRange: 3, intent: "Harasses from range" },
  { enemyType: "Brute", name: "Brute", maxHp: 26, damage: 7, attackRange: 1, intent: "Crushes blocked paths" },
  { enemyType: "Hexer", name: "Hexer", maxHp: 16, damage: 6, attackRange: 3, intent: "Targets wounded allies" },
];

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function distance(a: AdventurePoint, b: AdventurePoint) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function choose<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length];
}

function isSpawnSafe(x: number, y: number, width: number, height: number) {
  const mid = Math.floor(height / 2);
  if (x <= 3 && Math.abs(y - mid) <= 3) return true;
  if (x >= width - 4) return true;
  if (y <= 2 || y >= height - 3) return true;
  return false;
}

function createTile(x: number, y: number, width: number, height: number, theme: AdventureTheme, random: () => number): AdventureTile {
  const themeDef = ADVENTURE_THEMES[theme] || ADVENTURE_THEMES[DEFAULT_THEME];
  const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
  if (edge) {
    return { x, y, kind: "wall", blocksMove: true, decor: choose(themeDef.decor, random) };
  }

  if (!isSpawnSafe(x, y, width, height)) {
    const roll = random();
    if (roll < 0.08) return { x, y, kind: "wall", blocksMove: true, decor: choose(themeDef.decor, random) };
    if (roll < 0.17) return { x, y, kind: "cover", blocksMove: true, decor: choose(themeDef.decor, random) };
    if (roll < 0.22) return { x, y, kind: "hazard", blocksMove: false, decor: "hazard" };
    if (roll < 0.25) return { x, y, kind: "water", blocksMove: true, decor: "water" };
  }

  const special = random();
  if (!isSpawnSafe(x, y, width, height) && special < 0.012) return { x, y, kind: "chest", blocksMove: false, decor: "chest" };
  if (!isSpawnSafe(x, y, width, height) && special > 0.988) return { x, y, kind: "shrine", blocksMove: false, decor: "shrine" };
  return { x, y, kind: "floor", blocksMove: false, decor: random() < 0.08 ? choose(themeDef.decor, random) : undefined };
}

export function generateAdventureMap(width: number, height: number, theme: AdventureTheme, seed: number): AdventureMap {
  const random = seededRandom(seed);
  const tiles: AdventureTile[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push(createTile(x, y, width, height, theme, random));
    }
  }
  return { width, height, theme, seed, tiles };
}

export function getTile(map: AdventureMap | null, point: AdventurePoint): AdventureTile | null {
  if (!map) return null;
  if (point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height) return null;
  return map.tiles[point.y * map.width + point.x] || null;
}

export function getUnitAt(session: AdventureSession, point: AdventurePoint) {
  const player = session.players.find((unit) => unit.hp > 0 && unit.position.x === point.x && unit.position.y === point.y);
  if (player) return { kind: "player" as const, unit: player };
  const enemy = session.enemies.find((unit) => unit.hp > 0 && unit.position.x === point.x && unit.position.y === point.y);
  if (enemy) return { kind: "enemy" as const, unit: enemy };
  return null;
}

export function isWalkable(session: AdventureSession, point: AdventurePoint) {
  const tile = getTile(session.map, point);
  if (!tile || tile.blocksMove) return false;
  return !getUnitAt(session, point);
}

function createLog(text: string, tone: AdventureLogEntry["tone"] = "system"): AdventureLogEntry {
  return { id: makeId("log"), at: nowIso(), tone, text };
}

function withLog(session: AdventureSession, text: string, tone: AdventureLogEntry["tone"] = "system"): AdventureSession {
  return {
    ...session,
    log: [createLog(text, tone), ...session.log].slice(0, 80),
    updatedAt: nowIso(),
  };
}

function normalizeClass(classId: AdventureClassId) {
  return ADVENTURE_CLASSES[classId] || ADVENTURE_CLASSES.warrior;
}

export function createAdventureSession(params: {
  hostPlayerId: string;
  hostName: string;
  classId: AdventureClassId;
  name?: string;
  mapSize?: number;
  theme?: AdventureTheme;
}): AdventureSession {
  const createdAt = nowIso();
  const seed = Math.floor(Math.random() * 9999999) + 1000;
  const session: AdventureSession = {
    id: makeId("adv"),
    name: params.name?.trim() || `${params.hostName || "Party"} Expedition`,
    status: "lobby",
    phase: "setup",
    version: 1,
    hostPlayerId: params.hostPlayerId,
    mapSize: clamp(params.mapSize || DEFAULT_ENCOUNTER_SETTINGS.mapSize, 12, 24),
    theme: params.theme || DEFAULT_ENCOUNTER_SETTINGS.theme,
    seed,
    settings: {
      ...DEFAULT_ENCOUNTER_SETTINGS,
      mapSize: clamp(params.mapSize || DEFAULT_ENCOUNTER_SETTINGS.mapSize, 12, 24),
      theme: params.theme || DEFAULT_ENCOUNTER_SETTINGS.theme,
    },
    objective: { ...ADVENTURE_OBJECTIVES[DEFAULT_ENCOUNTER_SETTINGS.objectiveType], completed: false },
    map: null,
    players: [],
    enemies: [],
    turnOrder: [],
    activeTurnIndex: 0,
    round: 1,
    fleeVotes: [],
    pendingRewards: [],
    actionHistory: [],
    log: [createLog("Adventure room created. Choose classes, ready up, and start when the party is assembled.")],
    createdAt,
    updatedAt: createdAt,
  };
  return joinAdventureSession(session, params.hostPlayerId, params.hostName, params.classId);
}

export function joinAdventureSession(
  session: AdventureSession,
  playerId: string,
  playerName: string,
  classId: AdventureClassId,
): AdventureSession {
  const classDef = normalizeClass(classId);
  const existing = session.players.find((player) => player.playerId === playerId);
  const stamp = nowIso();
  const maxPlayers = session.settings?.maxPlayers || DEFAULT_ENCOUNTER_SETTINGS.maxPlayers;
  if (existing) {
    return {
      ...session,
      players: session.players.map((player) => player.playerId === playerId
        ? {
          ...player,
          playerName: playerName || player.playerName,
          classId,
          name: playerName || player.playerName,
          maxHp: classDef.maxHp,
          hp: clamp(player.hp || classDef.maxHp, 1, classDef.maxHp),
          abilities: classDef.abilities,
          inventory: player.inventory.length ? player.inventory : classDef.inventory,
          lastSeenAt: stamp,
        }
        : player),
      updatedAt: stamp,
    };
  }

  const nextPlayer: AdventurePlayer = {
    id: `player-${playerId}`,
    playerId,
    playerName: playerName || "Player",
    name: playerName || "Player",
    classId,
    hp: classDef.maxHp,
    maxHp: classDef.maxHp,
    position: { x: 1, y: 1 },
    ready: false,
    moveRemaining: classDef.move,
    actionTaken: false,
    inventory: classDef.inventory.map((item) => ({ ...item })),
    abilities: classDef.abilities.map((ability) => ({ ...ability })),
    joinedAt: stamp,
    lastSeenAt: stamp,
  };

  return withLog(
    {
      ...session,
      players: [...session.players, nextPlayer].slice(0, maxPlayers),
      updatedAt: stamp,
    },
    `${nextPlayer.playerName} joined as ${classDef.name}.`,
    "player",
  );
}

export function setPlayerReady(session: AdventureSession, playerId: string, ready: boolean): AdventureSession {
  return {
    ...session,
    players: session.players.map((player) => player.playerId === playerId ? { ...player, ready, lastSeenAt: nowIso() } : player),
    updatedAt: nowIso(),
  };
}

export function setPlayerClass(session: AdventureSession, playerId: string, classId: AdventureClassId): AdventureSession {
  const classDef = normalizeClass(classId);
  return withLog({
    ...session,
    players: session.players.map((player) => player.playerId === playerId
      ? {
        ...player,
        classId,
        maxHp: classDef.maxHp,
        hp: classDef.maxHp,
        moveRemaining: classDef.move,
        abilities: classDef.abilities.map((ability) => ({ ...ability })),
        inventory: classDef.inventory.map((item) => ({ ...item })),
      }
      : player),
    updatedAt: nowIso(),
  }, `${session.players.find((player) => player.playerId === playerId)?.playerName || "Player"} changed class to ${classDef.name}.`, "player");
}

function playerSpawn(index: number, map: AdventureMap): AdventurePoint {
  const spawn = PLAYER_SPAWNS[index % PLAYER_SPAWNS.length];
  return {
    x: clamp(spawn.x, 1, map.width - 2),
    y: clamp(Math.floor(map.height / 2) + spawn.yOffset, 1, map.height - 2),
  };
}

function enemySpawns(count: number, map: AdventureMap, random: () => number): AdventurePoint[] {
  const spawns: AdventurePoint[] = [];
  const candidates: AdventurePoint[] = [];
  for (let x = 2; x < map.width - 2; x += 2) {
    candidates.push({ x, y: 1 }, { x, y: map.height - 2 });
  }
  for (let y = 2; y < map.height - 2; y += 2) {
    candidates.push({ x: map.width - 2, y });
  }
  while (spawns.length < count && candidates.length) {
    const index = Math.floor(random() * candidates.length);
    const [candidate] = candidates.splice(index, 1);
    const tile = getTile(map, candidate);
    if (tile && !tile.blocksMove) spawns.push(candidate);
  }
  return spawns;
}

function createEnemies(map: AdventureMap, playerCount: number, seed: number): AdventureEnemy[] {
  const random = seededRandom(seed + 77);
  const count = clamp(playerCount + 1, 2, 8);
  const spawns = enemySpawns(count, map, random);
  return spawns.map((position, index) => {
    const def = ENEMY_TYPES[index % ENEMY_TYPES.length];
    return {
      id: `enemy-${index + 1}`,
      name: `${def.name} ${index + 1}`,
      enemyType: def.enemyType,
      hp: def.maxHp,
      maxHp: def.maxHp,
      position,
      attackRange: def.attackRange,
      damage: def.damage,
      intent: def.intent,
    };
  });
}

export function startAdventureEncounter(session: AdventureSession): AdventureSession {
  if (session.status !== "lobby" || session.players.length === 0) return session;
  const settings = session.settings || DEFAULT_ENCOUNTER_SETTINGS;
  const difficulty = ADVENTURE_DIFFICULTIES[settings.difficulty] || ADVENTURE_DIFFICULTIES.standard;
  const mapSize = clamp(settings.mapSize || session.mapSize || 12, 12, 24);
  const theme = settings.theme || session.theme || DEFAULT_THEME;
  const map = generateAdventureMap(mapSize, mapSize, theme, session.seed || Date.now());
  const players = session.players.map((player, index) => {
    const classDef = normalizeClass(player.classId);
    return {
      ...player,
      hp: classDef.maxHp,
      maxHp: classDef.maxHp,
      position: playerSpawn(index, map),
      ready: true,
      moveRemaining: classDef.move,
      actionTaken: false,
      blockActive: false,
      marked: false,
      abilities: classDef.abilities.map((ability) => ({ ...ability })),
      inventory: classDef.inventory.map((item) => ({ ...item })),
    };
  });
  const enemies = createEnemies(map, players.length, session.seed || Date.now()).map((enemy) => ({
    ...enemy,
    hp: Math.max(1, Math.round(enemy.hp * difficulty.enemyScale)),
    maxHp: Math.max(1, Math.round(enemy.maxHp * difficulty.enemyScale)),
    damage: Math.max(1, Math.round(enemy.damage * difficulty.enemyScale)),
  }));
  return withLog({
    ...session,
    status: "playing",
    phase: "encounter",
    settings,
    mapSize,
    theme,
    objective: { ...(ADVENTURE_OBJECTIVES[settings.objectiveType] || ADVENTURE_OBJECTIVES.defeat_all), completed: false },
    map,
    players,
    enemies,
    turnOrder: [...players.map((player) => player.id), ...enemies.map((enemy) => enemy.id)],
    activeTurnIndex: 0,
    round: 1,
    fleeVotes: [],
    updatedAt: nowIso(),
  }, `Encounter started on a ${ADVENTURE_THEMES[theme]?.name || "wild"} ${mapSize}x${mapSize} map.`, "system");
}

function activeTurnId(session: AdventureSession) {
  if (session.turnOrder.length === 0) return "";
  return session.turnOrder[session.activeTurnIndex % session.turnOrder.length] || "";
}

export function getActivePlayer(session: AdventureSession): AdventurePlayer | null {
  const id = activeTurnId(session);
  return session.players.find((player) => player.id === id && player.hp > 0) || null;
}

export function getActiveEnemy(session: AdventureSession): AdventureEnemy | null {
  const id = activeTurnId(session);
  return session.enemies.find((enemy) => enemy.id === id && enemy.hp > 0) || null;
}

function refreshPlayerTurn(player: AdventurePlayer): AdventurePlayer {
  const classDef = normalizeClass(player.classId);
  return {
    ...player,
    moveRemaining: classDef.move,
    actionTaken: false,
    blockActive: false,
    marked: false,
  };
}

function checkEncounterOutcome(session: AdventureSession): AdventureSession {
  const livingPlayers = session.players.filter((player) => player.hp > 0);
  const livingEnemies = session.enemies.filter((enemy) => enemy.hp > 0);
  if (session.status !== "playing") return session;
  if (livingEnemies.length === 0) {
    return withLog({ ...session, status: "completed", phase: "rewards", outcome: "victory", objective: { ...session.objective, completed: true } }, "Victory. The party cleared the encounter.", "reward");
  }
  if (livingPlayers.length === 0) {
    return withLog({ ...session, status: "completed", phase: "rewards", outcome: "defeat" }, "Defeat. The party has fallen.", "warning");
  }
  if (session.objective?.type === "survive_rounds" && session.round >= (session.objective.targetRounds || 5)) {
    return withLog({ ...session, status: "completed", phase: "rewards", outcome: "victory", objective: { ...session.objective, completed: true } }, "Victory. The party survived the objective timer.", "reward");
  }
  return session;
}

function nextTurnIndex(session: AdventureSession) {
  if (session.turnOrder.length === 0) return 0;
  return (session.activeTurnIndex + 1) % session.turnOrder.length;
}

export function advanceTurn(session: AdventureSession): AdventureSession {
  if (session.status !== "playing") return session;
  let next = checkEncounterOutcome(session);
  if (next.status !== "playing") return next;

  let nextIndex = nextTurnIndex(next);
  let guard = 0;
  let round = next.round;
  while (guard < next.turnOrder.length) {
    const wrapped = nextIndex === 0;
    if (wrapped) round += 1;
    const id = next.turnOrder[nextIndex] || "";
    const player = next.players.find((unit) => unit.id === id && unit.hp > 0);
    const enemy = next.enemies.find((unit) => unit.id === id && unit.hp > 0);
    if (player || enemy) break;
    nextIndex = (nextIndex + 1) % next.turnOrder.length;
    guard += 1;
  }

  next = {
    ...next,
    activeTurnIndex: nextIndex,
    round,
    updatedAt: nowIso(),
  };

  const activePlayer = getActivePlayer(next);
  if (activePlayer) {
    next = {
      ...next,
      players: next.players.map((player) => player.id === activePlayer.id ? refreshPlayerTurn(player) : player),
    };
  }

  const activeEnemy = getActiveEnemy(next);
  if (activeEnemy) {
    return resolveEnemyTurn(next);
  }

  return next;
}

export function moveActivePlayer(session: AdventureSession, playerId: string, point: AdventurePoint): AdventureSession {
  const active = getActivePlayer(session);
  if (!active || active.playerId !== playerId || session.status !== "playing") return session;
  if (distance(active.position, point) !== 1 || active.moveRemaining <= 0 || !isWalkable(session, point)) return session;
  const tile = getTile(session.map, point);
  let next = {
    ...session,
    players: session.players.map((player) => player.id === active.id
      ? { ...player, position: point, moveRemaining: player.moveRemaining - 1, hp: tile?.kind === "hazard" ? clamp(player.hp - 2, 0, player.maxHp) : player.hp }
      : player),
    updatedAt: nowIso(),
  };
  if (tile?.kind === "hazard") {
    next = withLog(next, `${active.playerName} crossed dangerous ground and took 2 damage.`, "warning");
  }
  if (tile?.kind === "chest") {
    next = withLog(next, `${active.playerName} found a field cache. A potion was added to their pack.`, "reward");
    next = {
      ...next,
      map: next.map ? {
        ...next.map,
        tiles: next.map.tiles.map((entry) => entry.x === point.x && entry.y === point.y ? { ...entry, kind: "floor", decor: undefined } : entry),
      } : next.map,
      players: next.players.map((player) => player.id === active.id ? addItemToPlayer(player, {
        id: "minor-potion",
        name: "Minor Potion",
        description: "Restore HP to an ally in range.",
        kind: "heal",
        range: 2,
        power: 10,
        quantity: 1,
      }) : player),
    };
  }
  if (tile?.kind === "shrine") {
    next = {
      ...next,
      map: next.map ? {
        ...next.map,
        tiles: next.map.tiles.map((entry) => entry.x === point.x && entry.y === point.y ? { ...entry, kind: "floor", decor: undefined } : entry),
      } : next.map,
      players: next.players.map((player) => player.id === active.id ? { ...player, hp: clamp(player.hp + 6, 0, player.maxHp) } : player),
    };
    next = withLog(next, `${active.playerName} touched a shrine and recovered 6 HP.`, "reward");
  }
  return checkEncounterOutcome(next);
}

function addItemToPlayer(player: AdventurePlayer, item: AdventureItem): AdventurePlayer {
  const existing = player.inventory.find((entry) => entry.id === item.id);
  if (!existing) return { ...player, inventory: [...player.inventory, item] };
  return {
    ...player,
    inventory: player.inventory.map((entry) => entry.id === item.id ? { ...entry, quantity: entry.quantity + item.quantity } : entry),
  };
}

function applyDamageToEnemy(enemy: AdventureEnemy, amount: number) {
  const bonus = enemy.marked ? 2 : 0;
  return { ...enemy, hp: clamp(enemy.hp - amount - bonus, 0, enemy.maxHp), marked: false };
}

function applyDamageToPlayer(player: AdventurePlayer, amount: number) {
  const reduced = player.blockActive ? Math.ceil(amount / 2) : amount;
  return { ...player, hp: clamp(player.hp - reduced, 0, player.maxHp), blockActive: false };
}

export function basicAttack(session: AdventureSession, playerId: string, enemyId: string): AdventureSession {
  const active = getActivePlayer(session);
  const target = session.enemies.find((enemy) => enemy.id === enemyId && enemy.hp > 0);
  if (!active || active.playerId !== playerId || !target || active.actionTaken || distance(active.position, target.position) > 1) return session;
  const classDef = normalizeClass(active.classId);
  const next = {
    ...session,
    players: session.players.map((player) => player.id === active.id ? { ...player, actionTaken: true } : player),
    enemies: session.enemies.map((enemy) => enemy.id === target.id ? applyDamageToEnemy(enemy, classDef.basicDamage) : enemy),
    updatedAt: nowIso(),
  };
  return checkEncounterOutcome(withLog(next, `${active.playerName} attacked ${target.name} for ${classDef.basicDamage} damage.`, "player"));
}

export function useAbility(session: AdventureSession, playerId: string, abilityId: string, targetId?: string): AdventureSession {
  const active = getActivePlayer(session);
  if (!active || active.playerId !== playerId || active.actionTaken) return session;
  const ability = active.abilities.find((entry) => entry.id === abilityId);
  if (!ability) return session;

  if (ability.kind === "guard") {
    return withLog({
      ...session,
      players: session.players.map((player) => player.id === active.id ? { ...player, blockActive: true, actionTaken: true } : player),
      updatedAt: nowIso(),
    }, `${active.playerName} raised a guard.`, "player");
  }

  if (ability.kind === "heal") {
    const target = session.players.find((player) => player.id === targetId && player.hp > 0);
    if (!target || distance(active.position, target.position) > ability.range) return session;
    return withLog({
      ...session,
      players: session.players.map((player) => {
        if (player.id === active.id && player.id === target.id) {
          return { ...player, actionTaken: true, hp: clamp(player.hp + ability.power, 0, player.maxHp) };
        }
        if (player.id === active.id) return { ...player, actionTaken: true };
        if (player.id === target.id) return { ...player, hp: clamp(player.hp + ability.power, 0, player.maxHp) };
        return player;
      }),
      updatedAt: nowIso(),
    }, `${active.playerName} used ${ability.name} on ${target.playerName} for ${ability.power} HP.`, "player");
  }

  const target = session.enemies.find((enemy) => enemy.id === targetId && enemy.hp > 0);
  if (!target || distance(active.position, target.position) > ability.range) return session;
  const next = {
    ...session,
    players: session.players.map((player) => player.id === active.id ? { ...player, actionTaken: true } : player),
    enemies: session.enemies.map((enemy) => {
      if (enemy.id !== target.id) return enemy;
      const damaged = applyDamageToEnemy(enemy, ability.power);
      return ability.kind === "mark" ? { ...damaged, marked: true } : damaged;
    }),
    updatedAt: nowIso(),
  };
  return checkEncounterOutcome(withLog(next, `${active.playerName} used ${ability.name} on ${target.name}.`, "player"));
}

export function useItem(session: AdventureSession, playerId: string, itemId: string, targetId?: string): AdventureSession {
  const active = getActivePlayer(session);
  if (!active || active.playerId !== playerId || active.actionTaken) return session;
  const item = active.inventory.find((entry) => entry.id === itemId && entry.quantity > 0);
  if (!item) return session;

  const consume = (player: AdventurePlayer) => ({
    ...player,
    actionTaken: true,
    inventory: player.inventory.map((entry) => entry.id === item.id ? { ...entry, quantity: Math.max(0, entry.quantity - 1) } : entry),
  });

  if (item.kind === "guard") {
    return withLog({
      ...session,
      players: session.players.map((player) => player.id === active.id ? { ...consume(player), blockActive: true } : player),
      updatedAt: nowIso(),
    }, `${active.playerName} used ${item.name} and took cover.`, "player");
  }

  if (item.kind === "heal" || item.kind === "cleanse") {
    const target = session.players.find((player) => player.id === targetId && player.hp > 0);
    if (!target || distance(active.position, target.position) > item.range) return session;
    return withLog({
      ...session,
      players: session.players.map((player) => {
        if (player.id === active.id && player.id === target.id) {
          return { ...consume(player), hp: clamp(player.hp + item.power, 0, player.maxHp) };
        }
        if (player.id === active.id) return consume(player);
        if (player.id === target.id) return { ...player, hp: clamp(player.hp + item.power, 0, player.maxHp) };
        return player;
      }),
      updatedAt: nowIso(),
    }, `${active.playerName} used ${item.name} on ${target.playerName}.`, "player");
  }

  if (item.kind === "damage") {
    const target = session.enemies.find((enemy) => enemy.id === targetId && enemy.hp > 0);
    if (!target || distance(active.position, target.position) > item.range) return session;
    const next = {
      ...session,
      players: session.players.map((player) => player.id === active.id ? consume(player) : player),
      enemies: session.enemies.map((enemy) => enemy.id === target.id ? applyDamageToEnemy(enemy, item.power) : enemy),
      updatedAt: nowIso(),
    };
    return checkEncounterOutcome(withLog(next, `${active.playerName} used ${item.name} on ${target.name}.`, "player"));
  }

  return session;
}

export function blockWithActivePlayer(session: AdventureSession, playerId: string): AdventureSession {
  const active = getActivePlayer(session);
  if (!active || active.playerId !== playerId || active.actionTaken) return session;
  return withLog({
    ...session,
    players: session.players.map((player) => player.id === active.id ? { ...player, blockActive: true, actionTaken: true } : player),
    updatedAt: nowIso(),
  }, `${active.playerName} is blocking.`, "player");
}

export function voteToFlee(session: AdventureSession, playerId: string): AdventureSession {
  if (session.status !== "playing") return session;
  const livingPlayers = session.players.filter((player) => player.hp > 0);
  if (!livingPlayers.some((player) => player.playerId === playerId)) return session;
  const hasVote = session.fleeVotes.includes(playerId);
  const fleeVotes = hasVote ? session.fleeVotes.filter((id) => id !== playerId) : [...session.fleeVotes, playerId];
  const needed = Math.max(1, Math.ceil(livingPlayers.length / 2));
  if (fleeVotes.length >= needed) {
    return withLog({ ...session, status: "completed", phase: "rewards", outcome: "retreat", fleeVotes, updatedAt: nowIso() }, "The party voted to flee. Encounter ended in retreat.", "warning");
  }
  return withLog({ ...session, fleeVotes, updatedAt: nowIso() }, `${livingPlayers.find((player) => player.playerId === playerId)?.playerName || "A player"} ${hasVote ? "withdrew their flee vote" : "voted to flee"}.`, "warning");
}

function stepToward(session: AdventureSession, from: AdventurePoint, to: AdventurePoint): AdventurePoint {
  const options: AdventurePoint[] = [
    { x: from.x + Math.sign(to.x - from.x), y: from.y },
    { x: from.x, y: from.y + Math.sign(to.y - from.y) },
    { x: from.x - Math.sign(to.x - from.x), y: from.y },
    { x: from.x, y: from.y - Math.sign(to.y - from.y) },
  ].filter((point) => point.x !== from.x || point.y !== from.y);
  return options.find((point) => isWalkable(session, point)) || from;
}

export function resolveEnemyTurn(session: AdventureSession): AdventureSession {
  const enemy = getActiveEnemy(session);
  if (!enemy || session.status !== "playing") return session;
  const targets = session.players.filter((player) => player.hp > 0);
  if (targets.length === 0) return checkEncounterOutcome(session);
  const target = [...targets].sort((a, b) => distance(enemy.position, a.position) - distance(enemy.position, b.position))[0];
  let next = session;
  if (distance(enemy.position, target.position) <= enemy.attackRange) {
    next = {
      ...next,
      players: next.players.map((player) => player.id === target.id ? applyDamageToPlayer(player, enemy.damage) : player),
      updatedAt: nowIso(),
    };
    next = withLog(next, `${enemy.name} attacked ${target.playerName} for ${enemy.damage} damage.`, "enemy");
  } else {
    const nextPosition = stepToward(next, enemy.position, target.position);
    next = {
      ...next,
      enemies: next.enemies.map((unit) => unit.id === enemy.id ? { ...unit, position: nextPosition } : unit),
      updatedAt: nowIso(),
    };
    next = withLog(next, `${enemy.name} advanced toward ${target.playerName}.`, "enemy");
  }
  next = checkEncounterOutcome(next);
  if (next.status !== "playing") return next;
  return advanceTurn(next);
}

export function abandonSession(session: AdventureSession): AdventureSession {
  return withLog({ ...session, status: "abandoned", phase: "closed", outcome: "abandoned", updatedAt: nowIso() }, "The adventure was abandoned.", "warning");
}

export function compactSessionLabel(session: AdventureSession) {
  const theme = ADVENTURE_THEMES[session.theme]?.name || "Unknown";
  return `${theme} ${session.mapSize}x${session.mapSize}`;
}

export function tileKindLabel(kind: AdventureTileKind) {
  switch (kind) {
    case "wall": return "Blocker";
    case "cover": return "Cover";
    case "hazard": return "Hazard";
    case "water": return "Water";
    case "chest": return "Chest";
    case "shrine": return "Shrine";
    default: return "Open";
  }
}

export function activeTurnName(session: AdventureSession) {
  const player = getActivePlayer(session);
  if (player) return player.playerName;
  const enemy = getActiveEnemy(session);
  if (enemy) return enemy.name;
  return "None";
}

export function getAbilityById(player: AdventurePlayer | null, abilityId: string): AdventureAbility | null {
  return player?.abilities.find((ability) => ability.id === abilityId) || null;
}

export function getItemById(player: AdventurePlayer | null, itemId: string): AdventureItem | null {
  return player?.inventory.find((item) => item.id === itemId && item.quantity > 0) || null;
}
