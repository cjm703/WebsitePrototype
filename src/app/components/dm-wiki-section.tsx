import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArchiveRestore,
  Edit,
  FileText,
  GitBranch,
  Plus,
  RefreshCw,
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

  const sortedPages = useMemo(
    () => [...pages].sort((a, b) => (a.title || "").localeCompare(b.title || "")),
    [pages],
  );

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
        ) : sortedPages.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileText size={34} className="mx-auto mb-3" style={DM_EMPTY_ICON} />
            <div className="text-[13px]" style={S_MUTED}>No active wiki articles</div>
            <button onClick={() => navigate("/interface/wiki-editor/new")} className={`${retro.button} mt-3 px-4 py-2 text-[11px]`} style={S_ACCENT}>Create the first article</button>
          </div>
        ) : sortedPages.map((page) => (
          <div key={page.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center hover:bg-[#0A0A30] transition-colors cursor-pointer" style={DM_BORDER_B_DARK} onClick={() => navigate(`/interface/wiki-editor/${page.id}`)}>
            <div className="col-span-4 min-w-0">
              <div className="truncate text-[12px] font-semibold" style={DM_PAGE_TITLE}>{page.title || "Untitled Article"}</div>
              <div className="truncate text-[9px] mt-0.5" style={S_DIM}>{page.description || page.id}</div>
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
          <span>{pages.filter((page) => page.articleQuality === "featured").length} featured &middot; {pages.filter((page) => page.articleQuality === "good").length} good</span>
          <span>{pages.filter((page) => (page.infobox || []).length > 0).length} with infoboxes</span>
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
