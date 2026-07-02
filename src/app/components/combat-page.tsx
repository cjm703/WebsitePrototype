import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import {
  ArrowLeft,
  CreditCard,
  Dice6,
  Download,
  Droplets,
  Eraser,
  FileText,
  HeartPulse,
  Link as LinkIcon,
  Lock,
  MessageSquare,
  Music,
  Package,
  Pause,
  Play,
  RotateCcw,
  Search,
  Send,
  Shield,
  SlidersHorizontal,
  Square,
  Swords,
  Tag,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import { appStore } from "@/lib/app-store";
import { retro } from "./retro-styles";
import { safeGetItem, safeGetJson, safeSetJson } from "./safe-storage";
import { DISPLAY_CONTENTS, S_ACCENT, S_DIM, S_GREEN, S_MUTED, S_RED, S_TEXT, S_WARN } from "./shared-styles";
import type { ManagedCard, ManagedItem, PlayerData } from "./types";

type CombatTab = "players" | "music";
type FeedKind = "message" | "roll" | "wound" | "card" | "item" | "system";
type TrackSource = "audio-url" | "youtube" | "file";
type MusicSort = "recent" | "title" | "source" | "tag";

interface CombatFeedMessage {
  id: string;
  kind: FeedKind;
  playerId: string;
  playerName: string;
  text: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

interface CombatPlayerQuickState {
  flags: string[];
  note: string;
}

interface CombatState {
  messages: CombatFeedMessage[];
  playerStates: Record<string, CombatPlayerQuickState>;
  round: number;
  scene: string;
  updatedAt: string;
}

interface MusicTrack {
  id: string;
  title: string;
  sourceType: TrackSource;
  url: string;
  addedBy: string;
  createdAt: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  audioDataOmitted?: boolean;
  tags?: string[];
  notes?: string;
  updatedAt?: string;
}

interface AudioEffectSettings {
  reverb: number;
  echo: number;
  muffle: number;
  thin: number;
  speed: number;
}

interface ActiveMusicTrack {
  trackId: string;
  playing: boolean;
  volume: number;
  loop: boolean;
  muted?: boolean;
  effects?: AudioEffectSettings;
  startedAt: number;
  updatedAt: string;
}

interface CombatMusicState {
  tracks: MusicTrack[];
  active: ActiveMusicTrack[];
  masterVolume: number;
  muted: boolean;
  updatedAt: string;
}

interface DiceRollResult {
  formula: string;
  total: number;
  rolls: number[];
  modifier: number;
  detail: string;
}

const LOCAL_COMBAT_STATE_KEY = "inet-combat-state";
const LOCAL_MUSIC_STATE_KEY = "inet-combat-music-state";
const DEFAULT_COMBAT_STATE: CombatState = { messages: [], playerStates: {}, round: 1, scene: "", updatedAt: "" };
const DEFAULT_MUSIC_STATE: CombatMusicState = { tracks: [], active: [], masterVolume: 0.85, muted: false, updatedAt: "" };
const DEFAULT_AUDIO_EFFECTS: AudioEffectSettings = { reverb: 0, echo: 0, muffle: 0, thin: 0, speed: 1 };
const QUICK_FLAGS = ["Guarded", "Concentrating", "Prone", "Hidden", "Bloodied", "Stunned"];
const MAX_FEED_MESSAGES = 150;
const MAX_AUDIO_FILE_BYTES = 12 * 1024 * 1024;
const LOCAL_AUDIO_CACHE_OMIT_THRESHOLD = 256 * 1024;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function assignedToMatches(assignedTo: unknown, playerId: string) {
  return Array.isArray(assignedTo)
    ? assignedTo.includes(playerId) || assignedTo.includes("all")
    : assignedTo === playerId || assignedTo === "all";
}

function parseNumberInput(value: string, fallback: number) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDiceFormula(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function rollDice(rawFormula: string): DiceRollResult | null {
  const formula = normalizeDiceFormula(rawFormula);
  const match = formula.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) return null;
  const count = clampNumber(parseInt(match[1] || "1", 10), 1, 50);
  const sides = clampNumber(parseInt(match[2], 10), 2, 1000);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;
  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const total = rolls.reduce((sum, value) => sum + value, 0) + modifier;
  const modText = modifier === 0 ? "" : modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
  return {
    formula: `${count}d${sides}${modifier ? match[3] : ""}`,
    total,
    rolls,
    modifier,
    detail: `${rolls.join(" + ")}${modText}`,
  };
}

function hpColor(current: number, max: number) {
  if (max <= 0) return "#8FA3C8";
  const ratio = current / max;
  if (ratio <= 0.25) return "#FF6A6A";
  if (ratio <= 0.5) return "#FFAA4A";
  return "#4AFF7A";
}

function percentValue(current: number, max: number) {
  if (max <= 0) return 0;
  return Math.round((clampNumber(current, 0, max) / max) * 100);
}

function getYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.replace("/", "") || null;
    if (host.endsWith("youtube.com")) {
      const watchId = parsed.searchParams.get("v");
      if (watchId) return watchId;
      const parts = parsed.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live");
      if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1];
    }
  } catch {}
  return null;
}

function inferTrackSource(url: string): TrackSource {
  return getYouTubeVideoId(url) ? "youtube" : "audio-url";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read audio file."));
    reader.readAsDataURL(file);
  });
}

function trackLabelFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Linked Track";
  }
}

