
import React from "react";
import { FileText } from "lucide-react";
import { RenderFormattedText } from "./render-text";
import type { PlayerTheme } from "./player-theme";

export type InfoDisplayMode =
  | "digital"
  | "paper"
  | "item:stone_tablet";

export type InfoDisplayData = {
  variant?: string;
  alignment?: "left" | "center";
  futurePaperOverlayMode?: "none" | "pixel_handwriting";

  digitalTextColor?: string;
  digitalGlowIntensity?: "low" | "medium" | "high";
  digitalTypewriter?: boolean;
  digitalBackgroundColor?: string;
  digitalTypewriterSpeed?: number;

  paperJaggedness?: number;
  paperExtraPages?: number;
  paperEdgeTexture?: number;

  stoneTextureIntensity?: number;
};

export type InfoFollowUp = {
  id?: string;
  title?: string;
  content?: string;
  description?: string;
};

export type ManagedInfoLike = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  content?: string;
  realWorldTime?: string;
  inWorldTime?: string;
  infoSubTab?: string;
  assignedTo?: string[];
  followUps?: InfoFollowUp[];
  displayMode?: InfoDisplayMode;
  displayData?: InfoDisplayData;
};

type RendererProps = {
  theme: PlayerTheme;
  info: ManagedInfoLike;
  accentColor: string;
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
      @keyframes pfTypeIn {
        from { width: 0; }
        to { width: 100%; }
      }
    `}</style>
  );
}

function FollowUps({
  info,
  theme,
  accentColor,
}: RendererProps) {
  if (!info.followUps?.length) return null;

  return (
    <div className="space-y-2">
      <div
        className="text-[10px] uppercase tracking-[0.16em] font-semibold"
        style={{ color: theme.labelColor }}
      >
        Related Notes
      </div>

      <div className="grid gap-2">
        {info.followUps.map((followUp, index) => (
          <div
            key={followUp.id || `${info.id}-followup-${index}`}
            className="rounded border px-3 py-2 transition-transform duration-150 hover:translate-x-[2px]"
            style={{
              borderColor: "rgba(124, 124, 185, 0.18)",
              background:
                "linear-gradient(180deg, rgba(10,13,27,0.95), rgba(7,9,20,0.95))",
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

function DigitalTextBlock({
  text,
  color,
  intensity,
  typewriter,
  typeSpeed,
}: {
  text: string;
  color: string;
  intensity: "low" | "medium" | "high";
  typewriter: boolean;
  typeSpeed: number;
}) {
  const estimatedChars = Math.max(24, text.replace(/<[^>]*>/g, "").length);
  const duration = clamp((estimatedChars / Math.max(typeSpeed, 5)) * 0.9, 1.2, 18);
  const inner = <RenderFormattedText text={text} />;

  if (!typewriter) {
    return (
      <div
        className="relative text-[11px] leading-7"
        style={{ color, textShadow: getGlowShadow(color, intensity) }}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden text-[11px] leading-7"
      style={{
        color,
        textShadow: getGlowShadow(color, intensity),
        maxWidth: "100%",
        animation: `pfTypeIn ${duration}s steps(${Math.max(estimatedChars, 24)}, end) 1 forwards`,
      }}
    >
      {inner}
    </div>
  );
}

export function DigitalDocumentView({ theme, info, accentColor }: RendererProps) {
  const color = getDigitalTextColor(info, accentColor);
  const background = getDigitalBackground(info);
  const glowIntensity = info.displayData?.digitalGlowIntensity || "medium";
  const typewriter = !!info.displayData?.digitalTypewriter;
  const typeSpeed = info.displayData?.digitalTypewriterSpeed || 30;

  return (
    <div className="flex-1 overflow-auto px-4 py-4">
      <SharedDisplayAnimations />
      <div
        className="max-w-[960px] mx-auto rounded border px-5 py-5 space-y-4 relative overflow-hidden"
        style={{
          borderColor: `${color}33`,
          background: `linear-gradient(180deg, ${background}, #02050a)`,
          boxShadow: `0 8px 30px rgba(0,0,0,0.34), inset 0 0 0 1px ${color}10, inset 0 0 28px rgba(0,0,0,0.45)`,
          animation: "pfScreenFlicker 11s linear infinite",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) 1px, transparent 2px, transparent 5px)",
            animation: "pfScanDrift 7s linear infinite",
            mixBlendMode: "screen",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 40px rgba(0,0,0,0.55)" }}
        />
        <div
          className="relative rounded px-3 py-3"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
            border: `1px solid ${color}18`,
          }}
        >
          <DigitalTextBlock
            text={info.content || info.description || "This paper does not have content yet."}
            color={color}
            intensity={glowIntensity}
            typewriter={typewriter}
            typeSpeed={typeSpeed}
          />
        </div>
        <FollowUps info={info} theme={theme} accentColor={accentColor} />
      </div>
    </div>
  );
}

