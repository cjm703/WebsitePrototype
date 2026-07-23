import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Navigate, useBlocker, useNavigate, useParams } from "react-router";
import { Resizable } from "re-resizable";
import { retro } from "./retro-styles";
import { RenderFormattedText, refreshWikiArticleLookup } from "./render-text";
import { RichTextEditor } from "./rich-text-editor";
import { ImageStoragePickerModal } from "./image-storage-picker";
import { PAGE_ICONS, getPageIcon } from "./page-icons";
import {
  ArrowLeft, Save, Globe, FileText, Plus, Trash2, X,
  ChevronRight, Star, Clock, FolderOpen, Tag,
  AlertTriangle, Eye, EyeOff, Shield,
  Palette, Info, Settings,
  Lock, Unlock, Layers,
  GripVertical, ChevronUp, ChevronDown, Users,
  Link2, ImageIcon, BookOpen, Undo2, Redo2,
  Network, Hash, Download, Upload, History, Keyboard, Search,
} from "lucide-react";
import { TemplatePickerModal, TemplateManagerModal, hydrateWikiTemplates } from "./wiki-templates";
import type { WikiTemplate } from "./wiki-templates";
import { WikiLinkDialog } from "./wiki-link-dialog";
import { renderTypedField, type TagFieldDef } from "./tag-field-renderer";
import { safeGetItem, safeRemoveItem, safeGetJson, safeSetJson } from "./safe-storage";
import { appStore } from "@/lib/app-store";
import {
  ApiRequestError,
  clearDMImageStorageFallbackState,
  getDMImageStorageFallbackState,
  getWikiBlockPresetsFallbackState,
  loadDMImageStorage,
  loadWikiBootstrap,
  loadWikiDrafts,
  saveDMImageStorage,
  saveWikiArticleRevisions,
  saveWikiBlockPresets,
  saveWikiCustomPanelStyles,
  saveWikiDrafts,
  saveWikiBlockStylePresets,
  saveWikiSite,
  saveWikiSites,
} from "@/lib/player-state-api";
import {
  getWikiPanelMediaPosition,
  getWikiPanelPlacement,
  getWikiPanelWidth,
  groupBodyPanelsIntoRows,
  migrateWikiSectionsToPanels,
  normalizeWikiPanel,
  normalizeWikiPanels,
  type WikiPanelMediaPosition,
  type WikiPanelPlacement,
  type WikiPanelWidth,
} from "@/lib/wiki-panel-layout";
import {
  BUILTIN_WIKI_BLOCK_PRESETS,
  DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS,
  WIKI_BLOCK_COLUMNS,
  WIKI_BLOCK_LAYOUT_VERSION,
  WIKI_CANVAS_PRESETS,
  clampWikiBlockLayout,
  collectWikiBlockHtmlStrings,
  compactWikiArticleBlocks,
  compareWikiBlocksForLayout,
  createDefaultBlock,
  createMagicSpellArticleBlocks,
  createMagicSpellListBlocks,
  getNextWikiBlockRow,
  getWikiBlockLayoutBounds,
  getWikiBlockHtml,
  instantiateWikiBlockPreset,
  migrateLegacyArticleToBlocks,
  normalizeWikiArticleBlock,
  normalizeWikiArticleBlocks,
  normalizeWikiBlockPreset,
  normalizeWikiBlockPresets,
  normalizeWikiCanvasSettings,
  placeWikiBlock,
  resolveWikiBlockCollisions,
  serializeWikiBlocksToLegacyContent,
  type WikiArticleBlock,
  type WikiArticleChromeField,
  type WikiArticleRevision,
  type WikiBlockLayout,
  type WikiBlockPreset,
  type WikiBlockStylePreset,
  type WikiBlockType,
  type WikiCanvasSettings,
} from "@/lib/wiki-article-blocks";
import {
  getInverseWikiRelationshipType,
  WIKI_HIERARCHY_RELATIONSHIP_TYPES,
  WIKI_RELATIONSHIP_TYPES,
} from "@/lib/wiki-article-relationships";
import type { TagField, TagDefinition, PlayerData, StoredImageAsset } from "./types";
import {
  IMAGE_STORAGE_LOCAL_KEY,
  IMAGE_STORAGE_UPDATED_EVENT,
  createStoredImageAssetsFromFiles,
  mergeStoredImageAssets,
} from "@/lib/image-storage";
import { DISPLAY_CONTENTS, S_ACCENT, S_DIM, S_LINK, S_WARN, S_RED, S_SUBTLE, S_TEXT, S_MUTED, S_GREEN_BTN } from "./shared-styles";

// Types mirrored from dm-area / inet-page.

interface PageSection {
  id: string;
  heading: string;
  body: string;
}

interface MarqueeSelectionState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface SubCategory {
  id: string;
  name: string;
  type: "folder" | "article";
  articleId?: string;
  children: SubCategory[];
}

interface WikiArticleRelationship {
  id: string;
  type: string;
  targetArticleId: string;
  note?: string;
}

interface WikiPanel {
  id: string;
  title: string;
  subtitle?: string;
  content: string;
  assignedTo: string[]; // player ids - empty = visible to all
  visibilityMode?: "spoiler" | "hidden"; // how restriction manifests: spoiler = click to reveal, hidden = invisible
  collapsed?: boolean;
  style?: string;
  placement?: WikiPanelPlacement;
  width?: WikiPanelWidth;
  mediaUrl?: string;
  mediaCaption?: string;
  mediaAlt?: string;
  mediaPosition?: WikiPanelMediaPosition;
}

interface CustomPanelStyle {
  id: string;
  label: string;
  accent: string;
  bg: string;
  border: string;
}

interface SitePage {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
  subcategories: SubCategory[];
  dateAdded: string;
  createdAt?: string;
  updatedAt?: string;
  serverUpdatedAt?: string;
  body: string;
  subtitle: string;
  marqueeText: string;
  footerText: string;
  sections: PageSection[];
  bgColor: string;
  headerColor: string;
  accentColor: string;
  textColor: string;
  fontFamily: string;
  headerAlign: "left" | "center" | "right";
  pageIcon: string;
  pageIconUrl: string;
  bodyTitle: string;
  bodySubtitle: string;
  underConstruction: boolean;
  showHitCounter: boolean;
  showDividers: boolean;
  hitCount: number;
  infobox: { label: string; value: string }[];
  articleQuality: "featured" | "good" | "start" | "stub" | "draft";
  tags: string[];
  relatedArticleIds: string[];
  seeAlso: string[];
  disambiguationNote: string;
  references: string[];
  lastEditSummary: string;
  panels?: WikiPanel[];
  layoutVersion?: number;
  blocks?: WikiArticleBlock[];
  canvasSettings?: WikiCanvasSettings;
  wikiTags?: string[];
  wikiTagFields?: Record<string, string>;
  playerVisibility?: Record<string, "visible" | "spoiler" | "hidden">;
  relationships?: WikiArticleRelationship[];
}

type WikiTagField = TagField;
type WikiTagDefinition = TagDefinition;
type EditorCanvasMode = "edit" | "clean" | "player";
type ResponsiveFrameMode = "desktop" | "tablet" | "mobile";
type SitePageRevision = WikiArticleRevision<SitePage>;

// Inline editor helpers.
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function blockBorderCss(
  borderStyle: WikiArticleBlock["appearance"]["borderStyle"] | undefined,
  borderColor: string,
  borderWidth = 1,
) {
  if (borderStyle === "none" || borderWidth <= 0) return "none";
  return `${borderWidth}px ${borderStyle || "solid"} ${borderColor}`;
}

function blockSurfaceBackground(
  surfaceStyle: WikiArticleBlock["appearance"]["surfaceStyle"] | undefined,
  backgroundColor: string,
  accentColor: string,
  backgroundTreatment: WikiArticleBlock["appearance"]["backgroundTreatment"] | undefined = "solid",
) {
  const canTint = /^#[0-9a-f]{6}$/i.test(backgroundColor);
  const lighter = canTint ? lighten(backgroundColor, 10) : backgroundColor;
  const darker = canTint ? darken(backgroundColor, 8) : backgroundColor;
  const deep = canTint ? darken(backgroundColor, 14) : backgroundColor;
  const soft = canTint ? lighten(backgroundColor, 5) : backgroundColor;
  const glassBase = canTint ? `${backgroundColor}D9` : backgroundColor;
  const glassEnd = canTint ? `${backgroundColor}E6` : backgroundColor;
  const flatEnd = canTint ? darken(backgroundColor, 4) : backgroundColor;
  if (backgroundTreatment === "none" || surfaceStyle === "none") return "transparent";
  if (backgroundTreatment === "terminal") {
    return `linear-gradient(180deg, rgba(255,255,255,0.03), transparent 34%), repeating-linear-gradient(180deg, transparent 0 7px, ${accentColor}12 8px), ${backgroundColor}`;
  }
  if (backgroundTreatment === "scanline") {
    return `repeating-linear-gradient(180deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px), linear-gradient(180deg, ${deep} 0%, ${backgroundColor} 65%, ${soft} 100%)`;
  }
  switch (surfaceStyle) {
    case "glass":
      return `linear-gradient(135deg, ${glassBase} 0%, rgba(255,255,255,0.08) 48%, ${glassEnd} 100%)`;
    case "raised":
      return `linear-gradient(180deg, ${lighter} 0%, ${backgroundColor} 58%, ${darker} 100%)`;
    case "inset":
      return `linear-gradient(180deg, ${deep} 0%, ${backgroundColor} 62%, ${soft} 100%)`;
    case "none":
      return "transparent";
    default:
      return backgroundTreatment === "gradient"
        ? `linear-gradient(180deg, ${lighter} 0%, ${backgroundColor} 60%, ${darker} 100%)`
        : `linear-gradient(180deg, ${backgroundColor} 0%, ${flatEnd} 100%)`;
  }
}

function blockSurfaceShadow(
  surfaceStyle: WikiArticleBlock["appearance"]["surfaceStyle"] | undefined,
  borderColor: string,
  accentColor: string,
  selected = false,
  shadowDepth = 1,
  glowIntensity = 0,
) {
  const selectedRing = selected ? `0 0 0 1px ${accentColor}` : "";
  const depth = Math.max(0, Math.min(5, shadowDepth));
  const glow = Math.max(0, Math.min(100, glowIntensity));
  const glowCss = glow > 0 ? `0 0 ${Math.round(8 + glow * 0.34)}px ${accentColor}${Math.round(18 + glow * 0.52).toString(16).padStart(2, "0")}` : "";
  const dropCss = depth > 0 ? `0 ${Math.round(5 + depth * 4)}px ${Math.round(12 + depth * 5)}px rgba(0,0,0,${Math.min(0.58, 0.18 + depth * 0.07)})` : "";
  const joinShadows = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(", ") || "none";
  switch (surfaceStyle) {
    case "raised":
      return joinShadows(selectedRing, "inset 0 1px 0 rgba(255,255,255,0.16)", dropCss, `0 2px 0 ${borderColor}99`, glowCss);
    case "inset":
      return joinShadows(selectedRing, `inset 0 ${Math.round(3 + depth)}px ${Math.round(10 + depth * 3)}px rgba(0,0,0,0.62)`, `inset 0 0 0 1px ${borderColor}88`, glowCss);
    case "glass":
      return joinShadows(selectedRing, "inset 0 1px 0 rgba(255,255,255,0.18)", dropCss, `0 0 24px ${accentColor}24`, glowCss);
    case "none":
      return joinShadows(selectedRing, glow > 0 ? `0 0 ${Math.round(8 + glow * 0.28)}px ${accentColor}55` : "");
    default:
      return joinShadows(selectedRing, dropCss, glowCss);
  }
}

function dividerLineElement(
  dividerStyle: WikiArticleBlock["appearance"]["dividerStyle"] | undefined,
  borderColor: string,
  accentColor: string,
) {
  const style = dividerStyle || "line";
  if (style === "notched") {
    return (
      <div className="flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${borderColor}, ${accentColor})` }} />
        <div style={{ width: 8, height: 8, transform: "rotate(45deg)", border: `1px solid ${accentColor}`, background: `${accentColor}33` }} />
        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${accentColor}, ${borderColor}, transparent)` }} />
      </div>
    );
  }
  if (style === "double") {
    return (
      <div className="space-y-1">
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${borderColor}, transparent)` }} />
      </div>
    );
  }
  return (
    <div
      style={{
        height: style === "glow" ? 2 : 1,
        borderTop: style === "dashed" ? `1px dashed ${accentColor}` : undefined,
        background: style === "dashed" ? "transparent" : `linear-gradient(90deg, ${borderColor}, ${accentColor}, ${borderColor})`,
        boxShadow: style === "glow" ? `0 0 16px ${accentColor}` : undefined,
      }}
    />
  );
}

function lineBoxElement(
  orientation: WikiArticleBlock["lineOrientation"] | undefined,
  dividerStyle: WikiArticleBlock["appearance"]["dividerStyle"] | undefined,
  borderColor: string,
  accentColor: string,
  thickness = 2,
) {
  const isVertical = orientation === "vertical";
  const style = dividerStyle || "line";
  const size = Math.max(1, Math.min(12, thickness));
  const commonWrapper: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  };
  const primaryLine: React.CSSProperties = isVertical
    ? {
        width: style === "glow" ? Math.max(size, 2) : size,
        height: "100%",
        minHeight: 12,
        borderLeft: style === "dashed" ? `${size}px dashed ${accentColor}` : undefined,
        background: style === "dashed" ? "transparent" : `linear-gradient(180deg, ${borderColor}, ${accentColor}, ${borderColor})`,
        boxShadow: style === "glow" ? `0 0 16px ${accentColor}` : undefined,
      }
    : {
        height: style === "glow" ? Math.max(size, 2) : size,
        width: "100%",
        minWidth: 12,
        borderTop: style === "dashed" ? `${size}px dashed ${accentColor}` : undefined,
        background: style === "dashed" ? "transparent" : `linear-gradient(90deg, ${borderColor}, ${accentColor}, ${borderColor})`,
        boxShadow: style === "glow" ? `0 0 16px ${accentColor}` : undefined,
      };

  if (style === "double") {
    return (
      <div style={{ ...commonWrapper, flexDirection: isVertical ? "row" : "column", gap: Math.max(3, size) }}>
        <div style={isVertical ? { width: size, height: "100%", background: accentColor } : { height: size, width: "100%", background: accentColor }} />
        <div style={isVertical ? { width: size, height: "100%", background: borderColor } : { height: size, width: "100%", background: borderColor }} />
      </div>
    );
  }

  if (style === "notched") {
    return (
      <div style={{ ...commonWrapper, flexDirection: isVertical ? "column" : "row", gap: 8 }}>
        <div style={isVertical ? { width: size, flex: 1, background: `linear-gradient(180deg, transparent, ${borderColor}, ${accentColor})` } : { height: size, flex: 1, background: `linear-gradient(90deg, transparent, ${borderColor}, ${accentColor})` }} />
        <div style={{ width: 8, height: 8, transform: "rotate(45deg)", border: `1px solid ${accentColor}`, background: `${accentColor}33`, flex: "0 0 auto" }} />
        <div style={isVertical ? { width: size, flex: 1, background: `linear-gradient(180deg, ${accentColor}, ${borderColor}, transparent)` } : { height: size, flex: 1, background: `linear-gradient(90deg, ${accentColor}, ${borderColor}, transparent)` }} />
      </div>
    );
  }

  return (
    <div style={commonWrapper}>
      <div style={primaryLine} />
    </div>
  );
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const normalizeComparableWikiUrl = (value: string) => value.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
const legacyDateToIso = (value: string) => {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
};
const getArticleChromeFieldLabel = (field: WikiArticleChromeField) =>
  field === "title" ? "Title" : field === "subtitle" ? "Subtitle" : "Description";
function reorder<T>(list: T[], fromIdx: number, toIdx: number): T[] {
  const next = [...list];
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);
  return next;
}

function isEditableEventTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

const DATE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PAGE_FONTS = [
  { label: "Tahoma", value: "'Tahoma', 'Verdana', sans-serif" },
  { label: "Verdana", value: "'Verdana', 'Tahoma', sans-serif" },
  { label: "Arial", value: "'Arial', 'Helvetica', sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', 'Georgia', serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Comic Sans", value: "'Comic Sans MS', cursive" },
  { label: "Georgia", value: "'Georgia', serif" },
  { label: "Impact", value: "'Impact', sans-serif" },
];

const BUILTIN_PANEL_STYLES: { id: string; label: string; accent: string; bg: string; border: string }[] = [
  { id: "blank", label: "Blank", accent: "#5A6A8A", bg: "transparent", border: "#1A2A4B" },
  { id: "neutral", label: "Neutral", accent: "#7A8AAA", bg: "#0A0A2A", border: "#2A3A5B" },
  { id: "info", label: "Info", accent: "#4A9AFF", bg: "#0A1A3A", border: "#1A3A6B" },
  { id: "warning", label: "Warning", accent: "#FFAA4A", bg: "#1A1A0A", border: "#3A3A1A" },
  { id: "lore", label: "Lore", accent: "#9A7ABB", bg: "#1A0A2A", border: "#2A1A4B" },
  { id: "secret", label: "Secret", accent: "#FF6A6A", bg: "#1A0A0A", border: "#3A1A1A" },
];

const DEFAULT_STYLE = {
  bgColor: "#0C0C2E",
  headerColor: "#0E0E35",
  accentColor: "#4A7BFF",
  textColor: "#B0C0E0",
  fontFamily: "'Tahoma', 'Verdana', sans-serif",
};

const WIKI_BLOCK_PRESETS_LOCAL_KEY = "inet-wiki-block-presets";
const WIKI_BLOCK_STYLE_PRESETS_LOCAL_KEY = "inet-wiki-block-style-presets";
const WIKI_ARTICLE_REVISIONS_LOCAL_KEY = "inet-wiki-article-revisions";
const MAX_WIKI_REVISIONS_PER_ARTICLE = 25;
const RESPONSIVE_FRAME_OPTIONS: Record<ResponsiveFrameMode, { label: string; width: number; description: string }> = {
  desktop: { label: "Desktop", width: 0, description: "Authored fixed article frame" },
  tablet: { label: "Tablet", width: 900, description: "Stacked tablet reading frame" },
  mobile: { label: "Mobile", width: 430, description: "Single-column player frame" },
};

const BUILTIN_WIKI_BLOCK_STYLE_PRESETS: WikiBlockStylePreset[] = [
  {
    id: "style-terminal-panel",
    name: "Terminal Panel",
    description: "Dense green terminal readout with scanline depth.",
    category: "Retro",
    builtIn: true,
    appearance: {
      surfaceStyle: "inset",
      backgroundTreatment: "terminal",
      backgroundColor: "#06150E",
      accentColor: "#54FF9B",
      borderColor: "#1E6F4B",
      borderStyle: "solid",
      borderWidth: 1,
      borderRadius: 8,
      glowIntensity: 22,
      shadowDepth: 2,
      titleColor: "#78FFB2",
      bodyColor: "#B7FFD4",
    },
    behavior: { overflowMode: "scroll", mobileDensity: "compact", mobileFullWidth: true },
  },
  {
    id: "style-raised-screen",
    name: "Raised Screen",
    description: "A beveled surface that sits above the article canvas.",
    category: "Panels",
    builtIn: true,
    appearance: {
      surfaceStyle: "raised",
      backgroundTreatment: "gradient",
      backgroundColor: "#0C1B3D",
      accentColor: "#8AB4FF",
      borderColor: "#385E9D",
      borderStyle: "solid",
      borderWidth: 2,
      borderRadius: 14,
      glowIntensity: 10,
      shadowDepth: 4,
    },
    behavior: { overflowMode: "clip", mobileDensity: "comfortable", mobileFullWidth: true },
  },
  {
    id: "style-inset-monitor",
    name: "Inset Monitor",
    description: "A recessed display well for stats, lore, and hidden monitors.",
    category: "Panels",
    builtIn: true,
    appearance: {
      surfaceStyle: "inset",
      backgroundTreatment: "scanline",
      backgroundColor: "#050A1C",
      accentColor: "#67D3FF",
      borderColor: "#1A456B",
      borderStyle: "solid",
      borderWidth: 2,
      borderRadius: 12,
      glowIntensity: 12,
      shadowDepth: 1,
    },
    behavior: { overflowMode: "scroll", mobileDensity: "compact", mobileFullWidth: true },
  },
  {
    id: "style-glass-hologram",
    name: "Glass Hologram",
    description: "Translucent cyan glass with a stronger holographic glow.",
    category: "Effects",
    builtIn: true,
    appearance: {
      surfaceStyle: "glass",
      backgroundTreatment: "gradient",
      backgroundColor: "#08283A",
      accentColor: "#5CE8FF",
      borderColor: "#2CAFD2",
      borderStyle: "solid",
      borderWidth: 1,
      borderRadius: 16,
      opacity: 88,
      glowIntensity: 42,
      shadowDepth: 3,
    },
    behavior: { overflowMode: "clip", mobileDensity: "comfortable", mobileFullWidth: true },
  },
  {
    id: "style-warning-callout",
    name: "Warning Callout",
    description: "Amber warning surface for dangerous rules or urgent lore.",
    category: "Callouts",
    builtIn: true,
    appearance: {
      surfaceStyle: "raised",
      backgroundTreatment: "gradient",
      backgroundColor: "#2A1604",
      accentColor: "#FFB84A",
      borderColor: "#8A5318",
      borderStyle: "double",
      borderWidth: 2,
      borderRadius: 10,
      glowIntensity: 24,
      shadowDepth: 3,
      titleColor: "#FFD58A",
      bodyColor: "#FFE7BC",
    },
    behavior: { overflowMode: "clip", mobileDensity: "comfortable", mobileFullWidth: true },
  },
  {
    id: "style-lore-box",
    name: "Lore Box",
    description: "Warm archive panel for narrative and worldbuilding passages.",
    category: "Lore",
    builtIn: true,
    appearance: {
      surfaceStyle: "raised",
      backgroundTreatment: "gradient",
      backgroundColor: "#1B1327",
      accentColor: "#D6B7FF",
      borderColor: "#74579B",
      borderStyle: "solid",
      borderWidth: 1,
      borderRadius: 18,
      glowIntensity: 12,
      shadowDepth: 2,
      titleColor: "#E2CFFF",
      bodyColor: "#EBDFFF",
    },
    behavior: { overflowMode: "clip", mobileDensity: "comfortable", mobileFullWidth: true },
  },
  {
    id: "style-reference-table",
    name: "Reference Table",
    description: "Compact readable table style with striped rows and sticky header.",
    category: "Reference",
    builtIn: true,
    appearance: {
      surfaceStyle: "flat",
      backgroundTreatment: "solid",
      backgroundColor: "#071126",
      accentColor: "#A7D7FF",
      borderColor: "#25446E",
      borderStyle: "solid",
      borderWidth: 1,
      borderRadius: 8,
      glowIntensity: 6,
      shadowDepth: 1,
    },
    behavior: { overflowMode: "scroll", mobileDensity: "dense", mobileFullWidth: true },
    typeDefaults: { tableDensity: "compact", tableStripedRows: true, tableStickyHeader: true, tableLinkedCells: true },
  },
  {
    id: "style-clean-divider",
    name: "Clean Divider",
    description: "Transparent divider with a crisp line and centered label.",
    category: "Structure",
    builtIn: true,
    appearance: {
      surfaceStyle: "none",
      backgroundTreatment: "none",
      accentColor: "#8AB4FF",
      borderColor: "#315B8D",
      borderStyle: "none",
      borderWidth: 0,
      borderRadius: 0,
      dividerStyle: "line",
      dividerLabelPosition: "center",
      glowIntensity: 0,
      shadowDepth: 0,
      padding: "tight",
    },
    behavior: { overflowMode: "clip", mobileDensity: "compact", mobileFullWidth: true },
  },
];

function createBlankSitePage(): SitePage {
  return {
    id: `site-${uid()}` ,
    title: "", url: "", description: "", category: "Uncategorized",
    subcategories: [], dateAdded: `${DATE_MONTHS[new Date().getMonth()]} ${new Date().getDate()}, ${new Date().getFullYear()}`,
    body: "", subtitle: "", marqueeText: "", footerText: "",
    sections: [], ...DEFAULT_STYLE,
    headerAlign: "center", pageIcon: "globe", pageIconUrl: "",
    bodyTitle: "", bodySubtitle: "",
    underConstruction: false, showHitCounter: false, showDividers: true, hitCount: 1337,
    infobox: [], articleQuality: "start" as const, tags: [], relatedArticleIds: [],
    seeAlso: [], disambiguationNote: "", references: [], lastEditSummary: "",
    layoutVersion: WIKI_BLOCK_LAYOUT_VERSION,
    blocks: [],
    canvasSettings: normalizeWikiCanvasSettings(),
    panels: [],
    wikiTags: [], wikiTagFields: {}, playerVisibility: {},
    relationships: [],
  };
}

