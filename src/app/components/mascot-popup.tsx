import React, { useState, useEffect, useCallback, useRef } from "react";
import { retro } from "./retro-styles";
import mascotImg from "@/assets/figma/Gnarpy_Boss1.png";
import type { MascotTrigger } from "./initial-data";
import { playRandomMascotSound } from "./mascot-sounds";
import { safeGetItem } from "./safe-storage";
import { appStore } from "@/lib/app-store";

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
  statusEffectAdded?: string | null;
}

const LEGACY_STORAGE_KEY = "inet-dm-mascotTriggers";
const DISPLAY_DURATION = 5000;
const IDLE_CHECK_INTERVAL = 30000;
const REMOTE_REFRESH_INTERVAL = 45000;
const CUSTOMIZE_EVENT = "inet-dm-customize-updated";

type DmCustomizeState = {
  mascotTriggers?: MascotTrigger[];
  partyColorPrompt?: string;
  boredLines?: string[];
};

function readLegacyTriggers(): MascotTrigger[] {
  try {
    const raw = safeGetItem(LEGACY_STORAGE_KEY);
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

function getEnabledTriggers(triggers: MascotTrigger[]): MascotTrigger[] {
  return Array.isArray(triggers) ? triggers.filter((trigger) => !!trigger?.enabled) : [];
}

export function MascotPopup({ context, statusEffectAdded }: MascotPopupProps) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [triggers, setTriggers] = useState<MascotTrigger[]>(() => readLegacyTriggers());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownRef = useRef(false);

  const showPopup = useCallback((msg: string) => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    setMessage(msg);
    setVisible(true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        cooldownRef.current = false;
      }, 3000);
    }, DISPLAY_DURATION);
  }, []);

  const refreshTriggers = useCallback(async () => {
    try {
      const remote = await appStore.loadDmCustomizeState<DmCustomizeState | null>(null);
      const next = Array.isArray(remote?.mascotTriggers) ? remote!.mascotTriggers! : readLegacyTriggers();
      setTriggers(next);
    } catch {
      setTriggers(readLegacyTriggers());
    }
  }, []);

  const checkConditionTriggers = useCallback(() => {
    const enabledTriggers = getEnabledTriggers(triggers);

    for (const trigger of enabledTriggers) {
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
              (name) => name.toLowerCase() === trigger.statusEffectName.toLowerCase(),
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
                (name) => name.toLowerCase() === trigger.statusEffectName.toLowerCase(),
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
  }, [context, showPopup, triggers]);

  useEffect(() => {
    void refreshTriggers();

    const onRefresh = () => {
      void refreshTriggers();
    };

    window.addEventListener("focus", onRefresh);
    window.addEventListener(CUSTOMIZE_EVENT, onRefresh as EventListener);
    const interval = window.setInterval(onRefresh, REMOTE_REFRESH_INTERVAL);

    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener(CUSTOMIZE_EVENT, onRefresh as EventListener);
      window.clearInterval(interval);
    };
  }, [refreshTriggers]);

  useEffect(() => {
    const interval = setInterval(() => {
      const randomTriggers = getEnabledTriggers(triggers).filter((trigger) => trigger.type === "random");
      for (const trigger of randomTriggers) {
        if (rollChance(trigger.chance)) {
          showPopup(pickLine(trigger.lines));
          break;
        }
      }
    }, IDLE_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [showPopup, triggers]);

  useEffect(() => {
    checkConditionTriggers();
  }, [
    context.currentHP,
    context.currentWounds,
    context.currentWeight,
    context.exhaustion,
    context.statusEffectNames.length,
    checkConditionTriggers,
  ]);

  useEffect(() => {
    if (!statusEffectAdded) return;
    const matchingTriggers = getEnabledTriggers(triggers).filter(
      (trigger) =>
        trigger.type === "status_effect" &&
        !!trigger.statusEffectName &&
        trigger.statusEffectName.toLowerCase() === statusEffectAdded.toLowerCase(),
    );

    for (const trigger of matchingTriggers) {
      if (rollChance(trigger.chance)) {
        showPopup(pickLine(trigger.lines));
        break;
      }
    }
  }, [statusEffectAdded, showPopup, triggers]);

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
