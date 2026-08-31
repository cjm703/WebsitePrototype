import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { SearchLogo } from "./search-logo";
import { usePageVisibility } from "./use-visibility";
import { retro } from "./retro-styles";
import {
  Search, BookOpen, X, ArrowLeft, Shuffle, Tag, FolderOpen,
  FileText, Clock, Newspaper, ChevronRight, BookMarked, List,
  Star, ExternalLink, Info, Globe, Menu,
  Scroll, Milestone, CalendarDays,
} from "lucide-react";
import gnarpyImg from "@/assets/figma/Gnarpy_Boss1.png";
import { safeGetItem, safeGetJson } from "./safe-storage";
import { SUNKEN_INPUT, S_MUTED, S_DIM, S_ACCENT, S_TEXT, S_SUBTLE, S_LINK, S_ACCENT_HDR, S_TEXT_BOLD, S_WARN_HDR, S_WARN, S_LABEL, S_GREEN_BTN } from "./shared-styles";
import { getWikiBlockSearchText, type WikiArticleBlock } from "@/lib/wiki-article-blocks";
import { loadPlayerWikiBootstrap, loadPublicWikiBootstrap } from "@/lib/player-state-api";
import {
  getAuthenticatedPath,
  getWikiArticlePath,
  getWikiRootPath,
  getWikiSearchPath,
} from "@/lib/wiki-routes";
import {
  canExposeWikiArticle,
  canListWikiArticle,
  filterBrowsableWikiArticles,
} from "@/lib/wiki-visibility";

// ========================
// Types
// ========================
interface SearchResult {
  id: string;
  title: string;
  category: string;
  type: "article";
  description: string;
  tags: string[];
  meta: string;
  pageId: string;
  dateAdded: string;
  restricted?: boolean;
  articleQuality?: string;
}

interface SitePage {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
  dateAdded: string;
  createdAt?: string;
  updatedAt?: string;
  body?: string;
  sections?: { id: string; heading: string; body: string }[];
  articleQuality?: "featured" | "good" | "start" | "stub" | "draft";
  tags?: string[];
  infobox?: { label: string; value: string }[];
  relatedArticleIds?: string[];
  seeAlso?: string[];
  disambiguationNote?: string;
  references?: string[];
  lastEditSummary?: string;
  subtitle?: string;
  layoutVersion?: number;
  blocks?: WikiArticleBlock[];
  underConstruction?: boolean;
  pageIcon?: string;
  pageIconUrl?: string;
  accentColor?: string;
  subcategories?: { id: string; name: string; type: "folder" | "article"; articleId?: string; children: any[] }[];
  wikiTags?: string[];
  wikiTagFields?: Record<string, string>;
  playerVisibility?: Record<string, "visible" | "spoiler" | "hidden">;
}



// Strip HTML tags for plain text excerpts
function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

function formatWikiDate(value: string | undefined, fallback = "Unknown date") {
  const parsed = value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : fallback;
}

// Quality badge component
function QualityBadge({ quality }: { quality: string }) {
  const colors: Record<string, { c: string; bg: string; bc: string; label: string }> = {
    featured: { c: "#FFD700", bg: "#1A1A0A", bc: "#3A3A1A", label: "Featured" },
    good: { c: "#4A9A5A", bg: "#0A1A0A", bc: "#1A3A1A", label: "Good" },
    start: { c: "#4A7BFF", bg: "#0A0A1A", bc: "#1A1A3A", label: "Start" },
    stub: { c: "#FFAA4A", bg: "#1A1A0A", bc: "#3A3A1A", label: "Stub" },
    draft: { c: "#5A6A8A", bg: "#0A0A1A", bc: "#1A1A3A", label: "Draft" },
  };
  const q = colors[quality] || colors.start;
  return (
    <span className="text-[9px] px-1.5 py-0 shrink-0" style={{ color: q.c, background: q.bg, border: `1px solid ${q.bc}` }}>
      {q.label}
    </span>
  );
}

export function PublicInetSearch() {
  return <InetSearch publicMode />;
}

