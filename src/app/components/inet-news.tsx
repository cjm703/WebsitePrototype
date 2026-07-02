import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router";
import { SearchLogo } from "./search-logo";
import { retro } from "./retro-styles";
import { S_MUTED, S_DIM, S_ACCENT, S_SUBTLE, S_TEXT_BOLD, S_SECTION_HDR, DISPLAY_CONTENTS } from "./shared-styles";
import {
  ArrowLeft, Clock, User, ChevronRight, Newspaper, Search, Globe,
} from "lucide-react";
import { RenderFormattedText } from "./render-text";
import { appStore } from "@/lib/app-store";
import type { NewsArticle } from "./types";

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

function timeAgo(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = Date.now();
    const then = d.getTime();
    const diffMs = now - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(dateStr);
  } catch {
    return dateStr;
  }
}

export function InetNews() {
  const navigate = useNavigate();
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [newsRows, setNewsRows] = useState<NewsArticle[]>([]);

  useEffect(() => {
    let cancelled = false;
    void appStore.listNews<NewsArticle>().then((rows) => { if (!cancelled) setNewsRows(rows); }).catch(() => { if (!cancelled) setNewsRows([]); });
    return () => { cancelled = true; };
  }, []);

  const articles: NewsArticle[] = useMemo(() => {
    return [...newsRows].sort((a, b) => {
      const da = new Date(a.publishedAt).getTime();
      const db = new Date(b.publishedAt).getTime();
      if (!isNaN(da) && !isNaN(db)) return db - da;
      return a.publishedAt.localeCompare(b.publishedAt);
    });
  }, [newsRows]);

  const featuredArticles = articles.filter((a) => a.isFeatured);
  const latestArticles = articles.slice(0, 5);
  const pastArticles = articles.slice(5);

  // Category color map
  const categoryColor = (cat: string): string => {
    const c = cat.toLowerCase();
    if (c.includes("breaking") || c.includes("urgent")) return "#FF6A6A";
    if (c.includes("tech") || c.includes("cyber")) return "#4A7BFF";
    if (c.includes("corporate") || c.includes("business")) return "#4A9A5A";
    if (c.includes("crime") || c.includes("security")) return "#FFAA4A";
    if (c.includes("science") || c.includes("research")) return "#AA6AFF";
    if (c.includes("opinion") || c.includes("editorial")) return "#6AAACC";
    return "#5A7ABB";
  };

  const handleToggleArticle = (id: string) => {
    setExpandedArticle((prev) => (prev === id ? null : id));
  };

  // ========================
  // Render
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
            onClick={() => navigate("/interface")}
            className="text-[11px] hover:opacity-80 flex items-center gap-1"
            style={S_ACCENT}
          >
            <ArrowLeft size={12} />
            Back
          </button>
          <span className="text-[11px]" style={S_DIM}>|</span>
          <span className="text-[11px]" style={S_DIM}>I-Net News</span>
        </div>
        <span className="text-[11px]" style={S_DIM}>
          Sunday, February 22, 2026
        </span>
      </div>

      {/* Header bar */}
      <div
        className="border-b-2 px-3 sm:px-6 py-3"
        style={{
          background: "linear-gradient(180deg, #0E0E38 0%, #0A0A30 100%)",
          borderBottomColor: "#050520",
        }}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 max-w-[960px] mx-auto">
          <button
            onClick={() => navigate("/interface/inet-search")}
            className="flex items-center gap-1 cursor-pointer shrink-0 hover:opacity-80"
          >
            <SearchLogo size="small" />
          </button>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/interface/inet-search")}
              className="text-[12px] px-3 py-1 hover:opacity-80"
              style={S_MUTED}
            >
              <Globe size={11} className="inline mr-1" />
              Wiki
            </button>
            <button
              className={`${retro.sunken} text-[12px] px-3 py-1`}
              style={{ color: "#FFAA4A", background: "#0C0C2E" }}
            >
              <Newspaper size={11} className="inline mr-1" />
              News
            </button>
          </div>
        </div>
      </div>

      {/* Masthead */}
      <div
        className="px-3 sm:px-6 py-4 border-b"
        style={{
          background: "linear-gradient(180deg, #0C0C32 0%, #0A0A2E 100%)",
          borderBottomColor: "#1A1A4B",
        }}
      >
        <div className="max-w-[960px] mx-auto text-center">
          <h1
            className="tracking-widest uppercase mb-1"
            style={{
              color: "#C0D0F0",
              fontFamily: "'Georgia', 'Times New Roman', serif",
              letterSpacing: "0.25em",
            }}
          >
            I-NET NEWS
          </h1>
          <div
            className="h-[2px] w-full mb-2"
            style={{ background: "linear-gradient(90deg, transparent, #3A3A8B, transparent)" }}
          />
          <div className="flex items-center justify-center gap-4">
            <span className="text-[10px]" style={S_DIM}>
              An Intelli Corporation Publication
            </span>
            <span className="text-[10px]" style={S_DIM}>|</span>
            <span className="text-[10px]" style={S_DIM}>
              Sunday, February 22, 2026
            </span>
            <span className="text-[10px]" style={S_DIM}>|</span>
            <span className="text-[10px]" style={S_DIM}>
              {articles.length} article{articles.length !== 1 ? "s" : ""} indexed
            </span>
          </div>
          <div
            className="h-[1px] w-full mt-2"
            style={{ background: "linear-gradient(90deg, transparent, #1A1A5B, transparent)" }}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 px-3 sm:px-6 py-5 max-w-[960px] mx-auto w-full">
        {articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Newspaper size={40} style={{ color: "#1A1A4B" }} className="mb-4" />
            <span className="text-[14px] mb-2" style={{ color: "#4A6A9A" }}>
              No news articles available
            </span>
            <span className="text-[12px]" style={S_DIM}>
              The DM has not published any news yet. Check back later.
            </span>
          </div>
        ) : (
          <div style={DISPLAY_CONTENTS}>
            {/* FEATURED / BREAKING NEWS */}
            {featuredArticles.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-2 h-2"
                    style={{ background: "#FF6A6A", animation: "pulse 1.5s infinite" }}
                  />
                  <span
                    className="text-[11px] tracking-widest uppercase"
                    style={{ color: "#FF6A6A", fontWeight: 600 }}
                  >
                    Breaking / Featured
                  </span>
                </div>
                <div className="space-y-3">
                  {featuredArticles.map((article) => (
                    <div
                      key={article.id}
                      className={`${retro.raised} p-4 cursor-pointer hover:bg-[#12124B] transition-colors`}
                      style={{
                        background: "linear-gradient(135deg, #10103A 0%, #0E0E35 100%)",
                        borderLeftWidth: "4px",
                        borderLeftColor: categoryColor(article.category),
                      }}
                      onClick={() => handleToggleArticle(article.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span
                              className="text-[9px] px-1.5 py-0 uppercase tracking-wider shrink-0"
                              style={{
                                color: categoryColor(article.category),
                                background: "#0A0A28",
                                border: `1px solid ${categoryColor(article.category)}40`,
                              }}
                            >
                              {article.category}
                            </span>
                            {article.isFeatured && (
                              <span
                                className="text-[8px] px-1.5 py-0 uppercase tracking-wider"
                                style={{
                                  color: "#FF6A6A",
                                  background: "#2A0A0A",
                                  border: "1px solid #FF6A6A40",
                                }}
                              >
                                Featured
                              </span>
                            )}
                          </div>
                          <h3
                            className="mb-1"
                            style={S_TEXT_BOLD}
                          >
                            {article.headline}
                          </h3>
                          <p className="text-[12px] mb-2" style={S_SUBTLE}>
                            {article.summary}
                          </p>
                          <div className="flex items-center gap-3 text-[10px]" style={{ color: "#4A5A7A" }}>
                            <span className="flex items-center gap-1">
                              <User size={9} />{article.author}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={9} />{timeAgo(article.publishedAt)}
                            </span>
                          </div>
                        </div>
                        <ChevronRight
                          size={16}
                          className="shrink-0 mt-1 transition-transform"
                          style={{
                            color: "#4A5A7A",
                            transform: expandedArticle === article.id ? "rotate(90deg)" : "rotate(0deg)",
                          }}
                        />
                      </div>

                      {/* Expanded body */}
                      {expandedArticle === article.id && (
                        <div
                          className="mt-3 pt-3"
                          style={{ borderTop: "1px solid #1A1A4B" }}
                        >
                          <RenderFormattedText text={article.body} color="#9AAABB" baseSize={12} />
                          <div className="mt-3 text-[10px]" style={S_DIM}>
                            Published: {formatDate(article.publishedAt)}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LATEST NEWS */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="h-[2px] flex-1"
                  style={{ background: "linear-gradient(90deg, #2A2A5B, transparent)" }}
                />
                <span
                  className="text-[11px] tracking-widest uppercase shrink-0"
                  style={S_SECTION_HDR}
                >
                  Latest Headlines
                </span>
                <div
                  className="h-[2px] flex-1"
                  style={{ background: "linear-gradient(270deg, #2A2A5B, transparent)" }}
                />
              </div>

              <div className="space-y-0">
                {latestArticles.map((article, index) => (
                  <div key={article.id}>
                    <div
                      className="py-3 cursor-pointer hover:bg-[#0E0E3B] px-3 -mx-3 transition-colors"
                      onClick={() => handleToggleArticle(article.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span
                              className="text-[9px] px-1.5 py-0 uppercase tracking-wider shrink-0"
                              style={{
                                color: categoryColor(article.category),
                                background: "#0A0A28",
                                border: `1px solid ${categoryColor(article.category)}40`,
                              }}
                            >
                              {article.category}
                            </span>
                            <span className="text-[10px]" style={{ color: "#4A5A7A" }}>
                              {timeAgo(article.publishedAt)}
                            </span>
                          </div>
                          <h4
                            className="text-[14px] mb-0.5"
                            style={S_TEXT_BOLD}
                          >
                            {article.headline}
                          </h4>
                          <p className="text-[12px]" style={{ color: "#6A7A9A" }}>
                            {article.summary}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[10px]" style={S_DIM}>
                            <span className="flex items-center gap-1">
                              <User size={9} />{article.author}
                            </span>
                          </div>
                        </div>
                        <ChevronRight
                          size={14}
                          className="shrink-0 mt-2 transition-transform"
                          style={{
                            color: "#3A4A6A",
                            transform: expandedArticle === article.id ? "rotate(90deg)" : "rotate(0deg)",
                          }}
                        />
                      </div>

                      {/* Expanded body */}
                      {expandedArticle === article.id && (
                        <div
                          className="mt-3 pt-3 ml-0"
                          style={{ borderTop: "1px solid #1A1A4B" }}
                        >
                          <RenderFormattedText text={article.body} color="#9AAABB" baseSize={12} />
                          <div className="mt-3 text-[10px]" style={S_DIM}>
                            Published: {formatDate(article.publishedAt)}
                          </div>
                        </div>
                      )}
                    </div>
                    {index < latestArticles.length - 1 && (
                      <div
                        className="h-[1px]"
                        style={{ background: "linear-gradient(90deg, #1A1A5B, #080830, #1A1A5B)" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* PAST ARTICLES */}
            {pastArticles.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="h-[2px] flex-1"
                    style={{ background: "linear-gradient(90deg, #1A1A4B, transparent)" }}
                  />
                  <span
                    className="text-[11px] tracking-widest uppercase shrink-0"
                    style={{ color: "#4A5A7A", fontWeight: 600 }}
                  >
                    Archives
                  </span>
                  <div
                    className="h-[2px] flex-1"
                    style={{ background: "linear-gradient(270deg, #1A1A4B, transparent)" }}
                  />
                </div>

                <div className={`${retro.sunken} bg-[#0A0A2E] p-3`}>
                  <div className="space-y-0">
                    {pastArticles.map((article, index) => (
                      <div key={article.id}>
                        <div
                          className="py-2.5 cursor-pointer hover:bg-[#0E0E38] px-2 -mx-2 transition-colors"
                          onClick={() => handleToggleArticle(article.id)}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span
                                  className="text-[8px] px-1 py-0 uppercase tracking-wider shrink-0"
                                  style={{
                                    color: categoryColor(article.category),
                                    background: "#08081E",
                                    border: `1px solid ${categoryColor(article.category)}30`,
                                  }}
                                >
                                  {article.category}
                                </span>
                                <span className="text-[10px]" style={{ color: "#3A4A6A" }}>
                                  {formatDate(article.publishedAt)}
                                </span>
                              </div>
                              <h5
                                className="text-[13px]"
                                style={{ color: "#8A9ABB", fontWeight: 600 }}
                              >
                                {article.headline}
                              </h5>
                              <p className="text-[11px]" style={S_MUTED}>
                                {article.summary}
                              </p>
                            </div>
                            <ChevronRight
                              size={12}
                              className="shrink-0 mt-1 transition-transform"
                              style={{
                                color: "#3A4A6A",
                                transform: expandedArticle === article.id ? "rotate(90deg)" : "rotate(0deg)",
                              }}
                            />
                          </div>

                          {expandedArticle === article.id && (
                            <div
                              className="mt-2 pt-2"
                              style={{ borderTop: "1px solid #151540" }}
                            >
                              <RenderFormattedText text={article.body} color="#8A9ABB" baseSize={11} />
                              <div className="mt-2 text-[9px]" style={S_DIM}>
                                By {article.author} — {formatDate(article.publishedAt)}
                              </div>
                            </div>
                          )}
                        </div>
                        {index < pastArticles.length - 1 && (
                          <div
                            className="h-[1px]"
                            style={{ background: "#121240" }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center pb-4 mt-8">
          <div
            className="h-[2px] w-full mb-4"
            style={{ background: "linear-gradient(90deg, transparent, #1A1A5B, transparent)" }}
          />
          <span className="text-[10px]" style={S_DIM}>
            I-Net News -- An Intelli Corporation Publication -- 2026 -- All Rights Reserved
          </span>
        </div>
      </div>
    </div>
  );
}