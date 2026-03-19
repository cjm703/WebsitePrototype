// ════════════════════════════════════════════════════════
// Soft UI Sound Effects — synthesized via Web Audio API
// No external audio files needed. Cache-bust v3
// Now supports multiple sound variants per action
// ════════════════════════════════════════════════════════

import { safeGetItem, safeSetItem, safeSetJson } from "./safe-storage";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

// Master volume (0-1)
let masterVolume = 0.18;
export function setSoundVolume(v: number) { masterVolume = Math.max(0, Math.min(1, v)); }
export function getSoundVolume() { return masterVolume; }

// Global mute
let muted = false;
export function setSoundMuted(m: boolean) { muted = m; }
export function isSoundMuted() { return muted; }

// ════════════════════════════════════════════════════════
// Sound variant system
// ════════════════════════════════════════════════════════

export type SoundSlot = "navClick" | "tabClick" | "diceRoll" | "successChime";

export interface SoundVariant {
  id: string;
  name: string;
  slot: SoundSlot;
  description: string;
  play: (vol: number, param?: number) => void;
  isCustom?: boolean;
}

export interface SoundPack {
  id: string;
  name: string;
  description: string;
  price: number;
  soundIds: string[];
}

const SOUND_CONFIG_KEY = "inet-sound-config";

