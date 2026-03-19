import React, { useState, useEffect, useRef, useCallback } from "react";
import { retro } from "./retro-styles";
import { Eraser, Download, Eye, EyeOff, Grid3x3 } from "lucide-react";
import { usePageVisibility } from "./use-visibility";
import { safeGetItem, safeSetItem, safeSetJson } from "./safe-storage";
import { DISPLAY_CONTENTS, S_MUTED, S_DIM, S_GREEN, S_TEXT } from "./shared-styles";

const CANVAS_SIZE = 250;
const PIXEL_SCALE = 5;
const STORAGE_KEY = "inet-party-color-canvas";
const PROMPT_KEY = "inet-dm-party-color-prompt";
const CURSORS_KEY = "inet-party-color-cursors";
const CURSOR_STALE_MS = 4000;
const CURSOR_HIDE_RADIUS = 60;

interface CursorEntry {
  x: number;
  y: number;
  timestamp: number;
  color: string;
}

type CursorsMap = Record<string, CursorEntry>;

const COLOR_PALETTE = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Red", hex: "#FF0000" },
  { name: "Green", hex: "#00CC00" },
  { name: "Blue", hex: "#0000FF" },
  { name: "Yellow", hex: "#FFFF00" },
  { name: "Cyan", hex: "#00FFFF" },
  { name: "Magenta", hex: "#FF00FF" },
  { name: "Orange", hex: "#FF8800" },
  { name: "Brown", hex: "#8B4513" },
  { name: "Dark Green", hex: "#006400" },
  { name: "Navy", hex: "#000080" },
  { name: "Purple", hex: "#8B00FF" },
  { name: "Pink", hex: "#FF69B4" },
  { name: "Tan", hex: "#D2B48C" },
  { name: "Gray", hex: "#808080" },
  { name: "Light Red", hex: "#FF6666" },
  { name: "Light Green", hex: "#66FF66" },
  { name: "Light Blue", hex: "#6666FF" },
  { name: "Peach", hex: "#FFDAB9" },
  { name: "Lavender", hex: "#E6E6FA" },
  { name: "Sky Blue", hex: "#87CEEB" },
  { name: "Lime", hex: "#CCFF00" },
  { name: "Dark Gray", hex: "#404040" },
];

const BRUSH_SIZES = [1, 2, 3, 5, 8];

const CURSOR_COLORS = ["#FF6A6A", "#4AFF4A", "#4AC0FF", "#FFD700", "#FF69B4", "#C06AFF", "#FF8800", "#00FFFF"];
function cursorColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

