import React, { useState, useEffect, useRef } from "react";
import { retro } from "./retro-styles";
import { getCredits, spendCredits, getOwnedColors, addOwnedColor, getOwnedPacks, addOwnedPack, getOwnedStickers, addOwnedSticker, getOwnedMystery, addOwnedMystery, getOwnedSounds, addOwnedSound } from "./game-leaderboard";
import shopkeeperImg from "@/assets/figma/Gnarpy_Boss1.png";
import stickerFancyStand from "@/assets/figma/Fancy_Man_Stand.png";
import stickerFancyJump from "@/assets/figma/Fancy_Man_Jump.png";
import stickerGnarpyPaw from "@/assets/figma/Paw.png";
import stickerGnarpy from "@/assets/figma/Gnarpy_Boss1.png";
import { safeGetItem, safeGetJson } from "./safe-storage";
import stickerGnarpyMiku from "@/assets/figma/Gnarpy_Miku_Boss2.png";

import { STORE_SOUND_PACKS, STORE_INDIVIDUAL_SOUNDS, ALL_SOUND_VARIANTS, previewSound, type SoundSlot } from "./sound-effects";

// ========================
// Types
// ========================
interface StoreItem {
  id: string;
  name: string;
  price: number;
  preview?: string;
}

interface ColorPack {
  id: string;
  name: string;
  price: number;
  colors: string[]; // hex values
}

interface ShelfCategory {
  id: string;
  label: string;
  icon: string;
  items: StoreItem[];
  emptyMessage: string;
}

// ========================
// Color Pack Data
// ========================

// ========================
// Individual Colors Data
// ========================
interface SingleColor {
  id: string;
  name: string;
  hex: string;
  price: number;
}

const STORE_COLORS: SingleColor[] = [
  // Reds (10-20)
  { id: "cherry",       name: "Cherry",        hex: "#DE3163", price: 15 },
  { id: "crimson",      name: "Crimson",       hex: "#DC143C", price: 10 },
  { id: "scarlet",      name: "Scarlet",       hex: "#FF2400", price: 10 },
  { id: "ruby",         name: "Ruby",          hex: "#E0115F", price: 20 },
  { id: "rose",         name: "Rose",          hex: "#FF007F", price: 15 },
  // Oranges (10-20)
  { id: "tangerine",    name: "Tangerine",     hex: "#FF9966", price: 10 },
  { id: "amber",        name: "Amber",         hex: "#FFBF00", price: 15 },
  { id: "rust",         name: "Rust",          hex: "#B7410E", price: 10 },
  { id: "peach",        name: "Peach",         hex: "#FFCBA4", price: 10 },
  { id: "coral",        name: "Coral",         hex: "#FF7F50", price: 15 },
  // Yellows (10-20)
  { id: "gold",         name: "Gold",          hex: "#FFD700", price: 20 },
  { id: "lemon",        name: "Lemon",         hex: "#FFF44F", price: 10 },
  { id: "canary",       name: "Canary",        hex: "#FFEF00", price: 10 },
  { id: "buttercup",    name: "Buttercup",     hex: "#F9E154", price: 15 },
  { id: "sunflower",    name: "Sunflower",     hex: "#FFDA03", price: 15 },
  // Greens (10-30)
  { id: "emerald",      name: "Emerald",       hex: "#50C878", price: 25 },
  { id: "lime",         name: "Lime",          hex: "#32CD32", price: 10 },
  { id: "mint",         name: "Mint",          hex: "#98FF98", price: 15 },
  { id: "forest",       name: "Forest",        hex: "#228B22", price: 20 },
  { id: "sage",         name: "Sage",          hex: "#BCB88A", price: 10 },
  { id: "jade",         name: "Jade",          hex: "#00A86B", price: 25 },
  { id: "olive",        name: "Olive",         hex: "#808000", price: 10 },
  // Blues (10-35)
  { id: "cobalt",       name: "Cobalt",        hex: "#0047AB", price: 20 },
  { id: "cerulean",     name: "Cerulean",      hex: "#007BA7", price: 25 },
  { id: "azure",        name: "Azure",         hex: "#007FFF", price: 15 },
  { id: "navy",         name: "Navy",          hex: "#000080", price: 10 },
  { id: "sky",          name: "Sky",           hex: "#87CEEB", price: 10 },
  { id: "sapphire",     name: "Sapphire",      hex: "#0F52BA", price: 30 },
  { id: "teal",         name: "Teal",          hex: "#008080", price: 15 },
  { id: "cyan",         name: "Cyan",          hex: "#00FFFF", price: 20 },
  // Purples (15-40)
  { id: "violet",       name: "Violet",        hex: "#7F00FF", price: 20 },
  { id: "lavender",     name: "Lavender",      hex: "#E6E6FA", price: 15 },
  { id: "plum",         name: "Plum",          hex: "#8E4585", price: 20 },
  { id: "mauve",        name: "Mauve",         hex: "#E0B0FF", price: 15 },
  { id: "amethyst",     name: "Amethyst",      hex: "#9966CC", price: 30 },
  { id: "indigo",       name: "Indigo",        hex: "#4B0082", price: 25 },
  { id: "orchid",       name: "Orchid",        hex: "#DA70D6", price: 20 },
  // Pinks (10-25)
  { id: "magenta",      name: "Magenta",       hex: "#FF00FF", price: 20 },
  { id: "bubblegum",    name: "Bubblegum",     hex: "#FFC1CC", price: 10 },
  { id: "salmon",       name: "Salmon",        hex: "#FA8072", price: 10 },
  { id: "hotpink",      name: "Hot Pink",      hex: "#FF69B4", price: 15 },
  { id: "blush",        name: "Blush",         hex: "#DE5D83", price: 15 },
  // Neutrals & Metallics (10-50)
  { id: "charcoal",     name: "Charcoal",      hex: "#36454F", price: 10 },
  { id: "slate",        name: "Slate",         hex: "#708090", price: 10 },
  { id: "ivory",        name: "Ivory",         hex: "#FFFFF0", price: 15 },
  { id: "silver",       name: "Silver",        hex: "#C0C0C0", price: 25 },
  { id: "bronze",       name: "Bronze",        hex: "#CD7F32", price: 35 },
  { id: "obsidian",     name: "Obsidian",      hex: "#0B0B0B", price: 40 },
  { id: "pearl",        name: "Pearl",         hex: "#FDEEF4", price: 45 },
  { id: "diamond",      name: "Diamond",       hex: "#B9F2FF", price: 50 },
];

