import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import { appStore } from "@/lib/app-store";
import { loadDMPlayers, saveDMPlayers, loadDMDeletedPlayers, saveDMDeletedPlayers } from "@/lib/player-state-api";
import {
  ShieldAlert, Package, CreditCard, FileText, Globe, Users, User,
  Trash2, Plus, Save, X, Edit, Tag, ChevronDown, ChevronRight, Bell, Send, ArrowLeft,
  Undo2, AlertTriangle, Paintbrush, Gamepad2, SmilePlus, Lock, GitBranch, CalendarDays,
  Newspaper, Copy, Zap, ChevronUp,
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
import { DMWikiSection } from "./dm-wiki-section";
import { DMTagsSection } from "./dm-tags-section";
import { RichTextEditor } from "./rich-text-editor";
import { renderTypedField as renderTypedFieldShared } from "./tag-field-renderer";
import { safeGetItem, safeSetItem, safeGetJson, safeSetJson } from "./safe-storage";
import type {
  PlayerStats, PlayerData, TagField, TagDefinition,
  ManagedItem, ManagedCard, InfoFollowUp, ManagedInfo,
  DMNotification, NewsArticle, LoginProfile,
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

function mergePlayerWithTemplate(player: PlayerData): PlayerData {
  const template = initialPlayers.find((p) => p.id === player.id);
  return {
    ...(template ?? {} as PlayerData),
    ...player,
    stats: { ...defaultStats, ...(template?.stats ?? {}), ...(player.stats ?? {}) },
  } as PlayerData;
}

function mergePlayersWithDefaults(players: PlayerData[]): PlayerData[] {
  const merged = new Map<string, PlayerData>();

  for (const player of initialPlayers as PlayerData[]) {
    merged.set(player.id, mergePlayerWithTemplate(player));
  }

  for (const player of players) {
    if (!player?.id) continue;
    merged.set(player.id, mergePlayerWithTemplate(player));
  }

  return Array.from(merged.values());
}

// ========================
// Custom Reaction Manager (embedded in DM Area)
// ========================
interface CustomReaction {
  id: string;
  emoji: string;
  label: string;
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
  | "info"
  | "pages"
  | "tags"
  | "notifs"
  | "news"
  | "customize"
  | "calendar"
  | "arcade"
  | "reactions"
  | "nodetrees";

const DM_INPUT_CLASS = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;


const DM_SECTIONS = [
  { id: "players" as const, label: "Players", icon: Users },
  { id: "items" as const, label: "Manage Items", icon: Package },
  { id: "cards" as const, label: "Manage Cards", icon: CreditCard },
  { id: "nodetrees" as const, label: "Node Trees", icon: GitBranch },
  { id: "info" as const, label: "Manage Info", icon: FileText },
  { id: "notifs" as const, label: "Notifications", icon: Bell },
  { id: "news" as const, label: "Manage News", icon: Newspaper },
  { id: "pages" as const, label: "Wiki Articles", icon: Globe },
  { id: "tags" as const, label: "Manage Tags", icon: Tag },
  { id: "customize" as const, label: "Customization Editing", icon: Paintbrush },
  { id: "calendar" as const, label: "Calendar & Weather", icon: CalendarDays },
  { id: "arcade" as const, label: "Arcade Manager", icon: Gamepad2 },
  { id: "reactions" as const, label: "Chat Reactions", icon: SmilePlus },
] as const;

export function DMArea() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SectionId>("players");
  const [itemFilterTab, setItemFilterTab] = useState<string>("all"); // "all" | "ownerless" | player.id
  const [dmCardsSubTab, setDmCardsSubTab] = useState<"cards" | "levelabilities">("cards");

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
  type InfoSubTab = { id: string; name: string; order: number };
  const [infoSubTabs, setInfoSubTabs] = useState<InfoSubTab[]>([]);
  const [newInfoSubTabName, setNewInfoSubTabName] = useState("");
  const [editingItem, setEditingItem] = useState<ManagedItem | null>(null);
  const [isAddingNewItem, setIsAddingNewItem] = useState(false);
  const [editingInfoSubTabId, setEditingInfoSubTabId] = useState<string | null>(null);
  const [editingInfoSubTabName, setEditingInfoSubTabName] = useState("");
  const [managedItems, setManagedItems] = useState<ManagedItem[]>([]);
  const [managedCards, setManagedCards] = useState<ManagedCard[]>([]);
  const [editingCard, setEditingCard] = useState<ManagedCard | null>(null);
  const [isAddingNewCard, setIsAddingNewCard] = useState(false);
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

  // Level Abilities (DM editor - per-player localStorage keys)
  type LevelCategory = { id: string; name: string; order: number; cardIds: string[]; description?: string };
  const [laSelectedPlayerId, setLaSelectedPlayerId] = useState<string>("");
  const [levelCategories, setLevelCategories] = useState<LevelCategory[]>([]);
  const [laEditingLevel, setLaEditingLevel] = useState<string | null>(null);
  const [laNewLevelName, setLaNewLevelName] = useState("");
  const [laAddingLevel, setLaAddingLevel] = useState(false);
  const [laCollapsedLevels, setLaCollapsedLevels] = useState<Set<string>>(new Set());
  const [laEditingDesc, setLaEditingDesc] = useState<string | null>(null);
  const [laCopyConfirm, setLaCopyConfirm] = useState(false);

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
        appStore.listTags<TagDefinition>("item"),
        appStore.listTags<TagDefinition>("card"),
        appStore.listTags<TagDefinition>("info"),
        appStore.listTags<TagDefinition>("status"),
        appStore.listTags<TagDefinition>("wiki"),
        appStore.listItems<ManagedItem>(),
        appStore.listCards<ManagedCard>(),
        appStore.listInfos<ManagedInfo>(),
        appStore.listInfoSubTabs<InfoSubTab>(),
        appStore.listNotifications<DMNotification>(),
        appStore.listCustomReactions<CustomReaction>(),
        appStore.listNodeTrees<NodeTree>(),
      ]);

      if (cancelled) return;

      setPlayers(mergePlayersWithDefaults(playersData));
      setDeletedPlayers(mergePlayersWithDefaults(deletedPlayersData));
      setItemTags(itemTagData.length ? itemTagData : initialItemTags);
      setCardTags(cardTagData.length ? cardTagData : initialCardTags);
      setInfoTags(infoTagData.length ? infoTagData : initialInfoTags);
      setStatusTags(statusTagData.length ? statusTagData : initialStatusTags);
      setWikiTags(wikiTagData.length ? wikiTagData : initialWikiTags);
      setManagedItems(itemsData.length ? itemsData : migrateAssignedTo(initialItems as ManagedItem[]));
      setManagedCards(cardsData.length ? cardsData : migrateAssignedTo(initialCards as ManagedCard[]));
      setManagedInfos(infosData.length ? infosData : migrateAssignedTo(initialInfos as ManagedInfo[]));
      setInfoSubTabs(infoSubTabData);
      setDmNotifications(notificationData);
      setNodeTrees(nodeTreeData);
      setReactions(reactionData);
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
    setPlayers(mergePlayersWithDefaults(next));
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save players"));
    throw err;
  }
}

async function persistDeletedPlayers(next: PlayerData[]) {
  try {
    setDmError(null);
    await saveDMDeletedPlayers(next as unknown as Record<string, unknown>[]);
    setDeletedPlayers(mergePlayersWithDefaults(next));
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save deleted players"));
    throw err;
  }
}

