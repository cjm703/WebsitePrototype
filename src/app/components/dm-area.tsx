import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import { appStore } from "@/lib/app-store";
import { loadDMPlayers, saveDMPlayers, loadDMDeletedPlayers, saveDMDeletedPlayers, loadDMItems, saveDMItems, loadDMCards, saveDMCards, loadDMInfos, saveDMInfos, loadDMNodeTrees, saveDMNodeTrees, loadDMNotifications, saveDMNotifications, loadDMInfoSubTabs, saveDMInfoSubTabs, loadDMCustomReactions, saveDMCustomReactions, loadDMTags, saveDMTags, deleteDMPlayer, purgeDMDeletedPlayer, clearDMDeletedPlayers } from "@/lib/player-state-api";
import {
  ShieldAlert, Package, CreditCard, FileText, Users,
  Trash2, Plus, Save, X, Edit, Tag, ChevronDown, ChevronRight, Bell, Send, ArrowLeft, ArrowRight,
  Undo2, AlertTriangle, Paintbrush, Gamepad2, SmilePlus, Lock, GitBranch, CalendarDays,
  Newspaper, Copy, Zap, ChevronUp, Dices, Images, BookOpen,
} from "lucide-react";
import { DMNodeTreeBuilder, type NodeTree } from "./node-trees";
import {
  initialPlayers as sharedInitialPlayers,
  initialItemTags as sharedInitialItemTags,
  initialCardTags as sharedInitialCardTags,
  initialInfoTags as sharedInitialInfoTags,
  initialItems as sharedInitialItems,
  initialCards as sharedInitialCards,
  initialInfos as sharedInitialInfos,
  initialStatusTags as sharedInitialStatusTags,
  initialWikiTags as sharedInitialWikiTags,
} from "./initial-data";
import { readErrorLog, clearErrorLog, removeLogEntry, type ErrorLogEntry } from "./error-logger";
import { setAuthCode, verifyAuthCode, getAuthStatuses, removeAuthCode } from "./auth-utils";
import { DMArcadeManager } from "./dm-arcade-manager";
import { DMCalendarWeather } from "./dm-calendar-weather";
import { DMNewsManager } from "./dm-news-manager";
import { DMCustomizeSection } from "./dm-customize-section";
import { DMTagsSection } from "./dm-tags-section";
import { DMImageStorageSection } from "./dm-image-storage-section";
import { DMInfoManagerSection } from "./dm-area-info-panel";
import { DMCardManagerSection } from "./dm-card-manager-section";
import { DMItemManagerSection } from "./dm-item-manager-section";
import { AdventureGame } from "./adventure-game";
import { renderTypedField as renderTypedFieldShared } from "./tag-field-renderer";
import { safeGetItem, safeSetItem, safeGetJson, safeSetJson } from "./safe-storage";
import type {
  PlayerStats, PlayerData, TagField, TagDefinition,
  ManagedItem, ManagedCard, InfoFollowUp, ManagedInfo,
  DMNotification, LoginProfile,
} from "./types";
import {
  DM_PANEL, DM_TAG_BADGE, DM_OVERLAY,
  DM_BTN_SAVE, DM_BTN_CANCEL, DM_BTN_EDIT_ICON, DM_BTN_DELETE_ICON,
  DM_LOCKED_BADGE, DM_DIVIDER, DM_GOLD, DM_NAV_GREEN,
  DM_MAIN_TITLE, DM_PAGE_BG, DM_ACTION_BADGE, DM_LEVEL_BADGE,
  DM_CAT_BADGE, DM_NODE_ICON, DM_FOLLOW_UP_LEFT, DM_FOLLOW_UP_TEXT,
  DM_PANEL_ALT, DM_EFFECT_HDR, DM_EFFECT_LABEL, DM_PURPLE,
  DM_PLAYER_NAME, DM_PLAYER_CLASS, DM_DELETE_NAME, DM_AUTH_HDR,
  DM_GRAD_LINE, DM_LOG_COPY_BTN, DM_LOG_SOURCE,
  DM_ERR_MSG, DM_BORDER_B_ALT,
  dmHpColor, dmWarnColor, dmTempColor, dmOverColor, dmExhaustColor,
  dmTabStyle, dmActiveBtn, dmPlayerSelect, dmAssignDim, dmRarityBadge,
  dmLockColor, dmNotifTarget, dmErrFilterBtn, dmErrLogType,
  dmErrLogBorder, dmErrLogText, dmErrBorder,
  S_MUTED, S_DIM, S_TEXT, S_ACCENT, S_GREEN, S_RED, S_SUBTLE, S_WARN, S_GREEN_BTN,
  S_LABEL, S_SECTION_HDR, S_ACCENT_HDR, S_TEXT_BOLD, S_WARN_HDR, S_LINK, S_SAVE_BTN,
  S_BORDER_B, S_BORDER_R,
} from "./dm-styles";
import { DISPLAY_CONTENTS } from "./shared-styles";
import {
  sanitizeInfoDocumentsForLoad,
  normalizeInfoDocumentsForSave,
  type InfoSubTab as SharedInfoSubTab,
} from "./personal-files-information-utils";
import {
  getAutoMaxWeightFromCon,
  getBaseMaxWeight,
  usesAutoMaxWeight,
} from "@/lib/weight-rules";


