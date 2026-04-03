import React, { useState, useEffect, useCallback, useRef } from "react";
import { retro } from "./retro-styles";
import { S_RED } from "./shared-styles";
import { Play, RotateCcw, Pause, Trophy, Volume2, VolumeX } from "lucide-react";
import mascotImg from "@/assets/figma/Gnarpy_Boss1.png";
import { safeGetItem, safeSetItem } from "./safe-storage";

const CANVAS_W = 900;
const CANVAS_H = 300;
const GROUND_Y = 248;
const GRAVITY = 0.65;
const JUMP_FORCE = -14;
const INITIAL_SPEED = 4;
const MAX_SPEED = 12;
const SPEED_ACCEL = 0.001;
const FRAME_MS = 1000 / 60;

// Obstacle types
interface Obstacle {
  x: number;
  w: number;
  h: number;
  y: number; // bottom-aligned to ground
  type: "crystal" | "pillar" | "spike";
}

// Star particle
interface Star {
  x: number;
  y: number;
  blink: number;
  speed: number;
}

export function RunnerGame({ onBack, onScoreSave }: { onBack: () => void; onScoreSave?: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<"idle" | "playing" | "paused" | "gameover">("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(() => {
    const saved = safeGetItem("inet-runner-volume");
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
      playerDiv.id = "yt-runner-music-" + Date.now();
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
    safeSetItem("inet-runner-volume", String(musicVolume));
    if (ytPlayerRef.current) { try { ytPlayerRef.current.setVolume(musicVolume); } catch {} }
  }, [musicVolume]);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  // Game state refs
  const playerRef = useRef({ y: GROUND_Y, vy: 0, grounded: true, frame: 0 });
  const obstaclesRef = useRef<Obstacle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const speedRef = useRef(INITIAL_SPEED);
  const distRef = useRef(0);
  const scoreRef = useRef(0);
  const frameRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const mascotImgRef = useRef<HTMLImageElement | null>(null);
  const groundOffsetRef = useRef(0);

  // Mascot dimensions on canvas
  const MASCOT_W = 64;
  const MASCOT_H = 64;
  const MASCOT_X = 60;

  // Load mascot image
  useEffect(() => {
    const img = new Image();
    img.src = mascotImg;
    img.onload = () => { mascotImgRef.current = img; };
  }, []);

  // Load high score
  useEffect(() => {
    const saved = safeGetItem("inet-runner-highscore");
    if (saved) setHighScore(parseInt(saved, 10) || 0);
  }, []);

  // Initialize stars
  useEffect(() => {
    const s: Star[] = [];
    for (let i = 0; i < 30; i++) {
      s.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * (GROUND_Y - 30),
        blink: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.7,
      });
    }
    starsRef.current = s;
  }, []);

  const spawnObstacle = useCallback(() => {
    const types: Array<"crystal" | "pillar" | "spike"> = ["crystal", "pillar", "spike"];
    const type = types[Math.floor(Math.random() * types.length)];
    let w: number, h: number;
    switch (type) {
      case "crystal":
        w = 22 + Math.random() * 14;
        h = 40 + Math.random() * 30;
        break;
      case "pillar":
        w = 16 + Math.random() * 12;
        h = 50 + Math.random() * 35;
        break;
      case "spike":
        w = 28 + Math.random() * 16;
        h = 30 + Math.random() * 22;
        break;
      default:
        w = 22; h = 42;
    }
    obstaclesRef.current.push({
      x: CANVAS_W + 20,
      w,
      h,
      y: GROUND_Y - h,
      type,
    });
  }, []);

  const resetGame = useCallback(() => {
    playerRef.current = { y: GROUND_Y, vy: 0, grounded: true, frame: 0 };
    obstaclesRef.current = [];
    speedRef.current = INITIAL_SPEED;
    distRef.current = 0;
    scoreRef.current = 0;
    spawnTimerRef.current = 0;
    groundOffsetRef.current = 0;
    setScore(0);
    setGameState("idle");
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);

  const startGame = useCallback(() => {
    if (gameStateRef.current === "gameover") {
      playerRef.current = { y: GROUND_Y, vy: 0, grounded: true, frame: 0 };
      obstaclesRef.current = [];
      speedRef.current = INITIAL_SPEED;
      distRef.current = 0;
      scoreRef.current = 0;
      spawnTimerRef.current = 0;
      groundOffsetRef.current = 0;
      setScore(0);
    }
    setGameState("playing");
  }, []);

  const togglePause = useCallback(() => {
    if (gameStateRef.current === "playing") setGameState("paused");
    else if (gameStateRef.current === "paused") setGameState("playing");
  }, []);

  const jump = useCallback(() => {
    if (gameStateRef.current !== "playing") return;
    const p = playerRef.current;
    if (p.grounded) {
      p.vy = JUMP_FORCE;
      p.grounded = false;
    }
  }, []);

  // Input
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        if (gameStateRef.current === "idle" || gameStateRef.current === "gameover") {
          startGame();
        } else if (gameStateRef.current === "playing") {
          jump();
        } else if (gameStateRef.current === "paused" && e.key === " ") {
          togglePause();
        }
      }
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [startGame, jump, togglePause]);

  // Touch/click to jump
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleClick = () => {
      if (gameStateRef.current === "idle" || gameStateRef.current === "gameover") {
        startGame();
      } else if (gameStateRef.current === "playing") {
        jump();
      }
    };
    canvas.addEventListener("mousedown", handleClick);
    canvas.addEventListener("touchstart", handleClick);
    return () => {
      canvas.removeEventListener("mousedown", handleClick);
      canvas.removeEventListener("touchstart", handleClick);
    };
  }, [startGame, jump]);

  // Draw functions
  const drawCrystal = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "#1A5A1A";
    ctx.strokeStyle = "#33FF33";
    ctx.lineWidth = 1.5;
    // Diamond shape
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h * 0.6);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Inner shine
    ctx.strokeStyle = "#66FF66";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 4);
    ctx.lineTo(x + w * 0.7, y + h * 0.5);
    ctx.stroke();
  };

  const drawPillar = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "#0D3D0D";
    ctx.strokeStyle = "#33FF33";
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    // Detail lines
    ctx.strokeStyle = "#228B22";
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 3; i++) {
      const ly = y + (h / 3) * i;
      ctx.beginPath();
      ctx.moveTo(x + 2, ly);
      ctx.lineTo(x + w - 2, ly);
      ctx.stroke();
    }
    // Top cap
    ctx.fillStyle = "#33FF33";
    ctx.fillRect(x - 2, y, w + 4, 3);
  };

  const drawSpike = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "#1A4A1A";
    ctx.strokeStyle = "#33FF33";
    ctx.lineWidth = 1.5;
    const spikes = 3;
    const sw = w / spikes;
    for (let i = 0; i < spikes; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * sw, y + h);
      ctx.lineTo(x + i * sw + sw / 2, y + (i === 1 ? 0 : h * 0.3));
      ctx.lineTo(x + (i + 1) * sw, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };

  // Game loop
  useEffect(() => {
    if (gameState !== "playing") {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      lastFrameTimeRef.current = 0;
      // Still draw the idle/paused/gameover frame
      requestAnimationFrame(() => drawFrame());
      return;
    }

    const loop = (now: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = now;
      }

      const elapsed = now - lastFrameTimeRef.current;
      if (elapsed < FRAME_MS) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrameTimeRef.current = now - (elapsed % FRAME_MS);

      const p = playerRef.current;
      const speed = speedRef.current;

      // Physics
      if (!p.grounded) {
        p.vy += GRAVITY;
        p.y += p.vy;
        if (p.y >= GROUND_Y) {
          p.y = GROUND_Y;
          p.vy = 0;
          p.grounded = true;
        }
      }

      // Running animation frame
      frameRef.current++;
      if (frameRef.current % 6 === 0) {
        p.frame = (p.frame + 1) % 4;
      }

      // Move obstacles
      obstaclesRef.current = obstaclesRef.current
        .map((o) => ({ ...o, x: o.x - speed }))
        .filter((o) => o.x + o.w > -20);

      // Scroll ground
      groundOffsetRef.current = (groundOffsetRef.current + speed) % 20;

      // Scroll stars
      starsRef.current = starsRef.current.map((s) => {
        let nx = s.x - s.speed * (speed / INITIAL_SPEED) * 0.3;
        if (nx < -5) nx = CANVAS_W + 5;
        return { ...s, x: nx, blink: s.blink + 0.03 };
      });

      // Spawn obstacles
      spawnTimerRef.current -= 1;
      if (spawnTimerRef.current <= 0) {
        spawnObstacle();
        const minGap = Math.max(40, 80 - speed * 3);
        const maxGap = Math.max(60, 120 - speed * 3);
        spawnTimerRef.current = minGap + Math.random() * (maxGap - minGap);
      }

      // Score
      distRef.current += speed;
      const newScore = Math.floor(distRef.current / 10);
      if (newScore !== scoreRef.current) {
        scoreRef.current = newScore;
        setScore(newScore);
      }

      // Speed up
      speedRef.current = Math.min(MAX_SPEED, speedRef.current + SPEED_ACCEL);

      // Collision detection
      const px = MASCOT_X;
      const py = p.y - MASCOT_H;
      // Slightly smaller hitbox for fairness
      const hitbox = { x: px + 8, y: py + 6, w: MASCOT_W - 16, h: MASCOT_H - 8 };

      for (const obs of obstaclesRef.current) {
        const ox = obs.x;
        const oy = obs.y;
        const ow = obs.w;
        const oh = obs.h;

        if (
          hitbox.x < ox + ow &&
          hitbox.x + hitbox.w > ox &&
          hitbox.y < oy + oh &&
          hitbox.y + hitbox.h > oy
        ) {
          // Collision!
          setGameState("gameover");
          const finalScore = scoreRef.current;
          const savedHigh = parseInt(safeGetItem("inet-runner-highscore") || "0", 10);
          if (finalScore > savedHigh) {
            safeSetItem("inet-runner-highscore", String(finalScore));
            setHighScore(finalScore);
          }
          if (finalScore > 0) onScoreSave?.(finalScore);
          return;
        }
      }

      drawFrame();
      animRef.current = requestAnimationFrame(loop);
    };

    lastFrameTimeRef.current = 0;
    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      lastFrameTimeRef.current = 0;
    };
  }, [gameState, spawnObstacle]);

  const drawFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const p = playerRef.current;

    // Background - dark green CRT
    ctx.fillStyle = "#050F05";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Stars
    for (const s of starsRef.current) {
      const alpha = 0.3 + Math.sin(s.blink) * 0.3;
      ctx.fillStyle = `rgba(100, 255, 100, ${alpha})`;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1.5, 1.5);
    }

    // Ground line
    ctx.strokeStyle = "#33FF33";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 2);
    ctx.lineTo(CANVAS_W, GROUND_Y + 2);
    ctx.stroke();

    // Ground texture - scrolling dashes
    ctx.strokeStyle = "#1A5A1A";
    ctx.lineWidth = 1;
    const gOff = groundOffsetRef.current;
    for (let x = -gOff; x < CANVAS_W; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 8);
      ctx.lineTo(x + 8, GROUND_Y + 8);
      ctx.stroke();
    }
    for (let x = -gOff + 10; x < CANVAS_W; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 14);
      ctx.lineTo(x + 5, GROUND_Y + 14);
      ctx.stroke();
    }

    // Obstacles
    for (const obs of obstaclesRef.current) {
      switch (obs.type) {
        case "crystal":
          drawCrystal(ctx, obs.x, obs.y, obs.w, obs.h);
          break;
        case "pillar":
          drawPillar(ctx, obs.x, obs.y, obs.w, obs.h);
          break;
        case "spike":
          drawSpike(ctx, obs.x, obs.y, obs.w, obs.h);
          break;
      }
    }

    // Player (mascot)
    const py = p.y - MASCOT_H;
    if (mascotImgRef.current) {
      ctx.save();
      // Running bob effect when grounded
      let bobY = 0;
      if (p.grounded && gameStateRef.current === "playing") {
        bobY = Math.sin(frameRef.current * 0.3) * 2;
      }
      // Tilt slightly when jumping
      if (!p.grounded) {
        const tilt = Math.min(p.vy * 0.02, 0.3);
        ctx.translate(MASCOT_X + MASCOT_W / 2, py + MASCOT_H / 2);
        ctx.rotate(tilt);
        ctx.translate(-(MASCOT_X + MASCOT_W / 2), -(py + MASCOT_H / 2));
      }
      ctx.drawImage(mascotImgRef.current, MASCOT_X, py + bobY, MASCOT_W, MASCOT_H);

      // Green glow on mascot
      ctx.shadowColor = "#33FF33";
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.15;
      ctx.drawImage(mascotImgRef.current, MASCOT_X, py + bobY, MASCOT_W, MASCOT_H);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      // Fallback square
      ctx.fillStyle = "#33FF33";
      ctx.fillRect(MASCOT_X, py, MASCOT_W, MASCOT_H);
    }

    // Scanline effect
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    for (let y = 0; y < CANVAS_H; y += 3) {
      ctx.fillRect(0, y, CANVAS_W, 1);
    }

    // Score display on canvas
    ctx.fillStyle = "#33FF33";
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText(String(scoreRef.current).padStart(5, "0"), CANVAS_W - 12, 22);

    // High score
    if (parseInt(safeGetItem("inet-runner-highscore") || "0", 10) > 0) {
      ctx.fillStyle = "#1A5A1A";
      ctx.font = "11px 'Courier New', monospace";
      ctx.fillText(
        "HI " + String(parseInt(safeGetItem("inet-runner-highscore") || "0", 10)).padStart(5, "0"),
        CANVAS_W - 90,
        22
      );
    }
    ctx.textAlign = "start";

    // Overlay for non-playing states
    if (gameStateRef.current === "idle" || gameStateRef.current === "gameover" || gameStateRef.current === "paused") {
      ctx.fillStyle = "rgba(5, 15, 5, 0.75)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // CRT vignette on overlay
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      for (let y = 0; y < CANVAS_H; y += 2) {
        ctx.fillRect(0, y, CANVAS_W, 1);
      }

      ctx.textAlign = "center";

      if (gameStateRef.current === "idle") {
        ctx.fillStyle = "#33FF33";
        ctx.font = "bold 18px 'Courier New', monospace";
        ctx.fillText("ALIEN CAT RUNNER", CANVAS_W / 2, CANVAS_H / 2 - 20);
        ctx.fillStyle = "#1A8A1A";
        ctx.font = "12px 'Courier New', monospace";
        ctx.fillText("Press SPACE or Click to Start", CANVAS_W / 2, CANVAS_H / 2 + 8);
        ctx.fillStyle = "#0D5A0D";
        ctx.font = "10px 'Courier New', monospace";
        ctx.fillText("SPACE / UP / W / Click = Jump", CANVAS_W / 2, CANVAS_H / 2 + 28);
      } else if (gameStateRef.current === "paused") {
        ctx.fillStyle = "#33FF33";
        ctx.font = "bold 18px 'Courier New', monospace";
        ctx.fillText("PAUSED", CANVAS_W / 2, CANVAS_H / 2 - 8);
        ctx.fillStyle = "#1A8A1A";
        ctx.font = "12px 'Courier New', monospace";
        ctx.fillText("Press P or ESC to resume", CANVAS_W / 2, CANVAS_H / 2 + 16);
      } else {
        ctx.fillStyle = "#FFDD33";
        ctx.font = "bold 20px 'Courier New', monospace";
        ctx.shadowColor = "#FFDD33";
        ctx.shadowBlur = 10;
        ctx.fillText("GAME OVER", CANVAS_W / 2, CANVAS_H / 2 - 24);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#33FF33";
        ctx.font = "14px 'Courier New', monospace";
        ctx.fillText(`Score: ${scoreRef.current}`, CANVAS_W / 2, CANVAS_H / 2 + 2);
        ctx.fillStyle = "#1A8A1A";
        ctx.font = "11px 'Courier New', monospace";
        ctx.fillText("Press SPACE or Click to retry", CANVAS_W / 2, CANVAS_H / 2 + 24);
      }
      ctx.textAlign = "start";
    }
  };

  // Initial draw
  useEffect(() => {
    const t = setTimeout(() => drawFrame(), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Score bar */}
      <div className="flex items-center justify-between w-full" style={{ maxWidth: CANVAS_W }}>
        <div className="flex items-center gap-4">
          <div
            className="text-[12px]"
            style={{ color: "#1A5A1A", fontFamily: "'Courier New', monospace" }}
          >
            SCORE:{" "}
            <span style={{ color: "#33FF33" }}>{String(score).padStart(5, "0")}</span>
          </div>
          <div
            className="flex items-center gap-1 text-[12px]"
            style={{ color: "#1A5A1A", fontFamily: "'Courier New', monospace" }}
          >
            <Trophy size={11} style={{ color: "#FFDD33" }} />
            BEST: <span style={{ color: "#FFDD33" }}>{String(highScore).padStart(5, "0")}</span>
          </div>
        </div>
        <div
          className="text-[11px]"
          style={{ color: "#0D3D0D", fontFamily: "'Courier New', monospace" }}
        >
          SPD:{" "}
          {Math.round(
            ((speedRef.current - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED)) * 10
          )}
          /10
        </div>
      </div>

      {/* Game canvas */}
      <div
        className={`${retro.sunken} p-1`}
        style={{
          background: "#020802",
          boxShadow: "0 0 20px rgba(51, 255, 51, 0.1), inset 0 0 30px rgba(0,0,0,0.5)",
          borderColor: "#1A3A1A",
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            display: "block",
            imageRendering: "pixelated",
            cursor: "pointer",
          }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
          style={{ color: "#33FF33" }}
        >
          BACK TO MENU
        </button>

        {(gameState === "idle" || gameState === "gameover") && (
          <button
            onClick={startGame}
            className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
            style={{ color: "#33FF33" }}
          >
            <Play size={12} /> {gameState === "gameover" ? "RETRY" : "START"}
          </button>
        )}

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
          <button
            onClick={togglePause}
            className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
            style={{ color: "#33FF33" }}
          >
            <Play size={12} /> RESUME
          </button>
        )}

        {(gameState === "playing" || gameState === "paused") && (
          <button
            onClick={resetGame}
            className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
            style={S_RED}
          >
            <RotateCcw size={12} /> RESET
          </button>
        )}

        {/* Music toggle */}
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
        style={{ maxWidth: CANVAS_W, background: "#040D04" }}
      >
        <div
          className="text-[10px] space-y-1"
          style={{ color: "#0D3D0D", fontFamily: "'Courier New', monospace" }}
        >
          <div>
            <span style={{ color: "#1A5A1A" }}>CONTROLS:</span> SPACE / UP / W / Click =
            Jump · P / ESC = Pause
          </div>
          <div>
            <span style={{ color: "#1A5A1A" }}>OBJECTIVE:</span> Jump over the{" "}
            <span style={{ color: "#33FF33" }}>obstacles</span>. Speed increases over time.
            Survive as long as you can.
          </div>
        </div>
      </div>
    </div>
  );
}