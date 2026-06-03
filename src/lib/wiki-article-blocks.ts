import { normalizeWikiPanels } from "@/lib/wiki-panel-layout";

export const WIKI_BLOCK_LAYOUT_VERSION = 3;
export const WIKI_BLOCK_COLUMNS = 48;
export const WIKI_BLOCK_DEFAULT_ROW_SPAN = 8;
export const WIKI_BLOCK_LEGACY_COLUMNS = 12;
export const WIKI_BLOCK_LEGACY_TO_DENSE_COL_SCALE = WIKI_BLOCK_COLUMNS / WIKI_BLOCK_LEGACY_COLUMNS;
export const WIKI_BLOCK_LEGACY_TO_DENSE_ROW_SCALE = 2;

export type WikiCanvasPreset = "standard" | "large" | "referenceWide";
export type WikiArticleChromeField = "title" | "subtitle" | "description";
export type WikiArticleChromeLayouts = Record<WikiArticleChromeField, WikiBlockLayout>;

export interface WikiCanvasSettings {
  frameWidth: number;
  canvasHeight: number;
  minCanvasHeight: number;
  preset: WikiCanvasPreset;
  articleChromeLayouts?: WikiArticleChromeLayouts;
}

export const WIKI_CANVAS_PRESETS: Record<WikiCanvasPreset, WikiCanvasSettings> = {
  standard: { frameWidth: 1480, canvasHeight: 1480, minCanvasHeight: 1320, preset: "standard" },
  large: { frameWidth: 1540, canvasHeight: 1720, minCanvasHeight: 1480, preset: "large" },
  referenceWide: { frameWidth: 1600, canvasHeight: 1840, minCanvasHeight: 1560, preset: "referenceWide" },
};

export const DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS: WikiArticleChromeLayouts = {
  title: { colStart: 1, colSpan: 30, rowStart: 1, rowSpan: 4, minColSpan: 12, minRowSpan: 3 },
  subtitle: { colStart: 1, colSpan: 22, rowStart: 5, rowSpan: 3, minColSpan: 10, minRowSpan: 2 },
  description: { colStart: 1, colSpan: 34, rowStart: 8, rowSpan: 5, minColSpan: 14, minRowSpan: 3 },
};

export type WikiBlockType =
  | "richText"
  | "heading"
  | "image"
  | "calloutPanel"
  | "referenceTable"
  | "keyValueBox"
  | "spoilerBlock"
  | "wikiLinksList"
  | "divider"
  | "spacer";

export type WikiBlockVisibilityMode = "visible" | "spoiler" | "hidden";
export type WikiBlockCropMode = "contain" | "cover";
export type WikiBlockPadding = "tight" | "normal" | "loose";
export type WikiBlockBorderStyle = "solid" | "dashed" | "none";
export type WikiBlockMobileCollapseMode = "stack" | "scrollX" | "compact";
export type WikiImageCaptionPlacement = "below" | "overlay" | "hidden";
export type WikiBlockWidthMode = "fixed" | "fill" | "hug";
export type WikiBlockHeightMode = "fixed" | "hug" | "fill";
export type WikiBlockLayoutGroupMode = "manual" | "stack" | "columns" | "wrap";

export interface WikiBlockLayout {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
  minColSpan?: number;
  minRowSpan?: number;
}

export interface WikiBlockVisibility {
  assignedTo: string[];
  mode: WikiBlockVisibilityMode;
}

export interface WikiBlockAppearance {
  accentColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderStyle?: WikiBlockBorderStyle;
  padding?: WikiBlockPadding;
}

export interface WikiBlockFluidSettings {
  widthMode: WikiBlockWidthMode;
  heightMode: WikiBlockHeightMode;
  keepAspectRatio: boolean;
  mobileBehavior: WikiBlockMobileCollapseMode;
  preferredMobileOrder?: number;
}

export interface WikiKeyValueRow {
  id: string;
  label: string;
  value: string;
}

export interface WikiReferenceTableRow {
  id: string;
  cells: string[];
}

export interface WikiArticleBlock {
  id: string;
  type: WikiBlockType;
  title: string;
  subtitle: string;
  html: string;
  layout: WikiBlockLayout;
  appearance: WikiBlockAppearance;
  visibility: WikiBlockVisibility;
  locked?: boolean;
  style?: string;
  level?: number;
  imageUrl?: string;
  imageAlt?: string;
  imageCaption?: string;
  imageStorageAssetId?: string;
  imageFocalX?: number;
  imageFocalY?: number;
  imageCaptionPlacement?: WikiImageCaptionPlacement;
  cropMode?: WikiBlockCropMode;
  headingLevel?: 1 | 2 | 3 | 4;
  dividerLabel?: string;
  spacerHeight?: number;
  columns?: string[];
  rows?: WikiReferenceTableRow[];
  items?: WikiKeyValueRow[];
  articleIds?: string[];
  mobilePriority?: number;
  mobileCollapseMode?: WikiBlockMobileCollapseMode;
  fluid?: WikiBlockFluidSettings;
  layoutGroupId?: string;
  layoutGroupName?: string;
  layoutGroupMode?: WikiBlockLayoutGroupMode;
}

export interface WikiBlockPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  builtIn: boolean;
  blocks: WikiArticleBlock[];
  previewLabel?: string;
}