function parseTrackTags(raw: string) {
  const seen = new Set<string>();
  return raw
    .split(/[,#]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function normalizeTrackTags(raw: unknown) {
  if (Array.isArray(raw)) return parseTrackTags(raw.filter((tag) => typeof tag === "string").join(","));
  if (typeof raw === "string") return parseTrackTags(raw);
  return [];
}

function normalizeAudioEffects(raw: Partial<AudioEffectSettings> | null | undefined): AudioEffectSettings {
  return {
    reverb: clampNumber(Number(raw?.reverb ?? DEFAULT_AUDIO_EFFECTS.reverb), 0, 1),
    echo: clampNumber(Number(raw?.echo ?? DEFAULT_AUDIO_EFFECTS.echo), 0, 1),
    muffle: clampNumber(Number(raw?.muffle ?? DEFAULT_AUDIO_EFFECTS.muffle), 0, 1),
    thin: clampNumber(Number(raw?.thin ?? DEFAULT_AUDIO_EFFECTS.thin), 0, 1),
    speed: clampNumber(Number(raw?.speed ?? DEFAULT_AUDIO_EFFECTS.speed), 0.5, 1.5),
  };
}

function lowpassFromMuffle(amount: number) {
  return Math.max(700, 20000 - (clampNumber(amount, 0, 1) * 19300));
}

function highpassFromThin(amount: number) {
  return Math.min(1800, 20 + (clampNumber(amount, 0, 1) * 1780));
}

function sourceLabel(track: MusicTrack) {
  if (track.audioDataOmitted && !track.url) return `${track.fileName || "Uploaded file"} (shared copy needed)`;
  if (track.sourceType === "youtube") return "YouTube";
  if (track.sourceType === "file") return track.fileName || "Uploaded file";
  return "Audio URL";
}

function hasPlayableSource(track: MusicTrack) {
  if (!track.url) return false;
  if (track.sourceType === "youtube") return Boolean(getYouTubeVideoId(track.url));
  return true;
}

function buildLocalMusicCacheState(state: CombatMusicState): CombatMusicState {
  return {
    ...state,
    tracks: state.tracks.map((track) => {
      const shouldOmitAudioData =
        track.sourceType === "file" &&
        typeof track.url === "string" &&
        track.url.startsWith("data:") &&
        track.url.length > LOCAL_AUDIO_CACHE_OMIT_THRESHOLD;

      if (!shouldOmitAudioData) return track;

      return {
        ...track,
        url: "",
        audioDataOmitted: true,
      };
    }),
  };
}

function formatTime(iso: string) {
  const parsed = Date.parse(iso);
  if (!parsed) return "";
  return new Date(parsed).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildLocalPlayerFallback(): PlayerData[] {
  return safeGetJson<PlayerData[]>("inet-dm-players", []);
}

function buildLocalCardsFallback(): ManagedCard[] {
  return safeGetJson<ManagedCard[]>("inet-dm-cards", []);
}

function buildLocalItemsFallback(): ManagedItem[] {
  return safeGetJson<ManagedItem[]>("inet-dm-items", []);
}

function normalizeCombatState(state: Partial<CombatState> | null | undefined): CombatState {
  return {
    messages: Array.isArray(state?.messages) ? state!.messages.slice(-MAX_FEED_MESSAGES) : [],
    playerStates: state?.playerStates && typeof state.playerStates === "object" ? state.playerStates : {},
    round: clampNumber(Number(state?.round ?? DEFAULT_COMBAT_STATE.round), 1, 999),
    scene: typeof state?.scene === "string" ? state.scene : "",
    updatedAt: typeof state?.updatedAt === "string" ? state.updatedAt : "",
  };
}

function normalizeMusicState(state: Partial<CombatMusicState> | null | undefined): CombatMusicState {
  return {
    tracks: Array.isArray(state?.tracks)
      ? state!.tracks
          .filter((track) => track && typeof track.id === "string" && typeof track.url === "string")
          .map((track) => ({
            ...track,
            title: typeof track.title === "string" && track.title.trim() ? track.title : trackLabelFromUrl(track.url),
            sourceType: track.sourceType === "youtube" || track.sourceType === "file" || track.sourceType === "audio-url"
              ? track.sourceType
              : inferTrackSource(track.url),
            tags: normalizeTrackTags(track.tags),
            notes: typeof track.notes === "string" ? track.notes : "",
            contentType: typeof track.contentType === "string" ? track.contentType : "",
            sizeBytes: Number.isFinite(Number(track.sizeBytes)) ? Number(track.sizeBytes) : undefined,
            audioDataOmitted: Boolean(track.audioDataOmitted),
            createdAt: typeof track.createdAt === "string" ? track.createdAt : new Date().toISOString(),
            updatedAt: typeof track.updatedAt === "string" ? track.updatedAt : "",
          }))
      : [],
    active: Array.isArray(state?.active)
      ? state!.active
          .filter((entry) => entry && typeof entry.trackId === "string")
          .map((entry) => ({
            trackId: entry.trackId,
            playing: Boolean(entry.playing),
            volume: clampNumber(Number(entry.volume ?? 0.65), 0, 1),
            loop: Boolean(entry.loop),
            muted: Boolean(entry.muted),
            effects: normalizeAudioEffects(entry.effects),
            startedAt: Number.isFinite(Number(entry.startedAt)) ? Number(entry.startedAt) : Date.now(),
            updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
          }))
      : [],
    masterVolume: clampNumber(Number(state?.masterVolume ?? DEFAULT_MUSIC_STATE.masterVolume), 0, 1),
    muted: Boolean(state?.muted),
    updatedAt: typeof state?.updatedAt === "string" ? state.updatedAt : "",
  };
}

export function CombatPage() {
  const navigate = useNavigate();
  const currentUser = safeGetItem("inet-user") || "";
  const currentUserId = safeGetItem("inet-user-id") || "";
  const isDM = currentUser === "DM" || currentUserId === "dm";
  const [activeTab, setActiveTab] = useState<CombatTab>("players");
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [cards, setCards] = useState<ManagedCard[]>([]);
  const [items, setItems] = useState<ManagedItem[]>([]);
  const [combatState, setCombatState] = useState<CombatState>(DEFAULT_COMBAT_STATE);
  const [musicState, setMusicState] = useState<CombatMusicState>(DEFAULT_MUSIC_STATE);
  const [feedText, setFeedText] = useState("");
  const [diceFormula, setDiceFormula] = useState("1d20");
  const [shareKind, setShareKind] = useState<"card" | "item">("card");
  const [shareQuery, setShareQuery] = useState("");
  const [sharePlayerId, setSharePlayerId] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicTitle, setMusicTitle] = useState("");
  const [musicStatus, setMusicStatus] = useState("");
  const [musicSearch, setMusicSearch] = useState("");
  const [musicSort, setMusicSort] = useState<MusicSort>("recent");
  const [previewTrackId, setPreviewTrackId] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [sceneDraft, setSceneDraft] = useState("");
  const [sceneDraftDirty, setSceneDraftDirty] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const nonDmPlayers = useMemo(
    () => players.filter((player) => player.id !== "dm" && player.name !== "DM"),
    [players],
  );

  const currentPlayer = useMemo(
    () => nonDmPlayers.find((player) => player.id === currentUserId || player.name === currentUser) || null,
    [currentUser, currentUserId, nonDmPlayers],
  );

  useEffect(() => {
    if (!sharePlayerId && nonDmPlayers.length > 0) {
      setSharePlayerId(currentPlayer?.id || nonDmPlayers[0].id);
    }
  }, [currentPlayer?.id, nonDmPlayers, sharePlayerId]);

  const hydrate = useCallback(async () => {
    const [nextPlayers, nextCards, nextItems, nextCombat, nextMusic] = await Promise.all([
      appStore.listPlayers<PlayerData>().catch(() => buildLocalPlayerFallback()),
      appStore.listCards<ManagedCard>().catch(() => buildLocalCardsFallback()),
      appStore.listItems<ManagedItem>().catch(() => buildLocalItemsFallback()),
      appStore.loadCombatState<CombatState>(DEFAULT_COMBAT_STATE).catch(() => safeGetJson<CombatState>(LOCAL_COMBAT_STATE_KEY, DEFAULT_COMBAT_STATE)),
      appStore.loadCombatMusicState<CombatMusicState>(DEFAULT_MUSIC_STATE).catch(() => safeGetJson<CombatMusicState>(LOCAL_MUSIC_STATE_KEY, DEFAULT_MUSIC_STATE)),
    ]);
    setPlayers(Array.isArray(nextPlayers) ? nextPlayers : []);
    setCards(Array.isArray(nextCards) ? nextCards : []);
    setItems(Array.isArray(nextItems) ? nextItems : []);
    setCombatState(normalizeCombatState(nextCombat));
    setMusicState(normalizeMusicState(nextMusic));
  }, []);

  useEffect(() => {
    void hydrate();
    const interval = window.setInterval(() => void hydrate(), 2500);
    return () => window.clearInterval(interval);
  }, [hydrate]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [combatState.messages.length]);

  useEffect(() => {
    if (!sceneDraftDirty) setSceneDraft(combatState.scene || "");
  }, [combatState.scene, sceneDraftDirty]);

  const savePlayers = useCallback(async (nextPlayers: PlayerData[]) => {
    setPlayers(nextPlayers);
    safeSetJson("inet-dm-players", nextPlayers);
    await appStore.savePlayers(nextPlayers).catch(() => {});
  }, []);

  const saveCombat = useCallback(async (nextState: CombatState) => {
    const normalized = normalizeCombatState({ ...nextState, updatedAt: new Date().toISOString() });
    setCombatState(normalized);
    safeSetJson(LOCAL_COMBAT_STATE_KEY, normalized);
    await appStore.saveCombatState(normalized).catch(() => {});
  }, []);

  const saveMusic = useCallback(async (nextState: CombatMusicState) => {
    const normalized = normalizeMusicState({ ...nextState, updatedAt: new Date().toISOString() });
    setMusicState(normalized);
    safeSetJson(LOCAL_MUSIC_STATE_KEY, buildLocalMusicCacheState(normalized));
    try {
      await appStore.saveCombatMusicState(normalized);
      return true;
    } catch (error) {
      console.warn("[combat music] shared save failed", error);
      return false;
    }
  }, []);

  const postFeedMessage = useCallback(async (message: Omit<CombatFeedMessage, "id" | "createdAt">) => {
    const nextMessage: CombatFeedMessage = {
      ...message,
      id: uid("combat-msg"),
      createdAt: new Date().toISOString(),
    };
    await saveCombat({
      ...combatState,
      messages: [...combatState.messages, nextMessage].slice(-MAX_FEED_MESSAGES),
    });
  }, [combatState, saveCombat]);

  const canEditPlayer = useCallback((player: PlayerData) => {
    return isDM || player.id === currentUserId || player.name === currentUser;
  }, [currentUser, currentUserId, isDM]);

  const updatePlayer = useCallback(async (playerId: string, patch: Partial<PlayerData>) => {
    const nextPlayers = players.map((player) => (
      player.id === playerId ? { ...player, ...patch } : player
    ));
    await savePlayers(nextPlayers);
  }, [players, savePlayers]);

  const adjustPlayerNumber = (player: PlayerData, key: keyof PlayerData, delta: number, min: number, max: number) => {
    const current = Number(player[key] ?? 0);
    void updatePlayer(player.id, { [key]: clampNumber(current + delta, min, max) } as Partial<PlayerData>);
  };

  const handleSetPlayerNumber = (player: PlayerData, key: keyof PlayerData, raw: string, min: number, max: number) => {
    const current = Number(player[key] ?? min);
    void updatePlayer(player.id, { [key]: clampNumber(parseNumberInput(raw, current), min, max) } as Partial<PlayerData>);
  };

  const handleWoundRoll = async (player: PlayerData) => {
    const result = rollDice(player.woundDice || "1d6");
    if (!result) {
      await postFeedMessage({
        kind: "system",
        playerId: player.id,
        playerName: player.name,
        text: `${player.name}'s wound dice is not set to a rollable format.`,
      });
      return;
    }
    await postFeedMessage({
      kind: "wound",
      playerId: player.id,
      playerName: player.name,
      text: `${player.name} rolled wound dice ${result.formula}: ${result.total}`,
      payload: result as unknown as Record<string, unknown>,
    });
  };

  const toggleFlag = async (player: PlayerData, flag: string) => {
    const existing = combatState.playerStates[player.id] || { flags: [], note: "" };
    const flags = existing.flags.includes(flag)
      ? existing.flags.filter((entry) => entry !== flag)
      : [...existing.flags, flag];
    await saveCombat({
      ...combatState,
      playerStates: {
        ...combatState.playerStates,
        [player.id]: { ...existing, flags },
      },
    });
  };

  const setPlayerNote = async (player: PlayerData, note: string) => {
    const existing = combatState.playerStates[player.id] || { flags: [], note: "" };
    await saveCombat({
      ...combatState,
      playerStates: {
        ...combatState.playerStates,
        [player.id]: { ...existing, note },
      },
    });
  };

  const handleRoll = async (formula = diceFormula) => {
    const result = rollDice(formula);
    if (!result) {
      setDiceFormula("1d20");
      return;
    }
    const actor = currentPlayer || { id: currentUserId || "guest", name: currentUser || "Guest" };
    await postFeedMessage({
      kind: "roll",
      playerId: actor.id,
      playerName: actor.name,
      text: `${actor.name} rolled ${result.formula}: ${result.total}`,
      payload: result as unknown as Record<string, unknown>,
    });
  };

  const handleSendText = async () => {
    const text = feedText.trim();
    if (!text) return;
    const actor = currentPlayer || { id: currentUserId || "guest", name: currentUser || "Guest" };
    setFeedText("");
    await postFeedMessage({
      kind: "message",
      playerId: actor.id,
      playerName: actor.name,
      text,
    });
  };

  const handlePlayerRoll = async (player: PlayerData, formula: string) => {
    const result = rollDice(formula);
    if (!result) return;
    await postFeedMessage({
      kind: "roll",
      playerId: player.id,
      playerName: player.name,
      text: `${player.name} rolled ${result.formula}: ${result.total}`,
      payload: result as unknown as Record<string, unknown>,
    });
  };

  const handleSharePlayerStatus = async (player: PlayerData) => {
    await postFeedMessage({
      kind: "system",
      playerId: player.id,
      playerName: player.name,
      text: `${player.name} status: HP ${player.currentHP || 0}/${player.maxHP || 0} | Wounds ${player.currentWounds || 0}/${player.totalWounds || 0} | Temp HP ${player.tempHP || 0} | DR ${player.damageReduction || 0}`,
    });
  };

  const updateCombatScene = async (patch: Partial<Pick<CombatState, "round" | "scene">>) => {
    if (!isDM) return;
    await saveCombat({ ...combatState, ...patch });
  };

  const saveSceneDraft = async () => {
    if (!isDM) return;
    if (sceneDraft === combatState.scene) {
      setSceneDraftDirty(false);
      return;
    }
    await updateCombatScene({ scene: sceneDraft.trim() });
    setSceneDraftDirty(false);
  };

  const shareOwnerId = isDM ? sharePlayerId : currentPlayer?.id || currentUserId;
  const ownedCards = useMemo(
    () => cards.filter((card) => shareOwnerId && assignedToMatches(card.assignedTo, shareOwnerId)),
    [cards, shareOwnerId],
  );
  const ownedItems = useMemo(
    () => items.filter((item) => shareOwnerId && assignedToMatches(item.assignedTo, shareOwnerId)),
    [items, shareOwnerId],
  );
  const shareResults = useMemo(() => {
    const query = shareQuery.trim().toLowerCase();
    const source = shareKind === "card" ? ownedCards : ownedItems;
    if (!query) return source.slice(0, 8);
    return source
      .filter((entry) => {
        const text = shareKind === "card"
          ? `${(entry as ManagedCard).name} ${(entry as ManagedCard).type} ${(entry as ManagedCard).effect} ${(entry as ManagedCard).tags?.join(" ")}`
          : `${(entry as ManagedItem).name} ${(entry as ManagedItem).type} ${(entry as ManagedItem).rarity} ${(entry as ManagedItem).description} ${(entry as ManagedItem).tags?.join(" ")}`;
        return text.toLowerCase().includes(query);
      })
      .slice(0, 8);
  }, [ownedCards, ownedItems, shareKind, shareQuery]);

  const handleShareEntry = async (entry: ManagedCard | ManagedItem) => {
    const owner = nonDmPlayers.find((player) => player.id === shareOwnerId) || currentPlayer;
    const actorName = isDM && owner ? `DM for ${owner.name}` : currentPlayer?.name || currentUser || "Player";
    const isCard = shareKind === "card";
    await postFeedMessage({
      kind: isCard ? "card" : "item",
      playerId: owner?.id || currentUserId || "guest",
      playerName: actorName,
      text: `${actorName} shared ${isCard ? "card" : "item"}: ${entry.name}`,
      payload: isCard
        ? {
            name: (entry as ManagedCard).name,
            subtitle: [(entry as ManagedCard).type, (entry as ManagedCard).actionCost].filter(Boolean).join(" | "),
            description: (entry as ManagedCard).effect,
          }
        : {
            name: (entry as ManagedItem).name,
            subtitle: [(entry as ManagedItem).rarity, (entry as ManagedItem).type].filter(Boolean).join(" | "),
            description: (entry as ManagedItem).description,
          },
    });
  };

  const clearFeed = async () => {
    if (!isDM) return;
    await saveCombat({ ...combatState, messages: [] });
  };

  const activeById = useMemo(() => new Map(musicState.active.map((entry) => [entry.trackId, entry])), [musicState.active]);
  const feedStats = useMemo(() => {
    const lastMessage = combatState.messages[combatState.messages.length - 1];
    return {
      total: combatState.messages.length,
      rolls: combatState.messages.filter((message) => message.kind === "roll" || message.kind === "wound").length,
      shares: combatState.messages.filter((message) => message.kind === "card" || message.kind === "item").length,
      last: lastMessage?.createdAt || "",
    };
  }, [combatState.messages]);
  const activeTracks = useMemo(() => (
    musicState.active
      .map((active) => {
        const track = musicState.tracks.find((entry) => entry.id === active.trackId);
        return track ? { active, track } : null;
      })
      .filter((entry): entry is { active: ActiveMusicTrack; track: MusicTrack } => Boolean(entry))
  ), [musicState.active, musicState.tracks]);
  const musicTags = useMemo(() => (
    Array.from(new Set(musicState.tracks.flatMap((track) => track.tags || [])))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 18)
  ), [musicState.tracks]);
  const visibleTracks = useMemo(() => {
    const query = musicSearch.trim().toLowerCase();
    const filtered = query
      ? musicState.tracks.filter((track) => {
          const haystack = [
            track.title,
            sourceLabel(track),
            track.fileName || "",
            track.notes || "",
            ...(track.tags || []),
          ].join(" ").toLowerCase();
          return haystack.includes(query);
        })
      : musicState.tracks;

    return [...filtered].sort((a, b) => {
      if (musicSort === "title") return a.title.localeCompare(b.title);
      if (musicSort === "source") return sourceLabel(a).localeCompare(sourceLabel(b)) || a.title.localeCompare(b.title);
      if (musicSort === "tag") return (a.tags?.[0] || "").localeCompare(b.tags?.[0] || "") || a.title.localeCompare(b.title);
      return (Date.parse(b.updatedAt || b.createdAt || "") || 0) - (Date.parse(a.updatedAt || a.createdAt || "") || 0);
    });
  }, [musicSearch, musicSort, musicState.tracks]);
  const editableVisibleTracks = useMemo(
    () => visibleTracks.filter((track) => track.sourceType !== "youtube"),
    [visibleTracks],
  );
  const youtubeVisibleTracks = useMemo(
    () => visibleTracks.filter((track) => track.sourceType === "youtube"),
    [visibleTracks],
  );
  const tableHealth = useMemo(() => {
    const hpCurrent = nonDmPlayers.reduce((sum, player) => sum + (player.currentHP || 0), 0);
    const hpMax = nonDmPlayers.reduce((sum, player) => sum + (player.maxHP || 0), 0);
    const wounds = nonDmPlayers.reduce((sum, player) => sum + (player.currentWounds || 0), 0);
    return { hpCurrent, hpMax, wounds };
  }, [nonDmPlayers]);

  const updateMusicTrack = async (trackId: string, patch: Partial<MusicTrack>) => {
    if (!isDM) return;
    await saveMusic({
      ...musicState,
      tracks: musicState.tracks.map((track) => (
        track.id === trackId
          ? { ...track, ...patch, updatedAt: new Date().toISOString() }
          : track
      )),
    });
  };

  const exportMusicLibrary = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      tracks: musicState.tracks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `combat-music-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMusicStatus("Music library exported.");
  };

  const importMusicLibrary = async (file: File | null | undefined) => {
    if (!isDM || !file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { tracks?: MusicTrack[] } | MusicTrack[];
      const rawTracks = Array.isArray(parsed) ? parsed : parsed.tracks;
      if (!Array.isArray(rawTracks)) {
        setMusicStatus("That file does not look like a music library export.");
        return;
      }
      const normalizedImport = normalizeMusicState({ ...DEFAULT_MUSIC_STATE, tracks: rawTracks }).tracks;
      const existingIds = new Set(musicState.tracks.map((track) => track.id));
      const importedTracks = normalizedImport.map((track) => {
        const duplicateId = existingIds.has(track.id);
        if (!duplicateId) {
          existingIds.add(track.id);
          return track;
        }
        const nextTrack = { ...track, id: uid("track"), updatedAt: new Date().toISOString() };
        existingIds.add(nextTrack.id);
        return nextTrack;
      });
      await saveMusic({ ...musicState, tracks: [...musicState.tracks, ...importedTracks] });
      setMusicStatus(`${importedTracks.length} track${importedTracks.length === 1 ? "" : "s"} imported.`);
    } catch (error) {
      setMusicStatus(error instanceof Error ? error.message : "Failed to import music library.");
    }
  };

  const addUrlTrack = async () => {
    const url = musicUrl.trim();
    if (!url) return;
    const title = musicTitle.trim() || trackLabelFromUrl(url);
    const nextTrack: MusicTrack = {
      id: uid("track"),
      title,
      sourceType: inferTrackSource(url),
      url,
      addedBy: currentUser || "DM",
      createdAt: new Date().toISOString(),
      tags: [],
      notes: "",
    };
    setMusicUrl("");
    setMusicTitle("");
    setMusicStatus(`${title} added.`);
    await saveMusic({ ...musicState, tracks: [...musicState.tracks, nextTrack] });
  };

  const addFileTrack = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setMusicStatus("Choose an audio file.");
      return;
    }
    if (file.size > MAX_AUDIO_FILE_BYTES) {
      setMusicStatus("That file is too large for the current shared-data upload path. Use a direct link for now.");
      return;
    }
    try {
      setMusicStatus(`Reading ${file.name}...`);
      const url = await fileToDataUrl(file);
      const cleanName = file.name.replace(/\.[^.]+$/, "") || "Uploaded Track";
      const nextTrack: MusicTrack = {
        id: uid("track"),
        title: cleanName,
        sourceType: "file",
        url,
        fileName: file.name,
        contentType: file.type || "audio/*",
        sizeBytes: file.size,
        addedBy: currentUser || "DM",
        createdAt: new Date().toISOString(),
        tags: [],
        notes: "",
      };
      setMusicStatus(`Saving ${cleanName}...`);
      const sharedSaved = await saveMusic({ ...musicState, tracks: [...musicState.tracks, nextTrack] });
      setMusicStatus(
        sharedSaved
          ? `${cleanName} uploaded. Browser fallback saved metadata only to avoid storage quota errors.`
          : `${cleanName} is available in this browser for now, but the shared save failed. Try a smaller file or a direct audio URL.`,
      );
    } catch (error) {
      setMusicStatus(error instanceof Error ? error.message : "Failed to read audio file.");
    }
  };

  const upsertActiveTrack = async (trackId: string, patch: Partial<ActiveMusicTrack>) => {
    const existing = activeById.get(trackId);
    const nextActive = existing
      ? musicState.active.map((entry) => entry.trackId === trackId ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry)
      : [
          ...musicState.active,
          {
            trackId,
            playing: true,
            volume: 0.65,
            loop: false,
            muted: false,
            effects: DEFAULT_AUDIO_EFFECTS,
            startedAt: Date.now(),
            updatedAt: new Date().toISOString(),
            ...patch,
          },
        ];
    await saveMusic({ ...musicState, active: nextActive });
  };

  const updateTrackEffects = async (trackId: string, patch: Partial<AudioEffectSettings>) => {
    const existing = activeById.get(trackId);
    await upsertActiveTrack(trackId, {
      playing: existing?.playing ?? false,
      effects: {
        ...normalizeAudioEffects(existing?.effects),
        ...patch,
      },
    });
  };

  const stopTrack = async (trackId: string) => {
    await saveMusic({ ...musicState, active: musicState.active.filter((entry) => entry.trackId !== trackId) });
  };

  const deleteTrack = async (trackId: string) => {
    if (!isDM) return;
    await saveMusic({
      ...musicState,
      tracks: musicState.tracks.filter((track) => track.id !== trackId),
      active: musicState.active.filter((entry) => entry.trackId !== trackId),
    });
  };

  const renderMusicTrackCard = (track: MusicTrack) => {
    const active = activeById.get(track.id);
    const effects = normalizeAudioEffects(active?.effects);
    const isEditableAudio = track.sourceType !== "youtube";
    const playable = hasPlayableSource(track);
    const borderColor = active?.muted ? "#FF6A6A" : active?.playing ? "#4AFF7A" : "#2A355F";

    return (
      <div key={track.id} className={`${retro.raised} p-4`} style={{ background: "#0D1230", borderLeft: `4px solid ${borderColor}` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] truncate" style={{ color: "#D8E5FF", fontWeight: 700 }}>{track.title}</div>
            <div className="text-[10px] mt-1" style={isEditableAudio ? S_GREEN : S_DIM}>
              {isEditableAudio ? "Editable audio" : "YouTube link"} | {sourceLabel(track)}
            </div>
          </div>
          {isDM && (
            <div className="flex items-center gap-1">
              <button disabled={!playable} onClick={() => setPreviewTrackId(previewTrackId === track.id ? "" : track.id)} className={`${retro.button} p-2 disabled:opacity-40`} style={previewTrackId === track.id ? S_WARN : S_MUTED} title="Preview track">
                <FileText size={13} />
              </button>
              <button onClick={() => void deleteTrack(track.id)} className={`${retro.button} p-2`} style={S_RED} title="Delete track">
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>

        {(track.tags?.length || track.notes) && (
          <div className="mt-2 space-y-1">
            {track.tags?.length ? (
              <div className="flex flex-wrap gap-1">
                {track.tags.map((tag) => (
                  <span key={tag} className="text-[9px] px-1.5 py-0.5" style={{ color: "#8AB4FF", border: "1px solid #263A67", background: "#071029" }}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {track.notes && <div className="text-[10px] leading-relaxed" style={S_MUTED}>{track.notes}</div>}
          </div>
        )}

        {!playable && (
          <div className="mt-2 text-[10px] leading-relaxed" style={S_WARN}>
            Audio data is not available in this browser fallback. Reconnect to shared storage or re-upload the file.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {isDM ? (
            <div style={DISPLAY_CONTENTS}>
              <button
                disabled={!playable}
                onClick={() => void upsertActiveTrack(track.id, {
                  playing: !active?.playing,
                  startedAt: !active?.playing ? Date.now() : active?.startedAt || Date.now(),
                })}
                className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1 disabled:opacity-40`}
                style={active?.playing ? S_WARN : S_GREEN}
              >
                {active?.playing ? <Pause size={12} /> : <Play size={12} />}
                {active?.playing ? "Pause" : "Play"}
              </button>
              <button onClick={() => void stopTrack(track.id)} disabled={!active} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1 disabled:opacity-40`} style={S_RED}>
                <Square size={11} /> Stop
              </button>
              <button
                onClick={() => void upsertActiveTrack(track.id, { loop: !active?.loop, playing: active?.playing ?? true })}
                className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1`}
                style={active?.loop ? S_ACCENT : S_MUTED}
              >
                <RotateCcw size={11} /> Loop
              </button>
              <button
                onClick={() => void upsertActiveTrack(track.id, { muted: !active?.muted, playing: active?.playing ?? true })}
                disabled={!active}
                className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1 disabled:opacity-40`}
                style={active?.muted ? S_RED : S_MUTED}
              >
                {active?.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                {active?.muted ? "Muted" : "Mute"}
              </button>
            </div>
          ) : (
            <div className="text-[11px]" style={active?.muted ? S_RED : active?.playing ? S_GREEN : S_DIM}>
              {active?.muted ? "Muted" : active?.playing ? "Playing" : active ? "Paused" : "Inactive"}{active?.loop ? " | Loop" : ""}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          {active?.muted ? <VolumeX size={12} style={S_RED} /> : <Volume2 size={12} style={S_DIM} />}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((active?.volume ?? 0.65) * 100)}
            disabled={!isDM}
            onChange={(event) => void upsertActiveTrack(track.id, { volume: parseInt(event.target.value, 10) / 100, playing: active?.playing ?? true })}
            className="flex-1"
          />
          <span className="text-[10px] w-9 text-right" style={S_DIM}>{Math.round((active?.volume ?? 0.65) * 100)}%</span>
        </div>

        {isDM && isEditableAudio && (
          <AudioEffectsControls
            effects={effects}
            onChange={(patch) => void updateTrackEffects(track.id, patch)}
            onReset={() => void updateTrackEffects(track.id, DEFAULT_AUDIO_EFFECTS)}
          />
        )}

        {!isEditableAudio && (
          <div className="mt-3 text-[10px]" style={S_DIM}>
            YouTube playback stays separate from editable audio effects.
          </div>
        )}

        {isDM && (
          <div className="mt-3 grid grid-cols-1 gap-2">
            <input
              defaultValue={track.title}
              onBlur={(event) => {
                const title = event.target.value.trim();
                if (title && title !== track.title) void updateMusicTrack(track.id, { title });
              }}
              className={`${retro.sunken} bg-[#05071C] px-2 py-1.5 text-[11px] outline-none`}
              style={S_TEXT}
            />
            <input
              defaultValue={(track.tags || []).join(", ")}
              onBlur={(event) => void updateMusicTrack(track.id, { tags: parseTrackTags(event.target.value) })}
              placeholder="Tags: combat, boss, ambience"
              className={`${retro.sunken} bg-[#05071C] px-2 py-1.5 text-[11px] outline-none`}
              style={S_TEXT}
            />
            <textarea
              defaultValue={track.notes || ""}
              onBlur={(event) => void updateMusicTrack(track.id, { notes: event.target.value.trim() })}
              placeholder="DM notes..."
              rows={2}
              className={`${retro.sunken} bg-[#05071C] px-2 py-1.5 text-[11px] outline-none resize-none`}
              style={S_TEXT}
            />
          </div>
        )}

        {previewTrackId === track.id && (
          <TrackPreview track={track} />
        )}
      </div>
    );
  };

  if (!currentUser) return <Navigate to="/" />;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(180deg, #07091F 0%, #090B2A 42%, #050616 100%)",
        fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
      }}
    >
      <AudioPlaybackLayer musicState={musicState} audioEnabled={audioEnabled} />

      <div className={`${retro.toolbar} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/interface")} className="flex items-center gap-1 hover:opacity-80" style={S_ACCENT}>
            <ArrowLeft size={13} /> Back
          </button>
          <span className="text-[11px]" style={S_DIM}>|</span>
          <span className="text-[11px] flex items-center gap-1" style={S_ACCENT}>
            <Swords size={12} /> Combat
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={S_MUTED}>
          {isDM ? <Shield size={12} /> : <Lock size={12} />}
          {isDM ? "DM controls enabled" : "Player controls limited to your profile"}
        </div>
      </div>

      <div className="flex-1 flex flex-col p-4 max-w-[1800px] mx-auto w-full min-h-0">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Swords size={30} style={S_ACCENT} />
              <h1 className="text-[34px] tracking-tight" style={{ color: "#D8E5FF", fontWeight: 700 }}>
                Combat
              </h1>
            </div>
            <div className="text-[12px]" style={S_MUTED}>
              Health, wound rolls, shared actions, and table music in one place.
            </div>
          </div>

          <div className="flex gap-0" style={{ borderBottom: "2px solid #1A1A4B" }}>
            <button
              onClick={() => setActiveTab("players")}
              className="px-5 py-2 text-[12px] flex items-center gap-2"
              style={{
                color: activeTab === "players" ? "#CFE0FF" : "#627193",
                background: activeTab === "players" ? "#12163A" : "transparent",
                borderTop: activeTab === "players" ? "2px solid #6AA8FF" : "2px solid transparent",
                borderLeft: activeTab === "players" ? "1px solid #1A2A4B" : "1px solid transparent",
                borderRight: activeTab === "players" ? "1px solid #1A2A4B" : "1px solid transparent",
                marginBottom: "-2px",
              }}
            >
              <Swords size={13} /> Players
            </button>
            <button
              onClick={() => setActiveTab("music")}
              className="px-5 py-2 text-[12px] flex items-center gap-2"
              style={{
                color: activeTab === "music" ? "#FFDFA8" : "#627193",
                background: activeTab === "music" ? "#12163A" : "transparent",
                borderTop: activeTab === "music" ? "2px solid #FFD37A" : "2px solid transparent",
                borderLeft: activeTab === "music" ? "1px solid #1A2A4B" : "1px solid transparent",
                borderRight: activeTab === "music" ? "1px solid #1A2A4B" : "1px solid transparent",
                marginBottom: "-2px",
              }}
            >
              <Music size={13} /> Music
            </button>
          </div>
        </div>

        {activeTab === "players" ? (
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            <div className={`${retro.sunken} bg-[#080A24] p-3`}>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-center">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <CombatStat label="Round" value={String(combatState.round || 1)} color="#FFD37A" />
                  <CombatStat label="Party HP" value={`${tableHealth.hpCurrent}/${tableHealth.hpMax || 0}`} color={hpColor(tableHealth.hpCurrent, tableHealth.hpMax || 1)} />
                  <CombatStat label="Wounds" value={String(tableHealth.wounds)} color={tableHealth.wounds > 0 ? "#FFAA4A" : "#4AFF7A"} />
                  <CombatStat label="Actions" value={String(feedStats.total)} color="#8AB4FF" />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {isDM && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => void updateCombatScene({ round: Math.max(1, (combatState.round || 1) - 1) })} className={`${retro.button} px-2 py-1 text-[11px]`} style={S_MUTED}>
                        -
                      </button>
                      <button onClick={() => void updateCombatScene({ round: (combatState.round || 1) + 1 })} className={`${retro.button} px-2 py-1 text-[11px]`} style={S_WARN}>
                        +
                      </button>
                      <button onClick={() => void updateCombatScene({ round: 1 })} className={`${retro.button} px-2 py-1 text-[11px]`} style={S_DIM}>
                        Reset
                      </button>
                    </div>
                  )}
                  <input
                    value={isDM ? sceneDraft : combatState.scene}
                    disabled={!isDM}
                    onChange={(event) => {
                      setSceneDraft(event.target.value);
                      setSceneDraftDirty(true);
                    }}
                    onBlur={() => void saveSceneDraft()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="Scene or encounter name"
                    className={`${retro.sunken} bg-[#05071C] px-3 py-2 text-[12px] outline-none w-full sm:w-[300px] disabled:opacity-70`}
                    style={S_TEXT}
                  />
                </div>
              </div>
            </div>

            <div className={`${retro.sunken} bg-[#080A24] p-4 overflow-x-auto`} style={{ minHeight: 310 }}>
              <div className="flex items-stretch gap-4 min-w-max py-2">
                {nonDmPlayers.map((player) => (
                  <PlayerCombatCard
                    key={player.id}
                    player={player}
                    quickState={combatState.playerStates[player.id] || { flags: [], note: "" }}
                    canEdit={canEditPlayer(player)}
                    onAdjust={adjustPlayerNumber}
                    onSetNumber={handleSetPlayerNumber}
                    onRollWound={() => void handleWoundRoll(player)}
                    onRollD20={() => void handlePlayerRoll(player, "1d20")}
                    onShareStatus={() => void handleSharePlayerStatus(player)}
                    onPatch={(patch) => void updatePlayer(player.id, patch)}
                    onToggleFlag={(flag) => void toggleFlag(player, flag)}
                    onSetNote={(note) => void setPlayerNote(player, note)}
                  />
                ))}
                {nonDmPlayers.length === 0 && (
                  <div className="text-[12px] p-6" style={S_DIM}>
                    No player profiles found yet.
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4 min-h-0 flex-1">
              <div className={`${retro.sunken} bg-[#080A24] p-4 min-h-[260px] flex flex-col`}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={15} style={S_ACCENT} />
                    <span className="text-[12px]" style={{ color: "#AFC6FF", fontWeight: 700 }}>Combat Feed</span>
                    <span className="text-[10px]" style={S_DIM}>
                      {feedStats.rolls} rolls | {feedStats.shares} shares{feedStats.last ? ` | last ${formatTime(feedStats.last)}` : ""}
                    </span>
                  </div>
                  {isDM && (
                    <button onClick={() => void clearFeed()} className={`${retro.button} px-3 py-1 text-[10px] flex items-center gap-1`} style={S_RED}>
                      <Eraser size={11} /> Clear
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                  {combatState.messages.length === 0 ? (
                    <div className="h-full min-h-[120px] flex items-center justify-center text-[12px]" style={S_DIM}>
                      No combat actions yet.
                    </div>
                  ) : (
                    combatState.messages.map((message) => (
                      <FeedMessage key={message.id} message={message} />
                    ))
                  )}
                  <div ref={feedEndRef} />
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2">
                  <input
                    value={feedText}
                    onChange={(event) => setFeedText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleSendText();
                    }}
                    placeholder="Send a short combat note..."
                    className={`${retro.sunken} bg-[#05071C] px-3 py-2 text-[12px] outline-none`}
                    style={S_TEXT}
                  />
                  <button onClick={() => void handleSendText()} className={`${retro.button} px-4 py-2 text-[12px] flex items-center justify-center gap-2`} style={S_ACCENT}>
                    <Send size={13} /> Send
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className={`${retro.sunken} bg-[#080A24] p-4`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Dice6 size={15} style={S_WARN} />
                    <span className="text-[12px]" style={{ color: "#FFD37A", fontWeight: 700 }}>Quick Roll</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={diceFormula}
                      onChange={(event) => setDiceFormula(event.target.value)}
                      placeholder="1d20"
                      className={`${retro.sunken} bg-[#05071C] px-3 py-2 text-[12px] outline-none flex-1`}
                      style={S_TEXT}
                    />
                    <button onClick={() => void handleRoll()} className={`${retro.button} px-3 py-2 text-[12px]`} style={S_WARN}>
                      Roll
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {["1d20", "1d12", "1d10", "1d8", "1d6", "1d4"].map((formula) => (
                      <button key={formula} onClick={() => void handleRoll(formula)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_MUTED}>
                        {formula}
                      </button>
                    ))}
                    {currentPlayer?.woundDice && (
                      <button onClick={() => void handleWoundRoll(currentPlayer)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_WARN}>
                        Wound {currentPlayer.woundDice}
                      </button>
                    )}
                  </div>
                </div>

                <div className={`${retro.sunken} bg-[#080A24] p-4`}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      {shareKind === "card" ? <CreditCard size={15} style={S_ACCENT} /> : <Package size={15} style={S_ACCENT} />}
                      <span className="text-[12px]" style={{ color: "#AFC6FF", fontWeight: 700 }}>Share Card or Item</span>
                    </div>
                    <div className="text-[9px]" style={S_DIM}>
                      {ownedCards.length} cards | {ownedItems.length} items
                    </div>
                  </div>

                  <div className="flex gap-2 mb-2">
                    <button onClick={() => setShareKind("card")} className={`${shareKind === "card" ? retro.sunken : retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1`} style={shareKind === "card" ? S_ACCENT : S_MUTED}>
                      <CreditCard size={11} /> Cards
                    </button>
                    <button onClick={() => setShareKind("item")} className={`${shareKind === "item" ? retro.sunken : retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1`} style={shareKind === "item" ? S_ACCENT : S_MUTED}>
                      <Package size={11} /> Items
                    </button>
                  </div>

                  {isDM && (
                    <select
                      value={sharePlayerId}
                      onChange={(event) => setSharePlayerId(event.target.value)}
                      className={`${retro.sunken} bg-[#05071C] px-2 py-2 text-[11px] outline-none w-full mb-2`}
                      style={S_TEXT}
                    >
                      {nonDmPlayers.map((player) => (
                        <option key={player.id} value={player.id}>{player.name}</option>
                      ))}
                    </select>
                  )}

                  <div className="relative mb-2">
                    <Search size={12} className="absolute left-2 top-2.5" style={S_DIM} />
                    <input
                      value={shareQuery}
                      onChange={(event) => setShareQuery(event.target.value)}
                      placeholder={`Search ${shareKind === "card" ? "cards" : "items"}...`}
                      className={`${retro.sunken} bg-[#05071C] pl-8 pr-3 py-2 text-[12px] outline-none w-full`}
                      style={S_TEXT}
                    />
                  </div>

                  <div className="max-h-[180px] overflow-y-auto space-y-1">
                    {shareResults.length === 0 ? (
                      <div className="text-[11px] py-3 text-center" style={S_DIM}>
                        No matching {shareKind}s.
                      </div>
                    ) : shareResults.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => void handleShareEntry(entry as ManagedCard | ManagedItem)}
                        className="w-full text-left px-2 py-2 hover:bg-[#11183A] transition-colors"
                        style={{ border: "1px solid #111B3A", background: "#070B22" }}
                      >
                        <div className="text-[11px]" style={S_TEXT}>{entry.name}</div>
                        <div className="text-[9px] truncate" style={S_DIM}>
                          {shareKind === "card"
                            ? `${(entry as ManagedCard).type || "Card"} | ${(entry as ManagedCard).actionCost || "No action cost"}`
                            : `${(entry as ManagedItem).rarity || "Item"} | ${(entry as ManagedItem).type || "No type"}`}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
            <div className={`${retro.sunken} bg-[#080A24] p-4 overflow-y-auto`}>
              <div className="flex items-center gap-2 mb-3">
                <Music size={16} style={{ color: "#FFD37A" }} />
                <span className="text-[13px]" style={{ color: "#FFD37A", fontWeight: 700 }}>Music Library</span>
              </div>

              {isDM ? (
                <div className="space-y-4">
                  <div className={`${retro.raised} p-3`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-[10px]" style={S_MUTED}>Master Mix</div>
                      <button
                        onClick={() => void saveMusic({ ...musicState, muted: !musicState.muted })}
                        className={`${retro.button} px-2 py-1 text-[10px]`}
                        style={musicState.muted ? S_RED : S_GREEN}
                      >
                        {musicState.muted ? "Muted" : "Live"}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Volume2 size={12} style={S_DIM} />
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round((musicState.masterVolume ?? 0.85) * 100)}
                        onChange={(event) => void saveMusic({ ...musicState, masterVolume: parseInt(event.target.value, 10) / 100, muted: false })}
                        className="flex-1"
                      />
                      <span className="text-[10px] w-9 text-right" style={S_DIM}>{Math.round((musicState.masterVolume ?? 0.85) * 100)}%</span>
                    </div>
                  </div>

                  <div className={`${retro.raised} p-3`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                    <div className="text-[10px] mb-2" style={S_MUTED}>Add URL Track</div>
                    <input
                      value={musicTitle}
                      onChange={(event) => setMusicTitle(event.target.value)}
                      placeholder="Track title"
                      className={`${retro.sunken} bg-[#05071C] px-3 py-2 text-[12px] outline-none w-full mb-2`}
                      style={S_TEXT}
                    />
                    <input
                      value={musicUrl}
                      onChange={(event) => setMusicUrl(event.target.value)}
                      placeholder="YouTube or direct audio URL"
                      className={`${retro.sunken} bg-[#05071C] px-3 py-2 text-[12px] outline-none w-full mb-2`}
                      style={S_TEXT}
                    />
                    <button onClick={() => void addUrlTrack()} className={`${retro.button} px-3 py-2 text-[12px] flex items-center gap-2`} style={S_ACCENT}>
                      <LinkIcon size={13} /> Add Link
                    </button>
                  </div>

                  <div className={`${retro.raised} p-3`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                    <div className="text-[10px] mb-2" style={S_MUTED}>Upload Audio File</div>
                    <label className={`${retro.button} px-3 py-2 text-[12px] inline-flex items-center gap-2 cursor-pointer`} style={S_WARN}>
                      <Upload size={13} /> Choose Audio
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(event) => {
                          void addFileTrack(event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <div className="text-[9px] mt-2 leading-relaxed" style={S_DIM}>
                      Small audio files can be saved here. Large MP3 libraries should move to real file storage before heavy use.
                    </div>
                  </div>

                  <div className={`${retro.raised} p-3`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                    <div className="text-[10px] mb-2" style={S_MUTED}>Library Tools</div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={exportMusicLibrary} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-2`} style={S_ACCENT}>
                        <Download size={12} /> Export
                      </button>
                      <label className={`${retro.button} px-3 py-2 text-[11px] inline-flex items-center gap-2 cursor-pointer`} style={S_WARN}>
                        <Upload size={12} /> Import
                        <input
                          type="file"
                          accept="application/json,.json"
                          className="hidden"
                          onChange={(event) => {
                            void importMusicLibrary(event.target.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {musicStatus && (
                    <div className="text-[11px]" style={S_MUTED}>{musicStatus}</div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-[12px] leading-relaxed" style={S_MUTED}>
                    Music controls are read-only for players. Use Enable Combat Audio to hear tracks started by the DM.
                  </div>
                  <div className={`${retro.raised} p-3`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                    <div className="text-[10px] mb-2" style={S_MUTED}>Current Mix</div>
                    <div className="flex items-center justify-between text-[12px]" style={musicState.muted ? S_RED : S_GREEN}>
                      <span>{musicState.muted ? "Muted" : "Live"}</span>
                      <span>{Math.round((musicState.masterVolume ?? 0.85) * 100)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className={`${retro.sunken} bg-[#080A24] p-4 overflow-y-auto`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-[13px]" style={{ color: "#CFE0FF", fontWeight: 700 }}>Tracks</div>
                  <div className="text-[10px]" style={S_DIM}>
                    {activeTracks.filter(({ active }) => active.playing).length} playing | {visibleTracks.length}/{musicState.tracks.length} shown | master {musicState.muted ? "muted" : `${Math.round((musicState.masterVolume ?? 0.85) * 100)}%`}
                  </div>
                </div>
                <button onClick={() => setAudioEnabled(true)} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-2`} style={audioEnabled ? S_GREEN : S_WARN}>
                  <Volume2 size={13} /> {audioEnabled ? "Audio Enabled" : "Enable Audio"}
                </button>
              </div>

              <div className={`${retro.raised} p-3 mb-4`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-2 top-2.5" style={S_DIM} />
                    <input
                      value={musicSearch}
                      onChange={(event) => setMusicSearch(event.target.value)}
                      placeholder="Search title, tag, source, or note..."
                      className={`${retro.sunken} bg-[#05071C] pl-8 pr-3 py-2 text-[12px] outline-none w-full`}
                      style={S_TEXT}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal size={12} style={S_DIM} />
                    <select
                      value={musicSort}
                      onChange={(event) => setMusicSort(event.target.value as MusicSort)}
                      className={`${retro.sunken} bg-[#05071C] px-2 py-2 text-[11px] outline-none w-full`}
                      style={S_TEXT}
                    >
                      <option value="recent">Recent</option>
                      <option value="title">Title</option>
                      <option value="source">Source</option>
                      <option value="tag">Tag</option>
                    </select>
                  </div>
                </div>
                {musicTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {musicTags.map((tag) => (
                      <button key={tag} onClick={() => setMusicSearch(tag)} className={`${retro.button} px-2 py-1 text-[9px] flex items-center gap-1`} style={S_MUTED}>
                        <Tag size={10} /> {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {activeTracks.length > 0 && (
                <div className={`${retro.raised} p-3 mb-4`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                  <div className="text-[10px] mb-2" style={S_DIM}>Live Stack</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {activeTracks.map(({ active, track }) => (
                      <div key={track.id} className="flex items-center justify-between gap-2 px-2 py-1.5" style={{ background: "#070B22", border: "1px solid #172044" }}>
                        <span className="text-[11px] truncate" style={active.muted ? S_DIM : active.playing ? S_TEXT : S_DIM}>{track.title}</span>
                        <span className="text-[10px] shrink-0" style={active.muted ? S_RED : active.playing ? S_GREEN : S_WARN}>
                          {active.muted ? "Muted" : active.playing ? "Playing" : "Paused"} | {active.loop ? "Loop" : "Once"} | {Math.round(active.volume * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {musicState.tracks.length === 0 ? (
                <div className="text-[12px] p-6" style={S_DIM}>No tracks saved yet.</div>
              ) : visibleTracks.length === 0 ? (
                <div className="text-[12px] p-6" style={S_DIM}>No tracks match that search.</div>
              ) : (
                <div className="space-y-5">
                  <MusicTrackGroup
                    title="Editable Audio"
                    detail={`${editableVisibleTracks.length} uploaded/direct audio track${editableVisibleTracks.length === 1 ? "" : "s"}`}
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {editableVisibleTracks.length === 0 ? (
                        <div className="text-[12px] p-5" style={S_DIM}>No editable audio tracks match.</div>
                      ) : editableVisibleTracks.map(renderMusicTrackCard)}
                    </div>
                  </MusicTrackGroup>

                  <MusicTrackGroup
                    title="YouTube Links"
                    detail={`${youtubeVisibleTracks.length} embed playback link${youtubeVisibleTracks.length === 1 ? "" : "s"}`}
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {youtubeVisibleTracks.length === 0 ? (
                        <div className="text-[12px] p-5" style={S_DIM}>No YouTube links match.</div>
                      ) : youtubeVisibleTracks.map(renderMusicTrackCard)}
                    </div>
                  </MusicTrackGroup>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!audioEnabled && musicState.active.some((entry) => entry.playing) && (
        <button
          onClick={() => setAudioEnabled(true)}
          className={`${retro.button} fixed right-4 bottom-4 z-50 px-4 py-3 text-[12px] flex items-center gap-2`}
          style={{ color: "#FFD37A", background: "#12163A", border: "1px solid #4A3A1A" }}
        >
          <Volume2 size={15} /> Enable Combat Audio
        </button>
      )}
    </div>
  );
}

function CombatStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="px-3 py-2" style={{ background: "#05071C", border: "1px solid #172044" }}>
      <div className="text-[9px]" style={S_DIM}>{label}</div>
      <div className="text-[14px] truncate" style={{ color, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function PlayerCombatCard({
  player,
  quickState,
  canEdit,
  onAdjust,
  onSetNumber,
  onRollWound,
  onRollD20,
  onShareStatus,
  onPatch,
  onToggleFlag,
  onSetNote,
}: {
  player: PlayerData;
  quickState: CombatPlayerQuickState;
  canEdit: boolean;
  onAdjust: (player: PlayerData, key: keyof PlayerData, delta: number, min: number, max: number) => void;
  onSetNumber: (player: PlayerData, key: keyof PlayerData, raw: string, min: number, max: number) => void;
  onRollWound: () => void;
  onRollD20: () => void;
  onShareStatus: () => void;
  onPatch: (patch: Partial<PlayerData>) => void;
  onToggleFlag: (flag: string) => void;
  onSetNote: (note: string) => void;
}) {
  const hpMax = Math.max(1, player.maxHP || 1);
  const woundMax = Math.max(1, player.totalWounds || 1);
  const hpPct = percentValue(player.currentHP || 0, hpMax);
  const woundPct = percentValue(player.currentWounds || 0, woundMax);
  const inspiration = player.inspirationPoints || 0;
  const insanity = player.insanityPoints || 0;

  return (
    <div className={`${retro.raised} shrink-0 w-[350px] p-4`} style={{ background: "#0E1232", borderLeft: `4px solid ${hpColor(player.currentHP || 0, hpMax)}` }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-[15px] truncate" style={{ color: "#D8E5FF", fontWeight: 700 }}>{player.name}</div>
          <div className="text-[10px] truncate" style={S_DIM}>
            {player.class || "Operative"} | Level {player.level || 1}
          </div>
        </div>
        <div className="text-[9px] px-2 py-1" style={{ color: canEdit ? "#4AFF7A" : "#8FA3C8", border: `1px solid ${canEdit ? "#295A32" : "#2A355F"}`, background: "#080B24" }}>
          {canEdit ? "Editable" : "Read-only"}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <MiniStat label="AC" value={String(player.armorClass || 0)} />
        <MiniStat label="Speed" value={player.speed || "0"} />
        <MiniStat label="Wound Die" value={player.woundDice || "-"} />
      </div>

      <ResourceRow
        icon={<HeartPulse size={14} />}
        label="HP"
        color={hpColor(player.currentHP || 0, hpMax)}
        value={player.currentHP || 0}
        max={hpMax}
        percent={hpPct}
        disabled={!canEdit}
        onAdjust={(delta) => onAdjust(player, "currentHP", delta, 0, hpMax)}
        onSet={(raw) => onSetNumber(player, "currentHP", raw, 0, hpMax)}
      />

      <ResourceRow
        icon={<Droplets size={14} />}
        label="Wounds"
        color={player.currentWounds > 0 ? "#FFAA4A" : "#4AFF7A"}
        value={player.currentWounds || 0}
        max={woundMax}
        percent={woundPct}
        disabled={!canEdit}
        onAdjust={(delta) => onAdjust(player, "currentWounds", delta, 0, woundMax)}
        onSet={(raw) => onSetNumber(player, "currentWounds", raw, 0, woundMax)}
      />

      <div className="grid grid-cols-3 gap-2 mt-3">
        <SmallNumberField label="Temp HP" value={player.tempHP || 0} disabled={!canEdit} onDec={() => onAdjust(player, "tempHP", -1, 0, 999)} onInc={() => onAdjust(player, "tempHP", 1, 0, 999)} />
        <SmallNumberField label="DR" value={player.damageReduction || 0} disabled={!canEdit} onDec={() => onAdjust(player, "damageReduction", -1, 0, 999)} onInc={() => onAdjust(player, "damageReduction", 1, 0, 999)} />
        <SmallNumberField label="Exhaust" value={player.exhaustion || 0} disabled={!canEdit} onDec={() => onAdjust(player, "exhaustion", -1, 0, player.maxExhaustion || 6)} onInc={() => onAdjust(player, "exhaustion", 1, 0, player.maxExhaustion || 6)} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-2">
        <SmallNumberField label="Insp" value={inspiration} disabled={!canEdit} onDec={() => onPatch({ inspirationPoints: Math.max(0, inspiration - 1) })} onInc={() => onPatch({ inspirationPoints: inspiration + 1 })} />
        <SmallNumberField label="Insanity" value={insanity} disabled={!canEdit} onDec={() => onPatch({ insanityPoints: Math.max(0, insanity - 1) })} onInc={() => onPatch({ insanityPoints: insanity + 1 })} />
        <button
          disabled={!canEdit}
          onClick={() => onPatch({ foresight: !player.foresight })}
          className={`${player.foresight ? retro.sunken : retro.button} text-[10px] disabled:opacity-40`}
          style={player.foresight ? S_GREEN : S_MUTED}
        >
          Foresight<br />{player.foresight ? "On" : "Off"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button disabled={!canEdit} onClick={onRollD20} className={`${retro.button} px-2 py-2 text-[10px] flex items-center justify-center gap-1 disabled:opacity-40`} style={S_WARN}>
          <Dice6 size={11} /> d20
        </button>
        <button disabled={!canEdit} onClick={onRollWound} className={`${retro.button} px-2 py-2 text-[10px] flex items-center justify-center gap-1 disabled:opacity-40`} style={S_WARN}>
          <Droplets size={11} /> Wound
        </button>
        <button disabled={!canEdit} onClick={onShareStatus} className={`${retro.button} px-2 py-2 text-[10px] flex items-center justify-center gap-1 disabled:opacity-40`} style={S_ACCENT}>
          <Send size={11} /> Status
        </button>
      </div>

      <div className="mt-3">
        <div className="text-[9px] mb-1" style={S_DIM}>State</div>
        <div className="flex flex-wrap gap-1">
          {QUICK_FLAGS.map((flag) => {
            const active = quickState.flags.includes(flag);
            return (
              <button
                key={flag}
                disabled={!canEdit}
                onClick={() => onToggleFlag(flag)}
                className={`${active ? retro.sunken : retro.button} px-2 py-1 text-[9px] disabled:opacity-40`}
                style={active ? S_ACCENT : S_MUTED}
              >
                {flag}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
        <input
          value={quickState.note || ""}
          disabled={!canEdit}
          onChange={(event) => onSetNote(event.target.value)}
          placeholder="Quick note..."
          className={`${retro.sunken} bg-[#05071C] px-2 py-2 text-[11px] outline-none w-full disabled:opacity-60`}
          style={S_TEXT}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-1.5" style={{ background: "#080B24", border: "1px solid #172044" }}>
      <div className="text-[8px]" style={S_DIM}>{label}</div>
      <div className="text-[11px] truncate" style={S_TEXT}>{value}</div>
    </div>
  );
}

function ResourceRow({
  icon,
  label,
  color,
  value,
  max,
  percent,
  disabled,
  onAdjust,
  onSet,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  value: number;
  max: number;
  percent: number;
  disabled: boolean;
  onAdjust: (delta: number) => void;
  onSet: (raw: string) => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1 text-[10px]" style={{ color }}>
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-[10px]" style={S_DIM}>{value}/{max}</div>
      </div>
      <div className="h-2 bg-[#05071C] mb-2" style={{ border: "1px solid #172044" }}>
        <div className="h-full transition-all" style={{ width: `${percent}%`, background: color }} />
      </div>
      <div className="flex items-center gap-1">
        <button disabled={disabled} onClick={() => onAdjust(-5)} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_RED}>-5</button>
        <button disabled={disabled} onClick={() => onAdjust(-1)} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_RED}>-</button>
        <input
          disabled={disabled}
          value={value}
          onChange={(event) => onSet(event.target.value)}
          className={`${retro.sunken} bg-[#05071C] w-16 text-center text-[12px] py-1 outline-none disabled:opacity-60`}
          style={{ color, fontWeight: 700 }}
        />
        <button disabled={disabled} onClick={() => onAdjust(1)} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_GREEN}>+</button>
        <button disabled={disabled} onClick={() => onAdjust(5)} className={`${retro.button} px-2 py-1 text-[10px] disabled:opacity-40`} style={S_GREEN}>+5</button>
      </div>
    </div>
  );
}

function SmallNumberField({
  label,
  value,
  disabled,
  onDec,
  onInc,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="text-center" style={{ background: "#080B24", border: "1px solid #172044", padding: 6 }}>
      <div className="text-[9px]" style={S_DIM}>{label}</div>
      <div className="flex items-center justify-center gap-1 mt-1">
        <button disabled={disabled} onClick={onDec} className={`${retro.button} px-1.5 text-[10px] disabled:opacity-40`} style={S_RED}>-</button>
        <span className="text-[12px] min-w-5" style={S_TEXT}>{value}</span>
        <button disabled={disabled} onClick={onInc} className={`${retro.button} px-1.5 text-[10px] disabled:opacity-40`} style={S_GREEN}>+</button>
      </div>
    </div>
  );
}

function FeedMessage({ message }: { message: CombatFeedMessage }) {
  const payload = (message.payload || {}) as { total?: number; detail?: string; name?: string; subtitle?: string; description?: string };
  const color =
    message.kind === "wound" ? "#FFAA4A" :
    message.kind === "roll" ? "#FFD37A" :
    message.kind === "card" ? "#8AB4FF" :
    message.kind === "item" ? "#4AFF7A" :
    "#CFE0FF";

  return (
    <div className={`${retro.raised} px-3 py-2`} style={{ background: "#0B102C", borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px]" style={{ color, fontWeight: 700 }}>{message.playerName}</div>
        <div className="text-[9px]" style={S_DIM}>{formatTime(message.createdAt)}</div>
      </div>
      <div className="text-[12px] mt-1" style={S_TEXT}>{message.text}</div>
      {(message.kind === "roll" || message.kind === "wound") && payload.detail && (
        <div className="text-[10px] mt-1" style={S_DIM}>Rolls: {payload.detail}</div>
      )}
      {(message.kind === "card" || message.kind === "item") && payload.name && (
        <div className="mt-2 p-2" style={{ background: "#070B22", border: "1px solid #172044" }}>
          <div className="text-[11px]" style={{ color }}>{payload.name}</div>
          {payload.subtitle && <div className="text-[9px] mt-0.5" style={S_DIM}>{payload.subtitle}</div>}
          {payload.description && <div className="text-[10px] mt-1 leading-relaxed" style={S_MUTED}>{payload.description}</div>}
        </div>
      )}
    </div>
  );
}

function TrackPreview({ track }: { track: MusicTrack }) {
  const videoId = track.sourceType === "youtube" ? getYouTubeVideoId(track.url) : null;
  return (
    <div className="mt-3 p-2" style={{ background: "#070B22", border: "1px solid #172044" }}>
      <div className="text-[9px] mb-2" style={S_DIM}>Preview</div>
      {videoId ? (
        <iframe
          title={`Preview ${track.title}`}
          src={`https://www.youtube.com/embed/${videoId}`}
          className="w-full aspect-video"
          style={{ border: "1px solid #172044" }}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <audio controls src={track.url} className="w-full" preload="metadata" />
      )}
    </div>
  );
}

function MusicTrackGroup({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[12px]" style={{ color: "#CFE0FF", fontWeight: 700 }}>{title}</div>
        <div className="text-[10px]" style={S_DIM}>{detail}</div>
      </div>
      {children}
    </section>
  );
}

function AudioEffectsControls({
  effects,
  onChange,
  onReset,
}: {
  effects: AudioEffectSettings;
  onChange: (patch: Partial<AudioEffectSettings>) => void;
  onReset: () => void;
}) {
  return (
    <div className="mt-3 p-3" style={{ background: "#070B22", border: "1px solid #172044" }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[10px]" style={{ color: "#AFC6FF", fontWeight: 700 }}>Audio Effects</div>
        <button onClick={onReset} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_MUTED}>
          Reset
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <EffectSlider label="Reverb" value={effects.reverb} onChange={(value) => onChange({ reverb: value })} />
        <EffectSlider label="Echo" value={effects.echo} onChange={(value) => onChange({ echo: value })} />
        <EffectSlider label="Muffle" value={effects.muffle} onChange={(value) => onChange({ muffle: value })} />
        <EffectSlider label="Thin" value={effects.thin} onChange={(value) => onChange({ thin: value })} />
      </div>
      <div className="mt-2">
        <div className="flex items-center justify-between text-[9px] mb-1" style={S_DIM}>
          <span>Speed</span>
          <span>{Math.round(effects.speed * 100)}%</span>
        </div>
        <input
          type="range"
          min={50}
          max={150}
          value={Math.round(effects.speed * 100)}
          onChange={(event) => onChange({ speed: parseInt(event.target.value, 10) / 100 })}
          className="w-full"
        />
      </div>
    </div>
  );
}

function EffectSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[9px] mb-1" style={S_DIM}>
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(parseInt(event.target.value, 10) / 100)}
        className="w-full"
      />
    </div>
  );
}

function AudioPlaybackLayer({ musicState, audioEnabled }: { musicState: CombatMusicState; audioEnabled: boolean }) {
  const tracksById = useMemo(() => new Map(musicState.tracks.map((track) => [track.id, track])), [musicState.tracks]);
  const masterVolume = musicState.muted ? 0 : clampNumber(musicState.masterVolume ?? 0.85, 0, 1);
  return (
    <div style={{ position: "fixed", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
      {musicState.active.map((active) => {
        const track = tracksById.get(active.trackId);
        if (!track) return null;
        if (!hasPlayableSource(track)) return null;
        if (track.sourceType === "youtube") {
          return <HiddenYouTubeTrack key={track.id} track={track} active={active} audioEnabled={audioEnabled} masterVolume={masterVolume} />;
        }
        return <HiddenAudioTrack key={track.id} track={track} active={active} audioEnabled={audioEnabled} masterVolume={masterVolume} />;
      })}
    </div>
  );
}

interface AudioGraphNodes {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  convolver: ConvolverNode;
  dryGain: GainNode;
  reverbGain: GainNode;
  delay: DelayNode;
  feedbackGain: GainNode;
  echoGain: GainNode;
  outputGain: GainNode;
}

let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext() {
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!sharedAudioContext) sharedAudioContext = new AudioContextCtor();
  return sharedAudioContext;
}

function buildReverbImpulse(context: AudioContext) {
  const duration = 2.4;
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const fade = Math.pow(1 - i / length, 2.6);
      data[i] = (Math.random() * 2 - 1) * fade;
    }
  }
  return impulse;
}

function createAudioGraph(audio: HTMLAudioElement): AudioGraphNodes | null {
  const context = getSharedAudioContext();
  if (!context) return null;

  try {
    const source = context.createMediaElementSource(audio);
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const convolver = context.createConvolver();
    const dryGain = context.createGain();
    const reverbGain = context.createGain();
    const delay = context.createDelay(1.2);
    const feedbackGain = context.createGain();
    const echoGain = context.createGain();
    const outputGain = context.createGain();

    highpass.type = "highpass";
    lowpass.type = "lowpass";
    convolver.buffer = buildReverbImpulse(context);
    dryGain.gain.value = 1;
    reverbGain.gain.value = 0;
    feedbackGain.gain.value = 0;
    echoGain.gain.value = 0;
    outputGain.gain.value = 1;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(dryGain);
    dryGain.connect(outputGain);
    lowpass.connect(convolver);
    convolver.connect(reverbGain);
    reverbGain.connect(outputGain);
    lowpass.connect(delay);
    delay.connect(feedbackGain);
    feedbackGain.connect(delay);
    delay.connect(echoGain);
    echoGain.connect(outputGain);
    outputGain.connect(context.destination);

    return { context, source, highpass, lowpass, convolver, dryGain, reverbGain, delay, feedbackGain, echoGain, outputGain };
  } catch {
    return null;
  }
}

function disconnectAudioGraph(graph: AudioGraphNodes | null) {
  if (!graph) return;
  [
    graph.source,
    graph.highpass,
    graph.lowpass,
    graph.convolver,
    graph.dryGain,
    graph.reverbGain,
    graph.delay,
    graph.feedbackGain,
    graph.echoGain,
    graph.outputGain,
  ].forEach((node) => {
    try { node.disconnect(); } catch {}
  });
}

function HiddenAudioTrack({ track, active, audioEnabled, masterVolume }: { track: MusicTrack; active: ActiveMusicTrack; audioEnabled: boolean; masterVolume: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const graphRef = useRef<AudioGraphNodes | null>(null);
  const lastStartRef = useRef<number>(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || graphRef.current) return undefined;
    graphRef.current = createAudioGraph(audio);
    return () => {
      disconnectAudioGraph(graphRef.current);
      graphRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const graph = graphRef.current;
    const effects = normalizeAudioEffects(active.effects);
    const outputVolume = clampNumber((active.muted ? 0 : active.volume) * masterVolume, 0, 1);

    audio.volume = graph ? 1 : outputVolume;
    audio.loop = !!active.loop;
    audio.playbackRate = effects.speed;

    if (graph) {
      const now = graph.context.currentTime;
      graph.outputGain.gain.setTargetAtTime(outputVolume, now, 0.025);
      graph.lowpass.frequency.setTargetAtTime(lowpassFromMuffle(effects.muffle), now, 0.035);
      graph.highpass.frequency.setTargetAtTime(highpassFromThin(effects.thin), now, 0.035);
      graph.reverbGain.gain.setTargetAtTime(effects.reverb * 0.75, now, 0.035);
      graph.delay.delayTime.setTargetAtTime(0.12 + effects.echo * 0.58, now, 0.035);
      graph.feedbackGain.gain.setTargetAtTime(effects.echo * 0.45, now, 0.035);
      graph.echoGain.gain.setTargetAtTime(effects.echo * 0.7, now, 0.035);
    }

    if (lastStartRef.current !== active.startedAt) {
      audio.currentTime = 0;
      lastStartRef.current = active.startedAt;
    }
    if (audioEnabled && active.playing) {
      if (graph?.context.state === "suspended") void graph.context.resume().catch(() => {});
      void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [
    active.effects,
    active.loop,
    active.muted,
    active.playing,
    active.startedAt,
    active.volume,
    audioEnabled,
    masterVolume,
  ]);

  return <audio ref={audioRef} src={track.url} preload="auto" crossOrigin={track.sourceType === "audio-url" ? "anonymous" : undefined} />;
}

let youtubeApiPromise: Promise<void> | null = null;

function ensureYouTubeApi(): Promise<void> {
  const existing = (window as any).YT;
  if (existing?.Player) return Promise.resolve();
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve) => {
      const previous = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        if (typeof previous === "function") previous();
        resolve();
      };
      if (!document.getElementById("youtube-iframe-api")) {
        const script = document.createElement("script");
        script.id = "youtube-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(script);
      }
    });
  }
  return youtubeApiPromise;
}

function HiddenYouTubeTrack({ track, active, audioEnabled, masterVolume }: { track: MusicTrack; active: ActiveMusicTrack; audioEnabled: boolean; masterVolume: number }) {
  const mountIdRef = useRef(uid("yt"));
  const playerRef = useRef<any>(null);
  const activeRef = useRef(active);
  const masterVolumeRef = useRef(masterVolume);
  const videoId = getYouTubeVideoId(track.url);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    masterVolumeRef.current = masterVolume;
  }, [masterVolume]);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    void ensureYouTubeApi().then(() => {
      if (cancelled || playerRef.current) return;
      const YT = (window as any).YT;
      playerRef.current = new YT.Player(mountIdRef.current, {
        width: "1",
        height: "1",
        videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          playsinline: 1,
          loop: active.loop ? 1 : 0,
          playlist: videoId,
        },
        events: {
          onReady: (event: any) => {
            const latest = activeRef.current;
            event.target.setVolume(Math.round(clampNumber((latest.muted ? 0 : latest.volume) * masterVolumeRef.current, 0, 1) * 100));
            if (audioEnabled && latest.playing) event.target.playVideo();
          },
          onStateChange: (event: any) => {
            if (event.data === 0 && activeRef.current.loop) event.target.playVideo();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (playerRef.current?.destroy) {
        try { playerRef.current.destroy(); } catch {}
      }
      playerRef.current = null;
    };
  }, [audioEnabled, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.setVolume(Math.round(clampNumber((active.muted ? 0 : active.volume) * masterVolume, 0, 1) * 100));
      if (audioEnabled && active.playing) player.playVideo();
      else player.pauseVideo();
    } catch {}
  }, [active.muted, active.playing, active.volume, audioEnabled, masterVolume]);

  if (!videoId) return null;
  return <div id={mountIdRef.current} />;
}