export function getSoundConfig(): Record<SoundSlot, string> {
  try {
    const raw = safeGetItem(SOUND_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { navClick: "default", tabClick: "default", diceRoll: "default", successChime: "default" };
}

export function setSoundConfig(config: Record<SoundSlot, string>) {
  safeSetJson(SOUND_CONFIG_KEY, config);
}

export function setSlotSound(slot: SoundSlot, soundId: string) {
  const cfg = getSoundConfig();
  cfg[slot] = soundId;
  setSoundConfig(cfg);
}

// ────────────────────────────────────────────
// SILENT variant (no-op)
// ────────────────────────────────────────────

function playNone() { /* intentionally silent */ }

// ────────────────────────────────────────────
// CUSTOM SOUND support
// ────────────────────────────────────────────

const CUSTOM_SOUNDS_KEY = "inet-custom-sounds";

export type DecayCurve = "exponential" | "linear" | "sharp";
export type FilterKind = "none" | "lowpass" | "highpass" | "bandpass";
export type PitchSweep = "none" | "up" | "down" | "wobble";
export type NoteDirection = "ascending" | "descending" | "random" | "alternating";

export interface CustomSoundParams {
  id: string;
  slot: SoundSlot;
  name: string;
  waveform: OscillatorType;
  startFreq: number;
  endFreq: number;
  duration: number;
  volume: number;
  noteCount: number;
  noteSpacing: number;
  attack: number;
  decay: DecayCurve;
  filterType: FilterKind;
  filterFreq: number;
  filterQ: number;
  noiseAmount: number;
  noiseFilterFreq: number;
  pitchSweep: PitchSweep;
  sweepAmount: number;
  detune: number;
  echo: boolean;
  echoDelay: number;
  echoDecay: number;
  noteDirection: NoteDirection;
  secondWaveform: "none" | OscillatorType;
  secondFreqOffset: number;
  limiter: boolean;
}

export function defaultCustomParams(slot: SoundSlot): Omit<CustomSoundParams, "id" | "name"> {
  return {
    slot,
    waveform: "sine",
    startFreq: 440,
    endFreq: 880,
    duration: 0.12,
    volume: 60,
    noteCount: 1,
    noteSpacing: 0.06,
    attack: 0,
    decay: "exponential",
    filterType: "none",
    filterFreq: 2000,
    filterQ: 1,
    noiseAmount: 0,
    noiseFilterFreq: 4000,
    pitchSweep: "none",
    sweepAmount: 200,
    detune: 0,
    echo: false,
    echoDelay: 0.12,
    echoDecay: 0.35,
    noteDirection: "ascending",
    secondWaveform: "none",
    secondFreqOffset: 0,
    limiter: true,
  };
}

export const CUSTOM_PRESETS: { label: string; emoji: string; apply: Partial<CustomSoundParams> }[] = [
  { label: "Blip", emoji: "\u25CF", apply: { waveform: "sine", startFreq: 1200, endFreq: 1600, duration: 0.04, noteCount: 1, decay: "exponential", volume: 70 } },
  { label: "Chime", emoji: "\u2727", apply: { waveform: "sine", startFreq: 523, endFreq: 1047, duration: 0.18, noteCount: 3, noteSpacing: 0.08, noteDirection: "ascending", volume: 55 } },
  { label: "Click", emoji: "\u25AA", apply: { waveform: "square", startFreq: 300, endFreq: 80, duration: 0.03, noteCount: 1, decay: "sharp", volume: 75 } },
  { label: "Whoosh", emoji: "~", apply: { waveform: "sawtooth", startFreq: 200, endFreq: 2000, duration: 0.15, noteCount: 1, filterType: "bandpass", filterFreq: 1500, filterQ: 3, noiseAmount: 60, volume: 50 } },
  { label: "Crunch", emoji: "\u26A1", apply: { waveform: "square", startFreq: 100, endFreq: 50, duration: 0.05, noteCount: 2, noteSpacing: 0.02, noiseAmount: 45, noiseFilterFreq: 6000, decay: "sharp", volume: 70 } },
  { label: "Bell", emoji: "\uD83D\uDD14", apply: { waveform: "sine", startFreq: 880, endFreq: 860, duration: 0.3, noteCount: 1, detune: 12, secondWaveform: "sine", secondFreqOffset: 5, volume: 50 } },
  { label: "Zap", emoji: "\u21AF", apply: { waveform: "sawtooth", startFreq: 3000, endFreq: 100, duration: 0.08, noteCount: 1, decay: "exponential", volume: 65 } },
  { label: "Sparkle", emoji: "\u2726", apply: { waveform: "sine", startFreq: 2000, endFreq: 4000, duration: 0.12, noteCount: 5, noteSpacing: 0.04, noteDirection: "random", detune: 20, volume: 45 } },
  { label: "Drum", emoji: "\u25C9", apply: { waveform: "sine", startFreq: 180, endFreq: 40, duration: 0.08, noteCount: 1, noiseAmount: 50, noiseFilterFreq: 3000, decay: "exponential", volume: 80 } },
  { label: "Echo Ping", emoji: "\u25CC", apply: { waveform: "sine", startFreq: 1000, endFreq: 1200, duration: 0.1, noteCount: 1, echo: true, echoDelay: 0.1, echoDecay: 0.4, volume: 55 } },
  { label: "Warble", emoji: "\u2248", apply: { waveform: "triangle", startFreq: 600, endFreq: 800, duration: 0.2, noteCount: 1, pitchSweep: "wobble", sweepAmount: 150, volume: 55 } },
  { label: "Siren", emoji: "\u26A0", apply: { waveform: "square", startFreq: 400, endFreq: 1200, duration: 0.25, noteCount: 2, noteSpacing: 0.06, pitchSweep: "up", sweepAmount: 400, noteDirection: "alternating", volume: 50, filterType: "lowpass", filterFreq: 3000, filterQ: 1 } },
];

export function getCustomSounds(): CustomSoundParams[] {
  try {
    const raw = safeGetItem(CUSTOM_SOUNDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveCustomSounds(sounds: CustomSoundParams[]) {
  safeSetJson(CUSTOM_SOUNDS_KEY, sounds);
}

export function deleteCustomSound(id: string) {
  const sounds = getCustomSounds().filter(s => s.id !== id);
  saveCustomSounds(sounds);
  const cfg = getSoundConfig();
  for (const slot of Object.keys(cfg) as SoundSlot[]) {
    if (cfg[slot] === id) cfg[slot] = slot === "navClick" ? "nav-default" : slot === "tabClick" ? "tab-default" : slot === "diceRoll" ? "dice-default" : "chime-default";
  }
  setSoundConfig(cfg);
}

export function playCustomSound(params: CustomSoundParams, vol: number) {
  const p = { ...defaultCustomParams(params.slot), ...params };
  const ctx = getCtx();
  const t = ctx.currentTime;
  const count = Math.max(1, Math.min(p.noteCount, 8));
  const dur = Math.max(0.02, p.duration);
  const atk = Math.max(0, Math.min(p.attack, dur * 0.8));
  const noteVol = (p.volume / 100) * vol;
  const peakGain = Math.min(0.2, noteVol * 0.1);

  // Limiter: DynamicsCompressorNode as final output stage
  let finalDest: AudioNode = ctx.destination;
  if (p.limiter !== false) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 6;
    comp.ratio.value = 16;
    comp.attack.value = 0.001;
    comp.release.value = 0.05;
    const limGain = ctx.createGain();
    limGain.gain.value = 0.85;
    comp.connect(limGain);
    limGain.connect(ctx.destination);
    finalDest = comp;
  }

  // Build echo destination if needed
  let dest: AudioNode = finalDest;
  if (p.echo && p.echoDelay > 0) {
    const dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(finalDest);
    const echoG = ctx.createGain();
    echoG.gain.value = Math.min(0.8, p.echoDecay);
    const delayNode = ctx.createDelay(1.0);
    delayNode.delayTime.value = Math.min(0.5, p.echoDelay);
    dry.connect(delayNode);
    delayNode.connect(echoG);
    echoG.connect(finalDest);
    echoG.connect(delayNode);
    dest = dry;
  }

  // Compute note order
  const noteIndices: number[] = [];
  for (let i = 0; i < count; i++) noteIndices.push(i);
  if (p.noteDirection === "descending") noteIndices.reverse();
  else if (p.noteDirection === "random") {
    for (let i = noteIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [noteIndices[i], noteIndices[j]] = [noteIndices[j], noteIndices[i]];
    }
  } else if (p.noteDirection === "alternating") {
    const alt: number[] = [];
    let lo = 0, hi = count - 1;
    let fromLo = true;
    while (lo <= hi) {
      alt.push(fromLo ? lo++ : hi--);
      fromLo = !fromLo;
    }
    noteIndices.splice(0, noteIndices.length, ...alt);
  }

  for (let seq = 0; seq < count; seq++) {
    const idx = noteIndices[seq];
    const delay = seq * Math.max(0.01, p.noteSpacing);
    const progress = count > 1 ? idx / (count - 1) : 0;
    const baseFreq = Math.max(20, p.startFreq + (p.endFreq - p.startFreq) * progress);
    const noteT = t + delay;

    // Build filter chain
    let filterNode: BiquadFilterNode | null = null;
    if (p.filterType !== "none") {
      filterNode = ctx.createBiquadFilter();
      filterNode.type = p.filterType;
      filterNode.frequency.value = Math.max(20, p.filterFreq);
      filterNode.Q.value = Math.max(0.1, p.filterQ);
    }

    // Main oscillator
    const osc = ctx.createOscillator();
    osc.type = p.waveform;
    osc.frequency.setValueAtTime(baseFreq, noteT);
    osc.detune.value = p.detune;

    // Pitch sweep
    if (p.pitchSweep === "up") {
      osc.frequency.linearRampToValueAtTime(Math.max(20, baseFreq + p.sweepAmount), noteT + dur);
    } else if (p.pitchSweep === "down") {
      osc.frequency.linearRampToValueAtTime(Math.max(20, baseFreq - p.sweepAmount), noteT + dur);
    } else if (p.pitchSweep === "wobble") {
      const wobbleRate = 12;
      const steps = Math.ceil(dur * wobbleRate);
      for (let w = 0; w <= steps; w++) {
        const wt = noteT + (w / wobbleRate);
        const wobbleFreq = baseFreq + Math.sin(w * Math.PI) * p.sweepAmount * 0.5;
        osc.frequency.setValueAtTime(Math.max(20, wobbleFreq), wt);
      }
    }

    // Gain envelope
    const g = ctx.createGain();
    if (atk > 0) {
      g.gain.setValueAtTime(0.001, noteT);
      g.gain.linearRampToValueAtTime(peakGain, noteT + atk);
    } else {
      g.gain.setValueAtTime(peakGain, noteT);
    }
    const decayStart = noteT + atk;
    const decayDur = Math.max(0.01, dur - atk);
    if (p.decay === "linear") {
      g.gain.linearRampToValueAtTime(0.001, decayStart + decayDur);
    } else if (p.decay === "sharp") {
      g.gain.setValueAtTime(peakGain, decayStart);
      g.gain.setValueAtTime(peakGain * 0.3, decayStart + decayDur * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, decayStart + decayDur);
    } else {
      g.gain.exponentialRampToValueAtTime(0.001, decayStart + decayDur);
    }

    // Wire: osc -> [filter] -> gain -> dest
    if (filterNode) {
      osc.connect(filterNode);
      filterNode.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(dest);
    osc.start(noteT);
    osc.stop(noteT + dur + 0.01);

    // Second oscillator layer
    if (p.secondWaveform !== "none") {
      const osc2 = ctx.createOscillator();
      osc2.type = p.secondWaveform as OscillatorType;
      osc2.frequency.setValueAtTime(Math.max(20, baseFreq + p.secondFreqOffset), noteT);
      osc2.detune.value = p.detune;
      if (p.pitchSweep === "up") osc2.frequency.linearRampToValueAtTime(Math.max(20, baseFreq + p.secondFreqOffset + p.sweepAmount), noteT + dur);
      else if (p.pitchSweep === "down") osc2.frequency.linearRampToValueAtTime(Math.max(20, baseFreq + p.secondFreqOffset - p.sweepAmount), noteT + dur);
      const g2 = ctx.createGain();
      if (atk > 0) {
        g2.gain.setValueAtTime(0.001, noteT);
        g2.gain.linearRampToValueAtTime(peakGain * 0.6, noteT + atk);
      } else {
        g2.gain.setValueAtTime(peakGain * 0.6, noteT);
      }
      g2.gain.exponentialRampToValueAtTime(0.001, noteT + Math.max(atk + 0.01, dur));
      if (filterNode) {
        osc2.connect(filterNode);
        // filterNode already connected to g -> dest, so create a separate gain for osc2
        const g2f = ctx.createGain();
        g2f.gain.setValueAtTime(1, noteT);
        filterNode.connect(g2f);
        g2f.connect(dest);
      } else {
        osc2.connect(g2);
        g2.connect(dest);
      }
      osc2.start(noteT);
      osc2.stop(noteT + dur + 0.01);
    }

    // Noise layer
    if (p.noiseAmount > 0) {
      const noiseDur = dur;
      const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let j = 0; j < nd.length; j++) nd[j] = (Math.random() * 2 - 1);
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      const nf = ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = Math.max(100, p.noiseFilterFreq);
      nf.Q.value = 1.5;
      const ng = ctx.createGain();
      const noiseVol = peakGain * (p.noiseAmount / 100);
      ng.gain.setValueAtTime(noiseVol, noteT);
      ng.gain.exponentialRampToValueAtTime(0.001, noteT + noiseDur);
      noiseSrc.connect(nf);
      nf.connect(ng);
      ng.connect(dest);
      noiseSrc.start(noteT);
      noiseSrc.stop(noteT + noiseDur + 0.01);
    }
  }
}

export function buildCustomVariant(p: CustomSoundParams): SoundVariant {
  const tags: string[] = [p.waveform || "sine"];
  if (p.noteCount > 1) tags.push(`${p.noteCount} notes`);
  if (p.filterType && p.filterType !== "none") tags.push(p.filterType);
  if (p.noiseAmount > 0) tags.push("noise");
  if (p.echo) tags.push("echo");
  if (p.secondWaveform && p.secondWaveform !== "none") tags.push("dual-osc");
  if (p.pitchSweep && p.pitchSweep !== "none") tags.push(p.pitchSweep);
  if (p.limiter === false) tags.push("no-limiter");
  return {
    id: p.id,
    name: p.name,
    slot: p.slot,
    description: tags.join(" \u00B7 "),
    play: (vol: number) => playCustomSound(p, vol),
    isCustom: true,
  };
}

export function getVariantsForSlotWithCustom(slot: SoundSlot): SoundVariant[] {
  const builtIn = ALL_SOUND_VARIANTS.filter(v => v.slot === slot);
  const custom = getCustomSounds().filter(c => c.slot === slot).map(buildCustomVariant);
  return [...builtIn, ...custom];
}

// ────────────────────────────────────────────
// NAV CLICK variants
// ───────────────────────────────────────────

function playNavDefault(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08 * vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  gain.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1100, t);
  osc.frequency.exponentialRampToValueAtTime(1400, t + 0.03);
  osc.connect(gain);
  osc.start(t);
  osc.stop(t + 0.05);
}

function playNavRetroBlip(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.setValueAtTime(1320, t + 0.02);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.06 * vol, t);
  gain.gain.setValueAtTime(0.08 * vol, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}

function playNavTypewriter(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const bufSize = Math.floor(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12 * vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  src.connect(hp);
  hp.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.04);
  const thud = ctx.createOscillator();
  thud.type = "sine";
  thud.frequency.setValueAtTime(300, t);
  thud.frequency.exponentialRampToValueAtTime(100, t + 0.02);
  const thudG = ctx.createGain();
  thudG.gain.setValueAtTime(0.06 * vol, t);
  thudG.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  thud.connect(thudG);
  thudG.connect(ctx.destination);
  thud.start(t);
  thud.stop(t + 0.03);
}

function playNavCrystal(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const freqs = [2637, 3520];
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05 * vol, t + i * 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + i * 0.04);
    osc.stop(t + i * 0.04 + 0.15);
  });
}