// ========================
// Sticker Data
// ========================
interface Sticker {
  id: string;
  name: string;
  price: number;
  image: string;
}

const STORE_STICKERS: Sticker[] = [
  { id: "fancy-stand",  name: "Fancy Man Standing", price: 100, image: stickerFancyStand },
  { id: "fancy-jump",   name: "Fancy Man Jumping",  price: 100, image: stickerFancyJump },
  { id: "gnarpy-paw",   name: "Gnarpy Paw",         price: 150, image: stickerGnarpyPaw },
  { id: "gnarpy",       name: "Gnarpy",             price: 500, image: stickerGnarpy },
  { id: "gnarpy-miku",  name: "Gnarpy Miku",        price: 750, image: stickerGnarpyMiku },
];

// ========================
// DM-managed custom/hidden items
// ========================
function getHiddenColors(): string[] { return safeGetJson("inet-dm-arcade-hidden-colors", []); }
function getHiddenPacks(): string[] { return safeGetJson("inet-dm-arcade-hidden-packs", []); }
function getHiddenStickers(): string[] { return safeGetJson("inet-dm-arcade-hidden-stickers", []); }
function getCustomColors(): SingleColor[] { return safeGetJson("inet-dm-arcade-custom-colors", []); }
function getCustomPacks(): ColorPack[] { return safeGetJson("inet-dm-arcade-custom-packs", []); }
function getCustomStickers(): { id: string; name: string; price: number }[] { return safeGetJson("inet-dm-arcade-custom-stickers", []); }
function getMysteryItems(): { id: string; name: string; description: string; price: number }[] { return safeGetJson("inet-dm-arcade-mystery-items", []); }

const COLOR_PACKS: ColorPack[] = [
  { id: "cga",       name: "CGA",       price: 100,  colors: ["#000000", "#55FFFF", "#FF55FF", "#FFFFFF"] },
  { id: "gameboy",   name: "Game Boy",   price: 150,  colors: ["#0F380F", "#306230", "#8BAC0F", "#9BBC0F"] },
  { id: "nes",       name: "NES",        price: 250,  colors: ["#000000", "#FCFCFC", "#F83800", "#0058F8", "#00A800"] },
  { id: "c64",       name: "C64",        price: 350,  colors: ["#000000", "#FFFFFF", "#68372B", "#70A4B2", "#6F3D86", "#588D43"] },
  { id: "pico8",     name: "PICO-8",     price: 300,  colors: ["#000000", "#1D2B53", "#7E2553", "#008751", "#AB5236", "#FF004D"] },
  { id: "pastel",    name: "Pastel",     price: 100,  colors: ["#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9", "#BAE1FF"] },
  { id: "mono",      name: "Mono",       price: 100,  colors: ["#000000", "#404040", "#808080", "#C0C0C0", "#FFFFFF"] },
  { id: "sepia",     name: "Sepia",      price: 100,  colors: ["#704214", "#8B6914", "#C4A35A", "#D2B48C", "#F5DEB3"] },
  { id: "dark",      name: "Dark",       price: 200,  colors: ["#0D0D0D", "#1A1A2E", "#16213E", "#0F3460", "#533483"] },
  { id: "ocean",     name: "Ocean",      price: 200,  colors: ["#003545", "#006D77", "#83C5BE", "#EDF6F9", "#FFDDD2"] },
  { id: "earth",     name: "Earth",      price: 200,  colors: ["#5C4033", "#8B7355", "#A0522D", "#D2B48C", "#228B22"] },
  { id: "spring",    name: "Spring",     price: 200,  colors: ["#FF69B4", "#98FB98", "#FFD700", "#87CEEB", "#DDA0DD"] },
  { id: "summer",    name: "Summer",     price: 200,  colors: ["#FF6B35", "#F7C59F", "#EFEFD0", "#004E89", "#1A659E"] },
  { id: "fall",      name: "Fall",       price: 200,  colors: ["#8B4513", "#D2691E", "#FF8C00", "#DAA520", "#B22222"] },
  { id: "winter",    name: "Winter",     price: 200,  colors: ["#A8DADC", "#457B9D", "#1D3557", "#F1FAEE", "#E8E8E8"] },
  { id: "horror",    name: "Horror",     price: 400,  colors: ["#1A0A0A", "#4A0000", "#8B0000", "#2D0A0A", "#660000"] },
  { id: "halloween", name: "Halloween",  price: 400,  colors: ["#FF6600", "#000000", "#800080", "#1A1A1A", "#FFD700"] },
  { id: "christmas", name: "Christmas",  price: 500,  colors: ["#C41E3A", "#00843D", "#FFD700", "#FFFFFF", "#B22222"] },
  { id: "cat",       name: "Cat",        price: 200,  colors: ["#F5A623", "#FFECD2", "#2C2C2C", "#8B6914", "#E8D5B7", "#4A4A4A"] },
  { id: "celestial", name: "Celestial",  price: 350,  colors: ["#1B0A3C", "#2D1B69", "#C0C0FF", "#FFD700", "#7B68EE", "#E6E6FA"] },
  { id: "steampunk", name: "Steampunk",  price: 300,  colors: ["#B87333", "#D4A017", "#3E2723", "#8B7355", "#C9B037", "#4E342E"] },
  { id: "glitch",    name: "Glitch",     price: 300,  colors: ["#39FF14", "#FF00FF", "#00FFFF", "#0A0A0A", "#8B00FF", "#FF003F"] },
];

const BUY_RESPONSES = [
  "Good Choice!",
  "I like that one too!",
  "Great palette!",
  "Ooh, nice colors!",
];

const NOT_ENOUGH_RESPONSES = [
  "Not enough credits...",
  "Come back with more!",
  "Play more games first!",
];

const SOUND_BUY_RESPONSES = ["Nice sound!", "That's a good one!", "Great ear!", "Music to my ears!"];

