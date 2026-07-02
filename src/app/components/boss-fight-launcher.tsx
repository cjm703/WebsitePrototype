import React, { useState } from "react";
import { retro } from "./retro-styles";
import { S_ACCENT, DISPLAY_CONTENTS } from "./shared-styles";
import { Skull, AlertTriangle, Zap, ArrowLeft } from "lucide-react";
import { BossFight } from "./boss-fight";
import { BossFightBuu } from "./boss-fight-buu";
import { BossFightIntro } from "./boss-fight-intro";

type LauncherState = "lobby" | "intro" | "normal" | "buu";

export function BossFightLauncher({
  onBack,
  onScoreSave,
}: {
  onBack: () => void;
  onScoreSave?: (score: number) => void;
}) {
  const [state, setState] = useState<LauncherState>("lobby");

  if (state === "intro") {
    return (
      <div style={DISPLAY_CONTENTS}>
        <BossFightIntro onComplete={() => setState("normal")} />
      </div>
    );
  }

  if (state === "normal") {
    return <BossFight onBack={() => setState("lobby")} onScoreSave={onScoreSave} />;
  }

  if (state === "buu") {
    return <BossFightBuu onBack={() => setState("lobby")} onScoreSave={onScoreSave} />;
  }

  return (
    <div
      className="flex flex-col items-center w-full"
      style={{
        minHeight: "100vh",
        background: "#000000",
        color: "#FFFFFF",
        fontFamily: "'Courier New', monospace",
      }}
    >
      {/* Top bar */}
      <div className={`${retro.toolbar} flex items-center justify-between w-full`}>
        <button
          onClick={onBack}
          className="text-[14px] hover:opacity-80 flex items-center gap-2"
          style={S_ACCENT}
        >
          <ArrowLeft size={14} /> Back to Arcade
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-8 max-w-[600px] w-full">
        {/* Title */}
        <div className="flex flex-col items-center gap-3">
          <Skull size={48} style={{ color: "#FF4444" }} />
          <h1
            className="text-[36px] tracking-[0.15em] text-center"
            style={{
              color: "#FF4444",
              textShadow: "0 0 20px rgba(255,68,68,0.5), 0 0 40px rgba(255,68,68,0.2)",
            }}
          >
            BOSS FIGHT
          </h1>
          <div
            className="text-[12px] tracking-[0.3em] text-center"
            style={{ color: "#666" }}
          >
            COMBAT MODULE v1.0
          </div>
        </div>

        {/* Warning box */}
        <div
          className="w-full p-5"
          style={{
            border: "2px solid #FF6600",
            background: "rgba(255, 102, 0, 0.08)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} style={{ color: "#FF6600" }} />
            <span
              className="text-[16px] tracking-wider"
              style={{ color: "#FF6600" }}
            >
              WARNING
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[13px]" style={{ color: "#CC8844" }}>
              ⚠ This encounter is <span style={{ color: "#FF4444" }}>significantly harder</span> than
              other arcade games.
            </p>
            <p className="text-[13px]" style={{ color: "#CC8844" }}>
              ⚠ The battle <span style={{ color: "#FF4444" }}>cannot be paused</span> once it begins.
              There is no mercy in combat.
            </p>
            <p className="text-[13px]" style={{ color: "#CC8844" }}>
              ⚠ Prepare yourself before entering. You have been warned.
            </p>
          </div>
        </div>

        {/* Start Game button */}
        <button
          onClick={() => setState("intro")}
          className="w-full py-4 text-[20px] tracking-[0.2em] transition-all hover:brightness-125 cursor-pointer"
          style={{
            color: "#FFFFFF",
            background: "linear-gradient(180deg, #CC2222 0%, #881111 100%)",
            border: "2px solid #FF4444",
            boxShadow: "0 0 20px rgba(255,68,68,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
            fontFamily: "'Courier New', monospace",
          }}
        >
          ▶ START GAME
        </button>

        {/* Skip Intro button */}
        <button
          onClick={() => setState("normal")}
          className="w-full py-2 text-[12px] tracking-[0.2em] transition-all hover:opacity-100 cursor-pointer"
          style={{
            color: "#555",
            background: "transparent",
            border: "1px solid #333",
            opacity: 0.7,
            fontFamily: "'Courier New', monospace",
          }}
        >
          SKIP INTRO ▸▸
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 w-full">
          <div className="flex-1 h-px" style={{ background: "#222" }} />
          <span className="text-[11px]" style={{ color: "#333" }}>OR</span>
          <div className="flex-1 h-px" style={{ background: "#222" }} />
        </div>

        {/* Buu Mode button */}
        <button
          onClick={() => setState("buu")}
          className="w-full py-4 text-[18px] tracking-[0.15em] transition-all hover:brightness-125 cursor-pointer relative overflow-hidden"
          style={{
            color: "#FFB6C1",
            background: "linear-gradient(180deg, #8B2252 0%, #4A0028 100%)",
            border: "2px solid #FF69B4",
            boxShadow: "0 0 20px rgba(255,105,180,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
            fontFamily: "'Courier New', monospace",
          }}
        >
          <div className="flex items-center justify-center gap-3">
            <Zap size={20} style={{ color: "#FF69B4" }} />
            <span>ACTIVATE BUU MODE</span>
            <Zap size={20} style={{ color: "#FF69B4" }} />
          </div>
          <div
            className="text-[10px] mt-1 tracking-[0.2em]"
            style={{ color: "#AA5577" }}
          >
            A DIFFERENT KIND OF FIGHT...
          </div>
        </button>

        {/* Bottom flavor text */}
        <div className="text-[10px] text-center" style={{ color: "#2A2A2A" }}>
          I-NET Combat Systems™ · All encounters are final
        </div>
      </div>
    </div>
  );
}