import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import { ArrowLeft, ChevronLeft, ChevronRight, Cloud, CloudRain, CloudDrizzle, CloudLightning, CloudFog, Snowflake, Wind } from "lucide-react";
import { getPlayerTheme, buildPageGradient, firstColor, ts } from "./player-theme";
import { safeGetItem } from "./safe-storage";
import { DISPLAY_CONTENTS } from "./shared-styles";
<<<<<<< HEAD
import { appStore } from "@/lib/app-store";
=======
>>>>>>> d3f4b511234b6ce0be81d8d8b597af0266983bd9

const CALENDAR_MONTHS = [
  "Lunara", "Selene", "Artemina", "Diantha", "Solyndra", "Astraeus", "Eosara",
  "Umbriel", "Astralia", "Caelion", "Serevain", "Brimara", "Hiemsyl",
] as const;

const DAYS_PER_MONTH = 28;

interface CalendarDate {
  month: number;
  day: number;
  year: number;
  isStarfall?: boolean;
}

interface StarColors {
  bodyGrad: string;
  glowOuter: string;
  glowMid: string;
  glowInner: string;
  core: string;
  tipGlow: string;
  flareMid: string;
  flareEdge: string;
  dropShadow: string;
}

interface MonthStar {
  name: string;
  colors: StarColors;
  brightness: number;
}

