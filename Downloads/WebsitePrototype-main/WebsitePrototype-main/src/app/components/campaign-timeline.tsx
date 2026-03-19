import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { retro } from "./retro-styles";
import { RenderFormattedText } from "./render-text";
import { RichTextEditor } from "./rich-text-editor";
import { useDebouncedJsonStorage } from "./use-debounced-storage";
import { getPlayerTheme, buildPageGradient, firstColor, ts, bc } from "./player-theme";
import {
  ArrowLeft, Plus, Trash2, Save, X, Edit, ChevronDown, ChevronRight,
  Calendar, Clock, MapPin, Sword, Star, Milestone, Flag, Shield,
  Sparkles, BookOpen, Pencil, MoreHorizontal, Layers,
  ZoomIn, ZoomOut, Link2, FileText, Scroll, Eye, GripHorizontal,
  ExternalLink, ArrowRightLeft, Crown, Waypoints, AlertTriangle,
  Palette, RectangleHorizontal, Magnet, GripVertical,
  AlignLeft, AlignCenter, AlignRight, Type, MousePointer2,
} from "lucide-react";
import { safeGetItem, safeSetItem, safeSetJson } from "./safe-storage";
import { DISPLAY_CONTENTS, S_DIM, S_LINK, S_MUTED, S_RED, S_SUBTLE, S_TEXT, S_WARN } from "./shared-styles";

// ════════════════════════════════════════════
// Types
// ══════════════════════���═════════════════════

interface TimelineEvent {
  id: string;
  title: string;
  date: string;
  realDate: string;
  description: string;
  category: "story" | "battle" | "discovery" | "milestone" | "custom";
  location: string;
  importance: "minor" | "normal" | "major" | "legendary";
  tags: string[];
  sessionRef: string;
  sessionId?: string;
  wikiLinks?: { articleId: string; articleTitle: string; displayText: string }[];
  sortIndex: number;
}

type TimelineResolution = "centuries" | "decades" | "years" | "months" | "days";
const RESOLUTION_ORDER: TimelineResolution[] = ["centuries", "decades", "years", "months", "days"];
const RESOLUTION_LABELS: Record<TimelineResolution, string> = {
  centuries: "Centuries", decades: "Decades", years: "Years", months: "Months", days: "Days",
};

interface LaneCalendarConfig {
  yearLabel: string;
  monthNames: string[];
  monthsPerYear: number;
  daysPerMonth: number[];
  startYear: number;
  startMonth: number;
  startDay: number;
  endYear: number;
  endMonth: number;
  endDay: number;
  defaultResolution?: TimelineResolution;
}

type EraNameAlign = "left" | "center" | "right";

const ERA_FONTS = [
  { label: "Default", value: "" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "'Courier New', Courier, monospace" },
  { label: "Cursive", value: "'Segoe Script', 'Brush Script MT', cursive" },
  { label: "Fantasy", value: "'Papyrus', fantasy" },
  { label: "Small Caps", value: "'Copperplate', 'Palatino Linotype', serif" },
  { label: "Gothic", value: "'Century Gothic', 'Apple Gothic', sans-serif" },
  { label: "Garamond", value: "Garamond, 'EB Garamond', serif" },
  { label: "Impact", value: "Impact, 'Arial Black', sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Lucida", value: "'Lucida Console', Monaco, monospace" },
  { label: "Bookman", value: "'Bookman Old Style', 'URW Bookman', serif" },
];

const ERA_FONT_SIZES = [
  { label: "2XS", value: 5 },
  { label: "XS", value: 6 },
  { label: "S", value: 7 },
  { label: "M", value: 8 },
  { label: "L", value: 10 },
  { label: "XL", value: 12 },
  { label: "2XL", value: 14 },
  { label: "3XL", value: 18 },
];

interface TimelineEra {
  id: string;
  name: string;
  color: string;
  startPct: number;
  endPct: number;
  nameAlign?: EraNameAlign;
  nameFont?: string;
  nameFontSize?: number;
  useDateRange?: boolean;
  startYear?: number;
  startMonth?: number;
  startDay?: number;
  endYear?: number;
  endMonth?: number;
  endDay?: number;
}

interface TimelineLane {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  events: TimelineEvent[];
  startLabel?: string;
  endLabel?: string;
  calendar?: LaneCalendarConfig;
  eras?: TimelineEra[];
}

interface TimelineBook {
  id: string;
  name: string;
  order: number;
  lanes: TimelineLane[];
  timespan?: string;
}

interface TimelineData {
  books: TimelineBook[];
  version: 2;
}

interface SessionEntry {
  id: string;
  sessionNumber: number;
  title: string;
  date: string;
  realDate: string;
  summary: string;
  dmNotes: string;
  highlights: string[];
  attendees: string[];
  pinned: boolean;
  tags: string[];
}

interface WikiPage {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
  tags: string[];
}

// ════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════

const STORAGE_KEY = "inet-campaign-timeline-v2";
const OLD_STORAGE_KEY = "inet-campaign-timeline";

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  story:     { label: "Story",     color: "#5B8CFF", icon: <Star size={12} /> },
  battle:    { label: "Battle",    color: "#FF5A5A", icon: <Sword size={12} /> },
  discovery: { label: "Discovery", color: "#5ADA7A", icon: <Sparkles size={12} /> },
  milestone: { label: "Milestone", color: "#FFD740", icon: <Flag size={12} /> },
  custom:    { label: "Custom",    color: "#BB7AFF", icon: <Shield size={12} /> },
};

const IMPORTANCE_CONFIG: Record<string, { label: string; shape: "dot" | "hexagon" | "diamond" | "star"; size: number; color: string }> = {
  minor:     { label: "Minor",     shape: "dot",     size: 8,  color: "#4A5A7A" },
  normal:    { label: "Normal",    shape: "hexagon", size: 13, color: "#6A8ABB" },
  major:     { label: "Major",     shape: "diamond", size: 16, color: "#FFAA4A" },
  legendary: { label: "Legendary", shape: "star",    size: 20, color: "#FFD700" },
};

const LANE_PALETTE = [
  "#5B8CFF", "#FF5A5A", "#5ADA7A", "#FFD740", "#BB7AFF",
  "#FF8A5A", "#5ADADA", "#FF5AAA", "#AADA5A", "#5A5AFF",
];

const ERA_PALETTE = [
  "#5B8CFF", "#FF5A5A", "#5ADA7A", "#FFD740", "#BB7AFF",
  "#FF8A5A", "#5ADADA", "#FF5AAA", "#8A6AFF", "#AADA5A",
  "#FF6A8A", "#4ABABA", "#E06050", "#50C878", "#DA70D6",
  "#87CEEB", "#F0E68C", "#CD853F", "#708090", "#FF4500",
  "#00CED1", "#9ACD32", "#FF69B4", "#1E90FF", "#FFA07A",
  "#8FBC8F", "#D2691E", "#6495ED", "#DC143C", "#20B2AA",
];

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;



// ════════════════════════════════════════════
// Shape SVG renderers (enhanced)
// ════════════════════════════════════════════
function ShapeNode({ shape, size, catColor, isSelected }: { shape: string; size: number; catColor: string; isSelected: boolean }) {
  const fill = isSelected ? catColor : "transparent";
  const stroke = catColor;
  const sw = 2;
  const glow = isSelected
    ? `drop-shadow(0 0 8px ${catColor}AA) drop-shadow(0 0 4px ${catColor}80)`
    : `drop-shadow(0 0 4px ${catColor}40)`;

  const svgSize = size + 6;

  if (shape === "dot") {
    return (
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} style={{ filter: glow }}>
        <circle cx={svgSize / 2} cy={svgSize / 2} r={size / 2 - 1} fill={isSelected ? catColor : catColor + "70"} stroke={stroke} strokeWidth={sw} />
      </svg>
    );
  }
  if (shape === "hexagon") {
    const cx = svgSize / 2;
    const cy = svgSize / 2;
    const r = size / 2;
    const hexPts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 6) + (2 * Math.PI * i / 6);
      hexPts.push(`${cx + r * Math.cos(angle)},${cy - r * Math.sin(angle)}`);
    }
    return (
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} style={{ filter: glow }}>
        <polygon points={hexPts.join(" ")} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      </svg>
    );
  }
  if (shape === "diamond") {
    const cx = svgSize / 2;
    const cy = svgSize / 2;
    const r = size / 2;
    const points = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
    return (
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} style={{ filter: glow }}>
        <polygon points={points} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      </svg>
    );
  }
  if (shape === "star") {
    const cx = svgSize / 2;
    const cy = svgSize / 2;
    const outerR = size / 2;
    const innerR = outerR * 0.42;
    const pts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const outerAngle = (Math.PI / 2) + (2 * Math.PI * i / 5);
      const innerAngle = outerAngle + Math.PI / 5;
      pts.push(`${cx + outerR * Math.cos(-outerAngle)},${cy - outerR * Math.sin(outerAngle)}`);
      pts.push(`${cx + innerR * Math.cos(-innerAngle)},${cy - innerR * Math.sin(innerAngle)}`);
    }
    return (
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} style={{ filter: glow }}>
        <polygon points={pts.join(" ")} fill={isSelected ? "#FFD700" : fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} style={{ filter: glow }}>
      <circle cx={svgSize / 2} cy={svgSize / 2} r={size / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
    </svg>
  );
}

