import React from "react";
import { safeGetItem, safeRemoveItem, safeSetJson } from "./safe-storage";
import { appStore } from "@/lib/app-store";

export interface PlayerTheme {
  // General
  accentColor: string;      // Headers, active tabs, links (default: #4A7BFF)
  headerColor: string;      // Page title text color (default: #4A7BFF)
  buttonColor: string;      // Action button text color (default: #C0D0F0)
  uiButtonBg: string;       // UI button background (default: #1A1A5B)
  pageBg: string;           // Main page background base (default: #0A0A3B)

  // Text
  textColor: string;        // Main body text (default: #C0D0F0)
  labelColor: string;       // Dimmed label text (default: #5A6A8A)

  // Panels & Layout
  panelBg: string;          // Panel / card background tint (default: #0E0E35)
  panelBorder: string;      // Raised border highlight (default: #2A2A5B)
  toolbarBg: string;        // Toolbar background (default: #0E0E30)
  inputBg: string;          // Input / sunken bg (default: #0A0A28)
  cardBg: string;           // Card/item tile bg (default: #161648)
  dividerColor: string;     // Horizontal separators (default: #2A2A6B)
  tagBg: string;            // Tag pill background (default: #1A1A4B)
  tagText: string;          // Tag pill text (default: #7A8AAA)

  // Gameplay
  hpHealthy: string;        // HP healthy color (default: #4A7BFF)
  hpWarning: string;        // HP warning color (default: #FFAA4A)
  hpCritical: string;       // HP critical color (default: #FF6A6A)
  rarityCommon: string;     // Common rarity text (default: #9AAACC)
  rarityUncommon: string;   // Uncommon rarity text (default: #7ACA8A)
  rarityRare: string;       // Rare rarity text (default: #C4A0FF)
}

export const DEFAULT_THEME: PlayerTheme = {
  accentColor: "#4A7BFF",
  headerColor: "#4A7BFF",
  buttonColor: "#C0D0F0",
  uiButtonBg: "#1A1A5B",
  pageBg: "#0A0A3B",
  textColor: "#C0D0F0",
  labelColor: "#5A6A8A",
  panelBg: "#0E0E35",
  panelBorder: "#2A2A5B",
  toolbarBg: "#0E0E30",
  inputBg: "#0A0A28",
  cardBg: "#161648",
  dividerColor: "#2A2A6B",
  tagBg: "#1A1A4B",
  tagText: "#7A8AAA",
  hpHealthy: "#4A7BFF",
  hpWarning: "#FFAA4A",
  hpCritical: "#FF6A6A",
  rarityCommon: "#9AAACC",
  rarityUncommon: "#7ACA8A",
  rarityRare: "#C4A0FF",
};

export interface ThemeCategory {
  label: string;
  keys: (keyof PlayerTheme)[];
}

export const THEME_CATEGORIES: ThemeCategory[] = [
  {
    label: "General",
    keys: ["accentColor", "headerColor", "buttonColor", "uiButtonBg", "pageBg"],
  },
  {
    label: "Text",
    keys: ["textColor", "labelColor"],
  },
  {
    label: "Panels & Layout",
    keys: ["panelBg", "panelBorder", "toolbarBg", "inputBg", "cardBg", "dividerColor", "tagBg", "tagText"],
  },
  {
    label: "Gameplay",
    keys: ["hpHealthy", "hpWarning", "hpCritical", "rarityCommon", "rarityUncommon", "rarityRare"],
  },
];

export const THEME_ELEMENT_LABELS: Record<keyof PlayerTheme, string> = {
  accentColor: "Accent Color",
  headerColor: "Header Text",
  buttonColor: "Button Text",
  uiButtonBg: "Button Background",
  pageBg: "Page Background",
  textColor: "Body Text",
  labelColor: "Label Text",
  panelBg: "Panel Background",
  panelBorder: "Panel Border",
  toolbarBg: "Toolbar Background",
  inputBg: "Input Background",
  cardBg: "Card Background",
  dividerColor: "Dividers",
  tagBg: "Tag Background",
  tagText: "Tag Text",
  hpHealthy: "HP Healthy",
  hpWarning: "HP Warning",
  hpCritical: "HP Critical",
  rarityCommon: "Common Rarity",
  rarityUncommon: "Uncommon Rarity",
  rarityRare: "Rare Rarity",
};

/** Build a proper CSS gradient from a base color using color-mix for darker stops */
export function buildPageGradient(base: string): string {
  // If the base is already a gradient, use it directly
  if (isGradient(base)) return base;
  return `linear-gradient(180deg, ${base} 0%, color-mix(in srgb, ${base} 85%, black) 40%, color-mix(in srgb, ${base} 70%, black) 100%)`;
}