function playNavBubble(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(400, t);
  osc.frequency.exponentialRampToValueAtTime(1200, t + 0.04);
  osc.frequency.exponentialRampToValueAtTime(600, t + 0.08);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08 * vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.1);
}

// ────────────────────────────────────────────
// TAB CLICK variants
// ────────────────────────────────────────────

function playTabDefault(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const bufferSize = Math.floor(ctx.sampleRate * 0.06);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(4000, t);
  filter.frequency.exponentialRampToValueAtTime(8000, t + 0.04);
  filter.Q.value = 0.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.06 * vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(t);
  noise.stop(t + 0.06);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.03);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.04 * vol, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.04);
}

function playTabSwoosh(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const bufSize = Math.floor(ctx.sampleRate * 0.08);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(1000, t);
  bp.frequency.exponentialRampToValueAtTime(6000, t + 0.06);
  bp.Q.value = 1.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.1 * vol, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  src.connect(bp);
  bp.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.08);
}

function playTabMechanical(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.03);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.07 * vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.04);
  const click = ctx.createOscillator();
  click.type = "sawtooth";
  click.frequency.value = 4000;
  const clickG = ctx.createGain();
  clickG.gain.setValueAtTime(0.04 * vol, t);
  clickG.gain.exponentialRampToValueAtTime(0.001, t + 0.01);
  click.connect(clickG);
  clickG.connect(ctx.destination);
  click.start(t);
  click.stop(t + 0.015);
}

function playTabHarp(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const freqs = [523.25, 659.25];
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06 * vol, t + i * 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.03 + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + i * 0.03);
    osc.stop(t + i * 0.03 + 0.2);
  });
}

function playTabStatic(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const bufSize = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(8000, t);
  lp.frequency.exponentialRampToValueAtTime(2000, t + 0.05);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08 * vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(lp);
  lp.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.05);
}

// ─────────────────────────────────────���──────
// DICE ROLL variants
// ────────────────────────────────────────────

