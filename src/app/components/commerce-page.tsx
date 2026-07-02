import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import { getPlayerTheme, firstColor, ts, bc } from "./player-theme";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  ArrowLeft, Plus, Trash2, X, Store, Package, Coins,
  ShoppingCart, Search, Scroll, Eye, Check, Pencil, MapPin,
  Users, SortAsc, SortDesc, Settings, EyeOff, MessageSquare,
  Upload, Building2, Sparkles, RotateCcw, GripVertical,
  Sun, Moon, ChevronLeft, ChevronRight,
} from "lucide-react";
import { safeGetItem } from "./safe-storage";
import { appStore } from "@/lib/app-store";
import { loadDMItems, saveDMItems } from "@/lib/player-state-api";
import { DISPLAY_CONTENTS } from "./shared-styles";

// ════════════════════════════════════════════
// Types
// ════════════════════════════════════════════

type ItemRarity = "Common" | "Uncommon" | "Rare" | "Very Rare" | "Legendary";

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  quantity: number; // -1 = unlimited
  rarity: ItemRarity;
  category: string;
  notes: string; // DM-only notes
  hidden: boolean; // hidden from players
  addsToInventory?: boolean; // when purchased, adds to player inventory
  inventoryItemId?: string; // which DM player item to add/update
  inventoryQuantity?: number; // quantity to add per purchase unit
}

interface Shop {
  id: string;
  name: string;
  description: string;
  location: string;
  owner: string;
  status: "Open" | "Closed" | "Limited" | "Invitation Only" | "Traveling";
  items: ShopItem[];
  notes: string;
  hidden: boolean;
  createdAt: number;
  // ── Customization (DM-editable) ──
  logoEmoji: string;
  themeColor: string;
  mascotEmoji: string;
  tagline: string;
  greeting: string;
  mascotName: string;
  categories: string[];
  logoImage?: string;
  mascotImage?: string;
  greetings?: string[];
  shopType?: "general" | "unique" | "corporation";
  sortOrder?: number;
  // ── Extended Appearance ──
  bgGradientStart?: string;
  bgGradientEnd?: string;
  bgGradientAngle?: number;
  sidebarBg?: string;
  headerBg?: string;
  cardBg?: string;
  borderTint?: string;
  categoryBarBg?: string;
  mascotAreaBg?: string;
  bgGradientType?: "linear" | "radial";
  lightMode?: boolean;
}

interface CartItem {
  shopId: string;
  itemId: string;
  quantity: number;
}

interface LedgerEntry {
  id: string;
  shopId: string;
  shopName: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  buyerName: string;
  buyerId: string;
  timestamp: number;
}

// ════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════

const RARITIES: ItemRarity[] = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
const SHOP_STATUSES: Shop["status"][] = ["Open", "Closed", "Limited", "Invitation Only", "Traveling"];
const DEFAULT_CATEGORIES = ["Weapons", "Armor", "Potions", "Scrolls", "Tools", "Magical", "Misc"];

const THEME_PRESETS = [
  "#8B5E3C", "#4A7BFF", "#7ACA8A", "#C4A0FF", "#FFAA4A",
  "#FF6A6A", "#6ABAFF", "#DA70D6", "#4AE0C0", "#FFD700",
  "#E06040", "#50B060", "#8080C0", "#C08040", "#60A0C0",
  "#A06080",
];

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Inventory integration ──
interface InvItemCompat {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  quantity: number;
  rarity: string;
  notes: string;
  hidden: boolean;
  tags?: string[];
}

interface InvSubTabCompat {
  id: string;
  name: string;
  icon: string;
  items: InvItemCompat[];
  groups?: { id: string; name: string; itemIds: string[] }[];
}

type DmManagedItemCompat = {
  id: string;
  name: string;
  tags: string[];
  assignedTo: string[];
  customFields: Record<string, string>;
  type?: string;
  rarity?: string;
  description?: string;
  locked?: boolean;
};

type NexusNomadInventoryState = {
  id: string;
  version: number;
  invTabs: InvSubTabCompat[];
  [key: string]: unknown;
};

const NEXUS_NOMAD_STATE_ID = "default";
const NEXUS_NOMAD_STATE_VERSION = 1;

function cloneInvTabs(tabs: InvSubTabCompat[]): InvSubTabCompat[] {
  return tabs.map((tab) => ({
    ...tab,
    items: (tab.items || []).map((item) => ({ ...item })),
    groups: (tab.groups || []).map((group) => ({ ...group, itemIds: [...group.itemIds] })),
  }));
}

function defaultNexusNomadInventoryState(): NexusNomadInventoryState {
  return {
    id: NEXUS_NOMAD_STATE_ID,
    version: NEXUS_NOMAD_STATE_VERSION,
    invTabs: [],
  };
}

function normalizeNexusNomadInventoryState(raw: unknown): NexusNomadInventoryState {
  if (!raw || typeof raw !== "object") return defaultNexusNomadInventoryState();
  const candidate = raw as Partial<NexusNomadInventoryState>;
  return {
    ...candidate,
    id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : NEXUS_NOMAD_STATE_ID,
    version: typeof candidate.version === "number" ? candidate.version : NEXUS_NOMAD_STATE_VERSION,
    invTabs: Array.isArray(candidate.invTabs) ? cloneInvTabs(candidate.invTabs) : [],
  } as NexusNomadInventoryState;
}


function getCurrencyItems(
  invTabs: InvSubTabCompat[],
  dmItems: DmManagedItemCompat[],
  currentUserId: string,
): { name: string; quantity: number; tabId: string; itemId: string }[] {
  const results: { name: string; quantity: number; tabId: string; itemId: string }[] = [];
  for (const tab of invTabs) {
    for (const item of tab.items || []) {
      if (item.tags?.includes("Currency")) {
        results.push({ name: item.name, quantity: item.quantity, tabId: tab.id, itemId: item.id });
      }
    }
  }
  if (currentUserId) {
    for (const item of dmItems) {
      if (item.tags?.includes("Currency") && item.assignedTo?.includes(currentUserId)) {
        const qty = parseInt(item.customFields?.["Quantity::Amount"] || "0", 10);
        if (!results.some((result) => result.name === item.name)) {
          results.push({ name: item.name, quantity: qty, tabId: "dm-items", itemId: item.id });
        }
      }
    }
  }
  return results;
}

function deductCurrencyFromInventoryState(
  invTabs: InvSubTabCompat[],
  currencyName: string,
  amount: number,
): InvSubTabCompat[] | null {
  const nextTabs = cloneInvTabs(invTabs);
  for (const tab of nextTabs) {
    for (const item of tab.items || []) {
      if (item.tags?.includes("Currency") && item.name === currencyName) {
        if (item.quantity < amount && item.quantity !== -1) return null;
        if (item.quantity !== -1) item.quantity -= amount;
        return nextTabs;
      }
    }
  }
  return null;
}

function addPurchasesToInventoryState(
  invTabs: InvSubTabCompat[],
  purchases: { name: string; description: string; price: number; currency: string; quantity: number; rarity: string }[],
): InvSubTabCompat[] {
  const nextTabs = cloneInvTabs(invTabs);
  let purchTab = nextTabs.find((tab) => tab.id === "inv-purchases");
  if (!purchTab) {
    purchTab = { id: "inv-purchases", name: "Purchases", icon: "shopping-bag", items: [], groups: [] };
    nextTabs.push(purchTab);
  }

  for (const purchase of purchases) {
    const existing = purchTab.items.find((item) => item.name === purchase.name);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + purchase.quantity;
    } else {
      purchTab.items.push({
        id: uid(),
        name: purchase.name,
        description: purchase.description,
        price: purchase.price,
        currency: purchase.currency,
        quantity: purchase.quantity,
        rarity: purchase.rarity,
        notes: "",
        hidden: false,
      });
    }
  }

  return nextTabs;
}

