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
  compactHeaderLayout: boolean;
  articleChromeLayouts?: WikiArticleChromeLayouts;
}

export const WIKI_CANVAS_PRESETS: Record<WikiCanvasPreset, WikiCanvasSettings> = {
  standard: { frameWidth: 1480, canvasHeight: 1480, minCanvasHeight: 1320, preset: "standard", compactHeaderLayout: false },
  large: { frameWidth: 1540, canvasHeight: 1720, minCanvasHeight: 1480, preset: "large", compactHeaderLayout: false },
  referenceWide: { frameWidth: 1600, canvasHeight: 1840, minCanvasHeight: 1560, preset: "referenceWide", compactHeaderLayout: false },
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
  | "tabbedReference"
  | "keyValueBox"
  | "spoilerBlock"
  | "wikiLinksList"
  | "divider"
  | "lineBox"
  | "spacer";

export type WikiBlockVisibilityMode = "visible" | "spoiler" | "hidden";
export type WikiBlockCropMode = "contain" | "cover";
export type WikiBlockPadding = "tight" | "normal" | "loose";
export type WikiBlockBorderStyle = "solid" | "dashed" | "dotted" | "double" | "none";
export type WikiBlockSurfaceStyle = "flat" | "raised" | "inset" | "glass" | "none";
export type WikiBlockDividerStyle = "line" | "double" | "dashed" | "glow" | "notched";
export type WikiBlockMobileCollapseMode = "stack" | "scrollX" | "compact";
export type WikiImageCaptionPlacement = "below" | "overlay" | "hidden";
export type WikiBlockWidthMode = "fixed" | "fill" | "hug";
export type WikiBlockHeightMode = "fixed" | "hug" | "fill";
export type WikiBlockLayoutGroupMode = "manual" | "stack" | "columns" | "wrap";
export type WikiBlockBackgroundTreatment = "solid" | "gradient" | "scanline" | "terminal" | "none";
export type WikiBlockTitleAlign = "left" | "center" | "right";
export type WikiBlockBodyAlign = "left" | "center" | "right" | "justify";
export type WikiBlockDividerLabelPosition = "above" | "center" | "below";
export type WikiBlockOverflowMode = "clip" | "scroll" | "fade";
export type WikiBlockMobileDensity = "comfortable" | "compact" | "dense";
export type WikiBlockClickAction = "none" | "expandImage" | "openArticle" | "toggleCollapse";
export type WikiImageFrameStyle = "none" | "thin" | "thick" | "polaroid" | "terminal";
export type WikiImageCaptionStyle = "plain" | "panel" | "terminal" | "muted";
export type WikiReferenceTableDensity = "comfortable" | "compact" | "dense";
export type WikiKeyValueDensity = "comfortable" | "compact" | "dense";
export type WikiKeyValueLabelAlign = "left" | "right";
export type WikiLinksDisplayMode = "list" | "cards" | "chips";
export type WikiLineBoxOrientation = "horizontal" | "vertical";

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
  revealLabel?: string;
  revealNote?: string;
  revealAfter?: string;
}

export interface WikiBlockAppearance {
  accentColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderStyle?: WikiBlockBorderStyle;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  glowIntensity?: number;
  shadowDepth?: number;
  titleColor?: string;
  bodyColor?: string;
  titleAlign?: WikiBlockTitleAlign;
  bodyAlign?: WikiBlockBodyAlign;
  backgroundTreatment?: WikiBlockBackgroundTreatment;
  dividerStyle?: WikiBlockDividerStyle;
  dividerLabelPosition?: WikiBlockDividerLabelPosition;
  padding?: WikiBlockPadding;
  surfaceStyle?: WikiBlockSurfaceStyle;
  stylePresetId?: string;
}

export interface WikiBlockBehavior {
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  overflowMode?: WikiBlockOverflowMode;
  includeInToc?: boolean;
  anchorLabel?: string;
  mobileDensity?: WikiBlockMobileDensity;
  mobileFullWidth?: boolean;
  clickAction?: WikiBlockClickAction;
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

export interface WikiTabbedReferenceTab {
  id: string;
  label: string;
  title?: string;
  columns: string[];
  rows: WikiReferenceTableRow[];
  html?: string;
}

export interface WikiArticleBlock {
  id: string;
  type: WikiBlockType;
  title: string;
  subtitle: string;
  html: string;
  layout: WikiBlockLayout;
  appearance: WikiBlockAppearance;
  behavior?: WikiBlockBehavior;
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
  imageFrameStyle?: WikiImageFrameStyle;
  imageCaptionStyle?: WikiImageCaptionStyle;
  cropMode?: WikiBlockCropMode;
  headingLevel?: 1 | 2 | 3 | 4;
  dividerLabel?: string;
  lineOrientation?: WikiLineBoxOrientation;
  lineThickness?: number;
  spacerHeight?: number;
  columns?: string[];
  rows?: WikiReferenceTableRow[];
  tabs?: WikiTabbedReferenceTab[];
  activeTabId?: string;
  tableDensity?: WikiReferenceTableDensity;
  tableStripedRows?: boolean;
  tableStickyHeader?: boolean;
  tableLinkedCells?: boolean;
  items?: WikiKeyValueRow[];
  keyValueDensity?: WikiKeyValueDensity;
  keyValueLabelAlign?: WikiKeyValueLabelAlign;
  keyValueRowDividers?: boolean;
  articleIds?: string[];
  wikiLinksDisplayMode?: WikiLinksDisplayMode;
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

export interface WikiBlockStylePreset {
  id: string;
  name: string;
  description: string;
  category: string;
  builtIn: boolean;
  appearance?: WikiBlockAppearance;
  behavior?: WikiBlockBehavior;
  typeDefaults?: Partial<Pick<
    WikiArticleBlock,
    | "imageFrameStyle"
    | "imageCaptionStyle"
    | "tableDensity"
    | "tableStripedRows"
    | "tableStickyHeader"
    | "tableLinkedCells"
    | "keyValueDensity"
    | "keyValueLabelAlign"
    | "keyValueRowDividers"
    | "wikiLinksDisplayMode"
    | "lineOrientation"
    | "lineThickness"
  >>;
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
  tabbedReference: { colSpan: 48, rowSpan: 22, minColSpan: 20, minRowSpan: 12 },
  keyValueBox: { colSpan: 16, rowSpan: 14, minColSpan: 12, minRowSpan: 8 },
  spoilerBlock: { colSpan: 24, rowSpan: 16, minColSpan: 12, minRowSpan: 10 },
  wikiLinksList: { colSpan: 16, rowSpan: 14, minColSpan: 12, minRowSpan: 8 },
  divider: { colSpan: 48, rowSpan: 2, minColSpan: 24, minRowSpan: 2 },
  lineBox: { colSpan: 12, rowSpan: 2, minColSpan: 1, minRowSpan: 1 },
  spacer: { colSpan: 48, rowSpan: 4, minColSpan: 24, minRowSpan: 2 },
};

const DEFAULT_FLUID_SETTINGS: Record<WikiBlockType, WikiBlockFluidSettings> = {
  richText: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
  heading: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
  image: { widthMode: "fixed", heightMode: "fixed", keepAspectRatio: true, mobileBehavior: "stack" },
  calloutPanel: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
  referenceTable: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "scrollX" },
  tabbedReference: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "scrollX" },
  keyValueBox: { widthMode: "fixed", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "compact" },
  spoilerBlock: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
  wikiLinksList: { widthMode: "fixed", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "compact" },
  divider: { widthMode: "fill", heightMode: "fixed", keepAspectRatio: false, mobileBehavior: "stack" },
  lineBox: { widthMode: "fixed", heightMode: "fixed", keepAspectRatio: false, mobileBehavior: "stack" },
  spacer: { widthMode: "fill", heightMode: "fixed", keepAspectRatio: false, mobileBehavior: "compact" },
};

