export const PROTOTYPE_SCHEMA_VERSION = 1 as const;
export const PROTOTYPE_BOARD_SIZE = 8;
export const PROTOTYPE_MAX_PLAYERS = 6;
export const PROTOTYPE_MAX_HP = 12;
export const PROTOTYPE_MOVE_DISTANCE = 3;
export const PROTOTYPE_ATTACK_DAMAGE = 3;

export type PrototypeRoomStatus = "lobby" | "active" | "completed" | "closed";
export type PrototypeTeam = "players" | "dm";
export type PrototypeActionType =
  | "join"
  | "start"
  | "move"
  | "attack"
  | "end_turn"
  | "skip_turn"
  | "close";

export type PrototypePoint = { x: number; y: number };

export type PrototypeMember = {
  playerId: string;
  displayName: string;
  joinedAt: string | null;
};

export type PrototypeUnit = {
  id: string;
  ownerId: string;
  name: string;
  team: PrototypeTeam;
  hp: number;
  maxHp: number;
  position: PrototypePoint;
  moveRemaining: number;
  actionTaken: boolean;
};

export type PrototypeLogEntry = {
  id: string;
  at: string;
  actorId: string;
  message: string;
};

export type PrototypeRoom = {
  schemaVersion: typeof PROTOTYPE_SCHEMA_VERSION;
  id: string;
  name: string;
  hostPlayerId: string;
  status: PrototypeRoomStatus;
  version: number;
  board: {
    width: number;
    height: number;
    blocked: PrototypePoint[];
  };
  members: PrototypeMember[];
  units: PrototypeUnit[];
  turnOrder: string[];
  activeTurnIndex: number;
  round: number;
  winner: PrototypeTeam | null;
  recentActionIds: string[];
  log: PrototypeLogEntry[];
  createdAt: string;
  updatedAt: string;
};

export type PrototypeActionRequest = {
  id: string;
  type: PrototypeActionType;
  expectedVersion: number;
  payload?: {
    position?: PrototypePoint;
    targetUnitId?: string;
  };
};

export type PrototypeActionResult =
  | { ok: true; room: PrototypeRoom; changed: boolean }
  | { ok: false; room: PrototypeRoom; reason: string; code: "conflict" | "forbidden" | "invalid" };

type NewRoomMember = { playerId: string; displayName: string };

function pointKey(point: PrototypePoint) {
  return `${point.x}:${point.y}`;
}

function movementCosts(room: PrototypeRoom, unit: PrototypeUnit) {
  const blocked = new Set(room.board.blocked.map(pointKey));
  for (const other of room.units) {
    if (other.id !== unit.id && other.hp > 0) blocked.add(pointKey(other.position));
  }
  const costs = new Map<string, number>([[pointKey(unit.position), 0]]);
  const queue: PrototypePoint[] = [unit.position];
  const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const currentCost = costs.get(pointKey(current)) || 0;
    if (currentCost >= unit.moveRemaining) continue;
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = pointKey(next);
      if (next.x < 0 || next.y < 0 || next.x >= room.board.width || next.y >= room.board.height) continue;
      if (blocked.has(key) || costs.has(key)) continue;
      costs.set(key, currentCost + 1);
      queue.push(next);
    }
  }
  costs.delete(pointKey(unit.position));
  return costs;
}

function unitForOwner(room: PrototypeRoom, ownerId: string) {
  return room.units.find((unit) => unit.ownerId === ownerId) || null;
}

function activeUnit(room: PrototypeRoom) {
  const activeId = room.turnOrder[room.activeTurnIndex] || "";
  return room.units.find((unit) => unit.id === activeId) || null;
}

function withLog(
  room: PrototypeRoom,
  action: PrototypeActionRequest,
  actorId: string,
  now: string,
  message: string,
) {
  const entry: PrototypeLogEntry = {
    id: action.id,
    at: now,
    actorId,
    message,
  };
  return { ...room, log: [entry, ...room.log].slice(0, 50) };
}

function commit(
  room: PrototypeRoom,
  action: PrototypeActionRequest,
  actorId: string,
  now: string,
  message: string,
) {
  const logged = withLog(room, action, actorId, now, message);
  return {
    ...logged,
    version: room.version + 1,
    recentActionIds: [action.id, ...room.recentActionIds.filter((id) => id !== action.id)].slice(0, 30),
    updatedAt: now,
  };
}

function reject(
  room: PrototypeRoom,
  reason: string,
  code: "conflict" | "forbidden" | "invalid" = "invalid",
): PrototypeActionResult {
  return { ok: false, room, reason, code };
}

function resetUnitForTurn(unit: PrototypeUnit): PrototypeUnit {
  return {
    ...unit,
    moveRemaining: unit.hp > 0 ? PROTOTYPE_MOVE_DISTANCE : 0,
    actionTaken: false,
  };
}