export interface WikiArticleRevision<TSnapshot = unknown> {
  id: string;
  pageId: string;
  createdAt: string;
  createdBy: string;
  label: string;
  source: "save" | "manual" | "import" | "restore";
  snapshot: TSnapshot;
}

type LegacyPanelLike = {
  id: string;
  title?: string;
  subtitle?: string;
  content?: string;
  assignedTo?: string[];
  visibilityMode?: "spoiler" | "hidden";
  style?: string;
  placement?: "body" | "sidebar";
  width?: "full" | "half";
  mediaUrl?: string;
  mediaCaption?: string;
  mediaAlt?: string;
};

type LegacyPageLike = {
  body?: string;
  bodyTitle?: string;
  bodySubtitle?: string;
  infobox?: { label: string; value: string }[];
  panels?: LegacyPanelLike[];
  sections?: { id: string; heading: string; body: string }[];
  blocks?: WikiArticleBlock[];
  layoutVersion?: number;
  canvasSettings?: Partial<WikiCanvasSettings>;
};

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const DEFAULT_LAYOUTS: Record<WikiBlockType, Pick<WikiBlockLayout, "colSpan" | "rowSpan" | "minColSpan" | "minRowSpan">> = {
  richText: { colSpan: 48, rowSpan: 14, minColSpan: 12, minRowSpan: 8 },
  heading: { colSpan: 48, rowSpan: 5, minColSpan: 16, minRowSpan: 4 },
  image: { colSpan: 24, rowSpan: 18, minColSpan: 12, minRowSpan: 10 },
  calloutPanel: { colSpan: 24, rowSpan: 16, minColSpan: 12, minRowSpan: 10 },
  referenceTable: { colSpan: 48, rowSpan: 20, minColSpan: 20, minRowSpan: 12 },
  keyValueBox: { colSpan: 16, rowSpan: 14, minColSpan: 12, minRowSpan: 8 },
  spoilerBlock: { colSpan: 24, rowSpan: 16, minColSpan: 12, minRowSpan: 10 },
  wikiLinksList: { colSpan: 16, rowSpan: 14, minColSpan: 12, minRowSpan: 8 },
  divider: { colSpan: 48, rowSpan: 2, minColSpan: 24, minRowSpan: 2 },
  spacer: { colSpan: 48, rowSpan: 4, minColSpan: 24, minRowSpan: 2 },
};

const DEFAULT_FLUID_SETTINGS: Record<WikiBlockType, WikiBlockFluidSettings> = {
  richText: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
  heading: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
  image: { widthMode: "fixed", heightMode: "fixed", keepAspectRatio: true, mobileBehavior: "stack" },
  calloutPanel: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
  referenceTable: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "scrollX" },
  keyValueBox: { widthMode: "fixed", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "compact" },
  spoilerBlock: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
  wikiLinksList: { widthMode: "fixed", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "compact" },
  divider: { widthMode: "fill", heightMode: "fixed", keepAspectRatio: false, mobileBehavior: "stack" },
  spacer: { widthMode: "fill", heightMode: "fixed", keepAspectRatio: false, mobileBehavior: "compact" },
};

function createPresetBlock(
  type: WikiBlockType,
  rowStart: number,
  partial?: Partial<WikiArticleBlock>,
): WikiArticleBlock {
  const base = createDefaultBlock(type, rowStart);
  return normalizeWikiArticleBlock({
    ...base,
    ...partial,
    layout: {
      ...base.layout,
      ...(partial?.layout || {}),
    },
  });
}