async function persistItems(next: ManagedItem[]) {
  try {
    setDmError(null);
    await appStore.saveItems(next);
    setManagedItems(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save items"));
    throw err;
  }
}

async function persistCards(next: ManagedCard[]) {
  try {
    setDmError(null);
    await appStore.saveCards(next);
    setManagedCards(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save cards"));
    throw err;
  }
}

async function persistInfos(next: ManagedInfo[]) {
  try {
    setDmError(null);
    await appStore.saveInfos(next);
    setManagedInfos(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save info"));
    throw err;
  }
}

async function persistNotifications(next: DMNotification[]) {
  try {
    setDmError(null);
    await appStore.saveNotifications(next);
    setDmNotifications(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save notifications"));
    throw err;
  }
}

async function persistInfoSubTabs(next: InfoSubTab[]) {
  try {
    setDmError(null);
    await appStore.saveInfoSubTabs(next);
    setInfoSubTabs(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save info sub-tabs"));
    throw err;
  }
}

async function persistTags(
  kind: "item" | "card" | "info" | "status" | "wiki",
  next: TagDefinition[],
) {
  try {
    setDmError(null);
    await appStore.saveTags(kind, next);

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
    await appStore.saveCustomReactions(next);
    setReactions(next);
  } catch (err) {
    setDmError(getSaveError(err, "Failed to save custom reactions"));
    throw err;
  }
}

  // Auto-select first player when entering Level Abilities
  useEffect(() => {
    if (dmCardsSubTab === "levelabilities" && !laSelectedPlayerId && players.length > 0) {
      setLaSelectedPlayerId(players[0].id);
    }
  }, [dmCardsSubTab, laSelectedPlayerId, players]);

  const saveLevelCategories = useCallback(async (cats: LevelCategory[]) => {
    if (!laSelectedPlayerId) return;

    try {
      setDmError(null);
      await appStore.savePlayerLevelCategories(laSelectedPlayerId, cats);
      setLevelCategories(cats);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to save level categories"));
      throw err;
    }
  }, [laSelectedPlayerId]);

  const copyLevelCategoriesToAllPlayers = useCallback(async () => {
    if (!laSelectedPlayerId) return;

    try {
      setDmError(null);

      const currentCats = await appStore.loadPlayerLevelCategories<LevelCategory[]>(laSelectedPlayerId, []);

      for (const p of players) {
        if (p.id !== laSelectedPlayerId) {
          await appStore.savePlayerLevelCategories(
            p.id,
            JSON.parse(JSON.stringify(currentCats)),
          );
        }
      }

      setLaCopyConfirm(false);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to copy level categories to all players"));
    }
  }, [laSelectedPlayerId, players]);

  // Error & report log (read from localStorage)
  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>(() => readErrorLog());
  const [errorLogFilter, setErrorLogFilter] = useState<"all" | "error" | "report">("all");

useEffect(() => {
  let cancelled = false;

  async function loadLevelCategories() {
    if (!laSelectedPlayerId) return;

    try {
      const existing = await appStore.loadPlayerLevelCategories<LevelCategory[]>(laSelectedPlayerId, []);
      let cats = existing;

      if (cats.length === 0) {
        const p = players.find((pl) => pl.id === laSelectedPlayerId);
        if (p && p.level > 0) {
          cats = Array.from({ length: p.level }, (_, i) => ({
            id: `lvl-${Date.now()}-${i}`,
            name: `Level ${i + 1}`,
            order: p.level - 1 - i,
            cardIds: [],
            description: "",
          }));
          await appStore.savePlayerLevelCategories(laSelectedPlayerId, cats);
        }
      }

      if (cancelled) return;
      setLevelCategories(cats);
      setLaEditingLevel(null);
      setLaAddingLevel(false);
      setLaNewLevelName("");
      setLaCollapsedLevels(new Set());
      setLaEditingDesc(null);
      setLaCopyConfirm(false);
    } catch (err) {
      if (!cancelled) {
        setDmError(getSaveError(err, "Failed to load level categories"));
      }
    }
  }

  void loadLevelCategories();

  return () => {
    cancelled = true;
  };
}, [laSelectedPlayerId, players]);

  // Reload error log on focus
  useEffect(() => {
    const onFocus = () => setErrorLog(readErrorLog());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleClearErrorLog = useCallback(() => {
    clearErrorLog();
    setErrorLog([]);
  }, []);

  const handleRemoveLogEntry = useCallback((id: string) => {
    removeLogEntry(id);
    setErrorLog((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const filteredErrorLog = useMemo(() => errorLog.filter((e) => errorLogFilter === "all" || e.type === errorLogFilter), [errorLog, errorLogFilter]);





  // ---- Style helpers (module-level constants to avoid re-creating each render) ----
  const labelStyle = S_MUTED;
  const inputClass = DM_INPUT_CLASS;
  const inputStyle = S_TEXT;

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
      id: `player-${Date.now()}`, name: "New Agent", class: "Operative", level: 1,
      stats: { ...defaultStats }, currentHP: 10, maxHP: 10, armorClass: 10,
      speed: "30 ft", woundDice: "1d6", currentWounds: 0, totalWounds: 3,
      damageReduction: 0, tempHP: 0, currentWeight: 0, maxWeight: 100, exhaustion: 0, maxExhaustion: 6,
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

    const playerToSave = { ...editingPlayer, authCode: "" };
    const updated = isAddingNewPlayer
      ? [...players, playerToSave]
      : players.map((p) => (p.id === playerToSave.id ? playerToSave : p));

    await persistPlayers(updated);
    syncProfilesToLocalStorage(updated);

    setEditingPlayer(null);
    setIsAddingNewPlayer(false);
    setPendingAuthCode("");
  };
  // Step 1: Initiate deletion ����� show first confirm modal
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
    } catch (err) {
      console.error("DM auth verification error:", err);
      setDeletePasswordError(true);
      return;
    }

    if (!deleteTarget) return;

    const nextDeleted = [...deletedPlayers, deleteTarget];
    const updatedPlayers = players.filter((p) => p.id !== deleteTarget.id);

    await persistDeletedPlayers(nextDeleted);
    await persistPlayers(updatedPlayers);
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

      const nextDeleted = deletedPlayers.filter((p) => p.id !== id);
      await persistDeletedPlayers(nextDeleted);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to permanently delete player"));
    }
  };
  // Clear all recently deleted
  const clearAllDeletedPlayers = async () => {
    await persistDeletedPlayers([]);
  };
  const handleCancelPlayerEdit = () => { setEditingPlayer(null); setIsAddingNewPlayer(false); setPendingAuthCode(""); };
  const updatePlayerField = <K extends keyof PlayerData>(key: K, value: PlayerData[K]) => {
    if (editingPlayer) setEditingPlayer({ ...editingPlayer, [key]: value });
  };
  const updatePlayerStat = (stat: keyof PlayerStats, value: number) => {
    if (editingPlayer) setEditingPlayer({ ...editingPlayer, stats: { ...defaultStats, ...(editingPlayer.stats ?? {}), [stat]: value } });
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
  // Card handlers
  // ========================
  const handleAddCard = () => {
    setEditingCard({
      id: `mc-${Date.now()}`, name: "", type: "", actionCost: "",
      tags: [], effect: "", assignedTo: [], customFields: {},
      nodeTreeId: "", nodeId: "",
    });
    setIsAddingNewCard(true);
  };
  const handleSaveCard = async () => {
    if (!editingCard) return;

    const nextCards = isAddingNewCard
      ? [...managedCards, editingCard]
      : managedCards.map((c) => (c.id === editingCard.id ? editingCard : c));

    await persistCards(nextCards);

    let treesChanged = false;

    const nextTrees = nodeTrees.map((tree) => {
      const nextNodes = tree.nodes.map((node) => {
        const hasCard = node.cardIds.includes(editingCard.id);
        const shouldHave =
          editingCard.nodeTreeId === tree.id && editingCard.nodeId === node.id;

        if (shouldHave && !hasCard) {
          if (node.cardIds.length >= 3) return node;
          treesChanged = true;
          return { ...node, cardIds: [...node.cardIds, editingCard.id] };
        }

        if (!shouldHave && hasCard) {
          treesChanged = true;
          return {
            ...node,
            cardIds: node.cardIds.filter((cid) => cid !== editingCard.id),
          };
        }

        return node;
      });

      return { ...tree, nodes: nextNodes };
    });

    if (treesChanged) {
      await appStore.saveNodeTrees(nextTrees);
      setNodeTrees(nextTrees);
    }

    setEditingCard(null);
    setIsAddingNewCard(false);
  };
  const handleDeleteCard = async (id: string) => {
    const next = managedCards.filter((c) => c.id !== id);
    await persistCards(next);

    if (editingCard?.id === id) {
      setEditingCard(null);
      setIsAddingNewCard(false);
    }
  };
  const handleCancelCardEdit = () => { setEditingCard(null); setIsAddingNewCard(false); };
  const updateCardField = <K extends keyof ManagedCard>(key: K, value: ManagedCard[K]) => {
    if (editingCard) setEditingCard({ ...editingCard, [key]: value });
  };
  const toggleCardTag = (tagName: string) => {
    if (!editingCard) return;
    const has = editingCard.tags.includes(tagName);
    updateCardField("tags", has ? editingCard.tags.filter((t) => t !== tagName) : [...editingCard.tags, tagName]);
  };
  const updateCardCustomField = (key: string, value: string) => {
    if (!editingCard) return;
    setEditingCard({ ...editingCard, customFields: { ...editingCard.customFields, [key]: value } });
  };

  // ========================
  // Info handlers
  // ========================
  const handleAddInfo = () => {
    setEditingInfo({
      id: `mn-${Date.now()}`, title: "", tags: [], content: "",
      assignedTo: ["all"], customFields: {}, category: "", followUps: [],
      inWorldTime: "", realWorldTime: "", infoSubTab: "",
    });
    setIsAddingNewInfo(true);
  };
  const handleSaveInfo = async () => {
    if (!editingInfo) return;

    const next = isAddingNewInfo
      ? [...managedInfos, editingInfo]
      : managedInfos.map((n) => (n.id === editingInfo.id ? editingInfo : n));

    await persistInfos(next);

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
          <button onClick={() => navigate("/interface/game")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={DM_NAV_GREEN}>
            <Gamepad2 size={12} />
            Arcade
          </button>
          <span className="text-[11px]" style={S_DIM}>Sunday, February 22, 2026</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 py-6 max-w-[1200px] mx-auto w-full">
        {/* Header */}
        <div className="mb-6">
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

        {/* Nav Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={async () => { setActiveSection(s.id); setEditingPlayer(null); setIsAddingNewPlayer(false); setEditingItem(null); setIsAddingNewItem(false); setEditingCard(null); setIsAddingNewCard(false); setEditingInfo(null); setIsAddingNewInfo(false); setEditingNotif(null); setIsAddingNewNotif(false); }}
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
                      <label className="text-[10px] block mb-1" style={labelStyle}>Class:</label>
                      <input type="text" value={editingPlayer.class} onChange={(e) => updatePlayerField("class", e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Level:</label>
                      <input type="number" value={editingPlayer.level} onChange={(e) => updatePlayerField("level", Math.max(1, parseInt(e.target.value) || 1))} className={inputClass} style={inputStyle} />
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
                        { key: "woundDice" as const, label: "Wound Dice", type: "text" },
                        { key: "totalWounds" as const, label: "Total Wounds", type: "number" },
                        { key: "damageReduction" as const, label: "Damage Reduction", type: "number" },
                        { key: "tempHP" as const, label: "Temp HP", type: "number" },
                        { key: "currentWeight" as const, label: "Current Weight", type: "number" },
                        { key: "maxWeight" as const, label: "Max Weight", type: "number" },
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
                    </div>
                  </div>

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
                    <button onClick={handleSavePlayer} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                      <Save size={14} /> {isAddingNewPlayer ? "Add Player" : "Save Changes"}
                    </button>
                    <button onClick={handleCancelPlayerEdit} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
                  </div>
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
                            <div className="text-[11px]" style={S_MUTED}>{player.class} · Level {player.level}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingPlayer({
                                  damageReduction: 0,
                                  tempHP: 0,
                                  currentWeight: 0,
                                  maxWeight: 100,
                                  exhaustion: 0,
                                  maxExhaustion: 6,
                                  ...mergePlayerWithTemplate(player),
                                  stats: { ...defaultStats, ...(mergePlayerWithTemplate(player).stats ?? {}) },
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
                          <div><div className="text-[9px]" style={S_MUTED}>Weight</div><div className="text-[12px]" style={dmOverColor(player.currentWeight ?? 0, player.maxWeight ?? 100)}>{player.currentWeight ?? 0}/{player.maxWeight ?? 100}</div></div>
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
                        <div className="mb-4">
                          <label className="text-[10px] block mb-1" style={S_MUTED}>DM Password:</label>
                          <input
                            type="password"
                            value={deletePassword}
                            onChange={(e) => { setDeletePassword(e.target.value); setDeletePasswordError(false); }}
                            onKeyDown={async (e) => { if (e.key === "Enter") confirmDeletePlayer(); }}
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
                          <button onClick={cancelDelete} className={`${retro.button} px-5 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
                          <button onClick={confirmDeletePlayer} className={`${retro.button} px-5 py-2 text-[12px]`} style={S_RED}>Confirm Removal</button>
                        </div>
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
          {activeSection === "items" && (() => {
            const activeCustomFields = editingItem ? getActiveCustomFields(editingItem, itemTags) : [];

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage Player Items</h2>
                  <button onClick={handleAddItem} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                    <Plus size={14} /> Add Item
                  </button>
                </div>

                {/* Item Edit Form */}
                {editingItem && (
                  <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[12px]" style={S_SECTION_HDR}>
                        {isAddingNewItem ? "ADD NEW ITEM" : `EDITING: ${editingItem.name || "(unnamed)"}`}
                      </div>
                      <button onClick={handleCancelItemEdit} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
                    </div>

                    {/* Row 1: Name, Type, Rarity */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Item Name:</label>
                        <input type="text" value={editingItem.name} onChange={(e) => updateItemField("name", e.target.value)} placeholder="Enter item name..." className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Item Type:</label>
                        <input type="text" value={editingItem.type} onChange={(e) => updateItemField("type", e.target.value)} placeholder="e.g., Weapon, Armor, Tool..." className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Rarity:</label>
                        <select value={editingItem.rarity} onChange={(e) => updateItemField("rarity", e.target.value)} className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full`} style={{ color: rarityColor(editingItem.rarity) }}>
                          {rarities.map((r) => <option key={r} value={r} style={{ color: rarityColor(r) }}>{r}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Player */}
                    <div className="mb-4">
                      <label className="text-[10px] block mb-1" style={labelStyle}>Assign to Players:</label>
                      <div className={`${retro.sunken} bg-[#0A0A28] p-3 w-full md:w-2/3`}>
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input type="checkbox" checked={editingItem.assignedTo.includes("all")} onChange={(e) => {
                            if (e.target.checked) updateItemField("assignedTo", ["all"]);
                            else updateItemField("assignedTo", []);
                          }} className="accent-[#4A9A5A]" />
                          <span className="text-[12px]" style={S_GREEN_BTN}>All Players</span>
                        </label>
                        <div className="h-[1px] mb-2" style={DM_DIVIDER} />
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {players.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" disabled={editingItem.assignedTo.includes("all")} checked={editingItem.assignedTo.includes("all") || editingItem.assignedTo.includes(p.id)} onChange={(e) => {
                                const current = editingItem.assignedTo.filter((id) => id !== "all");
                                if (e.target.checked) updateItemField("assignedTo", [...current, p.id]);
                                else updateItemField("assignedTo", current.filter((id) => id !== p.id));
                              }} className="accent-[#4A7BFF]" />
                              <span className="text-[12px]" style={dmAssignDim(editingItem.assignedTo.includes("all"))}>{p.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Lock toggle */}
                    <div className="mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!editingItem.locked}
                          onChange={(e) => updateItemField("locked", e.target.checked)}
                          className="accent-[#FF6A6A]"
                        />
                        <span className="text-[12px] flex items-center gap-1.5" style={dmLockColor(!!editingItem.locked)}>
                          <Lock size={12} />
                          {editingItem.locked ? "Locked — players cannot edit this item" : "Unlocked — players can edit this item"}
                        </span>
                      </label>
                    </div>

                    {/* Tags */}
                    <div className="mb-4">
                      <label className="text-[10px] block mb-2" style={labelStyle}>Tags (click to toggle):</label>
                      <div className="flex flex-wrap gap-1.5">
                        {itemTags.map((tag) => {
                          const active = editingItem.tags.includes(tag.name);
                          const hasFields = tag.fields.length > 0;
                          return (
                            <button
                              key={tag.id}
                              onClick={() => toggleItemTag(tag.name)}
                              className="text-[10px] px-2.5 py-1 transition-colors flex items-center gap-1"
                              style={dmActiveBtn(active)}
                            >
                              {tag.name}
                              {hasFields && <span className="text-[8px] opacity-70">+{tag.fields.length}</span>}
                            </button>
                          );
                        })}
                        {itemTags.length === 0 && (
                          <span className="text-[11px]" style={S_MUTED}>No tags defined. Create tags in "Manage Tags" first.</span>
                        )}
                      </div>
                    </div>

                    {/* Custom Fields from Tags */}
                    {activeCustomFields.length > 0 && (
                      <div className="mb-4">
                        <div className="text-[10px] mb-2" style={S_SECTION_HDR}>TAG FIELDS</div>
                        <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {activeCustomFields.map((cf) => {
                              const labelEl = (
                                <label className="text-[10px] block mb-1" style={S_ACCENT}>
                                  <span style={S_MUTED}>{cf.tagName} ›</span> {cf.fieldName}:
                                </label>
                              );

                              // ── Equipment → Slot dropdown ──
                              if (cf.tagName === "Equipment" && cf.fieldName === "Slot") {
                                const EQUIP_SLOTS = [
                                  { id: "head", label: "Head" }, { id: "face", label: "Face" }, { id: "neck", label: "Neck" },
                                  { id: "jacket", label: "Jacket / Cloak" }, { id: "armor", label: "Armor" }, { id: "shirt", label: "Shirt" },
                                  { id: "armguards", label: "Armguards" }, { id: "gloves", label: "Gloves" },
                                  { id: "weapon_l", label: "Weapon (L)" }, { id: "weapon_r", label: "Weapon (R)" },
                                  { id: "belt", label: "Belt" }, { id: "belt_slot", label: "Belt Slot" },
                                  { id: "leggings", label: "Leggings" }, { id: "shoes", label: "Shoes" },
                                  { id: "ring", label: "Ring (any)" },
                                ];
                                return (<div key={cf.key}>{labelEl}<select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Slot —</option>{EQUIP_SLOTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>);
                              }

                              // ── Attribute Buff → Attribute dropdown ──
                              if (cf.tagName === "Attribute Buff" && cf.fieldName === "Attribute") {
                                const ATTRS = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL"];
                                return (<div key={cf.key}>{labelEl}<select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Attribute —</option>{ATTRS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>);
                              }

                              // ── Attribute Buff / Skill Buff / Resources Buff → Amount number input ──
                              if ((cf.tagName === "Attribute Buff" || cf.tagName === "Skill Buff" || cf.tagName === "Resources Buff") && cf.fieldName === "Amount") {
                                return (<div key={cf.key}>{labelEl}<input type="number" value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} placeholder="e.g. +2 or -1" className={inputClass} style={inputStyle} /></div>);
                              }

                              // ── Skill Buff / Disadvantageous → Skill dropdown ──
                              if ((cf.tagName === "Skill Buff" || cf.tagName === "Disadvantageous") && cf.fieldName === "Skill") {
                                const ALL_SKILLS = ["Athletics", "Grappling", "Acrobatics", "Sleight of Hand", "Stealth", "Endurance", "Shock", "History", "Investigation", "Arcana", "Religion", "Medicine", "Nature", "Technology/Tinkering", "Perception", "Insight", "Survival", "Persuasion", "Charm", "Control", "Clear Mind"];
                                return (<div key={cf.key}>{labelEl}<select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Skill —</option>{ALL_SKILLS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>);
                              }

                              // ── Resources Buff → Resource dropdown ──
                              if (cf.tagName === "Resources Buff" && cf.fieldName === "Resource") {
                                const ALL_RESOURCES = ["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
                                return (<div key={cf.key}>{labelEl}<select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Resource —</option>{ALL_RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>);
                              }

                              // ── Status Effect → Effect Name (dropdown of existing status tags + custom entry) ──
                              if (cf.tagName === "Status Effect" && cf.fieldName === "Effect Name") {
                                const existingEffects = statusTags.map(t => t.name);
                                const currentVal = editingItem.customFields[cf.key] || "";
                                const isCustom = currentVal !== "" && !existingEffects.includes(currentVal);
                                const showTextInput = isCustom || currentVal === "";
                                return (
                                  <div key={cf.key}>
                                    {labelEl}
                                    <select value={isCustom ? "__custom__" : currentVal} onChange={(e) => updateItemCustomField(cf.key, e.target.value === "__custom__" ? "" : e.target.value)} className={inputClass} style={inputStyle}>
                                      <option value="">— Select Status Effect —</option>
                                      {existingEffects.map(e => <option key={e} value={e}>{e}</option>)}
                                      <option value="__custom__">✎ Custom (type below)...</option>
                                    </select>
                                    {showTextInput && (
                                      <input type="text" value={isCustom ? currentVal : ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} placeholder="Or type a new status effect name..." className={`${inputClass} mt-1`} style={inputStyle} />
                                    )}
                                  </div>
                                );
                              }

                              // ── Default: type-aware input ──
                              return renderTypedField(
                                cf.key,
                                cf.fieldDef,
                                editingItem.customFields[cf.key] || cf.fieldDef.defaultValue || "",
                                updateItemCustomField,
                                labelEl,
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    <div className="mb-4">
                      <label className="text-[10px] block mb-1" style={labelStyle}>Item Description:</label>
                      <RichTextEditor value={editingItem.description} onChange={(html) => updateItemField("description", html)} placeholder="Enter item description..." minHeight={80} />
                    </div>

                    {/* Effect areas (when "Effect" tag is active) */}
                    {editingItem.tags.includes("Effect") && (() => {
                      // Gather existing effect keys in order
                      const effectKeys = Object.keys(editingItem.customFields)
                        .filter(k => k.startsWith("Effect::"))
                        .sort((a, b) => parseInt(a.split("::")[1]) - parseInt(b.split("::")[1]));
                      if (effectKeys.length === 0) effectKeys.push("Effect::0");
                      const nextIdx = effectKeys.length > 0
                        ? Math.max(...effectKeys.map(k => parseInt(k.split("::")[1]))) + 1
                        : 0;
                      return (
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px]" style={DM_EFFECT_HDR}>EFFECT DESCRIPTIONS</div>
                            <button
                              onClick={() => updateItemCustomField(`Effect::${nextIdx}`, "")}
                              className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`}
                              style={DM_PURPLE}
                            >
                              <Plus size={10} /> Add Effect
                            </button>
                          </div>
                          <div className="space-y-3">
                            {effectKeys.map((key, i) => (
                              <div key={key} className={`${retro.raised} bg-[#0E0E35] p-3`}>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[9px]" style={DM_EFFECT_LABEL}>Effect #{i + 1}</label>
                                  {effectKeys.length > 1 && (
                                    <button
                                      onClick={async () => {
                                        const cf = { ...editingItem.customFields };
                                        delete cf[key];
                                        setEditingItem({ ...editingItem, customFields: cf });
                                      }}
                                      className="hover:opacity-80"
                                    >
                                      <X size={12} style={S_RED} />
                                    </button>
                                  )}
                                </div>
                                <RichTextEditor
                                  value={editingItem.customFields[key] || ""}
                                  onChange={(html) => updateItemCustomField(key, html)}
                                  placeholder="Describe this effect..."
                                  minHeight={60}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex gap-2">
                      <button onClick={handleSaveItem} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                        <Save size={14} /> {isAddingNewItem ? "Add Item" : "Save Changes"}
                      </button>
                      <button onClick={handleCancelItemEdit} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Item List */}
                <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                  {/* Sub-tabs: All | Ownerless/Templates | per-Player */}
                  <div className="flex items-center gap-1 mb-3 overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#2A2A5B #0C0C2E" }}>
                    {[
                      { id: "all", label: "All" },
                      { id: "ownerless", label: "Templates" },
                      ...players.map(p => ({ id: p.id, label: p.name })),
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setItemFilterTab(tab.id)}
                        className={`${itemFilterTab === tab.id ? retro.sunken + " bg-[#0E0E35]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-1.5 text-[10px] shrink-0 transition-colors`}
                        style={dmTabStyle(itemFilterTab === tab.id)}
                      >
                        {tab.label}
                        <span className="ml-1 text-[8px] opacity-60">
                          {tab.id === "all" ? managedItems.length
                            : tab.id === "ownerless" ? managedItems.filter(i => i.assignedTo.length === 0).length
                            : managedItems.filter(i => i.assignedTo.includes("all") || i.assignedTo.includes(tab.id)).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const filteredItems = itemFilterTab === "all" ? managedItems
                      : itemFilterTab === "ownerless" ? managedItems.filter(i => i.assignedTo.length === 0)
                      : managedItems.filter(i => i.assignedTo.includes("all") || i.assignedTo.includes(itemFilterTab));
                    return filteredItems.length === 0 ? (
                    <div className="text-[12px] text-center py-6" style={S_MUTED}>No items {itemFilterTab === "all" ? "created yet" : "in this category"}.</div>
                  ) : (
                    <div className="space-y-2">
                      {filteredItems.map((item) => {
                        const ownerStr = formatOwners(item.assignedTo, players);
                        const itemCustomFields = getActiveCustomFields(item, itemTags).filter((cf) => item.customFields[cf.key]);
                        return (
                          <div key={item.id} className={`${retro.raised} bg-[#0E0E35] p-3`}>
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[13px]" style={S_TEXT_BOLD}>{item.name}</span>
                                  <span className="text-[9px] px-1.5 py-0.5" style={dmRarityBadge(rarityColor(item.rarity))}>{item.rarity}</span>
                                  {item.locked && (
                                    <span className="text-[8px] px-1.5 py-0.5 flex items-center gap-0.5" style={DM_LOCKED_BADGE}>
                                      <Lock size={8} /> LOCKED
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px]" style={S_MUTED}>{item.type} · Assigned to: {ownerStr}</div>
                                {item.duplicatedFrom && (
                                  <div className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "#C4A0FF" }}>
                                    <Copy size={9} /> Duplicated from: <span style={{ color: "#E0C0FF" }}>{item.duplicatedFrom}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={async () => {
                                    const currentIds = new Set(item.assignedTo.includes("all") ? players.map(p => p.id) : item.assignedTo);
                                    const missing = players.filter(p => !currentIds.has(p.id));
                                    if (missing.length === 0) return;
                                    const newItems = missing.map(p => ({
                                      ...item,
                                      id: `mi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                                      assignedTo: [p.id],
                                      customFields: { ...item.customFields },
                                      duplicatedFrom: item.name || "Unknown Item",
                                    }));
                                    await persistItems([...managedItems, ...newItems]);
                                  }}
                                  className={`${retro.button} px-3 py-1 text-[11px]`}
                                  style={{ color: "#C4A0FF" }}
                                  title="Create a copy for every player who doesn't have this item"
                                >
                                  <Copy size={12} className="inline mr-1" />Duplicate to All
                                </button>
                                <button onClick={async () => { originalAssignedToRef.current = [...item.assignedTo]; setEditingItem({ ...item, customFields: { ...item.customFields } }); setIsAddingNewItem(false); }} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_ACCENT}>
                                  <Edit size={12} className="inline mr-1" />Edit
                                </button>
                                <button onClick={() => handleDeleteItem(item.id)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_RED}>
                                  <Trash2 size={12} className="inline mr-1" />Remove
                                </button>
                              </div>
                            </div>
                            {item.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {item.tags.map((t) => (
                                  <span key={t} className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{t}</span>
                                ))}
                              </div>
                            )}
                            {/* Show custom field values */}
                            {itemCustomFields.length > 0 && (
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                                {itemCustomFields.map((cf) => (
                                  <span key={cf.key} className="text-[10px]">
                                    <span style={S_MUTED}>{cf.fieldName}:</span>{" "}
                                    <span style={S_TEXT}>{item.customFields[cf.key]}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                            {item.description && (
                              <div className="text-[11px] mt-1" style={S_SUBTLE}>{item.description}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                  })()}
                </div>
              </div>
            );
          })()}

          {/* ======================================================= */}
          {/* MANAGE CARDS                                             */}
          {/* ======================================================= */}
          {activeSection === "cards" && (() => {
            const activeCardCustomFields = editingCard ? getActiveCustomFields(editingCard, cardTags) : [];

            return (
              <div className="space-y-4">
                <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage Cards</h2>

                {/* Sub-tabs: Player Cards | Level Abilities */}
                <div className="flex gap-2 mb-2">
                  {([
                    { id: "cards" as const, label: "Player Cards", icon: CreditCard, accent: "#4A7BFF" },
                    { id: "levelabilities" as const, label: "Level Abilities", icon: Zap, accent: "#FFD700" },
                  ]).map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setDmCardsSubTab(sub.id)}
                      className={`${dmCardsSubTab === sub.id ? retro.sunken + " bg-[#0C0C2E]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-4 py-2 text-[12px] flex items-center gap-1.5 transition-colors`}
                      style={{ color: dmCardsSubTab === sub.id ? sub.accent : "#8A9ABB", fontWeight: dmCardsSubTab === sub.id ? 600 : 400 }}
                    >
                      <sub.icon size={14} /> {sub.label}
                    </button>
                  ))}
                </div>

                {/* ═══ PLAYER CARDS SUB-TAB ═══ */}
                {dmCardsSubTab === "cards" && (<div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-[12px]" style={S_SECTION_HDR}>PLAYER CARDS</div>
                  <button onClick={handleAddCard} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                    <Plus size={14} /> Add Card
                  </button>
                </div>

                {/* Card Edit Form */}
                {editingCard && (
                  <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[12px]" style={S_SECTION_HDR}>
                        {isAddingNewCard ? "ADD NEW CARD" : `EDITING: ${editingCard.name || "(unnamed)"}`}
                      </div>
                      <button onClick={handleCancelCardEdit} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
                    </div>

                    {/* Row 1: Name, Type, Action Cost, Level */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Card Name:</label>
                        <input type="text" value={editingCard.name} onChange={(e) => updateCardField("name", e.target.value)} placeholder="Enter card name..." className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Card Type:</label>
                        <input type="text" value={editingCard.type} onChange={(e) => updateCardField("type", e.target.value)} placeholder="e.g., Combat, Utility..." className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Action Cost:</label>
                        <input type="text" value={editingCard.actionCost} onChange={(e) => updateCardField("actionCost", e.target.value)} placeholder="e.g., 1 Action, Instant..." className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Level (Source Cost):</label>
                        <input type="number" min="0" value={editingCard.customFields["Level"] || ""} onChange={(e) => updateCardCustomField("Level", e.target.value)} placeholder="0" className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Source Type:</label>
                        <input type="text" value={editingCard.customFields["Source Type"] || ""} onChange={(e) => updateCardCustomField("Source Type", e.target.value)} placeholder="e.g., Arcane, Divine, Martial..." className={inputClass} style={inputStyle} />
                      </div>
                    </div>

                    {/* Player */}
                    <div className="mb-4">
                      <label className="text-[10px] block mb-1" style={labelStyle}>Assign to Players:</label>
                      <div className={`${retro.sunken} bg-[#0A0A28] p-3 w-full md:w-2/3`}>
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input type="checkbox" checked={editingCard.assignedTo.includes("all")} onChange={(e) => {
                            if (e.target.checked) updateCardField("assignedTo", ["all"]);
                            else updateCardField("assignedTo", []);
                          }} className="accent-[#4A9A5A]" />
                          <span className="text-[12px]" style={S_GREEN_BTN}>All Players</span>
                        </label>
                        <div className="h-[1px] mb-2" style={DM_DIVIDER} />
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {players.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" disabled={editingCard.assignedTo.includes("all")} checked={editingCard.assignedTo.includes("all") || editingCard.assignedTo.includes(p.id)} onChange={(e) => {
                                const current = editingCard.assignedTo.filter((id) => id !== "all");
                                if (e.target.checked) updateCardField("assignedTo", [...current, p.id]);
                                else updateCardField("assignedTo", current.filter((id) => id !== p.id));
                              }} className="accent-[#4A7BFF]" />
                              <span className="text-[12px]" style={dmAssignDim(editingCard.assignedTo.includes("all"))}>{p.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Node Tree / Node Assignment */}
                    <div className="mb-4">
                      <label className="text-[10px] block mb-1" style={labelStyle}>Node Tree Assignment (optional):</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] block mb-1" style={S_MUTED}>Node Tree:</label>
                          <select
                            value={editingCard.nodeTreeId || ""}
                            onChange={(e) => {
                              updateCardField("nodeTreeId" as keyof ManagedCard, e.target.value as any);
                              updateCardField("nodeId" as keyof ManagedCard, "" as any);
                            }}
                            className={`${inputClass} cursor-pointer`} style={inputStyle}
                          >
                            <option value="">-- None --</option>
                            {nodeTrees.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] block mb-1" style={S_MUTED}>Node:</label>
                          <select
                            value={editingCard.nodeId || ""}
                            onChange={(e) => updateCardField("nodeId" as keyof ManagedCard, e.target.value as any)}
                            className={`${inputClass} cursor-pointer`} style={inputStyle}
                            disabled={!editingCard.nodeTreeId}
                          >
                            <option value="">-- None --</option>
                            {editingCard.nodeTreeId &&
                              nodeTrees
                                .find((t) => t.id === editingCard.nodeTreeId)
                                ?.nodes.map((n) => (
                                  <option key={n.id} value={n.id}>{n.label}</option>
                                ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="mb-4">
                      <label className="text-[10px] block mb-2" style={labelStyle}>Tags (click to toggle):</label>
                      <div className="flex flex-wrap gap-1.5">
                        {cardTags.map((tag) => {
                          const active = editingCard.tags.includes(tag.name);
                          return (
                            <button key={tag.id} onClick={() => toggleCardTag(tag.name)} className="text-[10px] px-2.5 py-1 transition-colors flex items-center gap-1" style={dmActiveBtn(active)}>
                              {tag.name}
                              {tag.fields.length > 0 && <span className="text-[8px] opacity-70">+{tag.fields.length}</span>}
                            </button>
                          );
                        })}
                        {cardTags.length === 0 && <span className="text-[11px]" style={S_MUTED}>No card tags defined. Create tags in "Manage Tags" first.</span>}
                      </div>
                    </div>

                    {/* Custom Fields from Tags */}
                    {activeCardCustomFields.length > 0 && (
                      <div className="mb-4">
                        <div className="text-[10px] mb-2" style={S_SECTION_HDR}>TAG FIELDS</div>
                        <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {activeCardCustomFields.map((cf) => {
                              const cfLabel = (
                                <label className="text-[10px] block mb-1" style={S_ACCENT}>
                                  <span style={S_MUTED}>{cf.tagName} ›</span> {cf.fieldName}:
                                </label>
                              );

                              if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Type") {
                                return (
                                  <div key={cf.key}>
                                    {cfLabel}
                                    <select value={editingCard.customFields[cf.key] || ""} onChange={(e) => {
                                      updateCardCustomField(cf.key, e.target.value);
                                      updateCardCustomField(cfKey("Timed Effect", "Buff Target"), "");
                                    }} className={inputClass} style={inputStyle}>
                                      <option value="">— None —</option>
                                      <option value="attribute">Attribute</option>
                                      <option value="skill">Skill</option>
                                      <option value="resource">Resource</option>
                                    </select>
                                  </div>
                                );
                              }

                              if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Target") {
                                const buffTypeVal = editingCard.customFields[cfKey("Timed Effect", "Buff Type")] || "";
                                const ATTRS_TE = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL"];
                                const ALL_SKILLS_TE = ["Athletics", "Grappling", "Acrobatics", "Sleight of Hand", "Stealth", "Endurance", "Shock", "History", "Investigation", "Arcana", "Religion", "Medicine", "Nature", "Technology/Tinkering", "Perception", "Insight", "Survival", "Persuasion", "Charm", "Control", "Clear Mind"];
                                const ALL_RESOURCES_TE = ["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
                                const options = buffTypeVal === "attribute" ? ATTRS_TE : buffTypeVal === "skill" ? ALL_SKILLS_TE : buffTypeVal === "resource" ? ALL_RESOURCES_TE : [];
                                const currentVal = editingCard.customFields[cf.key] || "";
                                const isValid = !currentVal || options.includes(currentVal);
                                if (!buffTypeVal) {
                                  return (
                                    <div key={cf.key}>
                                      {cfLabel}
                                      <input type="text" disabled placeholder="Select a Buff Type first..." className={inputClass} style={{ ...inputStyle, opacity: 0.4 }} />
                                    </div>
                                  );
                                }
                                return (
                                  <div key={cf.key}>
                                    {cfLabel}
                                    <select value={isValid ? currentVal : "__invalid__"} onChange={(e) => updateCardCustomField(cf.key, e.target.value === "__invalid__" ? "" : e.target.value)} className={inputClass} style={inputStyle}>
                                      <option value="">
                                        — Select {buffTypeVal === "attribute" ? "Attribute" : buffTypeVal === "skill" ? "Skill" : "Resource"} —
                                      </option>
                                      {!isValid && <option value="__invalid__" disabled style={S_RED}>⚠ "{currentVal}" (not recognized)</option>}
                                      {options.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                    {!isValid && (
                                      <div className="text-[9px] mt-1 flex items-center gap-1" style={S_RED}>
                                        ⚠ "{currentVal}" won't apply — pick a valid {buffTypeVal} from the list
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Value") {
                                const buffTypeVal = editingCard.customFields[cfKey("Timed Effect", "Buff Type")] || "";
                                return (
                                  <div key={cf.key}>
                                    {cfLabel}
                                    <input type="text" value={editingCard.customFields[cf.key] || ""} onChange={(e) => updateCardCustomField(cf.key, e.target.value)} placeholder={buffTypeVal ? "e.g. +2, P, -1" : "Select Buff Type first..."} disabled={!buffTypeVal} className={inputClass} style={{ ...inputStyle, ...(!buffTypeVal ? { opacity: 0.4 } : {}) }} title="Buff value — use P for Potency substitution" />
                                  </div>
                                );
                              }

                              if (cf.tagName === "Buff" && cf.fieldName === "Stat") {
                                const ALL_BUFF_STATS = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL", "Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
                                const currentVal = editingCard.customFields[cf.key] || "";
                                const isValid = !currentVal || ALL_BUFF_STATS.includes(currentVal);
                                return (
                                  <div key={cf.key}>
                                    {cfLabel}
                                    <select value={isValid ? currentVal : "__invalid__"} onChange={(e) => updateCardCustomField(cf.key, e.target.value === "__invalid__" ? "" : e.target.value)} className={inputClass} style={inputStyle}>
                                      <option value="">— Select Stat —</option>
                                      {!isValid && <option value="__invalid__" disabled style={S_RED}>⚠ "{currentVal}" (not recognized)</option>}
                                      <optgroup label="Attributes">
                                        {["STR", "AGI", "CON", "KNOW", "WIS", "WILL"].map(a => <option key={a} value={a}>{a}</option>)}
                                      </optgroup>
                                      <optgroup label="Resources">
                                        {["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"].map(r => <option key={r} value={r}>{r}</option>)}
                                      </optgroup>
                                    </select>
                                    {!isValid && (
                                      <div className="text-[9px] mt-1 flex items-center gap-1" style={S_RED}>
                                        ⚠ "{currentVal}" won't be recognized — pick from the list
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              return renderTypedField(
                                cf.key,
                                cf.fieldDef,
                                editingCard.customFields[cf.key] || cf.fieldDef.defaultValue || "",
                                updateCardCustomField,
                                cfLabel,
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Effect */}
                    <div className="mb-4">
                      <label className="text-[10px] block mb-1" style={labelStyle}>Card Effect:</label>
                      <RichTextEditor value={editingCard.effect} onChange={(html) => updateCardField("effect", html)} placeholder="Enter card effect description..." minHeight={80} />
                    </div>

                    <div className="flex gap-2">
                      <button onClick={handleSaveCard} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                        <Save size={14} /> {isAddingNewCard ? "Add Card" : "Save Changes"}
                      </button>
                      <button onClick={handleCancelCardEdit} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Card List */}
                <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                  <div className="text-[12px] mb-3" style={S_SECTION_HDR}>ALL CARDS ({managedCards.length})</div>
                  {managedCards.length === 0 ? (
                    <div className="text-[12px] text-center py-6" style={S_MUTED}>No cards created yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {managedCards.map((card) => {
                        const ownerStr = formatOwners(card.assignedTo, players);
                        const cardCustomFields = getActiveCustomFields(card, cardTags).filter((cf) => card.customFields[cf.key]);
                        return (
                          <div key={card.id} className={`${retro.raised} bg-[#0E0E35] p-3`}>
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[13px]" style={S_TEXT_BOLD}>{card.name}</span>
                                  <span className="text-[9px] px-1.5 py-0.5" style={DM_ACTION_BADGE}>{card.actionCost}</span>
                                  {card.customFields["Level"] && parseInt(card.customFields["Level"]) > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5" style={DM_LEVEL_BADGE}>Lv.{card.customFields["Level"]}</span>
                                  )}
                                  {card.customFields["Source Type"] && (
                                    <span className="text-[9px] px-1.5 py-0.5" style={{ color: "#9A7ABB", border: "1px solid #9A7ABB40", background: "#9A7ABB15" }}>{card.customFields["Source Type"]}</span>
                                  )}
                                </div>
                                <div className="text-[11px]" style={S_MUTED}>
                                  {card.type} · Assigned to: {ownerStr}
                                  {card.nodeTreeId && (() => {
                                    const nt = nodeTrees.find((t) => t.id === card.nodeTreeId);
                                    const nd = nt?.nodes.find((n) => n.id === card.nodeId);
                                    return nt ? (
                                      <span style={DISPLAY_CONTENTS}>
                                        {" "}· <GitBranch size={9} className="inline" style={DM_NODE_ICON} /> {nt.name}{nd ? ` / ${nd.label}` : ""}
                                      </span>
                                    ) : null;
                                  })()}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={async () => { setEditingCard({ ...card, customFields: { ...card.customFields } }); setIsAddingNewCard(false); }} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_ACCENT}>
                                  <Edit size={12} className="inline mr-1" />Edit
                                </button>
                                <button onClick={() => handleDeleteCard(card.id)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_RED}>
                                  <Trash2 size={12} className="inline mr-1" />Remove
                                </button>
                              </div>
                            </div>
                            {card.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {card.tags.map((t) => (
                                  <span key={t} className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{t}</span>
                                ))}
                              </div>
                            )}
                            {cardCustomFields.length > 0 && (
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                                {cardCustomFields.map((cf) => (
                                  <span key={cf.key} className="text-[10px]">
                                    <span style={S_MUTED}>{cf.fieldName}:</span>{" "}
                                    <span style={S_TEXT}>{card.customFields[cf.key]}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                            {card.effect && (
                              <div className="text-[11px] mt-1" style={S_SUBTLE}>{card.effect}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                </div>)}

                {/* ═══ LEVEL ABILITIES SUB-TAB ═══ */}
                {dmCardsSubTab === "levelabilities" && (() => {
                  const sortedLevels = [...levelCategories].sort((a, b) => a.order - b.order);
                  const selectedPlayer = players.find(p => p.id === laSelectedPlayerId);
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-[12px]" style={S_SECTION_HDR}>LEVEL ABILITY CATEGORIES</div>
                      </div>
                      <p className="text-[10px]" style={S_SUBTLE}>
                        Create level categories per player and assign cards to them. Each player has their own set of level categories. Select a player below to manage their Level Abilities.
                      </p>

                      {/* Player Tabs */}
                      {players.length === 0 ? (
                        <div className="text-[12px] text-center py-6" style={S_MUTED}>No players created yet. Add players in the Manage Players section first.</div>
                      ) : (
                      <div>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {players.map(p => {
                          const isActive = laSelectedPlayerId === p.id;
                          const totalCards = isActive
                            ? levelCategories.reduce((sum, c) => sum + c.cardIds.length, 0)
                            : 0;

                          return (
                            <button
                              key={p.id}
                              onClick={() => setLaSelectedPlayerId(p.id)}
                              className={`${isActive ? retro.sunken + " bg-[#0C0C2E]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-2 text-[11px] flex items-center gap-1.5 transition-colors`}
                              style={{
                                color: isActive ? "#FFD700" : "#8A9ABB",
                                fontWeight: isActive ? 600 : 400,
                                borderBottom: isActive ? "2px solid #FFD700" : "2px solid transparent",
                              }}
                            >
                              <User size={12} />
                              {p.name}

                              {isActive && (
                                <span
                                  className="text-[9px] px-1 py-0.5 ml-0.5"
                                  style={{
                                    background: "#0A0A28",
                                    color: "#FFD700",
                                    border: "1px solid #FFD70044",
                                  }}
                                >
                                  {levelCategories.length} lvl · {totalCards} cards
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Copy to All Players */}
                      {selectedPlayer && (
                        <div className="flex items-center gap-2 mb-3">
                          {!laCopyConfirm ? (
                            <button
                              onClick={() => setLaCopyConfirm(true)}
                              className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1.5`}
                              style={{ color: "#C4A0FF", border: "1px solid #C4A0FF33" }}
                              title={`Copy ${selectedPlayer.name}'s level categories to all other players`}
                            >
                              <Copy size={11} /> Copy {selectedPlayer.name}'s Levels to All Players
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px]" style={{ color: "#FF9A4A" }}>
                                This will overwrite all other players' level categories with {selectedPlayer.name}'s. Continue?
                              </span>
                              <button
                                onClick={copyLevelCategoriesToAllPlayers}
                                className={`${retro.button} px-3 py-1.5 text-[10px]`}
                                style={S_GREEN_BTN}
                              >
                                Yes, Copy
                              </button>
                              <button
                                onClick={() => setLaCopyConfirm(false)}
                                className={`${retro.button} px-3 py-1.5 text-[10px]`}
                                style={S_RED}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Add Level Category */}
                      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                        {laAddingLevel ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={laNewLevelName}
                              onChange={e => setLaNewLevelName(e.target.value)}
                              placeholder="Level name (e.g. Level 1, Tier 2...)"
                              className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] flex-1 outline-none`}
                              style={{ color: "#FFD700" }}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter" && laNewLevelName.trim()) {
                                  const newCat = { id: `lvl-${Date.now()}`, name: laNewLevelName.trim(), order: levelCategories.length, cardIds: [] as string[], description: "" };
                                  saveLevelCategories([...levelCategories, newCat]);
                                  setLaNewLevelName(""); setLaAddingLevel(false);
                                }
                              }}
                              autoFocus
                            />
                            <button
                              onClick={async () => {
                                if (laNewLevelName.trim()) {
                                  const newCat = { id: `lvl-${Date.now()}`, name: laNewLevelName.trim(), order: levelCategories.length, cardIds: [] as string[], description: "" };
                                  saveLevelCategories([...levelCategories, newCat]);
                                  setLaNewLevelName(""); setLaAddingLevel(false);
                                }
                              }}
                              className={`${retro.button} px-3 py-2 text-[11px]`} style={S_GREEN_BTN}
                            ><Plus size={12} /> Add</button>
                            <button onClick={async () => { setLaAddingLevel(false); setLaNewLevelName(""); }} className={`${retro.button} px-3 py-2 text-[11px]`} style={S_RED}>
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setLaAddingLevel(true)}
                            className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`}
                            style={{ color: "#FFD700", border: "1px solid #FFD70044" }}
                          >
                            <Plus size={14} /> Add Level Category
                          </button>
                        )}
                      </div>

                      {selectedPlayer && sortedLevels.length === 0 ? (
                        <div className="text-[12px] text-center py-8" style={S_MUTED}>No level categories created for {selectedPlayer.name} yet. Add one above to get started.</div>
                      ) : selectedPlayer && (
                        <div className="space-y-3">
                          {(() => {
                            // Only show cards assigned to the selected player
                            const playerAssignedCards = managedCards.filter(c =>
                              c.assignedTo.includes(laSelectedPlayerId) || c.assignedTo.includes("all")
                            );
                            const totalCards = managedCards.length;
                            const playerCardCount = playerAssignedCards.length;
                            const unassignedToLevelCount = playerAssignedCards.filter(c => !levelCategories.some(lc => lc.cardIds.includes(c.id))).length;
                            return (<>
                            <div className="flex items-center gap-3 flex-wrap px-1 mb-1">
                              <span className="text-[10px] px-2 py-1" style={{ background: "#0A0A28", color: "#7A8AAA", border: "1px solid #1A1A4B" }}>
                                <CreditCard size={10} className="inline mr-1 -mt-0.5" />{playerCardCount} of {totalCards} cards assigned to {selectedPlayer?.name}
                              </span>
                              {unassignedToLevelCount > 0 && (
                                <span className="text-[10px] px-2 py-1" style={{ background: "#1A0A0A", color: "#FF9A5A", border: "1px solid #4B2A1A" }}>
                                  {unassignedToLevelCount} card{unassignedToLevelCount !== 1 ? "s" : ""} not in any level
                                </span>
                              )}
                            </div>
                            {sortedLevels.map((level, levelIdx) => {
                            const isCollapsed = laCollapsedLevels.has(level.id);
                            const levelCards = playerAssignedCards.filter(c => level.cardIds.includes(c.id));
                            const assignedCardIds = new Set(levelCategories.flatMap(lc => lc.cardIds));
                            const availableCards = playerAssignedCards.filter(c => !assignedCardIds.has(c.id));
                            return (
                              <div key={level.id} className={`${retro.sunken} bg-[#0C0C2E]`}>
                                {/* Level Header */}
                                <div
                                  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-[#0E0E35] transition-colors"
                                  style={{ borderBottom: isCollapsed ? "none" : "1px solid #1A1A4B" }}
                                  onClick={() => setLaCollapsedLevels(prev => { const n = new Set(prev); if (n.has(level.id)) n.delete(level.id); else n.add(level.id); return n; })}
                                >
                                  <ChevronRight
                                    size={14}
                                    style={{ color: "#FFD700", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 0.2s ease" }}
                                  />
                                  {laEditingLevel === level.id ? (
                                    <input
                                      value={level.name}
                                      onClick={e => e.stopPropagation()}
                                      onChange={e => saveLevelCategories(levelCategories.map(lc => lc.id === level.id ? { ...lc, name: e.target.value } : lc))}
                                      onBlur={() => setLaEditingLevel(null)}
                                      onKeyDown={async (e) => { if (e.key === "Enter") setLaEditingLevel(null); }}
                                      className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[13px] flex-1 outline-none`}
                                      style={{ color: "#FFD700" }}
                                      autoFocus
                                    />
                                  ) : (
                                    <span className="text-[13px] flex-1" style={{ color: "#FFD700", fontWeight: 600 }}>{level.name}</span>
                                  )}
                                  <span className="text-[9px] px-1.5 py-0.5" style={{ background: "#0A0A28", color: "#7A8AAA", border: "1px solid #1A1A4B" }}>
                                    {levelCards.length} card{levelCards.length !== 1 ? "s" : ""}
                                  </span>
                                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                    {levelIdx > 0 && (
                                      <button onClick={async () => {
                                        const prev = sortedLevels[levelIdx - 1];
                                        saveLevelCategories(levelCategories.map(l => l.id === level.id ? { ...l, order: prev.order } : l.id === prev.id ? { ...l, order: level.order } : l));
                                      }} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#7A8AAA" }} title="Move up"><ChevronUp size={12} /></button>
                                    )}
                                    {levelIdx < sortedLevels.length - 1 && (
                                      <button onClick={async () => {
                                        const next = sortedLevels[levelIdx + 1];
                                        saveLevelCategories(levelCategories.map(l => l.id === level.id ? { ...l, order: next.order } : l.id === next.id ? { ...l, order: level.order } : l));
                                      }} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#7A8AAA" }} title="Move down"><ChevronDown size={12} /></button>
                                    )}
                                    <button onClick={() => setLaEditingLevel(level.id)} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#4A7BFF" }} title="Rename"><Edit size={12} /></button>
                                    <button onClick={() => saveLevelCategories(levelCategories.filter(lc => lc.id !== level.id))} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#FF5A5A" }} title="Delete category"><Trash2 size={12} /></button>
                                  </div>
                                </div>

                                {/* Level Body */}
                                {!isCollapsed && (
                                  <div className="px-4 pb-4 pt-2 space-y-3">
                                    {/* Description */}
                                    <div>
                                      <div className="text-[10px] mb-1" style={S_SECTION_HDR}>DESCRIPTION</div>
                                      {laEditingDesc === level.id ? (
                                        <div className="space-y-2">
                                          <textarea
                                            value={level.description || ""}
                                            onChange={e => saveLevelCategories(levelCategories.map(lc => lc.id === level.id ? { ...lc, description: e.target.value } : lc))}
                                            placeholder="Add a description for this level category..."
                                            className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[11px] w-full outline-none resize-y min-h-[60px]`}
                                            style={{ color: "#C0D0F0" }}
                                            rows={3}
                                          />
                                          <button onClick={() => setLaEditingDesc(null)} className={`${retro.button} px-3 py-1 text-[10px]`} style={S_ACCENT}>Done</button>
                                        </div>
                                      ) : (
                                        <div
                                          className="text-[11px] cursor-pointer px-2 py-1.5 hover:bg-[#0A0A28] transition-colors"
                                          style={{ color: level.description ? "#C0D0F0" : "#4A5A7A", border: "1px dashed #1A1A4B" }}
                                          onClick={() => setLaEditingDesc(level.id)}
                                        >
                                          {level.description || "Click to add a description..."}
                                        </div>
                                      )}
                                    </div>

                                    {/* Assigned Cards */}
                                    <div>
                                      <div className="text-[10px] mb-1" style={S_SECTION_HDR}>ASSIGNED CARDS ({levelCards.length})</div>
                                      {levelCards.length === 0 ? (
                                        <div className="text-[11px] py-2" style={S_MUTED}>No cards assigned to this level yet.</div>
                                      ) : (
                                        <div className="space-y-1">
                                          {levelCards.map(card => (
                                            <div key={card.id} className={`${retro.raised} bg-[#0E0E35] p-2 flex items-center justify-between`}>
                                              <div>
                                                <span className="text-[12px]" style={S_TEXT_BOLD}>{card.name}</span>
                                                <span className="text-[10px] ml-2" style={S_MUTED}>{card.type} · {card.actionCost}</span>
                                                {card.tags.length > 0 && (
                                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                                    {card.tags.map(t => <span key={t} className="text-[8px] px-1 py-0.5" style={DM_TAG_BADGE}>{t}</span>)}
                                                  </div>
                                                )}
                                              </div>
                                              <button
                                                onClick={() => saveLevelCategories(levelCategories.map(lc => lc.id === level.id ? { ...lc, cardIds: lc.cardIds.filter(cid => cid !== card.id) } : lc))}
                                                className={`${retro.button} px-2 py-1 text-[10px] shrink-0`} style={S_RED}
                                              >
                                                <X size={10} className="inline mr-0.5" />Remove
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Assign Card Dropdown */}
                                    {availableCards.length > 0 && (
                                      <div>
                                        <div className="text-[10px] mb-1" style={S_SECTION_HDR}>ADD CARD</div>
                                        <select
                                          className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[11px] w-full outline-none`}
                                          style={{ color: "#C0D0F0" }}
                                          value=""
                                          onChange={e => {
                                            if (!e.target.value) return;
                                            const cardId = e.target.value;
                                            saveLevelCategories(levelCategories.map(lc => ({
                                              ...lc,
                                              cardIds: lc.id === level.id
                                                ? [...lc.cardIds.filter(cid => cid !== cardId), cardId]
                                                : lc.cardIds.filter(cid => cid !== cardId),
                                            })));
                                          }}
                                        >
                                          <option value="">+ Assign a card to {level.name}...</option>
                                          {availableCards.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}</>); })()}
                        </div>
                      )}
                      </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            );
          })()}

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
          {activeSection === "info" && (() => {
            const activeInfoCustomFields = editingInfo ? getActiveCustomFields(editingInfo, infoTags) : [];

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage Player Information</h2>
                  <button onClick={handleAddInfo} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                    <Plus size={14} /> Add Info
                  </button>
                </div>

                {/* Info Sub-Tab Management */}
                <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                  <div className="text-[12px] mb-3" style={S_SECTION_HDR}>INFORMATION SUB-TABS</div>
                  <div className="text-[10px] mb-3" style={S_MUTED}>
                    Create sub-tabs to organize information. Players will see these as tabs in their Information section.
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[...infoSubTabs].sort((a, b) => a.order - b.order).map(st => (
                      <div key={st.id} className="flex items-center gap-1.5 px-2.5 py-1.5" style={DM_PANEL}>
                        {editingInfoSubTabId === st.id ? (
                          <div style={DISPLAY_CONTENTS}>
                            <input
                              type="text"
                              value={editingInfoSubTabName}
                              onChange={(e) => setEditingInfoSubTabName(e.target.value)}
                              className={inputClass}
                              style={{ ...inputStyle, width: 120 }}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter" && editingInfoSubTabName.trim()) {
                                  const next = infoSubTabs.map((s) =>
                                    s.id === st.id ? { ...s, name: editingInfoSubTabName.trim() } : s
                                  );
                                  await persistInfoSubTabs(next);
                                  setEditingInfoSubTabId(null);
                                }
                              }}
                            />
                            <button onClick={async () => {
                              if (editingInfoSubTabName.trim()) {
                                const next = infoSubTabs.map((s) =>
                                  s.id === st.id ? { ...s, name: editingInfoSubTabName.trim() } : s
                                );
                                await persistInfoSubTabs(next);
                                setEditingInfoSubTabId(null);
                              }
                              setEditingInfoSubTabId(null);
                            }} className="text-[10px]" style={S_GREEN_BTN}>✓</button>
                            <button onClick={() => setEditingInfoSubTabId(null)} className="text-[10px]" style={S_RED}>✕</button>
                          </div>
                        ) : (
                          <div style={DISPLAY_CONTENTS}>
                            <span className="text-[12px]" style={S_TEXT}>{st.name}</span>
                            <span className="text-[9px] ml-1" style={S_DIM}>
                              ({managedInfos.filter(i => i.infoSubTab === st.id).length})
                            </span>
                            <button onClick={async () => { setEditingInfoSubTabId(st.id); setEditingInfoSubTabName(st.name); }} className="text-[10px] ml-1 hover:opacity-80" style={S_ACCENT}>
                              <Edit size={10} />
                            </button>
                            <button
                              onClick={async () => {
                                const next = infoSubTabs.filter((s) => s.id !== st.id);
                                await persistInfoSubTabs(next);
                              }}
                              className="text-[10px] hover:opacity-80"
                              style={S_RED}
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newInfoSubTabName}
                      onChange={(e) => setNewInfoSubTabName(e.target.value)}
                      placeholder="New sub-tab name..."
                      className={inputClass}
                      style={{ ...inputStyle, width: 200 }}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && newInfoSubTabName.trim()) {
                          const next = [
                            ...infoSubTabs,
                            {
                              id: `ist-${Date.now()}`,
                              name: newInfoSubTabName.trim(),
                              order: infoSubTabs.length,
                            },
                          ];
                          await persistInfoSubTabs(next);
                          setNewInfoSubTabName("");
                        }
                      }}
                    />
                    <button
                      onClick={async () => {
                        if (!newInfoSubTabName.trim()) return;
                        const next = [
                          ...infoSubTabs,
                          { id: `ist-${Date.now()}`, name: newInfoSubTabName.trim(), order: infoSubTabs.length },
                        ];
                        await persistInfoSubTabs(next);
                        setNewInfoSubTabName("");
                      }}
                      disabled={!newInfoSubTabName.trim()}
                      className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1`}
                      style={{ color: newInfoSubTabName.trim() ? "#4A9A5A" : "#3A4A6A" }}
                    >
                      <Plus size={11} /> Add Sub-Tab
                    </button>
                  </div>
                </div>

                {/* Info Edit Form */}
                {editingInfo && (
                  <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[12px]" style={S_SECTION_HDR}>
                        {isAddingNewInfo ? "ADD NEW INFORMATION" : `EDITING: ${editingInfo.title || "(untitled)"}`}
                      </div>
                      <button onClick={handleCancelInfoEdit} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
                    </div>

                    {/* Title + Category + Sub-Tab */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                      <div className="md:col-span-2">
                        <label className="text-[10px] block mb-1" style={labelStyle}>Information Title:</label>
                        <input type="text" value={editingInfo.title} onChange={(e) => updateInfoField("title", e.target.value)} placeholder="e.g., Mission Briefing, Intel Report..." className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Category:</label>
                        <input type="text" value={editingInfo.category || ""} onChange={(e) => updateInfoField("category" as keyof ManagedInfo, e.target.value as any)} placeholder="e.g., Missions, Lore..." className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Info Sub-Tab:</label>
                        <select
                          value={editingInfo.infoSubTab || ""}
                          onChange={(e) => updateInfoField("infoSubTab" as keyof ManagedInfo, e.target.value as any)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          <option value="">None</option>
                          {[...infoSubTabs].sort((a, b) => a.order - b.order).map(st => (
                            <option key={st.id} value={st.id}>{st.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* In-World Time + Real World Time */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>In-World Time:</label>
                        <input type="text" value={editingInfo.inWorldTime || ""} onChange={(e) => updateInfoField("inWorldTime" as keyof ManagedInfo, e.target.value as any)} placeholder="e.g., Day 15, Year 3 of the Eclipse..." className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Real World Time:</label>
                        <input type="text" value={editingInfo.realWorldTime || ""} onChange={(e) => updateInfoField("realWorldTime" as keyof ManagedInfo, e.target.value as any)} placeholder="e.g., Session 12, March 2026..." className={inputClass} style={inputStyle} />
                      </div>
                    </div>

                    {/* Player */}
                    <div className="mb-4">
                      <label className="text-[10px] block mb-1" style={labelStyle}>Assign to:</label>
                      <div className={`${retro.sunken} bg-[#0A0A28] p-3 w-full md:w-2/3`}>
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input type="checkbox" checked={editingInfo.assignedTo.includes("all")} onChange={(e) => {
                            if (e.target.checked) updateInfoField("assignedTo", ["all"]);
                            else updateInfoField("assignedTo", []);
                          }} className="accent-[#4A9A5A]" />
                          <span className="text-[12px]" style={S_GREEN_BTN}>All Players</span>
                        </label>
                        <div className="h-[1px] mb-2" style={DM_DIVIDER} />
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {players.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" disabled={editingInfo.assignedTo.includes("all")} checked={editingInfo.assignedTo.includes("all") || editingInfo.assignedTo.includes(p.id)} onChange={(e) => {
                                const current = editingInfo.assignedTo.filter((id) => id !== "all");
                                if (e.target.checked) updateInfoField("assignedTo", [...current, p.id]);
                                else updateInfoField("assignedTo", current.filter((id) => id !== p.id));
                              }} className="accent-[#4A7BFF]" />
                              <span className="text-[12px]" style={dmAssignDim(editingInfo.assignedTo.includes("all"))}>{p.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="mb-4">
                      <label className="text-[10px] block mb-2" style={labelStyle}>Tags (click to toggle):</label>
                      <div className="flex flex-wrap gap-1.5">
                        {infoTags.map((tag) => {
                          const active = editingInfo.tags.includes(tag.name);
                          return (
                            <button key={tag.id} onClick={() => toggleInfoTag(tag.name)} className="text-[10px] px-2.5 py-1 transition-colors flex items-center gap-1" style={dmActiveBtn(active)}>
                              {tag.name}
                              {tag.fields.length > 0 && <span className="text-[8px] opacity-70">+{tag.fields.length}</span>}
                            </button>
                          );
                        })}
                        {infoTags.length === 0 && <span className="text-[11px]" style={S_MUTED}>No info tags defined. Create tags in "Manage Tags" first.</span>}
                      </div>
                    </div>

                    {/* Custom Fields from Tags */}
                    {activeInfoCustomFields.length > 0 && (
                      <div className="mb-4">
                        <div className="text-[10px] mb-2" style={S_SECTION_HDR}>TAG FIELDS</div>
                        <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {activeInfoCustomFields.map((cf) => {
                              const infoLabel = (
                                <label className="text-[10px] block mb-1" style={S_ACCENT}>
                                  <span style={S_MUTED}>{cf.tagName} ›</span> {cf.fieldName}:
                                </label>
                              );
                              return renderTypedField(
                                cf.key,
                                cf.fieldDef,
                                editingInfo.customFields[cf.key] || cf.fieldDef.defaultValue || "",
                                updateInfoCustomField,
                                infoLabel,
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Content */}
                    <div className="mb-4">
                      <label className="text-[10px] block mb-1" style={labelStyle}>Information Content:</label>
                      <RichTextEditor value={editingInfo.content} onChange={(html) => updateInfoField("content", html)} placeholder="Enter mission details, clues, or other information..." minHeight={120} />
                    </div>

                    <div className="flex gap-2">
                      <button onClick={handleSaveInfo} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                        <Save size={14} /> {isAddingNewInfo ? "Add Info" : "Save Changes"}
                      </button>
                      <button onClick={handleCancelInfoEdit} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Info List */}
                <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                  <div className="text-[12px] mb-3" style={S_SECTION_HDR}>ALL INFORMATION ({managedInfos.length})</div>
                  {managedInfos.length === 0 ? (
                    <div className="text-[12px] text-center py-6" style={S_MUTED}>No information entries created yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {managedInfos.map((info) => {
                        const ownerStr = formatOwners(info.assignedTo, players);
                        const infoCustomFields = getActiveCustomFields(info, infoTags).filter((cf) => info.customFields[cf.key]);
                        return (
                          <div key={info.id} className={`${retro.raised} bg-[#0E0E35] p-3`}>
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[13px]" style={S_TEXT_BOLD}>{info.title}</span>
                                  {info.category && (
                                    <span className="text-[9px] px-1.5 py-0.5" style={DM_CAT_BADGE}>{info.category}</span>
                                  )}
                                  {(info.followUps?.length ?? 0) > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5" style={DM_ACTION_BADGE}>{info.followUps!.length} follow-up{info.followUps!.length !== 1 ? "s" : ""}</span>
                                  )}
                                </div>
                                <div className="text-[11px]" style={S_MUTED}>
                                  Assigned to: {ownerStr}
                                  {info.infoSubTab && (() => { const st = infoSubTabs.find(s => s.id === info.infoSubTab); return st ? <span className="ml-2" style={S_DIM}>· Tab: {st.name}</span> : null; })()}
                                </div>
                                {(info.inWorldTime || info.realWorldTime) && (
                                  <div className="flex items-center gap-3 mt-0.5 text-[10px]">
                                    {info.inWorldTime && <span style={S_DIM}>In-World: <span style={S_SUBTLE}>{info.inWorldTime}</span></span>}
                                    {info.realWorldTime && <span style={S_DIM}>Real: <span style={S_SUBTLE}>{info.realWorldTime}</span></span>}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setFollowUpInfoId(followUpInfoId === info.id ? null : info.id);
                                    setFollowUpText("");
                                  }}
                                  className={`${retro.button} px-3 py-1 text-[11px]`}
                                  style={S_WARN}
                                >
                                  <Send size={12} className="inline mr-1" />
                                  Follow-up
                                </button>

                                <button
                                  onClick={() => {
                                    setEditingInfo({ ...info, customFields: { ...info.customFields } });
                                    setIsAddingNewInfo(false);
                                  }}
                                  className={`${retro.button} px-3 py-1 text-[11px]`}
                                  style={S_ACCENT}
                                >
                                  <Edit size={12} className="inline mr-1" />
                                  Edit
                                </button>

                                <button
                                  onClick={() => {
                                    handleDeleteInfo(info.id);
                                  }}
                                  className={`${retro.button} px-3 py-1 text-[11px]`}
                                  style={S_RED}
                                >
                                  <Trash2 size={12} className="inline mr-1" />
                                  Remove
                                </button>
                              </div>
                            </div>
                            {info.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {info.tags.map((t) => (
                                  <span key={t} className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{t}</span>
                                ))}
                              </div>
                            )}
                            {infoCustomFields.length > 0 && (
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                                {infoCustomFields.map((cf) => (
                                  <span key={cf.key} className="text-[10px]">
                                    <span style={S_MUTED}>{cf.fieldName}:</span>{" "}
                                    <span style={S_TEXT}>{info.customFields[cf.key]}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                            {info.content && (
                              <div className="text-[11px] mt-1" style={S_SUBTLE}>{info.content.replace(/<[^>]*>/g, "").length > 150 ? info.content.replace(/<[^>]*>/g, "").slice(0, 150) + "..." : info.content.replace(/<[^>]*>/g, "")}</div>
                            )}
                            {followUpInfoId === info.id && (
                              <div className="mt-2 p-3" style={DM_PANEL}>
                                <div className="text-[10px] mb-2" style={S_WARN_HDR}>ADD FOLLOW-UP</div>
                                <RichTextEditor value={followUpText} onChange={setFollowUpText} placeholder="Enter follow-up details..." minHeight={60} />
                                <div className="flex gap-2 mt-2">
                                  <button onClick={async () => {
                                    if (!followUpText.trim()) return;
                                    const newFollowUp: InfoFollowUp = {
                                      id: `fu-${Date.now()}`,
                                      content: followUpText,
                                      createdAt: new Date().toLocaleString(),
                                    };
                                    const nextInfos = managedInfos.map((i) =>
                                      i.id === info.id
                                        ? { ...i, followUps: [...(i.followUps || []), newFollowUp] }
                                        : i
                                    );
                                    await persistInfos(nextInfos);
                                    setFollowUpText("");
                                    setFollowUpInfoId(null);
                                  }} className={`${retro.button} px-4 py-1.5 text-[11px] flex items-center gap-1.5`} style={S_GREEN_BTN}>
                                    <Send size={11} /> Add Follow-up
                                  </button>
                                  <button onClick={async () => { setFollowUpInfoId(null); setFollowUpText(""); }} className={`${retro.button} px-4 py-1.5 text-[11px]`} style={S_TEXT}>Cancel</button>
                                </div>
                              </div>
                            )}
                            {(info.followUps?.length ?? 0) > 0 && followUpInfoId !== info.id && (
                              <div className="mt-2 space-y-1">
                                {info.followUps!.map(fu => (
                                  <div key={fu.id} className="flex items-start gap-2 pl-3" style={DM_FOLLOW_UP_LEFT}>
                                    <div className="flex-1">
                                      <div className="text-[9px] mb-0.5" style={S_MUTED}>{fu.createdAt}</div>
                                      <div className="text-[11px]" style={DM_FOLLOW_UP_TEXT}>{fu.content.replace(/<[^>]*>/g, "").length > 80 ? fu.content.replace(/<[^>]*>/g, "").slice(0, 80) + "..." : fu.content.replace(/<[^>]*>/g, "")}</div>
                                    </div>
                                    <button onClick={async () => {
                                      const nextInfos = managedInfos.map((i) =>
                                        i.id === info.id
                                          ? { ...i, followUps: (i.followUps || []).filter((f) => f.id !== fu.id) }
                                          : i
                                      );
                                      await persistInfos(nextInfos);
                                    }} className="hover:opacity-80 shrink-0 mt-1">
                                      <X size={10} style={S_RED} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

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
                <div className="text-[12px] mb-3" style={S_SECTION_HDR}>SENT NOTIFICATIONS ({dmNotifications.length})</div>
                {dmNotifications.length === 0 ? (
                  <div className="text-[12px] text-center py-6" style={S_MUTED}>No notifications sent yet.</div>
                ) : (
                  <div className="space-y-2">
                    {dmNotifications.map((notif) => (
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
          {/* MANAGE NEWS (extracted)                                   */}
          {/* ======================================================= */}
          {activeSection === "news" && <DMNewsManager />}


          {/* ======================================================= */}
          {/* WIKI ARTICLES (extracted)                                 */}
          {/* ======================================================= */}
          {activeSection === "pages" && <DMWikiSection />}



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
              <DMArcadeManager />
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