function createDefaultTabbedReferenceTabs(): WikiTabbedReferenceTab[] {
  const columns = ["Name", "Level", "School", "Summary"];
  return [
    {
      id: `tab-${uid()}`,
      label: "Level 1",
      title: "Level 1 Spells",
      columns,
      rows: [
        { id: `row-${uid()}`, cells: ["[[Example Spell]]", "1", "Evocation", "Describe what this spell does."] },
      ],
    },
    {
      id: `tab-${uid()}`,
      label: "Level 2",
      title: "Level 2 Spells",
      columns,
      rows: [
        { id: `row-${uid()}`, cells: ["[[Second Example]]", "2", "Abjuration", "Add the next tier of entries here."] },
      ],
    },
  ];
}

export const MAGIC_SPELL_TABLE_COLUMNS = [
  "Spell Name",
  "School",
  "Casting Time",
  "Range",
  "Duration",
  "Components",
];

export const MAGIC_SPELL_TIERS = [
  { id: "cantrip", label: "Cantrip", title: "Cantrips" },
  { id: "level-1", label: "Level 1", title: "1st-Level Spells" },
  { id: "level-2", label: "Level 2", title: "2nd-Level Spells" },
  { id: "level-3", label: "Level 3", title: "3rd-Level Spells" },
  { id: "level-4", label: "Level 4", title: "4th-Level Spells" },
  { id: "level-5", label: "Level 5", title: "5th-Level Spells" },
  { id: "level-6", label: "Level 6", title: "6th-Level Spells" },
  { id: "level-7", label: "Level 7", title: "7th-Level Spells" },
  { id: "level-8", label: "Level 8", title: "8th-Level Spells" },
] as const;

export function createMagicSpellTierTabs(): WikiTabbedReferenceTab[] {
  return MAGIC_SPELL_TIERS.map((tier) => ({
    id: `magic-${tier.id}-${uid()}`,
    label: tier.label,
    title: tier.title,
    columns: [...MAGIC_SPELL_TABLE_COLUMNS],
    rows: [
      {
        id: `magic-${tier.id}-row-${uid()}`,
        cells: ["[[Spell Article Name]]", "", "", "", "", ""],
      },
    ],
  }));
}

function normalizeReferenceRows(rows: Partial<WikiReferenceTableRow>[] | null | undefined, columnCount: number): WikiReferenceTableRow[] {
  return (rows || []).map((row) => {
    const cells = Array.isArray(row.cells) ? row.cells : [];
    return {
      id: row.id || `row-${uid()}`,
      cells: Array.from({ length: Math.max(1, columnCount) }, (_, index) => cells[index] || ""),
    };
  });
}

function normalizeTabbedReferenceTabs(tabs: Partial<WikiTabbedReferenceTab>[] | null | undefined): WikiTabbedReferenceTab[] {
  const source = Array.isArray(tabs) && tabs.length > 0 ? tabs : createDefaultTabbedReferenceTabs();
  return source.map((tab, index) => {
    const columns = Array.isArray(tab.columns) && tab.columns.length > 0 ? tab.columns : ["Name", "Level", "School", "Summary"];
    const rows = normalizeReferenceRows(tab.rows || [], columns.length);
    return {
      id: tab.id || `tab-${uid()}`,
      label: tab.label || `Tab ${index + 1}`,
      title: tab.title || tab.label || `Tab ${index + 1}`,
      columns,
      rows: rows.length > 0 ? rows : [{ id: `row-${uid()}`, cells: Array.from({ length: columns.length }, () => "") }],
      html: tab.html || "",
    };
  });
}

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

export function createMagicSpellListBlocks(rowStart = 1): WikiArticleBlock[] {
  return [
    createPresetBlock("tabbedReference", rowStart, {
      title: "Spell Index",
      subtitle: "Browse this magic by spell level",
      tabs: createMagicSpellTierTabs(),
      tableDensity: "compact",
      tableStripedRows: true,
      tableStickyHeader: true,
      tableLinkedCells: true,
      activeTabId: "",
      layout: { colStart: 1, colSpan: 48, rowStart, rowSpan: 28 },
      appearance: {
        surfaceStyle: "raised",
        backgroundTreatment: "solid",
        backgroundColor: "#0A1520",
        accentColor: "#E8B86A",
        borderColor: "#416276",
        borderRadius: 8,
        shadowDepth: 2,
      },
      fluid: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "scrollX" },
    }),
  ];
}