function playDiceDefault(vol: number, diceCount: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const countFactor = Math.min(diceCount, 8) / 4;
  const duration = 0.25 + countFactor * 0.15;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(3000, t);
  filter.frequency.exponentialRampToValueAtTime(800, t + duration);
  filter.Q.value = 1.5;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.14 * vol, t);
  noiseGain.gain.setValueAtTime(0.11 * vol, t + 0.05);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(t);
  noise.stop(t + duration);
  const thudOsc = ctx.createOscillator();
  thudOsc.type = "sine";
  thudOsc.frequency.setValueAtTime(180, t + duration * 0.5);
  thudOsc.frequency.exponentialRampToValueAtTime(70, t + duration * 0.8);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.08 * vol, t + duration * 0.5);
  thudGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.8);
  thudOsc.connect(thudGain);
  thudGain.connect(ctx.destination);
  thudOsc.start(t + duration * 0.5);
  thudOsc.stop(t + duration * 0.8);
  const bounceCount = Math.min(2 + diceCount, 6);
  for (let i = 0; i < bounceCount; i++) {
    const clickT = t + 0.01 + i * 0.045 + Math.random() * 0.02;
    const clickOsc = ctx.createOscillator();
    clickOsc.type = "square";
    clickOsc.frequency.setValueAtTime(1400 + Math.random() * 600, clickT);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(Math.max(0.01, (0.04 - i * 0.006)) * vol, clickT);
    clickGain.gain.exponentialRampToValueAtTime(0.001, clickT + 0.02);
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(clickT);
    clickOsc.stop(clickT + 0.02);
  }
}

function playDiceWooden(vol: number, diceCount: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const count = Math.min(diceCount, 6);
  const dur = 0.2 + count * 0.04;
  for (let i = 0; i < count + 2; i++) {
    const dt = t + i * 0.035 + Math.random() * 0.015;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(300 + Math.random() * 200, dt);
    osc.frequency.exponentialRampToValueAtTime(80, dt + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09 * vol, dt);
    g.gain.exponentialRampToValueAtTime(0.001, dt + 0.05);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(dt);
    osc.stop(dt + 0.05);
  }
  const thud = ctx.createOscillator();
  thud.type = "sine";
  thud.frequency.setValueAtTime(120, t + dur);
  thud.frequency.exponentialRampToValueAtTime(50, t + dur + 0.08);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.1 * vol, t + dur);
  tg.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.1);
  thud.connect(tg);
  tg.connect(ctx.destination);
  thud.start(t + dur);
  thud.stop(t + dur + 0.1);
}

function playDiceMetal(vol: number, diceCount: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const count = Math.min(diceCount, 6);
  for (let i = 0; i < count + 3; i++) {
    const dt = t + i * 0.03 + Math.random() * 0.02;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(2000 + Math.random() * 2000, dt);
    osc.frequency.exponentialRampToValueAtTime(500, dt + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04 * vol, dt);
    g.gain.exponentialRampToValueAtTime(0.001, dt + 0.04);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(dt);
    osc.stop(dt + 0.04);
  }
  const ring = ctx.createOscillator();
  ring.type = "sine";
  ring.frequency.value = 3400;
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.03 * vol, t + 0.15);
  rg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  ring.connect(rg);
  rg.connect(ctx.destination);
  ring.start(t + 0.15);
  ring.stop(t + 0.4);
}

function playDiceThunder(vol: number, diceCount: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const dur = 0.3 + Math.min(diceCount, 6) * 0.05;
  const bufSize = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.exponentialRampToValueAtTime(100, t + dur);
  lp.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.15 * vol, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(lp);
  lp.connect(g);
  g.connect(ctx.destination);
  src.start(t);
  src.stop(t + dur);
}

function playDiceArcane(vol: number, diceCount: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const dur = 0.25 + Math.min(diceCount, 6) * 0.03;
  const freqs = [330, 440, 554, 660];
  freqs.forEach((f, i) => {
    const delay = i * 0.04;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t + delay);
    osc.frequency.exponentialRampToValueAtTime(f * 2, t + delay + dur * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04 * vol, t + delay);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t + delay);
    osc.stop(t + delay + dur);
  });
  const bufSize = Math.floor(ctx.sampleRate * dur * 0.5);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.03 * vol, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.5);
  src.connect(hp);
  hp.connect(ng);
  ng.connect(ctx.destination);
  src.start(t);
  src.stop(t + dur * 0.5);
}

// ────────────────────────────────────────────
// SUCCESS CHIME variants
// ────────────────────────────────────────────

function playChimeDefault(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06 * vol, t + i * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + i * 0.08);
    osc.stop(t + i * 0.08 + 0.18);
  });
}

function playChimeFanfare(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const notes = [392, 494, 587, 784];
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04 * vol, t + i * 0.07);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.2);
    osc.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    osc.start(t + i * 0.07);
    osc.stop(t + i * 0.07 + 0.2);
  });
}

function playChimeLevelUp(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const notes = [262, 330, 392, 523, 660, 784, 1047];
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.035 * vol, t + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.12);
    osc.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    osc.start(t + i * 0.05);
    osc.stop(t + i * 0.05 + 0.12);
  });
}

function playChimeSparkle(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  for (let i = 0; i < 5; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 2000 + i * 400 + Math.random() * 200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04 * vol, t + i * 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.15);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t + i * 0.04);
    osc.stop(t + i * 0.04 + 0.15);
  }
}

function playChimeGong(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(130, t);
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.12 * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.8);
  const harm = ctx.createOscillator();
  harm.type = "sine";
  harm.frequency.setValueAtTime(260, t);
  harm.frequency.exponentialRampToValueAtTime(220, t + 0.6);
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.05 * vol, t);
  hg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  harm.connect(hg);
  hg.connect(ctx.destination);
  harm.start(t);
  harm.stop(t + 0.6);
  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = 4200;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.02 * vol, t);
  sg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  shimmer.connect(sg);
  sg.connect(ctx.destination);
  shimmer.start(t);
  shimmer.stop(t + 0.3);
}

// ────────────────────────────────────────────
// CAT PACK variants
// ────────────────────────────────────────────

function playNavCatChirp(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(900, t);
  osc.frequency.exponentialRampToValueAtTime(1600, t + 0.03);
  osc.frequency.exponentialRampToValueAtTime(1200, t + 0.06);
  osc.frequency.exponentialRampToValueAtTime(1800, t + 0.08);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.07 * vol, t);
  g.gain.setValueAtTime(0.05 * vol, t + 0.04);
  g.gain.setValueAtTime(0.08 * vol, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.1);
}

function playTabPurr(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const dur = 0.12;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(28, t);
  osc.frequency.linearRampToValueAtTime(32, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 200;
  lp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.12 * vol, t + 0.02);
  g.gain.setValueAtTime(0.1 * vol, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(lp);
  lp.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
  const hum = ctx.createOscillator();
  hum.type = "sine";
  hum.frequency.value = 55;
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.06 * vol, t);
  hg.gain.exponentialRampToValueAtTime(0.001, t + dur);
  hum.connect(hg);
  hg.connect(ctx.destination);
  hum.start(t);
  hum.stop(t + dur);
}

