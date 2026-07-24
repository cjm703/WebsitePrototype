import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Heart } from "lucide-react";
import greenSwordImg from "@/assets/figma/Green_Sword.png";
import { DISPLAY_CONTENTS } from "./shared-styles";

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2 BATTLE — Animated box attacks with concert stage decoration
// ══════════════════════════════════════════════════════════════════════════════

interface Phase2Colors {
  bg: string;
  accent: string;
  text: string;
}

// Expose debug handle for parent to control
export interface Phase2DebugHandle {
  runAttack: (name: string) => void;
  setDemoMode: (v: boolean) => void;
  setLoopingAttack: (name: string | null) => void;
  resetToIdle: () => void;
  getAttackNames: () => string[];
}

export interface Phase2DebugState {
  isAttacking: boolean;
  currentAttack: string;
  demoMode: boolean;
  loopingAttack: string | null;
}

interface Phase2Props {
  colors: Phase2Colors;
  bossName: string;
  bossMaxHp: number;
  playerMaxHp: number;
  startingScore: number;
  onBack: () => void;
  hideDebugControls?: boolean;
  onDebugStateChange?: (state: Phase2DebugState) => void;
  // ── Embedded "battle box only" mode (used by parent boss-fight.tsx) ──
  battleBoxOnly?: boolean;
  onPlayerDamage?: (dmg: number) => void;
  onAttackComplete?: () => void;
  autoStartAttack?: string;
  resolveShielded?: boolean;
}

// ── Dimension constants ─────────────────────────────────────────────────────
const BASE_W = 300;
const BASE_H = 300;
const MIN_W = 120;
const MAX_W = 460;
const MIN_H = 120;
const MAX_H = 400;
const BORDER_W = 3;
const PLAYER_R = 8;
const PLAYER_SPEED = 3.5;
// Collision radius for the heart — smaller than visual radius since the heart
// shape doesn't fill its bounding box (lobes are narrow, tip is a point)
const PLAYER_HIT_R = 0;

// Laser gameplay constants (STAGE attack — full-length sweeping beams)
const LASER_WIDTH = 3;         // visual width of laser beam
const LASER_DAMAGE = 15;       // damage per hit (3x for STAGE)

// Spotlight beam gameplay constants (STAGE attack — static wide cone beams, 25% box height)
const BEAM_CONE_HALF_W = 28;   // half-width of the cone at the bottom (tip) — visual triangle width
const BEAM_DAMAGE = 12;        // damage per hit (3x for STAGE)

// Player collision radius for STAGE hazards — heart lobes extend ~40% of PLAYER_R from center
const STAGE_PLAYER_HIT_R = PLAYER_R * 0.4;

// Shared i-frame window for both lasers and beams
const STAGE_IFRAMES_MS = 1000;

// Wall crush constants
const WALL_CRUSH_DAMAGE = 4;
const WALL_CRUSH_IFRAMES_MS = 800;

// Attack-start throw constants
const THROW_SPEED = 12;        // initial throw velocity (px per frame-tick)
const THROW_FRICTION = 0.88;   // per-tick multiplier (decays to near-zero quickly)
const THROW_MIN = 0.3;         // velocity threshold to stop throw
const THROW_SETTLE_MS = 1000;  // delay after throw before hazards activate

// Screen shake constants
const SHAKE_DECAY = 0.88;      // per-frame multiplier
const SHAKE_MIN = 0.3;         // threshold to stop
const SHAKE_LASER_INTENSITY = 6;
const SHAKE_CRUSH_INTENSITY = 10;

// Stage attack: 2x the widen delta
const STAGE_W = 620;

const BOX_TRANSITION_MS = 600;

// Light/laser colours — stage structure is black+silver, only lights are coloured
const L = { green: "#23ac38", teal: "#86cecb", yellow: "#fff100", dark: "#137a7f" } as const;
const LIGHT_COLS = [L.green, L.teal, L.yellow, L.dark] as const;

// ── Attack types & patterns ─────────────────────────────────────────────
interface BoxTarget {
  w: number;
  h: number;
  duration: number;
  isStage?: boolean;
  isMgBeam?: boolean;
  isExpand?: boolean;
  isAnnoyance?: boolean;
  isFrustration?: boolean;
}

// ── FRUSTRATION attack constants ────────────────────────────────────────────
const FRUST_DURATION = 60000;           // 60 seconds total
const FRUST_DAMAGE_MULT = 0.5;          // all damage halved
const FRUST_THROW_INTERVAL = 4000;      // throw player every 4s
const FRUST_BEAM_INTERVAL = 3000;       // clockwork beam every 3s
const FRUST_SWORD_INTERVAL = 6000;      // Ethereal Lance every 6s
const FRUST_SAFE_ZONE_INTERVAL = 10000; // safe zone check every 10s
const FRUST_SAFE_ZONE_WARN_MS = 3000;   // 3s warning before check
const FRUST_SAFE_ZONE_SIZE = 60;        // safe zone area dimensions
const FRUST_SAFE_ZONE_DAMAGE = 40;      // heavy damage if not in safe zone (before 50% mult)
const FRUST_BOLT_START = 30000;         // prismatic bolts start at 30s
const FRUST_BOLT_INTERVAL = 1000;       // 1 bolt per second
const FRUST_MGB_START = 50000;          // MGB warning at 50s
const FRUST_MGB_WARN_MS = 3000;         // 3s warning before MGB fires
const FRUST_BOX_CYCLE = 5000;           // cycle box size every 5s
// Box size cycle: SLAM(wide), EXPAND(big), SHRINK(tiny), NARROW(narrow), NORMAL
const FRUST_BOX_SIZES: { w: number; h: number }[] = [
  { w: MAX_W, h: BASE_H },   // SLAM (wide)
  { w: MAX_W, h: MAX_H },    // EXPAND (big)
  { w: MIN_W, h: MIN_H },    // SHRINK (tiny)
  { w: MIN_W, h: BASE_H },   // NARROW
  { w: BASE_W, h: BASE_H },  // NORMAL
];

// Safe zone state interface
interface FrustSafeZone {
  x: number;
  y: number;
  label: string;
  warning: boolean;   // showing warning countdown
  active: boolean;    // check has occurred
  checkTime: number;  // when the check fires
}

// ── EXPAND attack constants ─────────────────────────────────────────────────
const EXPAND_WAVE1_DUR = 15000;  // Prismatic Bolts — 15s
const EXPAND_WAVE2_DUR = 15000;  // Ethereal Lance — 15s
const EXPAND_WAVE3_DUR = 20000;  // Sun Dance — 20s
const EXPAND_TOTAL_DUR = EXPAND_WAVE1_DUR + EXPAND_WAVE2_DUR + EXPAND_WAVE3_DUR; // 50s
const EXPAND_THROW_INTERVAL = 5000; // throw player every 5s
const EXPAND_BOLT_DAMAGE = 8;  // 2x for EMPRESS
const EXPAND_BOLT_IFRAMES = 600;
const EXPAND_BOLT_HIT_R = 10;  // collision radius for bolts
const EXPAND_BOLT_SPEED = 1.8; // speed multiplier along bezier
const EXPAND_BOLT_SPAWN_INTERVAL = 400; // spawn a bolt every 400ms
const EXPAND_BOLT_TRACK_CUTOFF = 60; // stop tracking within 60px
const EXPAND_SWORD_DAMAGE = 14; // 2x for EMPRESS
const EXPAND_SWORD_IFRAMES = 800;
const EXPAND_SWORD_HIT_R = 12;
const EXPAND_SWORD_SPEED = 24;     // 4x original speed when fired
const EXPAND_SWORD_FADEIN_MS = 1000;  // 50% faster (was 1500)
const EXPAND_SWORD_AIM_MS = 667;      // 50% faster (was 1000)
const EXPAND_SWORD_COUNT = 24;   // 12 blue + 12 green
const EXPAND_SWORD_VOLLEY_INTERVAL = 3333; // new volley every ~3.3s (50% faster)
const EXPAND_SUN_DAMAGE = 9;  // 25% reduced for EMPRESS
const EXPAND_SUN_IFRAMES = 500;
const EXPAND_SUN_MARGIN = 15;    // distance from corner
const EXPAND_SUN_RADIUS = 12;    // orb visual radius
const EXPAND_SUN_RAY_LEN = 480;  // ray length (3x)
const EXPAND_SUN_RAY_W = 12;     // ray width (3x)
const EXPAND_SUN_RAY_COUNT = 8;  // rays per orb
const EXPAND_SUN_WARN_MS = 1500; // warning glow before shining
const EXPAND_SUN_SHINE_MS = 3000; // duration of shining
const EXPAND_SUN_CYCLE = 5000;   // every 5s, 2 orbs activate

// ── ANNOYANCE attack constants ──────────────────────────────────────────────
const ANNOY_DURATION = 12000;          // 12 seconds
const ANNOY_THROW_INTERVAL = 3000;     // throw player every 3s
const ANNOY_SWORD_VOLLEY_INTERVAL = 2500; // sword volley every 2.5s
const ANNOY_SWORD_COUNT = 6;           // swords per volley
const ANNOY_SUN_CYCLE = 3500;          // sun orb cycle every 3.5s (faster than EMPRESS)
const ANNOY_BEAM_SPAWN_INTERVAL = 1000; // new clock beam(s) every 1s
const ANNOY_BEAM_TELEGRAPH_MS = 500;   // thin warning line
const ANNOY_BEAM_FIRE_MS = 400;        // thick beam with damage
const ANNOY_BEAM_FADE_MS = 300;        // fadeout
const ANNOY_BEAM_WIDTH = 16;           // beam collision width
const ANNOY_BEAM_VISUAL_W = 20;        // visual width
const ANNOY_BEAM_DAMAGE = 5;           // damage per hit
const ANNOY_BEAM_IFRAMES = 500;        // i-frames after hit
const ANNOY_BEAM_LEN = 600;            // beam length (extends well past the shrunk box)
const ANNOY_CLOCK_POSITIONS = 12;      // 12 positions like a clock face

// Annoyance deals 20% less damage across all hazards
const ANNOY_DAMAGE_MULT = 0.8;
const ANNOY_SWORD_DMG = Math.round(EXPAND_SWORD_DAMAGE * ANNOY_DAMAGE_MULT);
const ANNOY_SUN_DMG   = Math.round(EXPAND_SUN_DAMAGE * ANNOY_DAMAGE_MULT);
const ANNOY_BEAM_DMG  = Math.round(ANNOY_BEAM_DAMAGE * ANNOY_DAMAGE_MULT);

// ── ANNOYANCE inner cage (holds player in center) ──
const ANNOY_CAGE_W = 50;   // inner cage width
const ANNOY_CAGE_H = 50;   // inner cage height

interface ClockBeam {
  id: number;
  angle: number;       // radians — direction the beam points (from edge toward/through center)
  state: 'telegraph' | 'firing' | 'fading';
  stateStart: number;
  alive: boolean;
}

// Expand entity interfaces
interface PrismaticBolt {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  ctrlX: number;
  ctrlY: number;
  targetX: number;
  targetY: number;
  t: number;        // bezier progress 0-1
  color: 'blue' | 'green';
  tracking: boolean;
  vx: number;       // linear velocity after tracking lost
  vy: number;
  spawnTime: number;
  alive: boolean;
}

interface EtherealSword {
  id: number;
  x: number;
  y: number;
  color: 'blue' | 'green';
  angle: number;     // rotation in radians
  state: 'fadein' | 'aiming' | 'firing';
  stateStart: number;
  vx: number;
  vy: number;
  opacity: number;
  alive: boolean;
}

interface SunOrb {
  id: number;
  x: number;
  y: number;
  state: 'idle' | 'warning' | 'shining';
  stateStart: number;
}

// MGB (Miku Gnarpy Beam) constants
const MGB_CHARGE_MS = 2200;    // charge-up animation before beam fires (slow & dramatic)
const MGB_BEAM_DURATION = 7000; // beam lasts 7 seconds
const MGB_DAMAGE = 200;        // massive one-hit damage
const MGB_OVERFLOW = 40;       // beam horizontal overflow beyond box edges
const MGB_VERT_EXTEND = 1200;  // beam extends this many px above & below box (covers full viewport)

const ATTACK_PATTERNS: Record<string, BoxTarget[]> = {
  mgbeam: [
    { w: MIN_W, h: BASE_H, duration: MGB_CHARGE_MS + MGB_BEAM_DURATION, isMgBeam: true },
  ],
  stage: [
    { w: STAGE_W, h: BASE_H, duration: 20000, isStage: true },
    { w: BASE_W, h: BASE_H, duration: 800 },
  ],
  widen: [
    { w: MAX_W, h: BASE_H, duration: 1200 },
    { w: BASE_W, h: BASE_H, duration: 800 },
  ],
  narrow: [
    { w: MIN_W, h: BASE_H, duration: 1200 },
    { w: BASE_W, h: BASE_H, duration: 800 },
  ],
  empress: [
    { w: MAX_W, h: MAX_H, duration: EXPAND_TOTAL_DUR, isExpand: true },
    { w: BASE_W, h: BASE_H, duration: 800 },
  ],
  shrink: [
    { w: MIN_W, h: MIN_H, duration: 1200 },
    { w: BASE_W, h: BASE_H, duration: 800 },
  ],
  pulse: [
    { w: MIN_W, h: MIN_H, duration: 500 },
    { w: MAX_W, h: MAX_H, duration: 500 },
    { w: MIN_W, h: BASE_H, duration: 500 },
    { w: MAX_W, h: BASE_H, duration: 500 },
    { w: BASE_W, h: BASE_H, duration: 600 },
  ],
  slam: [
    { w: MIN_W, h: BASE_H, duration: 400 },
    { w: MAX_W, h: BASE_H, duration: 300 },
    { w: MIN_W, h: BASE_H, duration: 400 },
    { w: MAX_W, h: BASE_H, duration: 300 },
    { w: MIN_W, h: MIN_H, duration: 500 },
    { w: BASE_W, h: BASE_H, duration: 800 },
  ],
  annoyance: [
    { w: MIN_W, h: MIN_H, duration: ANNOY_DURATION, isAnnoyance: true },
  ],
  frustration: [
    { w: BASE_W, h: BASE_H, duration: FRUST_DURATION, isFrustration: true },
  ],
};
const ATTACK_NAMES = Object.keys(ATTACK_PATTERNS);

// ════════════════════════════════════════════════════════════════════════════
// Keyframe animations (injected into <head> once)
// ═════════════════════════════════════════════════════════════════════════════
const STAGE_KEYFRAMES = `
/* Laser sweep — smooth pendulum */
@keyframes p2-laser-a {
  0%,100% { transform: rotate(-30deg); }
  50%     { transform: rotate(30deg); }
}
@keyframes p2-laser-b {
  0%,100% { transform: rotate(25deg); }
  50%     { transform: rotate(-25deg); }
}
@keyframes p2-laser-c {
  0%,100% { transform: rotate(-18deg); }
  50%     { transform: rotate(40deg); }
}
@keyframes p2-laser-d {
  0%,100% { transform: rotate(35deg); }
  50%     { transform: rotate(-20deg); }
}

/* Spotlight glow pulse */
@keyframes p2-spot-pulse {
  0%,100% { opacity: 0.55; }
  50%     { opacity: 1; }
}

/* Resolve refill — gold sweep rising from bottom */
@keyframes p2-resolve-refill {
  0%   { opacity: 0.9; transform: scaleY(0); }
  30%  { opacity: 1; transform: scaleY(1.02); }
  50%  { opacity: 0.7; }
  70%  { opacity: 0.35; }
  100% { opacity: 0; transform: scaleY(1); }
}
/* Resolve refill — brief white flash across whole bar */
@keyframes p2-resolve-flash {
  0%   { opacity: 0; }
  12%  { opacity: 0.55; }
  35%  { opacity: 0.2; }
  100% { opacity: 0; }
}

/* LED chase */
@keyframes p2-led-chase {
  0%,100% { opacity: 1; }
  50%     { opacity: 0.2; }
}

/* Stage floor shimmer */
@keyframes p2-floor-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Truss light on — quick flicker-on */
@keyframes p2-flicker-on {
  0%   { opacity: 0; }
  20%  { opacity: 0.8; }
  30%  { opacity: 0.2; }
  50%  { opacity: 0.9; }
  60%  { opacity: 0.4; }
  80%  { opacity: 1; }
  100% { opacity: 1; }
}

/* MGB charge — thin beam converges from edges, growing glow */
/* MGB charge — thin targeting line drops from above, slow & dramatic */
@keyframes p2-mgb-charge-glow {
  0%   { clip-path: inset(0 0 100% 0); opacity: 0; filter: blur(12px); }
  8%   { clip-path: inset(0 0 92% 0); opacity: 0.2; filter: blur(10px); }
  20%  { clip-path: inset(0 0 75% 0); opacity: 0.35; filter: blur(6px); }
  40%  { clip-path: inset(0 0 50% 0); opacity: 0.5; filter: blur(4px); }
  60%  { clip-path: inset(0 0 28% 0); opacity: 0.6; filter: blur(2px); }
  75%  { clip-path: inset(0 0 12% 0); opacity: 0.75; filter: blur(1px); }
  88%  { clip-path: inset(0 0 3% 0); opacity: 0.9; filter: blur(0px); }
  92%  { clip-path: inset(0 0 0% 0); opacity: 1; filter: blur(0px); }
  95%  { clip-path: inset(0 0 0% 0); opacity: 0.7; filter: blur(0px); }
  100% { clip-path: inset(0 0 0% 0); opacity: 1; filter: blur(0px); }
}
@keyframes p2-mgb-charge-core {
  0%   { opacity: 0; width: 1px; clip-path: inset(0 0 100% 0); }
  15%  { opacity: 0.3; width: 2px; clip-path: inset(0 0 80% 0); }
  35%  { opacity: 0.5; width: 2px; clip-path: inset(0 0 55% 0); }
  55%  { opacity: 0.65; width: 3px; clip-path: inset(0 0 30% 0); }
  75%  { opacity: 0.8; width: 4px; clip-path: inset(0 0 8% 0); }
  88%  { opacity: 0.9; width: 5px; clip-path: inset(0 0 0% 0); }
  100% { opacity: 1; width: 100%; clip-path: inset(0 0 0% 0); }
}
/* Charge flash — holds dark then double-pulses at the end */
@keyframes p2-mgb-charge-flash {
  0%,80%  { opacity: 0; }
  85%     { opacity: 0.6; }
  88%     { opacity: 0.1; }
  93%     { opacity: 1; }
  96%     { opacity: 0.3; }
  98%     { opacity: 1; }
  100%    { opacity: 0; }
}
/* Charge edge shimmer — pulses while converging for tension */
@keyframes p2-mgb-charge-shimmer {
  0%, 100% { opacity: 0.4; filter: brightness(1); }
  50%      { opacity: 1; filter: brightness(1.4); }
}
@keyframes p2-mgb-edge-left {
  0%   { opacity: 0; transform: translateX(-50px); }
  20%  { opacity: 0.3; transform: translateX(-30px); }
  50%  { opacity: 0.6; transform: translateX(-12px); }
  80%  { opacity: 0.85; transform: translateX(-3px); }
  100% { opacity: 1; transform: translateX(0px); }
}
@keyframes p2-mgb-edge-right {
  0%   { opacity: 0; transform: translateX(50px); }
  20%  { opacity: 0.3; transform: translateX(30px); }
  50%  { opacity: 0.6; transform: translateX(12px); }
  80%  { opacity: 0.85; transform: translateX(3px); }
  100% { opacity: 1; transform: translateX(0px); }
}

/* MGB beam appear — dramatic slow expansion with blinding flash then settle */
@keyframes p2-mgb-appear {
  0%   { opacity: 0; transform: scaleX(0.03); filter: brightness(5) blur(20px); }
  8%   { opacity: 0.3; transform: scaleX(0.05); filter: brightness(4) blur(16px); }
  18%  { opacity: 0.5; transform: scaleX(0.12); filter: brightness(3) blur(10px); }
  35%  { opacity: 0.75; transform: scaleX(0.4); filter: brightness(2.2) blur(5px); }
  50%  { opacity: 0.9; transform: scaleX(0.85); filter: brightness(1.8) blur(2px); }
  65%  { opacity: 1; transform: scaleX(1.12); filter: brightness(1.4) blur(0px); }
  78%  { opacity: 1; transform: scaleX(0.92); filter: brightness(1.15) blur(0px); }
  88%  { opacity: 1; transform: scaleX(1.04); filter: brightness(1.05) blur(0px); }
  100% { opacity: 1; transform: scaleX(1); filter: brightness(1) blur(0px); }
}

/* MGB beam fire — pulsating energy with width wobble */
@keyframes p2-mgb-fire {
  0%   { opacity: 0.85; filter: brightness(1) saturate(1.1); transform: scaleX(1); }
  25%  { opacity: 0.95; filter: brightness(1.15) saturate(1.2); transform: scaleX(1.03); }
  50%  { opacity: 1; filter: brightness(1.3) saturate(1.4); transform: scaleX(1.06); }
  75%  { opacity: 0.95; filter: brightness(1.15) saturate(1.2); transform: scaleX(1.02); }
  100% { opacity: 0.85; filter: brightness(1) saturate(1.1); transform: scaleX(1); }
}
/* MGB sweep — energy bands scrolling downward */
@keyframes p2-mgb-sweep {
  0%   { background-position: 0% -100%; }
  100% { background-position: 0% 200%; }
}
/* MGB energy rings — scroll downward (fired from above) */
@keyframes p2-mgb-rings {
  0%   { background-position: 0% -50%; }
  100% { background-position: 0% 150%; }
}
/* MGB edge pulse */
@keyframes p2-mgb-edge-pulse {
  0%,100% { opacity: 0.35; filter: blur(1px); }
  50%     { opacity: 1; filter: blur(0px); }
}
/* MGB outer halo — breathing glow */
@keyframes p2-mgb-overflow-pulse {
  0%,100% { opacity: 0.4; transform: scaleX(1); filter: blur(12px); }
  50%     { opacity: 0.75; transform: scaleX(1.08); filter: blur(18px); }
}
/* MGB core flicker — rapid intensity variation */
@keyframes p2-mgb-core-flicker {
  0%   { opacity: 0.55; transform: translateX(-50%) scaleX(0.85); }
  15%  { opacity: 0.85; transform: translateX(-50%) scaleX(1.12); }
  30%  { opacity: 0.65; transform: translateX(-50%) scaleX(0.92); }
  50%  { opacity: 1; transform: translateX(-50%) scaleX(1.18); }
  65%  { opacity: 0.7; transform: translateX(-50%) scaleX(1); }
  80%  { opacity: 0.9; transform: translateX(-50%) scaleX(1.1); }
  100% { opacity: 0.55; transform: translateX(-50%) scaleX(0.85); }
}
/* MGB noise/static shimmer */
@keyframes p2-mgb-noise {
  0%   { background-position: 0% 0%; opacity: 0.12; }
  25%  { background-position: 50% 30%; opacity: 0.08; }
  50%  { background-position: 20% 70%; opacity: 0.15; }
  75%  { background-position: 80% 10%; opacity: 0.06; }
  100% { background-position: 0% 0%; opacity: 0.12; }
}

/* ═══ EXPAND attack keyframes ═══ */
/* Prismatic bolt twinkle */
@keyframes p2-bolt-twinkle {
  0%,100% { filter: brightness(1) drop-shadow(0 0 4px currentColor); transform: scale(1) rotate(0deg); }
  25%     { filter: brightness(1.4) drop-shadow(0 0 8px currentColor); transform: scale(1.2) rotate(45deg); }
  50%     { filter: brightness(1) drop-shadow(0 0 4px currentColor); transform: scale(0.9) rotate(90deg); }
  75%     { filter: brightness(1.6) drop-shadow(0 0 10px currentColor); transform: scale(1.3) rotate(135deg); }
}
/* Sword fade-in + hover */
@keyframes p2-sword-hover {
  0%,100% { transform: translateY(0px); }
  50%     { transform: translateY(-3px); }
}
/* Sun orb idle pulse */
@keyframes p2-sun-idle {
  0%,100% { filter: brightness(1) drop-shadow(0 0 6px currentColor); transform: scale(1); }
  50%     { filter: brightness(1.2) drop-shadow(0 0 10px currentColor); transform: scale(1.08); }
}
/* Sun orb warning glow — builds intensity */
@keyframes p2-sun-warn {
  0%   { filter: brightness(1) drop-shadow(0 0 6px currentColor); transform: scale(1); }
  30%  { filter: brightness(1.5) drop-shadow(0 0 14px currentColor); transform: scale(1.15); }
  60%  { filter: brightness(1.2) drop-shadow(0 0 8px currentColor); transform: scale(1.05); }
  80%  { filter: brightness(2) drop-shadow(0 0 20px currentColor); transform: scale(1.25); }
  100% { filter: brightness(2.5) drop-shadow(0 0 30px currentColor); transform: scale(1.35); }
}
/* Sun ray burst — appears outward */
@keyframes p2-sun-ray {
  0%   { opacity: 0; transform: scaleY(0.1); }
  15%  { opacity: 1; transform: scaleY(1.1); }
  25%  { opacity: 0.9; transform: scaleY(0.95); }
  50%  { opacity: 1; transform: scaleY(1); }
  85%  { opacity: 0.8; transform: scaleY(1); }
  100% { opacity: 0; transform: scaleY(0.3); }
}
/* Sun Dance — slow ray rotation during shine */
@keyframes p2-sun-rotate {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(45deg); }
}
/* Wave transition flash */
@keyframes p2-expand-wave-flash {
  0%   { opacity: 0; }
  20%  { opacity: 0.4; }
  100% { opacity: 0; }
}

/* ═══ ANNOYANCE attack keyframes ═══ */
/* Clock beam telegraph — thin pulsing line */
@keyframes p2-clock-telegraph {
  0%   { opacity: 0; }
  30%  { opacity: 0.6; }
  60%  { opacity: 0.3; }
  100% { opacity: 0.7; }
}
/* Clock beam fire — flash in then hold */
@keyframes p2-clock-fire {
  0%   { opacity: 0.3; transform: scaleX(0.5); filter: brightness(3) blur(4px); }
  20%  { opacity: 1; transform: scaleX(1.2); filter: brightness(2) blur(1px); }
  40%  { opacity: 1; transform: scaleX(0.95); filter: brightness(1.3) blur(0px); }
  100% { opacity: 1; transform: scaleX(1); filter: brightness(1) blur(0px); }
}
/* Clock beam fade */
@keyframes p2-clock-fade {
  0%   { opacity: 1; filter: blur(0px); }
  100% { opacity: 0; filter: blur(6px); }
}
/* Annoyance chaos pulse — border throb */
@keyframes p2-annoy-border {
  0%,100% { filter: brightness(1) drop-shadow(0 0 8px currentColor); }
  50%     { filter: brightness(1.4) drop-shadow(0 0 16px currentColor); }
}

/* I-frame blink */
@keyframes p2-iframe-blink {
  0%,100% { opacity: 0; }
  50%     { opacity: 1; }
}
`;

