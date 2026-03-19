// ════════════════════════════════════════════════════════
// Dice Roll Animation — Tumbling dice overlay
// Uses motion for smooth animation. Cache-bust v3
// Supports multiple dice per roll (e.g. 4d20 = 4 dice)
// Stable random values — no jitter from re-renders
// ════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";

// ── Dice face SVGs ──

const DICE_FACES: Record<number, React.ReactNode> = {
  1: (
    <svg viewBox="0 0 40 40" width="100%" height="100%">
      <rect x="1" y="1" width="38" height="38" rx="5" fill="#1A1A4B" stroke="#AA77FF" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="3.5" fill="#FFD700" />
    </svg>
  ),
  2: (
    <svg viewBox="0 0 40 40" width="100%" height="100%">
      <rect x="1" y="1" width="38" height="38" rx="5" fill="#1A1A4B" stroke="#AA77FF" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" fill="#FFD700" />
      <circle cx="28" cy="28" r="3" fill="#FFD700" />
    </svg>
  ),
  3: (
    <svg viewBox="0 0 40 40" width="100%" height="100%">
      <rect x="1" y="1" width="38" height="38" rx="5" fill="#1A1A4B" stroke="#AA77FF" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" fill="#FFD700" />
      <circle cx="20" cy="20" r="3" fill="#FFD700" />
      <circle cx="28" cy="28" r="3" fill="#FFD700" />
    </svg>
  ),
  4: (
    <svg viewBox="0 0 40 40" width="100%" height="100%">
      <rect x="1" y="1" width="38" height="38" rx="5" fill="#1A1A4B" stroke="#AA77FF" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" fill="#FFD700" />
      <circle cx="28" cy="12" r="3" fill="#FFD700" />
      <circle cx="12" cy="28" r="3" fill="#FFD700" />
      <circle cx="28" cy="28" r="3" fill="#FFD700" />
    </svg>
  ),
  5: (
    <svg viewBox="0 0 40 40" width="100%" height="100%">
      <rect x="1" y="1" width="38" height="38" rx="5" fill="#1A1A4B" stroke="#AA77FF" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" fill="#FFD700" />
      <circle cx="28" cy="12" r="3" fill="#FFD700" />
      <circle cx="20" cy="20" r="3" fill="#FFD700" />
      <circle cx="12" cy="28" r="3" fill="#FFD700" />
      <circle cx="28" cy="28" r="3" fill="#FFD700" />
    </svg>
  ),
  6: (
    <svg viewBox="0 0 40 40" width="100%" height="100%">
      <rect x="1" y="1" width="38" height="38" rx="5" fill="#1A1A4B" stroke="#AA77FF" strokeWidth="1.5" />
      <circle cx="12" cy="10" r="3" fill="#FFD700" />
      <circle cx="28" cy="10" r="3" fill="#FFD700" />
      <circle cx="12" cy="20" r="3" fill="#FFD700" />
      <circle cx="28" cy="20" r="3" fill="#FFD700" />
      <circle cx="12" cy="30" r="3" fill="#FFD700" />
      <circle cx="28" cy="30" r="3" fill="#FFD700" />
    </svg>
  ),
};

const D20_FACE = (num: number) => (
  <svg viewBox="0 0 44 44" width="100%" height="100%">
    <polygon points="22,2 42,16 36,38 8,38 2,16" fill="#1A1A4B" stroke="#AA77FF" strokeWidth="1.5" />
    <polygon points="22,2 42,16 22,22" fill="none" stroke="#AA77FF55" strokeWidth="0.5" />
    <polygon points="22,2 2,16 22,22" fill="none" stroke="#AA77FF55" strokeWidth="0.5" />
    <polygon points="42,16 36,38 22,22" fill="none" stroke="#AA77FF55" strokeWidth="0.5" />
    <polygon points="2,16 8,38 22,22" fill="none" stroke="#AA77FF55" strokeWidth="0.5" />
    <polygon points="36,38 8,38 22,22" fill="none" stroke="#AA77FF55" strokeWidth="0.5" />
    <text x="22" y="24" textAnchor="middle" dominantBaseline="central" fill="#FFD700" fontSize="12" fontWeight="bold" fontFamily="Tahoma, sans-serif">{num}</text>
  </svg>
);

const D4_FACE = (num: number) => (
  <svg viewBox="0 0 44 44" width="100%" height="100%">
    <polygon points="22,4 40,38 4,38" fill="#1A1A4B" stroke="#AA77FF" strokeWidth="1.5" />
    <text x="22" y="28" textAnchor="middle" dominantBaseline="central" fill="#FFD700" fontSize="14" fontWeight="bold" fontFamily="Tahoma, sans-serif">{num}</text>
  </svg>
);