const MONTH_STARS: MonthStar[] = [
  {
    name: "Lunara",
    brightness: 0.8,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #DDEEFF 0%, #88BBFF 25%, #4488EE 50%, #2266CC 75%, #1144AA 100%)",
      glowOuter: "rgba(80,140,255,0.1)",
      glowMid: "rgba(100,160,255,0.15)",
      glowInner: "rgba(140,190,255,0.2)",
      core: "rgba(220,235,255,0.9) 0%, rgba(160,200,255,0.4) 50%, transparent 100%",
      tipGlow: "rgba(200,225,255,0.95) 0%, rgba(120,180,255,0.5) 40%, transparent 100%",
      flareMid: "rgba(180,210,255,0.35)",
      flareEdge: "rgba(120,170,255,0.12)",
      dropShadow: "drop-shadow(0 0 8px rgba(80,140,255,0.5)) drop-shadow(0 0 20px rgba(60,120,230,0.25))",
    },
  },
  {
    name: "Selene",
    brightness: 1.1,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #FFFFFF 0%, #FDF99D 25%, #F5EE80 50%, #E8DD55 75%, #D4C830 100%)",
      glowOuter: "rgba(253,249,157,0.08)",
      glowMid: "rgba(253,249,157,0.14)",
      glowInner: "rgba(255,255,220,0.2)",
      core: "rgba(255,255,255,0.95) 0%, rgba(253,249,157,0.5) 50%, transparent 100%",
      tipGlow: "rgba(255,255,240,0.95) 0%, rgba(253,249,157,0.5) 40%, transparent 100%",
      flareMid: "rgba(253,249,157,0.3)",
      flareEdge: "rgba(253,249,157,0.1)",
      dropShadow: "drop-shadow(0 0 8px rgba(253,249,157,0.5)) drop-shadow(0 0 20px rgba(253,249,157,0.2))",
    },
  },
  {
    name: "Artemina",
    brightness: 1.4,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #FFFFFF 0%, #E8E8E8 20%, #C8C8C8 40%, #9A9A9A 65%, #6A6A6A 100%)",
      glowOuter: "rgba(220,220,230,0.1)",
      glowMid: "rgba(240,240,245,0.15)",
      glowInner: "rgba(255,255,255,0.22)",
      core: "rgba(255,255,255,0.95) 0%, rgba(220,220,230,0.5) 50%, transparent 100%",
      tipGlow: "rgba(255,255,255,0.95) 0%, rgba(200,200,210,0.5) 40%, transparent 100%",
      flareMid: "rgba(255,255,255,0.35)",
      flareEdge: "rgba(200,200,210,0.12)",
      dropShadow: "drop-shadow(0 0 8px rgba(255,255,255,0.5)) drop-shadow(0 0 20px rgba(220,220,230,0.25))",
    },
  },
  {
    name: "Diantha",
    brightness: 0.8,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #FF4466 0%, #E20934 25%, #8A1A3A 45%, #3A1A55 65%, #112665 100%)",
      glowOuter: "rgba(226,9,52,0.08)",
      glowMid: "rgba(226,9,52,0.12)",
      glowInner: "rgba(255,50,80,0.18)",
      core: "rgba(255,180,190,0.9) 0%, rgba(226,9,52,0.5) 50%, transparent 100%",
      tipGlow: "rgba(255,140,160,0.9) 0%, rgba(226,9,52,0.5) 40%, transparent 100%",
      flareMid: "rgba(226,9,52,0.3)",
      flareEdge: "rgba(17,38,101,0.15)",
      dropShadow: "drop-shadow(0 0 8px rgba(226,9,52,0.5)) drop-shadow(0 0 20px rgba(17,38,101,0.3))",
    },
  },
  {
    name: "Solyndra",
    brightness: 2.0,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #FFFDE0 0%, #FFE44D 25%, #FFD700 50%, #E6B800 75%, #CC9900 100%)",
      glowOuter: "rgba(255,215,0,0.12)",
      glowMid: "rgba(255,215,0,0.2)",
      glowInner: "rgba(255,230,100,0.3)",
      core: "rgba(255,255,255,0.98) 0%, rgba(255,230,100,0.6) 50%, transparent 100%",
      tipGlow: "rgba(255,255,220,0.98) 0%, rgba(255,215,0,0.6) 40%, transparent 100%",
      flareMid: "rgba(255,215,0,0.45)",
      flareEdge: "rgba(255,215,0,0.15)",
      dropShadow: "drop-shadow(0 0 12px rgba(255,215,0,0.7)) drop-shadow(0 0 30px rgba(255,215,0,0.35))",
    },
  },
  {
    name: "Astraeus",
    brightness: 0.6,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #F5F5F0 0%, #D4D0C8 25%, #C0B898 50%, #B0A060 75%, #A09040 100%)",
      glowOuter: "rgba(192,184,152,0.06)",
      glowMid: "rgba(192,184,152,0.1)",
      glowInner: "rgba(210,200,170,0.15)",
      core: "rgba(245,245,240,0.85) 0%, rgba(192,184,152,0.4) 50%, transparent 100%",
      tipGlow: "rgba(240,240,230,0.85) 0%, rgba(192,184,152,0.4) 40%, transparent 100%",
      flareMid: "rgba(192,184,152,0.25)",
      flareEdge: "rgba(160,144,64,0.08)",
      dropShadow: "drop-shadow(0 0 6px rgba(192,184,152,0.4)) drop-shadow(0 0 14px rgba(160,144,64,0.15))",
    },
  },
  {
    name: "Eosara",
    brightness: 1.0,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #FFE8E0 0%, #FFCCBB 25%, #FFAA99 50%, #E8917A 75%, #C87A66 100%)",
      glowOuter: "rgba(255,170,153,0.08)",
      glowMid: "rgba(255,170,153,0.14)",
      glowInner: "rgba(255,200,180,0.2)",
      core: "rgba(255,245,240,0.92) 0%, rgba(255,170,153,0.5) 50%, transparent 100%",
      tipGlow: "rgba(255,230,220,0.92) 0%, rgba(255,170,153,0.5) 40%, transparent 100%",
      flareMid: "rgba(255,170,153,0.3)",
      flareEdge: "rgba(200,122,102,0.1)",
      dropShadow: "drop-shadow(0 0 8px rgba(255,170,153,0.5)) drop-shadow(0 0 20px rgba(200,122,102,0.2))",
    },
  },
  {
    name: "Umbriel",
    brightness: 0.7,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #6A5A8A 0%, #4A3A6A 25%, #2A1A4A 50%, #1A0A3A 75%, #0A0020 100%)",
      glowOuter: "rgba(74,58,106,0.08)",
      glowMid: "rgba(74,58,106,0.12)",
      glowInner: "rgba(106,90,138,0.18)",
      core: "rgba(160,140,200,0.85) 0%, rgba(74,58,106,0.4) 50%, transparent 100%",
      tipGlow: "rgba(140,120,180,0.85) 0%, rgba(74,58,106,0.4) 40%, transparent 100%",
      flareMid: "rgba(106,90,138,0.3)",
      flareEdge: "rgba(42,26,74,0.12)",
      dropShadow: "drop-shadow(0 0 6px rgba(106,90,138,0.5)) drop-shadow(0 0 16px rgba(42,26,74,0.25))",
    },
  },
  {
    name: "Astralia",
    brightness: 0.6,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #E8E0FF 0%, #C4B8FF 25%, #88DDEE 50%, #55CCDD 75%, #33AABB 100%)",
      glowOuter: "rgba(136,221,238,0.06)",
      glowMid: "rgba(136,221,238,0.1)",
      glowInner: "rgba(196,184,255,0.16)",
      core: "rgba(232,224,255,0.85) 0%, rgba(136,221,238,0.4) 50%, transparent 100%",
      tipGlow: "rgba(220,210,255,0.85) 0%, rgba(136,221,238,0.4) 40%, transparent 100%",
      flareMid: "rgba(136,221,238,0.25)",
      flareEdge: "rgba(51,170,187,0.08)",
      dropShadow: "drop-shadow(0 0 6px rgba(136,221,238,0.4)) drop-shadow(0 0 14px rgba(51,170,187,0.15))",
    },
  },
  {
    name: "Caelion",
    brightness: 0.7,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #C8DDFF 0%, #8AB0EE 25%, #4477CC 50%, #2255AA 75%, #103888 100%)",
      glowOuter: "rgba(68,119,204,0.08)",
      glowMid: "rgba(68,119,204,0.12)",
      glowInner: "rgba(138,176,238,0.18)",
      core: "rgba(200,221,255,0.88) 0%, rgba(68,119,204,0.45) 50%, transparent 100%",
      tipGlow: "rgba(180,200,255,0.88) 0%, rgba(68,119,204,0.45) 40%, transparent 100%",
      flareMid: "rgba(138,176,238,0.3)",
      flareEdge: "rgba(16,56,136,0.1)",
      dropShadow: "drop-shadow(0 0 7px rgba(68,119,204,0.5)) drop-shadow(0 0 18px rgba(16,56,136,0.2))",
    },
  },
  {
    name: "Serevain",
    brightness: 0.8,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #FFE0AA 0%, #FF9933 25%, #EE7711 50%, #CC5500 75%, #993300 100%)",
      glowOuter: "rgba(255,153,51,0.08)",
      glowMid: "rgba(255,153,51,0.14)",
      glowInner: "rgba(255,180,100,0.2)",
      core: "rgba(255,240,200,0.9) 0%, rgba(255,153,51,0.5) 50%, transparent 100%",
      tipGlow: "rgba(255,224,170,0.9) 0%, rgba(255,153,51,0.5) 40%, transparent 100%",
      flareMid: "rgba(255,153,51,0.3)",
      flareEdge: "rgba(153,51,0,0.1)",
      dropShadow: "drop-shadow(0 0 8px rgba(255,153,51,0.5)) drop-shadow(0 0 20px rgba(153,51,0,0.2))",
    },
  },
  {
    name: "Brimara",
    brightness: 1.0,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #FF8844 0%, #CC4422 25%, #992211 50%, #661100 75%, #440808 100%)",
      glowOuter: "rgba(204,68,34,0.08)",
      glowMid: "rgba(204,68,34,0.14)",
      glowInner: "rgba(255,136,68,0.2)",
      core: "rgba(255,200,160,0.9) 0%, rgba(204,68,34,0.5) 50%, transparent 100%",
      tipGlow: "rgba(255,180,140,0.9) 0%, rgba(204,68,34,0.5) 40%, transparent 100%",
      flareMid: "rgba(204,68,34,0.3)",
      flareEdge: "rgba(68,8,8,0.12)",
      dropShadow: "drop-shadow(0 0 8px rgba(204,68,34,0.5)) drop-shadow(0 0 20px rgba(68,8,8,0.25))",
    },
  },
  {
    name: "Hiemsyl",
    brightness: 1.1,
    colors: {
      bodyGrad: "radial-gradient(circle at 45% 45%, #FFFFFF 0%, #E0EEF8 25%, #B0D4EE 50%, #80BBDD 75%, #55A0CC 100%)",
      glowOuter: "rgba(176,212,238,0.08)",
      glowMid: "rgba(176,212,238,0.14)",
      glowInner: "rgba(224,238,248,0.22)",
      core: "rgba(255,255,255,0.95) 0%, rgba(176,212,238,0.5) 50%, transparent 100%",
      tipGlow: "rgba(255,255,255,0.95) 0%, rgba(176,212,238,0.5) 40%, transparent 100%",
      flareMid: "rgba(176,212,238,0.35)",
      flareEdge: "rgba(85,160,204,0.12)",
      dropShadow: "drop-shadow(0 0 8px rgba(176,212,238,0.5)) drop-shadow(0 0 20px rgba(85,160,204,0.25))",
    },
  },
];

