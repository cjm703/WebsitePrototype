
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { retro } from "./retro-styles";
import {
  Plus, Save, Edit, Tag, ChevronDown, ChevronRight, Trash2, Search, Sparkles, Layers3, AlertTriangle,
} from "lucide-react";
import { TagFieldEditorRow, TYPE_ICONS, FIELD_TYPES } from "./tag-field-renderer";
import {
  S_MUTED, S_DIM, S_TEXT, S_ACCENT, S_RED, S_SUBTLE, S_SECTION_HDR, S_GREEN_BTN,
} from "./dm-styles";
import { loadDMTags, saveDMTags } from "@/lib/player-state-api";
import {
  initialItemTags as sharedInitialItemTags,
  initialCardTags as sharedInitialCardTags,
  initialInfoTags as sharedInitialInfoTags,
  initialStatusTags as sharedInitialStatusTags,
  initialWikiTags as sharedInitialWikiTags,
} from "./initial-data";
import type { TagField, TagDefinition } from "./types";

type CardFamilyHint = "spell" | "skill" | "ability";
type CardPurposeHint = "attack" | "heal" | "support" | "utility" | "control" | "reaction" | "passive";
type CardTargetHint = "self" | "ally" | "enemy" | "area";
type CardCostHint = "source" | "exhaustion" | "uses-rest" | "passive";
type CardTemplateHint = "blank" | "attack" | "heal" | "buff" | "debuff" | "reaction" | "passive" | "utility";
type CardEditorFocusHint = "core" | "mechanics" | "tags" | "progression" | "assignment";
type CardPresentationVisibility = "show" | "dm-only" | "hidden";

type RichTagMeta = {
  roleHint?: TagCreateIntent;
  collection?: string;
  group?: string;
  color?: string;
  aliases?: string[];
  usageNotes?: string;
  isDeprecated?: boolean;
  replacementTagId?: string;
  replacementTagName?: string;
  renameHistory?: string[];
  recommendedCardFamilies?: CardFamilyHint[];
  recommendedCardPurposes?: CardPurposeHint[];
  starterCardTargeting?: CardTargetHint;
  starterCardCostModel?: CardCostHint;
  cardCreationNote?: string;
  starterCardTemplate?: CardTemplateHint;
  starterCardFocusPanel?: CardEditorFocusHint;
  playerFacingVisibility?: CardPresentationVisibility;
  playerFacingBadgeLabel?: string;
  playerFacingFilterGroup?: string;
  playerFacingSortOrder?: number;
};

type RichTagDefinition = TagDefinition & {
  meta?: RichTagMeta;
};

type TagSubPage = "items" | "cards" | "info" | "status" | "wiki";
type TagCreateMode = "single" | "batch" | "packs";
type TagRoleFilter = "all" | "descriptor" | "identifier" | "targeting" | "legacy";
type TagCreateIntent = "descriptor" | "identifier" | "targeting";
type TagDeprecationFilter = "active" | "deprecated" | "all";

const labelStyle = { color: "#5A6A8A" } as const;
const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;
const inputStyle = { color: "#C0D0F0" } as const;

interface DMTagsSectionProps {
  isVisible?: boolean;
  initialItemTags?: TagDefinition[];
  initialCardTags?: TagDefinition[];
  initialInfoTags?: TagDefinition[];
  initialStatusTags?: TagDefinition[];
  initialWikiTags?: TagDefinition[];
  onTagDataChange?: (next: {
    itemTags: TagDefinition[];
    cardTags: TagDefinition[];
    infoTags: TagDefinition[];
    statusTags: TagDefinition[];
    wikiTags: TagDefinition[];
  }) => void;
  onError?: (message: string | null) => void;
}

interface TagPackDef {
  id: string;
  label: string;
  description: string;
  tags: Array<{ name: string; description: string }>;
}

interface TagCollectionDef {
  id: string;
  label: string;
  description: string;
  groups: string[];
  accent: string;
}

interface TagIntentDef {
  id: TagCreateIntent;
  label: string;
  accent: string;
  helper: string;
}

const TAG_INTENT_OPTIONS: TagIntentDef[] = [
  {
    id: "descriptor",
    label: "Descriptor",
    accent: "#4A7BFF",
    helper: "Use for broad identity, theme, category, tone, or purpose.",
  },
  {
    id: "identifier",
    label: "Identifier",
    accent: "#FF9A4A",
    helper: "Use for labels that distinguish a subtype, domain, origin, or classification.",
  },
  {
    id: "targeting",
    label: "Targeting",
    accent: "#4ACA6A",
    helper: "Use for who or what something usually points at or affects.",
  },
];

const TAG_CREATION_EXAMPLES: Record<TagSubPage, Record<TagCreateIntent, string[]>> = {
  items: {
    descriptor: ["Weapon", "Consumable", "Quest Item", "Magical"],
    identifier: ["Source Item", "Crystal", "Light-Aligned", "Shadow-Aligned"],
    targeting: ["Thrown", "Wearable", "Held Focus", "Area Tool"],
  },
  cards: {
    descriptor: ["Attack", "Support", "Utility", "Control"],
    identifier: ["Martial", "Twilight", "Fire", "Ice"],
    targeting: ["Target: Self", "Target: Ally", "Target: Enemy", "Target: Area"],
  },
  info: {
    descriptor: ["Lore", "History", "Reference", "Warning"],
    identifier: ["Faction", "Location", "NPC", "Secret"],
    targeting: ["Player-Facing", "DM-Facing", "Quest-Relevant", "Rumor"],
  },
  status: {
    descriptor: ["Buff", "Debuff", "Condition", "Control"],
    identifier: ["Ongoing Damage", "Lingering Effect", "Combat Effect", "Mental Effect"],
    targeting: ["Affects Self", "Affects Ally", "Affects Enemy", "Area Effect"],
  },
  wiki: {
    descriptor: ["Guide", "Overview", "Reference", "Lore"],
    identifier: ["System", "Setting", "Article Series", "Index"],
    targeting: ["Player Reference", "DM Reference", "Campaign Use", "World Use"],
  },
};


const TAG_GROUP_OPTIONS: Record<TagSubPage, string[]> = {
  items: ["Identity", "Material", "Use", "Source", "Alignment", "Ownership", "Rarity"],
  cards: ["Role", "Theme", "Targeting", "Family", "Delivery", "Tracking", "Progression"],
  info: ["Subject", "Structure", "Access", "Campaign", "Lore", "Reference"],
  status: ["Effect Type", "Scope", "Severity", "Duration", "Targeting"],
  wiki: ["Article Type", "Audience", "System", "Lore", "Reference"],
};
const TAG_COLLECTIONS: Record<TagSubPage, TagCollectionDef[]> = {
  items: [
    { id: "item-core", label: "Core Identity", description: "Foundational item labels that explain what the item is and how it is generally used.", groups: ["Identity", "Use", "Ownership", "Rarity"], accent: "#4A7BFF" },
    { id: "item-source", label: "Materials & Source", description: "Labels for source, materials, magic, and alignment-based item distinctions.", groups: ["Material", "Source", "Alignment"], accent: "#FF9A4A" },
  ],
  cards: [
    { id: "card-function", label: "Function & Delivery", description: "Role, delivery, and tracking labels for how cards are broadly framed.", groups: ["Role", "Delivery", "Tracking"], accent: "#4A7BFF" },
    { id: "card-theme", label: "Theme & Family", description: "Theme, family, and domain labels for cards.", groups: ["Theme", "Family"], accent: "#FF9A4A" },
    { id: "card-targeting", label: "Targeting & Progression", description: "Targeting and progression-oriented labels for cards.", groups: ["Targeting", "Progression"], accent: "#4ACA6A" },
  ],
  info: [
    { id: "info-subject", label: "Subject & Lore", description: "What the information is about and which lore bucket it lives in.", groups: ["Subject", "Lore", "Campaign"], accent: "#FF9A4A" },
    { id: "info-structure", label: "Structure & Access", description: "How information is structured and who it is for.", groups: ["Structure", "Access", "Reference"], accent: "#4A7BFF" },
  ],
  status: [
    { id: "status-core", label: "Effect Identity", description: "What kind of tracked effect this is at a glance.", groups: ["Effect Type", "Severity"], accent: "#4A7BFF" },
    { id: "status-scope", label: "Scope & Duration", description: "Who the effect impacts and how it persists.", groups: ["Scope", "Duration", "Targeting"], accent: "#4ACA6A" },
  ],
  wiki: [
    { id: "wiki-article", label: "Article Identity", description: "What kind of wiki article this is.", groups: ["Article Type", "System", "Reference"], accent: "#4A7BFF" },
    { id: "wiki-audience", label: "Audience & Lore", description: "Audience and lore-facing wiki organization.", groups: ["Audience", "Lore"], accent: "#FF9A4A" },
  ],
};

const CARD_FAMILY_HINT_OPTIONS: Array<{ id: CardFamilyHint; label: string; accent: string }> = [
  { id: "spell", label: "Spell", accent: "#8AD4FF" },
  { id: "skill", label: "Skill", accent: "#4ACA6A" },
  { id: "ability", label: "Ability", accent: "#FF9A4A" },
];

const CARD_PURPOSE_HINT_OPTIONS: Array<{ id: CardPurposeHint; label: string; accent: string }> = [
  { id: "attack", label: "Attack", accent: "#FF8A6A" },
  { id: "heal", label: "Heal", accent: "#8AD4FF" },
  { id: "support", label: "Support", accent: "#4ACA6A" },
  { id: "utility", label: "Utility", accent: "#C4A0FF" },
  { id: "control", label: "Control", accent: "#FFB454" },
  { id: "reaction", label: "Reaction", accent: "#FFD7A0" },
  { id: "passive", label: "Passive", accent: "#A0B4FF" },
];

const CARD_TARGET_HINT_OPTIONS: Array<{ id: CardTargetHint; label: string; accent: string }> = [
  { id: "self", label: "Self", accent: "#8AD4FF" },
  { id: "ally", label: "Ally", accent: "#4ACA6A" },
  { id: "enemy", label: "Enemy", accent: "#FF8A6A" },
  { id: "area", label: "Area", accent: "#FFB454" },
];

const CARD_COST_HINT_OPTIONS: Array<{ id: CardCostHint; label: string; accent: string }> = [
  { id: "source", label: "Source", accent: "#8AD4FF" },
  { id: "exhaustion", label: "Exhaustion", accent: "#FF9A4A" },
  { id: "uses-rest", label: "Uses / Rest", accent: "#4ACA6A" },
  { id: "passive", label: "Passive", accent: "#C4A0FF" },
];

const CARD_TEMPLATE_HINT_OPTIONS: Array<{ id: CardTemplateHint; label: string; accent: string }> = [
  { id: "blank", label: "Blank", accent: "#7A8AAA" },
  { id: "attack", label: "Attack", accent: "#FF8A6A" },
  { id: "heal", label: "Heal", accent: "#8AD4FF" },
  { id: "buff", label: "Buff", accent: "#4ACA6A" },
  { id: "debuff", label: "Debuff", accent: "#FFB454" },
  { id: "reaction", label: "Reaction", accent: "#FFD7A0" },
  { id: "passive", label: "Passive", accent: "#C4A0FF" },
  { id: "utility", label: "Utility", accent: "#A0B4FF" },
];

const CARD_FOCUS_HINT_OPTIONS: Array<{ id: CardEditorFocusHint; label: string; accent: string }> = [
  { id: "core", label: "Core", accent: "#4A7BFF" },
  { id: "mechanics", label: "Mechanics", accent: "#6ABAFF" },
  { id: "tags", label: "Tags", accent: "#9A7ABB" },
  { id: "progression", label: "Progression", accent: "#4ACA6A" },
  { id: "assignment", label: "Assignment", accent: "#FFB454" },
];


const CARD_PRESENTATION_VISIBILITY_OPTIONS: Array<{ id: CardPresentationVisibility; label: string; accent: string }> = [
  { id: "show", label: "Show", accent: "#4ACA6A" },
  { id: "dm-only", label: "DM Only", accent: "#FFB454" },
  { id: "hidden", label: "Hidden", accent: "#FF8A6A" },
];

function sanitizeCardFamilyHints(values: unknown): CardFamilyHint[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const valid = values.filter((value): value is CardFamilyHint => value === "spell" || value === "skill" || value === "ability");
  return valid.length ? Array.from(new Set(valid)) : undefined;
}

function sanitizeCardPurposeHints(values: unknown): CardPurposeHint[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const valid = values.filter((value): value is CardPurposeHint => (
    value === "attack"
    || value === "heal"
    || value === "support"
    || value === "utility"
    || value === "control"
    || value === "reaction"
    || value === "passive"
  ));
  return valid.length ? Array.from(new Set(valid)) : undefined;
}

function sanitizeCardTargetHint(value: unknown): CardTargetHint | undefined {
  return value === "self" || value === "ally" || value === "enemy" || value === "area" ? value : undefined;
}

function sanitizeCardCostHint(value: unknown): CardCostHint | undefined {
  return value === "source" || value === "exhaustion" || value === "uses-rest" || value === "passive" ? value : undefined;
}

function sanitizeCardTemplateHint(value: unknown): CardTemplateHint | undefined {
  return value === "blank" || value === "attack" || value === "heal" || value === "buff" || value === "debuff" || value === "reaction" || value === "passive" || value === "utility" ? value : undefined;
}

function sanitizeCardFocusHint(value: unknown): CardEditorFocusHint | undefined {
  return value === "core" || value === "mechanics" || value === "tags" || value === "progression" || value === "assignment" ? value : undefined;
}

function sanitizePresentationVisibility(value: unknown): CardPresentationVisibility | undefined {
  return value === "show" || value === "dm-only" || value === "hidden" ? value : undefined;
}