// ========================
// Gradient utilities
// ========================

/** Check whether a theme value is a CSS gradient */
export function isGradient(value: string): boolean {
  return value.startsWith("linear-gradient");
}

/** Extract the first hex color from a gradient, or return the value as-is for solid colors */
export function firstColor(value: string): string {
  if (!isGradient(value)) return value;
  const match = value.match(/#[0-9A-Fa-f]{3,8}/);
  return match ? match[0] : "#FFFFFF";
}

export const ts = (value: string): React.CSSProperties =>
  isGradient(value)
    ? { background: value, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" } as React.CSSProperties
    : { color: value };

export const bc = (value: string): React.CSSProperties =>
  isGradient(value)
    ? { background: value } as React.CSSProperties
    : { backgroundColor: value };

/** Parse a gradient string into direction + color stops. Returns null for solid colors. */
export function parseGradient(value: string): { direction: string; colors: string[] } | null {
  if (!isGradient(value)) return null;
  const dirMatch = value.match(/linear-gradient\(\s*([^,]+)\s*,/);
  const direction = dirMatch ? dirMatch[1].trim() : "90deg";
  const colors = value.match(/#[0-9A-Fa-f]{3,8}/g) || [];
  return { direction, colors: colors.length >= 2 ? colors : [] };
}

/** Build a CSS gradient from direction + colors */
export function buildGradient(direction: string, colors: string[]): string {
  if (colors.length < 2) return colors[0] || "#FFFFFF";
  return `linear-gradient(${direction}, ${colors.join(", ")})`;
}

/** Gradient direction presets */
export const GRADIENT_DIRECTIONS = [
  { value: "90deg", label: "\u2192 Horizontal" },
  { value: "180deg", label: "\u2193 Vertical" },
  { value: "135deg", label: "\u2198 Diagonal" },
  { value: "45deg", label: "\u2197 Up-Diagonal" },
  { value: "0deg", label: "\u2191 Upward" },
  { value: "270deg", label: "\u2190 Reverse" },
] as const;

function getPlayerId(): string {
  return safeGetItem("inet-user-id") || "default";
}

function themeKey(pid?: string): string {
  return `inet-player-theme-${pid ?? getPlayerId()}`;
}

const themeCache = new Map<string, PlayerTheme>();
const themeInitialized = new Set<string>();

function normalizeTheme(theme: Partial<PlayerTheme> | null | undefined): PlayerTheme {
  return { ...DEFAULT_THEME, ...(theme || {}) };
}

function dispatchThemeUpdate(playerId: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("player-theme-updated", { detail: { playerId } }));
  }
}

export function readLegacyThemeState(playerId?: string): { theme: PlayerTheme; hasAny: boolean } {
  const pid = playerId ?? getPlayerId();
  try {
    const raw = safeGetItem(themeKey(pid));
    if (!raw) return { theme: { ...DEFAULT_THEME }, hasAny: false };
    return { theme: normalizeTheme(JSON.parse(raw)), hasAny: true };
  } catch {
    return { theme: { ...DEFAULT_THEME }, hasAny: false };
  }
}

function ensureThemeInitialized(playerId?: string): string {
  const pid = playerId ?? getPlayerId();
  if (themeInitialized.has(pid) && themeCache.has(pid)) return pid;
  themeCache.set(pid, { ...DEFAULT_THEME });
  themeInitialized.add(pid);
  return pid;
}

function persistThemeState(playerId: string, theme: Partial<PlayerTheme> | null | undefined, mirrorLegacy = false): PlayerTheme {
  const normalized = normalizeTheme(theme);
  themeCache.set(playerId, normalized);
  themeInitialized.add(playerId);
  if (mirrorLegacy) {
    try { safeSetJson(themeKey(playerId), normalized); } catch {}
  }
  dispatchThemeUpdate(playerId);
  return normalized;
}

export function hydrateThemeState(playerId: string, theme: Partial<PlayerTheme> | null | undefined): PlayerTheme {
  return persistThemeState(playerId, theme, false);
}

export function getPlayerThemeSnapshot(playerId?: string): PlayerTheme {
  const pid = ensureThemeInitialized(playerId);
  return { ...normalizeTheme(themeCache.get(pid)) };
}

function saveThemeToRemote(playerId: string, theme: PlayerTheme): void {
  void appStore
    .loadPlayerCustomization<Record<string, unknown> | null>(playerId, null)
    .then((current) => appStore.savePlayerCustomization(playerId, { ...(current || {}), theme }))
    .catch(() => {});
}

export function getPlayerTheme(playerId?: string): PlayerTheme {
  return getPlayerThemeSnapshot(playerId);
}

export function setPlayerTheme(theme: Partial<PlayerTheme>, playerId?: string): void {
  const pid = ensureThemeInitialized(playerId);
  const merged = normalizeTheme({ ...themeCache.get(pid), ...theme });
  persistThemeState(pid, merged, false);
  saveThemeToRemote(pid, merged);
}

export function resetPlayerTheme(playerId?: string): void {
  const pid = ensureThemeInitialized(playerId);
  const normalized = persistThemeState(pid, { ...DEFAULT_THEME }, false);
  try { safeRemoveItem(themeKey(pid)); } catch {}
  saveThemeToRemote(pid, normalized);
}

// ========================
// Sticker Slots (predefined locations)
// ========================
export interface StickerSlot {
  id: string;
  name: string;
  page: "personal-files" | "interface";
  tab?: string;       // for personal-files: "character" | "inventory" | "cards" | "information" (omit = all tabs)
  x: number;          // percentage from left (0-100)
  y: number;          // percentage from top (0-100)
  description: string;
}

export const STICKER_SLOTS: StickerSlot[] = [
  // Personal Files — visible on all tabs (positioned in outer margins / corners)
  { id: "pf-title-right",    name: "Title Right",        page: "personal-files",                  x: 96, y: 4,  description: "Far-right of header area" },
  { id: "pf-tabs-right",     name: "Tabs Right",         page: "personal-files",                  x: 96, y: 14, description: "Right margin near tab row" },
  { id: "pf-bottom-left",    name: "Bottom Left",        page: "personal-files",                  x: 2,  y: 96, description: "Lower-left corner" },
  { id: "pf-bottom-right",   name: "Bottom Right",       page: "personal-files",                  x: 98, y: 96, description: "Lower-right corner" },

  // Personal Files — Character tab (hugging outer edges of content panel)
  { id: "pf-char-top-right", name: "Stats Corner",       page: "personal-files", tab: "character", x: 97, y: 22, description: "Right margin beside stats" },
  { id: "pf-char-left",      name: "Left Margin",        page: "personal-files", tab: "character", x: 2,  y: 45, description: "Left margin beside resources" },
  { id: "pf-char-bottom",    name: "Below Content",      page: "personal-files", tab: "character", x: 50, y: 95, description: "Below character content" },

  // Personal Files — Inventory tab
  { id: "pf-inv-right",      name: "Right Margin",       page: "personal-files", tab: "inventory", x: 97, y: 35, description: "Right margin of item list" },
  { id: "pf-inv-bottom",     name: "Below Items",        page: "personal-files", tab: "inventory", x: 50, y: 95, description: "Below the item list" },

  // Personal Files — Cards tab
  { id: "pf-cards-right",    name: "Right of Cards",     page: "personal-files", tab: "cards",     x: 97, y: 40, description: "Right margin of card grid" },
  { id: "pf-cards-bottom",   name: "Below Cards",        page: "personal-files", tab: "cards",     x: 50, y: 95, description: "Below the card area" },

  // Personal Files — Information tab
  { id: "pf-info-right",     name: "Info Right",         page: "personal-files", tab: "information", x: 97, y: 35, description: "Right margin of briefings" },
  { id: "pf-info-bottom",    name: "Below Briefings",    page: "personal-files", tab: "information", x: 50, y: 95, description: "Below mission briefings" },

  // Interface page (positioned in clear margin areas / gaps)
  { id: "if-title-right",    name: "Title Area",         page: "interface",                        x: 60, y: 3,  description: "Right of the I-NET title" },
  { id: "if-divider",        name: "Divider Area",       page: "interface",                        x: 5,  y: 20, description: "Left margin near divider" },
  { id: "if-bottom-left",    name: "Bottom Left",        page: "interface",                        x: 5,  y: 92, description: "Lower-left of content area" },
  { id: "if-bottom-center",  name: "Bottom Center",      page: "interface",                        x: 45, y: 92, description: "Bottom-center of page" },
  { id: "if-sidebar-gap",    name: "Sidebar Gap",        page: "interface",                        x: 73, y: 10, description: "Gap between content and sidebar" },
  { id: "if-sidebar-bottom", name: "Below Sidebar",      page: "interface",                        x: 88, y: 92, description: "Below the sidebar panels" },
];

// Group helpers
export function getSlotsByPage(page: "personal-files" | "interface"): StickerSlot[] {
  return STICKER_SLOTS.filter((s) => s.page === page);
}

export function getSlot(slotId: string): StickerSlot | undefined {
  return STICKER_SLOTS.find((s) => s.id === slotId);
}

// ========================
// Placed Stickers
// ========================
export interface PlacedSticker {
  id: string;          // unique placement id
  stickerId: string;   // references the sticker asset id
  slotId: string;      // references a STICKER_SLOTS id
  scale: number;       // scale multiplier (0.5 - 3)
}

function stickerKey(pid?: string): string {
  return `inet-player-placed-stickers-${pid ?? getPlayerId()}`;
}

const stickerCache = new Map<string, PlacedSticker[]>();
const stickerInitialized = new Set<string>();

function normalizePlacedStickers(stickers: unknown): PlacedSticker[] {
  if (!Array.isArray(stickers)) return [];
  return stickers
    .filter((entry): entry is PlacedSticker => !!entry && typeof entry === "object")
    .map((entry) => ({
      id: String(entry.id || ""),
      stickerId: String(entry.stickerId || ""),
      slotId: String(entry.slotId || ""),
      scale: typeof entry.scale === "number" && Number.isFinite(entry.scale) ? entry.scale : 1,
    }))
    .filter((entry) => entry.id && entry.stickerId && entry.slotId);
}

function dispatchStickerUpdate(playerId: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("player-stickers-updated", { detail: { playerId } }));
  }
}

