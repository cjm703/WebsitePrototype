import React, { useState, useEffect, useRef, useCallback } from "react";
import { retro } from "./retro-styles";
import { Play, RotateCcw, Pause, Trophy, Volume2, VolumeX, Clock, Zap, Shield, Infinity, Flame } from "lucide-react";
import { safeGetItem, safeSetItem } from "./safe-storage";
import { DISPLAY_CONTENTS, S_MUTED, S_DIM, S_ACCENT, S_TEXT, S_GREEN, S_RED } from "./shared-styles";

// ─── Canvas ────────────────────────────────────────────────
const CANVAS_W = 800;
const CANVAS_H = 600;
const CIRCLE_RADIUS = 32;
const APPROACH_RADIUS = 80;
const SPAWN_MARGIN = 70;
const MAX_HP = 100;
const TARGET_FRAME_MS = 1000 / 60;

// Hold / Slider shared
const HOLD_PROXIMITY = CIRCLE_RADIUS + 18;
const SLIDER_MIN_DIST = 120;
const SLIDER_MAX_DIST = 280;
const SLIDER_FOLLOW_RADIUS = 40; // legacy
const SLIDER_DROP_RADIUS = CIRCLE_RADIUS * 3; // lenient drop zone around endpoint

// ─── Difficulty system ─────────────────────────────────────
type Difficulty = "easy" | "medium" | "hard" | "infinite";
type CircleType = "tap" | "hold" | "slider";

interface DifficultyConfig {
  label: string;
  color: string;
  desc: string;
  timeLimit: number; // ms, 0 = no limit
  approachDuration: number;
  initialSpawnInterval: number;
  minSpawnInterval: number;
  spawnAccel: number;
  hitWindowPerfect: number;
  hitWindowGreat: number;
  hitWindowGood: number;
  missWindow: number;
  hpDrainMiss: number;
  hpGainPerfect: number;
  hpGainGreat: number;
  hpGainGood: number;
  hpPassiveDrain: number;
  holdIntroAfter: number;
  sliderIntroAfter: number;
  holdDurationMin: number;
  holdDurationMax: number;
  sliderDuration: number;
  // ── Balancing ──
  minHitTimeGap: number;      // min ms between any two circles' hit times
  minSpatialDist: number;     // min px between circles whose lifetimes overlap
  holdSliderBuffer: number;   // ms of free time after a hold/slider before next hit
  maxReachSpeed: number;      // px/ms assumed max cursor travel speed for distance check
  sliderDropRadius: number;   // px — lenient drop zone around slider endpoint
  // ── Patterns (tap bursts in line/snake shapes) ──
  patternChance: number;      // 0-1 chance per spawn to trigger a pattern
  patternInterval: number;    // ms between circles in a pattern burst
  patternMinLen: number;      // min circles in a pattern
  patternMaxLen: number;      // max circles in a pattern
}

const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    label: "EASY",
    color: "#4AFF4A",
    desc: "60 sec · Relaxed timing · Tap only at first",
    timeLimit: 60_000,
    approachDuration: 1600,
    initialSpawnInterval: 1400,
    minSpawnInterval: 700,
    spawnAccel: 0.998,
    hitWindowPerfect: 90,
    hitWindowGreat: 170,
    hitWindowGood: 300,
    missWindow: 450,
    hpDrainMiss: 10,
    hpGainPerfect: 8,
    hpGainGreat: 6,
    hpGainGood: 4,
    hpPassiveDrain: 0,
    holdIntroAfter: 12,
    sliderIntroAfter: 999, // no sliders
    holdDurationMin: 200,
    holdDurationMax: 400,
    sliderDuration: 1400,
    // ── Balancing ──
    minHitTimeGap: 100,
    minSpatialDist: 100,
    holdSliderBuffer: 500,
    maxReachSpeed: 10,
    sliderDropRadius: CIRCLE_RADIUS * 3,
    // ── Patterns ──
    patternChance: 0.08,
    patternInterval: 400,
    patternMinLen: 3,
    patternMaxLen: 4,
  },
  medium: {
    label: "MEDIUM",
    color: "#4AC0FF",
    desc: "90 sec · Standard timing · Holds & Sliders",
    timeLimit: 90_000,
    approachDuration: 1200,
    initialSpawnInterval: 880,
    minSpawnInterval: 400,
    spawnAccel: 0.997,
    hitWindowPerfect: 60,
    hitWindowGreat: 120,
    hitWindowGood: 220,
    missWindow: 300,
    hpDrainMiss: 15,
    hpGainPerfect: 6,
    hpGainGreat: 4,
    hpGainGood: 2,
    hpPassiveDrain: 0.01,
    holdIntroAfter: 8,
    sliderIntroAfter: 16,
    holdDurationMin: 270,
    holdDurationMax: 600,
    sliderDuration: 1200,
    // ── Balancing ──
    minHitTimeGap: 80,
    minSpatialDist: 80,
    holdSliderBuffer: 400,
    maxReachSpeed: 12,
    sliderDropRadius: CIRCLE_RADIUS * 1.5,
    // ── Patterns ──
    patternChance: 0.12,
    patternInterval: 320,
    patternMinLen: 3,
    patternMaxLen: 5,
  },
  hard: {
    label: "HARD",
    color: "#FF4A7B",
    desc: "120 sec · Tight timing · Everything from the start",
    timeLimit: 120_000,
    approachDuration: 850,
    initialSpawnInterval: 600,
    minSpawnInterval: 233,
    spawnAccel: 0.995,
    hitWindowPerfect: 40,
    hitWindowGreat: 90,
    hitWindowGood: 160,
    missWindow: 220,
    hpDrainMiss: 22,
    hpGainPerfect: 5,
    hpGainGreat: 3,
    hpGainGood: 1,
    hpPassiveDrain: 0.03,
    holdIntroAfter: 3,
    sliderIntroAfter: 5,
    holdDurationMin: 300,
    holdDurationMax: 730,
    sliderDuration: 1000,
    // ── Balancing ──
    minHitTimeGap: 60,
    minSpatialDist: 60,
    holdSliderBuffer: 300,
    maxReachSpeed: 15,
    sliderDropRadius: CIRCLE_RADIUS,
    // ── Patterns ──
    patternChance: 0.18,
    patternInterval: 240,
    patternMinLen: 4,
    patternMaxLen: 7,
  },
  infinite: {
    label: "INFINITE",
    color: "#FFD700",
    desc: "No time limit · Progressive difficulty · Survive!",
    timeLimit: 0,
    approachDuration: 1200,
    initialSpawnInterval: 1100,
    minSpawnInterval: 420,
    spawnAccel: 0.997,
    hitWindowPerfect: 60,
    hitWindowGreat: 120,
    hitWindowGood: 220,
    missWindow: 300,
    hpDrainMiss: 18,
    hpGainPerfect: 6,
    hpGainGreat: 4,
    hpGainGood: 2,
    hpPassiveDrain: 0.02,
    holdIntroAfter: 6,
    sliderIntroAfter: 14,
    holdDurationMin: 270,
    holdDurationMax: 670,
    sliderDuration: 1200,
    // ── Balancing ──
    minHitTimeGap: 50,
    minSpatialDist: 50,
    holdSliderBuffer: 200,
    maxReachSpeed: 18,
    sliderDropRadius: CIRCLE_RADIUS * 1.5,
    // ── Patterns ──
    patternChance: 0.14,
    patternInterval: 280,
    patternMinLen: 3,
    patternMaxLen: 6,
  },
};

// ─── Data types ──────────────────────────────────────────
interface HitCircle {
  id: number;
  x: number;
  y: number;
  spawnTime: number;
  hitTime: number;
  hit: boolean;
  missed: boolean;
  number: number;
  type: CircleType;
  holdDuration: number;
  holdStartTime: number;
  holding: boolean;
  holdComplete: boolean;
  endX: number;
  endY: number;
  sliderStartTime: number;
  sliderActive: boolean;
  sliderComplete: boolean;
  sliderFailed: boolean;
}

interface HitEffect {
  x: number;
  y: number;
  text: string;
  color: string;
  time: number;
  combo: number;
}