function advanceTurn(room: PrototypeRoom): PrototypeRoom {
  if (room.turnOrder.length === 0) return room;

  let nextIndex = room.activeTurnIndex;
  let wrapped = false;
  for (let attempts = 0; attempts < room.turnOrder.length; attempts += 1) {
    nextIndex = (nextIndex + 1) % room.turnOrder.length;
    if (nextIndex === 0) wrapped = true;
    const nextUnit = room.units.find((unit) => unit.id === room.turnOrder[nextIndex]);
    if (nextUnit && nextUnit.hp > 0) {
      return {
        ...room,
        activeTurnIndex: nextIndex,
        round: room.round + (wrapped ? 1 : 0),
        units: room.units.map((unit) => unit.id === nextUnit.id ? resetUnitForTurn(unit) : unit),
      };
    }
  }
  return room;
}

function finishIfWon(room: PrototypeRoom): PrototypeRoom {
  const playersAlive = room.units.some((unit) => unit.team === "players" && unit.hp > 0);
  const dmAlive = room.units.some((unit) => unit.team === "dm" && unit.hp > 0);
  if (playersAlive && dmAlive) return room;
  return {
    ...room,
    status: "completed",
    winner: playersAlive ? "players" : "dm",
  };
}

function initialPlayerPosition(index: number): PrototypePoint {
  return { x: 1 + (index % 6), y: PROTOTYPE_BOARD_SIZE - 2 };
}