export function createMagicSpellArticleBlocks(rowStart = 1): WikiArticleBlock[] {
  return [
    createPresetBlock("keyValueBox", rowStart, {
      title: "Spell Details",
      items: [
        { id: `spell-level-${uid()}`, label: "Level", value: "Cantrip / 1-8" },
        { id: `spell-school-${uid()}`, label: "School", value: "" },
        { id: `spell-casting-${uid()}`, label: "Casting Time", value: "" },
        { id: `spell-range-${uid()}`, label: "Range", value: "" },
        { id: `spell-components-${uid()}`, label: "Components", value: "" },
        { id: `spell-duration-${uid()}`, label: "Duration", value: "" },
      ],
      keyValueDensity: "compact",
      keyValueRowDividers: true,
      layout: { colStart: 1, colSpan: 16, rowStart, rowSpan: 18 },
      appearance: {
        surfaceStyle: "inset",
        backgroundTreatment: "solid",
        backgroundColor: "#0A1520",
        accentColor: "#E8B86A",
        borderColor: "#416276",
        borderRadius: 8,
      },
      fluid: { widthMode: "fixed", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "compact" },
    }),
    createPresetBlock("richText", rowStart, {
      title: "Spell Description",
      html: "<p>Describe what the spell does, who or what it affects, and any rolls, saves, damage, or conditions it uses.</p>",
      layout: { colStart: 18, colSpan: 31, rowStart, rowSpan: 18 },
      appearance: {
        surfaceStyle: "flat",
        backgroundColor: "#0B1326",
        accentColor: "#8EDBCF",
        borderColor: "#315D66",
        borderRadius: 8,
      },
      fluid: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
    }),
    createPresetBlock("richText", rowStart + 20, {
      title: "At Higher Levels",
      html: "<p>Describe how this spell changes when it is cast at a higher level, or remove this section when it does not scale.</p>",
      layout: { colStart: 1, colSpan: 31, rowStart: rowStart + 20, rowSpan: 12 },
      appearance: {
        surfaceStyle: "flat",
        backgroundColor: "#0B1326",
        accentColor: "#8EDBCF",
        borderColor: "#315D66",
        borderRadius: 8,
      },
      fluid: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
    }),
    createPresetBlock("calloutPanel", rowStart + 20, {
      title: "Spell Lists",
      html: "<p>List the classes, traditions, characters, or other magic lists that can use this spell.</p>",
      layout: { colStart: 33, colSpan: 16, rowStart: rowStart + 20, rowSpan: 12 },
      appearance: {
        surfaceStyle: "raised",
        backgroundColor: "#171426",
        accentColor: "#D7A6E8",
        borderColor: "#66507A",
        borderRadius: 8,
      },
      fluid: { widthMode: "fixed", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "stack" },
    }),
  ];
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
  {
    id: "preset-archive-main-hub",
    name: "Archive Main Hub",
    description: "A classic wiki landing hub with welcome text, portal cards, updates, and a directory table.",
    category: "Landing Pages",
    builtIn: true,
    previewLabel: "Welcome + portals + directory",
    blocks: [
      createPresetBlock("heading", 1, {
        title: "Welcome to the Archive",
        subtitle: "A central index for lore, records, factions, rules, and active discoveries",
        headingLevel: 1,
        layout: { colStart: 1, colSpan: 48, rowStart: 1, rowSpan: 6 },
        appearance: {
          surfaceStyle: "raised",
          backgroundTreatment: "gradient",
          backgroundColor: "#08162E",
          accentColor: "#8AB4FF",
          borderColor: "#284A7C",
          borderStyle: "double",
          borderWidth: 2,
          borderRadius: 14,
          titleAlign: "center",
          bodyAlign: "center",
          glowIntensity: 10,
          shadowDepth: 3,
        },
      }),
      createPresetBlock("richText", 8, {
        title: "Start Here",
        html: "<p>Use this main page as a readable index for your campaign wiki. Add a short welcome, explain what players should read first, and point the DM toward maintenance sections.</p>",
        layout: { colStart: 1, colSpan: 30, rowStart: 8, rowSpan: 12 },
        appearance: {
          surfaceStyle: "flat",
          backgroundColor: "#071126",
          accentColor: "#A7D7FF",
          borderColor: "#25446E",
          borderRadius: 10,
        },
      }),
      createPresetBlock("keyValueBox", 8, {
        title: "Archive Status",
        items: [
          { id: "archive-status-1", label: "Scope", value: "Campaign reference" },
          { id: "archive-status-2", label: "Player Safety", value: "Spoilers marked per block" },
          { id: "archive-status-3", label: "Last Review", value: "Not set" },
          { id: "archive-status-4", label: "Maintainer", value: "DM" },
        ],
        keyValueRowDividers: true,
        keyValueDensity: "compact",
        layout: { colStart: 33, colSpan: 16, rowStart: 8, rowSpan: 12 },
        appearance: {
          surfaceStyle: "inset",
          backgroundTreatment: "scanline",
          backgroundColor: "#050A1C",
          accentColor: "#67D3FF",
          borderColor: "#1A456B",
          borderRadius: 12,
        },
        fluid: { widthMode: "fixed", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "compact" },
      }),
      createPresetBlock("calloutPanel", 22, {
        title: "Lore",
        html: "<p>Link major setting pages, histories, cultures, and locations here.</p>",
        layout: { colStart: 1, colSpan: 15, rowStart: 22, rowSpan: 10 },
        appearance: {
          surfaceStyle: "raised",
          backgroundColor: "#1B1327",
          accentColor: "#D6B7FF",
          borderColor: "#74579B",
          borderRadius: 14,
          glowIntensity: 8,
        },
      }),
      createPresetBlock("calloutPanel", 22, {
        title: "Rules",
        html: "<p>Collect rules references, rulings, card systems, and player-facing mechanics.</p>",
        layout: { colStart: 17, colSpan: 15, rowStart: 22, rowSpan: 10 },
        appearance: {
          surfaceStyle: "raised",
          backgroundColor: "#102019",
          accentColor: "#8FF0B8",
          borderColor: "#246B49",
          borderRadius: 14,
          glowIntensity: 8,
        },
      }),
      createPresetBlock("calloutPanel", 22, {
        title: "DM Records",
        html: "<p>Use restricted blocks for hidden notes, unresolved secrets, and session maintenance.</p>",
        layout: { colStart: 33, colSpan: 16, rowStart: 22, rowSpan: 10 },
        appearance: {
          surfaceStyle: "raised",
          backgroundColor: "#2A1604",
          accentColor: "#FFB84A",
          borderColor: "#8A5318",
          borderRadius: 14,
          glowIntensity: 12,
        },
        visibility: { assignedTo: [], mode: "spoiler" },
      }),
      createPresetBlock("referenceTable", 34, {
        title: "Featured Directory",
        columns: ["Page", "Type", "Status", "Notes"],
        rows: [
          { id: "archive-directory-1", cells: ["[[Important Location]]", "Location", "Needs review", "Short note"] },
          { id: "archive-directory-2", cells: ["[[Known Faction]]", "Faction", "Active", "Short note"] },
          { id: "archive-directory-3", cells: ["[[Rules Reference]]", "Rules", "Current", "Short note"] },
        ],
        tableDensity: "compact",
        tableStripedRows: true,
        tableStickyHeader: true,
        tableLinkedCells: true,
        layout: { colStart: 1, colSpan: 48, rowStart: 34, rowSpan: 18 },
        appearance: {
          surfaceStyle: "flat",
          backgroundColor: "#071126",
          accentColor: "#A7D7FF",
          borderColor: "#25446E",
          borderRadius: 8,
        },
        fluid: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "scrollX" },
      }),
    ],
  },
  {
    id: "preset-archive-navigation-grid",
    name: "Archive Navigation Grid",
    description: "A compact MediaWiki-style portal grid for category landing pages.",
    category: "Navigation",
    builtIn: true,
    previewLabel: "Section index grid",
    blocks: [
      createPresetBlock("heading", 1, {
        title: "Browse the Archive",
        subtitle: "Choose a category to begin",
        headingLevel: 2,
        layout: { colStart: 1, colSpan: 48, rowStart: 1, rowSpan: 5 },
        appearance: {
          surfaceStyle: "none",
          accentColor: "#8AB4FF",
          titleAlign: "center",
          bodyAlign: "center",
          borderStyle: "none",
        },
      }),
      ...(["Characters", "Locations", "Factions", "Items", "Rules", "Timeline"] as const).map((title, index) => createPresetBlock("calloutPanel", 7 + Math.floor(index / 3) * 12, {
        title,
        html: `<p>Add links and a short description for ${title.toLowerCase()} pages.</p>`,
        layout: {
          colStart: 1 + (index % 3) * 16,
          colSpan: 15,
          rowStart: 7 + Math.floor(index / 3) * 12,
          rowSpan: 10,
        },
        appearance: {
          surfaceStyle: "raised",
          backgroundTreatment: "gradient",
          backgroundColor: index % 2 === 0 ? "#08162E" : "#0B1A28",
          accentColor: index % 2 === 0 ? "#8AB4FF" : "#67D3FF",
          borderColor: "#284A7C",
          borderRadius: 12,
          shadowDepth: 2,
        },
        behavior: { includeInToc: true, overflowMode: "clip", mobileDensity: "compact", mobileFullWidth: true },
      })),
      createPresetBlock("wikiLinksList", 32, {
        title: "Fast Links",
        articleIds: [],
        wikiLinksDisplayMode: "chips",
        layout: { colStart: 1, colSpan: 48, rowStart: 32, rowSpan: 8 },
        appearance: {
          surfaceStyle: "flat",
          backgroundColor: "#071126",
          accentColor: "#A7D7FF",
          borderColor: "#25446E",
          borderRadius: 10,
        },
      }),
    ],
  },
  {
    id: "preset-urbanshade-operations-landing",
    name: "Operations Landing Page",
    description: "A dark technical landing page with hero copy, feature cards, and a numbered workflow.",
    category: "Landing Pages",
    builtIn: true,
    previewLabel: "Hero + features + process",
    blocks: [
      createPresetBlock("heading", 1, {
        title: "Operations Index",
        subtitle: "Field intelligence, active systems, and deployment priorities",
        headingLevel: 1,
        layout: { colStart: 1, colSpan: 30, rowStart: 1, rowSpan: 8 },
        appearance: {
          surfaceStyle: "glass",
          backgroundTreatment: "gradient",
          backgroundColor: "#08283A",
          accentColor: "#5CE8FF",
          borderColor: "#2CAFD2",
          borderRadius: 18,
          glowIntensity: 34,
          shadowDepth: 3,
        },
      }),
      createPresetBlock("calloutPanel", 1, {
        title: "Mission Brief",
        html: "<p>Summarize what this article tracks, who should use it, and which systems are currently active.</p>",
        layout: { colStart: 33, colSpan: 16, rowStart: 1, rowSpan: 8 },
        appearance: {
          surfaceStyle: "inset",
          backgroundTreatment: "terminal",
          backgroundColor: "#06150E",
          accentColor: "#54FF9B",
          borderColor: "#1E6F4B",
          borderRadius: 10,
          glowIntensity: 18,
        },
      }),
      ...(["Signals", "Assets", "Threats", "Response"] as const).map((title, index) => createPresetBlock("calloutPanel", 11, {
        title,
        html: `<p>Describe the ${title.toLowerCase()} layer, key metrics, and related pages.</p>`,
        layout: { colStart: 1 + index * 12, colSpan: 11, rowStart: 11, rowSpan: 11 },
        appearance: {
          surfaceStyle: "raised",
          backgroundTreatment: "scanline",
          backgroundColor: "#050A1C",
          accentColor: index % 2 === 0 ? "#67D3FF" : "#8FF0B8",
          borderColor: "#1A456B",
          borderRadius: 14,
          glowIntensity: 14,
          shadowDepth: 3,
        },
        behavior: { includeInToc: true, overflowMode: "clip", mobileDensity: "compact", mobileFullWidth: true },
      })),
      createPresetBlock("referenceTable", 25, {
        title: "Priority Matrix",
        columns: ["Priority", "Target", "Signal", "Action"],
        rows: [
          { id: "ops-matrix-1", cells: ["01", "[[Target Page]]", "High", "Investigate"] },
          { id: "ops-matrix-2", cells: ["02", "[[Asset Page]]", "Medium", "Monitor"] },
          { id: "ops-matrix-3", cells: ["03", "[[Threat Page]]", "Unknown", "Escalate"] },
        ],
        tableDensity: "compact",
        tableStripedRows: true,
        tableStickyHeader: true,
        tableLinkedCells: true,
        layout: { colStart: 1, colSpan: 31, rowStart: 25, rowSpan: 17 },
        appearance: {
          surfaceStyle: "flat",
          backgroundColor: "#071126",
          accentColor: "#A7D7FF",
          borderColor: "#25446E",
          borderRadius: 8,
        },
        fluid: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "scrollX" },
      }),
      createPresetBlock("keyValueBox", 25, {
        title: "Live Snapshot",
        items: [
          { id: "ops-snapshot-1", label: "Phase", value: "01 - Assess" },
          { id: "ops-snapshot-2", label: "Risk", value: "Unknown" },
          { id: "ops-snapshot-3", label: "Owner", value: "Not set" },
          { id: "ops-snapshot-4", label: "Next Check", value: "Not set" },
        ],
        keyValueDensity: "compact",
        keyValueRowDividers: true,
        layout: { colStart: 34, colSpan: 15, rowStart: 25, rowSpan: 17 },
        appearance: {
          surfaceStyle: "inset",
          backgroundTreatment: "scanline",
          backgroundColor: "#050A1C",
          accentColor: "#67D3FF",
          borderColor: "#1A456B",
          borderRadius: 12,
        },
      }),
    ],
  },
  {
    id: "preset-research-dossier",
    name: "Research Dossier",
    description: "A technical dossier layout for entities, facilities, experiments, or classified lore.",
    category: "Dossiers",
    builtIn: true,
    previewLabel: "Profile + warning + logs",
    blocks: [
      createPresetBlock("keyValueBox", 1, {
        title: "Dossier",
        items: [
          { id: "dossier-1", label: "Designation", value: "" },
          { id: "dossier-2", label: "Class", value: "" },
          { id: "dossier-3", label: "Location", value: "" },
          { id: "dossier-4", label: "Clearance", value: "" },
          { id: "dossier-5", label: "Status", value: "" },
        ],
        keyValueDensity: "compact",
        keyValueRowDividers: true,
        layout: { colStart: 1, colSpan: 15, rowStart: 1, rowSpan: 22 },
        appearance: {
          surfaceStyle: "inset",
          backgroundTreatment: "terminal",
          backgroundColor: "#06150E",
          accentColor: "#54FF9B",
          borderColor: "#1E6F4B",
          borderRadius: 10,
          glowIntensity: 16,
        },
        fluid: { widthMode: "fixed", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "compact" },
      }),
      createPresetBlock("richText", 1, {
        title: "Summary",
        html: "<p>Write the player-safe summary here. Keep classification notes, observed behavior, and known history in separate restricted blocks if needed.</p>",
        layout: { colStart: 18, colSpan: 31, rowStart: 1, rowSpan: 13 },
        appearance: {
          surfaceStyle: "raised",
          backgroundColor: "#071126",
          accentColor: "#A7D7FF",
          borderColor: "#25446E",
          borderRadius: 12,
          shadowDepth: 2,
        },
      }),
      createPresetBlock("calloutPanel", 16, {
        title: "Containment / Warning",
        html: "<p>Add hazards, spoiler notices, or DM-only handling instructions here.</p>",
        layout: { colStart: 18, colSpan: 31, rowStart: 16, rowSpan: 7 },
        appearance: {
          surfaceStyle: "raised",
          backgroundColor: "#2A1604",
          accentColor: "#FFB84A",
          borderColor: "#8A5318",
          borderStyle: "double",
          borderRadius: 10,
          glowIntensity: 24,
        },
      }),
      createPresetBlock("referenceTable", 25, {
        title: "Observation Log",
        columns: ["Entry", "Observer", "Finding", "Follow-up"],
        rows: [
          { id: "dossier-log-1", cells: ["01", "Name", "Initial finding", "Next action"] },
          { id: "dossier-log-2", cells: ["02", "Name", "New behavior", "Next action"] },
        ],
        tableDensity: "compact",
        tableStripedRows: true,
        tableStickyHeader: true,
        layout: { colStart: 1, colSpan: 33, rowStart: 25, rowSpan: 18 },
        appearance: {
          surfaceStyle: "flat",
          backgroundColor: "#071126",
          accentColor: "#A7D7FF",
          borderColor: "#25446E",
          borderRadius: 8,
        },
        fluid: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "scrollX" },
      }),
      createPresetBlock("wikiLinksList", 25, {
        title: "Connected Files",
        articleIds: [],
        wikiLinksDisplayMode: "cards",
        layout: { colStart: 36, colSpan: 13, rowStart: 25, rowSpan: 18 },
        appearance: {
          surfaceStyle: "glass",
          backgroundColor: "#08283A",
          accentColor: "#5CE8FF",
          borderColor: "#2CAFD2",
          borderRadius: 14,
          glowIntensity: 18,
        },
      }),
    ],
  },
  {
    id: "component-npc-profile-card",
    name: "NPC Profile Component",
    description: "A compact reusable NPC profile with traits and relationship hooks.",
    category: "Components",
    builtIn: true,
    previewLabel: "NPC profile",
    blocks: [
      createPresetBlock("keyValueBox", 1, {
        title: "NPC Profile",
        items: [
          { id: "npc-profile-name", label: "Name", value: "" },
          { id: "npc-profile-role", label: "Role", value: "" },
          { id: "npc-profile-affiliation", label: "Affiliation", value: "" },
          { id: "npc-profile-disposition", label: "Disposition", value: "" },
        ],
        keyValueDensity: "compact",
        keyValueRowDividers: true,
        layout: { colStart: 1, colSpan: 16, rowStart: 1, rowSpan: 16 },
        appearance: { surfaceStyle: "inset", backgroundTreatment: "scanline", backgroundColor: "#071126", accentColor: "#8AB4FF", borderColor: "#25446E", borderRadius: 12 },
      }),
      createPresetBlock("richText", 1, {
        title: "Personality and Hooks",
        html: "<p>Describe how this NPC speaks, what they want, and what players can learn from them.</p>",
        layout: { colStart: 18, colSpan: 31, rowStart: 1, rowSpan: 16 },
        appearance: { surfaceStyle: "raised", backgroundColor: "#0B142B", accentColor: "#C7D6FF", borderColor: "#2F4F7D", borderRadius: 12 },
      }),
    ],
  },
  {
    id: "component-spell-showcase",
    name: "Spell Showcase Component",
    description: "A button-cycled spell list ready for spell level groups or magic types.",
    category: "Components",
    builtIn: true,
    previewLabel: "Tabbed spell showcase",
    blocks: createMagicSpellListBlocks(1),
  },
  {
    id: "quick-data-stat-block",
    name: "Quick Data: Stat Block",
    description: "Fast stat/reference box for NPCs, monsters, objects, or systems.",
    category: "Quick Data Blocks",
    builtIn: true,
    previewLabel: "Stats + notes",
    blocks: [
      createPresetBlock("keyValueBox", 1, {
        title: "Stat Block",
        items: [
          { id: "stat-block-hp", label: "HP", value: "" },
          { id: "stat-block-armor", label: "Armor", value: "" },
          { id: "stat-block-speed", label: "Speed", value: "" },
          { id: "stat-block-threat", label: "Threat", value: "" },
        ],
        keyValueDensity: "compact",
        keyValueRowDividers: true,
        layout: { colStart: 1, colSpan: 16, rowStart: 1, rowSpan: 14 },
      }),
      createPresetBlock("referenceTable", 1, {
        title: "Actions / Features",
        columns: ["Name", "Type", "Effect"],
        rows: [{ id: "stat-action-1", cells: ["Feature", "Passive", "Describe effect."] }],
        tableDensity: "compact",
        tableLinkedCells: true,
        layout: { colStart: 18, colSpan: 31, rowStart: 1, rowSpan: 14 },
      }),
    ],
  },
  {
    id: "quick-data-roll-table",
    name: "Quick Data: Roll Table",
    description: "A ready-to-fill random table for encounters, loot, rumors, or discoveries.",
    category: "Quick Data Blocks",
    builtIn: true,
    previewLabel: "d6 table",
    blocks: [
      createPresetBlock("referenceTable", 1, {
        title: "Roll Table",
        columns: ["Roll", "Result", "Notes"],
        rows: [
          { id: "roll-table-1", cells: ["1", "Result one", "Optional note"] },
          { id: "roll-table-2", cells: ["2", "Result two", "Optional note"] },
          { id: "roll-table-3", cells: ["3", "Result three", "Optional note"] },
          { id: "roll-table-4", cells: ["4", "Result four", "Optional note"] },
          { id: "roll-table-5", cells: ["5", "Result five", "Optional note"] },
          { id: "roll-table-6", cells: ["6", "Result six", "Optional note"] },
        ],
        tableDensity: "compact",
        tableStripedRows: true,
        layout: { colStart: 1, colSpan: 48, rowStart: 1, rowSpan: 20 },
        fluid: { widthMode: "fill", heightMode: "hug", keepAspectRatio: false, mobileBehavior: "scrollX" },
      }),
    ],
  },
  {
    id: "snap-layout-hero-sidebar-body",
    name: "Snap Layout: Hero + Sidebar + Body",
    description: "A full article starter with hero, sidebar profile, body area, and footer links.",
    category: "Snap Layouts",
    builtIn: true,
    previewLabel: "Hero/sidebar/body",
    blocks: [
      createPresetBlock("heading", 1, {
        title: "Article Hero",
        subtitle: "One-line article promise",
        headingLevel: 1,
        layout: { colStart: 1, colSpan: 48, rowStart: 1, rowSpan: 6 },
        appearance: { surfaceStyle: "raised", backgroundTreatment: "gradient", backgroundColor: "#08162E", accentColor: "#8AB4FF", borderColor: "#284A7C", borderRadius: 14, titleAlign: "center", bodyAlign: "center" },
      }),
      createPresetBlock("keyValueBox", 9, {
        title: "At a Glance",
        items: [
          { id: "snap-glance-1", label: "Type", value: "" },
          { id: "snap-glance-2", label: "Region", value: "" },
          { id: "snap-glance-3", label: "Status", value: "" },
        ],
        layout: { colStart: 1, colSpan: 14, rowStart: 9, rowSpan: 18 },
      }),
      createPresetBlock("richText", 9, {
        title: "Main Article",
        html: "<p>Write the core article text here.</p>",
        layout: { colStart: 17, colSpan: 32, rowStart: 9, rowSpan: 24 },
      }),
      createPresetBlock("wikiLinksList", 35, {
        title: "Related Pages",
        articleIds: [],
        wikiLinksDisplayMode: "chips",
        layout: { colStart: 1, colSpan: 48, rowStart: 35, rowSpan: 8 },
      }),
    ],
  },
  {
    id: "snap-layout-three-column-reference",
    name: "Snap Layout: Three Column Reference",
    description: "Three balanced columns for dense indexes, rules notes, or comparison pages.",
    category: "Snap Layouts",
    builtIn: true,
    previewLabel: "3-column article",
    blocks: [
      ...(["Column One", "Column Two", "Column Three"] as const).map((title, index) => createPresetBlock("calloutPanel", 1, {
        title,
        html: `<p>Add ${title.toLowerCase()} content here.</p>`,
        layout: { colStart: 1 + index * 16, colSpan: 15, rowStart: 1, rowSpan: 18 },
        appearance: { surfaceStyle: "raised", backgroundColor: index % 2 === 0 ? "#071126" : "#0B1A28", accentColor: index % 2 === 0 ? "#8AB4FF" : "#8FF0B8", borderColor: "#25446E", borderRadius: 12 },
      })),
      createPresetBlock("referenceTable", 22, {
        title: "Comparison Table",
        columns: ["Entry", "Column One", "Column Two", "Column Three"],
        rows: [{ id: "snap-comparison-1", cells: ["Example", "Detail", "Detail", "Detail"] }],
        tableDensity: "compact",
        tableStripedRows: true,
        layout: { colStart: 1, colSpan: 48, rowStart: 22, rowSpan: 16 },
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
    compactHeaderLayout: settings?.compactHeaderLayout === true,
    articleChromeLayouts,
  };
}

export function createDefaultBlock(type: WikiBlockType, rowStart = 1): WikiArticleBlock {
  const base = DEFAULT_LAYOUTS[type];
  return normalizeWikiArticleBlock({
    id: `wiki-block-${uid()}`,
    type,
    title: type === "heading" ? "Heading" : type === "tabbedReference" ? "Tiered Reference" : type === "divider" ? "" : "",
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
      padding: type === "divider" || type === "lineBox" || type === "spacer" ? "tight" : "normal",
      borderStyle: type === "divider" || type === "lineBox" ? "none" : "solid",
      borderWidth: type === "divider" || type === "lineBox" || type === "spacer" ? 0 : 1,
      borderRadius: type === "divider" || type === "lineBox" || type === "spacer" ? 0 : 10,
      opacity: 100,
      glowIntensity: 0,
      shadowDepth: type === "divider" || type === "lineBox" || type === "spacer" ? 0 : 1,
      titleAlign: "left",
      bodyAlign: "left",
      backgroundTreatment: "solid",
      dividerStyle: type === "divider" || type === "lineBox" ? "line" : undefined,
      dividerLabelPosition: type === "divider" ? "center" : undefined,
      surfaceStyle: type === "divider" || type === "lineBox" || type === "spacer" ? "none" : "flat",
    },
    behavior: {
      collapsible: false,
      defaultCollapsed: false,
      overflowMode: "clip",
      includeInToc: type === "heading",
      mobileDensity: "comfortable",
      mobileFullWidth: true,
      clickAction: "none",
    },
    visibility: {
      assignedTo: [],
      mode: "visible",
      revealLabel: "",
      revealNote: "",
      revealAfter: "",
    },
    style: type === "calloutPanel" || type === "spoilerBlock" ? "neutral" : "blank",
    headingLevel: type === "heading" ? 2 : undefined,
    cropMode: type === "image" ? "cover" : undefined,
    imageFocalX: type === "image" ? 50 : undefined,
    imageFocalY: type === "image" ? 50 : undefined,
    imageCaptionPlacement: type === "image" ? "below" : undefined,
    imageFrameStyle: type === "image" ? "thin" : undefined,
    imageCaptionStyle: type === "image" ? "plain" : undefined,
    dividerLabel: type === "divider" ? "" : undefined,
    lineOrientation: type === "lineBox" ? "horizontal" : undefined,
    lineThickness: type === "lineBox" ? 2 : undefined,
    spacerHeight: type === "spacer" ? 1 : undefined,
    columns: type === "referenceTable" ? ["Name", "Type", "Notes"] : undefined,
    rows: type === "referenceTable" ? [{ id: `row-${uid()}`, cells: ["", "", ""] }] : undefined,
    tabs: type === "tabbedReference" ? createDefaultTabbedReferenceTabs() : undefined,
    tableDensity: type === "referenceTable" || type === "tabbedReference" ? "comfortable" : undefined,
    tableStripedRows: type === "referenceTable" || type === "tabbedReference" ? false : undefined,
    tableStickyHeader: type === "referenceTable" || type === "tabbedReference" ? false : undefined,
    tableLinkedCells: type === "referenceTable" || type === "tabbedReference" ? true : undefined,
    items: type === "keyValueBox" ? [{ id: `item-${uid()}`, label: "Label", value: "Value" }] : undefined,
    keyValueDensity: type === "keyValueBox" ? "comfortable" : undefined,
    keyValueLabelAlign: type === "keyValueBox" ? "left" : undefined,
    keyValueRowDividers: type === "keyValueBox" ? false : undefined,
    articleIds: type === "wikiLinksList" ? [] : undefined,
    wikiLinksDisplayMode: type === "wikiLinksList" ? "list" : undefined,
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
  const behavior = block.behavior || ({} as WikiBlockBehavior);
  const normalizedColSpan = clampInt(layout.colSpan, base.minColSpan || 1, WIKI_BLOCK_COLUMNS);
  const normalizedColStart = clampInt(layout.colStart, 1, Math.max(1, WIKI_BLOCK_COLUMNS - normalizedColSpan + 1));
  return {
    id: block.id || `wiki-block-${uid()}`,
    type,
    title: block.title || "",
    subtitle: block.subtitle || "",
    html: block.html || "",
    layout: {
      colStart: normalizedColStart,
      colSpan: normalizedColSpan,
      rowStart: Math.max(1, layout.rowStart || 1),
      rowSpan: Math.max(base.minRowSpan || 1, layout.rowSpan || base.rowSpan || WIKI_BLOCK_DEFAULT_ROW_SPAN),
      minColSpan: base.minColSpan,
      minRowSpan: base.minRowSpan,
    },
    appearance: {
      padding: block.appearance?.padding || (type === "divider" || type === "lineBox" || type === "spacer" ? "tight" : "normal"),
      borderStyle: block.appearance?.borderStyle || (type === "divider" || type === "lineBox" ? "none" : "solid"),
      borderWidth: typeof block.appearance?.borderWidth === "number" ? clampInt(block.appearance.borderWidth, 0, 8) : (type === "divider" || type === "lineBox" || type === "spacer" ? 0 : 1),
      borderRadius: typeof block.appearance?.borderRadius === "number" ? clampInt(block.appearance.borderRadius, 0, 36) : (type === "divider" || type === "lineBox" || type === "spacer" ? 0 : 10),
      opacity: typeof block.appearance?.opacity === "number" ? clampInt(block.appearance.opacity, 10, 100) : 100,
      glowIntensity: typeof block.appearance?.glowIntensity === "number" ? clampInt(block.appearance.glowIntensity, 0, 100) : 0,
      shadowDepth: typeof block.appearance?.shadowDepth === "number" ? clampInt(block.appearance.shadowDepth, 0, 5) : (type === "divider" || type === "lineBox" || type === "spacer" ? 0 : 1),
      titleColor: block.appearance?.titleColor,
      bodyColor: block.appearance?.bodyColor,
      titleAlign: block.appearance?.titleAlign || "left",
      bodyAlign: block.appearance?.bodyAlign || "left",
      backgroundTreatment: block.appearance?.backgroundTreatment || "solid",
      dividerStyle: block.appearance?.dividerStyle || (type === "divider" || type === "lineBox" ? "line" : undefined),
      dividerLabelPosition: block.appearance?.dividerLabelPosition || (type === "divider" ? "center" : undefined),
      surfaceStyle: block.appearance?.surfaceStyle || (type === "divider" || type === "lineBox" || type === "spacer" ? "none" : "flat"),
      accentColor: block.appearance?.accentColor,
      backgroundColor: block.appearance?.backgroundColor,
      borderColor: block.appearance?.borderColor,
      stylePresetId: block.appearance?.stylePresetId,
    },
    behavior: {
      collapsible: !!behavior.collapsible,
      defaultCollapsed: !!behavior.defaultCollapsed,
      overflowMode: behavior.overflowMode || "clip",
      includeInToc: typeof behavior.includeInToc === "boolean" ? behavior.includeInToc : type === "heading",
      anchorLabel: behavior.anchorLabel || "",
      mobileDensity: behavior.mobileDensity || "comfortable",
      mobileFullWidth: typeof behavior.mobileFullWidth === "boolean" ? behavior.mobileFullWidth : true,
      clickAction: behavior.clickAction || "none",
    },
    visibility: {
      assignedTo: Array.isArray(visibility.assignedTo) ? visibility.assignedTo : [],
      mode: visibility.mode || (Array.isArray(visibility.assignedTo) && visibility.assignedTo.length > 0 ? "spoiler" : "visible"),
      revealLabel: typeof visibility.revealLabel === "string" ? visibility.revealLabel : "",
      revealNote: typeof visibility.revealNote === "string" ? visibility.revealNote : "",
      revealAfter: typeof visibility.revealAfter === "string" ? visibility.revealAfter : "",
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
    imageFrameStyle: block.imageFrameStyle || (type === "image" ? "thin" : undefined),
    imageCaptionStyle: block.imageCaptionStyle || (type === "image" ? "plain" : undefined),
    cropMode: block.cropMode || (type === "image" ? "cover" : "contain"),
    headingLevel: (block.headingLevel || (type === "heading" ? 2 : undefined)) as 1 | 2 | 3 | 4 | undefined,
    dividerLabel: block.dividerLabel || "",
    lineOrientation: block.lineOrientation === "vertical" ? "vertical" : type === "lineBox" ? "horizontal" : undefined,
    lineThickness: type === "lineBox" ? (typeof block.lineThickness === "number" ? clampInt(block.lineThickness, 1, 12) : 2) : undefined,
    spacerHeight: Math.max(1, block.spacerHeight || 1),
    columns: Array.isArray(block.columns) ? block.columns : type === "referenceTable" ? ["Name", "Type", "Notes"] : undefined,
    rows: Array.isArray(block.rows)
      ? normalizeReferenceRows(block.rows, Array.isArray(block.columns) ? block.columns.length : 1)
      : type === "referenceTable"
        ? [{ id: `row-${uid()}`, cells: ["", "", ""] }]
        : undefined,
    tabs: type === "tabbedReference" ? normalizeTabbedReferenceTabs(block.tabs) : undefined,
    activeTabId: block.activeTabId || "",
    tableDensity: block.tableDensity || (type === "referenceTable" || type === "tabbedReference" ? "comfortable" : undefined),
    tableStripedRows: typeof block.tableStripedRows === "boolean" ? block.tableStripedRows : type === "referenceTable" || type === "tabbedReference" ? false : undefined,
    tableStickyHeader: typeof block.tableStickyHeader === "boolean" ? block.tableStickyHeader : type === "referenceTable" || type === "tabbedReference" ? false : undefined,
    tableLinkedCells: typeof block.tableLinkedCells === "boolean" ? block.tableLinkedCells : type === "referenceTable" || type === "tabbedReference" ? true : undefined,
    items: Array.isArray(block.items)
      ? block.items.map((item) => ({ id: item.id || `item-${uid()}`, label: item.label || "", value: item.value || "" }))
      : type === "keyValueBox"
        ? []
        : undefined,
    keyValueDensity: block.keyValueDensity || (type === "keyValueBox" ? "comfortable" : undefined),
    keyValueLabelAlign: block.keyValueLabelAlign || (type === "keyValueBox" ? "left" : undefined),
    keyValueRowDividers: typeof block.keyValueRowDividers === "boolean" ? block.keyValueRowDividers : type === "keyValueBox" ? false : undefined,
    articleIds: Array.isArray(block.articleIds) ? block.articleIds : type === "wikiLinksList" ? [] : undefined,
    wikiLinksDisplayMode: block.wikiLinksDisplayMode || (type === "wikiLinksList" ? "list" : undefined),
    mobilePriority: typeof block.mobilePriority === "number" ? block.mobilePriority : undefined,
    mobileCollapseMode: block.mobileCollapseMode || (type === "referenceTable" || type === "tabbedReference" ? "scrollX" : "stack"),
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
  const presetGroupId = sourceBlocks.length > 1 ? `wiki-group-${uid()}` : "";

  return sourceBlocks.map((block) => normalizeWikiArticleBlock({
    ...block,
    id: `wiki-block-${uid()}`,
    layoutGroupId: block.layoutGroupId || presetGroupId,
    layoutGroupName: block.layoutGroupName || (presetGroupId ? preset.name : ""),
    layoutGroupMode: block.layoutGroupMode || "manual",
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

export function resolveWikiBlockCollisions(blocks: WikiArticleBlock[], priorityBlockIds?: string | string[]): WikiArticleBlock[] {
  const priorityIds = new Set(Array.isArray(priorityBlockIds) ? priorityBlockIds : priorityBlockIds ? [priorityBlockIds] : []);
  const sorted = [...blocks].sort((a, b) => {
    if (priorityIds.size > 0) {
      const aPriority = priorityIds.has(a.id);
      const bPriority = priorityIds.has(b.id);
      if (aPriority && !bPriority) return -1;
      if (!aPriority && bPriority) return 1;
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
    if (block.type === "calloutPanel" || block.type === "spoilerBlock" || block.type === "keyValueBox" || block.type === "referenceTable" || block.type === "tabbedReference" || block.type === "wikiLinksList") {
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
    case "tabbedReference":
      return (block.tabs || []).map((tab) => {
        const heading = `<h3>${escapeHtml(tab.title || tab.label)}</h3>`;
        return `${heading}${buildTableHtml(tab.columns || [], tab.rows || [])}${tab.html || ""}`;
      }).join("");
    case "keyValueBox":
      return buildKeyValueHtml(block.title, block.items || []);
    case "wikiLinksList":
      return buildWikiLinksListHtml(block.title, block.articleIds || []);
    case "divider":
      return `<hr />${block.dividerLabel ? `<p>${escapeHtml(block.dividerLabel)}</p>` : ""}`;
    case "lineBox":
      return block.lineOrientation === "vertical"
        ? `<div aria-hidden="true" style="width:${Math.max(1, block.lineThickness || 2)}px;min-height:120px;border-left:${Math.max(1, block.lineThickness || 2)}px solid currentColor;"></div>`
        : `<hr style="border-width:${Math.max(1, block.lineThickness || 2)}px 0 0 0;" />`;
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
    ...(block.tabs || []).flatMap((tab) => [
      tab.label,
      tab.title,
      stripHtml(tab.html || ""),
      ...(tab.columns || []),
      ...(tab.rows || []).flatMap((row) => row.cells),
    ]),
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
