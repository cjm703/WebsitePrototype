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
  Database,
  Folder,
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
import {
  COMBAT_MUSIC_BUCKET,
  deleteCombatMusicFileFromStorage,
  type CombatMusicStorageRef,
  uploadCombatMusicFileToStorage,
} from "@/lib/combat-music-storage";
import { removeSupabaseChannelSafely, supabase } from "@/lib/supabaseClient";
import { retro } from "./retro-styles";
import { safeGetItem, safeGetJson, safeSetJson } from "./safe-storage";
import { DISPLAY_CONTENTS, S_ACCENT, S_DIM, S_GREEN, S_MUTED, S_RED, S_TEXT, S_WARN } from "./shared-styles";
import type { ManagedCard, ManagedItem, PlayerData } from "./types";

type CombatTab = "players" | "music";
type FeedKind = "message" | "roll" | "wound" | "card" | "item" | "system";
type TrackSource = "audio-url" | "youtube" | "file";
type MusicSort = "recent" | "title" | "source" | "tag" | "folder";
type MusicLayerId = "1" | "2";

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
  sharedAudio?: SharedAudioRef;
  storageAudio?: CombatMusicStorageRef;
  folder?: string;
  tags?: string[];
  notes?: string;
  updatedAt?: string;
}

interface SharedAudioRef {
  kind: "state-chunks";
  key: string;
  chunkCount: number;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

interface SharedAudioChunk {
  id: string;
  trackId: string;
  index: number;
  total: number;
  data: string;
  contentType: string;
  sizeBytes: number;
}

interface AudioEffectSettings {
  reverb: number;
  echo: number;
  muffle: number;
  thin: number;
  bass: number;
  mid: number;
  treble: number;
  speed: number;
  pitch: number;
}

interface ActiveMusicTrack {
  trackId: string;
  layer?: MusicLayerId;
  playing: boolean;
  volume: number;
  loop: boolean;
  muted?: boolean;
  effects?: AudioEffectSettings;
  fadeInStartedAt?: number;
  fadeInSeconds?: number;
  fadeOutStartedAt?: number;
  fadeOutSeconds?: number;
  seekTo?: number;
  seekRequestId?: string;
  position?: number;
  positionUpdatedAt?: number;
  startedAt: number;
  updatedAt: string;
}

interface QueuedMusicTrack {
  id: string;
  trackId: string;
  layer: MusicLayerId;
  addedAt: string;
}

interface CombatMusicState {
  tracks: MusicTrack[];
  active: ActiveMusicTrack[];
  queue: QueuedMusicTrack[];
  crossfadeSeconds: number;
  masterVolume: number;
  muted: boolean;
  updatedAt: string;
}

interface CombatPresenceUser {
  userId: string;
  name: string;
  isDM: boolean;
  audioEnabled: boolean;
  localVolume: number;
  activeTab: CombatTab;
  loadedTrackIds: string[];
  missingTrackIds: string[];
  activeTrackIds: string[];
  lastSeen: string;
}

interface CombatPresenceState {
  users: Record<string, CombatPresenceUser>;
  updatedAt: string;
}

interface MusicUploadProgress {
  label: string;
  percent: number;
  phase: "reading" | "uploading" | "saving";
}

interface PlaybackStatus {
  currentTime: number;
  duration: number;
  paused: boolean;
  waiting: boolean;
  error?: string;
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
const LOCAL_COMBAT_PRESENCE_KEY = "inet-combat-presence-state";
const LOCAL_PLAYER_MUSIC_VOLUME_KEY = "inet-combat-player-music-volume";
const DEFAULT_COMBAT_STATE: CombatState = { messages: [], playerStates: {}, round: 1, scene: "", updatedAt: "" };
const DEFAULT_MUSIC_STATE: CombatMusicState = { tracks: [], active: [], queue: [], crossfadeSeconds: 4, masterVolume: 0.85, muted: false, updatedAt: "" };
const DEFAULT_COMBAT_PRESENCE_STATE: CombatPresenceState = { users: {}, updatedAt: "" };
const DEFAULT_AUDIO_EFFECTS: AudioEffectSettings = { reverb: 0, echo: 0, muffle: 0, thin: 0, bass: 0, mid: 0, treble: 0, speed: 1, pitch: 0 };
const YOUTUBE_EMBED_HOST = "https://www.youtube.com";
const QUICK_FLAGS = ["Guarded", "Concentrating", "Prone", "Hidden", "Bloodied", "Stunned"];
const MAX_FEED_MESSAGES = 150;
const MAX_STORAGE_AUDIO_FILE_BYTES = 50 * 1024 * 1024;
const MAX_SHARED_AUDIO_FILE_BYTES = 12 * 1024 * 1024;
const LOCAL_AUDIO_CACHE_OMIT_THRESHOLD = 256 * 1024;
const SHARED_AUDIO_CHUNK_SIZE = 160 * 1024;
const LOCAL_AUDIO_DB_NAME = "inet-combat-audio-cache";
const LOCAL_AUDIO_DB_STORE = "audio";
const LOCAL_AUDIO_DB_VERSION = 1;
const DEFAULT_TRACK_FOLDER = "Unsorted";

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function normalizeMusicLayer(raw: unknown, fallback: MusicLayerId = "1"): MusicLayerId {
  return raw === "2" ? "2" : fallback;
}

function fadeMultiplierForActive(active: ActiveMusicTrack, now = Date.now()) {
  let multiplier = 1;
  if (active.fadeInStartedAt && active.fadeInSeconds && active.fadeInSeconds > 0) {
    const progress = clampNumber((now - active.fadeInStartedAt) / (active.fadeInSeconds * 1000), 0, 1);
    multiplier = Math.min(multiplier, progress);
  }
  if (active.fadeOutStartedAt && active.fadeOutSeconds && active.fadeOutSeconds > 0) {
    const progress = clampNumber((now - active.fadeOutStartedAt) / (active.fadeOutSeconds * 1000), 0, 1);
    multiplier = Math.min(multiplier, 1 - progress);
  }
  return clampNumber(multiplier, 0, 1);
}

function hasActiveFade(active: ActiveMusicTrack) {
  const now = Date.now();
  return Boolean(
    (active.fadeInStartedAt && active.fadeInSeconds && now - active.fadeInStartedAt < active.fadeInSeconds * 1000) ||
    (active.fadeOutStartedAt && active.fadeOutSeconds && now - active.fadeOutStartedAt < active.fadeOutSeconds * 1000)
  );
}

function isPresenceFresh(user: CombatPresenceUser) {
  const lastSeen = Date.parse(user.lastSeen);
  return Number.isFinite(lastSeen) && Date.now() - lastSeen < 45000;
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

function getBrowserOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function getYouTubeEmbedUrl(videoId: string, params: Record<string, string | number> = {}) {
  const search = new URLSearchParams({
    rel: "0",
    playsinline: "1",
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
  });
  const origin = getBrowserOrigin();
  if (origin) search.set("origin", origin);
  return `${YOUTUBE_EMBED_HOST}/embed/${encodeURIComponent(videoId)}?${search.toString()}`;
}

function inferTrackSource(url: string): TrackSource {
  return getYouTubeVideoId(url) ? "youtube" : "audio-url";
}

function fileToDataUrl(file: File, onProgress?: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      onProgress?.(100);
      resolve(String(reader.result || ""));
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read audio file."));
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 90));
      }
    };
    reader.readAsDataURL(file);
  });
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("Failed to prepare audio for Supabase Storage.");
  return response.blob();
}

function formatAudioBytes(value?: number) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function storageSetupHint(error: unknown) {
  const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
  return `Supabase Storage upload failed${detail}. Create a public "${COMBAT_MUSIC_BUCKET}" bucket and allow uploads from the site.`;
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

function normalizeTrackFolder(raw: unknown) {
  if (typeof raw !== "string") return DEFAULT_TRACK_FOLDER;
  const folder = raw.trim().replace(/\s+/g, " ").slice(0, 40);
  return folder || DEFAULT_TRACK_FOLDER;
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
    bass: clampNumber(Number(raw?.bass ?? DEFAULT_AUDIO_EFFECTS.bass), -12, 12),
    mid: clampNumber(Number(raw?.mid ?? DEFAULT_AUDIO_EFFECTS.mid), -12, 12),
    treble: clampNumber(Number(raw?.treble ?? DEFAULT_AUDIO_EFFECTS.treble), -12, 12),
    speed: clampNumber(Number(raw?.speed ?? DEFAULT_AUDIO_EFFECTS.speed), 0.5, 1.5),
    pitch: clampNumber(Number(raw?.pitch ?? DEFAULT_AUDIO_EFFECTS.pitch), -12, 12),
  };
}

function lowpassFromMuffle(amount: number) {
  return Math.max(700, 20000 - (clampNumber(amount, 0, 1) * 19300));
}

function highpassFromThin(amount: number) {
  return Math.min(1800, 20 + (clampNumber(amount, 0, 1) * 1780));
}

function normalizeStorageAudioRef(raw: unknown): CombatMusicStorageRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const ref = raw as Partial<CombatMusicStorageRef>;
  if (ref.kind !== "supabase-storage" || typeof ref.bucket !== "string" || typeof ref.path !== "string") return undefined;
  const publicUrl = typeof ref.publicUrl === "string" ? ref.publicUrl : "";
  return {
    kind: "supabase-storage",
    bucket: ref.bucket.trim() || COMBAT_MUSIC_BUCKET,
    path: ref.path,
    publicUrl,
    contentType: typeof ref.contentType === "string" ? ref.contentType : "audio/*",
    sizeBytes: Number.isFinite(Number(ref.sizeBytes)) ? Number(ref.sizeBytes) : 0,
    createdAt: typeof ref.createdAt === "string" ? ref.createdAt : "",
  };
}

function sourceLabel(track: MusicTrack) {
  if (track.storageAudio) return `${track.fileName || "Uploaded file"} (Supabase Storage)`;
  if (track.audioDataOmitted && !track.url && track.sharedAudio) return `${track.fileName || "Uploaded file"} (loading shared audio)`;
  if (track.audioDataOmitted && !track.url) return `${track.fileName || "Uploaded file"} (local file needed)`;
  if (track.sourceType === "youtube") return "YouTube";
  if (track.sourceType === "file") return track.fileName || "Uploaded file";
  return "Audio URL";
}

function hasPlayableSource(track: MusicTrack) {
  if (!track.url) return false;
  if (track.sourceType === "youtube") return Boolean(getYouTubeVideoId(track.url));
  return true;
}

function supportsLiveAudioEffects(track: MusicTrack) {
  return track.sourceType === "file" && Boolean(track.url) && (
    track.url.startsWith("data:") || Boolean(track.storageAudio)
  );
}

function isInlineFileAudio(track: MusicTrack) {
  return track.sourceType === "file" && typeof track.url === "string" && track.url.startsWith("data:");
}

function omitInlineFileAudio(track: MusicTrack): MusicTrack {
  return {
    ...track,
    url: "",
    audioDataOmitted: true,
  };
}

function buildLocalMusicCacheState(state: CombatMusicState): CombatMusicState {
  return {
    ...state,
    tracks: state.tracks.map((track) => {
      const shouldOmitAudioData =
        isInlineFileAudio(track) &&
        track.url.length > LOCAL_AUDIO_CACHE_OMIT_THRESHOLD;

      return shouldOmitAudioData ? omitInlineFileAudio(track) : track;
    }),
  };
}

function buildSharedMusicState(state: CombatMusicState): CombatMusicState {
  return {
    ...state,
    tracks: state.tracks.map((track) => (
      isInlineFileAudio(track) ? omitInlineFileAudio(track) : track
    )),
  };
}

function rememberLocalAudioSources(state: CombatMusicState, sources: Map<string, string>) {
  state.tracks.forEach((track) => {
    if (isInlineFileAudio(track)) sources.set(track.id, track.url);
  });
}