// ═════════════════════════════════════════════════════════════════════════════
// StageDecoration — sits UNDERNEATH the battle box
// ════════════════════════════════════════════════════════════════════════════
function StageDecoration({ visible, boxW, boxH, laserAngles, laserPositions, spotlightPositions }: {
  visible: boolean;
  boxW: number;
  boxH: number;
  laserAngles: number[];
  laserPositions: { pctX: number; color: string }[];
  spotlightPositions: { pctX: number; color: string }[];
}) {
  // Stage extends beyond the box on all sides
  const PAD_X = 80;  // extra width each side for trusses
  const PAD_TOP = 110; // space above for truss bar + lights
  const PAD_BOT = 60;  // space below for stage floor extension

  const stageW = boxW + BORDER_W * 2 + PAD_X * 2;
  const stageH = boxH + BORDER_W * 2 + PAD_TOP + PAD_BOT;

  // Where the box sits relative to this container
  const boxLeft = PAD_X;
  const boxTop = PAD_TOP;
  const boxRight = boxLeft + boxW + BORDER_W * 2;
  const boxBottom = boxTop + boxH + BORDER_W * 2;

  // Silver / dark metal colours
  const SILVER = "#d4d4d4";
  const DARK_METAL = "#4a4a50";
  const METAL_MID = "#8a8a90";

  // Truss bar helper (horizontal lattice)
  const TrussBar = ({ x, y, w, vertical = false }: { x: number; y: number; w: number; vertical?: boolean }) => (
    <div style={{
      position: "absolute",
      left: vertical ? x : x,
      top: vertical ? y : y,
      width: vertical ? 10 : w,
      height: vertical ? w : 10,
      background: `linear-gradient(${vertical ? "180deg" : "90deg"}, ${DARK_METAL}, ${METAL_MID}, ${SILVER}cc, ${METAL_MID}, ${DARK_METAL})`,
      border: `1px solid ${SILVER}77`,
      borderRadius: 1,
      boxShadow: `inset 0 1px 0 ${SILVER}66, inset 0 -1px 0 ${SILVER}22, 0 1px 4px #00000066`,
    }}>
      {/* Cross-bracing marks */}
      {!vertical && Array.from({ length: Math.floor(w / 24) }).map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          left: 12 + i * 24,
          top: 2,
          width: 1,
          height: 6,
          background: `${SILVER}88`,
        }} />
      ))}
    </div>
  );

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        width: stageW,
        height: stageH,
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        // Phase-in: scale from slightly small + fade
        opacity: visible ? 1 : 0,
        scale: visible ? "1" : "0.92",
        transition: `opacity ${visible ? 1400 : 500}ms ease-out, scale ${visible ? 1200 : 400}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        zIndex: 0,
      }}
    >
      {/* ═══════════════════ STAGE FLOOR (below the box) ══════════════════ */}
      {/* Main floor platform */}
      <div style={{
        position: "absolute",
        left: PAD_X - 30,
        top: boxBottom - 6,
        width: boxW + BORDER_W * 2 + 60,
        height: PAD_BOT + 6,
        background: `linear-gradient(180deg, #1a1a1e, #222226 40%, #1a1a1e)`,
        border: `1px solid ${SILVER}33`,
        borderTop: "none",
        borderRadius: "0 0 3px 3px",
      }}>
        {/* Silver edge trim along top of floor */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${SILVER}00, ${SILVER}bb, ${SILVER}00)`,
        }} />
        {/* Floor planking lines */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={`plank-${i}`} style={{
            position: "absolute",
            top: 8 + i * 10,
            left: 10,
            right: 10,
            height: 1,
            background: `${SILVER}22`,
          }} />
        ))}
        {/* Shimmer sweep across floor */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(90deg, transparent 0%, ${SILVER}08 45%, ${SILVER}15 50%, ${SILVER}08 55%, transparent 100%)`,
          backgroundSize: "200% 100%",
          animation: visible ? "p2-floor-shimmer 4s linear infinite" : "none",
        }} />
      </div>

      {/* Side floor wings (angled stage edges) */}
      {[0, 1].map((side) => (
        <div key={`floor-wing-${side}`} style={{
          position: "absolute",
          [side === 0 ? "left" : "right"]: PAD_X - 50,
          top: boxBottom,
          width: 22,
          height: PAD_BOT - 8,
          background: `linear-gradient(${side === 0 ? "90deg" : "270deg"}, #18181c, #222226)`,
          borderRadius: side === 0 ? "0 0 0 4px" : "0 0 4px 0",
          border: `1px solid ${SILVER}25`,
          borderTop: "none",
        }} />
      ))}

      {/* ═══════════════ FOOTLIGHTS (front edge of stage) ══════════════ */}
      <div style={{
        position: "absolute",
        left: PAD_X - 10,
        top: boxBottom + 1,
        width: boxW + BORDER_W * 2 + 20,
        height: 6,
        display: "flex",
        justifyContent: "space-evenly",
        alignItems: "center",
        zIndex: 1,
      }}>
        {Array.from({ length: 10 }).map((_, i) => {
          const col = LIGHT_COLS[i % LIGHT_COLS.length];
          return (
            <div key={`foot-${i}`} style={{
              width: 6,
              height: 4,
              borderRadius: "50%",
              background: col,
              boxShadow: `0 0 6px ${col}, 0 2px 10px ${col}66`,
              animationName: visible ? "p2-led-chase" : "none",
              animationDuration: `${0.6 + (i % 3) * 0.2}s`,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDelay: `${i * 0.12}s`,
              opacity: visible ? 1 : 0,
              transition: `opacity 0.3s ease ${0.8 + i * 0.06}s`,
            }} />
          );
        })}
      </div>

      {/* ═══════════════════ TRUSS TOWERS (left + right) ═══════════════════ */}
      {[0, 1].map((side) => {
        const x = side === 0 ? PAD_X - 40 : boxRight + 20;
        return (
          <div key={`tower-${side}`} style={DISPLAY_CONTENTS}>
            {/* Main vertical bar */}
            <TrussBar x={x} y={20} w={stageH - 40} vertical />
            {/* Parallel bar (inner) */}
            <TrussBar x={x + 18} y={20} w={stageH - 40} vertical />
            {/* Cross-members between the two verticals */}
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={`xmember-${side}-${i}`} style={{
                position: "absolute",
                left: x + 10,
                top: 30 + i * ((stageH - 60) / 7),
                width: 8,
                height: 1,
                background: `${SILVER}66`,
                transform: i % 2 === 0 ? "rotate(45deg)" : "rotate(-45deg)",
              }} />
            ))}
            {/* Diagonal brace */}
            <div style={{
              position: "absolute",
              left: x + 4,
              top: 20,
              width: 2,
              height: stageH - 40,
              background: `${SILVER}18`,
              transform: `rotate(${side === 0 ? 3 : -3}deg)`,
              transformOrigin: "top center",
            }} />
          </div>
        );
      })}

      {/* ══════════════════ TOP TRUSS BAR (horizontal) ═══════════════════ */}
      <TrussBar x={PAD_X - 40} y={16} w={stageW - PAD_X * 2 + 68} />
      {/* Lower parallel bar */}
      <TrussBar x={PAD_X - 40} y={30} w={stageW - PAD_X * 2 + 68} />
      {/* Cross-bracing between top bars */}
      {Array.from({ length: Math.floor((stageW - PAD_X * 2 + 60) / 30) }).map((_, i) => (
        <div key={`top-x-${i}`} style={{
          position: "absolute",
          left: PAD_X - 30 + i * 30,
          top: 26,
          width: 14,
          height: 1,
          background: `${SILVER}44`,
          transform: i % 2 === 0 ? "rotate(55deg)" : "rotate(-55deg)",
          transformOrigin: "left center",
        }} />
      ))}

      {/* ═══════════════ SPOTLIGHTS on top truss ══════════════ */}
      {spotlightPositions.map((sp, i) => {
        const col = sp.color;
        const spotX = boxLeft + BORDER_W + sp.pctX * boxW;
        return (
          <div key={`spot-${i}`} style={{
            position: "absolute",
            left: spotX,
            top: 38,
            transform: "translateX(-50%)",
            opacity: visible ? 1 : 0,
            transition: `opacity 0.5s ease ${0.5 + i * 0.15}s`,
          }}>
            {/* PAR can housing */}
            <div style={{
              width: 14,
              height: 12,
              background: `linear-gradient(180deg, ${DARK_METAL}, #1a1a1a)`,
              border: `1px solid ${SILVER}33`,
              borderRadius: "3px 3px 0 0",
              margin: "0 auto",
              position: "relative",
            }}>
              {/* Lens */}
              <div style={{
                position: "absolute",
                bottom: -1,
                left: 2,
                right: 2,
                height: 3,
                borderRadius: "0 0 2px 2px",
                background: col,
                boxShadow: `0 0 4px ${col}`,
                animationName: visible ? "p2-flicker-on" : "none",
                animationDuration: "0.6s",
                animationTimingFunction: "ease",
                animationFillMode: "forwards",
                animationDelay: `${0.6 + i * 0.18}s`,
                opacity: 0,
              }} />
            </div>
            {/* Light cone — triangular glow pointing down */}
            <div style={{
              width: 0,
              height: 0,
              borderLeft: "22px solid transparent",
              borderRight: "22px solid transparent",
              borderTop: `${boxH * 0.65}px solid ${col}12`,
              margin: "0 auto",
              filter: "blur(6px)",
              animationName: visible ? "p2-spot-pulse" : "none",
              animationDuration: `${2.2 + i * 0.4}s`,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDelay: `${1 + i * 0.2}s`,
            }} />
          </div>
        );
      })}

      {/* ═══════════════ SIDE SPOTLIGHTS (on towers, aimed inward) ══════════════ */}
      {[0, 1].map((side) => {
        const col = side === 0 ? L.green : L.yellow;
        const towerX = side === 0 ? PAD_X - 35 : boxRight + 23;
        return (
          <div key={`side-spot-${side}`} style={{
            position: "absolute",
            left: towerX,
            top: boxTop + boxH * 0.3,
            opacity: visible ? 1 : 0,
            transition: `opacity 0.5s ease ${0.9 + side * 0.2}s`,
          }}>
            {/* Housing */}
            <div style={{
              width: 10,
              height: 10,
              background: DARK_METAL,
              border: `1px solid ${SILVER}33`,
              borderRadius: 2,
              position: "relative",
            }}>
              <div style={{
                position: "absolute",
                [side === 0 ? "right" : "left"]: -2,
                top: 3,
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: col,
                boxShadow: `0 0 6px ${col}`,
                animation: visible ? `p2-spot-pulse 2s ease-in-out infinite` : "none",
              }} />
            </div>
            {/* Horizontal light wash */}
            <div style={{
              position: "absolute",
              top: 0,
              [side === 0 ? "left" : "right"]: 12,
              width: boxW * 0.4,
              height: 10,
              background: `linear-gradient(${side === 0 ? "90deg" : "270deg"}, ${col}20, transparent)`,
              filter: "blur(8px)",
              animation: visible ? `p2-spot-pulse 2.5s ease-in-out infinite` : "none",
            }} />
          </div>
        );
      })}

      {/* ══════════════ LASERS (sweeping — synced with gameplay angles) ═══════════════ */}
      {laserPositions.map((lp, i) => {
        const laserX = boxLeft + BORDER_W + lp.pctX * boxW;
        const laserLen = boxH + PAD_BOT + 20;
        const angleDeg = laserAngles[i] ?? 0;
        return (
          <div key={`laser-${i}`} style={{
            position: "absolute",
            left: laserX,
            top: 40,
            width: 2,
            height: laserLen,
            background: `linear-gradient(180deg, ${lp.color}dd, ${lp.color}44 60%, ${lp.color}00)`,
            boxShadow: `0 0 4px ${lp.color}88, 0 0 12px ${lp.color}33`,
            transformOrigin: "top center",
            transform: `rotate(${angleDeg}deg)`,
            opacity: visible ? 0.85 : 0,
            transition: `opacity 0.8s ease ${0.6 + i * 0.15}s`,
            zIndex: 0,
          }} />
        );
      })}

      {/* ══════════════ LED STRIP on tower faces ══════════════ */}
      {[0, 1].map((side) => {
        const x = side === 0 ? PAD_X - 28 : boxRight + 30;
        return (
          <div key={`led-${side}`} style={{
            position: "absolute",
            left: x,
            top: boxTop - 10,
            width: 3,
            height: boxH + 20,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}>
            {Array.from({ length: 12 }).map((_, j) => {
              const col = LIGHT_COLS[(j + side * 2) % LIGHT_COLS.length];
              return (
                <div key={j} style={{
                  flex: 1,
                  borderRadius: 1,
                  background: col,
                  boxShadow: `0 0 4px ${col}aa`,
                  animationName: visible ? "p2-led-chase" : "none",
                  animationDuration: `${0.5 + (j % 4) * 0.15}s`,
                  animationTimingFunction: "ease-in-out",
                  animationIterationCount: "infinite",
                  animationDelay: `${1.0 + j * 0.08 + side * 0.4}s`,
                  opacity: visible ? 1 : 0,
                  transition: `opacity 0.3s ease ${0.9 + j * 0.05}s`,
                }} />
              );
            })}
          </div>
        );
      })}

      {/* ══════════════ AMBIENT HAZE (very subtle atmosphere) ══════════════ */}
      <div style={{
        position: "absolute",
        left: PAD_X,
        top: boxTop,
        width: boxW + BORDER_W * 2,
        height: boxH + BORDER_W * 2,
        background: `radial-gradient(ellipse at 50% 20%, ${L.teal}06, transparent 70%)`,
        pointerEvents: "none",
        zIndex: 3,
        opacity: visible ? 1 : 0,
        transition: "opacity 1.5s ease 1s",
      }} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════════

export const BossFightPhase2 = forwardRef<Phase2DebugHandle, Phase2Props>(function BossFightPhase2({
  colors,
  bossName,
  bossMaxHp,
  playerMaxHp,
  startingScore,
  onBack,
  hideDebugControls,
  onDebugStateChange,
  battleBoxOnly,
  onPlayerDamage,
  onAttackComplete,
  autoStartAttack,
  resolveShielded,
}, ref) {
  const [boxW, setBoxW] = useState(BASE_W);
  const [boxH, setBoxH] = useState(BASE_H);
  const [stageVisible, setStageVisible] = useState(false);
  
  // ── MGB (Miku Gnarpy Beam) state ──
  const [mgBeamActive, setMgBeamActive] = useState(false);       // beam is firing
  const [mgBeamCharging, setMgBeamCharging] = useState(false);   // cinematic charge-up
  const [mgBeamDissipating, setMgBeamDissipating] = useState(false); // beam fading out last 500ms
  const mgBeamHitRef = useRef(false);                            // only hit once per beam
  const mgBeamStartRef = useRef(0);                              // timestamp for animation progress
  const mgBeamActiveRef = useRef(false);                         // rAF-safe mirror of mgBeamActive
  const mgBeamDissipateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── EXPAND attack state ──
  const [expandActive, setExpandActive] = useState(false);
  const expandActiveRef = useRef(false);
  const expandStartRef = useRef(0);
  const expandWaveRef = useRef(0);           // 1=bolts, 2=swords, 3=sun
  const expandBoltsRef = useRef<PrismaticBolt[]>([]);
  const expandSwordsRef = useRef<EtherealSword[]>([]);
  const expandOrbsRef = useRef<SunOrb[]>([]);
  const expandLastThrowRef = useRef(0);      // last throw timestamp
  const expandLastBoltSpawnRef = useRef(0);  // last bolt spawn timestamp
  const expandBoltIdRef = useRef(0);
  const expandSwordIdRef = useRef(0);
  const expandVolleyRef = useRef(0);         // which sword volley (0,1,2)
  const expandLastVolleyRef = useRef(0);     // timestamp of last volley start
  const expandSunCycleRef = useRef(0);       // which sun cycle
  const expandLastSunCycleRef = useRef(0);   // timestamp of last sun cycle
  const expandSunPicksRef = useRef<number[]>([]); // which 2 orbs are active

  // ── ANNOYANCE attack state ──
  const [annoyActive, setAnnoyActive] = useState(false);
  const annoyActiveRef = useRef(false);
  const annoyStartRef = useRef(0);
  const annoyLastThrowRef = useRef(0);
  const annoyBeamsRef = useRef<ClockBeam[]>([]);
  const annoyBeamIdRef = useRef(0);
  const annoyLastBeamSpawnRef = useRef(0);
  const annoyVolleyRef = useRef(-1);
  const annoyLastVolleyRef = useRef(0);
  const annoySunCycleRef = useRef(0);
  const annoyLastSunCycleRef = useRef(0);
  const annoySunPicksRef = useRef<number[]>([]);
  // Annoyance reuses expandSwordsRef, expandOrbsRef, expandSwordIdRef for rendering

  // ── FRUSTRATION attack state ──
  const [frustActive, setFrustActive] = useState(false);
  const frustActiveRef = useRef(false);
  const frustStartRef = useRef(0);
  const frustLastThrowRef = useRef(0);
  const frustLastBeamRef = useRef(0);
  const frustLastSwordRef = useRef(0);
  const frustLastBoltRef = useRef(0);
  const frustBoxCycleRef = useRef(0);          // current box size index
  const frustSafeZoneRef = useRef<FrustSafeZone | null>(null);
  const frustLastSafeRef = useRef(0);          // timestamp of last safe zone check
  const frustMgbWarningRef = useRef(false);    // MGB warning active
  const frustMgbFiringRef = useRef(false);     // MGB beam firing
  const frustSwordVolleyRef = useRef(-1);
  // Frustration reuses: expandBoltsRef, expandSwordsRef, annoyBeamsRef, expandBoltIdRef, expandSwordIdRef, annoyBeamIdRef

  const playerPos = useRef({ x: BASE_W / 2, y: BASE_H / 2 });
  const [playerRender, setPlayerRender] = useState({ x: BASE_W / 2, y: BASE_H / 2 });
  const keysRef = useRef<Set<string>>(new Set());

  const [playerHp, setPlayerHp] = useState(playerMaxHp);
  const [bossHp, setBossHp] = useState(bossMaxHp);
  const [score] = useState(startingScore);
  const [currentAttack, setCurrentAttack] = useState("idle");
  const [isAttacking, setIsAttacking] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [loopingAttack, setLoopingAttack] = useState<string | null>(null);
  const loopingAttackRef = useRef<string | null>(null);

  // ── Resolve ding particles (gold sparkles when damage is blocked) ──
  const [resolveDings, setResolveDings] = useState<{ id: number; x: number; y: number; angle: number; spawnTime: number }[]>([]);
  const resolveDingIdRef = useRef(0);
  const RESOLVE_DING_LIFETIME = 600; // ms
  const RESOLVE_DING_COUNT = 6; // particles per blocked hit
  const RESOLVE_DING_COOLDOWN = 300; // ms between ding bursts
  const lastDingTimeRef = useRef(0);

  // ── JS-interpolated box dimensions for fluid heart clamping during resize ──
  // Instead of CSS transitions on the heart, we lerp the box dims in the rAF loop
  const boxLerpRef = useRef<{ fromW: number; fromH: number; toW: number; toH: number; startTime: number; duration: number } | null>(null);
  // Current interpolated dims, written every rAF tick, read in JSX for laser rendering.
  // Safe because setPlayerRender already forces re-renders every frame.
  const interpDimsRef = useRef({ w: BASE_W, h: BASE_H });
  // Render-state mirror of interpDimsRef — drives box element sizing (NO CSS transition).
  // Updated every rAF frame alongside setPlayerRender.
  const [renderBoxDims, setRenderBoxDims] = useState({ w: BASE_W, h: BASE_H });

  // ── Centralised damage helper (respects i-frames, triggers shake + blink) ──
  // When resolveShielded is true, all damage is blocked (parent handles resolve drain)
  const resolveShieldedRef = useRef(resolveShielded ?? false);
  useEffect(() => { resolveShieldedRef.current = resolveShielded ?? false; }, [resolveShielded]);

  const applyDamage = useCallback((amount: number, iframeMs: number, shakeForce: number, isCrush = false) => {
    if (resolveShieldedRef.current) {
      // Blocked by Resolve — spawn ding particles
      const now = performance.now();
      if (now - lastDingTimeRef.current < RESOLVE_DING_COOLDOWN) return;
      lastDingTimeRef.current = now;
      const px = playerPos.current.x;
      const py = playerPos.current.y;
      const newDings: typeof resolveDings = [];
      for (let i = 0; i < RESOLVE_DING_COUNT; i++) {
        newDings.push({
          id: resolveDingIdRef.current++,
          x: px,
          y: py,
          angle: (i / RESOLVE_DING_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5,
          spawnTime: now,
        });
      }
      setResolveDings(prev => [...prev, ...newDings]);
      // Clean up after lifetime
      setTimeout(() => {
        setResolveDings(prev => prev.filter(d => !newDings.find(n => n.id === d.id)));
      }, RESOLVE_DING_LIFETIME + 50);
      return;
    }
    const now = performance.now();
    if (now - lastHitTimeRef.current < iframeMs) return;
    lastHitTimeRef.current = now;
    setPlayerHp((prev) => Math.max(0, prev - amount));
    setIframeFeedback(true);
    setTimeout(() => setIframeFeedback(false), iframeMs);
    shakeIntensityRef.current = Math.max(shakeIntensityRef.current, shakeForce);
    if (isCrush) {
      setWallCrushFlash(true);
      setTimeout(() => setWallCrushFlash(false), 350);
    }
    onPlayerDamage?.(amount);
  }, [onPlayerDamage]);

  // ── Laser hazard state (STAGE attack) ──
  const stageVisibleRef = useRef(false);
  const lastHitTimeRef = useRef(0);           // for i-frames
  const [iframeFeedback, setIframeFeedback] = useState(false); // heart flash
  const laserStartTimeRef = useRef(0);        // when lasers activated
  // Full-length laser config: 4 sweeping beams that extend the full box height
  const LASER_CONFIGS = useRef([
    { pctX: 0.15, speed: 1.8,  phase: 0,          minAngle: -35, maxAngle: 35, color: L.green  },
    { pctX: 0.40, speed: 2.3,  phase: Math.PI/3,  minAngle: -30, maxAngle: 25, color: L.teal   },
    { pctX: 0.60, speed: 1.5,  phase: Math.PI*0.7, minAngle: -20, maxAngle: 40, color: L.yellow },
    { pctX: 0.85, speed: 2.0,  phase: Math.PI*1.2, minAngle: -40, maxAngle: 20, color: L.dark   },
  ]).current;
  // Spotlight beam config: 5 static cone-shaped beams pointing straight down.
  const BEAM_CONFIGS = useRef([
    { pctX: 0.08, angle: 0, color: L.green  },
    { pctX: 0.28, angle: 0, color: L.teal   },
    { pctX: 0.50, angle: 0, color: L.yellow },
    { pctX: 0.72, angle: 0, color: L.dark   },
    { pctX: 0.92, angle: 0, color: L.green  },
  ]).current;
  // Ref-based angles: eliminates 1-frame render lag between collision and visual.
  // [0..3] = laser angles, [4..8] = beam angles
  const laserAnglesRef = useRef<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0]);

  // ── Screen shake state ──
  const shakeIntensityRef = useRef(0);
  const [shakeOffset, setShakeOffset] = useState({ x: 0, y: 0 });

  // ── Wall crush red border flash ──
  const [wallCrushFlash, setWallCrushFlash] = useState(false);

  const animRef = useRef(0);
  const boxDimsRef = useRef({ w: BASE_W, h: BASE_H });
  const attackTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const stageTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Attack-start throw velocity (flings player in a cardinal direction) ──
  const throwVelRef = useRef({ vx: 0, vy: 0 });
  // Track whether the throw has already hit a wall (only crush once per throw)
  const throwWallHitRef = useRef(false);

  // ── Inject keyframes ──
  useEffect(() => {
    const id = "phase2-stage-keyframes";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = STAGE_KEYFRAMES;
    document.head.appendChild(s);
    return () => { s.remove(); };
  }, []);

  // ── Keep stageVisibleRef in sync ──
  useEffect(() => {
    stageVisibleRef.current = stageVisible;
    if (stageVisible) laserStartTimeRef.current = performance.now();
  }, [stageVisible]);

  // ─ Proportional heart repositioning on box resize + wall crush detection ──
  useEffect(() => {
    const prev = boxDimsRef.current;
    const next = { w: boxW, h: boxH };

    if (prev.w !== next.w || prev.h !== next.h) {
      const p = playerPos.current;
      const rx = prev.w > 0 ? p.x / prev.w : 0.5;
      const ry = prev.h > 0 ? p.y / prev.h : 0.5;

      // Ideal proportional position (before clamping)
      const idealX = rx * next.w;
      const idealY = ry * next.h;

      const nx = Math.max(PLAYER_R, Math.min(next.w - PLAYER_R, idealX));
      const ny = Math.max(PLAYER_R, Math.min(next.h - PLAYER_R, idealY));

      // ── Wall crush: if the box shrank AND the clamp had to move the player,
      //    the player is being squeezed against a wall ──
      const shrankW = next.w < prev.w;
      const shrankH = next.h < prev.h;
      const clampedX = Math.abs(nx - idealX) > 1;
      const clampedY = Math.abs(ny - idealY) > 1;

      if ((shrankW && clampedX) || (shrankH && clampedY)) {
        applyDamage(WALL_CRUSH_DAMAGE, WALL_CRUSH_IFRAMES_MS, SHAKE_CRUSH_INTENSITY, true);
      }

      playerPos.current = { x: nx, y: ny };
      setPlayerRender({ x: nx, y: ny });

      // ── Start JS box lerp for fluid heart tracking during CSS box resize ──
      boxLerpRef.current = {
        fromW: prev.w, fromH: prev.h,
        toW: next.w, toH: next.h,
        startTime: performance.now(),
        duration: BOX_TRANSITION_MS,
      };
    }

    boxDimsRef.current = next;
  }, [boxW, boxH, applyDamage]);

  // ── Keyboard (Arrow keys + WASD) ──
  useEffect(() => {
    const keyMap: Record<string, string> = {
      arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
      w: "ArrowUp", a: "ArrowLeft", s: "ArrowDown", d: "ArrowRight",
    };
    const onDown = (e: KeyboardEvent) => {
      const mapped = keyMap[e.key.toLowerCase()];
      if (mapped) { e.preventDefault(); keysRef.current.add(mapped); }
    };
    const onUp = (e: KeyboardEvent) => {
      const mapped = keyMap[e.key.toLowerCase()];
      if (mapped) keysRef.current.delete(mapped);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  // ── Auto-start attack on mount (for embedded battleBoxOnly mode) ──
  const autoStartRef = useRef(autoStartAttack);
  const autoStartedRef = useRef(false);
  useEffect(() => {
    const attackToStart = autoStartRef.current;
    const shouldAutoStart = !!attackToStart;
    if (!autoStartedRef.current && shouldAutoStart) {
      autoStartedRef.current = true;
      console.log("[Phase2] Auto-starting attack:", attackToStart);
      const t = setTimeout(() => {
        if (attackToStart) runAttack(attackToStart);
      }, 300);
      return () => clearTimeout(t);
    }
  }, []); // only on mount — reads from refs to avoid stale closure

  // ── Player movement loop + laser collision ──
  useEffect(() => {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 32) / 16;
      last = now;
      const keys = keysRef.current;
      let { x, y } = playerPos.current;

      // ── Compute interpolated box dims for fluid clamping during resize ──
      const lerp = boxLerpRef.current;
      let dw: number, dh: number;
      if (lerp && now < lerp.startTime + lerp.duration) {
        const t = (now - lerp.startTime) / lerp.duration;
        // Ease-out cubic approximation (matches CSS cubic-bezier(0.25, 0.46, 0.45, 0.94))
        const e = 1 - Math.pow(1 - t, 3);
        dw = lerp.fromW + (lerp.toW - lerp.fromW) * e;
        dh = lerp.fromH + (lerp.toH - lerp.fromH) * e;
      } else {
        if (lerp) boxLerpRef.current = null; // lerp complete
        const d = boxDimsRef.current;
        dw = d.w;
        dh = d.h;
      }
      // Store interpolated dims for JSX (laser rendering reads this)
      interpDimsRef.current = { w: dw, h: dh };

      if (keys.has("ArrowLeft"))  x -= PLAYER_SPEED * dt;
      if (keys.has("ArrowRight")) x += PLAYER_SPEED * dt;
      if (keys.has("ArrowUp"))    y -= PLAYER_SPEED * dt;
      if (keys.has("ArrowDown"))  y += PLAYER_SPEED * dt;

      // ── Apply attack-start throw velocity ──
      const tv = throwVelRef.current;
      if (Math.abs(tv.vx) > THROW_MIN || Math.abs(tv.vy) > THROW_MIN) {
        x += tv.vx * dt;
        y += tv.vy * dt;
        // Decay velocity with friction
        throwVelRef.current = {
          vx: tv.vx * THROW_FRICTION,
          vy: tv.vy * THROW_FRICTION,
        };
      } else if (tv.vx !== 0 || tv.vy !== 0) {
        throwVelRef.current = { vx: 0, vy: 0 };
      }

      // ── Clamp to box bounds (or inner cage during ANNOYANCE) ──
      const preClampX = x;
      const preClampY = y;
      if (annoyActiveRef.current) {
        // Constrain player to the small inner cage centered in the box
        const cageCx = dw / 2;
        const cageCy = dh / 2;
        const halfCW = ANNOY_CAGE_W / 2;
        const halfCH = ANNOY_CAGE_H / 2;
        x = Math.max(cageCx - halfCW + PLAYER_R, Math.min(cageCx + halfCW - PLAYER_R, x));
        y = Math.max(cageCy - halfCH + PLAYER_R, Math.min(cageCy + halfCH - PLAYER_R, y));
      } else {
        x = Math.max(PLAYER_R, Math.min(dw - PLAYER_R, x));
        y = Math.max(PLAYER_R, Math.min(dh - PLAYER_R, y));
      }

      // ── Throw wall crush: if the throw pushed us into a wall, deal damage once ──
      if (!throwWallHitRef.current && (Math.abs(tv.vx) > THROW_MIN || Math.abs(tv.vy) > THROW_MIN)) {
        const hitWall = Math.abs(x - preClampX) > 0.5 || Math.abs(y - preClampY) > 0.5;
        if (hitWall) {
          throwWallHitRef.current = true;
          applyDamage(WALL_CRUSH_DAMAGE, WALL_CRUSH_IFRAMES_MS, SHAKE_CRUSH_INTENSITY, true);
          // Kill remaining throw velocity on impact
          throwVelRef.current = { vx: 0, vy: 0 };
        }
      }

      playerPos.current = { x, y };
      setPlayerRender({ x, y });
      setRenderBoxDims({ w: dw, h: dh });

      // ── STAGE hazard computation + collision (lasers + spotlight beams) ──
      if (stageVisibleRef.current) {
        const elapsed = (now - laserStartTimeRef.current) / 1000;
        const allAngles: number[] = [];
        let hitThisFrame = false;
        let hitDamage = 0;

        // ── Laser collision: perpendicular distance from player center to beam line ──
        // Uses classic point-to-line-segment: project player onto the beam,
        // clamp to [0, len], compute perpendicular distance, hit if within
        // (LASER_WIDTH/2 + STAGE_PLAYER_HIT_R).
        const laserConfigs = LASER_CONFIGS;
        const laserLen = dh * 1.5;
        const laserHitDist = LASER_WIDTH / 2 + STAGE_PLAYER_HIT_R;
        for (let i = 0; i < laserConfigs.length; i++) {
          const cfg = laserConfigs[i];
          const t = 0.5 + 0.5 * Math.sin(elapsed * cfg.speed + cfg.phase);
          const angleDeg = cfg.minAngle + (cfg.maxAngle - cfg.minAngle) * t;
          allAngles.push(angleDeg);
          const rad = (angleDeg * Math.PI) / 180;
          const originX = cfg.pctX * dw;
          // Beam direction vector (unnormalized, length = laserLen)
          const bx = Math.sin(rad) * laserLen;
          const by = Math.cos(rad) * laserLen;
          // Vector from beam origin to player
          const px = x - originX;
          const py = y; // origin Y is 0
          // Project onto beam direction, clamp to segment [0, 1]
          const dot = px * bx + py * by;
          const lenSq = bx * bx + by * by;
          const tp = Math.max(0, Math.min(1, dot / lenSq));
          // Closest point on segment
          const cx = tp * bx;
          const cy = tp * by;
          // Distance from player to closest point
          const dist = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
          if (dist <= laserHitDist) {
            hitThisFrame = true;
            hitDamage = Math.max(hitDamage, LASER_DAMAGE);
          }
        }

        // ── Spotlight beams (5) — static cones, 25% box height ──
        // Spotlights point straight down (angle=0), so collision is simple:
        // player must be within Y range [0, beamLen] and within the cone width at that Y.
        const beamConfigs = BEAM_CONFIGS;
        const beamLen = dh * 0.25;
        for (let i = 0; i < beamConfigs.length; i++) {
          const cfg = beamConfigs[i];
          allAngles.push(cfg.angle);
          const originX = cfg.pctX * dw;
          // Cone goes straight down from (originX, 0) to (originX, beamLen)
          // Width tapers from 0 at top to BEAM_CONE_HALF_W at bottom
          if (y >= 0 && y <= beamLen + STAGE_PLAYER_HIT_R) {
            const progress = Math.min(1, y / beamLen); // 0 at top, 1 at bottom
            const halfW = BEAM_CONE_HALF_W * progress;
            const distX = Math.abs(x - originX);
            if (distX <= halfW + STAGE_PLAYER_HIT_R) {
              hitThisFrame = true;
              hitDamage = Math.max(hitDamage, BEAM_DAMAGE);
            }
          }
        }

        // Update ref directly  no state batching delay
        laserAnglesRef.current = allAngles;

        // Apply damage with shared i-frames
        if (hitThisFrame) {
          applyDamage(hitDamage, STAGE_IFRAMES_MS, SHAKE_LASER_INTENSITY);
        }
      }

      // ── MGB beam: continuous damage while beam is active ──
      // The beam covers the entire box, so if it's active and player hasn't been hit yet, deal damage
      if (mgBeamActiveRef.current && !mgBeamHitRef.current) {
        mgBeamHitRef.current = true;
        applyDamage(MGB_DAMAGE, MGB_BEAM_DURATION, 20); // massive shake
      }

      // ── EXPAND attack: update entities, spawn, collide ──
      if (expandActiveRef.current) {
        const elapsed = now - expandStartRef.current;

        // Determine current wave
        let wave = 1;
        if (elapsed >= EXPAND_WAVE1_DUR + EXPAND_WAVE2_DUR) wave = 3;
        else if (elapsed >= EXPAND_WAVE1_DUR) wave = 2;
        expandWaveRef.current = wave;

        // Periodic throws every 5s
        if (now - expandLastThrowRef.current >= EXPAND_THROW_INTERVAL) {
          expandLastThrowRef.current = now;
          const dirs = [
            { vx: -THROW_SPEED, vy: 0 },
            { vx: THROW_SPEED, vy: 0 },
            { vx: 0, vy: -THROW_SPEED },
            { vx: 0, vy: THROW_SPEED },
          ];
          const pick = dirs[Math.floor(Math.random() * dirs.length)];
          throwVelRef.current = { vx: pick.vx, vy: pick.vy };
          throwWallHitRef.current = false;
        }

        // ── Wave 1: Prismatic Bolts ──
        if (wave === 1) {
          // Spawn bolts periodically
          if (now - expandLastBoltSpawnRef.current >= EXPAND_BOLT_SPAWN_INTERVAL) {
            expandLastBoltSpawnRef.current = now;
            const bw = dw, bh = dh;
            // Spawn outside box — pick a random edge
            const side = Math.floor(Math.random() * 4);
            let sx: number, sy: number;
            const margin = 60 + Math.random() * 120;
            if (side === 0) { sx = -margin; sy = Math.random() * bh; }          // left
            else if (side === 1) { sx = bw + margin; sy = Math.random() * bh; } // right
            else if (side === 2) { sx = Math.random() * bw; sy = -margin; }     // top
            else { sx = Math.random() * bw; sy = bh + margin; }                 // bottom
            // Bezier control point — somewhere in the box for a nice curve
            const cx = bw * (0.2 + Math.random() * 0.6);
            const cy = bh * (0.2 + Math.random() * 0.6);
            const bolt: PrismaticBolt = {
              id: expandBoltIdRef.current++,
              x: sx, y: sy,
              startX: sx, startY: sy,
              ctrlX: cx, ctrlY: cy,
              targetX: x, targetY: y,
              t: 0,
              color: Math.random() < 0.5 ? 'blue' : 'green',
              tracking: true,
              vx: 0, vy: 0,
              spawnTime: now,
              alive: true,
            };
            expandBoltsRef.current.push(bolt);
          }

          // Update bolts
          const bolts = expandBoltsRef.current;
          for (let i = bolts.length - 1; i >= 0; i--) {
            const b = bolts[i];
            if (!b.alive) continue;
            if (b.tracking) {
              // Update target to track player
              b.targetX = x;
              b.targetY = y;
              // Advance along bezier
              b.t += EXPAND_BOLT_SPEED * dt * 0.008;
              if (b.t > 1) b.t = 1;
              // Quadratic bezier: B(t) = (1-t)²·start + 2(1-t)t·ctrl + t²·target
              const mt = 1 - b.t;
              b.x = mt * mt * b.startX + 2 * mt * b.t * b.ctrlX + b.t * b.t * b.targetX;
              b.y = mt * mt * b.startY + 2 * mt * b.t * b.ctrlY + b.t * b.t * b.targetY;
              // Check if within tracking cutoff
              const dx = b.x - x;
              const dy = b.y - y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < EXPAND_BOLT_TRACK_CUTOFF) {
                b.tracking = false;
                // Calculate current velocity direction and continue linearly
                const speed = EXPAND_BOLT_SPEED * 2.5;
                const len = dist > 0.1 ? dist : 1;
                b.vx = (dx / len) * -speed; // toward player direction
                b.vy = (dy / len) * -speed;
              }
            } else {
              // Linear movement after tracking lost
              b.x += b.vx * dt;
              b.y += b.vy * dt;
            }
            // Kill if way out of bounds
            if (b.x < -200 || b.x > dw + 200 || b.y < -200 || b.y > dh + 200) {
              b.alive = false;
            }
            // Collision with player
            if (b.alive) {
              const ddx = b.x - x;
              const ddy = b.y - y;
              if (Math.sqrt(ddx * ddx + ddy * ddy) < EXPAND_BOLT_HIT_R + PLAYER_R) {
                b.alive = false;
                applyDamage(EXPAND_BOLT_DAMAGE, EXPAND_BOLT_IFRAMES, 4);
              }
            }
          }
          // Cleanup dead bolts periodically
          if (bolts.length > 50) {
            expandBoltsRef.current = bolts.filter(b => b.alive);
          }
        }

        // ── Wave 2: Ethereal Lance ──
        if (wave === 2) {
          // Clear wave 1 leftovers
          if (expandBoltsRef.current.length > 0) expandBoltsRef.current = [];

          const waveStart = expandStartRef.current + EXPAND_WAVE1_DUR;
          const waveElapsed = now - waveStart;

          // Spawn volleys: 4 volleys of 8 swords (4 blue + 4 green)
          // volleyRef starts at -1 so volleyIdx 0 triggers the first spawn immediately
          const volleyIdx = Math.floor(waveElapsed / EXPAND_SWORD_VOLLEY_INTERVAL);
          if (volleyIdx > expandVolleyRef.current && volleyIdx < 4) {
            expandVolleyRef.current = volleyIdx;
            expandLastVolleyRef.current = now;
            const swords = expandSwordsRef.current;
            for (let j = 0; j < 8; j++) {
              const angle = (j / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
              const spawnDist = Math.max(dw, dh) * 0.6 + 20 + Math.random() * 40;
              const sx = dw / 2 + Math.cos(angle) * spawnDist;
              const sy = dh / 2 + Math.sin(angle) * spawnDist;
              const sword: EtherealSword = {
                id: expandSwordIdRef.current++,
                x: sx, y: sy,
                color: j < 4 ? 'blue' : 'green',
                angle: 0,
                state: 'fadein',
                stateStart: now,
                vx: 0, vy: 0,
                opacity: 0,
                alive: true,
              };
              swords.push(sword);
            }
          }

          // Update swords
          const swords = expandSwordsRef.current;
          for (let i = swords.length - 1; i >= 0; i--) {
            const s = swords[i];
            if (!s.alive) continue;
            const stateAge = now - s.stateStart;
            if (s.state === 'fadein') {
              s.opacity = Math.min(1, stateAge / EXPAND_SWORD_FADEIN_MS);
              // Point generally toward player
              s.angle = Math.atan2(y - s.y, x - s.x) + Math.PI / 2; // +90° since sword points up
              if (stateAge >= EXPAND_SWORD_FADEIN_MS) {
                s.state = 'aiming';
                s.stateStart = now;
              }
            } else if (s.state === 'aiming') {
              // Track player angle with slight jitter
              s.angle = Math.atan2(y - s.y, x - s.x) + Math.PI / 2;
              s.opacity = 1;
              if (stateAge >= EXPAND_SWORD_AIM_MS) {
                s.state = 'firing';
                s.stateStart = now;
                // Fire in the direction sword is pointing
                const fireAngle = s.angle - Math.PI / 2; // convert back from display angle
                s.vx = Math.cos(fireAngle) * EXPAND_SWORD_SPEED;
                s.vy = Math.sin(fireAngle) * EXPAND_SWORD_SPEED;
              }
            } else if (s.state === 'firing') {
              s.x += s.vx * dt;
              s.y += s.vy * dt;
              // Kill if out of bounds — generous margin since swords spawn far outside the box
              if (s.x < -500 || s.x > dw + 500 || s.y < -500 || s.y > dh + 500) {
                s.alive = false;
              }
            }
            // Collision with player
            if (s.alive && s.state === 'firing') {
              const ddx = s.x - x;
              const ddy = s.y - y;
              if (Math.sqrt(ddx * ddx + ddy * ddy) < EXPAND_SWORD_HIT_R + PLAYER_R) {
                s.alive = false;
                applyDamage(EXPAND_SWORD_DAMAGE, EXPAND_SWORD_IFRAMES, 6);
              }
            }
          }
          // Cleanup
          if (swords.length > 40) {
            expandSwordsRef.current = swords.filter(s => s.alive);
          }
        }

        // ── Wave 3: Sun Dance ──
        if (wave === 3) {
          // Clear wave 2 leftovers
          if (expandSwordsRef.current.length > 0) expandSwordsRef.current = [];

          const waveStart = expandStartRef.current + EXPAND_WAVE1_DUR + EXPAND_WAVE2_DUR;
          const waveElapsed = now - waveStart;

          // Init 4 orbs at corners on first entry
          if (expandOrbsRef.current.length === 0) {
            const m = EXPAND_SUN_MARGIN;
            const orbs: SunOrb[] = [
              { id: 0, x: m, y: m, state: 'idle', stateStart: now },
              { id: 1, x: dw - m, y: m, state: 'idle', stateStart: now },
              { id: 2, x: m, y: dh - m, state: 'idle', stateStart: now },
              { id: 3, x: dw - m, y: dh - m, state: 'idle', stateStart: now },
            ];
            expandOrbsRef.current = orbs;
            expandLastSunCycleRef.current = now;
            expandSunCycleRef.current = 0;
            // Pick first 2 to activate
            const shuffled = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
            expandSunPicksRef.current = [shuffled[0], shuffled[1]];
            // Start warning immediately for first cycle
            for (const idx of expandSunPicksRef.current) {
              expandOrbsRef.current[idx].state = 'warning';
              expandOrbsRef.current[idx].stateStart = now;
            }
          }

          const orbs = expandOrbsRef.current;

          // Cycle timer: every EXPAND_SUN_CYCLE, pick 2 new orbs
          const cycleSinceStart = Math.floor(waveElapsed / EXPAND_SUN_CYCLE);
          if (cycleSinceStart > expandSunCycleRef.current) {
            expandSunCycleRef.current = cycleSinceStart;
            expandLastSunCycleRef.current = now;
            // Reset all to idle
            for (const o of orbs) { o.state = 'idle'; o.stateStart = now; }
            // Pick 2 random orbs
            const shuffled = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
            expandSunPicksRef.current = [shuffled[0], shuffled[1]];
            for (const idx of expandSunPicksRef.current) {
              orbs[idx].state = 'warning';
              orbs[idx].stateStart = now;
            }
          }

          // Update orb states
          for (const o of orbs) {
            const stateAge = now - o.stateStart;
            if (o.state === 'warning' && stateAge >= EXPAND_SUN_WARN_MS) {
              o.state = 'shining';
              o.stateStart = now;
            }
            if (o.state === 'shining' && stateAge >= EXPAND_SUN_SHINE_MS) {
              o.state = 'idle';
              o.stateStart = now;
            }
          }

          // Collision: rays from shining orbs (with slow rotation offset)
          for (const o of orbs) {
            if (o.state !== 'shining') continue;
            // Rotation offset: 45° over EXPAND_SUN_SHINE_MS (matches p2-sun-rotate CSS)
            const shineElapsed = now - o.stateStart;
            const rotOffset = (shineElapsed / EXPAND_SUN_SHINE_MS) * (Math.PI / 4);
            for (let r = 0; r < EXPAND_SUN_RAY_COUNT; r++) {
              const rayAngle = (r / EXPAND_SUN_RAY_COUNT) * Math.PI * 2 + rotOffset;
              // Ray is a thin rectangle from orb center outward
              // Check perpendicular distance from player to ray line
              const rdx = Math.cos(rayAngle);
              const rdy = Math.sin(rayAngle);
              const px = x - o.x;
              const py = y - o.y;
              // Project player onto ray direction
              const proj = px * rdx + py * rdy;
              if (proj < 0 || proj > EXPAND_SUN_RAY_LEN) continue;
              // Perpendicular distance
              const perpDist = Math.abs(px * rdy - py * rdx);
              if (perpDist < EXPAND_SUN_RAY_W / 2 + PLAYER_R) {
                applyDamage(EXPAND_SUN_DAMAGE, EXPAND_SUN_IFRAMES, 5);
                break; // only one hit per frame
              }
            }
          }
        }
      }

      // ── ANNOYANCE attack: simultaneous Sun Dance + Ethereal Lance + Clock Beams ──
      if (annoyActiveRef.current) {
        const elapsed = now - annoyStartRef.current;
        const dw = boxDimsRef.current.w;
        const dh = boxDimsRef.current.h;

        // ── Throws disabled during ANNOYANCE — cage is too small, every throw is instant crush ──
        // (periodic throws are skipped; challenge comes from dodging hazards inside the cage)

        // ── Clock Beams: spawn from 12 clock directions ──
        if (now - annoyLastBeamSpawnRef.current >= ANNOY_BEAM_SPAWN_INTERVAL) {
          annoyLastBeamSpawnRef.current = now;
          // Spawn 1-2 beams at random clock positions
          const count = Math.random() < 0.4 ? 2 : 1;
          const usedPositions: number[] = [];
          for (let b = 0; b < count; b++) {
            let pos: number;
            do { pos = Math.floor(Math.random() * ANNOY_CLOCK_POSITIONS); } while (usedPositions.includes(pos));
            usedPositions.push(pos);
            const angle = (pos / ANNOY_CLOCK_POSITIONS) * Math.PI * 2 - Math.PI / 2; // 0=12 o'clock
            annoyBeamsRef.current.push({
              id: annoyBeamIdRef.current++,
              angle,
              state: 'telegraph',
              stateStart: now,
              alive: true,
            });
          }
        }

        // Update clock beams
        const beams = annoyBeamsRef.current;
        for (let i = beams.length - 1; i >= 0; i--) {
          const b = beams[i];
          if (!b.alive) continue;
          const age = now - b.stateStart;
          if (b.state === 'telegraph' && age >= ANNOY_BEAM_TELEGRAPH_MS) {
            b.state = 'firing';
            b.stateStart = now;
            shakeIntensityRef.current = Math.max(shakeIntensityRef.current, 4);
          } else if (b.state === 'firing' && age >= ANNOY_BEAM_FIRE_MS) {
            b.state = 'fading';
            b.stateStart = now;
          } else if (b.state === 'fading' && age >= ANNOY_BEAM_FADE_MS) {
            b.alive = false;
          }
          // Collision: only during 'firing' state
          if (b.alive && b.state === 'firing') {
            // Beam passes through center of box at b.angle
            const cx = dw / 2;
            const cy = dh / 2;
            const bcos = Math.cos(b.angle);
            const bsin = Math.sin(b.angle);
            // Perpendicular distance from player to the beam line through center
            const px = x - cx;
            const py = y - cy;
            const perpDist = Math.abs(px * bsin - py * bcos);
            if (perpDist < ANNOY_BEAM_WIDTH / 2 + PLAYER_R) {
              applyDamage(ANNOY_BEAM_DMG, ANNOY_BEAM_IFRAMES, 5);
            }
          }
        }
        // Cleanup dead beams
        if (beams.length > 30) {
          annoyBeamsRef.current = beams.filter(b => b.alive);
        }

        // ── Ethereal Lance swords (simultaneous with everything else) ──
        const volleyIdx = Math.floor(elapsed / ANNOY_SWORD_VOLLEY_INTERVAL);
        if (volleyIdx > annoyVolleyRef.current) {
          annoyVolleyRef.current = volleyIdx;
          annoyLastVolleyRef.current = now;
          const swords = expandSwordsRef.current;
          for (let j = 0; j < ANNOY_SWORD_COUNT; j++) {
            const sAngle = (j / ANNOY_SWORD_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            const spawnDist = Math.max(dw, dh) * 0.8 + 40 + Math.random() * 60;
            const sx = dw / 2 + Math.cos(sAngle) * spawnDist;
            const sy = dh / 2 + Math.sin(sAngle) * spawnDist;
            const sword: EtherealSword = {
              id: expandSwordIdRef.current++,
              x: sx, y: sy,
              color: j < ANNOY_SWORD_COUNT / 2 ? 'blue' : 'green',
              angle: 0,
              state: 'fadein',
              stateStart: now,
              vx: 0, vy: 0,
              opacity: 0,
              alive: true,
            };
            swords.push(sword);
          }
        }

        // Update swords (same logic as EMPRESS wave 2)
        const swords = expandSwordsRef.current;
        for (let i = swords.length - 1; i >= 0; i--) {
          const s = swords[i];
          if (!s.alive) continue;
          const stateAge = now - s.stateStart;
          if (s.state === 'fadein') {
            s.opacity = Math.min(1, stateAge / EXPAND_SWORD_FADEIN_MS);
            s.angle = Math.atan2(y - s.y, x - s.x) + Math.PI / 2;
            if (stateAge >= EXPAND_SWORD_FADEIN_MS) {
              s.state = 'aiming';
              s.stateStart = now;
            }
          } else if (s.state === 'aiming') {
            s.angle = Math.atan2(y - s.y, x - s.x) + Math.PI / 2;
            s.opacity = 1;
            if (stateAge >= EXPAND_SWORD_AIM_MS) {
              s.state = 'firing';
              s.stateStart = now;
              const fireAngle = s.angle - Math.PI / 2;
              s.vx = Math.cos(fireAngle) * EXPAND_SWORD_SPEED;
              s.vy = Math.sin(fireAngle) * EXPAND_SWORD_SPEED;
            }
          } else if (s.state === 'firing') {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            if (s.x < -500 || s.x > dw + 500 || s.y < -500 || s.y > dh + 500) {
              s.alive = false;
            }
          }
          if (s.alive && s.state === 'firing') {
            const ddx = s.x - x;
            const ddy = s.y - y;
            if (Math.sqrt(ddx * ddx + ddy * ddy) < EXPAND_SWORD_HIT_R + PLAYER_R) {
              s.alive = false;
              applyDamage(ANNOY_SWORD_DMG, EXPAND_SWORD_IFRAMES, 6);
            }
          }
        }
        if (swords.length > 40) {
          expandSwordsRef.current = swords.filter(s => s.alive);
        }

        // ── Sun Dance orbs (simultaneous) ──
        // Init 4 orbs at corners on first entry
        if (expandOrbsRef.current.length === 0) {
          const m = EXPAND_SUN_MARGIN;
          const orbs: SunOrb[] = [
            { id: 0, x: m, y: m, state: 'idle', stateStart: now },
            { id: 1, x: dw - m, y: m, state: 'idle', stateStart: now },
            { id: 2, x: m, y: dh - m, state: 'idle', stateStart: now },
            { id: 3, x: dw - m, y: dh - m, state: 'idle', stateStart: now },
          ];
          expandOrbsRef.current = orbs;
          annoyLastSunCycleRef.current = now;
          annoySunCycleRef.current = 0;
          const shuffled = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
          annoySunPicksRef.current = [shuffled[0], shuffled[1]];
          for (const idx of annoySunPicksRef.current) {
            expandOrbsRef.current[idx].state = 'warning';
            expandOrbsRef.current[idx].stateStart = now;
          }
        }

        const orbs = expandOrbsRef.current;
        // Faster cycle for annoyance
        const cycleSinceStart = Math.floor(elapsed / ANNOY_SUN_CYCLE);
        if (cycleSinceStart > annoySunCycleRef.current) {
          annoySunCycleRef.current = cycleSinceStart;
          annoyLastSunCycleRef.current = now;
          for (const o of orbs) { o.state = 'idle'; o.stateStart = now; }
          const shuffled = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
          annoySunPicksRef.current = [shuffled[0], shuffled[1]];
          for (const idx of annoySunPicksRef.current) {
            orbs[idx].state = 'warning';
            orbs[idx].stateStart = now;
          }
        }

        // Update orb states
        for (const o of orbs) {
          const stateAge = now - o.stateStart;
          if (o.state === 'warning' && stateAge >= EXPAND_SUN_WARN_MS) {
            o.state = 'shining';
            o.stateStart = now;
          }
          if (o.state === 'shining' && stateAge >= EXPAND_SUN_SHINE_MS) {
            o.state = 'idle';
            o.stateStart = now;
          }
        }

        // Collision: rays from shining orbs
        for (const o of orbs) {
          if (o.state !== 'shining') continue;
          const shineElapsed = now - o.stateStart;
          const rotOffset = (shineElapsed / EXPAND_SUN_SHINE_MS) * (Math.PI / 4);
          for (let r = 0; r < EXPAND_SUN_RAY_COUNT; r++) {
            const rayAngle = (r / EXPAND_SUN_RAY_COUNT) * Math.PI * 2 + rotOffset;
            const rdx = Math.cos(rayAngle);
            const rdy = Math.sin(rayAngle);
            const rpx = x - o.x;
            const rpy = y - o.y;
            const proj = rpx * rdx + rpy * rdy;
            if (proj < 0 || proj > EXPAND_SUN_RAY_LEN) continue;
            const perpDist = Math.abs(rpx * rdy - rpy * rdx);
            if (perpDist < EXPAND_SUN_RAY_W / 2 + PLAYER_R) {
              applyDamage(ANNOY_SUN_DMG, EXPAND_SUN_IFRAMES, 5);
              break;
            }
          }
        }
      }

      // ── FRUSTRATION attack: 60s endurance, cycles box sizes, all damage halved ──
      if (frustActiveRef.current) {
        const elapsed = now - frustStartRef.current;
        const dw = boxDimsRef.current.w;
        const dh = boxDimsRef.current.h;
        const frustDmg = (base: number) => Math.round(base * FRUST_DAMAGE_MULT);

        // ── MGB finale at 50s — skip all other attacks ──
        if (elapsed >= FRUST_MGB_START) {
          if (!frustMgbWarningRef.current && !frustMgbFiringRef.current) {
            // Start MGB warning — stop all other attacks
            frustMgbWarningRef.current = true;
            frustSafeZoneRef.current = null;
            // Clear all ongoing hazards
            annoyBeamsRef.current = [];
            expandBoltsRef.current = [];
            expandSwordsRef.current = [];
            throwVelRef.current = { vx: 0, vy: 0 };
            // Snap box to narrow for MGB
            setBoxW(MIN_W);
            setBoxH(BASE_H);
            shakeIntensityRef.current = Math.max(shakeIntensityRef.current, 8);
          }
          if (frustMgbWarningRef.current && elapsed >= FRUST_MGB_START + FRUST_MGB_WARN_MS) {
            // Fire MGB
            frustMgbWarningRef.current = false;
            frustMgbFiringRef.current = true;
            setMgBeamCharging(false);
            setMgBeamActive(true);
            mgBeamActiveRef.current = true;
            mgBeamHitRef.current = false;
            mgBeamStartRef.current = now;
            setMgBeamDissipating(false);
            // Start dissipation 500ms before end
            const remainingBeamTime = FRUST_DURATION - elapsed - 500;
            if (remainingBeamTime > 0) {
              mgBeamDissipateTimerRef.current = setTimeout(() => {
                setMgBeamDissipating(true);
              }, remainingBeamTime);
            }
          }
        } else {
          // ── Box size cycling every 5s ──
          const boxCycleIdx = Math.floor(elapsed / FRUST_BOX_CYCLE) % FRUST_BOX_SIZES.length;
          if (boxCycleIdx !== frustBoxCycleRef.current) {
            frustBoxCycleRef.current = boxCycleIdx;
            const newSize = FRUST_BOX_SIZES[boxCycleIdx];
            setBoxW(newSize.w);
            setBoxH(newSize.h);
            boxLerpRef.current = {
              fromW: interpDimsRef.current.w, fromH: interpDimsRef.current.h,
              toW: newSize.w, toH: newSize.h,
              startTime: now, duration: BOX_TRANSITION_MS,
            };
          }

          // ── Throws every 4s ──
          if (now - frustLastThrowRef.current >= FRUST_THROW_INTERVAL) {
            frustLastThrowRef.current = now;
            const dirs = [
              { vx: -THROW_SPEED, vy: 0 }, { vx: THROW_SPEED, vy: 0 },
              { vx: 0, vy: -THROW_SPEED }, { vx: 0, vy: THROW_SPEED },
            ];
            const pick = dirs[Math.floor(Math.random() * dirs.length)];
            throwVelRef.current = { vx: pick.vx, vy: pick.vy };
            throwWallHitRef.current = false;
          }

          // ── Clockwork beams every 3s ─
          if (now - frustLastBeamRef.current >= FRUST_BEAM_INTERVAL) {
            frustLastBeamRef.current = now;
            const count = Math.random() < 0.3 ? 2 : 1;
            const usedPositions: number[] = [];
            for (let b = 0; b < count; b++) {
              let pos: number;
              do { pos = Math.floor(Math.random() * ANNOY_CLOCK_POSITIONS); } while (usedPositions.includes(pos));
              usedPositions.push(pos);
              const angle = (pos / ANNOY_CLOCK_POSITIONS) * Math.PI * 2 - Math.PI / 2;
              annoyBeamsRef.current.push({
                id: annoyBeamIdRef.current++,
                angle,
                state: 'telegraph',
                stateStart: now,
                alive: true,
              });
            }
          }

          // Update clock beams (same logic as annoyance)
          const beams = annoyBeamsRef.current;
          for (let i = beams.length - 1; i >= 0; i--) {
            const b = beams[i];
            if (!b.alive) continue;
            const age = now - b.stateStart;
            if (b.state === 'telegraph' && age >= ANNOY_BEAM_TELEGRAPH_MS) {
              b.state = 'firing'; b.stateStart = now;
              shakeIntensityRef.current = Math.max(shakeIntensityRef.current, 3);
            } else if (b.state === 'firing' && age >= ANNOY_BEAM_FIRE_MS) {
              b.state = 'fading'; b.stateStart = now;
            } else if (b.state === 'fading' && age >= ANNOY_BEAM_FADE_MS) {
              b.alive = false;
            }
            if (b.alive && b.state === 'firing') {
              const cx2 = dw / 2, cy2 = dh / 2;
              const bcos = Math.cos(b.angle), bsin = Math.sin(b.angle);
              const px2 = x - cx2, py2 = y - cy2;
              const perpDist = Math.abs(px2 * bsin - py2 * bcos);
              if (perpDist < ANNOY_BEAM_WIDTH / 2 + PLAYER_R) {
                applyDamage(frustDmg(ANNOY_BEAM_DAMAGE), ANNOY_BEAM_IFRAMES, 4);
              }
            }
          }
          if (beams.length > 30) annoyBeamsRef.current = beams.filter(b => b.alive);

          // ── Ethereal Lance swords every 6s ──
          const swordVolleyIdx = Math.floor(elapsed / FRUST_SWORD_INTERVAL);
          if (swordVolleyIdx > frustSwordVolleyRef.current) {
            frustSwordVolleyRef.current = swordVolleyIdx;
            const swordCount = 4;
            for (let j = 0; j < swordCount; j++) {
              const sAngle = (j / swordCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
              const spawnDist = Math.max(dw, dh) * 0.8 + 60 + Math.random() * 60;
              const sx = dw / 2 + Math.cos(sAngle) * spawnDist;
              const sy = dh / 2 + Math.sin(sAngle) * spawnDist;
              expandSwordsRef.current.push({
                id: expandSwordIdRef.current++,
                x: sx, y: sy,
                color: j < swordCount / 2 ? 'blue' : 'green',
                angle: 0, state: 'fadein', stateStart: now,
                vx: 0, vy: 0, opacity: 0, alive: true,
              });
            }
          }

          // Update swords
          const swords = expandSwordsRef.current;
          for (let i = swords.length - 1; i >= 0; i--) {
            const s = swords[i];
            if (!s.alive) continue;
            const stateAge = now - s.stateStart;
            if (s.state === 'fadein') {
              s.opacity = Math.min(1, stateAge / EXPAND_SWORD_FADEIN_MS);
              s.angle = Math.atan2(y - s.y, x - s.x) + Math.PI / 2;
              if (stateAge >= EXPAND_SWORD_FADEIN_MS) { s.state = 'aiming'; s.stateStart = now; }
            } else if (s.state === 'aiming') {
              s.angle = Math.atan2(y - s.y, x - s.x) + Math.PI / 2;
              s.opacity = 1;
              if (stateAge >= EXPAND_SWORD_AIM_MS) {
                s.state = 'firing'; s.stateStart = now;
                const fireAngle = s.angle - Math.PI / 2;
                s.vx = Math.cos(fireAngle) * EXPAND_SWORD_SPEED;
                s.vy = Math.sin(fireAngle) * EXPAND_SWORD_SPEED;
              }
            } else if (s.state === 'firing') {
              s.x += s.vx * dt; s.y += s.vy * dt;
              if (s.x < -500 || s.x > dw + 500 || s.y < -500 || s.y > dh + 500) s.alive = false;
            }
            if (s.alive && s.state === 'firing') {
              const ddx = s.x - x, ddy = s.y - y;
              if (Math.sqrt(ddx * ddx + ddy * ddy) < EXPAND_SWORD_HIT_R + PLAYER_R) {
                s.alive = false;
                applyDamage(frustDmg(EXPAND_SWORD_DAMAGE), EXPAND_SWORD_IFRAMES, 5);
              }
            }
          }
          if (swords.length > 40) expandSwordsRef.current = swords.filter(s => s.alive);

          // ── Prismatic Bolts after 30s — 1 per second ──
          if (elapsed >= FRUST_BOLT_START && now - frustLastBoltRef.current >= FRUST_BOLT_INTERVAL) {
            frustLastBoltRef.current = now;
            // Spawn from random edge, aimed toward player
            const edge = Math.floor(Math.random() * 4);
            let bx: number, by: number;
            if (edge === 0) { bx = -20; by = Math.random() * dh; }
            else if (edge === 1) { bx = dw + 20; by = Math.random() * dh; }
            else if (edge === 2) { bx = Math.random() * dw; by = -20; }
            else { bx = Math.random() * dw; by = dh + 20; }
            const angle = Math.atan2(y - by, x - bx);
            const ctrlDist = 80 + Math.random() * 60;
            expandBoltsRef.current.push({
              id: expandBoltIdRef.current++,
              x: bx, y: by, startX: bx, startY: by,
              ctrlX: bx + Math.cos(angle + (Math.random() - 0.5) * 1.2) * ctrlDist,
              ctrlY: by + Math.sin(angle + (Math.random() - 0.5) * 1.2) * ctrlDist,
              targetX: x, targetY: y,
              t: 0, color: Math.random() > 0.5 ? 'blue' : 'green',
              tracking: true, vx: 0, vy: 0,
              spawnTime: now, alive: true,
            });
          }

          // Update bolts
          const bolts = expandBoltsRef.current;
          for (let i = bolts.length - 1; i >= 0; i--) {
            const b = bolts[i];
            if (!b.alive) continue;
            if (b.tracking) {
              b.t = Math.min(1, b.t + EXPAND_BOLT_SPEED * dt * 0.001);
              const dist = Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2);
              if (dist > EXPAND_BOLT_TRACK_CUTOFF) {
                b.targetX = x; b.targetY = y;
              }
              const it = 1 - b.t;
              b.x = it * it * b.startX + 2 * it * b.t * b.ctrlX + b.t * b.t * b.targetX;
              b.y = it * it * b.startY + 2 * it * b.t * b.ctrlY + b.t * b.t * b.targetY;
              if (b.t >= 1) {
                b.tracking = false;
                const ang = Math.atan2(b.targetY - b.ctrlY, b.targetX - b.ctrlX);
                b.vx = Math.cos(ang) * EXPAND_BOLT_SPEED * 120;
                b.vy = Math.sin(ang) * EXPAND_BOLT_SPEED * 120;
              }
            } else {
              b.x += b.vx * dt * 0.001;
              b.y += b.vy * dt * 0.001;
            }
            if (b.x < -100 || b.x > dw + 100 || b.y < -100 || b.y > dh + 100) {
              b.alive = false; continue;
            }
            const ddx = b.x - x, ddy = b.y - y;
            if (Math.sqrt(ddx * ddx + ddy * ddy) < EXPAND_BOLT_HIT_R + PLAYER_R) {
              b.alive = false;
              applyDamage(frustDmg(EXPAND_BOLT_DAMAGE), EXPAND_BOLT_IFRAMES, 4);
            }
          }
          if (bolts.length > 20) expandBoltsRef.current = bolts.filter(b => b.alive);

          // ── Safe zone every 10s (warning 3s before, heavy damage if not there) ──
          const nextCheckTime = frustLastSafeRef.current + FRUST_SAFE_ZONE_INTERVAL;
          const timeUntilCheck = nextCheckTime - now;
          if (timeUntilCheck <= FRUST_SAFE_ZONE_WARN_MS && timeUntilCheck > 0) {
            if (!frustSafeZoneRef.current) {
              const szX = FRUST_SAFE_ZONE_SIZE / 2 + Math.random() * Math.max(10, dw - FRUST_SAFE_ZONE_SIZE);
              const szY = FRUST_SAFE_ZONE_SIZE / 2 + Math.random() * Math.max(10, dh - FRUST_SAFE_ZONE_SIZE);
              const labels = ["SAFE", "HERE", "MOVE", "GO!", "RUN!"];
              frustSafeZoneRef.current = {
                x: szX, y: szY,
                label: labels[Math.floor(Math.random() * labels.length)],
                active: false, warning: true,
                checkTime: nextCheckTime,
              };
            }
          }
          // Check if safe zone timer expired
          if (frustSafeZoneRef.current && frustSafeZoneRef.current.warning) {
            if (now >= frustSafeZoneRef.current.checkTime) {
              frustSafeZoneRef.current.active = true;
              frustSafeZoneRef.current.warning = false;
              const sz = frustSafeZoneRef.current;
              const dx2 = x - sz.x, dy2 = y - sz.y;
              const inZone = Math.abs(dx2) < FRUST_SAFE_ZONE_SIZE / 2 && Math.abs(dy2) < FRUST_SAFE_ZONE_SIZE / 2;
              if (!inZone) {
                applyDamage(frustDmg(FRUST_SAFE_ZONE_DAMAGE), 1000, 10);
                shakeIntensityRef.current = Math.max(shakeIntensityRef.current, 12);
              }
              frustLastSafeRef.current = now;
              // Clear safe zone after a brief flash
              setTimeout(() => { frustSafeZoneRef.current = null; }, 500);
            }
          }
        }
      }

      // ── Screen shake decay ──
      const si = shakeIntensityRef.current;
      if (si > SHAKE_MIN) {
        const angle = Math.random() * Math.PI * 2;
        setShakeOffset({
          x: Math.cos(angle) * si,
          y: Math.sin(angle) * si,
        });
        shakeIntensityRef.current = si * SHAKE_DECAY;
      } else if (si > 0) {
        shakeIntensityRef.current = 0;
        setShakeOffset({ x: 0, y: 0 });
      }

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // ── Attack runner ──
  const runAttack = useCallback((name: string) => {
    const pattern = ATTACK_PATTERNS[name];
    if (!pattern) { console.warn("[Phase2] Unknown attack:", name); return; }
    console.log("[Phase2] Running attack:", name, "steps:", pattern.length);
    if (attackTimeoutRef.current) { clearTimeout(attackTimeoutRef.current); attackTimeoutRef.current = undefined; }
    if (stageTimeoutRef.current) { clearTimeout(stageTimeoutRef.current); stageTimeoutRef.current = undefined; }
    setIsAttacking(true);
    setCurrentAttack(name);
    let step = 0;

    const applyThrow = () => {
      const dirs = [
        { vx: -THROW_SPEED, vy: 0 },  // left
        { vx: THROW_SPEED,  vy: 0 },  // right
        { vx: 0, vy: -THROW_SPEED },  // up
        { vx: 0, vy: THROW_SPEED },   // down
      ];
      const pick = dirs[Math.floor(Math.random() * dirs.length)];
      throwVelRef.current = { vx: pick.vx, vy: pick.vy };
      throwWallHitRef.current = false;
    };

    const next = () => {
      if (step >= pattern.length) {
        console.log("[Phase2] Attack complete, cleaning up");
        setIsAttacking(false);
        setCurrentAttack("idle");
        setStageVisible(false);
        setMgBeamActive(false);
        mgBeamActiveRef.current = false;
        setMgBeamCharging(false);
        setMgBeamDissipating(false);
        if (mgBeamDissipateTimerRef.current) { clearTimeout(mgBeamDissipateTimerRef.current); mgBeamDissipateTimerRef.current = null; }
        setExpandActive(false);
        expandActiveRef.current = false;
        expandBoltsRef.current = [];
        expandSwordsRef.current = [];
        expandOrbsRef.current = [];
        expandWaveRef.current = 0;
        setAnnoyActive(false);
        annoyActiveRef.current = false;
        annoyBeamsRef.current = [];
        setFrustActive(false);
        frustActiveRef.current = false;
        frustSafeZoneRef.current = null;
        frustMgbWarningRef.current = false;
        frustMgbFiringRef.current = false;
        // Reset box to default size before returning to player menu
        setBoxW(BASE_W);
        setBoxH(BASE_H);
        autoStartedRef.current = false;
        onAttackComplete?.();
        return;
      }
      const s = pattern[step];
      const isFirst = step === 0;
      step++;

      // Phase 1: Resize the box
      setBoxW(s.w);
      setBoxH(s.h);

      // Helper: activate hazards for this step
      const activateHazards = () => {
        if (s.isStage) {
          stageTimeoutRef.current = setTimeout(() => setStageVisible(true), 150);
        } else {
          setStageVisible(false);
        }
        // Clean up beam state when moving to a non-beam step
        if (!s.isMgBeam) {
          setMgBeamActive(false);
          mgBeamActiveRef.current = false;
          setMgBeamCharging(false);
          setMgBeamDissipating(false);
          if (mgBeamDissipateTimerRef.current) { clearTimeout(mgBeamDissipateTimerRef.current); mgBeamDissipateTimerRef.current = null; }
        }
        // Clean up frustration state when moving to a non-frustration step
        if (!s.isFrustration) {
          setFrustActive(false);
          frustActiveRef.current = false;
          frustSafeZoneRef.current = null;
          frustMgbWarningRef.current = false;
          frustMgbFiringRef.current = false;
        }
        // Clean up expand state when moving to a non-expand step
        if (!s.isExpand && !s.isAnnoyance && !s.isFrustration) {
          setExpandActive(false);
          expandActiveRef.current = false;
          expandBoltsRef.current = [];
          expandSwordsRef.current = [];
          expandOrbsRef.current = [];
          expandWaveRef.current = 0;
        }
        // Clean up annoyance state when moving to a non-annoyance/frustration step
        if (!s.isAnnoyance && !s.isFrustration) {
          setAnnoyActive(false);
          annoyActiveRef.current = false;
          annoyBeamsRef.current = [];
        }
        if (s.isMgBeam) {
          // MGB: cinematic charge-up, then beam fires
          setMgBeamCharging(true);
          setMgBeamDissipating(false);
          mgBeamHitRef.current = false;
          mgBeamStartRef.current = performance.now();
          stageTimeoutRef.current = setTimeout(() => {
            setMgBeamCharging(false);
            setMgBeamActive(true);
            mgBeamActiveRef.current = true;
            mgBeamStartRef.current = performance.now();
            // Start dissipation 500ms before beam ends
            mgBeamDissipateTimerRef.current = setTimeout(() => {
              setMgBeamDissipating(true);
            }, MGB_BEAM_DURATION - 500);
          }, MGB_CHARGE_MS);
        }
        if (s.isExpand) {
          const now = performance.now();
          expandStartRef.current = now;
          expandWaveRef.current = 1;
          expandLastThrowRef.current = now;
          expandLastBoltSpawnRef.current = now;
          expandBoltsRef.current = [];
          expandSwordsRef.current = [];
          expandOrbsRef.current = [];
          expandVolleyRef.current = -1;
          expandLastVolleyRef.current = 0;
          expandSunCycleRef.current = 0;
          expandLastSunCycleRef.current = 0;
          expandSunPicksRef.current = [];
          expandBoltIdRef.current = 0;
          expandSwordIdRef.current = 0;
          setExpandActive(true);
          expandActiveRef.current = true;
        }
        if (s.isAnnoyance) {
          const now = performance.now();
          console.log("[Phase2] ANNOYANCE hazards activating, box:", boxDimsRef.current.w, "x", boxDimsRef.current.h);
          annoyStartRef.current = now;
          annoyLastThrowRef.current = now;
          annoyLastBeamSpawnRef.current = now;
          annoyBeamsRef.current = [];
          annoyBeamIdRef.current = 0;
          annoyVolleyRef.current = -1;
          annoyLastVolleyRef.current = 0;
          annoySunCycleRef.current = 0;
          annoyLastSunCycleRef.current = 0;
          annoySunPicksRef.current = [];
          // Reuse expand entity arrays for swords & orbs
          expandSwordsRef.current = [];
          expandOrbsRef.current = [];
          expandSwordIdRef.current = 0;
          // Snap player to center of the cage
          const cx = boxDimsRef.current.w / 2;
          const cy = boxDimsRef.current.h / 2;
          playerPos.current = { x: cx, y: cy };
          setPlayerRender({ x: cx, y: cy });
          // Kill any throw velocity
          throwVelRef.current = { vx: 0, vy: 0 };
          setAnnoyActive(true);
          annoyActiveRef.current = true;
        }
        if (s.isFrustration) {
          const now = performance.now();
          console.log("[Phase2] FRUSTRATION hazards activating — 60s endurance, all damage halved");
          // Ensure annoyance rendering is off (frustration reuses annoyBeamsRef)
          setAnnoyActive(false);
          annoyActiveRef.current = false;
          frustStartRef.current = now;
          frustLastThrowRef.current = now;
          frustLastBeamRef.current = now;
          frustLastSwordRef.current = now;
          frustLastBoltRef.current = now;
          frustLastSafeRef.current = now;
          frustBoxCycleRef.current = 0;
          frustSafeZoneRef.current = null;
          frustMgbWarningRef.current = false;
          frustMgbFiringRef.current = false;
          frustSwordVolleyRef.current = -1;
          // Clear reused entity arrays
          annoyBeamsRef.current = [];
          annoyBeamIdRef.current = 0;
          expandBoltsRef.current = [];
          expandSwordsRef.current = [];
          expandBoltIdRef.current = 0;
          expandSwordIdRef.current = 0;
          setFrustActive(true);
          frustActiveRef.current = true;
        }
      };

      if (isFirst) {
        // Phase 2: After box transition completes, fling the player
        attackTimeoutRef.current = setTimeout(() => {
          applyThrow();
          // Phase 3: Wait for throw to settle, then activate hazards
          attackTimeoutRef.current = setTimeout(() => {
            activateHazards();
            // Phase 4: Attack runs for its duration, then next step
            attackTimeoutRef.current = setTimeout(next, s.duration);
          }, THROW_SETTLE_MS);
        }, BOX_TRANSITION_MS);
      } else {
        // Subsequent steps: no throw, normal timing
        activateHazards();
        attackTimeoutRef.current = setTimeout(next, s.duration + BOX_TRANSITION_MS);
      }
    };
    next();
  }, []);

  // ── Keep loopingAttackRef in sync ──
  useEffect(() => { loopingAttackRef.current = loopingAttack; }, [loopingAttack]);

  // ── Re-loop: when attack finishes and a loop target is set, re-fire after a brief gap ──
  useEffect(() => {
    if (!isAttacking && loopingAttack) {
      const gap = setTimeout(() => {
        if (loopingAttackRef.current) {
          runAttack(loopingAttackRef.current);
        }
      }, 600);
      return () => clearTimeout(gap);
    }
  }, [isAttacking, loopingAttack, runAttack]);

  // ── Notify parent of debug state changes ──
  useEffect(() => {
    onDebugStateChange?.({ isAttacking, currentAttack, demoMode, loopingAttack });
  }, [isAttacking, currentAttack, demoMode, loopingAttack, onDebugStateChange]);

  // ── Expose imperative handle for parent debug controls ──
  const handleResetToIdle = useCallback(() => {
    if (attackTimeoutRef.current) clearTimeout(attackTimeoutRef.current);
    if (stageTimeoutRef.current) clearTimeout(stageTimeoutRef.current);
    if (mgBeamDissipateTimerRef.current) { clearTimeout(mgBeamDissipateTimerRef.current); mgBeamDissipateTimerRef.current = null; }
    setIsAttacking(false);
    setCurrentAttack("idle");
    setStageVisible(false);
    setMgBeamActive(false);
    mgBeamActiveRef.current = false;
    setMgBeamCharging(false);
    setMgBeamDissipating(false);
    setExpandActive(false);
    expandActiveRef.current = false;
    expandBoltsRef.current = [];
    expandSwordsRef.current = [];
    expandOrbsRef.current = [];
    expandWaveRef.current = 0;
    setAnnoyActive(false);
    annoyActiveRef.current = false;
    annoyBeamsRef.current = [];
    setFrustActive(false);
    frustActiveRef.current = false;
    frustSafeZoneRef.current = null;
    frustMgbWarningRef.current = false;
    frustMgbFiringRef.current = false;
    setBoxW(BASE_W);
    setBoxH(BASE_H);
    autoStartedRef.current = false;
  }, []);

  useImperativeHandle(ref, () => ({
    runAttack,
    setDemoMode: (v: boolean) => {
      setDemoMode(v);
      if (!v) {
        handleResetToIdle();
      }
    },
    setLoopingAttack: (name: string | null) => {
      setLoopingAttack(name);
      loopingAttackRef.current = name;
      if (name) {
        runAttack(name);
      } else {
        handleResetToIdle();
      }
    },
    resetToIdle: handleResetToIdle,
    getAttackNames: () => ATTACK_NAMES,
  }), [runAttack, handleResetToIdle]);

  // ── Demo auto-cycle ──
  useEffect(() => {
    if (!demoMode) return;
    let idx = 0, cancelled = false;
    const cycle = () => {
      if (cancelled) return;
      const n = ATTACK_NAMES[idx % ATTACK_NAMES.length];
      const dur = ATTACK_PATTERNS[n].reduce((s, t) => s + t.duration + BOX_TRANSITION_MS, 0);
      runAttack(n);
      idx++;
      attackTimeoutRef.current = setTimeout(cycle, dur + 1500);
    };
    attackTimeoutRef.current = setTimeout(cycle, 1500);
    return () => { cancelled = true; if (attackTimeoutRef.current) clearTimeout(attackTimeoutRef.current); if (stageTimeoutRef.current) clearTimeout(stageTimeoutRef.current); };
  }, [demoMode, runAttack]);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (attackTimeoutRef.current) {
        window.clearTimeout(attackTimeoutRef.current);
        attackTimeoutRef.current = undefined;
      }
      if (stageTimeoutRef.current) {
        window.clearTimeout(stageTimeoutRef.current);
        stageTimeoutRef.current = undefined;
      }
      if (mgBeamDissipateTimerRef.current) {
        window.clearTimeout(mgBeamDissipateTimerRef.current);
        mgBeamDissipateTimerRef.current = null;
      }
      autoStartedRef.current = false;
    };
  }, []);

  const safeRenderBoxDims = renderBoxDims ?? { w: BASE_W, h: BASE_H };

  const bossHpPct = (bossHp / bossMaxHp) * 100;
  const playerHpPct = (playerHp / playerMaxHp) * 100;

  // ── MGB beam JSX helper (shared between both render modes) ──
  const renderMgbCharge = () => mgBeamCharging ? (
    <div className="absolute pointer-events-none" style={{
      left: -MGB_OVERFLOW, right: -MGB_OVERFLOW,
      top: -MGB_VERT_EXTEND, bottom: -MGB_VERT_EXTEND,
      zIndex: 6, overflow: "visible",
    }}>
      {/* Targeting glow column — drops from top */}
      <div style={{
        position: "absolute",
        left: MGB_OVERFLOW - 4, right: MGB_OVERFLOW - 4,
        top: 0, bottom: 0,
        background: `linear-gradient(0deg, ${L.teal}00 0%, ${L.teal}33 10%, ${L.green}55 30%, ${L.teal}66 50%, ${L.green}55 70%, ${L.teal}33 90%, ${L.teal}00 100%)`,
        animation: `p2-mgb-charge-glow ${MGB_CHARGE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
      }} />
      {/* Thin core line — drops from top, widens */}
      <div style={{
        position: "absolute",
        left: "50%", top: 0, bottom: 0,
        transform: "translateX(-50%)",
        background: `linear-gradient(0deg, transparent 0%, #ffffffaa 5%, ${L.teal} 20%, #ffffffcc 50%, ${L.teal} 80%, #ffffffaa 95%, transparent 100%)`,
        animation: `p2-mgb-charge-core ${MGB_CHARGE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
      }} />
      {/* Left edge converging — with shimmer */}
      <div style={{
        position: "absolute", left: MGB_OVERFLOW,
        top: MGB_VERT_EXTEND - 10, bottom: MGB_VERT_EXTEND - 10,
        width: 3,
        background: `linear-gradient(180deg, ${L.green}00, ${L.green}ff 15%, ${L.teal}ff 50%, ${L.green}ff 85%, ${L.green}00)`,
        boxShadow: `0 0 10px ${L.green}cc, 0 0 20px ${L.teal}66, -4px 0 12px ${L.green}44`,
        animation: `p2-mgb-edge-left ${MGB_CHARGE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards, p2-mgb-charge-shimmer 0.4s ease-in-out infinite`,
      }} />
      {/* Right edge converging — with shimmer */}
      <div style={{
        position: "absolute", right: MGB_OVERFLOW,
        top: MGB_VERT_EXTEND - 10, bottom: MGB_VERT_EXTEND - 10,
        width: 3,
        background: `linear-gradient(180deg, ${L.teal}00, ${L.teal}ff 15%, ${L.green}ff 50%, ${L.teal}ff 85%, ${L.teal}00)`,
        boxShadow: `0 0 10px ${L.teal}cc, 0 0 20px ${L.green}66, 4px 0 12px ${L.teal}44`,
        animation: `p2-mgb-edge-right ${MGB_CHARGE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards, p2-mgb-charge-shimmer 0.4s ease-in-out infinite 0.2s`,
      }} />
      {/* Full-screen flash at moment of firing — dramatic double pulse */}
      <div style={{
        position: "absolute", left: -60, right: -60,
        top: 0, bottom: 0,
        background: `linear-gradient(0deg, transparent 0%, ${L.teal}66 10%, #ffffffaa 30%, #ffffffdd 50%, #ffffffaa 70%, ${L.teal}66 90%, transparent 100%)`,
        animation: `p2-mgb-charge-flash ${MGB_CHARGE_MS}ms ease forwards`,
        pointerEvents: "none",
      }} />
      {/* Secondary radial flash centered on box area */}
      <div style={{
        position: "absolute", left: -40, right: -40,
        top: MGB_VERT_EXTEND - 80, bottom: MGB_VERT_EXTEND - 80,
        background: `radial-gradient(ellipse at 50% 50%, #ffffffee 0%, ${L.teal}88 25%, ${L.green}44 50%, transparent 75%)`,
        animation: `p2-mgb-charge-flash ${MGB_CHARGE_MS}ms ease ${MGB_CHARGE_MS * 0.03}ms forwards`,
        pointerEvents: "none",
      }} />
    </div>
  ) : null;

  const renderMgbBeam = () => mgBeamActive ? (
    <div className="absolute pointer-events-none" style={{
      left: -MGB_OVERFLOW, right: -MGB_OVERFLOW,
      top: -MGB_VERT_EXTEND, bottom: -MGB_VERT_EXTEND,
      zIndex: 6, overflow: "visible",
      opacity: mgBeamDissipating ? 0 : 1,
      filter: mgBeamDissipating ? "blur(8px)" : "none",
      transform: mgBeamDissipating ? "scaleX(0.15)" : undefined,
      transition: mgBeamDissipating ? "opacity 500ms ease-in, filter 500ms ease-in, transform 500ms ease-in" : "none",
    }}>
    <div style={{ position: "absolute", inset: 0, overflow: "visible",
      animation: "p2-mgb-appear 900ms cubic-bezier(0.22, 0.9, 0.36, 1) forwards",
    }}>
      {/* Wide outer halo */}
      <div style={{
        position: "absolute", left: -20, right: -20, top: 0, bottom: 0,
        background: `linear-gradient(0deg, transparent 0%, ${L.teal}22 5%, ${L.green}18 20%, ${L.teal}22 50%, ${L.green}18 80%, ${L.teal}22 95%, transparent 100%)`,
        animation: "p2-mgb-overflow-pulse 2s ease-in-out infinite",
      }} />
      {/* Beam body — full-height column */}
      <div style={{
        position: "absolute",
        left: MGB_OVERFLOW - 15, right: MGB_OVERFLOW - 15,
        top: 0, bottom: 0,
        background: `linear-gradient(0deg,
          ${L.teal}44 0%, ${L.green}bb 4%, ${L.teal}cc 12%,
          #00ffccbb 25%, ${L.green}cc 40%, ${L.teal}dd 50%,
          ${L.green}cc 60%, #00ffccbb 75%,
          ${L.teal}cc 88%, ${L.green}bb 96%, ${L.teal}44 100%)`,
        boxShadow: `0 0 20px ${L.teal}99, 0 0 40px ${L.green}55, 0 0 80px ${L.teal}33, 0 0 120px #00ffcc15, inset 0 0 20px ${L.green}44`,
        animation: "p2-mgb-fire 1.4s ease-in-out infinite",
      }}>
        {/* Downward energy sweep */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `repeating-linear-gradient(180deg,
            transparent 0px, ${L.teal}28 6px, transparent 12px,
            #00ffcc22 18px, transparent 24px,
            ${L.green}28 30px, transparent 36px)`,
          backgroundSize: "100% 72px",
          animation: "p2-mgb-sweep 0.45s linear infinite",
        }} />
        {/* Energy rings scrolling down */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `repeating-linear-gradient(0deg,
            transparent 0px, transparent 14px,
            #ffffff1a 14px, #ffffff2a 16px, #ffffff1a 18px,
            transparent 18px, transparent 44px)`,
          backgroundSize: "100% 62px",
          animation: "p2-mgb-rings 0.9s linear infinite",
        }} />
        {/* Noise shimmer */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `radial-gradient(circle at 30% 20%, #ffffff22 1px, transparent 1px),
            radial-gradient(circle at 70% 40%, #ffffff1a 1px, transparent 1px),
            radial-gradient(circle at 50% 70%, #ffffff22 1px, transparent 1px),
            radial-gradient(circle at 20% 90%, #ffffff18 1px, transparent 1px),
            radial-gradient(circle at 80% 60%, #ffffff20 1px, transparent 1px)`,
          backgroundSize: "20px 20px, 25px 30px, 15px 25px, 30px 20px, 22px 28px",
          animation: "p2-mgb-noise 0.3s steps(4) infinite",
        }} />
        {/* CRT scan lines */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, #ffffff08 2px, #ffffff08 4px)",
        }} />
      </div>
      {/* Wide flickering core */}
      <div style={{
        position: "absolute",
        left: "50%", top: 0, bottom: 0,
        width: 40, transform: "translateX(-50%)",
        background: `linear-gradient(0deg, #ffffff00 0%, #ffffffbb 3%, #ffffffdd 15%, #ffffff 50%, #ffffffdd 85%, #ffffffbb 97%, #ffffff00 100%)`,
        filter: "blur(10px)",
        animation: "p2-mgb-core-flicker 0.4s linear infinite",
      }} />
      {/* Narrow intense core line */}
      <div style={{
        position: "absolute",
        left: "50%", top: 0, bottom: 0,
        width: 6, transform: "translateX(-50%)",
        background: `linear-gradient(0deg, transparent 0%, #ffffff 5%, #ffffff 95%, transparent 100%)`,
        filter: "blur(2px)", opacity: 0.85,
      }} />
      {/* Left edge glow */}
      <div style={{
        position: "absolute",
        left: MGB_OVERFLOW - 18, top: 0, bottom: 0, width: 4,
        background: `linear-gradient(0deg, transparent, ${L.green}ff 5%, #00ffccff 50%, ${L.teal}ff 95%, transparent)`,
        boxShadow: `0 0 10px ${L.green}cc, 0 0 20px ${L.green}44, -3px 0 8px #00ffcc44`,
        animation: "p2-mgb-edge-pulse 0.6s ease-in-out infinite",
      }} />
      {/* Right edge glow */}
      <div style={{
        position: "absolute",
        right: MGB_OVERFLOW - 18, top: 0, bottom: 0, width: 4,
        background: `linear-gradient(0deg, transparent, ${L.teal}ff 5%, #00ffccff 50%, ${L.green}ff 95%, transparent)`,
        boxShadow: `0 0 10px ${L.teal}cc, 0 0 20px ${L.teal}44, 3px 0 8px #00ffcc44`,
        animation: "p2-mgb-edge-pulse 0.6s ease-in-out infinite 0.3s",
      }} />
    </div>
    </div>
  ) : null;

  // ── EXPAND attack entity renderer ──
  const renderExpandEntities = () => {
    if (!expandActive) return null;
    const wave = expandWaveRef.current;
    const nowMs = performance.now();
    return (
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5, overflow: "visible" }}>
        {/* Wave indicator */}
        <div className="absolute" style={{
          top: -22, left: "50%", transform: "translateX(-50%)",
          color: wave === 1 ? L.teal : wave === 2 ? "#aa66ff" : "#FFD700",
          fontSize: 9, fontFamily: "'Courier New', monospace",
          letterSpacing: "0.15em", opacity: 0.7,
          textShadow: `0 0 6px currentColor`,
        }}>
          {wave === 1 ? "★ PRISMATIC BOLTS ★" : wave === 2 ? "★ ETHEREAL LANCE ★" : "★ SUN DANCE ★"}
        </div>

        {/* ═══ Wave 1: Prismatic Bolts ═══ */}
        {wave === 1 && expandBoltsRef.current.filter(b => b.alive).map(b => {
          const col = b.color === 'blue' ? L.teal : L.green;
          const age = (nowMs - b.spawnTime) / 1000;
          return (
            <div key={`bolt-${b.id}`} className="absolute" style={{
              left: b.x - 6, top: b.y - 6,
              width: 12, height: 12,
              color: col,
              animation: `p2-bolt-twinkle ${0.4 + (b.id % 3) * 0.15}s linear infinite`,
            }}>
              {/* 4-pointed star shape */}
              <svg width="12" height="12" viewBox="0 0 12 12">
                <polygon
                  points="6,0 7.2,4.8 12,6 7.2,7.2 6,12 4.8,7.2 0,6 4.8,4.8"
                  fill={col}
                  opacity={Math.min(1, age * 2)}
                />
              </svg>
              {/* Glow trail */}
              {b.tracking && (
                <div style={{
                  position: "absolute", left: -2, top: -2, width: 16, height: 16,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${col}44 0%, transparent 70%)`,
                  filter: "blur(3px)",
                }} />
              )}
            </div>
          );
        })}

        {/* ═══ Wave 2: Ethereal Lance (Swords) ═══ */}
        {wave === 2 && expandSwordsRef.current.filter(s => s.alive).map(s => {
          const col = s.color === 'blue' ? L.teal : L.green;
          const hueShift = s.color === 'blue' ? ' hue-rotate(160deg)' : '';
          return (
            <div key={`sword-${s.id}`} className="absolute" style={{
              left: s.x - 10, top: s.y - 20,
              width: 20, height: 40,
              opacity: s.opacity,
              transform: `rotate(${s.angle}rad)`,
              transformOrigin: "center center",
              transition: s.state === 'aiming' ? "transform 0.15s ease-out" : undefined,
              animation: s.state === 'fadein' ? `p2-sword-hover 1s ease-in-out infinite` : undefined,
              filter: s.state === 'aiming'
                ? `drop-shadow(0 0 8px ${col}) brightness(1.3)${hueShift}`
                : s.state === 'firing'
                  ? `drop-shadow(0 0 12px ${col}) brightness(1.5)${hueShift}`
                  : `drop-shadow(0 0 4px ${col})${hueShift}`,
            }}>
              <img
                src={greenSwordImg}
                alt=""
                draggable={false}
                style={{
                  width: "100%", height: "100%",
                  objectFit: "contain",
                  imageRendering: "pixelated",
                }}
              />
            </div>
          );
        })}

        {/* ═══ Wave 3: Sun Dance (Orbs + Rays) ═══ */}
        {wave === 3 && expandOrbsRef.current.map(o => {
          const isWarning = o.state === 'warning';
          const isShining = o.state === 'shining';
          const stateAge = nowMs - o.stateStart;
          const orbCol = isShining ? "#FFD700" : isWarning ? "#FFA500" : "#ffffcc";
          return (
            <div key={`sun-${o.id}`}>
              {/* Orb body */}
              <div className="absolute" style={{
                left: o.x - EXPAND_SUN_RADIUS,
                top: o.y - EXPAND_SUN_RADIUS,
                width: EXPAND_SUN_RADIUS * 2,
                height: EXPAND_SUN_RADIUS * 2,
                borderRadius: "50%",
                background: `radial-gradient(circle, #ffffffee 0%, ${orbCol} 40%, ${orbCol}88 70%, transparent 100%)`,
                color: orbCol,
                animation: isWarning
                  ? `p2-sun-warn ${EXPAND_SUN_WARN_MS}ms ease-in forwards`
                  : isShining
                    ? "none"
                    : `p2-sun-idle 2s ease-in-out infinite`,
                boxShadow: isShining
                  ? `0 0 30px ${orbCol}, 0 0 60px ${orbCol}88, 0 0 90px ${orbCol}44`
                  : isWarning
                    ? `0 0 15px ${orbCol}88, 0 0 30px ${orbCol}44`
                    : `0 0 8px ${orbCol}44`,
                transform: isShining ? "scale(1.4)" : undefined,
                transition: "transform 0.3s",
                zIndex: 6,
              }} />
              {/* Rays — only when shining; wrapper rotates slowly, inner ray handles scaleY */}
              {isShining && (
                <div className="absolute" style={{
                  left: o.x,
                  top: o.y,
                  width: 0,
                  height: 0,
                  animation: `p2-sun-rotate ${EXPAND_SUN_SHINE_MS}ms linear forwards`,
                  zIndex: 5,
                }}>
                  {Array.from({ length: EXPAND_SUN_RAY_COUNT }).map((_, r) => {
                    const rayAngle = (r / EXPAND_SUN_RAY_COUNT) * Math.PI * 2;
                    const rayDeg = (rayAngle * 180) / Math.PI;
                    return (
                      <div key={`ray-${o.id}-${r}`} style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: 0,
                        height: 0,
                        transform: `rotate(${rayDeg}deg)`,
                      }}>
                        <div style={{
                          position: "absolute",
                          left: -EXPAND_SUN_RAY_W / 2,
                          top: 0,
                          width: EXPAND_SUN_RAY_W,
                          height: EXPAND_SUN_RAY_LEN,
                          background: `linear-gradient(180deg, #FFD700 0%, #FFD700cc 30%, #FFD70066 60%, transparent 100%)`,
                          boxShadow: `0 0 6px #FFD700aa, 0 0 12px #FFD70044`,
                          transformOrigin: "top center",
                          animation: `p2-sun-ray ${EXPAND_SUN_SHINE_MS}ms ease-out forwards`,
                          animationDelay: `${r * 30}ms`,
                        }} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── ANNOYANCE attack entity renderer ──
  const renderAnnoyanceEntities = () => {
    if (!annoyActive) return null;
    const nowMs = performance.now();
    const dw = boxW;
    const dh = boxH;
    const cx = dw / 2;
    const cy = dh / 2;
    return (
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5, overflow: "visible" }}>
        {/* Attack label */}
        <div className="absolute" style={{
          top: -22, left: "50%", transform: "translateX(-50%)",
          color: "#FF4444",
          fontSize: 9, fontFamily: "'Courier New', monospace",
          letterSpacing: "0.15em", opacity: 0.8,
          textShadow: "0 0 8px #FF4444",
          animation: "p2-annoy-border 0.8s ease-in-out infinite",
        }}>
          ★ ANNOYANCE ★
        </div>

        {/* ═══ Inner Cage — constrains player to center ══ */}
        <div style={{
          position: "absolute",
          left: cx - ANNOY_CAGE_W / 2,
          top: cy - ANNOY_CAGE_H / 2,
          width: ANNOY_CAGE_W,
          height: ANNOY_CAGE_H,
          border: "2px solid rgba(255, 255, 255, 0.85)",
          boxShadow: "0 0 8px rgba(255, 255, 255, 0.4), inset 0 0 6px rgba(255, 255, 255, 0.15)",
          zIndex: 10,
          pointerEvents: "none",
        }} />

        {/* ═══ Clock Beams ═══ */}
        {annoyBeamsRef.current.filter(b => b.alive).map(b => {
          const age = nowMs - b.stateStart;
          const angleDeg = (b.angle * 180) / Math.PI;
          const isTelegraph = b.state === 'telegraph';
          const isFiring = b.state === 'firing';
          const isFading = b.state === 'fading';
          // Colors cycle through a chaotic palette
          const beamColors = ["#FF4444", "#FF6644", "#FF2266", "#FF8800", "#FF3388", "#DD2222"];
          const beamCol = beamColors[b.id % beamColors.length];

          return (
            <div key={`cbeam-${b.id}`} className="absolute pointer-events-none" style={{
              left: cx, top: cy,
              width: 0, height: 0,
              transform: `rotate(${angleDeg}deg)`,
              zIndex: isFiring ? 7 : 4,
            }}>
              {/* The beam extends in both directions from center */}
              {isTelegraph && (
                <div style={{
                  position: "absolute",
                  left: -1,
                  top: -ANNOY_BEAM_LEN,
                  width: 2,
                  height: ANNOY_BEAM_LEN * 2,
                  background: `linear-gradient(180deg, transparent 0%, ${beamCol}44 15%, ${beamCol}66 50%, ${beamCol}44 85%, transparent 100%)`,
                  animation: `p2-clock-telegraph ${ANNOY_BEAM_TELEGRAPH_MS}ms linear forwards`,
                  boxShadow: `0 0 4px ${beamCol}44`,
                }} />
              )}
              {isFiring && (
                <div style={DISPLAY_CONTENTS}>
                  {/* Main beam body */}
                  <div style={{
                    position: "absolute",
                    left: -ANNOY_BEAM_VISUAL_W / 2,
                    top: -ANNOY_BEAM_LEN,
                    width: ANNOY_BEAM_VISUAL_W,
                    height: ANNOY_BEAM_LEN * 2,
                    background: `linear-gradient(180deg, transparent 0%, ${beamCol}88 8%, ${beamCol}dd 20%, ${beamCol} 50%, ${beamCol}dd 80%, ${beamCol}88 92%, transparent 100%)`,
                    boxShadow: `0 0 12px ${beamCol}aa, 0 0 24px ${beamCol}55, 0 0 48px ${beamCol}22`,
                    animation: `p2-clock-fire ${ANNOY_BEAM_FIRE_MS}ms cubic-bezier(0.22, 0.68, 0.35, 1) forwards`,
                    transformOrigin: "center center",
                  }} />
                  {/* Bright core line */}
                  <div style={{
                    position: "absolute",
                    left: -2,
                    top: -ANNOY_BEAM_LEN,
                    width: 4,
                    height: ANNOY_BEAM_LEN * 2,
                    background: `linear-gradient(180deg, transparent 5%, #ffffffcc 20%, #ffffff 50%, #ffffffcc 80%, transparent 95%)`,
                    filter: "blur(1px)",
                  }} />
                  {/* Wide glow aura */}
                  <div style={{
                    position: "absolute",
                    left: -ANNOY_BEAM_VISUAL_W,
                    top: -ANNOY_BEAM_LEN,
                    width: ANNOY_BEAM_VISUAL_W * 2,
                    height: ANNOY_BEAM_LEN * 2,
                    background: `linear-gradient(180deg, transparent 0%, ${beamCol}22 15%, ${beamCol}33 50%, ${beamCol}22 85%, transparent 100%)`,
                    filter: "blur(10px)",
                  }} />
                </div>
              )}
              {isFading && (
                <div style={{
                  position: "absolute",
                  left: -ANNOY_BEAM_VISUAL_W / 2,
                  top: -ANNOY_BEAM_LEN,
                  width: ANNOY_BEAM_VISUAL_W,
                  height: ANNOY_BEAM_LEN * 2,
                  background: `linear-gradient(180deg, transparent 0%, ${beamCol}88 20%, ${beamCol} 50%, ${beamCol}88 80%, transparent 100%)`,
                  boxShadow: `0 0 8px ${beamCol}66`,
                  animation: `p2-clock-fade ${ANNOY_BEAM_FADE_MS}ms ease-in forwards`,
                }} />
              )}
            </div>
          );
        })}

        {/* ═══ Ethereal Lance swords (reuses expandSwordsRef) ═══ */}
        {expandSwordsRef.current.filter(s => s.alive).map(s => {
          const col = s.color === 'blue' ? L.teal : L.green;
          const hueShift = s.color === 'blue' ? ' hue-rotate(160deg)' : '';
          return (
            <div key={`sword-${s.id}`} className="absolute" style={{
              left: s.x - 10, top: s.y - 20,
              width: 20, height: 40,
              opacity: s.opacity,
              transform: `rotate(${s.angle}rad)`,
              transformOrigin: "center center",
              transition: s.state === 'aiming' ? "transform 0.15s ease-out" : undefined,
              animation: s.state === 'fadein' ? `p2-sword-hover 1s ease-in-out infinite` : undefined,
              filter: s.state === 'aiming'
                ? `drop-shadow(0 0 8px ${col}) brightness(1.3)${hueShift}`
                : s.state === 'firing'
                  ? `drop-shadow(0 0 12px ${col}) brightness(1.5)${hueShift}`
                  : `drop-shadow(0 0 4px ${col})${hueShift}`,
            }}>
              <img
                src={greenSwordImg}
                alt=""
                draggable={false}
                style={{
                  width: "100%", height: "100%",
                  objectFit: "contain",
                  imageRendering: "pixelated",
                }}
              />
            </div>
          );
        })}

        {/* ═══ Sun Dance orbs (reuses expandOrbsRef) ═══ */}
        {expandOrbsRef.current.map(o => {
          const isWarning = o.state === 'warning';
          const isShining = o.state === 'shining';
          const orbCol = isShining ? "#FFD700" : isWarning ? "#FFA500" : "#ffffcc";
          return (
            <div key={`sun-${o.id}`}>
              {/* Orb body */}
              <div className="absolute" style={{
                left: o.x - EXPAND_SUN_RADIUS,
                top: o.y - EXPAND_SUN_RADIUS,
                width: EXPAND_SUN_RADIUS * 2,
                height: EXPAND_SUN_RADIUS * 2,
                borderRadius: "50%",
                background: `radial-gradient(circle, #ffffffee 0%, ${orbCol} 40%, ${orbCol}88 70%, transparent 100%)`,
                color: orbCol,
                animation: isWarning
                  ? `p2-sun-warn ${EXPAND_SUN_WARN_MS}ms ease-in forwards`
                  : isShining
                    ? "none"
                    : `p2-sun-idle 2s ease-in-out infinite`,
                boxShadow: isShining
                  ? `0 0 30px ${orbCol}, 0 0 60px ${orbCol}88, 0 0 90px ${orbCol}44`
                  : isWarning
                    ? `0 0 15px ${orbCol}88, 0 0 30px ${orbCol}44`
                    : `0 0 8px ${orbCol}44`,
                transform: isShining ? "scale(1.4)" : undefined,
                transition: "transform 0.3s",
                zIndex: 6,
              }} />
              {/* Rays */}
              {isShining && (
                <div className="absolute" style={{
                  left: o.x,
                  top: o.y,
                  width: 0,
                  height: 0,
                  animation: `p2-sun-rotate ${EXPAND_SUN_SHINE_MS}ms linear forwards`,
                  zIndex: 5,
                }}>
                  {Array.from({ length: EXPAND_SUN_RAY_COUNT }).map((_, r) => {
                    const rayAngle = (r / EXPAND_SUN_RAY_COUNT) * Math.PI * 2;
                    const rayDeg = (rayAngle * 180) / Math.PI;
                    return (
                      <div key={`ray-${o.id}-${r}`} style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: 0,
                        height: 0,
                        transform: `rotate(${rayDeg}deg)`,
                      }}>
                        <div style={{
                          position: "absolute",
                          left: -EXPAND_SUN_RAY_W / 2,
                          top: 0,
                          width: EXPAND_SUN_RAY_W,
                          height: EXPAND_SUN_RAY_LEN,
                          background: `linear-gradient(180deg, #FFD700 0%, #FFD700cc 30%, #FFD70066 60%, transparent 100%)`,
                          boxShadow: `0 0 6px #FFD700aa, 0 0 12px #FFD70044`,
                          transformOrigin: "top center",
                          animation: `p2-sun-ray ${EXPAND_SUN_SHINE_MS}ms ease-out forwards`,
                          animationDelay: `${r * 30}ms`,
                        }} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Frustration entities renderer ──
  const renderFrustrationEntities = () => {
    if (!frustActive) return null;
    const nowMs = performance.now();
    const elapsed = nowMs - frustStartRef.current;
    const dw = boxW;
    const dh = boxH;
    const cx = dw / 2;
    const cy = dh / 2;
    const remaining = Math.max(0, Math.ceil((FRUST_DURATION - elapsed) / 1000));
    const isMgbPhase = elapsed >= FRUST_MGB_START;
    const mgbCountdown = isMgbPhase && !frustMgbFiringRef.current
      ? Math.max(0, Math.ceil((FRUST_MGB_START + FRUST_MGB_WARN_MS - elapsed) / 1000))
      : null;
    return (
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5, overflow: "visible" }}>
        <div className="absolute" style={{
          top: -26, left: "50%", transform: "translateX(-50%)",
          color: "#FF0044", fontSize: 10, fontFamily: "'Courier New', monospace",
          letterSpacing: "0.2em", opacity: 0.9,
          textShadow: "0 0 10px #FF0044, 0 0 20px #FF004488",
          animation: "p2-annoy-border 0.6s ease-in-out infinite",
        }}>
          ★ FRUSTRATION ★ — {remaining}s
        </div>
        {mgbCountdown !== null && mgbCountdown > 0 && (
          <div className="absolute" style={{
            top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            color: "#FF0000", fontSize: 28, fontFamily: "'Courier New', monospace",
            fontWeight: "bold",
            textShadow: "0 0 20px #FF0000, 0 0 40px #FF000088, 0 0 60px #FF000044",
            animation: "p2-annoy-border 0.4s ease-in-out infinite",
            zIndex: 20,
          }}>
            MGB IN {mgbCountdown}...
          </div>
        )}
        {frustSafeZoneRef.current && frustSafeZoneRef.current.warning && (() => {
          const sz = frustSafeZoneRef.current!;
          const timeLeft = Math.max(0, (sz.checkTime - nowMs) / 1000);
          const pulseSpeed = timeLeft < 1 ? 0.15 : timeLeft < 2 ? 0.3 : 0.6;
          return (
            <div style={DISPLAY_CONTENTS}>
              <div className="absolute" style={{
                left: sz.x - FRUST_SAFE_ZONE_SIZE / 2,
                top: sz.y - FRUST_SAFE_ZONE_SIZE / 2,
                width: FRUST_SAFE_ZONE_SIZE, height: FRUST_SAFE_ZONE_SIZE,
                border: "2px solid #00FF00", background: "rgba(0, 255, 0, 0.1)",
                boxShadow: "0 0 12px #00FF0066, 0 0 24px #00FF0033, inset 0 0 8px #00FF0022",
                animation: `p2-annoy-border ${pulseSpeed}s ease-in-out infinite`,
                zIndex: 15,
              }} />
              <div className="absolute" style={{
                left: sz.x, top: sz.y - FRUST_SAFE_ZONE_SIZE / 2 - 16,
                transform: "translateX(-50%)",
                color: "#00FF00", fontSize: 10, fontFamily: "'Courier New', monospace",
                fontWeight: "bold", letterSpacing: "0.15em",
                textShadow: "0 0 8px #00FF00", zIndex: 15,
              }}>
                {sz.label} ({timeLeft.toFixed(1)}s)
              </div>
            </div>
          );
        })()}
        {frustSafeZoneRef.current && frustSafeZoneRef.current.active && (
          <div className="absolute inset-0" style={{
            background: "rgba(255, 0, 0, 0.3)",
            animation: "p2-clock-fade 500ms ease-out forwards", zIndex: 14,
          }} />
        )}
        {annoyBeamsRef.current.filter(b => b.alive).map(b => {
          const angleDeg = (b.angle * 180) / Math.PI;
          const isTelegraph = b.state === 'telegraph';
          const isFiring = b.state === 'firing';
          const isFading = b.state === 'fading';
          const beamColors = ["#FF4444", "#FF6644", "#FF2266", "#FF8800", "#FF3388", "#DD2222"];
          const beamCol = beamColors[b.id % beamColors.length];
          return (
            <div key={`fbeam-${b.id}`} className="absolute pointer-events-none" style={{
              left: cx, top: cy, width: 0, height: 0,
              transform: `rotate(${angleDeg}deg)`, zIndex: isFiring ? 7 : 4,
            }}>
              {isTelegraph && (
                <div style={{
                  position: "absolute", left: -1, top: -ANNOY_BEAM_LEN,
                  width: 2, height: ANNOY_BEAM_LEN * 2,
                  background: `linear-gradient(180deg, transparent 0%, ${beamCol}44 15%, ${beamCol}66 50%, ${beamCol}44 85%, transparent 100%)`,
                  animation: `p2-clock-telegraph ${ANNOY_BEAM_TELEGRAPH_MS}ms linear forwards`,
                  boxShadow: `0 0 4px ${beamCol}44`,
                }} />
              )}
              {isFiring && (
                <div style={DISPLAY_CONTENTS}>
                  <div style={{
                    position: "absolute", left: -ANNOY_BEAM_VISUAL_W / 2, top: -ANNOY_BEAM_LEN,
                    width: ANNOY_BEAM_VISUAL_W, height: ANNOY_BEAM_LEN * 2,
                    background: `linear-gradient(180deg, transparent 0%, ${beamCol}88 8%, ${beamCol}dd 20%, ${beamCol} 50%, ${beamCol}dd 80%, ${beamCol}88 92%, transparent 100%)`,
                    boxShadow: `0 0 12px ${beamCol}aa, 0 0 24px ${beamCol}55`,
                    animation: `p2-clock-fire ${ANNOY_BEAM_FIRE_MS}ms cubic-bezier(0.22, 0.68, 0.35, 1) forwards`,
                  }} />
                  <div style={{
                    position: "absolute", left: -2, top: -ANNOY_BEAM_LEN,
                    width: 4, height: ANNOY_BEAM_LEN * 2,
                    background: "linear-gradient(180deg, transparent 5%, #ffffffcc 20%, #ffffff 50%, #ffffffcc 80%, transparent 95%)",
                    filter: "blur(1px)",
                  }} />
                </div>
              )}
              {isFading && (
                <div style={{
                  position: "absolute", left: -ANNOY_BEAM_VISUAL_W / 2, top: -ANNOY_BEAM_LEN,
                  width: ANNOY_BEAM_VISUAL_W, height: ANNOY_BEAM_LEN * 2,
                  background: `linear-gradient(180deg, transparent 0%, ${beamCol}88 20%, ${beamCol} 50%, ${beamCol}88 80%, transparent 100%)`,
                  animation: `p2-clock-fade ${ANNOY_BEAM_FADE_MS}ms ease-in forwards`,
                }} />
              )}
            </div>
          );
        })}
        {expandSwordsRef.current.filter(s => s.alive).map(s => {
          const col = s.color === 'blue' ? L.teal : L.green;
          const hueShift = s.color === 'blue' ? ' hue-rotate(160deg)' : '';
          return (
            <div key={`fsword-${s.id}`} className="absolute" style={{
              left: s.x - 10, top: s.y - 20, width: 20, height: 40,
              opacity: s.opacity, transform: `rotate(${s.angle}rad)`,
              transformOrigin: "center center",
              transition: s.state === 'aiming' ? "transform 0.15s ease-out" : undefined,
              animation: s.state === 'fadein' ? "p2-sword-hover 1s ease-in-out infinite" : undefined,
              filter: s.state === 'aiming'
                ? `drop-shadow(0 0 8px ${col}) brightness(1.3)${hueShift}`
                : s.state === 'firing'
                  ? `drop-shadow(0 0 12px ${col}) brightness(1.5)${hueShift}`
                  : `drop-shadow(0 0 4px ${col})${hueShift}`,
            }}>
              <img src={greenSwordImg} alt="" draggable={false} style={{
                width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated",
              }} />
            </div>
          );
        })}
        {expandBoltsRef.current.filter(b => b.alive).map(b => {
          const col = b.color === 'blue' ? '#66ccff' : '#66ff66';
          return (
            <div key={`fbolt-${b.id}`} className="absolute" style={{
              left: b.x - 5, top: b.y - 5, width: 10, height: 10,
              borderRadius: "50%",
              background: `radial-gradient(circle, #ffffff 0%, ${col} 40%, ${col}88 70%, transparent 100%)`,
              color: col, animation: "p2-bolt-twinkle 0.5s ease-in-out infinite",
              boxShadow: `0 0 8px ${col}, 0 0 16px ${col}88`, zIndex: 6,
            }} />
          );
        })}
      </div>
    );
  };

  // Container sizing — must accommodate the widest attack plus stage scaffolding
  const containerW = STAGE_W + BORDER_W * 2 + 180;
  const containerH = MAX_H + BORDER_W * 2 + 200;

  // ── battleBoxOnly: render just the battle area, no chrome ──
  // Helper to render the shared battle box content (used in both modes)
  const renderBattleArea = () => (
    <div className="relative flex items-center justify-center" style={{
      width: containerW,
      height: containerH,
      minHeight: containerH,
      transform: (shakeOffset.x || shakeOffset.y)
        ? `translate(${shakeOffset.x.toFixed(1)}px, ${shakeOffset.y.toFixed(1)}px)`
        : undefined,
    }}>
      <StageDecoration visible={stageVisible} boxW={renderBoxDims.w} boxH={renderBoxDims.h} laserAngles={laserAnglesRef.current} laserPositions={LASER_CONFIGS.map(c => ({ pctX: c.pctX, color: c.color }))} spotlightPositions={BEAM_CONFIGS.map(c => ({ pctX: c.pctX, color: c.color }))} />
      <div style={{
        width: renderBoxDims.w + BORDER_W * 2,
        height: renderBoxDims.h + BORDER_W * 2,
        border: `${BORDER_W}px solid ${wallCrushFlash ? "#FF2222" : frustActive ? "#FF0044" : annoyActive ? "#FF4444" : (mgBeamActive || mgBeamCharging) ? L.teal : stageVisible ? L.teal : expandActive ? (expandWaveRef.current === 3 ? "#FFD700" : expandWaveRef.current === 2 ? "#aa66ff" : L.teal) : isAttacking ? colors.accent : "#FFFFFF"}`,
        background: "#000",
        boxShadow: wallCrushFlash
          ? `0 0 30px rgba(255,34,34,0.6), 0 0 60px rgba(255,34,34,0.3), inset 0 0 20px rgba(255,34,34,0.15)`
          : frustActive
            ? `0 0 20px #FF004466, 0 0 40px #FF004433, 0 0 60px #FF004411`
          : annoyActive
            ? `0 0 20px #FF444466, 0 0 40px #FF444433, 0 0 60px #FF444411`
            : (mgBeamActive || mgBeamCharging)
            ? `0 0 30px ${L.teal}88, 0 0 60px ${L.green}44, 0 0 90px ${L.teal}22`
            : stageVisible
              ? `0 0 20px ${L.teal}44, 0 0 40px ${L.green}22, 0 8px 30px #00000088`
              : expandActive
                ? `0 0 20px ${expandWaveRef.current === 3 ? "#FFD70044" : L.teal + "44"}, 0 0 40px ${expandWaveRef.current === 3 ? "#FFD70022" : L.green + "22"}`
                : isAttacking
                  ? `0 0 20px ${colors.accent}44, inset 0 0 30px ${colors.accent}11`
                  : "none",
        transition: `border-color 0.15s, box-shadow 0.3s`,
        position: "relative",
        overflow: (mgBeamActive || mgBeamCharging || expandActive || annoyActive || frustActive) ? "visible" : "hidden",
        zIndex: 2,
      }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${colors.accent}06 3px, ${colors.accent}06 6px)`,
          zIndex: 3,
        }} />
        {/* ═══ Full-length lasers (4) ══ */}
        {stageVisible && LASER_CONFIGS.map((cfg, i) => {
          const rw = safeRenderBoxDims.w;
          const rh = safeRenderBoxDims.h;
          const originX = cfg.pctX * rw;
          const angleDeg = laserAnglesRef.current[i] ?? 0;
          const laserLen = rh * 1.5;
          return (
            <div key={`laser-${i}`} className="absolute pointer-events-none" style={{ left: originX, top: 0, width: 0, height: 0, zIndex: 4 }}>
              <div style={{ position: "absolute", left: -LASER_WIDTH / 2, top: 0, width: LASER_WIDTH, height: laserLen, background: `linear-gradient(180deg, ${cfg.color}ee, ${cfg.color}88 40%, ${cfg.color}44 70%, ${cfg.color}00)`, boxShadow: `0 0 8px ${cfg.color}88, 0 0 16px ${cfg.color}44`, transformOrigin: "top center", transform: `rotate(${angleDeg}deg)` }} />
              <div style={{ position: "absolute", left: -6, top: 0, width: 12, height: laserLen, background: `linear-gradient(180deg, ${cfg.color}33, ${cfg.color}11 50%, transparent)`, filter: "blur(4px)", transformOrigin: "top center", transform: `rotate(${angleDeg}deg)` }} />
              <div style={{ position: "absolute", left: -4, top: -4, width: 8, height: 8, borderRadius: "50%", background: cfg.color, boxShadow: `0 0 6px ${cfg.color}, 0 0 12px ${cfg.color}88` }} />
            </div>
          );
        })}
        {/* ═══ Spotlight beams (5) — static triangle + half-circle ═══ */}
        {stageVisible && BEAM_CONFIGS.map((cfg, i) => {
          const rh = safeRenderBoxDims.h;
          const originX = cfg.pctX * safeRenderBoxDims.w;
          const beamLen = rh * 0.25;
          const botW = BEAM_CONE_HALF_W * 2; // full width at bottom
          const circR = botW / 2; // half-circle radius matches cone bottom width
          return (
            <div key={`beam-${i}`} className="absolute pointer-events-none" style={{ left: originX, top: 0, width: 0, height: 0, zIndex: 5 }}>
              {/* Triangle cone — CSS clip-path */}
              <div style={{
                position: "absolute",
                left: -botW / 2, top: 0,
                width: botW, height: beamLen,
                clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
                background: `linear-gradient(180deg, ${cfg.color}ee 0%, ${cfg.color}55 50%, ${cfg.color}30 100%)`,
              }} />
              {/* Soft triangle glow behind */}
              <div style={{
                position: "absolute",
                left: -botW / 2 - 6, top: 0,
                width: botW + 12, height: beamLen + 4,
                clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
                background: `linear-gradient(180deg, ${cfg.color}44 0%, ${cfg.color}18 60%, ${cfg.color}08 100%)`,
                filter: "blur(8px)",
              }} />
              {/* Half-circle at bottom of triangle */}
              <div style={{
                position: "absolute",
                left: -circR, top: beamLen - circR,
                width: circR * 2, height: circR * 2,
                borderRadius: "50%",
                background: `radial-gradient(ellipse at 50% 0%, ${cfg.color}40 0%, ${cfg.color}18 50%, transparent 75%)`,
                clipPath: "inset(50% 0 0 0)",
              }} />
              {/* Bright center line */}
              <div style={{
                position: "absolute",
                left: -1, top: 0, width: 2, height: beamLen,
                background: `linear-gradient(180deg, ${cfg.color}ff 0%, ${cfg.color}88 40%, ${cfg.color}22 100%)`,
                boxShadow: `0 0 6px ${cfg.color}aa`,
              }} />
              {/* Origin glow dot */}
              <div style={{ position: "absolute", left: -6, top: -6, width: 12, height: 12, borderRadius: "50%", background: cfg.color, boxShadow: `0 0 12px ${cfg.color}, 0 0 24px ${cfg.color}88, 0 0 36px ${cfg.color}44` }} />
            </div>
          );
        })}
        {renderMgbCharge()}
        {renderMgbBeam()}
        {renderExpandEntities()}
        {renderAnnoyanceEntities()}
        {renderFrustrationEntities()}
        <div style={{
          position: "absolute",
          left: playerRender.x - PLAYER_R,
          top: playerRender.y - PLAYER_R,
          width: PLAYER_R * 2,
          height: PLAYER_R * 2,
          zIndex: 10,
          // No CSS transition — JS box lerp handles fluid repositioning during resize
          opacity: iframeFeedback ? undefined : 1,
          animation: iframeFeedback ? "p2-iframe-blink 0.1s linear infinite" : "none",
        }}>
          {/* Resolve shield ring */}
          {resolveShielded && (
            <div style={{
              position: "absolute",
              left: -5, top: -5,
              width: PLAYER_R * 2 + 10, height: PLAYER_R * 2 + 10,
              borderRadius: "50%",
              border: "2px solid #FFD700",
              boxShadow: "0 0 8px #FFD70088, 0 0 16px #FFD70044, inset 0 0 6px #FFD70044",
              animation: "p2-spot-pulse 0.8s ease-in-out infinite",
            }} />
          )}
          <Heart
            size={PLAYER_R * 2}
            fill={resolveShielded ? "#FFD700" : iframeFeedback ? "#FFFFFF" : "#FF0000"}
            color={resolveShielded ? "#FFD700" : iframeFeedback ? "#FFFFFF" : "#FF0000"}
            style={{ filter: resolveShielded ? "drop-shadow(0 0 8px #FFD700)" : iframeFeedback ? "drop-shadow(0 0 8px #fff)" : "drop-shadow(0 0 4px rgba(255,0,0,0.6))" }}
          />
        </div>
        {/* ── Resolve ding particles ─ */}
        {resolveDings.map(d => {
          const age = performance.now() - d.spawnTime;
          const t = Math.min(1, age / RESOLVE_DING_LIFETIME);
          const dist = 20 + t * 30;
          const px = d.x + Math.cos(d.angle) * dist;
          const py = d.y + Math.sin(d.angle) * dist;
          const scale = 1 - t * 0.6;
          return (
            <div key={d.id} className="absolute pointer-events-none" style={{
              left: px - 3, top: py - 3,
              width: 6, height: 6,
              borderRadius: "50%",
              background: "#FFD700",
              boxShadow: "0 0 6px #FFD700, 0 0 12px #FFD70066",
              opacity: 1 - t,
              transform: `scale(${scale})`,
              zIndex: 15,
            }} />
          );
        })}
        <div className="absolute pointer-events-none" style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 20, height: 20, opacity: 0.1 }}>
          <div style={{ position: "absolute", left: 9, top: 0, width: 2, height: 20, background: colors.accent }} />
          <div style={{ position: "absolute", left: 0, top: 9, width: 20, height: 2, background: colors.accent }} />
        </div>
      </div>
    </div>
  );

  if (battleBoxOnly) {
    return renderBattleArea();
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Boss name + HP */}
      <div className="w-full flex flex-col items-center gap-2">
        <div className="text-[22px] tracking-[0.25em]" style={{
          color: colors.text,
          textShadow: `0 0 10px ${colors.text}66, 0 0 20px ${colors.accent}44`,
          fontFamily: "'Courier New', monospace",
        }}>
          {bossName}
        </div>
        <div className="flex items-center gap-3 w-full max-w-[700px]">
          <span className="text-[14px]" style={{ color: colors.accent, fontFamily: "'Courier New', monospace" }}>HP</span>
          <div className="flex-1 h-[22px] relative" style={{
            background: "#111",
            border: `2px solid ${colors.accent}`,
            boxShadow: `0 0 8px ${colors.accent}33`,
          }}>
            <div className="h-full transition-all duration-300" style={{
              width: `${bossHpPct}%`,
              background: `linear-gradient(90deg, ${colors.bg}, ${colors.accent})`,
              boxShadow: `0 0 10px ${colors.accent}66`,
            }} />
          </div>
          <span className="text-[12px]" style={{ color: colors.accent, fontFamily: "'Courier New', monospace" }}>
            {bossHp}/{bossMaxHp}
          </span>
        </div>
      </div>

      {/* Attack indicator */}
      <div className="text-[11px] tracking-widest" style={{
        color: isAttacking ? colors.text : colors.accent,
        fontFamily: "'Courier New', monospace",
        opacity: 0.8,
      }}>
        {isAttacking ? `ATTACK: ${currentAttack.toUpperCase()}` : "IDLE"}
      </div>

      {/* ═══ Battle area — stage decoration sits behind/under the box ═══ */}
      <div className="relative flex items-center justify-center" style={{
        width: containerW,
        height: containerH,
        minHeight: containerH,
        // Screen shake offset
        transform: (shakeOffset.x || shakeOffset.y)
          ? `translate(${shakeOffset.x.toFixed(1)}px, ${shakeOffset.y.toFixed(1)}px)`
          : undefined,
      }}>
        {/* Stage decoration layer — zIndex 0, behind the battle box */}
        <StageDecoration visible={stageVisible} boxW={renderBoxDims.w} boxH={renderBoxDims.h} laserAngles={laserAnglesRef.current} laserPositions={LASER_CONFIGS.map(c => ({ pctX: c.pctX, color: c.color }))} spotlightPositions={BEAM_CONFIGS.map(c => ({ pctX: c.pctX, color: c.color }))} />

        {/* The animated battle box — zIndex 2, sits ON TOP of the stage */}
        <div style={{
          width: renderBoxDims.w + BORDER_W * 2,
          height: renderBoxDims.h + BORDER_W * 2,
          border: `${BORDER_W}px solid ${wallCrushFlash ? "#FF2222" : frustActive ? "#FF0044" : annoyActive ? "#FF4444" : (mgBeamActive || mgBeamCharging) ? L.teal : stageVisible ? L.teal : expandActive ? (expandWaveRef.current === 3 ? "#FFD700" : expandWaveRef.current === 2 ? "#aa66ff" : L.teal) : isAttacking ? colors.accent : "#FFFFFF"}`,
          background: "#000",
          boxShadow: wallCrushFlash
            ? `0 0 30px rgba(255,34,34,0.6), 0 0 60px rgba(255,34,34,0.3), inset 0 0 20px rgba(255,34,34,0.15)`
            : frustActive
              ? `0 0 20px #FF004466, 0 0 40px #FF004433, 0 0 60px #FF004411`
            : annoyActive
              ? `0 0 20px #FF444466, 0 0 40px #FF444433, 0 0 60px #FF444411`
              : (mgBeamActive || mgBeamCharging)
              ? `0 0 30px ${L.teal}88, 0 0 60px ${L.green}44, 0 0 90px ${L.teal}22`
              : stageVisible
                ? `0 0 20px ${L.teal}44, 0 0 40px ${L.green}22, 0 8px 30px #00000088`
                : expandActive
                  ? `0 0 20px ${expandWaveRef.current === 3 ? "#FFD70044" : L.teal + "44"}, 0 0 40px ${expandWaveRef.current === 3 ? "#FFD70022" : L.green + "22"}`
                  : isAttacking
                    ? `0 0 20px ${colors.accent}44, inset 0 0 30px ${colors.accent}11`
                    : "none",
          transition: `border-color 0.3s, box-shadow 0.5s`,
          position: "relative",
          overflow: (mgBeamActive || mgBeamCharging || expandActive || annoyActive || frustActive) ? "visible" : "hidden",
          zIndex: 2,
        }}>
          {/* Scan lines */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${colors.accent}06 3px, ${colors.accent}06 6px)`,
            zIndex: 3,
          }} />

          {/* ═══ Full-length lasers (4) ═══ */}
          {stageVisible && LASER_CONFIGS.map((cfg, i) => {
            const rw = safeRenderBoxDims.w;
            const rh = safeRenderBoxDims.h;
            const originX = cfg.pctX * rw;
            const angleDeg = laserAnglesRef.current[i] ?? 0;
            const laserLen = rh * 1.5;
            return (
              <div key={`laser-${i}`} className="absolute pointer-events-none" style={{ left: originX, top: 0, width: 0, height: 0, zIndex: 4 }}>
                <div style={{ position: "absolute", left: -LASER_WIDTH / 2, top: 0, width: LASER_WIDTH, height: laserLen, background: `linear-gradient(180deg, ${cfg.color}ee, ${cfg.color}88 40%, ${cfg.color}44 70%, ${cfg.color}00)`, boxShadow: `0 0 8px ${cfg.color}88, 0 0 16px ${cfg.color}44`, transformOrigin: "top center", transform: `rotate(${angleDeg}deg)` }} />
                <div style={{ position: "absolute", left: -6, top: 0, width: 12, height: laserLen, background: `linear-gradient(180deg, ${cfg.color}33, ${cfg.color}11 50%, transparent)`, filter: "blur(4px)", transformOrigin: "top center", transform: `rotate(${angleDeg}deg)` }} />
                <div style={{ position: "absolute", left: -4, top: -4, width: 8, height: 8, borderRadius: "50%", background: cfg.color, boxShadow: `0 0 6px ${cfg.color}, 0 0 12px ${cfg.color}88` }} />
              </div>
            );
          })}
          {/* ═══ Spotlight beams (5) — static triangle + half-circle ═══ */}
          {stageVisible && BEAM_CONFIGS.map((cfg, i) => {
            const rh = safeRenderBoxDims.h;
            const originX = cfg.pctX * safeRenderBoxDims.w;
            const beamLen = rh * 0.25;
            const botW = BEAM_CONE_HALF_W * 2;
            const circR = botW / 2;
            return (
              <div key={`beam-${i}`} className="absolute pointer-events-none" style={{ left: originX, top: 0, width: 0, height: 0, zIndex: 5 }}>
                <div style={{
                  position: "absolute", left: -botW / 2, top: 0,
                  width: botW, height: beamLen,
                  clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
                  background: `linear-gradient(180deg, ${cfg.color}ee 0%, ${cfg.color}55 50%, ${cfg.color}30 100%)`,
                }} />
                <div style={{
                  position: "absolute", left: -botW / 2 - 6, top: 0,
                  width: botW + 12, height: beamLen + 4,
                  clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
                  background: `linear-gradient(180deg, ${cfg.color}44 0%, ${cfg.color}18 60%, ${cfg.color}08 100%)`,
                  filter: "blur(8px)",
                }} />
                <div style={{
                  position: "absolute", left: -circR, top: beamLen - circR,
                  width: circR * 2, height: circR * 2, borderRadius: "50%",
                  background: `radial-gradient(ellipse at 50% 0%, ${cfg.color}40 0%, ${cfg.color}18 50%, transparent 75%)`,
                  clipPath: "inset(50% 0 0 0)",
                }} />
                <div style={{
                  position: "absolute", left: -1, top: 0, width: 2, height: beamLen,
                  background: `linear-gradient(180deg, ${cfg.color}ff 0%, ${cfg.color}88 40%, ${cfg.color}22 100%)`,
                  boxShadow: `0 0 6px ${cfg.color}aa`,
                }} />
                <div style={{ position: "absolute", left: -6, top: -6, width: 12, height: 12, borderRadius: "50%", background: cfg.color, boxShadow: `0 0 12px ${cfg.color}, 0 0 24px ${cfg.color}88, 0 0 36px ${cfg.color}44` }} />
              </div>
            );
          })}

          {renderMgbCharge()}
          {renderMgbBeam()}
          {renderExpandEntities()}
          {renderAnnoyanceEntities()}
          {renderFrustrationEntities()}

          {/* Player soul — only transition during box resize for responsive movement */}
          <div style={{
            position: "absolute",
            left: playerRender.x - PLAYER_R,
            top: playerRender.y - PLAYER_R,
            width: PLAYER_R * 2,
            height: PLAYER_R * 2,
            zIndex: 10,
            // No CSS transition — JS box lerp handles fluid repositioning
            opacity: iframeFeedback ? undefined : 1,
            animation: iframeFeedback ? "p2-iframe-blink 0.1s linear infinite" : "none",
          }}>
            <Heart
              size={PLAYER_R * 2}
              fill={iframeFeedback ? "#FFFFFF" : "#FF0000"}
              color={iframeFeedback ? "#FFFFFF" : "#FF0000"}
              style={{ filter: iframeFeedback ? "drop-shadow(0 0 8px #fff)" : "drop-shadow(0 0 4px rgba(255,0,0,0.6))" }}
            />
          </div>

          {/* Center crosshair */}
          <div className="absolute pointer-events-none" style={{
            left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            width: 20, height: 20, opacity: 0.1,
          }}>
            <div style={{ position: "absolute", left: 9, top: 0, width: 2, height: 20, background: colors.accent }} />
            <div style={{ position: "absolute", left: 0, top: 9, width: 20, height: 2, background: colors.accent }} />
          </div>
        </div>
      </div>

      {/* Debug controls */}
      {!hideDebugControls && (
        <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-[700px]">
          <span className="text-[10px] tracking-wider" style={{ color: "#FF4444", fontFamily: "'Courier New', monospace" }}>DEBUG</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => {
                setDemoMode(e.target.checked);
                if (!e.target.checked) {
                  if (attackTimeoutRef.current) clearTimeout(attackTimeoutRef.current);
                  if (stageTimeoutRef.current) clearTimeout(stageTimeoutRef.current);
                  if (mgBeamDissipateTimerRef.current) { clearTimeout(mgBeamDissipateTimerRef.current); mgBeamDissipateTimerRef.current = null; }
                  setIsAttacking(false);
                  setCurrentAttack("idle");
                  setStageVisible(false);
                  setMgBeamActive(false);
                  mgBeamActiveRef.current = false;
                  setMgBeamCharging(false);
                  setMgBeamDissipating(false);
                  setExpandActive(false);
                  expandActiveRef.current = false;
                  expandBoltsRef.current = [];
                  expandSwordsRef.current = [];
                  expandOrbsRef.current = [];
                  expandWaveRef.current = 0;
                  setBoxW(BASE_W);
                  setBoxH(BASE_H);
                }
              }}
              style={{ accentColor: colors.accent }}
            />
            <span className="text-[10px]" style={{ color: "#888", fontFamily: "'Courier New', monospace" }}>Auto-cycle</span>
          </label>
          {ATTACK_NAMES.map((n) => (
            <button
              key={n}
              disabled={isAttacking}
              onClick={() => runAttack(n)}
              className="text-[9px] px-2 py-1 cursor-pointer"
              style={{
                background: isAttacking ? "#111" : n === "stage" ? `${L.green}33` : n === "empress" ? "#FFD70022" : `${colors.accent}22`,
                color: isAttacking ? "#555" : n === "stage" ? L.yellow : n === "empress" ? "#FFD700" : colors.text,
                border: `1px solid ${isAttacking ? "#333" : n === "stage" ? L.yellow + "88" : n === "empress" ? "#FFD70088" : colors.accent + "66"}`,
                fontFamily: "'Courier New', monospace",
                opacity: isAttacking ? 0.5 : 1,
              }}
            >
              {n === "stage" ? "★ STAGE" : n === "empress" ? "★ EMPRESS" : n.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Player HP */}
      <div className="flex items-center gap-3 w-full max-w-[700px]">
        <Heart size={20} fill="#FF0000" color="#FF0000" />
        <span className="text-[16px]" style={{ color: colors.text, fontFamily: "'Courier New', monospace" }}>
          {playerHp} / {playerMaxHp}
        </span>
        <div className="flex-1 h-[16px]" style={{ background: "#333", border: `2px solid ${colors.accent}55` }}>
          <div className="h-full transition-all duration-300" style={{
            width: `${playerHpPct}%`,
            background: playerHpPct > 50 ? colors.bg : playerHpPct > 25 ? "#FF8800" : "#FF2222",
          }} />
        </div>
        <span className="text-[14px]" style={{ color: colors.text, fontFamily: "'Courier New', monospace" }}>
          SCR: {score}
        </span>
      </div>

      {/* Return */}
      <button
        onClick={onBack}
        className="text-[13px] px-6 py-2 cursor-pointer tracking-wider"
        style={{
          color: colors.text,
          border: `2px solid ${colors.accent}`,
          background: `${colors.accent}11`,
          fontFamily: "'Courier New', monospace",
        }}
      >
        Return
      </button>
    </div>
  );
});
BossFightPhase2.displayName = "BossFightPhase2";
