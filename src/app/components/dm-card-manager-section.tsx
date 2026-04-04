import React, { useState, useEffect, useMemo, useCallback } from "react";
import { retro } from "./retro-styles";
import { RichTextEditor } from "./rich-text-editor";
import { renderTypedField as renderTypedFieldShared } from "./tag-field-renderer";
import { loadDMPlayerLevelCategories, saveDMPlayerLevelCategories } from "@/lib/player-state-api";
import type { PlayerData, TagDefinition, ManagedCard, TagField } from "./types";
import { type NodeTree } from "./node-trees";
import {
  CreditCard,
  Zap,
  Plus,
  Save,
  X,
  Edit,
  Trash2,
  GitBranch,
  User,
  Copy,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Search,
  Eye,
  Settings,
  Tags,
  Users,
  FileText,
  Sparkles,
} from "lucide-react";
import {
  DM_TAG_BADGE,
  DM_DIVIDER,
  DM_ACTION_BADGE,
  DM_LEVEL_BADGE,
  DM_NODE_ICON,
  dmAssignDim,
  S_MUTED,
  S_TEXT,
  S_ACCENT,
  S_RED,
  S_SUBTLE,
  S_GREEN_BTN,
  S_SECTION_HDR,
  S_ACCENT_HDR,
  S_TEXT_BOLD,
} from "./dm-styles";
import { DISPLAY_CONTENTS } from "./shared-styles";
import { applyStarterProfileToCard, buildStarterProfileFromTags, buildVisibleCardTagBadges } from "./tag-profile-integration";

interface DMCardManagerSectionProps {
  players: PlayerData[];
  managedCards: ManagedCard[];
  cardTags: TagDefinition[];
  nodeTrees: NodeTree[];
  onPersistCards: (next: ManagedCard[]) => Promise<void>;
  onPersistNodeTrees: (next: NodeTree[]) => Promise<void>;
  setDmError: React.Dispatch<React.SetStateAction<string | null>>;
}

type LevelCategory = { id: string; name: string; order: number; cardIds: string[]; description?: string };
type CardEditorPanel = "preview" | "core" | "mechanics" | "tags" | "progression" | "assignment";
type CardTemplateId = "blank" | "attack" | "heal" | "buff" | "debuff" | "reaction" | "passive" | "utility";
type TagFilterMode = "all" | "active" | "withFields" | "simple";
type CardFamily = "" | "spell" | "skill" | "ability";

interface CardFamilyDef {
  id: Exclude<CardFamily, "">;
  label: string;
  accent: string;
  description: string;
  helper: string;
}

interface CardTemplateDef {
  id: CardTemplateId;
  label: string;
  description: string;
  focusPanel: CardEditorPanel;
  name: string;
  type: string;
  actionCost: string;
  effect: string;
  sourceType?: string;
  level?: string;
  suggestedTags?: string[];
  defaultFamily?: Exclude<CardFamily, "">;
  familyHints?: Array<Exclude<CardFamily, "">>;
}

type MechanicsBuilderField = "trigger" | "target" | "requirement" | "effect" | "duration" | "scaling" | "notes";

interface MechanicsBuilderState {
  trigger: string;
  target: string;
  requirement: string;
  effect: string;
  duration: string;
  scaling: string;
  notes: string;
}

interface MechanicsBlockDef {
  id: MechanicsBuilderField;
  label: string;
  placeholder: string;
  starter: string;
}

type CardSectionTone = "rules" | "highlight" | "limitation" | "reminder";

interface CardSectionBlock {
  id: string;
  title: string;
  content: string;
  tone: CardSectionTone;
}

const EDITOR_MECHANICS_KEY = "__editor_mechanics_builder";
const EDITOR_SECTION_BLOCKS_KEY = "__editor_section_blocks";
const CARD_FAMILY_KEY = "Card Family";
const USE_PROFILE_MAGIC_NATURE_KEY = "Use Profile::Magic Nature";
const USE_PROFILE_COST_MODEL_KEY = "Use Profile::Cost Model";
const USE_PROFILE_PRIMARY_COST_KEY = "Use Profile::Primary Cost";
const USE_PROFILE_USES_KEY = "Use Profile::Uses Per Long Rest";
const USE_PROFILE_RANGE_KEY = "Use Profile::Range";
const USE_PROFILE_DURATION_KEY = "Use Profile::Duration";
const USE_PROFILE_REQUIREMENTS_KEY = "Use Profile::Requirements";
const USE_PROFILE_COMPONENTS_KEY = "Use Profile::Components";
const USE_PROFILE_UPCAST_KEY = "Use Profile::Upcast / Scaling";
const USE_PROFILE_ORIGIN_KEY = "Use Profile::Origin";
const USE_PROFILE_PASSIVE_MODE_KEY = "Use Profile::Passive Mode";
const USE_PROFILE_COMPONENT_DETAILS_KEY = "Use Profile::Component Details";
const CARD_DESCRIPTION_KEY = "Description";
const CARD_TRACKER_BUCKET_KEY = "Card Tracker::Bucket";
const CARD_TRACKER_NAME_KEY = "Card Tracker::Name";
const CARD_TRACKER_DURATION_KEY = "Card Tracker::Duration";
const CARD_TRACKER_POTENCY_KEY = "Card Tracker::Potency";
const CARD_TRACKER_DAMAGE_KEY = "Card Tracker::Damage";
const CARD_TRACKER_DESCRIPTION_KEY = "Card Tracker::Effect";
const CARD_TRACKER_BUFF_TYPE_KEY = "Card Tracker::Buff Type";
const CARD_TRACKER_BUFF_TARGET_KEY = "Card Tracker::Buff Target";
const CARD_TRACKER_BUFF_VALUE_KEY = "Card Tracker::Buff Value";

type CardTrackerBucket = "" | "status" | "ability";

const CARD_FAMILY_OPTIONS: CardFamilyDef[] = [
  {
    id: "spell",
    label: "Spell",
    accent: "#8AB8FF",
    description: "True magic that uses source, usually matching the spell's nature and level.",
    helper: "Best for source costs, upcasting, concentration, and component-based casting.",
  },
  {
    id: "skill",
    label: "Skill",
    accent: "#7ACA8A",
    description: "A learned technique, usually paying exhaustion and sometimes uses per long rest.",
    helper: "Best for martial techniques, taught tricks, and learned magical-but-non-spell effects.",
  },
  {
    id: "ability",
    label: "Ability",
    accent: "#C4A0FF",
    description: "An inherent or granted power that is natural to the character, lineage, or source.",
    helper: "Best for innate gifts, racial powers, passives, and granted supernatural expressions.",
  },
];

const EMPTY_MECHANICS_BUILDER: MechanicsBuilderState = {
  trigger: "",
  target: "",
  requirement: "",
  effect: "",
  duration: "",
  scaling: "",
  notes: "",
};

const MECHANICS_BLOCKS: MechanicsBlockDef[] = [
  { id: "trigger", label: "Trigger", placeholder: "When does this card become available?", starter: "When an enemy enters your reach or begins casting a spell." },
  { id: "target", label: "Target", placeholder: "Who or what does this card affect?", starter: "Choose one creature you can see within range." },
  { id: "requirement", label: "Requirement", placeholder: "Any setup, cost gate, or condition to use it.", starter: "You must have a free hand and line of sight to the target." },
  { id: "effect", label: "Effect", placeholder: "What actually happens when the card resolves?", starter: "Deal damage, apply a condition, or move the target according to the card's rules." },
  { id: "duration", label: "Duration", placeholder: "How long does the effect last?", starter: "Until the start of your next turn." },
  { id: "scaling", label: "Scaling", placeholder: "How does the card improve with level, potency, or upgrades?", starter: "At higher levels, increase the damage or number of affected targets." },
  { id: "notes", label: "Notes", placeholder: "Extra rulings, reminders, or edge-case notes.", starter: "This card does not stack with other stance effects." },
];

const CARD_SECTION_BLOCK_PRESETS: Array<{ title: string; tone: CardSectionTone; content: string }> = [
  { title: "Summary", tone: "highlight", content: "Give a quick one- or two-sentence overview of what this card is for." },
  { title: "Main Effect", tone: "rules", content: "Describe the primary outcome when the card resolves." },
  { title: "Follow-Up", tone: "rules", content: "List any extra steps, secondary effects, or aftermath." },
  { title: "Limitation", tone: "limitation", content: "Explain restrictions, edge cases, or what this card cannot do." },
  { title: "Reminder", tone: "reminder", content: "Add a quick DM/player reminder or shorthand ruling note." },
];

const CARD_TEMPLATES: CardTemplateDef[] = [
  {
    id: "blank",
    label: "Blank Card",
    description: "Start from scratch with an empty card shell.",
    focusPanel: "core",
    name: "",
    type: "",
    actionCost: "",
    effect: "",
    familyHints: ["spell", "skill", "ability"],
  },
  {
    id: "attack",
    label: "Attack",
    description: "Damage-focused combat card with enemy targeting.",
    focusPanel: "mechanics",
    name: "New Attack",
    type: "Combat",
    actionCost: "1 Action",
    effect: "<p><strong>Target:</strong> Choose one enemy in range.</p><p><strong>Effect:</strong> Deal damage and apply any listed on-hit effects.</p>",
    sourceType: "Martial",
    level: "1",
    suggestedTags: ["Attack", "Damage", "Target: Enemy"],
    defaultFamily: "skill",
    familyHints: ["skill", "spell"],
  },
  {
    id: "heal",
    label: "Heal",
    description: "Support card for restoring health or stabilizing allies.",
    focusPanel: "mechanics",
    name: "New Heal",
    type: "Support",
    actionCost: "1 Action",
    effect: "<p><strong>Target:</strong> Choose one ally in range.</p><p><strong>Effect:</strong> Restore health or remove a harmful condition.</p>",
    sourceType: "Divine",
    level: "1",
    suggestedTags: ["Heal", "Support", "Target: Self"],
    defaultFamily: "spell",
    familyHints: ["spell", "ability"],
  },
  {
    id: "buff",
    label: "Buff",
    description: "Self or ally enhancement card with timed effects.",
    focusPanel: "tags",
    name: "New Buff",
    type: "Support",
    actionCost: "1 Action",
    effect: "<p><strong>Target:</strong> Choose yourself or one ally.</p><p><strong>Effect:</strong> Grant a temporary bonus, stance, or enhancement.</p>",
    sourceType: "Arcane",
    level: "1",
    suggestedTags: ["Buff", "Timed Effect", "Target: Self"],
    defaultFamily: "spell",
    familyHints: ["spell", "ability"],
  },
  {
    id: "debuff",
    label: "Debuff",
    description: "Enemy control or weakening effect with duration support.",
    focusPanel: "tags",
    name: "New Debuff",
    type: "Control",
    actionCost: "1 Action",
    effect: "<p><strong>Target:</strong> Choose one enemy in range.</p><p><strong>Effect:</strong> Apply a penalty, condition, or ongoing hindrance.</p>",
    sourceType: "Occult",
    level: "1",
    suggestedTags: ["Debuff", "Timed Effect", "Target: Enemy"],
    defaultFamily: "spell",
    familyHints: ["spell", "ability"],
  },
  {
    id: "reaction",
    label: "Reaction",
    description: "Triggered card meant to answer a specific event or attack.",
    focusPanel: "mechanics",
    name: "New Reaction",
    type: "Reaction",
    actionCost: "Reaction",
    effect: "<p><strong>Trigger:</strong> Define the event that allows this card to be used.</p><p><strong>Effect:</strong> Resolve the reaction immediately after the trigger.</p>",
    sourceType: "Martial",
    suggestedTags: ["Reaction"],
    defaultFamily: "skill",
    familyHints: ["skill", "ability"],
  },
  {
    id: "passive",
    label: "Passive",
    description: "Always-on card for static bonuses, toggles, or persistent rules.",
    focusPanel: "mechanics",
    name: "New Passive",
    type: "Passive",
    actionCost: "Passive",
    effect: "<p><strong>Passive Effect:</strong> Describe the continuous benefit or rule this card provides.</p>",
    suggestedTags: ["Passive", "Buff"],
    defaultFamily: "ability",
    familyHints: ["ability"],
  },
  {
    id: "utility",
    label: "Utility",
    description: "Movement, scouting, interaction, or problem-solving card.",
    focusPanel: "mechanics",
    name: "New Utility",
    type: "Utility",
    actionCost: "1 Action",
    effect: "<p><strong>Use:</strong> Describe the non-damage purpose of this card and how it resolves.</p>",
    sourceType: "Arcane",
    suggestedTags: ["Utility"],
    defaultFamily: "skill",
    familyHints: ["skill", "spell"],
  },
];

const cfKey = (tagName: string, fieldName: string) => `${tagName}::${fieldName}`;
const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;
const inputStyle = S_TEXT;
const labelStyle = S_MUTED;

function formatOwners(assignedTo: string[], players: { id: string; name: string }[]) {
  if (assignedTo.includes("all")) return "All Players";
  if (assignedTo.length === 0) return "Unassigned";
  return assignedTo.map((id) => players.find((p) => p.id === id)?.name || "Unknown").join(", ");
}