function restoreLocalAudioSources(state: CombatMusicState, sources: Map<string, string>): CombatMusicState {
  return {
    ...state,
    tracks: state.tracks.map((track) => {
      if (track.sourceType !== "file" || track.url) return track;
      const localUrl = sources.get(track.id);
      return localUrl ? { ...track, url: localUrl, audioDataOmitted: false } : track;
    }),
  };
}

function openLocalAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = window.indexedDB.open(LOCAL_AUDIO_DB_NAME, LOCAL_AUDIO_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_AUDIO_DB_STORE)) {
        db.createObjectStore(LOCAL_AUDIO_DB_STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error || new Error("Failed to open audio cache."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function cacheLocalAudioSource(trackId: string, url: string) {
  if (!trackId || !url) return;
  try {
    const db = await openLocalAudioDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(LOCAL_AUDIO_DB_STORE, "readwrite");
      transaction.objectStore(LOCAL_AUDIO_DB_STORE).put({ id: trackId, url, updatedAt: new Date().toISOString() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Failed to cache audio."));
    });
    db.close();
  } catch {}
}

async function loadCachedAudioSource(trackId: string): Promise<string | null> {
  if (!trackId) return null;
  try {
    const db = await openLocalAudioDb();
    const result = await new Promise<{ url?: string } | undefined>((resolve, reject) => {
      const transaction = db.transaction(LOCAL_AUDIO_DB_STORE, "readonly");
      const request = transaction.objectStore(LOCAL_AUDIO_DB_STORE).get(trackId);
      request.onsuccess = () => resolve(request.result as { url?: string } | undefined);
      request.onerror = () => reject(request.error || new Error("Failed to read cached audio."));
    });
    db.close();
    return typeof result?.url === "string" && result.url ? result.url : null;
  } catch {
    return null;
  }
}

async function deleteCachedAudioSource(trackId: string) {
  if (!trackId) return;
  try {
    const db = await openLocalAudioDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(LOCAL_AUDIO_DB_STORE, "readwrite");
      transaction.objectStore(LOCAL_AUDIO_DB_STORE).delete(trackId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Failed to delete cached audio."));
    });
    db.close();
  } catch {}
}

function sharedAudioChunkId(key: string, index: number) {
  return `${key}-${index.toString().padStart(4, "0")}`;
}

function normalizeSharedAudioRef(raw: unknown): SharedAudioRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const ref = raw as Partial<SharedAudioRef>;
  if (ref.kind !== "state-chunks" || typeof ref.key !== "string" || !ref.key.trim()) return undefined;
  const chunkCount = Math.max(0, Math.floor(Number(ref.chunkCount || 0)));
  if (chunkCount <= 0) return undefined;
  return {
    kind: "state-chunks",
    key: ref.key,
    chunkCount,
    contentType: typeof ref.contentType === "string" ? ref.contentType : "audio/*",
    sizeBytes: Number.isFinite(Number(ref.sizeBytes)) ? Number(ref.sizeBytes) : 0,
    createdAt: typeof ref.createdAt === "string" ? ref.createdAt : "",
  };
}

async function saveSharedAudioData(
  trackId: string,
  dataUrl: string,
  file: { type?: string; size?: number },
  onProgress?: (percent: number) => void,
): Promise<SharedAudioRef> {
  const key = `combat-music-audio-${trackId}`;
  const chunkCount = Math.max(1, Math.ceil(dataUrl.length / SHARED_AUDIO_CHUNK_SIZE));
  const createdAt = new Date().toISOString();

  for (let index = 0; index < chunkCount; index += 1) {
    const id = sharedAudioChunkId(key, index);
    const chunk: SharedAudioChunk = {
      id,
      trackId,
      index,
      total: chunkCount,
      data: dataUrl.slice(index * SHARED_AUDIO_CHUNK_SIZE, (index + 1) * SHARED_AUDIO_CHUNK_SIZE),
      contentType: file.type || "audio/*",
      sizeBytes: file.size || dataUrl.length,
    };
    await appStore.saveCombatMusicFileChunk(id, chunk);
    onProgress?.(Math.round(((index + 1) / chunkCount) * 100));
  }

  return {
    kind: "state-chunks",
    key,
    chunkCount,
    contentType: file.type || "audio/*",
    sizeBytes: file.size || dataUrl.length,
    createdAt,
  };
}

async function loadSharedAudioData(track: MusicTrack): Promise<string | null> {
  const ref = track.sharedAudio;
  if (!ref || ref.kind !== "state-chunks") return null;
  const chunks: string[] = [];

  for (let index = 0; index < ref.chunkCount; index += 1) {
    const id = sharedAudioChunkId(ref.key, index);
    const chunk = await appStore.loadCombatMusicFileChunk<SharedAudioChunk | null>(id, null);
    if (!chunk || chunk.trackId !== track.id || chunk.index !== index || typeof chunk.data !== "string") {
      return null;
    }
    chunks[index] = chunk.data;
  }

  return chunks.join("");
}

async function deleteSharedAudioData(ref: SharedAudioRef | undefined) {
  if (!ref || ref.kind !== "state-chunks") return;
  await Promise.all(
    Array.from({ length: ref.chunkCount }, (_, index) => (
      appStore.deleteCombatMusicFileChunk(sharedAudioChunkId(ref.key, index)).catch(() => {})
    )),
  );
}

function formatTime(iso: string) {
  const parsed = Date.parse(iso);
  if (!parsed) return "";
  return new Date(parsed).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainingSeconds = whole % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
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

function musicStateTimestamp(state: Partial<CombatMusicState> | null | undefined) {
  const parsed = Date.parse(state?.updatedAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMusicState(state: Partial<CombatMusicState> | null | undefined): CombatMusicState {
  return {
    tracks: Array.isArray(state?.tracks)
      ? state!.tracks
          .filter((track) => track && typeof track.id === "string" && (typeof track.url === "string" || Boolean(normalizeStorageAudioRef(track.storageAudio))))
          .map((track) => {
            const storageAudio = normalizeStorageAudioRef(track.storageAudio);
            const url = typeof track.url === "string" && track.url ? track.url : storageAudio?.publicUrl || "";
            return {
              ...track,
              url,
              title: typeof track.title === "string" && track.title.trim() ? track.title : trackLabelFromUrl(url),
              sourceType: track.sourceType === "youtube" || track.sourceType === "file" || track.sourceType === "audio-url"
                ? track.sourceType
                : inferTrackSource(url),
              folder: normalizeTrackFolder(track.folder),
              tags: normalizeTrackTags(track.tags),
              notes: typeof track.notes === "string" ? track.notes : "",
              contentType: typeof track.contentType === "string" ? track.contentType : storageAudio?.contentType || "",
              sizeBytes: Number.isFinite(Number(track.sizeBytes)) ? Number(track.sizeBytes) : storageAudio?.sizeBytes,
              audioDataOmitted: Boolean(track.audioDataOmitted),
              sharedAudio: normalizeSharedAudioRef(track.sharedAudio),
              storageAudio,
              createdAt: typeof track.createdAt === "string" ? track.createdAt : new Date().toISOString(),
              updatedAt: typeof track.updatedAt === "string" ? track.updatedAt : "",
            };
          })
      : [],
    active: Array.isArray(state?.active)
      ? state!.active
          .filter((entry) => entry && typeof entry.trackId === "string")
          .map((entry) => ({
            trackId: entry.trackId,
            layer: normalizeMusicLayer(entry.layer),
            playing: Boolean(entry.playing),
            volume: clampNumber(Number(entry.volume ?? 0.65), 0, 1),
            loop: Boolean(entry.loop),
            muted: Boolean(entry.muted),
            effects: normalizeAudioEffects(entry.effects),
            fadeInStartedAt: Number.isFinite(Number(entry.fadeInStartedAt)) ? Number(entry.fadeInStartedAt) : undefined,
            fadeInSeconds: Number.isFinite(Number(entry.fadeInSeconds)) ? clampNumber(Number(entry.fadeInSeconds), 0, 30) : undefined,
            fadeOutStartedAt: Number.isFinite(Number(entry.fadeOutStartedAt)) ? Number(entry.fadeOutStartedAt) : undefined,
            fadeOutSeconds: Number.isFinite(Number(entry.fadeOutSeconds)) ? clampNumber(Number(entry.fadeOutSeconds), 0, 30) : undefined,
            seekTo: Number.isFinite(Number(entry.seekTo)) ? Math.max(0, Number(entry.seekTo)) : undefined,
            seekRequestId: typeof entry.seekRequestId === "string" ? entry.seekRequestId : "",
            position: Number.isFinite(Number(entry.position)) ? Math.max(0, Number(entry.position)) : undefined,
            positionUpdatedAt: Number.isFinite(Number(entry.positionUpdatedAt)) ? Number(entry.positionUpdatedAt) : undefined,
            startedAt: Number.isFinite(Number(entry.startedAt)) ? Number(entry.startedAt) : Date.now(),
            updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
          }))
      : [],
    queue: Array.isArray(state?.queue)
      ? state!.queue
          .filter((entry) => entry && typeof entry.trackId === "string")
          .map((entry) => ({
            id: typeof entry.id === "string" ? entry.id : uid("queue"),
            trackId: entry.trackId,
            layer: normalizeMusicLayer(entry.layer),
            addedAt: typeof entry.addedAt === "string" ? entry.addedAt : new Date().toISOString(),
          }))
          .slice(0, 20)
      : [],
    crossfadeSeconds: clampNumber(Number(state?.crossfadeSeconds ?? DEFAULT_MUSIC_STATE.crossfadeSeconds), 0, 20),
    masterVolume: clampNumber(Number(state?.masterVolume ?? DEFAULT_MUSIC_STATE.masterVolume), 0, 1),
    muted: Boolean(state?.muted),
    updatedAt: typeof state?.updatedAt === "string" ? state.updatedAt : "",
  };
}

function normalizeCombatPresenceState(state: Partial<CombatPresenceState> | null | undefined): CombatPresenceState {
  const users: Record<string, CombatPresenceUser> = {};
  if (state?.users && typeof state.users === "object") {
    Object.values(state.users).forEach((user) => {
      if (!user || typeof user.userId !== "string") return;
      users[user.userId] = {
        userId: user.userId,
        name: typeof user.name === "string" && user.name.trim() ? user.name : user.userId,
        isDM: Boolean(user.isDM),
        audioEnabled: Boolean(user.audioEnabled),
        localVolume: clampNumber(Number(user.localVolume ?? 1), 0, 1.5),
        activeTab: user.activeTab === "music" ? "music" : "players",
        loadedTrackIds: Array.isArray(user.loadedTrackIds) ? user.loadedTrackIds.filter((id) => typeof id === "string") : [],
        missingTrackIds: Array.isArray(user.missingTrackIds) ? user.missingTrackIds.filter((id) => typeof id === "string") : [],
        activeTrackIds: Array.isArray(user.activeTrackIds) ? user.activeTrackIds.filter((id) => typeof id === "string") : [],
        lastSeen: typeof user.lastSeen === "string" ? user.lastSeen : "",
      };
    });
  }
  return {
    users,
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
  const [combatPresence, setCombatPresence] = useState<CombatPresenceState>(DEFAULT_COMBAT_PRESENCE_STATE);
  const [feedText, setFeedText] = useState("");
  const [diceFormula, setDiceFormula] = useState("1d20");
  const [shareKind, setShareKind] = useState<"card" | "item">("card");
  const [shareQuery, setShareQuery] = useState("");
  const [sharePlayerId, setSharePlayerId] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicTitle, setMusicTitle] = useState("");
  const [musicStatus, setMusicStatus] = useState("");
  const [musicUploadProgress, setMusicUploadProgress] = useState<MusicUploadProgress | null>(null);
  const [musicSearch, setMusicSearch] = useState("");
  const [musicSort, setMusicSort] = useState<MusicSort>("recent");
  const [musicFolderFilter, setMusicFolderFilter] = useState("all");
  const [localMusicVolume, setLocalMusicVolume] = useState(() => (
    clampNumber(Number(safeGetJson<number>(LOCAL_PLAYER_MUSIC_VOLUME_KEY, 1)), 0, 1.5)
  ));
  const [previewTrackId, setPreviewTrackId] = useState("");
  const [playbackStatuses, setPlaybackStatuses] = useState<Record<string, PlaybackStatus>>({});
  const [seekDrafts, setSeekDrafts] = useState<Record<string, number>>({});
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [sceneDraft, setSceneDraft] = useState("");
  const [sceneDraftDirty, setSceneDraftDirty] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const musicStateRef = useRef<CombatMusicState>(DEFAULT_MUSIC_STATE);
  const musicPersistRequestedRef = useRef(false);
  const musicPersistLoopRef = useRef<Promise<void> | null>(null);
  const musicPersistResolversRef = useRef<Array<(saved: boolean) => void>>([]);
  const localAudioSourcesRef = useRef<Map<string, string>>(new Map());
  const sharedAudioLoadingRef = useRef<Set<string>>(new Set());
  const sharedAudioFailedRef = useRef<Set<string>>(new Set());
  const musicLoadFailuresRef = useRef(0);
  const musicLoadRetryAtRef = useRef(0);

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
    const localMusicFallback = safeGetJson<CombatMusicState>(LOCAL_MUSIC_STATE_KEY, DEFAULT_MUSIC_STATE);
    const shouldRetryMusicLoad = Date.now() >= musicLoadRetryAtRef.current;
    const musicLoad = shouldRetryMusicLoad
      ? appStore.loadCombatMusicState<CombatMusicState>(DEFAULT_MUSIC_STATE)
          .then((state) => {
            musicLoadFailuresRef.current = 0;
            musicLoadRetryAtRef.current = 0;
            return state;
          })
          .catch(() => {
            musicLoadFailuresRef.current += 1;
            if (musicLoadFailuresRef.current >= 3) {
              musicLoadRetryAtRef.current = Date.now() + 30000;
            }
            return localMusicFallback;
          })
      : Promise.resolve(localMusicFallback);

    const [nextPlayers, nextCards, nextItems, nextCombat, nextMusic, nextPresence] = await Promise.all([
      appStore.listPlayers<PlayerData>().catch(() => buildLocalPlayerFallback()),
      appStore.listCards<ManagedCard>().catch(() => buildLocalCardsFallback()),
      appStore.listItems<ManagedItem>().catch(() => buildLocalItemsFallback()),
      appStore.loadCombatState<CombatState>(DEFAULT_COMBAT_STATE).catch(() => safeGetJson<CombatState>(LOCAL_COMBAT_STATE_KEY, DEFAULT_COMBAT_STATE)),
      musicLoad,
      appStore.loadCombatPresenceState<CombatPresenceState>(DEFAULT_COMBAT_PRESENCE_STATE).catch(() => safeGetJson<CombatPresenceState>(LOCAL_COMBAT_PRESENCE_KEY, DEFAULT_COMBAT_PRESENCE_STATE)),
    ]);
    setPlayers(Array.isArray(nextPlayers) ? nextPlayers : []);
    setCards(Array.isArray(nextCards) ? nextCards : []);
    setItems(Array.isArray(nextItems) ? nextItems : []);
    setCombatState(normalizeCombatState(nextCombat));
    const normalizedMusic = normalizeMusicState(nextMusic);
    rememberLocalAudioSources(normalizedMusic, localAudioSourcesRef.current);
    const restoredMusic = restoreLocalAudioSources(normalizedMusic, localAudioSourcesRef.current);
    if (musicStateTimestamp(restoredMusic) >= musicStateTimestamp(musicStateRef.current)) {
      musicStateRef.current = restoredMusic;
      setMusicState(restoredMusic);
    }
    setCombatPresence(normalizeCombatPresenceState(nextPresence));
  }, []);

  useEffect(() => {
    void hydrate();
    let closed = false;
    let refreshTimer: number | null = null;
    const scheduleHydrate = () => {
      if (closed) return;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        if (!closed) void hydrate();
      }, 120);
    };
    const interval = window.setInterval(() => {
      if (!closed) void hydrate();
    }, 2500);
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel("combat-page-state")
        .on("postgres_changes", { event: "*", schema: "public", table: "app_arcade_catalog_state", filter: "id=eq.combat-state" }, scheduleHydrate)
        .on("postgres_changes", { event: "*", schema: "public", table: "app_arcade_catalog_state", filter: "id=eq.combat-music-state" }, scheduleHydrate)
        .on("postgres_changes", { event: "*", schema: "public", table: "app_arcade_catalog_state", filter: "id=eq.combat-presence-state" }, scheduleHydrate)
        .subscribe();
    } catch {
      channel = null;
    }

    return () => {
      closed = true;
      window.clearInterval(interval);
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      if (channel) removeSupabaseChannelSafely(channel);
    };
  }, [hydrate]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [combatState.messages.length]);

  useEffect(() => {
    if (!sceneDraftDirty) setSceneDraft(combatState.scene || "");
  }, [combatState.scene, sceneDraftDirty]);

  useEffect(() => {
    musicState.tracks.forEach((track) => {
      if (
        track.sourceType !== "file" ||
        track.url ||
        !track.sharedAudio ||
        sharedAudioLoadingRef.current.has(track.id) ||
        sharedAudioFailedRef.current.has(track.id)
      ) {
        return;
      }

      sharedAudioLoadingRef.current.add(track.id);
      void loadCachedAudioSource(track.id)
        .then((cachedUrl) => cachedUrl || loadSharedAudioData(track))
        .then((url) => {
          if (!url) {
            sharedAudioFailedRef.current.add(track.id);
            return;
          }
          localAudioSourcesRef.current.set(track.id, url);
          void cacheLocalAudioSource(track.id, url);
          setMusicState((previous) => {
            const nextState = {
              ...previous,
              tracks: previous.tracks.map((entry) => (
                entry.id === track.id
                  ? { ...entry, url, audioDataOmitted: false }
                  : entry
              )),
            };
            musicStateRef.current = nextState;
            safeSetJson(LOCAL_MUSIC_STATE_KEY, buildLocalMusicCacheState(nextState));
            return nextState;
          });
        })
        .catch(() => {
          sharedAudioFailedRef.current.add(track.id);
        })
        .finally(() => {
          sharedAudioLoadingRef.current.delete(track.id);
        });
    });
  }, [musicState.tracks]);

  useEffect(() => {
    const trackIds = new Set(musicState.tracks.map((track) => track.id));
    setPlaybackStatuses((previous) => {
      const next = Object.fromEntries(Object.entries(previous).filter(([trackId]) => trackIds.has(trackId)));
      return Object.keys(next).length === Object.keys(previous).length ? previous : next;
    });
    setSeekDrafts((previous) => {
      const next = Object.fromEntries(Object.entries(previous).filter(([trackId]) => trackIds.has(trackId)));
      return Object.keys(next).length === Object.keys(previous).length ? previous : next;
    });
  }, [musicState.tracks]);

  const enableCombatAudio = useCallback(() => {
    setAudioEnabled(true);
    const context = getSharedAudioContext();
    if (context?.state === "suspended") {
      void context.resume().catch(() => {});
    }
  }, []);

  const updateLocalMusicVolume = useCallback((value: number) => {
    const nextVolume = clampNumber(value, 0, 1.5);
    setLocalMusicVolume(nextVolume);
    safeSetJson(LOCAL_PLAYER_MUSIC_VOLUME_KEY, nextVolume);
  }, []);

  const handlePlaybackStatus = useCallback((trackId: string, patch: Partial<PlaybackStatus>) => {
    setPlaybackStatuses((previous) => {
      const current = previous[trackId] || { currentTime: 0, duration: 0, paused: true, waiting: false };
      const next = { ...current, ...patch };
      if (
        current.currentTime === next.currentTime &&
        current.duration === next.duration &&
        current.paused === next.paused &&
        current.waiting === next.waiting &&
        current.error === next.error
      ) {
        return previous;
      }
      return { ...previous, [trackId]: next };
    });
  }, []);

  const publishCombatPresence = useCallback(async () => {
    if (!currentUser) return;
    const userId = currentUserId || currentUser;
    const now = new Date().toISOString();
    const loadedTrackIds = musicState.tracks.filter((track) => track.sourceType !== "file" || Boolean(track.url)).map((track) => track.id);
    const missingTrackIds = musicState.tracks.filter((track) => track.sourceType === "file" && !track.url).map((track) => track.id);
    const activeTrackIds = musicState.active.filter((entry) => entry.playing).map((entry) => entry.trackId);
    const remote = await appStore
      .loadCombatPresenceState<CombatPresenceState>(DEFAULT_COMBAT_PRESENCE_STATE)
      .catch(() => safeGetJson<CombatPresenceState>(LOCAL_COMBAT_PRESENCE_KEY, DEFAULT_COMBAT_PRESENCE_STATE));
    const normalized = normalizeCombatPresenceState(remote);
    const nextUsers: Record<string, CombatPresenceUser> = {};
    Object.values(normalized.users).forEach((user) => {
      if (isPresenceFresh(user) || user.userId === userId) nextUsers[user.userId] = user;
    });
    nextUsers[userId] = {
      userId,
      name: currentUser,
      isDM,
      audioEnabled,
      localVolume: localMusicVolume,
      activeTab,
      loadedTrackIds,
      missingTrackIds,
      activeTrackIds,
      lastSeen: now,
    };
    const nextPresence = { users: nextUsers, updatedAt: now };
    setCombatPresence(nextPresence);
    safeSetJson(LOCAL_COMBAT_PRESENCE_KEY, nextPresence);
    await appStore.saveCombatPresenceState(nextPresence).catch(() => {});
  }, [activeTab, audioEnabled, currentUser, currentUserId, isDM, localMusicVolume, musicState.active, musicState.tracks]);

  useEffect(() => {
    void publishCombatPresence();
    const interval = window.setInterval(() => void publishCombatPresence(), 10000);
    return () => window.clearInterval(interval);
  }, [publishCombatPresence]);

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

  const runMusicPersistLoop = useCallback(async () => {
    if (musicPersistLoopRef.current) return musicPersistLoopRef.current;

    const loop = (async () => {
      while (musicPersistRequestedRef.current) {
        musicPersistRequestedRef.current = false;
        const resolvers = musicPersistResolversRef.current.splice(0);
        const stateToSave = musicStateRef.current;
        let saved = false;

        try {
          await appStore.saveCombatMusicState(buildSharedMusicState(stateToSave));
          musicLoadFailuresRef.current = 0;
          musicLoadRetryAtRef.current = 0;
          saved = true;
        } catch (error) {
          console.warn("[combat music] shared save failed", error);
          musicLoadFailuresRef.current = Math.max(musicLoadFailuresRef.current, 3);
          musicLoadRetryAtRef.current = Date.now() + 30000;
        }

        resolvers.forEach((resolve) => resolve(saved));
      }
    })().finally(() => {
      musicPersistLoopRef.current = null;
      if (musicPersistRequestedRef.current) void runMusicPersistLoop();
    });

    musicPersistLoopRef.current = loop;
    return loop;
  }, []);

  const queueMusicPersist = useCallback(() => (
    new Promise<boolean>((resolve) => {
      musicPersistResolversRef.current.push(resolve);
      musicPersistRequestedRef.current = true;
      void runMusicPersistLoop();
    })
  ), [runMusicPersistLoop]);

  const saveMusic = useCallback(async (nextState: CombatMusicState) => {
    const normalized = normalizeMusicState({ ...nextState, updatedAt: new Date().toISOString() });
    rememberLocalAudioSources(normalized, localAudioSourcesRef.current);
    musicStateRef.current = normalized;
    setMusicState(normalized);
    safeSetJson(LOCAL_MUSIC_STATE_KEY, buildLocalMusicCacheState(normalized));
    return queueMusicPersist();
  }, [queueMusicPersist]);

  const saveLatestMusic = useCallback(async (buildNextState: (current: CombatMusicState) => CombatMusicState) => (
    saveMusic(buildNextState(musicStateRef.current))
  ), [saveMusic]);

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
  const queuedTracks = useMemo(() => (
    musicState.queue
      .map((queued) => {
        const track = musicState.tracks.find((entry) => entry.id === queued.trackId);
        return track ? { queued, track } : null;
      })
      .filter((entry): entry is { queued: QueuedMusicTrack; track: MusicTrack } => Boolean(entry))
  ), [musicState.queue, musicState.tracks]);
  const onlinePresence = useMemo(
    () => Object.values(combatPresence.users)
      .filter(isPresenceFresh)
      .sort((a, b) => Number(b.isDM) - Number(a.isDM) || a.name.localeCompare(b.name)),
    [combatPresence.users],
  );
  const musicTags = useMemo(() => (
    Array.from(new Set(musicState.tracks.flatMap((track) => track.tags || [])))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 18)
  ), [musicState.tracks]);
  const musicFolders = useMemo(() => (
    Array.from(new Set(musicState.tracks.map((track) => normalizeTrackFolder(track.folder))))
      .sort((a, b) => (a === DEFAULT_TRACK_FOLDER ? -1 : b === DEFAULT_TRACK_FOLDER ? 1 : a.localeCompare(b)))
  ), [musicState.tracks]);
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    musicState.tracks.forEach((track) => {
      const folder = normalizeTrackFolder(track.folder);
      counts.set(folder, (counts.get(folder) || 0) + 1);
    });
    return counts;
  }, [musicState.tracks]);
  const musicStorageSummary = useMemo(() => {
    const storageTracks = musicState.tracks.filter((track) => track.storageAudio);
    const fallbackTracks = musicState.tracks.filter((track) => track.sharedAudio && !track.storageAudio);
    const localOnlyTracks = musicState.tracks.filter((track) => isInlineFileAudio(track) && !track.storageAudio && !track.sharedAudio);
    const storageBytes = storageTracks.reduce((sum, track) => sum + (track.storageAudio?.sizeBytes || track.sizeBytes || 0), 0);
    const fallbackBytes = fallbackTracks.reduce((sum, track) => sum + (track.sharedAudio?.sizeBytes || track.sizeBytes || 0), 0);
    return {
      storageTracks,
      fallbackTracks,
      localOnlyTracks,
      directAudioTracks: musicState.tracks.filter((track) => track.sourceType === "audio-url"),
      youtubeTracks: musicState.tracks.filter((track) => track.sourceType === "youtube"),
      storageBytes,
      fallbackBytes,
    };
  }, [musicState.tracks]);
  const visibleTracks = useMemo(() => {
    const query = musicSearch.trim().toLowerCase();
    const byFolder = musicFolderFilter === "all"
      ? musicState.tracks
      : musicState.tracks.filter((track) => normalizeTrackFolder(track.folder) === musicFolderFilter);
    const filtered = query
      ? byFolder.filter((track) => {
          const haystack = [
            track.title,
            sourceLabel(track),
            track.fileName || "",
            normalizeTrackFolder(track.folder),
            track.notes || "",
            ...(track.tags || []),
          ].join(" ").toLowerCase();
          return haystack.includes(query);
        })
      : byFolder;

    return [...filtered].sort((a, b) => {
      if (musicSort === "title") return a.title.localeCompare(b.title);
      if (musicSort === "source") return sourceLabel(a).localeCompare(sourceLabel(b)) || a.title.localeCompare(b.title);
      if (musicSort === "folder") return normalizeTrackFolder(a.folder).localeCompare(normalizeTrackFolder(b.folder)) || a.title.localeCompare(b.title);
      if (musicSort === "tag") return (a.tags?.[0] || "").localeCompare(b.tags?.[0] || "") || a.title.localeCompare(b.title);
      return (Date.parse(b.updatedAt || b.createdAt || "") || 0) - (Date.parse(a.updatedAt || a.createdAt || "") || 0);
    });
  }, [musicFolderFilter, musicSearch, musicSort, musicState.tracks]);
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
    await saveLatestMusic((current) => ({
      ...current,
      tracks: current.tracks.map((track) => (
        track.id === trackId
          ? { ...track, ...patch, updatedAt: new Date().toISOString() }
          : track
      )),
    }));
  };

  const exportMusicLibrary = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      tracks: buildSharedMusicState(musicState).tracks,
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
    setMusicStatus("Music library metadata exported.");
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
      await saveLatestMusic((current) => ({ ...current, tracks: [...current.tracks, ...importedTracks] }));
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
      folder: DEFAULT_TRACK_FOLDER,
      tags: [],
      notes: "",
    };
    setMusicUrl("");
    setMusicTitle("");
    setMusicStatus(`${title} added.`);
    await saveLatestMusic((current) => ({ ...current, tracks: [...current.tracks, nextTrack] }));
  };

  const addFileTrack = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setMusicUploadProgress(null);
      setMusicStatus("Choose an audio file.");
      return;
    }
    if (file.size > MAX_STORAGE_AUDIO_FILE_BYTES) {
      setMusicUploadProgress(null);
      setMusicStatus(`That file is ${formatAudioBytes(file.size)}. Keep uploads under ${formatAudioBytes(MAX_STORAGE_AUDIO_FILE_BYTES)} for this Storage uploader.`);
      return;
    }

    const cleanName = file.name.replace(/\.[^.]+$/, "") || "Uploaded Track";
    const trackId = uid("track");
    let trackUrl = "";
    let storageAudio: CombatMusicStorageRef | undefined;
    let sharedAudio: SharedAudioRef | undefined;
    let storageSaved = false;
    let sharedAudioSaved = false;

    try {
      try {
        setMusicUploadProgress({ label: file.name, percent: 8, phase: "uploading" });
        setMusicStatus(`Uploading ${file.name} to Supabase Storage...`);
        storageAudio = await uploadCombatMusicFileToStorage(trackId, file, (percent) => {
          setMusicUploadProgress({
            label: file.name,
            percent: clampNumber(percent * 0.8, 8, 88),
            phase: "uploading",
          });
        });
        trackUrl = storageAudio.publicUrl;
        storageSaved = true;
        setMusicUploadProgress({ label: cleanName, percent: 88, phase: "saving" });
      } catch (storageError) {
        console.warn("[combat music] Supabase Storage upload failed", storageError);
        if (file.size > MAX_SHARED_AUDIO_FILE_BYTES) {
          setMusicUploadProgress(null);
          setMusicStatus(storageSetupHint(storageError));
          return;
        }

        setMusicUploadProgress({ label: file.name, percent: 0, phase: "reading" });
        setMusicStatus(`${storageSetupHint(storageError)} Using the smaller shared-data fallback for this upload...`);
        trackUrl = await fileToDataUrl(file, (percent) => {
          setMusicUploadProgress({
            label: file.name,
            percent: clampNumber(percent, 0, 90),
            phase: "reading",
          });
        });
        void cacheLocalAudioSource(trackId, trackUrl);

        try {
          setMusicUploadProgress({ label: cleanName, percent: 91, phase: "saving" });
          setMusicStatus(`Sharing ${cleanName} with players through the fallback path...`);
          sharedAudio = await saveSharedAudioData(trackId, trackUrl, file, (percent) => {
            setMusicUploadProgress({
              label: cleanName,
              percent: clampNumber(91 + Math.round(percent * 0.07), 91, 98),
              phase: "saving",
            });
          });
          sharedAudioSaved = true;
        } catch (error) {
          console.warn("[combat music] shared audio upload failed", error);
        }
      }

      const nextTrack: MusicTrack = {
        id: trackId,
        title: cleanName,
        sourceType: "file",
        url: trackUrl,
        fileName: file.name,
        contentType: file.type || "audio/*",
        sizeBytes: file.size,
        sharedAudio,
        storageAudio,
        addedBy: currentUser || "DM",
        createdAt: new Date().toISOString(),
        folder: DEFAULT_TRACK_FOLDER,
        tags: [],
        notes: "",
      };
      setMusicUploadProgress({ label: cleanName, percent: 95, phase: "saving" });
      setMusicStatus(`Saving ${cleanName}...`);
      const sharedSaved = await saveLatestMusic((current) => ({ ...current, tracks: [...current.tracks, nextTrack] }));
      setMusicUploadProgress({ label: cleanName, percent: 100, phase: "saving" });
      setMusicStatus(
        storageSaved && sharedSaved
          ? `${cleanName} uploaded to Supabase Storage and shared with players.`
          : storageSaved
            ? `${cleanName} uploaded to Supabase Storage, but the shared track list did not save yet.`
            : sharedSaved && sharedAudioSaved
              ? `${cleanName} uploaded through the fallback path and shared with players.`
              : sharedAudioSaved
                ? `${cleanName} uploaded here, but the shared track list did not save yet.`
                : `${cleanName} is available in this browser, but the shared audio copy failed. Try Supabase Storage again or use a direct audio URL.`,
      );
      window.setTimeout(() => {
        setMusicUploadProgress((current) => current?.label === cleanName ? null : current);
      }, 1200);
    } catch (error) {
      setMusicUploadProgress(null);
      setMusicStatus(error instanceof Error ? error.message : "Failed to read audio file.");
    }
  };

  const shareExistingTrackAudio = async (track: MusicTrack) => {
    if (!isDM || !isInlineFileAudio(track)) return;
    try {
      void cacheLocalAudioSource(track.id, track.url);
      try {
        setMusicUploadProgress({ label: track.title, percent: 8, phase: "uploading" });
        setMusicStatus(`Uploading ${track.title} to Supabase Storage...`);
        const blob = await dataUrlToBlob(track.url);
        const file = new File([blob], track.fileName || `${track.title || "audio"}.mp3`, {
          type: track.contentType || blob.type || "audio/mpeg",
        });
        const storageAudio = await uploadCombatMusicFileToStorage(track.id, file, (percent) => {
          setMusicUploadProgress({
            label: file.name,
            percent: clampNumber(percent * 0.8, 8, 88),
            phase: "uploading",
          });
        });
        await updateMusicTrack(track.id, {
          url: storageAudio.publicUrl,
          storageAudio,
          audioDataOmitted: false,
        });
        setMusicUploadProgress({ label: track.title, percent: 100, phase: "saving" });
        setMusicStatus(`${track.title} saved to Supabase Storage and shared with players.`);
        window.setTimeout(() => {
          setMusicUploadProgress((current) => current?.label === track.title ? null : current);
        }, 1200);
        return;
      } catch (storageError) {
        console.warn("[combat music] Supabase Storage share failed", storageError);
        setMusicStatus(`${storageSetupHint(storageError)} Using the smaller shared-data fallback...`);
      }

      setMusicUploadProgress({ label: track.title, percent: 91, phase: "saving" });
      setMusicStatus(`Sharing ${track.title} with players through the fallback path...`);
      const sharedAudio = await saveSharedAudioData(
        track.id,
        track.url,
        { type: track.contentType || "audio/*", size: track.sizeBytes || track.url.length },
        (percent) => {
          setMusicUploadProgress({
            label: track.title,
            percent: clampNumber(91 + Math.round(percent * 0.07), 91, 98),
            phase: "saving",
          });
        },
      );
      await updateMusicTrack(track.id, { sharedAudio });
      setMusicUploadProgress({ label: track.title, percent: 100, phase: "saving" });
      setMusicStatus(`${track.title} shared with players through the fallback path.`);
      window.setTimeout(() => {
        setMusicUploadProgress((current) => current?.label === track.title ? null : current);
      }, 1200);
    } catch (error) {
      setMusicUploadProgress(null);
      setMusicStatus(error instanceof Error ? error.message : "Failed to share this audio with players.");
    }
  };

  const upsertActiveTrack = async (trackId: string, patch: Partial<ActiveMusicTrack>) => {
    const sourceState = musicStateRef.current;
    const existing = sourceState.active.find((entry) => entry.trackId === trackId);
    const nextActive = existing
      ? sourceState.active.map((entry) => entry.trackId === trackId ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry)
      : [
          ...sourceState.active,
          {
            trackId,
            layer: normalizeMusicLayer(patch.layer),
            playing: true,
            volume: 0.65,
            loop: false,
            muted: false,
            effects: DEFAULT_AUDIO_EFFECTS,
            position: 0,
            positionUpdatedAt: Date.now(),
            startedAt: Date.now(),
            updatedAt: new Date().toISOString(),
            ...patch,
          },
        ];
    await saveMusic({ ...sourceState, active: nextActive });
  };

  const playTrackOnLayer = async (trackId: string, layer: MusicLayerId, sourceState = musicStateRef.current, queueIdToRemove = "") => {
    enableCombatAudio();
    const now = Date.now();
    const updatedAt = new Date().toISOString();
    const crossfadeSeconds = clampNumber(sourceState.crossfadeSeconds ?? DEFAULT_MUSIC_STATE.crossfadeSeconds, 0, 20);
    const existing = sourceState.active.find((entry) => entry.trackId === trackId);
    const nextEntry: ActiveMusicTrack = {
      trackId,
      layer,
      playing: true,
      volume: existing?.volume ?? 0.65,
      loop: existing?.loop ?? false,
      muted: existing?.muted ?? false,
      effects: normalizeAudioEffects(existing?.effects),
      fadeInStartedAt: crossfadeSeconds > 0 ? now : undefined,
      fadeInSeconds: crossfadeSeconds > 0 ? crossfadeSeconds : undefined,
      position: 0,
      positionUpdatedAt: now,
      startedAt: now,
      updatedAt,
    };
    const nextActive = sourceState.active
      .filter((entry) => entry.trackId !== trackId && !(entry.layer === layer && crossfadeSeconds <= 0))
      .map((entry) => (
        entry.layer === layer && entry.playing && crossfadeSeconds > 0
          ? { ...entry, fadeOutStartedAt: now, fadeOutSeconds: crossfadeSeconds, updatedAt }
          : entry.layer === layer
            ? { ...entry, playing: false, updatedAt }
            : entry
      ));
    await saveMusic({
      ...sourceState,
      active: [...nextActive, nextEntry],
      queue: sourceState.queue.filter((entry) => entry.id !== queueIdToRemove),
    });
  };

  const queueTrackOnLayer = async (trackId: string, layer: MusicLayerId) => {
    await saveLatestMusic((current) => ({
      ...current,
      queue: [
        ...current.queue,
        { id: uid("queue"), trackId, layer, addedAt: new Date().toISOString() },
      ].slice(-20),
    }));
  };

  const removeQueuedTrack = async (queueId: string) => {
    await saveLatestMusic((current) => ({ ...current, queue: current.queue.filter((entry) => entry.id !== queueId) }));
  };

  const startQueuedTrack = async (queueId: string) => {
    const sourceState = musicStateRef.current;
    const queued = sourceState.queue.find((entry) => entry.id === queueId);
    if (!queued) return;
    await playTrackOnLayer(queued.trackId, queued.layer, sourceState, queueId);
  };

  const handleTrackEnded = async (trackId: string) => {
    if (!isDM) return;
    const sourceState = musicStateRef.current;
    const active = sourceState.active.find((entry) => entry.trackId === trackId);
    if (!active || active.loop) return;
    const layer = normalizeMusicLayer(active.layer);
    const queued = sourceState.queue.find((entry) => entry.layer === layer);
    if (queued) {
      await playTrackOnLayer(queued.trackId, queued.layer, sourceState, queued.id);
      return;
    }
    await saveLatestMusic((current) => ({ ...current, active: current.active.filter((entry) => entry.trackId !== trackId) }));
  };

  const fadeTrack = async (trackId: string, direction: "in" | "out") => {
    const now = Date.now();
    const seconds = clampNumber(musicStateRef.current.crossfadeSeconds || 4, 1, 20);
    await saveLatestMusic((current) => ({
      ...current,
      muted: direction === "in" ? false : current.muted,
      active: current.active.map((entry) => (
        entry.trackId === trackId
          ? {
              ...entry,
              playing: true,
              muted: direction === "in" ? false : entry.muted,
              fadeInStartedAt: direction === "in" ? now : undefined,
              fadeInSeconds: direction === "in" ? seconds : undefined,
              fadeOutStartedAt: direction === "out" ? now : undefined,
              fadeOutSeconds: direction === "out" ? seconds : undefined,
              updatedAt: new Date().toISOString(),
            }
          : entry
      )),
    }));
  };

  const fadeAllTracks = async (direction: "in" | "out") => {
    const now = Date.now();
    const seconds = clampNumber(musicStateRef.current.crossfadeSeconds || 4, 1, 20);
    await saveLatestMusic((current) => ({
      ...current,
      muted: direction === "in" ? false : current.muted,
      active: current.active.map((entry) => ({
        ...entry,
        playing: true,
        muted: direction === "in" ? false : entry.muted,
        fadeInStartedAt: direction === "in" ? now : undefined,
        fadeInSeconds: direction === "in" ? seconds : undefined,
        fadeOutStartedAt: direction === "out" ? now : undefined,
        fadeOutSeconds: direction === "out" ? seconds : undefined,
        updatedAt: new Date().toISOString(),
      })),
    }));
  };

  const panicMuteMusic = async () => {
    await saveLatestMusic((current) => ({
      ...current,
      muted: true,
      active: current.active.map((entry) => ({
        ...entry,
        playing: false,
        muted: true,
        fadeInStartedAt: undefined,
        fadeInSeconds: undefined,
        fadeOutStartedAt: undefined,
        fadeOutSeconds: undefined,
        updatedAt: new Date().toISOString(),
      })),
    }));
    setMusicStatus("Panic mute engaged. All active tracks are paused and muted.");
  };

  useEffect(() => {
    const timers = musicState.active
      .filter((entry) => entry.fadeOutStartedAt && entry.fadeOutSeconds && Date.now() - entry.fadeOutStartedAt < entry.fadeOutSeconds * 1000)
      .map((entry) => {
        const remaining = Math.max(100, (entry.fadeOutStartedAt! + entry.fadeOutSeconds! * 1000) - Date.now());
        return window.setTimeout(() => {
          void saveLatestMusic((current) => ({
            ...current,
            active: current.active.filter((active) => active.trackId !== entry.trackId),
          }));
        }, remaining);
      });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [musicState, saveLatestMusic]);

  const updateTrackEffects = async (trackId: string, patch: Partial<AudioEffectSettings>) => {
    const existing = musicStateRef.current.active.find((entry) => entry.trackId === trackId);
    await upsertActiveTrack(trackId, {
      playing: existing?.playing ?? false,
      effects: {
        ...normalizeAudioEffects(existing?.effects),
        ...patch,
      },
    });
  };

  const toggleTrackPlayback = async (trackId: string) => {
    const existing = activeById.get(trackId);
    const nextPlaying = !existing?.playing;
    const currentPosition = playbackStatuses[trackId]?.currentTime ?? existing?.position ?? existing?.seekTo ?? 0;
    if (nextPlaying) enableCombatAudio();
    await upsertActiveTrack(trackId, {
      layer: normalizeMusicLayer(existing?.layer),
      playing: nextPlaying,
      position: Math.max(0, currentPosition),
      positionUpdatedAt: Date.now(),
      startedAt: existing?.startedAt || Date.now(),
    });
  };

  const commitTrackSeek = async (trackId: string, rawSeconds: number) => {
    const status = playbackStatuses[trackId];
    const duration = status?.duration || 0;
    const seconds = duration > 0 ? clampNumber(rawSeconds, 0, duration) : Math.max(0, rawSeconds);
    const existing = activeById.get(trackId);
    setSeekDrafts((previous) => {
      const next = { ...previous };
      delete next[trackId];
      return next;
    });
    await upsertActiveTrack(trackId, {
      playing: existing?.playing ?? false,
      seekTo: seconds,
      seekRequestId: uid("seek"),
      position: seconds,
      positionUpdatedAt: Date.now(),
    });
  };

  const stopTrack = async (trackId: string) => {
    await saveLatestMusic((current) => ({ ...current, active: current.active.filter((entry) => entry.trackId !== trackId) }));
  };

  const deleteTrack = async (trackId: string) => {
    if (!isDM) return;
    const track = musicStateRef.current.tracks.find((entry) => entry.id === trackId);
    await saveLatestMusic((current) => ({
      ...current,
      tracks: current.tracks.filter((track) => track.id !== trackId),
      active: current.active.filter((entry) => entry.trackId !== trackId),
    }));
    localAudioSourcesRef.current.delete(trackId);
    void deleteCachedAudioSource(trackId);
    void deleteSharedAudioData(track?.sharedAudio);
    void deleteCombatMusicFileFromStorage(track?.storageAudio).catch((error) => {
      console.warn("[combat music] Supabase Storage delete failed", error);
    });
  };

  const clearStorageBackedLocalCache = async () => {
    const storageTracks = musicStateRef.current.tracks.filter((track) => track.storageAudio);
    await Promise.all(storageTracks.map((track) => deleteCachedAudioSource(track.id)));
    setMusicStatus(`Cleared local browser cache for ${storageTracks.length} Supabase-backed track${storageTracks.length === 1 ? "" : "s"}.`);
  };

  const renderMusicTrackCard = (track: MusicTrack) => {
    const active = activeById.get(track.id);
    const effects = normalizeAudioEffects(active?.effects);
    const isAudioTrack = track.sourceType !== "youtube";
    const effectsAvailable = supportsLiveAudioEffects(track);
    const playbackStatus = playbackStatuses[track.id];
    const duration = playbackStatus?.duration || 0;
    const currentTime = clampNumber(playbackStatus?.currentTime ?? 0, 0, Math.max(duration, 0));
    const seekValue = clampNumber(seekDrafts[track.id] ?? currentTime, 0, Math.max(duration, 1));
    const playable = hasPlayableSource(track);
    const borderColor = active?.muted ? "#FF6A6A" : active?.playing ? "#4AFF7A" : "#2A355F";
    const trackKind = track.sourceType === "youtube"
      ? "YouTube link"
      : effectsAvailable
        ? "Live editable audio"
        : "Audio link";

    return (
      <div key={track.id} className={`${retro.raised} p-4`} style={{ background: "#0D1230", borderLeft: `4px solid ${borderColor}` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] truncate" style={{ color: "#D8E5FF", fontWeight: 700 }}>{track.title}</div>
            <div className="text-[10px] mt-1" style={effectsAvailable ? S_GREEN : S_DIM}>
              {trackKind} | {sourceLabel(track)}
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

        {(track.folder || track.tags?.length || track.notes) && (
          <div className="mt-2 space-y-1">
            {(track.folder || track.tags?.length) ? (
              <div className="flex flex-wrap gap-1">
                <span className="text-[9px] px-1.5 py-0.5 inline-flex items-center gap-1" style={{ color: "#FFD37A", border: "1px solid #4A3A1A", background: "#15110A" }}>
                  <Folder size={9} /> {normalizeTrackFolder(track.folder)}
                </span>
                {(track.tags || []).map((tag) => (
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
            {track.storageAudio
              ? "Supabase Storage has this track, but the saved public URL is missing or blocked for this browser."
              : track.sharedAudio
              ? "Shared audio is loading for this browser. If it stays here, the shared upload may have failed."
              : "Audio data is not available in this browser. Re-upload the file here or use a direct audio URL."}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {isDM ? (
            <div style={DISPLAY_CONTENTS}>
              <button
                disabled={!playable}
                onClick={() => void toggleTrackPlayback(track.id)}
                className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1 disabled:opacity-40`}
                style={active?.playing ? S_WARN : S_GREEN}
              >
                {active?.playing ? <Pause size={12} /> : <Play size={12} />}
                {active?.playing ? "Pause" : "Play"}
              </button>
              <button disabled={!playable} onClick={() => void playTrackOnLayer(track.id, "1")} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40`} style={active?.layer === "1" ? S_ACCENT : S_MUTED}>
                Deck 1
              </button>
              <button disabled={!playable} onClick={() => void playTrackOnLayer(track.id, "2")} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40`} style={active?.layer === "2" ? S_ACCENT : S_MUTED}>
                Deck 2
              </button>
              <button disabled={!playable} onClick={() => void queueTrackOnLayer(track.id, "1")} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40`} style={S_DIM}>
                Queue 1
              </button>
              <button disabled={!playable} onClick={() => void queueTrackOnLayer(track.id, "2")} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40`} style={S_DIM}>
                Queue 2
              </button>
              <button onClick={() => void stopTrack(track.id)} disabled={!active} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1 disabled:opacity-40`} style={S_RED}>
                <Square size={11} /> Stop
              </button>
              <button onClick={() => void fadeTrack(track.id, "in")} disabled={!active} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40`} style={S_GREEN}>
                Fade In
              </button>
              <button onClick={() => void fadeTrack(track.id, "out")} disabled={!active} className={`${retro.button} px-3 py-2 text-[11px] disabled:opacity-40`} style={S_DIM}>
                Fade Out
              </button>
              <button
                onClick={() => void upsertActiveTrack(track.id, { loop: !active?.loop })}
                className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1`}
                style={active?.loop ? S_ACCENT : S_MUTED}
              >
                <RotateCcw size={11} /> Loop
              </button>
              <button
                onClick={() => void upsertActiveTrack(track.id, { muted: !active?.muted })}
                disabled={!active}
                className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1 disabled:opacity-40`}
                style={active?.muted ? S_RED : S_MUTED}
              >
                {active?.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                {active?.muted ? "Muted" : "Mute"}
              </button>
              {isInlineFileAudio(track) && !track.sharedAudio && !track.storageAudio && (
                <button
                  onClick={() => void shareExistingTrackAudio(track)}
                  className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-1`}
                  style={S_ACCENT}
                >
                  <Upload size={11} /> Share
                </button>
              )}
            </div>
          ) : (
            <div className="text-[11px]" style={active?.muted ? S_RED : active?.playing ? S_GREEN : S_DIM}>
              {active?.muted ? "Muted" : active?.playing ? "Playing" : active ? "Paused" : "Inactive"}{active?.loop ? " | Loop" : ""}
            </div>
          )}
        </div>

        <div className="mt-3 p-2" style={{ background: "#070B22", border: "1px solid #172044" }}>
          <div className="flex items-center justify-between gap-3 text-[10px] mb-1" style={S_DIM}>
            <span>
              {playbackStatus?.waiting ? "Buffering" : active?.playing ? "Playing" : active ? "Paused" : "Ready"}
            </span>
            <span>
              {formatPlaybackTime(seekValue)} / {duration > 0 ? formatPlaybackTime(duration) : "--:--"}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.ceil(duration || 1))}
            step={1}
            value={Math.round(seekValue)}
            disabled={!isDM || !playable || duration <= 0}
            onChange={(event) => {
              const value = parseFloat(event.target.value);
              setSeekDrafts((previous) => ({ ...previous, [track.id]: value }));
            }}
            onMouseUp={(event) => void commitTrackSeek(track.id, parseFloat(event.currentTarget.value))}
            onTouchEnd={(event) => void commitTrackSeek(track.id, parseFloat(event.currentTarget.value))}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) {
                void commitTrackSeek(track.id, parseFloat(event.currentTarget.value));
              }
            }}
            onBlur={(event) => {
              if (seekDrafts[track.id] !== undefined) void commitTrackSeek(track.id, parseFloat(event.currentTarget.value));
            }}
            className="w-full"
          />
          {playbackStatus?.error && (
            <div className="text-[9px] mt-1 leading-relaxed" style={S_RED}>{playbackStatus.error}</div>
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
            onChange={(event) => void upsertActiveTrack(track.id, { volume: parseInt(event.target.value, 10) / 100 })}
            className="flex-1"
          />
          <span className="text-[10px] w-9 text-right" style={S_DIM}>{Math.round((active?.volume ?? 0.65) * 100)}%</span>
        </div>

        {isDM && isAudioTrack && (
          effectsAvailable ? (
            <AudioEffectsControls
              effects={effects}
              onChange={(patch) => void updateTrackEffects(track.id, patch)}
              onReset={() => void updateTrackEffects(track.id, DEFAULT_AUDIO_EFFECTS)}
            />
          ) : (
            <div className="mt-3 text-[10px] leading-relaxed" style={S_DIM}>
              Live effects are available for uploaded audio files. Direct audio links play normally but may block browser effects.
            </div>
          )
        )}

        {!isAudioTrack && (
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
              defaultValue={normalizeTrackFolder(track.folder)}
              onBlur={(event) => void updateMusicTrack(track.id, { folder: normalizeTrackFolder(event.target.value) })}
              placeholder="Folder: Boss, Ambience, Town"
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
      <AudioPlaybackLayer musicState={musicState} audioEnabled={audioEnabled} localVolume={localMusicVolume} onStatus={handlePlaybackStatus} onEnded={(trackId) => void handleTrackEnded(trackId)} />

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
                        onClick={() => void saveLatestMusic((current) => ({ ...current, muted: !current.muted }))}
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
                        onChange={(event) => void saveLatestMusic((current) => ({ ...current, masterVolume: parseInt(event.target.value, 10) / 100, muted: false }))}
                        className="flex-1"
                      />
                      <span className="text-[10px] w-9 text-right" style={S_DIM}>{Math.round((musicState.masterVolume ?? 0.85) * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[9px] w-16" style={S_DIM}>My Volume</span>
                      <input
                        type="range"
                        min={0}
                        max={150}
                        value={Math.round(localMusicVolume * 100)}
                        onChange={(event) => updateLocalMusicVolume(parseInt(event.target.value, 10) / 100)}
                        className="flex-1"
                      />
                      <span className="text-[10px] w-9 text-right" style={S_DIM}>{Math.round(localMusicVolume * 100)}%</span>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[9px] mb-1" style={S_DIM}>
                        <span>Crossfade</span>
                        <span>{Math.round(musicState.crossfadeSeconds ?? 0)}s</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={20}
                        value={Math.round(musicState.crossfadeSeconds ?? 0)}
                        onChange={(event) => void saveLatestMusic((current) => ({ ...current, crossfadeSeconds: parseInt(event.target.value, 10) }))}
                        className="w-full"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button onClick={() => void panicMuteMusic()} className={`${retro.button} px-2 py-2 text-[10px] flex items-center justify-center gap-1`} style={S_RED}>
                        <VolumeX size={11} /> Panic Mute
                      </button>
                      <button onClick={() => void saveLatestMusic((current) => ({ ...current, muted: true }))} className={`${retro.button} px-2 py-2 text-[10px]`} style={S_WARN}>
                        Full Mute
                      </button>
                      <button disabled={musicState.active.length === 0} onClick={() => void fadeAllTracks("in")} className={`${retro.button} px-2 py-2 text-[10px] disabled:opacity-40`} style={S_GREEN}>
                        Fade In All
                      </button>
                      <button disabled={musicState.active.length === 0} onClick={() => void fadeAllTracks("out")} className={`${retro.button} px-2 py-2 text-[10px] disabled:opacity-40`} style={S_DIM}>
                        Fade Out All
                      </button>
                    </div>
                  </div>

                  <div className={`${retro.raised} p-3`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-[10px]" style={S_MUTED}>Player Audio</div>
                      <div className="text-[9px]" style={S_DIM}>{onlinePresence.length} online</div>
                    </div>
                    {onlinePresence.length === 0 ? (
                      <div className="text-[11px]" style={S_DIM}>No one is reporting from Combat yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {onlinePresence.map((user) => {
                          const activeLoaded = user.activeTrackIds.filter((trackId) => user.loadedTrackIds.includes(trackId)).length;
                          const activeMissing = user.activeTrackIds.filter((trackId) => user.missingTrackIds.includes(trackId)).length;
                          return (
                            <div key={user.userId} className="px-2 py-1.5" style={{ background: "#070B22", border: "1px solid #172044" }}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] truncate" style={user.isDM ? S_WARN : S_TEXT}>{user.name}{user.isDM ? " (DM)" : ""}</span>
                                <span className="text-[9px]" style={user.audioEnabled ? S_GREEN : S_RED}>{user.audioEnabled ? "Audio On" : "Audio Off"}</span>
                              </div>
                              <div className="text-[9px] mt-1" style={activeMissing > 0 ? S_WARN : S_DIM}>
                                {activeLoaded}/{user.activeTrackIds.length} active loaded{activeMissing > 0 ? ` | ${activeMissing} missing` : ""} | {user.activeTab} | vol {Math.round((user.localVolume ?? 1) * 100)}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
                    {musicUploadProgress && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between gap-3 text-[9px] mb-1" style={S_DIM}>
                          <span className="truncate">
                            {musicUploadProgress.phase === "reading" ? "Reading" : musicUploadProgress.phase === "uploading" ? "Uploading" : "Saving"} {musicUploadProgress.label}
                          </span>
                          <span>{Math.round(musicUploadProgress.percent)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden" style={{ background: "#05071C", border: "1px solid #172044" }}>
                          <div
                            className="h-full transition-all duration-200"
                            style={{
                              width: `${clampNumber(musicUploadProgress.percent, 0, 100)}%`,
                              background: musicUploadProgress.phase === "saving" || musicUploadProgress.phase === "uploading" ? "#FFD37A" : "#6AA8FF",
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="text-[9px] mt-2 leading-relaxed" style={S_DIM}>
                      Uploaded files save to the Supabase "{COMBAT_MUSIC_BUCKET}" bucket first. The older shared-data path is kept only as a fallback for small files.
                    </div>
                  </div>

                  <div className={`${retro.raised} p-3`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-[10px] flex items-center gap-1" style={S_MUTED}>
                        <Database size={11} /> Storage Manager
                      </div>
                      <div className="text-[9px]" style={S_DIM}>{COMBAT_MUSIC_BUCKET}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <CombatStat label="Supabase" value={`${musicStorageSummary.storageTracks.length}`} color="#4AFF7A" />
                      <CombatStat label="Stored" value={formatAudioBytes(musicStorageSummary.storageBytes)} color="#FFD37A" />
                      <CombatStat label="Fallback" value={`${musicStorageSummary.fallbackTracks.length}`} color={musicStorageSummary.fallbackTracks.length ? "#FFAA4A" : "#8AB4FF"} />
                      <CombatStat label="Local Only" value={`${musicStorageSummary.localOnlyTracks.length}`} color={musicStorageSummary.localOnlyTracks.length ? "#FF6A6A" : "#8AB4FF"} />
                    </div>
                    <div className="text-[9px] mt-2 leading-relaxed" style={S_DIM}>
                      {musicStorageSummary.directAudioTracks.length} direct links | {musicStorageSummary.youtubeTracks.length} YouTube links | {formatAudioBytes(musicStorageSummary.fallbackBytes)} fallback data
                    </div>
                    <button onClick={() => void clearStorageBackedLocalCache()} className={`${retro.button} px-3 py-2 text-[10px] mt-3 w-full`} style={S_MUTED}>
                      Clear Local Audio Cache
                    </button>
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
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[9px] mb-1" style={S_DIM}>
                        <span>My Volume</span>
                        <span>{Math.round(localMusicVolume * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={150}
                        value={Math.round(localMusicVolume * 100)}
                        onChange={(event) => updateLocalMusicVolume(parseInt(event.target.value, 10) / 100)}
                        className="w-full"
                      />
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
                <button onClick={enableCombatAudio} className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-2`} style={audioEnabled ? S_GREEN : S_WARN}>
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
                      <option value="folder">Folder</option>
                      <option value="source">Source</option>
                      <option value="tag">Tag</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  <button
                    onClick={() => setMusicFolderFilter("all")}
                    className={`${musicFolderFilter === "all" ? retro.sunken : retro.button} px-2 py-1 text-[9px] flex items-center gap-1`}
                    style={musicFolderFilter === "all" ? S_ACCENT : S_MUTED}
                  >
                    <Folder size={10} /> All ({musicState.tracks.length})
                  </button>
                  {musicFolders.map((folder) => (
                    <button
                      key={folder}
                      onClick={() => setMusicFolderFilter(folder)}
                      className={`${musicFolderFilter === folder ? retro.sunken : retro.button} px-2 py-1 text-[9px] flex items-center gap-1`}
                      style={musicFolderFilter === folder ? S_ACCENT : S_MUTED}
                    >
                      <Folder size={10} /> {folder} ({folderCounts.get(folder) || 0})
                    </button>
                  ))}
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

              {isDM && (
                <div className={`${retro.raised} p-3 mb-4`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-[10px]" style={S_DIM}>Queue</div>
                    <div className="text-[9px]" style={S_DIM}>{queuedTracks.length} waiting</div>
                  </div>
                  {queuedTracks.length === 0 ? (
                    <div className="text-[11px]" style={S_DIM}>Use Queue 1 or Queue 2 on any track.</div>
                  ) : (
                    <div className="space-y-2">
                      {queuedTracks.map(({ queued, track }, index) => (
                        <div key={queued.id} className="flex items-center justify-between gap-2 px-2 py-1.5" style={{ background: "#070B22", border: "1px solid #172044" }}>
                          <div className="min-w-0">
                            <div className="text-[11px] truncate" style={S_TEXT}>{index + 1}. {track.title}</div>
                            <div className="text-[9px]" style={S_DIM}>Deck {queued.layer}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => void startQueuedTrack(queued.id)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_GREEN}>Start</button>
                            <button onClick={() => void removeQueuedTrack(queued.id)} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_RED}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTracks.length > 0 && (
                <div className={`${retro.raised} p-3 mb-4`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                  <div className="text-[10px] mb-2" style={S_DIM}>Live Stack</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {activeTracks.map(({ active, track }) => (
                      <div key={track.id} className="flex items-center justify-between gap-2 px-2 py-1.5" style={{ background: "#070B22", border: "1px solid #172044" }}>
                        <span className="text-[11px] truncate" style={active.muted ? S_DIM : active.playing ? S_TEXT : S_DIM}>{track.title}</span>
                        <span className="text-[10px] shrink-0" style={active.muted ? S_RED : active.playing ? S_GREEN : S_WARN}>
                          Deck {normalizeMusicLayer(active.layer)} | {active.muted ? "Muted" : active.playing ? "Playing" : "Paused"} | {active.loop ? "Loop" : "Once"} | {Math.round(active.volume * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isDM && activeTracks.length > 0 && (
                <div className={`${retro.raised} p-3 mb-4`} style={{ background: "#0D1230", borderColor: "#1A2A4B" }}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-[10px]" style={S_DIM}>Track Readiness</div>
                    <div className="text-[9px]" style={S_DIM}>{onlinePresence.filter((user) => !user.isDM).length} player browser{onlinePresence.filter((user) => !user.isDM).length === 1 ? "" : "s"}</div>
                  </div>
                  <div className="space-y-2">
                    {activeTracks.map(({ active, track }) => {
                      const listeners = onlinePresence.filter((user) => !user.isDM);
                      const readyCount = listeners.filter((user) => user.audioEnabled && user.loadedTrackIds.includes(track.id)).length;
                      return (
                        <div key={`ready-${track.id}`} className="px-2 py-2" style={{ background: "#070B22", border: "1px solid #172044" }}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[11px] truncate" style={S_TEXT}>{track.title}</span>
                            <span className="text-[9px]" style={readyCount === listeners.length && listeners.length > 0 ? S_GREEN : S_WARN}>
                              {readyCount}/{listeners.length} ready
                            </span>
                          </div>
                          {listeners.length === 0 ? (
                            <div className="text-[10px]" style={S_DIM}>No player browsers are reporting yet.</div>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {listeners.map((user) => {
                                const ready = user.audioEnabled && user.loadedTrackIds.includes(track.id);
                                const missing = user.missingTrackIds.includes(track.id);
                                const label = !user.audioEnabled ? "Off" : ready ? "Ready" : missing ? "Missing" : "Loading";
                                return (
                                  <span key={`${track.id}-${user.userId}`} className="text-[9px] px-1.5 py-0.5" style={{ color: ready ? "#4AFF7A" : !user.audioEnabled || missing ? "#FFAA4A" : "#8AB4FF", border: "1px solid #172044", background: "#05071C" }}>
                                    {user.name}: {label} {Math.round((user.localVolume ?? 1) * 100)}%
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          <div className="text-[9px] mt-1" style={S_DIM}>
                            Deck {normalizeMusicLayer(active.layer)} | {active.loop ? "Looping" : "Once"} | {active.playing ? "Playing" : "Paused"}
                          </div>
                        </div>
                      );
                    })}
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
                    title="Audio Tracks"
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
          onClick={enableCombatAudio}
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
          src={getYouTubeEmbedUrl(videoId)}
          className="w-full aspect-video"
          style={{ border: "1px solid #172044" }}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <audio controls src={track.url} crossOrigin={track.storageAudio ? "anonymous" : undefined} className="w-full" preload="metadata" />
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
        <RangeEffectSlider label="Bass" value={effects.bass} min={-12} max={12} unit=" dB" onChange={(value) => onChange({ bass: value })} />
        <RangeEffectSlider label="Mid" value={effects.mid} min={-12} max={12} unit=" dB" onChange={(value) => onChange({ mid: value })} />
        <RangeEffectSlider label="Treble" value={effects.treble} min={-12} max={12} unit=" dB" onChange={(value) => onChange({ treble: value })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
        <RangeEffectSlider label="Pitch" value={effects.pitch} min={-12} max={12} unit=" st" onChange={(value) => onChange({ pitch: value })} />
        <div>
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

function RangeEffectSlider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[9px] mb-1" style={S_DIM}>
        <span>{label}</span>
        <span>{value > 0 ? "+" : ""}{Math.round(value)}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={Math.round(value)}
        onChange={(event) => onChange(parseInt(event.target.value, 10))}
        className="w-full"
      />
    </div>
  );
}

function AudioPlaybackLayer({
  musicState,
  audioEnabled,
  localVolume,
  onStatus,
  onEnded,
}: {
  musicState: CombatMusicState;
  audioEnabled: boolean;
  localVolume: number;
  onStatus: (trackId: string, patch: Partial<PlaybackStatus>) => void;
  onEnded: (trackId: string) => void;
}) {
  const tracksById = useMemo(() => new Map(musicState.tracks.map((track) => [track.id, track])), [musicState.tracks]);
  const renderableActive = useMemo(() => {
    const seen = new Set<string>();
    return musicState.active.filter((active) => {
      const playbackKey = `${normalizeMusicLayer(active.layer)}:${active.trackId}`;
      if (seen.has(playbackKey)) return false;
      seen.add(playbackKey);
      return true;
    });
  }, [musicState.active]);
  const masterVolume = (musicState.muted ? 0 : clampNumber(musicState.masterVolume ?? 0.85, 0, 1)) * clampNumber(localVolume, 0, 1.5);
  return (
    <div style={{ position: "fixed", left: -260, top: -260, width: 240, height: 240, overflow: "hidden", opacity: 0.01, pointerEvents: "none" }}>
      {renderableActive.map((active) => {
        const track = tracksById.get(active.trackId);
        const playbackKey = `${normalizeMusicLayer(active.layer)}:${active.trackId}`;
        if (!track) return null;
        if (!hasPlayableSource(track)) return null;
        if (track.sourceType === "youtube") {
          return <HiddenYouTubeTrack key={playbackKey} track={track} active={active} audioEnabled={audioEnabled} masterVolume={masterVolume} onStatus={onStatus} onEnded={onEnded} />;
        }
        return <HiddenAudioTrack key={playbackKey} track={track} active={active} audioEnabled={audioEnabled} masterVolume={masterVolume} onStatus={onStatus} onEnded={onEnded} />;
      })}
    </div>
  );
}

interface AudioGraphNodes {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  bassEq: BiquadFilterNode;
  midEq: BiquadFilterNode;
  trebleEq: BiquadFilterNode;
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
    const bassEq = context.createBiquadFilter();
    const midEq = context.createBiquadFilter();
    const trebleEq = context.createBiquadFilter();
    const convolver = context.createConvolver();
    const dryGain = context.createGain();
    const reverbGain = context.createGain();
    const delay = context.createDelay(1.2);
    const feedbackGain = context.createGain();
    const echoGain = context.createGain();
    const outputGain = context.createGain();

    highpass.type = "highpass";
    lowpass.type = "lowpass";
    bassEq.type = "lowshelf";
    bassEq.frequency.value = 180;
    midEq.type = "peaking";
    midEq.frequency.value = 1000;
    midEq.Q.value = 0.9;
    trebleEq.type = "highshelf";
    trebleEq.frequency.value = 4200;
    convolver.buffer = buildReverbImpulse(context);
    dryGain.gain.value = 1;
    reverbGain.gain.value = 0;
    feedbackGain.gain.value = 0;
    echoGain.gain.value = 0;
    outputGain.gain.value = 1;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(bassEq);
    bassEq.connect(midEq);
    midEq.connect(trebleEq);
    trebleEq.connect(dryGain);
    dryGain.connect(outputGain);
    trebleEq.connect(convolver);
    convolver.connect(reverbGain);
    reverbGain.connect(outputGain);
    trebleEq.connect(delay);
    delay.connect(feedbackGain);
    feedbackGain.connect(delay);
    delay.connect(echoGain);
    echoGain.connect(outputGain);
    outputGain.connect(context.destination);

    return { context, source, highpass, lowpass, bassEq, midEq, trebleEq, convolver, dryGain, reverbGain, delay, feedbackGain, echoGain, outputGain };
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
    graph.bassEq,
    graph.midEq,
    graph.trebleEq,
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

function HiddenAudioTrack({
  track,
  active,
  audioEnabled,
  masterVolume,
  onStatus,
  onEnded,
}: {
  track: MusicTrack;
  active: ActiveMusicTrack;
  audioEnabled: boolean;
  masterVolume: number;
  onStatus: (trackId: string, patch: Partial<PlaybackStatus>) => void;
  onEnded: (trackId: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const graphRef = useRef<AudioGraphNodes | null>(null);
  const lastStartRef = useRef<number>(0);
  const lastSeekRequestRef = useRef<string>("");
  const lastPositionSyncRef = useRef<string>("");

  const reportStatus = useCallback((patch: Partial<PlaybackStatus> = {}) => {
    const audio = audioRef.current;
    if (!audio) return;
    onStatus(track.id, {
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      paused: audio.paused,
      waiting: false,
      error: "",
      ...patch,
    });
  }, [onStatus, track.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || graphRef.current || !supportsLiveAudioEffects(track)) return undefined;
    graphRef.current = createAudioGraph(audio);
    return () => {
      disconnectAudioGraph(graphRef.current);
      graphRef.current = null;
    };
  }, [track.id, track.sourceType, track.url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const reportReady = () => reportStatus({ waiting: false, error: "" });
    const reportWaiting = () => reportStatus({ waiting: true });
    const reportError = () => reportStatus({
      waiting: false,
      error: audio.error ? "Audio could not load. Try re-uploading it or using a different link." : "Audio playback failed.",
    });
    const reportEnded = () => {
      reportStatus({ currentTime: Number.isFinite(audio.duration) ? audio.duration : audio.currentTime, waiting: false });
      if (!active.loop) onEnded(track.id);
    };

    audio.addEventListener("loadedmetadata", reportReady);
    audio.addEventListener("durationchange", reportReady);
    audio.addEventListener("timeupdate", reportReady);
    audio.addEventListener("play", reportReady);
    audio.addEventListener("playing", reportReady);
    audio.addEventListener("pause", reportReady);
    audio.addEventListener("seeked", reportReady);
    audio.addEventListener("waiting", reportWaiting);
    audio.addEventListener("error", reportError);
    audio.addEventListener("ended", reportEnded);
    reportReady();

    return () => {
      audio.removeEventListener("loadedmetadata", reportReady);
      audio.removeEventListener("durationchange", reportReady);
      audio.removeEventListener("timeupdate", reportReady);
      audio.removeEventListener("play", reportReady);
      audio.removeEventListener("playing", reportReady);
      audio.removeEventListener("pause", reportReady);
      audio.removeEventListener("seeked", reportReady);
      audio.removeEventListener("waiting", reportWaiting);
      audio.removeEventListener("error", reportError);
      audio.removeEventListener("ended", reportEnded);
    };
  }, [active.loop, onEnded, reportStatus, track.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const graph = graphRef.current;
    const effects = normalizeAudioEffects(active.effects);
    const outputVolume = clampNumber((active.muted ? 0 : active.volume) * masterVolume * fadeMultiplierForActive(active), 0, 1);

    audio.volume = graph ? 1 : outputVolume;
    audio.loop = !!active.loop;
    audio.playbackRate = clampNumber(effects.speed * Math.pow(2, effects.pitch / 12), 0.25, 2);

    if (graph) {
      const now = graph.context.currentTime;
      graph.outputGain.gain.setTargetAtTime(outputVolume, now, 0.025);
      graph.lowpass.frequency.setTargetAtTime(lowpassFromMuffle(effects.muffle), now, 0.035);
      graph.highpass.frequency.setTargetAtTime(highpassFromThin(effects.thin), now, 0.035);
      graph.bassEq.gain.setTargetAtTime(effects.bass, now, 0.035);
      graph.midEq.gain.setTargetAtTime(effects.mid, now, 0.035);
      graph.trebleEq.gain.setTargetAtTime(effects.treble, now, 0.035);
      graph.reverbGain.gain.setTargetAtTime(effects.reverb * 0.75, now, 0.035);
      graph.delay.delayTime.setTargetAtTime(0.12 + effects.echo * 0.58, now, 0.035);
      graph.feedbackGain.gain.setTargetAtTime(effects.echo * 0.45, now, 0.035);
      graph.echoGain.gain.setTargetAtTime(effects.echo * 0.7, now, 0.035);
    }

    const positionSyncKey = `${active.positionUpdatedAt || ""}:${active.playing ? "1" : "0"}:${active.seekRequestId || ""}`;

    if (lastStartRef.current !== active.startedAt && !active.positionUpdatedAt) {
      audio.currentTime = 0;
      lastStartRef.current = active.startedAt;
    }

    if (active.positionUpdatedAt && lastPositionSyncRef.current !== positionSyncKey) {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const elapsed = active.playing ? Math.max(0, (Date.now() - active.positionUpdatedAt) / 1000) : 0;
      const targetTime = duration > 0
        ? clampNumber((active.position ?? 0) + elapsed, 0, duration)
        : Math.max(0, (active.position ?? 0) + elapsed);
      try {
        audio.currentTime = targetTime;
        lastPositionSyncRef.current = positionSyncKey;
        lastStartRef.current = active.startedAt;
        reportStatus({ currentTime: targetTime, waiting: false, error: "" });
      } catch {}
    }

    if (active.seekRequestId && lastSeekRequestRef.current !== active.seekRequestId) {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const elapsed = active.playing && active.positionUpdatedAt ? Math.max(0, (Date.now() - active.positionUpdatedAt) / 1000) : 0;
      const targetTime = duration > 0
        ? clampNumber((active.seekTo ?? 0) + elapsed, 0, duration)
        : Math.max(0, (active.seekTo ?? 0) + elapsed);
      try {
        audio.currentTime = targetTime;
        lastSeekRequestRef.current = active.seekRequestId;
        reportStatus({ currentTime: targetTime, waiting: false, error: "" });
      } catch {
        reportStatus({ error: "Could not seek this track yet. Wait for it to finish loading." });
      }
    }

    if (audioEnabled && active.playing) {
      if (graph?.context.state === "suspended") void graph.context.resume().catch(() => {});
      void audio.play()
        .then(() => reportStatus({ waiting: false, error: "" }))
        .catch(() => {
          reportStatus({
            waiting: false,
            error: "Playback was blocked. Press Enable Audio, then try Play again.",
          });
        });
    } else {
      audio.pause();
      reportStatus({ waiting: false });
    }
  }, [
    active.effects,
    active.fadeInSeconds,
    active.fadeInStartedAt,
    active.fadeOutSeconds,
    active.fadeOutStartedAt,
    active.loop,
    active.muted,
    active.playing,
    active.position,
    active.positionUpdatedAt,
    active.seekRequestId,
    active.seekTo,
    active.startedAt,
    active.volume,
    audioEnabled,
    masterVolume,
    reportStatus,
  ]);

  useEffect(() => {
    if (!hasActiveFade(active)) return undefined;
    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const graph = graphRef.current;
      const outputVolume = clampNumber((active.muted ? 0 : active.volume) * masterVolume * fadeMultiplierForActive(active), 0, 1);
      if (graph) {
        graph.outputGain.gain.setTargetAtTime(outputVolume, graph.context.currentTime, 0.025);
      } else {
        audio.volume = outputVolume;
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [active, masterVolume]);

  return <audio ref={audioRef} src={track.url} crossOrigin={track.storageAudio ? "anonymous" : undefined} preload="auto" />;
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

function HiddenYouTubeTrack({
  track,
  active,
  audioEnabled,
  masterVolume,
  onStatus,
  onEnded,
}: {
  track: MusicTrack;
  active: ActiveMusicTrack;
  audioEnabled: boolean;
  masterVolume: number;
  onStatus: (trackId: string, patch: Partial<PlaybackStatus>) => void;
  onEnded: (trackId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountIdRef = useRef(uid("yt"));
  const playerRef = useRef<any>(null);
  const activeRef = useRef(active);
  const masterVolumeRef = useRef(masterVolume);
  const audioEnabledRef = useRef(audioEnabled);
  const onStatusRef = useRef(onStatus);
  const onEndedRef = useRef(onEnded);
  const lastSeekRequestRef = useRef<string>("");
  const lastPositionSyncRef = useRef<string>("");
  const videoId = getYouTubeVideoId(track.url);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    masterVolumeRef.current = masterVolume;
  }, [masterVolume]);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    void ensureYouTubeApi().then(() => {
      const container = containerRef.current;
      if (cancelled || playerRef.current || !container) return;
      const YT = (window as any).YT;
      container.replaceChildren();
      const playerMount = document.createElement("div");
      playerMount.id = mountIdRef.current;
      container.appendChild(playerMount);
      const origin = getBrowserOrigin();
      playerRef.current = new YT.Player(playerMount, {
        host: YOUTUBE_EMBED_HOST,
        width: "220",
        height: "220",
        videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          modestbranding: 1,
          ...(origin ? { origin } : {}),
          playsinline: 1,
          rel: 0,
          loop: 0,
          playlist: videoId,
        },
        events: {
          onReady: (event: any) => {
            const latest = activeRef.current;
            event.target.setVolume(Math.round(clampNumber((latest.muted ? 0 : latest.volume) * masterVolumeRef.current * fadeMultiplierForActive(latest), 0, 1) * 100));
            onStatusRef.current(track.id, {
              currentTime: Number(event.target.getCurrentTime?.() || 0),
              duration: Number(event.target.getDuration?.() || 0),
              paused: !latest.playing,
              waiting: false,
              error: "",
            });
            if (audioEnabledRef.current && latest.playing) event.target.playVideo();
          },
          onStateChange: (event: any) => {
            onStatusRef.current(track.id, {
              currentTime: Number(event.target.getCurrentTime?.() || 0),
              duration: Number(event.target.getDuration?.() || 0),
              paused: event.data !== 1,
              waiting: event.data === 3,
              error: "",
            });
            if (event.data === 0 && activeRef.current.loop) event.target.playVideo();
            else if (event.data === 0) onEndedRef.current(track.id);
          },
          onError: () => {
            onStatusRef.current(track.id, {
              currentTime: 0,
              duration: 0,
              paused: true,
              waiting: false,
              error: "YouTube could not play this link. Try opening the preview or using another link.",
            });
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
      try {
        containerRef.current?.replaceChildren();
      } catch {
        if (containerRef.current) containerRef.current.textContent = "";
      }
    };
  }, [track.id, videoId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player?.getCurrentTime) return;
      try {
        onStatusRef.current(track.id, {
          currentTime: Number(player.getCurrentTime() || 0),
          duration: Number(player.getDuration?.() || 0),
          paused: !activeRef.current.playing,
          waiting: false,
          error: "",
        });
      } catch {}
    }, 500);
    return () => window.clearInterval(interval);
  }, [track.id]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.setVolume(Math.round(clampNumber((active.muted ? 0 : active.volume) * masterVolume * fadeMultiplierForActive(active), 0, 1) * 100));
      const positionSyncKey = `${active.positionUpdatedAt || ""}:${active.playing ? "1" : "0"}:${active.seekRequestId || ""}`;
      if (active.positionUpdatedAt && lastPositionSyncRef.current !== positionSyncKey) {
        const duration = Number(player.getDuration?.() || 0);
        const elapsed = active.playing ? Math.max(0, (Date.now() - active.positionUpdatedAt) / 1000) : 0;
        const targetTime = duration > 0
          ? clampNumber((active.position ?? 0) + elapsed, 0, duration)
          : Math.max(0, (active.position ?? 0) + elapsed);
        player.seekTo(targetTime, true);
        lastPositionSyncRef.current = positionSyncKey;
      }
      if (active.seekRequestId && lastSeekRequestRef.current !== active.seekRequestId && Number.isFinite(Number(active.seekTo))) {
        const elapsed = active.playing && active.positionUpdatedAt ? Math.max(0, (Date.now() - active.positionUpdatedAt) / 1000) : 0;
        player.seekTo(Math.max(0, Number(active.seekTo) + elapsed), true);
        lastSeekRequestRef.current = active.seekRequestId;
      }
      if (audioEnabled && active.playing) player.playVideo();
      else player.pauseVideo();
    } catch {}
  }, [active.fadeInSeconds, active.fadeInStartedAt, active.fadeOutSeconds, active.fadeOutStartedAt, active.muted, active.playing, active.position, active.positionUpdatedAt, active.seekRequestId, active.seekTo, active.volume, audioEnabled, masterVolume]);

  useEffect(() => {
    if (!hasActiveFade(active)) return undefined;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player?.setVolume) return;
      try {
        player.setVolume(Math.round(clampNumber((active.muted ? 0 : active.volume) * masterVolume * fadeMultiplierForActive(active), 0, 1) * 100));
      } catch {}
    }, 100);
    return () => window.clearInterval(timer);
  }, [active, masterVolume]);

  if (!videoId) return null;
  return <div ref={containerRef} data-youtube-track={track.id} />;
}
