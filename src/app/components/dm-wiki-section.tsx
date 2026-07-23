import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArchiveRestore,
  CornerDownRight,
  Edit,
  FileText,
  GitBranch,
  List,
  ListTree,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { retro } from "./retro-styles";
import {
  deleteWikiSite,
  loadWikiBootstrap,
  restoreWikiSite,
} from "@/lib/player-state-api";
import {
  DM_BORDER_B_DARK,
  DM_BTN_ADD_ARTICLE,
  DM_BTN_DELETE_OUTLINE,
  DM_BTN_EDIT_OUTLINE,
  DM_BTN_GRAPH,
  DM_COUNTER_DIM,
  DM_EMPTY_ICON,
  DM_FOOTER_DIM,
  DM_INFO_BAR,
  DM_PAGE_TITLE,
  DM_PANELS_BADGE,
  DM_ROW_BORDER,
  DM_STUB_BADGE,
  DM_TABLE_HDR,
} from "./dm-styles";
import { S_ACCENT, S_DIM, S_MUTED, S_RED, S_SUBTLE } from "./shared-styles";

export interface WikiSiteSummary {
  id: string;
  title: string;
  description?: string;
  category?: string;
  dateAdded?: string;
  createdAt?: string;
  updatedAt?: string;
  serverUpdatedAt?: string;
  articleQuality?: "featured" | "good" | "start" | "stub" | "draft";
  infobox?: unknown[];
  blocks?: unknown[];
  panels?: unknown[];
  relationships?: {
    id?: string;
    type?: string;
    targetArticleId?: string;
    note?: string;
  }[];
}

type ArticleLibrarySortMode = "alphabetical" | "families";

interface ArticleLibraryRow {
  page: WikiSiteSummary;
  depth: number;
  key: string;
  parentTitle?: string;
}

interface DeletedWikiSite {
  id: string;
  site?: WikiSiteSummary;
  deletedAt?: string;
}

interface DMWikiSectionProps {
  onPagesChange?: (pages: WikiSiteSummary[]) => void;
}

function formatDate(value?: string) {
  if (!value) return "Unknown date";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : value;
}

