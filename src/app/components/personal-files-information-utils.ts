export const INFO_UNASSIGNED_FILTER = "__unassigned__" as const;

export type InfoSortMode = "custom" | "title" | "category" | "newest" | "oldest";

export type InfoDisplayMode =
  | "digital"
  | "paper"
  | "item:stone_tablet";

export type InfoSection = {
  id?: string;
  title?: string;
  content?: string;
};

export type InfoDisplayData = {
  variant?: string;
  alignment?: "left" | "center";
  futurePaperOverlayMode?: "none" | "pixel_handwriting";

  digitalTextColor?: string;
  digitalGlowIntensity?: "low" | "medium" | "high";
  digitalTypewriter?: boolean;
  digitalBackgroundColor?: string;
  digitalTypewriterSpeed?: number;
  digitalVariant?: "default" | "terminal";

  paperJaggedness?: number;
  paperExtraPages?: number;
  paperEdgeTexture?: number;
  paperTemplate?: "standard" | "letter" | "report" | "aged";
  paperHandwrittenOverlay?: string;
  paperHandwrittenOpacity?: number;

  stoneTextureIntensity?: number;
  stoneTextColor?: string;
  stoneBaseLightness?: number;
  stoneCrackIntensity?: number;
  stoneRuneGlow?: boolean;
  stoneRuneGlowColor?: string;

  visibleBlockCount?: number;
  fadeBlockCount?: number;
  linkedInfoIds?: string[];

  useSections?: boolean;
  sections?: InfoSection[];
};

export type InfoFollowUp = {
  id?: string;
  title?: string;
  content?: string;
  description?: string;
};

export type InfoSubTab = {
  id: string;
  name: string;
  order: number;
  description?: string;
  icon?: string;
  color?: string;
  parentId?: string;
  assignedTo?: string[];
  defaultDisplayMode?: InfoDisplayMode;
  autoAssignToOwners?: boolean;
  phase4Meta?: {
    audienceRule?: string;
    unlockRule?: string;
  };
  isDefault?: boolean;
  sortMode?: InfoSortMode;
  showEmpty?: boolean;
};

export type InfoDocumentLike = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  content?: string;
  realWorldTime?: string;
  inWorldTime?: string;
  lastEditedAt?: string;
  infoSubTab?: string;
  assignedTo?: string[];
  followUps?: InfoFollowUp[];
  displayMode?: InfoDisplayMode;
  displayData?: InfoDisplayData;
  phase4Meta?: {
    visibilityRule?: string;
    unlockRule?: string;
    requiredInfoIds?: string[];
    sourceTag?: string;
  };
};