export const BUILTIN_WIKI_BLOCK_PRESETS: WikiBlockPreset[] = [
  {
    id: "preset-hero-header",
    name: "Hero Header",
    description: "A bold header with supporting article text.",
    category: "Article Openers",
    builtIn: true,
    previewLabel: "Header + summary",
    blocks: [
      createPresetBlock("heading", 1, {
        title: "Section Header",
        subtitle: "Supporting line or flavor text",
        headingLevel: 2,
        layout: { colStart: 1, colSpan: 48, rowStart: 1, rowSpan: 5 },
      }),
      createPresetBlock("richText", 6, {
        title: "Overview",
        html: "<p>Write a high-level summary that introduces the topic and gives readers context before the deeper sections begin.</p>",
        layout: { colStart: 1, colSpan: 48, rowStart: 6, rowSpan: 10 },
      }),
    ],
  },
  {
    id: "preset-two-column-image-text",
    name: "Two Column Image + Text",
    description: "A clean media block beside descriptive article text.",
    category: "Layouts",
    builtIn: true,
    previewLabel: "Image + overview",
    blocks: [
      createPresetBlock("image", 1, {
        title: "Feature Image",
        imageCaption: "Image caption",
        layout: { colStart: 1, colSpan: 18, rowStart: 1, rowSpan: 18 },
      }),
      createPresetBlock("richText", 1, {
        title: "Overview",
        html: "<p>Pair an image with descriptive text, a short summary, or a scene-setting excerpt.</p>",
        layout: { colStart: 20, colSpan: 29, rowStart: 1, rowSpan: 18 },
      }),
    ],
  },
  {
    id: "preset-infobox-cluster",
    name: "Infobox Cluster",
    description: "Profile data with a main article summary beside it.",
    category: "Reference",
    builtIn: true,
    previewLabel: "Profile + article text",
    blocks: [
      createPresetBlock("keyValueBox", 1, {
        title: "Profile",
        items: [
          { id: "preset-item-1", label: "Type", value: "" },
          { id: "preset-item-2", label: "Affiliation", value: "" },
          { id: "preset-item-3", label: "Region", value: "" },
          { id: "preset-item-4", label: "Status", value: "" },
        ],
        layout: { colStart: 1, colSpan: 14, rowStart: 1, rowSpan: 18 },
      }),
      createPresetBlock("richText", 1, {
        title: "Main Entry",
        html: "<p>Use this space for the readable article body while the profile block carries quick-reference facts.</p>",
        layout: { colStart: 17, colSpan: 32, rowStart: 1, rowSpan: 18 },
      }),
    ],
  },
  {
    id: "preset-spell-reference",
    name: "Spell / Reference Table",
    description: "A heading followed by a wide structured reference table.",
    category: "Reference",
    builtIn: true,
    previewLabel: "Heading + table",
    blocks: [
      createPresetBlock("heading", 1, {
        title: "Reference Section",
        subtitle: "A structured rules or spell listing",
        headingLevel: 2,
        layout: { colStart: 1, colSpan: 48, rowStart: 1, rowSpan: 5 },
      }),
      createPresetBlock("referenceTable", 6, {
        title: "Directory",
        columns: ["Name", "Type", "Range", "Duration", "Notes"],
        rows: [{ id: "preset-row-1", cells: ["Sample Entry", "Evocation", "60 ft", "Instant", "Describe the effect here."] }],
        layout: { colStart: 1, colSpan: 48, rowStart: 6, rowSpan: 20 },
      }),
    ],
  },
  {
    id: "preset-callout-strip",
    name: "Callout Strip",
    description: "A pair of lore or warning callouts that sit beside each other.",
    category: "Callouts",
    builtIn: true,
    previewLabel: "Parallel callouts",
    blocks: [
      createPresetBlock("calloutPanel", 1, {
        title: "Lore",
        html: "<p>Drop important worldbuilding, side-notes, or historical context here.</p>",
        layout: { colStart: 1, colSpan: 24, rowStart: 1, rowSpan: 14 },
      }),
      createPresetBlock("calloutPanel", 1, {
        title: "Rules / Warning",
        html: "<p>Use a second callout for rules text, a warning, or a contrasting note.</p>",
        layout: { colStart: 25, colSpan: 24, rowStart: 1, rowSpan: 14 },
      }),
    ],
  },
  {
    id: "preset-related-links-cluster",
    name: "Related Links Cluster",
    description: "A compact heading, related links list, and callout stack.",
    category: "Navigation",
    builtIn: true,
    previewLabel: "Links + note",
    blocks: [
      createPresetBlock("heading", 1, {
        title: "Related Reading",
        subtitle: "Jump points for connected articles",
        headingLevel: 3,
        layout: { colStart: 1, colSpan: 48, rowStart: 1, rowSpan: 4 },
      }),
      createPresetBlock("wikiLinksList", 5, {
        title: "Linked Articles",
        articleIds: [],
        layout: { colStart: 1, colSpan: 18, rowStart: 5, rowSpan: 14 },
      }),
      createPresetBlock("calloutPanel", 5, {
        title: "Reader Note",
        html: "<p>Use this companion panel for context, reading order, or spoiler guidance.</p>",
        layout: { colStart: 21, colSpan: 28, rowStart: 5, rowSpan: 14 },
      }),
    ],
  },
  {
    id: "preset-image-gallery-strip",
    name: "Image Gallery Strip",
    description: "Three image blocks arranged as a responsive visual strip.",
    category: "Media",
    builtIn: true,
    previewLabel: "3 image gallery",
    blocks: [
      createPresetBlock("image", 1, {
        title: "Gallery Image",
        imageCaption: "Caption",
        layout: { colStart: 1, colSpan: 15, rowStart: 1, rowSpan: 14 },
        fluid: { widthMode: "fill", heightMode: "fixed", keepAspectRatio: true, mobileBehavior: "stack" },
      }),
      createPresetBlock("image", 1, {
        title: "Gallery Image",
        imageCaption: "Caption",
        layout: { colStart: 17, colSpan: 15, rowStart: 1, rowSpan: 14 },
        fluid: { widthMode: "fill", heightMode: "fixed", keepAspectRatio: true, mobileBehavior: "stack" },
      }),
      createPresetBlock("image", 1, {
        title: "Gallery Image",
        imageCaption: "Caption",
        layout: { colStart: 33, colSpan: 16, rowStart: 1, rowSpan: 14 },
        fluid: { widthMode: "fill", heightMode: "fixed", keepAspectRatio: true, mobileBehavior: "stack" },
      }),
    ],
  },
  {
    id: "preset-timeline-reference-section",
    name: "Timeline Reference Section",
    description: "A heading, compact key facts, and a chronological reference table.",
    category: "Reference",
    builtIn: true,
    previewLabel: "Timeline + facts",
    blocks: [
      createPresetBlock("heading", 1, {
        title: "Timeline",
        subtitle: "Important events in reading order",
        headingLevel: 2,
        layout: { colStart: 1, colSpan: 48, rowStart: 1, rowSpan: 5 },
        fluid: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
      }),
      createPresetBlock("keyValueBox", 6, {
        title: "Quick Facts",
        items: [
          { id: "timeline-fact-1", label: "Era", value: "" },
          { id: "timeline-fact-2", label: "Region", value: "" },
          { id: "timeline-fact-3", label: "Status", value: "" },
        ],
        layout: { colStart: 1, colSpan: 14, rowStart: 6, rowSpan: 14 },
        fluid: { widthMode: "fixed", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "compact" },
      }),
      createPresetBlock("referenceTable", 6, {
        title: "Events",
        columns: ["When", "Event", "Outcome"],
        rows: [
          { id: "timeline-row-1", cells: ["Date / Era", "Event name", "What changed?"] },
          { id: "timeline-row-2", cells: ["Date / Era", "Event name", "What changed?"] },
        ],
        layout: { colStart: 16, colSpan: 33, rowStart: 6, rowSpan: 18 },
        fluid: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "scrollX" },
      }),
    ],
  },
];