function CalendarStar({ star, size, animId }: { star: MonthStar; size: number; animId: string }) {
  const { colors, brightness } = star;
  const starClip = "polygon(50% 0%, 62% 35%, 100% 50%, 62% 65%, 50% 100%, 38% 65%, 0% 50%, 38% 35%)";
  const tipOff = size / 2 - 3;
  const flareLen = size * 2.2 * brightness;
  const beamThick = Math.max(2, 1.5 + brightness * 0.5);
  const diagThick = Math.max(1.5, 1 + brightness * 0.4);
  const tips = [
    { top: -4, left: tipOff, label: "top" },
    { top: tipOff, left: size - 2, label: "right" },
    { top: size - 2, left: tipOff, label: "bottom" },
    { top: tipOff, left: -4, label: "left" },
  ];

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: flareLen * 2.2, height: flareLen * 2.2, borderRadius: "50%", background: `radial-gradient(circle, ${colors.glowOuter} 0%, transparent 65%)`, opacity: Math.min(brightness, 1) }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: flareLen * 1.2, height: flareLen * 1.2, borderRadius: "50%", background: `radial-gradient(circle, ${colors.glowMid} 0%, transparent 75%)`, opacity: Math.min(brightness, 1) }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: flareLen * 0.6, height: flareLen * 0.6, borderRadius: "50%", background: `radial-gradient(circle, ${colors.glowInner} 0%, transparent 80%)`, opacity: Math.min(brightness, 1) }} />
      <div style={{ position: "relative", width: size, height: size, clipPath: starClip, background: colors.bodyGrad, filter: colors.dropShadow, animation: `${animId}Pulse 3s ease-in-out infinite` }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: size * 0.3, height: size * 0.3, borderRadius: "50%", background: `radial-gradient(circle, ${colors.core})` }} />
        {tips.map((tip) => (
          <div key={tip.label} style={{ position: "absolute", top: tip.top, left: tip.left, width: 6, height: 6, borderRadius: "50%", background: `radial-gradient(circle, ${colors.tipGlow})`, animation: `${animId}TipGlow 2.5s ease-in-out ${tip.label === "right" ? "0.6s" : tip.label === "bottom" ? "1.2s" : tip.label === "left" ? "1.8s" : "0s"} infinite` }} />
        ))}
      </div>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: flareLen, height: beamThick, background: `linear-gradient(90deg, transparent 0%, ${colors.flareEdge} 20%, ${colors.flareMid} 50%, ${colors.flareEdge} 80%, transparent 100%)`, animation: `${animId}Pulse 3s ease-in-out infinite` }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: beamThick, height: flareLen, background: `linear-gradient(180deg, transparent 0%, ${colors.flareEdge} 20%, ${colors.flareMid} 50%, ${colors.flareEdge} 80%, transparent 100%)`, animation: `${animId}Pulse 3s ease-in-out infinite` }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(45deg)", width: flareLen * 0.55, height: diagThick, background: `linear-gradient(90deg, transparent 0%, ${colors.flareEdge} 25%, ${colors.flareMid} 50%, ${colors.flareEdge} 75%, transparent 100%)`, animation: `${animId}Pulse 3s ease-in-out infinite` }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(-45deg)", width: flareLen * 0.55, height: diagThick, background: `linear-gradient(90deg, transparent 0%, ${colors.flareEdge} 25%, ${colors.flareMid} 50%, ${colors.flareEdge} 75%, transparent 100%)`, animation: `${animId}Pulse 3s ease-in-out infinite` }} />
      <style>{`
        @keyframes ${animId}Pulse { 0%, 100% { opacity: 1; } 50% { opacity: ${0.7 + brightness * 0.15}; } }
        @keyframes ${animId}TipGlow { 0%, 100% { opacity: 0.7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.3); } }
      `}</style>
    </div>
  );
}

/* Total segments: 13 months + 1 Starfall sliver = uses full 360 degrees */
const MONTH_ARC = 26.5; /* degrees per month (13 * 26.5 = 344.5) */
const STARFALL_ARC = 15.5; /* degrees for starfall sliver (344.5 + 15.5 = 360) */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const WEATHER_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  "Drizzle": CloudDrizzle, "Light Rain": CloudDrizzle, "Rain": CloudRain,
  "Heavy Rain": CloudRain, "Thunderstorm": CloudLightning, "Overcast": Cloud,
  "Dense Fog": CloudFog, "Mist": CloudFog, "Sleet": Snowflake,
  "Cold Rain": CloudRain, "Haze": Wind, "Freezing Drizzle": Snowflake,
  "Gray Skies": Cloud, "Torrential Downpour": CloudRain,
};

interface DayForecast {
  condition: string;
  temp: string;
}

<<<<<<< HEAD
interface CalendarWeatherState {
  calendarDate?: CalendarDate;
  calendar?: CalendarDate;
  monthFlavorTexts?: Record<string, string>;
  dailyForecast?: Record<string, DayForecast>;
}

const DEFAULT_CALENDAR_DATE: CalendarDate = { month: 1, day: 1, year: 1, isStarfall: false };

const loadLegacyCalendarDate = (): CalendarDate => {
  try {
    const raw = safeGetItem("inet-dm-calendar");
    return raw ? JSON.parse(raw) : DEFAULT_CALENDAR_DATE;
  } catch {
    return DEFAULT_CALENDAR_DATE;
  }
};