function getSaveError(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function getActiveCustomFields(entity: { tags: string[] }, tagList: TagDefinition[]): { tagName: string; fieldName: string; key: string; fieldDef: TagField }[] {
  const fields: { tagName: string; fieldName: string; key: string; fieldDef: TagField }[] = [];
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

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getCardSummary(card: ManagedCard) {
  const plain = stripHtml(card.effect || "");
  if (!plain) return "No effect text yet.";
  return plain.length > 180 ? `${plain.slice(0, 177)}...` : plain;
}

function getNodeAssignmentLabel(card: ManagedCard, nodeTrees: NodeTree[]) {
  if (!card.nodeTreeId) return "Not assigned to a node tree";
  const tree = nodeTrees.find((t) => t.id === card.nodeTreeId);
  const node = tree?.nodes.find((n) => n.id === card.nodeId);
  if (!tree) return "Node tree not found";
  return node ? `${tree.name} / ${node.label}` : `${tree.name} / No node selected`;
}


function getCardTrackerBucket(card: ManagedCard | null): CardTrackerBucket {
  const raw = (card?.customFields?.[CARD_TRACKER_BUCKET_KEY] || "").trim().toLowerCase();
  return raw === "status" || raw === "ability" ? raw : "";
}

function hasBuiltInCardTracker(card: ManagedCard | null) {
  return getCardTrackerBucket(card) !== "";
}

function trackerBucketLabel(bucket: CardTrackerBucket) {
  if (bucket === "status") return "Status Effect";
  if (bucket === "ability") return "Ability / Card Effect";
  return "Not tracked";
}

function trackerBucketAccent(bucket: CardTrackerBucket) {
  if (bucket === "status") return "#4ACA6A";
  if (bucket === "ability") return "#FF8A5A";
  return "#7A8AAA";
}


function normalizeTemplateTagName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getTemplateTags(cardTags: TagDefinition[], suggestedTags: string[] = []) {
  const wanted = new Set(suggestedTags.map(normalizeTemplateTagName));
  return cardTags
    .filter((tag) => wanted.has(normalizeTemplateTagName(tag.name)))
    .map((tag) => tag.name);
}

function getCardFamily(card: ManagedCard | null): CardFamily {
  if (!card) return "";
  const stored = (card.customFields?.[CARD_FAMILY_KEY] || "").trim().toLowerCase();
  if (stored === "spell" || stored === "skill" || stored === "ability") return stored as CardFamily;

  const hintBlob = `${card.type} ${card.customFields?.["Source Type"] || ""} ${stripHtml(card.effect || "")}`.toLowerCase();
  if (/(magical \(spell\)|spell|source magic)/.test(hintBlob)) return "spell";
  if (/(ability|passive|innate|granted|lineage|blood)/.test(hintBlob)) return "ability";
  if (/(skill|martial|technique|learned)/.test(hintBlob)) return "skill";
  return "";
}

function getCardFamilyDef(family: CardFamily): CardFamilyDef | null {
  return CARD_FAMILY_OPTIONS.find((option) => option.id === family) || null;
}

function withCardFamilyDefaults(card: ManagedCard, family: CardFamily): ManagedCard {
  const previousUses = (card.customFields?.[USE_PROFILE_USES_KEY] || "").trim();
  const nextCustomFields: Record<string, string> = {
    ...card.customFields,
    [CARD_FAMILY_KEY]: family,
    [USE_PROFILE_MAGIC_NATURE_KEY]: "",
    [USE_PROFILE_COST_MODEL_KEY]: "",
    [USE_PROFILE_PRIMARY_COST_KEY]: "",
    [USE_PROFILE_USES_KEY]: "",
    [USE_PROFILE_COMPONENTS_KEY]: "",
    [USE_PROFILE_UPCAST_KEY]: "",
    [USE_PROFILE_ORIGIN_KEY]: "",
    [USE_PROFILE_PASSIVE_MODE_KEY]: "",
  };

  if (family === "spell") {
    nextCustomFields[USE_PROFILE_MAGIC_NATURE_KEY] = "Magical (Spell)";
    nextCustomFields[USE_PROFILE_COST_MODEL_KEY] = "Source";
    nextCustomFields[USE_PROFILE_PRIMARY_COST_KEY] = nextCustomFields["Level"] ? `${nextCustomFields["Level"]} matching source` : "Matching source equal to spell level";
    nextCustomFields[USE_PROFILE_COMPONENTS_KEY] = "V, S, M";
    nextCustomFields[USE_PROFILE_UPCAST_KEY] = "Can spend additional matching source to raise the spell's level when allowed.";
  }

  if (family === "skill") {
    nextCustomFields[USE_PROFILE_MAGIC_NATURE_KEY] = "Non-magical or Magical (Non-spell)";
    nextCustomFields[USE_PROFILE_COST_MODEL_KEY] = "Exhaustion / Uses";
    nextCustomFields[USE_PROFILE_PRIMARY_COST_KEY] = "Usually 1-2 exhaustion";
    nextCustomFields[USE_PROFILE_ORIGIN_KEY] = "Learned / Taught";
    nextCustomFields[USE_PROFILE_USES_KEY] = previousUses === "Usually proficiency-based or fixed uses per long rest" ? "" : previousUses;
  }

  if (family === "ability") {
    nextCustomFields[USE_PROFILE_MAGIC_NATURE_KEY] = "Inherent or Granted (Non-spell)";
    nextCustomFields[USE_PROFILE_COST_MODEL_KEY] = "Uses / Exhaustion";
    nextCustomFields[USE_PROFILE_PRIMARY_COST_KEY] = "Often uses per long rest";
    nextCustomFields[USE_PROFILE_USES_KEY] = "Usually proficiency-based or fixed uses per long rest";
    nextCustomFields[USE_PROFILE_ORIGIN_KEY] = "Innate / Granted";
    nextCustomFields[USE_PROFILE_PASSIVE_MODE_KEY] = "Passive, activatable passive, or triggered ability";
  }

  return {
    ...card,
    customFields: nextCustomFields,
  };
}

function getCardProfileBadges(card: ManagedCard): string[] {
  const badges: string[] = [];
  const family = getCardFamily(card);
  const familyDef = getCardFamilyDef(family);
  if (familyDef) badges.push(familyDef.label);
  if ((card.customFields["Level"] || "").trim()) badges.push(`Level ${card.customFields["Level"]}`);
  if ((card.customFields["Source Type"] || "").trim()) badges.push(card.customFields["Source Type"].trim());
  if ((card.customFields[USE_PROFILE_PRIMARY_COST_KEY] || "").trim()) badges.push(card.customFields[USE_PROFILE_PRIMARY_COST_KEY].trim());
  if ((card.customFields[USE_PROFILE_USES_KEY] || "").trim()) badges.push(card.customFields[USE_PROFILE_USES_KEY].trim());
  return badges;
}

function createCardFromTemplate(template: CardTemplateDef, cardTags: TagDefinition[]): ManagedCard {
  const customFields: Record<string, string> = {};
  if (template.level) customFields["Level"] = template.level;
  if (template.sourceType) customFields["Source Type"] = template.sourceType;
  if (template.defaultFamily) customFields[CARD_FAMILY_KEY] = template.defaultFamily;

  if (template.defaultFamily === "spell") {
    customFields[USE_PROFILE_MAGIC_NATURE_KEY] = "Magical (Spell)";
    customFields[USE_PROFILE_COST_MODEL_KEY] = "Source";
    customFields[USE_PROFILE_PRIMARY_COST_KEY] = template.level ? `${template.level} matching source` : "Matching source";
    customFields[USE_PROFILE_COMPONENTS_KEY] = "V, S";
  } else if (template.defaultFamily === "skill") {
    customFields[USE_PROFILE_MAGIC_NATURE_KEY] = "Non-spell Technique";
    customFields[USE_PROFILE_COST_MODEL_KEY] = "Exhaustion / Uses";
    customFields[USE_PROFILE_PRIMARY_COST_KEY] = template.level && template.level !== "0" ? `Level ${template.level} technique cost` : "Usually 1-2 exhaustion";
    customFields[USE_PROFILE_USES_KEY] = "";
    customFields[USE_PROFILE_ORIGIN_KEY] = "Learned / Taught";
  } else if (template.defaultFamily === "ability") {
    customFields[USE_PROFILE_MAGIC_NATURE_KEY] = "Inherent or Granted (Non-spell)";
    customFields[USE_PROFILE_COST_MODEL_KEY] = "Uses / Exhaustion";
    customFields[USE_PROFILE_PRIMARY_COST_KEY] = "Usually limited uses per long rest";
    customFields[USE_PROFILE_ORIGIN_KEY] = "Innate / Granted";
  }

  return {
    id: `mc-${Date.now()}`,
    name: template.name,
    type: template.type,
    actionCost: template.actionCost,
    tags: getTemplateTags(cardTags, template.suggestedTags),
    effect: template.effect,
    assignedTo: [],
    customFields,
    nodeTreeId: "",
    nodeId: "",
  };
}


function getTagRole(tag: TagDefinition) {
  const normalized = normalizeTemplateTagName(tag.name);
  if (tag.fields.length > 0) {
    return {
      label: "Field group",
      color: "#C4A0FF",
      border: "1px solid #C4A0FF33",
      background: "#C4A0FF15",
    };
  }
  if (normalized.startsWith("target ")) {
    return {
      label: "Targeting",
      color: "#7ACA8A",
      border: "1px solid #7ACA8A33",
      background: "#7ACA8A15",
    };
  }
  if (/(attack|damage|heal|buff|debuff|support|reaction|passive|utility)/.test(normalized)) {
    return {
      label: "Modifier",
      color: "#4A7BFF",
      border: "1px solid #4A7BFF33",
      background: "#4A7BFF15",
    };
  }
  return {
    label: "Helper",
    color: "#7A8AAA",
    border: "1px solid #7A8AAA33",
    background: "#7A8AAA15",
  };
}

function getSuggestedTagDefs(
  card: ManagedCard,
  cardTags: TagDefinition[],
  mechanicsBuilder: MechanicsBuilderState,
) {
  const textBlob = [
    card.type,
    card.actionCost,
    card.customFields["Source Type"] || "",
    stripHtml(card.effect || ""),
    mechanicsBuilder.trigger,
    mechanicsBuilder.target,
    mechanicsBuilder.requirement,
    mechanicsBuilder.effect,
    mechanicsBuilder.duration,
    mechanicsBuilder.scaling,
    mechanicsBuilder.notes,
  ].join(" ").toLowerCase();

  const wanted = new Set<string>();

  if (/reaction/.test(textBlob)) wanted.add("reaction");
  if (/passive/.test(textBlob)) wanted.add("passive");
  if (/combat|attack|strike|hit|damage/.test(textBlob)) {
    wanted.add("attack");
    wanted.add("damage");
  }
  if (/heal|restore|recover|recovery/.test(textBlob)) {
    wanted.add("heal");
    wanted.add("support");
  }
  if (/support|buff|bonus|stance|enhance/.test(textBlob)) {
    wanted.add("buff");
    wanted.add("support");
  }
  if (/control|debuff|penalty|weaken|condition|hinder/.test(textBlob)) {
    wanted.add("debuff");
  }
  if (/utility|movement|scout|travel|interact|interaction/.test(textBlob)) {
    wanted.add("utility");
  }
  if (/enemy|foe|hostile/.test(textBlob)) {
    wanted.add("target enemy");
  }
  if (/self|ally|friendly/.test(textBlob)) {
    wanted.add("target self");
  }
  if ((mechanicsBuilder.duration || "").trim() || /until|for the next|for \d+/.test(textBlob)) {
    wanted.add("timed effect");
  }
  const normalizedSource = normalizeTemplateTagName(card.customFields["Source Type"] || "");
  if (normalizedSource) wanted.add(normalizedSource);

  return cardTags.filter((tag) => wanted.has(normalizeTemplateTagName(tag.name)));
}

function htmlToPlainLines(value: string) {
  return value
    .replace(/<\/p>\s*<p>/gi, "\\n")
    .replace(/<br\s*\/?>/gi, "\\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/ ?\\n ?/g, "\\n")
    .trim();
}

function parseMechanicsBuilderFromEffect(effect: string): MechanicsBuilderState {
  const lines = htmlToPlainLines(effect).split("\\n").map((line) => line.trim()).filter(Boolean);
  const next = { ...EMPTY_MECHANICS_BUILDER };
  const matchers: Record<MechanicsBuilderField, RegExp> = {
    trigger: /^trigger:\s*(.*)$/i,
    target: /^target:\s*(.*)$/i,
    requirement: /^requirement:\s*(.*)$/i,
    effect: /^effect:\s*(.*)$/i,
    duration: /^duration:\s*(.*)$/i,
    scaling: /^scaling:\s*(.*)$/i,
    notes: /^notes:\s*(.*)$/i,
  };

  for (const line of lines) {
    for (const [field, pattern] of Object.entries(matchers) as [MechanicsBuilderField, RegExp][]) {
      const match = line.match(pattern);
      if (match) {
        next[field] = match[1].trim();
        break;
      }
    }
  }

  if (!next.effect && lines.length === 1 && !Object.values(next).some(Boolean)) {
    next.effect = lines[0];
  }

  return next;
}

function buildMechanicsHtml(builder: MechanicsBuilderState) {
  return MECHANICS_BLOCKS
    .map((block) => ({ label: block.label, value: builder[block.id].trim() }))
    .filter((section) => section.value)
    .map((section) => `<p><strong>${section.label}:</strong> ${section.value}</p>`)
    .join("");
}

function getFilledMechanicsCount(builder: MechanicsBuilderState) {
  return MECHANICS_BLOCKS.filter((block) => builder[block.id].trim()).length;
}

function safeParseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function sanitizeSectionBlock(raw: Partial<CardSectionBlock> | null | undefined, index: number): CardSectionBlock {
  const tone = raw?.tone;
  return {
    id: typeof raw?.id === "string" && raw.id.trim() ? raw.id.trim() : `section-${index}-${Date.now()}`,
    title: typeof raw?.title === "string" && raw.title.trim() ? raw.title.trim() : `Section ${index + 1}`,
    content: typeof raw?.content === "string" ? raw.content : "",
    tone: tone === "highlight" || tone === "limitation" || tone === "reminder" ? tone : "rules",
  };
}

function parseStoredMechanicsBuilder(card: ManagedCard | null): MechanicsBuilderState {
  if (!card) return EMPTY_MECHANICS_BUILDER;
  const stored = safeParseJson<Partial<MechanicsBuilderState> | null>(card.customFields?.[EDITOR_MECHANICS_KEY], null);
  if (stored && typeof stored === "object") {
    return {
      trigger: typeof stored.trigger === "string" ? stored.trigger : "",
      target: typeof stored.target === "string" ? stored.target : "",
      requirement: typeof stored.requirement === "string" ? stored.requirement : "",
      effect: typeof stored.effect === "string" ? stored.effect : "",
      duration: typeof stored.duration === "string" ? stored.duration : "",
      scaling: typeof stored.scaling === "string" ? stored.scaling : "",
      notes: typeof stored.notes === "string" ? stored.notes : "",
    };
  }
  return parseMechanicsBuilderFromEffect(card.effect || "");
}

function parseStoredSectionBlocks(card: ManagedCard | null): CardSectionBlock[] {
  if (!card) return [];
  const stored = safeParseJson<Array<Partial<CardSectionBlock>> | null>(card.customFields?.[EDITOR_SECTION_BLOCKS_KEY], null);
  if (!Array.isArray(stored)) return [];
  return stored.map((block, index) => sanitizeSectionBlock(block, index));
}

function buildCardSectionBlocksHtml(blocks: CardSectionBlock[]) {
  return blocks
    .filter((block) => block.title.trim() || block.content.trim())
    .map((block) => `<p><strong>${block.title.trim() || "Section"}:</strong> ${block.content.trim()}</p>`)
    .join("");
}

function buildCombinedRulesHtml(builder: MechanicsBuilderState, blocks: CardSectionBlock[]) {
  return `${buildMechanicsHtml(builder)}${buildCardSectionBlocksHtml(blocks)}`;
}

function toneChipStyle(tone: CardSectionTone) {
  if (tone === "highlight") return { color: "#8AB8FF", border: "1px solid #8AB8FF33", background: "#8AB8FF15" };
  if (tone === "limitation") return { color: "#FF9A7A", border: "1px solid #FF9A7A33", background: "#FF9A7A15" };
  if (tone === "reminder") return { color: "#FFD700", border: "1px solid #FFD70033", background: "#FFD70015" };
  return { color: "#7ACA8A", border: "1px solid #7ACA8A33", background: "#7ACA8A15" };
}



function editorSurfaceStyle(accent: string) {
  return {
    border: `1px solid ${accent}22`,
    boxShadow: `inset 0 0 0 1px ${accent}14`,
    background: `linear-gradient(180deg, rgba(10,16,42,0.96) 0%, rgba(12,12,46,0.96) 100%)`,
  } as React.CSSProperties;
}

function sectionBadgeStyle(accent: string) {
  return {
    color: accent,
    border: `1px solid ${accent}33`,
    background: `${accent}14`,
  } as React.CSSProperties;
}

function panelButtonStyle(active: boolean, accent: string) {
  return {
    color: active ? accent : "#8A9ABB",
    fontWeight: active ? 700 : 500,
    border: active ? `1px solid ${accent}44` : "1px solid #1A1A4B",
    background: active ? `linear-gradient(180deg, ${accent}18 0%, rgba(10,23,58,0.98) 100%)` : "linear-gradient(180deg, rgba(22,22,72,0.98) 0%, rgba(14,14,53,0.98) 100%)",
    boxShadow: active ? `inset 0 0 0 1px ${accent}16` : "inset 0 0 0 1px rgba(255,255,255,0.03)",
  } as React.CSSProperties;
}

const COMPONENT_FLAGS = ["V", "S", "M"] as const;
type ComponentFlag = (typeof COMPONENT_FLAGS)[number];

function parseComponentFlags(value: string) {
  return COMPONENT_FLAGS.filter((flag) => new RegExp(`(^|\\W)${flag}(\\W|$)`, "i").test(value));
}

function buildComponentsValue(flags: ComponentFlag[]) {
  return flags.join(", ");
}

function buildComponentsDisplay(components: string, detail?: string) {
  const base = components.trim();
  const extra = (detail || "").trim();
  if (base && extra) return `${base} (${extra})`;
  return base || extra || "";
}

function withPersistedEditorStructure(card: ManagedCard, builder: MechanicsBuilderState, blocks: CardSectionBlock[]): ManagedCard {
  return {
    ...card,
    customFields: {
      ...card.customFields,
      [EDITOR_MECHANICS_KEY]: JSON.stringify(builder),
      [EDITOR_SECTION_BLOCKS_KEY]: JSON.stringify(blocks.map((block, index) => sanitizeSectionBlock(block, index))),
    },
  };
}

function CardPreviewPanel({
  card,
  players,
  nodeTrees,
  cardTags,
}: {
  card: ManagedCard;
  players: PlayerData[];
  nodeTrees: NodeTree[];
  cardTags: TagDefinition[];
}) {
  const visibleCustomFields = getActiveCustomFields(card, cardTags).filter((cf) => {
    const value = card.customFields[cf.key];
    return typeof value === "string" && value.trim();
  });
  const family = getCardFamily(card);
  const familyDef = getCardFamilyDef(family);
  const profileBadges = getCardProfileBadges(card);

  return (
    <div className="space-y-4">
      <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[18px]" style={S_TEXT_BOLD}>{card.name || "Untitled Card"}</span>
              {card.actionCost && <span className="text-[10px] px-2 py-1" style={DM_ACTION_BADGE}>{card.actionCost}</span>}
              {card.customFields["Level"] && parseInt(card.customFields["Level"] || "0", 10) > 0 && (
                <span className="text-[10px] px-2 py-1" style={DM_LEVEL_BADGE}>Lv.{card.customFields["Level"]}</span>
              )}
              {card.customFields["Source Type"] && (
                <span className="text-[10px] px-2 py-1" style={{ color: "#9A7ABB", border: "1px solid #9A7ABB40", background: "#9A7ABB15" }}>
                  {card.customFields["Source Type"]}
                </span>
              )}
            </div>
            <div className="text-[12px]" style={S_MUTED}>
              {card.type || "No type yet"} · {formatOwners(card.assignedTo, players)}
            </div>
          </div>
          <div className="text-[10px] text-right" style={S_MUTED}>
            <div>Node Tree</div>
            <div style={S_TEXT}>{getNodeAssignmentLabel(card, nodeTrees)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {familyDef && (
            <span className="text-[9px] px-2 py-1" style={sectionBadgeStyle(familyDef.accent)}>{familyDef.label}</span>
          )}
          {profileBadges.slice(familyDef ? 1 : 0).map((badge) => (
            <span key={badge} className="text-[9px] px-2 py-1" style={sectionBadgeStyle("#6ABAFF")}>{badge}</span>
          ))}
          {card.tags.map((tag) => (
            <span key={tag} className="text-[9px] px-2 py-1" style={DM_TAG_BADGE}>{tag}</span>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] gap-4">
          <div className="space-y-3">
            {(card.customFields[CARD_DESCRIPTION_KEY] || "").trim() && (
              <div>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>DESCRIPTION</div>
                <div className={`${retro.raised} bg-[#0E0E35] p-3 text-[12px]`} style={S_TEXT}>
                  <div dangerouslySetInnerHTML={{ __html: card.customFields[CARD_DESCRIPTION_KEY] }} />
                </div>
              </div>
            )}
            <div>
              <div className="text-[10px] mb-2" style={S_SECTION_HDR}>EFFECT(S)</div>
              <div className={`${retro.raised} bg-[#0E0E35] p-3 min-h-[140px] text-[12px]`} style={S_TEXT}>
                {card.effect ? (
                  <div dangerouslySetInnerHTML={{ __html: card.effect }} />
                ) : (
                  <span style={S_MUTED}>No card effects written yet.</span>
                )}
              </div>
            </div>
            {(card.customFields[USE_PROFILE_UPCAST_KEY] || "").trim() && (
              <div className={`${retro.raised} bg-[#0E0E35] p-3`} style={editorSurfaceStyle("#FFD700")}>
                <div className="text-[10px] mb-1" style={S_SECTION_HDR}>SCALING / UPCAST</div>
                <div className="text-[11px]" style={S_TEXT}>{card.customFields[USE_PROFILE_UPCAST_KEY]}</div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-[10px] mb-2" style={S_SECTION_HDR}>AT A GLANCE</div>
              <div className={`${retro.raised} bg-[#0E0E35] p-3 space-y-2 text-[11px]`}>
                <div><span style={S_MUTED}>Name:</span> <span style={S_TEXT}>{card.name || "—"}</span></div>
                <div><span style={S_MUTED}>Family:</span> <span style={S_TEXT}>{familyDef?.label || "Not set"}</span></div>
                <div><span style={S_MUTED}>Type:</span> <span style={S_TEXT}>{card.type || "—"}</span></div>
                <div><span style={S_MUTED}>Action Cost:</span> <span style={S_TEXT}>{card.actionCost || "—"}</span></div>
                <div><span style={S_MUTED}>Level:</span> <span style={S_TEXT}>{card.customFields["Level"] || "0"}</span></div>
                {(card.customFields["Source Type"] || "").trim() && <div><span style={S_MUTED}>Source Type:</span> <span style={S_TEXT}>{card.customFields["Source Type"]}</span></div>}
                <div><span style={S_MUTED}>Primary Cost:</span> <span style={S_TEXT}>{card.customFields[USE_PROFILE_PRIMARY_COST_KEY] || "—"}</span></div>
                {(card.customFields[USE_PROFILE_USES_KEY] || "").trim() && <div><span style={S_MUTED}>Uses / Rest:</span> <span style={S_TEXT}>{card.customFields[USE_PROFILE_USES_KEY]}</span></div>}
                <div><span style={S_MUTED}>Range:</span> <span style={S_TEXT}>{card.customFields[USE_PROFILE_RANGE_KEY] || "—"}</span></div>
                <div><span style={S_MUTED}>Duration:</span> <span style={S_TEXT}>{card.customFields[USE_PROFILE_DURATION_KEY] || "—"}</span></div>
              </div>
            </div>

            <div>
              <div className="text-[10px] mb-2" style={S_SECTION_HDR}>TAG FIELDS</div>
              <div className={`${retro.raised} bg-[#0E0E35] p-3 space-y-1`}>
                {visibleCustomFields.length === 0 ? (
                  <div className="text-[11px]" style={S_MUTED}>No active tag fields with values.</div>
                ) : (
                  visibleCustomFields.map((cf) => (
                    <div key={cf.key} className="text-[11px]">
                      <span style={S_MUTED}>{cf.fieldName}:</span> <span style={S_TEXT}>{card.customFields[cf.key]}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DMCardManagerSection({
  players,
  managedCards,
  cardTags,
  nodeTrees,
  onPersistCards,
  onPersistNodeTrees,
  setDmError,
}: DMCardManagerSectionProps) {
  const [dmCardsSubTab, setDmCardsSubTab] = useState<"cards" | "levelabilities">("cards");
  const [editingCard, setEditingCard] = useState<ManagedCard | null>(null);
  const [isAddingNewCard, setIsAddingNewCard] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  const [cardTagFilter, setCardTagFilter] = useState<string>("all");
  const [cardTypeFilter, setCardTypeFilter] = useState<string>("all");
  const [editorPanel, setEditorPanel] = useState<CardEditorPanel>("preview");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<CardTemplateDef | null>(null);
  const [mechanicsBuilder, setMechanicsBuilder] = useState<MechanicsBuilderState>(EMPTY_MECHANICS_BUILDER);
  const [cardSectionBlocks, setCardSectionBlocks] = useState<CardSectionBlock[]>([]);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionTone, setNewSectionTone] = useState<CardSectionTone>("rules");
  const [tagSearch, setTagSearch] = useState("");
  const [tagFilterMode, setTagFilterMode] = useState<TagFilterMode>("all");
  const [laSelectedPlayerId, setLaSelectedPlayerId] = useState<string>("");
  const [levelCategories, setLevelCategories] = useState<LevelCategory[]>([]);
  const [laEditingLevel, setLaEditingLevel] = useState<string | null>(null);
  const [laNewLevelName, setLaNewLevelName] = useState("");
  const [laAddingLevel, setLaAddingLevel] = useState(false);
  const [laCollapsedLevels, setLaCollapsedLevels] = useState<Set<string>>(new Set());
  const [laEditingDesc, setLaEditingDesc] = useState<string | null>(null);
  const [laCopyConfirm, setLaCopyConfirm] = useState(false);
  const [showRequirementsField, setShowRequirementsField] = useState(false);

  const renderTypedField = useCallback((
    key: string,
    fieldDef: TagField,
    value: string,
    onChange: (key: string, val: string) => void,
    labelEl: React.ReactNode,
  ) => renderTypedFieldShared(key, fieldDef, value, onChange, labelEl, inputClass, inputStyle, retro.button), []);

  useEffect(() => {
    if (dmCardsSubTab === "levelabilities" && !laSelectedPlayerId && players.length > 0) {
      setLaSelectedPlayerId(players[0].id);
    }
  }, [dmCardsSubTab, laSelectedPlayerId, players]);

  useEffect(() => {
    if (!editingCard) {
      setMechanicsBuilder(EMPTY_MECHANICS_BUILDER);
      setCardSectionBlocks([]);
      setNewSectionTitle("");
      setNewSectionTone("rules");
      setShowRequirementsField(false);
      return;
    }

    setMechanicsBuilder(parseStoredMechanicsBuilder(editingCard));
    setCardSectionBlocks(parseStoredSectionBlocks(editingCard));
    setNewSectionTitle("");
    setNewSectionTone("rules");
    setShowRequirementsField(!!(editingCard.customFields[USE_PROFILE_REQUIREMENTS_KEY] || "").trim());
  }, [editingCard?.id]);

  const saveLevelCategories = useCallback(async (cats: LevelCategory[]) => {
    if (!laSelectedPlayerId) return;
    try {
      setDmError(null);
      await saveDMPlayerLevelCategories(laSelectedPlayerId, cats);
      setLevelCategories(cats);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to save level categories"));
      throw err;
    }
  }, [laSelectedPlayerId, setDmError]);

  const copyLevelCategoriesToAllPlayers = useCallback(async () => {
    if (!laSelectedPlayerId) return;
    try {
      setDmError(null);
      const currentCats = await loadDMPlayerLevelCategories(laSelectedPlayerId) as LevelCategory[];
      for (const p of players) {
        if (p.id !== laSelectedPlayerId) {
          await saveDMPlayerLevelCategories(p.id, JSON.parse(JSON.stringify(currentCats)));
        }
      }
      setLaCopyConfirm(false);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to copy level categories to all players"));
    }
  }, [laSelectedPlayerId, players, setDmError]);

  useEffect(() => {
    let cancelled = false;
    async function loadLevelCategories() {
      if (!laSelectedPlayerId) return;
      try {
        const existing = await loadDMPlayerLevelCategories(laSelectedPlayerId) as LevelCategory[];
        let cats = existing;
        if (cats.length === 0) {
          const p = players.find((pl) => pl.id === laSelectedPlayerId);
          if (p && p.level > 0) {
            cats = Array.from({ length: p.level }, (_, i) => ({
              id: `lvl-${Date.now()}-${i}`,
              name: `Level ${i + 1}`,
              order: p.level - 1 - i,
              cardIds: [],
              description: "",
            }));
            await saveDMPlayerLevelCategories(laSelectedPlayerId, cats);
          }
        }
        if (cancelled) return;
        setLevelCategories(cats);
        setLaEditingLevel(null);
        setLaAddingLevel(false);
        setLaNewLevelName("");
        setLaCollapsedLevels(new Set());
        setLaEditingDesc(null);
        setLaCopyConfirm(false);
      } catch (err) {
        if (!cancelled) {
          setDmError(getSaveError(err, "Failed to load level categories"));
        }
      }
    }
    void loadLevelCategories();
    return () => { cancelled = true; };
  }, [laSelectedPlayerId, players, setDmError]);

  const handleAddCard = () => {
    setShowTemplatePicker((prev) => {
      const next = !prev;
      if (!next) setPendingTemplate(null);
      return next;
    });
  };

  const handleSelectTemplate = (template: CardTemplateDef) => {
    setPendingTemplate(template);
  };

  const handleCreateCardFromTemplate = (template: CardTemplateDef, familyOverride?: Exclude<CardFamily, "">) => {
    const preferredFamily = familyOverride || template.defaultFamily || "";
    const nextCard = preferredFamily
      ? withCardFamilyDefaults(createCardFromTemplate({ ...template, defaultFamily: preferredFamily }, cardTags), preferredFamily)
      : createCardFromTemplate(template, cardTags);

    setEditingCard(nextCard);
    setIsAddingNewCard(true);
    setEditorPanel("core");
    setPendingTemplate(null);
    setShowTemplatePicker(false);
  };

  const handleSaveCard = async () => {
    if (!editingCard) return;
    try {
      setDmError(null);
      const cardToSave = withPersistedEditorStructure(editingCard, mechanicsBuilder, cardSectionBlocks);
      const nextCards = isAddingNewCard
        ? [...managedCards, cardToSave]
        : managedCards.map((c) => (c.id === cardToSave.id ? cardToSave : c));
      await onPersistCards(nextCards);

      let treesChanged = false;
      const nextTrees = nodeTrees.map((tree) => {
        const nextNodes = tree.nodes.map((node) => {
          const hasCard = node.cardIds.includes(cardToSave.id);
          const shouldHave = cardToSave.nodeTreeId === tree.id && cardToSave.nodeId === node.id;
          if (shouldHave && !hasCard) {
            if (node.cardIds.length >= 3) return node;
            treesChanged = true;
            return { ...node, cardIds: [...node.cardIds, cardToSave.id] };
          }
          if (!shouldHave && hasCard) {
            treesChanged = true;
            return { ...node, cardIds: node.cardIds.filter((cid) => cid !== cardToSave.id) };
          }
          return node;
        });
        return { ...tree, nodes: nextNodes };
      });

      if (treesChanged) {
        await onPersistNodeTrees(nextTrees);
      }

      setEditingCard({ ...cardToSave, customFields: { ...cardToSave.customFields } });
      setIsAddingNewCard(false);
      setShowTemplatePicker(false);
      setPendingTemplate(null);
      setEditorPanel("preview");
    } catch (err) {
      setDmError(getSaveError(err, "Failed to save card"));
    }
  };

  const handleDeleteCard = async (id: string) => {
    try {
      setDmError(null);
      const next = managedCards.filter((c) => c.id !== id);
      await onPersistCards(next);
      if (editingCard?.id === id) {
        setEditingCard(null);
        setIsAddingNewCard(false);
        setShowTemplatePicker(false);
        setPendingTemplate(null);
      }
    } catch (err) {
      setDmError(getSaveError(err, "Failed to delete card"));
    }
  };

  const handleCancelCardEdit = () => {
    setEditingCard(null);
    setIsAddingNewCard(false);
    setShowTemplatePicker(false);
    setPendingTemplate(null);
    setEditorPanel("preview");
  };

  const updateCardField = <K extends keyof ManagedCard>(key: K, value: ManagedCard[K]) => {
    if (editingCard) setEditingCard({ ...editingCard, [key]: value });
  };

  const openCardEditor = (card: ManagedCard, nextPanel: CardEditorPanel = "preview") => {
    setEditingCard({ ...card, customFields: { ...card.customFields } });
    setIsAddingNewCard(false);
    setShowTemplatePicker(false);
    setPendingTemplate(null);
    setEditorPanel(nextPanel);
  };

  const toggleCardTag = (tagName: string) => {
    if (!editingCard) return;
    const has = editingCard.tags.includes(tagName);
    const nextTags = has ? editingCard.tags.filter((t) => t !== tagName) : [...editingCard.tags, tagName];
    setEditingCard(applyStarterProfileToCard({ ...editingCard, tags: nextTags }, buildStarterProfileFromTags(nextTags, cardTags)));
  };

  const updateCardCustomField = (key: string, value: string) => {
    if (!editingCard) return;
    setEditingCard({ ...editingCard, customFields: { ...editingCard.customFields, [key]: value } });
  };

  const toggleComponentFlag = (flag: ComponentFlag) => {
    if (!editingCard) return;
    const current = parseComponentFlags(editingCard.customFields[USE_PROFILE_COMPONENTS_KEY] || "");
    const next = current.includes(flag)
      ? current.filter((entry) => entry !== flag)
      : [...current, flag];
    updateCardCustomField(USE_PROFILE_COMPONENTS_KEY, buildComponentsValue(next));
  };


  const updateMechanicsBuilderField = (field: MechanicsBuilderField, value: string) => {
    setMechanicsBuilder((prev) => ({ ...prev, [field]: value }));
  };

  const applyMechanicsBuilder = (mode: "replace" | "append") => {
    if (!editingCard) return;
    const builtHtml = buildMechanicsHtml(mechanicsBuilder);
    if (!builtHtml) return;

    const nextEffect = mode === "replace"
      ? builtHtml
      : `${editingCard.effect || ""}${builtHtml}`;

    updateCardField("effect", nextEffect as ManagedCard["effect"]);
  };

  const addMechanicsStarter = (block: MechanicsBlockDef) => {
    setMechanicsBuilder((prev) => ({
      ...prev,
      [block.id]: prev[block.id].trim() ? prev[block.id] : block.starter,
    }));
  };

  const clearMechanicsBuilder = () => {
    setMechanicsBuilder(EMPTY_MECHANICS_BUILDER);
  };

  const addPresetSectionBlock = (preset: { title: string; tone: CardSectionTone; content: string }) => {
    setCardSectionBlocks((prev) => [
      ...prev,
      {
        id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: preset.title,
        tone: preset.tone,
        content: preset.content,
      },
    ]);
  };

  const addCustomSectionBlock = () => {
    const title = newSectionTitle.trim() || `Custom Section ${cardSectionBlocks.length + 1}`;
    setCardSectionBlocks((prev) => [
      ...prev,
      {
        id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        tone: newSectionTone,
        content: "",
      },
    ]);
    setNewSectionTitle("");
    setNewSectionTone("rules");
  };

  const updateSectionBlock = (id: string, patch: Partial<CardSectionBlock>) => {
    setCardSectionBlocks((prev) => prev.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  };

  const removeSectionBlock = (id: string) => {
    setCardSectionBlocks((prev) => prev.filter((block) => block.id !== id));
  };

  const moveSectionBlock = (id: string, direction: -1 | 1) => {
    setCardSectionBlocks((prev) => {
      const index = prev.findIndex((block) => block.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const clearSectionBlocks = () => {
    setCardSectionBlocks([]);
  };

  const applySectionBlocks = (mode: "replace" | "append") => {
    if (!editingCard) return;
    const builtHtml = buildCardSectionBlocksHtml(cardSectionBlocks);
    if (!builtHtml) return;
    const nextEffect = mode === "replace" ? builtHtml : `${editingCard.effect || ""}${builtHtml}`;
    updateCardField("effect", nextEffect as ManagedCard["effect"]);
  };

  const applyCombinedStructuredOutput = (mode: "replace" | "append") => {
    if (!editingCard) return;
    const builtHtml = buildCombinedRulesHtml(mechanicsBuilder, cardSectionBlocks);
    if (!builtHtml) return;
    const nextEffect = mode === "replace" ? builtHtml : `${editingCard.effect || ""}${builtHtml}`;
    updateCardField("effect", nextEffect as ManagedCard["effect"]);
  };

  const renderCardTagFieldInput = (cf: { tagName: string; fieldName: string; key: string; fieldDef: TagField }) => {
    if (!editingCard) return null;

    const cfLabel = (
      <label className="text-[10px] block mb-1" style={S_ACCENT}>
        <span style={S_MUTED}>{cf.tagName} ›</span> {cf.fieldName}:
      </label>
    );

    if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Type") {
      return (
        <div key={cf.key}>
          {cfLabel}
          <select value={editingCard.customFields[cf.key] || ""} onChange={(e) => {
            updateCardCustomField(cf.key, e.target.value);
            updateCardCustomField(cfKey("Timed Effect", "Buff Target"), "");
          }} className={inputClass} style={inputStyle}>
            <option value="">- None -</option>
            <option value="attribute">Attribute</option>
            <option value="skill">Skill</option>
            <option value="resource">Resource</option>
          </select>
        </div>
      );
    }

    if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Target") {
      const buffTypeVal = editingCard.customFields[cfKey("Timed Effect", "Buff Type")] || "";
      const ATTRS_TE = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL"];
      const ALL_SKILLS_TE = ["Athletics", "Grappling", "Acrobatics", "Sleight of Hand", "Stealth", "Endurance", "Shock", "History", "Investigation", "Arcana", "Religion", "Medicine", "Nature", "Technology/Tinkering", "Perception", "Insight", "Survival", "Persuasion", "Charm", "Control", "Clear Mind"];
      const ALL_RESOURCES_TE = ["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
      const options = buffTypeVal === "attribute" ? ATTRS_TE : buffTypeVal === "skill" ? ALL_SKILLS_TE : buffTypeVal === "resource" ? ALL_RESOURCES_TE : [];
      const currentVal = editingCard.customFields[cf.key] || "";
      const isValid = !currentVal || options.includes(currentVal);
      if (!buffTypeVal) {
        return (
          <div key={cf.key}>
            {cfLabel}
            <input type="text" disabled placeholder="Select a Buff Type first..." className={inputClass} style={{ ...inputStyle, opacity: 0.4 }} />
          </div>
        );
      }
      return (
        <div key={cf.key}>
          {cfLabel}
          <select value={isValid ? currentVal : "__invalid__"} onChange={(e) => updateCardCustomField(cf.key, e.target.value === "__invalid__" ? "" : e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">- Select {buffTypeVal === "attribute" ? "Attribute" : buffTypeVal === "skill" ? "Skill" : "Resource"} -</option>
            {!isValid && <option value="__invalid__" disabled style={S_RED}>⚠ "{currentVal}" (not recognized)</option>}
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {!isValid && (
            <div className="text-[9px] mt-1 flex items-center gap-1" style={S_RED}>
              ⚠ "{currentVal}" won't apply - pick a valid {buffTypeVal} from the list
            </div>
          )}
        </div>
      );
    }

    if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Value") {
      const buffTypeVal = editingCard.customFields[cfKey("Timed Effect", "Buff Type")] || "";
      return (
        <div key={cf.key}>
          {cfLabel}
          <input type="text" value={editingCard.customFields[cf.key] || ""} onChange={(e) => updateCardCustomField(cf.key, e.target.value)} placeholder={buffTypeVal ? "e.g. +2, P, -1" : "Select Buff Type first..."} disabled={!buffTypeVal} className={inputClass} style={{ ...inputStyle, ...(!buffTypeVal ? { opacity: 0.4 } : {}) }} title="Buff value - use P for Potency substitution" />
        </div>
      );
    }

    if (cf.tagName === "Buff" && cf.fieldName === "Stat") {
      const ALL_BUFF_STATS = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL", "Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
      const currentVal = editingCard.customFields[cf.key] || "";
      const isValid = !currentVal || ALL_BUFF_STATS.includes(currentVal);
      return (
        <div key={cf.key}>
          {cfLabel}
          <select value={isValid ? currentVal : "__invalid__"} onChange={(e) => updateCardCustomField(cf.key, e.target.value === "__invalid__" ? "" : e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">- Select Stat -</option>
            {!isValid && <option value="__invalid__" disabled style={S_RED}>⚠ "{currentVal}" (not recognized)</option>}
            <optgroup label="Attributes">
              {["STR", "AGI", "CON", "KNOW", "WIS", "WILL"].map((a) => <option key={a} value={a}>{a}</option>)}
            </optgroup>
            <optgroup label="Resources">
              {["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"].map((r) => <option key={r} value={r}>{r}</option>)}
            </optgroup>
          </select>
          {!isValid && (
            <div className="text-[9px] mt-1 flex items-center gap-1" style={S_RED}>
              ⚠ "{currentVal}" won't be recognized - pick from the list
            </div>
          )}
        </div>
      );
    }

    return renderTypedField(
      cf.key,
      cf.fieldDef,
      editingCard.customFields[cf.key] || cf.fieldDef.defaultValue || "",
      updateCardCustomField,
      cfLabel,
    );
  };

  const activeCardCustomFields = useMemo(
    () => (editingCard ? getActiveCustomFields(editingCard, cardTags) : []),
    [editingCard, cardTags],
  );

  const activeFieldsByTag = useMemo(() => {
    const groups: Array<{ tagName: string; fields: { tagName: string; fieldName: string; key: string; fieldDef: TagField }[] }> = [];
    const map = new Map<string, { tagName: string; fields: { tagName: string; fieldName: string; key: string; fieldDef: TagField }[] }>();
    activeCardCustomFields.forEach((field) => {
      if (!map.has(field.tagName)) {
        const entry = { tagName: field.tagName, fields: [] as { tagName: string; fieldName: string; key: string; fieldDef: TagField }[] };
        map.set(field.tagName, entry);
        groups.push(entry);
      }
      map.get(field.tagName)!.fields.push(field);
    });
    return groups;
  }, [activeCardCustomFields]);

  const selectedTagDefs = useMemo(
    () => (editingCard ? cardTags.filter((tag) => editingCard.tags.includes(tag.name)) : []),
    [cardTags, editingCard],
  );

  const suggestedTagDefs = useMemo(
    () => (editingCard ? getSuggestedTagDefs(editingCard, cardTags, mechanicsBuilder).filter((tag) => !editingCard.tags.includes(tag.name)) : []),
    [editingCard, cardTags, mechanicsBuilder],
  );

  const activeTagStarterProfile = useMemo(
    () => (editingCard ? buildStarterProfileFromTags(editingCard.tags, cardTags) : null),
    [editingCard, cardTags],
  );

  const playerFacingTagBadges = useMemo(
    () => (editingCard ? buildVisibleCardTagBadges(editingCard, cardTags, { includeDmOnly: true }) : []),
    [editingCard, cardTags],
  );

  const visibleTagDefs = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    return cardTags.filter((tag) => {
      const active = !!editingCard?.tags.includes(tag.name);
      const matchesQuery = !query || tag.name.toLowerCase().includes(query) || (tag.description || "").toLowerCase().includes(query);
      const matchesMode = tagFilterMode === "all"
        || (tagFilterMode === "active" && active)
        || (tagFilterMode === "withFields" && tag.fields.length > 0)
        || (tagFilterMode === "simple" && tag.fields.length === 0);
      return matchesQuery && matchesMode;
    });
  }, [cardTags, editingCard, tagSearch, tagFilterMode]);

  const allCardTypes = useMemo(
    () => Array.from(new Set(managedCards.map((card) => card.type.trim()).filter(Boolean))).sort(),
    [managedCards],
  );

  const allCardTagNames = useMemo(
    () => Array.from(new Set(managedCards.flatMap((card) => card.tags))).sort(),
    [managedCards],
  );

  const filteredCards = useMemo(() => {
    const query = cardSearch.trim().toLowerCase();
    return managedCards.filter((card) => {
      const matchesQuery = !query || [
        card.name,
        card.type,
        card.actionCost,
        card.customFields["Source Type"] || "",
        getCardSummary(card),
      ].some((value) => value.toLowerCase().includes(query));
      const matchesTag = cardTagFilter === "all" || card.tags.includes(cardTagFilter);
      const matchesType = cardTypeFilter === "all" || card.type === cardTypeFilter;
      return matchesQuery && matchesTag && matchesType;
    });
  }, [managedCards, cardSearch, cardTagFilter, cardTypeFilter]);

  const selectedNodeTree = useMemo(
    () => editingCard?.nodeTreeId ? nodeTrees.find((tree) => tree.id === editingCard.nodeTreeId) || null : null,
    [editingCard?.nodeTreeId, nodeTrees],
  );

  const selectedNode = useMemo(
    () => selectedNodeTree?.nodes.find((node) => node.id === editingCard?.nodeId) || null,
    [selectedNodeTree, editingCard?.nodeId],
  );

  const currentFamily = useMemo(() => getCardFamily(editingCard), [editingCard]);
  const currentFamilyDef = useMemo(() => getCardFamilyDef(currentFamily), [currentFamily]);
  const currentProfileBadges = useMemo(() => (editingCard ? getCardProfileBadges(editingCard) : []), [editingCard]);
  const currentTrackerBucket = useMemo(() => getCardTrackerBucket(editingCard), [editingCard]);

  const applyCardFamily = (family: CardFamily) => {
    if (!editingCard) return;
    setEditingCard(withCardFamilyDefaults(editingCard, family));
  };

  const editorPanels: { id: CardEditorPanel; label: string; icon: React.ComponentType<{ size?: number }>; accent: string }[] = [
    { id: "preview", label: "Preview", icon: Eye, accent: "#8AB8FF" },
    { id: "core", label: "Core", icon: Settings, accent: "#4A7BFF" },
    { id: "mechanics", label: "Mechanics", icon: FileText, accent: "#6ABAFF" },
    { id: "tags", label: "Tags", icon: Tags, accent: "#9A7ABB" },
    { id: "progression", label: "Progression", icon: GitBranch, accent: "#FFD700" },
    { id: "assignment", label: "Assignment", icon: Users, accent: "#7ACA8A" },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage Cards</h2>

      <div className="flex gap-2 mb-2">
        {([
          { id: "cards" as const, label: "Player Cards", icon: CreditCard, accent: "#4A7BFF" },
          { id: "levelabilities" as const, label: "Level Abilities", icon: Zap, accent: "#FFD700" },
        ]).map((sub) => (
          <button
            key={sub.id}
            onClick={() => setDmCardsSubTab(sub.id)}
            className={`${dmCardsSubTab === sub.id ? retro.sunken + " bg-[#0C0C2E]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-4 py-2 text-[12px] flex items-center gap-1.5 transition-colors`}
            style={{ color: dmCardsSubTab === sub.id ? sub.accent : "#8A9ABB", fontWeight: dmCardsSubTab === sub.id ? 600 : 400 }}
          >
            <sub.icon size={14} /> {sub.label}
          </button>
        ))}
      </div>

      {dmCardsSubTab === "cards" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[12px]" style={S_SECTION_HDR}>CARD WORKSPACE</div>
              <div className="text-[10px] mt-1" style={S_SUBTLE}>
                Edit cards in focused panels similar to the wiki editor. The card data model stays the same for now.
              </div>
            </div>
            <button onClick={handleAddCard} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
              <Plus size={14} /> {showTemplatePicker ? "Hide Templates" : "New Card"}
            </button>
          </div>

          {showTemplatePicker && (
            <div className={`${retro.sunken} bg-[#0C0C2E] p-4 space-y-3`}>
              <div>
                <div className="text-[12px]" style={S_SECTION_HDR}>CARD TEMPLATES</div>
                <div className="text-[10px] mt-1" style={S_SUBTLE}>
                  Step 1: pick a template. Step 2: pick whether the new card is a Spell, Skill, or Ability.
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {CARD_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className={`${retro.raised} bg-[#0E0E35] p-3 text-left hover:bg-[#121244] transition-colors`}
                    style={{ border: "1px solid #1A1A4B" }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[12px]" style={S_TEXT_BOLD}>{template.label}</span>
                      {template.level && <span className="text-[8px] px-1.5 py-0.5" style={DM_LEVEL_BADGE}>Lv.{template.level}</span>}
                    </div>
                    <div className="text-[10px] mb-2" style={S_MUTED}>
                      {template.type || "Flexible"}{template.actionCost ? ` · ${template.actionCost}` : ""}
                    </div>
                    <div className="text-[10px]" style={S_SUBTLE}>{template.description}</div>
                    {template.familyHints && template.familyHints.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {template.familyHints.map((family) => {
                          const familyDef = getCardFamilyDef(family);
                          return familyDef ? (
                            <span key={family} className="text-[8px] px-1.5 py-0.5" style={sectionBadgeStyle(familyDef.accent)}>{familyDef.label}</span>
                          ) : null;
                        })}
                      </div>
                    )}
                    {template.suggestedTags && template.suggestedTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {template.suggestedTags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[8px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {pendingTemplate && (
                <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#4A7BFF")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[12px]" style={S_SECTION_HDR}>STEP 2: CHOOSE CARD CORE</div>
                      <div className="text-[11px]" style={S_SUBTLE}>
                        Template selected: <span style={S_TEXT_BOLD}>{pendingTemplate.label}</span>. Pick whether this new card is a Spell, Skill, or Ability.
                      </div>
                    </div>
                    <button onClick={() => setPendingTemplate(null)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_TEXT}>
                      Clear Selection
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {CARD_FAMILY_OPTIONS.map((family) => (
                      <button
                        key={family.id}
                        onClick={() => handleCreateCardFromTemplate(pendingTemplate, family.id)}
                        className={`${retro.raised} p-3 text-left transition-colors hover:bg-[#121244]`}
                        style={editorSurfaceStyle(family.accent)}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[12px]" style={S_TEXT_BOLD}>{family.label}</span>
                          <span className="text-[8px] px-1.5 py-0.5" style={sectionBadgeStyle(family.accent)}>Core</span>
                        </div>
                        <div className="text-[10px]" style={S_SUBTLE}>{family.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
            <div className={`${retro.sunken} bg-[#0C0C2E] p-4 space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px]" style={S_SECTION_HDR}>CARD LIBRARY</div>
                <span className="text-[10px] px-2 py-1" style={{ color: "#7A8AAA", border: "1px solid #1A1A4B", background: "#0A0A28" }}>
                  {filteredCards.length}/{managedCards.length}
                </span>
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={S_MUTED} />
                  <input
                    type="text"
                    value={cardSearch}
                    onChange={(e) => setCardSearch(e.target.value)}
                    placeholder="Search cards..."
                    className={`${inputClass} pl-9`}
                    style={inputStyle}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={cardTypeFilter} onChange={(e) => setCardTypeFilter(e.target.value)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                    <option value="all">All Types</option>
                    {allCardTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <select value={cardTagFilter} onChange={(e) => setCardTagFilter(e.target.value)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                    <option value="all">All Tags</option>
                    {allCardTagNames.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2 max-h-[72vh] overflow-y-auto pr-1">
                {filteredCards.length === 0 ? (
                  <div className="text-[11px] text-center py-6" style={S_MUTED}>No matching cards.</div>
                ) : (
                  filteredCards.map((card) => {
                    const isSelected = editingCard?.id === card.id;
                    return (
                      <div key={card.id} className={`${retro.raised} p-3 transition-colors`} style={{ background: isSelected ? "#111B40" : "#0E0E35", border: isSelected ? "1px solid #2A4A8A" : "1px solid #1A1A4B" }}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="text-[12px] truncate" style={S_TEXT_BOLD}>{card.name || "Untitled Card"}</span>
                              {card.actionCost && <span className="text-[8px] px-1.5 py-0.5" style={DM_ACTION_BADGE}>{card.actionCost}</span>}
                              {card.customFields["Level"] && parseInt(card.customFields["Level"] || "0", 10) > 0 && (
                                <span className="text-[8px] px-1.5 py-0.5" style={DM_LEVEL_BADGE}>Lv.{card.customFields["Level"]}</span>
                              )}
                            </div>
                            <div className="text-[10px] mb-1" style={S_MUTED}>{card.type || "No type"}</div>
                            <div className="text-[10px] line-clamp-3" style={S_SUBTLE}>{getCardSummary(card)}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => openCardEditor(card, "preview")} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}><Eye size={10} /></button>
                            <button onClick={() => openCardEditor(card, "core")} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}><Edit size={10} /></button>
                            <button onClick={() => handleDeleteCard(card.id)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_RED}><Trash2 size={10} /></button>
                          </div>
                        </div>
                        {card.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {card.tags.slice(0, 4).map((tag) => (
                              <span key={tag} className="text-[8px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{tag}</span>
                            ))}
                            {card.tags.length > 4 && <span className="text-[8px]" style={S_MUTED}>+{card.tags.length - 4}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-4">
              {!editingCard ? (
                <div className={`${retro.sunken} bg-[#0C0C2E] p-6`}>
                  <div className="flex items-center gap-3 mb-4">
                    <Sparkles size={18} style={S_ACCENT} />
                    <div className="text-[13px]" style={S_TEXT_BOLD}>Card Editor Workspace</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                    {CARD_FAMILY_OPTIONS.map((family) => (
                      <div key={family.id} className={`${retro.raised} p-3`} style={editorSurfaceStyle(family.accent)}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="text-[11px]" style={S_TEXT_BOLD}>{family.label}</div>
                          <span className="text-[9px] px-2 py-0.5" style={sectionBadgeStyle(family.accent)}>{family.label}</span>
                        </div>
                        <div className="text-[10px]" style={S_SUBTLE}>{family.description}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={handleAddCard} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                      <Plus size={14} /> Open Template Picker
                    </button>                  </div>
                </div>
              ) : (
                <>
                  <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="text-[10px] mb-1" style={S_SECTION_HDR}>{isAddingNewCard ? "NEW CARD" : "CARD WORKSPACE"}</div>
                        <div className="text-[16px]" style={S_TEXT_BOLD}>{editingCard.name || "Untitled Card"}</div>
                        <div className="text-[11px] mt-1" style={S_MUTED}>
                          {editingCard.type || "No type"} · {formatOwners(editingCard.assignedTo, players)}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {currentProfileBadges.map((badge, index) => (
                            <span key={`${badge}-${index}`} className="text-[10px] px-2 py-1" style={sectionBadgeStyle(index === 0 && currentFamilyDef ? currentFamilyDef.accent : "#6ABAFF")}>{badge}</span>
                          ))}
                          {hasBuiltInCardTracker(editingCard) && (
                            <span className="text-[10px] px-2 py-1" style={sectionBadgeStyle(trackerBucketAccent(currentTrackerBucket))}>{trackerBucketLabel(currentTrackerBucket)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={handleSaveCard} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                          <Save size={14} /> {isAddingNewCard ? "Add Card" : "Save Changes"}
                        </button>
                        <button onClick={handleCancelCardEdit} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_TEXT}>
                          <X size={14} /> Close
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {editorPanels.map((panel) => {
                        const Icon = panel.icon;
                        const active = editorPanel === panel.id;
                        return (
                          <button
                            key={panel.id}
                            onClick={() => setEditorPanel(panel.id)}
                            className={`${active ? retro.sunken + " bg-[#0A173A]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-2 text-[11px] flex items-center gap-1.5 transition-colors`}
                            style={{ color: active ? panel.accent : "#8A9ABB", fontWeight: active ? 600 : 400 }}
                          >
                            <Icon size={12} /> {panel.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {editorPanel === "preview" && (
                    <CardPreviewPanel card={editingCard} players={players} nodeTrees={nodeTrees} cardTags={cardTags} />
                  )}

                  {editorPanel === "core" && (
                    <div className={`${retro.sunken} p-5 space-y-5`} style={editorSurfaceStyle(currentFamilyDef?.accent || "#4A7BFF")}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[12px]" style={S_SECTION_HDR}>IDENTITY + USE PROFILE</div>
                          <div className="text-[10px] mt-1" style={S_SUBTLE}>
                            Start by deciding whether this card is a spell, skill, or ability. The rest of the profile becomes much easier to fill out from there.
                          </div>
                        </div>
                        {currentFamilyDef && (
                          <span className="text-[10px] px-2.5 py-1.5" style={sectionBadgeStyle(currentFamilyDef.accent)}>{currentFamilyDef.label}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] gap-4">
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Card Name:</label>
                              <input type="text" value={editingCard.name} onChange={(e) => updateCardField("name", e.target.value)} placeholder="Enter card name..." className={inputClass} style={inputStyle} />
                            </div>
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Card Type:</label>
                              <input type="text" value={editingCard.type} onChange={(e) => updateCardField("type", e.target.value)} placeholder="e.g., Combat, Utility..." className={inputClass} style={inputStyle} />
                            </div>
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Action Cost:</label>
                              <input type="text" value={editingCard.actionCost} onChange={(e) => updateCardField("actionCost", e.target.value)} placeholder="e.g., 1 Action, Reaction, Passive..." className={inputClass} style={inputStyle} />
                            </div>
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Level:</label>
                              <input type="number" min="0" value={editingCard.customFields["Level"] || ""} onChange={(e) => updateCardCustomField("Level", e.target.value)} placeholder="0" className={inputClass} style={inputStyle} />
                            </div>
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Source / Discipline Type:</label>
                              <input type="text" value={editingCard.customFields["Source Type"] || ""} onChange={(e) => updateCardCustomField("Source Type", e.target.value)} placeholder="e.g., Light, Martial, Fairy Blood..." className={inputClass} style={inputStyle} />
                            </div>
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Magic Nature:</label>
                              <input type="text" value={editingCard.customFields[USE_PROFILE_MAGIC_NATURE_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_MAGIC_NATURE_KEY, e.target.value)} placeholder="e.g., Magical (Spell), Non-spell Technique..." className={inputClass} style={inputStyle} />
                            </div>
                          </div>

                          <div className={`${retro.raised} p-4 space-y-3`} style={editorSurfaceStyle(currentFamilyDef?.accent || "#273357")}>
                            <div>
                              <div className="text-[10px] mb-2" style={S_SECTION_HDR}>CARD FAMILY</div>
                              <div className="flex flex-wrap gap-2">
                                {CARD_FAMILY_OPTIONS.map((family) => {
                                  const active = currentFamily === family.id;
                                  return (
                                    <button
                                      key={family.id}
                                      onClick={() => applyCardFamily(family.id)}
                                      className={`${active ? retro.sunken : retro.raised} px-3 py-2 text-[11px] flex items-center gap-1.5 transition-colors`}
                                      style={panelButtonStyle(active, family.accent)}
                                    >
                                      {family.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {CARD_FAMILY_OPTIONS.map((family) => (
                                <div key={family.id} className={`${retro.raised} p-3`} style={editorSurfaceStyle(family.accent)}>
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <div className="text-[11px]" style={S_TEXT_BOLD}>{family.label}</div>
                                    <span className="text-[9px] px-2 py-0.5" style={sectionBadgeStyle(family.accent)}>{family.label}</span>
                                  </div>
                                  <div className="text-[10px]" style={S_SUBTLE}>{family.description}</div>
                                  <div className="text-[10px] mt-2" style={S_MUTED}>{family.helper}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className={`${retro.raised} p-4 space-y-3`} style={editorSurfaceStyle(currentFamilyDef?.accent || "#273357")}>
                          <div className="text-[10px]" style={S_SECTION_HDR}>CURRENT RULE PROFILE</div>
                          <div className="flex flex-wrap gap-2">
                            {currentProfileBadges.length > 0 ? currentProfileBadges.map((badge, index) => (
                              <span key={`${badge}-${index}`} className="text-[9px] px-2 py-1" style={sectionBadgeStyle(index === 0 && currentFamilyDef ? currentFamilyDef.accent : "#6ABAFF")}>{badge}</span>
                            )) : <span className="text-[10px]" style={S_MUTED}>No family summary yet. Pick a card family to shape the creator around the card's real rules.</span>}
                          </div>
                          {currentFamilyDef ? (
                            <div className="text-[11px]" style={S_TEXT}>{currentFamilyDef.description}</div>
                          ) : (
                            <div className="text-[11px]" style={S_SUBTLE}>Choose Spell, Skill, or Ability first. That makes the rest of the card builder more intuitive.</div>
                          )}
                          <div className="space-y-2 text-[11px]">
                            <div><span style={S_MUTED}>Cost Model:</span> <span style={S_TEXT}>{editingCard.customFields[USE_PROFILE_COST_MODEL_KEY] || "—"}</span></div>
                            <div><span style={S_MUTED}>Primary Cost:</span> <span style={S_TEXT}>{editingCard.customFields[USE_PROFILE_PRIMARY_COST_KEY] || "—"}</span></div>
                            <div><span style={S_MUTED}>Uses / Long Rest:</span> <span style={S_TEXT}>{editingCard.customFields[USE_PROFILE_USES_KEY] || "—"}</span></div>
                            <div><span style={S_MUTED}>Origin:</span> <span style={S_TEXT}>{editingCard.customFields[USE_PROFILE_ORIGIN_KEY] || "—"}</span></div>
                          </div>
                        </div>
                      </div>

                      <div className={`${retro.raised} p-4 space-y-3`} style={editorSurfaceStyle("#6ABAFF")}>
                        <div className="text-[10px]" style={S_SECTION_HDR}>USE PROFILE</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Cost Model:</label>
                            <input type="text" value={editingCard.customFields[USE_PROFILE_COST_MODEL_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_COST_MODEL_KEY, e.target.value)} placeholder="e.g., Source, Exhaustion / Uses, Uses / Exhaustion..." className={inputClass} style={inputStyle} />
                          </div>
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Primary Cost:</label>
                            <input type="text" value={editingCard.customFields[USE_PROFILE_PRIMARY_COST_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_PRIMARY_COST_KEY, e.target.value)} placeholder="e.g., 3 Fire Source, 1 Exhaustion, PB / Long Rest..." className={inputClass} style={inputStyle} />
                          </div>
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Uses Per Long Rest:</label>
                            <input type="text" value={editingCard.customFields[USE_PROFILE_USES_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_USES_KEY, e.target.value)} placeholder="e.g., PB / Long Rest, 2 / Long Rest..." className={inputClass} style={inputStyle} />
                          </div>
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Range:</label>
                            <input type="text" value={editingCard.customFields[USE_PROFILE_RANGE_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_RANGE_KEY, e.target.value)} placeholder="e.g., Self, 30 feet, 15-foot radius..." className={inputClass} style={inputStyle} />
                          </div>
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Duration:</label>
                            <input type="text" value={editingCard.customFields[USE_PROFILE_DURATION_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_DURATION_KEY, e.target.value)} placeholder="e.g., Instant, Concentration 1 minute..." className={inputClass} style={inputStyle} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[10px] block mb-2" style={labelStyle}>Components:</label>
                            <div className="flex flex-wrap items-center gap-2">
                              {COMPONENT_FLAGS.map((flag) => {
                                const active = parseComponentFlags(editingCard.customFields[USE_PROFILE_COMPONENTS_KEY] || "").includes(flag);
                                return (
                                  <button
                                    key={flag}
                                    type="button"
                                    onClick={() => toggleComponentFlag(flag)}
                                    className={`${active ? retro.sunken : retro.raised} px-3 py-2 text-[11px]`}
                                    style={panelButtonStyle(active, "#8AB8FF")}
                                  >
                                    {flag}
                                  </button>
                                );
                              })}
                              <input
                                type="text"
                                value={editingCard.customFields[USE_PROFILE_COMPONENT_DETAILS_KEY] || ""}
                                onChange={(e) => updateCardCustomField(USE_PROFILE_COMPONENT_DETAILS_KEY, e.target.value)}
                                placeholder="Material details or notes..."
                                className={`${inputClass} min-w-[220px] flex-1`}
                                style={inputStyle}
                              />
                            </div>
                          </div>
                          {showRequirementsField ? (
                            <div className="md:col-span-2 xl:col-span-3">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <label className="text-[10px] block" style={labelStyle}>Requirements:</label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateCardCustomField(USE_PROFILE_REQUIREMENTS_KEY, "");
                                    setShowRequirementsField(false);
                                  }}
                                  className={`${retro.button} px-2 py-1 text-[10px]`}
                                  style={S_RED}
                                >
                                  Remove
                                </button>
                              </div>
                              <input type="text" value={editingCard.customFields[USE_PROFILE_REQUIREMENTS_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_REQUIREMENTS_KEY, e.target.value)} placeholder="e.g., Wielding a melee weapon, dealt damage..." className={inputClass} style={inputStyle} />
                            </div>
                          ) : (
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Requirements:</label>
                              <button type="button" onClick={() => setShowRequirementsField(true)} className={`${retro.button} px-3 py-2 text-[11px]`} style={S_TEXT}>
                                Add Requirements
                              </button>
                            </div>
                          )}
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Origin / Source:</label>
                            <input type="text" value={editingCard.customFields[USE_PROFILE_ORIGIN_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_ORIGIN_KEY, e.target.value)} placeholder="e.g., Learned / Taught, Fairy Blood, Granted by entity..." className={inputClass} style={inputStyle} />
                          </div>
                          <div className="md:col-span-2 xl:col-span-3">
                            <label className="text-[10px] block mb-1" style={labelStyle}>Passive / Trigger Notes:</label>
                            <input type="text" value={editingCard.customFields[USE_PROFILE_PASSIVE_MODE_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_PASSIVE_MODE_KEY, e.target.value)} placeholder="e.g., Activatable Passive, Triggered on damage, Passive while equipped..." className={inputClass} style={inputStyle} />
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px]" style={S_SUBTLE}>
                        Keep this panel focused on what the card is and how it is paid for or activated. Let Mechanics handle the actual resolution text.
                      </div>
                    </div>
                  )}

                  {editorPanel === "mechanics" && (
                    <div className={`${retro.sunken} bg-[#0C0C2E] p-5 space-y-4`}>
                      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] gap-4">
                        <div className="space-y-4">
                          <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#6ABAFF")}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-[12px] mb-1" style={S_SECTION_HDR}>MECHANICS WORKSPACE</div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span className="text-[10px] px-2.5 py-1.5" style={sectionBadgeStyle("#6ABAFF")}>{getFilledMechanicsCount(mechanicsBuilder)} mechanics step{getFilledMechanicsCount(mechanicsBuilder) === 1 ? "" : "s"}</span>
                                <span className="text-[10px] px-2.5 py-1.5" style={sectionBadgeStyle("#FFD700")}>{cardSectionBlocks.length} section block{cardSectionBlocks.length === 1 ? "" : "s"}</span>
                              </div>
                            </div>
                          </div>

                          <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-4`} style={editorSurfaceStyle("#6ABAFF")}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-[12px] mb-1" style={S_SECTION_HDR}>STRUCTURED MECHANICS BUILDER</div>
                                <div className="text-[10px]" style={S_SUBTLE}>Start with the card's actual play sequence. Each block becomes part of the generated rules text.</div>
                              </div>
                              <button onClick={clearMechanicsBuilder} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}>
                                Clear Builder
                              </button>
                            </div>

                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                              {MECHANICS_BLOCKS.map((block) => (
                                <button
                                  key={block.id}
                                  onClick={() => addMechanicsStarter(block)}
                                  className={`${retro.button} w-full justify-center px-3 py-2 text-[10px] flex items-center gap-1.5`}
                                  style={sectionBadgeStyle("#6ABAFF")}
                                >
                                  <Plus size={10} /> Seed {block.label}
                                </button>
                              ))}
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                              {MECHANICS_BLOCKS.map((block, index) => {
                                const filled = !!mechanicsBuilder[block.id].trim();
                                const accent = ["#8AB8FF", "#7ACA8A", "#FFD700", "#C4A0FF", "#FF9A7A", "#6ABAFF", "#7A8AAA"][index % 7];
                                return (
                                  <div key={block.id} className={`${retro.sunken} bg-[#0A0A28] p-3 space-y-2`} style={editorSurfaceStyle(accent)}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-[9px] px-2 py-0.5" style={sectionBadgeStyle(accent)}>Step {index + 1}</span>
                                          <span className="text-[12px]" style={S_TEXT_BOLD}>{block.label}</span>
                                        </div>
                                        <div className="text-[10px]" style={S_SUBTLE}>{block.placeholder}</div>
                                      </div>
                                      {!filled && (
                                        <button onClick={() => addMechanicsStarter(block)} className={`${retro.button} shrink-0 px-2.5 py-1.5 text-[10px] flex items-center gap-1`} style={sectionBadgeStyle(accent)}>
                                          <Sparkles size={10} /> Seed
                                        </button>
                                      )}
                                    </div>
                                    <textarea
                                      value={mechanicsBuilder[block.id]}
                                      onChange={(e) => updateMechanicsBuilderField(block.id, e.target.value)}
                                      placeholder={block.placeholder}
                                      className={`${inputClass} min-h-[102px] resize-y`}
                                      style={inputStyle}
                                    />
                                    <div className="text-[10px] flex items-center justify-between gap-2" style={S_MUTED}>
                                      <span>{filled ? "Included in generated output" : "Empty"}</span>
                                      <span>{mechanicsBuilder[block.id].trim().length} chars</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className={`${retro.sunken} bg-[#0A0A28] p-3 flex flex-wrap items-center gap-2`}>
                              <button onClick={() => applyMechanicsBuilder("replace")} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1.5`} style={S_GREEN_BTN}>
                                <Save size={12} /> Replace Effect(s)
                              </button>
                              <button onClick={() => applyMechanicsBuilder("append")} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1.5`} style={S_ACCENT}>
                                <Plus size={12} /> Append to Effect(s)
                              </button>
                              <span className="text-[10px] ml-auto" style={S_SUBTLE}>
                                Use replace for a clean rebuild. Use append when the current rules text already has material you want to keep.
                              </span>
                            </div>
                          </div>

                          <div>
                            <div className="text-[12px] mb-2" style={S_SECTION_HDR}>APPLIED EFFECT TRACKER</div>
                            <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#4ACA6A")}>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="text-[10px]" style={S_SUBTLE}>
                                    When this card is used, it can automatically create a row in Personal Files using the built-in tracker instead of tag-based timed effects.
                                  </div>
                                </div>
                                <span className="text-[10px] px-2.5 py-1.5" style={sectionBadgeStyle(trackerBucketAccent(getCardTrackerBucket(editingCard)))}>
                                  {hasBuiltInCardTracker(editingCard) ? trackerBucketLabel(getCardTrackerBucket(editingCard)) : "Not tracked"}
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateCardCustomField(CARD_TRACKER_BUCKET_KEY, "");
                                    updateCardCustomField(CARD_TRACKER_NAME_KEY, "");
                                    updateCardCustomField(CARD_TRACKER_DURATION_KEY, "");
                                    updateCardCustomField(CARD_TRACKER_POTENCY_KEY, "");
                                    updateCardCustomField(CARD_TRACKER_DAMAGE_KEY, "");
                                    updateCardCustomField(CARD_TRACKER_DESCRIPTION_KEY, "");
                                    updateCardCustomField(CARD_TRACKER_BUFF_TYPE_KEY, "");
                                    updateCardCustomField(CARD_TRACKER_BUFF_TARGET_KEY, "");
                                    updateCardCustomField(CARD_TRACKER_BUFF_VALUE_KEY, "");
                                  }}
                                  className={`${getCardTrackerBucket(editingCard) === "" ? retro.sunken : retro.raised} px-3 py-2 text-[11px]`}
                                  style={panelButtonStyle(getCardTrackerBucket(editingCard) === "", "#7A8AAA")}
                                >
                                  Off
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateCardCustomField(CARD_TRACKER_BUCKET_KEY, "status")}
                                  className={`${getCardTrackerBucket(editingCard) === "status" ? retro.sunken : retro.raised} px-3 py-2 text-[11px]`}
                                  style={panelButtonStyle(getCardTrackerBucket(editingCard) === "status", "#4ACA6A")}
                                >
                                  Status Effect
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateCardCustomField(CARD_TRACKER_BUCKET_KEY, "ability")}
                                  className={`${getCardTrackerBucket(editingCard) === "ability" ? retro.sunken : retro.raised} px-3 py-2 text-[11px]`}
                                  style={panelButtonStyle(getCardTrackerBucket(editingCard) === "ability", "#FF8A5A")}
                                >
                                  Ability / Card Effect
                                </button>
                              </div>

                              {getCardTrackerBucket(editingCard) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                  <div>
                                    <label className="text-[10px] block mb-1" style={labelStyle}>Tracker Name:</label>
                                    <input type="text" value={editingCard.customFields[CARD_TRACKER_NAME_KEY] || ""} onChange={(e) => updateCardCustomField(CARD_TRACKER_NAME_KEY, e.target.value)} placeholder="Defaults to the card name" className={inputClass} style={inputStyle} />
                                  </div>
                                  <div>
                                    <label className="text-[10px] block mb-1" style={labelStyle}>Duration:</label>
                                    <input type="text" value={editingCard.customFields[CARD_TRACKER_DURATION_KEY] || ""} onChange={(e) => updateCardCustomField(CARD_TRACKER_DURATION_KEY, e.target.value)} placeholder="e.g. 1, 3 rounds, 1 minute" className={inputClass} style={inputStyle} />
                                  </div>
                                  <div>
                                    <label className="text-[10px] block mb-1" style={labelStyle}>Potency:</label>
                                    <input type="text" value={editingCard.customFields[CARD_TRACKER_POTENCY_KEY] || ""} onChange={(e) => updateCardCustomField(CARD_TRACKER_POTENCY_KEY, e.target.value)} placeholder="e.g. 2, P, 5-TE" className={inputClass} style={inputStyle} />
                                  </div>
                                  <div>
                                    <label className="text-[10px] block mb-1" style={labelStyle}>Damage / Roll:</label>
                                    <input type="text" value={editingCard.customFields[CARD_TRACKER_DAMAGE_KEY] || ""} onChange={(e) => updateCardCustomField(CARD_TRACKER_DAMAGE_KEY, e.target.value)} placeholder="e.g. 1d8, P, 2d6+P" className={inputClass} style={inputStyle} />
                                  </div>
                                  <div className="md:col-span-2">
                                    <label className="text-[10px] block mb-1" style={labelStyle}>Tracked Effect Text:</label>
                                    <input type="text" value={editingCard.customFields[CARD_TRACKER_DESCRIPTION_KEY] || ""} onChange={(e) => updateCardCustomField(CARD_TRACKER_DESCRIPTION_KEY, e.target.value)} placeholder="Short text shown in Personal Files" className={inputClass} style={inputStyle} />
                                  </div>

                                  {getCardTrackerBucket(editingCard) === "status" && (
                                    <>
                                      <div>
                                        <label className="text-[10px] block mb-1" style={labelStyle}>Buff Type:</label>
                                        <select value={editingCard.customFields[CARD_TRACKER_BUFF_TYPE_KEY] || ""} onChange={(e) => {
                                          updateCardCustomField(CARD_TRACKER_BUFF_TYPE_KEY, e.target.value);
                                          if (!e.target.value) {
                                            updateCardCustomField(CARD_TRACKER_BUFF_TARGET_KEY, "");
                                            updateCardCustomField(CARD_TRACKER_BUFF_VALUE_KEY, "");
                                          }
                                        }} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                                          <option value="">No buff</option>
                                          <option value="attribute">Attribute</option>
                                          <option value="skill">Skill</option>
                                          <option value="resource">Resource</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[10px] block mb-1" style={labelStyle}>Buff Target:</label>
                                        <input type="text" value={editingCard.customFields[CARD_TRACKER_BUFF_TARGET_KEY] || ""} onChange={(e) => updateCardCustomField(CARD_TRACKER_BUFF_TARGET_KEY, e.target.value)} placeholder="e.g. STR, Athletics, Armor Class" className={inputClass} style={inputStyle} />
                                      </div>
                                      <div>
                                        <label className="text-[10px] block mb-1" style={labelStyle}>Buff Value:</label>
                                        <input type="text" value={editingCard.customFields[CARD_TRACKER_BUFF_VALUE_KEY] || ""} onChange={(e) => updateCardCustomField(CARD_TRACKER_BUFF_VALUE_KEY, e.target.value)} placeholder="e.g. +2, P, -1" className={inputClass} style={inputStyle} />
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}

                              <div className="text-[10px]" style={S_SUBTLE}>
                                Status Effect adds the row to the green Status Effects bucket. Ability / Card Effect adds it to the red Abilities / Cards bucket. Old timed-effect tags still work as fallback for older cards.
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                              <div className="text-[12px]" style={S_SECTION_HDR}>CARD SECTION BLOCKS</div>
                              <div className="text-[10px]" style={S_SUBTLE}>{cardSectionBlocks.length} saved section block{cardSectionBlocks.length === 1 ? "" : "s"}</div>
                            </div>
                            <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#FFD700")}>
                              <div className="flex flex-wrap gap-2">
                                {CARD_SECTION_BLOCK_PRESETS.map((preset) => (
                                  <button
                                    key={`${preset.title}-${preset.tone}`}
                                    onClick={() => addPresetSectionBlock(preset)}
                                    className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1.5`}
                                    style={toneChipStyle(preset.tone)}
                                  >
                                    <Plus size={10} /> {preset.title}
                                  </button>
                                ))}
                                <button onClick={clearSectionBlocks} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}>
                                  Clear All Blocks
                                </button>
                              </div>

                              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_180px_auto] gap-2 items-end">
                                <div>
                                  <label className="text-[10px] block mb-1" style={labelStyle}>Custom Block Title:</label>
                                  <input
                                    type="text"
                                    value={newSectionTitle}
                                    onChange={(e) => setNewSectionTitle(e.target.value)}
                                    placeholder="e.g. Follow-Up, Combo, Reminder..."
                                    className={inputClass}
                                    style={inputStyle}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] block mb-1" style={labelStyle}>Tone:</label>
                                  <select value={newSectionTone} onChange={(e) => setNewSectionTone(e.target.value as CardSectionTone)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                                    <option value="rules">Rules</option>
                                    <option value="highlight">Highlight</option>
                                    <option value="limitation">Limitation</option>
                                    <option value="reminder">Reminder</option>
                                  </select>
                                </div>
                                <button onClick={addCustomSectionBlock} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1.5`} style={S_GREEN_BTN}>
                                  <Plus size={12} /> Add Custom Block
                                </button>
                              </div>

                              {cardSectionBlocks.length === 0 ? (
                                <div className="text-[11px]" style={S_MUTED}>No card section blocks yet. Add a preset or create a custom section.</div>
                              ) : (
                                <div className="space-y-3">
                                  {cardSectionBlocks.map((block, index) => (
                                    <div key={block.id} className={`${retro.sunken} bg-[#0A0A28] p-3 space-y-3`} style={editorSurfaceStyle(block.tone === "rules" ? "#7ACA8A" : block.tone === "highlight" ? "#8AB8FF" : block.tone === "limitation" ? "#FF9A7A" : "#FFD700")}>
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[9px] px-2 py-0.5" style={toneChipStyle(block.tone)}>Section {index + 1}</span>
                                          <span className="text-[10px]" style={S_SUBTLE}>Reorder or tone-shift this block before sending it into the rules text.</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 justify-end">
                                          <button onClick={() => moveSectionBlock(block.id, -1)} disabled={index === 0} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}><ChevronUp size={10} /></button>
                                          <button onClick={() => moveSectionBlock(block.id, 1)} disabled={index === cardSectionBlocks.length - 1} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}><ChevronDown size={10} /></button>
                                          <button onClick={() => removeSectionBlock(block.id)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_RED}><Trash2 size={10} /></button>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_180px] gap-2 items-end">
                                        <div>
                                          <label className="text-[10px] block mb-1" style={labelStyle}>Section Title:</label>
                                          <input
                                            type="text"
                                            value={block.title}
                                            onChange={(e) => updateSectionBlock(block.id, { title: e.target.value })}
                                            className={inputClass}
                                            style={inputStyle}
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] block mb-1" style={labelStyle}>Tone:</label>
                                          <select value={block.tone} onChange={(e) => updateSectionBlock(block.id, { tone: e.target.value as CardSectionTone })} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                                            <option value="rules">Rules</option>
                                            <option value="highlight">Highlight</option>
                                            <option value="limitation">Limitation</option>
                                            <option value="reminder">Reminder</option>
                                          </select>
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-[10px] block mb-1" style={labelStyle}>Content:</label>
                                        <textarea
                                          value={block.content}
                                          onChange={(e) => updateSectionBlock(block.id, { content: e.target.value })}
                                          placeholder="Write this section's content..."
                                          className={`${inputClass} min-h-[92px] resize-y`}
                                          style={inputStyle}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className={`${retro.sunken} bg-[#0A0A28] p-3 flex flex-wrap items-center gap-2`}>
                                <button onClick={() => applySectionBlocks("replace")} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1.5`} style={S_GREEN_BTN}>
                                  <Save size={12} /> Replace Effect(s) with Blocks
                                </button>
                                <button onClick={() => applySectionBlocks("append")} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1.5`} style={S_ACCENT}>
                                  <Plus size={12} /> Append Blocks to Effect(s)
                                </button>
                                <button onClick={() => applyCombinedStructuredOutput("replace")} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1.5`} style={toneChipStyle("highlight")}>
                                  <Sparkles size={12} /> Build Full Effect(s)
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <div className="text-[12px] mb-2" style={S_SECTION_HDR}>DESCRIPTION</div>
                              <RichTextEditor value={editingCard.customFields[CARD_DESCRIPTION_KEY] || ""} onChange={(html) => updateCardCustomField(CARD_DESCRIPTION_KEY, html)} placeholder="Enter a short overview or setup text..." minHeight={120} />
                            </div>
                            <div>
                              <div className="text-[12px] mb-2" style={S_SECTION_HDR}>EFFECT(S)</div>
                              <RichTextEditor value={editingCard.effect} onChange={(html) => updateCardField("effect", html)} placeholder="Enter card effects..." minHeight={200} />
                            </div>
                            <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-2`} style={editorSurfaceStyle("#FFD700")}>
                              <div className="text-[10px]" style={S_SECTION_HDR}>SCALING / UPCAST</div>
                              <input
                                type="text"
                                value={editingCard.customFields[USE_PROFILE_UPCAST_KEY] || ""}
                                onChange={(e) => updateCardCustomField(USE_PROFILE_UPCAST_KEY, e.target.value)}
                                placeholder="How does the card scale, upcast, or improve?"
                                className={inputClass}
                                style={inputStyle}
                              />
                              {(editingCard.customFields[USE_PROFILE_UPCAST_KEY] || "").trim() && (
                                <div className="text-[11px]" style={S_TEXT}>{editingCard.customFields[USE_PROFILE_UPCAST_KEY]}</div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className={`${retro.raised} bg-[#0E0E35] p-4`} style={editorSurfaceStyle("#8AB8FF")}>
                            <div className="text-[12px] mb-2" style={S_SECTION_HDR}>QUICK READ</div>
                            <div className="space-y-2 text-[11px]" style={S_SUBTLE}>
                              <div><span style={S_TEXT_BOLD}>Structured Preview</span> shows the builder output in the order it will read.</div>
                              <div><span style={S_TEXT_BOLD}>Block Preview</span> helps you polish supporting summaries, follow-ups, and limitations.</div>
                              <div><span style={S_TEXT_BOLD}>Full Generated Output</span> shows the combined result before you commit it to rules text.</div>
                            </div>
                          </div>

                          <div>
                            <div className="text-[12px] mb-2" style={S_SECTION_HDR}>STRUCTURED PREVIEW</div>
                            <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3 min-h-[220px]`} style={editorSurfaceStyle("#6ABAFF")}>
                              {MECHANICS_BLOCKS.filter((block) => mechanicsBuilder[block.id].trim()).length === 0 ? (
                                <div className="text-[11px]" style={S_MUTED}>No structured mechanics blocks yet. Add a block or load one from the existing rules text.</div>
                              ) : (
                                MECHANICS_BLOCKS.filter((block) => mechanicsBuilder[block.id].trim()).map((block, index) => (
                                  <div key={block.id} className={`${retro.sunken} bg-[#0A0A28] p-3`}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[9px] px-2 py-0.5" style={sectionBadgeStyle("#6ABAFF")}>{index + 1}</span>
                                      <div className="text-[10px]" style={S_SECTION_HDR}>{block.label.toUpperCase()}</div>
                                    </div>
                                    <div className="text-[11px]" style={S_TEXT}>{mechanicsBuilder[block.id]}</div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="text-[12px] mb-2" style={S_SECTION_HDR}>BLOCK PREVIEW</div>
                            <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3 min-h-[220px]`} style={editorSurfaceStyle("#FFD700")}>
                              {cardSectionBlocks.length === 0 ? (
                                <div className="text-[11px]" style={S_MUTED}>No card section blocks yet.</div>
                              ) : (
                                cardSectionBlocks.map((block) => (
                                  <div key={block.id} className={`${retro.sunken} bg-[#0A0A28] p-3`}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <div className="text-[10px]" style={S_SECTION_HDR}>{block.title.toUpperCase() || "SECTION"}</div>
                                      <span className="text-[9px] px-2 py-0.5" style={toneChipStyle(block.tone)}>{block.tone}</span>
                                    </div>
                                    <div className="text-[11px]" style={S_TEXT}>{block.content || <span style={S_MUTED}>No content yet.</span>}</div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="text-[12px] mb-2" style={S_SECTION_HDR}>FULL GENERATED OUTPUT</div>
                            <div className={`${retro.raised} bg-[#0E0E35] p-4 min-h-[160px] text-[11px]`} style={{ ...editorSurfaceStyle("#8AB8FF"), ...S_TEXT }}>
                              {buildCombinedRulesHtml(mechanicsBuilder, cardSectionBlocks) ? (
                                <div dangerouslySetInnerHTML={{ __html: buildCombinedRulesHtml(mechanicsBuilder, cardSectionBlocks) }} />
                              ) : (
                                <span style={S_MUTED}>No generated output yet. Add mechanics or section blocks to compose a full rules text preview.</span>
                              )}
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  )}

                  {editorPanel === "tags" && (
                    <div className={`${retro.sunken} bg-[#0C0C2E] p-5 space-y-4`}>
                      <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                        <div className="text-[12px] mb-1" style={S_SECTION_HDR}>TAGS AS HELPERS AND MODIFIERS</div>
                        <div className="text-[11px]" style={S_SUBTLE}>
                          Use tags to classify the card, add light modifiers, and expose optional helper fields. Keep the main card structure in Core and Mechanics.
                        </div>
                      </div>

                      <div>
                        <div className="text-[12px] mb-2" style={S_SECTION_HDR}>ACTIVE TAGS</div>
                        {selectedTagDefs.length === 0 ? (
                          <div className={`${retro.raised} bg-[#0E0E35] p-3 text-[11px]`} style={S_MUTED}>
                            No tags selected yet. Add helper tags below or use the suggestions section.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {selectedTagDefs.map((tag) => {
                              const role = getTagRole(tag);
                              return (
                                <div key={tag.id} className={`${retro.raised} bg-[#0E0E35] px-3 py-2 flex items-center gap-2`}>
                                  <button onClick={() => toggleCardTag(tag.name)} className="text-[10px] px-2 py-1" style={DM_TAG_BADGE}>
                                    {tag.name}
                                  </button>
                                  <span className="text-[9px] px-2 py-1" style={{ color: role.color, border: role.border, background: role.background }}>
                                    {role.label}
                                  </span>
                                  {tag.fields.length > 0 && (
                                    <span className="text-[9px]" style={S_MUTED}>{tag.fields.length} field{tag.fields.length === 1 ? "" : "s"}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="text-[12px] mb-2" style={S_SECTION_HDR}>SUGGESTED HELPER TAGS</div>
                        {suggestedTagDefs.length === 0 ? (
                          <div className={`${retro.raised} bg-[#0E0E35] p-3 text-[11px]`} style={S_MUTED}>
                            No extra suggestions right now. The current type, mechanics, and rules text do not strongly point to more helper tags.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {suggestedTagDefs.map((tag) => {
                              const role = getTagRole(tag);
                              return (
                                <button
                                  key={tag.id}
                                  onClick={() => toggleCardTag(tag.name)}
                                  className={`${retro.button} px-3 py-2 text-left flex items-center gap-2`}
                                  style={{ color: role.color, border: role.border, background: role.background }}
                                  title={tag.description || tag.name}
                                >
                                  <Plus size={11} />
                                  <span className="text-[11px]">{tag.name}</span>
                                  <span className="text-[9px] opacity-80">{role.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className={`${retro.raised} bg-[#0E0E35] p-3 space-y-3`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[12px]" style={S_SECTION_HDR}>TAG STARTER PROFILE</div>
                          {activeTagStarterProfile && (
                            <span className="text-[10px] px-2 py-1" style={DM_ACTION_BADGE}>{activeTagStarterProfile.readiness.toUpperCase()}</span>
                          )}
                        </div>
                        {!activeTagStarterProfile ? (
                          <div className="text-[11px]" style={S_MUTED}>Add helper tags to build a starter profile for this card.</div>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-2 text-[10px]">
                              {activeTagStarterProfile.families.map((family) => <span key={family} className="px-2 py-1" style={DM_TAG_BADGE}>{family}</span>)}
                              {activeTagStarterProfile.purposes.map((purpose) => <span key={purpose} className="px-2 py-1" style={DM_TAG_BADGE}>{purpose}</span>)}
                              {activeTagStarterProfile.targeting && <span className="px-2 py-1" style={DM_TAG_BADGE}>target: {activeTagStarterProfile.targeting}</span>}
                              {activeTagStarterProfile.costModel && <span className="px-2 py-1" style={DM_TAG_BADGE}>cost: {activeTagStarterProfile.costModel}</span>}
                              <span className="px-2 py-1" style={DM_TAG_BADGE}>template: {activeTagStarterProfile.template}</span>
                              <span className="px-2 py-1" style={DM_TAG_BADGE}>panel: {activeTagStarterProfile.focusPanel}</span>
                            </div>
                            {activeTagStarterProfile.note && (
                              <div className="text-[11px]" style={S_MUTED}>{activeTagStarterProfile.note}</div>
                            )}
                            <div>
                              <div className="text-[10px] mb-1" style={S_SECTION_HDR}>PLAYER-FACING TAG PREVIEW</div>
                              {playerFacingTagBadges.length === 0 ? (
                                <div className="text-[11px]" style={S_MUTED}>No visible player-facing tag badges yet.</div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {playerFacingTagBadges.map((badge) => (
                                    <span key={badge.tagName} className="text-[10px] px-2 py-1" style={DM_TAG_BADGE} title={`${badge.filterGroup} · ${badge.visibility}`}>
                                      {badge.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                          <div className="text-[12px]" style={S_SECTION_HDR}>BROWSE ALL TAGS</div>
                          <div className="flex flex-wrap gap-2">
                            {([
                              { id: "all" as TagFilterMode, label: "All" },
                              { id: "active" as TagFilterMode, label: "Active" },
                              { id: "withFields" as TagFilterMode, label: "With Fields" },
                              { id: "simple" as TagFilterMode, label: "Simple" },
                            ]).map((mode) => (
                              <button
                                key={mode.id}
                                onClick={() => setTagFilterMode(mode.id)}
                                className={`${tagFilterMode === mode.id ? retro.sunken + " bg-[#0A173A]" : retro.raised + " bg-[#161648]"} px-3 py-1.5 text-[10px]`}
                                style={{ color: tagFilterMode === mode.id ? "#8AB8FF" : "#8A9ABB" }}
                              >
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="relative mb-3">
                          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={S_MUTED} />
                          <input
                            type="text"
                            value={tagSearch}
                            onChange={(e) => setTagSearch(e.target.value)}
                            placeholder="Search tag names or descriptions..."
                            className={`${inputClass} pl-9`}
                            style={inputStyle}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {visibleTagDefs.map((tag) => {
                            const active = editingCard.tags.includes(tag.name);
                            const role = getTagRole(tag);
                            return (
                              <button
                                key={tag.id}
                                onClick={() => toggleCardTag(tag.name)}
                                className={`${retro.button} px-3 py-2 text-left flex items-center gap-2`}
                                style={{
                                  color: active ? "#4A7BFF" : role.color,
                                  background: active ? "#1A2A5A" : role.background,
                                  border: active ? "1px solid #2A3A6A" : role.border,
                                }}
                                title={tag.description || tag.name}
                              >
                                <span className="text-[11px]">{tag.name}</span>
                                <span className="text-[9px] opacity-80">{role.label}</span>
                                {tag.fields.length > 0 && <span className="text-[8px] opacity-70">+{tag.fields.length}</span>}
                              </button>
                            );
                          })}
                          {cardTags.length === 0 && <span className="text-[11px]" style={S_MUTED}>No card tags defined. Create tags in Manage Tags first.</span>}
                          {cardTags.length > 0 && visibleTagDefs.length === 0 && <span className="text-[11px]" style={S_MUTED}>No tags match the current search or filter.</span>}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="text-[12px]" style={S_SECTION_HDR}>TAG FIELD GROUPS</div>
                          <div className="text-[10px]" style={S_SUBTLE}>
                            {activeFieldsByTag.length} active field group{activeFieldsByTag.length === 1 ? "" : "s"}
                          </div>
                        </div>
                        {activeFieldsByTag.length === 0 ? (
                          <div className={`${retro.raised} bg-[#0E0E35] p-3 text-[11px]`} style={S_MUTED}>
                            None of the currently selected tags add extra fields.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {activeFieldsByTag.map((group) => {
                              const tagDef = cardTags.find((tag) => tag.name === group.tagName);
                              const role = tagDef ? getTagRole(tagDef) : { label: "Helper", color: "#7A8AAA", border: "1px solid #7A8AAA33", background: "#7A8AAA15" };
                              return (
                                <div key={group.tagName} className={`${retro.raised} bg-[#0E0E35] p-3`}>
                                  <div className="flex flex-wrap items-center gap-2 mb-3">
                                    <span className="text-[11px] px-2 py-1" style={DM_TAG_BADGE}>{group.tagName}</span>
                                    <span className="text-[9px] px-2 py-1" style={{ color: role.color, border: role.border, background: role.background }}>
                                      {role.label}
                                    </span>
                                    {tagDef?.description && (
                                      <span className="text-[10px]" style={S_SUBTLE}>{tagDef.description}</span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {group.fields.map((cf) => renderCardTagFieldInput(cf))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {editorPanel === "progression" && (
                    <div className={`${retro.sunken} bg-[#0C0C2E] p-5 space-y-4`}>
                      <div className="text-[12px]" style={S_SECTION_HDR}>PROGRESSION / NODE TREE</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Node Tree:</label>
                          <select
                            value={editingCard.nodeTreeId || ""}
                            onChange={(e) => {
                              updateCardField("nodeTreeId" as keyof ManagedCard, e.target.value as any);
                              updateCardField("nodeId" as keyof ManagedCard, "" as any);
                            }}
                            className={`${inputClass} cursor-pointer`}
                            style={inputStyle}
                          >
                            <option value="">-- None --</option>
                            {nodeTrees.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Node:</label>
                          <select
                            value={editingCard.nodeId || ""}
                            onChange={(e) => updateCardField("nodeId" as keyof ManagedCard, e.target.value as any)}
                            className={`${inputClass} cursor-pointer`}
                            style={inputStyle}
                            disabled={!editingCard.nodeTreeId}
                          >
                            <option value="">-- None --</option>
                            {editingCard.nodeTreeId &&
                              nodeTrees.find((t) => t.id === editingCard.nodeTreeId)?.nodes.map((n) => (
                                <option key={n.id} value={n.id}>{n.label}</option>
                              ))}
                          </select>
                        </div>
                      </div>

                      <div className={`${retro.raised} bg-[#0E0E35] p-3 space-y-2`}>
                        <div className="text-[10px]" style={S_SECTION_HDR}>CURRENT ASSIGNMENT</div>
                        <div className="text-[11px]" style={S_TEXT}>{selectedNodeTree ? selectedNodeTree.name : "No node tree selected"}</div>
                        <div className="text-[11px]" style={S_MUTED}>{selectedNode ? `Node: ${selectedNode.label}` : "No node selected"}</div>
                        {selectedNode && (
                          <div className="text-[10px]" style={S_SUBTLE}>
                            This node currently has {selectedNode.cardIds.length} / 3 card slot{selectedNode.cardIds.length !== 1 ? "s" : ""} filled.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {editorPanel === "assignment" && (
                    <div className={`${retro.sunken} bg-[#0C0C2E] p-5 space-y-4`}>
                      <div className="text-[12px]" style={S_SECTION_HDR}>PLAYER ASSIGNMENT</div>
                      <div className={`${retro.sunken} bg-[#0A0A28] p-3 w-full lg:w-2/3`}>
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input type="checkbox" checked={editingCard.assignedTo.includes("all")} onChange={(e) => {
                            if (e.target.checked) updateCardField("assignedTo", ["all"]);
                            else updateCardField("assignedTo", []);
                          }} className="accent-[#4A9A5A]" />
                          <span className="text-[12px]" style={S_GREEN_BTN}>All Players</span>
                        </label>
                        <div className="h-[1px] mb-2" style={DM_DIVIDER} />
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {players.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" disabled={editingCard.assignedTo.includes("all")} checked={editingCard.assignedTo.includes("all") || editingCard.assignedTo.includes(p.id)} onChange={(e) => {
                                const current = editingCard.assignedTo.filter((id) => id !== "all");
                                if (e.target.checked) updateCardField("assignedTo", [...current, p.id]);
                                else updateCardField("assignedTo", current.filter((id) => id !== p.id));
                              }} className="accent-[#4A7BFF]" />
                              <span className="text-[12px]" style={dmAssignDim(editingCard.assignedTo.includes("all"))}>{p.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {dmCardsSubTab === "levelabilities" && (() => {
        const sortedLevels = [...levelCategories].sort((a, b) => a.order - b.order);
        const selectedPlayer = players.find((p) => p.id === laSelectedPlayerId);
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[12px]" style={S_SECTION_HDR}>LEVEL ABILITY CATEGORIES</div>
            </div>
            <p className="text-[10px]" style={S_SUBTLE}>
              Create level categories per player and assign cards to them. Each player has their own set of level categories. Select a player below to manage their Level Abilities.
            </p>

            {players.length === 0 ? (
              <div className="text-[12px] text-center py-6" style={S_MUTED}>No players created yet. Add players in the Manage Players section first.</div>
            ) : (
              <div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {players.map((p) => {
                    const isActive = laSelectedPlayerId === p.id;
                    const totalCards = isActive ? levelCategories.reduce((sum, c) => sum + c.cardIds.length, 0) : 0;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setLaSelectedPlayerId(p.id)}
                        className={`${isActive ? retro.sunken + " bg-[#0C0C2E]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-2 text-[11px] flex items-center gap-1.5 transition-colors`}
                        style={{ color: isActive ? "#FFD700" : "#8A9ABB", fontWeight: isActive ? 600 : 400, borderBottom: isActive ? "2px solid #FFD700" : "2px solid transparent" }}
                      >
                        <User size={12} />
                        {p.name}
                        {isActive && (
                          <span className="text-[9px] px-1 py-0.5 ml-0.5" style={{ background: "#0A0A28", color: "#FFD700", border: "1px solid #FFD70044" }}>
                            {levelCategories.length} lvl · {totalCards} cards
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {selectedPlayer && (
                  <div className="flex items-center gap-2 mb-3">
                    {!laCopyConfirm ? (
                      <button
                        onClick={() => setLaCopyConfirm(true)}
                        className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1.5`}
                        style={{ color: "#C4A0FF", border: "1px solid #C4A0FF33" }}
                        title={`Copy ${selectedPlayer.name}'s level categories to all other players`}
                      >
                        <Copy size={11} /> Copy {selectedPlayer.name}'s Levels to All Players
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px]" style={{ color: "#FF9A4A" }}>
                          This will overwrite all other players' level categories with {selectedPlayer.name}'s. Continue?
                        </span>
                        <button onClick={copyLevelCategoriesToAllPlayers} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_GREEN_BTN}>Yes, Copy</button>
                        <button onClick={() => setLaCopyConfirm(false)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}>Cancel</button>
                      </div>
                    )}
                  </div>
                )}

                <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                  {laAddingLevel ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={laNewLevelName}
                        onChange={(e) => setLaNewLevelName(e.target.value)}
                        placeholder="Level name (e.g. Level 1, Tier 2...)"
                        className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] flex-1 outline-none`}
                        style={{ color: "#FFD700" }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && laNewLevelName.trim()) {
                            const newCat = { id: `lvl-${Date.now()}`, name: laNewLevelName.trim(), order: levelCategories.length, cardIds: [] as string[], description: "" };
                            void saveLevelCategories([...levelCategories, newCat]);
                            setLaNewLevelName("");
                            setLaAddingLevel(false);
                          }
                          if (e.key === "Escape") {
                            setLaAddingLevel(false);
                            setLaNewLevelName("");
                          }
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          if (!laNewLevelName.trim()) return;
                          const newCat = { id: `lvl-${Date.now()}`, name: laNewLevelName.trim(), order: levelCategories.length, cardIds: [] as string[], description: "" };
                          void saveLevelCategories([...levelCategories, newCat]);
                          setLaNewLevelName("");
                          setLaAddingLevel(false);
                        }}
                        className={`${retro.button} px-3 py-2 text-[11px]`}
                        style={S_GREEN_BTN}
                      >
                        <Save size={12} className="inline mr-1" />Add
                      </button>
                      <button onClick={() => { setLaAddingLevel(false); setLaNewLevelName(""); }} className={`${retro.button} px-3 py-2 text-[11px]`} style={S_RED}><X size={12} className="inline mr-1" />Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setLaAddingLevel(true)} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2 mb-4`} style={S_GREEN_BTN}>
                      <Plus size={14} /> Add Level Category
                    </button>
                  )}

                  {levelCategories.length === 0 ? (
                    <div className="text-[11px] text-center py-6" style={S_MUTED}>No level categories yet for this player.</div>
                  ) : (() => {
                    const selectedPlayerId = laSelectedPlayerId;
                    const playerAssignedCards = managedCards.filter((c) => c.assignedTo.includes(selectedPlayerId) || c.assignedTo.includes("all"));
                    return (<>
                      <div className="text-[10px] mb-3" style={S_SUBTLE}>
                        {selectedPlayer?.name} has <span style={S_TEXT}>{playerAssignedCards.length}</span> assigned card{playerAssignedCards.length !== 1 ? "s" : ""} available for level categories.
                      </div>
                      <div className="space-y-3">
                        {sortedLevels.map((level, levelIdx) => {
                          const isCollapsed = laCollapsedLevels.has(level.id);
                          const levelCards = playerAssignedCards.filter((c) => level.cardIds.includes(c.id));
                          const assignedCardIds = new Set(levelCategories.flatMap((lc) => lc.cardIds));
                          const availableCards = playerAssignedCards.filter((c) => !assignedCardIds.has(c.id));
                          return (
                            <div key={level.id} className={`${retro.sunken} bg-[#0C0C2E]`}>
                              <div
                                className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-[#0E0E35] transition-colors"
                                style={{ borderBottom: isCollapsed ? "none" : "1px solid #1A1A4B" }}
                                onClick={() => setLaCollapsedLevels((prev) => { const n = new Set(prev); if (n.has(level.id)) n.delete(level.id); else n.add(level.id); return n; })}
                              >
                                <ChevronRight size={14} style={{ color: "#FFD700", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 0.2s ease" }} />
                                {laEditingLevel === level.id ? (
                                  <input
                                    value={level.name}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => void saveLevelCategories(levelCategories.map((lc) => lc.id === level.id ? { ...lc, name: e.target.value } : lc))}
                                    onBlur={() => setLaEditingLevel(null)}
                                    onKeyDown={async (e) => { if (e.key === "Enter") setLaEditingLevel(null); }}
                                    className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[13px] flex-1 outline-none`}
                                    style={{ color: "#FFD700" }}
                                    autoFocus
                                  />
                                ) : (
                                  <span className="text-[13px] flex-1" style={{ color: "#FFD700", fontWeight: 600 }}>{level.name}</span>
                                )}
                                <span className="text-[9px] px-1.5 py-0.5" style={{ background: "#0A0A28", color: "#7A8AAA", border: "1px solid #1A1A4B" }}>
                                  {levelCards.length} card{levelCards.length !== 1 ? "s" : ""}
                                </span>
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  {levelIdx > 0 && (
                                    <button onClick={async () => {
                                      const prev = sortedLevels[levelIdx - 1];
                                      await saveLevelCategories(levelCategories.map((l) => l.id === level.id ? { ...l, order: prev.order } : l.id === prev.id ? { ...l, order: level.order } : l));
                                    }} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#7A8AAA" }} title="Move up"><ChevronUp size={12} /></button>
                                  )}
                                  {levelIdx < sortedLevels.length - 1 && (
                                    <button onClick={async () => {
                                      const next = sortedLevels[levelIdx + 1];
                                      await saveLevelCategories(levelCategories.map((l) => l.id === level.id ? { ...l, order: next.order } : l.id === next.id ? { ...l, order: level.order } : l));
                                    }} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#7A8AAA" }} title="Move down"><ChevronDown size={12} /></button>
                                  )}
                                  <button onClick={() => setLaEditingLevel(level.id)} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#4A7BFF" }} title="Rename"><Edit size={12} /></button>
                                  <button onClick={() => void saveLevelCategories(levelCategories.filter((lc) => lc.id !== level.id))} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#FF5A5A" }} title="Delete category"><Trash2 size={12} /></button>
                                </div>
                              </div>

                              {!isCollapsed && (
                                <div className="px-4 pb-4 pt-2 space-y-3">
                                  <div>
                                    <div className="text-[10px] mb-1" style={S_SECTION_HDR}>DESCRIPTION</div>
                                    {laEditingDesc === level.id ? (
                                      <div className="space-y-2">
                                        <textarea
                                          value={level.description || ""}
                                          onChange={(e) => void saveLevelCategories(levelCategories.map((lc) => lc.id === level.id ? { ...lc, description: e.target.value } : lc))}
                                          placeholder="Add a description for this level category..."
                                          className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[11px] w-full outline-none resize-y min-h-[60px]`}
                                          style={{ color: "#C0D0F0" }}
                                          rows={3}
                                        />
                                        <button onClick={() => setLaEditingDesc(null)} className={`${retro.button} px-3 py-1 text-[10px]`} style={S_ACCENT}>Done</button>
                                      </div>
                                    ) : (
                                      <div className="text-[11px] cursor-pointer px-2 py-1.5 hover:bg-[#0A0A28] transition-colors" style={{ color: level.description ? "#C0D0F0" : "#4A5A7A", border: "1px dashed #1A1A4B" }} onClick={() => setLaEditingDesc(level.id)}>
                                        {level.description || "Click to add a description..."}
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <div className="text-[10px] mb-1" style={S_SECTION_HDR}>ASSIGNED CARDS ({levelCards.length})</div>
                                    {levelCards.length === 0 ? (
                                      <div className="text-[11px] py-2" style={S_MUTED}>No cards assigned to this level yet.</div>
                                    ) : (
                                      <div className="space-y-1">
                                        {levelCards.map((card) => (
                                          <div key={card.id} className={`${retro.raised} bg-[#0E0E35] p-2 flex items-center justify-between`}>
                                            <div>
                                              <span className="text-[12px]" style={S_TEXT_BOLD}>{card.name}</span>
                                              <span className="text-[10px] ml-2" style={S_MUTED}>{card.type} · {card.actionCost}</span>
                                              {card.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                  {card.tags.map((t) => <span key={t} className="text-[8px] px-1 py-0.5" style={DM_TAG_BADGE}>{t}</span>)}
                                                </div>
                                              )}
                                            </div>
                                            <button onClick={() => void saveLevelCategories(levelCategories.map((lc) => lc.id === level.id ? { ...lc, cardIds: lc.cardIds.filter((cid) => cid !== card.id) } : lc))} className={`${retro.button} px-2 py-1 text-[10px] shrink-0`} style={S_RED}>
                                              <X size={10} className="inline mr-0.5" />Remove
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {availableCards.length > 0 && (
                                    <div>
                                      <div className="text-[10px] mb-1" style={S_SECTION_HDR}>ADD CARD</div>
                                      <select className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[11px] w-full outline-none`} style={{ color: "#C0D0F0" }} value="" onChange={(e) => {
                                        if (!e.target.value) return;
                                        const cardId = e.target.value;
                                        void saveLevelCategories(levelCategories.map((lc) => ({
                                          ...lc,
                                          cardIds: lc.id === level.id ? [...lc.cardIds.filter((cid) => cid !== cardId), cardId] : lc.cardIds.filter((cid) => cid !== cardId),
                                        })));
                                      }}>
                                        <option value="">+ Assign a card to {level.name}...</option>
                                        {availableCards.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                                      </select>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
