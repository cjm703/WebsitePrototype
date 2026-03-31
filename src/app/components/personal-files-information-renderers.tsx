
import React from "react";
import { FileText } from "lucide-react";
import { RenderFormattedText } from "./render-text";
import type { PlayerTheme } from "./player-theme";
import type {
  InfoDisplayMode,
  InfoSection,
  InfoDocumentLike as ManagedInfoLike,
} from "./personal-files-information-utils";

export type { InfoDisplayMode, InfoSection } from "./personal-files-information-utils";
export type ManagedInfoLike = import("./personal-files-information-utils").InfoDocumentLike;

type RendererProps = {
  theme: PlayerTheme;
  info: ManagedInfoLike;
  accentColor: string;
  onOpenInfo?: (infoId: string) => void;
  infoLookup?: Record<string, ManagedInfoLike>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getDigitalTextColor(info: ManagedInfoLike, accentColor: string) {
  return info.displayData?.digitalTextColor || accentColor || "#8fd3ff";
}

function getDigitalBackground(info: ManagedInfoLike) {
  return info.displayData?.digitalBackgroundColor || "#06101a";
}

function getGlowShadow(color: string, intensity: "low" | "medium" | "high") {
  if (intensity === "high") return `0 0 4px ${color}88, 0 0 12px ${color}66, 0 0 24px ${color}33`;
  if (intensity === "medium") return `0 0 3px ${color}66, 0 0 8px ${color}44, 0 0 14px ${color}22`;
  return `0 0 2px ${color}44, 0 0 5px ${color}22`;
}

function SharedDisplayAnimations() {
  return (
    <style>{`
      @keyframes pfScanDrift {
        0% { transform: translateY(-28px); }
        100% { transform: translateY(28px); }
      }
      @keyframes pfScreenFlicker {
        0%, 96%, 100% { opacity: 1; }
        97% { opacity: 0.985; }
        98% { opacity: 0.965; }
        99% { opacity: 0.99; }
      }
      @keyframes pfCharReveal {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `}</style>
  );
}

function FollowUps({ info, theme, accentColor }: RendererProps) {
  if (!info.followUps?.length) return null;

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: theme.labelColor }}>
        Related Notes
      </div>
      <div className="grid gap-2">
        {info.followUps.map((followUp, index) => (
          <div
            key={followUp.id || `${info.id}-followup-${index}`}
            className="rounded border px-3 py-2 transition-transform duration-150 hover:translate-x-[2px]"
            style={{
              borderColor: "rgba(124, 124, 185, 0.18)",
              background: "linear-gradient(180deg, rgba(10,13,27,0.95), rgba(7,9,20,0.95))",
            }}
          >
            <div className="flex items-start gap-2">
              <FileText size={13} style={{ color: accentColor, marginTop: "2px" }} />
              <div className="min-w-0">
                {followUp.title ? (
                  <div className="text-[11px] font-semibold mb-1" style={{ color: theme.textColor }}>
                    {followUp.title}
                  </div>
                ) : null}
                <div className="text-[11px]" style={{ color: theme.textColor }}>
                  <RenderFormattedText text={followUp.content || followUp.description || ""} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function blockifyHtml(content: string) {
  const normalized = String(content || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  let parts = normalized
    .split(/<\/p>\s*<p[^>]*>|<br\s*\/?>\s*<br\s*\/?>|\n{2,}/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 1) return parts;
  return parts.map((part) => {
    if (part.startsWith("<p") || part.startsWith("<div") || part.startsWith("<ul") || part.startsWith("<ol")) return part;
    return `<p>${part.replace(/^<p>|<\/p>$/g, "")}</p>`;
  });
}

function getDocumentSections(info: ManagedInfoLike): InfoSection[] {
  const displayData = info.displayData || {};
  if (displayData.useSections && Array.isArray(displayData.sections) && displayData.sections.length > 0) {
    return displayData.sections.map((section, index) => ({
      id: section.id || `section-${index}`,
      title: section.title || `Section ${index + 1}`,
      content: section.content || "",
    }));
  }
  return [{ id: "main", title: "", content: info.content || info.description || "This paper does not have content yet." }];
}

function redactReplacement(text: string, mode: InfoDisplayMode) {
  const plain = String(text || "").replace(/<[^>]*>/g, "");
  const blocks = "█".repeat(clamp(plain.length || 8, 4, 28));
  if (mode === "paper") {
    return `<span style="display:inline-block;padding:0 4px;background:#1d140d;color:#efe6d4;letter-spacing:0.05em;border-radius:2px;">${blocks}</span>`;
  }
  if (mode === "item:stone_tablet") {
    return `<span style="display:inline-block;padding:0 4px;background:#1a1a1a;color:#c4cbc8;border:1px solid rgba(255,255,255,0.08);border-radius:4px;">${blocks}</span>`;
  }
  return `<span style="display:inline-block;padding:0 4px;background:#06111d;color:#8fd3ff;border:1px solid rgba(143,211,255,0.18);border-radius:2px;">${blocks}</span>`;
}

function preprocessMarkup(content: string, mode: InfoDisplayMode) {
  return String(content || "")
    .replace(/\[\[redact:(.*?)\]\]/gis, (_m, value) => redactReplacement(value, mode))
    .replace(/\[\[link:([^|\]]+)\|([^\]]+)\]\]/gis, (_m, id, label) => `<span data-info-link="${String(id).trim()}" style="text-decoration:underline;cursor:pointer;">${String(label).trim()}</span>`)
    .replace(/\[\[link:([^\]]+)\]\]/gis, (_m, id) => `<span data-info-link="${String(id).trim()}" style="text-decoration:underline;cursor:pointer;">${String(id).trim()}</span>`);
}

function applyHiddenCutoff(content: string, visibleCount?: number, fadeCount?: number) {
  const blocks = blockifyHtml(content);
  const visible = Math.max(0, Number(visibleCount || 0));
  const fade = Math.max(0, Number(fadeCount || 0));
  if (!blocks.length || visible <= 0) {
    return { html: content, fadeActive: false, hidden: false };
  }
  const kept = blocks.slice(0, Math.min(blocks.length, visible + fade));
  return {
    html: kept.join(""),
    fadeActive: blocks.length > kept.length,
    hidden: blocks.length > kept.length,
  };
}

function handleInfoLinkClick(
  event: React.MouseEvent<HTMLElement>,
  onOpenInfo?: (infoId: string) => void,
) {
  const target = event.target as HTMLElement | null;
  const linkEl = target?.closest?.("[data-info-link]") as HTMLElement | null;
  const infoId = linkEl?.getAttribute("data-info-link");
  if (infoId && onOpenInfo) {
    event.preventDefault();
    onOpenInfo(infoId);
  }
}

function renderLinkedDocuments(info: ManagedInfoLike, infoLookup?: Record<string, ManagedInfoLike>, onOpenInfo?: (infoId: string) => void, tone: { color: string; border: string; bg: string; }) {
  const ids = Array.isArray(info.displayData?.linkedInfoIds) ? info.displayData?.linkedInfoIds : [];
  if (!ids || ids.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: tone.color }}>
        Linked Documents
      </div>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onOpenInfo?.(id)}
            className="px-2 py-1 text-[10px] rounded border"
            style={{ borderColor: tone.border, background: tone.bg, color: tone.color }}
          >
            {infoLookup?.[id]?.title || id}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionRenderer({
  section,
  mode,
  textColor,
  titleColor,
  fade,
  onOpenInfo,
  typewriter,
  typeSpeed,
  glowIntensity,
  isTerminal,
}: {
  section: InfoSection;
  mode: InfoDisplayMode;
  textColor: string;
  titleColor: string;
  fade: { color: string; active: boolean };
  onOpenInfo?: (infoId: string) => void;
  typewriter?: boolean;
  typeSpeed?: number;
  glowIntensity?: "low" | "medium" | "high";
  isTerminal?: boolean;
}) {
  const processed = preprocessMarkup(section.content || "", mode);
  const cutoff = applyHiddenCutoff(processed, undefined, undefined);
  const textHtml = processed;
  const plainText = textHtml.replace(/<[^>]*>/g, "");

  return (
    <div className="space-y-2 relative">
      {section.title ? (
        <div className="text-[12px] font-semibold" style={{ color: titleColor, fontFamily: isTerminal ? '"Courier New", monospace' : undefined, letterSpacing: isTerminal ? "0.06em" : undefined }}>
          {section.title}
        </div>
      ) : null}
      <div className="relative" onClick={(e) => handleInfoLinkClick(e, onOpenInfo)}>
        {typewriter ? (
          <div className="text-[11px] leading-7 whitespace-pre-wrap" style={{ color: textColor, textShadow: getGlowShadow(textColor, glowIntensity || "medium"), fontFamily: isTerminal ? '"Courier New", monospace' : undefined, letterSpacing: isTerminal ? "0.05em" : undefined }}>
            {plainText.split("").map((char, index) => (
              <span
                key={`${index}-${char}`}
                style={{
                  opacity: 0,
                  display: "inline",
                  animation: `pfCharReveal 0.01s linear forwards`,
                  animationDelay: `${(index / Math.max(typeSpeed || 30, 5)) * 0.9}s`,
                }}
              >
                {char}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-[11px] leading-7" style={{ color: textColor, fontFamily: isTerminal ? '"Courier New", monospace' : undefined, letterSpacing: isTerminal ? "0.05em" : undefined }}>
            <RenderFormattedText text={textHtml} />
          </div>
        )}
        {fade.active ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24" style={{ background: fade.color }} />
        ) : null}
      </div>
    </div>
  );
}

export function DigitalDocumentView({ theme, info, accentColor, onOpenInfo, infoLookup }: RendererProps) {
  const variant = info.displayData?.digitalVariant || "default";
  const color = variant === "terminal"
    ? (info.displayData?.digitalTextColor || "#75ff8a")
    : getDigitalTextColor(info, accentColor);
  const background = variant === "terminal"
    ? (info.displayData?.digitalBackgroundColor || "#021408")
    : getDigitalBackground(info);
  const glowIntensity = variant === "terminal"
    ? ((info.displayData?.digitalGlowIntensity || "medium") as "low" | "medium" | "high")
    : (info.displayData?.digitalGlowIntensity || "medium");
  const typewriter = !!info.displayData?.digitalTypewriter;
  const typeSpeed = info.displayData?.digitalTypewriterSpeed || 30;
  const visibleCount = info.displayData?.visibleBlockCount;
  const fadeCount = info.displayData?.fadeBlockCount ?? 2;
  const baseSections = getDocumentSections(info);
  const sections = baseSections.map((section) => {
    const processed = preprocessMarkup(section.content || "", "digital");
    const cutoff = applyHiddenCutoff(processed, visibleCount, fadeCount);
    return { ...section, content: cutoff.html, _fade: cutoff.fadeActive } as any;
  });

  return (
    <div className="flex-1 overflow-auto px-4 py-4">
      <SharedDisplayAnimations />
      <div
        className="max-w-[960px] mx-auto rounded border px-5 py-5 space-y-4 relative overflow-hidden"
        style={{
          borderColor: `${color}33`,
          background: variant === "terminal" ? `linear-gradient(180deg, ${background}, #010704)` : `linear-gradient(180deg, ${background}, #02050a)`,
          boxShadow: `0 8px 30px rgba(0,0,0,0.34), inset 0 0 0 1px ${color}10, inset 0 0 28px rgba(0,0,0,0.45)`,
          animation: "pfScreenFlicker 11s linear infinite",
        }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-45" style={{ backgroundImage: variant === "terminal" ? "repeating-linear-gradient(to bottom, rgba(117,255,138,0.06) 0px, rgba(117,255,138,0.06) 1px, transparent 2px, transparent 5px)" : "repeating-linear-gradient(to bottom, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) 1px, transparent 2px, transparent 5px)", animation: "pfScanDrift 7s linear infinite", mixBlendMode: "screen" }} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 40px rgba(0,0,0,0.55)" }} />
        <div className="relative rounded px-3 py-3 space-y-5" style={{ background: variant === "terminal" ? "linear-gradient(180deg, rgba(117,255,138,0.02), rgba(117,255,138,0.01))" : "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", border: `1px solid ${color}18` }}>
          {sections.map((section: any, index) => (
            <SectionRenderer
              key={section.id || index}
              section={section}
              mode="digital"
              textColor={color}
              titleColor={color}
              fade={{ active: !!section._fade, color: "linear-gradient(180deg, rgba(6,17,29,0), rgba(2,5,10,0.92) 78%, rgba(2,5,10,1))" }}
              onOpenInfo={onOpenInfo}
              typewriter={typewriter}
              typeSpeed={typeSpeed}
              glowIntensity={glowIntensity}
              isTerminal={variant === "terminal"}
            />
          ))}
          {renderLinkedDocuments(info, infoLookup, onOpenInfo, { color, border: `${color}33`, bg: "rgba(6,17,29,0.72)" })}
        </div>
        <FollowUps info={info} theme={theme} accentColor={accentColor} onOpenInfo={onOpenInfo} infoLookup={infoLookup} />
      </div>
    </div>
  );
}