const loadLegacyFlavorTexts = (): Record<string, string> => {
  try {
    const raw = safeGetItem("inet-dm-month-flavors");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const loadLegacyForecast = (): Record<string, DayForecast> => {
  try {
    const raw = safeGetItem("inet-dm-forecast");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

=======
>>>>>>> d3f4b511234b6ce0be81d8d8b597af0266983bd9
const getSegmentMidAngle = (segIdx: number) => {
  if (segIdx === 14) {
    return 13 * MONTH_ARC + STARFALL_ARC / 2;
  }
  return (segIdx - 1) * MONTH_ARC + MONTH_ARC / 2;
};

export function CalendarPage() {
  const navigate = useNavigate();
  const theme = getPlayerTheme();

<<<<<<< HEAD
  const [currentDate, setCurrentDate] = useState<CalendarDate>(loadLegacyCalendarDate);
  const [flavorTexts, setFlavorTexts] = useState<Record<string, string>>(loadLegacyFlavorTexts);
  const [selectedMonth, setSelectedMonth] = useState(currentDate.isStarfall ? 14 : currentDate.month);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [wheelRotation, setWheelRotation] = useState(() => -getSegmentMidAngle(currentDate.isStarfall ? 14 : currentDate.month));
  const [forecast, setForecast] = useState<Record<string, DayForecast>>(loadLegacyForecast);

  useEffect(() => {
    let cancelled = false;

    const hydrateCalendar = async () => {
      const legacyCalendar = loadLegacyCalendarDate();
      const legacyFlavorTexts = loadLegacyFlavorTexts();
      const legacyForecast = loadLegacyForecast();

      try {
        const state = await appStore.loadCalendarWeatherState<CalendarWeatherState>({
          calendarDate: legacyCalendar,
          calendar: legacyCalendar,
          monthFlavorTexts: legacyFlavorTexts,
          dailyForecast: legacyForecast,
        });
        if (cancelled) return;
        const nextDate = state.calendarDate || state.calendar || legacyCalendar;
        setCurrentDate(nextDate);
        setSelectedMonth(nextDate.isStarfall ? 14 : nextDate.month);
        setFlavorTexts(state.monthFlavorTexts || legacyFlavorTexts);
        setForecast(state.dailyForecast || legacyForecast);
      } catch {
        if (cancelled) return;
        const nextDate = loadLegacyCalendarDate();
        setCurrentDate(nextDate);
        setSelectedMonth(nextDate.isStarfall ? 14 : nextDate.month);
        setFlavorTexts(loadLegacyFlavorTexts());
        setForecast(loadLegacyForecast());
      }
    };

    void hydrateCalendar();
    const onFocus = () => {
      void hydrateCalendar();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
=======

  const loadCal = (): CalendarDate => {
    try {
      const raw = safeGetItem("inet-dm-calendar");
      return raw ? JSON.parse(raw) : { month: 1, day: 1, year: 1, isStarfall: false };
    } catch { return { month: 1, day: 1, year: 1, isStarfall: false }; }
  };

  const loadFlavorTexts = (): Record<string, string> => {
    try {
      const raw = safeGetItem("inet-dm-month-flavors");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const [currentDate, setCurrentDate] = useState<CalendarDate>(loadCal);
  const [flavorTexts, setFlavorTexts] = useState<Record<string, string>>(loadFlavorTexts);
  const [selectedMonth, setSelectedMonth] = useState(currentDate.isStarfall ? 14 : currentDate.month);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [wheelRotation, setWheelRotation] = useState(() => -getSegmentMidAngle(currentDate.isStarfall ? 14 : currentDate.month));
  const [forecast, setForecast] = useState<Record<string, DayForecast>>(() => {
    try {
      const raw = safeGetItem("inet-dm-forecast");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    const onFocus = () => {
      setCurrentDate(loadCal());
      setFlavorTexts(loadFlavorTexts());
      try {
        const raw = safeGetItem("inet-dm-forecast");
        setForecast(raw ? JSON.parse(raw) : {});
      } catch { /* ignore */ }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
>>>>>>> d3f4b511234b6ce0be81d8d8b597af0266983bd9
  }, []);

  useEffect(() => {
    setSelectedDay(null);
    setWheelRotation(prev => {
      const target = -getSegmentMidAngle(selectedMonth);
      const prevNorm = ((prev % 360) + 360) % 360;
      const targetNorm = ((target % 360) + 360) % 360;
      let diff = targetNorm - prevNorm;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      if (Math.abs(diff) < 0.01) return prev;
      return prev + diff;
    });
  }, [selectedMonth]);

  const handleDayClick = (dayNum: number) => {
    if (isStarfallSelected) return;
    setSelectedDay(dayNum);
    const dayAngle = (selectedMonth - 1) * MONTH_ARC + (MONTH_ARC / (DAYS_PER_MONTH + 1)) * dayNum;
    setWheelRotation(prev => {
      const target = -dayAngle;
      const prevNorm = ((prev % 360) + 360) % 360;
      const targetNorm = ((target % 360) + 360) % 360;
      let diff = targetNorm - prevNorm;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      if (Math.abs(diff) < 0.01) return prev;
      return prev + diff;
    });
  };

  const navigateMonth = (dir: number) => {
    setSelectedMonth(prev => {
      let next = prev + dir;
      if (next < 1) next = 14;
      if (next > 14) next = 1;
      return next;
    });
  };

  const isStarfallSelected = selectedMonth === 14;
  const isCurrentMonth = !currentDate.isStarfall && currentDate.month === selectedMonth;
  const currentMonthStar = isStarfallSelected
    ? MONTH_STARS[12]
    : MONTH_STARS[Math.min(selectedMonth - 1, 12)];

  const bgStars = useMemo(() => {
    const rand = (seed: number) => {
      let s = seed;
      return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
    };
    const r = rand(42);
    const stars: { x: number; y: number; size: number; opacity: number; twinkle: number; type: "four" | "dot" | "cross"; rotation: number }[] = [];
    let attempts = 0;
    while (stars.length < 60 && attempts < 400) {
      attempts++;
      const x = r() * 100;
      const y = r() * 100;
      const dx = x - 50;
      const dy = y - 45;
      if (Math.sqrt(dx * dx + dy * dy) < 38) continue;
      const sz = r() * 1 + 0.2;
      const type = r();
      stars.push({
        x, y, size: sz,
        opacity: r() * 0.35 + 0.08,
        twinkle: r() * 5 + 3,
        type: type < 0.4 ? "four" : type < 0.7 ? "dot" : "cross",
        rotation: r() * 360,
      });
    }
    return stars;
  }, []);

  const selectedFlavorText = isStarfallSelected
    ? flavorTexts["Starfall"] || ""
    : flavorTexts[CALENDAR_MONTHS[selectedMonth - 1]] || "";

  const WHEEL_SIZE = 780;
  const VIEW_R = WHEEL_SIZE / 2;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "#040418",
        fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
      }}
    >
      <div className={`${retro.toolbar} flex items-center justify-between`} style={{ background: theme.toolbarBg }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/interface")} className="flex items-center gap-1 hover:opacity-80" style={{ color: firstColor(theme.accentColor) }}>
            <ArrowLeft size={14} />
            <span className="text-[11px]">Back</span>
          </button>
          <span className="text-[11px]" style={{ color: theme.labelColor }}>|</span>
          <span className="text-[11px]" style={ts(theme.accentColor)}>Celestial Calendar</span>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect width="100" height="100" fill="transparent" />
          {bgStars.map((st, i) => {
            const s = st.size;
            const cx = st.x + s / 2;
            const cy = st.y + s / 2;
            const r = s / 2;
            let d: string;
            if (st.type === "four") {
              d = `M${cx},${cy - r} L${cx + r * 0.3},${cy - r * 0.3} L${cx + r},${cy} L${cx + r * 0.3},${cy + r * 0.3} L${cx},${cy + r} L${cx - r * 0.3},${cy + r * 0.3} L${cx - r},${cy} L${cx - r * 0.3},${cy - r * 0.3}Z`;
            } else if (st.type === "cross") {
              const t = r * 0.15;
              d = `M${cx - t},${cy - r} L${cx + t},${cy - r} L${cx + t},${cy - t} L${cx + r},${cy - t} L${cx + r},${cy + t} L${cx + t},${cy + t} L${cx + t},${cy + r} L${cx - t},${cy + r} L${cx - t},${cy + t} L${cx - r},${cy + t} L${cx - r},${cy - t} L${cx - t},${cy - t}Z`;
            } else {
              d = `M${cx},${cy} m${-r},0 a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0`;
            }
            return (
              <path key={i} d={d} fill="#FFFFFF" opacity={st.opacity} transform={`rotate(${st.rotation}, ${cx}, ${cy})`}>
                <animate attributeName="opacity" values={`${st.opacity};${st.opacity * 0.3};${st.opacity}`} dur={`${st.twinkle}s`} repeatCount="indefinite" />
              </path>
            );
          })}
        </svg>

        <div className="relative z-10 flex flex-col items-center py-6 px-4">
          <h1
            className="text-[28px] tracking-tight mb-1"
            style={{
              color: "#7AB0FF",
              fontWeight: 700,
              fontFamily: "'Trebuchet MS', 'Tahoma', 'Verdana', sans-serif",
              textShadow: "0 0 20px rgba(122,176,255,0.3), 2px 2px 0px #0A0A3B",
            }}
          >
            CELESTIAL CALENDAR
          </h1>
          <div className="text-[10px] mb-4" style={{ color: "#5A6A8A" }}>
            {currentDate.isStarfall
              ? `Year ${currentDate.year} · Starfall Day`
              : `Year ${currentDate.year} · ${CALENDAR_MONTHS[currentDate.month - 1]} · Day ${currentDate.day}`}
          </div>

          <div className="flex items-center gap-4 mb-4" style={{ position: "relative", zIndex: 30 }}>
            <button onClick={() => navigateMonth(-1)} className={`${retro.button} p-2`} style={{ color: "#7AB0FF" }}>
              <ChevronLeft size={18} />
            </button>
            <div className="text-center min-w-[220px]">
              <div className="text-[20px]" style={{
                color: isStarfallSelected ? "#C0D0F0" : "#C0D0F0",
                fontWeight: 700,
                textShadow: `0 0 15px rgba(192,208,240,0.2)`,
              }}>
                {isStarfallSelected ? (<div style={DISPLAY_CONTENTS}><span style={{ color: "#000000", textShadow: "0 0 4px rgba(30,30,60,0.8)" }}>★</span> Starfall Days</div>) : CALENDAR_MONTHS[selectedMonth - 1]}
              </div>
              <div className="text-[10px] mt-1" style={{ color: "#5A6A8A" }}>
                {isStarfallSelected ? "Days outside the regular months" : `Month ${selectedMonth} of 13`}
              </div>
              {selectedFlavorText && (
                <div className="text-[10px] mt-1 italic" style={{ color: "#6A7A9A" }}>
                  "{selectedFlavorText}"
                </div>
              )}
            </div>
            <button onClick={() => navigateMonth(1)} className={`${retro.button} p-2`} style={{ color: "#7AB0FF" }}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="relative" style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}>
            {/* Central star display */}
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 20,
              pointerEvents: "none",
            }}>
              <CalendarStar
                star={currentMonthStar}
                size={isStarfallSelected ? 200 : Math.round(140 * currentMonthStar.brightness)}
                animId={`centerStar${selectedMonth}`}
              />
            </div>

            {/* Wheel SVG - overflow hidden to prevent rotated segments from overlapping navigation */}
            <div style={{ width: WHEEL_SIZE, height: WHEEL_SIZE, overflow: "hidden", borderRadius: "50%" }}>
            <svg
              viewBox={`${-VIEW_R} ${-VIEW_R} ${WHEEL_SIZE} ${WHEEL_SIZE}`}
              width={WHEEL_SIZE}
              height={WHEEL_SIZE}
              style={{
                transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                transform: `rotate(${wheelRotation}deg)`,
              }}
            >
              <defs>
                <radialGradient id="wheelCenterGlow">
                  <stop offset="0%" stopColor="#1A1A5B" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>
              </defs>

              <circle cx={0} cy={0} r={90} fill="url(#wheelCenterGlow)" />

              {/* 13 month segments */}
              {CALENDAR_MONTHS.map((month, mIdx) => {
                const startAngle = mIdx * MONTH_ARC - 90;
                const isActive = selectedMonth === mIdx + 1;
                const isCurrent = !currentDate.isStarfall && currentDate.month === mIdx + 1;
                const star = MONTH_STARS[mIdx];

                return (
                  <g key={month} style={{ cursor: "pointer" }} onClick={() => setSelectedMonth(mIdx + 1)}>
                    {/* Month arc segment - thin band */}
                    {(() => {
                      const innerR = 310;
                      const outerR = 370;
                      const startRad = (startAngle * Math.PI) / 180;
                      const endRad = ((startAngle + MONTH_ARC) * Math.PI) / 180;
                      const x1o = Math.cos(startRad) * outerR;
                      const y1o = Math.sin(startRad) * outerR;
                      const x2o = Math.cos(endRad) * outerR;
                      const y2o = Math.sin(endRad) * outerR;
                      const x1i = Math.cos(endRad) * innerR;
                      const y1i = Math.sin(endRad) * innerR;
                      const x2i = Math.cos(startRad) * innerR;
                      const y2i = Math.sin(startRad) * innerR;
                      const path = `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 0 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 0 0 ${x2i} ${y2i} Z`;

                      return (
                        <path
                          d={path}
                          fill={isActive ? "#0E0E3A" : "#080825"}
                          stroke={isActive ? "#3A3A8B" : isCurrent ? "#2A3A6B" : "#15153B"}
                          strokeWidth={isActive ? 2 : 1}
                          opacity={isActive ? 1 : 0.7}
                        />
                      );
                    })()}

                    {/* Month label */}
                    {(() => {
                      const midAngle = startAngle + MONTH_ARC / 2;
                      const labelR = 385;
                      const rad = (midAngle * Math.PI) / 180;
                      const lx = Math.cos(rad) * labelR;
                      const ly = Math.sin(rad) * labelR;
                      const rotation = midAngle + 90;
                      return (
                        <text
                          x={lx} y={ly}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          transform={`rotate(${rotation}, ${lx}, ${ly})`}
                          fill={isActive ? "#C0D0F0" : isCurrent ? "#7AB0FF" : "#4A5A7A"}
                          fontSize={isActive ? 10 : 8}
                          fontWeight={isActive ? 700 : 400}
                          fontFamily="'Tahoma', 'Verdana', sans-serif"
                          style={{ pointerEvents: "none" }}
                        >
                          {month}
                        </text>
                      );
                    })()}

                    {/* Star for each month - large, in center area */}
                    {(() => {
                      const midAngle = startAngle + MONTH_ARC / 2;
                      const starR = 200;
                      const rad = (midAngle * Math.PI) / 180;
                      const sx = Math.cos(rad) * starR;
                      const sy = Math.sin(rad) * starR;
                      const baseStarSize = 18 + star.brightness * 16;
                      const starClip = "polygon(50% 0%, 62% 35%, 100% 50%, 62% 65%, 50% 100%, 38% 65%, 0% 50%, 38% 35%)";
                      const glowR = baseStarSize * star.brightness * 1.8;

                      return (
                        <g>
                          <foreignObject
                            x={sx - glowR * 2}
                            y={sy - glowR * 2}
                            width={glowR * 4}
                            height={glowR * 4}
                            style={{ overflow: "visible", pointerEvents: "none" }}
                          >
                            <div style={{
                              width: glowR * 4,
                              height: glowR * 4,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              transform: `rotate(${-(wheelRotation + (mIdx * MONTH_ARC))}deg)`,
                              transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                            }}>
                              <div style={{ position: "relative", width: baseStarSize, height: baseStarSize }}>
                                {/* Outer glow */}
                                <div style={{
                                  position: "absolute", top: "50%", left: "50%",
                                  transform: "translate(-50%, -50%)",
                                  width: glowR * 3, height: glowR * 3,
                                  borderRadius: "50%",
                                  background: `radial-gradient(circle, ${star.colors.glowOuter} 0%, transparent 65%)`,
                                  opacity: star.brightness,
                                }} />
                                {/* Mid glow */}
                                <div style={{
                                  position: "absolute", top: "50%", left: "50%",
                                  transform: "translate(-50%, -50%)",
                                  width: glowR * 1.8, height: glowR * 1.8,
                                  borderRadius: "50%",
                                  background: `radial-gradient(circle, ${star.colors.glowMid} 0%, transparent 75%)`,
                                  opacity: star.brightness,
                                }} />
                                {/* Inner glow */}
                                <div style={{
                                  position: "absolute", top: "50%", left: "50%",
                                  transform: "translate(-50%, -50%)",
                                  width: glowR * 0.9, height: glowR * 0.9,
                                  borderRadius: "50%",
                                  background: `radial-gradient(circle, ${star.colors.glowInner} 0%, transparent 80%)`,
                                  opacity: star.brightness,
                                }} />
                                {/* Star body */}
                                <div style={{
                                  position: "relative",
                                  width: baseStarSize,
                                  height: baseStarSize,
                                  clipPath: starClip,
                                  background: star.colors.bodyGrad,
                                  filter: star.colors.dropShadow,
                                  animation: `starPulse${mIdx} ${3 + mIdx * 0.2}s ease-in-out infinite`,
                                }}>
                                  <div style={{
                                    position: "absolute", top: "50%", left: "50%",
                                    transform: "translate(-50%, -50%)",
                                    width: baseStarSize * 0.3, height: baseStarSize * 0.3,
                                    borderRadius: "50%",
                                    background: `radial-gradient(circle, ${star.colors.core})`,
                                  }} />
                                </div>
                                {/* Flares */}
                                <div style={{
                                  position: "absolute", top: "50%", left: "50%",
                                  transform: "translate(-50%, -50%)",
                                  width: baseStarSize * 2.2 * star.brightness, height: Math.max(2, 1.5 + star.brightness * 0.5),
                                  background: `linear-gradient(90deg, transparent 0%, ${star.colors.flareEdge} 20%, ${star.colors.flareMid} 50%, ${star.colors.flareEdge} 80%, transparent 100%)`,
                                  animation: `starFlare${mIdx} ${3 + mIdx * 0.2}s ease-in-out infinite`,
                                }} />
                                <div style={{
                                  position: "absolute", top: "50%", left: "50%",
                                  transform: "translate(-50%, -50%)",
                                  width: Math.max(2, 1.5 + star.brightness * 0.5), height: baseStarSize * 2.2 * star.brightness,
                                  background: `linear-gradient(180deg, transparent 0%, ${star.colors.flareEdge} 20%, ${star.colors.flareMid} 50%, ${star.colors.flareEdge} 80%, transparent 100%)`,
                                  animation: `starFlare${mIdx} ${3 + mIdx * 0.2}s ease-in-out infinite`,
                                }} />
                                <div style={{
                                  position: "absolute", top: "50%", left: "50%",
                                  transform: "translate(-50%, -50%) rotate(45deg)",
                                  width: baseStarSize * 2.2 * star.brightness * 0.55, height: Math.max(1.5, 1 + star.brightness * 0.4),
                                  background: `linear-gradient(90deg, transparent 0%, ${star.colors.flareEdge} 25%, ${star.colors.flareMid} 50%, ${star.colors.flareEdge} 75%, transparent 100%)`,
                                  animation: `starFlare${mIdx} ${3 + mIdx * 0.2}s ease-in-out infinite`,
                                }} />
                                <div style={{
                                  position: "absolute", top: "50%", left: "50%",
                                  transform: "translate(-50%, -50%) rotate(-45deg)",
                                  width: baseStarSize * 2.2 * star.brightness * 0.55, height: Math.max(1.5, 1 + star.brightness * 0.4),
                                  background: `linear-gradient(90deg, transparent 0%, ${star.colors.flareEdge} 25%, ${star.colors.flareMid} 50%, ${star.colors.flareEdge} 75%, transparent 100%)`,
                                  animation: `starFlare${mIdx} ${3 + mIdx * 0.2}s ease-in-out infinite`,
                                }} />
                              </div>
                            </div>
                          </foreignObject>
                        </g>
                      );
                    })()}

                    {/* Day slots - small squares along inner ring */}
                    {Array.from({ length: DAYS_PER_MONTH }, (_, dIdx) => {
                      const dayNum = dIdx + 1;
                      const dayAngle = startAngle + (MONTH_ARC / (DAYS_PER_MONTH + 1)) * (dIdx + 1);
                      const isToday = isCurrent && currentDate.day === dayNum;
                      const isDaySelected = isActive && selectedDay === dayNum;
                      const midDayR = 325;
                      const rad = (dayAngle * Math.PI) / 180;
                      const dx = Math.cos(rad) * midDayR;
                      const dy = Math.sin(rad) * midDayR;
                      const slotSize = 8;

                      return (
                        <g key={dayNum}>
                          <rect
                            x={dx - slotSize / 2}
                            y={dy - slotSize / 2}
                            width={slotSize}
                            height={slotSize}
                            rx={1}
                            fill={isDaySelected ? "#2A40AA" : isToday ? "#3A5AFF" : "#0A0A28"}
                            stroke={isDaySelected ? "#AACCFF" : isToday ? "#7AB0FF" : "#1A1A4B"}
                            strokeWidth={isDaySelected ? 1.5 : isToday ? 1 : 0.3}
                            opacity={isActive ? 1 : 0.4}
                            transform={`rotate(${dayAngle + 90}, ${dx}, ${dy})`}
                          />
                          {isToday && (
                            <rect
                              x={dx - slotSize / 2 - 1.5}
                              y={dy - slotSize / 2 - 1.5}
                              width={slotSize + 3}
                              height={slotSize + 3}
                              rx={2}
                              fill="none"
                              stroke="#7AB0FF"
                              strokeWidth={0.8}
                              opacity={isActive ? 0.9 : 0.4}
                              transform={`rotate(${dayAngle + 90}, ${dx}, ${dy})`}
                            />
                          )}
                          <text
                            x={dx} y={dy + 0.3}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={isDaySelected ? "#FFFFFF" : isToday ? "#FFFFFF" : isActive ? "#5A6A8A" : "#2A3A4A"}
                            fontSize={3}
                            fontWeight={isDaySelected || isToday ? 700 : 400}
                            fontFamily="'Tahoma', sans-serif"
                            transform={`rotate(${dayAngle + 90}, ${dx}, ${dy})`}
                            style={{ pointerEvents: "none" }}
                          >
                            {dayNum}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Starfall sliver after month 13 */}
              {(() => {
                const startAngle = 13 * MONTH_ARC - 90;
                const isActive = selectedMonth === 14;
                const isCurrent = !!currentDate.isStarfall;

                const innerR = 310;
                const outerR = 370;
                const startRad = (startAngle * Math.PI) / 180;
                const endRad = ((startAngle + STARFALL_ARC) * Math.PI) / 180;
                const x1o = Math.cos(startRad) * outerR;
                const y1o = Math.sin(startRad) * outerR;
                const x2o = Math.cos(endRad) * outerR;
                const y2o = Math.sin(endRad) * outerR;
                const x1i = Math.cos(endRad) * innerR;
                const y1i = Math.sin(endRad) * innerR;
                const x2i = Math.cos(startRad) * innerR;
                const y2i = Math.sin(startRad) * innerR;
                const path = `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 0 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 0 0 ${x2i} ${y2i} Z`;

                const midAngle = startAngle + STARFALL_ARC / 2;
                const labelR = 385;
                const lrad = (midAngle * Math.PI) / 180;
                const lx = Math.cos(lrad) * labelR;
                const ly = Math.sin(lrad) * labelR;
                const rotation = midAngle + 90;

                return (
                  <g style={{ cursor: "pointer" }} onClick={() => setSelectedMonth(14)}>
                    <path
                      d={path}
                      fill={isActive ? "#1A1A3B" : "#0A0A20"}
                      stroke={isActive ? "#FFD70066" : isCurrent ? "#FFD70033" : "#15153B"}
                      strokeWidth={isActive ? 2 : 1}
                      opacity={isActive ? 1 : 0.7}
                    />
                    <text
                      x={lx} y={ly}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${rotation}, ${lx}, ${ly})`}
                      fill={isActive ? "#000000" : isCurrent ? "#00000088" : "#1A1A2A"}
                      fontSize={7}
                      fontWeight={isActive ? 700 : 400}
                      fontFamily="'Tahoma', 'Verdana', sans-serif"
                      style={{ pointerEvents: "none" }}
                    >
                      ★
                    </text>
                    {/* Small star icon in the starfall zone */}
                    {(() => {
                      const starR = 200;
                      const srad = (midAngle * Math.PI) / 180;
                      const sx = Math.cos(srad) * starR;
                      const sy = Math.sin(srad) * starR;
                      return (
                        <foreignObject
                          x={sx - 20} y={sy - 20}
                          width={40} height={40}
                          style={{ overflow: "visible", pointerEvents: "none" }}
                        >
                          <div style={{
                            width: 40, height: 40,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transform: `rotate(${-wheelRotation}deg)`,
                            transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                          }}>
                            <div style={{
                              fontSize: 16,
                              color: isActive ? "#000000" : "#00000044",
                              textShadow: "none",
                              animation: "starfallPulse 2s ease-in-out infinite",
                            }}>
                              ★
                            </div>
                          </div>
                        </foreignObject>
                      );
                    })()}
                  </g>
                );
              })()}
            </svg>
            </div>

            {/* Static pointer at the right (90 degrees, since we center to 90) */}
            <div style={{
              position: "absolute",
              top: -4,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 30,
            }}>
              <div style={{
                width: 0, height: 0,
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderTop: "14px solid #7AB0FF",
                filter: "drop-shadow(0 0 4px rgba(122,176,255,0.5))",
              }} />
            </div>
          </div>

          {/* Selected month details panel */}
          <div className={`${retro.raised} bg-[#0A0A30] p-5 mt-4 w-full max-w-[640px]`}>
            {isStarfallSelected ? (
              <div className="text-center">
                <div className="text-[18px] mb-2" style={{ fontWeight: 700 }}>
                  <span style={{ color: "#000000", textShadow: "0 0 4px rgba(30,30,60,0.8)" }}>★</span>
                  <span style={{ color: "#C0D0F0" }}> Starfall Days</span>
                </div>
                <div className="text-[12px] mb-3" style={{ color: "#5A6A8A" }}>
                  Days that fall outside the 13 regular months — after the 28th of Hiemsyl.
                </div>
                {selectedFlavorText && (
                  <div className="text-[11px] mb-3 italic" style={{ color: "#6A7A9A" }}>
                    "{selectedFlavorText}"
                  </div>
                )}
                <div className="text-[11px]" style={{ color: "#6A7A9A" }}>
                  A normal year has 1 Starfall Day. A leap year has 2 Starfall Days.
                  These are days of celebration, reflection, and cosmic significance.
                </div>
                {currentDate.isStarfall && (
                  <div className="mt-3 text-[12px]" style={{ color: "#FFD700", fontWeight: 600 }}>
                    It is currently a Starfall Day.
                  </div>
                )}
              </div>
            ) : (
              <div style={DISPLAY_CONTENTS}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-[18px]" style={{ color: "#C0D0F0", fontWeight: 700 }}>
                      {CALENDAR_MONTHS[selectedMonth - 1]}
                    </div>
                    <div className="text-[11px]" style={{ color: "#5A6A8A" }}>
                      Month {selectedMonth} of 13 · {DAYS_PER_MONTH} days
                      {isCurrentMonth && " · Current Month"}
                    </div>
                    {selectedFlavorText && (
                      <div className="text-[10px] mt-1 italic" style={{ color: "#6A7A9A" }}>
                        "{selectedFlavorText}"
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-[10px] text-right" style={{ color: "#4A5A7A" }}>
                      Guiding Star
                    </div>
                    <div style={{ width: 36, height: 36 }}>
                      <CalendarStar
                        star={currentMonthStar}
                        size={Math.round(16 * currentMonthStar.brightness)}
                        animId={`detailStar${selectedMonth}`}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {DAY_NAMES.map(d => (
                    <div key={d} className="text-center text-[9px] py-1" style={{ color: "#3A4A6A", fontWeight: 600 }}>
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: DAYS_PER_MONTH }, (_, i) => {
                    const dayNum = i + 1;
                    const isToday = isCurrentMonth && currentDate.day === dayNum;
                    const isDayPicked = selectedDay === dayNum;
                    return (
                      <button
                        key={dayNum}
                        onClick={() => handleDayClick(dayNum)}
                        className={`${isToday ? retro.sunken : retro.raised} text-center py-1.5 text-[11px] transition-colors cursor-pointer`}
                        style={{
                          background: isDayPicked ? "#1E2E7A" : isToday ? "#1A2A6B" : "#0A0A28",
                          color: isDayPicked ? "#AACCFF" : isToday ? "#FFFFFF" : "#5A6A8A",
                          fontWeight: isDayPicked || isToday ? 700 : 400,
                          boxShadow: isDayPicked ? "0 0 10px rgba(122,176,255,0.4), inset 0 0 4px rgba(122,176,255,0.15)" : isToday ? "0 0 8px rgba(122,176,255,0.3)" : "none",
                          outline: isToday ? "1.5px solid #7AB0FF" : "none",
                          outlineOffset: "1px",
                        }}
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>

                {/* Weekly Weather Forecast */}
                {(() => {
                  const currentWeekStart = isCurrentMonth
                    ? Math.floor((currentDate.day - 1) / 7) * 7 + 1
                    : -1;
                  const displayWeekStart = selectedDay
                    ? Math.floor((selectedDay - 1) / 7) * 7 + 1
                    : isCurrentMonth
                    ? currentWeekStart
                    : 1;
                  const weekDays = Array.from({ length: 7 }, (_, i) => displayWeekStart + i);
                  const isCurrentWeek = displayWeekStart === currentWeekStart && isCurrentMonth;
                  const hasAnyForecast = isCurrentWeek && weekDays.some(d => {
                    const key = `${currentDate.year}-${selectedMonth}-${d}`;
                    return !!forecast[key];
                  });

                  return (
                    <div className="mt-4">
                      <div className="text-[10px] mb-2" style={{ color: "#5A6A8A", fontWeight: 600 }}>
                        WEEK {Math.ceil(displayWeekStart / 7)} FORECAST — {CALENDAR_MONTHS[selectedMonth - 1]}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {weekDays.map((d, i) => {
                          const key = `${currentDate.year}-${selectedMonth}-${d}`;
                          const fc = isCurrentWeek ? forecast[key] : null;
                          const isToday = isCurrentMonth && currentDate.day === d;
                          const isDayPicked = selectedDay === d;
                          const isUnknown = !isCurrentWeek;
                          const WIcon = fc ? (WEATHER_ICONS[fc.condition] || Cloud) : null;
                          return (
                            <button
                              key={d}
                              onClick={() => handleDayClick(d)}
                              className={`${retro.sunken} py-2 px-1 text-center transition-colors cursor-pointer`}
                              style={{
                                background: isDayPicked ? "#12124A" : isToday ? "#0E1A4A" : "#080820",
                                outline: isToday ? "1px solid #3A5AFF" : "none",
                              }}
                            >
                              <div className="text-[8px] mb-0.5" style={{ color: "#3A4A6A", fontWeight: 600 }}>
                                {DAY_NAMES[i]}
                              </div>
                              <div className="text-[11px] mb-1" style={{
                                color: isDayPicked ? "#AACCFF" : isToday ? "#FFFFFF" : "#6A7A9A",
                                fontWeight: isToday || isDayPicked ? 700 : 400,
                              }}>
                                {d}
                              </div>
                              {isUnknown ? (
                                <div className="flex flex-col items-center">
                                  <div className="text-[14px] leading-none" style={{ color: "#2A3A5A" }}>?</div>
                                  <div className="text-[7px] mt-0.5" style={{ color: "#2A3A4A" }}>unknown</div>
                                </div>
                              ) : WIcon ? (
                                <div className="flex flex-col items-center">
                                  <WIcon size={14} style={{ color: "#6A8ABB" }} />
                                  <div className="text-[8px] mt-0.5" style={{ color: "#5A6A8A" }}>
                                    {fc!.temp}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[8px]" style={{ color: "#2A3A4A" }}>—</div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {isCurrentWeek && !hasAnyForecast && (
                        <div className="text-[9px] mt-1 text-center italic" style={{ color: "#3A4A5A" }}>
                          No forecast set — the DM has not yet divined the weather.
                        </div>
                      )}
                      {!isCurrentWeek && (
                        <div className="text-[9px] mt-1 text-center italic" style={{ color: "#3A4A5A" }}>
                          The stars have not yet revealed this week's weather.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Month star legend */}
          <div className={`${retro.sunken} bg-[#0A0A28] p-4 mt-4 w-full max-w-[640px]`}>
            <div className="text-[10px] mb-3" style={{ color: "#5A6A8A", fontWeight: 600 }}>GUIDING STARS OF THE MONTHS</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {MONTH_STARS.map((star, i) => (
                <button
                  key={star.name}
                  onClick={() => setSelectedMonth(i + 1)}
                  className={`flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${selectedMonth === i + 1 ? retro.sunken : retro.raised + " hover:bg-[#12123A]"}`}
                  style={{
                    background: selectedMonth === i + 1 ? "#0E0E35" : "#080825",
                  }}
                >
                  <div style={{
                    width: 8 + star.brightness * 4,
                    height: 8 + star.brightness * 4,
                    clipPath: "polygon(50% 0%, 62% 35%, 100% 50%, 62% 65%, 50% 100%, 38% 65%, 0% 50%, 38% 35%)",
                    background: star.colors.bodyGrad,
                    filter: star.colors.dropShadow,
                    flexShrink: 0,
                  }} />
                  <div>
                    <div className="text-[10px]" style={{
                      color: selectedMonth === i + 1 ? "#C0D0F0" : "#5A6A8A",
                      fontWeight: selectedMonth === i + 1 ? 600 : 400,
                    }}>
                      {star.name}
                    </div>
                    <div className="text-[8px]" style={{ color: "#3A4A5A" }}>
                      x{star.brightness.toFixed(1)}
                    </div>
                  </div>
                </button>
              ))}
              <button
                onClick={() => setSelectedMonth(14)}
                className={`flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${selectedMonth === 14 ? retro.sunken : retro.raised + " hover:bg-[#12123A]"}`}
                style={{
                  background: selectedMonth === 14 ? "#0E0E35" : "#080825",
                }}
              >
                <div style={{ fontSize: 14, color: "#000000", flexShrink: 0 }}>★</div>
                <div>
                  <div className="text-[10px]" style={{
                    color: selectedMonth === 14 ? "#C0D0F0" : "#5A6A8A",
                    fontWeight: selectedMonth === 14 ? 600 : 400,
                  }}>
                    Starfall Days
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        ${MONTH_STARS.map((s, i) => `@keyframes starPulse${i} { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: ${0.7 + s.brightness * 0.15}; transform: scale(${1 + s.brightness * 0.08}); } }
@keyframes starFlare${i} { 0%, 100% { opacity: 1; } 50% { opacity: ${0.6 + s.brightness * 0.15}; } }`).join("\n")}
        @keyframes starfallPulse { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } }
      `}</style>
    </div>
  );
<<<<<<< HEAD
}
=======
}
>>>>>>> d3f4b511234b6ce0be81d8d8b597af0266983bd9
