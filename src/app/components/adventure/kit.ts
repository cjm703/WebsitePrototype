import { ADVENTURE_CLASSES } from "./data";
import type { AdventureEquipment, AdventureItem, AdventurePlayer } from "./types";

export function getEquipmentBonuses(player: AdventurePlayer) {
  const equipped = Object.values(player.equipment || {}).filter(Boolean) as AdventureEquipment[];
  return equipped.reduce(
    (totals, item) => ({
      maxHpBonus: totals.maxHpBonus + (item.maxHpBonus || 0),
      basicDamageBonus: totals.basicDamageBonus + (item.basicDamageBonus || 0),
      moveBonus: totals.moveBonus + (item.moveBonus || 0),
    }),
    { maxHpBonus: 0, basicDamageBonus: 0, moveBonus: 0 },
  );
}

export function getPlayerMove(player: AdventurePlayer) {
  const classDef = player.classDef || ADVENTURE_CLASSES[player.classId] || ADVENTURE_CLASSES.warrior;
  return Math.max(1, classDef.move + getEquipmentBonuses(player).moveBonus);
}

export function getPlayerBasicDamage(player: AdventurePlayer) {
  const classDef = player.classDef || ADVENTURE_CLASSES[player.classId] || ADVENTURE_CLASSES.warrior;
  return Math.max(1, classDef.basicDamage + getEquipmentBonuses(player).basicDamageBonus + Math.max(0, (player.campaignLevel || 1) - 1));
}

export function getPlayerMaxHp(player: AdventurePlayer) {
  const classDef = player.classDef || ADVENTURE_CLASSES[player.classId] || ADVENTURE_CLASSES.warrior;
  return Math.max(1, classDef.maxHp + getEquipmentBonuses(player).maxHpBonus + Math.max(0, (player.campaignLevel || 1) - 1) * 4);
}

export function applyEquipmentStats(player: AdventurePlayer): AdventurePlayer {
  const maxHp = getPlayerMaxHp(player);
  return {
    ...player,
    maxHp,
    hp: Math.max(0, Math.min(maxHp, player.hp || maxHp)),
    moveRemaining: Math.min(getPlayerMove(player), Math.max(0, player.moveRemaining || getPlayerMove(player))),
  };
}

export function addItemToInventory(inventory: AdventureItem[], item: AdventureItem) {
  const existing = inventory.find((entry) => entry.id === item.id);
  if (!existing) return [...inventory, { ...item }];
  return inventory.map((entry) => entry.id === item.id ? { ...entry, quantity: entry.quantity + item.quantity } : entry);
}

export function removeOneInventoryItem(inventory: AdventureItem[], itemId: string) {
  let removed: AdventureItem | null = null;
  const next = inventory
    .map((entry) => {
      if (entry.id !== itemId || removed) return entry;
      removed = entry;
      return { ...entry, quantity: Math.max(0, entry.quantity - 1) };
    })
    .filter((entry) => entry.quantity > 0);
  return { inventory: next, removed };
}