// ========================
// Helpers
// ========================
const statMod = (val: number) => {
  const mod = Math.floor((val - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
};

const defaultStats: PlayerStats = { STR: 10, AGI: 10, CON: 10, KNOW: 10, WIS: 10, WILL: 10 };

const cfKey = (tagName: string, fieldName: string) => `${tagName}::${fieldName}`;

// Migrate legacy string assignedTo → string[] for backward compatibility
function migrateAssignedTo<T extends { assignedTo: unknown }>(items: T[]): (T & { assignedTo: string[] })[] {
  return items.map((item) => ({
    ...item,
    assignedTo: Array.isArray(item.assignedTo) ? item.assignedTo : (typeof item.assignedTo === "string" && item.assignedTo) ? [item.assignedTo] : [],
  }));
}

// Helper: format assignedTo display string
function formatOwners(assignedTo: string[], players: { id: string; name: string }[]): string {
  if (assignedTo.includes("all")) return "All Players";
  if (assignedTo.length === 0) return "Unassigned";
  return assignedTo.map((id) => players.find((p) => p.id === id)?.name || "Unknown").join(", ");
}

function getSaveError(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

const QUICK_ROLL_PREFIX = "Quick Roll::";
const QUICK_ROLL_LABEL_KEY = "Label";
const QUICK_ROLL_EXPRESSION_KEY = "Expression";
const QUICK_ROLL_POTENCY_KEY = "Potency";

interface QuickRollSlot {
  slotId: string;
  label: string;
  expression: string;
  potency: string;
}

function getQuickRollFieldKey(slotId: string, field: string) {
  return `${QUICK_ROLL_PREFIX}${slotId}::${field}`;
}

function getQuickRollSlotIds(customFields: Record<string, string>) {
  return Array.from(new Set(
    Object.keys(customFields || {})
      .filter((key) => key.startsWith(QUICK_ROLL_PREFIX))
      .map((key) => key.replace(QUICK_ROLL_PREFIX, "").split("::")[0])
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function buildQuickRollSlots(customFields: Record<string, string>): QuickRollSlot[] {
  return getQuickRollSlotIds(customFields).map((slotId) => ({
    slotId,
    label: customFields[getQuickRollFieldKey(slotId, QUICK_ROLL_LABEL_KEY)] || "",
    expression: customFields[getQuickRollFieldKey(slotId, QUICK_ROLL_EXPRESSION_KEY)] || "",
    potency: customFields[getQuickRollFieldKey(slotId, QUICK_ROLL_POTENCY_KEY)] || "",
  }));
}

function makeQuickRollSlotId(customFields: Record<string, string>) {
  const nextIndex = getQuickRollSlotIds(customFields)
    .map((slotId) => parseInt(slotId, 10))
    .reduce((highest, value) => (Number.isNaN(value) ? highest : Math.max(highest, value)), 0) + 1;
  return String(nextIndex);
}

const PLAYER_REPORT_PREFIX = "[Player Report]";

function isPlayerReportNotification(notif: DMNotification) {
  return typeof notif?.subject === "string" && notif.subject.startsWith(PLAYER_REPORT_PREFIX);
}

function extractPlayerReportName(notif: DMNotification) {
  const subjectName = (notif.subject || "").replace(PLAYER_REPORT_PREFIX, "").trim();
  if (subjectName) return subjectName;

  const submittedByMatch = (notif.message || "").match(/\[Submitted by:\s*([^\]/]+)(?:\s*\/[^\]]+)?\]/i);
  if (submittedByMatch?.[1]) return submittedByMatch[1].trim();

  return "Unknown Player";
}

function stripPlayerReportMeta(message: string) {
  return (message || "").replace(/\n\n\[Submitted by:[^\]]+\]\s*$/i, "").trim();
}

// ========================
// Initial Data (imported from shared module)
// ========================
const initialPlayers: PlayerData[] = sharedInitialPlayers;
const initialItemTags: TagDefinition[] = sharedInitialItemTags;
const initialCardTags: TagDefinition[] = sharedInitialCardTags;
const initialInfoTags: TagDefinition[] = sharedInitialInfoTags;
const initialStatusTags: TagDefinition[] = sharedInitialStatusTags;
const initialWikiTags: TagDefinition[] = sharedInitialWikiTags;
const initialItems: ManagedItem[] = sharedInitialItems;
const initialCards: ManagedCard[] = sharedInitialCards;
const initialInfos: ManagedInfo[] = sharedInitialInfos;

// ========================
// Custom Reaction Manager (embedded in DM Area)
// ========================
interface CustomReaction {
  id: string;
  emoji: string;
  label: string;
}


const INFO_SUBTAB_SORT_OPTIONS = [
  { value: "custom", label: "Manual Order" },
  { value: "title", label: "Title (A-Z)" },
  { value: "category", label: "Category" },
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
] as const;

const INFO_UNASSIGNED_FILTER = "__unassigned__";

function isValidInfoSubTabColor(value: string) {
  if (!value.trim()) return true;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

type InfoSubTab = SharedInfoSubTab & {
  id: string;
  name: string;
  order: number;
  description?: string;
  icon?: string;
  color?: string;
  parentId?: string;
  assignedTo?: string[];
  defaultDisplayMode?: "digital" | "paper" | "item:stone_tablet";
  autoAssignToOwners?: boolean;
  isDefault?: boolean;
  sortMode?: "custom" | "title" | "category" | "newest" | "oldest";
  showEmpty?: boolean;
};

function sanitizeInfoSubTabRecord(raw: Partial<InfoSubTab> | null | undefined, index: number): InfoSubTab {
  const sortMode = raw?.sortMode;
  return {
    id: typeof raw?.id === "string" && raw.id.trim() ? raw.id.trim() : `ist-recovered-${index}`,
    name: typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : `Sub-Tab ${index + 1}`,
    order: Number.isFinite(raw?.order as number) ? Number(raw?.order) : index,
    description: typeof raw?.description === "string" ? raw.description.trim() : "",
    icon: typeof raw?.icon === "string" ? raw.icon.trim() : "",
    color: typeof raw?.color === "string" && isValidInfoSubTabColor(raw.color) ? raw.color.trim() : "",
    parentId: typeof raw?.parentId === "string" ? raw.parentId.trim() : "",
    assignedTo: Array.isArray(raw?.assignedTo) ? raw.assignedTo.map((value) => String(value)).filter(Boolean) : [],
    defaultDisplayMode:
      raw?.defaultDisplayMode === "paper" || raw?.defaultDisplayMode === "item:stone_tablet"
        ? raw.defaultDisplayMode
        : "digital",
    autoAssignToOwners: typeof raw?.autoAssignToOwners === "boolean" ? raw.autoAssignToOwners : true,
    isDefault: !!raw?.isDefault,
    sortMode: sortMode === "title" || sortMode === "category" || sortMode === "newest" || sortMode === "oldest" ? sortMode : "custom",
    showEmpty: !!raw?.showEmpty,
  };
}

function sanitizeInfoSubTabsForLoad(rawTabs: Partial<InfoSubTab>[] | null | undefined) {
  const seenIds = new Set<string>();
  const sanitized = (Array.isArray(rawTabs) ? rawTabs : []).map((tab, index) => sanitizeInfoSubTabRecord(tab, index)).filter((tab) => {
    if (seenIds.has(tab.id)) return false;
    seenIds.add(tab.id);
    return true;
  });

  const normalized = sanitized
    .sort((a, b) => a.order - b.order)
    .map((tab, index) => ({ ...tab, order: index }));

  let foundDefault = false;
  const withSingleDefault = normalized.map((tab, index) => {
    if (tab.isDefault && !foundDefault) {
      foundDefault = true;
      return { ...tab, order: index, isDefault: true };
    }
    return { ...tab, order: index, isDefault: false };
  });

  if (withSingleDefault.length > 0 && !withSingleDefault.some((tab) => tab.isDefault)) {
    withSingleDefault[0] = { ...withSingleDefault[0], isDefault: true };
  }

  return withSingleDefault;
}

const BUILTIN_EMOJI_PREVIEW = [
  { emoji: "👍", label: "Thumbs Up" },
  { emoji: "❤️", label: "Heart" },
  { emoji: "😂", label: "Laugh" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "💀", label: "Skull" },
  { emoji: "⚔️", label: "Swords" },
  { emoji: "🎲", label: "Dice" },
  { emoji: "🐉", label: "Dragon" },
  { emoji: "🛡️", label: "Shield" },
  { emoji: "✨", label: "Sparkles" },
];

function DMReactionManager({
  reactions,
  onSave,
  inputClass,
  inputStyle,
  labelStyle,
}: {
  reactions: CustomReaction[];
  onSave: (next: CustomReaction[]) => Promise<void>;
  inputClass: string;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}) {
  const [newEmoji, setNewEmoji] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editEmoji, setEditEmoji] = useState("");
  const [editLabel, setEditLabel] = useState("");

  const startEdit = (r: CustomReaction) => {
    setEditId(r.id);
    setEditEmoji(r.emoji);
    setEditLabel(r.label);
  };

  const addReaction = async () => {
    const emoji = newEmoji.trim();
    const label = newLabel.trim();
    if (!emoji || !label) return;

    const id = `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const updated = [...reactions, { id, emoji, label }];
    await onSave(updated);

    setNewEmoji("");
    setNewLabel("");
  };

  const removeReaction = async (id: string) => {
    const updated = reactions.filter((r) => r.id !== id);
    await onSave(updated);
  };

  const saveEdit = async () => {
    if (!editId) return;
    const updated = reactions.map((r) =>
      r.id === editId
        ? {
            ...r,
            emoji: editEmoji.trim() || r.emoji,
            label: editLabel.trim() || r.label,
          }
        : r
    );
    await onSave(updated);
    setEditId(null);
  };

  return (
    <div style={DISPLAY_CONTENTS}>
      <div className="flex items-center gap-3 mb-6">
        <SmilePlus size={20} style={S_ACCENT} />
        <h2 className="text-[18px] font-bold" style={S_ACCENT}>Chat Reactions Manager</h2>
      </div>
      <div className="text-[11px] mb-4" style={S_MUTED}>
        Manage custom emoji reactions for the Community chat. Built-in reactions are always available. Custom reactions you create here will appear alongside them for all players.
      </div>

      {/* Built-in reactions preview */}
      <div className="mb-6">
        <div className="text-[12px] font-semibold mb-2" style={S_SUBTLE}>Built-in Reactions (always available)</div>
        <div className="flex flex-wrap gap-2">
          {BUILTIN_EMOJI_PREVIEW.map(e => (
            <div key={e.label} className="flex items-center gap-1.5 px-2 py-1" style={DM_PANEL}>
              <span className="text-[16px]">{e.emoji}</span>
              <span className="text-[10px]" style={S_MUTED}>{e.label}</span>
            </div>
          ))}
        </div>
        <div className="text-[10px] mt-2" style={S_DIM}>
          Plus 5 sticker reactions from the sticker catalog (Fancy Man, Gnarpy, etc.)
        </div>
      </div>

      {/* Custom reactions */}
      <div className="mb-4">
        <div className="text-[12px] font-semibold mb-2" style={S_SUBTLE}>Custom Reactions ({reactions.length})</div>
        {reactions.length === 0 && (
          <div className="text-[11px] py-3 text-center" style={{ ...DM_PANEL, ...S_DIM }}>
            No custom reactions yet. Add one below!
          </div>
        )}
        {reactions.map(r => (
          <div key={r.id} className="flex items-center gap-3 py-2 px-3 mb-1" style={DM_PANEL}>
            {editId === r.id ? (
              <div style={DISPLAY_CONTENTS}>
                <input
                  type="text"
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value)}
                  className={inputClass}
                  style={{ ...inputStyle, width: 60, flexShrink: 0 }}
                  maxLength={4}
                />
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className={inputClass}
                  style={{ ...inputStyle, flex: 1 }}
                  maxLength={32}
                  onKeyDown={async (e) => { if (e.key === "Enter") saveEdit(); }}
                />
                <button onClick={saveEdit} className="text-[11px] px-2 py-1" style={DM_BTN_SAVE}>Save</button>
                <button onClick={() => setEditId(null)} className="text-[11px] px-2 py-1" style={DM_BTN_CANCEL}>Cancel</button>
              </div>
            ) : (
              <div style={DISPLAY_CONTENTS}>
                <span className="text-[20px]">{r.emoji}</span>
                <span className="text-[12px] flex-1" style={S_TEXT}>{r.label}</span>
                <button onClick={() => startEdit(r)} className="text-[11px] px-2 py-1 hover:bg-[#FFFFFF08]" style={DM_BTN_EDIT_ICON}>
                  <Edit size={12} />
                </button>
                <button onClick={() => removeReaction(r.id)} className="text-[11px] px-2 py-1 hover:bg-[#FFFFFF08]" style={DM_BTN_DELETE_ICON}>
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new */}
      <div className="p-3" style={DM_PANEL}>
        <div className="text-[11px] font-semibold mb-2" style={S_SUBTLE}>Add Custom Reaction</div>
        <div className="flex items-center gap-2">
          <div className="shrink-0">
            <div className="text-[9px] mb-1" style={labelStyle}>Emoji</div>
            <input
              type="text"
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value)}
              placeholder="🎉"
              className={inputClass}
              style={{ ...inputStyle, width: 60 }}
              maxLength={4}
            />
          </div>
          <div className="flex-1">
            <div className="text-[9px] mb-1" style={labelStyle}>Label</div>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Celebration"
              className={inputClass}
              style={inputStyle}
              maxLength={32}
              onKeyDown={async (e) => { if (e.key === "Enter") addReaction(); }}
            />
          </div>
          <div className="shrink-0 pt-3.5">
            <button
              onClick={addReaction}
              disabled={!newEmoji.trim() || !newLabel.trim()}
              className="px-4 py-2 text-[12px] flex items-center gap-1.5"
              style={{
                background: (newEmoji.trim() && newLabel.trim()) ? "#1A2A5A" : "#0E0E30",
                color: (newEmoji.trim() && newLabel.trim()) ? "#4A7BFF" : "#3A4A6A",
                border: (newEmoji.trim() && newLabel.trim()) ? "1px solid #2A3A6A" : "1px solid #1A1A3B",
                cursor: (newEmoji.trim() && newLabel.trim()) ? "pointer" : "default",
              }}
            >
              <Plus size={12} /> Add
            </button>
          </div>
        </div>
        <div className="text-[9px] mt-2" style={S_DIM}>
          Enter any emoji character and a short label. These will appear in the Community chat reaction picker for all players.
        </div>
      </div>
    </div>
  );
}

// ========================
// Component
// ========================
type SectionId =
  | "players"
  | "items"
  | "cards"
  | "images"
  | "info"
  | "tags"
  | "notifs"
  | "news"
  | "customize"
  | "calendar"
  | "arcade"
  | "adventure"
  | "reactions"
  | "nodetrees";

const DM_INPUT_CLASS = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;
const DM_LABEL_STYLE = S_MUTED;
const DM_INPUT_STYLE = S_TEXT;


const DM_SECTIONS = [
  { id: "players" as const, label: "Players", icon: Users },
  { id: "items" as const, label: "Manage Items", icon: Package },
  { id: "cards" as const, label: "Manage Cards", icon: CreditCard },
  { id: "images" as const, label: "Image Storage", icon: Images },
  { id: "nodetrees" as const, label: "Node Trees", icon: GitBranch },
  { id: "info" as const, label: "Manage Info", icon: FileText },
  { id: "notifs" as const, label: "Notifications", icon: Bell },
  { id: "news" as const, label: "Manage News", icon: Newspaper },
  { id: "tags" as const, label: "Manage Tags", icon: Tag },
  { id: "customize" as const, label: "Customization Editing", icon: Paintbrush },
  { id: "calendar" as const, label: "Calendar & Weather", icon: CalendarDays },
  { id: "arcade" as const, label: "Arcade Manager", icon: Gamepad2 },
  { id: "adventure" as const, label: "Adventure Creator", icon: Dices },
  { id: "reactions" as const, label: "Chat Reactions", icon: SmilePlus },
] as const;

export function DMArea() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SectionId>("players");
  const [itemFilterTab, setItemFilterTab] = useState<string>("all"); // "all" | "ownerless" | player.id

  // Players
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [editingPlayer, setEditingPlayer] = useState<PlayerData | null>(null);
  const [isAddingNewPlayer, setIsAddingNewPlayer] = useState(false);

  // Recently deleted players (reversible)
  const [deletedPlayers, setDeletedPlayers] = useState<PlayerData[]>([]);

  // Deletion flow state machine: null → "confirm1" → "confirm2" → deleted
  const [deleteTarget, setDeleteTarget] = useState<PlayerData | null>(null);
  const [deleteStep, setDeleteStep] = useState<"confirm1" | "confirm2" | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState(false);

  // Pending auth code: plain-text value the DM is typing (never persisted)
  const [pendingAuthCode, setPendingAuthCode] = useState("");

  // Server-side auth code status: profileId → hasCode
  const [hasAuthCodeMap, setHasAuthCodeMap] = useState<Record<string, boolean>>({});

  // Tags
  const [itemTags, setItemTags] = useState<TagDefinition[]>([]);
  const [cardTags, setCardTags] = useState<TagDefinition[]>([]);
  const [infoTags, setInfoTags] = useState<TagDefinition[]>([]);
  const [statusTags, setStatusTags] = useState<TagDefinition[]>([]);
  const [wikiTags, setWikiTags] = useState<TagDefinition[]>([]);


  // Info
  const [followUpInfoId, setFollowUpInfoId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");

  // Info Sub-Tabs (DM-managed)
  const [infoSubTabs, setInfoSubTabs] = useState<InfoSubTab[]>([]);
  const [newInfoSubTabName, setNewInfoSubTabName] = useState("");
  const [infoManagerSubTabFilter, setInfoManagerSubTabFilter] = useState<string>("all");
  const [infoBulkAssignTarget, setInfoBulkAssignTarget] = useState<string>("");
  const [infoBulkSelection, setInfoBulkSelection] = useState<Record<string, boolean>>({});
  const [editingItem, setEditingItem] = useState<ManagedItem | null>(null);
  const [isAddingNewItem, setIsAddingNewItem] = useState(false);
  const [editingInfoSubTabId, setEditingInfoSubTabId] = useState<string | null>(null);
  const [editingInfoSubTabName, setEditingInfoSubTabName] = useState("");
  const [managedItems, setManagedItems] = useState<ManagedItem[]>([]);
  const [managedCards, setManagedCards] = useState<ManagedCard[]>([]);
  const [managedInfos, setManagedInfos] = useState<ManagedInfo[]>([]);
  const [editingInfo, setEditingInfo] = useState<ManagedInfo | null>(null);
  const [isAddingNewInfo, setIsAddingNewInfo] = useState(false);
  const [dmLoading, setDmLoading] = useState(true);
  const [dmError, setDmError] = useState<string | null>(null);
  const [dmNotifications, setDmNotifications] = useState<DMNotification[]>([]);
  const [editingNotif, setEditingNotif] = useState<DMNotification | null>(null);
  const [isAddingNewNotif, setIsAddingNewNotif] = useState(false);
  const [reactions, setReactions] = useState<CustomReaction[]>([]);
  const [nodeTrees, setNodeTrees] = useState<NodeTree[]>([]);


  // Notifications (DM-created)
  const [notifPlayerSelection, setNotifPlayerSelection] = useState<Record<string, boolean>>({});
  const [notifAllPlayers, setNotifAllPlayers] = useState(true);


useEffect(() => {
  let cancelled = false;

  async function loadDmState() {
    try {
      const [
        playersData,
        deletedPlayersData,
        itemTagData,
        cardTagData,
        infoTagData,
        statusTagData,
        wikiTagData,
        itemsData,
        cardsData,
        infosData,
        infoSubTabData,
        notificationData,
        reactionData,
        nodeTreeData,
      ] = await Promise.all([
        loadDMPlayers() as Promise<PlayerData[]>,
        loadDMDeletedPlayers() as Promise<PlayerData[]>,
        loadDMTags<TagDefinition>("item"),
        loadDMTags<TagDefinition>("card"),
        loadDMTags<TagDefinition>("info"),
        loadDMTags<TagDefinition>("status"),
        loadDMTags<TagDefinition>("wiki"),
        loadDMItems() as Promise<ManagedItem[]>,
        loadDMCards() as Promise<ManagedCard[]>,
        loadDMInfos() as Promise<ManagedInfo[]>,
        loadDMInfoSubTabs() as Promise<InfoSubTab[]>,
        loadDMNotifications() as Promise<DMNotification[]>,
        loadDMCustomReactions() as Promise<CustomReaction[]>,
        loadDMNodeTrees() as Promise<NodeTree[]>,
      ]);

      if (cancelled) return;

      setPlayers(playersData);
      setDeletedPlayers(deletedPlayersData.filter((p) => p.id !== "dm"));
      setItemTags(itemTagData.length ? itemTagData : initialItemTags);
      setCardTags(cardTagData.length ? cardTagData : initialCardTags);
      setInfoTags(infoTagData.length ? infoTagData : initialInfoTags);
      setStatusTags(statusTagData.length ? statusTagData : initialStatusTags);
      setWikiTags(wikiTagData.length ? wikiTagData : initialWikiTags);
      const nextManagedItems = itemsData.length ? itemsData : migrateAssignedTo(initialItems as ManagedItem[]);
      const nextManagedCards = cardsData.length ? cardsData : migrateAssignedTo(initialCards as ManagedCard[]);
      const rawManagedInfos = infosData.length ? infosData : migrateAssignedTo(initialInfos as ManagedInfo[]);
      const normalizedInfoSubTabs = sanitizeInfoSubTabsForLoad(infoSubTabData);
      const normalizedManagedInfos = sanitizeInfoDocumentsForLoad(rawManagedInfos, normalizedInfoSubTabs) as ManagedInfo[];

      setManagedItems(nextManagedItems);
      setManagedCards(nextManagedCards);
      setManagedInfos(normalizedManagedInfos);
      setInfoSubTabs(normalizedInfoSubTabs);
      setDmNotifications(notificationData);
      setNodeTrees(nodeTreeData);
      setReactions(reactionData);

      const subTabsChanged = JSON.stringify(normalizedInfoSubTabs) !== JSON.stringify(infoSubTabData ?? []);
      const infosChanged = JSON.stringify(normalizedManagedInfos) !== JSON.stringify(rawManagedInfos);

      if (subTabsChanged) {
        try {
          await saveDMInfoSubTabs(normalizedInfoSubTabs as unknown as Record<string, unknown>[]);
        } catch (repairErr) {
          console.warn("Failed to repair info sub-tabs during DM load", repairErr);
        }
      }

      if (infosChanged) {
        try {
          await saveDMInfos(normalizedManagedInfos as unknown as Record<string, unknown>[]);
        } catch (repairErr) {
          console.warn("Failed to repair info entries during DM load", repairErr);
        }
      }
    } catch (err) {
      if (!cancelled) {
        setDmError(err instanceof Error ? err.message : "Failed to load DM data");
      }
    } finally {
      if (!cancelled) {
        setDmLoading(false);
      }
    }
  }


  loadDmState();
  return () => {
    cancelled = true;
  };
}, []);

async function persistPlayers(next: PlayerData[]) {
  try {
    setDmError(null);
    await saveDMPlayers(next as unknown as Record<string, unknown>[]);
    setPlayers(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save players"));
    throw err;
  }
}

async function persistDeletedPlayers(next: PlayerData[]) {
  try {
    setDmError(null);
    await saveDMDeletedPlayers(next as unknown as Record<string, unknown>[]);
    setDeletedPlayers(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save deleted players"));
    throw err;
  }
}

async function persistItems(next: ManagedItem[]) {
  try {
    setDmError(null);
    await saveDMItems(next as unknown as Record<string, unknown>[]);
    setManagedItems(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save items"));
    throw err;
  }
}

async function persistCards(next: ManagedCard[]) {
  try {
    setDmError(null);
    await saveDMCards(next as unknown as Record<string, unknown>[]);
    setManagedCards(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save cards"));
    throw err;
  }
}

async function persistNodeTrees(next: NodeTree[]) {
  try {
    setDmError(null);
    await saveDMNodeTrees(next as unknown as Record<string, unknown>[]);
    setNodeTrees(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save node trees"));
    throw err;
  }
}

async function persistInfos(next: ManagedInfo[]) {
  try {
    setDmError(null);
    const normalizedNext = normalizeInfoDocumentsForSave(
      next as unknown as Record<string, unknown>[],
      infoSubTabs,
    ) as ManagedInfo[];
    await saveDMInfos(normalizedNext as unknown as Record<string, unknown>[]);
    setManagedInfos(normalizedNext);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save info"));
    throw err;
  }
}

async function persistNotifications(next: DMNotification[]) {
  try {
    setDmError(null);
    await saveDMNotifications(next as unknown as Record<string, unknown>[]);
    setDmNotifications(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save notifications"));
    throw err;
  }
}

async function persistInfoSubTabs(next: InfoSubTab[]) {
  try {
    setDmError(null);
    await saveDMInfoSubTabs(next as unknown as Record<string, unknown>[]);
    setInfoSubTabs(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save info sub-tabs"));
    throw err;
  }
}

function normalizeInfoSubTabs(next: InfoSubTab[]) {
  return [...next]
    .sort((a, b) => a.order - b.order)
    .map((tab, index) => ({
      ...tab,
      order: index,
    }));
}

function ensureSingleDefaultInfoSubTab(next: InfoSubTab[]) {
  const sorted = normalizeInfoSubTabs(next);
  if (sorted.length === 0) return sorted;

  let foundDefault = false;
  const normalized = sorted.map((tab, index) => {
    if (tab.isDefault && !foundDefault) {
      foundDefault = true;
      return { ...tab, order: index, isDefault: true };
    }

    return { ...tab, order: index, isDefault: false };
  });

  if (!normalized.some((tab) => tab.isDefault)) {
    normalized[0] = { ...normalized[0], isDefault: true };
  }

  return normalized;
}

function getInfoSubTabNameError(name: string, currentId?: string | null) {
  const trimmed = name.trim();
  if (!trimmed) return "Sub-tab name is required.";

  const duplicate = infoSubTabs.some(
    (tab) => tab.id !== currentId && tab.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) return "Sub-tab names must be unique.";

  return "";
}

function getInfoSubTabColorError(color?: string) {
  if (!isValidInfoSubTabColor(color || "")) {
    return "Accent color must be blank or a valid hex value like #4A7BFF.";
  }

  return "";
}

function normalizeInfoSubTabDraft(tab: InfoSubTab): InfoSubTab {
  return {
    ...tab,
    description: (tab.description || "").trim(),
    icon: (tab.icon || "").trim(),
    color: (tab.color || "").trim(),
    sortMode: tab.sortMode || "custom",
    showEmpty: !!tab.showEmpty,
  };
}

async function moveInfoSubTab(tabId: string, direction: -1 | 1) {
  const sorted = [...infoSubTabs].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= sorted.length) return;

  const next = [...sorted];
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);

  await persistInfoSubTabs(ensureSingleDefaultInfoSubTab(next));
}

async function deleteInfoSubTab(tabId: string) {
  const cleanedInfos = managedInfos.map((info) =>
    info.infoSubTab === tabId
      ? { ...info, infoSubTab: "" }
      : info
  );

  const remainingTabs = infoSubTabs.filter((tab) => tab.id !== tabId);
  const nextTabs = ensureSingleDefaultInfoSubTab(remainingTabs);

  await persistInfos(cleanedInfos);
  await persistInfoSubTabs(nextTabs);

  if (editingInfo?.infoSubTab === tabId) {
    setEditingInfo({ ...editingInfo, infoSubTab: "" });
  }

  if (editingInfoSubTabId === tabId) {
    setEditingInfoSubTabId(null);
    setEditingInfoSubTabName("");
  }

  if (infoManagerSubTabFilter === tabId) {
    setInfoManagerSubTabFilter("all");
  }

  if (infoBulkAssignTarget === tabId) {
    setInfoBulkAssignTarget("");
  }
}

async function persistTags(
  kind: "item" | "card" | "info" | "status" | "wiki",
  next: TagDefinition[],
) {
  try {
    setDmError(null);
    await saveDMTags(kind, next as unknown as Record<string, unknown>[]);

    if (kind === "item") setItemTags(next);
    if (kind === "card") setCardTags(next);
    if (kind === "info") setInfoTags(next);
    if (kind === "status") setStatusTags(next);
    if (kind === "wiki") setWikiTags(next);
  } catch (err) {
    setDmError(getSaveError(err, `Failed to save ${kind} tags`));
    throw err;
  }
}

async function persistCustomReactions(next: CustomReaction[]) {
  try {
    setDmError(null);
    await saveDMCustomReactions(next as unknown as Record<string, unknown>[]);
    setReactions(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save custom reactions"));
    throw err;
  }
}

  useEffect(() => {
    if (!editingInfo?.infoSubTab) return;

    const exists = infoSubTabs.some((tab) => tab.id === editingInfo.infoSubTab);
    if (!exists) {
      setEditingInfo((prev) => (prev ? { ...prev, infoSubTab: "" } : prev));
    }
  }, [editingInfo?.infoSubTab, infoSubTabs]);

  useEffect(() => {
    if (infoManagerSubTabFilter === "all" || infoManagerSubTabFilter === INFO_UNASSIGNED_FILTER) return;
    if (infoSubTabs.some((tab) => tab.id === infoManagerSubTabFilter)) return;
    setInfoManagerSubTabFilter("all");
  }, [infoManagerSubTabFilter, infoSubTabs]);

  useEffect(() => {
    if (!infoBulkAssignTarget) return;
    if (infoSubTabs.some((tab) => tab.id === infoBulkAssignTarget)) return;
    setInfoBulkAssignTarget("");
  }, [infoBulkAssignTarget, infoSubTabs]);

  useEffect(() => {
    setInfoBulkSelection((prev) => {
      const validIds = new Set(managedInfos.map((info) => info.id));
      let changed = false;
      const next: Record<string, boolean> = {};

      Object.entries(prev).forEach(([id, checked]) => {
        if (checked && validIds.has(id)) {
          next[id] = true;
        } else if (checked) {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [managedInfos]);


  // Error & report log (read from localStorage)
  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>(() => readErrorLog());
  const [errorLogFilter, setErrorLogFilter] = useState<"all" | "error" | "report">("all");


  // Reload error log on focus
  useEffect(() => {
    const onFocus = () => setErrorLog(readErrorLog());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleClearErrorLog = useCallback(async () => {
    clearErrorLog();
    setErrorLog([]);

    const nextNotifications = dmNotifications.filter((notif) => !isPlayerReportNotification(notif));
    if (nextNotifications.length !== dmNotifications.length) {
      try {
        await persistNotifications(nextNotifications);
      } catch (err) {
        console.error("Failed to clear remote player reports", err);
      }
    }
  }, [dmNotifications]);

  const handleRemoveLogEntry = useCallback(async (id: string) => {
    if (id.startsWith("remote-report:")) {
      const notificationId = id.replace("remote-report:", "");
      const nextNotifications = dmNotifications.filter((notif) => notif.id !== notificationId);
      try {
        await persistNotifications(nextNotifications);
      } catch (err) {
        console.error("Failed to remove remote player report", err);
      }
      return;
    }

    removeLogEntry(id);
    setErrorLog((prev) => prev.filter((e) => e.id !== id));
  }, [dmNotifications]);

  const reportNotifications = useMemo(
    () => dmNotifications.filter(isPlayerReportNotification),
    [dmNotifications],
  );

  const visibleDmNotifications = useMemo(
    () => dmNotifications.filter((notif) => !isPlayerReportNotification(notif)),
    [dmNotifications],
  );

  const combinedErrorLog = useMemo<ErrorLogEntry[]>(() => {
    const remoteReportEntries: ErrorLogEntry[] = reportNotifications.map((notif) => ({
      id: `remote-report:${notif.id}`,
      type: "report",
      timestamp: notif.createdAt || "",
      player: extractPlayerReportName(notif),
      message: stripPlayerReportMeta(notif.message || ""),
      source: "Interface Report",
    }));

    const merged = [...remoteReportEntries, ...errorLog];
    return merged.sort((a, b) => {
      const at = Date.parse(a.timestamp || "") || 0;
      const bt = Date.parse(b.timestamp || "") || 0;
      return bt - at;
    });
  }, [errorLog, reportNotifications]);

  const filteredErrorLog = useMemo(
    () => combinedErrorLog.filter((e) => errorLogFilter === "all" || e.type === errorLogFilter),
    [combinedErrorLog, errorLogFilter],
  );


  // ---- Style helpers (module-level constants to avoid re-creating each render) ----
  const labelStyle = DM_LABEL_STYLE;
  const inputClass = DM_INPUT_CLASS;
  const inputStyle = DM_INPUT_STYLE;

  const renderTypedField = (
    cfKey: string,
    fieldDef: TagField,
    value: string,
    onChange: (key: string, val: string) => void,
    labelEl: React.ReactNode,
  ): React.ReactNode => renderTypedFieldShared(cfKey, fieldDef, value, onChange, labelEl, inputClass, inputStyle, retro.button);

  const sections = DM_SECTIONS;

  // ========================
  // Profile sync: write player profiles + DM to localStorage for login page
  // ========================
  const syncProfilesToLocalStorage = useCallback((playerList: PlayerData[]) => {
    const profiles: LoginProfile[] = playerList.map((p) => ({
      id: p.id,
      name: p.name,
      description: `${p.class} · Level ${p.level}`,
    }));
    // Always include the DM profile (auth codes live on server, not here)
    profiles.push({ id: "dm", name: "DM", description: "System Administrator · Full Access" });
    safeSetJson("inet-profiles", profiles);
  }, []);

  // On mount: migrate any legacy plain-text auth codes to the server, then sync profiles
  useEffect(() => {
    if (dmLoading) return;

    (async () => {
      const ids = players.map((p) => p.id);
      if (ids.length === 0) {
        setHasAuthCodeMap({});
        syncProfilesToLocalStorage(players);
        return;
      }

      try {
        const statuses = await getAuthStatuses(ids);
        setHasAuthCodeMap(statuses);
      } catch (err) {
        console.error("Failed to fetch auth statuses:", err);
      }

      syncProfilesToLocalStorage(players);
    })();
  }, [dmLoading, players, syncProfilesToLocalStorage]);


  // ========================
  // Player handlers
  // ========================
  const handleAddPlayer = () => {
    setEditingPlayer({
      id: `player-${Date.now()}`, name: "New Agent", race: "", class: "Operative", level: 1, tp: 0, hpIncreasePerLevel: "",
      stats: { ...defaultStats }, currentHP: 10, maxHP: 10, armorClass: 10,
      speed: "30 ft", woundDice: "1d6", currentWounds: 0, totalWounds: 3,
      damageReduction: 0, tempHP: 0, currentWeight: 0, maxWeight: getAutoMaxWeightFromCon(defaultStats.CON), autoMaxWeight: true, insanityPoints: 0, inspirationPoints: 0, foresight: false, exhaustion: 0, maxExhaustion: 6,
      authCode: "",
    });
    setIsAddingNewPlayer(true);
  };
  const handleSavePlayer = async () => {
    if (!editingPlayer) return;

    if (pendingAuthCode) {
      try {
        setDmError(null);
        await setAuthCode(editingPlayer.id, pendingAuthCode);
        setHasAuthCodeMap((prev) => ({ ...prev, [editingPlayer.id]: true }));
      } catch (err) {
        setDmError(getSaveError(err, "Failed to save authorization code"));
        return;
      }
    }

    const playerToSave = {
      ...editingPlayer,
      maxWeight: usesAutoMaxWeight(editingPlayer)
        ? getAutoMaxWeightFromCon(editingPlayer.stats?.CON ?? defaultStats.CON)
        : editingPlayer.maxWeight,
      authCode: "",
    };
    const updated = isAddingNewPlayer
      ? [...players, playerToSave]
      : players.map((p) => (p.id === playerToSave.id ? playerToSave : p));

    await persistPlayers(updated);
    syncProfilesToLocalStorage(updated);

    setEditingPlayer(null);
    setIsAddingNewPlayer(false);
    setPendingAuthCode("");
  };
  // Step 1: initiate deletion and show the first confirm modal.
  const initiateDeletePlayer = (player: PlayerData) => {
    setDeleteTarget(player);
    setDeleteStep("confirm1");
    setDeletePassword("");
    setDeletePasswordError(false);
  };
  // Step 2: First confirm → advance to password screen
  const advanceDeleteStep = () => {
    setDeleteStep("confirm2");
    setDeletePassword("");
    setDeletePasswordError(false);
  };
  // Step 3: Verify password via server and soft-delete (move to recently deleted)
  const confirmDeletePlayer = async () => {
    try {
      const result = await verifyAuthCode("dm", deletePassword);
      if (!result.valid) {
        setDeletePasswordError(true);
        return;
      }

      try {
        if (result.sessionToken) safeSetItem("inet-session-token", result.sessionToken);
        safeSetItem("inet-user-id", result.playerId ?? "dm");
        safeSetItem("inet-user", "DM");
      } catch {}
    } catch (err) {
      console.error("DM auth verification error:", err);
      setDeletePasswordError(true);
      return;
    }

    if (!deleteTarget) return;

    try {
      await deleteDMPlayer(deleteTarget.id);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to delete player"));
      return;
    }

    const nextDeleted = [...deletedPlayers.filter((p) => p.id !== "dm"), deleteTarget];
    const updatedPlayers = players.filter((p) => p.id !== deleteTarget.id);

    setDeletedPlayers(nextDeleted);
    setPlayers(updatedPlayers);
    syncProfilesToLocalStorage(updatedPlayers);

    if (editingPlayer?.id === deleteTarget.id) {
      setEditingPlayer(null);
      setIsAddingNewPlayer(false);
    }

    cancelDelete();
  };
  // Cancel deletion flow
  const cancelDelete = () => {
    setDeleteTarget(null);
    setDeleteStep(null);
    setDeletePassword("");
    setDeletePasswordError(false);
  };
  // Restore a recently deleted player
  const restoreDeletedPlayer = async (id: string) => {
    const player = deletedPlayers.find((p) => p.id === id);
    if (!player) return;

    const updatedDeleted = deletedPlayers.filter((p) => p.id !== id);
    const updatedPlayers = [...players, player];

    await persistDeletedPlayers(updatedDeleted);
    await persistPlayers(updatedPlayers);
    syncProfilesToLocalStorage(updatedPlayers);
  };
  // Permanently remove a single recently deleted player (also remove server-side auth code)
  const permanentlyDeletePlayer = async (id: string) => {
    try {
      setDmError(null);
      await removeAuthCode(id);

      setHasAuthCodeMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      await purgeDMDeletedPlayer(id);
      const nextDeleted = deletedPlayers.filter((p) => p.id !== id && p.id !== "dm");
      setDeletedPlayers(nextDeleted);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to permanently delete player"));
    }
  };
  // Clear all recently deleted
  const clearAllDeletedPlayers = async () => {
    try {
      setDmError(null);
      await clearDMDeletedPlayers();
      setDeletedPlayers([]);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to clear deleted players"));
    }
  };
  const handleCancelPlayerEdit = () => { setEditingPlayer(null); setIsAddingNewPlayer(false); setPendingAuthCode(""); };
  const updatePlayerField = <K extends keyof PlayerData>(key: K, value: PlayerData[K]) => {
    if (editingPlayer) setEditingPlayer({ ...editingPlayer, [key]: value });
  };
  const updatePlayerStat = (stat: keyof PlayerStats, value: number) => {
    if (!editingPlayer) return;
    const stats = editingPlayer.stats ?? defaultStats;
    setEditingPlayer({ ...editingPlayer, stats: { ...stats, [stat]: value } });
  };

  // ========================
  // Item handlers
  // ========================
  const originalAssignedToRef = useRef<string[]>([]);
  const handleAddItem = () => {
    setEditingItem({
      id: `mi-${Date.now()}`, name: "", rarity: "Common", type: "",
      tags: [], description: "", assignedTo: [], customFields: {},
    });
    originalAssignedToRef.current = [];
    setIsAddingNewItem(true);
  };
const handleSaveItem = async () => {
  if (!editingItem) return;

  if (isAddingNewItem) {
    await persistItems([...managedItems, editingItem]);
  } else {
    const originalPlayers = originalAssignedToRef.current;
    const resolveIds = (arr: string[]) =>
      arr.includes("all") ? players.map((p) => p.id) : arr;

    const oldIds = new Set(resolveIds(originalPlayers));
    const newIds = resolveIds(editingItem.assignedTo);
    const newlyAdded = newIds.filter((id) => !oldIds.has(id));

    let updated = managedItems.map((i) => (i.id === editingItem.id ? editingItem : i));

    for (const playerId of newlyAdded) {
      const duplicate: ManagedItem = {
        ...editingItem,
        id: `mi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        assignedTo: [playerId],
        customFields: { ...editingItem.customFields },
        duplicatedFrom: editingItem.name || "Unknown Item",
      };
      updated = [...updated, duplicate];
    }

    if (newlyAdded.length > 0) {
      const newlyAddedSet = new Set(newlyAdded);
      updated = updated.map((i) => {
        if (i.id === editingItem.id) {
          const kept = editingItem.assignedTo.includes("all")
            ? resolveIds(editingItem.assignedTo).filter((id) => !newlyAddedSet.has(id))
            : editingItem.assignedTo.filter((id) => !newlyAddedSet.has(id));
          return { ...i, assignedTo: kept };
        }
        return i;
      });
    }

    await persistItems(updated);
  }

  setEditingItem(null);
  setIsAddingNewItem(false);
};
  const handleDeleteItem = async (id: string) => {
    const next = managedItems.filter((i) => i.id !== id);
    await persistItems(next);

    if (editingItem?.id === id) {
      setEditingItem(null);
      setIsAddingNewItem(false);
    }
  };
  const handleCancelItemEdit = () => { setEditingItem(null); setIsAddingNewItem(false); };
  const updateItemField = <K extends keyof ManagedItem>(key: K, value: ManagedItem[K]) => {
    if (editingItem) setEditingItem({ ...editingItem, [key]: value });
  };
  const toggleItemTag = (tagName: string) => {
    if (!editingItem) return;
    const has = editingItem.tags.includes(tagName);
    updateItemField("tags", has ? editingItem.tags.filter((t) => t !== tagName) : [...editingItem.tags, tagName]);
  };
  const updateItemCustomField = (key: string, value: string) => {
    if (!editingItem) return;
    setEditingItem({ ...editingItem, customFields: { ...editingItem.customFields, [key]: value } });
  };

  const addItemQuickRollSlot = () => {
    if (!editingItem) return;
    const nextCustomFields = { ...editingItem.customFields };
    const slotId = makeQuickRollSlotId(nextCustomFields);
    nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_LABEL_KEY)] = "Damage";
    nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_EXPRESSION_KEY)] = "";
    nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_POTENCY_KEY)] = "";
    setEditingItem({ ...editingItem, customFields: nextCustomFields });
  };

  const removeItemQuickRollSlot = (slotId: string) => {
    if (!editingItem) return;
    const nextCustomFields = { ...editingItem.customFields };
    delete nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_LABEL_KEY)];
    delete nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_EXPRESSION_KEY)];
    delete nextCustomFields[getQuickRollFieldKey(slotId, QUICK_ROLL_POTENCY_KEY)];
    setEditingItem({ ...editingItem, customFields: nextCustomFields });
  };

  // Collect active custom fields based on tags for any entity with tags+customFields
  const getActiveCustomFields = (entity: { tags: string[] }, tagList: TagDefinition[]): { tagName: string; fieldName: string; key: string; fieldDef: TagField }[] => {
    const fields: { tagName: string; fieldName: string; key: string; fieldDef: TagField }[] = [];
    entity.tags.forEach((tagName) => {
      const tagDef = tagList.find((t) => t.name === tagName);
      if (tagDef && tagDef.fields.length > 0) {
        tagDef.fields.forEach((f) => {
          fields.push({ tagName, fieldName: f.name, key: cfKey(tagName, f.name), fieldDef: f });
        });
      }
    });
    return fields;
  };

  // ========================
  // Info handlers
  // ========================
  const handleAddInfo = () => {
    setEditingInfo({
      id: `mn-${Date.now()}`,
      title: "",
      tags: [],
      content: "",
      assignedTo: ["all"],
      customFields: {},
      category: "",
      followUps: [],
      inWorldTime: "",
      realWorldTime: "",
      infoSubTab: "",
      displayMode: "digital",
      displayData: { variant: "default" },
    } as ManagedInfo);
    setIsAddingNewInfo(true);
  };
  const handleSaveInfo = async () => {
    if (!editingInfo) return;

    const savedInfo = normalizeInfoDocumentsForSave(
      [
        {
          ...editingInfo,
          title: String(editingInfo.title || "").trim(),
          lastEditedAt: new Date().toISOString(),
        } as unknown as Record<string, unknown>,
      ],
      infoSubTabs,
    )[0] as ManagedInfo;

    const updated = isAddingNewInfo
      ? [...managedInfos, savedInfo]
      : managedInfos.map((i) => (i.id === savedInfo.id ? savedInfo : i));

    await persistInfos(updated);
    setEditingInfo(null);
    setIsAddingNewInfo(false);
  };
  const handleDeleteInfo = async (id: string) => {
    const next = managedInfos.filter((n) => n.id !== id);
    await persistInfos(next);

    if (editingInfo?.id === id) {
      setEditingInfo(null);
      setIsAddingNewInfo(false);
    }
  };
  const handleCancelInfoEdit = () => { setEditingInfo(null); setIsAddingNewInfo(false); };
  const updateInfoField = <K extends keyof ManagedInfo>(key: K, value: ManagedInfo[K]) => {
    if (editingInfo) setEditingInfo({ ...editingInfo, [key]: value });
  };
  const toggleInfoTag = (tagName: string) => {
    if (!editingInfo) return;
    const has = editingInfo.tags.includes(tagName);
    updateInfoField("tags", has ? editingInfo.tags.filter((t) => t !== tagName) : [...editingInfo.tags, tagName]);
  };
  const updateInfoCustomField = (key: string, value: string) => {
    if (!editingInfo) return;
    setEditingInfo({ ...editingInfo, customFields: { ...editingInfo.customFields, [key]: value } });
  };

  // ========================
  // Notification handlers
  // ========================
  const handleStartAddNotif = () => {
    setEditingNotif({
      id: `notif-${Date.now()}`, subject: "", message: "", assignedTo: [], createdAt: "",
    });
    setNotifAllPlayers(true);
    setNotifPlayerSelection({});
    setIsAddingNewNotif(true);
  };

  const handleSaveNotif = async () => {
    if (!editingNotif || !editingNotif.subject.trim()) return;
    const assignedTo: string[] = notifAllPlayers
      ? ["ALL"]
      : players.filter((p) => notifPlayerSelection[p.id]).map((p) => p.name);
    if (!notifAllPlayers && assignedTo.length === 0) return;

    const now = new Date();
    const ts = `${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;

    const finalNotif: DMNotification = {
      ...editingNotif,
      assignedTo,
      createdAt: isAddingNewNotif ? ts : editingNotif.createdAt,
    };

    const next = isAddingNewNotif
      ? [finalNotif, ...dmNotifications]
      : dmNotifications.map((n) => (n.id === finalNotif.id ? finalNotif : n));

    await persistNotifications(next);
    setEditingNotif(null);
    setIsAddingNewNotif(false);
  };

  const handleDeleteNotif = async (id: string) => {
    const next = dmNotifications.filter((n) => n.id !== id);
    await persistNotifications(next);

    if (editingNotif?.id === id) {
      setEditingNotif(null);
      setIsAddingNewNotif(false);
    }
  };

  const handleCancelNotifEdit = () => { setEditingNotif(null); setIsAddingNewNotif(false); };

  const handleEditNotif = (notif: DMNotification) => {
    setEditingNotif({ ...notif });
    const isAll = notif.assignedTo.includes("ALL");
    setNotifAllPlayers(isAll);
    if (isAll) {
      setNotifPlayerSelection({});
    } else {
      const sel: Record<string, boolean> = {};
      players.forEach((p) => { sel[p.id] = notif.assignedTo.includes(p.name); });
      setNotifPlayerSelection(sel);
    }
    setIsAddingNewNotif(false);
  };

  // ========================
  // Rarity helpers
  // ========================
  const rarities = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
  const rarityColor = (r: string) => {
    switch (r) {
      case "Uncommon": return "#7ACA8A";
      case "Rare": return "#4A9AFF";
      case "Very Rare": return "#C4A0FF";
      case "Legendary": return "#FFAA4A";
      default: return "#9AAACC";
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ ...DM_PAGE_BG, fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif" }}
    >
      {/* Top toolbar */}
      <div className={`${retro.toolbar} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/interface")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={S_ACCENT}>
            <ArrowLeft size={12} />
            Back
          </button>
          <span className="text-[11px]" style={S_DIM}>|</span>
          <span className="text-[11px]" style={S_RED}>DM AREA - RESTRICTED</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/interface/wiki-studio")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={S_ACCENT}>
            <BookOpen size={12} />
            Wiki Studio
          </button>
          <button onClick={() => navigate("/interface/game")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={DM_NAV_GREEN}>
            <Gamepad2 size={12} />
            Arcade
          </button>
          <span className="text-[11px]" style={S_DIM}>Sunday, February 22, 2026</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 py-6 xl:px-6 2xl:px-10 max-w-[1900px] mx-auto w-full">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <ShieldAlert size={32} style={S_RED} />
              <h1
                className="text-[32px] tracking-tight"
                style={DM_MAIN_TITLE}
              >
                Dungeon Master Area
              </h1>
            </div>
            <p className="text-[12px]" style={S_LABEL}>Campaign management and player content administration</p>
          </div>
          <button
            onClick={() => navigate("/interface/wiki-studio")}
            className={`${retro.raised} px-4 py-3 text-left hover:bg-[#1E1E58] transition-colors flex items-center gap-3`}
            style={{ color: "#CFE0FF", background: "#121D46", borderColor: "#31578A" }}
          >
            <div className={`${retro.sunken} p-2`} style={{ background: "#081129" }}>
              <BookOpen size={18} style={S_ACCENT} />
            </div>
            <div>
              <div className="text-[12px] font-bold" style={S_ACCENT}>Open Wiki Studio</div>
              <div className="text-[10px]" style={S_LABEL}>Create, organize, and edit I-Net Wiki articles.</div>
            </div>
            <ArrowRight size={14} style={S_ACCENT} />
          </button>
        </div>

        {/* Nav Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={async () => { setActiveSection(s.id); setEditingPlayer(null); setIsAddingNewPlayer(false); setEditingItem(null); setIsAddingNewItem(false); setEditingInfo(null); setIsAddingNewInfo(false); setEditingNotif(null); setIsAddingNewNotif(false); }}
                className={`${activeSection === s.id ? retro.sunken + " bg-[#0E0E35]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-5 py-2 text-[13px] flex items-center gap-2 transition-colors`}
                style={dmTabStyle(activeSection === s.id)}
              >
                <Icon size={14} />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className={`${retro.raised} bg-[#0E0E35] p-6 flex-1`}>
          {dmLoading && (
            <div className="text-[12px] mb-3" style={S_MUTED}>
              Loading DM data...
            </div>
          )}

          {dmError && (
            <div className="text-[12px] mb-3" style={S_RED}>
              {dmError}
            </div>
          )}

          {/* ======================================================= */}
          {/* PLAYERS                                                  */}
          {/* ======================================================= */}
          {activeSection === "players" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px]" style={S_ACCENT_HDR}>Player Management</h2>
                <button onClick={handleAddPlayer} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                  <Plus size={14} /> Add Player
                </button>
              </div>

              {editingPlayer && (
                <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[12px]" style={S_SECTION_HDR}>
                      {isAddingNewPlayer ? "ADD NEW PLAYER" : `EDITING: ${editingPlayer.name}`}
                    </div>
                    <button onClick={handleCancelPlayerEdit} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Name:</label>
                      <input type="text" value={editingPlayer.name} onChange={(e) => updatePlayerField("name", e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Race:</label>
                      <input type="text" value={editingPlayer.race || ""} onChange={(e) => updatePlayerField("race", e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Class:</label>
                      <input type="text" value={editingPlayer.class} onChange={(e) => updatePlayerField("class", e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Level:</label>
                      <input type="number" value={editingPlayer.level} onChange={(e) => updatePlayerField("level", Math.max(1, parseInt(e.target.value) || 1))} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>HP Increase per Level:</label>
                      <input type="text" value={editingPlayer.hpIncreasePerLevel || ""} onChange={(e) => updatePlayerField("hpIncreasePerLevel", e.target.value)} placeholder="e.g. +8 or 1d8 + CON" className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Wound Dice:</label>
                      <input type="text" value={editingPlayer.woundDice} onChange={(e) => updatePlayerField("woundDice", e.target.value)} placeholder="e.g. 1d6" className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>TP:</label>
                      <input type="number" value={editingPlayer.tp ?? 0} onChange={(e) => updatePlayerField("tp", Math.max(0, parseInt(e.target.value) || 0))} className={inputClass} style={inputStyle} />
                    </div>
                    <div className={`${retro.sunken} bg-[#0A0A28] px-3 py-2`}>
                      <label className="text-[10px] block mb-2" style={labelStyle}>Weight Capacity Rule:</label>
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={usesAutoMaxWeight(editingPlayer)}
                          onChange={(e) => updatePlayerField("autoMaxWeight", e.target.checked)}
                          className="accent-[#4A9A5A]"
                        />
                        <span className="text-[11px]" style={S_TEXT}>Auto-calculate from Constitution</span>
                      </label>
                      <div className="text-[9px]" style={S_MUTED}>
                        Auto rule: 50 base + 5 per point above 10 CON. Current auto result: {getAutoMaxWeightFromCon(editingPlayer.stats?.CON ?? defaultStats.CON)}.
                      </div>
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="text-[10px] mb-2" style={labelStyle}>ATTRIBUTES:</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {(Object.keys(editingPlayer.stats ?? defaultStats) as (keyof PlayerStats)[]).map((stat) => (
                        <div key={stat}>
                          <label className="text-[10px] block mb-1" style={S_ACCENT_HDR}>{stat}</label>
                          <input type="number" value={(editingPlayer.stats ?? defaultStats)[stat]} onChange={(e) => updatePlayerStat(stat, Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))} className={`${retro.sunken} bg-[#0A0A28] px-2 py-2 text-[13px] w-full outline-none text-center`} style={inputStyle} />
                          <div className="text-[9px] text-center mt-0.5" style={S_MUTED}>MOD: {statMod((editingPlayer.stats ?? defaultStats)[stat])}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="text-[10px] mb-2" style={labelStyle}>RESOURCES:</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {([
                        { key: "currentHP" as const, label: "Current HP", type: "number" },
                        { key: "maxHP" as const, label: "Max HP", type: "number" },
                        { key: "armorClass" as const, label: "Armor Class", type: "number" },
                        { key: "speed" as const, label: "Speed", type: "text" },
                        { key: "totalWounds" as const, label: "Total Wounds", type: "number" },
                        { key: "damageReduction" as const, label: "Damage Reduction", type: "number" },
                        { key: "tempHP" as const, label: "Temp HP", type: "number" },
                        { key: "currentWeight" as const, label: "Current Weight", type: "number" },
                        { key: "exhaustion" as const, label: "Exhaustion", type: "number" },
                        { key: "maxExhaustion" as const, label: "Max Exhaustion", type: "number" },
                      ] as const).map((f) => (
                        <div key={f.key}>
                          <label className="text-[10px] block mb-1" style={labelStyle}>{f.label}:</label>
                          <input
                            type={f.type}
                            value={editingPlayer[f.key]}
                            onChange={(e) => {
                              if (f.type === "number") updatePlayerField(f.key, Math.max(0, parseInt(e.target.value) || 0) as any);
                              else updatePlayerField(f.key, e.target.value as any);
                            }}
                            className={inputClass} style={inputStyle}
                          />
                        </div>
                      ))}
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Max Weight:</label>
                        <input
                          type="number"
                          value={usesAutoMaxWeight(editingPlayer) ? getAutoMaxWeightFromCon(editingPlayer.stats?.CON ?? defaultStats.CON) : editingPlayer.maxWeight}
                          disabled={usesAutoMaxWeight(editingPlayer)}
                          onChange={(e) => updatePlayerField("maxWeight", Math.max(0, parseInt(e.target.value) || 0))}
                          className={inputClass}
                          style={{ ...inputStyle, ...(usesAutoMaxWeight(editingPlayer) ? { opacity: 0.65 } : null) }}
                        />
                      </div>
                    </div>
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await handleSavePlayer();
                    }}
                  >
                    {/* Authorization Code */}
                    <div className="mb-4">
                      <label className="text-[10px] block mb-1" style={labelStyle}>
                        {hasAuthCodeMap[editingPlayer.id] ? "Change Authorization Code:" : "Set Authorization Code (for Login):"}
                      </label>
                      <input
                        type="password"
                        value={pendingAuthCode}
                        onChange={(e) => setPendingAuthCode(e.target.value)}
                        placeholder={hasAuthCodeMap[editingPlayer.id] ? "Enter new code to change..." : "Set login authorization code..."}
                        className={inputClass}
                        style={inputStyle}
                        autoComplete="off"
                      />
                      <div className="text-[9px] mt-1" style={S_DIM}>
                        {hasAuthCodeMap[editingPlayer.id]
                          ? "A code is set on the server. Leave blank to keep it, or type a new one to replace."
                          : "Players will use this code to log in. Stored securely on the server."}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button type="submit" className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                        <Save size={14} /> {isAddingNewPlayer ? "Add Player" : "Save Changes"}
                      </button>
                      <button type="button" onClick={handleCancelPlayerEdit} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
                    </div>
                  </form>
                </div>
              )}

              <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                <div className="text-[12px] mb-3" style={S_SECTION_HDR}>REGISTERED PLAYERS ({players.length})</div>
                {players.length === 0 ? (
                  <div className="text-[12px] text-center py-6" style={S_MUTED}>No players registered.</div>
                ) : (
                  <div className="space-y-3">
                    {players.map((player) => (
                      <div key={player.id} className={`${retro.raised} bg-[#0E0E35] p-4`}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="text-[14px] mb-0.5" style={S_TEXT_BOLD}>{player.name}</div>
                            <div className="text-[11px]" style={S_MUTED}>
                              {(player.race || "").trim() ? `${player.race} | ` : ""}{player.class} | Level {player.level}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingPlayer({
                                  damageReduction: 0,
                                  tempHP: 0,
                                  currentWeight: 0,
                                  maxWeight: getBaseMaxWeight(player),
                                  autoMaxWeight: usesAutoMaxWeight(player),
                                  insanityPoints: 0,
                                  inspirationPoints: 0,
                                  foresight: false,
                                  exhaustion: 0,
                                  maxExhaustion: 6,
                                  race: "",
                                  tp: 0,
                                  hpIncreasePerLevel: "",
                                  ...player,
                                });
                                setIsAddingNewPlayer(false);
                              }}
                              className={`${retro.button} px-3 py-1 text-[11px]`}
                              style={S_ACCENT}
                            >
                              <Edit size={12} className="inline mr-1" />
                              Edit
                            </button>

                            <button
                              onClick={() => {
                                initiateDeletePlayer(player);
                              }}
                              className={`${retro.button} px-3 py-1 text-[11px]`}
                              style={S_RED}
                            >
                              <Trash2 size={12} className="inline mr-1" />
                              Remove
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
                          {(Object.keys(player.stats ?? defaultStats) as (keyof PlayerStats)[]).map((stat) => (
                            <div key={stat} className="text-center">
                              <div className="text-[9px]" style={S_ACCENT_HDR}>{stat}</div>
                              <div className="text-[13px]" style={S_TEXT}>{(player.stats ?? defaultStats)[stat]} ({statMod((player.stats ?? defaultStats)[stat])})</div>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                          <div><div className="text-[9px]" style={S_MUTED}>HP</div><div className="text-[12px]" style={dmHpColor(player.currentHP, player.maxHP)}>{player.currentHP}/{player.maxHP}</div></div>
                          <div><div className="text-[9px]" style={S_MUTED}>AC</div><div className="text-[12px]" style={S_TEXT}>{player.armorClass}</div></div>
                          <div><div className="text-[9px]" style={S_MUTED}>Speed</div><div className="text-[12px]" style={S_TEXT}>{player.speed}</div></div>
                          <div><div className="text-[9px]" style={S_MUTED}>Wound Dice</div><div className="text-[12px]" style={S_TEXT}>{player.woundDice}</div></div>
                          <div><div className="text-[9px]" style={S_MUTED}>Wounds</div><div className="text-[12px]" style={dmWarnColor(player.currentWounds)}>{player.currentWounds}/{player.totalWounds}</div></div>
                          <div><div className="text-[9px]" style={S_MUTED}>DR</div><div className="text-[12px]" style={S_TEXT}>{player.damageReduction ?? 0}</div></div>
                          <div><div className="text-[9px]" style={S_MUTED}>Temp HP</div><div className="text-[12px]" style={dmTempColor(player.tempHP ?? 0)}>{player.tempHP ?? 0}</div></div>
                          <div><div className="text-[9px]" style={S_MUTED}>Weight</div><div className="text-[12px]" style={dmOverColor(player.currentWeight ?? 0, getBaseMaxWeight(player))}>{player.currentWeight ?? 0}/{getBaseMaxWeight(player)}</div></div>
                          <div><div className="text-[9px]" style={S_MUTED}>Exhaustion</div><div className="text-[12px]" style={dmExhaustColor(player.exhaustion ?? 0)}>{player.exhaustion ?? 0}/{player.maxExhaustion ?? 6}</div></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recently Deleted Players */}
              {deletedPlayers.length > 0 && (
                <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[12px]" style={S_WARN_HDR}>
                      <AlertTriangle size={12} className="inline mr-1" />
                      RECENTLY DELETED ({deletedPlayers.length})
                    </div>
                    <button
                      onClick={clearAllDeletedPlayers}
                      className={`${retro.button} px-3 py-1 text-[10px]`}
                      style={S_RED}
                    >
                      <Trash2 size={10} className="inline mr-1" />Clear All Permanently
                    </button>
                  </div>
                  <div className="text-[10px] mb-3" style={S_MUTED}>
                    These players can be restored until cleared. Clearing is permanent and irreversible.
                  </div>
                  <div className="space-y-2">
                    {deletedPlayers.map((player) => (
                      <div key={player.id} className={`${retro.raised} bg-[#12122E] p-3 flex items-center justify-between`}>
                        <div>
                          <div className="text-[13px]" style={DM_PLAYER_NAME}>{player.name}</div>
                          <div className="text-[10px]" style={DM_PLAYER_CLASS}>{player.class} · Level {player.level}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => restoreDeletedPlayer(player.id)}
                            className={`${retro.button} px-3 py-1 text-[11px] flex items-center gap-1`}
                            style={S_GREEN_BTN}
                          >
                            <Undo2 size={11} />Restore
                          </button>
                          <button
                            onClick={() => permanentlyDeletePlayer(player.id)}
                            className={`${retro.button} px-3 py-1 text-[11px]`}
                            style={S_RED}
                          >
                            <Trash2 size={11} className="inline mr-1" />Purge
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deletion Confirmation Modal */}
              {deleteStep && deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={DM_OVERLAY}>
                  <div className={`${retro.raised} bg-[#0E0E35] p-6 max-w-md w-full mx-4`}>
                    {deleteStep === "confirm1" && (
                      <div style={DISPLAY_CONTENTS}>
                        <div className="flex items-center gap-2 mb-4">
                          <AlertTriangle size={20} style={S_WARN} />
                          <div className="text-[14px]" style={S_WARN_HDR}>Confirm Removal</div>
                        </div>
                        <p className="text-[13px] mb-6" style={S_TEXT}>
                          Are you sure you want to remove <span style={DM_DELETE_NAME}>{deleteTarget.name}</span> from the roster?
                        </p>
                        <div className="flex gap-2 justify-end">
                          <button onClick={cancelDelete} className={`${retro.button} px-5 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
                          <button onClick={advanceDeleteStep} className={`${retro.button} px-5 py-2 text-[12px]`} style={S_RED}>Yes, Remove</button>
                        </div>
                      </div>
                    )}
                    {deleteStep === "confirm2" && (
                      <div style={DISPLAY_CONTENTS}>
                        <div className="flex items-center gap-2 mb-4">
                          <ShieldAlert size={20} style={S_RED} />
                          <div className="text-[14px]" style={DM_AUTH_HDR}>Authorization Required</div>
                        </div>
                        <p className="text-[13px] mb-2" style={S_TEXT}>
                          This will remove <span style={DM_DELETE_NAME}>{deleteTarget.name}</span> and all associated data.
                        </p>
                        <p className="text-[11px] mb-4" style={S_MUTED}>
                          Enter the DM authorization code to confirm.
                        </p>
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            await confirmDeletePlayer();
                          }}
                        >
                          <div className="mb-4">
                            <label className="text-[10px] block mb-1" style={S_MUTED}>DM Password:</label>
                            <input
                              type="password"
                              value={deletePassword}
                              onChange={(e) => { setDeletePassword(e.target.value); setDeletePasswordError(false); }}
                              placeholder="Enter DM auth code..."
                              className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`}
                              style={dmErrBorder(!!deletePasswordError)}
                              autoFocus
                            />
                            {deletePasswordError && (
                              <div className="text-[10px] mt-1" style={S_RED}>
                                Incorrect authorization code. Access denied.
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button type="button" onClick={cancelDelete} className={`${retro.button} px-5 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
                            <button type="submit" className={`${retro.button} px-5 py-2 text-[12px]`} style={S_RED}>Confirm Removal</button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================= */}
          {/* MANAGE ITEMS                                             */}
          {/* ======================================================= */}
          {activeSection === "items" && (
            <DMItemManagerSection
              players={players}
              managedItems={managedItems}
              itemTags={itemTags}
              onPersistItems={async (next) => {
                try {
                  setDmError(null);
                  await saveDMItems(next as Record<string, unknown>[]);
                  setManagedItems(next as ManagedItem[]);
                  setEditingItem(null);
                  setIsAddingNewItem(false);
                } catch (err) {
                  setDmError(getSaveError(err, "Failed to save items"));
                }
              }}
            />
          )}

          {activeSection === "cards" && (
            <DMCardManagerSection
              players={players}
              managedCards={managedCards}
              cardTags={cardTags}
              nodeTrees={nodeTrees}
              onPersistCards={persistCards}
              onPersistNodeTrees={persistNodeTrees}
              setDmError={setDmError}
            />
          )}

          {/* ======================================================= */}
          {/* NODE TREES                                               */}
          {/* ======================================================= */}
          {activeSection === "nodetrees" && (
            <div>
              <DMNodeTreeBuilder
                players={players.map(p => ({ id: p.id, name: p.name }))}
                cards={managedCards.map(c => ({ id: c.id, name: c.name, type: c.type, effect: c.effect, actionCost: c.actionCost }))}
                onCardNodeAssign={async (cardId, treeId, nodeId) => {
                  const next = managedCards.map((c) =>
                    c.id === cardId ? { ...c, nodeTreeId: treeId, nodeId } : c
                  );
                  await persistCards(next);
                }}

                onCardNodeUnassign={async (cardId) => {
                  const next = managedCards.map((c) =>
                    c.id === cardId ? { ...c, nodeTreeId: "", nodeId: "" } : c
                  );
                  await persistCards(next);
                }}
              />
            </div>
          )}

          {/* ======================================================= */}
          {/* MANAGE INFO                                              */}
          {/* ======================================================= */}
          {activeSection === "info" && (
            <DMInfoManagerSection
              retro={retro}
              players={players}
              managedInfos={managedInfos}
              editingInfo={editingInfo}
              isAddingNewInfo={isAddingNewInfo}
              infoTags={infoTags}
              infoSubTabs={infoSubTabs}
              setInfoSubTabs={setInfoSubTabs}
              newInfoSubTabName={newInfoSubTabName}
              setNewInfoSubTabName={setNewInfoSubTabName}
              infoManagerSubTabFilter={infoManagerSubTabFilter}
              setInfoManagerSubTabFilter={setInfoManagerSubTabFilter}
              infoBulkAssignTarget={infoBulkAssignTarget}
              setInfoBulkAssignTarget={setInfoBulkAssignTarget}
              infoBulkSelection={infoBulkSelection}
              setInfoBulkSelection={setInfoBulkSelection}
              editingInfoSubTabId={editingInfoSubTabId}
              setEditingInfoSubTabId={setEditingInfoSubTabId}
              editingInfoSubTabName={editingInfoSubTabName}
              setEditingInfoSubTabName={setEditingInfoSubTabName}
              followUpInfoId={followUpInfoId}
              setFollowUpInfoId={setFollowUpInfoId}
              followUpText={followUpText}
              setFollowUpText={setFollowUpText}
              dmError={dmError}
              setDmError={setDmError}
              labelStyle={labelStyle}
              inputClass={inputClass}
              inputStyle={inputStyle}
              renderTypedField={renderTypedField}
              getActiveCustomFields={getActiveCustomFields}
              getInfoSubTabNameError={getInfoSubTabNameError}
              getInfoSubTabColorError={getInfoSubTabColorError}
              normalizeInfoSubTabDraft={normalizeInfoSubTabDraft}
              ensureSingleDefaultInfoSubTab={ensureSingleDefaultInfoSubTab}
              persistInfoSubTabs={persistInfoSubTabs}
              moveInfoSubTab={moveInfoSubTab}
              deleteInfoSubTab={deleteInfoSubTab}
              handleAddInfo={handleAddInfo}
              handleSaveInfo={handleSaveInfo}
              handleDeleteInfo={handleDeleteInfo}
              handleCancelInfoEdit={handleCancelInfoEdit}
              updateInfoField={updateInfoField}
              toggleInfoTag={toggleInfoTag}
              updateInfoCustomField={updateInfoCustomField}
              persistInfos={persistInfos}
              setEditingInfo={setEditingInfo}
              S_ACCENT_HDR={S_ACCENT_HDR}
              S_SECTION_HDR={S_SECTION_HDR}
              S_MUTED={S_MUTED}
              S_DIM={S_DIM}
              S_TEXT={S_TEXT}
              S_WARN={S_WARN}
              S_GREEN_BTN={S_GREEN_BTN}
              S_LABEL={S_LABEL}
              S_SUBTLE={S_SUBTLE}
              S_RED={S_RED}
              DM_PANEL={DM_PANEL}
              DM_PANEL_ALT={DM_PANEL_ALT}
              DM_TAG_BADGE={DM_TAG_BADGE}
            />
          )}

          {/* ======================================================= */}
          {/* NOTIFICATIONS                                            */}
          {/* ======================================================= */}
          {activeSection === "notifs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage Notifications</h2>
                <button onClick={handleStartAddNotif} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                  <Plus size={14} /> New Notification
                </button>
              </div>

              <p className="text-[11px]" style={S_SUBTLE}>
                Create notifications that appear in players' I-NET Interface dashboard. Assign to individual players, multiple players, or all players at once.
              </p>

              {/* Notification Edit Form */}
              {editingNotif && (
                <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[12px]" style={S_SECTION_HDR}>
                      {isAddingNewNotif ? "CREATE NEW NOTIFICATION" : `EDITING: ${editingNotif.subject || "(no subject)"}`}
                    </div>
                    <button onClick={handleCancelNotifEdit} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
                  </div>

                  {/* Subject */}
                  <div className="mb-4">
                    <label className="text-[10px] block mb-1" style={labelStyle}>Subject:</label>
                    <input
                      type="text"
                      value={editingNotif.subject}
                      onChange={(e) => setEditingNotif({ ...editingNotif, subject: e.target.value })}
                      placeholder="Notification subject line..."
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>

                  {/* Assignment */}
                  <div className="mb-4">
                    <label className="text-[10px] block mb-2" style={labelStyle}>Send to:</label>
                    <div className="flex items-center gap-3 mb-3">
                      <button
                        onClick={async () => { setNotifAllPlayers(true); setNotifPlayerSelection({}); }}
                        className="text-[11px] px-3 py-1.5 transition-colors"
                        style={dmActiveBtn(notifAllPlayers)}
                      >
                        All Players
                      </button>
                      <button
                        onClick={() => setNotifAllPlayers(false)}
                        className="text-[11px] px-3 py-1.5 transition-colors"
                        style={dmActiveBtn(!notifAllPlayers)}
                      >
                        Select Players
                      </button>
                    </div>

                    {!notifAllPlayers && (
                      <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                        <div className="text-[10px] mb-2" style={S_SECTION_HDR}>SELECT RECIPIENTS</div>
                        <div className="space-y-1.5">
                          {players.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:opacity-80">
                              <input
                                type="checkbox"
                                checked={!!notifPlayerSelection[p.id]}
                                onChange={(e) => setNotifPlayerSelection({ ...notifPlayerSelection, [p.id]: e.target.checked })}
                                className="accent-[#4A7BFF]"
                              />
                              <span className="text-[11px]" style={dmPlayerSelect(!!notifPlayerSelection[p.id])}>
                                {p.name}
                              </span>
                            </label>
                          ))}
                          {players.length === 0 && (
                            <span className="text-[11px]" style={S_MUTED}>No players defined yet.</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Message body */}
                  <div className="mb-4">
                    <label className="text-[10px] block mb-1" style={labelStyle}>Message:</label>
                    <textarea
                      value={editingNotif.message}
                      onChange={(e) => setEditingNotif({ ...editingNotif, message: e.target.value })}
                      placeholder="Enter notification message content..."
                      rows={6}
                      className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none resize-none`}
                      style={{ ...inputStyle, fontFamily: "'Courier New', monospace" }}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button onClick={handleSaveNotif} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                      <Send size={14} /> {isAddingNewNotif ? "Send Notification" : "Save Changes"}
                    </button>
                    <button onClick={handleCancelNotifEdit} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Notification List */}
              <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                <div className="text-[12px] mb-3" style={S_SECTION_HDR}>SENT NOTIFICATIONS ({visibleDmNotifications.length})</div>
                {visibleDmNotifications.length === 0 ? (
                  <div className="text-[12px] text-center py-6" style={S_MUTED}>No notifications sent yet.</div>
                ) : (
                  <div className="space-y-2">
                    {visibleDmNotifications.map((notif) => (
                      <div key={notif.id} className={`${retro.raised} bg-[#0E0E35] p-3`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] mb-0.5 truncate" style={S_TEXT_BOLD}>{notif.subject}</div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px]" style={S_MUTED}>{notif.createdAt}</span>
                              <span className="text-[9px]" style={S_DIM}>·</span>
                              <span className="text-[10px]" style={dmNotifTarget(notif.assignedTo.includes("ALL"))}>
                                {notif.assignedTo.includes("ALL") ? "All Players" : notif.assignedTo.join(", ")}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <button onClick={() => handleEditNotif(notif)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_ACCENT}>
                              <Edit size={12} className="inline mr-1" />Edit
                            </button>
                            <button onClick={() => handleDeleteNotif(notif.id)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_RED}>
                              <Trash2 size={12} className="inline mr-1" />Remove
                            </button>
                          </div>
                        </div>
                        {notif.message && (
                          <div className="text-[11px] mt-1" style={S_SUBTLE}>
                            {notif.message.length > 120 ? notif.message.slice(0, 120) + "..." : notif.message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Error & Report Log */}
              <div
                className="h-[2px] w-full my-4"
                style={DM_GRAD_LINE}
              />
              <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} style={S_WARN} />
                    <div className="text-[12px]" style={S_WARN_HDR}>
                      ERROR &amp; REPORT LOG ({filteredErrorLog.length})
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Filter buttons */}
                    {(["all", "error", "report"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setErrorLogFilter(f)}
                        className="text-[10px] px-2 py-0.5 transition-colors"
                        style={dmErrFilterBtn(errorLogFilter === f, f)}
                      >
                        {f === "all" ? "All" : f === "error" ? "Errors" : "Reports"}
                      </button>
                    ))}
                    {errorLog.length > 0 && (
                      <button
                        onClick={handleClearErrorLog}
                        className={`${retro.button} px-3 py-1 text-[10px] flex items-center gap-1`}
                        style={S_RED}
                      >
                        <Trash2 size={10} /> Clear All
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] mb-3" style={S_MUTED}>
                  Auto-captured runtime errors and player-submitted problem reports.
                </p>
                {filteredErrorLog.length === 0 ? (
                  <div className="text-[12px] text-center py-6" style={S_MUTED}>
                    No {errorLogFilter === "all" ? "entries" : errorLogFilter === "error" ? "errors" : "reports"} logged yet.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                    {filteredErrorLog.map((entry) => (
                      <div
                        key={entry.id}
                        className={`${retro.raised} bg-[#0E0E35] p-3`}
                        style={dmErrLogBorder(entry.type)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span
                              className="text-[9px] px-1.5 py-0.5 shrink-0"
                              style={dmErrLogType(entry.type)}
                            >
                              {entry.type === "error" ? "ERROR" : "REPORT"}
                            </span>
                            <span className="text-[10px] shrink-0" style={S_MUTED}>
                              {entry.timestamp}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveLogEntry(entry.id)}
                            className="shrink-0 p-0.5 hover:opacity-80"
                            style={S_MUTED}
                            title="Remove"
                          >
                            <X size={10} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px]" style={S_SUBTLE}>
                            Player:
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5"
                            style={DM_LOG_COPY_BTN}
                          >
                            {entry.player}
                          </span>
                          {entry.type === "error" && entry.source && (
                            <div style={DISPLAY_CONTENTS}>
                              <span className="text-[10px]" style={S_SUBTLE}>
                                Source:
                              </span>
                              <span className="text-[9px] truncate" style={{ ...S_MUTED, ...DM_LOG_SOURCE }}>
                                {entry.source}
                              </span>
                            </div>
                          )}
                        </div>
                        <div
                          className="text-[11px] whitespace-pre-wrap"
                          style={dmErrLogText(entry.type)}
                        >
                          {entry.message}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* IMAGE STORAGE                                            */}
          {/* ======================================================= */}
          {activeSection === "images" && <DMImageStorageSection />}

          {/* ======================================================= */}
          {/* MANAGE NEWS (extracted)                                   */}
          {/* ======================================================= */}
          {activeSection === "news" && <DMNewsManager />}

          {/* ======================================================= */}
          {/* MANAGE TAGS (extracted)                                   */}
          {/* ======================================================= */}
          {activeSection === "tags" && (
            <DMTagsSection
              itemTags={itemTags}
              cardTags={cardTags}
              infoTags={infoTags}
              statusTags={statusTags}
              wikiTags={wikiTags}
              onSaveItemTags={(next) => persistTags("item", next)}
              onSaveCardTags={(next) => persistTags("card", next)}
              onSaveInfoTags={(next) => persistTags("info", next)}
              onSaveStatusTags={(next) => persistTags("status", next)}
              onSaveWikiTags={(next) => persistTags("wiki", next)}
            />
          )}

          {/* ======================================================= */}
          {/* CUSTOMIZATION EDITING (extracted)                         */}
          {/* ======================================================= */}
          {activeSection === "customize" && <DMCustomizeSection statusTags={statusTags} />}


          {/* ======================================================= */}
          {/* CALENDAR & WEATHER (extracted)                            */}
          {/* ======================================================= */}
          {activeSection === "calendar" && <DMCalendarWeather />}


          {/* ======================================================= */}
          {/* ARCADE MANAGER                                            */}
          {/* ======================================================= */}
          {activeSection === "arcade" && (
            <div style={DISPLAY_CONTENTS}>
              <div className="flex items-center gap-3 mb-6">
                <Gamepad2 size={20} style={DM_GOLD} />
                <h2 className="text-[18px] font-bold" style={DM_GOLD}>Arcade Manager</h2>
              </div>
              <div className="text-[11px] mb-4" style={S_MUTED}>
                Manage the Arcade Shop credits economy, item ownership, shop inventory, mystery items, and leaderboard scores.
              </div>
              <DMArcadeManager
                players={players.map((p) => ({
                  id: p.id,
                  name: p.name,
                  class: p.class,
                  level: p.level,
                }))}
              />
            </div>
          )}

          {/* ======================================================= */}
          {/* ADVENTURE CREATOR                                        */}
          {/* ======================================================= */}
          {activeSection === "adventure" && (
            <div style={DISPLAY_CONTENTS}>
              <div className="flex items-center gap-3 mb-6">
                <Dices size={20} style={DM_GOLD} />
                <h2 className="text-[18px] font-bold" style={DM_GOLD}>Adventure Creator</h2>
              </div>
              <div className="text-[11px] mb-4" style={S_MUTED}>
                Close old Adventure rooms, seed the clean V2 starter, and build classes, abilities, item sets, events, enemies, bosses, behaviors, and level-up rules.
              </div>
              <AdventureGame onBack={() => setActiveSection("arcade")} />
            </div>
          )}

          {/* ======================================================= */}
          {/* CHAT REACTIONS                                            */}
          {/* ======================================================= */}
          {activeSection === "reactions" && (
            <div style={DISPLAY_CONTENTS}>
              <DMReactionManager
                reactions={reactions}
                onSave={persistCustomReactions}
                inputClass={inputClass}
                inputStyle={inputStyle}
                labelStyle={labelStyle}
              />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