function buildPaperClipPath(jaggedness: number) {
  const j = clamp(jaggedness, 0, 100) / 100;
  if (j <= 0.12) return "inset(0 round 3px)";

  const topA = 0.6 + 0.9 * j;
  const topB = 1.2 + 1.7 * j;
  const sideA = 0.8 + 1.6 * j;
  const sideB = 1.4 + 2.2 * j;

  return `polygon(
    0% ${topA}%,
    6% 0.2%,
    13% ${topB}%,
    21% 0.4%,
    31% ${topA + 0.5}%,
    42% 0.2%,
    54% ${topB}%,
    66% 0.3%,
    78% ${topA + 0.6}%,
    89% 0.2%,
    96% ${topB}%,
    100% ${sideA}%,
    99% 18%,
    100% 34%,
    98.8% 49%,
    100% 64%,
    99% 80%,
    100% 96%,
    95% 100%,
    82% 99.1%,
    69% 100%,
    56% 99%,
    43% 100%,
    30% 99.1%,
    17% 100%,
    5% 99.3%,
    0% 96%,
    ${sideB}% 82%,
    0% 66%,
    ${sideA}% 50%,
    0% 34%,
    ${sideB}% 18%
  )`;
}

function getPaperTemplateStyle(template: string | undefined) {
  switch (template) {
    case "letter":
      return {
        border: "1px solid rgba(122,84,39,0.22)",
        overlay: "radial-gradient(circle at 85% 12%, rgba(150,120,80,0.09), transparent 22%), radial-gradient(circle at 18% 16%, rgba(126,95,52,0.08), transparent 26%)",
      };
    case "report":
      return {
        border: "2px solid rgba(60,60,60,0.2)",
        overlay: "linear-gradient(180deg, rgba(0,0,0,0.03), transparent 18%, transparent 84%, rgba(0,0,0,0.05))",
      };
    case "aged":
      return {
        border: "1px solid rgba(125,94,47,0.30)",
        overlay: "radial-gradient(circle at 12% 20%, rgba(99,72,39,0.12), transparent 24%), radial-gradient(circle at 84% 84%, rgba(90,70,34,0.10), transparent 24%)",
      };
    default:
      return {
        border: "1px solid rgba(145,128,96,0.28)",
        overlay: "radial-gradient(circle at 18% 16%, rgba(126,95,52,0.08), transparent 26%), radial-gradient(circle at 85% 78%, rgba(116,92,52,0.06), transparent 22%)",
      };
  }
}

