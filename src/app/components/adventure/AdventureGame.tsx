import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Axe, Backpack, Castle, Check, Compass, Eye, Heart, Loader2, Map, RotateCcw, Shield, SkipForward, Swords, Target, Trophy, Users, X } from "lucide-react";
import { retro } from "../retro-styles";
import { S_ACCENT, S_DIM, S_GREEN, S_MUTED, S_RED, S_TEXT, S_WARN } from "../shared-styles";
import { safeGetItem, safeSetItem } from "../safe-storage";
import { ADVENTURE_DIFFICULTIES, ADVENTURE_FRAMEWORK_REGISTRY, ADVENTURE_OBJECTIVES, ADVENTURE_THEMES, DEFAULT_ADVENTURE_FRAMEWORK, DEFAULT_ENCOUNTER_SETTINGS, DEFAULT_THEME, MAP_SIZE_OPTIONS, STARTER_GOLD } from "./data";
import { makeAdventureAction, resolveAdventureAction } from "./actions";
import { getAvailableCampaignNodes, getCurrentCampaignNode } from "./campaign";
import { DEFAULT_ADVENTURE_CONTENT, getAdventureCampaignTemplates, getAdventureClass, getAdventureClasses, getAdventureLevelUpRule, getAdventureShopItems, normalizeAdventureContent } from "./content";
import { createAdventureSession, distance, getAbilityById, getActiveEnemy, getActivePlayer, getItemById, getUnitAt, makeId, tileKindLabel } from "./engine";
import { createAdventureProfile, normalizeAdventureProfile, xpForLevel } from "./profile";
import { pointKey, getDangerTiles, getReachableTiles, getTileActionReason, getValidTargetIds } from "./selectors";
import { loadAdventureState, subscribeAdventureState, upsertAdventureState } from "./store";
import type { AdventureAbilityKind, AdventureActionMode, AdventureActionRequest, AdventureBehaviorDef, AdventureCampaignNode, AdventureCampaignTemplate, AdventureClassDef, AdventureClassId, AdventureContentCatalog, AdventureEncounterSettings, AdventureEnemyTemplate, AdventureEquipmentSlot, AdventureEventTemplate, AdventureFrameworkConfig, AdventureLevelUpRule, AdventureProfilesByPlayer, AdventureSession, AdventureShopItem, AdventureShopItemKind, AdventureStateDoc, AdventureTheme, AdventureTile } from "./types";

const SELECTED_SESSION_KEY = "inet-adventure-selected-session";

function hpPercent(hp: number, maxHp: number) {
  return `${Math.max(0, Math.min(100, Math.round((hp / Math.max(1, maxHp)) * 100)))}%`;
}

function unitInitial(name: string) {
  return (name || "?").slice(0, 1).toUpperCase();
}

function tileBackground(tile: AdventureTile, theme: AdventureTheme) {
  const def = ADVENTURE_THEMES[theme] || ADVENTURE_THEMES[DEFAULT_THEME];
  switch (tile.kind) {
    case "wall": return def.wall;
    case "cover": return def.cover;
    case "hazard": return def.hazard;
    case "water": return def.water;
    case "chest": return "#7A5322";
    case "shrine": return "#31556D";
    default: return def.floor;
  }
}

function decorLabel(tile: AdventureTile) {
  if (tile.kind === "chest") return "C";
  if (tile.kind === "shrine") return "+";
  if (tile.kind === "hazard") return "!";
  if (tile.kind === "water") return "~";
  if (tile.blocksMove) return "#";
  return tile.decor ? "." : "";
}

function modeLabel(mode: AdventureActionMode) {
  if (mode.type === "move") return "Move";
  if (mode.type === "attack") return "Attack";
  if (mode.type === "ability") return "Ability";
  return "Item";
}

function nodeColor(node: AdventureCampaignNode) {
  if (node.kind === "combat") return "#FF8A6A";
  if (node.kind === "boss") return "#FF4FD8";
  if (node.kind === "town") return "#8FF0B8";
  if (node.kind === "event") return "#FFD37A";
  return "#64E0FF";
}

function equipmentSlotLabel(slot: AdventureEquipmentSlot) {
  if (slot === "weapon") return "Weapon";
  if (slot === "armor") return "Armor";
  return "Trinket";
}

function slugifyAdventureId(value: string, fallback = "custom") {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `${fallback}-${Date.now().toString(36)}`;
}

const FIELD_STYLE = { color: "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B", outline: "none" };
const CREATOR_CARD_STYLE = { background: "#080E24", boxShadow: "inset 0 0 0 1px rgba(100, 224, 255, 0.08)" };
const ABILITY_KIND_OPTIONS: AdventureAbilityKind[] = ["damage", "heal", "guard", "mark"];
const SHOP_ITEM_KIND_OPTIONS: AdventureShopItemKind[] = ["consumable", "equipment"];
const BEHAVIOR_TARGET_OPTIONS: AdventureBehaviorDef["targeting"][] = ["nearest", "wounded", "random"];

type SetupDraftState = {
  sessionId: string;
  name: string;
  settings: AdventureEncounterSettings;
  framework: AdventureFrameworkConfig;
  dirty: boolean;
};