function sanitizePresentationSortOrder(value: unknown): number | undefined {
  if (value === "" || value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeRenameHistory(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const valid = values.map((value) => normalizeTagName(String(value))).filter(Boolean);
  return valid.length ? Array.from(new Set(valid)) : undefined;
}

function toggleHintValue<T extends string>(values: T[] | undefined, nextValue: T) {
  const current = values || [];
  return current.includes(nextValue)
    ? current.filter((value) => value !== nextValue)
    : [...current, nextValue];
}

function sanitizeTagMeta(meta: RichTagMeta | undefined | null): RichTagMeta | undefined {
  if (!meta) return undefined;
  const aliases = Array.isArray(meta.aliases)
    ? meta.aliases.map((alias) => normalizeTagName(String(alias))).filter(Boolean)
    : [];
  const sanitized: RichTagMeta = {
    roleHint: meta.roleHint === "descriptor" || meta.roleHint === "identifier" || meta.roleHint === "targeting"
      ? meta.roleHint
      : undefined,
    collection: normalizeTagName(meta.collection || ""),
    group: normalizeTagName(meta.group || ""),
    color: (meta.color || "").trim(),
    aliases,
    usageNotes: (meta.usageNotes || "").trim(),
    isDeprecated: !!meta.isDeprecated,
    replacementTagId: normalizeTagName(meta.replacementTagId || ""),
    replacementTagName: normalizeTagName(meta.replacementTagName || ""),
    renameHistory: sanitizeRenameHistory(meta.renameHistory),
    recommendedCardFamilies: sanitizeCardFamilyHints(meta.recommendedCardFamilies),
    recommendedCardPurposes: sanitizeCardPurposeHints(meta.recommendedCardPurposes),
    starterCardTargeting: sanitizeCardTargetHint(meta.starterCardTargeting),
    starterCardCostModel: sanitizeCardCostHint(meta.starterCardCostModel),
    cardCreationNote: (meta.cardCreationNote || "").trim(),
    starterCardTemplate: sanitizeCardTemplateHint(meta.starterCardTemplate),
    starterCardFocusPanel: sanitizeCardFocusHint(meta.starterCardFocusPanel),
    playerFacingVisibility: sanitizePresentationVisibility(meta.playerFacingVisibility),
    playerFacingBadgeLabel: normalizeTagName(meta.playerFacingBadgeLabel || ""),
    playerFacingFilterGroup: normalizeTagName(meta.playerFacingFilterGroup || ""),
    playerFacingSortOrder: sanitizePresentationSortOrder(meta.playerFacingSortOrder),
  };

  if (
    !sanitized.roleHint
    && !sanitized.collection
    && !sanitized.group
    && !sanitized.color
    && aliases.length === 0
    && !sanitized.usageNotes
    && !sanitized.isDeprecated
    && !sanitized.replacementTagId
    && !sanitized.replacementTagName
    && !(sanitized.renameHistory && sanitized.renameHistory.length > 0)
    && !(sanitized.recommendedCardFamilies && sanitized.recommendedCardFamilies.length > 0)
    && !(sanitized.recommendedCardPurposes && sanitized.recommendedCardPurposes.length > 0)
    && !sanitized.starterCardTargeting
    && !sanitized.starterCardCostModel
    && !sanitized.cardCreationNote
    && !sanitized.starterCardTemplate
    && !sanitized.starterCardFocusPanel
    && !sanitized.playerFacingVisibility
    && !sanitized.playerFacingBadgeLabel
    && !sanitized.playerFacingFilterGroup
    && sanitized.playerFacingSortOrder == null
  ) {
    return undefined;
  }
  return sanitized;
}

function normalizeRichTag(tag: TagDefinition | RichTagDefinition): RichTagDefinition {
  const richTag = tag as RichTagDefinition;
  return {
    ...richTag,
    name: normalizeTagName(richTag.name || ""),
    description: (richTag.description || "").trim(),
    fields: Array.isArray(richTag.fields) ? richTag.fields : [],
    meta: sanitizeTagMeta(richTag.meta),
  };
}

function parseAliases(value: string) {
  return value
    .split(/\n|,/)
    .map((entry) => normalizeTagName(entry))
    .filter(Boolean);
}

function formatAliases(aliases: string[] | undefined) {
  return (aliases || []).join(", ");
}

function getTagColor(value: string | undefined) {
  const trimmed = (value || "").trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : "";
}

function sortRichTags(tags: RichTagDefinition[]) {
  return [...tags].sort((a, b) => {
    const aDeprecated = a.meta?.isDeprecated ? 1 : 0;
    const bDeprecated = b.meta?.isDeprecated ? 1 : 0;
    if (aDeprecated !== bDeprecated) return aDeprecated - bDeprecated;

    const aCollection = (a.meta?.collection || "").toLowerCase();
    const bCollection = (b.meta?.collection || "").toLowerCase();
    if (aCollection !== bCollection) return aCollection.localeCompare(bCollection);

    const aGroup = (a.meta?.group || "").toLowerCase();
    const bGroup = (b.meta?.group || "").toLowerCase();
    if (aGroup !== bGroup) return aGroup.localeCompare(bGroup);

    return a.name.localeCompare(b.name);
  });
}
const MECHANICS_LIKE_TERMS = [
  "damage", "cooldown", "cost", "source cost", "scaling", "upcast", "tracker", "duration",
  "requirements", "requirement", "component", "components", "uses per", "per rest",
  "exhaustion", "saving throw", "dc", "effect value", "buff value", "potency", "dice",
];

function getIntentDefaults(tagSubPage: TagSubPage, intent: TagCreateIntent) {
  const examples = TAG_CREATION_EXAMPLES[tagSubPage][intent];
  if (intent === "descriptor") {
    return {
      placeholder: examples.join(", "),
      descriptionPlaceholder: "What broad identity, theme, or role does this tag communicate?",
      helper: "Best for broad labels that help people immediately understand what something is.",
    };
  }
  if (intent === "identifier") {
    return {
      placeholder: examples.join(", "),
      descriptionPlaceholder: "What subtype, origin, or classification does this tag help distinguish?",
      helper: "Best for labels that narrow something down or mark its subtype, domain, or affiliation.",
    };
  }
  return {
    placeholder: examples.join(", "),
    descriptionPlaceholder: "Who or what does this tag help identify as the usual target or scope?",
    helper: "Best for labels about target, scope, area, or intended recipient.",
  };
}

function getTagDesignWarnings(name: string, description: string) {
  const combined = `${name} ${description}`.toLowerCase();
  const warnings: string[] = [];

  if (MECHANICS_LIKE_TERMS.some((term) => combined.includes(term))) {
    warnings.push("This reads more like card/item mechanics than a descriptor. Consider moving the behavior into the card or item system instead of the tag.");
  }
  if (/\bfield\b|\binput\b|\bform\b/.test(combined)) {
    warnings.push("This description suggests the tag exists mainly to create extra fields. New tags should usually avoid that unless you intentionally need legacy compatibility.");
  }
  if (/\baction\b|\breaction\b|\bpassive\b/.test(combined) && /cost|uses per|cooldown|duration/.test(combined)) {
    warnings.push("Try separating card-use rules from tag identity. Tags can say what something is, but the card should own how it behaves.");
  }

  return warnings;
}


const TAG_PACKS: Record<TagSubPage, TagPackDef[]> = {
  items: [
    {
      id: "item-basics",
      label: "Item Basics",
      description: "Common descriptor tags for item identity and use.",
      tags: [
        { name: "Weapon", description: "Marks the item as a weapon or combat implement." },
        { name: "Armor", description: "Marks the item as armor or defensive equipment." },
        { name: "Consumable", description: "Used up or reduced when activated or consumed." },
        { name: "Crafting", description: "Used as a component or ingredient in crafting." },
        { name: "Quest Item", description: "Relevant to quests, missions, or tracked objectives." },
        { name: "Valuable", description: "Primarily notable for value, rarity, or trade worth." },
      ],
    },
    {
      id: "item-source",
      label: "Source & Resource",
      description: "Descriptor tags for items tied to source, magic, or fuel.",
      tags: [
        { name: "Source Item", description: "Contains or represents usable source." },
        { name: "Crystal", description: "A crystal, shard, or similar mineral focus." },
        { name: "Magical", description: "Inherently magical, enchanted, or source-touched." },
        { name: "Light-Aligned", description: "Associated with light, radiance, or illumination." },
        { name: "Shadow-Aligned", description: "Associated with shadow, dusk, or concealment." },
      ],
    },
  ],
  cards: [
    {
      id: "card-basics",
      label: "Card Descriptors",
      description: "Descriptor-first tags for broad card identity and function.",
      tags: [
        { name: "Attack", description: "Primarily offensive or damage-focused." },
        { name: "Heal", description: "Restores health, stability, or recovery." },
        { name: "Support", description: "Aids allies or strengthens a plan." },
        { name: "Utility", description: "Solves problems outside direct damage output." },
        { name: "Control", description: "Restrains, redirects, limits, or manipulates targets." },
        { name: "Reaction", description: "Most often used in response to a trigger." },
        { name: "Passive", description: "Always on or not actively invoked each use." },
      ],
    },
    {
      id: "card-targeting",
      label: "Targeting & Scope",
      description: "Identifier tags for who or what a card usually affects.",
      tags: [
        { name: "Target: Self", description: "Mainly used on the caster or user." },
        { name: "Target: Ally", description: "Mainly supports or affects allies." },
        { name: "Target: Enemy", description: "Mainly directed at enemies." },
        { name: "Target: Area", description: "Affects an area, zone, or multiple positions." },
        { name: "Concentration", description: "Requires ongoing focus to maintain." },
      ],
    },
    {
      id: "card-theme",
      label: "Theme & Nature",
      description: "Flavor-forward tags that help identify the card's tone or domain.",
      tags: [
        { name: "Martial", description: "Grounded in physical training, technique, or combat skill." },
        { name: "Light", description: "Associated with light, radiance, clarity, or revelation." },
        { name: "Shadow", description: "Associated with shadow, secrecy, dusk, or concealment." },
        { name: "Twilight", description: "Associated with dusk, thresholds, balance, or revelation." },
        { name: "Fire", description: "Associated with flame, heat, or combustion." },
        { name: "Ice", description: "Associated with cold, slowing, or freezing effects." },
      ],
    },
  ],
  info: [
    {
      id: "info-world",
      label: "Worldbuilding",
      description: "Common identifiers for lore and discoverable information.",
      tags: [
        { name: "Lore", description: "Background or worldbuilding information." },
        { name: "Location", description: "About a place, site, region, or landmark." },
        { name: "Faction", description: "About an organization, group, or power bloc." },
        { name: "NPC", description: "About a person, notable figure, or identity." },
        { name: "History", description: "Historical information, timelines, or prior events." },
        { name: "Secret", description: "Hidden, restricted, or special-knowledge information." },
      ],
    },
    {
      id: "info-structure",
      label: "Structure",
      description: "Tags for how a piece of information tends to be used.",
      tags: [
        { name: "Rumor", description: "Unverified or socially-circulated information." },
        { name: "Quest", description: "Tied to an objective, task, or objective chain." },
        { name: "Reference", description: "Useful as a lookup or repeated reminder." },
        { name: "Warning", description: "Flags danger, restrictions, or caution." },
      ],
    },
  ],
  status: [
    {
      id: "status-basics",
      label: "Status Basics",
      description: "High-level descriptors for tracked effects.",
      tags: [
        { name: "Buff", description: "Improves, bolsters, or grants a beneficial modifier." },
        { name: "Debuff", description: "Weakens, hinders, or applies a negative modifier." },
        { name: "Condition", description: "Represents a condition or rule state." },
        { name: "Ongoing Damage", description: "Deals repeated or sustained damage over time." },
        { name: "Control", description: "Restrains, limits, or interferes with actions." },
      ],
    },
  ],
  wiki: [
    {
      id: "wiki-basics",
      label: "Wiki Basics",
      description: "Descriptor tags for wiki article organization.",
      tags: [
        { name: "Overview", description: "A general primer or broad introduction." },
        { name: "Reference", description: "Designed to be consulted repeatedly." },
        { name: "Guide", description: "Explains how to do or understand something." },
        { name: "System", description: "Documents a ruleset, framework, or mechanic." },
        { name: "Lore", description: "Documents fiction, setting, or world information." },
      ],
    },
  ],
};

function normalizeTagName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isDuplicateTag(tags: TagDefinition[], candidate: string, currentId?: string | null) {
  const normalized = normalizeTagName(candidate).toLowerCase();
  return tags.some((tag) => tag.id !== currentId && normalizeTagName(tag.name).toLowerCase() === normalized);
}

function inferTagRole(tag: RichTagDefinition): { id: Exclude<TagRoleFilter, "all">; label: string; accent: string } {
  const name = normalizeTagName(tag.name).toLowerCase();

  if (tag.fields.length > 0) {
    return { id: "legacy", label: "Legacy Fields", accent: "#C4A0FF" };
  }
  if (tag.meta?.roleHint === "targeting") {
    return { id: "targeting", label: "Targeting", accent: "#4ACA6A" };
  }
  if (tag.meta?.roleHint === "identifier") {
    return { id: "identifier", label: "Identifier", accent: "#FF9A4A" };
  }
  if (tag.meta?.roleHint === "descriptor") {
    return { id: "descriptor", label: "Descriptor", accent: "#4A7BFF" };
  }
  if (name.startsWith("target:") || name.startsWith("target ")) {
    return { id: "targeting", label: "Targeting", accent: "#4ACA6A" };
  }
  if (name.includes(":") || name.includes("/") || /\btype\b/.test(name)) {
    return { id: "identifier", label: "Identifier", accent: "#FF9A4A" };
  }
  return { id: "descriptor", label: "Descriptor", accent: "#4A7BFF" };
}

function parseBatchTagLines(value: string) {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const divider = entry.includes(" - ") ? " - " : entry.includes(": ") ? ": " : "";
      if (!divider) return { name: entry, description: "" };
      const [name, ...rest] = entry.split(divider);
      return { name: name.trim(), description: rest.join(divider).trim() };
    });
}