export function createPrototypeRoom(input: {
  id: string;
  name: string;
  hostPlayerId: string;
  members: NewRoomMember[];
  now: string;
}): PrototypeRoom {
  const members = input.members.slice(0, PROTOTYPE_MAX_PLAYERS).map((member) => ({
    playerId: member.playerId,
    displayName: member.displayName,
    joinedAt: null,
  }));
  const playerUnits = members.map((member, index): PrototypeUnit => ({
    id: `unit-${member.playerId}`,
    ownerId: member.playerId,
    name: member.displayName,
    team: "players",
    hp: PROTOTYPE_MAX_HP,
    maxHp: PROTOTYPE_MAX_HP,
    position: initialPlayerPosition(index),
    moveRemaining: PROTOTYPE_MOVE_DISTANCE,
    actionTaken: false,
  }));
  const dmUnit: PrototypeUnit = {
    id: `unit-${input.hostPlayerId}`,
    ownerId: input.hostPlayerId,
    name: "DM Unit",
    team: "dm",
    hp: PROTOTYPE_MAX_HP,
    maxHp: PROTOTYPE_MAX_HP,
    position: { x: PROTOTYPE_BOARD_SIZE - 2, y: 1 },
    moveRemaining: PROTOTYPE_MOVE_DISTANCE,
    actionTaken: false,
  };

  return {
    schemaVersion: PROTOTYPE_SCHEMA_VERSION,
    id: input.id,
    name: input.name.trim() || "Adventure Prototype",
    hostPlayerId: input.hostPlayerId,
    status: "lobby",
    version: 1,
    board: {
      width: PROTOTYPE_BOARD_SIZE,
      height: PROTOTYPE_BOARD_SIZE,
      blocked: [
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
      ],
    },
    members,
    units: [...playerUnits, dmUnit],
    turnOrder: [],
    activeTurnIndex: 0,
    round: 1,
    winner: null,
    recentActionIds: [],
    log: [{
      id: `created-${input.id}`,
      at: input.now,
      actorId: input.hostPlayerId,
      message: `${input.name.trim() || "Adventure Prototype"} was created.`,
    }],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function canViewPrototypeRoom(room: PrototypeRoom, actorId: string) {
  return room.hostPlayerId === actorId || room.members.some((member) => member.playerId === actorId);
}

export function resolvePrototypeAction(
  room: PrototypeRoom,
  action: PrototypeActionRequest,
  actorId: string,
  now: string,
): PrototypeActionResult {
  if (!action.id || action.id.length > 120) return reject(room, "Invalid action identifier.");
  if (room.recentActionIds.includes(action.id)) return { ok: true, room, changed: false };
  if (action.expectedVersion !== room.version) {
    return reject(room, "The room changed before this action arrived.", "conflict");
  }
  if (!canViewPrototypeRoom(room, actorId)) return reject(room, "You are not invited to this room.", "forbidden");
  if (room.status === "closed") return reject(room, "This room is closed.");

  const isHost = room.hostPlayerId === actorId;
  const member = room.members.find((entry) => entry.playerId === actorId) || null;

  if (action.type === "join") {
    if (!member) return reject(room, "Only invited players can join.", "forbidden");
    if (room.status !== "lobby") return reject(room, "This encounter has already started.");
    if (member.joinedAt) return { ok: true, room, changed: false };
    const next = {
      ...room,
      members: room.members.map((entry) => entry.playerId === actorId ? { ...entry, joinedAt: now } : entry),
    };
    return { ok: true, room: commit(next, action, actorId, now, `${member.displayName} joined the room.`), changed: true };
  }

  if (action.type === "start") {
    if (!isHost) return reject(room, "Only the DM can start the encounter.", "forbidden");
    if (room.status !== "lobby") return reject(room, "The encounter has already started.");
    const joinedIds = new Set(room.members.filter((entry) => entry.joinedAt).map((entry) => entry.playerId));
    if (joinedIds.size === 0) return reject(room, "At least one invited player must join first.");
    const units = room.units
      .filter((unit) => unit.team === "dm" || joinedIds.has(unit.ownerId))
      .map(resetUnitForTurn);
    const turnOrder = [
      ...units.filter((unit) => unit.team === "players").map((unit) => unit.id),
      ...units.filter((unit) => unit.team === "dm").map((unit) => unit.id),
    ];
    const next = { ...room, status: "active" as const, units, turnOrder, activeTurnIndex: 0, round: 1 };
    return { ok: true, room: commit(next, action, actorId, now, "The DM started the encounter."), changed: true };
  }

  if (action.type === "close") {
    if (!isHost) return reject(room, "Only the DM can close the room.", "forbidden");
    const next = { ...room, status: "closed" as const };
    return { ok: true, room: commit(next, action, actorId, now, "The DM closed the room."), changed: true };
  }

  if (action.type === "skip_turn") {
    if (!isHost) return reject(room, "Only the DM can skip a turn.", "forbidden");
    if (room.status !== "active") return reject(room, "No active turn can be skipped.");
    const skipped = activeUnit(room);
    const next = advanceTurn(room);
    return {
      ok: true,
      room: commit(next, action, actorId, now, `The DM skipped ${skipped?.name || "the active unit"}'s turn.`),
      changed: true,
    };
  }

  if (room.status !== "active") return reject(room, "The encounter is not active.");
  const actorUnit = activeUnit(room);
  if (!actorUnit || actorUnit.ownerId !== actorId) return reject(room, "It is not your turn.", "forbidden");
  if (actorUnit.hp <= 0) return reject(room, "This unit cannot act.");

  if (action.type === "move") {
    const position = action.payload?.position;
    if (!position || !Number.isInteger(position.x) || !Number.isInteger(position.y)) {
      return reject(room, "Choose a valid grid space.");
    }
    if (position.x < 0 || position.y < 0 || position.x >= room.board.width || position.y >= room.board.height) {
      return reject(room, "That space is outside the board.");
    }
    const distance = movementCosts(room, actorUnit).get(pointKey(position));
    if (!distance) return reject(room, "That space cannot be reached with the unit's remaining movement.");
    const units = room.units.map((unit) => unit.id === actorUnit.id ? {
      ...unit,
      position: { x: position.x, y: position.y },
      moveRemaining: unit.moveRemaining - distance,
    } : unit);
    const next = { ...room, units };
    return { ok: true, room: commit(next, action, actorId, now, `${actorUnit.name} moved ${distance} space${distance === 1 ? "" : "s"}.`), changed: true };
  }

  if (action.type === "attack") {
    if (actorUnit.actionTaken) return reject(room, "This unit has already attacked this turn.");
    const target = room.units.find((unit) => unit.id === action.payload?.targetUnitId) || null;
    if (!target || target.hp <= 0) return reject(room, "Choose a living target.");
    if (target.team === actorUnit.team) return reject(room, "Friendly units cannot be attacked in this prototype.");
    const distance = Math.abs(target.position.x - actorUnit.position.x) + Math.abs(target.position.y - actorUnit.position.y);
    if (distance > 1) return reject(room, "Basic attacks only reach adjacent spaces.");
    const damage = Math.min(PROTOTYPE_ATTACK_DAMAGE, target.hp);
    const units = room.units.map((unit) => {
      if (unit.id === actorUnit.id) return { ...unit, actionTaken: true };
      if (unit.id === target.id) return { ...unit, hp: Math.max(0, unit.hp - PROTOTYPE_ATTACK_DAMAGE) };
      return unit;
    });
    const next = finishIfWon({ ...room, units });
    const result = commit(next, action, actorId, now, `${actorUnit.name} hit ${target.name} for ${damage} damage.`);
    return { ok: true, room: result, changed: true };
  }

  if (action.type === "end_turn") {
    const next = advanceTurn(room);
    return { ok: true, room: commit(next, action, actorId, now, `${actorUnit.name} ended their turn.`), changed: true };
  }

  return reject(room, "Unsupported prototype action.");
}

export function getPrototypeActiveUnit(room: PrototypeRoom) {
  return activeUnit(room);
}

export function getPrototypeUnitForActor(room: PrototypeRoom, actorId: string) {
  return unitForOwner(room, actorId);
}

export function getPrototypeReachablePoints(room: PrototypeRoom, unit: PrototypeUnit) {
  return Array.from(movementCosts(room, unit).entries()).map(([key, cost]) => {
    const [x, y] = key.split(":").map(Number);
    return { x, y, cost };
  });
}
