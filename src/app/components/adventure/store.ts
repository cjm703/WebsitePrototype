import { appStore } from "@/lib/app-store";
import { removeSupabaseChannelSafely, supabase } from "@/lib/supabaseClient";
import { safeGetJson, safeSetJson } from "../safe-storage";
import { DEFAULT_ADVENTURE_FRAMEWORK, DEFAULT_ENCOUNTER_SETTINGS, ADVENTURE_OBJECTIVES } from "./data";
import { DEFAULT_ADVENTURE_CONTENT, normalizeAdventureContent } from "./content";
import { nowIso } from "./engine";
import { normalizeAdventureProfile } from "./profile";
import type { AdventureProfile, AdventureProfilesByPlayer, AdventureSession, AdventureStateDoc } from "./types";

const LOCAL_KEY = "inet-adventure-sessions";
const EVENT_NAME = "inet-adventure-sessions-updated";
const DEFAULT_STATE: AdventureStateDoc = { schemaVersion: 3, sessions: [], profiles: {}, contentCatalog: DEFAULT_ADVENTURE_CONTENT };

let remoteUnavailable = false;

function normalizeSession(value: unknown): AdventureSession | null {
  if (!value || typeof value !== "object" || typeof (value as any).id !== "string") return null;
  const raw = value as Partial<AdventureSession>;
  const settings = { ...DEFAULT_ENCOUNTER_SETTINGS, ...(raw.settings || {}) };
  const objective = raw.objective || ADVENTURE_OBJECTIVES[settings.objectiveType] || ADVENTURE_OBJECTIVES.defeat_all;
  const campaign = raw.campaign && typeof raw.campaign === "object" ? {
    ...raw.campaign,
    id: raw.campaign.id || "campaign-migrated",
    seed: Number(raw.campaign.seed || raw.seed || Date.now()),
    currentNodeId: raw.campaign.currentNodeId || "node-0-0",
    visitedNodeIds: Array.isArray(raw.campaign.visitedNodeIds) ? raw.campaign.visitedNodeIds : [],
    nodes: Array.isArray(raw.campaign.nodes) ? raw.campaign.nodes : [],
    maxDepth: Number(raw.campaign.maxDepth || 6),
    sleepUsesRemaining: Number(raw.campaign.sleepUsesRemaining ?? 3),
    awaitingPostNodeVote: Boolean(raw.campaign.awaitingPostNodeVote),
    campVotes: Array.isArray(raw.campaign.campVotes) ? raw.campaign.campVotes : [],
    moveVotes: Array.isArray(raw.campaign.moveVotes) ? raw.campaign.moveVotes : [],
  } : null;
  return {
    id: raw.id!,
    name: raw.name || "Adventure Room",
    status: raw.status || "lobby",
    phase: raw.phase || (raw.status === "playing" ? "encounter" : raw.status === "completed" ? "rewards" : raw.status === "abandoned" ? "closed" : "setup"),
    version: Math.max(1, Number(raw.version || 1)),
    outcome: raw.outcome,
    hostPlayerId: raw.hostPlayerId || "dm",
    mapSize: Number(raw.mapSize || settings.mapSize || 12),
    theme: raw.theme || settings.theme,
    seed: Number(raw.seed || Date.now()),
    settings,
    objective: { ...objective, completed: Boolean(objective.completed) },
    map: raw.map || null,
    players: Array.isArray(raw.players) ? raw.players.map((player: any) => ({
      ...player,
      ready: Boolean(player.ready),
      shopReady: Boolean(player.shopReady),
      inventory: Array.isArray(player.inventory) ? player.inventory : [],
      abilities: Array.isArray(player.abilities) ? player.abilities : [],
      equipment: player.equipment || {},
      gold: Number(player.gold || 0),
      xpBank: Number(player.xpBank || 0),
      campaignLevel: Math.max(1, Number(player.campaignLevel || 1)),
      lastSeenAt: player.lastSeenAt || nowIso(),
    })) : [],
    enemies: Array.isArray(raw.enemies) ? raw.enemies : [],
    turnOrder: Array.isArray(raw.turnOrder) ? raw.turnOrder : [],
    activeTurnIndex: Number(raw.activeTurnIndex || 0),
    round: Number(raw.round || 1),
    fleeVotes: Array.isArray(raw.fleeVotes) ? raw.fleeVotes : [],
    campaign,
    framework: { ...DEFAULT_ADVENTURE_FRAMEWORK, ...(raw.framework || {}) },
    content: normalizeAdventureContent(raw.content),
    pendingRewards: Array.isArray(raw.pendingRewards) ? raw.pendingRewards : [],
    actionHistory: Array.isArray(raw.actionHistory) ? raw.actionHistory : [],
    lastResolvedActionId: raw.lastResolvedActionId,
    log: Array.isArray(raw.log) ? raw.log : [],
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
  };
}

