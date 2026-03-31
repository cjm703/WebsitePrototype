import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { retro } from "./retro-styles";
import { RenderFormattedText } from "./render-text";
import { RichTextEditor } from "./rich-text-editor";
import { PAGE_ICONS, getPageIcon } from "./page-icons";
import {
  ArrowLeft, Save, Globe, FileText, Plus, Trash2, X,
  ChevronRight, Star, Clock, FolderOpen, Tag,
  AlertTriangle, Eye, EyeOff, Shield,
  Palette, Info, Settings,
  Lock, Unlock, Layers,
  GripVertical, ChevronUp, ChevronDown, Users,
  Link2, ImageIcon, BookOpen, Undo2, Redo2,
  Network, Hash,
} from "lucide-react";
import { TemplatePickerModal, TemplateManagerModal } from "./wiki-templates";
import type { WikiTemplate } from "./wiki-templates";
import { WikiLinkDialog } from "./wiki-link-dialog";
import { renderTypedField, type TagFieldDef } from "./tag-field-renderer";
import { safeGetItem, safeRemoveItem, safeGetJson, safeSetJson } from "./safe-storage";
import { appStore } from "@/lib/app-store";
import type { TagField, TagDefinition, PlayerData } from "./types";
import { DISPLAY_CONTENTS, S_ACCENT, S_DIM, S_LINK, S_WARN, S_RED, S_SUBTLE, S_TEXT, S_MUTED, S_GREEN_BTN } from "./shared-styles";

// ═══════════════════════════════════════════
// Types (mirrored from dm-area / inet-page)
// ═══════════════════════════════════════��═══

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

interface WikiPanel {
  id: string;
  title: string;
  subtitle?: string;
  content: string;
  assignedTo: string[]; // player ids — empty = visible to all
  visibilityMode?: "spoiler" | "hidden"; // how restriction manifests: spoiler = click to reveal, hidden = invisible
  collapsed?: boolean;
  style?: string;
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
  wikiTags?: string[];
  wikiTagFields?: Record<string, string>;
  playerVisibility?: Record<string, "visible" | "spoiler" | "hidden">;
}

type WikiTagField = TagField;
type WikiTagDefinition = TagDefinition;

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

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

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function migrateSectionsToPanels(pg: SitePage): WikiPanel[] {
  const existingPanels = pg.panels || [];
  const legacySections = pg.sections || [];
  if (legacySections.length === 0) return existingPanels;
  const converted: WikiPanel[] = legacySections.map((sec) => ({
    id: sec.id.startsWith("sec-") ? sec.id.replace("sec-", "panel-") : `panel-${sec.id}`,
    title: sec.heading || "",
    subtitle: "",
    content: sec.body || "",
    assignedTo: [],
    style: "blank",
  }));
  return [...converted, ...existingPanels];
}

function reorder<T>(list: T[], fromIdx: number, toIdx: number): T[] {
  const next = [...list];
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);
  return next;
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
    panels: [],
    wikiTags: [], wikiTagFields: {}, playerVisibility: {},
  };
}

// ═══════════════════════════════════════════
// Inline editable text component
// ════��══════════════════════════════════════
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

// ═══════════════════════════════════════════
// Main Wiki Editor Component
// ═══════════════════════════════════════════

