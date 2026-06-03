import React, { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { retro } from "./retro-styles";
import { DISPLAY_CONTENTS, S_MUTED, S_DIM, S_ACCENT, S_SUBTLE, S_RED, S_WARN } from "./shared-styles";
import {
  ArrowLeft, BookOpen, Search, AlertTriangle, FileText,
  Clock, FolderOpen, ChevronRight, List, Shuffle,
  Star, Tag, ExternalLink, Info, Shield, Eye, EyeOff, Lock, Network,
} from "lucide-react";
import { safeGetItem, safeGetJson } from "./safe-storage";
import { getPageIcon } from "./page-icons";
import { RenderFormattedText } from "./render-text";
import {
  DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS,
  WIKI_BLOCK_COLUMNS,
  WIKI_BLOCK_LAYOUT_VERSION,
  compareWikiBlocksForLayout,
  migrateLegacyArticleToBlocks,
  normalizeWikiArticleBlocks,
  normalizeWikiCanvasSettings,
  type WikiArticleBlock,
  type WikiArticleChromeField,
  type WikiCanvasSettings,
} from "@/lib/wiki-article-blocks";
import {
  getWikiPanelMediaPosition,
  getWikiPanelPlacement,
  getWikiPanelWidth,
  groupBodyPanelsIntoRows,
  normalizeWikiPanels,
  type WikiPanelMediaPosition,
  type WikiPanelPlacement,
  type WikiPanelWidth,
} from "@/lib/wiki-panel-layout";

interface PageSection {
  id: string;
  heading: string;
  body: string;
}

interface SubCategory {
  id: string;
  name: string;
  type: "folder" | "article";
  articleId?: string;
  children: SubCategory[];
}

interface SitePage {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
  subcategories: SubCategory[];
  dateAdded: string;
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
  // Wiki-level fields
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
}

interface WikiPanel {
  id: string;
  title: string;
  subtitle?: string;
  content: string;
  assignedTo: string[];
  visibilityMode?: "spoiler" | "hidden";
  collapsed?: boolean;
  style?: string;
  placement?: WikiPanelPlacement;
  width?: WikiPanelWidth;
  mediaUrl?: string;
  mediaCaption?: string;
  mediaAlt?: string;
  mediaPosition?: WikiPanelMediaPosition;
}

function migrateSectionsToPanels(pg: SitePage): WikiPanel[] {
  const existingPanels = normalizeWikiPanels(pg.panels);
  const legacySections = pg.sections || [];
  if (legacySections.length === 0) return existingPanels;
  const converted: WikiPanel[] = legacySections.map((sec) => ({
    id: sec.id.startsWith("sec-") ? sec.id.replace("sec-", "panel-") : `panel-${sec.id}`,
    title: sec.heading || "",
    subtitle: "",
    content: sec.body || "",
    assignedTo: [],
    style: "blank",
    placement: "body",
    width: "full",
    mediaUrl: "",
    mediaCaption: "",
    mediaAlt: "",
    mediaPosition: "top",
  }));
  return [...converted, ...existingPanels];
}

const BUILTIN_PANEL_STYLE_MAP: Record<string, { accent: string; bg: string; border: string }> = {
  blank: { accent: "#5A6A8A", bg: "transparent", border: "#1A2A4B" },
  neutral: { accent: "#7A8AAA", bg: "#0A0A2A", border: "#2A3A5B" },
  info: { accent: "#4A9AFF", bg: "#0A1A3A", border: "#1A3A6B" },
  warning: { accent: "#FFAA4A", bg: "#1A1A0A", border: "#3A3A1A" },
  lore: { accent: "#9A7ABB", bg: "#1A0A2A", border: "#2A1A4B" },
  secret: { accent: "#FF6A6A", bg: "#1A0A0A", border: "#3A1A1A" },
};

function getPanelStyle(styleId: string | undefined): { accent: string; bg: string; border: string } {
  const id = styleId || "neutral";
  if (BUILTIN_PANEL_STYLE_MAP[id]) return BUILTIN_PANEL_STYLE_MAP[id];
  try {
    const custom: { id: string; accent: string; bg: string; border: string }[] = safeGetJson("inet-custom-panel-styles", []);
    const found = custom.find((c) => c.id === id);
    if (found) return { accent: found.accent, bg: found.bg, border: found.border };
  } catch {}
  return BUILTIN_PANEL_STYLE_MAP.neutral;
}

const DEFAULTS = {
  bgColor: "#0C0C2E",
  headerColor: "#0E0E35",
  accentColor: "#4A7BFF",
  textColor: "#B0C0E0",
  fontFamily: "'Tahoma', 'Verdana', sans-serif",
  headerAlign: "center" as const,
};

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
  shadowDepth = 1,
  glowIntensity = 0,
) {
  const depth = Math.max(0, Math.min(5, shadowDepth));
  const glow = Math.max(0, Math.min(100, glowIntensity));
  const glowCss = glow > 0 ? `0 0 ${Math.round(8 + glow * 0.34)}px ${accentColor}${Math.round(18 + glow * 0.52).toString(16).padStart(2, "0")}` : "";
  const dropCss = depth > 0 ? `0 ${Math.round(5 + depth * 4)}px ${Math.round(12 + depth * 5)}px rgba(0,0,0,${Math.min(0.58, 0.18 + depth * 0.07)})` : "";
  const joinShadows = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(", ") || "none";
  switch (surfaceStyle) {
    case "raised":
      return joinShadows("inset 0 1px 0 rgba(255,255,255,0.16)", dropCss, `0 2px 0 ${borderColor}99`, glowCss);
    case "inset":
      return joinShadows(`inset 0 ${Math.round(3 + depth)}px ${Math.round(10 + depth * 3)}px rgba(0,0,0,0.62)`, `inset 0 0 0 1px ${borderColor}88`, glowCss);
    case "glass":
      return joinShadows("inset 0 1px 0 rgba(255,255,255,0.18)", dropCss, `0 0 24px ${accentColor}24`, glowCss);
    case "none":
      return glow > 0 ? `0 0 ${Math.round(8 + glow * 0.28)}px ${accentColor}55` : "none";
    default:
      return joinShadows(dropCss, glowCss);
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

export function InetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [revealedPanels, setRevealedPanels] = useState<Set<string>>(new Set());
  const [articleRevealed, setArticleRevealed] = useState(false);

  const pages: SitePage[] = safeGetJson("inet-dm-sites", []);
  const wikiTagDefs: { id: string; name: string; description: string; fields: { id: string; name: string; type?: string; options?: string[]; placeholder?: string; required?: boolean }[] }[] = safeGetJson("inet-dm-wikiTags", []);
  const page = pages.find((p) => p.id === id);
  const currentUserId = safeGetItem("inet-user-id") || "";
  const isDM = currentUserId === "dm";

  // Article-level visibility check
  const articleVis = (!isDM && currentUserId && page?.playerVisibility)
    ? (page.playerVisibility[currentUserId] || "visible")
    : "visible";

  // Random article handler
  const handleRandom = () => {
    if (pages.length <= 1) return;
    const others = pages.filter((p) => p.id !== id);
    if (others.length === 0) return;
    const pick = others[Math.floor(Math.random() * others.length)];
    navigate(`/interface/inet-page/${pick.id}`);
  };

  // Related articles (same category + explicit relatedArticleIds, deduplicated)
  // NOTE: useMemo must be called before any early returns to satisfy React hooks rules.
  const relatedArticles = useMemo(() => {
    if (!page) return [];
    const seen = new Set<string>([page.id]);
    const result: SitePage[] = [];
    // Explicit relatedArticleIds first
    for (const rid of (page.relatedArticleIds || [])) {
      if (seen.has(rid)) continue;
      seen.add(rid);
      const found = pages.find((p) => p.id === rid);
      if (found) result.push(found);
    }
    // Then same-category articles
    for (const p of pages) {
      if (seen.has(p.id) || p.category !== page.category) continue;
      seen.add(p.id);
      result.push(p);
      if (result.length >= 8) break;
    }
    return result.slice(0, 8);
  }, [page, pages]);

  // If hidden, show "not found" for non-DM players
  if (articleVis === "hidden") {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#080830", fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif" }}>
        <div className={`${retro.toolbar} flex items-center gap-3`}>
          <button onClick={() => navigate("/interface/inet-search")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={S_ACCENT}>
            <ArrowLeft size={12} /> Back to Wiki
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className={`${retro.raised} bg-[#0E0E35] p-8 max-w-[500px] w-full text-center`}>
            <EyeOff size={32} className="mx-auto mb-4" style={S_DIM} />
            <h1 className="text-[18px] mb-2" style={{ color: "#FF6A6A", fontWeight: 600 }}>Article Not Available</h1>
            <p className="text-[13px] mb-4" style={S_MUTED}>
              This article is not available for your character. It may contain information restricted by the DM.
            </p>
            <button onClick={() => navigate("/interface/inet-search")} className={`${retro.button} px-5 py-2 text-[13px]`} style={S_ACCENT}>
              <Search size={12} className="inline mr-1" /> Return to Wiki
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#080830", fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif" }}>
        <div className={`${retro.toolbar} flex items-center gap-3`}>
          <button onClick={() => navigate("/interface/inet-search")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={S_ACCENT}>
            <ArrowLeft size={12} /> Back to Wiki
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className={`${retro.raised} bg-[#0E0E35] p-8 max-w-[500px] w-full text-center`}>
            <BookOpen size={32} className="mx-auto mb-4" style={S_DIM} />
            <h1 className="text-[18px] mb-2" style={{ color: "#FF6A6A", fontWeight: 600 }}>Article Not Found</h1>
            <p className="text-[13px] mb-4" style={S_MUTED}>
              The requested wiki article could not be located. It may have been removed or the link is broken.
            </p>
            <button onClick={() => navigate("/interface/inet-search")} className={`${retro.button} px-5 py-2 text-[13px]`} style={S_ACCENT}>
              <Search size={12} className="inline mr-1" /> Return to Wiki
            </button>
          </div>
          <span className="text-[9px] mt-6" style={{ color: "#2A3A5A" }}>I-Net Wiki | An Intelli Corporation Product | 2026</span>
        </div>
      </div>
    );
  }

  // Resolve colors with fallbacks
  const bg = page.bgColor || DEFAULTS.bgColor;
  const hdr = page.headerColor || DEFAULTS.headerColor;
  const accent = page.accentColor || DEFAULTS.accentColor;
  const txt = page.textColor || DEFAULTS.textColor;
  const font = page.fontFamily || DEFAULTS.fontFamily;
  const panels = migrateSectionsToPanels(page);
  const showDividers = page.showDividers ?? true;
  const borderColor = lighten(bg, 25);
  const mutedText = lighten(bg, 60);
  const canvasSettings = normalizeWikiCanvasSettings(page.canvasSettings);
  const hasAuthoredArticleChromeLayout = !!page.canvasSettings?.articleChromeLayouts;
  const articleChromeFields: WikiArticleChromeField[] = ["title", "subtitle", "description"];
  const articleChromeLayouts = canvasSettings.articleChromeLayouts || DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS;
  const articleChromeRowHeight = 28;
  const articleChromeCanvasHeight = Math.max(
    220,
    ...articleChromeFields.map((field) => {
      const layout = articleChromeLayouts[field] || DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS[field];
      return (layout.rowStart + layout.rowSpan + 1) * articleChromeRowHeight;
    }),
  );

  const bodyParagraphs = (page.body || "").trim();
  const hasBody = bodyParagraphs.length > 0;
  const hasPanelContent = panels.length > 0 && panels.some((p) => p.title || p.content || p.mediaUrl);
  const hasContent = hasBody || hasPanelContent;
  const visiblePanels = panels.filter((panel) => {
    const hasRestriction = panel.assignedTo && panel.assignedTo.length > 0;
    const vMode = panel.visibilityMode || "spoiler";
    if (hasRestriction && vMode === "hidden" && !isDM && !panel.assignedTo.includes(currentUserId)) {
      return false;
    }
    return true;
  });
  const bodyPanels = visiblePanels.filter((panel) => getWikiPanelPlacement(panel) === "body");
  const sidebarPanels = visiblePanels.filter((panel) => getWikiPanelPlacement(panel) === "sidebar");
  const bodyPanelRows = groupBodyPanelsIntoRows(bodyPanels);
  const blocks = normalizeWikiArticleBlocks(page.blocks && page.blocks.length > 0
    ? (page.layoutVersion === WIKI_BLOCK_LAYOUT_VERSION ? page.blocks : migrateLegacyArticleToBlocks(page))
    : migrateLegacyArticleToBlocks(page));
  const hasBlockLayout = blocks.length > 0 && (page.layoutVersion === WIKI_BLOCK_LAYOUT_VERSION || (page.blocks && page.blocks.length > 0));
  const visibleBlocks = blocks
    .filter((block) => {
      const hasRestriction = block.visibility.assignedTo.length > 0;
      if (hasRestriction && block.visibility.mode === "hidden" && !isDM && !block.visibility.assignedTo.includes(currentUserId)) {
        return false;
      }
      return true;
    })
    .sort(compareWikiBlocksForLayout);
  const mobileBlocks = [...visibleBlocks].sort((a, b) => {
    const aOrder = a.fluid?.preferredMobileOrder ?? a.mobilePriority ?? a.layout.rowStart * 100 + a.layout.colStart;
    const bOrder = b.fluid?.preferredMobileOrder ?? b.mobilePriority ?? b.layout.rowStart * 100 + b.layout.colStart;
    return aOrder - bOrder || compareWikiBlocksForLayout(a, b);
  });
  const pageTitleLookup = new Map(pages.map((entry) => [entry.id, entry.title]));

  const iconMode = page.pageIcon || "globe";
  const PageIcon = getPageIcon(iconMode === "none" || iconMode === "custom" ? undefined : iconMode);

  // Build table of contents (skip hidden panels for non-DM/non-allowed users)
  const tocItems: { id: string; label: string }[] = [];
  if (hasBlockLayout) {
    visibleBlocks.forEach((block) => {
      if (!block.behavior?.includeInToc) return;
      const label = block.behavior.anchorLabel || block.title || (block.type === "heading" ? "Heading" : "");
      if (!label) return;
      tocItems.push({ id: `block-${block.id}`, label });
    });
  } else {
    if (hasBody) {
      tocItems.push({ id: "article-body", label: page.bodyTitle || "Overview" });
    }
    panels.forEach((p) => {
      if (!p.title) return;
      const hasRestriction = p.assignedTo && p.assignedTo.length > 0;
      const vMode = p.visibilityMode || "spoiler";
      if (hasRestriction && vMode === "hidden" && !isDM && !p.assignedTo.includes(currentUserId)) return;
      tocItems.push({ id: `panel-${p.id}`, label: p.title });
    });
  }

  const renderArticlePanel = (panel: WikiPanel, zone: WikiPanelPlacement) => {
    if (!panel.title && !panel.content && !panel.mediaUrl) return null;
    const ps = getPanelStyle(panel.style);
    const hasRestriction = panel.assignedTo && panel.assignedTo.length > 0;
    const vMode = panel.visibilityMode || "spoiler";
    const isAllowed = !hasRestriction || isDM || panel.assignedTo.includes(currentUserId);
    if (hasRestriction && vMode === "hidden" && !isAllowed) return null;
    const isRevealed = revealedPanels.has(panel.id);
    const showPanelContent = isAllowed || isRevealed;
    const panelWidth = getWikiPanelWidth(panel);
    const mediaPosition = getWikiPanelMediaPosition(panel);
    const mediaFigure = panel.mediaUrl ? (
      <figure className="m-0 shrink-0" style={{ width: zone === "sidebar" || panelWidth === "half" || mediaPosition === "top" ? "100%" : 260 }}>
        <img
          src={panel.mediaUrl}
          alt={panel.mediaAlt || panel.title || "Panel media"}
          className="w-full object-cover"
          style={{ maxHeight: zone === "sidebar" ? 220 : 280, borderRadius: 6, border: `1px solid ${ps.border}`, background: "#050518" }}
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

    const contentBlock = panel.content ? (
      <RenderFormattedText text={panel.content} color={txt} font={font} currentPlayerId={isDM ? undefined : currentUserId} isDM={isDM} sectionRevealed={showPanelContent} />
    ) : (
      <span className="text-[12px] italic" style={{ color: mutedText }}>
        This section has no content yet.
      </span>
    );

    const contentWithMedia = showPanelContent ? (
      <div className="space-y-3">
        {!isAllowed && isRevealed && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-[10px]" style={{ background: "#1A0A0A", border: "1px solid #3A1A1A", color: "#FF8A6A" }}>
            <AlertTriangle size={10} />
            <span>You chose to reveal this section. This content may not be intended for your character.</span>
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
          <div style={{ color: txt, fontFamily: font, fontSize: 13 }}>This content is hidden behind a spoiler or metagame warning...</div>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: ps.bg === "transparent" ? "linear-gradient(180deg, #0C0C2EEE 0%, #0C0C2EFF 100%)" : `linear-gradient(180deg, ${darken(ps.bg, 5)}EE 0%, ${ps.bg}FF 100%)`, backdropFilter: "blur(4px)" }}>
          <div className="flex items-center gap-2">
            <Shield size={20} style={S_RED} />
            <div>
              <div className="text-[13px]" style={{ color: "#FF6A6A", fontWeight: 700, fontFamily: font }}>Spoiler / Metagame Warning</div>
              <div className="text-[11px] mt-0.5" style={{ color: "#8A5A5A", fontFamily: font }}>This section contains information not intended for your character.</div>
            </div>
          </div>
          <button onClick={() => setRevealedPanels((prev) => new Set([...prev, panel.id]))} className="px-5 py-2 text-[12px] flex items-center gap-2 hover:opacity-90" style={{ color: "#FF8A6A", background: "#1A0A0A", border: "1px solid #5A2A2A", fontWeight: 600, fontFamily: font }}>
            <Eye size={12} /> Show Anyway
          </button>
        </div>
      </div>
    );

    return (
      <div style={{ border: `1px solid ${ps.border}`, background: ps.bg === "transparent" ? "rgba(8, 10, 34, 0.55)" : ps.bg }}>
        <div className="px-4 py-2.5 flex flex-col gap-0.5 border-b" style={{ borderBottomColor: ps.border, background: ps.bg === "transparent" ? "transparent" : darken(ps.bg, 5) }}>
          <div className="flex items-center gap-2">
            <span className="text-[14px] flex-1" style={{ color: ps.accent, fontWeight: 600, fontFamily: font }}>{panel.title || "Untitled Section"}</span>
            {hasRestriction && isAllowed && isDM && (
              <span className="text-[9px] px-2 py-0.5 flex items-center gap-1" style={{ color: vMode === "hidden" ? "#FF6A6A" : "#FF6ABB", background: "#1A0A1A", border: "1px solid #3A1A3B" }}>
                {vMode === "hidden" ? <EyeOff size={8} /> : <Lock size={8} />} Restricted
              </span>
            )}
          </div>
          {panel.subtitle && (
            <span className="text-[11px]" style={{ color: ps.accent, opacity: 0.65, fontFamily: font }}>{panel.subtitle}</span>
          )}
        </div>
        <div className="px-4 py-3">
          {contentWithMedia}
        </div>
      </div>
    );
  };

  const renderArticleBlock = (block: WikiArticleBlock, mode: "desktop" | "mobile") => {
    const hasRestriction = block.visibility.assignedTo.length > 0;
    const isAllowed = !hasRestriction || isDM || block.visibility.assignedTo.includes(currentUserId);
    if (hasRestriction && block.visibility.mode === "hidden" && !isAllowed) return null;

    const isRevealed = revealedPanels.has(block.id);
    const requiresGlobalReveal = block.visibility.mode === "spoiler" && !hasRestriction && !isDM;
    const showBlockContent = requiresGlobalReveal
      ? isRevealed
      : isDM || isAllowed || block.visibility.mode === "visible" || isRevealed;
    const ps = getPanelStyle(block.style);
    const accentColor = block.appearance.accentColor || ps.accent || accent;
    const borderTone = block.appearance.borderColor || ps.border || borderColor;
    const backgroundTone = block.appearance.backgroundColor || (ps.bg === "transparent" ? "rgba(8, 10, 34, 0.68)" : ps.bg || bg);
    const titleColor = block.appearance.titleColor || accentColor;
    const bodyColor = block.appearance.bodyColor || txt;
    const titleAlign = (block.appearance.titleAlign || "left") as React.CSSProperties["textAlign"];
    const bodyAlign = (block.appearance.bodyAlign || "left") as React.CSSProperties["textAlign"];
    const overflowMode = block.behavior?.overflowMode || "clip";
    const tablePad = block.tableDensity === "dense" ? 4 : block.tableDensity === "compact" ? 6 : 8;
    const linkDisplayMode = block.wikiLinksDisplayMode || "list";
    const blockShellStyle: React.CSSProperties = {
      border: blockBorderCss(block.appearance.borderStyle, borderTone, block.appearance.borderWidth ?? 1),
      background: blockSurfaceBackground(block.appearance.surfaceStyle, backgroundTone, accentColor, block.appearance.backgroundTreatment),
      boxShadow: blockSurfaceShadow(block.appearance.surfaceStyle, borderTone, accentColor, block.appearance.shadowDepth ?? 1, block.appearance.glowIntensity ?? 0),
      backdropFilter: block.appearance.surfaceStyle === "glass" ? "blur(8px)" : undefined,
      borderRadius: block.appearance.surfaceStyle === "none" ? 0 : block.appearance.borderRadius ?? 8,
      opacity: (block.appearance.opacity ?? 100) / 100,
      color: bodyColor,
      textAlign: bodyAlign,
      overflow: overflowMode === "scroll" ? "auto" : "hidden",
      padding: block.type === "divider" || block.type === "spacer"
        ? 0
        : block.appearance.padding === "tight"
          ? 10
          : block.appearance.padding === "loose"
            ? 20
            : 14,
    };
    const collapseKey = `collapse-${block.id}`;
    const isCollapsed = !!block.behavior?.collapsible && !!block.behavior?.defaultCollapsed && !revealedPanels.has(collapseKey);

    if (showBlockContent && isCollapsed) {
      return (
        <button
          onClick={() => setRevealedPanels((prev) => new Set([...prev, collapseKey]))}
          className="block w-full text-left hover:opacity-90"
          style={{ ...blockShellStyle, minHeight: 96 }}
        >
          <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: accentColor, fontWeight: 700, fontFamily: font }}>
            Collapsed Section
          </div>
          <div className="mt-1 text-[15px] font-bold" style={{ color: titleColor, textAlign: titleAlign, fontFamily: font }}>
            {block.title || block.subtitle || "Expandable wiki block"}
          </div>
          <div className="mt-2 text-[11px]" style={{ color: mutedText, fontFamily: font }}>
            Click to expand.
          </div>
        </button>
      );
    }

    const spoilerOverlay = !showBlockContent ? (
      <div className="relative overflow-hidden rounded-md" style={{ minHeight: 120 }}>
        <div style={{ filter: "blur(8px)", opacity: 0.15, padding: "16px 20px", pointerEvents: "none", userSelect: "none" }}>
          <div style={{ color: txt, fontFamily: font, fontSize: 13 }}>This block is hidden behind a spoiler or metagame warning...</div>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "linear-gradient(180deg, rgba(12,12,46,0.94) 0%, rgba(12,12,46,1) 100%)", backdropFilter: "blur(4px)" }}>
          <div className="flex items-center gap-2">
            <Shield size={18} style={S_RED} />
            <div>
              <div className="text-[13px]" style={{ color: "#FF6A6A", fontWeight: 700, fontFamily: font }}>Spoiler / Metagame Warning</div>
              <div className="text-[11px] mt-0.5" style={{ color: "#8A5A5A", fontFamily: font }}>This block contains information not intended for your character.</div>
            </div>
          </div>
          <button onClick={() => setRevealedPanels((prev) => new Set([...prev, block.id]))} className="px-5 py-2 text-[12px] flex items-center gap-2 hover:opacity-90" style={{ color: "#FF8A6A", background: "#1A0A0A", border: "1px solid #5A2A2A", fontWeight: 600, fontFamily: font }}>
            <Eye size={12} /> Show Anyway
          </button>
        </div>
      </div>
    ) : null;

    switch (block.type) {
      case "heading": {
        const HeadingTag = (`h${block.headingLevel || 2}` as keyof JSX.IntrinsicElements);
        return (
          <div style={{ padding: block.appearance.padding === "tight" ? "2px 0" : "10px 0" }}>
            {React.createElement(HeadingTag, {
              className: "mb-1",
              style: { color: titleColor, fontWeight: 700, fontFamily: font, fontSize: block.headingLevel === 1 ? 28 : block.headingLevel === 3 ? 18 : 22, textAlign: titleAlign },
            }, block.title || "Heading")}
            {block.subtitle && (
              <p className="text-[12px] italic" style={{ color: mutedText, fontFamily: font, textAlign: titleAlign }}>{block.subtitle}</p>
            )}
          </div>
        );
      }
      case "image":
        return (
          <figure style={{ ...blockShellStyle, position: "relative", overflow: block.imageCaptionPlacement === "overlay" || overflowMode === "clip" ? "hidden" : blockShellStyle.overflow }}>
            {block.imageUrl ? (
              <img
                src={block.imageUrl}
                alt={block.imageAlt || block.title || "Article media"}
                className="w-full"
                onClick={() => {
                  if (block.behavior?.clickAction === "expandImage" && block.imageUrl) window.open(block.imageUrl, "_blank");
                }}
                style={{
                  border: block.imageFrameStyle === "none" ? undefined : `${block.imageFrameStyle === "thick" ? 3 : 1}px solid ${borderTone}`,
                  borderRadius: block.imageFrameStyle === "polaroid" ? 3 : 6,
                  padding: block.imageFrameStyle === "polaroid" ? 8 : block.imageFrameStyle === "terminal" ? 4 : 0,
                  cursor: block.behavior?.clickAction === "expandImage" ? "zoom-in" : undefined,
                  maxHeight: mode === "mobile" ? (block.fluid?.mobileBehavior === "compact" ? 220 : 280) : 420,
                  aspectRatio: block.fluid?.keepAspectRatio ? "16 / 9" : undefined,
                  objectFit: block.cropMode === "cover" ? "cover" : "contain",
                  objectPosition: `${block.imageFocalX ?? 50}% ${block.imageFocalY ?? 50}%`,
                  background: "#050518",
                }}
              />
            ) : (
              <div className="rounded-md border border-dashed flex items-center justify-center text-[11px]" style={{ minHeight: 160, borderColor: borderTone, color: mutedText }}>
                No image provided yet.
              </div>
            )}
            {(block.imageCaption || block.title) && block.imageCaptionPlacement !== "hidden" && (
              <figcaption
                className={block.imageCaptionPlacement === "overlay" ? "absolute inset-x-0 bottom-0 px-3 py-2 text-[11px]" : "mt-2 text-[11px]"}
                style={{
                  color: block.imageCaptionPlacement === "overlay" ? "#E8F0FF" : mutedText,
                  background: block.imageCaptionPlacement === "overlay"
                    ? "linear-gradient(180deg, transparent, rgba(0,0,0,0.78))"
                    : block.imageCaptionStyle === "panel"
                      ? "rgba(255,255,255,0.05)"
                      : undefined,
                  border: block.imageCaptionStyle === "panel" ? `1px solid ${borderTone}55` : undefined,
                  padding: block.imageCaptionStyle === "panel" ? "6px 8px" : undefined,
                  fontStyle: block.imageCaptionStyle === "terminal" ? undefined : "italic",
                  fontFamily: font,
                }}
              >
                {block.imageCaption || block.title}
              </figcaption>
            )}
          </figure>
        );
      case "referenceTable":
        return (
          <div style={blockShellStyle}>
            {block.title && <h3 className="mb-3 text-[16px]" style={{ color: titleColor, fontWeight: 700, fontFamily: font, textAlign: titleAlign }}>{block.title}</h3>}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {(block.columns || []).map((column, columnIndex) => (
                      <th key={`${block.id}-head-${columnIndex}`} className="text-left border-b" style={{ padding: tablePad, position: block.tableStickyHeader ? "sticky" : undefined, top: block.tableStickyHeader ? 0 : undefined, background: block.tableStickyHeader ? backgroundTone : undefined, color: titleColor, borderBottomColor: borderTone }}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(block.rows || []).map((row, rowIndex) => (
                    <tr key={row.id} style={{ background: block.tableStripedRows && rowIndex % 2 === 1 ? "rgba(255,255,255,0.035)" : undefined }}>
                      {row.cells.map((cell, cellIndex) => (
                        <td key={`${row.id}-${cellIndex}`} className="align-top border-b" style={{ padding: tablePad, color: bodyColor, borderBottomColor: `${borderTone}66` }}>
                          {block.tableLinkedCells
                            ? <RenderFormattedText text={cell || ""} color={bodyColor} font={font} currentPlayerId={isDM ? undefined : currentUserId} isDM={isDM} />
                            : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case "keyValueBox":
        return (
          <div style={blockShellStyle}>
            {block.title && <h3 className="mb-3 text-[16px]" style={{ color: titleColor, fontWeight: 700, fontFamily: font, textAlign: titleAlign }}>{block.title}</h3>}
            <div style={{ display: "flex", flexDirection: "column", gap: block.keyValueDensity === "dense" ? 4 : block.keyValueDensity === "compact" ? 6 : 8 }}>
              {(block.items || []).map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(110px,0.9fr)_1fr] gap-2" style={{ borderBottom: block.keyValueRowDividers ? `1px solid ${borderTone}55` : undefined, paddingBottom: block.keyValueRowDividers ? 6 : undefined }}>
                  <span style={{ color: titleColor, fontWeight: 700, textAlign: block.keyValueLabelAlign }}>{item.label}</span>
                  <span style={{ color: bodyColor }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case "wikiLinksList":
        return (
          <div style={blockShellStyle}>
            {block.title && <h3 className="mb-3 text-[16px]" style={{ color: titleColor, fontWeight: 700, fontFamily: font, textAlign: titleAlign }}>{block.title}</h3>}
            <div style={{ display: "flex", flexDirection: linkDisplayMode === "chips" ? "row" : "column", flexWrap: linkDisplayMode === "chips" ? "wrap" : undefined, gap: linkDisplayMode === "cards" ? 8 : 4 }}>
              {(block.articleIds || []).map((articleId) => (
                <button
                  key={articleId}
                  onClick={() => navigate(`/interface/inet-page/${articleId}`)}
                  className="block text-left px-2 py-1 rounded-md hover:opacity-85"
                  style={{ width: linkDisplayMode === "chips" ? "auto" : "100%", color: accent, background: linkDisplayMode === "cards" ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.03)", border: `1px solid ${borderTone}77` }}
                >
                  {pageTitleLookup.get(articleId) || articleId}
                </button>
              ))}
            </div>
          </div>
        );
      case "divider":
        return (
          <div className="py-2">
            {block.dividerLabel && block.appearance.dividerLabelPosition === "above" && <div className="text-[10px] mb-2 text-center uppercase tracking-[0.18em]" style={{ color: mutedText }}>{block.dividerLabel}</div>}
            {dividerLineElement(block.appearance.dividerStyle, borderTone, accentColor)}
            {block.dividerLabel && block.appearance.dividerLabelPosition !== "above" && <div className={`text-[10px] ${block.appearance.dividerLabelPosition === "below" ? "mt-2" : "mt-[-8px]"} text-center uppercase tracking-[0.18em]`} style={{ color: mutedText }}>{block.dividerLabel}</div>}
          </div>
        );
      case "spacer":
        return <div style={{ height: Math.max(1, block.spacerHeight || 1) * 12 }} />;
      case "calloutPanel":
      case "spoilerBlock": {
        return (
          <div style={blockShellStyle}>
            {(block.title || block.subtitle) && (
              <div className="mb-3">
                {block.title && <h3 className="text-[16px]" style={{ color: titleColor, fontWeight: 700, fontFamily: font, textAlign: titleAlign }}>{block.title}</h3>}
                {block.subtitle && <p className="text-[11px] italic mt-0.5" style={{ color: mutedText, fontFamily: font, textAlign: titleAlign }}>{block.subtitle}</p>}
              </div>
            )}
            {!showBlockContent ? spoilerOverlay : (
              <div className="space-y-3">
                {!isAllowed && isRevealed && (
                  <div className="flex items-center gap-2 px-3 py-1.5 text-[10px]" style={{ background: "#1A0A0A", border: "1px solid #3A1A1A", color: "#FF8A6A" }}>
                    <AlertTriangle size={10} />
                    <span>You chose to reveal this block. This content may not be intended for your character.</span>
                  </div>
                )}
                <RenderFormattedText text={block.html || ""} color={bodyColor} font={font} currentPlayerId={isDM ? undefined : currentUserId} isDM={isDM} sectionRevealed={showBlockContent} />
              </div>
            )}
          </div>
        );
      }
      case "richText":
      default:
        return (
          <div style={blockShellStyle}>
            {(block.title || block.subtitle) && (
              <div className="mb-3">
                {block.title && <h3 className="text-[18px]" style={{ color: titleColor, fontWeight: 700, fontFamily: font, textAlign: titleAlign }}>{block.title}</h3>}
                {block.subtitle && <p className="text-[11px] italic mt-0.5" style={{ color: mutedText, fontFamily: font, textAlign: titleAlign }}>{block.subtitle}</p>}
              </div>
            )}
            <RenderFormattedText text={block.html || ""} color={bodyColor} font={font} currentPlayerId={isDM ? undefined : currentUserId} isDM={isDM} />
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: darken(bg, 15), fontFamily: font }}>
      {/* Wiki Toolbar */}
      <div className={`${retro.toolbar} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={S_ACCENT}>
            <ArrowLeft size={12} /> Back
          </button>
          <span className="text-[11px]" style={S_DIM}>|</span>
          <button onClick={() => navigate("/interface/inet-search")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={S_ACCENT}>
            <BookOpen size={11} /> Wiki Home
          </button>
          <span className="text-[11px]" style={S_DIM}>|</span>
          <button onClick={() => navigate("/interface/inet-search?q=")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={S_ACCENT}>
            <List size={10} /> All Articles
          </button>
          <span className="text-[11px]" style={S_DIM}>|</span>
          <button onClick={handleRandom} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={S_WARN}>
            <Shuffle size={10} /> Random
          </button>
        </div>
        <button onClick={() => navigate("/interface")} className="text-[11px] hover:opacity-80" style={S_ACCENT}>Interface</button>
      </div>

      {/* Breadcrumb bar */}
      <div
        className="px-4 py-1.5 flex items-center gap-1.5 border-b text-[11px]"
        style={{ background: "#0A0A30", borderBottomColor: "#1A1A4B" }}
      >
        <button onClick={() => navigate("/interface/inet-search")} className="hover:underline" style={S_ACCENT}>
          Wiki
        </button>
        <ChevronRight size={9} style={S_DIM} />
        <button
          onClick={() => navigate(`/interface/inet-search?q=${encodeURIComponent(page.category)}`)}
          className="hover:underline"
          style={S_ACCENT}
        >
          {page.category}
        </button>
        <ChevronRight size={9} style={S_DIM} />
        <span style={S_SUBTLE}>{page.title}</span>
      </div>

      {/* Spoiler gate for entire article */}
      {articleVis === "spoiler" && !articleRevealed && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-20" style={{ background: bg }}>
          <Shield size={40} style={{ color: "#FF6A6A", marginBottom: 16 }} />
          <div className="text-[16px] mb-2" style={{ color: "#FF6A6A", fontWeight: 700, fontFamily: font }}>Spoiler / Metagame Warning</div>
          <div className="text-[12px] text-center max-w-[400px] mb-4" style={{ color: "#8A5A5A", fontFamily: font }}>
            This article contains information that may not be intended for your character.
          </div>
          <button
            onClick={() => setArticleRevealed(true)}
            className="px-6 py-2 text-[12px] flex items-center gap-2 hover:opacity-90"
            style={{ color: "#FF8A6A", background: "#1A0A0A", border: "1px solid #5A2A2A", fontWeight: 600 }}
          >
            <Eye size={12} /> Proceed Anyway
          </button>
        </div>
      )}

      {(articleVis !== "spoiler" || articleRevealed) && (<div style={DISPLAY_CONTENTS}>

      {/* Disambiguation Note */}
      {page.disambiguationNote && (
        <div className="px-4 py-2 flex items-start gap-2" style={{ background: darken(hdr, 5), borderBottom: `1px solid ${borderColor}` }}>
          <Info size={14} className="shrink-0 mt-0.5" style={{ color: accent }} />
          <span className="text-[12px] italic" style={{ color: mutedText, fontFamily: font }}>
            {page.disambiguationNote}
          </span>
        </div>
      )}

      {/* Article Quality Banner */}
      {(page.articleQuality === "featured" || page.articleQuality === "good") && (
        <div className="px-4 py-1.5 flex items-center justify-center gap-2" style={{
          background: page.articleQuality === "featured" ? "#1A1A0A" : "#0A1A0A",
          borderBottom: `1px solid ${page.articleQuality === "featured" ? "#3A3A1A" : "#1A3A1A"}`,
        }}>
          <Star size={12} style={{ color: page.articleQuality === "featured" ? "#FFD700" : "#4A9A5A" }} />
          <span className="text-[11px] tracking-wide" style={{
            color: page.articleQuality === "featured" ? "#FFD700" : "#4A9A5A",
            fontWeight: 600, fontFamily: font,
          }}>
            {page.articleQuality === "featured" ? "FEATURED ARTICLE" : "GOOD ARTICLE"}
          </span>
          <Star size={12} style={{ color: page.articleQuality === "featured" ? "#FFD700" : "#4A9A5A" }} />
        </div>
      )}

      {/* Under Construction Banner */}
      {page.underConstruction && (
        <div className="px-4 py-2 flex items-center justify-center gap-2" style={{ background: "#2A1A00", borderBottom: "2px solid #5A3A00" }}>
          <AlertTriangle size={14} style={S_WARN} />
          <span className="text-[12px] tracking-wider" style={{ color: "#FFCC44", fontWeight: 600, fontFamily: font }}>
            THIS ARTICLE IS A STUB - HELP EXPAND IT!
          </span>
          <AlertTriangle size={14} style={S_WARN} />
        </div>
      )}

      {/* Marquee */}
      {page.marqueeText && (
        <div className="overflow-hidden py-1" style={{ background: darken(hdr, 10), borderBottom: `1px solid ${borderColor}` }}>
          <div className="animate-marquee whitespace-nowrap text-[12px] tracking-wide" style={{ color: accent, fontWeight: 600, fontFamily: font }}>
            <span className="inline-block px-8">{page.marqueeText}</span>
            <span className="inline-block px-8">{page.marqueeText}</span>
            <span className="inline-block px-8">{page.marqueeText}</span>
          </div>
          <style>{`
            @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-33.33%); } }
            .animate-marquee { animation: marquee 12s linear infinite; }
          `}</style>
        </div>
      )}

      {/* Article Content */}
      <div className="flex-1 px-4 py-6" style={{ background: bg }}>
        <div className="max-w-[900px] mx-auto">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Sidebar: Table of Contents + Info */}
            <div className="w-full md:w-[220px] shrink-0 order-2 md:order-1">
              {/* Article Info Box */}
              <div
                className={`${retro.raised} mb-4`}
                style={{ background: hdr }}
              >
                <div
                  className="px-3 py-2 border-b text-center"
                  style={{ borderBottomColor: borderColor, background: darken(hdr, 8) }}
                >
                  <div className="flex items-center justify-center gap-2 mb-1">
                    {iconMode === "custom" && page.pageIconUrl ? (
                      <img src={page.pageIconUrl} alt="" className="object-contain" style={{ width: 18, height: 18 }} />
                    ) : iconMode !== "none" ? (
                      <PageIcon size={18} style={{ color: accent }} />
                    ) : null}
                    <span className="text-[12px]" style={{ color: accent, fontWeight: 600 }}>
                      Article Info
                    </span>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider" style={{ color: mutedText }}>Category</span>
                    <div className="text-[11px] mt-0.5" style={{ color: txt }}>
                      <button
                        onClick={() => navigate(`/interface/inet-search?q=${encodeURIComponent(page.category)}`)}
                        className="underline hover:no-underline"
                        style={{ color: accent }}
                      >
                        {page.category}
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider" style={{ color: mutedText }}>Last Updated</span>
                    <div className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: txt }}>
                      <Clock size={9} style={{ color: mutedText }} />
                      {page.dateAdded}
                    </div>
                  </div>
                  {page.url && (
                    <div>
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: mutedText }}>Source</span>
                      <div className="text-[10px] mt-0.5 break-all" style={{ color: mutedText }}>
                        {page.url}
                      </div>
                    </div>
                  )}
                  {page.showHitCounter && (
                    <div>
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: mutedText }}>Page Views</span>
                      <div className="text-[11px] mt-0.5" style={{ color: txt, fontFamily: "'Courier New', monospace" }}>
                        {(page.hitCount || 0).toLocaleString()}
                      </div>
                    </div>
                  )}
                  {page.articleQuality && (
                    <div>
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: mutedText }}>Quality</span>
                      <div className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: txt }}>
                        {page.articleQuality === "featured" && <Star size={9} style={{ color: "#FFD700" }} />}
                        <span style={{ color: page.articleQuality === "featured" ? "#FFD700" : page.articleQuality === "good" ? "#4A9A5A" : txt }}>
                          {page.articleQuality.charAt(0).toUpperCase() + page.articleQuality.slice(1)}
                        </span>
                      </div>
                    </div>
                  )}
                  {(page.tags || []).length > 0 && (
                    <div>
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: mutedText }}>Tags</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(page.tags || []).map((tag) => (
                          <button
                            key={tag}
                            onClick={() => navigate(`/interface/inet-search?q=${encodeURIComponent(tag)}`)}
                            className="text-[9px] px-1.5 py-0 hover:opacity-70"
                            style={{ color: accent, background: darken(hdr, 5), border: `1px solid ${borderColor}` }}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Subcategories tree */}
              {(page.subcategories || []).length > 0 && (() => {
                const renderScNode = (node: SubCategory, depth: number): React.ReactNode => {
                  const isFolder = node.type === "folder";
                  const linkedArticle = node.articleId ? pages.find(p => p.id === node.articleId) : null;
                  return (
                    <div key={node.id}>
                      <div
                        className="flex items-center gap-1.5 px-2 py-1 text-[11px]"
                        style={{ paddingLeft: 8 + depth * 12, color: isFolder ? mutedText : accent }}
                      >
                        <span style={{ color: isFolder ? accent : lighten(accent, 30), fontSize: 10 }}>{isFolder ? "Folder" : "Article"}</span>
                        {isFolder ? (
                          <span style={{ fontWeight: 500 }}>{node.name || "Unnamed"}</span>
                        ) : linkedArticle ? (
                          <button
                            onClick={() => navigate(`/interface/inet-page/${linkedArticle.id}`)}
                            className="underline hover:no-underline text-left"
                            style={{ color: accent }}
                          >
                            {node.name || linkedArticle.title}
                          </button>
                        ) : (
                          <span style={{ color: mutedText }}>{node.name || "Unlinked"}</span>
                        )}
                      </div>
                      {isFolder && node.children && node.children.map(child => renderScNode(child, depth + 1))}
                    </div>
                  );
                };
                return (
                  <div className={`${retro.raised} mb-4`} style={{ background: hdr }}>
                    <div className="px-3 py-2 border-b" style={{ borderBottomColor: borderColor, background: darken(hdr, 8) }}>
                      <span className="text-[12px] flex items-center gap-1.5" style={{ color: accent, fontWeight: 600 }}>
                        <FolderOpen size={11} /> Subcategories
                      </span>
                    </div>
                    <div className="py-2">
                      {(page.subcategories || []).map(sc => renderScNode(sc, 0))}
                    </div>
                  </div>
                );
              })()}

              {/* Infobox */}
              {(page.infobox || []).length > 0 && (
                <div
                  className={`${retro.raised} mb-4`}
                  style={{ background: hdr }}
                >
                  <div
                    className="px-3 py-2 border-b text-center"
                    style={{ borderBottomColor: borderColor, background: darken(hdr, 8) }}
                  >
                    <span className="text-[12px]" style={{ color: accent, fontWeight: 600 }}>
                      {page.title}
                    </span>
                  </div>
                  <div className="p-2">
                    {(page.infobox || []).map((row, idx) => (
                      <div
                        key={idx}
                        className="flex py-1.5 px-1"
                        style={{ borderBottom: idx < (page.infobox || []).length - 1 ? `1px solid ${darken(borderColor, 10)}` : "none" }}
                      >
                        <span className="text-[10px] shrink-0" style={{ color: accent, fontWeight: 600, width: 80 }}>
                          {row.label}
                        </span>
                        <span className="text-[10px] flex-1" style={{ color: txt }}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Table of Contents */}
              {tocItems.length > 1 && (
                <div
                  className={`${retro.raised} mb-4`}
                  style={{ background: hdr }}
                >
                  <div
                    className="px-3 py-2 border-b"
                    style={{ borderBottomColor: borderColor, background: darken(hdr, 8) }}
                  >
                    <span className="text-[12px]" style={{ color: accent, fontWeight: 600 }}>
                      Contents
                    </span>
                  </div>
                  <div className="p-2">
                    {tocItems.map((item, idx) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          const el = document.getElementById(item.id);
                          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="w-full text-left flex items-start gap-1.5 px-2 py-1 text-[11px] hover:bg-[#1A1A4B] transition-colors"
                        style={{ color: "#5A9AFF", borderRadius: 3 }}
                      >
                        <span className="shrink-0" style={{ color: mutedText, fontFamily: "'Courier New', monospace", fontSize: 9 }}>
                          {idx + 1}.
                        </span>
                        <span className="underline hover:no-underline">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Articles */}
              {relatedArticles.length > 0 && (
                <div
                  className={`${retro.raised} mb-4`}
                  style={{ background: hdr }}
                >
                  <div
                    className="px-3 py-2 border-b"
                    style={{ borderBottomColor: borderColor, background: darken(hdr, 8) }}
                  >
                    <span className="text-[12px]" style={{ color: accent, fontWeight: 600 }}>
                      Related Articles
                    </span>
                  </div>
                  <div className="p-2">
                    {relatedArticles.map((art) => {
                      const isExplicit = (page.relatedArticleIds || []).includes(art.id);
                      return (
                        <button
                          key={art.id}
                          onClick={() => navigate(`/interface/inet-page/${art.id}`)}
                          className="w-full text-left flex items-center gap-1.5 px-2 py-1 text-[11px] hover:bg-[#1A1A4B] transition-colors"
                          style={{ color: isExplicit ? "#FFAA4A" : "#5A9AFF", borderRadius: 3 }}
                          title={isExplicit ? "Linked article" : "Same category"}
                        >
                          {isExplicit ? (
                            <Network size={9} className="shrink-0" style={S_WARN} />
                          ) : (
                            <FileText size={9} className="shrink-0" style={{ color: "#3A5A9B" }} />
                          )}
                          <span className="underline hover:no-underline truncate">{art.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Wiki Tag Custom Fields */}
              {(() => {
                const wt = page.wikiTags || [];
                const fields = page.wikiTagFields || {};
                const appliedTags = wt.map((name) => ({
                  name,
                  def: wikiTagDefs.find((d) => d.name === name),
                })).filter((t) => t.def && t.def.fields.length > 0);
                const hasAnyValue = appliedTags.some((t) => t.def!.fields.some((f) => fields[`${t.name}::${f.name}`]));
                if (appliedTags.length === 0 || !hasAnyValue) return null;
                return (
                  <div className="mb-6" id="article-properties">
                    {showDividers && (
                      <div className="mb-4" style={{ height: 1, background: `linear-gradient(90deg, ${borderColor}, ${accent}44, ${borderColor})` }} />
                    )}
                    <h2 className="text-[16px] mb-3 pb-1" style={{ color: accent, fontWeight: 600, fontFamily: font, borderBottom: showDividers ? `1px solid ${borderColor}` : "none" }}>
                      Article Properties
                    </h2>
                    <div className="space-y-3">
                      {appliedTags.map((t) => {
                        const filledFields = t.def!.fields.filter((f) => fields[`${t.name}::${f.name}`]);
                        if (filledFields.length === 0) return null;
                        return (
                          <div key={t.name}>
                            <span className="text-[11px] block mb-1" style={{ color: "#9A7ABB", fontWeight: 600, fontFamily: font }}>{t.name}</span>
                            <div className="flex flex-wrap gap-x-6 gap-y-1">
                              {filledFields.map((f) => {
                                const raw = fields[`${t.name}::${f.name}`];
                                const display = f.type === "toggle" ? (raw === "true" ? "Yes" : "No") : raw;
                                return (
                                  <div key={f.id} className="flex items-baseline gap-1.5">
                                    <span className="text-[10px]" style={{ color: mutedText }}>{f.name}:</span>
                                    <span className="text-[11px]" style={{ color: f.type === "toggle" ? (raw === "true" ? "#4AFF6A" : "#FF6A6A") : txt }}>{display}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {!hasBlockLayout && sidebarPanels.map((panel) => (
                <div key={`sidebar-panel-${panel.id}`} className="mb-4" id={`panel-${panel.id}`}>
                  {renderArticlePanel(panel, "sidebar")}
                </div>
              ))}

            </div>

            {/* Main article body */}
            <div className="flex-1 min-w-0 order-1 md:order-2">
              {/* Article Header */}
              <div className="mb-4 border-b-2 pb-4" style={{ borderBottomColor: borderColor }}>
                {hasAuthoredArticleChromeLayout ? (
                  <>
                    <div
                      className="relative hidden md:block mx-auto"
                      style={{ maxWidth: canvasSettings.frameWidth, height: articleChromeCanvasHeight }}
                    >
                      {iconMode === "custom" && page.pageIconUrl ? (
                        <img src={page.pageIconUrl} alt="" className="absolute object-contain" style={{ width: 28, height: 28, left: 0, top: 4 }} />
                      ) : iconMode !== "none" ? (
                        <PageIcon size={28} style={{ color: accent, position: "absolute", left: 0, top: 4 }} />
                      ) : null}
                      {articleChromeFields.map((field) => {
                        const layout = articleChromeLayouts[field] || DEFAULT_WIKI_ARTICLE_CHROME_LAYOUTS[field];
                        const content = field === "title"
                          ? page.title
                          : field === "subtitle"
                            ? page.subtitle
                            : page.description;
                        if (!content && field !== "title") return null;
                        return (
                          <div
                            key={field}
                            className="absolute overflow-hidden px-3 py-2"
                            style={{
                              left: `${((layout.colStart - 1) / WIKI_BLOCK_COLUMNS) * 100}%`,
                              width: `${(layout.colSpan / WIKI_BLOCK_COLUMNS) * 100}%`,
                              top: (layout.rowStart - 1) * articleChromeRowHeight,
                              minHeight: layout.rowSpan * articleChromeRowHeight,
                            }}
                          >
                            {field === "title" ? (
                              <h1 className="m-0 leading-tight" style={{ color: txt, fontWeight: 700, fontFamily: font, fontSize: 30 }}>
                                {content || "Untitled Article"}
                              </h1>
                            ) : field === "subtitle" ? (
                              <p className="m-0 leading-snug" style={{ color: mutedText, fontFamily: font, fontSize: 15, fontStyle: "italic" }}>
                                {content}
                              </p>
                            ) : (
                              <p className="m-0 leading-relaxed" style={{ color: txt, fontFamily: font, fontSize: 13 }}>
                                {content}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="md:hidden">
                      <div className="flex items-start gap-3">
                        {iconMode === "custom" && page.pageIconUrl ? (
                          <img src={page.pageIconUrl} alt="" className="shrink-0 mt-1 object-contain" style={{ width: 28, height: 28 }} />
                        ) : iconMode !== "none" ? (
                          <PageIcon size={28} style={{ color: accent }} className="shrink-0 mt-1" />
                        ) : null}
                        <div>
                          <h1 className="text-[24px] mb-1" style={{ color: txt, fontWeight: 700, fontFamily: font }}>
                            {page.title}
                          </h1>
                          {page.subtitle && (
                            <p className="text-[14px] italic" style={{ color: mutedText, fontFamily: font }}>
                              {page.subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                      {page.description && (
                        <p className="text-[13px] mt-3 leading-relaxed" style={{ color: txt, fontFamily: font }}>
                          {page.description}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      {iconMode === "custom" && page.pageIconUrl ? (
                        <img src={page.pageIconUrl} alt="" className="shrink-0 mt-1 object-contain" style={{ width: 28, height: 28 }} />
                      ) : iconMode !== "none" ? (
                        <PageIcon size={28} style={{ color: accent }} className="shrink-0 mt-1" />
                      ) : null}
                      <div>
                        <h1 className="text-[24px] mb-1" style={{ color: txt, fontWeight: 700, fontFamily: font }}>
                          {page.title}
                        </h1>
                        {page.subtitle && (
                          <p className="text-[14px] italic" style={{ color: mutedText, fontFamily: font }}>
                            {page.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                    {page.description && (
                      <p className="text-[13px] mt-3 leading-relaxed" style={{ color: txt, fontFamily: font }}>
                        {page.description}
                      </p>
                    )}
                  </>
                )}
              </div>

              {hasBlockLayout ? (
                <>
                  <div className="hidden md:grid gap-4 mb-6 mx-auto" style={{ maxWidth: canvasSettings.frameWidth, gridTemplateColumns: `repeat(${WIKI_BLOCK_COLUMNS}, minmax(0, 1fr))`, gridAutoRows: "minmax(20px, auto)" }}>
                    {visibleBlocks.map((block) => (
                      <div
                        key={block.id}
                        id={`block-${block.id}`}
                        style={{
                          gridColumn: `${block.layout.colStart} / span ${block.layout.colSpan}`,
                          gridRow: `${block.layout.rowStart} / span ${block.layout.rowSpan}`,
                          minHeight: block.layout.rowSpan * 28,
                        }}
                      >
                        {renderArticleBlock(block, "desktop")}
                      </div>
                    ))}
                  </div>
                  <div className="md:hidden space-y-4 mb-6">
                    {mobileBlocks.map((block) => {
                      const mobileBehavior = block.fluid?.mobileBehavior || block.mobileCollapseMode;
                      const mobileDensity = block.behavior?.mobileDensity || "comfortable";
                      return (
                        <div
                          key={`mobile-${block.id}`}
                          id={`block-${block.id}`}
                          style={{
                            width: block.behavior?.mobileFullWidth === false ? "auto" : "100%",
                            paddingInline: mobileDensity === "dense" ? 0 : mobileDensity === "compact" ? 2 : undefined,
                            overflowX: mobileBehavior === "scrollX" ? "auto" : undefined,
                            maxHeight: mobileBehavior === "compact" || mobileDensity === "dense" ? 420 : undefined,
                            overflowY: mobileBehavior === "compact" || mobileDensity === "dense" ? "auto" : undefined,
                          }}
                        >
                          {renderArticleBlock(block, "mobile")}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  {/* Main Body */}
                  {hasBody && (
                    <div id="article-body" className="mb-6">
                      {(page.bodyTitle || page.bodySubtitle) && (
                        <div className="mb-3 pb-2" style={{ borderBottom: showDividers ? `1px solid ${borderColor}` : "none" }}>
                          {page.bodyTitle && (
                            <h2 className="text-[18px]" style={{ color: accent, fontWeight: 600, fontFamily: font }}>
                              {page.bodyTitle}
                            </h2>
                          )}
                          {page.bodySubtitle && (
                            <p className="text-[12px] italic mt-0.5" style={{ color: mutedText, fontFamily: font }}>
                              {page.bodySubtitle}
                            </p>
                          )}
                        </div>
                      )}
                      <RenderFormattedText text={bodyParagraphs} color={txt} font={font} currentPlayerId={isDM ? undefined : currentUserId} isDM={isDM} />
                    </div>
                  )}

                  {bodyPanelRows.map((row, rowIdx) => (
                    <div key={`body-row-${rowIdx}`} className={`mb-6 grid gap-4 ${row.length === 2 ? "md:grid-cols-2" : "grid-cols-1"}`}>
                      {row.map((panel) => (
                        <div key={panel.id} id={`panel-${panel.id}`}>
                          {renderArticlePanel(panel, "body")}
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}

              {false && panels.map((panel, idx) => {
                if (!panel.title && !panel.content) return null;
                const ps = getPanelStyle(panel.style);
                const hasRestriction = panel.assignedTo && panel.assignedTo.length > 0;
                const vMode = panel.visibilityMode || "spoiler";
                const isAllowed = !hasRestriction || isDM || panel.assignedTo.includes(currentUserId);
                const isRevealed = revealedPanels.has(panel.id);
                const isBlank = panel.style === "blank";

                if (hasRestriction && vMode === "hidden" && !isAllowed) return null;

                const showPanelContent = isAllowed || isRevealed;
                const showDivider = showDividers && (hasBody || idx > 0);

                return (
                  <div key={panel.id} id={`panel-${panel.id}`} className="mb-6">
                    {isBlank ? (
                      <div style={DISPLAY_CONTENTS}>
                        {showDivider && (
                          <div className="mb-4" style={{ height: 1, background: `linear-gradient(90deg, ${borderColor}, ${accent}44, ${borderColor})` }} />
                        )}
                        {showPanelContent ? (
                          <div style={DISPLAY_CONTENTS}>
                            {panel.title && (
                              <div className="mb-3 pb-1" style={{ borderBottom: showDividers ? `1px solid ${borderColor}` : "none" }}>
                                <h2 className="text-[18px]" style={{ color: accent, fontWeight: 600, fontFamily: font }}>{panel.title}</h2>
                                {panel.subtitle && (
                                  <p className="text-[11px] italic mt-0.5" style={{ color: mutedText, fontFamily: font }}>{panel.subtitle}</p>
                                )}
                              </div>
                            )}
                            {hasRestriction && isDM && (
                              <div className="flex items-center gap-1 mb-2 text-[9px]" style={{ color: "#FF6ABB" }}>
                                <Lock size={8} /> Restricted
                              </div>
                            )}
                            {!isAllowed && isRevealed && (
                              <div className="flex items-center gap-2 px-3 py-1.5 mb-3 text-[10px]" style={{ background: "#1A0A0A", border: "1px solid #3A1A1A", color: "#FF8A6A" }}>
                                <AlertTriangle size={10} />
                                <span>You chose to reveal this section. This content may not be intended for your character.</span>
                              </div>
                            )}
                            {panel.content && (
                              <RenderFormattedText text={panel.content} color={txt} font={font} currentPlayerId={isDM ? undefined : currentUserId} isDM={isDM} sectionRevealed={showPanelContent} />
                            )}
                          </div>
                        ) : (
                          <div style={DISPLAY_CONTENTS}>
                            {panel.title && (
                              <h2 className="text-[18px] mb-2" style={{ color: accent, fontWeight: 600, fontFamily: font }}>{panel.title}</h2>
                            )}
                            <div className="relative overflow-hidden" style={{ minHeight: 80 }}>
                              <div style={{ filter: "blur(8px)", opacity: 0.15, padding: "12px 16px", pointerEvents: "none", userSelect: "none" }}>
                                <div style={{ color: txt, fontFamily: font, fontSize: 13 }}>This content is hidden behind a spoiler warning...</div>
                              </div>
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: "linear-gradient(180deg, #0C0C2EEE, #0C0C2EFF)", backdropFilter: "blur(4px)" }}>
                                <div className="flex items-center gap-2">
                                  <Shield size={16} style={S_RED} />
                                  <div>
                                    <div className="text-[12px]" style={{ color: "#FF6A6A", fontWeight: 700, fontFamily: font }}>Spoiler / Metagame Warning</div>
                                    <div className="text-[10px] mt-0.5" style={{ color: "#8A5A5A", fontFamily: font }}>Not intended for your character.</div>
                                  </div>
                                </div>
                                <button onClick={() => setRevealedPanels((prev) => new Set([...prev, panel.id]))} className="px-4 py-1.5 text-[11px] flex items-center gap-2 hover:opacity-90" style={{ color: "#FF8A6A", background: "#1A0A0A", border: "1px solid #5A2A2A", fontWeight: 600, fontFamily: font }}>
                                  <Eye size={11} /> Show Anyway
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ border: `1px solid ${ps.border}`, background: ps.bg }}>
                        <div className="px-4 py-2.5 flex flex-col gap-0.5" style={{ borderBottom: `1px solid ${ps.border}`, background: ps.bg === "transparent" ? "transparent" : darken(ps.bg, 5) }}>
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] flex-1" style={{ color: ps.accent, fontWeight: 600, fontFamily: font }}>{panel.title || "Untitled Section"}</span>
                            {hasRestriction && isAllowed && isDM && (
                              <span className="text-[9px] px-2 py-0.5 flex items-center gap-1" style={{ color: vMode === "hidden" ? "#FF6A6A" : "#FF6ABB", background: "#1A0A1A", border: "1px solid #3A1A3B" }}>
                                {vMode === "hidden" ? <EyeOff size={8} /> : <Lock size={8} />} Restricted
                              </span>
                            )}
                          </div>
                          {panel.subtitle && (
                            <span className="text-[11px]" style={{ color: ps.accent, opacity: 0.6, fontFamily: font }}>{panel.subtitle}</span>
                          )}
                        </div>
                        {showPanelContent ? (
                          <div className="px-4 py-3">
                            {!isAllowed && isRevealed && (
                              <div className="flex items-center gap-2 px-3 py-1.5 mb-3 text-[10px]" style={{ background: "#1A0A0A", border: "1px solid #3A1A1A", color: "#FF8A6A" }}>
                                <AlertTriangle size={10} />
                                <span>You chose to reveal this section. This content may not be intended for your character.</span>
                              </div>
                            )}
                            {panel.content ? (
                              <RenderFormattedText text={panel.content} color={txt} font={font} currentPlayerId={isDM ? undefined : currentUserId} isDM={isDM} sectionRevealed={showPanelContent} />
                            ) : (
                              <span className="text-[12px] italic" style={{ color: mutedText }}>This section has no content.</span>
                            )}
                          </div>
                        ) : (
                          <div className="relative overflow-hidden" style={{ minHeight: 120 }}>
                            <div style={{ filter: "blur(8px)", opacity: 0.15, padding: "16px 20px", pointerEvents: "none", userSelect: "none" }}>
                              <div style={{ color: txt, fontFamily: font, fontSize: 13 }}>This content is hidden behind a spoiler/metagame warning...</div>
                            </div>
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: ps.bg === "transparent" ? "linear-gradient(180deg, #0C0C2EEE 0%, #0C0C2EFF 100%)" : `linear-gradient(180deg, ${darken(ps.bg, 5)}EE 0%, ${ps.bg}FF 100%)`, backdropFilter: "blur(4px)" }}>
                              <div className="flex items-center gap-2">
                                <Shield size={20} style={S_RED} />
                                <div>
                                  <div className="text-[13px]" style={{ color: "#FF6A6A", fontWeight: 700, fontFamily: font }}>Spoiler / Metagame Warning</div>
                                  <div className="text-[11px] mt-0.5" style={{ color: "#8A5A5A", fontFamily: font }}>This section contains information not intended for your character.</div>
                                </div>
                              </div>
                              <button onClick={() => setRevealedPanels((prev) => new Set([...prev, panel.id]))} className="px-5 py-2 text-[12px] flex items-center gap-2 hover:opacity-90" style={{ color: "#FF8A6A", background: "#1A0A0A", border: "1px solid #5A2A2A", fontWeight: 600, fontFamily: font }}>
                                <Eye size={12} /> Show Anyway
                              </button>
                              <span className="text-[9px]" style={{ color: "#4A2A2A" }}>Viewing metagame content may affect roleplay immersion</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* No content placeholder */}
              {!hasContent && (
                <div className="p-8 text-center border-2" style={{ background: bg, borderColor }}>
                  <span className="text-[13px]" style={{ color: mutedText, fontFamily: font }}>
                    This article has no content yet. It may be expanded in the future.
                  </span>
                </div>
              )}

              {/* See Also */}
              {(() => {
                const seeAlsoIds = page.seeAlso || [];
                const seeAlsoPages = seeAlsoIds.map(sid => pages.find(p => p.id === sid)).filter(Boolean) as SitePage[];
                if (seeAlsoPages.length === 0) return null;
                return (
                  <div className="mb-6" id="see-also">
                    {showDividers && (
                      <div className="mb-4" style={{ height: 1, background: `linear-gradient(90deg, ${borderColor}, ${accent}44, ${borderColor})` }} />
                    )}
                    <h2 className="text-[18px] mb-3 pb-1" style={{ color: accent, fontWeight: 600, fontFamily: font, borderBottom: showDividers ? `1px solid ${borderColor}` : "none" }}>
                      See Also
                    </h2>
                    <ul className="space-y-1 ml-4">
                      {seeAlsoPages.map((sa) => (
                        <li key={sa.id} className="text-[13px] list-disc" style={{ color: mutedText }}>
                          <button
                            onClick={() => navigate(`/interface/inet-page/${sa.id}`)}
                            className="underline hover:no-underline"
                            style={{ color: accent }}
                          >
                            {sa.title}
                          </button>
                          {sa.description && (
                            <span style={{ color: mutedText }}> - {sa.description.length > 60 ? sa.description.slice(0, 60) + "..." : sa.description}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {/* References */}
              {(page.references || []).length > 0 && (
                <div className="mb-6" id="references">
                  {showDividers && (
                    <div className="mb-4" style={{ height: 1, background: `linear-gradient(90deg, ${borderColor}, ${accent}44, ${borderColor})` }} />
                  )}
                  <h2 className="text-[18px] mb-3 pb-1" style={{ color: accent, fontWeight: 600, fontFamily: font, borderBottom: showDividers ? `1px solid ${borderColor}` : "none" }}>
                    References
                  </h2>
                  <ol className="space-y-1 ml-4">
                    {(page.references || []).map((ref, idx) => (
                      <li key={idx} className="text-[11px] list-decimal" style={{ color: mutedText }}>
                        <span style={{ color: txt }}>{ref}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

            
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-8 pb-4">
            {showDividers && (
              <div className="mb-4 mx-auto max-w-[300px]" style={{ height: 1, background: `linear-gradient(90deg, transparent, ${borderColor}, transparent)` }} />
            )}

            <div className="flex items-center justify-center gap-3 flex-wrap mb-2">
              <button
                onClick={() => navigate(`/interface/inet-search?q=${encodeURIComponent(page.category)}`)}
                className="text-[10px] px-2 py-0.5 flex items-center gap-1 hover:opacity-70"
                style={{ color: accent, background: darken(bg, 10), border: `1px solid ${borderColor}` }}
              >
                <FolderOpen size={8} />
                {page.category}
              </button>
              {(page.wikiTags || []).map((wt) => (
                <button
                  key={wt}
                  onClick={() => navigate(`/interface/inet-search?q=&wikiTag=${encodeURIComponent(wt)}`)}
                  className="text-[10px] px-2 py-0.5 flex items-center gap-1 hover:opacity-70"
                  style={{ color: "#9A7ABB", background: darken(bg, 10), border: `1px solid #2A1A4B` }}
                >
                  <Tag size={8} />
                  {wt}
                </button>
              ))}
            </div>

            {page.footerText ? (
              <span className="text-[10px]" style={{ color: mutedText, fontFamily: font }}>{page.footerText}</span>
            ) : (
              <span className="text-[10px]" style={{ color: mutedText }}>
                This article is part of the I-Net Wiki | Category: {page.category} | Last updated: {page.dateAdded}
              </span>
            )}
            <br />
            <span className="text-[9px]" style={{ color: darken(mutedText, 20) }}>
              I-Net Wiki | An Intelli Corporation Product | 2026
            </span>
          </div>
        </div>
      </div>
      </div>)}
    </div>
  );
}
