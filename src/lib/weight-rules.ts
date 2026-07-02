import type { ManagedItem, PlayerData } from "@/app/components/types";

export type ItemWeightTier = "S" | "M" | "L" | "XL" | "Custom";

export const ITEM_WEIGHT_VALUES: Record<Exclude<ItemWeightTier, "Custom">, number> = {
  S: 0.5,
  M: 1,
  L: 2,
  XL: 5,
};

export const ITEM_WEIGHT_OPTIONS: Array<{
  value: ItemWeightTier;
  label: string;
}> = [
  { value: "S", label: "S (0.5 W)" },
  { value: "M", label: "M (1 W)" },
  { value: "L", label: "L (2 W)" },
  { value: "XL", label: "XL (5 W)" },
  { value: "Custom", label: "Custom" },
];

export const WOUND_DICE_INCREASE_LEVELS = [4, 8, 12] as const;

function normalizeFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getItemWeightTier(item: Pick<ManagedItem, "weightTier" | "weightValue"> | null | undefined): ItemWeightTier | null {
  const tier = item?.weightTier;
  if (tier === "S" || tier === "M" || tier === "L" || tier === "XL" || tier === "Custom") {
    return tier;
  }

  const numeric = normalizeFiniteNumber(item?.weightValue);
  if (numeric === 0.5) return "S";
  if (numeric === 1) return "M";
  if (numeric === 2) return "L";
  if (numeric === 5) return "XL";
  if (numeric !== null) return "Custom";
  return null;
}

export function getItemWeightValue(item: Pick<ManagedItem, "weightTier" | "weightValue"> | null | undefined) {
  const tier = getItemWeightTier(item);
  if (!tier) return null;
  if (tier === "Custom") {
    const numeric = normalizeFiniteNumber(item?.weightValue);
    return numeric === null ? null : Math.max(0, numeric);
  }
  return ITEM_WEIGHT_VALUES[tier];
}

export function formatWeightValue(value: number | null) {
  if (value === null) return "Not set";
  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, "");
}

export function formatItemWeight(item: Pick<ManagedItem, "weightTier" | "weightValue"> | null | undefined) {
  const tier = getItemWeightTier(item);
  const value = getItemWeightValue(item);
  if (!tier || value === null) return "Not set";
  if (tier === "Custom") return `Custom (${formatWeightValue(value)} W)`;
  return `${tier} (${formatWeightValue(value)} W)`;
}

export function getAutoMaxWeightFromCon(con: number) {
  const safeCon = Number.isFinite(con) ? con : 10;
  return 50 + Math.max(0, safeCon - 10) * 5;
}

export function usesAutoMaxWeight(player: Pick<PlayerData, "stats" | "maxWeight" | "autoMaxWeight"> | null | undefined) {
  if (!player) return true;
  if (typeof player.autoMaxWeight === "boolean") return player.autoMaxWeight;
  const autoValue = getAutoMaxWeightFromCon(player.stats?.CON ?? 10);
  const manualValue = normalizeFiniteNumber(player.maxWeight);
  return manualValue === null || manualValue === autoValue;
}

export function getBaseMaxWeight(player: Pick<PlayerData, "stats" | "maxWeight" | "autoMaxWeight"> | null | undefined) {
  if (!player) return 50;
  if (usesAutoMaxWeight(player)) return getAutoMaxWeightFromCon(player.stats?.CON ?? 10);
  const manualValue = normalizeFiniteNumber(player.maxWeight);
  return manualValue === null ? getAutoMaxWeightFromCon(player.stats?.CON ?? 10) : manualValue;
}