// ========================
// Component
// ========================
export function ArcadeStore() {
  const currentUser = safeGetItem("inet-user") || "";
  const currentUserId = safeGetItem("inet-user-id") || "";
  const isDM = currentUserId === "dm" || currentUser === "DM";

  const [speechText, setSpeechText] = useState(isDM ? "Welcome, DM! Everything's on the house." : "Welcome!");
  const [speechVisible, setSpeechVisible] = useState(true);
  const [activeCategory, setActiveCategory] = useState("colors");
  const [bobFrame, setBobFrame] = useState(0);
  const [ownedPacks, setOwnedPacks] = useState<string[]>(getOwnedPacks());
  const [ownedColors, setOwnedColors] = useState<string[]>(getOwnedColors());
  const [ownedStickers, setOwnedStickers] = useState<string[]>(getOwnedStickers());
  const [credits, setCredits] = useState(getCredits());
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build dynamic item lists from built-ins + DM custom/hidden
  const hiddenColorIds = getHiddenColors();
  const hiddenPackIds = getHiddenPacks();
  const hiddenStickerIds = getHiddenStickers();
  const visibleColors = [...STORE_COLORS.filter((c) => !hiddenColorIds.includes(c.id)), ...getCustomColors()];
  const visiblePacks = [...COLOR_PACKS.filter((p) => !hiddenPackIds.includes(p.id)), ...getCustomPacks()];
  const builtinStickersVisible = STORE_STICKERS.filter((s) => !hiddenStickerIds.includes(s.id));
  const customStickerData = getCustomStickers();
  const mysteryItemsData = getMysteryItems();
  const [ownedMystery, setOwnedMystery] = useState<string[]>(() => getOwnedMystery());

  const [ownedSounds, setOwnedSounds] = useState<string[]>(() => getOwnedSounds());

  // Mascot idle bob animation
  useEffect(() => {
    const interval = setInterval(() => {
      setBobFrame((f) => (f + 1) % 60);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Refresh credits periodically
  useEffect(() => {
    const interval = setInterval(() => setCredits(getCredits()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Entrance speech
  useEffect(() => {
    setSpeechVisible(true);
    setSpeechText(isDM ? "Welcome, DM! Everything's on the house." : "Welcome!");
  }, []);

  const showSpeech = (msg: string, duration = 4000) => {
    setSpeechText(msg);
    setSpeechVisible(true);
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    speechTimeoutRef.current = setTimeout(() => {
      setSpeechText("...");
    }, duration);
  };

  const handleBuyPack = (pack: ColorPack) => {
    if (ownedPacks.includes(pack.id)) {
      showSpeech("You already own that!");
      return;
    }
    if (!isDM && !spendCredits(pack.price)) {
      const msg = NOT_ENOUGH_RESPONSES[Math.floor(Math.random() * NOT_ENOUGH_RESPONSES.length)];
      showSpeech(msg);
      return;
    }
    addOwnedPack(pack.id);
    setOwnedPacks(getOwnedPacks());
    setCredits(getCredits());
    showSpeech(isDM ? "Added to your collection!" : BUY_RESPONSES[Math.floor(Math.random() * BUY_RESPONSES.length)]);
  };

  const handleBuyColor = (color: SingleColor) => {
    if (ownedColors.includes(color.id)) {
      showSpeech("You already own that!");
      return;
    }
    if (!isDM && !spendCredits(color.price)) {
      const msg = NOT_ENOUGH_RESPONSES[Math.floor(Math.random() * NOT_ENOUGH_RESPONSES.length)];
      showSpeech(msg);
      return;
    }
    addOwnedColor(color.id);
    setOwnedColors(getOwnedColors());
    setCredits(getCredits());
    showSpeech(isDM ? "Added to your collection!" : BUY_RESPONSES[Math.floor(Math.random() * BUY_RESPONSES.length)]);
  };

  const handleBuySticker = (sticker: Sticker) => {
    if (ownedStickers.includes(sticker.id)) {
      showSpeech("You already own that!");
      return;
    }
    if (!isDM && !spendCredits(sticker.price)) {
      const msg = NOT_ENOUGH_RESPONSES[Math.floor(Math.random() * NOT_ENOUGH_RESPONSES.length)];
      showSpeech(msg);
      return;
    }
    addOwnedSticker(sticker.id);
    setOwnedStickers(getOwnedStickers());
    setCredits(getCredits());
    showSpeech(isDM ? "Added to your collection!" : BUY_RESPONSES[Math.floor(Math.random() * BUY_RESPONSES.length)]);
  };

  const handleBuyCustomSticker = (sticker: { id: string; name: string; price: number }) => {
    if (ownedStickers.includes(sticker.id)) {
      showSpeech("You already own that!");
      return;
    }
    if (!isDM && !spendCredits(sticker.price)) {
      const msg = NOT_ENOUGH_RESPONSES[Math.floor(Math.random() * NOT_ENOUGH_RESPONSES.length)];
      showSpeech(msg);
      return;
    }
    addOwnedSticker(sticker.id);
    setOwnedStickers(getOwnedStickers());
    setCredits(getCredits());
    showSpeech(isDM ? "Added to your collection!" : BUY_RESPONSES[Math.floor(Math.random() * BUY_RESPONSES.length)]);
  };

  const handleBuyMystery = (item: { id: string; name: string; price: number }) => {
    if (ownedMystery.includes(item.id)) {
      showSpeech("You already own that!");
      return;
    }
    if (!isDM && !spendCredits(item.price)) {
      const msg = NOT_ENOUGH_RESPONSES[Math.floor(Math.random() * NOT_ENOUGH_RESPONSES.length)];
      showSpeech(msg);
      return;
    }
    addOwnedMystery(item.id);
    setOwnedMystery(getOwnedMystery());
    setCredits(getCredits());
    showSpeech(isDM ? "Added to your collection!" : "Ooh, mysterious!");
  };

  const handleBuySoundPack = (pack: typeof STORE_SOUND_PACKS[0]) => {
    const newSounds = pack.soundIds.filter(sid => !ownedSounds.includes(sid));
    if (newSounds.length === 0) {
      showSpeech("You already own all sounds in that pack!");
      return;
    }
    if (!isDM && !spendCredits(pack.price)) {
      const msg = NOT_ENOUGH_RESPONSES[Math.floor(Math.random() * NOT_ENOUGH_RESPONSES.length)];
      showSpeech(msg);
      return;
    }
    for (const sid of newSounds) addOwnedSound(sid);
    setOwnedSounds(getOwnedSounds());
    setCredits(getCredits());
    showSpeech(isDM ? "All sounds added!" : SOUND_BUY_RESPONSES[Math.floor(Math.random() * SOUND_BUY_RESPONSES.length)]);
  };

  const handleBuyIndividualSound = (sound: typeof STORE_INDIVIDUAL_SOUNDS[0]) => {
    if (ownedSounds.includes(sound.id)) {
      showSpeech("You already own that!");
      return;
    }
    if (!isDM && !spendCredits(sound.price)) {
      const msg = NOT_ENOUGH_RESPONSES[Math.floor(Math.random() * NOT_ENOUGH_RESPONSES.length)];
      showSpeech(msg);
      return;
    }
    addOwnedSound(sound.id);
    setOwnedSounds(getOwnedSounds());
    setCredits(getCredits());
    showSpeech(isDM ? "Added to your collection!" : SOUND_BUY_RESPONSES[Math.floor(Math.random() * SOUND_BUY_RESPONSES.length)]);
  };

  const categories: ShelfCategory[] = [
    {
      id: "colors",
      label: "Colors",
      icon: "[C]",
      items: [],
      emptyMessage: "No colors in stock yet...",
    },
    {
      id: "colorpacks",
      label: "Color Packs",
      icon: "[CP]",
      items: [],
      emptyMessage: "",
    },
    {
      id: "stickers",
      label: "Badges",
      icon: "[B]",
      items: [],
      emptyMessage: "No badges in stock yet...",
    },
    {
      id: "mystery",
      label: "???",
      icon: "[?]",
      items: [],
      emptyMessage: "What could go here...?",
    },
    {
      id: "sounds",
      label: "Sounds",
      icon: "[♪]",
      items: [],
      emptyMessage: "",
    },
  ];

  const currentCategory = categories.find((c) => c.id === activeCategory) || categories[0];
  const bobY = Math.sin((bobFrame / 60) * Math.PI * 2) * 3;
  const priceLabel = (price: number) => isDM ? "FREE" : `${price} CR`;
  const dmCanAfford = (_price: number) => isDM ? true : credits >= _price;

  // ========================
  // Color Pack Card
  // ========================
  const renderColorPackCard = (pack: ColorPack) => {
    const owned = ownedPacks.includes(pack.id);
    const canAfford = dmCanAfford(pack.price);

    return (
      <div
        key={pack.id}
        style={{
          background: owned
            ? "linear-gradient(180deg, #1A2A1A 0%, #0E1A0E 100%)"
            : "linear-gradient(180deg, #2A1A0A 0%, #1A1008 100%)",
          border: owned
            ? "1px solid #2A5A2A"
            : "1px solid #4A3A1A",
          borderRadius: 6,
          padding: 10,
          display: "flex",
          flexDirection: "column" as const,
          gap: 8,
          cursor: owned ? "default" : "pointer",
          transition: "all 0.15s",
          opacity: !owned && !canAfford ? 0.6 : 1,
        }}
        onClick={() => !owned && handleBuyPack(pack)}
        onMouseEnter={(e) => {
          if (!owned) {
            (e.currentTarget as HTMLDivElement).style.borderColor = canAfford ? "#FFD700" : "#6A4A2A";
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
          }
        }}
        onMouseLeave={(e) => {
          if (!owned) {
            (e.currentTarget as HTMLDivElement).style.borderColor = "#4A3A1A";
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
          }
        }}
      >
        {/* Color Swatch Preview */}
        <div
          style={{
            display: "flex",
            borderRadius: 4,
            overflow: "hidden",
            height: 32,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {pack.colors.map((hex, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: hex,
              }}
              title={hex}
            />
          ))}
        </div>

        {/* Pack Name */}
        <div
          style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 11,
            fontWeight: 700,
            color: owned ? "#4AE04A" : "#D0C0A0",
            textAlign: "center",
            letterSpacing: 0.5,
          }}
        >
          {pack.name}
        </div>

        {/* Hex Values */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap" as const,
            gap: 2,
            justifyContent: "center",
          }}
        >
          {pack.colors.map((hex, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 1,
                  background: hex,
                  border: "1px solid rgba(255,255,255,0.15)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 8,
                  color: "#6A5A4A",
                  letterSpacing: -0.3,
                }}
              >
                {hex}
              </span>
            </div>
          ))}
        </div>

        {/* Price / Owned Badge */}
        <div style={{ textAlign: "center" }}>
          {owned ? (
            <span
              style={{
                fontFamily: "'Courier New', monospace",
                fontSize: 10,
                color: "#4AE04A",
                fontWeight: 700,
                background: "#4AE04A18",
                padding: "2px 8px",
                border: "1px solid #4AE04A40",
                borderRadius: 3,
              }}
            >
              OWNED
            </span>
          ) : (
            <span
              style={{
                fontFamily: "'Courier New', monospace",
                fontSize: 10,
                color: canAfford ? "#FFD700" : "#6A5A4A",
                fontWeight: 700,
                background: canAfford ? "#FFD70015" : "transparent",
                padding: "2px 8px",
                border: `1px solid ${canAfford ? "#FFD70040" : "#3A2A1A"}`,
                borderRadius: 3,
              }}
            >
              {priceLabel(pack.price)}
            </span>
          )}
        </div>
      </div>
    );
  };

  // ========================
  // Shelf rendering for non-colorpack categories
  // ========================
  const renderShelves = () => (
    <div
      className="relative"
      style={{
        background: "linear-gradient(180deg, #2A1A0A 0%, #1E1208 100%)",
        border: "1px solid #3A2A1A",
        borderRadius: 4,
        minHeight: 280,
        padding: 12,
      }}
    >
      {[0, 1, 2].map((shelfIdx) => (
        <div key={shelfIdx} className="mb-1">
          <div
            className="flex items-end gap-3 px-3 min-h-[64px]"
            style={{ paddingBottom: 6 }}
          >
            {currentCategory.items.length === 0 && shelfIdx === 1 && (
              <div
                className="w-full text-center py-4"
                style={{
                  color: "#4A3A1A",
                  fontFamily: "'Courier New', monospace",
                  fontSize: 12,
                  fontStyle: "italic",
                }}
              >
                {currentCategory.emptyMessage}
              </div>
            )}
          </div>
          <div
            style={{
              height: 8,
              background: "linear-gradient(180deg, #6A4A2A 0%, #4A3218 60%, #3A2510 100%)",
              borderTop: "1px solid #8A6A4A",
              borderBottom: "2px solid #2A1A0A",
              borderRadius: 1,
              boxShadow: "0 3px 6px rgba(0,0,0,0.4)",
            }}
          />
          <div className="flex justify-between px-6 -mt-[1px]">
            <div
              style={{
                width: 6,
                height: 12,
                background: "#4A3A1A",
                borderBottom: "1px solid #3A2A0A",
                borderRight: "1px solid #5A4A2A",
              }}
            />
            <div
              style={{
                width: 6,
                height: 12,
                background: "#4A3A1A",
                borderBottom: "1px solid #3A2A0A",
                borderLeft: "1px solid #5A4A2A",
              }}
            />
          </div>
        </div>
      ))}

      {/* Dust particles */}
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 2,
            height: 2,
            borderRadius: "50%",
            background: "rgba(255,215,0,0.1)",
            top: `${15 + ((i * 37 + 13) % 70)}%`,
            left: `${10 + ((i * 53 + 7) % 80)}%`,
            animation: `float ${3 + i * 0.5}s ease-in-out infinite alternate`,
          }}
        />
      ))}
    </div>
  );

  // ========================
  // Color Packs grid
  // ========================
  const renderColorPacks = () => (
    <div
      className="relative"
      style={{
        background: "linear-gradient(180deg, #2A1A0A 0%, #1E1208 100%)",
        border: "1px solid #3A2A1A",
        borderRadius: 4,
        minHeight: 280,
        padding: 12,
      }}
    >
      {/* Section header */}
      <div
        className="text-center mb-3 pb-2"
        style={{
          borderBottom: "1px solid #3A2A1A",
          fontFamily: "'Courier New', monospace",
          fontSize: 11,
          color: "#6A5A4A",
        }}
      >
        {visiblePacks.length} packs available &middot; {ownedPacks.length} owned
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 10,
          maxHeight: 420,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {visiblePacks.map(renderColorPackCard)}
      </div>
    </div>
  );

  // ========================
  // Individual Colors grid
  // ========================
  const renderColors = () => (
    <div
      className="relative"
      style={{
        background: "linear-gradient(180deg, #2A1A0A 0%, #1E1208 100%)",
        border: "1px solid #3A2A1A",
        borderRadius: 4,
        minHeight: 280,
        padding: 12,
      }}
    >
      {/* Section header */}
      <div
        className="text-center mb-3 pb-2"
        style={{
          borderBottom: "1px solid #3A2A1A",
          fontFamily: "'Courier New', monospace",
          fontSize: 11,
          color: "#6A5A4A",
        }}
      >
        {visibleColors.length} colors available &middot; {ownedColors.length} owned
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
          gap: 8,
          maxHeight: 420,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {visibleColors.map((color) => {
          const owned = ownedColors.includes(color.id);
          const canAfford = dmCanAfford(color.price);
          return (
            <div
              key={color.id}
              onClick={() => !owned && handleBuyColor(color)}
              style={{
                background: owned
                  ? "linear-gradient(180deg, #1A2A1A 0%, #0E1A0E 100%)"
                  : "linear-gradient(180deg, #2A1A0A 0%, #1A1008 100%)",
                border: owned ? "1px solid #2A5A2A" : "1px solid #4A3A1A",
                borderRadius: 5,
                padding: 8,
                display: "flex",
                flexDirection: "column" as const,
                alignItems: "center",
                gap: 5,
                cursor: owned ? "default" : "pointer",
                transition: "all 0.15s",
                opacity: !owned && !canAfford ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!owned) {
                  (e.currentTarget as HTMLDivElement).style.borderColor = canAfford ? "#FFD700" : "#6A4A2A";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                if (!owned) {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#4A3A1A";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                }
              }}
            >
              {/* Color swatch */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 4,
                  background: color.hex,
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: `0 2px 6px ${color.hex}44`,
                }}
              />
              {/* Name */}
              <div
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 9,
                  fontWeight: 700,
                  color: owned ? "#4AE04A" : "#D0C0A0",
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {color.name}
              </div>
              {/* Hex */}
              <div
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 7,
                  color: "#6A5A4A",
                  letterSpacing: -0.3,
                }}
              >
                {color.hex}
              </div>
              {/* Price / Owned */}
              {owned ? (
                <span
                  style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: 8,
                    color: "#4AE04A",
                    fontWeight: 700,
                    background: "#4AE04A18",
                    padding: "1px 6px",
                    border: "1px solid #4AE04A40",
                    borderRadius: 2,
                  }}
                >
                  OWNED
                </span>
              ) : (
                <span
                  style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: 8,
                    color: canAfford ? "#FFD700" : "#6A5A4A",
                    fontWeight: 700,
                    background: canAfford ? "#FFD70015" : "transparent",
                    padding: "1px 6px",
                    border: `1px solid ${canAfford ? "#FFD70040" : "#3A2A1A"}`,
                    borderRadius: 2,
                  }}
                >
                  {priceLabel(color.price)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ========================
  // Stickers grid
  // ========================
  const renderStickers = () => (
    <div
      className="relative"
      style={{
        background: "linear-gradient(180deg, #2A1A0A 0%, #1E1208 100%)",
        border: "1px solid #3A2A1A",
        borderRadius: 4,
        minHeight: 280,
        padding: 12,
      }}
    >
      {/* Section header */}
      <div
        className="text-center mb-3 pb-2"
        style={{
          borderBottom: "1px solid #3A2A1A",
          fontFamily: "'Courier New', monospace",
          fontSize: 11,
          color: "#6A5A4A",
        }}
      >
        {builtinStickersVisible.length + customStickerData.length} badges available &middot; {ownedStickers.length} owned
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
          gap: 10,
          maxHeight: 420,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {builtinStickersVisible.map((sticker) => {
          const owned = ownedStickers.includes(sticker.id);
          const canAfford = dmCanAfford(sticker.price);
          return (
            <div
              key={sticker.id}
              onClick={() => !owned && handleBuySticker(sticker)}
              style={{
                background: owned
                  ? "linear-gradient(180deg, #1A2A1A 0%, #0E1A0E 100%)"
                  : "linear-gradient(180deg, #2A1A0A 0%, #1A1008 100%)",
                border: owned ? "1px solid #2A5A2A" : "1px solid #4A3A1A",
                borderRadius: 5,
                padding: 8,
                display: "flex",
                flexDirection: "column" as const,
                alignItems: "center",
                gap: 5,
                cursor: owned ? "default" : "pointer",
                transition: "all 0.15s",
                opacity: !owned && !canAfford ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!owned) {
                  (e.currentTarget as HTMLDivElement).style.borderColor = canAfford ? "#FFD700" : "#6A4A2A";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                if (!owned) {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#4A3A1A";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                }
              }}
            >
              {/* Sticker image */}
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 4,
                  background: "url(" + sticker.image + ") no-repeat center center",
                  backgroundSize: "contain",
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: `0 2px 6px #00000044`,
                }}
              />
              {/* Name */}
              <div
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 9,
                  fontWeight: 700,
                  color: owned ? "#4AE04A" : "#D0C0A0",
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {sticker.name}
              </div>
              {/* Price / Owned */}
              {owned ? (
                <span
                  style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: 8,
                    color: "#4AE04A",
                    fontWeight: 700,
                    background: "#4AE04A18",
                    padding: "1px 6px",
                    border: "1px solid #4AE04A40",
                    borderRadius: 2,
                  }}
                >
                  OWNED
                </span>
              ) : (
                <span
                  style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: 8,
                    color: canAfford ? "#FFD700" : "#6A5A4A",
                    fontWeight: 700,
                    background: canAfford ? "#FFD70015" : "transparent",
                    padding: "1px 6px",
                    border: `1px solid ${canAfford ? "#FFD70040" : "#3A2A1A"}`,
                    borderRadius: 2,
                  }}
                >
                  {priceLabel(sticker.price)}
                </span>
              )}
            </div>
          );
        })}
        {/* Custom stickers (DM-added, no image) */}
        {customStickerData.map((cs) => {
          const owned = ownedStickers.includes(cs.id);
          const canAfford = dmCanAfford(cs.price);
          return (
            <div
              key={cs.id}
              onClick={() => !owned && handleBuyCustomSticker(cs)}
              style={{
                background: owned ? "linear-gradient(180deg, #1A2A1A 0%, #0E1A0E 100%)" : "linear-gradient(180deg, #2A1A0A 0%, #1A1008 100%)",
                border: owned ? "1px solid #2A5A2A" : "1px solid #4A3A1A",
                borderRadius: 5, padding: 8, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 5,
                cursor: owned ? "default" : "pointer", transition: "all 0.15s", opacity: !owned && !canAfford ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!owned) { (e.currentTarget as HTMLDivElement).style.borderColor = canAfford ? "#FFD700" : "#6A4A2A"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; } }}
              onMouseLeave={(e) => { if (!owned) { (e.currentTarget as HTMLDivElement).style.borderColor = "#4A3A1A"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; } }}
            >
              <div style={{ width: 50, height: 50, borderRadius: 4, background: "#2A1A0A", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Courier New', monospace", fontSize: 20, color: "#6A5A4A" }}>?</div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: 9, fontWeight: 700, color: owned ? "#4AE04A" : "#D0C0A0", textAlign: "center", lineHeight: 1.2 }}>{cs.name}</div>
              {owned ? (
                <span style={{ fontFamily: "'Courier New', monospace", fontSize: 8, color: "#4AE04A", fontWeight: 700, background: "#4AE04A18", padding: "1px 6px", border: "1px solid #4AE04A40", borderRadius: 2 }}>OWNED</span>
              ) : (
                <span style={{ fontFamily: "'Courier New', monospace", fontSize: 8, color: canAfford ? "#FFD700" : "#3A2A1A", fontWeight: 700, background: canAfford ? "#FFD70015" : "transparent", padding: "1px 6px", border: `1px solid ${canAfford ? "#FFD70040" : "#3A2A1A"}`, borderRadius: 2 }}>{priceLabel(cs.price)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ========================
  // Mystery items renderer
  // ========================
  const renderMystery = () => (
    <div
      className="relative"
      style={{
        background: "linear-gradient(180deg, #1A0A1A 0%, #0E060E 100%)",
        border: "1px solid #3A1A3A",
        borderRadius: 4,
        minHeight: 280,
        padding: 12,
      }}
    >
      <div className="text-center mb-3 pb-2" style={{ borderBottom: "1px solid #3A1A3A", fontFamily: "'Courier New', monospace", fontSize: 11, color: "#8A5A8A" }}>
        {mysteryItemsData.length} mysterious item{mysteryItemsData.length !== 1 ? "s" : ""}...
      </div>
      {mysteryItemsData.length === 0 ? (
        <div className="text-center py-12" style={{ fontFamily: "'Courier New', monospace", fontSize: 12, color: "#4A2A4A", fontStyle: "italic" }}>
          What could go here...?
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
          {mysteryItemsData.map((item) => {
            const owned = ownedMystery.includes(item.id);
            const canAfford = dmCanAfford(item.price);
            return (
              <div
                key={item.id}
                onClick={() => !owned && handleBuyMystery(item)}
                style={{
                  background: owned ? "linear-gradient(180deg, #1A2A1A 0%, #0E1A0E 100%)" : "linear-gradient(180deg, #2A1A2A 0%, #1A0A1A 100%)",
                  border: owned ? "1px solid #2A5A2A" : "1px solid #5A2A5A",
                  borderRadius: 5, padding: 10, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 6,
                  cursor: owned ? "default" : "pointer", transition: "all 0.15s", opacity: !owned && !canAfford ? 0.6 : 1,
                }}
                onMouseEnter={(e) => { if (!owned) { (e.currentTarget as HTMLDivElement).style.borderColor = canAfford ? "#DA70D6" : "#5A2A5A"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; } }}
                onMouseLeave={(e) => { if (!owned) { (e.currentTarget as HTMLDivElement).style.borderColor = "#5A2A5A"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; } }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 4, background: "radial-gradient(circle, #3A1A3A 0%, #1A0A1A 100%)", border: "1px solid #5A2A5A40", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Courier New', monospace", fontSize: 22, color: "#DA70D6", textShadow: "0 0 8px rgba(218,112,214,0.4)" }}>?</div>
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: 9, fontWeight: 700, color: owned ? "#4AE04A" : "#DA70D6", textAlign: "center", lineHeight: 1.2 }}>{item.name}</div>
                {item.description && <div style={{ fontFamily: "'Courier New', monospace", fontSize: 7, color: "#6A4A6A", textAlign: "center", lineHeight: 1.2 }}>{item.description}</div>}
                {owned ? (
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 8, color: "#4AE04A", fontWeight: 700, background: "#4AE04A18", padding: "1px 6px", border: "1px solid #4AE04A40", borderRadius: 2 }}>OWNED</span>
                ) : (
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 8, color: canAfford ? "#DA70D6" : "#5A3A5A", fontWeight: 700, background: canAfford ? "#DA70D615" : "transparent", padding: "1px 6px", border: `1px solid ${canAfford ? "#DA70D640" : "#3A1A3A"}`, borderRadius: 2 }}>{priceLabel(item.price)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ========================
  // Sounds renderer
  // ========================
  const SLOT_LABELS: Record<SoundSlot, string> = { navClick: "Navigation", tabClick: "Tab Switch", diceRoll: "Dice Roll", successChime: "Success" };

  const renderSounds = () => (
    <div className="relative" style={{ background: "linear-gradient(180deg, #0A1A2A 0%, #06101A 100%)", border: "1px solid #1A3A5A", borderRadius: 4, minHeight: 280, padding: 12 }}>
      <div className="text-center mb-3 pb-2" style={{ borderBottom: "1px solid #1A3A5A", fontFamily: "'Courier New', monospace", fontSize: 11, color: "#5A8ABB" }}>
        {STORE_SOUND_PACKS.length} packs + {STORE_INDIVIDUAL_SOUNDS.length} individual sounds &middot; {ownedSounds.length} owned
      </div>
      <div className="mb-4">
        <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: "#5A8ABB", marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>SOUND PACKS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {STORE_SOUND_PACKS.map((pack) => {
            const allOwned = pack.soundIds.every(sid => ownedSounds.includes(sid));
            const newCount = pack.soundIds.filter(sid => !ownedSounds.includes(sid)).length;
            const canAfford = dmCanAfford(pack.price);
            return (
              <div key={pack.id} onClick={() => !allOwned && handleBuySoundPack(pack)} style={{ background: allOwned ? "linear-gradient(180deg, #1A2A1A 0%, #0E1A0E 100%)" : "linear-gradient(180deg, #0E1A2E 0%, #0A1020 100%)", border: allOwned ? "1px solid #2A5A2A" : "1px solid #2A4A6A", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column" as const, gap: 6, cursor: allOwned ? "default" : "pointer", transition: "all 0.15s", opacity: !allOwned && !canAfford ? 0.6 : 1 }}
                onMouseEnter={(e) => { if (!allOwned) { (e.currentTarget as HTMLDivElement).style.borderColor = canAfford ? "#7AB0FF" : "#2A4A6A"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; } }}
                onMouseLeave={(e) => { if (!allOwned) { (e.currentTarget as HTMLDivElement).style.borderColor = "#2A4A6A"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; } }}
              >
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11, fontWeight: 700, color: allOwned ? "#4AE04A" : "#AACCFF", letterSpacing: 0.5 }}>{pack.name}</div>
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: 8, color: "#5A7A9A", lineHeight: 1.3 }}>{pack.description}</div>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 3 }}>
                  {pack.soundIds.map(sid => {
                    const sv = ALL_SOUND_VARIANTS.find(v => v.id === sid);
                    const sOwned = ownedSounds.includes(sid);
                    return (
                      <button key={sid} onClick={(e) => { e.stopPropagation(); previewSound(sid, sid.startsWith("dice-") ? 3 : undefined); showSpeech(sv?.name || sid); }}
                        style={{ fontFamily: "'Courier New', monospace", fontSize: 7, padding: "1px 4px", background: sOwned ? "#4AE04A18" : "#0A1A2A", color: sOwned ? "#4AE04A" : "#5A7A9A", border: `1px solid ${sOwned ? "#4AE04A40" : "#2A3A5A"}`, borderRadius: 2, cursor: "pointer" }}
                        title={`Preview: ${sv?.name || sid}`}
                      >
                        &#9834; {sv?.name || sid} ({SLOT_LABELS[sv?.slot || ("navClick" as SoundSlot)]})
                      </button>
                    );
                  })}
                </div>
                <div style={{ textAlign: "center" }}>
                  {allOwned ? (
                    <span style={{ fontFamily: "'Courier New', monospace", fontSize: 8, color: "#4AE04A", fontWeight: 700, background: "#4AE04A18", padding: "1px 6px", border: "1px solid #4AE04A40", borderRadius: 2 }}>ALL OWNED</span>
                  ) : (
                    <span style={{ fontFamily: "'Courier New', monospace", fontSize: 8, color: canAfford ? "#7AB0FF" : "#3A5A7A", fontWeight: 700, background: canAfford ? "#7AB0FF15" : "transparent", padding: "1px 6px", border: `1px solid ${canAfford ? "#7AB0FF40" : "#2A3A5A"}`, borderRadius: 2 }}>{priceLabel(pack.price)}{!isDM && ` (${newCount} new)`}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: "#5A8ABB", marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>INDIVIDUAL SOUNDS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
          {STORE_INDIVIDUAL_SOUNDS.map((sound) => {
            const sOwned = ownedSounds.includes(sound.id);
            const canAfford = dmCanAfford(sound.price);
            const variant = ALL_SOUND_VARIANTS.find(v => v.id === sound.id);
            return (
              <div key={sound.id} style={{ background: sOwned ? "linear-gradient(180deg, #1A2A1A 0%, #0E1A0E 100%)" : "linear-gradient(180deg, #0E1A2E 0%, #0A1020 100%)", border: sOwned ? "1px solid #2A5A2A" : "1px solid #2A4A6A", borderRadius: 5, padding: 8, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4, cursor: sOwned ? "default" : "pointer", transition: "all 0.15s", opacity: !sOwned && !canAfford ? 0.6 : 1 }}
                onClick={() => !sOwned && handleBuyIndividualSound(sound)}
                onMouseEnter={(e) => { if (!sOwned) { (e.currentTarget as HTMLDivElement).style.borderColor = canAfford ? "#7AB0FF" : "#2A4A6A"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; } }}
                onMouseLeave={(e) => { if (!sOwned) { (e.currentTarget as HTMLDivElement).style.borderColor = "#2A4A6A"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; } }}
              >
                <button onClick={(e) => { e.stopPropagation(); previewSound(sound.id, sound.slot === "diceRoll" ? 3 : undefined); showSpeech(sound.name); }}
                  style={{ width: 32, height: 32, borderRadius: 4, background: "radial-gradient(circle, #1A2A4A 0%, #0A1020 100%)", border: "1px solid #2A4A6A40", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Courier New', monospace", fontSize: 16, color: "#5A8ABB", cursor: "pointer" }}
                  title="Preview"
                >&#9834;</button>
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: 9, fontWeight: 700, color: sOwned ? "#4AE04A" : "#AACCFF", textAlign: "center", lineHeight: 1.2 }}>{sound.name}</div>
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: 7, color: "#3A5A7A" }}>{SLOT_LABELS[sound.slot]}</div>
                {variant && <div style={{ fontFamily: "'Courier New', monospace", fontSize: 7, color: "#3A5A7A", textAlign: "center", lineHeight: 1.2 }}>{variant.description}</div>}
                {sOwned ? (
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 8, color: "#4AE04A", fontWeight: 700, background: "#4AE04A18", padding: "1px 6px", border: "1px solid #4AE04A40", borderRadius: 2 }}>OWNED</span>
                ) : (
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 8, color: canAfford ? "#7AB0FF" : "#3A5A7A", fontWeight: 700, background: canAfford ? "#7AB0FF15" : "transparent", padding: "1px 6px", border: `1px solid ${canAfford ? "#7AB0FF40" : "#2A3A5A"}`, borderRadius: 2 }}>{priceLabel(sound.price)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[420px]">
      {/* ==================== */}
      {/* LEFT SIDE - Shop Stand + Mascot */}
      {/* ==================== */}
      <div className="flex flex-col items-center lg:w-[280px] shrink-0">
        {/* Shop Sign */}
        <div
          className="w-full text-center py-2 mb-3"
          style={{
            background: "linear-gradient(180deg, #2A1A0A 0%, #1A1008 100%)",
            border: "2px solid #4A3A1A",
            borderBottom: "3px solid #3A2A0A",
            fontFamily: "'Courier New', monospace",
            color: "#FFD700",
            fontSize: 16,
            fontWeight: 700,
            textShadow: "0 0 8px rgba(255,215,0,0.4)",
            letterSpacing: 2,
          }}
        >
          SHOP
        </div>

        {/* Speech Bubble */}
        <div
          className="relative w-full mb-2"
          style={{
            opacity: speechVisible ? 1 : 0,
            transition: "opacity 0.3s",
          }}
        >
          <div
            className="px-4 py-3 text-center"
            style={{
              background: "#F0F0E0",
              border: "2px solid #2A2A1A",
              borderRadius: 8,
              color: "#1A1A0A",
              fontFamily: "'Courier New', monospace",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.3)",
              minHeight: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {speechText}
          </div>
          {/* Speech bubble tail */}
          <div
            style={{
              position: "absolute",
              bottom: -10,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderTop: "10px solid #2A2A1A",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -7,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: "8px solid #F0F0E0",
            }}
          />
        </div>

        {/* Mascot Character */}
        <div
          className="relative"
          style={{
            transform: `translateY(${bobY}px)`,
            transition: "transform 0.05s linear",
          }}
        >
          <img
            src={shopkeeperImg}
            alt="Shopkeeper"
            style={{
              width: 160,
              height: 160,
              objectFit: "contain",
              filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
            }}
          />
        </div>

        {/* Shop Counter / Stand */}
        <div
          className="w-full"
          style={{
            background: "linear-gradient(180deg, #5A3A1A 0%, #3A2510 100%)",
            border: "2px solid #6A4A2A",
            borderTop: "3px solid #7A5A3A",
            height: 40,
            marginTop: -8,
            position: "relative",
            boxShadow: "inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 10,
              right: 10,
              height: 1,
              background: "rgba(255,255,255,0.06)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 18,
              left: 20,
              right: 15,
              height: 1,
              background: "rgba(255,255,255,0.04)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 26,
              left: 8,
              right: 25,
              height: 1,
              background: "rgba(255,255,255,0.05)",
            }}
          />
        </div>

        {/* Floor shadow under counter */}
        <div
          style={{
            width: "90%",
            height: 6,
            background: "radial-gradient(ellipse, rgba(0,0,0,0.3) 0%, transparent 70%)",
            marginTop: 2,
          }}
        />
      </div>

      {/* ==================== */}
      {/* RIGHT SIDE - Shelves */}
      {/* ==================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Category Tabs */}
        <div className="flex gap-0 mb-0 flex-wrap" style={{ borderBottom: "2px solid #3A2A1A" }}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="px-4 py-2 text-[12px] flex items-center gap-2 transition-colors cursor-pointer"
              style={{
                color: activeCategory === cat.id ? "#FFD700" : "#5A4A3A",
                background: activeCategory === cat.id
                  ? "linear-gradient(180deg, #2A1A0A 0%, #1A1008 100%)"
                  : "transparent",
                borderTop:
                  activeCategory === cat.id
                    ? "2px solid #FFD700"
                    : "2px solid transparent",
                borderLeft:
                  activeCategory === cat.id
                    ? "1px solid #3A2A1A"
                    : "1px solid transparent",
                borderRight:
                  activeCategory === cat.id
                    ? "1px solid #3A2A1A"
                    : "1px solid transparent",
                borderBottom: activeCategory === cat.id ? "2px solid #1A1008" : "none",
                marginBottom: "-2px",
                fontFamily: "'Courier New', monospace",
                fontWeight: activeCategory === cat.id ? 700 : 400,
              }}
            >
              <span>{cat.icon}</span> {cat.label}
            </button>
          ))}
        </div>

        {/* Shelf Display Area */}
        <div
          className="flex-1 p-4"
          style={{
            background: "linear-gradient(180deg, #1A1008 0%, #0E0A06 100%)",
            border: "2px solid #3A2A1A",
            borderTop: "none",
            minHeight: 300,
          }}
        >
          {activeCategory === "colorpacks" ? renderColorPacks() : activeCategory === "colors" ? renderColors() : activeCategory === "stickers" ? renderStickers() : activeCategory === "mystery" ? renderMystery() : activeCategory === "sounds" ? renderSounds() : renderShelves()}
        </div>

        {/* Bottom info strip */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{
            background: "#0A0806",
            border: "1px solid #2A1A0A",
            borderTop: "none",
          }}
        >
          <div
            className="text-[10px]"
            style={{
              color: "#4A3A2A",
              fontFamily: "'Courier New', monospace",
            }}
          >
            {activeCategory === "colorpacks"
              ? `${visiblePacks.length} packs · ${ownedPacks.length} owned`
              : activeCategory === "colors"
              ? `${visibleColors.length} colors · ${ownedColors.length} owned`
              : activeCategory === "stickers"
              ? `${builtinStickersVisible.length + customStickerData.length} badges · ${ownedStickers.length} owned`
              : activeCategory === "mystery"
              ? `${mysteryItemsData.length} items · ${ownedMystery.length} owned`
              : activeCategory === "sounds"
              ? `${STORE_SOUND_PACKS.length} packs + ${STORE_INDIVIDUAL_SOUNDS.length} sounds · ${ownedSounds.length} owned`
              : `${currentCategory.items.length} item${currentCategory.items.length !== 1 ? "s" : ""} in ${currentCategory.label}`}
          </div>
          <div
            className="text-[10px]"
            style={{
              color: "#3A2A1A",
              fontFamily: "'Courier New', monospace",
            }}
          >
            Credits: {isDM ? "∞" : credits}
          </div>
        </div>
      </div>
    </div>
  );
}