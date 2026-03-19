import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from "react";
import { useNavigate, Navigate } from "react-router";
import { retro } from "./retro-styles";
import { DISPLAY_CONTENTS, S_MUTED, S_DIM, S_SUBTLE, S_TEXT, S_RED } from "./shared-styles";
import {
  ArrowLeft, Paintbrush, Palette, Sticker, Coins,
  RotateCcw, Check, Eye, Camera, Upload, Trash2, User, Volume2, Play, Plus, X,
  ChevronDown, ChevronUp, Zap, Waves, AlertTriangle, ShieldOff,
} from "lucide-react";
import {
  getCredits,
  getOwnedColors,
  getOwnedPacks,
  getOwnedStickers,
  getOwnedMystery,
  getOwnedSounds,
} from "./game-leaderboard";
import {
  getPlayerTheme,
  resetPlayerTheme,
  DEFAULT_THEME,
  THEME_ELEMENT_LABELS,
  THEME_CATEGORIES,
  buildPageGradient,
  isGradient,
  firstColor,
  ts,
  parseGradient,
  buildGradient,
  GRADIENT_DIRECTIONS,
  STICKER_NAMES,
  type PlayerTheme,
} from "./player-theme";

import { STICKER_IMAGES } from "./sticker-images";
import { fetchProfilePicture, uploadProfilePicture, resizeImage, invalidatePfpCache, deleteProfilePicture } from "./profile-picture";
import { safeGetItem, safeGetJson } from "./safe-storage";
import { useDebouncedJsonStorage } from "./use-debounced-storage";
import {
  getSoundConfig,
  setSlotSound,
  getVariantsForSlot,
  getVariantsForSlotWithCustom,
  previewSound,
  ALL_SOUND_VARIANTS,
  STORE_SOUND_PACKS,
  STORE_INDIVIDUAL_SOUNDS,
  getCustomSounds,
  saveCustomSounds,
  deleteCustomSound,
  defaultCustomParams,
  playCustomSound,
  CUSTOM_PRESETS,
  type SoundSlot,
  type CustomSoundParams,
  type DecayCurve,
  type FilterKind,
  type PitchSweep,
  type NoteDirection,
} from "./sound-effects";

// ========================
// Built-in color data
// ========================
interface SingleColor { id: string; name: string; hex: string; price: number; }

const BUILTIN_COLORS: SingleColor[] = [
  { id: "cherry", name: "Cherry", hex: "#DE3163", price: 15 },
  { id: "crimson", name: "Crimson", hex: "#DC143C", price: 10 },
  { id: "scarlet", name: "Scarlet", hex: "#FF2400", price: 10 },
  { id: "ruby", name: "Ruby", hex: "#E0115F", price: 20 },
  { id: "rose", name: "Rose", hex: "#FF007F", price: 15 },
  { id: "tangerine", name: "Tangerine", hex: "#FF9966", price: 10 },
  { id: "amber", name: "Amber", hex: "#FFBF00", price: 15 },
  { id: "rust", name: "Rust", hex: "#B7410E", price: 10 },
  { id: "peach", name: "Peach", hex: "#FFCBA4", price: 10 },
  { id: "coral", name: "Coral", hex: "#FF7F50", price: 15 },
  { id: "gold", name: "Gold", hex: "#FFD700", price: 20 },
  { id: "lemon", name: "Lemon", hex: "#FFF44F", price: 10 },
  { id: "canary", name: "Canary", hex: "#FFEF00", price: 10 },
  { id: "buttercup", name: "Buttercup", hex: "#F9E154", price: 15 },
  { id: "sunflower", name: "Sunflower", hex: "#FFDA03", price: 15 },
  { id: "emerald", name: "Emerald", hex: "#50C878", price: 25 },
  { id: "lime", name: "Lime", hex: "#32CD32", price: 10 },
  { id: "mint", name: "Mint", hex: "#98FF98", price: 15 },
  { id: "forest", name: "Forest", hex: "#228B22", price: 20 },
  { id: "sage", name: "Sage", hex: "#BCB88A", price: 10 },
  { id: "jade", name: "Jade", hex: "#00A86B", price: 25 },
  { id: "olive", name: "Olive", hex: "#808000", price: 10 },
  { id: "cobalt", name: "Cobalt", hex: "#0047AB", price: 20 },
  { id: "cerulean", name: "Cerulean", hex: "#007BA7", price: 25 },
  { id: "azure", name: "Azure", hex: "#007FFF", price: 15 },
  { id: "navy", name: "Navy", hex: "#000080", price: 10 },
  { id: "sky", name: "Sky", hex: "#87CEEB", price: 10 },
  { id: "sapphire", name: "Sapphire", hex: "#0F52BA", price: 30 },
  { id: "teal", name: "Teal", hex: "#008080", price: 15 },
  { id: "cyan", name: "Cyan", hex: "#00FFFF", price: 20 },
  { id: "violet", name: "Violet", hex: "#7F00FF", price: 20 },
  { id: "lavender", name: "Lavender", hex: "#E6E6FA", price: 15 },
  { id: "plum", name: "Plum", hex: "#8E4585", price: 20 },
  { id: "mauve", name: "Mauve", hex: "#E0B0FF", price: 15 },
  { id: "amethyst", name: "Amethyst", hex: "#9966CC", price: 30 },
  { id: "indigo", name: "Indigo", hex: "#4B0082", price: 25 },
  { id: "orchid", name: "Orchid", hex: "#DA70D6", price: 20 },
  { id: "magenta", name: "Magenta", hex: "#FF00FF", price: 20 },
  { id: "bubblegum", name: "Bubblegum", hex: "#FFC1CC", price: 10 },
  { id: "salmon", name: "Salmon", hex: "#FA8072", price: 10 },
  { id: "hotpink", name: "Hot Pink", hex: "#FF69B4", price: 15 },
  { id: "blush", name: "Blush", hex: "#DE5D83", price: 15 },
  { id: "charcoal", name: "Charcoal", hex: "#36454F", price: 10 },
  { id: "slate", name: "Slate", hex: "#708090", price: 10 },
  { id: "ivory", name: "Ivory", hex: "#FFFFF0", price: 15 },
  { id: "silver", name: "Silver", hex: "#C0C0C0", price: 25 },
  { id: "bronze", name: "Bronze", hex: "#CD7F32", price: 35 },
  { id: "obsidian", name: "Obsidian", hex: "#0B0B0B", price: 40 },
  { id: "pearl", name: "Pearl", hex: "#FDEEF4", price: 45 },
  { id: "diamond", name: "Diamond", hex: "#B9F2FF", price: 50 },
];

function getPackColors(ownedPackIds: string[]): SingleColor[] {
  const BUILTIN_PACKS = [
    { id: "cga", name: "CGA", colors: ["#000000", "#55FFFF", "#FF55FF", "#FFFFFF"] },
    { id: "gameboy", name: "Game Boy", colors: ["#0F380F", "#306230", "#8BAC0F", "#9BBC0F"] },
    { id: "nes", name: "NES", colors: ["#000000", "#FCFCFC", "#F83800", "#0058F8", "#00A800"] },
    { id: "c64", name: "C64", colors: ["#000000", "#FFFFFF", "#68372B", "#70A4B2", "#6F3D86", "#588D43"] },
    { id: "pico8", name: "PICO-8", colors: ["#000000", "#1D2B53", "#7E2553", "#008751", "#AB5236", "#FF004D"] },
    { id: "pastel", name: "Pastel", colors: ["#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9", "#BAE1FF"] },
    { id: "mono", name: "Mono", colors: ["#000000", "#404040", "#808080", "#C0C0C0", "#FFFFFF"] },
    { id: "sepia", name: "Sepia", colors: ["#704214", "#8B6914", "#C4A35A", "#D2B48C", "#F5DEB3"] },
    { id: "dark", name: "Dark", colors: ["#0D0D0D", "#1A1A2E", "#16213E", "#0F3460", "#533483"] },
    { id: "ocean", name: "Ocean", colors: ["#003545", "#006D77", "#83C5BE", "#EDF6F9", "#FFDDD2"] },
    { id: "earth", name: "Earth", colors: ["#5C4033", "#8B7355", "#A0522D", "#D2B48C", "#228B22"] },
    { id: "spring", name: "Spring", colors: ["#FF69B4", "#98FB98", "#FFD700", "#87CEEB", "#DDA0DD"] },
    { id: "summer", name: "Summer", colors: ["#FF6B35", "#F7C59F", "#EFEFD0", "#004E89", "#1A659E"] },
    { id: "fall", name: "Fall", colors: ["#8B4513", "#D2691E", "#FF8C00", "#DAA520", "#B22222"] },
    { id: "winter", name: "Winter", colors: ["#A8DADC", "#457B9D", "#1D3557", "#F1FAEE", "#E8E8E8"] },
    { id: "horror", name: "Horror", colors: ["#1A0A0A", "#4A0000", "#8B0000", "#2D0A0A", "#660000"] },
    { id: "halloween", name: "Halloween", colors: ["#FF6600", "#000000", "#800080", "#1A1A1A", "#FFD700"] },
    { id: "christmas", name: "Christmas", colors: ["#C41E3A", "#00843D", "#FFD700", "#FFFFFF", "#B22222"] },
    { id: "cat", name: "Cat", colors: ["#F5A623", "#FFECD2", "#2C2C2C", "#8B6914", "#E8D5B7", "#4A4A4A"] },
    { id: "celestial", name: "Celestial", colors: ["#1B0A3C", "#2D1B69", "#C0C0FF", "#FFD700", "#7B68EE", "#E6E6FA"] },
    { id: "steampunk", name: "Steampunk", colors: ["#B87333", "#D4A017", "#3E2723", "#8B7355", "#C9B037", "#4E342E"] },
    { id: "glitch", name: "Glitch", colors: ["#39FF14", "#FF00FF", "#00FFFF", "#0A0A0A", "#8B00FF", "#FF003F"] },
  ];
  const customPacks: { id: string; name: string; colors: string[] }[] = safeGetJson("inet-dm-arcade-custom-packs", []);
  const allPacks = [...BUILTIN_PACKS, ...customPacks];
  const result: SingleColor[] = [];
  const seenHex = new Set<string>();
  for (const packId of ownedPackIds) {
    const pack = allPacks.find((p) => p.id === packId);
    if (!pack) continue;
    for (const hex of pack.colors) {
      const h = hex.toUpperCase();
      if (!seenHex.has(h)) {
        seenHex.add(h);
        result.push({ id: `pack-${packId}-${h}`, name: `${pack.name}: ${h}`, hex: h, price: 0 });
      }
    }
  }
  return result;
}