export function normalizeWikiCanvasSettings(settings?: Partial<WikiCanvasSettings> | null): WikiCanvasSettings {
  const preset = settings?.preset && WIKI_CANVAS_PRESETS[settings.preset] ? settings.preset : "standard";
  const base = WIKI_CANVAS_PRESETS[preset];
  const frameWidth = clampInt(settings?.frameWidth, 1100, 1760);
  const minCanvasHeight = clampInt(settings?.minCanvasHeight, 960, 2800);
  const canvasHeight = clampInt(settings?.canvasHeight, minCanvasHeight, 3600);
  const articleChromeLayouts = (Object.keys(DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS) as WikiArticleChromeField[]).reduce(
    (layouts, field) => {
      const fallback = DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS[field];
      const incoming = settings?.articleChromeLayouts?.[field] || fallback;
      const colSpan = clampInt(incoming.colSpan, fallback.minColSpan || 1, WIKI_BLOCK_COLUMNS);
      return {
        ...layouts,
        [field]: {
          colStart: clampInt(incoming.colStart, 1, WIKI_BLOCK_COLUMNS - colSpan + 1),
          colSpan,
          rowStart: Math.max(1, incoming.rowStart || fallback.rowStart),
          rowSpan: Math.max(fallback.minRowSpan || 1, incoming.rowSpan || fallback.rowSpan),
          minColSpan: fallback.minColSpan,
          minRowSpan: fallback.minRowSpan,
        },
      };
    },
    {} as WikiArticleChromeLayouts,
  );
  return {
    preset,
    frameWidth: settings?.frameWidth ? frameWidth : base.frameWidth,
    minCanvasHeight: settings?.minCanvasHeight ? minCanvasHeight : base.minCanvasHeight,
    canvasHeight: settings?.canvasHeight ? canvasHeight : base.canvasHeight,
    articleChromeLayouts,
  };
}

export function createDefaultBlock(type: WikiBlockType, rowStart = 1): WikiArticleBlock {
  const base = DEFAULT_LAYOUTS[type];
  return normalizeWikiArticleBlock({
    id: `wiki-block-${uid()}`,
    type,
    title: type === "heading" ? "Heading" : type === "divider" ? "" : "",
    subtitle: "",
    html: type === "richText" ? "" : "",
    layout: {
      colStart: 1,
      colSpan: base.colSpan,
      rowStart,
      rowSpan: base.rowSpan,
      minColSpan: base.minColSpan,
      minRowSpan: base.minRowSpan,
    },
    appearance: {
      padding: type === "divider" || type === "spacer" ? "tight" : "normal",
      borderStyle: type === "divider" ? "none" : "solid",
    },
    visibility: {
      assignedTo: [],
      mode: "visible",
    },
    style: type === "calloutPanel" || type === "spoilerBlock" ? "neutral" : "blank",
    headingLevel: type === "heading" ? 2 : undefined,
    cropMode: type === "image" ? "cover" : undefined,
    imageFocalX: type === "image" ? 50 : undefined,
    imageFocalY: type === "image" ? 50 : undefined,
    imageCaptionPlacement: type === "image" ? "below" : undefined,
    dividerLabel: type === "divider" ? "" : undefined,
    spacerHeight: type === "spacer" ? 1 : undefined,
    columns: type === "referenceTable" ? ["Name", "Type", "Notes"] : undefined,
    rows: type === "referenceTable" ? [{ id: `row-${uid()}`, cells: ["", "", ""] }] : undefined,
    items: type === "keyValueBox" ? [{ id: `item-${uid()}`, label: "Label", value: "Value" }] : undefined,
    articleIds: type === "wikiLinksList" ? [] : undefined,
    fluid: DEFAULT_FLUID_SETTINGS[type],
  });
}