function ShapeLegendIcon({ shape, size, color }: { shape: string; size: number; color: string }) {
  if (shape === "dot") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={color + "70"} stroke={color} strokeWidth={1.5} />
      </svg>
    );
  }
  if (shape === "hexagon") {
    const c = size / 2;
    const r = c - 1;
    const hexPts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 6) + (2 * Math.PI * i / 6);
      hexPts.push(`${c + r * Math.cos(angle)},${c - r * Math.sin(angle)}`);
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <polygon points={hexPts.join(" ")} fill="transparent" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    );
  }
  if (shape === "diamond") {
    const c = size / 2;
    const r = c - 1;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <polygon points={`${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}`} fill="transparent" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    );
  }
  if (shape === "star") {
    const c = size / 2;
    const outerR = c - 1;
    const innerR = outerR * 0.42;
    const pts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const outerAngle = (Math.PI / 2) + (2 * Math.PI * i / 5);
      const innerAngle = outerAngle + Math.PI / 5;
      pts.push(`${c + outerR * Math.cos(-outerAngle)},${c - outerR * Math.sin(outerAngle)}`);
      pts.push(`${c + innerR * Math.cos(-innerAngle)},${c - innerR * Math.sin(innerAngle)}`);
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <polygon points={pts.join(" ")} fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill="transparent" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

// ═══════════════════════════════════════════���
// Helpers
// ════���═══════════���═══════���═══��══════════════��

// ════════════════════════════════════════════
// Calendar Math Helpers
// ════════════════════════════════════════════

function calDaysInYear(cal: LaneCalendarConfig): number {
  return cal.daysPerMonth.slice(0, cal.monthsPerYear).reduce((a, b) => a + b, 0);
}

function calDateToDayNumber(cal: LaneCalendarConfig, year: number, month: number, day: number): number {
  const diy = calDaysInYear(cal);
  let total = (year - 1) * diy;
  for (let m = 0; m < Math.min(month - 1, cal.monthsPerYear); m++) {
    total += cal.daysPerMonth[m] || 0;
  }
  total += day;
  return total;
}

function calTotalDaysInSpan(cal: LaneCalendarConfig): number {
  const startDay = calDateToDayNumber(cal, cal.startYear, cal.startMonth, cal.startDay);
  const endDay = calDateToDayNumber(cal, cal.endYear, cal.endMonth, cal.endDay);
  return Math.max(0, endDay - startDay + 1);
}

function calSpanYears(cal: LaneCalendarConfig): number {
  return Math.abs(cal.endYear - cal.startYear) + 1;
}

function calSpanMonths(cal: LaneCalendarConfig): number {
  return (cal.endYear - cal.startYear) * cal.monthsPerYear + (cal.endMonth - cal.startMonth) + 1;
}

function calValidateDate(cal: LaneCalendarConfig, year: number, month: number, day: number, label: string): string | null {
  if (month < 1 || month > cal.monthsPerYear) {
    return `${label} month (${month}) must be between 1 and ${cal.monthsPerYear}.`;
  }
  const maxDays = cal.daysPerMonth[month - 1] || 0;
  if (day < 1 || day > maxDays) {
    const mName = cal.monthNames[month - 1] || `Month ${month}`;
    return `${label} day (${day}) must be between 1 and ${maxDays} for ${mName}.`;
  }
  return null;
}

function calValidateConfig(cal: LaneCalendarConfig): string[] {
  const errors: string[] = [];
  const startErr = calValidateDate(cal, cal.startYear, cal.startMonth, cal.startDay, "Start");
  if (startErr) errors.push(startErr);
  const endErr = calValidateDate(cal, cal.endYear, cal.endMonth, cal.endDay, "End");
  if (endErr) errors.push(endErr);
  if (errors.length === 0) {
    const startDayNum = calDateToDayNumber(cal, cal.startYear, cal.startMonth, cal.startDay);
    const endDayNum = calDateToDayNumber(cal, cal.endYear, cal.endMonth, cal.endDay);
    if (endDayNum < startDayNum) {
      errors.push("End date must be on or after the start date.");
    }
  }
  if (cal.monthsPerYear < 1) errors.push("Calendar must have at least 1 month.");
  for (let i = 0; i < cal.monthsPerYear; i++) {
    if ((cal.daysPerMonth[i] || 0) < 1) {
      errors.push(`${cal.monthNames[i] || `Month ${i + 1}`} must have at least 1 day.`);
      break;
    }
  }
  return errors;
}

function calDateToPct(cal: LaneCalendarConfig, year: number, month: number, day: number): number {
  const startDayNum = calDateToDayNumber(cal, cal.startYear, cal.startMonth, cal.startDay);
  const endDayNum = calDateToDayNumber(cal, cal.endYear, cal.endMonth, cal.endDay);
  const totalDays = Math.max(1, endDayNum - startDayNum + 1);
  const dayNum = calDateToDayNumber(cal, year, month, day);
  return Math.max(0, Math.min(100, ((dayNum - startDayNum) / totalDays) * 100));
}

function calPctToDate(cal: LaneCalendarConfig, pct: number): { year: number; month: number; day: number } {
  const startDayNum = calDateToDayNumber(cal, cal.startYear, cal.startMonth, cal.startDay);
  const endDayNum = calDateToDayNumber(cal, cal.endYear, cal.endMonth, cal.endDay);
  const totalDays = Math.max(1, endDayNum - startDayNum + 1);
  const dayNum = Math.round(startDayNum + (pct / 100) * totalDays);
  const diy = calDaysInYear(cal);
  const yearNum = Math.max(1, Math.floor((dayNum - 1) / diy) + 1);
  let remaining = dayNum - (yearNum - 1) * diy;
  let monthIdx = 0;
  while (monthIdx < cal.monthsPerYear && remaining > (cal.daysPerMonth[monthIdx] || 0)) {
    remaining -= cal.daysPerMonth[monthIdx] || 0;
    monthIdx++;
  }
  return { year: yearNum, month: monthIdx + 1, day: Math.max(1, remaining) };
}

function calAutoResolution(cal: LaneCalendarConfig): TimelineResolution {
  const years = calSpanYears(cal);
  if (years > 200) return "centuries";
  if (years > 20) return "decades";
  if (years > 2) return "years";
  const months = calSpanMonths(cal);
  if (months > 3) return "months";
  return "days";
}

interface RulerMark {
  position: number;
  label: string;
  major: boolean;
}

function calBuildRuler(cal: LaneCalendarConfig, resolution: TimelineResolution): { marks: RulerMark[]; trackWidth: number } {
  const marks: RulerMark[] = [];
  const PX_CENTURY = 120;
  const PX_DECADE = 100;
  const PX_YEAR = 90;
  const PX_MONTH = 80;
  const PX_DAY = 36;

  const startDayNum = calDateToDayNumber(cal, cal.startYear, cal.startMonth, cal.startDay);
  const endDayNum = calDateToDayNumber(cal, cal.endYear, cal.endMonth, cal.endDay);
  const totalDays = Math.max(1, endDayNum - startDayNum + 1);

  const dayToPos = (dayNum: number) => ((dayNum - startDayNum) / totalDays);

  if (resolution === "centuries") {
    const startCentury = Math.floor((cal.startYear - 1) / 100);
    const endCentury = Math.floor((cal.endYear - 1) / 100);
    const numCenturies = Math.max(1, endCentury - startCentury + 1);
    const trackWidth = Math.max(400, numCenturies * PX_CENTURY);
    for (let c = startCentury; c <= endCentury; c++) {
      const centuryYear = c * 100 + 1;
      const dayNum = calDateToDayNumber(cal, centuryYear, 1, 1);
      const pos = dayToPos(dayNum);
      marks.push({ position: Math.max(0, Math.min(1, pos)), label: `${cal.yearLabel} ${centuryYear}`, major: true });
      for (let d = 1; d < 10; d++) {
        const decYear = centuryYear + d * 10;
        if (decYear <= cal.endYear) {
          const dDay = calDateToDayNumber(cal, decYear, 1, 1);
          const dPos = dayToPos(dDay);
          if (dPos >= 0 && dPos <= 1) marks.push({ position: dPos, label: `${decYear}`, major: false });
        }
      }
    }
    return { marks, trackWidth };
  }

  if (resolution === "decades") {
    const startDecade = Math.floor((cal.startYear - 1) / 10);
    const endDecade = Math.floor((cal.endYear - 1) / 10);
    const numDecades = Math.max(1, endDecade - startDecade + 1);
    const trackWidth = Math.max(400, numDecades * PX_DECADE);
    for (let d = startDecade; d <= endDecade; d++) {
      const decYear = d * 10 + 1;
      const dayNum = calDateToDayNumber(cal, decYear, 1, 1);
      const pos = dayToPos(dayNum);
      marks.push({ position: Math.max(0, Math.min(1, pos)), label: `${cal.yearLabel} ${decYear}`, major: true });
      for (let y = 1; y < 10; y++) {
        const yr = decYear + y;
        if (yr <= cal.endYear) {
          const yDay = calDateToDayNumber(cal, yr, 1, 1);
          const yPos = dayToPos(yDay);
          if (yPos >= 0 && yPos <= 1) marks.push({ position: yPos, label: `${yr}`, major: false });
        }
      }
    }
    return { marks, trackWidth };
  }

  if (resolution === "years") {
    const numYears = calSpanYears(cal);
    const trackWidth = Math.max(400, numYears * PX_YEAR);
    for (let y = cal.startYear; y <= cal.endYear; y++) {
      const dayNum = calDateToDayNumber(cal, y, 1, 1);
      const pos = dayToPos(dayNum);
      marks.push({ position: Math.max(0, Math.min(1, pos)), label: `${cal.yearLabel} ${y}`, major: true });
    }
    return { marks, trackWidth };
  }

  if (resolution === "months") {
    const numMonths = calSpanMonths(cal);
    const trackWidth = Math.max(400, numMonths * PX_MONTH);
    for (let y = cal.startYear; y <= cal.endYear; y++) {
      const mStart = y === cal.startYear ? cal.startMonth : 1;
      const mEnd = y === cal.endYear ? cal.endMonth : cal.monthsPerYear;
      for (let m = mStart; m <= mEnd; m++) {
        const dayNum = calDateToDayNumber(cal, y, m, 1);
        const pos = dayToPos(dayNum);
        const mName = cal.monthNames[m - 1] || `M${m}`;
        const isMajor = m === 1;
        marks.push({ position: Math.max(0, Math.min(1, pos)), label: isMajor ? `${mName} ${cal.yearLabel} ${y}` : mName, major: isMajor });
      }
    }
    return { marks, trackWidth };
  }

  // days
  const trackWidth = Math.max(400, totalDays * PX_DAY);
  const diy = calDaysInYear(cal);
  let currentDay = startDayNum;
  let prevMonth = -1;
  while (currentDay <= endDayNum) {
    const pos = dayToPos(currentDay);
    const yearNum = Math.floor((currentDay - 1) / diy) + 1;
    let remaining = currentDay - (yearNum - 1) * diy;
    let monthIdx = 0;
    while (monthIdx < cal.monthsPerYear && remaining > (cal.daysPerMonth[monthIdx] || 0)) {
      remaining -= cal.daysPerMonth[monthIdx] || 0;
      monthIdx++;
    }
    const dayInMonth = remaining;
    const isMajor = monthIdx !== prevMonth;
    prevMonth = monthIdx;
    const mName = cal.monthNames[monthIdx] || `M${monthIdx + 1}`;
    marks.push({
      position: Math.max(0, Math.min(1, pos)),
      label: isMajor ? `${dayInMonth} ${mName}` : `${dayInMonth}`,
      major: isMajor,
    });
    currentDay++;
    if (marks.length > 15000) break;
  }
  return { marks, trackWidth };
}

function VirtualDayRuler({ marks, laneColor, trackWidth, railY }: {
  marks: RulerMark[];
  laneColor: string;
  trackWidth: number;
  railY: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 1]);
  const rafRef = useRef(0);
  const lastRange = useRef<[number, number]>([0, 1]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollParent = el.closest("[data-track-scroll]") as HTMLElement | null;
    if (!scrollParent) return;

    const update = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const sl = scrollParent.scrollLeft;
        const cw = scrollParent.clientWidth;
        const buffer = cw * 1.0;
        const lo = Math.max(0, (sl - buffer) / trackWidth);
        const hi = Math.min(1, (sl + cw + buffer) / trackWidth);
        if (Math.abs(lo - lastRange.current[0]) > 0.001 || Math.abs(hi - lastRange.current[1]) > 0.001) {
          lastRange.current = [lo, hi];
          setVisibleRange([lo, hi]);
        }
      });
    };

    update();
    scrollParent.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(scrollParent);
    return () => {
      cancelAnimationFrame(rafRef.current);
      scrollParent.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [trackWidth]);

  const visible = useMemo(() =>
    marks.filter(m => m.position >= visibleRange[0] && m.position <= visibleRange[1]),
    [marks, visibleRange]
  );

  return (
    <div ref={containerRef} className="absolute left-0 right-0" style={{ top: railY + 8, height: 30, pointerEvents: "none", contain: "layout style" }}>
      {visible.map((mark, i) => (
        <div
          key={`${i}-${mark.position}`}
          className="absolute flex flex-col items-center"
          style={{
            left: `${mark.position * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div style={{
            width: mark.major ? 1.5 : 0.5,
            height: mark.major ? 10 : 6,
            background: mark.major
              ? `linear-gradient(180deg, ${laneColor}50, ${laneColor}15)`
              : `${laneColor}18`,
          }} />
          <span
            className="whitespace-nowrap mt-0.5"
            style={{
              fontSize: mark.major ? 8 : 7,
              fontWeight: mark.major ? 600 : 400,
              color: mark.major ? `${laneColor}99` : `${laneColor}44`,
              letterSpacing: "0.02em",
            }}
          >
            {mark.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function loadSessions(): SessionEntry[] {
  try {
    const raw = safeGetItem("inet-session-log");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function loadWikiPages(): WikiPage[] {
  try {
    const raw = safeGetItem("inet-dm-sites");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function migrateOldData(): TimelineData {
  try {
    const oldRaw = safeGetItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const oldEvents = JSON.parse(oldRaw);
      if (Array.isArray(oldEvents) && oldEvents.length > 0) {
        return {
          version: 2,
          books: [{
            id: uid(),
            name: "Book 1",
            order: 0,
            lanes: [{
              id: uid(),
              name: "Main Story",
              color: "#5B8CFF",
              collapsed: false,
              events: oldEvents.map((e: TimelineEvent, i: number) => ({ ...e, sortIndex: e.sortIndex ?? i })),
            }],
          }],
        };
      }
    }
  } catch { /* ignore */ }
  return { version: 2, books: [] };
}

function loadData(): TimelineData {
  try {
    const raw = safeGetItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 2) {
        for (const book of parsed.books) {
          for (const lane of book.lanes) {
            lane.events = (lane.events || []).map((e: TimelineEvent, i: number) => ({
              ...e,
              sortIndex: e.sortIndex ?? i,
              wikiLinks: e.wikiLinks ?? [],
            }));
          }
        }
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return migrateOldData();
}

// ══════════════════════════════════════��═══��═
// Wiki Link Picker
// ══════════════════���═════════════════════════
function WikiLinkPicker({ onAdd, onClose, existingIds }: {
  onAdd: (link: { articleId: string; articleTitle: string; displayText: string }) => void;
  onClose: () => void;
  existingIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);
  const [displayText, setDisplayText] = useState("");
  const pages = useMemo(() => loadWikiPages(), []);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return pages.filter(p =>
      !existingIds.includes(p.id) &&
      (p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
    );
  }, [pages, search, existingIds]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "linear-gradient(180deg, #10103A 0%, #0A0A2A 100%)", border: "1px solid #2A2A6B", width: 440, borderRadius: 6, boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 1px rgba(106,154,255,0.3)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #1A1A4B", background: "rgba(106,154,255,0.04)", borderRadius: "6px 6px 0 0" }}>
          <div className="flex items-center gap-2">
            <Link2 size={13} style={S_LINK} />
            <span className="text-[12px] font-semibold" style={S_TEXT}>Link Wiki Article</span>
          </div>
          <button onClick={onClose} className="hover:opacity-80"><X size={13} style={S_MUTED} /></button>
        </div>
        <div className="p-3 space-y-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search wiki articles..."
            className="w-full px-3 py-2 text-[11px] rounded"
            style={{ background: "#0A0A28", border: "1px solid #2A2A5B", color: "#C0D0F0", outline: "none" }}
            autoFocus
          />
          <div className="max-h-[200px] overflow-y-auto rounded" style={{ background: "#080820", border: "1px solid #1A1A4B" }}>
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-[10px]" style={S_DIM}>No articles found</div>
            ) : filtered.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelectedPage(p); setDisplayText(p.title); }}
                className="w-full text-left px-3 py-2 hover:bg-[#0A1A3A] flex items-center gap-2 transition-colors"
                style={{
                  background: selectedPage?.id === p.id ? "#0C1E45" : "transparent",
                  borderBottom: "1px solid #0A0A20",
                }}
              >
                <FileText size={10} style={{ color: selectedPage?.id === p.id ? "#6A9AFF" : "#3A4A6A" }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] truncate" style={{ color: selectedPage?.id === p.id ? "#C0D0F0" : "#7A8AAA", fontWeight: selectedPage?.id === p.id ? 600 : 400 }}>{p.title}</div>
                  <div className="text-[9px] truncate" style={S_DIM}>{p.category}</div>
                </div>
              </button>
            ))}
          </div>
          {selectedPage && (
            <div className="space-y-2 pt-2" style={{ borderTop: "1px solid #1A2A4B" }}>
              <div className="text-[10px]" style={S_MUTED}>
                Linking to: <span style={{ ...S_LINK, fontWeight: 600 }}>{selectedPage.title}</span>
              </div>
              <input
                value={displayText}
                onChange={e => setDisplayText(e.target.value)}
                placeholder={selectedPage.title}
                className="w-full px-3 py-1.5 text-[11px] rounded"
                style={{ background: "#0A0A28", border: "1px solid #2A2A5B", color: "#C0D0F0", outline: "none" }}
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: "1px solid #1A1A4B" }}>
          <button onClick={onClose} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_SUBTLE}>Cancel</button>
          <button
            onClick={() => {
              if (selectedPage) {
                onAdd({ articleId: selectedPage.id, articleTitle: selectedPage.title, displayText: displayText.trim() || selectedPage.title });
                onClose();
              }
            }}
            disabled={!selectedPage}
            className={`${retro.button} px-3 py-1 text-[11px]`}
            style={{ color: selectedPage ? "#FFFFFF" : "#3A4A6A", background: selectedPage ? "#2A5ABB" : "#0A0A28", opacity: selectedPage ? 1 : 0.5 }}
          >
            <Link2 size={10} className="inline mr-1" /> Add Link
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// Move Event to Lane Dialog
// ═════════════════════════��══════════════════
function MoveToLaneDialog({ lanes, currentLaneId, onMove, onClose }: {
  lanes: TimelineLane[];
  currentLaneId: string;
  onMove: (targetLaneId: string) => void;
  onClose: () => void;
}) {
  const otherLanes = lanes.filter(l => l.id !== currentLaneId);
  if (otherLanes.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "linear-gradient(180deg, #10103A 0%, #0A0A2A 100%)", border: "1px solid #2A2A6B", width: 320, borderRadius: 6, boxShadow: "0 16px 48px rgba(0,0,0,0.7)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #1A1A4B", background: "rgba(255,170,74,0.04)", borderRadius: "6px 6px 0 0" }}>
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={13} style={S_WARN} />
            <span className="text-[12px] font-semibold" style={S_TEXT}>Move to Timeline</span>
          </div>
          <button onClick={onClose} className="hover:opacity-80"><X size={13} style={S_MUTED} /></button>
        </div>
        <div className="p-2 space-y-0.5">
          {otherLanes.map(lane => (
            <button
              key={lane.id}
              onClick={() => { onMove(lane.id); onClose(); }}
              className="w-full text-left px-3 py-2.5 hover:bg-[#0C1E45] flex items-center gap-3 transition-colors rounded"
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: lane.color, boxShadow: `0 0 6px ${lane.color}40` }} />
              <span className="text-[11px] flex-1" style={S_TEXT}>{lane.name}</span>
              <span className="text-[9px]" style={S_DIM}>{lane.events.length} events</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════���════════════════════════���══════
// Component
// ════════════════════════════════════��═══════

export function CampaignTimeline() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = getPlayerTheme();
  const currentUser = safeGetItem("inet-user") || "";
  const isDM = currentUser === "DM";
  const pageBg = buildPageGradient(theme.pageBg);
  const accent = firstColor(theme.accentColor);

  const [data, setData] = useState<TimelineData>(loadData);
  useDebouncedJsonStorage(STORAGE_KEY, data);

  const sessions = useMemo(() => loadSessions(), []);
  const wikiPages = useMemo(() => loadWikiPages(), []);

  const [activeBookId, setActiveBookId] = useState<string>(() =>
    data.books.length > 0 ? data.books[0].id : ""
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [editingLaneId, setEditingLaneId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [renamingBookId, setRenamingBookId] = useState<string | null>(null);
  const [renamingLaneId, setRenamingLaneId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newTag, setNewTag] = useState("");
  const [bookMenuId, setBookMenuId] = useState<string | null>(null);
  const [laneMenuId, setLaneMenuId] = useState<string | null>(null);
  const [showWikiPicker, setShowWikiPicker] = useState(false);
  const [consolidatedView, setConsolidatedView] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [editingLaneSpan, setEditingLaneSpan] = useState<string | null>(null);
  const [laneSpanStart, setLaneSpanStart] = useState("");
  const [laneSpanEnd, setLaneSpanEnd] = useState("");
  const [editingCalendar, setEditingCalendar] = useState<LaneCalendarConfig | null>(null);
  const [savingPresetName, setSavingPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [customPresetsVersion, setCustomPresetsVersion] = useState(0);
  const [calendarSaveErrors, setCalendarSaveErrors] = useState<string[]>([]);
  const [laneResolutions, setLaneResolutions] = useState<Record<string, TimelineResolution>>({});
  const [moveEventInfo, setMoveEventInfo] = useState<{ eventId: string; bookId: string; laneId: string } | null>(null);
  const [deleteConfirmLane, setDeleteConfirmLane] = useState<{ bookId: string; laneId: string; laneName: string } | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [editingErasLaneId, setEditingErasLaneId] = useState<string | null>(null);
  const [deleteConfirmBook, setDeleteConfirmBook] = useState<{ bookId: string; bookName: string } | null>(null);
  const [deleteBookStep, setDeleteBookStep] = useState<1 | 2>(1);
  const [deleteBookInput, setDeleteBookInput] = useState("");
  const [draggingEra, setDraggingEra] = useState<{ bookId: string; laneId: string; eraId: string; edge: "start" | "end"; trackLeft: number; trackWidth: number } | null>(null);
  const [eraSnapEnabled, setEraSnapEnabled] = useState(true);
  const [eraClickThrough, setEraClickThrough] = useState(false);
  const [creatingEraOnTrack, setCreatingEraOnTrack] = useState<{ bookId: string; laneId: string } | null>(null);
  const [selectedEraId, setSelectedEraId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  const [draggingEvent, setDraggingEvent] = useState<{ eventId: string; laneId: string; startX: number; startY: number; startPos: number } | null>(null);
  const [dragOverLaneId, setDragOverLaneId] = useState<string | null>(null);

  // Jump to Event from URL
  const jumpHandled = useRef(false);
  useEffect(() => {
    if (jumpHandled.current) return;
    const jumpId = searchParams.get("jump");
    if (!jumpId) return;
    jumpHandled.current = true;
    for (const book of data.books) {
      for (const lane of book.lanes) {
        const ev = lane.events.find(e => e.id === jumpId);
        if (ev) {
          setActiveBookId(book.id);
          setSelectedEventId(ev.id);
          setConsolidatedView(false);
          setSearchParams({}, { replace: true });
          setTimeout(() => {
            const detail = document.querySelector("[data-event-detail]");
            if (detail) detail.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 200);
          return;
        }
      }
    }
    setSearchParams({}, { replace: true });
  }, [data.books, searchParams, setSearchParams]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setBookMenuId(null);
        setLaneMenuId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Ctrl+Scroll wheel → change lane resolution (scale level) if over a calendar lane, else zoom nodes
  // Plain scroll → horizontal pan
  const changeResolutionRef = useRef<(laneId: string, direction: "in" | "out") => void>(null);
  useEffect(() => {
    changeResolutionRef.current = (laneId: string, direction: "in" | "out") => {
      setLaneResolutions(prev => {
        const current = prev[laneId] || "years";
        const idx = RESOLUTION_ORDER.indexOf(current);
        const newIdx = direction === "in" ? Math.min(RESOLUTION_ORDER.length - 1, idx + 1) : Math.max(0, idx - 1);
        return { ...prev, [laneId]: RESOLUTION_ORDER[newIdx] };
      });
    };
  });
  useEffect(() => {
    const container = timelineContainerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const target = e.target as HTMLElement;
        const laneEl = target.closest("[data-lane-id]") as HTMLElement | null;
        const laneId = laneEl?.getAttribute("data-lane-id");
        if (laneId && changeResolutionRef.current) {
          const direction = e.deltaY > 0 ? "out" : "in";
          changeResolutionRef.current(laneId, direction);
          return;
        }
        setZoomLevel(prev => {
          const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
          return Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)) * 100) / 100;
        });
        return;
      }
      // Regular scroll → find nearest horizontal-scrollable track and scroll it
      const target = e.target as HTMLElement;
      const scrollable = target.closest("[data-track-scroll]") as HTMLElement | null;
      if (scrollable && scrollable.scrollWidth > scrollable.clientWidth) {
        e.preventDefault();
        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        scrollable.scrollLeft += delta;
      }
    };
    container.addEventListener("wheel", handler, { passive: false });
    return () => container.removeEventListener("wheel", handler);
  }, []);

  const activeBook = useMemo(() =>
    data.books.find(b => b.id === activeBookId) || null
  , [data.books, activeBookId]);

  useEffect(() => {
    const needed: Record<string, TimelineResolution> = {};
    for (const book of data.books) {
      for (const lane of book.lanes) {
        if (lane.calendar && !laneResolutions[lane.id]) {
          needed[lane.id] = lane.calendar.defaultResolution || calAutoResolution(lane.calendar);
        }
      }
    }
    if (Object.keys(needed).length > 0) {
      setLaneResolutions(prev => ({ ...prev, ...needed }));
    }
  }, [data.books]);

  // ═════════════��═════════════════════════════
  // Book CRUD
  // ═══════════════════════════════════════════
  const addBook = useCallback(() => {
    const nextNum = data.books.length + 1;
    const newBook: TimelineBook = { id: uid(), name: `Book ${nextNum}`, order: nextNum - 1, lanes: [] };
    setData(prev => ({ ...prev, books: [...prev.books, newBook] }));
    setActiveBookId(newBook.id);
  }, [data.books.length]);

  const renameBook = useCallback((bookId: string, newName: string) => {
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, name: newName } : b) }));
    setRenamingBookId(null);
  }, []);

  const deleteBook = useCallback((bookId: string) => {
    setData(prev => ({ ...prev, books: prev.books.filter(b => b.id !== bookId) }));
    if (activeBookId === bookId) setActiveBookId(data.books.find(b => b.id !== bookId)?.id || "");
  }, [activeBookId, data.books]);

  const setBookTimespan = useCallback((bookId: string, timespan: string) => {
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, timespan } : b) }));
  }, []);

  // ═══════════════════════════════════════════
  // Lane CRUD
  // ═══════════════════════════════════��═══════
  const addLane = useCallback((bookId: string) => {
    const book = data.books.find(b => b.id === bookId);
    const colorIdx = book ? book.lanes.length % LANE_PALETTE.length : 0;
    const newLane: TimelineLane = { id: uid(), name: "New Timeline", color: LANE_PALETTE[colorIdx], collapsed: false, events: [] };
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, lanes: [...b.lanes, newLane] } : b) }));
    setRenamingLaneId(newLane.id);
    setRenameValue("New Timeline");
  }, [data.books]);

  const renameLane = useCallback((bookId: string, laneId: string, newName: string) => {
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, lanes: b.lanes.map(l => l.id === laneId ? { ...l, name: newName } : l) } : b) }));
    setRenamingLaneId(null);
  }, []);

  const deleteLane = useCallback((bookId: string, laneId: string) => {
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, lanes: b.lanes.filter(l => l.id !== laneId) } : b) }));
  }, []);

  const toggleLaneCollapse = useCallback((bookId: string, laneId: string) => {
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, lanes: b.lanes.map(l => l.id === laneId ? { ...l, collapsed: !l.collapsed } : l) } : b) }));
  }, []);

  const changeLaneColor = useCallback((bookId: string, laneId: string, color: string) => {
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, lanes: b.lanes.map(l => l.id === laneId ? { ...l, color } : l) } : b) }));
  }, []);

  const setLaneTimespan = useCallback((bookId: string, laneId: string, startLabel: string, endLabel: string, calendar?: LaneCalendarConfig) => {
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, lanes: b.lanes.map(l => l.id === laneId ? { ...l, startLabel, endLabel, calendar } : l) } : b) }));
    setEditingLaneSpan(null);
    setEditingCalendar(null);
  }, []);

  // ══════════════���════════════════════════════
  // Era CRUD
  // ═══════════════════════════════════════���═══
  const addEra = useCallback((bookId: string, laneId: string) => {
    const newEra: TimelineEra = { id: uid(), name: "New Era", color: ERA_PALETTE[Math.floor(Math.random() * ERA_PALETTE.length)], startPct: 0, endPct: 25 };
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, lanes: b.lanes.map(l => l.id === laneId ? { ...l, eras: [...(l.eras || []), newEra] } : l) } : b) }));
  }, []);

  const updateEra = useCallback((bookId: string, laneId: string, eraId: string, patch: Partial<TimelineEra>) => {
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, lanes: b.lanes.map(l => l.id === laneId ? { ...l, eras: (l.eras || []).map(e => e.id === eraId ? { ...e, ...patch } : e) } : l) } : b) }));
  }, []);

  const deleteEra = useCallback((bookId: string, laneId: string, eraId: string) => {
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, lanes: b.lanes.map(l => l.id === laneId ? { ...l, eras: (l.eras || []).filter(e => e.id !== eraId) } : l) } : b) }));
  }, []);

  const getCalendarSnapPoints = useCallback((lane: TimelineLane): number[] => {
    if (!lane.calendar) return [];
    const cal = lane.calendar;
    const startDayNum = calDateToDayNumber(cal, cal.startYear, cal.startMonth, cal.startDay);
    const endDayNum = calDateToDayNumber(cal, cal.endYear, cal.endMonth, cal.endDay);
    const totalDays = Math.max(1, endDayNum - startDayNum + 1);
    const snaps: number[] = [0, 100];
    for (let y = cal.startYear; y <= cal.endYear; y++) {
      const dayNum = calDateToDayNumber(cal, y, 1, 1);
      const pct = ((dayNum - startDayNum) / totalDays) * 100;
      if (pct >= 0 && pct <= 100) snaps.push(Math.round(pct * 100) / 100);
      for (let m = 1; m <= cal.monthsPerYear; m++) {
        const mDay = calDateToDayNumber(cal, y, m, 1);
        const mPct = ((mDay - startDayNum) / totalDays) * 100;
        if (mPct >= 0 && mPct <= 100) snaps.push(Math.round(mPct * 100) / 100);
      }
    }
    return [...new Set(snaps)].sort((a, b) => a - b);
  }, []);

  const snapToNearest = useCallback((pct: number, snapPoints: number[], threshold: number = 2): number => {
    let closest = pct;
    let minDist = threshold;
    for (const sp of snapPoints) {
      const dist = Math.abs(pct - sp);
      if (dist < minDist) { minDist = dist; closest = sp; }
    }
    return closest;
  }, []);

  const pctToCalLabel = useCallback((pct: number, cal: LaneCalendarConfig): string => {
    const startDayNum = calDateToDayNumber(cal, cal.startYear, cal.startMonth, cal.startDay);
    const endDayNum = calDateToDayNumber(cal, cal.endYear, cal.endMonth, cal.endDay);
    const totalDays = Math.max(1, endDayNum - startDayNum + 1);
    const dayNum = startDayNum + Math.round((pct / 100) * totalDays);
    const diy = calDaysInYear(cal);
    const yearNum = Math.floor((dayNum - 1) / diy) + 1;
    let remaining = dayNum - (yearNum - 1) * diy;
    let monthIdx = 0;
    while (monthIdx < cal.monthsPerYear && remaining > (cal.daysPerMonth[monthIdx] || 0)) {
      remaining -= cal.daysPerMonth[monthIdx] || 0;
      monthIdx++;
    }
    const mName = cal.monthNames[monthIdx] || `M${monthIdx + 1}`;
    return `${remaining} ${mName}, ${cal.yearLabel} ${yearNum}`;
  }, []);

  // ═══════════════════════════════════════════
  // Event CRUD
  // ═══════════════════════════════════════════
  const getNextSortIndex = useCallback((bookId: string, laneId: string): number => {
    const book = data.books.find(b => b.id === bookId);
    if (!book) return 0;
    const lane = book.lanes.find(l => l.id === laneId);
    if (!lane || lane.events.length === 0) return 0;
    return Math.max(...lane.events.map(e => e.sortIndex ?? 0)) + 1;
  }, [data.books]);

  const createBlankEvent = useCallback((bookId: string, laneId: string): TimelineEvent => ({
    id: uid(), title: "", date: "", realDate: new Date().toISOString().slice(0, 10),
    description: "", category: "story", location: "", importance: "normal",
    tags: [], sessionRef: "", sessionId: undefined, wikiLinks: [],
    sortIndex: getNextSortIndex(bookId, laneId),
  }), [getNextSortIndex]);

  const saveEvent = useCallback((bookId: string, laneId: string, event: TimelineEvent) => {
    setData(prev => ({
      ...prev,
      books: prev.books.map(b =>
        b.id === bookId
          ? { ...b, lanes: b.lanes.map(l => {
              if (l.id !== laneId) return l;
              const idx = l.events.findIndex(e => e.id === event.id);
              if (idx >= 0) { const copy = [...l.events]; copy[idx] = event; return { ...l, events: copy }; }
              return { ...l, events: [...l.events, event] };
            })}
          : b
      ),
    }));
    setEditingEvent(null); setEditingLaneId(null); setIsCreating(false);
  }, []);

  const deleteEvent = useCallback((bookId: string, laneId: string, eventId: string) => {
    setData(prev => ({
      ...prev,
      books: prev.books.map(b => b.id === bookId ? { ...b, lanes: b.lanes.map(l => l.id === laneId ? { ...l, events: l.events.filter(e => e.id !== eventId) } : l) } : b),
    }));
    if (selectedEventId === eventId) setSelectedEventId(null);
  }, [selectedEventId]);

  const moveEventToLane = useCallback((bookId: string, fromLaneId: string, eventId: string, toLaneId: string) => {
    setData(prev => {
      const newBooks = prev.books.map(b => {
        if (b.id !== bookId) return b;
        let movedEvent: TimelineEvent | null = null;
        const newLanes = b.lanes.map(l => {
          if (l.id === fromLaneId) { const ev = l.events.find(e => e.id === eventId); if (ev) movedEvent = { ...ev }; return { ...l, events: l.events.filter(e => e.id !== eventId) }; }
          return l;
        });
        if (movedEvent) {
          const targetLane = newLanes.find(l => l.id === toLaneId);
          const newSortIndex = targetLane ? Math.max(0, ...targetLane.events.map(e => e.sortIndex ?? 0)) + 1 : 0;
          return { ...b, lanes: newLanes.map(l => l.id === toLaneId ? { ...l, events: [...l.events, { ...movedEvent!, sortIndex: newSortIndex }] } : l) };
        }
        return { ...b, lanes: newLanes };
      });
      return { ...prev, books: newBooks };
    });
    setMoveEventInfo(null);
  }, []);

  const handleAddTag = useCallback(() => {
    if (!editingEvent || !newTag.trim()) return;
    if (!editingEvent.tags.includes(newTag.trim())) setEditingEvent({ ...editingEvent, tags: [...editingEvent.tags, newTag.trim()] });
    setNewTag("");
  }, [editingEvent, newTag]);

  const handleRemoveTag = useCallback((tag: string) => {
    if (!editingEvent) return;
    setEditingEvent({ ...editingEvent, tags: editingEvent.tags.filter(t => t !== tag) });
  }, [editingEvent]);

  const handleAddWikiLink = useCallback((link: { articleId: string; articleTitle: string; displayText: string }) => {
    if (!editingEvent) return;
    const existing = editingEvent.wikiLinks || [];
    if (!existing.some(l => l.articleId === link.articleId)) setEditingEvent({ ...editingEvent, wikiLinks: [...existing, link] });
  }, [editingEvent]);

  const handleRemoveWikiLink = useCallback((articleId: string) => {
    if (!editingEvent) return;
    setEditingEvent({ ...editingEvent, wikiLinks: (editingEvent.wikiLinks || []).filter(l => l.articleId !== articleId) });
  }, [editingEvent]);

  const findEventLocation = useCallback((eventId: string): { bookId: string; laneId: string; event: TimelineEvent } | null => {
    for (const book of data.books) { for (const lane of book.lanes) { const event = lane.events.find(e => e.id === eventId); if (event) return { bookId: book.id, laneId: lane.id, event }; } }
    return null;
  }, [data.books]);



  // ══════════���════════════════════════════════
  // Drag Handlers
  // ═══════════════════════════════════════════
  const handleDragStart = useCallback((e: React.MouseEvent, eventId: string, laneId: string, currentSortIndex: number) => {
    if (!isDM) return;
    e.preventDefault(); e.stopPropagation();
    setDraggingEvent({ eventId, laneId, startX: e.clientX, startY: e.clientY, startPos: currentSortIndex });
    setDragOverLaneId(null);
  }, [isDM]);

  useEffect(() => {
    if (!draggingEvent) return;
    const handleMouseMove = (e: MouseEvent) => {
      const laneEls = document.querySelectorAll("[data-lane-id]");
      let foundLaneId: string | null = null;
      laneEls.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom && e.clientX >= rect.left && e.clientX <= rect.right) foundLaneId = el.getAttribute("data-lane-id");
      });
      setDragOverLaneId(foundLaneId && foundLaneId !== draggingEvent.laneId ? foundLaneId : null);
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (!draggingEvent || !activeBookId) { setDraggingEvent(null); setDragOverLaneId(null); return; }
      const laneEls = document.querySelectorAll("[data-lane-id]");
      let targetLaneId: string | null = null;
      laneEls.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom && e.clientX >= rect.left && e.clientX <= rect.right) targetLaneId = el.getAttribute("data-lane-id");
      });
      if (targetLaneId && targetLaneId !== draggingEvent.laneId) {
        moveEventToLane(activeBookId, draggingEvent.laneId, draggingEvent.eventId, targetLaneId);
      } else {
        const deltaX = e.clientX - draggingEvent.startX;
        const sensitivity = 80 / zoomLevel;
        const indexDelta = Math.round(deltaX / sensitivity);
        if (indexDelta !== 0) {
          const book = data.books.find(b => b.id === activeBookId);
          if (book) {
            const lane = book.lanes.find(l => l.id === draggingEvent.laneId);
            if (lane) {
              const sorted = [...lane.events].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
              const currentIdx = sorted.findIndex(ev => ev.id === draggingEvent.eventId);
              const targetIdx = Math.max(0, Math.min(sorted.length - 1, currentIdx + indexDelta));
              if (currentIdx !== targetIdx) {
                const reordered = [...sorted]; const [moved] = reordered.splice(currentIdx, 1); reordered.splice(targetIdx, 0, moved);
                setData(prev => ({
                  ...prev,
                  books: prev.books.map(b => b.id === activeBookId ? { ...b, lanes: b.lanes.map(l => l.id === draggingEvent.laneId ? { ...l, events: l.events.map(ev => { const newIdx = reordered.findIndex(r => r.id === ev.id); return { ...ev, sortIndex: newIdx >= 0 ? newIdx : ev.sortIndex }; }) } : l) } : b),
                }));
              }
            }
          }
        }
      }
      setDraggingEvent(null); setDragOverLaneId(null);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
  }, [draggingEvent, activeBookId, data.books, zoomLevel, moveEventToLane]);

  useEffect(() => {
    if (!draggingEra) return;
    const handleMouseMove = (e: MouseEvent) => {
      const rawPct = Math.max(0, Math.min(100, ((e.clientX - draggingEra.trackLeft) / draggingEra.trackWidth) * 100));
      const book = data.books.find(b => b.id === draggingEra.bookId);
      const lane = book?.lanes.find(l => l.id === draggingEra.laneId);
      let pct = Math.round(rawPct * 10) / 10;
      if (eraSnapEnabled && lane?.calendar) {
        const snaps = getCalendarSnapPoints(lane);
        pct = snapToNearest(pct, snaps, 3);
      }
      const era = lane?.eras?.find(er => er.id === draggingEra.eraId);
      if (!era) return;
      if (draggingEra.edge === "start") {
        updateEra(draggingEra.bookId, draggingEra.laneId, draggingEra.eraId, { startPct: Math.min(pct, era.endPct - 1) });
      } else {
        updateEra(draggingEra.bookId, draggingEra.laneId, draggingEra.eraId, { endPct: Math.max(pct, era.startPct + 1) });
      }
    };
    const handleMouseUp = () => setDraggingEra(null);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
  }, [draggingEra, data.books, eraSnapEnabled, getCalendarSnapPoints, snapToNearest, updateEra]);

  // ═════════════════════════════════��═════════
  // Input style helper
  // ═══════════════════════════════════════════
  const inputStyle: React.CSSProperties = { background: "#0C0C30", border: "1px solid #252560", color: "#C0D0F0", outline: "none", borderRadius: 3 };
  const labelStyle: React.CSSProperties = { color: "#6A7A9A", letterSpacing: "0.03em" };

  // ══════════════════════════════��════════════
  // Decorative Timeline Rail SVG
  // ═════════════════════════════════��═════════
  const renderTimelineRail = (laneColor: string, eventCount: number, _hasTimespan: boolean) => {
    const railId = `rail-${Math.random().toString(36).slice(2, 8)}`;
    return (
      <div style={DISPLAY_CONTENTS}>
        {/* Ambient glow behind rail */}
        <div className="absolute left-4 right-4" style={{
          top: RAIL_Y - 6,
          height: 14,
          background: `radial-gradient(ellipse at 50% 50%, ${laneColor}12, transparent 70%)`,
          borderRadius: 8,
          pointerEvents: "none",
        }} />

        {/* Outer rail track (shadow/border) */}
        <div className="absolute left-4 right-4" style={{
          top: RAIL_Y - 1,
          height: 4,
          background: `linear-gradient(90deg, transparent, ${laneColor}08 5%, ${laneColor}15 50%, ${laneColor}08 95%, transparent)`,
          borderRadius: 3,
          pointerEvents: "none",
        }} />

        {/* Main rail line with inner glow */}
        <div className="absolute left-4 right-4" style={{
          top: RAIL_Y,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${laneColor}30 3%, ${laneColor}55 15%, ${laneColor}60 50%, ${laneColor}55 85%, ${laneColor}30 97%, transparent)`,
          borderRadius: 1,
          boxShadow: `0 0 6px ${laneColor}20, 0 0 2px ${laneColor}30`,
          pointerEvents: "none",
        }} />

        {/* Decorative tick marks along the rail */}
        {Array.from({ length: 9 }).map((_, i) => {
          const pct = 10 + i * 10;
          return (
            <div key={`tick-${i}`} className="absolute" style={{
              left: `${pct}%`,
              top: RAIL_Y - 3,
              width: 1,
              height: 8,
              background: `linear-gradient(180deg, ${laneColor}00, ${laneColor}18, ${laneColor}00)`,
              transform: "translateX(-50%)",
              pointerEvents: "none",
            }} />
          );
        })}

        {/* Left endpoint ornament */}
        <svg
          className="absolute"
          width={20} height={20}
          style={{ left: 4, top: RAIL_Y - 9, pointerEvents: "none" }}
          viewBox="0 0 20 20"
        >
          <defs>
            <linearGradient id={`${railId}-lg`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={laneColor} stopOpacity="0.7" />
              <stop offset="100%" stopColor={laneColor} stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <polygon
            points="3,10 10,4 17,10 10,16"
            fill="none"
            stroke={laneColor}
            strokeWidth="1.2"
            strokeOpacity="0.5"
            strokeLinejoin="round"
          />
          <polygon
            points="6,10 10,6.5 14,10 10,13.5"
            fill={`${laneColor}`}
            fillOpacity="0.15"
            stroke={laneColor}
            strokeWidth="0.8"
            strokeOpacity="0.35"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="10" r="1.5" fill={laneColor} fillOpacity="0.5" />
        </svg>

        {/* Right endpoint ornament */}
        <svg
          className="absolute"
          width={20} height={20}
          style={{ right: 4, top: RAIL_Y - 9, pointerEvents: "none" }}
          viewBox="0 0 20 20"
        >
          <polygon
            points="3,10 10,4 17,10 10,16"
            fill="none"
            stroke={laneColor}
            strokeWidth="1.2"
            strokeOpacity="0.5"
            strokeLinejoin="round"
          />
          <polygon
            points="6,10 10,6.5 14,10 10,13.5"
            fill={`${laneColor}`}
            fillOpacity="0.15"
            stroke={laneColor}
            strokeWidth="0.8"
            strokeOpacity="0.35"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="10" r="1.5" fill={laneColor} fillOpacity="0.5" />
        </svg>

        {/* Decorative scrollwork filigree left */}
        <svg
          className="absolute"
          width={40} height={12}
          style={{ left: 22, top: RAIL_Y - 5, pointerEvents: "none", opacity: 0.3 }}
          viewBox="0 0 40 12"
        >
          <path d="M0,6 Q10,1 20,6 Q30,11 40,6" fill="none" stroke={laneColor} strokeWidth="0.8" />
        </svg>
        {/* Decorative scrollwork filigree right */}
        <svg
          className="absolute"
          width={40} height={12}
          style={{ right: 22, top: RAIL_Y - 5, pointerEvents: "none", opacity: 0.3 }}
          viewBox="0 0 40 12"
        >
          <path d="M0,6 Q10,1 20,6 Q30,11 40,6" fill="none" stroke={laneColor} strokeWidth="0.8" />
        </svg>

        {/* Faint center ornament on long rails */}
        {eventCount >= 3 && (
          <svg
            className="absolute"
            width={16} height={16}
            style={{ left: "50%", top: RAIL_Y - 7, transform: "translateX(-50%)", pointerEvents: "none", opacity: 0.2 }}
            viewBox="0 0 16 16"
          >
            <circle cx="8" cy="8" r="6" fill="none" stroke={laneColor} strokeWidth="0.8" strokeDasharray="2 2" />
            <circle cx="8" cy="8" r="2" fill={laneColor} fillOpacity="0.3" />
          </svg>
        )}
      </div>
    );
  };

  // Rail position markers at each event
  const renderRailMarker = (xPos: number, laneColor: string, catColor: string, isSelected: boolean) => {
    return (
      <div className="absolute" style={{
        left: `${xPos}%`,
        top: RAIL_Y - 2,
        transform: "translateX(-50%)",
        pointerEvents: "none",
        zIndex: 0,
      }}>
        <svg width={10} height={6} viewBox="0 0 10 6">
          <polygon
            points="5,0 10,3 5,6 0,3"
            fill={isSelected ? catColor : laneColor}
            fillOpacity={isSelected ? 0.6 : 0.2}
            stroke={isSelected ? catColor : laneColor}
            strokeWidth="0.5"
            strokeOpacity={isSelected ? 0.8 : 0.3}
          />
        </svg>
        {isSelected && (
          <div style={{
            position: "absolute",
            left: -3,
            top: -3,
            width: 16,
            height: 12,
            borderRadius: "50%",
            background: `radial-gradient(ellipse, ${catColor}25, transparent)`,
          }} />
        )}
      </div>
    );
  };

  // ═════════════════════════���═════════════════
  // Event Editor Modal
  // ═══════════════════════════════��═══════���═══
  const renderEventEditor = () => {
    if (!editingEvent || !editingLaneId || !activeBookId) return null;
    const linkedSession = editingEvent.sessionId ? sessions.find(s => s.id === editingEvent.sessionId) : null;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) { setEditingEvent(null); setEditingLaneId(null); setIsCreating(false); } }}
      >
        <div
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          style={{
            background: "linear-gradient(180deg, #0E0E38 0%, #08082A 100%)",
            border: "1px solid #2A2A6B",
            borderRadius: 8,
            boxShadow: "0 24px 64px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <div
            className="px-5 py-4 flex items-center justify-between sticky top-0 z-10"
            style={{ background: "linear-gradient(180deg, #0E0E38 0%, #0C0C34 100%)", borderBottom: "1px solid #1E1E50", borderRadius: "8px 8px 0 0" }}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}>
                <Milestone size={14} style={{ color: accent }} />
              </div>
              <span className="text-[15px] font-bold" style={{ color: "#D0E0FF" }}>
                {isCreating ? "New Event" : "Edit Event"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { if (editingEvent.title.trim()) saveEvent(activeBookId, editingLaneId, editingEvent); }}
                disabled={!editingEvent.title.trim()}
                className={`${retro.button} text-[11px] px-4 py-1.5 flex items-center gap-1.5`}
                style={{ color: editingEvent.title.trim() ? "#4ACA6A" : "#3A4A6A" }}
              >
                <Save size={12} /> Save
              </button>
              <button
                onClick={() => { setEditingEvent(null); setEditingLaneId(null); setIsCreating(false); }}
                className="p-1.5 hover:opacity-70 transition-opacity"
                style={S_MUTED}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <label className="text-[10px] font-semibold mb-1.5 block uppercase tracking-wide" style={labelStyle}>Event Title *</label>
              <input value={editingEvent.title} onChange={e => setEditingEvent({ ...editingEvent, title: e.target.value })} className="w-full px-3 py-2.5 text-[13px]" style={inputStyle} placeholder="The Battle of Ironhold..." autoFocus />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold mb-1.5 block uppercase tracking-wide" style={labelStyle}>In-Game Date</label>
                <input value={editingEvent.date} onChange={e => setEditingEvent({ ...editingEvent, date: e.target.value })} className="w-full px-3 py-2 text-[12px]" style={inputStyle} placeholder="12th of Frostmoon" />
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-1.5 block uppercase tracking-wide" style={labelStyle}>Real-World Date</label>
                <input type="date" value={editingEvent.realDate} onChange={e => setEditingEvent({ ...editingEvent, realDate: e.target.value })} className="w-full px-3 py-2 text-[12px]" style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-1.5 block uppercase tracking-wide" style={labelStyle}>Session # Ref</label>
                <input value={editingEvent.sessionRef} onChange={e => setEditingEvent({ ...editingEvent, sessionRef: e.target.value })} className="w-full px-3 py-2 text-[12px]" style={inputStyle} placeholder="e.g. 14" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold mb-1.5 block uppercase tracking-wide" style={labelStyle}>Category</label>
                <select value={editingEvent.category} onChange={e => setEditingEvent({ ...editingEvent, category: e.target.value as TimelineEvent["category"] })} className="w-full px-3 py-2 text-[12px]" style={inputStyle}>
                  {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-1.5 block uppercase tracking-wide" style={labelStyle}>Shape (Importance)</label>
                <select value={editingEvent.importance} onChange={e => setEditingEvent({ ...editingEvent, importance: e.target.value as TimelineEvent["importance"] })} className="w-full px-3 py-2 text-[12px]" style={inputStyle}>
                  <option value="minor">Minor (Dot)</option>
                  <option value="normal">Normal (Hexagon)</option>
                  <option value="major">Major (Diamond)</option>
                  <option value="legendary">Legendary (Star)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-1.5 block uppercase tracking-wide" style={labelStyle}>Location</label>
                <input value={editingEvent.location} onChange={e => setEditingEvent({ ...editingEvent, location: e.target.value })} className="w-full px-3 py-2 text-[12px]" style={inputStyle} placeholder="Ironhold Castle" />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold mb-1.5 flex items-center gap-1.5 uppercase tracking-wide" style={labelStyle}>
                <Scroll size={10} /> Link Session Log
              </label>
              <select value={editingEvent.sessionId || ""} onChange={e => setEditingEvent({ ...editingEvent, sessionId: e.target.value || undefined })} className="w-full px-3 py-2 text-[12px]" style={inputStyle}>
                <option value="">— No linked session —</option>
                {sessions.sort((a, b) => a.sessionNumber - b.sessionNumber).map(s => (<option key={s.id} value={s.id}>Session #{s.sessionNumber}: {s.title}</option>))}
              </select>
              {linkedSession && (
                <div className="mt-1.5 text-[10px] px-3 py-1.5 rounded flex items-center gap-1.5" style={{ background: "#0A1A40", border: "1px solid #1A3A5B", color: "#5B8CFF" }}>
                  <Scroll size={9} /> Linked to Session #{linkedSession.sessionNumber}: {linkedSession.title}
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] font-semibold mb-1.5 block uppercase tracking-wide" style={labelStyle}>Description</label>
              <RichTextEditor value={editingEvent.description} onChange={v => setEditingEvent({ ...editingEvent, description: v })} minHeight={120} />
              <div className="text-[9px] mt-1.5" style={S_DIM}>
                Tip: Use [[Article Name]] or [[Article Name|Display Text]] for inline wiki links
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold mb-1.5 flex items-center gap-1.5 uppercase tracking-wide" style={labelStyle}>
                <Link2 size={10} /> Wiki Links
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(editingEvent.wikiLinks || []).map(link => (
                  <span key={link.articleId} className="text-[10px] px-2.5 py-1 flex items-center gap-1.5 rounded" style={{ background: "#0A1A40", border: "1px solid #2A4A6B", color: "#6A9AFF" }}>
                    <FileText size={9} /> {link.displayText}
                    <button onClick={() => handleRemoveWikiLink(link.articleId)} className="hover:opacity-70"><X size={8} style={S_RED} /></button>
                  </span>
                ))}
              </div>
              <button onClick={() => setShowWikiPicker(true)} className={`${retro.button} text-[11px] px-3 py-1 flex items-center gap-1.5`} style={S_LINK}>
                <Link2 size={10} /> Add Wiki Link
              </button>
            </div>

            <div>
              <label className="text-[10px] font-semibold mb-1.5 block uppercase tracking-wide" style={labelStyle}>Tags</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editingEvent.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-2.5 py-1 flex items-center gap-1.5 rounded" style={{ background: "#1A1A50", border: "1px solid #2A2A6B", color: "#8A9ACC" }}>
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} className="hover:opacity-70"><X size={8} style={S_RED} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }} className="flex-1 px-3 py-1.5 text-[11px]" style={inputStyle} placeholder="Add tag..." />
                <button onClick={handleAddTag} className={`${retro.button} text-[11px] px-3 py-1`} style={{ color: "#5B8CFF" }}><Plus size={12} /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // Event Detail Panel
  // ═══════════════════════════════════════════
  const renderEventDetail = () => {
    if (!selectedEventId) return null;
    const loc = findEventLocation(selectedEventId);
    if (!loc) return null;
    const { bookId, laneId, event } = loc;
    const cat = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.custom;
    const impCfg = IMPORTANCE_CONFIG[event.importance] || IMPORTANCE_CONFIG.normal;
    const lane = data.books.find(b => b.id === bookId)?.lanes.find(l => l.id === laneId);
    const book = data.books.find(b => b.id === bookId);
    const linkedSession = event.sessionId ? sessions.find(s => s.id === event.sessionId) : null;
    const hasMultipleLanes = book ? book.lanes.length > 1 : false;

    return (
      <div
        className="mt-5"
        data-event-detail
        style={{
          background: "#080822",
          borderRadius: 8,
          border: `1px solid ${cat.color}30`,
          boxShadow: `0 4px 24px ${cat.color}08, 0 1px 0 ${cat.color}15 inset`,
          overflow: "hidden",
        }}
      >
        {/* Color accent bar */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${cat.color}, ${cat.color}30)` }} />

        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${cat.color}15` }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-lg" style={{ background: cat.color + "15", color: cat.color, border: `1px solid ${cat.color}25` }}>
              {cat.icon}
            </div>
            <div className="min-w-0">
              <span className="text-[15px] font-bold block truncate" style={{ color: "#D0E0FF" }}>{event.title}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: cat.color + "15", color: cat.color }}>{cat.label}</span>
                {event.importance !== "normal" && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold flex items-center gap-1" style={{ background: impCfg.color + "15", color: impCfg.color }}>
                    <ShapeLegendIcon shape={impCfg.shape} size={8} color={impCfg.color} /> {event.importance}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isDM && (
              <div style={DISPLAY_CONTENTS}>
                <button onClick={() => { setEditingEvent({ ...event }); setEditingLaneId(laneId); setIsCreating(false); }} className={`${retro.button} text-[10px] px-2.5 py-1 flex items-center gap-1`} style={{ color: "#5B8CFF" }}>
                  <Edit size={10} /> Edit
                </button>
                {hasMultipleLanes && (
                  <button onClick={() => setMoveEventInfo({ eventId: event.id, bookId, laneId })} className={`${retro.button} text-[10px] px-2.5 py-1 flex items-center gap-1`} style={S_WARN} title="Move to another timeline">
                    <ArrowRightLeft size={10} /> Move
                  </button>
                )}
                <button onClick={() => { if (confirm("Delete this event?")) deleteEvent(bookId, laneId, event.id); }} className={`${retro.button} text-[10px] px-2.5 py-1 flex items-center gap-1`} style={{ color: "#FF5A5A" }}>
                  <Trash2 size={10} />
                </button>
              </div>
            )}
            <button onClick={() => setSelectedEventId(null)} className="p-1.5 hover:opacity-70 transition-opacity" style={{ color: "#4A5A7A" }}><X size={14} /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Meta chips */}
          <div className="flex flex-wrap items-center gap-2">
            {event.date && (
              <span className="text-[11px] flex items-center gap-1.5 px-2.5 py-1 rounded" style={{ color: "#8AAACC", background: "#0A0A2A", border: "1px solid #1A1A4B" }}>
                <Calendar size={10} /> {event.date}
              </span>
            )}
            {event.realDate && (
              <span className="text-[10px] flex items-center gap-1.5 px-2.5 py-1 rounded" style={{ color: "#5A6A8A", background: "#0A0A2A", border: "1px solid #151540" }}>
                <Clock size={9} /> {new Date(event.realDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
            {event.location && (
              <span className="text-[11px] flex items-center gap-1.5 px-2.5 py-1 rounded" style={{ color: "#8AAACC", background: "#0A0A2A", border: "1px solid #1A1A4B" }}>
                <MapPin size={10} /> {event.location}
              </span>
            )}
            {event.sessionRef && (
              <span className="text-[10px] flex items-center gap-1.5 px-2.5 py-1 rounded" style={{ color: "#5B8CFF", background: "#0A1535", border: "1px solid #1A3060" }}>
                Session #{event.sessionRef}
              </span>
            )}
            {lane && (
              <span className="text-[10px] flex items-center gap-1.5 px-2.5 py-1 rounded" style={{ color: lane.color, background: lane.color + "08", border: `1px solid ${lane.color}20` }}>
                <Layers size={9} /> {lane.name}
              </span>
            )}
          </div>

          {linkedSession && (
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:opacity-80 transition-opacity rounded-md"
              style={{ background: "linear-gradient(90deg, #0A1A40, #0A0A2A)", border: "1px solid #1A3A5B" }}
              onClick={() => navigate("/interface/session-log")}
            >
              <Scroll size={14} style={{ color: "#5B8CFF" }} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold" style={{ color: "#D0E0FF" }}>Session #{linkedSession.sessionNumber}: {linkedSession.title}</div>
                <div className="text-[9px]" style={S_MUTED}>
                  {linkedSession.date && `${linkedSession.date} · `}
                  {linkedSession.highlights.length} highlight{linkedSession.highlights.length !== 1 ? "s" : ""}
                </div>
              </div>
              <ExternalLink size={11} style={{ color: "#5B8CFF" }} />
            </div>
          )}

          {event.description && (
            <div className="text-[12px] leading-relaxed px-1" style={{ color: "#9AABBF" }}>
              <RenderFormattedText text={event.description} />
            </div>
          )}

          {(event.wikiLinks || []).length > 0 && (
            <div>
              <div className="text-[9px] font-semibold mb-1.5 uppercase tracking-wide" style={S_MUTED}>Linked Articles</div>
              <div className="flex flex-wrap gap-1.5">
                {(event.wikiLinks || []).map(link => {
                  const page = wikiPages.find(p => p.id === link.articleId);
                  return (
                    <span key={link.articleId} className="text-[10px] px-2.5 py-1 flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity rounded" style={{ background: "#0A1A40", border: "1px solid #2A4A6B", color: "#6A9AFF" }} onClick={() => { if (page) navigate(`/interface/inet-page/${page.id}`); }}>
                      <FileText size={9} /> {link.displayText} {page && <ExternalLink size={8} />}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {event.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {event.tags.map(tag => (
                <span key={tag} className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#14143F", border: "1px solid #22225A", color: "#7A8AAA" }}>{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // Render Event Node
  // ════════════════════════════════════���══════
  const RAIL_Y = isDM ? 90 : 75;

  const renderEventNode = (event: TimelineEvent, xPos: number, laneColor: string, laneId: string) => {
    const cat = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.custom;
    const impCfg = IMPORTANCE_CONFIG[event.importance] || IMPORTANCE_CONFIG.normal;
    const isSelected = selectedEventId === event.id;
    const isDragging = draggingEvent?.eventId === event.id;
    const hasSession = !!event.sessionId;
    const hasWikiLinks = (event.wikiLinks || []).length > 0;

    const shapeSize = impCfg.size + 6;
    const stemTop = 18 + shapeSize;

    return (
      <div
        key={event.id}
        className="absolute flex flex-col items-center cursor-pointer group"
        style={{
          left: `${xPos}%`,
          top: 0,
          transform: "translateX(-50%)",
          width: 140 * zoomLevel,
          zIndex: isSelected ? 10 : isDragging ? 20 : 1,
          opacity: isDragging ? 0.6 : 1,
          transition: isDragging ? "none" : "opacity 0.2s",
        }}
        onClick={() => setSelectedEventId(isSelected ? null : event.id)}
      >
        {isDM && (
          <div
            className="opacity-0 group-hover:opacity-100 transition-opacity mb-0.5 cursor-grab active:cursor-grabbing"
            style={S_DIM}
            onMouseDown={(e) => handleDragStart(e, event.id, laneId, event.sortIndex)}
            title="Drag to reorder, or drop on another lane to move"
          >
            <GripHorizontal size={10} />
          </div>
        )}

        {/* Title */}
        <div
          className="text-[10px] font-semibold text-center truncate w-full px-1 mb-1"
          style={{ color: isSelected ? "#FFFFFF" : "#8AABBF", transition: "color 0.2s", textShadow: isSelected ? `0 0 8px ${cat.color}60` : "none" }}
          title={event.title}
        >
          {event.title}
        </div>

        {/* Shape */}
        <div className="relative z-[2]">
          <ShapeNode shape={impCfg.shape} size={impCfg.size} catColor={cat.color} isSelected={isSelected} />
        </div>

        {/* Vertical stem to rail */}
        <div style={{
          position: "absolute",
          left: "50%",
          top: stemTop,
          width: 1,
          height: Math.max(0, RAIL_Y - stemTop + 1),
          background: `linear-gradient(180deg, ${cat.color}60, ${laneColor}30)`,
          transform: "translateX(-50%)",
          zIndex: 1,
        }} />

        {/* Indicator dots */}
        {(hasSession || hasWikiLinks) && (
          <div className="flex items-center gap-1" style={{ marginTop: Math.max(0, RAIL_Y - stemTop + 5) }}>
            {hasSession && <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#5B8CFF" }} title="Linked session" />}
            {hasWikiLinks && <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#6A9AFF" }} title="Wiki links" />}
          </div>
        )}

        {/* Date below rail */}
        <div
          className="text-[9px] text-center mt-1 truncate w-full px-1"
          style={{ color: "#4A5A7A", position: "absolute", top: RAIL_Y + 6 }}
          title={event.date || event.realDate}
        >
          {event.date || (event.realDate ? new Date(event.realDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "")}
        </div>

        {/* Category label */}
        <div
          className="text-[7px] mt-0.5 px-1.5 py-0 rounded-sm uppercase tracking-wider font-semibold"
          style={{ background: cat.color + "12", color: cat.color + "BB", position: "absolute", top: RAIL_Y + 20 }}
        >
          {cat.label}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // Visual Timeline Lane
  // ═══════════════════════════════════════════
  const getLaneResolution = (lane: TimelineLane): TimelineResolution => {
    if (laneResolutions[lane.id]) return laneResolutions[lane.id];
    if (lane.calendar) return lane.calendar.defaultResolution || calAutoResolution(lane.calendar);
    return "years";
  };

  const changeResolution = (laneId: string, direction: "in" | "out") => {
    setLaneResolutions(prev => {
      const current = prev[laneId] || "years";
      const idx = RESOLUTION_ORDER.indexOf(current);
      const newIdx = direction === "in" ? Math.min(RESOLUTION_ORDER.length - 1, idx + 1) : Math.max(0, idx - 1);
      return { ...prev, [laneId]: RESOLUTION_ORDER[newIdx] };
    });
  };

  const renderCalendarRuler = (cal: LaneCalendarConfig, resolution: TimelineResolution, laneColor: string, trackWidth: number) => {
    const { marks } = calBuildRuler(cal, resolution);
    if (resolution !== "centuries") {
      return <VirtualDayRuler marks={marks} laneColor={laneColor} trackWidth={trackWidth} railY={RAIL_Y} />;
    }
    return (
      <div className="absolute left-0 right-0" style={{ top: RAIL_Y + 8, height: 30, pointerEvents: "none", contain: "layout style" }}>
        {marks.map((mark, i) => (
          <div
            key={i}
            className="absolute flex flex-col items-center"
            style={{
              left: `${mark.position * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div style={{
              width: mark.major ? 1.5 : 0.5,
              height: mark.major ? 10 : 6,
              background: mark.major
                ? `linear-gradient(180deg, ${laneColor}50, ${laneColor}15)`
                : `${laneColor}18`,
            }} />
            <span
              className="whitespace-nowrap mt-0.5"
              style={{
                fontSize: mark.major ? 8 : 7,
                fontWeight: mark.major ? 600 : 400,
                color: mark.major ? `${laneColor}99` : `${laneColor}44`,
                letterSpacing: "0.02em",
              }}
            >
              {mark.label}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderLane = (lane: TimelineLane, bookId: string) => {
    const sortedEvents = [...lane.events].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    const hasCal = !!lane.calendar;
    const resolution = hasCal ? getLaneResolution(lane) : null;
    const calRuler = hasCal && lane.calendar && resolution ? calBuildRuler(lane.calendar, resolution) : null;
    const nodeWidth = 160 * zoomLevel;
    const trackMinWidth = calRuler
      ? Math.max(calRuler.trackWidth, sortedEvents.length * nodeWidth, 300)
      : Math.max(sortedEvents.length * nodeWidth, 300);
    const trackHeight = RAIL_Y + (hasCal ? 80 : 55);
    const isDropTarget = draggingEvent && dragOverLaneId === lane.id;

    return (
      <div
        key={lane.id}
        className="mb-4"
        data-lane-id={lane.id}
        style={{
          background: isDropTarget ? "#0A1230" : "#050510",
          border: isDropTarget ? `2px solid ${lane.color}50` : `1px solid ${lane.color}15`,
          borderRadius: 8,
          transition: "background 0.2s, border-color 0.2s",
          overflow: "hidden",
          boxShadow: isDropTarget ? `0 0 20px ${lane.color}15` : "inset 0 1px 4px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.02)",
        }}
      >
        {/* Left color accent + Drop indicator */}
        {isDropTarget && (
          <div className="px-4 py-1.5 text-center text-[10px] flex items-center justify-center gap-2" style={{ color: lane.color, background: `linear-gradient(90deg, ${lane.color}15, transparent)` }}>
            <ArrowRightLeft size={10} /> Drop here to move to "{lane.name}"
          </div>
        )}

        {/* Lane header */}
        <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ borderBottom: lane.collapsed ? "none" : `1px solid ${lane.color}10`, background: `linear-gradient(90deg, ${lane.color}06, transparent)` }}>
          <button onClick={() => toggleLaneCollapse(bookId, lane.id)} className="shrink-0" style={{ color: lane.color }}>
            <ChevronRight size={13} className={`transition-transform duration-200 ${lane.collapsed ? "" : "rotate-90"}`} />
          </button>
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: lane.color, boxShadow: `0 0 6px ${lane.color}40` }} />
          {renamingLaneId === lane.id ? (
            <input
              value={renameValue} onChange={e => setRenameValue(e.target.value)}
              onBlur={() => renameLane(bookId, lane.id, renameValue.trim() || lane.name)}
              onKeyDown={e => { if (e.key === "Enter") renameLane(bookId, lane.id, renameValue.trim() || lane.name); if (e.key === "Escape") setRenamingLaneId(null); }}
              className="flex-1 px-2 py-0.5 text-[12px] font-semibold" style={inputStyle} autoFocus
            />
          ) : (
            <span className="text-[13px] font-semibold flex-1 truncate" style={{ color: lane.color }}>
              {lane.name}
              {(lane.startLabel || lane.endLabel) && (
                <span className="text-[9px] font-normal ml-2" style={{ color: "#4A5A7A" }}>({lane.startLabel || "?"} — {lane.endLabel || "?"})</span>
              )}
            </span>
          )}
          <span className="text-[9px] px-2 py-0.5 rounded-full shrink-0" style={{ color: "#5A6A8A", background: "#020208" }}>
            {lane.events.length} event{lane.events.length !== 1 ? "s" : ""}
          </span>
          {isDM && (
            <div className="relative flex items-center gap-1.5 shrink-0" ref={laneMenuId === lane.id ? menuRef : undefined}>
              <button onClick={() => { const ev = createBlankEvent(bookId, lane.id); setEditingEvent(ev); setEditingLaneId(lane.id); setIsCreating(true); }} className="p-1 hover:opacity-80 rounded" style={{ color: "#4ACA6A" }} title="Add event">
                <Plus size={13} />
              </button>
              <button onClick={() => setLaneMenuId(laneMenuId === lane.id ? null : lane.id)} className="p-1 hover:opacity-80 rounded" style={S_MUTED}>
                <MoreHorizontal size={13} />
              </button>
              {laneMenuId === lane.id && (
                <div className="absolute top-full right-0 z-50 mt-1" style={{ background: "#0E0E38", border: "1px solid #2A2A6B", boxShadow: "0 8px 24px rgba(0,0,0,0.6)", minWidth: 170, borderRadius: 6 }}>
                  <button onClick={() => { setRenamingLaneId(lane.id); setRenameValue(lane.name); setLaneMenuId(null); }} className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A50] flex items-center gap-2 transition-colors rounded-t" style={S_TEXT}>
                    <Pencil size={10} /> Rename
                  </button>
                  <div className="h-[1px] mx-2" style={{ background: "#1A1A4B" }} />
                  <button onClick={() => {
                    setEditingLaneSpan(lane.id);
                    setLaneSpanStart(lane.startLabel || "");
                    setLaneSpanEnd(lane.endLabel || "");
                    setCalendarSaveErrors([]);
                    const defaultCal: LaneCalendarConfig = {
                      yearLabel: "Year",
                      monthsPerYear: 12,
                      monthNames: ["January","February","March","April","May","June","July","August","September","October","November","December"],
                      daysPerMonth: Array(12).fill(30),
                      startYear: 1, startMonth: 1, startDay: 1,
                      endYear: 1, endMonth: 12, endDay: 30,
                    };
                    setEditingCalendar(lane.calendar || defaultCal);
                    setLaneMenuId(null);
                  }} className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A50] flex items-center gap-2 transition-colors" style={S_TEXT}>
                    <Calendar size={10} /> Set Timespan
                  </button>
                  <div className="h-[1px] mx-2" style={{ background: "#1A1A4B" }} />
                  <div className="px-3 py-2">
                    <span className="text-[9px] block mb-1.5 uppercase tracking-wide" style={S_MUTED}>Color</span>
                    <div className="flex flex-wrap gap-1.5">
                      {LANE_PALETTE.map(c => (
                        <button key={c} onClick={() => { changeLaneColor(bookId, lane.id, c); setLaneMenuId(null); }} className="w-4.5 h-4.5 rounded-full" style={{ width: 18, height: 18, background: c, border: lane.color === c ? "2px solid #fff" : "2px solid transparent", boxShadow: `0 0 4px ${c}40` }} />
                      ))}
                    </div>
                  </div>
                  <div className="h-[1px] mx-2" style={{ background: "#1A1A4B" }} />
                  <button onClick={() => { setDeleteConfirmLane({ bookId, laneId: lane.id, laneName: lane.name }); setDeleteConfirmStep(1); setDeleteConfirmInput(""); setLaneMenuId(null); }} className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A50] flex items-center gap-2 transition-colors" style={{ color: "#FF5A5A" }}>
                    <Trash2 size={10} /> Delete Timeline
                  </button>
                  <div className="h-[1px] mx-2" style={{ background: "#1A1A4B" }} />
                  <button onClick={() => { setEditingErasLaneId(lane.id); setLaneMenuId(null); }} className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A50] flex items-center gap-2 transition-colors rounded-b" style={{ color: "#BB7AFF" }}>
                    <Palette size={10} /> Manage Eras
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {editingLaneSpan === lane.id && editingCalendar && (() => {
          const cal = editingCalendar;
          const updateCal = (patch: Partial<LaneCalendarConfig>) => setEditingCalendar(prev => prev ? { ...prev, ...patch } : prev);
          const updateMonthName = (idx: number, val: string) => {
            const names = [...cal.monthNames];
            names[idx] = val;
            updateCal({ monthNames: names });
          };
          const updateDaysForMonth = (idx: number, val: number) => {
            const days = [...cal.daysPerMonth];
            days[idx] = val;
            updateCal({ daysPerMonth: days });
          };
          const handleMonthCountChange = (newCount: number) => {
            const count = Math.max(1, Math.min(24, newCount));
            const names = [...cal.monthNames];
            const days = [...cal.daysPerMonth];
            while (names.length < count) names.push(`Month ${names.length + 1}`);
            while (days.length < count) days.push(30);
            updateCal({ monthsPerYear: count, monthNames: names.slice(0, count), daysPerMonth: days.slice(0, count) });
          };
          const formatLabel = (year: number, month: number, day: number) => {
            const mName = cal.monthNames[month - 1] || `M${month}`;
            return `${day} ${mName}, ${cal.yearLabel} ${year}`;
          };
          const handleSave = () => {
            const errors = calValidateConfig(cal);
            if (errors.length > 0) {
              setCalendarSaveErrors(errors);
              return;
            }
            setCalendarSaveErrors([]);
            const start = laneSpanStart || formatLabel(cal.startYear, cal.startMonth, cal.startDay);
            const end = laneSpanEnd || formatLabel(cal.endYear, cal.endMonth, cal.endDay);
            setLaneTimespan(bookId, lane.id, start, end, cal);
            if (!laneResolutions[lane.id]) {
              setLaneResolutions(prev => ({ ...prev, [lane.id]: cal.defaultResolution || calAutoResolution(cal) }));
            }
          };
          const sectionLabel: React.CSSProperties = { color: "#5A7AAA", fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 };
          const numInput: React.CSSProperties = { ...inputStyle, width: 56, textAlign: "center" as const };

          const BUILTIN_PRESETS: { name: string; icon: string; description: string; builtin: true; config: LaneCalendarConfig }[] = [
            {
              name: "Gregorian", icon: "\u2600", description: "Standard 12-month, 365-day calendar", builtin: true,
              config: {
                yearLabel: "Year", monthsPerYear: 12,
                monthNames: ["January","February","March","April","May","June","July","August","September","October","November","December"],
                daysPerMonth: [31,28,31,30,31,30,31,31,30,31,30,31],
                startYear: 1, startMonth: 1, startDay: 1, endYear: 1, endMonth: 12, endDay: 31,
              },
            },
            {
              name: "Celestial (Star)", icon: "\u2726", description: "13 star-months, 28 days each \u2014 the I-Net default", builtin: true,
              config: {
                yearLabel: "Year", monthsPerYear: 13,
                monthNames: ["Lunara","Selene","Artemina","Diantha","Solyndra","Astraeus","Eosara","Umbriel","Astralia","Caelion","Serevain","Brimara","Hiemsyl"],
                daysPerMonth: Array(13).fill(28),
                startYear: 1, startMonth: 1, startDay: 1, endYear: 1, endMonth: 13, endDay: 28,
              },
            },
          ];

          const CUSTOM_PRESETS_KEY = "inet-timeline-custom-calendar-presets";
          const loadCustomPresets = (): { name: string; icon: string; description: string; builtin: false; config: LaneCalendarConfig }[] => {
            try {
              const raw = safeGetItem(CUSTOM_PRESETS_KEY);
              return raw ? JSON.parse(raw).map((p: any) => ({ ...p, builtin: false })) : [];
            } catch { return []; }
          };
          const saveCustomPresets = (presets: { name: string; icon: string; description: string; config: LaneCalendarConfig }[]) => {
            safeSetJson(CUSTOM_PRESETS_KEY, presets);
          };

          void customPresetsVersion;
          const customPresets = loadCustomPresets();
          const allPresets = [...BUILTIN_PRESETS, ...customPresets];

          const applyPreset = (preset: { config: LaneCalendarConfig }) => {
            setEditingCalendar({ ...preset.config });
            setLaneSpanStart("");
            setLaneSpanEnd("");
          };

          const saveCurrentAsPreset = () => {
            const trimmed = savingPresetName.trim();
            if (!trimmed || !cal) return;
            const existing = loadCustomPresets().filter(p => p.name !== trimmed);
            const newPreset = {
              name: trimmed,
              icon: "\u2605",
              description: `Custom: ${cal.monthsPerYear} months, ${cal.yearLabel} year label`,
              config: { ...cal },
            };
            saveCustomPresets([...existing, newPreset]);
            setSavingPresetName("");
            setShowSavePreset(false);
            setCustomPresetsVersion(v => v + 1);
          };

          const deleteCustomPreset = (name: string) => {
            const existing = loadCustomPresets().filter(p => p.name !== name);
            saveCustomPresets(existing);
            setCustomPresetsVersion(v => v + 1);
          };

          return (
            <div style={{ background: "#0A0A28", borderBottom: `1px solid ${lane.color}15` }}>
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${lane.color}08` }}>
                <Calendar size={12} style={{ color: lane.color }} />
                <span className="text-[11px] font-semibold flex-1" style={S_TEXT}>Configure Calendar & Timespan</span>
                <button onClick={handleSave} className={`${retro.button} text-[10px] px-3 py-1 flex items-center gap-1.5`} style={{ color: "#4ACA6A" }}><Save size={10} /> Save</button>
                <button onClick={() => { setEditingLaneSpan(null); setEditingCalendar(null); setCalendarSaveErrors([]); }} className={`${retro.button} text-[10px] px-2 py-1`} style={S_RED}><X size={10} /></button>
              </div>

              {/* Preset Templates */}
              <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap" style={{ borderBottom: `1px solid ${lane.color}06` }}>
                <span className="text-[9px] font-semibold uppercase tracking-wide shrink-0 mr-1" style={{ color: "#4A5A7A" }}>Presets:</span>
                {allPresets.map(preset => (
                  <div key={preset.name} className="flex items-center">
                    <button
                      onClick={() => applyPreset(preset)}
                      className={`${retro.button} text-[10px] px-2.5 py-1 flex items-center gap-1.5 transition-colors hover:bg-[#1A1A50]`}
                      style={{ color: preset.builtin ? "#8AAACE" : "#C0A0E0", border: `1px solid ${lane.color}20`, borderRight: !preset.builtin ? "none" : undefined, borderTopRightRadius: !preset.builtin ? 0 : undefined, borderBottomRightRadius: !preset.builtin ? 0 : undefined }}
                      title={preset.description}
                    >
                      <span style={{ fontSize: 11 }}>{preset.icon}</span>
                      {preset.name}
                    </button>
                    {!preset.builtin && (
                      <button
                        onClick={() => deleteCustomPreset(preset.name)}
                        className={`${retro.button} text-[10px] px-1 py-1 transition-colors hover:bg-[#3A1A2A]`}
                        style={{ color: "#FF6A6A", border: `1px solid ${lane.color}20`, borderLeft: "none", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                        title={`Delete "${preset.name}" preset`}
                      >
                        <X size={9} />
                      </button>
                    )}
                  </div>
                ))}
                <div className="h-4 w-px mx-1" style={{ background: "#2A2A5A" }} />
                {!showSavePreset ? (
                  <button
                    onClick={() => setShowSavePreset(true)}
                    className={`${retro.button} text-[10px] px-2.5 py-1 flex items-center gap-1.5 transition-colors hover:bg-[#1A2A1A]`}
                    style={{ color: "#6ACA8A", border: `1px dashed ${lane.color}25` }}
                    title="Save current calendar configuration as a reusable preset"
                  >
                    <Plus size={10} />
                    Save as Preset
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={savingPresetName}
                      onChange={e => setSavingPresetName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveCurrentAsPreset(); if (e.key === "Escape") { setShowSavePreset(false); setSavingPresetName(""); } }}
                      placeholder="Preset name..."
                      className={`${retro.sunken} bg-[#0A0A2A] px-2 py-1 text-[10px] outline-none w-32`}
                      style={S_TEXT}
                    />
                    <button
                      onClick={saveCurrentAsPreset}
                      disabled={!savingPresetName.trim()}
                      className={`${retro.button} text-[10px] px-2 py-1 transition-colors`}
                      style={{ color: savingPresetName.trim() ? "#4ACA6A" : "#3A3A5A" }}
                      title="Save preset"
                    >
                      <Save size={10} />
                    </button>
                    <button
                      onClick={() => { setShowSavePreset(false); setSavingPresetName(""); }}
                      className={`${retro.button} text-[10px] px-1.5 py-1`}
                      style={S_RED}
                    >
                      <X size={10} />
                    </button>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {/* Left: Calendar Structure */}
                <div>
                  <div style={sectionLabel}>Calendar Structure</div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] w-24 shrink-0" style={{ color: "#6A7A9A" }}>Year Label:</span>
                      <input value={cal.yearLabel} onChange={e => updateCal({ yearLabel: e.target.value })} placeholder="Year" className="flex-1 px-2 py-1 text-[11px]" style={inputStyle} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] w-24 shrink-0" style={{ color: "#6A7A9A" }}>Months / Year:</span>
                      <input type="number" value={cal.monthsPerYear} onChange={e => handleMonthCountChange(parseInt(e.target.value) || 1)} min={1} max={24} className="px-2 py-1 text-[11px]" style={numInput} />
                    </div>
                  </div>

                  {/* Month names & days */}
                  <div style={{ ...sectionLabel, marginTop: 12 }}>Months</div>
                  <div className="overflow-y-auto pr-1 timeline-scrollbar-sm" style={{ maxHeight: 180 }}>
                    <div className="flex flex-col gap-1">
                      {cal.monthNames.slice(0, cal.monthsPerYear).map((name, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="text-[9px] w-4 text-right shrink-0" style={S_DIM}>{i + 1}</span>
                          <input value={name} onChange={e => updateMonthName(i, e.target.value)} className="flex-1 px-1.5 py-0.5 text-[10px]" style={inputStyle} />
                          <input type="number" value={cal.daysPerMonth[i]} onChange={e => updateDaysForMonth(i, parseInt(e.target.value) || 1)} min={1} max={999} className="px-1 py-0.5 text-[10px]" style={{ ...numInput, width: 42 }} title="Days in month" />
                          <span className="text-[8px]" style={S_DIM}>days</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: Start/End points + Labels */}
                <div>
                  <div style={sectionLabel}>Start Point</div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] w-12 shrink-0" style={{ color: "#6A7A9A" }}>Year:</span>
                    <input type="number" value={cal.startYear} onChange={e => updateCal({ startYear: parseInt(e.target.value) || 0 })} className="px-2 py-1 text-[11px]" style={numInput} />
                    <span className="text-[10px] w-12 shrink-0" style={{ color: "#6A7A9A" }}>Month:</span>
                    <select value={cal.startMonth} onChange={e => updateCal({ startMonth: parseInt(e.target.value) })} className="flex-1 px-1 py-1 text-[10px]" style={inputStyle}>
                      {cal.monthNames.slice(0, cal.monthsPerYear).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] w-12 shrink-0" style={{ color: "#6A7A9A" }}>Day:</span>
                    <input type="number" value={cal.startDay} onChange={e => updateCal({ startDay: parseInt(e.target.value) || 1 })} min={1} max={cal.daysPerMonth[cal.startMonth - 1] || 30} className="px-2 py-1 text-[11px]" style={numInput} />
                  </div>

                  <div style={sectionLabel}>End Point</div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] w-12 shrink-0" style={{ color: "#6A7A9A" }}>Year:</span>
                    <input type="number" value={cal.endYear} onChange={e => updateCal({ endYear: parseInt(e.target.value) || 0 })} className="px-2 py-1 text-[11px]" style={numInput} />
                    <span className="text-[10px] w-12 shrink-0" style={{ color: "#6A7A9A" }}>Month:</span>
                    <select value={cal.endMonth} onChange={e => updateCal({ endMonth: parseInt(e.target.value) })} className="flex-1 px-1 py-1 text-[10px]" style={inputStyle}>
                      {cal.monthNames.slice(0, cal.monthsPerYear).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] w-12 shrink-0" style={{ color: "#6A7A9A" }}>Day:</span>
                    <input type="number" value={cal.endDay} onChange={e => updateCal({ endDay: parseInt(e.target.value) || 1 })} min={1} max={cal.daysPerMonth[cal.endMonth - 1] || 30} className="px-2 py-1 text-[11px]" style={numInput} />
                  </div>

                  <div style={sectionLabel}>Starting Zoom Level</div>
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {RESOLUTION_ORDER.map(r => (
                      <button
                        key={r}
                        onClick={() => updateCal({ defaultResolution: r })}
                        className={`${retro.button} text-[9px] px-2 py-1 transition-colors`}
                        style={{
                          color: (cal.defaultResolution || calAutoResolution(cal)) === r ? "#C0D0F0" : "#4A5A7A",
                          background: (cal.defaultResolution || calAutoResolution(cal)) === r ? "#1A1A50" : "transparent",
                          border: `1px solid ${(cal.defaultResolution || calAutoResolution(cal)) === r ? "#3A3A8B" : "#1A1A4B"}`,
                        }}
                      >
                        {RESOLUTION_LABELS[r]}
                      </button>
                    ))}
                    <button
                      onClick={() => updateCal({ defaultResolution: undefined })}
                      className={`${retro.button} text-[9px] px-2 py-1 transition-colors`}
                      style={{
                        color: !cal.defaultResolution ? "#6ACA8A" : "#3A4A6A",
                        border: `1px solid ${!cal.defaultResolution ? "#2A4A3A" : "#1A1A4B"}`,
                      }}
                      title="Auto-detect based on date span"
                    >
                      Auto
                    </button>
                  </div>

                  <div style={sectionLabel}>Display Labels (Override)</div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] w-12 shrink-0" style={{ color: "#6A7A9A" }}>Start:</span>
                      <input value={laneSpanStart} onChange={e => setLaneSpanStart(e.target.value)} placeholder={formatLabel(cal.startYear, cal.startMonth, cal.startDay)} className="flex-1 px-2 py-1 text-[11px]" style={inputStyle} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] w-12 shrink-0" style={{ color: "#6A7A9A" }}>End:</span>
                      <input value={laneSpanEnd} onChange={e => setLaneSpanEnd(e.target.value)} placeholder={formatLabel(cal.endYear, cal.endMonth, cal.endDay)} className="flex-1 px-2 py-1 text-[11px]" style={inputStyle} />
                    </div>
                    <p className="text-[8px] mt-0.5" style={S_DIM}>Leave blank to auto-generate from calendar points above.</p>
                  </div>
                </div>
              </div>

              {calendarSaveErrors.length > 0 && (
                <div className="mx-4 mb-3 p-2.5 rounded" style={{ background: "#2A0A0A", border: "1px solid #5A2020" }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle size={11} style={S_RED} />
                    <span className="text-[10px] font-semibold" style={S_RED}>Cannot save — fix the following:</span>
                  </div>
                  {calendarSaveErrors.map((err, i) => (
                    <div key={i} className="text-[10px] ml-5 mb-0.5" style={{ color: "#E08080" }}>{err}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {editingErasLaneId === lane.id && isDM && (
          <div style={{ background: "#0C0828", borderBottom: `1px solid ${lane.color}15` }}>
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${lane.color}08` }}>
              <Palette size={12} style={{ color: "#BB7AFF" }} />
              <span className="text-[11px] font-semibold flex-1" style={S_TEXT}>Era Editor</span>
              {lane.calendar && (
                <button
                  onClick={() => setEraSnapEnabled(!eraSnapEnabled)}
                  className={`${retro.button} text-[9px] px-2 py-1 flex items-center gap-1`}
                  style={{ color: eraSnapEnabled ? "#6ACA8A" : "#4A5A7A", border: `1px solid ${eraSnapEnabled ? "#2A4A3A" : "#1A1A4B"}` }}
                  title={eraSnapEnabled ? "Calendar snapping ON — eras snap to year/month boundaries" : "Calendar snapping OFF"}
                >
                  <Magnet size={9} /> Snap {eraSnapEnabled ? "ON" : "OFF"}
                </button>
              )}
              <button
                onClick={() => setEraClickThrough(!eraClickThrough)}
                className={`${retro.button} text-[9px] px-2 py-1 flex items-center gap-1`}
                style={{ color: eraClickThrough ? "#6A9AFF" : "#4A5A7A", border: `1px solid ${eraClickThrough ? "#2A3A6A" : "#1A1A4B"}` }}
                title={eraClickThrough ? "Click-through ON — clicks pass through eras to events below" : "Click-through OFF — eras capture clicks"}
              >
                <MousePointer2 size={9} /> Pass-thru {eraClickThrough ? "ON" : "OFF"}
              </button>
              <button onClick={() => addEra(bookId, lane.id)} className={`${retro.button} text-[10px] px-2.5 py-1 flex items-center gap-1.5`} style={{ color: "#4ACA6A" }}>
                <Plus size={10} /> Add Era
              </button>
              <button onClick={() => { setEditingErasLaneId(null); setSelectedEraId(null); setCreatingEraOnTrack(null); }} className={`${retro.button} text-[10px] px-2 py-1`} style={S_RED}>
                <X size={10} />
              </button>
            </div>

            <div className="px-4 py-3">
              <div
                className="relative rounded-md overflow-hidden mb-3 cursor-crosshair"
                style={{ height: 36, background: "#06061C", border: "1px solid #1A1A4B" }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                  let snappedPct = Math.round(pct * 10) / 10;
                  if (eraSnapEnabled && lane.calendar) {
                    snappedPct = snapToNearest(snappedPct, getCalendarSnapPoints(lane), 3);
                  }
                  if (creatingEraOnTrack && creatingEraOnTrack.bookId === bookId && creatingEraOnTrack.laneId === lane.id) {
                    const lastEra = (lane.eras || [])[(lane.eras || []).length - 1];
                    if (lastEra) {
                      const startP = Math.min(lastEra.startPct, snappedPct);
                      const endP = Math.max(lastEra.startPct, snappedPct);
                      updateEra(bookId, lane.id, lastEra.id, { startPct: startP, endPct: Math.max(endP, startP + 1) });
                    }
                    setCreatingEraOnTrack(null);
                  } else {
                    const newEra: TimelineEra = { id: uid(), name: "New Era", color: ERA_PALETTE[Math.floor(Math.random() * ERA_PALETTE.length)], startPct: snappedPct, endPct: snappedPct };
                    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bookId ? { ...b, lanes: b.lanes.map(l => l.id === lane.id ? { ...l, eras: [...(l.eras || []), newEra] } : l) } : b) }));
                    setCreatingEraOnTrack({ bookId, laneId: lane.id });
                    setSelectedEraId(newEra.id);
                  }
                }}
              >
                {(lane.eras || []).map(era => (
                  <div
                    key={era.id}
                    className="absolute top-0 bottom-0"
                    style={{
                      left: `${era.startPct}%`,
                      width: `${Math.max(0, era.endPct - era.startPct)}%`,
                      background: `linear-gradient(180deg, ${era.color}30, ${era.color}15)`,
                      borderLeft: `2px solid ${era.color}${selectedEraId === era.id ? "80" : "40"}`,
                      borderRight: `2px solid ${era.color}${selectedEraId === era.id ? "80" : "40"}`,
                      cursor: "pointer",
                      zIndex: selectedEraId === era.id ? 2 : 1,
                    }}
                    onClick={(e) => { e.stopPropagation(); setSelectedEraId(selectedEraId === era.id ? null : era.id); setCreatingEraOnTrack(null); }}
                  >
                    <div className={`absolute inset-0 flex items-center ${(era.nameAlign || "left") === "center" ? "justify-center" : (era.nameAlign || "left") === "right" ? "justify-end" : "justify-start"}`}>
                      <span className="font-semibold truncate px-1" style={{ color: era.color + "CC", fontSize: era.nameFontSize || 8, fontFamily: era.nameFont || "inherit" }}>{era.name}</span>
                    </div>
                  </div>
                ))}
                {creatingEraOnTrack && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[9px] animate-pulse" style={{ color: "#6ACA8A" }}>Click to set end point...</span>
                  </div>
                )}
                <div className="absolute top-0 left-0 bottom-0 w-px" style={{ background: `${lane.color}20` }} />
                <div className="absolute top-0 right-0 bottom-0 w-px" style={{ background: `${lane.color}20` }} />
                {[10,20,30,40,50,60,70,80,90].map(p => (
                  <div key={p} className="absolute top-0 bottom-0" style={{ left: `${p}%`, width: 1, background: `${lane.color}08` }} />
                ))}
              </div>

              <div className="text-[8px] mb-3 flex items-center gap-3" style={S_DIM}>
                <span>Click the bar above to place eras (two clicks: start → end)</span>
                <span>·</span>
                <span>Drag handles on the track below to resize</span>
                {lane.calendar && eraSnapEnabled && (
                  <span style={DISPLAY_CONTENTS}>
                    <span>·</span>
                    <span style={{ color: "#4A8A5A" }}>Snapping to calendar boundaries</span>
                  </span>
                )}
                {eraClickThrough && (
                  <span style={DISPLAY_CONTENTS}>
                    <span>·</span>
                    <span style={S_LINK}>Click-through enabled (events clickable)</span>
                  </span>
                )}
              </div>

              {(!lane.eras || lane.eras.length === 0) ? (
                <div className="text-center py-3">
                  <RectangleHorizontal size={18} style={{ color: "#1A1A4B", margin: "0 auto 4px" }} />
                  <p className="text-[10px]" style={S_DIM}>Click the bar above to create your first era</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(lane.eras || []).map(era => {
                    const isSelected = selectedEraId === era.id;
                    return (
                      <div key={era.id}>
                        <div
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded cursor-pointer transition-all"
                          style={{
                            background: isSelected ? "#0C0C30" : "#08081E",
                            border: `1px solid ${isSelected ? era.color + "40" : "#1A1A4B"}`,
                            boxShadow: isSelected ? `0 0 8px ${era.color}10` : "none",
                          }}
                          onClick={() => setSelectedEraId(isSelected ? null : era.id)}
                        >
                          <div className="w-3.5 h-3.5 rounded shrink-0" style={{ background: era.color, boxShadow: `0 0 6px ${era.color}30` }} />
                          <span className="text-[11px] font-semibold flex-1 truncate" style={{ color: isSelected ? era.color : "#8A9ABB" }}>{era.name}</span>
                          <span className="text-[8px] tabular-nums shrink-0" style={{ color: "#4A5A7A" }}>
                            {lane.calendar
                              ? `${pctToCalLabel(era.startPct, lane.calendar)} → ${pctToCalLabel(era.endPct, lane.calendar)}`
                              : `${era.startPct.toFixed(1)}% → ${era.endPct.toFixed(1)}%`
                            }
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); deleteEra(bookId, lane.id, era.id); if (isSelected) setSelectedEraId(null); }} className="p-0.5 hover:opacity-70 shrink-0" style={{ color: "#FF5A5A" }}>
                            <Trash2 size={9} />
                          </button>
                        </div>
                        {isSelected && (
                          <div className="ml-5 mt-1.5 mb-1 p-2.5 rounded space-y-2" style={{ background: "#08081C", border: `1px solid ${era.color}20` }}>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] w-12 shrink-0" style={S_MUTED}>Name:</span>
                              <input
                                value={era.name}
                                onChange={e => updateEra(bookId, lane.id, era.id, { name: e.target.value })}
                                className="flex-1 px-2 py-1 text-[11px]"
                                style={inputStyle}
                                placeholder="Era name..."
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                            {lane.calendar ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] w-12 shrink-0" style={S_MUTED}>Range:</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!era.useDateRange && lane.calendar) {
                                        const startD = calPctToDate(lane.calendar, era.startPct);
                                        const endD = calPctToDate(lane.calendar, era.endPct);
                                        updateEra(bookId, lane.id, era.id, { useDateRange: true, startYear: startD.year, startMonth: startD.month, startDay: startD.day, endYear: endD.year, endMonth: endD.month, endDay: endD.day });
                                      } else {
                                        updateEra(bookId, lane.id, era.id, { useDateRange: false });
                                      }
                                    }}
                                    className={`${retro.button} text-[8px] px-2 py-0.5`}
                                    style={{ color: era.useDateRange ? "#6ACA8A" : "#5A6A8A", border: `1px solid ${era.useDateRange ? "#2A4A3A" : "#1A1A4B"}` }}
                                  >
                                    <Calendar size={8} className="inline mr-1" />
                                    {era.useDateRange ? "Calendar Dates" : "Percentage"}
                                  </button>
                                </div>
                                {era.useDateRange ? (
                                  <div className="space-y-1.5 ml-14">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[8px] w-8 shrink-0" style={{ color: "#4A6A7A" }}>From:</span>
                                      <select
                                        value={era.startMonth || 1}
                                        onChange={e => {
                                          const m = parseInt(e.target.value);
                                          const newPct = calDateToPct(lane.calendar!, era.startYear || lane.calendar!.startYear, m, era.startDay || 1);
                                          updateEra(bookId, lane.id, era.id, { startMonth: m, startPct: Math.round(newPct * 100) / 100 });
                                        }}
                                        className="px-1 py-0.5 text-[9px] rounded"
                                        style={inputStyle}
                                        onClick={e => e.stopPropagation()}
                                      >
                                        {lane.calendar!.monthNames.slice(0, lane.calendar!.monthsPerYear).map((mn, i) => (
                                          <option key={i} value={i + 1}>{mn}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="number"
                                        value={era.startDay || 1}
                                        onChange={e => {
                                          const d = Math.max(1, parseInt(e.target.value) || 1);
                                          const newPct = calDateToPct(lane.calendar!, era.startYear || lane.calendar!.startYear, era.startMonth || 1, d);
                                          updateEra(bookId, lane.id, era.id, { startDay: d, startPct: Math.round(newPct * 100) / 100 });
                                        }}
                                        className="px-1 py-0.5 text-[9px]"
                                        style={{ ...inputStyle, width: 36, textAlign: "center" as const }}
                                        onClick={e => e.stopPropagation()}
                                      />
                                      <span className="text-[8px]" style={S_DIM}>{lane.calendar!.yearLabel}</span>
                                      <input
                                        type="number"
                                        value={era.startYear || lane.calendar!.startYear}
                                        onChange={e => {
                                          const y = parseInt(e.target.value) || lane.calendar!.startYear;
                                          const newPct = calDateToPct(lane.calendar!, y, era.startMonth || 1, era.startDay || 1);
                                          updateEra(bookId, lane.id, era.id, { startYear: y, startPct: Math.round(newPct * 100) / 100 });
                                        }}
                                        className="px-1 py-0.5 text-[9px]"
                                        style={{ ...inputStyle, width: 50, textAlign: "center" as const }}
                                        onClick={e => e.stopPropagation()}
                                      />
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[8px] w-8 shrink-0" style={{ color: "#4A6A7A" }}>To:</span>
                                      <select
                                        value={era.endMonth || 1}
                                        onChange={e => {
                                          const m = parseInt(e.target.value);
                                          const newPct = calDateToPct(lane.calendar!, era.endYear || lane.calendar!.endYear, m, era.endDay || 1);
                                          updateEra(bookId, lane.id, era.id, { endMonth: m, endPct: Math.round(newPct * 100) / 100 });
                                        }}
                                        className="px-1 py-0.5 text-[9px] rounded"
                                        style={inputStyle}
                                        onClick={e => e.stopPropagation()}
                                      >
                                        {lane.calendar!.monthNames.slice(0, lane.calendar!.monthsPerYear).map((mn, i) => (
                                          <option key={i} value={i + 1}>{mn}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="number"
                                        value={era.endDay || 1}
                                        onChange={e => {
                                          const d = Math.max(1, parseInt(e.target.value) || 1);
                                          const newPct = calDateToPct(lane.calendar!, era.endYear || lane.calendar!.endYear, era.endMonth || 1, d);
                                          updateEra(bookId, lane.id, era.id, { endDay: d, endPct: Math.round(newPct * 100) / 100 });
                                        }}
                                        className="px-1 py-0.5 text-[9px]"
                                        style={{ ...inputStyle, width: 36, textAlign: "center" as const }}
                                        onClick={e => e.stopPropagation()}
                                      />
                                      <span className="text-[8px]" style={S_DIM}>{lane.calendar!.yearLabel}</span>
                                      <input
                                        type="number"
                                        value={era.endYear || lane.calendar!.endYear}
                                        onChange={e => {
                                          const y = parseInt(e.target.value) || lane.calendar!.endYear;
                                          const newPct = calDateToPct(lane.calendar!, y, era.endMonth || 1, era.endDay || 1);
                                          updateEra(bookId, lane.id, era.id, { endYear: y, endPct: Math.round(newPct * 100) / 100 });
                                        }}
                                        className="px-1 py-0.5 text-[9px]"
                                        style={{ ...inputStyle, width: 50, textAlign: "center" as const }}
                                        onClick={e => e.stopPropagation()}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 ml-14">
                                    <input
                                      type="number"
                                      value={era.startPct}
                                      onChange={e => updateEra(bookId, lane.id, era.id, { startPct: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                                      className="px-1 py-1 text-[10px]"
                                      style={{ ...inputStyle, width: 50, textAlign: "center" as const }}
                                      min={0} max={100} step={0.1}
                                      onClick={e => e.stopPropagation()}
                                    />
                                    <span className="text-[8px]" style={S_DIM}>% →</span>
                                    <input
                                      type="number"
                                      value={era.endPct}
                                      onChange={e => updateEra(bookId, lane.id, era.id, { endPct: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                                      className="px-1 py-1 text-[10px]"
                                      style={{ ...inputStyle, width: 50, textAlign: "center" as const }}
                                      min={0} max={100} step={0.1}
                                      onClick={e => e.stopPropagation()}
                                    />
                                    <span className="text-[8px]" style={S_DIM}>%</span>
                                    <span className="text-[8px] ml-1" style={{ color: "#4A6A7A" }}>
                                      <Calendar size={7} className="inline mr-0.5" />
                                      {pctToCalLabel(era.startPct, lane.calendar!)} — {pctToCalLabel(era.endPct, lane.calendar!)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] w-12 shrink-0" style={S_MUTED}>Range:</span>
                                <input
                                  type="number"
                                  value={era.startPct}
                                  onChange={e => updateEra(bookId, lane.id, era.id, { startPct: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                                  className="px-1 py-1 text-[10px]"
                                  style={{ ...inputStyle, width: 50, textAlign: "center" as const }}
                                  min={0} max={100} step={0.1}
                                  onClick={e => e.stopPropagation()}
                                />
                                <span className="text-[8px]" style={S_DIM}>% →</span>
                                <input
                                  type="number"
                                  value={era.endPct}
                                  onChange={e => updateEra(bookId, lane.id, era.id, { endPct: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                                  className="px-1 py-1 text-[10px]"
                                  style={{ ...inputStyle, width: 50, textAlign: "center" as const }}
                                  min={0} max={100} step={0.1}
                                  onClick={e => e.stopPropagation()}
                                />
                                <span className="text-[8px]" style={S_DIM}>%</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] w-12 shrink-0" style={S_MUTED}>Align:</span>
                              <div className="flex items-center rounded overflow-hidden" style={{ border: "1px solid #1A1A4B", background: "#06061C" }}>
                                {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as [EraNameAlign, typeof AlignLeft][]).map(([val, Icon]) => (
                                  <button
                                    key={val}
                                    onClick={(e) => { e.stopPropagation(); updateEra(bookId, lane.id, era.id, { nameAlign: val }); }}
                                    className="px-2 py-1 hover:bg-[#12123A] transition-colors"
                                    style={{
                                      color: (era.nameAlign || "left") === val ? era.color : "#4A5A7A",
                                      background: (era.nameAlign || "left") === val ? "#0E0E35" : "transparent",
                                      borderRight: val !== "right" ? "1px solid #1A1A4B" : "none",
                                    }}
                                    title={`Align ${val}`}
                                  >
                                    <Icon size={10} />
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] w-12 shrink-0" style={S_MUTED}>Font:</span>
                              <select
                                value={era.nameFont || ""}
                                onChange={e => { e.stopPropagation(); updateEra(bookId, lane.id, era.id, { nameFont: e.target.value }); }}
                                className="flex-1 px-1.5 py-1 text-[10px] rounded"
                                style={inputStyle}
                                onClick={e => e.stopPropagation()}
                              >
                                {ERA_FONTS.map(f => (
                                  <option key={f.label} value={f.value}>{f.label}</option>
                                ))}
                              </select>
                              <span className="text-[9px] shrink-0 ml-1" style={S_MUTED}>Size:</span>
                              <div className="flex items-center rounded overflow-hidden" style={{ border: "1px solid #1A1A4B", background: "#06061C" }}>
                                {ERA_FONT_SIZES.map((s, si) => (
                                  <button
                                    key={s.value}
                                    onClick={(e) => { e.stopPropagation(); updateEra(bookId, lane.id, era.id, { nameFontSize: s.value }); }}
                                    className="px-1.5 py-0.5 text-[8px] hover:bg-[#12123A] transition-colors"
                                    style={{
                                      color: (era.nameFontSize || 7) === s.value ? era.color : "#4A5A7A",
                                      background: (era.nameFontSize || 7) === s.value ? "#0E0E35" : "transparent",
                                      borderRight: si < ERA_FONT_SIZES.length - 1 ? "1px solid #1A1A4B" : "none",
                                    }}
                                  >
                                    {s.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {(era.nameFont || era.nameFontSize) && (
                              <div className="flex items-center gap-2 ml-14">
                                <Type size={8} style={S_DIM} />
                                <span
                                  className="uppercase tracking-wider"
                                  style={{
                                    color: era.color + "88",
                                    fontFamily: era.nameFont || "inherit",
                                    fontSize: era.nameFontSize || 7,
                                  }}
                                >
                                  {era.name || "Preview"}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] shrink-0" style={S_MUTED}>Color:</span>
                              {ERA_PALETTE.map(c => (
                                <button
                                  key={c}
                                  onClick={(e) => { e.stopPropagation(); updateEra(bookId, lane.id, era.id, { color: c }); }}
                                  className="rounded-full transition-transform hover:scale-125"
                                  style={{ width: 12, height: 12, background: c, border: era.color === c ? "2px solid #fff" : "1px solid transparent", boxShadow: `0 0 3px ${c}30` }}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {!lane.collapsed && (
          <div className="relative px-4 py-4">
            {/* Timespan labels + resolution controls */}
            {(lane.startLabel || lane.endLabel || hasCal) && (
              <div className="flex justify-between items-center mb-2 px-4">
                <div className="flex items-center gap-2">
                  {lane.startLabel ? (
                    <span className="text-[9px] font-semibold tracking-wide flex items-center gap-1.5" style={{ color: lane.color + "AA" }}>
                      <svg width={8} height={8} viewBox="0 0 8 8" style={{ opacity: 0.6 }}><polygon points="0,4 4,0 8,4 4,8" fill={lane.color} fillOpacity="0.4" stroke={lane.color} strokeWidth="0.5" /></svg>
                      {lane.startLabel}
                    </span>
                  ) : <span />}
                </div>
                {hasCal && resolution && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] uppercase tracking-wide font-semibold" style={S_DIM}>Scale:</span>
                    <div className="flex items-center rounded overflow-hidden" style={{ border: "1px solid #1A1A4B", background: "#06061C" }}>
                      <button
                        onClick={() => changeResolution(lane.id, "out")}
                        disabled={RESOLUTION_ORDER.indexOf(resolution) === 0}
                        className="px-1.5 py-0.5 hover:bg-[#12123A] transition-colors"
                        style={{ color: RESOLUTION_ORDER.indexOf(resolution) === 0 ? "#1A2A4A" : "#7A8AAA", borderRight: "1px solid #1A1A4B" }}
                        title="Zoom out (larger time units)"
                      >
                        <ZoomOut size={9} />
                      </button>
                      <span className="text-[8px] px-2 py-0.5 tabular-nums font-semibold" style={{ color: lane.color + "BB", minWidth: 56, textAlign: "center" }}>
                        {RESOLUTION_LABELS[resolution]}
                      </span>
                      <button
                        onClick={() => changeResolution(lane.id, "in")}
                        disabled={RESOLUTION_ORDER.indexOf(resolution) === RESOLUTION_ORDER.length - 1}
                        className="px-1.5 py-0.5 hover:bg-[#12123A] transition-colors"
                        style={{ color: RESOLUTION_ORDER.indexOf(resolution) === RESOLUTION_ORDER.length - 1 ? "#1A2A4A" : "#7A8AAA", borderLeft: "1px solid #1A1A4B" }}
                        title="Zoom in (smaller time units)"
                      >
                        <ZoomIn size={9} />
                      </button>
                    </div>
                    {hasCal && lane.calendar && (
                      <span className="text-[8px]" style={S_DIM}>
                        {calTotalDaysInSpan(lane.calendar).toLocaleString()} days
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {lane.endLabel ? (
                    <span className="text-[9px] font-semibold tracking-wide flex items-center gap-1.5" style={{ color: lane.color + "AA" }}>
                      {lane.endLabel}
                      <svg width={8} height={8} viewBox="0 0 8 8" style={{ opacity: 0.6 }}><polygon points="0,4 4,0 8,4 4,8" fill={lane.color} fillOpacity="0.4" stroke={lane.color} strokeWidth="0.5" /></svg>
                    </span>
                  ) : <span />}
                </div>
              </div>
            )}
            {sortedEvents.length === 0 && !hasCal ? (
              <div className="text-center py-8">
                <Waypoints size={24} style={{ color: "#1A1A4B", margin: "0 auto 8px" }} />
                <p className="text-[11px]" style={{ color: "#2A3A5A" }}>No events yet{isDM && " — click + to add one"}</p>
              </div>
            ) : (
              <div className="relative overflow-x-auto pb-1 timeline-scrollbar" data-track-scroll>
                <div className="relative" style={{ minWidth: trackMinWidth, height: trackHeight }}>
                  {(lane.eras || []).map(era => {
                    const isEditing = editingErasLaneId === lane.id;
                    const isSelected = selectedEraId === era.id;
                    return (
                      <div key={era.id} style={DISPLAY_CONTENTS}>
                        <div
                          className="absolute top-0 bottom-0"
                          style={{
                            left: `${era.startPct}%`,
                            width: `${Math.max(0, era.endPct - era.startPct)}%`,
                            background: `linear-gradient(180deg, ${era.color}${isSelected ? "1C" : "12"}, ${era.color}08 40%, ${era.color}05 80%, transparent)`,
                            borderLeft: `1px solid ${era.color}${isSelected ? "40" : "20"}`,
                            borderRight: `1px solid ${era.color}${isSelected ? "40" : "20"}`,
                            pointerEvents: (isEditing && !eraClickThrough) ? "auto" : "none",
                            zIndex: isSelected ? 2 : 0,
                            cursor: (isEditing && !eraClickThrough) ? "pointer" : "default",
                            transition: "border-color 0.15s",
                          }}
                          onClick={isEditing ? (e) => { e.stopPropagation(); setSelectedEraId(isSelected ? null : era.id); } : undefined}
                        >
                          <div
                            className={`absolute top-1 whitespace-nowrap font-semibold uppercase tracking-wider ${(era.nameAlign || "left") === "center" ? "left-0 right-0 text-center" : (era.nameAlign || "left") === "right" ? "right-2 text-right" : "left-2"}`}
                            style={{
                              color: era.color + (isSelected ? "AA" : "66"),
                              textShadow: `0 0 8px ${era.color}20`,
                              fontSize: era.nameFontSize || 7,
                              fontFamily: era.nameFont || "inherit",
                            }}
                          >
                            {era.name}
                          </div>
                          <div
                            className="absolute bottom-0 left-0 right-0"
                            style={{ height: 1, background: `linear-gradient(90deg, ${era.color}25, ${era.color}08)` }}
                          />
                        </div>
                        <div
                          className="absolute"
                          style={{
                            left: `${era.startPct}%`,
                            top: 0,
                            bottom: 0,
                            width: 1,
                            background: `linear-gradient(180deg, ${era.color}50, ${era.color}20 70%, ${era.color}08)`,
                            pointerEvents: "none",
                            zIndex: 1,
                          }}
                        >
                          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2" style={{ pointerEvents: "none" }}>
                            <svg width={8} height={8} viewBox="0 0 8 8">
                              <polygon points="4,0 8,4 4,8 0,4" fill={era.color} fillOpacity={0.35} stroke={era.color} strokeWidth={0.6} strokeOpacity={0.5} />
                            </svg>
                          </div>
                          <div className="absolute top-2 left-1 whitespace-nowrap text-[6px] font-semibold" style={{ color: era.color + "70", letterSpacing: "0.03em" }}>
                            {lane.calendar ? pctToCalLabel(era.startPct, lane.calendar) : `${era.startPct.toFixed(0)}%`}
                          </div>
                        </div>
                        <div
                          className="absolute"
                          style={{
                            left: `${era.endPct}%`,
                            top: 0,
                            bottom: 0,
                            width: 1,
                            background: `linear-gradient(180deg, ${era.color}50, ${era.color}20 70%, ${era.color}08)`,
                            pointerEvents: "none",
                            zIndex: 1,
                          }}
                        >
                          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2" style={{ pointerEvents: "none" }}>
                            <svg width={8} height={8} viewBox="0 0 8 8">
                              <polygon points="4,0 8,4 4,8 0,4" fill={era.color} fillOpacity={0.35} stroke={era.color} strokeWidth={0.6} strokeOpacity={0.5} />
                            </svg>
                          </div>
                          <div className="absolute top-2 right-1 whitespace-nowrap text-[6px] font-semibold text-right" style={{ color: era.color + "70", letterSpacing: "0.03em" }}>
                            {lane.calendar ? pctToCalLabel(era.endPct, lane.calendar) : `${era.endPct.toFixed(0)}%`}
                          </div>
                        </div>
                        {isEditing && isDM && !eraClickThrough && (
                          <div style={DISPLAY_CONTENTS}>
                            <div
                              className="absolute cursor-ew-resize group/handle"
                              style={{
                                left: `${era.startPct}%`,
                                top: 0,
                                bottom: 0,
                                width: 10,
                                transform: "translateX(-5px)",
                                zIndex: 5,
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                const trackEl = e.currentTarget.parentElement;
                                if (!trackEl) return;
                                const rect = trackEl.getBoundingClientRect();
                                setDraggingEra({ bookId, laneId: lane.id, eraId: era.id, edge: "start", trackLeft: rect.left, trackWidth: rect.width });
                              }}
                            >
                              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] rounded-full opacity-0 group-hover/handle:opacity-100 transition-opacity" style={{ background: era.color, boxShadow: `0 0 8px ${era.color}60` }} />
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/handle:opacity-100 transition-opacity">
                                <GripVertical size={10} style={{ color: era.color }} />
                              </div>
                            </div>
                            <div
                              className="absolute cursor-ew-resize group/handle"
                              style={{
                                left: `${era.endPct}%`,
                                top: 0,
                                bottom: 0,
                                width: 10,
                                transform: "translateX(-5px)",
                                zIndex: 5,
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                const trackEl = e.currentTarget.parentElement;
                                if (!trackEl) return;
                                const rect = trackEl.getBoundingClientRect();
                                setDraggingEra({ bookId, laneId: lane.id, eraId: era.id, edge: "end", trackLeft: rect.left, trackWidth: rect.width });
                              }}
                            >
                              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] rounded-full opacity-0 group-hover/handle:opacity-100 transition-opacity" style={{ background: era.color, boxShadow: `0 0 8px ${era.color}60` }} />
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/handle:opacity-100 transition-opacity">
                                <GripVertical size={10} style={{ color: era.color }} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {renderTimelineRail(lane.color, sortedEvents.length, !!(lane.startLabel || lane.endLabel))}

                  {hasCal && lane.calendar && resolution && renderCalendarRuler(lane.calendar, resolution, lane.color, trackMinWidth)}

                  {sortedEvents.map((event, idx) => {
                    const xPos = sortedEvents.length === 1 ? 50 : 4 + (idx / (sortedEvents.length - 1)) * (100 - 8);
                    const cat = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.custom;
                    return (
                      <div key={event.id + "-marker"} style={DISPLAY_CONTENTS}>
                        {renderRailMarker(xPos, lane.color, cat.color, selectedEventId === event.id)}
                      </div>
                    );
                  })}

                  {sortedEvents.map((event, idx) => {
                    const xPos = sortedEvents.length === 1 ? 50 : 4 + (idx / (sortedEvents.length - 1)) * (100 - 8);
                    return renderEventNode(event, xPos, lane.color, lane.id);
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // Consolidated View
  // ═══════════════════════════���═══════════════
  const renderConsolidatedView = () => {
    if (!activeBook || activeBook.lanes.length === 0) return null;
    const allEvents: { event: TimelineEvent; laneId: string; laneName: string; laneColor: string }[] = [];
    for (const lane of activeBook.lanes) for (const event of lane.events) allEvents.push({ event, laneId: lane.id, laneName: lane.name, laneColor: lane.color });
    allEvents.sort((a, b) => (a.event.sortIndex ?? 0) - (b.event.sortIndex ?? 0));

    const nodeWidth = 160 * zoomLevel;
    const trackMinWidth = Math.max(allEvents.length * nodeWidth, 400);
    const trackHeight = RAIL_Y + 55;

    return (
      <div className="mb-4" style={{ background: "#050510", border: "1px solid #1A1A45", borderRadius: 8, overflow: "hidden", boxShadow: "inset 0 1px 4px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.02)" }}>
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: "1px solid #1A1A4B", background: "linear-gradient(90deg, rgba(91,140,255,0.04), transparent)" }}>
          <Eye size={13} style={{ color: "#5B8CFF" }} />
          <span className="text-[13px] font-semibold" style={{ color: "#D0E0FF" }}>Consolidated — {activeBook.name}</span>
          <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ color: "#5A6A8A", background: "#0A0A2A" }}>
            {allEvents.length} event{allEvents.length !== 1 ? "s" : ""} · {activeBook.lanes.length} lane{activeBook.lanes.length !== 1 ? "s" : ""}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            {activeBook.lanes.map(lane => (
              <span key={lane.id} className="text-[9px] flex items-center gap-1.5" style={{ color: lane.color }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: lane.color, boxShadow: `0 0 4px ${lane.color}40` }} />
                {lane.name}
              </span>
            ))}
          </div>
        </div>
        <div className="relative px-4 py-4">
          {allEvents.length === 0 ? (
            <div className="text-center py-8"><p className="text-[11px]" style={{ color: "#2A3A5A" }}>No events across any timeline</p></div>
          ) : (
            <div className="relative overflow-x-auto pb-1 timeline-scrollbar" data-track-scroll>
              <div className="relative" style={{ minWidth: trackMinWidth, height: trackHeight }}>
                {/* Decorative consolidated rail */}
                {renderTimelineRail("#6A7AAA", allEvents.length, false)}

                {/* Lane-colored rail markers at each event */}
                {allEvents.map((item, idx) => {
                  const xPos = allEvents.length === 1 ? 50 : 4 + (idx / (allEvents.length - 1)) * (100 - 8);
                  const cat = CATEGORY_CONFIG[item.event.category] || CATEGORY_CONFIG.custom;
                  return (
                    <div key={item.event.id + "-seg"} style={DISPLAY_CONTENTS}>
                      {renderRailMarker(xPos, item.laneColor, cat.color, selectedEventId === item.event.id)}
                    </div>
                  );
                })}

                {/* Event nodes */}
                {allEvents.map((item, idx) => {
                  const xPos = allEvents.length === 1 ? 50 : 4 + (idx / (allEvents.length - 1)) * (100 - 8);
                  return renderEventNode(item.event, xPos, item.laneColor, item.laneId);
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // Delete Confirmation Modal
  // ═══════════════════════════════════════════
  const renderDeleteConfirmModal = () => {
    if (!deleteConfirmLane) return null;
    const { bookId, laneId, laneName } = deleteConfirmLane;

    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
        onClick={e => { if (e.target === e.currentTarget) { setDeleteConfirmLane(null); setDeleteConfirmStep(1); setDeleteConfirmInput(""); } }}
      >
        <div style={{
          background: "linear-gradient(180deg, #1A0A0A 0%, #100808 100%)",
          border: "1px solid #4A1A1A",
          width: 420,
          borderRadius: 8,
          boxShadow: "0 16px 48px rgba(0,0,0,0.8), 0 0 40px rgba(255,50,50,0.08)",
        }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #3A1515", background: "rgba(255,50,50,0.03)", borderRadius: "8px 8px 0 0" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#FF5A5A15", border: "1px solid #FF5A5A30" }}>
                <Trash2 size={15} style={{ color: "#FF5A5A" }} />
              </div>
              <span className="text-[14px] font-bold" style={{ color: "#FFA0A0" }}>
                {deleteConfirmStep === 1 ? "Delete Timeline?" : "Confirm Deletion"}
              </span>
            </div>
            <button onClick={() => { setDeleteConfirmLane(null); setDeleteConfirmStep(1); setDeleteConfirmInput(""); }} className="hover:opacity-80">
              <X size={14} style={{ color: "#5A3A3A" }} />
            </button>
          </div>

          <div className="p-5">
            {deleteConfirmStep === 1 ? (
              <div style={DISPLAY_CONTENTS}>
                <p className="text-[12px] mb-4 leading-relaxed" style={{ color: "#C09090" }}>
                  Are you sure you want to delete the timeline{" "}
                  <span style={{ color: "#FFAAAA", fontWeight: 700 }}>"{laneName}"</span>
                  {" "}and all its events? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setDeleteConfirmLane(null); setDeleteConfirmStep(1); setDeleteConfirmInput(""); }}
                    className={`${retro.button} px-4 py-2 text-[11px]`}
                    style={{ color: "#8A6A6A" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setDeleteConfirmStep(2)}
                    className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-1.5`}
                    style={{ color: "#FF5A5A", background: "#2A0A0A", border: "1px solid #4A1A1A" }}
                  >
                    <AlertTriangle size={11} /> Yes, Delete
                  </button>
                </div>
              </div>
            ) : (
              <div style={DISPLAY_CONTENTS}>
                <p className="text-[12px] mb-2 leading-relaxed" style={{ color: "#C09090" }}>
                  Type the name of the timeline to confirm:
                </p>
                <div className="mb-1 px-3 py-1.5 rounded text-[11px] font-semibold select-all" style={{ background: "#1A0808", border: "1px solid #3A1515", color: "#FFAAAA" }}>
                  {laneName}
                </div>
                <input
                  autoFocus
                  value={deleteConfirmInput}
                  onChange={e => setDeleteConfirmInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && deleteConfirmInput === laneName) {
                      deleteLane(bookId, laneId);
                      setDeleteConfirmLane(null); setDeleteConfirmStep(1); setDeleteConfirmInput(""); setLaneMenuId(null);
                    }
                    if (e.key === "Escape") { setDeleteConfirmLane(null); setDeleteConfirmStep(1); setDeleteConfirmInput(""); }
                  }}
                  placeholder="Type timeline name here..."
                  className="w-full px-3 py-2.5 text-[12px] rounded mt-2 mb-4"
                  style={{ background: "#0A0505", border: `1px solid ${deleteConfirmInput === laneName ? "#4ACA6A40" : "#3A1515"}`, color: "#E0C0C0", outline: "none", transition: "border-color 0.2s" }}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setDeleteConfirmStep(1); setDeleteConfirmInput(""); }}
                    className={`${retro.button} px-3 py-2 text-[11px]`}
                    style={{ color: "#8A6A6A" }}
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      if (deleteConfirmInput === laneName) {
                        deleteLane(bookId, laneId);
                        setDeleteConfirmLane(null); setDeleteConfirmStep(1); setDeleteConfirmInput(""); setLaneMenuId(null);
                      }
                    }}
                    disabled={deleteConfirmInput !== laneName}
                    className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-1.5`}
                    style={{
                      color: deleteConfirmInput === laneName ? "#FF3030" : "#4A2020",
                      background: deleteConfirmInput === laneName ? "#3A0A0A" : "#1A0808",
                      border: `1px solid ${deleteConfirmInput === laneName ? "#6A2020" : "#2A1010"}`,
                      transition: "all 0.2s",
                    }}
                  >
                    <Trash2 size={11} /> Permanently Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDeleteBookModal = () => {
    if (!deleteConfirmBook) return null;
    const { bookId, bookName } = deleteConfirmBook;
    const book = data.books.find(b => b.id === bookId);
    const laneCount = book ? book.lanes.length : 0;
    const eventCount = book ? book.lanes.reduce((s, l) => s + l.events.length, 0) : 0;

    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
        onClick={e => { if (e.target === e.currentTarget) { setDeleteConfirmBook(null); setDeleteBookStep(1); setDeleteBookInput(""); } }}
      >
        <div style={{
          background: "linear-gradient(180deg, #1A0A0A 0%, #100808 100%)",
          border: "1px solid #4A1A1A",
          width: 440,
          borderRadius: 8,
          boxShadow: "0 16px 48px rgba(0,0,0,0.8), 0 0 40px rgba(255,50,50,0.08)",
        }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #3A1515", background: "rgba(255,50,50,0.03)", borderRadius: "8px 8px 0 0" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#FF5A5A15", border: "1px solid #FF5A5A30" }}>
                <BookOpen size={15} style={{ color: "#FF5A5A" }} />
              </div>
              <span className="text-[14px] font-bold" style={{ color: "#FFA0A0" }}>
                {deleteBookStep === 1 ? "Delete Book?" : "Confirm Book Deletion"}
              </span>
            </div>
            <button onClick={() => { setDeleteConfirmBook(null); setDeleteBookStep(1); setDeleteBookInput(""); }} className="hover:opacity-80">
              <X size={14} style={{ color: "#5A3A3A" }} />
            </button>
          </div>

          <div className="p-5">
            {deleteBookStep === 1 ? (
              <div style={DISPLAY_CONTENTS}>
                <p className="text-[12px] mb-3 leading-relaxed" style={{ color: "#C09090" }}>
                  Are you sure you want to delete the book{" "}
                  <span style={{ color: "#FFAAAA", fontWeight: 700 }}>"{bookName}"</span>
                  {" "}and everything inside it?
                </p>
                {(laneCount > 0 || eventCount > 0) && (
                  <div className="mb-4 p-2.5 rounded" style={{ background: "#1A0808", border: "1px solid #2A1010" }}>
                    <div className="text-[10px] font-semibold mb-1" style={{ color: "#E08080" }}>This will permanently delete:</div>
                    <div className="text-[10px] ml-2" style={{ color: "#C07070" }}>
                      • {laneCount} timeline{laneCount !== 1 ? "s" : ""} with {eventCount} event{eventCount !== 1 ? "s" : ""}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setDeleteConfirmBook(null); setDeleteBookStep(1); setDeleteBookInput(""); }}
                    className={`${retro.button} px-4 py-2 text-[11px]`}
                    style={{ color: "#8A6A6A" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setDeleteBookStep(2)}
                    className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-1.5`}
                    style={{ color: "#FF5A5A", background: "#2A0A0A", border: "1px solid #4A1A1A" }}
                  >
                    <AlertTriangle size={11} /> Yes, Delete
                  </button>
                </div>
              </div>
            ) : (
              <div style={DISPLAY_CONTENTS}>
                <p className="text-[12px] mb-2 leading-relaxed" style={{ color: "#C09090" }}>
                  Type the name of the book to confirm:
                </p>
                <div className="mb-1 px-3 py-1.5 rounded text-[11px] font-semibold select-all" style={{ background: "#1A0808", border: "1px solid #3A1515", color: "#FFAAAA" }}>
                  {bookName}
                </div>
                <input
                  autoFocus
                  value={deleteBookInput}
                  onChange={e => setDeleteBookInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && deleteBookInput === bookName) {
                      deleteBook(bookId);
                      setDeleteConfirmBook(null); setDeleteBookStep(1); setDeleteBookInput("");
                    }
                    if (e.key === "Escape") { setDeleteConfirmBook(null); setDeleteBookStep(1); setDeleteBookInput(""); }
                  }}
                  placeholder="Type book name here..."
                  className="w-full px-3 py-2.5 text-[12px] rounded mt-2 mb-4"
                  style={{ background: "#0A0505", border: `1px solid ${deleteBookInput === bookName ? "#4ACA6A40" : "#3A1515"}`, color: "#E0C0C0", outline: "none", transition: "border-color 0.2s" }}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setDeleteBookStep(1); setDeleteBookInput(""); }}
                    className={`${retro.button} px-3 py-2 text-[11px]`}
                    style={{ color: "#8A6A6A" }}
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      if (deleteBookInput === bookName) {
                        deleteBook(bookId);
                        setDeleteConfirmBook(null); setDeleteBookStep(1); setDeleteBookInput("");
                      }
                    }}
                    disabled={deleteBookInput !== bookName}
                    className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-1.5`}
                    style={{
                      color: deleteBookInput === bookName ? "#FF3030" : "#4A2020",
                      background: deleteBookInput === bookName ? "#3A0A0A" : "#1A0808",
                      border: `1px solid ${deleteBookInput === bookName ? "#6A2020" : "#2A1010"}`,
                      transition: "all 0.2s",
                    }}
                  >
                    <Trash2 size={11} /> Permanently Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // Main Render
  // ═══════════════════════════════════════════
  const totalEvents = data.books.reduce((sum, b) => sum + b.lanes.reduce((s, l) => s + l.events.length, 0), 0);
  const totalLanes = data.books.reduce((sum, b) => sum + b.lanes.length, 0);

  return (
    <div className="min-h-screen" style={{ ...bc(pageBg) }} ref={timelineContainerRef}>
      <div className="max-w-[1600px] mx-auto px-4 py-5">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate("/interface")} className={`${retro.button} p-2.5`} style={{ color: accent }}>
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1">
            <h1 className="text-[22px] font-bold flex items-center gap-2.5" style={ts(theme.accentColor)}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accent}12`, border: `1px solid ${accent}25` }}>
                <Milestone size={16} style={{ color: accent }} />
              </div>
              Campaign Timeline
            </h1>
            <p className="text-[11px] mt-1 ml-[42px]" style={S_MUTED}>
              {data.books.length} book{data.books.length !== 1 ? "s" : ""} · {totalLanes} timeline{totalLanes !== 1 ? "s" : ""} · {totalEvents} event{totalEvents !== 1 ? "s" : ""}
            </p>
          </div>

          {/* View controls */}
          <div className="flex items-center gap-1.5">
            {activeBook && activeBook.lanes.length > 1 && (
              <button onClick={() => setConsolidatedView(!consolidatedView)} className={`${retro.button} text-[10px] px-3 py-1 flex items-center gap-1.5`} style={{ color: consolidatedView ? "#4ACA6A" : "#5A6A8A" }} title={consolidatedView ? "Show individual lanes" : "Show consolidated view"}>
                <Eye size={11} /> {consolidatedView ? "Lanes" : "Combined"}
              </button>
            )}
          </div>
        </div>

        {/* Book tabs */}
        <div className="flex items-center gap-0 overflow-x-auto mb-5 rounded-lg timeline-scrollbar-sm" style={{ background: "#06061C", border: "1px solid #18184A" }}>
          {data.books.map((book) => {
            const isActive = book.id === activeBookId;
            const bookEventCount = book.lanes.reduce((s, l) => s + l.events.length, 0);
            return (
              <div key={book.id} className="relative shrink-0" ref={bookMenuId === book.id ? menuRef : undefined}>
                {renamingBookId === book.id ? (
                  <div className="px-2 py-2">
                    <input value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={() => renameBook(book.id, renameValue.trim() || book.name)} onKeyDown={e => { if (e.key === "Enter") renameBook(book.id, renameValue.trim() || book.name); if (e.key === "Escape") setRenamingBookId(null); }} className="px-2 py-0.5 text-[12px]" style={{ ...inputStyle, width: 120 }} autoFocus />
                  </div>
                ) : (
                  <button
                    onClick={() => { setActiveBookId(book.id); setConsolidatedView(false); }}
                    onContextMenu={(e) => { if (isDM) { e.preventDefault(); setBookMenuId(bookMenuId === book.id ? null : book.id); } }}
                    className="px-4 py-3 text-[12px] font-semibold flex items-center gap-2 transition-all whitespace-nowrap relative"
                    style={{
                      color: isActive ? "#D0E0FF" : "#4A5A7A",
                      background: isActive ? "linear-gradient(180deg, #12123F 0%, #0A0A30 100%)" : "transparent",
                    }}
                  >
                    {isActive && <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />}
                    <BookOpen size={13} style={{ opacity: isActive ? 1 : 0.5 }} />
                    {book.name}
                    {book.timespan && <span className="text-[8px] font-normal" style={{ color: "#4A5A7A" }}>({book.timespan})</span>}
                    <span className="text-[9px] px-1.5 py-0 rounded-full" style={{ background: isActive ? "#1A1A50" : "#0A0A22", color: "#5A6A8A" }}>{bookEventCount}</span>
                    {isDM && (
                      <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setBookMenuId(bookMenuId === book.id ? null : book.id); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setBookMenuId(bookMenuId === book.id ? null : book.id); } }} className="p-0 hover:opacity-80 cursor-pointer" style={S_DIM}>
                        <ChevronDown size={10} />
                      </span>
                    )}
                  </button>
                )}
                {bookMenuId === book.id && isDM && (
                  <div className="absolute top-full left-0 z-50 mt-0" style={{ background: "#0E0E38", border: "1px solid #2A2A6B", boxShadow: "0 8px 24px rgba(0,0,0,0.6)", minWidth: 170, borderRadius: 6 }}>
                    <button onClick={() => { setRenamingBookId(book.id); setRenameValue(book.name); setBookMenuId(null); }} className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A50] flex items-center gap-2 transition-colors rounded-t" style={S_TEXT}>
                      <Pencil size={10} /> Rename
                    </button>
                    <div className="h-[1px] mx-2" style={{ background: "#1A1A4B" }} />
                    <div className="px-3 py-2">
                      <label className="text-[9px] block mb-1 uppercase tracking-wide" style={S_MUTED}>Book Timespan</label>
                      <input defaultValue={book.timespan || ""} onBlur={e => setBookTimespan(book.id, e.target.value.trim())} onKeyDown={e => { if (e.key === "Enter") { setBookTimespan(book.id, (e.target as HTMLInputElement).value.trim()); setBookMenuId(null); } }} className="w-full px-2 py-1 text-[10px]" style={inputStyle} placeholder="e.g. Years 340-345" />
                    </div>
                    <div className="h-[1px] mx-2" style={{ background: "#1A1A4B" }} />
                    <button onClick={() => { setDeleteConfirmBook({ bookId: book.id, bookName: book.name }); setDeleteBookStep(1); setDeleteBookInput(""); setBookMenuId(null); }} className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#1A1A50] flex items-center gap-2 transition-colors rounded-b" style={{ color: "#FF5A5A" }}>
                      <Trash2 size={10} /> Delete Book
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {isDM && (
            <button onClick={addBook} className="px-4 py-3 text-[11px] flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity" style={{ color: "#4ACA6A" }} title="Add new book">
              <Plus size={13} /> Add Book
            </button>
          )}
        </div>

        {/* Active book content — sunken panel */}
        {activeBook ? (
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "#000000",
              border: "1px solid #1A1A40",
              boxShadow: "inset 0 2px 12px rgba(0,0,0,0.7), inset 0 1px 4px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            {isDM && (
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #111130", background: "linear-gradient(180deg, #060612 0%, #000000 100%)" }}>
                <span className="text-[11px]" style={S_MUTED}>
                  <span style={{ ...S_TEXT, fontWeight: 600 }}>{activeBook.lanes.length}</span> timeline{activeBook.lanes.length !== 1 ? "s" : ""} in{" "}
                  <span style={{ color: "#8A9ABB", fontWeight: 600 }}>{activeBook.name}</span>
                  {draggingEvent && (
                    <span className="ml-3 text-[10px] px-2 py-0.5 rounded" style={{ color: "#FFAA4A", background: "#2A1A0A", border: "1px solid #3A2A1A" }}>
                      {dragOverLaneId ? "Release to move to lane" : "Drag left/right or onto another lane"}
                    </span>
                  )}
                </span>
                <button onClick={() => addLane(activeBook.id)} className={`${retro.button} text-[11px] px-3 py-1.5 flex items-center gap-1.5`} style={{ color: "#4ACA6A" }}>
                  <Plus size={12} /> New Timeline
                </button>
              </div>
            )}

            <div className="p-4">
              {consolidatedView ? renderConsolidatedView() : activeBook.lanes.length > 0 ? (
                <div className="space-y-4">{activeBook.lanes.map(lane => renderLane(lane, activeBook.id))}</div>
              ) : (
                <div className="text-center py-20 rounded-lg" style={{ background: "#050510", border: "1px dashed #1A1A3B" }}>
                  <Waypoints size={36} style={{ color: "#1A1A4B", margin: "0 auto 12px" }} />
                  <p className="text-[14px] mb-1.5" style={S_DIM}>No timelines in this book yet</p>
                  {isDM && <p className="text-[11px]" style={{ color: "#2A3A5A" }}>Click "New Timeline" to start building your campaign chronicle</p>}
                </div>
              )}

              {renderEventDetail()}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 rounded-xl" style={{ background: "#000000", border: "1px solid #1A1A40", boxShadow: "inset 0 2px 12px rgba(0,0,0,0.7), inset 0 1px 4px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.03)" }}>
            <Crown size={36} style={{ color: "#1A1A4B", margin: "0 auto 12px" }} />
            <p className="text-[14px] mb-1.5" style={S_DIM}>No books yet</p>
            {isDM && <p className="text-[11px]" style={{ color: "#2A3A5A" }}>Click "Add Book" to begin your campaign timeline</p>}
          </div>
        )}

        {/* Legend */}
        {totalEvents > 0 && (
          <div className="mt-6 rounded-lg overflow-hidden" style={{ border: "1px solid #14143F" }}>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3" style={{ background: "linear-gradient(180deg, #0A0A28 0%, #080820 100%)" }}>
              <span className="text-[8px] font-bold uppercase tracking-[0.1em]" style={S_DIM}>Categories</span>
              {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                <span key={key} className="text-[10px] flex items-center gap-1.5" style={{ color: cfg.color }}>
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: cfg.color, boxShadow: `0 0 4px ${cfg.color}30` }} />
                  {cfg.label}
                </span>
              ))}
              <span style={{ width: 1, height: 14, background: "#1A1A4B", display: "inline-block" }} />
              <span className="text-[8px] font-bold uppercase tracking-[0.1em]" style={S_DIM}>Shapes</span>
              {Object.entries(IMPORTANCE_CONFIG).map(([key, cfg]) => (
                <span key={key} className="text-[10px] flex items-center gap-1.5" style={{ color: cfg.color }}>
                  <ShapeLegendIcon shape={cfg.shape} size={12} color={cfg.color} />
                  {cfg.label}
                </span>
              ))}
              <span style={{ width: 1, height: 14, background: "#1A1A4B", display: "inline-block" }} />
              <span className="text-[10px] flex items-center gap-1.5" style={{ color: "#5B8CFF" }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#5B8CFF" }} /> Session
              </span>
              <span className="text-[10px] flex items-center gap-1.5" style={S_LINK}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#6A9AFF" }} /> Wiki
              </span>
            </div>
          </div>
        )}
      </div>

      {renderEventEditor()}

      {showWikiPicker && editingEvent && (
        <WikiLinkPicker existingIds={(editingEvent.wikiLinks || []).map(l => l.articleId)} onAdd={handleAddWikiLink} onClose={() => setShowWikiPicker(false)} />
      )}

      {moveEventInfo && activeBook && (
        <MoveToLaneDialog lanes={activeBook.lanes} currentLaneId={moveEventInfo.laneId} onMove={(targetLaneId) => moveEventToLane(moveEventInfo.bookId, moveEventInfo.laneId, moveEventInfo.eventId, targetLaneId)} onClose={() => setMoveEventInfo(null)} />
      )}

      {renderDeleteConfirmModal()}
      {renderDeleteBookModal()}
    </div>
  );
}