// (PersonalFilesMockup removed — stickers now use predefined slot system)

// ========================
// Main Component
// ========================
type CustTab = "theme" | "overview" | "profilepic" | "sounds";

/* ═══════════════════════���═══════════════════ */
/* Custom Sound Creator sub-component          */
/* ═══════════════════════════════════════════ */
function CustomSoundCreator({ slot, accentColor, labelColor }: { slot: SoundSlot; accentColor: string; labelColor: string }) {
  const defaults = defaultCustomParams(slot);
  const [open, setOpen] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [name, setName] = React.useState("");
  const [waveform, setWaveform] = React.useState<OscillatorType>(defaults.waveform);
  const [startFreq, setStartFreq] = React.useState(defaults.startFreq);
  const [endFreq, setEndFreq] = React.useState(defaults.endFreq);
  const [duration, setDuration] = React.useState(defaults.duration);
  const [volume, setVolume] = React.useState(defaults.volume);
  const [noteCount, setNoteCount] = React.useState(defaults.noteCount);
  const [noteSpacing, setNoteSpacing] = React.useState(defaults.noteSpacing);
  const [attack, setAttack] = React.useState(defaults.attack);
  const [decay, setDecay] = React.useState<DecayCurve>(defaults.decay);
  const [filterType, setFilterType] = React.useState<FilterKind>(defaults.filterType);
  const [filterFreq, setFilterFreq] = React.useState(defaults.filterFreq);
  const [filterQ, setFilterQ] = React.useState(defaults.filterQ);
  const [noiseAmount, setNoiseAmount] = React.useState(defaults.noiseAmount);
  const [noiseFilterFreq, setNoiseFilterFreq] = React.useState(defaults.noiseFilterFreq);
  const [pitchSweep, setPitchSweep] = React.useState<PitchSweep>(defaults.pitchSweep);
  const [sweepAmount, setSweepAmount] = React.useState(defaults.sweepAmount);
  const [detune, setDetune] = React.useState(defaults.detune);
  const [echo, setEcho] = React.useState(defaults.echo);
  const [echoDelay, setEchoDelay] = React.useState(defaults.echoDelay);
  const [echoDecay, setEchoDecay] = React.useState(defaults.echoDecay);
  const [noteDirection, setNoteDirection] = React.useState<NoteDirection>(defaults.noteDirection);
  const [secondWaveform, setSecondWaveform] = React.useState<"none" | OscillatorType>(defaults.secondWaveform);
  const [secondFreqOffset, setSecondFreqOffset] = React.useState(defaults.secondFreqOffset);
  const [limiter, setLimiter] = React.useState(defaults.limiter);

  const slotPrefix = slot === "navClick" ? "nav" : slot === "tabClick" ? "tab" : slot === "diceRoll" ? "dice" : "chime";

  const buildParams = (): CustomSoundParams => ({
    id: "preview", slot, name: name || "Preview",
    waveform, startFreq, endFreq, duration, volume, noteCount, noteSpacing,
    attack, decay, filterType, filterFreq, filterQ,
    noiseAmount, noiseFilterFreq, pitchSweep, sweepAmount, detune,
    echo, echoDelay, echoDecay, noteDirection, secondWaveform, secondFreqOffset,
    limiter,
  });

  const applyParams = (p: Partial<CustomSoundParams>) => {
    if (p.waveform !== undefined) setWaveform(p.waveform);
    if (p.startFreq !== undefined) setStartFreq(p.startFreq);
    if (p.endFreq !== undefined) setEndFreq(p.endFreq);
    if (p.duration !== undefined) setDuration(p.duration);
    if (p.volume !== undefined) setVolume(p.volume);
    if (p.noteCount !== undefined) setNoteCount(p.noteCount);
    if (p.noteSpacing !== undefined) setNoteSpacing(p.noteSpacing);
    if (p.attack !== undefined) setAttack(p.attack);
    if (p.decay !== undefined) setDecay(p.decay);
    if (p.filterType !== undefined) setFilterType(p.filterType);
    if (p.filterFreq !== undefined) setFilterFreq(p.filterFreq);
    if (p.filterQ !== undefined) setFilterQ(p.filterQ);
    if (p.noiseAmount !== undefined) setNoiseAmount(p.noiseAmount);
    if (p.noiseFilterFreq !== undefined) setNoiseFilterFreq(p.noiseFilterFreq);
    if (p.pitchSweep !== undefined) setPitchSweep(p.pitchSweep);
    if (p.sweepAmount !== undefined) setSweepAmount(p.sweepAmount);
    if (p.detune !== undefined) setDetune(p.detune);
    if (p.echo !== undefined) setEcho(p.echo);
    if (p.echoDelay !== undefined) setEchoDelay(p.echoDelay);
    if (p.echoDecay !== undefined) setEchoDecay(p.echoDecay);
    if (p.noteDirection !== undefined) setNoteDirection(p.noteDirection);
    if (p.secondWaveform !== undefined) setSecondWaveform(p.secondWaveform);
    if (p.secondFreqOffset !== undefined) setSecondFreqOffset(p.secondFreqOffset);
    if (p.limiter !== undefined) setLimiter(p.limiter);
  };

  const resetToDefaults = () => {
    const d = defaultCustomParams(slot);
    applyParams(d as any);
    setName("");
  };

  const previewCustom = () => { playCustomSound(buildParams(), 0.18); };

  const saveCustom = () => {
    if (!name.trim()) return;
    const existing = getCustomSounds();
    const id = `custom-${slotPrefix}-${Date.now()}`;
    const newSound: CustomSoundParams = { ...buildParams(), id, name: name.trim() };
    saveCustomSounds([...existing, newSound]);
    setSlotSound(slot, id);
    setOpen(false);
    setName("");
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1.5 text-[9px] px-3 py-1.5"
        style={{ color: "#DA70D6", border: "1px solid #DA70D644", borderRadius: 4, background: "#1A0A2A" }}
      >
        <Plus size={10} /> Create Custom Sound
      </button>
    );
  }

  const WAVEFORMS: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];
  const FILTER_KINDS: FilterKind[] = ["none", "lowpass", "highpass", "bandpass"];
  const DECAY_CURVES: DecayCurve[] = ["exponential", "linear", "sharp"];
  const SWEEP_KINDS: PitchSweep[] = ["none", "up", "down", "wobble"];
  const DIR_KINDS: NoteDirection[] = ["ascending", "descending", "random", "alternating"];

  const chipBtn = (active: boolean, label: string, onClick: () => void, key?: string) => (
    <button
      key={key ?? label}
      onClick={onClick}
      className="text-[8px] px-2 py-1"
      style={{
        background: active ? "#2A1A4A" : "#0A0A2E",
        border: active ? "1px solid #DA70D6" : "1px solid #1A1A4B",
        color: active ? "#DA70D6" : "#5A6A8A",
        borderRadius: 3,
      }}
    >
      {label}
    </button>
  );

  const sliderRow = (label: string, val: string | number, children: React.ReactNode) => (
    <div>
      <label className="text-[9px] block mb-1" style={S_SUBTLE}>{label}: <span style={S_TEXT}>{val}</span></label>
      {children}
    </div>
  );

  const rangeInput = (min: number, max: number, step: number, value: number, onChange: (v: number) => void) => (
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: "#DA70D6" }} />
  );

  return (
    <div className="mt-3 p-3" style={{ background: "#0E0620", border: "1px solid #3A1A5A", borderRadius: 6 }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={12} style={{ color: "#DA70D6" }} />
          <div className="text-[11px] font-bold" style={{ color: "#DA70D6" }}>Custom Sound Designer</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetToDefaults} className="text-[8px] px-2 py-0.5" style={{ color: "#FF6A6A", border: "1px solid #FF6A6A33", borderRadius: 3 }}>
            Reset
          </button>
          <button onClick={() => setOpen(false)} style={S_MUTED}><X size={14} /></button>
        </div>
      </div>

      <div className="space-y-3">
        {/* ��─ Presets ── */}
        <div>
          <label className="text-[9px] block mb-1.5" style={S_SUBTLE}>Quick Start Presets</label>
          <div className="flex flex-wrap gap-1.5">
            {CUSTOM_PRESETS.map((pr) => (
              <button
                key={pr.label}
                onClick={() => { applyParams({ ...defaultCustomParams(slot), ...pr.apply } as any); }}
                className="text-[8px] px-2 py-1 flex items-center gap-1"
                style={{ background: "#0C0828", border: "1px solid #2A1A5A", borderRadius: 3, color: "#B08ADA" }}
              >
                <span>{pr.emoji}</span> {pr.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Name ── */}
        <div>
          <label className="text-[9px] block mb-1" style={S_SUBTLE}>Name</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="My custom sound..."
            className="w-full px-2 py-1.5 text-[10px] bg-[#0A0A2E] outline-none"
            style={{ color: "#C0D0F0", border: "1px solid #1A1A4B", borderRadius: 3, fontFamily: "'Courier New', monospace" }}
          />
        </div>

        {/* ── Waveform ── */}
        <div>
          <label className="text-[9px] block mb-1" style={S_SUBTLE}>Waveform</label>
          <div className="flex gap-1.5">
            {WAVEFORMS.map((w) => chipBtn(waveform === w, w, () => setWaveform(w)))}
          </div>
        </div>

        {/* ── Frequency & Duration ── */}
        <div className="grid grid-cols-2 gap-3">
          {sliderRow("Start Freq", `${startFreq}Hz`, rangeInput(20, 4000, 10, startFreq, setStartFreq))}
          {sliderRow("End Freq", `${endFreq}Hz`, rangeInput(20, 4000, 10, endFreq, setEndFreq))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {sliderRow("Duration", `${duration.toFixed(2)}s`, rangeInput(0.02, 0.8, 0.01, duration, setDuration))}
          {sliderRow("Volume", `${volume}%`, rangeInput(10, 100, 5, volume, setVolume))}
        </div>

        {/* ── Envelope ── */}
        <div>
          <label className="text-[9px] block mb-1" style={S_SUBTLE}>Envelope</label>
          <div className="grid grid-cols-2 gap-3">
            {sliderRow("Attack", `${attack.toFixed(2)}s`, rangeInput(0, 0.3, 0.005, attack, setAttack))}
            <div>
              <label className="text-[9px] block mb-1" style={S_SUBTLE}>Decay Curve</label>
              <div className="flex gap-1">
                {DECAY_CURVES.map((d) => chipBtn(decay === d, d, () => setDecay(d)))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="grid grid-cols-2 gap-3">
          {sliderRow("Notes", noteCount, rangeInput(1, 8, 1, noteCount, setNoteCount))}
          {sliderRow("Note Spacing", `${noteSpacing.toFixed(3)}s`, rangeInput(0.01, 0.2, 0.005, noteSpacing, setNoteSpacing))}
        </div>
        {noteCount > 1 && (
          <div>
            <label className="text-[9px] block mb-1" style={S_SUBTLE}>Note Direction</label>
            <div className="flex gap-1">
              {DIR_KINDS.map((d) => chipBtn(noteDirection === d, d, () => setNoteDirection(d)))}
            </div>
          </div>
        )}

        {/* ── Advanced toggle ���─ */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-[9px] w-full py-1.5 justify-center"
          style={{ color: "#8A6AAA", border: "1px solid #2A1A4A", borderRadius: 4, background: "#0A0620" }}
        >
          {showAdvanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {showAdvanced ? "Hide" : "Show"} Advanced Options
        </button>

        {showAdvanced && (
          <div className="space-y-3 p-2" style={{ background: "#08041A", border: "1px solid #2A1A4A", borderRadius: 4 }}>

            {/* ── Filter ── */}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Waves size={10} style={S_SUBTLE} />
                <label className="text-[9px]" style={S_SUBTLE}>Filter</label>
              </div>
              <div className="flex gap-1 mb-2">
                {FILTER_KINDS.map((f) => chipBtn(filterType === f, f, () => setFilterType(f)))}
              </div>
              {filterType !== "none" && (
                <div className="grid grid-cols-2 gap-3">
                  {sliderRow("Cutoff", `${filterFreq}Hz`, rangeInput(100, 8000, 50, filterFreq, setFilterFreq))}
                  {sliderRow("Resonance (Q)", filterQ.toFixed(1), rangeInput(0.1, 15, 0.1, filterQ, setFilterQ))}
                </div>
              )}
            </div>

            {/* ── Pitch Sweep ── */}
            <div>
              <label className="text-[9px] block mb-1" style={S_SUBTLE}>Pitch Sweep</label>
              <div className="flex gap-1 mb-2">
                {SWEEP_KINDS.map((s) => chipBtn(pitchSweep === s, s, () => setPitchSweep(s)))}
              </div>
              {pitchSweep !== "none" && (
                sliderRow("Sweep Range", `\u00B1${sweepAmount}Hz`, rangeInput(10, 3000, 10, sweepAmount, setSweepAmount))
              )}
            </div>

            {/* ── Detune ── */}
            {sliderRow("Detune", `${detune > 0 ? "+" : ""}${detune} cents`, rangeInput(-100, 100, 1, detune, setDetune))}

            {/* ── Second Oscillator ── */}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-[9px]" style={S_SUBTLE}>Second Oscillator</label>
                {!limiter && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5" style={{ background: "#3A1A0A", border: "1px solid #FF6A3A44", borderRadius: 3 }}>
                    <AlertTriangle size={8} style={{ color: "#FF6A3A" }} />
                    <span className="text-[7px]" style={{ color: "#FF6A3A" }}>Limiter off - dual oscillators may produce loud output</span>
                  </div>
                )}
              </div>
              <div className="flex gap-1 mb-2">
                {chipBtn(secondWaveform === "none", "none", () => setSecondWaveform("none"))}
                {WAVEFORMS.map((w) => chipBtn(secondWaveform === w, w, () => setSecondWaveform(w)))}
              </div>
              {secondWaveform !== "none" && (
                sliderRow("Freq Offset", `${secondFreqOffset > 0 ? "+" : ""}${secondFreqOffset}Hz`,
                  rangeInput(-500, 500, 5, secondFreqOffset, setSecondFreqOffset))
              )}
            </div>

            {/* ── Noise Layer ── */}
            <div>
              <label className="text-[9px] block mb-1" style={S_SUBTLE}>Noise Layer</label>
              <div className="grid grid-cols-2 gap-3">
                {sliderRow("Amount", `${noiseAmount}%`, rangeInput(0, 100, 5, noiseAmount, setNoiseAmount))}
                {noiseAmount > 0 && sliderRow("Noise Filter", `${noiseFilterFreq}Hz`, rangeInput(200, 8000, 100, noiseFilterFreq, setNoiseFilterFreq))}
              </div>
            </div>

            {/* ── Echo ── */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-[9px]" style={S_SUBTLE}>Echo</label>
                <button onClick={() => setEcho(!echo)} className="text-[8px] px-2 py-0.5"
                  style={{ background: echo ? "#2A1A4A" : "#0A0A2E", border: echo ? "1px solid #DA70D6" : "1px solid #1A1A4B", color: echo ? "#DA70D6" : "#5A6A8A", borderRadius: 3 }}>
                  {echo ? "ON" : "OFF"}
                </button>
              </div>
              {echo && (
                <div className="grid grid-cols-2 gap-3">
                  {sliderRow("Delay", `${echoDelay.toFixed(2)}s`, rangeInput(0.03, 0.5, 0.01, echoDelay, setEchoDelay))}
                  {sliderRow("Feedback", `${Math.round(echoDecay * 100)}%`, rangeInput(0.05, 0.8, 0.05, echoDecay, setEchoDecay))}
                </div>
              )}
            </div>

            {/* ── Volume Limiter ── */}
            <div className="pt-2 mt-2" style={{ borderTop: "1px solid #2A1A4A" }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: limiter ? "#4AE04A" : "#FF3A3A" }} />
                  <label className="text-[9px] font-bold" style={{ color: limiter ? "#4AE04A" : "#FF3A3A" }}>
                    Volume Limiter {limiter ? "(Active)" : "(Disabled)"}
                  </label>
                </div>
                <span className="text-[7px]" style={S_MUTED}>Prevents clipping &amp; ear damage</span>
              </div>
              {limiter && (
                <div className="text-[8px] mb-2 px-2 py-1" style={{ color: "#5A8A5A", background: "#0A1A0A", border: "1px solid #1A3A1A", borderRadius: 3 }}>
                  Compressor limiter is active on all output. Loud signal peaks will be safely clamped.
                </div>
              )}
              {!limiter && (
                <div className="text-[8px] mb-2 px-2 py-1.5 flex items-center gap-1.5" style={{ color: "#FF6A3A", background: "#2A0A0A", border: "1px solid #5A1A1A", borderRadius: 3 }}>
                  <AlertTriangle size={10} style={{ color: "#FF3A3A", flexShrink: 0 }} />
                  <span>Limiter disabled. Combining high volume, multiple oscillators, noise, and echo without a limiter can produce dangerously loud sounds. Use at your own risk.</span>
                </div>
              )}
              <button
                onClick={() => setLimiter(!limiter)}
                className="flex items-center gap-1.5 text-[8px] px-3 py-1.5 w-full justify-center"
                style={{
                  color: limiter ? "#FF3A3A" : "#4AE04A",
                  background: limiter ? "#1A0808" : "#081A08",
                  border: `1px solid ${limiter ? "#5A1A1A" : "#1A5A1A"}`,
                  borderRadius: 4,
                }}
              >
                {limiter ? (
                  <div style={DISPLAY_CONTENTS}><ShieldOff size={10} /> Disable Limiter (Not Recommended)</div>
                ) : (
                  <div style={DISPLAY_CONTENTS}><Check size={10} /> Re-enable Limiter</div>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={previewCustom}
            className="flex items-center gap-1 text-[9px] px-3 py-1.5"
            style={{ color: "#7AB0FF", border: "1px solid #4A7BFF44", borderRadius: 3, background: "#0E1A3A" }}
          >
            <Play size={10} /> Preview
          </button>
          <button
            onClick={saveCustom}
            disabled={!name.trim()}
            className="flex items-center gap-1 text-[9px] px-3 py-1.5"
            style={{
              color: name.trim() ? "#4AE04A" : "#3A4A5A",
              border: `1px solid ${name.trim() ? "#4AE04A44" : "#1A1A3A"}`,
              borderRadius: 3,
              background: name.trim() ? "#0E1A0E" : "#0A0A1A",
            }}
          >
            <Check size={10} /> Save & Equip
          </button>
        </div>
      </div>
    </div>
  );
}

const CS_MUTED = { color: "#5A6A8A" } as const;
const CS_CHECK_POS = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "#FFF", filter: "drop-shadow(0 0 2px #000)" } as const;

const ColorSwatch = memo(function ColorSwatch({
  id, name, hex, isActive, onSelect,
}: {
  id: string; name: string; hex: string; isActive: boolean; onSelect: () => void;
}) {
  return (
    <button onClick={onSelect} className="group relative" title={`${name} (${hex})`}>
      <div style={{
        width: "100%", paddingBottom: "100%", borderRadius: 4,
        background: hex,
        border: isActive ? "3px solid #FFFFFF" : "2px solid rgba(255,255,255,0.1)",
        position: "relative",
      }}>
        {isActive && (
          <Check size={14} className="absolute" style={CS_CHECK_POS} />
        )}
      </div>
      <div className="text-[7px] text-center mt-0.5 truncate" style={CS_MUTED}>{name}</div>
    </button>
  );
});

export function CustomizationPage() {
  const navigate = useNavigate();
  const currentUser = safeGetItem("inet-user") || "";
  const currentUserId = safeGetItem("inet-user-id") || "";

  // Theme state — must be before any conditional returns (Rules of Hooks)
  const [theme, setTheme] = useState<PlayerTheme>(() => getPlayerTheme());
  const [activeElement, setActiveElement] = useState<keyof PlayerTheme>("accentColor");
  const [activeCategory, setActiveCategory] = useState(0);

  const themeStorageKey = `inet-player-theme-${currentUserId || "default"}`;
  useDebouncedJsonStorage(themeStorageKey, theme, 400);

  // Gradient mode state
  const [gradientMode, setGradientMode] = useState(false);
  const [gradColors, setGradColors] = useState<string[]>(["#4A7BFF", "#DA70D6"]);
  const [gradDirection, setGradDirection] = useState("90deg");
  const [gradEditIdx, setGradEditIdx] = useState(0);

  const [tab, setTab] = useState<CustTab>("theme");

  // Profile picture state
  const [pfpUrl, setPfpUrl] = useState<string | null>(null);
  const [pfpLoading, setPfpLoading] = useState(false);
  const [pfpUploading, setPfpUploading] = useState(false);
  const [pfpError, setPfpError] = useState<string | null>(null);
  const [pfpSuccess, setPfpSuccess] = useState(false);
  const pfpInputRef = useRef<HTMLInputElement>(null);

  // Load current profile picture on mount
  useEffect(() => {
    if (!currentUserId) return;
    setPfpLoading(true);
    fetchProfilePicture(currentUserId).then((img) => {
      setPfpUrl(img);
      setPfpLoading(false);
    });
  }, [currentUserId]);

  const handlePfpUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;
    setPfpUploading(true);
    setPfpError(null);
    setPfpSuccess(false);
    try {
      const resized = await resizeImage(file, 128);
      invalidatePfpCache(currentUserId);
      const result = await uploadProfilePicture(currentUserId, resized);
      if (result.success) {
        setPfpUrl(resized);
        setPfpSuccess(true);
        setTimeout(() => setPfpSuccess(false), 3000);
      } else {
        setPfpError(result.error || "Upload failed");
      }
    } catch (err) {
      setPfpError(`Error processing image: ${err}`);
    }
    setPfpUploading(false);
    // Reset file input so the same file can be re-selected
    if (pfpInputRef.current) pfpInputRef.current.value = "";
  }, [currentUserId]);

  if (!currentUser) return <Navigate to="/" />;

  const isDM = currentUserId === "dm" || currentUser === "DM";

  const credits = getCredits();
  const _ownedColorIds = getOwnedColors();
  const _ownedPackIds = getOwnedPacks();
  const _ownedStickerIds = getOwnedStickers();
  const ownedMystery = getOwnedMystery();
  const _ownedSounds = getOwnedSounds();

  const ALL_BUILTIN_PACK_IDS = [
    "cga", "gameboy", "nes", "c64", "pico8", "pastel", "mono", "sepia",
    "dark", "ocean", "earth", "spring", "summer", "fall", "winter",
    "horror", "halloween", "christmas", "cat", "celestial", "steampunk", "glitch",
  ];
  const customPacks: { id: string; name: string; colors: string[] }[] = safeGetJson("inet-dm-arcade-custom-packs", []);
  const customColors: SingleColor[] = safeGetJson("inet-dm-arcade-custom-colors", []);
  const customStickers: { id: string; name: string; price: number }[] = safeGetJson("inet-dm-arcade-custom-stickers", []);

  const ownedColorIds = isDM ? [...BUILTIN_COLORS.map(c => c.id), ...customColors.map(c => c.id)] : _ownedColorIds;
  const ownedPackIds = isDM ? [...ALL_BUILTIN_PACK_IDS, ...customPacks.map(p => p.id)] : _ownedPackIds;
  const ownedStickerIds = isDM
    ? ["fancy-stand", "fancy-jump", "gnarpy-paw", "gnarpy", "gnarpy-miku", ...customStickers.map(s => s.id)]
    : _ownedStickerIds;
  const ownedSounds = isDM ? STORE_INDIVIDUAL_SOUNDS.map(s => s.id) : _ownedSounds;

  const allOwnedColors = useMemo<SingleColor[]>(() => [
    ...BUILTIN_COLORS.filter((c) => ownedColorIds.includes(c.id)),
    ...customColors.filter((c) => ownedColorIds.includes(c.id)),
    ...getPackColors(ownedPackIds),
  ], [ownedColorIds, customColors, ownedPackIds]);

  // Sync gradient state when switching elements
  const syncGradientState = (el: keyof PlayerTheme) => {
    const val = theme[el];
    const parsed = parseGradient(val);
    if (parsed && parsed.colors.length >= 2) {
      setGradientMode(true);
      setGradColors(parsed.colors);
      setGradDirection(parsed.direction);
      setGradEditIdx(0);
    } else {
      setGradientMode(false);
      setGradColors([firstColor(val), DEFAULT_THEME[el] === val ? "#DA70D6" : firstColor(val)]);
      setGradDirection("90deg");
      setGradEditIdx(0);
    }
  };

  const handlePickColor = (element: keyof PlayerTheme, hex: string) => {
    const newTheme = { ...theme, [element]: hex };
    setTheme(newTheme);
  };

  const handleReset = () => {
    resetPlayerTheme();
    setTheme({ ...DEFAULT_THEME });
    setGradientMode(false);
  };

  const handleResetElement = (element: keyof PlayerTheme) => {
    handlePickColor(element, DEFAULT_THEME[element]);
  };

  const mainTabs: { id: CustTab; label: string; icon: React.ElementType }[] = [
    { id: "theme", label: "Theme Colors", icon: Palette },
    { id: "overview", label: "My Collection", icon: Paintbrush },
    { id: "profilepic", label: "Profile Picture", icon: User },
    { id: "sounds", label: "Sound Effects", icon: Volume2 },
  ];

  const tsc = (value: string): React.CSSProperties => ({ color: firstColor(value) });
  const bc = (value: string) => firstColor(value);

  const themeElements = Object.keys(THEME_ELEMENT_LABELS) as (keyof PlayerTheme)[];
  const currentCatKeys = THEME_CATEGORIES[activeCategory]?.keys ?? [];

  // Count modified fields
  const modifiedCount = useMemo(() => themeElements.filter((el) => theme[el] !== DEFAULT_THEME[el]).length, [themeElements, theme]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: buildPageGradient(theme.pageBg),
        fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
      }}
    >
      {/* Top toolbar */}
      <div className={`${retro.toolbar} flex items-center justify-between`} style={{ background: theme.toolbarBg }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/interface")}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            style={{ color: theme.accentColor }}
          >
            <ArrowLeft size={14} />
            <span className="text-[11px]">Back to Interface</span>
          </button>
          <span className="text-[11px]" style={S_DIM}>|</span>
          <span className="text-[11px]" style={{ color: "#DA70D6" }}>Customization</span>
        </div>
        <span className="text-[11px]" style={{ color: theme.labelColor }}>
          {currentUser}
        </span>
      </div>

      <div className="flex-1 p-4 max-w-[1100px] mx-auto w-full">
        {/* Header */}
        <div className="mb-5">
          <h1
            className="text-[36px] tracking-tight mb-1"
            style={{
              color: "#DA70D6",
              fontWeight: 700,
              fontFamily: "'Trebuchet MS', 'Tahoma', 'Verdana', sans-serif",
              textShadow: "3px 3px 0px #0A0A3B, 0 0 20px rgba(218, 112, 214, 0.3)",
            }}
          >
            CUSTOMIZATION
          </h1>
          <p className="text-[12px]" style={S_SUBTLE}>
            Personalize your I-Net experience with colors, badges, and more.
          </p>
        </div>

        {/* Credits banner */}
        <div className={`${retro.raised} p-3 mb-4 flex items-center gap-4 flex-wrap`} style={{ background: theme.panelBg }}>
          <Coins size={18} style={{ color: "#FFD700" }} />
          <div>
            <div className="text-[10px]" style={{ color: theme.labelColor }}>Credits</div>
            <div className="text-[18px] font-bold" style={{ color: "#FFD700", fontFamily: "'Courier New', monospace" }}>
              {isDM ? "∞" : credits.toLocaleString()} CR
            </div>
          </div>
          {isDM && (
            <div className="px-2 py-0.5 text-[9px] font-bold" style={{ background: "#FF6A6A18", color: "#FF6A6A", border: "1px solid #FF6A6A44", borderRadius: 3 }}>
              DM — All Items Unlocked
            </div>
          )}
          <div className="ml-auto flex gap-5 text-center">
            <div>
              <div className="text-[14px] font-bold" style={{ color: "#4AE04A" }}>{ownedColorIds.length}</div>
              <div className="text-[8px]" style={{ color: theme.labelColor }}>Colors</div>
            </div>
            <div>
              <div className="text-[14px] font-bold" style={{ color: "#4AE04A" }}>{ownedPackIds.length}</div>
              <div className="text-[8px]" style={{ color: theme.labelColor }}>Packs</div>
            </div>
            <div>
              <div className="text-[14px] font-bold" style={{ color: "#4AE04A" }}>{ownedStickerIds.length}</div>
              <div className="text-[8px]" style={{ color: theme.labelColor }}>Badges</div>
            </div>
            <div>
              <div className="text-[14px] font-bold" style={{ color: "#4AE04A" }}>{ownedSounds.length}</div>
              <div className="text-[8px]" style={{ color: theme.labelColor }}>Sounds</div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 mb-4">
          {mainTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-1.5`}
                style={{
                  color: tab === t.id ? "#DA70D6" : "#5A6A8A",
                  background: tab === t.id ? "#1A1A4A" : "transparent",
                  fontWeight: tab === t.id ? 700 : 400,
                }}
              >
                <Icon size={13} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ============================== */}
        {/* THEME TAB                       */}
        {/* ============================== */}
        {tab === "theme" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
            {/* Left: Categories + color picker */}
            <div className="space-y-4">
              {/* Category tabs + Reset */}
              <div className={`${retro.raised} p-4`} style={{ background: theme.panelBg }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[13px] font-bold" style={{ color: "#DA70D6" }}>
                    <Palette size={14} className="inline mr-1.5" />
                    Theme Settings
                    {modifiedCount > 0 && (
                      <span className="text-[9px] ml-2 px-1.5 py-0.5" style={{ background: "#FFD70022", color: "#FFD700", border: "1px solid #FFD70044" }}>
                        {modifiedCount} modified
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleReset}
                    className={`${retro.button} px-3 py-1 text-[10px] flex items-center gap-1`}
                    style={S_RED}
                  >
                    <RotateCcw size={10} /> Reset All
                  </button>
                </div>

                {/* Category tabs */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {THEME_CATEGORIES.map((cat, i) => (
                    <button
                      key={cat.label}
                      onClick={() => { setActiveCategory(i); setActiveElement(cat.keys[0]); syncGradientState(cat.keys[0]); }}
                      className={`${retro.button} px-3 py-1 text-[10px]`}
                      style={{
                        color: activeCategory === i ? "#DA70D6" : "#6A7A9A",
                        background: activeCategory === i ? "#2A1A4A" : "transparent",
                        fontWeight: activeCategory === i ? 700 : 400,
                      }}
                    >
                      {cat.label}
                      {cat.keys.some((k) => theme[k] !== DEFAULT_THEME[k]) && (
                        <span className="ml-1 text-[7px]" style={{ color: "#FFD700" }}>*</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Element buttons in current category */}
                <div className="flex flex-wrap gap-2">
                  {currentCatKeys.map((el) => (
                    <button
                      key={el}
                      onClick={() => { setActiveElement(el); syncGradientState(el); }}
                      className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-2`}
                      style={{
                        color: activeElement === el ? "#FFFFFF" : "#8A9ABF",
                        background: activeElement === el ? "#2A2A6B" : "transparent",
                        borderColor: activeElement === el ? firstColor(theme[el]) : undefined,
                      }}
                    >
                      <div style={{
                        width: 12, height: 12, borderRadius: 2,
                        background: theme[el],
                        border: "1px solid rgba(255,255,255,0.2)",
                        flexShrink: 0,
                      }} />
                      {THEME_ELEMENT_LABELS[el]}
                      {theme[el] !== DEFAULT_THEME[el] && (
                        <span className="text-[7px]" style={{ color: "#FFD700" }}>*</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color picker grid */}
              <div className={`${retro.raised} p-4`} style={{ background: theme.panelBg }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[12px] font-bold" style={{ color: firstColor(theme.accentColor) }}>
                    Pick color for: <span style={{ color: "#FFD700" }}>{THEME_ELEMENT_LABELS[activeElement]}</span>
                  </div>
                  {theme[activeElement] !== DEFAULT_THEME[activeElement] && (
                    <button
                      onClick={() => { handleResetElement(activeElement); setGradientMode(false); }}
                      className="text-[9px] px-2 py-0.5"
                      style={{ color: "#FF6A6A", border: "1px solid #FF6A6A44" }}
                    >
                      Reset to default
                    </button>
                  )}
                </div>

                {/* Current value preview */}
                <div className="flex items-center gap-2 mb-3">
                  <div style={{ width: 28, height: 14, borderRadius: 3, background: theme[activeElement], border: "1px solid rgba(255,255,255,0.2)", flexShrink: 0 }} />
                  <div className="text-[9px] truncate" style={{ color: theme.labelColor }}>
                    {isGradient(theme[activeElement]) ? "Gradient" : theme[activeElement]}
                    <span className="ml-2">Default: {DEFAULT_THEME[activeElement]}</span>
                  </div>
                </div>

                {/* Solid / Gradient toggle */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => {
                      setGradientMode(false);
                      // If currently a gradient, switch back to first color
                      if (isGradient(theme[activeElement])) {
                        handlePickColor(activeElement, firstColor(theme[activeElement]));
                      }
                    }}
                    className="px-3 py-1 text-[9px]"
                    style={{
                      background: !gradientMode ? "#2A2A6B" : "transparent",
                      color: !gradientMode ? "#FFFFFF" : "#6A7A9A",
                      border: `1px solid ${!gradientMode ? "#4A4A9B" : "#2A2A5B"}`,
                      fontWeight: !gradientMode ? 600 : 400,
                    }}
                  >
                    Solid Color
                  </button>
                  <button
                    onClick={() => {
                      setGradientMode(true);
                      const current = theme[activeElement];
                      const parsed = parseGradient(current);
                      if (parsed && parsed.colors.length >= 2) {
                        setGradColors(parsed.colors);
                        setGradDirection(parsed.direction);
                      } else {
                        setGradColors([firstColor(current), allOwnedColors[0]?.hex || "#DA70D6"]);
                        setGradDirection("90deg");
                      }
                      setGradEditIdx(0);
                    }}
                    className="px-3 py-1 text-[9px]"
                    style={{
                      background: gradientMode ? "#2A1A4A" : "transparent",
                      color: gradientMode ? "#DA70D6" : "#6A7A9A",
                      border: `1px solid ${gradientMode ? "#6A3A8A" : "#2A2A5B"}`,
                      fontWeight: gradientMode ? 600 : 400,
                    }}
                  >
                    Gradient (2-3)
                  </button>
                </div>

                {/* ---- GRADIENT MODE ---- */}
                {gradientMode && (
                  <div className="mb-3 space-y-2">
                    {/* Gradient preview bar */}
                    <div style={{ height: 24, borderRadius: 4, background: buildGradient(gradDirection, gradColors), border: "1px solid rgba(255,255,255,0.2)" }} />

                    {/* Direction selector */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[8px]" style={{ color: theme.labelColor }}>Direction:</span>
                      {GRADIENT_DIRECTIONS.map((d) => (
                        <button
                          key={d.value}
                          onClick={() => {
                            setGradDirection(d.value);
                            handlePickColor(activeElement, buildGradient(d.value, gradColors));
                          }}
                          className="px-1.5 py-0.5 text-[8px]"
                          style={{
                            background: gradDirection === d.value ? "#2A2A6B" : "transparent",
                            color: gradDirection === d.value ? "#FFFFFF" : "#6A7A9A",
                            border: `1px solid ${gradDirection === d.value ? "#4A4A9B" : "#2A2A5B"}`,
                          }}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>

                    {/* Color stops */}
                    <div className="flex items-center gap-2">
                      {gradColors.map((gc, i) => (
                        <button
                          key={i}
                          onClick={() => setGradEditIdx(i)}
                          className="flex items-center gap-1 px-2 py-1 text-[9px]"
                          style={{
                            background: gradEditIdx === i ? "#2A2A6B" : "transparent",
                            border: gradEditIdx === i ? `2px solid ${gc}` : "1px solid #2A2A5B",
                            color: "#C0D0F0",
                          }}
                        >
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: gc, border: "1px solid rgba(255,255,255,0.3)" }} />
                          Stop {i + 1}
                        </button>
                      ))}

                      {/* Add / remove stop */}
                      {gradColors.length < 3 && (
                        <button
                          onClick={() => {
                            const newColors = [...gradColors, allOwnedColors[1]?.hex || "#FFFFFF"];
                            setGradColors(newColors);
                            setGradEditIdx(newColors.length - 1);
                            handlePickColor(activeElement, buildGradient(gradDirection, newColors));
                          }}
                          className="px-1.5 py-1 text-[8px]"
                          style={{ color: "#4AE04A", border: "1px solid #4AE04A44" }}
                        >
                          + Add
                        </button>
                      )}
                      {gradColors.length > 2 && (
                        <button
                          onClick={() => {
                            const newColors = gradColors.slice(0, -1);
                            setGradColors(newColors);
                            setGradEditIdx(Math.min(gradEditIdx, newColors.length - 1));
                            handlePickColor(activeElement, buildGradient(gradDirection, newColors));
                          }}
                          className="px-1.5 py-1 text-[8px]"
                          style={{ color: "#FF6A6A", border: "1px solid #FF6A6A44" }}
                        >
                          - Remove
                        </button>
                      )}
                    </div>

                    <div className="text-[8px]" style={{ color: theme.labelColor }}>
                      Picking color for: <span style={{ color: "#FFD700" }}>Stop {gradEditIdx + 1}</span>
                    </div>
                  </div>
                )}

                {/* Color grid — picks solid color OR updates a gradient stop */}
                {allOwnedColors.length === 0 ? (
                  <div className="text-[11px] text-center py-6" style={{ color: "#5A6A8A", fontStyle: "italic" }}>
                    You don't own any colors yet. Visit the Arcade Shop to purchase some!
                  </div>
                ) : (
                  <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5" style={{ maxHeight: 220, overflowY: "auto" }}>
                    {/* Default color */}
                    <button
                      onClick={() => {
                        if (gradientMode) {
                          const newColors = [...gradColors];
                          newColors[gradEditIdx] = DEFAULT_THEME[activeElement];
                          setGradColors(newColors);
                          handlePickColor(activeElement, buildGradient(gradDirection, newColors));
                        } else {
                          handlePickColor(activeElement, DEFAULT_THEME[activeElement]);
                        }
                      }}
                      className="group relative"
                      title={`Default (${DEFAULT_THEME[activeElement]})`}
                    >
                      <div style={{
                        width: "100%", paddingBottom: "100%", borderRadius: 4,
                        background: DEFAULT_THEME[activeElement],
                        border: (gradientMode ? gradColors[gradEditIdx] === DEFAULT_THEME[activeElement] : theme[activeElement] === DEFAULT_THEME[activeElement])
                          ? "3px solid #FFFFFF" : "2px solid rgba(255,255,255,0.1)",
                        position: "relative",
                      }}>
                        {(gradientMode ? gradColors[gradEditIdx] === DEFAULT_THEME[activeElement] : theme[activeElement] === DEFAULT_THEME[activeElement]) && (
                          <Check size={14} className="absolute" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "#FFF", filter: "drop-shadow(0 0 2px #000)" }} />
                        )}
                      </div>
                      <div className="text-[7px] text-center mt-0.5 truncate" style={S_MUTED}>Default</div>
                    </button>
                    {allOwnedColors.map((c) => {
                      const isActive = gradientMode
                        ? gradColors[gradEditIdx] === c.hex
                        : theme[activeElement] === c.hex;
                      return (
                        <ColorSwatch
                          key={c.id}
                          id={c.id}
                          name={c.name}
                          hex={c.hex}
                          isActive={isActive}
                          onSelect={() => {
                            if (gradientMode) {
                              const newColors = [...gradColors];
                              newColors[gradEditIdx] = c.hex;
                              setGradColors(newColors);
                              handlePickColor(activeElement, buildGradient(gradDirection, newColors));
                            } else {
                              handlePickColor(activeElement, c.hex);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Live preview */}
            <div className="space-y-4">
              <div className={`${retro.raised} p-4`} style={{ background: theme.panelBg }}>
                <div className="text-[12px] font-bold mb-3" style={{ color: "#DA70D6" }}>
                  <Eye size={12} className="inline mr-1" /> Live Preview
                </div>
                <div className="rounded overflow-hidden" style={{ border: `2px solid ${bc(theme.panelBorder)}`, background: buildPageGradient(theme.pageBg) }}>
                  {/* Mini toolbar */}
                  <div className="px-3 py-1.5" style={{ background: theme.toolbarBg, borderBottom: `1px solid ${bc(theme.panelBorder)}` }}>
                    <span className="text-[9px]" style={ts(theme.accentColor)}>← Back</span>
                    <span className="text-[9px] float-right" style={ts(theme.labelColor)}>User</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="text-[11px] font-bold" style={ts(theme.headerColor)}>Page Title</div>
                    <div className="text-[9px]" style={ts(theme.textColor)}>Body text preview</div>
                    <div className="text-[8px]" style={ts(theme.labelColor)}>Label text</div>
                    <div className="p-2 rounded" style={{ background: theme.panelBg, border: `1px solid ${bc(theme.panelBorder)}` }}>
                      <div className="text-[9px] font-bold" style={ts(theme.accentColor)}>Panel</div>
                      <div className="text-[8px] mt-1" style={ts(theme.textColor)}>Content</div>
                      <div className="mt-1 px-2 py-0.5 rounded text-[8px]" style={{ background: theme.inputBg, border: `1px solid ${bc(theme.panelBorder)}`, ...tsc(theme.textColor) }}>
                        Input...
                      </div>
                    </div>
                    <div className="h-[1px]" style={{ background: theme.dividerColor }} />
                    <div className="flex gap-1">
                      <span className="text-[7px] px-1 py-0.5" style={{ background: theme.tagBg, ...tsc(theme.tagText) }}>Tag</span>
                      <span className="text-[7px] px-1 py-0.5" style={{ background: theme.tagBg, ...tsc(theme.tagText) }}>Filter</span>
                    </div>
                    {/* Card tile */}
                    <div className="p-1.5 rounded" style={{ background: theme.cardBg, border: `1px solid ${bc(theme.panelBorder)}` }}>
                      <div className="text-[8px] font-bold" style={ts(theme.accentColor)}>Item Card</div>
                      <div className="flex gap-1 mt-0.5">
                        <span className="text-[6px] px-0.5" style={ts(theme.rarityCommon)}>Common</span>
                        <span className="text-[6px] px-0.5" style={ts(theme.rarityUncommon)}>Uncommon</span>
                        <span className="text-[6px] px-0.5" style={ts(theme.rarityRare)}>Rare</span>
                      </div>
                    </div>
                    {/* HP colors */}
                    <div className="flex gap-2 text-[7px]">
                      <span style={ts(theme.hpHealthy)}>HP: 42/50</span>
                      <span style={ts(theme.hpWarning)}>HP: 12/50</span>
                      <span style={ts(theme.hpCritical)}>HP: 3/50</span>
                    </div>
                    {/* Button */}
                    <div className="text-[8px] text-center py-1 rounded" style={{ background: theme.uiButtonBg, border: `1px solid ${bc(theme.panelBorder)}`, ...tsc(theme.buttonColor) }}>
                      ACTION BUTTON
                    </div>
                  </div>
                </div>
              </div>

              {/* Current theme summary */}
              <div className={`${retro.raised} p-3`} style={{ background: theme.panelBg }}>
                <div className="text-[10px] font-bold mb-2" style={{ color: "#DA70D6" }}>
                  Current Theme ({modifiedCount} / {themeElements.length} customized)
                </div>
                <div className="space-y-0.5" style={{ maxHeight: 180, overflowY: "auto" }}>
                  {themeElements.map((el) => (
                    <div key={el} className="flex items-center gap-2">
                      <div style={{ width: isGradient(theme[el]) ? 16 : 8, height: 8, borderRadius: 2, background: theme[el], border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
                      <span className="text-[8px] flex-1 truncate" style={ts(theme.textColor)}>{THEME_ELEMENT_LABELS[el]}</span>
                      <span className="text-[7px] truncate max-w-[60px]" style={ts(theme.labelColor)}>{isGradient(theme[el]) ? "Gradient" : theme[el]}</span>
                      {theme[el] !== DEFAULT_THEME[el] && (
                        <span className="text-[6px]" style={{ color: "#FFD700" }}>*</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================== */}
        {/* OVERVIEW TAB                    */}
        {/* ============================== */}
        {tab === "overview" && (
          <div className="space-y-4">
            {/* Owned Colors */}
            <div className={`${retro.raised} p-4`} style={{ background: theme.panelBg }}>
              <div className="text-[13px] font-bold mb-3" style={{ color: theme.accentColor }}>
                <Palette size={14} className="inline mr-1.5" />
                Owned Colors ({ownedColorIds.length})
              </div>
              {allOwnedColors.length === 0 ? (
                <div className="text-[11px] py-3 text-center" style={{ color: "#5A6A8A", fontStyle: "italic" }}>
                  No colors owned yet. Visit the Arcade Shop!
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allOwnedColors.map((c) => (
                    <div key={c.id} className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: theme.inputBg, border: `1px solid ${bc(theme.panelBorder)}` }} title={`${c.name} (${c.hex})`}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, background: c.hex, border: "1px solid rgba(255,255,255,0.15)" }} />
                      <span className="text-[10px]" style={{ color: theme.textColor }}>{c.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Owned Stickers */}
            <div className={`${retro.raised} p-4`} style={{ background: theme.panelBg }}>
              <div className="text-[13px] font-bold mb-3" style={{ color: theme.accentColor }}>
                <Sticker size={14} className="inline mr-1.5" />
                Owned Badges ({ownedStickerIds.length})
              </div>
              {ownedStickerIds.length === 0 ? (
                <div className="text-[11px] py-3 text-center" style={{ color: "#5A6A8A", fontStyle: "italic" }}>
                  No badges owned yet.
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {ownedStickerIds.map((sid) => {
                    const img = STICKER_IMAGES[sid];
                    const name = STICKER_NAMES[sid] || sid;
                    if (!img) return null;
                    return (
                      <div key={sid} className="p-3 rounded text-center" style={{ background: theme.inputBg, border: `1px solid ${bc(theme.panelBorder)}` }}>
                        <img src={img} alt={name} className="mx-auto mb-1" style={{ width: 40, height: 40, objectFit: "contain" }} draggable={false} />
                        <div className="text-[10px]" style={{ color: theme.textColor }}>{name}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================== */}
        {/* PROFILE PICTURE TAB             */}
        {/* ============================== */}
        {tab === "profilepic" && (
          <div className="space-y-4">
            <div className={`${retro.raised} p-6`} style={{ background: theme.panelBg }}>
              <div className="flex items-center gap-2 mb-4">
                <Camera size={16} style={{ color: "#DA70D6" }} />
                <h2 className="text-[14px] font-bold" style={{ color: "#DA70D6" }}>
                  Profile Picture
                </h2>
              </div>
              <p className="text-[11px] mb-5" style={S_SUBTLE}>
                Upload a custom profile picture. It will appear next to your name in Community Chat and on the Interface sidebar. Uploading a new image replaces the previous one.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Current avatar preview */}
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="w-32 h-32 rounded flex items-center justify-center overflow-hidden shrink-0"
                    style={{
                      background: pfpUrl ? "transparent" : "#0A0A28",
                      border: `2px solid ${pfpUrl ? "#DA70D644" : "#1A1A4B"}`,
                    }}
                  >
                    {pfpLoading ? (
                      <div className="text-[10px]" style={S_MUTED}>Loading...</div>
                    ) : pfpUrl ? (
                      <img src={pfpUrl} alt="Profile" className="w-full h-full object-cover" draggable={false} />
                    ) : (
                      <User size={48} style={{ color: "#2A3A5B" }} />
                    )}
                  </div>
                  <div className="text-[10px]" style={S_MUTED}>
                    {pfpUrl ? "Current picture" : "No picture set"}
                  </div>
                </div>

                {/* Upload controls */}
                <div className="flex flex-col gap-3">
                  <input
                    ref={pfpInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePfpUpload}
                    className="hidden"
                    id="pfp-upload-input"
                  />
                  <button
                    onClick={() => pfpInputRef.current?.click()}
                    disabled={pfpUploading}
                    className={`${retro.button} px-5 py-2.5 text-[12px] flex items-center gap-2`}
                    style={{
                      color: pfpUploading ? "#5A6A8A" : "#DA70D6",
                      background: pfpUploading ? "#0A0A28" : "#1A1A4A",
                      cursor: pfpUploading ? "wait" : "pointer",
                    }}
                  >
                    <Upload size={14} />
                    {pfpUploading ? "Uploading..." : pfpUrl ? "Replace Picture" : "Upload Picture"}
                  </button>

                  {pfpUrl && (
                    <button
                      onClick={async () => {
                        if (!currentUserId) return;
                        if (!confirm("Remove your profile picture? This cannot be undone.")) return;
                        setPfpUploading(true);
                        setPfpError(null);
                        invalidatePfpCache(currentUserId);
                        const result = await deleteProfilePicture(currentUserId);
                        if (result.success) {
                          setPfpUrl(null);
                          setPfpSuccess(false);
                        } else {
                          setPfpError(result.error || "Failed to remove picture");
                        }
                        setPfpUploading(false);
                      }}
                      disabled={pfpUploading}
                      className={`${retro.button} px-5 py-2.5 text-[12px] flex items-center gap-2`}
                      style={{
                        color: pfpUploading ? "#5A6A8A" : "#FF6A6A",
                        background: pfpUploading ? "#0A0A28" : "#1A0A0A",
                        cursor: pfpUploading ? "wait" : "pointer",
                      }}
                    >
                      <Trash2 size={14} />
                      Reset Picture
                    </button>
                  )}

                  {pfpError && (
                    <div className="text-[10px] px-3 py-1.5" style={{ color: "#FF6A6A", background: "#FF6A6A11", border: "1px solid #FF6A6A33" }}>
                      {pfpError}
                    </div>
                  )}
                  {pfpSuccess && (
                    <div className="text-[10px] px-3 py-1.5 flex items-center gap-1" style={{ color: "#4AE04A", background: "#4AE04A11", border: "1px solid #4AE04A33" }}>
                      <Check size={12} /> Picture saved successfully!
                    </div>
                  )}

                  <div className="text-[9px] space-y-1" style={S_DIM}>
                    <div>Accepted formats: JPG, PNG, GIF, WebP</div>
                    <div>Image will be resized to 128x128</div>
                    <div>Stored on the server — visible to all players</div>
                  </div>
                </div>
              </div>

              {/* Preview in context */}
              {pfpUrl && (
                <div className="mt-6 pt-4" style={{ borderTop: "1px solid #1A1A4B" }}>
                  <div className="text-[10px] mb-3" style={S_MUTED}>Preview in Chat:</div>
                  <div className="flex items-start gap-2 px-2 py-1.5">
                    <img
                      src={pfpUrl}
                      alt="Preview"
                      className="w-8 h-8 rounded shrink-0 object-cover"
                      draggable={false}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold" style={S_TEXT}>{currentUser}</span>
                        <span className="text-[9px]" style={S_DIM}>Today at 12:00</span>
                      </div>
                      <div className="text-[12px]" style={{ color: "#B0C0E0" }}>(insert message)</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================== */}
        {/* SOUNDS TAB                      */}
        {/* ============================== */}
        {tab === "sounds" && (() => {
          const soundConfig = getSoundConfig();
          const SLOT_LABELS: Record<SoundSlot, { label: string; desc: string }> = {
            navClick: { label: "Page Navigation", desc: "Plays when navigating between pages" },
            tabClick: { label: "Tab Switch", desc: "Plays when switching tabs within a page" },
            diceRoll: { label: "Dice Roll", desc: "Plays when rolling dice in the character sheet" },
            successChime: { label: "Success Chime", desc: "Plays on successful card use or buff" },
          };
          const SLOT_ORDER: SoundSlot[] = ["navClick", "tabClick", "diceRoll", "successChime"];

          return (
            <div className="space-y-4">
              <div className={`${retro.raised} p-5`} style={{ background: theme.panelBg }}>
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 size={16} style={{ color: "#DA70D6" }} />
                  <h2 className="text-[14px] font-bold" style={{ color: "#DA70D6" }}>
                    Sound Effects
                  </h2>
                </div>
                <p className="text-[11px] mb-5" style={S_SUBTLE}>
                  Customize the sounds that play when you interact with different parts of I-Net.
                  Default sounds are always available. Purchase additional sounds from the Arcade Shop.
                </p>

                <div className="space-y-5">
                  {SLOT_ORDER.map((slot) => {
                    const info = SLOT_LABELS[slot];
                    const variants = getVariantsForSlotWithCustom(slot);
                    const currentId = soundConfig[slot];
                    const defaultId = variants[0]?.id || "";

                    return (
                      <div key={slot} className={`${retro.sunken} p-4`} style={{ background: "#0A0A28" }}>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="text-[12px] font-bold" style={S_TEXT}>
                              {info.label}
                            </div>
                            <div className="text-[9px]" style={S_MUTED}>
                              {info.desc}
                            </div>
                          </div>
                          {currentId !== defaultId && (
                            <button
                              onClick={() => setSlotSound(slot, defaultId)}
                              className="text-[9px] px-2 py-0.5"
                              style={{ color: "#FF6A6A", border: "1px solid #FF6A6A44" }}
                            >
                              Reset to default
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                          {variants.map((v) => {
                            const isDefault = v.id === defaultId;
                            const isNone = v.id.endsWith("-none");
                            const isFree = isDefault || isNone || !!v.isCustom;
                            const isOwned = isFree || ownedSounds.includes(v.id);
                            const isActive = currentId === v.id || (currentId === "default" && isDefault);
                            const isLocked = !isOwned;

                            return (
                              <div
                                key={v.id}
                                className="flex items-center gap-2 px-3 py-2 transition-all"
                                style={{
                                  background: isActive ? "#1A2A5A" : isLocked ? "#06061A" : "#0E0E30",
                                  border: isActive ? "1px solid #4A7BFF" : "1px solid #1A1A4B",
                                  borderRadius: 4,
                                  opacity: isLocked ? 0.5 : 1,
                                }}
                              >
                                <button
                                  onClick={() => previewSound(v.id, slot === "diceRoll" ? 3 : undefined)}
                                  className="shrink-0 flex items-center justify-center"
                                  style={{
                                    width: 28, height: 28, borderRadius: 4,
                                    background: isActive ? "#2A4A8A" : "#161640",
                                    border: `1px solid ${isActive ? "#4A7BFF" : "#2A2A5B"}`,
                                    color: isActive ? "#7AB0FF" : "#5A6A8A",
                                  }}
                                  title="Preview sound"
                                >
                                  <Play size={12} />
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[10px] font-bold truncate" style={{
                                    color: isActive ? "#AACCFF" : isLocked ? "#3A4A5A" : "#8A9ABF",
                                  }}>
                                    {v.name}
                                    {(isDefault || isNone) && <span className="text-[7px] ml-1" style={S_MUTED}>(free)</span>}
                                    {v.isCustom && <span className="text-[7px] ml-1" style={{ color: "#DA70D6" }}>(custom)</span>}
                                  </div>
                                  <div className="text-[8px] truncate" style={{ color: isLocked ? "#2A3A4A" : "#4A5A7A" }}>
                                    {isLocked ? "Not owned — buy in the Arcade Shop" : v.description}
                                  </div>
                                </div>
                                {isOwned && !isActive && (
                                  <button
                                    onClick={() => setSlotSound(slot, v.id)}
                                    className="shrink-0 text-[8px] px-2 py-1"
                                    style={{
                                      color: "#4AE04A", border: "1px solid #4AE04A44",
                                      borderRadius: 3,
                                    }}
                                  >
                                    Equip
                                  </button>
                                )}
                                {isActive && (
                                  <div className="shrink-0 flex items-center gap-1">
                                    <Check size={12} style={{ color: "#4AE04A" }} />
                                    <span className="text-[8px]" style={{ color: "#4AE04A" }}>Active</span>
                                  </div>
                                )}
                                {v.isCustom && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); deleteCustomSound(v.id); }}
                                    className="shrink-0"
                                    style={S_RED}
                                    title="Delete custom sound"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Create Custom Sound button */}
                        <CustomSoundCreator slot={slot} accentColor={firstColor(theme.accentColor)} labelColor={theme.labelColor} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={`${retro.raised} p-4`} style={{ background: theme.panelBg }}>
                <div className="text-[12px] font-bold mb-2" style={{ color: "#DA70D6" }}>
                  Sound Packs Available in Shop
                </div>
                <div className="text-[10px] mb-3" style={S_MUTED}>
                  Sound packs bundle 4 sounds (one per slot) at a discount. Individual sounds are also available.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {STORE_SOUND_PACKS.map((pack) => {
                    const allOwned = pack.soundIds.every(sid => ownedSounds.includes(sid));
                    const ownedCount = pack.soundIds.filter(sid => ownedSounds.includes(sid)).length;
                    return (
                      <div
                        key={pack.id}
                        className="p-3"
                        style={{
                          background: allOwned ? "#0E1A0E" : "#0A0A28",
                          border: allOwned ? "1px solid #2A5A2A" : "1px solid #1A1A4B",
                          borderRadius: 4,
                        }}
                      >
                        <div className="text-[11px] font-bold" style={{ color: allOwned ? "#4AE04A" : "#C0D0F0" }}>
                          {pack.name}
                        </div>
                        <div className="text-[9px] mt-0.5" style={S_MUTED}>
                          {pack.description}
                        </div>
                        <div className="text-[8px] mt-1" style={{ color: "#4A5A7A" }}>
                          {ownedCount}/{pack.soundIds.length} sounds owned
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {pack.soundIds.map(sid => {
                            const sv = ALL_SOUND_VARIANTS.find(v => v.id === sid);
                            const owned = ownedSounds.includes(sid);
                            return (
                              <span key={sid} className="text-[7px] px-1.5 py-0.5" style={{
                                background: owned ? "#4AE04A18" : "#1A1A3A",
                                color: owned ? "#4AE04A" : "#4A5A7A",
                                border: `1px solid ${owned ? "#4AE04A40" : "#2A2A4A"}`,
                                borderRadius: 2,
                              }}>
                                {sv?.name || sid}
                              </span>
                            );
                          })}
                        </div>
                        {!allOwned && (
                          <div className="text-[9px] mt-2" style={{ color: "#FFD700" }}>
                            {pack.price} CR in Arcade Shop
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}