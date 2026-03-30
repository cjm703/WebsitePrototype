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

function getDigitalTextColor(info: ManagedInfoLike, accentColor: string) {
  return info.displayData?.digitalTextColor || accentColor || "#8fd3ff";
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
        0% { transform: translateY(-24px); }
        100% { transform: translateY(24px); }
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
      @keyframes pfCaretBlink {
        0%, 49% { border-color: currentColor; }
        50%, 100% { border-color: transparent; }
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
}: {
  text: string;
  color: string;
  intensity: "low" | "medium" | "high";
  typewriter: boolean;
}) {
  const estimatedChars = Math.max(24, text.replace(/<[^>]*>/g, "").length);
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
      className="overflow-hidden border-r text-[11px] leading-7"
      style={{
        color,
        textShadow: getGlowShadow(color, intensity),
        borderColor: color,
        maxWidth: "100%",
        animation: `pfTypeIn ${Math.min(Math.max(estimatedChars * 0.035, 1.8), 8)}s steps(${Math.max(estimatedChars, 24)}, end) 1 forwards, pfCaretBlink 1s step-end infinite`,
      }}
    >
      {inner}
    </div>
  );
}

export function DigitalDocumentView({ theme, info, accentColor }: RendererProps) {
  const color = getDigitalTextColor(info, accentColor);
  const glowIntensity = info.displayData?.digitalGlowIntensity || "medium";
  const typewriter = !!info.displayData?.digitalTypewriter;

  return (
    <div className="flex-1 overflow-auto px-4 py-4">
      <SharedDisplayAnimations />
      <div
        className="max-w-[960px] mx-auto rounded border px-5 py-5 space-y-4 relative overflow-hidden"
        style={{
          borderColor: `${color}33`,
          background: "linear-gradient(180deg, rgba(4,7,16,0.98), rgba(2,4,10,0.98))",
          boxShadow: `0 8px 30px rgba(0,0,0,0.34), inset 0 0 0 1px ${color}10, inset 0 0 28px rgba(0,0,0,0.45)`,
          animation: "pfScreenFlicker 11s linear infinite",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 2px, transparent 5px)",
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
          />
        </div>
        <FollowUps info={info} theme={theme} accentColor={accentColor} />
      </div>
    </div>
  );
}

export function PaperDocumentView({ theme, info, accentColor }: RendererProps) {
  const futurePaperOverlayMode = info.displayData?.futurePaperOverlayMode || "pixel_handwriting";
  const tornEdgeStyle: React.CSSProperties = {
    clipPath: "polygon(0% 2%, 4% 0%, 10% 3%, 15% 1%, 21% 4%, 27% 2%, 33% 5%, 39% 1%, 46% 4%, 52% 0%, 59% 3%, 66% 1%, 72% 4%, 79% 2%, 86% 5%, 92% 1%, 97% 4%, 100% 7%, 98% 14%, 100% 22%, 97% 29%, 100% 36%, 98% 44%, 100% 52%, 97% 60%, 100% 68%, 98% 76%, 100% 84%, 96% 92%, 100% 100%, 93% 98%, 85% 100%, 78% 97%, 70% 100%, 63% 96%, 55% 100%, 48% 97%, 40% 100%, 33% 96%, 25% 99%, 18% 95%, 11% 100%, 4% 97%, 0% 100%, 3% 92%, 0% 84%, 2% 76%, 0% 68%, 3% 60%, 0% 52%, 2% 44%, 0% 36%, 3% 28%, 0% 20%, 2% 12%)",
  };

  return (
    <div className="flex-1 overflow-auto px-4 py-6">
      <div className="max-w-[940px] mx-auto px-2">
        <div className="relative p-4 md:p-5" style={{ background: "#020202", boxShadow: "0 24px 55px rgba(0,0,0,0.48)" }}>
          <div
            className="relative overflow-hidden"
            style={{
              ...tornEdgeStyle,
              background: "linear-gradient(180deg, rgba(251,250,246,1), rgba(240,236,226,1))",
              border: "1px solid rgba(145,128,96,0.28)",
              boxShadow: "inset 0 0 22px rgba(129,101,56,0.08), inset 0 0 0 1px rgba(255,255,255,0.4)",
            }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-35"
              style={{
                background: "radial-gradient(circle at 18% 16%, rgba(126,95,52,0.08), transparent 26%), radial-gradient(circle at 85% 78%, rgba(116,92,52,0.06), transparent 22%), linear-gradient(180deg, rgba(255,255,255,0.16), transparent 18%, transparent 84%, rgba(120,90,45,0.04))",
              }}
            />
            <div className="relative px-8 py-8 md:px-10 md:py-10 space-y-5" style={{ minHeight: "420px" }}>
              <div className="text-[12px] leading-7" style={{ color: "#241b12", fontFamily: '"Georgia", "Times New Roman", serif' }}>
                <RenderFormattedText text={info.content || info.description || "This paper does not have content yet."} />
              </div>
              <div className="text-[10px]" style={{ color: "#5e4730" }}>
                Paper Render Mode
                {futurePaperOverlayMode === "pixel_handwriting" ? <span> • Future plugin hook reserved for DM pixel-handwriting overlay.</span> : null}
              </div>
              <FollowUps info={info} theme={theme} accentColor={accentColor} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StoneTabletView({ info }: RendererProps) {
  const align = info.displayData?.alignment === "center" ? "center" : "left";
  return (
    <div className="flex-1 overflow-auto px-4 py-6">
      <div className="max-w-[980px] mx-auto min-h-full flex items-center justify-center">
        <div
          className="relative rounded-[26px] px-8 py-8 md:px-10 md:py-10 overflow-hidden"
          style={{
            width: "min(760px, 100%)",
            minHeight: "460px",
            background: "linear-gradient(160deg, rgba(112,116,122,0.98), rgba(67,70,76,0.98) 35%, rgba(47,50,55,0.98) 100%)",
            border: "1px solid rgba(208,212,218,0.12)",
            boxShadow: "0 34px 70px rgba(0,0,0,0.56), inset 0 3px 14px rgba(255,255,255,0.08), inset 0 -14px 28px rgba(0,0,0,0.36)",
          }}
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-[10px] rounded-[20px]" style={{ border: "1px solid rgba(255,255,255,0.05)", boxShadow: "inset 0 0 32px rgba(0,0,0,0.28)" }} />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[26px] opacity-40"
            style={{
              background: "radial-gradient(circle at 20% 16%, rgba(255,255,255,0.16), transparent 18%), radial-gradient(circle at 84% 76%, rgba(0,0,0,0.32), transparent 26%), radial-gradient(circle at 56% 40%, rgba(255,255,255,0.04), transparent 14%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[26px] opacity-18"
            style={{
              backgroundImage: "linear-gradient(118deg, transparent 0%, rgba(255,255,255,0.05) 16%, transparent 34%), linear-gradient(76deg, transparent 0%, transparent 70%, rgba(0,0,0,0.24) 86%, transparent 100%), linear-gradient(16deg, transparent 0%, transparent 46%, rgba(0,0,0,0.22) 47%, rgba(0,0,0,0.22) 48%, transparent 49%), linear-gradient(102deg, transparent 0%, transparent 62%, rgba(0,0,0,0.18) 63%, rgba(0,0,0,0.18) 64%, transparent 65%)",
            }}
          />
          <div
            className="relative rounded-[16px] px-6 py-6 md:px-8 md:py-8"
            style={{
              minHeight: "320px",
              background: "linear-gradient(180deg, rgba(83,87,93,0.96), rgba(56,59,65,0.96))",
              boxShadow: "inset 0 0 22px rgba(0,0,0,0.34), inset 0 1px 5px rgba(255,255,255,0.05)",
            }}
          >
            <div
              className="text-[12px] md:text-[13px] leading-8 tracking-[0.08em]"
              style={{
                color: "#c5cbc9",
                textAlign: align,
                textShadow: "1px 1px 0 rgba(255,255,255,0.08), -1px -1px 0 rgba(0,0,0,0.9), 0 2px 3px rgba(0,0,0,0.45)",
                fontFamily: '"Trebuchet MS", "Verdana", sans-serif',
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