function isValidInfoSubTabColor(value: string) {
  if (!value.trim()) return true;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function cleanBool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function cleanNumber(value: unknown, fallback: number) {
  return Number.isFinite(value as number) ? Number(value) : fallback;
}

function sanitizeInfoSection(section: Partial<InfoSection> | null | undefined, index: number): InfoSection {
  return {
    id: cleanString(section?.id) || `section-${index}`,
    title: cleanString(section?.title),
    content: typeof section?.content === "string" ? section.content : "",
  };
}

export function sanitizeInfoDisplayData(raw: Partial<InfoDisplayData> | null | undefined): InfoDisplayData {
  const digitalGlowIntensity =
    raw?.digitalGlowIntensity === "low" || raw?.digitalGlowIntensity === "high"
      ? raw.digitalGlowIntensity
      : "medium";

  const paperTemplate =
    raw?.paperTemplate === "letter" ||
    raw?.paperTemplate === "report" ||
    raw?.paperTemplate === "aged"
      ? raw.paperTemplate
      : "standard";

  return {
    variant: cleanString(raw?.variant),
    alignment: raw?.alignment === "center" ? "center" : "left",
    futurePaperOverlayMode: raw?.futurePaperOverlayMode === "none" ? "none" : "pixel_handwriting",

    digitalTextColor: cleanString(raw?.digitalTextColor),
    digitalGlowIntensity,
    digitalTypewriter: cleanBool(raw?.digitalTypewriter, false),
    digitalBackgroundColor: cleanString(raw?.digitalBackgroundColor),
    digitalTypewriterSpeed: cleanNumber(raw?.digitalTypewriterSpeed, 30),
    digitalVariant: raw?.digitalVariant === "terminal" ? "terminal" : "default",

    paperJaggedness: cleanNumber(raw?.paperJaggedness, 10),
    paperExtraPages: cleanNumber(raw?.paperExtraPages, 0),
    paperEdgeTexture: cleanNumber(raw?.paperEdgeTexture, 24),
    paperTemplate,
    paperHandwrittenOverlay: typeof raw?.paperHandwrittenOverlay === "string" ? raw.paperHandwrittenOverlay : "",
    paperHandwrittenOpacity: cleanNumber(raw?.paperHandwrittenOpacity, 0),

    stoneTextureIntensity: cleanNumber(raw?.stoneTextureIntensity, 55),
    stoneTextColor: cleanString(raw?.stoneTextColor),
    stoneBaseLightness: cleanNumber(raw?.stoneBaseLightness, 48),
    stoneCrackIntensity: cleanNumber(raw?.stoneCrackIntensity, 20),
    stoneRuneGlow: cleanBool(raw?.stoneRuneGlow, false),
    stoneRuneGlowColor: cleanString(raw?.stoneRuneGlowColor),

    visibleBlockCount: cleanNumber(raw?.visibleBlockCount, 0),
    fadeBlockCount: cleanNumber(raw?.fadeBlockCount, 0),
    linkedInfoIds: cleanStringArray(raw?.linkedInfoIds),

    useSections: cleanBool(raw?.useSections, false),
    sections: Array.isArray(raw?.sections)
      ? raw.sections.map((section, index) => sanitizeInfoSection(section, index))
      : [],
  };
}

export function sanitizeInfoDocumentRecord<T extends Record<string, any>>(
  raw: T | null | undefined,
  index = 0,
): T & InfoDocumentLike {
  const fallbackId = cleanString(raw?.id) || `info-recovered-${index}`;
  return {
    ...(raw as T),
    id: fallbackId,
    title: cleanString(raw?.title) || `Untitled Information ${index + 1}`,
    description: typeof raw?.description === "string" ? raw.description : "",
    category: cleanString(raw?.category),
    content: typeof raw?.content === "string" ? raw.content : "",
    realWorldTime: cleanString(raw?.realWorldTime),
    inWorldTime: cleanString(raw?.inWorldTime),
    lastEditedAt: cleanString(raw?.lastEditedAt),
    infoSubTab: cleanString(raw?.infoSubTab),
    assignedTo: cleanStringArray(raw?.assignedTo),
    followUps: Array.isArray(raw?.followUps)
      ? raw.followUps.map((followUp, followUpIndex) => ({
          id: cleanString(followUp?.id) || `fu-${fallbackId}-${followUpIndex}`,
          title: cleanString(followUp?.title),
          content: typeof followUp?.content === "string" ? followUp.content : "",
          description: typeof followUp?.description === "string" ? followUp.description : "",
        }))
      : [],
    displayMode:
      raw?.displayMode === "paper" || raw?.displayMode === "item:stone_tablet"
        ? raw.displayMode
        : "digital",
    displayData: sanitizeInfoDisplayData(raw?.displayData),
    phase4Meta:
      raw?.phase4Meta && typeof raw.phase4Meta === "object"
        ? {
            visibilityRule: cleanString(raw.phase4Meta.visibilityRule),
            unlockRule: cleanString(raw.phase4Meta.unlockRule),
            requiredInfoIds: cleanStringArray(raw.phase4Meta.requiredInfoIds),
            sourceTag: cleanString(raw.phase4Meta.sourceTag),
          }
        : undefined,
  };
}

export function sanitizeInfoSubTabRecord(
  raw: Partial<InfoSubTab> | null | undefined,
  index: number,
): InfoSubTab {
  const sortMode = raw?.sortMode;
  return {
    id:
      typeof raw?.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : `ist-recovered-${index}`,
    name:
      typeof raw?.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : `Sub-Tab ${index + 1}`,
    order: Number.isFinite(raw?.order as number) ? Number(raw?.order) : index,
    description: typeof raw?.description === "string" ? raw.description.trim() : "",
    icon: typeof raw?.icon === "string" ? raw.icon.trim() : "",
    color:
      typeof raw?.color === "string" && isValidInfoSubTabColor(raw.color)
        ? raw.color.trim()
        : "",
    parentId: typeof raw?.parentId === "string" ? raw.parentId.trim() : "",
    assignedTo: Array.isArray(raw?.assignedTo)
      ? raw.assignedTo.map((value) => String(value)).filter(Boolean)
      : [],
    defaultDisplayMode:
      raw?.defaultDisplayMode === "paper" || raw?.defaultDisplayMode === "item:stone_tablet"
        ? raw.defaultDisplayMode
        : "digital",
    autoAssignToOwners:
      typeof raw?.autoAssignToOwners === "boolean" ? raw.autoAssignToOwners : true,
    phase4Meta:
      raw?.phase4Meta && typeof raw.phase4Meta === "object"
        ? {
            audienceRule: cleanString(raw.phase4Meta.audienceRule),
            unlockRule: cleanString(raw.phase4Meta.unlockRule),
          }
        : undefined,
    isDefault: !!raw?.isDefault,
    sortMode:
      sortMode === "title" ||
      sortMode === "category" ||
      sortMode === "newest" ||
      sortMode === "oldest"
        ? sortMode
        : "custom",
    showEmpty: !!raw?.showEmpty,
  };
}

export function sanitizeInfoSubTabsForLoad(
  rawTabs: Partial<InfoSubTab>[] | null | undefined,
) {
  const seenIds = new Set<string>();
  const sanitized = (Array.isArray(rawTabs) ? rawTabs : [])
    .map((tab, index) => sanitizeInfoSubTabRecord(tab, index))
    .filter((tab) => {
      if (seenIds.has(tab.id)) return false;
      seenIds.add(tab.id);
      return true;
    });

  const normalized = sanitized
    .sort((a, b) => a.order - b.order)
    .map((tab, index) => ({ ...tab, order: index }));

  let foundDefault = false;
  const withSingleDefault = normalized.map((tab, index) => {
    if (tab.isDefault && !foundDefault) {
      foundDefault = true;
      return { ...tab, order: index, isDefault: true };
    }
    return { ...tab, order: index, isDefault: false };
  });

  if (withSingleDefault.length > 0 && !withSingleDefault.some((tab) => tab.isDefault)) {
    withSingleDefault[0] = { ...withSingleDefault[0], isDefault: true };
  }

  return withSingleDefault;
}

export function normalizeInfosForInfoSubTabs<T extends { infoSubTab?: string }>(
  infos: T[],
  infoSubTabs: InfoSubTab[],
) {
  const validIds = new Set(infoSubTabs.map((tab) => tab.id));
  return infos.map((info) => {
    if (!info.infoSubTab) return info;
    if (validIds.has(info.infoSubTab)) return info;
    return { ...info, infoSubTab: "" };
  });
}

export function sanitizeInfoDocumentsForLoad<T extends Record<string, any>>(
  infos: T[] | null | undefined,
  infoSubTabs: InfoSubTab[],
): Array<T & InfoDocumentLike> {
  const normalized = (Array.isArray(infos) ? infos : []).map((info, index) =>
    sanitizeInfoDocumentRecord(info, index),
  );

  return normalizeInfosForInfoSubTabs(normalized, infoSubTabs).map((info) => {
    const subTab = infoSubTabs.find((tab) => tab.id === info.infoSubTab);
    if (!subTab) return info;
    if (!info.displayMode) {
      return { ...info, displayMode: subTab.defaultDisplayMode || "digital" };
    }
    return info;
  });
}

export function normalizeInfoDocumentsForSave<T extends Record<string, any>>(
  infos: T[],
  infoSubTabs: InfoSubTab[],
): Array<T & InfoDocumentLike> {
  return sanitizeInfoDocumentsForLoad(infos, infoSubTabs);
}
