import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import { User, Package, CreditCard, Info, Search, Tag, X, ChevronLeft, ChevronRight, ArrowLeft, Minus, Plus, Trash2, ChevronDown, Shield, Zap, Coins, Sword, Backpack, Crown, Eye, Gem, Shirt, Hand, Footprints, CircleDot, Save, Lock, Edit, Unlock, Sparkles, GitBranch, MessageSquare, SkipForward, Play, Dices, Banknote, Star, Scale, Clock, History, Flame, RefreshCw } from "lucide-react";
import { RenderFormattedText } from "./render-text";
import { RichTextEditor } from "./rich-text-editor";
import { MascotPopup } from "./mascot-popup";
import { getPlayerTheme, buildPageGradient, isGradient, firstColor, ts, type PlayerTheme } from "./player-theme";
import { DISPLAY_CONTENTS, SUNKEN_INPUT, SUNKEN_INPUT_DIM, S_MUTED, S_DIM, S_SUBTLE, S_TEXT, S_RED, S_GREEN_BTN, S_LABEL, S_LINK, S_WARN, S_ACCENT, S_SECTION_HDR } from "./shared-styles";
import { getOwnedStickers } from "./game-leaderboard";
import { playDiceRoll, playTabClick, playSuccessChime } from "./sound-effects";
import { safeGetItem } from "./safe-storage";
import { triggerDiceAnimation, parseDiceGroups } from "./dice-animation";
import { PlayerNodeTreeViewer, type NodeTree } from "./node-trees";
import { appStore } from "@/lib/app-store";
import { loadPlayerState, savePlayerState } from "@/lib/player-state-api";
import {
  collectLevelCardsForCards,
  collectMagicCardIds,
  getLevelCategoryCardIds,
  getLevelCategoryEntries,
  MAGIC_TIER_LABELS,
  MAGIC_TIER_ORDER,
  normalizeLevelCategories,
  normalizeMagicLists,
} from "@/lib/card-placement";
import {
  formatItemWeight,
  getAutoMaxWeightFromCon,
  getBaseMaxWeight,
  getItemWeightTier,
  getItemWeightValue,
  ITEM_WEIGHT_OPTIONS,
  usesAutoMaxWeight,
  WOUND_DICE_INCREASE_LEVELS,
} from "@/lib/weight-rules";
import { renderTypedField as renderTypedFieldShared, type TagFieldDef } from "./tag-field-renderer";
import type {
  LevelCategory,
  MagicTierKey,
  ManagedCard,
  ManagedInfo,
  ManagedItem,
  PlayerData,
  PlayerMagicList,
  PlayerStats,
  TagDefinition,
} from "./types";
import { STICKER_IMAGES } from "./sticker-images";
import PersonalFilesInformationPanel from "./personal-files-information-panel";
import {
  sanitizeInfoDocumentsForLoad,
  sanitizeInfoSubTabsForLoad,
  type InfoSubTab,
} from "./personal-files-information-utils";



// Status effect tracker row
interface StatusEffectRow {
  id: string;
  name: string;
  potency: string;
  duration: string;
  damage: string;
  effect: string;
  lastRoll?: string; // last rolled damage result
  buffType?: "attribute" | "skill" | "resource" | "";
  buffTarget?: string;
  buffValue?: string; // numeric buff value; can use P for potency
  targetType?: "self" | "enemy"; // from card "Target: Self" / "Target: Enemy" tags
}


type BuffSource = { label: string; value: number; type: "equip" | "status"; statusId?: string };
type BuffEntry = { key: string; category: "attribute" | "skill" | "resource"; total: number; sources: BuffSource[] };
interface QuickItem { id: string; name: string; qty: number; description?: string; category: "source" | "money" | "consumable"; sourceAmount?: number; sourceType?: string; priority?: boolean; }
interface SourceUsageEntry { id: string; cardName: string; sourceType: string; amount: number; timestamp: number; }
interface ActivityLogEntry { id: string; action: "use" | "add" | "remove" | "balance"; category: "source" | "money" | "consumable"; itemName: string; detail: string; timestamp: number; }
type CardSourceFilter = "all" | "direct" | "node" | "magic" | "level";
type CardSourceLabel = "Direct" | "Node" | "Magic" | "Level";

const CARD_TRACKER_BUCKET_KEY = "Tracker::Bucket";
const CARD_TRACKER_NAME_KEY = "Tracker::Effect Name";
const CARD_TRACKER_DURATION_KEY = "Tracker::Duration";
const CARD_TRACKER_POTENCY_KEY = "Tracker::Potency";
const CARD_TRACKER_DAMAGE_KEY = "Tracker::Damage";
const CARD_TRACKER_DESCRIPTION_KEY = "Tracker::Description";
const CARD_TRACKER_BUFF_TYPE_KEY = "Tracker::Buff Type";
const CARD_TRACKER_BUFF_TARGET_KEY = "Tracker::Buff Target";
const CARD_TRACKER_BUFF_VALUE_KEY = "Tracker::Buff Value";
const CARD_DESCRIPTION_KEY = "Description";
const QUICK_ROLL_PREFIX = "Quick Roll::";
const QUICK_ROLL_LABEL_KEY = "Label";
const QUICK_ROLL_EXPRESSION_KEY = "Expression";
const QUICK_ROLL_POTENCY_KEY = "Potency";
const EQUIPMENT_SLOTS_KEY = "Equipment::Slots";
const ITEM_INFO_PREFIX = "Info Field::";
const ITEM_INFO_LABEL_KEY = "Label";
const ITEM_INFO_CONTENT_KEY = "Content";
const ITEM_INFO_PLACEMENT_KEY = "Placement";
const ITEM_INFO_ROLL_LABEL_KEY = "Roll Label";
const ITEM_INFO_ROLL_EXPRESSION_KEY = "Roll Expression";
const ITEM_INFO_ROLL_POTENCY_KEY = "Roll Potency";
const ITEM_INFO_EQUIPPED_EFFECT_KEY = "Equipped Effect";
const ITEM_INFO_EQUIPPED_EFFECT_TEXT_KEY = "Equipped Effect Text";
const ITEM_INFO_TRACKER_MODE_KEY = "Tracker Mode";
const ITEM_INFO_TRACKER_NAME_KEY = "Tracker Name";
const ITEM_INFO_TRACKER_DURATION_KEY = "Tracker Duration";
const ITEM_INFO_TRACKER_POTENCY_KEY = "Tracker Potency";
const ITEM_INFO_TRACKER_DAMAGE_KEY = "Tracker Damage";
const ITEM_INFO_TRACKER_DESCRIPTION_KEY = "Tracker Description";
const ITEM_INFO_TRACKER_BUFF_TYPE_KEY = "Tracker Buff Type";
const ITEM_INFO_TRACKER_BUFF_TARGET_KEY = "Tracker Buff Target";
const ITEM_INFO_TRACKER_BUFF_VALUE_KEY = "Tracker Buff Value";
const LEGACY_USE_BUTTON_TAG = "use-able";
const USE_BUTTON_ENABLED_TAG = "Use Button Enabled";

const hasUseButtonEnabledTag = (card: ManagedCard) =>
  card.tags.some((tag) => {
    const normalized = String(tag || "").trim().toLowerCase();
    return normalized === LEGACY_USE_BUTTON_TAG || normalized === USE_BUTTON_ENABLED_TAG.toLowerCase();
  });

const getDisplayCardTagName = (tag: string) =>
  String(tag || "").trim().toLowerCase() === LEGACY_USE_BUTTON_TAG
    ? USE_BUTTON_ENABLED_TAG
    : tag;

interface QuickRollSlot {
  slotId: string;
  label: string;
  expression: string;
  potency: string;
}

interface ItemInfoField {
  fieldId: string;
  label: string;
  content: string;
  placement: "above" | "below";
  rollLabel: string;
  rollExpression: string;
  rollPotency: string;
  equippedEffect: boolean;
  equippedEffectText: string;
  trackerMode: "" | "status" | "ability";
  trackerName: string;
  trackerDuration: string;
  trackerPotency: string;
  trackerDamage: string;
  trackerDescription: string;
  trackerBuffType: "attribute" | "skill" | "resource" | "";
  trackerBuffTarget: string;
  trackerBuffValue: string;
}



// ========================
// Dice Expression Parser — supports NdM dice, P (potency), (), and full PEMDAS
// ========================
function rollDiceExpression(expr: string, potencyRaw: string): { total: number; breakdown: string } | null {
  // Strip TE suffix (and optional sign/step like "-TE3") from potency before using it
  const potencyClean = potencyRaw.replace(/\s*[+-]?\s*TE\s*\d*\s*$/i, "").trim();
  const potencyVal = parseFloat(potencyClean) || 0;

  // Replace P with the potency value.
  // Can't use \bP\b because in "Pd6" the 'd' is a word char so \b doesn't match.
  // Instead: P not preceded by a letter, not followed by a letter except d/D (dice).
  const processed = expr.replace(/(?<![a-zA-Z])P(?![a-ce-zA-CE-Z])/g, String(Math.floor(potencyVal)));

  // Check if the expression contains any digits worth evaluating
  if (!/\d/.test(processed)) return null;

  // Tokenizer
  type Token = { type: "num"; value: number } | { type: "dice"; count: number; sides: number; rolls: number[] } | { type: "op"; value: string } | { type: "lparen" } | { type: "rparen" };
  const tokens: Token[] = [];
  const breakdownParts: string[] = [];
  let i = 0;
  const s = processed.replace(/\s+/g, "");

  while (i < s.length) {
    if (s[i] === "(") { tokens.push({ type: "lparen" }); i++; continue; }
    if (s[i] === ")") { tokens.push({ type: "rparen" }); i++; continue; }
    if ("+-*/".includes(s[i])) { tokens.push({ type: "op", value: s[i] }); i++; continue; }

    if (/[0-9.]/.test(s[i])) {
      let numStr = "";
      while (i < s.length && /[0-9.]/.test(s[i])) { numStr += s[i]; i++; }
      if (i < s.length && s[i].toLowerCase() === "d") {
        i++; // skip 'd'
        let sidesStr = "";
        while (i < s.length && /[0-9]/.test(s[i])) { sidesStr += s[i]; i++; }
        const count = parseInt(numStr, 10) || 1;
        const sides = parseInt(sidesStr, 10) || 6;
        const rolls: number[] = [];
        for (let r = 0; r < count; r++) rolls.push(Math.floor(Math.random() * sides) + 1);
        tokens.push({ type: "dice", count, sides, rolls });
      } else {
        tokens.push({ type: "num", value: parseFloat(numStr) || 0 });
      }
      continue;
    }

    // Handle 'd' without leading number (e.g. "d20" = 1d20)
    if (s[i].toLowerCase() === "d" && i + 1 < s.length && /[0-9]/.test(s[i + 1])) {
      i++;
      let sidesStr = "";
      while (i < s.length && /[0-9]/.test(s[i])) { sidesStr += s[i]; i++; }
      const sides = parseInt(sidesStr, 10) || 6;
      const rolls = [Math.floor(Math.random() * sides) + 1];
      tokens.push({ type: "dice", count: 1, sides, rolls });
      continue;
    }

    i++; // skip unknown chars
  }

  // Recursive descent parser with PEMDAS
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => tokens[pos++];

  function parseExpr(): number {
    let left = parseTerm();
    while (peek()?.type === "op" && ((peek() as any).value === "+" || (peek() as any).value === "-")) {
      const op = (next() as any).value as string;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek()?.type === "op" && ((peek() as any).value === "*" || (peek() as any).value === "/")) {
      const op = (next() as any).value as string;
      const right = parseFactor();
      left = op === "*" ? left * right : (right !== 0 ? left / right : 0);
    }
    return left;
  }

  function parseFactor(): number {
    const t = peek();
    if (!t) return 0;
    if (t.type === "lparen") {
      next();
      const val = parseExpr();
      if (peek()?.type === "rparen") next();
      return val;
    }
    if (t.type === "num") { next(); return t.value; }
    if (t.type === "dice") {
      next();
      const sum = t.rolls.reduce((a, b) => a + b, 0);
      breakdownParts.push(`${t.count}d${t.sides}[${t.rolls.join(",")}]`);
      return sum;
    }
    if (t.type === "op" && t.value === "-") { next(); return -parseFactor(); }
    if (t.type === "op" && t.value === "+") { next(); return parseFactor(); }
    next();
    return 0;
  }

  const total = Math.floor(parseExpr());
  const breakdown = breakdownParts.length > 0 ? breakdownParts.join(" + ") : "";
  return { total, breakdown };
}

/** Check if a damage string contains rollable dice notation */
function hasDiceNotation(damage: string): boolean {
  return /\d*[dD]\d+/.test(damage) || /(?<![a-zA-Z])P(?![a-ce-zA-CE-Z])/.test(damage);
}

/** Check if potency has TE suffix — matches "5TE", "5 TE", "5-TE", "5+TE", "5-TE3", "5+TE2", etc. */
function hasTE(potency: string): boolean {
  return /\d\s*[+-]?\s*TE\s*\d*\s*$/i.test(potency.trim());
}

/** Parse TE suffix into { num, sign, step }. Returns null if not a TE potency value. */
function parseTE(potency: string): { num: number; sign: "+" | "-"; step: number } | null {
  const match = potency.trim().match(/^([+-]?\s*\d+(?:\.\d+)?)\s*([+-])?\s*TE\s*(\d+)?\s*$/i);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/\s/g, ""));
  const sign: "+" | "-" = match[2] === "+" ? "+" : "-";  // default to "-" (decay)
  const step = match[3] ? parseInt(match[3], 10) : 1;     // default to 1
  return { num, sign, step };
}

/** Step the numeric part of a TE potency. "-TE" subtracts, "+TE" adds. Optional step: "-TE3" subtracts 3. */
function stepTE(potency: string): string {
  const parsed = parseTE(potency);
  if (!parsed) return potency;
  const { num, sign, step } = parsed;
  const next = sign === "+" ? num + step : num - step;
  const stepStr = step !== 1 ? String(step) : "";
  return `${next}${sign}TE${stepStr}`;
}

function getBuiltInCardTrackerBucket(card: ManagedCard): "status" | "ability" | "" {
  const bucket = (card.customFields?.[CARD_TRACKER_BUCKET_KEY] || "").trim().toLowerCase();
  return bucket === "status" || bucket === "ability" ? bucket : "";
}

function hasBuiltInCardTracker(card: ManagedCard): boolean {
  return !!(
    getBuiltInCardTrackerBucket(card)
    || (card.customFields?.[CARD_TRACKER_NAME_KEY] || "").trim()
    || (card.customFields?.[CARD_TRACKER_DURATION_KEY] || "").trim()
    || (card.customFields?.[CARD_TRACKER_POTENCY_KEY] || "").trim()
    || (card.customFields?.[CARD_TRACKER_DAMAGE_KEY] || "").trim()
    || (card.customFields?.[CARD_TRACKER_DESCRIPTION_KEY] || "").trim()
  );
}

type StatusTag = TagDefinition;

const cfKey = (tagName: string, fieldName: string) => `${tagName}::${fieldName}`;

const RARITIES = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
const rarityColor = (r: string) => {
  switch (r) {
    case "Uncommon": return "#7ACA8A";
    case "Rare": return "#4A9AFF";
    case "Very Rare": return "#C4A0FF";
    case "Legendary": return "#FFAA4A";
    default: return "#9AAACC";
  }
};

function getActiveCustomFields(entity: { tags: string[] }, tagList: TagDefinition[]): { tagName: string; fieldName: string; key: string; fieldDef: TagFieldDef }[] {
  const fields: { tagName: string; fieldName: string; key: string; fieldDef: TagFieldDef }[] = [];
  entity.tags.forEach((tagName) => {
    const tagDef = tagList.find((t) => t.name === tagName);
    if (tagDef && tagDef.fields.length > 0) {
      tagDef.fields.forEach((f) => {
        fields.push({ tagName, fieldName: f.name, key: cfKey(tagName, f.name), fieldDef: f });
      });
    }
  });
  return fields;
}

// ========================
// Equipment Slots
// ========================
const EQUIP_SLOT_DEFS = [
  { id: "head", label: "Head", category: "Head" },
  { id: "face", label: "Face", category: "Face" },
  { id: "neck", label: "Neck", category: "Neck" },
  { id: "jacket", label: "Jacket / Cloak", category: "Jacket/Cloak" },
  { id: "armor", label: "Armor", category: "Armor" },
  { id: "shirt", label: "Shirt", category: "Shirt" },
  { id: "armguards", label: "Armguards", category: "Armguards" },
  { id: "gloves", label: "Gloves", category: "Gloves" },
  { id: "weapon_l", label: "Weapon (L)", category: "Weapon" },
  { id: "weapon_r", label: "Weapon (R)", category: "Weapon" },
  { id: "belt", label: "Belt", category: "Belt" },
  { id: "belt_slot", label: "Belt Slot", category: "Belt Slot" },
  { id: "leggings", label: "Leggings", category: "Leggings" },
  { id: "shoes", label: "Shoes", category: "Shoes" },
  { id: "ring1", label: "Ring 1", category: "Ring" },
  { id: "ring2", label: "Ring 2", category: "Ring" },
  { id: "ring3", label: "Ring 3", category: "Ring" },
  { id: "ring4", label: "Ring 4", category: "Ring" },
  { id: "ring5", label: "Ring 5", category: "Ring" },
  { id: "ring6", label: "Ring 6", category: "Ring" },
  { id: "ring7", label: "Ring 7", category: "Ring" },
  { id: "ring8", label: "Ring 8", category: "Ring" },
] as const;

type EquipSlotId = (typeof EQUIP_SLOT_DEFS)[number]["id"];

// Map slot categories to icons
const SLOT_ICONS: Record<string, React.FC<{ size?: number; style?: React.CSSProperties }>> = {
  Head: Crown,
  Face: Eye,
  Neck: Gem,
  "Jacket/Cloak": Shield,
  Armor: Shield,
  Shirt: Shirt,
  Armguards: Shield,
  Gloves: Hand,
  Weapon: Sword,
  Belt: CircleDot,
  "Belt Slot": CircleDot,
  Leggings: User,
  Shoes: Footprints,
  Ring: CircleDot,
};

const EQUIP_SLOT_CATEGORIES = [...new Set(EQUIP_SLOT_DEFS.map(s => s.category))];

interface EquipSlotAssignment {
  itemId: string | null;
  twoHanded?: boolean;
}

type EquipSlotState = Record<EquipSlotId, EquipSlotAssignment>;

const DEFAULT_EQUIP_SLOTS: EquipSlotState = Object.fromEntries(
  EQUIP_SLOT_DEFS.map(s => [s.id, { itemId: null }])
) as EquipSlotState;

// ========================
// Helpers
// ========================


// Check if a player id is included in an assignedTo value (supports both legacy string and new array format)
function isAssignedTo(assignedTo: string | string[], playerId: string): boolean {
  if (Array.isArray(assignedTo)) return assignedTo.includes(playerId) || assignedTo.includes("all");
  return assignedTo === playerId || assignedTo === "all";
}

const statMod = (val: number) => {
  const mod = Math.floor((val - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
};

const statModNum = (val: number) => Math.floor((val - 10) / 2);
const fmtMod = (n: number) => n >= 0 ? `+${n}` : `${n}`;

function getAllTags(items: { tags: string[] }[]): string[] {
  const tagSet = new Set<string>();
  items.forEach((item) => item.tags.forEach((t) => tagSet.add(t)));
  return Array.from(tagSet).sort();
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function extractDiceExpressions(value: string): string[] {
  const plain = stripHtml(value);
  const matches = plain.match(/(?:(?:\d*d\d+|P)(?:\s*(?:[+\-*/]\s*)(?:\d*d\d+|\d+|P))*)/gi) || [];
  const unique: string[] = [];

  matches.forEach((match) => {
    const cleaned = match.replace(/\s+/g, " ").trim();
    if (!cleaned || !hasDiceNotation(cleaned) || unique.includes(cleaned)) return;
    unique.push(cleaned);
  });

  return unique;
}


function getQuickRollSlots(customFields: Record<string, string> | null | undefined): QuickRollSlot[] {
  const entries = customFields || {};
  const slotIds = Array.from(new Set(
    Object.keys(entries)
      .filter((key) => key.startsWith(QUICK_ROLL_PREFIX))
      .map((key) => key.replace(QUICK_ROLL_PREFIX, "").split("::")[0])
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  return slotIds.map((slotId) => ({
    slotId,
    label: entries[`${QUICK_ROLL_PREFIX}${slotId}::${QUICK_ROLL_LABEL_KEY}`] || "",
    expression: entries[`${QUICK_ROLL_PREFIX}${slotId}::${QUICK_ROLL_EXPRESSION_KEY}`] || "",
    potency: entries[`${QUICK_ROLL_PREFIX}${slotId}::${QUICK_ROLL_POTENCY_KEY}`] || "",
  }));
}

function getItemInfoFieldKey(fieldId: string, fieldName: string) {
  return `${ITEM_INFO_PREFIX}${fieldId}::${fieldName}`;
}

function getItemInfoFields(customFields: Record<string, string> | null | undefined): ItemInfoField[] {
  const entries = customFields || {};
  const fieldIds = Array.from(new Set(
    Object.keys(entries)
      .filter((key) => key.startsWith(ITEM_INFO_PREFIX))
      .map((key) => key.replace(ITEM_INFO_PREFIX, "").split("::")[0])
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  return fieldIds.map((fieldId) => ({
    fieldId,
    label: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_LABEL_KEY)] || "",
    content: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_CONTENT_KEY)] || "",
    placement: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_PLACEMENT_KEY)] === "below" ? "below" : "above",
    rollLabel: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_ROLL_LABEL_KEY)] || "",
    rollExpression: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_ROLL_EXPRESSION_KEY)] || "",
    rollPotency: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_ROLL_POTENCY_KEY)] || "",
    equippedEffect: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_EQUIPPED_EFFECT_KEY)] === "1",
    equippedEffectText: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_EQUIPPED_EFFECT_TEXT_KEY)] || "",
    trackerMode: (entries[getItemInfoFieldKey(fieldId, ITEM_INFO_TRACKER_MODE_KEY)] || "") as "" | "status" | "ability",
    trackerName: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_TRACKER_NAME_KEY)] || "",
    trackerDuration: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_TRACKER_DURATION_KEY)] || "",
    trackerPotency: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_TRACKER_POTENCY_KEY)] || "",
    trackerDamage: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_TRACKER_DAMAGE_KEY)] || "",
    trackerDescription: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_TRACKER_DESCRIPTION_KEY)] || "",
    trackerBuffType: (entries[getItemInfoFieldKey(fieldId, ITEM_INFO_TRACKER_BUFF_TYPE_KEY)] || "") as "attribute" | "skill" | "resource" | "",
    trackerBuffTarget: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_TRACKER_BUFF_TARGET_KEY)] || "",
    trackerBuffValue: entries[getItemInfoFieldKey(fieldId, ITEM_INFO_TRACKER_BUFF_VALUE_KEY)] || "",
  }));
}

