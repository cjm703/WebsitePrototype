import React, { useState, useEffect } from "react";
import { retro } from "./retro-styles";
import {
  Trash2, Plus, Save, X, Edit, Users,
  Coins, Palette, Layers, Sticker, HelpCircle, Trophy,
} from "lucide-react";
import {
  getLeaderboard,
  getCredits,
  setCreditsDirectly,
  getOwnedColors,
  setOwnedColors,
  getOwnedPacks,
  setOwnedPacks,
  getOwnedStickers,
  setOwnedStickers,
  getOwnedMystery,
  setOwnedMystery,
  type LeaderboardEntry,
} from "./game-leaderboard";
import { safeSetItem, safeGetJson, safeSetJson } from "./safe-storage";
import { S_MUTED, S_ACCENT, S_TEXT, S_RED } from "./shared-styles";

// ========================
// localStorage keys for DM-managed catalog data (global, not per-player)
// ========================
const CUSTOM_COLORS_KEY = "inet-dm-arcade-custom-colors";
const HIDDEN_COLORS_KEY = "inet-dm-arcade-hidden-colors";
const CUSTOM_PACKS_KEY = "inet-dm-arcade-custom-packs";
const HIDDEN_PACKS_KEY = "inet-dm-arcade-hidden-packs";
const CUSTOM_STICKERS_KEY = "inet-dm-arcade-custom-stickers";
const HIDDEN_STICKERS_KEY = "inet-dm-arcade-hidden-stickers";
const MYSTERY_ITEMS_KEY = "inet-dm-arcade-mystery-items";
const LEADERBOARD_KEY = "inet-arcade-leaderboard";

// ========================
// Types
// ========================
interface SingleColor {
  id: string;
  name: string;
  hex: string;
  price: number;
}

interface ColorPack {
  id: string;
  name: string;
  price: number;
  colors: string[];
}

interface StickerItem {
  id: string;
  name: string;
  price: number;
}

interface MysteryItem {
  id: string;
  name: string;
  description: string;
  price: number;
}

interface PlayerInfo {
  id: string;
  name: string;
  class?: string;
  level?: number;
}

// ========================
// Built-in data (mirrors arcade-store.tsx constants)
// ========================
const BUILTIN_COLORS: SingleColor[] = [
  { id: "cherry", name: "Cherry", hex: "#DE3163", price: 15 },
  { id: "crimson", name: "Crimson", hex: "#DC143C", price: 10 },
  { id: "scarlet", name: "Scarlet", hex: "#FF2400", price: 10 },
  { id: "ruby", name: "Ruby", hex: "#E0115F", price: 20 },
  { id: "rose", name: "Rose", hex: "#FF007F", price: 15 },
  { id: "tangerine", name: "Tangerine", hex: "#FF9966", price: 10 },
  { id: "amber", name: "Amber", hex: "#FFBF00", price: 15 },
  { id: "rust", name: "Rust", hex: "#B7410E", price: 10 },
  { id: "peach", name: "Peach", hex: "#FFCBA4", price: 10 },
  { id: "coral", name: "Coral", hex: "#FF7F50", price: 15 },
  { id: "gold", name: "Gold", hex: "#FFD700", price: 20 },
  { id: "lemon", name: "Lemon", hex: "#FFF44F", price: 10 },
  { id: "canary", name: "Canary", hex: "#FFEF00", price: 10 },
  { id: "buttercup", name: "Buttercup", hex: "#F9E154", price: 15 },
  { id: "sunflower", name: "Sunflower", hex: "#FFDA03", price: 15 },
  { id: "emerald", name: "Emerald", hex: "#50C878", price: 25 },
  { id: "lime", name: "Lime", hex: "#32CD32", price: 10 },
  { id: "mint", name: "Mint", hex: "#98FF98", price: 15 },
  { id: "forest", name: "Forest", hex: "#228B22", price: 20 },
  { id: "sage", name: "Sage", hex: "#BCB88A", price: 10 },
  { id: "jade", name: "Jade", hex: "#00A86B", price: 25 },
  { id: "olive", name: "Olive", hex: "#808000", price: 10 },
  { id: "cobalt", name: "Cobalt", hex: "#0047AB", price: 20 },
  { id: "cerulean", name: "Cerulean", hex: "#007BA7", price: 25 },
  { id: "azure", name: "Azure", hex: "#007FFF", price: 15 },
  { id: "navy", name: "Navy", hex: "#000080", price: 10 },
  { id: "sky", name: "Sky", hex: "#87CEEB", price: 10 },
  { id: "sapphire", name: "Sapphire", hex: "#0F52BA", price: 30 },
  { id: "teal", name: "Teal", hex: "#008080", price: 15 },
  { id: "cyan", name: "Cyan", hex: "#00FFFF", price: 20 },
  { id: "violet", name: "Violet", hex: "#7F00FF", price: 20 },
  { id: "lavender", name: "Lavender", hex: "#E6E6FA", price: 15 },
  { id: "plum", name: "Plum", hex: "#8E4585", price: 20 },
  { id: "mauve", name: "Mauve", hex: "#E0B0FF", price: 15 },
  { id: "amethyst", name: "Amethyst", hex: "#9966CC", price: 30 },
  { id: "indigo", name: "Indigo", hex: "#4B0082", price: 25 },
  { id: "orchid", name: "Orchid", hex: "#DA70D6", price: 20 },
  { id: "magenta", name: "Magenta", hex: "#FF00FF", price: 20 },
  { id: "bubblegum", name: "Bubblegum", hex: "#FFC1CC", price: 10 },
  { id: "salmon", name: "Salmon", hex: "#FA8072", price: 10 },
  { id: "hotpink", name: "Hot Pink", hex: "#FF69B4", price: 15 },
  { id: "blush", name: "Blush", hex: "#DE5D83", price: 15 },
  { id: "charcoal", name: "Charcoal", hex: "#36454F", price: 10 },
  { id: "slate", name: "Slate", hex: "#708090", price: 10 },
  { id: "ivory", name: "Ivory", hex: "#FFFFF0", price: 15 },
  { id: "silver", name: "Silver", hex: "#C0C0C0", price: 25 },
  { id: "bronze", name: "Bronze", hex: "#CD7F32", price: 35 },
  { id: "obsidian", name: "Obsidian", hex: "#0B0B0B", price: 40 },
  { id: "pearl", name: "Pearl", hex: "#FDEEF4", price: 45 },
  { id: "diamond", name: "Diamond", hex: "#B9F2FF", price: 50 },
];

