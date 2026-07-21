import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { ArrowLeft, BookOpen, ShieldAlert } from "lucide-react";
import { retro } from "./retro-styles";
import { DMWikiSection, type WikiSiteSummary } from "./dm-wiki-section";
import { safeGetItem } from "./safe-storage";
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

export function WikiStudio() {
  const navigate = useNavigate();
  const currentUserId = safeGetItem("inet-user-id") || "";
  const [pages, setPages] = useState<WikiSiteSummary[]>([]);
  const blockPages = pages.filter((page) => Array.isArray(page.blocks) && page.blocks.length > 0).length;
  const categoryCount = new Set(pages.map((page) => page.category || "Uncategorized")).size;

  if (currentUserId !== "dm") return <Navigate to="/interface" replace />;

  return (
    <div className="min-h-screen flex flex-col" style={{ ...DM_PAGE_BG, fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif" }}>
      <div className={`${retro.toolbar} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/interface")} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1.5`} style={S_ACCENT}>
            <ArrowLeft size={12} /> Interface
          </button>
          <div className="flex items-center gap-2 text-[14px] font-semibold" style={DM_MAIN_TITLE}>
            <BookOpen size={16} /> Wiki Studio
          </div>
        </div>
        <button onClick={() => navigate("/interface/dm-area")} className={`${retro.button} px-3 py-1.5 text-[11px]`} style={DM_NAV_GREEN}>
          DM Area
        </button>
      </div>

      <div className="flex-1 p-4 md:p-6 space-y-4">
        <div className={`${retro.raised} bg-[#0E0E35] px-4 py-3 flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <h1 className="text-[18px] font-bold flex items-center gap-2" style={S_LABEL}>
              <BookOpen size={19} style={S_LINK} /> Campaign Wiki
            </h1>
            <div className="text-[10px] mt-1" style={S_DIM}>Create, connect, preview, recover, and publish campaign articles.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="px-2 py-1" style={{ background: "#09142D", border: "1px solid #1A345B", ...S_SUBTLE }}>{pages.length} articles</span>
            <span className="px-2 py-1" style={{ background: "#09142D", border: "1px solid #1A345B", ...S_SUBTLE }}>{blockPages} block layouts</span>
            <span className="px-2 py-1" style={{ background: "#09142D", border: "1px solid #1A345B", ...S_SUBTLE }}>{categoryCount} categories</span>
          </div>
        </div>

        <div className={`${retro.raised} bg-[#0E0E35] p-4 md:p-6`}>
          <DMWikiSection onPagesChange={setPages} />
        </div>

        <div className="flex items-center gap-2 text-[9px]" style={S_DIM}>
          <ShieldAlert size={10} style={S_RED} /> Wiki Studio is available only to the DM profile.
        </div>
      </div>
    </div>
  );
}