// End inline editor helpers.
function InlineEdit({
  value, onChange, placeholder, tag: Tag = "span", style, className, multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  tag?: "h1" | "h2" | "p" | "span" | "div";
  style?: React.CSSProperties;
  className?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  if (editing) {
    const shared: React.CSSProperties = {
      ...style,
      background: "rgba(74, 123, 255, 0.08)",
      border: "1px dashed #4A7BFF55",
      outline: "none",
      width: "100%",
      padding: "2px 6px",
    };
    const commit = () => { onChange(draft); setEditing(false); };
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
          className={className}
          style={{ ...shared, minHeight: 60, resize: "vertical" }}
          rows={3}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className={className}
        style={shared}
      />
    );
  }

  return (
    <Tag
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:outline hover:outline-1 hover:outline-dashed hover:outline-[#4A7BFF55] transition-all ${className || ""}`}
      style={{ ...style, minHeight: 20, opacity: value ? 1 : 0.4 }}
      title="Click to edit"
    >
      {value || placeholder}
    </Tag>
  );
}

export function WikiEditor() {
  if ((safeGetItem("inet-user-id") || "") !== "dm") {
    return <Navigate to="/interface" replace />;
  }
  return <WikiEditorWorkspace />;
}

function WikiEditorWorkspace() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id || id === "new";
  const currentUserId = safeGetItem("inet-user-id") || "";

  const [allPages, setAllPages] = useState<SitePage[]>([]);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [wikiTagDefs, setWikiTagDefs] = useState<WikiTagDefinition[]>([]);
  const [customPanelStyles, setCustomPanelStyles] = useState<CustomPanelStyle[]>([]);
  const [wikiLoading, setWikiLoading] = useState(true);
  const [wikiLoadError, setWikiLoadError] = useState("");

  const existingPage = useMemo(() => (isNew ? null : allPages.find((p) => p.id === id) || null), [allPages, id, isNew]);

  // --- Article State ---
  const [page, setPage] = useState<SitePage>(() => createBlankSitePage());

  // --- UI State ---
  const [activePanel, setActivePanel] = useState<"preview" | "settings" | "content" | "metadata" | "appearance">("preview");
  const [workspaceRailTab, setWorkspaceRailTab] = useState<"outline" | "library" | "presets" | "article">("outline");
  const [inspectorTab, setInspectorTab] = useState<"content" | "layout" | "style" | "article">("content");
  const [editorCanvasMode, setEditorCanvasMode] = useState<EditorCanvasMode>("edit");
  const [responsiveFrameMode, setResponsiveFrameMode] = useState<ResponsiveFrameMode>("desktop");
  const editorPreviewMode = editorCanvasMode !== "edit";
  const isPlayerPreviewMode = editorCanvasMode === "player";
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [selectedPreviewPanelId, setSelectedPreviewPanelId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [inlinePreviewEditorTarget, setInlinePreviewEditorTarget] = useState<"body" | string | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [saveFlash, setSaveFlash] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [error, setError] = useState("");
  const [hasUnsaved, setHasUnsaved] = useState(isNew);
  const [previewAsPlayerId, setPreviewAsPlayerId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dragType, setDragType] = useState<"panel" | null>(null);
  const [revealedPanels, setRevealedPanels] = useState<Set<string>>(new Set());
  const [wikiBlockPresets, setWikiBlockPresets] = useState<WikiBlockPreset[]>([]);
  const [wikiBlockStylePresets, setWikiBlockStylePresets] = useState<WikiBlockStylePreset[]>(() => safeGetJson<WikiBlockStylePreset[]>(WIKI_BLOCK_STYLE_PRESETS_LOCAL_KEY, []));
  const [wikiArticleRevisions, setWikiArticleRevisions] = useState<SitePageRevision[]>([]);
  const [sharedImageStorageFallback, setSharedImageStorageFallback] = useState(false);
  const [sharedPresetFallback, setSharedPresetFallback] = useState(false);
  const [presetStatus, setPresetStatus] = useState("");
  const [showRecoveryDrawer, setShowRecoveryDrawer] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState("");
  const urlManuallyEdited = useRef(false);
  const hydratedPageRef = useRef<string | null>(null);
  const articleImportInputRef = useRef<HTMLInputElement>(null);

  // Template state
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const canvasFrameRef = useRef<HTMLDivElement>(null);
  const blockCanvasRef = useRef<HTMLDivElement>(null);
  const articleChromeCanvasRef = useRef<HTMLDivElement>(null);
  const minimapButtonRef = useRef<HTMLButtonElement>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [draggedBlockType, setDraggedBlockType] = useState<WikiBlockType | null>(null);
  const [draggedImageAssetId, setDraggedImageAssetId] = useState<string | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [hoveredArticleChromeField, setHoveredArticleChromeField] = useState<WikiArticleChromeField | null>(null);
  const [selectedArticleChromeField, setSelectedArticleChromeField] = useState<WikiArticleChromeField | null>(null);
  const [movingBlockId, setMovingBlockId] = useState<string | null>(null);
  const [movingArticleChromeField, setMovingArticleChromeField] = useState<WikiArticleChromeField | null>(null);
  const [activeTabbedReferenceTabs, setActiveTabbedReferenceTabs] = useState<Record<string, string>>({});
  const [liveBlockLayouts, setLiveBlockLayouts] = useState<Record<string, Partial<WikiArticleBlock["layout"]>>>({});
  const [liveArticleChromeLayouts, setLiveArticleChromeLayouts] = useState<Partial<Record<WikiArticleChromeField, WikiBlockLayout>>>({});
  const [canvasViewportWidth, setCanvasViewportWidth] = useState(0);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [minimapViewport, setMinimapViewport] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const [canvasInsertPicker, setCanvasInsertPicker] = useState<{
    colStart: number;
    rowStart: number;
    left: number;
    top: number;
  } | null>(null);
  const [canvasDropPreview, setCanvasDropPreview] = useState<{
    colStart: number;
    rowStart: number;
    colSpan: number;
    rowSpan: number;
  } | null>(null);
  const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelectionState | null>(null);
  const movingBlockRef = useRef<{
    blockId: string;
    originColStart: number;
    originRowStart: number;
    colWidth: number;
    rowHeight: number;
    startClientX: number;
    startClientY: number;
    colSpan: number;
  } | null>(null);
  const movingArticleChromeRef = useRef<{
    field: WikiArticleChromeField;
    originColStart: number;
    originRowStart: number;
    colWidth: number;
    rowHeight: number;
    startClientX: number;
    startClientY: number;
    colSpan: number;
  } | null>(null);
  const marqueeSelectionRef = useRef<MarqueeSelectionState | null>(null);
  const minimapDragActiveRef = useRef(false);

  // --- Auto-save Draft State ---
  const [showDraftRestore, setShowDraftRestore] = useState(false);
  const [remoteDrafts, setRemoteDrafts] = useState<Record<string, SitePage>>({});
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const draftStorageId = isNew ? "new" : (id || page.id);
  const draftKey = `inet-wiki-draft-${draftStorageId}`;
  const draftRestoreCheckedIdRef = useRef("");

  // --- Undo/Redo State ---
  const [undoStack, setUndoStack] = useState<SitePage[]>([]);
  const [redoStack, setRedoStack] = useState<SitePage[]>([]);
  const undoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUndoSnapshotRef = useRef<SitePage | null>(null);

  // --- Wiki Link Dialog State ---
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkInsertTarget, setLinkInsertTarget] = useState<"body" | string>("body");

  // --- Image Embed Dialog State ---
  const [showImageEmbed, setShowImageEmbed] = useState(false);
  const [showSpoilerInsert, setShowSpoilerInsert] = useState(false);
  const [spoilerInsertTarget, setSpoilerInsertTarget] = useState<"body" | string>("body");
  const [spoilerLabel, setSpoilerLabel] = useState("Spoiler");
  const [spoilerPlayerIds, setSpoilerPlayerIds] = useState<string[]>([]);
  const [spoilerContent, setSpoilerContent] = useState("");
  const [storedImages, setStoredImages] = useState<StoredImageAsset[]>([]);
  const [imagePickerTarget, setImagePickerTarget] = useState<{ mode: "embed" | "block"; blockId?: string } | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [imageAlign, setImageAlign] = useState<"left" | "center" | "right">("center");
  const [imageWidth, setImageWidth] = useState("100");

  // --- Custom Panel Styles ---
  const [showNewStyleForm, setShowNewStyleForm] = useState(false);
  const [newStyleLabel, setNewStyleLabel] = useState("");
  const [newStyleAccent, setNewStyleAccent] = useState("#6ABAFF");
  const [newStyleBg, setNewStyleBg] = useState("#0A1A2A");
  const [newStyleBorder, setNewStyleBorder] = useState("#1A3A5B");

  const navigationBlocker = useBlocker(({ currentLocation, nextLocation }) => (
    hasUnsaved && currentLocation.pathname !== nextLocation.pathname
  ));

  useEffect(() => {
    if (navigationBlocker.state !== "blocked") return;
    if (window.confirm("You have unsaved wiki changes. Leave this page anyway?")) {
      navigationBlocker.proceed();
    } else {
      navigationBlocker.reset();
    }
  }, [navigationBlocker]);

  useEffect(() => {
    if (!hasUnsaved) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasUnsaved]);

  const refreshSharedAssetFallbackState = useCallback((overrides?: {
    imageStorage?: boolean;
    presets?: boolean;
  }) => {
    setSharedImageStorageFallback(
      typeof overrides?.imageStorage === "boolean"
        ? overrides.imageStorage
        : !!getDMImageStorageFallbackState(),
    );
    setSharedPresetFallback(
      typeof overrides?.presets === "boolean"
        ? overrides.presets
        : !!getWikiBlockPresetsFallbackState(),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWikiEditorData() {
      try {
        setWikiLoading(true);
        setWikiLoadError("");
        let bootstrapFallback = false;
        const bootstrap = await loadWikiBootstrap().catch(() => {
          bootstrapFallback = true;
          return {
            sites: safeGetJson<SitePage[]>("inet-dm-sites", []),
            players: safeGetJson<PlayerData[]>("inet-dm-players", []),
            wikiTags: safeGetJson<WikiTagDefinition[]>("inet-dm-wikiTags", []),
            customPanelStyles: safeGetJson<CustomPanelStyle[]>("inet-custom-panel-styles", []),
            imageStorage: safeGetJson<StoredImageAsset[]>(IMAGE_STORAGE_LOCAL_KEY, []),
            wikiBlockPresets: safeGetJson<WikiBlockPreset[]>(WIKI_BLOCK_PRESETS_LOCAL_KEY, []),
            wikiBlockStylePresets: safeGetJson<WikiBlockStylePreset[]>(WIKI_BLOCK_STYLE_PRESETS_LOCAL_KEY, []),
            wikiTemplates: safeGetJson<WikiTemplate[]>("inet-wiki-templates", []),
            wikiArticleRevisions: safeGetJson<SitePageRevision[]>(WIKI_ARTICLE_REVISIONS_LOCAL_KEY, []),
          };
        });

        if (cancelled) return;

        setAllPages(Array.isArray(bootstrap?.sites) ? bootstrap.sites : []);
        setPlayers(Array.isArray(bootstrap?.players) ? bootstrap.players : []);
        setWikiTagDefs(Array.isArray(bootstrap?.wikiTags) ? bootstrap.wikiTags : []);
        setCustomPanelStyles(Array.isArray(bootstrap?.customPanelStyles) ? bootstrap.customPanelStyles : []);
        const nextImages = Array.isArray(bootstrap?.imageStorage) ? bootstrap.imageStorage : [];
        const nextPresets = normalizeWikiBlockPresets(
          Array.isArray(bootstrap?.wikiBlockPresets) ? bootstrap.wikiBlockPresets : safeGetJson<WikiBlockPreset[]>(WIKI_BLOCK_PRESETS_LOCAL_KEY, []),
        );
        const nextRevisions = Array.isArray(bootstrap?.wikiArticleRevisions)
          ? bootstrap.wikiArticleRevisions
          : safeGetJson<SitePageRevision[]>(WIKI_ARTICLE_REVISIONS_LOCAL_KEY, []);
        const remoteStylePresets = Array.isArray(bootstrap?.wikiBlockStylePresets)
          ? bootstrap.wikiBlockStylePresets as WikiBlockStylePreset[]
          : [];
        const localStylePresets = safeGetJson<WikiBlockStylePreset[]>(WIKI_BLOCK_STYLE_PRESETS_LOCAL_KEY, []);
        const nextStylePresets = Array.from(
          new Map([...localStylePresets, ...remoteStylePresets].map((preset) => [preset.id, preset])).values(),
        );
        setStoredImages(nextImages);
        setWikiBlockPresets(nextPresets.filter((preset) => !preset.builtIn));
        setWikiBlockStylePresets(nextStylePresets);
        setWikiArticleRevisions(nextRevisions);
        hydrateWikiTemplates(Array.isArray(bootstrap?.wikiTemplates) ? bootstrap.wikiTemplates as WikiTemplate[] : []);
        safeSetJson(IMAGE_STORAGE_LOCAL_KEY, nextImages);
        safeSetJson(WIKI_BLOCK_PRESETS_LOCAL_KEY, nextPresets.filter((preset) => !preset.builtIn));
        safeSetJson(WIKI_BLOCK_STYLE_PRESETS_LOCAL_KEY, nextStylePresets);
        if (!bootstrapFallback && nextStylePresets.length !== remoteStylePresets.length) {
          void saveWikiBlockStylePresets(nextStylePresets as unknown as Record<string, unknown>[]).catch(() => {});
        }
        safeSetJson(WIKI_ARTICLE_REVISIONS_LOCAL_KEY, nextRevisions);
        refreshSharedAssetFallbackState(
          bootstrapFallback
            ? { imageStorage: true, presets: true }
            : undefined,
        );
      } catch (err) {
        if (cancelled) return;
        setWikiLoadError(err instanceof Error ? err.message : "Failed to load wiki editor data");
        setAllPages(safeGetJson<SitePage[]>("inet-dm-sites", []));
        setPlayers(safeGetJson<PlayerData[]>("inet-dm-players", []));
        setWikiTagDefs(safeGetJson<WikiTagDefinition[]>("inet-dm-wikiTags", []));
        setCustomPanelStyles(safeGetJson<CustomPanelStyle[]>("inet-custom-panel-styles", []));
        setStoredImages(safeGetJson<StoredImageAsset[]>(IMAGE_STORAGE_LOCAL_KEY, []));
        setWikiArticleRevisions(safeGetJson<SitePageRevision[]>(WIKI_ARTICLE_REVISIONS_LOCAL_KEY, []));
        setWikiBlockPresets(
          normalizeWikiBlockPresets(safeGetJson<WikiBlockPreset[]>(WIKI_BLOCK_PRESETS_LOCAL_KEY, []))
            .filter((preset) => !preset.builtIn),
        );
        setWikiBlockStylePresets(safeGetJson<WikiBlockStylePreset[]>(WIKI_BLOCK_STYLE_PRESETS_LOCAL_KEY, []));
        hydrateWikiTemplates(safeGetJson<WikiTemplate[]>("inet-wiki-templates", []));
        refreshSharedAssetFallbackState({ imageStorage: true, presets: true });
      } finally {
        if (!cancelled) setWikiLoading(false);
      }
    }

    loadWikiEditorData();
    return () => {
      cancelled = true;
    };
  }, [refreshSharedAssetFallbackState]);

  useEffect(() => {
    let cancelled = false;

    async function loadRemoteDrafts() {
      if (!currentUserId) {
        setDraftsLoaded(true);
        return;
      }
      try {
        const drafts = await loadWikiDrafts<SitePage>().catch(() => (
          appStore.loadPlayerWikiEditorDrafts<Record<string, SitePage>>(currentUserId, {})
        ));
        if (!cancelled) setRemoteDrafts(drafts && typeof drafts === "object" ? drafts : {});
      } catch (err) {
        console.warn("Failed to load wiki drafts", err);
      } finally {
        if (!cancelled) setDraftsLoaded(true);
      }
    }

    void loadRemoteDrafts();
    return () => { cancelled = true; };
  }, [currentUserId]);

  useEffect(() => {
    if (wikiLoading) return;

    if (isNew) {
      if (hydratedPageRef.current === "new") return;
      const blank = createBlankSitePage();
      blank.blocks = migrateLegacyArticleToBlocks(blank);
      setPage(blank);
      setEditSummary("");
      setHasUnsaved(true);
      setShowTemplatePicker(true);
      setSelectedPreviewPanelId(null);
      setSelectedBlockIds(blank.blocks[0]?.id ? [blank.blocks[0].id] : []);
      setInlinePreviewEditorTarget(null);
      setUndoStack([]);
      setRedoStack([]);
      pendingUndoSnapshotRef.current = null;
      urlManuallyEdited.current = false;
      hydratedPageRef.current = "new";
      return;
    }

    if (!existingPage) return;
    if (hydratedPageRef.current === existingPage.id) return;

    const migrated = migrateWikiSectionsToPanels(existingPage) as WikiPanel[];
    const migratedBlocks = migrateLegacyArticleToBlocks({ ...existingPage, panels: migrated, sections: [] });
    setPage({
      ...existingPage,
      panels: migrated,
      sections: [],
      layoutVersion: WIKI_BLOCK_LAYOUT_VERSION,
      blocks: migratedBlocks,
      canvasSettings: normalizeWikiCanvasSettings(existingPage.canvasSettings),
    });
    setEditSummary(existingPage.lastEditSummary || "");
    setHasUnsaved(false);
    setShowTemplatePicker(false);
    setSelectedPreviewPanelId(null);
    setSelectedBlockIds(migratedBlocks[0]?.id ? [migratedBlocks[0].id] : []);
    setInlinePreviewEditorTarget(null);
    setUndoStack([]);
    setRedoStack([]);
    pendingUndoSnapshotRef.current = null;
    urlManuallyEdited.current = !!existingPage.url;
    hydratedPageRef.current = existingPage.id;
  }, [existingPage, isNew, wikiLoading]);

  const allPanelStyles = [...BUILTIN_PANEL_STYLES, ...customPanelStyles];

  const saveCustomStyles = (styles: CustomPanelStyle[]) => {
    setCustomPanelStyles(styles);
    void saveWikiCustomPanelStyles(styles as unknown as Record<string, unknown>[]).catch((err) => {
      console.warn("Failed to persist custom wiki panel styles", err);
      setError("Failed to save custom panel styles");
    });
  };

  const resetNewStyleForm = () => {
    setShowNewStyleForm(false);
    setNewStyleLabel(""); setNewStyleAccent("#6ABAFF"); setNewStyleBg("#0A1A2A"); setNewStyleBorder("#1A3A5B");
  };

  const addCustomStyle = () => {
    if (!newStyleLabel.trim()) return;
    const id = `custom-${toSlug(newStyleLabel)}-${uid()}`;
    const ns: CustomPanelStyle = { id, label: newStyleLabel.trim(), accent: newStyleAccent, bg: newStyleBg, border: newStyleBorder };
    saveCustomStyles([...customPanelStyles, ns]);
    if (editingPanelId) {
      updatePanel(editingPanelId, { style: id });
    }
    resetNewStyleForm();
  };

  const removeCustomStyle = (styleId: string) => {
    saveCustomStyles(customPanelStyles.filter((s) => s.id !== styleId));
  };

  useEffect(() => { resetNewStyleForm(); }, [editingPanelId]);

  useEffect(() => {
    const handleImageStorageUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ images?: StoredImageAsset[] }>).detail;
      if (!detail?.images) return;
      const nextImages = Array.isArray(detail.images) ? detail.images : [];
      setStoredImages(nextImages);
      safeSetJson(IMAGE_STORAGE_LOCAL_KEY, nextImages);
      refreshSharedAssetFallbackState();
    };
    window.addEventListener(IMAGE_STORAGE_UPDATED_EVENT, handleImageStorageUpdate as EventListener);
    return () => {
      window.removeEventListener(IMAGE_STORAGE_UPDATED_EVENT, handleImageStorageUpdate as EventListener);
    };
  }, [refreshSharedAssetFallbackState]);

  useEffect(() => {
    if (!presetStatus) return;
    const timer = window.setTimeout(() => setPresetStatus(""), 2400);
    return () => window.clearTimeout(timer);
  }, [presetStatus]);

  useEffect(() => {
    if (!recoveryStatus) return;
    const timer = window.setTimeout(() => setRecoveryStatus(""), 3200);
    return () => window.clearTimeout(timer);
  }, [recoveryStatus]);

  useEffect(() => {
    if (!showCommandPalette) setCommandPaletteQuery("");
  }, [showCommandPalette]);


  // --- Category/Tag Helpers ---
  const allCategories = useMemo(() => Array.from(new Set(allPages.map((p) => p.category).filter(Boolean))), [allPages]);
  const allTags = useMemo(() => Array.from(new Set(allPages.flatMap((p) => p.tags || []).filter(Boolean))), [allPages]);

  // --- Check for draft on mount ---
  useEffect(() => {
    if (!draftsLoaded || wikiLoading || (!isNew && !existingPage)) return;
    if (draftRestoreCheckedIdRef.current === draftStorageId) return;
    draftRestoreCheckedIdRef.current = draftStorageId;
    setShowDraftRestore(false);
    const remoteDraft = remoteDrafts[draftStorageId];
    if (remoteDraft && remoteDraft.title !== undefined) {
      setShowDraftRestore(true);
      return;
    }
    try {
      const draftRaw = safeGetItem(draftKey);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        if (draft && draft.title !== undefined) setShowDraftRestore(true);
      }
    } catch {}
  }, [draftKey, draftStorageId, draftsLoaded, existingPage, isNew, remoteDrafts, wikiLoading]);

  // Keep both a local recovery copy and a shared DM draft.
  useEffect(() => {
    if (!hasUnsaved || !currentUserId || !draftsLoaded) return;
    const handle = setTimeout(() => {
      safeSetJson(draftKey, page);
      setRemoteDrafts((prev) => {
        const next = { ...prev, [draftStorageId]: page };
        void saveWikiDrafts(next)
          .catch(() => appStore.savePlayerWikiEditorDrafts<Record<string, SitePage>>(currentUserId, next))
          .catch((err) => { console.warn("Failed to save wiki draft", err); });
        return next;
      });
    }, 1500);
    return () => clearTimeout(handle);
  }, [currentUserId, draftKey, draftStorageId, draftsLoaded, hasUnsaved, page]);

  // --- Restore draft handler ---
  const restoreDraft = useCallback(() => {
    const remoteDraft = remoteDrafts[draftStorageId];
    if (remoteDraft) {
      const migrated = migrateWikiSectionsToPanels(remoteDraft) as WikiPanel[];
      const migratedBlocks = migrateLegacyArticleToBlocks({ ...remoteDraft, panels: migrated, sections: [] });
      setPage({
        ...remoteDraft,
        panels: migrated,
        sections: [],
        layoutVersion: WIKI_BLOCK_LAYOUT_VERSION,
        blocks: migratedBlocks,
        canvasSettings: normalizeWikiCanvasSettings(remoteDraft.canvasSettings),
      });
      setSelectedBlockIds(migratedBlocks[0]?.id ? [migratedBlocks[0].id] : []);
      setHasUnsaved(true);
      setShowDraftRestore(false);
      return;
    }
    try {
      const draftRaw = safeGetItem(draftKey);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        const migrated = migrateWikiSectionsToPanels(draft) as WikiPanel[];
        const migratedBlocks = migrateLegacyArticleToBlocks({ ...draft, panels: migrated, sections: [] });
        setPage({
          ...draft,
          panels: migrated,
          sections: [],
          layoutVersion: WIKI_BLOCK_LAYOUT_VERSION,
          blocks: migratedBlocks,
          canvasSettings: normalizeWikiCanvasSettings(draft.canvasSettings),
        });
        setSelectedBlockIds(migratedBlocks[0]?.id ? [migratedBlocks[0].id] : []);
        setHasUnsaved(true);
      }
    } catch {}
    setShowDraftRestore(false);
  }, [draftKey, draftStorageId, remoteDrafts]);

  const discardDraft = useCallback(() => {
    safeRemoveItem(draftKey);
    if (!currentUserId) {
      setShowDraftRestore(false);
      return;
    }
    setRemoteDrafts((prev) => {
      const next = { ...prev };
      delete next[draftStorageId];
      void saveWikiDrafts(next)
        .catch(() => appStore.savePlayerWikiEditorDrafts<Record<string, SitePage>>(currentUserId, next))
        .catch((err) => { console.warn("Failed to discard wiki draft", err); });
      return next;
    });
    setShowDraftRestore(false);
  }, [currentUserId, draftKey, draftStorageId]);

  // Track changes
  const update = useCallback(<K extends keyof SitePage>(key: K, val: SitePage[K]) => {
    setPage((prev) => {
      if (!pendingUndoSnapshotRef.current) pendingUndoSnapshotRef.current = prev;
      if (undoDebounceRef.current) clearTimeout(undoDebounceRef.current);
      undoDebounceRef.current = setTimeout(() => {
        const snapshot = pendingUndoSnapshotRef.current;
        pendingUndoSnapshotRef.current = null;
        if (snapshot) setUndoStack((stack) => [...stack.slice(-49), snapshot]);
        setRedoStack([]);
      }, 500);
      return { ...prev, [key]: val };
    });
    setHasUnsaved(true);
  }, []);

  // --- Save ---
  const normalizePageForStorage = useCallback((sourcePage: SitePage): SitePage => {
    const normalizedBlocks = compactWikiArticleBlocks(
      normalizeWikiArticleBlocks(sourcePage.blocks || migrateLegacyArticleToBlocks(sourcePage)),
    );
    const legacySnapshot = serializeWikiBlocksToLegacyContent(normalizedBlocks);
    return {
      ...sourcePage,
      layoutVersion: WIKI_BLOCK_LAYOUT_VERSION,
      blocks: normalizedBlocks,
      canvasSettings: normalizeWikiCanvasSettings(sourcePage.canvasSettings),
      body: legacySnapshot.body,
      panels: normalizeWikiPanels(legacySnapshot.panels as WikiPanel[]),
      sections: [],
    };
  }, []);

  const persistArticleRevisions = useCallback(async (nextRevisions: SitePageRevision[]) => {
    const sorted = [...nextRevisions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    setWikiArticleRevisions(sorted);
    safeSetJson(WIKI_ARTICLE_REVISIONS_LOCAL_KEY, sorted);
    await saveWikiArticleRevisions(sorted as unknown as Record<string, unknown>[]);
  }, []);

  const createArticleRevision = useCallback(async (
    sourcePage: SitePage,
    source: SitePageRevision["source"],
    label: string,
  ) => {
    const snapshot = normalizePageForStorage(sourcePage);
    const revision: SitePageRevision = {
      id: `wiki-revision-${snapshot.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      pageId: snapshot.id,
      createdAt: new Date().toISOString(),
      createdBy: currentUserId || "dm",
      label: label.trim() || "Untitled revision",
      source,
      snapshot,
    };
    const revisionsForArticle = [
      revision,
      ...wikiArticleRevisions.filter((entry) => entry.pageId === snapshot.id && entry.id !== revision.id),
    ].slice(0, MAX_WIKI_REVISIONS_PER_ARTICLE);
    const revisionsForOtherArticles = wikiArticleRevisions.filter((entry) => entry.pageId !== snapshot.id);
    await persistArticleRevisions([...revisionsForArticle, ...revisionsForOtherArticles]);
    return revision;
  }, [currentUserId, normalizePageForStorage, persistArticleRevisions, wikiArticleRevisions]);

  const saveManualRevision = useCallback(async () => {
    try {
      const label = window.prompt("Revision label", editSummary.trim() || "Manual checkpoint")?.trim();
      if (!label) return;
      await createArticleRevision(page, "manual", label);
      setRecoveryStatus(`Saved revision: ${label}`);
    } catch (err) {
      setError(err instanceof Error ? `Failed to save revision: ${err.message}` : "Failed to save revision");
    }
  }, [createArticleRevision, editSummary, page]);

  const restoreRevision = useCallback(async (revision: SitePageRevision) => {
    if (!window.confirm(`Restore "${revision.label}"? Your current unsaved edits will be replaced.`)) return;
    try {
      await createArticleRevision(page, "restore", "Before revision restore");
      const restored = normalizePageForStorage(revision.snapshot);
      setPage(restored);
      setSelectedBlockIds(restored.blocks?.[0]?.id ? [restored.blocks[0].id] : []);
      setHasUnsaved(true);
      setShowRecoveryDrawer(false);
      setRecoveryStatus(`Restored revision: ${revision.label}`);
    } catch (err) {
      setError(err instanceof Error ? `Failed to restore revision: ${err.message}` : "Failed to restore revision");
    }
  }, [createArticleRevision, normalizePageForStorage, page]);

  const exportCurrentArticle = useCallback(() => {
    const snapshot = normalizePageForStorage(page);
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      source: "inet-wiki-article-export",
      article: snapshot,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${toSlug(snapshot.title || snapshot.id) || "wiki-article"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setRecoveryStatus("Article export created.");
  }, [normalizePageForStorage, page]);

  const handleImportArticleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = parsed?.article || parsed?.snapshot || parsed;
      if (!imported || typeof imported !== "object") throw new Error("Import file does not contain an article.");
      await createArticleRevision(page, "import", "Before article import");
      const normalized = normalizePageForStorage({
        ...createBlankSitePage(),
        ...imported,
        id: page.id,
      } as SitePage);
      setPage(normalized);
      setSelectedBlockIds(normalized.blocks?.[0]?.id ? [normalized.blocks[0].id] : []);
      setHasUnsaved(true);
      setRecoveryStatus(`Imported article content from ${file.name}.`);
    } catch (err) {
      setError(err instanceof Error ? `Failed to import article: ${err.message}` : "Failed to import article");
    } finally {
      if (articleImportInputRef.current) articleImportInputRef.current.value = "";
    }
  }, [createArticleRevision, normalizePageForStorage, page]);

  const handleSave = async () => {
    if (!page.title.trim()) { setError("Title is required"); return; }
    if (!page.url.trim()) { setError("URL is required"); return; }
    if (!page.description.trim()) { setError("Description is required"); return; }
    const normalizedUrl = normalizeComparableWikiUrl(page.url);
    const duplicateUrlPage = allPages.find((entry) => (
      entry.id !== page.id && normalizeComparableWikiUrl(entry.url || "") === normalizedUrl
    ));
    if (duplicateUrlPage) {
      setError(`Another article already uses this URL: ${duplicateUrlPage.title || duplicateUrlPage.id}`);
      return;
    }
    setError("");

    const now = new Date();
    const autoDate = `${DATE_MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    const nowIso = now.toISOString();
    const data: SitePage = normalizePageForStorage({
      ...page,
      lastEditSummary: editSummary.trim(),
      dateAdded: page.dateAdded || autoDate,
      createdAt: page.createdAt || (isNew ? nowIso : legacyDateToIso(page.dateAdded)),
      updatedAt: nowIso,
    });
    const stored: SitePage[] = allPages.map((entry) => ({
      ...entry,
      relatedArticleIds: [...(entry.relatedArticleIds || [])],
    }));
    const idx = stored.findIndex((p) => p.id === data.id);
    if (idx >= 0) {
      stored[idx] = data;
    } else {
      stored.push(data);
    }

    // Bidirectional sync for relatedArticleIds
    const myRelated = new Set(data.relatedArticleIds || []);
    for (const other of stored) {
      if (other.id === data.id) continue;
      const theirRelated = new Set(other.relatedArticleIds || []);
      if (myRelated.has(other.id)) {
        if (!theirRelated.has(data.id)) {
          other.relatedArticleIds = [...(other.relatedArticleIds || []), data.id];
        }
      } else if (theirRelated.has(data.id)) {
        other.relatedArticleIds = (other.relatedArticleIds || []).filter((rid) => rid !== data.id);
      }
    }

    try {
      let persistedPages = stored;
      try {
        const response = await saveWikiSite(
          data as unknown as Record<string, unknown>,
          page.serverUpdatedAt,
        );
        if (Array.isArray(response?.sites)) persistedPages = response.sites as SitePage[];
      } catch (err) {
        if (!(err instanceof ApiRequestError) || ![404, 405].includes(err.status)) throw err;
        await saveWikiSites(stored as unknown as Record<string, unknown>[]);
        setRecoveryStatus("The per-article wiki endpoint is not deployed yet; this save used the compatible collection fallback.");
      }
      refreshWikiArticleLookup(persistedPages.map(({ id, title }) => ({ id, title })));
      await createArticleRevision(data, "save", editSummary.trim() || "Published save").catch((err) => {
        console.warn("Failed to save wiki article revision", err);
        setRecoveryStatus("Article saved, but revision storage is using local fallback or could not update.");
      });
      if (currentUserId) {
        const nextDrafts = { ...remoteDrafts };
        delete nextDrafts[draftStorageId];
        await saveWikiDrafts(nextDrafts).catch(() => (
          appStore.savePlayerWikiEditorDrafts<Record<string, SitePage>>(currentUserId, nextDrafts)
        ));
        setRemoteDrafts(nextDrafts);
      }
      const persistedPage = persistedPages.find((entry) => entry.id === data.id) || data;
      setAllPages(persistedPages);
      safeRemoveItem(draftKey);
      setPage(persistedPage);
      setSaveFlash(true);
      setHasUnsaved(false);
      pendingUndoSnapshotRef.current = null;
      setUndoStack([]);
      setRedoStack([]);
      setTimeout(() => setSaveFlash(false), 1500);
    } catch (err) {
      console.warn("Failed to save wiki article", err);
      setError(err instanceof Error ? `Failed to save article: ${err.message}` : "Failed to save article");
    }
  };

  const copyPublicWikiLink = useCallback(async () => {
    if (isNew) {
      setError("Publish this article before copying its public link.");
      return;
    }
    const publicUrl = new URL(`/wiki/page/${encodeURIComponent(page.id)}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(publicUrl);
      setRecoveryStatus("Public wiki link copied.");
    } catch {
      window.prompt("Copy public wiki link:", publicUrl);
    }
  }, [isNew, page.id]);

  // --- Panel/Section helpers (unified) ---
  const panels = normalizeWikiPanels(page.panels);
  const addPanel = (style?: string, placement: WikiPanelPlacement = "body") => {
    const p: WikiPanel = normalizeWikiPanel({
      id: `panel-${uid()}`,
      title: "",
      subtitle: "",
      content: "",
      assignedTo: [],
      style: style || "blank",
      placement,
      width: placement === "sidebar" ? "full" : "full",
    });
    update("panels", [...panels, p]);
    setEditingPanelId(p.id);
    setSelectedPreviewPanelId(p.id);
    setInlinePreviewEditorTarget(p.id);
    setActivePanel("preview");
  };
  const updatePanel = (panelId: string, changes: Partial<WikiPanel>) => {
    update("panels", panels.map((p) => p.id === panelId ? normalizeWikiPanel({ ...p, ...changes }) : p));
  };
  const removePanel = (panelId: string) => {
    update("panels", panels.filter((p) => p.id !== panelId));
    if (editingPanelId === panelId) setEditingPanelId(null);
    if (selectedPreviewPanelId === panelId) setSelectedPreviewPanelId(null);
    if (inlinePreviewEditorTarget === panelId) setInlinePreviewEditorTarget(null);
  };
  const togglePanelPlayer = (panelId: string, playerId: string) => {
    const panel = panels.find((p) => p.id === panelId);
    if (!panel) return;
    const assigned = panel.assignedTo || [];
    const next = assigned.includes(playerId) ? assigned.filter((id) => id !== playerId) : [...assigned, playerId];
    updatePanel(panelId, { assignedTo: next });
  };

  // --- Reorder helpers ---
  const movePanel = (from: number, to: number) => {
    if (to < 0 || to >= panels.length) return;
    update("panels", reorder(panels, from, to));
  };

  const movePanelToPlacement = useCallback((fromIdx: number, placement: WikiPanelPlacement, beforePanelId?: string | null) => {
    if (fromIdx < 0 || fromIdx >= panels.length) return;
    const next = [...panels];
    const [moved] = next.splice(fromIdx, 1);
    const normalizedMoved = normalizeWikiPanel({
      ...moved,
      placement,
      width: placement === "sidebar" ? "full" : moved.width,
    });
    let insertIdx = next.length;
    if (beforePanelId) {
      const beforeIdx = next.findIndex((panel) => panel.id === beforePanelId);
      if (beforeIdx >= 0) {
        insertIdx = beforeIdx;
      }
    } else {
      const regionIndexes = next
        .map((panel, index) => ({ panel, index }))
        .filter(({ panel }) => getWikiPanelPlacement(panel) === placement)
        .map(({ index }) => index);
      if (regionIndexes.length > 0) {
        insertIdx = regionIndexes[regionIndexes.length - 1] + 1;
      }
    }
    next.splice(insertIdx, 0, normalizedMoved);
    update("panels", next);
    setSelectedPreviewPanelId(normalizedMoved.id);
  }, [panels, update]);

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragType("panel");
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  };
  const handleDrop = (toIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx !== null && dragType === "panel") {
      movePanel(dragIdx, toIdx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
    setDragType(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); setDragType(null); };

  const handlePreviewRegionDrop = (placement: WikiPanelPlacement, beforePanelId?: string | null) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx !== null && dragType === "panel") {
      movePanelToPlacement(dragIdx, placement, beforePanelId);
    }
    setDragIdx(null);
    setDragOverIdx(null);
    setDragType(null);
  };

  // --- Undo / Redo ---
  const handleUndo = useCallback(() => {
    if (pendingUndoSnapshotRef.current) {
      if (undoDebounceRef.current) clearTimeout(undoDebounceRef.current);
      const pending = pendingUndoSnapshotRef.current;
      pendingUndoSnapshotRef.current = null;
      setRedoStack((stack) => [...stack, page]);
      setPage(pending);
      setHasUnsaved(true);
      return;
    }
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((s) => [...s, page]);
    setUndoStack((s) => s.slice(0, -1));
    setPage(prev);
    setHasUnsaved(true);
  }, [undoStack, page]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((s) => [...s, page]);
    setRedoStack((s) => s.slice(0, -1));
    setPage(next);
    setHasUnsaved(true);
  }, [redoStack, page]);

  // --- Keyboard Shortcuts ---
  const handleSaveRef = useRef<() => void>(() => {});
  handleSaveRef.current = handleSave;

  // --- Template Application ---
  const applyTemplate = useCallback((template: WikiTemplate) => {
    const data = template.data;
    const templateBlocks = normalizeWikiArticleBlocks((data.blocks || []).map((block) => ({
      ...block,
      id: `wiki-block-${uid()}`,
      rows: block.rows?.map((row) => ({ ...row, id: `row-${uid()}` })),
      tabs: block.tabs?.map((tab) => ({
        ...tab,
        id: `tab-${uid()}`,
        rows: tab.rows.map((row) => ({ ...row, id: `row-${uid()}` })),
      })),
      items: block.items?.map((item) => ({ ...item, id: `item-${uid()}` })),
    })));
    const usesStructuredBlocks = templateBlocks.length > 0;
    // Convert template sections to panels (migration)
    const templateSectionPanels: WikiPanel[] = (data.sections || []).map((s) => ({
      id: `panel-${uid()}`,
      title: s.heading || "",
      subtitle: "",
      content: s.body || "",
      assignedTo: [],
      style: "blank",
      placement: "body",
      width: "full",
      mediaUrl: "",
      mediaCaption: "",
      mediaAlt: "",
      mediaPosition: "top",
    }));
    const templatePanels: WikiPanel[] = normalizeWikiPanels((data.panels || []).map((p) => ({ ...p, id: `panel-${uid()}` })));
    setPage((prev) => {
      const nextPage: SitePage = {
        ...prev,
        category: data.category || prev.category,
        tags: data.tags || prev.tags,
        subtitle: data.subtitle ?? prev.subtitle,
        description: data.description ?? prev.description,
        sections: [],
        panels: usesStructuredBlocks ? [] : normalizeWikiPanels([...templateSectionPanels, ...templatePanels]),
        infobox: data.infobox || (usesStructuredBlocks ? [] : prev.infobox),
        body: data.body || (usesStructuredBlocks ? "" : prev.body),
        bodyTitle: data.bodyTitle || (usesStructuredBlocks ? "" : prev.bodyTitle),
        pageIcon: data.pageIcon || prev.pageIcon,
        underConstruction: data.underConstruction ?? prev.underConstruction,
        showDividers: data.showDividers ?? prev.showDividers,
        articleQuality: data.articleQuality || prev.articleQuality,
        canvasSettings: data.canvasSettings
          ? normalizeWikiCanvasSettings(data.canvasSettings)
          : prev.canvasSettings,
      };
      nextPage.layoutVersion = WIKI_BLOCK_LAYOUT_VERSION;
      nextPage.blocks = usesStructuredBlocks ? templateBlocks : migrateLegacyArticleToBlocks(nextPage);
      return nextPage;
    });
    setHasUnsaved(true);
    setShowTemplatePicker(false);
    setSelectedPreviewPanelId(null);
    setInlinePreviewEditorTarget(null);
    setSelectedBlockIds([]);
  }, []);

  // --- Wiki Link Insertion ---
  const handleInsertWikiLink = useCallback((articleId: string, articleTitle: string, displayText: string) => {
    const linkHtml = `<a href="/interface/inet-page/${articleId}" class="wiki-link" data-article-id="${articleId}" style="color:#6A9AFF;text-decoration:underline;cursor:pointer;" title="${articleTitle}">${displayText}</a>`;
    if (linkInsertTarget === "body") {
      update("body", (page.body || "") + linkHtml);
    } else {
      const panel = panels.find((p) => p.id === linkInsertTarget);
      if (panel) {
        updatePanel(linkInsertTarget, { content: (panel.content || "") + linkHtml });
      }
    }
    setShowLinkDialog(false);
  }, [page.body, panels, linkInsertTarget, update]);

  // --- Image Embed Handler ---
  const handleInsertImage = useCallback(() => {
    if (!imageUrl.trim()) return;
    const alignStyle = imageAlign === "center" ? "margin:12px auto;display:block;text-align:center;" : imageAlign === "left" ? "float:left;margin:0 16px 12px 0;" : "float:right;margin:0 0 12px 16px;";
    const widthStyle = imageWidth ? `max-width:${imageWidth}%;` : "max-width:100%;";
    let html = `<figure style="${alignStyle}${widthStyle}">`;
    html += `<img src="${imageUrl.trim()}" alt="${imageCaption || ""}" style="width:100%;height:auto;border-radius:3px;border:1px solid #2A2A5B;" />`;
    if (imageCaption.trim()) {
      html += `<figcaption style="text-align:center;font-size:10px;color:#5A6A8A;margin-top:4px;font-style:italic;">${imageCaption.trim()}</figcaption>`;
    }
    html += `</figure>`;
    const currentBody = page.body || "";
    update("body", currentBody + html);
    setImageUrl("");
    setImageCaption("");
    setImageAlign("center");
    setImageWidth("100");
    setShowImageEmbed(false);
  }, [imageUrl, imageCaption, imageAlign, imageWidth, page.body, update]);

  // --- Spoiler Box Insert Handler ---
  const handleInsertSpoiler = useCallback(() => {
    if (!spoilerContent.trim()) return;
    const playerStr = spoilerPlayerIds.join(",");
    const spoilerHtml = `<span class="inline-spoiler" data-spoiler-players="${playerStr}" data-spoiler-label="${spoilerLabel || "Spoiler"}">${spoilerContent}</span>`;
    if (spoilerInsertTarget === "body") {
      update("body", (page.body || "") + spoilerHtml);
    } else {
      const panel = panels.find((p) => p.id === spoilerInsertTarget);
      if (panel) {
        updatePanel(spoilerInsertTarget, { content: (panel.content || "") + spoilerHtml });
      }
    }
    setSpoilerContent("");
    setSpoilerLabel("Spoiler");
    setSpoilerPlayerIds([]);
    setShowSpoilerInsert(false);
  }, [spoilerContent, spoilerPlayerIds, spoilerLabel, spoilerInsertTarget, page.body, panels, update]);

  // --- Preview-as-player helpers ---
  const previewPlayer = useMemo(() => previewAsPlayerId ? players.find((p) => p.id === previewAsPlayerId) : null, [previewAsPlayerId, players]);
  const playerPreviewArticleVisibility = previewAsPlayerId ? (page.playerVisibility || {})[previewAsPlayerId] || "visible" : "visible";
  const playerPreviewArticleBlocked = isPlayerPreviewMode && !!previewAsPlayerId && (
    playerPreviewArticleVisibility === "hidden" ||
    (playerPreviewArticleVisibility === "spoiler" && !revealedPanels.has("article-spoiler-gate"))
  );

  // --- Infobox helpers ---
  const addInfoboxRow = () => update("infobox", [...(page.infobox || []), { label: "", value: "" }]);
  const updateInfoboxRow = (idx: number, field: "label" | "value", val: string) => {
    const next = [...(page.infobox || [])];
    next[idx] = { ...next[idx], [field]: val };
    update("infobox", next);
  };
  const removeInfoboxRow = (idx: number) => update("infobox", (page.infobox || []).filter((_, i) => i !== idx));

  // --- Subcategory helpers ---
  const addSubcategory = (type: "folder" | "article") => {
    const node: SubCategory = { id: `sc-${uid()}`, name: "", type, children: [] };
    update("subcategories", [...(page.subcategories || []), node]);
  };
  const updateSubcategory = (scId: string, field: string, val: string) => {
    const mutate = (nodes: SubCategory[]): SubCategory[] =>
      nodes.map((n) => {
        if (n.id === scId) {
          const updated = { ...n };
          if (field === "name") updated.name = val;
          else if (field === "type") { updated.type = val as "folder" | "article"; if (val === "folder") updated.articleId = undefined; else updated.children = []; }
          else if (field === "articleId") updated.articleId = val;
          return updated;
        }
        return { ...n, children: mutate(n.children) };
      });
    update("subcategories", mutate(page.subcategories || []));
  };
  const removeSubcategory = (scId: string) => {
    const filter = (nodes: SubCategory[]): SubCategory[] =>
      nodes.filter((n) => n.id !== scId).map((n) => ({ ...n, children: filter(n.children) }));
    update("subcategories", filter(page.subcategories || []));
  };

  // --- Relationship helpers ---
  const normalizeArticleRelationships = useCallback((relationships: WikiArticleRelationship[] | undefined) =>
    (Array.isArray(relationships) ? relationships : [])
      .map((relationship) => ({
        id: relationship.id || `rel-${uid()}`,
        type: relationship.type || "related to",
        targetArticleId: relationship.targetArticleId || "",
        note: relationship.note || "",
      }))
      .filter((relationship) => relationship.targetArticleId),
  []);

  const addArticleRelationship = useCallback(() => {
    const existingTargets = new Set((page.relationships || []).map((relationship) => relationship.targetArticleId));
    const firstTarget = allPages.find((article) => article.id !== page.id && !existingTargets.has(article.id));
    if (!firstTarget) {
      setError("Create another article before adding a relationship.");
      return;
    }
    update("relationships", [
      ...normalizeArticleRelationships(page.relationships),
      { id: `rel-${uid()}`, type: "related to", targetArticleId: firstTarget.id, note: "" },
    ]);
  }, [allPages, normalizeArticleRelationships, page.id, page.relationships, update]);

  const updateArticleRelationship = useCallback((relationshipId: string, patch: Partial<WikiArticleRelationship>) => {
    update("relationships", normalizeArticleRelationships(page.relationships).map((relationship) => (
      relationship.id === relationshipId ? { ...relationship, ...patch } : relationship
    )));
  }, [normalizeArticleRelationships, page.relationships, update]);

  const removeArticleRelationship = useCallback((relationshipId: string) => {
    update("relationships", normalizeArticleRelationships(page.relationships).filter((relationship) => relationship.id !== relationshipId));
  }, [normalizeArticleRelationships, page.relationships, update]);

  const incomingArticleRelationships = useMemo(() => {
    const outgoingKeys = new Set(normalizeArticleRelationships(page.relationships).map((relationship) => (
      `${relationship.targetArticleId}:${relationship.type.trim().toLowerCase()}`
    )));
    const incoming: { source: SitePage; relationship: WikiArticleRelationship; inverseType: string }[] = [];

    allPages.forEach((source) => {
      if (source.id === page.id) return;
      normalizeArticleRelationships(source.relationships).forEach((relationship) => {
        if (relationship.targetArticleId !== page.id) return;
        const inverseType = getInverseWikiRelationshipType(relationship.type);
        if (!inverseType || outgoingKeys.has(`${source.id}:${inverseType}`)) return;
        incoming.push({ source, relationship, inverseType });
      });
    });

    return incoming;
  }, [allPages, normalizeArticleRelationships, page.id, page.relationships]);

  // Resolve colors
  const bg = page.bgColor || DEFAULT_STYLE.bgColor;
  const hdr = page.headerColor || DEFAULT_STYLE.headerColor;
  const accent = page.accentColor || DEFAULT_STYLE.accentColor;
  const txt = page.textColor || DEFAULT_STYLE.textColor;
  const font = page.fontFamily || DEFAULT_STYLE.fontFamily;
  const borderColor = lighten(bg, 25);
  const mutedText = lighten(bg, 60);
  const canvasSettings = useMemo(() => normalizeWikiCanvasSettings(page.canvasSettings), [page.canvasSettings]);

  const bodyParagraphs = (page.body || "").trim();
  const hasBody = bodyParagraphs.length > 0;
  const hasPanelContent = panels.length > 0 && panels.some((p) => p.title || p.content || p.mediaUrl);
  const hasContent = hasBody || hasPanelContent;
  const selectedPreviewPanel = selectedPreviewPanelId ? panels.find((panel) => panel.id === selectedPreviewPanelId) || null : null;
  const previewVisiblePanels = panels.filter((panel) => {
    const hasRestriction = panel.assignedTo && panel.assignedTo.length > 0;
    const vMode = panel.visibilityMode || "spoiler";
    if (hasRestriction && vMode === "hidden" && previewAsPlayerId && !panel.assignedTo.includes(previewAsPlayerId)) {
      return false;
    }
    return true;
  });
  const bodyPanels = previewVisiblePanels.filter((panel) => getWikiPanelPlacement(panel) === "body");
  const sidebarPanels = previewVisiblePanels.filter((panel) => getWikiPanelPlacement(panel) === "sidebar");
  const bodyPanelRows = groupBodyPanelsIntoRows(bodyPanels);
  const pageBlocks = useMemo(
    () => compactWikiArticleBlocks(
      normalizeWikiArticleBlocks(
        page.blocks && page.blocks.length > 0
          ? page.blocks
          : migrateLegacyArticleToBlocks(page),
      ),
    ),
    [page],
  );
  const renderedPageBlocks = useMemo(
    () => pageBlocks.map((block) => normalizeWikiArticleBlock({
      ...block,
      layout: {
        ...block.layout,
        ...(liveBlockLayouts[block.id] || {}),
      },
    })),
    [liveBlockLayouts, pageBlocks],
  );
  const responsiveFrame = RESPONSIVE_FRAME_OPTIONS[responsiveFrameMode];
  const responsivePageBlocks = useMemo(
    () => [...renderedPageBlocks].sort((a, b) => {
      const aOrder = a.fluid?.preferredMobileOrder ?? a.mobilePriority ?? a.layout.rowStart * 100 + a.layout.colStart;
      const bOrder = b.fluid?.preferredMobileOrder ?? b.mobilePriority ?? b.layout.rowStart * 100 + b.layout.colStart;
      return aOrder - bOrder || compareWikiBlocksForLayout(a, b);
    }),
    [renderedPageBlocks],
  );
  const layoutQaFindings = useMemo(() => {
    const findings: { id: string; severity: "warn" | "info"; text: string }[] = [];
    renderedPageBlocks.forEach((block) => {
      if (block.layout.colStart + block.layout.colSpan - 1 > WIKI_BLOCK_COLUMNS) {
        findings.push({ id: `${block.id}-overflow`, severity: "warn", text: `${block.title || block.type} extends beyond the desktop grid.` });
      }
      if (block.type === "image" && block.imageUrl && !block.imageAlt) {
        findings.push({ id: `${block.id}-alt`, severity: "info", text: `${block.title || "Image block"} is missing alt text.` });
      }
      if ((block.type === "referenceTable" || block.type === "tabbedReference") && ((block.rows || []).length > 10 || (block.tabs || []).some((tab) => tab.rows.length > 10)) && (block.fluid?.mobileBehavior || block.mobileCollapseMode) !== "scrollX") {
        findings.push({ id: `${block.id}-table-mobile`, severity: "warn", text: `${block.title || "Reference table"} should use horizontal scroll on mobile.` });
      }
      if ((block.fluid?.widthMode === "hug" || block.fluid?.heightMode === "hug") && block.type === "image" && !block.fluid?.keepAspectRatio) {
        findings.push({ id: `${block.id}-aspect`, severity: "info", text: `${block.title || "Image block"} may crop oddly unless aspect ratio is locked.` });
      }
    });
    if (!page.title.trim()) findings.push({ id: "article-title", severity: "warn", text: "Article title is empty." });
    if (!page.description.trim()) findings.push({ id: "article-description", severity: "info", text: "Article description is empty; search previews may feel thin." });
    return findings;
  }, [page.description, page.title, renderedPageBlocks]);
  const blockIdToPage = useMemo(() => new Map(allPages.map((article) => [article.id, article])), [allPages]);
  const selectedBlockId = selectedBlockIds[0] || null;
  const selectedBlocks = useMemo(
    () => pageBlocks.filter((block) => selectedBlockIds.includes(block.id)).sort(compareWikiBlocksForLayout),
    [pageBlocks, selectedBlockIds],
  );
  const selectedBlock = selectedBlockId ? pageBlocks.find((block) => block.id === selectedBlockId) || null : null;
  const selectedBlockBounds = useMemo(
    () => getWikiBlockLayoutBounds(selectedBlocks),
    [selectedBlocks],
  );
  const currentArticleRevisions = useMemo(
    () => wikiArticleRevisions
      .filter((revision) => revision.pageId === page.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [page.id, wikiArticleRevisions],
  );
  const hasRecoverableDraft = useMemo(() => {
    if (showDraftRestore) return true;
    if (existingPage && remoteDrafts[existingPage.id]) return true;
    return !!safeGetItem(draftKey);
  }, [draftKey, existingPage, remoteDrafts, showDraftRestore]);
  const presetLibrary = useMemo(
    () => [
      ...BUILTIN_WIKI_BLOCK_PRESETS,
      ...normalizeWikiBlockPresets(wikiBlockPresets).filter((preset) => !preset.builtIn),
    ],
    [wikiBlockPresets],
  );
  const componentPresets = useMemo(() => presetLibrary.filter((preset) => preset.category === "Components"), [presetLibrary]);
  const quickDataPresets = useMemo(() => presetLibrary.filter((preset) => preset.category === "Quick Data Blocks"), [presetLibrary]);
  const snapLayoutPresets = useMemo(() => presetLibrary.filter((preset) => preset.category === "Snap Layouts"), [presetLibrary]);
  const stylePresetLibrary = useMemo(
    () => [
      ...BUILTIN_WIKI_BLOCK_STYLE_PRESETS,
      ...wikiBlockStylePresets.filter((preset) => !preset.builtIn),
    ],
    [wikiBlockStylePresets],
  );
  const articleLinkChoices = useMemo(
    () => allPages.filter((article) => article.id !== page.id).sort((a, b) => a.title.localeCompare(b.title)),
    [allPages, page.id],
  );
  const wikiLinkOptions = useMemo(
    () => articleLinkChoices.map((article) => ({ id: article.id, title: article.title || "Untitled Article", category: article.category || "Uncategorized" })),
    [articleLinkChoices],
  );
  const isResponsiveReflowMode = editorPreviewMode && responsiveFrameMode !== "desktop";
  const canvasFrameWidth = isResponsiveReflowMode ? responsiveFrame.width : canvasSettings.frameWidth;
  const canvasRowHeight = 24;
  const articleChromeFields = useMemo(
    () => (["title", "subtitle", "description"] as WikiArticleChromeField[]),
    [],
  );
  const articleChromeLayouts = useMemo(() => {
    const storedLayouts = canvasSettings.articleChromeLayouts || DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS;
    return articleChromeFields.reduce((layouts, field) => ({
      ...layouts,
      [field]: liveArticleChromeLayouts[field] || storedLayouts[field] || DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS[field],
    }), {} as Record<WikiArticleChromeField, WikiBlockLayout>);
  }, [articleChromeFields, canvasSettings.articleChromeLayouts, liveArticleChromeLayouts]);
  const articleChromeBottomRow = useMemo(
    () => Math.max(12, ...articleChromeFields.map((field) => articleChromeLayouts[field].rowStart + articleChromeLayouts[field].rowSpan + 1)),
    [articleChromeFields, articleChromeLayouts],
  );
  const selectedArticleChromeLayout = selectedArticleChromeField ? articleChromeLayouts[selectedArticleChromeField] || DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS[selectedArticleChromeField] : null;
  const selectedArticleChromeLabel = selectedArticleChromeField ? getArticleChromeFieldLabel(selectedArticleChromeField) : "";
  const contentCanvasRowOffset = canvasSettings.compactHeaderLayout ? 0 : articleChromeBottomRow;
  const canvasBottomRow = useMemo(
    () => Math.max(contentCanvasRowOffset + 48, ...renderedPageBlocks.map((block) => contentCanvasRowOffset + block.layout.rowStart + block.layout.rowSpan + 2)),
    [contentCanvasRowOffset, renderedPageBlocks],
  );
  const blockCountLabel = `${pageBlocks.length} block${pageBlocks.length === 1 ? "" : "s"}`;
  const canvasContentHeight = canvasBottomRow * canvasRowHeight;
  const canvasHeight = Math.max(canvasSettings.minCanvasHeight, canvasSettings.canvasHeight, canvasContentHeight + 60);
  const canvasBaseScale = canvasViewportWidth > 0 && canvasViewportWidth < canvasFrameWidth + 64
    ? Math.max(0.58, (canvasViewportWidth - 28) / canvasFrameWidth)
    : 1;
  const isMinimizedCanvasMode = canvasBaseScale < 1;
  const effectiveCanvasScale = Math.max(0.45, Math.min(1.45, canvasZoom * canvasBaseScale));
  const canvasRenderWidth = canvasFrameWidth;
  const canvasScaledWidth = canvasRenderWidth * effectiveCanvasScale;
  const editorModeCopy: Record<EditorCanvasMode, { title: string; description: string; tone: string }> = {
    edit: {
      title: "Edit Canvas",
      description: "Build and arrange blocks with rails, grid guides, handles, and inspectors.",
      tone: "#8AB4FF",
    },
    clean: {
      title: "Clean Canvas",
      description: "Review spacing and composition without editor chrome or block controls.",
      tone: "#C7D6FF",
    },
    player: {
      title: "Player Preview",
      description: "Preview the published article with visibility and spoiler rules applied.",
      tone: "#8FF0B8",
    },
  };
  const currentModeCopy = editorModeCopy[editorCanvasMode];
  const selectedStatusLabel = selectedBlocks.length > 1
    ? `${selectedBlocks.length} blocks selected`
    : selectedBlock
      ? selectedBlock.title || `Untitled ${selectedBlock.type}`
      : selectedArticleChromeField
        ? `Article ${selectedArticleChromeLabel} selected`
      : "Nothing selected";
  const articleHealth = useMemo(() => {
    const missing: string[] = [];
    if (!page.title.trim()) missing.push("title");
    if (!page.description.trim()) missing.push("description");
    if (pageBlocks.length === 0) missing.push("blocks");
    if (missing.length === 0) return { label: "Ready", detail: "Article has core publishing details.", color: "#8FF0B8" };
    return { label: "Needs Setup", detail: `Missing ${missing.join(", ")}.`, color: "#FFD37A" };
  }, [page.description, page.title, pageBlocks.length]);

  const selectExclusiveBlock = useCallback((blockId: string | null) => {
    setSelectedArticleChromeField(null);
    setSelectedBlockIds(blockId ? [blockId] : []);
  }, []);

  const toggleBlockSelection = useCallback((blockId: string) => {
    setSelectedArticleChromeField(null);
    setSelectedBlockIds((prev) => (
      prev.includes(blockId)
        ? prev.filter((entry) => entry !== blockId)
        : [blockId, ...prev.filter((entry) => entry !== blockId)]
    ));
  }, []);

  const handleBlockSelection = useCallback((blockId: string, additive = false) => {
    if (additive) {
      toggleBlockSelection(blockId);
      return;
    }
    selectExclusiveBlock(blockId);
  }, [selectExclusiveBlock, toggleBlockSelection]);

  const selectArticleChromeField = useCallback((field: WikiArticleChromeField) => {
    setSelectedArticleChromeField(field);
    setSelectedBlockIds([]);
    setInspectorTab("content");
  }, []);

  useEffect(() => {
    setSelectedBlockIds((prev) => prev.filter((blockId) => pageBlocks.some((block) => block.id === blockId)));
  }, [pageBlocks]);

  useEffect(() => {
    setRevealedPanels(new Set());
  }, [previewAsPlayerId, page.id]);

  useEffect(() => {
    if (!canvasViewportRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setCanvasViewportWidth(entry.contentRect.width);
    });
    observer.observe(canvasViewportRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    const canvas = blockCanvasRef.current;
    if (!viewport || !canvas) return;

    const syncViewport = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const left = Math.max(0, Math.min(canvasRect.width, viewportRect.left - canvasRect.left));
      const top = Math.max(0, Math.min(canvasRect.height, viewportRect.top - canvasRect.top));
      const right = Math.max(0, Math.min(canvasRect.width, viewportRect.right - canvasRect.left));
      const bottom = Math.max(0, Math.min(canvasRect.height, viewportRect.bottom - canvasRect.top));
      setMinimapViewport({
        left: canvasRect.width > 0 ? left / canvasRect.width : 0,
        top: canvasRect.height > 0 ? top / canvasRect.height : 0,
        width: canvasRect.width > 0 ? Math.max(0.06, (right - left) / canvasRect.width) : 1,
        height: canvasRect.height > 0 ? Math.max(0.06, (bottom - top) / canvasRect.height) : 1,
      });
    };

    syncViewport();
    viewport.addEventListener("scroll", syncViewport, { passive: true });
    window.addEventListener("resize", syncViewport);
    return () => {
      viewport.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, [canvasHeight, effectiveCanvasScale, renderedPageBlocks]);

  const jumpCanvasViewportFromMinimap = useCallback((clientX: number, clientY: number, behavior: ScrollBehavior = "auto") => {
    const frame = canvasFrameRef.current;
    const viewport = canvasViewportRef.current;
    const minimap = minimapButtonRef.current;
    if (!frame || !viewport || !minimap) return;
    const rect = minimap.getBoundingClientRect();
    const xRatio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)));
    const yRatio = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(rect.height, 1)));
    const targetLeft = frame.offsetLeft + (frame.clientWidth * xRatio) - (viewport.clientWidth / 2);
    const targetTop = frame.offsetTop + (frame.clientHeight * yRatio) - (viewport.clientHeight / 2);
    viewport.scrollTo({
      left: Math.max(0, targetLeft),
      top: Math.max(0, targetTop),
      behavior,
    });
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!minimapDragActiveRef.current) return;
      jumpCanvasViewportFromMinimap(event.clientX, event.clientY, "auto");
    };

    const handleMouseUp = () => {
      minimapDragActiveRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [jumpCanvasViewportFromMinimap]);

  useEffect(() => {
    if (!marqueeSelection) return;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = blockCanvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = {
        ...marqueeSelectionRef.current!,
        currentX: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
        currentY: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
      };
      marqueeSelectionRef.current = next;
      setMarqueeSelection(next);
    };

    const handleMouseUp = () => {
      const state = marqueeSelectionRef.current;
      const rect = blockCanvasRef.current?.getBoundingClientRect();
      marqueeSelectionRef.current = null;
      if (!state || !rect) {
        setMarqueeSelection(null);
        return;
      }
      const colWidth = rect.width / WIKI_BLOCK_COLUMNS;
      const left = Math.min(state.startX, state.currentX);
      const top = Math.min(state.startY, state.currentY);
      const right = Math.max(state.startX, state.currentX);
      const bottom = Math.max(state.startY, state.currentY);
      const hits = renderedPageBlocks.filter((block) => {
        const blockLeft = (block.layout.colStart - 1) * colWidth;
        const blockTop = (contentCanvasRowOffset + block.layout.rowStart - 1) * canvasRowHeight;
        const blockRight = blockLeft + (block.layout.colSpan * colWidth);
        const blockBottom = blockTop + (block.layout.rowSpan * canvasRowHeight);
        return left <= blockRight && right >= blockLeft && top <= blockBottom && bottom >= blockTop;
      }).map((block) => block.id);
      setSelectedBlockIds(hits);
      setMarqueeSelection(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [canvasRowHeight, contentCanvasRowOffset, marqueeSelection, renderedPageBlocks]);

  const updateBlocks = useCallback((nextBlocks: WikiArticleBlock[]) => {
    update("blocks", compactWikiArticleBlocks(nextBlocks));
  }, [update]);

  const updateSingleBlock = useCallback((blockId: string, updater: (block: WikiArticleBlock) => WikiArticleBlock) => {
    const nextBlocks = pageBlocks.map((block) => (
      block.id === blockId
        ? normalizeWikiArticleBlock(updater(block))
        : normalizeWikiArticleBlock(block)
    ));
    updateBlocks(resolveWikiBlockCollisions(nextBlocks, blockId));
  }, [pageBlocks, updateBlocks]);

  const persistStoredImages = useCallback(async (nextImages: StoredImageAsset[]) => {
    try {
      await saveDMImageStorage(nextImages as unknown as Record<string, unknown>[]);
      setStoredImages(nextImages);
      safeSetJson(IMAGE_STORAGE_LOCAL_KEY, nextImages);
      window.dispatchEvent(new CustomEvent(IMAGE_STORAGE_UPDATED_EVENT, { detail: { images: nextImages } }));
      refreshSharedAssetFallbackState();
    } catch (err) {
      refreshSharedAssetFallbackState();
      setError(err instanceof Error ? err.message : "Failed to save image storage");
      throw err;
    }
  }, [refreshSharedAssetFallbackState]);

  const retrySharedImageStorage = useCallback(async () => {
    clearDMImageStorageFallbackState();
    setError("");
    try {
      const remoteImages = await loadDMImageStorage<StoredImageAsset>({ forceRemote: true });
      const merged = mergeStoredImageAssets(storedImages, remoteImages);
      await saveDMImageStorage(merged as unknown as Record<string, unknown>[], { forceRemote: true });
      setStoredImages(merged);
      safeSetJson(IMAGE_STORAGE_LOCAL_KEY, merged);
      window.dispatchEvent(new CustomEvent(IMAGE_STORAGE_UPDATED_EVENT, { detail: { images: merged } }));
      refreshSharedAssetFallbackState({ imageStorage: false });
    } catch (err) {
      refreshSharedAssetFallbackState();
      setError(
        `Shared image storage is still unavailable: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
      );
    }
  }, [refreshSharedAssetFallbackState, storedImages]);

  const persistWikiPresetLibrary = useCallback(async (
    nextPresets: WikiBlockPreset[],
    successMessage?: string,
  ) => {
    const normalized = normalizeWikiBlockPresets(nextPresets)
      .filter((preset) => !preset.builtIn)
      .map((preset) => ({
        ...preset,
        builtIn: false,
      }));
    try {
      await saveWikiBlockPresets(normalized as unknown as Record<string, unknown>[]);
      setWikiBlockPresets(normalized);
      safeSetJson(WIKI_BLOCK_PRESETS_LOCAL_KEY, normalized);
      if (successMessage) setPresetStatus(successMessage);
      refreshSharedAssetFallbackState();
    } catch (err) {
      refreshSharedAssetFallbackState();
      setError(err instanceof Error ? err.message : "Failed to save wiki block presets");
      throw err;
    }
  }, [refreshSharedAssetFallbackState]);

  const persistWikiBlockStylePresets = useCallback((nextPresets: WikiBlockStylePreset[], successMessage?: string) => {
    const normalized = nextPresets
      .filter((preset) => !preset.builtIn)
      .map((preset) => ({
        ...preset,
        builtIn: false,
        appearance: { ...(preset.appearance || {}) },
        behavior: { ...(preset.behavior || {}) },
        typeDefaults: { ...(preset.typeDefaults || {}) },
      }));
    setWikiBlockStylePresets(normalized);
    safeSetJson(WIKI_BLOCK_STYLE_PRESETS_LOCAL_KEY, normalized);
    void saveWikiBlockStylePresets(normalized as unknown as Record<string, unknown>[]).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to save shared style presets");
    });
    if (successMessage) setPresetStatus(successMessage);
  }, []);

  const applyBlockStylePreset = useCallback((blockId: string, preset: WikiBlockStylePreset) => {
    updateSingleBlock(blockId, (block) => ({
      ...block,
      appearance: {
        ...block.appearance,
        ...(preset.appearance || {}),
        stylePresetId: preset.id,
      },
      behavior: {
        ...(block.behavior || {}),
        ...(preset.behavior || {}),
      },
      ...(preset.typeDefaults || {}),
    }));
    setPresetStatus(`Applied style: ${preset.name}`);
  }, [updateSingleBlock]);

  const saveSelectedBlockStylePreset = useCallback(() => {
    if (!selectedBlock) return;
    const name = window.prompt("Style preset name", selectedBlock.title || "Custom Block Style")?.trim();
    if (!name) return;
    const description = window.prompt("Style preset description", "Reusable visual settings for wiki blocks")?.trim() || "";
    const preset: WikiBlockStylePreset = {
      id: `style-custom-${uid()}`,
      name,
      description,
      category: selectedBlock.type === "referenceTable" || selectedBlock.type === "tabbedReference" ? "Reference" : selectedBlock.type === "divider" || selectedBlock.type === "lineBox" ? "Structure" : "Custom",
      builtIn: false,
      appearance: { ...selectedBlock.appearance, stylePresetId: undefined },
      behavior: { ...(selectedBlock.behavior || {}) },
      typeDefaults: {
        imageFrameStyle: selectedBlock.imageFrameStyle,
        imageCaptionStyle: selectedBlock.imageCaptionStyle,
        tableDensity: selectedBlock.tableDensity,
        tableStripedRows: selectedBlock.tableStripedRows,
        tableStickyHeader: selectedBlock.tableStickyHeader,
        tableLinkedCells: selectedBlock.tableLinkedCells,
        keyValueDensity: selectedBlock.keyValueDensity,
        keyValueLabelAlign: selectedBlock.keyValueLabelAlign,
        keyValueRowDividers: selectedBlock.keyValueRowDividers,
        wikiLinksDisplayMode: selectedBlock.wikiLinksDisplayMode,
        lineOrientation: selectedBlock.lineOrientation,
        lineThickness: selectedBlock.lineThickness,
      },
    };
    persistWikiBlockStylePresets([...wikiBlockStylePresets, preset], `Saved style preset: ${name}`);
  }, [persistWikiBlockStylePresets, selectedBlock, wikiBlockStylePresets]);

  const duplicateStylePresetToLibrary = useCallback((preset: WikiBlockStylePreset) => {
    const duplicate: WikiBlockStylePreset = {
      ...preset,
      id: `style-custom-${uid()}`,
      name: `${preset.name} Copy`,
      builtIn: false,
      appearance: { ...(preset.appearance || {}) },
      behavior: { ...(preset.behavior || {}) },
      typeDefaults: { ...(preset.typeDefaults || {}) },
    };
    persistWikiBlockStylePresets([...wikiBlockStylePresets, duplicate], `Copied style preset: ${preset.name}`);
  }, [persistWikiBlockStylePresets, wikiBlockStylePresets]);

  const renameStoredStylePreset = useCallback((presetId: string) => {
    const target = wikiBlockStylePresets.find((preset) => preset.id === presetId);
    if (!target) return;
    const nextName = window.prompt("Rename style preset", target.name)?.trim();
    if (!nextName) return;
    persistWikiBlockStylePresets(
      wikiBlockStylePresets.map((preset) => preset.id === presetId ? { ...preset, name: nextName } : preset),
      `Renamed style preset: ${nextName}`,
    );
  }, [persistWikiBlockStylePresets, wikiBlockStylePresets]);

  const deleteStoredStylePreset = useCallback((presetId: string) => {
    const target = wikiBlockStylePresets.find((preset) => preset.id === presetId);
    if (!target) return;
    if (!window.confirm(`Delete style preset "${target.name}"?`)) return;
    persistWikiBlockStylePresets(
      wikiBlockStylePresets.filter((preset) => preset.id !== presetId),
      `Deleted style preset: ${target.name}`,
    );
  }, [persistWikiBlockStylePresets, wikiBlockStylePresets]);

  const resetSelectedBlockStyle = useCallback(() => {
    if (!selectedBlock) return;
    updateSingleBlock(selectedBlock.id, (block) => {
      const defaults = createDefaultBlock(block.type);
      return {
        ...block,
        appearance: defaults.appearance,
        behavior: defaults.behavior,
        imageFrameStyle: defaults.imageFrameStyle,
        imageCaptionStyle: defaults.imageCaptionStyle,
        tableDensity: defaults.tableDensity,
        tableStripedRows: defaults.tableStripedRows,
        tableStickyHeader: defaults.tableStickyHeader,
        tableLinkedCells: defaults.tableLinkedCells,
        keyValueDensity: defaults.keyValueDensity,
        keyValueLabelAlign: defaults.keyValueLabelAlign,
        keyValueRowDividers: defaults.keyValueRowDividers,
        wikiLinksDisplayMode: defaults.wikiLinksDisplayMode,
      };
    });
    setPresetStatus("Reset block style to default.");
  }, [selectedBlock, updateSingleBlock]);

  const openImageStoragePicker = useCallback((target: { mode: "embed" | "block"; blockId?: string }) => {
    setImagePickerTarget(target);
  }, []);

  const handleStoredImageSelect = useCallback((image: StoredImageAsset) => {
    if (imagePickerTarget?.mode === "block" && imagePickerTarget.blockId) {
      updateSingleBlock(imagePickerTarget.blockId, (block) => ({
        ...block,
        imageUrl: image.src,
        imageAlt: block.imageAlt || image.alt || image.name,
        imageCaption: block.imageCaption || image.name,
        imageStorageAssetId: image.id,
        imageFocalX: block.imageFocalX ?? 50,
        imageFocalY: block.imageFocalY ?? 50,
        imageCaptionPlacement: block.imageCaptionPlacement || "below",
      }));
    } else if (imagePickerTarget?.mode === "block") {
      const rowStart = getNextWikiBlockRow(pageBlocks);
      const nextBlock = normalizeWikiArticleBlock({
        ...createDefaultBlock("image", rowStart),
        id: `wiki-block-${uid()}`,
        title: image.name,
        imageUrl: image.src,
        imageAlt: image.alt || image.name,
        imageCaption: image.name,
        imageStorageAssetId: image.id,
        imageFocalX: 50,
        imageFocalY: 50,
        imageCaptionPlacement: "below",
      });
      updateBlocks(resolveWikiBlockCollisions([...pageBlocks, nextBlock], nextBlock.id));
      selectExclusiveBlock(nextBlock.id);
    } else {
      setImageUrl(image.src);
      if (!imageCaption.trim() && image.name) setImageCaption(image.name);
    }
    setImagePickerTarget(null);
  }, [imageCaption, imagePickerTarget, pageBlocks, selectExclusiveBlock, updateBlocks, updateSingleBlock]);

  const handleStoredImageUpload = useCallback(async (files: File[]) => {
    try {
      const created = await createStoredImageAssetsFromFiles(files, "wiki-editor");
      if (!created.length) return;
      const nextImages = mergeStoredImageAssets(storedImages, created);
      await persistStoredImages(nextImages);
      handleStoredImageSelect(created[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload images into storage");
    }
  }, [handleStoredImageSelect, persistStoredImages, storedImages]);

  const addBlock = useCallback((type: WikiBlockType, seed?: Partial<WikiArticleBlock>) => {
    const rowStart = seed?.layout?.rowStart || getNextWikiBlockRow(pageBlocks);
    const nextBlock = normalizeWikiArticleBlock({
      ...createDefaultBlock(type, rowStart),
      ...seed,
      id: `wiki-block-${uid()}`,
      layout: {
        ...createDefaultBlock(type, rowStart).layout,
        ...(seed?.layout || {}),
      },
    });
    updateBlocks(resolveWikiBlockCollisions([...pageBlocks, nextBlock], nextBlock.id));
    selectExclusiveBlock(nextBlock.id);
    setInspectorTab("content");
  }, [pageBlocks, selectExclusiveBlock, updateBlocks]);

  const getCanvasGridMetrics = useCallback(() => {
    const rect = blockCanvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      rect,
      colWidth: rect.width / WIKI_BLOCK_COLUMNS,
      rowHeight: canvasRowHeight,
    };
  }, [canvasRowHeight]);

  const getCanvasGridPlacement = useCallback((
    clientX: number,
    clientY: number,
    layoutSeed?: Partial<WikiArticleBlock["layout"]>,
  ) => {
    const metrics = getCanvasGridMetrics();
    if (!metrics) return null;
    const colSpan = layoutSeed?.colSpan || 1;
    const rowSpan = layoutSeed?.rowSpan || 1;
    const rawRow = Math.floor((clientY - metrics.rect.top) / metrics.rowHeight) + 1;
    return {
      left: clientX - metrics.rect.left,
      top: clientY - metrics.rect.top,
      colStart: Math.max(1, Math.min(WIKI_BLOCK_COLUMNS - colSpan + 1, Math.floor((clientX - metrics.rect.left) / Math.max(metrics.colWidth, 1)) + 1)),
      rowStart: Math.max(1, rawRow - contentCanvasRowOffset),
      colSpan,
      rowSpan,
    };
  }, [contentCanvasRowOffset, getCanvasGridMetrics]);

  const clampArticleChromeLayout = useCallback((layout: Partial<WikiBlockLayout>, fallback: WikiBlockLayout): WikiBlockLayout => {
    const minColSpan = fallback.minColSpan || 6;
    const minRowSpan = fallback.minRowSpan || 2;
    const colSpan = Math.max(minColSpan, Math.min(WIKI_BLOCK_COLUMNS, Math.round(layout.colSpan || fallback.colSpan)));
    return {
      colStart: Math.max(1, Math.min(WIKI_BLOCK_COLUMNS - colSpan + 1, Math.round(layout.colStart || fallback.colStart))),
      colSpan,
      rowStart: Math.max(1, Math.round(layout.rowStart || fallback.rowStart)),
      rowSpan: Math.max(minRowSpan, Math.round(layout.rowSpan || fallback.rowSpan)),
      minColSpan,
      minRowSpan,
    };
  }, []);

  const updateArticleChromeLayout = useCallback((field: WikiArticleChromeField, layoutPatch: Partial<WikiBlockLayout>) => {
    const currentLayouts = canvasSettings.articleChromeLayouts || DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS;
    const fallback = currentLayouts[field] || DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS[field];
    const nextLayout = clampArticleChromeLayout({ ...fallback, ...layoutPatch }, fallback);
    update("canvasSettings", normalizeWikiCanvasSettings({
      ...canvasSettings,
      articleChromeLayouts: {
        ...DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS,
        ...currentLayouts,
        [field]: nextLayout,
      },
    }));
  }, [canvasSettings, clampArticleChromeLayout, update]);

  const beginArticleChromeMove = useCallback((event: React.MouseEvent, field: WikiArticleChromeField) => {
    if (editorPreviewMode) return;
    const metricsRect = articleChromeCanvasRef.current?.getBoundingClientRect();
    const layout = articleChromeLayouts[field];
    if (!metricsRect || !layout) return;
    event.preventDefault();
    event.stopPropagation();
    selectArticleChromeField(field);
    movingArticleChromeRef.current = {
      field,
      originColStart: layout.colStart,
      originRowStart: layout.rowStart,
      colWidth: metricsRect.width / WIKI_BLOCK_COLUMNS,
      rowHeight: canvasRowHeight,
      startClientX: event.clientX,
      startClientY: event.clientY,
      colSpan: layout.colSpan,
    };
    setMovingArticleChromeField(field);
  }, [articleChromeLayouts, canvasRowHeight, editorPreviewMode, selectArticleChromeField]);

  const duplicateBlock = useCallback((blockId: string) => {
    const source = pageBlocks.find((block) => block.id === blockId);
    if (!source) return;
    const clone = normalizeWikiArticleBlock({
      ...source,
      id: `wiki-block-${uid()}`,
      title: source.title ? `${source.title} Copy` : source.title,
      layout: {
        ...source.layout,
        rowStart: source.layout.rowStart + source.layout.rowSpan,
      },
    });
    updateBlocks(resolveWikiBlockCollisions([...pageBlocks, clone], clone.id));
    selectExclusiveBlock(clone.id);
  }, [pageBlocks, selectExclusiveBlock, updateBlocks]);

  const removeBlock = useCallback((blockId: string) => {
    updateBlocks(pageBlocks.filter((block) => block.id !== blockId));
    if (selectedBlockId === blockId) {
      selectExclusiveBlock(pageBlocks.find((block) => block.id !== blockId)?.id || null);
    }
  }, [pageBlocks, selectExclusiveBlock, selectedBlockId, updateBlocks]);

  const nudgeBlock = useCallback((blockId: string, deltaCol: number, deltaRow: number) => {
    const block = pageBlocks.find((entry) => entry.id === blockId);
    if (!block) return;
    const nextLayout = {
      colStart: block.layout.allowOverflow
        ? block.layout.colStart + deltaCol
        : Math.max(1, Math.min(WIKI_BLOCK_COLUMNS - block.layout.colSpan + 1, block.layout.colStart + deltaCol)),
      rowStart: block.layout.allowOverflow ? block.layout.rowStart + deltaRow : Math.max(1, block.layout.rowStart + deltaRow),
    };
    updateBlocks(placeWikiBlock(pageBlocks, blockId, nextLayout));
  }, [pageBlocks, updateBlocks]);

  const nudgeSelectedBlocks = useCallback((deltaCol: number, deltaRow: number) => {
    if (selectedBlocks.length === 0) return;
    const selectedSet = new Set(selectedBlockIds);
    const nextBlocks = pageBlocks.map((block) => {
      if (!selectedSet.has(block.id) || block.locked) return normalizeWikiArticleBlock(block);
      return clampWikiBlockLayout(normalizeWikiArticleBlock({
        ...block,
        layout: {
          ...block.layout,
          colStart: block.layout.allowOverflow
            ? block.layout.colStart + deltaCol
            : Math.max(1, Math.min(WIKI_BLOCK_COLUMNS - block.layout.colSpan + 1, block.layout.colStart + deltaCol)),
          rowStart: block.layout.allowOverflow ? block.layout.rowStart + deltaRow : Math.max(1, block.layout.rowStart + deltaRow),
        },
      }));
    });
    updateBlocks(resolveWikiBlockCollisions(nextBlocks, selectedBlockIds[0]));
  }, [pageBlocks, selectedBlockIds, selectedBlocks.length, updateBlocks]);

  const duplicateSelectedBlocks = useCallback(() => {
    if (selectedBlocks.length === 0) return;
    const clones = selectedBlocks.map((block) => normalizeWikiArticleBlock({
      ...block,
      id: `wiki-block-${uid()}`,
      title: block.title ? `${block.title} Copy` : block.title,
      layout: {
        ...block.layout,
        rowStart: block.layout.rowStart + block.layout.rowSpan,
      },
    }));
    updateBlocks(resolveWikiBlockCollisions([...pageBlocks, ...clones], clones[0]?.id));
    setSelectedBlockIds(clones.map((block) => block.id));
  }, [pageBlocks, selectedBlocks, updateBlocks]);

  const removeSelectedBlocks = useCallback(() => {
    if (selectedBlockIds.length === 0) return;
    const selectedSet = new Set(selectedBlockIds);
    updateBlocks(pageBlocks.filter((block) => !selectedSet.has(block.id)));
    setSelectedBlockIds([]);
  }, [pageBlocks, selectedBlockIds, updateBlocks]);

  const applySmartLayoutGroup = useCallback((mode: "stack" | "columns" | "wrap") => {
    if (selectedBlocks.length < 2) return;
    const selectedSet = new Set(selectedBlockIds);
    const bounds = getWikiBlockLayoutBounds(selectedBlocks);
    const groupId = `wiki-group-${uid()}`;
    const groupName = mode === "stack" ? "Stack Section" : mode === "columns" ? "Column Section" : "Wrap Section";
    const sorted = [...selectedBlocks].sort(compareWikiBlocksForLayout);
    const layoutById = new Map<string, Partial<WikiBlockLayout>>();

    if (mode === "stack") {
      let nextRow = bounds.minRowStart;
      sorted.forEach((block) => {
        layoutById.set(block.id, {
          colStart: bounds.minColStart,
          colSpan: bounds.colSpan,
          rowStart: nextRow,
        });
        nextRow += block.layout.rowSpan + 1;
      });
    } else if (mode === "columns") {
      const colSpan = Math.max(4, Math.floor(bounds.colSpan / sorted.length));
      sorted.forEach((block, index) => {
        const isLast = index === sorted.length - 1;
        const colStart = Math.min(WIKI_BLOCK_COLUMNS, bounds.minColStart + index * colSpan);
        const desiredSpan = isLast ? Math.max(block.layout.minColSpan || 1, bounds.maxColEnd - colStart + 1) : Math.max(block.layout.minColSpan || 1, colSpan - 1);
        layoutById.set(block.id, {
          colStart,
          colSpan: Math.max(1, Math.min(desiredSpan, WIKI_BLOCK_COLUMNS - colStart + 1)),
          rowStart: bounds.minRowStart,
          rowSpan: Math.max(block.layout.rowSpan, bounds.rowSpan),
        });
      });
    } else {
      let cursorCol = bounds.minColStart;
      let cursorRow = bounds.minRowStart;
      let currentRowHeight = 0;
      sorted.forEach((block) => {
        const blockSpan = Math.max(block.layout.minColSpan || 1, Math.min(block.layout.colSpan, Math.max(8, Math.floor(bounds.colSpan / 2))));
        const wouldOverflow = cursorCol > bounds.minColStart && cursorCol + blockSpan - 1 > bounds.maxColEnd;
        if (wouldOverflow) {
          cursorCol = bounds.minColStart;
          cursorRow += currentRowHeight + 1;
          currentRowHeight = 0;
        }
        layoutById.set(block.id, {
          colStart: cursorCol,
          colSpan: Math.min(blockSpan, WIKI_BLOCK_COLUMNS - cursorCol + 1),
          rowStart: cursorRow,
        });
        cursorCol += blockSpan + 1;
        currentRowHeight = Math.max(currentRowHeight, block.layout.rowSpan);
      });
    }

    const nextBlocks = pageBlocks.map((block) => {
      if (!selectedSet.has(block.id)) return normalizeWikiArticleBlock(block);
      return normalizeWikiArticleBlock({
        ...block,
        layout: {
          ...block.layout,
          ...(layoutById.get(block.id) || {}),
        },
        layoutGroupId: groupId,
        layoutGroupName: groupName,
        layoutGroupMode: mode,
        fluid: {
          ...block.fluid,
          widthMode: mode === "stack" ? "fill" : block.fluid?.widthMode || "fixed",
          heightMode: block.fluid?.heightMode || "hug",
          mobileBehavior: "stack",
        },
      });
    });

    updateBlocks(resolveWikiBlockCollisions(nextBlocks, sorted.map((block) => block.id)));
  }, [pageBlocks, selectedBlockIds, selectedBlocks, updateBlocks]);

  const ungroupSelectedBlocks = useCallback(() => {
    if (selectedBlockIds.length === 0) return;
    const selectedSet = new Set(selectedBlockIds);
    updateBlocks(pageBlocks.map((block) => (
      selectedSet.has(block.id)
        ? normalizeWikiArticleBlock({ ...block, layoutGroupId: "", layoutGroupName: "", layoutGroupMode: "manual" })
        : normalizeWikiArticleBlock(block)
    )));
  }, [pageBlocks, selectedBlockIds, updateBlocks]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const targetIsEditable = isEditableEventTarget(e.target);
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveRef.current();
      } else if (!targetIsEditable && (e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (!targetIsEditable && (e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandPalette(true);
      } else if (!targetIsEditable && editorCanvasMode === "edit" && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelectedBlocks();
      } else if (!targetIsEditable && editorCanvasMode === "edit" && (e.key === "Delete" || e.key === "Backspace")) {
        if (selectedBlockIds.length > 0) {
          e.preventDefault();
          removeSelectedBlocks();
        }
      } else if (!targetIsEditable && editorCanvasMode === "edit" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        if (selectedBlockIds.length > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 4 : 1;
          if (e.key === "ArrowLeft") nudgeSelectedBlocks(-step, 0);
          if (e.key === "ArrowRight") nudgeSelectedBlocks(step, 0);
          if (e.key === "ArrowUp") nudgeSelectedBlocks(0, -step);
          if (e.key === "ArrowDown") nudgeSelectedBlocks(0, step);
        }
      } else if (e.key === "Escape") {
        if (editingPanelId) setEditingPanelId(null);
        else if (showCommandPalette) setShowCommandPalette(false);
        else if (showRecoveryDrawer) setShowRecoveryDrawer(false);
        else if (showSpoilerInsert) setShowSpoilerInsert(false);
        else if (showLinkDialog) setShowLinkDialog(false);
        else if (showImageEmbed) setShowImageEmbed(false);
        else if (showTemplatePicker) setShowTemplatePicker(false);
        else if (showTemplateManager) setShowTemplateManager(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    duplicateSelectedBlocks,
    editorCanvasMode,
    editingPanelId,
    handleUndo,
    handleRedo,
    nudgeSelectedBlocks,
    removeSelectedBlocks,
    selectedBlockIds.length,
    showCommandPalette,
    showImageEmbed,
    showLinkDialog,
    showRecoveryDrawer,
    showSpoilerInsert,
    showTemplateManager,
    showTemplatePicker,
  ]);

  const addArticleTemplate = useCallback((templateId: "spell-directory" | "magic-spell" | "creature-reference" | "location-page" | "rules-reference") => {
    const startRow = getNextWikiBlockRow(pageBlocks);
    const blockSeed: WikiArticleBlock[] = [];

    if (templateId === "spell-directory") {
      blockSeed.push(...createMagicSpellListBlocks(startRow));
    } else if (templateId === "magic-spell") {
      blockSeed.push(...createMagicSpellArticleBlocks(startRow));
    } else if (templateId === "creature-reference") {
      blockSeed.push(
        normalizeWikiArticleBlock({ ...createDefaultBlock("keyValueBox", startRow), title: "Creature Profile", items: [
          { id: `item-${uid()}`, label: "Type", value: "" },
          { id: `item-${uid()}`, label: "Disposition", value: "" },
          { id: `item-${uid()}`, label: "Region", value: "" },
        ] }),
        normalizeWikiArticleBlock({ ...createDefaultBlock("richText", startRow), title: "Overview", html: "<p>Describe the creature here.</p>", layout: { ...createDefaultBlock("richText", startRow).layout, colStart: 5, colSpan: 8 } }),
        normalizeWikiArticleBlock({ ...createDefaultBlock("referenceTable", startRow + 5), title: "Traits and Actions", columns: ["Name", "Type", "Effect"], rows: [{ id: `row-${uid()}`, cells: ["Trait Name", "Trait", "Describe the behavior."] }] }),
      );
    } else if (templateId === "location-page") {
      blockSeed.push(
        normalizeWikiArticleBlock({ ...createDefaultBlock("image", startRow), title: "Feature Image", imageCaption: "Location overview", layout: { ...createDefaultBlock("image", startRow).layout, colSpan: 5 } }),
        normalizeWikiArticleBlock({ ...createDefaultBlock("richText", startRow), title: "Overview", html: "<p>Describe the location and its major purpose.</p>", layout: { ...createDefaultBlock("richText", startRow).layout, colStart: 6, colSpan: 7 } }),
        normalizeWikiArticleBlock({ ...createDefaultBlock("keyValueBox", startRow + 6), title: "Location Details", items: [
          { id: `item-${uid()}`, label: "Region", value: "" },
          { id: `item-${uid()}`, label: "Danger Level", value: "" },
          { id: `item-${uid()}`, label: "Notable Trait", value: "" },
        ] }),
      );
    } else {
      blockSeed.push(
        normalizeWikiArticleBlock({ ...createDefaultBlock("heading", startRow), title: "Rules Reference", subtitle: "System notes and rulings", headingLevel: 2 }),
        normalizeWikiArticleBlock({ ...createDefaultBlock("richText", startRow + 2), title: "Summary", html: "<p>State the rule or ruling in a clean summary paragraph.</p>" }),
        normalizeWikiArticleBlock({ ...createDefaultBlock("calloutPanel", startRow + 7), title: "DM Note", html: "<p>Use this callout for exceptions or reminders.</p>", layout: { ...createDefaultBlock("calloutPanel", startRow + 7).layout, colSpan: 4 } }),
        normalizeWikiArticleBlock({ ...createDefaultBlock("referenceTable", startRow + 7), title: "Examples", layout: { ...createDefaultBlock("referenceTable", startRow + 7).layout, colStart: 5, colSpan: 8 }, columns: ["Case", "Outcome"], rows: [{ id: `row-${uid()}`, cells: ["Example", "Result"] }] }),
      );
    }

    updateBlocks(resolveWikiBlockCollisions([...pageBlocks, ...blockSeed], blockSeed[0]?.id));
    selectExclusiveBlock(blockSeed[0]?.id || null);
  }, [pageBlocks, selectExclusiveBlock, updateBlocks]);

  const insertPreset = useCallback((preset: WikiBlockPreset, anchor?: { colStart: number; rowStart: number }) => {
    const nextBlocks = instantiateWikiBlockPreset(preset, anchor);
    if (!nextBlocks.length) return;
    updateBlocks(resolveWikiBlockCollisions([...pageBlocks, ...nextBlocks], nextBlocks.map((block) => block.id)));
    setSelectedBlockIds(nextBlocks.map((block) => block.id));
    setInspectorTab("layout");
    setCanvasInsertPicker(null);
    setPresetStatus(`Inserted preset: ${preset.name}`);
  }, [pageBlocks, updateBlocks]);

  const saveSelectionAsPreset = useCallback(async () => {
    if (selectedBlocks.length === 0) {
      setError("Select one or more blocks before saving a preset.");
      return;
    }
    const name = window.prompt("Preset name", selectedBlocks[0]?.title || "Custom Preset")?.trim();
    if (!name) return;
    const description = window.prompt("Preset description", selectedBlocks.length > 1 ? "Reusable multi-block layout" : "Reusable block preset")?.trim() || "";
    const bounds = getWikiBlockLayoutBounds(selectedBlocks);
    const preset = normalizeWikiBlockPreset({
      id: `wiki-preset-${uid()}`,
      name,
      description,
      category: selectedBlocks.length > 1 ? "Layouts" : "Blocks",
      builtIn: false,
      blocks: selectedBlocks.map((block) => normalizeWikiArticleBlock({
        ...block,
        layout: {
          ...block.layout,
          colStart: block.layout.colStart - bounds.minColStart + 1,
          rowStart: block.layout.rowStart - bounds.minRowStart + 1,
        },
      })),
    });
    try {
      await persistWikiPresetLibrary([...wikiBlockPresets, preset], `Saved preset: ${name}`);
    } catch {}
  }, [persistWikiPresetLibrary, selectedBlocks, wikiBlockPresets]);

  const duplicatePresetToLibrary = useCallback(async (preset: WikiBlockPreset) => {
    const duplicate = normalizeWikiBlockPreset({
      ...preset,
      id: `wiki-preset-${uid()}`,
      name: `${preset.name} Copy`,
      builtIn: false,
      blocks: preset.blocks.map((block) => normalizeWikiArticleBlock({
        ...block,
        id: `wiki-block-${uid()}`,
      })),
    });
    try {
      await persistWikiPresetLibrary([...wikiBlockPresets, duplicate], `Copied preset: ${preset.name}`);
      setWorkspaceRailTab("presets");
    } catch {}
  }, [persistWikiPresetLibrary, wikiBlockPresets]);

  const renameStoredPreset = useCallback(async (presetId: string) => {
    const target = wikiBlockPresets.find((preset) => preset.id === presetId);
    if (!target) return;
    const nextName = window.prompt("Rename preset", target.name)?.trim();
    if (!nextName) return;
    try {
      await persistWikiPresetLibrary(
        wikiBlockPresets.map((preset) => preset.id === presetId ? { ...preset, name: nextName } : preset),
        `Renamed preset: ${nextName}`,
      );
    } catch {}
  }, [persistWikiPresetLibrary, wikiBlockPresets]);

  const deleteStoredPreset = useCallback(async (presetId: string) => {
    const target = wikiBlockPresets.find((preset) => preset.id === presetId);
    if (!target) return;
    if (!window.confirm(`Delete preset "${target.name}"?`)) return;
    try {
      await persistWikiPresetLibrary(
        wikiBlockPresets.filter((preset) => preset.id !== presetId),
        `Deleted preset: ${target.name}`,
      );
    } catch {}
  }, [persistWikiPresetLibrary, wikiBlockPresets]);

  const applySelectionLayoutAction = useCallback((
    action:
      | "align-left"
      | "align-center"
      | "align-right"
      | "align-top"
      | "align-middle"
      | "align-bottom"
      | "distribute-horizontal"
      | "distribute-vertical"
      | "match-width"
      | "match-height",
  ) => {
    if (selectedBlocks.length < 2) return;
    const selectedSet = new Set(selectedBlockIds);
    const sortedByCols = [...selectedBlocks].sort((a, b) => a.layout.colStart - b.layout.colStart || compareWikiBlocksForLayout(a, b));
    const sortedByRows = [...selectedBlocks].sort((a, b) => a.layout.rowStart - b.layout.rowStart || compareWikiBlocksForLayout(a, b));
    const primary = selectedBlocks[0];
    const nextLayouts = new Map<string, Partial<WikiArticleBlock["layout"]>>();

    if (action === "align-left") {
      selectedBlocks.forEach((block) => nextLayouts.set(block.id, { colStart: selectedBlockBounds.minColStart }));
    } else if (action === "align-center") {
      const center = selectedBlockBounds.minColStart + Math.floor(selectedBlockBounds.colSpan / 2);
      selectedBlocks.forEach((block) => nextLayouts.set(block.id, { colStart: Math.max(1, center - Math.floor(block.layout.colSpan / 2)) }));
    } else if (action === "align-right") {
      selectedBlocks.forEach((block) => nextLayouts.set(block.id, {
        colStart: Math.max(1, selectedBlockBounds.maxColEnd - block.layout.colSpan + 1),
      }));
    } else if (action === "align-top") {
      selectedBlocks.forEach((block) => nextLayouts.set(block.id, { rowStart: selectedBlockBounds.minRowStart }));
    } else if (action === "align-middle") {
      const middle = selectedBlockBounds.minRowStart + Math.floor(selectedBlockBounds.rowSpan / 2);
      selectedBlocks.forEach((block) => nextLayouts.set(block.id, { rowStart: Math.max(1, middle - Math.floor(block.layout.rowSpan / 2)) }));
    } else if (action === "align-bottom") {
      selectedBlocks.forEach((block) => nextLayouts.set(block.id, {
        rowStart: Math.max(1, selectedBlockBounds.maxRowEnd - block.layout.rowSpan + 1),
      }));
    } else if (action === "distribute-horizontal") {
      const totalWidth = sortedByCols.reduce((sum, block) => sum + block.layout.colSpan, 0);
      const gap = sortedByCols.length > 1 ? Math.max(0, Math.floor((selectedBlockBounds.colSpan - totalWidth) / (sortedByCols.length - 1))) : 0;
      let cursor = sortedByCols[0]?.layout.colStart || selectedBlockBounds.minColStart;
      sortedByCols.forEach((block, index) => {
        if (index === 0) {
          cursor = block.layout.colStart + block.layout.colSpan + gap;
          return;
        }
        nextLayouts.set(block.id, { colStart: cursor });
        cursor += block.layout.colSpan + gap;
      });
    } else if (action === "distribute-vertical") {
      const totalHeight = sortedByRows.reduce((sum, block) => sum + block.layout.rowSpan, 0);
      const gap = sortedByRows.length > 1 ? Math.max(0, Math.floor((selectedBlockBounds.rowSpan - totalHeight) / (sortedByRows.length - 1))) : 0;
      let cursor = sortedByRows[0]?.layout.rowStart || selectedBlockBounds.minRowStart;
      sortedByRows.forEach((block, index) => {
        if (index === 0) {
          cursor = block.layout.rowStart + block.layout.rowSpan + gap;
          return;
        }
        nextLayouts.set(block.id, { rowStart: cursor });
        cursor += block.layout.rowSpan + gap;
      });
    } else if (action === "match-width") {
      selectedBlocks.slice(1).forEach((block) => nextLayouts.set(block.id, { colSpan: primary.layout.colSpan }));
    } else if (action === "match-height") {
      selectedBlocks.slice(1).forEach((block) => nextLayouts.set(block.id, { rowSpan: primary.layout.rowSpan }));
    }

    const nextBlocks = pageBlocks.map((block) => {
      if (!selectedSet.has(block.id)) return normalizeWikiArticleBlock(block);
      const layoutDelta = nextLayouts.get(block.id);
      if (!layoutDelta) return normalizeWikiArticleBlock(block);
      return clampWikiBlockLayout(normalizeWikiArticleBlock({
        ...block,
        layout: {
          ...block.layout,
          ...layoutDelta,
        },
      }));
    });

    updateBlocks(resolveWikiBlockCollisions(nextBlocks, selectedBlockIds[0]));
  }, [pageBlocks, selectedBlockBounds, selectedBlockIds, selectedBlocks, updateBlocks]);

  const renderWikiBlockSummary = useCallback((block: WikiArticleBlock) => {
    switch (block.type) {
      case "heading":
        return block.title || "Heading";
      case "image":
        return block.imageCaption || block.imageUrl || "Image block";
      case "referenceTable":
        return `${block.columns?.length || 0} columns, ${block.rows?.length || 0} rows`;
      case "keyValueBox":
        return `${block.items?.length || 0} key values`;
      case "wikiLinksList":
        return `${block.articleIds?.length || 0} linked articles`;
      case "divider":
        return block.dividerLabel || "Divider";
      case "lineBox":
        return `${block.lineOrientation === "vertical" ? "Vertical" : "Horizontal"} line`;
      case "spacer":
        return `Spacer x${block.spacerHeight || 1}`;
      default: {
        const plain = collectWikiBlockHtmlStrings([block]).join(" ").replace(/\s+/g, " ").trim();
        return plain.slice(0, 80) || "No content yet";
      }
    }
  }, []);

  const handleLibraryDragStart = useCallback((event: React.DragEvent, type: WikiBlockType) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/wiki-block-type", type);
    setDraggedBlockType(type);
    setDraggedBlockId(null);
    setDraggedImageAssetId(null);
  }, []);

  const handleStoredImageDragStart = useCallback((event: React.DragEvent, image: StoredImageAsset) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/wiki-image-asset-id", image.id);
    setDraggedImageAssetId(image.id);
    setDraggedBlockType(null);
    setDraggedBlockId(null);
  }, []);

  const handleCanvasBlockDragStart = useCallback((event: React.DragEvent, blockId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/wiki-block-id", blockId);
    setDraggedBlockId(blockId);
    setDraggedBlockType(null);
    setDraggedImageAssetId(null);
  }, []);

  const clearCanvasDragState = useCallback(() => {
    setDraggedBlockId(null);
    setDraggedBlockType(null);
    setDraggedImageAssetId(null);
    setCanvasDropPreview(null);
  }, []);

  const beginCanvasBlockMove = useCallback((event: React.MouseEvent, blockId: string) => {
    const block = pageBlocks.find((entry) => entry.id === blockId);
    const metrics = getCanvasGridMetrics();
    if (!block || !metrics || block.locked) return;
    event.preventDefault();
    event.stopPropagation();
    movingBlockRef.current = {
      blockId,
      originColStart: block.layout.colStart,
      originRowStart: block.layout.rowStart,
      colWidth: metrics.colWidth,
      rowHeight: metrics.rowHeight,
      startClientX: event.clientX,
      startClientY: event.clientY,
      colSpan: block.layout.colSpan,
    };
    setMovingBlockId(blockId);
    selectExclusiveBlock(blockId);
    setCanvasInsertPicker(null);
  }, [getCanvasGridMetrics, pageBlocks, selectExclusiveBlock]);

  useEffect(() => {
    if (!movingBlockId) return;
    const handleMouseMove = (event: MouseEvent) => {
      const state = movingBlockRef.current;
      if (!state) return;
      const source = pageBlocks.find((entry) => entry.id === state.blockId);
      if (!source) return;
      const deltaCols = Math.round((event.clientX - state.startClientX) / Math.max(state.colWidth, 1));
      const deltaRows = Math.round((event.clientY - state.startClientY) / Math.max(state.rowHeight, 1));
      const nextColStart = source.layout.allowOverflow
        ? state.originColStart + deltaCols
        : Math.max(1, Math.min(WIKI_BLOCK_COLUMNS - state.colSpan + 1, state.originColStart + deltaCols));
      const nextRowStart = source.layout.allowOverflow ? state.originRowStart + deltaRows : Math.max(1, state.originRowStart + deltaRows);
      setLiveBlockLayouts((prev) => ({
        ...prev,
        [state.blockId]: {
          ...source.layout,
          colStart: nextColStart,
          rowStart: nextRowStart,
        },
      }));
    };

    const handleMouseUp = () => {
      const state = movingBlockRef.current;
      if (!state) return;
      const draft = liveBlockLayouts[state.blockId];
      if (draft) {
        updateBlocks(placeWikiBlock(pageBlocks, state.blockId, draft));
      }
      setLiveBlockLayouts((prev) => {
        const next = { ...prev };
        delete next[state.blockId];
        return next;
      });
      movingBlockRef.current = null;
      setMovingBlockId(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [liveBlockLayouts, movingBlockId, pageBlocks, updateBlocks]);

  useEffect(() => {
    if (!movingArticleChromeField) return;

    const handleMouseMove = (event: MouseEvent) => {
      const state = movingArticleChromeRef.current;
      if (!state) return;
      const fallback = articleChromeLayouts[state.field] || DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS[state.field];
      const deltaCols = Math.round((event.clientX - state.startClientX) / Math.max(state.colWidth, 1));
      const deltaRows = Math.round((event.clientY - state.startClientY) / Math.max(state.rowHeight, 1));
      const nextLayout = clampArticleChromeLayout({
        ...fallback,
        colStart: Math.max(1, Math.min(WIKI_BLOCK_COLUMNS - state.colSpan + 1, state.originColStart + deltaCols)),
        rowStart: Math.max(1, state.originRowStart + deltaRows),
      }, fallback);
      setLiveArticleChromeLayouts((prev) => ({
        ...prev,
        [state.field]: nextLayout,
      }));
    };

    const handleMouseUp = () => {
      const state = movingArticleChromeRef.current;
      if (state) {
        const draft = liveArticleChromeLayouts[state.field];
        if (draft) updateArticleChromeLayout(state.field, draft);
      }
      setLiveArticleChromeLayouts((prev) => {
        const next = { ...prev };
        if (state) delete next[state.field];
        return next;
      });
      movingArticleChromeRef.current = null;
      setMovingArticleChromeField(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [articleChromeLayouts, clampArticleChromeLayout, liveArticleChromeLayouts, movingArticleChromeField, updateArticleChromeLayout]);

  const handleCanvasMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    const rect = blockCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (event.shiftKey) {
      const nextPlacement = getCanvasGridPlacement(event.clientX, event.clientY, createDefaultBlock("richText").layout);
      if (!nextPlacement) return;
      event.preventDefault();
      setCanvasInsertPicker({
        colStart: nextPlacement.colStart,
        rowStart: nextPlacement.rowStart,
        left: nextPlacement.left,
        top: nextPlacement.top,
      });
      return;
    }
    if (event.target === event.currentTarget) {
      setCanvasInsertPicker(null);
      const nextMarquee = {
        startX: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
        startY: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
        currentX: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
        currentY: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
      };
      marqueeSelectionRef.current = nextMarquee;
      setMarqueeSelection(nextMarquee);
      selectExclusiveBlock(null);
    }
  }, [getCanvasGridPlacement, selectExclusiveBlock]);

  const updateCanvasDropPreview = useCallback((event: React.DragEvent) => {
    const blockSeed = draggedBlockId
      ? pageBlocks.find((block) => block.id === draggedBlockId)
      : draggedBlockType
        ? createDefaultBlock(draggedBlockType)
        : draggedImageAssetId
          ? createDefaultBlock("image")
          : null;
    if (!blockSeed) {
      setCanvasDropPreview(null);
      return;
    }
    const placement = getCanvasGridPlacement(event.clientX, event.clientY, blockSeed.layout);
    if (!placement) return;
    setCanvasDropPreview({
      colStart: placement.colStart,
      rowStart: placement.rowStart,
      colSpan: placement.colSpan,
      rowSpan: placement.rowSpan,
    });
  }, [draggedBlockId, draggedBlockType, draggedImageAssetId, getCanvasGridPlacement, pageBlocks]);

  const handleCanvasDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const draggedBlockId = event.dataTransfer.getData("application/wiki-block-id");
    const draggedBlockType = event.dataTransfer.getData("application/wiki-block-type") as WikiBlockType | "";
    const draggedImageAssetId = event.dataTransfer.getData("application/wiki-image-asset-id");
    const blockSeed = draggedBlockId
      ? pageBlocks.find((block) => block.id === draggedBlockId)
      : draggedBlockType
        ? createDefaultBlock(draggedBlockType)
        : draggedImageAssetId
          ? createDefaultBlock("image")
          : null;
    const placement = blockSeed ? getCanvasGridPlacement(event.clientX, event.clientY, blockSeed.layout) : null;
    if (!placement) {
      clearCanvasDragState();
      return;
    }

    if (draggedBlockId) {
      updateBlocks(placeWikiBlock(pageBlocks, draggedBlockId, { colStart: placement.colStart, rowStart: placement.rowStart }));
      selectExclusiveBlock(draggedBlockId);
      clearCanvasDragState();
      return;
    }

    if (draggedBlockType) {
      addBlock(draggedBlockType, { layout: { colStart: placement.colStart, rowStart: placement.rowStart } as WikiArticleBlock["layout"] });
    }
    if (draggedImageAssetId) {
      const image = storedImages.find((asset) => asset.id === draggedImageAssetId);
      addBlock("image", {
        title: image?.name || "Stored Image",
        imageUrl: image?.src || "",
        imageAlt: image?.alt || image?.name || "",
        imageCaption: image?.name || "",
        imageStorageAssetId: image?.id || draggedImageAssetId,
        imageFocalX: 50,
        imageFocalY: 50,
        imageCaptionPlacement: "below",
        layout: { colStart: placement.colStart, rowStart: placement.rowStart } as WikiArticleBlock["layout"],
      });
    }
    clearCanvasDragState();
  }, [addBlock, clearCanvasDragState, getCanvasGridPlacement, pageBlocks, selectExclusiveBlock, storedImages, updateBlocks]);

  const resolveBlockPalette = useCallback((block: WikiArticleBlock) => {
    const styleDef = block.style ? allPanelStyles.find((entry) => entry.id === block.style) : null;
    return {
      accent: block.appearance.accentColor || styleDef?.accent || accent,
      background: block.appearance.backgroundColor || (styleDef?.bg && styleDef.bg !== "transparent" ? styleDef.bg : "rgba(8, 13, 33, 0.96)"),
      border: block.appearance.borderColor || styleDef?.border || "#20335B",
    };
  }, [accent, allPanelStyles]);

  const updateReferenceTableCell = useCallback((blockId: string, rowId: string, cellIndex: number, value: string) => {
    updateSingleBlock(blockId, (block) => ({
      ...block,
      rows: (block.rows || []).map((row) => (
        row.id === rowId
          ? { ...row, cells: row.cells.map((cell, index) => (index === cellIndex ? value : cell)) }
          : row
      )),
    }));
  }, [updateSingleBlock]);

  const moveReferenceTableRow = useCallback((blockId: string, rowId: string, direction: -1 | 1) => {
    updateSingleBlock(blockId, (block) => {
      const rows = block.rows || [];
      const rowIndex = rows.findIndex((row) => row.id === rowId);
      if (rowIndex < 0) return block;
      const nextIndex = rowIndex + direction;
      if (nextIndex < 0 || nextIndex >= rows.length) return block;
      return { ...block, rows: reorder(rows, rowIndex, nextIndex) };
    });
  }, [updateSingleBlock]);

  const removeReferenceTableRow = useCallback((blockId: string, rowId: string) => {
    updateSingleBlock(blockId, (block) => ({
      ...block,
      rows: (block.rows || []).filter((row) => row.id !== rowId),
    }));
  }, [updateSingleBlock]);

  const duplicateReferenceTableRow = useCallback((blockId: string, rowId: string) => {
    updateSingleBlock(blockId, (block) => {
      const rows = block.rows || [];
      const rowIndex = rows.findIndex((row) => row.id === rowId);
      if (rowIndex < 0) return block;
      const clone = { ...rows[rowIndex], id: `row-${uid()}`, cells: [...rows[rowIndex].cells] };
      const nextRows = [...rows];
      nextRows.splice(rowIndex + 1, 0, clone);
      return { ...block, rows: nextRows };
    });
  }, [updateSingleBlock]);

  const moveReferenceTableColumn = useCallback((blockId: string, columnIndex: number, direction: -1 | 1) => {
    updateSingleBlock(blockId, (block) => {
      const columns = block.columns || [];
      const nextIndex = columnIndex + direction;
      if (nextIndex < 0 || nextIndex >= columns.length) return block;
      return {
        ...block,
        columns: reorder(columns, columnIndex, nextIndex),
        rows: (block.rows || []).map((row) => ({
          ...row,
          cells: reorder(row.cells, columnIndex, nextIndex),
        })),
      };
    });
  }, [updateSingleBlock]);

  const removeReferenceTableColumn = useCallback((blockId: string, columnIndex: number) => {
    updateSingleBlock(blockId, (block) => ({
      ...block,
      columns: (block.columns || []).filter((_, index) => index !== columnIndex),
      rows: (block.rows || []).map((row) => ({
        ...row,
        cells: row.cells.filter((_, index) => index !== columnIndex),
      })),
    }));
  }, [updateSingleBlock]);

  const duplicateReferenceTableColumn = useCallback((blockId: string, columnIndex: number) => {
    updateSingleBlock(blockId, (block) => {
      const columns = block.columns || [];
      if (columnIndex < 0 || columnIndex >= columns.length) return block;
      const nextColumns = [...columns];
      nextColumns.splice(columnIndex + 1, 0, `${columns[columnIndex] || "Column"} Copy`);
      return {
        ...block,
        columns: nextColumns,
        rows: (block.rows || []).map((row) => {
          const nextCells = [...row.cells];
          nextCells.splice(columnIndex + 1, 0, row.cells[columnIndex] || "");
          return { ...row, cells: nextCells };
        }),
      };
    });
  }, [updateSingleBlock]);

  const updateTabbedReferenceTab = useCallback((blockId: string, tabId: string, updater: (tab: NonNullable<WikiArticleBlock["tabs"]>[number]) => NonNullable<WikiArticleBlock["tabs"]>[number]) => {
    updateSingleBlock(blockId, (block) => ({
      ...block,
      tabs: (block.tabs || []).map((tab) => (tab.id === tabId ? updater(tab) : tab)),
    }));
  }, [updateSingleBlock]);

  const addTabbedReferenceTab = useCallback((blockId: string) => {
    const tabId = `tab-${uid()}`;
    updateSingleBlock(blockId, (block) => {
      const sourceTab = (block.tabs || [])[0];
      const columns = sourceTab?.columns?.length ? sourceTab.columns : ["Name", "Level", "School", "Summary"];
      const nextIndex = (block.tabs || []).length + 1;
      return {
        ...block,
        activeTabId: tabId,
        tabs: [
          ...(block.tabs || []),
          {
            id: tabId,
            label: `Level ${nextIndex}`,
            title: `Level ${nextIndex}`,
            columns,
            rows: [{ id: `row-${uid()}`, cells: Array.from({ length: columns.length }, () => "") }],
            html: "",
          },
        ],
      };
    });
    setActiveTabbedReferenceTabs((prev) => ({ ...prev, [blockId]: tabId }));
  }, [updateSingleBlock]);

  const removeTabbedReferenceTab = useCallback((blockId: string, tabId: string) => {
    updateSingleBlock(blockId, (block) => {
      const nextTabs = (block.tabs || []).filter((tab) => tab.id !== tabId);
      const nextActiveId = nextTabs[0]?.id || "";
      return { ...block, tabs: nextTabs, activeTabId: nextActiveId };
    });
    setActiveTabbedReferenceTabs((prev) => {
      const next = { ...prev };
      delete next[blockId];
      return next;
    });
  }, [updateSingleBlock]);

  const moveTabbedReferenceTab = useCallback((blockId: string, tabId: string, direction: -1 | 1) => {
    updateSingleBlock(blockId, (block) => {
      const tabs = block.tabs || [];
      const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex < 0) return block;
      const nextIndex = tabIndex + direction;
      if (nextIndex < 0 || nextIndex >= tabs.length) return block;
      return { ...block, tabs: reorder(tabs, tabIndex, nextIndex) };
    });
  }, [updateSingleBlock]);

  const updateTabbedReferenceCell = useCallback((blockId: string, tabId: string, rowId: string, cellIndex: number, value: string) => {
    updateTabbedReferenceTab(blockId, tabId, (tab) => ({
      ...tab,
      rows: tab.rows.map((row) => (
        row.id === rowId
          ? { ...row, cells: row.cells.map((cell, index) => (index === cellIndex ? value : cell)) }
          : row
      )),
    }));
  }, [updateTabbedReferenceTab]);

  const addTabbedReferenceRow = useCallback((blockId: string, tabId: string) => {
    updateTabbedReferenceTab(blockId, tabId, (tab) => ({
      ...tab,
      rows: [...tab.rows, { id: `row-${uid()}`, cells: Array.from({ length: tab.columns.length || 1 }, () => "") }],
    }));
  }, [updateTabbedReferenceTab]);

  const addTabbedReferenceColumn = useCallback((blockId: string, tabId: string) => {
    updateTabbedReferenceTab(blockId, tabId, (tab) => ({
      ...tab,
      columns: [...tab.columns, "New Column"],
      rows: tab.rows.map((row) => ({ ...row, cells: [...row.cells, ""] })),
    }));
  }, [updateTabbedReferenceTab]);

  const moveKeyValueItem = useCallback((blockId: string, itemId: string, direction: -1 | 1) => {
    updateSingleBlock(blockId, (block) => {
      const items = block.items || [];
      const itemIndex = items.findIndex((item) => item.id === itemId);
      if (itemIndex < 0) return block;
      const nextIndex = itemIndex + direction;
      if (nextIndex < 0 || nextIndex >= items.length) return block;
      return { ...block, items: reorder(items, itemIndex, nextIndex) };
    });
  }, [updateSingleBlock]);

  const removeKeyValueItem = useCallback((blockId: string, itemId: string) => {
    updateSingleBlock(blockId, (block) => ({
      ...block,
      items: (block.items || []).filter((item) => item.id !== itemId),
    }));
  }, [updateSingleBlock]);

  const duplicateKeyValueItem = useCallback((blockId: string, itemId: string) => {
    updateSingleBlock(blockId, (block) => {
      const items = block.items || [];
      const itemIndex = items.findIndex((item) => item.id === itemId);
      if (itemIndex < 0) return block;
      const clone = { ...items[itemIndex], id: `item-${uid()}`, label: `${items[itemIndex].label || "Label"} Copy` };
      const nextItems = [...items];
      nextItems.splice(itemIndex + 1, 0, clone);
      return { ...block, items: nextItems };
    });
  }, [updateSingleBlock]);

  const moveWikiLinkItem = useCallback((blockId: string, articleId: string, direction: -1 | 1) => {
    updateSingleBlock(blockId, (block) => {
      const articleIds = block.articleIds || [];
      const articleIndex = articleIds.findIndex((entry) => entry === articleId);
      if (articleIndex < 0) return block;
      const nextIndex = articleIndex + direction;
      if (nextIndex < 0 || nextIndex >= articleIds.length) return block;
      return { ...block, articleIds: reorder(articleIds, articleIndex, nextIndex) };
    });
  }, [updateSingleBlock]);

  const removeWikiLinkItem = useCallback((blockId: string, articleId: string) => {
    updateSingleBlock(blockId, (block) => ({
      ...block,
      articleIds: (block.articleIds || []).filter((entry) => entry !== articleId),
    }));
  }, [updateSingleBlock]);

  const renderEditableWikiBlock = useCallback((block: WikiArticleBlock) => {
    const palette = resolveBlockPalette(block);
    const isSelected = !editorPreviewMode && selectedBlockIds.includes(block.id);
    const hasRestriction = block.visibility.assignedTo.length > 0;
    const previewAllowed = !previewAsPlayerId || !hasRestriction || block.visibility.assignedTo.includes(previewAsPlayerId);
    const previewHidden = !!previewAsPlayerId && hasRestriction && block.visibility.mode === "hidden" && !previewAllowed;
    const requiresPreviewReveal = !!previewAsPlayerId && block.visibility.mode === "spoiler" && ((!hasRestriction) || !previewAllowed);
    const previewRevealed = revealedPanels.has(block.id);
    const collapseKey = `collapse-${block.id}`;
    const collapseRevealed = revealedPanels.has(collapseKey);
    const isCollapsedForPreview = editorPreviewMode && !!block.behavior?.collapsible && !!block.behavior?.defaultCollapsed && !collapseRevealed;
    const titleColor = block.appearance.titleColor || palette.accent;
    const bodyColor = block.appearance.bodyColor || txt;
    const titleAlign = (block.appearance.titleAlign || "left") as React.CSSProperties["textAlign"];
    const bodyAlign = (block.appearance.bodyAlign || "left") as React.CSSProperties["textAlign"];
    const contentOverflow = block.behavior?.overflowMode === "scroll" ? "auto" : "hidden";
    const tablePad = block.tableDensity === "dense" ? 4 : block.tableDensity === "compact" ? 6 : 8;
    const linkDisplayMode = block.wikiLinksDisplayMode || "list";
    const revealLabel = block.visibility.revealLabel || (block.visibility.mode === "hidden" ? "Hidden Block" : "Spoiler Block");
    const revealAfter = block.visibility.revealAfter || "";
    const revealNote = block.visibility.revealNote || "";

    if (previewHidden) {
      return (
        <div className="h-full flex items-center justify-center text-center px-4" style={{ color: "#A67A7A", background: "rgba(14, 8, 8, 0.92)" }}>
          <div>
            <EyeOff size={18} className="mx-auto mb-2" />
            <div className="text-[12px] font-bold">{revealLabel}</div>
            <div className="text-[10px] mt-1">
              This block is hidden for the current previewed player.
            </div>
            {revealAfter && (
              <div className="text-[10px] mt-2" style={{ color: "#D79A7A" }}>
                Reveal after: {revealAfter}
              </div>
            )}
            {revealNote && (
              <div className="text-[9px] mt-1" style={{ color: "#8A6A6A" }}>
                DM note: {revealNote}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (isCollapsedForPreview) {
      return (
        <button
          onClick={() => setRevealedPanels((prev) => new Set([...prev, collapseKey]))}
          className="h-full w-full px-4 text-left hover:opacity-90"
          style={{ color: bodyColor, textAlign: bodyAlign, background: "rgba(0,0,0,0.14)" }}
        >
          <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: palette.accent, fontWeight: 700 }}>
            Collapsed Block
          </div>
          <div className="mt-1 text-[15px] font-bold" style={{ color: titleColor, textAlign: titleAlign }}>
            {block.title || block.subtitle || `Collapsed ${block.type}`}
          </div>
          <div className="mt-2 text-[11px]" style={{ color: mutedText }}>
            Click to expand this block in preview.
          </div>
        </button>
      );
    }

    if (requiresPreviewReveal && !previewRevealed) {
      return (
        <div className="h-full flex items-center justify-center text-center px-4" style={{ color: "#FFAA6A", background: "rgba(18, 10, 10, 0.88)" }}>
          <div>
            <Shield size={18} className="mx-auto mb-2" />
            <div className="text-[12px] font-bold">{revealLabel}</div>
            <div className="text-[10px] mt-1" style={{ color: "#A67A7A" }}>
              This block is restricted in the current preview mode.
            </div>
            {revealAfter && (
              <div className="text-[10px] mt-2" style={{ color: "#FFCA9A" }}>
                Reveal after: {revealAfter}
              </div>
            )}
            <button
              onClick={() => setRevealedPanels((prev) => new Set([...prev, block.id]))}
              className="mt-3 px-3 py-1 text-[10px] hover:opacity-90"
              style={{ color: "#FF8A6A", background: "#1A0A0A", border: "1px solid #5A2A2A", fontWeight: 600 }}
            >
              Show Anyway
            </button>
          </div>
        </div>
      );
    }

    const paddingMode = block.appearance.padding || "normal";
    const horizontalPad = paddingMode === "tight" ? 8 : paddingMode === "loose" ? 16 : 12;
    const verticalPad = paddingMode === "tight" ? 6 : paddingMode === "loose" ? 14 : 9;
    const blockShellStyle: React.CSSProperties = {
      padding: `${verticalPad}px ${horizontalPad}px`,
      color: bodyColor,
      textAlign: bodyAlign,
    };
    const blockHeaderStyle: React.CSSProperties = {
      padding: `${verticalPad}px ${horizontalPad}px ${Math.max(8, verticalPad - 1)}px`,
      textAlign: titleAlign,
    };
    const blockContentStyle: React.CSSProperties = {
      padding: `${block.title || block.subtitle ? 0 : verticalPad}px ${horizontalPad}px ${verticalPad}px`,
      color: bodyColor,
      textAlign: bodyAlign,
    };

    const richEditor = (placeholder: string, html: string, onChange: (nextHtml: string) => void) => (
      isSelected || inlinePreviewEditorTarget === block.id
        ? (
          <RichTextEditor
            value={html}
            onChange={onChange}
            placeholder={placeholder}
            minHeight={0}
            enableWikiLayouts
            floatingToolbar
            fillHeight
            wikiLinkOptions={wikiLinkOptions}
          />
        )
        : (
          <RenderFormattedText text={html || `<p style="opacity:.55">${placeholder}</p>`} color={bodyColor} font={font} currentPlayerId={previewAsPlayerId || undefined} isDM={!previewAsPlayerId} />
        )
    );

    switch (block.type) {
      case "heading":
        return (
          <div className="h-full flex flex-col justify-center gap-1" style={blockShellStyle}>
            <InlineEdit
              tag={(block.headingLevel === 1 ? "h1" : block.headingLevel === 3 ? "h3" : "h2")}
              value={block.title}
              onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, title: value }))}
              placeholder="Heading title"
              style={{ color: titleColor, fontWeight: 700, fontSize: block.headingLevel === 1 ? 28 : block.headingLevel === 3 ? 18 : 22, textAlign: titleAlign }}
            />
            <InlineEdit
              tag="p"
              value={block.subtitle || ""}
              onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, subtitle: value }))}
              placeholder="Optional subtitle"
              style={{ color: mutedText, fontStyle: "italic", fontSize: 12, textAlign: titleAlign }}
            />
          </div>
        );
      case "image":
        return (
          <div className="h-full flex flex-col gap-2" style={blockShellStyle}>
            <div
              className="relative min-h-0 flex-1 overflow-hidden rounded-md"
              style={{
                border: block.imageFrameStyle === "none" ? "none" : `${block.imageFrameStyle === "thick" ? 3 : 1}px solid ${palette.border}`,
                background: "#050518",
                padding: block.imageFrameStyle === "polaroid" ? 8 : block.imageFrameStyle === "terminal" ? 4 : 0,
              }}
            >
              {block.imageUrl ? (
                <img
                  src={block.imageUrl}
                  alt={block.imageAlt || block.title || "Article media"}
                  className="h-full w-full"
                  style={{
                    objectFit: block.cropMode === "cover" ? "cover" : "contain",
                    objectPosition: `${block.imageFocalX ?? 50}% ${block.imageFocalY ?? 50}%`,
                    background: "#050518",
                  }}
                />
              ) : (
                <div className="h-full border border-dashed flex items-center justify-center px-4 text-center text-[11px]" style={{ borderColor: `${palette.border}99`, color: mutedText }}>
                  Add an image URL, choose Image Storage, or drag a stored image here.
                </div>
              )}
              {(block.imageCaption || block.title) && block.imageCaptionPlacement === "overlay" && (
                <div className="absolute inset-x-0 bottom-0 px-3 py-2 text-[11px]" style={{ color: "#E8F0FF", background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.82))", fontStyle: block.imageCaptionStyle === "terminal" ? undefined : "italic" }}>
                  {block.imageCaption || block.title}
                </div>
              )}
            </div>
            {block.imageCaptionPlacement !== "hidden" && block.imageCaptionPlacement !== "overlay" && (
            <div className="shrink-0">
              <InlineEdit
                tag="div"
                value={block.imageCaption || ""}
                onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, imageCaption: value }))}
                placeholder="Image caption"
                style={{ color: block.imageCaptionStyle === "terminal" ? palette.accent : mutedText, fontSize: 11, fontStyle: block.imageCaptionStyle === "plain" ? "italic" : undefined, textAlign: bodyAlign }}
              />
            </div>
            )}
          </div>
        );
      case "calloutPanel":
      case "spoilerBlock":
        return (
          <div className="h-full flex flex-col">
            <div className="shrink-0 space-y-1" style={blockHeaderStyle}>
              <InlineEdit
                tag="h2"
                value={block.title || ""}
                onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, title: value }))}
                placeholder="Block title"
                style={{ color: titleColor, fontWeight: 700, fontSize: 18, textAlign: titleAlign }}
              />
              <InlineEdit
                tag="p"
                value={block.subtitle || ""}
                onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, subtitle: value }))}
                placeholder="Optional subtitle"
                style={{ color: mutedText, fontSize: 11, fontStyle: "italic", textAlign: titleAlign }}
              />
            </div>
            <div className="min-h-0 flex-1" style={{ ...blockContentStyle, overflow: contentOverflow }}>
              {richEditor("Write callout content...", block.html, (nextHtml) => updateSingleBlock(block.id, (entry) => ({ ...entry, html: nextHtml })))}
            </div>
          </div>
        );
      case "referenceTable":
        return (
          <div className="h-full flex flex-col" style={blockShellStyle}>
            <div className="shrink-0 pb-2">
              <InlineEdit
                tag="h2"
                value={block.title || ""}
                onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, title: value }))}
                placeholder="Table title"
                style={{ color: titleColor, fontWeight: 700, fontSize: 16, textAlign: titleAlign }}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border" style={{ borderColor: palette.border }}>
              <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                <thead style={{ background: "rgba(255,255,255,0.04)" }}>
                  <tr>
                    {(block.columns || []).map((column, columnIndex) => (
                      <th key={`${block.id}-column-${columnIndex}`} className="text-left align-top border-b" style={{ padding: tablePad, position: block.tableStickyHeader ? "sticky" : undefined, top: block.tableStickyHeader ? 0 : undefined, background: block.tableStickyHeader ? "#071126" : undefined, borderBottomColor: palette.border, color: titleColor }}>
                        {isSelected ? (
                          <input
                            value={column}
                            onChange={(event) => updateSingleBlock(block.id, (entry) => ({ ...entry, columns: (entry.columns || []).map((value, index) => (index === columnIndex ? event.target.value : value)) }))}
                            className={`${retro.sunken} w-full bg-[#080A24] px-1.5 py-1 text-[10px]`}
                            style={{ color: txt }}
                          />
                        ) : column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(block.rows || []).map((row, rowIndex) => (
                    <tr key={row.id} style={{ background: block.tableStripedRows && rowIndex % 2 === 1 ? "rgba(255,255,255,0.035)" : undefined }}>
                      {row.cells.map((cell, cellIndex) => (
                        <td key={`${row.id}-${cellIndex}`} className="align-top border-b" style={{ padding: tablePad, borderBottomColor: `${palette.border}66`, color: bodyColor }}>
                          {isSelected ? (
                            <textarea
                              value={cell}
                              onChange={(event) => updateReferenceTableCell(block.id, row.id, cellIndex, event.target.value)}
                              rows={2}
                              className={`${retro.sunken} w-full bg-[#080A24] px-1.5 py-1 text-[10px] resize-y`}
                              style={{ color: txt }}
                            />
                          ) : (
                            cell
                              ? block.tableLinkedCells
                                ? <RenderFormattedText text={cell} color={bodyColor} font={font} currentPlayerId={previewAsPlayerId || undefined} isDM={!previewAsPlayerId} />
                                : cell
                              : <span style={{ color: mutedText }}>Empty</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case "tabbedReference": {
        const tabs = block.tabs || [];
        const activeTabId = activeTabbedReferenceTabs[block.id] || block.activeTabId || tabs[0]?.id || "";
        const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];
        return (
          <div className="h-full flex flex-col" style={blockShellStyle}>
            <div className="shrink-0 pb-2">
              <InlineEdit
                tag="h2"
                value={block.title || ""}
                onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, title: value }))}
                placeholder="Tabbed reference title"
                style={{ color: titleColor, fontWeight: 700, fontSize: 16, textAlign: titleAlign }}
              />
              {block.subtitle && (
                <InlineEdit
                  tag="p"
                  value={block.subtitle || ""}
                  onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, subtitle: value }))}
                  placeholder="Optional subtitle"
                  style={{ color: mutedText, fontSize: 11, fontStyle: "italic", textAlign: titleAlign }}
                />
              )}
            </div>
            <div className="shrink-0 mb-2 flex flex-wrap gap-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveTabbedReferenceTabs((prev) => ({ ...prev, [block.id]: tab.id }));
                  }}
                  className="rounded-md border px-2 py-1 text-[10px] transition-opacity hover:opacity-85"
                  style={{
                    borderColor: tab.id === activeTab?.id ? palette.accent : `${palette.border}AA`,
                    background: tab.id === activeTab?.id ? `${palette.accent}22` : "rgba(255,255,255,0.035)",
                    color: tab.id === activeTab?.id ? titleColor : bodyColor,
                    fontWeight: tab.id === activeTab?.id ? 700 : 500,
                  }}
                >
                  {tab.label || "Tab"}
                </button>
              ))}
            </div>
            {activeTab ? (
              <div className="min-h-0 flex-1 overflow-auto rounded-md border" style={{ borderColor: palette.border }}>
                <div className="border-b px-2 py-1.5" style={{ borderBottomColor: `${palette.border}88`, background: "rgba(255,255,255,0.035)" }}>
                  {isSelected ? (
                    <input
                      value={activeTab.title || ""}
                      onChange={(event) => updateTabbedReferenceTab(block.id, activeTab.id, (tab) => ({ ...tab, title: event.target.value }))}
                      placeholder="Active tab title"
                      className={`${retro.sunken} w-full bg-[#080A24] px-2 py-1 text-[10px]`}
                      style={{ color: txt }}
                    />
                  ) : (
                    <div className="text-[11px] font-bold" style={{ color: titleColor }}>
                      {activeTab.title || activeTab.label}
                    </div>
                  )}
                </div>
                <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                  <thead style={{ background: "rgba(255,255,255,0.04)" }}>
                    <tr>
                      {(activeTab.columns || []).map((column, columnIndex) => (
                        <th key={`${activeTab.id}-column-${columnIndex}`} className="text-left align-top border-b" style={{ padding: tablePad, position: block.tableStickyHeader ? "sticky" : undefined, top: block.tableStickyHeader ? 0 : undefined, background: block.tableStickyHeader ? "#071126" : undefined, borderBottomColor: palette.border, color: titleColor }}>
                          {isSelected ? (
                            <input
                              value={column}
                              onChange={(event) => updateTabbedReferenceTab(block.id, activeTab.id, (tab) => ({ ...tab, columns: tab.columns.map((value, index) => (index === columnIndex ? event.target.value : value)) }))}
                              className={`${retro.sunken} w-full bg-[#080A24] px-1.5 py-1 text-[10px]`}
                              style={{ color: txt }}
                            />
                          ) : column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeTab.rows || []).map((row, rowIndex) => (
                      <tr key={row.id} style={{ background: block.tableStripedRows && rowIndex % 2 === 1 ? "rgba(255,255,255,0.035)" : undefined }}>
                        {row.cells.map((cell, cellIndex) => (
                          <td key={`${row.id}-${cellIndex}`} className="align-top border-b" style={{ padding: tablePad, borderBottomColor: `${palette.border}66`, color: bodyColor }}>
                            {isSelected ? (
                              <textarea
                                value={cell}
                                onChange={(event) => updateTabbedReferenceCell(block.id, activeTab.id, row.id, cellIndex, event.target.value)}
                                rows={2}
                                className={`${retro.sunken} w-full bg-[#080A24] px-1.5 py-1 text-[10px] resize-y`}
                                style={{ color: txt }}
                              />
                            ) : (
                              cell
                                ? block.tableLinkedCells
                                  ? <RenderFormattedText text={cell} color={bodyColor} font={font} currentPlayerId={previewAsPlayerId || undefined} isDM={!previewAsPlayerId} />
                                  : cell
                                : <span style={{ color: mutedText }}>Empty</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="min-h-0 flex-1 rounded-md border border-dashed px-4 py-8 text-center text-[11px]" style={{ borderColor: `${palette.border}99`, color: mutedText }}>
                Add a tab to start this button-cycle reference box.
              </div>
            )}
          </div>
        );
      }
      case "keyValueBox":
        return (
          <div className="h-full flex flex-col" style={blockShellStyle}>
            <div className="shrink-0 pb-2">
              <InlineEdit
                tag="h2"
                value={block.title || ""}
                onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, title: value }))}
                placeholder="Key-value box title"
                style={{ color: titleColor, fontWeight: 700, fontSize: 16, textAlign: titleAlign }}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-auto" style={{ display: "flex", flexDirection: "column", gap: block.keyValueDensity === "dense" ? 4 : block.keyValueDensity === "compact" ? 6 : 8 }}>
              {(block.items || []).map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(90px,0.9fr)_1fr] gap-2 items-start" style={{ borderBottom: block.keyValueRowDividers ? `1px solid ${palette.border}55` : undefined, paddingBottom: block.keyValueRowDividers ? 6 : undefined }}>
                  {isSelected ? (
                    <>
                      <input
                        value={item.label}
                        onChange={(event) => updateSingleBlock(block.id, (entry) => ({ ...entry, items: (entry.items || []).map((row) => (row.id === item.id ? { ...row, label: event.target.value } : row)) }))}
                        className={`${retro.sunken} bg-[#080A24] px-2 py-1 text-[10px]`}
                        style={{ color: palette.accent }}
                      />
                      <input
                        value={item.value}
                        onChange={(event) => updateSingleBlock(block.id, (entry) => ({ ...entry, items: (entry.items || []).map((row) => (row.id === item.id ? { ...row, value: event.target.value } : row)) }))}
                        className={`${retro.sunken} bg-[#080A24] px-2 py-1 text-[10px]`}
                        style={{ color: txt }}
                      />
                    </>
                  ) : (
                    <>
                      <span style={{ color: titleColor, fontWeight: 700, textAlign: block.keyValueLabelAlign }}>{item.label}</span>
                      <span style={{ color: bodyColor }}>{item.value}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      case "wikiLinksList":
        return (
          <div className="h-full flex flex-col" style={blockShellStyle}>
            <div className="shrink-0 pb-2">
              <InlineEdit
                tag="h2"
                value={block.title || ""}
                onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, title: value }))}
                placeholder="Related links"
                style={{ color: titleColor, fontWeight: 700, fontSize: 16, textAlign: titleAlign }}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-auto text-[11px]" style={{ display: "flex", flexDirection: linkDisplayMode === "chips" ? "row" : "column", flexWrap: linkDisplayMode === "chips" ? "wrap" : undefined, gap: linkDisplayMode === "cards" ? 8 : 4 }}>
              {(block.articleIds || []).length === 0 && (
                <div style={{ color: mutedText }}>No linked articles yet.</div>
              )}
              {(block.articleIds || []).map((articleId) => {
                const article = blockIdToPage.get(articleId);
                return (
                  <button
                    key={articleId}
                    onClick={() => article && window.open(`/interface/inet-page/${article.id}`, "_blank")}
                    className="text-left px-2 py-1 rounded-md border hover:opacity-85"
                    style={{ width: linkDisplayMode === "chips" ? "auto" : "100%", color: bodyColor, borderColor: `${palette.border}77`, background: linkDisplayMode === "cards" ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.03)" }}
                  >
                    {article?.title || articleId}
                  </button>
                );
              })}
            </div>
          </div>
        );
      case "divider":
        return (
          <div className="h-full flex flex-col justify-center gap-2" style={blockShellStyle}>
            {dividerLineElement(block.appearance.dividerStyle, palette.border, palette.accent)}
            <InlineEdit
              tag="div"
              value={block.dividerLabel || ""}
              onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, dividerLabel: value }))}
              placeholder="Optional divider label"
              style={{ color: mutedText, fontSize: 10, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.18em" }}
            />
          </div>
        );
      case "lineBox":
        return (
          <div
            className="h-full w-full"
            style={{
              ...blockShellStyle,
              padding: 0,
              overflow: "hidden",
            }}
          >
            {lineBoxElement(block.lineOrientation, block.appearance.dividerStyle, palette.border, palette.accent, block.lineThickness)}
          </div>
        );
      case "spacer":
        return (
          <div className="h-full rounded-md border border-dashed flex items-center justify-center text-[11px] m-2.5" style={{ borderColor: `${palette.border}99`, color: mutedText }}>
            Spacer block
          </div>
        );
      case "richText":
      default:
        return (
          <div className="h-full flex flex-col">
            {(block.title || block.subtitle) && (
              <div className="shrink-0 space-y-1" style={blockHeaderStyle}>
                <InlineEdit
                  tag="h2"
                  value={block.title || ""}
                  onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, title: value }))}
                  placeholder="Section title"
                  style={{ color: titleColor, fontWeight: 700, fontSize: 18, textAlign: titleAlign }}
                />
                <InlineEdit
                  tag="p"
                  value={block.subtitle || ""}
                  onChange={(value) => updateSingleBlock(block.id, (entry) => ({ ...entry, subtitle: value }))}
                  placeholder="Section subtitle"
                  style={{ color: mutedText, fontSize: 11, fontStyle: "italic", textAlign: titleAlign }}
                />
              </div>
            )}
            <div className="min-h-0 flex-1" style={{ ...blockContentStyle, overflow: contentOverflow }}>
              {richEditor("Write article text here...", block.html, (nextHtml) => updateSingleBlock(block.id, (entry) => ({ ...entry, html: nextHtml })))}
            </div>
          </div>
        );
    }
  }, [activeTabbedReferenceTabs, blockIdToPage, editorPreviewMode, inlinePreviewEditorTarget, mutedText, previewAsPlayerId, resolveBlockPalette, selectedBlockIds, txt, updateReferenceTableCell, updateSingleBlock, updateTabbedReferenceCell, updateTabbedReferenceTab, wikiLinkOptions]);

  const renderArticleChromeBox = useCallback((field: WikiArticleChromeField) => {
    const layout = articleChromeLayouts[field] || DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS[field];
    const left = `${((layout.colStart - 1) / WIKI_BLOCK_COLUMNS) * 100}%`;
    const width = `${(layout.colSpan / WIKI_BLOCK_COLUMNS) * 100}%`;
    const top = (layout.rowStart - 1) * canvasRowHeight;
    const height = layout.rowSpan * canvasRowHeight;
    const chromeVisible = !editorPreviewMode && (hoveredArticleChromeField === field || movingArticleChromeField === field);
    const isSelectedChrome = selectedArticleChromeField === field;
    const fieldLabel = getArticleChromeFieldLabel(field);
    const outlineColor = field === "title" ? accent : field === "subtitle" ? "#8EA9D7" : "#6AAFAF";

    const content = (() => {
      if (field === "title") {
        return editorPreviewMode ? (
          <h1 className="m-0 leading-tight" style={{ color: txt, fontWeight: 700, fontSize: 30 }}>
            {page.title || "Untitled Article"}
          </h1>
        ) : (
          <InlineEdit
            tag="h1"
            value={page.title}
            onChange={(value) => { update("title", value); if (!urlManuallyEdited.current) update("url", toSlug(value)); }}
            placeholder="Article title"
            style={{ color: txt, fontWeight: 700, fontSize: 30, lineHeight: 1.12 }}
          />
        );
      }
      if (field === "subtitle") {
        return editorPreviewMode ? (
          page.subtitle ? (
            <p className="m-0 leading-snug" style={{ color: mutedText, fontSize: 15, fontStyle: "italic" }}>
              {page.subtitle}
            </p>
          ) : null
        ) : (
          <InlineEdit
            tag="p"
            value={page.subtitle || ""}
            onChange={(value) => update("subtitle", value)}
            placeholder="Subtitle"
            style={{ color: mutedText, fontSize: 15, fontStyle: "italic", lineHeight: 1.25 }}
          />
        );
      }
      return editorPreviewMode ? (
        page.description ? (
          <p className="m-0 leading-relaxed" style={{ color: txt, fontSize: 13 }}>
            {page.description}
          </p>
        ) : null
      ) : (
        <InlineEdit
          tag="div"
          value={page.description || ""}
          onChange={(value) => update("description", value)}
          placeholder="Article description"
          multiline
          style={{ color: txt, fontSize: 13, lineHeight: 1.55 }}
        />
      );
    })();

    const box = (
      <div
        className="h-full overflow-hidden"
        onMouseEnter={() => setHoveredArticleChromeField(field)}
        onMouseLeave={() => setHoveredArticleChromeField((current) => (current === field ? null : current))}
        onClick={(event) => {
          if (editorPreviewMode) return;
          event.stopPropagation();
          selectArticleChromeField(field);
        }}
        style={{
          position: "relative",
          borderRadius: 10,
          border: editorPreviewMode ? "1px solid transparent" : `1px ${chromeVisible || isSelectedChrome ? "solid" : "dashed"} ${chromeVisible || isSelectedChrome ? outlineColor : `${outlineColor}66`}`,
          background: editorPreviewMode ? "transparent" : "rgba(6, 12, 30, 0.18)",
          boxShadow: isSelectedChrome && !editorPreviewMode ? `0 0 0 1px ${outlineColor}55, 0 12px 28px rgba(0,0,0,0.2)` : undefined,
        }}
      >
        {!editorPreviewMode && (
          <div
            className="absolute left-0 right-0 z-[5] flex min-h-[32px] items-center gap-2 rounded-t-[10px] border-b px-2.5 py-1.5 transition-all duration-150"
            style={{
              top: 0,
              opacity: chromeVisible ? 1 : 0,
              transform: `translateY(${chromeVisible ? 0 : -2}px)`,
              pointerEvents: chromeVisible ? "auto" : "none",
              borderColor: `${outlineColor}AA`,
              background: "linear-gradient(180deg, rgba(5,10,28,0.95), rgba(5,10,28,0.78))",
              backdropFilter: "blur(6px)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
            }}
          >
            <button
              onMouseDown={(event) => beginArticleChromeMove(event, field)}
              className="cursor-grab active:cursor-grabbing"
              title={`Move article ${fieldLabel.toLowerCase()}`}
            >
              <GripVertical size={13} style={{ color: outlineColor }} />
            </button>
            <span className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-[0.18em]" style={{ color: outlineColor, fontWeight: 700 }}>
              Article {fieldLabel}
            </span>
          </div>
        )}
        <div className="h-full min-h-0 overflow-hidden px-3 py-2" style={{ paddingTop: 8 }}>
          {content}
        </div>
      </div>
    );

    if (editorPreviewMode) {
      return (
        <div key={field} className="absolute" style={{ left, width, top, height, pointerEvents: "none" }}>
          {box}
        </div>
      );
    }

    return (
      <div key={field} className="absolute" style={{ left, width, top, height, overflow: "visible" }}>
        <Resizable
          size={{ width: "100%", height: "100%" }}
          minWidth={Math.max((layout.minColSpan || 6) * ((articleChromeCanvasRef.current?.getBoundingClientRect().width || canvasRenderWidth) / WIKI_BLOCK_COLUMNS), 120)}
          minHeight={Math.max((layout.minRowSpan || 2) * canvasRowHeight, 48)}
          enable={{ right: true, bottom: true, bottomRight: true, bottomLeft: false, top: false, left: false, topLeft: false, topRight: false }}
          handleStyles={{
            right: { width: 10, right: -4, cursor: "ew-resize" },
            bottom: { height: 10, bottom: -4, cursor: "ns-resize" },
            bottomRight: { width: 12, height: 12, right: -5, bottom: -5, cursor: "nwse-resize" },
          }}
          handleClasses={{
            right: "rounded-r-md bg-[#4A7BFF]/70",
            bottom: "rounded-b-md bg-[#4A7BFF]/70",
            bottomRight: "rounded-br-md bg-[#8AB4FF]",
          }}
          onResize={(_event, _direction, ref) => {
            const rect = articleChromeCanvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const colWidth = rect.width / WIKI_BLOCK_COLUMNS;
            setLiveArticleChromeLayouts((prev) => ({
              ...prev,
              [field]: clampArticleChromeLayout({
                ...layout,
                colSpan: Math.round(ref.offsetWidth / Math.max(colWidth, 1)),
                rowSpan: Math.round(ref.offsetHeight / canvasRowHeight),
              }, layout),
            }));
          }}
          onResizeStop={(_event, _direction, ref) => {
            const rect = articleChromeCanvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const colWidth = rect.width / WIKI_BLOCK_COLUMNS;
            updateArticleChromeLayout(field, {
              colSpan: Math.round(ref.offsetWidth / Math.max(colWidth, 1)),
              rowSpan: Math.round(ref.offsetHeight / canvasRowHeight),
            });
            setLiveArticleChromeLayouts((prev) => {
              const next = { ...prev };
              delete next[field];
              return next;
            });
          }}
          style={{ overflow: "visible" }}
        >
          {box}
        </Resizable>
      </div>
    );
  }, [
    accent,
    articleChromeLayouts,
    beginArticleChromeMove,
    canvasRenderWidth,
    canvasRowHeight,
    clampArticleChromeLayout,
    editorPreviewMode,
    hoveredArticleChromeField,
    movingArticleChromeField,
    mutedText,
    page.description,
    page.subtitle,
    page.title,
    selectArticleChromeField,
    selectedArticleChromeField,
    txt,
    update,
    updateArticleChromeLayout,
  ]);

  const iconMode = page.pageIcon || "globe";
  const PageIcon = getPageIcon(iconMode === "none" || iconMode === "custom" ? undefined : iconMode);

  // TOC
  const tocItems: { id: string; label: string }[] = [];
  if (hasBody) tocItems.push({ id: "article-body", label: page.bodyTitle || "Overview" });
  panels.forEach((p) => {
    if (!p.title) return;
    const hasRestriction = p.assignedTo && p.assignedTo.length > 0;
    const vMode = p.visibilityMode || "spoiler";
    if (hasRestriction && vMode === "hidden" && previewAsPlayerId && !p.assignedTo.includes(previewAsPlayerId)) return;
    tocItems.push({ id: `panel-${p.id}`, label: p.title });
  });

  // --- Sidebar tabs for editor ---
  const sidebarTabs: { id: typeof activePanel; label: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> }[] = [
    { id: "preview", label: "Preview", icon: Eye },
    { id: "settings", label: "Article", icon: Settings },
    { id: "content", label: "Content", icon: Layers },
    { id: "metadata", label: "Metadata", icon: Tag },
    { id: "appearance", label: "Style", icon: Palette },
  ];

  const commandPaletteItems = useMemo<Array<{
    label: string;
    description: string;
    keywords: string;
    action: () => void;
    disabled?: boolean;
  }>>(() => ([
    { label: "Add Rich Text Block", description: "Insert a full-width writing block.", keywords: "text paragraph body", action: () => addBlock("richText") },
    { label: "Add Heading Block", description: "Insert a title or section heading.", keywords: "heading title section", action: () => addBlock("heading") },
    { label: "Add Image Block", description: "Insert an empty image/media block.", keywords: "image media picture", action: () => addBlock("image") },
    { label: "Add Reference Table", description: "Insert a structured table for spells, items, or rules.", keywords: "table reference list spells", action: () => addBlock("referenceTable") },
    { label: "Add Tabbed Reference", description: "Insert a button-cycle reference box for spell levels or grouped lists.", keywords: "tabbed reference spell tier level buttons cycle", action: () => addBlock("tabbedReference") },
    { label: "Add Key-Value Box", description: "Insert an infobox-style data block.", keywords: "infobox key value stats", action: () => addBlock("keyValueBox") },
    { label: "Add Line Box", description: "Insert a resizeable horizontal or vertical decorative line.", keywords: "line box horizontal vertical divider rule", action: () => addBlock("lineBox") },
    { label: "Insert Magic Spell List Template", description: "Add linked spell tables from Cantrip through Level 8.", keywords: "magic spell list directory template", action: () => addArticleTemplate("spell-directory") },
    { label: "Insert Magic Spell Template", description: "Add casting details and a focused spell description layout.", keywords: "magic spell detail template", action: () => addArticleTemplate("magic-spell") },
    { label: "Save Selection as Preset", description: "Create a reusable block preset from selected blocks.", keywords: "preset save reusable", action: () => void saveSelectionAsPreset(), disabled: selectedBlocks.length === 0 },
    { label: "Duplicate Selection", description: "Copy the selected block or block group.", keywords: "copy duplicate clone", action: duplicateSelectedBlocks, disabled: selectedBlocks.length === 0 },
    { label: "Make Selection a Stack", description: "Convert selected blocks into a clean vertical section.", keywords: "smart layout stack section", action: () => applySmartLayoutGroup("stack"), disabled: selectedBlocks.length < 2 },
    { label: "Make Selection Columns", description: "Convert selected blocks into an aligned column section.", keywords: "smart layout columns section", action: () => applySmartLayoutGroup("columns"), disabled: selectedBlocks.length < 2 },
    { label: "Make Selection Wrap Section", description: "Mark selected blocks as a responsive wrap section without changing placement.", keywords: "smart layout wrap responsive section", action: () => applySmartLayoutGroup("wrap"), disabled: selectedBlocks.length < 2 },
    { label: "Open Recovery Drawer", description: "View drafts, revisions, export, and import.", keywords: "history revision restore export import", action: () => setShowRecoveryDrawer(true) },
    { label: "Save Manual Revision", description: "Create a named recovery checkpoint.", keywords: "checkpoint revision snapshot", action: () => void saveManualRevision() },
    { label: "Switch to Edit Mode", description: "Show all authoring rails, grid guides, and handles.", keywords: "edit mode", action: () => setEditorCanvasMode("edit") },
    { label: "Switch to Clean Canvas", description: "Hide chrome for layout review.", keywords: "clean canvas preview", action: () => setEditorCanvasMode("clean") },
    { label: "Switch to Player Preview", description: "Hide editor chrome and review player-facing visibility.", keywords: "player preview", action: () => setEditorCanvasMode("player") },
    { label: "Preview Desktop Frame", description: "Review the authored desktop article frame.", keywords: "responsive desktop frame", action: () => setResponsiveFrameMode("desktop") },
    { label: "Preview Tablet Frame", description: "Review stacked tablet reflow.", keywords: "responsive tablet frame", action: () => setResponsiveFrameMode("tablet") },
    { label: "Preview Mobile Frame", description: "Review single-column mobile reflow.", keywords: "responsive mobile phone frame", action: () => setResponsiveFrameMode("mobile") },
  ]), [
    addArticleTemplate,
    addBlock,
    applySmartLayoutGroup,
    duplicateSelectedBlocks,
    saveManualRevision,
    saveSelectionAsPreset,
    selectedBlocks.length,
  ]);
  const visibleCommandPaletteItems = useMemo(() => {
    const query = commandPaletteQuery.trim().toLowerCase();
    if (!query) return commandPaletteItems;
    return commandPaletteItems.filter((item) =>
      `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(query),
    );
  }, [commandPaletteItems, commandPaletteQuery]);

  const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] w-full outline-none`;
  const inputStyle: React.CSSProperties = { color: "#C0D0F0" };
  const labelStyle: React.CSSProperties = { color: "#5A6A8A", fontSize: 11, fontWeight: 600 };

  const renderPreviewPanelCard = (panel: WikiPanel, zone: WikiPanelPlacement) => {
    const globalIdx = panels.findIndex((entry) => entry.id === panel.id);
    const ps = allPanelStyles.find((styleEntry) => styleEntry.id === panel.style) || allPanelStyles[0];
    const hasRestriction = panel.assignedTo && panel.assignedTo.length > 0;
    const vMode = panel.visibilityMode || "spoiler";
    const isPlayerAllowed = !hasRestriction || !previewAsPlayerId || panel.assignedTo.includes(previewAsPlayerId);
    const isRevealed = revealedPanels.has(panel.id);
    if (hasRestriction && vMode === "hidden" && previewAsPlayerId && !isPlayerAllowed) {
      return null;
    }
    const showContent = !previewAsPlayerId || isPlayerAllowed || isRevealed;
    const isSelected = selectedPreviewPanelId === panel.id;
    const isInlineEditing = inlinePreviewEditorTarget === panel.id;
    const panelPlacement = getWikiPanelPlacement(panel);
    const panelWidth = getWikiPanelWidth(panel);
    const mediaPosition = getWikiPanelMediaPosition(panel);
    const mediaFigure = panel.mediaUrl ? (
      <figure className="m-0 shrink-0" style={{ width: zone === "sidebar" || panelWidth === "half" || mediaPosition === "top" ? "100%" : 260 }}>
        <img
          src={panel.mediaUrl}
          alt={panel.mediaAlt || panel.title || "Panel media"}
          className="w-full object-cover"
          style={{ maxHeight: zone === "sidebar" ? 200 : 260, borderRadius: 6, border: `1px solid ${ps.border}`, background: "#050518" }}
          onError={(event) => {
            (event.target as HTMLImageElement).style.display = "none";
          }}
        />
        {panel.mediaCaption && (
          <figcaption className="mt-1 text-[10px] leading-relaxed" style={{ color: mutedText, fontStyle: "italic" }}>
            {panel.mediaCaption}
          </figcaption>
        )}
      </figure>
    ) : null;
    const contentBlock = isInlineEditing ? (
      <div className="space-y-2">
        <RichTextEditor
          value={panel.content}
          onChange={(html) => updatePanel(panel.id, { content: html })}
          placeholder="Write section content directly in the preview..."
          minHeight={160}
          enableWikiLayouts
          floatingToolbar
          wikiLinkOptions={wikiLinkOptions}
        />
        <div className="flex gap-2">
          <button
            onClick={() => {
              setInlinePreviewEditorTarget(null);
              setEditingPanelId(panel.id);
            }}
            className="text-[10px] px-2 py-1 hover:opacity-80"
            style={{ color: "#4AFF6A", border: "1px solid #1A3A1A" }}
          >
            Done Editing
          </button>
          <button
            onClick={() => {
              setLinkInsertTarget(panel.id);
              setShowLinkDialog(true);
            }}
            className="text-[10px] px-2 py-1 hover:opacity-80"
            style={{ color: "#FF6ABB", border: "1px solid #3A1A3B" }}
          >
            Insert Wiki Link
          </button>
        </div>
      </div>
    ) : panel.content ? (
      <div onClick={() => setInlinePreviewEditorTarget(panel.id)} style={DISPLAY_CONTENTS}>
        <RenderFormattedText text={panel.content} color={txt} font={font} currentPlayerId={previewAsPlayerId || undefined} isDM={!previewAsPlayerId} sectionRevealed={showContent} />
      </div>
    ) : (
      <button
        onClick={() => setInlinePreviewEditorTarget(panel.id)}
        className="w-full text-left px-3 py-3 text-[11px] hover:opacity-90"
        style={{ color: mutedText, border: `1px dashed ${ps.border}`, background: "rgba(10, 10, 40, 0.45)" }}
      >
        Add section text here...
      </button>
    );

    const contentWithMedia = showContent ? (
      <div className="space-y-3">
        {!isPlayerAllowed && isRevealed && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-[10px]" style={{ background: "#1A0A0A", border: "1px solid #3A1A1A", color: "#FF8A6A" }}>
            <AlertTriangle size={10} />
            <span>This section was revealed through a spoiler gate.</span>
          </div>
        )}
        {mediaFigure && mediaPosition === "top" && mediaFigure}
        {mediaFigure && mediaPosition !== "top" && zone === "body" && panelWidth === "full" ? (
          <div className={`flex flex-col gap-3 ${mediaPosition === "right" ? "md:flex-row-reverse" : "md:flex-row"}`}>
            {mediaFigure}
            <div className="min-w-0 flex-1">{contentBlock}</div>
          </div>
        ) : (
          <div className="min-w-0">{contentBlock}</div>
        )}
      </div>
    ) : (
      <div className="relative overflow-hidden" style={{ minHeight: 120 }}>
        <div style={{ filter: "blur(8px)", opacity: 0.15, padding: "16px 20px", pointerEvents: "none", userSelect: "none" }}>
          <div style={{ color: txt, fontFamily: font, fontSize: 13 }}>This content is hidden behind a spoiler or restriction warning...</div>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: ps.bg === "transparent" ? "linear-gradient(180deg, #0C0C2EEE 0%, #0C0C2EFF 100%)" : `linear-gradient(180deg, ${darken(ps.bg, 5)}EE 0%, ${ps.bg}FF 100%)`, backdropFilter: "blur(4px)" }}>
          <div className="flex items-center gap-2">
            <Shield size={18} style={S_RED} />
            <div>
              <div className="text-[12px]" style={{ color: "#FF6A6A", fontWeight: 700, fontFamily: font }}>Spoiler / Metagame Warning</div>
              <div className="text-[10px] mt-0.5" style={{ color: "#8A5A5A", fontFamily: font }}>This section is restricted for {previewPlayer?.name || "this player"}.</div>
            </div>
          </div>
          <button
            onClick={() => setRevealedPanels((prev) => new Set([...prev, panel.id]))}
            className="px-4 py-1.5 text-[11px] flex items-center gap-2 hover:opacity-90"
            style={{ color: "#FF8A6A", background: "#1A0A0A", border: "1px solid #5A2A2A", fontWeight: 600, fontFamily: font }}
          >
            <Eye size={11} /> Show Anyway
          </button>
        </div>
      </div>
    );

    return (
      <div
        key={panel.id}
        draggable
        onDragStart={handleDragStart(globalIdx)}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={handlePreviewRegionDrop(zone, panel.id)}
        onDragEnd={handleDragEnd}
        onClick={() => {
          setSelectedPreviewPanelId(panel.id);
          setEditingPanelId(panel.id);
        }}
        className="group rounded-[6px] transition-all"
        style={{
          border: `1px solid ${isSelected ? accent : ps.border}`,
          background: ps.bg === "transparent" ? "rgba(8, 10, 34, 0.55)" : ps.bg,
          boxShadow: isSelected ? `0 0 0 1px ${accent}55` : "none",
          opacity: dragIdx === globalIdx && dragType === "panel" ? 0.45 : 1,
        }}
      >
        <div
          className="px-3 py-2 flex flex-wrap items-center gap-2 border-b"
          style={{
            borderBottomColor: ps.border,
            background: ps.bg === "transparent" ? "rgba(8, 10, 34, 0.75)" : darken(ps.bg, 5),
          }}
        >
          <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: ps.accent, fontWeight: 700 }}>
            {panelPlacement === "sidebar" ? "Sidebar Box" : panelWidth === "half" ? "Half Block" : "Body Block"}
          </span>
          {hasRestriction ? (
            <span className="text-[9px] px-2 py-0.5 flex items-center gap-1" style={{ color: vMode === "hidden" ? "#FF6A6A" : "#FF6ABB", background: "#1A0A1A", border: "1px solid #3A1A3B" }}>
              {vMode === "hidden" ? <EyeOff size={8} /> : <Lock size={8} />}
              {vMode === "hidden" ? "Hidden" : "Spoiler"}
            </span>
          ) : (
            <span className="text-[9px] px-2 py-0.5 flex items-center gap-1" style={{ color: "#4A9A5A", background: "#0A1A0A", border: "1px solid #1A3A1A" }}>
              <Unlock size={8} /> Public
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <button
              onClick={(event) => {
                event.stopPropagation();
                setInlinePreviewEditorTarget(isInlineEditing ? null : panel.id);
                setSelectedPreviewPanelId(panel.id);
              }}
              className="text-[9px] px-2 py-1 hover:opacity-80"
              style={{ color: "#C0D0F0", border: "1px solid #2A3A5B", background: "#0A102E" }}
            >
              {isInlineEditing ? "Hide Editor" : "Edit In Place"}
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                setSelectedPreviewPanelId(panel.id);
                setEditingPanelId(panel.id);
                setActivePanel("content");
              }}
              className="text-[9px] px-2 py-1 hover:opacity-80"
              style={{ color: "#6A9AFF", border: "1px solid #1A3A6B" }}
            >
              Full Settings
            </button>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div className="space-y-1">
            <InlineEdit
              value={panel.title}
              onChange={(value) => updatePanel(panel.id, { title: value })}
              placeholder="Section title"
              tag="h2"
              style={{ color: zone === "sidebar" ? ps.accent : accent, fontWeight: 600, fontFamily: font, fontSize: zone === "sidebar" ? 15 : 18 }}
            />
            {(panel.subtitle || isSelected) && (
              <InlineEdit
                value={panel.subtitle || ""}
                onChange={(value) => updatePanel(panel.id, { subtitle: value })}
                placeholder="Optional subtitle..."
                tag="p"
                style={{ color: mutedText, fontFamily: font, fontSize: 11, fontStyle: "italic" }}
              />
            )}
          </div>

          {isSelected && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3" style={{ background: "#081125", border: "1px solid #1A2A4B" }}>
              <div>
                <label style={labelStyle}>Place In</label>
                <select
                  value={panelPlacement}
                  onChange={(event) => updatePanel(panel.id, { placement: event.target.value as WikiPanelPlacement, width: event.target.value === "sidebar" ? "full" : panel.width })}
                  className={`${retro.sunken} bg-[#0A0A28] px-2 py-1.5 text-[10px] w-full outline-none`}
                  style={inputStyle}
                >
                  <option value="body">Main Article Body</option>
                  <option value="sidebar">Sidebar Box Rail</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Block Width</label>
                <select
                  value={panelPlacement === "sidebar" ? "full" : panelWidth}
                  onChange={(event) => updatePanel(panel.id, { width: event.target.value as WikiPanelWidth })}
                  disabled={panelPlacement === "sidebar"}
                  className={`${retro.sunken} bg-[#0A0A28] px-2 py-1.5 text-[10px] w-full outline-none`}
                  style={{ ...inputStyle, opacity: panelPlacement === "sidebar" ? 0.45 : 1 }}
                >
                  <option value="full">Full Width</option>
                  <option value="half">Half Width</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label style={labelStyle}>Section Style</label>
                <select
                  value={panel.style || "blank"}
                  onChange={(event) => updatePanel(panel.id, { style: event.target.value })}
                  className={`${retro.sunken} bg-[#0A0A28] px-2 py-1.5 text-[10px] w-full outline-none`}
                  style={inputStyle}
                >
                  {allPanelStyles.map((styleEntry) => (
                    <option key={styleEntry.id} value={styleEntry.id}>
                      {styleEntry.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label style={labelStyle}>Panel Image URL</label>
                <input
                  type="text"
                  value={panel.mediaUrl || ""}
                  onChange={(event) => updatePanel(panel.id, { mediaUrl: event.target.value })}
                  placeholder="https://... image to place in this panel"
                  className={`${retro.sunken} bg-[#0A0A28] px-2 py-1.5 text-[10px] w-full outline-none`}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Image Caption</label>
                <input
                  type="text"
                  value={panel.mediaCaption || ""}
                  onChange={(event) => updatePanel(panel.id, { mediaCaption: event.target.value })}
                  placeholder="Caption..."
                  className={`${retro.sunken} bg-[#0A0A28] px-2 py-1.5 text-[10px] w-full outline-none`}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Image Position</label>
                <select
                  value={mediaPosition}
                  onChange={(event) => updatePanel(panel.id, { mediaPosition: event.target.value as WikiPanelMediaPosition })}
                  className={`${retro.sunken} bg-[#0A0A28] px-2 py-1.5 text-[10px] w-full outline-none`}
                  style={inputStyle}
                >
                  <option value="top">Top</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
          )}

          {contentWithMedia}
        </div>
      </div>
    );
  };

  if (wikiLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#080828" }}>
        <div className={`${retro.sunken} p-5 max-w-md w-full`} style={{ background: "#0A0A2E", border: "1px solid #1A1A4B" }}>
          <div className="text-[13px] font-bold mb-2" style={{ color: "#C0D0F0" }}>Loading wiki editor...</div>
          <div className="text-[11px]" style={{ color: "#6A7A9A" }}>
            {wikiLoadError || "Loading articles, players, wiki tags, and custom panel styles from Supabase."}
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-screen flex flex-col" style={{ background: "#07071F", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}>
        <div className={`${retro.toolbar} flex flex-col gap-3 px-4 py-3`} style={{ borderBottom: "2px solid #050520", background: "linear-gradient(180deg, #101943 0%, #081129 100%)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate("/interface/wiki-studio")}
                className="text-[11px] hover:opacity-80 flex items-center gap-1"
                style={S_ACCENT}
              >
                <ArrowLeft size={12} /> Wiki Studio
              </button>
              <span className="text-[11px]" style={S_DIM}>|</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[12px]" style={{ color: "#D3E1FF", fontWeight: 700 }}>
                  <Globe size={12} style={S_LINK} />
                  <span className="truncate max-w-[420px]">{page.title || "Untitled Article"}</span>
                </div>
                <div className="mt-0.5 text-[10px]" style={{ color: "#7A9ABB" }}>
                  {page.category || "Uncategorized"} | {blockCountLabel} | {selectedStatusLabel}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {saveFlash && (
                <span className="text-[10px] px-2.5 py-1 rounded-md" style={{ color: "#4AFF6A", background: "#0A1A0A", border: "1px solid #1A3A1A" }}>
                  Saved
                </span>
              )}
              {hasUnsaved && (
                <span className="text-[10px] px-2.5 py-1 rounded-md animate-pulse" style={{ color: "#FFAA4A", background: "#1A1A0A", border: "1px solid #3A3A1A" }}>
                  Unsaved
                </span>
              )}
              {error && (
                <span className="text-[10px] px-2.5 py-1 rounded-md flex items-center gap-1" style={{ color: "#FF8A8A", background: "#1A0A0A", border: "1px solid #3A1A1A" }}>
                  <AlertTriangle size={10} /> {error}
                </span>
              )}
              {(presetStatus || recoveryStatus) && (
                <span className="text-[10px] px-2.5 py-1 rounded-md" style={{ color: "#A8D8FF", background: "#08172E", border: "1px solid #1E4C7A" }}>
                  {presetStatus || recoveryStatus}
                </span>
              )}
              <button
                onClick={() => void copyPublicWikiLink()}
                disabled={isNew}
                className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1 disabled:opacity-40`}
                style={S_ACCENT}
                title={isNew ? "Publish this article before sharing it" : "Copy a public link that does not require login"}
              >
                <Link2 size={12} /> Public Link
              </button>
              <button
                onClick={handleSave}
                className={`${retro.button} px-4 py-1.5 text-[11px] flex items-center gap-1`}
                style={{ color: "#FFFFFF", background: "#2A5ABB", borderColor: "#4A7BFF", fontWeight: 700 }}
                title="Publish (Ctrl+S)"
              >
                <Save size={12} /> Publish
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-md border overflow-hidden" style={{ borderColor: "#1A345B", background: "#081226" }}>
                {([
                  ["edit", "Edit"],
                  ["clean", "Clean"],
                  ["player", "Player"],
                ] as [EditorCanvasMode, string][]).map(([mode, label]) => {
                  const active = editorCanvasMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setEditorCanvasMode(mode)}
                      className="px-3 py-1.5 text-[10px] transition-colors"
                      style={{
                        color: active ? "#FFFFFF" : "#7A8CAA",
                        background: active ? (mode === "player" ? "#0C4F2B" : "#17305A") : "transparent",
                        borderLeft: mode === "edit" ? "none" : "1px solid #1A345B",
                        fontWeight: active ? 700 : 500,
                      }}
                      title={editorModeCopy[mode].description}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-md" style={{ color: currentModeCopy.tone, background: "#071126", border: `1px solid ${currentModeCopy.tone}55` }}>
                {currentModeCopy.title}
              </span>
              <div className="flex items-center rounded-md border overflow-hidden" style={{ borderColor: "#1A345B", background: "#081226" }}>
                {(["desktop", "tablet", "mobile"] as ResponsiveFrameMode[]).map((mode) => {
                  const active = responsiveFrameMode === mode;
                  const option = RESPONSIVE_FRAME_OPTIONS[mode];
                  return (
                    <button
                      key={mode}
                      onClick={() => setResponsiveFrameMode(mode)}
                      className="px-2.5 py-1.5 text-[10px] transition-colors"
                      style={{
                        color: active ? "#FFFFFF" : "#7A8CAA",
                        background: active ? "#243B68" : "transparent",
                        borderLeft: mode === "desktop" ? "none" : "1px solid #1A345B",
                        fontWeight: active ? 700 : 500,
                      }}
                      title={option.description}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-md" style={{ color: articleHealth.color, background: "#071126", border: `1px solid ${articleHealth.color}55` }} title={articleHealth.detail}>
                {articleHealth.label}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleUndo} disabled={undoStack.length === 0} className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1 disabled:opacity-40`} title="Undo (Ctrl+Z)">
                <Undo2 size={11} style={S_LINK} /> Undo
              </button>
              <button onClick={handleRedo} disabled={redoStack.length === 0} className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1 disabled:opacity-40`} title="Redo (Ctrl+Y)">
                <Redo2 size={11} style={S_LINK} /> Redo
              </button>
              <button onClick={() => setShowCommandPalette(true)} className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1`} title="Command Palette (Ctrl+K)">
                <Keyboard size={11} style={{ color: "#A8D8FF" }} /> Commands
              </button>
              <button onClick={() => setShowTemplatePicker(true)} className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1`} title="Templates">
                <BookOpen size={11} style={S_WARN} /> Templates
              </button>
              <button onClick={() => setShowTemplateManager(true)} className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1`} title="Manage Templates">
                <FolderOpen size={11} style={S_ACCENT} /> Manage
              </button>
              <button onClick={() => setShowRecoveryDrawer(true)} className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1`} title="Recovery, Revisions, Export, and Import">
                <History size={11} style={{ color: "#FFCC7A" }} /> Recovery
              </button>
              <button onClick={() => navigate("/interface/wiki-graph")} className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1`} title="Article Graph">
                <Network size={11} style={{ color: "#9A7ABB" }} /> Graph
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          {!editorPreviewMode && (
          <div className="w-[300px] shrink-0 border-r flex flex-col" style={{ borderRightColor: "#15264B", background: "#081129" }}>
            <div className="border-b px-4 py-3" style={{ borderBottomColor: "#15264B", background: "linear-gradient(180deg, #0D1938 0%, #081129 100%)" }}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#8AB4FF", fontWeight: 700 }}>Workspace</div>
                  <div className="mt-1 text-[11px] leading-relaxed" style={{ color: "#9FB0CC" }}>
                    Build the article from blocks, presets, images, and page settings.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCommandPalette(true)}
                  className={`${retro.button} px-2 py-1 text-[9px]`}
                  style={S_SUBTLE}
                  title="Open command palette"
                >
                  Ctrl K
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 border-b" style={{ borderBottomColor: "#15264B" }}>
              {([
                { id: "outline", label: "Outline" },
                { id: "library", label: "Blocks" },
                { id: "presets", label: "Presets" },
                { id: "article", label: "Article" },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setWorkspaceRailTab(tab.id)}
                  className="px-3 py-2 text-[10px]"
                  style={{
                    color: workspaceRailTab === tab.id ? "#D3E1FF" : "#617290",
                    background: workspaceRailTab === tab.id ? "#0C1735" : "transparent",
                    borderBottom: workspaceRailTab === tab.id ? `2px solid ${accent}` : "2px solid transparent",
                    fontWeight: workspaceRailTab === tab.id ? 700 : 500,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border px-3 py-2" style={{ borderColor: "#19345E", background: "#09142D" }}>
                  <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Blocks</div>
                  <div className="mt-1 text-[13px] font-bold" style={{ color: "#D3E1FF" }}>{pageBlocks.length}</div>
                </div>
                <div className="rounded-md border px-3 py-2" style={{ borderColor: "#19345E", background: "#09142D" }}>
                  <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Selected</div>
                  <div className="mt-1 text-[13px] font-bold" style={{ color: "#D3E1FF" }}>{selectedArticleChromeField ? "Article" : selectedBlockIds.length || 0}</div>
                </div>
              </div>
              {(sharedImageStorageFallback || sharedPresetFallback) && (
                <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "#6A5520", background: "rgba(82, 52, 8, 0.28)", color: "#FFD37A" }}>
                  {sharedImageStorageFallback && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>Image Storage is using local fallback mode until the Supabase function route and publishable key are working again.</span>
                      <button
                        type="button"
                        onClick={() => void retrySharedImageStorage()}
                        className={`${retro.button} px-2 py-1 text-[9px]`}
                        style={{ color: "#FFF3C4", background: "#3A2B0A", borderColor: "#8A6A24" }}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {sharedPresetFallback && <div>Preset Library is also using local fallback mode right now.</div>}
                </div>
              )}
              <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: layoutQaFindings.length ? "#5A4720" : "#1A4A36", background: layoutQaFindings.length ? "rgba(82, 52, 8, 0.22)" : "rgba(8, 56, 35, 0.24)", color: layoutQaFindings.length ? "#FFD37A" : "#8FF0B8" }}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="uppercase tracking-[0.18em]" style={{ fontWeight: 700 }}>Layout QA</span>
                  <span>{layoutQaFindings.length || "Clear"}</span>
                </div>
                {layoutQaFindings.length === 0 ? (
                  <div style={{ color: "#9FDDB7" }}>No obvious layout, mobile, or media warnings found.</div>
                ) : (
                  <div className="space-y-1">
                    {layoutQaFindings.slice(0, 5).map((finding) => (
                      <div key={finding.id} style={{ color: finding.severity === "warn" ? "#FFD37A" : "#A8D8FF" }}>
                        {finding.text}
                      </div>
                    ))}
                    {layoutQaFindings.length > 5 && (
                      <div style={{ color: "#8EA9D7" }}>+{layoutQaFindings.length - 5} more note{layoutQaFindings.length - 5 === 1 ? "" : "s"}</div>
                    )}
                  </div>
                )}
              </div>

              {workspaceRailTab === "outline" && (
                <div className="space-y-3">
                  <div className="rounded-md border p-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div className="mb-2 text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Article Fields</div>
                    <div className="grid grid-cols-3 gap-2">
                      {articleChromeFields.map((field) => (
                        <button
                          key={`article-field-${field}`}
                          onClick={() => selectArticleChromeField(field)}
                          className={`${retro.button} px-2 py-1.5 text-[10px]`}
                          style={selectedArticleChromeField === field ? S_ACCENT : S_SUBTLE}
                        >
                          {getArticleChromeFieldLabel(field)}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-[10px] leading-relaxed" style={{ color: "#8091AE" }}>
                      Select these to edit their text, grid position, and size in the inspector.
                    </div>
                  </div>
                  {pageBlocks.length === 0 && (
                    <div className="rounded-lg border border-dashed px-4 py-5 text-center" style={{ borderColor: "#28466F", background: "rgba(9, 20, 45, 0.72)" }}>
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: "#31578A", background: "#0D1B3B", color: "#A8D8FF" }}>
                        <FileText size={18} />
                      </div>
                      <div className="text-[12px] font-bold" style={{ color: "#D3E1FF" }}>No blocks yet</div>
                      <div className="mt-1 text-[10px] leading-relaxed" style={{ color: "#8CA0C2" }}>
                        Start with a template, add a rich text block, or drag a preset onto the canvas.
                      </div>
                      <div className="mt-3 flex justify-center gap-2">
                        <button onClick={() => setWorkspaceRailTab("library")} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_ACCENT}>
                          Add Blocks
                        </button>
                        <button onClick={() => setShowTemplatePicker(true)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_SUBTLE}>
                          Templates
                        </button>
                      </div>
                    </div>
                  )}
                  {pageBlocks.map((block, index) => (
                    <div
                      key={block.id}
                      className="rounded-md border px-3 py-3 transition-colors"
                      style={{
                        borderColor: selectedBlockIds.includes(block.id) ? accent : "#1A2E55",
                        background: selectedBlockIds.includes(block.id) ? "#0C1735" : "#081027",
                      }}
                    >
                      <button
                        onClick={(event) => {
                          handleBlockSelection(block.id, event.shiftKey || event.ctrlKey || event.metaKey);
                          setInspectorTab("content");
                        }}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] uppercase tracking-[0.2em]" style={{ color: "#6A9AFF" }}>{block.type}</span>
                          <span className="text-[9px] ml-auto" style={{ color: "#506382" }}>
                            {index + 1} | C{block.layout.colStart}-{block.layout.colStart + block.layout.colSpan - 1}
                          </span>
                        </div>
                        <div className="text-[12px] font-bold" style={{ color: "#D3E1FF" }}>
                          {block.title || `Untitled ${block.type}`}
                        </div>
                        <div className="text-[10px] mt-1 leading-relaxed" style={{ color: "#8091AE" }}>
                          {renderWikiBlockSummary(block)}
                        </div>
                      </button>
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => duplicateBlock(block.id)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_ACCENT}>Duplicate</button>
                        <button onClick={() => updateSingleBlock(block.id, (entry) => ({ ...entry, locked: !entry.locked }))} className={`${retro.button} px-2 py-1 text-[9px]`} style={block.locked ? S_WARN : S_SUBTLE}>
                          {block.locked ? "Unlock" : "Lock"}
                        </button>
                        <button onClick={() => removeBlock(block.id)} className={`${retro.button} px-2 py-1 text-[9px] ml-auto`} style={S_RED}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {workspaceRailTab === "library" && (
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: "#7A9ABB", fontWeight: 700 }}>Block Palette</div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["richText", "Rich Text", "Lists, links, and body copy"],
                        ["heading", "Heading", "Section title or anchor"],
                        ["image", "Image", "Art, maps, portraits"],
                        ["calloutPanel", "Callout", "Lore box or warning"],
                        ["referenceTable", "Ref Table", "Sortable info grid"],
                        ["tabbedReference", "Tabbed Ref", "Button-cycled lists"],
                        ["keyValueBox", "Key-Value", "Infobox facts"],
                        ["spoilerBlock", "Spoiler", "Reveal-gated content"],
                        ["wikiLinksList", "Wiki Links", "Related pages"],
                        ["divider", "Divider", "Section break"],
                        ["lineBox", "Line Box", "Vertical or horizontal rule"],
                        ["spacer", "Spacer", "Breathing room"],
                      ] as [WikiBlockType, string, string][]).map(([type, label, description]) => (
                        <button
                          key={type}
                          draggable
                          onDragStart={(event) => handleLibraryDragStart(event, type)}
                          onDragEnd={clearCanvasDragState}
                          onClick={() => addBlock(type)}
                          className="rounded-md border px-2 py-2 text-left text-[10px] hover:opacity-90"
                          style={{ borderColor: "#1A345B", background: "#09142D", color: "#D3E1FF" }}
                        >
                          <div className="font-bold">{label}</div>
                          <div style={{ color: "#7386A5" }}>{description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {componentPresets.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: "#8FF0B8", fontWeight: 700 }}>Article Components</div>
                      <div className="space-y-2">
                        {componentPresets.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => insertPreset(preset)}
                            className="w-full rounded-md border px-3 py-2 text-left hover:opacity-90"
                            style={{ borderColor: "#1E5B3B", background: "#081B18", color: "#D7FFE5" }}
                          >
                            <div className="text-[11px] font-bold">{preset.name}</div>
                            <div className="text-[10px]" style={{ color: "#93CDAA" }}>{preset.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {quickDataPresets.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: "#FFD37A", fontWeight: 700 }}>Quick Data Blocks</div>
                      <div className="grid grid-cols-1 gap-2">
                        {quickDataPresets.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => insertPreset(preset)}
                            className="rounded-md border px-3 py-2 text-left text-[10px] hover:opacity-90"
                            style={{ borderColor: "#6A5520", background: "#1A1308", color: "#FFE7A8" }}
                          >
                            <div className="font-bold">{preset.name.replace("Quick Data: ", "")}</div>
                            <div style={{ color: "#C5A86D" }}>{preset.previewLabel || preset.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {snapLayoutPresets.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: "#A8D8FF", fontWeight: 700 }}>Canvas Snap Layouts</div>
                      <div className="space-y-2">
                        {snapLayoutPresets.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => insertPreset(preset)}
                            className="w-full rounded-md border px-3 py-2 text-left hover:opacity-90"
                            style={{ borderColor: "#31578A", background: "#0A1732", color: "#D3E1FF" }}
                          >
                            <div className="text-[11px] font-bold">{preset.name.replace("Snap Layout: ", "")}</div>
                            <div className="text-[10px]" style={{ color: "#8EA9D7" }}>{preset.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Image Storage</div>
                      <button
                        onClick={() => openImageStoragePicker({ mode: "block" })}
                        className={`${retro.button} px-2 py-1 text-[9px]`}
                        style={S_ACCENT}
                      >
                        Upload / Browse
                      </button>
                    </div>
                    <div className="space-y-2">
                      {storedImages.length === 0 && (
                        <div className="rounded-md border px-3 py-3 text-[10px]" style={{ borderColor: "#1A345B", background: "#09142D", color: "#7A9ABB" }}>
                          No stored images yet. Upload images here, then drag them directly into the article canvas.
                        </div>
                      )}
                      {storedImages.slice(0, 8).map((image) => (
                        <button
                          key={image.id}
                          draggable
                          onDragStart={(event) => handleStoredImageDragStart(event, image)}
                          onDragEnd={clearCanvasDragState}
                          onClick={() => addBlock("image", {
                            title: image.name,
                            imageUrl: image.src,
                            imageAlt: image.alt || image.name,
                            imageCaption: image.name,
                            imageStorageAssetId: image.id,
                            imageFocalX: 50,
                            imageFocalY: 50,
                            imageCaptionPlacement: "below",
                          })}
                          className="w-full rounded-md border p-2 text-left hover:opacity-90"
                          style={{ borderColor: "#1A345B", background: "#09142D", color: "#D3E1FF" }}
                        >
                          <div className="flex items-center gap-2">
                            <img src={image.src} alt={image.alt || image.name} className="h-10 w-12 rounded object-cover" style={{ background: "#050518", border: "1px solid #20335B" }} />
                            <div className="min-w-0">
                              <div className="truncate text-[10px] font-bold">{image.name || "Stored image"}</div>
                              <div className="text-[9px]" style={{ color: "#7386A5" }}>Click to add or drag onto the canvas</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: "#7A9ABB", fontWeight: 700 }}>Reference Templates</div>
                    <div className="space-y-2">
                      {([
                        ["spell-directory", "Magic Spell List", "Linked tables from Cantrip through Level 8"],
                        ["magic-spell", "Magic Spell", "Casting details, description, scaling, and spell lists"],
                        ["creature-reference", "Creature / NPC", "Profile box, overview, and traits"],
                        ["location-page", "Location", "Feature image, overview, and keyed details"],
                        ["rules-reference", "Rules Reference", "Structured rulings and examples"],
                      ] as const).map(([templateId, label, desc]) => (
                        <button
                          key={templateId}
                          onClick={() => addArticleTemplate(templateId)}
                          className="w-full rounded-md border px-3 py-2 text-left hover:opacity-90"
                          style={{ borderColor: "#2B365C", background: "#0A1228", color: "#D3E1FF" }}
                        >
                          <div className="text-[11px] font-bold">{label}</div>
                          <div className="text-[10px]" style={{ color: "#8091AE" }}>{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {workspaceRailTab === "presets" && (
                <div className="space-y-4">
                  <div className="rounded-md border px-3 py-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div className="text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: "#7A9ABB", fontWeight: 700 }}>Preset Actions</div>
                    <button
                      onClick={() => void saveSelectionAsPreset()}
                      disabled={selectedBlocks.length === 0}
                      className={`${retro.button} w-full px-3 py-2 text-[10px] disabled:opacity-40`}
                      style={S_ACCENT}
                    >
                      Save Current Selection as Preset
                    </button>
                    <div className="mt-2 text-[10px]" style={{ color: "#8091AE" }}>
                      Save one block or a whole multi-block layout, then reuse it across articles.
                    </div>
                  </div>

                  <div className="space-y-3">
                    {presetLibrary.map((preset) => (
                      <div
                        key={preset.id}
                        className="rounded-md border px-3 py-3"
                        style={{ borderColor: preset.builtIn ? "#2D4B77" : "#21415F", background: preset.builtIn ? "#0A1732" : "#09142D" }}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-[11px] font-bold" style={{ color: "#D3E1FF" }}>{preset.name}</div>
                              <span className="text-[9px] px-2 py-0.5" style={{ color: preset.builtIn ? "#A8D8FF" : "#B6FFCC", background: "#081226", border: "1px solid #1A345B" }}>
                                {preset.builtIn ? "Built In" : "Shared"}
                              </span>
                            </div>
                            <div className="mt-1 text-[10px]" style={{ color: "#8CA0C2" }}>{preset.description || "Reusable block layout preset."}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[9px]" style={{ color: "#7A9ABB" }}>
                              <span>{preset.category}</span>
                              <span>|</span>
                              <span>{preset.blocks.length} block{preset.blocks.length === 1 ? "" : "s"}</span>
                              {preset.previewLabel && (
                                <>
                                  <span>|</span>
                                  <span>{preset.previewLabel}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => insertPreset(preset, canvasInsertPicker ? { colStart: canvasInsertPicker.colStart, rowStart: canvasInsertPicker.rowStart } : undefined)}
                            className={`${retro.button} px-3 py-1.5 text-[10px]`}
                            style={S_ACCENT}
                          >
                            Insert
                          </button>
                          <button
                            onClick={() => void duplicatePresetToLibrary(preset)}
                            className={`${retro.button} px-3 py-1.5 text-[10px]`}
                            style={S_SUBTLE}
                          >
                            Duplicate
                          </button>
                          {!preset.builtIn && (
                            <>
                              <button
                                onClick={() => void renameStoredPreset(preset.id)}
                                className={`${retro.button} px-3 py-1.5 text-[10px]`}
                                style={S_SUBTLE}
                              >
                                Rename
                              </button>
                              <button
                                onClick={() => void deleteStoredPreset(preset.id)}
                                className={`${retro.button} px-3 py-1.5 text-[10px]`}
                                style={S_RED}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {workspaceRailTab === "article" && (
                <div className="space-y-3">
                  <div>
                    <label style={labelStyle}>Title *</label>
                    <input value={page.title} onChange={(event) => { update("title", event.target.value); if (!urlManuallyEdited.current) update("url", toSlug(event.target.value)); }} className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Subtitle</label>
                    <input value={page.subtitle} onChange={(event) => update("subtitle", event.target.value)} className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Description *</label>
                    <textarea value={page.description} onChange={(event) => update("description", event.target.value)} rows={3} className={`${inputClass} resize-none`} style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label style={labelStyle}>URL *</label>
                      <input value={page.url} onChange={(event) => { urlManuallyEdited.current = true; update("url", event.target.value); }} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Category</label>
                      <input value={page.category} onChange={(event) => update("category", event.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Tags</label>
                    <input
                      value={tagDraft}
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          const next = tagDraft.trim();
                          if (!next || (page.tags || []).includes(next)) return;
                          update("tags", [...(page.tags || []), next]);
                          setTagDraft("");
                        }
                      }}
                      placeholder="Press Enter to add a tag"
                      className={inputClass}
                      style={inputStyle}
                    />
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(page.tags || []).map((tag) => (
                        <button key={tag} onClick={() => update("tags", (page.tags || []).filter((entry) => entry !== tag))} className="text-[10px] px-2 py-1" style={{ color: "#D3E1FF", background: "#0C1735", border: "1px solid #1A345B" }}>
                          {tag} <X size={10} className="inline ml-1" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col" style={{ background: `linear-gradient(180deg, ${darken(bg, 10)} 0%, ${bg} 100%)` }}>
            <div className="border-b px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottomColor: "#172B52", background: "rgba(7,12,31,0.9)" }}>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>
                  {editorCanvasMode === "edit" ? "Live Article Canvas" : editorCanvasMode === "clean" ? "Clean Canvas Review" : "Player Article Preview"}
                </div>
                <div className="text-[12px] mt-1" style={{ color: "#9FB0CC" }}>
                  {editorCanvasMode === "player"
                    ? `Previewing the ${responsiveFrame.label.toLowerCase()} player frame with visibility rules and editor chrome hidden.`
                    : editorCanvasMode === "clean"
                      ? `Reviewing the ${responsiveFrame.label.toLowerCase()} frame without editor rails, grid guides, handles, or block chrome.`
                    : "Shift-click empty space to place a block or preset, drag overlays to move blocks, and use marquee selection for faster layout editing."}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select value={previewAsPlayerId || ""} onChange={(event) => setPreviewAsPlayerId(event.target.value || null)} className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px]`} style={inputStyle}>
                  <option value="">DM View (see all)</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name} ({player.class || "No class"} Lv{player.level || 1})
                    </option>
                  ))}
                </select>
                <button onClick={() => setPreviewAsPlayerId(null)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Reset View</button>
              </div>
            </div>

            {!editorPreviewMode && (
            <div className="border-b px-5 py-3 flex flex-wrap items-start justify-between gap-4" style={{ borderBottomColor: "#172B52", background: "rgba(8,14,34,0.88)" }}>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  {[
                    selectedArticleChromeField ? `Article ${selectedArticleChromeLabel} selected` : `${selectedBlockIds.length || 0} selected`,
                    `Zoom ${(effectiveCanvasScale * 100).toFixed(0)}%`,
                    `Frame ${responsiveFrame.label}`,
                    canvasSettings.preset === "referenceWide" ? "Reference Wide" : canvasSettings.preset === "large" ? "Large Article" : "Standard Article",
                    layoutQaFindings.length === 0 ? "Layout QA clear" : `${layoutQaFindings.length} QA note${layoutQaFindings.length === 1 ? "" : "s"}`,
                  ].map((label) => (
                    <span key={label} className="rounded-md border px-2 py-1" style={{ borderColor: "#1A345B", background: "#071126", color: "#A7BAD8" }}>
                      {label}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[9px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>View</span>
                  <button onClick={() => setCanvasZoom((value) => Math.max(0.65, Number((value - 0.1).toFixed(2))))} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Zoom Out</button>
                  <button onClick={() => setCanvasZoom(1)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Reset Zoom</button>
                  <button onClick={() => setCanvasZoom((value) => Math.min(1.45, Number((value + 0.1).toFixed(2))))} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Zoom In</button>
                  <button onClick={() => void saveSelectionAsPreset()} disabled={selectedBlocks.length === 0} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_ACCENT}>Save Selection as Preset</button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[9px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Arrange</span>
                  <button onClick={() => applySelectionLayoutAction("align-left")} disabled={selectedBlocks.length < 2} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_SUBTLE}>Align Left</button>
                  <button onClick={() => applySelectionLayoutAction("align-center")} disabled={selectedBlocks.length < 2} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_SUBTLE}>Align Center</button>
                  <button onClick={() => applySelectionLayoutAction("align-right")} disabled={selectedBlocks.length < 2} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_SUBTLE}>Align Right</button>
                  <button onClick={() => applySelectionLayoutAction("align-top")} disabled={selectedBlocks.length < 2} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_SUBTLE}>Align Top</button>
                  <button onClick={() => applySelectionLayoutAction("align-middle")} disabled={selectedBlocks.length < 2} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_SUBTLE}>Align Middle</button>
                  <button onClick={() => applySelectionLayoutAction("align-bottom")} disabled={selectedBlocks.length < 2} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_SUBTLE}>Align Bottom</button>
                  <button onClick={() => applySelectionLayoutAction("distribute-horizontal")} disabled={selectedBlocks.length < 3} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_SUBTLE}>Distribute X</button>
                  <button onClick={() => applySelectionLayoutAction("distribute-vertical")} disabled={selectedBlocks.length < 3} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_SUBTLE}>Distribute Y</button>
                  <button onClick={() => applySelectionLayoutAction("match-width")} disabled={selectedBlocks.length < 2} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_SUBTLE}>Match Width</button>
                  <button onClick={() => applySelectionLayoutAction("match-height")} disabled={selectedBlocks.length < 2} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_SUBTLE}>Match Height</button>
                </div>
              </div>

              <div className="w-[220px] shrink-0 rounded-md border p-2" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Minimap</div>
                <div className="mb-2 text-[9px]" style={{ color: "#8091AE" }}>
                  Click or drag here to pan across the authored article frame.
                </div>
                <button
                  ref={minimapButtonRef}
                  onMouseDown={(event) => {
                    minimapDragActiveRef.current = true;
                    jumpCanvasViewportFromMinimap(event.clientX, event.clientY, "smooth");
                  }}
                  className="relative block h-[150px] w-full overflow-hidden rounded-md border"
                  style={{ borderColor: "#20335B", background: "linear-gradient(180deg, rgba(12,18,44,0.92) 0%, rgba(9,14,34,0.98) 100%)" }}
                >
                  {renderedPageBlocks.map((block) => {
                    const palette = resolveBlockPalette(block);
                    return (
                      <span
                        key={`minimap-${block.id}`}
                        className="absolute rounded-[2px] border"
                        style={{
                          left: `${((block.layout.colStart - 1) / WIKI_BLOCK_COLUMNS) * 100}%`,
                          width: `${(block.layout.colSpan / WIKI_BLOCK_COLUMNS) * 100}%`,
                          top: `${(((contentCanvasRowOffset + block.layout.rowStart - 1) * canvasRowHeight) / canvasHeight) * 100}%`,
                          height: `${((block.layout.rowSpan * canvasRowHeight) / canvasHeight) * 100}%`,
                          borderColor: selectedBlockIds.includes(block.id) ? accent : palette.accent,
                          background: selectedBlockIds.includes(block.id) ? `${accent}55` : `${palette.accent}30`,
                        }}
                      />
                    );
                  })}
                  <span
                    className="absolute rounded-[4px] border-2"
                    style={{
                      left: `${minimapViewport.left * 100}%`,
                      top: `${minimapViewport.top * 100}%`,
                      width: `${minimapViewport.width * 100}%`,
                      height: `${minimapViewport.height * 100}%`,
                      borderColor: "#A8D8FF",
                      background: "rgba(168, 216, 255, 0.12)",
                    }}
                  />
                </button>
              </div>
            </div>
            )}

            <div ref={canvasViewportRef} className="flex-1 overflow-y-auto px-4 py-5">
              <div ref={canvasFrameRef} className="mx-auto rounded-lg border shadow-[0_18px_40px_rgba(0,0,0,0.35)]" style={{ width: canvasScaledWidth, background: hdr, borderColor }}>
                {playerPreviewArticleBlocked ? (
                  <div style={{ width: canvasRenderWidth, transform: `scale(${effectiveCanvasScale})`, transformOrigin: "top center" }}>
                    <div className="px-6 py-8">
                      <div
                        className="mx-auto flex min-h-[360px] max-w-[760px] flex-col items-center justify-center rounded-lg border px-8 py-12 text-center"
                        style={{
                          borderColor: playerPreviewArticleVisibility === "hidden" ? "#5A2630" : "#5C4216",
                          background: playerPreviewArticleVisibility === "hidden"
                            ? "linear-gradient(180deg, rgba(43,12,19,0.82), rgba(10,13,28,0.96))"
                            : "linear-gradient(180deg, rgba(55,39,10,0.82), rgba(10,13,28,0.96))",
                          color: "#D3E1FF",
                        }}
                      >
                        {playerPreviewArticleVisibility === "hidden" ? (
                          <EyeOff size={34} style={{ color: "#FF8A8A" }} />
                        ) : (
                          <Shield size={34} style={{ color: "#FFCC7A" }} />
                        )}
                        <div className="mt-4 text-[11px] uppercase tracking-[0.22em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>
                          Player Preview
                        </div>
                        <h2 className="mt-2 text-xl font-bold">
                          {playerPreviewArticleVisibility === "hidden" ? "Article Hidden From Player" : "Spoiler / Metagame Warning"}
                        </h2>
                        <p className="mt-3 max-w-[520px] text-sm leading-relaxed" style={{ color: "#A7B8D8" }}>
                          {playerPreviewArticleVisibility === "hidden"
                            ? `${previewPlayer?.name || "This player"} would not see this article in the published wiki.`
                            : `${previewPlayer?.name || "This player"} would see a spoiler gate before this article content is revealed.`}
                        </p>
                        {playerPreviewArticleVisibility === "spoiler" && (
                          <button
                            onClick={() => setRevealedPanels((prev) => new Set([...prev, "article-spoiler-gate"]))}
                            className={`${retro.button} mt-5 px-4 py-2 text-[11px]`}
                            style={S_WARN}
                          >
                            Reveal in Preview
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : isResponsiveReflowMode ? (
                  <div style={{ width: canvasRenderWidth, transform: `scale(${effectiveCanvasScale})`, transformOrigin: "top center" }}>
                    <div className="py-5">
                      <div className="mb-4 px-4 py-2">
                        <h1 className="m-0 leading-tight" style={{ color: txt, fontSize: responsiveFrameMode === "mobile" ? 24 : 30, fontWeight: 700 }}>
                          {page.title || "Untitled Article"}
                        </h1>
                        {page.subtitle && (
                          <p className="mt-1 text-[13px] italic" style={{ color: mutedText }}>{page.subtitle}</p>
                        )}
                        {page.description && (
                          <p className="mt-3 text-[12px] leading-relaxed" style={{ color: txt }}>{page.description}</p>
                        )}
                      </div>
                      <div className="space-y-4">
                        {responsivePageBlocks.map((block) => {
                          const palette = resolveBlockPalette(block);
                          const behavior = block.fluid?.mobileBehavior || block.mobileCollapseMode || "stack";
                          const mobileDensity = block.behavior?.mobileDensity || "comfortable";
                          const baseHeight = block.type === "divider"
                            ? 54
                            : block.type === "lineBox"
                              ? (block.lineOrientation === "vertical" ? 140 : 42)
                            : block.type === "spacer"
                              ? Math.max(40, (block.spacerHeight || 1) * 18)
                              : Math.max(110, Math.min(responsiveFrameMode === "mobile" ? 430 : 560, block.layout.rowSpan * (block.fluid?.heightMode === "hug" ? 18 : 24)));
                          return (
                            <div
                              key={`responsive-${block.id}`}
                              id={`block-${block.id}`}
                              className="rounded-lg border overflow-hidden"
                              style={{
                                minHeight: baseHeight,
                                width: block.behavior?.mobileFullWidth === false ? "auto" : "100%",
                                paddingInline: mobileDensity === "dense" ? 0 : mobileDensity === "compact" ? 2 : undefined,
                                height: block.fluid?.heightMode === "fixed" ? baseHeight : undefined,
                                maxHeight: behavior === "compact" || mobileDensity === "dense" ? (responsiveFrameMode === "mobile" ? 340 : 420) : undefined,
                                overflowX: behavior === "scrollX" ? "auto" : "hidden",
                                overflowY: behavior === "compact" || mobileDensity === "dense" ? "auto" : "hidden",
                                border: blockBorderCss(block.appearance.borderStyle, palette.border, block.appearance.borderWidth ?? 1),
                                background: blockSurfaceBackground(block.appearance.surfaceStyle, palette.background, palette.accent, block.appearance.backgroundTreatment),
                                boxShadow: blockSurfaceShadow(block.appearance.surfaceStyle, palette.border, palette.accent, false, block.appearance.shadowDepth ?? 1, block.appearance.glowIntensity ?? 0),
                                borderRadius: block.appearance.borderRadius ?? 12,
                                opacity: (block.appearance.opacity ?? 100) / 100,
                              }}
                            >
                              {renderEditableWikiBlock(block)}
                            </div>
                          );
                        })}
                        {responsivePageBlocks.length === 0 && (
                          <div className="rounded-lg border border-dashed px-5 py-10 text-center text-[12px]" style={{ borderColor: "#20335B", color: "#7A9ABB" }}>
                            This article does not have any blocks yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                <div style={{ width: canvasRenderWidth, transform: `scale(${effectiveCanvasScale})`, transformOrigin: "top center" }}>
                <div className="py-6">
                  {!editorPreviewMode && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-6 text-[10px]" style={{ color: "#7A9ABB" }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{canvasSettings.preset === "referenceWide" ? "Reference Wide" : canvasSettings.preset === "large" ? "Large Article" : "Standard Article"}</span>
                      <span>|</span>
                      <span>{Math.round(canvasRenderWidth)}px frame width</span>
                      <span>|</span>
                      <span>{canvasHeight}px canvas height</span>
                      <span>|</span>
                      <span>{WIKI_BLOCK_COLUMNS}-column dense snap canvas</span>
                    </div>
                    {isMinimizedCanvasMode && (
                      <span style={{ color: "#FFCC7A" }}>
                        Minimized editor mode is active for this screen width.
                      </span>
                    )}
                  </div>
                  )}
                  <div
                    ref={(node) => {
                      blockCanvasRef.current = node;
                      articleChromeCanvasRef.current = node;
                    }}
                    onMouseDown={editorPreviewMode ? undefined : handleCanvasMouseDown}
                    onDragOver={(event) => {
                      if (editorPreviewMode) return;
                      event.preventDefault();
                      updateCanvasDropPreview(event);
                    }}
                    onDragLeave={(event) => {
                      if (editorPreviewMode) return;
                      if (event.currentTarget === event.target) {
                        setCanvasDropPreview(null);
                      }
                    }}
                    onDrop={editorPreviewMode ? undefined : handleCanvasDrop}
                    className="relative border-y overflow-visible"
                    style={{
                      minHeight: canvasHeight,
                      borderColor: editorPreviewMode ? "transparent" : "#20335B",
                      background: editorPreviewMode
                        ? "transparent"
                        : `
                          linear-gradient(90deg, rgba(74,123,255,0.08) 1px, transparent 1px),
                          linear-gradient(180deg, rgba(74,123,255,0.05) 1px, transparent 1px),
                          linear-gradient(180deg, rgba(12,18,44,0.92) 0%, rgba(9,14,34,0.98) 100%)
                        `,
                      backgroundSize: editorPreviewMode ? undefined : `${100 / WIKI_BLOCK_COLUMNS}% 100%, 100% ${canvasRowHeight}px, 100% 100%`,
                    }}
                    >
                    {articleChromeFields.map((field) => renderArticleChromeBox(field))}
                    {!editorPreviewMode && marqueeSelection && (
                      <div
                        className="absolute z-[3] rounded-md border border-dashed"
                        style={{
                          left: Math.min(marqueeSelection.startX, marqueeSelection.currentX),
                          top: Math.min(marqueeSelection.startY, marqueeSelection.currentY),
                          width: Math.abs(marqueeSelection.currentX - marqueeSelection.startX),
                          height: Math.abs(marqueeSelection.currentY - marqueeSelection.startY),
                          borderColor: "#8AB4FF",
                          background: "rgba(74, 123, 255, 0.16)",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    {!editorPreviewMode && (
                    <div className="absolute inset-x-0 top-0 z-[1] grid" style={{ gridTemplateColumns: `repeat(${WIKI_BLOCK_COLUMNS}, minmax(0, 1fr))`, pointerEvents: "none", opacity: isMinimizedCanvasMode ? 0.35 : 1 }}>
                      {Array.from({ length: WIKI_BLOCK_COLUMNS }, (_, index) => (
                        <div key={`canvas-col-${index + 1}`} className="border-r px-1 py-1 text-right text-[9px]" style={{ borderRightColor: "rgba(74,123,255,0.12)", color: "#58729D" }}>
                          {index + 1}
                        </div>
                      ))}
                    </div>
                    )}
                    {!editorPreviewMode && (
                    <div className="absolute left-0 top-0 bottom-0 z-[1] flex flex-col" style={{ width: 28, pointerEvents: "none", opacity: isMinimizedCanvasMode ? 0.3 : 1 }}>
                      {Array.from({ length: Math.max(24, canvasBottomRow) }, (_, index) => (
                        <div key={`canvas-row-${index + 1}`} className="pr-1 pt-0.5 text-right text-[9px]" style={{ height: canvasRowHeight, color: "#4D6188" }}>
                          {index + 1}
                        </div>
                      ))}
                    </div>
                    )}
                    {!editorPreviewMode && canvasDropPreview && (
                      <div
                        className="absolute z-[2] rounded-md border-2 border-dashed"
                        style={{
                          left: `${((canvasDropPreview.colStart - 1) / WIKI_BLOCK_COLUMNS) * 100}%`,
                          width: `${(canvasDropPreview.colSpan / WIKI_BLOCK_COLUMNS) * 100}%`,
                          top: (contentCanvasRowOffset + canvasDropPreview.rowStart - 1) * canvasRowHeight,
                          height: canvasDropPreview.rowSpan * canvasRowHeight,
                          borderColor: "#6A9AFF",
                          background: "rgba(74, 123, 255, 0.10)",
                          boxShadow: "0 0 0 1px rgba(74,123,255,0.2) inset",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    {!editorPreviewMode && canvasInsertPicker && (
                      <div
                        className="absolute z-[4] w-[320px] rounded-lg border p-2 shadow-[0_18px_40px_rgba(0,0,0,0.42)]"
                        style={{
                          left: Math.max(12, Math.min(canvasInsertPicker.left, Math.max(12, canvasRenderWidth - 332))),
                          top: Math.max(18, canvasInsertPicker.top),
                          borderColor: "#2B4B79",
                          background: "rgba(8, 14, 34, 0.96)",
                        }}
                      >
                        <div className="mb-2 text-[10px] uppercase tracking-[0.18em]" style={{ color: "#8EA9D7", fontWeight: 700 }}>
                          Insert Block or Preset
                        </div>
                        <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                          <div>
                            <div className="mb-2 text-[9px] uppercase tracking-[0.16em]" style={{ color: "#6F88B4", fontWeight: 700 }}>
                              Block Types
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {([
                                ["richText", "Rich Text"],
                                ["heading", "Heading"],
                                ["image", "Image"],
                                ["calloutPanel", "Callout"],
                                ["referenceTable", "Table"],
                                ["tabbedReference", "Tabbed Ref"],
                                ["keyValueBox", "Key-Value"],
                                ["spoilerBlock", "Spoiler"],
                                ["wikiLinksList", "Wiki Links"],
                                ["divider", "Divider"],
                                ["lineBox", "Line Box"],
                                ["spacer", "Spacer"],
                              ] as [WikiBlockType, string][]).map(([type, label]) => (
                                <button
                                  key={type}
                                  onClick={() => {
                                    addBlock(type, { layout: { colStart: canvasInsertPicker.colStart, rowStart: canvasInsertPicker.rowStart } as WikiArticleBlock["layout"] });
                                    setCanvasInsertPicker(null);
                                  }}
                                  className={`${retro.button} px-2 py-2 text-[10px]`}
                                  style={S_SUBTLE}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {presetLibrary.length > 0 && (
                            <div>
                              <div className="mb-2 text-[9px] uppercase tracking-[0.16em]" style={{ color: "#6F88B4", fontWeight: 700 }}>
                                Preset Library
                              </div>
                              <div className="space-y-2">
                                {presetLibrary.map((preset) => (
                                  <button
                                    key={preset.id}
                                    onClick={() => insertPreset(preset, { colStart: canvasInsertPicker.colStart, rowStart: canvasInsertPicker.rowStart })}
                                    className={`${retro.button} w-full px-3 py-2 text-left text-[10px]`}
                                    style={{ ...S_ACCENT, background: "#10284F", borderColor: "#315B8D" }}
                                  >
                                    <div className="font-bold">{preset.name}</div>
                                    <div style={{ color: "#A7C6EE" }}>
                                      {preset.previewLabel || `${preset.blocks.length} block${preset.blocks.length === 1 ? "" : "s"}`}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {renderedPageBlocks.map((block) => {
                      const palette = resolveBlockPalette(block);
                      const blockLeft = `${((block.layout.colStart - 1) / WIKI_BLOCK_COLUMNS) * 100}%`;
                      const blockWidth = `${(block.layout.colSpan / WIKI_BLOCK_COLUMNS) * 100}%`;
                      const blockTop = (contentCanvasRowOffset + block.layout.rowStart - 1) * canvasRowHeight;
                      const blockHeight = block.layout.rowSpan * canvasRowHeight;
                      const isSelected = selectedBlockIds.includes(block.id);
                      const isChromeVisible = !editorPreviewMode && (hoveredBlockId === block.id || movingBlockId === block.id);
                      const authoredBorder = blockBorderCss(block.appearance.borderStyle, isSelected ? accent : palette.border, block.appearance.borderWidth ?? 1);
                      const authoredBackground = blockSurfaceBackground(block.appearance.surfaceStyle, palette.background, palette.accent, block.appearance.backgroundTreatment);
                      const authoredShadow = blockSurfaceShadow(block.appearance.surfaceStyle, palette.border, palette.accent, !editorPreviewMode && isSelected, block.appearance.shadowDepth ?? 1, block.appearance.glowIntensity ?? 0);

                      return (
                        <div
                          key={block.id}
                          className="absolute"
                          onMouseEnter={() => setHoveredBlockId(block.id)}
                          onMouseLeave={() => setHoveredBlockId((current) => (current === block.id ? null : current))}
                          style={{
                            left: blockLeft,
                            width: blockWidth,
                            top: blockTop,
                            height: blockHeight,
                            overflow: "visible",
                          }}
                        >
                          <div
                            className="absolute left-0 right-0 z-[4] flex min-h-[34px] items-center gap-2 rounded-t-[13px] border-b px-3 py-1.5 transition-all duration-150"
                            style={{
                              top: 0,
                              opacity: isChromeVisible ? 1 : 0,
                              transform: `translateY(${isChromeVisible ? 0 : -2}px)`,
                              pointerEvents: isChromeVisible ? "auto" : "none",
                              borderColor: isSelected ? `${accent}AA` : `${palette.border}D9`,
                              background: "linear-gradient(180deg, rgba(5,10,28,0.95), rgba(5,10,28,0.78))",
                              backdropFilter: "blur(6px)",
                              boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
                            }}
                          >
                            <button
                              onMouseDown={(event) => beginCanvasBlockMove(event, block.id)}
                              className="cursor-grab active:cursor-grabbing"
                              title="Move block"
                            >
                              <GripVertical size={13} style={{ color: palette.accent }} />
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: palette.accent, fontWeight: 700 }}>{block.type}</div>
                              <div className="text-[11px] truncate" style={{ color: "#D3E1FF" }}>
                                {block.title || block.subtitle || `Untitled ${block.type}`}
                              </div>
                            </div>
                            {block.locked && <Lock size={12} style={{ color: "#FFAA4A" }} />}
                            <button onClick={(event) => { event.stopPropagation(); duplicateBlock(block.id); }} className="hover:opacity-80" title="Duplicate">
                              <Plus size={12} style={{ color: "#8AB4FF" }} />
                            </button>
                            <button onClick={(event) => { event.stopPropagation(); removeBlock(block.id); }} className="hover:opacity-80" title="Delete">
                              <Trash2 size={12} style={{ color: "#FF8A8A" }} />
                            </button>
                          </div>
                          <Resizable
                            size={{ width: "100%", height: "100%" }}
                            minWidth={Math.max((block.layout.minColSpan || 1) * ((blockCanvasRef.current?.getBoundingClientRect().width || canvasRenderWidth) / WIKI_BLOCK_COLUMNS), 120)}
                            minHeight={Math.max((block.layout.minRowSpan || 1) * canvasRowHeight, 48)}
                            enable={editorPreviewMode || block.locked ? { top: false, right: false, bottom: false, left: false, topRight: false, bottomRight: false, bottomLeft: false, topLeft: false } : { right: true, bottom: true, bottomRight: true, bottomLeft: false, top: false, left: false, topLeft: false, topRight: false }}
                            handleStyles={{
                              right: { width: 12, right: -5, cursor: "ew-resize" },
                              bottom: { height: 12, bottom: -5, cursor: "ns-resize" },
                              bottomRight: { width: 14, height: 14, right: -6, bottom: -6, cursor: "nwse-resize" },
                            }}
                            handleClasses={{
                              right: "rounded-r-md bg-[#4A7BFF]/80",
                              bottom: "rounded-b-md bg-[#4A7BFF]/80",
                              bottomRight: "rounded-br-md bg-[#8AB4FF]",
                            }}
                            onResize={(_event, _direction, ref) => {
                              const rect = blockCanvasRef.current?.getBoundingClientRect();
                              if (!rect) return;
                              const colWidth = rect.width / WIKI_BLOCK_COLUMNS;
                              const nextColSpan = Math.max(block.layout.minColSpan || 1, Math.round(ref.offsetWidth / Math.max(colWidth, 1)));
                              const nextRowSpan = Math.max(block.layout.minRowSpan || 1, Math.round(ref.offsetHeight / canvasRowHeight));
                              setLiveBlockLayouts((prev) => ({
                                ...prev,
                                [block.id]: {
                                  ...block.layout,
                                  colSpan: nextColSpan,
                                  rowSpan: nextRowSpan,
                                },
                              }));
                            }}
                            onResizeStop={(_event, _direction, ref) => {
                              const rect = blockCanvasRef.current?.getBoundingClientRect();
                              if (!rect) return;
                              const colWidth = rect.width / WIKI_BLOCK_COLUMNS;
                              const nextColSpan = Math.max(block.layout.minColSpan || 1, Math.round(ref.offsetWidth / Math.max(colWidth, 1)));
                              const nextRowSpan = Math.max(block.layout.minRowSpan || 1, Math.round(ref.offsetHeight / canvasRowHeight));
                              updateBlocks(placeWikiBlock(pageBlocks, block.id, { colSpan: nextColSpan, rowSpan: nextRowSpan }));
                              setLiveBlockLayouts((prev) => {
                                const next = { ...prev };
                                delete next[block.id];
                                return next;
                              });
                            }}
                            style={{
                              border: authoredBorder,
                              background: "transparent",
                              boxShadow: authoredShadow,
                              overflow: "visible",
                              borderRadius: block.appearance.borderRadius ?? 14,
                            }}
                          >
                            <div
                              className="h-full flex flex-col overflow-hidden"
                              onClick={(event) => {
                                if (editorPreviewMode) return;
                                handleBlockSelection(block.id, event.shiftKey || event.ctrlKey || event.metaKey);
                                setInspectorTab("content");
                              }}
                              style={{
                              borderRadius: block.appearance.borderRadius ?? 13,
                              background: authoredBackground,
                              backdropFilter: block.appearance.surfaceStyle === "glass" ? "blur(8px)" : undefined,
                              opacity: (block.appearance.opacity ?? 100) / 100,
                            }}
                            >
                              <div className="min-h-0 flex-1 overflow-hidden">
                                {renderEditableWikiBlock(block)}
                              </div>
                            </div>
                          </Resizable>
                        </div>
                      );
                    })}
                  </div>

                  {!editorPreviewMode && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 px-6 text-[10px]" style={{ color: "#7A9ABB" }}>
                    <span className="rounded-md border px-2 py-1" style={{ borderColor: "#1A345B", background: "#081129", color: "#A8D8FF" }}>Tip</span>
                    <span>Drag blocks to move them, resize from the edges, and Shift-click empty space to insert exactly where you are working.</span>
                    <span>|</span>
                    <span>Use Clean Canvas or Player Preview when you want to review the article without editor controls.</span>
                  </div>
                  )}
                </div>
                </div>
                )}
              </div>
            </div>
          </div>

          {!editorPreviewMode && (
          <div className="w-[360px] shrink-0 border-l flex flex-col" style={{ borderLeftColor: "#15264B", background: "#081129" }}>
            <div className="border-b px-4 py-3" style={{ borderBottomColor: "#15264B", background: "linear-gradient(180deg, #0D1938 0%, #081129 100%)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#8AB4FF", fontWeight: 700 }}>Inspector</div>
                  <div className="mt-1 truncate text-[11px]" style={{ color: "#9FB0CC" }}>{selectedStatusLabel}</div>
                </div>
                <span className="shrink-0 rounded-md border px-2 py-1 text-[9px]" style={{ borderColor: "#1A345B", background: "#071126", color: selectedBlock || selectedArticleChromeField ? "#8FF0B8" : "#FFD37A" }}>
                  {selectedBlock || selectedArticleChromeField ? "Ready" : "Select"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 border-b" style={{ borderBottomColor: "#15264B" }}>
              {([
                { id: "content", label: "Block" },
                { id: "layout", label: "Layout" },
                { id: "style", label: "Style" },
                { id: "article", label: "Article" },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setInspectorTab(tab.id)}
                  className="px-3 py-2 text-[10px]"
                  style={{
                    color: inspectorTab === tab.id ? "#D3E1FF" : "#617290",
                    background: inspectorTab === tab.id ? "#0C1735" : "transparent",
                    borderBottom: inspectorTab === tab.id ? `2px solid ${accent}` : "2px solid transparent",
                    fontWeight: inspectorTab === tab.id ? 700 : 500,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedBlocks.length > 1 && (
                <div className="rounded-md border p-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Multi-Selection</div>
                      <div className="text-[13px] font-bold" style={{ color: "#D3E1FF" }}>{selectedBlocks.length} blocks selected</div>
                    </div>
                    <button onClick={() => setSelectedBlockIds([])} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Clear</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => void saveSelectionAsPreset()} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Save as Preset</button>
                    <button onClick={() => applySelectionLayoutAction("distribute-horizontal")} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Distribute X</button>
                    <button onClick={() => applySelectionLayoutAction("distribute-vertical")} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Distribute Y</button>
                    <button onClick={() => applySelectionLayoutAction("match-width")} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Match Width</button>
                    <button onClick={() => applySelectionLayoutAction("match-height")} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Match Height</button>
                    <button onClick={() => applySmartLayoutGroup("stack")} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Make Stack</button>
                    <button onClick={() => applySmartLayoutGroup("columns")} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Make Columns</button>
                    <button onClick={() => applySmartLayoutGroup("wrap")} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Make Wrap</button>
                    <button onClick={ungroupSelectedBlocks} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Ungroup</button>
                  </div>
                </div>
              )}

              {selectedBlock && (
                <div className="rounded-md border p-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Selected Block</div>
                      <div className="text-[13px] font-bold" style={{ color: "#D3E1FF" }}>{selectedBlock.title || `Untitled ${selectedBlock.type}`}</div>
                    </div>
                    <button onClick={() => removeBlock(selectedBlock.id)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_RED}>Delete</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => duplicateBlock(selectedBlock.id)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Duplicate</button>
                    <button onClick={() => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, locked: !block.locked }))} className={`${retro.button} px-2 py-1 text-[10px]`} style={selectedBlock.locked ? S_WARN : S_SUBTLE}>
                      {selectedBlock.locked ? "Unlock" : "Lock"}
                    </button>
                    <button onClick={() => nudgeBlock(selectedBlock.id, -1, 0)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Left</button>
                    <button onClick={() => nudgeBlock(selectedBlock.id, 1, 0)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Right</button>
                    <button onClick={() => nudgeBlock(selectedBlock.id, 0, -1)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Up</button>
                    <button onClick={() => nudgeBlock(selectedBlock.id, 0, 1)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Down</button>
                  </div>
                </div>
              )}

              {selectedArticleChromeField && (
                <div className="rounded-md border p-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Selected Article Field</div>
                      <div className="text-[13px] font-bold" style={{ color: "#D3E1FF" }}>Article {selectedArticleChromeLabel}</div>
                    </div>
                    <button onClick={() => setSelectedArticleChromeField(null)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Clear</button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {articleChromeFields.map((field) => (
                      <button
                        key={`selected-article-field-${field}`}
                        onClick={() => selectArticleChromeField(field)}
                        className={`${retro.button} px-2 py-1 text-[9px]`}
                        style={selectedArticleChromeField === field ? S_ACCENT : S_SUBTLE}
                      >
                        {getArticleChromeFieldLabel(field)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!selectedBlock && selectedBlocks.length === 0 && !selectedArticleChromeField && (
                <div className="rounded-lg border border-dashed px-4 py-6 text-center" style={{ borderColor: "#28466F", background: "rgba(9, 20, 45, 0.72)" }}>
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: "#31578A", background: "#0D1B3B", color: "#A8D8FF" }}>
                    <Settings size={18} />
                  </div>
                  <div className="text-[12px] font-bold" style={{ color: "#D3E1FF" }}>Select a block to edit it</div>
                  <div className="mt-1 text-[10px] leading-relaxed" style={{ color: "#8CA0C2" }}>
                    Click a block on the canvas, choose one from the outline, or add a new block from the library.
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => setWorkspaceRailTab("outline")} className={`${retro.button} px-2 py-1.5 text-[10px]`} style={S_SUBTLE}>
                      Outline
                    </button>
                    <button onClick={() => setWorkspaceRailTab("library")} className={`${retro.button} px-2 py-1.5 text-[10px]`} style={S_ACCENT}>
                      Add Block
                    </button>
                  </div>
                </div>
              )}

              {inspectorTab === "content" && selectedArticleChromeField && (
                <div className="space-y-3">
                  <div>
                    <label style={labelStyle}>Article Field</label>
                    <div className="text-[11px] px-3 py-2 rounded-md border" style={{ borderColor: "#1A345B", background: "#09142D", color: "#D3E1FF" }}>
                      Article {selectedArticleChromeLabel}
                    </div>
                  </div>
                  {selectedArticleChromeField === "title" && (
                    <div>
                      <label style={labelStyle}>Title *</label>
                      <input
                        value={page.title}
                        onChange={(event) => {
                          update("title", event.target.value);
                          if (!urlManuallyEdited.current) update("url", toSlug(event.target.value));
                        }}
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                  )}
                  {selectedArticleChromeField === "subtitle" && (
                    <div>
                      <label style={labelStyle}>Subtitle</label>
                      <input
                        value={page.subtitle || ""}
                        onChange={(event) => update("subtitle", event.target.value)}
                        placeholder="Optional subtitle"
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                  )}
                  {selectedArticleChromeField === "description" && (
                    <div>
                      <label style={labelStyle}>Article Description *</label>
                      <textarea
                        value={page.description || ""}
                        onChange={(event) => update("description", event.target.value)}
                        rows={5}
                        placeholder="Short search and article intro description"
                        className={`${inputClass} resize-y`}
                        style={inputStyle}
                      />
                    </div>
                  )}
                  <div className="rounded-md border px-3 py-2 text-[10px] leading-relaxed" style={{ borderColor: "#1A345B", background: "#071126", color: "#8EA9D7" }}>
                    Use the Layout tab to move or resize this article field on the canvas. Page colors and icon settings are under the Article tab.
                  </div>
                </div>
              )}

              {inspectorTab === "content" && selectedBlock && (
                <div className="space-y-3">
                  <div>
                    <label style={labelStyle}>Block Type</label>
                    <div className="text-[11px] px-3 py-2 rounded-md border" style={{ borderColor: "#1A345B", background: "#09142D", color: "#D3E1FF" }}>
                      {selectedBlock.type}
                    </div>
                  </div>
                  {(selectedBlock.type === "image") && (
                    <>
                      <div>
                        <label style={labelStyle}>Image URL</label>
                        <input value={selectedBlock.imageUrl || ""} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, imageUrl: event.target.value }))} className={inputClass} style={inputStyle} />
                      </div>
                      <button
                        onClick={() => openImageStoragePicker({ mode: "block", blockId: selectedBlock.id })}
                        className={`${retro.button} px-3 py-1.5 text-[10px]`}
                        style={S_ACCENT}
                        title="Choose an existing stored image or upload a new one into the shared library."
                      >
                        Image Storage / Upload
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label style={labelStyle}>Alt Text</label>
                          <input value={selectedBlock.imageAlt || ""} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, imageAlt: event.target.value }))} className={inputClass} style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Crop Mode</label>
                          <select value={selectedBlock.cropMode || "cover"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, cropMode: event.target.value as WikiArticleBlock["cropMode"] }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                            <option value="cover">Cover</option>
                            <option value="contain">Contain</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label style={labelStyle}>Caption Placement</label>
                          <select
                            value={selectedBlock.imageCaptionPlacement || "below"}
                            onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, imageCaptionPlacement: event.target.value as WikiArticleBlock["imageCaptionPlacement"] }))}
                            className={`${inputClass} cursor-pointer`}
                            style={inputStyle}
                          >
                            <option value="below">Below Image</option>
                            <option value="overlay">Overlay</option>
                            <option value="hidden">Hidden</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Storage Asset</label>
                          <div className="text-[10px] px-3 py-2 rounded-md border truncate" style={{ borderColor: "#1A345B", background: "#09142D", color: "#7A9ABB" }}>
                            {selectedBlock.imageStorageAssetId || "Direct URL / not linked"}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label style={labelStyle}>Focal X ({selectedBlock.imageFocalX ?? 50}%)</label>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={selectedBlock.imageFocalX ?? 50}
                            onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, imageFocalX: Number(event.target.value) }))}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Focal Y ({selectedBlock.imageFocalY ?? 50}%)</label>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={selectedBlock.imageFocalY ?? 50}
                            onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, imageFocalY: Number(event.target.value) }))}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {selectedBlock.type === "heading" && (
                    <div>
                      <label style={labelStyle}>Heading Level</label>
                      <select value={selectedBlock.headingLevel || 2} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, headingLevel: Number(event.target.value) as 1 | 2 | 3 | 4 }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                        <option value={1}>H1</option>
                        <option value={2}>H2</option>
                        <option value={3}>H3</option>
                        <option value={4}>H4</option>
                      </select>
                    </div>
                  )}
                  {selectedBlock.type === "referenceTable" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label style={labelStyle}>Reference Rows</label>
                        <button onClick={() => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, rows: [...(block.rows || []), { id: `row-${uid()}`, cells: Array.from({ length: block.columns?.length || 1 }, () => "") }] }))} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Add Row</button>
                      </div>
                      <div className="flex items-center justify-between">
                        <label style={labelStyle}>Reference Columns</label>
                        <button onClick={() => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, columns: [...(block.columns || []), "New Column"], rows: (block.rows || []).map((row) => ({ ...row, cells: [...row.cells, ""] })) }))} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Add Column</button>
                      </div>
                      <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                        <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Column Order</div>
                        {(selectedBlock.columns || []).map((column, columnIndex, columns) => (
                          <div key={`${selectedBlock.id}-column-order-${columnIndex}`} className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={{ borderColor: "#15315A", background: "#071126" }}>
                            <span className="flex-1 text-[10px] truncate" style={{ color: "#D3E1FF" }}>
                              {column || `Column ${columnIndex + 1}`}
                            </span>
                            <button
                              onClick={() => moveReferenceTableColumn(selectedBlock.id, columnIndex, -1)}
                              disabled={columnIndex === 0}
                              className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`}
                              style={S_SUBTLE}
                            >
                              Left
                            </button>
                            <button
                              onClick={() => moveReferenceTableColumn(selectedBlock.id, columnIndex, 1)}
                              disabled={columnIndex === columns.length - 1}
                              className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`}
                              style={S_SUBTLE}
                            >
                              Right
                            </button>
                            <button
                              onClick={() => duplicateReferenceTableColumn(selectedBlock.id, columnIndex)}
                              className={`${retro.button} px-2 py-1 text-[9px]`}
                              style={S_ACCENT}
                            >
                              Copy
                            </button>
                            <button
                              onClick={() => removeReferenceTableColumn(selectedBlock.id, columnIndex)}
                              disabled={columns.length <= 1}
                              className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`}
                              style={S_RED}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                        <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Row Order</div>
                        {(selectedBlock.rows || []).length === 0 && (
                          <div className="text-[10px]" style={{ color: "#7A9ABB" }}>
                            Add a row to start building this reference table.
                          </div>
                        )}
                        {(selectedBlock.rows || []).map((row, rowIndex, rows) => (
                          <div key={row.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={{ borderColor: "#15315A", background: "#071126" }}>
                            <span className="flex-1 text-[10px] truncate" style={{ color: "#D3E1FF" }}>
                              Row {rowIndex + 1}
                              {row.cells.some(Boolean) ? ` | ${row.cells.filter(Boolean).slice(0, 2).join(" | ")}` : " | Empty"}
                            </span>
                            <button
                              onClick={() => moveReferenceTableRow(selectedBlock.id, row.id, -1)}
                              disabled={rowIndex === 0}
                              className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`}
                              style={S_SUBTLE}
                            >
                              Up
                            </button>
                            <button
                              onClick={() => moveReferenceTableRow(selectedBlock.id, row.id, 1)}
                              disabled={rowIndex === rows.length - 1}
                              className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`}
                              style={S_SUBTLE}
                            >
                              Down
                            </button>
                            <button
                              onClick={() => duplicateReferenceTableRow(selectedBlock.id, row.id)}
                              className={`${retro.button} px-2 py-1 text-[9px]`}
                              style={S_ACCENT}
                            >
                              Copy
                            </button>
                            <button
                              onClick={() => removeReferenceTableRow(selectedBlock.id, row.id)}
                              className={`${retro.button} px-2 py-1 text-[9px]`}
                              style={S_RED}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedBlock.type === "tabbedReference" && (() => {
                    const tabs = selectedBlock.tabs || [];
                    const activeTabId = activeTabbedReferenceTabs[selectedBlock.id] || selectedBlock.activeTabId || tabs[0]?.id || "";
                    const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label style={labelStyle}>Button Tabs</label>
                          <button onClick={() => addTabbedReferenceTab(selectedBlock.id)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Add Tab</button>
                        </div>
                        <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                          {tabs.length === 0 && (
                            <div className="text-[10px]" style={{ color: "#7A9ABB" }}>
                              Add a tab to create level buttons, spell tiers, or grouped reference lists.
                            </div>
                          )}
                          {tabs.map((tab, tabIndex) => (
                            <div key={tab.id} className="rounded-md border p-2 space-y-2" style={{ borderColor: tab.id === activeTab?.id ? "#3B6FAC" : "#15315A", background: tab.id === activeTab?.id ? "#0B1A36" : "#071126" }}>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setActiveTabbedReferenceTabs((prev) => ({ ...prev, [selectedBlock.id]: tab.id }))}
                                  className={`${retro.button} px-2 py-1 text-[9px]`}
                                  style={tab.id === activeTab?.id ? S_ACCENT : S_SUBTLE}
                                >
                                  Active
                                </button>
                                <input
                                  value={tab.label}
                                  onChange={(event) => updateTabbedReferenceTab(selectedBlock.id, tab.id, (entry) => ({ ...entry, label: event.target.value }))}
                                  placeholder="Button label"
                                  className={`${inputClass} flex-1`}
                                  style={inputStyle}
                                />
                              </div>
                              <input
                                value={tab.title || ""}
                                onChange={(event) => updateTabbedReferenceTab(selectedBlock.id, tab.id, (entry) => ({ ...entry, title: event.target.value }))}
                                placeholder="Displayed title inside this tab"
                                className={inputClass}
                                style={inputStyle}
                              />
                              <div className="flex flex-wrap gap-2">
                                <button onClick={() => moveTabbedReferenceTab(selectedBlock.id, tab.id, -1)} disabled={tabIndex === 0} className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`} style={S_SUBTLE}>Up</button>
                                <button onClick={() => moveTabbedReferenceTab(selectedBlock.id, tab.id, 1)} disabled={tabIndex === tabs.length - 1} className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`} style={S_SUBTLE}>Down</button>
                                <button onClick={() => removeTabbedReferenceTab(selectedBlock.id, tab.id)} disabled={tabs.length <= 1} className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`} style={S_RED}>Delete</button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {activeTab && (
                          <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>
                              Active Tab Table
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => addTabbedReferenceRow(selectedBlock.id, activeTab.id)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Add Row</button>
                              <button onClick={() => addTabbedReferenceColumn(selectedBlock.id, activeTab.id)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Add Column</button>
                              <button
                                onClick={() => updateTabbedReferenceTab(selectedBlock.id, activeTab.id, (tab) => ({ ...tab, rows: tab.rows.slice(0, -1) }))}
                                disabled={(activeTab.rows || []).length <= 1}
                                className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`}
                                style={S_RED}
                              >
                                Remove Last Row
                              </button>
                              <button
                                onClick={() => updateTabbedReferenceTab(selectedBlock.id, activeTab.id, (tab) => ({ ...tab, columns: tab.columns.slice(0, -1), rows: tab.rows.map((row) => ({ ...row, cells: row.cells.slice(0, -1) })) }))}
                                disabled={(activeTab.columns || []).length <= 1}
                                className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`}
                                style={S_RED}
                              >
                                Remove Last Column
                              </button>
                            </div>
                            <div className="text-[10px] leading-relaxed" style={{ color: "#7A9ABB" }}>
                              Edit column names and row cells directly inside the selected tabbed box on the canvas.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {selectedBlock.type === "keyValueBox" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label style={labelStyle}>Key-Value Items</label>
                        <button onClick={() => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, items: [...(block.items || []), { id: `item-${uid()}`, label: "Label", value: "Value" }] }))} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Add Item</button>
                      </div>
                      <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                        {(selectedBlock.items || []).length === 0 && (
                          <div className="text-[10px]" style={{ color: "#7A9ABB" }}>
                            Add stats, traits, or field-value pairs for a cleaner wiki infobox.
                          </div>
                        )}
                        {(selectedBlock.items || []).map((item, itemIndex, items) => (
                          <div key={item.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={{ borderColor: "#15315A", background: "#071126" }}>
                            <span className="flex-1 text-[10px] truncate" style={{ color: "#D3E1FF" }}>
                              {item.label || `Item ${itemIndex + 1}`}
                              {item.value ? ` | ${item.value}` : ""}
                            </span>
                            <button
                              onClick={() => moveKeyValueItem(selectedBlock.id, item.id, -1)}
                              disabled={itemIndex === 0}
                              className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`}
                              style={S_SUBTLE}
                            >
                              Up
                            </button>
                            <button
                              onClick={() => moveKeyValueItem(selectedBlock.id, item.id, 1)}
                              disabled={itemIndex === items.length - 1}
                              className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`}
                              style={S_SUBTLE}
                            >
                              Down
                            </button>
                            <button
                              onClick={() => duplicateKeyValueItem(selectedBlock.id, item.id)}
                              className={`${retro.button} px-2 py-1 text-[9px]`}
                              style={S_ACCENT}
                            >
                              Copy
                            </button>
                            <button
                              onClick={() => removeKeyValueItem(selectedBlock.id, item.id)}
                              className={`${retro.button} px-2 py-1 text-[9px]`}
                              style={S_RED}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedBlock.type === "wikiLinksList" && (
                    <div className="space-y-2">
                      <label style={labelStyle}>Add Linked Article</label>
                      <select
                        value=""
                        onChange={(event) => {
                          if (!event.target.value) return;
                          const nextId = event.target.value;
                          updateSingleBlock(selectedBlock.id, (block) => ({ ...block, articleIds: Array.from(new Set([...(block.articleIds || []), nextId])) }));
                          event.target.value = "";
                        }}
                        className={`${inputClass} cursor-pointer`}
                        style={inputStyle}
                      >
                        <option value="">Select an article</option>
                        {articleLinkChoices.map((article) => (
                          <option key={article.id} value={article.id}>{article.title}</option>
                        ))}
                      </select>
                      <div className="space-y-1">
                        {(selectedBlock.articleIds || []).length === 0 && (
                          <div className="rounded-md border px-2 py-2 text-[10px]" style={{ borderColor: "#1A345B", background: "#09142D", color: "#7A9ABB" }}>
                            Add linked articles to build a related reading block or guide players through a reference trail.
                          </div>
                        )}
                        {(selectedBlock.articleIds || []).map((articleId, articleIndex, articleIds) => (
                          <div key={articleId} className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                            <span className="flex-1 text-[10px]" style={{ color: "#D3E1FF" }}>{blockIdToPage.get(articleId)?.title || articleId}</span>
                            <button
                              onClick={() => moveWikiLinkItem(selectedBlock.id, articleId, -1)}
                              disabled={articleIndex === 0}
                              className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`}
                              style={S_SUBTLE}
                            >
                              Up
                            </button>
                            <button
                              onClick={() => moveWikiLinkItem(selectedBlock.id, articleId, 1)}
                              disabled={articleIndex === articleIds.length - 1}
                              className={`${retro.button} px-2 py-1 text-[9px] disabled:opacity-40`}
                              style={S_SUBTLE}
                            >
                              Down
                            </button>
                            <button
                              onClick={() => removeWikiLinkItem(selectedBlock.id, articleId)}
                              className={`${retro.button} px-2 py-1 text-[9px]`}
                              style={S_RED}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {inspectorTab === "layout" && selectedArticleChromeField && selectedArticleChromeLayout && (
                <div className="space-y-3">
                  <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Article Field Layout</div>
                      <div className="text-[12px] font-bold mt-1" style={{ color: "#D3E1FF" }}>
                        Article {selectedArticleChromeLabel}
                      </div>
                      <div className="text-[10px] mt-1 leading-relaxed" style={{ color: "#8EA9D7" }}>
                        These controls use the same snap grid as blocks, but stay in the article header region above the main content.
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label style={labelStyle}>Column Start</label>
                        <input
                          type="number"
                          min={1}
                          max={WIKI_BLOCK_COLUMNS}
                          value={selectedArticleChromeLayout.colStart}
                          onChange={(event) => updateArticleChromeLayout(selectedArticleChromeField, { colStart: Number(event.target.value) || 1 })}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Column Span</label>
                        <input
                          type="number"
                          min={selectedArticleChromeLayout.minColSpan || 6}
                          max={WIKI_BLOCK_COLUMNS}
                          value={selectedArticleChromeLayout.colSpan}
                          onChange={(event) => updateArticleChromeLayout(selectedArticleChromeField, { colSpan: Number(event.target.value) || selectedArticleChromeLayout.colSpan })}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Row Start</label>
                        <input
                          type="number"
                          min={1}
                          value={selectedArticleChromeLayout.rowStart}
                          onChange={(event) => updateArticleChromeLayout(selectedArticleChromeField, { rowStart: Number(event.target.value) || 1 })}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Row Span</label>
                        <input
                          type="number"
                          min={selectedArticleChromeLayout.minRowSpan || 2}
                          value={selectedArticleChromeLayout.rowSpan}
                          onChange={(event) => updateArticleChromeLayout(selectedArticleChromeField, { rowSpan: Number(event.target.value) || selectedArticleChromeLayout.rowSpan })}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <button onClick={() => updateArticleChromeLayout(selectedArticleChromeField, { colStart: selectedArticleChromeLayout.colStart - 1 })} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Left</button>
                      <button onClick={() => updateArticleChromeLayout(selectedArticleChromeField, { colStart: selectedArticleChromeLayout.colStart + 1 })} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Right</button>
                      <button onClick={() => updateArticleChromeLayout(selectedArticleChromeField, { rowStart: selectedArticleChromeLayout.rowStart - 1 })} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Up</button>
                      <button onClick={() => updateArticleChromeLayout(selectedArticleChromeField, { rowStart: selectedArticleChromeLayout.rowStart + 1 })} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Down</button>
                    </div>
                    <button
                      onClick={() => updateArticleChromeLayout(selectedArticleChromeField, DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS[selectedArticleChromeField])}
                      className={`${retro.button} w-full px-3 py-1.5 text-[10px]`}
                      style={S_ACCENT}
                    >
                      Reset This Field Layout
                    </button>
                  </div>
                </div>
              )}

              {inspectorTab === "layout" && selectedBlock && (
                <div className="space-y-3">
                  <label className="flex items-start gap-2 rounded-md border p-2.5 cursor-pointer" style={{ borderColor: selectedBlock.layout.allowOverflow ? "#7A5B24" : "#1A345B", background: selectedBlock.layout.allowOverflow ? "#211A0B" : "#09142D" }}>
                    <input
                      type="checkbox"
                      checked={selectedBlock.layout.allowOverflow === true}
                      onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({
                        ...block,
                        layout: { ...block.layout, allowOverflow: event.target.checked },
                      }))}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold" style={{ color: selectedBlock.layout.allowOverflow ? "#FFD27A" : "#B8C8E8" }}>Allow out-of-bounds placement</span>
                      <span className="block mt-0.5 text-[9px] leading-relaxed" style={S_MUTED}>Advanced override: column and row starts may go below 1 or beyond the normal desktop grid.</span>
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label style={labelStyle}>Column Start</label>
                      <input type="number" min={selectedBlock.layout.allowOverflow ? undefined : 1} max={selectedBlock.layout.allowOverflow ? undefined : WIKI_BLOCK_COLUMNS} value={selectedBlock.layout.colStart} onChange={(event) => { if (Number.isFinite(event.currentTarget.valueAsNumber)) updateBlocks(placeWikiBlock(pageBlocks, selectedBlock.id, { colStart: event.currentTarget.valueAsNumber })); }} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Column Span</label>
                      <input type="number" min={selectedBlock.layout.minColSpan || 1} max={WIKI_BLOCK_COLUMNS} value={selectedBlock.layout.colSpan} onChange={(event) => updateBlocks(placeWikiBlock(pageBlocks, selectedBlock.id, { colSpan: Number(event.target.value) || selectedBlock.layout.colSpan }))} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Row Start</label>
                      <input type="number" min={selectedBlock.layout.allowOverflow ? undefined : 1} value={selectedBlock.layout.rowStart} onChange={(event) => { if (Number.isFinite(event.currentTarget.valueAsNumber)) updateBlocks(placeWikiBlock(pageBlocks, selectedBlock.id, { rowStart: event.currentTarget.valueAsNumber })); }} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Row Span</label>
                      <input type="number" min={selectedBlock.layout.minRowSpan || 1} value={selectedBlock.layout.rowSpan} onChange={(event) => updateBlocks(placeWikiBlock(pageBlocks, selectedBlock.id, { rowSpan: Number(event.target.value) || selectedBlock.layout.rowSpan }))} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <button onClick={() => nudgeBlock(selectedBlock.id, -1, 0)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Left</button>
                    <button onClick={() => nudgeBlock(selectedBlock.id, 1, 0)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Right</button>
                    <button onClick={() => nudgeBlock(selectedBlock.id, 0, -1)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Up</button>
                    <button onClick={() => nudgeBlock(selectedBlock.id, 0, 1)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Down</button>
                  </div>
                  <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Fluid Behavior</div>
                      <div className="mt-1 text-[10px]" style={{ color: "#8EA9D7" }}>
                        These settings guide responsive previews and future section tools while preserving the authored desktop grid.
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label style={labelStyle}>Width Mode</label>
                        <select
                          value={selectedBlock.fluid?.widthMode || "fixed"}
                          onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, fluid: { ...block.fluid, widthMode: event.target.value as NonNullable<WikiArticleBlock["fluid"]>["widthMode"] } }))}
                          className={`${inputClass} cursor-pointer`}
                          style={inputStyle}
                        >
                          <option value="fixed">Fixed</option>
                          <option value="fill">Fill Section</option>
                          <option value="hug">Hug Content</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Height Mode</label>
                        <select
                          value={selectedBlock.fluid?.heightMode || "fixed"}
                          onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, fluid: { ...block.fluid, heightMode: event.target.value as NonNullable<WikiArticleBlock["fluid"]>["heightMode"] } }))}
                          className={`${inputClass} cursor-pointer`}
                          style={inputStyle}
                        >
                          <option value="fixed">Fixed</option>
                          <option value="hug">Hug Content</option>
                          <option value="fill">Fill Section</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Mobile Behavior</label>
                        <select
                          value={selectedBlock.fluid?.mobileBehavior || selectedBlock.mobileCollapseMode || "stack"}
                          onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({
                            ...block,
                            mobileCollapseMode: event.target.value as WikiArticleBlock["mobileCollapseMode"],
                            fluid: { ...block.fluid, mobileBehavior: event.target.value as NonNullable<WikiArticleBlock["fluid"]>["mobileBehavior"] },
                          }))}
                          className={`${inputClass} cursor-pointer`}
                          style={inputStyle}
                        >
                          <option value="stack">Stack</option>
                          <option value="scrollX">Horizontal Scroll</option>
                          <option value="compact">Compact / Scroll Y</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Mobile Order</label>
                        <input
                          type="number"
                          value={selectedBlock.fluid?.preferredMobileOrder ?? ""}
                          placeholder="Auto"
                          onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({
                            ...block,
                            fluid: {
                              ...block.fluid,
                              preferredMobileOrder: event.target.value === "" ? undefined : Number(event.target.value),
                            },
                          }))}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2" style={{ borderColor: "#17315A", background: "#071126" }}>
                      <span className="text-[11px]" style={{ color: "#D3E1FF" }}>Keep image/aspect ratio</span>
                      <button
                        onClick={() => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, fluid: { ...block.fluid, keepAspectRatio: !block.fluid?.keepAspectRatio } }))}
                        className={`${retro.button} px-2 py-1 text-[10px]`}
                        style={selectedBlock.fluid?.keepAspectRatio ? S_ACCENT : S_SUBTLE}
                      >
                        {selectedBlock.fluid?.keepAspectRatio ? "On" : "Off"}
                      </button>
                    </div>
                    {(selectedBlock.layoutGroupId || selectedBlock.layoutGroupMode !== "manual") && (
                      <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "#24436D", background: "#071126", color: "#A8D8FF" }}>
                        Group: {selectedBlock.layoutGroupName || "Unnamed Group"} | {selectedBlock.layoutGroupMode || "manual"}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Surface Style</label>
                    <select
                      value={selectedBlock.appearance.surfaceStyle || "flat"}
                      onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({
                        ...block,
                        appearance: {
                          ...block.appearance,
                          surfaceStyle: event.target.value as WikiArticleBlock["appearance"]["surfaceStyle"],
                        },
                      }))}
                      className={`${inputClass} cursor-pointer`}
                      style={inputStyle}
                    >
                      <option value="flat">Flat Panel</option>
                      <option value="raised">Raised Above Screen</option>
                      <option value="inset">Indented Into Screen</option>
                      <option value="glass">Glass / Hologram</option>
                      <option value="none">Transparent / No Box</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label style={labelStyle}>Padding</label>
                      <select value={selectedBlock.appearance.padding || "normal"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, padding: event.target.value as WikiArticleBlock["appearance"]["padding"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                        <option value="tight">Tight</option>
                        <option value="normal">Normal</option>
                        <option value="loose">Loose</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Border Style</label>
                      <select value={selectedBlock.appearance.borderStyle || "solid"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, borderStyle: event.target.value as WikiArticleBlock["appearance"]["borderStyle"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                        <option value="double">Double</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                  </div>
                  {(selectedBlock.type === "divider" || selectedBlock.type === "lineBox") && (
                    <div>
                      <label style={labelStyle}>Line Style</label>
                      <select
                        value={selectedBlock.appearance.dividerStyle || "line"}
                        onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({
                          ...block,
                          appearance: {
                            ...block.appearance,
                            dividerStyle: event.target.value as WikiArticleBlock["appearance"]["dividerStyle"],
                          },
                        }))}
                        className={`${inputClass} cursor-pointer`}
                        style={inputStyle}
                      >
                        <option value="line">Single Line</option>
                        <option value="double">Double Line</option>
                        <option value="dashed">Dashed Line</option>
                        <option value="glow">Glowing Line</option>
                        <option value="notched">Notched Divider</option>
                      </select>
                    </div>
                  )}
                  {selectedBlock.type === "lineBox" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label style={labelStyle}>Direction</label>
                        <select
                          value={selectedBlock.lineOrientation || "horizontal"}
                          onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({
                            ...block,
                            lineOrientation: event.target.value as WikiArticleBlock["lineOrientation"],
                            layout: {
                              ...block.layout,
                              colSpan: event.target.value === "vertical" ? Math.min(block.layout.colSpan, 4) || 2 : Math.max(block.layout.colSpan, 8),
                              rowSpan: event.target.value === "vertical" ? Math.max(block.layout.rowSpan, 8) : Math.min(Math.max(block.layout.rowSpan, 1), 4),
                            },
                          }))}
                          className={`${inputClass} cursor-pointer`}
                          style={inputStyle}
                        >
                          <option value="horizontal">Horizontal</option>
                          <option value="vertical">Vertical</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Thickness</label>
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={selectedBlock.lineThickness || 2}
                          onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({
                            ...block,
                            lineThickness: Math.max(1, Math.min(12, Number(event.target.value) || 2)),
                          }))}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label style={labelStyle}>Accent</label>
                      <input type="color" value={selectedBlock.appearance.accentColor || accent} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, accentColor: event.target.value } }))} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Background</label>
                      <input type="color" value={selectedBlock.appearance.backgroundColor || "#081025"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, backgroundColor: event.target.value } }))} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Border</label>
                      <input type="color" value={selectedBlock.appearance.borderColor || "#20335B"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, borderColor: event.target.value } }))} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Visibility Mode</label>
                    <select value={selectedBlock.visibility.mode} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, visibility: { ...block.visibility, mode: event.target.value as WikiArticleBlock["visibility"]["mode"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                      <option value="visible">Visible</option>
                      <option value="spoiler">Spoiler</option>
                      <option value="hidden">Hidden</option>
                    </select>
                  </div>
                  <div className="rounded-md border p-3 space-y-2" style={{ borderColor: "#2B365C", background: "#071126" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#FFB86A", fontWeight: 700 }}>Reveal Controls</div>
                        <div className="text-[10px] mt-1" style={{ color: "#8EA9D7" }}>
                          Player-facing hint text and DM reveal timing for this block.
                        </div>
                      </div>
                      <Shield size={14} style={S_WARN} />
                    </div>
                    <div>
                      <label style={labelStyle}>Reveal Label</label>
                      <input
                        value={selectedBlock.visibility.revealLabel || ""}
                        onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, visibility: { ...block.visibility, revealLabel: event.target.value } }))}
                        placeholder="Spoiler, Secret, Player Reward..."
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Reveal After / Condition</label>
                      <input
                        value={selectedBlock.visibility.revealAfter || ""}
                        onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, visibility: { ...block.visibility, revealAfter: event.target.value } }))}
                        placeholder="Session 12, quest complete, player discovers..."
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>DM Reveal Note</label>
                      <textarea
                        value={selectedBlock.visibility.revealNote || ""}
                        onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, visibility: { ...block.visibility, revealNote: event.target.value } }))}
                        placeholder="Why this is restricted, who should learn it, or how it unlocks."
                        rows={2}
                        className={`${inputClass} resize-y`}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Allowed Players</label>
                    <div className="space-y-1 mt-1">
                      {players.map((player) => {
                        const active = selectedBlock.visibility.assignedTo.includes(player.id);
                        return (
                          <button
                            key={player.id}
                            onClick={() => updateSingleBlock(selectedBlock.id, (block) => ({
                              ...block,
                              visibility: {
                                ...block.visibility,
                                assignedTo: active
                                  ? block.visibility.assignedTo.filter((entry) => entry !== player.id)
                                  : [...block.visibility.assignedTo, player.id],
                              },
                            }))}
                            className="w-full text-left px-2 py-1.5 text-[10px] rounded-md border"
                            style={{ color: active ? "#D3E1FF" : "#7A8CAA", borderColor: active ? "#2A5ABB" : "#1A345B", background: active ? "#0C1735" : "#081027" }}
                          >
                            {player.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border px-3 py-2" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <span className="text-[11px]" style={{ color: "#D3E1FF" }}>Lock block position</span>
                    <button onClick={() => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, locked: !block.locked }))} className={`${retro.button} px-2 py-1 text-[10px]`} style={selectedBlock.locked ? S_WARN : S_SUBTLE}>
                      {selectedBlock.locked ? "Locked" : "Unlocked"}
                    </button>
                  </div>
                </div>
              )}

              {inspectorTab === "style" && selectedBlock && (
                <div className="space-y-3">
                  <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Preset</div>
                        <div className="mt-1 text-[10px]" style={{ color: "#8EA9D7" }}>
                          Apply a reusable visual recipe, or save this block as a new style preset.
                        </div>
                      </div>
                      <button onClick={resetSelectedBlockStyle} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_SUBTLE}>Reset</button>
                    </div>
                    <select
                      value={selectedBlock.appearance.stylePresetId || ""}
                      onChange={(event) => {
                        const preset = stylePresetLibrary.find((entry) => entry.id === event.target.value);
                        if (preset) applyBlockStylePreset(selectedBlock.id, preset);
                      }}
                      className={`${inputClass} cursor-pointer`}
                      style={inputStyle}
                    >
                      <option value="">Choose a style preset</option>
                      {stylePresetLibrary.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name} {preset.builtIn ? "(Built In)" : "(Custom)"}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={saveSelectedBlockStylePreset} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>Save From Block</button>
                      {stylePresetLibrary.find((entry) => entry.id === selectedBlock.appearance.stylePresetId)?.builtIn && (
                        <button
                          onClick={() => {
                            const preset = stylePresetLibrary.find((entry) => entry.id === selectedBlock.appearance.stylePresetId);
                            if (preset) duplicateStylePresetToLibrary(preset);
                          }}
                          className={`${retro.button} px-2 py-1 text-[10px]`}
                          style={S_SUBTLE}
                        >
                          Copy Built In
                        </button>
                      )}
                    </div>
                    {wikiBlockStylePresets.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: "#6F88B4", fontWeight: 700 }}>Custom Presets</div>
                        {wikiBlockStylePresets.map((preset) => (
                          <div key={preset.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={{ borderColor: "#17315A", background: "#071126" }}>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[10px] font-bold" style={{ color: "#D3E1FF" }}>{preset.name}</div>
                              <div className="truncate text-[9px]" style={{ color: "#7A9ABB" }}>{preset.category}</div>
                            </div>
                            <button onClick={() => applyBlockStylePreset(selectedBlock.id, preset)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_ACCENT}>Apply</button>
                            <button onClick={() => renameStoredStylePreset(preset.id)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_SUBTLE}>Rename</button>
                            <button onClick={() => deleteStoredStylePreset(preset.id)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_RED}>Delete</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Surface</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label style={labelStyle}>Surface Style</label>
                        <select value={selectedBlock.appearance.surfaceStyle || "flat"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, surfaceStyle: event.target.value as WikiArticleBlock["appearance"]["surfaceStyle"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                          <option value="flat">Flat Panel</option>
                          <option value="raised">Raised Screen</option>
                          <option value="inset">Inset Monitor</option>
                          <option value="glass">Glass / Hologram</option>
                          <option value="none">Transparent</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Background Treatment</label>
                        <select value={selectedBlock.appearance.backgroundTreatment || "solid"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, backgroundTreatment: event.target.value as WikiArticleBlock["appearance"]["backgroundTreatment"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                          <option value="solid">Solid</option>
                          <option value="gradient">Gradient</option>
                          <option value="scanline">Scanline</option>
                          <option value="terminal">Terminal</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label style={labelStyle}>Accent</label>
                        <input type="color" value={selectedBlock.appearance.accentColor || accent} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, accentColor: event.target.value } }))} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Background</label>
                        <input type="color" value={selectedBlock.appearance.backgroundColor || "#081025"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, backgroundColor: event.target.value } }))} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Opacity</label>
                        <input type="number" min={10} max={100} value={selectedBlock.appearance.opacity ?? 100} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, opacity: Number(event.target.value) || 100 } }))} className={inputClass} style={inputStyle} />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Text</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label style={labelStyle}>Title Color</label>
                        <input type="color" value={selectedBlock.appearance.titleColor || selectedBlock.appearance.accentColor || accent} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, titleColor: event.target.value } }))} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Body Color</label>
                        <input type="color" value={selectedBlock.appearance.bodyColor || txt} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, bodyColor: event.target.value } }))} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Title Alignment</label>
                        <select value={selectedBlock.appearance.titleAlign || "left"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, titleAlign: event.target.value as WikiArticleBlock["appearance"]["titleAlign"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Body Alignment</label>
                        <select value={selectedBlock.appearance.bodyAlign || "left"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, bodyAlign: event.target.value as WikiArticleBlock["appearance"]["bodyAlign"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                          <option value="justify">Justify</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Spacing And Border</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label style={labelStyle}>Padding</label>
                        <select value={selectedBlock.appearance.padding || "normal"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, padding: event.target.value as WikiArticleBlock["appearance"]["padding"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                          <option value="tight">Tight</option>
                          <option value="normal">Normal</option>
                          <option value="loose">Loose</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Border Style</label>
                        <select value={selectedBlock.appearance.borderStyle || "solid"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, borderStyle: event.target.value as WikiArticleBlock["appearance"]["borderStyle"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                          <option value="solid">Solid</option>
                          <option value="dashed">Dashed</option>
                          <option value="dotted">Dotted</option>
                          <option value="double">Double</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label style={labelStyle}>Corner Shape</label>
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            ["Square", 0],
                            ["Rounded", 10],
                            ["Soft Round", 22],
                          ] as const).map(([label, radius]) => (
                            <button
                              key={label}
                              onClick={() => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, borderRadius: radius } }))}
                              className={`${retro.button} px-2 py-1.5 text-[10px]`}
                              style={(selectedBlock.appearance.borderRadius ?? 10) === radius ? S_ACCENT : S_SUBTLE}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Border Color</label>
                        <input type="color" value={selectedBlock.appearance.borderColor || "#20335B"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, borderColor: event.target.value } }))} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Border Width</label>
                        <input type="number" min={0} max={8} value={selectedBlock.appearance.borderWidth ?? 1} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, borderWidth: Number(event.target.value) || 0 } }))} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Corner Radius</label>
                        <input type="number" min={0} max={36} value={selectedBlock.appearance.borderRadius ?? 10} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, borderRadius: Number(event.target.value) || 0 } }))} className={inputClass} style={inputStyle} />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Effects</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label style={labelStyle}>Glow Intensity ({selectedBlock.appearance.glowIntensity ?? 0})</label>
                        <input type="range" min={0} max={100} value={selectedBlock.appearance.glowIntensity ?? 0} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, glowIntensity: Number(event.target.value) } }))} className="w-full" />
                      </div>
                      <div>
                        <label style={labelStyle}>Shadow Depth ({selectedBlock.appearance.shadowDepth ?? 1})</label>
                        <input type="range" min={0} max={5} value={selectedBlock.appearance.shadowDepth ?? 1} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, shadowDepth: Number(event.target.value) } }))} className="w-full" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Behavior</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label style={labelStyle}>Overflow</label>
                        <select value={selectedBlock.behavior?.overflowMode || "clip"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, behavior: { ...block.behavior, overflowMode: event.target.value as NonNullable<WikiArticleBlock["behavior"]>["overflowMode"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                          <option value="clip">Clip</option>
                          <option value="scroll">Scroll</option>
                          <option value="fade">Fade</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Mobile Density</label>
                        <select value={selectedBlock.behavior?.mobileDensity || "comfortable"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, behavior: { ...block.behavior, mobileDensity: event.target.value as NonNullable<WikiArticleBlock["behavior"]>["mobileDensity"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                          <option value="comfortable">Comfortable</option>
                          <option value="compact">Compact</option>
                          <option value="dense">Dense</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Anchor Label</label>
                        <input value={selectedBlock.behavior?.anchorLabel || ""} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, behavior: { ...block.behavior, anchorLabel: event.target.value } }))} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Click Action</label>
                        <select value={selectedBlock.behavior?.clickAction || "none"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, behavior: { ...block.behavior, clickAction: event.target.value as NonNullable<WikiArticleBlock["behavior"]>["clickAction"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                          <option value="none">None</option>
                          <option value="expandImage">Expand Image</option>
                          <option value="openArticle">Open Linked Article</option>
                          <option value="toggleCollapse">Toggle Collapse</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["collapsible", "Collapsible"],
                        ["defaultCollapsed", "Collapsed By Default"],
                        ["includeInToc", "Include In TOC"],
                        ["mobileFullWidth", "Full Width On Mobile"],
                      ].map(([key, label]) => {
                        const active = !!selectedBlock.behavior?.[key as keyof NonNullable<WikiArticleBlock["behavior"]>];
                        return (
                          <button
                            key={key}
                            onClick={() => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, behavior: { ...block.behavior, [key]: !active } }))}
                            className={`${retro.button} px-2 py-1.5 text-[10px]`}
                            style={active ? S_ACCENT : S_SUBTLE}
                          >
                            {label}: {active ? "On" : "Off"}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Type Settings</div>
                    {selectedBlock.type === "image" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label style={labelStyle}>Frame Style</label>
                          <select value={selectedBlock.imageFrameStyle || "thin"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, imageFrameStyle: event.target.value as WikiArticleBlock["imageFrameStyle"] }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                            <option value="none">None</option>
                            <option value="thin">Thin</option>
                            <option value="thick">Thick</option>
                            <option value="polaroid">Polaroid</option>
                            <option value="terminal">Terminal</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Caption Style</label>
                          <select value={selectedBlock.imageCaptionStyle || "plain"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, imageCaptionStyle: event.target.value as WikiArticleBlock["imageCaptionStyle"] }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                            <option value="plain">Plain</option>
                            <option value="panel">Panel</option>
                            <option value="terminal">Terminal</option>
                            <option value="muted">Muted</option>
                          </select>
                        </div>
                      </div>
                    )}
                    {(selectedBlock.type === "referenceTable" || selectedBlock.type === "tabbedReference") && (
                      <div className="space-y-2">
                        <div>
                          <label style={labelStyle}>Table Density</label>
                          <select value={selectedBlock.tableDensity || "comfortable"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, tableDensity: event.target.value as WikiArticleBlock["tableDensity"] }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                            <option value="comfortable">Comfortable</option>
                            <option value="compact">Compact</option>
                            <option value="dense">Dense</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            ["tableStripedRows", "Striped Rows"],
                            ["tableStickyHeader", "Sticky Header"],
                            ["tableLinkedCells", "Wiki Link Cells"],
                          ].map(([key, label]) => {
                            const active = !!selectedBlock[key as keyof WikiArticleBlock];
                            return (
                              <button key={key} onClick={() => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, [key]: !active }))} className={`${retro.button} px-2 py-1.5 text-[9px]`} style={active ? S_ACCENT : S_SUBTLE}>
                                {label}: {active ? "On" : "Off"}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {selectedBlock.type === "keyValueBox" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label style={labelStyle}>Density</label>
                          <select value={selectedBlock.keyValueDensity || "comfortable"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, keyValueDensity: event.target.value as WikiArticleBlock["keyValueDensity"] }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                            <option value="comfortable">Comfortable</option>
                            <option value="compact">Compact</option>
                            <option value="dense">Dense</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Label Alignment</label>
                          <select value={selectedBlock.keyValueLabelAlign || "left"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, keyValueLabelAlign: event.target.value as WikiArticleBlock["keyValueLabelAlign"] }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                            <option value="left">Left</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                        <button onClick={() => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, keyValueRowDividers: !block.keyValueRowDividers }))} className={`${retro.button} px-2 py-1.5 text-[10px]`} style={selectedBlock.keyValueRowDividers ? S_ACCENT : S_SUBTLE}>
                          Row Dividers: {selectedBlock.keyValueRowDividers ? "On" : "Off"}
                        </button>
                      </div>
                    )}
                    {selectedBlock.type === "wikiLinksList" && (
                      <div>
                        <label style={labelStyle}>Display Mode</label>
                        <select value={selectedBlock.wikiLinksDisplayMode || "list"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, wikiLinksDisplayMode: event.target.value as WikiArticleBlock["wikiLinksDisplayMode"] }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                          <option value="list">List</option>
                          <option value="cards">Cards</option>
                          <option value="chips">Chips</option>
                        </select>
                      </div>
                    )}
                    {(selectedBlock.type === "divider" || selectedBlock.type === "lineBox") && (
                      <div className="grid grid-cols-2 gap-2">
                        {selectedBlock.type === "lineBox" && (
                          <>
                            <div>
                              <label style={labelStyle}>Direction</label>
                              <select
                                value={selectedBlock.lineOrientation || "horizontal"}
                                onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({
                                  ...block,
                                  lineOrientation: event.target.value as WikiArticleBlock["lineOrientation"],
                                  layout: {
                                    ...block.layout,
                                    colSpan: event.target.value === "vertical" ? Math.min(block.layout.colSpan, 4) || 2 : Math.max(block.layout.colSpan, 8),
                                    rowSpan: event.target.value === "vertical" ? Math.max(block.layout.rowSpan, 8) : Math.min(Math.max(block.layout.rowSpan, 1), 4),
                                  },
                                }))}
                                className={`${inputClass} cursor-pointer`}
                                style={inputStyle}
                              >
                                <option value="horizontal">Horizontal</option>
                                <option value="vertical">Vertical</option>
                              </select>
                            </div>
                            <div>
                              <label style={labelStyle}>Thickness</label>
                              <input
                                type="number"
                                min={1}
                                max={12}
                                value={selectedBlock.lineThickness || 2}
                                onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({
                                  ...block,
                                  lineThickness: Math.max(1, Math.min(12, Number(event.target.value) || 2)),
                                }))}
                                className={inputClass}
                                style={inputStyle}
                              />
                            </div>
                          </>
                        )}
                        <div>
                          <label style={labelStyle}>Line Style</label>
                          <select value={selectedBlock.appearance.dividerStyle || "line"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, dividerStyle: event.target.value as WikiArticleBlock["appearance"]["dividerStyle"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                            <option value="line">Line</option>
                            <option value="double">Double</option>
                            <option value="dashed">Dashed</option>
                            <option value="glow">Glowing</option>
                            <option value="notched">Notched</option>
                          </select>
                        </div>
                        {selectedBlock.type === "divider" && (
                          <div>
                            <label style={labelStyle}>Label Position</label>
                            <select value={selectedBlock.appearance.dividerLabelPosition || "center"} onChange={(event) => updateSingleBlock(selectedBlock.id, (block) => ({ ...block, appearance: { ...block.appearance, dividerLabelPosition: event.target.value as WikiArticleBlock["appearance"]["dividerLabelPosition"] } }))} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                              <option value="above">Above</option>
                              <option value="center">Centered</option>
                              <option value="below">Below</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                    {!["image", "referenceTable", "tabbedReference", "keyValueBox", "wikiLinksList", "divider", "lineBox"].includes(selectedBlock.type) && (
                      <div className="rounded-md border px-2 py-2 text-[10px]" style={{ borderColor: "#17315A", background: "#071126", color: "#7A9ABB" }}>
                        This block type uses the shared surface, text, border, effects, and behavior settings above.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {inspectorTab === "style" && selectedArticleChromeField && (
                <div className="rounded-md border p-3 space-y-2" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                  <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Article Field Style</div>
                  <div className="text-[10px] leading-relaxed" style={{ color: "#8EA9D7" }}>
                    Article {selectedArticleChromeLabel} uses the page-level article colors so the header stays consistent in Edit, Clean Canvas, Player Preview, and published views.
                  </div>
                  <button onClick={() => setInspectorTab("article")} className={`${retro.button} w-full px-3 py-1.5 text-[10px]`} style={S_ACCENT}>
                    Open Article Appearance
                  </button>
                </div>
              )}

              {inspectorTab === "article" && (
                <div className="space-y-3">
                  <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Canvas Frame</div>
                      <div className="text-[10px] mt-1" style={{ color: "#8EA9D7" }}>
                        The editor keeps a stable article frame and only switches into a minimized mode on smaller devices.
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Frame Preset</label>
                      <select
                        value={canvasSettings.preset}
                        onChange={(event) => {
                          const preset = event.target.value as keyof typeof WIKI_CANVAS_PRESETS;
                          update("canvasSettings", normalizeWikiCanvasSettings({
                            ...WIKI_CANVAS_PRESETS[preset],
                            compactHeaderLayout: canvasSettings.compactHeaderLayout,
                            articleChromeLayouts: canvasSettings.articleChromeLayouts,
                          }));
                        }}
                        className={`${inputClass} cursor-pointer`}
                        style={inputStyle}
                      >
                        <option value="standard">Standard</option>
                        <option value="large">Large</option>
                        <option value="referenceWide">Reference Wide</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      aria-pressed={canvasSettings.compactHeaderLayout}
                      onClick={() => update("canvasSettings", normalizeWikiCanvasSettings({
                        ...canvasSettings,
                        compactHeaderLayout: !canvasSettings.compactHeaderLayout,
                      }))}
                      className={`${retro.button} flex w-full items-center justify-between gap-3 px-3 py-2 text-left`}
                      style={canvasSettings.compactHeaderLayout ? S_ACCENT : S_SUBTLE}
                    >
                      <span className="flex items-center gap-2">
                        <Layers size={12} />
                        <span>
                          <span className="block text-[10px] font-bold">Compact Header Layout</span>
                          <span className="block text-[9px] opacity-75">Allow article blocks to share the title, subtitle, and description rows.</span>
                        </span>
                      </span>
                      <span className="text-[9px] font-bold">{canvasSettings.compactHeaderLayout ? "ON" : "OFF"}</span>
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label style={labelStyle}>Frame Width</label>
                        <input
                          type="number"
                          min={1100}
                          max={1760}
                          value={canvasSettings.frameWidth}
                          onChange={(event) => update("canvasSettings", normalizeWikiCanvasSettings({
                            ...canvasSettings,
                            frameWidth: Number(event.target.value) || canvasSettings.frameWidth,
                          }))}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Canvas Height</label>
                        <input
                          type="number"
                          min={960}
                          max={3600}
                          value={canvasSettings.canvasHeight}
                          onChange={(event) => update("canvasSettings", normalizeWikiCanvasSettings({
                            ...canvasSettings,
                            canvasHeight: Number(event.target.value) || canvasSettings.canvasHeight,
                          }))}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Minimum Canvas Height</label>
                      <input
                        type="number"
                        min={960}
                        max={2800}
                        value={canvasSettings.minCanvasHeight}
                        onChange={(event) => update("canvasSettings", normalizeWikiCanvasSettings({
                          ...canvasSettings,
                          minCanvasHeight: Number(event.target.value) || canvasSettings.minCanvasHeight,
                        }))}
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div className="rounded-md border p-3 space-y-2" style={{ borderColor: layoutQaFindings.length ? "#5A4720" : "#1A4A36", background: layoutQaFindings.length ? "rgba(82, 52, 8, 0.22)" : "rgba(8, 56, 35, 0.24)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: layoutQaFindings.length ? "#FFD37A" : "#8FF0B8", fontWeight: 700 }}>Responsive QA</div>
                      <div className="text-[10px]" style={{ color: "#A7C6EE" }}>{responsiveFrame.label}</div>
                    </div>
                    {layoutQaFindings.length === 0 ? (
                      <div className="text-[10px]" style={{ color: "#9FDDB7" }}>
                        No obvious desktop/mobile layout issues detected.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {layoutQaFindings.map((finding) => (
                          <div key={`inspector-${finding.id}`} className="text-[10px]" style={{ color: finding.severity === "warn" ? "#FFD37A" : "#A8D8FF" }}>
                            {finding.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#A8D8FF", fontWeight: 700 }}>Relationship Builder</div>
                        <div className="mt-1 text-[10px]" style={{ color: "#8EA9D7" }}>
                          Define structured article links, including parent, child, and sibling article hierarchies.
                        </div>
                      </div>
                      <button onClick={addArticleRelationship} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>
                        Add
                      </button>
                    </div>
                    <div className="space-y-2">
                      {normalizeArticleRelationships(page.relationships).length === 0 && incomingArticleRelationships.length === 0 && (
                        <div className="rounded-md border border-dashed px-3 py-4 text-center text-[10px]" style={{ borderColor: "#28466F", color: "#7A9ABB" }}>
                          No structured relationships yet. Add one to make this page smarter in graph and published views.
                        </div>
                      )}
                      {normalizeArticleRelationships(page.relationships).map((relationship) => {
                        const target = allPages.find((article) => article.id === relationship.targetArticleId);
                        return (
                          <div key={relationship.id} className="rounded-md border p-2 space-y-2" style={{ borderColor: "#17315A", background: "#071126" }}>
                            <div>
                              <label style={labelStyle}>Hierarchy Shortcut</label>
                              <div className="grid grid-cols-3 overflow-hidden rounded-md border" style={{ borderColor: "#28466F" }}>
                                {WIKI_HIERARCHY_RELATIONSHIP_TYPES.map((type) => {
                                  const selected = relationship.type === type;
                                  return (
                                    <button
                                      key={type}
                                      type="button"
                                      aria-pressed={selected}
                                      onClick={() => updateArticleRelationship(relationship.id, { type })}
                                      className="px-2 py-1.5 text-[9px] transition-colors"
                                      style={{
                                        color: selected ? "#E4F2FF" : "#8EA9D7",
                                        background: selected ? "#173866" : "#09172D",
                                        borderRight: type !== WIKI_HIERARCHY_RELATIONSHIP_TYPES[2] ? "1px solid #28466F" : "none",
                                      }}
                                    >
                                      {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label style={labelStyle}>Relationship</label>
                                <input
                                  value={relationship.type}
                                  onChange={(event) => updateArticleRelationship(relationship.id, { type: event.target.value })}
                                  className={inputClass}
                                  style={inputStyle}
                                  list="wiki-relationship-types"
                                />
                              </div>
                              <div>
                                <label style={labelStyle}>Target Article</label>
                                <select
                                  value={relationship.targetArticleId}
                                  onChange={(event) => updateArticleRelationship(relationship.id, { targetArticleId: event.target.value })}
                                  className={`${inputClass} cursor-pointer`}
                                  style={inputStyle}
                                >
                                  {allPages.filter((article) => article.id !== page.id).map((article) => (
                                    <option key={article.id} value={article.id}>{article.title || "Untitled Article"}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <input
                              value={relationship.note || ""}
                              onChange={(event) => updateArticleRelationship(relationship.id, { note: event.target.value })}
                              placeholder="Optional relationship note"
                              className={inputClass}
                              style={inputStyle}
                            />
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[10px]" style={{ color: "#8EA9D7" }}>
                                This page {relationship.type || "relates to"} {target?.title || "another article"}.
                              </span>
                              <button onClick={() => removeArticleRelationship(relationship.id)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_RED}>
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {incomingArticleRelationships.length > 0 && (
                        <div className="rounded-md border p-2 space-y-1.5" style={{ borderColor: "#25516A", background: "#081A28" }}>
                          <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: "#72CFE0", fontWeight: 700 }}>
                            Incoming Graph Relationships
                          </div>
                          {incomingArticleRelationships.map(({ source, relationship, inverseType }) => (
                            <button
                              key={`incoming-${source.id}-${relationship.id}`}
                              type="button"
                              onClick={() => navigate(`/interface/wiki-editor/${source.id}`)}
                              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-[#102A3B]"
                              title={relationship.note || `This page ${inverseType} ${source.title || "another article"}`}
                            >
                              <span className="min-w-0 truncate text-[10px]" style={{ color: "#A8D8E8" }}>
                                This page <span style={{ color: "#72CFE0", fontWeight: 700 }}>{inverseType}</span> {source.title || "Untitled Article"}.
                              </span>
                              <span className="shrink-0 text-[8px] uppercase" style={{ color: "#5C91A8" }}>Open source</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <datalist id="wiki-relationship-types">
                      {WIKI_RELATIONSHIP_TYPES.map((type) => <option key={type} value={type} />)}
                    </datalist>
                  </div>
                  <div>
                    <label style={labelStyle}>Article Quality</label>
                    <select value={page.articleQuality} onChange={(event) => update("articleQuality", event.target.value as SitePage["articleQuality"])} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                      <option value="featured">Featured</option>
                      <option value="good">Good</option>
                      <option value="start">Start</option>
                      <option value="stub">Stub</option>
                      <option value="draft">Draft</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label style={labelStyle}>Background</label>
                      <input type="color" value={page.bgColor} onChange={(event) => update("bgColor", event.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Header</label>
                      <input type="color" value={page.headerColor} onChange={(event) => update("headerColor", event.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Accent</label>
                      <input type="color" value={page.accentColor} onChange={(event) => update("accentColor", event.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Text</label>
                      <input type="color" value={page.textColor} onChange={(event) => update("textColor", event.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Page Icon</label>
                    <select value={page.pageIcon} onChange={(event) => update("pageIcon", event.target.value)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                      <option value="globe">Globe</option>
                      <option value="book">Book</option>
                      <option value="folder">Folder</option>
                      <option value="custom">Custom</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                  {page.pageIcon === "custom" && (
                    <div>
                      <label style={labelStyle}>Custom Icon URL</label>
                      <input value={page.pageIconUrl} onChange={(event) => update("pageIconUrl", event.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                  )}
                  <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "#1A345B", background: "#09142D", color: "#7A9ABB" }}>
                    Layout version {WIKI_BLOCK_LAYOUT_VERSION} is active. Saving keeps <code>blocks</code> as the source of truth and refreshes legacy <code>body</code> and <code>panels</code> snapshots for search, graph, and older article consumers.
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {showDraftRestore && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }}>
            <div className="w-[400px] p-6" style={{ background: "#0C0C2E", border: "2px solid #2A2A5B" }}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} style={S_WARN} />
                <span className="text-[14px]" style={{ ...S_TEXT, fontWeight: 600 }}>Restore Draft?</span>
              </div>
              <p className="text-[12px] mb-4" style={S_SUBTLE}>
                A previously auto-saved draft was found for this article. Would you like to restore it?
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={discardDraft} className={`${retro.button} px-4 py-1.5 text-[11px]`} style={S_RED}>Discard Draft</button>
                <button onClick={restoreDraft} className={`${retro.button} px-4 py-1.5 text-[11px]`} style={{ color: "#FFFFFF", background: "#2A5ABB", borderColor: "#4A7BFF" }}>Restore Draft</button>
              </div>
            </div>
          </div>
        )}

        <input
          ref={articleImportInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void handleImportArticleFile(event.target.files?.[0])}
        />

        {showCommandPalette && (
          <div
            className="fixed inset-0 z-[110] flex items-start justify-center px-4 pt-[12vh]"
            style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)" }}
            onClick={(event) => {
              if (event.target === event.currentTarget) setShowCommandPalette(false);
            }}
          >
            <div className="w-full max-w-[640px] overflow-hidden rounded-[10px] border" style={{ borderColor: "#294A74", background: "#081129", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
              <div className="border-b px-4 py-3" style={{ borderBottomColor: "#17355D", background: "linear-gradient(180deg, #102040 0%, #0A1630 100%)" }}>
                <div className="flex items-center gap-2">
                  <Search size={14} style={{ color: "#8AB4FF" }} />
                  <input
                    value={commandPaletteQuery}
                    onChange={(event) => setCommandPaletteQuery(event.target.value)}
                    placeholder="Search commands, blocks, templates, and recovery..."
                    className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                    style={{ color: "#D3E1FF" }}
                    autoFocus
                  />
                  <button onClick={() => setShowCommandPalette(false)} className="hover:opacity-80">
                    <X size={14} style={{ color: "#7A9ABB" }} />
                  </button>
                </div>
              </div>
              <div className="max-h-[54vh] overflow-y-auto p-2">
                {visibleCommandPaletteItems.length === 0 && (
                  <div className="px-4 py-8 text-center text-[11px]" style={{ color: "#7A9ABB" }}>
                    No matching commands.
                  </div>
                )}
                {visibleCommandPaletteItems.map((item) => (
                  <button
                    key={item.label}
                    disabled={item.disabled}
                    onClick={() => {
                      item.action();
                      setShowCommandPalette(false);
                    }}
                    className="w-full rounded-md px-3 py-3 text-left transition-colors disabled:opacity-40"
                    style={{ color: "#D3E1FF", background: "transparent" }}
                    onMouseEnter={(event) => { event.currentTarget.style.background = "#0D1B3A"; }}
                    onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                  >
                    <div className="text-[12px] font-bold">{item.label}</div>
                    <div className="mt-0.5 text-[10px]" style={{ color: "#8CA0C2" }}>{item.description}</div>
                  </button>
                ))}
              </div>
              <div className="border-t px-4 py-2 text-[10px]" style={{ borderTopColor: "#17355D", color: "#7A9ABB" }}>
                Shortcuts: Ctrl/Cmd+K opens commands, Delete removes selected blocks, Ctrl/Cmd+D duplicates, arrows nudge, Shift+arrows nudge farther.
              </div>
            </div>
          </div>
        )}

        {showRecoveryDrawer && (
          <div className="fixed inset-0 z-[105] flex justify-end" style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }} onClick={(event) => { if (event.target === event.currentTarget) setShowRecoveryDrawer(false); }}>
            <div className="h-full w-full max-w-[460px] overflow-y-auto border-l" style={{ borderLeftColor: "#294A74", background: "#081129", boxShadow: "-20px 0 50px rgba(0,0,0,0.45)" }}>
              <div className="sticky top-0 z-10 border-b px-5 py-4" style={{ borderBottomColor: "#17355D", background: "linear-gradient(180deg, #102040 0%, #0A1630 100%)" }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <History size={15} style={{ color: "#FFD37A" }} />
                    <div>
                      <div className="text-[14px] font-bold" style={{ color: "#D3E1FF" }}>Article Recovery</div>
                      <div className="text-[10px]" style={{ color: "#7A9ABB" }}>Drafts, revision snapshots, export, and import.</div>
                    </div>
                  </div>
                  <button onClick={() => setShowRecoveryDrawer(false)} className="hover:opacity-80">
                    <X size={15} style={{ color: "#7A9ABB" }} />
                  </button>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-md border p-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                  <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Quick Safety</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button onClick={() => void saveManualRevision()} className={`${retro.button} px-3 py-2 text-[10px]`} style={S_ACCENT}>
                      <History size={10} className="inline mr-1" /> Checkpoint
                    </button>
                    <button onClick={exportCurrentArticle} className={`${retro.button} px-3 py-2 text-[10px]`} style={S_SUBTLE}>
                      <Download size={10} className="inline mr-1" /> Export
                    </button>
                    <button onClick={() => articleImportInputRef.current?.click()} className={`${retro.button} px-3 py-2 text-[10px]`} style={S_SUBTLE}>
                      <Upload size={10} className="inline mr-1" /> Import
                    </button>
                    <button
                      onClick={() => hasRecoverableDraft && setShowDraftRestore(true)}
                      disabled={!hasRecoverableDraft}
                      className={`${retro.button} px-3 py-2 text-[10px] disabled:opacity-40`}
                      style={hasRecoverableDraft ? S_WARN : S_SUBTLE}
                    >
                      <FileText size={10} className="inline mr-1" /> {hasRecoverableDraft ? "Drafts" : "No Draft"}
                    </button>
                  </div>
                </div>

                <div className="rounded-md border p-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Saved Revisions</div>
                      <div className="mt-1 text-[10px]" style={{ color: "#8CA0C2" }}>{currentArticleRevisions.length} checkpoint{currentArticleRevisions.length === 1 ? "" : "s"} for this article.</div>
                    </div>
                    <span className="text-[9px] px-2 py-0.5" style={{ color: "#FFD37A", border: "1px solid #5B4318", background: "#1A1308" }}>
                      Keeps {MAX_WIKI_REVISIONS_PER_ARTICLE}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {currentArticleRevisions.length === 0 && (
                      <div className="rounded-md border px-3 py-4 text-center text-[10px]" style={{ borderColor: "#1A345B", color: "#7A9ABB" }}>
                        No revisions yet. Save the article or create a manual checkpoint.
                      </div>
                    )}
                    {currentArticleRevisions.map((revision) => (
                      <div key={revision.id} className="rounded-md border px-3 py-3" style={{ borderColor: "#17355D", background: "#071126" }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[11px] font-bold" style={{ color: "#D3E1FF" }}>{revision.label}</div>
                            <div className="mt-1 text-[9px]" style={{ color: "#7A9ABB" }}>
                              {new Date(revision.createdAt).toLocaleString()} | {revision.source}
                            </div>
                          </div>
                          <button onClick={() => void restoreRevision(revision)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_ACCENT}>
                            Restore
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <ImageStoragePickerModal
          open={!!imagePickerTarget}
          images={storedImages}
          title="Wiki Image Storage"
          fallbackMode={sharedImageStorageFallback}
          onClose={() => setImagePickerTarget(null)}
          onSelect={handleStoredImageSelect}
          onUploadFiles={handleStoredImageUpload}
        />

        <TemplatePickerModal
          open={showTemplatePicker}
          onClose={() => setShowTemplatePicker(false)}
          onSelect={applyTemplate}
          onManage={() => { setShowTemplatePicker(false); setShowTemplateManager(true); }}
        />

        <TemplateManagerModal
          open={showTemplateManager}
          onClose={() => setShowTemplateManager(false)}
        />
      </div>
  );
}
