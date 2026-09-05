import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import { getPlayerTheme, buildPageGradient, firstColor, ts, bc } from "./player-theme";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Resizable } from "re-resizable";
import {
  ArrowLeft, Building2, Package, Factory, Users, Info,
  Shield, Star, Swords, TrendingUp, TrendingDown, Minus,
  Pencil, Check, X, ChevronRight, Briefcase, MapPin,
  Clock, AlertTriangle, Crown, Gem, Award, Target,
  Heart, Skull, Flame, Zap, Eye, Lock, Plus, Trash2,
  Landmark, ChevronLeft, Settings, Scroll, Compass,
  Anchor, Mountain, TreePine, Feather, BookOpen,
  Crosshair, Waypoints, CircleDot, Hexagon, GripVertical,
  ChevronDown, ImagePlus, Save, FileDown, Activity,
  Wrench, Store, Power, Pin, PinOff, FileText,
  Archive, DollarSign, RotateCcw, UserPlus, Coins, ArrowUp, ArrowDown,
  type LucideIcon,
} from "lucide-react";

import { safeGetItem } from "./safe-storage";
import { appStore } from "@/lib/app-store";
import {
  OfficeBusinessMap,
  collectBusinessMapAssets,
  countInstalledFacilityAdditionSlots,
  countInstalledFacilityAdditions,
  createDefaultOfficeBusinessMap,
  createFacilityBusinessMap,
  normalizeOfficeBusinessMap,
  type BusinessMapPlayerOption,
  type FacilityAddition,
  type OfficeBusinessMapState,
} from "./office-business-map";
import { deleteBusinessMapImage } from "@/lib/business-map-storage";
import {
  applyFacilityAdditionAction as applyFacilityAdditionServerAction,
  saveOfficeState,
  subscribeToOfficeStateSignals,
  type FacilityAdditionAction,
} from "@/lib/office-state-api";
import {
  createMysticLandsParkFacility,
  calculateFacilityEconomy,
  calculateFacilityStats,
  ensureMysticLandsAdditions,
  type FacilityMonthlyReport,
  type FacilityStats,
  type PersonalFund,
} from "@/lib/facility-depth-model";
import { isCreditsServiceUnavailable, loadCreditAccount, loadCreditAccounts, type CreditAccount } from "@/lib/credits-api";
import { normalizeFacilityOfficeState, normalizeFacilityRecord } from "@/lib/facility-office-state";
import {
  NS_MUTED, NS_DIM, NS_TEXT, NS_ACCENT_GREEN, NS_INPUT_STYLE, NS_BORDER_B,
  NS_DARK, NS_SUBDIM, NS_BRIGHT, NS_SOFT, NS_MID, NS_GOLD, NS_BLUE, NS_RED,
  NS_WARN, NS_PALE, NS_FAINT, NS_MID2, NS_BG_DARK, NS_BG_DARKER,
  NS_BORDER_DARK, NS_BTN_CONFIRM, NS_BTN_CANCEL, NS_BADGE, NS_BTN_EDIT,
  NS_BTN_DELETE, NS_BTN_REP_MINUS, NS_BTN_REP_PLUS, NS_DETAIL_INPUT,
  NS_ROLE_INPUT, NS_DISPLAY_CONTENTS, NS_BTN_LOAD, NS_NAME_INPUT,
  NS_STAT_BTN, NS_STAT_VALUE, NS_BORDER_SECTION, NS_BORDER_SUBSECTION,
  NS_BAR_BG, NS_DETAIL_SELECT, NS_TYPE_SELECT, NS_TEXTAREA, NS_REP_BAR_BG,
  NS_ICON_BLUE_SOFT, NS_ICON_GOLD_DIM, NS_ICON_GOLD_SOFT, NS_ICON_GOLD_HALF,
  NS_ICON_BLUE_DIM, NS_ICON_GREEN_SOFT, NS_ICON_RED_SOFT, NS_EMPTY_ICON,
  NS_EMPTY_ICON_LG, NS_SAVE_PRESET_BG, NS_LOAD_PRESET_BG, NS_ADD_GOLD,
  NS_SECTION_BORDER, NS_PANEL_BG, NS_ICON_AMBER_SOFT, NS_ICON_MINT_SOFT,
  NS_OVERLAY_BG, NS_DIVIDER_DARK, NS_BORDER_THIN, NS_GRAY_BADGE,
  NS_GRAY_BADGE_LG, NS_DELETE_BTN_ALT, NS_NO_EVENTS, NS_BORDER_TOP_DARK,
  NS_DIM_SIZE_LABEL, NS_STAT_TEAL_BOX, NS_STAT_BLUE_BOX, NS_STAT_AMBER_BOX,
  NS_GOLD_SUBTLE_BOX, NS_BLUE_SUBTLE_BOX, NS_BORDER_TOP_PANEL, NS_INPUT_DIM,
  NS_INPUT_DARK, NS_GRAY_SELECT, NS_PLACEHOLDER_ICON, NS_MIN_W_100,
  NS_TOOLBAR_BG, NS_BADGE_DARK, NS_RED_DARK, NS_GREEN, NS_TEAL, NS_STEEL,
  NS_AMBER, NS_BROWN, NS_SKY, NS_SLATE, NS_MUTED2,
  NS_PANEL_GREEN, NS_PANEL_BLUE, NS_PORTRAIT_VIEW, NS_PRIORITY_BADGE,
  NS_ENTITY_REP_BAR,
  nsToggleStyle, nsEditToggle, nsIconToggle, nsTypeToggle, nsToggleBtn,
  nsAccentBtn, nsAccentDim, nsAccentHalf, nsAccentSoft, nsAccentBg, nsBgColor,
  nsColorInput, nsGradLine, nsPriBadge, nsIconTint, nsColorBox,
  nsSliderThumb, nsSliderAccent, nsChevronCollapse, nsSubtleBox, nsTierBadge,
  nsMetaBadge, nsDragFade, nsCatBorder, nsRarityDot, nsIncomeColor,
  nsRevColor, nsExpColor, nsNetColor, nsTextColor, nsHasText,
  nsAccentBorder, nsTabActive, nsHpBar, nsWoundBar, nsPinToggle,
  nsAccentTile, nsFooterInput, nsGradientDiv, nsInnerPad16, nsInnerPad14_16,
  nsDropTarget, nsAccentIcon, nsNameInput, nsIncomeIcon, nsBadgeCustom,
  nsNameTitle, nsPortraitImg, nsPhotoDrag, nsPortraitFrame, nsRepBar,
} from "./ns-styles";

const OFFICE_NAME_KEY = "inet-office-name";
const LEGACY_DEFAULT_OFFICE_NAME = "Nexus Nomad's Office";
const DEFAULT_OFFICE_NAME = "Wasp Office and Business";
let officeNameCache = DEFAULT_OFFICE_NAME;

function loadOfficeName(): string {
  return officeNameCache || DEFAULT_OFFICE_NAME;
}

function saveOfficeName(_name: string) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

export { OFFICE_NAME_KEY, DEFAULT_OFFICE_NAME, loadOfficeName };

// ═══════════════════════════════════════════
// Inventory system (uses same item model as commerce/shops)
// ═══════════════════════════════════════════

type InvItemRarity = "Common" | "Uncommon" | "Rare" | "Very Rare" | "Legendary";
const INV_RARITIES: InvItemRarity[] = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
const INV_RARITY_COLORS: Record<InvItemRarity, string> = {
  Common: "#9AAACC",
  Uncommon: "#7ACA8A",
  Rare: "#6A9AFF",
  "Very Rare": "#AA6AFF",
  Legendary: "#FFD700",
};

const DAMAGE_TYPES = ["Slashing", "Piercing", "Bludgeoning", "Fire", "Cold", "Lightning", "Acid", "Poison", "Necrotic", "Radiant", "Psychic", "Force", "Thunder"] as const;

type EffectStat = "strength" | "agility" | "constitution" | "knowledge" | "wisdom" | "willpower"
  | "hp" | "maxHp" | "wounds" | "maxWounds" | "tempHp" | "armorClass" | "damageReduction";

const EFFECT_STAT_OPTIONS: { key: EffectStat; label: string }[] = [
  { key: "strength", label: "STR" }, { key: "agility", label: "AGI" },
  { key: "constitution", label: "CON" }, { key: "knowledge", label: "KNO" },
  { key: "wisdom", label: "WIS" }, { key: "willpower", label: "WIL" },
  { key: "maxHp", label: "Max HP" }, { key: "hp", label: "Current HP" },
  { key: "maxWounds", label: "Max Wounds" }, { key: "wounds", label: "Current Wounds" },
  { key: "tempHp", label: "Temp HP" },
  { key: "armorClass", label: "AC" }, { key: "damageReduction", label: "DR" },
];

const EFFECT_STAT_COLORS: Record<string, string> = {
  strength: "#FF6A6A", agility: "#6ACA8A", constitution: "#CA8A4A",
  knowledge: "#5A9ADA", wisdom: "#AA7ADA", willpower: "#DA6AAA",
  hp: "#4ACA6A", maxHp: "#4ACA6A", wounds: "#FF6A6A", maxWounds: "#FF6A6A",
  tempHp: "#5AC0C0", armorClass: "#7A9ABB", damageReduction: "#CAAA3A",
};

interface InvItemEffect {
  stat: EffectStat;
  value: number;
}

interface InvItem {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  quantity: number;
  rarity: InvItemRarity;
  notes: string;
  hidden: boolean;
  damage?: string;
  damageType?: string;
  effects?: InvItemEffect[];
  effectText?: string;
  tags?: string[];
}

interface InvGroup {
  id: string;
  name: string;
  itemIds: string[];
}

interface InvSubTab {
  id: string;
  name: string;
  icon: string;
  items: InvItem[];
  groups?: InvGroup[];
}

interface EquippedRef {
  tabId: string;
  itemId: string;
}

function computeEquipBuffs(equippedItems: EquippedRef[], invTabs: InvSubTab[]): Record<string, number> {
  const buffs: Record<string, number> = {};
  for (const ref of equippedItems) {
    const tab = invTabs.find(t => t.id === ref.tabId);
    if (!tab) continue;
    const item = tab.items.find(i => i.id === ref.itemId);
    if (!item?.effects) continue;
    for (const eff of item.effects) {
      buffs[eff.stat] = (buffs[eff.stat] || 0) + eff.value;
    }
  }
  return buffs;
}

function getEquippedItemDetails(equippedItems: EquippedRef[], invTabs: InvSubTab[]): InvItem[] {
  const results: InvItem[] = [];
  for (const ref of equippedItems) {
    const tab = invTabs.find(t => t.id === ref.tabId);
    if (!tab) continue;
    const item = tab.items.find(i => i.id === ref.itemId);
    if (item) results.push(item);
  }
  return results;
}

const INVENTORY_KEY = "inet-office-inventory";

const DEFAULT_INVENTORY: InvSubTab[] = [
  {
    id: "inv-currency", name: "Currency Items", icon: "coins", items: [],
  },
  {
    id: "inv-weapons", name: "Weapons Cache", icon: "swords",
    items: [
      { id: "iw-1", name: "Standard Pistols", description: "Reliable sidearms for field agents.", price: 50, currency: "Credits", quantity: 15, rarity: "Common", notes: "", hidden: false },
      { id: "iw-2", name: "Assault Rifles", description: "Military-grade automatic weapons.", price: 200, currency: "Credits", quantity: 8, rarity: "Common", notes: "", hidden: false },
      { id: "iw-3", name: "Sniper Rifles", description: "Precision long-range rifles.", price: 500, currency: "Credits", quantity: 3, rarity: "Uncommon", notes: "", hidden: false },
      { id: "iw-4", name: "Stun Grenades", description: "Non-lethal flashbang grenades.", price: 25, currency: "Credits", quantity: 24, rarity: "Common", notes: "", hidden: false },
    ],
  },
  {
    id: "inv-equipment", name: "Equipment & Supplies", icon: "shield",
    items: [
      { id: "ie-1", name: "Kevlar Vests", description: "Standard body armor for field ops.", price: 150, currency: "Credits", quantity: 20, rarity: "Common", notes: "", hidden: false },
      { id: "ie-2", name: "Night Vision Goggles", description: "Enhanced low-light optics.", price: 300, currency: "Credits", quantity: 10, rarity: "Uncommon", notes: "", hidden: false },
      { id: "ie-3", name: "Medical Kits", description: "Field medical supplies and tools.", price: 75, currency: "Credits", quantity: 18, rarity: "Common", notes: "", hidden: false },
      { id: "ie-4", name: "Lockpick Sets", description: "Professional infiltration tools.", price: 100, currency: "Credits", quantity: 12, rarity: "Common", notes: "", hidden: false },
    ],
  },
];

function loadInventory(): InvSubTab[] {
  return clonePlain(DEFAULT_INVENTORY);
}

function saveInventory(_tabs: InvSubTab[]) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

function isLegacyCreditInventoryItem(item: InvItem) {
  return item.name.trim().toLowerCase() === "credits" && item.tags?.includes("Currency");
}

const OFFICE_INFO_KEY = "office_info";

interface OfficeInfoService {
  id: string;
  name: string;
  icon: string;
}

interface OfficeInfoContact {
  label: string;
  value: string;
  style?: "mono" | "badge" | "normal";
  badgeColor?: string;
}

interface OfficeInfoData {
  dossier: string;
  services: OfficeInfoService[];
  contacts: OfficeInfoContact[];
}

const DEFAULT_OFFICE_INFO: OfficeInfoData = {
  dossier: "A premier private security and intelligence firm operating within the city. Specializing in covert operations, asset protection, and information gathering.\n\nThe team of elite operatives brings diverse skills and backgrounds to every mission, ensuring comprehensive solutions for the most challenging problems.",
  services: [
    { id: "svc-1", name: "Intelligence Gathering & Analysis", icon: "eye" },
    { id: "svc-2", name: "Asset Recovery & Protection", icon: "shield" },
    { id: "svc-3", name: "Covert Operations & Infiltration", icon: "target" },
    { id: "svc-4", name: "Security Consulting & Training", icon: "users" },
    { id: "svc-5", name: "Corporate Investigations", icon: "briefcase" },
  ],
  contacts: [
    { label: "Comms", value: "[ENCRYPTED CHANNEL]", style: "mono" },
    { label: "Location", value: "Downtown Sector 7", style: "normal" },
    { label: "Clearance", value: "LEVEL 3 REQUIRED", style: "badge", badgeColor: "#FF6A6A" },
  ],
};

function loadOfficeInfo(): OfficeInfoData {
  return clonePlain(DEFAULT_OFFICE_INFO);
}

function saveOfficeInfo(_data: OfficeInfoData) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

const ICON_OPTIONS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: "shield", icon: Shield, label: "Shield" },
  { key: "star", icon: Star, label: "Star" },
  { key: "crown", icon: Crown, label: "Crown" },
  { key: "skull", icon: Skull, label: "Skull" },
  { key: "flame", icon: Flame, label: "Flame" },
  { key: "eye", icon: Eye, label: "Eye" },
  { key: "target", icon: Target, label: "Target" },
  { key: "heart", icon: Heart, label: "Heart" },
  { key: "swords", icon: Swords, label: "Swords" },
  { key: "landmark", icon: Landmark, label: "Landmark" },
  { key: "scroll", icon: Scroll, label: "Scroll" },
  { key: "compass", icon: Compass, label: "Compass" },
  { key: "anchor", icon: Anchor, label: "Anchor" },
  { key: "mountain", icon: Mountain, label: "Mountain" },
  { key: "tree", icon: TreePine, label: "Tree" },
  { key: "feather", icon: Feather, label: "Feather" },
  { key: "book", icon: BookOpen, label: "Book" },
  { key: "crosshair", icon: Crosshair, label: "Crosshair" },
  { key: "gem", icon: Gem, label: "Gem" },
  { key: "users", icon: Users, label: "Users" },
  { key: "briefcase", icon: Briefcase, label: "Briefcase" },
  { key: "waypoints", icon: Waypoints, label: "Waypoints" },
  { key: "circle", icon: CircleDot, label: "Circle" },
  { key: "hexagon", icon: Hexagon, label: "Hexagon" },
  { key: "package", icon: Package, label: "Package" },
  { key: "coins", icon: Coins, label: "Coins" },
];

function getIconComponent(key: string): LucideIcon {
  const found = ICON_OPTIONS.find(o => o.key === key);
  return found ? found.icon : Shield;
}

interface EntityTierDef {
  label: string;
  color: string;
  min: number;
  max: number;
}

const DEFAULT_GOV_TIERS: EntityTierDef[] = [
  { label: "Outlawed", color: "#FF2A2A", min: -100, max: -61 },
  { label: "Illegal", color: "#FF5A3A", min: -60, max: -31 },
  { label: "Suspicious", color: "#CC6A4A", min: -30, max: -11 },
  { label: "Unregistered", color: "#6A7A9A", min: -10, max: 10 },
  { label: "Licensed", color: "#5A9ACA", min: 11, max: 30 },
  { label: "Endorsed", color: "#5ACA7A", min: 31, max: 60 },
  { label: "Valued Asset", color: "#CAAA3A", min: 61, max: 85 },
  { label: "Essential Asset", color: "#FFD700", min: 86, max: 100 },
];

const DEFAULT_ENTITY_TIERS: EntityTierDef[] = [
  { label: "Despised", color: "#FF1A1A", min: -100, max: -76 },
  { label: "Hostile", color: "#FF4A3A", min: -75, max: -51 },
  { label: "Unfriendly", color: "#CC6A4A", min: -50, max: -26 },
  { label: "Wary", color: "#9A7A5A", min: -25, max: -6 },
  { label: "Neutral", color: "#6A7A9A", min: -5, max: 5 },
  { label: "Cordial", color: "#5A9ACA", min: 6, max: 25 },
  { label: "Friendly", color: "#4ABA6A", min: 26, max: 50 },
  { label: "Trusted", color: "#3ACA5A", min: 51, max: 75 },
  { label: "Strong Ally", color: "#FFD700", min: 76, max: 100 },
];

function getTierForValue(value: number, tiers: EntityTierDef[]) {
  return tiers.find(t => value >= t.min && value <= t.max) || tiers[Math.floor(tiers.length / 2)] || DEFAULT_ENTITY_TIERS[4];
}

interface CityGovConfig {
  name: string;
  subtitle: string;
  icon: string;
  tiers: EntityTierDef[];
}

const DEFAULT_GOV_CONFIG: CityGovConfig = {
  name: "The City Government",
  subtitle: "Official municipal standing",
  icon: "landmark",
  tiers: DEFAULT_GOV_TIERS.map(t => ({ ...t })),
};

const GOV_CONFIG_KEY = "inet-office-gov-config";

function loadGovConfig(): CityGovConfig {
  return {
    ...DEFAULT_GOV_CONFIG,
    tiers: defaultGovTiers(),
  };
}

function saveGovConfig(_cfg: CityGovConfig) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

interface ReputationEntity {
  id: string;
  name: string;
  value: number;
  icon: string;
  tiers: EntityTierDef[];
}

const ENTITY_REP_KEY = "inet-office-entity-reputations";

function loadEntityReps(): ReputationEntity[] {
  return [];
}

function saveEntityReps(_entities: ReputationEntity[]) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultEntityTiers(): EntityTierDef[] {
  return DEFAULT_ENTITY_TIERS.map(t => ({ ...t }));
}

function defaultGovTiers(): EntityTierDef[] {
  return DEFAULT_GOV_TIERS.map(t => ({ ...t }));
}

interface Employee {
  id: string;
  name: string;
  role: string;
  photo?: string;
  photoW?: number;
  photoH?: number;
  photoScale?: number;
  photoOffX?: number;
  photoOffY?: number;
  hp?: number;
  maxHp?: number;
  wounds?: number;
  maxWounds?: number;
  tempHp?: number;
  armorClass?: number;
  damageReduction?: number;
  strength?: number;
  agility?: number;
  constitution?: number;
  knowledge?: number;
  wisdom?: number;
  willpower?: number;
  proficiencies?: string[];
  equipment?: string[];
  personality?: string;
  workInfo?: string;
  equippedItems?: EquippedRef[];
}

interface EmployeePreset {
  id: string;
  name: string;
  photo?: string;
  photoW?: number;
  photoH?: number;
  photoScale?: number;
  photoOffX?: number;
  photoOffY?: number;
  hp?: number;
  maxHp?: number;
  wounds?: number;
  maxWounds?: number;
  tempHp?: number;
  armorClass?: number;
  damageReduction?: number;
  strength?: number;
  agility?: number;
  constitution?: number;
  knowledge?: number;
  wisdom?: number;
  willpower?: number;
  proficiencies?: string[];
  equipment?: string[];
  personality?: string;
  workInfo?: string;
}

const EMPLOYEE_PRESETS_KEY = "inet-office-emp-presets";

function loadPresets(): EmployeePreset[] {
  return [];
}

function savePresets(_presets: EmployeePreset[]) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

interface EquipLoadout {
  id: string;
  name: string;
  equipment: string[];
  equippedItems: EquippedRef[];
}

const EQUIP_LOADOUTS_KEY = "inet-office-equip-loadouts";

function loadLoadouts(): EquipLoadout[] {
  return [];
}

function saveLoadouts(_loadouts: EquipLoadout[]) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

const STAT_KEYS = ["strength", "agility", "constitution", "knowledge", "wisdom", "willpower"] as const;
const STAT_LABELS: Record<string, string> = {
  strength: "STR", agility: "AGI", constitution: "CON",
  knowledge: "KNO", wisdom: "WIS", willpower: "WIL",
};
const STAT_COLORS: Record<string, string> = {
  strength: "#FF6A6A", agility: "#6ACA8A", constitution: "#CA8A4A",
  knowledge: "#5A9ADA", wisdom: "#AA7ADA", willpower: "#DA6AAA",
};

interface EmployeeCategory {
  id: string;
  name: string;
  employeeIds: string[];
  collapsed: boolean;
}

const EMPLOYEES_KEY = "inet-office-employees";
const EMPLOYEE_CATS_KEY = "inet-office-employee-cats";

const DEFAULT_EMPLOYEES: Employee[] = [
  { id: "emp-1", name: "Agent Phoenix", role: "Field Operative" },
  { id: "emp-2", name: "Agent Shadow", role: "Infiltration Specialist" },
  { id: "emp-3", name: "Agent Atlas", role: "Heavy Weapons" },
  { id: "emp-4", name: "Agent Cipher", role: "Tech Specialist" },
  { id: "emp-5", name: "Agent Wraith", role: "Reconnaissance" },
];

function loadEmployees(): Employee[] {
  return clonePlain(DEFAULT_EMPLOYEES);
}

function saveEmployees(_emps: Employee[]) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

function loadEmployeeCats(): EmployeeCategory[] {
  return [{ id: "cat-default", name: "General", employeeIds: DEFAULT_EMPLOYEES.map(e => e.id), collapsed: false }];
}

function saveEmployeeCats(_cats: EmployeeCategory[]) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

type FacilityType = "Facility" | "Commercial" | "Utility";

const FACILITY_TYPE_META: Record<FacilityType, { icon: LucideIcon; color: string }> = {
  Facility: { icon: Factory, color: "#6A9ADA" },
  Commercial: { icon: Store, color: "#CAAA3A" },
  Utility: { icon: Power, color: "#4ACA6A" },
};

interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  location?: string;
  description?: string;
  status?: string;
  statusColor?: string;
  capacity?: string;
  condition?: string;
  notes?: string;
  revenue?: string;
  expenses?: string;
  employeesOnSite?: string;
  businessMap?: OfficeBusinessMapState;
  ownerPlayerId?: string;
  presetId?: string;
  baseStats?: FacilityStats;
  staffCostPerPerson?: number;
  currentMonth?: number;
  monthlyReports?: FacilityMonthlyReport[];
  revenueDestination?: "owner-personal-fund";
}

interface FacilityCategory {
  id: string;
  name: string;
  facilityIds: string[];
  collapsed: boolean;
}

const FACILITIES_KEY = "inet-office-facilities";
const FACILITY_CATS_KEY = "inet-office-facility-cats";

const DEFAULT_FACILITIES: Facility[] = [
  { id: "fac-1", name: "Headquarters", type: "Facility", location: "Downtown Sector 7", description: "Main operations center with command room, armory, and living quarters.", status: "Active", statusColor: "#4ACA6A" },
  { id: "fac-2", name: "Safe House Alpha", type: "Facility", location: "Industrial District", description: "Covert staging area for field operations. Basic supplies available.", status: "Active", statusColor: "#4ACA6A" },
  { id: "fac-3", name: "Training Facility", type: "Facility", location: "Outskirts - Sector 12", description: "Combat training grounds, shooting range, and simulation rooms.", status: "Active", statusColor: "#4ACA6A" },
  { id: "fac-4", name: "Warehouse Storage", type: "Utility", location: "Docks - Sector 3", description: "Bulk equipment and vehicle storage. Limited access.", status: "Active", statusColor: "#4ACA6A" },
];

function loadFacilities(): Facility[] {
  return clonePlain(DEFAULT_FACILITIES);
}

function saveFacilities(_facs: Facility[]) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

function loadFacilityCats(): FacilityCategory[] {
  return [{ id: "fcat-default", name: "General", facilityIds: DEFAULT_FACILITIES.map(f => f.id), collapsed: false }];
}

function saveFacilityCats(_cats: FacilityCategory[]) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

type ContractPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const PRIORITY_META: Record<ContractPriority, { color: string }> = {
  LOW: { color: "#5A9ACA" },
  MEDIUM: { color: "#CAAA3A" },
  HIGH: { color: "#FF5A5A" },
  CRITICAL: { color: "#CA3ACA" },
};

interface Contract {
  id: string;
  name: string;
  description?: string;
  priority?: ContractPriority;
  due?: string;
  status?: string;
  statusColor?: string;
  client?: string;
  reward?: string;
  location?: string;
  notes?: string;
  pinned?: boolean;
  pinnedAt?: number;
  assignedEmployeeIds?: string[];
  archived?: boolean;
  archivedAt?: number;
}

interface ContractCategory {
  id: string;
  name: string;
  contractIds: string[];
  collapsed: boolean;
}

const CONTRACTS_KEY = "inet-office-contracts";
const CONTRACT_CATS_KEY = "inet-office-contract-cats";

const DEFAULT_CONTRACTS: Contract[] = [
  { id: "con-1", name: "Urban Reconnaissance", description: "Multiple agents deployed for intelligence gathering in the city sectors.", priority: "HIGH", due: "3 days", status: "Active", statusColor: "#4ACA6A", pinned: true, pinnedAt: 1 },
  { id: "con-2", name: "Asset Recovery", description: "Retrieve stolen corporate data from hostile territory.", priority: "MEDIUM", due: "7 days", status: "Active", statusColor: "#4ACA6A", pinned: true, pinnedAt: 2 },
];

function loadContracts(): Contract[] {
  return clonePlain(DEFAULT_CONTRACTS);
}

function saveContracts(_cons: Contract[]) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

function loadContractCats(): ContractCategory[] {
  return [{ id: "ccat-default", name: "General", contractIds: DEFAULT_CONTRACTS.map(c => c.id), collapsed: false }];
}

function saveContractCats(_cats: ContractCategory[]) {
  // Persisted through the Supabase-backed Nexus Nomad state document.
}

interface NexusNomadState {
  id: string;
  version: number;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  officeName: string;
  reputation: number;
  entityReps: ReputationEntity[];
  govConfig: CityGovConfig;
  employees: Employee[];
  employeeCats: EmployeeCategory[];
  presets: EmployeePreset[];
  loadouts: EquipLoadout[];
  facilities: Facility[];
  facilityCats: FacilityCategory[];
  contracts: Contract[];
  contractCats: ContractCategory[];
  officeInfo: OfficeInfoData;
  invTabs: InvSubTab[];
  businessMap: OfficeBusinessMapState;
  facilityAdditions: FacilityAddition[];
  companyFunds: number;
  personalFunds: PersonalFund[];
}

const NEXUS_NOMAD_STATE_ID = "default";
const NEXUS_NOMAD_STATE_VERSION = 6;

function loadLocalOfficeReputation(): number {
  return 25;
}

