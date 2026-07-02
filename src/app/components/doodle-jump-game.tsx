import React, { useState, useEffect, useCallback, useRef } from "react";
import { Play, RotateCcw, Trophy, Pause } from "lucide-react";
import { S_ACCENT, S_SUBTLE } from "./shared-styles";
import { retro } from "./retro-styles";
import charStandImg from "@/assets/figma/Fancy_Man_Stand.png";
import charJumpImg from "@/assets/figma/Fancy_Man_Jump.png";
import { safeGetItem, safeSetItem } from "./safe-storage";

// ========================
// Constants
// ========================
const CANVAS_W = 400;
const CANVAS_H = 600;
const PLAYER_W = 40;
const PLAYER_H = 52;
const PLATFORM_W = 68;
const PLATFORM_H = 14;
const GRAVITY = 0.38;
const JUMP_VEL = -11.2;
const MOVE_SPEED = 5.5;
const PLATFORM_COUNT = 8;
const SCROLL_THRESHOLD = CANVAS_H * 0.35;
const TARGET_FRAME_MS = 1000 / 60;

// Platform types
const PLAT_NORMAL = 0;
const PLAT_MOVING = 1;
const PLAT_FRAGILE = 2;
const PLAT_SPRING = 3;

interface Platform {
  x: number;
  y: number;
  w: number;
  type: number;
  moveDir?: number;
  moveSpeed?: number;
  broken?: boolean;
  breakTimer?: number;
  hasSpring?: boolean;
  landedOnce?: boolean; // fragile platforms survive one landing
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

// ========================
// Component
// ========================
export function DoodleJumpGame({
  onBack,
  onScoreSave,
}: {
  onBack: () => void;
  onScoreSave?: (score: number) => void;
}) {
  const [gameState, setGameState] = useState<"idle" | "playing" | "paused" | "gameover">("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const charStandImgRef = useRef<HTMLImageElement | null>(null);
  const charJumpImgRef = useRef<HTMLImageElement | null>(null);
  const charLoadedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const frameCapTimeRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const gameRef = useRef({
    px: CANVAS_W / 2 - PLAYER_W / 2,
    py: CANVAS_H - 120,
    vx: 0,
    vy: 0,
    platforms: [] as Platform[],
    particles: [] as Particle[],
    score: 0,
    maxHeight: 0,
    facingRight: true,
    running: false,
    springBounce: false,
    jumpSquash: 0,
  });

  // Load high score
  useEffect(() => {
    const saved = safeGetItem("inet-doodlejump-highscore");
    if (saved) setHighScore(parseInt(saved, 10) || 0);
  }, []);

  // Load character image
  useEffect(() => {
    const imgStand = new Image();
    imgStand.crossOrigin = "anonymous";
    imgStand.onload = () => {
      charStandImgRef.current = imgStand;
      charLoadedRef.current = true;
    };
    imgStand.src = charStandImg;

    const imgJump = new Image();
    imgJump.crossOrigin = "anonymous";
    imgJump.onload = () => {
      charJumpImgRef.current = imgJump;
      charLoadedRef.current = true;
    };
    imgJump.src = charJumpImg;
  }, []);

  const generatePlatform = useCallback((y: number, scoreLevel: number): Platform => {
    const x = Math.random() * (CANVAS_W - PLATFORM_W);
    // Increase difficulty with score
    const diff = Math.min(scoreLevel / 5000, 1);
    const r = Math.random();

    if (r < 0.05 + diff * 0.12) {
      // Fragile platform
      return { x, y, w: PLATFORM_W, type: PLAT_FRAGILE };
    } else if (r < 0.15 + diff * 0.15) {
      // Moving platform
      return {
        x,
        y,
        w: PLATFORM_W,
        type: PLAT_MOVING,
        moveDir: Math.random() > 0.5 ? 1 : -1,
        moveSpeed: 1 + Math.random() * (1.5 + diff * 2),
      };
    } else if (r < 0.22 + diff * 0.08) {
      // Spring platform
      return { x, y, w: PLATFORM_W, type: PLAT_SPRING, hasSpring: true };
    }
    return { x, y, w: PLATFORM_W, type: PLAT_NORMAL };
  }, []);

  const initGame = useCallback(() => {
    const g = gameRef.current;
    g.px = CANVAS_W / 2 - PLAYER_W / 2;
    g.py = CANVAS_H - 120;
    g.vx = 0;
    g.vy = 0;
    g.score = 0;
    g.maxHeight = 0;
    g.facingRight = true;
    g.running = true;
    g.springBounce = false;
    g.jumpSquash = 0;
    g.particles = [];
    frameCapTimeRef.current = 0;

    // Generate initial platforms
    const plats: Platform[] = [];
    // Ground platform right under the player
    plats.push({ x: g.px - 14, y: CANVAS_H - 70, w: PLATFORM_W, type: PLAT_NORMAL });
    const gap = CANVAS_H / PLATFORM_COUNT;
    for (let i = 1; i < PLATFORM_COUNT; i++) {
      plats.push(generatePlatform(CANVAS_H - 70 - i * gap, 0));
    }
    g.platforms = plats;
  }, [generatePlatform]);

  const addParticles = useCallback((x: number, y: number, color: string, count: number) => {
    const g = gameRef.current;
    for (let i = 0; i < count; i++) {
      g.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 1) * 4,
        life: 20 + Math.random() * 20,
        maxLife: 40,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }, []);

  const startGame = useCallback(() => {
    initGame();
    setScore(0);
    setGameState("playing");
  }, [initGame]);

  const togglePause = useCallback(() => {
    setGameState((prev) => {
      if (prev === "playing") {
        gameRef.current.running = false;
        return "paused";
      }
      if (prev === "paused") {
        gameRef.current.running = true;
        return "playing";
      }
      return prev;
    });
  }, []);

  // Keyboard handlers
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (gameState === "playing" || gameState === "paused")) {
        e.preventDefault();
        togglePause();
        return;
      }
      keysRef.current.add(e.key);
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === " ") {
        e.preventDefault();
      }
    };
    const handleUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
    };
  }, [gameState, togglePause]);

  // Main game loop
  useEffect(() => {
    if (gameState !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = (now: number) => {
      const g = gameRef.current;
      if (!g.running) return;
      if (frameCapTimeRef.current !== 0 && now - frameCapTimeRef.current < TARGET_FRAME_MS) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      frameCapTimeRef.current = now;

      // Input
      const keys = keysRef.current;
      if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) {
        g.vx = -MOVE_SPEED;
        g.facingRight = false;
      } else if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) {
        g.vx = MOVE_SPEED;
        g.facingRight = true;
      } else {
        g.vx *= 0.85;
        if (Math.abs(g.vx) < 0.3) g.vx = 0;
      }

      // Apply gravity
      g.vy += GRAVITY;
      g.py += g.vy;
      g.px += g.vx;

      // Wrap around horizontally
      if (g.px + PLAYER_W < 0) g.px = CANVAS_W;
      if (g.px > CANVAS_W) g.px = -PLAYER_W;

      // Jump squash animation decay
      if (g.jumpSquash > 0) g.jumpSquash *= 0.85;
      if (g.jumpSquash < 0.5) g.jumpSquash = 0;

      // Platform collision (only when falling)
      if (g.vy >= 0) {
        for (const plat of g.platforms) {
          if (plat.broken) continue;
          const playerBottom = g.py + PLAYER_H;
          const playerCenterX = g.px + PLAYER_W / 2;
          const onPlatform =
            playerBottom >= plat.y &&
            playerBottom <= plat.y + PLATFORM_H + g.vy + 2 &&
            playerCenterX >= plat.x - 5 &&
            playerCenterX <= plat.x + plat.w + 5;

          if (onPlatform) {
            if (plat.type === PLAT_FRAGILE) {
              if (!plat.landedOnce) {
                plat.landedOnce = true;
              } else {
                plat.broken = true;
                plat.breakTimer = 12;
                addParticles(plat.x + plat.w / 2, plat.y, "#FF6A4A", 8);
                continue;
              }
            }
            const isSpring = plat.type === PLAT_SPRING && plat.hasSpring;
            g.vy = isSpring ? JUMP_VEL * 1.6 : JUMP_VEL;
            g.py = plat.y - PLAYER_H;
            g.jumpSquash = isSpring ? 8 : 5;
            g.springBounce = !!isSpring;
            addParticles(playerCenterX, plat.y, isSpring ? "#FFD700" : "#4AE0C0", isSpring ? 6 : 3);
            break;
          }
        }
      }

      // Scrolling — move platforms down when player goes above threshold
      if (g.py < SCROLL_THRESHOLD) {
        const scrollAmt = SCROLL_THRESHOLD - g.py;
        g.py = SCROLL_THRESHOLD;
        g.maxHeight += scrollAmt;
        g.score = Math.floor(g.maxHeight / 10);
        setScore(g.score);

        for (const plat of g.platforms) {
          plat.y += scrollAmt;
        }

        // Remove off-screen platforms and add new ones on top
        g.platforms = g.platforms.filter((p) => p.y < CANVAS_H + 50);
        while (g.platforms.length < PLATFORM_COUNT) {
          const topY = Math.min(...g.platforms.map((p) => p.y));
          const gap = 55 + Math.random() * 35 + Math.min(g.score / 80, 30);
          g.platforms.push(generatePlatform(topY - gap, g.score));
        }
      }

      // Update moving platforms
      for (const plat of g.platforms) {
        if (plat.type === PLAT_MOVING && plat.moveDir !== undefined) {
          plat.x += (plat.moveSpeed || 1.5) * plat.moveDir;
          if (plat.x <= 0 || plat.x + plat.w >= CANVAS_W) {
            plat.moveDir *= -1;
          }
        }
        // Animate fragile breaking
        if (plat.broken && plat.breakTimer !== undefined) {
          plat.breakTimer--;
        }
      }
      g.platforms = g.platforms.filter((p) => !p.broken || (p.breakTimer !== undefined && p.breakTimer > 0));

      // Update particles
      for (const p of g.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.life--;
      }
      g.particles = g.particles.filter((p) => p.life > 0);

      // Game over — fell off screen
      if (g.py > CANVAS_H + 50) {
        g.running = false;
        setGameState("gameover");
        const finalScore = g.score;
        if (finalScore > highScore) {
          setHighScore(finalScore);
          try { safeSetItem("inet-doodlejump-highscore", String(finalScore)); } catch {}
        }
        onScoreSave?.(finalScore);
        return;
      }

      // ==================
      // RENDER
      // ==================
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Background — subtle grid / graph paper
      ctx.fillStyle = "#080828";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.strokeStyle = "#0F0F3A";
      ctx.lineWidth = 1;
      for (let x = 0; x < CANVAS_W; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_H);
        ctx.stroke();
      }
      for (let y = 0; y < CANVAS_H; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_W, y);
        ctx.stroke();
      }

      // Height markers on the side
      const heightInterval = 500;
      const baseHeight = Math.floor(g.maxHeight / heightInterval) * heightInterval;
      for (let h = baseHeight; h < baseHeight + CANVAS_H * 2; h += heightInterval) {
        const screenY = CANVAS_H - (h - g.maxHeight + CANVAS_H * 0.35) * 0.1;
        if (screenY > 0 && screenY < CANVAS_H) {
          ctx.fillStyle = "#2A2A5B";
          ctx.font = "9px 'Courier New', monospace";
          ctx.textAlign = "right";
          ctx.fillText(`${h}m`, CANVAS_W - 8, screenY);
        }
      }

      // Platforms
      for (const plat of g.platforms) {
        if (plat.broken) {
          // Fragile breaking animation
          const frac = (plat.breakTimer || 0) / 12;
          ctx.globalAlpha = frac;
          ctx.fillStyle = "#FF6A4A";
          const offset = (1 - frac) * 8;
          ctx.fillRect(plat.x - offset, plat.y + offset * 2, plat.w / 2 - 2, PLATFORM_H / 2);
          ctx.fillRect(plat.x + plat.w / 2 + 2 + offset, plat.y + offset * 3, plat.w / 2 - 2, PLATFORM_H / 2);
          ctx.globalAlpha = 1;
          continue;
        }

        // Platform shadow
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(plat.x + 3, plat.y + 3, plat.w, PLATFORM_H);

        switch (plat.type) {
          case PLAT_NORMAL:
            ctx.fillStyle = "#4A9A5A";
            ctx.fillRect(plat.x, plat.y, plat.w, PLATFORM_H);
            ctx.fillStyle = "#5ABF6A";
            ctx.fillRect(plat.x + 2, plat.y + 2, plat.w - 4, 4);
            ctx.fillStyle = "#3A7A4A";
            ctx.fillRect(plat.x, plat.y + PLATFORM_H - 3, plat.w, 3);
            break;
          case PLAT_MOVING:
            ctx.fillStyle = "#4A7BFF";
            ctx.fillRect(plat.x, plat.y, plat.w, PLATFORM_H);
            ctx.fillStyle = "#6A9BFF";
            ctx.fillRect(plat.x + 2, plat.y + 2, plat.w - 4, 4);
            ctx.fillStyle = "#3A5BCC";
            ctx.fillRect(plat.x, plat.y + PLATFORM_H - 3, plat.w, 3);
            // Arrows
            ctx.fillStyle = "#FFFFFF55";
            ctx.font = "9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("◄►", plat.x + plat.w / 2, plat.y + 11);
            break;
          case PLAT_FRAGILE:
            ctx.fillStyle = plat.landedOnce ? "#CC4A2A" : "#FF6A4A";
            ctx.fillRect(plat.x, plat.y, plat.w, PLATFORM_H);
            ctx.fillStyle = plat.landedOnce ? "#DD6A3A" : "#FF9A6A";
            ctx.fillRect(plat.x + 2, plat.y + 2, plat.w - 4, 4);
            // Cracks
            ctx.strokeStyle = "#CC4A2A";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(plat.x + plat.w * 0.3, plat.y + 2);
            ctx.lineTo(plat.x + plat.w * 0.4, plat.y + PLATFORM_H - 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(plat.x + plat.w * 0.7, plat.y + 3);
            ctx.lineTo(plat.x + plat.w * 0.6, plat.y + PLATFORM_H - 1);
            ctx.stroke();
            // Extra cracks after first landing — warns player it will break
            if (plat.landedOnce) {
              ctx.strokeStyle = "#AA3A1A";
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(plat.x + plat.w * 0.15, plat.y + 4);
              ctx.lineTo(plat.x + plat.w * 0.25, plat.y + PLATFORM_H - 1);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(plat.x + plat.w * 0.5, plat.y + 1);
              ctx.lineTo(plat.x + plat.w * 0.48, plat.y + PLATFORM_H);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(plat.x + plat.w * 0.85, plat.y + 2);
              ctx.lineTo(plat.x + plat.w * 0.78, plat.y + PLATFORM_H - 2);
              ctx.stroke();
              // Wobble/shake effect — slight offset
              ctx.globalAlpha = 0.3;
              ctx.fillStyle = "#FF2A0A";
              ctx.fillRect(plat.x + (Math.random() > 0.5 ? 1 : -1), plat.y, plat.w, 2);
              ctx.globalAlpha = 1;
            }
            break;
          case PLAT_SPRING:
            ctx.fillStyle = "#4A9A5A";
            ctx.fillRect(plat.x, plat.y, plat.w, PLATFORM_H);
            ctx.fillStyle = "#5ABF6A";
            ctx.fillRect(plat.x + 2, plat.y + 2, plat.w - 4, 4);
            ctx.fillStyle = "#3A7A4A";
            ctx.fillRect(plat.x, plat.y + PLATFORM_H - 3, plat.w, 3);
            // Spring coil
            if (plat.hasSpring) {
              const sx = plat.x + plat.w / 2;
              const sy = plat.y;
              ctx.fillStyle = "#FFD700";
              ctx.fillRect(sx - 6, sy - 12, 12, 12);
              ctx.fillStyle = "#FFA500";
              ctx.fillRect(sx - 4, sy - 10, 8, 3);
              ctx.fillStyle = "#FFEE88";
              ctx.fillRect(sx - 4, sy - 5, 8, 3);
            }
            break;
        }
      }

      // Particles
      for (const p of g.particles) {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // Player character
      const squash = g.jumpSquash;
      const drawW = PLAYER_W + (squash > 0 ? squash * 1.5 : 0);
      const drawH = PLAYER_H - (squash > 0 ? squash * 1.2 : 0);
      const drawX = g.px + (PLAYER_W - drawW) / 2;
      const drawY = g.py + (PLAYER_H - drawH);

      if (charLoadedRef.current && charStandImgRef.current && charJumpImgRef.current) {
        ctx.save();
        if (!g.facingRight) {
          ctx.translate(drawX + drawW / 2, 0);
          ctx.scale(-1, 1);
          ctx.translate(-(drawX + drawW / 2), 0);
        }
        ctx.drawImage(
          g.vy < 0 ? charJumpImgRef.current : charStandImgRef.current,
          drawX,
          drawY,
          drawW,
          drawH
        );
        ctx.restore();
      } else {
        // Fallback stick figure
        ctx.fillStyle = "#FFD700";
        ctx.beginPath();
        ctx.arc(g.px + PLAYER_W / 2, g.py + 10, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#222";
        ctx.fillRect(g.px + PLAYER_W / 2 - 2, g.py + 18, 4, 20);
        ctx.fillStyle = "#FF9900";
        ctx.beginPath();
        ctx.moveTo(g.px + PLAYER_W / 2, g.py + 38);
        ctx.lineTo(g.px + PLAYER_W / 2 - 12, g.py + PLAYER_H);
        ctx.lineTo(g.px + PLAYER_W / 2 + 12, g.py + PLAYER_H);
        ctx.closePath();
        ctx.fill();
      }

      // Score HUD
      ctx.fillStyle = "#C0D0F0";
      ctx.font = "bold 16px 'Courier New', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`SCORE: ${g.score}`, 12, 28);
      ctx.font = "11px 'Courier New', monospace";
      ctx.fillStyle = "#5A7ABB";
      ctx.fillText(`HI: ${Math.max(g.score, highScore)}`, 12, 46);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameState, highScore, generatePlatform, addParticles, onScoreSave]);

  // Touch / tilt controls for mobile
  const touchRef = useRef<{ startX: number; currentX: number } | null>(null);

  useEffect(() => {
    if (gameState !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      touchRef.current = { startX: t.clientX, currentX: t.clientX };
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchRef.current) return;
      touchRef.current.currentX = e.touches[0].clientX;
      const diff = touchRef.current.currentX - touchRef.current.startX;
      keysRef.current.delete("ArrowLeft");
      keysRef.current.delete("ArrowRight");
      if (diff < -15) keysRef.current.add("ArrowLeft");
      else if (diff > 15) keysRef.current.add("ArrowRight");
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      touchRef.current = null;
      keysRef.current.delete("ArrowLeft");
      keysRef.current.delete("ArrowRight");
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [gameState]);

  return (
    <div className="flex flex-col items-center">
      {/* Top bar */}
      <div className="w-full max-w-[440px] mb-3 flex items-center justify-between">
        <button
          onClick={onBack}
          className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`}
          style={S_ACCENT}
        >
          ← BACK
        </button>
        <div className="flex items-center gap-3">
          {(gameState === "playing" || gameState === "paused") && (
            <button
              onClick={togglePause}
              className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1.5`}
              style={{ color: gameState === "paused" ? "#4AE0C0" : "#FFD700" }}
            >
              {gameState === "paused" ? <Play size={12} /> : <Pause size={12} />}
              {gameState === "paused" ? "RESUME" : "PAUSE"}
            </button>
          )}
          <Trophy size={14} style={{ color: "#FFD700" }} />
          <span className="text-[12px]" style={{ color: "#FFD700", fontFamily: "'Courier New', monospace" }}>
            HI: {highScore}
          </span>
        </div>
      </div>

      {/* Game Canvas */}
      <div
        className={`${retro.sunken} relative`}
        style={{ width: CANVAS_W + 8, height: CANVAS_H + 8, background: "#060620" }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block mx-auto my-1"
          style={{ imageRendering: "auto" }}
          tabIndex={0}
        />

        {/* Idle / Start overlay */}
        {gameState === "idle" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(6, 6, 32, 0.88)" }}
          >
            <div className="mb-4" style={{ width: 80, height: 100 }}>
              <img
                src={charStandImg}
                alt="Player"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <h2
              className="text-[22px] mb-2"
              style={{
                color: "#4AE0C0",
                fontWeight: 700,
                fontFamily: "'Courier New', monospace",
                textShadow: "0 0 12px rgba(74, 224, 192, 0.4)",
              }}
            >
              DOODLE JUMP
            </h2>
            <p className="text-[11px] mb-5 text-center max-w-[280px]" style={S_SUBTLE}>
              Use ← → arrow keys (or A/D) to move. Jump on platforms and climb as high as you can!
            </p>
            <button
              onClick={startGame}
              className={`${retro.button} px-8 py-3 text-[14px] flex items-center gap-2`}
              style={{ color: "#4AE0C0" }}
            >
              <Play size={16} /> PLAY
            </button>
          </div>
        )}

        {/* Paused overlay */}
        {gameState === "paused" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(6, 6, 32, 0.85)" }}
          >
            <h2
              className="text-[26px] mb-2"
              style={{
                color: "#FFD700",
                fontWeight: 700,
                fontFamily: "'Courier New', monospace",
                textShadow: "0 0 12px rgba(255, 215, 0, 0.4)",
              }}
            >
              PAUSED
            </h2>
            <div className="text-[18px] mb-4" style={{ color: "#C0D0F0", fontFamily: "'Courier New', monospace" }}>
              Score: {score}
            </div>
            <button
              onClick={togglePause}
              className={`${retro.button} px-8 py-3 text-[14px] flex items-center gap-2`}
              style={{ color: "#4AE0C0" }}
            >
              <Play size={16} /> RESUME
            </button>
            <p className="text-[10px] mt-3" style={{ color: "#5A6A8A" }}>
              Press ESC to resume
            </p>
          </div>
        )}

        {/* Game Over overlay */}
        {gameState === "gameover" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(6, 6, 32, 0.9)" }}
          >
            <h2
              className="text-[24px] mb-1"
              style={{
                color: "#FF6A6A",
                fontWeight: 700,
                fontFamily: "'Courier New', monospace",
                textShadow: "0 0 12px rgba(255, 106, 106, 0.4)",
              }}
            >
              GAME OVER
            </h2>
            <div className="text-[32px] mb-1" style={{ color: "#FFD700", fontWeight: 700, fontFamily: "'Courier New', monospace" }}>
              {score}
            </div>
            <p className="text-[11px] mb-1" style={S_SUBTLE}>SCORE</p>
            {score >= highScore && score > 0 && (
              <div
                className="text-[12px] mb-3 px-4 py-1"
                style={{
                  color: "#FFD700",
                  background: "#FFD70015",
                  border: "1px solid #FFD70040",
                  fontFamily: "'Courier New', monospace",
                }}
              >
                ★ NEW HIGH SCORE! ★
              </div>
            )}
            {score < highScore && <div className="mb-3" />}
            <button
              onClick={startGame}
              className={`${retro.button} px-8 py-3 text-[14px] flex items-center gap-2`}
              style={{ color: "#4AE0C0" }}
            >
              <RotateCcw size={16} /> RETRY
            </button>
          </div>
        )}
      </div>

      {/* Controls legend */}
      <div className="mt-3 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div
            className="px-2 py-1 text-[10px]"
            style={{
              background: "#1A1A4B",
              border: "1px solid #2A2A6B",
              color: "#7A8AAA",
              fontFamily: "'Courier New', monospace",
            }}
          >
            ← →
          </div>
          <span className="text-[10px]" style={{ color: "#5A6A8A" }}>Move</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-sm" style={{ background: "#4A9A5A" }} />
            <span className="text-[9px]" style={{ color: "#5A6A8A" }}>Normal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-sm" style={{ background: "#4A7BFF" }} />
            <span className="text-[9px]" style={{ color: "#5A6A8A" }}>Moving</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-sm" style={{ background: "#FF6A4A" }} />
            <span className="text-[9px]" style={{ color: "#5A6A8A" }}>Fragile</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ background: "#FFD700" }} />
            <span className="text-[9px]" style={{ color: "#5A6A8A" }}>Spring</span>
          </div>
        </div>
      </div>
    </div>
  );
}