export function WikiEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id || id === "new";

  const [allPages, setAllPages] = useState<SitePage[]>([]);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [wikiTagDefs, setWikiTagDefs] = useState<WikiTagDefinition[]>([]);
  const [customPanelStyles, setCustomPanelStyles] = useState<CustomPanelStyle[]>([]);
  const [wikiLoading, setWikiLoading] = useState(true);
  const [wikiLoadError, setWikiLoadError] = useState("");

  const existingPage = useMemo(() => (isNew ? null : allPages.find((p) => p.id === id) || null), [allPages, id, isNew]);

  // ─── Article State ───
  const [page, setPage] = useState<SitePage>(() => createBlankSitePage());

  // ─── UI State ───
  const [activePanel, setActivePanel] = useState<"preview" | "settings" | "content" | "metadata" | "appearance">("preview");
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
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
  const urlManuallyEdited = useRef(false);
  const hydratedPageRef = useRef<string | null>(null);

  // ─── Template State ───
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  // ─── Auto-save Draft State ───
  const [showDraftRestore, setShowDraftRestore] = useState(false);
  const draftKey = `inet-wiki-draft-${page.id}`;

  // ─── Undo/Redo State ───
  const [undoStack, setUndoStack] = useState<SitePage[]>([]);
  const [redoStack, setRedoStack] = useState<SitePage[]>([]);
  const undoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Wiki Link Dialog State ───
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkInsertTarget, setLinkInsertTarget] = useState<"body" | string>("body");

  // ─── Image Embed Dialog State ───
  const [showImageEmbed, setShowImageEmbed] = useState(false);
  const [showSpoilerInsert, setShowSpoilerInsert] = useState(false);
  const [spoilerInsertTarget, setSpoilerInsertTarget] = useState<"body" | string>("body");
  const [spoilerLabel, setSpoilerLabel] = useState("Spoiler");
  const [spoilerPlayerIds, setSpoilerPlayerIds] = useState<string[]>([]);
  const [spoilerContent, setSpoilerContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [imageAlign, setImageAlign] = useState<"left" | "center" | "right">("center");
  const [imageWidth, setImageWidth] = useState("100");

  // ─── Custom Panel Styles ───
  const [showNewStyleForm, setShowNewStyleForm] = useState(false);
  const [newStyleLabel, setNewStyleLabel] = useState("");
  const [newStyleAccent, setNewStyleAccent] = useState("#6ABAFF");
  const [newStyleBg, setNewStyleBg] = useState("#0A1A2A");
  const [newStyleBorder, setNewStyleBorder] = useState("#1A3A5B");

  useEffect(() => {
    let cancelled = false;

    async function loadWikiEditorData() {
      try {
        setWikiLoading(true);
        setWikiLoadError("");
        const [siteRows, playerRows, wikiTagRows, panelStyleRows] = await Promise.all([
          appStore.listSites<SitePage>().catch(() => safeGetJson<SitePage[]>("inet-dm-sites", [])),
          appStore.listPlayers<PlayerData>().catch(() => safeGetJson<PlayerData[]>("inet-dm-players", [])),
          appStore.listTags<WikiTagDefinition>("wiki").catch(() => safeGetJson<WikiTagDefinition[]>("inet-dm-wikiTags", [])),
          appStore.listCustomPanelStyles<CustomPanelStyle>().catch(() => safeGetJson<CustomPanelStyle[]>("inet-custom-panel-styles", [])),
        ]);

        if (cancelled) return;

        setAllPages(Array.isArray(siteRows) ? siteRows : []);
        setPlayers(Array.isArray(playerRows) ? playerRows : []);
        setWikiTagDefs(Array.isArray(wikiTagRows) ? wikiTagRows : []);
        setCustomPanelStyles(Array.isArray(panelStyleRows) ? panelStyleRows : []);
      } catch (err) {
        if (cancelled) return;
        setWikiLoadError(err instanceof Error ? err.message : "Failed to load wiki editor data");
        setAllPages(safeGetJson<SitePage[]>("inet-dm-sites", []));
        setPlayers(safeGetJson<PlayerData[]>("inet-dm-players", []));
        setWikiTagDefs(safeGetJson<WikiTagDefinition[]>("inet-dm-wikiTags", []));
        setCustomPanelStyles(safeGetJson<CustomPanelStyle[]>("inet-custom-panel-styles", []));
      } finally {
        if (!cancelled) setWikiLoading(false);
      }
    }

    loadWikiEditorData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (wikiLoading) return;

    if (isNew) {
      if (hydratedPageRef.current === "new") return;
      const blank = createBlankSitePage();
      setPage(blank);
      setEditSummary("");
      setHasUnsaved(true);
      setShowTemplatePicker(true);
      urlManuallyEdited.current = false;
      hydratedPageRef.current = "new";
      return;
    }

    if (!existingPage) return;
    if (hydratedPageRef.current === existingPage.id) return;

    const migrated = migrateSectionsToPanels(existingPage);
    setPage({ ...existingPage, panels: migrated, sections: [] });
    setEditSummary(existingPage.lastEditSummary || "");
    setHasUnsaved(false);
    setShowTemplatePicker(false);
    urlManuallyEdited.current = !!existingPage.url;
    hydratedPageRef.current = existingPage.id;
  }, [existingPage, isNew, wikiLoading]);

  const allPanelStyles = [...BUILTIN_PANEL_STYLES, ...customPanelStyles];

  const saveCustomStyles = (styles: CustomPanelStyle[]) => {
    setCustomPanelStyles(styles);
    void appStore.saveCustomPanelStyles<CustomPanelStyle>(styles).catch((err) => {
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

  // ─── Category/Tag Helpers ───
  const allCategories = useMemo(() => Array.from(new Set(allPages.map((p) => p.category).filter(Boolean))), [allPages]);
  const allTags = useMemo(() => Array.from(new Set(allPages.flatMap((p) => p.tags || []).filter(Boolean))), [allPages]);

  // ─── Check for draft on mount ───
  useEffect(() => {
    try {
      const draftRaw = safeGetItem(draftKey);
      if (draftRaw && existingPage) {
        const draft = JSON.parse(draftRaw);
        if (draft && draft.title !== undefined) {
          setShowDraftRestore(true);
        }
      }
    } catch {}
  }, [draftKey, existingPage]);

  // ─── Auto-save draft every 30 seconds (only for existing articles) ───
  useEffect(() => {
    if (!hasUnsaved || isNew) return;
    const interval = setInterval(() => {
      try {
        safeSetJson(draftKey, page);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [hasUnsaved, page, draftKey]);

  // ─── Restore draft handler ───
  const restoreDraft = useCallback(() => {
    try {
      const draftRaw = safeGetItem(draftKey);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        const migrated = migrateSectionsToPanels(draft);
        setPage({ ...draft, panels: migrated, sections: [] });
        setHasUnsaved(true);
      }
    } catch {}
    setShowDraftRestore(false);
  }, [draftKey]);

  const discardDraft = useCallback(() => {
    safeRemoveItem(draftKey);
    setShowDraftRestore(false);
  }, [draftKey]);

  // Track changes
  const update = useCallback(<K extends keyof SitePage>(key: K, val: SitePage[K]) => {
    setPage((prev) => {
      // Push to undo stack (debounced)
      if (undoDebounceRef.current) clearTimeout(undoDebounceRef.current);
      undoDebounceRef.current = setTimeout(() => {
        setUndoStack((stack) => [...stack.slice(-49), prev]);
        setRedoStack([]);
      }, 500);
      return { ...prev, [key]: val };
    });
    setHasUnsaved(true);
  }, []);

  // ─── Save ───
  const handleSave = async () => {
    if (!page.title.trim()) { setError("Title is required"); return; }
    if (!page.url.trim()) { setError("URL is required"); return; }
    if (!page.description.trim()) { setError("Description is required"); return; }
    setError("");

    const now = new Date();
    const autoDate = `${DATE_MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    const data: SitePage = { ...page, lastEditSummary: editSummary.trim(), dateAdded: autoDate };
    const stored: SitePage[] = [...allPages];
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
      await appStore.saveSites<SitePage>(stored);
      setAllPages(stored);
      safeRemoveItem(draftKey);
      setPage(data);
      setSaveFlash(true);
      setHasUnsaved(false);
      setTimeout(() => setSaveFlash(false), 1500);
    } catch (err) {
      console.warn("Failed to save wiki article", err);
      setError(err instanceof Error ? `Failed to save article: ${err.message}` : "Failed to save article");
    }
  };

  // ─── Panel/Section helpers (unified) ───
  const panels = page.panels || [];
  const addPanel = (style?: string) => {
    const p: WikiPanel = { id: `panel-${uid()}`, title: "", subtitle: "", content: "", assignedTo: [], style: style || "blank" };
    update("panels", [...panels, p]);
    setEditingPanelId(p.id);
    setActivePanel("content");
  };
  const updatePanel = (panelId: string, changes: Partial<WikiPanel>) => {
    update("panels", panels.map((p) => p.id === panelId ? { ...p, ...changes } : p));
  };
  const removePanel = (panelId: string) => {
    update("panels", panels.filter((p) => p.id !== panelId));
    if (editingPanelId === panelId) setEditingPanelId(null);
  };
  const togglePanelPlayer = (panelId: string, playerId: string) => {
    const panel = panels.find((p) => p.id === panelId);
    if (!panel) return;
    const assigned = panel.assignedTo || [];
    const next = assigned.includes(playerId) ? assigned.filter((id) => id !== playerId) : [...assigned, playerId];
    updatePanel(panelId, { assignedTo: next });
  };

  // ─── Reorder helpers ───
  const movePanel = (from: number, to: number) => {
    if (to < 0 || to >= panels.length) return;
    update("panels", reorder(panels, from, to));
  };

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

  // ─── Undo / Redo ───
  const handleUndo = useCallback(() => {
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

  // ─── Keyboard Shortcuts ───
  const handleSaveRef = useRef<() => void>(() => {});
  handleSaveRef.current = handleSave;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "Escape") {
        if (editingPanelId) setEditingPanelId(null);
        else if (showSpoilerInsert) setShowSpoilerInsert(false);
        else if (showLinkDialog) setShowLinkDialog(false);
        else if (showImageEmbed) setShowImageEmbed(false);
        else if (showTemplatePicker) setShowTemplatePicker(false);
        else if (showTemplateManager) setShowTemplateManager(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo, editingPanelId, showSpoilerInsert, showLinkDialog, showImageEmbed, showTemplatePicker, showTemplateManager]);

  // ─── Template Application ───
  const applyTemplate = useCallback((template: WikiTemplate) => {
    const data = template.data;
    // Convert template sections to panels (migration)
    const templateSectionPanels: WikiPanel[] = (data.sections || []).map((s) => ({
      id: `panel-${uid()}`,
      title: s.heading || "",
      subtitle: "",
      content: s.body || "",
      assignedTo: [],
      style: "blank",
    }));
    const templatePanels: WikiPanel[] = (data.panels || []).map((p) => ({ ...p, id: `panel-${uid()}` }));
    setPage((prev) => ({
      ...prev,
      category: data.category || prev.category,
      tags: data.tags || prev.tags,
      sections: [],
      panels: [...templateSectionPanels, ...templatePanels],
      infobox: data.infobox || prev.infobox,
      body: data.body || prev.body,
      bodyTitle: data.bodyTitle || prev.bodyTitle,
      pageIcon: data.pageIcon || prev.pageIcon,
      underConstruction: data.underConstruction ?? prev.underConstruction,
      showDividers: data.showDividers ?? prev.showDividers,
      articleQuality: data.articleQuality || prev.articleQuality,
    }));
    setHasUnsaved(true);
    setShowTemplatePicker(false);
  }, []);

  // ─── Wiki Link Insertion ───
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

  // ─── Image Embed Handler ───
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

  // ─── Spoiler Box Insert Handler ───
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

  // ─── Preview-as-player helpers ───
  const previewPlayer = useMemo(() => previewAsPlayerId ? players.find((p) => p.id === previewAsPlayerId) : null, [previewAsPlayerId, players]);

  // ─── Infobox helpers ───
  const addInfoboxRow = () => update("infobox", [...(page.infobox || []), { label: "", value: "" }]);
  const updateInfoboxRow = (idx: number, field: "label" | "value", val: string) => {
    const next = [...(page.infobox || [])];
    next[idx] = { ...next[idx], [field]: val };
    update("infobox", next);
  };
  const removeInfoboxRow = (idx: number) => update("infobox", (page.infobox || []).filter((_, i) => i !== idx));

  // ─── Subcategory helpers ───
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

  // Resolve colors
  const bg = page.bgColor || DEFAULT_STYLE.bgColor;
  const hdr = page.headerColor || DEFAULT_STYLE.headerColor;
  const accent = page.accentColor || DEFAULT_STYLE.accentColor;
  const txt = page.textColor || DEFAULT_STYLE.textColor;
  const font = page.fontFamily || DEFAULT_STYLE.fontFamily;
  const borderColor = lighten(bg, 25);
  const mutedText = lighten(bg, 60);

  const bodyParagraphs = (page.body || "").trim();
  const hasBody = bodyParagraphs.length > 0;
  const hasPanelContent = panels.length > 0 && panels.some((p) => p.title || p.content);
  const hasContent = hasBody || hasPanelContent;

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

  // ─── Sidebar tabs for editor ───
  const sidebarTabs: { id: typeof activePanel; label: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> }[] = [
    { id: "preview", label: "Preview", icon: Eye },
    { id: "settings", label: "Article", icon: Settings },
    { id: "content", label: "Content", icon: Layers },
    { id: "metadata", label: "Metadata", icon: Tag },
    { id: "appearance", label: "Style", icon: Palette },
  ];

  const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] w-full outline-none`;
  const inputStyle: React.CSSProperties = { color: "#C0D0F0" };
  const labelStyle: React.CSSProperties = { color: "#5A6A8A", fontSize: 11, fontWeight: 600 };

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
    <div className="min-h-screen flex flex-col" style={{ background: "#080828", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}>
      {/* ═══ Top toolbar ═══ */}
      <div className={`${retro.toolbar} flex items-center justify-between`} style={{ borderBottom: "2px solid #050520" }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (hasUnsaved && !window.confirm("You have unsaved changes. Leave anyway?")) return;
              navigate("/interface/dm-area");
            }}
            className="text-[11px] hover:opacity-80 flex items-center gap-1"
            style={S_ACCENT}
          >
            <ArrowLeft size={12} /> Back to DM Area
          </button>
          <span className="text-[11px]" style={S_DIM}>|</span>
          <span className="text-[11px] flex items-center gap-1" style={S_LINK}>
            <Globe size={11} /> Wiki Article Editor
          </span>
          {hasUnsaved && (
            <span className="text-[9px] px-2 py-0.5 animate-pulse" style={{ color: "#FFAA4A", background: "#1A1A0A", border: "1px solid #3A3A1A" }}>
              UNSAVED CHANGES
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saveFlash && (
            <span className="text-[11px] px-3 py-1" style={{ color: "#4AFF6A", background: "#0A1A0A", border: "1px solid #1A3A1A" }}>
              Saved!
            </span>
          )}
          {error && (
            <span className="text-[11px] px-3 py-1 flex items-center gap-1" style={{ color: "#FF6A6A", background: "#1A0A0A", border: "1px solid #3A1A1A" }}>
              <AlertTriangle size={10} />{error}
            </span>
          )}
          <button onClick={handleUndo} disabled={undoStack.length === 0} className={`${retro.button} px-2 py-1`} title="Undo (Ctrl+Z)" style={{ opacity: undoStack.length === 0 ? 0.3 : 1 }}>
            <Undo2 size={11} style={S_LINK} />
          </button>
          <button onClick={handleRedo} disabled={redoStack.length === 0} className={`${retro.button} px-2 py-1`} title="Redo (Ctrl+Y)" style={{ opacity: redoStack.length === 0 ? 0.3 : 1 }}>
            <Redo2 size={11} style={S_LINK} />
          </button>
          <span style={{ width: 1, height: 16, background: "#1A1A4B" }} />
          <button onClick={() => setShowTemplatePicker(true)} className={`${retro.button} px-2 py-1`} title="Templates">
            <BookOpen size={11} style={S_WARN} />
          </button>
          <button onClick={() => { setLinkInsertTarget("body"); setShowLinkDialog(true); }} className={`${retro.button} px-2 py-1`} title="Insert Wiki Link">
            <Link2 size={11} style={{ color: "#FF6ABB" }} />
          </button>
          <button onClick={() => setShowImageEmbed(true)} className={`${retro.button} px-2 py-1`} title="Embed Image">
            <ImageIcon size={11} style={{ color: "#4AFF6A" }} />
          </button>
          <button onClick={() => { setSpoilerInsertTarget("body"); setShowSpoilerInsert(true); }} className={`${retro.button} px-2 py-1`} title="Insert Spoiler Box">
            <Shield size={11} style={S_RED} />
          </button>
          <button onClick={() => navigate("/interface/wiki-graph")} className={`${retro.button} px-2 py-1`} title="Article Graph">
            <Network size={11} style={{ color: "#9A7ABB" }} />
          </button>
          <span style={{ width: 1, height: 16, background: "#1A1A4B" }} />
          <button
            onClick={handleSave}
            className={`${retro.button} px-4 py-1 text-[11px] flex items-center gap-1`}
            style={{ color: "#FFFFFF", background: "#2A5ABB", borderColor: "#4A7BFF" }}
            title="Publish (Ctrl+S)"
          >
            <Save size={11} /> Publish
          </button>
        </div>
      </div>

      {/* ═══ Main layout: sidebar editor + live preview ═══ */}
      <div className="flex flex-1 min-h-0">
        {/* ─── Left sidebar: editor controls ─── */}
        <div className="w-[380px] shrink-0 flex flex-col border-r-2" style={{ background: "#0A0A2E", borderRightColor: "#1A1A4B" }}>
          {/* Sidebar tab bar */}
          <div className="flex border-b" style={{ borderBottomColor: "#1A1A4B" }}>
            {sidebarTabs.map((tab) => {
              const active = activePanel === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActivePanel(tab.id)}
                  className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[9px] transition-colors"
                  style={{
                    color: active ? "#C0D0F0" : "#4A5A7A",
                    background: active ? "#0C0C30" : "transparent",
                    borderBottom: active ? `2px solid ${accent}` : "2px solid transparent",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <tab.icon size={13} style={{ color: active ? accent : "#4A5A7A" }} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Sidebar content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ─── PREVIEW TAB ─── */}
            {activePanel === "preview" && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 px-3 py-2 text-[11px]" style={{ background: "#0A1A2A", border: "1px solid #1A3A5B", color: "#7A9ABB" }}>
                  <Eye size={13} className="shrink-0 mt-0.5" style={S_LINK} />
                  <span>Click any text in the preview to edit it inline. Use the other tabs for advanced settings.</span>
                </div>
                {/* Quick edit fields */}
                <div>
                  <label style={labelStyle}>Title *</label>
                  <input type="text" value={page.title} onChange={(e) => { update("title", e.target.value); if (!urlManuallyEdited.current) update("url", toSlug(e.target.value)); setError(""); }} placeholder="Article title..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Subtitle</label>
                  <input type="text" value={page.subtitle} onChange={(e) => update("subtitle", e.target.value)} placeholder="Tagline..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Description * <span className="text-[9px]" style={{ color: "#3A4A6A", fontWeight: 400 }}>(shown in search)</span></label>
                  <textarea value={page.description} onChange={(e) => { update("description", e.target.value); setError(""); }} placeholder="Short description..." rows={2} className={`${inputClass} resize-none`} style={inputStyle} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label style={labelStyle}>URL *</label>
                    <input type="text" value={page.url} onChange={(e) => { urlManuallyEdited.current = true; update("url", e.target.value); setError(""); }} placeholder="auto-generated-slug" className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <div className="relative">
                      <input type="text" value={page.category} onChange={(e) => update("category", e.target.value)} placeholder="Locations, Lore..." className={inputClass} style={inputStyle} list="category-suggestions" />
                      <datalist id="category-suggestions">
                        {allCategories.map((c) => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Body Section Title</label>
                  <input type="text" value={page.bodyTitle} onChange={(e) => update("bodyTitle", e.target.value)} placeholder="Overview, Introduction..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Main Body</label>
                  <RichTextEditor value={page.body} onChange={(html) => update("body", html)} placeholder="Write the main article content..." minHeight={200} />
                  <div className="flex gap-1 mt-1">
                    <button onClick={() => { setLinkInsertTarget("body"); setShowLinkDialog(true); }} className="text-[9px] px-2 py-1 flex items-center gap-1 hover:opacity-80" style={{ color: "#FF6ABB", border: "1px solid #3A1A3B" }}>
                      <Link2 size={8} /> Insert Wiki Link
                    </button>
                    <button onClick={() => setShowImageEmbed(true)} className="text-[9px] px-2 py-1 flex items-center gap-1 hover:opacity-80" style={{ color: "#4AFF6A", border: "1px solid #1A3A1A" }}>
                      <ImageIcon size={8} /> Embed Image
                    </button>
                  </div>
                </div>
                {/* Tags quick-add */}
                <div>
                  <label style={labelStyle}>Tags</label>
                  <div className="flex flex-wrap gap-1 mt-1 mb-1">
                    {(page.tags || []).map((tag) => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 flex items-center gap-0.5" style={{ color: accent, background: "#0A0A28", border: `1px solid ${accent}33` }}>
                        {tag}
                        <button onClick={() => update("tags", (page.tags || []).filter((t) => t !== tag))} className="hover:opacity-80"><X size={7} /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && tagDraft.trim()) { update("tags", [...new Set([...(page.tags || []), tagDraft.trim()])]); setTagDraft(""); } }}
                      placeholder="Add tag..."
                      className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[10px] flex-1 outline-none`}
                      style={inputStyle}
                      list="tag-suggestions"
                    />
                    <datalist id="tag-suggestions">
                      {allTags.filter((t) => !(page.tags || []).includes(t)).map((t) => <option key={t} value={t} />)}
                    </datalist>
                    <button onClick={() => { if (tagDraft.trim()) { update("tags", [...new Set([...(page.tags || []), tagDraft.trim()])]); setTagDraft(""); } }} className="text-[9px] px-2 hover:opacity-80" style={{ color: accent }}>Add</button>
                  </div>
                </div>
                {/* Edit summary */}
                <div style={{ borderTop: "1px solid #1A2A4B", paddingTop: 12 }}>
                  <label style={labelStyle}>Edit Summary</label>
                  <input type="text" value={editSummary} onChange={(e) => setEditSummary(e.target.value)} placeholder="Describe your changes..." className={inputClass} style={inputStyle} />
                </div>
              </div>
            )}

            {/* ─── ARTICLE SETTINGS TAB ��── */}
            {activePanel === "settings" && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 px-3 py-2 text-[11px]" style={{ background: "#0A1A2A", border: "1px solid #1A3A5B", color: "#7A9ABB" }}>
                  <Settings size={13} className="shrink-0 mt-0.5" style={S_LINK} />
                  <span>Configure article identity, icon, marquee, date, and infobox.</span>
                </div>
                {/* Icon picker */}
                <div>
                  <label style={labelStyle}>Page Icon</label>
                  <div className="flex items-center gap-2 mt-1">
                    {iconMode === "none" ? (
                      <span className="text-[11px]" style={S_DIM}>No icon</span>
                    ) : iconMode === "custom" && page.pageIconUrl ? (
                      <img src={page.pageIconUrl} alt="" className="object-contain" style={{ width: 18, height: 18 }} />
                    ) : (() => { const Ico = getPageIcon(iconMode); return <Ico size={18} style={{ color: accent }} />; })()}
                    <button onClick={() => setShowIconPicker(!showIconPicker)} className={`${retro.button} px-3 py-1 text-[10px]`} style={S_TEXT}>
                      Change Icon
                    </button>
                  </div>
                  {showIconPicker && (
                    <div className={`${retro.sunken} bg-[#0A0A28] p-3 mt-2`}>
                      <div className="flex gap-2 mb-2">
                        <button onClick={() => { update("pageIcon", "none"); setShowIconPicker(false); }} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_MUTED}>None</button>
                        <button onClick={() => update("pageIcon", "custom")} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_MUTED}>Custom URL</button>
                      </div>
                      {page.pageIcon === "custom" && (
                        <input type="text" value={page.pageIconUrl} onChange={(e) => update("pageIconUrl", e.target.value)} placeholder="https://..." className={`${inputClass} mb-2`} style={inputStyle} />
                      )}
                      <div className="grid grid-cols-8 gap-1">
                        {PAGE_ICONS.map((ico) => (
                          <button key={ico.name} onClick={() => { update("pageIcon", ico.name); setShowIconPicker(false); }} className="p-1.5 hover:bg-[#1A1A5B] transition-colors" style={{ border: page.pageIcon === ico.name ? `2px solid ${accent}` : "2px solid transparent" }} title={ico.label}>
                            <ico.Icon size={14} style={{ color: page.pageIcon === ico.name ? accent : "#5A6A8A" }} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* Date */}
                <div>
                  <label style={labelStyle}>Date Added</label>
                  <input type="text" value={page.dateAdded} onChange={(e) => update("dateAdded", e.target.value)} className={inputClass} style={inputStyle} />
                </div>
                {/* Marquee */}
                <div>
                  <label style={labelStyle}>Marquee Text</label>
                  <input type="text" value={page.marqueeText} onChange={(e) => update("marqueeText", e.target.value)} placeholder="Scrolling banner text..." className={inputClass} style={inputStyle} />
                </div>
                {/* Footer */}
                <div>
                  <label style={labelStyle}>Footer Text</label>
                  <input type="text" value={page.footerText} onChange={(e) => update("footerText", e.target.value)} placeholder="Custom footer..." className={inputClass} style={inputStyle} />
                </div>
                {/* Toggles */}
                <div className="space-y-2">
                  <label style={labelStyle}>Toggles</label>
                  {([
                    { key: "underConstruction" as const, label: "Under Construction / Stub Banner", val: page.underConstruction },
                    { key: "showHitCounter" as const, label: "Show Hit Counter", val: page.showHitCounter },
                    { key: "showDividers" as const, label: "Show Section Dividers", val: page.showDividers },
                  ] as const).map((t) => (
                    <button key={t.key} onClick={() => update(t.key, !t.val)} className="flex items-center gap-2 w-full text-left text-[11px] px-2 py-1.5 hover:bg-[#0A0A30] transition-colors" style={S_SUBTLE}>
                      {t.val ? <Eye size={11} style={{ color: "#4AFF6A" }} /> : <EyeOff size={11} style={S_DIM} />}
                      {t.label}
                    </button>
                  ))}
                </div>
                {page.showHitCounter && (
                  <div>
                    <label style={labelStyle}>Hit Count</label>
                    <input type="number" value={page.hitCount} onChange={(e) => update("hitCount", parseInt(e.target.value) || 0)} className={inputClass} style={inputStyle} />
                  </div>
                )}
                {/* Disambiguation */}
                <div>
                  <label style={labelStyle}>Disambiguation Note</label>
                  <input type="text" value={page.disambiguationNote} onChange={(e) => update("disambiguationNote", e.target.value)} placeholder="For other uses, see..." className={inputClass} style={inputStyle} />
                </div>
                {/* Infobox */}
                <div>
                  <label style={labelStyle}>Infobox ({(page.infobox || []).length} rows)</label>
                  <div className={`${retro.sunken} bg-[#080820] p-3 mt-1`}>
                    {(page.infobox || []).map((row, idx) => (
                      <div key={idx} className="flex items-center gap-1 mb-1.5">
                        <input type="text" value={row.label} onChange={(e) => updateInfoboxRow(idx, "label", e.target.value)} placeholder="Label" className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px] w-[100px] outline-none`} style={inputStyle} />
                        <input type="text" value={row.value} onChange={(e) => updateInfoboxRow(idx, "value", e.target.value)} placeholder="Value" className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px] flex-1 outline-none`} style={inputStyle} />
                        <button onClick={() => removeInfoboxRow(idx)} className="shrink-0 hover:opacity-80"><X size={10} style={S_RED} /></button>
                      </div>
                    ))}
                    <button onClick={addInfoboxRow} className="text-[10px] flex items-center gap-1 mt-1 hover:opacity-80" style={S_ACCENT}>
                      <Plus size={9} /> Add Row
                    </button>
                  </div>
                </div>
                {/* Subcategories */}
                <div>
                  <label style={labelStyle}>Subcategories ({(page.subcategories || []).length})</label>
                  <div className={`${retro.sunken} bg-[#080820] p-3 mt-1`}>
                    {(page.subcategories || []).map((sc) => (
                      <div key={sc.id} className="flex items-center gap-1 mb-1">
                        <span className="text-[10px]">{sc.type === "folder" ? "📁" : "📄"}</span>
                        <input type="text" value={sc.name} onChange={(e) => updateSubcategory(sc.id, "name", e.target.value)} placeholder={sc.type === "folder" ? "Folder name..." : "Page name..."} className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[10px] flex-1 outline-none`} style={inputStyle} />
                        <select value={sc.type} onChange={(e) => updateSubcategory(sc.id, "type", e.target.value)} className="text-[9px] bg-[#0A0A28] px-1 py-0.5 outline-none" style={{ color: sc.type === "folder" ? "#4A7BFF" : "#4A9A5A", border: "1px solid #1A2A4B" }}>
                          <option value="folder">Folder</option>
                          <option value="article">Article</option>
                        </select>
                        {sc.type === "article" && (
                          <select value={sc.articleId || ""} onChange={(e) => updateSubcategory(sc.id, "articleId", e.target.value)} className="text-[9px] bg-[#0A0A28] px-1 py-0.5 outline-none max-w-[100px]" style={{ color: "#6A9AFF", border: "1px solid #1A2A4B" }}>
                            <option value="">— Link —</option>
                            {allPages.filter((p) => p.id !== page.id).map((p) => (
                              <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                          </select>
                        )}
                        <button onClick={() => removeSubcategory(sc.id)} className="shrink-0 hover:opacity-80"><X size={10} style={S_RED} /></button>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => addSubcategory("folder")} className="text-[10px] flex items-center gap-1 hover:opacity-80" style={S_ACCENT}><Plus size={9} /> Folder</button>
                      <button onClick={() => addSubcategory("article")} className="text-[10px] flex items-center gap-1 hover:opacity-80" style={S_GREEN_BTN}><Plus size={9} /> Article Link</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── CONTENT TAB (Unified Sections) ─── */}
            {activePanel === "content" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: "#6A9AFF", fontWeight: 600 }}>Sections ({panels.length})</span>
                  <span className="text-[9px]" style={S_DIM}>Drag or use arrows to reorder</span>
                </div>
                <div className="flex items-start gap-2 px-3 py-2 text-[11px]" style={{ background: "#0A1A2A", border: "1px solid #1A3A5B", color: "#7A9ABB" }}>
                  <Layers size={13} className="shrink-0 mt-0.5" style={S_LINK} />
                  <span>Each section can have its own style, content, player visibility, and spoiler settings.</span>
                </div>
                {panels.map((panel, idx) => {
                  const ps = allPanelStyles.find((s) => s.id === panel.style) || allPanelStyles[0];
                  const isEditing = editingPanelId === panel.id;
                  const hasRestriction = panel.assignedTo && panel.assignedTo.length > 0;
                  const vMode = panel.visibilityMode || "spoiler";
                  return (
                    <div
                      key={panel.id}
                      draggable
                      onDragStart={handleDragStart(idx)}
                      onDragOver={handleDragOver(idx)}
                      onDrop={handleDrop(idx)}
                      onDragEnd={handleDragEnd}
                      className={`${retro.sunken} p-3 transition-all`}
                      style={{
                        background: ps.bg === "transparent" ? "#080820" : ps.bg,
                        border: `1px solid ${isEditing ? ps.accent : dragOverIdx === idx && dragType === "panel" ? "#4AFF6A" : ps.border}`,
                        opacity: dragIdx === idx && dragType === "panel" ? 0.4 : 1,
                        transform: dragOverIdx === idx && dragType === "panel" && dragIdx !== idx ? "translateY(2px)" : "none",
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <GripVertical size={12} style={{ color: "#3A4A6A", cursor: "grab" }} className="shrink-0" />
                          <span className="text-[10px]" style={{ color: ps.accent, fontWeight: 600 }}>SECTION {idx + 1}</span>
                          {hasRestriction ? (
                            <span className="text-[9px] px-1.5 py-0.5 flex items-center gap-0.5" style={{ color: vMode === "hidden" ? "#FF6A6A" : "#FF6ABB", background: "#1A0A1A", border: "1px solid #3A1A3B" }}>
                              {vMode === "hidden" ? <EyeOff size={8} /> : <Lock size={8} />}
                              {vMode === "hidden" ? "Hidden" : "Spoiler"} ({panel.assignedTo.length})
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 flex items-center gap-0.5" style={{ color: "#4A9A5A", background: "#0A1A0A", border: "1px solid #1A3A1A" }}>
                              <Unlock size={8} />All
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => movePanel(idx, idx - 1)} disabled={idx === 0} className="p-0.5 hover:opacity-80 disabled:opacity-20" title="Move up"><ChevronUp size={10} style={S_MUTED} /></button>
                          <button onClick={() => movePanel(idx, idx + 1)} disabled={idx === panels.length - 1} className="p-0.5 hover:opacity-80 disabled:opacity-20" title="Move down"><ChevronDown size={10} style={S_MUTED} /></button>
                          <button onClick={() => setEditingPanelId(isEditing ? null : panel.id)} className="text-[10px] hover:opacity-80 ml-1" style={{ color: ps.accent }}>
                            {isEditing ? "Collapse" : "Edit"}
                          </button>
                          <button onClick={() => removePanel(panel.id)} className="text-[10px] hover:opacity-80" style={S_RED}>
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                      <input type="text" value={panel.title} onChange={(e) => updatePanel(panel.id, { title: e.target.value })} placeholder="Section title..." className={`${retro.sunken} bg-[#0A0A28] px-2 py-1.5 text-[11px] w-full outline-none mb-1`} style={inputStyle} />
                      <input type="text" value={panel.subtitle || ""} onChange={(e) => updatePanel(panel.id, { subtitle: e.target.value })} placeholder="Subtitle (optional)..." className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[10px] w-full outline-none mb-2`} style={{ ...inputStyle, opacity: 0.7 }} />

                      {isEditing && (
                        <div className="space-y-3">
                          {/* Style selector */}
                          <div>
                            <label className="text-[10px] block mb-1" style={S_MUTED}>Section Style</label>
                            <div className="flex flex-wrap gap-1">
                              {allPanelStyles.map((s) => (
                                <button key={s.id} onClick={() => updatePanel(panel.id, { style: s.id })} className="text-[10px] px-2 py-1 transition-colors" style={{ color: s.accent, background: panel.style === s.id ? (s.bg === "transparent" ? "#0A0A2A" : s.bg) : "transparent", border: panel.style === s.id ? `1px solid ${s.accent}` : "1px solid #1A2A4B" }}>
                                  {s.label}
                                  {!BUILTIN_PANEL_STYLES.some((b) => b.id === s.id) && (
                                    <X size={8} className="inline ml-1 opacity-50 hover:opacity-100" onClick={(ev) => { ev.stopPropagation(); removeCustomStyle(s.id); }} />
                                  )}
                                </button>
                              ))}
                            </div>
                            {!showNewStyleForm ? (
                              <button onClick={() => setShowNewStyleForm(true)} className="text-[9px] mt-1.5 hover:opacity-80" style={S_GREEN_BTN}>
                                <Plus size={8} className="inline mr-0.5" />Custom style...
                              </button>
                            ) : (
                              <div className="mt-2 p-2 space-y-2" style={{ background: "#060618", border: "1px solid #1A2A4B" }}>
                                <input type="text" value={newStyleLabel} onChange={(e) => setNewStyleLabel(e.target.value)} placeholder="Style name..." className="text-[10px] bg-[#0A0A28] px-2 py-1 w-full outline-none" style={{ color: "#C0D0F0", border: "1px solid #1A2A4B" }} />
                                <div className="flex items-center gap-2">
                                  <label className="text-[9px] flex items-center gap-1" style={S_MUTED}>
                                    Accent <input type="color" value={newStyleAccent} onChange={(e) => setNewStyleAccent(e.target.value)} className="w-5 h-4 bg-transparent border-none cursor-pointer" />
                                  </label>
                                  <label className="text-[9px] flex items-center gap-1" style={S_MUTED}>
                                    BG <input type="color" value={newStyleBg} onChange={(e) => setNewStyleBg(e.target.value)} className="w-5 h-4 bg-transparent border-none cursor-pointer" />
                                  </label>
                                  <label className="text-[9px] flex items-center gap-1" style={S_MUTED}>
                                    Border <input type="color" value={newStyleBorder} onChange={(e) => setNewStyleBorder(e.target.value)} className="w-5 h-4 bg-transparent border-none cursor-pointer" />
                                  </label>
                                </div>
                                <div className="text-[9px] px-2 py-1.5" style={{ color: newStyleAccent, background: newStyleBg, border: `1px solid ${newStyleBorder}` }}>
                                  {newStyleLabel || "Preview"}
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={addCustomStyle} className="text-[9px] px-2 py-0.5 hover:opacity-80" style={{ color: "#4AFF6A", border: "1px solid #1A3A1A" }}>Create</button>
                                  <button onClick={resetNewStyleForm} className="text-[9px] px-2 py-0.5 hover:opacity-80" style={{ color: "#FF6A6A", border: "1px solid #3A1A1A" }}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Content */}
                          <div>
                            <label className="text-[10px] block mb-1" style={S_MUTED}>Content</label>
                            <RichTextEditor value={panel.content} onChange={(html) => updatePanel(panel.id, { content: html })} placeholder="Section content..." minHeight={100} />
                            <div className="flex gap-1 mt-1">
                              <button onClick={() => { setSpoilerInsertTarget(panel.id); setShowSpoilerInsert(true); }} className="text-[9px] px-2 py-1 flex items-center gap-1 hover:opacity-80" style={{ color: "#FF6A6A", border: "1px solid #3A1A1A" }}>
                                <Shield size={8} /> Insert Spoiler Box
                              </button>
                              <button onClick={() => { setLinkInsertTarget(panel.id); setShowLinkDialog(true); }} className="text-[9px] px-2 py-1 flex items-center gap-1 hover:opacity-80" style={{ color: "#FF6ABB", border: "1px solid #3A1A3B" }}>
                                <Link2 size={8} /> Wiki Link
                              </button>
                            </div>
                          </div>
                          {/* Player visibility */}
                          <div>
                            <label className="text-[10px] block mb-1" style={{ color: "#FF6ABB", fontWeight: 600 }}>
                              <Shield size={10} className="inline mr-1" />Player Visibility
                            </label>
                            <div className="text-[9px] mb-2" style={S_MUTED}>
                              {panel.assignedTo.length === 0
                                ? "Visible to all players. Select specific players below to restrict access."
                                : `Restricted to ${panel.assignedTo.length} player${panel.assignedTo.length !== 1 ? "s" : ""}. Others ${vMode === "hidden" ? "cannot see this section" : "see a spoiler overlay"}.`}
                            </div>
                            {/* Visibility Mode selector */}
                            {panel.assignedTo.length > 0 && (
                              <div className="mb-2">
                                <label className="text-[9px] block mb-1" style={S_MUTED}>Restriction Mode</label>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => updatePanel(panel.id, { visibilityMode: "spoiler" })}
                                    className="text-[10px] px-3 py-1.5 flex items-center gap-1.5 flex-1"
                                    style={{
                                      color: vMode === "spoiler" ? "#FF6ABB" : "#5A6A8A",
                                      background: vMode === "spoiler" ? "#1A0A1A" : "transparent",
                                      border: vMode === "spoiler" ? "1px solid #3A1A3B" : "1px solid #1A2A4B",
                                    }}
                                  >
                                    <Lock size={9} /> Spoiler Box
                                  </button>
                                  <button
                                    onClick={() => updatePanel(panel.id, { visibilityMode: "hidden" })}
                                    className="text-[10px] px-3 py-1.5 flex items-center gap-1.5 flex-1"
                                    style={{
                                      color: vMode === "hidden" ? "#FF6A6A" : "#5A6A8A",
                                      background: vMode === "hidden" ? "#1A0A0A" : "transparent",
                                      border: vMode === "hidden" ? "1px solid #3A1A1A" : "1px solid #1A2A4B",
                                    }}
                                  >
                                    <EyeOff size={9} /> Fully Hidden
                                  </button>
                                </div>
                                <div className="text-[8px] mt-1 px-1" style={S_DIM}>
                                  {vMode === "spoiler" ? "Players not in the list see a spoiler overlay they can click to reveal." : "Players not in the list cannot see this section at all."}
                                </div>
                              </div>
                            )}
                            <div className="space-y-1">
                              {players.map((player) => {
                                const selected = panel.assignedTo.includes(player.id);
                                return (
                                  <button
                                    key={player.id}
                                    onClick={() => togglePanelPlayer(panel.id, player.id)}
                                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-[11px] transition-colors hover:bg-[#0A0A30]"
                                    style={{
                                      color: selected ? "#C0D0F0" : "#5A6A8A",
                                      background: selected ? "#0A1A3A" : "transparent",
                                      border: selected ? "1px solid #2A4A6B" : "1px solid transparent",
                                    }}
                                  >
                                    {selected ? <Eye size={10} style={{ color: "#4AFF6A" }} /> : <EyeOff size={10} style={S_DIM} />}
                                    <span style={{ fontWeight: selected ? 600 : 400 }}>{player.name}</span>
                                    <span className="text-[9px] ml-auto" style={S_DIM}>{player.class} Lv{player.level}</span>
                                  </button>
                                );
                              })}
                              <div className="flex items-center gap-2 px-2 py-1.5 text-[11px]" style={{ ...S_RED, opacity: 0.5 }}>
                                <Eye size={10} style={S_RED} />
                                <span>DM</span>
                                <span className="text-[9px] ml-auto" style={S_DIM}>Always visible</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button onClick={() => addPanel()} className={`${retro.button} px-4 py-2 text-[11px] w-full flex items-center justify-center gap-1`} style={S_LINK}>
                  <Plus size={11} /> Add Section
                </button>
              </div>
            )}

            {/* ─── METADATA TAB ─── */}
            {activePanel === "metadata" && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 px-3 py-2 text-[11px]" style={{ background: "#0A1A2A", border: "1px solid #1A3A5B", color: "#7A9ABB" }}>
                  <Tag size={13} className="shrink-0 mt-0.5" style={S_LINK} />
                  <span>Category, tags, article quality, related articles, and references.</span>
                </div>
                {/* Category */}
                <div>
                  <label style={labelStyle}>Category</label>
                  <input type="text" value={page.category} onChange={(e) => update("category", e.target.value)} placeholder="Select or type a category..." className={inputClass} style={inputStyle} list="meta-category-suggestions" />
                  <datalist id="meta-category-suggestions">
                    {allCategories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                  {allCategories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {allCategories.slice(0, 12).map((c) => (
                        <button key={c} onClick={() => update("category", c)} className="text-[9px] px-2 py-0.5 transition-colors hover:opacity-80" style={{ color: page.category === c ? "#C0D0F0" : "#4A5A7A", background: page.category === c ? "#0A1A3A" : "transparent", border: page.category === c ? "1px solid #2A4A6B" : "1px solid #1A2A4B" }}>
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Quality */}
                <div>
                  <label style={labelStyle}>Article Quality</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(["featured", "good", "start", "stub", "draft"] as const).map((q) => {
                      const colors: Record<string, string> = { featured: "#FFD700", good: "#4A9A5A", start: "#4A7BFF", stub: "#FFAA4A", draft: "#5A6A8A" };
                      return (
                        <button key={q} onClick={() => update("articleQuality", q)} className="text-[10px] px-2 py-1" style={{ color: colors[q], background: page.articleQuality === q ? "#0A0A28" : "transparent", border: page.articleQuality === q ? `1px solid ${colors[q]}` : "1px solid #1A2A4B" }}>
                          {q === "featured" && <Star size={8} className="inline mr-0.5" />}{q.charAt(0).toUpperCase() + q.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Tags */}
                <div>
                  <label style={labelStyle}>Tags ({(page.tags || []).length})</label>
                  <div className="flex flex-wrap gap-1 mt-1 mb-2">
                    {(page.tags || []).map((tag) => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 flex items-center gap-1" style={{ color: accent, background: "#0A0A28", border: `1px solid ${accent}33` }}>
                        <Hash size={7} />{tag}
                        <button onClick={() => update("tags", (page.tags || []).filter((t) => t !== tag))} className="hover:opacity-80"><X size={8} /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && tagDraft.trim()) { update("tags", [...new Set([...(page.tags || []), tagDraft.trim()])]); setTagDraft(""); } }}
                      placeholder="Add tag (type or select)..."
                      className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px] flex-1 outline-none`}
                      style={inputStyle}
                      list="meta-tag-suggestions"
                    />
                    <datalist id="meta-tag-suggestions">
                      {allTags.filter((t) => !(page.tags || []).includes(t)).map((t) => <option key={t} value={t} />)}
                    </datalist>
                    <button onClick={() => { if (tagDraft.trim()) { update("tags", [...new Set([...(page.tags || []), tagDraft.trim()])]); setTagDraft(""); } }} className="text-[10px] px-2 hover:opacity-80" style={{ color: accent }}>Add</button>
                  </div>
                  {/* Existing tags from other articles */}
                  {allTags.filter((t) => !(page.tags || []).includes(t)).length > 0 && (
                    <div className="mt-2">
                      <div className="text-[9px] mb-1" style={S_DIM}>Existing tags (click to add):</div>
                      <div className="flex flex-wrap gap-1">
                        {allTags.filter((t) => !(page.tags || []).includes(t)).slice(0, 20).map((tag) => (
                          <button
                            key={tag}
                            onClick={() => update("tags", [...new Set([...(page.tags || []), tag])])}
                            className="text-[8px] px-1.5 py-0.5 hover:opacity-80 transition-colors"
                            style={{ color: "#4A5A7A", border: "1px solid #1A2A3B" }}
                          >
                            + {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* Wiki Tags (from DM tag system) */}
                <div>
                  <label style={labelStyle}>Wiki Tags ({(page.wikiTags || []).length})</label>
                  <div className="text-[9px] mb-1" style={S_DIM}>Structured tags from the DM tag system with custom fields</div>
                  <div className="flex flex-wrap gap-1 mt-1 mb-2">
                    {(page.wikiTags || []).map((tagName) => {
                      const def = wikiTagDefs.find((d) => d.name === tagName);
                      return (
                        <span key={tagName} className="text-[10px] px-2 py-0.5 flex items-center gap-1" style={{ color: "#9A7ABB", background: "#1A0A2A", border: "1px solid #2A1A4B" }}>
                          <BookOpen size={7} />{tagName}
                          {def && def.fields.length > 0 && <span className="text-[8px]" style={{ color: "#6A4A8A" }}>({def.fields.length})</span>}
                          <button onClick={() => {
                            const next = (page.wikiTags || []).filter((t) => t !== tagName);
                            update("wikiTags", next);
                            const nextFields = { ...(page.wikiTagFields || {}) };
                            Object.keys(nextFields).forEach((k) => { if (k.startsWith(tagName + "::")) delete nextFields[k]; });
                            update("wikiTagFields", nextFields);
                          }} className="hover:opacity-80"><X size={8} /></button>
                        </span>
                      );
                    })}
                  </div>
                  {wikiTagDefs.length > 0 ? (
                    <select
                      onChange={(e) => {
                        if (e.target.value && !(page.wikiTags || []).includes(e.target.value)) {
                          update("wikiTags", [...(page.wikiTags || []), e.target.value]);
                        }
                        e.target.value = "";
                      }}
                      className="text-[10px] bg-[#0A0A28] px-2 py-1 w-full outline-none cursor-pointer"
                      style={{ color: "#9A7ABB", border: "1px solid #2A1A4B" }}
                    >
                      <option value="">+ Add wiki tag...</option>
                      {wikiTagDefs.filter((d) => !(page.wikiTags || []).includes(d.name)).map((d) => (
                        <option key={d.id} value={d.name}>{d.name} — {d.description.slice(0, 50)}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-[9px]" style={S_DIM}>No wiki tags defined. Create them in DM Area &gt; Manage Tags &gt; Wiki Tags.</div>
                  )}
                  {/* Custom field values for applied wiki tags */}
                  {(page.wikiTags || []).map((tagName) => {
                    const def = wikiTagDefs.find((d) => d.name === tagName);
                    if (!def || def.fields.length === 0) return null;
                    return (
                      <div key={tagName} className="mt-3 p-2" style={{ background: "#0A0A20", border: "1px solid #1A1A3B" }}>
                        <div className="text-[10px] mb-2 flex items-center gap-1" style={{ color: "#9A7ABB", fontWeight: 600 }}>
                          <BookOpen size={9} /> {tagName} Fields
                        </div>
                        {def.fields.map((f) => {
                          const fieldKey = `${tagName}::${f.name}`;
                          const val = (page.wikiTagFields || {})[fieldKey] || "";
                          const fieldDef: TagFieldDef = {
                            id: f.id,
                            name: f.name,
                            type: (f.type as TagFieldDef["type"]) || "text",
                            options: f.options,
                            placeholder: f.placeholder,
                            required: f.required,
                            min: f.min,
                            max: f.max,
                            defaultValue: f.defaultValue,
                            allowCustom: f.allowCustom,
                          };
                          const labelEl = (
                            <label className="text-[9px] block mb-0.5" style={S_MUTED}>{f.name}</label>
                          );
                          return (
                            <div key={f.id} className="mb-1.5">
                              {renderTypedField(
                                fieldKey,
                                fieldDef,
                                val,
                                (key, v) => update("wikiTagFields", { ...(page.wikiTagFields || {}), [key]: v }),
                                labelEl,
                                `${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[10px] w-full outline-none`,
                                { color: "#C0D0F0" },
                                `${retro.button} px-2 py-1 text-[9px]`,
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                {/* ─── Player Visibility ─── */}
                <div>
                  <label style={labelStyle}>Article Visibility (per player)</label>
                  <div className="text-[9px] mb-2" style={S_DIM}>
                    Control which players can see this article. Visible = full access, Spoiler = metagame warning overlay, Hidden = completely invisible.
                  </div>
                  <div className="space-y-1.5">
                    {players.map((p) => {
                      const vis = (page.playerVisibility || {})[p.id] || "visible";
                      const visColors: Record<string, { c: string; bg: string; bc: string }> = {
                        visible: { c: "#4AFF6A", bg: "#0A1A0A", bc: "#1A3A1A" },
                        spoiler: { c: "#FFAA4A", bg: "#1A1A0A", bc: "#3A3A1A" },
                        hidden: { c: "#FF6A6A", bg: "#1A0A0A", bc: "#3A1A1A" },
                      };
                      return (
                        <div key={p.id} className="flex items-center gap-2">
                          <span className="text-[10px] flex-1 truncate" style={S_SUBTLE}>
                            {p.name} <span className="text-[8px]" style={S_DIM}>({p.class})</span>
                          </span>
                          <div className="flex gap-0.5">
                            {(["visible", "spoiler", "hidden"] as const).map((mode) => {
                              const active = vis === mode;
                              const vc = visColors[mode];
                              const icons: Record<string, React.ReactNode> = {
                                visible: <Eye size={8} />,
                                spoiler: <Shield size={8} />,
                                hidden: <EyeOff size={8} />,
                              };
                              return (
                                <button
                                  key={mode}
                                  onClick={() => {
                                    const next = { ...(page.playerVisibility || {}) };
                                    if (mode === "visible") { delete next[p.id]; } else { next[p.id] = mode; }
                                    update("playerVisibility", next);
                                  }}
                                  className="text-[8px] px-1.5 py-0.5 flex items-center gap-0.5 transition-colors"
                                  style={{
                                    color: active ? vc.c : "#3A4A6A",
                                    background: active ? vc.bg : "transparent",
                                    border: `1px solid ${active ? vc.bc : "#1A2A3B"}`,
                                    fontWeight: active ? 600 : 400,
                                  }}
                                  title={mode.charAt(0).toUpperCase() + mode.slice(1)}
                                >
                                  {icons[mode]} {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {players.length === 0 && (
                    <div className="text-[9px]" style={S_DIM}>No players found. Add players in DM Area first.</div>
                  )}
                  {/* Quick-set all buttons */}
                  {players.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      <button
                        onClick={() => update("playerVisibility", {})}
                        className="text-[8px] px-2 py-0.5 hover:opacity-80"
                        style={{ color: "#4AFF6A", border: "1px solid #1A3A1A" }}
                      >All Visible</button>
                      <button
                        onClick={() => {
                          const next: Record<string, "visible" | "spoiler" | "hidden"> = {};
                          players.forEach((p) => { next[p.id] = "spoiler"; });
                          update("playerVisibility", next);
                        }}
                        className="text-[8px] px-2 py-0.5 hover:opacity-80"
                        style={{ color: "#FFAA4A", border: "1px solid #3A3A1A" }}
                      >All Spoiler</button>
                      <button
                        onClick={() => {
                          const next: Record<string, "visible" | "spoiler" | "hidden"> = {};
                          players.forEach((p) => { next[p.id] = "hidden"; });
                          update("playerVisibility", next);
                        }}
                        className="text-[8px] px-2 py-0.5 hover:opacity-80"
                        style={{ color: "#FF6A6A", border: "1px solid #3A1A1A" }}
                      >All Hidden</button>
                    </div>
                  )}
                </div>
                {/* See Also */}
                <div>
                  <label style={labelStyle}>See Also</label>
                  <div className="space-y-1 mt-1">
                    {(page.seeAlso || []).map((saId) => {
                      const linked = allPages.find((p) => p.id === saId);
                      return (
                        <div key={saId} className="flex items-center gap-2 text-[11px]" style={S_LINK}>
                          <FileText size={9} /> {linked?.title || saId}
                          <button onClick={() => update("seeAlso", (page.seeAlso || []).filter((s) => s !== saId))} className="ml-auto hover:opacity-80"><X size={9} style={S_RED} /></button>
                        </div>
                      );
                    })}
                    <select onChange={(e) => { if (e.target.value) { update("seeAlso", [...(page.seeAlso || []), e.target.value]); e.target.value = ""; } }} className="text-[10px] bg-[#0A0A28] px-2 py-1 w-full outline-none mt-1" style={{ color: "#6A9AFF", border: "1px solid #1A2A4B" }}>
                      <option value="">+ Add related article...</option>
                      {allPages.filter((p) => p.id !== page.id && !(page.seeAlso || []).includes(p.id)).map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Related Articles */}
                <div>
                  <label style={labelStyle}>Related Articles</label>
                  <div className="text-[9px] mb-1" style={{ color: mutedText }}>Bidirectional links shown on the Interlink Graph (orange edges)</div>
                  <div className="space-y-1 mt-1">
                    {(page.relatedArticleIds || []).map((raId) => {
                      const linked = allPages.find((p) => p.id === raId);
                      return (
                        <div key={raId} className="flex items-center gap-2 text-[11px]" style={S_WARN}>
                          <Network size={9} /> {linked?.title || raId}
                          <button onClick={() => update("relatedArticleIds", (page.relatedArticleIds || []).filter((s) => s !== raId))} className="ml-auto hover:opacity-80"><X size={9} style={S_RED} /></button>
                        </div>
                      );
                    })}
                    <select onChange={(e) => { if (e.target.value) { update("relatedArticleIds", [...(page.relatedArticleIds || []), e.target.value]); e.target.value = ""; } }} className="text-[10px] bg-[#0A0A28] px-2 py-1 w-full outline-none mt-1" style={{ color: "#FFAA4A", border: "1px solid #1A2A4B" }}>
                      <option value="">+ Add related article...</option>
                      {allPages.filter((p) => p.id !== page.id && !(page.relatedArticleIds || []).includes(p.id)).map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* References */}
                <div>
                  <label style={labelStyle}>References</label>
                  <div className="space-y-1 mt-1">
                    {(page.references || []).map((ref, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px]" style={{ color: txt }}>
                        <span className="text-[9px]" style={{ color: mutedText }}>[{idx + 1}]</span>
                        <input type="text" value={ref} onChange={(e) => { const next = [...(page.references || [])]; next[idx] = e.target.value; update("references", next); }} className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[10px] flex-1 outline-none`} style={inputStyle} />
                        <button onClick={() => update("references", (page.references || []).filter((_, i) => i !== idx))} className="hover:opacity-80"><X size={9} style={S_RED} /></button>
                      </div>
                    ))}
                    <button onClick={() => update("references", [...(page.references || []), ""])} className="text-[10px] flex items-center gap-1 mt-1 hover:opacity-80" style={S_ACCENT}>
                      <Plus size={9} /> Add Reference
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ─── APPEARANCE TAB ─── */}
            {activePanel === "appearance" && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 px-3 py-2 text-[11px]" style={{ background: "#0A1A2A", border: "1px solid #1A3A5B", color: "#7A9ABB" }}>
                  <Palette size={13} className="shrink-0 mt-0.5" style={S_GREEN_BTN} />
                  <span>Customize colors, fonts, and visual style of this article.</span>
                </div>
                {/* Colors */}
                {([
                  { key: "bgColor" as const, label: "Background", val: page.bgColor },
                  { key: "headerColor" as const, label: "Header / Sidebar", val: page.headerColor },
                  { key: "accentColor" as const, label: "Accent / Links", val: page.accentColor },
                  { key: "textColor" as const, label: "Text", val: page.textColor },
                ]).map((c) => (
                  <div key={c.key} className="flex items-center gap-3">
                    <input type="color" value={c.val || DEFAULT_STYLE[c.key as keyof typeof DEFAULT_STYLE] || "#000000"} onChange={(e) => update(c.key, e.target.value)} className={`${retro.sunken} bg-[#0A0A28] w-10 h-8 cursor-pointer border-0 p-0`} />
                    <div>
                      <div className="text-[11px]" style={S_SUBTLE}>{c.label}</div>
                      <div className="text-[9px]" style={S_DIM}>{c.val}</div>
                    </div>
                  </div>
                ))}
                {/* Font */}
                <div>
                  <label style={labelStyle}>Font Family</label>
                  <select value={page.fontFamily} onChange={(e) => update("fontFamily", e.target.value)} className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] w-full outline-none cursor-pointer`} style={inputStyle}>
                    {PAGE_FONTS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                {/* Header align */}
                <div>
                  <label style={labelStyle}>Header Alignment</label>
                  <div className="flex gap-2 mt-1">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button key={a} onClick={() => update("headerAlign", a)} className="text-[10px] px-3 py-1" style={{ color: page.headerAlign === a ? "#C0D0F0" : "#5A6A8A", background: page.headerAlign === a ? "#1A1A5B" : "transparent", border: page.headerAlign === a ? `1px solid ${accent}` : "1px solid #1A2A4B" }}>
                        {a.charAt(0).toUpperCase() + a.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Reset button */}
                <button onClick={() => { update("bgColor", DEFAULT_STYLE.bgColor); update("headerColor", DEFAULT_STYLE.headerColor); update("accentColor", DEFAULT_STYLE.accentColor); update("textColor", DEFAULT_STYLE.textColor); update("fontFamily", DEFAULT_STYLE.fontFamily); }} className="text-[10px] px-3 py-1.5 hover:opacity-80" style={{ color: "#FF8A6A", border: "1px solid #3A1A1A" }}>
                  Reset to Defaults
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Right side: Live wiki preview ─── */}
        <div className="flex-1 min-w-0 overflow-y-auto" style={{ background: darken(bg, 15) }}>
          {/* Preview toolbar */}
          <div className="flex items-center justify-between px-4 py-1.5 border-b" style={{ background: "#0A0A30", borderBottomColor: "#1A1A4B" }}>
            <div className="flex items-center gap-2">
              <Eye size={11} style={S_MUTED} />
              <span className="text-[10px]" style={S_MUTED}>LIVE PREVIEW</span>
              {previewAsPlayerId && previewPlayer && (
                <span className="text-[9px] px-2 py-0.5" style={{ color: "#FF6ABB", background: "#1A0A1A", border: "1px solid #3A1A3B" }}>
                  Viewing as: {previewPlayer.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Users size={10} style={S_MUTED} />
              <select
                value={previewAsPlayerId || ""}
                onChange={(e) => {
                  setPreviewAsPlayerId(e.target.value || null);
                  setRevealedPanels(new Set());
                }}
                className="text-[10px] bg-[#0A0A28] px-2 py-1 outline-none cursor-pointer"
                style={{ color: previewAsPlayerId ? "#FF6ABB" : "#5A6A8A", border: "1px solid #1A2A4B", minWidth: 130 }}
              >
                <option value="">👁️ DM View (see all)</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>👤 {p.name} ({p.class} Lv{p.level})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Breadcrumb */}
          <div className="px-4 py-1.5 flex items-center gap-1.5 border-b text-[11px]" style={{ background: "#0A0A30", borderBottomColor: "#1A1A4B" }}>
            <span style={{ color: accent }}>Wiki</span>
            <ChevronRight size={9} style={S_DIM} />
            <span style={{ color: accent }}>{page.category || "Uncategorized"}</span>
            <ChevronRight size={9} style={S_DIM} />
            <span style={S_SUBTLE}>{page.title || "Untitled"}</span>
          </div>

          {/* Article-level visibility check (preview mode) */}
          {(() => {
            if (!previewAsPlayerId) return null;
            const vis = (page.playerVisibility || {})[previewAsPlayerId] || "visible";
            if (vis === "hidden") {
              return (
                <div className="flex-1 flex flex-col items-center justify-center px-8 py-20" style={{ background: bg }}>
                  <EyeOff size={40} style={{ color: "#2A3A5B", marginBottom: 16 }} />
                  <div className="text-[16px] mb-2" style={{ color: "#FF6A6A", fontWeight: 600 }}>Article Not Available</div>
                  <div className="text-[12px] text-center max-w-[400px]" style={S_MUTED}>
                    This article is hidden from {previewPlayer?.name || "this player"}. They cannot see or access it.
                  </div>
                  <div className="text-[9px] mt-4 px-3 py-1" style={{ color: "#3A4A6A", border: "1px solid #1A2A3B" }}>
                    Switch to DM View to see full content
                  </div>
                </div>
              );
            }
            if (vis === "spoiler" && !revealedPanels.has("article-spoiler-gate")) {
              return (
                <div className="flex-1 flex flex-col items-center justify-center px-8 py-20" style={{ background: bg }}>
                  <Shield size={40} style={{ color: "#FF6A6A", marginBottom: 16 }} />
                  <div className="text-[16px] mb-2" style={{ color: "#FF6A6A", fontWeight: 700 }}>Spoiler / Metagame Warning</div>
                  <div className="text-[12px] text-center max-w-[400px] mb-4" style={{ color: "#8A5A5A" }}>
                    This article contains information that may not be intended for {previewPlayer?.name || "this player"}'s character.
                  </div>
                  <button
                    onClick={() => setRevealedPanels((prev) => new Set([...prev, "article-spoiler-gate"]))}
                    className="px-6 py-2 text-[12px] flex items-center gap-2 hover:opacity-90"
                    style={{ color: "#FF8A6A", background: "#1A0A0A", border: "1px solid #5A2A2A", fontWeight: 600 }}
                  >
                    <Eye size={12} /> Proceed Anyway
                  </button>
                </div>
              );
            }
            return null;
          })()}

          {(() => {
            const articleBlocked = previewAsPlayerId && (() => {
              const vis = (page.playerVisibility || {})[previewAsPlayerId] || "visible";
              return vis === "hidden" || (vis === "spoiler" && !revealedPanels.has("article-spoiler-gate"));
            })();
            if (articleBlocked) return null;
            return (<div style={DISPLAY_CONTENTS}>
          {page.disambiguationNote && (
            <div className="px-4 py-2 flex items-start gap-2" style={{ background: darken(hdr, 5), borderBottom: `1px solid ${borderColor}` }}>
              <Info size={14} className="shrink-0 mt-0.5" style={{ color: accent }} />
              <span className="text-[12px] italic" style={{ color: mutedText, fontFamily: font }}>{page.disambiguationNote}</span>
            </div>
          )}

          {/* Spoiler reveal banner (when a spoiler-gated article is revealed) */}
          {previewAsPlayerId && (page.playerVisibility || {})[previewAsPlayerId] === "spoiler" && revealedPanels.has("article-spoiler-gate") && (
            <div className="px-4 py-2 flex items-center gap-2" style={{ background: "#1A0A0A", borderBottom: "1px solid #3A1A1A" }}>
              <AlertTriangle size={12} style={{ color: "#FF8A6A" }} />
              <span className="text-[11px]" style={{ color: "#FF8A6A" }}>You chose to view this article. Its contents may not be intended for your character.</span>
            </div>
          )}

          {/* Quality banner */}
          {(page.articleQuality === "featured" || page.articleQuality === "good") && (
            <div className="px-4 py-1.5 flex items-center justify-center gap-2" style={{ background: page.articleQuality === "featured" ? "#1A1A0A" : "#0A1A0A", borderBottom: `1px solid ${page.articleQuality === "featured" ? "#3A3A1A" : "#1A3A1A"}` }}>
              <Star size={12} style={{ color: page.articleQuality === "featured" ? "#FFD700" : "#4A9A5A" }} />
              <span className="text-[11px] tracking-wide" style={{ color: page.articleQuality === "featured" ? "#FFD700" : "#4A9A5A", fontWeight: 600 }}>
                {page.articleQuality === "featured" ? "FEATURED ARTICLE" : "GOOD ARTICLE"}
              </span>
              <Star size={12} style={{ color: page.articleQuality === "featured" ? "#FFD700" : "#4A9A5A" }} />
            </div>
          )}

          {/* Under construction */}
          {page.underConstruction && (
            <div className="px-4 py-2 flex items-center justify-center gap-2" style={{ background: "#2A1A00", borderBottom: "2px solid #5A3A00" }}>
              <AlertTriangle size={14} style={S_WARN} />
              <span className="text-[12px] tracking-wider" style={{ color: "#FFCC44", fontWeight: 600, fontFamily: font }}>THIS ARTICLE IS A STUB</span>
              <AlertTriangle size={14} style={S_WARN} />
            </div>
          )}

          {/* Marquee */}
          {page.marqueeText && (
            <div className="overflow-hidden py-1" style={{ background: darken(hdr, 10), borderBottom: `1px solid ${borderColor}` }}>
              <div className="animate-marquee-editor whitespace-nowrap text-[12px] tracking-wide" style={{ color: accent, fontWeight: 600, fontFamily: font }}>
                <span className="inline-block px-8">{page.marqueeText}</span>
                <span className="inline-block px-8">{page.marqueeText}</span>
                <span className="inline-block px-8">{page.marqueeText}</span>
              </div>
              <style>{`@keyframes marqueeE { 0% { transform: translateX(0); } 100% { transform: translateX(-33.33%); } } .animate-marquee-editor { animation: marqueeE 12s linear infinite; }`}</style>
            </div>
          )}

          {/* ═══ Article Content ═══ */}
          <div className="px-4 py-6" style={{ background: bg }}>
            <div className="max-w-[900px] mx-auto">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Sidebar */}
                <div className="w-full md:w-[220px] shrink-0 order-2 md:order-1">
                  {/* Article info box */}
                  <div className={`${retro.raised} mb-4`} style={{ background: hdr }}>
                    <div className="px-3 py-2 border-b text-center" style={{ borderBottomColor: borderColor, background: darken(hdr, 8) }}>
                      <span className="text-[12px]" style={{ color: accent, fontWeight: 600 }}>Article Info</span>
                    </div>
                    <div className="p-3 space-y-2">
                      <div>
                        <span className="text-[9px] uppercase tracking-wider" style={{ color: mutedText }}>Category</span>
                        <div className="text-[11px] mt-0.5" style={{ color: accent }}>{page.category || "Uncategorized"}</div>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase tracking-wider" style={{ color: mutedText }}>Last Updated</span>
                        <div className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: txt }}><Clock size={9} style={{ color: mutedText }} />{page.dateAdded}</div>
                      </div>
                      {page.articleQuality && (
                        <div>
                          <span className="text-[9px] uppercase tracking-wider" style={{ color: mutedText }}>Quality</span>
                          <div className="text-[11px] mt-0.5" style={{ color: page.articleQuality === "featured" ? "#FFD700" : page.articleQuality === "good" ? "#4A9A5A" : txt }}>
                            {page.articleQuality.charAt(0).toUpperCase() + page.articleQuality.slice(1)}
                          </div>
                        </div>
                      )}
                      {(page.tags || []).length > 0 && (
                        <div>
                          <span className="text-[9px] uppercase tracking-wider" style={{ color: mutedText }}>Tags</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {(page.tags || []).map((tag) => (
                              <span key={tag} className="text-[9px] px-1.5" style={{ color: accent, background: darken(hdr, 5), border: `1px solid ${borderColor}` }}>{tag}</span>
                            ))}
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
                    </div>
                  </div>

                  {/* Infobox */}
                  {(page.infobox || []).length > 0 && (
                    <div className={`${retro.raised} mb-4`} style={{ background: hdr }}>
                      <div className="px-3 py-2 border-b text-center" style={{ borderBottomColor: borderColor, background: darken(hdr, 8) }}>
                        <span className="text-[12px]" style={{ color: accent, fontWeight: 600 }}>{page.title || "Infobox"}</span>
                      </div>
                      <div className="p-2">
                        {(page.infobox || []).map((row, idx) => (
                          <div key={idx} className="flex py-1.5 px-1" style={{ borderBottom: idx < (page.infobox || []).length - 1 ? `1px solid ${darken(borderColor, 10)}` : "none" }}>
                            <span className="text-[10px] shrink-0" style={{ color: accent, fontWeight: 600, width: 80 }}>{row.label}</span>
                            <span className="text-[10px] flex-1" style={{ color: txt }}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TOC */}
                  {tocItems.length > 1 && (
                    <div className={`${retro.raised} mb-4`} style={{ background: hdr }}>
                      <div className="px-3 py-2 border-b" style={{ borderBottomColor: borderColor, background: darken(hdr, 8) }}>
                        <span className="text-[12px]" style={{ color: accent, fontWeight: 600 }}>Contents</span>
                      </div>
                      <div className="p-2">
                        {tocItems.map((item, idx) => (
                          <div key={item.id} className="flex items-start gap-1.5 px-2 py-1 text-[11px]" style={{ color: accent }}>
                            <span style={{ color: mutedText, fontFamily: "'Courier New', monospace", fontSize: 9 }}>{idx + 1}.</span>
                            <span>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Subcategories */}
                  {(page.subcategories || []).length > 0 && (
                    <div className={`${retro.raised} mb-4`} style={{ background: hdr }}>
                      <div className="px-3 py-2 border-b" style={{ borderBottomColor: borderColor, background: darken(hdr, 8) }}>
                        <span className="text-[12px] flex items-center gap-1.5" style={{ color: accent, fontWeight: 600 }}><FolderOpen size={11} /> Subcategories</span>
                      </div>
                      <div className="py-2">
                        {(page.subcategories || []).map((sc) => (
                          <div key={sc.id} className="flex items-center gap-1.5 px-3 py-1 text-[11px]" style={{ color: sc.type === "folder" ? mutedText : accent }}>
                            <span style={{ fontSize: 10 }}>{sc.type === "folder" ? "📁" : "📄"}</span>
                            <span>{sc.name || (sc.type === "folder" ? "Unnamed" : "Unlinked")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Main article body */}
                <div className="flex-1 min-w-0 order-1 md:order-2">
                  {/* Article header */}
                  <div className="mb-4 border-b-2 pb-4" style={{ borderBottomColor: borderColor }}>
                    <div className="flex items-start gap-3">
                      {iconMode === "custom" && page.pageIconUrl ? (
                        <img src={page.pageIconUrl} alt="" className="shrink-0 mt-1 object-contain" style={{ width: 28, height: 28 }} />
                      ) : iconMode !== "none" ? (
                        <PageIcon size={28} style={{ color: accent }} className="shrink-0 mt-1" />
                      ) : null}
                      <div className="flex-1">
                        <InlineEdit
                          value={page.title}
                          onChange={(v) => { update("title", v); if (!urlManuallyEdited.current) update("url", toSlug(v)); setError(""); }}
                          placeholder="Article Title"
                          tag="h1"
                          style={{ color: txt, fontWeight: 700, fontFamily: font, fontSize: 24 }}
                        />
                        {(page.subtitle || activePanel === "preview") && (
                          <InlineEdit
                            value={page.subtitle}
                            onChange={(v) => update("subtitle", v)}
                            placeholder="Add a subtitle..."
                            tag="p"
                            style={{ color: mutedText, fontFamily: font, fontSize: 14, fontStyle: "italic", marginTop: 4 }}
                          />
                        )}
                      </div>
                    </div>
                    <InlineEdit
                      value={page.description}
                      onChange={(v) => { update("description", v); setError(""); }}
                      placeholder="Add a lead paragraph / description..."
                      tag="p"
                      style={{ color: txt, fontFamily: font, fontSize: 13, lineHeight: 1.6, marginTop: 12 }}
                      multiline
                    />
                  </div>

                  {/* Main body */}
                  {hasBody && (
                    <div id="article-body" className="mb-6">
                      {(page.bodyTitle || page.bodySubtitle) && (
                        <div className="mb-3 pb-2" style={{ borderBottom: page.showDividers ? `1px solid ${borderColor}` : "none" }}>
                          {page.bodyTitle && (
                            <h2 className="text-[18px]" style={{ color: accent, fontWeight: 600, fontFamily: font }}>{page.bodyTitle}</h2>
                          )}
                          {page.bodySubtitle && (
                            <p className="text-[12px] italic mt-0.5" style={{ color: mutedText, fontFamily: font }}>{page.bodySubtitle}</p>
                          )}
                        </div>
                      )}
                      <RenderFormattedText text={bodyParagraphs} color={txt} font={font} currentPlayerId={previewAsPlayerId || undefined} isDM={!previewAsPlayerId} />
                    </div>
                  )}

                  {/* ═══ Unified Sections/Panels ═══ */}
                  {panels.length > 0 && panels.map((panel, idx) => {
                    if (!panel.title && !panel.content) return null;
                    const ps = allPanelStyles.find((s) => s.id === panel.style) || allPanelStyles[0];
                    const hasRestriction = panel.assignedTo && panel.assignedTo.length > 0;
                    const vMode = panel.visibilityMode || "spoiler";
                    const isPlayerAllowed = !hasRestriction || !previewAsPlayerId || panel.assignedTo.includes(previewAsPlayerId);
                    const isRevealed = revealedPanels.has(panel.id);
                    const isBlank = panel.style === "blank";

                    // Hidden mode: completely invisible to restricted players
                    if (hasRestriction && vMode === "hidden" && previewAsPlayerId && !isPlayerAllowed) {
                      return null;
                    }

                    const showContent = !previewAsPlayerId || isPlayerAllowed || isRevealed;
                    const showDivider = page.showDividers && (hasBody || idx > 0);

                    return (
                      <div key={panel.id} id={`panel-${panel.id}`} className="mb-6">
                        {isBlank ? (
                          <div style={DISPLAY_CONTENTS}>
                            {showDivider && (
                              <div className="mb-4" style={{ height: 1, background: `linear-gradient(90deg, ${borderColor}, ${accent}44, ${borderColor})` }} />
                            )}
                            {showContent ? (
                              <div style={DISPLAY_CONTENTS}>
                                {panel.title && (
                                  <div className="mb-3 pb-1" style={{ borderBottom: page.showDividers ? `1px solid ${borderColor}` : "none" }}>
                                    <h2 className="text-[18px]" style={{ color: accent, fontWeight: 600, fontFamily: font }}>{panel.title}</h2>
                                    {panel.subtitle && (
                                      <p className="text-[11px] italic mt-0.5" style={{ color: mutedText, fontFamily: font }}>{panel.subtitle}</p>
                                    )}
                                  </div>
                                )}
                                {hasRestriction && !previewAsPlayerId && (
                                  <div className="flex items-center gap-1 mb-2 text-[9px]" style={{ color: "#FF6ABB" }}>
                                    <Lock size={8} /> Restricted: {panel.assignedTo.map((pid) => players.find((p) => p.id === pid)?.name || "?").join(", ")}
                                  </div>
                                )}
                                {!isPlayerAllowed && isRevealed && (
                                  <div className="flex items-center gap-2 px-3 py-1.5 mb-3 text-[10px]" style={{ background: "#1A0A0A", border: "1px solid #3A1A1A", color: "#FF8A6A" }}>
                                    <AlertTriangle size={10} />
                                    <span>You chose to reveal this section. This content may not be intended for your character.</span>
                                  </div>
                                )}
                                {panel.content && (
                                  <RenderFormattedText text={panel.content} color={txt} font={font} currentPlayerId={previewAsPlayerId || undefined} isDM={!previewAsPlayerId} sectionRevealed={showContent} />
                                )}
                                {!panel.content && !panel.title && (
                                  <span className="text-[12px] italic" style={{ color: mutedText }}>Empty section. Edit in the Content tab.</span>
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
                                        <div className="text-[10px] mt-0.5" style={{ color: "#8A5A5A", fontFamily: font }}>Not intended for {previewPlayer?.name || "this player"}'s character.</div>
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
                            <div className="px-4 py-2 flex flex-col gap-0.5 border-b" style={{ borderBottomColor: ps.border, background: ps.bg === "transparent" ? "transparent" : darken(ps.bg, 5) }}>
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] flex-1" style={{ color: ps.accent, fontWeight: 600, fontFamily: font }}>{panel.title || "Untitled Section"}</span>
                                {hasRestriction && (
                                  <span className="text-[9px] px-2 py-0.5 flex items-center gap-1" style={{ color: vMode === "hidden" ? "#FF6A6A" : "#FF6ABB", background: "#1A0A1A", border: "1px solid #3A1A3B" }}>
                                    {vMode === "hidden" ? <EyeOff size={8} /> : <Lock size={8} />}
                                    {!previewAsPlayerId
                                      ? panel.assignedTo.map((pid) => players.find((p) => p.id === pid)?.name || "?").join(", ")
                                      : vMode === "hidden" ? "Hidden" : "Restricted"
                                    }
                                  </span>
                                )}
                              </div>
                              {panel.subtitle && (
                                <span className="text-[10px]" style={{ color: ps.accent, opacity: 0.6, fontFamily: font }}>{panel.subtitle}</span>
                              )}
                            </div>
                            {showContent ? (
                              <div className="px-4 py-3">
                                {!isPlayerAllowed && isRevealed && (
                                  <div className="flex items-center gap-2 px-3 py-1.5 mb-3 text-[10px]" style={{ background: "#1A0A0A", border: "1px solid #3A1A1A", color: "#FF8A6A" }}>
                                    <AlertTriangle size={10} />
                                    <span>You chose to reveal this section. This content may not be intended for your character.</span>
                                  </div>
                                )}
                                {panel.content ? (
                                  <RenderFormattedText text={panel.content} color={txt} font={font} currentPlayerId={previewAsPlayerId || undefined} isDM={!previewAsPlayerId} sectionRevealed={showContent} />
                                ) : (
                                  <span className="text-[12px] italic" style={{ color: mutedText }}>No content yet. Edit in the Content tab.</span>
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
                                      <div className="text-[13px]" style={{ ...S_RED, fontWeight: 700, fontFamily: font }}>Spoiler / Metagame Warning</div>
                                      <div className="text-[11px] mt-0.5" style={{ color: "#8A5A5A", fontFamily: font }}>This section contains information not intended for {previewPlayer?.name || "this player"}'s character.</div>
                                    </div>
                                  </div>
                                  <button onClick={() => setRevealedPanels((prev) => new Set([...prev, panel.id]))} className="px-5 py-2 text-[12px] flex items-center gap-2 hover:opacity-90" style={{ color: "#FF8A6A", background: "#1A0A0A", border: "1px solid #5A2A2A", fontWeight: 600, fontFamily: font }}>
                                    <Eye size={12} /> Show Anyway
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* No content */}
                  {!hasContent && panels.length === 0 && (
                    <div className="p-8 text-center border-2" style={{ background: bg, borderColor }}>
                      <span className="text-[13px]" style={{ color: mutedText, fontFamily: font }}>
                        This article has no content yet. Use the sidebar to add content.
                      </span>
                    </div>
                  )}

                  {/* Wiki Tag Custom Fields */}
                  {(() => {
                    const appliedTags = (page.wikiTags || []).map((name) => ({
                      name,
                      def: wikiTagDefs.find((d) => d.name === name),
                    })).filter((t) => t.def && t.def.fields.length > 0);
                    const fields = page.wikiTagFields || {};
                    const hasAnyValue = appliedTags.some((t) => t.def!.fields.some((f) => fields[`${t.name}::${f.name}`]));
                    if (appliedTags.length === 0 || !hasAnyValue) return null;
                    return (
                      <div className="mb-6">
                        {page.showDividers && (
                          <div className="mb-4" style={{ height: 1, background: `linear-gradient(90deg, ${borderColor}, ${accent}44, ${borderColor})` }} />
                        )}
                        <h2 className="text-[16px] mb-3 pb-1" style={{ color: accent, fontWeight: 600, fontFamily: font, borderBottom: page.showDividers ? `1px solid ${borderColor}` : "none" }}>
                          Article Properties
                        </h2>
                        <div className="space-y-2">
                          {appliedTags.map((t) => {
                            const filledFields = t.def!.fields.filter((f) => fields[`${t.name}::${f.name}`]);
                            if (filledFields.length === 0) return null;
                            return (
                              <div key={t.name} className="flex flex-wrap gap-x-6 gap-y-1">
                                <span className="text-[11px] w-full mb-0.5" style={{ color: "#9A7ABB", fontWeight: 600, fontFamily: font }}>{t.name}</span>
                                {filledFields.map((f) => (
                                  <div key={f.id} className="flex items-baseline gap-1.5">
                                    <span className="text-[10px]" style={{ color: mutedText }}>{f.name}:</span>
                                    <span className="text-[11px]" style={{ color: txt }}>{fields[`${t.name}::${f.name}`]}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Footer */}
                  <div className="text-center mt-8 pb-4">
                    {page.showDividers && (
                      <div className="mb-4 mx-auto max-w-[300px]" style={{ height: 1, background: `linear-gradient(90deg, transparent, ${borderColor}, transparent)` }} />
                    )}
                    {page.footerText ? (
                      <span className="text-[10px]" style={{ color: mutedText, fontFamily: font }}>{page.footerText}</span>
                    ) : (
                      <span className="text-[10px]" style={{ color: mutedText }}>
                        I-Net Wiki &middot; Category: {page.category || "Uncategorized"} &middot; Last updated: {page.dateAdded}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>);
          })()}
        </div>
      </div>

      {/* ═══ Modals ═══ */}

      {/* Draft restore prompt */}
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

      {/* Template Picker */}
      <TemplatePickerModal
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={applyTemplate}
        onManage={() => { setShowTemplatePicker(false); setShowTemplateManager(true); }}
      />

      {/* Template Manager */}
      <TemplateManagerModal
        open={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
      />

      {/* Wiki Link Dialog */}
      <WikiLinkDialog
        open={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onInsert={handleInsertWikiLink}
        allPages={allPages}
        currentPageId={page.id}
      />

      {/* Spoiler Box Insert Dialog */}
      {showSpoilerInsert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowSpoilerInsert(false); }}>
          <div className="w-[450px]" style={{ background: "#0C0C2E", border: "2px solid #2A2A5B" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b-2" style={{ borderBottomColor: "#1A1A4B", background: "#0E0E35" }}>
              <div className="flex items-center gap-2">
                <Shield size={14} style={S_RED} />
                <span className="text-[13px]" style={{ ...S_TEXT, fontWeight: 600 }}>Insert Spoiler Box</span>
              </div>
              <button onClick={() => setShowSpoilerInsert(false)} className="hover:opacity-80"><X size={14} style={S_MUTED} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-[10px] px-3 py-2" style={{ background: "#0A1A2A", border: "1px solid #1A3A5B", color: "#7A9ABB" }}>
                Insert an inline spoiler box into the content. Players not in the allowed list will see blurred text they can click to reveal.
              </div>
              <div>
                <label style={labelStyle}>Insert Into</label>
                <select value={spoilerInsertTarget} onChange={(e) => setSpoilerInsertTarget(e.target.value)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                  <option value="body">Main Body</option>
                  {panels.map((p, i) => (
                    <option key={p.id} value={p.id}>{p.title || `Section ${i + 1}`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Spoiler Label</label>
                <input type="text" value={spoilerLabel} onChange={(e) => setSpoilerLabel(e.target.value)} placeholder="Spoiler" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Spoiler Content *</label>
                <textarea value={spoilerContent} onChange={(e) => setSpoilerContent(e.target.value)} placeholder="The hidden text..." rows={3} className={`${inputClass} resize-none`} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>
                  <Shield size={9} className="inline mr-1" />Visible To (leave empty = everyone must reveal)
                </label>
                <div className="space-y-1 mt-1">
                  {players.map((player) => {
                    const selected = spoilerPlayerIds.includes(player.id);
                    return (
                      <button
                        key={player.id}
                        onClick={() => setSpoilerPlayerIds(selected ? spoilerPlayerIds.filter((pid) => pid !== player.id) : [...spoilerPlayerIds, player.id])}
                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-[11px] transition-colors hover:bg-[#0A0A30]"
                        style={{
                          color: selected ? "#C0D0F0" : "#5A6A8A",
                          background: selected ? "#0A1A3A" : "transparent",
                          border: selected ? "1px solid #2A4A6B" : "1px solid transparent",
                        }}
                      >
                        {selected ? <Eye size={10} style={{ color: "#4AFF6A" }} /> : <EyeOff size={10} style={S_DIM} />}
                        <span style={{ fontWeight: selected ? 600 : 400 }}>{player.name}</span>
                        <span className="text-[9px] ml-auto" style={S_DIM}>{player.class} Lv{player.level}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderTopColor: "#1A1A4B" }}>
              <button onClick={() => setShowSpoilerInsert(false)} className={`${retro.button} px-4 py-1.5 text-[11px]`} style={S_SUBTLE}>Cancel</button>
              <button onClick={handleInsertSpoiler} disabled={!spoilerContent.trim()} className={`${retro.button} px-4 py-1.5 text-[11px]`} style={{ color: spoilerContent.trim() ? "#FFFFFF" : "#3A4A6A", background: spoilerContent.trim() ? "#5A0A0A" : "#0A0A28", borderColor: spoilerContent.trim() ? "#FF6A6A" : "#1A2A4B" }}>
                <Shield size={10} className="inline mr-1" /> Insert Spoiler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Embed Dialog */}
      {showImageEmbed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowImageEmbed(false); }}>
          <div className="w-[450px]" style={{ background: "#0C0C2E", border: "2px solid #2A2A5B" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b-2" style={{ borderBottomColor: "#1A1A4B", background: "#0E0E35" }}>
              <div className="flex items-center gap-2">
                <ImageIcon size={14} style={{ color: "#4AFF6A" }} />
                <span className="text-[13px]" style={{ color: "#C0D0F0", fontWeight: 600 }}>Embed Image</span>
              </div>
              <button onClick={() => setShowImageEmbed(false)} className="hover:opacity-80"><X size={14} style={S_MUTED} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label style={labelStyle}>Image URL *</label>
                <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Caption</label>
                <input type="text" value={imageCaption} onChange={(e) => setImageCaption(e.target.value)} placeholder="Optional caption text..." className={inputClass} style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Alignment</label>
                  <div className="flex gap-1 mt-1">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button key={a} onClick={() => setImageAlign(a)} className="text-[10px] px-3 py-1 flex-1" style={{ color: imageAlign === a ? "#C0D0F0" : "#5A6A8A", background: imageAlign === a ? "#1A1A5B" : "transparent", border: imageAlign === a ? "1px solid #4A7BFF" : "1px solid #1A2A4B" }}>
                        {a.charAt(0).toUpperCase() + a.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Width (%)</label>
                  <input type="number" min="10" max="100" value={imageWidth} onChange={(e) => setImageWidth(e.target.value)} className={inputClass} style={inputStyle} />
                </div>
              </div>
              {imageUrl && (
                <div className="p-2" style={{ background: "#080820", border: "1px solid #1A2A4B" }}>
                  <img src={imageUrl} alt="Preview" style={{ maxWidth: "100%", maxHeight: 150, margin: "0 auto", display: "block", borderRadius: 3 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderTopColor: "#1A1A4B" }}>
              <button onClick={() => setShowImageEmbed(false)} className={`${retro.button} px-4 py-1.5 text-[11px]`} style={S_SUBTLE}>Cancel</button>
              <button onClick={handleInsertImage} disabled={!imageUrl.trim()} className={`${retro.button} px-4 py-1.5 text-[11px]`} style={{ color: imageUrl.trim() ? "#FFFFFF" : "#3A4A6A", background: imageUrl.trim() ? "#0A5A0A" : "#0A0A28", borderColor: imageUrl.trim() ? "#4AFF6A" : "#1A2A4B" }}>
                <ImageIcon size={10} className="inline mr-1" /> Insert Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
