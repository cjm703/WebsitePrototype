import React from "react";
import { FileText } from "lucide-react";
import { RenderFormattedText } from "./render-text";
import { firstColor, type PlayerTheme } from "./player-theme";

export type InfoDisplayMode =
  | "digital"
  | "paper"
  | "item:stone_tablet";

export type InfoDisplayData = {
  variant?: string;
  alignment?: "left" | "center";
  futurePaperOverlayMode?: "none" | "pixel_handwriting";
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
  followUps?: InfoFollowUp[];
  displayMode?: InfoDisplayMode;
  displayData?: InfoDisplayData;
};

type RendererProps = {
  theme: PlayerTheme;
  info: ManagedInfoLike;
  accentColor: string;
};

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
              <FileText
                size={13}
                style={{ color: accentColor, marginTop: "2px" }}
              />
              <div className="min-w-0">
                {followUp.title ? (
                  <div
                    className="text-[11px] font-semibold mb-1"
                    style={{ color: theme.textColor }}
                  >
                    {followUp.title}
                  </div>
                ) : null}

                <div className="text-[11px]" style={{ color: theme.textColor }}>
                  <RenderFormattedText
                    text={followUp.content || followUp.description || ""}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DigitalDocumentView({
  theme,
  info,
  accentColor,
}: RendererProps) {
  return (
    <div className="flex-1 overflow-auto px-4 py-4">
      <div
        className="max-w-[960px] mx-auto rounded border px-5 py-5 space-y-4 relative overflow-hidden"
        style={{
          borderColor: "rgba(124, 124, 185, 0.2)",
          background:
            "linear-gradient(180deg, rgba(8,10,22,0.96), rgba(5,7,16,0.96))",
          boxShadow: "0 8px 30px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.02)",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(255,255,255,0.045) 0, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 4px)",
            mixBlendMode: "screen",
          }}
        />
        <div
          className="relative text-[11px] leading-7"
          style={{
            color: "#cfe0ff",
            textShadow: `0 0 8px ${accentColor}22`,
          }}
        >
          <RenderFormattedText
            text={
              info.content ||
              info.description ||
              "This paper does not have content yet."
            }
          />
        </div>

        <FollowUps info={info} theme={theme} accentColor={accentColor} />
      </div>
    </div>
  );
}

export function PaperDocumentView({
  theme,
  info,
  accentColor,
}: RendererProps) {
  const futurePaperOverlayMode =
    info.displayData?.futurePaperOverlayMode || "pixel_handwriting";

  return (
    <div className="flex-1 overflow-auto px-4 py-6">
      <div className="max-w-[900px] mx-auto px-2">
        <div
          className="rounded border px-8 py-8 space-y-5 relative overflow-hidden"
          style={{
            borderColor: "rgba(90, 70, 40, 0.24)",
            background:
              "linear-gradient(180deg, rgba(232,220,194,0.98), rgba(214,198,168,0.98))",
            boxShadow:
              "0 18px 40px rgba(0,0,0,0.34), inset 0 0 28px rgba(84,56,25,0.10), inset 0 0 0 1px rgba(255,255,255,0.20)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(circle at 20% 20%, rgba(120,90,45,0.12), transparent 35%), radial-gradient(circle at 80% 70%, rgba(90,70,30,0.10), transparent 30%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, rgba(90,60,30,0.02), rgba(90,60,30,0.02)), linear-gradient(to right, rgba(255,255,255,0.06), transparent 18%, rgba(90,60,30,0.04) 62%, transparent 100%)",
            }}
          />
          <div
            className="relative text-[12px] leading-7"
            style={{
              color: "#2e2418",
              fontFamily: '"Georgia", "Times New Roman", serif',
            }}
          >
            <RenderFormattedText
              text={
                info.content ||
                info.description ||
                "This paper does not have content yet."
              }
            />
          </div>

          <div
            className="relative text-[10px]"
            style={{ color: "#5e4730" }}
          >
            Paper Render Mode
            {futurePaperOverlayMode === "pixel_handwriting" ? (
              <span>
                {" "}
                • Future plugin hook reserved for DM pixel-handwriting overlay.
              </span>
            ) : null}
          </div>

          <FollowUps info={info} theme={theme} accentColor={accentColor} />
        </div>
      </div>
    </div>
  );
}

export function StoneTabletView({
  theme,
  info,
}: RendererProps) {
  const align = info.displayData?.alignment === "center" ? "center" : "left";

  return (
    <div className="flex-1 overflow-auto px-4 py-6">
      <div className="max-w-[980px] mx-auto min-h-full flex items-center justify-center">
        <div
          className="relative rounded-[22px] px-8 py-8 md:px-10 md:py-10"
          style={{
            width: "min(720px, 100%)",
            minHeight: "420px",
            background:
              "linear-gradient(180deg, rgba(90,94,101,0.98), rgba(55,58,64,0.98))",
            border: "1px solid rgba(188,193,200,0.16)",
            boxShadow:
              "0 28px 60px rgba(0,0,0,0.44), inset 0 2px 12px rgba(255,255,255,0.08), inset 0 -12px 24px rgba(0,0,0,0.24)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[8px] rounded-[18px]"
            style={{
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "inset 0 0 24px rgba(0,0,0,0.20)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[22px] opacity-35"
            style={{
              background:
                "radial-gradient(circle at 18% 14%, rgba(255,255,255,0.16), transparent 18%), radial-gradient(circle at 84% 78%, rgba(0,0,0,0.26), transparent 28%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[22px] opacity-22"
            style={{
              backgroundImage:
                "linear-gradient(115deg, transparent 0%, rgba(255,255,255,0.05) 18%, transparent 35%), radial-gradient(circle at 30% 40%, rgba(0,0,0,0.22) 0, transparent 16%)",
            }}
          />
          <div
            className="relative rounded-[14px] px-6 py-6 md:px-8 md:py-8"
            style={{
              minHeight: "300px",
              background:
                "linear-gradient(180deg, rgba(77,81,87,0.96), rgba(52,55,61,0.96))",
              boxShadow:
                "inset 0 0 18px rgba(0,0,0,0.26), inset 0 1px 4px rgba(255,255,255,0.05)",
            }}
          >
            <div
              className="text-[12px] md:text-[13px] leading-8 tracking-[0.08em]"
              style={{
                color: "#d8ddd9",
                textAlign: align,
                textShadow:
                  "0 1px 0 rgba(0,0,0,0.75), 0 0 4px rgba(255,255,255,0.05)",
                fontFamily: '"Trebuchet MS", "Verdana", sans-serif',
              }}
            >
              <RenderFormattedText
                text={
                  info.content ||
                  info.description ||
                  "The inscription on this stone tablet has worn away."
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function renderInfoDisplayMode(
  info: ManagedInfoLike,
  props: RendererProps,
) {
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