export function readLegacyPlacedStickersState(playerId?: string): { stickers: PlacedSticker[]; hasAny: boolean } {
  const pid = playerId ?? getPlayerId();
  try {
    const raw = safeGetItem(stickerKey(pid));
    if (!raw) return { stickers: [], hasAny: false };
    const stickers = normalizePlacedStickers(JSON.parse(raw));
    return { stickers, hasAny: stickers.length > 0 };
  } catch {
    return { stickers: [], hasAny: false };
  }
}

function ensureStickerInitialized(playerId?: string): string {
  const pid = playerId ?? getPlayerId();
  if (stickerInitialized.has(pid) && stickerCache.has(pid)) return pid;
  stickerCache.set(pid, []);
  stickerInitialized.add(pid);
  return pid;
}

function persistStickerState(playerId: string, stickers: unknown, mirrorLegacy = false): PlacedSticker[] {
  const filtered = normalizePlacedStickers(stickers);
  stickerCache.set(playerId, [...filtered]);
  stickerInitialized.add(playerId);
  if (mirrorLegacy) {
    try { safeSetJson(stickerKey(playerId), filtered); } catch {}
  }
  dispatchStickerUpdate(playerId);
  return [...filtered];
}

export function hydratePlacedStickersState(playerId: string, stickers: unknown): PlacedSticker[] {
  return persistStickerState(playerId, stickers, false);
}