const BUILTIN_PACKS: ColorPack[] = [
  { id: "cga", name: "CGA", price: 100, colors: ["#000000", "#55FFFF", "#FF55FF", "#FFFFFF"] },
  { id: "gameboy", name: "Game Boy", price: 150, colors: ["#0F380F", "#306230", "#8BAC0F", "#9BBC0F"] },
  { id: "nes", name: "NES", price: 250, colors: ["#000000", "#FCFCFC", "#F83800", "#0058F8", "#00A800"] },
  { id: "c64", name: "C64", price: 350, colors: ["#000000", "#FFFFFF", "#68372B", "#70A4B2", "#6F3D86", "#588D43"] },
  { id: "pico8", name: "PICO-8", price: 300, colors: ["#000000", "#1D2B53", "#7E2553", "#008751", "#AB5236", "#FF004D"] },
  { id: "pastel", name: "Pastel", price: 100, colors: ["#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9", "#BAE1FF"] },
  { id: "mono", name: "Mono", price: 100, colors: ["#000000", "#404040", "#808080", "#C0C0C0", "#FFFFFF"] },
  { id: "sepia", name: "Sepia", price: 100, colors: ["#704214", "#8B6914", "#C4A35A", "#D2B48C", "#F5DEB3"] },
  { id: "dark", name: "Dark", price: 200, colors: ["#0D0D0D", "#1A1A2E", "#16213E", "#0F3460", "#533483"] },
  { id: "ocean", name: "Ocean", price: 200, colors: ["#003545", "#006D77", "#83C5BE", "#EDF6F9", "#FFDDD2"] },
  { id: "earth", name: "Earth", price: 200, colors: ["#5C4033", "#8B7355", "#A0522D", "#D2B48C", "#228B22"] },
  { id: "spring", name: "Spring", price: 200, colors: ["#FF69B4", "#98FB98", "#FFD700", "#87CEEB", "#DDA0DD"] },
  { id: "summer", name: "Summer", price: 200, colors: ["#FF6B35", "#F7C59F", "#EFEFD0", "#004E89", "#1A659E"] },
  { id: "fall", name: "Fall", price: 200, colors: ["#8B4513", "#D2691E", "#FF8C00", "#DAA520", "#B22222"] },
  { id: "winter", name: "Winter", price: 200, colors: ["#A8DADC", "#457B9D", "#1D3557", "#F1FAEE", "#E8E8E8"] },
  { id: "horror", name: "Horror", price: 400, colors: ["#1A0A0A", "#4A0000", "#8B0000", "#2D0A0A", "#660000"] },
  { id: "halloween", name: "Halloween", price: 400, colors: ["#FF6600", "#000000", "#800080", "#1A1A1A", "#FFD700"] },
  { id: "christmas", name: "Christmas", price: 500, colors: ["#C41E3A", "#00843D", "#FFD700", "#FFFFFF", "#B22222"] },
];

const BUILTIN_STICKERS: StickerItem[] = [
  { id: "fancy-stand", name: "Fancy Man Standing", price: 100 },
  { id: "fancy-jump", name: "Fancy Man Jumping", price: 100 },
  { id: "gnarpy-paw", name: "Gnarpy Paw", price: 150 },
  { id: "gnarpy", name: "Gnarpy", price: 250 },
  { id: "gnarpy-miku", name: "Gnarpy Miku", price: 400 },
];

// ========================
// Helpers
// ========================
function saveJson(key: string, data: unknown): void {
  try { safeSetJson(key, data); } catch {}
}

type ArcadeTab = "credits" | "colors" | "colorpacks" | "stickers" | "mystery" | "leaderboard";

// ========================
// Component
// ========================
interface DMArcadeManagerProps {
  players: PlayerInfo[];
}

