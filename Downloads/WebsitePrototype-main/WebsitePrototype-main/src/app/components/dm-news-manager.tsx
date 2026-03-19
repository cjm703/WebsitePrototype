import React, { useState } from "react";
import { retro } from "./retro-styles";
import { S_ACCENT, S_DIM, S_GREEN_BTN, S_MUTED, S_RED, S_TEXT, S_WARN, S_SECTION_HDR, S_ACCENT_HDR } from "./dm-styles";
import { RichTextEditor } from "./rich-text-editor";
import { useDebouncedJsonStorage } from "./use-debounced-storage";
import { safeGetJson } from "./safe-storage";
import {
  Plus, Save, X, Edit, Trash2, Newspaper,
} from "lucide-react";
import type { NewsArticle } from "./types";

const INPUT_CLS = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;

const DATE_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DATE_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const DATE_YEARS = Array.from({ length: 21 }, (_, i) => 2020 + i);

const CATEGORY_OPTIONS = ["Breaking", "Technology", "Corporate", "Crime", "Security", "Science", "Opinion", "Undercity", "Politics", "Other"];

function parseDateParts(str: string): { month: string; day: number; year: number } {
  const now = new Date();
  const fallback = { month: DATE_MONTHS[now.getMonth()], day: now.getDate(), year: now.getFullYear() };
  if (!str) return fallback;
  const m = str.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})$/i);
  if (m) return { month: m[1].charAt(0).toUpperCase() + m[1].slice(1,3).toLowerCase(), day: parseInt(m[2]), year: parseInt(m[3]) };
  const d = new Date(str);
  if (!isNaN(d.getTime())) return { month: DATE_MONTHS[d.getMonth()], day: d.getDate(), year: d.getFullYear() };
  return fallback;
}

function buildDateStr(month: string, day: number, year: number) {
  return `${month} ${day}, ${year}`;
}



function getCatColor(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes("breaking")) return "#FF6A6A";
  if (cat.includes("tech") || cat.includes("cyber")) return "#4A7BFF";
  if (cat.includes("corporate") || cat.includes("business")) return "#4A9A5A";
  if (cat.includes("crime") || cat.includes("security")) return "#FFAA4A";
  return "#5A7ABB";
}