function buildPaperClipPath(jaggedness: number) {
  const j = clamp(jaggedness, 0, 100) / 100;
  if (j <= 0.08) return "inset(0 round 2px)";

  const topA = 1 + 2 * j;
  const topB = 3 + 5 * j;
  const sideA = 2 + 4 * j;
  const sideB = 4 + 6 * j;

  return `polygon(
    0% ${topA}%,
    5% 0%,
    11% ${topB}%,
    18% 1%,
    26% ${topA + 1}%,
    35% 0%,
    45% ${topB}%,
    56% 0%,
    66% ${topA + 1}%,
    76% 0%,
    86% ${topB}%,
    95% 0%,
    100% ${sideA}%,
    98% 14%,
    100% 24%,
    97% 34%,
    100% 45%,
    98% 58%,
    100% 70%,
    97% 82%,
    100% 94%,
    94% 100%,
    84% 98%,
    73% 100%,
    61% 97%,
    50% 100%,
    39% 97%,
    27% 100%,
    16% 98%,
    6% 100%,
    0% 95%,
    ${sideB}% 84%,
    0% 72%,
    ${sideA}% 60%,
    0% 48%,
    ${sideB}% 36%,
    0% 24%,
    ${sideA}% 12%
  )`;
}

function PaperPage({
  info,
  accentColor,
  edgeTexture,
  jaggedness,
}: {
  info: ManagedInfoLike;
  accentColor: string;
  edgeTexture: number;
  jaggedness: number;
}) {
  const textureOpacity = clamp(edgeTexture, 0, 100) / 100 * 0.42;

  return (
    <div className="relative p-4 md:p-5" style={{ background: "#020202", boxShadow: "0 24px 55px rgba(0,0,0,0.48)" }}>
      <div
        className="relative overflow-hidden"
        style={{
          clipPath: buildPaperClipPath(jaggedness),
          background: "linear-gradient(180deg, rgba(252,251,248,1), rgba(241,238,229,1))",
          border: "1px solid rgba(145,128,96,0.28)",
          boxShadow: "inset 0 0 22px rgba(129,101,56,0.08), inset 0 0 0 1px rgba(255,255,255,0.4)",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: textureOpacity,
            background: "radial-gradient(circle at 0% 0%, rgba(92,70,41,0.32), transparent 16%), radial-gradient(circle at 100% 0%, rgba(92,70,41,0.28), transparent 16%), radial-gradient(circle at 0% 100%, rgba(92,70,41,0.28), transparent 18%), radial-gradient(circle at 100% 100%, rgba(92,70,41,0.32), transparent 16%), linear-gradient(90deg, rgba(95,72,42,0.14), transparent 7%, transparent 93%, rgba(95,72,42,0.14))",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-32"
          style={{
            background: "radial-gradient(circle at 18% 16%, rgba(126,95,52,0.08), transparent 26%), radial-gradient(circle at 85% 78%, rgba(116,92,52,0.06), transparent 22%), linear-gradient(180deg, rgba(255,255,255,0.16), transparent 18%, transparent 84%, rgba(120,90,45,0.04))",
          }}
        />
        <div className="relative px-8 py-8 md:px-10 md:py-10 space-y-5" style={{ minHeight: "860px" }}>
          <div className="text-[12px] leading-7" style={{ color: "#241b12", fontFamily: '"Georgia", "Times New Roman", serif' }}>
            <RenderFormattedText text={info.content || info.description || "This paper does not have content yet."} />
          </div>
          <FollowUps
            info={info}
            theme={{ textColor: "#241b12", labelColor: "#5e4730" } as PlayerTheme}
            accentColor={accentColor}
          />
        </div>
      </div>
    </div>
  );
}

export function PaperDocumentView({ info, accentColor }: RendererProps) {
  const jaggedness = info.displayData?.paperJaggedness ?? 22;
  const extraPages = info.displayData?.paperExtraPages ?? 0;
  const edgeTexture = info.displayData?.paperEdgeTexture ?? 24;
  const pages = 1 + clamp(extraPages, 0, 5);

  return (
    <div className="flex-1 overflow-auto px-4 py-6">
      <div className="max-w-[940px] mx-auto px-2 space-y-6">
        {Array.from({ length: pages }).map((_, index) => (
          <PaperPage
            key={`${info.id}-page-${index}`}
            info={index === 0 ? info : { ...info, followUps: [], content: "" }}
            accentColor={accentColor}
            edgeTexture={edgeTexture}
            jaggedness={jaggedness}
          />
        ))}
      </div>
    </div>
  );
}

export function StoneTabletView({ info }: RendererProps) {
  const align = info.displayData?.alignment === "center" ? "center" : "left";
  const textureIntensity = clamp(info.displayData?.stoneTextureIntensity ?? 55, 0, 100) / 100;

  return (
    <div className="flex-1 overflow-auto px-4 py-6">
      <div className="max-w-[760px] mx-auto min-h-full flex items-center justify-center">
        <div
          className="relative px-7 py-8 md:px-8 md:py-9 overflow-hidden"
          style={{
            width: "min(560px, 100%)",
            minHeight: "560px",
            borderRadius: "180px 180px 26px 26px / 150px 150px 26px 26px",
            background: "linear-gradient(180deg, rgba(111,116,121,0.98), rgba(69,72,78,0.98) 42%, rgba(47,50,55,0.98) 100%)",
            border: "1px solid rgba(208,212,218,0.12)",
            boxShadow: "0 34px 70px rgba(0,0,0,0.56), inset 0 3px 14px rgba(255,255,255,0.08), inset 0 -14px 28px rgba(0,0,0,0.36)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[10px]"
            style={{
              borderRadius: "170px 170px 18px 18px / 142px 142px 18px 18px",
              border: "1px solid rgba(255,255,255,0.05)",
              boxShadow: "inset 0 0 32px rgba(0,0,0,0.28)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background: `radial-gradient(circle at 20% 16%, rgba(255,255,255,${0.18 * textureIntensity}), transparent 18%), radial-gradient(circle at 84% 76%, rgba(0,0,0,${0.34 * textureIntensity}), transparent 26%), radial-gradient(circle at 56% 40%, rgba(255,255,255,${0.06 * textureIntensity}), transparent 14%), radial-gradient(circle at 35% 58%, rgba(0,0,0,${0.16 * textureIntensity}), transparent 10%)`,
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-28"
            style={{
              backgroundImage: "linear-gradient(118deg, transparent 0%, rgba(255,255,255,0.05) 16%, transparent 34%), linear-gradient(76deg, transparent 0%, transparent 70%, rgba(0,0,0,0.24) 86%, transparent 100%), linear-gradient(16deg, transparent 0%, transparent 46%, rgba(0,0,0,0.22) 47%, rgba(0,0,0,0.22) 48%, transparent 49%), linear-gradient(102deg, transparent 0%, transparent 62%, rgba(0,0,0,0.18) 63%, rgba(0,0,0,0.18) 64%, transparent 65%), repeating-radial-gradient(circle at 30% 30%, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 2px, transparent 3px, transparent 10px)",
            }}
          />
          <div
            className="relative px-5 py-8 md:px-7 md:py-10"
            style={{
              minHeight: "400px",
              marginTop: "72px",
              background: "linear-gradient(180deg, rgba(83,87,93,0.96), rgba(56,59,65,0.96))",
              borderRadius: "24px",
              boxShadow: "inset 0 0 22px rgba(0,0,0,0.34), inset 0 1px 5px rgba(255,255,255,0.05)",
            }}
          >
            <div
              className="text-[12px] md:text-[13px] leading-8 tracking-[0.08em]"
              style={{
                color: "#c4cbc8",
                textAlign: align,
                textShadow: "1px 1px 0 rgba(255,255,255,0.06), -1px -1px 0 rgba(0,0,0,0.92), 0 1px 0 rgba(0,0,0,0.85), 0 3px 4px rgba(0,0,0,0.42)",
                fontFamily: '"Trebuchet MS", "Verdana", sans-serif',
                filter: `contrast(${1 + 0.12 * textureIntensity})`,
              }}
            >
              <RenderFormattedText text={info.content || info.description || "The inscription on this stone tablet has worn away."} />
            </div>
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