export function PartyColor({ onBack }: { onBack: () => void }) {
  const isPageVisible = usePageVisibility();
  const currentUser = safeGetItem("inet-user") || "";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(2);
  const [isErasing, setIsErasing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [showOtherPlayers, setShowOtherPlayers] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [otherCursors, setOtherCursors] = useState<CursorsMap>({});
  const [myScreenPos, setMyScreenPos] = useState<{ x: number; y: number } | null>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const displaySize = CANVAS_SIZE * PIXEL_SCALE;

  // Draw the pixel grid overlay
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const ctx = grid.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, displaySize, displaySize);

    if (!showGrid) return;

    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = 0; x <= CANVAS_SIZE; x++) {
      const sx = x * PIXEL_SCALE + 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, displaySize);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y <= CANVAS_SIZE; y++) {
      const sy = y * PIXEL_SCALE + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(displaySize, sy);
      ctx.stroke();
    }
  }, [showGrid, displaySize]);

  // Load prompt
  useEffect(() => {
    const loadPrompt = () => {
      const saved = safeGetItem(PROMPT_KEY);
      if (saved) {
        try { setPrompt(JSON.parse(saved)); } catch { setPrompt(saved); }
      }
    };
    loadPrompt();
    if (!isPageVisible) return;
    const interval = setInterval(loadPrompt, 2000);
    return () => clearInterval(interval);
  }, [isPageVisible]);

  // Load canvas from localStorage
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const savedData = safeGetItem(STORAGE_KEY);
    if (savedData) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0); };
      img.src = savedData;
    }
  }, []);

  // Poll for canvas changes from other users
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let lastKnown = safeGetItem(STORAGE_KEY);

    if (!isPageVisible) return;
    const interval = setInterval(() => {
      if (isDrawingRef.current) return;
      const current = safeGetItem(STORAGE_KEY);
      if (current && current !== lastKnown) {
        lastKnown = current;
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, 0, 0); };
        img.src = current;
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [isPageVisible]);

  // Write my cursor position to localStorage
  const writeMyCursor = useCallback(
    (lx: number, ly: number) => {
      if (!currentUser) return;
      try {
        const raw = safeGetItem(CURSORS_KEY);
        const map: CursorsMap = raw ? JSON.parse(raw) : {};
        map[currentUser] = { x: lx, y: ly, timestamp: Date.now(), color: isErasing ? "#FFFFFF" : selectedColor };
        safeSetJson(CURSORS_KEY, map);
      } catch { /* ignore */ }
    },
    [currentUser, selectedColor, isErasing]
  );

  // Remove my cursor when leaving
  const removeMyCursor = useCallback(() => {
    if (!currentUser) return;
    try {
      const raw = safeGetItem(CURSORS_KEY);
      const map: CursorsMap = raw ? JSON.parse(raw) : {};
      delete map[currentUser];
      safeSetJson(CURSORS_KEY, map);
    } catch { /* ignore */ }
  }, [currentUser]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { removeMyCursor(); };
  }, [removeMyCursor]);

  // Poll other cursors (pauses when tab hidden)
  useEffect(() => {
    if (!showOtherPlayers || !isPageVisible) { setOtherCursors({}); return; }

    const interval = setInterval(() => {
      try {
        const raw = safeGetItem(CURSORS_KEY);
        if (!raw) { setOtherCursors({}); return; }
        const map: CursorsMap = JSON.parse(raw);
        const now = Date.now();
        const others: CursorsMap = {};
        for (const [name, entry] of Object.entries(map)) {
          if (name === currentUser) continue;
          if (now - entry.timestamp < CURSOR_STALE_MS) {
            others[name] = entry;
          }
        }
        setOtherCursors(others);
      } catch { setOtherCursors({}); }
    }, 250);
    return () => clearInterval(interval);
  }, [currentUser, showOtherPlayers, isPageVisible]);

  const saveCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try { safeSetItem(STORAGE_KEY, canvas.toDataURL("image/png")); } catch {}
  }, []);

  const getCanvasPos = (e: React.MouseEvent): { x: number; y: number } => {
    const grid = gridRef.current;
    if (!grid) return { x: 0, y: 0 };
    const rect = grid.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(CANVAS_SIZE - 1, Math.floor(((e.clientX - rect.left) / rect.width) * CANVAS_SIZE))),
      y: Math.max(0, Math.min(CANVAS_SIZE - 1, Math.floor(((e.clientY - rect.top) / rect.height) * CANVAS_SIZE))),
    };
  };

  const getScreenPosOnWrapper = (e: React.MouseEvent): { x: number; y: number } => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return { x: 0, y: 0 };
    const rect = wrapper.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const drawDot = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = isErasing ? "#FFFFFF" : selectedColor;
    const half = Math.floor(brushSize / 2);
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < CANVAS_SIZE && py >= 0 && py < CANVAS_SIZE) {
          if (dx * dx + dy * dy <= half * half + half) {
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }
    }
  };

  const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;
    while (true) {
      drawDot(cx, cy);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  };

  // Mouse events go on the grid overlay (top layer), but we compute positions based on the underlying canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    isDrawingRef.current = true;
    const pos = getCanvasPos(e);
    lastPosRef.current = pos;
    drawDot(pos.x, pos.y);
    writeMyCursor(pos.x, pos.y);
    setMyScreenPos(getScreenPosOnWrapper(e));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    setMyScreenPos(getScreenPosOnWrapper(e));
    writeMyCursor(pos.x, pos.y);

    if (!isDrawingRef.current) return;
    const last = lastPosRef.current;
    if (last) {
      drawLine(last.x, last.y, pos.x, pos.y);
    }
    lastPosRef.current = pos;
  };

  const handleMouseUp = () => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      lastPosRef.current = null;
      saveCanvas();
    }
  };

  const handleMouseLeave = () => {
    handleMouseUp();
    setMyScreenPos(null);
    removeMyCursor();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "party-color.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const activeColor = isErasing ? "#FFFFFF" : selectedColor;

  // Convert logical canvas coords to screen coords within the wrapper
  const logicalToScreen = (lx: number, ly: number) => ({
    // 6px = 2px sunken border + 4px padding
    x: lx * PIXEL_SCALE + 6,
    y: ly * PIXEL_SCALE + 6,
  });

  // Check if my screen cursor is near a given screen position
  const isNearMyCursor = (sx: number, sy: number): boolean => {
    if (!myScreenPos) return false;
    const dx = myScreenPos.x - sx;
    const dy = myScreenPos.y - sy;
    return Math.sqrt(dx * dx + dy * dy) < CURSOR_HIDE_RADIUS;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Drawing Prompt */}
      {prompt && (
        <div
          className={`${retro.raised} w-full px-3 py-1.5`}
          style={{
            maxWidth: displaySize + 200,
            background: "#12123A",
            borderLeft: "3px solid #FFD700",
          }}
        >
          <div
            className="text-[10px]"
            style={{
              color: "#C0D0F0",
              fontFamily: "'Courier New', monospace",
            }}
          >
            <span style={{ color: "#FFD700" }}>PROMPT:</span> {prompt}
          </div>
        </div>
      )}

      <div className="flex gap-5 flex-wrap justify-center items-start">
        {/* Canvas area with grid overlay and cursor tags */}
        <div className="flex flex-col items-center gap-2">
          <div
            ref={wrapperRef}
            className="relative"
            style={{ width: displaySize + 12, height: displaySize + 12 }}
          >
            <div
              className={`${retro.sunken} p-1`}
              style={{ background: "#0A0A28" }}
            >
              {/* Drawing canvas */}
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                style={{
                  display: "block",
                  width: displaySize,
                  height: displaySize,
                  imageRendering: "pixelated",
                }}
              />
              {/* Grid overlay canvas — sits on top, receives all mouse events */}
              <canvas
                ref={gridRef}
                width={displaySize}
                height={displaySize}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                style={{
                  position: "absolute",
                  top: 6, // 2px sunken border + 4px padding
                  left: 6,
                  width: displaySize,
                  height: displaySize,
                  cursor: "crosshair",
                }}
              />
            </div>

            {/* Other players' cursor tags */}
            {showOtherPlayers &&
              Object.entries(otherCursors).map(([name, entry]) => {
                const screenPos = logicalToScreen(entry.x, entry.y);
                const hidden = isNearMyCursor(screenPos.x, screenPos.y);
                if (hidden) return null;

                const cColor = cursorColorForName(name);
                return (
                  <div
                    key={name}
                    className="absolute pointer-events-none"
                    style={{
                      left: screenPos.x + 8,
                      top: screenPos.y - 6,
                      transition: "left 0.15s linear, top 0.15s linear, opacity 0.15s ease",
                      zIndex: 10,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: -8,
                        top: 3,
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: cColor,
                        boxShadow: `0 0 4px ${cColor}`,
                      }}
                    />
                    <div
                      className="whitespace-nowrap"
                      style={{
                        fontSize: 8,
                        fontFamily: "'Courier New', monospace",
                        color: cColor,
                        background: "rgba(6,6,32,0.85)",
                        padding: "1px 4px",
                        border: `1px solid ${cColor}40`,
                        lineHeight: "12px",
                      }}
                    >
                      {name}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Canvas info */}
          <div
            className="text-[9px] flex items-center gap-2"
            style={{ color: "#3A4A6A", fontFamily: "'Courier New', monospace" }}
          >
            <span>{CANVAS_SIZE}x{CANVAS_SIZE}px</span>
            <span>·</span>
            <span>Shared canvas</span>
            {showOtherPlayers && Object.keys(otherCursors).length > 0 && (
              <div style={DISPLAY_CONTENTS}>
                <span>·</span>
                <span style={S_GREEN}>
                  {Object.keys(otherCursors).length} other{Object.keys(otherCursors).length !== 1 ? "s" : ""} drawing
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tools panel */}
        <div className="flex flex-col gap-3" style={{ minWidth: 170 }}>
          {/* Color palette */}
          <div className={`${retro.sunken} bg-[#0A0A28] p-3`}>
            <div
              className="text-[10px] mb-2"
              style={{ color: "#5A6A8A", fontFamily: "'Courier New', monospace" }}
            >
              COLORS:
            </div>
            <div className="grid grid-cols-8 gap-1">
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color.hex}
                  onClick={() => { setSelectedColor(color.hex); setIsErasing(false); }}
                  title={color.name}
                  className="w-5 h-5 cursor-pointer transition-transform hover:scale-125"
                  style={{
                    background: color.hex,
                    border:
                      selectedColor === color.hex && !isErasing
                        ? "2px solid #FFD700"
                        : color.hex === "#FFFFFF" || color.hex === "#E6E6FA" || color.hex === "#FFDAB9"
                        ? "1px solid #3A4A6A"
                        : "1px solid #1A1A4B",
                    boxShadow:
                      selectedColor === color.hex && !isErasing
                        ? "0 0 6px rgba(255, 215, 0, 0.5)"
                        : "none",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Current color preview */}
          <div className={`${retro.sunken} bg-[#0A0A28] p-3`}>
            <div
              className="text-[10px] mb-2"
              style={{ color: "#5A6A8A", fontFamily: "'Courier New', monospace" }}
            >
              ACTIVE:
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8"
                style={{ background: activeColor, border: "1px solid #3A4A6A" }}
              />
              <div
                className="text-[11px]"
                style={{ color: "#C0D0F0", fontFamily: "'Courier New', monospace" }}
              >
                {isErasing ? "ERASER" : activeColor}
              </div>
            </div>
          </div>

          {/* Brush size */}
          <div className={`${retro.sunken} bg-[#0A0A28] p-3`}>
            <div
              className="text-[10px] mb-2"
              style={{ color: "#5A6A8A", fontFamily: "'Courier New', monospace" }}
            >
              BRUSH SIZE:
            </div>
            <div className="flex items-center gap-1.5">
              {BRUSH_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => setBrushSize(size)}
                  className="flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                  style={{
                    width: 28,
                    height: 28,
                    background: brushSize === size ? "#1A1A5B" : "#0C0C30",
                    border: brushSize === size ? "2px solid #4A7BFF" : "1px solid #1A1A4B",
                  }}
                  title={`${size}px`}
                >
                  <div
                    style={{
                      width: Math.min(size * 2, 18),
                      height: Math.min(size * 2, 18),
                      borderRadius: "50%",
                      background: "#C0D0F0",
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Tools */}
          <div className={`${retro.sunken} bg-[#0A0A28] p-3`}>
            <div
              className="text-[10px] mb-2"
              style={{ color: "#5A6A8A", fontFamily: "'Courier New', monospace" }}
            >
              TOOLS:
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => setIsErasing(!isErasing)}
                className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-2 w-full`}
                style={{
                  color: isErasing ? "#FFD700" : "#C0D0F0",
                  background: isErasing ? "#2A2A5B" : undefined,
                }}
              >
                <Eraser size={12} /> {isErasing ? "ERASING" : "ERASER"}
              </button>
              <button
                onClick={handleDownload}
                className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-2 w-full`}
                style={S_GREEN}
              >
                <Download size={12} /> SAVE PNG
              </button>
            </div>
          </div>

          {/* Settings */}
          <div className={`${retro.sunken} bg-[#0A0A28] p-3`}>
            <div
              className="text-[10px] mb-2"
              style={{ color: "#5A6A8A", fontFamily: "'Courier New', monospace" }}
            >
              SETTINGS:
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => setShowOtherPlayers(!showOtherPlayers)}
                className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-2 w-full`}
                style={{
                  color: showOtherPlayers ? "#4AC0FF" : "#5A6A8A",
                }}
              >
                {showOtherPlayers ? <Eye size={12} /> : <EyeOff size={12} />}
                {showOtherPlayers ? "PLAYERS: ON" : "PLAYERS: OFF"}
              </button>
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-2 w-full`}
                style={{
                  color: showGrid ? "#FFAA4A" : "#5A6A8A",
                }}
              >
                <Grid3x3 size={12} />
                {showGrid ? "GRID: ON" : "GRID: OFF"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Back button */}
      <div className="flex items-center gap-3 mt-1">
        <button
          onClick={onBack}
          className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
          style={S_TEXT}
        >
          BACK TO MENU
        </button>
      </div>

      {/* Instructions */}
      <div
        className={`${retro.sunken} bg-[#0A0A28] p-3 w-full`}
        style={{ maxWidth: displaySize + 200 }}
      >
        <div
          className="text-[10px] space-y-1"
          style={{ color: "#3A4A6A", fontFamily: "'Courier New', monospace" }}
        >
          <div>
            <span style={S_MUTED}>CONTROLS:</span> Click and drag to draw · Select colors from the palette · Use the eraser to correct mistakes
          </div>
          <div>
            <span style={S_MUTED}>INFO:</span> Shared canvas — all players draw on the same board. Toggle the pixel grid in Settings to see cell boundaries.
          </div>
        </div>
      </div>
    </div>
  );
}