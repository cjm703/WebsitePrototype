import { distance, getAbilityById, getActivePlayer, getItemById, getTile, getUnitAt, isWalkable } from "./engine";
import type { AdventureActionMode, AdventurePlayer, AdventurePoint, AdventureSession, AdventureTile } from "./types";

export function pointKey(point: AdventurePoint) {
  return `${point.x},${point.y}`;
}

export function getReachableTiles(session: AdventureSession, player: AdventurePlayer | null): Set<string> {
  const result = new Set<string>();
  if (!session.map || !player || player.hp <= 0) return result;
  for (const tile of session.map.tiles) {
    if (distance(player.position, tile) <= player.moveRemaining && !tile.blocksMove && !getUnitAt(session, tile)) {
      result.add(pointKey(tile));
    }
  }
  return result;
}

export function getDangerTiles(session: AdventureSession): Set<string> {
  const result = new Set<string>();
  for (const enemy of session.enemies.filter((unit) => unit.hp > 0)) {
    if (!session.map) continue;
    for (const tile of session.map.tiles) {
      if (distance(enemy.position, tile) <= enemy.attackRange) result.add(pointKey(tile));
    }
  }
  return result;
}

export function getValidTargetIds(session: AdventureSession, player: AdventurePlayer | null, mode: AdventureActionMode): Set<string> {
  const result = new Set<string>();
  if (!player || player.hp <= 0) return result;
  if (mode.type === "attack") {
    session.enemies.filter((enemy) => enemy.hp > 0 && distance(player.position, enemy.position) <= 1).forEach((enemy) => result.add(enemy.id));
  }
  if (mode.type === "ability") {
    const ability = getAbilityById(player, mode.abilityId);
    if (!ability) return result;
    if (ability.kind === "heal") {
      session.players.filter((target) => target.hp > 0 && distance(player.position, target.position) <= ability.range).forEach((target) => result.add(target.id));
    } else if (ability.kind === "damage" || ability.kind === "mark") {
      session.enemies.filter((target) => target.hp > 0 && distance(player.position, target.position) <= ability.range).forEach((target) => result.add(target.id));
    }
  }
  if (mode.type === "item") {
    const item = getItemById(player, mode.itemId);
    if (!item) return result;
    if (item.kind === "heal" || item.kind === "cleanse") {
      session.players.filter((target) => target.hp > 0 && distance(player.position, target.position) <= item.range).forEach((target) => result.add(target.id));
    } else if (item.kind === "damage") {
      session.enemies.filter((target) => target.hp > 0 && distance(player.position, target.position) <= item.range).forEach((target) => result.add(target.id));
    }
  }
  return result;
}

export function getTileActionReason(session: AdventureSession, player: AdventurePlayer | null, tile: AdventureTile, mode: AdventureActionMode) {
  if (!player) return "Join this room to control a character.";
  if (session.status !== "playing") return "The encounter is not active.";
  const active = getActivePlayer(session);
  if (!active || active.playerId !== player.playerId) return "It is not your turn.";
  if (player.hp <= 0) return "This unit is down.";
  const unit = getUnitAt(session, tile);
  if (mode.type === "move") {
    if (player.moveRemaining <= 0) return "No movement remaining.";
    if (distance(player.position, tile) > player.moveRemaining) return "That tile is too far away.";
    if (!isWalkable(session, tile)) return getTile(session.map, tile)?.blocksMove ? "That tile is blocked." : "That tile is occupied.";
    return "";
  }
  if (mode.type === "attack") {
    if (player.actionTaken) return "Action already used.";
    if (unit?.kind !== "enemy") return "Choose an enemy.";
    if (distance(player.position, unit.unit.position) > 1) return "Enemy is out of melee range.";
    return "";
  }
  if (player.actionTaken) return "Action already used.";
  const valid = getValidTargetIds(session, player, mode);
  if (!unit || !valid.has(unit.unit.id)) return "That is not a valid target.";
  return "";
}
