import React, { useState, useEffect, useCallback, useRef } from "react";
import { retro } from "./retro-styles";
import { S_TEXT, S_RED } from "./shared-styles";
import { Play, RotateCcw, Pause, Trophy } from "lucide-react";
import { safeGetItem, safeSetItem } from "./safe-storage";

const GRID_SIZE = 20;
const CELL_SIZE = 30;
const INITIAL_SPEED = 150;
const SPEED_INCREMENT = 3;
const MIN_SPEED = 60;

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
type Point = { x: number; y: number };

export function SnakeGame({ onBack, onScoreSave }: { onBack: () => void; onScoreSave?: (score: number) => void }) {
  const [snake, setSnake] = useState<Point[]>([{ x: 10, y: 10 }]);
  const [food, setFood] = useState<Point>({ x: 15, y: 10 });
  const [direction, setDirection] = useState<Direction>("RIGHT");
  const [gameState, setGameState] = useState<"idle" | "playing" | "paused" | "gameover">("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const dirRef = useRef<Direction>("RIGHT");
  const nextDirRef = useRef<Direction | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const snakeRef = useRef(snake);
  const foodRef = useRef(food);
  const scoreRef = useRef(score);
  const gameStateRef = useRef(gameState);

  // Keep refs in sync
  snakeRef.current = snake;
  foodRef.current = food;
  scoreRef.current = score;
  gameStateRef.current = gameState;

  // Load high score
  useEffect(() => {
    const saved = safeGetItem("inet-snake-highscore");
    if (saved) setHighScore(parseInt(saved, 10) || 0);
  }, []);

  const spawnFood = useCallback((currentSnake: Point[]): Point => {
    let newFood: Point;
    do {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
    } while (currentSnake.some((s) => s.x === newFood.x && s.y === newFood.y));
    return newFood;
  }, []);

  const resetGame = useCallback(() => {
    const initial = [{ x: 10, y: 10 }];
    setSnake(initial);
    setDirection("RIGHT");
    dirRef.current = "RIGHT";
    nextDirRef.current = null;
    setScore(0);
    const newFood = spawnFood(initial);
    setFood(newFood);
    setGameState("idle");
    if (gameLoopRef.current) {
      clearInterval(gameLoopRef.current);
      gameLoopRef.current = null;
    }
  }, [spawnFood]);

  const startGame = useCallback(() => {
    if (gameStateRef.current === "gameover") {
      resetGame();
      setTimeout(() => setGameState("playing"), 50);
    } else {
      setGameState("playing");
    }
  }, [resetGame]);

  const togglePause = useCallback(() => {
    if (gameStateRef.current === "playing") {
      setGameState("paused");
    } else if (gameStateRef.current === "paused") {
      setGameState("playing");
    }
  }, []);

  // Game loop
  useEffect(() => {
    if (gameState !== "playing") {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
        gameLoopRef.current = null;
      }
      return;
    }

    const speed = Math.max(MIN_SPEED, INITIAL_SPEED - scoreRef.current * SPEED_INCREMENT);

    const tick = () => {
      // Apply queued direction
      if (nextDirRef.current) {
        dirRef.current = nextDirRef.current;
        nextDirRef.current = null;
      }

      const currentSnake = [...snakeRef.current];
      const head = { ...currentSnake[0] };

      switch (dirRef.current) {
        case "UP": head.y -= 1; break;
        case "DOWN": head.y += 1; break;
        case "LEFT": head.x -= 1; break;
        case "RIGHT": head.x += 1; break;
      }

      // Wall collision
      if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        setGameState("gameover");
        const finalScore = scoreRef.current;
        const savedHigh = parseInt(safeGetItem("inet-snake-highscore") || "0", 10);
        if (finalScore > savedHigh) {
          safeSetItem("inet-snake-highscore", String(finalScore));
          setHighScore(finalScore);
        }
        if (finalScore > 0) onScoreSave?.(finalScore);
        return;
      }

      // Self collision
      if (currentSnake.some((s) => s.x === head.x && s.y === head.y)) {
        setGameState("gameover");
        const finalScore = scoreRef.current;
        const savedHigh = parseInt(safeGetItem("inet-snake-highscore") || "0", 10);
        if (finalScore > savedHigh) {
          safeSetItem("inet-snake-highscore", String(finalScore));
          setHighScore(finalScore);
        }
        if (finalScore > 0) onScoreSave?.(finalScore);
        return;
      }

      const newSnake = [head, ...currentSnake];

      // Eat food
      if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
        const newScore = scoreRef.current + 1;
        setScore(newScore);
        const newFood = spawnFood(newSnake);
        setFood(newFood);
      } else {
        newSnake.pop();
      }

      setSnake(newSnake);
    };

    gameLoopRef.current = window.setInterval(tick, speed);

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
        gameLoopRef.current = null;
      }
    };
  }, [gameState, score, spawnFood]);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (gameStateRef.current === "idle" || gameStateRef.current === "gameover") {
          startGame();
        } else {
          togglePause();
        }
        return;
      }

      if (gameStateRef.current !== "playing") return;

      const current = dirRef.current;
      let newDir: Direction | null = null;

      switch (e.key) {
        case "ArrowUp": case "w": case "W":
          if (current !== "DOWN") newDir = "UP";
          break;
        case "ArrowDown": case "s": case "S":
          if (current !== "UP") newDir = "DOWN";
          break;
        case "ArrowLeft": case "a": case "A":
          if (current !== "RIGHT") newDir = "LEFT";
          break;
        case "ArrowRight": case "d": case "D":
          if (current !== "LEFT") newDir = "RIGHT";
          break;
      }

      if (newDir) {
        e.preventDefault();
        nextDirRef.current = newDir;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [startGame, togglePause]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = GRID_SIZE * CELL_SIZE;
    const h = GRID_SIZE * CELL_SIZE;

    // Background
    ctx.fillStyle = "#060620";
    ctx.fillRect(0, 0, w, h);

    // Grid lines (subtle)
    ctx.strokeStyle = "#0C0C30";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(w, i * CELL_SIZE);
      ctx.stroke();
    }

    // Food - pulsing red pixel
    ctx.fillStyle = "#FF4444";
    ctx.shadowColor = "#FF4444";
    ctx.shadowBlur = 8;
    ctx.fillRect(
      food.x * CELL_SIZE + 2,
      food.y * CELL_SIZE + 2,
      CELL_SIZE - 4,
      CELL_SIZE - 4
    );
    ctx.shadowBlur = 0;

    // Snake
    snake.forEach((seg, i) => {
      const isHead = i === 0;
      if (isHead) {
        ctx.fillStyle = "#4AFF4A";
        ctx.shadowColor = "#4AFF4A";
        ctx.shadowBlur = 6;
      } else {
        // Gradient from bright to dim green along body
        const ratio = i / snake.length;
        const g = Math.floor(255 - ratio * 120);
        ctx.fillStyle = `rgb(40, ${g}, 40)`;
        ctx.shadowBlur = 0;
      }
      ctx.fillRect(
        seg.x * CELL_SIZE + 1,
        seg.y * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2
      );
    });
    ctx.shadowBlur = 0;

    // Overlay for non-playing states
    if (gameState === "idle" || gameState === "gameover" || gameState === "paused") {
      ctx.fillStyle = "rgba(6, 6, 32, 0.75)";
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "#4A7BFF";
      ctx.font = "bold 22px 'Courier New', monospace";
      ctx.textAlign = "center";

      if (gameState === "idle") {
        ctx.fillText("PRESS SPACE TO START", w / 2, h / 2 - 10);
        ctx.fillStyle = "#5A6A8A";
        ctx.font = "14px 'Courier New', monospace";
        ctx.fillText("WASD or Arrow Keys to move", w / 2, h / 2 + 20);
      } else if (gameState === "paused") {
        ctx.fillText("PAUSED", w / 2, h / 2 - 10);
        ctx.fillStyle = "#5A6A8A";
        ctx.font = "14px 'Courier New', monospace";
        ctx.fillText("Press Space to resume", w / 2, h / 2 + 20);
      } else {
        ctx.fillStyle = "#FF6A6A";
        ctx.fillText("GAME OVER", w / 2, h / 2 - 24);
        ctx.fillStyle = "#C0D0F0";
        ctx.font = "18px 'Courier New', monospace";
        ctx.fillText(`Score: ${score}`, w / 2, h / 2 + 6);
        ctx.fillStyle = "#5A6A8A";
        ctx.font = "14px 'Courier New', monospace";
        ctx.fillText("Press Space to retry", w / 2, h / 2 + 35);
      }
      ctx.textAlign = "start";
    }
  }, [snake, food, gameState, score]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Score bar */}
      <div className="flex items-center justify-between w-full" style={{ maxWidth: GRID_SIZE * CELL_SIZE }}>
        <div className="flex items-center gap-4">
          <div className="text-[12px]" style={{ color: "#5A6A8A", fontFamily: "'Courier New', monospace" }}>
            SCORE: <span style={{ color: "#4AFF4A" }}>{score}</span>
          </div>
          <div className="flex items-center gap-1 text-[12px]" style={{ color: "#5A6A8A", fontFamily: "'Courier New', monospace" }}>
            <Trophy size={11} style={{ color: "#FFD700" }} />
            BEST: <span style={{ color: "#FFD700" }}>{highScore}</span>
          </div>
        </div>
        <div className="text-[11px]" style={{ color: "#3A4A6A", fontFamily: "'Courier New', monospace" }}>
          SPEED: {Math.max(1, Math.round((1 - (Math.max(MIN_SPEED, INITIAL_SPEED - score * SPEED_INCREMENT) - MIN_SPEED) / (INITIAL_SPEED - MIN_SPEED)) * 10))}/10
        </div>
      </div>

      {/* Game canvas */}
      <div className={`${retro.sunken} p-1`} style={{ background: "#060620" }}>
        <canvas
          ref={canvasRef}
          width={GRID_SIZE * CELL_SIZE}
          height={GRID_SIZE * CELL_SIZE}
          style={{ display: "block", imageRendering: "pixelated" }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
          style={S_TEXT}
        >
          BACK TO MENU
        </button>

        {(gameState === "idle" || gameState === "gameover") && (
          <button
            onClick={startGame}
            className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
            style={{ color: "#4AFF4A" }}
          >
            <Play size={12} /> {gameState === "gameover" ? "RETRY" : "START"}
          </button>
        )}

        {gameState === "playing" && (
          <button
            onClick={togglePause}
            className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
            style={{ color: "#FFD700" }}
          >
            <Pause size={12} /> PAUSE
          </button>
        )}

        {gameState === "paused" && (
          <button
            onClick={togglePause}
            className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
            style={{ color: "#4AFF4A" }}
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
      </div>

      {/* Instructions */}
      <div className={`${retro.sunken} bg-[#0A0A28] p-3 w-full`} style={{ maxWidth: GRID_SIZE * CELL_SIZE }}>
        <div className="text-[10px] space-y-1" style={{ color: "#3A4A6A", fontFamily: "'Courier New', monospace" }}>
          <div><span style={{ color: "#5A6A8A" }}>CONTROLS:</span> WASD / Arrow Keys = Move · Space = Start/Pause</div>
          <div><span style={{ color: "#5A6A8A" }}>OBJECTIVE:</span> Eat the <span style={{ color: "#FF4444" }}>red</span> pixels. Don't hit walls or yourself.</div>
        </div>
      </div>
    </div>
  );
}