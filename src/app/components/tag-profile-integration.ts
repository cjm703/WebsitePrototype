import type { ManagedCard, TagDefinition } from "./types";

export type CardFamilyHint = "spell" | "skill" | "ability";
export type CardPurposeHint = "attack" | "heal" | "support" | "utility" | "control" | "reaction" | "passive";
export type CardTargetHint = "self" | "ally" | "enemy" | "area";
export type CardCostHint = "source" | "exhaustion" | "uses-rest" | "passive";
export type CardTemplateHint = "blank" | "attack" | "heal" | "buff" | "debuff" | "reaction" | "passive" | "utility";
export type CardEditorFocusHint = "preview" | "core" | "mechanics" | "tags" | "progression" | "assignment";
export type CardPresentationVisibility = "show" | "dm-only" | "hidden";

export type RichTagMeta = {
  roleHint?: "descriptor" | "identifier" | "targeting";
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

export type RichTagDefinition = TagDefinition & { meta?: RichTagMeta };

export type CardStarterProfile = {
  families: CardFamilyHint[];
  purposes: CardPurposeHint[];
  targeting?: CardTargetHint;
  costModel?: CardCostHint;
  template: CardTemplateHint;
  focusPanel: CardEditorFocusHint;
  note: string;
  readiness: "ready" | "partial" | "minimal";
};

export type CardPresentationProfile = {
  visibility: CardPresentationVisibility;
  badgeLabel: string;
  filterGroup: string;
  sortOrder: number;
  note: string;
  readiness: "ready" | "partial" | "minimal";
};

export type CardTagBadge = {
  tagName: string;
  label: string;
  filterGroup: string;
  visibility: CardPresentationVisibility;
  sortOrder: number;
};

const CARD_FAMILY_KEY = "Card Family";
const USE_PROFILE_COST_MODEL_KEY = "Use Profile::Cost Model";
const USE_PROFILE_PRIMARY_COST_KEY = "Use Profile::Primary Cost";
const USE_PROFILE_RANGE_KEY = "Use Profile::Range";
const USE_PROFILE_DURATION_KEY = "Use Profile::Duration";

function normalizeTagName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeTagName(String(entry))).filter(Boolean);
}

