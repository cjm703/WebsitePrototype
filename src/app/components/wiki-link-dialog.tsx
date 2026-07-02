import React, { useState, useEffect, useRef } from "react";
import { retro } from "./retro-styles";
import { S_SUBTLE, S_LINK } from "./shared-styles";
import { X, Search, Link2, FileText, ExternalLink } from "lucide-react";

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

interface SitePage {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
  tags: string[];
}

// ═══════════════════════════════════════════
// Wiki Link Dialog
// ═══════════════════════════════════════════

export function WikiLinkDialog({
  open,
  onClose,
  onInsert,
  allPages,
  currentPageId,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (articleId: string, articleTitle: string, displayText: string) => void;
  allPages: SitePage[];
  currentPageId: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [displayText, setDisplayText] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedId(null);
      setDisplayText("");
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (selectedId) {
      const page = allPages.find((p) => p.id === selectedId);
      if (page && !displayText) setDisplayText(page.title);
    }
  }, [selectedId]);

  if (!open) return null;

  const otherPages = allPages.filter((p) => p.id !== currentPageId);
  const filtered = search.trim()
    ? otherPages.filter((p) =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase()) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : otherPages;

  const selectedPage = selectedId ? allPages.find((p) => p.id === selectedId) : null;

  const handleInsert = () => {
    if (!selectedId || !selectedPage) return;
    onInsert(selectedId, selectedPage.title, displayText.trim() || selectedPage.title);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[500px] max-h-[70vh] flex flex-col" style={{ background: "#0C0C2E", border: "2px solid #2A2A5B" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b-2" style={{ borderBottomColor: "#1A1A4B", background: "#0E0E35" }}>
          <div className="flex items-center gap-2">
            <Link2 size={14} style={S_LINK} />
            <span className="text-[13px]" style={{ color: "#C0D0F0", fontWeight: 600 }}>Insert Wiki Link</span>
          </div>
          <button onClick={onClose} className="hover:opacity-80"><X size={14} style={{ color: "#5A6A8A" }} /></button>
        </div>

        <div className="p-4 space-y-3">
          {/* Search */}
          <div className="flex items-center gap-2">
            <Search size={12} style={{ color: "#5A6A8A" }} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles..."
              className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] flex-1 outline-none`}
              style={{ color: "#C0D0F0" }}
            />
          </div>

          {/* Article list */}
          <div className={`${retro.sunken} bg-[#080820] max-h-[200px] overflow-y-auto`}>
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-[11px]" style={{ color: "#3A4A6A" }}>
                No articles found. Create some wiki articles first!
              </div>
            ) : (
              filtered.map((page) => {
                const isSelected = selectedId === page.id;
                return (
                  <button
                    key={page.id}
                    onClick={() => {
                      setSelectedId(page.id);
                      setDisplayText(page.title);
                    }}
                    className="w-full text-left px-3 py-2 transition-colors hover:bg-[#0A1A3A] flex items-start gap-2"
                    style={{
                      background: isSelected ? "#0A1A3A" : "transparent",
                      borderBottom: "1px solid #0A0A20",
                      border: isSelected ? "1px solid #2A4A6B" : undefined,
                    }}
                  >
                    <FileText size={11} className="shrink-0 mt-0.5" style={{ color: isSelected ? "#6A9AFF" : "#3A4A6A" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] truncate" style={{ color: isSelected ? "#C0D0F0" : "#7A8AAA", fontWeight: isSelected ? 600 : 400 }}>
                        {page.title}
                      </div>
                      <div className="text-[9px] truncate" style={{ color: "#3A4A6A" }}>
                        {page.category} {page.description ? `— ${page.description.substring(0, 60)}${page.description.length > 60 ? "..." : ""}` : ""}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Display text */}
          {selectedPage && (
            <div className="space-y-2 pt-2" style={{ borderTop: "1px solid #1A2A4B" }}>
              <div className="flex items-center gap-2 text-[10px]" style={{ color: "#5A6A8A" }}>
                <ExternalLink size={10} />
                Linking to: <span style={{ color: "#6A9AFF", fontWeight: 600 }}>{selectedPage.title}</span>
              </div>
              <div>
                <label className="text-[10px] block mb-1" style={{ color: "#5A6A8A", fontWeight: 600 }}>Display Text (what players see)</label>
                <input
                  type="text"
                  value={displayText}
                  onChange={(e) => setDisplayText(e.target.value)}
                  placeholder={selectedPage.title}
                  className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] w-full outline-none`}
                  style={{ color: "#C0D0F0" }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleInsert(); }}
                />
              </div>
              <div className="text-[9px] px-3 py-1.5" style={{ background: "#0A0A20", border: "1px solid #1A2A4B", color: "#4A5A7A" }}>
                Preview: <span style={{ color: "#6A9AFF", textDecoration: "underline" }}>{displayText || selectedPage.title}</span>
                <span style={{ color: "#3A4A6A" }}> → {selectedPage.title}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderTopColor: "#1A1A4B" }}>
          <button onClick={onClose} className={`${retro.button} px-4 py-1.5 text-[11px]`} style={S_SUBTLE}>
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!selectedId}
            className={`${retro.button} px-4 py-1.5 text-[11px]`}
            style={{
              color: selectedId ? "#FFFFFF" : "#3A4A6A",
              background: selectedId ? "#2A5ABB" : "#0A0A28",
              borderColor: selectedId ? "#4A7BFF" : "#1A2A4B",
              opacity: selectedId ? 1 : 0.5,
            }}
          >
            <Link2 size={10} className="inline mr-1" /> Insert Link
          </button>
        </div>
      </div>
    </div>
  );
}