function normalizeProfiles(value: unknown): AdventureProfilesByPlayer {
  if (!value || typeof value !== "object") return {};
  const result: AdventureProfilesByPlayer = {};
  for (const [playerId, profile] of Object.entries(value as Record<string, AdventureProfile>)) {
    result[playerId] = normalizeAdventureProfile(profile, playerId, profile?.playerName || "Player", profile?.preferredClassId || "warrior");
  }
  return result;
}

function normalizeState(value: unknown): AdventureStateDoc {
  if (Array.isArray(value)) {
    return {
      ...DEFAULT_STATE,
      sessions: value.map(normalizeSession).filter(Boolean) as AdventureSession[],
    };
  }
  const raw = (value && typeof value === "object" ? value : {}) as Partial<AdventureStateDoc>;
  return {
    schemaVersion: 3,
    sessions: Array.isArray(raw.sessions) ? raw.sessions.map(normalizeSession).filter(Boolean) as AdventureSession[] : [],
    profiles: normalizeProfiles(raw.profiles),
    contentCatalog: normalizeAdventureContent(raw.contentCatalog),
  };
}

function readLocalState() {
  return normalizeState(safeGetJson<unknown>(LOCAL_KEY, DEFAULT_STATE));
}

function writeLocalState(state: AdventureStateDoc) {
  safeSetJson(LOCAL_KEY, state);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export async function loadAdventureState(): Promise<{ state: AdventureStateDoc; source: "remote" | "local" }> {
  if (!remoteUnavailable) {
    try {
      const doc = await appStore.loadAdventureSessionsState<unknown>(DEFAULT_STATE);
      const state = normalizeState(doc);
      safeSetJson(LOCAL_KEY, state);
      return { state, source: "remote" };
    } catch (err) {
      remoteUnavailable = true;
      console.warn("[Adventure] Shared state unavailable, using local fallback.", err);
    }
  }
  return { state: readLocalState(), source: "local" };
}

export async function saveAdventureState(state: AdventureStateDoc): Promise<"remote" | "local"> {
  const normalized = normalizeState(state);
  if (!remoteUnavailable) {
    try {
      await appStore.saveAdventureSessionsState(normalized);
      safeSetJson(LOCAL_KEY, normalized);
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
      return "remote";
    } catch (err) {
      remoteUnavailable = true;
      console.warn("[Adventure] Could not save shared state, falling back locally.", err);
    }
  }
  writeLocalState(normalized);
  return "local";
}

export async function upsertAdventureState(nextState: AdventureStateDoc): Promise<"remote" | "local"> {
  return saveAdventureState(nextState);
}

export async function upsertAdventureSession(
  session: AdventureSession,
  profiles?: AdventureProfilesByPlayer,
  expectedVersion?: number,
): Promise<{ ok: boolean; source: "remote" | "local"; state: AdventureStateDoc; reason?: string }> {
  const { state } = await loadAdventureState();
  const existing = state.sessions.find((entry) => entry.id === session.id);
  if (existing && expectedVersion != null && existing.version !== expectedVersion) {
    return {
      ok: false,
      source: remoteUnavailable ? "local" : "remote",
      state,
      reason: "This room changed before your action saved. The latest state was reloaded.",
    };
  }
  const sessions = existing
    ? state.sessions.map((entry) => entry.id === session.id ? session : entry)
    : [session, ...state.sessions];
  const nextState = {
    schemaVersion: 3 as const,
    sessions: sessions.slice(0, 20),
    profiles: profiles || state.profiles,
    contentCatalog: state.contentCatalog,
  };
  const source = await saveAdventureState(nextState);
  return { ok: true, source, state: nextState };
}

export function subscribeAdventureState(listener: (state: AdventureStateDoc, source: "remote" | "local") => void) {
  let closed = false;
  let timer: number | null = null;

  const refresh = async () => {
    if (closed) return;
    const result = await loadAdventureState().catch(() => ({ state: readLocalState(), source: "local" as const }));
    if (!closed) listener(result.state, result.source);
  };

  const poll = () => {
    void refresh().finally(() => {
      if (!closed) timer = window.setTimeout(poll, remoteUnavailable ? 1600 : 2500);
    });
  };

  const localListener = () => listener(readLocalState(), "local");
  window.addEventListener(EVENT_NAME, localListener);

  let channel: ReturnType<typeof supabase.channel> | null = null;
  try {
    channel = supabase
      .channel("adventure-state")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_arcade_catalog_state" }, () => {
        void refresh();
      })
      .subscribe();
  } catch {
    channel = null;
  }

  void refresh();
  poll();

  return () => {
    closed = true;
    if (timer != null) window.clearTimeout(timer);
    window.removeEventListener(EVENT_NAME, localListener);
    if (channel) removeSupabaseChannelSafely(channel);
  };
}

export async function loadAdventureSessions() {
  const { state, source } = await loadAdventureState();
  return { sessions: state.sessions, source };
}

export function subscribeAdventureSessions(listener: (sessions: AdventureSession[], source: "remote" | "local") => void) {
  return subscribeAdventureState((state, source) => listener(state.sessions, source));
}
