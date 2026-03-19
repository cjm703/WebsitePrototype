import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { safeGetItem } from "./safe-storage";

/**
 * Detects whether a string contains HTML tags (from the rich text editor).
 */
function containsHtml(text: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(text);
}

/**
 * Builds a lookup map from article title (lowercased) → { id, title }
 * from the DM sites stored in localStorage. Cached per render via useMemo.
 */
function loadArticleLookup(): Map<string, { id: string; title: string }> {
  const map = new Map<string, { id: string; title: string }>();
  try {
    const raw = safeGetItem("inet-dm-sites");
    if (raw) {
      const pages: { id: string; title: string }[] = JSON.parse(raw);
      for (const p of pages) {
        if (p.title) map.set(p.title.toLowerCase(), { id: p.id, title: p.title });
      }
    }
  } catch {}
  return map;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Parses a plain-text line for [[Article Name]] or [[Article Name|Display]]
 * and returns an array of React nodes with resolved wiki links.
 */
function parseWikiLinks(
  line: string,
  lookup: Map<string, { id: string; title: string }>,
  navigate: (path: string) => void,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const articleName = match[1];
    const displayText = match[2] || articleName;
    const found = lookup.get(articleName.trim().toLowerCase());
    if (found) {
      parts.push(
        <a
          key={`wl-${key++}`}
          href={`/interface/inet-page/${found.id}`}
          onClick={(e) => { e.preventDefault(); navigate(`/interface/inet-page/${found.id}`); }}
          style={{ color: "#6A9AFF", textDecoration: "underline", cursor: "pointer" }}
          title={found.title}
        >
          {displayText}
        </a>
      );
    } else {
      parts.push(
        <span
          key={`wl-${key++}`}
          style={{ color: "#FF6A6A", textDecoration: "underline dotted", cursor: "help" }}
          title={`Article not found: ${articleName}`}
        >
          {displayText}
        </span>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [line];
}

/**
 * Renders text content.
 *
 * If the text contains HTML (from the rich text editor), it renders via
 * dangerouslySetInnerHTML with appropriate wrapper styling.
 *
 * Otherwise, falls back to the original simple heading markup:
 *   # line   → big text, bold
 *   ## line  → medium text, bold
 *   ### line → italicized text
 *
 * All other lines render as normal body text.
 * Each newline in the source becomes its own line.
 *
 * Supports inline spoiler boxes via <span class="inline-spoiler" data-spoiler-players="id1,id2">
 * When currentPlayerId is provided, spoiler boxes are hidden for restricted players.
 */
export function RenderFormattedText({
  text,
  color,
  font,
  baseSize = 14,
  currentPlayerId,
  isDM,
  sectionRevealed = true,
}: {
  text: string;
  color?: string;
  font?: string;
  baseSize?: number;
  currentPlayerId?: string;
  isDM?: boolean;
  sectionRevealed?: boolean;
}) {
  const navigate = useNavigate();
  const articleLookup = useMemo(() => loadArticleLookup(), []);
  const contentRef = useRef<HTMLDivElement>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());

  const handleLinkClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest("a[href]");
    if (target) {
      const href = target.getAttribute("href");
      if (href && href.startsWith("/")) {
        e.preventDefault();
        navigate(href);
      }
    }
  };

  const handleSpoilerClick = useCallback((e: React.MouseEvent) => {
    if (!sectionRevealed) return;
    const cover = (e.target as HTMLElement).closest(".spoiler-cover-overlay");
    if (cover) {
      const wrapper = cover.parentElement;
      if (wrapper) {
        const spoilerId = wrapper.getAttribute("data-spoiler-uid");
        if (spoilerId) {
          setRevealedSpoilers((prev) => new Set([...prev, spoilerId]));
        }
      }
    }
  }, [sectionRevealed]);

  // Process inline spoilers in the DOM after render
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const spoilers = el.querySelectorAll<HTMLElement>(".inline-spoiler");
    spoilers.forEach((span, idx) => {
      const spoilerUid = `spoiler-${idx}`;
      const playersAttr = span.getAttribute("data-spoiler-players") || "";
      const allowedPlayers = playersAttr.split(",").map((s) => s.trim()).filter(Boolean);
      const labelAttr = span.getAttribute("data-spoiler-label") || "Spoiler";

      // Determine if current user can see this spoiler
      const canSee = isDM || allowedPlayers.length === 0 || (currentPlayerId && allowedPlayers.includes(currentPlayerId));
      const isRevealed = revealedSpoilers.has(spoilerUid);

      // Mark with uid for click handling
      span.setAttribute("data-spoiler-uid", spoilerUid);
      span.style.position = "relative";
      span.style.display = "inline";

      // Remove any existing overlays (from previous renders)
      const existingOverlays = span.querySelectorAll(".spoiler-cover-overlay, .spoiler-revealed-badge");
      existingOverlays.forEach((o) => o.remove());

      if (canSee) {
        // User can see — show with subtle indicator
        span.style.filter = "none";
        span.style.cursor = "auto";
        if (allowedPlayers.length > 0) {
          span.style.borderBottom = "1px dashed #4A5A8A44";
        }
      } else if (isRevealed && sectionRevealed) {
        // Revealed by click
        span.style.filter = "none";
        span.style.cursor = "auto";
        span.style.borderBottom = "1px dashed #FF6A6A44";
        const badge = document.createElement("span");
        badge.className = "spoiler-revealed-badge";
        badge.style.cssText = "font-size:8px;color:#FF8A6A;margin-left:3px;vertical-align:super;opacity:0.6;";
        badge.textContent = "(revealed)";
        span.appendChild(badge);
      } else {
        // Hidden — apply blur and cover
        const children = Array.from(span.childNodes);
        let contentWrapper = span.querySelector(".spoiler-inner-content") as HTMLElement | null;
        if (!contentWrapper) {
          contentWrapper = document.createElement("span");
          contentWrapper.className = "spoiler-inner-content";
          children.forEach((c) => contentWrapper!.appendChild(c));
          span.appendChild(contentWrapper);
        }
        contentWrapper.style.filter = "blur(6px)";
        contentWrapper.style.userSelect = "none";
        contentWrapper.style.pointerEvents = "none";
        contentWrapper.style.opacity = "0.3";

        const cover = document.createElement("span");
        cover.className = "spoiler-cover-overlay";
        cover.style.cssText = `
          position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          cursor:${sectionRevealed ? "pointer" : "not-allowed"};z-index:1;
          background:rgba(10,10,30,0.85);border:1px dashed #5A2A2A;padding:2px 8px;
          font-size:10px;color:#FF6A6A;font-weight:600;white-space:nowrap;
        `;
        cover.innerHTML = sectionRevealed
          ? `<span style="display:flex;align-items:center;gap:4px;">&#128065; ${escapeHtml(labelAttr)}</span>`
          : `<span style="display:flex;align-items:center;gap:4px;">&#128274; Reveal section first</span>`;
        span.appendChild(cover);
      }
    });
  }, [currentPlayerId, isDM, sectionRevealed, revealedSpoilers, text]);

  // ── HTML content from rich text editor ──
  if (containsHtml(text)) {
    // Process wiki links in HTML: [[Article Name]] or [[Article Name|Display Text]]
    const processedHtml = text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_match, articleName, displayText) => {
      const display = displayText || articleName;
      const found = articleLookup.get((articleName as string).trim().toLowerCase());
      if (found) {
        return `<a class="wiki-link" href="/interface/inet-page/${found.id}" style="color:#6A9AFF;text-decoration:underline;cursor:pointer;" title="${escapeHtml(found.title)}">${escapeHtml(display)}</a>`;
      }
      return `<span class="wiki-link-broken" style="color:#FF6A6A;text-decoration:underline dotted;cursor:help;" title="Article not found: ${escapeHtml(articleName)}">${escapeHtml(display)}</span>`;
    });
    return (
      <div
        ref={contentRef}
        className="rich-text-rendered"
        dangerouslySetInnerHTML={{ __html: processedHtml }}
        onClick={(e) => { handleLinkClick(e); handleSpoilerClick(e); }}
        style={{
          color,
          fontFamily: font,
          fontSize: baseSize,
          lineHeight: 1.7,
          wordWrap: "break-word",
          overflowWrap: "break-word",
        }}
      />
    );
  }

  // ── Legacy plain-text with heading markup ──
  const lines = text.split("\n");

  return (
    <div>
      {lines.map((raw, i) => {
        // ### heading → italic
        if (/^###\s+/.test(raw)) {
          const content = raw.replace(/^###\s+/, "");
          return (
            <p
              key={i}
              style={{
                color,
                lineHeight: "1.7",
                fontFamily: font,
                fontStyle: "italic",
                fontSize: baseSize,
              }}
            >
              {parseWikiLinks(content, articleLookup, navigate)}
            </p>
          );
        }

        // ## heading → medium bold
        if (/^##\s+/.test(raw)) {
          const content = raw.replace(/^##\s+/, "");
          return (
            <p
              key={i}
              style={{
                color,
                lineHeight: "1.7",
                fontFamily: font,
                fontWeight: 600,
                fontSize: baseSize + 2,
                marginTop: 4,
                marginBottom: 2,
              }}
            >
              {parseWikiLinks(content, articleLookup, navigate)}
            </p>
          );
        }

        // # heading → big bold
        if (/^#\s+/.test(raw)) {
          const content = raw.replace(/^#\s+/, "");
          return (
            <p
              key={i}
              style={{
                color,
                lineHeight: "1.7",
                fontFamily: font,
                fontWeight: 700,
                fontSize: baseSize + 6,
                marginTop: 6,
                marginBottom: 2,
              }}
            >
              {parseWikiLinks(content, articleLookup, navigate)}
            </p>
          );
        }

        // Normal line
        return (
          <p
            key={i}
            style={{ color, lineHeight: "1.7", fontFamily: font, fontSize: baseSize }}
          >
            {raw ? parseWikiLinks(raw, articleLookup, navigate) : "\u00A0"}
          </p>
        );
      })}
    </div>
  );
}