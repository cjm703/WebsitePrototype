import React, { useState } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import {
  Globe, X, Plus, Save, Edit, ChevronDown, ChevronRight, AlertTriangle,
  Tag, FileText, Palette, Paintbrush, GitBranch, Trash2,
} from "lucide-react";
import { PAGE_ICONS } from "./page-icons";
import { RichTextEditor } from "./rich-text-editor";
import { useDebouncedJsonStorage } from "./use-debounced-storage";
import { safeGetJson } from "./safe-storage";
import {
  DM_WIKI_EDITOR_BG, DM_WIKI_EDITOR_TITLE, DM_WIKI_BODY_BG, DM_BTN_LINK, DM_BTN_CLOSE,
  DM_INFO_BAR, DM_SECTION_LEFT, DM_SECTION_HDR, DM_SECTION_LEFT_PURPLE, DM_SECTION_HDR_PURPLE,
  DM_SECTION_LEFT_GREEN, DM_SECTION_HDR_GREEN, DM_INPUT_BORDER, DM_INPUT_BORDER_TOP,
  DM_BTN_ADD_FOLDER, DM_BTN_ADD_ARTICLE, DM_COUNTER_DIM, DM_STYLE_DIM, DM_ERR_MSG,
  DM_BTN_CANCEL_OUTLINE, DM_BTN_GRAPH, DM_EMPTY_ICON, DM_TABLE_HDR, DM_ROW_BORDER,
  DM_PAGE_TITLE, DM_STUB_BADGE, DM_PANELS_BADGE, DM_PURPLE_BTN, DM_BTN_EDIT_OUTLINE,
  DM_BTN_DELETE_OUTLINE, DM_CHIP, DM_CHIP_BLUE, DM_BTN_DIM, DM_INFOBOX_PREVIEW,
  DM_INFOBOX_TITLE, DM_INFOBOX_LABEL, DM_INFOBOX_VALUE, DM_BORDER_TOP, DM_BORDER_B_ALT,
  DM_BORDER_B_DARK, dmNodeBorder, dmNodeIcon, dmNodeEditBtn, dmNodeLinkColor,
  dmQualityBtn, dmQualityBadge, dmAlignBtn, dmBtnSelColor, dmIconSelBorder, dmIconSelColor,
  DM_SUBCATS_NODE_DEPTH, dmWikiTab, DM_EDIT_SUMMARY_HDR, DM_EDIT_SUMMARY_DIM,
  DM_FOOTER_DIM, DM_EDIT_SUMMARY_BOX, DM_SUBCAT_ITEM, DM_SUBCAT_ICON,
  S_MUTED, S_DIM, S_TEXT, S_ACCENT, S_RED, S_SUBTLE, S_WARN, S_GREEN_BTN, S_LABEL,
  S_SECTION_HDR, S_LINK, S_SAVE_BTN,
} from "./dm-styles";

interface PageSection {
  id: string;
  heading: string;
  body: string;
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
  infobox: { label: string; value: string }[];
  articleQuality: "featured" | "good" | "start" | "stub" | "draft";
  tags: string[];
  relatedArticleIds: string[];
  seeAlso: string[];
  disambiguationNote: string;
  references: string[];
  lastEditSummary: string;
  panels?: WikiPanel[];
}

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

const DEFAULT_PAGE_STYLE = {
  subtitle: "",
  marqueeText: "",
  footerText: "",
  sections: [] as PageSection[],
  bgColor: "#0C0C2E",
  headerColor: "#0E0E35",
  accentColor: "#4A7BFF",
  textColor: "#B0C0E0",
  fontFamily: "'Tahoma', 'Verdana', sans-serif",
  headerAlign: "center" as const,
  underConstruction: false,
  showHitCounter: false,
  showDividers: true,
  hitCount: 1337,
};

const DATE_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DATE_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const DATE_YEARS = Array.from({ length: 21 }, (_, i) => 2020 + i);

const parseDateParts = (str: string): { month: string; day: number; year: number } => {
  const now = new Date();
  const fallback = { month: DATE_MONTHS[now.getMonth()], day: now.getDate(), year: now.getFullYear() };
  if (!str) return fallback;
  const m = str.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})$/i);
  if (m) return { month: m[1].charAt(0).toUpperCase() + m[1].slice(1,3).toLowerCase(), day: parseInt(m[2]), year: parseInt(m[3]) };
  const d = new Date(str);
  if (!isNaN(d.getTime())) return { month: DATE_MONTHS[d.getMonth()], day: d.getDate(), year: d.getFullYear() };
  return fallback;
};
const buildDateStr = (month: string, day: number, year: number) => `${month} ${day}, ${year}`;



const labelStyle = { color: "#5A6A8A" } as const;
const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;
const inputStyle = { color: "#C0D0F0" } as const;

