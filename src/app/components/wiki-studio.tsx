import React, { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router";
import { ArrowLeft, BookOpen, Database, GitBranch, Images, ShieldAlert } from "lucide-react";
import { retro } from "./retro-styles";
import { DMWikiSection } from "./dm-wiki-section";
import { safeGetItem, safeGetJson } from "./safe-storage";
import { appStore } from "@/lib/app-store";
import {
  DM_MAIN_TITLE,
  DM_NAV_GREEN,
  DM_PAGE_BG,
  S_ACCENT,
  S_DIM,
  S_LABEL,
  S_LINK,
  S_RED,
  S_SUBTLE,
} from "./dm-styles";

interface SitePageSummary {
  id: string;
  title: string;
  category?: string;
  blocks?: unknown[];
}

export function WikiStudio() {
  const navigate = useNavigate();
  const currentUser = safeGetItem("inet-user") || "";
  const [pages, setPages] = useState<SitePageSummary[]>(() => safeGetJson("inet-dm-sites", []));
  const blockPages = pages.filter((page) => Array.isArray(page.blocks) && page.blocks.length > 0).length;
  const categories = new Set(pages.map((page) => page.category || "Uncategorized"));

  useEffect(() => {
    let cancelled = false;
    appStore.listSites<SitePageSummary>()
      .then((rows) => {
        if (!cancelled) setPages(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setPages(safeGetJson("inet-dm-sites", []));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (currentUser !== "DM") return <Navigate to="/interface" replace />;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ ...DM_PAGE_BG, fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif" }}
    >
      <div className={`${retro.toolbar} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/interface")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={S_ACCENT}>
            <ArrowLeft size={12} />
            Back
          </button>
          <span className="text-[11px]" style={S_DIM}>|</span>
          <span className="text-[11px] flex items-center gap-1" style={S_LINK}>
            <BookOpen size={12} />
            WIKI STUDIO
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/interface/wiki-graph")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={DM_NAV_GREEN}>
            <GitBranch size={12} />
            Graph
          </button>
          <button onClick={() => navigate("/interface/dm-area")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={S_SUBTLE}>
            <ShieldAlert size={12} />
            DM Area
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 py-6 xl:px-6 2xl:px-10 max-w-[1900px] mx-auto w-full">
        <div className="mb-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <BookOpen size={32} style={S_LINK} />
                <h1 className="text-[32px] tracking-tight" style={DM_MAIN_TITLE}>
                  Wiki Studio
                </h1>
              </div>
              <p className="text-[12px]" style={S_LABEL}>
                Standalone article management, block editing, and wiki structure tools
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 min-w-full sm:min-w-[430px] lg:min-w-[520px]">
              <div className={`${retro.sunken} px-3 py-2`} style={{ background: "#0A0A28", borderColor: "#1A2A4B" }}>
                <div className="text-[9px] uppercase tracking-[0.14em]" style={S_DIM}>Articles</div>
                <div className="text-[18px] mt-0.5" style={S_ACCENT}>{pages.length}</div>
              </div>
              <div className={`${retro.sunken} px-3 py-2`} style={{ background: "#0A0A28", borderColor: "#1A2A4B" }}>
                <div className="text-[9px] uppercase tracking-[0.14em]" style={S_DIM}>Block Pages</div>
                <div className="text-[18px] mt-0.5" style={S_LINK}>{blockPages}</div>
              </div>
              <div className={`${retro.sunken} px-3 py-2`} style={{ background: "#0A0A28", borderColor: "#1A2A4B" }}>
                <div className="text-[9px] uppercase tracking-[0.14em]" style={S_DIM}>Categories</div>
                <div className="text-[18px] mt-0.5" style={S_RED}>{categories.size}</div>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <button onClick={() => navigate("/interface/wiki-editor/new")} className={`${retro.raised} px-4 py-3 text-left hover:bg-[#161648] transition-colors`} style={{ background: "#0E0E35", borderColor: "#1A2A4B" }}>
              <div className="flex items-center gap-2 text-[12px]" style={S_ACCENT}>
                <BookOpen size={14} />
                Create Article
              </div>
              <div className="text-[10px] mt-1" style={S_DIM}>Open the full block editor immediately.</div>
            </button>
            <button onClick={() => navigate("/interface/wiki-graph")} className={`${retro.raised} px-4 py-3 text-left hover:bg-[#161648] transition-colors`} style={{ background: "#0E0E35", borderColor: "#1A2A4B" }}>
              <div className="flex items-center gap-2 text-[12px]" style={S_LINK}>
                <GitBranch size={14} />
                Interlink Graph
              </div>
              <div className="text-[10px] mt-1" style={S_DIM}>Inspect how articles connect through links and tags.</div>
            </button>
            <button onClick={() => navigate("/interface/dm-area")} className={`${retro.raised} px-4 py-3 text-left hover:bg-[#161648] transition-colors`} style={{ background: "#0E0E35", borderColor: "#1A2A4B" }}>
              <div className="flex items-center gap-2 text-[12px]" style={S_SUBTLE}>
                <Images size={14} />
                DM Systems
              </div>
              <div className="text-[10px] mt-1" style={S_DIM}>Players, cards, tags, images, and other campaign tools stay in DM Area.</div>
            </button>
          </div>
        </div>

        <div className={`${retro.raised} bg-[#0E0E35] p-6 flex-1`}>
          <div className="mb-4 flex items-start gap-2 px-3 py-2 text-[11px]" style={{ background: "#071632", border: "1px solid #1A345B", color: "#8EA9D7" }}>
            <Database size={13} className="shrink-0 mt-0.5" />
            <span>
              Wiki Studio is separated from DM Area. Article creation, article lists, graph access, and full block editing live here; shared DM data still saves to the same wiki storage.
            </span>
          </div>
          <DMWikiSection />
        </div>
      </div>
    </div>
  );
}