export function InetSearch({ publicMode = false }: { publicMode?: boolean }) {
  const isPageVisible = usePageVisibility();
  const [searchParams] = useSearchParams();
  const hasSearched = searchParams.has("q");
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [filterWikiTag, setFilterWikiTag] = useState<string>(searchParams.get("wikiTag") || "");
  const navigate = useNavigate();
  const motdRef = useRef<HTMLSpanElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsContainerRef = useRef<HTMLDivElement>(null);
  const resultsSuggestionsContainerRef = useRef<HTMLDivElement>(null);
  const gnarpyRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideHomepage = suggestionsContainerRef.current?.contains(target);
      const isInsideResults = resultsSuggestionsContainerRef.current?.contains(target);
      const isInsideGnarpy = gnarpyRef.current?.contains(target);
      const isInsideMenu = menuRef.current?.contains(target);
      if (!isInsideHomepage && !isInsideResults && !isInsideGnarpy) {
        setShowSuggestions(false);
      }
      if (!isInsideMenu) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const messagePool = ["Blobgorb"];

  const { message, color, rotation } = useMemo(() => {
    const msg = messagePool[Math.floor(Math.random() * messagePool.length)];
    const hue = Math.floor(Math.random() * 360);
    const sat = 60 + Math.floor(Math.random() * 40);
    const light = 50 + Math.floor(Math.random() * 30);
    const randomColor = `hsl(${hue}, ${sat}%, ${light}%)`;
    const rot = Math.floor(Math.random() * 31) - 15;
    return { message: msg, color: randomColor, rotation: rot };
  }, []);

  useEffect(() => {
    if (!isPageVisible) return;
    let animId: number;
    let start: number | null = null;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = (timestamp - start) / 1000;

      const rotSwing = Math.sin(elapsed * 1.5) * 8;
      const scalePulse = 1 + Math.sin(elapsed * 2.2) * 0.06;

      if (motdRef.current) {
        motdRef.current.style.transform = `rotate(${rotation + rotSwing}deg) scale(${scalePulse})`;
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [rotation, isPageVisible]);

  // ========================
  // Load all articles
  // ========================
  const currentUserId = publicMode ? "public" : (safeGetItem("inet-user-id") || "");
  const isDM = currentUserId === "dm";
  const wikiRootPath = getWikiRootPath(publicMode);
  const wikiSearchPath = (search = "") => getWikiSearchPath(publicMode, search);
  const wikiArticlePath = (articleId: string) => getWikiArticlePath(publicMode, articleId);
  const authenticatedPath = (path: string) => getAuthenticatedPath(publicMode, path);
  const [sitePages, setSitePages] = useState<SitePage[]>(() => safeGetJson("inet-dm-sites", []));
  const [wikiTagDefs, setWikiTagDefs] = useState<{ id: string; name: string; description: string }[]>(() => safeGetJson("inet-dm-wikiTags", []));

  useEffect(() => {
    let cancelled = false;
    const hydrateWikiData = async () => {
      try {
        const bootstrap = await (publicMode ? loadPublicWikiBootstrap() : loadPlayerWikiBootstrap());
        if (cancelled) return;
        setSitePages(Array.isArray(bootstrap?.sites) ? bootstrap.sites as SitePage[] : []);
        setWikiTagDefs(Array.isArray(bootstrap?.wikiTags) ? bootstrap.wikiTags : []);
      } catch {
        if (cancelled) return;
        setSitePages(safeGetJson("inet-dm-sites", []));
        setWikiTagDefs(safeGetJson("inet-dm-wikiTags", []));
      }
    };

    void hydrateWikiData();
    const onFocus = () => { void hydrateWikiData(); };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [publicMode]);

  const allPages = useMemo((): SitePage[] => {
    const raw: SitePage[] = sitePages;
    return isDM ? raw : raw.filter((page) => canListWikiArticle(page, currentUserId));
  }, [currentUserId, isDM, sitePages]);

  const contentPages = useMemo(
    () => filterBrowsableWikiArticles(allPages, currentUserId),
    [allPages, currentUserId],
  );

  const loadAllResults = useCallback((): SearchResult[] => {
    return allPages.map((page) => {
      const restricted = !canExposeWikiArticle(page, currentUserId);
      return {
        id: page.id,
        title: restricted ? "Spoiler-protected article" : page.title,
        category: restricted ? "Restricted" : page.category,
        type: "article" as const,
        description: restricted ? "Open this article to review its spoiler warning." : page.description,
        tags: restricted ? [] : [page.category, ...(page.tags || []), ...(page.wikiTags || [])],
        meta: restricted ? "Content hidden until revealed" : `Last updated: ${formatWikiDate(page.updatedAt, page.dateAdded)}`,
        pageId: page.id,
        dateAdded: page.dateAdded,
        restricted,
        articleQuality: restricted ? undefined : page.articleQuality,
      };
    });
  }, [allPages, currentUserId]);

  const allWikiTags = useMemo(() => {
    const tagSet = new Set<string>();
    contentPages.forEach((p) => (p.wikiTags || []).forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [contentPages]);

  const wikiTagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    contentPages.forEach((p) => (p.wikiTags || []).forEach((t) => {
      counts[t] = (counts[t] || 0) + 1;
    }));
    return counts;
  }, [contentPages]);

  const allResults = useMemo(() => loadAllResults(), [loadAllResults]);

  // Categories
  const categories = useMemo(() => {
    const catMap: Record<string, number> = {};
    contentPages.forEach((p) => {
      const cat = p.category || "Uncategorized";
      catMap[cat] = (catMap[cat] || 0) + 1;
    });
    return Object.entries(catMap).sort((a, b) => a[0].localeCompare(b[0]));
  }, [contentPages]);

  // Recently created (last 5)
  const recentArticles = useMemo(() => {
    return [...contentPages]
      .sort((a, b) => {
        const da = new Date(a.createdAt || a.dateAdded).getTime() || 0;
        const db = new Date(b.createdAt || b.dateAdded).getTime() || 0;
        return db - da;
      })
      .slice(0, 5);
  }, [contentPages]);

  // Featured article
  const featuredArticle = useMemo(() => {
    const featured = contentPages.filter((p) => p.articleQuality === "featured");
    if (featured.length > 0) return featured[Math.floor(Math.random() * featured.length)];
    const good = contentPages.filter((p) => p.articleQuality === "good");
    if (good.length > 0) return good[Math.floor(Math.random() * good.length)];
    if (contentPages.length > 0) return contentPages[Math.floor(Math.random() * contentPages.length)];
    return null;
  }, [contentPages]);

  // "Did you know" random facts
  const didYouKnow = useMemo(() => {
    const shuffled = [...contentPages].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3).map((p) => {
      const blockText = (p.blocks || []).map((block) => getWikiBlockSearchText(block)).join(" ");
      const plainBody = stripHtml([p.body || "", blockText].filter(Boolean).join(" "));
      const excerpt = plainBody.length > 100 ? plainBody.slice(0, 100) + "..." : plainBody;
      return { page: p, excerpt };
    });
  }, [contentPages]);

  // Article stats
  const stats = useMemo(() => {
    const total = contentPages.length;
    const featured = contentPages.filter(p => p.articleQuality === "featured").length;
    const good = contentPages.filter(p => p.articleQuality === "good").length;
    const stubs = contentPages.filter(p => p.articleQuality === "stub" || p.underConstruction).length;
    const withContent = contentPages.filter(p => p.body || (p.sections && p.sections.length > 0) || (p.blocks && p.blocks.length > 0)).length;
    return { total, featured, good, stubs, withContent };
  }, [contentPages]);

  // All unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    contentPages.forEach(p => {
      (p.tags || []).forEach(t => tagSet.add(t));
    });
    return Array.from(tagSet).sort();
  }, [contentPages]);

  // Articles by specific categories for menus
  const worldInfoArticles = useMemo(() => {
    return contentPages.filter(p => (p.category || "").toLowerCase() === "world info")
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [contentPages]);

  const featuresAndTermsArticles = useMemo(() => {
    return contentPages.filter(p => (p.category || "").toLowerCase() === "features and terms")
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [contentPages]);

  // Filter & sort for search results
  const filteredResults = useMemo(() => {
    const q = initialQuery.toLowerCase().trim();
    let results: SearchResult[];

    if (!q) {
      results = [...allResults];
    } else {
      results = allResults.filter((r) => {
        const page = allPages.find((entry) => entry.id === r.pageId);
        const blockText = page && canExposeWikiArticle(page, currentUserId)
          ? (page.blocks || []).map((block) => getWikiBlockSearchText(block)).join(" ").toLowerCase()
          : "";
        return (
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)) ||
          r.meta.toLowerCase().includes(q) ||
          blockText.includes(q)
        );
      });
    }

    if (filterWikiTag) {
      const matchIds = new Set(contentPages.filter((p) => (p.wikiTags || []).includes(filterWikiTag)).map((p) => p.id));
      results = results.filter((r) => matchIds.has(r.pageId));
    }

    results.sort((a, b) => a.title.localeCompare(b.title));
    return results;
  }, [initialQuery, allResults, filterWikiTag, allPages, contentPages, currentUserId]);

  // ========================
  // Handlers
  // ========================
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(wikiSearchPath(`q=${encodeURIComponent(query)}`));
  };

  const handleRandom = () => {
    if (contentPages.length === 0) return;
    const pick = contentPages[Math.floor(Math.random() * contentPages.length)];
    navigate(wikiArticlePath(pick.id));
  };

  const suggestions = [
    { label: "Intelli Interface", path: authenticatedPath("/interface") },
    { label: "I-Net Wiki", path: wikiRootPath },
    { label: "I-Net News", path: authenticatedPath("/interface/inet-news") },
    { label: "Personal Files", path: authenticatedPath("/interface/personal-files") },
    { label: "Wasp Office and Business", path: authenticatedPath("/interface/nexus-nomad") },
    { label: "Intelli Maps", path: authenticatedPath("/interface/intelli-maps") },
  ];

  // Gnarpy popup
  const renderGnarpyPopup = (position: "right" | "below-right") => {
    if (!showSuggestions) return null;

    const bubbleContent = (
      <div
        className="relative"
        style={{
          background: "#0E0E35",
          border: "2px solid #4A7BFF",
          borderRadius: 10,
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(74, 123, 255, 0.15)",
          width: 210,
        }}
      >
        <div className="p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px]" style={S_ACCENT_HDR}>
              Gnarpy suggests these!
            </span>
            <button
              onClick={() => setShowSuggestions(false)}
              className="hover:opacity-70"
              style={S_MUTED}
            >
              <X size={12} />
            </button>
          </div>
          <div
            className="h-[1px] mb-1.5"
            style={{ background: "linear-gradient(90deg, #4A7BFF44, transparent)" }}
          />
          <div className="space-y-0">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.path}
                onClick={() => {
                  navigate(suggestion.path);
                  setShowSuggestions(false);
                }}
                className="w-full text-left px-2 py-1 text-[11px] hover:bg-[#1A1A4B] transition-colors"
                style={{ color: "#C0D0F0", borderRadius: 3 }}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );

    if (position === "right") {
      return (
        <div
          ref={gnarpyRef}
          className="absolute top-0 z-50"
          style={{ left: "calc(100% + 12px)" }}
        >
          <div className="flex items-start gap-0">
            <img
              src={gnarpyImg}
              alt="Gnarpy"
              className="object-contain shrink-0 mt-1"
              style={{ width: 48, height: 48 }}
            />
            <div className="relative">
              {bubbleContent}
              <div
                className="absolute"
                style={{
                  left: -10, top: 16, width: 0, height: 0,
                  borderTop: "8px solid transparent",
                  borderBottom: "8px solid transparent",
                  borderRight: "12px solid #4A7BFF",
                }}
              />
              <div
                className="absolute"
                style={{
                  left: -7, top: 18, width: 0, height: 0,
                  borderTop: "6px solid transparent",
                  borderBottom: "6px solid transparent",
                  borderRight: "9px solid #0E0E35",
                }}
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={gnarpyRef}
        className="absolute z-50"
        style={{ top: "calc(100% + 8px)", right: 0 }}
      >
        <div className="flex items-start gap-0">
          <div className="relative">
            {bubbleContent}
            <div
              className="absolute"
              style={{
                right: -10, top: 16, width: 0, height: 0,
                borderTop: "8px solid transparent",
                borderBottom: "8px solid transparent",
                borderLeft: "12px solid #4A7BFF",
              }}
            />
            <div
              className="absolute"
              style={{
                right: -7, top: 18, width: 0, height: 0,
                borderTop: "6px solid transparent",
                borderBottom: "6px solid transparent",
                borderLeft: "9px solid #0E0E35",
              }}
            />
          </div>
          <img
            src={gnarpyImg}
            alt="Gnarpy"
            className="object-contain shrink-0 mt-1"
            style={{ width: 48, height: 48 }}
          />
        </div>
      </div>
    );
  };

  // Divider helper
  const WikiDivider = () => (
    <div
      className="h-[1px] my-3"
      style={{ background: "linear-gradient(90deg, transparent, #1A1A5B, #3A3A8B, #1A1A5B, transparent)" }}
    />
  );

  // Section box wrapper
  const WikiSection = ({ title, icon, children, className = "", headerRight }: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    headerRight?: React.ReactNode;
  }) => (
    <div className={`${retro.raised} bg-[#0E0E35] ${className}`}>
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ borderBottomColor: "#1A1A4B", background: "#0C0C30" }}
      >
        {icon}
        <span className="text-[13px] flex-1" style={S_ACCENT_HDR}>
          {title}
        </span>
        {headerRight}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );

  // ========================
  // Search results view
  // ========================
  if (hasSearched) {
    const searchTime = (Math.random() * 0.6 + 0.08).toFixed(2);
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{
          background: "#080830",
          fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
        }}
      >
        {/* Top bar */}
        <div
          className="border-b-2 px-3 sm:px-6 py-3"
          style={{
            background: "linear-gradient(180deg, #0E0E38 0%, #0A0A30 100%)",
            borderBottomColor: "#050520",
          }}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 max-w-[960px]">
            <button
              onClick={() => navigate(wikiRootPath)}
              className="flex items-center gap-1 cursor-pointer shrink-0 hover:opacity-80"
            >
              <SearchLogo size="small" />
            </button>

            <div className="flex-1 w-full sm:w-auto relative" ref={resultsSuggestionsContainerRef}>
              <form onSubmit={handleSearch} className="flex items-center gap-2">
                <div className={`${retro.sunken} bg-[#0C0C2E] p-1 flex items-center gap-1 flex-1`}>
                  <Search size={16} className="ml-1 shrink-0" style={{ color: "#3A5A9B" }} />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Search the wiki..."
                    className="flex-1 px-2 py-1.5 bg-[#0C0C2E] outline-none text-[14px]"
                    style={{ color: "#C0D0F0", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}
                  />
                </div>
                <button
                  type="submit"
                  className={`${retro.button} text-[12px] tracking-wide shrink-0`}
                  style={S_TEXT}
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={handleRandom}
                  className={`${retro.button} shrink-0 flex items-center justify-center px-1.5 self-stretch`}
                  style={S_WARN}
                  title="Random Article"
                >
                  <Shuffle size={12} />
                </button>
              </form>
              {renderGnarpyPopup("below-right")}
            </div>
          </div>
        </div>

        {/* Results info bar */}
        <div
          className="px-3 sm:px-6 py-1.5 border-b flex items-center gap-2"
          style={{ background: "#0C0C32", borderBottomColor: "#1A1A4B" }}
        >
          <BookOpen size={12} style={{ color: "#3A5A9B" }} />
          <div className="max-w-[960px]">
            <span className="text-[12px]" style={{ color: "#4A6A9A" }}>
              Wiki found{" "}
              <span style={S_ACCENT_HDR}>
                {filteredResults.length} article{filteredResults.length !== 1 ? "s" : ""}
              </span>
              {initialQuery ? (
                <span>
                  {" "}matching{" "}
                  <span style={S_TEXT_BOLD}>"{initialQuery}"</span>
                </span>
              ) : (
                <span> - showing all articles</span>
              )}
              {" "}({searchTime}s)
            </span>
          </div>
        </div>

        {/* Wiki Tag Filter */}
        {allWikiTags.length > 0 && (
          <div className="px-3 sm:px-6 pt-3 max-w-[960px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] shrink-0" style={S_MUTED}>Wiki Tags:</span>
              <button
                onClick={() => setFilterWikiTag("")}
                className="text-[9px] px-2 py-0.5 transition-colors"
                style={{
                  color: !filterWikiTag ? "#C0D0F0" : "#5A6A8A",
                  background: !filterWikiTag ? "#1A1A5B" : "transparent",
                  border: !filterWikiTag ? "1px solid #4A7BFF" : "1px solid #1A2A4B",
                }}
              >All</button>
              {allWikiTags.map((wt) => {
                const active = filterWikiTag === wt;
                const count = wikiTagCounts[wt] || 0;
                return (
                  <button
                    key={wt}
                    onClick={() => setFilterWikiTag(active ? "" : wt)}
                    className="text-[9px] px-2 py-0.5 flex items-center gap-1 transition-colors"
                    style={{
                      color: active ? "#C0D0F0" : "#7A6A9A",
                      background: active ? "#1A0A3A" : "transparent",
                      border: active ? "1px solid #4A3A6B" : "1px solid #1A1A3B",
                    }}
                  >
                    {wt} <span style={{ color: "#4A4A6A", fontSize: 8 }}>({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 px-3 sm:px-6 py-5 max-w-[960px]">
          {filteredResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <BookOpen size={32} className="mb-3" style={{ color: "#2A3A5A" }} />
              <span className="text-[14px] mb-2" style={{ color: "#4A6A9A" }}>
                No articles found
                {initialQuery && (
                  <span> matching <span style={S_TEXT_BOLD}>"{initialQuery}"</span></span>
                )}
              </span>
              <span className="text-[12px] mb-4" style={S_DIM}>
                Try different keywords or browse the full article index.
              </span>
              <button
                onClick={() => navigate(wikiSearchPath("q="))}
                className={`${retro.button} text-[12px] px-4 py-2`}
                style={S_ACCENT}
              >
                <List size={12} className="inline mr-1" />
                Browse All Articles
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              {filteredResults.map((result, index) => (
                <div key={result.id}>
                  <div className="py-3">
                    <div className="flex items-start gap-2">
                      <FileText size={13} className="mt-0.5 shrink-0" style={S_ACCENT} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <button
                            onClick={() => navigate(wikiArticlePath(result.pageId))}
                            className="text-[14px] underline hover:no-underline cursor-pointer text-left"
                            style={{ color: "#5A9AFF", fontWeight: 600 }}
                          >
                            {result.title}
                          </button>
                          {result.articleQuality && <QualityBadge quality={result.articleQuality} />}
                          {result.category && (
                            <button
                              onClick={() => navigate(wikiSearchPath(`q=${encodeURIComponent(result.category)}`))}
                              className="text-[9px] px-1.5 py-0 shrink-0 hover:opacity-70 cursor-pointer"
                              style={{
                                color: "#7A9ABB",
                                background: "#151545",
                                border: "1px solid #2A2A5B",
                              }}
                            >
                              {result.category}
                            </button>
                          )}
                        </div>
                        <p className="text-[12px] mt-0.5" style={S_SUBTLE}>
                          {result.description}
                        </p>
                        {result.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {result.tags.map((tag) => {
                              const isWikiTag = allWikiTags.includes(tag);
                              return (
                                <button
                                  key={tag}
                                  onClick={(e) => { e.stopPropagation(); if (isWikiTag) setFilterWikiTag(filterWikiTag === tag ? "" : tag); else navigate(wikiSearchPath(`q=${encodeURIComponent(tag)}`)); }}
                                  className="text-[9px] px-1.5 py-0 flex items-center gap-0.5 hover:opacity-70 cursor-pointer"
                                  style={{
                                    color: isWikiTag ? "#9A7ABB" : "#5A6A8A",
                                    background: isWikiTag ? "#1A0A2A" : "#0E0E35",
                                    border: `1px solid ${isWikiTag ? "#2A1A4B" : "#1A1A4B"}`,
                                  }}
                                >
                                  <Tag size={7} />
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <span className="text-[10px]" style={S_DIM}>
                          {result.meta}
                        </span>
                      </div>
                    </div>
                  </div>
                  {index < filteredResults.length - 1 && (
                    <div
                      className="h-[1px]"
                      style={{ background: "linear-gradient(90deg, #1A1A5B, #0C0C32, #1A1A5B)" }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="text-center pb-4 mt-8">
            <span className="text-[10px]" style={{ color: "#2A3A5A" }}>
              I-Net&trade; Wiki &middot; An Intelli Corporation Product &copy; 2026 &middot; {allResults.length} articles indexed
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ========================
  // Wiki Main Page (Wikipedia-style)
  // ========================
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "#080830",
        fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
      }}
    >
      {/* Top toolbar */}
      <div className={`${retro.toolbar} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(authenticatedPath("/interface"))}
            className="text-[11px] hover:opacity-80 flex items-center gap-1"
            style={S_ACCENT}
          >
            <ArrowLeft size={12} />
            Interface
          </button>
        </div>
        <span className="text-[11px]" style={S_DIM}>
          {allPages.length} article{allPages.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 px-4 py-6" style={{ background: "#080830" }}>
        <div className="max-w-[960px] mx-auto">

          {/* Wiki Header / Welcome Banner */}
          <div className={`${retro.raised} bg-[#0E0E35] mb-4`}>
            <div
              className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2"
              style={{ borderBottomColor: "#1A1A4B", background: "#0C0C30" }}
            >
              <div className="flex items-center gap-3">
                <SearchLogo size="small" />
                <span className="text-[10px] italic" style={S_MUTED}>
                  The only source of reliable info!
                </span>
              </div>
              {/* Navigation menus */}
              <div className="flex items-center gap-0" ref={menuRef}>
                {/* Explore menu */}
                <div className="relative">
                  <button
                    onClick={() => setOpenMenu(openMenu === "explore" ? null : "explore")}
                    className={`${retro.button} text-[11px] flex items-center gap-1 px-3 py-1`}
                    style={{ color: openMenu === "explore" ? "#C0D0F0" : "#4A7BFF" }}
                  >
                    <Menu size={11} />
                    Explore
                    <ChevronRight size={9} className={`transition-transform ${openMenu === "explore" ? "rotate-90" : ""}`} />
                  </button>
                  {openMenu === "explore" && (
                    <div
                      className="absolute top-full left-0 z-50 mt-1"
                      style={{
                        background: "#0E0E35",
                        border: "2px solid #2A2A5B",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                        minWidth: 160,
                      }}
                    >
                      <button
                        onClick={() => { navigate(wikiRootPath); setOpenMenu(null); }}
                        className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A4B] flex items-center gap-2 transition-colors"
                        style={S_TEXT}
                      >
                        <BookOpen size={11} style={S_ACCENT} />
                        Main Page
                      </button>
                      <div className="h-[1px]" style={{ background: "#1A1A4B" }} />
                      <button
                        onClick={() => { navigate(wikiSearchPath("q=")); setOpenMenu(null); }}
                        className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A4B] flex items-center gap-2 transition-colors"
                        style={S_TEXT}
                      >
                        <List size={11} style={S_ACCENT} />
                        All Pages
                      </button>
                      <div className="h-[1px]" style={{ background: "#1A1A4B" }} />
                      <button
                        onClick={() => {
                          const recentEl = document.getElementById("wiki-recent-changes");
                          if (recentEl) recentEl.scrollIntoView({ behavior: "smooth", block: "start" });
                          setOpenMenu(null);
                        }}
                        className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A4B] flex items-center gap-2 transition-colors"
                        style={S_TEXT}
                      >
                        <Clock size={11} style={S_ACCENT} />
                        Recent
                      </button>
                    </div>
                  )}
                </div>

                {/* World Info menu */}
                <div className="relative">
                  <button
                    onClick={() => setOpenMenu(openMenu === "worldinfo" ? null : "worldinfo")}
                    className={`${retro.button} text-[11px] flex items-center gap-1 px-3 py-1`}
                    style={{ color: openMenu === "worldinfo" ? "#C0D0F0" : "#4A7BFF" }}
                  >
                    <Globe size={11} />
                    World Info
                    <ChevronRight size={9} className={`transition-transform ${openMenu === "worldinfo" ? "rotate-90" : ""}`} />
                  </button>
                  {openMenu === "worldinfo" && (
                    <div
                      className="absolute top-full left-0 z-50 mt-1"
                      style={{
                        background: "#0E0E35",
                        border: "2px solid #2A2A5B",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                        minWidth: 180,
                        maxHeight: 300,
                        overflowY: "auto",
                      }}
                    >
                      <button
                        onClick={() => { navigate(wikiSearchPath(`q=${encodeURIComponent("World Info")}`)); setOpenMenu(null); }}
                        className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A4B] flex items-center gap-2 transition-colors"
                        style={S_WARN_HDR}
                      >
                        <FolderOpen size={11} />
                        Browse All World Info
                      </button>
                      {worldInfoArticles.length > 0 && (
                        <div className="h-[1px]" style={{ background: "#1A1A4B" }} />
                      )}
                      {worldInfoArticles.map((page) => (
                        <button
                          key={page.id}
                          onClick={() => { navigate(wikiArticlePath(page.id)); setOpenMenu(null); }}
                          className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#1A1A4B] flex items-center gap-2 transition-colors"
                          style={S_TEXT}
                        >
                          <FileText size={9} style={{ color: "#3A5A9B" }} />
                          <span className="truncate">{page.title}</span>
                        </button>
                      ))}
                      {worldInfoArticles.length === 0 && (
                        <div className="px-3 py-2 text-[10px]" style={S_DIM}>
                          No articles yet
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Features and Terms menu */}
                <div className="relative">
                  <button
                    onClick={() => setOpenMenu(openMenu === "features" ? null : "features")}
                    className={`${retro.button} text-[11px] flex items-center gap-1 px-3 py-1`}
                    style={{ color: openMenu === "features" ? "#C0D0F0" : "#4A7BFF" }}
                  >
                    <BookMarked size={11} />
                    Features & Terms
                    <ChevronRight size={9} className={`transition-transform ${openMenu === "features" ? "rotate-90" : ""}`} />
                  </button>
                  {openMenu === "features" && (
                    <div
                      className="absolute top-full right-0 z-50 mt-1"
                      style={{
                        background: "#0E0E35",
                        border: "2px solid #2A2A5B",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                        minWidth: 200,
                        maxHeight: 300,
                        overflowY: "auto",
                      }}
                    >
                      <button
                        onClick={() => { navigate(wikiSearchPath(`q=${encodeURIComponent("Features and Terms")}`)); setOpenMenu(null); }}
                        className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A4B] flex items-center gap-2 transition-colors"
                        style={S_WARN_HDR}
                      >
                        <FolderOpen size={11} />
                        Browse All Features & Terms
                      </button>
                      {featuresAndTermsArticles.length > 0 && (
                        <div className="h-[1px]" style={{ background: "#1A1A4B" }} />
                      )}
                      {featuresAndTermsArticles.map((page) => (
                        <button
                          key={page.id}
                          onClick={() => { navigate(wikiArticlePath(page.id)); setOpenMenu(null); }}
                          className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#1A1A4B] flex items-center gap-2 transition-colors"
                          style={S_TEXT}
                        >
                          <FileText size={9} style={{ color: "#3A5A9B" }} />
                          <span className="truncate">{page.title}</span>
                        </button>
                      ))}
                      {featuresAndTermsArticles.length === 0 && (
                        <div className="px-3 py-2 text-[10px]" style={S_DIM}>
                          No articles yet
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Campaign menu */}
                <div className="relative">
                  <button
                    onClick={() => setOpenMenu(openMenu === "campaign" ? null : "campaign")}
                    className={`${retro.button} text-[11px] flex items-center gap-1 px-3 py-1`}
                    style={{ color: openMenu === "campaign" ? "#C0D0F0" : "#4A7BFF" }}
                  >
                    <Scroll size={11} />
                    Campaign
                    <ChevronRight size={9} className={`transition-transform ${openMenu === "campaign" ? "rotate-90" : ""}`} />
                  </button>
                  {openMenu === "campaign" && (
                    <div
                      className="absolute top-full right-0 z-50 mt-1"
                      style={{
                        background: "#0E0E35",
                        border: "2px solid #2A2A5B",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                        minWidth: 180,
                      }}
                    >
                      <button
                        onClick={() => { navigate(authenticatedPath("/interface/inet-news")); setOpenMenu(null); }}
                        className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A4B] flex items-center gap-2 transition-colors"
                        style={S_TEXT}
                      >
                        <Newspaper size={11} style={S_ACCENT} />
                        News
                      </button>
                      <div className="h-[1px]" style={{ background: "#1A1A4B" }} />
                      <button
                        onClick={() => { navigate(authenticatedPath("/interface/session-log")); setOpenMenu(null); }}
                        className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A4B] flex items-center gap-2 transition-colors"
                        style={S_TEXT}
                      >
                        <CalendarDays size={11} style={S_ACCENT} />
                        Session Log
                      </button>
                      <div className="h-[1px]" style={{ background: "#1A1A4B" }} />
                      <button
                        onClick={() => { navigate(authenticatedPath("/interface/campaign-timeline")); setOpenMenu(null); }}
                        className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A4B] flex items-center gap-2 transition-colors"
                        style={S_TEXT}
                      >
                        <Milestone size={11} style={S_ACCENT} />
                        Campaign Timeline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1">
                  <h1 className="text-[22px] mb-2" style={{ color: "#C0D0F0", fontWeight: 700 }}>
                    Welcome to I-Net&trade; Wiki
                  </h1>
                  <p className="text-[13px] leading-relaxed" style={S_SUBTLE}>
                    The comprehensive encyclopedia of the realm, maintained by the scholars of the Intelli Corporation.
                    Currently serving <span style={S_ACCENT_HDR}>{stats.total.toLocaleString()}</span> article{stats.total !== 1 ? "s" : ""}
                    {stats.featured > 0 && <span>, including <span style={{ color: "#FFD700", fontWeight: 600 }}>{stats.featured}</span> featured</span>}
                    {stats.good > 0 && <span>{stats.featured > 0 ? " and " : ", including "}<span style={{ ...S_GREEN_BTN, fontWeight: 600 }}>{stats.good}</span> good</span>}.
                  </p>
                </div>
                <div className="shrink-0">
                  <BookOpen size={48} style={{ color: "#1A1A5B" }} />
                </div>
              </div>

              {/* Search bar */}
              <div className="mt-4 relative" ref={suggestionsContainerRef}>
                <form onSubmit={handleSearch}>
                  <div className={`${retro.sunken} bg-[#0C0C2E] p-1 flex items-center gap-2`}>
                    <Search size={16} className="ml-2 shrink-0" style={{ color: "#3A5A9B" }} />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onFocus={() => setShowSuggestions(true)}
                      placeholder="Search articles..."
                      className="flex-1 px-2 py-2 bg-[#0C0C2E] outline-none text-[14px]"
                      style={{ color: "#C0D0F0", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}
                    />
                    <button
                      type="submit"
                      className={`${retro.button} text-[12px] tracking-wide shrink-0 px-4 py-1.5`}
                      style={S_TEXT}
                    >
                      Search
                    </button>
                    <button
                      type="button"
                      onClick={handleRandom}
                      className={`${retro.button} shrink-0 flex items-center justify-center px-2 self-stretch`}
                      style={S_WARN}
                      title="Random Article"
                    >
                      <Shuffle size={14} />
                    </button>
                  </div>
                </form>
                {renderGnarpyPopup("right")}
              </div>
            </div>
          </div>

          {/* Featured Article */}
          {featuredArticle && (
            <div className={`${retro.raised} bg-[#0E0E35] mb-4`}>
              <div
                className="flex items-center gap-2 px-3 py-2 border-b"
                style={{ borderBottomColor: "#1A1A4B", background: "#0C0C30" }}
              >
                <Star size={14} style={{ color: "#FFD700" }} />
                <span className="text-[13px]" style={{ color: "#FFD700", fontWeight: 600 }}>
                  Featured Article
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => navigate(wikiArticlePath(featuredArticle.id))}
                      className="text-[18px] underline hover:no-underline cursor-pointer text-left mb-1 block"
                      style={{ color: "#5A9AFF", fontWeight: 700 }}
                    >
                      {featuredArticle.title}
                    </button>
                    {featuredArticle.subtitle && (
                      <p className="text-[12px] italic mb-2" style={S_LABEL}>
                        {featuredArticle.subtitle}
                      </p>
                    )}
                    <p className="text-[13px] leading-relaxed mb-2" style={S_SUBTLE}>
                      {featuredArticle.description}
                    </p>
                    {featuredArticle.body && (
                      <p className="text-[12px] leading-relaxed" style={S_MUTED}>
                        {(() => {
                      const plain = stripHtml([featuredArticle.body || "", ...(featuredArticle.blocks || []).map((block) => getWikiBlockSearchText(block))].join(" "));
                          return plain.length > 200 ? plain.slice(0, 200) + "..." : plain;
                        })()}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      <button
                        onClick={() => navigate(wikiArticlePath(featuredArticle.id))}
                        className="text-[11px] flex items-center gap-1 hover:underline"
                        style={S_ACCENT}
                      >
                        Read full article <ChevronRight size={10} />
                      </button>
                      <span className="text-[10px] px-1.5 py-0" style={{ color: "#5A7ABB", background: "#151545", border: "1px solid #2A2A5B" }}>
                        {featuredArticle.category}
                      </span>
                    </div>
                  </div>
                  {/* Infobox preview */}
                  {(featuredArticle.infobox || []).length > 0 && (
                    <div
                      className={`${retro.raised} shrink-0 hidden sm:block`}
                      style={{ background: "#0C0C30", width: 180 }}
                    >
                      <div className="px-2 py-1.5 border-b text-center" style={{ borderBottomColor: "#1A1A4B", background: "#0A0A28" }}>
                        <span className="text-[10px]" style={S_ACCENT_HDR}>Quick Facts</span>
                      </div>
                      <div className="p-2 space-y-1">
                        {(featuredArticle.infobox || []).slice(0, 4).map((row, idx) => (
                          <div key={idx} className="flex justify-between gap-1">
                            <span className="text-[9px]" style={S_MUTED}>{row.label}</span>
                            <span className="text-[9px] text-right" style={S_SUBTLE}>{row.value}</span>
                          </div>
                        ))}
                        {(featuredArticle.infobox || []).length > 4 && (
                          <span className="text-[8px]" style={S_DIM}>+{(featuredArticle.infobox || []).length - 4} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Welcome */}
          <WikiSection
            title="Welcome to the I-Net Wiki"
            icon={<Globe size={14} style={S_ACCENT} />}
            className="mb-4"
          >
            <div className="text-[13px] leading-relaxed" style={{ color: "#8A9ABB" }}>
              <p className="mb-2">
                The <span style={{ color: "#5A9AFF", fontWeight: 600 }}>I-Net Wiki Encyclopedia</span> is your comprehensive guide to everything within our campaign world. This community-curated archive serves as the collective memory of our adventure - chronicling the lands we explore, the heroes and villains we encounter, and the lore that binds it all together.
              </p>
              <p style={{ color: "#6A7A9A" }}>
                Browse by category, search for specific topics, or explore a random article. All entries are maintained by the Dungeon Master and may evolve as the story unfolds.
              </p>
            </div>
          </WikiSection>

          {/* Introduction */}
          <WikiSection
            title="Introduction"
            icon={<BookOpen size={14} style={S_ACCENT} />}
            className="mb-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <FolderOpen size={12} style={{ color: "#5A9AFF" }} />
                  <span className="text-[12px] font-semibold" style={{ color: "#5A9AFF" }}>Browse</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: "#6A7A9A" }}>
                  Explore articles organized by category - from <span style={S_SUBTLE}>Characters</span> and <span style={S_SUBTLE}>Locations</span> to <span style={S_SUBTLE}>Lore</span> and <span style={S_SUBTLE}>Items</span>. Use the category portals below to find what you need.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Search size={12} style={{ color: "#5A9AFF" }} />
                  <span className="text-[12px] font-semibold" style={{ color: "#5A9AFF" }}>Search</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: "#6A7A9A" }}>
                  Use the search bar above to find articles by title, description, or body content. Results are ranked by relevance and displayed with highlighted matches.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock size={12} style={{ color: "#5A9AFF" }} />
                  <span className="text-[12px] font-semibold" style={{ color: "#5A9AFF" }}>Stay Current</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: "#6A7A9A" }}>
                  Check the <span style={S_SUBTLE}>Recent</span> section for the latest additions and updates. The wiki is a living document that grows with every session.
                </p>
              </div>
            </div>
            <div
              className="mt-3 pt-3 flex items-center gap-3 flex-wrap"
              style={{ borderTop: "1px solid #1A1A4B" }}
            >
              <span className="text-[10px]" style={S_DIM}>Quick stats:</span>
              <span className="text-[10px] px-1.5 py-0.5" style={{ ...S_LABEL, background: "#0C0C30", border: "1px solid #1A1A4B" }}>
                {allPages.length} article{allPages.length !== 1 ? "s" : ""}
              </span>
              <span className="text-[10px] px-1.5 py-0.5" style={{ ...S_LABEL, background: "#0C0C30", border: "1px solid #1A1A4B" }}>
                {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
              </span>
              <span className="text-[10px] px-1.5 py-0.5" style={{ ...S_LABEL, background: "#0C0C30", border: "1px solid #1A1A4B" }}>
                {allTags.length} tag{allTags.length !== 1 ? "s" : ""}
              </span>
            </div>
          </WikiSection>

          {/* Main content grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Left column: Categories + Did You Know + Tags + Article Index (bigger) */}
            <div className="md:col-span-2 space-y-4">
              {/* Categories Portal */}
              <WikiSection
                title="Categories"
                icon={<FolderOpen size={14} style={S_ACCENT} />}
                headerRight={
                  <span className="text-[9px]" style={S_DIM}>{categories.length}</span>
                }
              >
                {categories.length === 0 ? (
                  <span className="text-[12px]" style={S_DIM}>
                    No categories yet.
                  </span>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                    {categories.map(([cat, count]) => (
                      <button
                        key={cat}
                        onClick={() => navigate(wikiSearchPath(`q=${encodeURIComponent(cat)}`))}
                        className="w-full text-left flex items-center justify-between px-2 py-2 text-[12px] hover:bg-[#1A1A4B] transition-colors"
                        style={{ color: "#B0C0E0", borderRadius: 3 }}
                      >
                        <span className="flex items-center gap-1.5">
                          <ChevronRight size={10} style={S_ACCENT} />
                          {cat}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0"
                          style={{
                            ...S_LABEL,
                            background: "#0A0A28",
                            border: "1px solid #1A1A4B",
                            borderRadius: 2,
                          }}
                        >
                          {count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </WikiSection>

              {/* Did You Know */}
              {didYouKnow.length > 0 && (
                <WikiSection
                  title="Did you know..."
                  icon={<Info size={14} style={S_ACCENT} />}
                >
                  <div className="space-y-2">
                    {didYouKnow.map(({ page, excerpt }) => (
                      <div key={page.id} className="text-[11px]" style={S_SUBTLE}>
                        <span style={S_LABEL}>...</span> that{" "}
                        <button
                          onClick={() => navigate(wikiArticlePath(page.id))}
                          className="underline hover:no-underline"
                          style={{ color: "#5A9AFF" }}
                        >
                          {page.title}
                        </button>
                        {excerpt ? ` - ${excerpt}` : "?"}
                      </div>
                    ))}
                  </div>
                </WikiSection>
              )}

              {/* Tags Cloud */}
              {allTags.length > 0 && (
                <WikiSection
                  title="Tags"
                  icon={<Tag size={14} style={S_ACCENT} />}
                >
                  <div className="flex flex-wrap gap-1">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => navigate(wikiSearchPath(`q=${encodeURIComponent(tag)}`))}
                        className="text-[10px] px-2 py-0.5 hover:bg-[#1A1A5B] transition-colors"
                        style={{ ...SUNKEN_INPUT, color: "#7A9ABB", borderRadius: 2 }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </WikiSection>
              )}

              {/* Article Index */}
              {allPages.length > 0 && (
                <WikiSection
                  title={`Article Index`}
                  icon={<BookMarked size={14} style={S_ACCENT} />}
                  headerRight={
                    <span className="text-[9px]" style={S_DIM}>{allPages.length} articles</span>
                  }
                >
                  {/* Alphabetical grouping */}
                  {(() => {
                    const sorted = [...allPages].sort((a, b) => a.title.localeCompare(b.title));
                    const groups: Record<string, SitePage[]> = {};
                    sorted.forEach((p) => {
                      const letter = (p.title[0] || "#").toUpperCase();
                      if (!groups[letter]) groups[letter] = [];
                      groups[letter].push(p);
                    });
                    const letters = Object.keys(groups).sort();

                    return (
                      <div>
                        {/* Letter nav */}
                        <div className="flex flex-wrap gap-1 mb-3 pb-2" style={{ borderBottom: "1px solid #1A1A4B" }}>
                          {letters.map((letter) => (
                            <button
                              key={letter}
                              onClick={() => {
                                const el = document.getElementById(`wiki-letter-${letter}`);
                                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                              }}
                              className="text-[11px] px-1.5 py-0.5 hover:bg-[#1A1A5B] transition-colors"
                              style={S_ACCENT_HDR}
                            >
                              {letter}
                            </button>
                          ))}
                        </div>

                        {/* Articles by letter */}
                        <div className="space-y-3">
                          {letters.map((letter) => (
                            <div key={letter} id={`wiki-letter-${letter}`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[14px]" style={{ color: "#4A7BFF", fontWeight: 700 }}>
                                  {letter}
                                </span>
                                <div className="flex-1 h-[1px]" style={{ background: "#1A1A4B" }} />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">
                                {groups[letter].map((page) => (
                                  <button
                                    key={page.id}
                                    onClick={() => navigate(wikiArticlePath(page.id))}
                                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-[12px] hover:bg-[#1A1A4B] transition-colors"
                                    style={{ color: "#B0C0E0", borderRadius: 3 }}
                                  >
                                    <FileText size={9} className="shrink-0" style={{ color: "#3A5A9B" }} />
                                    <span className="truncate underline hover:no-underline" style={{ color: "#5A9AFF" }}>
                                      {page.title}
                                    </span>
                                    {page.articleQuality && <QualityBadge quality={page.articleQuality} />}
                                    <span
                                      className="text-[9px] px-1 shrink-0"
                                      style={{ ...SUNKEN_INPUT, color: "#4A6A9A" }}
                                    >
                                      {page.category}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </WikiSection>
              )}
            </div>

            {/* Right column: Recent Changes (compact) */}
            <div className="md:col-span-1 space-y-4" id="wiki-recent-changes">
              <WikiSection
                title="Recent"
                icon={<Clock size={14} style={S_ACCENT} />}
                headerRight={
                  <button
                    onClick={() => navigate(wikiSearchPath("q="))}
                    className="text-[9px] hover:underline"
                    style={S_ACCENT}
                  >
                    View all
                  </button>
                }
              >
                {recentArticles.length === 0 ? (
                  <span className="text-[12px]" style={S_DIM}>
                    No articles yet.
                  </span>
                ) : (
                  <div className="space-y-0">
                    {recentArticles.map((page, idx) => (
                      <div key={page.id}>
                        <div className="flex items-start gap-1.5 px-1 py-1.5 hover:bg-[#0C0C30] transition-colors" style={{ borderRadius: 3 }}>
                          <FileText size={10} className="mt-0.5 shrink-0" style={{ color: "#5A9AFF" }} />
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => navigate(wikiArticlePath(page.id))}
                              className="text-[11px] underline hover:no-underline cursor-pointer text-left block truncate w-full"
                              style={{ color: "#5A9AFF", fontWeight: 600 }}
                            >
                              {page.title}
                            </button>
                            <span className="text-[9px] flex items-center gap-1" style={S_DIM}>
                              <Clock size={7} />
                              {page.dateAdded}
                            </span>
                          </div>
                        </div>
                        {idx < recentArticles.length - 1 && (
                          <div className="h-[1px] mx-1" style={{ background: "#1A1A4B" }} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </WikiSection>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center pb-4 flex flex-col items-center gap-1">
            <WikiDivider />
            <span className="text-[10px]" style={S_DIM}>
              I-Net&trade; Wiki is a project of the Intelli Corporation. Content is available under the Intelli Free Documentation License.
            </span>
            <span className="text-[9px]" style={{ color: "#2A3A5A" }}>
              Best viewed at 800x600 &middot; I-Net&trade; Wiki &copy; 2026
            </span>
            <span
              ref={motdRef}
              className="text-[12px] mt-2 inline-block"
              style={{
                color: color,
                transform: `rotate(${rotation}deg)`,
                fontFamily: "'Courier New', monospace",
                fontWeight: 700,
              }}
            >
              {message}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
