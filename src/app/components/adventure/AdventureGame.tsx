import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Axe, Backpack, Castle, Check, Compass, Eye, Heart, Loader2, Map, RotateCcw, Shield, SkipForward, Swords, Target, Trophy, Users, X } from "lucide-react";
import { retro } from "../retro-styles";
import { S_ACCENT, S_DIM, S_GREEN, S_MUTED, S_RED, S_TEXT, S_WARN } from "../shared-styles";
import { safeGetItem, safeSetItem } from "../safe-storage";
import { ADVENTURE_CLASSES, ADVENTURE_DIFFICULTIES, ADVENTURE_OBJECTIVES, ADVENTURE_THEMES, DEFAULT_ENCOUNTER_SETTINGS, DEFAULT_THEME, MAP_SIZE_OPTIONS } from "./data";
import { makeAdventureAction, resolveAdventureAction } from "./actions";
import { createAdventureSession, distance, getAbilityById, getActiveEnemy, getActivePlayer, getItemById, getUnitAt, makeId, tileKindLabel } from "./engine";
import { createAdventureProfile, normalizeAdventureProfile, xpForLevel } from "./profile";
import { pointKey, getDangerTiles, getReachableTiles, getTileActionReason, getValidTargetIds } from "./selectors";
import { subscribeAdventureState, upsertAdventureSession, upsertAdventureState } from "./store";
import type { AdventureActionMode, AdventureActionRequest, AdventureClassId, AdventureEncounterSettings, AdventureProfilesByPlayer, AdventureSession, AdventureStateDoc, AdventureTheme, AdventureTile } from "./types";

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