const REMOTE_NEXUS_SENTINEL_VERSION = -1;

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildDefaultNexusNomadState(): NexusNomadState {
  const facilityDefaults = normalizeFacilityOfficeState({
    facilities: [...clonePlain(DEFAULT_FACILITIES), createMysticLandsParkFacility()],
    facilityCats: [{ id: "fcat-default", name: "General", facilityIds: DEFAULT_FACILITIES.map(f => f.id), collapsed: false }],
    facilityAdditions: ensureMysticLandsAdditions([]),
    personalFunds: [],
    companyFunds: 50000,
  });
  return {
    id: NEXUS_NOMAD_STATE_ID,
    version: NEXUS_NOMAD_STATE_VERSION,
    revision: 0,
    updatedAt: "",
    updatedBy: "",
    officeName: DEFAULT_OFFICE_NAME,
    reputation: 25,
    entityReps: [],
    govConfig: {
      ...DEFAULT_GOV_CONFIG,
      tiers: defaultGovTiers(),
    },
    employees: clonePlain(DEFAULT_EMPLOYEES),
    employeeCats: [{ id: "cat-default", name: "General", employeeIds: DEFAULT_EMPLOYEES.map(e => e.id), collapsed: false }],
    presets: [],
    loadouts: [],
    facilities: facilityDefaults.facilities as Facility[],
    facilityCats: facilityDefaults.facilityCats,
    contracts: clonePlain(DEFAULT_CONTRACTS),
    contractCats: [{ id: "ccat-default", name: "General", contractIds: DEFAULT_CONTRACTS.map(c => c.id), collapsed: false }],
    officeInfo: clonePlain(DEFAULT_OFFICE_INFO),
    invTabs: clonePlain(DEFAULT_INVENTORY),
    businessMap: createDefaultOfficeBusinessMap(),
    facilityAdditions: facilityDefaults.facilityAdditions,
    companyFunds: facilityDefaults.companyFunds,
    personalFunds: facilityDefaults.personalFunds,
  };
}

function buildLegacyNexusNomadState(): NexusNomadState {
  return buildDefaultNexusNomadState();
}

function buildRemoteSentinelNexusNomadState(): NexusNomadState {
  return {
    ...buildDefaultNexusNomadState(),
    version: REMOTE_NEXUS_SENTINEL_VERSION,
  };
}

function normalizeNexusNomadState(raw: Partial<NexusNomadState> | null | undefined): NexusNomadState {
  const fallback = buildDefaultNexusNomadState();
  if (!raw || typeof raw !== "object") return fallback;
  const facilityState = normalizeFacilityOfficeState(raw);
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : fallback.id,
    version: NEXUS_NOMAD_STATE_VERSION,
    revision: Math.max(0, Math.floor(Number(raw.revision) || 0)),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : "",
    officeName: typeof raw.officeName === "string" && raw.officeName.trim()
      ? raw.officeName.trim() === LEGACY_DEFAULT_OFFICE_NAME ? DEFAULT_OFFICE_NAME : raw.officeName
      : fallback.officeName,
    reputation: typeof raw.reputation === "number" ? Math.max(-100, Math.min(100, raw.reputation)) : fallback.reputation,
    entityReps: Array.isArray(raw.entityReps) ? raw.entityReps : fallback.entityReps,
    govConfig: raw.govConfig && typeof raw.govConfig === "object" ? raw.govConfig as CityGovConfig : fallback.govConfig,
    employees: Array.isArray(raw.employees) ? raw.employees : fallback.employees,
    employeeCats: Array.isArray(raw.employeeCats) ? raw.employeeCats : fallback.employeeCats,
    presets: Array.isArray(raw.presets) ? raw.presets : fallback.presets,
    loadouts: Array.isArray(raw.loadouts) ? raw.loadouts : fallback.loadouts,
    facilities: facilityState.facilities as Facility[],
    facilityCats: facilityState.facilityCats,
    contracts: Array.isArray(raw.contracts) ? raw.contracts : fallback.contracts,
    contractCats: Array.isArray(raw.contractCats) ? raw.contractCats : fallback.contractCats,
    officeInfo: raw.officeInfo && typeof raw.officeInfo === "object" ? raw.officeInfo as OfficeInfoData : fallback.officeInfo,
    invTabs: Array.isArray(raw.invTabs) ? raw.invTabs : fallback.invTabs,
    businessMap: normalizeOfficeBusinessMap(raw.businessMap),
    facilityAdditions: facilityState.facilityAdditions,
    companyFunds: facilityState.companyFunds,
    personalFunds: facilityState.personalFunds,
  };
}

function mergeRemoteMapInstallations(local: OfficeBusinessMapState, remote: OfficeBusinessMapState) {
  const remoteSectors = new Map(remote.sectors.map((sector) => [sector.id, sector]));
  const remoteExpansions = new Map(remote.expansions.map((expansion) => [expansion.id, expansion]));
  return {
    ...local,
    expansions: local.expansions.map((expansion) => {
      const remoteExpansion = remoteExpansions.get(expansion.id);
      return remoteExpansion ? { ...expansion, status: remoteExpansion.status, fundedBy: remoteExpansion.fundedBy, fundedAt: remoteExpansion.fundedAt, completedBy: remoteExpansion.completedBy, completedAt: remoteExpansion.completedAt } : expansion;
    }),
    sectors: local.sectors.map((sector) => {
      const remoteSector = remoteSectors.get(sector.id);
      if (!remoteSector) return sector;
      const remoteSlots = new Map(remoteSector.slots.map((slot) => [slot.id, slot]));
      return {
        ...sector,
        slots: sector.slots.map((slot) => {
          const remoteSlot = remoteSlots.get(slot.id);
          if (!remoteSlot) return slot;
          return {
            ...slot,
            filled: remoteSlot.filled,
            occupant: remoteSlot.occupant,
            linkedFacilityId: remoteSlot.linkedFacilityId,
            installedAdditionId: remoteSlot.installedAdditionId,
            installedBy: remoteSlot.installedBy,
            installedAt: remoteSlot.installedAt,
          };
        }),
      };
    }),
  };
}

function mergeRemoteInstallationChanges(local: NexusNomadState, remote: NexusNomadState): NexusNomadState {
  const remoteFacilities = new Map(remote.facilities.map((facility) => [facility.id, facility]));
  return {
    ...local,
    revision: remote.revision,
    updatedAt: remote.updatedAt,
    updatedBy: remote.updatedBy,
    personalFunds: remote.personalFunds,
    businessMap: mergeRemoteMapInstallations(local.businessMap, remote.businessMap),
    facilities: local.facilities.map((facility) => {
      const remoteFacility = remoteFacilities.get(facility.id);
      if (!remoteFacility) return facility;
      return {
        ...facility,
        baseStats: remoteFacility.baseStats,
        staffCostPerPerson: remoteFacility.staffCostPerPerson,
        currentMonth: remoteFacility.currentMonth,
        monthlyReports: remoteFacility.monthlyReports,
        revenue: remoteFacility.revenue,
        expenses: remoteFacility.expenses,
        employeesOnSite: remoteFacility.employeesOnSite,
        businessMap: facility.businessMap && remoteFacility.businessMap
          ? mergeRemoteMapInstallations(facility.businessMap, remoteFacility.businessMap)
          : facility.businessMap,
      };
    }),
  };
}

const DRAG_TYPE = "REP_ENTITY";
const DRAG_EMPLOYEE = "EMPLOYEE";
const DRAG_CONTRACT = "CONTRACT";