function playDicePawBat(vol: number, diceCount: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const count = Math.min(diceCount, 6) + 2;
  for (let i = 0; i < count; i++) {
    const dt = t + i * 0.04 + Math.random() * 0.02;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600 + Math.random() * 400, dt);
    osc.frequency.exponentialRampToValueAtTime(200, dt + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.01, (0.07 - i * 0.005)) * vol, dt);
    g.gain.exponentialRampToValueAtTime(0.001, dt + 0.04);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(dt);
    osc.stop(dt + 0.04);
  }
  const roll = ctx.createOscillator();
  roll.type = "triangle";
  roll.frequency.setValueAtTime(300, t + count * 0.04);
  roll.frequency.exponentialRampToValueAtTime(80, t + count * 0.04 + 0.08);
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.06 * vol, t + count * 0.04);
  rg.gain.exponentialRampToValueAtTime(0.001, t + count * 0.04 + 0.1);
  roll.connect(rg);
  rg.connect(ctx.destination);
  roll.start(t + count * 0.04);
  roll.stop(t + count * 0.04 + 0.1);
}

function playChimeHappyMeow(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const freqs = [600, 900, 1100, 1400, 1100];
  const timings = [0, 0.06, 0.1, 0.15, 0.22];
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t + timings[i]);
    osc.frequency.exponentialRampToValueAtTime(f * 0.8, t + timings[i] + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06 * vol, t + timings[i]);
    g.gain.exponentialRampToValueAtTime(0.001, t + timings[i] + 0.1);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t + timings[i]);
    osc.stop(t + timings[i] + 0.1);
  });
}

// ────────────────────────────────────────────
// CELESTIAL PACK variants
// ────────────────────────────────────────────

function playNavStarPing(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const freqs = [3520, 4186];
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04 * vol, t + i * 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.25);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t + i * 0.06);
    osc.stop(t + i * 0.06 + 0.25);
  });
  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = 6000;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.015 * vol, t);
  sg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  shimmer.connect(sg);
  sg.connect(ctx.destination);
  shimmer.start(t);
  shimmer.stop(t + 0.15);
}

function playTabCosmicWhoosh(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const dur = 0.15;
  const bufSize = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(200, t);
  bp.frequency.exponentialRampToValueAtTime(3000, t + dur * 0.4);
  bp.frequency.exponentialRampToValueAtTime(800, t + dur);
  bp.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.08 * vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(ctx.destination);
  src.start(t);
  src.stop(t + dur);
  const tone = ctx.createOscillator();
  tone.type = "sine";
  tone.frequency.setValueAtTime(220, t);
  tone.frequency.exponentialRampToValueAtTime(440, t + dur);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.03 * vol, t);
  tg.gain.exponentialRampToValueAtTime(0.001, t + dur);
  tone.connect(tg);
  tg.connect(ctx.destination);
  tone.start(t);
  tone.stop(t + dur);
}

function playDiceMeteorShower(vol: number, diceCount: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const count = Math.min(diceCount, 6) + 3;
  const dur = 0.3 + count * 0.03;
  for (let i = 0; i < count; i++) {
    const dt = t + i * 0.035 + Math.random() * 0.015;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const startF = 3000 + Math.random() * 2000;
    osc.frequency.setValueAtTime(startF, dt);
    osc.frequency.exponentialRampToValueAtTime(startF * 0.3, dt + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04 * vol, dt);
    g.gain.exponentialRampToValueAtTime(0.001, dt + 0.1);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(dt);
    osc.stop(dt + 0.1);
  }
  const rumble = ctx.createOscillator();
  rumble.type = "sine";
  rumble.frequency.setValueAtTime(80, t + 0.1);
  rumble.frequency.exponentialRampToValueAtTime(40, t + dur);
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.06 * vol, t + 0.1);
  rg.gain.exponentialRampToValueAtTime(0.001, t + dur);
  rumble.connect(rg);
  rg.connect(ctx.destination);
  rumble.start(t + 0.1);
  rumble.stop(t + dur);
}

function playChimeCelestialFanfare(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const notes = [440, 554, 659, 880, 1109];
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05 * vol, t + i * 0.07);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.3);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t + i * 0.07);
    osc.stop(t + i * 0.07 + 0.3);
  });
  for (let i = 0; i < 4; i++) {
    const sparkle = ctx.createOscillator();
    sparkle.type = "sine";
    sparkle.frequency.value = 4000 + i * 500 + Math.random() * 300;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.02 * vol, t + 0.2 + i * 0.05);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.2 + i * 0.05 + 0.2);
    sparkle.connect(sg);
    sg.connect(ctx.destination);
    sparkle.start(t + 0.2 + i * 0.05);
    sparkle.stop(t + 0.2 + i * 0.05 + 0.2);
  }
}

// ────────────────────────────────────────────
// STEAMPUNK PACK variants
// ────────────────────────────────────────────

function playNavSteamHiss(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const dur = 0.08;
  const bufSize = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(6000, t);
  hp.frequency.exponentialRampToValueAtTime(3000, t + dur);
  hp.Q.value = 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.1 * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(hp);
  hp.connect(g);
  g.connect(ctx.destination);
  src.start(t);
  src.stop(t + dur);
  const valve = ctx.createOscillator();
  valve.type = "sine";
  valve.frequency.setValueAtTime(800, t);
  valve.frequency.exponentialRampToValueAtTime(200, t + 0.04);
  const vg = ctx.createGain();
  vg.gain.setValueAtTime(0.05 * vol, t);
  vg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  valve.connect(vg);
  vg.connect(ctx.destination);
  valve.start(t);
  valve.stop(t + 0.04);
}

function playTabGearClick(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const click1 = ctx.createOscillator();
  click1.type = "square";
  click1.frequency.setValueAtTime(300, t);
  click1.frequency.exponentialRampToValueAtTime(100, t + 0.015);
  const cg1 = ctx.createGain();
  cg1.gain.setValueAtTime(0.08 * vol, t);
  cg1.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
  click1.connect(cg1);
  cg1.connect(ctx.destination);
  click1.start(t);
  click1.stop(t + 0.02);
  const click2 = ctx.createOscillator();
  click2.type = "sawtooth";
  click2.frequency.setValueAtTime(2000, t + 0.015);
  click2.frequency.exponentialRampToValueAtTime(600, t + 0.03);
  const cg2 = ctx.createGain();
  cg2.gain.setValueAtTime(0.05 * vol, t + 0.015);
  cg2.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  click2.connect(cg2);
  cg2.connect(ctx.destination);
  click2.start(t + 0.015);
  click2.stop(t + 0.04);
  const thud = ctx.createOscillator();
  thud.type = "sine";
  thud.frequency.setValueAtTime(150, t + 0.02);
  thud.frequency.exponentialRampToValueAtTime(60, t + 0.06);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.06 * vol, t + 0.02);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  thud.connect(tg);
  tg.connect(ctx.destination);
  thud.start(t + 0.02);
  thud.stop(t + 0.06);
}