function getAllowedEquipSlots(customFields: Record<string, string> | null | undefined): string[] {
  const entries = customFields || {};
  const multi = (entries[EQUIPMENT_SLOTS_KEY] || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (multi.length > 0) return Array.from(new Set(multi));
  const legacy = (entries["Equipment::Slot"] || "").trim();
  return legacy ? [legacy] : [];
}

function isEquippableInSlot(customFields: Record<string, string> | null | undefined, slotId: string): boolean {
  const allowed = getAllowedEquipSlots(customFields);
  if (allowed.length === 0) return false;
  return allowed.includes(slotId) || (allowed.includes("ring") && slotId.startsWith("ring"));
}
function isPlayerHiddenCustomFieldKey(key: string): boolean {
  return key.startsWith("__editor_")
    || key === "__editor_mechanics_builder"
    || key === "__editor_section_blocks"
    || key.startsWith(QUICK_ROLL_PREFIX)
    || key.startsWith(ITEM_INFO_PREFIX);
}

export function PersonalFiles() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"character" | "inventory" | "cards" | "information">("character");
  const [inventorySubTab, setInventorySubTab] = useState<"equipped" | "effects" | "consumables" | "general">("equipped");
  const [cardsSubTab, setCardsSubTab] = useState<"cards" | "magic" | "nodetrees" | "levelabilities">("cards");
  const [playerNodeTrees, setPlayerNodeTrees] = useState<NodeTree[]>([]);
  const currentUser = safeGetItem("inet-user") || "";
  const currentUserId = safeGetItem("inet-user-id") || "";

  const [saveToast, setSaveToast] = useState<"saving" | "saved" | "error" | null>(null);
    const saveToastTimerRef = useRef<number | null>(null);

    const showSaveToast = useCallback((state: "saving" | "saved" | "error") => {
      setSaveToast(state);

      if (saveToastTimerRef.current) {
        window.clearTimeout(saveToastTimerRef.current);
      }

      if (state !== "saving") {
        saveToastTimerRef.current = window.setTimeout(() => {
          setSaveToast(null);
        }, 1400);
      }
  }, []);

const saveOpIdRef = useRef(0);

const runSaveWithToast = useCallback(async (saveFn: () => Promise<void>) => {
  const opId = ++saveOpIdRef.current;
  showSaveToast("saving");

  try {
    await saveFn();

    if (saveOpIdRef.current === opId) {
      showSaveToast("saved");
    }
  } catch (err) {
    if (saveOpIdRef.current === opId) {
      showSaveToast("error");
    }
    throw err;
  }
}, [showSaveToast]);


  const [isHydrating, setIsHydrating] = useState(true);
  const [quickItems, setQuickItems] = useState<QuickItem[]>([]);
  const [sourceUsed, setSourceUsed] = useState<SourceUsageEntry[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [proficiencyBonus, setProficiencyBonus] = useState(2);
  const [skillProficiencies, setSkillProficiencies] = useState<Record<string, false | "prof" | "expert">>({});
  const [equipSlots, setEquipSlots] = useState<EquipSlotState>({ ...DEFAULT_EQUIP_SLOTS });
  const [statusEffects, setStatusEffects] = useState<StatusEffectRow[]>([]);
  const [levelCategories, setLevelCategories] = useState<LevelCategory[]>([]);
  const [magicLists, setMagicLists] = useState<PlayerMagicList[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerData[]>([]);
  const [allItems, setAllItems] = useState<ManagedItem[]>([]);
  const [allCards, setAllCards] = useState<ManagedCard[]>([]);
  const [allInfos, setAllInfos] = useState<ManagedInfo[]>([]);
  const [itemTags, setItemTags] = useState<TagDefinition[]>([]);
  const [statusTags, setStatusTags] = useState<TagDefinition[]>([]);
  const [infoSubTabs, setInfoSubTabs] = useState<InfoSubTab[]>([]);

  const hydratePersonalFiles = useCallback(async () => {
    if (!currentUserId) {
      setIsHydrating(false);
      return;
    }

    setIsHydrating(true);
    try {
      const [
        items,
        cards,
        infos,
        itemTagRows,
        statusTagRows,
        infoSubTabRows,
        playerState,
      ] = await Promise.all([
        appStore.listItems<ManagedItem>(),
        appStore.listCards<ManagedCard>(),
        appStore.listInfos<ManagedInfo>(),
        appStore.listTags<TagDefinition>("item"),
        appStore.listTags<TagDefinition>("status"),
        appStore.listInfoSubTabs<InfoSubTab>(),
        loadPlayerState(),
      ]);

      const normalizedInfoSubTabs = sanitizeInfoSubTabsForLoad(infoSubTabRows);
      const normalizedInfos = sanitizeInfoDocumentsForLoad(infos, normalizedInfoSubTabs) as ManagedInfo[];

      setAllPlayers(playerState.player ? [playerState.player as PlayerData] : []);
      setAllItems(items);
      setAllCards(cards);
      setAllInfos(normalizedInfos);
      setItemTags(itemTagRows);
      setStatusTags(statusTagRows);
      setInfoSubTabs(normalizedInfoSubTabs);

      setQuickItems(playerState.quickItems ?? []);
      setSourceUsed(playerState.sourceUsage ?? []);
      setActivityLog(playerState.activityLog ?? []);
      setProficiencyBonus(playerState.skillSettings?.proficiencyBonus ?? 2);
      setSkillProficiencies(playerState.skillProficiencies ?? {});
      setEquipSlots({ ...DEFAULT_EQUIP_SLOTS, ...(playerState.equipmentSlots ?? {}) });
      setStatusEffects(playerState.statusEffects ?? []);
      setLevelCategories(normalizeLevelCategories(playerState.levelCategories ?? [], cards));
      setMagicLists(normalizeMagicLists(playerState.magicLists ?? []));
    } finally {
      setIsHydrating(false);
    }
  }, [currentUserId]);

  const hasHydratedRef = useRef(false);

  useEffect(() => {
    void hydratePersonalFiles();

    const onFocus = () => {
      void hydratePersonalFiles();
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hydratePersonalFiles]);

  useEffect(() => {
    if (!isHydrating) hasHydratedRef.current = true;
  }, [isHydrating]);

  useEffect(() => {
    if (!hasHydratedRef.current || !currentUserId) return;

    const timer = window.setTimeout(() => {
      showSaveToast("saving");

      void savePlayerState({
        quickItems,
        sourceUsage: sourceUsed,
        activityLog,
        skillSettings: { proficiencyBonus },
        skillProficiencies,
        equipmentSlots: equipSlots,
        statusEffects,
        levelCategories,
        magicLists,
      })
        .then(() => showSaveToast("saved"))
        .catch((err) => {
          console.error("Personal Files save failed:", err);
          showSaveToast("error");
        });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    currentUserId,
    quickItems,
    sourceUsed,
    activityLog,
    proficiencyBonus,
    skillProficiencies,
    equipSlots,
    statusEffects,
    levelCategories,
    magicLists,
    isHydrating,
    showSaveToast,
  ]);


  // ── Quick items for Sources/Money panels ──
  const [addingQuickCategory, setAddingQuickCategory] = useState<"source" | "money" | "consumable" | null>(null);
  const [quickName, setQuickName] = useState("");
  const [quickQty, setQuickQty] = useState("1");
  const [quickDesc, setQuickDesc] = useState("");
  const [quickSourceAmt, setQuickSourceAmt] = useState("0");
  const [quickSourceType, setQuickSourceType] = useState("All");
  const [viewingQuickItem, setViewingQuickItem] = useState<QuickItem | null>(null);
  const [editingQuickItem, setEditingQuickItem] = useState<QuickItem | null>(null);
  const [hoveredSourceTotal, setHoveredSourceTotal] = useState(false);

  const addActivityLog = (action: ActivityLogEntry["action"], category: ActivityLogEntry["category"], itemName: string, detail: string) => {
    setActivityLog(prev => [{ id: `al-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, action, category, itemName, detail, timestamp: Date.now() }, ...prev].slice(0, 50));
  };

  const addQuickItem = (cat: "source" | "money" | "consumable") => {
    if (!quickName.trim()) return;
    const item: QuickItem = {
      id: `qi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: quickName.trim(), qty: parseInt(quickQty) || 1,
      description: quickDesc.trim() || undefined, category: cat,
      ...(cat === "source" ? { sourceAmount: parseInt(quickSourceAmt) || 0, sourceType: quickSourceType } : {}),
    };
    setQuickItems(prev => [...prev, item]);
    addActivityLog("add", cat, item.name, `Added ${item.name} x${item.qty}${cat === "source" ? ` (${item.sourceAmount} ${item.sourceType} source)` : ""}`);
    setQuickName(""); setQuickQty("1"); setQuickDesc(""); setQuickSourceAmt("0"); setQuickSourceType("All"); setAddingQuickCategory(null);
  };
  const deleteQuickItem = (id: string) => {
    const qi = quickItems.find(i => i.id === id);
    if (qi) addActivityLog("remove", qi.category, qi.name, `Removed ${qi.name}`);
    setQuickItems(prev => prev.filter(i => i.id !== id)); setViewingQuickItem(null);
  };
  const updateQuickItemQty = (id: string, delta: number) => {
    setQuickItems(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i));
  };

  const toggleSkillProf = useCallback((skill: string) => {
    setSkillProficiencies(prev => {
      const cur = prev[skill];
      if (!cur) return { ...prev, [skill]: "prof" };
      if (cur === "prof") return { ...prev, [skill]: "expert" };
      return { ...prev, [skill]: false };
    });
  }, []);

  // Equipment slot state
  const [equipSearch, setEquipSearch] = useState("");
  const [equipFilterCat, setEquipFilterCat] = useState<string>("All");
  const [assigningSlot, setAssigningSlot] = useState<EquipSlotId | null>(null);

  // Player theme
  const [theme, setThemeState] = useState<PlayerTheme>(() => getPlayerTheme());
  const bc = (value: string) => firstColor(value);

  // Owned badges ��� auto-display all owned badges in the tab row
  const [ownedBadgeIds, setOwnedBadgeIds] = useState<string[]>(() => getOwnedStickers());

  // Reload theme/badges on focus
  useEffect(() => {
    const onFocus2 = () => {
      setThemeState(getPlayerTheme());
      setOwnedBadgeIds(getOwnedStickers());
    };
    window.addEventListener("focus", onFocus2);
    return () => window.removeEventListener("focus", onFocus2);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPersonalNodeTrees() {
      try {
        const trees = await appStore.listNodeTrees<NodeTree>();
        if (!cancelled) {
          setPlayerNodeTrees(trees);
        }
      } catch {
        if (!cancelled) {
          setPlayerNodeTrees([]);
        }
      }
    }

    void loadPersonalNodeTrees();

    const onFocus = () => {
      void loadPersonalNodeTrees();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const player = useMemo(
    () => allPlayers.find((p) => p.id === currentUserId) || null,
    [allPlayers, currentUserId]
  );

  const playerItems = useMemo(
    () => player ? allItems.filter((i) => isAssignedTo(i.assignedTo, player.id)) : [],
    [allItems, player]
  );

  const directPlayerCards = useMemo(
    () => player ? allCards.filter((c) => isAssignedTo(c.assignedTo, player.id)) : [],
    [allCards, player]
  );

  const playerInfos = useMemo(
    () => player ? allInfos.filter((i) => isAssignedTo(i.assignedTo, player.id) || isAssignedTo(i.assignedTo, "all")) : [], 
    [allInfos, player]
  );

  const normalizedLevelCategories = useMemo(
    () => normalizeLevelCategories(levelCategories, allCards),
    [levelCategories, allCards],
  );

  const normalizedMagicLists = useMemo(
    () => normalizeMagicLists(magicLists),
    [magicLists],
  );

  const allCardsById = useMemo(
    () => new Map(allCards.map((card) => [card.id, card])),
    [allCards],
  );

  const playerAssignedNodeTrees = useMemo(
    () =>
      player
        ? playerNodeTrees.filter(
            (tree) => tree.assignedTo.includes(player.id) || tree.assignedTo.includes("all"),
          )
        : [],
    [player, playerNodeTrees],
  );

  const nodeGrantedCardIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tree of playerAssignedNodeTrees) {
      for (const node of tree.nodes) {
        for (const cardId of node.cardIds) {
          ids.add(cardId);
        }
      }
    }
    return ids;
  }, [playerAssignedNodeTrees]);

  const magicCardIds = useMemo(
    () => collectMagicCardIds(normalizedMagicLists),
    [normalizedMagicLists],
  );

  const levelCardsForCards = useMemo(
    () => collectLevelCardsForCards(normalizedLevelCategories),
    [normalizedLevelCategories],
  );

  const cardSourceMap = useMemo(() => {
    const next = new Map<string, Set<CardSourceLabel>>();

    const addSource = (cardId: string, source: CardSourceLabel) => {
      if (!allCardsById.has(cardId)) return;
      const existing = next.get(cardId) || new Set<CardSourceLabel>();
      existing.add(source);
      next.set(cardId, existing);
    };

    for (const card of directPlayerCards) addSource(card.id, "Direct");
    for (const cardId of nodeGrantedCardIds) addSource(cardId, "Node");
    for (const cardId of magicCardIds) addSource(cardId, "Magic");
    for (const cardId of levelCardsForCards) addSource(cardId, "Level");

    return next;
  }, [allCardsById, directPlayerCards, nodeGrantedCardIds, magicCardIds, levelCardsForCards]);

  const playerCards = useMemo(
    () => allCards.filter((card) => cardSourceMap.has(card.id)),
    [allCards, cardSourceMap],
  );

  // ========================
  // Editable HP & Wounds — write back to inet-dm-players
  // ========================
  const [currentHP, setCurrentHP] = useState(player?.currentHP ?? 0);
  const [currentWounds, setCurrentWounds] = useState(player?.currentWounds ?? 0);

  // When data reloads (e.g. on focus), sync local editable state
  useEffect(() => {
    if (player) {
      setCurrentHP(player.currentHP);
      setCurrentWounds(player.currentWounds);
    }
  }, [player?.id, player?.currentHP, player?.currentWounds]);

  // Write HP/wounds changes back to inet-dm-players
  const persistPlayerField = useCallback(async (updates: Partial<PlayerData>) => {
    if (!player) return;

    const mergedPlayer = { ...player, ...updates };

    setAllPlayers([mergedPlayer]);
    await runSaveWithToast(() => savePlayerState({ playerPatch: updates as Record<string, unknown> }));
  }, [player, allPlayers, runSaveWithToast]);

  const handleSetHP = (newHP: number) => {
    const clamped = Math.max(0, Math.min(player?.maxHP ?? 0, newHP));
    setCurrentHP(clamped);
    void persistPlayerField({ currentHP: clamped });
  };

  const handleSetWounds = (newWounds: number) => {
    const clamped = Math.max(0, Math.min(player?.totalWounds ?? 0, newWounds));
    setCurrentWounds(clamped);
    void persistPlayerField({ currentWounds: clamped });
  };

  // ========================
  // New editable resource fields
  // ========================
  const [tempHP, setTempHP] = useState(player?.tempHP ?? 0);
  const [damageReduction, setDamageReduction] = useState(player?.damageReduction ?? 0);
  const [currentWeight, setCurrentWeight] = useState(player?.currentWeight ?? 0);
  const [insanityPoints, setInsanityPoints] = useState(player?.insanityPoints ?? 0);
  const [inspirationPoints, setInspirationPoints] = useState(player?.inspirationPoints ?? 0);
  const [foresight, setForesight] = useState(player?.foresight ?? false);
  const [exhaustion, setExhaustion] = useState(player?.exhaustion ?? 0);
  const [currentMovement, setCurrentMovement] = useState(() => parseInt(player?.speed || "0") || 0);
  const playerBaseMaxWeight = useMemo(() => getBaseMaxWeight(player), [player]);

  useEffect(() => {
    if (player) {
      setTempHP(player.tempHP ?? 0);
      setDamageReduction(player.damageReduction ?? 0);
      setCurrentWeight(player.currentWeight ?? 0);
      setInsanityPoints(player.insanityPoints ?? 0);
      setInspirationPoints(player.inspirationPoints ?? 0);
      setForesight(player.foresight ?? false);
      setExhaustion(player.exhaustion ?? 0);
      setCurrentMovement(parseInt(player.speed || "0") || 0);
    }
  }, [player?.id, player?.tempHP, player?.damageReduction, player?.currentWeight, player?.insanityPoints, player?.inspirationPoints, player?.foresight, player?.exhaustion, player?.speed]);

  const handleSetTempHP = (v: number) => { const c = Math.max(0, v); setTempHP(c); void persistPlayerField({ tempHP: c }); };
  const handleSetDR = (v: number) => { const c = Math.max(0, v); setDamageReduction(c); void persistPlayerField({ damageReduction: c }); };
  const handleSetWeight = (v: number) => { const c = Math.max(0, v); setCurrentWeight(c); void persistPlayerField({ currentWeight: c }); };
  const handleSetInsanityPoints = (v: number) => { const c = Math.max(0, v); setInsanityPoints(c); void persistPlayerField({ insanityPoints: c }); };
  const handleSetInspirationPoints = (v: number) => { const c = Math.max(0, v); setInspirationPoints(c); void persistPlayerField({ inspirationPoints: c }); };
  const handleSetForesight = (v: boolean) => { setForesight(v); void persistPlayerField({ foresight: v }); };
  const handleSetExhaustion = (v: number) => { const c = Math.max(0, Math.min(player?.maxExhaustion ?? 6, v)); setExhaustion(c); void persistPlayerField({ exhaustion: c }); };
  const handleSetMovement = (v: number) => { const c = Math.max(0, v); setCurrentMovement(c); void persistPlayerField({ speed: String(c) }); };

  // ========================
  // Character sub-tab (Resources vs Status Effects)
  // ========================
  const [charSubTab, setCharSubTab] = useState<"sheet" | "status">("sheet");
  const [buffTooltipKey, setBuffTooltipKey] = useState<string | null>(null);

  // ========================
  // Status Effects & Ability Duration Tracker
  // ========================
  const [selectedEffectIds, setSelectedEffectIds] = useState<Set<string>>(new Set());
  const [nameDropdownOpenId, setNameDropdownOpenId] = useState<string | null>(null);

  const addStatusEffect = () => {
    setStatusEffects((prev) => [...prev, { id: `se-${Date.now()}`, name: "", potency: "", duration: "", damage: "", effect: "" }]);
  };
  const addAbilityTracker = () => {
    setStatusEffects((prev) => [...prev, { id: `se-${Date.now()}`, name: "", potency: "", duration: "", damage: "", effect: "", targetType: "enemy" as const }]);
  };
  const removeSelectedEffects = () => {
    setStatusEffects((prev) => prev.filter((r) => !selectedEffectIds.has(r.id)));
    setSelectedEffectIds(new Set());
  };
  const updateEffect = (id: string, field: keyof StatusEffectRow, value: string) => {
    setStatusEffects((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  const toggleEffectSelected = (id: string) => {
    setSelectedEffectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectEffectFromTag = (rowId: string, tag: StatusTag) => {
    setStatusEffects((prev) => prev.map((r) => (r.id === rowId ? { ...r, name: tag.name, effect: tag.description } : r)));
    setNameDropdownOpenId(null);
    setLastAddedStatusEffect(tag.name);
  };

  // ── Roll damage dice for a status effect ──
  const [rollAnimatingId, setRollAnimatingId] = useState<string | null>(null);
  const handleRollDamage = (rowId: string) => {
    const row = statusEffects.find((r) => r.id === rowId);
    if (!row || !row.damage) return;

    // Trigger animation
    setRollAnimatingId(rowId);
    setTimeout(() => setRollAnimatingId(null), 600);

    // Parse dice groups for multi-dice animation
    const diceGroups = parseDiceGroups(row.damage, row.potency);
    const totalDice = diceGroups.reduce((s, g) => s + g.count, 0);
    playDiceRoll(totalDice);

    const result = rollDiceExpression(row.damage, row.potency);
    if (result) {
      // Use actual rolled values from the result breakdown to populate dice animation
      const animGroups = parseDiceGroups(row.damage, row.potency);
      triggerDiceAnimation(animGroups);
      const rollText = result.breakdown
        ? `⚔ ${result.total} (${result.breakdown})`
        : `⚔ ${result.total}`;
      setStatusEffects((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, lastRoll: rollText } : r))
      );
    }
  };

  // ── Turn End: decrement duration & TE potency ──
  const [turnEndFlash, setTurnEndFlash] = useState(false);
  const handleTurnEnd = () => {
    setStatusEffects((prev) => {
      const updated: StatusEffectRow[] = [];
      for (const row of prev) {
        let nextRow = { ...row };

        // Step TE potency if present (- decays, + grows)
        if (hasTE(nextRow.potency)) {
          nextRow.potency = stepTE(nextRow.potency);
        }

        // Decrement numeric duration
        const parsed = parseFloat(nextRow.duration);
        if (!isNaN(parsed)) {
          const next = parsed - 1;
          if (next <= 0) continue; // remove expired effects
          nextRow.duration = String(next);
        }
        // non-numeric duration (e.g. "Until rest") — keep as-is

        // Clear last roll on turn end
        nextRow.lastRoll = undefined;

        updated.push(nextRow);
      }
      return updated;
    });
    setTurnEndFlash(true);
    setTimeout(() => setTurnEndFlash(false), 600);
  };

  // ========================
  // Mascot popup tracking
  // ========================
  const [lastAddedStatusEffect, setLastAddedStatusEffect] = useState<string | null>(null);

  // Clear the event-trigger after it has been consumed
  useEffect(() => {
    if (lastAddedStatusEffect) {
      const t = setTimeout(() => setLastAddedStatusEffect(null), 500);
      return () => clearTimeout(t);
    }
  }, [lastAddedStatusEffect]);

  const mascotContext = useMemo(() => ({
    currentHP,
    maxHP: player?.maxHP ?? 1,
    currentWounds,
    totalWounds: player?.totalWounds ?? 1,
    currentWeight,
    maxWeight: playerBaseMaxWeight,
    exhaustion,
    maxExhaustion: player?.maxExhaustion ?? 6,
    statusEffectNames: statusEffects.map((se) => se.name).filter(Boolean),
  }), [currentHP, player?.maxHP, currentWounds, player?.totalWounds, currentWeight, playerBaseMaxWeight, exhaustion, player?.maxExhaustion, statusEffects]);

  // ========================
  // Inventory state
  // ========================
  const [invSearch, setInvSearch] = useState("");
  const [invActiveTags, setInvActiveTags] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<ManagedItem | null>(null);

  // ─��� Player item creation & editing ──
  const [editingPlayerItem, setEditingPlayerItem] = useState<ManagedItem | null>(null);
  const [isNewPlayerItem, setIsNewPlayerItem] = useState(false);

  const canPlayerEdit = (item: ManagedItem) => !item.locked;

  const startCreateItem = () => {
    setEditingPlayerItem({
      id: `pi-${Date.now()}`, name: "", rarity: "Common", type: "",
      weightTier: "M", weightValue: 1,
      tags: [], description: "", assignedTo: player ? [player.id] : [], customFields: {},
    });
    setIsNewPlayerItem(true);
  };
  const startEditItem = (item: ManagedItem) => {
    setEditingPlayerItem({
      ...item,
      weightTier: getItemWeightTier(item) ?? "M",
      weightValue: getItemWeightValue(item) ?? 1,
      customFields: { ...item.customFields },
    });
    setIsNewPlayerItem(false);
  };
  const cancelItemEditor = () => { setEditingPlayerItem(null); setIsNewPlayerItem(false); };
  const updateEditorField = <K extends keyof ManagedItem>(key: K, value: ManagedItem[K]) => {
    if (editingPlayerItem) setEditingPlayerItem({ ...editingPlayerItem, [key]: value });
  };
  const updateEditorWeightTier = (tier: ManagedItem["weightTier"]) => {
    if (!editingPlayerItem) return;
    const nextWeightValue =
      tier === "S" ? 0.5 :
      tier === "M" ? 1 :
      tier === "L" ? 2 :
      tier === "XL" ? 5 :
      editingPlayerItem.weightValue ?? 0;
    setEditingPlayerItem({ ...editingPlayerItem, weightTier: tier, weightValue: nextWeightValue });
  };
  const updateEditorCustomField = (key: string, value: string) => {
    if (editingPlayerItem) setEditingPlayerItem({ ...editingPlayerItem, customFields: { ...editingPlayerItem.customFields, [key]: value } });
  };
  const toggleEditorTag = (tagName: string) => {
    if (!editingPlayerItem) return;
    const has = editingPlayerItem.tags.includes(tagName);
    updateEditorField("tags", has ? editingPlayerItem.tags.filter((t) => t !== tagName) : [...editingPlayerItem.tags, tagName]);
  };
  const savePlayerItem = async () => {
    if (!editingPlayerItem || !editingPlayerItem.name.trim()) return;

    const itemToSave = editingPlayerItem;
    const updatedItems = isNewPlayerItem
      ? [...allItems, itemToSave]
      : allItems.map(i => i.id === itemToSave.id ? itemToSave : i);

    setAllItems(updatedItems);
    await runSaveWithToast(() => savePlayerState({ saveItem: itemToSave }));
    setEditingPlayerItem(null);
    setIsNewPlayerItem(false);
  };
  const deletePlayerItem = async (id: string) => {
    const updatedItems = allItems.filter(i => i.id !== id);
    setAllItems(updatedItems);
    await runSaveWithToast(() => savePlayerState({ deleteItemId: id }));

    if (editingPlayerItem?.id === id) {
      setEditingPlayerItem(null);
      setIsNewPlayerItem(false);
    }
  };

  // Cards state
  const [cardSearch, setCardSearch] = useState("");
  const [cardActiveTags, setCardActiveTags] = useState<string[]>([]);
  const [selectedCard, setSelectedCard] = useState<ManagedCard | null>(null);
  const [cardTreeFilter, setCardTreeFilter] = useState<string | null>(null);
  const [cardNodeFilter, setCardNodeFilter] = useState<string | null>(null);
  const [cardSortBy, setCardSortBy] = useState<"default" | "level" | "actionType" | "sourceType">("default");
  const [cardSourceFilter, setCardSourceFilter] = useState<CardSourceFilter>("all");

  const [magicSearch, setMagicSearch] = useState("");
  const [magicActiveTags, setMagicActiveTags] = useState<string[]>([]);
  const [magicSelectedCard, setMagicSelectedCard] = useState<ManagedCard | null>(null);
  const [selectedMagicListId, setSelectedMagicListId] = useState<string>("");

  // Level state (per-player)
  const [collapsedLevels, setCollapsedLevels] = useState<Set<string>>(new Set());
  const [laSearch, setLaSearch] = useState("");
  const [laActiveTags, setLaActiveTags] = useState<string[]>([]);
  const [laSelectedCard, setLaSelectedCard] = useState<ManagedCard | null>(null);
  const [laEditingLevel, setLaEditingLevel] = useState<string | null>(null);
  const isDM = currentUserId === "dm" || currentUser === "DM";

  const saveLevelCategories = useCallback(async (cats: typeof levelCategories) => {
    setLevelCategories(normalizeLevelCategories(cats, allCards));
  }, [allCards]);

  const toggleLevelCollapse = useCallback((id: string) => {
    setCollapsedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleLaTag = (tag: string) => {
    setLaActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const toggleMagicTag = (tag: string) => {
    setMagicActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  // Skills data — calculated from actual player stats
  const skillCategories = useMemo(() => {
    const stats = player?.stats ?? { STR: 10, AGI: 10, CON: 10, KNOW: 10, WIS: 10, WILL: 10 };
    return [
      { attr: "STR" as const, val: stats.STR, mod: statMod(stats.STR), skills: ["Saving Throw", "Athletics", "Grappling"] },
      { attr: "AGI" as const, val: stats.AGI, mod: statMod(stats.AGI), skills: ["Saving Throw", "Acrobatics", "Sleight of Hand", "Stealth"] },
      { attr: "CON" as const, val: stats.CON, mod: statMod(stats.CON), skills: ["Saving Throw", "Endurance", "Shock"] },
      { attr: "KNOW" as const, val: stats.KNOW, mod: statMod(stats.KNOW), skills: ["Saving Throw", "History", "Investigation", "Arcana", "Religion", "Medicine", "Nature", "Technology/Tinkering"] },
      { attr: "WIS" as const, val: stats.WIS, mod: statMod(stats.WIS), skills: ["Saving Throw", "Perception", "Insight", "Survival", "Persuasion"] },
      { attr: "WILL" as const, val: stats.WILL, mod: statMod(stats.WILL), skills: ["Saving Throw", "Charm", "Control", "Clear Mind"] },
    ];
  }, [player?.stats]);

  const allInvTags = useMemo(() => getAllTags(playerItems), [playerItems]);
  const allCardTags = useMemo(() => getAllTags(playerCards), [playerCards]);
  const allMagicTags = useMemo(() => getAllTags(playerCards.filter((card) => magicCardIds.has(card.id))), [playerCards, magicCardIds]);

  useEffect(() => {
    if (normalizedMagicLists.length === 0) {
      setSelectedMagicListId("");
      return;
    }
    if (!normalizedMagicLists.some((list) => list.id === selectedMagicListId)) {
      setSelectedMagicListId(normalizedMagicLists[0].id);
    }
  }, [normalizedMagicLists, selectedMagicListId]);

  const selectedMagicList = useMemo(
    () => normalizedMagicLists.find((list) => list.id === selectedMagicListId) || null,
    [normalizedMagicLists, selectedMagicListId],
  );

  const getCardSourceLabels = useCallback((cardId: string) => {
    return Array.from(cardSourceMap.get(cardId) || []);
  }, [cardSourceMap]);

  const filteredItems = useMemo(() => {
    return playerItems.filter((item) => {
      const matchesSearch =
        invSearch === "" ||
        item.name.toLowerCase().includes(invSearch.toLowerCase()) ||
        item.description.replace(/<[^>]*>/g, "").toLowerCase().includes(invSearch.toLowerCase()) ||
        item.tags.some((t) => t.toLowerCase().includes(invSearch.toLowerCase()));
      const matchesTags =
        invActiveTags.length === 0 || invActiveTags.every((t) => item.tags.includes(t));
      return matchesSearch && matchesTags;
    });
  }, [invSearch, invActiveTags, playerItems]);

  // ── Inventory subsection categorization ──
  const EQUIPPED_TYPES = new Set(["weapon", "armor", "shield", "helmet", "boots", "gloves", "ring", "amulet", "necklace", "cloak", "belt", "accessory", "equipment", "offhand", "off-hand", "trinket", "relic", "wand", "staff", "rod", "bow", "sword", "dagger", "axe", "mace", "spear", "focus", "arcane focus", "holy symbol"]);
  const CONSUMABLE_TYPES = new Set(["consumable", "potion", "scroll", "food", "drink", "currency", "money", "gold", "coin", "gem", "material", "reagent", "ingredient", "ammunition", "ammo", "supply"]);

  const categorizeItem = useCallback((item: ManagedItem): "equipped" | "consumable" | "general" => {
    const typeLower = (item.type || "").toLowerCase().trim();
    const tagsLower = item.tags.map(t => t.toLowerCase().trim());
    // Check tags first for explicit "equipped"/"consumable" markers
    if (tagsLower.includes("equipped") || tagsLower.includes("worn") || tagsLower.includes("wielded")) return "equipped";
    if (tagsLower.includes("consumable") || tagsLower.includes("currency") || tagsLower.includes("money") || tagsLower.includes("coins") || tagsLower.includes("source")) return "consumable";
    // Then check type
    if (EQUIPPED_TYPES.has(typeLower)) return "equipped";
    if (CONSUMABLE_TYPES.has(typeLower)) return "consumable";
    return "general";
  }, []);

  // Equipped & Consumables pull from all player items (no search/tag filtering)
  const equippedItems = useMemo(() => playerItems.filter(i => categorizeItem(i) === "equipped"), [playerItems, categorizeItem]);
  const consumableItems = useMemo(() => playerItems.filter(i => categorizeItem(i) === "consumable"), [playerItems, categorizeItem]);

  // Sub-categorize consumables into Source Items, Money, and Consumables
  const MONEY_TYPES = new Set(["currency", "money", "gold", "coin", "coins", "platinum", "silver", "copper", "electrum"]);
  const SOURCE_TYPES = new Set(["material", "reagent", "ingredient", "gem", "ore", "component", "source"]);
  const subCategorizeConsumable = useCallback((item: ManagedItem): "source" | "money" | "consumable" => {
    const typeLower = (item.type || "").toLowerCase().trim();
    const tagsLower = item.tags.map(t => t.toLowerCase().trim());
    if (tagsLower.includes("currency") || tagsLower.includes("money") || tagsLower.includes("coins") || MONEY_TYPES.has(typeLower)) return "money";
    if (tagsLower.includes("material") || tagsLower.includes("reagent") || tagsLower.includes("source") || tagsLower.includes("ingredient") || SOURCE_TYPES.has(typeLower)) return "source";
    return "consumable";
  }, []);
  const sourceItems = useMemo(() => consumableItems.filter(i => subCategorizeConsumable(i) === "source"), [consumableItems, subCategorizeConsumable]);
  const moneyItems = useMemo(() => consumableItems.filter(i => subCategorizeConsumable(i) === "money"), [consumableItems, subCategorizeConsumable]);
  const pureConsumableItems = useMemo(() => consumableItems.filter(i => subCategorizeConsumable(i) === "consumable"), [consumableItems, subCategorizeConsumable]);

  // General Inventory shows ALL items, filtered by search/tags when active
  const generalItems = filteredItems;

  // ── Source System Computations ──
  // Collect all available source types from items, QuickItems, and card tags
  const allSourceTypes = useMemo(() => {
    const types = new Set<string>(["All", "Fire"]);
    // From quick items
    quickItems.filter(qi => qi.category === "source" && qi.sourceType).forEach(qi => types.add(qi.sourceType!));
    // From items — look for "Source Type: X" tags
    [...sourceItems, ...playerItems].forEach(item => {
      item.tags.forEach(t => {
        const m = t.match(/^Source Type:\s*(.+)$/i);
        if (m) types.add(m[1].trim());
      });
    });
    // From cards
    playerCards.forEach(card => {
      card.tags.forEach(t => {
        const m = t.match(/^Source Type:\s*(.+)$/i);
        if (m) types.add(m[1].trim());
      });
    });
    return Array.from(types).sort((a, b) => a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b));
  }, [quickItems, sourceItems, playerItems, playerCards]);

  // Total source available (sum from all source items)
  const totalSourceByType = useMemo(() => {
    const byType: Record<string, number> = {};
    quickItems.filter(qi => qi.category === "source" && (qi.sourceAmount || 0) > 0).forEach(qi => {
      const st = qi.sourceType || "All";
      byType[st] = (byType[st] || 0) + (qi.sourceAmount || 0);
    });
    sourceItems.forEach(item => {
      const pts = parseInt(item.customFields["Source::Source Points"] || "0", 10);
      if (pts <= 0) return;
      let st = "All";
      for (const t of item.tags) {
        const m = t.match(/^Source Type:\s*(.+)$/i);
        if (m) { st = m[1].trim(); break; }
      }
      byType[st] = (byType[st] || 0) + pts;
    });
    return byType;
  }, [quickItems, sourceItems]);
  const totalSourceAll = useMemo(() => Object.values(totalSourceByType).reduce((s, v) => s + v, 0), [totalSourceByType]);

  // Total source used
  const totalSourceUsed = useMemo(() => sourceUsed.reduce((s, e) => s + e.amount, 0), [sourceUsed]);
  const sourceUsedByType = useMemo(() => {
    const byType: Record<string, number> = {};
    sourceUsed.forEach(e => { byType[e.sourceType] = (byType[e.sourceType] || 0) + e.amount; });
    return byType;
  }, [sourceUsed]);

  // ── Balance Source — subtract used source from all source items ──
  const handleBalanceSource = async () => {
    if (sourceUsed.length === 0) return;
    const remaining: Record<string, number> = { ...sourceUsedByType };
    const balancedNames: string[] = [];

    const tryDeduct = (st: string, available: number): number => {
      let toDeduct = 0;
      if (remaining[st] && remaining[st] > 0) {
        toDeduct = Math.min(remaining[st], available);
        remaining[st] -= toDeduct;
      } else if (remaining["All"] && remaining["All"] > 0) {
        toDeduct = Math.min(remaining["All"], available);
        remaining["All"] -= toDeduct;
      }
      if (toDeduct === 0) {
        for (const usedType of Object.keys(remaining)) {
          if (remaining[usedType] > 0 && (usedType === "All" || st === "All" || usedType === st)) {
            toDeduct = Math.min(remaining[usedType], available);
            remaining[usedType] -= toDeduct;
            break;
          }
        }
      }
      return toDeduct;
    };

    const updatedQuick = [...quickItems];
    const sourceQuickIdxs = updatedQuick
      .map((qi, idx) => ({ qi, idx }))
      .filter(({ qi }) => qi.category === "source" && (qi.sourceAmount || 0) > 0)
      .sort((a, b) => {
        if (a.qi.priority && !b.qi.priority) return -1;
        if (!a.qi.priority && b.qi.priority) return 1;
        return 0;
      });

    for (const { qi, idx } of sourceQuickIdxs) {
      const st = qi.sourceType || "All";
      const toDeduct = tryDeduct(st, qi.sourceAmount || 0);
      if (toDeduct > 0) {
        updatedQuick[idx] = { ...qi, sourceAmount: Math.max(0, (qi.sourceAmount || 0) - toDeduct) };
        balancedNames.push(`${qi.name} (-${toDeduct})`);
      }
    }
    setQuickItems(updatedQuick);

    const hasRemaining = Object.values(remaining).some(v => v > 0);
    if (hasRemaining) {
      const updatedItems = [...allItems];
      let itemsChanged = false;

      for (const item of sourceItems) {
        const pts = parseInt(item.customFields["Source::Source Points"] || "0", 10);
        if (pts <= 0) continue;

        let st = "All";
        for (const t of item.tags) {
          const m = t.match(/^Source Type:\s*(.+)$/i);
          if (m) { st = m[1].trim(); break; }
        }

        const toDeduct = tryDeduct(st, pts);
        if (toDeduct > 0) {
          const newPts = Math.max(0, pts - toDeduct);
          const idx = updatedItems.findIndex(i => i.id === item.id);
          if (idx !== -1) {
            updatedItems[idx] = {
              ...updatedItems[idx],
              customFields: {
                ...updatedItems[idx].customFields,
                "Source::Source Points": String(newPts),
              },
            };
            itemsChanged = true;
          }
          balancedNames.push(`${item.name} (-${toDeduct})`);
        }
      }

      if (itemsChanged) {
        setAllItems(updatedItems);
        await runSaveWithToast(async () => {
          const changedItems = updatedItems.filter((item) =>
            item.assignedTo.includes(player?.id || "") &&
            item.tags.some((t) => t.toLowerCase() === "source")
          );
          for (const item of changedItems) {
            await savePlayerState({ saveItem: item });
          }
        });
      }
    }

    setSourceUsed([]);
    if (balancedNames.length > 0) {
      addActivityLog("balance", "source", "Balance Source", `Balanced: ${balancedNames.join(", ")}`);
    }
  };

  // ── Equipment slot helpers ──
  const assignToSlot = useCallback((slotId: EquipSlotId, itemId: string | null, twoHanded?: boolean) => {
    setEquipSlots(prev => {
      const next = { ...prev };
      // If clearing
      if (!itemId) {
        // If this was a two-handed weapon occupying both slots, clear both
        if (slotId === "weapon_l" && prev.weapon_l.twoHanded) {
          next.weapon_l = { itemId: null };
          next.weapon_r = { itemId: null };
        } else if (slotId === "weapon_r" && prev.weapon_r.twoHanded) {
          next.weapon_l = { itemId: null };
          next.weapon_r = { itemId: null };
        } else {
          next[slotId] = { itemId: null };
        }
      } else if (twoHanded && (slotId === "weapon_l" || slotId === "weapon_r")) {
        // Two-handed: fill both weapon slots
        next.weapon_l = { itemId, twoHanded: true };
        next.weapon_r = { itemId, twoHanded: true };
      } else {
        next[slotId] = { itemId };
      }
      return next;
    });
    setAssigningSlot(null);
  }, []);

  const getItemForSlot = useCallback((slotId: EquipSlotId): ManagedItem | null => {
    const assignment = equipSlots[slotId];
    if (!assignment?.itemId) return null;
    return equippedItems.find(i => i.id === assignment.itemId) || playerItems.find(i => i.id === assignment.itemId) || null;
  }, [equipSlots, equippedItems, playerItems]);

  // ── Equipment buff aggregation ──
  const equipBuffs = useMemo(() => {
    const attrBuffs: Record<string, number> = {};
    const skillBuffs: Record<string, number> = {};
    const resourceBuffs: Record<string, number> = {};
    const disadvantages: Set<string> = new Set();
    const seenIds = new Set<string>();
    for (const slotDef of EQUIP_SLOT_DEFS) {
      const assignment = equipSlots[slotDef.id];
      if (!assignment?.itemId) continue;
      if (seenIds.has(assignment.itemId)) continue;
      seenIds.add(assignment.itemId);
      const item = equippedItems.find(i => i.id === assignment.itemId) || playerItems.find(i => i.id === assignment.itemId);
      if (!item) continue;
      const attrName = item.customFields["Attribute Buff::Attribute"];
      const attrAmt = Number(item.customFields["Attribute Buff::Amount"]);
      if (attrName && !isNaN(attrAmt) && attrAmt !== 0) attrBuffs[attrName] = (attrBuffs[attrName] || 0) + attrAmt;
      const skillName = item.customFields["Skill Buff::Skill"];
      const skillAmt = Number(item.customFields["Skill Buff::Amount"]);
      if (skillName && !isNaN(skillAmt) && skillAmt !== 0) skillBuffs[skillName] = (skillBuffs[skillName] || 0) + skillAmt;
      const resName = item.customFields["Resources Buff::Resource"];
      const resAmt = Number(item.customFields["Resources Buff::Amount"]);
      if (resName && !isNaN(resAmt) && resAmt !== 0) resourceBuffs[resName] = (resourceBuffs[resName] || 0) + resAmt;
      const disSkill = item.customFields["Disadvantageous::Skill"];
      if (disSkill) disadvantages.add(disSkill);
      // Armor AC Bonus
      const armorAC = item.customFields["Armor::AC Bonus"];
      if (armorAC) {
        const acNum = parseInt(armorAC.replace(/[^-\d]/g, ""), 10);
        if (!isNaN(acNum) && acNum !== 0) resourceBuffs["Armor Class"] = (resourceBuffs["Armor Class"] || 0) + acNum;
      }
    }
    return { attrBuffs, skillBuffs, resourceBuffs, disadvantages };
  }, [equipSlots, equippedItems, playerItems]);

  // ��─ Status Effect Buffs — active effects that augment attributes/skills/resources ──
  const seBuffs = useMemo(() => {
    const attrBuffs: Record<string, number> = {};
    const skillBuffs: Record<string, number> = {};
    const resourceBuffs: Record<string, number> = {};
    for (const row of statusEffects) {
      if (!row.buffType || !row.buffTarget || !row.buffValue) continue;
      if (row.targetType === "enemy") continue;
      // Resolve buff value — support P (potency) substitution
      const potencyClean = row.potency.replace(/\s*[+-]?\s*TE\s*\d*\s*$/i, "").trim();
      const potencyVal = parseFloat(potencyClean) || 0;
      const resolved = row.buffValue.replace(/(?<![a-zA-Z])P(?![a-ce-zA-CE-Z])/g, String(Math.floor(potencyVal)));
      const numVal = parseFloat(resolved) || 0;
      if (numVal === 0) continue;
      if (row.buffType === "attribute") attrBuffs[row.buffTarget] = (attrBuffs[row.buffTarget] || 0) + numVal;
      else if (row.buffType === "skill") skillBuffs[row.buffTarget] = (skillBuffs[row.buffTarget] || 0) + numVal;
      else if (row.buffType === "resource") resourceBuffs[row.buffTarget] = (resourceBuffs[row.buffTarget] || 0) + numVal;
    }
    return { attrBuffs, skillBuffs, resourceBuffs };
  }, [statusEffects]);

  // ── Aggregated buff summary with source tracking for the Buff/Debuff Bar ──
  const allBuffSummary = useMemo((): BuffEntry[] => {
    const map: Record<string, BuffEntry> = {};
    const ensure = (key: string, cat: BuffEntry["category"]) => {
      if (!map[key]) map[key] = { key, category: cat, total: 0, sources: [] };
      return map[key];
    };
    // Equipment attribute buffs
    for (const [attr, val] of Object.entries(equipBuffs.attrBuffs)) {
      if (val === 0) continue;
      const e = ensure(attr, "attribute");
      e.total += val; e.sources.push({ label: "Equipment", value: val, type: "equip" });
    }
    // Equipment skill buffs
    for (const [skill, val] of Object.entries(equipBuffs.skillBuffs)) {
      if (val === 0) continue;
      const e = ensure(skill, "skill");
      e.total += val; e.sources.push({ label: "Equipment", value: val, type: "equip" });
    }
    // Equipment resource buffs
    for (const [res, val] of Object.entries(equipBuffs.resourceBuffs)) {
      if (val === 0) continue;
      const e = ensure(res, "resource");
      e.total += val; e.sources.push({ label: "Equipment", value: val, type: "equip" });
    }
    // Status effect buffs
    for (const row of statusEffects) {
      if (!row.buffType || !row.buffTarget || !row.buffValue) continue;
      if (row.targetType === "enemy") continue;
      const potencyClean = row.potency.replace(/\s*[+-]?\s*TE\s*\d*\s*$/i, "").trim();
      const potencyVal = parseFloat(potencyClean) || 0;
      const resolved = row.buffValue.replace(/(?<![a-zA-Z])P(?![a-ce-zA-CE-Z])/g, String(Math.floor(potencyVal)));
      const numVal = parseFloat(resolved) || 0;
      if (numVal === 0) continue;
      const cat = row.buffType === "attribute" ? "attribute" : row.buffType === "skill" ? "skill" : "resource";
      const e = ensure(row.buffTarget, cat);
      e.total += numVal; e.sources.push({ label: row.name || "Status Effect", value: numVal, type: "status", statusId: row.id });
    }
    return Object.values(map).filter(e => e.total !== 0);
  }, [equipBuffs, statusEffects]);

  // Items available for equipping in the right panel (filtered by search + category)
  const equipCandidates = useMemo(() => {
    // Use ALL equippable items (equippedItems list)
    let items = equippedItems;

    // If actively assigning to a specific slot, filter by Equipment tag's Slot field
    if (assigningSlot) {
      items = items.filter((i) => isEquippableInSlot(i.customFields, assigningSlot));
    }

    if (equipSearch) {
      const q = equipSearch.toLowerCase();
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q) ||
        i.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    if (equipFilterCat !== "All") {
      // Filter by slot category match — use type and tags heuristic
      const catLower = equipFilterCat.toLowerCase();
      items = items.filter(i => {
        const typeLower = (i.type || "").toLowerCase();
        const tagsLower = i.tags.map(t => t.toLowerCase());
        const allText = [typeLower, ...tagsLower, i.name.toLowerCase()].join(" ");
        // Match category keywords
        if (catLower === "weapon") return ["weapon", "sword", "dagger", "axe", "mace", "spear", "bow", "staff", "rod", "wand", "offhand", "off-hand"].some(k => allText.includes(k));
        if (catLower === "ring") return allText.includes("ring");
        if (catLower === "armor") return ["armor", "plate", "chainmail", "leather armor", "mail"].some(k => allText.includes(k));
        if (catLower === "head") return ["head", "helmet", "helm", "hat", "crown", "circlet", "headband"].some(k => allText.includes(k));
        if (catLower === "face") return ["face", "mask", "visor", "goggles", "spectacles"].some(k => allText.includes(k));
        if (catLower === "neck") return ["neck", "necklace", "amulet", "pendant", "choker", "collar"].some(k => allText.includes(k));
        if (catLower === "jacket/cloak") return ["cloak", "jacket", "cape", "mantle", "robe"].some(k => allText.includes(k));
        if (catLower === "shirt") return ["shirt", "tunic", "vest", "undershirt"].some(k => allText.includes(k));
        if (catLower === "armguards") return ["armguard", "bracer", "vambrace", "armband"].some(k => allText.includes(k));
        if (catLower === "gloves") return ["glove", "gauntlet", "mitt", "hand"].some(k => allText.includes(k));
        if (catLower === "belt") return ["belt", "sash", "girdle"].some(k => allText.includes(k));
        if (catLower === "belt slot") return ["belt slot", "pouch", "holster", "sheath"].some(k => allText.includes(k));
        if (catLower === "leggings") return ["legging", "greave", "pants", "leg", "chausses"].some(k => allText.includes(k));
        if (catLower === "shoes") return ["shoe", "boot", "sandal", "slipper", "sabatons", "feet", "footwear"].some(k => allText.includes(k));
        return true;
      });
    }
    return items;
  }, [equippedItems, equipSearch, equipFilterCat, assigningSlot]);

  // Check if an item is a two-handed weapon (heuristic)
  const isTwoHandedItem = useCallback((item: ManagedItem): boolean => {
    const allText = [item.name, item.type, ...item.tags].join(" ").toLowerCase();
    return allText.includes("two-handed") || allText.includes("two handed") || allText.includes("2-handed") || allText.includes("2h");
  }, []);

  const filteredCards = useMemo(() => {
    return playerCards.filter((card) => {
      const matchesSearch =
        cardSearch === "" ||
        card.name.toLowerCase().includes(cardSearch.toLowerCase()) ||
        card.effect.replace(/<[^>]*>/g, "").toLowerCase().includes(cardSearch.toLowerCase()) ||
        card.tags.some((t) => t.toLowerCase().includes(cardSearch.toLowerCase()));
      const matchesTags =
        cardActiveTags.length === 0 || cardActiveTags.every((t) => card.tags.includes(t));
      const sourceLabels = getCardSourceLabels(card.id);
      const matchesSource =
        cardSourceFilter === "all" ||
        sourceLabels.some((source) => source.toLowerCase() === cardSourceFilter);
      const matchesTree = !cardTreeFilter || card.nodeTreeId === cardTreeFilter;
      const matchesNode = !cardNodeFilter || card.nodeId === cardNodeFilter;
      return matchesSearch && matchesTags && matchesSource && matchesTree && matchesNode;
    }).sort((a, b) => {
      if (cardSortBy === "level") {
        const aLvl = parseInt(a.customFields["Level"] || "0") || 0;
        const bLvl = parseInt(b.customFields["Level"] || "0") || 0;
        return aLvl - bLvl;
      }
      if (cardSortBy === "actionType") return (a.actionCost || "").localeCompare(b.actionCost || "");
      if (cardSortBy === "sourceType") return (a.customFields["Source Type"] || a.type || "").localeCompare(b.customFields["Source Type"] || b.type || "");
      return 0;
    });
  }, [cardSearch, cardActiveTags, playerCards, cardTreeFilter, cardNodeFilter, cardSortBy, cardSourceFilter, getCardSourceLabels]);

  const filteredMagicCardsByTier = useMemo(() => {
    if (!selectedMagicList) return {} as Record<MagicTierKey, ManagedCard[]>;

    return MAGIC_TIER_ORDER.reduce((acc, tier) => {
      const tierCards = (selectedMagicList.tiers[tier] || [])
        .map((cardId) => allCardsById.get(cardId))
        .filter(Boolean)
        .filter((card): card is ManagedCard => {
          const matchesSearch =
            magicSearch === "" ||
            card.name.toLowerCase().includes(magicSearch.toLowerCase()) ||
            card.effect.replace(/<[^>]*>/g, "").toLowerCase().includes(magicSearch.toLowerCase()) ||
            card.tags.some((tag) => tag.toLowerCase().includes(magicSearch.toLowerCase()));
          const matchesTags =
            magicActiveTags.length === 0 || magicActiveTags.every((tag) => card.tags.includes(tag));
          return matchesSearch && matchesTags;
        });
      acc[tier] = tierCards;
      return acc;
    }, {} as Record<MagicTierKey, ManagedCard[]>);
  }, [selectedMagicList, allCardsById, magicSearch, magicActiveTags]);

  const toggleInvTag = (tag: string) => {
    setInvActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const toggleCardTag = (tag: string) => {
    setCardActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const tabs = [
    { id: "character" as const, label: "Character", icon: User },
    { id: "inventory" as const, label: "Inventory", icon: Package },
    { id: "cards" as const, label: "Cards", icon: CreditCard },
    { id: "information" as const, label: "Information", icon: Info },
  ];

  // --- Render tag pill ---
  const renderTagPill = (tag: string, isActive: boolean, onClick: () => void) => (
    <button
      key={tag}
      onClick={onClick}
      className="text-[10px] px-2 py-0.5 transition-colors"
      style={{
        background: isActive ? theme.accentColor : theme.tagBg,
        color: isActive ? "#FFFFFF" : theme.tagText,
        border: `1px solid ${isActive ? theme.accentColor : theme.panelBorder}`,
      }}
    >
      {tag}
    </button>
  );

  // --- Custom fields display ---
  const SLOT_LABELS: Record<string, string> = Object.fromEntries(
    EQUIP_SLOT_DEFS.map(s => [s.id, s.label])
  );
  SLOT_LABELS["ring"] = "Ring (any)";

  const renderCustomFields = (customFields: Record<string, string>) => {
    const entries = Object.entries(customFields).filter(([k, v]) => v && !k.startsWith("Effect::") && !k.startsWith(QUICK_ROLL_PREFIX) && !k.startsWith(ITEM_INFO_PREFIX));
    if (entries.length === 0) return null;
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
        {entries.map(([key, value]) => {
          const [tagName, fieldName] = key.split("::");
          let displayValue = value;
          // Friendly slot label
          if (tagName === "Equipment" && fieldName === "Slot") {
            displayValue = SLOT_LABELS[value] || value;
          }
          // +/- prefix for buff amounts
          if ((tagName === "Attribute Buff" || tagName === "Skill Buff" || tagName === "Resources Buff") && fieldName === "Amount") {
            const n = Number(value);
            if (!isNaN(n) && n > 0) displayValue = `+${n}`;
          }
          return (
            <div key={key} className={`${retro.raised} bg-[#0E0E35] p-3`}>
              <div className="text-[9px] mb-1" style={S_MUTED}>
                {fieldName || tagName}
              </div>
              <div className="text-[13px]" style={{ color: theme.textColor }}>
                {displayValue}
              </div>
              {renderDiceRollControls(`custom-field:${key}`, String(displayValue), "", true)}
            </div>
          );
        })}
      </div>
    );
  };

  // --- Item Detail Screen ---
  const renderItemDetail = (item: ManagedItem) => (
    <div className="space-y-4">
      <button
        onClick={() => setSelectedItem(null)}
        className="flex items-center gap-1 text-[12px] hover:opacity-80 mb-2"
        style={ts(theme.accentColor)}
      >
        <ArrowLeft size={14} />
        BACK TO INVENTORY
      </button>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
        {(() => {
          const itemWeight = getItemWeightValue(item);
          return (
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-[20px] mb-1" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
              {item.name}
            </h2>
            <div className="text-[12px] flex items-center gap-2" style={S_LABEL}>
              {item.type}
              {item.rarity && (
                <span
                  className="px-2 py-0.5 text-[10px]"
                  style={{
                    background: item.rarity === "Rare" ? "#4A2A7B" : item.rarity === "Uncommon" ? "#2A5A3B" : "#2A2A5B",
                    color: item.rarity === "Rare" ? theme.rarityRare : item.rarity === "Uncommon" ? theme.rarityUncommon : theme.rarityCommon,
                    border: `1px solid ${item.rarity === "Rare" ? "#6A3A9B" : item.rarity === "Uncommon" ? "#3A7A4B" : "#3A3A6B"}`,
                  }}
                >
                  {item.rarity}
                </span>
              )}
              {item.locked && (
                <span className="text-[9px] px-1.5 py-0.5 inline-flex items-center gap-0.5" style={{ background: "rgba(255,106,106,0.08)", color: "#FF6A6A", border: "1px solid rgba(255,106,106,0.2)" }}>
                  <Lock size={8} /> DM LOCKED
                </span>
              )}
              {itemWeight !== null && (
                <span
                  className="px-2 py-0.5 text-[10px]"
                  style={{ background: "#10203F", color: "#8AB8FF", border: "1px solid #274274" }}
                >
                  Weight {formatItemWeight(item)}
                </span>
              )}
            </div>
          </div>
          {canPlayerEdit(item) && (
            <button
              onClick={() => { setSelectedItem(null); setInventorySubTab("general"); startEditItem(item); }}
              className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1.5 shrink-0`}
              style={{ color: "#5A9AFF" }}
            >
              <Edit size={12} /> Edit Item
            </button>
          )}
        </div>
          );
        })()}

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 flex items-center gap-1"
              style={{ background: theme.tagBg, color: theme.tagText, border: `1px solid ${bc(theme.panelBorder)}` }}
            >
              <Tag size={8} />
              {tag}
            </span>
          ))}
        </div>

        {/* Divider */}
        <div
          className="h-[1px] w-full mb-4"
          style={{ background: `linear-gradient(90deg, transparent, ${bc(theme.dividerColor)}, transparent)` }}
        />

        {(() => {
          const allowedSlots = getAllowedEquipSlots(item.customFields || {});
          const infoFields = getItemInfoFields(item.customFields || {});
          const quickRollCount = getQuickRollSlots(item.customFields || {}).filter((slot) => slot.expression.trim()).length + infoFields.filter((field) => field.rollExpression.trim()).length;
          const trackerCount = infoFields.filter((field) => field.trackerMode).length;
          const equippedEffectCount = infoFields.filter((field) => field.equippedEffect && stripHtml(field.equippedEffectText || field.content || "").trim()).length;
          const effectCount = Object.keys(item.customFields || {}).filter((key) => key.startsWith("Effect::") && String(item.customFields?.[key] || "").trim()).length;
          const itemWeight = getItemWeightValue(item);
          return (
            <div className={`grid grid-cols-2 md:grid-cols-3 ${itemWeight !== null ? "xl:grid-cols-7" : "xl:grid-cols-6"} gap-2 mb-4`}>
              <div className={`${retro.raised} bg-[#101038] px-3 py-2`}><div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Type</div><div className="text-[11px]" style={{ color: theme.textColor }}>{item.type || "None"}</div></div>
              <div className={`${retro.raised} bg-[#101038] px-3 py-2`}><div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Rarity</div><div className="text-[11px]" style={{ color: theme.textColor }}>{item.rarity || "Common"}</div></div>
              {itemWeight !== null && <div className={`${retro.raised} bg-[#101038] px-3 py-2`}><div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Weight</div><div className="text-[11px]" style={{ color: theme.textColor }}>{formatItemWeight(item)}</div></div>}
              <div className={`${retro.raised} bg-[#101038] px-3 py-2`}><div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Allowed Slots</div><div className="text-[11px]" style={{ color: theme.textColor }}>{allowedSlots.length > 0 ? allowedSlots.map((slot) => SLOT_LABELS[slot] || slot).join(", ") : "Not equippable"}</div></div>
              <div className={`${retro.raised} bg-[#101038] px-3 py-2`}><div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Information Fields</div><div className="text-[11px]" style={{ color: theme.textColor }}>{infoFields.length}</div></div>
              <div className={`${retro.raised} bg-[#101038] px-3 py-2`}><div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Quick Rolls</div><div className="text-[11px]" style={{ color: theme.textColor }}>{quickRollCount}</div></div>
              <div className={`${retro.raised} bg-[#101038] px-3 py-2`}><div className="text-[8px] uppercase tracking-[0.06em]" style={S_MUTED}>Effects / Trackers</div><div className="text-[11px]" style={{ color: theme.textColor }}>{effectCount + equippedEffectCount + trackerCount}</div></div>
            </div>
          );
        })()}

        {renderItemInfoFields(item, "above")}

        {/* Description */}
        <div className="mb-4">
          <div className="text-[11px] mb-2" style={{ color: "#5A7ABB", fontWeight: 600 }}>
            DESCRIPTION
          </div>
          <RenderFormattedText text={item.description} color={theme.textColor} baseSize={12} />
          {renderDiceRollControls(`item:${item.id}:description`, item.description, "")}
          {renderStoredQuickRollButtons(item.customFields || {}, `item:${item.id}:quick`, "")}
        </div>

        {renderItemInfoFields(item, "below")}

        {/* Effect areas */}
        {item.tags.includes("Effect") && (() => {
          const effectKeys = Object.keys(item.customFields ?? {})
            .filter(k => k.startsWith("Effect::"))
            .sort((a, b) => parseInt(a.split("::")[1]) - parseInt(b.split("::")[1]))
            .filter(k => item.customFields[k]?.trim());
          if (effectKeys.length === 0) return null;
          return (
            <div className="mb-4">
              <div className="text-[11px] mb-2" style={{ color: "#C4A0FF", fontWeight: 600 }}>
                <Sparkles size={12} className="inline mr-1" style={{ verticalAlign: "-1px" }} />
                EFFECTS
              </div>
              <div className="space-y-1.5">
                {effectKeys.map((key, i) => (
                  <div key={key} className={`${retro.sunken} p-3`} style={{ background: theme.inputBg }}>
                    {effectKeys.length > 1 && (
                      <div className="text-[9px] mb-1" style={{ color: "#7A6ABB", fontWeight: 600 }}>Effect #{i + 1}</div>
                    )}
                    <div className="text-[12px]" style={{ color: theme.textColor }}>
                      <RenderFormattedText text={item.customFields[key]} color={theme.textColor} baseSize={12} />
                    </div>
                    {renderDiceRollControls(`item:${item.id}:effect:${key}`, item.customFields[key] || "", "")}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Custom Fields */}
        {renderCustomFields(item.customFields)}
      </div>
    </div>
  );

  // ── Use Card (Use Button Enabled tag) ──
  const [useCardFlash, setUseCardFlash] = useState<string | null>(null);
  const [inlineDiceRollResults, setInlineDiceRollResults] = useState<Record<string, string>>({});

  const handleInlineDiceRoll = useCallback((rollKey: string, expression: string, potencyRaw = "") => {
    if (!hasDiceNotation(expression)) return;

    const diceGroups = parseDiceGroups(expression, potencyRaw);
    const totalDice = diceGroups.reduce((sum, group) => sum + group.count, 0);
    if (totalDice > 0) {
      playDiceRoll(totalDice);
    }

    const result = rollDiceExpression(expression, potencyRaw);
    if (!result) return;

    if (diceGroups.length > 0) {
      triggerDiceAnimation(diceGroups);
    }

    setInlineDiceRollResults((prev) => ({
      ...prev,
      [rollKey]: result.breakdown ? `${result.total} (${result.breakdown})` : `${result.total}`,
    }));
  }, []);

  const renderDiceRollControls = useCallback((sourceKey: string, value: string, potencyRaw = "", compact = false) => {
    const expressions = extractDiceExpressions(value);
    if (expressions.length === 0) return null;

    return (
      <div className={compact ? "mt-1 flex flex-wrap gap-1.5" : "mt-2 flex flex-wrap gap-2"}>
        {expressions.map((expression) => {
          const rollKey = `${sourceKey}:${expression}`;
          const result = inlineDiceRollResults[rollKey];
          return (
            <div key={rollKey} className="inline-flex items-center gap-1.5">
              <button
                onClick={() => handleInlineDiceRoll(rollKey, expression, potencyRaw)}
                className={`${retro.button} px-2 py-0.5 inline-flex items-center gap-1`}
                style={{
                  color: compact ? "#FFD166" : theme.accentColor,
                  fontSize: compact ? "10px" : "11px",
                }}
              >
                <Dices size={compact ? 10 : 11} />
                {expression}
              </button>
              {result && (
                <span className={compact ? "text-[10px]" : "text-[11px]"} style={{ color: "#FF6A6A", fontWeight: 700 }}>
                  {result}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }, [handleInlineDiceRoll, inlineDiceRollResults, theme.accentColor]);

  const renderStoredQuickRollButtons = useCallback((customFields: Record<string, string> | null | undefined, baseKey: string, defaultPotencyRaw = "") => {
    const slots = getQuickRollSlots(customFields).filter((slot) => slot.expression.trim());
    if (slots.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {slots.map((slot) => {
          const buttonLabel = slot.label.trim() || slot.expression.trim();
          const potencyRaw = slot.potency.trim() || defaultPotencyRaw;
          const result = inlineDiceRollResults[`${baseKey}:${slot.slotId}`];
          return (
            <div key={slot.slotId} className="flex items-center gap-1.5">
              <button
                onClick={() => handleInlineDiceRoll(`${baseKey}:${slot.slotId}`, slot.expression, potencyRaw)}
                className={`${retro.button} px-2.5 py-1.5 text-[11px] flex items-center gap-1.5`}
                style={{ color: theme.textColor, borderColor: bc(theme.panelBorder), background: "rgba(10,10,40,0.92)" }}
                title={slot.expression}
              >
                <Dices size={11} />
                {buttonLabel}
              </button>
              {result && (
                <span className="text-[11px]" style={{ color: "#FF6A6A", fontWeight: 700 }}>
                  {result}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }, [handleInlineDiceRoll, inlineDiceRollResults, theme.panelBorder, theme.textColor]);

  const applyItemInfoTracker = useCallback((item: ManagedItem, field: ItemInfoField) => {
    if (!field.trackerMode) return;

    const effectName = field.trackerName.trim() || field.label.trim() || item.name || "Item Effect";
    const duration = field.trackerDuration.trim() || "1";
    const potency = field.trackerPotency.trim() || field.rollPotency.trim();
    const damage = field.trackerDamage.trim() || field.rollExpression.trim();
    const description = field.trackerDescription.trim() || stripHtml(field.content || field.equippedEffectText || item.description || "") || `From item: ${item.name}`;

    let initialRoll: string | undefined;
    if (damage && hasDiceNotation(damage)) {
      const diceGroups = parseDiceGroups(damage, potency);
      const totalDice = diceGroups.reduce((s, g) => s + g.count, 0);
      if (totalDice > 0) playDiceRoll(totalDice);
      const result = rollDiceExpression(damage, potency);
      if (result) {
        if (diceGroups.length > 0) triggerDiceAnimation(diceGroups);
        initialRoll = result.breakdown ? `⚔ ${result.total} (${result.breakdown})` : `⚔ ${result.total}`;
      }
    } else {
      playSuccessChime();
    }

    const nextEffect: StatusEffectRow = {
      id: `item-se-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: effectName,
      potency,
      duration,
      damage,
      effect: description,
      lastRoll: initialRoll,
      ...(field.trackerMode === "status" && field.trackerBuffType && field.trackerBuffTarget ? {
        buffType: field.trackerBuffType,
        buffTarget: field.trackerBuffTarget,
        buffValue: field.trackerBuffValue,
      } : {}),
      targetType: field.trackerMode === "ability" ? "enemy" : "self",
    };

    setStatusEffects((prev) => [...prev, nextEffect]);
    setLastAddedStatusEffect(effectName);
  }, []);

  const renderItemInfoFields = useCallback((item: ManagedItem, placement: "above" | "below") => {
    const infoFields = getItemInfoFields(item.customFields || {}).filter((field) => {
      const hasVisibleContent = stripHtml(field.content || "").trim();
      const hasUtility = field.rollExpression.trim() || field.equippedEffect || field.trackerMode;
      return field.placement === placement && (field.label.trim() || hasVisibleContent || hasUtility);
    });

    if (infoFields.length === 0) return null;

    return (
      <div className="space-y-3 mb-4">
        {infoFields.map((field) => {
          const visibleContent = stripHtml(field.content || "").trim();
          const rollExpression = field.rollExpression.trim();
          const rollPotency = field.rollPotency.trim();
          const canApplyTracker = !!field.trackerMode;
          return (
            <div key={field.fieldId} className={`${retro.sunken} p-3`} style={{ background: theme.inputBg }}>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#8AB8FF", fontWeight: 700 }}>
                  {field.label.trim() || "Field"}
                </div>
                {canApplyTracker && (
                  <button
                    onClick={() => applyItemInfoTracker(item, field)}
                    className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`}
                    style={{ color: field.trackerMode === "ability" ? "#FF8A5A" : "#4ADE80" }}
                  >
                    <Play size={10} />
                    {field.trackerMode === "ability" ? "Add Card Effect" : "Add Status Effect"}
                  </button>
                )}
              </div>
              {visibleContent && (
                <RenderFormattedText text={field.content} color={theme.textColor} baseSize={12} />
              )}
              {rollExpression && (
                <div className="mt-2">
                  {renderDiceRollControls(`item:${item.id}:info-field:${field.fieldId}`, rollExpression, rollPotency || "")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }, [applyItemInfoTracker, renderDiceRollControls, theme.inputBg, theme.textColor]);

  const handleUseCard = (card: ManagedCard) => {
    const isUseButtonEnabled = hasUseButtonEnabledTag(card);
    if (!isUseButtonEnabled) return;

    const isBuff = card.tags.some((t) => t.toLowerCase() === "buff");
    const isTimedEffect = card.tags.some((t) => t.toLowerCase() === "timed effect");
    const builtInTrackerBucket = getBuiltInCardTrackerBucket(card);

    if (hasBuiltInCardTracker(card) && builtInTrackerBucket) {
      const effectName = card.customFields[CARD_TRACKER_NAME_KEY] || card.name;
      const duration = card.customFields[CARD_TRACKER_DURATION_KEY] || "1";
      const potency = card.customFields[CARD_TRACKER_POTENCY_KEY] || "";
      const damage = card.customFields[CARD_TRACKER_DAMAGE_KEY] || "";
      const description =
        card.customFields[CARD_TRACKER_DESCRIPTION_KEY]
        || card.customFields[CARD_DESCRIPTION_KEY]?.replace(/<[^>]*>/g, "")
        || card.effect.replace(/<[^>]*>/g, "");

      let initialRoll: string | undefined;
      if (damage && hasDiceNotation(damage)) {
        const diceGroups = parseDiceGroups(damage, potency);
        const totalDice = diceGroups.reduce((s, g) => s + g.count, 0);
        playDiceRoll(totalDice);
        const result = rollDiceExpression(damage, potency);
        if (result) {
          triggerDiceAnimation(parseDiceGroups(damage, potency));
          initialRoll = result.breakdown ? `⚔ ${result.total} (${result.breakdown})` : `⚔ ${result.total}`;
        }
      } else {
        playSuccessChime();
      }

      const buffType = (card.customFields[CARD_TRACKER_BUFF_TYPE_KEY] || "") as StatusEffectRow["buffType"];
      const buffTarget = card.customFields[CARD_TRACKER_BUFF_TARGET_KEY] || "";
      const buffValue = card.customFields[CARD_TRACKER_BUFF_VALUE_KEY] || "";

      const newEffect: StatusEffectRow = {
        id: `se-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: effectName,
        potency,
        duration,
        damage,
        effect: description || `From card: ${card.name}`,
        lastRoll: initialRoll,
        ...(builtInTrackerBucket === "status" && buffType && buffTarget ? { buffType, buffTarget, buffValue } : {}),
        targetType: builtInTrackerBucket === "ability" ? "enemy" : "self",
      };

      setStatusEffects((prev) => [...prev, newEffect]);
      setLastAddedStatusEffect(effectName);
    } else {
      if (isBuff) {
        const duration = card.customFields["Buff::Duration"] || "1";
        const stat = card.customFields["Buff::Stat"] || card.name;
        const amount = card.customFields["Buff::Amount"] || "";

        const newEffect: StatusEffectRow = {
          id: `se-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: stat || card.name,
          potency: amount,
          duration: duration,
          damage: "",
          effect: `From card: ${card.name}`,
        };

        setStatusEffects((prev) => [...prev, newEffect]);
      }

      if (isTimedEffect) {
        const effectName = card.customFields["Timed Effect::Effect Name"] || card.name;
        const duration = card.customFields["Timed Effect::Duration"] || "1";
        const potency = card.customFields["Timed Effect::Potency"] || "";
        const damage = card.customFields["Timed Effect::Damage"] || "";
        const description = card.customFields["Timed Effect::Description"] || card.effect.replace(/<[^>]*>/g, "");

        let initialRoll: string | undefined;
        if (damage && hasDiceNotation(damage)) {
          const diceGroups = parseDiceGroups(damage, potency);
          const totalDice = diceGroups.reduce((s, g) => s + g.count, 0);
          playDiceRoll(totalDice);
          const result = rollDiceExpression(damage, potency);
          if (result) {
            triggerDiceAnimation(parseDiceGroups(damage, potency));
            initialRoll = result.breakdown
              ? `⚔ ${result.total} (${result.breakdown})`
              : `⚔ ${result.total}`;
          }
        } else {
          playSuccessChime();
        }

        const buffType = (card.customFields["Timed Effect::Buff Type"] || "") as StatusEffectRow["buffType"];
        const buffTarget = card.customFields["Timed Effect::Buff Target"] || "";
        const buffValue = card.customFields["Timed Effect::Buff Value"] || "";

        let targetType: StatusEffectRow["targetType"];
        if (card.tags.some(t => /^Target:\s*Enemy$/i.test(t))) targetType = "enemy";
        else if (card.tags.some(t => /^Target:\s*Self$/i.test(t))) targetType = "self";

        const newEffect: StatusEffectRow = {
          id: `se-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: effectName,
          potency: potency,
          duration: duration,
          damage: damage,
          effect: description || `From card: ${card.name}`,
          lastRoll: initialRoll,
          ...(buffType && buffTarget ? { buffType, buffTarget, buffValue } : {}),
          ...(targetType ? { targetType } : {}),
        };

        setStatusEffects((prev) => [...prev, newEffect]);
        setLastAddedStatusEffect(effectName);
      }
    }

    // ── Source usage tracking ──
    const cardLevel = parseInt(card.customFields["Level"] || "0", 10);
    if (cardLevel > 0) {
      // Determine source type from card tags: look for "Source Type: X" tag
      let usedSourceType = "All";
      for (const t of card.tags) {
        const stMatch = t.match(/^Source Type:\s*(.+)$/i);
        if (stMatch) { usedSourceType = stMatch[1].trim(); break; }
      }
      const entry: SourceUsageEntry = {
        id: `su-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
        cardName: card.name,
        sourceType: usedSourceType,
        amount: cardLevel,
        timestamp: Date.now(),
      };
      setSourceUsed(prev => [...prev, entry]);
      addActivityLog("use", "source", card.name, `Used Lv.${cardLevel} (${usedSourceType} source)`);
    }

    // Flash feedback
    setUseCardFlash(card.id);
    setTimeout(() => setUseCardFlash(null), 800);
  };

  const getPlayerCardFamilyLabel = (card: ManagedCard) => {
    const stored = (card.customFields?.["Card Family"] || "").trim().toLowerCase();
    if (stored === "spell" || stored === "skill" || stored === "ability") return stored[0].toUpperCase() + stored.slice(1);
    const blob = `${card.type || ""} ${card.effect || ""} ${card.tags.join(" ")}`.toLowerCase();
    if (/(magical \(spell\)|spell|source magic)/.test(blob)) return "Spell";
    if (/(ability|passive|innate|granted|lineage|blood)/.test(blob)) return "Ability";
    if (/(skill|martial|technique|learned)/.test(blob)) return "Skill";
    return "";
  };

  const getPlayerCardComponentsDisplay = (card: ManagedCard) => {
    const base = (card.customFields?.["Use Profile::Components"] || "").trim();
    const detail = (card.customFields?.["Use Profile::Component Details"] || "").trim();
    if (base && detail) return `${base} (${detail})`;
    return base || detail || "";
  };

  const formatCardDetailField = (key: string, value: string) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return null;
    const [group, fieldNameRaw = ""] = key.split("::");
    const fieldName = fieldNameRaw || group;
    let label = fieldName;
    let displayValue = trimmed;

    if (group === "Use Profile") {
      label = fieldName;
    } else if (group === "Timed Effect") {
      label = fieldName === "Effect Name" ? "Effect Name" : fieldName;
    } else if (group === "Tracker") {
      label = fieldName;
    } else {
      label = fieldName || group;
    }

    return { key, label, value: displayValue };
  };

  const renderCardDetail = (card: ManagedCard) => {
    const isUseButtonEnabled = hasUseButtonEnabledTag(card);
    const justUsed = useCardFlash === card.id;
    const descriptionText = (card.customFields[CARD_DESCRIPTION_KEY] || "").trim();
    const detailRollPotency = (card.customFields?.[CARD_TRACKER_POTENCY_KEY] || card.customFields?.["Timed Effect::Potency"] || "").trim();
    const familyLabel = getPlayerCardFamilyLabel(card);
    const componentValue = getPlayerCardComponentsDisplay(card);
    const requirementsValue = (card.customFields?.["Use Profile::Requirements"] || "").trim();
    const componentsOrRequirementsLabel = componentValue ? "Components" : requirementsValue ? "Requirements" : "";
    const componentsOrRequirementsValue = componentValue || requirementsValue;

    const primaryFacts = [
      card.customFields["Level"] ? { label: "Level", value: `Lv. ${card.customFields["Level"]}` } : null,
      familyLabel ? { label: "Type", value: familyLabel } : null,
      (card.customFields?.["Use Profile::Range"] || "").trim() ? { label: "Range", value: card.customFields["Use Profile::Range"].trim() } : null,
      componentsOrRequirementsLabel && componentsOrRequirementsValue ? { label: componentsOrRequirementsLabel, value: componentsOrRequirementsValue } : null,
      (card.customFields?.["Use Profile::Duration"] || "").trim() ? { label: "Duration", value: card.customFields["Use Profile::Duration"].trim() } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;

    const hiddenKeys = new Set<string>([
      CARD_DESCRIPTION_KEY,
      "Level",
      "Use Profile::Range",
      "Use Profile::Duration",
      "Use Profile::Requirements",
      "Use Profile::Components",
      "Use Profile::Component Details",
      "Card Family",
    ]);

    const useProfileFields = Object.entries(card.customFields || {})
      .filter(([key, value]) => String(value || "").trim() && key.startsWith("Use Profile::") && !hiddenKeys.has(key) && !isPlayerHiddenCustomFieldKey(key))
      .map(([key, value]) => formatCardDetailField(key, String(value)))
      .filter(Boolean) as Array<{ key: string; label: string; value: string }>;

    const trackerFields = [
      formatCardDetailField(CARD_TRACKER_NAME_KEY, card.customFields?.[CARD_TRACKER_NAME_KEY] || card.name || ""),
      formatCardDetailField(CARD_TRACKER_DURATION_KEY, card.customFields?.[CARD_TRACKER_DURATION_KEY] || ""),
      formatCardDetailField(CARD_TRACKER_POTENCY_KEY, card.customFields?.[CARD_TRACKER_POTENCY_KEY] || ""),
      formatCardDetailField(CARD_TRACKER_DAMAGE_KEY, card.customFields?.[CARD_TRACKER_DAMAGE_KEY] || ""),
      formatCardDetailField(CARD_TRACKER_BUFF_TYPE_KEY, card.customFields?.[CARD_TRACKER_BUFF_TYPE_KEY] || ""),
      formatCardDetailField(CARD_TRACKER_BUFF_TARGET_KEY, card.customFields?.[CARD_TRACKER_BUFF_TARGET_KEY] || ""),
      formatCardDetailField(CARD_TRACKER_BUFF_VALUE_KEY, card.customFields?.[CARD_TRACKER_BUFF_VALUE_KEY] || ""),
    ].filter(Boolean) as Array<{ key: string; label: string; value: string }>;

    const timedEffectFields = Object.entries(card.customFields || {})
      .filter(([key, value]) => String(value || "").trim() && key.startsWith("Timed Effect::") && !isPlayerHiddenCustomFieldKey(key))
      .map(([key, value]) => formatCardDetailField(key, String(value)))
      .filter(Boolean) as Array<{ key: string; label: string; value: string }>;

    const otherDetailFields = Object.entries(card.customFields || {})
      .filter(([key, value]) => {
        if (!String(value || "").trim()) return false;
        if (key.startsWith("Effect::")) return false;
        if (isPlayerHiddenCustomFieldKey(key)) return false;
        if (hiddenKeys.has(key)) return false;
        if (key.startsWith("Use Profile::")) return false;
        if (key.startsWith("Timed Effect::")) return false;
        if (key.startsWith("Tracker::")) return false;
        return true;
      })
      .map(([key, value]) => formatCardDetailField(key, String(value)))
      .filter(Boolean) as Array<{ key: string; label: string; value: string }>;

    const sidebarSections = [
      useProfileFields.length > 0 ? { title: "Use Details", accent: "#6AA8FF", fields: useProfileFields } : null,
      trackerFields.length > 0 ? { title: getBuiltInCardTrackerBucket(card) === "ability" ? "Tracker" : "Status Tracker", accent: getBuiltInCardTrackerBucket(card) === "ability" ? "#FF8A5A" : "#4ADE80", fields: trackerFields } : null,
      timedEffectFields.length > 0 ? { title: "Timed Effect", accent: "#4ADE80", fields: timedEffectFields } : null,
      otherDetailFields.length > 0 ? { title: "More Details", accent: "#9A8CFF", fields: otherDetailFields } : null,
    ].filter(Boolean) as Array<{ title: string; accent: string; fields: Array<{ key: string; label: string; value: string }> }>;

    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedCard(null)}
          className="flex items-center gap-1 text-[12px] hover:opacity-80 mb-2"
          style={ts(theme.accentColor)}
        >
          <ArrowLeft size={14} />
          BACK TO CARDS
        </button>

        <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
          <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
            <div>
              <h2 className="text-[20px] mb-1" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                {card.name}
              </h2>
              <div className="text-[12px]" style={S_LABEL}>
                {card.type || "No type"} · {card.actionCost || "No action cost"}
                {card.customFields["Level"] && <div style={DISPLAY_CONTENTS}> · <span style={{ color: "#FFD700" }}>Lv.{card.customFields["Level"]}</span></div>}
              </div>
            </div>
            {isUseButtonEnabled && (
              <button
                onClick={() => handleUseCard(card)}
                className={`${retro.button} px-4 py-2 text-[13px] flex items-center gap-2 font-semibold transition-all`}
                style={{
                  color: justUsed ? "#FFF" : "#4ADE80",
                  background: justUsed ? "#4ADE8033" : "#0A0A28",
                  border: `1px solid ${justUsed ? "#4ADE80" : "#4ADE8066"}`,
                }}
              >
                <Play size={14} fill={justUsed ? "#FFF" : "#4ADE80"} />
                {justUsed ? "Activated!" : "Use"}
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {card.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 flex items-center gap-1"
                style={{ background: theme.tagBg, color: theme.tagText, border: `1px solid ${bc(theme.panelBorder)}` }}
              >
                <Tag size={8} />
                {getDisplayCardTagName(tag)}
              </span>
            ))}
          </div>

          {primaryFacts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 mb-4">
              {primaryFacts.map((fact) => (
                <div
                  key={fact.label}
                  className={`${retro.raised} px-2.5 py-2 min-h-[46px]`}
                  style={{ background: "rgba(12,18,46,0.94)", border: `1px solid ${bc(theme.panelBorder)}` }}
                >
                  <div className="text-[8px] uppercase tracking-[0.07em] mb-0.5" style={S_MUTED}>{fact.label}</div>
                  <div className="text-[10px] leading-snug break-words" style={{ color: theme.textColor, fontWeight: 600 }}>{fact.value}</div>
                </div>
              ))}
            </div>
          )}

          <div
            className="h-[1px] w-full mb-4"
            style={{ background: `linear-gradient(90deg, transparent, ${bc(theme.dividerColor)}, transparent)` }}
          />

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.08fr)_minmax(210px,0.72fr)] gap-4 items-start">
            <div className="space-y-4 min-w-0">
              {descriptionText && (
                <div
                  className={`${retro.sunken} p-4`}
                  style={{ background: "linear-gradient(180deg, rgba(13,18,43,0.96) 0%, rgba(10,10,40,0.96) 100%)", border: `1px solid ${bc(theme.panelBorder)}` }}
                >
                  <div className="text-[10px] uppercase tracking-[0.1em] mb-2" style={{ color: "#7FA6FF", fontWeight: 700 }}>
                    Description
                  </div>
                  <RenderFormattedText text={descriptionText} color={theme.textColor} baseSize={12} />
                  {renderDiceRollControls(`card:${card.id}:description`, descriptionText, detailRollPotency)}
                </div>
              )}

              <div
                className={`${retro.sunken} p-4`}
                style={{ background: "linear-gradient(180deg, rgba(14,17,48,0.98) 0%, rgba(10,10,40,0.98) 100%)", border: `1px solid ${bc(theme.panelBorder)}` }}
              >
                <div className="text-[10px] uppercase tracking-[0.1em] mb-2" style={{ color: "#8AB8FF", fontWeight: 700 }}>
                  Effect
                </div>
                <RenderFormattedText text={card.effect} color={theme.textColor} baseSize={12} />
                {renderDiceRollControls(`card:${card.id}:effect`, card.effect, detailRollPotency)}
                {renderStoredQuickRollButtons(card.customFields || {}, `card:${card.id}:quick`, detailRollPotency)}
              </div>
            </div>

            <div className="space-y-3 min-w-0">
              {sidebarSections.map((section) => (
                <div
                  key={section.title}
                  className={`${retro.raised} p-2.5`}
                  style={{ background: "rgba(11,14,40,0.92)", border: `1px solid ${section.accent}33` }}
                >
                  <div className="text-[9px] uppercase tracking-[0.07em] mb-1.5" style={{ color: section.accent, fontWeight: 700 }}>
                    {section.title}
                  </div>
                  <div className="space-y-2">
                    {section.fields.map((field) => (
                      <div key={field.key} className="pb-1.5 last:pb-0 border-b last:border-b-0" style={{ borderColor: `${section.accent}18` }}>
                        <div className="text-[7px] uppercase tracking-[0.05em] mb-0.5" style={S_MUTED}>{field.label}</div>
                        <div className="text-[10px] leading-snug break-words" style={{ color: theme.textColor }}>{field.value}</div>
                        {renderDiceRollControls(`card:${card.id}:sidebar:${field.key}`, field.value, detailRollPotency, true)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- Search + Filter Bar ---
  const renderSearchBar = (
    searchValue: string,
    onSearchChange: (v: string) => void,
    allTags: string[],
    activeTags: string[],
    onToggleTag: (tag: string) => void,
    placeholder: string
  ) => (
    <div className="space-y-3 mb-4">
      {/* Search Input */}
      <div className={`${retro.sunken} bg-[#0C0C2E] flex items-center`}>
        <Search size={14} className="ml-3 shrink-0" style={{ color: "#3A5A9B" }} />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2.5 bg-transparent outline-none text-[12px]"
          style={{ color: "#C0D0F0", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}
        />
        {searchValue && (
          <button onClick={() => onSearchChange("")} className="mr-2 hover:opacity-80">
            <X size={12} style={S_MUTED} />
          </button>
        )}
      </div>

      {/* Tag Filters */}
      {allTags.length > 0 && (
        <div className="flex items-start gap-2">
          <Tag size={12} className="shrink-0 mt-1" style={S_MUTED} />
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => renderTagPill(tag, activeTags.includes(tag), () => onToggleTag(tag)))}
          </div>
          {activeTags.length > 0 && (
            <button
              onClick={() => activeTags.forEach((t) => onToggleTag(t))}
              className="text-[9px] shrink-0 hover:opacity-80 px-1"
              style={S_RED}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );

  // ========================
  // Render
  // ========================
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: buildPageGradient(theme.pageBg),
        fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
      }}
    >
      {/* Top toolbar */}
      <div className={`${retro.toolbar} flex items-center justify-between`} style={{ background: theme.toolbarBg }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/interface")}
            className="text-[11px] hover:opacity-80 flex items-center gap-1"
            style={ts(theme.accentColor)}
          >
            <ArrowLeft size={12} />
            Back
          </button>
          <span className="text-[11px]" style={{ color: theme.labelColor }}>
            |
          </span>
          <span className="text-[11px]" style={{ color: theme.labelColor }}>
            Personal Files
          </span>
          <span className="text-[11px]" style={{ color: theme.labelColor }}>
            |
          </span>
          <button
            onClick={() => navigate("/interface/community")}
            className="text-[11px] hover:opacity-80 flex items-center gap-1"
            style={ts(theme.accentColor)}
          >
            <MessageSquare size={12} />
            Community
          </button>
        </div>
        <span className="text-[11px]" style={{ color: theme.labelColor }}>
          Sunday, February 22, 2026
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col px-4 py-6 max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <div className="mb-6">
          <h1
            className="text-[32px] tracking-tight mb-1"
            style={{
              ...ts(theme.headerColor),
              fontWeight: 700,
              fontFamily: "'Trebuchet MS', 'Tahoma', 'Verdana', sans-serif",
              ...(!isGradient(theme.headerColor) ? { textShadow: "2px 2px 0px #0A0A3B" } : {}),
            }}
          >
            Personal Files
          </h1>
          <p className="text-[12px]" style={ts(theme.labelColor)}>
            {player ? `${player.name} — ${player.class} · Level ${player.level}` : "Agent dossier and equipment manifest"}
          </p>
        </div>

        {/* Tab Navigation + Badges */}
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    playTabClick();
                    setActiveTab(tab.id);
                    setSelectedItem(null);
                    setSelectedCard(null);
                  }}
                  className={`${
                    activeTab === tab.id
                      ? retro.sunken
                      : retro.raised + " hover:bg-[#1E1E58]"
                  } px-5 py-2 text-[13px] flex items-center gap-2 transition-colors`}
                  style={{
                    background: activeTab === tab.id ? theme.panelBg : theme.cardBg,
                    color: activeTab === tab.id ? theme.accentColor : theme.textColor,
                    fontWeight: activeTab === tab.id ? 600 : 400,
                  }}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}

            {/* Turn End button — after tabs */}
            <button
              onClick={handleTurnEnd}
              disabled={statusEffects.length === 0}
              className={`${retro.button} px-4 py-2 text-[13px] flex items-center gap-2 transition-all`}
              style={{
                color: turnEndFlash ? "#FFF" : statusEffects.length === 0 ? "#3A4A6A" : "#FFB347",
                background: turnEndFlash ? "#FFB34744" : "#0C0C2E",
                cursor: statusEffects.length === 0 ? "not-allowed" : "pointer",
                marginLeft: "auto",
              }}
              title="Reduce all durations by 1. Effects reaching 0 are removed."
            >
              <SkipForward size={14} /> Turn End
            </button>

            {/* Owned badges */}
            {ownedBadgeIds.length > 0 && (
              <div className="flex items-center gap-1.5">
                {ownedBadgeIds.map((id) => {
                  const img = STICKER_IMAGES[id];
                  if (!img) return null;
                  return (
                    <img
                      key={id}
                      src={img}
                      alt=""
                      style={{
                        width: 28,
                        height: 28,
                        objectFit: "contain",
                        imageRendering: "auto",
                        filter: "drop-shadow(0 0 2px rgba(0,0,0,0.5))",
                      }}
                      draggable={false}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Character sub-tabs */}
          {activeTab === "character" && (
            <div className="flex items-center gap-1 mt-2 ml-1 pl-4" style={{ borderLeft: `2px solid ${firstColor(theme.accentColor)}22` }}>
              {([
                { id: "sheet" as const, label: "Character Sheet", icon: User, accent: "#5A9AFF" },
                { id: "status" as const, label: "Status Effects & Abilities", icon: Zap, accent: "#AA77FF" },
              ]).map((sub) => {
                const isActive = charSubTab === sub.id;
                const SubIcon = sub.icon;
                return (
                  <button
                    key={sub.id}
                    onClick={() => { playTabClick(); setCharSubTab(sub.id); }}
                    className={`${isActive ? retro.sunken : retro.raised + " hover:bg-[#1E1E58]"} px-3 py-1.5 text-[11px] flex items-center gap-1.5 transition-colors`}
                    style={{
                      background: isActive ? theme.panelBg : theme.cardBg,
                      color: isActive ? sub.accent : theme.labelColor,
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <SubIcon size={12} />
                    {sub.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Inventory sub-tabs */}
          {activeTab === "inventory" && (
            <div className="flex items-center gap-1 mt-2 ml-1 pl-4" style={{ borderLeft: `2px solid ${firstColor(theme.accentColor)}22` }}>
              {([
                { id: "equipped" as const, label: "Equipped", icon: Sword, accent: "#FF7A5A" },
                { id: "effects" as const, label: "Equipped Item Effects", icon: Sparkles, accent: "#C4A0FF" },
                { id: "consumables" as const, label: "Sources / Money", icon: Coins, accent: "#FFD700" },
                { id: "general" as const, label: "General Inventory", icon: Backpack, accent: "#5A9AFF" },
              ]).map((sub) => {
                const isActive = inventorySubTab === sub.id;
                const SubIcon = sub.icon;
                return (
                  <button
                    key={sub.id}
                    onClick={() => { playTabClick(); setInventorySubTab(sub.id); setSelectedItem(null); }}
                    className={`${isActive ? retro.sunken : retro.raised + " hover:bg-[#1E1E58]"} px-3 py-1.5 text-[11px] flex items-center gap-1.5 transition-colors`}
                    style={{
                      background: isActive ? theme.panelBg : theme.cardBg,
                      color: isActive ? sub.accent : theme.labelColor,
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <SubIcon size={12} />
                    {sub.label}
                  </button>
                );
              })}
              {inventorySubTab === "consumables" && totalSourceAll > 0 && (
                <div className="ml-2 flex items-center gap-1.5">
                  <div className={`${retro.sunken} px-2 py-0.5 text-[10px] flex items-center gap-1`} style={{ background: "#0C0C2E" }}>
                    <Flame size={9} style={{ color: "#FF7A5A" }} />
                    <span style={{ color: totalSourceUsed > totalSourceAll ? "#FF6A6A" : totalSourceUsed > 0 ? "#FFB347" : "#5A6A8A", fontWeight: 600 }}>
                      {totalSourceUsed}/{totalSourceAll}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cards sub-tabs */}
          {activeTab === "cards" && (
            <div className="flex items-center gap-1 mt-2 ml-1 pl-4" style={{ borderLeft: `2px solid ${firstColor(theme.accentColor)}22` }}>
              {([
                { id: "cards" as const, label: "Cards", icon: CreditCard, accent: "#FF7A5A" },
                { id: "magic" as const, label: "Magic", icon: Sparkles, accent: "#8AB8FF" },
                { id: "levelabilities" as const, label: "Level", icon: Zap, accent: "#FFD700" },
                { id: "nodetrees" as const, label: "Node Trees", icon: GitBranch, accent: "#5AE0B0" },
              ]).map((sub) => {
                const isActive = cardsSubTab === sub.id;
                const SubIcon = sub.icon;
                return (
                  <button
                    key={sub.id}
                    onClick={() => {
                      setCardsSubTab(sub.id);
                      setSelectedCard(null);
                      setMagicSelectedCard(null);
                      setLaSelectedCard(null);
                    }}
                    className={`${isActive ? retro.sunken : retro.raised + " hover:bg-[#1E1E58]"} px-3 py-1.5 text-[11px] flex items-center gap-1.5 transition-colors`}
                    style={{
                      background: isActive ? theme.panelBg : theme.cardBg,
                      color: isActive ? sub.accent : theme.labelColor,
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <SubIcon size={12} />
                    {sub.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div className={`${retro.raised} p-6 flex-1`} style={{ background: theme.panelBg }}>
          {/* No player found */}
          {!player && (
            <div className="text-center py-12">
              <div className="text-[14px] mb-2" style={S_RED}>
                NO AGENT PROFILE FOUND
              </div>
              <div className="text-[12px]" style={S_MUTED}>
                Your profile has not been set up by the System Administrator yet.
              </div>
            </div>
          )}

          {/* CHARACTER TAB */}
          {player && activeTab === "character" && (
            <div className="space-y-6">

              {charSubTab === "sheet" && (
              <div style={DISPLAY_CONTENTS}>
              <h2 className="text-[18px] mb-4" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                Character Sheet
              </h2>

              {/* ═══ BUFF / DEBUFF SUMMARY BAR ═══ */}
              {allBuffSummary.length > 0 && (
                <div className={`${retro.sunken} px-3 py-2 mb-4`} style={{ background: "#0A0A2A", border: "1px solid #2A2A5B" }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Zap size={11} style={{ color: "#AA77FF" }} />
                    <span className="text-[10px]" style={{ color: "#AA77FF", fontWeight: 700, letterSpacing: "0.05em" }}>ACTIVE BUFFS</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {allBuffSummary.map((entry) => {
                      const isPositive = entry.total > 0;
                      const hasStatus = entry.sources.some(s => s.type === "status");
                      const hasEquip = entry.sources.some(s => s.type === "equip");
                      const bgColor = isPositive ? "rgba(74,202,106,0.08)" : "rgba(224,85,85,0.08)";
                      const borderColor = isPositive ? "rgba(74,202,106,0.25)" : "rgba(224,85,85,0.25)";
                      const textColor = isPositive ? "#4ACA6A" : "#E05555";
                      const catLabel = entry.category === "attribute" ? "ATTR" : entry.category === "skill" ? "SKILL" : "RES";
                      const isOpen = buffTooltipKey === entry.key;
                      return (
                        <div key={entry.key} className="relative">
                          <button
                            onClick={() => setBuffTooltipKey(isOpen ? null : entry.key)}
                            onMouseEnter={() => setBuffTooltipKey(entry.key)}
                            onMouseLeave={() => setBuffTooltipKey(null)}
                            className="inline-flex items-center gap-1 px-2 py-1 transition-colors cursor-pointer"
                            style={{
                              background: bgColor,
                              border: `1px solid ${borderColor}`,
                              color: textColor,
                              fontSize: 11,
                              fontWeight: 700,
                              fontFamily: "'Tahoma', sans-serif",
                            }}
                          >
                            <span className="text-[8px] opacity-60" style={{ fontWeight: 600 }}>{catLabel}</span>
                            <span>{entry.key}</span>
                            <span>{isPositive ? "▲" : "▼"}{Math.abs(entry.total)}</span>
                            {hasStatus && <span style={{ color: "#AA77FF", fontSize: 9 }}>✦</span>}
                            {hasEquip && <span style={{ color: "#FFD700", fontSize: 9 }}>⚔</span>}
                          </button>
                          {/* Tooltip */}
                          {isOpen && (
                            <div
                              className="absolute z-30 top-full left-0 mt-1 min-w-48 p-2 space-y-1"
                              style={{ background: "#0F0F35", border: "1px solid #3A3A7B", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}
                              onMouseEnter={() => setBuffTooltipKey(entry.key)}
                              onMouseLeave={() => setBuffTooltipKey(null)}
                            >
                              <div className="text-[10px] mb-1 pb-1" style={{ color: "#8A8AAA", borderBottom: "1px solid #2A2A5B", fontWeight: 600 }}>
                                {entry.key} — {entry.category.toUpperCase()} BUFF SOURCES
                              </div>
                              {entry.sources.map((src, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    setBuffTooltipKey(null);
                                    if (src.type === "status") {
                                      // Navigate to status effects tab
                                      setCharSubTab("status");
                                    } else {
                                      // Navigate to equipped items / effects
                                      setInventorySubTab("effects");
                                      setActiveTab("inventory");
                                    }
                                  }}
                                  className="w-full flex items-center justify-between py-1 px-1.5 text-left hover:bg-[#1A1A5B] transition-colors cursor-pointer"
                                  style={{ border: "none", background: "transparent" }}
                                >
                                  <span className="text-[11px] inline-flex items-center gap-1" style={S_TEXT}>
                                    {src.type === "status" ? (
                                      <span style={{ color: "#AA77FF", fontSize: 9 }}>✦</span>
                                    ) : (
                                      <span style={{ color: "#FFD700", fontSize: 9 }}>⚔</span>
                                    )}
                                    {src.label}
                                  </span>
                                  <span className="text-[11px]" style={{ color: src.value > 0 ? "#4ACA6A" : "#E05555", fontWeight: 700 }}>
                                    {src.value > 0 ? "+" : ""}{src.value}
                                  </span>
                                </button>
                              ))}
                              <div className="flex items-center justify-between pt-1 mt-1" style={{ borderTop: "1px solid #2A2A5B" }}>
                                <span className="text-[10px]" style={{ color: "#8A8AAA" }}>TOTAL</span>
                                <span className="text-[12px]" style={{ color: textColor, fontWeight: 700 }}>
                                  {entry.total > 0 ? "+" : ""}{entry.total}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`${retro.sunken} p-4`} style={{ background: theme.inputBg }}>
                  <div className="text-[14px] mb-2" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                    BASIC INFORMATION
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[12px]" style={{ color: theme.labelColor }}>Name:</label>
                      <div className="text-[16px]" style={{ color: theme.textColor }}>{player.name}</div>
                    </div>
                    <div>
                      <label className="text-[12px]" style={{ color: theme.labelColor }}>Class:</label>
                      <div className="text-[16px]" style={{ color: theme.textColor }}>{player.class}</div>
                    </div>
                    <div>
                      <label className="text-[12px]" style={{ color: theme.labelColor }}>Level:</label>
                      <div className="text-[16px]" style={{ color: theme.textColor }}>{player.level}</div>
                    </div>
                  </div>
                </div>

                <div className={`${retro.sunken} p-4`} style={{ background: theme.inputBg }}>
                  <div className="text-[14px] mb-2" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                    ATTRIBUTES
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(player.stats ?? { STR: 10, AGI: 10, CON: 10, KNOW: 10, WIS: 10, WILL: 10 }) as (keyof PlayerStats)[]).map((stat) => {
                      const base = (player.stats ?? { STR: 10, AGI: 10, CON: 10, KNOW: 10, WIS: 10, WILL: 10 })[stat];
                      const eBuff = equipBuffs.attrBuffs[stat] || 0;
                      const sBuff = seBuffs.attrBuffs[stat] || 0;
                      const buff = eBuff + sBuff;
                      const eff = base + buff;
                      return (
                        <div key={stat} className="flex items-center justify-between">
                          <span className="text-[13px]" style={{ color: theme.labelColor }}>{stat}:</span>
                          <span className="text-[15px] inline-flex items-center gap-1.5" style={{ color: theme.textColor }}>
                            <span style={{ fontWeight: buff !== 0 ? 700 : 400 }}>{eff} ({statMod(eff)})</span>
                            {eBuff !== 0 && (
                              <span className="inline-flex items-center px-1 py-px rounded-sm text-[10px]" style={{ background: eBuff > 0 ? "rgba(74,202,106,0.12)" : "rgba(224,85,85,0.12)", border: `1px solid ${eBuff > 0 ? "rgba(74,202,106,0.3)" : "rgba(224,85,85,0.3)"}`, color: eBuff > 0 ? "#4ACA6A" : "#E05555", fontWeight: 700, lineHeight: 1 }} title={`Equipment: ${eBuff > 0 ? "+" : ""}${eBuff}`}>
                                {eBuff > 0 ? "▲" : "▼"}{Math.abs(eBuff)}
                              </span>
                            )}
                            {sBuff !== 0 && (
                              <span className="inline-flex items-center px-1 py-px rounded-sm text-[10px]" style={{ background: sBuff > 0 ? "rgba(106,74,202,0.15)" : "rgba(202,74,106,0.15)", border: `1px solid ${sBuff > 0 ? "rgba(106,74,202,0.4)" : "rgba(202,74,106,0.4)"}`, color: sBuff > 0 ? "#AA77FF" : "#FF5577", fontWeight: 700, lineHeight: 1 }} title={`Status Effect: ${sBuff > 0 ? "+" : ""}${sBuff}`}>
                                ✦{sBuff > 0 ? "▲" : "▼"}{Math.abs(sBuff)}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Skills Section */}
              <div className={`${retro.sunken} p-4`} style={{ background: theme.inputBg }}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="text-[14px]" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                    SKILLS
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px]" style={{ color: theme.labelColor }}>Proficiency Bonus:</label>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setProficiencyBonus(Math.max(0, proficiencyBonus - 1))} className={`${retro.button} px-1 py-0.5`} style={S_RED}><Minus size={10} /></button>
                      <span className={`${retro.sunken} inline-flex items-center justify-center w-8 text-center text-[14px] py-0.5`} style={{ background: "#0A0A28", color: "#4AC0FF", fontWeight: 700 }}>+{proficiencyBonus}</span>
                      <button onClick={() => setProficiencyBonus(proficiencyBonus + 1)} className={`${retro.button} px-1 py-0.5`} style={S_GREEN_BTN}><Plus size={10} /></button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {skillCategories.map((cat) => {
                    const eAttrBuff = equipBuffs.attrBuffs[cat.attr] || 0;
                    const sAttrBuff = seBuffs.attrBuffs[cat.attr] || 0;
                    const attrBuff = eAttrBuff + sAttrBuff;
                    const effVal = cat.val + attrBuff;
                    const effModN = statModNum(effVal);
                    return (
                    <div key={cat.attr} className={`${retro.raised} p-3`} style={{ background: theme.panelBg }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[13px] inline-flex items-center gap-1.5" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                          {cat.attr}
                          {eAttrBuff !== 0 && (
                            <span className="inline-flex items-center px-1 py-px rounded-sm text-[9px]" style={{ background: eAttrBuff > 0 ? "rgba(74,202,106,0.12)" : "rgba(224,85,85,0.12)", border: `1px solid ${eAttrBuff > 0 ? "rgba(74,202,106,0.3)" : "rgba(224,85,85,0.3)"}`, color: eAttrBuff > 0 ? "#4ACA6A" : "#E05555", fontWeight: 700, lineHeight: 1 }} title={`Equipment: ${eAttrBuff > 0 ? "+" : ""}${eAttrBuff}`}>
                              {eAttrBuff > 0 ? "▲" : "▼"}{Math.abs(eAttrBuff)}
                            </span>
                          )}
                          {sAttrBuff !== 0 && (
                            <span className="inline-flex items-center px-1 py-px rounded-sm text-[9px]" style={{ background: sAttrBuff > 0 ? "rgba(106,74,202,0.15)" : "rgba(202,74,106,0.15)", border: `1px solid ${sAttrBuff > 0 ? "rgba(106,74,202,0.4)" : "rgba(202,74,106,0.4)"}`, color: sAttrBuff > 0 ? "#AA77FF" : "#FF5577", fontWeight: 700, lineHeight: 1 }} title={`Status Effect: ${sAttrBuff > 0 ? "+" : ""}${sAttrBuff}`}>
                              ✦{sAttrBuff > 0 ? "▲" : "▼"}{Math.abs(sAttrBuff)}
                            </span>
                          )}
                        </span>
                        <span className="text-[12px]" style={{ color: theme.labelColor }}>
                          {effVal} (MOD: {fmtMod(effModN)})
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {cat.skills.map((skill) => {
                          const profKey = `${cat.attr}::${skill}`;
                          const eSkillBuff = equipBuffs.skillBuffs[skill] || 0;
                          const sSkillBuff = seBuffs.skillBuffs[skill] || 0;
                          const sBuff = eSkillBuff + sSkillBuff;
                          const profState = skillProficiencies[profKey]; // false | "prof" | "expert"
                          const isProf = profState === "prof" || profState === "expert";
                          const isExpert = profState === "expert";
                          const profVal = isExpert ? proficiencyBonus * 2 : (isProf ? proficiencyBonus : 0);
                          const totalMod = effModN + sBuff + profVal;
                          const hasDis = equipBuffs.disadvantages.has(skill);
                          const hasAnyBonus = sBuff !== 0 || isProf;
                          return (
                          <div key={skill} className="flex items-center justify-between py-0.5 group/skill">
                            <span className="text-[13px] inline-flex items-center gap-1" style={{ color: theme.textColor }}>
                              <button
                                onClick={() => toggleSkillProf(profKey)}
                                className="inline-flex items-center justify-center rounded-sm transition-colors"
                                style={{
                                  width: 14, height: 14, flexShrink: 0,
                                  background: isExpert ? "rgba(224,85,85,0.15)" : isProf ? "rgba(74,192,255,0.15)" : "rgba(255,255,255,0.04)",
                                  border: `1.5px solid ${isExpert ? "#E05555" : isProf ? "#4AC0FF" : "rgba(255,255,255,0.12)"}`,
                                }}
                                title={isExpert ? `Expertise in ${cat.attr} ${skill} (+${proficiencyBonus * 2})` : isProf ? `Proficient in ${cat.attr} ${skill} (+${proficiencyBonus}) — click again for Expertise` : `Click to mark proficiency in ${cat.attr} ${skill}`}
                              >
                                {isExpert && <span style={{ color: "#E05555", fontSize: 9, lineHeight: 1, fontWeight: 800 }}>E</span>}
                                {isProf && !isExpert && <span style={{ color: "#4AC0FF", fontSize: 10, lineHeight: 1, fontWeight: 800 }}>✓</span>}
                              </button>
                              <span style={{ opacity: hasDis ? 0.8 : 1 }}>{skill}</span>
                              {hasDis && (
                                <span className="inline-flex items-center px-1 py-px rounded-sm text-[8px]" style={{ background: "rgba(224,85,85,0.12)", border: "1px solid rgba(224,85,85,0.3)", color: "#E05555", fontWeight: 700, lineHeight: 1, letterSpacing: "0.02em" }}>
                                  DISADV
                                </span>
                              )}
                            </span>
                            <span className="text-[13px] inline-flex items-center gap-1" style={{ color: hasAnyBonus ? theme.textColor : theme.labelColor, fontWeight: hasAnyBonus ? 700 : 400 }}>
                              {fmtMod(totalMod)}
                              {sBuff !== 0 && (
                                <span className="inline-flex items-center px-1 py-px rounded-sm text-[9px]" style={{ background: sBuff > 0 ? "rgba(74,202,106,0.12)" : "rgba(224,85,85,0.12)", border: `1px solid ${sBuff > 0 ? "rgba(74,202,106,0.3)" : "rgba(224,85,85,0.3)"}`, color: sBuff > 0 ? "#4ACA6A" : "#E05555", fontWeight: 700, lineHeight: 1 }} title={`Skill buff: ${fmtMod(sBuff)}`}>
                                  {sBuff > 0 ? "▲" : "▼"}{Math.abs(sBuff)}
                                </span>
                              )}
                              {isProf && !isExpert && (
                                <span className="inline-flex items-center px-1 py-px rounded-sm text-[9px]" style={{ background: "rgba(74,192,255,0.12)", border: "1px solid rgba(74,192,255,0.3)", color: "#4AC0FF", fontWeight: 700, lineHeight: 1 }} title={`Proficiency: +${proficiencyBonus}`}>
                                  P
                                </span>
                              )}
                              {isExpert && (
                                <span className="inline-flex items-center px-1 py-px rounded-sm text-[9px]" style={{ background: "rgba(224,85,85,0.12)", border: "1px solid rgba(224,85,85,0.3)", color: "#E05555", fontWeight: 700, lineHeight: 1 }} title={`Expertise: +${proficiencyBonus * 2} (2× proficiency)`}>
                                  E
                                </span>
                              )}
                            </span>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* Resources (part of Character Sheet sub-tab) */}
              {(() => {
                  const eRb = equipBuffs.resourceBuffs;
                  const sRb = seBuffs.resourceBuffs;
                  // Combine equip + status effect resource buffs
                  const rb: Record<string, number> = { ...eRb };
                  for (const [k, v] of Object.entries(sRb)) rb[k] = (rb[k] || 0) + v;
                  const maxHPBuff = rb["Max HP"] || 0;
                  const acBuff = rb["Armor Class"] || 0;
                  const speedBuff = rb["Speed"] || 0;
                  const drBuff = rb["Damage Reduction"] || 0;
                  const tempHPBuff = rb["Temp HP"] || 0;
                  const maxWtBuff = rb["Max Weight"] || 0;
                  const twBuff = rb["Total Wounds"] || 0;
                  const mesBuff = rb["Max Exhaustion"] || 0;
                  const effMaxHP = player.maxHP + maxHPBuff;
                  const effAC = player.armorClass + acBuff;
                  const spdNum = parseInt(player.speed) || 0;
                  const effSpeed = speedBuff !== 0 ? `${spdNum + speedBuff} ft` : player.speed;
                  const autoMaxWeight = usesAutoMaxWeight(player);
                  const effMaxWt = playerBaseMaxWeight + maxWtBuff;
                  const effTW = player.totalWounds + twBuff;
                  const effME = (player.maxExhaustion ?? 6) + mesBuff;
                  const buffPill = (b: number, sz: number = 9) => b !== 0 ? (
                    <span className="inline-flex items-center px-1 py-px rounded-sm" style={{ fontSize: sz, background: b > 0 ? "rgba(74,202,106,0.12)" : "rgba(224,85,85,0.12)", border: `1px solid ${b > 0 ? "rgba(74,202,106,0.3)" : "rgba(224,85,85,0.3)"}`, color: b > 0 ? "#4ACA6A" : "#E05555", fontWeight: 700, lineHeight: 1 }}>
                      {b > 0 ? "▲" : "▼"}{Math.abs(b)}
                    </span>
                  ) : null;
                  const buffedDenom = (base: number, buff: number) => (
                    <span className="inline-flex items-center gap-1">
                      <span style={{ fontWeight: buff !== 0 ? 700 : 600 }}>{base + buff}</span>
                      {buff !== 0 && buffPill(buff, 9)}
                    </span>
                  );
                  return (
                  <div style={DISPLAY_CONTENTS}>
                    <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                    <div className="text-[14px] mb-4" style={{ color: theme.accentColor, fontWeight: 600 }}>Resources</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] block mb-2" style={{ color: theme.labelColor }}>Hit Points:</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSetHP(currentHP - 1)} className={`${retro.button} p-1`} style={S_RED}><Minus size={12} /></button>
                          <input type="number" value={currentHP} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleSetHP(v); }} className={`${retro.sunken} bg-[#0A0A28] w-16 text-center text-[18px] py-1 outline-none`} style={{ color: currentHP <= effMaxHP * 0.25 ? theme.hpCritical : currentHP <= effMaxHP * 0.5 ? theme.hpWarning : theme.hpHealthy, fontWeight: 600 }} />
                          <span className="text-[18px]" style={{ color: theme.labelColor, fontWeight: 600 }}>/ {buffedDenom(player.maxHP, maxHPBuff)}</span>
                          <button onClick={() => handleSetHP(currentHP + 1)} className={`${retro.button} p-1`} style={S_GREEN_BTN}><Plus size={12} /></button>
                        </div>
                      </div>
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] block mb-2" style={{ color: theme.labelColor }}>Armor Class:</label>
                        <div className="flex items-center gap-2 min-h-[34px]">
                          <div className="text-[18px] inline-flex items-center gap-1.5" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                            <span style={{ fontWeight: acBuff !== 0 ? 700 : 600 }}>{effAC}</span>
                            {acBuff !== 0 && buffPill(acBuff, 10)}
                          </div>
                        </div>
                      </div>
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] inline-flex items-center gap-1.5 mb-2" style={{ color: theme.labelColor }}>Movement: {speedBuff !== 0 && buffPill(speedBuff, 9)}</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSetMovement(currentMovement - 5)} className={`${retro.button} p-1`} style={S_RED}><Minus size={12} /></button>
                          <input type="number" value={currentMovement} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleSetMovement(v); }} className={`${retro.sunken} bg-[#0A0A28] w-16 text-center text-[18px] py-1 outline-none`} style={{ color: currentMovement <= 0 ? theme.hpCritical : theme.hpHealthy, fontWeight: 600 }} />
                          <span className="text-[14px]" style={{ color: theme.labelColor }}>/ {spdNum + speedBuff} ft</span>
                          <button onClick={() => handleSetMovement(currentMovement + 5)} className={`${retro.button} p-1`} style={S_GREEN_BTN}><Plus size={12} /></button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] inline-flex items-center gap-1.5 mb-2" style={{ color: theme.labelColor }}>Temp HP: {tempHPBuff !== 0 && buffPill(tempHPBuff, 9)}</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSetTempHP(tempHP - 1)} className={`${retro.button} p-1`} style={S_RED}><Minus size={12} /></button>
                          <input type="number" value={tempHP} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleSetTempHP(v); }} className={`${retro.sunken} bg-[#0A0A28] w-16 text-center text-[18px] py-1 outline-none`} style={{ color: tempHP > 0 ? "#4AC0FF" : theme.hpHealthy, fontWeight: 600 }} />
                          {tempHPBuff !== 0 && <span className="text-[11px]" style={{ color: "#5A7A9A", fontStyle: "italic" }}>+{tempHPBuff}</span>}
                          <button onClick={() => handleSetTempHP(tempHP + 1)} className={`${retro.button} p-1`} style={S_GREEN_BTN}><Plus size={12} /></button>
                        </div>
                      </div>
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] inline-flex items-center gap-1.5 mb-2" style={{ color: theme.labelColor }}>Damage Reduction: {drBuff !== 0 && buffPill(drBuff, 9)}</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSetDR(damageReduction - 1)} className={`${retro.button} p-1`} style={S_RED}><Minus size={12} /></button>
                          <input type="number" value={damageReduction} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleSetDR(v); }} className={`${retro.sunken} bg-[#0A0A28] w-16 text-center text-[18px] py-1 outline-none`} style={{ color: damageReduction > 0 ? "#4AC0FF" : theme.hpHealthy, fontWeight: 600 }} />
                          {drBuff !== 0 && <span className="text-[11px]" style={{ color: "#5A7A9A", fontStyle: "italic" }}>+{drBuff}</span>}
                          <button onClick={() => handleSetDR(damageReduction + 1)} className={`${retro.button} p-1`} style={S_GREEN_BTN}><Plus size={12} /></button>
                        </div>
                      </div>
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] block mb-2" style={{ color: theme.labelColor }}>Weight:</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSetWeight(currentWeight - 1)} className={`${retro.button} p-1`} style={S_RED}><Minus size={12} /></button>
                          <input type="number" value={currentWeight} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleSetWeight(v); }} className={`${retro.sunken} bg-[#0A0A28] w-16 text-center text-[18px] py-1 outline-none`} style={{ color: currentWeight > effMaxWt ? theme.hpCritical : theme.hpHealthy, fontWeight: 600 }} />
                          <span className="text-[18px]" style={{ color: theme.labelColor, fontWeight: 600 }}>/ {buffedDenom(playerBaseMaxWeight, maxWtBuff)}</span>
                          <button onClick={() => handleSetWeight(currentWeight + 1)} className={`${retro.button} p-1`} style={S_GREEN_BTN}><Plus size={12} /></button>
                        </div>
                        {autoMaxWeight && (
                          <div className="text-[9px] mt-2 leading-relaxed" style={S_MUTED}>
                            Auto max weight: 50 + 5 for each CON point above 10.
                          </div>
                        )}
                      </div>
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] block mb-2" style={{ color: theme.labelColor }}>Exhaustion:</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSetExhaustion(exhaustion - 1)} className={`${retro.button} p-1`} style={S_GREEN_BTN}><Minus size={12} /></button>
                          <input type="number" value={exhaustion} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleSetExhaustion(v); }} className={`${retro.sunken} bg-[#0A0A28] w-16 text-center text-[18px] py-1 outline-none`} style={{ color: exhaustion >= effME ? theme.hpCritical : exhaustion > 0 ? theme.hpWarning : theme.hpHealthy, fontWeight: 600 }} />
                          <span className="text-[18px]" style={{ color: theme.labelColor, fontWeight: 600 }}>/ {buffedDenom(player.maxExhaustion ?? 6, mesBuff)}</span>
                          <button onClick={() => handleSetExhaustion(exhaustion + 1)} className={`${retro.button} p-1`} style={S_RED}><Plus size={12} /></button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] block mb-2" style={{ color: theme.labelColor }}>Insanity Points:</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSetInsanityPoints(insanityPoints - 1)} className={`${retro.button} p-1`} style={S_RED}><Minus size={12} /></button>
                          <input type="number" value={insanityPoints} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleSetInsanityPoints(v); }} className={`${retro.sunken} bg-[#0A0A28] w-14 text-center text-[16px] py-1 outline-none`} style={{ color: insanityPoints > 0 ? theme.hpWarning : theme.textColor, fontWeight: 600 }} />
                          <button onClick={() => handleSetInsanityPoints(insanityPoints + 1)} className={`${retro.button} p-1`} style={S_GREEN_BTN}><Plus size={12} /></button>
                        </div>
                      </div>
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] block mb-2" style={{ color: theme.labelColor }}>Inspiration Points:</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSetInspirationPoints(inspirationPoints - 1)} className={`${retro.button} p-1`} style={S_RED}><Minus size={12} /></button>
                          <input type="number" value={inspirationPoints} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleSetInspirationPoints(v); }} className={`${retro.sunken} bg-[#0A0A28] w-14 text-center text-[16px] py-1 outline-none`} style={{ color: inspirationPoints > 0 ? "#FFD700" : theme.textColor, fontWeight: 600 }} />
                          <button onClick={() => handleSetInspirationPoints(inspirationPoints + 1)} className={`${retro.button} p-1`} style={S_GREEN_BTN}><Plus size={12} /></button>
                        </div>
                      </div>
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] block mb-2" style={{ color: theme.labelColor }}>Foresight:</label>
                        <button
                          onClick={() => handleSetForesight(!foresight)}
                          className={`${retro.button} w-full px-3 py-2 text-[12px] flex items-center justify-center gap-2`}
                          style={{
                            color: foresight ? "#4ACA6A" : theme.labelColor,
                            background: foresight ? "rgba(74,202,106,0.12)" : theme.cardBg,
                            border: `1px solid ${foresight ? "rgba(74,202,106,0.35)" : bc(theme.dividerColor)}`,
                          }}
                        >
                          <span
                            className={`${retro.sunken} inline-flex h-5 w-5 items-center justify-center text-[12px]`}
                            style={{
                              background: foresight ? "rgba(74,202,106,0.18)" : "#0A0A28",
                              color: foresight ? "#4ACA6A" : theme.labelColor,
                            }}
                          >
                            {foresight ? "✓" : ""}
                          </span>
                          <span style={{ fontWeight: 600 }}>{foresight ? "Enabled" : "Not Enabled"}</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] block mb-2" style={{ color: theme.labelColor }}>Wound Dice:</label>
                        <div className="flex items-center gap-2 min-h-[34px]">
                          <div className="text-[18px]" style={{ color: theme.textColor, fontWeight: 600 }}>{player.woundDice}</div>
                        </div>
                      </div>
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] block mb-2" style={{ color: theme.labelColor }}>Current Wounds:</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSetWounds(currentWounds - 1)} className={`${retro.button} p-1`} style={S_GREEN_BTN}><Minus size={12} /></button>
                          <input type="number" value={currentWounds} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleSetWounds(v); }} className={`${retro.sunken} bg-[#0A0A28] w-16 text-center text-[18px] py-1 outline-none`} style={{ color: currentWounds >= effTW ? theme.hpCritical : currentWounds > 0 ? theme.hpWarning : theme.hpHealthy, fontWeight: 600 }} />
                          <span className="text-[18px]" style={{ color: theme.labelColor, fontWeight: 600 }}>/ {buffedDenom(player.totalWounds, twBuff)}</span>
                          <button onClick={() => handleSetWounds(currentWounds + 1)} className={`${retro.button} p-1`} style={S_RED}><Plus size={12} /></button>
                        </div>
                      </div>
                      <div className={`${retro.sunken} p-3`} style={SUNKEN_INPUT}>
                        <label className="text-[12px] block mb-2" style={{ color: theme.labelColor }}>Total Wounds:</label>
                        <div className="flex items-center gap-2 min-h-[34px]">
                          <div className="text-[18px] inline-flex items-center gap-1.5" style={{ color: theme.textColor, fontWeight: 600 }}>
                            <span>{effTW}</span>
                            {twBuff !== 0 && buffPill(twBuff, 10)}
                          </div>
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>
                  );
                })()}
              </div>
              )}

              {charSubTab === "status" && (() => {
                const selfEffects = statusEffects.filter((e) => e.targetType !== "enemy");
                const abilityEffects = statusEffects.filter((e) => e.targetType === "enemy");
                const selectedSelfIds = new Set([...selectedEffectIds].filter((id) => selfEffects.some((e) => e.id === id)));
                const selectedAbilityIds = new Set([...selectedEffectIds].filter((id) => abilityEffects.some((e) => e.id === id)));

                const renderEffectRow = (row: StatusEffectRow) => {
                  const isDice = hasDiceNotation(row.damage);
                  const isRolling = rollAnimatingId === row.id;
                  const isEnemy = row.targetType === "enemy";
                  return (
                    <div key={row.id} className="px-2 py-1.5 transition-colors" style={{ background: selectedEffectIds.has(row.id) ? "#1A1A5B" : "transparent", borderBottom: "1px solid #1A1A4B" }}>
                      {row.targetType && (
                        <div className="flex items-center gap-1 mb-0.5 ml-7">
                          <span className="text-[8px] px-1.5 py-px" style={{
                            background: isEnemy ? "#FF6A6A15" : "#4ACA6A15",
                            color: isEnemy ? "#FF6A6A" : "#4ACA6A",
                            border: `1px solid ${isEnemy ? "#FF6A6A33" : "#4ACA6A33"}`,
                            fontWeight: 700,
                          }}>
                            {isEnemy ? "TARGET: ENEMY" : "TARGET: SELF"}
                          </span>
                          {isEnemy && row.buffType && (
                            <span className="text-[8px]" style={{ color: "#FF6A6A88" }}>buffs not applied</span>
                          )}
                        </div>
                      )}
                      <div
                        className="grid gap-2 items-center"
                        style={{ gridTemplateColumns: "28px 1fr 70px 80px 110px 1fr" }}
                      >
                        <button
                          onClick={() => toggleEffectSelected(row.id)}
                          className="w-4 h-4 flex items-center justify-center shrink-0"
                          style={{ border: "1px solid #3A3A6B", background: selectedEffectIds.has(row.id) ? theme.accentColor : theme.inputBg }}
                        >
                          {selectedEffectIds.has(row.id) && <span className="text-[12px]" style={{ color: "#FFF" }}>&#10003;</span>}
                        </button>
                        <div className="relative">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) => updateEffect(row.id, "name", e.target.value)}
                              placeholder="Effect name..."
                              className={`${retro.sunken} bg-[#0A0A28] w-full px-2 py-1 text-[13px] outline-none`}
                              style={{ color: "#C0D0F0", fontFamily: "'Tahoma', sans-serif" }}
                            />
                            {statusTags.length > 0 && (
                              <button
                                onClick={() => setNameDropdownOpenId(nameDropdownOpenId === row.id ? null : row.id)}
                                className={`${retro.button} p-0.5 shrink-0`}
                                style={S_MUTED}
                              >
                                <ChevronDown size={10} />
                              </button>
                            )}
                          </div>
                          {nameDropdownOpenId === row.id && statusTags.length > 0 && (
                            <div className="absolute z-20 top-full left-0 mt-1 w-56 max-h-40 overflow-y-auto" style={{ background: theme.panelBg, border: `1px solid ${bc(theme.dividerColor)}` }}>
                              {statusTags.map((tag) => (
                                <button
                                  key={tag.id}
                                  onClick={() => selectEffectFromTag(row.id, tag)}
                                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#1A1A5B] transition-colors"
                                  style={{ color: "#C0D0F0", borderBottom: "1px solid #1A1A4B" }}
                                >
                                  <span style={{ ...ts(theme.accentColor), fontWeight: 600 }}>{tag.name}</span>
                                  <span className="ml-2 text-[11px]" style={S_MUTED}>{tag.description.slice(0, 40)}{tag.description.length > 40 ? "..." : ""}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <input type="text" value={row.potency} onChange={(e) => updateEffect(row.id, "potency", e.target.value)} placeholder="--" className={`${retro.sunken} bg-[#0A0A28] w-full px-2 py-1 text-[13px] text-center outline-none`} style={{ color: hasTE(row.potency) ? (parseTE(row.potency)?.sign === "+" ? "#44DD88" : "#FFAA44") : "#C0D0F0", fontFamily: "'Tahoma', sans-serif" }} />
                        <input type="text" value={row.duration} onChange={(e) => updateEffect(row.id, "duration", e.target.value)} placeholder="--" className={`${retro.sunken} bg-[#0A0A28] w-full px-2 py-1 text-[11px] text-center outline-none`} style={{ color: "#C0D0F0", fontFamily: "'Tahoma', sans-serif" }} />
                        <div className="flex items-center gap-1">
                          <input type="text" value={row.damage} onChange={(e) => updateEffect(row.id, "damage", e.target.value)} placeholder="--" className={`${retro.sunken} bg-[#0A0A28] w-full px-2 py-1 text-[11px] text-center outline-none`} style={{ color: row.damage ? "#FF6A6A" : "#C0D0F0", fontFamily: "'Tahoma', sans-serif", minWidth: 0 }} />
                          {isDice && (
                            <button
                              onClick={() => handleRollDamage(row.id)}
                              className={`${retro.button} p-1 shrink-0 transition-all`}
                              style={{
                                color: isRolling ? "#FFD700" : "#FF6A6A",
                                border: `1px solid ${isRolling ? "#FFD70066" : "#FF6A6A44"}`,
                                background: isRolling ? "#FFD70022" : "transparent",
                                transform: isRolling ? "rotate(20deg) scale(1.2)" : "none",
                              }}
                              title="Roll damage dice"
                            >
                              <Dices size={13} />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <input type="text" value={row.effect} onChange={(e) => updateEffect(row.id, "effect", e.target.value)} placeholder="Description..." className={`${retro.sunken} bg-[#0A0A28] w-full px-2 py-1 text-[11px] outline-none`} style={{ color: "#C0D0F0", fontFamily: "'Tahoma', sans-serif", minWidth: 0 }} />
                          <button
                            onClick={() => {
                              if (row.buffType) {
                                setStatusEffects((prev) => prev.map((r) => r.id === row.id ? { ...r, buffType: "", buffTarget: "", buffValue: "" } : r));
                              } else {
                                setStatusEffects((prev) => prev.map((r) => r.id === row.id ? { ...r, buffType: "attribute" } : r));
                              }
                            }}
                            className={`${retro.button} p-1 shrink-0`}
                            style={{ color: row.buffType ? "#AA77FF" : "#5A6A8A", border: `1px solid ${row.buffType ? "#AA77FF44" : "#3A3A6B"}`, background: row.buffType ? "#AA77FF15" : "transparent" }}
                            title={row.buffType ? "Remove stat buff" : "Add stat buff (Attribute/Skill/Resource)"}
                          >
                            <Zap size={11} />
                          </button>
                        </div>
                      </div>
                      {row.buffType && (
                        <div className="mt-1 ml-8 px-2 py-1.5 flex items-center gap-2 flex-wrap" style={{ background: "#AA77FF08", border: "1px solid #AA77FF22" }}>
                          <span className="text-[10px] shrink-0" style={{ color: "#AA77FF", fontWeight: 700 }}>✦ BUFF</span>
                          <select
                            value={row.buffType}
                            onChange={(e) => setStatusEffects((prev) => prev.map((r) => r.id === row.id ? { ...r, buffType: e.target.value as StatusEffectRow["buffType"], buffTarget: "" } : r))}
                            className={`${retro.sunken} bg-[#0A0A28] px-2 py-0.5 text-[11px] outline-none`}
                            style={{ color: "#AA77FF", fontFamily: "'Tahoma', sans-serif" }}
                          >
                            <option value="attribute">Attribute</option>
                            <option value="skill">Skill</option>
                            <option value="resource">Resource</option>
                          </select>
                          {(() => {
                            const ATTR_OPTS = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL"];
                            const RESOURCE_OPTS = ["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
                            const SKILL_OPTS = skillCategories.flatMap((cat) => cat.skills);
                            const opts = row.buffType === "attribute" ? ATTR_OPTS : row.buffType === "skill" ? SKILL_OPTS : RESOURCE_OPTS;
                            const cur = row.buffTarget || "";
                            const isInvalid = cur !== "" && !opts.includes(cur);
                            return (
                              <div style={DISPLAY_CONTENTS}>
                                <select
                                  value={isInvalid ? "__invalid__" : cur}
                                  onChange={(e) => setStatusEffects((prev) => prev.map((r) => r.id === row.id ? { ...r, buffTarget: e.target.value === "__invalid__" ? "" : e.target.value } : r))}
                                  className={`${retro.sunken} bg-[#0A0A28] px-2 py-0.5 text-[11px] outline-none`}
                                  style={{ color: isInvalid ? "#FF6A6A" : "#C0D0F0", fontFamily: "'Tahoma', sans-serif" }}
                                >
                                  <option value="">-- select --</option>
                                  {isInvalid && <option value="__invalid__" disabled style={S_RED}>⚠ "{cur}" (not recognized)</option>}
                                  {row.buffType === "skill"
                                    ? skillCategories.flatMap((cat) => cat.skills.map((s) => <option key={`${cat.attr}-${s}`} value={s}>{cat.attr}: {s}</option>))
                                    : opts.map((o) => <option key={o} value={o}>{o}</option>)
                                  }
                                </select>
                                {isInvalid && (
                                  <span className="text-[8px] shrink-0" style={S_RED} title={`"${cur}" is not a valid ${row.buffType} — this buff won't apply`}>⚠</span>
                                )}
                              </div>
                            );
                          })()}
                          <input
                            type="text"
                            value={row.buffValue || ""}
                            onChange={(e) => setStatusEffects((prev) => prev.map((r) => r.id === row.id ? { ...r, buffValue: e.target.value } : r))}
                            placeholder="e.g. +2, P, -1"
                            className={`${retro.sunken} bg-[#0A0A28] w-20 px-2 py-0.5 text-[11px] text-center outline-none`}
                            style={{ color: "#AA77FF", fontFamily: "'Tahoma', sans-serif" }}
                            title="Buff value — use P for Potency substitution"
                          />
                        </div>
                      )}
                      {row.lastRoll && (
                        <div
                          className="mt-1 ml-8 px-2 py-1 text-[11px] flex items-center gap-2"
                          style={{
                            background: "#FF6A6A11",
                            border: "1px solid #FF6A6A33",
                            color: "#FF6A6A",
                            fontFamily: "'Courier New', monospace",
                            fontWeight: 600,
                          }}
                        >
                          <Dices size={11} />
                          <span>{row.lastRoll}</span>
                          <button
                            onClick={() => setStatusEffects((prev) => prev.map((r) => r.id === row.id ? { ...r, lastRoll: undefined } : r))}
                            className="ml-auto hover:opacity-80"
                            style={{ color: "#FF6A6A66" }}
                          >
                            <X size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                };

                const renderHeaderRow = () => (
                  <div className="hidden md:grid gap-2 px-2 py-1.5" style={{ gridTemplateColumns: "28px 1fr 70px 80px 110px 1fr", color: "#5A6A8A" }}>
                    <div />
                    <div className="text-[11px]">NAME</div>
                    <div className="text-[11px]">POTENCY</div>
                    <div className="text-[11px]">DURATION</div>
                    <div className="text-[11px]">DAMAGE</div>
                    <div className="text-[11px]">EFFECT</div>
                  </div>
                );

                return (
                  <div className="space-y-6">
                    {/* ── Status Effects Panel (affects the player) ── */}
                    <div className={`${retro.raised} p-4`} style={{ background: theme.cardBg, border: `1px solid ${bc(theme.panelBorder)}` }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Shield size={14} style={{ color: "#4ACA6A" }} />
                          <div className="text-[13px]" style={{ color: "#4ACA6A", fontWeight: 600 }}>
                            STATUS EFFECTS ({selfEffects.length})
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedSelfIds.size > 0 && (
                            <button onClick={removeSelectedEffects} className={`${retro.button} px-3 py-1 text-[12px] flex items-center gap-1`} style={S_RED}>
                              <Trash2 size={12} /> Remove ({selectedSelfIds.size})
                            </button>
                          )}
                          <button onClick={addStatusEffect} className={`${retro.button} px-3 py-1 text-[12px] flex items-center gap-1`} style={S_GREEN_BTN}>
                            <Plus size={10} /> Add Effect
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] mb-3 px-1" style={S_MUTED}>
                        Effects that apply to your character. Buffs here modify your stats.
                      </div>
                      {selfEffects.length === 0 ? (
                        <div className="text-[13px] text-center py-5" style={S_MUTED}>
                          No active status effects.
                        </div>
                      ) : (
                        <div className="space-y-0">
                          {renderHeaderRow()}
                          {selfEffects.map(renderEffectRow)}
                        </div>
                      )}
                    </div>

                    {/* ── Abilities / Cards Panel (does not affect the player) ── */}
                    <div className={`${retro.raised} p-4`} style={{ background: theme.cardBg, border: `1px solid ${bc(theme.panelBorder)}` }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Flame size={14} style={S_RED} />
                          <div className="text-[13px]" style={{ color: "#FF6A6A", fontWeight: 600 }}>
                            ABILITIES / CARDS ({abilityEffects.length})
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedAbilityIds.size > 0 && (
                            <button onClick={removeSelectedEffects} className={`${retro.button} px-3 py-1 text-[12px] flex items-center gap-1`} style={S_RED}>
                              <Trash2 size={12} /> Remove ({selectedAbilityIds.size})
                            </button>
                          )}
                          <button onClick={addAbilityTracker} className={`${retro.button} px-3 py-1 text-[12px] flex items-center gap-1`} style={{ color: "#FF8A5A" }}>
                            <Plus size={10} /> Add Ability
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] mb-3 px-1" style={S_MUTED}>
                        Abilities used on enemies or effects that don&apos;t modify your stats. Duration tracked only.
                      </div>
                      {abilityEffects.length === 0 ? (
                        <div className="text-[13px] text-center py-5" style={S_MUTED}>
                          No active abilities being tracked.
                        </div>
                      ) : (
                        <div className="space-y-0">
                          {renderHeaderRow()}
                          {abilityEffects.map(renderEffectRow)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* INVENTORY TAB */}
          {player && activeTab === "inventory" && (() => {
            const subConfig = {
              equipped: { label: "Equipped", icon: Sword, accent: "#FF7A5A", items: equippedItems, empty: "No equipped items. Items typed as Weapon, Armor, etc. or tagged \"Equipped\" appear here." },
              effects: { label: "Equipped Item Effects", icon: Sparkles, accent: "#C4A0FF", items: [] as ManagedItem[], empty: "" },
              consumables: { label: "Sources / Money", icon: Coins, accent: "#FFD700", items: consumableItems, empty: "No source or currency items." },
              general: { label: "General Inventory", icon: Backpack, accent: "#5A9AFF", items: generalItems, empty: "No items match your search or filters." },
            } as const;
            const active = subConfig[inventorySubTab];
            const ActiveIcon = active.icon;

            // ── Render an item row (reusable) ──
            const renderItemRow = (item: ManagedItem, onClick: () => void, opts?: { onDelete?: () => void; onEdit?: () => void }) => {
              const infoFields = getItemInfoFields(item.customFields || {});
              const allowedSlots = getAllowedEquipSlots(item.customFields || {});
              const effectCount = Object.keys(item.customFields || {}).filter((key) => key.startsWith("Effect::") && String(item.customFields?.[key] || "").trim()).length;
              const quickRollCount = getQuickRollSlots(item.customFields || {}).filter((slot) => slot.expression.trim()).length + infoFields.filter((field) => field.rollExpression.trim()).length;
              const trackerCount = infoFields.filter((field) => field.trackerMode).length;
              const equippedEffectCount = infoFields.filter((field) => field.equippedEffect && stripHtml(field.equippedEffectText || field.content || "").trim()).length;
              const itemWeight = getItemWeightValue(item);
              const previewText = [
                stripHtml(item.description || ""),
                ...infoFields.map((field) => stripHtml(field.content || "")).filter(Boolean),
              ].find(Boolean) || "";
              const summaryBadges = [
                ...(itemWeight !== null ? [{ label: `Weight ${formatItemWeight(item)}`, accent: "#8AB8FF" }] : []),
                ...(allowedSlots.length > 0 ? [{ label: allowedSlots.map((slot) => SLOT_LABELS[slot] || slot).join(", "), accent: "#8AB8FF" }] : []),
                ...(quickRollCount > 0 ? [{ label: `${quickRollCount} Roll${quickRollCount === 1 ? "" : "s"}`, accent: "#FFD166" }] : []),
                ...(trackerCount > 0 ? [{ label: `${trackerCount} Tracker`, accent: "#FF8A5A" }] : []),
                ...(equippedEffectCount > 0 ? [{ label: `${equippedEffectCount} Equipped`, accent: "#C4A0FF" }] : []),
                ...(effectCount > 0 ? [{ label: `${effectCount} Effect${effectCount === 1 ? "" : "s"}`, accent: "#7DD3FC" }] : []),
              ];
              return (
                <div key={item.id} className={`${retro.raised} bg-[#0E0E35] p-3`} style={{ border: `1px solid ${bc(theme.panelBorder)}` }}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={onClick}
                      className="flex-1 text-left hover:opacity-95 transition-opacity cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                        <div>
                          <div className="text-[14px] inline-flex items-center gap-1.5 flex-wrap" style={{ color: theme.textColor, fontWeight: 600 }}>
                            {item.name}
                            {item.id.startsWith("pi-") && (
                              <span className="text-[8px] px-1 py-px" style={{ background: "rgba(74,192,255,0.1)", color: "#4AC0FF", border: "1px solid rgba(74,192,255,0.25)" }}>PLAYER</span>
                            )}
                            {item.locked && (
                              <span className="text-[8px] px-1 py-px inline-flex items-center gap-0.5" style={{ background: "rgba(255,106,106,0.08)", color: "#FF6A6A", border: "1px solid rgba(255,106,106,0.2)" }}>
                                <Lock size={7} /> LOCKED
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: theme.labelColor }}>
                            {item.type || "No type"}
                            {item.rarity && <span style={DISPLAY_CONTENTS}> <span style={S_DIM}>|</span> <span style={{ color: item.rarity === "Rare" ? theme.rarityRare : item.rarity === "Uncommon" ? theme.rarityUncommon : theme.rarityCommon }}>{item.rarity}</span></span>}
                          </div>
                        </div>
                        <ChevronLeft size={12} className="rotate-180 shrink-0 mt-1" style={S_DIM} />
                      </div>

                      {previewText && (
                        <div className="text-[11px] mb-2 line-clamp-2" style={{ color: theme.textColor }}>
                          {previewText}
                        </div>
                      )}

                      {summaryBadges.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {summaryBadges.map((badge) => (
                            <span key={badge.label} className="text-[8px] px-1.5 py-0.5" style={{ background: `${badge.accent}18`, color: badge.accent, border: `1px solid ${badge.accent}40` }}>
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {item.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="text-[9px] px-1.5 py-0.5"
                            style={{ background: theme.tagBg, color: theme.tagText, border: `1px solid ${bc(theme.panelBorder)}` }}
                          >
                            {tag}
                          </span>
                        ))}
                        {item.tags.length > 4 && (
                          <span className="text-[9px]" style={S_MUTED}>
                            +{item.tags.length - 4}
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0 pt-1">
                      {opts?.onEdit && (
                        <button onClick={opts.onEdit} className="px-2 py-1 hover:opacity-80" title="Edit this item">
                          <Edit size={13} style={{ color: "#5A9AFF" }} />
                        </button>
                      )}
                      {opts?.onDelete && (
                        <button onClick={opts.onDelete} className="px-2 py-1 hover:opacity-80" title="Delete this item">
                          <Trash2 size={13} style={S_RED} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <div className="space-y-4">
                {selectedItem ? (
                  renderItemDetail(selectedItem)
                ) : (
                  <div style={DISPLAY_CONTENTS}>
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <ActiveIcon size={18} style={{ color: active.accent }} />
                      <h2 className="text-[16px]" style={{ color: active.accent, fontWeight: 600 }}>
                        {active.label}
                      </h2>
                      {(inventorySubTab === "consumables" || inventorySubTab === "general") && (
                        <span className="text-[10px] px-1.5 py-0.5 ml-1" style={SUNKEN_INPUT_DIM}>
                          {active.items.length} item{active.items.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {inventorySubTab === "general" && !editingPlayerItem && (
                        <button onClick={startCreateItem} className={`${retro.button} ml-auto px-3 py-1.5 text-[11px] flex items-center gap-1.5`} style={S_GREEN_BTN}>
                          <Plus size={12} /> Create Item
                        </button>
                      )}
                    </div>

                    {inventorySubTab === "general" && renderSearchBar(invSearch, setInvSearch, allInvTags, invActiveTags, toggleInvTag, "Search all items...")}

                    {/* ═══ PLAYER ITEM EDITOR (Create / Edit) ═══ */}
                    {inventorySubTab === "general" && editingPlayerItem && (() => {
                      const editorCustomFields: Array<{ tagName: string; fieldName: string; key: string; fieldDef: TagFieldDef }> = [];
                      const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full`;
                      const inputStyle: React.CSSProperties = { color: "#C0D0F0", fontFamily: "'Tahoma', sans-serif" };
                      const labelStyle: React.CSSProperties = { color: "#5A7ABB", fontWeight: 600 };
                      return (
                        <div className={`${retro.sunken} p-5 mb-4`} style={{ background: theme.inputBg }}>
                          <div className="flex items-center justify-between mb-4">
                            <div className="text-[12px] flex items-center gap-2" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                              {isNewPlayerItem ? (
                                <div style={DISPLAY_CONTENTS}><Plus size={13} /> CREATE NEW ITEM</div>
                              ) : (
                                <div style={DISPLAY_CONTENTS}><Edit size={13} /> EDITING: {editingPlayerItem.name || "(unnamed)"}</div>
                              )}
                            </div>
                            <button onClick={cancelItemEditor} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
                          </div>

                          {/* Row 1: Name, Type, Rarity */}
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Item Name:</label>
                              <input type="text" value={editingPlayerItem.name} onChange={(e) => updateEditorField("name", e.target.value)} placeholder="Enter item name..." className={inputClass} style={inputStyle} />
                            </div>
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Item Type:</label>
                              <input type="text" value={editingPlayerItem.type} onChange={(e) => updateEditorField("type", e.target.value)} placeholder="e.g., Weapon, Armor, Tool..." className={inputClass} style={inputStyle} />
                            </div>
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Rarity:</label>
                              <select value={editingPlayerItem.rarity} onChange={(e) => updateEditorField("rarity", e.target.value)} className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full`} style={{ color: rarityColor(editingPlayerItem.rarity) }}>
                                {RARITIES.map((r) => <option key={r} value={r} style={{ color: rarityColor(r) }}>{r}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Weight:</label>
                              <select
                                value={getItemWeightTier(editingPlayerItem) ?? "M"}
                                onChange={(e) => updateEditorWeightTier(e.target.value as ManagedItem["weightTier"])}
                                className={inputClass}
                                style={inputStyle}
                              >
                                {ITEM_WEIGHT_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                              {getItemWeightTier(editingPlayerItem) === "Custom" && (
                                <input
                                  type="number"
                                  min={0}
                                  step={0.1}
                                  value={editingPlayerItem.weightValue ?? 0}
                                  onChange={(e) => updateEditorField("weightValue", Math.max(0, parseFloat(e.target.value) || 0))}
                                  placeholder="Custom weight"
                                  className={`${inputClass} mt-2`}
                                  style={inputStyle}
                                />
                              )}
                            </div>
                          </div>

                          {/* Tags */}
                          {itemTags.length > 0 && (
                            <div className="mb-4">
                              <label className="text-[10px] block mb-2" style={labelStyle}>Tags (click to toggle):</label>
                              <div className="flex flex-wrap gap-1.5">
                                {itemTags.map((tag) => {
                                  const active2 = editingPlayerItem.tags.includes(tag.name);
                                  const hasFields = tag.fields.length > 0;
                                  return (
                                    <button key={tag.id} onClick={() => toggleEditorTag(tag.name)} className="text-[10px] px-2.5 py-1 transition-colors flex items-center gap-1" style={{ background: active2 ? bc(theme.accentColor) : theme.panelBg, color: active2 ? "#FFFFFF" : theme.labelColor, border: `1px solid ${active2 ? bc(theme.accentColor) : bc(theme.dividerColor)}` }}>
                                      {tag.name}
                                      {hasFields && <span className="text-[8px] opacity-70">+{tag.fields.length}</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Custom Fields from Tags */}
                          {editorCustomFields.length > 0 && (
                            <div className="mb-4">
                              <div className="text-[10px] mb-2" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>TAG FIELDS</div>
                              <div className={`${retro.raised} p-3`} style={{ background: theme.panelBg }}>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {editorCustomFields.map((cf) => {
                                    const cfLabel = (
                                      <label key={cf.key + "-label"} className="text-[10px] block mb-1" style={{ color: bc(theme.accentColor) }}>
                                        <span style={{ color: theme.labelColor }}>{cf.tagName} ›</span> {cf.fieldName}:
                                      </label>
                                    );

                                    if (cf.tagName === "Equipment" && cf.fieldName === "Slot") {
                                      const EQUIP_SLOTS2 = [
                                        { id: "head", label: "Head" }, { id: "face", label: "Face" }, { id: "neck", label: "Neck" },
                                        { id: "jacket", label: "Jacket / Cloak" }, { id: "armor", label: "Armor" }, { id: "shirt", label: "Shirt" },
                                        { id: "armguards", label: "Armguards" }, { id: "gloves", label: "Gloves" },
                                        { id: "weapon_l", label: "Weapon (L)" }, { id: "weapon_r", label: "Weapon (R)" },
                                        { id: "belt", label: "Belt" }, { id: "belt_slot", label: "Belt Slot" },
                                        { id: "leggings", label: "Leggings" }, { id: "shoes", label: "Shoes" },
                                        { id: "ring", label: "Ring (any)" },
                                      ];
                                      return (<div key={cf.key}>{cfLabel}<select value={editingPlayerItem.customFields[cf.key] || ""} onChange={(e) => updateEditorCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Slot —</option>{EQUIP_SLOTS2.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>);
                                    }
                                    if (cf.tagName === "Attribute Buff" && cf.fieldName === "Attribute") {
                                      const ATTRS = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL"];
                                      return (<div key={cf.key}>{cfLabel}<select value={editingPlayerItem.customFields[cf.key] || ""} onChange={(e) => updateEditorCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Attribute —</option>{ATTRS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>);
                                    }
                                    if ((cf.tagName === "Attribute Buff" || cf.tagName === "Skill Buff" || cf.tagName === "Resources Buff") && cf.fieldName === "Amount") {
                                      return (<div key={cf.key}>{cfLabel}<input type="number" value={editingPlayerItem.customFields[cf.key] || ""} onChange={(e) => updateEditorCustomField(cf.key, e.target.value)} placeholder="e.g. +2 or -1" className={inputClass} style={inputStyle} /></div>);
                                    }
                                    if ((cf.tagName === "Skill Buff" || cf.tagName === "Disadvantageous") && cf.fieldName === "Skill") {
                                      const ALL_SKILLS2 = ["Athletics", "Grappling", "Acrobatics", "Sleight of Hand", "Stealth", "Endurance", "Shock", "History", "Investigation", "Arcana", "Religion", "Medicine", "Nature", "Technology/Tinkering", "Perception", "Insight", "Survival", "Persuasion", "Charm", "Control", "Clear Mind"];
                                      return (<div key={cf.key}>{cfLabel}<select value={editingPlayerItem.customFields[cf.key] || ""} onChange={(e) => updateEditorCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Skill —</option>{ALL_SKILLS2.map(s => <option key={s} value={s}>{s}</option>)}</select></div>);
                                    }
                                    if (cf.tagName === "Resources Buff" && cf.fieldName === "Resource") {
                                      const ALL_RESOURCES = ["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
                                      return (<div key={cf.key}>{cfLabel}<select value={editingPlayerItem.customFields[cf.key] || ""} onChange={(e) => updateEditorCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Resource —</option>{ALL_RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>);
                                    }
                                    if (cf.tagName === "Status Effect" && cf.fieldName === "Effect Name") {
                                      const existingEffects = statusTags.map(t => t.name);
                                      const currentVal = editingPlayerItem.customFields[cf.key] || "";
                                      const isCustom = currentVal !== "" && !existingEffects.includes(currentVal);
                                      return (
                                        <div key={cf.key}>
                                          {cfLabel}
                                          <select value={isCustom ? "__custom__" : currentVal} onChange={(e) => updateEditorCustomField(cf.key, e.target.value === "__custom__" ? "" : e.target.value)} className={inputClass} style={inputStyle}>
                                            <option value="">— Select Status Effect —</option>
                                            {existingEffects.map(e => <option key={e} value={e}>{e}</option>)}
                                            <option value="__custom__">✎ Custom...</option>
                                          </select>
                                          {(isCustom || currentVal === "") && (
                                            <input type="text" value={isCustom ? currentVal : ""} onChange={(e) => updateEditorCustomField(cf.key, e.target.value)} placeholder="Type a custom status effect..." className={`${inputClass} mt-1`} style={inputStyle} />
                                          )}
                                        </div>
                                      );
                                    }
                                    if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Type") {
                                      return (
                                        <div key={cf.key}>
                                          {cfLabel}
                                          <select value={editingPlayerItem.customFields[cf.key] || ""} onChange={(e) => {
                                            updateEditorCustomField(cf.key, e.target.value);
                                            updateEditorCustomField(cfKey("Timed Effect", "Buff Target"), "");
                                          }} className={inputClass} style={inputStyle}>
                                            <option value="">— None —</option>
                                            <option value="attribute">Attribute</option>
                                            <option value="skill">Skill</option>
                                            <option value="resource">Resource</option>
                                          </select>
                                        </div>
                                      );
                                    }
                                    if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Target") {
                                      const buffTypeVal2 = editingPlayerItem.customFields[cfKey("Timed Effect", "Buff Type")] || "";
                                      const ATTRS_TE2 = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL"];
                                      const ALL_SKILLS_TE2 = ["Athletics", "Grappling", "Acrobatics", "Sleight of Hand", "Stealth", "Endurance", "Shock", "History", "Investigation", "Arcana", "Religion", "Medicine", "Nature", "Technology/Tinkering", "Perception", "Insight", "Survival", "Persuasion", "Charm", "Control", "Clear Mind"];
                                      const ALL_RESOURCES_TE2 = ["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
                                      const options2 = buffTypeVal2 === "attribute" ? ATTRS_TE2 : buffTypeVal2 === "skill" ? ALL_SKILLS_TE2 : buffTypeVal2 === "resource" ? ALL_RESOURCES_TE2 : [];
                                      const currentVal2 = editingPlayerItem.customFields[cf.key] || "";
                                      const isValid2 = !currentVal2 || options2.includes(currentVal2);
                                      if (!buffTypeVal2) {
                                        return (<div key={cf.key}>{cfLabel}<input type="text" disabled placeholder="Select a Buff Type first..." className={inputClass} style={{ ...inputStyle, opacity: 0.4 }} /></div>);
                                      }
                                      return (
                                        <div key={cf.key}>
                                          {cfLabel}
                                          <select value={isValid2 ? currentVal2 : "__invalid__"} onChange={(e) => updateEditorCustomField(cf.key, e.target.value === "__invalid__" ? "" : e.target.value)} className={inputClass} style={inputStyle}>
                                            <option value="">— Select {buffTypeVal2 === "attribute" ? "Attribute" : buffTypeVal2 === "skill" ? "Skill" : "Resource"} —</option>
                                            {!isValid2 && <option value="__invalid__" disabled style={S_RED}>⚠ "{currentVal2}" (not recognized)</option>}
                                            {options2.map(o => <option key={o} value={o}>{o}</option>)}
                                          </select>
                                          {!isValid2 && (
                                            <div className="text-[9px] mt-1 flex items-center gap-1" style={S_RED}>
                                              ⚠ "{currentVal2}" won't apply — pick a valid {buffTypeVal2} from the list
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }
                                    if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Value") {
                                      const buffTypeVal3 = editingPlayerItem.customFields[cfKey("Timed Effect", "Buff Type")] || "";
                                      return (
                                        <div key={cf.key}>
                                          {cfLabel}
                                          <input type="text" value={editingPlayerItem.customFields[cf.key] || ""} onChange={(e) => updateEditorCustomField(cf.key, e.target.value)} placeholder={buffTypeVal3 ? "e.g. +2, P, -1" : "Select Buff Type first..."} disabled={!buffTypeVal3} className={inputClass} style={{ ...inputStyle, ...(!buffTypeVal3 ? { opacity: 0.4 } : {}) }} title="Buff value — use P for Potency substitution" />
                                        </div>
                                      );
                                    }
                                    if (cf.tagName === "Buff" && cf.fieldName === "Stat") {
                                      const ALL_BUFF_STATS2 = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL", "Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
                                      const currentVal3 = editingPlayerItem.customFields[cf.key] || "";
                                      const isValid3 = !currentVal3 || ALL_BUFF_STATS2.includes(currentVal3);
                                      return (
                                        <div key={cf.key}>
                                          {cfLabel}
                                          <select value={isValid3 ? currentVal3 : "__invalid__"} onChange={(e) => updateEditorCustomField(cf.key, e.target.value === "__invalid__" ? "" : e.target.value)} className={inputClass} style={inputStyle}>
                                            <option value="">— Select Stat —</option>
                                            {!isValid3 && <option value="__invalid__" disabled style={S_RED}>⚠ "{currentVal3}" (not recognized)</option>}
                                            <optgroup label="Attributes">
                                              {["STR", "AGI", "CON", "KNOW", "WIS", "WILL"].map(a => <option key={a} value={a}>{a}</option>)}
                                            </optgroup>
                                            <optgroup label="Resources">
                                              {["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"].map(r => <option key={r} value={r}>{r}</option>)}
                                            </optgroup>
                                          </select>
                                          {!isValid3 && (
                                            <div className="text-[9px] mt-1 flex items-center gap-1" style={S_RED}>
                                              ⚠ "{currentVal3}" won't be recognized — pick from the list
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }
                                    {renderTypedFieldShared(
                                      cf.key,
                                      cf.fieldDef,
                                      editingPlayerItem.customFields[cf.key] || cf.fieldDef.defaultValue || "",
                                      updateEditorCustomField,
                                      cfLabel,
                                      inputClass,
                                      inputStyle,
                                      retro.button,
                                    )}
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Description */}
                          <div className="mb-4">
                            <label className="text-[10px] block mb-1" style={labelStyle}>Item Description:</label>
                            <RichTextEditor value={editingPlayerItem.description} onChange={(html) => updateEditorField("description", html)} placeholder="Enter item description..." minHeight={80} />
                          </div>

                          {/* Effect areas (when "Effect" tag is active) */}
                          {editingPlayerItem.tags.includes("Effect") && (() => {
                            const effectKeys = Object.keys(editingPlayerItem.customFields ?? {})
                              .filter(k => k.startsWith("Effect::"))
                              .sort((a, b) => parseInt(a.split("::")[1]) - parseInt(b.split("::")[1]));
                            if (effectKeys.length === 0) effectKeys.push("Effect::0");
                            const nextIdx = effectKeys.length > 0
                              ? Math.max(...effectKeys.map(k => parseInt(k.split("::")[1]))) + 1
                              : 0;
                            return (
                              <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-[10px]" style={{ color: "#C4A0FF", fontWeight: 600 }}>EFFECT DESCRIPTIONS</div>
                                  <button
                                    onClick={() => updateEditorCustomField(`Effect::${nextIdx}`, "")}
                                    className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`}
                                    style={{ color: "#C4A0FF" }}
                                  >
                                    <Plus size={10} /> Add Effect
                                  </button>
                                </div>
                                <div className="space-y-3">
                                  {effectKeys.map((key, i) => (
                                    <div key={key} className={`${retro.raised} p-3`} style={{ background: theme.panelBg }}>
                                      <div className="flex items-center justify-between mb-1">
                                        <label className="text-[9px]" style={{ color: "#7A6ABB" }}>Effect #{i + 1}</label>
                                        {effectKeys.length > 1 && (
                                          <button
                                            onClick={() => {
                                              const cf = { ...editingPlayerItem.customFields };
                                              delete cf[key];
                                              setEditingPlayerItem({ ...editingPlayerItem, customFields: cf });
                                            }}
                                            className="hover:opacity-80"
                                          >
                                            <X size={12} style={S_RED} />
                                          </button>
                                        )}
                                      </div>
                                      <RichTextEditor
                                        value={editingPlayerItem.customFields[key] || ""}
                                        onChange={(html) => updateEditorCustomField(key, html)}
                                        placeholder="Describe this effect..."
                                        minHeight={60}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          <div className="flex gap-2">
                            <button onClick={savePlayerItem} disabled={!editingPlayerItem.name.trim()} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={{ color: editingPlayerItem.name.trim() ? "#4A9A5A" : "#3A4A5A", opacity: editingPlayerItem.name.trim() ? 1 : 0.5 }}>
                              <Save size={14} /> {isNewPlayerItem ? "Create Item" : "Save Changes"}
                            </button>
                            <button onClick={cancelItemEditor} className={`${retro.button} px-6 py-2 text-[12px]`} style={{ color: theme.textColor }}>Cancel</button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ═══ EQUIPPED: Two-panel layout ═══ */}
                    {inventorySubTab === "equipped" && (() => {
                      // Classic RPG equipment layout: left & right columns flanking the silhouette
                      const SLOT_POSITIONS: Record<EquipSlotId, { left: number; top: number; side: "left" | "right" }> = {
                        // ── LEFT COLUMN (body-part order top→bottom) ──
                        head:      { left: 3, top: 4, side: "left" },
                        face:      { left: 3, top: 11, side: "left" },
                        armor:     { left: 3, top: 20, side: "left" },
                        weapon_l:  { left: 3, top: 28, side: "left" },
                        armguards: { left: 3, top: 35, side: "left" },
                        belt:      { left: 3, top: 43, side: "left" },
                        leggings:  { left: 3, top: 51, side: "left" },
                        ring1:     { left: 3, top: 61, side: "left" },
                        ring2:     { left: 3, top: 67, side: "left" },
                        ring3:     { left: 3, top: 73, side: "left" },
                        ring4:     { left: 3, top: 79, side: "left" },
                        // ── RIGHT COLUMN ──
                        neck:      { left: 97, top: 4, side: "right" },
                        jacket:    { left: 97, top: 11, side: "right" },
                        shirt:     { left: 97, top: 20, side: "right" },
                        weapon_r:  { left: 97, top: 28, side: "right" },
                        gloves:    { left: 97, top: 35, side: "right" },
                        belt_slot: { left: 97, top: 43, side: "right" },
                        shoes:     { left: 97, top: 51, side: "right" },
                        ring5:     { left: 97, top: 61, side: "right" },
                        ring6:     { left: 97, top: 67, side: "right" },
                        ring7:     { left: 97, top: 73, side: "right" },
                        ring8:     { left: 97, top: 79, side: "right" },
                      };

                      const renderSlotBadge = (slot: typeof EQUIP_SLOT_DEFS[number]) => {
                        const pos = SLOT_POSITIONS[slot.id];
                        const slotItem = getItemForSlot(slot.id);
                        const SlotIcon = SLOT_ICONS[slot.category] || CircleDot;
                        const isWeaponR = slot.id === "weapon_r";
                        const isTwoHandedOccupied = isWeaponR && equipSlots.weapon_r.twoHanded;
                        const isActive = assigningSlot === slot.id;
                        const isFilled = !!slotItem;

                        return (
                          <div
                            key={slot.id}
                            className="absolute"
                            style={{
                              left: `${pos.left}%`,
                              top: `${pos.top}%`,
                              transform: pos.side === "left" ? "translateY(-50%)" : "translate(-100%, -50%)",
                              zIndex: isActive ? 10 : 2,
                            }}
                          >
                            <div className="flex items-center gap-1.5" style={{ flexDirection: pos.side === "right" ? "row-reverse" : "row" }}>
                              {/* Slot badge button */}
                              <button
                                onClick={() => {
                                  if (isWeaponR && isTwoHandedOccupied) return;
                                  if (isActive) {
                                    setAssigningSlot(null);
                                    setEquipFilterCat("All");
                                  } else {
                                    setAssigningSlot(slot.id);
                                    setEquipFilterCat(slot.category);
                                  }
                                }}
                                className="relative group shrink-0"
                                title={slotItem ? `${slot.label}: ${slotItem.name}` : `${slot.label}: Empty — click to equip`}
                                style={{ cursor: (isWeaponR && isTwoHandedOccupied) ? "default" : "pointer" }}
                              >
                                <div
                                  className="w-9 h-9 flex items-center justify-center transition-all"
                                  style={{
                                    background: isActive ? "#1A1A6B" : isFilled ? "#1A1040" : "#0A0A20",
                                    border: `2px solid ${isActive ? "#FFD700" : isFilled ? "#FF7A5A" : "#2A2A5B"}`,
                                    boxShadow: isActive ? "0 0 8px #FFD70066, 0 0 2px #FFD70044" : isFilled ? "0 0 6px #FF7A5A33" : "none",
                                  }}
                                >
                                  <SlotIcon size={15} style={{ color: isActive ? "#FFD700" : isFilled ? "#FF7A5A" : "#3A4A6A" }} />
                                </div>
                                {isFilled && !(isWeaponR && isTwoHandedOccupied) && (
                                  <div
                                    className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                    style={{ background: "#FF4444", border: "1px solid #FF6666", zIndex: 5 }}
                                    onClick={(e) => { e.stopPropagation(); assignToSlot(slot.id, null); }}
                                  >
                                    <X size={8} style={{ color: "#FFF" }} />
                                  </div>
                                )}
                                {isTwoHandedOccupied && isWeaponR && (
                                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[6px] px-1 leading-tight" style={{ background: "#3A1A1A", color: "#FF7A5A", border: "1px solid #5A2A2A", whiteSpace: "nowrap" }}>2H</div>
                                )}
                              </button>

                              {/* Label + item name */}
                              <div className="pointer-events-none" style={{ whiteSpace: "nowrap", textAlign: pos.side === "right" ? "right" : "left" }}>
                                <div className="text-[9px] leading-tight tracking-wide font-semibold" style={{ color: isActive ? "#FFD700" : "#5A6A8A" }}>
                                  {slot.label}
                                </div>
                                {isFilled && (
                                  <div className="text-[10px] leading-tight truncate max-w-[90px]" style={{ color: theme.textColor }}>
                                    {slotItem!.name}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      };

                      return (
                      <div className={`${retro.sunken} bg-[#0C0C2E] p-0`}>
                        <div className="flex" style={{ minHeight: "500px" }}>
                          {/* ── LEFT PANEL: Body Silhouette with Equipment Slots ── */}
                          <div className="p-4 overflow-y-auto flex flex-col items-center" style={{ width: "480px", minWidth: "480px", maxHeight: "780px" }}>
                            <div className="text-[11px] mb-2 tracking-wider self-start" style={{ color: "#FF7A5A", fontWeight: 600 }}>
                              EQUIPMENT SLOTS
                            </div>

                            {/* Silhouette + slot container */}
                            <div className="relative w-full" style={{ height: "700px" }}>
                              {/* All slot badges in RPG columns */}
                              {EQUIP_SLOT_DEFS.map(slot => renderSlotBadge(slot))}
                            </div>
                          </div>

                          {/* ── DIVIDER ── */}
                          <div className="w-[1px] shrink-0" style={{ background: "linear-gradient(180deg, transparent, #3A3A6B, #3A3A6B, transparent)" }} />

                          {/* ── RIGHT PANEL: Item Browser ── */}
                          <div className="flex-1 p-4 flex flex-col overflow-hidden">
                            <div className="text-[11px] mb-3 tracking-wider" style={{ color: "#5A9AFF", fontWeight: 600 }}>
                              {assigningSlot
                                ? `SELECT ITEM FOR: ${EQUIP_SLOT_DEFS.find(s => s.id === assigningSlot)?.label?.toUpperCase()}`
                                : "AVAILABLE EQUIPMENT"}
                            </div>

                            {/* Search bar */}
                            <div className={`${retro.sunken} flex items-center gap-2 px-3 py-2 mb-3`} style={{ background: "#0A0A28" }}>
                              <Search size={13} style={S_DIM} />
                              <input
                                type="text"
                                value={equipSearch}
                                onChange={(e) => setEquipSearch(e.target.value)}
                                placeholder="Search equipment..."
                                className="flex-1 bg-transparent outline-none text-[12px]"
                                style={{ color: theme.textColor }}
                              />
                              {equipSearch && (
                                <button onClick={() => setEquipSearch("")} className="hover:opacity-80">
                                  <X size={12} style={S_MUTED} />
                                </button>
                              )}
                            </div>

                            {/* Category filter */}
                            <div className="flex flex-wrap gap-1 mb-3">
                              <button
                                onClick={() => { setEquipFilterCat("All"); setAssigningSlot(null); }}
                                className="text-[9px] px-2 py-0.5 transition-colors"
                                style={{
                                  background: equipFilterCat === "All" ? "#FF7A5A" : "#0A0A28",
                                  color: equipFilterCat === "All" ? "#FFF" : "#5A6A8A",
                                  border: `1px solid ${equipFilterCat === "All" ? "#FF7A5A" : "#1A1A4B"}`,
                                }}
                              >
                                All
                              </button>
                              {EQUIP_SLOT_CATEGORIES.map(cat => (
                                <button
                                  key={cat}
                                  onClick={() => { setEquipFilterCat(equipFilterCat === cat ? "All" : cat); setAssigningSlot(null); }}
                                  className="text-[9px] px-2 py-0.5 transition-colors"
                                  style={{
                                    background: equipFilterCat === cat ? "#FF7A5A" : "#0A0A28",
                                    color: equipFilterCat === cat ? "#FFF" : "#5A6A8A",
                                    border: `1px solid ${equipFilterCat === cat ? "#FF7A5A" : "#1A1A4B"}`,
                                  }}
                                >
                                  {cat}
                                </button>
                              ))}
                            </div>

                            {/* Item list */}
                            <div className="flex-1 overflow-y-auto" style={{ maxHeight: "540px" }}>
                              {equipCandidates.length === 0 ? (
                                <div className="text-[12px] text-center py-8" style={S_DIM}>
                                  {equippedItems.length === 0
                                    ? "No equippable items available. Items typed as Weapon, Armor, etc. will appear here."
                                    : "No items match your search or filter."}
                                </div>
                              ) : (
                                <div className="space-y-0">
                                  {equipCandidates.map((item) => {
                                    const is2H = isTwoHandedItem(item);
                                    // Check if already slotted somewhere
                                    const slottedIn = EQUIP_SLOT_DEFS.filter(s => equipSlots[s.id]?.itemId === item.id).map(s => s.label);

                                    return (
                                      <div
                                        key={item.id}
                                        className="py-2.5 px-3 border-b border-[#1A1A4B] last:border-b-0 hover:bg-[#0E0E35] transition-colors"
                                      >
                                        <div className="flex items-center justify-between mb-1">
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span className="text-[13px] truncate" style={{ color: theme.textColor }}>
                                              {item.name}
                                            </span>
                                            {is2H && (
                                              <span className="text-[8px] px-1 py-0.5 shrink-0" style={{ background: "#3A1A1A", color: "#FF7A5A", border: "1px solid #5A2A2A" }}>
                                                TWO-HANDED
                                              </span>
                                            )}
                                            {item.rarity && (
                                              <span
                                                className="text-[8px] px-1 py-0.5 shrink-0"
                                                style={{
                                                  background: item.rarity === "Rare" ? "#4A2A7B" : item.rarity === "Uncommon" ? "#2A5A3B" : "#2A2A5B",
                                                  color: item.rarity === "Rare" ? theme.rarityRare : item.rarity === "Uncommon" ? theme.rarityUncommon : theme.rarityCommon,
                                                }}
                                              >
                                                {item.rarity}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                            <span className="text-[10px]" style={{ color: theme.labelColor }}>{item.type}</span>
                                            {assigningSlot ? (
                                              <button
                                                onClick={() => {
                                                  const isWeaponSlot = assigningSlot === "weapon_l" || assigningSlot === "weapon_r";
                                                  assignToSlot(assigningSlot, item.id, isWeaponSlot && is2H ? true : undefined);
                                                }}
                                                className={`${retro.button} px-2 py-1 text-[9px]`}
                                                style={S_GREEN_BTN}
                                              >
                                                Assign
                                              </button>
                                            ) : (
                                              <button
                                                onClick={() => setSelectedItem(item)}
                                                className={`${retro.button} p-1`}
                                                style={S_MUTED}
                                                title="View details"
                                              >
                                                <ChevronLeft size={12} className="rotate-180" />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                        {slottedIn.length > 0 && (
                                          <div className="text-[9px] mt-0.5" style={{ color: "#5A7A5A" }}>
                                            Equipped in: {slottedIn.join(", ")}
                                          </div>
                                        )}
                                        {getAllowedEquipSlots(item.customFields).length > 0 && (
                                          <div className="text-[9px] mt-0.5" style={{ color: "#7A7ABA" }}>
                                            Slots: {getAllowedEquipSlots(item.customFields).map((slot) => SLOT_LABELS[slot] || slot).join(", ")}
                                          </div>
                                        )}
                                        {/* ── Buff pills on item cards ── */}
                                        <div className="flex flex-wrap items-center gap-1 mt-1">
                                          {item.customFields["Attribute Buff::Attribute"] && item.customFields["Attribute Buff::Amount"] && (() => {
                                            const amt = Number(item.customFields["Attribute Buff::Amount"]);
                                            const pos = amt >= 0;
                                            return (
                                              <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-sm text-[9px]" style={{ background: pos ? "rgba(74,202,106,0.1)" : "rgba(224,85,85,0.1)", border: `1px solid ${pos ? "rgba(74,202,106,0.25)" : "rgba(224,85,85,0.25)"}`, color: pos ? "#5ACA6A" : "#E05555", fontWeight: 600, lineHeight: 1.2 }}>
                                                {item.customFields["Attribute Buff::Attribute"]} {pos ? "▲" : "▼"}{Math.abs(amt)}
                                              </span>
                                            );
                                          })()}
                                          {item.customFields["Skill Buff::Skill"] && item.customFields["Skill Buff::Amount"] && (() => {
                                            const amt = Number(item.customFields["Skill Buff::Amount"]);
                                            const pos = amt >= 0;
                                            return (
                                              <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-sm text-[9px]" style={{ background: pos ? "rgba(90,160,220,0.1)" : "rgba(224,85,85,0.1)", border: `1px solid ${pos ? "rgba(90,160,220,0.25)" : "rgba(224,85,85,0.25)"}`, color: pos ? "#5AA0DC" : "#E05555", fontWeight: 600, lineHeight: 1.2 }}>
                                                {item.customFields["Skill Buff::Skill"]} {pos ? "▲" : "▼"}{Math.abs(amt)}
                                              </span>
                                            );
                                          })()}
                                          {item.customFields["Resources Buff::Resource"] && item.customFields["Resources Buff::Amount"] && (() => {
                                            const amt = Number(item.customFields["Resources Buff::Amount"]);
                                            const pos = amt >= 0;
                                            return (
                                              <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-sm text-[9px]" style={{ background: pos ? "rgba(160,200,90,0.1)" : "rgba(220,130,80,0.1)", border: `1px solid ${pos ? "rgba(160,200,90,0.25)" : "rgba(220,130,80,0.25)"}`, color: pos ? "#A0C85A" : "#DC8250", fontWeight: 600, lineHeight: 1.2 }}>
                                                {item.customFields["Resources Buff::Resource"]} {pos ? "▲" : "▼"}{Math.abs(amt)}
                                              </span>
                                            );
                                          })()}
                                          {item.customFields["Status Effect::Effect Name"] && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-sm text-[9px]" style={{ background: "rgba(200,140,234,0.1)", border: "1px solid rgba(200,140,234,0.25)", color: "#CA8AEA", fontWeight: 600, lineHeight: 1.2 }}>
                                              {item.customFields["Status Effect::Effect Name"]}
                                            </span>
                                          )}
                                          {item.customFields["Disadvantageous::Skill"] && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-sm text-[9px]" style={{ background: "rgba(224,85,85,0.1)", border: "1px solid rgba(224,85,85,0.25)", color: "#E05555", fontWeight: 600, lineHeight: 1.2 }}>
                                              ⚠ {item.customFields["Disadvantageous::Skill"]}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                          {item.tags.slice(0, 3).map((tag) => (
                                            <span
                                              key={tag}
                                              className="text-[8px] px-1.5 py-0.5"
                                              style={{ background: theme.tagBg, color: theme.tagText, border: `1px solid ${bc(theme.panelBorder)}` }}
                                            >
                                              {tag}
                                            </span>
                                          ))}
                                          {item.tags.length > 3 && (
                                            <span className="text-[8px]" style={S_MUTED}>
                                              +{item.tags.length - 3}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                    })()}

                    {/* ═══ EQUIPPED ITEM EFFECTS ═══ */}
                    {inventorySubTab === "effects" && (() => {
                      // Collect equipped items that have effect blocks or info-field equipped effects
                      const seenIds = new Set<string>();
                      const effectItems: ManagedItem[] = [];
                      for (const slotId of Object.keys(equipSlots) as EquipSlotId[]) {
                        const assignment = equipSlots[slotId];
                        if (!assignment?.itemId) continue;
                        if (seenIds.has(assignment.itemId)) continue; // de-dup two-handed
                        seenIds.add(assignment.itemId);
                        const item = equippedItems.find(i => i.id === assignment.itemId) || playerItems.find(i => i.id === assignment.itemId);
                        const infoEquippedFields = item ? getItemInfoFields(item.customFields || {}).filter((field) => field.equippedEffect && stripHtml(field.equippedEffectText || field.content || "").trim()) : [];
                        if (item && (item.tags.includes("Effect") || infoEquippedFields.length > 0)) effectItems.push(item);
                      }

                      return (
                        <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                          {effectItems.length === 0 ? (
                            <div className="text-[12px] text-center py-6" style={S_MUTED}>
                              No equipped items have the Effect tag. Equip items with Effects to see them here.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {effectItems.map((item) => {
                                const effectKeys = Object.keys(item.customFields ?? {})
                                  .filter(k => k.startsWith("Effect::"))
                                  .sort((a, b) => parseInt(a.split("::")[1]) - parseInt(b.split("::")[1]))
                                  .filter(k => item.customFields[k]?.trim());
                                const equippedInfoFields = getItemInfoFields(item.customFields || {}).filter((field) => field.equippedEffect && stripHtml(field.equippedEffectText || field.content || "").trim());

                                return (
                                  <div key={item.id} className={`${retro.raised} p-4`} style={{ background: theme.cardBg }}>
                                    <button
                                      onClick={() => { setInventorySubTab("general"); setSelectedItem(item); }}
                                      className="text-[14px] hover:underline cursor-pointer mb-2 block"
                                      style={{ ...ts(theme.accentColor), fontWeight: 600 }}
                                    >
                                      {item.name}
                                    </button>
                                    {(effectKeys.length === 0 && equippedInfoFields.length === 0) ? (
                                      <div className="text-[11px] italic" style={S_MUTED}>
                                        No equipped effects have been written yet.
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {effectKeys.map((key, i) => (
                                          <div key={key} className={`${retro.sunken} p-3`} style={{ background: theme.inputBg }}>
                                            {effectKeys.length > 1 && (
                                              <div className="text-[9px] mb-1" style={{ color: "#7A6ABB", fontWeight: 600 }}>
                                                Effect #{i + 1}
                                              </div>
                                            )}
                                            <div className="text-[12px]" style={{ color: theme.textColor }}>
                                              <RenderFormattedText text={item.customFields[key]} color={theme.textColor} baseSize={12} />
                                            </div>
                                          </div>
                                        ))}
                                        {equippedInfoFields.map((field) => (
                                          <div key={field.fieldId} className={`${retro.sunken} p-3`} style={{ background: theme.inputBg }}>
                                            <div className="text-[9px] mb-1" style={{ color: "#8AB8FF", fontWeight: 700 }}>
                                              {field.label || "Equipped Effect"}
                                            </div>
                                            <div className="text-[12px]" style={{ color: theme.textColor }}>
                                              <RenderFormattedText text={field.equippedEffectText || field.content} color={theme.textColor} baseSize={12} />
                                            </div>
                                            {field.rollExpression.trim() && renderDiceRollControls(`equipped:${item.id}:info:${field.fieldId}`, field.rollExpression, field.rollPotency)}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ═══ SOURCES / MONEY: 2-panel layout ═══ */}
                    {inventorySubTab === "consumables" && (() => {
                      const panelDefs = [
                        { id: "source" as const, label: "Sources", icon: Gem, accent: "#C4A0FF", dmItems: sourceItems, emptyHint: "Items tagged \"Source\" or typed Material, Reagent, Gem, etc." },
                        { id: "money" as const, label: "Money", icon: Banknote, accent: "#FFD700", dmItems: moneyItems, emptyHint: "Items tagged \"Money\" or typed Currency, Gold, Coin, etc." },
                      ];
                      return (
                        <div className="space-y-4">
                          {/* Quick-item detail overlay */}
                          {viewingQuickItem && (() => {
                            const liveQi = quickItems.find(i => i.id === viewingQuickItem.id) || viewingQuickItem;
                            return (
                            <div className={`${retro.raised} p-4 mb-2`} style={{ background: theme.cardBg, border: `1px solid ${bc(theme.panelBorder)}` }}>
                              <div className="flex items-center justify-between mb-3">
                                <button onClick={() => setViewingQuickItem(null)} className="text-[11px] flex items-center gap-1 hover:opacity-80" style={S_ACCENT}>
                                  <ChevronLeft size={12} /> Back
                                </button>
                                <button onClick={() => deleteQuickItem(viewingQuickItem.id)} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={S_RED}>
                                  <Trash2 size={10} /> Remove
                                </button>
                              </div>
                              <div className="text-[15px] mb-1" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>{liveQi.name}</div>
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <button onClick={() => updateQuickItemQty(viewingQuickItem.id, -1)} className={`${retro.button} w-6 h-6 flex items-center justify-center`} style={S_RED}><Minus size={10} /></button>
                                  <span className="text-[14px] w-8 text-center" style={{ color: theme.textColor, fontWeight: 700 }}>{liveQi.qty}</span>
                                  <button onClick={() => updateQuickItemQty(viewingQuickItem.id, 1)} className={`${retro.button} w-6 h-6 flex items-center justify-center`} style={{ color: "#4ACA6A" }}><Plus size={10} /></button>
                                </div>
                                <span className="text-[10px] px-1.5 py-0.5" style={SUNKEN_INPUT_DIM}>
                                  {liveQi.category === "source" ? "Source" : liveQi.category === "money" ? "Money" : "Consumable"}
                                </span>
                                {liveQi.category === "source" && (
                                  <button
                                    onClick={() => setQuickItems(prev => prev.map(i => i.id === liveQi.id ? { ...i, priority: !i.priority } : i))}
                                    className={`${retro.button} px-2 py-0.5 text-[10px] flex items-center gap-1`}
                                    style={{ color: liveQi.priority ? "#FFD700" : "#5A6A8A" }}
                                    title={liveQi.priority ? "Priority (used first when balancing)" : "Mark as priority"}
                                  >
                                    <Star size={10} fill={liveQi.priority ? "#FFD700" : "none"} /> {liveQi.priority ? "Priority" : "Set Priority"}
                                  </button>
                                )}
                              </div>
                              {liveQi.category === "source" && (
                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px]" style={S_MUTED}>Source Amt:</span>
                                    <div className="flex items-center gap-0.5">
                                      <button onClick={() => setQuickItems(prev => prev.map(i => i.id === liveQi.id ? { ...i, sourceAmount: Math.max(0, (i.sourceAmount || 0) - 1) } : i))} className={`${retro.button} w-5 h-5 flex items-center justify-center`} style={S_RED}><Minus size={8} /></button>
                                      <span className="text-[13px] w-8 text-center" style={{ color: "#C4A0FF", fontWeight: 700 }}>{liveQi.sourceAmount || 0}</span>
                                      <button onClick={() => setQuickItems(prev => prev.map(i => i.id === liveQi.id ? { ...i, sourceAmount: (i.sourceAmount || 0) + 1 } : i))} className={`${retro.button} w-5 h-5 flex items-center justify-center`} style={{ color: "#4ACA6A" }}><Plus size={8} /></button>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px]" style={S_MUTED}>Type:</span>
                                    <select
                                      value={liveQi.sourceType || "All"}
                                      onChange={e => setQuickItems(prev => prev.map(i => i.id === liveQi.id ? { ...i, sourceType: e.target.value } : i))}
                                      className={`${retro.sunken} px-2 py-0.5 text-[10px] outline-none bg-[#0C0C2E]`}
                                      style={{ color: "#C0D0F0", fontFamily: "'Tahoma', sans-serif" }}
                                    >
                                      {allSourceTypes.map(st => <option key={st} value={st}>{st}</option>)}
                                    </select>
                                  </div>
                                </div>
                              )}
                              {liveQi.description && (
                                <div className={`${retro.sunken} p-3 text-[12px]`} style={{ color: theme.textColor, background: theme.inputBg }}>
                                  {liveQi.description}
                                </div>
                              )}
                            </div>
                            );
                          })()}

                          {!viewingQuickItem && panelDefs.map((panel) => {
                            const PanelIcon = panel.icon;
                            const myQuickItems = quickItems.filter(qi => qi.category === panel.id);
                            const isAdding = addingQuickCategory === panel.id;
                            const totalCount = panel.dmItems.length + myQuickItems.length;
                            return (
                              <div key={panel.id} className={`${retro.sunken}`} style={{ background: "#0C0C2E" }}>
                                {/* Panel header */}
                                <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid #1A1A4B" }}>
                                  <PanelIcon size={14} style={{ color: panel.accent }} />
                                  <span className="text-[13px]" style={{ color: panel.accent, fontWeight: 600 }}>{panel.label}</span>
                                  <span className="text-[9px] px-1.5 py-0.5" style={SUNKEN_INPUT_DIM}>
                                    {totalCount}
                                  </span>
                                  <button
                                    onClick={() => setAddingQuickCategory(isAdding ? null : panel.id)}
                                    className={`${retro.button} ml-auto px-2 py-0.5 text-[10px] flex items-center gap-1`}
                                    style={{ color: isAdding ? "#FF6A6A" : "#4ACA6A" }}
                                  >
                                    {isAdding ? <div style={DISPLAY_CONTENTS}><X size={9} /> Cancel</div> : <div style={DISPLAY_CONTENTS}><Plus size={9} /> Add</div>}
                                  </button>
                                </div>

                                {/* Add form */}
                                {isAdding && (
                                  <div className="px-3 py-2 space-y-1.5" style={{ background: "#0A0A28", borderBottom: "1px solid #1A1A4B" }}>
                                    <div className="flex gap-1.5">
                                      <input
                                        type="text"
                                        value={quickName}
                                        onChange={e => setQuickName(e.target.value)}
                                        placeholder="Item name..."
                                        className={`${retro.sunken} flex-1 px-2 py-1 text-[11px] outline-none bg-[#0C0C2E]`}
                                        style={{ color: "#C0D0F0", fontFamily: "'Tahoma', sans-serif" }}
                                        autoFocus
                                        onKeyDown={e => { if (e.key === "Enter") addQuickItem(panel.id); }}
                                      />
                                      <input
                                        type="number"
                                        value={quickQty}
                                        onChange={e => setQuickQty(e.target.value)}
                                        placeholder="Qty"
                                        min="0"
                                        className={`${retro.sunken} w-14 px-2 py-1 text-[11px] text-center outline-none bg-[#0C0C2E]`}
                                        style={{ color: "#C0D0F0", fontFamily: "'Tahoma', sans-serif" }}
                                      />
                                    </div>
                                    {panel.id === "source" && (
                                      <div className="flex gap-1.5">
                                        <div className="flex items-center gap-1">
                                          <span className="text-[9px] shrink-0" style={S_MUTED}>Amt:</span>
                                          <input
                                            type="number"
                                            value={quickSourceAmt}
                                            onChange={e => setQuickSourceAmt(e.target.value)}
                                            placeholder="0"
                                            min="0"
                                            className={`${retro.sunken} w-14 px-2 py-1 text-[11px] text-center outline-none bg-[#0C0C2E]`}
                                            style={{ color: "#C4A0FF", fontFamily: "'Tahoma', sans-serif" }}
                                          />
                                        </div>
                                        <div className="flex items-center gap-1 flex-1">
                                          <span className="text-[9px] shrink-0" style={S_MUTED}>Type:</span>
                                          <select
                                            value={quickSourceType}
                                            onChange={e => setQuickSourceType(e.target.value)}
                                            className={`${retro.sunken} flex-1 px-2 py-1 text-[11px] outline-none bg-[#0C0C2E]`}
                                            style={{ color: "#C0D0F0", fontFamily: "'Tahoma', sans-serif" }}
                                          >
                                            {allSourceTypes.map(st => <option key={st} value={st}>{st}</option>)}
                                          </select>
                                        </div>
                                      </div>
                                    )}
                                    <input
                                      type="text"
                                      value={quickDesc}
                                      onChange={e => setQuickDesc(e.target.value)}
                                      placeholder="Description (optional)..."
                                      className={`${retro.sunken} w-full px-2 py-1 text-[11px] outline-none bg-[#0C0C2E]`}
                                      style={{ color: "#C0D0F0", fontFamily: "'Tahoma', sans-serif" }}
                                      onKeyDown={e => { if (e.key === "Enter") addQuickItem(panel.id); }}
                                    />
                                    <button onClick={() => addQuickItem(panel.id)} className={`${retro.button} w-full py-1 text-[10px]`} style={{ color: "#4ACA6A" }}>
                                      ADD ITEM
                                    </button>
                                  </div>
                                )}

                                {/* Panel body */}
                                <div className="px-3 py-2">
                                  {totalCount === 0 && !isAdding ? (
                                    <div className="text-[11px] text-center py-3" style={S_MUTED}>
                                      {panel.emptyHint}
                                    </div>
                                  ) : (
                                    <div className="space-y-0.5">
                                      {/* Items (click goes to General Inventory) */}
                                      {panel.dmItems.map((item) => {
                                        const srcPts = panel.id === "source" ? parseInt(item.customFields["Source::Source Points"] || "0", 10) : 0;
                                        let srcType = "";
                                        if (panel.id === "source") {
                                          for (const t of item.tags) {
                                            const m = t.match(/^Source Type:\s*(.+)$/i);
                                            if (m) { srcType = m[1].trim(); break; }
                                          }
                                        }
                                        const qtyAmt = item.tags.includes("Quantity") ? (item.customFields["Quantity::Amount"] || "0") : null;
                                        return (
                                        <button
                                          key={item.id}
                                          onClick={() => { setInventorySubTab("general"); setSelectedItem(item); }}
                                          className="w-full flex items-center justify-between py-1.5 px-2 text-left hover:bg-[#0E0E35] transition-colors cursor-pointer"
                                          style={{ border: "none", background: "transparent", borderBottom: "1px solid #1A1A4B22" }}
                                        >
                                          <span className="text-[12px] flex items-center gap-1.5" style={{ color: theme.textColor }}>
                                            {item.name}
                                            {qtyAmt !== null && (
                                              <span className="text-[10px] px-1 py-px" style={{ background: "rgba(255,215,0,0.1)", color: "#FFD700", border: "1px solid rgba(255,215,0,0.2)", fontWeight: 600 }}>
                                                x{qtyAmt}
                                              </span>
                                            )}
                                          </span>
                                          {panel.id === "source" && srcPts > 0 ? (
                                            <span className="text-[10px] px-1.5 py-px shrink-0" style={{ background: "rgba(196,160,255,0.1)", color: "#C4A0FF", border: "1px solid rgba(196,160,255,0.2)", fontWeight: 600 }}>
                                              {srcPts}{srcType ? ` ${srcType}` : ""}
                                            </span>
                                          ) : (
                                            <span className="text-[10px]" style={S_MUTED}>
                                              {item.type}
                                            </span>
                                          )}
                                        </button>
                                        );
                                      })}
                                      {/* Quick items */}
                                      {myQuickItems.map((qi) => (
                                        <div
                                          key={qi.id}
                                          className="flex items-center py-1.5 px-2 hover:bg-[#0E0E35] transition-colors group/qi"
                                          style={{ borderBottom: "1px solid #1A1A4B22" }}
                                        >
                                          {qi.category === "source" && (
                                            <button
                                              onClick={() => setQuickItems(prev => prev.map(i => i.id === qi.id ? { ...i, priority: !i.priority } : i))}
                                              className="w-4 h-4 flex items-center justify-center shrink-0 mr-1 cursor-pointer"
                                              style={{ border: "none", background: "transparent", color: qi.priority ? "#FFD700" : "#2A2A5B" }}
                                              title={qi.priority ? "Priority (used first)" : "Set as priority"}
                                            >
                                              <Star size={10} fill={qi.priority ? "#FFD700" : "none"} />
                                            </button>
                                          )}
                                          <button
                                            onClick={() => setViewingQuickItem(qi)}
                                            className="flex-1 text-left cursor-pointer"
                                            style={{ border: "none", background: "transparent" }}
                                          >
                                            <span className="text-[12px] inline-flex items-center gap-1.5" style={{ color: theme.textColor }}>
                                              {qi.name}
                                              {qi.description && <span className="text-[8px]" style={S_MUTED}>...</span>}
                                              {qi.category === "source" && (qi.sourceAmount || 0) > 0 && (
                                                <span className="text-[9px] px-1 py-px" style={{ background: "rgba(196,160,255,0.1)", color: "#C4A0FF", border: "1px solid rgba(196,160,255,0.2)" }}>
                                                  {qi.sourceAmount} {qi.sourceType || "All"}
                                                </span>
                                              )}
                                            </span>
                                          </button>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => updateQuickItemQty(qi.id, -1)} className="w-4 h-4 flex items-center justify-center opacity-0 group-hover/qi:opacity-100 transition-opacity cursor-pointer" style={{ color: "#FF6A6A", border: "none", background: "transparent" }}>
                                              <Minus size={8} />
                                            </button>
                                            <span className="text-[11px] w-6 text-center" style={{ color: panel.accent, fontWeight: 700 }}>{qi.qty}</span>
                                            <button onClick={() => updateQuickItemQty(qi.id, 1)} className="w-4 h-4 flex items-center justify-center opacity-0 group-hover/qi:opacity-100 transition-opacity cursor-pointer" style={{ color: "#4ACA6A", border: "none", background: "transparent" }}>
                                              <Plus size={8} />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* ═══ SOURCE USED / TOTAL SOURCE PANEL ═══ */}
                          {!viewingQuickItem && (
                            <div className={`${retro.raised} p-3`} style={SUNKEN_INPUT}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Flame size={14} style={{ color: "#FF7A5A" }} />
                                <span className="text-[12px]" style={{ color: "#FF7A5A", fontWeight: 600 }}>Source Used / Total</span>
                                <div className="flex-1" />
                                <div
                                  className="relative"
                                  onMouseEnter={() => setHoveredSourceTotal(true)}
                                  onMouseLeave={() => setHoveredSourceTotal(false)}
                                >
                                  <div
                                    className={`${retro.sunken} px-3 py-1.5 text-[13px] cursor-default`}
                                    style={{
                                      background: "#0C0C2E",
                                      color: totalSourceUsed > totalSourceAll ? "#FF6A6A" : totalSourceUsed > 0 ? "#FFB347" : "#C0D0F0",
                                      fontWeight: 700,
                                      minWidth: 80,
                                      textAlign: "center",
                                    }}
                                  >
                                    {totalSourceUsed} / {totalSourceAll}
                                  </div>
                                  {hoveredSourceTotal && (
                                    <div
                                      className={`${retro.raised} absolute bottom-full left-1/2 mb-1 p-2 z-50 whitespace-nowrap`}
                                      style={{ background: "#0C0C2E", border: "1px solid #2A2A6B", transform: "translateX(-50%)", minWidth: 140 }}
                                    >
                                      <div className="text-[9px] mb-1" style={{ color: "#5A6A8A", fontWeight: 600 }}>SOURCE BREAKDOWN</div>
                                      {Object.keys(totalSourceByType).length === 0 ? (
                                        <div className="text-[10px]" style={S_MUTED}>No source items</div>
                                      ) : (
                                        Object.entries(totalSourceByType).map(([type, amt]) => (
                                          <div key={type} className="flex items-center justify-between text-[10px] gap-3">
                                            <span style={{ color: "#C4A0FF" }}>{type}</span>
                                            <span style={{ color: "#C0D0F0", fontWeight: 600 }}>{amt}</span>
                                          </div>
                                        ))
                                      )}
                                      {Object.keys(sourceUsedByType).length > 0 && (
                                        <div style={DISPLAY_CONTENTS}>
                                          <div className="h-px my-1" style={{ background: "#1A1A4B" }} />
                                          <div className="text-[9px] mb-0.5" style={{ color: "#FF7A5A", fontWeight: 600 }}>USED</div>
                                          {Object.entries(sourceUsedByType).map(([type, amt]) => (
                                            <div key={type} className="flex items-center justify-between text-[10px] gap-3">
                                              <span style={{ color: "#FFB347" }}>{type}</span>
                                              <span style={{ color: "#FF7A5A", fontWeight: 600 }}>-{amt}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={handleBalanceSource}
                                  disabled={sourceUsed.length === 0}
                                  className={`${retro.button} px-2 py-1.5 text-[10px] flex items-center gap-1`}
                                  style={{
                                    color: sourceUsed.length === 0 ? "#3A4A6A" : "#4ACA6A",
                                    cursor: sourceUsed.length === 0 ? "not-allowed" : "pointer",
                                  }}
                                  title="Subtract used source from source items (priority items first)"
                                >
                                  <Scale size={11} /> Balance
                                </button>
                              </div>
                              {sourceUsed.length > 0 && (
                                <div className="mt-2 space-y-0.5">
                                  {sourceUsed.slice(-5).reverse().map(su => (
                                    <div key={su.id} className="flex items-center justify-between text-[10px] px-1">
                                      <span style={S_TEXT}>{su.cardName}</span>
                                      <span style={{ color: "#FFB347" }}>-{su.amount} {su.sourceType}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ═══ ACTIVITY LOG ═══ */}
                          {!viewingQuickItem && (
                            <div className={`${retro.sunken}`} style={{ background: "#0C0C2E" }}>
                              <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid #1A1A4B" }}>
                                <History size={13} style={{ color: "#5A9AFF" }} />
                                <span className="text-[12px]" style={{ color: "#5A9AFF", fontWeight: 600 }}>Recent Activity</span>
                                <span className="text-[9px] px-1.5 py-0.5" style={SUNKEN_INPUT_DIM}>
                                  {activityLog.length}
                                </span>
                                {activityLog.length > 0 && (
                                  <button
                                    onClick={() => setActivityLog([])}
                                    className={`${retro.button} ml-auto px-2 py-0.5 text-[9px]`}
                                    style={S_RED}
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                              <div className="px-3 py-2" style={{ maxHeight: 160, overflowY: "auto" }}>
                                {activityLog.length === 0 ? (
                                  <div className="text-[11px] text-center py-3" style={S_MUTED}>
                                    No recent activity yet.
                                  </div>
                                ) : (
                                  <div className="space-y-0.5">
                                    {activityLog.map(entry => {
                                      const actionColors: Record<string, string> = { use: "#FF7A5A", add: "#4ACA6A", remove: "#FF6A6A", balance: "#5A9AFF" };
                                      const actionIcons: Record<string, string> = { use: ">", add: "+", remove: "-", balance: "=" };
                                      const timeDiff = Date.now() - entry.timestamp;
                                      const mins = Math.floor(timeDiff / 60000);
                                      const timeStr = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
                                      return (
                                        <div key={entry.id} className="flex items-center gap-2 py-1 text-[10px]" style={{ borderBottom: "1px solid #1A1A4B22" }}>
                                          <span className="shrink-0 w-3 text-center" style={{ color: actionColors[entry.action] || "#5A6A8A" }}>
                                            {actionIcons[entry.action] || "\u00B7"}
                                          </span>
                                          <span className="flex-1 truncate" style={S_TEXT}>{entry.detail}</span>
                                          <span className="shrink-0" style={S_DIM}>{timeStr}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ═══ GENERAL: Original list layout ═══ */}
                    {inventorySubTab === "general" && (
                      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                        {active.items.length === 0 ? (
                          <div className="text-[12px] text-center py-6" style={S_MUTED}>
                            {playerItems.length === 0
                              ? "No items have been assigned to your profile yet."
                              : active.empty}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {active.items.map((item) => {
                              const editable = canPlayerEdit(item);
                              const deletable = item.id.startsWith("pi-");
                              return renderItemRow(
                                item,
                                () => setSelectedItem(item),
                                (editable || deletable) ? {
                                  onEdit: editable ? () => startEditItem(item) : undefined,
                                  onDelete: deletable ? () => deletePlayerItem(item.id) : undefined,
                                } : undefined
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* CARDS TAB */}
          {player && activeTab === "cards" && (
            <div className="space-y-4">
              {/* ═══ CARDS SUB-TAB ═══ */}
              {cardsSubTab === "cards" && (
                <div style={DISPLAY_CONTENTS}>
                  {selectedCard ? (
                    renderCardDetail(selectedCard)
                  ) : (() => {
                    const nodeTrees = playerAssignedNodeTrees;
                    const activeTree = cardTreeFilter ? nodeTrees.find(t => t.id === cardTreeFilter) : null;
                    const activeNode = activeTree && cardNodeFilter ? activeTree.nodes.find(n => n.id === cardNodeFilter) : null;
                    return (
                    <div style={DISPLAY_CONTENTS}>
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCard size={18} style={{ color: "#FF7A5A" }} />
                        <h2 className="text-[16px]" style={{ color: "#FF7A5A", fontWeight: 600 }}>
                          Ability Cards
                        </h2>
                        <span className="text-[10px] px-1.5 py-0.5 ml-1" style={SUNKEN_INPUT_DIM}>
                          {filteredCards.length} card{filteredCards.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Breadcrumb */}
                      <div className="flex items-center gap-1.5 mb-3 text-[11px] flex-wrap">
                        <button
                          onClick={() => { setCardTreeFilter(null); setCardNodeFilter(null); }}
                          className="hover:underline"
                          style={{ color: !cardTreeFilter ? firstColor(theme.accentColor) : theme.labelColor, fontWeight: !cardTreeFilter ? 600 : 400 }}
                        >All Cards</button>
                        {activeTree && (
                          <div style={DISPLAY_CONTENTS}>
                            <span style={S_DIM}>/</span>
                            <button
                              onClick={() => setCardNodeFilter(null)}
                              className="hover:underline flex items-center gap-1"
                              style={{ color: !cardNodeFilter ? firstColor(theme.accentColor) : theme.labelColor, fontWeight: !cardNodeFilter ? 600 : 400 }}
                            ><GitBranch size={10} />{activeTree.name}</button>
                          </div>
                        )}
                        {activeNode && (
                          <div style={DISPLAY_CONTENTS}>
                            <span style={S_DIM}>/</span>
                            <span style={{ color: firstColor(theme.accentColor), fontWeight: 600 }}>{activeNode.label}</span>
                          </div>
                        )}
                      </div>

                      {/* Node Tree / Node tabs (only when not filtering by node already) */}
                      {!cardTreeFilter && nodeTrees.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {nodeTrees.map(t => (
                            <button
                              key={t.id}
                              onClick={() => { setCardTreeFilter(t.id); setCardNodeFilter(null); }}
                              className={`${retro.raised} px-2.5 py-1 text-[10px] flex items-center gap-1 hover:brightness-110 transition-colors`}
                              style={{ background: theme.cardBg, color: "#5AE0B0", border: "1px solid #5AE0B033" }}
                            >
                              <GitBranch size={9} />
                              {t.name}
                              <span className="text-[8px] ml-0.5" style={S_MUTED}>({t.nodes.reduce((acc, n) => acc + n.cardIds.filter(cid => playerCards.some(pc => pc.id === cid)).length, 0)})</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {cardTreeFilter && !cardNodeFilter && activeTree && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {activeTree.nodes.filter(n => n.cardIds.some(cid => playerCards.some(pc => pc.id === cid))).map(n => (
                            <button
                              key={n.id}
                              onClick={() => setCardNodeFilter(n.id)}
                              className={`${retro.raised} px-2.5 py-1 text-[10px] flex items-center gap-1 hover:brightness-110 transition-colors`}
                              style={{ background: theme.cardBg, color: firstColor(theme.accentColor), border: `1px solid ${firstColor(theme.accentColor)}33` }}
                            >
                              {n.label}
                              <span className="text-[8px] ml-0.5" style={S_MUTED}>({n.cardIds.filter(cid => playerCards.some(pc => pc.id === cid)).length})</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {renderSearchBar(cardSearch, setCardSearch, allCardTags, cardActiveTags, toggleCardTag, "Search ability cards...")}

                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="text-[9px]" style={S_MUTED}>Sources:</span>
                        {([
                          { id: "all" as const, label: "All" },
                          { id: "direct" as const, label: "Direct" },
                          { id: "node" as const, label: "Node" },
                          { id: "magic" as const, label: "Magic" },
                          { id: "level" as const, label: "Level" },
                        ]).map((source) => (
                          <button
                            key={source.id}
                            onClick={() => setCardSourceFilter(source.id)}
                            className="text-[9px] px-1.5 py-0.5"
                            style={{
                              color: cardSourceFilter === source.id ? firstColor(theme.accentColor) : "#5A6A8A",
                              background: cardSourceFilter === source.id ? `${firstColor(theme.accentColor)}15` : "transparent",
                              border: `1px solid ${cardSourceFilter === source.id ? firstColor(theme.accentColor) + "40" : "#1A1A4B"}`,
                              fontWeight: cardSourceFilter === source.id ? 600 : 400,
                            }}
                          >
                            {source.label}
                          </button>
                        ))}
                      </div>

                      {/* Sort Options */}
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="text-[9px]" style={S_MUTED}>Sort:</span>
                        {(["default", "level", "actionType", "sourceType"] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => setCardSortBy(s)}
                            className="text-[9px] px-1.5 py-0.5"
                            style={{ color: cardSortBy === s ? firstColor(theme.accentColor) : "#5A6A8A", background: cardSortBy === s ? `${firstColor(theme.accentColor)}15` : "transparent", border: `1px solid ${cardSortBy === s ? firstColor(theme.accentColor) + "40" : "#1A1A4B"}`, fontWeight: cardSortBy === s ? 600 : 400 }}
                          >{s === "default" ? "Default" : s === "level" ? "Level" : s === "actionType" ? "Action Type" : "Source Type"}</button>
                        ))}
                      </div>

                      {filteredCards.length === 0 ? (
                        <div className="text-[12px] text-center py-6" style={S_MUTED}>
                          {playerCards.length === 0
                            ? "No ability cards are available on this profile yet."
                            : "No cards match your search or filters."}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                          {filteredCards.map((card) => (
                            <button
                              key={card.id}
                              onClick={() => setSelectedCard(card)}
                              className={`${retro.raised} p-4 text-left hover:brightness-110 transition-colors cursor-pointer`}
                              style={{ background: theme.cardBg }}
                            >
                              <div className="text-[14px] mb-1" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                                {card.name}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] mb-2" style={{ color: theme.labelColor }}>
                                <span>{card.type || "No type"}</span>
                                <span style={S_DIM}>|</span>
                                <span>{card.actionCost || "No action cost"}</span>
                                {card.customFields["Level"] && (
                                  <>
                                    <span style={S_DIM}>|</span>
                                    <span style={{ color: "#FFD700" }}>Lv.{card.customFields["Level"]}</span>
                                  </>
                                )}
                                {card.customFields["Source Type"] && (
                                  <>
                                    <span style={S_DIM}>|</span>
                                    <span style={{ color: "#9A7ABB" }}>{card.customFields["Source Type"]}</span>
                                  </>
                                )}
                              </div>
                              <div className="hidden text-[11px] mb-1" style={{ color: theme.labelColor }}>
                                {card.type} · {card.actionCost}
                                {card.customFields["Level"] && <span style={DISPLAY_CONTENTS}> · <span style={{ color: "#FFD700" }}>Lv.{card.customFields["Level"]}</span></span>}
                                {card.customFields["Source Type"] && <span style={DISPLAY_CONTENTS}> · <span style={{ color: "#9A7ABB" }}>{card.customFields["Source Type"]}</span></span>}
                              </div>
                              <div className="text-[12px] leading-relaxed mb-3 break-words" style={{ color: theme.textColor }}>
                                {(() => { const plain = card.effect.replace(/<[^>]*>/g, ""); return plain.length > 100 ? plain.slice(0, 100) + "..." : plain; })()}
                              </div>
                              <div className="flex flex-wrap gap-1 mb-2">
                                {getCardSourceLabels(card.id).map((source) => (
                                  <span
                                    key={`${card.id}-${source}`}
                                    className="text-[8px] px-1.5 py-0.5"
                                    style={{
                                      background: source === "Magic" ? "#162548" : source === "Level" ? "#30240A" : source === "Node" ? "#113524" : "#2A1630",
                                      color: source === "Magic" ? "#9FC9FF" : source === "Level" ? "#FFD700" : source === "Node" ? "#7CF0BE" : "#F4A9D8",
                                      border: "1px solid #2B3B6B",
                                    }}
                                  >
                                    {source}
                                  </span>
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {card.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-[9px] px-1.5 py-0.5"
                                    style={{ background: theme.tagBg, color: theme.tagText, border: `1px solid ${bc(theme.panelBorder)}` }}
                                  >
                                    {getDisplayCardTagName(tag)}
                                  </span>
                                ))}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })()}
                </div>
              )}

              {/* ═══ LEVEL ABILITIES SUB-TAB ═══ */}
              {cardsSubTab === "magic" && (
                <div style={DISPLAY_CONTENTS}>
                  {magicSelectedCard ? (
                    <div style={DISPLAY_CONTENTS}>
                      <button
                        onClick={() => setMagicSelectedCard(null)}
                        className={`${retro.raised} px-3 py-1.5 text-[11px] flex items-center gap-1.5 mb-3 hover:brightness-110`}
                        style={{ background: theme.cardBg, color: theme.labelColor }}
                      ><ChevronLeft size={12} />Back to Magic</button>
                      {renderCardDetail(magicSelectedCard)}
                    </div>
                  ) : (
                    <div style={DISPLAY_CONTENTS}>
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={18} style={{ color: "#8AB8FF" }} />
                        <h2 className="text-[16px]" style={{ color: "#8AB8FF", fontWeight: 600 }}>
                          Magic
                        </h2>
                        <span className="text-[10px] px-1.5 py-0.5 ml-1" style={SUNKEN_INPUT_DIM}>
                          {normalizedMagicLists.length} magic list{normalizedMagicLists.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {normalizedMagicLists.length === 0 ? (
                        <div className="text-[12px] text-center py-6" style={S_MUTED}>
                          No magic lists have been granted to this character yet.
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {normalizedMagicLists.map((list) => {
                              const isActive = selectedMagicListId === list.id;
                              const totalSpells = MAGIC_TIER_ORDER.reduce((sum, tier) => sum + (list.tiers[tier]?.length || 0), 0);
                              return (
                                <button
                                  key={list.id}
                                  onClick={() => setSelectedMagicListId(list.id)}
                                  className={`${isActive ? retro.sunken : retro.raised + " hover:bg-[#1E1E58]"} px-3 py-1.5 text-[11px] flex items-center gap-1.5 transition-colors`}
                                  style={{
                                    background: isActive ? theme.panelBg : theme.cardBg,
                                    color: isActive ? "#8AB8FF" : theme.labelColor,
                                    borderBottom: isActive ? "2px solid #8AB8FF" : "2px solid transparent",
                                    fontWeight: isActive ? 600 : 400,
                                  }}
                                >
                                  <Sparkles size={11} />
                                  {list.name}
                                  <span className="text-[8px] px-1 py-0.5" style={SUNKEN_INPUT_DIM}>{totalSpells}</span>
                                </button>
                              );
                            })}
                          </div>

                          {selectedMagicList && (
                            <>
                              {renderSearchBar(magicSearch, setMagicSearch, allMagicTags, magicActiveTags, toggleMagicTag, `Search ${selectedMagicList.name} spells...`)}

                              {(selectedMagicList.description || "").trim() && (
                                <div className={`${retro.sunken} bg-[#0C0C2E] px-3 py-2 mb-4`} style={{ borderLeft: "3px solid #8AB8FF66" }}>
                                  <div className="text-[10px] mb-1" style={S_SUBTLE}>Magic Notes</div>
                                  <div className="text-[11px]" style={{ color: theme.textColor }}>{selectedMagicList.description}</div>
                                </div>
                              )}

                              <div className="space-y-4">
                                {(() => {
                                  const hasAnySpells = MAGIC_TIER_ORDER.some((tier) => (selectedMagicList.tiers[tier] || []).length > 0);
                                  const hasFilteredSpells = MAGIC_TIER_ORDER.some((tier) => (filteredMagicCardsByTier[tier] || []).length > 0);

                                  if (!hasAnySpells) {
                                    return (
                                      <div className="text-[12px] text-center py-6" style={S_MUTED}>
                                        This magic list does not have any spells assigned yet.
                                      </div>
                                    );
                                  }

                                  if (!hasFilteredSpells) {
                                    return (
                                      <div className="text-[12px] text-center py-6" style={S_MUTED}>
                                        No spells in this magic list match your search or filters.
                                      </div>
                                    );
                                  }

                                  return MAGIC_TIER_ORDER.map((tier) => {
                                    const tierCards = filteredMagicCardsByTier[tier] || [];
                                    const tierHasCards = (selectedMagicList.tiers[tier] || []).length > 0;
                                    if (!tierHasCards) return null;

                                    return (
                                      <div key={tier} className={`${retro.sunken} bg-[#0C0C2E] overflow-hidden`}>
                                        <div className="px-4 py-3 border-b" style={{ borderColor: "#223358", background: "rgba(18,28,66,0.9)" }}>
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="text-[13px]" style={{ color: "#8AB8FF", fontWeight: 700 }}>
                                              {MAGIC_TIER_LABELS[tier]}
                                            </div>
                                            <div className="text-[10px]" style={S_SUBTLE}>
                                              {tierCards.length} spell{tierCards.length !== 1 ? "s" : ""}
                                            </div>
                                          </div>
                                        </div>
                                        {tierCards.length === 0 ? (
                                          <div className="px-4 py-4 text-[11px]" style={S_MUTED}>
                                            No spells in this tier match your current filters.
                                          </div>
                                        ) : (
                                          <div>
                                            {tierCards.map((card) => (
                                              <button
                                                key={`${tier}-${card.id}`}
                                                onClick={() => setMagicSelectedCard(card)}
                                                className="w-full text-left px-4 py-3 hover:bg-[#121C42] transition-colors border-b last:border-b-0"
                                                style={{ borderColor: "#182748" }}
                                              >
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                  <span className="text-[13px]" style={{ color: "#B7D4FF", fontWeight: 700 }}>
                                                    {card.name}
                                                  </span>
                                                  <span className="text-[9px] px-1.5 py-0.5" style={{ background: "#10203F", color: "#8AB8FF", border: "1px solid #274274" }}>
                                                    {card.type || "Spell"}
                                                  </span>
                                                  <span className="text-[9px]" style={S_SUBTLE}>
                                                    {card.actionCost || "No action cost"}
                                                  </span>
                                                  {(card.customFields["Source Type"] || "").trim() && (
                                                    <span className="text-[9px]" style={{ color: "#C4A0FF" }}>
                                                      {card.customFields["Source Type"]}
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="text-[11px] leading-relaxed" style={{ color: theme.textColor }}>
                                                  {(() => {
                                                    const plain = card.effect.replace(/<[^>]*>/g, "");
                                                    return plain.length > 180 ? `${plain.slice(0, 180)}...` : plain;
                                                  })()}
                                                </div>
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {cardsSubTab === "levelabilities" && (() => {
                const getLevelNumberFromCategory = (level: LevelCategory) => {
                  const match = level.name.match(/level\s*(\d+)/i);
                  return match ? parseInt(match[1], 10) : null;
                };

                const categoriesByLevel = new Map<number, LevelCategory[]>();
                const uncatalogedLevels: LevelCategory[] = [];

                for (const level of normalizedLevelCategories) {
                  const levelNumber = getLevelNumberFromCategory(level);
                  if (levelNumber === null) {
                    uncatalogedLevels.push(level);
                    continue;
                  }
                  const existing = categoriesByLevel.get(levelNumber) || [];
                  existing.push(level);
                  categoriesByLevel.set(levelNumber, existing);
                }

                const highestConfiguredLevel = Math.max(0, ...Array.from(categoriesByLevel.keys()));
                const highestVisibleLevel = Math.max(player?.level ?? 1, highestConfiguredLevel, 1);
                const totalLevelRewards = normalizedLevelCategories.reduce(
                  (sum, level) => sum + getLevelCategoryEntries(level).length,
                  0,
                );
                const woundIncreaseLabel = WOUND_DICE_INCREASE_LEVELS.map((level) => `Level ${level}`).join(", ");

                return (
                <div style={DISPLAY_CONTENTS}>
                  {laSelectedCard ? (
                    <div style={DISPLAY_CONTENTS}>
                      <button
                        onClick={() => setLaSelectedCard(null)}
                        className={`${retro.raised} px-3 py-1.5 text-[11px] flex items-center gap-1.5 mb-3 hover:brightness-110`}
                        style={{ background: theme.cardBg, color: theme.labelColor }}
                      ><ChevronLeft size={12} />Back to Level</button>
                      {renderCardDetail(laSelectedCard)}
                    </div>
                  ) : (
                    <div style={DISPLAY_CONTENTS}>
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <Zap size={18} style={{ color: "#FFD700" }} />
                        <h2 className="text-[16px]" style={{ color: "#FFD700", fontWeight: 600 }}>
                          Level
                        </h2>
                        <span className="text-[10px] px-1.5 py-0.5" style={SUNKEN_INPUT_DIM}>
                          {totalLevelRewards} reward{totalLevelRewards !== 1 ? "s" : ""}
                        </span>
                        <button
                          onClick={() => { void hydratePersonalFiles(); }}
                          className={`${retro.raised} px-2 py-1 text-[9px] flex items-center gap-1 ml-auto hover:brightness-125 transition-colors`}
                          style={{ background: theme.cardBg, color: theme.labelColor }}
                          title="Sync level categories from DM changes"
                        ><RefreshCw size={10} />Sync</button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
                        {[
                          { label: "Level", value: `${player?.level ?? 1}` },
                          { label: "Race", value: player?.race?.trim() || "Not set" },
                          { label: "Class", value: player?.class?.trim() || "Not set" },
                          { label: "HP Increase per Level", value: player?.hpIncreasePerLevel?.trim() || "Not set" },
                          { label: "Wound Dice", value: player?.woundDice?.trim() || "Not set" },
                          { label: "Wound Dice Increases", value: woundIncreaseLabel },
                        ].map((summary) => (
                          <div key={summary.label} className={`${retro.sunken} bg-[#0C0C2E] px-4 py-3`}>
                            <div className="text-[10px] uppercase tracking-[0.06em] mb-1" style={S_MUTED}>{summary.label}</div>
                            <div className="text-[13px] break-words" style={{ color: theme.textColor, fontWeight: 600 }}>{summary.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3 mb-4">
                        {Array.from({ length: highestVisibleLevel }, (_, index) => {
                          const levelNumber = index + 1;
                          const categories = categoriesByLevel.get(levelNumber) || [];
                          const rewardRows = categories.flatMap((level) =>
                            getLevelCategoryEntries(level)
                              .map((entry) => {
                                const card = allCardsById.get(entry.cardId);
                                return card ? { entry, card } : null;
                              })
                              .filter(Boolean) as Array<{ entry: ReturnType<typeof getLevelCategoryEntries>[number]; card: ManagedCard }>
                          );
                          const passiveRewards = rewardRows.filter(({ entry }) => !entry.showInCards);
                          const usableRewards = rewardRows.filter(({ entry }) => entry.showInCards);
                          const descriptions = categories.map((level) => (level.description || "").trim()).filter(Boolean);
                          const isCurrentLevel = levelNumber === (player?.level ?? 1);
                          const hasWoundIncrease = WOUND_DICE_INCREASE_LEVELS.includes(levelNumber as typeof WOUND_DICE_INCREASE_LEVELS[number]);

                          const renderRewardRow = ({ entry, card }: { entry: ReturnType<typeof getLevelCategoryEntries>[number]; card: ManagedCard }) => (
                            <button
                              key={`${levelNumber}-${entry.cardId}-${entry.showInCards ? "usable" : "passive"}`}
                              onClick={() => setLaSelectedCard(card)}
                              className={`${retro.raised} w-full p-3 text-left hover:brightness-110 transition-colors cursor-pointer`}
                              style={{ background: theme.cardBg }}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                <div className="text-[13px] break-words" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>{card.name}</div>
                                <span
                                  className="text-[9px] px-1.5 py-0.5"
                                  style={{
                                    background: entry.showInCards ? "#10203F" : "#2B2410",
                                    color: entry.showInCards ? "#8AB8FF" : "#FFD700",
                                    border: `1px solid ${entry.showInCards ? "#274274" : "#6B5520"}`,
                                  }}
                                >
                                  {entry.showInCards ? "Usable Reward" : "Passive Reward"}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] mb-2" style={{ color: theme.labelColor }}>
                                <span>{card.type || "No type"}</span>
                                <span style={S_DIM}>|</span>
                                <span>{card.actionCost || "No action cost"}</span>
                              </div>
                              <div className="text-[11px] leading-relaxed mb-2 break-words" style={{ color: theme.textColor }}>
                                {(() => {
                                  const plain = card.effect.replace(/<[^>]*>/g, "");
                                  return plain.length > 110 ? `${plain.slice(0, 110)}...` : plain;
                                })()}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {card.tags.map((tag) => (
                                  <span key={tag} className="text-[8px] px-1 py-0.5" style={{ background: theme.tagBg, color: theme.tagText, border: `1px solid ${bc(theme.panelBorder)}` }}>
                                    {getDisplayCardTagName(tag)}
                                  </span>
                                ))}
                              </div>
                            </button>
                          );

                          return (
                            <div key={`level-timeline-${levelNumber}`} className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                              <div className="flex flex-wrap items-center gap-2 mb-3">
                                <div className="text-[14px]" style={{ color: "#FFD700", fontWeight: 700 }}>
                                  Level {levelNumber}
                                </div>
                                {isCurrentLevel && (
                                  <span className="text-[9px] px-1.5 py-0.5" style={{ background: "#10203F", color: "#8AB8FF", border: "1px solid #274274" }}>
                                    Current
                                  </span>
                                )}
                                {hasWoundIncrease && (
                                  <span className="text-[9px] px-1.5 py-0.5" style={{ background: "#2B2410", color: "#FFD700", border: "1px solid #6B5520" }}>
                                    Wound Dice Increase
                                  </span>
                                )}
                                <span className="text-[9px] px-1.5 py-0.5 ml-auto" style={SUNKEN_INPUT_DIM}>
                                  {rewardRows.length} reward{rewardRows.length !== 1 ? "s" : ""}
                                </span>
                              </div>

                              {descriptions.length > 0 && (
                                <div className="space-y-2 mb-3">
                                  {descriptions.map((description, descriptionIndex) => (
                                    <div key={`level-${levelNumber}-description-${descriptionIndex}`} className="text-[11px] px-3 py-2" style={{ color: theme.textColor, background: theme.cardBg, borderLeft: "2px solid rgba(255,215,0,0.4)" }}>
                                      {description}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {rewardRows.length === 0 ? (
                                <div className="text-[11px] py-2" style={S_MUTED}>
                                  No rewards cataloged for this level yet.
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {passiveRewards.length > 0 && (
                                    <div className="space-y-2">
                                      <div className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#FFD700", fontWeight: 700 }}>
                                        Passive Rewards
                                      </div>
                                      <div className="space-y-2">
                                        {passiveRewards.map(renderRewardRow)}
                                      </div>
                                    </div>
                                  )}
                                  {usableRewards.length > 0 && (
                                    <div className="space-y-2">
                                      <div className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#8AB8FF", fontWeight: 700 }}>
                                        Usable Rewards
                                      </div>
                                      <div className="space-y-2">
                                        {usableRewards.map(renderRewardRow)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {uncatalogedLevels.length > 0 && (
                        <div className={`${retro.sunken} bg-[#0C0C2E] p-4 mb-4`}>
                          <div className="text-[12px] mb-3" style={{ color: "#FFD700", fontWeight: 700 }}>
                            Other Progression Entries
                          </div>
                          <div className="space-y-3">
                            {uncatalogedLevels.map((level) => {
                              const rewardRows = getLevelCategoryEntries(level)
                                .map((entry) => {
                                  const card = allCardsById.get(entry.cardId);
                                  return card ? { entry, card } : null;
                                })
                                .filter(Boolean) as Array<{ entry: ReturnType<typeof getLevelCategoryEntries>[number]; card: ManagedCard }>;

                              return (
                                <div key={level.id} className={`${retro.raised} p-3`} style={{ background: theme.cardBg }}>
                                  <div className="text-[12px] mb-1" style={{ color: theme.textColor, fontWeight: 600 }}>{level.name}</div>
                                  {(level.description || "").trim() && (
                                    <div className="text-[11px] mb-2" style={{ color: theme.labelColor }}>{level.description}</div>
                                  )}
                                  {rewardRows.length === 0 ? (
                                    <div className="text-[10px]" style={S_MUTED}>No rewards cataloged here.</div>
                                  ) : (
                                    <div className="space-y-2">
                                      {rewardRows.map(({ entry, card }) => (
                                        <button
                                          key={`${level.id}-${entry.cardId}`}
                                          onClick={() => setLaSelectedCard(card)}
                                          className={`${retro.sunken} w-full p-2 text-left hover:brightness-110 transition-colors`}
                                          style={SUNKEN_INPUT}
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-[12px]" style={{ color: theme.textColor, fontWeight: 600 }}>{card.name}</span>
                                            <span className="text-[9px]" style={{ color: entry.showInCards ? "#8AB8FF" : "#FFD700" }}>
                                              {entry.showInCards ? "Usable reward" : "Passive reward"}
                                            </span>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Level Categories */}
                      {false && sortedLevels.map(level => {
                        const levelEntries = getLevelCategoryEntries(level);
                        const levelCards = laFilteredCards.filter(c => levelEntries.some(entry => entry.cardId === c.id));
                        const isCollapsed = collapsedLevels.has(level.id);
                        // Show all level categories, even empty ones
                        return (
                          <div key={level.id} className="mb-3">
                            <div
                              className={`${retro.raised} flex items-center gap-2 px-3 py-2 cursor-pointer hover:brightness-110 transition-colors`}
                              style={{ background: theme.cardBg, borderLeft: `3px solid #FFD700` }}
                              onClick={() => toggleLevelCollapse(level.id)}
                            >
                              <ChevronRight
                                size={14}
                                style={{
                                  color: "#FFD700",
                                  transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
                                  transition: "transform 0.2s ease",
                                }}
                              />
                              <span className="text-[12px] flex-1" style={{ color: "#FFD700", fontWeight: 600 }}>{level.name}</span>
                              <span className="text-[9px] px-1.5 py-0.5" style={SUNKEN_INPUT_DIM}>{levelEntries.length}</span>
                              {false && isDM && (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  {(() => { const idx = sortedLevels.findIndex(l => l.id === level.id); return idx > 0 ? (
                                    <button onClick={() => { const reordered = normalizedLevelCategories.map(l => l.id === sortedLevels[idx].id ? { ...l, order: sortedLevels[idx - 1].order } : l.id === sortedLevels[idx - 1].id ? { ...l, order: sortedLevels[idx].order } : l); saveLevelCategories(reordered); }} className="hover:brightness-150 text-[9px] px-0.5" style={{ color: theme.labelColor }}>▲</button>
                                  ) : null; })()}
                                  {(() => { const idx = sortedLevels.findIndex(l => l.id === level.id); return idx < sortedLevels.length - 1 ? (
                                    <button onClick={() => { const reordered = normalizedLevelCategories.map(l => l.id === sortedLevels[idx].id ? { ...l, order: sortedLevels[idx + 1].order } : l.id === sortedLevels[idx + 1].id ? { ...l, order: sortedLevels[idx].order } : l); saveLevelCategories(reordered); }} className="hover:brightness-150 text-[9px] px-0.5" style={{ color: theme.labelColor }}>▼</button>
                                  ) : null; })()}
                                  <button onClick={() => setLaEditingLevel(level.id)} className="hover:brightness-150" style={{ color: theme.labelColor }}><Edit size={10} /></button>
                                  <button
                                    onClick={() => saveLevelCategories(normalizedLevelCategories.filter(lc => lc.id !== level.id))}
                                    className="hover:brightness-150"
                                    style={{ color: "#FF5A5A" }}
                                  ><Trash2 size={10} /></button>
                                </div>
                              )}
                            </div>
                            {!isCollapsed && (
                              <div className="mt-2 ml-4">
                                {(level.description || "").trim() && (
                                  <div className="text-[11px] mb-2 px-2 py-1.5" style={{ color: theme.textColor, background: theme.cardBg, borderLeft: `2px solid #FFD70066` }}>
                                    {level.description}
                                  </div>
                                )}
                                {levelEntries.length === 0 ? (
                                  <div className="text-[10px] py-2" style={S_MUTED}>No rewards assigned to this level yet.</div>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                                    {levelCards.map(card => (
                                      <button
                                        key={card.id}
                                        onClick={() => setLaSelectedCard(card)}
                                        className={`${retro.raised} p-3 text-left hover:brightness-110 transition-colors cursor-pointer`}
                                        style={{ background: theme.cardBg }}
                                      >
                                        <div className="text-[13px] mb-1" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>{card.name}</div>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] mb-2" style={{ color: theme.labelColor }}>
                                          <span>{card.type || "No type"}</span>
                                          <span style={S_DIM}>|</span>
                                          <span>{card.actionCost || "No action cost"}</span>
                                        </div>
                                        <div className="hidden text-[10px] mb-1" style={{ color: theme.labelColor }}>
                                          {card.type} · {card.actionCost}
                                        </div>
                                        <div className="text-[11px] leading-relaxed mb-2 break-words" style={{ color: theme.textColor }}>
                                          {(() => { const plain = card.effect.replace(/<[^>]*>/g, ""); return plain.length > 80 ? plain.slice(0, 80) + "..." : plain; })()}
                                        </div>
                                        <div className="text-[9px] mb-2" style={{ color: levelEntries.find((entry) => entry.cardId === card.id)?.showInCards ? "#8AB8FF" : "#FFD700" }}>
                                          {levelEntries.find((entry) => entry.cardId === card.id)?.showInCards ? "Shows in Cards too" : "Passive reward only"}
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                          {card.tags.map(tag => (
                                            <span key={tag} className="text-[8px] px-1 py-0.5" style={{ background: theme.tagBg, color: theme.tagText, border: `1px solid ${bc(theme.panelBorder)}` }}>{getDisplayCardTagName(tag)}</span>
                                          ))}
                                        </div>
                                        {false && isDM && (
                                          <button
                                            className="mt-2 text-[9px] px-1.5 py-0.5 hover:brightness-150"
                                            style={{ color: "#FF5A5A", background: "#1A080822" }}
                                            onClick={e => {
                                              e.stopPropagation();
                                              const updated = normalizedLevelCategories.map(lc => lc.id === level.id ? { ...lc, cardEntries: getLevelCategoryEntries(lc).filter(entry => entry.cardId !== card.id) } : lc);
                                              saveLevelCategories(updated);
                                            }}
                                          >Remove</button>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {/* DM: Assign card dropdown */}
                                {false && isDM && (() => {
                                  const availableCards = allCards.filter(c => !levelEntries.some(entry => entry.cardId === c.id));
                                  if (availableCards.length === 0) return null;
                                  return (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                                      <select
                                        className="px-2 py-1 text-[10px] w-full"
                                        style={{ ...SUNKEN_INPUT, color: theme.textColor }}
                                        value=""
                                        onChange={e => {
                                          if (!e.target.value) return;
                                          const cardId = e.target.value;
                                          const updated = normalizedLevelCategories.map(lc => ({
                                            ...lc,
                                            cardEntries: lc.id === level.id
                                              ? [...getLevelCategoryEntries(lc).filter(entry => entry.cardId !== cardId), { cardId, showInCards: false }]
                                              : getLevelCategoryEntries(lc).filter(entry => entry.cardId !== cardId),
                                          }));
                                          saveLevelCategories(updated);
                                        }}
                                      >
                                        <option value="">+ Add passive reward to {level.name}...</option>
                                        {availableCards.map(c => <option key={`${level.id}-passive-${c.id}`} value={c.id}>{c.name}</option>)}
                                      </select>
                                      <select
                                        className="px-2 py-1 text-[10px] w-full"
                                        style={{ ...SUNKEN_INPUT, color: theme.textColor }}
                                        value=""
                                        onChange={e => {
                                          if (!e.target.value) return;
                                          const cardId = e.target.value;
                                          const updated = normalizedLevelCategories.map(lc => ({
                                            ...lc,
                                            cardEntries: lc.id === level.id
                                              ? [...getLevelCategoryEntries(lc).filter(entry => entry.cardId !== cardId), { cardId, showInCards: true }]
                                              : getLevelCategoryEntries(lc).filter(entry => entry.cardId !== cardId),
                                          }));
                                          saveLevelCategories(updated);
                                        }}
                                      >
                                        <option value="">+ Add usable reward to {level.name}...</option>
                                        {availableCards.map(c => <option key={`${level.id}-usable-${c.id}`} value={c.id}>{c.name}</option>)}
                                      </select>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {false && laFilteredCards.length === 0 && (
                        <div className="text-[12px] text-center py-6" style={S_MUTED}>
                          {levelAbilityCards.length === 0
                            ? "No level rewards assigned yet."
                            : "No cards match your search or filters."}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })()}

              {/* ═══ NODE TREES SUB-TAB ═══ */}
              {cardsSubTab === "nodetrees" && (
                <div style={DISPLAY_CONTENTS}>
                  <div className="flex items-center gap-2 mb-4">
                    <GitBranch size={18} style={{ color: "#5AE0B0" }} />
                    <h2 className="text-[16px]" style={{ color: "#5AE0B0", fontWeight: 600 }}>
                      Node Trees
                    </h2>
                  </div>
                  {player && (
                    <PlayerNodeTreeViewer
                      playerId={player.id}
                      theme={{
                        accentColor: theme.accentColor,
                        panelBg: theme.panelBg,
                        inputBg: theme.inputBg,
                        textColor: theme.textColor,
                        labelColor: theme.labelColor,
                        cardBg: theme.cardBg,
                        panelBorder: theme.panelBorder,
                      }}
                      cards={allCards.map(c => ({ id: c.id, name: c.name, type: c.type, effect: c.effect, actionCost: c.actionCost }))}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* INFORMATION TAB */}
          {player && activeTab === "information" && (
            <PersonalFilesInformationPanel
              theme={theme}
              playerInfos={playerInfos}
              infoSubTabs={infoSubTabs}
            />
          )}

        </div>
      </div>

      {/* Mascot Popup */}
      {player && (
        <MascotPopup context={mascotContext} statusEffectAdded={lastAddedStatusEffect} />
      )}

      {saveToast && (
        <div
          className="fixed bottom-4 right-4 z-[200] px-3 py-2 text-[12px] rounded"
          style={{
            background:
              saveToast === "error"
                ? "#5A1F1F"
                : saveToast === "saving"
                ? "#1F2A5A"
                : "#1F5A2E",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
          }}
        >
          {saveToast === "saving"
            ? "Saving..."
            : saveToast === "saved"
            ? "Saved"
            : "Save failed"}
        </div>
      )}
    </div>
  );
}