export function normalizeWikiArticleBlock(block: Partial<WikiArticleBlock>): WikiArticleBlock {
  const type = (block.type || "richText") as WikiBlockType;
  const base = DEFAULT_LAYOUTS[type];
  const baseFluid = DEFAULT_FLUID_SETTINGS[type];
  const layout = block.layout || ({} as Partial<WikiBlockLayout>);
  const visibility = block.visibility || { assignedTo: [], mode: "visible" as const };
  const fluid = block.fluid || ({} as Partial<WikiBlockFluidSettings>);
  return {
    id: block.id || `wiki-block-${uid()}`,
    type,
    title: block.title || "",
    subtitle: block.subtitle || "",
    html: block.html || "",
    layout: {
      colStart: clampInt(layout.colStart, 1, WIKI_BLOCK_COLUMNS),
      colSpan: clampInt(layout.colSpan, base.minColSpan || 1, WIKI_BLOCK_COLUMNS),
      rowStart: Math.max(1, layout.rowStart || 1),
      rowSpan: Math.max(base.minRowSpan || 1, layout.rowSpan || base.rowSpan || WIKI_BLOCK_DEFAULT_ROW_SPAN),
      minColSpan: base.minColSpan,
      minRowSpan: base.minRowSpan,
    },
    appearance: {
      padding: block.appearance?.padding || (type === "divider" || type === "spacer" ? "tight" : "normal"),
      borderStyle: block.appearance?.borderStyle || (type === "divider" ? "none" : "solid"),
      accentColor: block.appearance?.accentColor,
      backgroundColor: block.appearance?.backgroundColor,
      borderColor: block.appearance?.borderColor,
    },
    visibility: {
      assignedTo: Array.isArray(visibility.assignedTo) ? visibility.assignedTo : [],
      mode: visibility.mode || (Array.isArray(visibility.assignedTo) && visibility.assignedTo.length > 0 ? "spoiler" : "visible"),
    },
    locked: !!block.locked,
    style: block.style || (type === "calloutPanel" || type === "spoilerBlock" ? "neutral" : "blank"),
    level: block.level,
    imageUrl: block.imageUrl || "",
    imageAlt: block.imageAlt || "",
    imageCaption: block.imageCaption || "",
    imageStorageAssetId: block.imageStorageAssetId || "",
    imageFocalX: typeof block.imageFocalX === "number" ? clampInt(block.imageFocalX, 0, 100) : 50,
    imageFocalY: typeof block.imageFocalY === "number" ? clampInt(block.imageFocalY, 0, 100) : 50,
    imageCaptionPlacement: block.imageCaptionPlacement || (type === "image" ? "below" : "hidden"),
    cropMode: block.cropMode || (type === "image" ? "cover" : "contain"),
    headingLevel: (block.headingLevel || (type === "heading" ? 2 : undefined)) as 1 | 2 | 3 | 4 | undefined,
    dividerLabel: block.dividerLabel || "",
    spacerHeight: Math.max(1, block.spacerHeight || 1),
    columns: Array.isArray(block.columns) ? block.columns : type === "referenceTable" ? ["Name", "Type", "Notes"] : undefined,
    rows: Array.isArray(block.rows)
      ? block.rows.map((row) => ({ id: row.id || `row-${uid()}`, cells: Array.isArray(row.cells) ? row.cells : [] }))
      : type === "referenceTable"
        ? [{ id: `row-${uid()}`, cells: ["", "", ""] }]
        : undefined,
    items: Array.isArray(block.items)
      ? block.items.map((item) => ({ id: item.id || `item-${uid()}`, label: item.label || "", value: item.value || "" }))
      : type === "keyValueBox"
        ? []
        : undefined,
    articleIds: Array.isArray(block.articleIds) ? block.articleIds : type === "wikiLinksList" ? [] : undefined,
    mobilePriority: typeof block.mobilePriority === "number" ? block.mobilePriority : undefined,
    mobileCollapseMode: block.mobileCollapseMode || (type === "referenceTable" ? "scrollX" : "stack"),
    fluid: {
      widthMode: fluid.widthMode || baseFluid.widthMode,
      heightMode: fluid.heightMode || baseFluid.heightMode,
      keepAspectRatio: typeof fluid.keepAspectRatio === "boolean" ? fluid.keepAspectRatio : baseFluid.keepAspectRatio,
      mobileBehavior: fluid.mobileBehavior || block.mobileCollapseMode || baseFluid.mobileBehavior,
      preferredMobileOrder: typeof fluid.preferredMobileOrder === "number" ? fluid.preferredMobileOrder : undefined,
    },
    layoutGroupId: block.layoutGroupId || "",
    layoutGroupName: block.layoutGroupName || "",
    layoutGroupMode: block.layoutGroupMode || "manual",
  };
}

export function normalizeWikiArticleBlocks(blocks: Partial<WikiArticleBlock>[] | null | undefined): WikiArticleBlock[] {
  return (blocks || []).map((block) => normalizeWikiArticleBlock(block));
}

export function normalizeWikiBlockPreset(preset: Partial<WikiBlockPreset>): WikiBlockPreset {
  return {
    id: preset.id || `wiki-preset-${uid()}`,
    name: preset.name || "Untitled Preset",
    description: preset.description || "",
    category: preset.category || "General",
    builtIn: !!preset.builtIn,
    previewLabel: preset.previewLabel || "",
    blocks: compactWikiArticleBlocks(normalizeWikiArticleBlocks(preset.blocks || [])),
  };
}

export function normalizeWikiBlockPresets(presets: Partial<WikiBlockPreset>[] | null | undefined): WikiBlockPreset[] {
  return (presets || []).map((preset) => normalizeWikiBlockPreset(preset));
}

