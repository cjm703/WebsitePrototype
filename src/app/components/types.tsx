export interface PlayerStats {
  STR: number;
  AGI: number;
  CON: number;
  KNOW: number;
  WIS: number;
  WILL: number;
}

export interface PlayerData {
  id: string;
  name: string;
  class: string;
  level: number;
  stats: PlayerStats;
  currentHP: number;
  maxHP: number;
  armorClass: number;
  speed: string;
  woundDice: string;
  currentWounds: number;
  totalWounds: number;
  damageReduction: number;
  tempHP: number;
  currentWeight: number;
  maxWeight: number;
  exhaustion: number;
  maxExhaustion: number;
  authCode: string;
}

export interface TagField {
  id: string;
  name: string;
  type?: "text" | "number" | "dropdown" | "textarea" | "toggle" | "dice" | "attribute" | "skill" | "resource" | "slot";
  options?: string[];
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  defaultValue?: string;
  allowCustom?: boolean;
}

export interface TagDefinition {
  id: string;
  name: string;
  description: string;
  fields: TagField[];
}

export interface ManagedItem {
  id: string;
  name: string;
  rarity: string;
  type: string;
  tags: string[];
  description: string;
  assignedTo: string[];
  customFields: Record<string, string>;
  locked?: boolean;
  duplicatedFrom?: string;
}

export interface ManagedCard {
  id: string;
  name: string;
  type: string;
  actionCost: string;
  tags: string[];
  effect: string;
  assignedTo: string[];
  customFields: Record<string, string>;
  nodeTreeId?: string;
  nodeId?: string;
}

export type MagicTierKey = "cantrip" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

export interface PlayerMagicList {
  id: string;
  name: string;
  order: number;
  description?: string;
  tiers: Record<MagicTierKey, string[]>;
}

export interface LevelAbilityEntry {
  cardId: string;
  showInCards: boolean;
}

export interface LevelCategory {
  id: string;
  name: string;
  order: number;
  description?: string;
  cardEntries?: LevelAbilityEntry[];
  cardIds?: string[];
}

export interface InfoFollowUp {
  id: string;
  content: string;
  createdAt: string;
}

export interface ManagedInfo {
  id: string;
  title: string;
  tags: string[];
  content: string;
  assignedTo: string[];
  customFields: Record<string, string>;
  category?: string;
  followUps?: InfoFollowUp[];
  inWorldTime?: string;
  realWorldTime?: string;
  infoSubTab?: string;
}

export interface DMNotification {
  id: string;
  subject: string;
  message: string;
  assignedTo: string[];
  createdAt: string;
}

export interface NewsArticle {
  id: string;
  headline: string;
  summary: string;
  body: string;
  category: string;
  author: string;
  publishedAt: string;
  isFeatured: boolean;
}

export interface LoginProfile {
  id: string;
  name: string;
  hasAuthCode: boolean;
  description: string;
}
