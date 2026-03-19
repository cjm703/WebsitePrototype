import React, { useState, useEffect, useCallback, useRef } from "react";
import { retro } from "./retro-styles";
import mascotImg from "@/assets/figma/Gnarpy_Boss1.png";
import type { MascotTrigger } from "./initial-data";
import { playRandomMascotSound } from "./mascot-sounds";
import { safeGetItem } from "./safe-storage";

// ========================
// Types
// ========================
interface MascotContext {
  currentHP: number;
  maxHP: number;
  currentWounds: number;
  totalWounds: number;
  currentWeight: number;
  maxWeight: number;
  exhaustion: number;
  maxExhaustion: number;
  statusEffectNames: string[];
}

interface MascotPopupProps {
  context: MascotContext;
  /** Called when a status effect is added — pass the name to trigger an event-based check */
  statusEffectAdded?: string | null;
}

// ========================
// Helpers
// ========================
const STORAGE_KEY = "inet-dm-mascotTriggers";
const DISPLAY_DURATION = 5000; // ms popup stays visible
const IDLE_CHECK_INTERVAL = 15000; // ms between random idle checks

function loadTriggers(): MascotTrigger[] {
  try {
    const raw = safeGetItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function pickLine(lines: string[]): string {
  if (lines.length === 0) return "...";
  return lines[Math.floor(Math.random() * lines.length)];
}

function rollChance(chance: number): boolean {
  return Math.random() * 100 < chance;
}

// ========================
// Component
// ========================
export function MascotPopup({ context, statusEffectAdded }: MascotPopupProps) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownRef = useRef(false); // prevent overlapping popups

  const showPopup = useCallback((msg: string) => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    setMessage(msg);
    setVisible(true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setVisible(false);
      // Brief cooldown so it doesn't immediately retrigger
      setTimeout(() => {
        cooldownRef.current = false;
      }, 3000);
    }, DISPLAY_DURATION);
  }, []);

  // Check condition-based triggers (called on context changes)
  const checkConditionTriggers = useCallback(() => {
    const triggers = loadTriggers().filter((t) => t.enabled);

    for (const trigger of triggers) {
      switch (trigger.type) {
        case "low_hp": {
          if (context.maxHP > 0) {
            const hpPct = (context.currentHP / context.maxHP) * 100;
            if (hpPct <= trigger.threshold && rollChance(trigger.chance)) {
              showPopup(pickLine(trigger.lines));
              return;
            }
          }
          break;
        }
        case "high_wounds": {
          if (context.totalWounds > 0) {
            const woundPct = (context.currentWounds / context.totalWounds) * 100;
            if (woundPct >= trigger.threshold && rollChance(trigger.chance)) {
              showPopup(pickLine(trigger.lines));
              return;
            }
          }
          break;
        }
        case "high_weight": {
          if (context.maxWeight > 0) {
            const weightPct = (context.currentWeight / context.maxWeight) * 100;
            if (weightPct >= trigger.threshold && rollChance(trigger.chance)) {
              showPopup(pickLine(trigger.lines));
              return;
            }
          }
          break;
        }
        case "high_exhaustion": {
          if (context.maxExhaustion > 0) {
            const exhPct = (context.exhaustion / context.maxExhaustion) * 100;
            if (exhPct >= trigger.threshold && rollChance(trigger.chance)) {
              showPopup(pickLine(trigger.lines));
              return;
            }
          }
          break;
        }
        case "status_effect": {
          if (
            trigger.statusEffectName &&
            context.statusEffectNames.some(
              (n) => n.toLowerCase() === trigger.statusEffectName.toLowerCase()
            ) &&
            rollChance(trigger.chance)
          ) {
            showPopup(pickLine(trigger.lines));
            return;
          }
          break;
        }
        case "status_effect_count": {
          const count = trigger.statusEffectName
            ? context.statusEffectNames.filter(
                (n) => n.toLowerCase() === trigger.statusEffectName.toLowerCase()
              ).length
            : context.statusEffectNames.length;
          if (count >= trigger.threshold && rollChance(trigger.chance)) {
            showPopup(pickLine(trigger.lines));
            return;
          }
          break;
        }
      }
    }
  }, [context, showPopup]);

  // Random idle timer
  useEffect(() => {
    const interval = setInterval(() => {
      const triggers = loadTriggers().filter((t) => t.enabled && t.type === "random");
      for (const trigger of triggers) {
        if (rollChance(trigger.chance)) {
          showPopup(pickLine(trigger.lines));
          break;
        }
      }
    }, IDLE_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [showPopup]);

  // Check condition triggers when context values change
  useEffect(() => {
    checkConditionTriggers();
  }, [
    context.currentHP,
    context.currentWounds,
    context.currentWeight,
    context.exhaustion,
    context.statusEffectNames.length,
  ]);

  // Event-based: status effect was just added
  useEffect(() => {
    if (!statusEffectAdded) return;
    const triggers = loadTriggers().filter(
      (t) =>
        t.enabled &&
        t.type === "status_effect" &&
        t.statusEffectName.toLowerCase() === statusEffectAdded.toLowerCase()
    );
    for (const trigger of triggers) {
      if (rollChance(trigger.chance)) {
        showPopup(pickLine(trigger.lines));
        break;
      }
    }
  }, [statusEffectAdded, showPopup]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{
        bottom: "24px",
        right: "24px",
        animation: "mascotSlideIn 0.35s ease-out",
      }}
    >
      <style>{`
        @keyframes mascotSlideIn {
          from { opacity: 0; transform: translateY(30px) scale(0.9); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes mascotBob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
      `}</style>
      <div className="flex items-end gap-3">
        {/* Speech bubble */}
        <div
          className={`${retro.raised} relative max-w-[510px] pointer-events-auto`}
          style={{
            background: "#0E0E35",
            padding: "24px 30px",
            marginBottom: "20px",
          }}
        >
          <div
            className="text-[16px] leading-relaxed"
            style={{
              color: "#C0D0F0",
              fontFamily: "'Tahoma', 'Verdana', sans-serif",
            }}
          >
            {message}
          </div>
          {/* Tail pointing right toward mascot */}
          <div
            style={{
              position: "absolute",
              right: "-12px",
              bottom: "20px",
              width: 0,
              height: 0,
              borderTop: "12px solid transparent",
              borderBottom: "12px solid transparent",
              borderLeft: "12px solid #0E0E35",
            }}
          />
        </div>
        {/* Mascot image */}
        <div
          style={{ animation: "mascotBob 2s ease-in-out infinite", cursor: "pointer" }}
          className="pointer-events-auto"
          onClick={playRandomMascotSound}
        >
          <img
            src={mascotImg}
            alt="Mascot"
            className="select-none"
            style={{
              width: "160px",
              height: "160px",
              objectFit: "contain",
              imageRendering: "auto",
            }}
          />
        </div>
      </div>
    </div>
  );
}