export function upgradeWikiBlockToCurrentLayout(
  block: Partial<WikiArticleBlock>,
  version = 1,
): Partial<WikiArticleBlock> {
  if (version >= WIKI_BLOCK_LAYOUT_VERSION) return block;
  const normalized = normalizeWikiArticleBlock(block);
  const legacyColSpan = normalized.layout.colSpan;
  const legacyColStart = normalized.layout.colStart;
  const legacyRowSpan = normalized.layout.rowSpan;
  const legacyRowStart = normalized.layout.rowStart;

  return {
    ...normalized,
    layout: {
      ...normalized.layout,
      colStart: ((legacyColStart - 1) * WIKI_BLOCK_LEGACY_TO_DENSE_COL_SCALE) + 1,
      colSpan: legacyColSpan * WIKI_BLOCK_LEGACY_TO_DENSE_COL_SCALE,
      rowStart: ((legacyRowStart - 1) * WIKI_BLOCK_LEGACY_TO_DENSE_ROW_SCALE) + 1,
      rowSpan: legacyRowSpan * WIKI_BLOCK_LEGACY_TO_DENSE_ROW_SCALE,
      minColSpan: Math.max(
        (normalized.layout.minColSpan || 1) * WIKI_BLOCK_LEGACY_TO_DENSE_COL_SCALE,
        DEFAULT_LAYOUTS[normalized.type].minColSpan || 1,
      ),
      minRowSpan: Math.max(
        (normalized.layout.minRowSpan || 1) * WIKI_BLOCK_LEGACY_TO_DENSE_ROW_SCALE,
        DEFAULT_LAYOUTS[normalized.type].minRowSpan || 1,
      ),
    },
  };
}

export function migrateLegacyArticleToBlocks(page: LegacyPageLike): WikiArticleBlock[] {
  if (page.layoutVersion === WIKI_BLOCK_LAYOUT_VERSION && Array.isArray(page.blocks) && page.blocks.length > 0) {
    return normalizeWikiArticleBlocks(page.blocks);
  }

  if (Array.isArray(page.blocks) && page.blocks.length > 0) {
    const priorVersion = page.layoutVersion || 1;
    return compactWikiArticleBlocks(
      normalizeWikiArticleBlocks(
        page.blocks.map((block) => upgradeWikiBlockToCurrentLayout(block, priorVersion)),
      ),
    );
  }

  const blocks: WikiArticleBlock[] = [];
  let nextRow = 1;

  if ((page.bodyTitle || page.bodySubtitle) && !page.body) {
    const heading = createDefaultBlock("heading", nextRow);
    heading.title = page.bodyTitle || "Overview";
    heading.subtitle = page.bodySubtitle || "";
    blocks.push(heading);
    nextRow += heading.layout.rowSpan;
  }

  if (page.body && page.body.trim()) {
    const block = createDefaultBlock("richText", nextRow);
    block.title = page.bodyTitle || "Overview";
    block.subtitle = page.bodySubtitle || "";
    block.html = page.body;
    block.layout.colSpan = WIKI_BLOCK_COLUMNS;
    block.layout.rowSpan = estimateRichTextRowSpan(page.body);
    blocks.push(block);
    nextRow += block.layout.rowSpan;
  }

  const legacyPanels = normalizeWikiPanels(page.panels || migrateLegacySectionsToPanels(page.sections || []));
  legacyPanels.forEach((panel) => {
    const type = panel.visibilityMode === "spoiler" || (panel.assignedTo && panel.assignedTo.length > 0)
      ? "spoilerBlock"
      : "calloutPanel";
    const block = createDefaultBlock(type, nextRow);
    block.title = panel.title || "";
    block.subtitle = panel.subtitle || "";
    block.html = panel.content || "";
    block.style = panel.style || "blank";
    block.imageUrl = panel.mediaUrl || "";
    block.imageCaption = panel.mediaCaption || "";
    block.imageAlt = panel.mediaAlt || "";
    block.visibility = {
      assignedTo: panel.assignedTo || [],
      mode: panel.assignedTo && panel.assignedTo.length > 0 ? (panel.visibilityMode || "spoiler") : "visible",
    };
    if (panel.placement === "sidebar") {
      block.layout.colStart = 33;
      block.layout.colSpan = 16;
    } else if (panel.width === "half") {
      block.layout.colSpan = 24;
    } else {
      block.layout.colSpan = WIKI_BLOCK_COLUMNS;
    }
    block.layout.rowSpan = estimateRichTextRowSpan(panel.content || "", block.layout.colSpan);
    blocks.push(block);
    nextRow += block.layout.rowSpan;
  });

  return compactWikiArticleBlocks(blocks);
}

export function compactWikiArticleBlocks(blocks: WikiArticleBlock[]): WikiArticleBlock[] {
  const sorted = [...blocks].sort(compareWikiBlocksForLayout);
  return sorted.map((block) => normalizeWikiArticleBlock(block));
}

export function getWikiBlockLayoutBounds(blocks: WikiArticleBlock[]) {
  if (blocks.length === 0) {
    return {
      minColStart: 1,
      maxColEnd: 1,
      minRowStart: 1,
      maxRowEnd: 1,
      colSpan: 1,
      rowSpan: 1,
    };
  }

  const minColStart = Math.min(...blocks.map((block) => block.layout.colStart));
  const maxColEnd = Math.max(...blocks.map((block) => block.layout.colStart + block.layout.colSpan - 1));
  const minRowStart = Math.min(...blocks.map((block) => block.layout.rowStart));
  const maxRowEnd = Math.max(...blocks.map((block) => block.layout.rowStart + block.layout.rowSpan - 1));

  return {
    minColStart,
    maxColEnd,
    minRowStart,
    maxRowEnd,
    colSpan: maxColEnd - minColStart + 1,
    rowSpan: maxRowEnd - minRowStart + 1,
  };
}

