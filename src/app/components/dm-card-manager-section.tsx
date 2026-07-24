import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { retro } from "./retro-styles";
import { RichTextEditor } from "./rich-text-editor";
import { RenderFormattedText } from "./render-text";
import { renderTypedField as renderTypedFieldShared } from "./tag-field-renderer";
import {
  loadDMPlayerLevelCategories,
  loadDMPlayerMagicLists,
  saveDMPlayerLevelCategories,
  saveDMPlayerMagicLists,
} from "@/lib/player-state-api";
import {
  createEmptyMagicList,
  getLevelCategoryEntries,
  getLevelCategoryNumber,
  isRaceLevelCategory,
  normalizeLevelCategories,
  normalizeMagicLists,
  MAGIC_TIER_LABELS,
  MAGIC_TIER_ORDER,
  sortLevelCategories,
} from "@/lib/card-placement";
import type {
  LevelCategory,
  MagicTierKey,
  ManagedCard,
  PlayerData,
  PlayerMagicList,
  TagDefinition,
  TagField,
} from "./types";
import { type NodeTree } from "./node-trees";
import { sanitizeRichHtml } from "@/lib/sanitize-rich-html";
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
  Dices,
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

type CardEditorPanel = "preview" | "core" | "mechanics" | "tags" | "progression" | "assignment";
type CardWorkspaceStage = "live" | "overview" | "rules" | "effects" | "delivery";
type CardRulesMode = "guided" | "manual";
type MechanicsWorkspaceView = "rules" | "automation" | "text";
type OverviewSubTab = "identity" | "profile" | "advanced-profile";
type RulesSubTab = "main-effect" | "builder" | "section-blocks" | "scaling";
type EffectsSubTab = "tags" | "visible-fields" | "tracker" | "quick-rolls" | "advanced";
type DeliverySubTab = "players" | "node-trees" | "validation";
type CardTemplateId = "blank" | "attack" | "heal" | "buff" | "debuff" | "reaction" | "passive" | "utility";
type TagFilterMode = "all" | "active" | "withFields" | "simple";
type CardFamily = "" | "spell" | "skill" | "ability";
type CardLibrarySortMode = "manual" | "name" | "player";
type CardPreviewFocusRegion = "identity" | "description" | "rules" | "scaling" | "tags" | "tracking" | "quick-rolls" | "delivery" | null;
type CardPreviewEditField = "identity" | "description" | "effect" | "scaling" | "tracker" | "quick-rolls" | `tag:${string}` | null;
type ActiveCustomFieldEntry = { tagName: string; fieldName: string; key: string; fieldDef: TagField };
type ActiveCustomFieldGroup = { tagName: string; fields: ActiveCustomFieldEntry[] };

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

interface CardValidationIssue {
  id: string;
  level: "error" | "warning";
  panel: CardEditorPanel;
  mechanicsView?: MechanicsWorkspaceView;
  message: string;
}

interface CardWorkspaceStageDef {
  id: CardWorkspaceStage;
  label: string;
  accent: string;
  icon: React.ComponentType<{ size?: number }>;
  helper: string;
}

interface WorkspaceSubTabDef<T extends string> {
  id: T;
  label: string;
  helper: string;
  accent: string;
}

interface PreviewInfoField {
  key: string;
  label: string;
  value: string;
}

interface PreviewSidebarSection {
  title: string;
  accent: string;
  fields: PreviewInfoField[];
}

const EDITOR_MECHANICS_KEY = "__editor_mechanics_builder";
const EDITOR_SECTION_BLOCKS_KEY = "__editor_section_blocks";
const EDITOR_RULES_MODE_KEY = "__editor_rules_mode";
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
const QUICK_ROLL_PREFIX = "Quick Roll::";
const QUICK_ROLL_LABEL_KEY = "Label";
const QUICK_ROLL_EXPRESSION_KEY = "Expression";
const QUICK_ROLL_POTENCY_KEY = "Potency";
const FAMILY_CONTROLLED_PROFILE_KEYS = [
  USE_PROFILE_MAGIC_NATURE_KEY,
  USE_PROFILE_COST_MODEL_KEY,
  USE_PROFILE_PRIMARY_COST_KEY,
  USE_PROFILE_USES_KEY,
  USE_PROFILE_COMPONENTS_KEY,
  USE_PROFILE_COMPONENT_DETAILS_KEY,
  USE_PROFILE_UPCAST_KEY,
  USE_PROFILE_ORIGIN_KEY,
  USE_PROFILE_PASSIVE_MODE_KEY,
] as const;

interface QuickRollSlot {
  slotId: string;
  label: string;
  expression: string;
  potency: string;
}


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

const CARD_WORKSPACE_STAGES: CardWorkspaceStageDef[] = [
  {
    id: "live",
    label: "Live Edit",
    accent: "#5C8DFF",
    icon: Eye,
    helper: "Focus entirely on the live card preview and edit the player-facing content directly.",
  },
  {
    id: "overview",
    label: "Overview",
    accent: "#4A7BFF",
    icon: Settings,
    helper: "Identity, family, description, and the card's core use profile.",
  },
  {
    id: "rules",
    label: "Rules",
    accent: "#6ABAFF",
    icon: FileText,
    helper: "Guided builder, rules source, manual text, and scaling.",
  },
  {
    id: "effects",
    label: "Effects & Tags",
    accent: "#9A7ABB",
    icon: Tags,
    helper: "Tracker, quick rolls, tags, and helper field groups.",
  },
  {
    id: "delivery",
    label: "Delivery",
    accent: "#7ACA8A",
    icon: Users,
    helper: "Assignments, progression, validation, and final publishing checks.",
  },
];

const OVERVIEW_SUB_TABS: WorkspaceSubTabDef<OverviewSubTab>[] = [
  { id: "identity", label: "Identity", helper: "Name, type, cost, source, and player-facing description.", accent: "#4A7BFF" },
  { id: "profile", label: "Profile", helper: "Family selection and the card's main use-profile summary.", accent: "#6ABAFF" },
  { id: "advanced-profile", label: "Advanced Profile", helper: "Requirements, components, duration, and deeper profile fields.", accent: "#8AB8FF" },
];

const RULES_SUB_TABS: WorkspaceSubTabDef<RulesSubTab>[] = [
  { id: "main-effect", label: "Main Effect", helper: "Saved rules source, import actions, and the main rules text.", accent: "#FFD166" },
  { id: "builder", label: "Builder", helper: "Structured mechanics steps that feed guided rules output.", accent: "#6ABAFF" },
  { id: "section-blocks", label: "Section Blocks", helper: "Add reminders, limits, and supporting text blocks.", accent: "#FFD700" },
  { id: "scaling", label: "Scaling", helper: "Scaling, upcast notes, and structured draft output.", accent: "#FFCD4D" },
];

const EFFECTS_SUB_TABS: WorkspaceSubTabDef<EffectsSubTab>[] = [
  { id: "tags", label: "Tags", helper: "Add or remove helper tags and see the active set.", accent: "#9A7ABB" },
  { id: "visible-fields", label: "Visible Fields", helper: "Fill the tag-owned fields players can actually see on the card.", accent: "#B193FF" },
  { id: "tracker", label: "Tracker", helper: "Configure built-in tracker behavior and summary text.", accent: "#4ACA6A" },
  { id: "quick-rolls", label: "Quick Rolls", helper: "Edit the roll buttons players will see on the card.", accent: "#FFD166" },
  { id: "advanced", label: "Advanced", helper: "Browse all tags, optional groups, and supporting automation details.", accent: "#7A8AAA" },
];