function playDicePiston(vol: number, diceCount: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const count = Math.min(diceCount, 6) + 2;
  const dur = 0.25 + count * 0.04;
  for (let i = 0; i < count; i++) {
    const dt = t + i * 0.05;
    const bufSize = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < bufSize; j++) data[j] = (Math.random() * 2 - 1) * 0.3;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 800 + i * 200;
    bp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08 * vol, dt);
    g.gain.exponentialRampToValueAtTime(0.001, dt + 0.04);
    src.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    src.start(dt);
    src.stop(dt + 0.04);
    const pump = ctx.createOscillator();
    pump.type = "square";
    pump.frequency.setValueAtTime(120 + i * 20, dt);
    pump.frequency.exponentialRampToValueAtTime(60, dt + 0.03);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.05 * vol, dt);
    pg.gain.exponentialRampToValueAtTime(0.001, dt + 0.04);
    pump.connect(pg);
    pg.connect(ctx.destination);
    pump.start(dt);
    pump.stop(dt + 0.04);
  }
  const release = ctx.createOscillator();
  release.type = "sine";
  release.frequency.setValueAtTime(200, t + dur - 0.06);
  release.frequency.exponentialRampToValueAtTime(60, t + dur);
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.07 * vol, t + dur - 0.06);
  rg.gain.exponentialRampToValueAtTime(0.001, t + dur);
  release.connect(rg);
  rg.connect(ctx.destination);
  release.start(t + dur - 0.06);
  release.stop(t + dur);
}

function playChimeSteamWhistle(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.linearRampToValueAtTime(1200, t + 0.1);
  osc.frequency.setValueAtTime(1200, t + 0.3);
  osc.frequency.linearRampToValueAtTime(600, t + 0.5);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3000;
  lp.Q.value = 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.07 * vol, t + 0.05);
  g.gain.setValueAtTime(0.06 * vol, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(lp);
  lp.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.5);
  const hissDur = 0.3;
  const hissBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * hissDur), ctx.sampleRate);
  const hd = hissBuf.getChannelData(0);
  for (let i = 0; i < hd.length; i++) hd[i] = (Math.random() * 2 - 1) * 0.2;
  const hissSrc = ctx.createBufferSource();
  hissSrc.buffer = hissBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 4000;
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.04 * vol, t + 0.05);
  hg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  hissSrc.connect(hp);
  hp.connect(hg);
  hg.connect(ctx.destination);
  hissSrc.start(t + 0.05);
  hissSrc.stop(t + 0.35);
}

// ────────────────────────────────────────────
// GLITCH PACK variants
// ────────────────────────────────────────────

function playNavGlitchBlip(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    const f = [440, 1760, 220][i];
    osc.frequency.setValueAtTime(f, t + i * 0.015);
    osc.frequency.setValueAtTime(f * 3, t + i * 0.015 + 0.008);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06 * vol, t + i * 0.015);
    g.gain.setValueAtTime(0.001, t + i * 0.015 + 0.012);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t + i * 0.015);
    osc.stop(t + i * 0.015 + 0.015);
  }
}

function playTabBitCrush(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const dur = 0.06;
  const bufSize = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const crushFactor = 8;
  for (let i = 0; i < bufSize; i++) {
    const raw = Math.sin(i / ctx.sampleRate * 2 * Math.PI * 440) + (Math.random() * 2 - 1) * 0.5;
    data[i] = Math.round(raw * crushFactor) / crushFactor;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.08 * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(g);
  g.connect(ctx.destination);
  src.start(t);
  src.stop(t + dur);
}

function playDiceDataScramble(vol: number, diceCount: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const count = Math.min(diceCount, 6) + 3;
  const dur = 0.2 + count * 0.03;
  for (let i = 0; i < count; i++) {
    const dt = t + i * 0.025 + Math.random() * 0.01;
    const osc = ctx.createOscillator();
    osc.type = i % 2 === 0 ? "square" : "sawtooth";
    const fBase = [110, 440, 880, 1760, 220, 660, 1320, 2640];
    osc.frequency.setValueAtTime(fBase[i % fBase.length], dt);
    osc.frequency.setValueAtTime(fBase[(i + 3) % fBase.length], dt + 0.01);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04 * vol, dt);
    g.gain.setValueAtTime(0.001, dt + 0.02);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(dt);
    osc.stop(dt + 0.025);
  }
  const buzzBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
  const bd = buzzBuf.getChannelData(0);
  for (let i = 0; i < bd.length; i++) {
    bd[i] = (Math.random() > 0.5 ? 1 : -1) * 0.3;
  }
  const buzzSrc = ctx.createBufferSource();
  buzzSrc.buffer = buzzBuf;
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.05 * vol, t + dur - 0.06);
  bg.gain.exponentialRampToValueAtTime(0.001, t + dur);
  buzzSrc.connect(bg);
  bg.connect(ctx.destination);
  buzzSrc.start(t + dur - 0.06);
  buzzSrc.stop(t + dur);
}

function playChimeErrorResolved(vol: number) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const glitchFreqs = [200, 1600, 100, 3200, 400];
  glitchFreqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05 * vol, t + i * 0.025);
    g.gain.setValueAtTime(0.001, t + i * 0.025 + 0.02);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t + i * 0.025);
    osc.stop(t + i * 0.025 + 0.025);
  });
  const resolveNotes = [523, 659, 784];
  resolveNotes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06 * vol, t + 0.15 + i * 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15 + i * 0.06 + 0.15);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t + 0.15 + i * 0.06);
    osc.stop(t + 0.15 + i * 0.06 + 0.15);
  });
}

// ════════════════════════════════════════════════════════
// Registry of all variants
// ════════════════════════════════════════════════════════