export function instantiateWikiBlockPreset(
  preset: WikiBlockPreset,
  anchor?: { colStart: number; rowStart: number },
): WikiArticleBlock[] {
  const sourceBlocks = compactWikiArticleBlocks(normalizeWikiArticleBlocks(preset.blocks));
  const bounds = getWikiBlockLayoutBounds(sourceBlocks);
  const targetColStart = Math.max(1, anchor?.colStart || bounds.minColStart);
  const targetRowStart = Math.max(1, anchor?.rowStart || bounds.minRowStart);
  const maxColStart = Math.max(1, WIKI_BLOCK_COLUMNS - bounds.colSpan + 1);
  const rebasedColStart = Math.min(targetColStart, maxColStart);
  const colOffset = rebasedColStart - bounds.minColStart;
  const rowOffset = targetRowStart - bounds.minRowStart;

  return sourceBlocks.map((block) => normalizeWikiArticleBlock({
    ...block,
    id: `wiki-block-${uid()}`,
    layout: {
      ...block.layout,
      colStart: block.layout.colStart + colOffset,
      rowStart: block.layout.rowStart + rowOffset,
    },
    rows: block.rows?.map((row) => ({
      ...row,
      id: `row-${uid()}`,
    })),
    items: block.items?.map((item) => ({
      ...item,
      id: `item-${uid()}`,
    })),
  }));
}

export function compareWikiBlocksForLayout(a: WikiArticleBlock, b: WikiArticleBlock): number {
  if (a.layout.rowStart !== b.layout.rowStart) return a.layout.rowStart - b.layout.rowStart;
  if (a.layout.colStart !== b.layout.colStart) return a.layout.colStart - b.layout.colStart;
  return a.id.localeCompare(b.id);
}

export function groupBlocksIntoDesktopRows(blocks: WikiArticleBlock[]): WikiArticleBlock[][] {
  const sorted = [...blocks].sort(compareWikiBlocksForLayout);
  const rows: WikiArticleBlock[][] = [];
  let currentKey = "";
  sorted.forEach((block) => {
    const key = `${block.layout.rowStart}`;
    if (key !== currentKey) {
      rows.push([block]);
      currentKey = key;
    } else {
      rows[rows.length - 1].push(block);
    }
  });
  return rows;
}

export function getNextWikiBlockRow(blocks: WikiArticleBlock[]): number {
  if (blocks.length === 0) return 1;
  return Math.max(...blocks.map((block) => block.layout.rowStart + block.layout.rowSpan)) + 1;
}

export function placeWikiBlock(blocks: WikiArticleBlock[], blockId: string, nextLayout: Partial<WikiBlockLayout>): WikiArticleBlock[] {
  const next = blocks.map((block) => {
    if (block.id !== blockId) return normalizeWikiArticleBlock(block);
    return normalizeWikiArticleBlock({
      ...block,
      layout: {
        ...block.layout,
        ...nextLayout,
      },
    });
  });
  return resolveWikiBlockCollisions(next, blockId);
}

export function resolveWikiBlockCollisions(blocks: WikiArticleBlock[], priorityBlockId?: string): WikiArticleBlock[] {
  const sorted = [...blocks].sort((a, b) => {
    if (priorityBlockId) {
      if (a.id === priorityBlockId) return -1;
      if (b.id === priorityBlockId) return 1;
    }
    return compareWikiBlocksForLayout(a, b);
  });

  const placed: WikiArticleBlock[] = [];
  sorted.forEach((rawBlock) => {
    let block = normalizeWikiArticleBlock(rawBlock);
    block = clampWikiBlockLayout(block);
    while (placed.some((existing) => wikiBlocksOverlap(existing, block))) {
      block = normalizeWikiArticleBlock({
        ...block,
        layout: {
          ...block.layout,
          rowStart: block.layout.rowStart + 1,
        },
      });
    }
    placed.push(block);
  });

  return placed.sort(compareWikiBlocksForLayout);
}

export function clampWikiBlockLayout(block: WikiArticleBlock): WikiArticleBlock {
  const minColSpan = block.layout.minColSpan || 1;
  const minRowSpan = block.layout.minRowSpan || 1;
  const colSpan = clampInt(block.layout.colSpan, minColSpan, WIKI_BLOCK_COLUMNS);
  const colStart = clampInt(block.layout.colStart, 1, Math.max(1, WIKI_BLOCK_COLUMNS - colSpan + 1));
  return normalizeWikiArticleBlock({
    ...block,
    layout: {
      ...block.layout,
      colStart,
      colSpan,
      rowStart: Math.max(1, block.layout.rowStart),
      rowSpan: Math.max(minRowSpan, block.layout.rowSpan),
    },
  });
}

export function wikiBlocksOverlap(a: WikiArticleBlock, b: WikiArticleBlock): boolean {
  const aRowEnd = a.layout.rowStart + a.layout.rowSpan - 1;
  const bRowEnd = b.layout.rowStart + b.layout.rowSpan - 1;
  const aColEnd = a.layout.colStart + a.layout.colSpan - 1;
  const bColEnd = b.layout.colStart + b.layout.colSpan - 1;
  const rowOverlap = a.layout.rowStart <= bRowEnd && b.layout.rowStart <= aRowEnd;
  const colOverlap = a.layout.colStart <= bColEnd && b.layout.colStart <= aColEnd;
  return rowOverlap && colOverlap;
}