export function DMWikiSection() {
  const navigate = useNavigate();

  const [sitePages, setSitePages] = useState<SitePage[]>(() => safeGetJson("inet-dm-sites", []));
  const [pageFormTitle, setPageFormTitle] = useState("");
  const [pageFormUrl, setPageFormUrl] = useState("");
  const [pageFormDesc, setPageFormDesc] = useState("");
  const [pageFormCategory, setPageFormCategory] = useState("");
  const [pageFormSubcategories, setPageFormSubcategories] = useState<SubCategory[]>([]);
  const [pageFormBody, setPageFormBody] = useState("");
  const [pageFormSubtitle, setPageFormSubtitle] = useState("");
  const [pageFormMarquee, setPageFormMarquee] = useState("");
  const [pageFormFooter, setPageFormFooter] = useState("");
  const [pageFormPanels, setPageFormPanels] = useState<WikiPanel[]>([]);
  const [pageFormBgColor, setPageFormBgColor] = useState(DEFAULT_PAGE_STYLE.bgColor);
  const [pageFormHeaderColor, setPageFormHeaderColor] = useState(DEFAULT_PAGE_STYLE.headerColor);
  const [pageFormAccentColor, setPageFormAccentColor] = useState(DEFAULT_PAGE_STYLE.accentColor);
  const [pageFormTextColor, setPageFormTextColor] = useState(DEFAULT_PAGE_STYLE.textColor);
  const [pageFormFont, setPageFormFont] = useState(DEFAULT_PAGE_STYLE.fontFamily);
  const [pageFormHeaderAlign, setPageFormHeaderAlign] = useState<"left" | "center" | "right">("center");
  const [pageFormUnderConstruction, setPageFormUnderConstruction] = useState(false);
  const [pageFormShowHitCounter, setPageFormShowHitCounter] = useState(false);
  const [pageFormShowDividers, setPageFormShowDividers] = useState(true);
  const [pageFormHitCount, setPageFormHitCount] = useState(1337);
  const [pageFormIcon, setPageFormIcon] = useState("globe");
  const [pageFormIconUrl, setPageFormIconUrl] = useState("");
  const [pageFormBodyTitle, setPageFormBodyTitle] = useState("");
  const [pageFormBodySubtitle, setPageFormBodySubtitle] = useState("");
  const [showAppearancePanel, setShowAppearancePanel] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showPanelsToggle, setShowPanelsToggle] = useState(false);
  const [customPanelStyles] = useState<{ id: string; label: string; accent: string; bg: string; border: string }[]>(() => safeGetJson("inet-custom-panel-styles", []));
  const [pageFormInfobox, setPageFormInfobox] = useState<{ label: string; value: string }[]>([]);
  const [pageFormQuality, setPageFormQuality] = useState<"featured" | "good" | "start" | "stub" | "draft">("start");
  const [pageFormTags, setPageFormTags] = useState<string[]>([]);
  const [pageFormTagInput, setPageFormTagInput] = useState("");
  const [pageFormRelatedIds, setPageFormRelatedIds] = useState<string[]>([]);
  const [pageFormSeeAlso, setPageFormSeeAlso] = useState<string[]>([]);
  const [pageFormDisambiguation, setPageFormDisambiguation] = useState("");
  const [pageFormReferences, setPageFormReferences] = useState<string[]>([]);
  const [pageFormRefInput, setPageFormRefInput] = useState("");
  const [pageFormEditSummary, setPageFormEditSummary] = useState("");
  const [showWikiFieldsPanel, setShowWikiFieldsPanel] = useState(false);
  const [showInfoboxPanel, setShowInfoboxPanel] = useState(false);
  const [pageFormMonth, setPageFormMonth] = useState(() => DATE_MONTHS[new Date().getMonth()]);
  const [pageFormDay, setPageFormDay] = useState(() => new Date().getDate());
  const [pageFormYear, setPageFormYear] = useState(() => new Date().getFullYear());
  const [pageError, setPageError] = useState("");
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [wikiEditorTab, setWikiEditorTab] = useState<"edit" | "metadata" | "infobox" | "appearance" | "list">("list");

  useDebouncedJsonStorage("inet-dm-sites", sitePages, 400);

  const selectDateStyle = { color: "#C0D0F0", cursor: "pointer" as const };
  const isEditing = editingPageId !== null;
  const colorInputClass = `${retro.sunken} bg-[#0A0A28] w-10 h-8 cursor-pointer border-0 p-0`;

  const clearForm = () => {
    setPageFormTitle(""); setPageFormUrl(""); setPageFormDesc(""); setPageFormCategory("");
    setPageFormSubcategories([]);
    setPageFormBody(""); setPageFormSubtitle(""); setPageFormMarquee(""); setPageFormFooter("");
    setPageFormPanels([]);
    setPageFormBgColor(DEFAULT_PAGE_STYLE.bgColor); setPageFormHeaderColor(DEFAULT_PAGE_STYLE.headerColor);
    setPageFormAccentColor(DEFAULT_PAGE_STYLE.accentColor); setPageFormTextColor(DEFAULT_PAGE_STYLE.textColor);
    setPageFormFont(DEFAULT_PAGE_STYLE.fontFamily); setPageFormHeaderAlign("center");
    setPageFormUnderConstruction(false); setPageFormShowHitCounter(false);
    setPageFormShowDividers(true); setPageFormHitCount(1337);
    setPageFormIcon("globe"); setPageFormIconUrl(""); setPageFormBodyTitle(""); setPageFormBodySubtitle("");
    setPageFormMonth(DATE_MONTHS[new Date().getMonth()]); setPageFormDay(new Date().getDate()); setPageFormYear(new Date().getFullYear());
    setPageError(""); setEditingPageId(null);
    setShowPanelsToggle(false); setShowIconPicker(false);
    setPageFormInfobox([]); setPageFormQuality("start"); setPageFormTags([]); setPageFormTagInput("");
    setPageFormRelatedIds([]); setPageFormSeeAlso([]); setPageFormDisambiguation("");
    setPageFormReferences([]); setPageFormRefInput(""); setPageFormEditSummary("");
    setShowWikiFieldsPanel(false); setShowInfoboxPanel(false);
  };

  const loadPageIntoForm = (page: SitePage) => {
    setPageFormTitle(page.title); setPageFormUrl(page.url); setPageFormDesc(page.description);
    setPageFormCategory(page.category); setPageFormSubcategories(page.subcategories || []);
    setPageFormBody(page.body || "");
    setPageFormSubtitle(page.subtitle || ""); setPageFormMarquee(page.marqueeText || "");
    setPageFormFooter(page.footerText || ""); setPageFormPanels(migrateSectionsToPanels(page));
    setPageFormBgColor(page.bgColor || DEFAULT_PAGE_STYLE.bgColor);
    setPageFormHeaderColor(page.headerColor || DEFAULT_PAGE_STYLE.headerColor);
    setPageFormAccentColor(page.accentColor || DEFAULT_PAGE_STYLE.accentColor);
    setPageFormTextColor(page.textColor || DEFAULT_PAGE_STYLE.textColor);
    setPageFormFont(page.fontFamily || DEFAULT_PAGE_STYLE.fontFamily);
    setPageFormHeaderAlign(page.headerAlign || "center");
    setPageFormUnderConstruction(page.underConstruction || false);
    setPageFormShowHitCounter(page.showHitCounter || false);
    setPageFormShowDividers(page.showDividers ?? true);
    setPageFormHitCount(page.hitCount || 1337);
    setPageFormIcon(page.pageIcon || "globe");
    setPageFormIconUrl(page.pageIconUrl || "");
    setPageFormBodyTitle(page.bodyTitle || "");
    setPageFormBodySubtitle(page.bodySubtitle || "");
    const dateParts = parseDateParts(page.dateAdded);
    setPageFormMonth(dateParts.month); setPageFormDay(dateParts.day); setPageFormYear(dateParts.year);
    setPageFormInfobox(page.infobox || []); setPageFormQuality(page.articleQuality || "start");
    setPageFormTags(page.tags || []); setPageFormRelatedIds(page.relatedArticleIds || []);
    setPageFormSeeAlso(page.seeAlso || []); setPageFormDisambiguation(page.disambiguationNote || "");
    setPageFormReferences(page.references || []); setPageFormEditSummary(page.lastEditSummary || "");
    setEditingPageId(page.id); setPageError("");
    setWikiEditorTab("edit");
  };

  const buildPageFromForm = (): Omit<SitePage, "id"> => ({
    title: pageFormTitle.trim(), url: pageFormUrl.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
    description: pageFormDesc.trim(), category: pageFormCategory.trim() || "Uncategorized",
    subcategories: pageFormSubcategories,
    body: pageFormBody, subtitle: pageFormSubtitle, marqueeText: pageFormMarquee,
    footerText: pageFormFooter, sections: [] as PageSection[], panels: pageFormPanels,
    bgColor: pageFormBgColor, headerColor: pageFormHeaderColor,
    accentColor: pageFormAccentColor, textColor: pageFormTextColor,
    fontFamily: pageFormFont, headerAlign: pageFormHeaderAlign,
    pageIcon: pageFormIcon, pageIconUrl: pageFormIconUrl, bodyTitle: pageFormBodyTitle, bodySubtitle: pageFormBodySubtitle,
    underConstruction: pageFormUnderConstruction, showHitCounter: pageFormShowHitCounter,
    showDividers: pageFormShowDividers, hitCount: pageFormHitCount,
    dateAdded: buildDateStr(pageFormMonth, pageFormDay, pageFormYear),
    infobox: pageFormInfobox.filter(r => r.label.trim() || r.value.trim()),
    articleQuality: pageFormQuality, tags: pageFormTags,
    relatedArticleIds: pageFormRelatedIds, seeAlso: pageFormSeeAlso,
    disambiguationNote: pageFormDisambiguation.trim(),
    references: pageFormReferences.filter(r => r.trim()),
    lastEditSummary: pageFormEditSummary.trim(),
  });

  const handleSavePage = () => {
    const missing: string[] = [];
    if (!pageFormTitle.trim()) missing.push("Page Title");
    if (!pageFormUrl.trim()) missing.push("URL");
    if (!pageFormDesc.trim()) missing.push("Description");
    if (missing.length > 0) { setPageError(`Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`); return; }
    const normalizedUrl = pageFormUrl.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (sitePages.some((p) => p.id !== editingPageId && p.url.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase() === normalizedUrl.toLowerCase())) {
      setPageError("A page with this URL already exists."); return;
    }
    const now = new Date();
    const autoDate = `${DATE_MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    const data = { ...buildPageFromForm(), dateAdded: autoDate };
    setPageFormMonth(DATE_MONTHS[now.getMonth()]); setPageFormDay(now.getDate()); setPageFormYear(now.getFullYear());
    if (isEditing) {
      setSitePages((prev) => prev.map((p) => p.id === editingPageId ? { ...p, ...data } : p));
    } else {
      setSitePages((prev) => [...prev, { id: `site-${Date.now()}`, ...data }]);
    }
    clearForm();
    setWikiEditorTab("list");
  };

  const handleRemovePage = (id: string) => {
    setSitePages((prev) => prev.filter((p) => p.id !== id));
    if (editingPageId === id) clearForm();
  };

  const addPanel = () => {
    setPageFormPanels((prev) => [...prev, { id: `panel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: "", subtitle: "", content: "", assignedTo: [], style: "blank" }]);
  };
  const updatePanelField = (id: string, changes: Partial<WikiPanel>) => {
    setPageFormPanels((prev) => prev.map((p) => p.id === id ? { ...p, ...changes } : p));
  };
  const removePanel = (id: string) => {
    setPageFormPanels((prev) => prev.filter((p) => p.id !== id));
  };

  const addSubcategory = (parentPath: number[] | null) => {
    const newNode: SubCategory = { id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "", type: "folder", children: [] };
    setPageFormSubcategories(prev => {
      if (!parentPath || parentPath.length === 0) return [...prev, newNode];
      const next = JSON.parse(JSON.stringify(prev)) as SubCategory[];
      let target = next as SubCategory[];
      for (const idx of parentPath) target = target[idx].children;
      target.push(newNode);
      return next;
    });
  };
  const updateSubcategory = (path: number[], field: string, value: string) => {
    setPageFormSubcategories(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as SubCategory[];
      let parent = next as SubCategory[];
      for (let i = 0; i < path.length - 1; i++) parent = parent[path[i]].children;
      const node = parent[path[path.length - 1]];
      if (field === "name") node.name = value;
      else if (field === "type") {
        node.type = value as "folder" | "article";
        if (value === "folder") { node.articleId = undefined; }
        else { node.children = []; }
      }
      else if (field === "articleId") node.articleId = value;
      return next;
    });
  };
  const removeSubcategory = (path: number[]) => {
    setPageFormSubcategories(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as SubCategory[];
      let parent = next as SubCategory[];
      for (let i = 0; i < path.length - 1; i++) parent = parent[path[i]].children;
      parent.splice(path[path.length - 1], 1);
      return next;
    });
  };
  const moveSubcategory = (path: number[], dir: -1 | 1) => {
    setPageFormSubcategories(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as SubCategory[];
      let parent = next as SubCategory[];
      for (let i = 0; i < path.length - 1; i++) parent = parent[path[i]].children;
      const idx = path[path.length - 1];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= parent.length) return prev;
      [parent[idx], parent[swapIdx]] = [parent[swapIdx], parent[idx]];
      return next;
    });
  };

  const renderSubcategoryNode = (node: SubCategory, path: number[], depth: number): React.ReactNode => {
    const isFolder = node.type === "folder";
    const linkedArticle = node.articleId ? sitePages.find(p => p.id === node.articleId) : null;
    return (
      <div key={node.id} style={{ marginLeft: depth * 16 }}>
        <div className="flex items-center gap-1.5 py-1.5 px-2 group hover:bg-[#0A0A30] transition-colors" style={{ ...dmNodeBorder(isFolder), background: depth % 2 === 0 ? "transparent" : "#08081E" }}>
          <span className="text-[11px] shrink-0" style={dmNodeIcon(isFolder)}>{isFolder ? "📁" : "📄"}</span>
          <input
            type="text"
            value={node.name}
            onChange={(e) => updateSubcategory(path, "name", e.target.value)}
            placeholder={isFolder ? "Folder name..." : "Sub-page name..."}
            className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px] outline-none flex-1 min-w-0`}
            style={S_TEXT}
          />
          <select
            value={node.type}
            onChange={(e) => updateSubcategory(path, "type", e.target.value)}
            className="text-[10px] px-1 py-0.5 bg-[#0A0A28] outline-none shrink-0"
            style={dmNodeEditBtn(isFolder)}
          >
            <option value="folder">Folder</option>
            <option value="article">Article Link</option>
          </select>
          {!isFolder && (
            <select
              value={node.articleId || ""}
              onChange={(e) => updateSubcategory(path, "articleId", e.target.value)}
              className="text-[10px] px-1 py-0.5 bg-[#0A0A28] outline-none shrink-0 max-w-[140px]"
              style={dmNodeLinkColor(!!node.articleId)}
            >
              <option value="">— Link to article —</option>
              {sitePages.filter(p => p.id !== editingPageId).map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          )}
          <button onClick={() => moveSubcategory(path, -1)} className="text-[9px] px-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity" style={S_MUTED} title="Move up">▲</button>
          <button onClick={() => moveSubcategory(path, 1)} className="text-[9px] px-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity" style={S_MUTED} title="Move down">▼</button>
          <button onClick={() => removeSubcategory(path)} className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity" title="Remove">
            <X size={11} style={S_RED} />
          </button>
        </div>
        {isFolder && node.children.length > 0 && (
          <div>{node.children.map((child, ci) => renderSubcategoryNode(child, [...path, ci], depth + 1))}</div>
        )}
        {isFolder && (
          <button
            onClick={() => addSubcategory(path)}
            className="text-[9px] px-2 py-0.5 ml-4 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
            style={DM_SUBCATS_NODE_DEPTH(depth)}
          >
            <Plus size={9} /> Add inside "{node.name || "folder"}"
          </button>
        )}
      </div>
    );
  };

  return (
  <div className="space-y-0">
    <div style={DM_WIKI_EDITOR_BG}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Globe size={16} style={S_LINK} />
          <h2 className="text-[16px]" style={DM_WIKI_EDITOR_TITLE}>
            {isEditing ? `Editing: ${pageFormTitle || "Untitled"}` : "I-Net Wiki — Article Manager"}
          </h2>
        </div>
        {isEditing && (
          <div className="flex items-center gap-2">
            <button onClick={() => editingPageId && navigate(`/interface/wiki-editor/${editingPageId}`)} className="text-[11px] px-3 py-1 hover:opacity-80 flex items-center gap-1" style={DM_BTN_LINK}>
              <Edit size={10} />Full Editor
            </button>
            <button onClick={() => { clearForm(); setWikiEditorTab("list"); }} className="text-[11px] px-3 py-1 hover:opacity-80" style={DM_BTN_CLOSE}>
              <X size={10} className="inline mr-1" />Discard
            </button>
          </div>
        )}
      </div>
      {isEditing && pageFormCategory && (
        <div className="text-[10px] mb-2 ml-6" style={S_LABEL}>
          Category: <span style={{ ...S_LINK, cursor: "pointer" }}>{pageFormCategory}</span>
          {pageFormTags.length > 0 && <span> &middot; Tags: {pageFormTags.map((t, i) => <span key={t}>{i > 0 && ", "}<span style={S_LINK}>{t}</span></span>)}</span>}
        </div>
      )}
      <div className="flex gap-0 -mb-[2px]">
        {([
          { id: "list" as const, label: "All Articles", show: true },
          { id: "edit" as const, label: isEditing ? "Edit" : "Create New", show: true },
          { id: "metadata" as const, label: "Wiki Metadata", show: isEditing || wikiEditorTab === "metadata" },
          { id: "infobox" as const, label: `Infobox (${pageFormInfobox.length})`, show: isEditing || wikiEditorTab === "infobox" },
          { id: "appearance" as const, label: "Appearance", show: isEditing || wikiEditorTab === "appearance" },
        ]).filter(t => t.show).map((tab) => {
          const active = wikiEditorTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === "edit" && !isEditing) { navigate("/interface/wiki-editor/new"); return; }
                if (tab.id === "edit" && isEditing && editingPageId) { navigate(`/interface/wiki-editor/${editingPageId}`); return; }
                setWikiEditorTab(tab.id);
              }}
              className="px-4 py-1.5 text-[11px] transition-colors"
              style={dmWikiTab(active)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>

    <div style={DM_WIKI_BODY_BG}>

    {wikiEditorTab === "edit" && (<div className="space-y-4">
      <div className="flex items-start gap-2 px-3 py-2 text-[11px]" style={DM_INFO_BAR}>
        <FileText size={13} className="shrink-0 mt-0.5" style={S_LINK} />
        <span>{isEditing ? "You are editing an existing wiki article. Changes will be published when you save." : "You are creating a new article. Fill in the required fields marked with * below."}</span>
      </div>

    <div style={DM_SECTION_LEFT}>
      <div className="text-[11px] mb-3 flex items-center gap-2" style={DM_SECTION_HDR}>
        <FileText size={11} /> Article Identity
      </div>
      <div className="mb-3">
        <label className="text-[11px] block mb-1" style={labelStyle}>Page Title *</label>
        <input type="text" value={pageFormTitle} onChange={(e) => { setPageFormTitle(e.target.value); setPageError(""); }} placeholder="Enter page title..." className={inputClass} style={inputStyle} />
      </div>
      <div className="mb-3">
        <label className="text-[11px] block mb-1" style={labelStyle}>Subtitle / Tagline</label>
        <input type="text" value={pageFormSubtitle} onChange={(e) => setPageFormSubtitle(e.target.value)} placeholder="e.g., Welcome to the future..." className={inputClass} style={inputStyle} />
      </div>
      <div className="mb-3">
        <label className="text-[11px] block mb-1" style={labelStyle}>Page Icon</label>
        <div className="flex items-center gap-2">
          {pageFormIcon === "none" ? (
            <span className="text-[11px]" style={S_DIM}>No icon</span>
          ) : pageFormIcon === "custom" && pageFormIconUrl ? (
            <img src={pageFormIconUrl} alt="icon" className="shrink-0 object-contain" style={{ width: 18, height: 18 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (() => { const Sel = PAGE_ICONS.find((i) => i.name === pageFormIcon)?.Icon || PAGE_ICONS[0].Icon; return <Sel size={18} style={{ color: pageFormAccentColor }} />; })()}
          <button onClick={() => setShowIconPicker(!showIconPicker)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_TEXT}>
            {pageFormIcon === "none" ? "None" : pageFormIcon === "custom" ? "Custom Image" : PAGE_ICONS.find((i) => i.name === pageFormIcon)?.label || "Globe"} — Change
          </button>
        </div>
        {showIconPicker && (
          <div className={`${retro.sunken} bg-[#0A0A28] p-3 mt-2`}>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => { setPageFormIcon("none"); setPageFormIconUrl(""); setShowIconPicker(false); }}
                className={`${retro.button} px-3 py-1 text-[11px]`}
                style={dmBtnSelColor(pageFormIcon === "none", pageFormAccentColor)}
              >
                No Icon
              </button>
              <button
                onClick={() => { setPageFormIcon("custom"); }}
                className={`${retro.button} px-3 py-1 text-[11px]`}
                style={dmBtnSelColor(pageFormIcon === "custom", pageFormAccentColor)}
              >
                Custom Image
              </button>
            </div>
            {pageFormIcon === "custom" && (
              <div className="mb-3">
                <label className="text-[10px] block mb-1" style={S_MUTED}>Image URL</label>
                <input
                  type="text"
                  value={pageFormIconUrl}
                  onChange={(e) => setPageFormIconUrl(e.target.value)}
                  placeholder="https://example.com/icon.png"
                  className={`${retro.sunken} bg-[#080820] px-2 py-1.5 text-[12px] w-full outline-none`}
                  style={S_TEXT}
                />
                {pageFormIconUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[9px]" style={S_DIM}>Preview:</span>
                    <img src={pageFormIconUrl} alt="preview" className="object-contain" style={{ width: 22, height: 22 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-8 sm:grid-cols-10 gap-1">
              {PAGE_ICONS.map((ico) => (
                <button
                  key={ico.name}
                  onClick={() => { setPageFormIcon(ico.name); setPageFormIconUrl(""); setShowIconPicker(false); }}
                  className="flex flex-col items-center justify-center p-1.5 hover:bg-[#1A1A5B] transition-colors rounded"
                  style={dmIconSelBorder(pageFormIcon === ico.name, pageFormAccentColor)}
                  title={ico.label}
                >
                  <ico.Icon size={16} style={dmIconSelColor(pageFormIcon === ico.name, pageFormAccentColor)} />
                </button>
              ))}
            </div>
            <span className="text-[9px] mt-2 block" style={S_DIM}>Click an icon to select, or use "No Icon" / "Custom Image" above</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[11px] block mb-1" style={labelStyle}>URL *</label>
          <input type="text" value={pageFormUrl} onChange={(e) => { setPageFormUrl(e.target.value); setPageError(""); }} placeholder="e.g., www.example.com" className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="text-[11px] block mb-1" style={labelStyle}>Category <span className="text-[9px]" style={S_DIM}>(top-level folder)</span></label>
          <input type="text" value={pageFormCategory} onChange={(e) => setPageFormCategory(e.target.value)} placeholder="e.g., Factions, Locations, Lore..." className={inputClass} style={inputStyle} />
        </div>
      </div>

      <div className="mb-3">
        <label className="text-[11px] block mb-2" style={labelStyle}>
          Subcategories
          <span className="text-[9px] ml-1" style={S_DIM}>(nest pages under this article — folders group, article links point to pages)</span>
        </label>
        <div className={`${retro.sunken} bg-[#080820] p-3`} style={DM_INPUT_BORDER}>
          {pageFormSubcategories.length === 0 ? (
            <div className="text-[11px] text-center py-3" style={S_DIM}>
              No subcategories yet. Add folders to group related pages, or link directly to other articles.
            </div>
          ) : (
            <div className="space-y-0.5 mb-2">
              {pageFormSubcategories.map((sc, i) => renderSubcategoryNode(sc, [i], 0))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2 pt-2" style={DM_INPUT_BORDER_TOP}>
            <button onClick={() => addSubcategory(null)} className="text-[11px] px-3 py-1 flex items-center gap-1 hover:bg-[#0A1A3A] transition-colors" style={DM_BTN_ADD_FOLDER}>
              <Plus size={10} />Add folder
            </button>
            <button onClick={() => { const newNode: SubCategory = { id: `sc-${Date.now()}`, name: "", type: "article", children: [] }; setPageFormSubcategories(prev => [...prev, newNode]); }} className="text-[11px] px-3 py-1 flex items-center gap-1 hover:bg-[#0A1A2A] transition-colors" style={DM_BTN_ADD_ARTICLE}>
              <Plus size={10} />Add article link
            </button>
            <span className="text-[9px] ml-auto" style={DM_COUNTER_DIM}>
              {pageFormSubcategories.length} top-level {pageFormSubcategories.length === 1 ? "entry" : "entries"}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <label className="text-[11px] block mb-1" style={labelStyle}>Description * <span className="text-[9px]" style={S_DIM}>(shown in search results)</span></label>
        <textarea value={pageFormDesc} onChange={(e) => { setPageFormDesc(e.target.value); setPageError(""); }} placeholder="Short description..." rows={2} className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none resize-none`} style={inputStyle} />
      </div>
      <div className="mb-3">
        <label className="text-[11px] block mb-1" style={labelStyle}>Date Added</label>
        <div className="flex gap-2">
          <select value={pageFormMonth} onChange={(e) => setPageFormMonth(e.target.value)} className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[13px] flex-1 outline-none`} style={selectDateStyle}>
            {DATE_MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={pageFormDay} onChange={(e) => setPageFormDay(parseInt(e.target.value))} className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[13px] w-[70px] outline-none`} style={selectDateStyle}>
            {DATE_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={pageFormYear} onChange={(e) => setPageFormYear(parseInt(e.target.value))} className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[13px] w-[85px] outline-none`} style={selectDateStyle}>
            {DATE_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div className="mb-3">
        <label className="text-[11px] block mb-1" style={labelStyle}>Marquee Text <span className="text-[9px]" style={S_DIM}>(scrolling banner)</span></label>
        <input type="text" value={pageFormMarquee} onChange={(e) => setPageFormMarquee(e.target.value)} placeholder="e.g., WELCOME TO MY HOMEPAGE!!!" className={inputClass} style={inputStyle} />
      </div>
    </div>

    <div style={DM_SECTION_LEFT}>
      <div className="text-[11px] mb-3 flex items-center gap-2" style={DM_SECTION_HDR}>
        <Edit size={11} /> Article Content
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[11px] block mb-1" style={labelStyle}>Body Section Title <span className="text-[9px]" style={S_DIM}>(heading above main content)</span></label>
          <input type="text" value={pageFormBodyTitle} onChange={(e) => setPageFormBodyTitle(e.target.value)} placeholder="e.g., Welcome, About Us..." className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="text-[11px] block mb-1" style={labelStyle}>Body Section Subtitle</label>
          <input type="text" value={pageFormBodySubtitle} onChange={(e) => setPageFormBodySubtitle(e.target.value)} placeholder="e.g., Read on to learn more..." className={inputClass} style={inputStyle} />
        </div>
      </div>
      <div className="mb-3">
        <label className="text-[11px] block mb-1" style={labelStyle}>Main Body</label>
        <RichTextEditor value={pageFormBody} onChange={setPageFormBody} placeholder="Write the main page content here..." minHeight={160} />
      </div>

      <div className="mb-3">
        <button onClick={() => setShowPanelsToggle(!showPanelsToggle)} className="flex items-center gap-1 text-[11px] mb-2 cursor-pointer hover:opacity-80" style={S_ACCENT}>
          {showPanelsToggle ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Panels ({pageFormPanels.length})
        </button>
        {showPanelsToggle && (
          <div className="space-y-3 ml-3">
            {pageFormPanels.map((panel, idx) => (
              <div key={panel.id} className={`${retro.sunken} bg-[#0A0A28] p-3`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px]" style={S_SECTION_HDR}>PANEL {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px]" style={DM_STYLE_DIM}>{customPanelStyles.find((cs) => cs.id === panel.style)?.label || panel.style || "blank"}</span>
                    <button onClick={() => removePanel(panel.id)} className="text-[10px] hover:underline" style={S_RED}><X size={10} className="inline" /> Remove</button>
                  </div>
                </div>
                <input type="text" value={panel.title} onChange={(e) => updatePanelField(panel.id, { title: e.target.value })} placeholder="Panel title..." className={`${retro.sunken} bg-[#080820] px-2 py-1.5 text-[12px] w-full outline-none mb-2`} style={inputStyle} />
                <input type="text" value={panel.subtitle || ""} onChange={(e) => updatePanelField(panel.id, { subtitle: e.target.value })} placeholder="Subtitle (optional)..." className={`${retro.sunken} bg-[#080820] px-2 py-1.5 text-[11px] w-full outline-none mb-2`} style={{ ...inputStyle, opacity: 0.7 }} />
                <RichTextEditor value={panel.content} onChange={(html) => updatePanelField(panel.id, { content: html })} placeholder="Panel content..." minHeight={80} />
                <div className="mt-2 flex items-center gap-3 text-[9px]" style={DM_STYLE_DIM}>
                  <span>Style:</span>
                  <select value={panel.style || "blank"} onChange={(e) => updatePanelField(panel.id, { style: e.target.value })} className={`${retro.sunken} bg-[#080820] px-1 py-0.5 text-[10px] outline-none`} style={inputStyle}>
                    <option value="blank">Blank</option>
                    <option value="neutral">Neutral</option>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="lore">Lore</option>
                    <option value="secret">Secret</option>
                    {customPanelStyles.map((cs) => (
                      <option key={cs.id} value={cs.id}>{cs.label}</option>
                    ))}
                  </select>
                  <span className="text-[9px]" style={S_DIM}>|</span>
                  <span>For full panel options use the Wiki Editor</span>
                </div>
              </div>
            ))}
            <button onClick={addPanel} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_GREEN_BTN}>
              <Plus size={10} className="inline mr-1" />Add Panel
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="text-[11px] block mb-1" style={labelStyle}>Custom Footer Text</label>
        <input type="text" value={pageFormFooter} onChange={(e) => setPageFormFooter(e.target.value)} placeholder="e.g., © 2026 My Cool Page — Best viewed in Netscape" className={inputClass} style={inputStyle} />
      </div>
    </div>

    <div style={DM_EDIT_SUMMARY_BOX}>
      <div className="text-[11px] mb-2" style={DM_EDIT_SUMMARY_HDR}>Edit summary <span style={DM_EDIT_SUMMARY_DIM}>(briefly describe your changes)</span></div>
      <input type="text" value={pageFormEditSummary} onChange={(e) => setPageFormEditSummary(e.target.value)} placeholder="e.g., Added geography section, fixed typos..." className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] w-full outline-none mb-3`} style={inputStyle} />
      {pageError && (
        <div className="px-3 py-2 text-[12px] flex items-center gap-2 mb-3" style={DM_ERR_MSG}>
          <AlertTriangle size={13} className="shrink-0" />{pageError}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={handleSavePage} className="px-5 py-2 text-[13px] font-semibold transition-colors hover:opacity-90" style={S_SAVE_BTN}>
          <Save size={12} className="inline mr-1" />{isEditing ? "Publish changes" : "Publish article"}
        </button>
        {isEditing && (
          <button onClick={() => { clearForm(); setWikiEditorTab("list"); }} className="px-4 py-2 text-[12px]" style={DM_BTN_CANCEL_OUTLINE}>
            Cancel
          </button>
        )}
        <span className="text-[10px] ml-auto" style={S_DIM}>
          {isEditing ? "This will update the live article." : "This will create a new article visible to all users."}
        </span>
      </div>
    </div>
    </div>)}

    {wikiEditorTab === "metadata" && (<div className="space-y-4">
      <div className="flex items-start gap-2 px-3 py-2 text-[11px]" style={DM_INFO_BAR}>
        <Tag size={13} className="shrink-0 mt-0.5" style={S_LINK} />
        <span>Configure wiki metadata for this article. These fields affect how the article appears in search, categories, and related article links.</span>
      </div>

        <div style={DM_SECTION_LEFT}>
          <div className="mb-4">
            <label className="text-[11px] block mb-1" style={labelStyle}>Article Quality Rating</label>
            <div className="flex gap-1 flex-wrap">
              {([
                { val: "featured" as const, label: "Featured", color: "#FFD700" },
                { val: "good" as const, label: "Good", color: "#4A9A5A" },
                { val: "start" as const, label: "Start", color: "#4A7BFF" },
                { val: "stub" as const, label: "Stub", color: "#FFAA4A" },
                { val: "draft" as const, label: "Draft", color: "#5A6A8A" },
              ]).map((q) => (
                <button key={q.val} onClick={() => setPageFormQuality(q.val)} className={`${retro.button} px-3 py-1 text-[11px]`} style={dmQualityBtn(pageFormQuality === q.val, q.color)}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] block mb-1" style={labelStyle}>Tags <span className="text-[9px]" style={S_DIM}>(press Enter to add)</span></label>
            <div className="flex gap-2 mb-2">
              <input type="text" value={pageFormTagInput} onChange={(e) => setPageFormTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && pageFormTagInput.trim()) { e.preventDefault(); if (!pageFormTags.includes(pageFormTagInput.trim())) setPageFormTags(prev => [...prev, pageFormTagInput.trim()]); setPageFormTagInput(""); } }} placeholder="Add a tag..." className={inputClass} style={inputStyle} />
            </div>
            {pageFormTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {pageFormTags.map((tag) => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 flex items-center gap-1" style={DM_CHIP}>
                    {tag}
                    <button onClick={() => setPageFormTags(prev => prev.filter(t => t !== tag))} className="hover:opacity-70"><X size={8} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] block mb-1" style={labelStyle}>Disambiguation Note <span className="text-[9px]" style={S_DIM}>(shown at top of article)</span></label>
            <input type="text" value={pageFormDisambiguation} onChange={(e) => setPageFormDisambiguation(e.target.value)} placeholder='e.g., This article is about the city. For the spell, see Fireball (spell).' className={inputClass} style={inputStyle} />
          </div>

          <div>
            <label className="text-[11px] block mb-1" style={labelStyle}>Related Articles <span className="text-[9px]" style={S_DIM}>(click to add)</span></label>
            {pageFormRelatedIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {pageFormRelatedIds.map((rid) => {
                  const rp = sitePages.find(p => p.id === rid);
                  return (
                    <span key={rid} className="text-[10px] px-2 py-0.5 flex items-center gap-1" style={DM_CHIP_BLUE}>
                      {rp?.title || "Unknown"}
                      <button onClick={() => setPageFormRelatedIds(prev => prev.filter(r => r !== rid))} className="hover:opacity-70"><X size={8} /></button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {sitePages.filter(p => p.id !== editingPageId && !pageFormRelatedIds.includes(p.id)).map(p => (
                <button key={p.id} onClick={() => setPageFormRelatedIds(prev => [...prev, p.id])} className="text-[10px] px-2 py-0.5 hover:bg-[#1A1A5B] transition-colors" style={DM_BTN_DIM}>
                  + {p.title}
                </button>
              ))}
              {sitePages.filter(p => p.id !== editingPageId && !pageFormRelatedIds.includes(p.id)).length === 0 && (
                <span className="text-[10px]" style={S_DIM}>No other articles available</span>
              )}
            </div>
          </div>

          <div>
            <label className="text-[11px] block mb-1" style={labelStyle}>See Also <span className="text-[9px]" style={S_DIM}>(links shown at bottom of article)</span></label>
            {pageFormSeeAlso.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {pageFormSeeAlso.map((sid) => {
                  const sp = sitePages.find(p => p.id === sid);
                  return (
                    <span key={sid} className="text-[10px] px-2 py-0.5 flex items-center gap-1" style={DM_CHIP_BLUE}>
                      {sp?.title || "Unknown"}
                      <button onClick={() => setPageFormSeeAlso(prev => prev.filter(s => s !== sid))} className="hover:opacity-70"><X size={8} /></button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {sitePages.filter(p => p.id !== editingPageId && !pageFormSeeAlso.includes(p.id)).map(p => (
                <button key={p.id} onClick={() => setPageFormSeeAlso(prev => [...prev, p.id])} className="text-[10px] px-2 py-0.5 hover:bg-[#1A1A5B] transition-colors" style={DM_BTN_DIM}>
                  + {p.title}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] block mb-1" style={labelStyle}>References / Sources <span className="text-[9px]" style={S_DIM}>(press Enter to add)</span></label>
            <input type="text" value={pageFormRefInput} onChange={(e) => setPageFormRefInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && pageFormRefInput.trim()) { e.preventDefault(); setPageFormReferences(prev => [...prev, pageFormRefInput.trim()]); setPageFormRefInput(""); } }} placeholder="Add a reference..." className={inputClass} style={inputStyle} />
            {pageFormReferences.length > 0 && (
              <div className="mt-2 space-y-1">
                {pageFormReferences.map((ref, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-[10px] px-2 py-1" style={DM_SUBCAT_ITEM}>
                    <span className="shrink-0" style={S_MUTED}>[{idx + 1}]</span>
                    <span className="flex-1 break-all">{ref}</span>
                    <button onClick={() => setPageFormReferences(prev => prev.filter((_, i) => i !== idx))} className="shrink-0 hover:opacity-70"><X size={8} style={S_RED} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] block mb-1" style={labelStyle}>Edit Summary <span className="text-[9px]" style={S_DIM}>(briefly describe your changes)</span></label>
            <input type="text" value={pageFormEditSummary} onChange={(e) => setPageFormEditSummary(e.target.value)} placeholder="e.g., Added geography section, fixed typos..." className={inputClass} style={inputStyle} />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4 pt-3" style={DM_BORDER_TOP}>
          <button onClick={handleSavePage} className="px-5 py-2 text-[13px] font-semibold transition-colors hover:opacity-90" style={S_SAVE_BTN}>
            <Save size={12} className="inline mr-1" />{isEditing ? "Publish changes" : "Publish article"}
          </button>
          {pageError && <span className="text-[11px]" style={S_RED}>{pageError}</span>}
        </div>
    </div>)}

    {wikiEditorTab === "infobox" && (<div className="space-y-4">
      <div className="flex items-start gap-2 px-3 py-2 text-[11px]" style={DM_INFO_BAR}>
        <FileText size={13} className="shrink-0 mt-0.5" style={DM_PURPLE_BTN} />
        <span>The infobox appears as a sidebar panel on the article page with key-value pairs (e.g., "Population: 12,000"). This is similar to Wikipedia's infobox template.</span>
      </div>
      <div style={DM_SECTION_LEFT_PURPLE}>
        <div className="text-[11px] mb-3 flex items-center gap-2" style={DM_SECTION_HDR_PURPLE}>
          Infobox Fields
        </div>
          {pageFormInfobox.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input type="text" value={row.label} onChange={(e) => { const updated = [...pageFormInfobox]; updated[idx] = { ...row, label: e.target.value }; setPageFormInfobox(updated); }} placeholder="Label (e.g., Population)" className={`${retro.sunken} bg-[#0A0A28] px-2 py-1.5 text-[12px] flex-1 outline-none`} style={inputStyle} />
              <input type="text" value={row.value} onChange={(e) => { const updated = [...pageFormInfobox]; updated[idx] = { ...row, value: e.target.value }; setPageFormInfobox(updated); }} placeholder="Value (e.g., 12,000)" className={`${retro.sunken} bg-[#0A0A28] px-2 py-1.5 text-[12px] flex-1 outline-none`} style={inputStyle} />
              <button onClick={() => setPageFormInfobox(prev => prev.filter((_, i) => i !== idx))} className="shrink-0 hover:opacity-70"><X size={12} style={S_RED} /></button>
            </div>
          ))}
          <button onClick={() => setPageFormInfobox(prev => [...prev, { label: "", value: "" }])} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_GREEN_BTN}>
            <Plus size={10} className="inline mr-1" />Add Infobox Field
          </button>
          {pageFormInfobox.filter(r => r.label.trim() || r.value.trim()).length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] mb-2" style={S_MUTED}>Preview:</div>
              <div style={DM_INFOBOX_PREVIEW}>
                <div className="text-[12px] mb-2 pb-1 text-center" style={DM_INFOBOX_TITLE}>{pageFormTitle || "Article Title"}</div>
                {pageFormInfobox.filter(r => r.label.trim() || r.value.trim()).map((row, idx) => (
                  <div key={idx} className="flex text-[10px] py-1" style={DM_ROW_BORDER}>
                    <span className="shrink-0 w-24 pr-2" style={DM_INFOBOX_LABEL}>{row.label || "—"}</span>
                    <span style={DM_INFOBOX_VALUE}>{row.value || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-4 pt-3" style={DM_BORDER_TOP}>
          <button onClick={handleSavePage} className="px-5 py-2 text-[13px] font-semibold transition-colors hover:opacity-90" style={S_SAVE_BTN}>
            <Save size={12} className="inline mr-1" />{isEditing ? "Publish changes" : "Publish article"}
          </button>
          {pageError && <span className="text-[11px]" style={S_RED}>{pageError}</span>}
        </div>
    </div>)}

    {wikiEditorTab === "appearance" && (<div className="space-y-4">
      <div className="flex items-start gap-2 px-3 py-2 text-[11px]" style={DM_INFO_BAR}>
        <Palette size={13} className="shrink-0 mt-0.5" style={S_LINK} />
        <span>Customize the visual appearance of this article page. These settings affect how readers see the page on the I-Net Wiki.</span>
      </div>
      <div style={DM_SECTION_LEFT_GREEN}>
        <div className="text-[11px] mb-3 flex items-center gap-2" style={DM_SECTION_HDR_GREEN}>
          <Paintbrush size={11} /> Page Theme
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] block mb-1" style={labelStyle}>Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={pageFormBgColor} onChange={(e) => setPageFormBgColor(e.target.value)} className={colorInputClass} />
                <span className="text-[10px]" style={S_MUTED}>{pageFormBgColor}</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={labelStyle}>Header</label>
              <div className="flex items-center gap-2">
                <input type="color" value={pageFormHeaderColor} onChange={(e) => setPageFormHeaderColor(e.target.value)} className={colorInputClass} />
                <span className="text-[10px]" style={S_MUTED}>{pageFormHeaderColor}</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={labelStyle}>Accent</label>
              <div className="flex items-center gap-2">
                <input type="color" value={pageFormAccentColor} onChange={(e) => setPageFormAccentColor(e.target.value)} className={colorInputClass} />
                <span className="text-[10px]" style={S_MUTED}>{pageFormAccentColor}</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={labelStyle}>Text</label>
              <div className="flex items-center gap-2">
                <input type="color" value={pageFormTextColor} onChange={(e) => setPageFormTextColor(e.target.value)} className={colorInputClass} />
                <span className="text-[10px]" style={S_MUTED}>{pageFormTextColor}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] block mb-1" style={labelStyle}>Font Family</label>
              <select value={pageFormFont} onChange={(e) => setPageFormFont(e.target.value)} className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[12px] w-full outline-none`} style={selectDateStyle}>
                {PAGE_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={labelStyle}>Header Alignment</label>
              <div className="flex gap-1">
                {(["left", "center", "right"] as const).map((a) => (
                  <button key={a} onClick={() => setPageFormHeaderAlign(a)} className={`${retro.button} px-3 py-1 text-[11px] flex-1`} style={dmAlignBtn(pageFormHeaderAlign === a)}>
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-[11px]" style={S_TEXT}>
              <input type="checkbox" checked={pageFormUnderConstruction} onChange={(e) => setPageFormUnderConstruction(e.target.checked)} />
              Under Construction banner
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-[11px]" style={S_TEXT}>
              <input type="checkbox" checked={pageFormShowDividers} onChange={(e) => setPageFormShowDividers(e.target.checked)} />
              Show section dividers
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-[11px]" style={S_TEXT}>
              <input type="checkbox" checked={pageFormShowHitCounter} onChange={(e) => setPageFormShowHitCounter(e.target.checked)} />
              Show hit counter
            </label>
            {pageFormShowHitCounter && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] shrink-0" style={labelStyle}>Hits:</label>
                <input type="number" value={pageFormHitCount} onChange={(e) => setPageFormHitCount(parseInt(e.target.value) || 0)} className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[12px] w-24 outline-none`} style={inputStyle} />
              </div>
            )}
          </div>

          <button onClick={() => { setPageFormBgColor(DEFAULT_PAGE_STYLE.bgColor); setPageFormHeaderColor(DEFAULT_PAGE_STYLE.headerColor); setPageFormAccentColor(DEFAULT_PAGE_STYLE.accentColor); setPageFormTextColor(DEFAULT_PAGE_STYLE.textColor); setPageFormFont(DEFAULT_PAGE_STYLE.fontFamily); setPageFormHeaderAlign("center"); }} className="text-[10px] hover:underline" style={S_MUTED}>
            Reset to defaults
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4 pt-3" style={DM_BORDER_TOP}>
        <button onClick={handleSavePage} className="px-5 py-2 text-[13px] font-semibold transition-colors hover:opacity-90" style={S_SAVE_BTN}>
          <Save size={12} className="inline mr-1" />{isEditing ? "Publish changes" : "Publish article"}
        </button>
        {pageError && <span className="text-[11px]" style={S_RED}>{pageError}</span>}
      </div>
    </div>)}

    {wikiEditorTab === "list" && (<div>
      <div className="flex items-center justify-between mb-4 pb-3" style={DM_BORDER_B_ALT}>
        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={S_SUBTLE}>
            {sitePages.length} article{sitePages.length !== 1 ? "s" : ""} in the encyclopedia
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/interface/wiki-graph")} className="px-3 py-1.5 text-[11px] transition-colors hover:opacity-90 flex items-center gap-1" style={DM_BTN_GRAPH}>
            <GitBranch size={10} />Interlink Graph
          </button>
          <button onClick={() => navigate("/interface/wiki-editor/new")} className="px-4 py-1.5 text-[12px] font-semibold transition-colors hover:opacity-90" style={S_SAVE_BTN}>
            <Plus size={11} className="inline mr-1" />Create new article
          </button>
        </div>
      </div>

      {sitePages.length === 0 ? (
        <div className="text-center py-10">
          <Globe size={32} style={DM_EMPTY_ICON} />
          <div className="text-[13px] mb-2" style={S_MUTED}>No articles yet</div>
          <div className="text-[11px] mb-4" style={S_DIM}>Create your first wiki article to get started.</div>
          <button onClick={() => navigate("/interface/wiki-editor/new")} className="px-4 py-2 text-[12px]" style={DM_BTN_LINK}>
            <Plus size={11} className="inline mr-1" />Create article
          </button>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-semibold" style={DM_TABLE_HDR}>
            <div className="col-span-5">Article</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-1">Quality</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {sitePages.map((page) => {
            const qColors: Record<string, { c: string; bg: string; bc: string }> = { featured: { c: "#FFD700", bg: "#1A1A0A", bc: "#3A3A1A" }, good: { c: "#4A9A5A", bg: "#0A1A0A", bc: "#1A3A1A" }, start: { c: "#4A7BFF", bg: "#0A0A1A", bc: "#1A1A3A" }, stub: { c: "#FFAA4A", bg: "#1A1A0A", bc: "#3A3A1A" }, draft: { c: "#5A6A8A", bg: "#0A0A1A", bc: "#1A1A3A" } };
            const q = page.articleQuality || "start";
            const qc = qColors[q] || qColors.start;
            const hasContent = !!(page.body || (page.sections && page.sections.length > 0) || (page.panels && page.panels.length > 0));
            return (
              <div key={page.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center hover:bg-[#0A0A30] transition-colors cursor-pointer" style={DM_BORDER_B_DARK} onClick={() => navigate(`/interface/wiki-editor/${page.id}`)}>
                <div className="col-span-5 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12px] truncate hover:underline" style={DM_PAGE_TITLE}>{page.title}</span>
                    {!hasContent && <span className="text-[8px] px-1 shrink-0" style={DM_STUB_BADGE}>stub</span>}
                    {page.underConstruction && <span className="text-[8px] px-1 shrink-0" style={S_WARN}>WIP</span>}
                    {(page.infobox || []).length > 0 && <span className="text-[8px] shrink-0" style={DM_PURPLE_BTN}>&#9632;</span>}
                    {(page.subcategories || []).length > 0 && <span className="text-[8px] px-1 shrink-0" style={DM_SUBCAT_ICON}>🗂 {(page.subcategories || []).length}</span>}
                    {(page.panels || []).length > 0 && <span className="text-[8px] px-1 shrink-0" style={DM_PANELS_BADGE}>📋 {(page.panels || []).length}</span>}
                  </div>
                  <div className="text-[10px] truncate" style={DM_STYLE_DIM}>{page.description.length > 70 ? page.description.slice(0, 70) + "..." : page.description}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px]" style={S_LINK}>{page.category}</span>
                </div>
                <div className="col-span-1">
                  <span className="text-[9px] px-1.5 py-0.5" style={dmQualityBadge(qc)}>{q.charAt(0).toUpperCase() + q.slice(1)}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px]" style={S_MUTED}>{page.dateAdded}</span>
                </div>
                <div className="col-span-2 flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => navigate(`/interface/wiki-editor/${page.id}`)} className="px-2 py-1 text-[10px] hover:bg-[#1A1A5B] transition-colors" style={DM_BTN_EDIT_OUTLINE}>
                    <Edit size={10} className="inline mr-0.5" />Edit
                  </button>
                  <button onClick={() => handleRemovePage(page.id)} className="px-2 py-1 text-[10px] hover:bg-[#2A0A0A] transition-colors" style={DM_BTN_DELETE_OUTLINE}>
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-3 py-2 mt-1 text-[10px]" style={DM_FOOTER_DIM}>
            <span>{sitePages.filter(p => p.articleQuality === "featured").length} featured &middot; {sitePages.filter(p => p.articleQuality === "good").length} good &middot; {sitePages.filter(p => p.articleQuality === "stub" || p.articleQuality === "draft").length} stubs/drafts</span>
            <span>{sitePages.filter(p => (p.infobox || []).length > 0).length} with infoboxes &middot; {new Set(sitePages.map(p => p.category)).size} categories</span>
          </div>
        </div>
      )}
    </div>)}

    </div>
  </div>
  );
}
