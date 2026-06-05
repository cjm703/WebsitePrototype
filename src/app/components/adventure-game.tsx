import React, { useCallback, useMemo, useState } from "react";
import { retro } from "./retro-styles";
import { S_ACCENT, S_DIM, S_GREEN, S_MUTED, S_RED, S_TEXT } from "./shared-styles";
import { ArrowLeft, Compass, Heart, Package, ShieldAlert, Sparkles, Trophy, RotateCcw, Tent } from "lucide-react";
import { safeGetItem, safeSetItem } from "./safe-storage";

type AdventurePhase = "idle" | "playing" | "ended";
type AdventureEnding = "victory" | "retreat" | "defeat";

interface AdventureRun {
  day: number;
  depth: number;
  hp: number;
  supplies: number;
  morale: number;
  relics: number;
  danger: number;
}

interface AdventureEvent {
  title: string;
  text: string;
  depth?: number;
  hp?: number;
  supplies?: number;
  morale?: number;
  relics?: number;
  danger?: number;
}

const HIGH_SCORE_KEY = "inet-adventure-highscore";
const INITIAL_RUN: AdventureRun = {
  day: 1,
  depth: 0,
  hp: 100,
  supplies: 8,
  morale: 70,
  relics: 0,
  danger: 0,
};

const EVENTS: AdventureEvent[] = [
  { title: "Old Map", text: "A half-burned route marker points deeper into the ruin.", depth: 1, morale: 3 },
  { title: "Collapsed Hall", text: "The path gives way. The crew scrambles through dust and broken stone.", hp: -8, danger: 1 },
  { title: "Hidden Cache", text: "A sealed ration chest survived beneath a cracked stair.", supplies: 2, morale: 2 },
  { title: "Watching Eyes", text: "Something follows from the dark. Nobody sleeps easy after that.", morale: -7, danger: 2 },
  { title: "Quiet Shrine", text: "A quiet shrine steadies the expedition for one more push.", hp: 6, morale: 6 },
  { title: "Relic Shard", text: "A faintly humming shard is pried from an ancient control plate.", relics: 1, danger: 1 },
  { title: "Dead End", text: "A false tunnel wastes precious time and food.", supplies: -1, morale: -3 },
  { title: "Safe Descent", text: "The expedition finds a maintenance ladder into lower chambers.", depth: 2, supplies: -1 },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getScore(run: AdventureRun, ending?: AdventureEnding) {
  const base = run.depth * 140 + run.relics * 520 + run.hp * 4 + run.supplies * 35 + run.morale * 5;
  const bonus = ending === "victory" ? 1200 : ending === "retreat" ? 300 : 0;
  return Math.max(0, Math.round(base + bonus - run.danger * 90));
}

function applyEvent(run: AdventureRun, event: AdventureEvent): AdventureRun {
  return {
    day: run.day + 1,
    depth: clamp(run.depth + (event.depth || 0), 0, 12),
    hp: clamp(run.hp + (event.hp || 0), 0, 100),
    supplies: clamp(run.supplies + (event.supplies || 0), 0, 12),
    morale: clamp(run.morale + (event.morale || 0), 0, 100),
    relics: clamp(run.relics + (event.relics || 0), 0, 9),
    danger: clamp(run.danger + (event.danger || 0), 0, 10),
  };
}

function randomEvent() {
  return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}

function getEnding(run: AdventureRun): AdventureEnding | null {
  if (run.hp <= 0 || run.supplies <= 0 || run.morale <= 0 || run.danger >= 10) return "defeat";
  if (run.depth >= 10 && run.relics >= 3) return "victory";
  return null;
}

export function AdventureGame({ onBack, onScoreSave }: { onBack: () => void; onScoreSave?: (score: number) => void }) {
  const [phase, setPhase] = useState<AdventurePhase>("idle");
  const [run, setRun] = useState<AdventureRun>(INITIAL_RUN);
  const [ending, setEnding] = useState<AdventureEnding | null>(null);
  const [log, setLog] = useState<string[]>([
    "DM expedition console initialized.",
    "Choose when to push deeper, camp, or return with what you found.",
  ]);
  const [highScore, setHighScore] = useState(() => parseInt(safeGetItem(HIGH_SCORE_KEY) || "0", 10) || 0);

  const score = useMemo(() => getScore(run, ending || undefined), [ending, run]);

  const appendLog = useCallback((entry: string) => {
    setLog((prev) => [entry, ...prev].slice(0, 8));
  }, []);

  const finishRun = useCallback((finalRun: AdventureRun, finalEnding: AdventureEnding) => {
    const finalScore = getScore(finalRun, finalEnding);
    setRun(finalRun);
    setEnding(finalEnding);
    setPhase("ended");
    if (finalScore > highScore) {
      setHighScore(finalScore);
      safeSetItem(HIGH_SCORE_KEY, String(finalScore));
    }
    if (finalScore > 0) onScoreSave?.(finalScore);
  }, [highScore, onScoreSave]);

  const startRun = useCallback(() => {
    setRun(INITIAL_RUN);
    setEnding(null);
    setPhase("playing");
    setLog([
      "The party enters the ruin at first light.",
      "Objective: reach depth 10 and recover 3 relics.",
    ]);
  }, []);

  const resolveTurn = useCallback((action: "scout" | "delve" | "camp" | "retreat") => {
    if (phase !== "playing") return;
    if (action === "retreat") {
      finishRun(run, run.relics > 0 || run.depth > 0 ? "retreat" : "defeat");
      appendLog("The expedition returns to base with the current haul.");
      return;
    }

    const baseEvent = randomEvent();
    let next = applyEvent(run, baseEvent);
    if (action === "scout") {
      next = { ...next, depth: clamp(next.depth + 1, 0, 12), supplies: clamp(next.supplies - 1, 0, 12), danger: clamp(next.danger - 1, 0, 10) };
      appendLog(`Scout: ${baseEvent.title} - ${baseEvent.text}`);
    }
    if (action === "delve") {
      next = { ...next, depth: clamp(next.depth + 2, 0, 12), hp: clamp(next.hp - 7, 0, 100), supplies: clamp(next.supplies - 2, 0, 12), danger: clamp(next.danger + 1, 0, 10) };
      appendLog(`Delve: ${baseEvent.title} - ${baseEvent.text}`);
    }
    if (action === "camp") {
      next = { ...next, hp: clamp(next.hp + 12, 0, 100), morale: clamp(next.morale + 8, 0, 100), supplies: clamp(next.supplies - 2, 0, 12), danger: clamp(next.danger + 1, 0, 10) };
      appendLog(`Camp: ${baseEvent.title} - ${baseEvent.text}`);
    }

    const finalEnding = getEnding(next);
    if (finalEnding) {
      finishRun(next, finalEnding);
      appendLog(finalEnding === "victory" ? "The party escapes with the core relics." : "The expedition collapses before it can return.");
      return;
    }
    setRun(next);
  }, [appendLog, finishRun, phase, run]);

  const endingText = ending === "victory"
    ? "VICTORY - Core relics recovered."
    : ending === "retreat"
      ? "RETREAT - Expedition returned to base."
      : "DEFEAT - Expedition lost.";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-[980px] flex items-center justify-between gap-3">
        <button onClick={onBack} className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`} style={S_ACCENT}>
          <ArrowLeft size={12} /> Back to Arcade
        </button>
        <div className="flex items-center gap-3">
          <Trophy size={14} style={{ color: "#FFD700" }} />
          <span className="text-[12px]" style={{ color: "#FFD700", fontFamily: "'Courier New', monospace" }}>HI: {highScore}</span>
        </div>
      </div>

      <div className={`${retro.raised} w-full max-w-[980px] p-5`} style={{ background: "#080E24", borderColor: "#1D3A5C" }}>
        <div className="flex flex-col lg:flex-row gap-5">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className={`${retro.sunken} p-3`} style={{ background: "#06162A" }}>
                <Compass size={28} style={{ color: "#64E0FF" }} />
              </div>
              <div>
                <h2 className="text-[24px] font-bold tracking-wide" style={{ color: "#64E0FF", fontFamily: "'Courier New', monospace" }}>ADVENTURE</h2>
                <p className="text-[11px]" style={S_MUTED}>DM-only expedition prototype. Reach depth 10 and recover 3 relics.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {[
                { label: "HP", value: run.hp, icon: Heart, color: "#FF6A6A" },
                { label: "Supplies", value: run.supplies, icon: Package, color: "#FFD37A" },
                { label: "Morale", value: run.morale, icon: Sparkles, color: "#8FF0B8" },
                { label: "Depth", value: run.depth, icon: Compass, color: "#64E0FF" },
                { label: "Relics", value: run.relics, icon: Trophy, color: "#FFD700" },
                { label: "Danger", value: run.danger, icon: ShieldAlert, color: "#FF8A6A" },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className={`${retro.sunken} px-3 py-2`} style={{ background: "#050A1A" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px]" style={S_DIM}>{stat.label}</span>
                      <Icon size={12} style={{ color: stat.color }} />
                    </div>
                    <div className="text-[22px] font-bold" style={{ color: stat.color, fontFamily: "'Courier New', monospace" }}>{stat.value}</div>
                  </div>
                );
              })}
            </div>

            {phase === "idle" && (
              <div className={`${retro.sunken} p-5 text-center`} style={{ background: "#050A1A" }}>
                <p className="text-[13px] mb-4" style={S_TEXT}>Launch a short DM-side expedition run. It is hidden from players for now.</p>
                <button onClick={startRun} className={`${retro.button} px-6 py-3 text-[13px] inline-flex items-center gap-2`} style={S_GREEN}>
                  <Compass size={15} /> Start Adventure
                </button>
              </div>
            )}

            {phase === "playing" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => resolveTurn("scout")} className={`${retro.button} px-4 py-3 text-left`} style={S_ACCENT}>
                  <div className="text-[13px] font-bold">Scout Ahead</div>
                  <div className="text-[10px]" style={S_MUTED}>Safer progress. Lowers danger a little.</div>
                </button>
                <button onClick={() => resolveTurn("delve")} className={`${retro.button} px-4 py-3 text-left`} style={S_RED}>
                  <div className="text-[13px] font-bold">Delve Deeper</div>
                  <div className="text-[10px]" style={S_MUTED}>Fast progress. Costs HP, supplies, and risk.</div>
                </button>
                <button onClick={() => resolveTurn("camp")} className={`${retro.button} px-4 py-3 text-left`} style={{ color: "#FFD37A" }}>
                  <div className="text-[13px] font-bold flex items-center gap-2"><Tent size={13} /> Make Camp</div>
                  <div className="text-[10px]" style={S_MUTED}>Recover HP and morale. Costs supplies.</div>
                </button>
                <button onClick={() => resolveTurn("retreat")} className={`${retro.button} px-4 py-3 text-left`} style={S_GREEN}>
                  <div className="text-[13px] font-bold">Return to Base</div>
                  <div className="text-[10px]" style={S_MUTED}>Bank the current score and end the run.</div>
                </button>
              </div>
            )}

            {phase === "ended" && (
              <div className={`${retro.sunken} p-5 text-center`} style={{ background: "#050A1A" }}>
                <div className="text-[17px] font-bold mb-2" style={{ color: ending === "victory" ? "#8FF0B8" : ending === "retreat" ? "#FFD37A" : "#FF6A6A", fontFamily: "'Courier New', monospace" }}>
                  {endingText}
                </div>
                <div className="text-[34px] font-bold mb-1" style={{ color: "#FFD700", fontFamily: "'Courier New', monospace" }}>{score}</div>
                <div className="text-[10px] mb-4" style={S_DIM}>FINAL SCORE</div>
                <button onClick={startRun} className={`${retro.button} px-6 py-3 text-[13px] inline-flex items-center gap-2`} style={S_ACCENT}>
                  <RotateCcw size={15} /> Run Again
                </button>
              </div>
            )}
          </div>

          <div className={`${retro.sunken} w-full lg:w-[320px] p-4`} style={{ background: "#050A1A" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-bold" style={{ color: "#64E0FF", fontFamily: "'Courier New', monospace" }}>RUN LOG</span>
              <span className="text-[10px]" style={S_DIM}>Day {run.day}</span>
            </div>
            <div className="space-y-2">
              {log.map((entry, index) => (
                <div key={`${entry}-${index}`} className="text-[11px] leading-relaxed border-l pl-2" style={{ color: index === 0 ? "#D7F6FF" : "#7A8AAA", borderLeftColor: index === 0 ? "#64E0FF" : "#1D3A5C" }}>
                  {entry}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