const D8_FACE = (num: number) => (
  <svg viewBox="0 0 44 44" width="100%" height="100%">
    <polygon points="22,2 42,22 22,42 2,22" fill="#1A1A4B" stroke="#AA77FF" strokeWidth="1.5" />
    <polygon points="22,2 42,22 22,22" fill="none" stroke="#AA77FF44" strokeWidth="0.5" />
    <polygon points="22,2 2,22 22,22" fill="none" stroke="#AA77FF44" strokeWidth="0.5" />
    <text x="22" y="23" textAnchor="middle" dominantBaseline="central" fill="#FFD700" fontSize="13" fontWeight="bold" fontFamily="Tahoma, sans-serif">{num}</text>
  </svg>
);

const D10_FACE = (num: number) => (
  <svg viewBox="0 0 44 44" width="100%" height="100%">
    <polygon points="22,3 40,15 36,36 8,36 4,15" fill="#1A1A4B" stroke="#AA77FF" strokeWidth="1.5" />
    <text x="22" y="24" textAnchor="middle" dominantBaseline="central" fill="#FFD700" fontSize="12" fontWeight="bold" fontFamily="Tahoma, sans-serif">{num}</text>
  </svg>
);

function getDiceFace(sides: number, face: number): React.ReactNode {
  if (sides === 4) return D4_FACE(face);
  if (sides <= 6) return DICE_FACES[Math.min(face, 6)] || DICE_FACES[1];
  if (sides === 8) return D8_FACE(face);
  if (sides === 10 || sides === 12) return D10_FACE(face);
  return D20_FACE(face);
}

// ── Types ──

interface RollState {
  id: string;
  result: number | null;
  sides: number;
  x: number;
  y: number;
  delay: number;
  // Pre-baked random values so animation targets never shift
  rand: {
    startRotate: number;
    arcMidX: number;
    arcMidY: number;
    totalSpin: number;
    tumbleDuration: number;
  };
}

export interface DiceInfo {
  count: number;
  sides: number;
  rolls: number[];
}

// ── Event bus ──

type DiceRollListener = (dice: DiceInfo[]) => void;
const listeners: Set<DiceRollListener> = new Set();

export function triggerDiceAnimation(dice: DiceInfo[]) {
  listeners.forEach((fn) => fn(dice));
}

export function parseDiceGroups(expr: string, potencyRaw: string): DiceInfo[] {
  const potencyClean = potencyRaw.replace(/\s*[+-]?\s*TE\s*\d*\s*$/i, "").trim();
  const potencyVal = parseFloat(potencyClean) || 0;
  const processed = expr.replace(/(?<![a-zA-Z])P(?![a-ce-zA-CE-Z])/g, String(Math.floor(potencyVal)));
  const groups: DiceInfo[] = [];
  const regex = /(\d+)?[dD](\d+)/g;
  let match;
  while ((match = regex.exec(processed)) !== null) {
    const count = parseInt(match[1], 10) || 1;
    const sides = parseInt(match[2], 10) || 6;
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) rolls.push(Math.floor(Math.random() * sides) + 1);
    groups.push({ count, sides, rolls });
  }
  return groups;
}

// ── Overlay ──