export const ALL_SOUND_VARIANTS: SoundVariant[] = [
  { id: "nav-default", name: "Soft Pip", slot: "navClick", description: "Gentle high-pitched pip", play: playNavDefault },
  { id: "nav-none", name: "None", slot: "navClick", description: "No sound", play: playNone },
  { id: "nav-retro-blip", name: "Retro Blip", slot: "navClick", description: "8-bit square wave blip", play: playNavRetroBlip },
  { id: "nav-typewriter", name: "Typewriter", slot: "navClick", description: "Clicky typewriter key", play: playNavTypewriter },
  { id: "nav-crystal", name: "Crystal Chime", slot: "navClick", description: "Delicate crystal ring", play: playNavCrystal },
  { id: "nav-bubble", name: "Bubble Pop", slot: "navClick", description: "Soft bubble pop", play: playNavBubble },

  { id: "tab-default", name: "Paper Slide", slot: "tabClick", description: "Soft paper swoosh", play: playTabDefault },
  { id: "tab-none", name: "None", slot: "tabClick", description: "No sound", play: playNone },
  { id: "tab-swoosh", name: "Quick Swoosh", slot: "tabClick", description: "Fast airy swoosh", play: playTabSwoosh },
  { id: "tab-mechanical", name: "Mechanical Click", slot: "tabClick", description: "Industrial toggle switch", play: playTabMechanical },
  { id: "tab-harp", name: "Harp Pluck", slot: "tabClick", description: "Gentle harp pluck", play: playTabHarp },
  { id: "tab-static", name: "Radio Static", slot: "tabClick", description: "Old radio tuning burst", play: playTabStatic },

  { id: "dice-default", name: "Standard Clatter", slot: "diceRoll", description: "Classic dice clatter & thud", play: (v, p) => playDiceDefault(v, p ?? 1) },
  { id: "dice-none", name: "None", slot: "diceRoll", description: "No sound", play: playNone },
  { id: "dice-wooden", name: "Wooden Table", slot: "diceRoll", description: "Dice on a wooden tavern table", play: (v, p) => playDiceWooden(v, p ?? 1) },
  { id: "dice-metal", name: "Metal Dice", slot: "diceRoll", description: "Metal dice on stone", play: (v, p) => playDiceMetal(v, p ?? 1) },
  { id: "dice-thunder", name: "Thunder Rumble", slot: "diceRoll", description: "Rolling thunder sound", play: (v, p) => playDiceThunder(v, p ?? 1) },
  { id: "dice-arcane", name: "Arcane Cast", slot: "diceRoll", description: "Magical energy whoosh", play: (v, p) => playDiceArcane(v, p ?? 1) },

  { id: "chime-default", name: "Triad Chime", slot: "successChime", description: "C-E-G ascending chime", play: playChimeDefault },
  { id: "chime-none", name: "None", slot: "successChime", description: "No sound", play: playNone },
  { id: "chime-fanfare", name: "Fanfare", slot: "successChime", description: "Triumphant brass fanfare", play: playChimeFanfare },
  { id: "chime-levelup", name: "Level Up", slot: "successChime", description: "RPG level-up arpeggio", play: playChimeLevelUp },
  { id: "chime-sparkle", name: "Sparkle", slot: "successChime", description: "Twinkling sparkle cascade", play: playChimeSparkle },
  { id: "chime-gong", name: "Deep Gong", slot: "successChime", description: "Resonant temple gong", play: playChimeGong },

  { id: "nav-cat-chirp", name: "Cat Chirp", slot: "navClick", description: "Playful feline chirp", play: playNavCatChirp },
  { id: "tab-purr", name: "Purr", slot: "tabClick", description: "Warm rumbling purr", play: playTabPurr },
  { id: "dice-paw-bat", name: "Paw Bat", slot: "diceRoll", description: "Cat batting dice across the table", play: (v, p) => playDicePawBat(v, p ?? 1) },
  { id: "chime-happy-meow", name: "Happy Meow", slot: "successChime", description: "Triumphant ascending meow", play: playChimeHappyMeow },

  { id: "nav-star-ping", name: "Star Ping", slot: "navClick", description: "Ethereal high bell from the void", play: playNavStarPing },
  { id: "tab-cosmic-whoosh", name: "Cosmic Whoosh", slot: "tabClick", description: "Deep space sweep with tonal rise", play: playTabCosmicWhoosh },
  { id: "dice-meteor-shower", name: "Meteor Shower", slot: "diceRoll", description: "Cascading falling-star tones", play: (v, p) => playDiceMeteorShower(v, p ?? 1) },
  { id: "chime-celestial-fanfare", name: "Celestial Fanfare", slot: "successChime", description: "Starlit ascending harmony with sparkle", play: playChimeCelestialFanfare },

  { id: "nav-steam-hiss", name: "Steam Hiss", slot: "navClick", description: "Pressure valve release", play: playNavSteamHiss },
  { id: "tab-gear-click", name: "Gear Click", slot: "tabClick", description: "Mechanical gear engagement", play: playTabGearClick },
  { id: "dice-piston", name: "Piston", slot: "diceRoll", description: "Rhythmic piston pump sequence", play: (v, p) => playDicePiston(v, p ?? 1) },
  { id: "chime-steam-whistle", name: "Steam Whistle", slot: "successChime", description: "Rising train whistle with hiss", play: playChimeSteamWhistle },

  { id: "nav-glitch-blip", name: "Glitch Blip", slot: "navClick", description: "Corrupted digital triple-blip", play: playNavGlitchBlip },
  { id: "tab-bit-crush", name: "Bit Crush", slot: "tabClick", description: "Crunchy lo-fi static burst", play: playTabBitCrush },
  { id: "dice-data-scramble", name: "Data Scramble", slot: "diceRoll", description: "Rapid frequency-hopping chaos", play: (v, p) => playDiceDataScramble(v, p ?? 1) },
  { id: "chime-error-resolved", name: "Error Resolved", slot: "successChime", description: "Glitch noise resolving into clean chord", play: playChimeErrorResolved },
];

export function getVariantsForSlot(slot: SoundSlot): SoundVariant[] {
  return ALL_SOUND_VARIANTS.filter(v => v.slot === slot);
}

export function getVariantById(id: string): SoundVariant | undefined {
  return ALL_SOUND_VARIANTS.find(v => v.id === id);
}

function resolveVariant(slot: SoundSlot): SoundVariant {
  const cfg = getSoundConfig();
  const selectedId = cfg[slot];
  const slotPrefix = slot === "navClick" ? "nav-" : slot === "tabClick" ? "tab-" : slot === "diceRoll" ? "dice-" : "chime-";
  const variant = ALL_SOUND_VARIANTS.find(v => v.id === selectedId || v.id === `${slotPrefix}${selectedId}`);
  if (variant) return variant;
  // Check custom sounds
  const custom = getCustomSounds().find(c => c.id === selectedId && c.slot === slot);
  if (custom) return buildCustomVariant(custom);
  return ALL_SOUND_VARIANTS.find(v => v.id === `${slotPrefix}default`)!;
}