export function DMWikiSection({ onPagesChange }: DMWikiSectionProps) {
  const navigate = useNavigate();
  const [pages, setPages] = useState<WikiSiteSummary[]>([]);
  const [deletedSites, setDeletedSites] = useState<DeletedWikiSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<ArticleLibrarySortMode>("families");

  const publishPages = useCallback((nextPages: WikiSiteSummary[]) => {
    setPages(nextPages);
    onPagesChange?.(nextPages);
  }, [onPagesChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const bootstrap = await loadWikiBootstrap();
      publishPages(Array.isArray(bootstrap?.sites) ? bootstrap.sites as WikiSiteSummary[] : []);
      setDeletedSites(Array.isArray(bootstrap?.deletedSites) ? bootstrap.deletedSites as DeletedWikiSite[] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wiki articles");
    } finally {
      setLoading(false);
    }
  }, [publishPages]);

  useEffect(() => {
    void load();
  }, [load]);

  const libraryRows = useMemo<ArticleLibraryRow[]>(() => {
    const byTitle = (a: WikiSiteSummary, b: WikiSiteSummary) => (a.title || "").localeCompare(b.title || "");
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch = (page: WikiSiteSummary) => !normalizedQuery || [page.title, page.description, page.category, page.id]
      .some((value) => String(value || "").toLowerCase().includes(normalizedQuery));

    if (sortMode === "alphabetical") {
      return [...pages]
        .filter(matchesSearch)
        .sort(byTitle)
        .map((page) => ({ page, depth: 0, key: page.id }));
    }

    const pagesById = new Map(pages.map((page) => [page.id, page]));
    const childrenByParent = new Map<string, Set<string>>();
    const parentsByChild = new Map<string, Set<string>>();
    const addFamilyEdge = (parentId: string, childId: string) => {
      if (!pagesById.has(parentId) || !pagesById.has(childId) || parentId === childId) return;
      childrenByParent.set(parentId, new Set([...(childrenByParent.get(parentId) || []), childId]));
      parentsByChild.set(childId, new Set([...(parentsByChild.get(childId) || []), parentId]));
    };

    pages.forEach((source) => {
      (source.relationships || []).forEach((relationship) => {
        const targetId = relationship.targetArticleId || "";
        const type = (relationship.type || "").trim().toLowerCase();
        if (type === "parent of") addFamilyEdge(source.id, targetId);
        if (type === "child of") addFamilyEdge(targetId, source.id);
      });
    });

    const visibleIds = new Set(pages.filter(matchesSearch).map((page) => page.id));
    if (normalizedQuery) {
      const pending = [...visibleIds];
      while (pending.length > 0) {
        const childId = pending.pop()!;
        (parentsByChild.get(childId) || []).forEach((parentId) => {
          if (visibleIds.has(parentId)) return;
          visibleIds.add(parentId);
          pending.push(parentId);
        });
      }
    }

    const rows: ArticleLibraryRow[] = [];
    const encountered = new Set<string>();
    const visit = (pageId: string, depth: number, path: string[], parentTitle?: string) => {
      const page = pagesById.get(pageId);
      if (!page || path.includes(pageId) || !visibleIds.has(pageId)) return;
      const nextPath = [...path, pageId];
      rows.push({ page, depth, parentTitle, key: nextPath.join(">") });
      encountered.add(pageId);
      [...(childrenByParent.get(pageId) || [])]
        .map((childId) => pagesById.get(childId))
        .filter((child): child is WikiSiteSummary => Boolean(child))
        .sort(byTitle)
        .forEach((child) => visit(child.id, depth + 1, nextPath, page.title || "Untitled Article"));
    };

    const roots = pages
      .filter((page) => (parentsByChild.get(page.id)?.size || 0) === 0)
      .filter((page) => visibleIds.has(page.id))
      .sort(byTitle);
    roots.forEach((root) => visit(root.id, 0, []));
    pages.filter((page) => visibleIds.has(page.id) && !encountered.has(page.id)).sort(byTitle).forEach((page) => visit(page.id, 0, []));
    return rows;
  }, [pages, searchQuery, sortMode]);

  async function removePage(page: WikiSiteSummary) {
    const confirmed = window.confirm(
      `Move "${page.title || "Untitled Article"}" to Recently Deleted? You can restore it with its article data and inbound links.`,
    );
    if (!confirmed) return;
    setBusyId(page.id);
    setError("");
    setStatus("");
    try {
      const response = await deleteWikiSite(page.id, page.serverUpdatedAt);
      publishPages(Array.isArray(response?.sites) ? response.sites as WikiSiteSummary[] : pages.filter((entry) => entry.id !== page.id));
      setDeletedSites(Array.isArray(response?.deletedSites) ? response.deletedSites as DeletedWikiSite[] : deletedSites);
      setStatus(`Moved ${page.title || "article"} to Recently Deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete article");
    } finally {
      setBusyId("");
    }
  }

  async function restorePage(entry: DeletedWikiSite) {
    setBusyId(entry.id);
    setError("");
    setStatus("");
    try {
      const response = await restoreWikiSite(entry.id);
      publishPages(Array.isArray(response?.sites) ? response.sites as WikiSiteSummary[] : pages);
      setDeletedSites(Array.isArray(response?.deletedSites)
        ? response.deletedSites as DeletedWikiSite[]
        : deletedSites.filter((item) => item.id !== entry.id));
      setStatus(`Restored ${entry.site?.title || "article"} and its saved inbound links.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore article");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[16px] font-bold flex items-center gap-2" style={DM_PAGE_TITLE}>
            <FileText size={17} /> Article Library
          </div>
          <div className="text-[10px] mt-1" style={DM_COUNTER_DIM}>
            {pages.length} active article{pages.length === 1 ? "" : "s"} across {new Set(pages.map((page) => page.category || "Uncategorized")).size} categories
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void load()} disabled={loading || !!busyId} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1.5`} style={S_SUBTLE} title="Refresh article library">
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => navigate("/interface/wiki-graph")} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1.5`} style={DM_BTN_GRAPH}>
            <GitBranch size={11} /> Interlink Graph
          </button>
          <button onClick={() => navigate("/interface/wiki-editor/new")} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1.5`} style={DM_BTN_ADD_ARTICLE}>
            <Plus size={11} /> New Article
          </button>
        </div>
      </div>

      {(error || status) && (
        <div className="px-3 py-2 text-[11px]" style={error ? { ...DM_INFO_BAR, color: "#FFAAAA", borderColor: "#6A2A2A" } : DM_INFO_BAR}>
          {error || status}
        </div>
      )}

      <div className={`${retro.sunken} p-3 flex flex-col lg:flex-row gap-3 lg:items-center`} style={DM_ROW_BORDER}>
        <label className="relative flex-1 min-w-0">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={S_MUTED} />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search articles, categories, or descriptions..."
            className="w-full bg-[#080824] pl-9 pr-3 py-2 text-[11px] outline-none"
            style={{ color: "#D4E1FF", border: "1px solid #1A345B" }}
          />
        </label>
        <div className="grid grid-cols-2 shrink-0" role="group" aria-label="Article library sorting">
          <button
            onClick={() => setSortMode("families")}
            className={`${retro.button} px-3 py-2 text-[10px] flex items-center justify-center gap-1.5`}
            style={sortMode === "families" ? S_ACCENT : S_SUBTLE}
            title="Group parents and children into article families"
          >
            <ListTree size={11} /> Families
          </button>
          <button
            onClick={() => setSortMode("alphabetical")}
            className={`${retro.button} px-3 py-2 text-[10px] flex items-center justify-center gap-1.5`}
            style={sortMode === "alphabetical" ? S_ACCENT : S_SUBTLE}
            title="Sort all matching articles alphabetically"
          >
            <List size={11} /> A-Z
          </button>
        </div>
      </div>

      <div className={`${retro.sunken} overflow-hidden`} style={DM_ROW_BORDER}>
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] uppercase tracking-wider" style={DM_TABLE_HDR}>
          <span className="col-span-4">Article</span>
          <span className="col-span-2">Category</span>
          <span className="col-span-2">Quality</span>
          <span className="col-span-2">Updated</span>
          <span className="col-span-2 text-right">Actions</span>
        </div>

        {loading ? (
          <div className="px-4 py-12 text-center text-[12px]" style={S_MUTED}>Loading article library...</div>
        ) : libraryRows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileText size={34} className="mx-auto mb-3" style={DM_EMPTY_ICON} />
            <div className="text-[13px]" style={S_MUTED}>{pages.length === 0 ? "No active wiki articles" : "No articles match this search"}</div>
            {pages.length === 0
              ? <button onClick={() => navigate("/interface/wiki-editor/new")} className={`${retro.button} mt-3 px-4 py-2 text-[11px]`} style={S_ACCENT}>Create the first article</button>
              : <button onClick={() => setSearchQuery("")} className={`${retro.button} mt-3 px-4 py-2 text-[11px]`} style={S_ACCENT}>Clear search</button>}
          </div>
        ) : libraryRows.map(({ page, depth, key, parentTitle }) => (
          <div key={key} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center hover:bg-[#0A0A30] transition-colors cursor-pointer" style={DM_BORDER_B_DARK} onClick={() => navigate(`/interface/wiki-editor/${page.id}`)}>
            <div className="col-span-4 min-w-0">
              <div className="min-w-0" style={{ paddingLeft: sortMode === "families" ? Math.min(depth, 6) * 18 : 0 }}>
                <div className="flex items-center gap-1.5 min-w-0">
                  {sortMode === "families" && depth > 0 && <CornerDownRight size={11} className="shrink-0" style={S_DIM} />}
                  <div className="truncate text-[12px] font-semibold" style={DM_PAGE_TITLE}>{page.title || "Untitled Article"}</div>
                </div>
                <div className="truncate text-[9px] mt-0.5" style={S_DIM}>{parentTitle ? `Child of ${parentTitle}` : (page.description || page.id)}</div>
              </div>
            </div>
            <span className="col-span-2 truncate text-[10px]" style={S_SUBTLE}>{page.category || "Uncategorized"}</span>
            <div className="col-span-2 flex flex-wrap gap-1">
              <span className="text-[9px] px-1.5 py-0.5" style={DM_STUB_BADGE}>{page.articleQuality || "start"}</span>
              {(page.blocks?.length || page.panels?.length) ? <span className="text-[9px] px-1.5 py-0.5" style={DM_PANELS_BADGE}>{page.blocks?.length || page.panels?.length} blocks</span> : null}
            </div>
            <span className="col-span-2 text-[10px]" style={S_MUTED}>{formatDate(page.updatedAt || page.dateAdded)}</span>
            <div className="col-span-2 flex gap-1 justify-end" onClick={(event) => event.stopPropagation()}>
              <button onClick={() => navigate(`/interface/wiki-editor/${page.id}`)} className="px-2 py-1 text-[10px] hover:bg-[#1A1A5B] transition-colors" style={DM_BTN_EDIT_OUTLINE} title="Edit article">
                <Edit size={10} />
              </button>
              <button onClick={() => void removePage(page)} disabled={busyId === page.id} className="px-2 py-1 text-[10px] hover:bg-[#2A0A0A] transition-colors disabled:opacity-50" style={DM_BTN_DELETE_OUTLINE} title="Move to Recently Deleted">
                <Trash2 size={10} />
              </button>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[10px]" style={DM_FOOTER_DIM}>
          <span>{libraryRows.length} row{libraryRows.length === 1 ? "" : "s"} shown &middot; {pages.filter((page) => page.articleQuality === "featured").length} featured &middot; {pages.filter((page) => page.articleQuality === "good").length} good</span>
          <span>{sortMode === "families" ? "Multi-parent children repeat under each parent" : `${pages.filter((page) => (page.infobox || []).length > 0).length} with infoboxes`}</span>
        </div>
      </div>

      {deletedSites.length > 0 && (
        <div className={`${retro.sunken} overflow-hidden`} style={{ border: "1px solid #4A2A2A" }}>
          <div className="px-3 py-2 flex items-center justify-between" style={{ background: "#241010", borderBottom: "1px solid #4A2A2A" }}>
            <div className="text-[11px] font-semibold flex items-center gap-2" style={S_RED}>
              <Trash2 size={12} /> Recently Deleted ({deletedSites.length})
            </div>
            <div className="text-[9px]" style={S_MUTED}>Article data and inbound links are retained until restored.</div>
          </div>
          {deletedSites.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-3 py-2" style={DM_BORDER_B_DARK}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px]" style={S_SUBTLE}>{entry.site?.title || entry.id}</div>
                <div className="text-[9px]" style={S_DIM}>Deleted {formatDate(entry.deletedAt)}</div>
              </div>
              <button onClick={() => void restorePage(entry)} disabled={busyId === entry.id} className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1.5 disabled:opacity-50`} style={S_ACCENT}>
                <ArchiveRestore size={11} /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