export function DMArcadeManager({ players }: DMArcadeManagerProps) {
  // Selected player
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  useEffect(() => {
    if (players.length === 0) {
      setSelectedPlayerId("");
      return;
    }

    const stillExists = players.some((p) => p.id === selectedPlayerId);
    if (!stillExists) {
      setSelectedPlayerId(players[0].id);
    }
  }, [players, selectedPlayerId]);

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  const [tab, setTab] = useState<ArcadeTab>("credits");

  // Per-player data (re-loaded when selected player changes)
  const [credits, setCredits] = useState(0);
  const [ownedColors, setOwnedColorsState] = useState<string[]>([]);
  const [ownedPacks, setOwnedPacksState] = useState<string[]>([]);
  const [ownedStickers, setOwnedStickersState] = useState<string[]>([]);
  const [ownedMysteryState, setOwnedMysteryState] = useState<string[]>([]);

  // Load per-player data when player selection changes
  useEffect(() => {
    if (!selectedPlayerId) return;
    setCredits(getCredits(selectedPlayerId));
    setOwnedColorsState(getOwnedColors(selectedPlayerId));
    setOwnedPacksState(getOwnedPacks(selectedPlayerId));
    setOwnedStickersState(getOwnedStickers(selectedPlayerId));
    setOwnedMysteryState(getOwnedMystery(selectedPlayerId));
  }, [selectedPlayerId]);

  // Save per-player data when changed
  const updateCredits = (val: number) => {
    setCredits(val);
    setCreditsDirectly(val, selectedPlayerId);
  };

  const updateOwnedColors = (list: string[]) => {
    setOwnedColorsState(list);
    setOwnedColors(list, selectedPlayerId);
  };

  const updateOwnedPacks = (list: string[]) => {
    setOwnedPacksState(list);
    setOwnedPacks(list, selectedPlayerId);
  };

  const updateOwnedStickers = (list: string[]) => {
    setOwnedStickersState(list);
    setOwnedStickers(list, selectedPlayerId);
  };

  const updateOwnedMystery = (list: string[]) => {
    setOwnedMysteryState(list);
    setOwnedMystery(list, selectedPlayerId);
  };

  // Global catalog data (not per-player)
  const [customColors, setCustomColors] = useState<SingleColor[]>(() => safeGetJson(CUSTOM_COLORS_KEY, []));
  const [customPacks, setCustomPacks] = useState<ColorPack[]>(() => safeGetJson(CUSTOM_PACKS_KEY, []));
  const [customStickers, setCustomStickers] = useState<StickerItem[]>(() => safeGetJson(CUSTOM_STICKERS_KEY, []));
  const [mysteryItems, setMysteryItems] = useState<MysteryItem[]>(() => safeGetJson(MYSTERY_ITEMS_KEY, []));
  const [hiddenColors, setHiddenColors] = useState<string[]>(() => safeGetJson(HIDDEN_COLORS_KEY, []));
  const [hiddenPacks, setHiddenPacks] = useState<string[]>(() => safeGetJson(HIDDEN_PACKS_KEY, []));
  const [hiddenStickers, setHiddenStickers] = useState<string[]>(() => safeGetJson(HIDDEN_STICKERS_KEY, []));

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => getLeaderboard());
  const [editingEntry, setEditingEntry] = useState<LeaderboardEntry | null>(null);
  const [isAddingEntry, setIsAddingEntry] = useState(false);

  // Form states
  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState("#FF0000");
  const [newColorPrice, setNewColorPrice] = useState(10);
  const [newPackName, setNewPackName] = useState("");
  const [newPackPrice, setNewPackPrice] = useState(100);
  const [newPackColors, setNewPackColors] = useState("#000000");
  const [newStickerName, setNewStickerName] = useState("");
  const [newStickerPrice, setNewStickerPrice] = useState(100);
  const [newMysteryName, setNewMysteryName] = useState("");
  const [newMysteryDesc, setNewMysteryDesc] = useState("");
  const [newMysteryPrice, setNewMysteryPrice] = useState(50);

  // Persist global catalog data
  useEffect(() => { saveJson(CUSTOM_COLORS_KEY, customColors); }, [customColors]);
  useEffect(() => { saveJson(CUSTOM_PACKS_KEY, customPacks); }, [customPacks]);
  useEffect(() => { saveJson(CUSTOM_STICKERS_KEY, customStickers); }, [customStickers]);
  useEffect(() => { saveJson(HIDDEN_COLORS_KEY, hiddenColors); }, [hiddenColors]);
  useEffect(() => { saveJson(HIDDEN_PACKS_KEY, hiddenPacks); }, [hiddenPacks]);
  useEffect(() => { saveJson(HIDDEN_STICKERS_KEY, hiddenStickers); }, [hiddenStickers]);
  useEffect(() => { saveJson(MYSTERY_ITEMS_KEY, mysteryItems); }, [mysteryItems]);
  useEffect(() => { saveJson(LEADERBOARD_KEY, leaderboard); }, [leaderboard]);

  // Search filter
  const [colorSearch, setColorSearch] = useState("");

  // Styles
  const labelStyle = { color: "#5A6A8A" } as const;
  const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;
  const inputStyle = { color: "#C0D0F0" } as const;

  const tabs: { id: ArcadeTab; label: string; icon: React.ElementType }[] = [
    { id: "credits", label: "Credits", icon: Coins },
    { id: "colors", label: "Colors [C]", icon: Palette },
    { id: "colorpacks", label: "Color Packs [CP]", icon: Layers },
    { id: "stickers", label: "Badges [B]", icon: Sticker },
    { id: "mystery", label: "Mystery [?]", icon: HelpCircle },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy },
  ];

  const allColors = [...BUILTIN_COLORS.filter((c) => !hiddenColors.includes(c.id)), ...customColors];
  const allPacks = [...BUILTIN_PACKS.filter((p) => !hiddenPacks.includes(p.id)), ...customPacks];
  const allStickers = [...BUILTIN_STICKERS.filter((s) => !hiddenStickers.includes(s.id)), ...customStickers];

  // ========================
  // Toggle owned (per-player)
  // ========================
  const toggleOwnedColor = (id: string) => {
    updateOwnedColors(ownedColors.includes(id) ? ownedColors.filter((x) => x !== id) : [...ownedColors, id]);
  };
  const toggleOwnedPack = (id: string) => {
    updateOwnedPacks(ownedPacks.includes(id) ? ownedPacks.filter((x) => x !== id) : [...ownedPacks, id]);
  };
  const toggleOwnedSticker = (id: string) => {
    updateOwnedStickers(ownedStickers.includes(id) ? ownedStickers.filter((x) => x !== id) : [...ownedStickers, id]);
  };
  const toggleOwnedMystery = (id: string) => {
    updateOwnedMystery(ownedMysteryState.includes(id) ? ownedMysteryState.filter((x) => x !== id) : [...ownedMysteryState, id]);
  };

  // ========================
  // Hide/show built-in items (global)
  // ========================
  const toggleHideColor = (id: string) => {
    setHiddenColors((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const toggleHidePack = (id: string) => {
    setHiddenPacks((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const toggleHideSticker = (id: string) => {
    setHiddenStickers((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  // ========================
  // Add/remove custom items (global catalog)
  // ========================
  const addCustomColor = () => {
    if (!newColorName.trim()) return;
    setCustomColors((prev) => [...prev, { id: `custom-c-${Date.now()}`, name: newColorName.trim(), hex: newColorHex, price: newColorPrice }]);
    setNewColorName(""); setNewColorHex("#FF0000"); setNewColorPrice(10);
  };
  const removeCustomColor = (id: string) => setCustomColors((prev) => prev.filter((c) => c.id !== id));

  const addCustomPack = () => {
    if (!newPackName.trim()) return;
    const colorArr = newPackColors.split(",").map((c) => c.trim()).filter(Boolean);
    if (colorArr.length === 0) return;
    setCustomPacks((prev) => [...prev, { id: `custom-p-${Date.now()}`, name: newPackName.trim(), price: newPackPrice, colors: colorArr }]);
    setNewPackName(""); setNewPackPrice(100); setNewPackColors("#000000");
  };
  const removeCustomPack = (id: string) => setCustomPacks((prev) => prev.filter((p) => p.id !== id));

  const addCustomSticker = () => {
    if (!newStickerName.trim()) return;
    setCustomStickers((prev) => [...prev, { id: `custom-s-${Date.now()}`, name: newStickerName.trim(), price: newStickerPrice }]);
    setNewStickerName(""); setNewStickerPrice(100);
  };
  const removeCustomSticker = (id: string) => setCustomStickers((prev) => prev.filter((s) => s.id !== id));

  const addMysteryItem = () => {
    if (!newMysteryName.trim()) return;
    setMysteryItems((prev) => [...prev, { id: `mystery-${Date.now()}`, name: newMysteryName.trim(), description: newMysteryDesc.trim(), price: newMysteryPrice }]);
    setNewMysteryName(""); setNewMysteryDesc(""); setNewMysteryPrice(50);
  };
  const removeMysteryItem = (id: string) => setMysteryItems((prev) => prev.filter((m) => m.id !== id));

  // ========================
  // Bulk owned actions (per-player)
  // ========================
  const grantAllColors = () => updateOwnedColors(allColors.map((c) => c.id));
  const revokeAllColors = () => updateOwnedColors([]);
  const grantAllPacks = () => updateOwnedPacks(allPacks.map((p) => p.id));
  const revokeAllPacks = () => updateOwnedPacks([]);
  const grantAllStickers = () => updateOwnedStickers(allStickers.map((s) => s.id));
  const revokeAllStickers = () => updateOwnedStickers([]);

  // ========================
  // Leaderboard handlers
  // ========================
  const GAME_OPTIONS = [
    { id: "snake", name: "Snake" },
    { id: "runner", name: "Cyber Runner" },
    { id: "osu", name: "Rhythm Circles" },
    { id: "doodlejump", name: "Doodle Jump" },
    { id: "bossfight", name: "Boss Fight" },
  ];

  const handleAddEntry = () => {
    setEditingEntry({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      gameId: "snake", gameName: "Snake", player: selectedPlayer?.name || "", score: 0,
      date: new Date().toISOString(),
    });
    setIsAddingEntry(true);
  };
  const handleSaveEntry = () => {
    if (!editingEntry) return;
    if (isAddingEntry) setLeaderboard((prev) => [...prev, editingEntry]);
    else setLeaderboard((prev) => prev.map((e) => e.id === editingEntry.id ? editingEntry : e));
    setEditingEntry(null); setIsAddingEntry(false);
  };
  const handleDeleteEntry = (id: string) => {
    setLeaderboard((prev) => prev.filter((e) => e.id !== id));
    if (editingEntry?.id === id) { setEditingEntry(null); setIsAddingEntry(false); }
  };
  const handleCancelEntryEdit = () => { setEditingEntry(null); setIsAddingEntry(false); };

  // Filtered colors
  const filteredColors = colorSearch.trim()
    ? BUILTIN_COLORS.filter((c) => c.name.toLowerCase().includes(colorSearch.toLowerCase()) || c.hex.toLowerCase().includes(colorSearch.toLowerCase()))
    : BUILTIN_COLORS;

  // Tabs that are per-player vs global
  const isPerPlayerTab = tab === "credits" || tab === "colors" || tab === "colorpacks" || tab === "stickers" || tab === "mystery";

  return (
    <div className="space-y-4">
      {/* ============================== */}
      {/* PLAYER PICKER                   */}
      {/* ============================== */}
      <div className={`${retro.raised} bg-[#0C0C30] p-4`}>
        <div className="flex items-center gap-3 mb-2">
          <Users size={16} style={S_ACCENT} />
          <span className="text-[13px] font-bold" style={S_ACCENT}>Select Player</span>
        </div>
        {players.length === 0 ? (
          <div className="text-[11px] py-2" style={{ color: "#5A6A8A", fontStyle: "italic" }}>
            No players found. Create players in the Players section first.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayerId(p.id)}
                className={`${retro.button} px-4 py-2 text-[11px]`}
                style={{
                  color: selectedPlayerId === p.id ? "#FFD700" : "#8A9ABF",
                  background: selectedPlayerId === p.id ? "#1A1A4A" : "transparent",
                  borderColor: selectedPlayerId === p.id ? "#FFD700" : undefined,
                  fontWeight: selectedPlayerId === p.id ? 700 : 400,
                }}
              >
                {p.name}
                {p.class && <span className="ml-1" style={{ color: "#5A6A8A", fontSize: 9 }}>({p.class})</span>}
              </button>
            ))}
          </div>
        )}
        {selectedPlayer && (
          <div className="mt-2 text-[10px]" style={{ color: "#5A6A8A" }}>
            Managing: <span style={{ color: "#FFD700" }}>{selectedPlayer.name}</span>
            {selectedPlayer.class && <span> · {selectedPlayer.class} Lv.{selectedPlayer.level}</span>}
            <span> · ID: {selectedPlayer.id}</span>
          </div>
        )}
      </div>

      {/* Sub-tab bar */}
      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1.5`}
              style={{
                color: tab === t.id ? "#FFD700" : "#5A6A8A",
                background: tab === t.id ? "#1A1A4A" : "transparent",
                borderColor: tab === t.id ? "#FFD700" : undefined,
              }}
            >
              <Icon size={12} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Per-player warning if no player selected */}
      {isPerPlayerTab && !selectedPlayerId && (
        <div className={`${retro.raised} bg-[#2A1A0A] p-4 text-center`}>
          <div className="text-[12px]" style={S_RED}>Select a player above to manage their arcade data.</div>
        </div>
      )}

      {/* ============================== */}
      {/* CREDITS TAB                     */}
      {/* ============================== */}
      {tab === "credits" && selectedPlayerId && (
        <div className="space-y-4">
          <div className={`${retro.raised} bg-[#0C0C30] p-4`}>
            <div className="text-[13px] font-bold mb-3" style={{ color: "#FFD700" }}>
              <Coins size={14} className="inline mr-1.5" />{selectedPlayer?.name}'s Credits
            </div>
            <div className="flex items-center gap-3 mb-3">
              <label className="text-[11px]" style={labelStyle}>Balance:</label>
              <input
                type="number"
                value={credits}
                onChange={(e) => updateCredits(parseInt(e.target.value, 10) || 0)}
                className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-40 outline-none`}
                style={{ color: "#FFD700", fontFamily: "'Courier New', monospace" }}
              />
              <span className="text-[11px]" style={{ color: "#5A6A8A" }}>CR</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => updateCredits(credits + 100)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={{ color: "#4AE04A" }}>+100</button>
              <button onClick={() => updateCredits(credits + 500)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={{ color: "#4AE04A" }}>+500</button>
              <button onClick={() => updateCredits(credits + 1000)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={{ color: "#4AE04A" }}>+1000</button>
              <button onClick={() => updateCredits(0)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}>Reset to 0</button>
            </div>
          </div>

          <div className={`${retro.raised} bg-[#0C0C30] p-4`}>
            <div className="text-[12px] font-bold mb-2" style={{ color: "#B0C0E0" }}>{selectedPlayer?.name}'s Owned Items</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px]" style={{ color: "#8A9ABF" }}>
              <div className={`${retro.sunken} bg-[#0A0A28] p-2 text-center`}>
                <div style={{ color: "#4AE04A", fontSize: 16, fontWeight: 700 }}>{ownedColors.length}</div>
                <div>Colors</div>
              </div>
              <div className={`${retro.sunken} bg-[#0A0A28] p-2 text-center`}>
                <div style={{ color: "#4AE04A", fontSize: 16, fontWeight: 700 }}>{ownedPacks.length}</div>
                <div>Packs</div>
              </div>
              <div className={`${retro.sunken} bg-[#0A0A28] p-2 text-center`}>
                <div style={{ color: "#4AE04A", fontSize: 16, fontWeight: 700 }}>{ownedStickers.length}</div>
                <div>Badges</div>
              </div>
              <div className={`${retro.sunken} bg-[#0A0A28] p-2 text-center`}>
                <div style={{ color: "#DA70D6", fontSize: 16, fontWeight: 700 }}>{ownedMysteryState.length}</div>
                <div>Mystery</div>
              </div>
              <div className={`${retro.sunken} bg-[#0A0A28] p-2 text-center`}>
                <div style={{ color: "#FFD700", fontSize: 16, fontWeight: 700 }}>{credits}</div>
                <div>Credits</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* COLORS TAB                      */}
      {/* ============================== */}
      {tab === "colors" && selectedPlayerId && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={grantAllColors} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={{ color: "#4AE04A" }}>Grant All to {selectedPlayer?.name}</button>
            <button onClick={revokeAllColors} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}>Revoke All</button>
            <span className="text-[10px] ml-auto" style={{ color: "#5A6A8A" }}>
              {ownedColors.length} owned / {allColors.length} available ({hiddenColors.length} hidden)
            </span>
          </div>

          <input type="text" value={colorSearch} onChange={(e) => setColorSearch(e.target.value)} placeholder="Search colors..." className={`${inputClass} max-w-xs`} style={inputStyle} />

          <div className={`${retro.raised} bg-[#0C0C30] p-3`}>
            <div className="text-[11px] font-bold mb-2" style={{ color: "#B0C0E0" }}>Built-in Colors ({filteredColors.length})</div>
            <div style={{ maxHeight: 320, overflowY: "auto" }} className="space-y-1">
              {filteredColors.map((color) => {
                const isHidden = hiddenColors.includes(color.id);
                const isOwned = ownedColors.includes(color.id);
                return (
                  <div key={color.id} className="flex items-center gap-2 py-1 px-2 rounded" style={{ background: isHidden ? "#1A0A0A" : "#0A0A28", opacity: isHidden ? 0.5 : 1 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: color.hex, border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
                    <span className="text-[11px] flex-1 min-w-0" style={{ color: isHidden ? "#5A4A4A" : "#C0D0F0" }}>
                      {color.name} <span style={{ color: "#5A6A8A", fontSize: 9 }}>{color.hex}</span>
                    </span>
                    <span className="text-[9px] shrink-0" style={{ color: "#FFD700" }}>{color.price}CR</span>
                    <button onClick={() => toggleOwnedColor(color.id)} className="text-[9px] px-2 py-0.5 rounded shrink-0" disabled={isHidden}
                      style={{ background: isOwned ? "#4AE04A20" : "#2A2A50", color: isOwned ? "#4AE04A" : "#5A6A8A", border: `1px solid ${isOwned ? "#4AE04A50" : "#3A3A5A"}` }}>
                      {isOwned ? "OWNED" : "GRANT"}
                    </button>
                    <button onClick={() => toggleHideColor(color.id)} className="text-[9px] px-2 py-0.5 rounded shrink-0"
                      style={{ background: isHidden ? "#FF6A6A20" : "#2A2A50", color: isHidden ? "#FF6A6A" : "#5A6A8A", border: `1px solid ${isHidden ? "#FF6A6A50" : "#3A3A5A"}` }}>
                      {isHidden ? "SHOW" : "HIDE"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`${retro.raised} bg-[#0C0C30] p-3`}>
            <div className="text-[11px] font-bold mb-2" style={{ color: "#FFD700" }}><Plus size={11} className="inline mr-1" />Custom Colors ({customColors.length})</div>
            <div className="flex gap-2 mb-3 items-end flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <label className="text-[9px] block mb-0.5" style={labelStyle}>Name</label>
                <input value={newColorName} onChange={(e) => setNewColorName(e.target.value)} className={inputClass} style={inputStyle} placeholder="Color name" />
              </div>
              <div className="w-24">
                <label className="text-[9px] block mb-0.5" style={labelStyle}>Hex</label>
                <div className="flex gap-1 items-center">
                  <input type="color" value={newColorHex} onChange={(e) => setNewColorHex(e.target.value)} className="w-7 h-7 cursor-pointer" />
                  <input value={newColorHex} onChange={(e) => setNewColorHex(e.target.value)} className={`${retro.sunken} bg-[#0A0A28] px-1 py-1 text-[10px] w-16 outline-none`} style={inputStyle} />
                </div>
              </div>
              <div className="w-16">
                <label className="text-[9px] block mb-0.5" style={labelStyle}>Price</label>
                <input type="number" value={newColorPrice} onChange={(e) => setNewColorPrice(parseInt(e.target.value, 10) || 0)} className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[11px] w-full outline-none`} style={inputStyle} />
              </div>
              <button onClick={addCustomColor} className={`${retro.button} px-3 py-2 text-[10px] shrink-0`} style={{ color: "#4AE04A" }}><Plus size={11} className="inline mr-1" />Add</button>
            </div>
            <div className="space-y-1">
              {customColors.map((color) => {
                const isOwned = ownedColors.includes(color.id);
                return (
                  <div key={color.id} className="flex items-center gap-2 py-1 px-2 rounded" style={{ background: "#0A0A28" }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: color.hex, border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
                    <span className="text-[11px] flex-1" style={S_TEXT}>{color.name} <span style={{ color: "#5A6A8A", fontSize: 9 }}>{color.hex}</span></span>
                    <span className="text-[9px] shrink-0" style={{ color: "#FFD700" }}>{color.price}CR</span>
                    <button onClick={() => toggleOwnedColor(color.id)} className="text-[9px] px-2 py-0.5 rounded shrink-0"
                      style={{ background: isOwned ? "#4AE04A20" : "#2A2A50", color: isOwned ? "#4AE04A" : "#5A6A8A", border: `1px solid ${isOwned ? "#4AE04A50" : "#3A3A5A"}` }}>
                      {isOwned ? "OWNED" : "GRANT"}
                    </button>
                    <button onClick={() => removeCustomColor(color.id)} className="shrink-0 p-0.5 hover:opacity-80" style={S_RED}><Trash2 size={12} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* COLOR PACKS TAB                 */}
      {/* ============================== */}
      {tab === "colorpacks" && selectedPlayerId && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={grantAllPacks} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={{ color: "#4AE04A" }}>Grant All to {selectedPlayer?.name}</button>
            <button onClick={revokeAllPacks} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}>Revoke All</button>
            <span className="text-[10px] ml-auto" style={{ color: "#5A6A8A" }}>
              {ownedPacks.length} owned / {allPacks.length} available ({hiddenPacks.length} hidden)
            </span>
          </div>

          <div className={`${retro.raised} bg-[#0C0C30] p-3`}>
            <div className="text-[11px] font-bold mb-2" style={{ color: "#B0C0E0" }}>Built-in Packs ({BUILTIN_PACKS.length})</div>
            <div style={{ maxHeight: 320, overflowY: "auto" }} className="space-y-1">
              {BUILTIN_PACKS.map((pack) => {
                const isHidden = hiddenPacks.includes(pack.id);
                const isOwned = ownedPacks.includes(pack.id);
                return (
                  <div key={pack.id} className="flex items-center gap-2 py-1.5 px-2 rounded" style={{ background: isHidden ? "#1A0A0A" : "#0A0A28", opacity: isHidden ? 0.5 : 1 }}>
                    <div className="flex rounded overflow-hidden shrink-0" style={{ width: 48, height: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
                      {pack.colors.map((hex, i) => <div key={i} style={{ flex: 1, background: hex }} />)}
                    </div>
                    <span className="text-[11px] flex-1 min-w-0" style={{ color: isHidden ? "#5A4A4A" : "#C0D0F0" }}>{pack.name}</span>
                    <span className="text-[9px] shrink-0" style={{ color: "#FFD700" }}>{pack.price}CR</span>
                    <button onClick={() => toggleOwnedPack(pack.id)} className="text-[9px] px-2 py-0.5 rounded shrink-0" disabled={isHidden}
                      style={{ background: isOwned ? "#4AE04A20" : "#2A2A50", color: isOwned ? "#4AE04A" : "#5A6A8A", border: `1px solid ${isOwned ? "#4AE04A50" : "#3A3A5A"}` }}>
                      {isOwned ? "OWNED" : "GRANT"}
                    </button>
                    <button onClick={() => toggleHidePack(pack.id)} className="text-[9px] px-2 py-0.5 rounded shrink-0"
                      style={{ background: isHidden ? "#FF6A6A20" : "#2A2A50", color: isHidden ? "#FF6A6A" : "#5A6A8A", border: `1px solid ${isHidden ? "#FF6A6A50" : "#3A3A5A"}` }}>
                      {isHidden ? "SHOW" : "HIDE"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`${retro.raised} bg-[#0C0C30] p-3`}>
            <div className="text-[11px] font-bold mb-2" style={{ color: "#FFD700" }}><Plus size={11} className="inline mr-1" />Custom Packs ({customPacks.length})</div>
            <div className="flex gap-2 mb-3 items-end flex-wrap">
              <div className="flex-1 min-w-[100px]">
                <label className="text-[9px] block mb-0.5" style={labelStyle}>Name</label>
                <input value={newPackName} onChange={(e) => setNewPackName(e.target.value)} className={inputClass} style={inputStyle} placeholder="Pack name" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-[9px] block mb-0.5" style={labelStyle}>Colors (comma-separated hex)</label>
                <input value={newPackColors} onChange={(e) => setNewPackColors(e.target.value)} className={inputClass} style={inputStyle} placeholder="#000000, #FFFFFF" />
              </div>
              <div className="w-16">
                <label className="text-[9px] block mb-0.5" style={labelStyle}>Price</label>
                <input type="number" value={newPackPrice} onChange={(e) => setNewPackPrice(parseInt(e.target.value, 10) || 0)} className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[11px] w-full outline-none`} style={inputStyle} />
              </div>
              <button onClick={addCustomPack} className={`${retro.button} px-3 py-2 text-[10px] shrink-0`} style={{ color: "#4AE04A" }}><Plus size={11} className="inline mr-1" />Add</button>
            </div>
            <div className="space-y-1">
              {customPacks.map((pack) => {
                const isOwned = ownedPacks.includes(pack.id);
                return (
                  <div key={pack.id} className="flex items-center gap-2 py-1.5 px-2 rounded" style={{ background: "#0A0A28" }}>
                    <div className="flex rounded overflow-hidden shrink-0" style={{ width: 48, height: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
                      {pack.colors.map((hex, i) => <div key={i} style={{ flex: 1, background: hex }} />)}
                    </div>
                    <span className="text-[11px] flex-1" style={S_TEXT}>{pack.name}</span>
                    <span className="text-[9px] shrink-0" style={{ color: "#FFD700" }}>{pack.price}CR</span>
                    <button onClick={() => toggleOwnedPack(pack.id)} className="text-[9px] px-2 py-0.5 rounded shrink-0"
                      style={{ background: isOwned ? "#4AE04A20" : "#2A2A50", color: isOwned ? "#4AE04A" : "#5A6A8A", border: `1px solid ${isOwned ? "#4AE04A50" : "#3A3A5A"}` }}>
                      {isOwned ? "OWNED" : "GRANT"}
                    </button>
                    <button onClick={() => removeCustomPack(pack.id)} className="shrink-0 p-0.5 hover:opacity-80" style={S_RED}><Trash2 size={12} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* BADGES TAB                      */}
      {/* ============================== */}
      {tab === "stickers" && selectedPlayerId && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={grantAllStickers} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={{ color: "#4AE04A" }}>Grant All to {selectedPlayer?.name}</button>
            <button onClick={revokeAllStickers} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}>Revoke All</button>
            <span className="text-[10px] ml-auto" style={{ color: "#5A6A8A" }}>{ownedStickers.length} owned / {allStickers.length} available ({hiddenStickers.length} hidden)</span>
          </div>

          <div className={`${retro.raised} bg-[#0C0C30] p-3`}>
            <div className="text-[11px] font-bold mb-2" style={{ color: "#B0C0E0" }}>Built-in Badges ({BUILTIN_STICKERS.length})</div>
            <div className="space-y-1">
              {BUILTIN_STICKERS.map((sticker) => {
                const isHidden = hiddenStickers.includes(sticker.id);
                const isOwned = ownedStickers.includes(sticker.id);
                return (
                  <div key={sticker.id} className="flex items-center gap-2 py-1.5 px-2 rounded" style={{ background: isHidden ? "#1A0A0A" : "#0A0A28", opacity: isHidden ? 0.5 : 1 }}>
                    <Sticker size={14} className="shrink-0" style={{ color: "#8A7A6A" }} />
                    <span className="text-[11px] flex-1 min-w-0" style={{ color: isHidden ? "#5A4A4A" : "#C0D0F0" }}>{sticker.name}</span>
                    <span className="text-[9px] shrink-0" style={{ color: "#FFD700" }}>{sticker.price}CR</span>
                    <button onClick={() => toggleOwnedSticker(sticker.id)} className="text-[9px] px-2 py-0.5 rounded shrink-0" disabled={isHidden}
                      style={{ background: isOwned ? "#4AE04A20" : "#2A2A50", color: isOwned ? "#4AE04A" : "#5A6A8A", border: `1px solid ${isOwned ? "#4AE04A50" : "#3A3A5A"}` }}>
                      {isOwned ? "OWNED" : "GRANT"}
                    </button>
                    <button onClick={() => toggleHideSticker(sticker.id)} className="text-[9px] px-2 py-0.5 rounded shrink-0"
                      style={{ background: isHidden ? "#FF6A6A20" : "#2A2A50", color: isHidden ? "#FF6A6A" : "#5A6A8A", border: `1px solid ${isHidden ? "#FF6A6A50" : "#3A3A5A"}` }}>
                      {isHidden ? "SHOW" : "HIDE"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`${retro.raised} bg-[#0C0C30] p-3`}>
            <div className="text-[11px] font-bold mb-2" style={{ color: "#FFD700" }}><Plus size={11} className="inline mr-1" />Custom Badges ({customStickers.length})</div>
            <div className="flex gap-2 mb-3 items-end flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <label className="text-[9px] block mb-0.5" style={labelStyle}>Name</label>
                <input value={newStickerName} onChange={(e) => setNewStickerName(e.target.value)} className={inputClass} style={inputStyle} placeholder="Badge name" />
              </div>
              <div className="w-16">
                <label className="text-[9px] block mb-0.5" style={labelStyle}>Price</label>
                <input type="number" value={newStickerPrice} onChange={(e) => setNewStickerPrice(parseInt(e.target.value, 10) || 0)} className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[11px] w-full outline-none`} style={inputStyle} />
              </div>
              <button onClick={addCustomSticker} className={`${retro.button} px-3 py-2 text-[10px] shrink-0`} style={{ color: "#4AE04A" }}><Plus size={11} className="inline mr-1" />Add</button>
            </div>
            <div className="space-y-1">
              {customStickers.map((sticker) => {
                const isOwned = ownedStickers.includes(sticker.id);
                return (
                  <div key={sticker.id} className="flex items-center gap-2 py-1.5 px-2 rounded" style={{ background: "#0A0A28" }}>
                    <Sticker size={14} className="shrink-0" style={{ color: "#FFD700" }} />
                    <span className="text-[11px] flex-1" style={S_TEXT}>{sticker.name}</span>
                    <span className="text-[9px] shrink-0" style={{ color: "#FFD700" }}>{sticker.price}CR</span>
                    <button onClick={() => toggleOwnedSticker(sticker.id)} className="text-[9px] px-2 py-0.5 rounded shrink-0"
                      style={{ background: isOwned ? "#4AE04A20" : "#2A2A50", color: isOwned ? "#4AE04A" : "#5A6A8A", border: `1px solid ${isOwned ? "#4AE04A50" : "#3A3A5A"}` }}>
                      {isOwned ? "OWNED" : "GRANT"}
                    </button>
                    <button onClick={() => removeCustomSticker(sticker.id)} className="shrink-0 p-0.5 hover:opacity-80" style={S_RED}><Trash2 size={12} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* MYSTERY TAB                     */}
      {/* ============================== */}
      {tab === "mystery" && (
        <div className="space-y-4">
          <div className={`${retro.raised} bg-[#0C0C30] p-4`}>
            <div className="text-[13px] font-bold mb-3" style={{ color: "#DA70D6" }}>
              <HelpCircle size={14} className="inline mr-1.5" />Mystery Items [?]
            </div>
            <div className="text-[10px] mb-3" style={{ color: "#5A6A8A" }}>These items appear in the [?] tab of the Arcade Shop for all players.</div>

            <div className="flex gap-2 mb-4 items-end flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <label className="text-[9px] block mb-0.5" style={labelStyle}>Name</label>
                <input value={newMysteryName} onChange={(e) => setNewMysteryName(e.target.value)} className={inputClass} style={inputStyle} placeholder="Item name" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-[9px] block mb-0.5" style={labelStyle}>Description</label>
                <input value={newMysteryDesc} onChange={(e) => setNewMysteryDesc(e.target.value)} className={inputClass} style={inputStyle} placeholder="What is it?" />
              </div>
              <div className="w-16">
                <label className="text-[9px] block mb-0.5" style={labelStyle}>Price</label>
                <input type="number" value={newMysteryPrice} onChange={(e) => setNewMysteryPrice(parseInt(e.target.value, 10) || 0)} className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[11px] w-full outline-none`} style={inputStyle} />
              </div>
              <button onClick={addMysteryItem} className={`${retro.button} px-3 py-2 text-[10px] shrink-0`} style={{ color: "#DA70D6" }}><Plus size={11} className="inline mr-1" />Add</button>
            </div>

            <div className="space-y-1.5">
              {mysteryItems.length === 0 ? (
                <div className="text-[11px] text-center py-4" style={{ color: "#5A6A8A", fontStyle: "italic" }}>No mystery items yet.</div>
              ) : (
                mysteryItems.map((item) => {
                  const isOwned = selectedPlayerId ? ownedMysteryState.includes(item.id) : false;
                  return (
                    <div key={item.id} className={`${retro.raised} bg-[#0E0E35] p-2.5 flex items-center gap-2`} style={{ borderLeft: "3px solid #DA70D650" }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold" style={{ color: "#DA70D6" }}>{item.name}</div>
                        {item.description && <div className="text-[10px] mt-0.5" style={{ color: "#8A9ABF" }}>{item.description}</div>}
                      </div>
                      <span className="text-[10px] shrink-0" style={{ color: "#FFD700" }}>{item.price} CR</span>
                      {selectedPlayerId && (
                        <button onClick={() => toggleOwnedMystery(item.id)} className="text-[9px] px-2 py-0.5 rounded shrink-0"
                          style={{ background: isOwned ? "#4AE04A20" : "#2A2A50", color: isOwned ? "#4AE04A" : "#5A6A8A", border: `1px solid ${isOwned ? "#4AE04A50" : "#3A3A5A"}` }}>
                          {isOwned ? "OWNED" : "GRANT"}
                        </button>
                      )}
                      <button onClick={() => removeMysteryItem(item.id)} className="shrink-0 p-0.5 hover:opacity-80" style={S_RED}><Trash2 size={12} /></button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* LEADERBOARD TAB                 */}
      {/* ============================== */}
      {tab === "leaderboard" && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            <button onClick={handleAddEntry} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={{ color: "#4AE04A" }}><Plus size={11} className="inline mr-1" />Add Score</button>
            <button onClick={() => { setLeaderboard([]); setEditingEntry(null); setIsAddingEntry(false); }} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}>Clear All</button>
            <span className="text-[10px] ml-auto" style={{ color: "#5A6A8A" }}>{leaderboard.length} entries</span>
          </div>

          {editingEntry && (
            <div className={`${retro.raised} bg-[#0C0C30] p-4`}>
              <div className="text-[12px] font-bold mb-3" style={{ color: "#FFD700" }}>{isAddingEntry ? "Add Score" : "Edit Score"}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[9px] block mb-0.5" style={labelStyle}>Player Name</label>
                  <input value={editingEntry.player} onChange={(e) => setEditingEntry({ ...editingEntry, player: e.target.value })} className={inputClass} style={inputStyle} placeholder="Player name" />
                </div>
                <div>
                  <label className="text-[9px] block mb-0.5" style={labelStyle}>Game</label>
                  <select value={editingEntry.gameId} onChange={(e) => { const g = GAME_OPTIONS.find((x) => x.id === e.target.value); setEditingEntry({ ...editingEntry, gameId: e.target.value, gameName: g?.name || e.target.value }); }}
                    className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`} style={inputStyle}>
                    {GAME_OPTIONS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] block mb-0.5" style={labelStyle}>Score</label>
                  <input type="number" value={editingEntry.score} onChange={(e) => setEditingEntry({ ...editingEntry, score: parseInt(e.target.value, 10) || 0 })} className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[9px] block mb-0.5" style={labelStyle}>Date</label>
                  <input type="date" value={editingEntry.date.split("T")[0]} onChange={(e) => setEditingEntry({ ...editingEntry, date: new Date(e.target.value).toISOString() })}
                    className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`} style={inputStyle} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveEntry} className={`${retro.button} px-4 py-2 text-[11px]`} style={{ color: "#4AE04A" }}><Save size={12} className="inline mr-1" />Save</button>
                <button onClick={handleCancelEntryEdit} className={`${retro.button} px-4 py-2 text-[11px]`} style={S_RED}><X size={12} className="inline mr-1" />Cancel</button>
              </div>
            </div>
          )}

          <div className={`${retro.raised} bg-[#0C0C30] p-3`}>
            <div style={{ maxHeight: 400, overflowY: "auto" }} className="space-y-1">
              {leaderboard.length === 0 ? (
                <div className="text-[11px] text-center py-6" style={{ color: "#5A6A8A", fontStyle: "italic" }}>No leaderboard entries.</div>
              ) : (
                [...leaderboard].sort((a, b) => b.score - a.score).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2 py-1.5 px-2 rounded" style={{ background: "#0A0A28" }}>
                    <span className="text-[10px] shrink-0 w-16 truncate" style={S_ACCENT}>{entry.gameName}</span>
                    <span className="text-[11px] flex-1 min-w-0 truncate" style={S_TEXT}>{entry.player || "???"}</span>
                    <span className="text-[11px] shrink-0 font-bold" style={{ color: "#FFD700", fontFamily: "'Courier New', monospace" }}>{entry.score.toLocaleString()}</span>
                    <span className="text-[8px] shrink-0" style={{ color: "#5A6A8A" }}>{new Date(entry.date).toLocaleDateString()}</span>
                    <button onClick={() => { setEditingEntry(entry); setIsAddingEntry(false); }} className="shrink-0 p-0.5 hover:opacity-80" style={S_ACCENT}><Edit size={11} /></button>
                    <button onClick={() => handleDeleteEntry(entry.id)} className="shrink-0 p-0.5 hover:opacity-80" style={S_RED}><Trash2 size={11} /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}