function PaperPage({
  info,
  accentColor,
  edgeTexture,
  jaggedness,
  pageIndex,
  onOpenInfo,
  infoLookup,
}: {
  info: ManagedInfoLike;
  accentColor: string;
  edgeTexture: number;
  jaggedness: number;
  pageIndex: number;
  onOpenInfo?: (infoId: string) => void;
  infoLookup?: Record<string, ManagedInfoLike>;
}) {
  const textureOpacity = clamp(edgeTexture, 0, 100) / 100 * 0.42;
  const visibleCount = info.displayData?.visibleBlockCount;
  const fadeCount = info.displayData?.fadeBlockCount ?? 2;
  const templateStyle = getPaperTemplateStyle(info.displayData?.paperTemplate);
  const handwrittenOverlay = String(info.displayData?.paperHandwrittenOverlay || "").trim();
  const handwrittenOpacity = clamp(Number(info.displayData?.paperHandwrittenOpacity ?? 0), 0, 1);
  const baseSections = pageIndex === 0 ? getDocumentSections(info) : [];
  const sections = baseSections.map((section) => {
    const processed = preprocessMarkup(section.content || "", "paper");
    const cutoff = applyHiddenCutoff(processed, visibleCount, fadeCount);
    return { ...section, content: cutoff.html, _fade: cutoff.fadeActive } as any;
  });

  return (
    <div className="relative p-4 md:p-5" style={{ background: "#020202", boxShadow: "0 24px 55px rgba(0,0,0,0.48)" }}>
      <div
        className="relative overflow-hidden"
        style={{
          clipPath: buildPaperClipPath(jaggedness),
          background: "linear-gradient(180deg, rgba(252,251,248,1), rgba(241,238,229,1))",
          border: templateStyle.border,
          boxShadow: "inset 0 0 22px rgba(129,101,56,0.08), inset 0 0 0 1px rgba(255,255,255,0.4)",
        }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ opacity: textureOpacity, background: "radial-gradient(circle at 0% 0%, rgba(92,70,41,0.32), transparent 16%), radial-gradient(circle at 100% 0%, rgba(92,70,41,0.28), transparent 16%), radial-gradient(circle at 0% 100%, rgba(92,70,41,0.28), transparent 18%), radial-gradient(circle at 100% 100%, rgba(92,70,41,0.32), transparent 16%), linear-gradient(90deg, rgba(95,72,42,0.14), transparent 7%, transparent 93%, rgba(95,72,42,0.14))" }} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-32" style={{ background: `${templateStyle.overlay}, linear-gradient(180deg, rgba(255,255,255,0.16), transparent 18%, transparent 84%, rgba(120,90,45,0.04))` }} />
        <div className="relative px-8 py-8 md:px-10 md:py-10 space-y-5" style={{ minHeight: "860px" }}>
          {handwrittenOverlay ? (
            <div
              className="pointer-events-none absolute inset-x-12 top-12 whitespace-pre-wrap"
              style={{
                color: "rgba(64,39,22,0.9)",
                opacity: handwrittenOpacity,
                fontFamily: '"Brush Script MT", "Segoe Script", cursive',
                fontSize: "20px",
                lineHeight: 1.3,
                transform: "rotate(-2deg)",
                mixBlendMode: "multiply",
              }}
            >
              {handwrittenOverlay}
            </div>
          ) : null}
          {pageIndex === 0 ? (
            <>
              {sections.map((section: any, index) => (
                <SectionRenderer
                  key={section.id || index}
                  section={section}
                  mode="paper"
                  textColor="#241b12"
                  titleColor="#4d3823"
                  fade={{ active: !!section._fade, color: "linear-gradient(180deg, rgba(252,251,248,0), rgba(241,238,229,0.88) 68%, rgba(241,238,229,1))" }}
                  onOpenInfo={onOpenInfo}
                />
              ))}
              {renderLinkedDocuments(info, infoLookup, onOpenInfo, { color: "#5e4730", border: "rgba(95,72,42,0.28)", bg: "rgba(255,255,255,0.45)" })}
              <div className="text-[10px]" style={{ color: "#5e4730" }}>
                Paper Render Mode
                {info.displayData?.futurePaperOverlayMode === "pixel_handwriting" ? <span> • Future plugin hook reserved for DM pixel-handwriting overlay.</span> : null}
              </div>
              <FollowUps info={info} theme={{ textColor: "#241b12", labelColor: "#5e4730" } as PlayerTheme} accentColor={accentColor} onOpenInfo={onOpenInfo} infoLookup={infoLookup} />
            </>
          ) : (
            <div className="text-[11px]" style={{ color: "#6b5539" }}>
              Additional page
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PaperDocumentView({ info, accentColor, onOpenInfo, infoLookup }: RendererProps) {
  const jaggedness = info.displayData?.paperJaggedness ?? 10;
  const extraPages = info.displayData?.paperExtraPages ?? 0;
  const edgeTexture = info.displayData?.paperEdgeTexture ?? 24;
  const pages = 1 + clamp(extraPages, 0, 5);

  return (
    <div className="flex-1 overflow-auto px-4 py-6">
      <div className="max-w-[940px] mx-auto px-2 space-y-6">
        {Array.from({ length: pages }).map((_, index) => (
          <PaperPage
            key={`${info.id}-page-${index}`}
            info={info}
            accentColor={accentColor}
            edgeTexture={edgeTexture}
            jaggedness={jaggedness}
            pageIndex={index}
            onOpenInfo={onOpenInfo}
            infoLookup={infoLookup}
          />
        ))}
      </div>
    </div>
  );
}

export function StoneTabletView({ info, onOpenInfo, infoLookup }: RendererProps) {
  const align = info.displayData?.alignment === "center" ? "center" : "left";
  const textureIntensity = clamp(info.displayData?.stoneTextureIntensity ?? 55, 0, 100) / 100;
  const baseLightness = clamp(info.displayData?.stoneBaseLightness ?? 48, 20, 80);
  const stoneTextColor = info.displayData?.stoneTextColor || "#c4cbc8";
  const crackIntensity = clamp(Number(info.displayData?.stoneCrackIntensity ?? 20), 0, 100) / 100;
  const visibleCount = info.displayData?.visibleBlockCount;
  const fadeCount = info.displayData?.fadeBlockCount ?? 2;

  const topColor = `hsl(210 6% ${Math.min(baseLightness + 12, 92)}%)`;
  const midColor = `hsl(210 6% ${baseLightness}%)`;
  const lowColor = `hsl(210 7% ${Math.max(baseLightness - 12, 8)}%)`;

  const baseSections = getDocumentSections(info);
  const sections = baseSections.map((section) => {
    const processed = preprocessMarkup(section.content || "", "item:stone_tablet");
    const cutoff = applyHiddenCutoff(processed, visibleCount, fadeCount);
    return { ...section, content: cutoff.html, _fade: cutoff.fadeActive } as any;
  });

  return (
    <div className="flex-1 overflow-auto px-4 py-6">
      <SharedDisplayAnimations />
      <div className="max-w-[760px] mx-auto min-h-full flex items-center justify-center">
        <div
          className="relative px-7 py-8 md:px-8 md:py-9 overflow-hidden"
          style={{
            width: "min(560px, 100%)",
            minHeight: "560px",
            borderRadius: "180px 180px 26px 26px / 150px 150px 26px 26px",
            background: `linear-gradient(180deg, ${topColor}, ${midColor} 42%, ${lowColor} 100%)`,
            border: "1px solid rgba(208,212,218,0.12)",
            boxShadow: "0 34px 70px rgba(0,0,0,0.56), inset 0 3px 14px rgba(255,255,255,0.08), inset 0 -14px 28px rgba(0,0,0,0.36)",
          }}
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-[10px]" style={{ borderRadius: "170px 170px 18px 18px / 142px 142px 18px 18px", border: "1px solid rgba(255,255,255,0.05)", boxShadow: "inset 0 0 32px rgba(0,0,0,0.28)" }} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-50" style={{ background: `radial-gradient(circle at 20% 16%, rgba(255,255,255,${0.18 * textureIntensity}), transparent 18%), radial-gradient(circle at 84% 76%, rgba(0,0,0,${0.34 * textureIntensity}), transparent 26%), radial-gradient(circle at 56% 40%, rgba(255,255,255,${0.06 * textureIntensity}), transparent 14%), radial-gradient(circle at 35% 58%, rgba(0,0,0,${0.16 * textureIntensity}), transparent 10%)` }} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-28" style={{ backgroundImage: `linear-gradient(118deg, transparent 0%, rgba(255,255,255,0.05) 16%, transparent 34%), linear-gradient(76deg, transparent 0%, transparent 70%, rgba(0,0,0,0.24) 86%, transparent 100%), linear-gradient(16deg, transparent 0%, transparent 46%, rgba(0,0,0,${0.22 * crackIntensity}) 47%, rgba(0,0,0,${0.22 * crackIntensity}) 48%, transparent 49%), linear-gradient(102deg, transparent 0%, transparent 62%, rgba(0,0,0,${0.18 * crackIntensity}) 63%, rgba(0,0,0,${0.18 * crackIntensity}) 64%, transparent 65%), linear-gradient(132deg, transparent 0%, transparent 28%, rgba(0,0,0,${0.28 * crackIntensity}) 29%, rgba(0,0,0,${0.28 * crackIntensity}) 29.8%, transparent 30.6%), repeating-radial-gradient(circle at 30% 30%, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 2px, transparent 3px, transparent 10px)` }} />
          <div className="relative px-5 py-8 md:px-7 md:py-10 space-y-5" style={{ minHeight: "400px", marginTop: "72px", background: `linear-gradient(180deg, hsl(210 6% ${Math.min(baseLightness + 3, 88)}%), hsl(210 6% ${Math.max(baseLightness - 6, 12)}%))`, borderRadius: "24px", boxShadow: "inset 0 0 22px rgba(0,0,0,0.34), inset 0 1px 5px rgba(255,255,255,0.05)" }}>
            {sections.map((section: any, index) => (
              <SectionRenderer
                key={section.id || index}
                section={section}
                mode="item:stone_tablet"
                textColor={stoneTextColor}
                titleColor={stoneTextColor}
                fade={{ active: !!section._fade, color: "linear-gradient(180deg, rgba(82,86,92,0), rgba(56,59,65,0.86) 72%, rgba(56,59,65,1))" }}
                onOpenInfo={onOpenInfo}
              />
            ))}
            {renderLinkedDocuments(info, infoLookup, onOpenInfo, { color: stoneTextColor, border: "rgba(255,255,255,0.14)", bg: "rgba(0,0,0,0.24)" })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function renderInfoDisplayMode(info: ManagedInfoLike, props: RendererProps) {
  const mode = info.displayMode || "digital";
  switch (mode) {
    case "paper":
      return <PaperDocumentView {...props} />;
    case "item:stone_tablet":
      return <StoneTabletView {...props} />;
    case "digital":
    default:
      return <DigitalDocumentView {...props} />;
  }
}