export function DMNewsManager() {
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>(() => safeGetJson("inet-dm-news", []));
  const [editingNews, setEditingNews] = useState<NewsArticle | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  useDebouncedJsonStorage("inet-dm-news", newsArticles, 400);

  const nowParts = parseDateParts("");

  const handleAdd = () => {
    setEditingNews({
      id: `news-${Date.now()}`,
      headline: "",
      summary: "",
      body: "",
      category: "Breaking",
      author: "I-Net News Desk",
      publishedAt: buildDateStr(nowParts.month, nowParts.day, nowParts.year),
      isFeatured: false,
    });
    setIsAddingNew(true);
  };

  const handleSave = () => {
    if (!editingNews) return;
    if (isAddingNew) setNewsArticles((prev) => [...prev, editingNews]);
    else setNewsArticles((prev) => prev.map((n) => (n.id === editingNews.id ? editingNews : n)));
    setEditingNews(null);
    setIsAddingNew(false);
  };

  const handleDelete = (id: string) => {
    setNewsArticles((prev) => prev.filter((n) => n.id !== id));
    if (editingNews?.id === id) { setEditingNews(null); setIsAddingNew(false); }
  };

  const handleCancel = () => { setEditingNews(null); setIsAddingNew(false); };

  const updateField = <K extends keyof NewsArticle>(key: K, value: NewsArticle[K]) => {
    if (editingNews) setEditingNews({ ...editingNews, [key]: value });
  };

  const sortedNews = [...newsArticles].sort((a, b) => {
    const da = new Date(a.publishedAt).getTime();
    const db = new Date(b.publishedAt).getTime();
    if (!isNaN(da) && !isNaN(db)) return db - da;
    return a.publishedAt.localeCompare(b.publishedAt);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Newspaper size={20} style={S_ACCENT} />
          <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage News Articles</h2>
        </div>
        <button onClick={handleAdd} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
          <Plus size={14} /> Publish Article
        </button>
      </div>

      {editingNews && (
        <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[12px]" style={{ color: "#5A7ABB", fontWeight: 600 }}>
              {isAddingNew ? "PUBLISH NEW ARTICLE" : `EDITING: ${editingNews.headline || "(untitled)"}`}
            </div>
            <button onClick={handleCancel} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
          </div>

          <div className="mb-4">
            <label className="text-[10px] block mb-1" style={S_MUTED}>Headline:</label>
            <input
              type="text"
              value={editingNews.headline}
              onChange={(e) => updateField("headline", e.target.value)}
              placeholder="Enter article headline..."
              className={INPUT_CLS}
              style={S_TEXT}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-[10px] block mb-1" style={S_MUTED}>Category:</label>
              <select
                value={editingNews.category}
                onChange={(e) => updateField("category", e.target.value)}
                className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full`}
                style={S_TEXT}
              >
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={S_MUTED}>Author / Byline:</label>
              <input
                type="text"
                value={editingNews.author}
                onChange={(e) => updateField("author", e.target.value)}
                placeholder="e.g., I-Net News Desk"
                className={INPUT_CLS}
                style={S_TEXT}
              />
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={S_MUTED}>Publish Date:</label>
              {(() => {
                const dp = parseDateParts(editingNews.publishedAt);
                const selectStyle = { ...S_TEXT, cursor: "pointer" as const };
                return (
                  <div className="flex gap-2">
                    <select
                      value={dp.month}
                      onChange={(e) => updateField("publishedAt", buildDateStr(e.target.value, dp.day, dp.year))}
                      className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[13px] flex-1`}
                      style={selectStyle}
                    >
                      {DATE_MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select
                      value={dp.day}
                      onChange={(e) => updateField("publishedAt", buildDateStr(dp.month, parseInt(e.target.value), dp.year))}
                      className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[13px] w-[70px]`}
                      style={selectStyle}
                    >
                      {DATE_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select
                      value={dp.year}
                      onChange={(e) => updateField("publishedAt", buildDateStr(dp.month, dp.day, parseInt(e.target.value)))}
                      className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[13px] w-[85px]`}
                      style={selectStyle}
                    >
                      {DATE_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[10px] block mb-1" style={S_MUTED}>Summary (shown in article list):</label>
            <textarea
              value={editingNews.summary}
              onChange={(e) => updateField("summary", e.target.value)}
              placeholder="Brief summary of the article..."
              rows={2}
              className={`${INPUT_CLS} resize-none`}
              style={S_TEXT}
            />
          </div>

          <div className="mb-4">
            <label className="text-[10px] block mb-1" style={S_MUTED}>Full Article Body:</label>
            <RichTextEditor value={editingNews.body} onChange={(html) => updateField("body", html)} placeholder="Write the full article content..." minHeight={140} />
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editingNews.isFeatured}
                onChange={(e) => updateField("isFeatured", e.target.checked)}
                className="accent-[#FF6A6A]"
              />
              <span className="text-[11px]" style={S_WARN}>
                Mark as Featured / Breaking News
              </span>
            </label>
            <div className="text-[9px] mt-1" style={S_DIM}>
              Featured articles appear prominently at the top of the News page.
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
              <Save size={14} /> {isAddingNew ? "Publish" : "Save Changes"}
            </button>
            <button onClick={handleCancel} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
          </div>
        </div>
      )}

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="text-[12px] mb-3" style={S_SECTION_HDR}>
          PUBLISHED ARTICLES ({newsArticles.length})
        </div>
        {newsArticles.length === 0 ? (
          <div className="text-[12px] text-center py-6" style={S_MUTED}>
            No news articles published yet. Click "Publish Article" to create one.
          </div>
        ) : (
          <div className="space-y-2">
            {sortedNews.map((article) => {
              const catColor = getCatColor(article.category);
              return (
                <div key={article.id} className={`${retro.raised} bg-[#0E0E35] p-3`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="text-[9px] px-1.5 py-0 uppercase tracking-wider"
                          style={{ color: catColor, background: "#0A0A28", border: `1px solid ${catColor}40` }}
                        >
                          {article.category}
                        </span>
                        {article.isFeatured && (
                          <span
                            className="text-[8px] px-1.5 py-0 uppercase tracking-wider"
                            style={{ color: "#FF6A6A", background: "#2A0A0A", border: "1px solid #FF6A6A40" }}
                          >
                            Featured
                          </span>
                        )}
                        <span className="text-[10px]" style={S_DIM}>
                          {article.publishedAt}
                        </span>
                      </div>
                      <div className="text-[13px] mb-0.5" style={{ color: "#C0D0F0", fontWeight: 600 }}>{article.headline}</div>
                      <div className="text-[11px]" style={{ color: "#6A7A9A" }}>{article.summary}</div>
                      <div className="text-[10px] mt-1" style={S_DIM}>By {article.author}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => { setEditingNews({ ...article }); setIsAddingNew(false); }}
                        className={`${retro.button} px-3 py-1 text-[11px]`}
                        style={S_ACCENT}
                      >
                        <Edit size={12} className="inline mr-1" />Edit
                      </button>
                      <button
                        onClick={() => handleDelete(article.id)}
                        className={`${retro.button} px-3 py-1 text-[11px]`}
                        style={S_RED}
                      >
                        <Trash2 size={12} className="inline mr-1" />Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}