function saveStickersToRemote(playerId: string, stickers: PlacedSticker[]): void {
  void appStore.savePlayerPlacedStickers(playerId, stickers).catch(() => {});
}

export function getPlacedStickersSnapshot(playerId?: string): PlacedSticker[] {
  const pid = ensureStickerInitialized(playerId);
  return [...(stickerCache.get(pid) ?? [])];
}

export function getPlacedStickers(playerId?: string): PlacedSticker[] {
  return getPlacedStickersSnapshot(playerId);
}

export function setPlacedStickers(stickers: PlacedSticker[], playerId?: string): void {
  const pid = ensureStickerInitialized(playerId);
  const next = persistStickerState(pid, stickers, false);
  saveStickersToRemote(pid, next);
}

export function addPlacedSticker(sticker: PlacedSticker, playerId?: string): void {
  const list = getPlacedStickersSnapshot(playerId);
  list.push(sticker);
  setPlacedStickers(list, playerId);
}

export function removePlacedSticker(placementId: string, playerId?: string): void {
  const list = getPlacedStickersSnapshot(playerId).filter((s) => s.id !== placementId);
  setPlacedStickers(list, playerId);
}

export function updatePlacedSticker(placementId: string, updates: Partial<PlacedSticker>, playerId?: string): void {
  const list = getPlacedStickersSnapshot(playerId).map((s) =>
    s.id === placementId ? { ...s, ...updates } : s
  );
  setPlacedStickers(list, playerId);
}

export const STICKER_IDS = [
  "fancy-stand",
  "fancy-jump",
  "gnarpy-paw",
  "gnarpy",
  "gnarpy-miku",
] as const;

export const STICKER_NAMES: Record<string, string> = {
  "fancy-stand": "Fancy Man Standing",
  "fancy-jump": "Fancy Man Jumping",
  "gnarpy-paw": "Gnarpy Paw",
  "gnarpy": "Gnarpy",
  "gnarpy-miku": "Gnarpy Miku",
};