export function serializeWikiBlocksToLegacyContent(blocks: WikiArticleBlock[]): { body: string; panels: LegacyPanelLike[] } {
  const sorted = [...blocks].sort(compareWikiBlocksForLayout);
  const bodyParts: string[] = [];
  const panels: LegacyPanelLike[] = [];

  sorted.forEach((block) => {
    const bodyHtml = getWikiBlockHtml(block);
    if (block.type === "calloutPanel" || block.type === "spoilerBlock" || block.type === "keyValueBox" || block.type === "referenceTable" || block.type === "wikiLinksList") {
      const isSidebarLike = block.layout.colStart >= 31 && block.layout.colSpan <= 18;
      panels.push({
        id: block.id,
        title: block.title,
        subtitle: block.subtitle,
        content: bodyHtml,
        assignedTo: block.visibility.assignedTo,
        visibilityMode: block.visibility.mode === "visible" ? "spoiler" : (block.visibility.mode as "spoiler" | "hidden"),
        style: block.style,
        placement: isSidebarLike ? "sidebar" : "body",
        width: block.layout.colSpan <= 24 ? "half" : "full",
        mediaUrl: block.imageUrl,
        mediaCaption: block.imageCaption,
        mediaAlt: block.imageAlt,
      });
    } else {
      bodyParts.push(bodyHtml);
    }
  });

  return {
    body: bodyParts.filter(Boolean).join(""),
    panels,
  };
}

export function getWikiBlockHtml(block: WikiArticleBlock): string {
  switch (block.type) {
    case "heading":
      return `<h${block.headingLevel || 2}>${escapeHtml(block.title || "")}</h${block.headingLevel || 2}>`;
    case "image":
      return block.imageUrl
        ? `<figure><img src="${block.imageUrl}" alt="${escapeHtml(block.imageAlt || block.title || "")}" />${block.imageCaption ? `<figcaption>${escapeHtml(block.imageCaption)}</figcaption>` : ""}</figure>`
        : "";
    case "calloutPanel":
    case "spoilerBlock":
      return `${block.title ? `<h3>${escapeHtml(block.title)}</h3>` : ""}${block.subtitle ? `<p><em>${escapeHtml(block.subtitle)}</em></p>` : ""}${block.html || ""}`;
    case "referenceTable":
      return buildTableHtml(block.columns || [], block.rows || []);
    case "keyValueBox":
      return buildKeyValueHtml(block.title, block.items || []);
    case "wikiLinksList":
      return buildWikiLinksListHtml(block.title, block.articleIds || []);
    case "divider":
      return `<hr />${block.dividerLabel ? `<p>${escapeHtml(block.dividerLabel)}</p>` : ""}`;
    case "spacer":
      return `<div style="height:${Math.max(1, block.spacerHeight || 1) * 12}px;"></div>`;
    case "richText":
    default:
      return block.html || "";
  }
}

export function getWikiBlockSearchText(block: WikiArticleBlock): string {
  return [
    block.title,
    block.subtitle,
    stripHtml(block.html || ""),
    block.imageCaption,
    block.imageAlt,
    block.dividerLabel,
    ...(block.columns || []),
    ...(block.rows || []).flatMap((row) => row.cells),
    ...(block.items || []).flatMap((item) => [item.label, item.value]),
    ...(block.articleIds || []),
  ]
    .filter(Boolean)
    .join(" ");
}

export function collectWikiBlockHtmlStrings(blocks: WikiArticleBlock[]): string[] {
  return blocks.map((block) => getWikiBlockHtml(block)).filter(Boolean);
}

export function estimateRichTextRowSpan(html: string, colSpan = WIKI_BLOCK_COLUMNS): number {
  const plain = stripHtml(html || "");
  const base = Math.ceil(Math.max(plain.length, 140) / Math.max(1, colSpan * 2.8));
  return Math.max(8, Math.min(56, base + 5));
}

function buildTableHtml(columns: string[], rows: WikiReferenceTableRow[]): string {
  const head = columns.length > 0
    ? `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>`
    : "";
  const body = `<tbody>${rows.map((row) => `<tr>${row.cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table>${head}${body}</table>`;
}

function buildKeyValueHtml(title: string, items: WikiKeyValueRow[]): string {
  const heading = title ? `<h3>${escapeHtml(title)}</h3>` : "";
  const body = items.map((item) => `<p><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</p>`).join("");
  return `${heading}${body}`;
}

function buildWikiLinksListHtml(title: string, articleIds: string[]): string {
  const heading = title ? `<h3>${escapeHtml(title)}</h3>` : "";
  const items = articleIds.map((articleId) => `<li><a href="/interface/inet-page/${articleId}" data-article-id="${articleId}" class="wiki-link">${articleId}</a></li>`).join("");
  return `${heading}<ul>${items}</ul>`;
}

function migrateLegacySectionsToPanels(sections: { id: string; heading: string; body: string }[]): LegacyPanelLike[] {
  return (sections || []).map((section) => ({
    id: section.id.startsWith("sec-") ? section.id.replace("sec-", "panel-") : `panel-${section.id}`,
    title: section.heading || "",
    content: section.body || "",
    assignedTo: [],
    style: "blank",
  }));
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clampInt(value: number | undefined, min: number, max: number): number {
  const numeric = Number.isFinite(value) ? Number(value) : min;
  return Math.max(min, Math.min(max, numeric));
}