interface RingEffect {
  x: number;
  y: number;
  time: number;
  color: string;
}

// ─── Component ────────────────────────────────────────────
export function OsuGame({
  onBack,
  onScoreSave,
}: {
  onBack: () => void;
  onScoreSave?: (score: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<"idle" | "playing" | "paused" | "gameover">("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(() => {
    const saved = safeGetItem("inet-rhythm-volume");
    return saved ? parseInt(saved, 10) : 50;
  });
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);

  // YouTube IFrame API for background music with volume control
  useEffect(() => {
    if (!musicPlaying) {
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
      return;
    }
    const YOUTUBE_VIDEO_ID = "mfuGEpCNvzk";
    const loadYTApi = (): Promise<void> => {
      return new Promise((resolve) => {
        if ((window as any).YT && (window as any).YT.Player) { resolve(); return; }
        const existing = document.getElementById("yt-iframe-api");
        if (existing) {
          const prevCb = (window as any).onYouTubeIframeAPIReady;
          (window as any).onYouTubeIframeAPIReady = () => { if (prevCb) prevCb(); resolve(); };
          return;
        }
        const tag = document.createElement("script");
        tag.id = "yt-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        (window as any).onYouTubeIframeAPIReady = () => resolve();
        document.head.appendChild(tag);
      });
    };
    let cancelled = false;
    loadYTApi().then(() => {
      if (cancelled || !ytContainerRef.current) return;
      const playerDiv = document.createElement("div");
      playerDiv.id = "yt-rhythm-music-" + Date.now();
      ytContainerRef.current.appendChild(playerDiv);
      const player = new (window as any).YT.Player(playerDiv.id, {
        height: "1", width: "1",
        videoId: YOUTUBE_VIDEO_ID,
        playerVars: { autoplay: 1, loop: 1, playlist: YOUTUBE_VIDEO_ID, controls: 0, disablekb: 1, modestbranding: 1, rel: 0 },
        events: {
          onReady: (event: any) => {
            if (cancelled) return;
            ytPlayerRef.current = event.target;
            event.target.setVolume(musicVolume);
            event.target.unMute();
            event.target.playVideo();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy(); } catch {} ytPlayerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicPlaying]);

  // Sync volume
  useEffect(() => {
    safeSetItem("inet-rhythm-volume", String(musicVolume));
    if (ytPlayerRef.current) { try { ytPlayerRef.current.setVolume(musicVolume); } catch {} }
  }, [musicVolume]);

  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const diffRef = useRef<DifficultyConfig | null>(null);

  const circlesRef = useRef<HitCircle[]>([]);
  const effectsRef = useRef<HitEffect[]>([]);
  const ringsRef = useRef<RingEffect[]>([]);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const hpRef = useRef(MAX_HP);
  const nextIdRef = useRef(0);
  const circleNumRef = useRef(1);
  const spawnIntervalRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const perfectsRef = useRef(0);
  const greatsRef = useRef(0);
  const goodsRef = useRef(0);
  const missesRef = useRef(0);
  const gameElapsedRef = useRef(0); // gameplay ms elapsed (excludes pauses)
  const lastFrameTimeRef = useRef(0);
  const frameCapTimeRef = useRef(0);
  const endReasonRef = useRef<"hp" | "time">("hp");

  const mouseDownRef = useRef(false);
  const mouseXRef = useRef(0);
  const mouseYRef = useRef(0);
  const activeHoldIdRef = useRef<number | null>(null);
  const activeSliderIdRef = useRef<number | null>(null);

  const pauseStartRef = useRef(0);
  const totalPausedRef = useRef(0);
  const totalSpawnedRef = useRef(0);
  const patternQueueRef = useRef<Array<{ x: number; y: number }>>([]);

  const HIGHSCORE_KEY = "inet-osu-highscore";

  useEffect(() => {
    const saved = safeGetItem(HIGHSCORE_KEY);
    if (saved) setHighScore(parseInt(saved, 10) || 0);
  }, []);

  const getCanvasCoords = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((clientY - rect.top) / rect.height) * CANVAS_H,
    };
  }, []);

  // ── Pattern generator: line or snake of tap positions ──
  const generatePattern = useCallback((): Array<{ x: number; y: number }> => {
    const cfg = diffRef.current;
    if (!cfg) return [];
    const count = cfg.patternMinLen + Math.floor(Math.random() * (cfg.patternMaxLen - cfg.patternMinLen + 1));
    const spacing = CIRCLE_RADIUS * 3; // generous spacing between circles
    const minDist = CIRCLE_RADIUS * 2.2; // overlap rejection threshold
    const angle = Math.random() * Math.PI * 2;
    const isSnake = Math.random() > 0.4; // 60% snake, 40% straight line
    const snakeAmp = spacing * 0.6; // perpendicular wave amplitude

    // Padding accounts for both the line reach AND the snake amplitude
    const reach = spacing * (count - 1);
    const perpMax = isSnake ? snakeAmp : 0;
    const padX = SPAWN_MARGIN + CIRCLE_RADIUS +
      Math.abs(Math.cos(angle)) * reach * 0.5 +
      Math.abs(Math.sin(angle)) * perpMax;
    const padY = SPAWN_MARGIN + 40 + CIRCLE_RADIUS +
      Math.abs(Math.sin(angle)) * reach * 0.5 +
      Math.abs(Math.cos(angle)) * perpMax;
    const rangeX = Math.max(1, CANVAS_W - padX * 2);
    const rangeY = Math.max(1, CANVAS_H - padY * 2);
    const startX = padX + Math.random() * rangeX;
    const startY = padY + Math.random() * rangeY;

    const raw: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i++) {
      const along = i * spacing;
      const perp = isSnake ? Math.sin(i * 1.0 + Math.random() * 0.3) * snakeAmp : 0;
      let px = startX + Math.cos(angle) * along - Math.sin(angle) * perp;
      let py = startY + Math.sin(angle) * along + Math.cos(angle) * perp;
      px = Math.max(SPAWN_MARGIN, Math.min(CANVAS_W - SPAWN_MARGIN, px));
      py = Math.max(SPAWN_MARGIN + 40, Math.min(CANVAS_H - SPAWN_MARGIN, py));
      raw.push({ x: px, y: py });
    }

    // Filter out any point that overlaps a previously accepted point
    const accepted: Array<{ x: number; y: number }> = [];
    for (const pt of raw) {
      let tooClose = false;
      for (const prev of accepted) {
        if (Math.sqrt((pt.x - prev.x) ** 2 + (pt.y - prev.y) ** 2) < minDist) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) accepted.push(pt);
    }

    // Need at least 3 valid points for a worthwhile pattern
    return accepted.length >= 3 ? accepted : [];
  }, []);

  const spawnCircle = useCallback((now: number) => {
    const cfg = diffRef.current;
    if (!cfg) return;
    const total = totalSpawnedRef.current;
    const candidateHitTime = now + cfg.approachDuration;

    // ── Pattern post-hold grace: if a hold/slider is still "busy" or ended
    //    less than 500ms before our hit time, delay pattern circles so the
    //    player has breathing room after releasing a hold. ──
    const PATTERN_POST_HOLD_GRACE = 500;
    const patternBlockedByHold = (): boolean => {
      const live = circlesRef.current.filter((c) => !c.hit && !c.missed);
      for (const ex of live) {
        if (ex.type === "hold") {
          const busyEnd = ex.hitTime + ex.holdDuration + cfg.holdSliderBuffer;
          if (candidateHitTime >= ex.hitTime && candidateHitTime <= busyEnd + PATTERN_POST_HOLD_GRACE) return true;
        }
        if (ex.type === "slider") {
          const busyEnd = ex.hitTime + cfg.sliderDuration + cfg.holdSliderBuffer;
          if (candidateHitTime >= ex.hitTime && candidateHitTime <= busyEnd + PATTERN_POST_HOLD_GRACE) return true;
        }
      }
      return false;
    };

    // ── Pattern queue: consume queued tap positions first ──
    if (patternQueueRef.current.length > 0) {
      if (patternBlockedByHold()) {
        patternQueueRef.current = [];
        return;
      }
      const pos = patternQueueRef.current.shift()!;
      circlesRef.current.push({
        id: nextIdRef.current++,
        x: pos.x,
        y: pos.y,
        spawnTime: now,
        hitTime: candidateHitTime,
        hit: false,
        missed: false,
        number: circleNumRef.current > 9 ? (circleNumRef.current = 1) : circleNumRef.current++,
        type: "tap",
        holdDuration: 0,
        holdStartTime: 0,
        holding: false,
        holdComplete: false,
        endX: pos.x,
        endY: pos.y,
        sliderStartTime: 0,
        sliderActive: false,
        sliderComplete: false,
        sliderFailed: false,
      });
      totalSpawnedRef.current++;
      return;
    }

    // ── Maybe start a new pattern? ──
    if (total > 6 && Math.random() < cfg.patternChance && !patternBlockedByHold()) {
      const pts = generatePattern();
      if (pts.length > 0) {
        // Spawn the first one now, queue the rest
        const first = pts.shift()!;
        patternQueueRef.current = pts;
        circlesRef.current.push({
          id: nextIdRef.current++,
          x: first.x,
          y: first.y,
          spawnTime: now,
          hitTime: candidateHitTime,
          hit: false,
          missed: false,
          number: circleNumRef.current > 9 ? (circleNumRef.current = 1) : circleNumRef.current++,
          type: "tap",
          holdDuration: 0,
          holdStartTime: 0,
          holding: false,
          holdComplete: false,
          endX: first.x,
          endY: first.y,
          sliderStartTime: 0,
          sliderActive: false,
          sliderComplete: false,
          sliderFailed: false,
        });
        totalSpawnedRef.current++;
        return;
      }
    }

    // ── Normal single-circle spawn ──
    let type: CircleType = "tap";
    if (total > cfg.holdIntroAfter) {
      const r = Math.random();
      const holdChance = Math.min(0.25, (total - cfg.holdIntroAfter) * 0.01);
      const sliderChance =
        total > cfg.sliderIntroAfter ? Math.min(0.2, (total - cfg.sliderIntroAfter) * 0.008) : 0;
      if (r < holdChance) type = "hold";
      else if (r < holdChance + sliderChance) type = "slider";
    }

    // Pre-roll hold duration so we can validate its busy window
    const holdDuration =
      type === "hold"
        ? cfg.holdDurationMin + Math.random() * (cfg.holdDurationMax - cfg.holdDurationMin)
        : 0;

    // ── Gather live circles for validation ──
    const live = circlesRef.current.filter((c) => !c.hit && !c.missed);

    // ── Hold / Slider temporal exclusion ──
    const busyWindowOk = (): boolean => {
      for (const ex of live) {
        if (ex.type === "hold") {
          const end = ex.hitTime + ex.holdDuration + cfg.holdSliderBuffer;
          if (candidateHitTime >= ex.hitTime && candidateHitTime <= end) return false;
        }
        if (ex.type === "slider") {
          const end = ex.hitTime + cfg.sliderDuration + cfg.holdSliderBuffer;
          if (candidateHitTime >= ex.hitTime && candidateHitTime <= end) return false;
        }
        if (type === "hold") {
          const end = candidateHitTime + holdDuration + cfg.holdSliderBuffer;
          if (ex.hitTime >= candidateHitTime && ex.hitTime <= end) return false;
        }
        if (type === "slider") {
          const end = candidateHitTime + cfg.sliderDuration + cfg.holdSliderBuffer;
          if (ex.hitTime >= candidateHitTime && ex.hitTime <= end) return false;
        }
      }
      return true;
    };

    // Downgrade hold/slider → tap if temporal conflict
    if ((type === "hold" || type === "slider") && !busyWindowOk()) {
      type = "tap";
    }

    // Skip if active hold/slider blocks this hit time
    if (type === "tap") {
      for (const ex of live) {
        if (ex.type === "hold") {
          const end = ex.hitTime + ex.holdDuration + cfg.holdSliderBuffer;
          if (candidateHitTime >= ex.hitTime && candidateHitTime <= end) return;
        }
        if (ex.type === "slider") {
          const end = ex.hitTime + cfg.sliderDuration + cfg.holdSliderBuffer;
          if (candidateHitTime >= ex.hitTime && candidateHitTime <= end) return;
        }
      }
    }

    // ── Reachability + minimum gap check ──
    const hitTimeGapOk = (cx: number, cy: number): boolean => {
      for (const ex of live) {
        const tGap = Math.abs(candidateHitTime - ex.hitTime);
        if (tGap < cfg.minHitTimeGap) return false;
        if (tGap < cfg.approachDuration) {
          let rx = ex.x, ry = ex.y;
          if (ex.type === "slider") { rx = ex.endX; ry = ex.endY; }
          const dist = Math.sqrt((cx - rx) ** 2 + (cy - ry) ** 2);
          if (dist / cfg.maxReachSpeed > tGap) return false;
        }
      }
      return true;
    };

    // ── Spatial separation check ──
    const spatialOk = (cx: number, cy: number, cex: number, cey: number): boolean => {
      for (const ex of live) {
        const tGap = Math.abs(candidateHitTime - ex.hitTime);
        if (tGap < cfg.approachDuration * 0.8) {
          if (Math.sqrt((cx - ex.x) ** 2 + (cy - ex.y) ** 2) < cfg.minSpatialDist) return false;
          if (type === "slider") {
            if (Math.sqrt((cex - ex.x) ** 2 + (cey - ex.y) ** 2) < cfg.minSpatialDist) return false;
          }
          if (ex.type === "slider") {
            if (Math.sqrt((cx - ex.endX) ** 2 + (cy - ex.endY) ** 2) < cfg.minSpatialDist) return false;
          }
        }
      }
      return true;
    };

    // ── Generate position with retries ──
    const MAX_RETRIES = 12;
    let x = 0, y = 0, endX = 0, endY = 0;
    let placed = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      x = SPAWN_MARGIN + Math.random() * (CANVAS_W - SPAWN_MARGIN * 2);
      y = SPAWN_MARGIN + Math.random() * (CANVAS_H - SPAWN_MARGIN * 2 - 40) + 40;
      endX = x;
      endY = y;

      if (type === "slider") {
        const angle = Math.random() * Math.PI * 2;
        const dist = SLIDER_MIN_DIST + Math.random() * (SLIDER_MAX_DIST - SLIDER_MIN_DIST);
        endX = Math.max(SPAWN_MARGIN, Math.min(CANVAS_W - SPAWN_MARGIN, x + Math.cos(angle) * dist));
        endY = Math.max(SPAWN_MARGIN + 40, Math.min(CANVAS_H - SPAWN_MARGIN, y + Math.sin(angle) * dist));
        x = Math.max(SPAWN_MARGIN, Math.min(CANVAS_W - SPAWN_MARGIN, x));
        y = Math.max(SPAWN_MARGIN + 40, Math.min(CANVAS_H - SPAWN_MARGIN, y));
      }

      if (spatialOk(x, y, endX, endY) && hitTimeGapOk(x, y)) {
        placed = true;
        break;
      }
    }

    if (!placed) { /* best-effort fallback */ }

    circlesRef.current.push({
      id: nextIdRef.current++,
      x,
      y,
      spawnTime: now,
      hitTime: candidateHitTime,
      hit: false,
      missed: false,
      number: circleNumRef.current > 9 ? (circleNumRef.current = 1) : circleNumRef.current++,
      type,
      holdDuration: type === "hold" ? holdDuration : 0,
      holdStartTime: 0,
      holding: false,
      holdComplete: false,
      endX,
      endY,
      sliderStartTime: 0,
      sliderActive: false,
      sliderComplete: false,
      sliderFailed: false,
    });
    totalSpawnedRef.current++;
  }, [generatePattern]);

  const awardPoints = useCallback(
    (x: number, y: number, timing: "perfect" | "great" | "good" | "ok", now: number) => {
      const cfg = diffRef.current;
      if (!cfg) return;
      let points: number, text: string, color: string;
      switch (timing) {
        case "perfect":
          points = 300;
          text = "PERFECT!";
          color = "#FFD700";
          hpRef.current = Math.min(MAX_HP, hpRef.current + cfg.hpGainPerfect);
          perfectsRef.current++;
          break;
        case "great":
          points = 200;
          text = "GREAT!";
          color = "#4AFF4A";
          hpRef.current = Math.min(MAX_HP, hpRef.current + cfg.hpGainGreat);
          greatsRef.current++;
          break;
        case "good":
          points = 100;
          text = "GOOD";
          color = "#4AC0FF";
          hpRef.current = Math.min(MAX_HP, hpRef.current + cfg.hpGainGood);
          goodsRef.current++;
          break;
        default:
          points = 50;
          text = "OK";
          color = "#5A6A8A";
          goodsRef.current++;
      }
      comboRef.current++;
      if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current;
      const comboMult = 1 + Math.floor(comboRef.current / 10) * 0.5;
      scoreRef.current += Math.floor(points * comboMult);
      setScore(scoreRef.current);
      effectsRef.current.push({ x, y, text, color, time: now, combo: comboRef.current });
      ringsRef.current.push({ x, y, time: now, color });
    },
    []
  );

  const doMiss = useCallback((x: number, y: number, now: number) => {
    const cfg = diffRef.current;
    if (!cfg) return;
    comboRef.current = 0;
    hpRef.current = Math.max(0, hpRef.current - cfg.hpDrainMiss);
    missesRef.current++;
    effectsRef.current.push({ x, y, text: "MISS", color: "#FF4444", time: now, combo: 0 });
  }, []);

  const getTimingGrade = useCallback(
    (timeDiff: number): "perfect" | "great" | "good" | "ok" => {
      const cfg = diffRef.current;
      if (!cfg) return "ok";
      if (timeDiff <= cfg.hitWindowPerfect) return "perfect";
      if (timeDiff <= cfg.hitWindowGreat) return "great";
      if (timeDiff <= cfg.hitWindowGood) return "good";
      return "ok";
    },
    []
  );

  const resetGame = useCallback(() => {
    circlesRef.current = [];
    effectsRef.current = [];
    ringsRef.current = [];
    scoreRef.current = 0;
    comboRef.current = 0;
    maxComboRef.current = 0;
    hpRef.current = MAX_HP;
    nextIdRef.current = 0;
    circleNumRef.current = 1;
    spawnIntervalRef.current = 0;
    lastSpawnRef.current = 0;
    perfectsRef.current = 0;
    greatsRef.current = 0;
    goodsRef.current = 0;
    missesRef.current = 0;
    activeHoldIdRef.current = null;
    activeSliderIdRef.current = null;
    totalSpawnedRef.current = 0;
    patternQueueRef.current = [];
    totalPausedRef.current = 0;
    gameElapsedRef.current = 0;
    lastFrameTimeRef.current = 0;
    frameCapTimeRef.current = 0;
    endReasonRef.current = "hp";
    setScore(0);
    setTimeLeft(0);
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);

  const startGame = useCallback(
    (diff: Difficulty) => {
      resetGame();
      const cfg = DIFFICULTIES[diff];
      diffRef.current = cfg;
      spawnIntervalRef.current = cfg.initialSpawnInterval;
      setDifficulty(diff);
      if (cfg.timeLimit > 0) setTimeLeft(cfg.timeLimit);
      startTimeRef.current = performance.now();
      lastSpawnRef.current = performance.now();
      lastFrameTimeRef.current = performance.now();
      frameCapTimeRef.current = 0;
      totalPausedRef.current = 0;
      setGameState("playing");
    },
    [resetGame]
  );

  const togglePause = useCallback(() => {
    if (gameStateRef.current === "playing") {
      pauseStartRef.current = performance.now();
      setGameState("paused");
    } else if (gameStateRef.current === "paused") {
      const pausedDuration = performance.now() - pauseStartRef.current;
      totalPausedRef.current += pausedDuration;
      for (const c of circlesRef.current) {
        c.spawnTime += pausedDuration;
        c.hitTime += pausedDuration;
        if (c.holdStartTime > 0) c.holdStartTime += pausedDuration;
        if (c.sliderStartTime > 0) c.sliderStartTime += pausedDuration;
      }
      lastSpawnRef.current += pausedDuration;
      lastFrameTimeRef.current += pausedDuration;
      frameCapTimeRef.current = 0;
      setGameState("playing");
    }
  }, []);

  const endGame = useCallback(
    (reason: "hp" | "time") => {
      activeHoldIdRef.current = null;
      activeSliderIdRef.current = null;
      endReasonRef.current = reason;
      setGameState("gameover");
      const finalScore = scoreRef.current;
      const savedHigh = parseInt(safeGetItem(HIGHSCORE_KEY) || "0", 10);
      if (finalScore > savedHigh) {
        safeSetItem(HIGHSCORE_KEY, String(finalScore));
        setHighScore(finalScore);
      }
      if (finalScore > 0) onScoreSave?.(finalScore);
    },
    [onScoreSave]
  );

  // ─── Mouse handlers ────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault(); // prevent native drag
      e.stopPropagation();
      const { x: mx, y: my } = getCanvasCoords(e);
      mouseDownRef.current = true;
      mouseXRef.current = mx;
      mouseYRef.current = my;

      if (gameStateRef.current !== "playing") return;
      const now = performance.now();
      const cfg = diffRef.current;
      if (!cfg) return;

      // Gather all circles under cursor
      const candidates: HitCircle[] = [];
      for (const c of circlesRef.current) {
        if (c.hit || c.missed || c.holding || c.sliderActive) continue;
        const dist = Math.sqrt((mx - c.x) ** 2 + (my - c.y) ** 2);
        if (dist <= CIRCLE_RADIUS + 10) {
          candidates.push(c);
        }
      }
      if (candidates.length === 0) return;

      // Prioritise tap circles so they never get eclipsed by hold/slider
      const taps = candidates.filter((c) => c.type === "tap");
      let best: HitCircle;
      if (taps.length > 0) {
        // Among taps pick the one closest to its hitTime
        best = taps.reduce((a, b) =>
          Math.abs(now - a.hitTime) < Math.abs(now - b.hitTime) ? a : b
        );
      } else {
        best = candidates.reduce((a, b) =>
          Math.abs(now - a.hitTime) < Math.abs(now - b.hitTime) ? a : b
        );
      }

      const timeDiff = Math.abs(now - best.hitTime);

      if (best.type === "tap") {
        best.hit = true;
        awardPoints(best.x, best.y, getTimingGrade(timeDiff), now);
      } else if (best.type === "hold") {
        best.holding = true;
        best.holdStartTime = now;
        activeHoldIdRef.current = best.id;
      } else if (best.type === "slider") {
        best.sliderActive = true;
        best.sliderStartTime = now;
        activeSliderIdRef.current = best.id;
        if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
      }
    },
    [getCanvasCoords, awardPoints, getTimingGrade]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const { x: mx, y: my } = getCanvasCoords(e);
      mouseXRef.current = mx;
      mouseYRef.current = my;
      if (gameStateRef.current !== "playing") return;

      if (activeHoldIdRef.current !== null) {
        const c = circlesRef.current.find((ci) => ci.id === activeHoldIdRef.current);
        if (c && c.holding && !c.holdComplete) {
          if (Math.sqrt((mx - c.x) ** 2 + (my - c.y) ** 2) > HOLD_PROXIMITY) {
            c.holding = false;
            c.missed = true;
            activeHoldIdRef.current = null;
            doMiss(c.x, c.y, performance.now());
          }
        } else {
          // Circle gone / already completed — clean up stale ref
          activeHoldIdRef.current = null;
        }
      }

      if (activeSliderIdRef.current !== null) {
        const c = circlesRef.current.find((ci) => ci.id === activeSliderIdRef.current);
        if (!c || c.sliderComplete || c.sliderFailed || !c.sliderActive) {
          // Circle gone / already completed — clean up stale ref
          activeSliderIdRef.current = null;
        }
        // Slider circle follows cursor — no distance-fail check.
        // Success/fail is determined on mouseUp (drop near endpoint).
      }
    },
    [getCanvasCoords, doMiss]
  );

  const handleMouseUp = useCallback(
    (_e: MouseEvent) => {
      mouseDownRef.current = false;
      if (gameStateRef.current !== "playing") return;
      const now = performance.now();
      const cfg = diffRef.current;
      if (!cfg) return;

      if (activeHoldIdRef.current !== null) {
        const c = circlesRef.current.find((ci) => ci.id === activeHoldIdRef.current);
        if (c && c.holding && !c.holdComplete) {
          const held = now - c.holdStartTime;
          if (held >= c.holdDuration * 0.85) {
            c.holdComplete = true;
            c.hit = true;
            c.holding = false;
            const ratio = Math.min(1, held / c.holdDuration);
            awardPoints(c.x, c.y, ratio >= 0.97 ? "perfect" : ratio >= 0.9 ? "great" : "good", now);
          } else {
            c.holding = false;
            c.missed = true;
            doMiss(c.x, c.y, now);
          }
        }
        activeHoldIdRef.current = null;
      }

      if (activeSliderIdRef.current !== null) {
        const c = circlesRef.current.find((ci) => ci.id === activeSliderIdRef.current);
        if (c && c.sliderActive && !c.sliderComplete && !c.sliderFailed) {
          // Drag-and-drop: grade by distance from cursor to endpoint
          const dropDist = Math.sqrt(
            (mouseXRef.current - c.endX) ** 2 + (mouseYRef.current - c.endY) ** 2
          );
          if (dropDist <= cfg.sliderDropRadius) {
            c.sliderComplete = true;
            c.hit = true;
            c.sliderActive = false;
            const dr = cfg.sliderDropRadius;
            const grade: "perfect" | "great" | "good" =
              dropDist <= dr * 0.25
                ? "perfect"
                : dropDist <= dr * 0.6
                  ? "great"
                  : "good";
            awardPoints(c.endX, c.endY, grade, now);
          } else {
            // Dropped too far from endpoint
            c.sliderFailed = true;
            c.sliderActive = false;
            c.missed = true;
            doMiss(mouseXRef.current, mouseYRef.current, now);
          }
        }
        activeSliderIdRef.current = null;
        if (canvasRef.current) canvasRef.current.style.cursor = "crosshair";
      }
    },
    [awardPoints, doMiss]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        if (gameStateRef.current === "paused") togglePause();
      }
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePause]);

  // ─── Game loop ───────────────────────────────────────────
  useEffect(() => {
    if (gameState !== "playing") {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      requestAnimationFrame((now) => drawFrame(now));
      return;
    }

    const loop = (now: number) => {
      const cfg = diffRef.current;
      if (!cfg) return;
      if (frameCapTimeRef.current !== 0 && now - frameCapTimeRef.current < TARGET_FRAME_MS) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }
      frameCapTimeRef.current = now;

      // Track elapsed game time
      const dt = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      gameElapsedRef.current += dt;

      // Check time limit
      if (cfg.timeLimit > 0) {
        const remaining = cfg.timeLimit - gameElapsedRef.current;
        setTimeLeft(Math.max(0, remaining));
        if (remaining <= 0) {
          endGame("time");
          drawFrame(now);
          return;
        }
      }

      // Spawn — use shorter interval during pattern bursts
      const activeInterval = patternQueueRef.current.length > 0
        ? cfg.patternInterval
        : spawnIntervalRef.current;
      if (now - lastSpawnRef.current >= activeInterval) {
        spawnCircle(now);
        lastSpawnRef.current = now;
        // Only accelerate the base interval on normal spawns
        if (patternQueueRef.current.length === 0) {
          spawnIntervalRef.current = Math.max(
            cfg.minSpawnInterval,
            spawnIntervalRef.current * cfg.spawnAccel
          );
        }
      }

      // Update holds
      if (activeHoldIdRef.current !== null) {
        const c = circlesRef.current.find((ci) => ci.id === activeHoldIdRef.current);
        if (c && c.holding && !c.holdComplete) {
          if (now - c.holdStartTime >= c.holdDuration) {
            c.holdComplete = true;
            c.hit = true;
            c.holding = false;
            activeHoldIdRef.current = null;
            awardPoints(c.x, c.y, "perfect", now);
          }
        }
      }

      // Update sliders – timeout if held too long without dropping
      if (activeSliderIdRef.current !== null) {
        const c = circlesRef.current.find((ci) => ci.id === activeSliderIdRef.current);
        if (c && c.sliderActive && !c.sliderComplete && !c.sliderFailed) {
          const elapsed = now - c.sliderStartTime;
          // Allow generous time: sliderDuration * 3 before auto-fail
          if (elapsed > cfg.sliderDuration * 3) {
            c.sliderFailed = true;
            c.sliderActive = false;
            c.missed = true;
            activeSliderIdRef.current = null;
            if (canvasRef.current) canvasRef.current.style.cursor = "crosshair";
            doMiss(mouseXRef.current, mouseYRef.current, now);
          }
        }
      }

      // Miss check
      for (const c of circlesRef.current) {
        if (c.hit || c.missed || c.holding || c.sliderActive) continue;
        if (now - c.hitTime > cfg.missWindow) {
          c.missed = true;
          doMiss(c.x, c.y, now);
        }
      }

      // Passive drain
      hpRef.current = Math.max(0, hpRef.current - cfg.hpPassiveDrain);

      // Cleanup
      circlesRef.current = circlesRef.current.filter(
        (c) => !(c.hit || c.missed) || now - (c.hitTime || c.spawnTime) < 500
      );
      effectsRef.current = effectsRef.current.filter((e) => now - e.time < 800);
      ringsRef.current = ringsRef.current.filter((r) => now - r.time < 400);

      if (hpRef.current <= 0) {
        endGame("hp");
        drawFrame(now);
        return;
      }

      drawFrame(now);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [gameState, spawnCircle, endGame, awardPoints, doMiss]);

  // ─── Drawing ─────────────────────────────────────────────
  const drawFrame = (now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cfg = diffRef.current;

    ctx.fillStyle = "#08082A";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Grid
    ctx.strokeStyle = "rgba(74, 123, 255, 0.04)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx < CANVAS_W; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, CANVAS_H);
      ctx.stroke();
    }
    for (let gy = 0; gy < CANVAS_H; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(CANVAS_W, gy);
      ctx.stroke();
    }

    // Particles
    const gameTime = now - startTimeRef.current;
    for (let i = 0; i < 15; i++) {
      const px = (i * 137 + gameTime * 0.01 * (0.3 + (i % 3) * 0.2)) % CANVAS_W;
      const py = (i * 89 + gameTime * 0.008 * (0.2 + (i % 4) * 0.15)) % CANVAS_H;
      ctx.fillStyle = `rgba(74, 123, 255, ${0.08 + Math.sin(gameTime * 0.001 + i) * 0.04})`;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ring effects
    for (const ring of ringsRef.current) {
      const prog = (now - ring.time) / 400;
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = Math.max(0, (1 - prog) * 0.6);
      ctx.lineWidth = Math.max(0.5, 3 - prog * 2);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, CIRCLE_RADIUS + prog * 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Slider paths (pass 1)
    for (const c of circlesRef.current) {
      if (c.type !== "slider" || c.hit || c.missed) continue;
      const approachProg = Math.min(1, (now - c.spawnTime) / (cfg?.approachDuration ?? 1200));
      const lineAlpha = approachProg * 0.5;

      ctx.save();
      ctx.strokeStyle = `rgba(255, 165, 80, ${lineAlpha})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.endX, c.endY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      ctx.strokeStyle = `rgba(255, 165, 80, ${lineAlpha * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.endX, c.endY, CIRCLE_RADIUS * 0.75, 0, Math.PI * 2);
      ctx.stroke();

      const angle = Math.atan2(c.endY - c.y, c.endX - c.x);
      ctx.fillStyle = `rgba(255, 165, 80, ${lineAlpha * 0.8})`;
      ctx.beginPath();
      ctx.moveTo(
        c.endX - Math.cos(angle - 0.4) * (CIRCLE_RADIUS * 0.75 + 10),
        c.endY - Math.sin(angle - 0.4) * (CIRCLE_RADIUS * 0.75 + 10)
      );
      ctx.lineTo(
        c.endX - Math.cos(angle) * (CIRCLE_RADIUS * 0.75 - 2),
        c.endY - Math.sin(angle) * (CIRCLE_RADIUS * 0.75 - 2)
      );
      ctx.lineTo(
        c.endX - Math.cos(angle + 0.4) * (CIRCLE_RADIUS * 0.75 + 10),
        c.endY - Math.sin(angle + 0.4) * (CIRCLE_RADIUS * 0.75 + 10)
      );
      ctx.closePath();
      ctx.fill();

      if (c.sliderActive) {
        // Circle follows cursor
        const dragX = mouseXRef.current;
        const dragY = mouseYRef.current;

        // Trail from origin to cursor
        ctx.strokeStyle = "rgba(255, 200, 100, 0.5)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(dragX, dragY);
        ctx.stroke();

        // Dragged circle
        ctx.fillStyle = "rgba(10, 10, 50, 0.85)";
        ctx.strokeStyle = "#FFA550";
        ctx.shadowColor = "#FFA550";
        ctx.shadowBlur = 18;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(dragX, dragY, CIRCLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Arrow inside dragged circle
        const dragAngle = Math.atan2(c.endY - dragY, c.endX - dragX);
        ctx.fillStyle = "#FFA550";
        ctx.save();
        ctx.translate(dragX, dragY);
        ctx.rotate(dragAngle);
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-4, -8);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-12, -3);
        ctx.lineTo(-12, 3);
        ctx.lineTo(-4, 3);
        ctx.lineTo(-4, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Drop zone glow at endpoint — brighter when cursor is close
        const dropR = cfg?.sliderDropRadius ?? SLIDER_DROP_RADIUS;
        const distToDrop = Math.sqrt((dragX - c.endX) ** 2 + (dragY - c.endY) ** 2);
        const proximity = Math.max(0, 1 - distToDrop / (dropR * 1.5));

        // Drop zone ring
        ctx.strokeStyle = `rgba(255, 200, 80, ${0.15 + proximity * 0.6})`;
        ctx.lineWidth = 2 + proximity * 3;
        ctx.beginPath();
        ctx.arc(c.endX, c.endY, dropR, 0, Math.PI * 2);
        ctx.stroke();

        // Inner glow when close
        if (proximity > 0.3) {
          ctx.fillStyle = `rgba(255, 200, 80, ${proximity * 0.12})`;
          ctx.beginPath();
          ctx.arc(c.endX, c.endY, dropR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Pulsing endpoint marker
        const pulse = Math.sin(now * 0.006) * 4;
        ctx.strokeStyle = `rgba(255, 165, 80, ${0.4 + proximity * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.endX, c.endY, CIRCLE_RADIUS * 0.75 + pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Circles (pass 2)
    const approachDur = cfg?.approachDuration ?? 1200;
    for (const c of circlesRef.current) {
      if (c.hit || c.missed || c.holdComplete || c.sliderComplete) continue;
      // Skip drawing at spawn pos when being dragged (drawn at cursor in pass 1)
      if (c.sliderActive) continue;
      const progress = Math.min(1, (now - c.spawnTime) / approachDur);
      const approachR = APPROACH_RADIUS - (APPROACH_RADIUS - CIRCLE_RADIUS) * progress;

      let circleColor: string;
      if (c.type === "hold") {
        circleColor = progress < 0.5 ? "#22CC88" : progress < 0.8 ? "#44AACC" : "#CC4488";
      } else if (c.type === "slider") {
        circleColor = progress < 0.5 ? "#FFA550" : progress < 0.8 ? "#FF8844" : "#FF5533";
      } else {
        circleColor = progress < 0.5 ? "#4A7BFF" : progress < 0.8 ? "#7B4AFF" : "#FF4A7B";
      }

      ctx.shadowColor = circleColor;
      ctx.shadowBlur = 15;
      ctx.fillStyle = "rgba(10, 10, 50, 0.8)";
      ctx.strokeStyle = circleColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, CIRCLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (c.type === "hold") {
        ctx.strokeStyle = circleColor;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, CIRCLE_RADIUS - 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(c.x, c.y, CIRCLE_RADIUS - 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (c.holding) {
          const holdProg = Math.min(1, (now - c.holdStartTime) / c.holdDuration);
          ctx.strokeStyle = "#22CC88";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(c.x, c.y, CIRCLE_RADIUS + 5, -Math.PI / 2, -Math.PI / 2 + holdProg * Math.PI * 2);
          ctx.stroke();
          const pulse = Math.sin(now * 0.008) * 3;
          ctx.strokeStyle = "rgba(34, 204, 136, 0.3)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(c.x, c.y, CIRCLE_RADIUS + 10 + pulse, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = circleColor;
        ctx.font = "bold 18px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("H", c.x, c.y + 1);
      } else if (c.type === "slider") {
        const angle = Math.atan2(c.endY - c.y, c.endX - c.x);
        ctx.fillStyle = circleColor;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-4, -8);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-12, -3);
        ctx.lineTo(-12, 3);
        ctx.lineTo(-4, 3);
        ctx.lineTo(-4, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.strokeStyle = circleColor;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, CIRCLE_RADIUS - 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = circleColor;
        ctx.font = "bold 22px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(c.number), c.x, c.y + 1);
      }

      if (!c.holding && !c.sliderActive) {
        ctx.strokeStyle = circleColor;
        ctx.globalAlpha = Math.max(0, 0.7 - progress * 0.4);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, approachR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (c.type === "tap" && now > c.hitTime) {
        const fa = Math.sin((now - c.hitTime) * 0.02) * 0.3;
        if (fa > 0) {
          ctx.fillStyle = `rgba(255, 68, 68, ${fa})`;
          ctx.beginPath();
          ctx.arc(c.x, c.y, CIRCLE_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";

    // Text effects
    for (const ef of effectsRef.current) {
      const prog = (now - ef.time) / 800;
      const alpha = 1 - prog;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = ef.color;
      ctx.font = "bold 16px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ef.text, ef.x, ef.y - 20 - prog * 30);
      if (ef.combo > 1) {
        ctx.font = "11px 'Courier New', monospace";
        ctx.fillStyle = `rgba(192, 208, 240, ${alpha * 0.7})`;
        ctx.fillText(`${ef.combo}x`, ef.x, ef.y - 2 - prog * 30);
      }
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";

    // ── HUD ──
    // HP bar
    const barW = 200;
    const barH = 10;
    const barX = CANVAS_W / 2 - barW / 2;
    const barY = 12;
    ctx.fillStyle = "rgba(10, 10, 40, 0.7)";
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    const hpRatio = hpRef.current / MAX_HP;
    ctx.fillStyle = "#0A0A28";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = hpRatio > 0.6 ? "#4AFF4A" : hpRatio > 0.3 ? "#FFD700" : "#FF4444";
    ctx.fillRect(barX, barY, barW * hpRatio, barH);
    ctx.fillStyle = "#5A6A8A";
    ctx.font = "9px 'Courier New', monospace";
    ctx.fillText("HP", barX - 18, barY + 9);

    // Timer bar (timed modes only)
    if (cfg && cfg.timeLimit > 0 && (gameStateRef.current === "playing" || gameStateRef.current === "paused")) {
      const timerBarW = 200;
      const timerBarH = 6;
      const timerBarX = CANVAS_W / 2 - timerBarW / 2;
      const timerBarY = barY + barH + 6;
      const remaining = cfg.timeLimit - gameElapsedRef.current;
      const timeRatio = Math.max(0, Math.min(1, remaining / cfg.timeLimit));

      ctx.fillStyle = "rgba(10, 10, 40, 0.7)";
      ctx.fillRect(timerBarX - 2, timerBarY - 2, timerBarW + 4, timerBarH + 4);
      ctx.fillStyle = "#0A0A28";
      ctx.fillRect(timerBarX, timerBarY, timerBarW, timerBarH);
      ctx.fillStyle = timeRatio > 0.3 ? "#4AC0FF" : timeRatio > 0.1 ? "#FFD700" : "#FF4444";
      ctx.fillRect(timerBarX, timerBarY, timerBarW * timeRatio, timerBarH);

      // Time text
      const secs = Math.ceil(Math.max(0, remaining) / 1000);
      ctx.fillStyle = secs <= 10 ? "#FF4444" : "#4AC0FF";
      ctx.font = "bold 11px 'Courier New', monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${secs}s`, timerBarX - 6, timerBarY + 6);
      ctx.textAlign = "left";
      // (no flash overlay)
    }

    // Score
    ctx.fillStyle = "#C0D0F0";
    ctx.font = "bold 16px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText(String(scoreRef.current).padStart(8, "0"), CANVAS_W - 14, 22);
    const savedHigh = parseInt(safeGetItem(HIGHSCORE_KEY) || "0", 10);
    if (savedHigh > 0) {
      ctx.fillStyle = "#3A4A6A";
      ctx.font = "10px 'Courier New', monospace";
      ctx.fillText("HI " + String(savedHigh).padStart(8, "0"), CANVAS_W - 14, 36);
    }

    // Difficulty badge
    if (cfg && difficulty) {
      const dcfg = DIFFICULTIES[difficulty];
      ctx.fillStyle = dcfg.color;
      ctx.font = "bold 10px 'Courier New', monospace";
      ctx.textAlign = "right";
      ctx.fillText(dcfg.label, CANVAS_W - 14, 50);
    }

    // Combo
    ctx.textAlign = "left";
    if (comboRef.current > 0) {
      ctx.fillStyle =
        comboRef.current >= 50 ? "#FFD700" : comboRef.current >= 20 ? "#FF69B4" : "#C0D0F0";
      ctx.font = "bold 24px 'Courier New', monospace";
      ctx.fillText(`${comboRef.current}x`, 14, 28);
      ctx.fillStyle = "#5A6A8A";
      ctx.font = "9px 'Courier New', monospace";
      ctx.fillText("COMBO", 14, 40);
    }

    // Scanlines
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    for (let sy = 0; sy < CANVAS_H; sy += 3) {
      ctx.fillRect(0, sy, CANVAS_W, 1);
    }

    // ── Overlays ──
    if (gameStateRef.current === "paused") {
      ctx.fillStyle = "rgba(8, 8, 42, 0.85)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      for (let sy = 0; sy < CANVAS_H; sy += 2) ctx.fillRect(0, sy, CANVAS_W, 1);
      ctx.textAlign = "center";
      ctx.fillStyle = "#4A7BFF";
      ctx.font = "bold 24px 'Courier New', monospace";
      ctx.shadowColor = "#4A7BFF";
      ctx.shadowBlur = 12;
      ctx.fillText("PAUSED", CANVAS_W / 2, CANVAS_H / 2 - 12);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#5A6A8A";
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText("Press P, ESC, or SPACE to resume", CANVAS_W / 2, CANVAS_H / 2 + 16);
      if (cfg && cfg.timeLimit > 0) {
        const secs = Math.ceil(Math.max(0, cfg.timeLimit - gameElapsedRef.current) / 1000);
        ctx.fillStyle = "#4AC0FF";
        ctx.font = "11px 'Courier New', monospace";
        ctx.fillText(`Time remaining: ${secs}s`, CANVAS_W / 2, CANVAS_H / 2 + 38);
      }
      ctx.textAlign = "start";
    }

    if (gameStateRef.current === "gameover") {
      ctx.fillStyle = "rgba(8, 8, 42, 0.85)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      for (let sy = 0; sy < CANVAS_H; sy += 2) ctx.fillRect(0, sy, CANVAS_W, 1);
      ctx.textAlign = "center";

      const isTimeUp = endReasonRef.current === "time";
      ctx.fillStyle = isTimeUp ? "#4AC0FF" : "#FF4A7B";
      ctx.font = "bold 26px 'Courier New', monospace";
      ctx.shadowColor = isTimeUp ? "#4AC0FF" : "#FF4A7B";
      ctx.shadowBlur = 15;
      ctx.fillText(isTimeUp ? "TIME'S UP!" : "GAME OVER", CANVAS_W / 2, CANVAS_H / 2 - 80);
      ctx.shadowBlur = 0;

      if (difficulty) {
        const dcfg = DIFFICULTIES[difficulty];
        ctx.fillStyle = dcfg.color;
        ctx.font = "11px 'Courier New', monospace";
        ctx.fillText(`Difficulty: ${dcfg.label}`, CANVAS_W / 2, CANVAS_H / 2 - 58);
      }

      ctx.fillStyle = "#C0D0F0";
      ctx.font = "bold 20px 'Courier New', monospace";
      ctx.fillText(`Score: ${scoreRef.current.toLocaleString()}`, CANVAS_W / 2, CANVAS_H / 2 - 34);

      ctx.fillStyle = "#FFD700";
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillText(`Max Combo: ${maxComboRef.current}x`, CANVAS_W / 2, CANVAS_H / 2 - 10);

      ctx.font = "11px 'Courier New', monospace";
      const total = perfectsRef.current + greatsRef.current + goodsRef.current + missesRef.current;
      const accPct =
        total > 0
          ? (
              ((perfectsRef.current * 300 + greatsRef.current * 200 + goodsRef.current * 100) /
                (total * 300)) *
              100
            ).toFixed(1)
          : "0.0";

      ctx.fillStyle = "#FFD700";
      ctx.fillText(`PERFECT: ${perfectsRef.current}`, CANVAS_W / 2 - 100, CANVAS_H / 2 + 18);
      ctx.fillStyle = "#4AFF4A";
      ctx.fillText(`GREAT: ${greatsRef.current}`, CANVAS_W / 2 - 100, CANVAS_H / 2 + 34);
      ctx.fillStyle = "#4AC0FF";
      ctx.fillText(`GOOD: ${goodsRef.current}`, CANVAS_W / 2 + 40, CANVAS_H / 2 + 18);
      ctx.fillStyle = "#FF4444";
      ctx.fillText(`MISS: ${missesRef.current}`, CANVAS_W / 2 + 40, CANVAS_H / 2 + 34);

      ctx.fillStyle = "#C0D0F0";
      ctx.font = "13px 'Courier New', monospace";
      ctx.fillText(`Accuracy: ${accPct}%`, CANVAS_W / 2, CANVAS_H / 2 + 58);

      ctx.textAlign = "start";
    }

    if (gameStateRef.current === "idle") {
      ctx.fillStyle = "rgba(8, 8, 42, 0.88)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      for (let sy = 0; sy < CANVAS_H; sy += 2) ctx.fillRect(0, sy, CANVAS_W, 1);
      ctx.textAlign = "center";

      ctx.fillStyle = "#4A7BFF";
      ctx.font = "bold 28px 'Courier New', monospace";
      ctx.shadowColor = "#4A7BFF";
      ctx.shadowBlur = 15;
      ctx.fillText("RHYTHM CIRCLES", CANVAS_W / 2, CANVAS_H / 2 - 90);
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#7B4AFF";
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText("Simplified Osu! · Click, Hold & Drag-n-Drop to the beat", CANVAS_W / 2, CANVAS_H / 2 - 64);

      ctx.fillStyle = "#5A6A8A";
      ctx.font = "11px 'Courier New', monospace";
      ctx.fillText("TAP — Click circles when the approach ring aligns", CANVAS_W / 2, CANVAS_H / 2 - 34);
      ctx.fillStyle = "#22CC88";
      ctx.fillText("HOLD — Click & hold until the ring fills (marked H)", CANVAS_W / 2, CANVAS_H / 2 - 16);
      ctx.fillStyle = "#FFA550";
      ctx.fillText("SLIDER — Drag to the drop zone & release near the target", CANVAS_W / 2, CANVAS_H / 2 + 2);

      ctx.fillStyle = "#3A4A6A";
      ctx.font = "11px 'Courier New', monospace";
      ctx.fillText("PERFECT · GREAT · GOOD — Build combos for bonus score!", CANVAS_W / 2, CANVAS_H / 2 + 28);

      // Prompt to select below
      ctx.fillStyle = "#5A6A8A";
      ctx.font = "bold 12px 'Courier New', monospace";
      if (Math.sin(now * 0.003) > 0) {
        ctx.fillText("▼ Select difficulty below to begin ▼", CANVAS_W / 2, CANVAS_H / 2 + 64);
      }

      ctx.textAlign = "start";
    }
  };

  // Initial draw
  useEffect(() => {
    const t = setTimeout(() => drawFrame(performance.now()), 100);
    return () => clearTimeout(t);
  }, []);

  // Redraw on gameover/idle (for static overlays)
  useEffect(() => {
    if (gameState === "gameover" || gameState === "idle") {
      const id = requestAnimationFrame((now) => drawFrame(now));
      return () => cancelAnimationFrame(id);
    }
  }, [gameState, difficulty]);

  // ─── Difficulty button helper ────────────────────────────
  const DiffButton = ({
    diff,
    icon,
  }: {
    diff: Difficulty;
    icon: React.ReactNode;
  }) => {
    const cfg = DIFFICULTIES[diff];
    return (
      <button
        onClick={() => startGame(diff)}
        className={`${retro.raised} bg-[#0E0E35] p-3 text-left hover:bg-[#141450] transition-all cursor-pointer group flex-1 min-w-[140px]`}
        style={{ borderLeft: `3px solid ${cfg.color}` }}
      >
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span
            className="text-[13px]"
            style={{ color: cfg.color, fontFamily: "'Courier New', monospace", fontWeight: 700 }}
          >
            {cfg.label}
          </span>
        </div>
        <div className="text-[10px]" style={S_MUTED}>
          {cfg.desc}
        </div>
      </button>
    );
  };

  // ─── Format time left ───────────────────────────────────
  const formatTimeLeft = (ms: number) => {
    const secs = Math.ceil(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Score bar */}
      <div className="flex items-center justify-between w-full" style={{ maxWidth: CANVAS_W }}>
        <div className="flex items-center gap-4">
          <div
            className="text-[12px]"
            style={{ color: "#3A4A6A", fontFamily: "'Courier New', monospace" }}
          >
            SCORE: <span style={S_TEXT}>{String(score).padStart(8, "0")}</span>
          </div>
          <div
            className="flex items-center gap-1 text-[12px]"
            style={{ color: "#3A4A6A", fontFamily: "'Courier New', monospace" }}
          >
            <Trophy size={11} style={{ color: "#FFD700" }} />
            BEST: <span style={{ color: "#FFD700" }}>{String(highScore).padStart(8, "0")}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {difficulty && diffRef.current && diffRef.current.timeLimit > 0 && gameState === "playing" && (
            <div
              className="flex items-center gap-1 text-[12px]"
              style={{
                color: timeLeft < 10000 ? "#FF4444" : "#4AC0FF",
                fontFamily: "'Courier New', monospace",
              }}
            >
              <Clock size={11} />
              {formatTimeLeft(timeLeft)}
            </div>
          )}
          {difficulty && (
            <div
              className="text-[11px]"
              style={{
                color: DIFFICULTIES[difficulty].color,
                fontFamily: "'Courier New', monospace",
              }}
            >
              {DIFFICULTIES[difficulty].label}
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        className={`${retro.sunken} p-1`}
        style={{
          background: "#020818",
          boxShadow: "0 0 20px rgba(74, 123, 255, 0.1), inset 0 0 30px rgba(0,0,0,0.5)",
          borderColor: "#1A1A5A",
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            display: "block",
            cursor: gameState === "playing" ? "crosshair" : "default",
            userSelect: "none",
            WebkitUserSelect: "none",
            touchAction: "none",
          }}
        />
      </div>

      {/* Difficulty selection (idle & gameover) */}
      {(gameState === "idle" || gameState === "gameover") && (
        <div className="w-full" style={{ maxWidth: CANVAS_W }}>
          <div
            className="text-[11px] mb-2"
            style={{ color: "#3A4A6A", fontFamily: "'Courier New', monospace" }}
          >
            {gameState === "gameover" ? "PLAY AGAIN — SELECT DIFFICULTY:" : "SELECT DIFFICULTY:"}
          </div>
          <div className="flex gap-3 flex-wrap">
            <DiffButton diff="easy" icon={<Shield size={14} style={S_GREEN} />} />
            <DiffButton diff="medium" icon={<Zap size={14} style={{ color: "#4AC0FF" }} />} />
            <DiffButton diff="hard" icon={<Flame size={14} style={{ color: "#FF4A7B" }} />} />
            <DiffButton diff="infinite" icon={<Infinity size={14} style={{ color: "#FFD700" }} />} />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <button
          onClick={onBack}
          className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
          style={S_ACCENT}
        >
          BACK TO MENU
        </button>

        {gameState === "playing" && (
          <button
            onClick={togglePause}
            className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
            style={{ color: "#FFDD33" }}
          >
            <Pause size={12} /> PAUSE
          </button>
        )}

        {gameState === "paused" && (
          <div style={DISPLAY_CONTENTS}>
            <button
              onClick={togglePause}
              className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
              style={S_GREEN}
            >
              <Play size={12} /> RESUME
            </button>
            <button
              onClick={() => {
                resetGame();
                setGameState("idle");
                setDifficulty(null);
                diffRef.current = null;
                requestAnimationFrame((n) => drawFrame(n));
              }}
              className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
              style={S_RED}
            >
              <RotateCcw size={12} /> QUIT
            </button>
          </div>
        )}

        <button
          onClick={() => setMusicPlaying(!musicPlaying)}
          className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
          style={{ color: musicPlaying ? "#4AC0FF" : "#5A6A8A" }}
        >
          {musicPlaying ? <Volume2 size={12} /> : <VolumeX size={12} />}
          {musicPlaying ? "MUSIC: ON" : "MUSIC: OFF"}
        </button>
        {musicPlaying && (
          <input
            type="range"
            min={0}
            max={100}
            value={musicVolume}
            onChange={(e) => setMusicVolume(parseInt(e.target.value, 10))}
            title={`Volume: ${musicVolume}%`}
            style={{ width: 60, height: 14, accentColor: "#4AC0FF", cursor: "pointer", opacity: 0.8 }}
          />
        )}
      </div>

      {/* Hidden YouTube player container */}
      <div ref={ytContainerRef} style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />

      {/* Instructions */}
      <div
        className={`${retro.sunken} p-3 w-full`}
        style={{ maxWidth: CANVAS_W, background: "#06062A" }}
      >
        <div
          className="text-[10px] space-y-1"
          style={{ color: "#2A3A5A", fontFamily: "'Courier New', monospace" }}
        >
          <div>
            <span style={S_DIM}>CONTROLS:</span> Click = Tap ·
            Click+Hold = Hold circles · Drag+Drop = Slider circles · P / ESC = Pause
          </div>
          <div>
            <span style={S_DIM}>TYPES:</span>{" "}
            <span style={S_ACCENT}>TAP</span> click when ring aligns ·{" "}
            <span style={{ color: "#22CC88" }}>HOLD (H)</span> click & hold until ring fills ·{" "}
            <span style={{ color: "#FFA550" }}>SLIDER (→)</span> drag & drop near the target zone
          </div>
          <div>
            <span style={S_DIM}>SCORING:</span>{" "}
            <span style={{ color: "#FFD700" }}>PERFECT</span> 300 ·{" "}
            <span style={S_GREEN}>GREAT</span> 200 ·{" "}
            <span style={{ color: "#4AC0FF" }}>GOOD</span> 100 · Combos multiply your score!
          </div>
          <div>
            <span style={S_DIM}>MODES:</span>{" "}
            <span style={S_GREEN}>EASY</span> 60s ·{" "}
            <span style={{ color: "#4AC0FF" }}>MEDIUM</span> 90s ·{" "}
            <span style={{ color: "#FF4A7B" }}>HARD</span> 120s ·{" "}
            <span style={{ color: "#FFD700" }}>INFINITE</span> survive until HP runs out
          </div>
        </div>
      </div>
    </div>
  );
}