function sanitizeSortOrder(value: unknown): number | undefined {
  if (value === "" || value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toRichTag(tag: TagDefinition): RichTagDefinition {
  const raw = tag as RichTagDefinition;
  const meta = raw && typeof raw === "object" && raw.meta && typeof raw.meta === "object"
    ? raw.meta
    : undefined;

  return {
    ...raw,
    name: normalizeTagName(raw.name || ""),
    description: typeof raw.description === "string" ? raw.description.trim() : "",
    fields: Array.isArray(raw.fields) ? raw.fields : [],
    meta: meta ? {
      ...meta,
      collection: normalizeTagName(meta.collection || ""),
      group: normalizeTagName(meta.group || ""),
      color: typeof meta.color === "string" ? meta.color.trim() : "",
      aliases: normalizeStringArray(meta.aliases),
      usageNotes: typeof meta.usageNotes === "string" ? meta.usageNotes.trim() : "",
      replacementTagId: normalizeTagName(meta.replacementTagId || ""),
      replacementTagName: normalizeTagName(meta.replacementTagName || ""),
      renameHistory: normalizeStringArray(meta.renameHistory),
      recommendedCardFamilies: normalizeStringArray(meta.recommendedCardFamilies) as CardFamilyHint[],
      recommendedCardPurposes: normalizeStringArray(meta.recommendedCardPurposes) as CardPurposeHint[],
      starterCardTargeting: (["self", "ally", "enemy", "area"] as const).includes(meta.starterCardTargeting as CardTargetHint)
        ? meta.starterCardTargeting
        : undefined,
      starterCardCostModel: (["source", "exhaustion", "uses-rest", "passive"] as const).includes(meta.starterCardCostModel as CardCostHint)
        ? meta.starterCardCostModel
        : undefined,
      cardCreationNote: typeof meta.cardCreationNote === "string" ? meta.cardCreationNote.trim() : "",
      starterCardTemplate: (["blank", "attack", "heal", "buff", "debuff", "reaction", "passive", "utility"] as const).includes(meta.starterCardTemplate as CardTemplateHint)
        ? meta.starterCardTemplate
        : undefined,
      starterCardFocusPanel: (["preview", "core", "mechanics", "tags", "progression", "assignment"] as const).includes(meta.starterCardFocusPanel as CardEditorFocusHint)
        ? meta.starterCardFocusPanel
        : undefined,
      playerFacingVisibility: (["show", "dm-only", "hidden"] as const).includes(meta.playerFacingVisibility as CardPresentationVisibility)
        ? meta.playerFacingVisibility
        : undefined,
      playerFacingBadgeLabel: normalizeTagName(meta.playerFacingBadgeLabel || ""),
      playerFacingFilterGroup: normalizeTagName(meta.playerFacingFilterGroup || ""),
      playerFacingSortOrder: sanitizeSortOrder(meta.playerFacingSortOrder),
    } : undefined,
  };
}

function inferFamiliesAndPurposes(tag: RichTagDefinition) {
  const textValue = `${tag.name} ${tag.description} ${tag.meta?.collection || ""} ${tag.meta?.group || ""}`.toLowerCase();
  const families = new Set<CardFamilyHint>(tag.meta?.recommendedCardFamilies || []);
  const purposes = new Set<CardPurposeHint>(tag.meta?.recommendedCardPurposes || []);

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

  return { families: [...families], purposes: [...purposes] };
}

function inferTemplateFromProfile(profile: Pick<CardStarterProfile, "purposes" | "costModel">): CardTemplateHint {
  if (profile.purposes.includes("passive")) return "passive";
  if (profile.purposes.includes("reaction")) return "reaction";
  if (profile.purposes.includes("heal")) return "heal";
  if (profile.purposes.includes("control")) return "debuff";
  if (profile.purposes.includes("support")) return "buff";
  if (profile.purposes.includes("utility")) return "utility";
  if (profile.purposes.includes("attack")) return "attack";
  if (profile.costModel === "passive") return "passive";
  return "blank";
}

function inferFocusPanelFromProfile(profile: Pick<CardStarterProfile, "template" | "targeting" | "costModel">): CardEditorFocusHint {
  if (profile.template === "buff" || profile.template === "debuff") return "tags";
  if (profile.template === "attack" || profile.template === "heal" || profile.template === "reaction" || profile.template === "utility" || profile.template === "passive") {
    return "mechanics";
  }
  if (profile.targeting || profile.costModel) return "mechanics";
  return "core";
}

export function buildStarterProfileFromTags(tagNames: string[], tagList: TagDefinition[]): CardStarterProfile {
  const selected = tagNames
    .map((name) => tagList.find((tag) => tag.name === name))
    .filter(Boolean)
    .map((tag) => toRichTag(tag as TagDefinition));

  const families = new Set<CardFamilyHint>();
  const purposes = new Set<CardPurposeHint>();
  let targeting: CardTargetHint | undefined;
  let costModel: CardCostHint | undefined;
  let template: CardTemplateHint | undefined;
  let focusPanel: CardEditorFocusHint | undefined;
  const noteParts: string[] = [];

  selected.forEach((tag) => {
    const inferred = inferFamiliesAndPurposes(tag);
    inferred.families.forEach((value) => families.add(value));
    inferred.purposes.forEach((value) => purposes.add(value));
    if (!targeting && tag.meta?.starterCardTargeting) targeting = tag.meta.starterCardTargeting;
    if (!costModel && tag.meta?.starterCardCostModel) costModel = tag.meta.starterCardCostModel;
    if (!template && tag.meta?.starterCardTemplate) template = tag.meta.starterCardTemplate;
    if (!focusPanel && tag.meta?.starterCardFocusPanel) focusPanel = tag.meta.starterCardFocusPanel;
    if (tag.meta?.cardCreationNote) noteParts.push(tag.meta.cardCreationNote);
  });

  const base: CardStarterProfile = {
    families: [...families],
    purposes: [...purposes],
    targeting,
    costModel,
    template: template || "blank",
    focusPanel: focusPanel || "core",
    note: noteParts.join(" | "),
    readiness: "minimal",
  };

  const completed: CardStarterProfile = {
    ...base,
    template: template || inferTemplateFromProfile(base),
    focusPanel: focusPanel || inferFocusPanelFromProfile(base),
  };

  const filled = [
    completed.families.length > 0,
    completed.purposes.length > 0,
    !!completed.targeting,
    !!completed.costModel,
    !!completed.template,
    !!completed.focusPanel,
  ].filter(Boolean).length;

  return {
    ...completed,
    readiness: filled >= 6 ? "ready" : filled >= 3 ? "partial" : "minimal",
  };
}

export function applyStarterProfileToCard(card: ManagedCard, profile: CardStarterProfile): ManagedCard {
  const next: ManagedCard = {
    ...card,
    customFields: { ...(card.customFields || {}) },
  };

  if (!next.customFields[CARD_FAMILY_KEY] && profile.families[0]) {
    next.customFields[CARD_FAMILY_KEY] = profile.families[0];
  }
  if (!next.customFields[USE_PROFILE_COST_MODEL_KEY] && profile.costModel) {
    next.customFields[USE_PROFILE_COST_MODEL_KEY] = profile.costModel;
  }
  if (!next.customFields[USE_PROFILE_PRIMARY_COST_KEY]) {
    if (profile.costModel === "source") next.customFields[USE_PROFILE_PRIMARY_COST_KEY] = "1 Source";
    if (profile.costModel === "exhaustion") next.customFields[USE_PROFILE_PRIMARY_COST_KEY] = "1 Exhaustion";
    if (profile.costModel === "uses-rest") next.customFields[USE_PROFILE_PRIMARY_COST_KEY] = "1 / Long Rest";
    if (profile.costModel === "passive") next.customFields[USE_PROFILE_PRIMARY_COST_KEY] = "Passive";
  }
  if (!next.customFields[USE_PROFILE_RANGE_KEY] && profile.targeting) {
    next.customFields[USE_PROFILE_RANGE_KEY] =
      profile.targeting === "self" ? "Self" :
      profile.targeting === "ally" ? "Ally in range" :
      profile.targeting === "enemy" ? "Enemy in range" :
      "Area";
  }
  if (!next.customFields[USE_PROFILE_DURATION_KEY] && profile.purposes.includes("passive")) {
    next.customFields[USE_PROFILE_DURATION_KEY] = "Passive";
  }

  return next;
}

export function buildPresentationProfile(tagName: string, tagList: TagDefinition[]): CardPresentationProfile | null {
  const raw = tagList.find((tag) => tag.name === tagName);
  if (!raw) return null;
  const tag = toRichTag(raw);
  const starter = buildStarterProfileFromTags([tagName], tagList);
  const visibility = tag.meta?.playerFacingVisibility || (tag.meta?.isDeprecated ? "hidden" : "show");
  const filterGroup =
    tag.meta?.playerFacingFilterGroup ||
    starter.purposes[0] ||
    starter.families[0] ||
    tag.meta?.group ||
    "Other";
  const badgeLabel = tag.meta?.playerFacingBadgeLabel || tag.name;
  const sortOrder = tag.meta?.playerFacingSortOrder ?? 100;
  const explicit = [
    !!tag.meta?.playerFacingVisibility,
    !!tag.meta?.playerFacingBadgeLabel,
    !!tag.meta?.playerFacingFilterGroup,
    tag.meta?.playerFacingSortOrder != null,
  ].filter(Boolean).length;

  return {
    visibility,
    badgeLabel,
    filterGroup,
    sortOrder,
    note: `Player-facing: ${badgeLabel} • ${filterGroup} • ${visibility} • sort ${sortOrder}`,
    readiness: explicit >= 4 ? "ready" : explicit >= 2 ? "partial" : "minimal",
  };
}

export function buildVisibleCardTagBadges(
  card: ManagedCard,
  tagList: TagDefinition[],
  options?: { includeDmOnly?: boolean }
): CardTagBadge[] {
  const includeDmOnly = !!options?.includeDmOnly;
  return card.tags
    .map((tagName) => {
      const profile = buildPresentationProfile(tagName, tagList);
      if (!profile) return null;
      if (profile.visibility === "hidden") return null;
      if (profile.visibility === "dm-only" && !includeDmOnly) return null;
      return {
        tagName,
        label: profile.badgeLabel,
        filterGroup: profile.filterGroup,
        visibility: profile.visibility,
        sortOrder: profile.sortOrder,
      } satisfies CardTagBadge;
    })
    .filter(Boolean)
    .sort((a, b) => (a!.sortOrder - b!.sortOrder) || a!.label.localeCompare(b!.label)) as CardTagBadge[];
}

export function buildCardTagFilterGroups(cards: ManagedCard[], tagList: TagDefinition[]): string[] {
  const groups = new Set<string>();
  cards.forEach((card) => {
    buildVisibleCardTagBadges(card, tagList).forEach((badge) => groups.add(badge.filterGroup));
  });
  return [...groups].sort();
}

export function cardMatchesTagFilterGroup(card: ManagedCard, tagList: TagDefinition[], group: string) {
  if (!group || group === "all") return true;
  return buildVisibleCardTagBadges(card, tagList).some((badge) => badge.filterGroup === group);
}