function handleImageUpload(maxSizeKB: number, cb: (dataUrl: string) => void, acceptGif = false) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = acceptGif ? "image/*,.gif,.webp,.apng" : "image/*";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > maxSizeKB * 1024) {
      alert(`Image too large. Max ${maxSizeKB}KB. For animated GIFs, try a smaller resolution.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => cb(reader.result as string);
    reader.readAsDataURL(file);
  };
  input.click();
}

const DRAG_TYPE_SHOP = "COMMERCE_SHOP";

function useRotatingGreeting(greetings: string[], defaultGreeting: string, intervalMs = 6000) {
  const greetingsKey = greetings.join("\x00");
  const allGreetings = React.useMemo(() => {
    const list = greetings.length > 0 ? greetings : defaultGreeting ? [defaultGreeting] : [];
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greetingsKey, defaultGreeting]);
  const [index, setIndex] = React.useState(0);
  const [fade, setFade] = React.useState(true);

  React.useEffect(() => {
    if (allGreetings.length <= 1) return;
    const timer = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex(prev => (prev + 1) % allGreetings.length);
        setFade(true);
      }, 400);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [allGreetings.length, intervalMs]);

  return { text: allGreetings[index % allGreetings.length] || "", fade, count: allGreetings.length };
}

const SHOP_TYPES = [
  { value: "general" as const, label: "General Commerce", icon: Store, color: "#8A919E" },
  { value: "unique" as const, label: "Unique Shops", icon: Sparkles, color: "#9AA0B0" },
  { value: "corporation" as const, label: "Corporations", icon: Building2, color: "#7A8090" },
];

const STEEL = {
  accent: "#A0A8B8",
  accentBright: "#C0C8D8",
  bg1: "#08090C",
  bg2: "#0C0D12",
  bg3: "#101118",
  panel: "#0E0F16",
  card: "#111219",
  border: "#1E2028",
  borderLight: "#282A35",
  text: "#C8CCD8",
  textDim: "#6A7088",
  textMuted: "#4A4E5E",
  inputBg: "#0A0B10",
  gold: "#C8B060",
  dmLabel: "#B8BCD0",
  dmSection: "#D0D4E0",
};



const RARITY_COLORS: Record<ItemRarity, string> = {
  Common: "#9AAACC",
  Uncommon: "#7ACA8A",
  Rare: "#6A9AFF",
  "Very Rare": "#C4A0FF",
  Legendary: "#FFAA4A",
};

const STATUS_COLORS: Record<Shop["status"], string> = {
  Open: "#4ACA6A",
  Closed: "#FF5A5A",
  Limited: "#FFAA4A",
  "Invitation Only": "#C4A0FF",
  Traveling: "#6ABAFF",
};

// ════════════════════════════════════════════
// Default test shop
// ════════════════════════════════════════════

const TEST_SHOP: Shop = {
  id: "shop-test-quickstop",
  name: "Pump-N-Go QuickMart",
  description: "A fluorescent-lit gas station and convenience store wedged between a laundromat and a bail bonds office. The slushie machine hums louder than the A/C. A hand-written sign on the door reads: NO SHOES, NO SHIRT, NO SERVICE. The hot dogs have been on the roller grill since dawn. Maybe longer.",
  location: "1402 Route 9, next to the Suds-O-Mat",
  owner: "Dale Grubeck",
  status: "Open",
  notes: "",
  hidden: false,
  createdAt: Date.now(),
  logoEmoji: "",
  themeColor: "#D4AA40",
  mascotEmoji: "",
  tagline: "\"If we ain't got it, you don't need it.\"",
  greeting: "Pump 4's busted. Use pump 2. And don't try the egg salad.",
  mascotName: "Dale",
  categories: ["Snacks & Drinks", "Smokes & Misc", "Auto & Travel", "Behind the Counter"],
  shopType: "general",
  sortOrder: 0,
  greetings: [
    "Pump 4's busted. Use pump 2. And don't try the egg salad.",
    "Bathroom's for customers only. And I mean paying customers.",
    "We close at midnight. Technically. I'm usually here 'til 2.",
    "Slushie machine just got refilled. Blue flavor and... the other one.",
    "You buying something or just standing there letting the cold air out?",
    "Lottery tickets are behind me. No, I can't tell you which ones are winners.",
  ],
  items: [
    { id: "ti-1", name: "Gas (Regular Unleaded)", description: "87 octane unleaded gasoline. Price per gallon. Pre-pay at pump or inside.", price: 4, currency: "Credits", quantity: -1, rarity: "Common", category: "Auto & Travel", notes: "", hidden: false },
    { id: "ti-2", name: "Gas (Premium)", description: "93 octane premium unleaded gasoline. Price per gallon.", price: 6, currency: "Credits", quantity: -1, rarity: "Common", category: "Auto & Travel", notes: "", hidden: false },
    { id: "ti-3", name: "Roller Grill Hot Dog", description: "Beef frankfurter on a white flour bun. Condiment packets available: mustard, ketchup, relish.", price: 2, currency: "Credits", quantity: -1, rarity: "Common", category: "Snacks & Drinks", notes: "", hidden: false },
    { id: "ti-4", name: "Slushie (32oz)", description: "32oz frozen carbonated beverage. Available flavors: Blue Raspberry, Cherry.", price: 2, currency: "Credits", quantity: -1, rarity: "Common", category: "Snacks & Drinks", notes: "", hidden: false },
    { id: "ti-5", name: "Coffee (Self-Serve)", description: "12oz drip coffee, self-serve. Regular or Decaf. Cream, sugar, and lids at the station.", price: 1, currency: "Credits", quantity: -1, rarity: "Common", category: "Snacks & Drinks", notes: "", hidden: false },
    { id: "ti-6", name: "Potato Chips (Bag)", description: "2.5oz bag of potato chips. Available in Original, BBQ, and Ranch.", price: 1, currency: "Credits", quantity: -1, rarity: "Common", category: "Snacks & Drinks", notes: "", hidden: false },
    { id: "ti-7", name: "Energy Drink (24oz)", description: "24oz canned energy drink. 300mg caffeine, taurine, B-vitamins. Not recommended for children.", price: 3, currency: "Credits", quantity: -1, rarity: "Common", category: "Snacks & Drinks", notes: "", hidden: false },
    { id: "ti-8", name: "Bottled Water (16.9oz)", description: "16.9oz plastic bottle of purified drinking water.", price: 1, currency: "Credits", quantity: -1, rarity: "Common", category: "Snacks & Drinks", notes: "", hidden: false },
    { id: "ti-9", name: "Cigarettes (Pack of 20)", description: "Pack of 20 filtered cigarettes. Must be 18+ to purchase. Behind counter.", price: 8, currency: "Credits", quantity: -1, rarity: "Common", category: "Smokes & Misc", notes: "", hidden: false },
    { id: "ti-10", name: "Disposable Lighter", description: "Butane disposable lighter with adjustable flame. Assorted colors.", price: 1, currency: "Credits", quantity: -1, rarity: "Common", category: "Smokes & Misc", notes: "", hidden: false },
    { id: "ti-11", name: "Scratch-Off Lottery Ticket", description: "Instant win scratch-off ticket. Top prize: 10,000 Credits. Must be 18+ to purchase.", price: 5, currency: "Credits", quantity: -1, rarity: "Common", category: "Smokes & Misc", notes: "DM determines results", hidden: false },
    { id: "ti-12", name: "Phone Charger Cable (Universal)", description: "Universal USB charging cable. 3ft length. Compatible with most devices.", price: 10, currency: "Credits", quantity: 8, rarity: "Common", category: "Smokes & Misc", notes: "", hidden: false },
    { id: "ti-13", name: "Sunglasses", description: "Plastic frame aviator-style sunglasses. One size fits most. UV protection label included.", price: 5, currency: "Credits", quantity: 15, rarity: "Common", category: "Smokes & Misc", notes: "", hidden: false },
    { id: "ti-14", name: "Windshield Washer Fluid (1 gal)", description: "1 gallon jug of all-season windshield washer fluid. -20°F rated.", price: 4, currency: "Credits", quantity: -1, rarity: "Common", category: "Auto & Travel", notes: "", hidden: false },
    { id: "ti-15", name: "Emergency Tire Sealant", description: "12oz aerosol can of tire sealant and inflator. Temporary repair for punctures up to 1/4 inch.", price: 12, currency: "Credits", quantity: 5, rarity: "Common", category: "Auto & Travel", notes: "", hidden: false },
    { id: "ti-16", name: "Road Map (Tri-County)", description: "Folded paper road map covering the tri-county area. Includes highway exits, rest stops, and points of interest.", price: 3, currency: "Credits", quantity: 4, rarity: "Common", category: "Auto & Travel", notes: "", hidden: false },
    { id: "ti-17", name: "Disposable Camera (27 exp)", description: "Single-use 35mm film camera. 27 exposures. Built-in flash. Film processing not included.", price: 8, currency: "Credits", quantity: 6, rarity: "Common", category: "Smokes & Misc", notes: "", hidden: false },
    { id: "ti-18", name: "First Aid Kit (Travel)", description: "Compact first aid kit. Contains adhesive bandages, antiseptic wipes, gauze pads, medical tape, and instant cold compress.", price: 7, currency: "Credits", quantity: 10, rarity: "Common", category: "Behind the Counter", notes: "", hidden: false },
    { id: "ti-19", name: "Beef Jerky (Homemade, 4oz)", description: "4oz resealable bag of smoked beef jerky. Locally sourced. No preservatives.", price: 4, currency: "Credits", quantity: 12, rarity: "Uncommon", category: "Behind the Counter", notes: "", hidden: false },
    { id: "ti-20", name: "Egg Salad Sandwich", description: "Pre-packaged egg salad sandwich on white bread. Refrigerated. Check sell-by date before purchase.", price: 3, currency: "Credits", quantity: 4, rarity: "Common", category: "Snacks & Drinks", notes: "", hidden: false },
  ],
};

// ════════════════════════════════════════════
// Component
// ════════════════════════════════════════════

function MascotWindow({ shop, sc, bgOverride }: { shop: Shop; sc: string; bgOverride?: string }) {
  const allGreetings = shop.greetings && shop.greetings.length > 0 ? shop.greetings : shop.greeting ? [shop.greeting] : [];
  const { text, fade, count } = useRotatingGreeting(allGreetings, shop.greeting || "");
  const isAnimated = shop.mascotImage ? /\.(gif|webp|apng)/i.test(shop.mascotImage.substring(0, 30)) || shop.mascotImage.startsWith("data:image/gif") || shop.mascotImage.startsWith("data:image/webp") : false;

  return (
    <div className="flex-1 flex flex-col p-4" style={bgOverride ? { background: bgOverride } : undefined}>
      <div className="flex-1 flex flex-col justify-end">
        {text && (
          <div className="mb-3 p-3 relative" style={{ background: `${sc}08`, border: `1px solid ${sc}20`, borderRadius: 0 }}>
            <div className="flex items-start gap-1.5">
              <MessageSquare size={10} className="flex-shrink-0 mt-0.5" style={{ color: `${sc}80` }} />
              <p className="text-[11px] leading-relaxed italic" style={{ color: `${sc}CC`, transition: "opacity 0.4s ease", opacity: fade ? 1 : 0 }}>
                {text}
              </p>
            </div>
            {count > 1 && (
              <div className="absolute top-1 right-1.5 flex items-center gap-0.5">
                <RotateCcw size={7} style={{ color: `${sc}40` }} />
              </div>
            )}
            <div style={{ position: "absolute", bottom: -6, left: 24, width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `6px solid ${sc}20` }} />
          </div>
        )}

        <div className="flex flex-col items-center">
          <div className="w-full aspect-square max-w-[180px] flex items-center justify-center relative overflow-hidden" style={{ background: `linear-gradient(180deg, ${sc}05 0%, ${sc}12 100%)`, border: `1px solid ${sc}20`, boxShadow: `inset 0 0 30px ${sc}05` }}>
            <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: `2px solid ${sc}40`, borderLeft: `2px solid ${sc}40` }} />
            <div className="absolute top-0 right-0 w-3 h-3" style={{ borderTop: `2px solid ${sc}40`, borderRight: `2px solid ${sc}40` }} />
            <div className="absolute bottom-0 left-0 w-3 h-3" style={{ borderBottom: `2px solid ${sc}40`, borderLeft: `2px solid ${sc}40` }} />
            <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: `2px solid ${sc}40`, borderRight: `2px solid ${sc}40` }} />

            {shop.mascotImage ? (
              <img
                src={shop.mascotImage}
                alt=""
                className="w-full h-full object-cover"
                style={{
                  filter: `drop-shadow(0 0 12px ${sc}40)`,
                  imageRendering: isAnimated ? "auto" : undefined,
                }}
              />
            ) : (
              <span
                className="text-[72px] select-none"
                style={{
                  filter: `drop-shadow(0 0 12px ${sc}40)`,
                  animation: "commerce-mascot-idle 3s ease-in-out infinite",
                }}
              >
                {shop.mascotEmoji || ""}
              </span>
            )}
          </div>
          {shop.mascotName && (
            <div className="mt-2 px-3 py-1 text-center" style={{ background: `${sc}10`, borderBottom: `2px solid ${sc}30` }}>
              <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: sc }}>{shop.mascotName}</span>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes commerce-mascot-idle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

function DraggableShopCard({
  shop, isDM, accent, index, groupType,
  onSelect, onReorder, renderStatusBadge,
}: {
  shop: Shop; isDM: boolean; accent: string; index: number; groupType: string;
  onSelect: () => void;
  onReorder: (dragIdx: number, hoverIdx: number, type: string) => void;
  renderStatusBadge: (status: Shop["status"]) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sc2 = shop.themeColor || firstColor(accent);
  const itemCount = isDM ? shop.items.length : shop.items.filter(i => !i.hidden).length;
  const previewGreeting = shop.greetings?.[0] || shop.greeting || "";

  const [{ isDragging }, drag, preview] = useDrag({
    type: DRAG_TYPE_SHOP,
    item: () => ({ index, groupType, shopId: shop.id }),
    canDrag: isDM,
    collect: (m) => ({ isDragging: m.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: DRAG_TYPE_SHOP,
    canDrop: (item: any) => item.groupType === groupType,
    hover: (item: any) => {
      if (item.index === index || item.groupType !== groupType) return;
      onReorder(item.index, index, groupType);
      item.index = index;
    },
    collect: (m) => ({ isOver: m.isOver() }),
  });

  drop(preview(ref));

  return (
    <div
      ref={ref}
      className="transition-all group"
      style={{ opacity: isDragging ? 0.4 : 1, transform: isOver ? "scale(1.01)" : undefined }}
    >
      <button
        onClick={onSelect}
        className="w-full text-left p-0 transition-all hover:brightness-110 group"
        style={{ background: STEEL.card, border: `1px solid ${sc2}20`, boxShadow: `0 2px 12px ${sc2}06` }}
      >
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${sc2}12, ${sc2}04)`, borderBottom: `1px solid ${sc2}12` }}>
          {isDM && (
            <div ref={(node) => { drag(node); }} className="cursor-grab active:cursor-grabbing flex-shrink-0 hover:opacity-80" style={{ color: STEEL.textMuted }}>
              <GripVertical size={12} />
            </div>
          )}
          <div className="w-9 h-9 flex items-center justify-center text-[24px] flex-shrink-0 overflow-hidden" style={{ background: `${sc2}08`, border: `1px solid ${sc2}25` }}>
            {shop.logoImage ? (
              <img src={shop.logoImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[13px] font-bold font-mono" style={{ color: sc2 }}>{shop.logoEmoji || shop.name.charAt(0)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-bold truncate" style={{ color: sc2 }}>{shop.name}</h3>
            {shop.tagline && <p className="text-[10px] italic truncate" style={{ color: `${sc2}70` }}>{shop.tagline}</p>}
          </div>
          {shop.hidden && isDM && <EyeOff size={11} style={{ color: "#FF5A5A", opacity: 0.6 }} />}
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            {renderStatusBadge(shop.status)}
            <span className="text-[9px] font-mono" style={{ color: STEEL.textMuted }}>{itemCount} items</span>
          </div>
          {shop.owner && (
            <div className="flex items-center gap-1.5">
              <Users size={9} style={{ color: STEEL.textMuted }} />
              <span className="text-[10px]" style={{ color: STEEL.textDim }}>{shop.owner}</span>
            </div>
          )}
          {shop.location && (
            <div className="flex items-center gap-1.5">
              <MapPin size={9} style={{ color: STEEL.textMuted }} />
              <span className="text-[10px]" style={{ color: STEEL.textDim }}>{shop.location}</span>
            </div>
          )}
          {shop.description && (
            <p className="text-[10px] leading-relaxed line-clamp-2" style={{ color: STEEL.textDim }}>{shop.description}</p>
          )}
          <div className="flex items-center gap-2 pt-1" style={{ borderTop: `1px solid ${STEEL.border}` }}>
            {shop.mascotImage ? (
              <div className="w-5 h-5 overflow-hidden flex-shrink-0" style={{ border: `1px solid ${sc2}25` }}>
                <img src={shop.mascotImage} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <span className="text-[11px] font-mono font-bold" style={{ color: `${sc2}60` }}>{shop.mascotName?.charAt(0) || "?"}</span>
            )}
            <span className="text-[10px] italic flex-1 truncate" style={{ color: `${sc2}50` }}>
              {previewGreeting ? `"${previewGreeting.slice(0, 40)}${previewGreeting.length > 40 ? "..." : ""}"` : ""}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

function ScrollableShopRow({ children, shopCount }: { children: React.ReactNode; shopCount: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", checkScroll); ro.disconnect(); };
  }, [checkScroll, shopCount]);

  const scroll = (dir: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 340, behavior: "smooth" });
  };

  return (
    <div className="relative group/scroll">
      {canScrollLeft && (
        <button
          onClick={() => scroll(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center transition-opacity opacity-70 hover:opacity-100"
          style={{ background: `${STEEL.bg1}E0`, border: `1px solid ${STEEL.border}`, boxShadow: `0 0 12px ${STEEL.bg1}` }}
        >
          <ChevronLeft size={16} style={{ color: STEEL.text }} />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scroll(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center transition-opacity opacity-70 hover:opacity-100"
          style={{ background: `${STEEL.bg1}E0`, border: `1px solid ${STEEL.border}`, boxShadow: `0 0 12px ${STEEL.bg1}` }}
        >
          <ChevronRight size={16} style={{ color: STEEL.text }} />
        </button>
      )}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none" style={{ background: `linear-gradient(90deg, ${STEEL.bg1}, transparent)` }} />
      )}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none" style={{ background: `linear-gradient(270deg, ${STEEL.bg1}, transparent)` }} />
      )}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>
    </div>
  );
}