const DELIVERY_SUB_TABS: WorkspaceSubTabDef<DeliverySubTab>[] = [
  { id: "players", label: "Players", helper: "Choose who should receive the card.", accent: "#7ACA8A" },
  { id: "node-trees", label: "Node Trees", helper: "Choose progression placement and review node capacity.", accent: "#FFD700" },
  { id: "validation", label: "Validation", helper: "Review save blockers, warnings, and final readiness.", accent: "#FF9A7A" },
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

function getActiveCustomFields(entity: { tags: string[] }, tagList: TagDefinition[]): ActiveCustomFieldEntry[] {
  const fields: ActiveCustomFieldEntry[] = [];
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

function groupCustomFieldsByTag(fields: ActiveCustomFieldEntry[]): ActiveCustomFieldGroup[] {
  const groups: ActiveCustomFieldGroup[] = [];
  const map = new Map<string, ActiveCustomFieldGroup>();
  fields.forEach((field) => {
    if (!map.has(field.tagName)) {
      const entry: ActiveCustomFieldGroup = { tagName: field.tagName, fields: [] };
      map.set(field.tagName, entry);
      groups.push(entry);
    }
    map.get(field.tagName)!.fields.push(field);
  });
  return groups;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sortStringRecord(record: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record || {}).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function hasStructuredRulesContent(builder: MechanicsBuilderState, blocks: CardSectionBlock[]) {
  return MECHANICS_BLOCKS.some((block) => builder[block.id].trim())
    || blocks.some((block) => block.title.trim() || block.content.trim());
}

function getStoredRulesMode(card: ManagedCard | null): CardRulesMode {
  const stored = (card?.customFields?.[EDITOR_RULES_MODE_KEY] || "").trim().toLowerCase();
  if (stored === "guided" || stored === "manual") return stored as CardRulesMode;
  const hasStoredBuilder = !!(card?.customFields?.[EDITOR_MECHANICS_KEY] || "").trim();
  const hasStoredBlocks = !!(card?.customFields?.[EDITOR_SECTION_BLOCKS_KEY] || "").trim();
  return hasStoredBuilder || hasStoredBlocks ? "guided" : "manual";
}

function buildEditorSnapshot(
  card: ManagedCard | null,
  builder: MechanicsBuilderState,
  blocks: CardSectionBlock[],
  rulesMode: CardRulesMode,
  isAddingNewCard: boolean,
) {
  if (!card) return "";
  return JSON.stringify({
    isAddingNewCard,
    rulesMode,
    card: {
      ...card,
      tags: [...card.tags],
      assignedTo: [...card.assignedTo],
      customFields: sortStringRecord(card.customFields || {}),
    },
    builder,
    blocks: blocks.map((block) => ({
      id: block.id,
      title: block.title,
      content: block.content,
      tone: block.tone,
    })),
  });
}

function getStructuredRulesOutput(builder: MechanicsBuilderState, blocks: CardSectionBlock[]) {
  return buildCombinedRulesHtml(builder, blocks);
}

function getResolvedRulesText(card: ManagedCard, builder: MechanicsBuilderState, blocks: CardSectionBlock[], rulesMode: CardRulesMode) {
  return rulesMode === "guided" ? getStructuredRulesOutput(builder, blocks) : card.effect || "";
}

function stripInactiveTagCustomFields(customFields: Record<string, string>, activeTags: string[], tagList: TagDefinition[]) {
  const activeKeys = new Set(getActiveCustomFields({ tags: activeTags }, tagList).map((field) => field.key));
  return Object.fromEntries(
    Object.entries(customFields || {}).filter(([key]) => {
      const owningTag = tagList.find((tag) => key.startsWith(`${tag.name}::`));
      if (!owningTag) return true;
      return activeTags.includes(owningTag.name) && activeKeys.has(key);
    }),
  );
}

function getNodeCapacityState(node: NodeTree["nodes"][number], cardId?: string | null) {
  const includesCurrentCard = !!cardId && node.cardIds.includes(cardId);
  const filledSlots = node.cardIds.length;
  const isFullForSelection = !includesCurrentCard && filledSlots >= 3;
  return {
    filledSlots,
    includesCurrentCard,
    isFullForSelection,
    remainingSlots: Math.max(0, 3 - filledSlots),
  };
}

function getCardSummary(card: ManagedCard) {
  const plain = stripHtml(card.effect || "");
  if (!plain) return "No effect text yet.";
  return plain.length > 180 ? `${plain.slice(0, 177)}...` : plain;
}

function getCardLibraryOwnerSortKey(card: ManagedCard, players: { id: string; name: string }[]) {
  if (card.assignedTo.includes("all")) return "0::all players";
  if (card.assignedTo.length === 0) return "2::unassigned";
  const ownerNames = card.assignedTo
    .map((id) => players.find((player) => player.id === id)?.name || id)
    .sort((left, right) => left.localeCompare(right))
    .join(", ")
    .toLowerCase();
  return `1::${ownerNames}`;
}

function getWorkspaceStageForPanel(panel: CardEditorPanel, mechanicsView?: MechanicsWorkspaceView): CardWorkspaceStage {
  if (panel === "preview") return "live";
  if (panel === "mechanics") {
    return mechanicsView === "automation" ? "effects" : "rules";
  }
  if (panel === "tags") return "effects";
  if (panel === "progression" || panel === "assignment") return "delivery";
  return "overview";
}

function getWorkspaceStageMeta(stage: CardWorkspaceStage) {
  return CARD_WORKSPACE_STAGES.find((entry) => entry.id === stage) || CARD_WORKSPACE_STAGES[0];
}

function getWorkspaceStageAccent(stage: CardWorkspaceStage) {
  return getWorkspaceStageMeta(stage).accent;
}

function getWorkspaceSubTabs(stage: CardWorkspaceStage) {
  if (stage === "live") return [];
  if (stage === "overview") return OVERVIEW_SUB_TABS;
  if (stage === "rules") return RULES_SUB_TABS;
  if (stage === "effects") return EFFECTS_SUB_TABS;
  return DELIVERY_SUB_TABS;
}

function getDefaultStageSubTab(stage: CardWorkspaceStage) {
  if (stage === "live") return null;
  if (stage === "overview") return OVERVIEW_SUB_TABS[0].id;
  if (stage === "rules") return RULES_SUB_TABS[0].id;
  if (stage === "effects") return EFFECTS_SUB_TABS[0].id;
  return DELIVERY_SUB_TABS[0].id;
}

function hasFilledFieldValue(value?: string | null) {
  return !!value && value.trim().length > 0;
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

function isPlayerHiddenCustomFieldKey(key: string) {
  return key.startsWith("__editor_")
    || key === "__editor_mechanics_builder"
    || key === "__editor_section_blocks"
    || key.startsWith(QUICK_ROLL_PREFIX);
}

function getPlayerFacingCardFamilyLabel(card: ManagedCard) {
  const stored = (card.customFields?.[CARD_FAMILY_KEY] || "").trim().toLowerCase();
  if (stored === "spell" || stored === "skill" || stored === "ability") {
    return stored[0].toUpperCase() + stored.slice(1);
  }
  const blob = `${card.type || ""} ${card.effect || ""} ${card.tags.join(" ")}`.toLowerCase();
  if (/(magical \(spell\)|\bspell\b|source magic)/.test(blob)) return "Spell";
  if (/\bability\b|passive|innate|granted|lineage|blood/.test(blob)) return "Ability";
  if (/\bskill\b|martial|technique|learned/.test(blob)) return "Skill";
  return "";
}

function getPlayerFacingCardComponentsDisplay(card: ManagedCard) {
  const base = (card.customFields?.[USE_PROFILE_COMPONENTS_KEY] || "").trim();
  const detail = (card.customFields?.[USE_PROFILE_COMPONENT_DETAILS_KEY] || "").trim();
  if (base && detail) return `${base} (${detail})`;
  return base || detail || "";
}

function formatPreviewInfoField(key: string, value: string): PreviewInfoField | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const [group, fieldNameRaw = ""] = key.split("::");
  const fieldName = fieldNameRaw || group;
  let label = fieldName || group;

  if (group === "Use Profile") {
    label = fieldName;
  } else if (group === "Timed Effect") {
    label = fieldName === "Effect Name" ? "Effect Name" : fieldName;
  } else if (group === "Card Tracker") {
    label = fieldName;
  }

  return { key, label, value: trimmed };
}

function buildPlayerFacingPreviewMeta(card: ManagedCard) {
  const descriptionText = (card.customFields[CARD_DESCRIPTION_KEY] || "").trim();
  const familyLabel = getPlayerFacingCardFamilyLabel(card);
  const componentValue = getPlayerFacingCardComponentsDisplay(card);
  const requirementsValue = (card.customFields?.[USE_PROFILE_REQUIREMENTS_KEY] || "").trim();
  const componentsOrRequirementsLabel = componentValue ? "Components" : requirementsValue ? "Requirements" : "";
  const componentsOrRequirementsValue = componentValue || requirementsValue;

  const primaryFacts = [
    card.customFields["Level"] ? { label: "Level", value: `Lv. ${card.customFields["Level"]}` } : null,
    familyLabel ? { label: "Family", value: familyLabel } : null,
    (card.customFields?.[USE_PROFILE_RANGE_KEY] || "").trim() ? { label: "Range", value: card.customFields[USE_PROFILE_RANGE_KEY].trim() } : null,
    componentsOrRequirementsLabel && componentsOrRequirementsValue ? { label: componentsOrRequirementsLabel, value: componentsOrRequirementsValue } : null,
    (card.customFields?.[USE_PROFILE_DURATION_KEY] || "").trim() ? { label: "Duration", value: card.customFields[USE_PROFILE_DURATION_KEY].trim() } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const hiddenKeys = new Set<string>([
    CARD_DESCRIPTION_KEY,
    "Level",
    USE_PROFILE_RANGE_KEY,
    USE_PROFILE_DURATION_KEY,
    USE_PROFILE_REQUIREMENTS_KEY,
    USE_PROFILE_COMPONENTS_KEY,
    USE_PROFILE_COMPONENT_DETAILS_KEY,
    CARD_FAMILY_KEY,
  ]);

  const useProfileFields = Object.entries(card.customFields || {})
    .filter(([key, value]) => String(value || "").trim() && key.startsWith("Use Profile::") && !hiddenKeys.has(key) && !isPlayerHiddenCustomFieldKey(key))
    .map(([key, value]) => formatPreviewInfoField(key, String(value)))
    .filter(Boolean) as PreviewInfoField[];

  const trackerFields = [
    formatPreviewInfoField(CARD_TRACKER_NAME_KEY, card.customFields?.[CARD_TRACKER_NAME_KEY] || card.name || ""),
    formatPreviewInfoField(CARD_TRACKER_DURATION_KEY, card.customFields?.[CARD_TRACKER_DURATION_KEY] || ""),
    formatPreviewInfoField(CARD_TRACKER_POTENCY_KEY, card.customFields?.[CARD_TRACKER_POTENCY_KEY] || ""),
    formatPreviewInfoField(CARD_TRACKER_DAMAGE_KEY, card.customFields?.[CARD_TRACKER_DAMAGE_KEY] || ""),
    formatPreviewInfoField(CARD_TRACKER_DESCRIPTION_KEY, card.customFields?.[CARD_TRACKER_DESCRIPTION_KEY] || ""),
    formatPreviewInfoField(CARD_TRACKER_BUFF_TYPE_KEY, card.customFields?.[CARD_TRACKER_BUFF_TYPE_KEY] || ""),
    formatPreviewInfoField(CARD_TRACKER_BUFF_TARGET_KEY, card.customFields?.[CARD_TRACKER_BUFF_TARGET_KEY] || ""),
    formatPreviewInfoField(CARD_TRACKER_BUFF_VALUE_KEY, card.customFields?.[CARD_TRACKER_BUFF_VALUE_KEY] || ""),
  ].filter(Boolean) as PreviewInfoField[];

  const timedEffectFields = Object.entries(card.customFields || {})
    .filter(([key, value]) => String(value || "").trim() && key.startsWith("Timed Effect::") && !isPlayerHiddenCustomFieldKey(key))
    .map(([key, value]) => formatPreviewInfoField(key, String(value)))
    .filter(Boolean) as PreviewInfoField[];

  const otherDetailFields = Object.entries(card.customFields || {})
    .filter(([key, value]) => {
      if (!String(value || "").trim()) return false;
      if (key.startsWith("Effect::")) return false;
      if (isPlayerHiddenCustomFieldKey(key)) return false;
      if (hiddenKeys.has(key)) return false;
      if (key.startsWith("Use Profile::")) return false;
      if (key.startsWith("Timed Effect::")) return false;
      if (key.startsWith("Card Tracker::")) return false;
      return true;
    })
    .map(([key, value]) => formatPreviewInfoField(key, String(value)))
    .filter(Boolean) as PreviewInfoField[];

  const sidebarSections = [
    useProfileFields.length > 0 ? { title: "Use Details", accent: "#6AA8FF", fields: useProfileFields } : null,
    trackerFields.length > 0 ? { title: getCardTrackerBucket(card) === "ability" ? "Tracker" : "Status Tracker", accent: getCardTrackerBucket(card) === "ability" ? "#FF8A5A" : "#4ADE80", fields: trackerFields } : null,
    timedEffectFields.length > 0 ? { title: "Timed Effect", accent: "#4ADE80", fields: timedEffectFields } : null,
    otherDetailFields.length > 0 ? { title: "More Details", accent: "#9A8CFF", fields: otherDetailFields } : null,
  ].filter(Boolean) as PreviewSidebarSection[];

  return {
    descriptionText,
    primaryFacts,
    sidebarSections,
  };
}

function getQuickRollFieldKey(slotId: string, field: string) {
  return `${QUICK_ROLL_PREFIX}${slotId}::${field}`;
}

function WorkspaceSubTabBar<T extends string>({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: WorkspaceSubTabDef<T>[];
  activeTab: T;
  onSelect: (tab: T) => void;
}) {
  const activeMeta = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  return (
    <div className={`${retro.sunken} bg-[#081022] p-4 space-y-3`} style={editorSurfaceStyle(activeMeta.accent)}>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              className={`${active ? retro.sunken + " bg-[#0A173A]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-2 text-[11px] transition-colors`}
              style={{ color: active ? tab.accent : "#8A9ABB", fontWeight: active ? 600 : 400 }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="text-[11px] leading-relaxed" style={S_SUBTLE}>
        <span style={S_TEXT_BOLD}>{activeMeta.label}:</span> {activeMeta.helper}
      </div>
    </div>
  );
}

function getQuickRollSlotIds(customFields: Record<string, string>) {
  return Array.from(new Set(
    Object.keys(customFields || {})
      .filter((key) => key.startsWith(QUICK_ROLL_PREFIX))
      .map((key) => key.replace(QUICK_ROLL_PREFIX, "").split("::")[0])
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function buildQuickRollSlots(customFields: Record<string, string>): QuickRollSlot[] {
  return getQuickRollSlotIds(customFields).map((slotId) => ({
    slotId,
    label: customFields[getQuickRollFieldKey(slotId, QUICK_ROLL_LABEL_KEY)] || "",
    expression: customFields[getQuickRollFieldKey(slotId, QUICK_ROLL_EXPRESSION_KEY)] || "",
    potency: customFields[getQuickRollFieldKey(slotId, QUICK_ROLL_POTENCY_KEY)] || "",
  }));
}

function makeQuickRollSlotId(customFields: Record<string, string>) {
  const nextIndex = getQuickRollSlotIds(customFields)
    .map((slotId) => parseInt(slotId, 10))
    .reduce((highest, value) => (Number.isNaN(value) ? highest : Math.max(highest, value)), 0) + 1;
  return String(nextIndex);
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

function withCardFamilyDefaults(card: ManagedCard, family: CardFamily, options?: { overwriteExisting?: boolean }): ManagedCard {
  const overwriteExisting = !!options?.overwriteExisting;
  const nextCustomFields: Record<string, string> = {
    ...card.customFields,
    [CARD_FAMILY_KEY]: family,
  };

  if (overwriteExisting) {
    FAMILY_CONTROLLED_PROFILE_KEYS.forEach((key) => {
      nextCustomFields[key] = "";
    });
  }

  const setFamilyDefault = (key: string, value: string) => {
    const existing = (nextCustomFields[key] || "").trim();
    if (overwriteExisting || !existing) {
      nextCustomFields[key] = value;
    }
  };

  if (family === "spell") {
    setFamilyDefault(USE_PROFILE_MAGIC_NATURE_KEY, "Magical (Spell)");
    setFamilyDefault(USE_PROFILE_COST_MODEL_KEY, "Source");
    setFamilyDefault(USE_PROFILE_PRIMARY_COST_KEY, nextCustomFields["Level"] ? `${nextCustomFields["Level"]} matching source` : "Matching source equal to spell level");
    setFamilyDefault(USE_PROFILE_COMPONENTS_KEY, "V, S, M");
    setFamilyDefault(USE_PROFILE_UPCAST_KEY, "Can spend additional matching source to raise the spell's level when allowed.");
  }

  if (family === "skill") {
    setFamilyDefault(USE_PROFILE_MAGIC_NATURE_KEY, "Non-magical or Magical (Non-spell)");
    setFamilyDefault(USE_PROFILE_COST_MODEL_KEY, "Exhaustion / Uses");
    setFamilyDefault(USE_PROFILE_PRIMARY_COST_KEY, "Usually 1-2 exhaustion");
    setFamilyDefault(USE_PROFILE_ORIGIN_KEY, "Learned / Taught");
  }

  if (family === "ability") {
    setFamilyDefault(USE_PROFILE_MAGIC_NATURE_KEY, "Inherent or Granted (Non-spell)");
    setFamilyDefault(USE_PROFILE_COST_MODEL_KEY, "Uses / Exhaustion");
    setFamilyDefault(USE_PROFILE_PRIMARY_COST_KEY, "Often uses per long rest");
    setFamilyDefault(USE_PROFILE_USES_KEY, "Usually proficiency-based or fixed uses per long rest");
    setFamilyDefault(USE_PROFILE_ORIGIN_KEY, "Innate / Granted");
    setFamilyDefault(USE_PROFILE_PASSIVE_MODE_KEY, "Passive, activatable passive, or triggered ability");
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
  if (/\bself\b|\byourself\b|\bpersonal\b/.test(textBlob)) {
    wanted.add("target self");
  }
  if (/\bally\b|\ballies\b|\bfriendly\b|\bteammate\b/.test(textBlob)) {
    wanted.add("target ally");
  }
  if (/\benemy\b|\bfoe\b|\bhostile\b/.test(textBlob)) {
    wanted.add("target enemy");
  }
  if (/\barea\b|\bzone\b|\bradius\b|\baoe\b|\bmultiple targets?\b/.test(textBlob)) {
    wanted.add("target area");
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

function withPersistedEditorStructure(
  card: ManagedCard,
  builder: MechanicsBuilderState,
  blocks: CardSectionBlock[],
  rulesMode: CardRulesMode,
  tagList: TagDefinition[],
): ManagedCard {
  const nextCustomFields = stripInactiveTagCustomFields({
    ...card.customFields,
    [EDITOR_MECHANICS_KEY]: JSON.stringify(builder),
    [EDITOR_SECTION_BLOCKS_KEY]: JSON.stringify(blocks.map((block, index) => sanitizeSectionBlock(block, index))),
    [EDITOR_RULES_MODE_KEY]: rulesMode,
  }, card.tags, tagList);
  return {
    ...card,
    effect: getResolvedRulesText(card, builder, blocks, rulesMode),
    customFields: nextCustomFields,
  };
}

function collectCardValidationIssues(
  card: ManagedCard,
  builder: MechanicsBuilderState,
  blocks: CardSectionBlock[],
  rulesMode: CardRulesMode,
  nodeTrees: NodeTree[],
  tagList: TagDefinition[],
): CardValidationIssue[] {
  const issues: CardValidationIssue[] = [];
  const pushIssue = (issue: CardValidationIssue) => issues.push(issue);
  const resolvedRulesText = getResolvedRulesText(card, builder, blocks, rulesMode);
  const strippedRulesText = stripHtml(resolvedRulesText);

  if (!card.name.trim()) {
    pushIssue({ id: "card-name", level: "error", panel: "core", message: "Card name is required." });
  }

  if (!card.type.trim()) {
    pushIssue({ id: "card-type", level: "warning", panel: "core", message: "Card type is blank. Filling it in makes the card library much easier to search and filter." });
  }

  if (!getCardFamily(card)) {
    pushIssue({ id: "card-family", level: "warning", panel: "core", message: "Pick Spell, Skill, or Ability so the card profile can stay consistent." });
  }

  if (rulesMode === "guided") {
    if (!hasStructuredRulesContent(builder, blocks) || !strippedRulesText) {
      pushIssue({ id: "guided-rules", level: "error", panel: "mechanics", mechanicsView: "rules", message: "Guided rules mode needs at least one structured rule or section block before you save." });
    }
  } else if (!strippedRulesText) {
    pushIssue({ id: "manual-rules", level: "error", panel: "mechanics", mechanicsView: "text", message: "Manual rules mode needs effect text before you save." });
  }

  if (rulesMode === "manual" && hasStructuredRulesContent(builder, blocks)) {
    pushIssue({ id: "manual-draft", level: "warning", panel: "mechanics", mechanicsView: "rules", message: "This card has a structured draft, but manual rules text is the saved source right now." });
  }

  getActiveCustomFields(card, tagList)
    .filter((field) => field.fieldDef.required)
    .forEach((field) => {
      const value = (card.customFields[field.key] || "").trim();
      if (!value) {
        pushIssue({
          id: `tag-required-${field.key}`,
          level: "error",
          panel: "tags",
          message: `${field.tagName} requires ${field.fieldName}.`,
        });
      }
    });

  buildQuickRollSlots(card.customFields || {}).forEach((slot, index) => {
    const hasAnyValue = !!(slot.label.trim() || slot.expression.trim() || slot.potency.trim());
    if (!hasAnyValue) return;
    if (!slot.label.trim()) {
      pushIssue({
        id: `quick-roll-label-${slot.slotId}`,
        level: "error",
        panel: "mechanics",
        mechanicsView: "automation",
        message: `Quick Roll #${index + 1} needs a button label.`,
      });
    }
    if (!slot.expression.trim()) {
      pushIssue({
        id: `quick-roll-expression-${slot.slotId}`,
        level: "error",
        panel: "mechanics",
        mechanicsView: "automation",
        message: `Quick Roll #${index + 1} needs a roll expression.`,
      });
    }
  });

  if (card.nodeTreeId) {
    const tree = nodeTrees.find((entry) => entry.id === card.nodeTreeId);
    if (!tree) {
      pushIssue({ id: "missing-node-tree", level: "error", panel: "progression", message: "The selected node tree no longer exists." });
    } else if (!card.nodeId) {
      pushIssue({ id: "missing-node", level: "warning", panel: "progression", message: "A node tree is selected, but no node is assigned yet." });
    } else {
      const node = tree.nodes.find((entry) => entry.id === card.nodeId);
      if (!node) {
        pushIssue({ id: "missing-selected-node", level: "error", panel: "progression", message: "The selected node no longer exists in that tree." });
      } else if (getNodeCapacityState(node, card.id).isFullForSelection) {
        pushIssue({
          id: "full-node",
          level: "error",
          panel: "progression",
          message: `${tree.name} / ${node.label} already has 3 cards. Pick another node or clear this assignment.`,
        });
      }
    }
  }

  return issues;
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
  const visibleCustomFieldGroups = groupCustomFieldsByTag(getActiveCustomFields(card, cardTags).filter((cf) => {
    const value = card.customFields[cf.key];
    return typeof value === "string" && value.trim();
  }));
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
              {card.type || "No type yet"} | {formatOwners(card.assignedTo, players)}
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

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.6fr)] gap-4">
          <div className="space-y-3">
            {(card.customFields[CARD_DESCRIPTION_KEY] || "").trim() && (
              <div>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>DESCRIPTION</div>
                <div className={`${retro.raised} bg-[#0E0E35] p-3 text-[12px]`} style={S_TEXT}>
                  <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(card.customFields[CARD_DESCRIPTION_KEY]) }} />
                </div>
              </div>
            )}
            <div>
              <div className="text-[10px] mb-2" style={S_SECTION_HDR}>EFFECT(S)</div>
              <div className={`${retro.raised} bg-[#0E0E35] p-3 min-h-[140px] text-[12px]`} style={S_TEXT}>
                {card.effect ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(card.effect) }} />
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
                <div><span style={S_MUTED}>Name:</span> <span style={S_TEXT}>{card.name || "-"}</span></div>
                <div><span style={S_MUTED}>Family:</span> <span style={S_TEXT}>{familyDef?.label || "Not set"}</span></div>
                <div><span style={S_MUTED}>Type:</span> <span style={S_TEXT}>{card.type || "-"}</span></div>
                <div><span style={S_MUTED}>Action Cost:</span> <span style={S_TEXT}>{card.actionCost || "-"}</span></div>
                <div><span style={S_MUTED}>Level:</span> <span style={S_TEXT}>{card.customFields["Level"] || "0"}</span></div>
                {(card.customFields["Source Type"] || "").trim() && <div><span style={S_MUTED}>Source Type:</span> <span style={S_TEXT}>{card.customFields["Source Type"]}</span></div>}
                <div><span style={S_MUTED}>Primary Cost:</span> <span style={S_TEXT}>{card.customFields[USE_PROFILE_PRIMARY_COST_KEY] || "-"}</span></div>
                {(card.customFields[USE_PROFILE_USES_KEY] || "").trim() && <div><span style={S_MUTED}>Uses / Rest:</span> <span style={S_TEXT}>{card.customFields[USE_PROFILE_USES_KEY]}</span></div>}
                <div><span style={S_MUTED}>Range:</span> <span style={S_TEXT}>{card.customFields[USE_PROFILE_RANGE_KEY] || "-"}</span></div>
                <div><span style={S_MUTED}>Duration:</span> <span style={S_TEXT}>{card.customFields[USE_PROFILE_DURATION_KEY] || "-"}</span></div>
              </div>
            </div>

            <div>
              <div className="text-[10px] mb-2" style={S_SECTION_HDR}>TAG FIELDS</div>
              <div className={`${retro.raised} bg-[#0E0E35] p-3 space-y-1`}>
                {visibleCustomFieldGroups.length === 0 ? (
                  <div className="text-[11px]" style={S_MUTED}>No active tag fields with values.</div>
                ) : (
                  visibleCustomFieldGroups.map((group) => (
                    <div key={group.tagName} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] px-2 py-1" style={DM_TAG_BADGE}>{group.tagName}</span>
                        <span className="text-[9px]" style={S_SUBTLE}>
                          {group.fields.length} field{group.fields.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      {group.fields.map((cf) => (
                        <div key={cf.key} className="text-[11px]">
                          <span style={S_MUTED}>{cf.fieldName}:</span> <span style={S_TEXT}>{card.customFields[cf.key]}</span>
                        </div>
                      ))}
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

function CardLibraryRail({
  collapsed,
  mobileOpen,
  onToggleCollapsed,
  onCloseMobile,
  filteredCards,
  managedCardsCount,
  editingCardId,
  players,
  cardSearch,
  onCardSearchChange,
  cardLibrarySort,
  onCardLibrarySortChange,
  cardTypeFilter,
  onCardTypeFilterChange,
  allCardTypes,
  cardTagFilter,
  onCardTagFilterChange,
  allCardTagNames,
  onOpenCard,
  onDeleteCard,
  onNewCard,
  showFilters,
  onToggleFilters,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
  filteredCards: ManagedCard[];
  managedCardsCount: number;
  editingCardId?: string | null;
  players: PlayerData[];
  cardSearch: string;
  onCardSearchChange: (value: string) => void;
  cardLibrarySort: CardLibrarySortMode;
  onCardLibrarySortChange: (value: CardLibrarySortMode) => void;
  cardTypeFilter: string;
  onCardTypeFilterChange: (value: string) => void;
  allCardTypes: string[];
  cardTagFilter: string;
  onCardTagFilterChange: (value: string) => void;
  allCardTagNames: string[];
  onOpenCard: (card: ManagedCard, panel?: CardEditorPanel) => void;
  onDeleteCard: (id: string) => void;
  onNewCard: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
}) {
  const railShellClass = `${retro.sunken} bg-[#081022]`;

  if (collapsed) {
    return (
      <div className={`${railShellClass} hidden xl:flex xl:w-[88px] xl:flex-col xl:items-center xl:gap-3 xl:p-3`}>
        <button onClick={onToggleCollapsed} className={`${retro.button} w-full px-2 py-2 text-[10px] flex items-center justify-center`} style={sectionBadgeStyle("#4A7BFF")}>
          <ChevronRight size={14} className="rotate-180" />
        </button>
        <button onClick={onNewCard} className={`${retro.button} w-full px-2 py-2 text-[10px] flex items-center justify-center`} style={S_GREEN_BTN} title="New Card">
          <Plus size={14} />
        </button>
        <div className="text-[9px] text-center" style={S_SUBTLE}>
          <div style={S_TEXT_BOLD}>{filteredCards.length}</div>
          <div>Cards</div>
        </div>
        <div className="space-y-2 w-full pr-0.5">
          {filteredCards.slice(0, 10).map((card) => {
            const selected = editingCardId === card.id;
            return (
              <button
                key={card.id}
                onClick={() => onOpenCard(card, "preview")}
                className={`${selected ? retro.sunken : retro.raised} w-full px-2 py-2 text-[10px] text-left`}
                style={panelButtonStyle(selected, "#4A7BFF")}
                title={card.name || "Untitled Card"}
              >
                <div className="truncate" style={S_TEXT_BOLD}>{card.name || "Untitled"}</div>
                <div className="truncate mt-1" style={S_MUTED}>{card.type || "No type"}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`${railShellClass} ${mobileOpen ? "block" : "hidden"} xl:block xl:w-[320px] 2xl:w-[348px] p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[12px]" style={S_SECTION_HDR}>CARD LIBRARY</div>
          <div className="text-[11px] mt-1 leading-relaxed" style={S_SUBTLE}>Search, sort, and reopen cards without leaving the preview-first workspace.</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] px-2 py-1" style={{ color: "#7A8AAA", border: "1px solid #1A1A4B", background: "#0A0A28" }}>
            {filteredCards.length}/{managedCardsCount}
          </span>
          <button onClick={onToggleCollapsed} className="hidden xl:flex hover:opacity-80" title="Collapse library">
            <ChevronRight size={14} style={S_SUBTLE} />
          </button>
          <button onClick={onCloseMobile} className="xl:hidden hover:opacity-80" title="Close library">
            <X size={14} style={S_RED} />
          </button>
        </div>
      </div>

      <button onClick={onNewCard} className={`${retro.button} w-full px-4 py-2 text-[12px] flex items-center justify-center gap-2`} style={S_GREEN_BTN}>
        <Plus size={14} /> New Card
      </button>

      <div className="space-y-2">
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={S_MUTED} />
          <input
            type="text"
            value={cardSearch}
            onChange={(e) => onCardSearchChange(e.target.value)}
            placeholder="Search cards..."
            className={`${inputClass} pl-9`}
            style={inputStyle}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onToggleFilters} className={`${retro.button} flex-1 px-3 py-2 text-[10px]`} style={sectionBadgeStyle("#6ABAFF")}>
            {showFilters ? "Hide Filters" : "Show Filters"}
          </button>
          <select value={cardLibrarySort} onChange={(e) => onCardLibrarySortChange(e.target.value as CardLibrarySortMode)} className={`${inputClass} min-w-[156px] flex-1 cursor-pointer`} style={inputStyle}>
            <option value="manual">Original</option>
            <option value="name">Name A-Z</option>
            <option value="player">By Player</option>
          </select>
        </div>
        {showFilters && (
          <div className="grid grid-cols-1 gap-2">
            <select value={cardTypeFilter} onChange={(e) => onCardTypeFilterChange(e.target.value)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
              <option value="all">All Types</option>
              {allCardTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select value={cardTagFilter} onChange={(e) => onCardTagFilterChange(e.target.value)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
              <option value="all">All Tags</option>
              {allCardTagNames.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {filteredCards.length === 0 ? (
          <div className="text-[11px] text-center py-6" style={S_MUTED}>No matching cards.</div>
        ) : (
          filteredCards.map((card) => {
            const isSelected = editingCardId === card.id;
            return (
              <div key={card.id} className={`${retro.raised} p-3.5 transition-colors`} style={{ background: isSelected ? "#111B40" : "#0E0E35", border: isSelected ? "1px solid #2A4A8A" : "1px solid #1A1A4B" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="text-[13px] leading-snug break-words" style={S_TEXT_BOLD}>{card.name || "Untitled Card"}</span>
                      {card.actionCost && <span className="text-[9px] px-1.5 py-0.5" style={DM_ACTION_BADGE}>{card.actionCost}</span>}
                      {card.customFields["Level"] && parseInt(card.customFields["Level"] || "0", 10) > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5" style={DM_LEVEL_BADGE}>Lv.{card.customFields["Level"]}</span>
                      )}
                    </div>
                    <div className="text-[11px] leading-snug mb-1 break-words" style={S_MUTED}>{card.type || "No type"}</div>
                    <div className="text-[10px] leading-snug mb-1 break-words" style={S_SUBTLE}>Assigned: {formatOwners(card.assignedTo, players)}</div>
                    <div className="text-[11px] leading-relaxed line-clamp-3 break-words" style={S_SUBTLE}>{getCardSummary(card)}</div>
                  </div>
                  <div className="flex flex-col items-stretch gap-1.5 shrink-0 self-start">
                    <button onClick={() => onOpenCard(card, "preview")} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}><Edit size={10} /></button>
                    <button onClick={() => onDeleteCard(card.id)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_RED}><Trash2 size={10} /></button>
                  </div>
                </div>
                {card.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
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
  );
}

function CardWorkspaceHeader({
  editingCard,
  isAddingNewCard,
  currentFamilyDef,
  currentProfileBadges,
  rulesMode,
  hasUnsavedChanges,
  blockingValidationIssues,
  warningValidationIssues,
  trackerLabel,
  currentStage,
  onSave,
  onClose,
  onNewCard,
  onOpenLibrary,
}: {
  editingCard: ManagedCard;
  isAddingNewCard: boolean;
  currentFamilyDef: CardFamilyDef | undefined | null;
  currentProfileBadges: string[];
  rulesMode: CardRulesMode;
  hasUnsavedChanges: boolean;
  blockingValidationIssues: CardValidationIssue[];
  warningValidationIssues: CardValidationIssue[];
  trackerLabel: string | null;
  currentStage: CardWorkspaceStage;
  onSave: () => void;
  onClose: () => void;
  onNewCard: () => void;
  onOpenLibrary: () => void;
}) {
  const stageMeta = getWorkspaceStageMeta(currentStage);
  const statusChips = [
    currentFamilyDef ? { label: currentFamilyDef.label, accent: currentFamilyDef.accent } : null,
    hasUnsavedChanges ? { label: "Unsaved Changes", accent: "#FF9A7A" } : null,
    blockingValidationIssues.length > 0
      ? { label: `${blockingValidationIssues.length} Blocking Issue${blockingValidationIssues.length === 1 ? "" : "s"}`, accent: "#FF7A7A" }
      : null,
    warningValidationIssues.length > 0
      ? { label: `${warningValidationIssues.length} Warning${warningValidationIssues.length === 1 ? "" : "s"}`, accent: "#FFD700" }
      : null,
    trackerLabel ? { label: trackerLabel, accent: "#4ACA6A" } : null,
    ...currentProfileBadges.slice(currentFamilyDef ? 1 : 0, currentFamilyDef ? 4 : 3).map((badge) => ({ label: badge, accent: "#6ABAFF" })),
  ].filter(Boolean) as Array<{ label: string; accent: string }>;

  return (
    <div className={`${retro.sunken} bg-[#081022] p-4 space-y-4`} style={editorSurfaceStyle(stageMeta.accent)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onOpenLibrary} className="xl:hidden hover:opacity-80" title="Open card library">
              <CreditCard size={14} style={S_ACCENT} />
            </button>
            <span className="text-[10px]" style={S_SECTION_HDR}>{isAddingNewCard ? "NEW CARD WORKSPACE" : "CARD EDITOR WORKSPACE"}</span>
            <span className="text-[9px] px-2 py-0.5" style={sectionBadgeStyle(stageMeta.accent)}>Stage: {stageMeta.label}</span>
          </div>
          <div className="text-[22px] leading-tight break-words" style={S_TEXT_BOLD}>{editingCard.name || "Untitled Card"}</div>
          <div className="text-[11px] leading-snug break-words" style={S_MUTED}>
            {editingCard.type || "No type"} | {editingCard.actionCost || "No action cost"} | {rulesMode === "guided" ? "Guided rules source" : "Manual rules source"}
          </div>
          <div className="flex flex-wrap gap-2">
            {statusChips.map((chip) => (
              <span key={`${chip.label}-${chip.accent}`} className="text-[10px] px-2 py-1" style={sectionBadgeStyle(chip.accent)}>
                {chip.label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
            {[
              { label: "Rules Source", value: rulesMode === "guided" ? "Guided Builder" : "Manual Text" },
              { label: "Validation", value: blockingValidationIssues.length > 0 ? `${blockingValidationIssues.length} blocking issue${blockingValidationIssues.length === 1 ? "" : "s"} to fix` : warningValidationIssues.length > 0 ? `${warningValidationIssues.length} warning${warningValidationIssues.length === 1 ? "" : "s"} to review` : "Ready to save" },
              { label: "Tracker", value: trackerLabel || "Tracker off" },
              { label: "Current Stage", value: stageMeta.label },
            ].map((item) => (
              <div key={item.label} className={`${retro.raised} bg-[#101B36] px-3.5 py-3 min-h-[60px]`} style={{ border: "1px solid #20345C" }}>
                <div className="text-[10px] uppercase tracking-[0.06em] mb-1" style={S_SECTION_HDR}>{item.label}</div>
                <div className="text-[12px] leading-snug break-words" style={S_TEXT}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 xl:justify-end">
          <button onClick={onNewCard} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_ACCENT}>
            <Plus size={14} /> New Card
          </button>
          <button onClick={onSave} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
            <Save size={14} /> {isAddingNewCard ? "Add Card" : "Save Changes"}
          </button>
          <button onClick={onClose} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_TEXT}>
            <X size={14} /> Close
          </button>
        </div>
      </div>
    </div>
  );
}

function InteractiveCardPreview({
  card,
  editingCard,
  players,
  nodeTrees,
  cardTags,
  playerFacingTagBadges,
  rulesMode,
  quickRollSlots,
  currentStage,
  previewFocusRegion,
  previewEditField,
  onStageSelect,
  onPreviewFocus,
  onPreviewEditFieldChange,
  onUpdateCardField,
  onUpdateCardCustomField,
  onRulesModeChange,
  renderTagFieldInput,
  onAddQuickRoll,
  onRemoveQuickRoll,
  stickyPreview = true,
  panelClassName = "",
}: {
  card: ManagedCard;
  editingCard: ManagedCard;
  players: PlayerData[];
  nodeTrees: NodeTree[];
  cardTags: TagDefinition[];
  playerFacingTagBadges: Array<{ tagName: string; label: string }>;
  rulesMode: CardRulesMode;
  quickRollSlots: QuickRollSlot[];
  currentStage: CardWorkspaceStage;
  previewFocusRegion: CardPreviewFocusRegion;
  previewEditField: CardPreviewEditField;
  onStageSelect: (
    stage: CardWorkspaceStage,
    focusRegion?: CardPreviewFocusRegion,
    subTab?: OverviewSubTab | RulesSubTab | EffectsSubTab | DeliverySubTab,
  ) => void;
  onPreviewFocus: (region: CardPreviewFocusRegion) => void;
  onPreviewEditFieldChange: (field: CardPreviewEditField) => void;
  onUpdateCardField: <K extends keyof ManagedCard>(key: K, value: ManagedCard[K]) => void;
  onUpdateCardCustomField: (key: string, value: string) => void;
  onRulesModeChange: (mode: CardRulesMode) => void;
  renderTagFieldInput: (cf: ActiveCustomFieldEntry) => React.ReactNode;
  onAddQuickRoll: () => void;
  onRemoveQuickRoll: (slotId: string) => void;
  stickyPreview?: boolean;
  panelClassName?: string;
}) {
  const visibleCustomFieldGroups = groupCustomFieldsByTag(getActiveCustomFields(card, cardTags).filter((cf) => hasFilledFieldValue(card.customFields[cf.key])));
  const trackerBucket = getCardTrackerBucket(editingCard);
  const trackerActive = hasBuiltInCardTracker(editingCard);
  const trackerName = editingCard.customFields[CARD_TRACKER_NAME_KEY] || editingCard.name || "Untitled Card";
  const selectedStageAccent = getWorkspaceStageAccent(currentStage);
  const selectedNodeLabel = getNodeAssignmentLabel(card, nodeTrees);
  const previewMeta = buildPlayerFacingPreviewMeta(card);
  const tagBadgeLabels = playerFacingTagBadges.length > 0 ? playerFacingTagBadges.map((badge) => badge.label) : card.tags;
  const livePreviewMode = currentStage === "live";

  const previewSectionStyle = (accent: string, active: boolean) => ({
    ...editorSurfaceStyle(active ? accent : "#223256"),
    border: active ? `1px solid ${accent}` : "1px solid #1A1A4B",
    background: active ? "linear-gradient(180deg, rgba(17,26,52,0.98) 0%, rgba(10,12,38,0.98) 100%)" : "linear-gradient(180deg, rgba(12,12,46,0.98) 0%, rgba(9,10,34,0.98) 100%)",
  });

  const focusStage = (
    stage: CardWorkspaceStage,
    region: CardPreviewFocusRegion,
    subTab?: OverviewSubTab | RulesSubTab | EffectsSubTab | DeliverySubTab,
    forceSupportingStage = false,
  ) => {
    const resolvedStage = livePreviewMode && !forceSupportingStage ? "live" : stage;
    onStageSelect(resolvedStage, region, resolvedStage === "live" ? undefined : subTab);
    onPreviewFocus(region);
    if (previewEditField && region !== previewFocusRegion) {
      onPreviewEditFieldChange(null);
    }
  };

  const beginEdit = (
    stage: CardWorkspaceStage,
    region: CardPreviewFocusRegion,
    field: CardPreviewEditField,
    subTab?: OverviewSubTab | RulesSubTab | EffectsSubTab | DeliverySubTab,
    forceSupportingStage = false,
  ) => {
    focusStage(stage, region, subTab, forceSupportingStage);
    onPreviewEditFieldChange(field);
  };

  const stopEditing = () => onPreviewEditFieldChange(null);

  return (
    <div className={`${retro.sunken} bg-[#07101F] p-6 space-y-4 ${panelClassName}`.trim()} style={editorSurfaceStyle(selectedStageAccent)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[12px]" style={S_SECTION_HDR}>LIVE CARD PREVIEW</div>
          <div className="text-[10px] mt-1" style={S_SUBTLE}>
            {livePreviewMode
              ? "Live Edit keeps the preview in focus. Click visible card sections to edit what players will actually see."
              : "Click the card like a player would read it. Common edits open directly on the preview."}
          </div>
        </div>
        <span className="text-[9px] px-2 py-1" style={sectionBadgeStyle(selectedStageAccent)}>{getWorkspaceStageMeta(currentStage).label}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { label: "Identity", stage: "overview" as CardWorkspaceStage, region: "identity" as CardPreviewFocusRegion, subTab: "identity" as OverviewSubTab, forceSupportingStage: false },
          { label: "Description", stage: "overview" as CardWorkspaceStage, region: "description" as CardPreviewFocusRegion, subTab: "identity" as OverviewSubTab, forceSupportingStage: false },
          { label: "Effect", stage: "rules" as CardWorkspaceStage, region: "rules" as CardPreviewFocusRegion, subTab: "main-effect" as RulesSubTab, forceSupportingStage: false },
          { label: "Tags", stage: "effects" as CardWorkspaceStage, region: "tags" as CardPreviewFocusRegion, subTab: "visible-fields" as EffectsSubTab, forceSupportingStage: false },
          { label: "Tracker", stage: "effects" as CardWorkspaceStage, region: "tracking" as CardPreviewFocusRegion, subTab: "tracker" as EffectsSubTab, forceSupportingStage: false },
          { label: "Delivery", stage: "delivery" as CardWorkspaceStage, region: "delivery" as CardPreviewFocusRegion, subTab: "players" as DeliverySubTab, forceSupportingStage: true },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => focusStage(item.stage, item.region, item.subTab, item.forceSupportingStage)}
            className={`${retro.button} px-3 py-1.5 text-[10px]`}
            style={sectionBadgeStyle(getWorkspaceStageAccent(item.stage))}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-5 space-y-4`} style={previewSectionStyle("#4A7BFF", previewFocusRegion === "identity" || previewFocusRegion === "description" || previewFocusRegion === "rules" || previewFocusRegion === "scaling")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button type="button" onClick={() => focusStage("overview", "identity", "identity")} className="text-left flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[22px] leading-tight" style={S_TEXT_BOLD}>{card.name || "Untitled Card"}</span>
              {card.actionCost && <span className="text-[10px] px-2 py-1" style={DM_ACTION_BADGE}>{card.actionCost}</span>}
              {card.customFields["Level"] && parseInt(card.customFields["Level"] || "0", 10) > 0 && (
                <span className="text-[10px] px-2 py-1" style={DM_LEVEL_BADGE}>Lv.{card.customFields["Level"]}</span>
              )}
              {card.customFields["Source Type"] && <span className="text-[10px] px-2 py-1" style={DM_TAG_BADGE}>{card.customFields["Source Type"]}</span>}
            </div>
            <div className="text-[12px] leading-snug break-words" style={S_MUTED}>
              {card.type || "No type"} | {formatOwners(card.assignedTo, players)}
            </div>
          </button>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button type="button" onClick={(e) => { e.stopPropagation(); beginEdit("overview", "identity", "identity", "identity"); }} className={`${retro.button} px-2.5 py-1 text-[10px]`} style={sectionBadgeStyle("#4A7BFF")}>
              Edit Identity
            </button>
            <button type="button" onClick={() => focusStage("delivery", "delivery", "players", true)} className={`${retro.button} px-2.5 py-1 text-[10px]`} style={sectionBadgeStyle("#7ACA8A")}>
              Delivery
            </button>
          </div>
        </div>

        {tagBadgeLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tagBadgeLabels.map((badge) => (
              <span key={badge} className="text-[10px] px-2 py-0.5" style={DM_TAG_BADGE}>{badge}</span>
            ))}
          </div>
        )}

        {previewMeta.primaryFacts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-2">
            {previewMeta.primaryFacts.map((fact) => (
              <button
                key={fact.label}
                type="button"
                onClick={() => focusStage("overview", "identity", fact.label === "Level" ? "identity" : "profile")}
                className={`${retro.raised} px-2.5 py-2 min-h-[52px] text-left`}
                style={{ background: "rgba(12,18,46,0.94)", border: "1px solid #1A315A" }}
              >
                <div className="text-[8px] uppercase tracking-[0.07em] mb-0.5" style={S_MUTED}>{fact.label}</div>
                <div className="text-[10px] leading-snug break-words" style={{ ...S_TEXT, fontWeight: 600 }}>{fact.value}</div>
              </button>
            ))}
          </div>
        )}

        {previewEditField === "identity" && (
          <div className={`${retro.sunken} bg-[#0A0A28] p-3 space-y-3`} onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] block mb-1" style={labelStyle}>Card Name</label>
                <input type="text" value={editingCard.name} onChange={(e) => onUpdateCardField("name", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] block mb-1" style={labelStyle}>Card Type</label>
                <input type="text" value={editingCard.type} onChange={(e) => onUpdateCardField("type", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] block mb-1" style={labelStyle}>Action Cost</label>
                <input type="text" value={editingCard.actionCost} onChange={(e) => onUpdateCardField("actionCost", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] block mb-1" style={labelStyle}>Level</label>
                <input type="number" min="0" value={editingCard.customFields["Level"] || ""} onChange={(e) => onUpdateCardCustomField("Level", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] block mb-1" style={labelStyle}>Source Type</label>
                <input type="text" value={editingCard.customFields["Source Type"] || ""} onChange={(e) => onUpdateCardCustomField("Source Type", e.target.value)} className={inputClass} style={inputStyle} />
              </div>
            </div>
            <button type="button" onClick={stopEditing} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_ACCENT}>Done</button>
          </div>
        )}

        <div className="h-[1px] w-full" style={{ background: "linear-gradient(90deg, transparent, rgba(122,154,200,0.45), transparent)" }} />

        <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.58fr)_minmax(320px,1fr)] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <div className={`${retro.sunken} p-4`} style={previewSectionStyle("#6ABAFF", previewFocusRegion === "description" || previewEditField === "description")}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <button type="button" onClick={() => focusStage("overview", "description", "identity")} className="text-left">
                  <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#7FA6FF", fontWeight: 700 }}>Description</div>
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); beginEdit("overview", "description", "description", "identity"); }} className={`${retro.button} px-2.5 py-1 text-[10px]`} style={sectionBadgeStyle("#6ABAFF")}>
                  {hasFilledFieldValue(card.customFields[CARD_DESCRIPTION_KEY]) ? "Edit" : "Add Description"}
                </button>
              </div>
              {previewEditField === "description" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <RichTextEditor
                    value={editingCard.customFields[CARD_DESCRIPTION_KEY] || ""}
                    onChange={(html) => onUpdateCardCustomField(CARD_DESCRIPTION_KEY, html)}
                    placeholder="Write the player-facing description..."
                    minHeight={150}
                  />
                  <button type="button" onClick={stopEditing} className={`${retro.button} mt-3 px-3 py-1.5 text-[10px]`} style={S_ACCENT}>Done</button>
                </div>
              ) : hasFilledFieldValue(card.customFields[CARD_DESCRIPTION_KEY]) ? (
                <div className="text-[12px] leading-relaxed" style={S_TEXT}>
                  <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(card.customFields[CARD_DESCRIPTION_KEY]) }} />
                </div>
              ) : (
                <button type="button" onClick={() => beginEdit("overview", "description", "description", "identity")} className="w-full text-left text-[11px]" style={S_MUTED}>
                  Add description
                </button>
              )}
            </div>

            <div className={`${retro.sunken} p-4`} style={previewSectionStyle("#FFD166", previewFocusRegion === "rules" || previewEditField === "effect")}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <button type="button" onClick={() => focusStage("rules", "rules", "main-effect")} className="text-left">
                  <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#8AB8FF", fontWeight: 700 }}>Effect</div>
                  <div className="text-[10px]" style={S_SUBTLE}>{rulesMode === "guided" ? "Guided Builder saves the effect text" : "Manual Text saves the effect text"}</div>
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); beginEdit("rules", "rules", "effect", "main-effect"); }} className={`${retro.button} px-2.5 py-1 text-[10px]`} style={sectionBadgeStyle("#FFD166")}>
                  {hasFilledFieldValue(card.effect) ? "Edit" : "Add Effect"}
                </button>
              </div>
              {previewEditField === "effect" ? (
                rulesMode === "manual" ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <RichTextEditor value={editingCard.effect} onChange={(html) => onUpdateCardField("effect", html)} placeholder="Write the card's main effect..." minHeight={220} />
                    <button type="button" onClick={stopEditing} className={`${retro.button} mt-3 px-3 py-1.5 text-[10px]`} style={S_ACCENT}>Done</button>
                  </div>
                ) : (
                  <div className={`${retro.sunken} bg-[#0A0A28] p-3 space-y-3`} onClick={(e) => e.stopPropagation()}>
                    <div className="text-[11px]" style={S_SUBTLE}>Guided Builder currently owns the saved effect text. Switch to Manual Text if you want to type directly here.</div>
                    <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { onRulesModeChange("manual"); beginEdit("rules", "rules", "effect", "main-effect"); }} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_ACCENT}>Switch to Manual Text</button>
                      <button type="button" onClick={stopEditing} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_TEXT}>Close</button>
                    </div>
                  </div>
                )
              ) : hasFilledFieldValue(card.effect) ? (
                <div className="min-h-[160px] text-[12px] leading-relaxed" style={S_TEXT}>
                  <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(card.effect) }} />
                </div>
              ) : (
                <button type="button" onClick={() => beginEdit("rules", "rules", "effect", "main-effect")} className="w-full text-left text-[11px]" style={S_MUTED}>
                  Add effect
                </button>
              )}
            </div>

            <div className={`${retro.sunken} p-4`} style={previewSectionStyle("#FFD700", previewFocusRegion === "scaling" || previewEditField === "scaling")}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <button type="button" onClick={() => focusStage("rules", "scaling", "scaling")} className="text-left">
                  <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#FFD700", fontWeight: 700 }}>Scaling</div>
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); beginEdit("rules", "scaling", "scaling", "scaling"); }} className={`${retro.button} px-2.5 py-1 text-[10px]`} style={sectionBadgeStyle("#FFD700")}>
                  {hasFilledFieldValue(card.customFields[USE_PROFILE_UPCAST_KEY]) ? "Edit" : "Add Scaling"}
                </button>
              </div>
              {previewEditField === "scaling" ? (
                <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editingCard.customFields[USE_PROFILE_UPCAST_KEY] || ""}
                    onChange={(e) => onUpdateCardCustomField(USE_PROFILE_UPCAST_KEY, e.target.value)}
                    placeholder="Describe the scaling or upcast behavior..."
                    className={inputClass}
                    style={inputStyle}
                  />
                  <button type="button" onClick={stopEditing} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_ACCENT}>Done</button>
                </div>
              ) : hasFilledFieldValue(card.customFields[USE_PROFILE_UPCAST_KEY]) ? (
                <div className="text-[11px]" style={S_TEXT}>{card.customFields[USE_PROFILE_UPCAST_KEY]}</div>
              ) : (
                <button type="button" onClick={() => beginEdit("rules", "scaling", "scaling", "scaling")} className="w-full text-left text-[11px]" style={S_MUTED}>
                  Add scaling
                </button>
              )}
            </div>

            <div className={`${retro.sunken} p-4`} style={previewSectionStyle("#FFD166", previewFocusRegion === "quick-rolls" || previewEditField === "quick-rolls")}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <button type="button" onClick={() => focusStage("effects", "quick-rolls", "quick-rolls")} className="text-left">
                  <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#FFD166", fontWeight: 700 }}>Quick Rolls</div>
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); quickRollSlots.length === 0 ? onAddQuickRoll() : beginEdit("effects", "quick-rolls", "quick-rolls", "quick-rolls"); }} className={`${retro.button} px-2.5 py-1 text-[10px]`} style={sectionBadgeStyle("#FFD166")}>
                  {quickRollSlots.length === 0 ? "Add Quick Roll" : "Edit Quick Rolls"}
                </button>
              </div>
              {previewEditField === "quick-rolls" ? (
                <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                  {quickRollSlots.map((slot, index) => (
                    <div key={slot.slotId} className={`${retro.raised} bg-[#0E0E35] p-3 space-y-2`} style={editorSurfaceStyle("#FFD166")}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px]" style={S_TEXT_BOLD}>Quick Roll {index + 1}</div>
                        <button type="button" onClick={() => onRemoveQuickRoll(slot.slotId)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_RED}>Remove</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input type="text" value={slot.label} onChange={(e) => onUpdateCardCustomField(getQuickRollFieldKey(slot.slotId, QUICK_ROLL_LABEL_KEY), e.target.value)} placeholder="Button label" className={inputClass} style={inputStyle} />
                        <input type="text" value={slot.expression} onChange={(e) => onUpdateCardCustomField(getQuickRollFieldKey(slot.slotId, QUICK_ROLL_EXPRESSION_KEY), e.target.value)} placeholder="Roll expression" className={inputClass} style={inputStyle} />
                        <input type="text" value={slot.potency} onChange={(e) => onUpdateCardCustomField(getQuickRollFieldKey(slot.slotId, QUICK_ROLL_POTENCY_KEY), e.target.value)} placeholder="Potency override" className={inputClass} style={inputStyle} />
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onAddQuickRoll} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={sectionBadgeStyle("#FFD166")}>Add Another Quick Roll</button>
                    <button type="button" onClick={stopEditing} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_ACCENT}>Done</button>
                  </div>
                </div>
              ) : quickRollSlots.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {quickRollSlots.map((slot) => (
                    <button key={slot.slotId} type="button" onClick={() => beginEdit("effects", "quick-rolls", "quick-rolls", "quick-rolls")} className={`${retro.button} px-3 py-2 text-[10px]`} style={sectionBadgeStyle("#FFD166")}>
                      <Dices size={11} className="inline mr-1" /> {slot.label || "Roll"}: {slot.expression || "No expression"}
                    </button>
                  ))}
                </div>
              ) : (
                <button type="button" onClick={onAddQuickRoll} className="w-full text-left text-[11px]" style={S_MUTED}>
                  Add quick roll
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3 min-w-0">
            <div className={`${retro.raised} p-3 space-y-3`} style={previewSectionStyle("#9A7ABB", previewFocusRegion === "tags" || previewEditField?.startsWith("tag:") || currentStage === "effects")}>
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => focusStage("effects", "tags", visibleCustomFieldGroups.length > 0 ? "visible-fields" : "tags")} className="text-left">
                  <div className="text-[10px]" style={S_SECTION_HDR}>VISIBLE TAG FIELDS</div>
                  <div className="text-[10px]" style={S_SUBTLE}>{visibleCustomFieldGroups.length > 0 ? `${visibleCustomFieldGroups.length} group${visibleCustomFieldGroups.length === 1 ? "" : "s"} visible` : `${card.tags.length} active tag${card.tags.length === 1 ? "" : "s"}`}</div>
                </button>
                <button type="button" onClick={() => focusStage("effects", "tags", visibleCustomFieldGroups.length > 0 ? "visible-fields" : "tags", visibleCustomFieldGroups.length === 0)} className={`${retro.button} px-2.5 py-1 text-[10px]`} style={sectionBadgeStyle("#9A7ABB")}>
                  {visibleCustomFieldGroups.length > 0 ? "Manage Fields" : "Add Tags"}
                </button>
              </div>
              {visibleCustomFieldGroups.length === 0 ? (
                <div className="text-[11px]" style={S_MUTED}>{card.tags.length === 0 ? "Add tags to expose visible helper fields." : "No visible tag field values yet."}</div>
              ) : (
                <div className="space-y-3">
                  {visibleCustomFieldGroups.map((group) => (
                    <div key={group.tagName} className={`${retro.sunken} bg-[#0A0A28] p-3 space-y-2`}>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] px-2 py-1" style={DM_TAG_BADGE}>{group.tagName}</span>
                        <span className="text-[9px]" style={S_SUBTLE}>{group.fields.length} field{group.fields.length === 1 ? "" : "s"}</span>
                      </div>
                      {group.fields.map((field) => {
                        const editKey = `tag:${field.key}` as const;
                        return (
                          <div key={field.key} className="space-y-2">
                            {previewEditField === editKey ? (
                              <div onClick={(e) => e.stopPropagation()}>
                                {renderTagFieldInput(field)}
                                <button type="button" onClick={stopEditing} className={`${retro.button} mt-2 px-3 py-1.5 text-[10px]`} style={S_ACCENT}>Done</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <button type="button" onClick={() => focusStage("effects", "tags", "visible-fields")} className="text-left min-w-0 flex-1">
                                  <div className="text-[10px]" style={S_MUTED}>{field.fieldName}</div>
                                  <div className="text-[11px] break-words" style={S_TEXT}>{card.customFields[field.key]}</div>
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); beginEdit("effects", "tags", editKey, "visible-fields"); }} className={`${retro.button} px-2.5 py-1 text-[10px]`} style={sectionBadgeStyle("#9A7ABB")}>
                                  Edit
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {previewMeta.sidebarSections.map((section) => {
              const isTrackerSection = section.title === "Tracker" || section.title === "Status Tracker";
              return (
                <div key={section.title} className={`${retro.raised} p-3 space-y-3`} style={previewSectionStyle(section.accent, isTrackerSection ? previewFocusRegion === "tracking" || previewEditField === "tracker" : currentStage === "overview")}>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => focusStage(isTrackerSection ? "effects" : "overview", isTrackerSection ? "tracking" : "identity", isTrackerSection ? "tracker" : "profile")}
                      className="text-left"
                    >
                      <div className="text-[10px]" style={S_SECTION_HDR}>{section.title.toUpperCase()}</div>
                    </button>
                    {isTrackerSection && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); beginEdit("effects", "tracking", "tracker", "tracker"); }} className={`${retro.button} px-2.5 py-1 text-[10px]`} style={sectionBadgeStyle(section.accent)}>
                        {trackerActive ? "Edit Tracker" : "Add Tracker"}
                      </button>
                    )}
                  </div>
                  {isTrackerSection && previewEditField === "tracker" ? (
                    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <select value={editingCard.customFields[CARD_TRACKER_BUCKET_KEY] || ""} onChange={(e) => onUpdateCardCustomField(CARD_TRACKER_BUCKET_KEY, e.target.value)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                          <option value="">Not tracked</option>
                          <option value="status">Status Effect</option>
                          <option value="ability">Ability / Card Effect</option>
                        </select>
                        <input type="text" value={editingCard.customFields[CARD_TRACKER_NAME_KEY] || ""} onChange={(e) => onUpdateCardCustomField(CARD_TRACKER_NAME_KEY, e.target.value)} placeholder="Tracker name" className={inputClass} style={inputStyle} />
                        <input type="text" value={editingCard.customFields[CARD_TRACKER_DURATION_KEY] || ""} onChange={(e) => onUpdateCardCustomField(CARD_TRACKER_DURATION_KEY, e.target.value)} placeholder="Duration" className={inputClass} style={inputStyle} />
                        <input type="text" value={editingCard.customFields[CARD_TRACKER_POTENCY_KEY] || ""} onChange={(e) => onUpdateCardCustomField(CARD_TRACKER_POTENCY_KEY, e.target.value)} placeholder="Potency" className={inputClass} style={inputStyle} />
                        <input type="text" value={editingCard.customFields[CARD_TRACKER_DAMAGE_KEY] || ""} onChange={(e) => onUpdateCardCustomField(CARD_TRACKER_DAMAGE_KEY, e.target.value)} placeholder="Damage / roll" className={inputClass} style={inputStyle} />
                        <input type="text" value={editingCard.customFields[CARD_TRACKER_DESCRIPTION_KEY] || ""} onChange={(e) => onUpdateCardCustomField(CARD_TRACKER_DESCRIPTION_KEY, e.target.value)} placeholder="Visible tracker text" className={inputClass} style={inputStyle} />
                      </div>
                      <button type="button" onClick={stopEditing} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_ACCENT}>Done</button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {section.fields.map((field) => (
                        <div key={field.key}>
                          <div className="text-[9px]" style={S_MUTED}>{field.label}</div>
                          <div className="text-[11px] leading-snug break-words" style={S_TEXT}>{field.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`${retro.raised} p-4 space-y-3`} style={previewSectionStyle("#7ACA8A", previewFocusRegion === "delivery" || currentStage === "delivery")}>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => focusStage("delivery", "delivery", "players", true)} className="text-left">
            <div className="text-[10px]" style={S_SECTION_HDR}>DM DELIVERY SNAPSHOT</div>
            <div className="text-[10px]" style={S_SUBTLE}>{formatOwners(card.assignedTo, players)} | {selectedNodeLabel}</div>
          </button>
          <button type="button" onClick={() => focusStage("delivery", "delivery", "players", true)} className={`${retro.button} px-2.5 py-1 text-[10px]`} style={sectionBadgeStyle("#7ACA8A")}>
            {card.assignedTo.length === 0 && !card.nodeTreeId ? "Add Assignment" : "Manage Delivery"}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className={`${retro.sunken} bg-[#0A0A28] p-3`}>
            <div className="text-[10px] mb-1" style={S_SECTION_HDR}>PLAYERS</div>
            <div style={S_TEXT}>{formatOwners(card.assignedTo, players)}</div>
          </div>
          <div className={`${retro.sunken} bg-[#0A0A28] p-3`}>
            <div className="text-[10px] mb-1" style={S_SECTION_HDR}>NODE TREE</div>
            <div style={S_TEXT}>{selectedNodeLabel}</div>
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
  const [dmCardsSubTab, setDmCardsSubTab] = useState<"cards" | "magic" | "levelabilities">("cards");
  const [editingCard, setEditingCard] = useState<ManagedCard | null>(null);
  const [isAddingNewCard, setIsAddingNewCard] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  const [cardTagFilter, setCardTagFilter] = useState<string>("all");
  const [cardTypeFilter, setCardTypeFilter] = useState<string>("all");
  const [cardLibrarySort, setCardLibrarySort] = useState<CardLibrarySortMode>("manual");
  const [editorPanel, setEditorPanel] = useState<CardEditorPanel>("preview");
  const [workspaceStage, setWorkspaceStage] = useState<CardWorkspaceStage>("live");
  const [overviewSubTab, setOverviewSubTab] = useState<OverviewSubTab>("identity");
  const [rulesSubTab, setRulesSubTab] = useState<RulesSubTab>("main-effect");
  const [effectsSubTab, setEffectsSubTab] = useState<EffectsSubTab>("tags");
  const [deliverySubTab, setDeliverySubTab] = useState<DeliverySubTab>("players");
  const [previewFocusRegion, setPreviewFocusRegion] = useState<CardPreviewFocusRegion>(null);
  const [previewEditField, setPreviewEditField] = useState<CardPreviewEditField>(null);
  const [isCardLibraryCollapsed, setIsCardLibraryCollapsed] = useState(false);
  const [isCardLibraryMobileOpen, setIsCardLibraryMobileOpen] = useState(false);
  const [showCardLibraryFilters, setShowCardLibraryFilters] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<CardTemplateDef | null>(null);
  const [mechanicsBuilder, setMechanicsBuilder] = useState<MechanicsBuilderState>(EMPTY_MECHANICS_BUILDER);
  const [cardSectionBlocks, setCardSectionBlocks] = useState<CardSectionBlock[]>([]);
  const [rulesMode, setRulesMode] = useState<CardRulesMode>("manual");
  const [mechanicsView, setMechanicsView] = useState<MechanicsWorkspaceView>("rules");
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionTone, setNewSectionTone] = useState<CardSectionTone>("rules");
  const [tagSearch, setTagSearch] = useState("");
  const [tagFilterMode, setTagFilterMode] = useState<TagFilterMode>("all");
  const [showAdvancedProfile, setShowAdvancedProfile] = useState(false);
  const [showOptionalTagGroups, setShowOptionalTagGroups] = useState(false);
  const [showDeliveryDetails, setShowDeliveryDetails] = useState(false);
  const [magicSelectedPlayerId, setMagicSelectedPlayerId] = useState<string>("");
  const [magicLists, setMagicLists] = useState<PlayerMagicList[]>([]);
  const [magicEditingList, setMagicEditingList] = useState<string | null>(null);
  const [magicNewListName, setMagicNewListName] = useState("");
  const [magicAddingList, setMagicAddingList] = useState(false);
  const [magicCollapsedLists, setMagicCollapsedLists] = useState<Set<string>>(new Set());
  const [magicEditingDesc, setMagicEditingDesc] = useState<string | null>(null);
  const [laSelectedPlayerId, setLaSelectedPlayerId] = useState<string>("");
  const [levelCategories, setLevelCategories] = useState<LevelCategory[]>([]);
  const [laEditingLevel, setLaEditingLevel] = useState<string | null>(null);
  const [laNewLevelName, setLaNewLevelName] = useState("");
  const [laAddingLevel, setLaAddingLevel] = useState(false);
  const [laCollapsedLevels, setLaCollapsedLevels] = useState<Set<string>>(new Set());
  const [laEditingDesc, setLaEditingDesc] = useState<string | null>(null);
  const [laCopyConfirm, setLaCopyConfirm] = useState(false);
  const [showRequirementsField, setShowRequirementsField] = useState(false);
  const editorBaselineRef = useRef("");

  const renderTypedField = useCallback((
    key: string,
    fieldDef: TagField,
    value: string,
    onChange: (key: string, val: string) => void,
    labelEl: React.ReactNode,
  ) => renderTypedFieldShared(key, fieldDef, value, onChange, labelEl, inputClass, inputStyle, retro.button), []);

  useEffect(() => {
    if (dmCardsSubTab === "magic" && !magicSelectedPlayerId && players.length > 0) {
      setMagicSelectedPlayerId(players[0].id);
    }
  }, [dmCardsSubTab, magicSelectedPlayerId, players]);

  useEffect(() => {
    if (dmCardsSubTab === "levelabilities" && !laSelectedPlayerId && players.length > 0) {
      setLaSelectedPlayerId(players[0].id);
    }
  }, [dmCardsSubTab, laSelectedPlayerId, players]);

  useEffect(() => {
    if (!editingCard) {
      setMechanicsBuilder(EMPTY_MECHANICS_BUILDER);
      setCardSectionBlocks([]);
      setRulesMode("manual");
      setMechanicsView("rules");
      setWorkspaceStage("live");
      setOverviewSubTab("identity");
      setRulesSubTab("main-effect");
      setEffectsSubTab("tags");
      setDeliverySubTab("players");
      setPreviewFocusRegion(null);
      setPreviewEditField(null);
      setNewSectionTitle("");
      setNewSectionTone("rules");
      setShowRequirementsField(false);
      setShowAdvancedProfile(false);
      setShowOptionalTagGroups(false);
      setShowDeliveryDetails(false);
      editorBaselineRef.current = "";
      return;
    }

    const storedBuilder = parseStoredMechanicsBuilder(editingCard);
    const storedBlocks = parseStoredSectionBlocks(editingCard);
    const storedRulesMode = getStoredRulesMode(editingCard);
    setMechanicsBuilder(storedBuilder);
    setCardSectionBlocks(storedBlocks);
    setRulesMode(storedRulesMode);
    setMechanicsView(storedRulesMode === "manual" ? "text" : "rules");
    setWorkspaceStage("live");
    setOverviewSubTab("identity");
    setRulesSubTab(storedRulesMode === "manual" ? "main-effect" : "builder");
    setEffectsSubTab("tags");
    setDeliverySubTab("players");
    setPreviewFocusRegion(null);
    setPreviewEditField(null);
    setNewSectionTitle("");
    setNewSectionTone("rules");
    setShowRequirementsField(!!(editingCard.customFields[USE_PROFILE_REQUIREMENTS_KEY] || "").trim());
    setShowAdvancedProfile(false);
    setShowOptionalTagGroups(false);
    setShowDeliveryDetails(false);
  }, [editingCard?.id]);

  const quickRollSlots = useMemo(() => editingCard ? buildQuickRollSlots(editingCard.customFields || {}) : [], [editingCard]);
  const currentEditorSnapshot = useMemo(
    () => buildEditorSnapshot(editingCard, mechanicsBuilder, cardSectionBlocks, rulesMode, isAddingNewCard),
    [editingCard, mechanicsBuilder, cardSectionBlocks, rulesMode, isAddingNewCard],
  );
  const hasUnsavedChanges = !!editingCard && currentEditorSnapshot !== editorBaselineRef.current;

  const saveMagicLists = useCallback(async (lists: PlayerMagicList[]) => {
    if (!magicSelectedPlayerId) return;
    try {
      setDmError(null);
      const normalized = normalizeMagicLists(lists);
      await saveDMPlayerMagicLists(magicSelectedPlayerId, normalized);
      setMagicLists(normalized);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to save magic lists"));
      throw err;
    }
  }, [magicSelectedPlayerId, setDmError]);

  const saveLevelCategories = useCallback(async (cats: LevelCategory[]) => {
    if (!laSelectedPlayerId) return;
    try {
      setDmError(null);
      const normalized = normalizeLevelCategories(
        sortLevelCategories(cats).map((level, index) => ({ ...level, order: index })),
        managedCards,
      );
      await saveDMPlayerLevelCategories(laSelectedPlayerId, normalized);
      setLevelCategories(normalized);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to save level categories"));
      throw err;
    }
  }, [laSelectedPlayerId, managedCards, setDmError]);

  const copyLevelCategoriesToAllPlayers = useCallback(async () => {
    if (!laSelectedPlayerId) return;
    try {
      setDmError(null);
      const currentCats = normalizeLevelCategories(
        await loadDMPlayerLevelCategories(laSelectedPlayerId) as LevelCategory[],
        managedCards,
      );
      for (const p of players) {
        if (p.id !== laSelectedPlayerId) {
          await saveDMPlayerLevelCategories(p.id, JSON.parse(JSON.stringify(currentCats)));
        }
      }
      setLaCopyConfirm(false);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to copy level categories to all players"));
    }
  }, [laSelectedPlayerId, managedCards, players, setDmError]);

  useEffect(() => {
    let cancelled = false;
    async function loadMagicListsForPlayer() {
      if (!magicSelectedPlayerId) return;
      try {
        const existing = normalizeMagicLists(
          await loadDMPlayerMagicLists(magicSelectedPlayerId) as PlayerMagicList[],
        );
        if (cancelled) return;
        setMagicLists(existing);
        setMagicEditingList(null);
        setMagicAddingList(false);
        setMagicNewListName("");
        setMagicCollapsedLists(new Set());
        setMagicEditingDesc(null);
      } catch (err) {
        if (!cancelled) {
          setDmError(getSaveError(err, "Failed to load magic lists"));
        }
      }
    }
    void loadMagicListsForPlayer();
    return () => { cancelled = true; };
  }, [magicSelectedPlayerId, setDmError]);

  useEffect(() => {
    let cancelled = false;
    async function loadLevelCategories() {
      if (!laSelectedPlayerId) return;
      try {
        const existing = normalizeLevelCategories(
          await loadDMPlayerLevelCategories(laSelectedPlayerId) as LevelCategory[],
          managedCards,
        );
        const playerProfile = players.find((pl) => pl.id === laSelectedPlayerId);
        let cats = existing;
        if (playerProfile) {
          const requiredNames = ["Race", ...Array.from({ length: Math.max(0, playerProfile.level) }, (_, i) => `Level ${i + 1}`)];
          const existingNames = new Set(cats.map((level) => level.name.trim().toLowerCase()));
          const missing = requiredNames
            .filter((name) => !existingNames.has(name.trim().toLowerCase()))
            .map((name, index) => ({
              id: `lvl-${Date.now()}-${index}-${name.toLowerCase().replace(/\s+/g, "-")}`,
              name,
              order: cats.length + index,
              cardEntries: [],
              description: "",
            } satisfies LevelCategory));

          if (cats.length === 0 && missing.length === 0 && playerProfile.level > 0) {
            cats = requiredNames.map((name, index) => ({
              id: `lvl-${Date.now()}-${index}-${name.toLowerCase().replace(/\s+/g, "-")}`,
              name,
              order: index,
              cardEntries: [],
              description: "",
            }));
          } else if (missing.length > 0) {
            cats = [...cats, ...missing];
          }
        }

        cats = sortLevelCategories(cats).map((level, index) => ({ ...level, order: index }));
        if (
          cats.length !== existing.length ||
          cats.some((level, index) => {
            const prior = existing[index];
            return !prior || prior.id !== level.id || prior.order !== level.order || prior.name !== level.name;
          })
        ) {
          await saveDMPlayerLevelCategories(laSelectedPlayerId, cats);
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
  }, [laSelectedPlayerId, managedCards, players, setDmError]);

  const confirmDiscardUnsavedChanges = useCallback((destination: string) => {
    if (!hasUnsavedChanges) return true;
    return window.confirm(`You have unsaved card changes. Are you sure you want to leave for ${destination}?`);
  }, [hasUnsavedChanges]);

  const handleAddCard = () => {
    selectWorkspaceStage("live", null);
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
    if (!confirmDiscardUnsavedChanges("a new card")) return;
    const preferredFamily = familyOverride || template.defaultFamily || "";
    const nextCard = preferredFamily
      ? withCardFamilyDefaults(createCardFromTemplate({ ...template, defaultFamily: preferredFamily }, cardTags), preferredFamily)
      : createCardFromTemplate(template, cardTags);
    const nextBuilder = parseStoredMechanicsBuilder(nextCard);
    const nextBlocks = parseStoredSectionBlocks(nextCard);
    const nextRulesMode = getStoredRulesMode(nextCard);

    setEditingCard(nextCard);
    setIsAddingNewCard(true);
    setMechanicsBuilder(nextBuilder);
    setCardSectionBlocks(nextBlocks);
    setRulesMode(nextRulesMode);
    setMechanicsView(nextRulesMode === "manual" ? "text" : "rules");
    selectWorkspaceStage("live", "identity");
    setEditorPanel("preview");
    setPendingTemplate(null);
    setShowTemplatePicker(false);
    setIsCardLibraryMobileOpen(false);
    editorBaselineRef.current = buildEditorSnapshot(nextCard, nextBuilder, nextBlocks, nextRulesMode, true);
  };

  const handleSaveCard = async () => {
    if (!editingCard) return;
    if (blockingValidationIssues.length > 0) {
      const firstIssue = blockingValidationIssues[0];
      focusValidationIssue(firstIssue);
      setDmError(`Please fix ${blockingValidationIssues.length} card issue${blockingValidationIssues.length === 1 ? "" : "s"} before saving.`);
      return;
    }
    try {
      setDmError(null);
      const cardToSave = withPersistedEditorStructure(editingCard, mechanicsBuilder, cardSectionBlocks, rulesMode, cardTags);
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
            if (getNodeCapacityState(node, cardToSave.id).isFullForSelection) return node;
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
      editorBaselineRef.current = buildEditorSnapshot(cardToSave, mechanicsBuilder, cardSectionBlocks, rulesMode, false);
      setIsAddingNewCard(false);
      setShowTemplatePicker(false);
      setPendingTemplate(null);
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
        editorBaselineRef.current = "";
      }
    } catch (err) {
      setDmError(getSaveError(err, "Failed to delete card"));
    }
  };

  const handleCancelCardEdit = () => {
    if (!confirmDiscardUnsavedChanges("closing the card editor")) return;
    setEditingCard(null);
    setIsAddingNewCard(false);
    setShowTemplatePicker(false);
    setPendingTemplate(null);
    selectWorkspaceStage("live", null);
    setEditorPanel("preview");
    editorBaselineRef.current = "";
  };

  const updateCardField = <K extends keyof ManagedCard>(key: K, value: ManagedCard[K]) => {
    if (editingCard) setEditingCard({ ...editingCard, [key]: value });
  };

  const openCardEditor = (card: ManagedCard, nextPanel: CardEditorPanel = "preview") => {
    if (!confirmDiscardUnsavedChanges(`opening ${card.name || "another card"}`)) return;
    const nextCard = { ...card, customFields: { ...card.customFields } };
    const nextBuilder = parseStoredMechanicsBuilder(nextCard);
    const nextBlocks = parseStoredSectionBlocks(nextCard);
    const nextRulesMode = getStoredRulesMode(nextCard);
    setEditingCard(nextCard);
    setIsAddingNewCard(false);
    setShowTemplatePicker(false);
    setPendingTemplate(null);
    setEditorPanel(nextPanel);
    setMechanicsBuilder(nextBuilder);
    setCardSectionBlocks(nextBlocks);
    setRulesMode(nextRulesMode);
    setMechanicsView(nextRulesMode === "manual" ? "text" : "rules");
    if (nextPanel === "assignment") {
      selectWorkspaceStage("delivery", "delivery", "players");
    } else if (nextPanel === "progression") {
      selectWorkspaceStage("delivery", "delivery", "node-trees");
    } else if (nextPanel === "tags") {
      selectWorkspaceStage("effects", "tags", "tags");
    } else if (nextPanel === "mechanics") {
      selectWorkspaceStage("rules", "rules", nextRulesMode === "manual" ? "main-effect" : "builder");
    } else if (nextPanel === "preview") {
      selectWorkspaceStage("live", "identity");
    } else {
      selectWorkspaceStage("overview", "identity", "identity");
    }
    setIsCardLibraryMobileOpen(false);
    editorBaselineRef.current = buildEditorSnapshot(nextCard, nextBuilder, nextBlocks, nextRulesMode, false);
  };

  const toggleCardTag = (tagName: string) => {
    if (!editingCard) return;
    const has = editingCard.tags.includes(tagName);
    const nextTags = has ? editingCard.tags.filter((t) => t !== tagName) : [...editingCard.tags, tagName];
    const nextCard = applyStarterProfileToCard(
      {
        ...editingCard,
        tags: nextTags,
        customFields: stripInactiveTagCustomFields(editingCard.customFields || {}, nextTags, cardTags),
      },
      buildStarterProfileFromTags(nextTags, cardTags),
    );
    setEditingCard(nextCard);
  };

  const updateCardCustomField = (key: string, value: string) => {
    if (!editingCard) return;
    setEditingCard({ ...editingCard, customFields: { ...editingCard.customFields, [key]: value } });
  };

  const addQuickRollSlot = () => {
    if (!editingCard) return;
    const nextCustomFields = { ...editingCard.customFields };
    const slotId = makeQuickRollSlotId(nextCustomFields);
    nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_LABEL_KEY)] = "Damage";
    nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_EXPRESSION_KEY)] = "";
    nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_POTENCY_KEY)] = "";
    setEditingCard({ ...editingCard, customFields: nextCustomFields });
    if (workspaceStage === "live") {
      selectWorkspaceStage("live", "quick-rolls");
      setPreviewEditField("quick-rolls");
    } else {
      selectWorkspaceStage("effects", "quick-rolls", "quick-rolls");
    }
    setEditorPanel("mechanics");
    setMechanicsView("automation");
  };

  const removeQuickRollSlot = (slotId: string) => {
    if (!editingCard) return;
    const nextCustomFields = { ...editingCard.customFields };
    delete nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_LABEL_KEY)];
    delete nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_EXPRESSION_KEY)];
    delete nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_POTENCY_KEY)];
    setEditingCard({ ...editingCard, customFields: nextCustomFields });
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

  const clearMechanicsBuilderField = (field: MechanicsBuilderField) => {
    setMechanicsBuilder((prev) => ({ ...prev, [field]: "" }));
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
        <span style={S_MUTED}>{cf.tagName} &gt;</span> {cf.fieldName}:
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
            {!isValid && <option value="__invalid__" disabled style={S_RED}>Warning: "{currentVal}" (not recognized)</option>}
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {!isValid && (
            <div className="text-[9px] mt-1 flex items-center gap-1" style={S_RED}>
              Warning: "{currentVal}" will not apply - pick a valid {buffTypeVal} from the list
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
            {!isValid && <option value="__invalid__" disabled style={S_RED}>Warning: "{currentVal}" (not recognized)</option>}
            <optgroup label="Attributes">
              {["STR", "AGI", "CON", "KNOW", "WIS", "WILL"].map((a) => <option key={a} value={a}>{a}</option>)}
            </optgroup>
            <optgroup label="Resources">
              {["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"].map((r) => <option key={r} value={r}>{r}</option>)}
            </optgroup>
          </select>
          {!isValid && (
            <div className="text-[9px] mt-1 flex items-center gap-1" style={S_RED}>
              Warning: "{currentVal}" will not be recognized - pick from the list
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
    return groupCustomFieldsByTag(activeCardCustomFields);
  }, [activeCardCustomFields]);
  const populatedOrRequiredTagGroups = useMemo(
    () => activeFieldsByTag.filter((group) => group.fields.some((field) => field.fieldDef.required || hasFilledFieldValue(editingCard?.customFields[field.key]))),
    [activeFieldsByTag, editingCard],
  );
  const optionalEmptyTagGroups = useMemo(
    () => activeFieldsByTag.filter((group) => !group.fields.some((field) => field.fieldDef.required || hasFilledFieldValue(editingCard?.customFields[field.key]))),
    [activeFieldsByTag, editingCard],
  );

  const selectedTagDefs = useMemo(
    () => (editingCard ? cardTags.filter((tag) => editingCard.tags.includes(tag.name)) : []),
    [cardTags, editingCard],
  );
  const missingRequiredTagFields = useMemo(
    () => activeCardCustomFields.filter((field) => field.fieldDef.required && !(editingCard?.customFields[field.key] || "").trim()),
    [activeCardCustomFields, editingCard],
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
    const nextCards = managedCards.filter((card) => {
      const matchesQuery = !query || [
        card.name,
        card.type,
        card.actionCost,
        card.customFields["Source Type"] || "",
        getCardSummary(card),
        formatOwners(card.assignedTo, players),
      ].some((value) => value.toLowerCase().includes(query));
      const matchesTag = cardTagFilter === "all" || card.tags.includes(cardTagFilter);
      const matchesType = cardTypeFilter === "all" || card.type === cardTypeFilter;
      return matchesQuery && matchesTag && matchesType;
    });
    if (cardLibrarySort === "manual") return nextCards;
    return [...nextCards].sort((left, right) => {
      if (cardLibrarySort === "player") {
        const ownerCompare = getCardLibraryOwnerSortKey(left, players).localeCompare(getCardLibraryOwnerSortKey(right, players));
        if (ownerCompare !== 0) return ownerCompare;
      }
      const leftName = (left.name || "Untitled Card").toLowerCase();
      const rightName = (right.name || "Untitled Card").toLowerCase();
      return leftName.localeCompare(rightName);
    });
  }, [managedCards, cardSearch, cardTagFilter, cardTypeFilter, cardLibrarySort, players]);

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
  const selectedNodeCapacity = useMemo(
    () => (selectedNode ? getNodeCapacityState(selectedNode, editingCard?.id) : null),
    [selectedNode, editingCard?.id],
  );
  const progressionNodes = useMemo(() => {
    if (!editingCard?.nodeTreeId) return [];
    const tree = nodeTrees.find((entry) => entry.id === editingCard.nodeTreeId);
    if (!tree) return [];
    return tree.nodes.map((node) => ({
      node,
      capacity: getNodeCapacityState(node, editingCard.id),
    }));
  }, [editingCard?.id, editingCard?.nodeTreeId, nodeTrees]);
  const validationIssues = useMemo(
    () => (editingCard ? collectCardValidationIssues(editingCard, mechanicsBuilder, cardSectionBlocks, rulesMode, nodeTrees, cardTags) : []),
    [editingCard, mechanicsBuilder, cardSectionBlocks, rulesMode, nodeTrees, cardTags],
  );
  const blockingValidationIssues = useMemo(
    () => validationIssues.filter((issue) => issue.level === "error"),
    [validationIssues],
  );
  const warningValidationIssues = useMemo(
    () => validationIssues.filter((issue) => issue.level === "warning"),
    [validationIssues],
  );
  const structuredRulesPreview = useMemo(
    () => getStructuredRulesOutput(mechanicsBuilder, cardSectionBlocks),
    [mechanicsBuilder, cardSectionBlocks],
  );
  const livePreviewCard = useMemo(
    () => (editingCard ? withPersistedEditorStructure(editingCard, mechanicsBuilder, cardSectionBlocks, rulesMode, cardTags) : null),
    [editingCard, mechanicsBuilder, cardSectionBlocks, rulesMode, cardTags],
  );
  const trackerStatusLabel = useMemo(
    () => (editingCard && hasBuiltInCardTracker(editingCard) ? trackerBucketLabel(currentTrackerBucket) : null),
    [editingCard, currentTrackerBucket],
  );
  const workspaceStageCards = useMemo(() => {
    if (!editingCard) return [];
    return [
      {
        id: "live" as CardWorkspaceStage,
        accent: "#5C8DFF",
        title: "Live Edit",
        summary: "Preview-first editing",
        detail: stripHtml(editingCard.effect || editingCard.customFields[CARD_DESCRIPTION_KEY] || "").trim()
          ? "Edit the visible card text directly in the live preview"
          : "Start by clicking into the live preview to fill the visible card text",
      },
      {
        id: "overview" as CardWorkspaceStage,
        accent: currentFamilyDef?.accent || "#4A7BFF",
        title: "Overview",
        summary: currentFamilyDef ? `${currentFamilyDef.label} profile` : "Pick the card's family",
        detail: editingCard.name.trim() ? editingCard.name.trim() : "Name and identity still blank",
      },
      {
        id: "rules" as CardWorkspaceStage,
        accent: rulesMode === "guided" ? "#6ABAFF" : "#FFD166",
        title: "Rules",
        summary: rulesMode === "guided" ? "Guided rules save" : "Manual rules save",
        detail: rulesMode === "guided"
          ? `${getFilledMechanicsCount(mechanicsBuilder)} structured steps`
          : (stripHtml(editingCard.effect || "").trim() ? "Manual effect text ready" : "Manual effect text still blank"),
      },
      {
        id: "effects" as CardWorkspaceStage,
        accent: "#9A7ABB",
        title: "Effects & Tags",
        summary: `${selectedTagDefs.length} tag${selectedTagDefs.length === 1 ? "" : "s"} | ${quickRollSlots.length} quick roll${quickRollSlots.length === 1 ? "" : "s"}`,
        detail: trackerStatusLabel || (missingRequiredTagFields.length > 0 ? `${missingRequiredTagFields.length} required field${missingRequiredTagFields.length === 1 ? "" : "s"} missing` : "No automation configured"),
      },
      {
        id: "delivery" as CardWorkspaceStage,
        accent: "#7ACA8A",
        title: "Delivery",
        summary: editingCard.assignedTo.includes("all") ? "All players" : editingCard.assignedTo.length > 0 ? `${editingCard.assignedTo.length} player${editingCard.assignedTo.length === 1 ? "" : "s"}` : "Unassigned",
        detail: selectedNode ? `${selectedNode.label}${selectedNodeCapacity?.isFullForSelection ? " (full)" : ""}` : selectedNodeTree ? "Node not picked yet" : "No progression assignment",
      },
    ];
  }, [
    editingCard,
    currentFamilyDef,
    rulesMode,
    mechanicsBuilder,
    selectedTagDefs.length,
    quickRollSlots.length,
    trackerStatusLabel,
    missingRequiredTagFields.length,
    selectedNode,
    selectedNodeCapacity?.isFullForSelection,
    selectedNodeTree,
  ]);
  const workflowSnapshotCards = useMemo(() => {
    if (!editingCard) return [];
    return [
      {
        id: "core" as CardEditorPanel,
        accent: currentFamilyDef?.accent || "#4A7BFF",
        title: "Core",
        summary: currentFamilyDef ? `${currentFamilyDef.label} profile` : "Choose a family",
        detail: editingCard.name.trim() ? editingCard.name.trim() : "Name still blank",
      },
      {
        id: "mechanics" as CardEditorPanel,
        accent: rulesMode === "guided" ? "#6ABAFF" : "#FFD166",
        title: "Mechanics",
        summary: rulesMode === "guided" ? "Guided rules save" : "Manual text save",
        detail: rulesMode === "guided"
          ? `${getFilledMechanicsCount(mechanicsBuilder)} steps, ${cardSectionBlocks.length} blocks`
          : (stripHtml(editingCard.effect || "").trim() ? `${stripHtml(editingCard.effect || "").slice(0, 42)}${stripHtml(editingCard.effect || "").length > 42 ? "..." : ""}` : "No manual rules yet"),
      },
      {
        id: "tags" as CardEditorPanel,
        accent: "#9A7ABB",
        title: "Tags",
        summary: selectedTagDefs.length === 0 ? "No tags selected" : `${selectedTagDefs.length} active tag${selectedTagDefs.length === 1 ? "" : "s"}`,
        detail: missingRequiredTagFields.length > 0 ? `${missingRequiredTagFields.length} required field${missingRequiredTagFields.length === 1 ? "" : "s"} missing` : "Tag fields look clean",
      },
      {
        id: "progression" as CardEditorPanel,
        accent: "#FFD700",
        title: "Progression",
        summary: selectedNodeTree ? selectedNodeTree.name : "No node tree",
        detail: selectedNode
          ? `${selectedNode.label}${selectedNodeCapacity?.isFullForSelection ? " (full)" : ""}`
          : selectedNodeTree ? "Node not picked yet" : "Optional assignment",
      },
      {
        id: "assignment" as CardEditorPanel,
        accent: "#7ACA8A",
        title: "Assignment",
        summary: editingCard.assignedTo.includes("all") ? "All players" : editingCard.assignedTo.length > 0 ? `${editingCard.assignedTo.length} player${editingCard.assignedTo.length === 1 ? "" : "s"}` : "Unassigned",
        detail: blockingValidationIssues.length > 0 ? "Finish checklist before save" : "Ready for preview",
      },
    ];
  }, [
    editingCard,
    currentFamilyDef,
    rulesMode,
    mechanicsBuilder,
    cardSectionBlocks,
    selectedTagDefs.length,
    missingRequiredTagFields.length,
    selectedNodeTree,
    selectedNode,
    selectedNodeCapacity?.isFullForSelection,
    blockingValidationIssues.length,
  ]);
  const mechanicsWorkspaceCards = useMemo(() => ([
    {
      id: "rules" as MechanicsWorkspaceView,
      accent: "#6ABAFF",
      title: "Rules Builder",
      detail: `${getFilledMechanicsCount(mechanicsBuilder)} steps and ${cardSectionBlocks.length} block${cardSectionBlocks.length === 1 ? "" : "s"}`,
      helper: "Build the sequence and supporting rule blocks.",
    },
    {
      id: "automation" as MechanicsWorkspaceView,
      accent: "#4ACA6A",
      title: "Automation",
      detail: `${hasBuiltInCardTracker(editingCard) ? trackerBucketLabel(currentTrackerBucket) : "Tracker off"} | ${quickRollSlots.length} quick roll${quickRollSlots.length === 1 ? "" : "s"}`,
      helper: "Configure status/card tracking and dice buttons.",
    },
    {
      id: "text" as MechanicsWorkspaceView,
      accent: "#FFD166",
      title: "Text & Scaling",
      detail: `${rulesMode === "guided" ? "Guided text preview" : "Manual effect editing"} | ${(editingCard?.customFields[USE_PROFILE_UPCAST_KEY] || "").trim() ? "Scaling set" : "Scaling blank"}`,
      helper: "Description, saved effect text, and scaling notes.",
    },
  ]), [mechanicsBuilder, cardSectionBlocks.length, editingCard, currentTrackerBucket, quickRollSlots.length, rulesMode]);
  const mechanicsWorkspaceIntro = useMemo(() => {
    const activeView = mechanicsWorkspaceCards.find((view) => view.id === mechanicsView);
    return activeView || mechanicsWorkspaceCards[0];
  }, [mechanicsWorkspaceCards, mechanicsView]);
  const setStageSubTab = useCallback((
    stage: CardWorkspaceStage,
    subTab: OverviewSubTab | RulesSubTab | EffectsSubTab | DeliverySubTab,
  ) => {
    if (stage === "overview") setOverviewSubTab(subTab as OverviewSubTab);
    if (stage === "rules") {
      const next = subTab as RulesSubTab;
      setRulesSubTab(next);
      setMechanicsView(next === "builder" || next === "section-blocks" ? "rules" : "text");
    }
    if (stage === "effects") {
      const next = subTab as EffectsSubTab;
      setEffectsSubTab(next);
      if (next === "tracker" || next === "quick-rolls") setMechanicsView("automation");
    }
    if (stage === "delivery") setDeliverySubTab(subTab as DeliverySubTab);
  }, []);

  const selectWorkspaceStage = useCallback((
    stage: CardWorkspaceStage,
    focusRegion: CardPreviewFocusRegion = null,
    subTab?: OverviewSubTab | RulesSubTab | EffectsSubTab | DeliverySubTab,
  ) => {
    setWorkspaceStage(stage);
    setPreviewFocusRegion(focusRegion);
    setPreviewEditField(null);
    if (stage === "live") return;
    if (subTab) {
      setStageSubTab(stage, subTab);
      return;
    }
    if (stage === "overview") setStageSubTab(stage, "identity");
    if (stage === "rules") setStageSubTab(stage, rulesMode === "guided" ? "builder" : "main-effect");
    if (stage === "effects") setStageSubTab(stage, "tags");
    if (stage === "delivery") setStageSubTab(stage, "players");
  }, [rulesMode, setStageSubTab]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasUnsavedChanges]);

  const applyCardFamily = (family: CardFamily) => {
    if (!editingCard) return;
    setEditingCard(withCardFamilyDefaults(editingCard, family, { overwriteExisting: true }));
  };

  const focusValidationIssue = (issue: CardValidationIssue) => {
    setEditorPanel(issue.panel);
    if (issue.panel === "mechanics" && issue.mechanicsView) {
      setMechanicsView(issue.mechanicsView);
    }
    if (issue.panel === "mechanics" && issue.mechanicsView === "automation") {
      selectWorkspaceStage("effects", "tracking", "tracker");
    } else {
      const stage = getWorkspaceStageForPanel(issue.panel, issue.mechanicsView);
      if (stage === "overview") {
        selectWorkspaceStage("overview", "identity", "identity");
      } else if (stage === "rules") {
        selectWorkspaceStage("rules", issue.panel === "mechanics" ? "rules" : null, issue.mechanicsView === "rules" ? "builder" : "main-effect");
      } else if (stage === "effects") {
        selectWorkspaceStage("effects", issue.panel === "tags" ? "tags" : "tracking", issue.panel === "tags" ? "visible-fields" : "tracker");
      } else {
        selectWorkspaceStage("delivery", "delivery", issue.panel === "progression" ? "node-trees" : issue.panel === "assignment" ? "players" : "validation");
      }
    }
    setPreviewEditField(null);
  };

  const editorPanels: { id: CardEditorPanel; label: string; icon: React.ComponentType<{ size?: number }>; accent: string; step: string }[] = [
    { id: "core", label: "Core", icon: Settings, accent: "#4A7BFF", step: "1" },
    { id: "mechanics", label: "Mechanics", icon: FileText, accent: "#6ABAFF", step: "2" },
    { id: "tags", label: "Tags", icon: Tags, accent: "#9A7ABB", step: "3" },
    { id: "progression", label: "Progression", icon: GitBranch, accent: "#FFD700", step: "4" },
    { id: "assignment", label: "Assignment", icon: Users, accent: "#7ACA8A", step: "5" },
    { id: "preview", label: "Preview", icon: Eye, accent: "#8AB8FF", step: "6" },
  ];

  const editorPanelDescriptions: Record<CardEditorPanel, string> = {
    core: "Define the card's identity, family, and use profile.",
    mechanics: "Choose one rules source, then handle automation and supporting text in smaller workspace views.",
    tags: "Use helper tags and fill any tag-driven fields this card needs.",
    progression: "Assign the card to a node tree and see node capacity before saving.",
    assignment: "Choose which players receive the card.",
    preview: "Review the exact card output that will be saved.",
  };

  const handleCardsSubTabChange = (nextTab: "cards" | "magic" | "levelabilities") => {
    if (nextTab === dmCardsSubTab) return;
    if (nextTab === "magic" && !confirmDiscardUnsavedChanges("Magic")) return;
    if (nextTab === "levelabilities" && !confirmDiscardUnsavedChanges("Level")) return;
    setDmCardsSubTab(nextTab);
  };

  const renderManagementSummaryCards = (
    cards: Array<{ label: string; value: string; accent: string; helper?: string }>,
    columnsClassName = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3",
  ) => (
    <div className={columnsClassName}>
      {cards.map((card) => (
        <div
          key={card.label}
          className={`${retro.sunken} px-4 py-3`}
          style={{ ...editorSurfaceStyle(card.accent), borderLeft: `3px solid ${card.accent}66` }}
        >
          <div className="text-[9px] uppercase tracking-[0.06em] mb-1" style={S_MUTED}>{card.label}</div>
          <div className="text-[13px] break-words" style={S_TEXT_BOLD}>{card.value}</div>
          {card.helper ? (
            <div className="text-[10px] mt-2 leading-relaxed" style={S_SUBTLE}>{card.helper}</div>
          ) : null}
        </div>
      ))}
    </div>
  );

  const updateMagicListTierCards = useCallback((
    listId: string,
    tier: MagicTierKey,
    cardIds: string[],
  ) => {
    const nextLists = magicLists.map((list) => {
      if (list.id !== listId) return list;
      return {
        ...list,
        tiers: {
          ...list.tiers,
          [tier]: cardIds,
        },
      };
    });
    void saveMagicLists(nextLists);
  }, [magicLists, saveMagicLists]);

  const renderOverviewStage = () => {
    if (!editingCard) return null;

    return (
      <div className="space-y-4">
        <WorkspaceSubTabBar tabs={OVERVIEW_SUB_TABS} activeTab={overviewSubTab} onSelect={setOverviewSubTab} />

        {overviewSubTab === "identity" && (
          <div className={`${retro.sunken} bg-[#0C0C2E] p-5 space-y-4`} style={editorSurfaceStyle("#4A7BFF")}>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-4">
                <div className={`${retro.raised} bg-[#0E0E35] p-4`} style={editorSurfaceStyle("#4A7BFF")}>
                  <div className="text-[12px] mb-1" style={S_SECTION_HDR}>PREVIEW-FIRST EDITING</div>
                  <div className="text-[11px]" style={S_SUBTLE}>
                    Use the live preview for the card's visible text first. This sub-tab keeps the same fields available in a wider supporting layout when you want a full form.
                  </div>
                </div>
                <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
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
                    <label className="text-[10px] block mb-1" style={labelStyle}>Source Type:</label>
                    <input type="text" value={editingCard.customFields["Source Type"] || ""} onChange={(e) => updateCardCustomField("Source Type", e.target.value)} placeholder="e.g., Light, Martial, Fairy Blood..." className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[10px] block mb-1" style={labelStyle}>Magic Nature:</label>
                    <input type="text" value={editingCard.customFields[USE_PROFILE_MAGIC_NATURE_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_MAGIC_NATURE_KEY, e.target.value)} placeholder="e.g., Magical (Spell), Technique..." className={inputClass} style={inputStyle} />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className={`${retro.raised} p-4 space-y-3`} style={editorSurfaceStyle(currentFamilyDef?.accent || "#273357")}>
                  <div className="text-[10px]" style={S_SECTION_HDR}>CURRENT SNAPSHOT</div>
                  <div className="flex flex-wrap gap-2">
                    {currentProfileBadges.length > 0 ? currentProfileBadges.map((badge, index) => (
                      <span key={`${badge}-${index}`} className="text-[9px] px-2 py-1" style={sectionBadgeStyle(index === 0 && currentFamilyDef ? currentFamilyDef.accent : "#6ABAFF")}>{badge}</span>
                    )) : <span className="text-[10px]" style={S_MUTED}>Pick a card family to start shaping the rules profile.</span>}
                  </div>
                  <div className="text-[11px]" style={S_SUBTLE}>
                    {editingCard.name.trim()
                      ? "The preview now acts as the fastest editor for name, description, effect text, scaling, quick rolls, and visible fields."
                      : "Start by naming the card. Then move between the preview and the supporting subtabs as needed."}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {overviewSubTab === "profile" && (
          <div className={`${retro.sunken} bg-[#0C0C2E] p-5 space-y-4`} style={editorSurfaceStyle(currentFamilyDef?.accent || "#6ABAFF")}>
            <div className={`${retro.raised} p-4 space-y-3`} style={editorSurfaceStyle(currentFamilyDef?.accent || "#273357")}>
              <div>
                <div className="text-[10px] mb-1" style={S_SECTION_HDR}>CARD FAMILY</div>
                <div className="text-[10px]" style={S_SUBTLE}>Pick the family that should own the card's main use profile. Switching family overwrites the family-managed profile fields.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {CARD_FAMILY_OPTIONS.map((family) => {
                  const active = currentFamily === family.id;
                  return (
                    <button
                      key={family.id}
                      onClick={() => applyCardFamily(family.id)}
                      className={`${active ? retro.sunken : retro.raised} px-3 py-2 text-[11px] transition-colors`}
                      style={panelButtonStyle(active, family.accent)}
                    >
                      {family.label}
                    </button>
                  );
                })}
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

            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Cost Model:</label>
                  <input type="text" value={editingCard.customFields[USE_PROFILE_COST_MODEL_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_COST_MODEL_KEY, e.target.value)} placeholder="e.g., Source, Exhaustion / Uses..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Primary Cost:</label>
                  <input type="text" value={editingCard.customFields[USE_PROFILE_PRIMARY_COST_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_PRIMARY_COST_KEY, e.target.value)} placeholder="e.g., 3 Fire Source..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Uses Per Long Rest:</label>
                  <input type="text" value={editingCard.customFields[USE_PROFILE_USES_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_USES_KEY, e.target.value)} placeholder="e.g., PB / Long Rest..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Range:</label>
                  <input type="text" value={editingCard.customFields[USE_PROFILE_RANGE_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_RANGE_KEY, e.target.value)} placeholder="e.g., Self, 30 feet..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Duration:</label>
                  <input type="text" value={editingCard.customFields[USE_PROFILE_DURATION_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_DURATION_KEY, e.target.value)} placeholder="e.g., Instant, 1 minute..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Origin:</label>
                  <input type="text" value={editingCard.customFields[USE_PROFILE_ORIGIN_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_ORIGIN_KEY, e.target.value)} placeholder="e.g., Learned, Bloodline..." className={inputClass} style={inputStyle} />
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <label className="text-[10px] block mb-1" style={labelStyle}>Passive / Trigger Notes:</label>
                  <input type="text" value={editingCard.customFields[USE_PROFILE_PASSIVE_MODE_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_PASSIVE_MODE_KEY, e.target.value)} placeholder="e.g., Activatable Passive, Triggered on damage..." className={inputClass} style={inputStyle} />
                </div>
              </div>

              <div className={`${retro.raised} p-4 space-y-3`} style={editorSurfaceStyle(currentFamilyDef?.accent || "#273357")}>
                <div className="text-[10px]" style={S_SECTION_HDR}>CURRENT RULE PROFILE</div>
                <div className="flex flex-wrap gap-2">
                  {currentProfileBadges.length > 0 ? currentProfileBadges.map((badge, index) => (
                    <span key={`${badge}-${index}`} className="text-[9px] px-2 py-1" style={sectionBadgeStyle(index === 0 && currentFamilyDef ? currentFamilyDef.accent : "#6ABAFF")}>{badge}</span>
                  )) : <span className="text-[10px]" style={S_MUTED}>No family summary yet.</span>}
                </div>
                <div className="space-y-2 text-[11px]">
                  <div><span style={S_MUTED}>Cost Model:</span> <span style={S_TEXT}>{editingCard.customFields[USE_PROFILE_COST_MODEL_KEY] || "Not set"}</span></div>
                  <div><span style={S_MUTED}>Primary Cost:</span> <span style={S_TEXT}>{editingCard.customFields[USE_PROFILE_PRIMARY_COST_KEY] || "Not set"}</span></div>
                  <div><span style={S_MUTED}>Uses / Long Rest:</span> <span style={S_TEXT}>{editingCard.customFields[USE_PROFILE_USES_KEY] || "Not set"}</span></div>
                  <div><span style={S_MUTED}>Origin:</span> <span style={S_TEXT}>{editingCard.customFields[USE_PROFILE_ORIGIN_KEY] || "Not set"}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {overviewSubTab === "advanced-profile" && (
          <div className={`${retro.sunken} bg-[#0C0C2E] p-5`} style={editorSurfaceStyle("#8AB8FF")}>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <div className="md:col-span-2 xl:col-span-3">
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
                      <input type="text" value={editingCard.customFields[USE_PROFILE_REQUIREMENTS_KEY] || ""} onChange={(e) => updateCardCustomField(USE_PROFILE_REQUIREMENTS_KEY, e.target.value)} placeholder="e.g., Wielding a melee weapon..." className={inputClass} style={inputStyle} />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Requirements:</label>
                      <button type="button" onClick={() => setShowRequirementsField(true)} className={`${retro.button} px-3 py-2 text-[11px]`} style={S_TEXT}>
                        Add Requirements
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className={`${retro.raised} p-4 space-y-3`} style={editorSurfaceStyle("#8AB8FF")}>
                <div className="text-[10px]" style={S_SECTION_HDR}>WHY THIS SUB-TAB STAYS HERE</div>
                <div className="text-[11px]" style={S_SUBTLE}>
                  Components, requirements, and deeper use-profile fields are still easier to manage in a form than directly on the player card preview. The preview remains the primary place for visible text edits.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRulesStage = () => {
    if (!editingCard) return null;

    return (
      <div className="space-y-4">
        <WorkspaceSubTabBar tabs={RULES_SUB_TABS} activeTab={rulesSubTab} onSelect={setRulesSubTab} />

        <div className={`${retro.sunken} bg-[#0C0C2E] p-5 space-y-4`}>
          <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-4`} style={editorSurfaceStyle("#6ABAFF")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[12px] mb-1" style={S_SECTION_HDR}>RULES WORKSPACE</div>
                <div className="text-[10px]" style={S_SUBTLE}>
                  The live preview is the fastest place to edit visible rules text. These subtabs hold source selection, structured authoring, and import tools.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-[10px] px-2.5 py-1.5" style={sectionBadgeStyle("#6ABAFF")}>{getFilledMechanicsCount(mechanicsBuilder)} mechanics step{getFilledMechanicsCount(mechanicsBuilder) === 1 ? "" : "s"}</span>
                <span className="text-[10px] px-2.5 py-1.5" style={sectionBadgeStyle("#FFD700")}>{cardSectionBlocks.length} section block{cardSectionBlocks.length === 1 ? "" : "s"}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setRulesMode("guided"); setRulesSubTab("builder"); }}
                className={`${rulesMode === "guided" ? retro.sunken : retro.raised} px-3 py-2 text-[11px]`}
                style={panelButtonStyle(rulesMode === "guided", "#6ABAFF")}
              >
                Guided Builder
              </button>
              <button
                type="button"
                onClick={() => { setRulesMode("manual"); setRulesSubTab("main-effect"); }}
                className={`${rulesMode === "manual" ? retro.sunken : retro.raised} px-3 py-2 text-[11px]`}
                style={panelButtonStyle(rulesMode === "manual", "#FFD166")}
              >
                Manual Text
              </button>
            </div>
          </div>

          {rulesSubTab === "main-effect" && (
            <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] gap-4">
              <div className="space-y-4">
                <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle(rulesMode === "manual" ? "#FFD166" : "#6ABAFF")}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] mb-1" style={S_SECTION_HDR}>SAVED RULES SOURCE</div>
                      <div className="text-[10px]" style={S_SUBTLE}>
                        {rulesMode === "guided"
                          ? "Guided Builder writes the saved effect text when you save."
                          : "Manual Text writes the saved effect text. The builder stays available as a draft and import tool."}
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-1" style={sectionBadgeStyle(rulesMode === "guided" ? "#6ABAFF" : "#FFD166")}>
                      {rulesMode === "guided" ? "Guided Save" : "Manual Save"}
                    </span>
                  </div>
                  {rulesMode === "manual" ? (
                    <RichTextEditor value={editingCard.effect} onChange={(html) => updateCardField("effect", html)} placeholder="Enter card effects..." minHeight={260} />
                  ) : (
                    <div className={`${retro.sunken} bg-[#0A0A28] p-4 min-h-[240px] text-[12px]`} style={S_TEXT}>
                      {structuredRulesPreview ? (
                        <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(structuredRulesPreview) }} />
                      ) : (
                        <span style={S_MUTED}>No guided rules output yet. Use Builder or Section Blocks to compose the saved effect text.</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#8AB8FF")}>
                  <div className="text-[12px]" style={S_SECTION_HDR}>STRUCTURED DRAFT TOOLS</div>
                  <div className="text-[11px]" style={S_SUBTLE}>
                    Use the preview to edit the visible effect. Use these actions when you want the builder draft to replace or append to the saved text.
                  </div>
                  <div className={`${retro.sunken} bg-[#0A0A28] p-4 min-h-[180px] text-[11px]`} style={S_TEXT}>
                    {structuredRulesPreview ? (
                      <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(structuredRulesPreview) }} />
                    ) : (
                      <span style={S_MUTED}>No structured draft yet. Build one in Builder or Section Blocks first.</span>
                    )}
                  </div>
                  {rulesMode === "manual" && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => applyMechanicsBuilder("replace")} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1.5`} style={S_ACCENT}>
                        <Save size={12} /> Replace with Mechanics Only
                      </button>
                      <button onClick={() => applySectionBlocks("replace")} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1.5`} style={sectionBadgeStyle("#FFD700")}>
                        <Save size={12} /> Replace with Blocks Only
                      </button>
                      <button onClick={() => applyCombinedStructuredOutput("replace")} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1.5`} style={S_GREEN_BTN}>
                        <Sparkles size={12} /> Replace with Full Output
                      </button>
                      <button onClick={() => applyCombinedStructuredOutput("append")} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1.5`} style={S_ACCENT}>
                        <Plus size={12} /> Append Full Output
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {rulesSubTab === "builder" && (
            <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-4`} style={editorSurfaceStyle("#6ABAFF")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] mb-1" style={S_SECTION_HDR}>STRUCTURED MECHANICS BUILDER</div>
                  <div className="text-[10px]" style={S_SUBTLE}>Lay out the card's play sequence. These steps feed the generated rules output in order.</div>
                </div>
                <button onClick={clearMechanicsBuilder} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}>
                  Clear Builder
                </button>
              </div>

              <div className="grid grid-cols-2 2xl:grid-cols-4 gap-2">
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
                        {!filled ? (
                          <button onClick={() => addMechanicsStarter(block)} className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1`} style={sectionBadgeStyle(accent)}>
                            <Sparkles size={10} /> Seed
                          </button>
                        ) : (
                          <button onClick={() => clearMechanicsBuilderField(block.id)} className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1`} style={S_RED}>
                            <Trash2 size={10} /> Remove
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
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {rulesSubTab === "section-blocks" && (
            <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#FFD700")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] mb-1" style={S_SECTION_HDR}>CARD SECTION BLOCKS</div>
                  <div className="text-[10px]" style={S_SUBTLE}>Use blocks for summaries, reminders, limits, or follow-up text around the main sequence.</div>
                </div>
                <div className="text-[10px]" style={S_SUBTLE}>{cardSectionBlocks.length} saved section block{cardSectionBlocks.length === 1 ? "" : "s"}</div>
              </div>
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
              <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_180px_auto] gap-2 items-end">
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Custom Block Title:</label>
                  <input type="text" value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} placeholder="e.g. Follow-Up, Combo..." className={inputClass} style={inputStyle} />
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
                <div className="text-[11px]" style={S_MUTED}>No card section blocks yet.</div>
              ) : (
                <div className="space-y-3">
                  {cardSectionBlocks.map((block, index) => (
                    <div key={block.id} className={`${retro.sunken} bg-[#0A0A28] p-3 space-y-3`} style={editorSurfaceStyle(block.tone === "rules" ? "#7ACA8A" : block.tone === "highlight" ? "#8AB8FF" : block.tone === "limitation" ? "#FF9A7A" : "#FFD700")}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] px-2 py-0.5" style={toneChipStyle(block.tone)}>Section {index + 1}</span>
                          <span className="text-[10px]" style={S_SUBTLE}>Reorder or tone-shift this block before it joins the final rules output.</span>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-end">
                          <button onClick={() => moveSectionBlock(block.id, -1)} disabled={index === 0} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}><ChevronUp size={10} /></button>
                          <button onClick={() => moveSectionBlock(block.id, 1)} disabled={index === cardSectionBlocks.length - 1} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}><ChevronDown size={10} /></button>
                          <button onClick={() => removeSectionBlock(block.id)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_RED}><Trash2 size={10} /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_180px] gap-2 items-end">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Section Title:</label>
                          <input type="text" value={block.title} onChange={(e) => updateSectionBlock(block.id, { title: e.target.value })} className={inputClass} style={inputStyle} />
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
                        <textarea value={block.content} onChange={(e) => updateSectionBlock(block.id, { content: e.target.value })} placeholder="Write this section's content..." className={`${inputClass} min-h-[92px] resize-y`} style={inputStyle} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {rulesSubTab === "scaling" && (
            <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-4">
              <div className="space-y-4">
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
                </div>
              </div>

              <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#8AB8FF")}>
                <div className="text-[12px]" style={S_SECTION_HDR}>STRUCTURED DRAFT PREVIEW</div>
                <div className={`${retro.sunken} bg-[#0A0A28] p-4 min-h-[200px] text-[11px]`} style={S_TEXT}>
                  {structuredRulesPreview ? (
                    <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(structuredRulesPreview) }} />
                  ) : (
                    <span style={S_MUTED}>No structured draft yet. Build one in Builder or Section Blocks if you want a guided version of this card.</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderEffectsStage = () => {
    if (!editingCard) return null;
    const tagGroupsToRender = showOptionalTagGroups ? activeFieldsByTag : populatedOrRequiredTagGroups;

    return (
      <div className="space-y-4">
        <WorkspaceSubTabBar tabs={EFFECTS_SUB_TABS} activeTab={effectsSubTab} onSelect={setEffectsSubTab} />

        <div className={`${retro.sunken} bg-[#0C0C2E] p-5 space-y-4`}>
          {effectsSubTab === "tags" && (
            <div className="space-y-4">
              <div className={`${retro.raised} bg-[#0E0E35] p-3`} style={editorSurfaceStyle("#9A7ABB")}>
                <div className="text-[12px] mb-1" style={S_SECTION_HDR}>TAGS AS HELPERS AND MODIFIERS</div>
                <div className="text-[11px]" style={S_SUBTLE}>
                  Use tags to classify the card, add light modifiers, and expose helper fields. Removing a tag also clears the tag-owned data it created.
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                {[
                  { label: "Active Tags", value: String(selectedTagDefs.length), detail: selectedTagDefs.length === 0 ? "Nothing attached yet" : "Helper tags currently on this card", accent: "#9A7ABB" },
                  { label: "Suggested Tags", value: String(suggestedTagDefs.length), detail: suggestedTagDefs.length === 0 ? "No strong suggestions" : "Possible helpers based on current rules", accent: "#6ABAFF" },
                  { label: "Required Fields", value: String(missingRequiredTagFields.length), detail: missingRequiredTagFields.length === 0 ? "No missing required tag data" : "Required helper data still missing", accent: missingRequiredTagFields.length === 0 ? "#7ACA8A" : "#FF7A7A" },
                ].map((card) => (
                  <div key={card.label} className={`${retro.raised} bg-[#0E0E35] p-3`} style={editorSurfaceStyle(card.accent)}>
                    <div className="text-[10px]" style={S_SECTION_HDR}>{card.label}</div>
                    <div className="text-[18px] mt-1" style={S_TEXT_BOLD}>{card.value}</div>
                    <div className="text-[10px] mt-2" style={S_SUBTLE}>{card.detail}</div>
                  </div>
                ))}
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
                    No extra suggestions right now.
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
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {effectsSubTab === "visible-fields" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px]" style={S_SECTION_HDR}>VISIBLE TAG FIELD GROUPS</div>
                <div className="text-[10px]" style={S_SUBTLE}>{tagGroupsToRender.length} visible group{tagGroupsToRender.length === 1 ? "" : "s"}</div>
              </div>
              {tagGroupsToRender.length === 0 ? (
                <div className={`${retro.raised} bg-[#0E0E35] p-3 text-[11px]`} style={S_MUTED}>
                  None of the currently selected tags need visible fields yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {tagGroupsToRender.map((group) => {
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {group.fields.map((cf) => renderCardTagFieldInput(cf))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {effectsSubTab === "tracker" && (
            <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#4ACA6A")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] mb-1" style={S_SECTION_HDR}>BUILT-IN TRACKER</div>
                  <div className="text-[10px]" style={S_SUBTLE}>Configure tracker behavior and the summary text that appears with the card in Personal Files.</div>
                </div>
                <span className="text-[10px] px-2.5 py-1.5" style={sectionBadgeStyle(trackerBucketAccent(getCardTrackerBucket(editingCard)))}>
                  {hasBuiltInCardTracker(editingCard) ? trackerBucketLabel(getCardTrackerBucket(editingCard)) : "Tracker Off"}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] block mb-1" style={labelStyle}>Tracker Name:</label>
                    <input type="text" value={editingCard.customFields[CARD_TRACKER_NAME_KEY] || ""} onChange={(e) => updateCardCustomField(CARD_TRACKER_NAME_KEY, e.target.value)} placeholder="Defaults to the card name" className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[10px] block mb-1" style={labelStyle}>Duration:</label>
                    <input type="text" value={editingCard.customFields[CARD_TRACKER_DURATION_KEY] || ""} onChange={(e) => updateCardCustomField(CARD_TRACKER_DURATION_KEY, e.target.value)} placeholder="e.g. 3 rounds, 1 minute" className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[10px] block mb-1" style={labelStyle}>Potency:</label>
                    <input type="text" value={editingCard.customFields[CARD_TRACKER_POTENCY_KEY] || ""} onChange={(e) => updateCardCustomField(CARD_TRACKER_POTENCY_KEY, e.target.value)} placeholder="e.g. 2, P" className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[10px] block mb-1" style={labelStyle}>Damage / Roll:</label>
                    <input type="text" value={editingCard.customFields[CARD_TRACKER_DAMAGE_KEY] || ""} onChange={(e) => updateCardCustomField(CARD_TRACKER_DAMAGE_KEY, e.target.value)} placeholder="e.g. 1d8, 2d6+P" className={inputClass} style={inputStyle} />
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
            </div>
          )}

          {effectsSubTab === "quick-rolls" && (
            <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#FFD166")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] mb-1" style={S_SECTION_HDR}>QUICK ROLL BUTTONS</div>
                  <div className="text-[10px]" style={S_SUBTLE}>Add dedicated roll buttons that appear on the card in Personal Files.</div>
                </div>
                <button onClick={addQuickRollSlot} className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1.5`} style={sectionBadgeStyle("#FFD166")}>
                  <Plus size={10} /> Add Quick Roll
                </button>
              </div>

              {quickRollSlots.length === 0 ? (
                <div className="text-[11px]" style={S_MUTED}>No quick roll buttons yet.</div>
              ) : (
                <div className="space-y-3">
                  {quickRollSlots.map((slot, index) => (
                    <div key={slot.slotId} className={`${retro.sunken} bg-[#0A0A28] p-3`} style={editorSurfaceStyle("#FFD166")}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-[10px]" style={S_TEXT_BOLD}>Quick Roll #{index + 1}</div>
                        <button onClick={() => removeQuickRollSlot(slot.slotId)} className="hover:opacity-80"><X size={12} style={S_RED} /></button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Button Label:</label>
                          <input type="text" value={slot.label} onChange={(e) => updateCardCustomField(getQuickRollFieldKey(slot.slotId, QUICK_ROLL_LABEL_KEY), e.target.value)} placeholder="Damage" className={inputClass} style={inputStyle} />
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Roll Expression:</label>
                          <input type="text" value={slot.expression} onChange={(e) => updateCardCustomField(getQuickRollFieldKey(slot.slotId, QUICK_ROLL_EXPRESSION_KEY), e.target.value)} placeholder="2d6+P" className={inputClass} style={inputStyle} />
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Potency Override:</label>
                          <input type="text" value={slot.potency} onChange={(e) => updateCardCustomField(getQuickRollFieldKey(slot.slotId, QUICK_ROLL_POTENCY_KEY), e.target.value)} placeholder="Optional" className={inputClass} style={inputStyle} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {effectsSubTab === "advanced" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[12px]" style={S_SECTION_HDR}>ADVANCED TAG TOOLS</div>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#7A8AAA")}>
                  <div className="relative">
                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={S_MUTED} />
                    <input type="text" value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="Search tag names or descriptions..." className={`${inputClass} pl-9`} style={inputStyle} />
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
                  </div>
                </div>

                <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#9A7ABB")}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px]" style={S_SECTION_HDR}>OPTIONAL FIELD GROUPS</div>
                    {optionalEmptyTagGroups.length > 0 && (
                      <button onClick={() => setShowOptionalTagGroups((prev) => !prev)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={sectionBadgeStyle("#9A7ABB")}>
                        {showOptionalTagGroups ? "Hide Empty Groups" : `Show ${optionalEmptyTagGroups.length} Empty Group${optionalEmptyTagGroups.length === 1 ? "" : "s"}`}
                      </button>
                    )}
                  </div>
                  <div className="text-[11px]" style={S_SUBTLE}>
                    Preview-first editing keeps empty optional groups off the card. Use this area when you need to expose or prepare them anyway.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDeliveryStage = () => {
    if (!editingCard) return null;

    const currentMagicPlacementCount = magicLists.reduce(
      (sum, list) =>
        sum +
        MAGIC_TIER_ORDER.reduce(
          (tierSum, tier) => tierSum + ((list.tiers[tier] || []).includes(editingCard.id) ? 1 : 0),
          0,
        ),
      0,
    );
    const currentLevelPlacementCount = levelCategories.reduce(
      (sum, level) => sum + (getLevelCategoryEntries(level).some((entry) => entry.cardId === editingCard.id) ? 1 : 0),
      0,
    );

    return (
      <div className="space-y-4">
        <WorkspaceSubTabBar tabs={DELIVERY_SUB_TABS} activeTab={deliverySubTab} onSelect={setDeliverySubTab} />

        <div className={`${retro.sunken} bg-[#0C0C2E] p-5 space-y-4`} style={editorSurfaceStyle("#7ACA8A")}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className={`${retro.raised} bg-[#0E0E35] p-3`} style={editorSurfaceStyle("#7ACA8A")}>
              <div className="text-[10px]" style={S_SECTION_HDR}>DIRECT ASSIGNMENT</div>
              <div className="text-[12px] mt-2" style={S_TEXT_BOLD}>
                {editingCard.assignedTo.includes("all")
                  ? "All players"
                  : `${editingCard.assignedTo.length} player${editingCard.assignedTo.length === 1 ? "" : "s"}`}
              </div>
              <div className="text-[10px] mt-1" style={S_SUBTLE}>Controlled in the Players sub-tab below.</div>
            </div>
            <div className={`${retro.raised} bg-[#0E0E35] p-3`} style={editorSurfaceStyle("#8AB8FF")}>
              <div className="text-[10px]" style={S_SECTION_HDR}>MAGIC LISTS</div>
              <div className="text-[12px] mt-2" style={S_TEXT_BOLD}>{currentMagicPlacementCount} current placement{currentMagicPlacementCount === 1 ? "" : "s"}</div>
              <div className="text-[10px] mt-1 mb-2" style={S_SUBTLE}>Use Magic lists for spell-style grants that also appear in Personal Files Magic.</div>
              <button onClick={() => { setMagicSelectedPlayerId(editingCard.assignedTo.find((id) => id !== "all") || players[0]?.id || ""); handleCardsSubTabChange("magic"); }} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={sectionBadgeStyle("#8AB8FF")}>Open Magic Manager</button>
            </div>
            <div className={`${retro.raised} bg-[#0E0E35] p-3`} style={editorSurfaceStyle("#FFD700")}>
              <div className="text-[10px]" style={S_SECTION_HDR}>LEVEL</div>
              <div className="text-[12px] mt-2" style={S_TEXT_BOLD}>{currentLevelPlacementCount} current placement{currentLevelPlacementCount === 1 ? "" : "s"}</div>
              <div className="text-[10px] mt-1 mb-2" style={S_SUBTLE}>Use Level for level-up rewards, then choose Passive Only or Show in Cards.</div>
              <button onClick={() => { setLaSelectedPlayerId(editingCard.assignedTo.find((id) => id !== "all") || players[0]?.id || ""); handleCardsSubTabChange("levelabilities"); }} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={sectionBadgeStyle("#FFD700")}>Open Level</button>
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[12px]" style={S_SECTION_HDR}>DELIVERY</div>
              <div className="text-[10px] mt-1" style={S_SUBTLE}>Choose who receives the card, where it lives in progression, and finish the save checklist.</div>
            </div>
            <button onClick={() => setShowDeliveryDetails((prev) => !prev)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={sectionBadgeStyle("#7ACA8A")}>
              {showDeliveryDetails ? "Hide Extra Status" : "Show Extra Status"}
            </button>
          </div>

          {deliverySubTab === "validation" && (
            <div className={`${retro.raised} bg-[#10103A] px-3 py-3 space-y-2`} style={{ border: "1px solid #2B3B6B" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px]" style={S_SECTION_HDR}>EDITOR CHECKLIST</div>
                <div className="text-[10px]" style={S_SUBTLE}>
                  {blockingValidationIssues.length > 0 ? `${blockingValidationIssues.length} fix before save` : "No blocking save issues"}
                </div>
              </div>
              {validationIssues.length === 0 ? (
                <div className="text-[11px]" style={S_MUTED}>This card has no validation warnings right now.</div>
              ) : (
                <div className="space-y-2">
                  {validationIssues.map((issue) => (
                    <button
                      key={issue.id}
                      onClick={() => focusValidationIssue(issue)}
                      className={`${retro.raised} w-full p-3 text-left`}
                      style={editorSurfaceStyle(issue.level === "error" ? "#FF7A7A" : "#FFD700")}
                    >
                      <div className="text-[10px]" style={issue.level === "error" ? S_RED : { color: "#FFD700" }}>
                        {issue.level === "error" ? "Error" : "Warning"}
                      </div>
                      <div className="text-[11px] leading-relaxed mt-1" style={S_TEXT}>{issue.message}</div>
                      <div className="text-[10px] mt-2" style={S_SUBTLE}>Click to jump to the part of the editor that needs attention.</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {deliverySubTab === "players" && (
            <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-4`} style={editorSurfaceStyle("#7ACA8A")}>
              <div className="text-[12px]" style={S_SECTION_HDR}>PLAYER ASSIGNMENT</div>
              <div className={`${retro.sunken} bg-[#0A0A28] p-3`}>
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

          {deliverySubTab === "node-trees" && (
            <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-4`} style={editorSurfaceStyle("#FFD700")}>
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
                    {progressionNodes.map(({ node, capacity }) => (
                      <option key={node.id} value={node.id} disabled={capacity.isFullForSelection}>
                        {node.label} ({capacity.filledSlots}/3){capacity.isFullForSelection ? " - Full" : capacity.includesCurrentCard ? " - Current" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={`${retro.sunken} bg-[#0A0A28] p-3 space-y-2`}>
                <div className="text-[10px]" style={S_SECTION_HDR}>CURRENT ASSIGNMENT</div>
                <div className="text-[11px]" style={S_TEXT}>{selectedNodeTree ? selectedNodeTree.name : "No node tree selected"}</div>
                <div className="text-[11px]" style={S_MUTED}>{selectedNode ? `Node: ${selectedNode.label}` : "No node selected"}</div>
                {selectedNode && selectedNodeCapacity && (
                  <div className="text-[10px]" style={S_SUBTLE}>
                    This node currently has {selectedNodeCapacity.filledSlots} / 3 card slot{selectedNodeCapacity.filledSlots !== 1 ? "s" : ""} filled.
                  </div>
                )}
                {selectedNodeCapacity?.isFullForSelection && (
                  <div className="text-[10px]" style={S_RED}>
                    This node is full. Pick another node before saving.
                  </div>
                )}
              </div>

              {showDeliveryDetails && editingCard.nodeTreeId && progressionNodes.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                  {progressionNodes.map(({ node, capacity }) => (
                    <div
                      key={node.id}
                      className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[10px]`}
                      style={editorSurfaceStyle(capacity.isFullForSelection ? "#FF7A7A" : capacity.includesCurrentCard ? "#FFD700" : "#7ACA8A")}
                    >
                      <div style={S_TEXT_BOLD}>{node.label}</div>
                      <div style={capacity.isFullForSelection ? S_RED : S_SUBTLE}>
                        {capacity.filledSlots}/3 filled{capacity.isFullForSelection ? " - Full" : capacity.includesCurrentCard ? " - Current node" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCardsWorkspace = () => {
    const stageMeta = getWorkspaceStageMeta(workspaceStage);
    const activeStageCard = workspaceStageCards.find((entry) => entry.id === workspaceStage);
    const liveEditStageActive = workspaceStage === "live";

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[12px]" style={S_SECTION_HDR}>CARD WORKSPACE</div>
            <div className="text-[10px] mt-1" style={S_SUBTLE}>
              A preview-first card editor with a wider DM workspace, a dedicated live edit mode, and a player-style preview that stays beside the work.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setIsCardLibraryMobileOpen((prev) => !prev)} className={`xl:hidden ${retro.button} px-3 py-2 text-[11px] flex items-center gap-1.5`} style={S_ACCENT}>
              <CreditCard size={12} /> {isCardLibraryMobileOpen ? "Hide Library" : "Open Library"}
            </button>
            <button onClick={handleAddCard} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
              <Plus size={14} /> {showTemplatePicker ? "Hide Templates" : "New Card"}
            </button>
          </div>
        </div>

        {showTemplatePicker && (
          <div className={`${retro.sunken} bg-[#0C0C2E] p-4 space-y-3`}>
            <div>
              <div className="text-[12px]" style={S_SECTION_HDR}>CARD TEMPLATES</div>
              <div className="text-[10px] mt-1" style={S_SUBTLE}>
                Step 1: pick a template. Step 2: choose whether the new card is a Spell, Skill, or Ability.
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
                    {template.type || "Flexible"}{template.actionCost ? ` | ${template.actionCost}` : ""}
                  </div>
                  <div className="text-[10px]" style={S_SUBTLE}>{template.description}</div>
                </button>
              ))}
            </div>
            {pendingTemplate && (
              <div className={`${retro.raised} bg-[#0E0E35] p-4 space-y-3`} style={editorSurfaceStyle("#4A7BFF")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[12px]" style={S_SECTION_HDR}>STEP 2: CHOOSE CARD CORE</div>
                    <div className="text-[11px]" style={S_SUBTLE}>
                      Template selected: <span style={S_TEXT_BOLD}>{pendingTemplate.label}</span>. Pick the starting family profile.
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
                        <span className="text-[8px] px-1.5 py-0.5" style={sectionBadgeStyle(family.accent)}>{family.label}</span>
                      </div>
                      <div className="text-[10px]" style={S_SUBTLE}>{family.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[auto_minmax(0,1fr)] gap-4 items-start">
          <CardLibraryRail
            collapsed={isCardLibraryCollapsed}
            mobileOpen={isCardLibraryMobileOpen}
            onToggleCollapsed={() => setIsCardLibraryCollapsed((prev) => !prev)}
            onCloseMobile={() => setIsCardLibraryMobileOpen(false)}
            filteredCards={filteredCards}
            managedCardsCount={managedCards.length}
            editingCardId={editingCard?.id}
            players={players}
            cardSearch={cardSearch}
            onCardSearchChange={setCardSearch}
            cardLibrarySort={cardLibrarySort}
            onCardLibrarySortChange={setCardLibrarySort}
            cardTypeFilter={cardTypeFilter}
            onCardTypeFilterChange={setCardTypeFilter}
            allCardTypes={allCardTypes}
            cardTagFilter={cardTagFilter}
            onCardTagFilterChange={setCardTagFilter}
            allCardTagNames={allCardTagNames}
            onOpenCard={openCardEditor}
            onDeleteCard={(id) => { void handleDeleteCard(id); }}
            onNewCard={handleAddCard}
            showFilters={showCardLibraryFilters}
            onToggleFilters={() => setShowCardLibraryFilters((prev) => !prev)}
          />

          {!editingCard ? (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(620px,1.1fr)] gap-5">
              <div className={`${retro.sunken} bg-[#0C0C2E] p-6 space-y-4`}>
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles size={18} style={S_ACCENT} />
                  <div className="text-[13px]" style={S_TEXT_BOLD}>Card Editor Workspace</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                  {CARD_WORKSPACE_STAGES.map((stage) => (
                    <div key={stage.id} className={`${retro.raised} p-3`} style={editorSurfaceStyle(stage.accent)}>
                      <div className="flex items-center gap-2 mb-2">
                        <stage.icon size={13} style={{ color: stage.accent }} />
                        <div className="text-[12px]" style={S_TEXT_BOLD}>{stage.label}</div>
                      </div>
                      <div className="text-[11px] leading-relaxed" style={S_SUBTLE}>{stage.helper}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[11px]" style={S_SUBTLE}>
                  Create or reopen a card to get the full three-part workspace: library rail, supporting stage panel, and live card preview.
                </div>
              </div>

              <div className={`${retro.sunken} bg-[#07101F] p-6 space-y-3`} style={editorSurfaceStyle("#4A7BFF")}>
                <div className="text-[12px]" style={S_SECTION_HDR}>LIVE PREVIEW READY</div>
                <div className="text-[11px]" style={S_SUBTLE}>
                  Open or create a card to see the player-style live preview. Most visible card edits can be made directly there, while the center panel keeps the structured tools and deeper controls.
                </div>
                <button onClick={handleAddCard} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                  <Plus size={14} /> Open Template Picker
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                <CardWorkspaceHeader
                  editingCard={editingCard}
                  isAddingNewCard={isAddingNewCard}
                  currentFamilyDef={currentFamilyDef}
                  currentProfileBadges={currentProfileBadges}
                  rulesMode={rulesMode}
                  hasUnsavedChanges={hasUnsavedChanges}
                  blockingValidationIssues={blockingValidationIssues}
                  warningValidationIssues={warningValidationIssues}
                  trackerLabel={trackerStatusLabel}
                  currentStage={workspaceStage}
                  onSave={() => { void handleSaveCard(); }}
                  onClose={handleCancelCardEdit}
                  onNewCard={handleAddCard}
                  onOpenLibrary={() => setIsCardLibraryMobileOpen(true)}
                />

                <div className={`${retro.sunken} bg-[#081022] p-3 space-y-3`} style={editorSurfaceStyle(stageMeta.accent)}>
                  <div className="flex flex-wrap gap-2">
                    {CARD_WORKSPACE_STAGES.map((stage) => {
                      const active = workspaceStage === stage.id;
                      const Icon = stage.icon;
                      return (
                        <button
                          key={stage.id}
                          onClick={() => selectWorkspaceStage(stage.id)}
                          className={`${active ? retro.sunken + " bg-[#0A173A]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-2 text-[11px] flex items-center gap-1.5 transition-colors`}
                          style={{ color: active ? stage.accent : "#8A9ABB", fontWeight: active ? 600 : 400 }}
                        >
                          <Icon size={12} /> {stage.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className={liveEditStageActive ? "grid grid-cols-1 2xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] gap-2.5" : "grid grid-cols-1 2xl:grid-cols-2 gap-2.5"}>
                    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-2.5">
                      {[
                        {
                          label: "Current Stage",
                          value: `${activeStageCard?.title || stageMeta.label}`,
                          detail: activeStageCard?.summary || stageMeta.helper,
                          accent: stageMeta.accent,
                        },
                        {
                          label: "Workspace Status",
                          value: activeStageCard?.detail || "Open a card section to begin editing.",
                          detail: `${filteredCards.length} card${filteredCards.length === 1 ? "" : "s"} shown in the library`,
                          accent: "#7ACA8A",
                        },
                      ].map((item) => (
                        <div key={item.label} className={`${retro.raised} bg-[#0E0E35] p-3.5 space-y-2`} style={editorSurfaceStyle(item.accent)}>
                          <div className="text-[9px] uppercase tracking-[0.06em]" style={S_SECTION_HDR}>{item.label}</div>
                          <div className="text-[13px] leading-snug break-words" style={S_TEXT}>{item.value}</div>
                          <div className="text-[11px] leading-relaxed break-words" style={S_SUBTLE}>{item.detail}</div>
                        </div>
                      ))}
                    </div>

                    {liveEditStageActive && (
                      <div className={`${retro.raised} bg-[#0E0E35] p-3.5 space-y-2.5`} style={editorSurfaceStyle(validationIssues.length > 0 ? (blockingValidationIssues.length > 0 ? "#FF7A7A" : "#FFD700") : "#7A8AAA")}>
                        <div className="text-[9px] uppercase tracking-[0.06em]" style={S_SECTION_HDR}>Open Issues</div>
                        {validationIssues.length === 0 ? (
                          <div className="text-[11px] leading-relaxed" style={S_SUBTLE}>No open issues. The live preview is ready for direct editing.</div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => focusValidationIssue(validationIssues[0])}
                            className={`${retro.sunken} w-full bg-[#0B1128] p-3 text-left`}
                            style={editorSurfaceStyle(validationIssues[0].level === "error" ? "#FF7A7A" : "#FFD700")}
                          >
                            <div className="text-[10px]" style={validationIssues[0].level === "error" ? S_RED : { color: "#FFD700" }}>
                              {validationIssues[0].level === "error" ? "Error" : "Warning"}
                            </div>
                            <div className="text-[12px] leading-relaxed mt-1" style={S_TEXT}>{validationIssues[0].message}</div>
                            {validationIssues.length > 1 && (
                              <div className="text-[10px] mt-2" style={S_SUBTLE}>+{validationIssues.length - 1} more issue{validationIssues.length - 1 === 1 ? "" : "s"}</div>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {!liveEditStageActive && validationIssues.length > 0 && (
                  <div className={`${retro.sunken} bg-[#0B1128] p-3 space-y-2`} style={editorSurfaceStyle(blockingValidationIssues.length > 0 ? "#FF7A7A" : "#FFD700")}>
                    <div className="text-[10px]" style={S_SECTION_HDR}>OPEN ISSUES</div>
                    <div className="space-y-2">
                      {validationIssues.slice(0, 4).map((issue) => (
                        <button
                          key={issue.id}
                          type="button"
                          onClick={() => focusValidationIssue(issue)}
                          className={`${retro.raised} w-full p-3 text-left`}
                          style={editorSurfaceStyle(issue.level === "error" ? "#FF7A7A" : "#FFD700")}
                        >
                          <div className="text-[10px]" style={issue.level === "error" ? S_RED : { color: "#FFD700" }}>
                            {issue.level === "error" ? "Error" : "Warning"}
                          </div>
                          <div className="text-[11px] leading-relaxed mt-1" style={S_TEXT}>{issue.message}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className={liveEditStageActive ? "space-y-4" : "grid grid-cols-1 xl:grid-cols-[minmax(520px,0.92fr)_minmax(780px,1.08fr)] gap-7 items-start"}>
                {!liveEditStageActive && (
                  <div className="space-y-4 order-2 xl:order-1">
                    {workspaceStage === "overview" && renderOverviewStage()}
                    {workspaceStage === "rules" && renderRulesStage()}
                    {workspaceStage === "effects" && renderEffectsStage()}
                    {workspaceStage === "delivery" && renderDeliveryStage()}
                  </div>
                )}

                <div className={liveEditStageActive ? "pb-6" : "order-1 xl:order-2"}>
                  {livePreviewCard && (
                    <InteractiveCardPreview
                      card={livePreviewCard}
                      editingCard={editingCard}
                      players={players}
                      nodeTrees={nodeTrees}
                      cardTags={cardTags}
                      playerFacingTagBadges={playerFacingTagBadges}
                      rulesMode={rulesMode}
                      quickRollSlots={quickRollSlots}
                      currentStage={workspaceStage}
                      previewFocusRegion={previewFocusRegion}
                      previewEditField={previewEditField}
                      onStageSelect={selectWorkspaceStage}
                      onPreviewFocus={setPreviewFocusRegion}
                      onPreviewEditFieldChange={setPreviewEditField}
                      onUpdateCardField={updateCardField}
                      onUpdateCardCustomField={updateCardCustomField}
                      onRulesModeChange={(mode) => {
                        setRulesMode(mode);
                        setRulesSubTab(mode === "guided" ? "builder" : "main-effect");
                        if (mode === "guided") setMechanicsView("rules");
                      }}
                      renderTagFieldInput={renderCardTagFieldInput}
                      onAddQuickRoll={addQuickRollSlot}
                      onRemoveQuickRoll={removeQuickRollSlot}
                      stickyPreview={false}
                      panelClassName={liveEditStageActive ? "min-h-[calc(100vh-2rem)] 2xl:min-h-[calc(100vh+2rem)]" : ""}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMagicManager = () => {
    const selectedPlayer = players.find((player) => player.id === magicSelectedPlayerId);
    const sortedMagicLists = [...magicLists].sort((a, b) => a.order - b.order);
    const totalSpells = sortedMagicLists.reduce(
      (sum, list) => sum + MAGIC_TIER_ORDER.reduce((tierSum, tier) => tierSum + (list.tiers[tier]?.length || 0), 0),
      0,
    );
    const occupiedTierCount = sortedMagicLists.reduce(
      (sum, list) => sum + MAGIC_TIER_ORDER.filter((tier) => (list.tiers[tier] || []).length > 0).length,
      0,
    );

    return (
      <div className="space-y-4">
        <div className={`${retro.raised} p-4 space-y-3`} style={editorSurfaceStyle("#8AB8FF")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[12px]" style={S_SECTION_HDR}>PLAYER MAGIC LISTS</div>
              <div className="text-[11px] mt-1 max-w-[720px]" style={S_SUBTLE}>
                Build spell-style lists per player, organize them by Cantrips through Level 8, and keep those grants separate from direct card assignment.
              </div>
            </div>
            <span className="text-[10px] px-2.5 py-1.5" style={sectionBadgeStyle("#8AB8FF")}>
              Magic manager
            </span>
          </div>
        </div>

        {renderManagementSummaryCards([
          {
            label: "Selected Player",
            value: selectedPlayer ? selectedPlayer.name : "No player selected",
            accent: "#8AB8FF",
            helper: selectedPlayer ? `${selectedPlayer.class || "No class"} | Level ${selectedPlayer.level}` : "Choose a player to load their spell lists.",
          },
          {
            label: "Magic Lists",
            value: `${sortedMagicLists.length}`,
            accent: "#5A9AFF",
            helper: "Each list acts like a separate spell school, tradition, or source.",
          },
          {
            label: "Assigned Spells",
            value: `${totalSpells}`,
            accent: "#FFD700",
            helper: "Counts every spell currently placed into any tier for this player.",
          },
          {
            label: "Occupied Tiers",
            value: `${occupiedTierCount}`,
            accent: "#7ACA8A",
            helper: "Shows how many Cantrip / Level buckets currently have cards in them.",
          },
        ])}

        {players.length === 0 ? (
          <div className="text-[12px] text-center py-6" style={S_MUTED}>No players created yet. Add players in the Manage Players section first.</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4">
            <div className={`${retro.sunken} bg-[#0C0C2E] p-4 space-y-3`} style={editorSurfaceStyle("#5A9AFF")}>
              <div>
                <div className="text-[11px]" style={S_SECTION_HDR}>PLAYER ROSTER</div>
                <div className="text-[10px] mt-1" style={S_SUBTLE}>Pick whose magic lists you want to edit. Each player keeps a separate set.</div>
              </div>
              <div className="space-y-2">
                {players.map((player) => {
                  const isActive = magicSelectedPlayerId === player.id;
                  return (
                    <button
                      key={player.id}
                      onClick={() => setMagicSelectedPlayerId(player.id)}
                      className={`${isActive ? retro.sunken : retro.raised} w-full p-3 text-left transition-colors`}
                      style={editorSurfaceStyle(isActive ? "#8AB8FF" : "#273357")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <User size={12} style={{ color: isActive ? "#8AB8FF" : "#5A7BB8" }} />
                            <span className="text-[12px] truncate" style={{ color: isActive ? "#B7D4FF" : "#C0D0F0", fontWeight: 700 }}>{player.name}</span>
                          </div>
                          <div className="text-[10px] mt-1 break-words" style={S_SUBTLE}>
                            {player.class || "No class"} | Level {player.level}
                          </div>
                          {(player.race || "").trim() && (
                            <div className="text-[10px] mt-1" style={S_MUTED}>{player.race}</div>
                          )}
                        </div>
                        {isActive && <span className="text-[8px] px-2 py-0.5 shrink-0" style={sectionBadgeStyle("#8AB8FF")}>Active</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`${retro.sunken} bg-[#0C0C2E] p-4 space-y-4`} style={editorSurfaceStyle("#8AB8FF")}>
              <div className={`${retro.raised} p-4 space-y-3`} style={editorSurfaceStyle("#8AB8FF")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px]" style={S_SECTION_HDR}>LIST WORKSPACE</div>
                    <div className="text-[10px] mt-1" style={S_SUBTLE}>
                      {selectedPlayer ? `Editing spell lists for ${selectedPlayer.name}.` : "Select a player to begin."}
                    </div>
                  </div>
                  {!magicAddingList ? (
                    <button onClick={() => setMagicAddingList(true)} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                      <Plus size={14} /> Add Magic List
                    </button>
                  ) : null}
                </div>
                {magicAddingList ? (
                  <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                    <input
                      value={magicNewListName}
                      onChange={(e) => setMagicNewListName(e.target.value)}
                      placeholder="Magic list name (e.g. Light Magic)"
                      className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] flex-1 outline-none`}
                      style={{ color: "#8AB8FF" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && magicNewListName.trim()) {
                          void saveMagicLists([
                            ...magicLists,
                            createEmptyMagicList(magicNewListName.trim(), magicLists.length),
                          ]);
                          setMagicNewListName("");
                          setMagicAddingList(false);
                        }
                        if (e.key === "Escape") {
                          setMagicAddingList(false);
                          setMagicNewListName("");
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (!magicNewListName.trim()) return;
                          void saveMagicLists([
                            ...magicLists,
                            createEmptyMagicList(magicNewListName.trim(), magicLists.length),
                          ]);
                          setMagicNewListName("");
                          setMagicAddingList(false);
                        }}
                        className={`${retro.button} px-3 py-2 text-[11px]`}
                        style={S_GREEN_BTN}
                      >
                        <Save size={12} className="inline mr-1" />Add
                      </button>
                      <button onClick={() => { setMagicAddingList(false); setMagicNewListName(""); }} className={`${retro.button} px-3 py-2 text-[11px]`} style={S_RED}><X size={12} className="inline mr-1" />Cancel</button>
                    </div>
                  </div>
                ) : null}
              </div>

              {magicAddingList ? (
                <div className="text-[11px] text-center py-6" style={S_MUTED}>Saving new list...</div>
              ) : sortedMagicLists.length === 0 ? (
                <div className={`${retro.raised} bg-[#0E0E35] p-6 text-center`} style={editorSurfaceStyle("#8AB8FF")}>
                  <div className="text-[11px]" style={S_MUTED}>
                    {selectedPlayer ? `No magic lists yet for ${selectedPlayer.name}. Start with one named list and then sort spells into tiers.` : "Select a player to manage magic lists."}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedMagicLists.map((list, listIdx) => {
                    const isCollapsed = magicCollapsedLists.has(list.id);
                    const listCardIds = new Set(MAGIC_TIER_ORDER.flatMap((tier) => list.tiers[tier] || []));
                    const tierCount = MAGIC_TIER_ORDER.filter((tier) => (list.tiers[tier] || []).length > 0).length;
                    return (
                      <div key={list.id} className={`${retro.sunken} bg-[#0C0C2E]`} style={editorSurfaceStyle("#8AB8FF")}>
                        <div
                          className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-[#0E0E35] transition-colors"
                          style={{ borderBottom: isCollapsed ? "none" : "1px solid #1A1A4B" }}
                          onClick={() => setMagicCollapsedLists((prev) => { const next = new Set(prev); if (next.has(list.id)) next.delete(list.id); else next.add(list.id); return next; })}
                        >
                          <ChevronRight size={14} style={{ color: "#8AB8FF", marginTop: 2, transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 0.2s ease" }} />
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {magicEditingList === list.id ? (
                                <input
                                  value={list.name}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => void saveMagicLists(magicLists.map((entry) => entry.id === list.id ? { ...entry, name: e.target.value } : entry))}
                                  onBlur={() => setMagicEditingList(null)}
                                  onKeyDown={(e) => { if (e.key === "Enter") setMagicEditingList(null); }}
                                  className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[13px] flex-1 outline-none`}
                                  style={{ color: "#8AB8FF" }}
                                  autoFocus
                                />
                              ) : (
                                <span className="text-[13px] break-words" style={{ color: "#8AB8FF", fontWeight: 700 }}>{list.name}</span>
                              )}
                              <span className="text-[9px] px-1.5 py-0.5" style={sectionBadgeStyle("#8AB8FF")}>
                                {Array.from(listCardIds).length} spells
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5" style={sectionBadgeStyle("#FFD700")}>
                                {tierCount} tier{tierCount === 1 ? "" : "s"} used
                              </span>
                            </div>
                            <div className="text-[10px] leading-relaxed" style={S_SUBTLE}>
                              {(list.description || "").trim() || "No description yet. Add quick notes for theme, source, or learning rules."}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {listIdx > 0 && (
                              <button onClick={() => void saveMagicLists(magicLists.map((entry) => entry.id === list.id ? { ...entry, order: sortedMagicLists[listIdx - 1].order } : entry.id === sortedMagicLists[listIdx - 1].id ? { ...entry, order: list.order } : entry))} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#7A8AAA" }} title="Move up"><ChevronUp size={12} /></button>
                            )}
                            {listIdx < sortedMagicLists.length - 1 && (
                              <button onClick={() => void saveMagicLists(magicLists.map((entry) => entry.id === list.id ? { ...entry, order: sortedMagicLists[listIdx + 1].order } : entry.id === sortedMagicLists[listIdx + 1].id ? { ...entry, order: list.order } : entry))} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#7A8AAA" }} title="Move down"><ChevronDown size={12} /></button>
                            )}
                            <button onClick={() => setMagicEditingList(list.id)} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#4A7BFF" }} title="Rename"><Edit size={12} /></button>
                            <button onClick={() => void saveMagicLists(magicLists.filter((entry) => entry.id !== list.id))} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#FF5A5A" }} title="Delete list"><Trash2 size={12} /></button>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="px-4 pb-4 pt-2 space-y-4">
                            <div>
                              <div className="text-[10px] mb-1" style={S_SECTION_HDR}>DESCRIPTION</div>
                              {magicEditingDesc === list.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={list.description || ""}
                                    onChange={(e) => void saveMagicLists(magicLists.map((entry) => entry.id === list.id ? { ...entry, description: e.target.value } : entry))}
                                    placeholder="Add notes for this magic list..."
                                    className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[11px] w-full outline-none resize-y min-h-[60px]`}
                                    style={{ color: "#C0D0F0" }}
                                    rows={3}
                                  />
                                  <button onClick={() => setMagicEditingDesc(null)} className={`${retro.button} px-3 py-1 text-[10px]`} style={S_ACCENT}>Done</button>
                                </div>
                              ) : (
                                <div className="text-[11px] cursor-pointer px-2 py-1.5 hover:bg-[#0A0A28] transition-colors" style={{ color: list.description ? "#C0D0F0" : "#4A5A7A", border: "1px dashed #1A1A4B" }} onClick={() => setMagicEditingDesc(list.id)}>
                                  {list.description || "Click to add a description..."}
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                              {MAGIC_TIER_ORDER.map((tier) => {
                                const tierCards = (list.tiers[tier] || [])
                                  .map((cardId) => managedCards.find((card) => card.id === cardId))
                                  .filter(Boolean) as ManagedCard[];
                                const availableCards = managedCards.filter((card) => !listCardIds.has(card.id));

                                return (
                                  <div key={`${list.id}-${tier}`} className={`${retro.raised} bg-[#0E0E35] p-3 space-y-2`} style={{ border: "1px solid #1A1A4B" }}>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-[11px]" style={S_SECTION_HDR}>{MAGIC_TIER_LABELS[tier]}</div>
                                        <div className="text-[9px]" style={S_SUBTLE}>{tierCards.length} card{tierCards.length === 1 ? "" : "s"}</div>
                                      </div>
                                      {tierCards.length === 0 ? (
                                        <div className="text-[10px]" style={S_MUTED}>No spells assigned to this tier.</div>
                                      ) : (
                                        <div className="space-y-1">
                                          {tierCards.map((card) => (
                                            <div key={`${list.id}-${tier}-${card.id}`} className={`${retro.raised} bg-[#11163D] p-2 flex items-center justify-between gap-2`} style={editorSurfaceStyle("#273357")}>
                                              <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                  <div className="text-[12px] break-words" style={S_TEXT_BOLD}>{card.name}</div>
                                                  {card.customFields["Level"] && parseInt(card.customFields["Level"] || "0", 10) > 0 && (
                                                    <span className="text-[8px] px-1.5 py-0.5" style={DM_LEVEL_BADGE}>Lv.{card.customFields["Level"]}</span>
                                                  )}
                                                </div>
                                                <div className="text-[10px] break-words" style={S_MUTED}>{card.type} | {card.actionCost || "No action cost"}</div>
                                              </div>
                                              <button
                                                onClick={() => updateMagicListTierCards(list.id, tier, (list.tiers[tier] || []).filter((cardId) => cardId !== card.id))}
                                                className={`${retro.button} px-2 py-1 text-[10px] shrink-0`}
                                                style={S_RED}
                                              >
                                                <X size={10} className="inline mr-0.5" />Remove
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                    {availableCards.length > 0 && (
                                      <select
                                        className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[11px] w-full outline-none`}
                                        style={{ color: "#C0D0F0" }}
                                        value=""
                                        onChange={(e) => {
                                          if (!e.target.value) return;
                                          const cardId = e.target.value;
                                          const nextLists = magicLists.map((entry) => {
                                            if (entry.id !== list.id) return entry;
                                            const nextTiers = { ...entry.tiers };
                                            for (const tierKey of MAGIC_TIER_ORDER) {
                                              nextTiers[tierKey] = (nextTiers[tierKey] || []).filter((id) => id !== cardId);
                                            }
                                            nextTiers[tier] = [...(nextTiers[tier] || []), cardId];
                                            return {
                                              ...entry,
                                              tiers: nextTiers,
                                            };
                                          });
                                          void saveMagicLists(nextLists);
                                        }}
                                      >
                                        <option value="">+ Add spell to {MAGIC_TIER_LABELS[tier]}...</option>
                                        {availableCards.map((card) => <option key={`${list.id}-${tier}-${card.id}`} value={card.id}>{card.name} ({card.type})</option>)}
                                      </select>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
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
  };

  return (
    <div className="space-y-4">
      <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage Cards</h2>

      <div className="flex flex-wrap gap-2 mb-2">
        {([
          { id: "cards" as const, label: "Player Cards", icon: CreditCard, accent: "#4A7BFF" },
          { id: "magic" as const, label: "Magic", icon: Sparkles, accent: "#8AB8FF" },
          { id: "levelabilities" as const, label: "Level", icon: Zap, accent: "#FFD700" },
        ]).map((sub) => (
          <button
            key={sub.id}
            onClick={() => handleCardsSubTabChange(sub.id)}
            className={`${dmCardsSubTab === sub.id ? retro.sunken + " bg-[#0C0C2E]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-4 py-2 text-[12px] flex items-center gap-1.5 transition-colors`}
            style={{ color: dmCardsSubTab === sub.id ? sub.accent : "#8A9ABB", fontWeight: dmCardsSubTab === sub.id ? 600 : 400 }}
          >
            <sub.icon size={14} /> {sub.label}
          </button>
        ))}
      </div>

      {renderManagementSummaryCards(
        dmCardsSubTab === "cards"
          ? [
              { label: "Library Cards", value: `${managedCards.length}`, accent: "#4A7BFF", helper: "Open, sort, and edit the full card library." },
              { label: "Assigned Node Trees", value: `${nodeTrees.length}`, accent: "#FFD700", helper: "Use the delivery stage to place cards into progression trees." },
              { label: "Players", value: `${players.length}`, accent: "#7ACA8A", helper: "Direct assignment, Magic, and Level rewards all route through these player profiles." },
            ]
          : dmCardsSubTab === "magic"
            ? [
                { label: "Selected Player", value: players.find((player) => player.id === magicSelectedPlayerId)?.name || "None", accent: "#8AB8FF", helper: "Magic lists are stored per player." },
                { label: "Magic Lists", value: `${magicLists.length}`, accent: "#5A9AFF", helper: "Each list behaves like its own spell catalog." },
                { label: "Placed Spells", value: `${magicLists.reduce((sum, list) => sum + MAGIC_TIER_ORDER.reduce((tierSum, tier) => tierSum + (list.tiers[tier]?.length || 0), 0), 0)}`, accent: "#FFD700", helper: "These spells can later appear in Personal Files Magic Lists." },
              ]
            : [
                { label: "Selected Player", value: players.find((player) => player.id === laSelectedPlayerId)?.name || "None", accent: "#FFD700", helper: "Level sections are also stored per player." },
                { label: "Sections", value: `${levelCategories.length}`, accent: "#5A9AFF", helper: "Race, Level 1, and later milestones all live here." },
                { label: "Reward Cards", value: `${levelCategories.reduce((sum, level) => sum + getLevelCategoryEntries(level).length, 0)}`, accent: "#FF9A7A", helper: "Use passive-only or show-in-cards reward modes." },
              ],
        "grid grid-cols-1 md:grid-cols-3 gap-3",
      )}

      {dmCardsSubTab === "cards" && renderCardsWorkspace()}
      {dmCardsSubTab === "magic" && renderMagicManager()}

      {dmCardsSubTab === "levelabilities" && (() => {
        const sortedLevels = [...levelCategories].sort((a, b) => a.order - b.order);
        const selectedPlayer = players.find((p) => p.id === laSelectedPlayerId);
        const totalRewardCards = levelCategories.reduce((sum, level) => sum + getLevelCategoryEntries(level).length, 0);
        const describedSections = levelCategories.filter((level) => (level.description || "").trim()).length;
        return (
          <div className="space-y-4">
            <div className={`${retro.raised} p-4 space-y-3`} style={editorSurfaceStyle("#FFD700")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[12px]" style={S_SECTION_HDR}>LEVEL CATEGORIES</div>
                  <div className="text-[11px] mt-1 max-w-[760px]" style={S_SUBTLE}>
                    Create rich-text progression sections per player, including Race, Level 1, and later milestones. Each section can hold formatted notes plus attached reward cards.
                  </div>
                </div>
                <span className="text-[10px] px-2.5 py-1.5" style={sectionBadgeStyle("#FFD700")}>
                  Level manager
                </span>
              </div>
            </div>

            {renderManagementSummaryCards([
              {
                label: "Selected Player",
                value: selectedPlayer ? selectedPlayer.name : "No player selected",
                accent: "#FFD700",
                helper: selectedPlayer ? `${selectedPlayer.class || "No class"} | Level ${selectedPlayer.level}` : "Choose a player to load their progression sections.",
              },
              {
                label: "Sections",
                value: `${levelCategories.length}`,
                accent: "#5A9AFF",
                helper: "Includes Race plus every created level or milestone section.",
              },
              {
                label: "Reward Cards",
                value: `${totalRewardCards}`,
                accent: "#FF9A7A",
                helper: "Counts all passive and show-in-cards rewards attached to this player.",
              },
              {
                label: "Written Sections",
                value: `${describedSections}`,
                accent: "#7ACA8A",
                helper: "Sections with rich text, lists, or progression notes already filled out.",
              },
            ])}

            {players.length === 0 ? (
              <div className="text-[12px] text-center py-6" style={S_MUTED}>No players created yet. Add players in the Manage Players section first.</div>
            ) : (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 mb-4">
                  {players.map((p) => {
                    const isActive = laSelectedPlayerId === p.id;
                    const totalCards = isActive ? totalRewardCards : 0;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setLaSelectedPlayerId(p.id)}
                        className={`${isActive ? retro.sunken : retro.raised} p-3 text-left transition-colors`}
                        style={editorSurfaceStyle(isActive ? "#FFD700" : "#273357")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <User size={12} style={{ color: isActive ? "#FFD700" : "#7A8AAA" }} />
                              <span className="text-[12px] truncate" style={{ color: isActive ? "#FFE38A" : "#C0D0F0", fontWeight: 700 }}>{p.name}</span>
                            </div>
                            <div className="text-[10px] mt-1 break-words" style={S_SUBTLE}>
                              {p.class || "No class"} | Level {p.level}
                            </div>
                            {(p.race || "").trim() && (
                              <div className="text-[10px] mt-1" style={S_MUTED}>{p.race}</div>
                            )}
                          </div>
                          {isActive ? (
                            <div className="text-right shrink-0">
                              <div className="text-[8px] px-2 py-0.5 mb-1" style={sectionBadgeStyle("#FFD700")}>Active</div>
                              <div className="text-[9px]" style={S_SUBTLE}>{levelCategories.length} sections</div>
                              <div className="text-[9px]" style={S_SUBTLE}>{totalCards} rewards</div>
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedPlayer && (
                  <div className={`${retro.raised} p-4 mb-3`} style={editorSurfaceStyle("#C4A0FF")}>
                    {!laCopyConfirm ? (
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <div className="text-[11px]" style={S_SECTION_HDR}>COPY THIS PROGRESSION</div>
                          <div className="text-[10px] mt-1" style={S_SUBTLE}>
                            Use {selectedPlayer.name}'s Race and Level setup as the template for everyone else when you need a shared progression baseline.
                          </div>
                        </div>
                        <button
                          onClick={() => setLaCopyConfirm(true)}
                          className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1.5`}
                          style={{ color: "#C4A0FF", border: "1px solid #C4A0FF33" }}
                          title={`Copy ${selectedPlayer.name}'s level categories to all other players`}
                        >
                          <Copy size={11} /> Copy {selectedPlayer.name}'s Levels to All Players
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col md:flex-row md:items-center gap-3">
                        <span className="text-[10px] leading-relaxed" style={{ color: "#FF9A4A" }}>
                          This will overwrite all other players' level categories with {selectedPlayer.name}'s. Continue?
                        </span>
                        <div className="flex items-center gap-2">
                          <button onClick={copyLevelCategoriesToAllPlayers} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_GREEN_BTN}>Yes, Copy</button>
                          <button onClick={() => setLaCopyConfirm(false)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className={`${retro.sunken} bg-[#0C0C2E] p-4 space-y-4`} style={editorSurfaceStyle("#FFD700")}>
                  <div className={`${retro.raised} p-4 space-y-3`} style={editorSurfaceStyle("#FFD700")}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px]" style={S_SECTION_HDR}>SECTION WORKSPACE</div>
                        <div className="text-[10px] mt-1" style={S_SUBTLE}>
                          Add Race, Level, or milestone sections, then attach cards as passive or usable rewards.
                        </div>
                      </div>
                      {!laAddingLevel ? (
                        <button onClick={() => setLaAddingLevel(true)} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                          <Plus size={14} /> Add Level Section
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {laAddingLevel ? (
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                      <input
                        value={laNewLevelName}
                        onChange={(e) => setLaNewLevelName(e.target.value)}
                        placeholder="Level name (e.g. Level 1, Tier 2...)"
                        className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] flex-1 outline-none`}
                        style={{ color: "#FFD700" }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && laNewLevelName.trim()) {
                            const newCat: LevelCategory = { id: `lvl-${Date.now()}`, name: laNewLevelName.trim(), order: levelCategories.length, cardEntries: [], description: "" };
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (!laNewLevelName.trim()) return;
                            const newCat: LevelCategory = { id: `lvl-${Date.now()}`, name: laNewLevelName.trim(), order: levelCategories.length, cardEntries: [], description: "" };
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
                    </div>
                  ) : null}

                  {levelCategories.length === 0 ? (
                    <div className="text-[11px] text-center py-6" style={S_MUTED}>No level categories yet for this player.</div>
                  ) : (() => {
                    const availableLevelCards = managedCards;
                    return (<>
                      <div className="text-[10px]" style={S_SUBTLE}>
                        {selectedPlayer?.name} has <span style={S_TEXT}>{availableLevelCards.length}</span> total card{availableLevelCards.length !== 1 ? "s" : ""} available for level rewards.
                      </div>
                      <div className="space-y-3">
                        {sortedLevels.map((level, levelIdx) => {
                          const isCollapsed = laCollapsedLevels.has(level.id);
                          const levelEntries = getLevelCategoryEntries(level);
                          const levelCards = availableLevelCards.filter((card) => levelEntries.some((entry) => entry.cardId === card.id));
                          const availableCards = availableLevelCards.filter((card) => !levelEntries.some((entry) => entry.cardId === card.id));
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
                                        <RichTextEditor
                                          value={level.description || ""}
                                          onChange={(html) => void saveLevelCategories(levelCategories.map((lc) => lc.id === level.id ? { ...lc, description: html } : lc))}
                                          placeholder="Add a description, list, or progression notes for this section..."
                                          minHeight={140}
                                        />
                                        <button onClick={() => setLaEditingDesc(null)} className={`${retro.button} px-3 py-1 text-[10px]`} style={S_ACCENT}>Done</button>
                                      </div>
                                    ) : (
                                      <div className="text-[11px] cursor-pointer px-2 py-1.5 hover:bg-[#0A0A28] transition-colors" style={{ color: level.description ? "#C0D0F0" : "#4A5A7A", border: "1px dashed #1A1A4B" }} onClick={() => setLaEditingDesc(level.id)}>
                                        {level.description ? (
                                          <RenderFormattedText text={level.description} color="#C0D0F0" baseSize={11} />
                                        ) : (
                                          "Click to add a description, list, or notes..."
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <div className="text-[10px] mb-1" style={S_SECTION_HDR}>ASSIGNED CARDS ({levelCards.length})</div>
                                    {levelCards.length === 0 ? (
                                      <div className="text-[11px] py-2" style={S_MUTED}>No rewards assigned to this level yet.</div>
                                    ) : (
                                      <div className="space-y-1">
                                        {levelCards.map((card) => (
                                          <div key={card.id} className={`${retro.raised} bg-[#0E0E35] p-2 flex items-center justify-between`}>
                                            <div>
                                              <span className="text-[12px]" style={S_TEXT_BOLD}>{card.name}</span>
                                              <span className="text-[10px] ml-2" style={S_MUTED}>{card.type} | {card.actionCost}</span>
                                              <span className="text-[10px] ml-2" style={{ color: levelEntries.find((entry) => entry.cardId === card.id)?.showInCards ? "#8AB8FF" : "#FFD700" }}>
                                                {levelEntries.find((entry) => entry.cardId === card.id)?.showInCards ? "Shows in Cards" : "Passive Only"}
                                              </span>
                                              {card.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                  {card.tags.map((t) => <span key={t} className="text-[8px] px-1 py-0.5" style={DM_TAG_BADGE}>{t}</span>)}
                                                </div>
                                              )}
                                            </div>
                                            <button onClick={() => void saveLevelCategories(levelCategories.map((lc) => lc.id === level.id ? { ...lc, cardEntries: getLevelCategoryEntries(lc).filter((entry) => entry.cardId !== card.id) } : lc))} className={`${retro.button} px-2 py-1 text-[10px] shrink-0`} style={S_RED}>
                                              <X size={10} className="inline mr-0.5" />Remove
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {availableCards.length > 0 && (
                                    <div>
                                      <div className="text-[10px] mb-1" style={S_SECTION_HDR}>ADD REWARD</div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <select className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[11px] w-full outline-none`} style={{ color: "#C0D0F0" }} value="" onChange={(e) => {
                                          if (!e.target.value) return;
                                          const cardId = e.target.value;
                                          void saveLevelCategories(levelCategories.map((lc) => ({
                                            ...lc,
                                            cardEntries: lc.id === level.id ? [...getLevelCategoryEntries(lc).filter((entry) => entry.cardId !== cardId), { cardId, showInCards: false }] : getLevelCategoryEntries(lc).filter((entry) => entry.cardId !== cardId),
                                          })));
                                        }}>
                                          <option value="">+ Passive reward for {level.name}...</option>
                                          {availableCards.map((c) => <option key={`${level.id}-passive-${c.id}`} value={c.id}>{c.name} ({c.type})</option>)}
                                        </select>
                                        <select className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[11px] w-full outline-none`} style={{ color: "#C0D0F0" }} value="" onChange={(e) => {
                                          if (!e.target.value) return;
                                          const cardId = e.target.value;
                                          void saveLevelCategories(levelCategories.map((lc) => ({
                                            ...lc,
                                            cardEntries: lc.id === level.id ? [...getLevelCategoryEntries(lc).filter((entry) => entry.cardId !== cardId), { cardId, showInCards: true }] : getLevelCategoryEntries(lc).filter((entry) => entry.cardId !== cardId),
                                          })));
                                        }}>
                                          <option value="">+ Usable reward for {level.name}...</option>
                                          {availableCards.map((c) => <option key={`${level.id}-usable-${c.id}`} value={c.id}>{c.name} ({c.type})</option>)}
                                        </select>
                                      </div>
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