function numberValue(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function withShopItemKind(item: AdventureShopItem, kind: AdventureShopItemKind): AdventureShopItem {
  if (kind === "equipment") {
    return {
      ...item,
      kind,
      equipment: item.equipment || {
        id: item.id,
        name: item.name || "New Gear",
        description: item.description || "A new equipment item.",
        slot: "weapon",
        price: item.price,
        sellValue: item.sellValue,
        basicDamageBonus: Math.max(1, item.item?.power || 1),
      },
    };
  }
  return {
    ...item,
    kind,
    item: item.item || {
      id: item.id,
      name: item.name || "New Consumable",
      description: item.description || "A new kit item.",
      kind: "heal",
      range: 2,
      power: Math.max(1, item.equipment?.basicDamageBonus || 5),
    },
  };
}

function mergePreferLocalAdventureState(local: AdventureStateDoc, incoming: AdventureStateDoc, keepLocalCatalog: boolean): AdventureStateDoc {
  const sessionsById = new Map(incoming.sessions.map((session) => [session.id, session]));
  for (const session of local.sessions) {
    const remote = sessionsById.get(session.id);
    if (!remote || session.version >= remote.version) {
      sessionsById.set(session.id, session);
    }
  }
  return {
    schemaVersion: 3,
    sessions: Array.from(sessionsById.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 20),
    profiles: { ...incoming.profiles, ...local.profiles },
    contentCatalog: keepLocalCatalog ? local.contentCatalog : incoming.contentCatalog,
  };
}

export function AdventureGame({ onBack }: { onBack: () => void; onScoreSave?: (score: number) => void }) {
  const currentUser = safeGetItem("inet-user") || "Player";
  const currentUserId = safeGetItem("inet-user-id") || currentUser;
  const isDungeonMaster = currentUserId === "dm" || currentUser.toLowerCase() === "dm";
  const [state, setState] = useState<AdventureStateDoc>({ schemaVersion: 3, sessions: [], profiles: {}, contentCatalog: DEFAULT_ADVENTURE_CONTENT });
  const [selectedSessionId, setSelectedSessionId] = useState(() => safeGetItem(SELECTED_SESSION_KEY) || "");
  const [selectedClass, setSelectedClass] = useState<AdventureClassId>("warrior");
  const [newRoomName, setNewRoomName] = useState("");
  const [newSettings, setNewSettings] = useState<AdventureEncounterSettings>(DEFAULT_ENCOUNTER_SETTINGS);
  const [catalogEditor, setCatalogEditor] = useState<AdventureContentCatalog>(() => normalizeAdventureContent(DEFAULT_ADVENTURE_CONTENT));
  const [catalogDirty, setCatalogDirty] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState(() => JSON.stringify(DEFAULT_ADVENTURE_CONTENT, null, 2));
  const [setupDraft, setSetupDraft] = useState<SetupDraftState | null>(null);
  const [actionMode, setActionMode] = useState<AdventureActionMode>({ type: "move" });
  const [syncSource, setSyncSource] = useState<"remote" | "local">("local");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [hoverText, setHoverText] = useState("");
  const catalogDirtyRef = useRef(false);
  const localProtectUntilRef = useRef(0);
  const actionBusyRef = useRef(false);

  const sessions = state.sessions;
  const profiles = state.profiles;
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || null;
  const classCatalog = useMemo(() => getAdventureClasses(selectedSession?.content || state.contentCatalog), [selectedSession?.content, state.contentCatalog]);
  const shopCatalog = useMemo(() => getAdventureShopItems(selectedSession?.content || state.contentCatalog), [selectedSession?.content, state.contentCatalog]);
  const classFor = useCallback((classId: string): AdventureClassDef => {
    return getAdventureClass(selectedSession?.content || state.contentCatalog, classId);
  }, [selectedSession?.content, state.contentCatalog]);
  const profile = useMemo(
    () => normalizeAdventureProfile(profiles[currentUserId], currentUserId, currentUser, selectedClass),
    [currentUser, currentUserId, profiles, selectedClass],
  );
  const myPlayer = selectedSession?.players.find((player) => player.playerId === currentUserId) || null;
  const activePlayer = selectedSession ? getActivePlayer(selectedSession) : null;
  const activeEnemy = selectedSession ? getActiveEnemy(selectedSession) : null;
  const isMyTurn = !!activePlayer && activePlayer.playerId === currentUserId;
  const isHost = !!selectedSession && selectedSession.hostPlayerId === currentUserId;
  const activeClass = myPlayer ? (myPlayer.classDef || classFor(myPlayer.classId)) : classFor(selectedClass);
  const livingPlayers = selectedSession?.players.filter((player) => player.hp > 0) || [];
  const livingEnemies = selectedSession?.enemies.filter((enemy) => enemy.hp > 0) || [];
  const fleeNeeded = Math.max(1, Math.ceil(livingPlayers.length / 2));

  useEffect(() => {
    catalogDirtyRef.current = catalogDirty;
  }, [catalogDirty]);

  useEffect(() => {
    return subscribeAdventureState((nextState, source) => {
      setState((prev) => {
        const shouldProtectLocal = Date.now() < localProtectUntilRef.current;
        return shouldProtectLocal ? mergePreferLocalAdventureState(prev, nextState, catalogDirtyRef.current) : nextState;
      });
      if (!catalogDirtyRef.current) {
        const normalized = normalizeAdventureContent(nextState.contentCatalog || DEFAULT_ADVENTURE_CONTENT);
        setCatalogEditor(normalized);
        setCatalogDraft(JSON.stringify(normalized, null, 2));
      }
      setSyncSource(source);
    });
  }, []);

  useEffect(() => {
    if (selectedSessionId) safeSetItem(SELECTED_SESSION_KEY, selectedSessionId);
  }, [selectedSessionId]);

  useEffect(() => {
    setActionMode({ type: "move" });
  }, [selectedSessionId, selectedSession?.activeTurnIndex, selectedSession?.round]);

  useEffect(() => {
    if (!selectedSession || selectedSession.phase !== "setup") {
      setSetupDraft(null);
      return;
    }
    setSetupDraft((current) => {
      if (current?.sessionId === selectedSession.id && current.dirty) return current;
      return {
        sessionId: selectedSession.id,
        name: selectedSession.name,
        settings: { ...DEFAULT_ENCOUNTER_SETTINGS, ...(selectedSession.settings || {}) },
        framework: { ...DEFAULT_ADVENTURE_FRAMEWORK, ...(selectedSession.framework || {}) },
        dirty: false,
      };
    });
  }, [selectedSession?.id, selectedSession?.phase, selectedSession?.version]);

  const saveWholeState = useCallback(async (nextState: AdventureStateDoc) => {
    setBusy(true);
    localProtectUntilRef.current = Date.now() + 5000;
    setState(nextState);
    try {
      setSyncSource(await upsertAdventureState(nextState));
    } finally {
      setBusy(false);
    }
  }, []);

  const commitAction = useCallback(async (session: AdventureSession, request: AdventureActionRequest): Promise<boolean> => {
    if (actionBusyRef.current) {
      setNotice("Adventure is already saving an action. Wait a moment, then try again.");
      return false;
    }
    actionBusyRef.current = true;
    setBusy(true);
    setNotice("");
    try {
      const loaded = await loadAdventureState().catch(() => ({ state, source: syncSource }));
      const latestSession = loaded.state.sessions.find((entry) => entry.id === session.id);
      if (!latestSession) {
        setState(loaded.state);
        setSyncSource(loaded.source);
        setNotice("That Adventure room no longer exists.");
        return false;
      }
      const latestRequest: AdventureActionRequest = { ...request, expectedVersion: latestSession.version } as AdventureActionRequest;
      const result = resolveAdventureAction(latestSession, latestRequest, loaded.state.profiles || profiles);
      if (!result.ok) {
        setState(loaded.state);
        setSyncSource(loaded.source);
        setNotice(result.reason || "Action rejected.");
        return false;
      }
      const nextState: AdventureStateDoc = {
        schemaVersion: 3,
        sessions: loaded.state.sessions.map((entry) => entry.id === result.session.id ? result.session : entry).slice(0, 20),
        profiles: result.profiles,
        contentCatalog: loaded.state.contentCatalog,
      };
      localProtectUntilRef.current = Date.now() + 5000;
      setState(nextState);
      setSyncSource(await upsertAdventureState(nextState));
      return true;
    } finally {
      actionBusyRef.current = false;
      setBusy(false);
    }
  }, [profiles, state, syncSource]);

  const dispatch = useCallback((type: AdventureActionRequest["type"], extras: Partial<AdventureActionRequest> = {}) => {
    if (!selectedSession) return;
    const request = makeAdventureAction(selectedSession, currentUserId, type, extras as any);
    void commitAction(selectedSession, request);
  }, [commitAction, currentUserId, selectedSession]);

  const handleCreate = useCallback(() => {
    const session = createAdventureSession({
      hostPlayerId: currentUserId,
      hostName: currentUser,
      classId: profile.preferredClassId,
      name: newRoomName,
      mapSize: newSettings.mapSize,
      theme: newSettings.theme,
      content: state.contentCatalog,
    });
    const configured: AdventureSession = {
      ...session,
      name: newRoomName.trim() || session.name,
      mapSize: newSettings.mapSize,
      theme: newSettings.theme,
      settings: newSettings,
      objective: { ...ADVENTURE_OBJECTIVES[newSettings.objectiveType], completed: false },
      content: normalizeAdventureContent(state.contentCatalog),
    };
    const nextProfiles: AdventureProfilesByPlayer = {
      ...profiles,
      [currentUserId]: normalizeAdventureProfile(profiles[currentUserId] || createAdventureProfile(currentUserId, currentUser, profile.preferredClassId), currentUserId, currentUser, profile.preferredClassId),
    };
    const nextState = { schemaVersion: 3 as const, sessions: [configured, ...sessions].slice(0, 20), profiles: nextProfiles, contentCatalog: state.contentCatalog };
    setNewRoomName("");
    setSelectedSessionId(configured.id);
    void saveWholeState(nextState);
  }, [currentUser, currentUserId, newRoomName, newSettings, profile.preferredClassId, profiles, saveWholeState, sessions, state.contentCatalog]);

  const handleJoin = useCallback((session: AdventureSession) => {
    const request = makeAdventureAction(session, currentUserId, "join", {
      payload: { playerName: currentUser, classId: profile.preferredClassId },
    } as any);
    setSelectedSessionId(session.id);
    void commitAction(session, request);
  }, [commitAction, currentUser, currentUserId, profile.preferredClassId]);

  const handleTileClick = useCallback((tile: AdventureTile) => {
    if (busy || actionBusyRef.current) {
      setNotice("Adventure is saving the current action. Try again in a moment.");
      return;
    }
    if (!selectedSession || !myPlayer) return;
    const reason = getTileActionReason(selectedSession, myPlayer, tile, actionMode);
    if (reason) {
      setNotice(reason);
      return;
    }
    const unit = getUnitAt(selectedSession, tile);
    if (actionMode.type === "move") {
      dispatch("move", { target: { x: tile.x, y: tile.y } } as any);
      return;
    }
    if (actionMode.type === "attack" && unit?.kind === "enemy") {
      dispatch("basic_attack", { targetId: unit.unit.id } as any);
      return;
    }
    if (actionMode.type === "ability" && unit) {
      dispatch("ability", { payload: { abilityId: actionMode.abilityId, targetId: unit.unit.id } } as any);
      return;
    }
    if (actionMode.type === "item" && unit) {
      dispatch("item", { payload: { itemId: actionMode.itemId, targetId: unit.unit.id } } as any);
    }
  }, [actionMode, busy, dispatch, myPlayer, selectedSession]);

  const openSessions = useMemo(
    () => sessions.filter((session) => session.phase !== "closed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [sessions],
  );

  const renderProfileCard = () => {
    const xpCurrent = profile.xp - xpForLevel(profile.level);
    const xpNext = Math.max(1, xpForLevel(profile.level + 1) - xpForLevel(profile.level));
    const profileClass = classFor(profile.preferredClassId);
    return (
      <div className={`${retro.raised} p-4`} style={{ background: "#080E24", borderLeft: `4px solid ${profileClass.color}` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-bold" style={S_TEXT}>{profile.playerName}</div>
            <div className="text-[10px]" style={{ color: profileClass.color }}>
              Level {profile.level} {profileClass.name}
            </div>
          </div>
          <div className="text-[10px] text-right" style={S_WARN}>{profile.currency} currency</div>
        </div>
        <div className="h-2 mt-3 bg-[#050A1A]" style={{ border: "1px solid #1A1A4B" }}>
          <div className="h-full" style={{ width: `${Math.min(100, Math.round((xpCurrent / xpNext) * 100))}%`, background: profileClass.color }} />
        </div>
        <div className="flex justify-between mt-1 text-[9px]" style={S_DIM}>
          <span>{profile.xp} XP</span>
          <span>{profile.stats.victories} wins | {profile.stats.sessionsPlayed} runs</span>
        </div>
      </div>
    );
  };

  const renderClassPicker = (compact = false) => (
    <div className={`grid grid-cols-1 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"} gap-3`}>
      {(Object.keys(classCatalog) as AdventureClassId[]).map((classId) => {
        const def = classCatalog[classId];
        const selected = selectedClass === classId || profile.preferredClassId === classId;
        return (
          <button
            key={classId}
            onClick={() => {
              setSelectedClass(classId);
              const nextProfile = normalizeAdventureProfile({ ...profile, preferredClassId: classId }, currentUserId, currentUser, classId);
              void saveWholeState({ ...state, profiles: { ...profiles, [currentUserId]: nextProfile } });
            }}
            className={`${retro.raised} p-3 text-left hover:bg-[#111B3A] transition-colors`}
            style={{ borderLeft: `4px solid ${def.color}`, background: selected ? `${def.color}22` : "#080D24" }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-bold" style={{ color: def.color }}>{def.name}</div>
              {selected && <Check size={14} style={{ color: def.color }} />}
            </div>
            <div className="text-[10px] mt-1" style={S_MUTED}>{def.role}</div>
            <div className="flex gap-3 mt-2 text-[10px]" style={S_DIM}>
              <span>HP {def.maxHp}</span>
              <span>Move {def.move}</span>
              <span>Hit {def.basicDamage}</span>
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderSetupFields = (settings: AdventureEncounterSettings, onChange: (settings: AdventureEncounterSettings) => void) => (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <label className="text-[10px]" style={S_DIM}>
        MAP SIZE
        <select value={settings.mapSize} onChange={(event) => onChange({ ...settings, mapSize: Number(event.target.value) })} className="mt-1 w-full px-2 py-2 text-[12px]" style={{ color: "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B" }}>
          {MAP_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}x{size}</option>)}
        </select>
      </label>
      <label className="text-[10px]" style={S_DIM}>
        THEME
        <select value={settings.theme} onChange={(event) => onChange({ ...settings, theme: event.target.value as AdventureTheme })} className="mt-1 w-full px-2 py-2 text-[12px]" style={{ color: "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B" }}>
          {(Object.keys(ADVENTURE_THEMES) as AdventureTheme[]).map((theme) => <option key={theme} value={theme}>{ADVENTURE_THEMES[theme].name}</option>)}
        </select>
      </label>
      <label className="text-[10px]" style={S_DIM}>
        DIFFICULTY
        <select value={settings.difficulty} onChange={(event) => onChange({ ...settings, difficulty: event.target.value as any })} className="mt-1 w-full px-2 py-2 text-[12px]" style={{ color: "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B" }}>
          {Object.entries(ADVENTURE_DIFFICULTIES).map(([id, def]) => <option key={id} value={id}>{def.name}</option>)}
        </select>
      </label>
      <label className="text-[10px]" style={S_DIM}>
        OBJECTIVE
        <select value={settings.objectiveType} onChange={(event) => onChange({ ...settings, objectiveType: event.target.value as any })} className="mt-1 w-full px-2 py-2 text-[12px]" style={{ color: "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B" }}>
          {Object.entries(ADVENTURE_OBJECTIVES).map(([id, objective]) => <option key={id} value={id}>{objective.label}</option>)}
        </select>
      </label>
      <label className="text-[10px]" style={S_DIM}>
        MAX PLAYERS
        <select value={settings.maxPlayers} onChange={(event) => onChange({ ...settings, maxPlayers: Number(event.target.value) })} className="mt-1 w-full px-2 py-2 text-[12px]" style={{ color: "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B" }}>
          {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onChange({ ...settings, profilesEnabled: !settings.profilesEnabled })} className={`${retro.button} px-2 py-2 text-[10px]`} style={settings.profilesEnabled ? S_GREEN : S_DIM}>
          Profiles {settings.profilesEnabled ? "On" : "Off"}
        </button>
        <button onClick={() => onChange({ ...settings, rewardsEnabled: !settings.rewardsEnabled })} className={`${retro.button} px-2 py-2 text-[10px]`} style={settings.rewardsEnabled ? S_GREEN : S_DIM}>
          Rewards {settings.rewardsEnabled ? "On" : "Off"}
        </button>
      </div>
    </div>
  );

  const renderFrameworkFields = (framework: AdventureFrameworkConfig, onChange: (framework: AdventureFrameworkConfig) => void) => {
    const fields: Array<[keyof AdventureFrameworkConfig, string]> = [
      ["classSetId", "Class Set"],
      ["abilitySetId", "Ability Set"],
      ["itemSetId", "Item Set"],
      ["enemySetId", "Enemy Set"],
      ["bossSetId", "Boss Set"],
      ["behaviorSetId", "Enemy AI"],
      ["levelUpSetId", "Level Ups"],
    ];
    return (
      <div className={`${retro.sunken} p-3 space-y-3`} style={{ background: "#050A1A" }}>
        <div>
          <div className="text-[12px] font-bold" style={S_TEXT}>Framework Slots</div>
          <div className="text-[10px]" style={S_MUTED}>Use these ids as the expandable hooks for DM-built classes, abilities, enemies, bosses, behavior, items, and level-up rules.</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {fields.map(([key, label]) => (
            <label key={key} className="text-[9px]" style={S_DIM}>
              {label}
              <input value={String(framework[key] || "")} onChange={(event) => onChange({ ...framework, [key]: event.target.value })} className="mt-1 w-full px-2 py-1.5 text-[11px]" style={{ color: "#C0D0F0", background: "#080E24", border: "1px solid #1A1A4B", outline: "none" }} />
            </label>
          ))}
        </div>
        <label className="text-[9px] block" style={S_DIM}>
          Expansion Notes
          <textarea value={framework.notes || ""} onChange={(event) => onChange({ ...framework, notes: event.target.value })} className="mt-1 w-full px-2 py-1.5 text-[11px] min-h-[60px]" style={{ color: "#C0D0F0", background: "#080E24", border: "1px solid #1A1A4B", outline: "none" }} />
        </label>
      </div>
    );
  };

  const saveFrameworkCatalog = () => {
    try {
      const parsed = JSON.parse(catalogDraft);
      const contentCatalog = normalizeAdventureContent(parsed);
      setCatalogEditor(contentCatalog);
      setCatalogDirty(false);
      localProtectUntilRef.current = Date.now() + 5000;
      void saveWholeState({ ...state, contentCatalog });
      setCatalogDraft(JSON.stringify(contentCatalog, null, 2));
      setNotice("Adventure framework catalog saved.");
    } catch (err) {
      setNotice(err instanceof Error ? `Framework JSON error: ${err.message}` : "Framework JSON could not be parsed.");
    }
  };

  const editContentCatalog = useCallback((contentCatalog: AdventureContentCatalog, message: string) => {
    const normalized = normalizeAdventureContent(contentCatalog);
    setCatalogEditor(normalized);
    setCatalogDraft(JSON.stringify(normalized, null, 2));
    setCatalogDirty(true);
    setNotice(`${message} Save the catalog to publish these changes.`);
  }, []);

  const persistContentCatalog = useCallback((contentCatalog: AdventureContentCatalog, message: string) => {
    const normalized = normalizeAdventureContent(contentCatalog);
    setCatalogEditor(normalized);
    setCatalogDraft(JSON.stringify(normalized, null, 2));
    setCatalogDirty(false);
    void saveWholeState({ ...state, contentCatalog: normalized });
    setNotice(message);
  }, [saveWholeState, state]);

  const closeExistingAndCreateV2 = useCallback(() => {
    const contentCatalog = normalizeAdventureContent(DEFAULT_ADVENTURE_CONTENT);
    const closedSessions = state.sessions.map((session) => ({
      ...session,
      status: session.status === "completed" ? session.status : "abandoned",
      phase: "closed" as const,
      outcome: session.outcome || "abandoned" as const,
      updatedAt: new Date().toISOString(),
      log: [
        { id: makeId("log"), at: new Date().toISOString(), tone: "warning" as const, text: "Closed during Adventure V2 reset." },
        ...session.log,
      ].slice(0, 100),
    }));
    const session = createAdventureSession({
      hostPlayerId: currentUserId,
      hostName: currentUser,
      classId: profile.preferredClassId,
      name: "V2: First Cube Road",
      mapSize: DEFAULT_ENCOUNTER_SETTINGS.mapSize,
      theme: getAdventureCampaignTemplates(contentCatalog)[0]?.preferredTheme || DEFAULT_THEME,
      content: contentCatalog,
    });
    const nextState: AdventureStateDoc = {
      schemaVersion: 3,
      sessions: [session, ...closedSessions].slice(0, 20),
      profiles,
      contentCatalog,
    };
    setSelectedSessionId(session.id);
    setCatalogEditor(contentCatalog);
    setCatalogDraft(JSON.stringify(contentCatalog, null, 2));
    setCatalogDirty(false);
    void saveWholeState(nextState);
    setNotice("Existing adventures closed. Clean Adventure V2 room and starter catalog created.");
  }, [currentUser, currentUserId, profile.preferredClassId, profiles, saveWholeState, state.sessions]);

  const renderFrameworkBuilder = () => {
    if (!isDungeonMaster) return null;
    const content = normalizeAdventureContent(catalogEditor);
    const saveCatalog = (next: typeof content, message: string) => editContentCatalog(next, message);
    const updateCampaign = (id: string, patch: Partial<AdventureCampaignTemplate>) => saveCatalog({ ...content, campaignTemplates: content.campaignTemplates.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) }, "Adventure template updated.");
    const updateClass = (id: string, patch: Partial<AdventureClassDef>) => saveCatalog({ ...content, classes: { ...content.classes, [id]: { ...content.classes[id], ...patch } } }, "Class set updated.");
    const updateItem = (id: string, patch: Partial<AdventureShopItem>) => saveCatalog({ ...content, shopItems: content.shopItems.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) }, "Item set updated.");
    const updateEvent = (id: string, patch: Partial<AdventureEventTemplate>) => saveCatalog({ ...content, eventTemplates: content.eventTemplates.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) }, "Event set updated.");
    const updateEnemy = (id: string, patch: Partial<AdventureEnemyTemplate>, boss = false) => {
      const key = boss ? "bossTemplates" : "enemyTemplates";
      saveCatalog({ ...content, [key]: content[key].map((entry) => entry.id === id ? { ...entry, ...patch } : entry) }, boss ? "Boss set updated." : "Enemy set updated.");
    };
    const updateBehavior = (id: string, patch: Partial<AdventureBehaviorDef>) => saveCatalog({ ...content, behaviors: content.behaviors.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) }, "Behavior set updated.");
    const updateLevelRule = (id: string, patch: Partial<AdventureLevelUpRule>) => saveCatalog({ ...content, levelUpRules: content.levelUpRules.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) }, "Level-up set updated.");
    const inputClass = "w-full px-2 py-1.5 text-[11px]";
    const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
      <label className="block text-[9px] uppercase tracking-[0.12em]" style={S_DIM}>
        <span>{label}</span>
        <div className="mt-1">{children}</div>
        {hint && <div className="mt-1 normal-case tracking-normal text-[9px]" style={S_MUTED}>{hint}</div>}
      </label>
    );
    const SectionSummary = ({ title, detail }: { title: string; detail: string }) => (
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] font-bold" style={S_TEXT}>{title}</span>
          <span className="text-[9px] px-2 py-0.5" style={{ ...S_DIM, border: "1px solid #1A1A4B", background: "#080E24" }}>{detail}</span>
        </div>
      </summary>
    );
    return (
      <div className={`${retro.raised} p-4`} style={{ background: "linear-gradient(135deg, #080E24, #160A24)", borderLeft: "4px solid #FF8DFF" }}>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[14px] font-bold" style={{ color: "#FF8DFF" }}>DM Adventure V2 Creator</div>
              <span className="text-[9px] px-2 py-0.5" style={{ color: "#FFD37A", border: "1px solid #51401E", background: "#151006" }}>DM tools</span>
            </div>
            <div className="text-[11px] max-w-[760px]" style={S_MUTED}>
              Build the shared Adventure V2 catalog. New rooms snapshot these adventure templates, classes, abilities, item sets, event sets, enemies, bosses, behaviors, and level-up rules.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={!catalogDirty || busy} onClick={() => persistContentCatalog(content, "Adventure V2 catalog saved.")} className={`${retro.button} px-3 py-2 text-[10px] disabled:opacity-40`} style={catalogDirty ? S_GREEN : S_DIM}>Save Catalog</button>
            <button disabled={!catalogDirty || busy} onClick={() => {
              const normalized = normalizeAdventureContent(state.contentCatalog);
              setCatalogEditor(normalized);
              setCatalogDraft(JSON.stringify(normalized, null, 2));
              setCatalogDirty(false);
              setNotice("Unsaved Adventure catalog changes discarded.");
            }} className={`${retro.button} px-3 py-2 text-[10px] disabled:opacity-40`} style={S_ACCENT}>Discard Draft</button>
            <button onClick={closeExistingAndCreateV2} className={`${retro.button} px-3 py-2 text-[10px]`} style={S_RED}>Close Existing + Create V2</button>
            <button onClick={() => editContentCatalog(DEFAULT_ADVENTURE_CONTENT, "Built-in V2 starter catalog loaded into the draft.")} className={`${retro.button} px-3 py-2 text-[10px]`} style={S_WARN}>Load V2 Starter Draft</button>
          </div>
        </div>
        {catalogDirty && (
          <div className={`${retro.sunken} px-3 py-2 text-[10px] mb-3`} style={{ color: "#FFD37A", background: "#151006" }}>
            Unsaved catalog draft. Players and new rooms will keep using the last saved catalog until you press Save Catalog.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
          {[
            ["Reset Safely", "Close old rooms and seed a fresh V2 campaign without deleting profiles."],
            ["Edit In Forms", "Catalog cards save through the shared Adventure state and remain editable as JSON."],
            ["Snapshot Rooms", "New rooms copy the current catalog so later edits do not mutate live sessions."],
          ].map(([title, body]) => (
            <div key={title} className={`${retro.sunken} p-2`} style={{ background: "#050A1A" }}>
              <div className="text-[10px] font-bold" style={S_TEXT}>{title}</div>
              <div className="text-[9px] leading-relaxed" style={S_MUTED}>{body}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mb-3">
          {[
            ["Adventures", content.campaignTemplates.length],
            ["Classes", Object.keys(content.classes).length],
            ["Shop", content.shopItems.length],
            ["Enemies", content.enemyTemplates.length],
            ["Bosses", content.bossTemplates.length],
            ["Behaviors", content.behaviors.length],
            ["Level Ups", content.levelUpRules.length],
            ["Events", content.eventTemplates.length],
          ].map(([label, count]) => (
            <div key={label} className={`${retro.sunken} p-2 text-center`} style={{ background: "#050A1A" }}>
              <div className="text-[9px]" style={S_DIM}>{label}</div>
              <div className="text-[14px] font-bold" style={S_TEXT}>{count}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <details open className={`${retro.sunken} p-3`} style={{ background: "#050A1A" }}>
            <SectionSummary title="Basic Adventures" detail={`${content.campaignTemplates.length} templates`} />
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
              {content.campaignTemplates.map((template) => (
                <div key={template.id} className={`${retro.raised} p-3 space-y-2`} style={{ ...CREATOR_CARD_STYLE, borderLeft: "3px solid #64E0FF" }}>
                  <Field label="Adventure Name">
                    <input className={inputClass} style={FIELD_STYLE} value={template.name} onChange={(event) => updateCampaign(template.id, { name: event.target.value })} />
                  </Field>
                  <Field label="Description">
                    <textarea className={`${inputClass} min-h-[54px]`} style={FIELD_STYLE} value={template.description} onChange={(event) => updateCampaign(template.id, { description: event.target.value })} />
                  </Field>
                  <Field label="Opening Text" hint="Shown when the party leaves the starter shop and begins the road.">
                    <textarea className={`${inputClass} min-h-[54px]`} style={FIELD_STYLE} value={template.introText} onChange={(event) => updateCampaign(template.id, { introText: event.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Depth">
                      <input className={inputClass} style={FIELD_STYLE} type="number" value={template.maxDepth} onChange={(event) => updateCampaign(template.id, { maxDepth: Math.max(2, numberValue(event.target.value, template.maxDepth)) })} />
                    </Field>
                    <Field label="Theme">
                      <select className={inputClass} style={FIELD_STYLE} value={template.preferredTheme} onChange={(event) => updateCampaign(template.id, { preferredTheme: event.target.value as AdventureTheme })}>{(Object.keys(ADVENTURE_THEMES) as AdventureTheme[]).map((theme) => <option key={theme} value={theme}>{ADVENTURE_THEMES[theme].name}</option>)}</select>
                    </Field>
                  </div>
                  <button onClick={() => saveCatalog({ ...content, campaignTemplates: content.campaignTemplates.filter((entry) => entry.id !== template.id) }, "Adventure template removed.")} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_RED}>Remove Adventure</button>
                </div>
              ))}
            </div>
            <button onClick={() => {
              const id = slugifyAdventureId(`adventure-${content.campaignTemplates.length + 1}`, "adventure");
              saveCatalog({ ...content, campaignTemplates: [...content.campaignTemplates, { id, name: "New Adventure Road", description: "A new V2 road template.", maxDepth: 6, preferredTheme: "forest", introText: "The party steps onto a new cube road." }] }, "Adventure template added.");
            }} className={`${retro.button} mt-3 px-3 py-2 text-[10px]`} style={S_GREEN}>Add Adventure Template</button>
          </details>

          <details className={`${retro.sunken} p-3`} style={{ background: "#050A1A" }}>
            <SectionSummary title="Classes And Abilities" detail={`${Object.keys(content.classes).length} classes`} />
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
              {Object.values(content.classes).map((classDef) => (
                <div key={classDef.id} className={`${retro.raised} p-3 space-y-2`} style={{ ...CREATOR_CARD_STYLE, borderLeft: `3px solid ${classDef.color}` }}>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Class Name">
                      <input className={inputClass} style={FIELD_STYLE} value={classDef.name} onChange={(event) => updateClass(classDef.id, { name: event.target.value })} />
                    </Field>
                    <Field label="Accent Color">
                      <input className={inputClass} style={FIELD_STYLE} value={classDef.color} onChange={(event) => updateClass(classDef.id, { color: event.target.value })} />
                    </Field>
                  </div>
                  <Field label="Role">
                    <input className={inputClass} style={FIELD_STYLE} value={classDef.role} onChange={(event) => updateClass(classDef.id, { role: event.target.value })} />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="HP">
                      <input className={inputClass} style={FIELD_STYLE} type="number" value={classDef.maxHp} onChange={(event) => updateClass(classDef.id, { maxHp: Math.max(1, numberValue(event.target.value, classDef.maxHp)) })} />
                    </Field>
                    <Field label="Move">
                      <input className={inputClass} style={FIELD_STYLE} type="number" value={classDef.move} onChange={(event) => updateClass(classDef.id, { move: Math.max(1, numberValue(event.target.value, classDef.move)) })} />
                    </Field>
                    <Field label="Hit">
                      <input className={inputClass} style={FIELD_STYLE} type="number" value={classDef.basicDamage} onChange={(event) => updateClass(classDef.id, { basicDamage: Math.max(1, numberValue(event.target.value, classDef.basicDamage)) })} />
                    </Field>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-bold" style={S_MUTED}>Abilities</div>
                      <div className="hidden md:grid md:grid-cols-[1fr_90px_70px_70px_auto] gap-2 flex-1 text-[8px] uppercase tracking-[0.1em]" style={S_DIM}>
                        <span>Name</span><span>Kind</span><span>Range</span><span>Power</span><span />
                      </div>
                    </div>
                    {classDef.abilities.map((ability, index) => (
                      <div key={ability.id} className="grid grid-cols-1 md:grid-cols-[1fr_90px_70px_70px_auto] gap-2">
                        <input className={inputClass} style={FIELD_STYLE} value={ability.name} onChange={(event) => updateClass(classDef.id, { abilities: classDef.abilities.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry) })} />
                        <select className={inputClass} style={FIELD_STYLE} value={ability.kind} onChange={(event) => updateClass(classDef.id, { abilities: classDef.abilities.map((entry, i) => i === index ? { ...entry, kind: event.target.value as AdventureAbilityKind } : entry) })}>{ABILITY_KIND_OPTIONS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select>
                        <input className={inputClass} style={FIELD_STYLE} type="number" value={ability.range} onChange={(event) => updateClass(classDef.id, { abilities: classDef.abilities.map((entry, i) => i === index ? { ...entry, range: numberValue(event.target.value, entry.range) } : entry) })} />
                        <input className={inputClass} style={FIELD_STYLE} type="number" value={ability.power} onChange={(event) => updateClass(classDef.id, { abilities: classDef.abilities.map((entry, i) => i === index ? { ...entry, power: numberValue(event.target.value, entry.power) } : entry) })} />
                        <button onClick={() => updateClass(classDef.id, { abilities: classDef.abilities.filter((_, i) => i !== index) })} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_RED}>X</button>
                      </div>
                    ))}
                    <button onClick={() => updateClass(classDef.id, { abilities: [...classDef.abilities, { id: `ability-${Date.now().toString(36)}`, name: "New Ability", description: "Describe this ability.", kind: "damage", range: 1, power: 5 }] })} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_GREEN}>Add Ability</button>
                  </div>
                  <button onClick={() => {
                    const next = { ...content.classes };
                    delete next[classDef.id];
                    saveCatalog({ ...content, classes: next }, "Class removed.");
                  }} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_RED}>Remove Class</button>
                </div>
              ))}
            </div>
            <button onClick={() => {
              const id = slugifyAdventureId(`class-${Object.keys(content.classes).length + 1}`, "class");
              saveCatalog({ ...content, classes: { ...content.classes, [id]: { id, name: "New Class", role: "Custom role", maxHp: 24, move: 4, basicDamage: 5, color: "#64E0FF", abilities: [], inventory: [] } } }, "Class added.");
            }} className={`${retro.button} mt-3 px-3 py-2 text-[10px]`} style={S_GREEN}>Add Class</button>
          </details>

          <details className={`${retro.sunken} p-3`} style={{ background: "#050A1A" }}>
            <SectionSummary title="Item Set" detail={`${content.shopItems.length} shop entries`} />
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
              {content.shopItems.map((item) => (
                <div key={item.id} className={`${retro.raised} p-3 space-y-2`} style={{ ...CREATOR_CARD_STYLE, borderLeft: `3px solid ${item.kind === "equipment" ? "#64E0FF" : "#FFD37A"}` }}>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Item Name">
                      <input className={inputClass} style={FIELD_STYLE} value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} />
                    </Field>
                    <Field label="Item Type">
                      <select className={inputClass} style={FIELD_STYLE} value={item.kind} onChange={(event) => updateItem(item.id, withShopItemKind(item, event.target.value as AdventureShopItemKind))}>
                        {SHOP_ITEM_KIND_OPTIONS.map((kind) => <option key={kind} value={kind}>{kind === "equipment" ? "Equipment" : "Consumable"}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Description">
                    <textarea className={`${inputClass} min-h-[48px]`} style={FIELD_STYLE} value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} />
                  </Field>
                  <div className="grid grid-cols-4 gap-2">
                    <Field label="Price"><input className={inputClass} style={FIELD_STYLE} type="number" value={item.price} onChange={(event) => updateItem(item.id, { price: numberValue(event.target.value, item.price) })} /></Field>
                    <Field label="Sell"><input className={inputClass} style={FIELD_STYLE} type="number" value={item.sellValue} onChange={(event) => updateItem(item.id, { sellValue: numberValue(event.target.value, item.sellValue) })} /></Field>
                    <Field label="Power"><input className={inputClass} style={FIELD_STYLE} type="number" value={item.item?.power || item.equipment?.basicDamageBonus || 0} onChange={(event) => item.kind === "equipment" ? updateItem(item.id, { equipment: { ...(item.equipment || { id: item.id, name: item.name, description: item.description, slot: "weapon", price: item.price, sellValue: item.sellValue }), basicDamageBonus: numberValue(event.target.value, 0) } }) : updateItem(item.id, { item: { ...(item.item || { id: item.id, name: item.name, description: item.description, kind: "heal", range: 2, power: 1 }), power: numberValue(event.target.value, 1) } })} /></Field>
                    <Field label="Range"><input className={inputClass} style={FIELD_STYLE} type="number" value={item.item?.range || 0} onChange={(event) => updateItem(item.id, { item: { ...(item.item || { id: item.id, name: item.name, description: item.description, kind: "heal", range: 2, power: 1 }), range: numberValue(event.target.value, 1) } })} /></Field>
                  </div>
                  {item.kind === "equipment" && (
                    <div className="grid grid-cols-4 gap-2">
                      <Field label="Slot"><select className={inputClass} style={FIELD_STYLE} value={item.equipment?.slot || "weapon"} onChange={(event) => updateItem(item.id, { equipment: { ...(item.equipment || { id: item.id, name: item.name, description: item.description, slot: "weapon", price: item.price, sellValue: item.sellValue }), slot: event.target.value as AdventureEquipmentSlot } })}>{(["weapon", "armor", "trinket"] as AdventureEquipmentSlot[]).map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></Field>
                      <Field label="HP"><input className={inputClass} style={FIELD_STYLE} type="number" value={item.equipment?.maxHpBonus || 0} onChange={(event) => updateItem(item.id, { equipment: { ...(item.equipment || { id: item.id, name: item.name, description: item.description, slot: "armor", price: item.price, sellValue: item.sellValue }), maxHpBonus: numberValue(event.target.value, 0) } })} /></Field>
                      <Field label="Move"><input className={inputClass} style={FIELD_STYLE} type="number" value={item.equipment?.moveBonus || 0} onChange={(event) => updateItem(item.id, { equipment: { ...(item.equipment || { id: item.id, name: item.name, description: item.description, slot: "trinket", price: item.price, sellValue: item.sellValue }), moveBonus: numberValue(event.target.value, 0) } })} /></Field>
                      <button onClick={() => saveCatalog({ ...content, shopItems: content.shopItems.filter((entry) => entry.id !== item.id) }, "Item removed.")} className={`${retro.button} px-2 py-1 text-[9px] self-end`} style={S_RED}>Remove</button>
                    </div>
                  )}
                  {item.kind !== "equipment" && <button onClick={() => saveCatalog({ ...content, shopItems: content.shopItems.filter((entry) => entry.id !== item.id) }, "Item removed.")} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_RED}>Remove</button>}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => {
                const id = `potion-${Date.now().toString(36)}`;
                saveCatalog({ ...content, shopItems: [...content.shopItems, { id, kind: "consumable", name: "New Consumable", description: "A new kit item.", price: 10, sellValue: 5, item: { id, name: "New Consumable", description: "A new kit item.", kind: "heal", range: 2, power: 5 } }] }, "Consumable added.");
              }} className={`${retro.button} px-3 py-2 text-[10px]`} style={S_GREEN}>Add Consumable</button>
              <button onClick={() => {
                const id = `gear-${Date.now().toString(36)}`;
                saveCatalog({ ...content, shopItems: [...content.shopItems, { id, kind: "equipment", name: "New Gear", description: "A new equipment item.", price: 25, sellValue: 12, equipment: { id, name: "New Gear", description: "A new equipment item.", slot: "weapon", price: 25, sellValue: 12, basicDamageBonus: 1 } }] }, "Equipment added.");
              }} className={`${retro.button} px-3 py-2 text-[10px]`} style={S_GREEN}>Add Equipment</button>
            </div>
          </details>

          <details className={`${retro.sunken} p-3`} style={{ background: "#050A1A" }}>
            <SectionSummary title="Event Set" detail={`${content.eventTemplates.length} events`} />
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
              {content.eventTemplates.map((event) => (
                <div key={event.id} className={`${retro.raised} p-3 space-y-2`} style={{ ...CREATOR_CARD_STYLE, borderLeft: "3px solid #FFD37A" }}>
                  <Field label="Event Title"><input className={inputClass} style={FIELD_STYLE} value={event.title} onChange={(entry) => updateEvent(event.id, { title: entry.target.value })} /></Field>
                  <Field label="Outcome Text"><textarea className={`${inputClass} min-h-[60px]`} style={FIELD_STYLE} value={event.description} onChange={(entry) => updateEvent(event.id, { description: entry.target.value })} /></Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="XP"><input className={inputClass} style={FIELD_STYLE} type="number" value={event.rewardXp} onChange={(entry) => updateEvent(event.id, { rewardXp: numberValue(entry.target.value, event.rewardXp) })} /></Field>
                    <Field label="Gold"><input className={inputClass} style={FIELD_STYLE} type="number" value={event.rewardGold} onChange={(entry) => updateEvent(event.id, { rewardGold: numberValue(entry.target.value, event.rewardGold) })} /></Field>
                    <button onClick={() => saveCatalog({ ...content, eventTemplates: content.eventTemplates.filter((entry) => entry.id !== event.id) }, "Event removed.")} className={`${retro.button} px-2 py-1 text-[9px] self-end`} style={S_RED}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => {
              const id = `event-${Date.now().toString(36)}`;
              saveCatalog({ ...content, eventTemplates: [...content.eventTemplates, { id, title: "New Event", description: "Describe the event outcome.", rewardXp: 25, rewardGold: 10, tags: ["event"] }] }, "Event added.");
            }} className={`${retro.button} mt-3 px-3 py-2 text-[10px]`} style={S_GREEN}>Add Event</button>
          </details>

          <details className={`${retro.sunken} p-3`} style={{ background: "#050A1A" }}>
            <SectionSummary title="Enemies, Bosses, Behaviors, And Level-Ups" detail={`${content.enemyTemplates.length + content.bossTemplates.length} combat templates`} />
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
              {([
                ["Enemies", content.enemyTemplates, false],
                ["Bosses", content.bossTemplates, true],
              ] as const).map(([label, list, boss]) => (
                <div key={label} className={`${retro.raised} p-3`} style={CREATOR_CARD_STYLE}>
                  <div className="text-[11px] font-bold mb-2" style={S_TEXT}>{label}</div>
                  <div className="space-y-2">
                    {list.map((enemy) => (
                      <div key={enemy.id} className="grid grid-cols-1 md:grid-cols-[1fr_64px_64px_64px_auto] gap-2">
                        <input className={inputClass} style={FIELD_STYLE} value={enemy.name} onChange={(event) => updateEnemy(enemy.id, { name: event.target.value }, boss)} />
                        <input className={inputClass} style={FIELD_STYLE} type="number" value={enemy.maxHp} onChange={(event) => updateEnemy(enemy.id, { maxHp: numberValue(event.target.value, enemy.maxHp) }, boss)} />
                        <input className={inputClass} style={FIELD_STYLE} type="number" value={enemy.damage} onChange={(event) => updateEnemy(enemy.id, { damage: numberValue(event.target.value, enemy.damage) }, boss)} />
                        <input className={inputClass} style={FIELD_STYLE} type="number" value={enemy.attackRange} onChange={(event) => updateEnemy(enemy.id, { attackRange: numberValue(event.target.value, enemy.attackRange) }, boss)} />
                        <button onClick={() => saveCatalog({ ...content, [boss ? "bossTemplates" : "enemyTemplates"]: list.filter((entry) => entry.id !== enemy.id) }, `${label.slice(0, -1)} removed.`)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_RED}>X</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => {
                    const id = `${boss ? "boss" : "enemy"}-${Date.now().toString(36)}`;
                    saveCatalog({ ...content, [boss ? "bossTemplates" : "enemyTemplates"]: [...list, { id, name: boss ? "New Boss" : "New Enemy", enemyType: boss ? "Boss" : "Enemy", maxHp: boss ? 42 : 18, damage: boss ? 9 : 5, attackRange: 1, intent: "Uses the selected behavior.", behaviorId: content.behaviors[0]?.id, boss }] }, `${label.slice(0, -1)} added.`);
                  }} className={`${retro.button} mt-2 px-2 py-1 text-[9px]`} style={S_GREEN}>Add {label.slice(0, -1)}</button>
                </div>
              ))}
              <div className={`${retro.raised} p-3`} style={CREATOR_CARD_STYLE}>
                <div className="text-[11px] font-bold mb-2" style={S_TEXT}>Behaviors</div>
                <div className="space-y-2">
                  {content.behaviors.map((behavior) => (
                    <div key={behavior.id} className="grid grid-cols-1 md:grid-cols-[1fr_120px_70px_auto] gap-2">
                      <input className={inputClass} style={FIELD_STYLE} value={behavior.name} onChange={(event) => updateBehavior(behavior.id, { name: event.target.value })} />
                      <select className={inputClass} style={FIELD_STYLE} value={behavior.targeting} onChange={(event) => updateBehavior(behavior.id, { targeting: event.target.value as AdventureBehaviorDef["targeting"] })}>{BEHAVIOR_TARGET_OPTIONS.map((targeting) => <option key={targeting} value={targeting}>{targeting}</option>)}</select>
                      <input className={inputClass} style={FIELD_STYLE} type="number" value={behavior.aggression} onChange={(event) => updateBehavior(behavior.id, { aggression: numberValue(event.target.value, behavior.aggression) })} />
                      <button onClick={() => saveCatalog({ ...content, behaviors: content.behaviors.filter((entry) => entry.id !== behavior.id) }, "Behavior removed.")} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_RED}>X</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => {
                  const id = `behavior-${Date.now().toString(36)}`;
                  saveCatalog({ ...content, behaviors: [...content.behaviors, { id, name: "New Behavior", description: "Describe enemy behavior.", targeting: "nearest", aggression: 1 }] }, "Behavior added.");
                }} className={`${retro.button} mt-2 px-2 py-1 text-[9px]`} style={S_GREEN}>Add Behavior</button>
              </div>
              <div className={`${retro.raised} p-3`} style={CREATOR_CARD_STYLE}>
                <div className="text-[11px] font-bold mb-2" style={S_TEXT}>Level-Up Rules</div>
                <div className="space-y-2">
                  {content.levelUpRules.map((rule) => (
                    <div key={rule.id} className="grid grid-cols-1 md:grid-cols-[1fr_64px_64px_64px_auto] gap-2">
                      <input className={inputClass} style={FIELD_STYLE} value={rule.name} onChange={(event) => updateLevelRule(rule.id, { name: event.target.value })} />
                      <input className={inputClass} style={FIELD_STYLE} type="number" value={rule.xpCost} onChange={(event) => updateLevelRule(rule.id, { xpCost: numberValue(event.target.value, rule.xpCost) })} />
                      <input className={inputClass} style={FIELD_STYLE} type="number" value={rule.hpGain} onChange={(event) => updateLevelRule(rule.id, { hpGain: numberValue(event.target.value, rule.hpGain) })} />
                      <input className={inputClass} style={FIELD_STYLE} type="number" value={rule.damageGain || 0} onChange={(event) => updateLevelRule(rule.id, { damageGain: numberValue(event.target.value, rule.damageGain || 0) })} />
                      <button onClick={() => saveCatalog({ ...content, levelUpRules: content.levelUpRules.filter((entry) => entry.id !== rule.id) }, "Level-up rule removed.")} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_RED}>X</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => {
                  const id = `level-${Date.now().toString(36)}`;
                  saveCatalog({ ...content, levelUpRules: [...content.levelUpRules, { id, name: "New Level Rule", xpCost: 100, hpGain: 4, damageGain: 1 }] }, "Level-up rule added.");
                }} className={`${retro.button} mt-2 px-2 py-1 text-[9px]`} style={S_GREEN}>Add Level Rule</button>
              </div>
            </div>
          </details>

          <details className={`${retro.sunken} p-3`} style={{ background: "#050A1A" }}>
            <SectionSummary title="Advanced JSON" detail="import/export catalog" />
            <div className="flex flex-wrap gap-2 my-3">
              <button onClick={saveFrameworkCatalog} className={`${retro.button} px-3 py-2 text-[10px]`} style={S_GREEN}>Save JSON</button>
              <button onClick={() => setCatalogDraft(JSON.stringify(content, null, 2))} className={`${retro.button} px-3 py-2 text-[10px]`} style={S_ACCENT}>Refresh From Forms</button>
            </div>
            <textarea value={catalogDraft} onChange={(event) => setCatalogDraft(event.target.value)} className="w-full min-h-[220px] px-3 py-2 text-[11px] font-mono" spellCheck={false} style={{ color: "#D7F6FF", background: "#050A1A", border: "1px solid #2A2A6A", outline: "none" }} />
          </details>
        </div>
      </div>
    );
  };

  const renderLobby = () => (
    <div className="space-y-5">
      <div className={`${retro.raised} p-4`} style={{ background: "linear-gradient(135deg, #08162A, #130A24)", borderLeft: "4px solid #64E0FF" }}>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="text-[20px] font-bold" style={{ color: "#64E0FF", fontFamily: "'Courier New', monospace" }}>ADVENTURE V2</div>
            <div className="text-[12px] max-w-[820px]" style={S_MUTED}>
              Campaign-ready tactical sessions with profiles, setup controls, version-safe actions, previews, and reward claiming.
            </div>
          </div>
          <div className={`${retro.sunken} px-3 py-2 text-[10px]`} style={{ color: syncSource === "remote" ? "#8FF0B8" : "#FFD37A", background: "#050A1A" }}>
            {syncSource === "remote" ? "Shared sync online" : "Local fallback mode"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
        <div className="space-y-4">
          {renderProfileCard()}
          <div className={`${retro.sunken} p-4`} style={{ background: "#050A1A" }}>
            <div className="text-[13px] font-bold mb-3" style={S_TEXT}>Preferred Class</div>
            {renderClassPicker(true)}
          </div>
        </div>

        <div className={`${retro.raised} p-4`} style={{ background: "#080E24" }}>
          <div className="flex items-center gap-2 mb-3">
            <Castle size={16} style={S_ACCENT} />
            <div className="text-[13px] font-bold" style={S_TEXT}>Create Campaign Room</div>
          </div>
          <div className="space-y-3">
            <input value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} placeholder={`${currentUser}'s Expedition`} className="w-full px-3 py-2 text-[12px]" style={{ color: "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B", outline: "none" }} />
            {renderSetupFields(newSettings, setNewSettings)}
            <button onClick={handleCreate} className={`${retro.button} w-full py-2.5 text-[12px] flex items-center justify-center gap-2`} style={S_GREEN}>
              <Compass size={14} /> Create Adventure Room
            </button>
          </div>
        </div>
      </div>

      {renderFrameworkBuilder()}

      <div className={`${retro.raised} p-4`} style={{ background: "#080E24" }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Users size={16} style={S_ACCENT} />
            <div className="text-[13px] font-bold" style={S_TEXT}>Available Rooms</div>
          </div>
          {busy && <Loader2 size={14} className="animate-spin" style={S_DIM} />}
        </div>
        {openSessions.length === 0 ? (
          <div className={`${retro.sunken} p-6 text-center text-[12px]`} style={{ color: "#5A6A8A", background: "#050A1A" }}>
            No Adventure rooms yet. Create one and the party can join.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {openSessions.map((session) => {
              const joined = session.players.some((player) => player.playerId === currentUserId);
              const theme = ADVENTURE_THEMES[session.theme] || ADVENTURE_THEMES[DEFAULT_THEME];
              return (
                <button key={session.id} onClick={() => joined || session.status !== "lobby" ? setSelectedSessionId(session.id) : handleJoin(session)} className={`${retro.raised} p-3 text-left hover:bg-[#111B3A] transition-colors`} style={{ background: "#071027", borderLeft: `4px solid ${theme.accent}` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-bold" style={{ color: theme.accent }}>{session.name}</div>
                      <div className="text-[10px] mt-1" style={S_MUTED}>
                        {ADVENTURE_OBJECTIVES[session.settings.objectiveType]?.label || "Objective"} | Version {session.version} | Round {session.round}
                      </div>
                    </div>
                    <span className="text-[9px] px-2 py-0.5" style={{ color: session.status === "playing" ? "#8FF0B8" : session.status === "completed" ? "#FFD37A" : "#C0D0F0", border: "1px solid #2A3A5A" }}>
                      {session.phase.toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {session.players.map((player) => (
                      <span key={player.playerId} className="text-[9px] px-2 py-0.5" style={{ color: (player.classDef || classFor(player.classId)).color || "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B" }}>
                        {player.playerName}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 text-[10px]" style={joined ? S_GREEN : S_ACCENT}>{joined ? "OPEN ROOM" : session.status === "lobby" ? "JOIN ROOM" : "SPECTATE"}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderRoomSetup = (session: AdventureSession) => {
    const joined = !!myPlayer;
    const draft = setupDraft?.sessionId === session.id ? setupDraft : {
      sessionId: session.id,
      name: session.name,
      settings: { ...DEFAULT_ENCOUNTER_SETTINGS, ...(session.settings || {}) },
      framework: { ...DEFAULT_ADVENTURE_FRAMEWORK, ...(session.framework || {}) },
      dirty: false,
    };
    const updateSetupDraft = (patch: Partial<SetupDraftState>) => {
      setSetupDraft((current) => ({
        sessionId: session.id,
        name: current?.sessionId === session.id ? current.name : session.name,
        settings: current?.sessionId === session.id ? current.settings : { ...DEFAULT_ENCOUNTER_SETTINGS, ...(session.settings || {}) },
        framework: current?.sessionId === session.id ? current.framework : { ...DEFAULT_ADVENTURE_FRAMEWORK, ...(session.framework || {}) },
        ...patch,
        dirty: true,
      }));
    };
    const discardSetupDraft = () => {
      setSetupDraft({
        sessionId: session.id,
        name: session.name,
        settings: { ...DEFAULT_ENCOUNTER_SETTINGS, ...(session.settings || {}) },
        framework: { ...DEFAULT_ADVENTURE_FRAMEWORK, ...(session.framework || {}) },
        dirty: false,
      });
      setNotice("Unsaved setup changes discarded.");
    };
    const saveSetupDraft = async () => {
      const request = makeAdventureAction(session, currentUserId, "configure", {
        payload: { ...draft.settings, name: draft.name, framework: draft.framework },
      } as any);
      const saved = await commitAction(session, request);
      if (saved) {
        setSetupDraft((current) => current?.sessionId === session.id ? { ...current, dirty: false } : current);
        setNotice("Campaign setup saved.");
      }
    };
    const canStart = joined && isHost && !draft.dirty && session.players.length > 0 && session.players.every((player) => player.ready);
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setSelectedSessionId("")} className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`} style={S_ACCENT}>
            <ArrowLeft size={12} /> Rooms
          </button>
          <div className="text-[11px]" style={S_DIM}>Version {session.version} | Host: {session.players.find((player) => player.playerId === session.hostPlayerId)?.playerName || "Unknown"}</div>
        </div>

        <div className={`${retro.raised} p-5`} style={{ background: "#080E24", borderLeft: `4px solid ${ADVENTURE_THEMES[session.theme]?.accent || "#64E0FF"}` }}>
          <div className="text-[24px] font-bold" style={{ color: ADVENTURE_THEMES[session.theme]?.accent || "#64E0FF", fontFamily: "'Courier New', monospace" }}>{session.name}</div>
          <div className="text-[12px]" style={S_MUTED}>{session.objective.label}: {session.objective.description}</div>
        </div>

        {!joined && (
          <div className={`${retro.sunken} p-4`} style={{ background: "#050A1A" }}>
            <div className="text-[13px] font-bold mb-3" style={S_TEXT}>Join As</div>
            {renderClassPicker()}
            <button onClick={() => handleJoin(session)} className={`${retro.button} w-full mt-4 py-2.5 text-[12px]`} style={S_GREEN}>Join Adventure</button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
          <div className={`${retro.sunken} p-4`} style={{ background: "#050A1A" }}>
            <div className="text-[13px] font-bold mb-3" style={S_TEXT}>Party</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {session.players.map((player) => {
                const def = player.classDef || classFor(player.classId);
                return (
                  <div key={player.playerId} className={`${retro.raised} p-3`} style={{ background: "#080E24", borderLeft: `4px solid ${def.color}` }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13px] font-bold" style={S_TEXT}>{player.playerName}</div>
                      <span className="text-[9px] px-2 py-0.5" style={{ color: player.ready ? "#8FF0B8" : "#FFD37A", border: "1px solid #2A3A5A" }}>{player.ready ? "READY" : "NOT READY"}</span>
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: def.color }}>{def.name} | {def.role}</div>
                    {player.playerId === currentUserId && session.status === "lobby" && (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        {(Object.keys(classCatalog) as AdventureClassId[]).map((classId) => (
                          <button key={classId} onClick={() => dispatch("set_class", { payload: { classId } } as any)} className={`${retro.button} px-2 py-1 text-[10px]`} style={{ color: classCatalog[classId].color }}>
                            {classCatalog[classId].name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`${retro.raised} p-4 space-y-3`} style={{ background: "#080E24" }}>
            <div className="text-[13px] font-bold" style={S_TEXT}>Campaign Setup</div>
            {isHost ? (
              <div className="space-y-3">
                {draft.dirty && <div className={`${retro.sunken} px-3 py-2 text-[10px]`} style={{ color: "#FFD37A", background: "#151006" }}>Unsaved setup draft. Save setup before opening the starter shop.</div>}
                <input value={draft.name} onChange={(event) => updateSetupDraft({ name: event.target.value })} className="w-full px-3 py-2 text-[12px]" style={{ color: "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B", outline: "none" }} />
                {renderSetupFields(draft.settings, (settings) => updateSetupDraft({ settings }))}
                {renderFrameworkFields(draft.framework, (framework) => updateSetupDraft({ framework }))}
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={!draft.dirty || busy} onClick={saveSetupDraft} className={`${retro.button} py-2 text-[11px] disabled:opacity-40`} style={draft.dirty ? S_GREEN : S_DIM}>Save Setup</button>
                  <button disabled={!draft.dirty || busy} onClick={discardSetupDraft} className={`${retro.button} py-2 text-[11px] disabled:opacity-40`} style={S_ACCENT}>Discard</button>
                </div>
              </div>
            ) : (
              <div className="text-[11px]" style={S_MUTED}>The host controls encounter setup.</div>
            )}
            {joined && (
              <button onClick={() => dispatch("set_ready", { payload: { ready: !myPlayer?.ready } } as any)} className={`${retro.button} w-full py-2 text-[12px] flex items-center justify-center gap-2`} style={myPlayer?.ready ? S_WARN : S_GREEN}>
                {myPlayer?.ready ? <X size={13} /> : <Check size={13} />} {myPlayer?.ready ? "Unready" : "Ready Up"}
              </button>
            )}
            <button disabled={!canStart || busy} onClick={() => dispatch("start")} className={`${retro.button} w-full py-2 text-[12px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2`} style={canStart ? S_GREEN : S_DIM}>
              <Backpack size={13} /> {draft.dirty ? "Save Setup First" : "Open Starter Shop"}
            </button>
            {isHost && <button onClick={() => dispatch("abandon")} className={`${retro.button} w-full py-2 text-[12px]`} style={S_RED}>Abandon Room</button>}
          </div>
        </div>
      </div>
    );
  };

  const renderPlayerKit = (session: AdventureSession, player = myPlayer) => {
    if (!player) return null;
    const equipment = player.equipment || {};
    return (
      <div className={`${retro.sunken} p-3 space-y-2`} style={{ background: "#050A1A" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span style={S_TEXT}>{player.playerName}'s Kit</span>
          <span style={S_WARN}>{player.gold || 0} gold</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(["weapon", "armor", "trinket"] as AdventureEquipmentSlot[]).map((slot) => (
            <div key={slot} className="p-2 text-[10px]" style={{ border: "1px solid #1A1A4B", background: "#080E24" }}>
              <div style={S_DIM}>{equipmentSlotLabel(slot)}</div>
              <div style={equipment[slot] ? S_TEXT : S_MUTED}>{equipment[slot]?.name || "Empty"}</div>
              {equipment[slot] && <button onClick={() => dispatch(session.phase === "town" ? "town_sell" : "shop_sell", { payload: { itemId: equipment[slot]!.id, equipmentSlot: slot } } as any)} className={`${retro.button} mt-2 px-2 py-1 text-[9px]`} style={S_WARN}>Sell</button>}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {player.inventory.length === 0 ? <span className="text-[10px]" style={S_DIM}>No consumables yet.</span> : player.inventory.map((item) => (
            <span key={item.id} className="text-[9px] px-2 py-1" style={{ color: "#C0D0F0", border: "1px solid #1A1A4B", background: "#080E24" }}>
              {item.name} x{item.quantity}
              {(session.phase === "shop" || session.phase === "town") && <button onClick={() => dispatch(session.phase === "town" ? "town_sell" : "shop_sell", { payload: { itemId: item.id } } as any)} className="ml-2 underline" style={S_WARN}>sell</button>}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderShopCatalog = (town = false) => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {shopCatalog.map((item) => (
        <button key={item.id} onClick={() => dispatch(town ? "town_buy" : "shop_buy", { payload: { shopItemId: item.id } } as any)} className={`${retro.raised} p-3 text-left hover:bg-[#111B3A] transition-colors`} style={{ background: "#080E24", borderLeft: `4px solid ${item.kind === "equipment" ? "#64E0FF" : "#FFD37A"}` }}>
          <div className="flex items-start justify-between gap-2">
            <div className="text-[12px] font-bold" style={S_TEXT}>{item.name}</div>
            <div className="text-[10px]" style={S_WARN}>{item.price}g</div>
          </div>
          <div className="text-[10px] mt-1" style={S_MUTED}>{item.description}</div>
          {item.equipment && <div className="text-[9px] mt-2" style={S_ACCENT}>{equipmentSlotLabel(item.equipment.slot)} | HP +{item.equipment.maxHpBonus || 0} | Hit +{item.equipment.basicDamageBonus || 0} | Move +{item.equipment.moveBonus || 0}</div>}
        </button>
      ))}
    </div>
  );

  const renderStarterShop = (session: AdventureSession) => {
    const allReady = session.players.length > 0 && session.players.every((player) => player.shopReady);
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setSelectedSessionId("")} className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`} style={S_ACCENT}><ArrowLeft size={12} /> Rooms</button>
          <div className="text-[11px]" style={S_DIM}>Starter Shop | {STARTER_GOLD} gold per player | Version {session.version}</div>
        </div>
        <div className={`${retro.raised} p-5`} style={{ background: "linear-gradient(135deg, #10152A, #211208)", borderLeft: "4px solid #FFD37A" }}>
          <div className="text-[22px] font-bold" style={{ color: "#FFD37A", fontFamily: "'Courier New', monospace" }}>Build A Starting Kit</div>
          <div className="text-[12px]" style={S_MUTED}>Buy equipment and consumables before the campaign road opens. Equipment replaces the same slot and refunds the old item sell value.</div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
          <div className="space-y-3">
            {renderPlayerKit(session)}
            <button disabled={!myPlayer} onClick={() => dispatch("shop_ready", { payload: { ready: !myPlayer?.shopReady } } as any)} className={`${retro.button} w-full py-2 text-[12px] disabled:opacity-40`} style={myPlayer?.shopReady ? S_WARN : S_GREEN}>{myPlayer?.shopReady ? "Keep Shopping" : "Ready With Kit"}</button>
            {isHost && <button disabled={!allReady} onClick={() => dispatch("start_campaign")} className={`${retro.button} w-full py-2 text-[12px] disabled:opacity-40`} style={allReady ? S_GREEN : S_DIM}>Start Campaign Road</button>}
            <div className={`${retro.sunken} p-3 text-[10px]`} style={{ background: "#050A1A", color: "#AAB8D8" }}>
              {session.players.map((player) => <div key={player.playerId} className="flex justify-between gap-2"><span>{player.playerName}</span><span style={player.shopReady ? S_GREEN : S_WARN}>{player.shopReady ? "READY" : "SHOPPING"}</span></div>)}
            </div>
          </div>
          <div className={`${retro.raised} p-4`} style={{ background: "#080E24" }}>
            <div className="text-[13px] font-bold mb-3" style={S_TEXT}>Starter Shop Catalog</div>
            {renderShopCatalog(false)}
          </div>
        </div>
      </div>
    );
  };

  const renderPostNodeVotes = (session: AdventureSession) => {
    const campaign = session.campaign;
    if (!campaign?.awaitingPostNodeVote) return null;
    const needed = Math.max(1, Math.ceil(Math.max(1, session.players.filter((player) => player.hp > 0).length) / 2));
    return (
      <div className={`${retro.raised} p-4`} style={{ background: "#080E24", borderLeft: "4px solid #FFD37A" }}>
        <div className="text-[13px] font-bold" style={S_TEXT}>After Block Vote</div>
        <div className="text-[10px] mt-1" style={S_MUTED}>The party can camp to recover and trade, or move on to the next connected block.</div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={() => dispatch("vote_camp")} className={`${retro.button} py-2 text-[11px]`} style={campaign.campVotes.includes(currentUserId) ? S_GREEN : S_WARN}>Camp {campaign.campVotes.length}/{needed}</button>
          <button onClick={() => dispatch("vote_move")} className={`${retro.button} py-2 text-[11px]`} style={campaign.moveVotes.includes(currentUserId) ? S_GREEN : S_ACCENT}>Move On {campaign.moveVotes.length}/{needed}</button>
        </div>
      </div>
    );
  };

  const renderCampaignMap = (session: AdventureSession) => {
    const campaign = session.campaign;
    if (!campaign) return null;
    const current = getCurrentCampaignNode(session);
    const available = getAvailableCampaignNodes(session);
    const width = campaign.maxDepth * 180 + 140;
    const height = 360;
    const centerY = height / 2;
    return (
      <div className={`${retro.raised} p-4 overflow-auto`} style={{ background: "#050A1A" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-[13px] font-bold" style={S_TEXT}>Campaign Road</div>
            <div className="text-[10px]" style={S_MUTED}>Move vaguely right through connected blocks. Current block: {current?.title || "Unknown"}</div>
          </div>
          <div className="text-[10px]" style={S_WARN}>Sleeps left: {campaign.sleepUsesRemaining}</div>
        </div>
        <div className="relative" style={{ width, height, minWidth: width }}>
          <svg className="absolute inset-0 pointer-events-none" width={width} height={height}>
            {campaign.nodes.flatMap((node) => node.connectedNodeIds.map((targetId) => {
              const target = campaign.nodes.find((entry) => entry.id === targetId);
              if (!target) return null;
              return <line key={`${node.id}-${targetId}`} x1={node.x + 58} y1={centerY + node.y + 24} x2={target.x + 58} y2={centerY + target.y + 24} stroke={campaign.visitedNodeIds.includes(node.id) ? "#64E0FF" : "#25385A"} strokeWidth="2" strokeDasharray={node.resolved ? "" : "5 6"} />;
            }))}
          </svg>
          {campaign.nodes.map((node) => {
            const isCurrent = node.id === campaign.currentNodeId;
            const isAvailable = available.some((entry) => entry.id === node.id);
            const color = nodeColor(node);
            return (
              <button key={node.id} disabled={!isHost || !isAvailable} onClick={() => dispatch("choose_campaign_node", { payload: { nodeId: node.id } } as any)} className={`${retro.raised} absolute p-2 text-left transition-transform ${isAvailable ? "hover:scale-105" : ""} disabled:cursor-default`} style={{ left: node.x, top: centerY + node.y, width: 116, minHeight: 54, background: isCurrent ? `${color}22` : "#080E24", border: `2px solid ${isCurrent ? "#FFFFFF" : isAvailable ? color : "#1A1A4B"}`, color }}>
                <div className="text-[10px] font-bold">{node.title}</div>
                <div className="text-[8px] mt-1" style={node.resolved ? S_GREEN : S_DIM}>{node.kind.toUpperCase()}{node.resolved ? " | DONE" : ""}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCampaign = (session: AdventureSession) => {
    const current = getCurrentCampaignNode(session);
    const available = getAvailableCampaignNodes(session);
    const frameworkGroups = Object.entries(ADVENTURE_FRAMEWORK_REGISTRY);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setSelectedSessionId("")} className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`} style={S_ACCENT}><ArrowLeft size={12} /> Rooms</button>
          <div className="text-[10px]" style={S_DIM}>Campaign | Version {session.version} | Gold and XP are tracked per player</div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <div className="space-y-4">
            {renderCampaignMap(session)}
            {renderPostNodeVotes(session)}
            {current?.kind === "event" && !session.campaign?.awaitingPostNodeVote && (
              <div className={`${retro.raised} p-4`} style={{ background: "#080E24", borderLeft: "4px solid #FFD37A" }}>
                <div className="text-[15px] font-bold" style={S_TEXT}>{current.title}</div>
                <div className="text-[11px] mt-1" style={S_MUTED}>{current.description}</div>
                {isHost && <button onClick={() => dispatch("resolve_campaign_event")} className={`${retro.button} mt-3 px-4 py-2 text-[11px]`} style={S_GREEN}>Resolve Event Placeholder</button>}
              </div>
            )}
            {current?.kind === "start" && available.length > 0 && <div className="text-[11px]" style={S_MUTED}>Choose one of the connected blocks to begin moving right.</div>}
          </div>
          <div className="space-y-4">
            {renderPlayerKit(session)}
            <div className={`${retro.raised} p-4`} style={{ background: "#080E24" }}>
              <div className="text-[13px] font-bold mb-2" style={S_TEXT}>Expansion Framework</div>
              <div className="text-[10px] mb-3" style={S_MUTED}>These are the data slots a later DM editor can replace without changing the campaign shell.</div>
              <div className="space-y-2">
                {frameworkGroups.map(([key, values]) => (
                  <div key={key} className="flex justify-between gap-2 text-[10px]" style={S_DIM}>
                    <span>{key.replace(/Sets$/, " Sets")}</span>
                    <span>{Array.isArray(values) ? values.length : 0} registry</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${retro.sunken} p-4`} style={{ background: "#050A1A" }}>
              <div className="text-[13px] font-bold mb-3" style={S_TEXT}>Party Status</div>
              <div className="space-y-2">
                {session.players.map((player) => <div key={player.playerId} className="text-[10px] flex justify-between gap-2"><span style={{ color: (player.classDef || classFor(player.classId)).color }}>{player.playerName} L{player.campaignLevel || 1}</span><span style={S_DIM}>HP {player.hp}/{player.maxHp} | XP {player.xpBank || 0} | {player.gold || 0}g</span></div>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTown = (session: AdventureSession) => {
    const current = getCurrentCampaignNode(session);
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedSessionId("")} className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`} style={S_ACCENT}><ArrowLeft size={12} /> Rooms</button>
        <div className={`${retro.raised} p-5`} style={{ background: "#081F1A", borderLeft: "4px solid #8FF0B8" }}>
          <div className="text-[22px] font-bold" style={{ color: "#8FF0B8", fontFamily: "'Courier New', monospace" }}>{current?.title || "Town"}</div>
          <div className="text-[12px]" style={S_MUTED}>Buy, sell, and rest before voting on the next road decision.</div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
          <div className="space-y-3">
            {renderPlayerKit(session)}
            <button onClick={() => dispatch("town_rest")} className={`${retro.button} w-full py-2 text-[11px]`} style={S_GREEN}>Rest For 10 Gold</button>
            {isHost && <button onClick={() => dispatch("leave_town")} className={`${retro.button} w-full py-2 text-[11px]`} style={S_ACCENT}>Leave Town Block</button>}
          </div>
          <div className={`${retro.raised} p-4`} style={{ background: "#080E24" }}>
            <div className="text-[13px] font-bold mb-3" style={S_TEXT}>Town Market</div>
            {renderShopCatalog(true)}
          </div>
        </div>
      </div>
    );
  };

  const renderCamp = (session: AdventureSession) => {
    const levelRule = getAdventureLevelUpRule(session.content, session.framework.levelUpSetId);
    return (
    <div className="space-y-4">
      <button onClick={() => setSelectedSessionId("")} className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`} style={S_ACCENT}><ArrowLeft size={12} /> Rooms</button>
      <div className={`${retro.raised} p-5`} style={{ background: "#111827", borderLeft: "4px solid #FFD37A" }}>
        <div className="text-[22px] font-bold" style={{ color: "#FFD37A", fontFamily: "'Courier New', monospace" }}>Camp</div>
        <div className="text-[12px]" style={S_MUTED}>Use consumables, trade items, convert {levelRule.xpCost} XP into {levelRule.name}, or sleep. Sleeps are limited to 3 per campaign.</div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
        <div className="space-y-3">
            {renderPlayerKit(session)}
          <button onClick={() => dispatch("camp_level_up")} className={`${retro.button} w-full py-2 text-[11px]`} style={S_GREEN}>Convert XP To Level Up</button>
          <button onClick={() => dispatch("camp_sleep")} className={`${retro.button} w-full py-2 text-[11px]`} style={S_WARN}>Sleep ({session.campaign?.sleepUsesRemaining || 0} left)</button>
          {isHost && <button onClick={() => dispatch("leave_camp")} className={`${retro.button} w-full py-2 text-[11px]`} style={S_ACCENT}>Break Camp And Move On</button>}
        </div>
        <div className={`${retro.raised} p-4`} style={{ background: "#080E24" }}>
          <div className="text-[13px] font-bold mb-3" style={S_TEXT}>Camp Inventory Actions</div>
          {!myPlayer || myPlayer.inventory.length === 0 ? <div className="text-[11px]" style={S_DIM}>You have no consumables to use or trade.</div> : (
            <div className="space-y-3">
              {myPlayer.inventory.filter((item) => item.quantity > 0).map((item) => (
                <div key={item.id} className={`${retro.sunken} p-3`} style={{ background: "#050A1A" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px]" style={S_TEXT}>{item.name} x{item.quantity}</div>
                    {(item.kind === "heal" || item.kind === "cleanse" || item.kind === "guard") && <button onClick={() => dispatch("camp_use_item", { payload: { itemId: item.id, targetPlayerId: currentUserId } } as any)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_GREEN}>Use</button>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {session.players.filter((player) => player.playerId !== currentUserId).map((player) => <button key={player.playerId} onClick={() => dispatch("camp_trade", { payload: { itemId: item.id, targetPlayerId: player.playerId } } as any)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_ACCENT}>Give to {player.playerName}</button>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    );
  };

  const renderBoard = (session: AdventureSession) => {
    const map = session.map;
    if (!map) return renderRoomSetup(session);
    const theme = ADVENTURE_THEMES[session.theme] || ADVENTURE_THEMES[DEFAULT_THEME];
    const activeName = activePlayer?.playerName || activeEnemy?.name || "None";
    const reachable = getReachableTiles(session, myPlayer);
    const danger = getDangerTiles(session);
    const validTargets = getValidTargetIds(session, myPlayer, actionMode);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setSelectedSessionId("")} className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`} style={S_ACCENT}>
            <ArrowLeft size={12} /> Rooms
          </button>
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="px-2 py-1" style={{ color: theme.accent, border: "1px solid #2A3A5A", background: "#050A1A" }}>{theme.name}</span>
            <span className="px-2 py-1" style={{ color: "#C0D0F0", border: "1px solid #2A3A5A", background: "#050A1A" }}>Version {session.version}</span>
            <span className="px-2 py-1" style={{ color: "#FFD37A", border: "1px solid #2A3A5A", background: "#050A1A" }}>{session.objective.label}</span>
            <span className="px-2 py-1" style={{ color: activeEnemy ? "#FF8A6A" : "#8FF0B8", border: "1px solid #2A3A5A", background: "#050A1A" }}>Turn: {activeName}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
          <div className={`${retro.raised} p-3 overflow-auto`} style={{ background: "#050A1A" }}>
            <div className="mb-2 text-[10px] flex flex-wrap gap-2" style={S_DIM}>
              <span style={S_GREEN}>Green = reachable</span>
              <span style={S_WARN}>Gold = valid target</span>
              <span style={S_RED}>Red haze = enemy threat</span>
              <span>{hoverText || `${modeLabel(actionMode)} mode`}</span>
            </div>
            <div className="grid gap-[2px] mx-auto" style={{ gridTemplateColumns: `repeat(${map.width}, minmax(${map.width > 20 ? "18px" : "24px"}, 1fr))`, width: "min(100%, 980px)", minWidth: map.width > 20 ? 620 : 420 }}>
              {map.tiles.map((tile) => {
                const unit = getUnitAt(session, tile);
                const key = pointKey(tile);
                const canMove = actionMode.type === "move" && reachable.has(key);
                const inRange = !!unit && validTargets.has(unit.unit.id);
                const isActiveUnit = !!unit && (unit.unit.id === activePlayer?.id || unit.unit.id === activeEnemy?.id);
                const threatened = danger.has(key);
                return (
                  <button key={`${tile.x}-${tile.y}`} onMouseEnter={() => setHoverText(getTileActionReason(session, myPlayer, tile, actionMode) || "Valid action target.")} onMouseLeave={() => setHoverText("")} onClick={() => handleTileClick(tile)} title={`${tileKindLabel(tile.kind)} (${tile.x}, ${tile.y})`} className="relative aspect-square text-[9px] transition-transform hover:scale-105" style={{ background: tileBackground(tile, session.theme), border: canMove ? "2px solid #8FF0B8" : inRange ? "2px solid #FFD37A" : isActiveUnit ? "2px solid #FFFFFF" : "1px solid rgba(255,255,255,0.07)", boxShadow: canMove ? "0 0 12px #8FF0B855" : inRange ? "0 0 12px #FFD37A55" : threatened ? "inset 0 0 10px #FF4A4A55" : undefined, color: "#D7F6FF" }}>
                    {!unit && <span style={{ color: "rgba(255,255,255,0.24)" }}>{decorLabel(tile)}</span>}
                    {unit?.kind === "player" && (
                      <span className="absolute inset-[2px] rounded-sm flex items-center justify-center font-bold" style={{ background: `${(unit.unit.classDef || classFor(unit.unit.classId)).color}DD`, color: "#050A1A" }}>
                        {unitInitial(unit.unit.playerName)}
                        <span className="absolute left-0 right-0 bottom-0 h-1 bg-black/60"><span className="block h-full" style={{ width: hpPercent(unit.unit.hp, unit.unit.maxHp), background: "#4AFF4A" }} /></span>
                      </span>
                    )}
                    {unit?.kind === "enemy" && (
                      <span className="absolute inset-[2px] rounded-sm flex items-center justify-center font-bold" style={{ background: unit.unit.marked ? "#FFD37A" : "#C43B3B", color: "#050A1A" }}>
                        {unitInitial(unit.unit.enemyType)}
                        <span className="absolute left-0 right-0 bottom-0 h-1 bg-black/60"><span className="block h-full" style={{ width: hpPercent(unit.unit.hp, unit.unit.maxHp), background: "#FF6A6A" }} /></span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className={`${retro.raised} p-4`} style={{ background: "#080E24" }}>
              <div className="flex items-center justify-between gap-2 mb-3"><div className="text-[13px] font-bold" style={S_TEXT}>Encounter</div><span className="text-[10px]" style={S_DIM}>{livingPlayers.length} allies | {livingEnemies.length} enemies</span></div>
              <div className="space-y-2">
                {session.players.map((player) => (
                  <div key={player.id} className={`${retro.sunken} p-2`} style={{ background: "#050A1A" }}>
                    <div className="flex items-center justify-between gap-2 text-[10px]"><span style={{ color: (player.classDef || classFor(player.classId)).color }}>{player.playerName}</span><span style={player.hp > 0 ? S_GREEN : S_RED}>{player.hp}/{player.maxHp}</span></div>
                    <div className="h-1.5 mt-1 bg-[#111827]"><div className="h-full" style={{ width: hpPercent(player.hp, player.maxHp), background: (player.classDef || classFor(player.classId)).color }} /></div>
                    <div className="text-[9px] mt-1" style={S_DIM}>Seen {new Date(player.lastSeenAt).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${retro.raised} p-4`} style={{ background: "#080E24" }}>
              <div className="text-[13px] font-bold mb-3" style={S_TEXT}>Enemy Intent</div>
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                {session.enemies.filter((enemy) => enemy.hp > 0).map((enemy) => <div key={enemy.id} className="text-[10px] border-l-2 pl-2" style={{ borderLeftColor: enemy.marked ? "#FFD37A" : "#FF6A6A", color: "#AAB8D8" }}><div className="flex justify-between gap-2"><span>{enemy.name}</span><span>{enemy.hp}/{enemy.maxHp}</span></div><div style={S_DIM}>{enemy.intent}</div></div>)}
              </div>
            </div>
            <div className={`${retro.sunken} p-4`} style={{ background: "#050A1A" }}>
              <div className="text-[13px] font-bold mb-3" style={S_TEXT}>Combat Log</div>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {session.log.slice(0, 14).map((entry) => <div key={entry.id} className="text-[10px] leading-relaxed border-l-2 pl-2" style={{ color: entry.tone === "enemy" ? "#FF9A9A" : entry.tone === "reward" ? "#8FF0B8" : entry.tone === "warning" ? "#FFD37A" : "#AAB8D8", borderLeftColor: entry.tone === "enemy" ? "#FF6A6A" : entry.tone === "reward" ? "#4AFF4A" : entry.tone === "warning" ? "#FFD37A" : "#4A7BFF" }}>{entry.text}</div>)}
              </div>
            </div>
            {isHost && <button onClick={() => dispatch("skip_turn")} className={`${retro.button} w-full py-2 text-[11px] flex items-center justify-center gap-2`} style={S_WARN}><SkipForward size={13} /> Host Skip Active Turn</button>}
          </div>
        </div>

        {myPlayer && (
          <div className={`${retro.raised} p-4`} style={{ background: "linear-gradient(180deg, #08162A, #050A1A)", borderTop: "3px solid #1D3A5C" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-[13px] font-bold" style={{ color: activeClass.color }}>{myPlayer.playerName} | {activeClass.name}</div>
                <div className="text-[10px]" style={isMyTurn ? S_GREEN : S_DIM}>{isMyTurn ? `${modeLabel(actionMode)} mode. Select a highlighted tile or target.` : `Waiting for ${activeName}.`}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <span className="px-2 py-1" style={{ color: "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B" }}>Move {myPlayer.moveRemaining}</span>
                <span className="px-2 py-1" style={{ color: myPlayer.actionTaken ? "#FFD37A" : "#8FF0B8", background: "#050A1A", border: "1px solid #1A1A4B" }}>{myPlayer.actionTaken ? "Action Used" : "Action Ready"}</span>
                <span className="px-2 py-1" style={{ color: "#FFD37A", background: "#050A1A", border: "1px solid #1A1A4B" }}>Flee {session.fleeVotes.length}/{fleeNeeded}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-3">
              <div className="flex flex-wrap gap-2">
                <button disabled={!isMyTurn} onClick={() => setActionMode({ type: "move" })} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40 flex items-center gap-2`} style={actionMode.type === "move" ? S_GREEN : S_ACCENT}><Map size={13} /> Move</button>
                <button disabled={!isMyTurn || myPlayer.actionTaken} onClick={() => setActionMode({ type: "attack" })} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40 flex items-center gap-2`} style={actionMode.type === "attack" ? S_GREEN : S_ACCENT}><Axe size={13} /> Attack</button>
                {myPlayer.abilities.map((ability) => <button key={ability.id} disabled={!isMyTurn || myPlayer.actionTaken} onClick={() => ability.kind === "guard" ? dispatch("ability", { payload: { abilityId: ability.id } } as any) : setActionMode({ type: "ability", abilityId: ability.id })} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40 flex items-center gap-2`} style={actionMode.type === "ability" && actionMode.abilityId === ability.id ? S_GREEN : { color: activeClass.color }} title={ability.description}><Target size={13} /> {ability.name}</button>)}
                {myPlayer.inventory.filter((item) => item.quantity > 0).map((item) => <button key={item.id} disabled={!isMyTurn || myPlayer.actionTaken} onClick={() => item.kind === "guard" ? dispatch("item", { payload: { itemId: item.id } } as any) : setActionMode({ type: "item", itemId: item.id })} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40 flex items-center gap-2`} style={actionMode.type === "item" && actionMode.itemId === item.id ? S_GREEN : S_WARN} title={item.description}><Backpack size={13} /> {item.name} x{item.quantity}</button>)}
              </div>
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button disabled={!isMyTurn || myPlayer.actionTaken} onClick={() => dispatch("block")} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40 flex items-center gap-2`} style={S_WARN}><Shield size={13} /> Block</button>
                <button onClick={() => dispatch("vote_flee")} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-2`} style={session.fleeVotes.includes(currentUserId) ? S_GREEN : S_RED}><Compass size={13} /> Vote To Flee</button>
                <button disabled={!isMyTurn} onClick={() => dispatch("end_turn")} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40 flex items-center gap-2`} style={S_GREEN}><Swords size={13} /> End Turn</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCompleted = (session: AdventureSession) => {
    const reward = session.pendingRewards.find((entry) => entry.playerId === currentUserId);
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedSessionId("")} className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`} style={S_ACCENT}><ArrowLeft size={12} /> Rooms</button>
        <div className={`${retro.raised} p-8 text-center`} style={{ background: "#080E24", borderLeft: `4px solid ${session.outcome === "victory" ? "#8FF0B8" : "#FF6A6A"}` }}>
          <div className="text-[28px] font-bold mb-2" style={{ color: session.outcome === "victory" ? "#8FF0B8" : session.outcome === "retreat" ? "#FFD37A" : "#FF6A6A", fontFamily: "'Courier New', monospace" }}>{String(session.outcome || "completed").toUpperCase()}</div>
          <div className="text-[12px]" style={S_MUTED}>{session.objective.label} | Version {session.version}</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div className={`${retro.sunken} p-4`} style={{ background: "#050A1A" }}>
            <div className="text-[13px] font-bold mb-3" style={S_TEXT}>Final Log</div>
            <div className="space-y-2">{session.log.slice(0, 12).map((entry) => <div key={entry.id} className="text-[10px]" style={S_MUTED}>{entry.text}</div>)}</div>
          </div>
          <div className={`${retro.raised} p-4 space-y-3`} style={{ background: "#080E24" }}>
            <div className="text-[13px] font-bold flex items-center gap-2" style={S_TEXT}><Trophy size={14} /> Rewards</div>
            {reward ? (
              <div className="space-y-2">
                <div className="text-[12px]" style={reward.claimed ? S_GREEN : S_WARN}>{reward.reward.summary}</div>
                <button disabled={reward.claimed} onClick={() => dispatch("claim_rewards")} className={`${retro.button} w-full py-2 text-[11px] disabled:opacity-40`} style={reward.claimed ? S_DIM : S_GREEN}>{reward.claimed ? "Claimed" : "Claim Rewards"}</button>
              </div>
            ) : <div className="text-[11px]" style={S_DIM}>Rewards will appear after the session is finalized.</div>}
            {isHost && <button onClick={() => dispatch("reset_to_lobby")} className={`${retro.button} w-full py-2 text-[11px] flex items-center justify-center gap-2`} style={S_ACCENT}><RotateCcw size={13} /> Reset To Lobby</button>}
            {isHost && <button onClick={() => dispatch("close")} className={`${retro.button} w-full py-2 text-[11px]`} style={S_RED}>Close Room</button>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`} style={S_ACCENT}><ArrowLeft size={12} /> Back to Games</button>
        <div className="flex items-center gap-2 text-[10px]" style={busy ? S_WARN : syncSource === "remote" ? S_GREEN : S_WARN}>{busy && <Loader2 size={12} className="animate-spin" />}{busy ? "Syncing" : syncSource === "remote" ? "Shared Adventure sync" : "Local Adventure fallback"}</div>
      </div>
      {notice && <div className={`${retro.sunken} px-3 py-2 text-[11px] flex items-center gap-2`} style={{ color: "#FFD37A", background: "#151006" }}><Eye size={13} /> {notice}</div>}
      {!selectedSession
        ? renderLobby()
        : selectedSession.phase === "setup"
          ? renderRoomSetup(selectedSession)
          : selectedSession.phase === "shop"
            ? renderStarterShop(selectedSession)
            : selectedSession.phase === "campaign"
              ? renderCampaign(selectedSession)
              : selectedSession.phase === "town"
                ? renderTown(selectedSession)
                : selectedSession.phase === "camp"
                  ? renderCamp(selectedSession)
                  : selectedSession.phase === "encounter"
                    ? renderBoard(selectedSession)
                    : renderCompleted(selectedSession)}
    </div>
  );
}