export function CommercePage() {
  const navigate = useNavigate();
  const theme = getPlayerTheme();
  const currentUser = safeGetItem("inet-user") || "";
  const currentUserId = safeGetItem("inet-user-id") || "";
  const isDM = currentUser === "DM";

  const accent = theme.accentColor;

  // ── State ──
  const [shops, setShops] = useState<Shop[]>([TEST_SHOP]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [nexusNomadState, setNexusNomadState] = useState<NexusNomadInventoryState>(defaultNexusNomadInventoryState);
  const [dmItemsCache, setDmItemsCache] = useState<DmManagedItemCompat[]>([]);
  const [commerceLoading, setCommerceLoading] = useState(true);
  const [commerceError, setCommerceError] = useState<string | null>(null);
  const hasLoadedCommerceRef = useRef(false);

  // UI state
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [creatingShop, setCreatingShop] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [filterRarity, setFilterRarity] = useState<ItemRarity | "all">("all");
  const [sortBy, setSortBy] = useState<"name" | "price" | "rarity">("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [showShopSettings, setShowShopSettings] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const [draftShop, setDraftShop] = useState<Partial<Shop>>({});
  const [draftItem, setDraftItem] = useState<Partial<ShopItem>>({});
  const [newCategoryDraft, setNewCategoryDraft] = useState("");

  const nexusInvTabs = useMemo(() => nexusNomadState.invTabs || [], [nexusNomadState]);

  useEffect(() => {
    let cancelled = false;

    async function loadCommerceState() {
      try {
        setCommerceLoading(true);
        setCommerceError(null);

        const [shopsData, cartData, ledgerData, nexusStateData] = await Promise.all([
          appStore.listCommerceShops<Shop>().catch(() => [] as Shop[]),
          currentUserId ? appStore.loadPlayerCommerceCart<CartItem[]>(currentUserId, []) : Promise.resolve([] as CartItem[]),
          appStore.listCommerceLedger<LedgerEntry>().catch(() => [] as LedgerEntry[]),
          appStore.loadNexusNomadState<NexusNomadInventoryState>(NEXUS_NOMAD_STATE_ID, defaultNexusNomadInventoryState()),
        ]);

        if (cancelled) return;

        setShops(Array.isArray(shopsData) && shopsData.length > 0 ? shopsData : [TEST_SHOP]);
        setCart(Array.isArray(cartData) ? cartData : []);
        setLedger(Array.isArray(ledgerData) ? ledgerData : []);
        setNexusNomadState(normalizeNexusNomadInventoryState(nexusStateData));

        if (isDM) {
          try {
            const remoteItems = await loadDMItems<DmManagedItemCompat[]>();
            if (!cancelled && Array.isArray(remoteItems)) {
              setDmItemsCache(remoteItems as unknown as DmManagedItemCompat[]);
            }
          } catch (err) {
            if (!cancelled) {
              setDmItemsCache([]);
              console.warn("Failed to load DM item templates for commerce", err);
            }
          }
        } else if (!cancelled) {
          setDmItemsCache([]);
        }

        hasLoadedCommerceRef.current = true;
      } catch (err) {
        if (!cancelled) {
          setCommerceError(err instanceof Error ? err.message : "Failed to load commerce state");
          hasLoadedCommerceRef.current = true;
        }
      } finally {
        if (!cancelled) {
          setCommerceLoading(false);
        }
      }
    }

    loadCommerceState();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, isDM]);

  useEffect(() => {
    if (!hasLoadedCommerceRef.current) return;
    const timeout = window.setTimeout(() => {
      appStore.saveCommerceShops<Shop>(shops).catch((err) => {
        console.warn("Failed to save commerce shops", err);
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [shops]);

  useEffect(() => {
    if (!hasLoadedCommerceRef.current || !currentUserId) return;
    const timeout = window.setTimeout(() => {
      appStore.savePlayerCommerceCart<CartItem[]>(currentUserId, cart).catch((err) => {
        console.warn("Failed to save commerce cart", err);
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [cart, currentUserId]);

  useEffect(() => {
    if (!hasLoadedCommerceRef.current) return;
    const timeout = window.setTimeout(() => {
      appStore.saveCommerceLedger<LedgerEntry>(ledger).catch((err) => {
        console.warn("Failed to save commerce ledger", err);
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [ledger]);

  useEffect(() => {
    if (!hasLoadedCommerceRef.current) return;
    const timeout = window.setTimeout(() => {
      appStore.saveNexusNomadState<NexusNomadInventoryState>(nexusNomadState).catch((err) => {
        console.warn("Failed to save Nexus Nomad inventory state from commerce", err);
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [nexusNomadState]);

  const availableCurrencies = useMemo(
    () => getCurrencyItems(nexusInvTabs, dmItemsCache, currentUserId).map((currency) => ({ name: currency.name, quantity: currency.quantity })),
    [currentUserId, dmItemsCache, nexusInvTabs],
  );

  const dmPlayerItems = useMemo(
    () => dmItemsCache.map((item) => ({ id: item.id, name: item.name, tags: item.tags || [] })),
    [dmItemsCache],
  );

  const selectedShop = useMemo(() => shops.find(s => s.id === selectedShopId) || null, [shops, selectedShopId]);

  const visibleShops = useMemo(() => {
    if (isDM) return shops;
    return shops.filter(s => !s.hidden);
  }, [shops, isDM]);

  const shopCategories = useMemo(() => {
    if (!selectedShop) return [];
    return selectedShop.categories && selectedShop.categories.length > 0
      ? selectedShop.categories
      : [...new Set(selectedShop.items.map(i => i.category).filter(Boolean))].sort();
  }, [selectedShop]);

  const allVisibleItems = useMemo(() => {
    if (!selectedShop) return [];
    return isDM ? selectedShop.items : selectedShop.items.filter(i => !i.hidden);
  }, [selectedShop, isDM]);

  // ── Shop CRUD ──
  const addShop = useCallback(() => {
    const shop: Shop = {
      id: uid(),
      name: draftShop.name?.trim() || "New Shop",
      description: draftShop.description?.trim() || "",
      location: draftShop.location?.trim() || "",
      owner: draftShop.owner?.trim() || "",
      status: (draftShop.status as Shop["status"]) || "Open",
      items: [],
      notes: "",
      hidden: false,
      createdAt: Date.now(),
      logoEmoji: "🏪",
      themeColor: THEME_PRESETS[Math.floor(Math.random() * THEME_PRESETS.length)],
      mascotEmoji: "🧙",
      tagline: "",
      greeting: "Welcome to my shop!",
      mascotName: draftShop.owner?.trim() || "Shopkeeper",
      categories: ["Weapons", "Potions", "Misc"],
      shopType: (draftShop.shopType as Shop["shopType"]) || "general",
      greetings: [],
    };
    setShops(prev => [...prev, shop]);
    setCreatingShop(false);
    setDraftShop({});
    setSelectedShopId(shop.id);
  }, [draftShop]);

  const updateShop = useCallback((shopId: string, updates: Partial<Shop>) => {
    setShops(prev => prev.map(s => s.id === shopId ? { ...s, ...updates } : s));
  }, []);

  const deleteShop = useCallback((shopId: string) => {
    setShops(prev => prev.filter(s => s.id !== shopId));
    if (selectedShopId === shopId) {
      setSelectedShopId(null);
      setSelectedItemId(null);
    }
  }, [selectedShopId]);

  // ── Item CRUD ──
  const addItem = useCallback(() => {
    if (!selectedShopId) return;
    const item: ShopItem = {
      id: uid(),
      name: draftItem.name?.trim() || "New Item",
      description: draftItem.description?.trim() || "",
      price: Number(draftItem.price) || 0,
      currency: draftItem.currency?.trim() || "Credits",
      quantity: draftItem.quantity !== undefined ? Number(draftItem.quantity) : -1,
      rarity: (draftItem.rarity as ItemRarity) || "Common",
      category: draftItem.category?.trim() || "Misc",
      notes: draftItem.notes?.trim() || "",
      hidden: false,
      addsToInventory: draftItem.addsToInventory ?? false,
      inventoryItemId: draftItem.inventoryItemId || undefined,
      inventoryQuantity: draftItem.inventoryQuantity !== undefined ? Number(draftItem.inventoryQuantity) : undefined,
    };
    setShops(prev => prev.map(s => s.id === selectedShopId ? { ...s, items: [...s.items, item] } : s));
    setCreatingItem(false);
    setDraftItem({});
  }, [selectedShopId, draftItem]);

  const updateItem = useCallback((shopId: string, itemId: string, updates: Partial<ShopItem>) => {
    setShops(prev => prev.map(s =>
      s.id === shopId
        ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, ...updates } : i) }
        : s
    ));
  }, []);

  const deleteItem = useCallback((shopId: string, itemId: string) => {
    setShops(prev => prev.map(s =>
      s.id === shopId
        ? { ...s, items: s.items.filter(i => i.id !== itemId) }
        : s
    ));
    if (selectedItemId === itemId) setSelectedItemId(null);
  }, [selectedItemId]);

  // ── Cart ──
  const addToCart = useCallback((shopId: string, itemId: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.shopId === shopId && c.itemId === itemId);
      if (existing) return prev.map(c => c.shopId === shopId && c.itemId === itemId ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { shopId, itemId, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((shopId: string, itemId: string) => {
    setCart(prev => prev.filter(c => !(c.shopId === shopId && c.itemId === itemId)));
  }, []);

  const updateCartQty = useCallback((shopId: string, itemId: string, qty: number) => {
    if (qty <= 0) { removeFromCart(shopId, itemId); return; }
    setCart(prev => prev.map(c => c.shopId === shopId && c.itemId === itemId ? { ...c, quantity: qty } : c));
  }, [removeFromCart]);

  const clearCart = useCallback(() => setCart([]), []);

  const cartTotal = useMemo(() => {
    let total = 0;
    cart.forEach(ci => {
      const shop = shops.find(s => s.id === ci.shopId);
      const item = shop?.items.find(i => i.id === ci.itemId);
      if (item) total += item.price * ci.quantity;
    });
    return total;
  }, [cart, shops]);

  const checkout = useCallback(async () => {
    const entries: LedgerEntry[] = [];
    const shopUpdates = new Map<string, ShopItem[]>();
    cart.forEach((cartItem) => {
      const shop = shops.find((shopRow) => shopRow.id === cartItem.shopId);
      const item = shop?.items.find((shopItem) => shopItem.id === cartItem.itemId);
      if (!shop || !item) return;
      entries.push({
        id: uid(),
        shopId: shop.id,
        shopName: shop.name,
        itemName: item.name,
        quantity: cartItem.quantity,
        unitPrice: item.price,
        currency: item.currency,
        buyerName: currentUser,
        buyerId: currentUserId,
        timestamp: Date.now(),
      });
      if (item.quantity >= 0) {
        const updatedItems = shopUpdates.get(shop.id) || [...shop.items];
        const idx = updatedItems.findIndex((shopItem) => shopItem.id === item.id);
        if (idx >= 0) {
          updatedItems[idx] = {
            ...updatedItems[idx],
            quantity: Math.max(0, updatedItems[idx].quantity - cartItem.quantity),
          };
        }
        shopUpdates.set(shop.id, updatedItems);
      }
    });

    const inventoryPurchases: { name: string; description: string; price: number; currency: string; quantity: number; rarity: string }[] = [];
    const dmItemUpdates: { itemId: string; addQty: number }[] = [];
    cart.forEach((cartItem) => {
      const shop = shops.find((shopRow) => shopRow.id === cartItem.shopId);
      const item = shop?.items.find((shopItem) => shopItem.id === cartItem.itemId);
      if (!shop || !item) return;
      if (item.addsToInventory) {
        if (item.inventoryItemId) {
          const perUnit = item.inventoryQuantity || 1;
          dmItemUpdates.push({ itemId: item.inventoryItemId, addQty: perUnit * cartItem.quantity });
        } else {
          inventoryPurchases.push({
            name: item.name,
            description: item.description,
            price: item.price,
            currency: item.currency,
            quantity: cartItem.quantity,
            rarity: item.rarity,
          });
        }
      }
    });

    if (entries.length === 0) return;

    const currencyItems = getCurrencyItems(nexusInvTabs, dmItemsCache, currentUserId);
    const currencyTotals = new Map<string, number>();
    cart.forEach((cartItem) => {
      const shop = shops.find((shopRow) => shopRow.id === cartItem.shopId);
      const item = shop?.items.find((shopItem) => shopItem.id === cartItem.itemId);
      if (!shop || !item) return;
      const isCurrencyItem = currencyItems.some((currency) => currency.name === item.currency);
      if (isCurrencyItem) {
        currencyTotals.set(item.currency, (currencyTotals.get(item.currency) || 0) + item.price * cartItem.quantity);
      }
    });

    for (const [currencyName, totalCost] of currencyTotals) {
      const currency = currencyItems.find((item) => item.name === currencyName);
      if (!currency || (currency.quantity !== -1 && currency.quantity < totalCost)) {
        alert(`Not enough ${currencyName}! You have ${currency?.quantity ?? 0} but need ${totalCost}.`);
        return;
      }
    }

    let nextInvTabs = cloneInvTabs(nexusInvTabs);
    for (const [currencyName, totalCost] of currencyTotals) {
      const updatedTabs = deductCurrencyFromInventoryState(nextInvTabs, currencyName, totalCost);
      if (!updatedTabs) {
        alert(`Not enough ${currencyName}!`);
        return;
      }
      nextInvTabs = updatedTabs;
    }

    if (inventoryPurchases.length > 0) {
      nextInvTabs = addPurchasesToInventoryState(nextInvTabs, inventoryPurchases);
    }

    const nextLedger = [...ledger, ...entries];
    const nextShops = shops.map((shop) => {
      const updatedItems = shopUpdates.get(shop.id);
      return updatedItems ? { ...shop, items: updatedItems } : shop;
    });
    const nextCart: CartItem[] = [];
    const nextNexusNomadState: NexusNomadInventoryState = {
      ...nexusNomadState,
      id: nexusNomadState.id || NEXUS_NOMAD_STATE_ID,
      version: nexusNomadState.version || NEXUS_NOMAD_STATE_VERSION,
      invTabs: nextInvTabs,
    };

    setLedger(nextLedger);
    setShops(nextShops);
    setCart(nextCart);
    setShowCart(false);
    setNexusNomadState(nextNexusNomadState);

    if (dmItemUpdates.length > 0) {
      try {
        const allDmItems = [...dmItemsCache];
        for (const update of dmItemUpdates) {
          const template = allDmItems.find((item) => item.id === update.itemId);
          if (!template) continue;
          const existingCopy = allDmItems.find((item) => (
            item.name === template.name
            && item.assignedTo.includes(currentUserId)
            && item.id !== template.id
          ));
          if (existingCopy && existingCopy.tags.includes("Quantity")) {
            const currentQty = parseInt(existingCopy.customFields?.["Quantity::Amount"] || "0", 10);
            existingCopy.customFields["Quantity::Amount"] = String(currentQty + update.addQty);
          } else {
            const newItem: DmManagedItemCompat = {
              ...template,
              id: uid(),
              assignedTo: [currentUserId],
              customFields: { ...template.customFields },
            };
            if (newItem.tags.includes("Quantity")) {
              newItem.customFields["Quantity::Amount"] = String(update.addQty);
            }
            allDmItems.push(newItem);
          }
        }
        setDmItemsCache(allDmItems);
        await saveDMItems(allDmItems as unknown as any);
      } catch (err) {
        console.warn("Failed to persist DM-linked purchased items", err);
      }
    }

    try {
      await Promise.all([
        appStore.saveCommerceShops<Shop>(nextShops),
        appStore.saveCommerceLedger<LedgerEntry>(nextLedger),
        currentUserId ? appStore.savePlayerCommerceCart<CartItem[]>(currentUserId, nextCart) : Promise.resolve(),
        appStore.saveNexusNomadState<NexusNomadInventoryState>(nextNexusNomadState),
      ]);
    } catch (err) {
      console.warn("Failed to persist checkout immediately", err);
    }
  }, [cart, currentUser, currentUserId, dmItemsCache, ledger, nexusInvTabs, nexusNomadState, shops]);

  // ── Reorder shops within a group ──
  const reorderShop = useCallback((dragIdx: number, hoverIdx: number, groupType: string) => {
    setShops(prev => {
      const groupShops = prev.filter(s => (s.shopType || "general") === groupType);
      const otherShops = prev.filter(s => (s.shopType || "general") !== groupType);
      const moved = groupShops.splice(dragIdx, 1)[0];
      if (!moved) return prev;
      groupShops.splice(hoverIdx, 0, moved);
      const reordered = groupShops.map((s, i) => ({ ...s, sortOrder: i }));
      return [...otherShops, ...reordered];
    });
  }, []);

  // ── Filtered items ──
  const filteredItems = useMemo(() => {
    if (!selectedShop) return [];
    let items = selectedShop.items;
    if (!isDM) items = items.filter(i => !i.hidden);
    if (activeCategory !== "All") items = items.filter(i => i.category === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    if (filterRarity !== "all") items = items.filter(i => i.rarity === filterRarity);
    const ro: Record<ItemRarity, number> = { Common: 0, Uncommon: 1, Rare: 2, "Very Rare": 3, Legendary: 4 };
    items = [...items].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "price") cmp = a.price - b.price;
      else cmp = ro[a.rarity] - ro[b.rarity];
      return sortAsc ? cmp : -cmp;
    });
    return items;
  }, [selectedShop, isDM, activeCategory, searchQuery, filterRarity, sortBy, sortAsc]);

  // ── Styles (Steel theme) ──
  const pageBg = `linear-gradient(180deg, ${STEEL.bg1} 0%, ${STEEL.bg2} 50%, ${STEEL.bg1} 100%)`;
  const panelBg = STEEL.panel;
  const cardBg = STEEL.card;
  const panelBorder = STEEL.border;
  const inputBg = STEEL.inputBg;
  const textColor = STEEL.text;
  const labelColor = STEEL.textDim;

  const inputStyle: React.CSSProperties = {
    backgroundColor: inputBg, border: `1px solid ${panelBorder}`, color: textColor, borderRadius: 0,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: cardBg, border: `1px solid ${panelBorder}`, borderRadius: 0,
  };

  const renderRarityBadge = (rarity: ItemRarity) => (
    <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider" style={{ color: RARITY_COLORS[rarity], background: `${RARITY_COLORS[rarity]}15`, border: `1px solid ${RARITY_COLORS[rarity]}30` }}>
      {rarity}
    </span>
  );

  const renderStatusBadge = useCallback((status: Shop["status"]) => (
    <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider" style={{ color: STATUS_COLORS[status], background: `${STATUS_COLORS[status]}12`, border: `1px solid ${STATUS_COLORS[status]}25` }}>
      {status}
    </span>
  ), []);

  if (commerceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: pageBg }}>
        <div className="w-full max-w-md p-5" style={cardStyle}>
          <div className="text-[13px] font-bold mb-2" style={{ color: textColor }}>Loading commerce data...</div>
          <div className="text-[11px]" style={{ color: labelColor }}>
            {commerceError || "Pulling shops, ledger, cart, and Nexus Nomad inventory from Supabase."}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // Shop Sub-Page
  // ═══════════════════════════════════════════

  const renderShopSubPage = (shop: Shop) => {
    const sc = shop.themeColor || STEEL.accent;
    const isLight = !!shop.lightMode;
    const LIGHT = {
      bg1: "#F0F0F4", bg2: "#E8E8EE", bg3: "#DDDDE4", panel: "#EAEAF0",
      card: "#F5F5F8", border: "#C8C8D4", borderLight: "#B0B0C0",
      text: "#1A1A2A", textDim: "#4A4A6A", textMuted: "#7A7A9A",
      inputBg: "#FFFFFF",
    };
    const T = isLight ? LIGHT : STEEL;

    const customBg = shop.bgGradientStart || shop.bgGradientEnd;
    const bgAngle = shop.bgGradientAngle ?? 180;
    const gType = shop.bgGradientType || "linear";
    const bgStart = shop.bgGradientStart || T.bg1;
    const bgEnd = shop.bgGradientEnd || (isLight ? T.bg2 : `color-mix(in srgb, ${sc} 5%, ${STEEL.bg1})`);
    const shopPageBg = customBg
      ? (gType === "radial"
        ? `radial-gradient(circle, ${bgStart}, ${bgEnd})`
        : `linear-gradient(${bgAngle}deg, ${bgStart}, ${bgEnd})`)
      : (isLight
        ? `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg2} 50%, ${T.bg1} 100%)`
        : `linear-gradient(180deg, ${STEEL.bg1} 0%, color-mix(in srgb, ${sc} 5%, ${STEEL.bg1}) 40%, ${STEEL.bg1} 100%)`);
    const panelBgShop = shop.sidebarBg || (isLight ? T.panel : `color-mix(in srgb, ${sc} 3%, ${STEEL.bg2})`);
    const borderShop = shop.borderTint || (isLight ? T.border : `color-mix(in srgb, ${sc} 12%, ${STEEL.border})`);
    const headerBgShop = shop.headerBg || T.bg2;
    const cardBgShop = shop.cardBg || T.card;
    const catBarBg = shop.categoryBarBg || (isLight ? T.bg2 : "#08080E");
    const mascotBg = shop.mascotAreaBg || panelBgShop;
    const shopText = isLight ? T.text : STEEL.text;
    const shopTextDim = isLight ? T.textDim : STEEL.textDim;
    const shopTextMuted = isLight ? T.textMuted : STEEL.textMuted;
    const shopInputStyle: React.CSSProperties = {
      backgroundColor: T.inputBg, border: `1px solid ${borderShop}`, color: shopText, borderRadius: 0,
    };
    const cats = shopCategories;

    return (
      <div className="min-h-screen flex flex-col" style={{ background: shopPageBg }}>
        {/* ── Sub-page header ── */}
        <div className="flex items-center gap-2 px-4 py-2" style={{ background: headerBgShop, borderBottom: `1px solid ${borderShop}` }}>
          <button onClick={() => { setSelectedShopId(null); setSelectedItemId(null); setEditingItemId(null); setCreatingItem(false); setShowShopSettings(false); setActiveCategory("All"); setSearchQuery(""); setFilterRarity("all"); }} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity" style={{ color: sc }}>
            <ArrowLeft size={14} />
            <span className="text-[11px] font-semibold">Back to Shops</span>
          </button>
          <div className="flex-1" />
          {!isDM && (
            <button onClick={() => setShowCart(true)} className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold relative ${retro.button}`} style={{ color: "#E0E4F0" }}>
              <ShoppingCart size={12} />
              Cart
              {cart.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[8px] font-bold rounded-full" style={{ background: "#FF5A5A", color: "#fff" }}>{cart.length}</span>
              )}
            </button>
          )}
          {isDM && (
            <div style={DISPLAY_CONTENTS}>
              <button onClick={() => setShowShopSettings(!showShopSettings)} className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }} title="Shop Settings">
                <Settings size={11} />
                Customize
              </button>
              <button onClick={() => updateShop(shop.id, { hidden: !shop.hidden })} className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }} title={shop.hidden ? "Show to Players" : "Hide from Players"}>
                {shop.hidden ? <Eye size={10} /> : <EyeOff size={10} />}
              </button>
              <button onClick={() => { setCreatingItem(true); setDraftItem({ currency: "Credits", quantity: -1, rarity: "Common", category: cats[0] || "Misc" }); setEditingItemId(null); }} className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}>
                <Plus size={11} />
                Add Item
              </button>
              <button onClick={() => { if (confirm("Delete this shop and all its items?")) deleteShop(shop.id); }} className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold ${retro.button}`} style={{ color: "#FF5A5A" }} title="Delete Shop">
                <Trash2 size={10} />
              </button>
            </div>
          )}
        </div>

        {/* ── DM Settings Panel (collapsible) ── */}
        {isDM && showShopSettings && (
          <div className="px-4 py-3" style={{ background: "#08080E", borderBottom: `1px solid ${borderShop}` }}>
            <div className="max-w-5xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings size={13} style={{ color: sc }} />
                  <span className="text-[13px] font-bold" style={{ color: sc }}>Shop Customization</span>
                </div>
                <button onClick={() => setShowShopSettings(false)} className="hover:opacity-80"><X size={14} style={{ color: STEEL.dmLabel }} /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Basic Info */}
                <div className="space-y-2 p-3" style={{ background: "#0A0A14", border: `1px solid ${borderShop}` }}>
                  <span className="text-[10px] uppercase tracking-wider font-semibold block" style={{ color: STEEL.dmSection }}>Basic Info</span>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Name</label>
                    <input value={shop.name} onChange={e => updateShop(shop.id, { name: e.target.value })} className="w-full text-[12px] outline-none px-2 py-1" style={inputStyle} maxLength={60} />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Owner / Shopkeeper</label>
                    <input value={shop.owner} onChange={e => updateShop(shop.id, { owner: e.target.value })} className="w-full text-[12px] outline-none px-2 py-1" style={inputStyle} maxLength={60} />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Location</label>
                    <input value={shop.location} onChange={e => updateShop(shop.id, { location: e.target.value })} className="w-full text-[12px] outline-none px-2 py-1" style={inputStyle} maxLength={80} />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Status</label>
                    <select value={shop.status} onChange={e => updateShop(shop.id, { status: e.target.value as Shop["status"] })} className="w-full text-[12px] outline-none px-2 py-1 cursor-pointer" style={inputStyle}>
                      {SHOP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Tagline</label>
                    <input value={shop.tagline} onChange={e => updateShop(shop.id, { tagline: e.target.value })} placeholder="A catchy slogan..." className="w-full text-[12px] outline-none px-2 py-1" style={inputStyle} maxLength={80} />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Description</label>
                    <textarea value={shop.description} onChange={e => updateShop(shop.id, { description: e.target.value })} className="w-full text-[12px] outline-none px-2 py-1 resize-y min-h-[50px]" style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>DM Notes (secret)</label>
                    <textarea value={shop.notes} onChange={e => updateShop(shop.id, { notes: e.target.value })} placeholder="Private notes..." className="w-full text-[12px] outline-none px-2 py-1 resize-y min-h-[40px]" style={{ ...inputStyle, borderColor: "#2A1515" }} />
                  </div>
                </div>

                {/* Appearance */}
                <div className="space-y-2 p-3" style={{ background: "#0A0A14", border: `1px solid ${borderShop}` }}>
                  <span className="text-[10px] uppercase tracking-wider font-semibold block" style={{ color: STEEL.dmSection }}>Appearance</span>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: STEEL.dmLabel }}>Shop Type</label>
                    <div className="flex gap-1">
                      {SHOP_TYPES.map(st => (
                        <button key={st.value} onClick={() => updateShop(shop.id, { shopType: st.value })} className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold transition-all" style={{ background: shop.shopType === st.value ? `${st.color}20` : "#08080E", border: shop.shopType === st.value ? `1px solid ${st.color}` : "1px solid #1A1A2A", color: shop.shopType === st.value ? st.color : STEEL.dmLabel }}>
                          <st.icon size={10} />
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: STEEL.dmLabel }}>Theme Color</label>
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {THEME_PRESETS.map(c => (
                        <button key={c} onClick={() => updateShop(shop.id, { themeColor: c })} className="w-5 h-5 transition-all hover:scale-110" style={{ background: c, border: shop.themeColor === c ? "2px solid #fff" : "1px solid #2A2A3A", borderRadius: 0, boxShadow: shop.themeColor === c ? `0 0 6px ${c}` : "none" }} />
                      ))}
                    </div>
                    <input type="color" value={shop.themeColor} onChange={e => updateShop(shop.id, { themeColor: e.target.value })} className="w-full h-6 cursor-pointer" style={{ background: "transparent", border: `1px solid ${borderShop}` }} />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: STEEL.dmLabel }}>Dark / Light Mode</label>
                    <div className="flex gap-1">
                      <button onClick={() => updateShop(shop.id, { lightMode: false })} className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold transition-all" style={{ background: !shop.lightMode ? `${sc}20` : "#08080E", border: !shop.lightMode ? `1px solid ${sc}` : "1px solid #1A1A2A", color: !shop.lightMode ? sc : STEEL.dmLabel }}>
                        <Moon size={10} />Dark
                      </button>
                      <button onClick={() => updateShop(shop.id, { lightMode: true })} className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold transition-all" style={{ background: shop.lightMode ? `${sc}20` : "#08080E", border: shop.lightMode ? `1px solid ${sc}` : "1px solid #1A1A2A", color: shop.lightMode ? sc : STEEL.dmLabel }}>
                        <Sun size={10} />Light
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: STEEL.dmLabel }}>Background Gradient</label>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1">
                        <span className="text-[8px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.textDim }}>Start</span>
                        <input type="color" value={shop.bgGradientStart || STEEL.bg1} onChange={e => updateShop(shop.id, { bgGradientStart: e.target.value })} className="w-full h-5 cursor-pointer" style={{ background: "transparent", border: `1px solid ${borderShop}` }} />
                      </div>
                      <div className="flex-1">
                        <span className="text-[8px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.textDim }}>End</span>
                        <input type="color" value={shop.bgGradientEnd || STEEL.bg2} onChange={e => updateShop(shop.id, { bgGradientEnd: e.target.value })} className="w-full h-5 cursor-pointer" style={{ background: "transparent", border: `1px solid ${borderShop}` }} />
                      </div>
                      <div className="flex-shrink-0" style={{ width: 52 }}>
                        <span className="text-[8px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.textDim }}>Angle</span>
                        <input type="number" value={shop.bgGradientAngle ?? 180} onChange={e => updateShop(shop.id, { bgGradientAngle: Number(e.target.value) % 360 })} className="w-full text-[10px] outline-none px-1 py-0.5 text-center" style={inputStyle} min={0} max={360} disabled={(shop.bgGradientType || "linear") === "radial"} />
                      </div>
                    </div>
                    <div className="mb-1">
                      <span className="text-[8px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.textDim }}>Direction Presets</span>
                      <div className="flex flex-wrap gap-1">
                        {([
                          { label: "\u2193", angle: 180, type: "linear" as const, tip: "Top to Bottom" },
                          { label: "\u2191", angle: 0, type: "linear" as const, tip: "Bottom to Top" },
                          { label: "\u2192", angle: 90, type: "linear" as const, tip: "Left to Right" },
                          { label: "\u2190", angle: 270, type: "linear" as const, tip: "Right to Left" },
                          { label: "\u2198", angle: 135, type: "linear" as const, tip: "Diagonal Down-Right" },
                          { label: "\u2197", angle: 45, type: "linear" as const, tip: "Diagonal Up-Right" },
                          { label: "\u2199", angle: 225, type: "linear" as const, tip: "Diagonal Down-Left" },
                          { label: "\u2196", angle: 315, type: "linear" as const, tip: "Diagonal Up-Left" },
                          { label: "\u25CE", angle: 0, type: "radial" as const, tip: "Radial (Center Out)" },
                        ]).map(preset => {
                          const isActive = (shop.bgGradientType || "linear") === preset.type && (preset.type === "radial" || (shop.bgGradientAngle ?? 180) === preset.angle);
                          return (
                            <button key={preset.tip} title={preset.tip} onClick={() => updateShop(shop.id, { bgGradientType: preset.type, bgGradientAngle: preset.angle })} className="w-6 h-6 flex items-center justify-center text-[13px] transition-all hover:scale-110" style={{ background: isActive ? `${sc}25` : "#08080E", border: isActive ? `1px solid ${sc}` : "1px solid #1A1A2A", color: isActive ? sc : STEEL.dmLabel }}>
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {(() => {
                      const gType = shop.bgGradientType || "linear";
                      const gStart = shop.bgGradientStart || STEEL.bg1;
                      const gEnd = shop.bgGradientEnd || STEEL.bg2;
                      const gAngle = shop.bgGradientAngle ?? 180;
                      const previewBg = gType === "radial"
                        ? `radial-gradient(circle, ${gStart}, ${gEnd})`
                        : `linear-gradient(${gAngle}deg, ${gStart}, ${gEnd})`;
                      return <div className="h-4 w-full" style={{ background: previewBg, border: `1px solid ${borderShop}` }} />;
                    })()}
                    {(shop.bgGradientStart || shop.bgGradientEnd || shop.bgGradientType) && (
                      <button onClick={() => updateShop(shop.id, { bgGradientStart: undefined, bgGradientEnd: undefined, bgGradientAngle: undefined, bgGradientType: undefined })} className={`mt-1 flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold ${retro.button}`} style={{ color: "#FF5A5A" }}><X size={8} />Reset Gradient</button>
                    )}
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: STEEL.dmLabel }}>Layout Colors</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { key: "sidebarBg" as const, label: "Sidebar", fallback: STEEL.bg2 },
                        { key: "headerBg" as const, label: "Header Bar", fallback: STEEL.bg2 },
                        { key: "cardBg" as const, label: "Item Cards", fallback: STEEL.card },
                        { key: "categoryBarBg" as const, label: "Category Bar", fallback: "#08080E" },
                        { key: "borderTint" as const, label: "Borders", fallback: STEEL.border },
                        { key: "mascotAreaBg" as const, label: "Mascot Area", fallback: STEEL.bg2 },
                      ]).map(({ key, label, fallback }) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <input type="color" value={shop[key] || fallback} onChange={e => updateShop(shop.id, { [key]: e.target.value })} className="w-5 h-5 cursor-pointer flex-shrink-0" style={{ background: "transparent", border: `1px solid ${borderShop}`, borderRadius: 0 }} />
                          <span className="text-[9px]" style={{ color: STEEL.dmLabel }}>{label}</span>
                          {shop[key] && (
                            <button onClick={() => updateShop(shop.id, { [key]: undefined })} className="hover:opacity-80"><X size={7} style={{ color: "#FF5A5A" }} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <button onClick={() => {
                      if (confirm("Reset all appearance customization to defaults?")) {
                        updateShop(shop.id, {
                          bgGradientStart: undefined, bgGradientEnd: undefined, bgGradientAngle: undefined, bgGradientType: undefined,
                          sidebarBg: undefined, headerBg: undefined, cardBg: undefined, categoryBarBg: undefined,
                          borderTint: undefined, mascotAreaBg: undefined, lightMode: undefined,
                        });
                      }
                    }} className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold ${retro.button}`} style={{ color: "#FF5A5A", borderColor: "#FF5A5A30" }}>
                      <RotateCcw size={9} />Reset All Appearance
                    </button>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: STEEL.dmLabel }}>Logo</label>
                    <div className="flex items-center gap-2 mb-1.5">
                      <button onClick={() => handleImageUpload(200, (dataUrl) => updateShop(shop.id, { logoImage: dataUrl }))} className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}>
                        <Upload size={9} />Upload Image
                      </button>
                      {shop.logoImage && (
                        <button onClick={() => updateShop(shop.id, { logoImage: undefined })} className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold ${retro.button}`} style={{ color: "#FF5A5A" }}>
                          <X size={9} />Remove
                        </button>
                      )}
                      {shop.logoImage && (
                        <div className="w-7 h-7 overflow-hidden flex-shrink-0" style={{ border: `1px solid ${sc}40` }}>
                          <img src={shop.logoImage} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mascot & Categories */}
                <div className="space-y-2 p-3" style={{ background: "#0A0A14", border: `1px solid ${borderShop}` }}>
                  <span className="text-[10px] uppercase tracking-wider font-semibold block" style={{ color: STEEL.dmSection }}>Mascot & Categories</span>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Mascot Name</label>
                    <input value={shop.mascotName} onChange={e => updateShop(shop.id, { mascotName: e.target.value })} className="w-full text-[12px] outline-none px-2 py-1" style={inputStyle} maxLength={30} />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: STEEL.dmLabel }}>Mascot (supports GIFs &amp; animated images)</label>
                    <div className="flex items-center gap-2 mb-1.5">
                      <button onClick={() => handleImageUpload(500, (dataUrl) => updateShop(shop.id, { mascotImage: dataUrl }), true)} className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}>
                        <Upload size={9} />Upload Image/GIF
                      </button>
                      {shop.mascotImage && (
                        <button onClick={() => updateShop(shop.id, { mascotImage: undefined })} className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold ${retro.button}`} style={{ color: "#FF5A5A" }}>
                          <X size={9} />Remove
                        </button>
                      )}
                      {shop.mascotImage && (
                        <div className="w-8 h-8 overflow-hidden flex-shrink-0" style={{ border: `1px solid ${sc}40` }}>
                          <img src={shop.mascotImage} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: STEEL.dmLabel }}>
                      Greetings <span style={{ color: STEEL.textDim }}>(rotate automatically)</span>
                    </label>
                    {(shop.greetings || []).map((g, gi) => (
                      <div key={gi} className="flex items-start gap-1 mb-1">
                        <span className="text-[9px] font-mono mt-1.5 flex-shrink-0" style={{ color: `${sc}60` }}>#{gi + 1}</span>
                        <textarea value={g} onChange={e => { const updated = [...(shop.greetings || [])]; updated[gi] = e.target.value; updateShop(shop.id, { greetings: updated, greeting: updated[0] || "" }); }} className="flex-1 text-[11px] outline-none px-2 py-1 resize-y min-h-[32px]" style={inputStyle} />
                        <button onClick={() => { const updated = (shop.greetings || []).filter((_, i) => i !== gi); updateShop(shop.id, { greetings: updated, greeting: updated[0] || "" }); }} className="mt-0.5 hover:opacity-80 flex-shrink-0" style={{ color: "#FF5A5A" }}><Trash2 size={10} /></button>
                      </div>
                    ))}
                    <button onClick={() => updateShop(shop.id, { greetings: [...(shop.greetings || []), ""] })} className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}><Plus size={9} />Add Greeting</button>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: STEEL.dmLabel }}>Category Tabs</label>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {(shop.categories || []).map((cat, ci) => (
                        <div key={cat} className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px]" style={{ background: `${sc}15`, border: `1px solid ${sc}30`, color: sc }}>
                          {cat}
                          <button onClick={() => updateShop(shop.id, { categories: shop.categories.filter((_, i) => i !== ci) })} className="ml-0.5 hover:opacity-80"><X size={8} /></button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <input value={newCategoryDraft} onChange={e => setNewCategoryDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newCategoryDraft.trim()) { updateShop(shop.id, { categories: [...(shop.categories || []), newCategoryDraft.trim()] }); setNewCategoryDraft(""); } }} placeholder="Add category..." className="flex-1 text-[11px] outline-none px-2 py-1" style={inputStyle} maxLength={20} />
                      <button onClick={() => { if (newCategoryDraft.trim()) { updateShop(shop.id, { categories: [...(shop.categories || []), newCategoryDraft.trim()] }); setNewCategoryDraft(""); } }} className={`px-2 py-1 text-[10px] ${retro.button}`} style={{ color: "#E0E4F0" }}><Plus size={10} /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Main content area ── */}
        <div className="flex-1 flex" style={{ minHeight: "calc(100vh - 42px)" }}>
          {/* ═══ Left sidebar: Logo + Mascot ═══ */}
          <div className="w-64 xl:w-72 flex-shrink-0 flex flex-col" style={{ background: panelBgShop, borderRight: `1px solid ${borderShop}` }}>
            {/* Logo & Info (top-left) */}
            <div className="p-4 space-y-3" style={{ borderBottom: `1px solid ${borderShop}` }}>
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 flex items-center justify-center text-[32px] flex-shrink-0 overflow-hidden" style={{ background: `${sc}10`, border: `2px solid ${sc}30`, boxShadow: `0 0 20px ${sc}10` }}>
                  {shop.logoImage ? (
                    <img src={shop.logoImage} alt="" className="w-full h-full object-cover" />
                  ) : shop.logoEmoji ? shop.logoEmoji : (
                    <span className="text-[11px] font-bold font-mono" style={{ color: `${sc}60` }}>{shop.name.charAt(0)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[15px] font-bold leading-tight truncate" style={{ color: sc }}>{shop.name}</h2>
                  {renderStatusBadge(shop.status)}
                </div>
              </div>

              {/* Tagline */}
              {shop.tagline && (
                <p className="text-[11px] italic leading-relaxed" style={{ color: `${sc}AA` }}>
                  {shop.tagline}
                </p>
              )}

              {/* Info details */}
              {shop.owner && (
                <div className="flex items-center gap-1.5">
                  <Users size={10} style={{ color: shopTextDim }} />
                  <span className="text-[10px]" style={{ color: shopText }}>
                    {shop.owner}
                  </span>
                </div>
              )}
              {shop.location && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={10} style={{ color: shopTextDim }} />
                  <span className="text-[10px]" style={{ color: shopTextDim }}>{shop.location}</span>
                </div>
              )}
              {shop.description && (
                <p className="text-[11px] leading-relaxed" style={{ color: shopTextMuted }}>
                  {shop.description}
                </p>
              )}

              {/* DM notes */}
              {isDM && shop.notes && (
                <div className="p-2" style={{ background: isLight ? "#FFF5F5" : "#100808", border: isLight ? "1px solid #E0C0C0" : "1px solid #2A1515" }}>
                  <p className="text-[9px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "#8A4A4A" }}>DM Notes</p>
                  <p className="text-[10px] leading-relaxed" style={{ color: "#AA7A7A" }}>{shop.notes}</p>
                </div>
              )}

              {shop.hidden && isDM && (
                <div className="flex items-center gap-1 px-2 py-1" style={{ background: isLight ? "#FFF0F0" : "#1A0808", border: isLight ? "1px solid #E8C0C0" : "1px solid #2A1010" }}>
                  <EyeOff size={9} style={{ color: "#FF5A5A" }} />
                  <span className="text-[9px] font-mono" style={{ color: "#FF5A5A" }}>HIDDEN FROM PLAYERS</span>
                </div>
              )}
            </div>

            {/* Mascot window (middle-left to bottom-left) */}
            <MascotWindow shop={shop} sc={sc} bgOverride={shop.mascotAreaBg} />
          </div>

          {/* ═══ Right: Store inventory ═══ */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Category tabs */}
            <div className="flex items-center gap-0 overflow-x-auto flex-shrink-0" style={{ background: catBarBg, borderBottom: `1px solid ${borderShop}` }}>
              <button
                onClick={() => setActiveCategory("All")}
                className="px-4 py-2.5 text-[11px] font-semibold whitespace-nowrap transition-all hover:opacity-90 flex-shrink-0"
                style={{
                  color: activeCategory === "All" ? sc : shopTextDim,
                  background: activeCategory === "All" ? `${sc}12` : "transparent",
                  borderBottom: activeCategory === "All" ? `2px solid ${sc}` : "2px solid transparent",
                }}
              >
                All Items
                <span className="ml-1.5 text-[9px] font-mono px-1 py-0.5" style={{ background: activeCategory === "All" ? `${sc}20` : (isLight ? `${T.border}40` : "#12121E"), color: activeCategory === "All" ? sc : shopTextMuted }}>
                  {allVisibleItems.length}
                </span>
              </button>
              {cats.map(cat => {
                const count = allVisibleItems.filter(i => i.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className="px-4 py-2.5 text-[11px] font-semibold whitespace-nowrap transition-all hover:opacity-90 flex-shrink-0"
                    style={{
                      color: activeCategory === cat ? sc : shopTextDim,
                      background: activeCategory === cat ? `${sc}12` : "transparent",
                      borderBottom: activeCategory === cat ? `2px solid ${sc}` : "2px solid transparent",
                    }}
                  >
                    {cat}
                    <span className="ml-1.5 text-[9px] font-mono px-1 py-0.5" style={{ background: activeCategory === cat ? `${sc}20` : (isLight ? `${T.border}40` : "#12121E"), color: activeCategory === cat ? sc : shopTextMuted }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-2 px-4 py-2 flex-wrap flex-shrink-0" style={{ background: `color-mix(in srgb, ${catBarBg} 90%, ${T.bg2})`, borderBottom: `1px solid ${borderShop}` }}>
              <div className="relative flex-shrink-0">
                <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: shopTextDim }} />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search items..." className="text-[10px] outline-none pl-6 pr-2 py-1 w-40" style={shopInputStyle} />
              </div>
              <select value={filterRarity} onChange={e => setFilterRarity(e.target.value as any)} className="text-[10px] outline-none px-1.5 py-1 cursor-pointer flex-shrink-0" style={shopInputStyle}>
                <option value="all">All Rarities</option>
                {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="flex-1" />
              <button onClick={() => { if (sortBy === "name") { setSortBy("price"); setSortAsc(true); } else if (sortBy === "price") { setSortBy("rarity"); setSortAsc(true); } else { setSortBy("name"); setSortAsc(true); } }} className={`flex items-center gap-1 px-1.5 py-1 text-[10px] flex-shrink-0 ${retro.button}`} style={{ color: "#E0E4F0" }}>
                <span className="capitalize">{sortBy}</span>
              </button>
              <button onClick={() => setSortAsc(!sortAsc)} className={`px-1 py-1 flex-shrink-0 ${retro.button}`} style={{ color: "#E0E4F0" }}>
                {sortAsc ? <SortAsc size={10} /> : <SortDesc size={10} />}
              </button>
              <span className="text-[10px] font-mono flex-shrink-0" style={{ color: shopTextDim }}>
                {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Creating item form */}
            {creatingItem && (
              <div className="px-4 py-3" style={{ background: "#08080E", borderBottom: `1px solid ${borderShop}` }}>
                <div className="p-3 space-y-2" style={{ background: "#0A0A14", border: `1px solid ${sc}20` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Package size={12} style={{ color: sc }} />
                    <span className="text-[12px] font-bold" style={{ color: sc }}>New Item</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Name</label>
                      <input value={draftItem.name || ""} onChange={e => setDraftItem(p => ({ ...p, name: e.target.value }))} autoFocus className="w-full text-[12px] outline-none px-2 py-1" style={inputStyle} maxLength={60} />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Category</label>
                      <select value={draftItem.category || "Misc"} onChange={e => setDraftItem(p => ({ ...p, category: e.target.value }))} className="w-full text-[12px] outline-none px-2 py-1 cursor-pointer" style={inputStyle}>
                        {(cats.length > 0 ? cats : DEFAULT_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="Misc">Misc</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Price</label>
                      <input type="number" value={draftItem.price ?? ""} onChange={e => setDraftItem(p => ({ ...p, price: Number(e.target.value) }))} className="w-full text-[12px] outline-none px-2 py-1" style={inputStyle} min={0} />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Currency</label>
                      <select value={draftItem.currency || "Credits"} onChange={e => setDraftItem(p => ({ ...p, currency: e.target.value }))} className="w-full text-[12px] outline-none px-2 py-1 cursor-pointer" style={inputStyle}>
                        {availableCurrencies.map(c => <option key={c.name} value={c.name}>{c.name} ({c.quantity === -1 ? "∞" : c.quantity})</option>)}
                        {!availableCurrencies.some(c => c.name === (draftItem.currency || "Credits")) && draftItem.currency && <option value={draftItem.currency}>{draftItem.currency}</option>}
                        <option value="gp">gp (no deduction)</option>
                        <option value="sp">sp (no deduction)</option>
                        <option value="cp">cp (no deduction)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Qty (-1={"\u221E"})</label>
                      <input type="number" value={draftItem.quantity ?? -1} onChange={e => setDraftItem(p => ({ ...p, quantity: Number(e.target.value) }))} className="w-full text-[12px] outline-none px-2 py-1" style={inputStyle} min={-1} />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Rarity</label>
                      <select value={draftItem.rarity || "Common"} onChange={e => setDraftItem(p => ({ ...p, rarity: e.target.value as ItemRarity }))} className="w-full text-[12px] outline-none px-2 py-1 cursor-pointer" style={inputStyle}>
                        {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Description</label>
                    <textarea value={draftItem.description || ""} onChange={e => setDraftItem(p => ({ ...p, description: e.target.value }))} className="w-full text-[12px] outline-none px-2 py-1 resize-y min-h-[40px]" style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>DM Notes</label>
                    <input value={draftItem.notes || ""} onChange={e => setDraftItem(p => ({ ...p, notes: e.target.value }))} className="w-full text-[12px] outline-none px-2 py-1" style={{ ...inputStyle, borderColor: "#2A1515" }} />
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none py-0.5">
                    <input type="checkbox" checked={!!draftItem.addsToInventory} onChange={e => setDraftItem(p => ({ ...p, addsToInventory: e.target.checked, inventoryItemId: e.target.checked ? p.inventoryItemId : undefined, inventoryQuantity: e.target.checked ? p.inventoryQuantity : undefined }))} className="accent-[#4AE0C0]" />
                    <Package size={10} style={{ color: draftItem.addsToInventory ? "#4AE0C0" : "#4A4E5E" }} />
                    <span className="text-[10px] font-mono" style={{ color: draftItem.addsToInventory ? "#4AE0C0" : "#6A7088" }}>Adds to Player Inventory on purchase</span>
                  </label>
                  {draftItem.addsToInventory && (
                    <div className="flex gap-1.5 items-end" style={{ paddingLeft: 20 }}>
                      <div className="flex-1">
                        <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Player Item</label>
                        <select value={draftItem.inventoryItemId || ""} onChange={e => setDraftItem(p => ({ ...p, inventoryItemId: e.target.value || undefined }))} className="w-full text-[11px] outline-none px-2 py-1 cursor-pointer" style={inputStyle}>
                          <option value="">— Office Inventory (legacy) —</option>
                          {dmPlayerItems.map(di => <option key={di.id} value={di.id}>{di.name}{di.tags.includes("Quantity") ? " [Qty]" : ""}{di.tags.includes("Currency") ? " [$]" : ""}</option>)}
                        </select>
                      </div>
                      <div className="w-16">
                        <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Qty</label>
                        <input type="number" value={draftItem.inventoryQuantity ?? 1} onChange={e => setDraftItem(p => ({ ...p, inventoryQuantity: Number(e.target.value) || 1 }))} min={1} className="w-full text-[11px] outline-none px-2 py-1 text-center" style={inputStyle} />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={addItem} className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}><Check size={11} />Add Item</button>
                    <button onClick={() => { setCreatingItem(false); setDraftItem({}); }} className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}><X size={11} />Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Item grid */}
            <div className="flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: `${sc}30 transparent` }}>
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Package size={36} style={{ color: isLight ? T.border : "#2A2A3A" }} className="mb-3" />
                  <p className="text-[12px] font-semibold mb-1" style={{ color: shopTextMuted }}>
                    {searchQuery || filterRarity !== "all" ? "No items match your filters." : activeCategory !== "All" ? `No items in "${activeCategory}".` : isDM ? "Add items to this shop." : "No items for sale."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredItems.map(item => {
                    const isEditing = editingItemId === item.id;
                    const outOfStock = item.quantity === 0;
                    const inCart = cart.find(c => c.shopId === shop.id && c.itemId === item.id);

                    return (
                      <div
                        key={item.id}
                        className={`p-3 transition-all group ${outOfStock && !isDM ? "opacity-40" : ""} hover:brightness-110`}
                        style={{ ...cardStyle, backgroundColor: cardBgShop, borderColor: borderShop, borderLeft: `3px solid ${RARITY_COLORS[item.rarity]}30` }}
                      >
                        {isEditing && isDM ? (
                          /* Inline edit */
                          <div className="space-y-2" onClick={e => e.stopPropagation()}>
                            <input value={item.name} onChange={e => updateItem(shop.id, item.id, { name: e.target.value })} className="w-full text-[12px] outline-none px-2 py-1 font-semibold" style={inputStyle} maxLength={60} />
                            <div className="grid grid-cols-3 gap-1">
                              <input type="number" value={item.price} onChange={e => updateItem(shop.id, item.id, { price: Number(e.target.value) })} className="text-[11px] outline-none px-1 py-0.5" style={inputStyle} min={0} />
                              <select value={item.currency} onChange={e => updateItem(shop.id, item.id, { currency: e.target.value })} className="text-[11px] outline-none px-1 py-0.5 cursor-pointer" style={inputStyle}>
                                {availableCurrencies.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                {!availableCurrencies.some(c => c.name === item.currency) && <option value={item.currency}>{item.currency}</option>}
                                <option value="gp">gp</option>
                                <option value="sp">sp</option>
                                <option value="cp">cp</option>
                              </select>
                              <input type="number" value={item.quantity} onChange={e => updateItem(shop.id, item.id, { quantity: Number(e.target.value) })} className="text-[11px] outline-none px-1 py-0.5" style={inputStyle} min={-1} />
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              <select value={item.rarity} onChange={e => updateItem(shop.id, item.id, { rarity: e.target.value as ItemRarity })} className="text-[11px] outline-none px-1 py-0.5 cursor-pointer" style={inputStyle}>
                                {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <select value={item.category} onChange={e => updateItem(shop.id, item.id, { category: e.target.value })} className="text-[11px] outline-none px-1 py-0.5 cursor-pointer" style={inputStyle}>
                                {(cats.length > 0 ? cats : DEFAULT_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                                <option value="Misc">Misc</option>
                              </select>
                            </div>
                            <textarea value={item.description} onChange={e => updateItem(shop.id, item.id, { description: e.target.value })} className="w-full text-[11px] outline-none px-1.5 py-1 resize-y min-h-[35px]" style={inputStyle} />
                            <input value={item.notes} onChange={e => updateItem(shop.id, item.id, { notes: e.target.value })} placeholder="DM notes..." className="w-full text-[10px] outline-none px-1.5 py-0.5" style={{ ...inputStyle, borderColor: "#2A1515" }} />
                            <label className="flex items-center gap-1.5 cursor-pointer select-none py-0.5">
                              <input type="checkbox" checked={!!item.addsToInventory} onChange={e => updateItem(shop.id, item.id, { addsToInventory: e.target.checked, ...(!e.target.checked ? { inventoryItemId: undefined, inventoryQuantity: undefined } : {}) })} className="accent-[#4AE0C0]" />
                              <Package size={9} style={{ color: item.addsToInventory ? "#4AE0C0" : "#4A4E5E" }} />
                              <span className="text-[9px] font-mono" style={{ color: item.addsToInventory ? "#4AE0C0" : "#6A7088" }}>Adds to Player Inventory</span>
                            </label>
                            {item.addsToInventory && (
                              <div className="flex gap-1.5 items-end" style={{ paddingLeft: 18 }}>
                                <div className="flex-1">
                                  <label className="text-[8px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Player Item</label>
                                  <select value={item.inventoryItemId || ""} onChange={e => updateItem(shop.id, item.id, { inventoryItemId: e.target.value || undefined })} className="w-full text-[10px] outline-none px-1.5 py-0.5 cursor-pointer" style={inputStyle}>
                                    <option value="">— Office Inventory (legacy) —</option>
                                    {dmPlayerItems.map(di => <option key={di.id} value={di.id}>{di.name}{di.tags.includes("Quantity") ? " [Qty]" : ""}{di.tags.includes("Currency") ? " [$]" : ""}</option>)}
                                  </select>
                                </div>
                                <div className="w-14">
                                  <label className="text-[8px] uppercase tracking-wider block mb-0.5" style={{ color: STEEL.dmLabel }}>Qty</label>
                                  <input type="number" value={item.inventoryQuantity ?? 1} onChange={e => updateItem(shop.id, item.id, { inventoryQuantity: Number(e.target.value) || 1 })} min={1} className="w-full text-[10px] outline-none px-1.5 py-0.5 text-center" style={inputStyle} />
                                </div>
                              </div>
                            )}
                            <button onClick={() => setEditingItemId(null)} className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}><Check size={10} />Done</button>
                          </div>
                        ) : (
                          <div style={DISPLAY_CONTENTS}>
                            {/* Item header */}
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex-1 min-w-0">
                                <span className="text-[12px] font-semibold block truncate" style={{ color: RARITY_COLORS[item.rarity] }}>{item.name}</span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {renderRarityBadge(item.rarity)}
                                  {item.addsToInventory && (() => {
                                    const linkedName = item.inventoryItemId ? dmPlayerItems.find(d => d.id === item.inventoryItemId)?.name : null;
                                    return (
                                    <div className="flex items-center gap-0.5 px-1 py-0.5" style={{ background: "#4AE0C010", border: "1px solid #4AE0C030" }} title={linkedName ? `Adds ${item.inventoryQuantity || 1}x to ${linkedName}` : "Added to inventory on purchase"}>
                                      <Package size={7} style={{ color: "#4AE0C0" }} />
                                      <span className="text-[8px] font-mono" style={{ color: "#4AE0C0" }}>{linkedName ? `+${item.inventoryQuantity || 1} ${linkedName}` : "INV"}</span>
                                    </div>
                                    );
                                  })()}
                                  {item.hidden && isDM && <EyeOff size={8} style={{ color: "#FF5A5A", opacity: 0.6 }} />}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-[14px] font-mono font-bold" style={{ color: isLight ? "#8A7030" : STEEL.gold }}>{item.price.toLocaleString()}</p>
                                <p className="text-[9px] font-mono" style={{ color: shopTextMuted }}>{item.currency}</p>
                              </div>
                            </div>

                            {/* Description */}
                            {item.description && (
                              <p className="text-[11px] leading-relaxed mb-2" style={{ color: shopTextMuted }}>{item.description}</p>
                            )}

                            {/* DM notes */}
                            {isDM && item.notes && (
                              <div className="mb-2 px-1.5 py-1" style={{ background: isLight ? "#FFF0F0" : "#100808", border: isLight ? "1px solid #E0C0C0" : "1px solid #2A1515" }}>
                                <p className="text-[9px]" style={{ color: "#AA7A7A" }}>{item.notes}</p>
                              </div>
                            )}

                            {/* Footer */}
                            <div className="flex items-center justify-between mt-auto pt-1" style={{ borderTop: `1px solid ${borderShop}` }}>
                              <span className="text-[9px] font-mono" style={{ color: outOfStock ? "#FF5A5A" : shopTextMuted }}>
                                {item.quantity < 0 ? "In Stock" : item.quantity === 0 ? "OUT OF STOCK" : `Qty: ${item.quantity}`}
                              </span>
                              <div className="flex items-center gap-1">
                                {!isDM && !outOfStock && shop.status !== "Closed" && (
                                  <button onClick={() => addToCart(shop.id, item.id)} className={`flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}>
                                    <ShoppingCart size={9} />
                                    {inCart ? `(${inCart.quantity})` : "Add"}
                                  </button>
                                )}
                                {isDM && (
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingItemId(item.id); }} className={`px-1.5 py-0.5 text-[9px] ${retro.button}`} style={{ color: "#E0E4F0" }} title="Edit"><Pencil size={9} /></button>
                                    <button onClick={() => updateItem(shop.id, item.id, { hidden: !item.hidden })} className={`px-1.5 py-0.5 text-[9px] ${retro.button}`} style={{ color: "#E0E4F0" }} title={item.hidden ? "Show" : "Hide"}>
                                      {item.hidden ? <Eye size={9} /> : <EyeOff size={9} />}
                                    </button>
                                    <button onClick={() => deleteItem(shop.id, item.id)} className={`px-1.5 py-0.5 text-[9px] ${retro.button}`} style={{ color: "#FF5A5A" }} title="Delete"><Trash2 size={9} /></button>
                                  </div>
                                )}
                              </div>
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
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // Cart sidebar
  // ═══════════════════════════════════════════
  const renderCart = () => {
    if (!showCart) return null;
    const cartItems = cart.map(ci => {
      const shop = shops.find(s => s.id === ci.shopId);
      const item = shop?.items.find(i => i.id === ci.itemId);
      return { ...ci, shop, item };
    }).filter(ci => ci.shop && ci.item);

    return (
      <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowCart(false)}>
        <div className="w-full max-w-sm h-full flex flex-col" style={{ background: STEEL.bg2, borderLeft: `2px solid ${STEEL.borderLight}` }} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${STEEL.border}` }}>
            <div className="flex items-center gap-2">
              <ShoppingCart size={14} style={{ color: STEEL.accent }} />
              <span className="text-[13px] font-bold" style={{ color: STEEL.accentBright }}>Shopping Cart</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5" style={{ color: STEEL.textMuted, background: STEEL.bg3, border: `1px solid ${STEEL.border}` }}>{cart.length}</span>
            </div>
            <button onClick={() => setShowCart(false)} className="hover:opacity-80"><X size={14} style={{ color: STEEL.textMuted }} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ scrollbarWidth: "thin" }}>
            {cartItems.length === 0 && (
              <div className="text-center py-8">
                <ShoppingCart size={32} style={{ color: STEEL.border }} className="mx-auto mb-2" />
                <p className="text-[11px]" style={{ color: STEEL.textMuted }}>Your cart is empty</p>
              </div>
            )}
            {cartItems.map(ci => (
              <div key={`${ci.shopId}-${ci.itemId}`} className="p-3 flex items-start gap-3" style={cardStyle}>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold truncate" style={{ color: STEEL.text }}>{ci.item!.name}</p>
                  <p className="text-[10px] truncate" style={{ color: STEEL.textDim }}>from {ci.shop!.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-mono font-bold" style={{ color: RARITY_COLORS[ci.item!.rarity] }}>{ci.item!.price} {ci.item!.currency}</span>
                    {renderRarityBadge(ci.item!.rarity)}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => updateCartQty(ci.shopId, ci.itemId, ci.quantity - 1)} className="w-5 h-5 flex items-center justify-center text-[12px] font-bold hover:opacity-80" style={{ background: STEEL.bg3, border: `1px solid ${STEEL.border}`, color: STEEL.text }}>-</button>
                  <span className="w-6 text-center text-[11px] font-mono" style={{ color: STEEL.text }}>{ci.quantity}</span>
                  <button onClick={() => updateCartQty(ci.shopId, ci.itemId, ci.quantity + 1)} className="w-5 h-5 flex items-center justify-center text-[12px] font-bold hover:opacity-80" style={{ background: STEEL.bg3, border: `1px solid ${STEEL.border}`, color: STEEL.text }}>+</button>
                  <button onClick={() => removeFromCart(ci.shopId, ci.itemId)} className="w-5 h-5 flex items-center justify-center hover:opacity-80 ml-1" style={{ color: "#FF5A5A" }}><Trash2 size={10} /></button>
                </div>
              </div>
            ))}
          </div>
          {cartItems.length > 0 && (() => {
            // Compute per-currency totals
            const currTotals = new Map<string, number>();
            cartItems.forEach(ci => {
              if (ci.item) currTotals.set(ci.item.currency, (currTotals.get(ci.item.currency) || 0) + ci.item.price * ci.quantity);
            });
            return (
            <div className="px-4 py-3 space-y-3" style={{ borderTop: `1px solid ${STEEL.border}` }}>
              <div className="space-y-1">
                {Array.from(currTotals.entries()).map(([curr, total]) => {
                  const invCurr = availableCurrencies.find(c => c.name === curr);
                  const isInventoryCurrency = !!invCurr;
                  const canAfford = !isInventoryCurrency || invCurr.quantity === -1 || invCurr.quantity >= total;
                  return (
                    <div key={curr} className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold" style={{ color: STEEL.text }}>{curr}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-mono font-bold" style={{ color: canAfford ? STEEL.gold : "#FF5A5A" }}>{total.toLocaleString()} {curr}</span>
                        {isInventoryCurrency && (
                          <span className="text-[9px] font-mono px-1 py-0.5" style={{ background: canAfford ? "#0A1A0A" : "#1A0808", border: `1px solid ${canAfford ? "#1A2A1A" : "#2A1515"}`, color: canAfford ? "#6ACA8A" : "#FF5A5A" }}>
                            bal: {invCurr.quantity === -1 ? "∞" : invCurr.quantity.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={checkout} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}><Coins size={11} />Purchase</button>
                <button onClick={clearCart} className={`flex items-center gap-1 px-3 py-2 text-[11px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}><Trash2 size={10} />Clear</button>
              </div>
            </div>
          ); })()}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // Ledger
  // ���══════════════════════════════════════════
  const renderLedger = () => {
    const entries = isDM ? ledger : ledger.filter(e => e.buyerId === currentUserId);
    const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
    return (
      <div className="min-h-screen" style={{ background: pageBg }}>
        <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: STEEL.bg2, borderBottom: `1px solid ${STEEL.border}` }}>
          <button onClick={() => setShowLedger(false)} className="flex items-center gap-1 mr-2 hover:opacity-80" style={{ color: STEEL.accent }}><ArrowLeft size={14} /></button>
          <Scroll size={14} style={{ color: STEEL.accent }} />
          <span className="text-[14px] font-bold tracking-wide" style={{ color: STEEL.accentBright }}>Transaction Ledger</span>
        </div>
        <div className="p-4 max-w-4xl mx-auto space-y-3">
          {sorted.length === 0 && (
            <div className="p-8 text-center" style={cardStyle}>
              <Scroll size={32} style={{ color: STEEL.border }} className="mx-auto mb-2" />
              <p className="text-[11px]" style={{ color: STEEL.textMuted }}>No transactions recorded yet.</p>
            </div>
          )}
          {sorted.map(entry => (
            <div key={entry.id} className="p-3 flex items-center gap-3" style={cardStyle}>
              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ background: STEEL.bg3, border: `1px solid ${STEEL.border}` }}>
                <Coins size={14} style={{ color: STEEL.gold }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold truncate" style={{ color: STEEL.text }}>{entry.itemName} x{entry.quantity}</p>
                <p className="text-[10px]" style={{ color: STEEL.textDim }}>{entry.shopName} &middot; {entry.buyerName}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[12px] font-mono font-bold" style={{ color: STEEL.gold }}>{(entry.unitPrice * entry.quantity).toLocaleString()} {entry.currency}</p>
                <p className="text-[9px] font-mono" style={{ color: STEEL.textMuted }}>{new Date(entry.timestamp).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // Main Render
  // ═══════════════════════════════════════════

  // Ledger view
  if (showLedger) return <DndProvider backend={HTML5Backend} key="ledger"><div style={DISPLAY_CONTENTS}>{renderLedger()}{renderCart()}</div></DndProvider>;

  // Shop sub-page view
  if (selectedShop) return <DndProvider backend={HTML5Backend} key="shop-sub"><div style={DISPLAY_CONTENTS}>{renderShopSubPage(selectedShop)}{renderCart()}</div></DndProvider>;

  // ── Shop listing (main page) ──
  return (
    <DndProvider backend={HTML5Backend} key="shop-listing">
      <div className="min-h-screen relative" style={{ background: `linear-gradient(170deg, ${STEEL.bg1} 0%, #0A0C18 25%, #0D0E1A 50%, color-mix(in srgb, ${STEEL.accent} 4%, ${STEEL.bg1}) 75%, ${STEEL.bg1} 100%)` }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: [
            `repeating-linear-gradient(45deg, ${STEEL.accent}0C 0px, ${STEEL.accent}0C 1px, transparent 1px, transparent 12px)`,
            `repeating-linear-gradient(-45deg, ${STEEL.accent}0C 0px, ${STEEL.accent}0C 1px, transparent 1px, transparent 12px)`,
            `repeating-linear-gradient(45deg, ${STEEL.accent}06 0px, ${STEEL.accent}06 1px, transparent 1px, transparent 24px)`,
            `repeating-linear-gradient(-45deg, ${STEEL.accent}06 0px, ${STEEL.accent}06 1px, transparent 1px, transparent 24px)`,
          ].join(", "),
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(circle 2px at 12px 12px, ${STEEL.accent}14, transparent 2px)`,
          backgroundSize: "24px 24px",
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse at 50% 0%, ${STEEL.accent}0A 0%, transparent 40%), radial-gradient(ellipse at 50% 100%, ${STEEL.accent}08 0%, transparent 40%)`,
        }} />
        <div className="relative z-10">
        <div className="flex items-center gap-2 px-4 py-2" style={{ background: `linear-gradient(90deg, ${STEEL.bg2} 0%, color-mix(in srgb, ${STEEL.accent} 5%, ${STEEL.bg2}) 50%, ${STEEL.bg2} 100%)`, borderBottom: `1px solid ${STEEL.border}`, boxShadow: `0 2px 16px rgba(0,0,0,0.4)` }}>
          <button onClick={() => navigate("/interface")} className="flex items-center gap-1 mr-2 hover:opacity-80" style={{ color: STEEL.accent }}>
            <ArrowLeft size={14} />
          </button>
          <Store size={14} style={{ color: STEEL.accent }} />
          <span className="text-[14px] font-bold tracking-wide" style={{ color: STEEL.accentBright }}>Commerce</span>
          <div className="flex-1" />
          {!isDM && (
            <button onClick={() => setShowCart(true)} className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold relative ${retro.button}`} style={{ color: "#E0E4F0" }}>
              <ShoppingCart size={12} />Cart
              {cart.length > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[8px] font-bold rounded-full" style={{ background: "#FF5A5A", color: "#fff" }}>{cart.length}</span>}
            </button>
          )}
          <button onClick={() => setShowLedger(true)} className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}><Scroll size={12} />Ledger</button>
          {isDM && (
            <button onClick={() => { setCreatingShop(true); setDraftShop({}); }} className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}><Plus size={12} />New Shop</button>
          )}
        </div>

        <div className="p-6 max-w-[1600px] mx-auto" style={{
          border: `1px solid ${STEEL.border}`,
          borderTop: "none",
          boxShadow: `inset 0 2px 8px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.3), 0 0 1px ${STEEL.accent}10`,
          background: `linear-gradient(180deg, ${STEEL.bg1}80 0%, transparent 2px), linear-gradient(0deg, ${STEEL.bg1}80 0%, transparent 2px)`,
        }}>
          {creatingShop && (
            <div className="mb-6 p-4 space-y-3" style={{ backgroundColor: panelBg, border: `2px solid ${panelBorder}` }}>
              <div className="flex items-center gap-2 mb-2">
                <Store size={14} style={{ color: STEEL.accent }} />
                <span className="text-[13px] font-bold" style={{ color: STEEL.accentBright }}>New Shop</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: labelColor }}>Name</label>
                  <input value={draftShop.name || ""} onChange={e => setDraftShop(p => ({ ...p, name: e.target.value }))} autoFocus className="w-full text-[12px] outline-none px-2 py-1.5" style={inputStyle} maxLength={60} />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: labelColor }}>Owner</label>
                  <input value={draftShop.owner || ""} onChange={e => setDraftShop(p => ({ ...p, owner: e.target.value }))} className="w-full text-[12px] outline-none px-2 py-1.5" style={inputStyle} maxLength={60} />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: labelColor }}>Location</label>
                  <input value={draftShop.location || ""} onChange={e => setDraftShop(p => ({ ...p, location: e.target.value }))} className="w-full text-[12px] outline-none px-2 py-1.5" style={inputStyle} maxLength={80} />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: labelColor }}>Status</label>
                  <select value={draftShop.status || "Open"} onChange={e => setDraftShop(p => ({ ...p, status: e.target.value as Shop["status"] }))} className="w-full text-[12px] outline-none px-2 py-1.5 cursor-pointer" style={inputStyle}>
                    {SHOP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: labelColor }}>Type</label>
                <div className="flex gap-1.5">
                  {SHOP_TYPES.map(st => (
                    <button key={st.value} type="button" onClick={() => setDraftShop(p => ({ ...p, shopType: st.value }))} className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold transition-all" style={{ background: (draftShop.shopType || "general") === st.value ? `${st.color}30` : STEEL.bg1, border: (draftShop.shopType || "general") === st.value ? `1px solid ${st.color}` : `1px solid ${panelBorder}`, color: (draftShop.shopType || "general") === st.value ? st.color : STEEL.textMuted }}>
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: labelColor }}>Description</label>
                <textarea value={draftShop.description || ""} onChange={e => setDraftShop(p => ({ ...p, description: e.target.value }))} className="w-full text-[12px] outline-none px-2 py-1.5 resize-y min-h-[50px]" style={inputStyle} />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={addShop} className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}><Check size={11} />Create Shop</button>
                <button onClick={() => { setCreatingShop(false); setDraftShop({}); }} className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold ${retro.button}`} style={{ color: "#E0E4F0" }}><X size={11} />Cancel</button>
              </div>
            </div>
          )}

          {visibleShops.length === 0 && !creatingShop && (
            <div className="flex flex-col items-center justify-center py-20">
              <Store size={48} style={{ color: STEEL.border }} className="mb-3" />
              <p className="text-[14px] font-semibold" style={{ color: STEEL.textMuted }}>{isDM ? "Create your first shop." : "No shops available yet."}</p>
            </div>
          )}

          {SHOP_TYPES.map(st => {
            const groupShops = visibleShops
              .filter(s => (s.shopType || "general") === st.value)
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            if (groupShops.length === 0 && !isDM) return null;
            return (
              <div key={st.value} className="mb-8">
                <div className="flex items-center gap-3 mb-4 pb-2" style={{ borderBottom: `1px solid ${STEEL.border}` }}>
                  <st.icon size={13} style={{ color: st.color }} />
                  <span className="text-[12px] font-bold tracking-widest uppercase" style={{ color: "#E0E4F0" }}>{st.label}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5" style={{ color: STEEL.textMuted, background: STEEL.bg3, border: `1px solid ${STEEL.border}` }}>{groupShops.length}</span>
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${STEEL.border}, transparent)` }} />
                </div>
                {groupShops.length === 0 ? (
                  <div className="p-6 text-center" style={{ background: STEEL.bg2, border: `1px solid ${STEEL.border}` }}>
                    <p className="text-[11px]" style={{ color: STEEL.textMuted }}>No {st.label.toLowerCase()} yet.</p>
                  </div>
                ) : (
                  <ScrollableShopRow shopCount={groupShops.length}>
                    {groupShops.map((shop, idx) => (
                      <div key={shop.id} className="flex-shrink-0 w-[320px]">
                        <DraggableShopCard
                          shop={shop}
                          isDM={isDM}
                          accent={accent}
                          index={idx}
                          groupType={st.value}
                          onSelect={() => { setSelectedShopId(shop.id); setActiveCategory("All"); setSearchQuery(""); setFilterRarity("all"); setCreatingShop(false); }}
                          onReorder={reorderShop}
                          renderStatusBadge={renderStatusBadge}
                        />
                      </div>
                    ))}
                  </ScrollableShopRow>
                )}
              </div>
            );
          })}
        </div>

        {renderCart()}
        </div>
      </div>
    </DndProvider>
  );
}