export function DiceAnimationOverlay() {
  const [rolls, setRolls] = useState<RollState[]>([]);
  const counterRef = useRef(0);

  const handleRoll = useCallback((dice: DiceInfo[]) => {
    const newRolls: RollState[] = [];
    let dieIndex = 0;
    const totalDice = dice.reduce((sum, g) => sum + g.count, 0);
    const maxVisible = Math.min(totalDice, 8);
    const spreadWidth = Math.min(50, maxVisible * 9);
    const startX = 50 - spreadWidth / 2;

    let globalIdx = 0;
    for (const group of dice) {
      for (let i = 0; i < group.count && dieIndex < maxVisible; i++) {
        const id = `dice-${counterRef.current++}`;
        const fraction = maxVisible > 1 ? globalIdx / (maxVisible - 1) : 0.5;
        const posX = startX + fraction * spreadWidth + (Math.random() - 0.5) * 4;
        const posY = 32 + (Math.random() - 0.5) * 10;
        const delay = dieIndex * 80;

        // Pre-bake ALL random values at creation time
        newRolls.push({
          id,
          result: group.rolls[i] ?? null,
          sides: group.sides,
          x: posX,
          y: posY,
          delay,
          rand: {
            startRotate: -(120 + Math.random() * 120),
            arcMidX: posX + (Math.random() - 0.5) * 6,
            arcMidY: posY - 6 - Math.random() * 4,
            totalSpin: 540 + Math.random() * 180,
            tumbleDuration: 0.7 + Math.random() * 0.15,
          },
        });
        dieIndex++;
        globalIdx++;
      }
    }

    setRolls((prev) => [...prev, ...newRolls]);

    const maxDelay = newRolls.length * 80;
    setTimeout(() => {
      const ids = new Set(newRolls.map((r) => r.id));
      setRolls((prev) => prev.filter((r) => !ids.has(r.id)));
    }, maxDelay + 1800);
  }, []);

  useEffect(() => {
    listeners.add(handleRoll);
    return () => { listeners.delete(handleRoll); };
  }, [handleRoll]);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
      <AnimatePresence>
        {rolls.map((roll) => (
          <TumblingDie key={roll.id} roll={roll} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── Single die ──

function TumblingDie({ roll }: { roll: RollState }) {
  const [face, setFace] = useState(1);
  const [phase, setPhase] = useState<"waiting" | "tumbling" | "settled">("waiting");
  const finalFace = roll.result ?? Math.floor(Math.random() * Math.min(roll.sides, 20)) + 1;
  const maxFaceDisplay = Math.min(roll.sides, 20);

  // All random animation values are read from roll.rand (stable)
  const { startRotate, arcMidX, arcMidY, totalSpin, tumbleDuration } = roll.rand;

  // Delay start
  useEffect(() => {
    const t = setTimeout(() => setPhase("tumbling"), roll.delay);
    return () => clearTimeout(t);
  }, [roll.delay]);

  // Face cycling — use requestAnimationFrame for smoother timing
  useEffect(() => {
    if (phase !== "tumbling") return;
    let count = 0;
    const maxCycles = 5 + Math.floor(tumbleDuration * 3);
    // Accelerating then decelerating intervals
    let raf: number;
    let lastTick = performance.now();

    const tick = (now: number) => {
      // Interval gets longer toward the end (decelerates)
      const interval = 60 + count * 15;
      if (now - lastTick >= interval) {
        count++;
        lastTick = now;
        if (count >= maxCycles) {
          setFace(finalFace);
          setPhase("settled");
          return;
        }
        setFace(Math.floor(Math.random() * maxFaceDisplay) + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, finalFace, maxFaceDisplay, tumbleDuration]);

  if (phase === "waiting") return null;

  const isD6 = roll.sides <= 6 && roll.sides !== 4;
  const size = isD6 ? 40 : 46;
  const isMaxRoll = finalFace === roll.sides;

  // Build a single smooth keyframed animation that goes:
  // start (top, small, rotated) → arc midpoint → landing position
  // Motion handles interpolation between these smoothly.
  const tumbleAnimate = {
    x: [`${roll.x}vw`, `${arcMidX}vw`, `${roll.x}vw`],
    y: ["-6vh", `${arcMidY}vh`, `${roll.y}vh`],
    rotate: [startRotate, startRotate + totalSpin * 0.6, totalSpin],
    scale: [0.3, 0.9, 1],
    opacity: [0.6, 1, 1],
  };

  const settledAnimate = {
    x: `${roll.x}vw`,
    y: `${roll.y}vh`,
    rotate: totalSpin,
    scale: 1,
    opacity: 1,
  };

  return (
    <motion.div
      initial={{
        x: `${roll.x}vw`,
        y: "-6vh",
        rotate: startRotate,
        scale: 0.3,
        opacity: 0.6,
      }}
      animate={phase === "settled" ? settledAnimate : tumbleAnimate}
      exit={{ opacity: 0, scale: 0.1, y: `${roll.y + 10}vh` }}
      transition={
        phase === "settled"
          ? { type: "spring", stiffness: 200, damping: 18 }
          : {
              duration: tumbleDuration,
              ease: [0.25, 0.1, 0.25, 1], // smooth cubic-bezier
              times: [0, 0.45, 1],
            }
      }
      style={{
        position: "absolute",
        width: size,
        height: size,
        filter:
          phase === "settled"
            ? `drop-shadow(0 0 ${isMaxRoll ? "12px #FFD700" : "6px #AA77FF55"})`
            : "drop-shadow(0 3px 8px rgba(0,0,0,0.4))",
        transformOrigin: "center center",
      }}
    >
      {getDiceFace(roll.sides, face)}

      {/* Result label — appears after settling */}
      {phase === "settled" && roll.result !== null && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.3 }}
          animate={{ opacity: 1, y: -8, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.05 }}
          style={{
            position: "absolute",
            top: -14,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0A0A2AE0",
            border: `1px solid ${isMaxRoll ? "#FFD700" : "#AA77FF"}`,
            borderRadius: 2,
            padding: "0px 5px",
            fontSize: 10,
            fontWeight: 800,
            color: isMaxRoll ? "#FFD700" : "#C0D0F0",
            fontFamily: "'Tahoma', sans-serif",
            whiteSpace: "nowrap",
            boxShadow: `0 2px 8px rgba(0,0,0,0.5)${isMaxRoll ? ", 0 0 6px #FFD70066" : ""}`,
          }}
        >
          {roll.result}
        </motion.div>
      )}
    </motion.div>
  );
}