// ════════════════════════════════════════════════════════
// Sound Packs for the store
// ═══════════════════════════════════════════════════════

export const STORE_SOUND_PACKS: SoundPack[] = [
  {
    id: "pack-retro-8bit",
    name: "Retro 8-Bit",
    description: "Classic arcade sounds from a bygone era",
    price: 50,
    soundIds: ["nav-retro-blip", "tab-mechanical", "dice-wooden", "chime-fanfare"],
  },
  {
    id: "pack-arcane-magic",
    name: "Arcane Magic",
    description: "Mystical sounds for the magically inclined",
    price: 75,
    soundIds: ["nav-crystal", "tab-harp", "dice-arcane", "chime-sparkle"],
  },
  {
    id: "pack-industrial",
    name: "Industrial",
    description: "Gritty mechanical sounds of The Great City",
    price: 60,
    soundIds: ["nav-typewriter", "tab-static", "dice-metal", "chime-gong"],
  },
  {
    id: "pack-nature-wild",
    name: "Wild Nature",
    description: "Organic sounds from beyond the city walls",
    price: 40,
    soundIds: ["nav-bubble", "tab-swoosh", "dice-thunder", "chime-levelup"],
  },
  {
    id: "pack-cat",
    name: "Cat Pack",
    description: "Purrfect sounds for the feline-inclined operative",
    price: 55,
    soundIds: ["nav-cat-chirp", "tab-purr", "dice-paw-bat", "chime-happy-meow"],
  },
  {
    id: "pack-celestial",
    name: "Celestial",
    description: "Ethereal sounds from the guiding stars above",
    price: 80,
    soundIds: ["nav-star-ping", "tab-cosmic-whoosh", "dice-meteor-shower", "chime-celestial-fanfare"],
  },
  {
    id: "pack-steampunk",
    name: "Steampunk",
    description: "Brass, gears, and steam from the city's underbelly",
    price: 65,
    soundIds: ["nav-steam-hiss", "tab-gear-click", "dice-piston", "chime-steam-whistle"],
  },
  {
    id: "pack-glitch",
    name: "Glitch",
    description: "Corrupted data and digital artifacts from the I-Net",
    price: 70,
    soundIds: ["nav-glitch-blip", "tab-bit-crush", "dice-data-scramble", "chime-error-resolved"],
  },
];

export const STORE_INDIVIDUAL_SOUNDS: { id: string; name: string; price: number; slot: SoundSlot }[] = [
  { id: "nav-retro-blip", name: "Retro Blip", price: 15, slot: "navClick" },
  { id: "nav-typewriter", name: "Typewriter", price: 15, slot: "navClick" },
  { id: "nav-crystal", name: "Crystal Chime", price: 20, slot: "navClick" },
  { id: "nav-bubble", name: "Bubble Pop", price: 10, slot: "navClick" },
  { id: "nav-cat-chirp", name: "Cat Chirp", price: 15, slot: "navClick" },
  { id: "nav-star-ping", name: "Star Ping", price: 25, slot: "navClick" },
  { id: "nav-steam-hiss", name: "Steam Hiss", price: 20, slot: "navClick" },
  { id: "nav-glitch-blip", name: "Glitch Blip", price: 20, slot: "navClick" },
  { id: "tab-swoosh", name: "Quick Swoosh", price: 10, slot: "tabClick" },
  { id: "tab-mechanical", name: "Mechanical Click", price: 15, slot: "tabClick" },
  { id: "tab-harp", name: "Harp Pluck", price: 20, slot: "tabClick" },
  { id: "tab-static", name: "Radio Static", price: 10, slot: "tabClick" },
  { id: "tab-purr", name: "Purr", price: 15, slot: "tabClick" },
  { id: "tab-cosmic-whoosh", name: "Cosmic Whoosh", price: 25, slot: "tabClick" },
  { id: "tab-gear-click", name: "Gear Click", price: 20, slot: "tabClick" },
  { id: "tab-bit-crush", name: "Bit Crush", price: 20, slot: "tabClick" },
  { id: "dice-wooden", name: "Wooden Table", price: 15, slot: "diceRoll" },
  { id: "dice-metal", name: "Metal Dice", price: 20, slot: "diceRoll" },
  { id: "dice-thunder", name: "Thunder Rumble", price: 20, slot: "diceRoll" },
  { id: "dice-arcane", name: "Arcane Cast", price: 25, slot: "diceRoll" },
  { id: "dice-paw-bat", name: "Paw Bat", price: 15, slot: "diceRoll" },
  { id: "dice-meteor-shower", name: "Meteor Shower", price: 25, slot: "diceRoll" },
  { id: "dice-piston", name: "Piston", price: 20, slot: "diceRoll" },
  { id: "dice-data-scramble", name: "Data Scramble", price: 20, slot: "diceRoll" },
  { id: "chime-fanfare", name: "Fanfare", price: 15, slot: "successChime" },
  { id: "chime-levelup", name: "Level Up", price: 15, slot: "successChime" },
  { id: "chime-sparkle", name: "Sparkle", price: 20, slot: "successChime" },
  { id: "chime-gong", name: "Deep Gong", price: 25, slot: "successChime" },
  { id: "chime-happy-meow", name: "Happy Meow", price: 15, slot: "successChime" },
  { id: "chime-celestial-fanfare", name: "Celestial Fanfare", price: 25, slot: "successChime" },
  { id: "chime-steam-whistle", name: "Steam Whistle", price: 20, slot: "successChime" },
  { id: "chime-error-resolved", name: "Error Resolved", price: 20, slot: "successChime" },
];

// ════════════════════════════════════════════════════════
// Public API — these dispatch to the selected variant
// ═══════════════════════════════════════════════════════

export function playNavClick() {
  if (muted || masterVolume === 0) return;
  try { resolveVariant("navClick").play(masterVolume); } catch { /* fail silently */ }
}

export function playTabClick() {
  if (muted || masterVolume === 0) return;
  try { resolveVariant("tabClick").play(masterVolume); } catch { /* fail silently */ }
}

export function playDiceRoll(diceCount: number = 1) {
  if (muted || masterVolume === 0) return;
  try { resolveVariant("diceRoll").play(masterVolume, diceCount); } catch { /* fail silently */ }
}

export function playSuccessChime() {
  if (muted || masterVolume === 0) return;
  try { resolveVariant("successChime").play(masterVolume); } catch { /* fail silently */ }
}

export function previewSound(variantId: string, param?: number) {
  const variant = getVariantById(variantId);
  if (!variant) return;
  try { variant.play(Math.max(masterVolume, 0.15), param); } catch { /* fail silently */ }
}