function DraggableEntityRow({
  entity, index, isDM, accent, moveEntity, children,
}: {
  entity: ReputationEntity;
  index: number;
  isDM: boolean;
  accent: string;
  moveEntity: (from: number, to: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: DRAG_TYPE,
    item: { index },
    canDrag: isDM,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: DRAG_TYPE,
    hover: (item: { index: number }, monitor) => {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      const rect = ref.current.getBoundingClientRect();
      const midY = (rect.bottom - rect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverY = clientOffset.y - rect.top;
      if (dragIndex < hoverIndex && hoverY < midY) return;
      if (dragIndex > hoverIndex && hoverY > midY) return;
      moveEntity(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  });

  dragPreview(drop(ref));

  return (
    <div
      ref={ref}
      style={nsDragFade(isDragging, 0.4)}
    >
      <div className="flex gap-1 items-start">
        {isDM && (
          <div
            ref={drag as unknown as React.Ref<HTMLDivElement>}
            className="flex-shrink-0 pt-4 cursor-grab active:cursor-grabbing px-0.5"
            style={NS_DARK}
            title="Drag to reorder"
          >
            <GripVertical size={12} />
          </div>
        )}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function DraggableEmployee({
  employee, categoryId, isDM, accent, innerPanelStyle, onRemove, onEdit, onSelect,
}: {
  employee: Employee;
  categoryId: string;
  isDM: boolean;
  accent: string;
  innerPanelStyle: React.CSSProperties;
  onRemove: (id: string) => void;
  onEdit: (id: string, updates: Partial<Employee>) => void;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(employee.name);
  const [editRole, setEditRole] = useState(employee.role);

  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: DRAG_EMPLOYEE,
    item: { employeeId: employee.id, fromCategoryId: categoryId },
    canDrag: isDM,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  dragPreview(ref);

  const saveEdit = () => {
    const n = editName.trim();
    const r = editRole.trim();
    if (n) onEdit(employee.id, { name: n, role: r || employee.role });
    setEditing(false);
  };

  return (
    <div ref={ref} style={nsDragFade(isDragging)}>
      <div className="flex items-center gap-1">
        {isDM && (
          <div
            ref={drag as unknown as React.Ref<HTMLDivElement>}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing px-0.5"
            style={NS_DARK}
            title="Drag to move"
          >
            <GripVertical size={12} />
          </div>
        )}
        <div className="flex-1 min-w-0" style={innerPanelStyle}>
          {editing && isDM ? (
            <div className="p-3 space-y-2">
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
                autoFocus
                className="w-full text-[12px] bg-transparent outline-none px-2 py-1 rounded"
                style={NS_INPUT_STYLE}
                maxLength={50}
                placeholder="Name..."
              />
              <input
                value={editRole}
                onChange={e => setEditRole(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
                className="w-full text-[11px] bg-transparent outline-none px-2 py-1 rounded"
                style={NS_ROLE_INPUT}
                maxLength={50}
                placeholder="Role..."
              />
              <div className="flex items-center gap-1.5">
                <button onClick={saveEdit} className="p-1 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                  <Check size={10} />
                </button>
                <button onClick={() => setEditing(false)} className="p-1 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                  <X size={10} />
                </button>
              </div>
            </div>
          ) : (
            <div
              className="p-3.5 flex items-center justify-between hover:border-[#1A1A30] transition-colors cursor-pointer"
              onClick={() => onSelect(employee.id)}
            >
              <div className="flex items-center gap-3">
                {employee.photo ? (
                  <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0" style={nsAccentBorder(accent)}>
                    <img src={employee.photo} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={nsAccentBg(accent)}>
                    <Users size={13} style={nsAccentHalf(accent)} />
                  </div>
                )}
                <div>
                  <div className="text-[13px] font-semibold" style={NS_TEXT}>{employee.name}</div>
                  <div className="text-[10px]" style={NS_MID}>{employee.role}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {isDM && (
                  <div style={NS_DISPLAY_CONTENTS}>
                    <button onClick={(e) => { e.stopPropagation(); setEditName(employee.name); setEditRole(employee.role); setEditing(true); }} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_EDIT} title="Edit name/role">
                      <Pencil size={8} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onRemove(employee.id); }} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_DELETE} title="Remove">
                      <Trash2 size={8} />
                    </button>
                  </div>
                )}
                <ChevronRight size={12} style={NS_DARK} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmployeeCategoryDrop({
  category, employees, isDM, accent, innerPanelStyle, panelStyle,
  onToggle, onRename, onRemoveCategory, onDropEmployee, onRemoveEmployee, onEditEmployee, onAddEmployee, onSelectEmployee,
}: {
  category: EmployeeCategory;
  employees: Employee[];
  isDM: boolean;
  accent: string;
  innerPanelStyle: React.CSSProperties;
  panelStyle: React.CSSProperties;
  onToggle: () => void;
  onRename: (name: string) => void;
  onRemoveCategory: () => void;
  onDropEmployee: (employeeId: string, fromCategoryId: string) => void;
  onRemoveEmployee: (id: string) => void;
  onEditEmployee: (id: string, updates: Partial<Employee>) => void;
  onAddEmployee: (catId: string) => void;
  onSelectEmployee: (id: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(category.name);

  const [{ isOver }, drop] = useDrop({
    accept: DRAG_EMPLOYEE,
    drop: (item: { employeeId: string; fromCategoryId: string }) => {
      if (item.fromCategoryId !== category.id) {
        onDropEmployee(item.employeeId, item.fromCategoryId);
      }
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  });

  const catEmployees = category.employeeIds
    .map(id => employees.find(e => e.id === id))
    .filter(Boolean) as Employee[];

  const saveName = () => {
    const trimmed = nameVal.trim();
    if (trimmed) onRename(trimmed);
    setEditingName(false);
  };

  return (
    <div
      ref={drop as unknown as React.Ref<HTMLDivElement>}
      style={nsDropTarget(panelStyle, isOver, accent)}
    >
      {/* Category header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={onToggle}
        style={nsCatBorder(category.collapsed)}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <ChevronDown
            size={13}
            style={nsChevronCollapse(accent, category.collapsed)}
          />
          {editingName && isDM ? (
            <input
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
              autoFocus
              className="text-[12px] bg-transparent outline-none px-1.5 py-0.5 rounded flex-1"
              style={NS_INPUT_STYLE}
              maxLength={40}
            />
          ) : (
            <span className="text-[12px] font-semibold truncate" style={NS_SOFT}>{category.name}</span>
          )}
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0" style={NS_BADGE}>
            {catEmployees.length}
          </span>
        </div>
        {isDM && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {editingName ? (
              <div style={NS_DISPLAY_CONTENTS}>
                <button onClick={saveName} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                  <Check size={9} />
                </button>
                <button onClick={() => setEditingName(false)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                  <X size={9} />
                </button>
              </div>
            ) : (
              <div style={NS_DISPLAY_CONTENTS}>
                <button onClick={() => onAddEmployee(category.id)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={nsAccentBtn(accent)} title="Add employee">
                  <Plus size={9} />
                </button>
                <button onClick={() => { setNameVal(category.name); setEditingName(true); }} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_EDIT} title="Rename">
                  <Pencil size={8} />
                </button>
                <button onClick={onRemoveCategory} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_DELETE} title="Delete category">
                  <Trash2 size={8} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Category content */}
      {!category.collapsed && (
        <div className="p-3 space-y-1.5">
          {catEmployees.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-[10px]" style={NS_DARK}>
                {isDM ? "Drag employees here or click + to add" : "No employees in this category"}
              </p>
            </div>
          ) : (
            catEmployees.map(emp => (
              <DraggableEmployee
                key={emp.id}
                employee={emp}
                categoryId={category.id}
                isDM={isDM}
                accent={accent}
                innerPanelStyle={innerPanelStyle}
                onRemove={onRemoveEmployee}
                onEdit={onEditEmployee}
                onSelect={onSelectEmployee}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FacilityCategoryPanel({
  category, facilities, isDM, accent, innerPanelStyle, panelStyle,
  onToggle, onRename, onRemoveCategory, onRemoveFacility, onAddFacility, onSelectFacility,
  onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  category: FacilityCategory;
  facilities: Facility[];
  isDM: boolean;
  accent: string;
  innerPanelStyle: React.CSSProperties;
  panelStyle: React.CSSProperties;
  onToggle: () => void;
  onRename: (name: string) => void;
  onRemoveCategory: () => void;
  onRemoveFacility: (id: string) => void;
  onAddFacility: (catId: string) => void;
  onSelectFacility: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(category.name);

  const saveName = () => {
    const trimmed = nameVal.trim();
    if (trimmed) onRename(trimmed);
    setEditingName(false);
  };

  return (
    <div style={panelStyle}>
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={onToggle}
        style={nsCatBorder(category.collapsed)}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <ChevronDown
            size={13}
            style={nsChevronCollapse(accent, category.collapsed)}
          />
          {editingName && isDM ? (
            <input
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
              autoFocus
              className="text-[12px] bg-transparent outline-none px-1.5 py-0.5 rounded flex-1"
              style={NS_INPUT_STYLE}
              maxLength={40}
            />
          ) : (
            <span className="text-[12px] font-semibold truncate" style={NS_SOFT}>{category.name}</span>
          )}
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0" style={NS_BADGE}>
            {facilities.length}
          </span>
        </div>
        {isDM && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {editingName ? (
              <div style={NS_DISPLAY_CONTENTS}>
                <button onClick={saveName} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                  <Check size={9} />
                </button>
                <button onClick={() => setEditingName(false)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                  <X size={9} />
                </button>
              </div>
            ) : (
              <div style={NS_DISPLAY_CONTENTS}>
                <button
                  onClick={onMoveUp}
                  disabled={!canMoveUp}
                  className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-25 disabled:cursor-not-allowed"
                  style={NS_BTN_EDIT}
                  title="Move category up"
                >
                  <ArrowUp size={8} />
                </button>
                <button
                  onClick={onMoveDown}
                  disabled={!canMoveDown}
                  className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-25 disabled:cursor-not-allowed"
                  style={NS_BTN_EDIT}
                  title="Move category down"
                >
                  <ArrowDown size={8} />
                </button>
                <button onClick={() => onAddFacility(category.id)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={nsAccentBtn(accent)} title="Add facility">
                  <Plus size={9} />
                </button>
                <button onClick={() => { setNameVal(category.name); setEditingName(true); }} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_EDIT} title="Rename">
                  <Pencil size={8} />
                </button>
                <button onClick={onRemoveCategory} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_DELETE} title="Delete category">
                  <Trash2 size={8} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!category.collapsed && (
        <div className="p-3 space-y-1.5">
          {facilities.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-[10px]" style={NS_DARK}>
                {isDM ? "Click + to add a facility" : "No facilities in this category"}
              </p>
            </div>
          ) : (
            facilities.map(fac => {
              const meta = FACILITY_TYPE_META[fac.type] || FACILITY_TYPE_META.Facility;
              return (
                <div
                  key={fac.id}
                  className="flex items-center gap-2 group"
                  style={innerPanelStyle}
                >
                  <button
                    onClick={() => onSelectFacility(fac.id)}
                    className="flex-1 min-w-0 flex items-center gap-2.5 p-3 text-left hover:bg-[#0A0A14] transition-colors rounded"
                  >
                    <meta.icon size={12} style={nsIconTint(meta.color)} className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate" style={NS_TEXT}>{fac.name}</div>
                      {fac.location && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin size={8} style={NS_SUBDIM} />
                          <span className="text-[9px] truncate" style={NS_DIM}>{fac.location}</span>
                        </div>
                      )}
                    </div>
                    {fac.businessMap && (
                      <span title="Facility map attached" aria-label="Facility map attached" className="flex flex-shrink-0 items-center">
                        <Waypoints size={10} style={nsAccentHalf(accent)} />
                      </span>
                    )}
                    <span className="text-[8px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={nsPriBadge(fac.statusColor || "#4ACA6A")}>
                      {fac.status || "Active"}
                    </span>
                    <ChevronRight size={10} style={NS_DARK} className="flex-shrink-0" />
                  </button>
                  {isDM && (
                    <button
                      onClick={() => onRemoveFacility(fac.id)}
                      className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity opacity-0 group-hover:opacity-100 mr-2 flex-shrink-0"
                      style={NS_RED_DARK}
                      title="Delete facility"
                    >
                      <Trash2 size={9} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function DraggableContract({
  contract, categoryId, isDM, innerPanelStyle, onRemove, onSelect, onTogglePin,
}: {
  contract: Contract;
  categoryId: string;
  isDM: boolean;
  innerPanelStyle: React.CSSProperties;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const priColor = PRIORITY_META[contract.priority || "MEDIUM"]?.color || "#CAAA3A";

  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: DRAG_CONTRACT,
    item: { contractId: contract.id, fromCategoryId: categoryId },
    canDrag: isDM,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  dragPreview(ref);

  return (
    <div ref={ref} style={nsDragFade(isDragging)}>
      <div className="flex items-center gap-1 group" style={innerPanelStyle}>
        {isDM && (
          <div
            ref={drag as unknown as React.Ref<HTMLDivElement>}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing px-0.5 ml-1"
            style={NS_DARK}
            title="Drag to move"
          >
            <GripVertical size={12} />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(contract.id); }}
          className="w-6 h-full flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity"
          title={contract.pinned ? "Unpin contract" : "Pin contract"}
        >
          <Pin size={10} style={nsTextColor(contract.pinned ? "#CAAA3A" : "#2A2A4A")} />
        </button>
        <button
          onClick={() => onSelect(contract.id)}
          className="flex-1 min-w-0 flex items-center gap-2.5 p-3 pl-0 text-left hover:bg-[#0A0A14] transition-colors rounded"
        >
          <FileText size={12} style={nsIconTint(priColor)} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium truncate" style={NS_TEXT}>{contract.name}</div>
            {contract.due && (
              <div className="flex items-center gap-1 mt-0.5">
                <Clock size={8} style={NS_SUBDIM} />
                <span className="text-[9px] truncate" style={NS_DIM}>{contract.due}</span>
              </div>
            )}
          </div>
          {contract.priority && (
            <span className="text-[8px] px-1.5 py-0.5 rounded font-semibold tracking-wider flex-shrink-0" style={nsPriBadge(priColor)}>
              {contract.priority}
            </span>
          )}
          <span className="text-[8px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={nsPriBadge(contract.statusColor || "#4ACA6A")}>
            {contract.status || "Active"}
          </span>
          <ChevronRight size={10} style={NS_DARK} className="flex-shrink-0" />
        </button>
        {isDM && (
          <button
            onClick={() => onRemove(contract.id)}
            className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity opacity-0 group-hover:opacity-100 mr-2 flex-shrink-0"
            style={NS_RED_DARK}
            title="Delete contract"
          >
            <Trash2 size={9} />
          </button>
        )}
      </div>
    </div>
  );
}

function ContractCategoryPanel({
  category, contracts, isDM, accent, innerPanelStyle, panelStyle,
  onToggle, onRename, onRemoveCategory, onRemoveContract, onAddContract, onSelectContract, onTogglePin, onDropContract,
}: {
  category: ContractCategory;
  contracts: Contract[];
  isDM: boolean;
  accent: string;
  innerPanelStyle: React.CSSProperties;
  panelStyle: React.CSSProperties;
  onToggle: () => void;
  onRename: (name: string) => void;
  onRemoveCategory: () => void;
  onRemoveContract: (id: string) => void;
  onAddContract: (catId: string) => void;
  onSelectContract: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDropContract: (contractId: string, fromCategoryId: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(category.name);

  const [{ isOver }, drop] = useDrop({
    accept: DRAG_CONTRACT,
    drop: (item: { contractId: string; fromCategoryId: string }) => {
      if (item.fromCategoryId !== category.id) {
        onDropContract(item.contractId, item.fromCategoryId);
      }
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  });

  const saveName = () => {
    const trimmed = nameVal.trim();
    if (trimmed) onRename(trimmed);
    setEditingName(false);
  };

  return (
    <div
      ref={drop as unknown as React.Ref<HTMLDivElement>}
      style={nsDropTarget(panelStyle, isOver, accent)}
    >
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={onToggle}
        style={nsCatBorder(category.collapsed)}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <ChevronDown
            size={13}
            style={nsChevronCollapse(accent, category.collapsed)}
          />
          {editingName && isDM ? (
            <input
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
              autoFocus
              className="text-[12px] bg-transparent outline-none px-1.5 py-0.5 rounded flex-1"
              style={NS_INPUT_STYLE}
              maxLength={40}
            />
          ) : (
            <span className="text-[12px] font-semibold truncate" style={NS_SOFT}>{category.name}</span>
          )}
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0" style={NS_BADGE}>
            {contracts.length}
          </span>
        </div>
        {isDM && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {editingName ? (
              <div style={NS_DISPLAY_CONTENTS}>
                <button onClick={saveName} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                  <Check size={9} />
                </button>
                <button onClick={() => setEditingName(false)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                  <X size={9} />
                </button>
              </div>
            ) : (
              <div style={NS_DISPLAY_CONTENTS}>
                <button onClick={() => onAddContract(category.id)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={nsAccentBtn(accent)} title="Add contract">
                  <Plus size={9} />
                </button>
                <button onClick={() => { setNameVal(category.name); setEditingName(true); }} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_EDIT} title="Rename">
                  <Pencil size={8} />
                </button>
                <button onClick={onRemoveCategory} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_DELETE} title="Delete category">
                  <Trash2 size={8} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!category.collapsed && (
        <div className="p-3 space-y-1.5">
          {contracts.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-[10px]" style={NS_DARK}>
                {isDM ? "Drag contracts here or click + to add" : "No contracts in this category"}
              </p>
            </div>
          ) : (
            contracts.map(con => (
              <DraggableContract
                key={con.id}
                contract={con}
                categoryId={category.id}
                isDM={isDM}
                innerPanelStyle={innerPanelStyle}
                onRemove={onRemoveContract}
                onSelect={onSelectContract}
                onTogglePin={onTogglePin}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function NexusNomad() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"overview" | "map" | "inventory" | "facilities" | "employees" | "contracts" | "info">("overview");

  const currentUserId = safeGetItem("inet-user-id") || "";
  const isDM = currentUserId === "dm";

  const theme = getPlayerTheme();
  const accent = firstColor(theme.accentColor);
  const pageBg = theme.pageBg || "linear-gradient(180deg, #050510 0%, #020208 100%)";


  const initialStateRef = useRef<NexusNomadState>(buildDefaultNexusNomadState());

  const [officeName, setOfficeName] = useState(initialStateRef.current.officeName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [reputation, setReputation] = useState(initialStateRef.current.reputation);
  const [showRepPanel, setShowRepPanel] = useState(false);
  const [entityReps, setEntityReps] = useState<ReputationEntity[]>(initialStateRef.current.entityReps);
  const [addingEntity, setAddingEntity] = useState(false);
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityIcon, setNewEntityIcon] = useState("shield");
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [govConfig, setGovConfig] = useState<CityGovConfig>(initialStateRef.current.govConfig);
  const [editingGov, setEditingGov] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>(initialStateRef.current.employees);
  const [employeeCats, setEmployeeCats] = useState<EmployeeCategory[]>(initialStateRef.current.employeeCats);
  const [addingEmployeeCatId, setAddingEmployeeCatId] = useState<string | null>(null);
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpRole, setNewEmpRole] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [presets, setPresets] = useState<EmployeePreset[]>(initialStateRef.current.presets);
  const [presetNameDraft, setPresetNameDraft] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [showLoadPreset, setShowLoadPreset] = useState(false);
  const [loadouts, setLoadouts] = useState<EquipLoadout[]>(initialStateRef.current.loadouts);
  const [loadoutNameDraft, setLoadoutNameDraft] = useState("");
  const [showSaveLoadout, setShowSaveLoadout] = useState(false);
  const [showLoadLoadout, setShowLoadLoadout] = useState(false);
  const [newProficiency, setNewProficiency] = useState("");
  const [newEquipment, setNewEquipment] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [photoDragging, setPhotoDragging] = useState(false);
  const [photoDragStart, setPhotoDragStart] = useState<{ x: number; y: number; offX: number; offY: number } | null>(null);

  const [facilities, setFacilities] = useState<Facility[]>(initialStateRef.current.facilities);
  const [facilityCats, setFacilityCats] = useState<FacilityCategory[]>(initialStateRef.current.facilityCats);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [addingFacilityCat, setAddingFacilityCat] = useState(false);
  const [newFacCatName, setNewFacCatName] = useState("");
  const [addingFacilityCatId, setAddingFacilityCatId] = useState<string | null>(null);
  const [newFacName, setNewFacName] = useState("");
  const [newFacType, setNewFacType] = useState<FacilityType>("Facility");

  const [contracts, setContracts] = useState<Contract[]>(initialStateRef.current.contracts);
  const [contractCats, setContractCats] = useState<ContractCategory[]>(initialStateRef.current.contractCats);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [addingContractCat, setAddingContractCat] = useState(false);
  const [newConCatName, setNewConCatName] = useState("");
  const [addingContractCatId, setAddingContractCatId] = useState<string | null>(null);
  const [newConName, setNewConName] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [showFinancePanel, setShowFinancePanel] = useState(false);
  const [officeInfo, setOfficeInfo] = useState<OfficeInfoData>(initialStateRef.current.officeInfo);
  const [businessMap, setBusinessMap] = useState<OfficeBusinessMapState>(initialStateRef.current.businessMap);
  const [facilityAdditions, setFacilityAdditions] = useState<FacilityAddition[]>(initialStateRef.current.facilityAdditions);
  const [companyFunds, setCompanyFunds] = useState(initialStateRef.current.companyFunds);
  const [personalFunds, setPersonalFunds] = useState<PersonalFund[]>(initialStateRef.current.personalFunds);
  const [officeRevision, setOfficeRevision] = useState(initialStateRef.current.revision);
  const [officeUpdatedAt, setOfficeUpdatedAt] = useState(initialStateRef.current.updatedAt);
  const [officeUpdatedBy, setOfficeUpdatedBy] = useState(initialStateRef.current.updatedBy);
  const [businessMapPlayers, setBusinessMapPlayers] = useState<BusinessMapPlayerOption[]>([]);
  const [creditAccounts, setCreditAccounts] = useState<CreditAccount[]>([]);
  const [creditAccountsError, setCreditAccountsError] = useState("");
  const creditAccountsLoadingRef = useRef(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [addingService, setAddingService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceIcon, setNewServiceIcon] = useState("shield");
  const [addingContact, setAddingContact] = useState(false);
  const [newContactLabel, setNewContactLabel] = useState("");
  const [newContactValue, setNewContactValue] = useState("");
  const [pickingServiceIcon, setPickingServiceIcon] = useState<string | null>(null);
  const [editingDossier, setEditingDossier] = useState(false);
  const [dossierDraft, setDossierDraft] = useState("");

  const [invTabs, setInvTabs] = useState<InvSubTab[]>(initialStateRef.current.invTabs);
  const [activeInvTab, setActiveInvTab] = useState<string | null>(null);
  const [addingInvTab, setAddingInvTab] = useState(false);
  const [newInvTabName, setNewInvTabName] = useState("");
  const [newInvTabIcon, setNewInvTabIcon] = useState("package");
  const [addingInvItem, setAddingInvItem] = useState(false);
  const [editingInvItemId, setEditingInvItemId] = useState<string | null>(null);
  const [invItemDraft, setInvItemDraft] = useState<Partial<InvItem>>({});
  const [renamingInvTabId, setRenamingInvTabId] = useState<string | null>(null);
  const [renameInvTabDraft, setRenameInvTabDraft] = useState("");
  const [addingInvGroup, setAddingInvGroup] = useState(false);
  const [newInvGroupName, setNewInvGroupName] = useState("");
  const [editingInvGroupId, setEditingInvGroupId] = useState<string | null>(null);
  const [equipPickerEmpId, setEquipPickerEmpId] = useState<string | null>(null);
  const [draftEffects, setDraftEffects] = useState<InvItemEffect[]>([]);
  const [isStateHydrated, setIsStateHydrated] = useState(false);
  const [stateSaveError, setStateSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<{ type: "saving" | "saved" | "error"; message: string } | null>(null);
  const lastSavedStateJsonRef = useRef<string | null>(null);
  const latestPersistentStateJsonRef = useRef<string>("");
  const officeStateSignalRef = useRef<ReturnType<typeof subscribeToOfficeStateSignals> | null>(null);
  const saveNoticeTimeoutRef = useRef<number | null>(null);

  const showSaveNotice = useCallback((
    type: "saving" | "saved" | "error",
    message: string,
    autoHideMs?: number,
  ) => {
    if (typeof window !== "undefined" && saveNoticeTimeoutRef.current) {
      window.clearTimeout(saveNoticeTimeoutRef.current);
      saveNoticeTimeoutRef.current = null;
    }

    setSaveNotice({ type, message });

    if (typeof window !== "undefined" && autoHideMs && autoHideMs > 0) {
      saveNoticeTimeoutRef.current = window.setTimeout(() => {
        setSaveNotice((current) => (current?.type === type && current.message === message ? null : current));
        saveNoticeTimeoutRef.current = null;
      }, autoHideMs);
    }
  }, []);

  const refreshCreditAccounts = useCallback(async () => {
    if (creditAccountsLoadingRef.current) return;
    creditAccountsLoadingRef.current = true;
    try {
      if (isDM) setCreditAccounts(await loadCreditAccounts());
      else if (currentUserId) {
        const detail = await loadCreditAccount();
        setCreditAccounts([detail.account]);
      }
      setCreditAccountsError("");
    } catch (error) {
      setCreditAccountsError(error instanceof Error ? error.message : "Credits accounts could not be loaded.");
      if (!isCreditsServiceUnavailable(error)) console.warn("Credits accounts could not be loaded", error);
    } finally {
      creditAccountsLoadingRef.current = false;
    }
  }, [currentUserId, isDM]);

  useEffect(() => {
    void refreshCreditAccounts();
    const onFocus = () => void refreshCreditAccounts();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshCreditAccounts]);

  const applyLoadedState = useCallback((state: NexusNomadState) => {
    officeNameCache = state.officeName || DEFAULT_OFFICE_NAME;
    setOfficeRevision(state.revision);
    setOfficeUpdatedAt(state.updatedAt);
    setOfficeUpdatedBy(state.updatedBy);
    setOfficeName(state.officeName);
    setReputation(Math.max(-100, Math.min(100, state.reputation)));
    setEntityReps(state.entityReps);
    setGovConfig(state.govConfig);
    setEmployees(state.employees);
    setEmployeeCats(state.employeeCats);
    setPresets(state.presets);
    setLoadouts(state.loadouts);
    setFacilities(state.facilities);
    setFacilityCats(state.facilityCats);
    setContracts(state.contracts);
    setContractCats(state.contractCats);
    setOfficeInfo(state.officeInfo);
    setBusinessMap(state.businessMap);
    setFacilityAdditions(state.facilityAdditions);
    setCompanyFunds(state.companyFunds);
    setPersonalFunds(state.personalFunds);
    setInvTabs(state.invTabs);
    setActiveInvTab((prev) => {
      if (prev && state.invTabs.some((tab) => tab.id === prev)) return prev;
      return state.invTabs[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const sentinel = buildRemoteSentinelNexusNomadState();
        const remoteOrSentinel = await appStore.loadNexusNomadState(NEXUS_NOMAD_STATE_ID, sentinel);
        const hasRemoteState = !!remoteOrSentinel && typeof remoteOrSentinel === "object" && remoteOrSentinel.version !== REMOTE_NEXUS_SENTINEL_VERSION;

        if (hasRemoteState) {
          const loaded = normalizeNexusNomadState(remoteOrSentinel);
          if (cancelled) return;
          applyLoadedState(loaded);
          lastSavedStateJsonRef.current = JSON.stringify(remoteOrSentinel);
          setStateSaveError(null);
          return;
        }

        const legacy = normalizeNexusNomadState(buildLegacyNexusNomadState());
        if (cancelled) return;
        applyLoadedState(legacy);

        if (isDM) {
          try {
            const saved = normalizeNexusNomadState(await saveOfficeState(legacy, 0));
            if (cancelled) return;
            applyLoadedState(saved);
            lastSavedStateJsonRef.current = JSON.stringify(saved);
            setStateSaveError(null);
          } catch (saveError) {
            lastSavedStateJsonRef.current = null;
            const message = saveError instanceof Error ? saveError.message : "Failed to import office state.";
            setStateSaveError(message);
            showSaveNotice("error", message, 4500);
          }
        } else {
          lastSavedStateJsonRef.current = JSON.stringify(legacy);
        }
      } catch (error) {
        if (cancelled) return;
        const legacy = normalizeNexusNomadState(buildLegacyNexusNomadState());
        applyLoadedState(legacy);
        lastSavedStateJsonRef.current = null;
        const message = error instanceof Error ? error.message : "Failed to load office state.";
        setStateSaveError(message);
        showSaveNotice("error", message, 4500);
      } finally {
        if (!cancelled) setIsStateHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyLoadedState, isDM, showSaveNotice]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && saveNoticeTimeoutRef.current) {
        window.clearTimeout(saveNoticeTimeoutRef.current);
        saveNoticeTimeoutRef.current = null;
      }
    };
  }, []);

  const persistentState = useMemo<NexusNomadState>(() => {
    officeNameCache = officeName || DEFAULT_OFFICE_NAME;
    return {
      id: NEXUS_NOMAD_STATE_ID,
      version: NEXUS_NOMAD_STATE_VERSION,
      revision: officeRevision,
      updatedAt: officeUpdatedAt,
      updatedBy: officeUpdatedBy,
      officeName,
      reputation: Math.max(-100, Math.min(100, reputation)),
      entityReps,
      govConfig,
      employees,
      employeeCats,
      presets,
      loadouts,
      facilities,
      facilityCats,
      contracts,
      contractCats,
      officeInfo,
      invTabs,
      businessMap,
      facilityAdditions,
      companyFunds,
      personalFunds,
    };
  }, [
    officeName, reputation, entityReps, govConfig, employees, employeeCats,
    presets, loadouts, facilities, facilityCats, contracts, contractCats, officeInfo, invTabs, businessMap,
    facilityAdditions, companyFunds, personalFunds, officeRevision, officeUpdatedAt, officeUpdatedBy,
  ]);

  const persistentStateJson = useMemo(() => JSON.stringify(persistentState), [persistentState]);
  latestPersistentStateJsonRef.current = persistentStateJson;
  const facilityAdditionUsage = useMemo(
    () => countInstalledFacilityAdditions([businessMap, ...facilities.map((facility) => facility.businessMap)]),
    [businessMap, facilities],
  );

  useEffect(() => {
    if (!isStateHydrated || !isDM) return;
    if (lastSavedStateJsonRef.current === persistentStateJson) return;

    showSaveNotice("saving", "Saving office updates...");

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = normalizeNexusNomadState(await saveOfficeState(persistentState, persistentState.revision));
          const savedJson = JSON.stringify(saved);
          lastSavedStateJsonRef.current = savedJson;
          if (latestPersistentStateJsonRef.current === persistentStateJson) {
            applyLoadedState(saved);
          } else {
            setOfficeRevision(saved.revision);
            setOfficeUpdatedAt(saved.updatedAt);
            setOfficeUpdatedBy(saved.updatedBy);
          }
          setStateSaveError(null);
          showSaveNotice("saved", "Office updated.", 1800);
          void officeStateSignalRef.current?.notify();
        } catch (error) {
          const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 0;
          const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
          if (status === 409 || code === "OFFICE_REVISION_CONFLICT") {
            try {
              const remote = normalizeNexusNomadState(await appStore.loadNexusNomadState(NEXUS_NOMAD_STATE_ID, buildDefaultNexusNomadState()));
              const remoteJson = JSON.stringify(remote);
              lastSavedStateJsonRef.current = remoteJson;
              if (remote.updatedBy && remote.updatedBy !== "dm") {
                const latestLocal = normalizeNexusNomadState(JSON.parse(latestPersistentStateJsonRef.current) as NexusNomadState);
                applyLoadedState(mergeRemoteInstallationChanges(latestLocal, remote));
                showSaveNotice("saving", "Merged a live player map update; saving your edits...");
              } else {
                applyLoadedState(remote);
                showSaveNotice("error", "Another DM session changed the office. The newest saved version was loaded.", 5000);
              }
              return;
            } catch (refreshError) {
              const message = refreshError instanceof Error ? refreshError.message : "Failed to refresh conflicted office state.";
              setStateSaveError(message);
              showSaveNotice("error", message, 4500);
              return;
            }
          }
          const message = error instanceof Error ? error.message : "Failed to save office state.";
          setStateSaveError(message);
          showSaveNotice("error", message, 4500);
        }
      })();
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [applyLoadedState, isDM, isStateHydrated, persistentState, persistentStateJson, showSaveNotice]);

  useEffect(() => {
    let cancelled = false;
    let refreshTimeout: number | null = null;

    const refreshRemote = async () => {
      if (cancelled || !isStateHydrated) return;
      if (isDM && lastSavedStateJsonRef.current !== latestPersistentStateJsonRef.current) return;
      try {
        const remote = normalizeNexusNomadState(await appStore.loadNexusNomadState(NEXUS_NOMAD_STATE_ID, buildDefaultNexusNomadState()));
        if (cancelled || remote.revision <= officeRevision) return;
        lastSavedStateJsonRef.current = JSON.stringify(remote);
        applyLoadedState(remote);
        if (remote.updatedBy && remote.updatedBy !== currentUserId) {
          showSaveNotice("saved", `Live office update received from ${remote.updatedBy}.`, 1800);
        }
      } catch {
        // The interval is a fallback for realtime. A later signal retries quietly.
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimeout != null) window.clearTimeout(refreshTimeout);
      refreshTimeout = window.setTimeout(() => void refreshRemote(), 140);
    };
    const signals = subscribeToOfficeStateSignals(scheduleRefresh);
    officeStateSignalRef.current = signals;
    const interval = window.setInterval(() => void refreshRemote(), 3000);

    return () => {
      cancelled = true;
      if (refreshTimeout != null) window.clearTimeout(refreshTimeout);
      window.clearInterval(interval);
      signals.unsubscribe();
      if (officeStateSignalRef.current === signals) officeStateSignalRef.current = null;
    };
  }, [applyLoadedState, currentUserId, isDM, isStateHydrated, officeRevision, showSaveNotice]);

  useEffect(() => {
    if (!isDM) {
      setBusinessMapPlayers(currentUserId ? [{ id: currentUserId, name: currentUserId }] : []);
      return;
    }
    let cancelled = false;
    void appStore.listPlayers<Record<string, unknown> & { id: string }>()
      .then((rows) => {
        if (cancelled) return;
        setBusinessMapPlayers(rows.map((row) => ({
          id: String(row.id || ""),
          name: String(row.name || row.displayName || row.id || "Player"),
        })).filter((player) => player.id));
      })
      .catch(() => {
        if (!cancelled) setBusinessMapPlayers(currentUserId ? [{ id: currentUserId, name: currentUserId }] : []);
      });
    return () => { cancelled = true; };
  }, [currentUserId, isDM]);

  const handleFacilityAdditionAction = useCallback(async (action: FacilityAdditionAction) => {
    const saved = normalizeNexusNomadState(await applyFacilityAdditionServerAction<NexusNomadState>(action));
    lastSavedStateJsonRef.current = JSON.stringify(saved);
    applyLoadedState(saved);
    setStateSaveError(null);
    showSaveNotice("saved", "Facility map updated.", 1400);
    void officeStateSignalRef.current?.notify();
  }, [applyLoadedState, showSaveNotice]);

  const saveRep = useCallback((v: number) => {
    setReputation(Math.max(-100, Math.min(100, v)));
  }, []);

  const updateGovConfig = useCallback((updates: Partial<CityGovConfig>) => {
    setGovConfig(prev => {
      const next = { ...prev, ...updates };
      saveGovConfig(next);
      return next;
    });
  }, []);

  const updateEntityRep = useCallback((id: string, delta: number) => {
    setEntityReps(prev => {
      const next = prev.map(e => e.id === id ? { ...e, value: Math.max(-100, Math.min(100, e.value + delta)) } : e);
      saveEntityReps(next);
      return next;
    });
  }, []);

  const updateEntity = useCallback((id: string, updates: Partial<ReputationEntity>) => {
    setEntityReps(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...updates } : e);
      saveEntityReps(next);
      return next;
    });
  }, []);

  const moveEntity = useCallback((fromIndex: number, toIndex: number) => {
    setEntityReps(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      saveEntityReps(next);
      return next;
    });
  }, []);

  const addEntity = useCallback(() => {
    const trimmed = newEntityName.trim();
    if (!trimmed) return;
    const entity: ReputationEntity = {
      id: uid(),
      name: trimmed,
      value: 0,
      icon: newEntityIcon,
      tiers: defaultEntityTiers(),
    };
    setEntityReps(prev => {
      const next = [...prev, entity];
      saveEntityReps(next);
      return next;
    });
    setNewEntityName("");
    setNewEntityIcon("shield");
    setAddingEntity(false);
  }, [newEntityName, newEntityIcon]);

  const removeEntity = useCallback((id: string) => {
    setEntityReps(prev => {
      const next = prev.filter(e => e.id !== id);
      saveEntityReps(next);
      return next;
    });
    if (editingEntityId === id) setEditingEntityId(null);
  }, [editingEntityId]);

  const toggleCatCollapse = useCallback((catId: string) => {
    setEmployeeCats(prev => {
      const next = prev.map(c => c.id === catId ? { ...c, collapsed: !c.collapsed } : c);
      saveEmployeeCats(next);
      return next;
    });
  }, []);

  const renameCat = useCallback((catId: string, name: string) => {
    setEmployeeCats(prev => {
      const next = prev.map(c => c.id === catId ? { ...c, name } : c);
      saveEmployeeCats(next);
      return next;
    });
  }, []);

  const addCategory = useCallback(() => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    const cat: EmployeeCategory = { id: uid(), name: trimmed, employeeIds: [], collapsed: false };
    setEmployeeCats(prev => {
      const next = [...prev, cat];
      saveEmployeeCats(next);
      return next;
    });
    setNewCatName("");
    setAddingCategory(false);
  }, [newCatName]);

  const removeCat = useCallback((catId: string) => {
    setEmployeeCats(prev => {
      const cat = prev.find(c => c.id === catId);
      if (!cat) return prev;
      const orphanIds = cat.employeeIds;
      let next = prev.filter(c => c.id !== catId);
      if (next.length === 0) {
        next = [{ id: uid(), name: "General", employeeIds: orphanIds, collapsed: false }];
      } else {
        next = next.map((c, i) => i === 0 ? { ...c, employeeIds: [...c.employeeIds, ...orphanIds] } : c);
      }
      saveEmployeeCats(next);
      return next;
    });
  }, []);

  const moveEmployeeToCat = useCallback((employeeId: string, fromCatId: string, toCatId: string) => {
    setEmployeeCats(prev => {
      const next = prev.map(c => {
        if (c.id === fromCatId) return { ...c, employeeIds: c.employeeIds.filter(id => id !== employeeId) };
        if (c.id === toCatId) return { ...c, employeeIds: [...c.employeeIds, employeeId] };
        return c;
      });
      saveEmployeeCats(next);
      return next;
    });
  }, []);

  const addEmployeeToCat = useCallback((catId: string) => {
    const n = newEmpName.trim();
    const r = newEmpRole.trim();
    if (!n) return;
    const emp: Employee = { id: uid(), name: n, role: r || "Employee" };
    setEmployees(prev => {
      const next = [...prev, emp];
      saveEmployees(next);
      return next;
    });
    setEmployeeCats(prev => {
      const next = prev.map(c => c.id === catId ? { ...c, employeeIds: [...c.employeeIds, emp.id] } : c);
      saveEmployeeCats(next);
      return next;
    });
    setNewEmpName("");
    setNewEmpRole("");
    setAddingEmployeeCatId(null);
  }, [newEmpName, newEmpRole]);

  const removeEmployee = useCallback((empId: string) => {
    setEmployees(prev => {
      const next = prev.filter(e => e.id !== empId);
      saveEmployees(next);
      return next;
    });
    setEmployeeCats(prev => {
      const next = prev.map(c => ({ ...c, employeeIds: c.employeeIds.filter(id => id !== empId) }));
      saveEmployeeCats(next);
      return next;
    });
  }, []);

  const editEmployee = useCallback((empId: string, updates: Partial<Employee>) => {
    setEmployees(prev => {
      const next = prev.map(e => e.id === empId ? { ...e, ...updates } : e);
      saveEmployees(next);
      return next;
    });
  }, []);

  const totalEmployees = employees.length;

  const selectedEmployee = selectedEmployeeId ? employees.find(e => e.id === selectedEmployeeId) : null;

  // ── Facility callbacks ──
  const toggleFacCatCollapse = useCallback((catId: string) => {
    setFacilityCats(prev => {
      const next = prev.map(c => c.id === catId ? { ...c, collapsed: !c.collapsed } : c);
      saveFacilityCats(next);
      return next;
    });
  }, []);

  const renameFacCat = useCallback((catId: string, name: string) => {
    setFacilityCats(prev => {
      const next = prev.map(c => c.id === catId ? { ...c, name } : c);
      saveFacilityCats(next);
      return next;
    });
  }, []);

  const moveFacCategory = useCallback((catId: string, direction: -1 | 1) => {
    setFacilityCats(prev => {
      const index = prev.findIndex(category => category.id === catId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;

      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      saveFacilityCats(next);
      return next;
    });
  }, []);

  const addFacCategory = useCallback(() => {
    const trimmed = newFacCatName.trim();
    if (!trimmed) return;
    const cat: FacilityCategory = { id: uid(), name: trimmed, facilityIds: [], collapsed: false };
    setFacilityCats(prev => {
      const next = [...prev, cat];
      saveFacilityCats(next);
      return next;
    });
    setNewFacCatName("");
    setAddingFacilityCat(false);
  }, [newFacCatName]);

  const removeFacCat = useCallback((catId: string) => {
    setFacilityCats(prev => {
      const cat = prev.find(c => c.id === catId);
      if (!cat) return prev;
      const orphanIds = cat.facilityIds;
      let next = prev.filter(c => c.id !== catId);
      if (next.length === 0) {
        next = [{ id: uid(), name: "General", facilityIds: orphanIds, collapsed: false }];
      } else {
        next = next.map((c, i) => i === 0 ? { ...c, facilityIds: [...c.facilityIds, ...orphanIds] } : c);
      }
      saveFacilityCats(next);
      return next;
    });
  }, []);

  const addFacilityToCat = useCallback((catId: string) => {
    const n = newFacName.trim();
    if (!n) return;
    const fac = normalizeFacilityRecord({ id: uid(), name: n, type: newFacType, status: "Active", statusColor: "#4ACA6A" }) as Facility;
    setFacilities(prev => {
      const next = [...prev, fac];
      saveFacilities(next);
      return next;
    });
    setFacilityCats(prev => {
      const next = prev.map(c => c.id === catId ? { ...c, facilityIds: [...c.facilityIds, fac.id] } : c);
      saveFacilityCats(next);
      return next;
    });
    setNewFacName("");
    setNewFacType("Facility");
    setAddingFacilityCatId(null);
  }, [newFacName, newFacType]);

  const removeFacility = useCallback((facId: string) => {
    setFacilities(prev => {
      const removed = prev.find(f => f.id === facId);
      if (removed?.businessMap) {
        collectBusinessMapAssets(removed.businessMap).forEach((asset) => void deleteBusinessMapImage(asset).catch(() => undefined));
      }
      const next = prev.filter(f => f.id !== facId);
      saveFacilities(next);
      return next;
    });
    setFacilityCats(prev => {
      const next = prev.map(c => ({ ...c, facilityIds: c.facilityIds.filter(id => id !== facId) }));
      saveFacilityCats(next);
      return next;
    });
    if (selectedFacilityId === facId) setSelectedFacilityId(null);
  }, [selectedFacilityId]);

  const editFacility = useCallback((facId: string, updates: Partial<Facility>) => {
    setFacilities(prev => {
      const next = prev.map(f => f.id === facId ? { ...f, ...updates } : f);
      saveFacilities(next);
      return next;
    });
  }, []);

  const assignFacilityOwner = useCallback((facility: Facility, ownerPlayerId: string) => {
    const businessMap = facility.businessMap ? {
      ...facility.businessMap,
      permissions: {
        ...facility.businessMap.permissions,
        playerCanInstall: true,
        playerCanRemove: true,
        allowedPlayerIds: ownerPlayerId ? [ownerPlayerId] : [],
      },
    } : undefined;
    editFacility(facility.id, { ownerPlayerId, revenueDestination: "owner-personal-fund", businessMap });
  }, [editFacility]);

  const selectedFacility = selectedFacilityId ? facilities.find(f => f.id === selectedFacilityId) : null;

  // ── Contract callbacks ──
  const toggleConCatCollapse = useCallback((catId: string) => {
    setContractCats(prev => {
      const next = prev.map(c => c.id === catId ? { ...c, collapsed: !c.collapsed } : c);
      saveContractCats(next);
      return next;
    });
  }, []);

  const renameConCat = useCallback((catId: string, name: string) => {
    setContractCats(prev => {
      const next = prev.map(c => c.id === catId ? { ...c, name } : c);
      saveContractCats(next);
      return next;
    });
  }, []);

  const addConCategory = useCallback(() => {
    const trimmed = newConCatName.trim();
    if (!trimmed) return;
    const cat: ContractCategory = { id: uid(), name: trimmed, contractIds: [], collapsed: false };
    setContractCats(prev => {
      const next = [...prev, cat];
      saveContractCats(next);
      return next;
    });
    setNewConCatName("");
    setAddingContractCat(false);
  }, [newConCatName]);

  const removeConCat = useCallback((catId: string) => {
    setContractCats(prev => {
      const cat = prev.find(c => c.id === catId);
      if (!cat) return prev;
      const orphanIds = cat.contractIds;
      let next = prev.filter(c => c.id !== catId);
      if (next.length === 0) {
        next = [{ id: uid(), name: "General", contractIds: orphanIds, collapsed: false }];
      } else {
        next = next.map((c, i) => i === 0 ? { ...c, contractIds: [...c.contractIds, ...orphanIds] } : c);
      }
      saveContractCats(next);
      return next;
    });
  }, []);

  const addContractToCat = useCallback((catId: string) => {
    const n = newConName.trim();
    if (!n) return;
    const con: Contract = { id: uid(), name: n, status: "Active", statusColor: "#4ACA6A", priority: "MEDIUM" };
    setContracts(prev => {
      const next = [...prev, con];
      saveContracts(next);
      return next;
    });
    setContractCats(prev => {
      const next = prev.map(c => c.id === catId ? { ...c, contractIds: [...c.contractIds, con.id] } : c);
      saveContractCats(next);
      return next;
    });
    setNewConName("");
    setAddingContractCatId(null);
  }, [newConName]);

  const removeContract = useCallback((conId: string) => {
    setContracts(prev => {
      const next = prev.filter(c => c.id !== conId);
      saveContracts(next);
      return next;
    });
    setContractCats(prev => {
      const next = prev.map(c => ({ ...c, contractIds: c.contractIds.filter(id => id !== conId) }));
      saveContractCats(next);
      return next;
    });
    if (selectedContractId === conId) setSelectedContractId(null);
  }, [selectedContractId]);

  const editContract = useCallback((conId: string, updates: Partial<Contract>) => {
    setContracts(prev => {
      const next = prev.map(c => c.id === conId ? { ...c, ...updates } : c);
      saveContracts(next);
      return next;
    });
  }, []);

  const toggleContractPin = useCallback((conId: string) => {
    setContracts(prev => {
      const next = prev.map(c => {
        if (c.id !== conId) return c;
        return c.pinned
          ? { ...c, pinned: false, pinnedAt: undefined }
          : { ...c, pinned: true, pinnedAt: Date.now() };
      });
      saveContracts(next);
      return next;
    });
  }, []);

  const moveContractToCat = useCallback((contractId: string, fromCatId: string, toCatId: string) => {
    setContractCats(prev => {
      const next = prev.map(c => {
        if (c.id === fromCatId) return { ...c, contractIds: c.contractIds.filter(id => id !== contractId) };
        if (c.id === toCatId) return { ...c, contractIds: [...c.contractIds, contractId] };
        return c;
      });
      saveContractCats(next);
      return next;
    });
  }, []);

  const archiveContract = useCallback((conId: string) => {
    setContracts(prev => {
      const next = prev.map(c => c.id === conId ? { ...c, archived: true, archivedAt: Date.now(), pinned: false, pinnedAt: undefined } : c);
      saveContracts(next);
      return next;
    });
    setSelectedContractId(null);
  }, []);

  const unarchiveContract = useCallback((conId: string) => {
    setContracts(prev => {
      const next = prev.map(c => c.id === conId ? { ...c, archived: false, archivedAt: undefined } : c);
      saveContracts(next);
      return next;
    });
  }, []);

  const toggleAssignEmployee = useCallback((conId: string, empId: string) => {
    setContracts(prev => {
      const next = prev.map(c => {
        if (c.id !== conId) return c;
        const assigned = c.assignedEmployeeIds || [];
        const has = assigned.includes(empId);
        return { ...c, assignedEmployeeIds: has ? assigned.filter(id => id !== empId) : [...assigned, empId] };
      });
      saveContracts(next);
      return next;
    });
  }, []);

  const updateOfficeInfo = useCallback((updates: Partial<OfficeInfoData>) => {
    setOfficeInfo(prev => {
      const next = { ...prev, ...updates };
      saveOfficeInfo(next);
      return next;
    });
  }, []);

  // ── Inventory helpers ──
  const updateInvTabs = useCallback((updater: (prev: InvSubTab[]) => InvSubTab[]) => {
    setInvTabs(prev => {
      const next = updater(prev);
      saveInventory(next);
      return next;
    });
  }, []);

  const addInvTab = useCallback(() => {
    if (!newInvTabName.trim()) return;
    const tab: InvSubTab = { id: `inv-${uid()}`, name: newInvTabName.trim(), icon: newInvTabIcon, items: [] };
    updateInvTabs(prev => [...prev, tab]);
    setActiveInvTab(tab.id);
    setAddingInvTab(false);
    setNewInvTabName("");
    setNewInvTabIcon("package");
  }, [newInvTabName, newInvTabIcon, updateInvTabs]);

  const removeInvTab = useCallback((tabId: string) => {
    updateInvTabs(prev => prev.filter(t => t.id !== tabId));
    setActiveInvTab(prev => prev === tabId ? null : prev);
    setEmployees(prev => {
      const next = prev.map(e => {
        if (!e.equippedItems?.some(r => r.tabId === tabId)) return e;
        return { ...e, equippedItems: e.equippedItems.filter(r => r.tabId !== tabId) };
      });
      saveEmployees(next);
      return next;
    });
  }, [updateInvTabs]);

  const renameInvTab = useCallback((tabId: string, name: string) => {
    if (!name.trim()) return;
    updateInvTabs(prev => prev.map(t => t.id === tabId ? { ...t, name: name.trim() } : t));
    setRenamingInvTabId(null);
  }, [updateInvTabs]);

  const changeInvTabIcon = useCallback((tabId: string, icon: string) => {
    updateInvTabs(prev => prev.map(t => t.id === tabId ? { ...t, icon } : t));
  }, [updateInvTabs]);

  const addInvItem = useCallback((tabId: string, groupId?: string) => {
    const name = invItemDraft.name?.trim();
    if (!name) return;
    const itemId = `ii-${uid()}`;
    const item: InvItem = {
      id: itemId,
      name,
      description: invItemDraft.description?.trim() || "",
      price: invItemDraft.price || 0,
      currency: "Credits",
      quantity: invItemDraft.quantity ?? 1,
      rarity: (invItemDraft.rarity as InvItemRarity) || "Common",
      notes: invItemDraft.notes?.trim() || "",
      hidden: invItemDraft.hidden || false,
      damage: invItemDraft.damage?.trim() || undefined,
      damageType: invItemDraft.damageType || undefined,
      effects: draftEffects.length > 0 ? [...draftEffects] : undefined,
      effectText: invItemDraft.effectText?.trim() || undefined,
      tags: invItemDraft.tags && invItemDraft.tags.length > 0 ? [...invItemDraft.tags] : undefined,
    };
    updateInvTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      const newItems = [...t.items, item];
      if (groupId && t.groups) {
        const newGroups = t.groups.map(g => g.id === groupId ? { ...g, itemIds: [...g.itemIds, itemId] } : g);
        return { ...t, items: newItems, groups: newGroups };
      }
      return { ...t, items: newItems };
    }));
    setAddingInvItem(false);
    setInvItemDraft({});
    setDraftEffects([]);
  }, [invItemDraft, draftEffects, updateInvTabs]);

  const removeInvItem = useCallback((tabId: string, itemId: string) => {
    updateInvTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      return {
        ...t,
        items: t.items.filter(i => i.id !== itemId),
        groups: (t.groups || []).map(g => ({ ...g, itemIds: g.itemIds.filter(id => id !== itemId) })),
      };
    }));
    setEmployees(prev => {
      const next = prev.map(e => {
        if (!e.equippedItems?.some(r => r.tabId === tabId && r.itemId === itemId)) return e;
        return { ...e, equippedItems: e.equippedItems.filter(r => !(r.tabId === tabId && r.itemId === itemId)) };
      });
      saveEmployees(next);
      return next;
    });
  }, [updateInvTabs]);

  const updateInvItem = useCallback((tabId: string, itemId: string, updates: Partial<InvItem>) => {
    updateInvTabs(prev => prev.map(t => t.id === tabId ? {
      ...t, items: t.items.map(i => i.id === itemId ? { ...i, ...updates } : i),
    } : t));
  }, [updateInvTabs]);

  const saveEditingInvItem = useCallback((tabId: string) => {
    if (!editingInvItemId || !invItemDraft.name?.trim()) return;
    updateInvTabs(prev => prev.map(t => t.id === tabId ? {
      ...t, items: t.items.map(i => i.id === editingInvItemId ? {
        ...i,
        name: invItemDraft.name?.trim() || i.name,
        description: invItemDraft.description?.trim() ?? i.description,
        price: invItemDraft.price ?? i.price,
        currency: "Credits",
        quantity: invItemDraft.quantity ?? i.quantity,
        rarity: (invItemDraft.rarity as InvItemRarity) || i.rarity,
        notes: invItemDraft.notes?.trim() ?? i.notes,
        hidden: invItemDraft.hidden ?? i.hidden,
        damage: invItemDraft.damage?.trim() || undefined,
        damageType: invItemDraft.damageType || undefined,
        effects: draftEffects.length > 0 ? [...draftEffects] : undefined,
        effectText: invItemDraft.effectText?.trim() || undefined,
        tags: invItemDraft.tags && invItemDraft.tags.length > 0 ? [...invItemDraft.tags] : undefined,
      } : i),
    } : t));
    setEditingInvItemId(null);
    setInvItemDraft({});
    setDraftEffects([]);
  }, [editingInvItemId, invItemDraft, draftEffects, updateInvTabs]);

  // ── Group helpers ──
  const addInvGroup = useCallback((tabId: string) => {
    if (!newInvGroupName.trim()) return;
    const group: InvGroup = { id: `ig-${uid()}`, name: newInvGroupName.trim(), itemIds: [] };
    updateInvTabs(prev => prev.map(t => t.id === tabId ? { ...t, groups: [...(t.groups || []), group] } : t));
    setAddingInvGroup(false);
    setNewInvGroupName("");
  }, [newInvGroupName, updateInvTabs]);

  const removeInvGroup = useCallback((tabId: string, groupId: string) => {
    updateInvTabs(prev => prev.map(t => t.id === tabId ? { ...t, groups: (t.groups || []).filter(g => g.id !== groupId) } : t));
  }, [updateInvTabs]);

  const renameInvGroup = useCallback((tabId: string, groupId: string, name: string) => {
    if (!name.trim()) return;
    updateInvTabs(prev => prev.map(t => t.id === tabId ? {
      ...t, groups: (t.groups || []).map(g => g.id === groupId ? { ...g, name: name.trim() } : g),
    } : t));
    setEditingInvGroupId(null);
  }, [updateInvTabs]);

  const moveItemToGroup = useCallback((tabId: string, itemId: string, targetGroupId: string | null) => {
    updateInvTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      let groups = (t.groups || []).map(g => ({ ...g, itemIds: g.itemIds.filter(id => id !== itemId) }));
      if (targetGroupId) {
        groups = groups.map(g => g.id === targetGroupId ? { ...g, itemIds: [...g.itemIds, itemId] } : g);
      }
      return { ...t, groups };
    }));
  }, [updateInvTabs]);

  const toggleEquipItem = useCallback((empId: string, tabId: string, itemId: string) => {
    setEmployees(prev => {
      const next = prev.map(e => {
        if (e.id !== empId) return e;
        const equipped = e.equippedItems || [];
        const has = equipped.some(r => r.tabId === tabId && r.itemId === itemId);
        return { ...e, equippedItems: has ? equipped.filter(r => !(r.tabId === tabId && r.itemId === itemId)) : [...equipped, { tabId, itemId }] };
      });
      saveEmployees(next);
      return next;
    });
  }, []);

  const activeInvTabData = useMemo(() => {
    if (!activeInvTab) return invTabs[0] || null;
    return invTabs.find(t => t.id === activeInvTab) || invTabs[0] || null;
  }, [activeInvTab, invTabs]);

  const selectedContract = useMemo(() => selectedContractId ? contracts.find(c => c.id === selectedContractId) : null, [selectedContractId, contracts]);

  const pinnedContracts = useMemo(() => contracts
    .filter(c => c.pinned && !c.archived)
    .sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0))
    .slice(0, 5), [contracts]);

  const savePresetFromEmployee = useCallback((emp: Employee) => {
    const trimmed = presetNameDraft.trim();
    if (!trimmed) return;
    const preset: EmployeePreset = {
      id: uid(),
      name: trimmed,
      photo: emp.photo, photoW: emp.photoW, photoH: emp.photoH,
      photoScale: emp.photoScale, photoOffX: emp.photoOffX, photoOffY: emp.photoOffY,
      hp: emp.hp, maxHp: emp.maxHp,
      wounds: emp.wounds, maxWounds: emp.maxWounds,
      tempHp: emp.tempHp, armorClass: emp.armorClass, damageReduction: emp.damageReduction,
      strength: emp.strength, agility: emp.agility, constitution: emp.constitution,
      knowledge: emp.knowledge, wisdom: emp.wisdom, willpower: emp.willpower,
      proficiencies: emp.proficiencies ? [...emp.proficiencies] : [],
      equipment: emp.equipment ? [...emp.equipment] : [],
      personality: emp.personality, workInfo: emp.workInfo,
    };
    setPresets(prev => {
      const next = [...prev, preset];
      savePresets(next);
      return next;
    });
    setPresetNameDraft("");
    setShowSavePreset(false);
  }, [presetNameDraft]);

  const applyPresetToEmployee = useCallback((empId: string, preset: EmployeePreset) => {
    const updates: Partial<Employee> = {
      photo: preset.photo, photoW: preset.photoW, photoH: preset.photoH,
      photoScale: preset.photoScale, photoOffX: preset.photoOffX, photoOffY: preset.photoOffY,
      hp: preset.hp, maxHp: preset.maxHp,
      wounds: preset.wounds, maxWounds: preset.maxWounds,
      tempHp: preset.tempHp, armorClass: preset.armorClass, damageReduction: preset.damageReduction,
      strength: preset.strength, agility: preset.agility, constitution: preset.constitution,
      knowledge: preset.knowledge, wisdom: preset.wisdom, willpower: preset.willpower,
      proficiencies: preset.proficiencies ? [...preset.proficiencies] : [],
      equipment: preset.equipment ? [...preset.equipment] : [],
      personality: preset.personality, workInfo: preset.workInfo,
    };
    editEmployee(empId, updates);
    setShowLoadPreset(false);
  }, [editEmployee]);

  const deletePreset = useCallback((presetId: string) => {
    setPresets(prev => {
      const next = prev.filter(p => p.id !== presetId);
      savePresets(next);
      return next;
    });
  }, []);

  const saveLoadoutFromEmployee = useCallback((emp: Employee) => {
    const trimmed = loadoutNameDraft.trim();
    if (!trimmed) return;
    const loadout: EquipLoadout = {
      id: uid(),
      name: trimmed,
      equipment: emp.equipment ? [...emp.equipment] : [],
      equippedItems: emp.equippedItems ? emp.equippedItems.map(r => ({ ...r })) : [],
    };
    setLoadouts(prev => {
      const next = [...prev, loadout];
      saveLoadouts(next);
      return next;
    });
    setLoadoutNameDraft("");
    setShowSaveLoadout(false);
  }, [loadoutNameDraft]);

  const applyLoadoutToEmployee = useCallback((empId: string, loadout: EquipLoadout) => {
    editEmployee(empId, {
      equipment: loadout.equipment ? [...loadout.equipment] : [],
      equippedItems: loadout.equippedItems ? loadout.equippedItems.map(r => ({ ...r })) : [],
    });
    setShowLoadLoadout(false);
  }, [editEmployee]);

  const deleteLoadout = useCallback((loadoutId: string) => {
    setLoadouts(prev => {
      const next = prev.filter(l => l.id !== loadoutId);
      saveLoadouts(next);
      return next;
    });
  }, []);

  const startEditName = () => {
    setNameDraft(officeName);
    setEditingName(true);
  };
  const confirmEditName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed) {
      setOfficeName(trimmed);
      saveOfficeName(trimmed);
    }
    setEditingName(false);
  };
  const cancelEditName = () => setEditingName(false);

  const govTier = getTierForValue(reputation, govConfig.tiers);
  const govTierStyle = { color: govTier.color };
  const GovIcon = getIconComponent(govConfig.icon);
  const govPct = ((reputation + 100) / 200) * 100;
  const govLowLabel = govConfig.tiers[0]?.label || "Outlawed";
  const govHighLabel = govConfig.tiers[govConfig.tiers.length - 1]?.label || "Essential Asset";

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Building2 },
    { id: "map" as const, label: "Business Map", icon: Waypoints },
    { id: "inventory" as const, label: "Inventory", icon: Package },
    { id: "facilities" as const, label: "Facilities", icon: Factory },
    { id: "employees" as const, label: "Employees", icon: Users },
    { id: "contracts" as const, label: "Contracts", icon: FileText },
    { id: "info" as const, label: "Info", icon: Info },
  ];

  const panelStyle: React.CSSProperties = {
    background: "linear-gradient(180deg, #0A0A12 0%, #060609 100%)",
    border: "1px solid #1A1A2B",
    borderRadius: 6,
    boxShadow: "0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.02)",
  };

  const innerPanelStyle: React.CSSProperties = {
    background: "#050508",
    border: "1px solid #12121E",
    borderRadius: 4,
    boxShadow: "inset 0 2px 6px rgba(0,0,0,0.5)",
  };

  const innerAccentPanel: React.CSSProperties = { ...innerPanelStyle, border: `1px solid ${accent}20` };
  const innerClickPanel: React.CSSProperties = { ...innerPanelStyle, padding: "14px 16px", cursor: "pointer" };

  const sectionHeader = (text: string, icon?: React.ReactNode) => (
    <div className="flex items-center gap-2 mb-3 pb-2" style={NS_BORDER_SECTION}>
      {icon && <div style={nsAccentSoft(accent)}>{icon}</div>}
      <span className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={nsAccentDim(accent)}>{text}</span>
      <div className="flex-1 h-px" style={nsGradLine(accent)} />
    </div>
  );

  const statCard = (label: string, value: string | React.ReactNode, icon: React.ReactNode, color: string) => (
    <div style={nsInnerPad14_16(innerPanelStyle)} className="group">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded flex items-center justify-center" style={nsColorBox(color)}>
          {icon}
        </div>
        <span className="text-[10px] uppercase tracking-wider" style={NS_DIM}>{label}</span>
      </div>
      <div className="text-[20px] font-bold" style={nsTextColor(color)}>{value}</div>
    </div>
  );

  const renderIconPicker = (selected: string, onSelect: (key: string) => void) => (
    <div className="grid grid-cols-8 gap-1">
      {ICON_OPTIONS.map(opt => {
        const IconComp = opt.icon;
        const isSel = opt.key === selected;
        return (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            className="w-7 h-7 rounded flex items-center justify-center transition-all"
            style={nsIconToggle(isSel, accent)}
            title={opt.label}
          >
            <IconComp size={12} />
          </button>
        );
      })}
    </div>
  );

  const renderTierEditor = (
    tiers: EntityTierDef[],
    onUpdate: (newTiers: EntityTierDef[]) => void,
    onReset: () => void,
    resetLabel: string,
  ) => (
    <div>
      <label className="text-[9px] uppercase tracking-wider block mb-1.5" style={NS_DIM}>Reputation Tiers (low → high)</label>
      <div className="space-y-1">
        {tiers.map((tier, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={nsBgColor(tier.color)} />
            <input
              value={tier.label}
              onChange={e => {
                const newTiers = tiers.map((t, i) => i === idx ? { ...t, label: e.target.value } : t);
                onUpdate(newTiers);
              }}
              className="flex-1 text-[10px] bg-transparent outline-none px-2 py-1 rounded min-w-0"
              style={nsColorInput(tier.color)}
              maxLength={30}
            />
            <input
              type="number"
              value={tier.min}
              onChange={e => {
                const val = parseInt(e.target.value);
                if (isNaN(val)) return;
                const clamped = Math.max(-100, Math.min(100, val));
                const newTiers = tiers.map((t, i) => i === idx ? { ...t, min: clamped } : t);
                onUpdate(newTiers);
              }}
              className="w-12 text-[9px] font-mono bg-transparent outline-none px-1 py-1 rounded text-center flex-shrink-0"
              style={NS_STAT_BTN}
            />
            <span className="text-[8px] flex-shrink-0" style={NS_DARK}>to</span>
            <input
              type="number"
              value={tier.max}
              onChange={e => {
                const val = parseInt(e.target.value);
                if (isNaN(val)) return;
                const clamped = Math.max(-100, Math.min(100, val));
                const newTiers = tiers.map((t, i) => i === idx ? { ...t, max: clamped } : t);
                onUpdate(newTiers);
              }}
              className="w-12 text-[9px] font-mono bg-transparent outline-none px-1 py-1 rounded text-center flex-shrink-0"
              style={NS_STAT_BTN}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={onReset}
          className="text-[9px] px-2 py-0.5 rounded hover:opacity-80 transition-opacity"
          style={NS_INPUT_DIM}
        >
          {resetLabel}
        </button>
        <button
          onClick={() => {
            const sorted = [...tiers].sort((a, b) => a.min - b.min);
            const fixed: EntityTierDef[] = [];
            for (let i = 0; i < sorted.length; i++) {
              const prev = i === 0 ? -101 : fixed[i - 1].max;
              const t = sorted[i];
              fixed.push({ ...t, min: prev + 1, max: i === sorted.length - 1 ? 100 : t.max });
            }
            onUpdate(fixed);
          }}
          className="text-[9px] px-2 py-0.5 rounded hover:opacity-80 transition-opacity"
          style={NS_BTN_LOAD}
        >
          Auto-fix ranges
        </button>
      </div>
    </div>
  );

  const renderGovSettings = () => (
    <div style={innerAccentPanel} className="p-4 space-y-4 mt-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-semibold" style={nsAccentDim(accent)}>Configure Government Standing</span>
        <button onClick={() => setEditingGov(false)} className="p-1 rounded hover:opacity-80 transition-opacity" style={NS_FAINT}>
          <X size={12} />
        </button>
      </div>
      <div>
        <label className="text-[9px] uppercase tracking-wider block mb-1" style={NS_DIM}>Name</label>
        <input
          value={govConfig.name}
          onChange={e => updateGovConfig({ name: e.target.value })}
          className="w-full text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
          style={NS_INPUT_STYLE}
          maxLength={50}
        />
      </div>
      <div>
        <label className="text-[9px] uppercase tracking-wider block mb-1" style={NS_DIM}>Subtitle</label>
        <input
          value={govConfig.subtitle}
          onChange={e => updateGovConfig({ subtitle: e.target.value })}
          className="w-full text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
          style={NS_INPUT_STYLE}
          maxLength={60}
        />
      </div>
      <div>
        <label className="text-[9px] uppercase tracking-wider block mb-1.5" style={NS_DIM}>Symbol</label>
        {renderIconPicker(govConfig.icon, (key) => updateGovConfig({ icon: key }))}
      </div>
      {renderTierEditor(
        govConfig.tiers,
        (newTiers) => updateGovConfig({ tiers: newTiers }),
        () => updateGovConfig({ tiers: defaultGovTiers() }),
        "Reset to defaults",
      )}
    </div>
  );

  const renderEntitySettings = (entity: ReputationEntity) => (
    <div style={innerAccentPanel} className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-semibold" style={nsAccentDim(accent)}>Configure Entity</span>
        <button onClick={() => setEditingEntityId(null)} className="p-1 rounded hover:opacity-80 transition-opacity" style={NS_FAINT}>
          <X size={12} />
        </button>
      </div>
      <div>
        <label className="text-[9px] uppercase tracking-wider block mb-1" style={NS_DIM}>Name</label>
        <input
          value={entity.name}
          onChange={e => updateEntity(entity.id, { name: e.target.value })}
          className="w-full text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
          style={NS_INPUT_STYLE}
          maxLength={50}
        />
      </div>
      <div>
        <label className="text-[9px] uppercase tracking-wider block mb-1.5" style={NS_DIM}>Symbol</label>
        {renderIconPicker(entity.icon, (key) => updateEntity(entity.id, { icon: key }))}
      </div>
      {renderTierEditor(
        entity.tiers,
        (newTiers) => updateEntity(entity.id, { tiers: newTiers }),
        () => updateEntity(entity.id, { tiers: defaultEntityTiers() }),
        "Reset to defaults",
      )}
    </div>
  );

  const renderEntityRepBar = (entity: ReputationEntity, index: number) => {
    const tier = getTierForValue(entity.value, entity.tiers);
    const pct = ((entity.value + 100) / 200) * 100;
    const EntityIcon = getIconComponent(entity.icon);
    const lowLabel = entity.tiers[0]?.label || "Despised";
    const highLabel = entity.tiers[entity.tiers.length - 1]?.label || "Strong Ally";
    const isEditing = editingEntityId === entity.id;

    return (
      <DraggableEntityRow
        key={entity.id}
        entity={entity}
        index={index}
        isDM={isDM}
        accent={accent}
        moveEntity={moveEntity}
      >
        <div className="space-y-2">
          <div style={innerPanelStyle} className="p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={nsColorBox(tier.color)}>
                  <EntityIcon size={11} style={nsTextColor(tier.color)} />
                </div>
                <span className="text-[12px] font-semibold truncate" style={NS_TEXT}>{entity.name}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={nsTierBadge(tier.color)}>
                  {tier.label}
                </span>
                {isDM && (
                  <div style={NS_DISPLAY_CONTENTS}>
                    <button onClick={() => updateEntityRep(entity.id, -5)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_REP_MINUS}>
                      <TrendingDown size={8} />
                    </button>
                    <button onClick={() => updateEntityRep(entity.id, 5)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_REP_PLUS}>
                      <TrendingUp size={8} />
                    </button>
                    <button
                      onClick={() => setEditingEntityId(isEditing ? null : entity.id)}
                      className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity"
                      style={nsEditToggle(isEditing, accent)}
                      title="Configure"
                    >
                      <Settings size={8} />
                    </button>
                    <button onClick={() => removeEntity(entity.id)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_DELETE}>
                      <Trash2 size={8} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="relative h-1.5 rounded-full overflow-hidden" style={NS_BAR_BG}>
              <div
                className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
                style={NS_ENTITY_REP_BAR(`${pct}%`)}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[7px]" style={NS_DARK}>{lowLabel}</span>
              <span className="text-[8px] font-mono" style={nsTextColor(tier.color)}>{entity.value > 0 ? "+" : ""}{entity.value}</span>
              <span className="text-[7px]" style={NS_DARK}>{highLabel}</span>
            </div>
          </div>
          {isEditing && isDM && renderEntitySettings(entity)}
        </div>
      </DraggableEntityRow>
    );
  };

  return (
    <div className="min-h-screen flex flex-col" style={bc(pageBg)}>
      {/* Top toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={NS_TOOLBAR_BG}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/interface")}
            className="text-[11px] hover:opacity-80 flex items-center gap-1 transition-opacity"
            style={nsTextColor(accent)}
          >
            <ArrowLeft size={12} />
            Back
          </button>
          <div className="w-px h-4" style={NS_DIVIDER_DARK} />
          <div className="flex items-center gap-1.5">
            <Building2 size={11} style={NS_SUBDIM} />
            <span className="text-[11px]" style={NS_DIM}>{officeName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded" style={nsSubtleBox(govTier.color)}>
            <GovIcon size={10} style={govTierStyle} />
            <span className="text-[10px] font-medium" style={govTierStyle}>{govTier.label}</span>
          </div>
        </div>
      </div>

      {saveNotice && (
        <div className="fixed top-4 right-4 z-[120] pointer-events-none">
          <div
            className="px-3 py-2 rounded-lg shadow-lg border text-[11px] font-medium max-w-[320px]"
            style={
              saveNotice.type === "saving"
                ? { background: "rgba(15, 24, 40, 0.96)", border: "1px solid rgba(106,154,218,0.45)", color: "#C8D8FF" }
                : saveNotice.type === "saved"
                  ? { background: "rgba(10, 26, 18, 0.96)", border: "1px solid rgba(74,202,106,0.45)", color: "#B8F5C8" }
                  : { background: "rgba(40, 12, 12, 0.96)", border: "1px solid rgba(255,106,106,0.45)", color: "#FFD2D2" }
            }
          >
            {saveNotice.message}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col px-4 py-6 max-w-[1300px] mx-auto w-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
              style={nsAccentIcon(accent)}
            >
              <Building2 size={24} style={nsTextColor(accent)} />
            </div>
            <div className="flex-1 min-w-0">
              {stateSaveError && (
                <div
                  className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-medium"
                  style={{ background: "rgba(80, 20, 20, 0.65)", border: "1px solid rgba(255,106,106,0.35)", color: "#FFD2D2" }}
                >
                  <AlertTriangle size={11} />
                  <span>{stateSaveError}</span>
                </div>
              )}
              {editingName ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") confirmEditName(); if (e.key === "Escape") cancelEditName(); }}
                    autoFocus
                    className="text-[28px] font-bold bg-transparent outline-none px-2 py-0.5 rounded"
                    style={nsNameInput(accent)}
                    maxLength={60}
                  />
                  <button onClick={confirmEditName} className="p-1.5 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                    <Check size={14} />
                  </button>
                  <button onClick={cancelEditName} className="p-1.5 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <h1
                    className="text-[28px] font-bold tracking-tight"
                    style={nsNameTitle(accent, ts)}
                  >
                    {officeName}
                  </h1>
                  {isDM && (
                    <button onClick={startEditName} className="p-1 rounded hover:opacity-80 transition-opacity" style={NS_DIM} title="Rename office">
                      <Pencil size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6" style={NS_BORDER_SUBSECTION}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSelectedEmployeeId(null); setSelectedFacilityId(null); setSelectedContractId(null); setShowArchive(false); setShowFinancePanel(false); setShowRepPanel(false); }}
                className="px-4 py-2.5 text-[12px] flex items-center gap-2 transition-all relative"
                style={nsTabActive(active, accent)}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div style={panelStyle} className="flex-1 p-6">
          {activeTab === "overview" && !showRepPanel && !showFinancePanel && (
            <div className="space-y-6">
              {sectionHeader("Headquarters Status", <Building2 size={12} />)}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* City Government Standing - clickable */}
                <div
                  style={innerClickPanel}
                  className="hover:border-[#1E1E30] transition-colors"
                  onClick={() => setShowRepPanel(true)}
                  title="View all reputation standings"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded flex items-center justify-center" style={nsColorBox(govTier.color)}>
                        <GovIcon size={12} style={govTierStyle} />
                      </div>
                      <span className="text-[10px] uppercase tracking-wider" style={NS_DIM}>City Standing</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isDM && (
                        <div style={NS_DISPLAY_CONTENTS}>
                          <button onClick={(e) => { e.stopPropagation(); saveRep(reputation - 5); }} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_REP_MINUS}>
                            <TrendingDown size={9} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); saveRep(reputation + 5); }} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_REP_PLUS}>
                            <TrendingUp size={9} />
                          </button>
                        </div>
                      )}
                      <ChevronRight size={12} style={NS_SUBDIM} />
                    </div>
                  </div>
                  <div className="text-[20px] font-bold mb-2" style={govTierStyle}>{govTier.label}</div>
                  <div className="relative h-2 rounded-full overflow-hidden" style={NS_REP_BAR_BG}>
                    <div
                      className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
                      style={nsRepBar(`${govPct}%`, govTier.color)}
                    />
                    <div
                      className="absolute top-[-2px] w-2 h-[calc(100%+4px)] rounded-sm transition-all duration-500"
                      style={nsSliderThumb(govTier.color, govPct)}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[8px]" style={NS_SUBDIM}>{govLowLabel}</span>
                    <span className="text-[9px] font-mono" style={govTierStyle}>{reputation > 0 ? "+" : ""}{reputation}</span>
                    <span className="text-[8px]" style={NS_SUBDIM}>{govHighLabel}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2 justify-center">
                    <span className="text-[8px]" style={NS_SUBDIM}>Click to view all standings</span>
                  </div>
                </div>

                <div
                  style={innerClickPanel}
                  className="hover:border-[#1E1E30] transition-colors"
                  onClick={() => setActiveTab("employees")}
                  title="View employees"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={nsColorBox("#5A9ACA")}>
                      <Users size={12} style={NS_BLUE} />
                    </div>
                    <span className="text-[10px] uppercase tracking-wider" style={NS_DIM}>Total Employees</span>
                  </div>
                  <div className="text-[20px] font-bold" style={NS_BLUE}>{totalEmployees}</div>
                </div>
                <div
                  style={innerClickPanel}
                  className="hover:border-[#1E1E30] transition-colors"
                  onClick={() => setShowFinancePanel(true)}
                  title="View revenue & expenses"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded flex items-center justify-center" style={nsColorBox("#CAAA3A")}>
                        <Gem size={12} style={NS_GOLD} />
                      </div>
                      <span className="text-[10px] uppercase tracking-wider" style={NS_DIM}>Player Accounts</span>
                    </div>
                    <ChevronRight size={12} style={NS_SUBDIM} />
                  </div>
                  <div className="text-[20px] font-bold" style={NS_GOLD}>{creditAccounts.reduce((sum, account) => sum + account.balance, 0).toLocaleString()} CR</div>
                  <div className="mt-1 text-[8px]" style={NS_SUBDIM}>{creditAccountsError ? "Credits service unavailable" : `${creditAccounts.length} visible account${creditAccounts.length === 1 ? "" : "s"}`}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3 pb-2 cursor-pointer group" style={NS_BORDER_SECTION} onClick={() => setActiveTab("contracts")}>
                <div style={nsAccentSoft(accent)}><Target size={12} /></div>
                <span className="text-[11px] uppercase tracking-[0.15em] font-semibold group-hover:opacity-100 transition-opacity" style={nsAccentDim(accent)}>Active Contracts</span>
                <div className="flex-1 h-px" style={nsGradLine(accent)} />
                <ChevronRight size={11} style={nsIconTint(accent, 0.3)} className="group-hover:opacity-70 transition-opacity" />
              </div>

              <div className="space-y-3">
                {pinnedContracts.length === 0 ? (
                  <div style={innerPanelStyle} className="p-6 text-center">
                    <FileText size={20} style={NS_EMPTY_ICON} />
                    <p className="text-[10px]" style={NS_SUBDIM}>No pinned contracts. Pin contracts to show them here.</p>
                  </div>
                ) : (
                  pinnedContracts.map(con => {
                    const priColor = PRIORITY_META[con.priority || "MEDIUM"]?.color || "#CAAA3A";
                    return (
                      <div
                        key={con.id}
                        style={innerPanelStyle}
                        className="p-4 hover:border-[#1A1A30] transition-colors cursor-pointer"
                        onClick={() => { setActiveTab("contracts"); setSelectedContractId(con.id); }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Pin size={10} style={NS_ICON_GOLD_DIM} />
                              <Briefcase size={12} style={nsAccentDim(accent)} />
                              <span className="text-[13px] font-semibold" style={NS_BRIGHT}>{con.name}</span>
                            </div>
                            {con.description && (
                              <p className="text-[11px] leading-relaxed ml-[38px]" style={NS_FAINT}>{con.description}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            {con.priority && (
                              <span className="text-[9px] px-2 py-0.5 rounded font-semibold tracking-wider" style={nsPriBadge(priColor)}>
                                {con.priority}
                              </span>
                            )}
                            {con.due && (
                              <div className="flex items-center gap-1">
                                <Clock size={9} style={NS_DIM} />
                                <span className="text-[9px]" style={NS_DIM}>{con.due}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Reputation Panel */}
          {activeTab === "overview" && showRepPanel && (
            <DndProvider backend={HTML5Backend}>
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={() => { setShowRepPanel(false); setEditingEntityId(null); setEditingGov(false); }}
                    className="p-1.5 rounded hover:opacity-80 transition-opacity"
                    style={nsAccentBtn(accent)}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <div className="flex items-center gap-2">
                    <GovIcon size={14} style={nsAccentSoft(accent)} />
                    <span className="text-[15px] font-semibold" style={NS_BRIGHT}>Reputation Standings</span>
                  </div>
                </div>

                {/* City Government - always shown */}
                <div>
                  {sectionHeader(govConfig.name, <GovIcon size={12} />)}
                  <div style={nsInnerPad16(innerPanelStyle)}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={nsColorBox(govTier.color)}>
                          <GovIcon size={15} style={govTierStyle} />
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold" style={NS_BRIGHT}>{govConfig.name}</div>
                          <div className="text-[9px]" style={NS_DIM}>{govConfig.subtitle}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded" style={nsTierBadge(govTier.color)}>
                          {govTier.label}
                        </span>
                        {isDM && (
                          <div style={NS_DISPLAY_CONTENTS}>
                            <button onClick={() => saveRep(reputation - 5)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_REP_MINUS}>
                              <TrendingDown size={9} />
                            </button>
                            <button onClick={() => saveRep(reputation + 5)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity" style={NS_BTN_REP_PLUS}>
                              <TrendingUp size={9} />
                            </button>
                            <button
                              onClick={() => setEditingGov(!editingGov)}
                              className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity"
                              style={nsEditToggle(editingGov, accent)}
                              title="Configure"
                            >
                              <Settings size={9} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="relative h-2.5 rounded-full overflow-hidden" style={NS_REP_BAR_BG}>
                      <div
                        className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
                        style={nsRepBar(`${govPct}%`, govTier.color)}
                      />
                      <div
                        className="absolute top-[-2px] w-2 h-[calc(100%+4px)] rounded-sm transition-all duration-500"
                        style={nsSliderThumb(govTier.color, govPct)}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[8px]" style={NS_SUBDIM}>{govLowLabel}</span>
                      <span className="text-[9px] font-mono" style={govTierStyle}>{reputation > 0 ? "+" : ""}{reputation}</span>
                      <span className="text-[8px]" style={NS_SUBDIM}>{govHighLabel}</span>
                    </div>
                  </div>
                  {editingGov && isDM && renderGovSettings()}
                </div>

                {/* Other entities */}
                <div>
                  <div className="flex items-center justify-between mb-3 pb-2" style={NS_BORDER_SECTION}>
                    <div className="flex items-center gap-2">
                      <Users size={12} style={nsAccentSoft(accent)} />
                      <span className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={nsAccentDim(accent)}>Factions & Entities</span>
                      <div className="flex-1 h-px" style={nsGradLine(accent)} />
                    </div>
                    {isDM && !addingEntity && (
                      <button
                        onClick={() => setAddingEntity(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                        style={nsAccentBtn(accent)}
                      >
                        <Plus size={10} />
                        Add Entity
                      </button>
                    )}
                  </div>

                  {/* Add entity form */}
                  {isDM && addingEntity && (
                    <div style={innerPanelStyle} className="p-4 mb-3 space-y-3">
                      <div>
                        <label className="text-[9px] uppercase tracking-wider block mb-1" style={NS_DIM}>Name</label>
                        <input
                          value={newEntityName}
                          onChange={e => setNewEntityName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") addEntity(); if (e.key === "Escape") { setAddingEntity(false); setNewEntityName(""); } }}
                          placeholder="Entity or faction name..."
                          autoFocus
                          className="w-full text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_INPUT_STYLE}
                          maxLength={50}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-wider block mb-1.5" style={NS_DIM}>Symbol</label>
                        {renderIconPicker(newEntityIcon, setNewEntityIcon)}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button onClick={addEntity} className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                          <Check size={10} />
                          Create
                        </button>
                        <button onClick={() => { setAddingEntity(false); setNewEntityName(""); setNewEntityIcon("shield"); }} className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                          <X size={10} />
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {entityReps.length === 0 ? (
                    <div style={innerPanelStyle} className="p-8 text-center">
                      <Users size={24} style={NS_EMPTY_ICON_LG} />
                      <p className="text-[11px]" style={NS_SUBDIM}>No faction standings tracked yet.</p>
                      {isDM && (
                        <p className="text-[9px] mt-1" style={NS_DARK}>Click "Add Entity" to track reputation with a faction or NPC group.</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {entityReps.map((entity, idx) => renderEntityRepBar(entity, idx))}
                    </div>
                  )}
                </div>
              </div>
            </DndProvider>
          )}

          {/* Finance Panel */}
          {activeTab === "overview" && showFinancePanel && (() => {
            const facilityEconomies = new Map(facilities.flatMap((facility) => {
              if (!facility.baseStats) return [];
              const stats = facility.businessMap ? calculateFacilityStats(facility.baseStats, facility.businessMap, facilityAdditions) : facility.baseStats;
              return [[facility.id, calculateFacilityEconomy(stats, facility.staffCostPerPerson ?? 50)] as const];
            }));
            const facilityFinances = facilities.filter((facility) => facilityEconomies.has(facility.id));
            const totalRevenue = Array.from(facilityEconomies.values()).reduce((sum, economy) => sum + economy.adjustedRevenue, 0);
            const totalExpenses = Array.from(facilityEconomies.values()).reduce((sum, economy) => sum + economy.totalMonthlyCosts, 0);
            const netIncome = totalRevenue - totalExpenses;
            const visibleAccounts = isDM ? creditAccounts : creditAccounts.filter((account) => account.playerId === currentUserId);

            return (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={() => setShowFinancePanel(false)}
                    className="p-1.5 rounded hover:opacity-80 transition-opacity"
                    style={nsAccentBtn(accent)}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <div className="flex items-center gap-2">
                    <DollarSign size={14} style={NS_ICON_GOLD_SOFT} />
                    <span className="text-[15px] font-semibold" style={NS_BRIGHT}>Revenue & Expenses</span>
                  </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div style={innerPanelStyle} className="p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp size={10} style={NS_ICON_GREEN_SOFT} />
                      <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Adjusted Revenue</span>
                    </div>
                    <div className="text-[18px] font-bold font-mono" style={NS_ACCENT_GREEN}>
                      {totalRevenue > 0 ? `${totalRevenue.toLocaleString()} CR` : "—"}
                    </div>
                  </div>
                  <div style={innerPanelStyle} className="p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingDown size={10} style={NS_ICON_RED_SOFT} />
                      <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Upkeep + Payroll</span>
                    </div>
                    <div className="text-[18px] font-bold font-mono" style={NS_RED}>
                      {totalExpenses > 0 ? `${totalExpenses.toLocaleString()} CR` : "—"}
                    </div>
                  </div>
                  <div style={innerPanelStyle} className="p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Gem size={10} style={nsIncomeIcon(netIncome)} />
                      <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Net Monthly</span>
                    </div>
                    <div className="text-[18px] font-bold font-mono" style={nsIncomeColor(netIncome)}>
                      {netIncome !== 0 ? `${netIncome > 0 ? "+" : ""}${netIncome.toLocaleString()} CR` : "—"}
                    </div>
                  </div>
                </div>

                {sectionHeader("Player Accounts", <Coins size={12} />)}
                <div style={innerPanelStyle} className="p-4">
                  <div className="mb-3 flex justify-end">
                    <div className="text-[8px]" style={NS_SUBDIM}>{visibleAccounts.length} accounts</div>
                  </div>
                  {creditAccountsError && <div className="mb-3 border border-[#5A3A26] bg-[#160E08] px-3 py-2 text-[9px]" style={NS_WARN}>{creditAccountsError}</div>}
                  <div className="space-y-2">
                    {visibleAccounts.map((account) => {
                      const ownedFacilities = facilities.filter((facility) => facility.ownerPlayerId === account.playerId);
                      return (
                        <button type="button" onClick={() => navigate(`/interface/credits/${encodeURIComponent(account.playerId)}`)} key={account.playerId} className="grid w-full grid-cols-1 gap-3 border border-[#1A1A2B] bg-[#06060A] p-3 text-left transition-colors hover:border-[#4B4325] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                          <div className="min-w-0"><div className="flex items-center gap-2"><UserPlus size={10} style={NS_ICON_GOLD_SOFT} /><span className="truncate text-[11px] font-semibold" style={NS_TEXT}>{account.playerName}</span></div><div className="mt-1 truncate text-[8px]" style={NS_DIM}>{ownedFacilities.length ? ownedFacilities.map((facility) => facility.name).join(", ") : "No assigned facilities"}</div></div>
                          <div className="flex items-center justify-between gap-3 md:justify-end"><div className="text-right"><div className="text-[13px] font-mono font-bold" style={NS_GOLD}>{account.balance.toLocaleString()} CR</div><div className="mt-1 text-[7px]" style={NS_SUBDIM}>Open account history</div></div><ChevronRight size={12} style={NS_SUBDIM} /></div>
                        </button>
                      );
                    })}
                    {!creditAccountsError && visibleAccounts.length === 0 && <div className="py-5 text-center text-[9px]" style={NS_DIM}>No player accounts are available.</div>}
                  </div>
                </div>

                {sectionHeader("Facility Breakdown", <Factory size={12} />)}

                {facilityFinances.length === 0 ? (
                  <div style={innerPanelStyle} className="p-6 text-center">
                    <Factory size={20} style={NS_EMPTY_ICON} />
                    <p className="text-[10px]" style={NS_SUBDIM}>No facilities have economy settings yet.</p>
                    <p className="text-[9px] mt-1" style={NS_DARK}>Open a facility's monthly ledger to configure its economy.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2" style={NS_BORDER_SUBSECTION}>
                      <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Facility</span>
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-right w-[100px]" style={NS_DIM}>Adjusted/mo</span>
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-right w-[100px]" style={NS_DIM}>Costs/mo</span>
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-right w-[80px]" style={NS_DIM}>Net</span>
                    </div>
                    {facilityFinances.map(fac => {
                      const economy = facilityEconomies.get(fac.id)!;
                      const rev = economy.adjustedRevenue;
                      const exp = economy.totalMonthlyCosts;
                      const net = rev - exp;
                      const meta = FACILITY_TYPE_META[fac.type] || FACILITY_TYPE_META.Facility;
                      return (
                        <div key={fac.id} style={innerPanelStyle} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-3 items-center">
                          <div className="flex items-center gap-2 min-w-0">
                            <meta.icon size={11} style={nsIconTint(meta.color)} className="flex-shrink-0" />
                            <span className="text-[11px] font-medium truncate" style={NS_TEXT}>{fac.name}</span>
                            <span className="text-[8px] px-1 py-0.5 rounded flex-shrink-0" style={nsMetaBadge(meta.color)}>{fac.type}</span>
                          </div>
                          <span className="text-[11px] font-mono text-right w-[100px]" style={nsRevColor(rev)}>
                            {rev > 0 ? `+${rev.toLocaleString()} CR` : "—"}
                          </span>
                          <span className="text-[11px] font-mono text-right w-[100px]" style={nsExpColor(exp)}>
                            {exp > 0 ? `-${exp.toLocaleString()} CR` : "—"}
                          </span>
                          <span className="text-[11px] font-mono text-right font-semibold w-[80px]" style={nsNetColor(net)}>
                            {net !== 0 ? `${net > 0 ? "+" : ""}${net.toLocaleString()}` : "—"}
                          </span>
                        </div>
                      );
                    })}
                    {/* Totals row */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-3 items-center" style={NS_BORDER_TOP_DARK}>
                      <span className="text-[11px] font-semibold" style={NS_PALE}>Total</span>
                      <span className="text-[11px] font-mono font-bold text-right w-[100px]" style={nsRevColor(totalRevenue)}>
                        {totalRevenue > 0 ? `+${totalRevenue.toLocaleString()} CR` : "—"}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-right w-[100px]" style={nsExpColor(totalExpenses)}>
                        {totalExpenses > 0 ? `-${totalExpenses.toLocaleString()} CR` : "—"}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-right w-[80px]" style={nsNetColor(netIncome)}>
                        {netIncome !== 0 ? `${netIncome > 0 ? "+" : ""}${netIncome.toLocaleString()}` : "—"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {activeTab === "map" && (
            <OfficeBusinessMap
              value={businessMap}
              onChange={setBusinessMap}
              isDM={isDM}
              facilities={facilities.map((facility) => ({ id: facility.id, name: facility.name }))}
              additions={facilityAdditions}
              onAdditionsChange={setFacilityAdditions}
              additionUsage={facilityAdditionUsage}
              mapKey="global"
              currentPlayerId={currentUserId}
              players={businessMapPlayers}
              onPlayerAction={handleFacilityAdditionAction}
            />
          )}

          {activeTab === "inventory" && (() => {
            const tab = activeInvTabData;
            const visibleItems = tab ? tab.items.filter((item) => !isLegacyCreditInventoryItem(item) && (isDM || !item.hidden)) : [];
            const TabIcon = tab ? getIconComponent(tab.icon) : Package;

            return (
            <div className="space-y-4">
              {/* Sub-tab bar */}
              <div className="flex items-center gap-1 flex-wrap">
                {invTabs.map(t => {
                  const TIcon = getIconComponent(t.icon);
                  const isActive = tab?.id === t.id;
                  const itemCount = t.items.filter((item) => !isLegacyCreditInventoryItem(item) && (isDM || !item.hidden)).length;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveInvTab(t.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-all rounded-t"
                      style={isActive
                        ? { color: accent, background: `${accent}15`, borderBottom: `2px solid ${accent}` }
                        : { color: "#5A5A7A", background: "transparent", borderBottom: "2px solid transparent" }
                      }
                    >
                      <TIcon size={11} />
                      {t.name}
                      <span className="text-[9px] font-mono px-1 py-0 rounded ml-0.5" style={{ background: isActive ? `${accent}20` : "#0A0A14", color: isActive ? accent : "#4A4A6A" }}>
                        {itemCount}
                      </span>
                    </button>
                  );
                })}
                {isDM && !addingInvTab && (
                  <button
                    onClick={() => { setAddingInvTab(true); setNewInvTabName(""); setNewInvTabIcon("package"); }}
                    className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium hover:opacity-80 transition-opacity rounded"
                    style={nsAccentBtn(accent)}
                  >
                    <Plus size={10} /> Add Tab
                  </button>
                )}
              </div>

              {/* Add tab form */}
              {isDM && addingInvTab && (
                <div style={innerPanelStyle} className="p-3 space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Plus size={10} style={nsAccentDim(accent)} />
                    <span className="text-[10px] font-semibold" style={nsAccentDim(accent)}>New Inventory Tab</span>
                  </div>
                  <input
                    value={newInvTabName}
                    onChange={e => setNewInvTabName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addInvTab(); if (e.key === "Escape") setAddingInvTab(false); }}
                    placeholder="Tab name..."
                    autoFocus
                    className="w-full text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
                    style={NS_INPUT_STYLE}
                    maxLength={40}
                  />
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-1.5" style={NS_DIM}>Icon</label>
                    {renderIconPicker(newInvTabIcon, setNewInvTabIcon)}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={addInvTab} className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                      <Check size={10} /> Create
                    </button>
                    <button onClick={() => setAddingInvTab(false)} className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                      <X size={10} /> Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Tab content */}
              {tab ? (() => {
                const groups = tab.groups || [];
                const groupedItemIds = new Set(groups.flatMap(g => g.itemIds));
                const ungroupedItems = visibleItems.filter(i => !groupedItemIds.has(i.id));

                const renderItemCard = (item: InvItem) => {
                  return (
                  <div key={item.id} style={innerPanelStyle} className="p-3 min-w-[240px] max-w-[380px] flex-shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: INV_RARITY_COLORS[item.rarity] }} />
                        <span className="text-[12px] truncate" style={NS_TEXT}>{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {item.hidden && isDM && <Eye size={9} style={NS_DIM} />}
                        <span className="text-[9px] uppercase px-1.5 py-0 rounded" style={{ color: INV_RARITY_COLORS[item.rarity], background: `${INV_RARITY_COLORS[item.rarity]}15`, border: `1px solid ${INV_RARITY_COLORS[item.rarity]}30` }}>
                          {item.rarity}
                        </span>
                        {item.tags?.includes("Currency") && (
                          <span className="text-[8px] uppercase px-1.5 py-0 rounded font-mono" style={{ color: "#C8B060", background: "#C8B06015", border: "1px solid #C8B06030" }}>
                            💰 Currency
                          </span>
                        )}
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={NS_STAT_VALUE}>
                          {item.quantity === -1 ? "∞" : `x${item.quantity}`}
                        </span>
                      </div>
                    </div>
                    {item.description && <p className="text-[10px] mt-1 leading-relaxed" style={NS_MUTED}>{item.description}</p>}
                    {item.damage && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Swords size={9} style={NS_RED} />
                        <span className="text-[10px] font-mono" style={NS_RED}>{item.damage}</span>
                        {item.damageType && <span className="text-[9px] px-1 py-0 rounded" style={{ color: "#CC6A4A", background: "#1A0A0A", border: "1px solid #2A1A1A" }}>{item.damageType}</span>}
                      </div>
                    )}
                    {item.effects && item.effects.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.effects.map((eff, ei) => {
                          const col = EFFECT_STAT_COLORS[eff.stat] || "#9AAACC";
                          const lbl = EFFECT_STAT_OPTIONS.find(o => o.key === eff.stat)?.label || eff.stat;
                          return (
                            <span key={ei} className="text-[9px] font-mono px-1.5 py-0 rounded" style={{ color: col, background: `${col}15`, border: `1px solid ${col}30` }}>
                              {eff.value > 0 ? "+" : ""}{eff.value} {lbl}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {item.effectText && <p className="text-[9px] mt-1 italic" style={{ color: "#AA7ADA" }}>{item.effectText}</p>}
                    {item.price > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <DollarSign size={9} style={NS_GOLD} />
                        <span className="text-[10px] font-mono" style={NS_GOLD}>{item.price} CR</span>
                      </div>
                    )}
                    {isDM && item.notes && (
                      <div className="mt-1.5 text-[9px] italic px-2 py-1 rounded" style={{ color: "#8A6A3A", background: "#1A1A0A", border: "1px solid #2A2A1A" }}>
                        DM: {item.notes}
                      </div>
                    )}
                    {isDM && (
                      <div className="flex items-center gap-1.5 mt-2 pt-2 flex-wrap" style={NS_BORDER_TOP_DARK}>
                        <button
                          onClick={() => {
                            setEditingInvItemId(item.id);
                            setAddingInvItem(false);
                            setInvItemDraft({
                              name: item.name, description: item.description, price: item.price,
                              currency: item.currency, quantity: item.quantity, rarity: item.rarity,
                              notes: item.notes, hidden: item.hidden, damage: item.damage || "",
                              damageType: item.damageType || "", effectText: item.effectText || "",
                              tags: item.tags ? [...item.tags] : [],
                            });
                            setDraftEffects(item.effects ? item.effects.map(e => ({ ...e })) : []);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium hover:opacity-80 transition-opacity"
                          style={NS_BTN_EDIT}
                        >
                          <Pencil size={8} /> Edit
                        </button>
                        <button onClick={() => updateInvItem(tab.id, item.id, { quantity: item.quantity + 1 })} className="px-1.5 py-1 rounded text-[10px] hover:opacity-80 transition-opacity" style={NS_BTN_REP_PLUS} title="+1"><Plus size={9} /></button>
                        <button onClick={() => updateInvItem(tab.id, item.id, { quantity: Math.max(0, item.quantity - 1) })} className="px-1.5 py-1 rounded text-[10px] hover:opacity-80 transition-opacity" style={NS_BTN_REP_MINUS} title="-1"><Minus size={9} /></button>
                        <button
                          onClick={() => setEquipPickerEmpId(equipPickerEmpId === item.id ? null : item.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium hover:opacity-80 transition-opacity"
                          style={{ color: "#5A9ACA", background: "#0A1A2A", border: "1px solid #1A2A3A" }}
                          title="Equip to employee"
                        >
                          <UserPlus size={8} /> Equip
                        </button>
                        {groups.length > 0 && (
                          <select
                            value={groups.find(g => g.itemIds.includes(item.id))?.id || ""}
                            onChange={e => moveItemToGroup(tab.id, item.id, e.target.value || null)}
                            className="text-[8px] bg-transparent outline-none px-1 py-0.5 rounded cursor-pointer"
                            style={NS_INPUT_STYLE}
                          >
                            <option value="">Ungrouped</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        )}
                        <div className="flex-1" />
                        <button onClick={() => removeInvItem(tab.id, item.id)} className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_DELETE}>
                          <Trash2 size={8} /> Remove
                        </button>
                      </div>
                    )}
                    {isDM && equipPickerEmpId === item.id && (
                      <div className="mt-2 p-2 rounded space-y-1" style={{ background: "#060612", border: "1px solid #14141F" }}>
                        <span className="text-[9px] uppercase tracking-wider font-semibold block mb-1" style={NS_DIM}>Equip to Employee</span>
                        {employees.length === 0 ? (
                          <span className="text-[9px]" style={NS_SUBDIM}>No employees available.</span>
                        ) : employees.map(emp => {
                          const isEquipped = (emp.equippedItems || []).some(r => r.tabId === tab.id && r.itemId === item.id);
                          return (
                            <button
                              key={emp.id}
                              onClick={() => toggleEquipItem(emp.id, tab.id, item.id)}
                              className="flex items-center gap-2 w-full px-2 py-1 rounded text-[10px] hover:opacity-80 transition-opacity text-left"
                              style={isEquipped ? { color: accent, background: `${accent}15`, border: `1px solid ${accent}30` } : { color: "#7A7A9A", background: "#0A0A14", border: "1px solid #14141F" }}
                            >
                              {isEquipped ? <Check size={9} /> : <Plus size={9} />}
                              {emp.name}
                              {isEquipped && <span className="text-[8px] ml-auto" style={{ color: accent }}>Equipped</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  );
                };

                const renderItemForm = () => isDM && (addingInvItem || editingInvItemId) ? (
                  <div style={innerPanelStyle} className="p-3 space-y-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Package size={10} style={nsAccentDim(accent)} />
                      <span className="text-[10px] font-semibold" style={nsAccentDim(accent)}>
                        {editingInvItemId ? "Edit Item" : "New Item"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>Name</label>
                        <input value={invItemDraft.name || ""} onChange={e => setInvItemDraft(p => ({ ...p, name: e.target.value }))} autoFocus className="w-full text-[12px] bg-transparent outline-none px-2 py-1 rounded" style={NS_INPUT_STYLE} maxLength={60} />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>Rarity</label>
                        <select value={invItemDraft.rarity || "Common"} onChange={e => setInvItemDraft(p => ({ ...p, rarity: e.target.value as InvItemRarity }))} className="w-full text-[12px] bg-transparent outline-none px-2 py-1 rounded cursor-pointer" style={NS_INPUT_STYLE}>
                          {INV_RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>Description</label>
                      <textarea value={invItemDraft.description || ""} onChange={e => setInvItemDraft(p => ({ ...p, description: e.target.value }))} className="w-full text-[11px] bg-transparent outline-none px-2 py-1 rounded resize-y min-h-[40px]" style={NS_DETAIL_INPUT} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>Price</label>
                        <input type="number" min={0} value={invItemDraft.price ?? 0} onChange={e => setInvItemDraft(p => ({ ...p, price: Number(e.target.value) || 0 }))} className="w-full text-[12px] bg-transparent outline-none px-2 py-1 rounded" style={NS_INPUT_STYLE} />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>Currency</label>
                        <div className="w-full px-2 py-1 text-[12px]" style={NS_INPUT_STYLE}>Credits (CR)</div>
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>Quantity</label>
                        <input type="number" min={-1} value={invItemDraft.quantity ?? 1} onChange={e => setInvItemDraft(p => ({ ...p, quantity: Number(e.target.value) }))} className="w-full text-[12px] bg-transparent outline-none px-2 py-1 rounded" style={NS_INPUT_STYLE} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>Damage (optional)</label>
                        <input value={invItemDraft.damage || ""} onChange={e => setInvItemDraft(p => ({ ...p, damage: e.target.value }))} placeholder="e.g. 2d6+3" className="w-full text-[12px] bg-transparent outline-none px-2 py-1 rounded" style={NS_INPUT_STYLE} maxLength={20} />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>Damage Type</label>
                        <select value={invItemDraft.damageType || ""} onChange={e => setInvItemDraft(p => ({ ...p, damageType: e.target.value }))} className="w-full text-[12px] bg-transparent outline-none px-2 py-1 rounded cursor-pointer" style={NS_INPUT_STYLE}>
                          <option value="">None</option>
                          {DAMAGE_TYPES.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>Stat Effects (buffs/debuffs)</label>
                      <div className="space-y-1">
                        {draftEffects.map((eff, ei) => (
                          <div key={ei} className="flex items-center gap-1.5">
                            <select value={eff.stat} onChange={e => { const ne = [...draftEffects]; ne[ei] = { ...ne[ei], stat: e.target.value as EffectStat }; setDraftEffects(ne); }} className="text-[10px] bg-transparent outline-none px-1.5 py-0.5 rounded cursor-pointer flex-1" style={NS_INPUT_STYLE}>
                              {EFFECT_STAT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                            <input type="number" value={eff.value} onChange={e => { const ne = [...draftEffects]; ne[ei] = { ...ne[ei], value: Number(e.target.value) || 0 }; setDraftEffects(ne); }} className="w-14 text-[10px] bg-transparent outline-none px-1.5 py-0.5 rounded text-center" style={NS_INPUT_STYLE} />
                            <button onClick={() => setDraftEffects(draftEffects.filter((_, j) => j !== ei))} className="p-0.5 rounded hover:opacity-80" style={NS_BTN_CANCEL}><X size={8} /></button>
                          </div>
                        ))}
                        <button onClick={() => setDraftEffects([...draftEffects, { stat: "strength", value: 1 }])} className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded hover:opacity-80 transition-opacity" style={nsAccentBtn(accent)}>
                          <Plus size={8} /> Add Effect
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>Effect Description (optional)</label>
                      <input value={invItemDraft.effectText || ""} onChange={e => setInvItemDraft(p => ({ ...p, effectText: e.target.value }))} placeholder="e.g. Grants darkvision 60ft" className="w-full text-[11px] bg-transparent outline-none px-2 py-1 rounded" style={NS_INPUT_STYLE} maxLength={120} />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>DM Notes</label>
                      <input value={invItemDraft.notes || ""} onChange={e => setInvItemDraft(p => ({ ...p, notes: e.target.value }))} className="w-full text-[11px] bg-transparent outline-none px-2 py-1 rounded" style={NS_INPUT_STYLE} placeholder="Private notes..." />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={NS_DIM}>Tags</label>
                      <label className="flex items-center gap-2 text-[10px] cursor-pointer" style={{ color: (invItemDraft.tags || []).includes("Currency") ? "#C8B060" : "#6A7088" }}>
                        <input type="checkbox" checked={(invItemDraft.tags || []).includes("Currency")} onChange={e => {
                          const tags = [...(invItemDraft.tags || [])];
                          if (e.target.checked) { if (!tags.includes("Currency")) tags.push("Currency"); }
                          else { const idx = tags.indexOf("Currency"); if (idx >= 0) tags.splice(idx, 1); }
                          setInvItemDraft(p => ({ ...p, tags }));
                        }} className="accent-[#C8B060]" />
                        Currency item - inventory classification only
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-[10px] cursor-pointer" style={NS_MUTED}>
                      <input type="checkbox" checked={invItemDraft.hidden || false} onChange={e => setInvItemDraft(p => ({ ...p, hidden: e.target.checked }))} />
                      Hidden from players
                    </label>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => editingInvItemId ? saveEditingInvItem(tab.id) : addInvItem(tab.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                        style={NS_BTN_CONFIRM}
                      >
                        <Check size={10} /> {editingInvItemId ? "Save" : "Add"}
                      </button>
                      <button
                        onClick={() => { setAddingInvItem(false); setEditingInvItemId(null); setInvItemDraft({}); setDraftEffects([]); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                        style={NS_BTN_CANCEL}
                      >
                        <X size={10} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : null;

                return (
                <div className="space-y-4">
                  {/* Tab header with DM controls */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {renamingInvTabId === tab.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            value={renameInvTabDraft}
                            onChange={e => setRenameInvTabDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") renameInvTab(tab.id, renameInvTabDraft); if (e.key === "Escape") setRenamingInvTabId(null); }}
                            autoFocus
                            className="text-[13px] bg-transparent outline-none px-2 py-0.5 rounded"
                            style={NS_INPUT_STYLE}
                            maxLength={40}
                          />
                          <button onClick={() => renameInvTab(tab.id, renameInvTabDraft)} className="p-1 rounded hover:opacity-80" style={NS_BTN_CONFIRM}><Check size={10} /></button>
                          <button onClick={() => setRenamingInvTabId(null)} className="p-1 rounded hover:opacity-80" style={NS_BTN_CANCEL}><X size={10} /></button>
                        </div>
                      ) : (
                        sectionHeader(tab.name, <TabIcon size={12} />)
                      )}
                    </div>
                    {isDM && renamingInvTabId !== tab.id && (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => { setAddingInvGroup(true); setNewInvGroupName(""); }} className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium hover:opacity-80 transition-opacity" style={nsAccentBtn(accent)} title="Add group">
                          <Plus size={9} /> Group
                        </button>
                        <button
                          onClick={() => { setRenamingInvTabId(tab.id); setRenameInvTabDraft(tab.name); }}
                          className="p-1.5 rounded hover:opacity-80 transition-opacity"
                          style={NS_BTN_EDIT}
                          title="Rename tab"
                        >
                          <Pencil size={10} />
                        </button>
                        {invTabs.length > 1 && (
                          <button onClick={() => removeInvTab(tab.id)} className="p-1.5 rounded hover:opacity-80 transition-opacity" style={NS_BTN_DELETE} title="Delete tab">
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Add group form */}
                  {isDM && addingInvGroup && (
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={newInvGroupName}
                          onChange={e => setNewInvGroupName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { addInvGroup(tab.id); setAddingInvGroup(false); } if (e.key === "Escape") setAddingInvGroup(false); }}
                          placeholder="Group name..."
                          autoFocus
                          className="flex-1 text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_INPUT_STYLE}
                          maxLength={40}
                        />
                        <button onClick={() => { addInvGroup(tab.id); setAddingInvGroup(false); }} className="p-1.5 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}><Check size={12} /></button>
                        <button onClick={() => setAddingInvGroup(false)} className="p-1.5 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}><X size={12} /></button>
                      </div>
                    </div>
                  )}

                  {/* DM: Add item */}
                  {isDM && !addingInvItem && !editingInvItemId && (
                    <button
                      onClick={() => { setAddingInvItem(true); setInvItemDraft({ rarity: "Common", currency: "Credits", quantity: 1 }); setDraftEffects([]); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                      style={nsAccentBtn(accent)}
                    >
                      <Plus size={10} /> Add Item
                    </button>
                  )}

                  {renderItemForm()}

                  {/* Groups */}
                  {groups.map(group => {
                    const groupItems = group.itemIds.map(id => visibleItems.find(i => i.id === id)).filter(Boolean) as InvItem[];
                    if (groupItems.length === 0 && !isDM) return null;
                    return (
                      <div key={group.id} className="space-y-2">
                        <div className="flex items-center gap-2">
                          {editingInvGroupId === group.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                value={newInvGroupName}
                                onChange={e => setNewInvGroupName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") renameInvGroup(tab.id, group.id, newInvGroupName); if (e.key === "Escape") setEditingInvGroupId(null); }}
                                autoFocus
                                className="text-[11px] bg-transparent outline-none px-2 py-0.5 rounded"
                                style={NS_INPUT_STYLE}
                                maxLength={40}
                              />
                              <button onClick={() => renameInvGroup(tab.id, group.id, newInvGroupName)} className="p-0.5 rounded hover:opacity-80" style={NS_BTN_CONFIRM}><Check size={9} /></button>
                              <button onClick={() => setEditingInvGroupId(null)} className="p-0.5 rounded hover:opacity-80" style={NS_BTN_CANCEL}><X size={9} /></button>
                            </div>
                          ) : (
                            <div style={{ display: "contents" }}>
                              <span className="text-[10px] uppercase tracking-wider font-semibold" style={NS_MID}>{group.name}</span>
                              <span className="text-[9px] font-mono px-1 py-0 rounded" style={NS_BADGE_DARK}>{groupItems.length}</span>
                            </div>
                          )}
                          {isDM && editingInvGroupId !== group.id && (
                            <div className="flex items-center gap-1 ml-auto">
                              <button onClick={() => { setEditingInvGroupId(group.id); setNewInvGroupName(group.name); }} className="p-0.5 rounded hover:opacity-80" style={NS_BTN_EDIT}><Pencil size={8} /></button>
                              <button onClick={() => removeInvGroup(tab.id, group.id)} className="p-0.5 rounded hover:opacity-80" style={NS_BTN_DELETE}><Trash2 size={8} /></button>
                            </div>
                          )}
                        </div>
                        {groupItems.length > 0 ? (
                          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
                            {groupItems.map(item => renderItemCard(item))}
                          </div>
                        ) : (
                          <div className="text-[10px] px-3 py-2 rounded" style={{ ...innerPanelStyle, color: "#4A4A6A" }}>No items in this group. Use the group dropdown on items to assign them.</div>
                        )}
                      </div>
                    );
                  })}

                  {/* Ungrouped items */}
                  {ungroupedItems.length > 0 && (
                    <div className="space-y-2">
                      {groups.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider font-semibold" style={NS_MID}>Ungrouped</span>
                          <span className="text-[9px] font-mono px-1 py-0 rounded" style={NS_BADGE_DARK}>{ungroupedItems.length}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {ungroupedItems.map(item => renderItemCard(item))}
                      </div>
                    </div>
                  )}

                  {visibleItems.length === 0 && ungroupedItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Package size={28} style={NS_EMPTY_ICON} className="mb-3" />
                      <span className="text-[12px]" style={NS_DIM}>No items in this tab yet.</span>
                    </div>
                  )}
                </div>
                );
              })() : (
                <div className="flex flex-col items-center justify-center py-16">
                  <Package size={36} style={NS_EMPTY_ICON_LG} className="mb-3" />
                  <span className="text-[13px]" style={NS_DIM}>No inventory tabs yet.</span>
                  {isDM && (
                    <button
                      onClick={() => { setAddingInvTab(true); setNewInvTabName(""); setNewInvTabIcon("package"); }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-medium hover:opacity-80 transition-opacity mt-3"
                      style={nsAccentBtn(accent)}
                    >
                      <Plus size={11} /> Create First Tab
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })()}

          {activeTab === "facilities" && !selectedFacility && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                {sectionHeader("Company Facilities", <Factory size={12} />)}
                {isDM && !addingFacilityCat && (
                  <button
                    onClick={() => setAddingFacilityCat(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity flex-shrink-0 -mt-2"
                    style={nsAccentBtn(accent)}
                  >
                    <Plus size={10} />
                    Add Category
                  </button>
                )}
              </div>

              {isDM && addingFacilityCat && (
                <div style={innerPanelStyle} className="p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={newFacCatName}
                      onChange={e => setNewFacCatName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addFacCategory(); if (e.key === "Escape") { setAddingFacilityCat(false); setNewFacCatName(""); } }}
                      placeholder="Category name..."
                      autoFocus
                      className="flex-1 text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
                      style={NS_INPUT_STYLE}
                      maxLength={40}
                    />
                    <button onClick={addFacCategory} className="p-1.5 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                      <Check size={12} />
                    </button>
                    <button onClick={() => { setAddingFacilityCat(false); setNewFacCatName(""); }} className="p-1.5 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}

              {isDM && addingFacilityCatId && (
                <div style={innerAccentPanel} className="p-3 space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Plus size={10} style={nsAccentDim(accent)} />
                    <span className="text-[10px] font-semibold" style={nsAccentDim(accent)}>
                      New Facility → {facilityCats.find(c => c.id === addingFacilityCatId)?.name || ""}
                    </span>
                  </div>
                  <input
                    value={newFacName}
                    onChange={e => setNewFacName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addFacilityToCat(addingFacilityCatId); if (e.key === "Escape") { setAddingFacilityCatId(null); setNewFacName(""); setNewFacType("Facility"); } }}
                    placeholder="Facility name..."
                    autoFocus
                    className="w-full text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
                    style={NS_INPUT_STYLE}
                    maxLength={50}
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-wider" style={NS_DIM}>Type:</span>
                    {(["Facility", "Commercial", "Utility"] as FacilityType[]).map(t => {
                      const meta = FACILITY_TYPE_META[t];
                      const active = newFacType === t;
                      return (
                        <button
                          key={t}
                          onClick={() => setNewFacType(t)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all"
                          style={nsTypeToggle(active, meta.color)}
                        >
                          <meta.icon size={9} />
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => addFacilityToCat(addingFacilityCatId)} className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                      <Check size={10} />
                      Add
                    </button>
                    <button onClick={() => { setAddingFacilityCatId(null); setNewFacName(""); setNewFacType("Facility"); }} className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                      <X size={10} />
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {facilityCats.map((cat, categoryIndex) => {
                  const catFacs = cat.facilityIds.map(id => facilities.find(f => f.id === id)).filter(Boolean) as Facility[];
                  return (
                    <FacilityCategoryPanel
                      key={cat.id}
                      category={cat}
                      facilities={catFacs}
                      isDM={isDM}
                      accent={accent}
                      innerPanelStyle={innerPanelStyle}
                      panelStyle={{ ...innerPanelStyle, background: "#070709", border: "1px solid #14141F" }}
                      onToggle={() => toggleFacCatCollapse(cat.id)}
                      onRename={(name) => renameFacCat(cat.id, name)}
                      onRemoveCategory={() => removeFacCat(cat.id)}
                      onRemoveFacility={removeFacility}
                      onAddFacility={(catId) => { setAddingFacilityCatId(catId); setNewFacName(""); setNewFacType("Facility"); }}
                      onSelectFacility={(id) => setSelectedFacilityId(id)}
                      onMoveUp={() => moveFacCategory(cat.id, -1)}
                      onMoveDown={() => moveFacCategory(cat.id, 1)}
                      canMoveUp={categoryIndex > 0}
                      canMoveDown={categoryIndex < facilityCats.length - 1}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "facilities" && selectedFacility && (() => {
            const fac = selectedFacility;
            const meta = FACILITY_TYPE_META[fac.type] || FACILITY_TYPE_META.Facility;
            const owner = businessMapPlayers.find((player) => player.id === fac.ownerPlayerId);
            const ownerAccount = creditAccounts.find((account) => account.playerId === fac.ownerPlayerId);
            const canViewOwnerCredits = isDM || fac.ownerPlayerId === currentUserId;
            const liveFacilityStats = fac.baseStats ? (fac.businessMap ? calculateFacilityStats(fac.baseStats, fac.businessMap, facilityAdditions) : fac.baseStats) : null;
            const liveFacilityEconomy = liveFacilityStats ? calculateFacilityEconomy(liveFacilityStats, fac.staffCostPerPerson ?? 50) : null;

            const STATUS_OPTIONS = [
              { label: "Active", color: "#4ACA6A" },
              { label: "Inactive", color: "#6A6A8A" },
              { label: "Under Construction", color: "#CAAA3A" },
              { label: "Damaged", color: "#CA6A3A" },
              { label: "Destroyed", color: "#FF4A4A" },
              { label: "Hidden", color: "#8A6ACA" },
            ];

            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedFacilityId(null)}
                    className="p-1.5 rounded hover:opacity-80 transition-opacity"
                    style={NS_TYPE_SELECT}
                  >
                    <ArrowLeft size={12} />
                  </button>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <meta.icon size={14} style={nsIconTint(meta.color, 0.7)} />
                    <span className="text-[14px] font-semibold truncate" style={NS_BRIGHT}>{fac.name}</span>
                    <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={nsPriBadge(meta.color)}>
                      {fac.type}
                    </span>
                  </div>
                </div>

                <div style={panelStyle} className="p-5 space-y-5">
                  {/* Row 1: Name + Type + Status */}
                  <div className="flex gap-4 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <span className="text-[9px] uppercase tracking-wider font-semibold block mb-1" style={NS_DIM}>Name</span>
                      {isDM ? (
                        <input
                          value={fac.name}
                          onChange={e => editFacility(fac.id, { name: e.target.value })}
                          className="w-full text-[12px] font-semibold bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_NAME_INPUT}
                          maxLength={60}
                        />
                      ) : (
                        <p className="text-[12px] font-semibold px-0.5" style={NS_BRIGHT}>{fac.name}</p>
                      )}
                    </div>
                    <div className="min-w-[120px]">
                      <span className="text-[9px] uppercase tracking-wider font-semibold block mb-1" style={NS_DIM}>Type</span>
                      {isDM ? (
                        <div className="flex items-center gap-1">
                          {(["Facility", "Commercial", "Utility"] as FacilityType[]).map(t => {
                            const m = FACILITY_TYPE_META[t];
                            const active = fac.type === t;
                            return (
                              <button
                                key={t}
                                onClick={() => editFacility(fac.id, { type: t })}
                                className="flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-medium transition-all"
                                style={nsTypeToggle(active, m.color, "#3A3A5A")}
                              >
                                <m.icon size={8} />
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-0.5">
                          <meta.icon size={10} style={nsTextColor(meta.color)} />
                          <span className="text-[11px] font-medium" style={nsTextColor(meta.color)}>{fac.type}</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-[100px]">
                      <span className="text-[9px] uppercase tracking-wider font-semibold block mb-1" style={NS_DIM}>Status</span>
                      {isDM ? (
                        <div className="flex flex-wrap gap-1">
                          {STATUS_OPTIONS.map(s => {
                            const active = fac.status === s.label;
                            return (
                              <button
                                key={s.label}
                                onClick={() => editFacility(fac.id, { status: s.label, statusColor: s.color })}
                                className="px-1.5 py-0.5 rounded text-[8px] font-medium transition-all"
                                style={nsTypeToggle(active, s.color, "#3A3A5A")}
                              >
                                {s.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={nsPriBadge(fac.statusColor || "#4ACA6A")}>
                          {fac.status || "Active"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.55fr)]">
                    <div style={innerPanelStyle} className="p-3">
                      <div className="mb-2 flex items-center gap-1.5">
                        <Crown size={10} style={NS_ICON_GOLD_SOFT} />
                        <span className="text-[9px] font-semibold uppercase tracking-wider" style={NS_DIM}>Facility Owner</span>
                      </div>
                      {isDM ? (
                        <select
                          value={fac.ownerPlayerId || ""}
                          onChange={(event) => assignFacilityOwner(fac, event.target.value)}
                          className="w-full bg-transparent px-2 py-1.5 text-[11px] outline-none"
                          style={NS_DETAIL_SELECT}
                        >
                          <option value="">Company owned</option>
                          {businessMapPlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                        </select>
                      ) : (
                        <p className="px-0.5 text-[11px] font-medium" style={NS_MUTED}>{owner?.name || "Company owned"}</p>
                      )}
                    </div>
                    <div style={innerPanelStyle} className="p-3">
                      <div className="mb-2 flex items-center gap-1.5">
                        <Coins size={10} style={NS_ICON_GREEN_SOFT} />
                        <span className="text-[9px] font-semibold uppercase tracking-wider" style={NS_DIM}>Owner Credits</span>
                      </div>
                      <p className="font-mono text-[12px] font-semibold" style={NS_ACCENT_GREEN}>
                        {!fac.ownerPlayerId ? "Not assigned" : canViewOwnerCredits ? `${(ownerAccount?.balance || 0).toLocaleString()} CR` : "Private"}
                      </p>
                    </div>
                  </div>

                  {/* Row 2: Location + Capacity + Condition */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <MapPin size={10} style={nsIconTint("#5A9ADA", 0.7)} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Location</span>
                      </div>
                      {isDM ? (
                        <input
                          value={fac.location || ""}
                          onChange={e => editFacility(fac.id, { location: e.target.value })}
                          placeholder="Enter location..."
                          className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_DETAIL_INPUT}
                        />
                      ) : (
                        <p className="text-[11px] px-0.5" style={NS_MUTED}>{fac.location || "—"}</p>
                      )}
                    </div>
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Users size={10} style={NS_ICON_AMBER_SOFT} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Capacity</span>
                      </div>
                      {isDM ? (
                        <input
                          value={fac.capacity || ""}
                          onChange={e => editFacility(fac.id, { capacity: e.target.value })}
                          placeholder="e.g. 50 personnel"
                          className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_DETAIL_INPUT}
                        />
                      ) : (
                        <p className="text-[11px] px-0.5" style={NS_MUTED}>{fac.capacity || "—"}</p>
                      )}
                    </div>
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Wrench size={10} style={NS_ICON_MINT_SOFT} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Condition</span>
                      </div>
                      {isDM ? (
                        <input
                          value={fac.condition || ""}
                          onChange={e => editFacility(fac.id, { condition: e.target.value })}
                          placeholder="e.g. Good, Fair, Poor"
                          className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_DETAIL_INPUT}
                        />
                      ) : (
                        <p className="text-[11px] px-0.5" style={NS_MUTED}>{fac.condition || "—"}</p>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Economy summary */}
                  {liveFacilityStats && liveFacilityEconomy && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div style={innerPanelStyle} className="p-3"><div className="flex items-center gap-1.5 mb-2"><TrendingUp size={10} style={NS_ICON_GREEN_SOFT} /><span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Adjusted Revenue</span></div><p className="text-[11px] font-mono px-0.5" style={NS_ACCENT_GREEN}>{liveFacilityEconomy.adjustedRevenue.toLocaleString()} CR</p></div>
                      <div style={innerPanelStyle} className="p-3"><div className="flex items-center gap-1.5 mb-2"><TrendingDown size={10} style={NS_ICON_RED_SOFT} /><span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Upkeep + Payroll</span></div><p className="text-[11px] font-mono px-0.5" style={NS_RED}>{liveFacilityEconomy.totalMonthlyCosts.toLocaleString()} CR</p></div>
                      <button type="button" onClick={() => navigate(`/interface/nexus-nomad/facility/${encodeURIComponent(fac.id)}/finances`)} style={innerPanelStyle} className="p-3 text-left transition-colors hover:border-[#4A6A98]"><div className="flex items-center justify-between gap-2 mb-2"><span className="flex items-center gap-1.5"><Users size={10} style={NS_ICON_BLUE_SOFT} /><span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Staff Present / Required</span></span><ChevronRight size={10} style={NS_SUBDIM} /></div><p className="text-[11px] font-mono px-0.5" style={NS_BLUE}>{liveFacilityEconomy.staffPresent} / {liveFacilityStats.staffRequired}</p></button>
                    </div>
                  )}

                  {/* Row 4: Description + Notes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <BookOpen size={10} style={nsAccentHalf(accent)} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Description</span>
                      </div>
                      {isDM ? (
                        <textarea
                          value={fac.description || ""}
                          onChange={e => editFacility(fac.id, { description: e.target.value })}
                          placeholder="Describe this facility..."
                          className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded resize-y min-h-[80px]"
                          style={NS_DETAIL_INPUT}
                        />
                      ) : (
                        <p className="text-[11px] leading-relaxed px-0.5" style={NS_MUTED}>{fac.description || "—"}</p>
                      )}
                    </div>
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Scroll size={10} style={NS_ICON_GOLD_HALF} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Notes</span>
                      </div>
                      {isDM ? (
                        <textarea
                          value={fac.notes || ""}
                          onChange={e => editFacility(fac.id, { notes: e.target.value })}
                          placeholder="DM notes..."
                          className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded resize-y min-h-[80px]"
                          style={NS_DETAIL_INPUT}
                        />
                      ) : (
                        <p className="text-[11px] leading-relaxed px-0.5" style={NS_MUTED}>{fac.notes || "—"}</p>
                      )}
                    </div>
                  </div>
                </div>

                <section className="space-y-4" aria-label={`${fac.name} business map`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={NS_BORDER_SECTION}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Waypoints size={13} style={nsAccentHalf(accent)} />
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={NS_SOFT}>Facility Map</span>
                      </div>
                      <p className="mt-1 text-[9px]" style={NS_DIM}>
                        {fac.businessMap
                          ? "This layout belongs to this facility and can be edited independently."
                          : "No business map is attached to this facility."}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isDM && !fac.businessMap && (
                        <button
                          type="button"
                          onClick={() => editFacility(fac.id, { businessMap: createFacilityBusinessMap(fac.name) })}
                          className="flex items-center gap-1.5 rounded px-3 py-2 text-[10px] font-medium transition-opacity hover:opacity-80"
                          style={nsAccentBtn(accent)}
                        >
                          <Plus size={11} />
                          Add Facility Map
                        </button>
                      )}
                      {fac.businessMap && (
                        <button
                          type="button"
                          onClick={() => navigate(`/interface/nexus-nomad/facility/${encodeURIComponent(fac.id)}/map`)}
                          className="flex items-center gap-1.5 rounded px-3 py-2 text-[10px] font-medium transition-opacity hover:opacity-80"
                          style={nsAccentBtn(accent)}
                        >
                          <Waypoints size={11} />
                          Open Facility Map
                          <ChevronRight size={11} />
                        </button>
                      )}
                      {fac.businessMap && (
                        <button
                          type="button"
                          onClick={() => navigate(`/interface/nexus-nomad/facility/${encodeURIComponent(fac.id)}/finances`)}
                          className="flex items-center gap-1.5 rounded px-3 py-2 text-[10px] font-medium transition-opacity hover:opacity-80"
                          style={nsAccentBtn("#62C68D")}
                        >
                          <DollarSign size={11} />
                          Monthly Ledger
                          <ChevronRight size={11} />
                        </button>
                      )}
                      {isDM && fac.businessMap && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Remove the business map from ${fac.name}? This cannot be undone.`)) {
                              const assets = collectBusinessMapAssets(fac.businessMap!);
                              editFacility(fac.id, { businessMap: undefined });
                              assets.forEach((asset) => void deleteBusinessMapImage(asset).catch(() => undefined));
                            }
                          }}
                          className="flex items-center gap-1.5 rounded px-3 py-2 text-[9px] transition-opacity hover:opacity-80"
                          style={NS_BTN_DELETE}
                        >
                          <Trash2 size={10} />
                          Remove Map
                        </button>
                      )}
                    </div>
                  </div>

                  {fac.businessMap ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/interface/nexus-nomad/facility/${encodeURIComponent(fac.id)}/map`)}
                      className="grid w-full grid-cols-1 gap-4 border p-5 text-left transition-colors hover:border-[#5A7AAA] md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                      style={{ borderColor: "#24243A", background: "#06060A" }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold" style={NS_BRIGHT}>{fac.businessMap.name}</p>
                        <p className="mt-1 text-[9px]" style={NS_DIM}>{fac.businessMap.description || `${fac.name} facility layout`}</p>
                      </div>
                      <div className="flex items-center gap-5">
                        <div><span className="block font-mono text-[14px] font-semibold" style={NS_BLUE}>{fac.businessMap.sectors.length}</span><span className="text-[8px] uppercase tracking-wider" style={NS_DIM}>Sections</span></div>
                        <div><span className="block font-mono text-[14px] font-semibold" style={NS_ACCENT_GREEN}>{countInstalledFacilityAdditionSlots(fac.businessMap)}</span><span className="text-[8px] uppercase tracking-wider" style={NS_DIM}>Installed</span></div>
                        <ChevronRight size={16} style={nsAccentHalf(accent)} />
                      </div>
                    </button>
                  ) : (
                    <div className="flex min-h-[120px] items-center justify-center border border-dashed p-5 text-center" style={{ borderColor: "#24243A", background: "#06060A" }}>
                      <div>
                        <Waypoints size={20} className="mx-auto mb-2" style={NS_DARK} />
                        <p className="text-[10px]" style={NS_DIM}>
                          {isDM ? "Add a map to design this facility's interior." : "This facility does not have a map yet."}
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            );
          })()}

          {activeTab === "employees" && !selectedEmployee && (
            <DndProvider backend={HTML5Backend}>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  {sectionHeader("Employees", <Users size={12} />)}
                  {isDM && !addingCategory && (
                    <button
                      onClick={() => setAddingCategory(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity flex-shrink-0 -mt-2"
                      style={nsAccentBtn(accent)}
                    >
                      <Plus size={10} />
                      Add Category
                    </button>
                  )}
                </div>

                {isDM && addingCategory && (
                  <div style={innerPanelStyle} className="p-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addCategory(); if (e.key === "Escape") { setAddingCategory(false); setNewCatName(""); } }}
                        placeholder="Category name..."
                        autoFocus
                        className="flex-1 text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
                        style={NS_INPUT_STYLE}
                        maxLength={40}
                      />
                      <button onClick={addCategory} className="p-1.5 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                        <Check size={12} />
                      </button>
                      <button onClick={() => { setAddingCategory(false); setNewCatName(""); }} className="p-1.5 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {isDM && addingEmployeeCatId && (
                  <div style={innerAccentPanel} className="p-3 space-y-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Plus size={10} style={nsAccentDim(accent)} />
                      <span className="text-[10px] font-semibold" style={nsAccentDim(accent)}>
                        New Employee → {employeeCats.find(c => c.id === addingEmployeeCatId)?.name || ""}
                      </span>
                    </div>
                    <input
                      value={newEmpName}
                      onChange={e => setNewEmpName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addEmployeeToCat(addingEmployeeCatId); if (e.key === "Escape") { setAddingEmployeeCatId(null); setNewEmpName(""); setNewEmpRole(""); } }}
                      placeholder="Employee name..."
                      autoFocus
                      className="w-full text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
                      style={NS_INPUT_STYLE}
                      maxLength={50}
                    />
                    <input
                      value={newEmpRole}
                      onChange={e => setNewEmpRole(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addEmployeeToCat(addingEmployeeCatId); if (e.key === "Escape") { setAddingEmployeeCatId(null); setNewEmpName(""); setNewEmpRole(""); } }}
                      placeholder="Role (optional)..."
                      className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded"
                      style={NS_ROLE_INPUT}
                      maxLength={50}
                    />
                    <div className="flex items-center gap-2">
                      <button onClick={() => addEmployeeToCat(addingEmployeeCatId)} className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                        <Check size={10} />
                        Add
                      </button>
                      <button onClick={() => { setAddingEmployeeCatId(null); setNewEmpName(""); setNewEmpRole(""); }} className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                        <X size={10} />
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {employeeCats.map(cat => (
                    <EmployeeCategoryDrop
                      key={cat.id}
                      category={cat}
                      employees={employees}
                      isDM={isDM}
                      accent={accent}
                      innerPanelStyle={innerPanelStyle}
                      panelStyle={{ ...innerPanelStyle, background: "#070709", border: "1px solid #14141F" }}
                      onToggle={() => toggleCatCollapse(cat.id)}
                      onRename={(name) => renameCat(cat.id, name)}
                      onRemoveCategory={() => removeCat(cat.id)}
                      onDropEmployee={(empId, fromCatId) => moveEmployeeToCat(empId, fromCatId, cat.id)}
                      onRemoveEmployee={removeEmployee}
                      onEditEmployee={editEmployee}
                      onAddEmployee={(catId) => { setAddingEmployeeCatId(catId); setNewEmpName(""); setNewEmpRole(""); }}
                      onSelectEmployee={(id) => { setSelectedEmployeeId(id); setShowSavePreset(false); setShowLoadPreset(false); setShowSaveLoadout(false); setShowLoadLoadout(false); }}
                    />
                  ))}
                </div>
              </div>
            </DndProvider>
          )}

          {/* Employee Detail View */}
          {activeTab === "employees" && selectedEmployee && (() => {
            const emp = selectedEmployee;
            const equipBuffs = computeEquipBuffs(emp.equippedItems || [], invTabs);
            const equippedDetails = getEquippedItemDetails(emp.equippedItems || [], invTabs);
            const hpPct = emp.maxHp ? Math.min(100, Math.max(0, ((emp.hp || 0) / emp.maxHp) * 100)) : 0;
            const woundPct = emp.maxWounds ? Math.min(100, Math.max(0, ((emp.wounds || 0) / emp.maxWounds) * 100)) : 0;
            const numField = (label: string, field: keyof Employee, color: string, max?: number) => (
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider" style={NS_DIM}>{label}</span>
                {isDM ? (
                  <input
                    type="number"
                    value={(emp[field] as number) ?? 0}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) editEmployee(emp.id, { [field]: max !== undefined ? Math.max(0, Math.min(max, v)) : Math.max(0, v) });
                    }}
                    className="w-16 text-[12px] font-mono bg-transparent outline-none px-2 py-1 rounded text-right"
                    style={nsColorInput(color)}
                  />
                ) : (
                  <span className="text-[12px] font-mono" style={nsTextColor(color)}>{(emp[field] as number) ?? 0}</span>
                )}
              </div>
            );

            return (
              <div className="space-y-6">
                {/* Header with back button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setSelectedEmployeeId(null); setShowSavePreset(false); setShowLoadPreset(false); setShowSaveLoadout(false); setShowLoadLoadout(false); }}
                      className="p-1.5 rounded hover:opacity-80 transition-opacity"
                      style={nsAccentBtn(accent)}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <div className="flex items-center gap-2.5">
                      {emp.photo ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={nsAccentBorder(accent, "20")}>
                          <img src={emp.photo} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={nsAccentBg(accent)}>
                          <Users size={16} style={nsAccentHalf(accent)} />
                        </div>
                      )}
                      <div>
                        <span className="text-[16px] font-semibold" style={NS_BRIGHT}>{emp.name}</span>
                        <div className="text-[10px]" style={NS_MID}>{emp.role}</div>
                      </div>
                    </div>
                  </div>
                  {isDM && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => { setShowLoadPreset(!showLoadPreset); setShowSavePreset(false); setShowLoadLoadout(false); setShowSaveLoadout(false); }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                        style={NS_BTN_LOAD}
                        title="Load preset"
                      >
                        <FileDown size={10} />
                        Load Preset
                      </button>
                      <button
                        onClick={() => { setShowSavePreset(!showSavePreset); setShowLoadPreset(false); setShowLoadLoadout(false); setShowSaveLoadout(false); setPresetNameDraft(""); }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                        style={NS_BTN_CONFIRM}
                        title="Save as preset"
                      >
                        <Save size={10} />
                        Save Preset
                      </button>
                      <span className="w-px h-4" style={{ background: "#2A2A3A" }} />
                      <button
                        onClick={() => { setShowLoadLoadout(!showLoadLoadout); setShowSaveLoadout(false); setShowLoadPreset(false); setShowSavePreset(false); }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                        style={{ color: "#7A9ABB", background: "#0A1220", border: "1px solid #1A2A3A" }}
                        title="Load equipment loadout"
                      >
                        <Briefcase size={10} />
                        Load Loadout
                      </button>
                      <button
                        onClick={() => { setShowSaveLoadout(!showSaveLoadout); setShowLoadLoadout(false); setShowLoadPreset(false); setShowSavePreset(false); setLoadoutNameDraft(""); }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                        style={{ color: "#5AC0C0", background: "#0A1A1A", border: "1px solid #1A2A2A" }}
                        title="Save equipment loadout"
                      >
                        <Save size={10} />
                        Save Loadout
                      </button>
                    </div>
                  )}
                </div>

                {/* Save Preset form */}
                {isDM && showSavePreset && (
                  <div style={NS_PANEL_GREEN(innerPanelStyle)} className="p-3">
                    <div className="flex items-center gap-2">
                      <Save size={11} style={nsIconTint("#4ACA6A")} />
                      <span className="text-[10px] font-semibold" style={NS_ICON_GREEN_SOFT}>Save current stats as preset</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        value={presetNameDraft}
                        onChange={e => setPresetNameDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") savePresetFromEmployee(emp); if (e.key === "Escape") setShowSavePreset(false); }}
                        placeholder="Preset name..."
                        autoFocus
                        className="flex-1 text-[11px] bg-transparent outline-none px-2 py-1 rounded"
                        style={NS_SAVE_PRESET_BG}
                        maxLength={40}
                      />
                      <button onClick={() => savePresetFromEmployee(emp)} className="p-1 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                        <Check size={11} />
                      </button>
                      <button onClick={() => setShowSavePreset(false)} className="p-1 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Load Preset panel */}
                {isDM && showLoadPreset && (
                  <div style={NS_PANEL_BLUE(innerPanelStyle)} className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <FileDown size={11} style={NS_ICON_BLUE_DIM} />
                      <span className="text-[10px] font-semibold" style={NS_ICON_BLUE_SOFT}>Apply a preset to this employee</span>
                    </div>
                    {presets.length === 0 ? (
                      <p className="text-[10px] py-2" style={NS_SUBDIM}>No presets saved yet. Fill out an employee and save their stats as a preset.</p>
                    ) : (
                      <div className="space-y-1">
                        {presets.map(p => (
                          <div key={p.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#0A0A14] transition-colors">
                            <button
                              onClick={() => applyPresetToEmployee(emp.id, p)}
                              className="flex-1 text-left text-[11px] font-medium hover:opacity-80"
                              style={NS_SOFT}
                            >
                              {p.name}
                              <span className="text-[8px] ml-2" style={NS_DIM}>
                                HP:{p.maxHp || 0} STR:{p.strength || 0} AGI:{p.agility || 0}
                              </span>
                            </button>
                            <button onClick={() => deletePreset(p.id)} className="w-4 h-4 rounded flex items-center justify-center hover:opacity-80 transition-opacity flex-shrink-0" style={NS_RED_DARK} title="Delete preset">
                              <Trash2 size={8} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Save Loadout form */}
                {isDM && showSaveLoadout && (
                  <div style={innerPanelStyle} className="p-3">
                    <div className="flex items-center gap-2">
                      <Briefcase size={11} style={nsIconTint("#5AC0C0")} />
                      <span className="text-[10px] font-semibold" style={{ color: "#5AC0C0" }}>Save current equipment as loadout</span>
                    </div>
                    <p className="text-[9px] mt-1 mb-2" style={NS_SUBDIM}>Saves both manual equipment entries and equipped inventory items.</p>
                    <div className="flex items-center gap-2">
                      <input
                        value={loadoutNameDraft}
                        onChange={e => setLoadoutNameDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveLoadoutFromEmployee(emp); if (e.key === "Escape") setShowSaveLoadout(false); }}
                        placeholder="Loadout name..."
                        autoFocus
                        className="flex-1 text-[11px] bg-transparent outline-none px-2 py-1 rounded"
                        style={{ color: "#CCEEFF", background: "#0A1A1A", border: "1px solid #1A2A2A" }}
                        maxLength={40}
                      />
                      <button onClick={() => saveLoadoutFromEmployee(emp)} className="p-1 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                        <Check size={11} />
                      </button>
                      <button onClick={() => setShowSaveLoadout(false)} className="p-1 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Load Loadout panel */}
                {isDM && showLoadLoadout && (
                  <div style={innerPanelStyle} className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Briefcase size={11} style={NS_ICON_BLUE_DIM} />
                      <span className="text-[10px] font-semibold" style={{ color: "#7A9ABB" }}>Apply an equipment loadout</span>
                    </div>
                    {loadouts.length === 0 ? (
                      <p className="text-[10px] py-2" style={NS_SUBDIM}>No loadouts saved yet. Equip items to an employee and save their gear as a loadout.</p>
                    ) : (
                      <div className="space-y-1">
                        {loadouts.map(lo => {
                          const manualCount = lo.equipment?.length || 0;
                          const invCount = lo.equippedItems?.length || 0;
                          return (
                            <div key={lo.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#0A0A14] transition-colors">
                              <button
                                onClick={() => applyLoadoutToEmployee(emp.id, lo)}
                                className="flex-1 text-left text-[11px] font-medium hover:opacity-80"
                                style={NS_SOFT}
                              >
                                {lo.name}
                                <span className="text-[8px] ml-2" style={NS_DIM}>
                                  {invCount > 0 && `${invCount} equipped`}{invCount > 0 && manualCount > 0 && ", "}{manualCount > 0 && `${manualCount} manual`}
                                  {invCount === 0 && manualCount === 0 && "Empty"}
                                </span>
                              </button>
                              <button onClick={() => deleteLoadout(lo.id)} className="w-4 h-4 rounded flex items-center justify-center hover:opacity-80 transition-opacity flex-shrink-0" style={NS_RED_DARK} title="Delete loadout">
                                <Trash2 size={8} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  {/* Row 1: Photo + Vitals side-by-side */}
                  <div className="flex gap-4 items-stretch">
                    {/* Photo — compact */}
                    <div style={innerPanelStyle} className="p-3 flex-shrink-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <ImagePlus size={10} style={nsAccentHalf(accent)} />
                          <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Photo</span>
                        </div>
                        {emp.photo && isDM && (
                          <button
                            onClick={() => editEmployee(emp.id, { photo: undefined, photoW: undefined, photoH: undefined, photoScale: undefined, photoOffX: undefined, photoOffY: undefined })}
                            className="flex items-center gap-0.5 px-1 py-0.5 rounded hover:opacity-80 transition-opacity text-[8px]"
                            style={NS_DELETE_BTN_ALT}
                          >
                            <Trash2 size={7} />
                          </button>
                        )}
                      </div>
                      {emp.photo ? (() => {
                        const w = emp.photoW || 100;
                        const h = emp.photoH || 100;
                        const scale = emp.photoScale || 100;
                        const offX = emp.photoOffX || 0;
                        const offY = emp.photoOffY || 0;
                        return (
                          <div>
                            {isDM ? (
                              <Resizable
                                size={{ width: w, height: h }}
                                minWidth={50}
                                minHeight={50}
                                maxWidth={240}
                                maxHeight={240}
                                onResizeStop={(_e, _dir, _ref, d) => {
                                  editEmployee(emp.id, { photoW: w + d.width, photoH: h + d.height });
                                }}
                                handleStyles={{
                                  bottomRight: { cursor: "nwse-resize", width: 10, height: 10, right: -2, bottom: -2 },
                                }}
                                style={nsPortraitFrame(accent)}
                              >
                                <div
                                  style={nsPhotoDrag(photoDragging)}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setPhotoDragging(true);
                                    setPhotoDragStart({ x: e.clientX, y: e.clientY, offX, offY });
                                    const onMove = (ev: MouseEvent) => {
                                      setPhotoDragStart(prev => {
                                        if (!prev) return prev;
                                        const dx = ev.clientX - prev.x;
                                        const dy = ev.clientY - prev.y;
                                        editEmployee(emp.id, { photoOffX: prev.offX + dx, photoOffY: prev.offY + dy });
                                        return prev;
                                      });
                                    };
                                    const onUp = () => {
                                      setPhotoDragging(false);
                                      setPhotoDragStart(null);
                                      window.removeEventListener("mousemove", onMove);
                                      window.removeEventListener("mouseup", onUp);
                                    };
                                    window.addEventListener("mousemove", onMove);
                                    window.addEventListener("mouseup", onUp);
                                  }}
                                >
                                  <img
                                    src={emp.photo}
                                    alt={emp.name}
                                    draggable={false}
                                    style={nsPortraitImg(offX, offY, scale)}
                                  />
                                </div>
                                <div className="absolute bottom-0.5 right-2 flex items-center justify-center" style={NS_NO_EVENTS}>
                                  <span className="text-[6px] font-mono px-0.5 rounded" style={NS_DIM_SIZE_LABEL}>{w}×{h}</span>
                                </div>
                              </Resizable>
                            ) : (
                              <div
                                className="cursor-pointer"
                                onClick={() => setLightboxUrl(emp.photo || null)}
                                style={NS_PORTRAIT_VIEW(w, h)}
                              >
                                <img
                                  src={emp.photo}
                                  alt={emp.name}
                                  draggable={false}
                                  style={nsPortraitImg(offX, offY, scale)}
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-2 mt-1.5">
                              {isDM && (
                                <div className="flex items-center gap-1.5 flex-1">
                                  <input
                                    type="range"
                                    min={50}
                                    max={300}
                                    step={5}
                                    value={scale}
                                    onChange={e => editEmployee(emp.id, { photoScale: parseInt(e.target.value) })}
                                    className="flex-1 h-0.5 appearance-none rounded-full cursor-pointer"
                                    style={nsSliderAccent(accent)}
                                  />
                                  <span className="text-[7px] font-mono" style={NS_SUBDIM}>{scale}%</span>
                                </div>
                              )}
                              <button
                                onClick={() => setLightboxUrl(emp.photo || null)}
                                className="p-0.5 rounded hover:opacity-80 transition-opacity flex-shrink-0"
                                style={NS_MID}
                                title="View full image"
                              >
                                <Eye size={10} />
                              </button>
                              {isDM && (
                                <button
                                  onClick={() => editEmployee(emp.id, { photoScale: 100, photoOffX: 0, photoOffY: 0 })}
                                  className="p-0.5 rounded hover:opacity-80 transition-opacity flex-shrink-0"
                                  style={NS_DIM}
                                  title="Reset crop"
                                >
                                  <Crosshair size={9} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })() : isDM ? (
                        <div style={NS_MIN_W_100}>
                          <input
                            placeholder="Paste URL..."
                            className="w-full text-[10px] bg-transparent outline-none px-1.5 py-1 rounded"
                            style={NS_DETAIL_SELECT}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                const val = (e.target as HTMLInputElement).value.trim();
                                if (val) {
                                  editEmployee(emp.id, { photo: val, photoW: 100, photoH: 100, photoScale: 100, photoOffX: 0, photoOffY: 0 });
                                  (e.target as HTMLInputElement).value = "";
                                }
                              }
                            }}
                          />
                          <p className="text-[7px] mt-0.5" style={NS_DARK}>Enter to set</p>
                        </div>
                      ) : (
                        <div className="py-3 px-4 text-center">
                          <Users size={16} style={NS_PLACEHOLDER_ICON} />
                          <p className="text-[8px] mt-0.5" style={NS_DARK}>No photo</p>
                        </div>
                      )}
                    </div>

                    {/* Vitals */}
                    <div style={innerPanelStyle} className="p-3 min-w-0">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Activity size={10} style={nsIconTint("#FF6A6A", 0.7)} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Vitals</span>
                      </div>
                      <div className="space-y-2.5">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-medium" style={NS_GREEN}>HP</span>
                            <span className="text-[9px] font-mono" style={NS_GREEN}>{emp.hp ?? 0} / {emp.maxHp ?? 0}</span>
                          </div>
                          <div className="relative h-1.5 rounded-full overflow-hidden" style={NS_BAR_BG}>
                            <div className="absolute top-0 left-0 h-full rounded-full transition-all duration-300" style={nsHpBar(hpPct)} />
                          </div>
                          {isDM && (
                            <div className="flex items-center gap-2 mt-1">
                              {numField("Current", "hp", "#5ACA7A")}
                              {numField("Max", "maxHp", "#3A8A4A")}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-medium" style={NS_WARN}>Wounds</span>
                            <span className="text-[9px] font-mono" style={NS_WARN}>{emp.wounds ?? 0} / {emp.maxWounds ?? 0}</span>
                          </div>
                          <div className="relative h-1.5 rounded-full overflow-hidden" style={NS_BAR_BG}>
                            <div className="absolute top-0 left-0 h-full rounded-full transition-all duration-300" style={nsWoundBar(woundPct)} />
                          </div>
                          {isDM && (
                            <div className="flex items-center gap-2 mt-1">
                              {numField("Current", "wounds", "#FF6A6A")}
                              {numField("Max", "maxWounds", "#AA3A3A")}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Attributes — vertical 2-col grid */}
                    <div style={innerPanelStyle} className="p-3 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Award size={10} style={nsAccentHalf(accent)} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Attributes</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {STAT_KEYS.map(key => {
                          const val = (emp[key] as number) ?? 0;
                          const buff = equipBuffs[key] || 0;
                          const col = STAT_COLORS[key];
                          return (
                            <div key={key} className="flex items-center justify-between px-1.5 py-1 rounded" style={nsSubtleBox(col)}>
                              <span className="text-[8px] font-bold tracking-wider" style={nsTextColor(col)}>{STAT_LABELS[key]}</span>
                              <div className="flex items-center gap-1">
                                {isDM ? (
                                  <input
                                    type="number"
                                    value={val}
                                    onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) editEmployee(emp.id, { [key]: Math.max(0, v) }); }}
                                    className="w-9 text-[11px] font-mono font-bold bg-transparent outline-none text-right rounded"
                                    style={nsTextColor(col)}
                                  />
                                ) : (
                                  <span className="text-[11px] font-mono font-bold" style={nsTextColor(col)}>{val}</span>
                                )}
                                {buff !== 0 && (
                                  <div style={{ display: "contents" }}>
                                    <span className="text-[8px] font-mono font-bold" style={{ color: buff > 0 ? "#4ACA6A" : "#FF4A4A" }}>
                                      {buff > 0 ? "+" : ""}{buff}
                                    </span>
                                    <span className="text-[8px] font-mono" style={{ color: "#FFFFFF", opacity: 0.5 }}>=</span>
                                    <span className="text-[10px] font-mono font-bold" style={{ color: "#EEEEFF" }}>
                                      {val + buff}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Defenses — compact stat boxes */}
                    <div style={innerPanelStyle} className="p-3 flex-shrink-0">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Shield size={10} style={nsIconTint("#6A9ADA", 0.7)} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Defenses</span>
                      </div>
                      <div className="space-y-1.5">
                        {[
                          { key: "tempHp", label: "Temp HP", empVal: emp.tempHp ?? 0, col: NS_TEAL, boxStyle: NS_STAT_TEAL_BOX, empKey: "tempHp" as const },
                          { key: "armorClass", label: "AC", empVal: emp.armorClass ?? 0, col: NS_STEEL, boxStyle: NS_STAT_BLUE_BOX, empKey: "armorClass" as const },
                          { key: "damageReduction", label: "DR", empVal: emp.damageReduction ?? 0, col: NS_AMBER, boxStyle: NS_STAT_AMBER_BOX, empKey: "damageReduction" as const },
                        ].map(def => {
                          const buff = equipBuffs[def.key] || 0;
                          return (
                            <div key={def.key} className="px-2 py-1.5 rounded" style={def.boxStyle}>
                              <div className="flex items-center justify-between">
                                <span className="text-[8px] uppercase tracking-wider font-semibold" style={def.col}>{def.label}</span>
                                <div className="flex items-center gap-1">
                                  {isDM ? (
                                    <input type="number" value={def.empVal} onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) editEmployee(emp.id, { [def.empKey]: Math.max(0, v) }); }} className="w-10 text-[13px] font-mono font-bold bg-transparent outline-none text-right rounded" style={def.col} />
                                  ) : (
                                    <span className="text-[13px] font-mono font-bold" style={def.col}>{def.empVal}</span>
                                  )}
                                  {buff !== 0 && (
                                    <div style={{ display: "contents" }}>
                                      <span className="text-[8px] font-mono font-bold" style={{ color: buff > 0 ? "#4ACA6A" : "#FF4A4A" }}>{buff > 0 ? "+" : ""}{buff}</span>
                                      <span className="text-[8px] font-mono" style={{ color: "#FFFFFF", opacity: 0.5 }}>=</span>
                                      <span className="text-[11px] font-mono font-bold" style={{ color: "#EEEEFF" }}>{def.empVal + buff}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Proficiencies + Equipment side-by-side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Proficiencies */}
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Star size={10} style={NS_ICON_GOLD_DIM} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Proficiencies</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(emp.proficiencies || []).map((p, i) => (
                          <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 rounded" style={NS_GOLD_SUBTLE_BOX}>
                            <span className="text-[9px]" style={NS_GOLD}>{p}</span>
                            {isDM && (
                              <button onClick={() => editEmployee(emp.id, { proficiencies: (emp.proficiencies || []).filter((_, j) => j !== i) })} className="hover:opacity-80" style={NS_BROWN}>
                                <X size={7} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {isDM && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <input
                            value={newProficiency}
                            onChange={e => setNewProficiency(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                const v = newProficiency.trim();
                                if (v) { editEmployee(emp.id, { proficiencies: [...(emp.proficiencies || []), v] }); setNewProficiency(""); }
                              }
                            }}
                            placeholder="Add proficiency..."
                            className="flex-1 text-[9px] bg-transparent outline-none px-1.5 py-0.5 rounded"
                            style={NS_DETAIL_SELECT}
                            maxLength={40}
                          />
                          <button
                            onClick={() => {
                              const v = newProficiency.trim();
                              if (v) { editEmployee(emp.id, { proficiencies: [...(emp.proficiencies || []), v] }); setNewProficiency(""); }
                            }}
                            className="p-0.5 rounded hover:opacity-80 transition-opacity"
                            style={NS_ADD_GOLD}
                          >
                            <Plus size={9} />
                          </button>
                        </div>
                      )}
                      {(!emp.proficiencies || emp.proficiencies.length === 0) && !isDM && (
                        <p className="text-[8px]" style={NS_DARK}>None listed</p>
                      )}
                    </div>

                    {/* Equipment */}
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Briefcase size={10} style={NS_ICON_BLUE_DIM} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Equipment</span>
                      </div>

                      {/* Equipped inventory items */}
                      {equippedDetails.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {equippedDetails.map(item => (
                            <div key={item.id} className="px-2 py-1.5 rounded" style={{ background: `${INV_RARITY_COLORS[item.rarity]}08`, border: `1px solid ${INV_RARITY_COLORS[item.rarity]}25` }}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: INV_RARITY_COLORS[item.rarity] }} />
                                  <span className="text-[9px] font-medium" style={{ color: INV_RARITY_COLORS[item.rarity] }}>{item.name}</span>
                                </div>
                                {isDM && (
                                  <button
                                    onClick={() => {
                                      const ref = (emp.equippedItems || []).find(r => r.itemId === item.id);
                                      if (ref) toggleEquipItem(emp.id, ref.tabId, item.id);
                                    }}
                                    className="hover:opacity-80"
                                    style={NS_SLATE}
                                    title="Unequip"
                                  >
                                    <X size={7} />
                                  </button>
                                )}
                              </div>
                              {item.damage && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Swords size={7} style={NS_RED} />
                                  <span className="text-[8px] font-mono" style={NS_RED}>{item.damage}</span>
                                  {item.damageType && <span className="text-[7px] px-1 rounded" style={{ color: "#CC6A4A", background: "#1A0A0A" }}>{item.damageType}</span>}
                                </div>
                              )}
                              {item.effects && item.effects.length > 0 && (
                                <div className="flex flex-wrap gap-0.5 mt-0.5">
                                  {item.effects.map((eff, ei) => {
                                    const col = EFFECT_STAT_COLORS[eff.stat] || "#9AAACC";
                                    const lbl = EFFECT_STAT_OPTIONS.find(o => o.key === eff.stat)?.label || eff.stat;
                                    return (
                                      <span key={ei} className="text-[7px] font-mono px-1 rounded" style={{ color: col, background: `${col}12` }}>
                                        {eff.value > 0 ? "+" : ""}{eff.value} {lbl}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              {item.effectText && <p className="text-[7px] italic mt-0.5" style={{ color: "#AA7ADA" }}>{item.effectText}</p>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Manual equipment entries */}
                      <div className="space-y-0.5">
                        {(emp.equipment || []).map((eq, i) => (
                          <div key={i} className="flex items-center justify-between px-1.5 py-0.5 rounded" style={NS_BLUE_SUBTLE_BOX}>
                            <span className="text-[9px]" style={NS_SKY}>{eq}</span>
                            {isDM && (
                              <button onClick={() => editEmployee(emp.id, { equipment: (emp.equipment || []).filter((_, j) => j !== i) })} className="hover:opacity-80" style={NS_SLATE}>
                                <X size={7} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {isDM && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <input
                            value={newEquipment}
                            onChange={e => setNewEquipment(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                const v = newEquipment.trim();
                                if (v) { editEmployee(emp.id, { equipment: [...(emp.equipment || []), v] }); setNewEquipment(""); }
                              }
                            }}
                            placeholder="Add equipment..."
                            className="flex-1 text-[9px] bg-transparent outline-none px-1.5 py-0.5 rounded"
                            style={NS_DETAIL_SELECT}
                            maxLength={60}
                          />
                          <button
                            onClick={() => {
                              const v = newEquipment.trim();
                              if (v) { editEmployee(emp.id, { equipment: [...(emp.equipment || []), v] }); setNewEquipment(""); }
                            }}
                            className="p-0.5 rounded hover:opacity-80 transition-opacity"
                            style={NS_LOAD_PRESET_BG}
                          >
                            <Plus size={9} />
                          </button>
                        </div>
                      )}
                      {equippedDetails.length === 0 && (!emp.equipment || emp.equipment.length === 0) && !isDM && (
                        <p className="text-[8px]" style={NS_DARK}>None listed</p>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Personality + Work Info side-by-side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Personality */}
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Heart size={10} style={nsIconTint("#DA6AAA")} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Personality</span>
                      </div>
                      {isDM ? (
                        <textarea
                          value={emp.personality || ""}
                          onChange={e => editEmployee(emp.id, { personality: e.target.value })}
                          placeholder="Describe their personality..."
                          className="w-full text-[10px] bg-transparent outline-none px-2 py-1 rounded resize-none"
                          style={NS_TEXTAREA}
                          maxLength={500}
                        />
                      ) : (
                        <p className="text-[10px] leading-relaxed" style={nsHasText(!!emp.personality)}>
                          {emp.personality || "No personality notes"}
                        </p>
                      )}
                    </div>

                    {/* Work Info */}
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Briefcase size={10} style={nsAccentHalf(accent)} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Work Info</span>
                      </div>
                      {isDM ? (
                        <textarea
                          value={emp.workInfo || ""}
                          onChange={e => editEmployee(emp.id, { workInfo: e.target.value })}
                          placeholder="Duties, schedule, specialization..."
                          className="w-full text-[10px] bg-transparent outline-none px-2 py-1 rounded resize-none"
                          style={NS_TEXTAREA}
                          maxLength={500}
                        />
                      ) : (
                        <p className="text-[10px] leading-relaxed" style={nsHasText(!!emp.workInfo)}>
                          {emp.workInfo || "No work info"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {activeTab === "contracts" && !selectedContract && (
            <DndProvider backend={HTML5Backend}>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  {sectionHeader(showArchive ? "Archived Contracts" : "Contracts", <FileText size={12} />)}
                  <div className="flex items-center gap-2 -mt-2">
                    <button
                      onClick={() => setShowArchive(!showArchive)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                      style={nsToggleBtn(showArchive, accent)}
                    >
                      <Archive size={10} />
                      Archive ({contracts.filter(c => c.archived).length})
                    </button>
                    {isDM && !addingContractCat && !showArchive && (
                      <button
                        onClick={() => setAddingContractCat(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity flex-shrink-0"
                        style={nsAccentBtn(accent)}
                      >
                        <Plus size={10} />
                        Add Category
                      </button>
                    )}
                  </div>
                </div>

                {showArchive ? (
                  <div className="space-y-2">
                    {contracts.filter(c => c.archived).length === 0 ? (
                      <div style={innerPanelStyle} className="p-6 text-center">
                        <Archive size={20} style={NS_EMPTY_ICON} />
                        <p className="text-[10px]" style={NS_SUBDIM}>No archived contracts.</p>
                      </div>
                    ) : (
                      contracts.filter(c => c.archived).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0)).map(con => {
                        const priColor = PRIORITY_META[con.priority || "MEDIUM"]?.color || "#CAAA3A";
                        return (
                          <div key={con.id} style={innerPanelStyle} className="flex items-center gap-2 p-3">
                            <Archive size={11} style={NS_SUBDIM} className="flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-medium truncate" style={NS_MID2}>{con.name}</div>
                              {con.description && <p className="text-[9px] truncate mt-0.5" style={NS_SUBDIM}>{con.description}</p>}
                            </div>
                            {con.priority && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded font-semibold tracking-wider flex-shrink-0" style={NS_PRIORITY_BADGE(priColor)}>
                                {con.priority}
                              </span>
                            )}
                            <span className="text-[8px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={NS_GRAY_BADGE}>
                              {con.status || "Archived"}
                            </span>
                            {isDM && (
                              <div style={NS_DISPLAY_CONTENTS}>
                                <button
                                  onClick={() => unarchiveContract(con.id)}
                                  className="w-6 h-6 rounded flex items-center justify-center hover:opacity-80 transition-opacity flex-shrink-0"
                                  style={NS_BTN_CONFIRM}
                                  title="Restore from archive"
                                >
                                  <RotateCcw size={9} />
                                </button>
                                <button
                                  onClick={() => removeContract(con.id)}
                                  className="w-6 h-6 rounded flex items-center justify-center hover:opacity-80 transition-opacity flex-shrink-0"
                                  style={NS_BTN_DELETE}
                                  title="Delete permanently"
                                >
                                  <Trash2 size={9} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div style={NS_DISPLAY_CONTENTS}>
                    {isDM && addingContractCat && (
                      <div style={innerPanelStyle} className="p-3">
                        <div className="flex items-center gap-2">
                          <input
                            value={newConCatName}
                            onChange={e => setNewConCatName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") addConCategory(); if (e.key === "Escape") { setAddingContractCat(false); setNewConCatName(""); } }}
                            placeholder="Category name..."
                            autoFocus
                            className="flex-1 text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
                            style={NS_INPUT_STYLE}
                            maxLength={40}
                          />
                          <button onClick={addConCategory} className="p-1.5 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                            <Check size={12} />
                          </button>
                          <button onClick={() => { setAddingContractCat(false); setNewConCatName(""); }} className="p-1.5 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}

                    {isDM && addingContractCatId && (
                      <div style={innerAccentPanel} className="p-3 space-y-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Plus size={10} style={nsAccentDim(accent)} />
                          <span className="text-[10px] font-semibold" style={nsAccentDim(accent)}>
                            New Contract → {contractCats.find(c => c.id === addingContractCatId)?.name || ""}
                          </span>
                        </div>
                        <input
                          value={newConName}
                          onChange={e => setNewConName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") addContractToCat(addingContractCatId); if (e.key === "Escape") { setAddingContractCatId(null); setNewConName(""); } }}
                          placeholder="Contract name..."
                          autoFocus
                          className="w-full text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_INPUT_STYLE}
                          maxLength={50}
                        />
                        <div className="flex items-center gap-2">
                          <button onClick={() => addContractToCat(addingContractCatId)} className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_CONFIRM}>
                            <Check size={10} />
                            Add
                          </button>
                          <button onClick={() => { setAddingContractCatId(null); setNewConName(""); }} className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                            <X size={10} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {contractCats.map(cat => {
                        const catCons = cat.contractIds.map(id => contracts.find(c => c.id === id)).filter(Boolean).filter(c => !c.archived) as Contract[];
                        return (
                          <ContractCategoryPanel
                            key={cat.id}
                            category={cat}
                            contracts={catCons}
                            isDM={isDM}
                            accent={accent}
                            innerPanelStyle={innerPanelStyle}
                            panelStyle={{ ...innerPanelStyle, background: "#070709", border: "1px solid #14141F" }}
                            onToggle={() => toggleConCatCollapse(cat.id)}
                            onRename={(name) => renameConCat(cat.id, name)}
                            onRemoveCategory={() => removeConCat(cat.id)}
                            onRemoveContract={removeContract}
                            onAddContract={(catId) => { setAddingContractCatId(catId); setNewConName(""); }}
                            onSelectContract={(id) => setSelectedContractId(id)}
                            onTogglePin={toggleContractPin}
                            onDropContract={(contractId, fromCatId) => moveContractToCat(contractId, fromCatId, cat.id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </DndProvider>
          )}

          {activeTab === "contracts" && selectedContract && (() => {
            const con = selectedContract;
            const priColor = PRIORITY_META[con.priority || "MEDIUM"]?.color || "#CAAA3A";

            const STATUS_OPTIONS = [
              { label: "Active", color: "#4ACA6A" },
              { label: "Pending", color: "#CAAA3A" },
              { label: "In Progress", color: "#5A9ACA" },
              { label: "Completed", color: "#6A6A8A" },
              { label: "Failed", color: "#FF4A4A" },
              { label: "On Hold", color: "#CA8A4A" },
            ];

            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedContractId(null)}
                    className="p-1.5 rounded hover:opacity-80 transition-opacity"
                    style={NS_TYPE_SELECT}
                  >
                    <ArrowLeft size={12} />
                  </button>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText size={14} style={nsIconTint(priColor, 0.7)} />
                    <span className="text-[14px] font-semibold truncate" style={NS_BRIGHT}>{con.name}</span>
                    {con.pinned && <Pin size={10} style={NS_GOLD} />}
                  </div>
                  <button
                    onClick={() => toggleContractPin(con.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                    style={nsPinToggle(!!con.pinned)}
                  >
                    {con.pinned ? <PinOff size={10} /> : <Pin size={10} />}
                    {con.pinned ? "Unpin" : "Pin"}
                  </button>
                  {con.archived && (
                    <span className="text-[9px] px-2 py-1 rounded font-medium" style={NS_GRAY_BADGE_LG}>
                      ARCHIVED
                    </span>
                  )}
                </div>

                <div style={panelStyle} className="p-5 space-y-5">
                  {/* Row 1: Name + Priority + Status */}
                  <div className="flex gap-4 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <span className="text-[9px] uppercase tracking-wider font-semibold block mb-1" style={NS_DIM}>Name</span>
                      {isDM ? (
                        <input
                          value={con.name}
                          onChange={e => editContract(con.id, { name: e.target.value })}
                          className="w-full text-[12px] font-semibold bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_NAME_INPUT}
                          maxLength={60}
                        />
                      ) : (
                        <p className="text-[12px] font-semibold px-0.5" style={NS_BRIGHT}>{con.name}</p>
                      )}
                    </div>
                    <div className="min-w-[120px]">
                      <span className="text-[9px] uppercase tracking-wider font-semibold block mb-1" style={NS_DIM}>Priority</span>
                      {isDM ? (
                        <div className="flex items-center gap-1">
                          {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as ContractPriority[]).map(p => {
                            const pc = PRIORITY_META[p].color;
                            const active = con.priority === p;
                            return (
                              <button
                                key={p}
                                onClick={() => editContract(con.id, { priority: p })}
                                className="px-1.5 py-1 rounded text-[8px] font-semibold tracking-wider transition-all"
                                style={nsTypeToggle(active, pc, "#3A3A5A")}
                              >
                                {p}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold tracking-wider" style={nsPriBadge(priColor)}>
                          {con.priority || "MEDIUM"}
                        </span>
                      )}
                    </div>
                    <div className="min-w-[100px]">
                      <span className="text-[9px] uppercase tracking-wider font-semibold block mb-1" style={NS_DIM}>Status</span>
                      {isDM ? (
                        <div className="flex flex-wrap gap-1">
                          {STATUS_OPTIONS.map(s => {
                            const active = con.status === s.label;
                            return (
                              <button
                                key={s.label}
                                onClick={() => editContract(con.id, { status: s.label, statusColor: s.color })}
                                className="px-1.5 py-0.5 rounded text-[8px] font-medium transition-all"
                                style={nsTypeToggle(active, s.color, "#3A3A5A")}
                              >
                                {s.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={nsPriBadge(con.statusColor || "#4ACA6A")}>
                          {con.status || "Active"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Due + Client + Reward + Location */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Clock size={10} style={NS_ICON_AMBER_SOFT} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Deadline</span>
                      </div>
                      {isDM ? (
                        <input
                          value={con.due || ""}
                          onChange={e => editContract(con.id, { due: e.target.value })}
                          placeholder="e.g. 3 days"
                          className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_DETAIL_INPUT}
                        />
                      ) : (
                        <p className="text-[11px] px-0.5" style={NS_MUTED}>{con.due || "—"}</p>
                      )}
                    </div>
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Users size={10} style={NS_ICON_BLUE_SOFT} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Client</span>
                      </div>
                      {isDM ? (
                        <input
                          value={con.client || ""}
                          onChange={e => editContract(con.id, { client: e.target.value })}
                          placeholder="Client name..."
                          className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_DETAIL_INPUT}
                        />
                      ) : (
                        <p className="text-[11px] px-0.5" style={NS_MUTED}>{con.client || "—"}</p>
                      )}
                    </div>
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Gem size={10} style={NS_ICON_GOLD_SOFT} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Reward</span>
                      </div>
                      {isDM ? (
                        <input
                          value={con.reward || ""}
                          onChange={e => editContract(con.id, { reward: e.target.value })}
                          placeholder="e.g. 5,000 CR"
                          className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_DETAIL_INPUT}
                        />
                      ) : (
                        <p className="text-[11px] px-0.5" style={NS_MUTED}>{con.reward || "—"}</p>
                      )}
                    </div>
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <MapPin size={10} style={NS_ICON_MINT_SOFT} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Location</span>
                      </div>
                      {isDM ? (
                        <input
                          value={con.location || ""}
                          onChange={e => editContract(con.id, { location: e.target.value })}
                          placeholder="Location..."
                          className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded"
                          style={NS_DETAIL_INPUT}
                        />
                      ) : (
                        <p className="text-[11px] px-0.5" style={NS_MUTED}>{con.location || "—"}</p>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Description + Notes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <BookOpen size={10} style={nsAccentHalf(accent)} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Description</span>
                      </div>
                      {isDM ? (
                        <textarea
                          value={con.description || ""}
                          onChange={e => editContract(con.id, { description: e.target.value })}
                          placeholder="Describe this contract..."
                          className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded resize-y min-h-[80px]"
                          style={NS_DETAIL_INPUT}
                        />
                      ) : (
                        <p className="text-[11px] leading-relaxed px-0.5" style={NS_MUTED}>{con.description || "—"}</p>
                      )}
                    </div>
                    <div style={innerPanelStyle} className="p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Scroll size={10} style={NS_ICON_GOLD_HALF} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Notes</span>
                      </div>
                      {isDM ? (
                        <textarea
                          value={con.notes || ""}
                          onChange={e => editContract(con.id, { notes: e.target.value })}
                          placeholder="DM notes..."
                          className="w-full text-[11px] bg-transparent outline-none px-2 py-1.5 rounded resize-y min-h-[80px]"
                          style={NS_DETAIL_INPUT}
                        />
                      ) : (
                        <p className="text-[11px] leading-relaxed px-0.5" style={NS_MUTED}>{con.notes || "—"}</p>
                      )}
                    </div>
                  </div>

                  {/* Row 4: Assigned Employees */}
                  <div style={innerPanelStyle} className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5">
                        <Users size={10} style={NS_ICON_BLUE_SOFT} />
                        <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>Assigned Employees</span>
                        <span className="text-[8px] font-mono px-1 py-0.5 rounded" style={NS_BADGE}>
                          {(con.assignedEmployeeIds || []).length}
                        </span>
                      </div>
                    </div>
                    {(con.assignedEmployeeIds || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {(con.assignedEmployeeIds || []).map(empId => {
                          const emp = employees.find(e => e.id === empId);
                          if (!emp) return null;
                          return (
                            <div key={empId} className="flex items-center gap-1.5 px-2 py-1 rounded" style={NS_PANEL_BG}>
                              <Users size={8} style={nsIconTint("#5A9ACA", 0.5)} />
                              <span className="text-[10px]" style={NS_SOFT}>{emp.name}</span>
                              {emp.role && <span className="text-[8px]" style={NS_DIM}>• {emp.role}</span>}
                              {isDM && (
                                <button
                                  onClick={() => toggleAssignEmployee(con.id, empId)}
                                  className="ml-0.5 hover:opacity-80 transition-opacity"
                                  style={NS_RED_DARK}
                                  title="Remove from contract"
                                >
                                  <X size={8} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isDM && (() => {
                      const unassigned = employees.filter(e => !(con.assignedEmployeeIds || []).includes(e.id));
                      if (unassigned.length === 0) return (
                        <p className="text-[9px]" style={NS_DARK}>All employees are assigned.</p>
                      );
                      return (
                        <div>
                          <span className="text-[8px] uppercase tracking-wider block mb-1.5" style={NS_DARK}>Available:</span>
                          <div className="flex flex-wrap gap-1">
                            {unassigned.map(emp => (
                              <button
                                key={emp.id}
                                onClick={() => toggleAssignEmployee(con.id, emp.id)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:opacity-80 transition-opacity"
                                style={NS_INPUT_DARK}
                                title={`Assign ${emp.name}`}
                              >
                                <UserPlus size={8} />
                                {emp.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {!isDM && (con.assignedEmployeeIds || []).length === 0 && (
                      <p className="text-[10px]" style={NS_DARK}>No employees assigned.</p>
                    )}
                  </div>

                  {/* Archive button */}
                  {isDM && (
                    <div className="flex justify-end pt-2" style={NS_BORDER_TOP_PANEL}>
                      {con.archived ? (
                        <button
                          onClick={() => unarchiveContract(con.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                          style={NS_BTN_CONFIRM}
                        >
                          <RotateCcw size={10} />
                          Restore from Archive
                        </button>
                      ) : (
                        <button
                          onClick={() => archiveContract(con.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                          style={NS_GRAY_SELECT}
                        >
                          <Archive size={10} />
                          Archive Contract
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {activeTab === "info" && (
            <div className="space-y-6">
              {sectionHeader("Organization Info", <Info size={12} />)}

              {/* Office Description */}
              <div style={innerPanelStyle} className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lock size={11} style={nsAccentHalf(accent)} />
                  <span className="text-[11px] uppercase tracking-wider font-semibold" style={NS_MID}>Office Description</span>
                </div>
                {isDM ? (
                  editingDossier ? (
                    <div className="space-y-2">
                      <textarea
                        value={dossierDraft}
                        onChange={e => setDossierDraft(e.target.value)}
                        placeholder="Write the office description..."
                        autoFocus
                        className="w-full text-[12px] bg-transparent outline-none px-2 py-1.5 rounded resize-y min-h-[100px] leading-relaxed"
                        style={NS_DETAIL_INPUT}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { updateOfficeInfo({ dossier: dossierDraft }); setEditingDossier(false); }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                          style={NS_BTN_CONFIRM}
                        >
                          <Check size={10} /> Confirm
                        </button>
                        <button
                          onClick={() => setEditingDossier(false)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                          style={NS_BTN_CANCEL}
                        >
                          <X size={10} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[12px] leading-relaxed space-y-3 mb-3" style={NS_MUTED2}>
                        {officeInfo.dossier.split("\n\n").filter(Boolean).map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
                        {!officeInfo.dossier && <p style={NS_DIM}>No description yet. Click Edit to add one.</p>}
                      </div>
                      <button
                        onClick={() => { setDossierDraft(officeInfo.dossier); setEditingDossier(true); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                        style={NS_BTN_EDIT}
                      >
                        <Pencil size={9} /> Edit
                      </button>
                    </div>
                  )
                ) : (
                  <div className="text-[12px] leading-relaxed space-y-3" style={NS_MUTED2}>
                    {officeInfo.dossier.split("\n\n").filter(Boolean).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Core Services */}
              <div className="flex items-center justify-between">
                {sectionHeader("Core Services", <Award size={12} />)}
                {isDM && !addingService && (
                  <button
                    onClick={() => { setAddingService(true); setNewServiceName(""); setNewServiceIcon("shield"); }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity flex-shrink-0 -mt-2"
                    style={nsAccentBtn(accent)}
                  >
                    <Plus size={10} />
                    Add Service
                  </button>
                )}
              </div>

              {isDM && addingService && (
                <div style={innerAccentPanel} className="p-3 space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Plus size={10} style={nsAccentDim(accent)} />
                    <span className="text-[10px] font-semibold" style={nsAccentDim(accent)}>New Service</span>
                  </div>
                  <input
                    value={newServiceName}
                    onChange={e => setNewServiceName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newServiceName.trim()) {
                        updateOfficeInfo({ services: [...officeInfo.services, { id: `svc-${Date.now()}`, name: newServiceName.trim(), icon: newServiceIcon }] });
                        setAddingService(false);
                      }
                      if (e.key === "Escape") setAddingService(false);
                    }}
                    placeholder="Service name..."
                    autoFocus
                    className="w-full text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
                    style={NS_INPUT_STYLE}
                    maxLength={60}
                  />
                  <div>
                    <label className="text-[9px] uppercase tracking-wider block mb-1.5" style={NS_DIM}>Icon</label>
                    {renderIconPicker(newServiceIcon, setNewServiceIcon)}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        if (newServiceName.trim()) {
                          updateOfficeInfo({ services: [...officeInfo.services, { id: `svc-${Date.now()}`, name: newServiceName.trim(), icon: newServiceIcon }] });
                          setAddingService(false);
                        }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                      style={NS_BTN_CONFIRM}
                    >
                      <Check size={10} />
                      Add
                    </button>
                    <button onClick={() => setAddingService(false)} className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                      <X size={10} />
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {officeInfo.services.map((svc) => {
                  const SvcIcon = getIconComponent(svc.icon);
                  const isEditing = editingServiceId === svc.id;
                  return (
                    <div key={svc.id} style={innerPanelStyle} className="p-3 flex items-center gap-3 group">
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                        style={nsAccentTile(accent, isDM)}
                        onClick={() => { if (isDM) setPickingServiceIcon(pickingServiceIcon === svc.id ? null : svc.id); }}
                        title={isDM ? "Change icon" : undefined}
                      >
                        <SvcIcon size={11} style={nsAccentHalf(accent)} />
                      </div>
                      {isEditing && isDM ? (
                        <input
                          value={svc.name}
                          onChange={e => updateOfficeInfo({ services: officeInfo.services.map(s => s.id === svc.id ? { ...s, name: e.target.value } : s) })}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditingServiceId(null); }}
                          autoFocus
                          className="flex-1 text-[11px] bg-transparent outline-none px-1.5 py-0.5 rounded"
                          style={NS_INPUT_STYLE}
                          maxLength={60}
                        />
                      ) : (
                        <span className="flex-1 text-[11px]" style={NS_PALE}>{svc.name}</span>
                      )}
                      {isDM && !isEditing && (
                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingServiceId(svc.id)}
                            className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity"
                            style={NS_BTN_EDIT}
                            title="Rename"
                          >
                            <Pencil size={8} />
                          </button>
                          <button
                            onClick={() => updateOfficeInfo({ services: officeInfo.services.filter(s => s.id !== svc.id) })}
                            className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity"
                            style={NS_BTN_DELETE}
                            title="Remove"
                          >
                            <Trash2 size={8} />
                          </button>
                        </div>
                      )}
                      {isDM && isEditing && (
                        <button
                          onClick={() => setEditingServiceId(null)}
                          className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity flex-shrink-0"
                          style={NS_BTN_CONFIRM}
                        >
                          <Check size={9} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Icon picker popover for services */}
              {isDM && pickingServiceIcon && (
                <div style={innerAccentPanel} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase tracking-wider font-semibold" style={NS_DIM}>
                      Pick Icon for: {officeInfo.services.find(s => s.id === pickingServiceIcon)?.name}
                    </span>
                    <button onClick={() => setPickingServiceIcon(null)} className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80" style={NS_MID}>
                      <X size={10} />
                    </button>
                  </div>
                  {renderIconPicker(
                    officeInfo.services.find(s => s.id === pickingServiceIcon)?.icon || "shield",
                    (key) => {
                      updateOfficeInfo({ services: officeInfo.services.map(s => s.id === pickingServiceIcon ? { ...s, icon: key } : s) });
                      setPickingServiceIcon(null);
                    }
                  )}
                </div>
              )}

              {/* Office Contact and Location */}
              <div className="flex items-center justify-between">
                {sectionHeader("Office Contact and Location", <Zap size={12} />)}
                {isDM && !addingContact && (
                  <button
                    onClick={() => { setAddingContact(true); setNewContactLabel(""); setNewContactValue(""); }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity flex-shrink-0 -mt-2"
                    style={nsAccentBtn(accent)}
                  >
                    <Plus size={10} />
                    Add Field
                  </button>
                )}
              </div>

              {isDM && addingContact && (
                <div style={innerAccentPanel} className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={newContactLabel}
                      onChange={e => setNewContactLabel(e.target.value)}
                      placeholder="Label (e.g. Comms)..."
                      autoFocus
                      className="w-24 text-[11px] bg-transparent outline-none px-2 py-1 rounded"
                      style={NS_INPUT_STYLE}
                      maxLength={20}
                    />
                    <input
                      value={newContactValue}
                      onChange={e => setNewContactValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && newContactLabel.trim() && newContactValue.trim()) {
                          updateOfficeInfo({ contacts: [...officeInfo.contacts, { label: newContactLabel.trim(), value: newContactValue.trim(), style: "normal" }] });
                          setAddingContact(false);
                        }
                        if (e.key === "Escape") setAddingContact(false);
                      }}
                      placeholder="Value..."
                      className="flex-1 text-[11px] bg-transparent outline-none px-2 py-1 rounded"
                      style={NS_INPUT_STYLE}
                      maxLength={80}
                    />
                    <button
                      onClick={() => {
                        if (newContactLabel.trim() && newContactValue.trim()) {
                          updateOfficeInfo({ contacts: [...officeInfo.contacts, { label: newContactLabel.trim(), value: newContactValue.trim(), style: "normal" }] });
                          setAddingContact(false);
                        }
                      }}
                      className="p-1 rounded hover:opacity-80 transition-opacity"
                      style={NS_BTN_CONFIRM}
                    >
                      <Check size={11} />
                    </button>
                    <button onClick={() => setAddingContact(false)} className="p-1 rounded hover:opacity-80 transition-opacity" style={NS_BTN_CANCEL}>
                      <X size={11} />
                    </button>
                  </div>
                </div>
              )}

              <div style={innerPanelStyle} className="p-4">
                <div className="space-y-2 text-[11px]" style={NS_MID2}>
                  {officeInfo.contacts.map((ct, idx) => (
                    <div key={idx} className="flex items-center gap-2 group">
                      {isDM ? (
                        <div style={NS_DISPLAY_CONTENTS}>
                          <input
                            value={ct.label}
                            onChange={e => updateOfficeInfo({ contacts: officeInfo.contacts.map((c, i) => i === idx ? { ...c, label: e.target.value } : c) })}
                            className="text-[10px] uppercase tracking-wider w-20 flex-shrink-0 bg-transparent outline-none px-1 py-0.5 rounded"
                            style={nsColorInput("#4A4A6A")}
                            maxLength={20}
                          />
                          <input
                            value={ct.value}
                            onChange={e => updateOfficeInfo({ contacts: officeInfo.contacts.map((c, i) => i === idx ? { ...c, value: e.target.value } : c) })}
                            className="flex-1 text-[11px] bg-transparent outline-none px-1.5 py-0.5 rounded"
                            style={NS_DETAIL_INPUT}
                            maxLength={80}
                          />
                          <select
                            value={ct.style || "normal"}
                            onChange={e => updateOfficeInfo({ contacts: officeInfo.contacts.map((c, i) => i === idx ? { ...c, style: e.target.value as "mono" | "badge" | "normal" } : c) })}
                            className="text-[9px] bg-transparent outline-none px-1 py-0.5 rounded cursor-pointer"
                            style={NS_STAT_BTN}
                          >
                            <option value="normal">Normal</option>
                            <option value="mono">Mono</option>
                            <option value="badge">Badge</option>
                          </select>
                          <button
                            onClick={() => updateOfficeInfo({ contacts: officeInfo.contacts.filter((_, i) => i !== idx) })}
                            className="w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity opacity-0 group-hover:opacity-100 flex-shrink-0"
                            style={NS_RED_DARK}
                            title="Remove field"
                          >
                            <Trash2 size={8} />
                          </button>
                        </div>
                      ) : (
                        <div style={NS_DISPLAY_CONTENTS}>
                          <span className="text-[10px] uppercase tracking-wider w-20 flex-shrink-0" style={NS_DIM}>{ct.label}</span>
                          {ct.style === "mono" ? (
                            <span className="font-mono" style={NS_BLUE}>{ct.value}</span>
                          ) : ct.style === "badge" ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono" style={nsBadgeCustom(ct.badgeColor || "")}>{ct.value}</span>
                          ) : (
                            <span>{ct.value}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {officeInfo.contacts.length === 0 && (
                    <p className="text-[10px] text-center py-2" style={NS_DARK}>
                      {isDM ? "Click 'Add Field' to add contact information" : "No contact information available."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Decorative bottom edge */}
      <div className="h-px" style={nsGradientDiv(accent)} />

      {/* Lightbox modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={NS_OVERLAY_BG}
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img
              src={lightboxUrl}
              alt="Full view"
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
              style={NS_BORDER_THIN}
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -right-3 w-7 h-7 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
              style={nsFooterInput(accent)}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