function tokenizeTagText(value: string) {
  return normalizeTagName(value)
    .toLowerCase()
    .split(/[\s:/-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function inferIntentFromName(name: string): TagCreateIntent {
  const normalized = normalizeTagName(name).toLowerCase();
  if (normalized.startsWith("target:") || normalized.startsWith("target ")) return "targeting";
  if (normalized.includes(":") || normalized.includes("/") || /\btype\b|\baligned\b|\borigin\b|\bfamily\b/.test(normalized)) return "identifier";
  return "descriptor";
}

function getTagNamingGuidance(tagSubPage: TagSubPage, intent: TagCreateIntent, value: string) {
  const normalized = normalizeTagName(value);
  const lowered = normalized.toLowerCase();
  const guidance: string[] = [];
  if (!normalized) return guidance;

  if (normalized.length > 32) {
    guidance.push("Shorter tag names are usually easier to scan and reuse.");
  }
  if (/^[a-z]/.test(normalized)) {
    guidance.push("Consider capitalizing the tag name for consistency in the library.");
  }
  if (intent === "descriptor" && normalized.includes(":")) {
    guidance.push("Descriptor tags are usually clearest without punctuation like ':' unless the label truly needs it.");
  }
  if (intent === "identifier" && !normalized.includes(":") && !normalized.includes("-") && normalized.split(" ").length === 1) {
    guidance.push("Identifier tags are often strongest when they signal subtype, origin, or affiliation more explicitly.");
  }
  if (intent === "targeting" && !/^target[: ]/i.test(normalized) && !/\bself\b|\bally\b|\benemy\b|\barea\b|\bscope\b|\baffects?\b/.test(lowered)) {
    guidance.push("Targeting tags are easiest to understand when they clearly say who or what is being affected.");
  }
  if (tagSubPage === "cards" && intent === "identifier" && !/\bmartial\b|\blight\b|\bshadow\b|\btwilight\b|\bfire\b|\bice\b/.test(lowered) && normalized.split(" ").length === 1) {
    guidance.push("For card identifiers, themes, domains, and families tend to read better than very broad labels.");
  }
  return guidance;
}

function getNearDuplicateTags(tags: RichTagDefinition[], candidate: string, currentId?: string | null) {
  const normalized = normalizeTagName(candidate).toLowerCase();
  if (!normalized) return [] as Array<{ id: string; name: string; reason: string; score: number }>;

  const candidateTokens = new Set(tokenizeTagText(candidate));

  return tags
    .filter((tag) => tag.id !== currentId)
    .map((tag) => {
      const tagName = normalizeTagName(tag.name);
      const tagNormalized = tagName.toLowerCase();
      const aliasValues = tag.meta?.aliases || [];
      const aliasNormalized = aliasValues.map((alias) => normalizeTagName(alias).toLowerCase());
      const tagTokens = new Set(tokenizeTagText(tagName));
      const sharedTokens = [...candidateTokens].filter((token) => tagTokens.has(token));

      if (tagNormalized === normalized) {
        return { id: tag.id, name: tag.name, reason: "Exact name match", score: 100 };
      }
      if (aliasNormalized.includes(normalized)) {
        return { id: tag.id, name: tag.name, reason: "Matches an existing alias", score: 95 };
      }
      if (tagNormalized.includes(normalized) || normalized.includes(tagNormalized)) {
        return { id: tag.id, name: tag.name, reason: "Very similar wording", score: 85 };
      }
      if (sharedTokens.length >= Math.max(1, Math.min(candidateTokens.size, tagTokens.size) - 1)) {
        return { id: tag.id, name: tag.name, reason: `Shares wording: ${sharedTokens.join(", ")}`, score: 70 + sharedTokens.length };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => (b!.score - a!.score) || a!.name.localeCompare(b!.name))
    .slice(0, 5) as Array<{ id: string; name: string; reason: string; score: number }>;
}

function getSuggestedTagSeeds(
  tagSubPage: TagSubPage,
  intent: TagCreateIntent,
  tags: RichTagDefinition[],
) {
  const existing = new Set(
    tags.flatMap((tag) => [normalizeTagName(tag.name).toLowerCase(), ...(tag.meta?.aliases || []).map((alias) => normalizeTagName(alias).toLowerCase())]),
  );
  const seedPool = [
    ...TAG_CREATION_EXAMPLES[tagSubPage][intent].map((name) => ({ name, description: "" })),
    ...TAG_PACKS[tagSubPage].flatMap((pack) => pack.tags.map((tag) => ({ name: tag.name, description: tag.description }))),
  ];

  const unique = new Map<string, { name: string; description: string }>();
  seedPool.forEach((seed) => {
    const normalized = normalizeTagName(seed.name).toLowerCase();
    if (!normalized || existing.has(normalized) || unique.has(normalized)) return;
    if (inferIntentFromName(seed.name) !== intent && intent !== "descriptor") return;
    unique.set(normalized, { name: normalizeTagName(seed.name), description: seed.description });
  });

  return [...unique.values()].slice(0, 8);
}
function findCollectionByLabel(tagSubPage: TagSubPage, label: string) {
  const normalized = normalizeTagName(label).toLowerCase();
  return TAG_COLLECTIONS[tagSubPage].find((collection) => collection.label.toLowerCase() === normalized);
}

function inferCollectionForGroup(tagSubPage: TagSubPage, group: string) {
  const normalized = normalizeTagName(group).toLowerCase();
  if (!normalized) return "";
  return TAG_COLLECTIONS[tagSubPage].find((collection) => collection.groups.some((entry) => entry.toLowerCase() === normalized))?.label || "";
}


function appendUsageNote(existing: string | undefined, note: string) {
  const trimmedExisting = (existing || "").trim();
  if (!trimmedExisting) return note;
  if (trimmedExisting.toLowerCase().includes(note.toLowerCase())) return trimmedExisting;
  return `${trimmedExisting} | ${note}`;
}

function chooseCanonicalTagForMerge(a: RichTagDefinition, b: RichTagDefinition) {
  const score = (tag: RichTagDefinition) => {
    let value = 0;
    if (!tag.meta?.isDeprecated) value += 30;
    if (tag.meta?.collection) value += 8;
    if (tag.meta?.group) value += 6;
    if ((tag.meta?.aliases || []).length > 0) value += 4;
    if (tag.fields.length === 0) value += 2;
    value += Math.max(0, 24 - tag.name.length) / 24;
    return value;
  };
  const aScore = score(a);
  const bScore = score(b);
  if (aScore === bScore) return a.name.localeCompare(b.name) <= 0 ? a : b;
  return aScore > bScore ? a : b;
}

function inferCardBridgeHints(tag: RichTagDefinition) {
  const textValue = `${tag.name} ${tag.description} ${tag.meta?.collection || ""} ${tag.meta?.group || ""}`.toLowerCase();
  const families = new Set<CardFamilyHint>();
  const purposes = new Set<CardPurposeHint>();

  if (/\battack\b|\bstrike\b|\bshot\b|\bblast\b|\bslash\b/.test(textValue)) purposes.add("attack");
  if (/\bheal\b|\brestore\b|\brecovery\b|\brevive\b/.test(textValue)) purposes.add("heal");
  if (/\bsupport\b|\bassist\b|\bbuff\b|\bprotect\b/.test(textValue)) purposes.add("support");
  if (/\butility\b|\bmovement\b|\btravel\b|\bvision\b|\bscout\b/.test(textValue)) purposes.add("utility");
  if (/\bcontrol\b|\brestrain\b|\bstun\b|\bslow\b|\bzone\b/.test(textValue)) purposes.add("control");
  if (/\breaction\b|\bcounter\b|\briposte\b/.test(textValue)) purposes.add("reaction");
  if (/\bpassive\b|\baura\b|\balways on\b/.test(textValue)) purposes.add("passive");

  if (/\bspell\b|\bsource\b|\bmagic\b|\barcane\b|\blight\b|\bshadow\b|\btwilight\b|\bfire\b|\bice\b/.test(textValue)) families.add("spell");
  if (/\bskill\b|\bmartial\b|\btechnique\b|\bstance\b|\btraining\b/.test(textValue)) families.add("skill");
  if (/\bability\b|\binnate\b|\bblood\b|\blineage\b|\bgift\b|\bblessing\b/.test(textValue)) families.add("ability");

  return {
    families: [...families],
    purposes: [...purposes],
  };
}

function inferCardCreationPreset(tag: RichTagDefinition) {
  const textValue = `${tag.name} ${tag.description} ${tag.meta?.collection || ""} ${tag.meta?.group || ""} ${(tag.meta?.recommendedCardFamilies || []).join(" ")} ${(tag.meta?.recommendedCardPurposes || []).join(" ")}`.toLowerCase();
  let targeting: CardTargetHint | undefined;
  let costModel: CardCostHint | undefined;

  if (/\bself\b|\bpersonal\b|\baura\b/.test(textValue)) targeting = "self";
  else if (/\bally\b|\bfriend\b|\bsupport\b|\bheal\b/.test(textValue)) targeting = "ally";
  else if (/\benemy\b|\bhostile\b|\battack\b|\bcontrol\b/.test(textValue)) targeting = "enemy";
  else if (/\barea\b|\bzone\b|\bradius\b|\bfield\b/.test(textValue)) targeting = "area";

  if (/\bpassive\b|\baura\b|\balways on\b/.test(textValue) || (tag.meta?.recommendedCardPurposes || []).includes("passive")) costModel = "passive";
  else if (/\bsource\b|\bspell\b|\bmagic\b|\barcane\b/.test(textValue) || (tag.meta?.recommendedCardFamilies || []).includes("spell")) costModel = "source";
  else if (/\bexhaustion\b|\bmartial\b|\bskill\b|\btechnique\b/.test(textValue) || (tag.meta?.recommendedCardFamilies || []).includes("skill")) costModel = "exhaustion";
  else if (/\buses per\b|\bper rest\b|\bability\b|\binnate\b|\bgift\b/.test(textValue) || (tag.meta?.recommendedCardFamilies || []).includes("ability")) costModel = "uses-rest";

  let note = "";
  if ((tag.meta?.recommendedCardFamilies || []).length || (tag.meta?.recommendedCardPurposes || []).length) {
    note = `Starter hint: ${[(tag.meta?.recommendedCardFamilies || []).join('/'), (tag.meta?.recommendedCardPurposes || []).join('/')].filter(Boolean).join(' | ')}`;
  }
  if (!note && targeting && costModel) note = `Starter hint: ${targeting} target with ${costModel} cost model.`;

  return { targeting, costModel, note };
}

function inferCardWorkflowPreset(tag: RichTagDefinition) {
  const preset = inferCardCreationPreset(tag);
  const bridge = inferCardBridgeHints(tag);
  const purposes = tag.meta?.recommendedCardPurposes || bridge.purposes;
  const textValue = `${tag.name} ${tag.description} ${tag.meta?.collection || ""} ${tag.meta?.group || ""}`.toLowerCase();

  let template: CardTemplateHint = "blank";
  if (purposes.includes("passive")) template = "passive";
  else if (purposes.includes("reaction")) template = "reaction";
  else if (purposes.includes("heal")) template = "heal";
  else if (purposes.includes("control")) template = "debuff";
  else if (purposes.includes("support")) template = "buff";
  else if (purposes.includes("utility")) template = "utility";
  else if (purposes.includes("attack")) template = "attack";
  else if (tag.meta?.starterCardCostModel === "passive") template = "passive";

  let focusPanel: CardEditorFocusHint = "core";
  if (/progression/.test(textValue)) focusPanel = "progression";
  else if (template === "attack" || template === "heal" || template === "reaction" || template === "utility" || template === "passive") focusPanel = "mechanics";
  else if (template === "buff" || template === "debuff") focusPanel = "tags";
  else if (preset.targeting || preset.costModel || bridge.families.length > 0 || bridge.purposes.length > 0) focusPanel = "mechanics";

  const summaryParts = [
    template !== "blank" ? `${template} template` : "",
    focusPanel ? `${focusPanel} panel` : "",
    preset.targeting ? `${preset.targeting} target` : "",
    preset.costModel ? `${preset.costModel} cost` : "",
  ].filter(Boolean);

  return {
    template,
    focusPanel,
    note: summaryParts.length > 0 ? `Workflow starter: ${summaryParts.join(" • ")}` : "",
  };
}

function buildCardStarterProfile(tag: RichTagDefinition) {
  const bridge = inferCardBridgeHints(tag);
  const preset = inferCardCreationPreset(tag);
  const workflow = inferCardWorkflowPreset(tag);
  const families = (tag.meta?.recommendedCardFamilies && tag.meta.recommendedCardFamilies.length > 0)
    ? tag.meta.recommendedCardFamilies
    : bridge.families;
  const purposes = (tag.meta?.recommendedCardPurposes && tag.meta.recommendedCardPurposes.length > 0)
    ? tag.meta.recommendedCardPurposes
    : bridge.purposes;
  const targeting = tag.meta?.starterCardTargeting || preset.targeting;
  const costModel = tag.meta?.starterCardCostModel || preset.costModel;
  const template = tag.meta?.starterCardTemplate || workflow.template;
  const focusPanel = tag.meta?.starterCardFocusPanel || workflow.focusPanel;
  const note = tag.meta?.cardCreationNote || workflow.note || preset.note || '';
  const filled = [
    families.length > 0,
    purposes.length > 0,
    !!targeting,
    !!costModel,
    !!template,
    !!focusPanel,
  ].filter(Boolean).length;
  const readiness = filled >= 6 ? 'ready' : filled >= 3 ? 'partial' : 'minimal';
  return { families, purposes, targeting, costModel, template, focusPanel, note, readiness };
}


function getPurposeDisplayLabel(purpose: CardPurposeHint) {
  return CARD_PURPOSE_HINT_OPTIONS.find((option) => option.id === purpose)?.label || purpose;
}

function getFamilyDisplayLabel(family: CardFamilyHint) {
  return CARD_FAMILY_HINT_OPTIONS.find((option) => option.id === family)?.label || family;
}

function inferPlayerSortOrder(tag: RichTagDefinition, profile: ReturnType<typeof buildCardStarterProfile>) {
  if (profile.purposes.includes("attack")) return 10;
  if (profile.purposes.includes("heal")) return 20;
  if (profile.purposes.includes("support")) return 30;
  if (profile.purposes.includes("utility")) return 40;
  if (profile.purposes.includes("control")) return 50;
  if (profile.purposes.includes("reaction")) return 60;
  if (profile.purposes.includes("passive")) return 70;
  if (profile.families.includes("spell")) return 80;
  if (profile.families.includes("skill")) return 90;
  if (profile.families.includes("ability")) return 100;
  return tag.meta?.isDeprecated ? 999 : 120;
}

function buildCardPresentationProfile(tag: RichTagDefinition) {
  const starter = buildCardStarterProfile(tag);
  const visibility = tag.meta?.playerFacingVisibility || (tag.meta?.isDeprecated ? "hidden" : "show");
  const filterGroup = tag.meta?.playerFacingFilterGroup
    || (starter.purposes[0] ? getPurposeDisplayLabel(starter.purposes[0]) : starter.families[0] ? getFamilyDisplayLabel(starter.families[0]) : inferTagRole(tag).label);
  const badgeLabel = tag.meta?.playerFacingBadgeLabel || tag.name;
  const sortOrder = tag.meta?.playerFacingSortOrder ?? inferPlayerSortOrder(tag, starter);
  const explicitFilled = [
    !!tag.meta?.playerFacingVisibility,
    !!tag.meta?.playerFacingBadgeLabel,
    !!tag.meta?.playerFacingFilterGroup,
    tag.meta?.playerFacingSortOrder != null,
  ].filter(Boolean).length;
  const readiness = explicitFilled >= 4 ? "ready" : explicitFilled >= 2 ? "partial" : "minimal";
  const note = `Player-facing: ${badgeLabel} • ${filterGroup} • ${visibility} • sort ${sortOrder}`;
  return { visibility, badgeLabel, filterGroup, sortOrder, note, readiness, explicitFilled };
}


export function DMTagsSection({
  isVisible = true,
  initialItemTags = sharedInitialItemTags,
  initialCardTags = sharedInitialCardTags,
  initialInfoTags = sharedInitialInfoTags,
  initialStatusTags = sharedInitialStatusTags,
  initialWikiTags = sharedInitialWikiTags,
  onTagDataChange,
  onError,
}: DMTagsSectionProps) {
  const [itemTags, setItemTags] = useState<RichTagDefinition[]>(initialItemTags.map(normalizeRichTag));
  const [cardTags, setCardTags] = useState<RichTagDefinition[]>(initialCardTags.map(normalizeRichTag));
  const [infoTags, setInfoTags] = useState<RichTagDefinition[]>(initialInfoTags.map(normalizeRichTag));
  const [statusTags, setStatusTags] = useState<RichTagDefinition[]>(initialStatusTags.map(normalizeRichTag));
  const [wikiTags, setWikiTags] = useState<RichTagDefinition[]>(initialWikiTags.map(normalizeRichTag));
  const [tagSubPage, setTagSubPage] = useState<TagSubPage>("items");
  const [expandedTagId, setExpandedTagId] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<RichTagDefinition | null>(null);
  const [editingOriginalName, setEditingOriginalName] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagDesc, setNewTagDesc] = useState("");
  const [newTagCollection, setNewTagCollection] = useState("");
  const [newTagGroup, setNewTagGroup] = useState("");
  const [newTagAliases, setNewTagAliases] = useState("");
  const [newTagColor, setNewTagColor] = useState("");
  const [newTagUsageNotes, setNewTagUsageNotes] = useState("");
  const [newTagCardFamilies, setNewTagCardFamilies] = useState<CardFamilyHint[]>([]);
  const [newTagCardPurposes, setNewTagCardPurposes] = useState<CardPurposeHint[]>([]);
  const [newTagCardTargeting, setNewTagCardTargeting] = useState<CardTargetHint | "">("");
  const [newTagCardCostModel, setNewTagCardCostModel] = useState<CardCostHint | "">("");
  const [newTagCardCreationNote, setNewTagCardCreationNote] = useState("");
  const [newTagCardTemplate, setNewTagCardTemplate] = useState<CardTemplateHint | "">("");
  const [newTagCardFocusPanel, setNewTagCardFocusPanel] = useState<CardEditorFocusHint | "">("");
  const [newTagPlayerVisibility, setNewTagPlayerVisibility] = useState<CardPresentationVisibility | "">("");
  const [newTagPlayerBadgeLabel, setNewTagPlayerBadgeLabel] = useState("");
  const [newTagPlayerFilterGroup, setNewTagPlayerFilterGroup] = useState("");
  const [newTagPlayerSortOrder, setNewTagPlayerSortOrder] = useState("");
  const [createMode, setCreateMode] = useState<TagCreateMode>("single");
  const [batchInput, setBatchInput] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<TagRoleFilter>("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [deprecationFilter, setDeprecationFilter] = useState<TagDeprecationFilter>("active");
  const [showLegacyFieldsEditor, setShowLegacyFieldsEditor] = useState(false);
  const [createIntent, setCreateIntent] = useState<TagCreateIntent>("descriptor");
  const [legacyIntentConfirmed, setLegacyIntentConfirmed] = useState(false);

  const [phase5MaintenanceFilter, setPhase5MaintenanceFilter] = useState<"all" | "duplicates" | "metadata" | "deprecated">("all");

  const emitTagData = useCallback((next: {
    itemTags: TagDefinition[];
    cardTags: TagDefinition[];
    infoTags: TagDefinition[];
    statusTags: TagDefinition[];
    wikiTags: TagDefinition[];
  }) => {
    onTagDataChange?.(next);
  }, [onTagDataChange]);

  useEffect(() => {
    let cancelled = false;

    async function loadTagState() {
      try {
        onError?.(null);
        const [itemRows, cardRows, infoRows, statusRows, wikiRows] = await Promise.all([
          loadDMTags<TagDefinition>("item"),
          loadDMTags<TagDefinition>("card"),
          loadDMTags<TagDefinition>("info"),
          loadDMTags<TagDefinition>("status"),
          loadDMTags<TagDefinition>("wiki"),
        ]);

        if (cancelled) return;

        const next = {
          itemTags: (itemRows.length ? itemRows : initialItemTags).map(normalizeRichTag),
          cardTags: (cardRows.length ? cardRows : initialCardTags).map(normalizeRichTag),
          infoTags: (infoRows.length ? infoRows : initialInfoTags).map(normalizeRichTag),
          statusTags: (statusRows.length ? statusRows : initialStatusTags).map(normalizeRichTag),
          wikiTags: (wikiRows.length ? wikiRows : initialWikiTags).map(normalizeRichTag),
        };

        setItemTags(next.itemTags);
        setCardTags(next.cardTags);
        setInfoTags(next.infoTags);
        setStatusTags(next.statusTags);
        setWikiTags(next.wikiTags);
        emitTagData(next);
      } catch (err) {
        if (!cancelled) {
          onError?.(err instanceof Error ? err.message : "Failed to load tags");
        }
      }
    }

    void loadTagState();
    return () => {
      cancelled = true;
    };
  }, [emitTagData, initialCardTags, initialInfoTags, initialItemTags, initialStatusTags, initialWikiTags, onError]);

  const saveTagList = useCallback(async (
    kind: "item" | "card" | "info" | "status" | "wiki",
    next: RichTagDefinition[],
  ) => {
    onError?.(null);
    const normalizedNext = sortRichTags(next.map(normalizeRichTag));
    await saveDMTags(kind, normalizedNext as unknown as Record<string, unknown>[]);

    const payload = {
      itemTags: kind === "item" ? normalizedNext : itemTags,
      cardTags: kind === "card" ? normalizedNext : cardTags,
      infoTags: kind === "info" ? normalizedNext : infoTags,
      statusTags: kind === "status" ? normalizedNext : statusTags,
      wikiTags: kind === "wiki" ? normalizedNext : wikiTags,
    };

    if (kind === "item") setItemTags(normalizedNext);
    if (kind === "card") setCardTags(normalizedNext);
    if (kind === "info") setInfoTags(normalizedNext);
    if (kind === "status") setStatusTags(normalizedNext);
    if (kind === "wiki") setWikiTags(normalizedNext);

    emitTagData(payload);
  }, [cardTags, emitTagData, infoTags, itemTags, onError, statusTags, wikiTags]);

  const getActiveTagList = (): [RichTagDefinition[], (next: RichTagDefinition[]) => Promise<void>, "item" | "card" | "info" | "status" | "wiki"] => {
    if (tagSubPage === "items") return [itemTags, (next) => saveTagList("item", next), "item"];
    if (tagSubPage === "cards") return [cardTags, (next) => saveTagList("card", next), "card"];
    if (tagSubPage === "status") return [statusTags, (next) => saveTagList("status", next), "status"];
    if (tagSubPage === "wiki") return [wikiTags, (next) => saveTagList("wiki", next), "wiki"];
    return [infoTags, (next) => saveTagList("info", next), "info"];
  };

  const [activeTags, saveActiveTags] = useMemo(() => {
    const [tags, saveTags] = getActiveTagList();
    return [tags, saveTags] as const;
  }, [tagSubPage, itemTags, cardTags, infoTags, statusTags, wikiTags]);

  const activeGroups = useMemo(
    () => Array.from(new Set(activeTags.map((tag) => tag.meta?.group).filter(Boolean) as string[])).sort(),
    [activeTags],
  );

  const activeCollections = useMemo(
    () => Array.from(new Set(activeTags.map((tag) => tag.meta?.collection).filter(Boolean) as string[])).sort(),
    [activeTags],
  );

  const visibleTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    return sortRichTags(activeTags.filter((tag) => {
      const role = inferTagRole(tag);
      const matchesRole = roleFilter === "all" || role.id === roleFilter;
      const matchesCollection = collectionFilter === "all" || (tag.meta?.collection || "") === collectionFilter;
      const matchesGroup = groupFilter === "all" || (tag.meta?.group || "") === groupFilter;
      const matchesDeprecated = deprecationFilter === "all"
        || (deprecationFilter === "deprecated" ? !!tag.meta?.isDeprecated : !tag.meta?.isDeprecated);
      const aliases = (tag.meta?.aliases || []).join(" ").toLowerCase();
      const usageNotes = (tag.meta?.usageNotes || "").toLowerCase();
      const matchesQuery = !query
        || tag.name.toLowerCase().includes(query)
        || tag.description.toLowerCase().includes(query)
        || aliases.includes(query)
        || usageNotes.includes(query)
        || (tag.meta?.group || "").toLowerCase().includes(query);
      return matchesRole && matchesCollection && matchesGroup && matchesDeprecated && matchesQuery;
    }));
  }, [activeTags, collectionFilter, deprecationFilter, groupFilter, roleFilter, tagSearch]);

  const activePackDefs = TAG_PACKS[tagSubPage];
  const roleCounts = useMemo(() => {
    return activeTags.reduce<Record<TagRoleFilter, number>>((acc, tag) => {
      const role = inferTagRole(tag).id;
      acc[role] += 1;
      acc.all += 1;
      return acc;
    }, { all: 0, descriptor: 0, identifier: 0, targeting: 0, legacy: 0 });
  }, [activeTags]);

  const createIntentConfig = useMemo(
    () => TAG_INTENT_OPTIONS.find((option) => option.id === createIntent) || TAG_INTENT_OPTIONS[0],
    [createIntent],
  );

  const createIntentDefaults = useMemo(
    () => getIntentDefaults(tagSubPage, createIntent),
    [tagSubPage, createIntent],
  );

  const creationWarnings = useMemo(
    () => getTagDesignWarnings(newTagName, newTagDesc),
    [newTagName, newTagDesc],
  );

  const editingWarnings = useMemo(
    () => getTagDesignWarnings(editingTag?.name || "", editingTag?.description || ""),
    [editingTag?.description, editingTag?.name],
  );

  const createAliasList = useMemo(() => parseAliases(newTagAliases), [newTagAliases]);
  const editingAliasList = useMemo(() => editingTag?.meta?.aliases || [], [editingTag?.meta?.aliases]);

  const createNamingGuidance = useMemo(
    () => getTagNamingGuidance(tagSubPage, createIntent, newTagName),
    [createIntent, newTagName, tagSubPage],
  );

  const editingNamingGuidance = useMemo(
    () => getTagNamingGuidance(tagSubPage, editingTag?.meta?.roleHint || inferIntentFromName(editingTag?.name || ""), editingTag?.name || ""),
    [editingTag?.meta?.roleHint, editingTag?.name, tagSubPage],
  );

  const createNearDuplicates = useMemo(
    () => getNearDuplicateTags(activeTags, newTagName),
    [activeTags, newTagName],
  );

  const editingNearDuplicates = useMemo(
    () => getNearDuplicateTags(activeTags, editingTag?.name || "", editingTag?.id),
    [activeTags, editingTag?.id, editingTag?.name],
  );

  const suggestedCreateTags = useMemo(
    () => getSuggestedTagSeeds(tagSubPage, createIntent, activeTags),
    [activeTags, createIntent, tagSubPage],
  );

  const createPhase7BridgeSuggestion = useMemo(
    () => inferCardBridgeHints(normalizeRichTag({
      id: 'phase7-create-preview',
      name: newTagName,
      description: newTagDesc,
      fields: [],
      meta: {
        roleHint: createIntent,
        collection: newTagCollection || inferCollectionForGroup(tagSubPage, newTagGroup),
        group: newTagGroup,
      },
    })),
    [createIntent, newTagCollection, newTagDesc, newTagGroup, newTagName, tagSubPage],
  );

  const editingPhase7BridgeSuggestion = useMemo(
    () => inferCardBridgeHints(editingTag || normalizeRichTag({ id: 'phase7-edit-preview', name: '', description: '', fields: [], meta: {} })),
    [editingTag],
  );

  const createPhase8PresetSuggestion = useMemo(
    () => inferCardCreationPreset(normalizeRichTag({
      id: 'phase8-create-preview',
      name: newTagName,
      description: newTagDesc,
      fields: [],
      meta: {
        roleHint: createIntent,
        collection: newTagCollection || inferCollectionForGroup(tagSubPage, newTagGroup),
        group: newTagGroup,
        recommendedCardFamilies: newTagCardFamilies,
        recommendedCardPurposes: newTagCardPurposes,
      },
    })),
    [createIntent, newTagCardFamilies, newTagCardPurposes, newTagCollection, newTagDesc, newTagGroup, newTagName, tagSubPage],
  );

  const editingPhase8PresetSuggestion = useMemo(
    () => inferCardCreationPreset(editingTag || normalizeRichTag({ id: 'phase8-edit-preview', name: '', description: '', fields: [], meta: {} })),
    [editingTag],
  );

  const createPhase9WorkflowSuggestion = useMemo(
    () => inferCardWorkflowPreset(normalizeRichTag({
      id: 'phase9-create-preview',
      name: newTagName,
      description: newTagDesc,
      fields: [],
      meta: {
        roleHint: createIntent,
        collection: newTagCollection || inferCollectionForGroup(tagSubPage, newTagGroup),
        group: newTagGroup,
        recommendedCardFamilies: newTagCardFamilies,
        recommendedCardPurposes: newTagCardPurposes,
        starterCardTargeting: newTagCardTargeting || undefined,
        starterCardCostModel: newTagCardCostModel || undefined,
      },
    })),
    [createIntent, newTagCardCostModel, newTagCardFamilies, newTagCardPurposes, newTagCardTargeting, newTagCollection, newTagDesc, newTagGroup, newTagName, tagSubPage],
  );

  const editingPhase9WorkflowSuggestion = useMemo(
    () => inferCardWorkflowPreset(editingTag || normalizeRichTag({ id: 'phase9-edit-preview', name: '', description: '', fields: [], meta: {} })),
    [editingTag],
  );

  const phase7CardBridgeGaps = useMemo(() => {
    if (tagSubPage !== 'cards') return [] as Array<{ id: string; name: string; families: CardFamilyHint[]; purposes: CardPurposeHint[] }>;
    return activeTags
      .filter((tag) => !tag.meta?.isDeprecated)
      .map((tag) => {
        const suggestions = inferCardBridgeHints(tag);
        const hasHints = (tag.meta?.recommendedCardFamilies?.length || 0) > 0 || (tag.meta?.recommendedCardPurposes?.length || 0) > 0;
        if (hasHints || (suggestions.families.length === 0 && suggestions.purposes.length === 0)) return null;
        return { id: tag.id, name: tag.name, families: suggestions.families, purposes: suggestions.purposes };
      })
      .filter(Boolean) as Array<{ id: string; name: string; families: CardFamilyHint[]; purposes: CardPurposeHint[] }>;
  }, [activeTags, tagSubPage]);

  const phase7DeprecatedWithoutReplacement = useMemo(
    () => activeTags.filter((tag) => !!tag.meta?.isDeprecated && !tag.meta?.replacementTagId),
    [activeTags],
  );

  const phase7RenameTrackedTags = useMemo(
    () => activeTags.filter((tag) => (tag.meta?.renameHistory?.length || 0) > 0),
    [activeTags],
  );

  const phase8CardCreationPresetGaps = useMemo(() => {
    if (tagSubPage !== 'cards') return [] as Array<{ id: string; name: string; targeting?: CardTargetHint; costModel?: CardCostHint; note: string }>;
    return activeTags
      .filter((tag) => !tag.meta?.isDeprecated)
      .map((tag) => {
        const suggestion = inferCardCreationPreset(tag);
        const hasPreset = !!tag.meta?.starterCardTargeting || !!tag.meta?.starterCardCostModel || !!tag.meta?.cardCreationNote;
        if (hasPreset || (!suggestion.targeting && !suggestion.costModel && !suggestion.note)) return null;
        return { id: tag.id, name: tag.name, targeting: suggestion.targeting, costModel: suggestion.costModel, note: suggestion.note };
      })
      .filter(Boolean) as Array<{ id: string; name: string; targeting?: CardTargetHint; costModel?: CardCostHint; note: string }>;
  }, [activeTags, tagSubPage]);

  const phase8PresetReadyTags = useMemo(
    () => activeTags.filter((tag) => !!tag.meta?.starterCardTargeting || !!tag.meta?.starterCardCostModel || !!tag.meta?.cardCreationNote),
    [activeTags],
  );

  const phase9WorkflowGaps = useMemo(() => {
    if (tagSubPage !== 'cards') return [] as Array<{ id: string; name: string; template: CardTemplateHint; focusPanel: CardEditorFocusHint; note: string }>;
    return activeTags
      .filter((tag) => !tag.meta?.isDeprecated)
      .map((tag) => {
        const suggestion = inferCardWorkflowPreset(tag);
        const hasWorkflow = !!tag.meta?.starterCardTemplate || !!tag.meta?.starterCardFocusPanel;
        if (hasWorkflow || (!suggestion.template && !suggestion.focusPanel && !suggestion.note)) return null;
        return { id: tag.id, name: tag.name, template: suggestion.template, focusPanel: suggestion.focusPanel, note: suggestion.note };
      })
      .filter(Boolean) as Array<{ id: string; name: string; template: CardTemplateHint; focusPanel: CardEditorFocusHint; note: string }>;
  }, [activeTags, tagSubPage]);

  const phase9WorkflowReadyTags = useMemo(
    () => activeTags.filter((tag) => !!tag.meta?.starterCardTemplate || !!tag.meta?.starterCardFocusPanel),
    [activeTags],
  );

  const createPhase10StarterProfile = useMemo(
    () => buildCardStarterProfile(normalizeRichTag({
      id: 'phase10-create-preview',
      name: newTagName,
      description: newTagDesc,
      fields: [],
      meta: {
        roleHint: createIntent,
        collection: newTagCollection || inferCollectionForGroup(tagSubPage, newTagGroup),
        group: newTagGroup,
        recommendedCardFamilies: newTagCardFamilies,
        recommendedCardPurposes: newTagCardPurposes,
        starterCardTargeting: newTagCardTargeting || undefined,
        starterCardCostModel: newTagCardCostModel || undefined,
        cardCreationNote: newTagCardCreationNote || undefined,
        starterCardTemplate: newTagCardTemplate || undefined,
        starterCardFocusPanel: newTagCardFocusPanel || undefined,
      },
    })),
    [createIntent, newTagCardCostModel, newTagCardCreationNote, newTagCardFamilies, newTagCardFocusPanel, newTagCardPurposes, newTagCardTargeting, newTagCardTemplate, newTagCollection, newTagDesc, newTagGroup, newTagName, tagSubPage],
  );

  const editingPhase10StarterProfile = useMemo(
    () => buildCardStarterProfile(editingTag || normalizeRichTag({ id: 'phase10-edit-preview', name: '', description: '', fields: [], meta: {} })),
    [editingTag],
  );

  const createPhase11PresentationProfile = useMemo(
    () => buildCardPresentationProfile(normalizeRichTag({
      id: 'phase11-create-preview',
      name: newTagName,
      description: newTagDesc,
      fields: [],
      meta: {
        roleHint: createIntent,
        collection: newTagCollection || inferCollectionForGroup(tagSubPage, newTagGroup),
        group: newTagGroup,
        recommendedCardFamilies: newTagCardFamilies,
        recommendedCardPurposes: newTagCardPurposes,
        starterCardTargeting: newTagCardTargeting || undefined,
        starterCardCostModel: newTagCardCostModel || undefined,
        cardCreationNote: newTagCardCreationNote || undefined,
        starterCardTemplate: newTagCardTemplate || undefined,
        starterCardFocusPanel: newTagCardFocusPanel || undefined,
        playerFacingVisibility: newTagPlayerVisibility || undefined,
        playerFacingBadgeLabel: newTagPlayerBadgeLabel || undefined,
        playerFacingFilterGroup: newTagPlayerFilterGroup || undefined,
        playerFacingSortOrder: newTagPlayerSortOrder || undefined,
      },
    })),
    [createIntent, newTagCardCostModel, newTagCardCreationNote, newTagCardFamilies, newTagCardFocusPanel, newTagCardPurposes, newTagCardTargeting, newTagCardTemplate, newTagCollection, newTagDesc, newTagGroup, newTagName, newTagPlayerBadgeLabel, newTagPlayerFilterGroup, newTagPlayerSortOrder, newTagPlayerVisibility, tagSubPage],
  );

  const editingPhase11PresentationProfile = useMemo(
    () => buildCardPresentationProfile(editingTag || normalizeRichTag({ id: 'phase11-edit-preview', name: '', description: '', fields: [], meta: {} })),
    [editingTag],
  );

  const phase10StarterReadyTags = useMemo(() => {
    if (tagSubPage !== 'cards') return [] as RichTagDefinition[];
    return activeTags.filter((tag) => buildCardStarterProfile(tag).readiness === 'ready');
  }, [activeTags, tagSubPage]);

  const phase10StarterGaps = useMemo(() => {
    if (tagSubPage !== 'cards') return [] as Array<{ id: string; name: string; profile: ReturnType<typeof buildCardStarterProfile> }>;
    return activeTags
      .filter((tag) => !tag.meta?.isDeprecated)
      .map((tag) => ({ id: tag.id, name: tag.name, profile: buildCardStarterProfile(tag) }))
      .filter((entry) => entry.profile.readiness !== 'ready');
  }, [activeTags, tagSubPage]);

  const phase11PresentationReadyTags = useMemo(() => {
    if (tagSubPage !== 'cards') return [] as RichTagDefinition[];
    return activeTags.filter((tag) => buildCardPresentationProfile(tag).readiness === 'ready');
  }, [activeTags, tagSubPage]);

  const phase11PresentationGaps = useMemo(() => {
    if (tagSubPage !== 'cards') return [] as Array<{ id: string; name: string; profile: ReturnType<typeof buildCardPresentationProfile> }>;
    return activeTags
      .filter((tag) => !tag.meta?.isDeprecated)
      .map((tag) => ({ id: tag.id, name: tag.name, profile: buildCardPresentationProfile(tag) }))
      .filter((entry) => entry.profile.readiness !== 'ready');
  }, [activeTags, tagSubPage]);

  const phase5DuplicatePairs = useMemo(() => {
    const byId = new Map(activeTags.map((tag) => [tag.id, tag] as const));
    const pairMap = new Map<string, { sourceId: string; sourceName: string; targetId: string; targetName: string; reason: string; score: number }>();

    activeTags.forEach((tag) => {
      getNearDuplicateTags(activeTags, tag.name, tag.id)
        .filter((match) => match.score >= 85)
        .forEach((match) => {
          const other = byId.get(match.id);
          if (!other) return;
          const canonical = chooseCanonicalTagForMerge(tag, other);
          const source = canonical.id === tag.id ? other : tag;
          const target = canonical.id === tag.id ? tag : other;
          const key = [source.id, target.id].sort().join('::');
          const existing = pairMap.get(key);
          if (!existing || match.score > existing.score) {
            pairMap.set(key, {
              sourceId: source.id,
              sourceName: source.name,
              targetId: target.id,
              targetName: target.name,
              reason: match.reason,
              score: match.score,
            });
          }
        });
    });

    return [...pairMap.values()].sort((a, b) => b.score - a.score || a.sourceName.localeCompare(b.sourceName));
  }, [activeTags]);

  const phase5MetadataIssues = useMemo(() => {
    return activeTags
      .filter((tag) => !tag.meta?.isDeprecated)
      .map((tag) => {
        const collection = tag.meta?.collection || '';
        const group = tag.meta?.group || '';
        const inferredCollection = inferCollectionForGroup(tagSubPage, group);
        const collectionDef = findCollectionByLabel(tagSubPage, collection);
        const issues: string[] = [];
        if (!collection) issues.push('Missing collection');
        if (!group) issues.push('Missing group');
        if (collection && group && collectionDef && !collectionDef.groups.some((entry) => entry.toLowerCase() === group.toLowerCase())) {
          issues.push('Group does not match selected collection');
        }
        if (!collection && inferredCollection) issues.push(`Can infer collection: ${inferredCollection}`);
        return issues.length > 0 ? { id: tag.id, name: tag.name, issues, inferredCollection } : null;
      })
      .filter(Boolean) as Array<{ id: string; name: string; issues: string[]; inferredCollection: string }>;
  }, [activeTags, tagSubPage]);

  const phase5AliasConflicts = useMemo(() => {
    const tagNameByNormalized = new Map(activeTags.map((tag) => [normalizeTagName(tag.name).toLowerCase(), tag.name] as const));
    const conflicts: Array<{ id: string; name: string; alias: string; conflictWith: string }> = [];
    activeTags.forEach((tag) => {
      (tag.meta?.aliases || []).forEach((alias) => {
        const normalizedAlias = normalizeTagName(alias).toLowerCase();
        const conflictingName = tagNameByNormalized.get(normalizedAlias);
        if (conflictingName && conflictingName !== tag.name) {
          conflicts.push({ id: tag.id, name: tag.name, alias, conflictWith: conflictingName });
        }
      });
    });
    return conflicts.slice(0, 8);
  }, [activeTags]);

  const phase5DeprecatedTags = useMemo(
    () => activeTags.filter((tag) => !!tag.meta?.isDeprecated),
    [activeTags],
  );

  const collectionSummaries = useMemo(() => TAG_COLLECTIONS[tagSubPage].map((collection) => ({
    ...collection,
    count: activeTags.filter((tag) => (tag.meta?.collection || "") === collection.label).length,
  })), [activeTags, tagSubPage]);

  const subPages: { id: TagSubPage; label: string; helper: string }[] = [
    { id: "items", label: "Item Tags", helper: "Descriptors for item identity, use, and category." },
    { id: "cards", label: "Card Tags", helper: "Descriptors and identifiers for card purpose, target, and theme." },
    { id: "info", label: "Info Tags", helper: "Tags that help sort, surface, and identify information." },
    { id: "status", label: "Status Effect Tags", helper: "Descriptors for tracked effects, buffs, and conditions." },
    { id: "wiki", label: "Wiki Tags", helper: "Organizers and identifiers for wiki article structure." },
  ];

  if (!isVisible) return null;

  const handleAddTag = async () => {
    const name = normalizeTagName(newTagName);
    if (!name) return;
    if (isDuplicateTag(activeTags, name)) {
      onError?.(`A ${tagSubPage} tag named "${name}" already exists.`);
      return;
    }

    const fallbackDescription = createIntent === "identifier"
      ? "Identifier tag."
      : createIntent === "targeting"
        ? "Targeting tag."
        : "Descriptor tag.";

    const newTag: RichTagDefinition = normalizeRichTag({
      id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      description: newTagDesc.trim() || fallbackDescription,
      fields: [],
      meta: {
        roleHint: createIntent,
        collection: newTagCollection || inferCollectionForGroup(tagSubPage, newTagGroup),
        group: newTagGroup,
        aliases: parseAliases(newTagAliases),
        color: getTagColor(newTagColor),
        usageNotes: newTagUsageNotes.trim(),
        isDeprecated: false,
        recommendedCardFamilies: tagSubPage === 'cards' ? newTagCardFamilies : undefined,
        recommendedCardPurposes: tagSubPage === 'cards' ? newTagCardPurposes : undefined,
        starterCardTargeting: tagSubPage === 'cards' ? (newTagCardTargeting || undefined) : undefined,
        starterCardCostModel: tagSubPage === 'cards' ? (newTagCardCostModel || undefined) : undefined,
        cardCreationNote: tagSubPage === 'cards' ? newTagCardCreationNote.trim() : undefined,
        starterCardTemplate: tagSubPage === 'cards' ? (newTagCardTemplate || undefined) : undefined,
        starterCardFocusPanel: tagSubPage === 'cards' ? (newTagCardFocusPanel || undefined) : undefined,
        playerFacingVisibility: tagSubPage === 'cards' ? (newTagPlayerVisibility || undefined) : undefined,
        playerFacingBadgeLabel: tagSubPage === 'cards' ? newTagPlayerBadgeLabel.trim() : undefined,
        playerFacingFilterGroup: tagSubPage === 'cards' ? newTagPlayerFilterGroup.trim() : undefined,
        playerFacingSortOrder: tagSubPage === 'cards' ? (newTagPlayerSortOrder || undefined) : undefined,
      },
    });
    await saveActiveTags([...activeTags, newTag]);
    setNewTagName("");
    setNewTagDesc("");
    setNewTagCollection("");
    setNewTagGroup("");
    setNewTagAliases("");
    setNewTagColor("");
    setNewTagUsageNotes("");
    setNewTagCardFamilies([]);
    setNewTagCardPurposes([]);
    setNewTagCardTargeting("");
    setNewTagCardCostModel("");
    setNewTagCardCreationNote("");
    setNewTagCardTemplate("");
    setNewTagCardFocusPanel("");
    setNewTagPlayerVisibility("");
    setNewTagPlayerBadgeLabel("");
    setNewTagPlayerFilterGroup("");
    setNewTagPlayerSortOrder("");
  };

  const applyCreateSuggestion = (name: string, description = "") => {
    setNewTagName(name);
    if (!newTagDesc.trim() && description) setNewTagDesc(description);
    setCreateIntent(inferIntentFromName(name));
  };

  const applyCollectionPreset = (collectionLabel: string) => {
    const collection = findCollectionByLabel(tagSubPage, collectionLabel);
    setNewTagCollection(collectionLabel);
    if (!newTagGroup && collection?.groups.length) setNewTagGroup(collection.groups[0]);
  };

  const handleAddBatchTags = async () => {
    const entries = parseBatchTagLines(batchInput);
    if (entries.length === 0) return;

    const existingNames = new Set(activeTags.map((tag) => normalizeTagName(tag.name).toLowerCase()));
    const nextTags: TagDefinition[] = [...activeTags];
    let added = 0;

    for (const entry of entries) {
      const name = normalizeTagName(entry.name);
      if (!name) continue;
      const normalized = name.toLowerCase();
      if (existingNames.has(normalized)) continue;
      existingNames.add(normalized);
      nextTags.push(normalizeRichTag({
        id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${added}`,
        name,
        description: entry.description || "Descriptor tag.",
        fields: [],
        meta: {
          roleHint: createIntent,
          collection: newTagCollection || inferCollectionForGroup(tagSubPage, newTagGroup),
          group: newTagGroup,
        },
      }));
      added += 1;
    }

    if (added === 0) {
      onError?.("No new tags were added. They may already exist or the batch input was empty.");
      return;
    }

    await saveActiveTags(nextTags);
    setBatchInput("");
  };

  const handleCreatePack = async (pack: TagPackDef) => {
    const existingNames = new Set(activeTags.map((tag) => normalizeTagName(tag.name).toLowerCase()));
    const additions = pack.tags
      .map((tag, index) => normalizeRichTag({
        id: `tag-${Date.now()}-${pack.id}-${index}`,
        name: normalizeTagName(tag.name),
        description: tag.description,
        fields: [],
        meta: { collection: newTagCollection || "" },
      }))
      .filter((tag) => {
        const normalized = tag.name.toLowerCase();
        if (!tag.name || existingNames.has(normalized)) return false;
        existingNames.add(normalized);
        return true;
      });

    if (additions.length === 0) {
      onError?.(`All tags from "${pack.label}" already exist in this category.`);
      return;
    }

    await saveActiveTags([...activeTags, ...additions]);
  };

  const handleDeleteTag = async (id: string) => {
    await saveActiveTags(activeTags.filter((t) => t.id !== id));
    if (expandedTagId === id) setExpandedTagId(null);
    if (editingTag?.id === id) setEditingTag(null);
  };

  const handleStartEditTag = (tag: RichTagDefinition) => {
    setEditingOriginalName(tag.name);
    setEditingTag(normalizeRichTag({
      ...tag,
      fields: tag.fields.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })),
    }));
    setExpandedTagId(tag.id);
    setShowLegacyFieldsEditor(tag.fields.length > 0);
    setLegacyIntentConfirmed(tag.fields.length > 0);
  };

  const handleSaveTag = async () => {
    if (!editingTag) return;
    const name = normalizeTagName(editingTag.name);
    if (!name) {
      onError?.("Tag name is required.");
      return;
    }
    if (isDuplicateTag(activeTags, name, editingTag.id)) {
      onError?.(`A ${tagSubPage} tag named "${name}" already exists.`);
      return;
    }

    const previousName = normalizeTagName(editingOriginalName || "");
    const didRename = !!previousName && previousName.toLowerCase() != name.toLowerCase();
    const nextAliases = Array.from(new Set([
      ...(editingTag.meta?.aliases || []),
      ...(didRename ? [previousName] : []),
    ].map((value) => normalizeTagName(value)).filter(Boolean)));
    const nextRenameHistory = Array.from(new Set([
      ...(editingTag.meta?.renameHistory || []),
      ...(didRename ? [previousName] : []),
    ].map((value) => normalizeTagName(value)).filter(Boolean)));

    const sanitizedTag: RichTagDefinition = normalizeRichTag({
      ...editingTag,
      name,
      description: editingTag.description.trim() || "Descriptor tag.",
      fields: editingTag.fields,
      meta: {
        ...editingTag.meta,
        aliases: nextAliases,
        renameHistory: nextRenameHistory,
        usageNotes: didRename
          ? appendUsageNote(editingTag.meta?.usageNotes, `Phase 7 rename tracked from ${previousName}`)
          : editingTag.meta?.usageNotes,
        color: getTagColor(editingTag.meta?.color),
      },
    });
    await saveActiveTags(activeTags.map((t) => (t.id === editingTag.id ? sanitizedTag : t)));
    setEditingTag(null);
    setEditingOriginalName(null);
    setShowLegacyFieldsEditor(false);
    setLegacyIntentConfirmed(false);
  };

  const handleCancelTagEdit = () => {
    setEditingTag(null);
    setEditingOriginalName(null);
    setShowLegacyFieldsEditor(false);
    setLegacyIntentConfirmed(false);
  };


  const handlePhase5QuickMerge = async (sourceId: string, targetId: string) => {
    const source = activeTags.find((tag) => tag.id === sourceId);
    const target = activeTags.find((tag) => tag.id === targetId);
    if (!source || !target || source.id === target.id) return;

    const nextAliases = Array.from(new Set([
      ...(target.meta?.aliases || []),
      source.name,
      ...(source.meta?.aliases || []),
    ].map((value) => normalizeTagName(value)).filter(Boolean)));

    const nextTags = activeTags.map((tag) => {
      if (tag.id === target.id) {
        return normalizeRichTag({
          ...tag,
          meta: {
            ...tag.meta,
            aliases: nextAliases,
            usageNotes: appendUsageNote(tag.meta?.usageNotes, `Phase 5 merged alias: ${source.name}`),
          },
        });
      }
      if (tag.id === source.id) {
        return normalizeRichTag({
          ...tag,
          meta: {
            ...tag.meta,
            isDeprecated: true,
            usageNotes: appendUsageNote(tag.meta?.usageNotes, `Phase 5 merged into ${target.name}`),
          },
        });
      }
      return tag;
    });

    await saveActiveTags(nextTags);
  };

  const handlePhase5RepairMetadata = async (tagId: string) => {
    const target = activeTags.find((tag) => tag.id === tagId);
    if (!target) return;

    const currentCollection = target.meta?.collection || '';
    const currentGroup = target.meta?.group || '';
    const inferredCollection = currentCollection || inferCollectionForGroup(tagSubPage, currentGroup);
    const collectionDef = findCollectionByLabel(tagSubPage, inferredCollection);
    const repairedGroup = currentGroup || collectionDef?.groups[0] || '';
    const repairedCollection = inferredCollection || inferCollectionForGroup(tagSubPage, repairedGroup);

    const nextTags = activeTags.map((tag) => tag.id === tagId ? normalizeRichTag({
      ...tag,
      meta: {
        ...tag.meta,
        collection: repairedCollection,
        group: repairedGroup,
        usageNotes: appendUsageNote(tag.meta?.usageNotes, 'Phase 5 metadata repair applied'),
      },
    }) : tag);

    await saveActiveTags(nextTags);
  };

  const handlePhase5ToggleDeprecated = async (tagId: string, nextValue: boolean) => {
    const nextTags = activeTags.map((tag) => tag.id === tagId ? normalizeRichTag({
      ...tag,
      meta: {
        ...tag.meta,
        isDeprecated: nextValue,
        usageNotes: nextValue
          ? appendUsageNote(tag.meta?.usageNotes, 'Phase 5 manually deprecated')
          : (tag.meta?.usageNotes || '').replace(/\s*\|?\s*Phase 5 manually deprecated/gi, '').trim(),
      },
    }) : tag);
    await saveActiveTags(nextTags);
  };

  const handlePhase7ApplyBridgeHints = async (tagId: string) => {
    const target = activeTags.find((tag) => tag.id === tagId);
    if (!target) return;
    const suggestions = inferCardBridgeHints(target);
    const nextTags = activeTags.map((tag) => tag.id === tagId ? normalizeRichTag({
      ...tag,
      meta: {
        ...tag.meta,
        recommendedCardFamilies: suggestions.families,
        recommendedCardPurposes: suggestions.purposes,
        usageNotes: appendUsageNote(tag.meta?.usageNotes, 'Phase 7 bridge hints applied'),
      },
    }) : tag);
    await saveActiveTags(nextTags);
  };

  const handlePhase7LinkReplacement = async (tagId: string, replacementId: string) => {
    const replacement = activeTags.find((tag) => tag.id === replacementId);
    if (!replacement) return;
    const nextTags = activeTags.map((tag) => tag.id === tagId ? normalizeRichTag({
      ...tag,
      meta: {
        ...tag.meta,
        isDeprecated: true,
        replacementTagId: replacement.id,
        replacementTagName: replacement.name,
        usageNotes: appendUsageNote(tag.meta?.usageNotes, `Phase 7 replacement linked to ${replacement.name}`),
      },
    }) : tag);
    await saveActiveTags(nextTags);
  };

  const handlePhase8ApplyPreset = async (tagId: string) => {
    const target = activeTags.find((tag) => tag.id === tagId);
    if (!target) return;
    const suggestion = inferCardCreationPreset(target);
    const nextTags = activeTags.map((tag) => tag.id === tagId ? normalizeRichTag({
      ...tag,
      meta: {
        ...tag.meta,
        starterCardTargeting: suggestion.targeting,
        starterCardCostModel: suggestion.costModel,
        cardCreationNote: suggestion.note || tag.meta?.cardCreationNote || '',
        usageNotes: appendUsageNote(tag.meta?.usageNotes, 'Phase 8 creation preset applied'),
      },
    }) : tag);
    await saveActiveTags(nextTags);
  };

  const handlePhase9ApplyWorkflow = async (tagId: string) => {
    const target = activeTags.find((tag) => tag.id === tagId);
    if (!target) return;
    const suggestion = inferCardWorkflowPreset(target);
    const nextTags = activeTags.map((tag) => tag.id === tagId ? normalizeRichTag({
      ...tag,
      meta: {
        ...tag.meta,
        starterCardTemplate: suggestion.template,
        starterCardFocusPanel: suggestion.focusPanel,
        cardCreationNote: tag.meta?.cardCreationNote || suggestion.note || '',
        usageNotes: appendUsageNote(tag.meta?.usageNotes, 'Phase 9 workflow handoff applied'),
      },
    }) : tag);
    await saveActiveTags(nextTags);
  };

  const handlePhase10ApplyStarterProfile = async (tagId: string) => {
    const target = activeTags.find((tag) => tag.id === tagId);
    if (!target) return;
    const bridge = inferCardBridgeHints(target);
    const starter = buildCardStarterProfile(target);
    const nextTags = activeTags.map((tag) => tag.id === tagId ? normalizeRichTag({
      ...tag,
      meta: {
        ...tag.meta,
        recommendedCardFamilies: (tag.meta?.recommendedCardFamilies && tag.meta.recommendedCardFamilies.length > 0) ? tag.meta.recommendedCardFamilies : bridge.families,
        recommendedCardPurposes: (tag.meta?.recommendedCardPurposes && tag.meta.recommendedCardPurposes.length > 0) ? tag.meta.recommendedCardPurposes : bridge.purposes,
        starterCardTargeting: starter.targeting,
        starterCardCostModel: starter.costModel,
        starterCardTemplate: starter.template,
        starterCardFocusPanel: starter.focusPanel,
        cardCreationNote: tag.meta?.cardCreationNote || starter.note || '',
        usageNotes: appendUsageNote(tag.meta?.usageNotes, 'Phase 10 starter intake profile applied'),
      },
    }) : tag);
    await saveActiveTags(nextTags);
  };

  const handlePhase11ApplyPresentationProfile = async (tagId: string) => {
    const target = activeTags.find((tag) => tag.id === tagId);
    if (!target) return;
    const presentation = buildCardPresentationProfile(target);
    const nextTags = activeTags.map((tag) => tag.id === tagId ? normalizeRichTag({
      ...tag,
      meta: {
        ...tag.meta,
        playerFacingVisibility: presentation.visibility,
        playerFacingBadgeLabel: presentation.badgeLabel,
        playerFacingFilterGroup: presentation.filterGroup,
        playerFacingSortOrder: presentation.sortOrder,
        usageNotes: appendUsageNote(tag.meta?.usageNotes, 'Phase 11 player-facing presentation profile applied'),
      },
    }) : tag);
    await saveActiveTags(nextTags);
  };

  const updateEditingTagField = (key: "name" | "description", value: string) => {
    if (editingTag) setEditingTag({ ...editingTag, [key]: value });
  };

  const updateEditingTagMeta = (updates: Partial<RichTagMeta>) => {
    if (!editingTag) return;
    setEditingTag({
      ...editingTag,
      meta: sanitizeTagMeta({
        ...editingTag.meta,
        ...updates,
      }),
    });
  };

  const addFieldToEditingTag = () => {
    if (!editingTag || !legacyIntentConfirmed) return;
    setEditingTag({
      ...editingTag,
      fields: [...editingTag.fields, { id: `tf-${Date.now()}`, name: "", type: "text" }],
    });
    setShowLegacyFieldsEditor(true);
  };

  const updateEditingTagFieldName = (fieldId: string, name: string) => {
    if (!editingTag) return;
    setEditingTag({
      ...editingTag,
      fields: editingTag.fields.map((f) => (f.id === fieldId ? { ...f, name } : f)),
    });
  };

  const updateEditingTagFieldProp = (fieldId: string, updates: Partial<TagField>) => {
    if (!editingTag) return;
    setEditingTag({
      ...editingTag,
      fields: editingTag.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
    });
  };

  const removeFieldFromEditingTag = (fieldId: string) => {
    if (!editingTag) return;
    setEditingTag({
      ...editingTag,
      fields: editingTag.fields.filter((f) => f.id !== fieldId),
    });
  };

  const moveFieldUp = (fieldId: string) => {
    if (!editingTag) return;
    const idx = editingTag.fields.findIndex((f) => f.id === fieldId);
    if (idx <= 0) return;
    const fields = [...editingTag.fields];
    [fields[idx - 1], fields[idx]] = [fields[idx], fields[idx - 1]];
    setEditingTag({ ...editingTag, fields });
  };

  const moveFieldDown = (fieldId: string) => {
    if (!editingTag) return;
    const idx = editingTag.fields.findIndex((f) => f.id === fieldId);
    if (idx < 0 || idx >= editingTag.fields.length - 1) return;
    const fields = [...editingTag.fields];
    [fields[idx], fields[idx + 1]] = [fields[idx + 1], fields[idx]];
    setEditingTag({ ...editingTag, fields });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[16px]" style={{ ...S_ACCENT, fontWeight: 600 }}>Manage Tags</h2>
          <p className="text-[12px] mt-1" style={S_SUBTLE}>
            Tags should now mainly act as descriptors and identifiers. Extra fields are still available for backward compatibility, but they are no longer the center of tag design.
          </p>
          <div className="mt-2 text-[10px]" style={S_MUTED}>
            Think: what something is, what it is associated with, or who it usually points at. Avoid using tags as the main source of mechanics, costs, scaling, or tracker behavior.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] px-2.5 py-1.5" style={{ color: "#4A7BFF", border: "1px solid #4A7BFF33", background: "#4A7BFF15" }}>
            {roleCounts.descriptor} descriptors
          </span>
          <span className="text-[10px] px-2.5 py-1.5" style={{ color: "#FF9A4A", border: "1px solid #FF9A4A33", background: "#FF9A4A15" }}>
            {roleCounts.identifier} identifiers
          </span>
          <span className="text-[10px] px-2.5 py-1.5" style={{ color: "#C4A0FF", border: "1px solid #C4A0FF33", background: "#C4A0FF15" }}>
            {roleCounts.legacy} legacy field tag{roleCounts.legacy === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {subPages.map((sp) => (
          <button
            key={sp.id}
            onClick={() => {
              setTagSubPage(sp.id);
              setExpandedTagId(null);
              setEditingTag(null);
              setNewTagName("");
              setNewTagDesc("");
              setNewTagCollection("");
              setNewTagGroup("");
              setNewTagAliases("");
              setNewTagColor("");
              setNewTagUsageNotes("");
              setNewTagCardFamilies([]);
              setNewTagCardPurposes([]);
              setNewTagCardTargeting("");
              setNewTagCardCostModel("");
              setNewTagCardCreationNote("");
              setNewTagCardTemplate("");
              setNewTagCardFocusPanel("");
              setBatchInput("");
              setTagSearch("");
              setRoleFilter("all");
              setCollectionFilter("all");
              setGroupFilter("all");
              setDeprecationFilter("active");
              setCreateIntent("descriptor");
              setLegacyIntentConfirmed(false);
              setPhase5MaintenanceFilter("all");
            }}
            className={`${tagSubPage === sp.id ? `${retro.sunken} bg-[#0C0C2E]` : `${retro.raised} bg-[#161648] hover:bg-[#1E1E58]`} px-4 py-2 text-[12px] transition-colors`}
            style={{ color: tagSubPage === sp.id ? "#4A7BFF" : "#C0D0F0", fontWeight: tagSubPage === sp.id ? 600 : 400 }}
          >
            {sp.label}
          </button>
        ))}
      </div>

      <div className={`${retro.sunken} bg-[#0A0A28] p-4`} style={{ border: "1px solid #1A1A4B" }}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={12} style={{ color: "#FFB454" }} />
          <div className="text-[11px]" style={S_SECTION_HDR}>TAG DESIGN CHARTER</div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 text-[10px]">
          <div>
            <div className="mb-1" style={{ color: "#4ACA6A", fontWeight: 600 }}>Use tags for</div>
            <div style={S_MUTED}>
              Identity, theme, targeting shorthand, organization, search, filtering, and quick recognition.
            </div>
          </div>
          <div>
            <div className="mb-1" style={{ color: "#FF8A6A", fontWeight: 600 }}>Do not rely on tags for</div>
            <div style={S_MUTED}>
              Costs, scaling, tracker setup, runtime mechanics, card-specific behavior, or form structure unless you are intentionally preserving legacy compatibility.
            </div>
          </div>
        </div>
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="text-[12px] mb-1" style={S_SECTION_HDR}>{subPages.find((sp) => sp.id === tagSubPage)?.label.toUpperCase()}</div>
        <div className="text-[11px] mb-4" style={S_MUTED}>
          {subPages.find((sp) => sp.id === tagSubPage)?.helper}
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {([
            { id: "single" as const, label: "Single Tag", icon: Plus },
            { id: "batch" as const, label: "Batch Create", icon: Layers3 },
            { id: "packs" as const, label: "Starter Packs", icon: Sparkles },
          ]).map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                onClick={() => setCreateMode(mode.id)}
                className={`${createMode === mode.id ? `${retro.sunken} bg-[#0A0A30]` : `${retro.raised} bg-[#141446] hover:bg-[#1A1A56]`} px-3 py-2 text-[11px] flex items-center gap-1.5`}
                style={{ color: createMode === mode.id ? "#4A7BFF" : "#C0D0F0" }}
              >
                <Icon size={12} /> {mode.label}
              </button>
            );
          })}
        </div>

        {createMode === "single" && (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] mb-2" style={S_SECTION_HDR}>CREATE INTENT</div>
              <div className="flex gap-2 flex-wrap">
                {TAG_INTENT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setCreateIntent(option.id)}
                    className={`${createIntent === option.id ? `${retro.sunken} bg-[#0A0A30]` : `${retro.raised} bg-[#141446] hover:bg-[#1A1A56]`} px-3 py-2 text-[11px]`}
                    style={{ color: createIntent === option.id ? option.accent : "#C0D0F0", border: `1px solid ${createIntent === option.id ? `${option.accent}44` : "#2A2A5B"}` }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px]" style={S_MUTED}>
                <span style={{ color: createIntentConfig.accent, fontWeight: 600 }}>{createIntentConfig.label}:</span> {createIntentConfig.helper}
              </div>
              <div className="mt-1 text-[10px]" style={S_DIM}>
                Examples: {TAG_CREATION_EXAMPLES[tagSubPage][createIntent].join(", ")}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TAG_COLLECTIONS[tagSubPage].map((collection) => (
                  <button
                    key={collection.id}
                    onClick={() => applyCollectionPreset(collection.label)}
                    className={`${retro.button} px-2 py-1 text-[10px]`}
                    style={{ color: collection.accent, border: `1px solid ${collection.accent}33`, background: newTagCollection === collection.label ? `${collection.accent}18` : undefined }}
                  >
                    {collection.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] block mb-1" style={labelStyle}>Tag Name</label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder={createIntentDefaults.placeholder}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-[10px] block mb-1" style={labelStyle}>Description</label>
                <input
                  type="text"
                  value={newTagDesc}
                  onChange={(e) => setNewTagDesc(e.target.value)}
                  placeholder={createIntentDefaults.descriptionPlaceholder}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>

            <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: "1px solid #1A1A4B" }}>
              <div className="text-[10px] mb-3" style={S_SECTION_HDR}>PHASE 2 / 4 METADATA</div>
              <div className="mb-3">
                <div className="text-[10px] mb-1" style={{ color: "#8AD4FF", fontWeight: 600 }}>Collections</div>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_COLLECTIONS[tagSubPage].map((collection) => (
                    <button
                      key={collection.id}
                      onClick={() => applyCollectionPreset(collection.label)}
                      className={`${retro.button} px-2 py-1 text-[10px]`}
                      style={{ color: collection.accent, border: `1px solid ${collection.accent}33`, background: newTagCollection === collection.label ? `${collection.accent}18` : undefined }}
                    >
                      {collection.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Collection</label>
                  <select value={newTagCollection} onChange={(e) => setNewTagCollection(e.target.value)} className={inputClass} style={inputStyle}>
                    <option value="">No collection</option>
                    {TAG_COLLECTIONS[tagSubPage].map((collection) => <option key={collection.id} value={collection.label}>{collection.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Group</label>
                  <input
                    type="text"
                    list={`tag-group-suggestions-${tagSubPage}`}
                    value={newTagGroup}
                    onChange={(e) => setNewTagGroup(e.target.value)}
                    placeholder="Optional group"
                    className={inputClass}
                    style={inputStyle}
                  />
                  <datalist id={`tag-group-suggestions-${tagSubPage}`}>
                    {TAG_GROUP_OPTIONS[tagSubPage].map((group) => <option key={group} value={group} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Aliases</label>
                  <input
                    type="text"
                    value={newTagAliases}
                    onChange={(e) => setNewTagAliases(e.target.value)}
                    placeholder="Comma-separated aliases"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Accent Color</label>
                  <input
                    type="text"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    placeholder="#4A7BFF"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Usage Notes</label>
                  <input
                    type="text"
                    value={newTagUsageNotes}
                    onChange={(e) => setNewTagUsageNotes(e.target.value)}
                    placeholder="Optional internal guidance"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div className="mt-2 text-[10px]" style={S_MUTED}>
                Phase 2 adds lightweight metadata for organization and discoverability without turning tags back into mechanic containers. Phase 4 promotes collections and groups into first-class library structure.
                {createAliasList.length > 0 ? ` ${createAliasList.length} alias${createAliasList.length === 1 ? "" : "es"} ready.` : ""}
              </div>
            </div>

            <div className="text-[10px]" style={S_DIM}>
              {createIntentDefaults.helper}
            </div>

            <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: "1px solid #1A1A4B" }}>
              <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 3 SMART GUIDANCE</div>

              {createNamingGuidance.length > 0 ? (
                <div className="mb-3">
                  <div className="text-[10px] mb-1" style={{ color: "#8AD4FF", fontWeight: 600 }}>Naming guidance</div>
                  <div className="space-y-1 text-[10px]" style={S_MUTED}>
                    {createNamingGuidance.map((tip) => (
                      <div key={tip}>• {tip}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[10px] mb-3" style={S_MUTED}>
                  The current name shape fits the chosen create intent well.
                </div>
              )}

              {createNearDuplicates.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] mb-1" style={{ color: "#FFB454", fontWeight: 600 }}>Near-duplicate check</div>
                  <div className="space-y-1 text-[10px]" style={S_MUTED}>
                    {createNearDuplicates.map((match) => (
                      <div key={match.id}>
                        <span style={{ color: "#FFD7A0" }}>{match.name}</span> · {match.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] mb-1" style={{ color: "#4ACA6A", fontWeight: 600 }}>Suggested tags for this intent</div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedCreateTags.length > 0 ? suggestedCreateTags.map((suggestion) => (
                    <button
                      key={suggestion.name}
                      onClick={() => applyCreateSuggestion(suggestion.name, suggestion.description)}
                      className={`${retro.button} px-2 py-1 text-[10px]`}
                      style={{ color: "#8AD4FF", border: "1px solid #8AD4FF33" }}
                    >
                      {suggestion.name}
                    </button>
                  )) : (
                    <span className="text-[10px]" style={S_MUTED}>No unused suggestions left for this intent.</span>
                  )}
                </div>
              </div>
            </div>

            {tagSubPage === 'cards' && (
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: "1px solid #1A1A4B" }}>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 7 CARD-SYSTEM BRIDGE</div>
                <div className="text-[10px] mb-3" style={S_MUTED}>
                  Tags no longer define card behavior, but they can now carry recommendation metadata for the structured card model.
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="text-[10px]" style={S_MUTED}>
                    Suggested families: {createPhase7BridgeSuggestion.families.length > 0 ? createPhase7BridgeSuggestion.families.join(', ') : 'none'} • Suggested purposes: {createPhase7BridgeSuggestion.purposes.length > 0 ? createPhase7BridgeSuggestion.purposes.join(', ') : 'none'}
                  </div>
                  <button
                    onClick={() => {
                      setNewTagCardFamilies(createPhase7BridgeSuggestion.families);
                      setNewTagCardPurposes(createPhase7BridgeSuggestion.purposes);
                    }}
                    className={`${retro.button} px-3 py-1.5 text-[10px]`}
                    style={{ color: '#8AD4FF', border: '1px solid #8AD4FF33' }}
                  >
                    Apply Suggested Hints
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] mb-1" style={{ color: '#8AD4FF', fontWeight: 600 }}>Recommended Families</div>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_FAMILY_HINT_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setNewTagCardFamilies((current) => toggleHintValue(current, option.id))}
                          className={`${retro.button} px-2 py-1 text-[10px]`}
                          style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: newTagCardFamilies.includes(option.id) ? `${option.accent}18` : undefined }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-1" style={{ color: '#4ACA6A', fontWeight: 600 }}>Recommended Purposes</div>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_PURPOSE_HINT_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setNewTagCardPurposes((current) => toggleHintValue(current, option.id))}
                          className={`${retro.button} px-2 py-1 text-[10px]`}
                          style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: newTagCardPurposes.includes(option.id) ? `${option.accent}18` : undefined }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tagSubPage === 'cards' && (
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: "1px solid #1A1A4B" }}>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 8 CARD-CREATION PRESETS</div>
                <div className="text-[10px] mb-3" style={S_MUTED}>
                  These hints prepare future card creation so a chosen tag can suggest a starter targeting shape, cost model, and brief authoring note without controlling card behavior.
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="text-[10px]" style={S_MUTED}>
                    Suggested targeting: {createPhase8PresetSuggestion.targeting || 'none'} • Suggested cost: {createPhase8PresetSuggestion.costModel || 'none'}
                  </div>
                  <button
                    onClick={() => {
                      setNewTagCardTargeting(createPhase8PresetSuggestion.targeting || '');
                      setNewTagCardCostModel(createPhase8PresetSuggestion.costModel || '');
                      if (!newTagCardCreationNote.trim()) setNewTagCardCreationNote(createPhase8PresetSuggestion.note || '');
                    }}
                    className={`${retro.button} px-3 py-1.5 text-[10px]`}
                    style={{ color: '#FFD7A0', border: '1px solid #FFD7A033' }}
                  >
                    Apply Suggested Preset
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="text-[10px] mb-1" style={{ color: '#8AD4FF', fontWeight: 600 }}>Starter Targeting</div>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_TARGET_HINT_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setNewTagCardTargeting((current) => current === option.id ? '' : option.id)}
                          className={`${retro.button} px-2 py-1 text-[10px]`}
                          style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: newTagCardTargeting === option.id ? `${option.accent}18` : undefined }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-1" style={{ color: '#FFB454', fontWeight: 600 }}>Starter Cost Model</div>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_COST_HINT_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setNewTagCardCostModel((current) => current === option.id ? '' : option.id)}
                          className={`${retro.button} px-2 py-1 text-[10px]`}
                          style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: newTagCardCostModel === option.id ? `${option.accent}18` : undefined }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Card Creation Note</label>
                  <input
                    type="text"
                    value={newTagCardCreationNote}
                    onChange={(e) => setNewTagCardCreationNote(e.target.value)}
                    placeholder="Optional note for how this tag should guide future card creation"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {tagSubPage === 'cards' && (
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: "1px solid #1A1A4B" }}>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 9 WORKFLOW HANDOFF</div>
                <div className="text-[10px] mb-3" style={S_MUTED}>
                  These fields let a tag recommend which starter template and editor panel should open first when the card workflow begins using tag-side presets.
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="text-[10px]" style={S_MUTED}>
                    Suggested template: {createPhase9WorkflowSuggestion.template || 'none'} • Suggested panel: {createPhase9WorkflowSuggestion.focusPanel || 'none'}
                  </div>
                  <button
                    onClick={() => {
                      setNewTagCardTemplate(createPhase9WorkflowSuggestion.template || '');
                      setNewTagCardFocusPanel(createPhase9WorkflowSuggestion.focusPanel || '');
                      if (!newTagCardCreationNote.trim()) setNewTagCardCreationNote(createPhase9WorkflowSuggestion.note || '');
                    }}
                    className={`${retro.button} px-3 py-1.5 text-[10px]`}
                    style={{ color: '#A0B4FF', border: '1px solid #A0B4FF33' }}
                  >
                    Apply Suggested Workflow
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="text-[10px] mb-1" style={{ color: '#A0B4FF', fontWeight: 600 }}>Starter Template</div>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_TEMPLATE_HINT_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setNewTagCardTemplate((current) => current === option.id ? '' : option.id)}
                          className={`${retro.button} px-2 py-1 text-[10px]`}
                          style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: newTagCardTemplate === option.id ? `${option.accent}18` : undefined }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-1" style={{ color: '#6ABAFF', fontWeight: 600 }}>Starter Panel</div>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_FOCUS_HINT_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setNewTagCardFocusPanel((current) => current === option.id ? '' : option.id)}
                          className={`${retro.button} px-2 py-1 text-[10px]`}
                          style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: newTagCardFocusPanel === option.id ? `${option.accent}18` : undefined }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tagSubPage === 'cards' && (
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: "1px solid #1A1A4B" }}>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 10 NEW-CARD INTAKE PROFILE</div>
                <div className="text-[10px] mb-3" style={S_MUTED}>
                  This phase combines the Phase 7 through 9 hints into one intake profile the card editor can consume later for new-card creation.
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="text-[10px]" style={S_MUTED}>
                    Readiness: {createPhase10StarterProfile.readiness} • Template: {createPhase10StarterProfile.template || 'none'} • Panel: {createPhase10StarterProfile.focusPanel || 'none'}
                  </div>
                  <button
                    onClick={() => {
                      setNewTagCardFamilies(createPhase10StarterProfile.families);
                      setNewTagCardPurposes(createPhase10StarterProfile.purposes);
                      setNewTagCardTargeting(createPhase10StarterProfile.targeting || '');
                      setNewTagCardCostModel(createPhase10StarterProfile.costModel || '');
                      setNewTagCardTemplate(createPhase10StarterProfile.template || '');
                      setNewTagCardFocusPanel(createPhase10StarterProfile.focusPanel || '');
                      if (!newTagCardCreationNote.trim()) setNewTagCardCreationNote(createPhase10StarterProfile.note || '');
                    }}
                    className={`${retro.button} px-3 py-1.5 text-[10px]`}
                    style={{ color: '#9FE3B1', border: '1px solid #9FE3B133' }}
                  >
                    Apply Full Intake Profile
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-[10px]">
                  <div className={`${retro.sunken} bg-[#0A0A22] p-3`}>
                    <div style={S_SECTION_HDR}>Families / Purposes</div>
                    <div className="mt-1" style={S_MUTED}>{createPhase10StarterProfile.families.join(', ') || 'none'} • {createPhase10StarterProfile.purposes.join(', ') || 'none'}</div>
                  </div>
                  <div className={`${retro.sunken} bg-[#0A0A22] p-3`}>
                    <div style={S_SECTION_HDR}>Target / Cost</div>
                    <div className="mt-1" style={S_MUTED}>{createPhase10StarterProfile.targeting || 'none'} • {createPhase10StarterProfile.costModel || 'none'}</div>
                  </div>
                  <div className={`${retro.sunken} bg-[#0A0A22] p-3`}>
                    <div style={S_SECTION_HDR}>Workflow</div>
                    <div className="mt-1" style={S_MUTED}>{createPhase10StarterProfile.template || 'none'} template • {createPhase10StarterProfile.focusPanel || 'none'} panel</div>
                  </div>
                </div>
                {createPhase10StarterProfile.note ? <div className="mt-3 text-[10px]" style={S_DIM}>{createPhase10StarterProfile.note}</div> : null}
              </div>
            )}

            {creationWarnings.length > 0 && (
              <div className={`${retro.raised} bg-[#2A160E] p-3`} style={{ border: "1px solid #5A2A1A" }}>
                <div className="text-[10px] mb-1" style={{ color: "#FFB454", fontWeight: 600 }}>Phase 1 warning</div>
                <div className="space-y-1 text-[10px]" style={{ color: "#FFD7A0" }}>
                  {creationWarnings.map((warning) => (
                    <div key={warning}>• {warning}</div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => { void handleAddTag(); }} className={`${retro.button} px-5 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
              <Plus size={14} /> Add Tag
            </button>
          </div>
        )}

        {createMode === "batch" && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] block mb-1" style={labelStyle}>Batch Input</label>
              <textarea
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                rows={7}
                placeholder={`Enter one tag per line.\nYou can also use "Tag Name - Description".\n\nAttack\nUtility\nTarget: Enemy - Mainly directed at enemies\nTwilight - Associated with dusk and thresholds`}
                className={`${inputClass} resize-y`}
                style={{ ...inputStyle, minHeight: 140 }}
              />
            </div>
            <div className="text-[10px]" style={S_DIM}>
              Great for setting up a category quickly. Duplicate names are skipped automatically. Keep these as descriptor-first labels, not mechanics definitions. Any selected create intent or group will be applied to the newly added batch tags.
            </div>
            <button onClick={() => { void handleAddBatchTags(); }} className={`${retro.button} px-5 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
              <Layers3 size={14} /> Create Batch
            </button>
          </div>
        )}

        {createMode === "packs" && (
          <div className="space-y-3">
            <div className="text-[10px]" style={S_DIM}>
              Starter packs are meant to seed clean descriptor and identifier libraries. They should help organize content, not drive card or item behavior.
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {activePackDefs.map((pack) => (
              <div key={pack.id} className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: "1px solid #1A1A4B" }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <div className="text-[12px]" style={S_TEXT}>{pack.label}</div>
                    <div className="text-[10px]" style={S_MUTED}>{pack.description}</div>
                  </div>
                  <button onClick={() => { void handleCreatePack(pack); }} className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1`} style={S_GREEN_BTN}>
                    <Sparkles size={10} /> Add Pack
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pack.tags.map((tag) => (
                    <span key={tag.name} className="text-[9px] px-2 py-1" style={{ background: "#141446", color: "#8A9ABB", border: "1px solid #2A2A5B" }}>
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="text-[12px]" style={S_SECTION_HDR}>
            TAG LIBRARY ({visibleTags.length}/{activeTags.length})
          </div>
          <div className="flex gap-2 flex-wrap">
            {([
              { id: "all" as const, label: "All" },
              { id: "descriptor" as const, label: `Descriptors (${roleCounts.descriptor})` },
              { id: "identifier" as const, label: `Identifiers (${roleCounts.identifier})` },
              { id: "targeting" as const, label: `Targeting (${roleCounts.targeting})` },
              { id: "legacy" as const, label: `Legacy Fields (${roleCounts.legacy})` },
            ]).map((filter) => (
              <button
                key={filter.id}
                onClick={() => setRoleFilter(filter.id)}
                className={`${roleFilter === filter.id ? `${retro.sunken} bg-[#0A0A30]` : `${retro.raised} bg-[#141446] hover:bg-[#1A1A56]`} px-2.5 py-1.5 text-[10px]`}
                style={{ color: roleFilter === filter.id ? "#4A7BFF" : "#8A9ABB" }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3">
          {collectionSummaries.map((collection) => (
            <button
              key={collection.label}
              onClick={() => setCollectionFilter(collectionFilter === collection.label ? "all" : collection.label)}
              className={`${retro.raised} bg-[#0A0A28] p-3 text-left`}
              style={{ border: `1px solid ${collectionFilter === collection.label ? `${collection.accent}55` : "#1A1A4B"}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px]" style={{ color: collection.accent, fontWeight: 600 }}>{collection.label}</div>
                <div className="text-[10px]" style={S_MUTED}>{collection.count} tags</div>
              </div>
              <div className="mt-1 text-[10px]" style={S_MUTED}>{collection.description}</div>
              <div className="mt-1 text-[9px]" style={S_DIM}>{collection.groups.length} linked groups</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr] gap-3 mb-3">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={S_MUTED} />
            <input
              type="text"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              placeholder="Search tags by name, description, aliases, group, or notes..."
              className={`${inputClass} pl-9`}
              style={inputStyle}
            />
          </div>

          <div>
            <label className="text-[10px] block mb-1" style={labelStyle}>Collection Filter</label>
            <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)} className={inputClass} style={inputStyle}>
              <option value="all">All Collections</option>
              {activeCollections.map((collection) => <option key={collection} value={collection}>{collection}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] block mb-1" style={labelStyle}>Group Filter</label>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={inputClass} style={inputStyle}>
              <option value="all">All Groups</option>
              {activeGroups.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] block mb-1" style={labelStyle}>Deprecation Filter</label>
            <select value={deprecationFilter} onChange={(e) => setDeprecationFilter(e.target.value as TagDeprecationFilter)} className={inputClass} style={inputStyle}>
              <option value="active">Active Only</option>
              <option value="deprecated">Deprecated Only</option>
              <option value="all">Active + Deprecated</option>
            </select>
          </div>
        </div>

        <div className="relative mb-3" style={{ display: "none" }}>
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={S_MUTED} />
          <input
            type="text"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            placeholder="Search tags by name or description..."
            className={`${inputClass} pl-9`}
            style={inputStyle}
          />
        </div>

        {visibleTags.length === 0 ? (
          <div className="text-[12px] text-center py-6" style={S_MUTED}>No matching tags for this category.</div>
        ) : (
          <div className="space-y-1">
            {visibleTags.map((tag) => {
              const isExpanded = expandedTagId === tag.id;
              const isEditingThis = editingTag?.id === tag.id;
              const role = inferTagRole(tag);

              return (
                <div key={tag.id}>
                  <div
                    className={`flex items-center justify-between py-2.5 px-3 cursor-pointer transition-colors ${isExpanded ? "bg-[#0E0E35]" : "hover:bg-[#0A0A30]"}`}
                    style={{ borderBottom: "1px solid #1A1A4B" }}
                    onClick={() => {
                      if (!isEditingThis) {
                        setExpandedTagId(isExpanded ? null : tag.id);
                        setEditingTag(null);
                        setShowLegacyFieldsEditor(false);
                        setLegacyIntentConfirmed(false);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {isExpanded ? <ChevronDown size={12} style={S_ACCENT} /> : <ChevronRight size={12} style={S_MUTED} />}
                      <span className="text-[10px] px-2 py-0.5 flex items-center gap-1" style={{ background: "#1A1A4B", color: "#7A8AAA", border: "1px solid #2A2A5B" }}>
                        <Tag size={8} />
                        {tag.name}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5" style={{ color: tag.meta?.color || role.accent, border: `1px solid ${(tag.meta?.color || role.accent)}33`, background: `${(tag.meta?.color || role.accent)}15` }}>
                        {role.label}
                      </span>
                      {!!tag.meta?.collection && (
                        <span className="text-[9px] px-1.5 py-0.5" style={{ color: findCollectionByLabel(tagSubPage, tag.meta.collection)?.accent || "#8AD4FF", border: `1px solid ${(findCollectionByLabel(tagSubPage, tag.meta.collection)?.accent || "#8AD4FF")}33`, background: `${(findCollectionByLabel(tagSubPage, tag.meta.collection)?.accent || "#8AD4FF")}15` }}>
                          {tag.meta.collection}
                        </span>
                      )}
                      {!!tag.meta?.group && (
                        <span className="text-[9px] px-1.5 py-0.5" style={{ color: "#8AD4FF", border: "1px solid #8AD4FF33", background: "#8AD4FF15" }}>
                          {tag.meta.group}
                        </span>
                      )}
                      {tag.meta?.isDeprecated && (
                        <span className="text-[9px] px-1.5 py-0.5" style={{ color: "#FF8A6A", border: "1px solid #FF8A6A33", background: "#FF8A6A15" }}>
                          Deprecated
                        </span>
                      )}
                      {tag.fields.length > 0 && (
                        <span className="text-[9px]" style={S_MUTED}>
                          {tag.fields.length} legacy field{tag.fields.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEditTag(tag);
                        }}
                        className="text-[10px] px-2 py-0.5 hover:opacity-80"
                        style={{ color: "#4A7BFF", border: "1px solid #2A2A5B" }}
                      >
                        <Edit size={10} className="inline mr-1" />Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteTag(tag.id);
                        }}
                        className="text-[10px] px-2 py-0.5 hover:opacity-80"
                        style={{ color: "#FF6A6A", border: "1px solid #2A2A5B" }}
                      >
                        <Trash2 size={10} className="inline mr-1" />Delete
                      </button>
                    </div>
                  </div>

                  {isExpanded && !isEditingThis && (
                    <div className="px-8 py-3 bg-[#0A0A2E]" style={{ borderBottom: "1px solid #1A1A4B" }}>
                      <div className="text-[10px] mb-1" style={S_SECTION_HDR}>DESCRIPTION</div>
                      <p className="text-[12px] mb-3" style={S_TEXT}>{tag.description}</p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-[10px]">
                        <div>
                          <div style={S_SECTION_HDR}>PHASE 2 METADATA</div>
                          <div className="mt-1" style={S_MUTED}>
                            Role hint: {tag.meta?.roleHint || role.id}
                            {tag.meta?.collection ? ` • Collection: ${tag.meta.collection}` : ""}
                            {tag.meta?.group ? ` • Group: ${tag.meta.group}` : ""}
                          </div>
                          <div className="mt-1" style={S_MUTED}>
                            {tag.meta?.usageNotes ? `Usage Notes: ${tag.meta.usageNotes}` : "No extra usage notes."}
                          </div>
                        </div>
                        <div>
                          <div style={S_SECTION_HDR}>ALIASES & STATUS</div>
                          <div className="mt-1" style={S_MUTED}>
                            {tag.meta?.aliases?.length ? `Aliases: ${tag.meta.aliases.join(", ")}` : "No aliases set."}
                          </div>
                          <div className="mt-1" style={S_MUTED}>
                            {tag.meta?.isDeprecated ? "Marked as deprecated." : "Active tag."}
                            {tag.meta?.color ? ` Accent: ${tag.meta.color}` : ""}
                          </div>
                        </div>
                      </div>

                      {tag.fields.length > 0 ? (
                        <div>
                          <div className="text-[10px] mb-1" style={S_SECTION_HDR}>LEGACY ADVANCED FIELDS</div>
                          <div className="text-[10px] mb-2" style={S_MUTED}>
                            This tag still contains old extra-field behavior for compatibility. New tags should usually stay descriptor-only unless you deliberately need legacy behavior.
                          </div>
                          <div className="space-y-2">
                            {tag.fields.map((f) => {
                              const fType = f.type || "text";
                              const typeLabel = FIELD_TYPES.find((t) => t.value === fType)?.label || "Text";
                              return (
                                <div key={f.id} className="px-3 py-2" style={{ background: "#0A0A28", border: "1px solid #1A1A4B" }}>
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span style={{ color: "#5A6A8A", fontSize: 10 }}>{TYPE_ICONS[fType] || "Aa"}</span>
                                    <span className="text-[11px]" style={{ color: "#4A7BFF", fontWeight: 600 }}>{f.name}</span>
                                    <span className="text-[9px] px-1 py-0.5" style={{ background: "#161648", color: "#7A8AAA", border: "1px solid #2A2A5B" }}>{typeLabel}</span>
                                    {f.required && <span className="text-[8px] px-1 py-0.5" style={{ background: "#FF9A4A22", color: "#FF9A4A", border: "1px solid #FF9A4A33" }}>Required</span>}
                                    {f.allowCustom && <span className="text-[8px] px-1 py-0.5" style={{ background: "#7AA0FF22", color: "#7AA0FF", border: "1px solid #7AA0FF33" }}>Custom OK</span>}
                                  </div>
                                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[9px]">
                                    {f.placeholder && <span><span style={{ color: "#4A5A7A" }}>Placeholder:</span> <span style={{ color: "#8A9ABB" }}>{f.placeholder}</span></span>}
                                    {f.defaultValue && <span><span style={{ color: "#4A5A7A" }}>Default:</span> <span style={{ color: "#8A9ABB" }}>{f.defaultValue}</span></span>}
                                    {f.min != null && <span><span style={{ color: "#4A5A7A" }}>Min:</span> <span style={{ color: "#8A9ABB" }}>{f.min}</span></span>}
                                    {f.max != null && <span><span style={{ color: "#4A5A7A" }}>Max:</span> <span style={{ color: "#8A9ABB" }}>{f.max}</span></span>}
                                    {f.options && f.options.length > 0 && <span><span style={{ color: "#4A5A7A" }}>Options:</span> <span style={{ color: "#8A9ABB" }}>{f.options.filter((o) => o).join(", ")}</span></span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px]" style={S_MUTED}>
                          No legacy advanced fields. This tag is acting purely as a descriptor / identifier.
                        </div>
                      )}
                    </div>
                  )}

                  {isExpanded && isEditingThis && editingTag && (
                    <div className="px-4 py-4 bg-[#0A0A2E]" style={{ borderBottom: "1px solid #1A1A4B" }}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Tag Name</label>
                          <input
                            type="text"
                            value={editingTag.name}
                            onChange={(e) => updateEditingTagField("name", e.target.value)}
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Description</label>
                          <input
                            type="text"
                            value={editingTag.description}
                            onChange={(e) => updateEditingTagField("description", e.target.value)}
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                      </div>

                      <div className={`${retro.raised} bg-[#0A0A28] p-3 mb-4`} style={{ border: "1px solid #1A1A4B" }}>
                        <div className="text-[10px] mb-3" style={S_SECTION_HDR}>PHASE 2 / 4 METADATA</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Role Hint</label>
                            <select
                              value={editingTag.meta?.roleHint || ""}
                              onChange={(e) => updateEditingTagMeta({ roleHint: (e.target.value || undefined) as TagCreateIntent | undefined })}
                              className={inputClass}
                              style={inputStyle}
                            >
                              <option value="">Infer Automatically</option>
                              <option value="descriptor">Descriptor</option>
                              <option value="identifier">Identifier</option>
                              <option value="targeting">Targeting</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Collection</label>
                            <select
                              value={editingTag.meta?.collection || ""}
                              onChange={(e) => updateEditingTagMeta({ collection: e.target.value })}
                              className={inputClass}
                              style={inputStyle}
                            >
                              <option value="">No collection</option>
                              {TAG_COLLECTIONS[tagSubPage].map((collection) => <option key={collection.id} value={collection.label}>{collection.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Group</label>
                            <input
                              type="text"
                              list={`edit-tag-group-suggestions-${tagSubPage}`}
                              value={editingTag.meta?.group || ""}
                              onChange={(e) => updateEditingTagMeta({ group: e.target.value })}
                              className={inputClass}
                              style={inputStyle}
                            />
                            <datalist id={`edit-tag-group-suggestions-${tagSubPage}`}>
                              {TAG_GROUP_OPTIONS[tagSubPage].map((group) => <option key={group} value={group} />)}
                            </datalist>
                          </div>
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Aliases</label>
                            <input
                              type="text"
                              value={formatAliases(editingTag.meta?.aliases)}
                              onChange={(e) => updateEditingTagMeta({ aliases: parseAliases(e.target.value) })}
                              placeholder="Comma-separated aliases"
                              className={inputClass}
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Accent Color</label>
                            <input
                              type="text"
                              value={editingTag.meta?.color || ""}
                              onChange={(e) => updateEditingTagMeta({ color: e.target.value })}
                              placeholder="#4A7BFF"
                              className={inputClass}
                              style={inputStyle}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_auto] gap-3 mt-3 items-end">
                          <div>
                            <label className="text-[10px] block mb-1" style={labelStyle}>Usage Notes</label>
                            <input
                              type="text"
                              value={editingTag.meta?.usageNotes || ""}
                              onChange={(e) => updateEditingTagMeta({ usageNotes: e.target.value })}
                              placeholder="Optional internal guidance for when to use this tag"
                              className={inputClass}
                              style={inputStyle}
                            />
                          </div>
                          <label className="flex items-center gap-2 text-[10px]" style={S_MUTED}>
                            <input
                              type="checkbox"
                              checked={!!editingTag.meta?.isDeprecated}
                              onChange={(e) => updateEditingTagMeta({ isDeprecated: e.target.checked })}
                            />
                            Deprecated
                          </label>
                        </div>
                        <div className="mt-2 text-[10px]" style={S_MUTED}>
                          {editingAliasList.length > 0 ? `${editingAliasList.length} aliases configured.` : "No aliases configured yet."}
                        </div>
                      </div>

                      <div className={`${retro.raised} bg-[#0A0A28] p-3 mb-4`} style={{ border: "1px solid #1A1A4B" }}>
                        <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 3 SMART GUIDANCE</div>

                        {editingNamingGuidance.length > 0 ? (
                          <div className="mb-3">
                            <div className="text-[10px] mb-1" style={{ color: "#8AD4FF", fontWeight: 600 }}>Naming guidance</div>
                            <div className="space-y-1 text-[10px]" style={S_MUTED}>
                              {editingNamingGuidance.map((tip) => (
                                <div key={tip}>• {tip}</div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] mb-3" style={S_MUTED}>
                            This tag name currently reads clearly for its role.
                          </div>
                        )}

                        {editingNearDuplicates.length > 0 ? (
                          <div>
                            <div className="text-[10px] mb-1" style={{ color: "#FFB454", fontWeight: 600 }}>Nearby existing tags</div>
                            <div className="space-y-1 text-[10px]" style={S_MUTED}>
                              {editingNearDuplicates.map((match) => (
                                <div key={match.id}>
                                  <span style={{ color: "#FFD7A0" }}>{match.name}</span> · {match.reason}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px]" style={S_MUTED}>
                            No obvious near-duplicate tag names were found in this category.
                          </div>
                        )}
                      </div>

                      {(tagSubPage === 'cards' || !!editingTag.meta?.isDeprecated || (editingTag.meta?.renameHistory?.length || 0) > 0 || !!editingTag.meta?.replacementTagId) && (
                        <div className={`${retro.raised} bg-[#0A0A28] p-3 mb-4`} style={{ border: "1px solid #1A1A4B" }}>
                          <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 7 / 8 BRIDGE & CREATION PREP</div>

                          {tagSubPage === 'cards' && (
                            <>
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                                <div className="text-[10px]" style={S_MUTED}>
                                  Suggested families: {editingPhase7BridgeSuggestion.families.length > 0 ? editingPhase7BridgeSuggestion.families.join(', ') : 'none'} • Suggested purposes: {editingPhase7BridgeSuggestion.purposes.length > 0 ? editingPhase7BridgeSuggestion.purposes.join(', ') : 'none'}
                                </div>
                                <button
                                  onClick={() => updateEditingTagMeta({
                                    recommendedCardFamilies: editingPhase7BridgeSuggestion.families,
                                    recommendedCardPurposes: editingPhase7BridgeSuggestion.purposes,
                                  })}
                                  className={`${retro.button} px-3 py-1.5 text-[10px]`}
                                  style={{ color: '#8AD4FF', border: '1px solid #8AD4FF33' }}
                                >
                                  Apply Suggested Hints
                                </button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                <div>
                                  <div className="text-[10px] mb-1" style={{ color: '#8AD4FF', fontWeight: 600 }}>Recommended Families</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {CARD_FAMILY_HINT_OPTIONS.map((option) => (
                                      <button
                                        key={option.id}
                                        onClick={() => updateEditingTagMeta({ recommendedCardFamilies: toggleHintValue(editingTag.meta?.recommendedCardFamilies, option.id) })}
                                        className={`${retro.button} px-2 py-1 text-[10px]`}
                                        style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: (editingTag.meta?.recommendedCardFamilies || []).includes(option.id) ? `${option.accent}18` : undefined }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] mb-1" style={{ color: '#4ACA6A', fontWeight: 600 }}>Recommended Purposes</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {CARD_PURPOSE_HINT_OPTIONS.map((option) => (
                                      <button
                                        key={option.id}
                                        onClick={() => updateEditingTagMeta({ recommendedCardPurposes: toggleHintValue(editingTag.meta?.recommendedCardPurposes, option.id) })}
                                        className={`${retro.button} px-2 py-1 text-[10px]`}
                                        style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: (editingTag.meta?.recommendedCardPurposes || []).includes(option.id) ? `${option.accent}18` : undefined }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </>
                          )}

                          {tagSubPage === 'cards' && (
                            <div className="mb-3">
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                                <div className="text-[10px]" style={S_MUTED}>
                                  Suggested targeting: {editingPhase8PresetSuggestion.targeting || 'none'} • Suggested cost: {editingPhase8PresetSuggestion.costModel || 'none'}
                                </div>
                                <button
                                  onClick={() => updateEditingTagMeta({
                                    starterCardTargeting: editingPhase8PresetSuggestion.targeting,
                                    starterCardCostModel: editingPhase8PresetSuggestion.costModel,
                                    cardCreationNote: editingTag.meta?.cardCreationNote || editingPhase8PresetSuggestion.note || '',
                                  })}
                                  className={`${retro.button} px-3 py-1.5 text-[10px]`}
                                  style={{ color: '#FFD7A0', border: '1px solid #FFD7A033' }}
                                >
                                  Apply Suggested Preset
                                </button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                <div>
                                  <div className="text-[10px] mb-1" style={{ color: '#8AD4FF', fontWeight: 600 }}>Starter Targeting</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {CARD_TARGET_HINT_OPTIONS.map((option) => (
                                      <button
                                        key={option.id}
                                        onClick={() => updateEditingTagMeta({ starterCardTargeting: editingTag.meta?.starterCardTargeting === option.id ? undefined : option.id })}
                                        className={`${retro.button} px-2 py-1 text-[10px]`}
                                        style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: editingTag.meta?.starterCardTargeting === option.id ? `${option.accent}18` : undefined }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] mb-1" style={{ color: '#FFB454', fontWeight: 600 }}>Starter Cost Model</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {CARD_COST_HINT_OPTIONS.map((option) => (
                                      <button
                                        key={option.id}
                                        onClick={() => updateEditingTagMeta({ starterCardCostModel: editingTag.meta?.starterCardCostModel === option.id ? undefined : option.id })}
                                        className={`${retro.button} px-2 py-1 text-[10px]`}
                                        style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: editingTag.meta?.starterCardCostModel === option.id ? `${option.accent}18` : undefined }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] block mb-1" style={labelStyle}>Card Creation Note</label>
                                <input
                                  type="text"
                                  value={editingTag.meta?.cardCreationNote || ''}
                                  onChange={(e) => updateEditingTagMeta({ cardCreationNote: e.target.value })}
                                  placeholder="Optional note for how this tag should steer card creation"
                                  className={inputClass}
                                  style={inputStyle}
                                />
                              </div>
                            </div>
                          )}

                          {tagSubPage === 'cards' && (
                            <div className="mb-3">
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                                <div className="text-[10px]" style={S_MUTED}>
                                  Suggested template: {editingPhase9WorkflowSuggestion.template || 'none'} • Suggested panel: {editingPhase9WorkflowSuggestion.focusPanel || 'none'}
                                </div>
                                <button
                                  onClick={() => updateEditingTagMeta({
                                    starterCardTemplate: editingPhase9WorkflowSuggestion.template,
                                    starterCardFocusPanel: editingPhase9WorkflowSuggestion.focusPanel,
                                    cardCreationNote: editingTag.meta?.cardCreationNote || editingPhase9WorkflowSuggestion.note || '',
                                  })}
                                  className={`${retro.button} px-3 py-1.5 text-[10px]`}
                                  style={{ color: '#A0B4FF', border: '1px solid #A0B4FF33' }}
                                >
                                  Apply Suggested Workflow
                                </button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                <div>
                                  <div className="text-[10px] mb-1" style={{ color: '#A0B4FF', fontWeight: 600 }}>Starter Template</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {CARD_TEMPLATE_HINT_OPTIONS.map((option) => (
                                      <button
                                        key={option.id}
                                        onClick={() => updateEditingTagMeta({ starterCardTemplate: editingTag.meta?.starterCardTemplate === option.id ? undefined : option.id })}
                                        className={`${retro.button} px-2 py-1 text-[10px]`}
                                        style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: editingTag.meta?.starterCardTemplate === option.id ? `${option.accent}18` : undefined }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] mb-1" style={{ color: '#6ABAFF', fontWeight: 600 }}>Starter Panel</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {CARD_FOCUS_HINT_OPTIONS.map((option) => (
                                      <button
                                        key={option.id}
                                        onClick={() => updateEditingTagMeta({ starterCardFocusPanel: editingTag.meta?.starterCardFocusPanel === option.id ? undefined : option.id })}
                                        className={`${retro.button} px-2 py-1 text-[10px]`}
                                        style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: editingTag.meta?.starterCardFocusPanel === option.id ? `${option.accent}18` : undefined }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {tagSubPage === 'cards' && (
                            <div className="mb-3">
                              <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 10 NEW-CARD INTAKE PROFILE</div>
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                                <div className="text-[10px]" style={S_MUTED}>
                                  Readiness: {editingPhase10StarterProfile.readiness} • Template: {editingPhase10StarterProfile.template || 'none'} • Panel: {editingPhase10StarterProfile.focusPanel || 'none'}
                                </div>
                                <button
                                  onClick={() => updateEditingTagMeta({
                                    recommendedCardFamilies: editingPhase10StarterProfile.families,
                                    recommendedCardPurposes: editingPhase10StarterProfile.purposes,
                                    starterCardTargeting: editingPhase10StarterProfile.targeting,
                                    starterCardCostModel: editingPhase10StarterProfile.costModel,
                                    starterCardTemplate: editingPhase10StarterProfile.template,
                                    starterCardFocusPanel: editingPhase10StarterProfile.focusPanel,
                                    cardCreationNote: editingTag.meta?.cardCreationNote || editingPhase10StarterProfile.note || '',
                                  })}
                                  className={`${retro.button} px-3 py-1.5 text-[10px]`}
                                  style={{ color: '#9FE3B1', border: '1px solid #9FE3B133' }}
                                >
                                  Apply Full Intake Profile
                                </button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-[10px]">
                                <div className={`${retro.sunken} bg-[#0A0A22] p-3`}>
                                  <div style={S_SECTION_HDR}>Families / Purposes</div>
                                  <div className="mt-1" style={S_MUTED}>{editingPhase10StarterProfile.families.join(', ') || 'none'} • {editingPhase10StarterProfile.purposes.join(', ') || 'none'}</div>
                                </div>
                                <div className={`${retro.sunken} bg-[#0A0A22] p-3`}>
                                  <div style={S_SECTION_HDR}>Target / Cost</div>
                                  <div className="mt-1" style={S_MUTED}>{editingPhase10StarterProfile.targeting || 'none'} • {editingPhase10StarterProfile.costModel || 'none'}</div>
                                </div>
                                <div className={`${retro.sunken} bg-[#0A0A22] p-3`}>
                                  <div style={S_SECTION_HDR}>Workflow</div>
                                  <div className="mt-1" style={S_MUTED}>{editingPhase10StarterProfile.template || 'none'} template • {editingPhase10StarterProfile.focusPanel || 'none'} panel</div>
                                </div>
                              </div>
                              {editingPhase10StarterProfile.note ? <div className="mt-3 text-[10px]" style={S_DIM}>{editingPhase10StarterProfile.note}</div> : null}
                            </div>
                          )}

                          {tagSubPage === 'cards' && (
                            <div className="mb-3">
                              <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 11 PLAYER-FACING PRESENTATION PROFILE</div>
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                                <div className="text-[10px]" style={S_MUTED}>
                                  Visibility: {editingPhase11PresentationProfile.visibility} • Group: {editingPhase11PresentationProfile.filterGroup || 'none'} • Badge: {editingPhase11PresentationProfile.badgeLabel || 'none'} • Sort: {editingPhase11PresentationProfile.sortOrder}
                                </div>
                                <button
                                  onClick={() => updateEditingTagMeta({
                                    playerFacingVisibility: editingPhase11PresentationProfile.visibility,
                                    playerFacingBadgeLabel: editingPhase11PresentationProfile.badgeLabel,
                                    playerFacingFilterGroup: editingPhase11PresentationProfile.filterGroup,
                                    playerFacingSortOrder: editingPhase11PresentationProfile.sortOrder,
                                  })}
                                  className={`${retro.button} px-3 py-1.5 text-[10px]`}
                                  style={{ color: '#8AD4FF', border: '1px solid #8AD4FF33' }}
                                >
                                  Apply Presentation Profile
                                </button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
                                <div>
                                  <div className="text-[10px] mb-1" style={{ color: '#8AD4FF', fontWeight: 600 }}>Player Visibility</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {CARD_PRESENTATION_VISIBILITY_OPTIONS.map((option) => (
                                      <button
                                        key={option.id}
                                        onClick={() => updateEditingTagMeta({ playerFacingVisibility: editingTag.meta?.playerFacingVisibility === option.id ? undefined : option.id })}
                                        className={`${retro.button} px-2 py-1 text-[10px]`}
                                        style={{ color: option.accent, border: `1px solid ${option.accent}33`, background: editingTag.meta?.playerFacingVisibility === option.id ? `${option.accent}18` : undefined }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] block mb-1" style={labelStyle}>Badge Label</label>
                                  <input type="text" value={editingTag.meta?.playerFacingBadgeLabel || ''} onChange={(e) => updateEditingTagMeta({ playerFacingBadgeLabel: e.target.value })} placeholder="Defaults to tag name" className={inputClass} style={inputStyle} />
                                </div>
                                <div>
                                  <label className="text-[10px] block mb-1" style={labelStyle}>Filter Group</label>
                                  <input type="text" value={editingTag.meta?.playerFacingFilterGroup || ''} onChange={(e) => updateEditingTagMeta({ playerFacingFilterGroup: e.target.value })} placeholder="Attack, Heal, Support..." className={inputClass} style={inputStyle} />
                                </div>
                                <div>
                                  <label className="text-[10px] block mb-1" style={labelStyle}>Sort Priority</label>
                                  <input type="number" value={editingTag.meta?.playerFacingSortOrder ?? ''} onChange={(e) => updateEditingTagMeta({ playerFacingSortOrder: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="10" className={inputClass} style={inputStyle} />
                                </div>
                              </div>
                              <div className="text-[10px]" style={S_DIM}>
                                Readiness: {editingPhase11PresentationProfile.readiness} • {editingPhase11PresentationProfile.note}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] block mb-1" style={labelStyle}>Replacement Tag</label>
                              <select
                                value={editingTag.meta?.replacementTagId || ''}
                                onChange={(e) => {
                                  const replacement = activeTags.find((tag) => tag.id === e.target.value);
                                  updateEditingTagMeta({
                                    replacementTagId: replacement?.id || '',
                                    replacementTagName: replacement?.name || '',
                                  });
                                }}
                                className={inputClass}
                                style={inputStyle}
                              >
                                <option value="">No replacement link</option>
                                {activeTags.filter((tag) => tag.id !== editingTag.id && !tag.meta?.isDeprecated).map((tag) => (
                                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <div className="text-[10px] mb-1" style={labelStyle}>Rename History</div>
                              <div className="min-h-[40px] px-3 py-2 text-[10px]" style={{ ...inputStyle, border: '1px solid #1A1A4B', background: '#0A0A20' }}>
                                {(editingTag.meta?.renameHistory || []).length > 0 ? editingTag.meta?.renameHistory?.join(', ') : 'No tracked prior names yet.'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {editingWarnings.length > 0 && (
                        <div className={`${retro.raised} bg-[#2A160E] p-3 mb-4`} style={{ border: "1px solid #5A2A1A" }}>
                          <div className="text-[10px] mb-1" style={{ color: "#FFB454", fontWeight: 600 }}>Phase 1 warning</div>
                          <div className="space-y-1 text-[10px]" style={{ color: "#FFD7A0" }}>
                            {editingWarnings.map((warning) => (
                              <div key={warning}>• {warning}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className={`${retro.raised} bg-[#0A0A28] p-3 mb-4`} style={{ border: "1px solid #1A1A4B" }}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-[10px]" style={S_SECTION_HDR}>LEGACY ADVANCED FIELDS</div>
                            <div className="text-[10px] mt-1" style={S_MUTED}>
                              Only use this when you intentionally need the old tag-driven extra-field behavior for compatibility.
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowLegacyFieldsEditor((prev) => !prev)}
                              className={`${retro.button} px-3 py-1.5 text-[10px]`}
                              style={{ color: "#C4A0FF", border: "1px solid #C4A0FF33" }}
                            >
                              {showLegacyFieldsEditor ? "Hide Legacy Fields" : "Show Legacy Fields"}
                            </button>
                            <button
                              onClick={addFieldToEditingTag}
                              disabled={!legacyIntentConfirmed}
                              className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1`}
                              style={{ color: legacyIntentConfirmed ? "#4A9A5A" : "#5A6A7A", border: "1px solid #2A2A5B", opacity: legacyIntentConfirmed ? 1 : 0.65 }}
                            >
                              <Plus size={10} /> Add Field
                            </button>
                          </div>
                        </div>

                        <label className="flex items-start gap-2 mt-3 text-[10px]" style={S_MUTED}>
                          <input
                            type="checkbox"
                            checked={legacyIntentConfirmed}
                            onChange={(e) => setLegacyIntentConfirmed(e.target.checked)}
                          />
                          <span>
                            I intentionally want this tag to keep or gain legacy field-driven behavior for compatibility. Otherwise, this tag should stay descriptor-only.
                          </span>
                        </label>

                        {showLegacyFieldsEditor && (
                          <div className="mt-4">
                            {editingTag.fields.length === 0 ? (
                              <div className="text-[11px] text-center py-3" style={S_MUTED}>
                                No legacy fields defined. Leaving this empty keeps the tag descriptor-only.
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {editingTag.fields.map((field, fieldIdx) => (
                                  <TagFieldEditorRow
                                    key={field.id}
                                    field={field}
                                    inputStyle={inputStyle}
                                    onUpdateName={updateEditingTagFieldName}
                                    onUpdateProp={updateEditingTagFieldProp}
                                    onRemove={removeFieldFromEditingTag}
                                    onMoveUp={moveFieldUp}
                                    onMoveDown={moveFieldDown}
                                    isFirst={fieldIdx === 0}
                                    isLast={fieldIdx === editingTag.fields.length - 1}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => { void handleSaveTag(); }} className={`${retro.button} px-5 py-1.5 text-[11px] flex items-center gap-1`} style={S_GREEN_BTN}>
                          <Save size={12} /> Save Tag
                        </button>
                        <button onClick={handleCancelTagEdit} className={`${retro.button} px-5 py-1.5 text-[11px]`} style={S_TEXT}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div className="text-[12px]" style={S_SECTION_HDR}>PHASE 5 HEALTH & MAINTENANCE</div>
            <div className="text-[10px] mt-1" style={S_MUTED}>
              This phase focuses on cleanup tools inside the tag library: duplicate review, safe merge guidance, metadata repair, and deprecation management. True cross-system usage scanning is not wired here yet.
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {([
              { id: 'all', label: 'All Issues' },
              { id: 'duplicates', label: `Duplicate Review (${phase5DuplicatePairs.length})` },
              { id: 'metadata', label: `Metadata Gaps (${phase5MetadataIssues.length})` },
              { id: 'deprecated', label: `Deprecated (${phase5DeprecatedTags.length})` },
            ] as const).map((filter) => (
              <button
                key={filter.id}
                onClick={() => setPhase5MaintenanceFilter(filter.id)}
                className={`${phase5MaintenanceFilter === filter.id ? `${retro.sunken} bg-[#0A0A30]` : `${retro.raised} bg-[#141446] hover:bg-[#1A1A56]`} px-2.5 py-1.5 text-[10px]`}
                style={{ color: phase5MaintenanceFilter === filter.id ? '#4A7BFF' : '#8A9ABB' }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-4 text-[10px]">
          <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
            <div style={S_SECTION_HDR}>Near-Duplicate Pairs</div>
            <div className="mt-1" style={S_TEXT}>{phase5DuplicatePairs.length}</div>
          </div>
          <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
            <div style={S_SECTION_HDR}>Metadata Gaps</div>
            <div className="mt-1" style={S_TEXT}>{phase5MetadataIssues.length}</div>
          </div>
          <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
            <div style={S_SECTION_HDR}>Alias Conflicts</div>
            <div className="mt-1" style={S_TEXT}>{phase5AliasConflicts.length}</div>
          </div>
          <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
            <div style={S_SECTION_HDR}>Deprecated Tags</div>
            <div className="mt-1" style={S_TEXT}>{phase5DeprecatedTags.length}</div>
          </div>
        </div>

        {(phase5MaintenanceFilter === 'all' || phase5MaintenanceFilter === 'duplicates') && (
          <div className="mb-4">
            <div className="text-[10px] mb-2" style={S_SECTION_HDR}>DUPLICATE REVIEW</div>
            {phase5DuplicatePairs.length === 0 ? (
              <div className="text-[10px]" style={S_MUTED}>No high-confidence duplicate pairs were found in this tag category.</div>
            ) : (
              <div className="space-y-2">
                {phase5DuplicatePairs.map((pair) => (
                  <div key={`${pair.sourceId}-${pair.targetId}`} className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[11px]" style={S_TEXT}>
                          <span style={{ color: '#FFD7A0' }}>{pair.sourceName}</span> → <span style={{ color: '#8AD4FF' }}>{pair.targetName}</span>
                        </div>
                        <div className="text-[10px] mt-1" style={S_MUTED}>{pair.reason}</div>
                      </div>
                      <button
                        onClick={() => { void handlePhase5QuickMerge(pair.sourceId, pair.targetId); }}
                        className={`${retro.button} px-3 py-1.5 text-[10px]`}
                        style={S_GREEN_BTN}
                      >
                        Merge by Alias + Deprecate Source
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(phase5MaintenanceFilter === 'all' || phase5MaintenanceFilter === 'metadata') && (
          <div className="mb-4">
            <div className="text-[10px] mb-2" style={S_SECTION_HDR}>METADATA REPAIR</div>
            {phase5MetadataIssues.length === 0 ? (
              <div className="text-[10px]" style={S_MUTED}>No metadata repair suggestions right now.</div>
            ) : (
              <div className="space-y-2">
                {phase5MetadataIssues.map((issue) => (
                  <div key={issue.id} className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[11px]" style={S_TEXT}>{issue.name}</div>
                        <div className="text-[10px] mt-1" style={S_MUTED}>{issue.issues.join(' • ')}</div>
                      </div>
                      <button
                        onClick={() => { void handlePhase5RepairMetadata(issue.id); }}
                        className={`${retro.button} px-3 py-1.5 text-[10px]`}
                        style={{ color: '#8AD4FF', border: '1px solid #8AD4FF33' }}
                      >
                        Apply Repair
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {phase5AliasConflicts.length > 0 && phase5MaintenanceFilter !== 'deprecated' && (
          <div className="mb-4">
            <div className="text-[10px] mb-2" style={S_SECTION_HDR}>ALIAS CONFLICTS</div>
            <div className="space-y-1 text-[10px]" style={S_MUTED}>
              {phase5AliasConflicts.map((conflict) => (
                <div key={`${conflict.id}-${conflict.alias}`}>• {conflict.name} uses alias <span style={{ color: '#FFD7A0' }}>{conflict.alias}</span>, which matches the tag name <span style={{ color: '#8AD4FF' }}>{conflict.conflictWith}</span>.</div>
              ))}
            </div>
          </div>
        )}

        {(phase5MaintenanceFilter === 'all' || phase5MaintenanceFilter === 'deprecated') && (
          <div>
            <div className="text-[10px] mb-2" style={S_SECTION_HDR}>DEPRECATION REVIEW</div>
            {phase5DeprecatedTags.length === 0 ? (
              <div className="text-[10px]" style={S_MUTED}>No deprecated tags in this category right now.</div>
            ) : (
              <div className="space-y-2">
                {phase5DeprecatedTags.map((tag) => (
                  <div key={tag.id} className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[11px]" style={S_TEXT}>{tag.name}</div>
                        <div className="text-[10px] mt-1" style={S_MUTED}>{tag.meta?.usageNotes || 'Deprecated tag with no extra note.'}</div>
                      </div>
                      <button
                        onClick={() => { void handlePhase5ToggleDeprecated(tag.id, false); }}
                        className={`${retro.button} px-3 py-1.5 text-[10px]`}
                        style={{ color: '#4ACA6A', border: '1px solid #4ACA6A33' }}
                      >
                        Reactivate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div className="text-[12px]" style={S_SECTION_HDR}>PHASE 7 BRIDGE PREP</div>
            <div className="text-[10px] mt-1" style={S_MUTED}>
              This phase prepares tags for the structured card model and future coordinated cleanup by storing card recommendation hints, rename history, and replacement links instead of tag-driven behavior.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4 text-[10px]">
          <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
            <div style={S_SECTION_HDR}>Card Bridge Guided</div>
            <div className="mt-1" style={S_TEXT}>{tagSubPage === 'cards' ? activeTags.filter((tag) => (tag.meta?.recommendedCardFamilies?.length || 0) > 0 || (tag.meta?.recommendedCardPurposes?.length || 0) > 0).length : 0}</div>
          </div>
          <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
            <div style={S_SECTION_HDR}>Missing Card Hints</div>
            <div className="mt-1" style={S_TEXT}>{phase7CardBridgeGaps.length}</div>
          </div>
          <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
            <div style={S_SECTION_HDR}>Deprecated Without Replacement</div>
            <div className="mt-1" style={S_TEXT}>{phase7DeprecatedWithoutReplacement.length}</div>
          </div>
          <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
            <div style={S_SECTION_HDR}>Rename-Tracked Tags</div>
            <div className="mt-1" style={S_TEXT}>{phase7RenameTrackedTags.length}</div>
          </div>
          <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
            <div style={S_SECTION_HDR}>Creation Presets</div>
            <div className="mt-1" style={S_TEXT}>{phase8PresetReadyTags.length}</div>
          </div>
          <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
            <div style={S_SECTION_HDR}>Workflow Ready</div>
            <div className="mt-1" style={S_TEXT}>{phase9WorkflowReadyTags.length}</div>
          </div>
        </div>

        {tagSubPage === 'cards' && (
          <div className="mb-4">
            <div className="text-[10px] mb-2" style={S_SECTION_HDR}>CARD BRIDGE HINTS</div>
            {phase7CardBridgeGaps.length === 0 ? (
              <div className="text-[10px]" style={S_MUTED}>No missing card-bridge recommendations detected for current card tags.</div>
            ) : (
              <div className="space-y-2">
                {phase7CardBridgeGaps.map((entry) => (
                  <div key={entry.id} className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[11px]" style={S_TEXT}>{entry.name}</div>
                        <div className="text-[10px] mt-1" style={S_MUTED}>
                          Suggested families: {entry.families.length > 0 ? entry.families.join(', ') : 'none'} • Suggested purposes: {entry.purposes.length > 0 ? entry.purposes.join(', ') : 'none'}
                        </div>
                      </div>
                      <button
                        onClick={() => { void handlePhase7ApplyBridgeHints(entry.id); }}
                        className={`${retro.button} px-3 py-1.5 text-[10px]`}
                        style={{ color: '#8AD4FF', border: '1px solid #8AD4FF33' }}
                      >
                        Apply Suggested Hints
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tagSubPage === 'cards' && (
          <div className="mb-4">
            <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 8 CARD-CREATION PRESETS</div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-3 text-[10px]">
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                <div style={S_SECTION_HDR}>Preset Ready</div>
                <div className="mt-1" style={S_TEXT}>{phase8PresetReadyTags.length}</div>
              </div>
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                <div style={S_SECTION_HDR}>Missing Presets</div>
                <div className="mt-1" style={S_TEXT}>{phase8CardCreationPresetGaps.length}</div>
              </div>
            </div>
            {phase8CardCreationPresetGaps.length === 0 ? (
              <div className="text-[10px]" style={S_MUTED}>No missing creation presets detected for current card tags.</div>
            ) : (
              <div className="space-y-2">
                {phase8CardCreationPresetGaps.map((entry) => (
                  <div key={entry.id} className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[11px]" style={S_TEXT}>{entry.name}</div>
                        <div className="text-[10px] mt-1" style={S_MUTED}>
                          Suggested targeting: {entry.targeting || 'none'} • Suggested cost: {entry.costModel || 'none'}{entry.note ? ` • ${entry.note}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => { void handlePhase8ApplyPreset(entry.id); }}
                        className={`${retro.button} px-3 py-1.5 text-[10px]`}
                        style={{ color: '#FFD7A0', border: '1px solid #FFD7A033' }}
                      >
                        Apply Suggested Preset
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tagSubPage === 'cards' && (
          <div className="mb-4">
            <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 9 WORKFLOW HANDOFF</div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-3 text-[10px]">
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                <div style={S_SECTION_HDR}>Workflow Ready</div>
                <div className="mt-1" style={S_TEXT}>{phase9WorkflowReadyTags.length}</div>
              </div>
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                <div style={S_SECTION_HDR}>Missing Workflow</div>
                <div className="mt-1" style={S_TEXT}>{phase9WorkflowGaps.length}</div>
              </div>
            </div>
            {phase9WorkflowGaps.length === 0 ? (
              <div className="text-[10px]" style={S_MUTED}>No missing workflow handoff presets detected for current card tags.</div>
            ) : (
              <div className="space-y-2">
                {phase9WorkflowGaps.map((entry) => (
                  <div key={entry.id} className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[11px]" style={S_TEXT}>{entry.name}</div>
                        <div className="text-[10px] mt-1" style={S_MUTED}>
                          Suggested template: {entry.template} • Suggested panel: {entry.focusPanel}{entry.note ? ` • ${entry.note}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => { void handlePhase9ApplyWorkflow(entry.id); }}
                        className={`${retro.button} px-3 py-1.5 text-[10px]`}
                        style={{ color: '#A0B4FF', border: '1px solid #A0B4FF33' }}
                      >
                        Apply Workflow
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tagSubPage === 'cards' && (
          <div className="mb-4">
            <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 10 NEW-CARD INTAKE READINESS</div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-3 text-[10px]">
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                <div style={S_SECTION_HDR}>Intake Ready</div>
                <div className="mt-1" style={S_TEXT}>{phase10StarterReadyTags.length}</div>
              </div>
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                <div style={S_SECTION_HDR}>Needs Intake Pass</div>
                <div className="mt-1" style={S_TEXT}>{phase10StarterGaps.length}</div>
              </div>
            </div>
            {phase10StarterGaps.length === 0 ? (
              <div className="text-[10px]" style={S_MUTED}>All active card tags in this category have a full intake profile ready for future new-card creation.</div>
            ) : (
              <div className="space-y-2">
                {phase10StarterGaps.map((entry) => (
                  <div key={entry.id} className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[11px]" style={S_TEXT}>{entry.name}</div>
                        <div className="text-[10px] mt-1" style={S_MUTED}>
                          {entry.profile.template || 'blank'} template • {entry.profile.focusPanel || 'core'} panel • {entry.profile.targeting || 'no target'} • {entry.profile.costModel || 'no cost'} • readiness: {entry.profile.readiness}
                        </div>
                        {entry.profile.note ? <div className="text-[10px] mt-1" style={S_DIM}>{entry.profile.note}</div> : null}
                      </div>
                      <button
                        onClick={() => { void handlePhase10ApplyStarterProfile(entry.id); }}
                        className={`${retro.button} px-3 py-1.5 text-[10px]`}
                        style={{ color: '#9FE3B1', border: '1px solid #9FE3B133' }}
                      >
                        Apply Intake Profile
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tagSubPage === 'cards' && (
          <div className="mb-4">
            <div className="text-[10px] mb-2" style={S_SECTION_HDR}>PHASE 11 PLAYER-FACING READINESS</div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-3 text-[10px]">
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                <div style={S_SECTION_HDR}>Presentation Ready</div>
                <div className="mt-1" style={S_TEXT}>{phase11PresentationReadyTags.length}</div>
              </div>
              <div className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                <div style={S_SECTION_HDR}>Needs Presentation Pass</div>
                <div className="mt-1" style={S_TEXT}>{phase11PresentationGaps.length}</div>
              </div>
            </div>
            {phase11PresentationGaps.length === 0 ? (
              <div className="text-[10px]" style={S_MUTED}>All active card tags in this category have an explicit player-facing presentation profile.</div>
            ) : (
              <div className="space-y-2">
                {phase11PresentationGaps.map((entry) => (
                  <div key={entry.id} className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[11px]" style={S_TEXT}>{entry.name}</div>
                        <div className="text-[10px] mt-1" style={S_MUTED}>
                          {entry.profile.badgeLabel} • {entry.profile.filterGroup} • {entry.profile.visibility} • sort {entry.profile.sortOrder} • readiness: {entry.profile.readiness}
                        </div>
                        <div className="text-[10px] mt-1" style={S_DIM}>{entry.profile.note}</div>
                      </div>
                      <button
                        onClick={() => { void handlePhase11ApplyPresentationProfile(entry.id); }}
                        className={`${retro.button} px-3 py-1.5 text-[10px]`}
                        style={{ color: '#8AD4FF', border: '1px solid #8AD4FF33' }}
                      >
                        Apply Presentation Profile
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-4">
          <div className="text-[10px] mb-2" style={S_SECTION_HDR}>REPLACEMENT LINK REVIEW</div>
          {phase7DeprecatedWithoutReplacement.length === 0 ? (
            <div className="text-[10px]" style={S_MUTED}>Every deprecated tag in this category already has a replacement link or there are no deprecated tags.</div>
          ) : (
            <div className="space-y-2">
              {phase7DeprecatedWithoutReplacement.map((tag) => {
                const replacementCandidates = getNearDuplicateTags(activeTags.filter((entry) => entry.id !== tag.id && !entry.meta?.isDeprecated), tag.name)
                  .map((match) => activeTags.find((entry) => entry.id === match.id))
                  .filter(Boolean)
                  .slice(0, 3) as RichTagDefinition[];
                return (
                  <div key={tag.id} className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[11px]" style={S_TEXT}>{tag.name}</div>
                        <div className="text-[10px] mt-1" style={S_MUTED}>Deprecated tag without a replacement link.</div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {replacementCandidates.length > 0 ? replacementCandidates.map((candidate) => (
                          <button
                            key={candidate.id}
                            onClick={() => { void handlePhase7LinkReplacement(tag.id, candidate.id); }}
                            className={`${retro.button} px-2 py-1 text-[10px]`}
                            style={{ color: '#4ACA6A', border: '1px solid #4ACA6A33' }}
                          >
                            Link to {candidate.name}
                          </button>
                        )) : <span className="text-[10px]" style={S_MUTED}>No close replacement candidates yet.</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="text-[10px] mb-2" style={S_SECTION_HDR}>RENAME HISTORY SNAPSHOT</div>
          {phase7RenameTrackedTags.length === 0 ? (
            <div className="text-[10px]" style={S_MUTED}>No tracked tag renames yet in this category.</div>
          ) : (
            <div className="space-y-2">
              {phase7RenameTrackedTags.map((tag) => (
                <div key={tag.id} className={`${retro.raised} bg-[#0A0A28] p-3`} style={{ border: '1px solid #1A1A4B' }}>
                  <div className="text-[11px]" style={S_TEXT}>{tag.name}</div>
                  <div className="text-[10px] mt-1" style={S_MUTED}>Previous names: {tag.meta?.renameHistory?.join(', ')}</div>
                  {tag.meta?.replacementTagName ? <div className="text-[10px] mt-1" style={S_DIM}>Replacement link: {tag.meta.replacementTagName}</div> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