export function AdventureGame({ onBack }: { onBack: () => void; onScoreSave?: (score: number) => void }) {
  const currentUser = safeGetItem("inet-user") || "Player";
  const currentUserId = safeGetItem("inet-user-id") || currentUser;
  const [state, setState] = useState<AdventureStateDoc>({ schemaVersion: 2, sessions: [], profiles: {} });
  const [selectedSessionId, setSelectedSessionId] = useState(() => safeGetItem(SELECTED_SESSION_KEY) || "");
  const [selectedClass, setSelectedClass] = useState<AdventureClassId>("warrior");
  const [newRoomName, setNewRoomName] = useState("");
  const [newSettings, setNewSettings] = useState<AdventureEncounterSettings>(DEFAULT_ENCOUNTER_SETTINGS);
  const [actionMode, setActionMode] = useState<AdventureActionMode>({ type: "move" });
  const [syncSource, setSyncSource] = useState<"remote" | "local">("local");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [hoverText, setHoverText] = useState("");

  const sessions = state.sessions;
  const profiles = state.profiles;
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || null;
  const profile = useMemo(
    () => normalizeAdventureProfile(profiles[currentUserId], currentUserId, currentUser, selectedClass),
    [currentUser, currentUserId, profiles, selectedClass],
  );
  const myPlayer = selectedSession?.players.find((player) => player.playerId === currentUserId) || null;
  const activePlayer = selectedSession ? getActivePlayer(selectedSession) : null;
  const activeEnemy = selectedSession ? getActiveEnemy(selectedSession) : null;
  const isMyTurn = !!activePlayer && activePlayer.playerId === currentUserId;
  const isHost = !!selectedSession && selectedSession.hostPlayerId === currentUserId;
  const activeClass = myPlayer ? ADVENTURE_CLASSES[myPlayer.classId] : ADVENTURE_CLASSES[selectedClass];
  const livingPlayers = selectedSession?.players.filter((player) => player.hp > 0) || [];
  const livingEnemies = selectedSession?.enemies.filter((enemy) => enemy.hp > 0) || [];
  const fleeNeeded = Math.max(1, Math.ceil(livingPlayers.length / 2));

  useEffect(() => {
    return subscribeAdventureState((nextState, source) => {
      setState(nextState);
      setSyncSource(source);
    });
  }, []);

  useEffect(() => {
    if (selectedSessionId) safeSetItem(SELECTED_SESSION_KEY, selectedSessionId);
  }, [selectedSessionId]);

  useEffect(() => {
    setActionMode({ type: "move" });
  }, [selectedSessionId, selectedSession?.activeTurnIndex, selectedSession?.round]);

  const saveWholeState = useCallback(async (nextState: AdventureStateDoc) => {
    setBusy(true);
    setState(nextState);
    try {
      setSyncSource(await upsertAdventureState(nextState));
    } finally {
      setBusy(false);
    }
  }, []);

  const commitAction = useCallback(async (session: AdventureSession, request: AdventureActionRequest) => {
    setBusy(true);
    setNotice("");
    const result = resolveAdventureAction(session, request, profiles);
    if (!result.ok) {
      setNotice(result.reason || "Action rejected.");
      setBusy(false);
      return;
    }
    setState((prev) => ({
      schemaVersion: 2,
      sessions: prev.sessions.map((entry) => entry.id === result.session.id ? result.session : entry),
      profiles: result.profiles,
    }));
    const saveResult = await upsertAdventureSession(result.session, result.profiles, request.expectedVersion);
    setSyncSource(saveResult.source);
    if (!saveResult.ok) {
      setState(saveResult.state);
      setNotice(saveResult.reason || "Room changed before save. Latest state loaded.");
    }
    setBusy(false);
  }, [profiles]);

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
    });
    const configured: AdventureSession = {
      ...session,
      name: newRoomName.trim() || session.name,
      mapSize: newSettings.mapSize,
      theme: newSettings.theme,
      settings: newSettings,
      objective: { ...ADVENTURE_OBJECTIVES[newSettings.objectiveType], completed: false },
    };
    const nextProfiles: AdventureProfilesByPlayer = {
      ...profiles,
      [currentUserId]: normalizeAdventureProfile(profiles[currentUserId] || createAdventureProfile(currentUserId, currentUser, profile.preferredClassId), currentUserId, currentUser, profile.preferredClassId),
    };
    const nextState = { schemaVersion: 2 as const, sessions: [configured, ...sessions].slice(0, 20), profiles: nextProfiles };
    setNewRoomName("");
    setSelectedSessionId(configured.id);
    void saveWholeState(nextState);
  }, [currentUser, currentUserId, newRoomName, newSettings, profile.preferredClassId, profiles, saveWholeState, sessions]);

  const handleJoin = useCallback((session: AdventureSession) => {
    const request = makeAdventureAction(session, currentUserId, "join", {
      payload: { playerName: currentUser, classId: profile.preferredClassId },
    } as any);
    setSelectedSessionId(session.id);
    void commitAction(session, request);
  }, [commitAction, currentUser, currentUserId, profile.preferredClassId]);

  const handleTileClick = useCallback((tile: AdventureTile) => {
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
  }, [actionMode, dispatch, myPlayer, selectedSession]);

  const openSessions = useMemo(
    () => sessions.filter((session) => session.phase !== "closed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [sessions],
  );

  const renderProfileCard = () => {
    const xpCurrent = profile.xp - xpForLevel(profile.level);
    const xpNext = Math.max(1, xpForLevel(profile.level + 1) - xpForLevel(profile.level));
    return (
      <div className={`${retro.raised} p-4`} style={{ background: "#080E24", borderLeft: `4px solid ${ADVENTURE_CLASSES[profile.preferredClassId].color}` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-bold" style={S_TEXT}>{profile.playerName}</div>
            <div className="text-[10px]" style={{ color: ADVENTURE_CLASSES[profile.preferredClassId].color }}>
              Level {profile.level} {ADVENTURE_CLASSES[profile.preferredClassId].name}
            </div>
          </div>
          <div className="text-[10px] text-right" style={S_WARN}>{profile.currency} currency</div>
        </div>
        <div className="h-2 mt-3 bg-[#050A1A]" style={{ border: "1px solid #1A1A4B" }}>
          <div className="h-full" style={{ width: `${Math.min(100, Math.round((xpCurrent / xpNext) * 100))}%`, background: ADVENTURE_CLASSES[profile.preferredClassId].color }} />
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
      {(Object.keys(ADVENTURE_CLASSES) as AdventureClassId[]).map((classId) => {
        const def = ADVENTURE_CLASSES[classId];
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
                      <span key={player.playerId} className="text-[9px] px-2 py-0.5" style={{ color: ADVENTURE_CLASSES[player.classId]?.color || "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B" }}>
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
    const canStart = joined && isHost && session.players.length > 0 && session.players.every((player) => player.ready);
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
                const def = ADVENTURE_CLASSES[player.classId];
                return (
                  <div key={player.playerId} className={`${retro.raised} p-3`} style={{ background: "#080E24", borderLeft: `4px solid ${def.color}` }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13px] font-bold" style={S_TEXT}>{player.playerName}</div>
                      <span className="text-[9px] px-2 py-0.5" style={{ color: player.ready ? "#8FF0B8" : "#FFD37A", border: "1px solid #2A3A5A" }}>{player.ready ? "READY" : "NOT READY"}</span>
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: def.color }}>{def.name} | {def.role}</div>
                    {player.playerId === currentUserId && session.status === "lobby" && (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        {(Object.keys(ADVENTURE_CLASSES) as AdventureClassId[]).map((classId) => (
                          <button key={classId} onClick={() => dispatch("set_class", { payload: { classId } } as any)} className={`${retro.button} px-2 py-1 text-[10px]`} style={{ color: ADVENTURE_CLASSES[classId].color }}>
                            {ADVENTURE_CLASSES[classId].name}
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
            <div className="text-[13px] font-bold" style={S_TEXT}>Encounter Setup</div>
            {isHost ? (
              <div className="space-y-3">
                <input value={session.name} onChange={(event) => dispatch("configure", { payload: { name: event.target.value } } as any)} className="w-full px-3 py-2 text-[12px]" style={{ color: "#C0D0F0", background: "#050A1A", border: "1px solid #1A1A4B", outline: "none" }} />
                {renderSetupFields(session.settings, (settings) => dispatch("configure", { payload: settings } as any))}
              </div>
            ) : (
              <div className="text-[11px]" style={S_MUTED}>The host controls encounter setup.</div>
            )}
            {joined && (
              <button onClick={() => dispatch("set_ready", { payload: { ready: !myPlayer?.ready } } as any)} className={`${retro.button} w-full py-2 text-[12px] flex items-center justify-center gap-2`} style={myPlayer?.ready ? S_WARN : S_GREEN}>
                {myPlayer?.ready ? <X size={13} /> : <Check size={13} />} {myPlayer?.ready ? "Unready" : "Ready Up"}
              </button>
            )}
            <button disabled={!canStart} onClick={() => dispatch("start")} className={`${retro.button} w-full py-2 text-[12px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2`} style={canStart ? S_GREEN : S_DIM}>
              <Swords size={13} /> Start Encounter
            </button>
            {isHost && <button onClick={() => dispatch("abandon")} className={`${retro.button} w-full py-2 text-[12px]`} style={S_RED}>Abandon Room</button>}
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
                      <span className="absolute inset-[2px] rounded-sm flex items-center justify-center font-bold" style={{ background: `${ADVENTURE_CLASSES[unit.unit.classId].color}DD`, color: "#050A1A" }}>
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
                    <div className="flex items-center justify-between gap-2 text-[10px]"><span style={{ color: ADVENTURE_CLASSES[player.classId].color }}>{player.playerName}</span><span style={player.hp > 0 ? S_GREEN : S_RED}>{player.hp}/{player.maxHp}</span></div>
                    <div className="h-1.5 mt-1 bg-[#111827]"><div className="h-full" style={{ width: hpPercent(player.hp, player.maxHp), background: ADVENTURE_CLASSES[player.classId].color }} /></div>
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
      {!selectedSession ? renderLobby() : selectedSession.status === "lobby" ? renderRoomSetup(selectedSession) : selectedSession.status === "playing" ? renderBoard(selectedSession) : renderCompleted(selectedSession)}
    </div>
  );
}
