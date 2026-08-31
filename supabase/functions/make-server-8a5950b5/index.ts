import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.ts";

const app = new Hono();

const KNOWN_PROFILE_SEEDS = [
  { id: "dm", name: "DM" },
];

const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

const allowedApiKeys = new Set(
  [
    Deno.env.get("SB_PUBLISHABLE_KEY"),
    Deno.env.get("SUPABASE_ANON_KEY"),
  ]
    .map((value) => (value || "").trim())
    .filter(Boolean),
);

function requireApiKey(c: any) {
  const apiKey = (c.req.header("apikey") || "").trim();
  const auth = (c.req.header("Authorization") || "").trim();
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const provided = apiKey || bearer;

  if (!provided || allowedApiKeys.size === 0 || !allowedApiKeys.has(provided)) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  return null;
}

app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "X-Session-Token", "X-Backup-Secret"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

async function sha256(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sessionTokenKey(rawToken: string) {
  return sha256(rawToken);
}

async function createSession(playerId: string) {
  const rawToken = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sessionTokenKey(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  const supabase = admin();
  const { error } = await supabase.from("app_sessions").insert({
    token_hash: tokenHash,
    player_id: playerId,
    expires_at: expiresAt,
    revoked: false,
  });

  if (error) throw new Error(error.message);

  return { rawToken, expiresAt };
}


async function ensurePlayerExists(playerId: string, fallbackName?: string) {
  const supabase = admin();

  const { data, error } = await supabase
    .from("app_players")
    .select("id, data")
    .eq("id", playerId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const now = new Date().toISOString();

  if (!data) {
    const { error: insertError } = await supabase
      .from("app_players")
      .insert({
        id: playerId,
        data: {
          id: playerId,
          name: fallbackName || playerId,
        },
        updated_at: now,
      });

    if (insertError) throw new Error(insertError.message);
    return;
  }

  const nextData = {
    ...(data.data ?? {}),
    id: playerId,
  };

  if (!nextData.name) nextData.name = fallbackName || playerId;

  if (JSON.stringify(nextData) !== JSON.stringify(data.data ?? {})) {
    const { error: updateError } = await supabase
      .from("app_players")
      .update({ data: nextData, updated_at: now })
      .eq("id", playerId);

    if (updateError) throw new Error(updateError.message);
  }
}

async function ensureKnownProfiles() {
  for (const profile of KNOWN_PROFILE_SEEDS) {
    await ensurePlayerExists(profile.id, profile.name);
  }
}

function getSessionToken(c: any): string {
  return (c.req.header("X-Session-Token") || "").trim();
}

async function resolveSessionPlayerId(c: any): Promise<string> {
  const rawToken = getSessionToken(c);
  if (!rawToken) throw new Error("Missing session token");

  const tokenHash = await sessionTokenKey(rawToken);
  const supabase = admin();

  const { data, error } = await supabase
    .from("app_sessions")
    .select("player_id, expires_at, revoked")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid session");
  if (data.revoked) throw new Error("Session revoked");
  if (new Date(data.expires_at).getTime() < Date.now()) throw new Error("Session expired");

  return data.player_id;
}

function requireDM(playerId: string) {
  if (playerId !== "dm") {
    throw new Error("DM access only");
  }
}

async function requireDMSession(c: any) {
  const playerId = await resolveSessionPlayerId(c);
  requireDM(playerId);
  return playerId;
}

const authKey = (profileId: string) => `inet-authcode::${profileId}`;
const authAttemptKey = (profileId: string, clientId: string) =>
  `inet-authattempt::${profileId}::${clientId}`;
const pfpKey = (userId: string) => `inet-pfp::${userId}`;
const playerMagicListsKey = (playerId: string) => `inet-player-magic-lists::${playerId}`;
const imageStorageKey = "inet-image-storage";
const wikiBlockPresetsKey = "inet-wiki-block-presets";
const wikiArticleRevisionsKey = "inet-wiki-article-revisions";
const wikiDeletedSitesKey = "inet-wiki-deleted-sites";
const wikiTemplatesKey = "inet-wiki-templates";
const wikiBlockStylePresetsKey = "inet-wiki-block-style-presets";
const combatMusicBucket = (Deno.env.get("COMBAT_MUSIC_BUCKET") || "combat-music").trim();
const MAX_COMBAT_MUSIC_BYTES = 50 * 1024 * 1024;
const businessMapAssetBucket = (Deno.env.get("BUSINESS_MAP_ASSET_BUCKET") || "business-map-assets").trim();
const MAX_BUSINESS_MAP_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_BUSINESS_MAP_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_COMBAT_MUSIC_TYPES = new Set([
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wave",
  "audio/wav",
  "audio/webm",
  "audio/x-flac",
  "audio/x-m4a",
  "audio/x-wav",
]);

const AUTH_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const AUTH_LOCKOUT_MS = 2 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 5;

function authClientId(c: any) {
  const forwarded = String(c.req.header("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  return (forwarded || String(c.req.header("cf-connecting-ip") || "unknown"))
    .replace(/[^a-zA-Z0-9:._-]/g, "_")
    .slice(0, 120);
}

async function getAuthAttemptState(c: any, profileId: string) {
  const key = authAttemptKey(profileId, authClientId(c));
  const stored = await kv.get(key);
  const now = Date.now();
  const startedAt = Number(stored?.startedAt || 0);
  const lockedUntil = Number(stored?.lockedUntil || 0);

  if (!startedAt || now - startedAt > AUTH_ATTEMPT_WINDOW_MS) {
    return { key, count: 0, startedAt: now, lockedUntil: 0 };
  }

  return {
    key,
    count: Math.max(0, Number(stored?.count || 0)),
    startedAt,
    lockedUntil,
  };
}

async function recordFailedAuthAttempt(c: any, profileId: string) {
  const state = await getAuthAttemptState(c, profileId);
  const count = state.count + 1;
  await kv.set(state.key, {
    count,
    startedAt: state.startedAt,
    lockedUntil: count >= AUTH_MAX_ATTEMPTS ? Date.now() + AUTH_LOCKOUT_MS : 0,
  });
}

async function clearAuthAttempts(c: any, profileId: string) {
  const state = await getAuthAttemptState(c, profileId);
  await kv.del(state.key);
}


async function listEntityRows(table: "app_players" | "app_deleted_players") {
  const supabase = admin();
  const { data, error } = await supabase
    .from(table)
    .select("id, data")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    ...(row.data ?? {}),
  }));
}

function explicitDeleteIds(
  value: unknown,
  nextIds: string[],
  protectedIds: string[] = [],
) {
  const retained = new Set(nextIds);
  const protectedSet = new Set(protectedIds);
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((id) => typeof id === "string" ? id.trim() : "")
        .filter(Boolean),
    ),
  ).filter((id) => !retained.has(id) && !protectedSet.has(id));
}

async function syncEntityRows(
  table: "app_players" | "app_deleted_players",
  rows: Array<{ id: string; [key: string]: any }>,
  deleteIds: unknown,
) {
  const supabase = admin();
  const now = new Date().toISOString();

  const dedupedRows = Array.from(
    new Map(
      rows
        .filter((row) => typeof row?.id === "string" && row.id.trim())
        .map((row) => [row.id.trim(), { ...row, id: row.id.trim() }]),
    ).values(),
  );
  const nextIds = dedupedRows.map((row) => row.id);
  const idsToDelete = explicitDeleteIds(
    deleteIds,
    nextIds,
    table === "app_players" ? ["dm"] : [],
  );

  const payload = dedupedRows.map((row) => ({
    id: row.id,
    data: sanitizeStoredValue({ ...row, id: row.id }),
    updated_at: now,
  }));

  if (payload.length > 0) {
    const { error: upsertError } = await supabase
      .from(table)
      .upsert(payload, { onConflict: "id" });

    if (upsertError) throw new Error(upsertError.message);
  }

  if (idsToDelete.length > 0) {
    if (table === "app_players") {
      const { error: revokeError } = await supabase
        .from("app_sessions")
        .delete()
        .in("player_id", idsToDelete);
      if (revokeError) throw new Error(revokeError.message);
    }

    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .in("id", idsToDelete);

    if (deleteError) throw new Error(deleteError.message);
  }
}

type DMCollectionKey =
  | "players"
  | "deleted-players"
  | "items"
  | "cards"
  | "infos"
  | "node-trees"
  | "notifications"
  | "info-subtabs"
  | "custom-reactions"
  | "tags";

const DM_COLLECTIONS: Record<DMCollectionKey, { table: string; responseKey: string; requestKey: string; revokeSessions?: boolean }> = {
  "players": { table: "app_players", responseKey: "players", requestKey: "players", revokeSessions: true },
  "deleted-players": { table: "app_deleted_players", responseKey: "players", requestKey: "players" },
  "items": { table: "app_items", responseKey: "items", requestKey: "items" },
  "cards": { table: "app_cards", responseKey: "cards", requestKey: "cards" },
  "infos": { table: "app_infos", responseKey: "infos", requestKey: "infos" },
  "node-trees": { table: "app_node_trees", responseKey: "nodeTrees", requestKey: "nodeTrees" },
  "notifications": { table: "app_notifications", responseKey: "notifications", requestKey: "notifications" },
  "info-subtabs": { table: "app_info_subtabs", responseKey: "infoSubTabs", requestKey: "infoSubTabs" },
  "custom-reactions": { table: "community_custom_reactions", responseKey: "reactions", requestKey: "reactions" },
  "tags": { table: "app_tags", responseKey: "tags", requestKey: "tags" },
};

type AppWriteAccess = "dm" | "authenticated" | "player-self";

const APP_COLLECTIONS: Record<string, { write: AppWriteAccess; read?: AppWriteAccess }> = {
  app_node_trees: { write: "dm" },
  app_players: { write: "player-self" },
  app_deleted_players: { write: "dm", read: "dm" },
  app_items: { write: "dm" },
  app_cards: { write: "dm" },
  app_infos: { write: "dm" },
  app_info_subtabs: { write: "dm" },
  app_notifications: { write: "dm" },
  app_news: { write: "dm" },
  app_sites: { write: "dm" },
  app_custom_panel_styles: { write: "dm" },
  community_custom_reactions: { write: "dm" },
  app_commerce_shops: { write: "authenticated" },
  app_commerce_ledger: { write: "authenticated" },
};

const APP_SINGLETONS: Record<string, { write: AppWriteAccess }> = {
  app_nexus_nomad_state: { write: "dm" },
  app_campaign_timeline_state: { write: "dm" },
  app_timeline_calendar_presets: { write: "dm" },
  app_intelli_maps_state: { write: "dm" },
  app_session_log_state: { write: "dm" },
  app_session_player_notes: { write: "authenticated" },
  app_party_color_state: { write: "authenticated" },
  app_party_color_cursors: { write: "authenticated" },
  app_calendar_weather_state: { write: "dm" },
  app_dm_customize_state: { write: "dm" },
  app_arcade_catalog_state: { write: "authenticated" },
  app_arcade_leaderboard_state: { write: "authenticated" },
};

const APP_PLAYER_DOCS = new Set([
  "player_node_tree_unlocks",
  "player_level_categories",
  "player_commerce_cart",
  "player_customization",
  "player_wiki_editor_drafts",
  "player_placed_stickers",
  "player_arcade_profiles",
]);

const PLAYER_COMBAT_EDITABLE_FIELDS = new Set([
  "currentHP",
  "tempHP",
  "currentWounds",
  "state",
  "status",
  "statusEffects",
]);

function requireWriteAccess(playerId: string, access: AppWriteAccess, targetPlayerId?: string) {
  if (access === "authenticated") return;
  if (access === "dm") {
    requireDM(playerId);
    return;
  }
  if (playerId !== "dm" && playerId !== targetPlayerId) {
    throw new Error("Cannot modify another player's data");
  }
}

function requireSingletonWriteAccess(
  playerId: string,
  table: string,
  id: string,
  defaultAccess: AppWriteAccess,
) {
  if (table === "app_arcade_catalog_state") {
    const dmOnly =
      id === "default" ||
      id === "combat-music-state" ||
      id.startsWith("combat-music-audio-");
    requireWriteAccess(playerId, dmOnly ? "dm" : "authenticated", playerId);
    return;
  }
  requireWriteAccess(playerId, defaultAccess, playerId);
}

function sanitizeServerHtml(value: string) {
  if (!/<\/?[a-z][\s\S]*>/i.test(value)) return value;

  let clean = value;
  const blocked = "script|iframe|object|embed|form|input|button|link|meta|base|svg|math";
  clean = clean.replace(
    new RegExp(`<(${blocked})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi"),
    "",
  );
  clean = clean.replace(new RegExp(`<\\/?(?:${blocked})\\b[^>]*>`, "gi"), "");
  clean = clean.replace(/\s(?:on[a-z0-9_-]+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  clean = clean.replace(
    /\s(href|src|xlink:href)\s*=\s*(["'])(.*?)\2/gi,
    (match, name, quote, url) => {
      const normalized = String(url)
        .trim()
        .replace(/[\u0000-\u001F\u007F\s]+/g, "")
        .toLowerCase();
      const safe =
        !normalized ||
        normalized.startsWith("#") ||
        normalized.startsWith("/") ||
        normalized.startsWith("./") ||
        normalized.startsWith("../") ||
        /^(https?:|mailto:|tel:|blob:)/.test(normalized) ||
        (String(name).toLowerCase() === "src" &&
          /^data:image\/(png|gif|jpe?g|webp|avif);base64,/.test(normalized));
      return safe ? match : "";
    },
  );
  clean = clean.replace(
    /\sstyle\s*=\s*(["'])(.*?)\1/gi,
    (match, _quote, style) =>
      /(expression\s*\(|url\s*\(\s*['"]?\s*(javascript|vbscript|data:text\/html))/i.test(String(style))
        ? ""
        : match,
  );
  return clean;
}

function sanitizeStoredValue<T>(value: T): T {
  if (typeof value === "string") return sanitizeServerHtml(value) as T;
  if (Array.isArray(value)) return value.map((entry) => sanitizeStoredValue(entry)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeStoredValue(entry),
      ]),
    ) as T;
  }
  return value;
}

async function listCollectionRows(table: string) {
  const supabase = admin();
  const { data, error } = await supabase
    .from(table)
    .select("id, data")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    ...(row.data ?? {}),
  }));
}

async function syncCollectionRows(
  table: string,
  rows: Array<{ id: string; [key: string]: any }>,
  deleteIds: unknown,
  opts?: { revokeSessions?: boolean },
) {
  const supabase = admin();
  const now = new Date().toISOString();
  const dedupedRows = Array.from(
    new Map(
      rows
        .filter((row) => typeof row?.id === "string" && row.id.trim())
        .map((row) => {
          const id = row.id.trim();
          return [id, sanitizeStoredValue({ ...row, id })];
        }),
    ).values(),
  );

  if (dedupedRows.length > 0) {
    const { error } = await supabase.from(table).upsert(
      dedupedRows.map((row) => ({
        id: row.id,
        data: row,
        updated_at: now,
      })),
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
  }

  const safeDeleteIds = explicitDeleteIds(
    deleteIds,
    dedupedRows.map((row) => row.id),
    table === "app_players" ? ["dm"] : [],
  );
  if (safeDeleteIds.length > 0) {
    if (opts?.revokeSessions) {
      const { error: revokeError } = await supabase
        .from("app_sessions")
        .delete()
        .in("player_id", safeDeleteIds);
      if (revokeError) throw new Error(revokeError.message);
    }

    const { error } = await supabase.from(table).delete().in("id", safeDeleteIds);
    if (error) throw new Error(error.message);
  }

  return now;
}

async function listWikiSiteRows() {
  const supabase = admin();
  const { data, error } = await supabase
    .from("app_sites")
    .select("id, data, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    ...(row.data ?? {}),
    id: row.id,
    serverUpdatedAt: row.updated_at ?? null,
  }));
}

async function loadWikiSiteRow(id: string) {
  const { data, error } = await admin()
    .from("app_sites")
    .select("id, data, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? {
    ...(data.data ?? {}),
    id: data.id,
    serverUpdatedAt: data.updated_at ?? null,
  } : null;
}

async function listPlayerScopedRows(table: string) {
  const supabase = admin();
  const { data, error } = await supabase
    .from(table)
    .select("player_id, data, updated_at")
    .order("player_id", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    playerId: row.player_id,
    data: row.data ?? null,
    updatedAt: row.updated_at ?? null,
  }));
}

async function loadPlayerScopedRow(table: string, playerId: string) {
  const { data, error } = await admin()
    .from(table)
    .select("data, updated_at")
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    data: data?.data ?? null,
    updatedAt: data?.updated_at ?? null,
  };
}

async function loadSingletonCollectionRow(table: string, id = "default") {
  const supabase = admin();
  const { data, error } = await supabase
    .from(table)
    .select("id, data, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    id,
    data: data?.data ?? null,
    updatedAt: data?.updated_at ?? null,
  };
}

type DMTagKind = "item" | "card" | "info" | "status" | "wiki";

function assertTagKind(value: string): DMTagKind {
  if (value === "item" || value === "card" || value === "info" || value === "status" || value === "wiki") {
    return value;
  }
  throw new Error("Invalid tag kind");
}

async function listTagRows(kind: DMTagKind) {
  const supabase = admin();
  const { data, error } = await supabase
    .from("app_tags")
    .select("id, data")
    .eq("kind", kind)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: String(row?.data?.id ?? String(row.id).replace(/^.*?:/, "")),
    ...(row.data ?? {}),
  }));
}

async function syncTagRows(
  kind: DMTagKind,
  rows: Array<{ id: string; [key: string]: any }>,
  deleteIds: unknown,
) {
  const supabase = admin();
  const now = new Date().toISOString();

  const dedupedRows = Array.from(
    new Map(
      rows
        .filter((row) => typeof row?.id === "string" && row.id.trim())
        .map((row) => [row.id.trim(), { ...row, id: row.id.trim() }])
    ).values()
  );

  const nextIds = dedupedRows.map((row) => `${kind}:${row.id}`);
  const prefixedDeleteIds = (Array.isArray(deleteIds) ? deleteIds : [])
    .map((id) => typeof id === "string" ? id.trim() : "")
    .filter(Boolean)
    .map((id) => `${kind}:${id}`);
  const idsToDelete = explicitDeleteIds(prefixedDeleteIds, nextIds);

  const payload = dedupedRows.map((row) => ({
    id: `${kind}:${row.id}`,
    kind,
    data: sanitizeStoredValue({ ...row, id: row.id }),
    updated_at: now,
  }));

  if (payload.length > 0) {
    const { error: upsertError } = await supabase
      .from("app_tags")
      .upsert(payload, { onConflict: "id" });

    if (upsertError) throw new Error(upsertError.message);
  }

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("app_tags")
      .delete()
      .in("id", idsToDelete);

    if (deleteError) throw new Error(deleteError.message);
  }
}

async function deletePlayerOwnedRows(
  supabase: ReturnType<typeof admin>,
  table: string,
  playerId: string,
  column = "player_id",
) {
  const { error } = await supabase.from(table).delete().eq(column, playerId);
  if (!error) return;

  const message = String(error.message || "");
  const code = String((error as { code?: string } | null)?.code || "");

  // Some of the newer player-owned tables may not exist yet in every environment.
  // Ignore missing-table errors so player deletion can still proceed for the tables that do exist.
  if (code === "42P01" || code === "PGRST205" || /does not exist/i.test(message) || /schema cache/i.test(message)) {
    console.warn(`Skipping missing table during player delete: ${table}`);
    return;
  }

  throw new Error(error.message);
}

async function movePlayerToDeleted(playerId: string) {
  if (playerId === "dm") throw new Error("Cannot delete dm");

  const supabase = admin();
  const now = new Date().toISOString();

  const { data: playerRow, error: playerError } = await supabase
    .from("app_players")
    .select("id, data")
    .eq("id", playerId)
    .maybeSingle();

  if (playerError) throw new Error(playerError.message);
  if (!playerRow) return;

  const archived = {
    id: playerId,
    data: { id: playerId, ...(playerRow.data ?? {}) },
    updated_at: now,
  };

  const { error: archiveError } = await supabase
    .from("app_deleted_players")
    .upsert(archived, { onConflict: "id" });
  if (archiveError) throw new Error(archiveError.message);

  const childTables = [
    "app_sessions",
    "community_read_state",
    "player_activity_log",
    "player_arcade_profiles",
    "player_commerce_cart",
    "player_community_profile",
    "player_customization",
    "player_equipment_slots",
    "player_level_categories",
    "player_node_tree_unlocks",
    "player_placed_stickers",
    "player_quick_items",
    "player_skill_proficiencies",
    "player_skill_settings",
    "player_source_usage_log",
    "player_status_effects",
    "player_wiki_editor_drafts",
  ];

  for (const table of childTables) {
    await deletePlayerOwnedRows(supabase, table, playerId);
  }

  const { error: deletePlayerError } = await supabase
    .from("app_players")
    .delete()
    .eq("id", playerId);
  if (deletePlayerError) throw new Error(deletePlayerError.message);
}



async function purgeDeletedPlayer(playerId: string) {
  if (!playerId) throw new Error("Missing playerId");
  if (playerId === "dm") throw new Error("Cannot purge dm");

  const supabase = admin();

  const { error: deleteDeletedError } = await supabase
    .from("app_deleted_players")
    .delete()
    .eq("id", playerId);
  if (deleteDeletedError) throw new Error(deleteDeletedError.message);

  await Promise.all([
    kv.del(authKey(playerId)),
    kv.del(pfpKey(playerId)),
  ]);
}

async function clearDeletedPlayers() {
  const supabase = admin();

  const { error: deleteError } = await supabase
    .from("app_deleted_players")
    .delete()
    .neq("id", "dm");

  if (deleteError) throw new Error(deleteError.message);
}

type JsonRecord = Record<string, any>;

async function loadOfficeStateRecord() {
  const { data, error } = await admin()
    .from("app_nexus_nomad_state")
    .select("data, updated_at")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.data && typeof data.data === "object" ? data.data as JsonRecord : null;
}

async function persistOfficeStateRecord(state: JsonRecord) {
  const updatedAt = new Date().toISOString();
  const { error } = await admin().from("app_nexus_nomad_state").upsert(
    { id: "default", data: state, updated_at: updatedAt },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
}

function officeBusinessMaps(state: JsonRecord) {
  const maps: JsonRecord[] = [];
  if (state?.businessMap && typeof state.businessMap === "object") maps.push(state.businessMap);
  if (Array.isArray(state?.facilities)) {
    state.facilities.forEach((facility: any) => {
      if (facility?.businessMap && typeof facility.businessMap === "object") maps.push(facility.businessMap);
    });
  }
  return maps;
}

function officeBusinessMapForScope(state: JsonRecord, scopeId: string) {
  if (scopeId === "global") return state?.businessMap && typeof state.businessMap === "object" ? state.businessMap as JsonRecord : null;
  const facility = Array.isArray(state?.facilities)
    ? state.facilities.find((entry: any) => String(entry?.id || "") === scopeId)
    : null;
  return facility?.businessMap && typeof facility.businessMap === "object" ? facility.businessMap as JsonRecord : null;
}

function officeFacilityForScope(state: JsonRecord, scopeId: string) {
  if (scopeId === "global" || !Array.isArray(state?.facilities)) return null;
  return state.facilities.find((entry: any) => String(entry?.id || "") === scopeId) || null;
}

function findBusinessMapSlot(map: JsonRecord, sectorId: string, slotId: string) {
  const sector = Array.isArray(map?.sectors)
    ? map.sectors.find((entry: any) => String(entry?.id || "") === sectorId)
    : null;
  const slot = Array.isArray(sector?.slots)
    ? sector.slots.find((entry: any) => String(entry?.id || "") === slotId)
    : null;
  return { sector, slot };
}

function playerCanModifyBusinessMap(map: JsonRecord, playerId: string, action: "install" | "remove", facility?: JsonRecord | null) {
  if (playerId === "dm") return true;
  const ownerPlayerId = String(facility?.ownerPlayerId || "").trim();
  if (ownerPlayerId) return ownerPlayerId === playerId;
  const permissions = map?.permissions && typeof map.permissions === "object" ? map.permissions : {};
  const allowed = Array.isArray(permissions.allowedPlayerIds)
    ? permissions.allowedPlayerIds.map((entry: any) => String(entry || "")).filter(Boolean)
    : [];
  if (allowed.length > 0 && !allowed.includes(playerId)) return false;
  return action === "install" ? permissions.playerCanInstall !== false : permissions.playerCanRemove === true;
}

function officePersonalFunds(state: JsonRecord) {
  if (!Array.isArray(state.personalFunds)) state.personalFunds = [];
  return state.personalFunds as JsonRecord[];
}

function officePersonalFund(state: JsonRecord, playerId: string, create = false) {
  const funds = officePersonalFunds(state);
  let fund = funds.find((entry: any) => String(entry?.playerId || "") === playerId) || null;
  if (!fund && create) {
    fund = { playerId, balance: 0, currency: "CR", note: "", updatedAt: "", updatedBy: "" };
    funds.push(fund);
  }
  return fund;
}

function additionFitsBusinessSlot(slot: JsonRecord, addition: JsonRecord) {
  const acceptedCategories = Array.isArray(slot?.acceptedCategories)
    ? slot.acceptedCategories.map((entry: any) => String(entry || ""))
    : slot?.category && slot.category !== "Unassigned" ? [String(slot.category)] : [];
  const acceptedTags = Array.isArray(slot?.acceptedTags)
    ? slot.acceptedTags.map((entry: any) => String(entry || ""))
    : [];
  const additionTags = Array.isArray(addition?.tags)
    ? addition.tags.map((entry: any) => String(entry || ""))
    : [];
  const categoryFits = acceptedCategories.length === 0 || acceptedCategories.includes(String(addition?.category || "Unassigned"));
  const tagsFit = acceptedTags.length === 0 || additionTags.some((tag: string) => acceptedTags.includes(tag));
  const footprintFits = Math.max(1, Number(addition?.width) || 1) <= Math.max(1, Number(slot?.width) || 1)
    && Math.max(1, Number(addition?.height) || 1) <= Math.max(1, Number(slot?.height) || 1);
  return categoryFits && tagsFit && footprintFits;
}

function installedAdditionCount(state: JsonRecord, additionId: string) {
  let count = 0;
  officeBusinessMaps(state).forEach((map) => {
    if (!Array.isArray(map?.sectors)) return;
    map.sectors.forEach((sector: any) => {
      if (!Array.isArray(sector?.slots)) return;
      sector.slots.forEach((slot: any) => {
        if (String(slot?.installedAdditionId || "") === additionId) count += 1;
      });
    });
  });
  return count;
}

function stampOfficeState(state: JsonRecord, playerId: string, previousRevision: number) {
  return {
    ...state,
    id: "default",
    revision: previousRevision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: playerId,
  };
}

function registerRoutes(prefix: string) {
  app.get(`${prefix}/health`, (c) => {
    return c.json({ status: "ok", prefix });
  });

  app.post(`${prefix}/office/state/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      const playerId = await requireDMSession(c);
      const body = await c.req.json();
      if (!body?.state || typeof body.state !== "object") {
        return c.json({ error: "Office state is required" }, 400);
      }

      const current = await loadOfficeStateRecord();
      const currentRevision = Math.max(0, Math.floor(Number(current?.revision) || 0));
      const expectedRevision = Math.max(0, Math.floor(Number(body.expectedRevision) || 0));
      if (current && expectedRevision !== currentRevision) {
        return c.json({ error: "Office state changed on another client", code: "OFFICE_REVISION_CONFLICT", currentRevision }, 409);
      }

      const sanitized = sanitizeStoredValue(body.state);
      if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
        return c.json({ error: "Office state must be an object" }, 400);
      }
      const next = stampOfficeState(sanitized as JsonRecord, playerId, currentRevision);
      await persistOfficeStateRecord(next);
      return c.json({ ok: true, state: next });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /session/i.test(message) ? 401 : /DM access only/i.test(message) ? 403 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post(`${prefix}/office/facility-addition/action`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      const playerId = await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const action = body?.action === "remove" ? "remove" : body?.action === "install" ? "install" : null;
      const scopeId = String(body?.scopeId || "").trim();
      const sectorId = String(body?.sectorId || "").trim();
      const slotId = String(body?.slotId || "").trim();
      if (!action || !scopeId || !sectorId || !slotId) {
        return c.json({ error: "A valid action, map scope, sector, and slot are required" }, 400);
      }

      const current = await loadOfficeStateRecord();
      if (!current) return c.json({ error: "Office state is not available" }, 404);
      const next = JSON.parse(JSON.stringify(current)) as JsonRecord;
      const map = officeBusinessMapForScope(next, scopeId);
      if (!map) return c.json({ error: "Business map was not found" }, 404);
      const facility = officeFacilityForScope(next, scopeId);
      if (!playerCanModifyBusinessMap(map, playerId, action, facility)) {
        return c.json({ error: `You do not have permission to ${action} facility additions on this map` }, 403);
      }

      const { slot } = findBusinessMapSlot(map, sectorId, slotId);
      if (!slot) return c.json({ error: "Business slot was not found" }, 404);

      if (action === "install") {
        const additionId = String(body?.additionId || "").trim();
        const addition = Array.isArray(next.facilityAdditions)
          ? next.facilityAdditions.find((entry: any) => String(entry?.id || "") === additionId)
          : null;
        if (!addition) return c.json({ error: "Facility addition was not found" }, 404);
        if (String(slot.installedAdditionId || "") === additionId) return c.json({ error: "That addition is already installed here" }, 409);
        if (slot.filled && !slot.installedAdditionId) return c.json({ error: "This slot already has a custom assignment" }, 409);
        if (!additionFitsBusinessSlot(slot, addition)) {
          return c.json({ error: "That facility addition is not compatible with this slot" }, 409);
        }
        const quantity = Math.max(0, Math.floor(Number(addition.quantity) || 0));
        if (installedAdditionCount(next, additionId) >= quantity) {
          return c.json({ error: "No copies of that facility addition are available" }, 409);
        }
        slot.filled = true;
        slot.occupant = String(addition.name || "Facility Addition").slice(0, 100);
        slot.linkedFacilityId = "";
        slot.installedAdditionId = additionId;
        slot.installedBy = playerId;
        slot.installedAt = new Date().toISOString();
      } else {
        if (!slot.installedAdditionId) return c.json({ error: "This slot has no facility addition installed" }, 409);
        slot.filled = false;
        slot.occupant = "";
        slot.installedAdditionId = "";
        slot.installedBy = "";
        slot.installedAt = "";
      }

      const currentRevision = Math.max(0, Math.floor(Number(current.revision) || 0));
      const stamped = stampOfficeState(next, playerId, currentRevision);
      await persistOfficeStateRecord(stamped);
      return c.json({ ok: true, state: stamped });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /session/i.test(message) ? 401 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post(`${prefix}/office/personal-funds/update`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      const playerId = await requireDMSession(c);
      const body = await c.req.json();
      const targetPlayerId = String(body?.playerId || "").trim();
      if (!targetPlayerId || targetPlayerId === "dm") return c.json({ error: "A valid player is required" }, 400);

      const current = await loadOfficeStateRecord();
      if (!current) return c.json({ error: "Office state is not available" }, 404);
      const next = JSON.parse(JSON.stringify(current)) as JsonRecord;
      const fund = officePersonalFund(next, targetPlayerId, true)!;
      const currentBalance = Math.max(0, Math.round(Number(fund.balance) || 0));
      const hasBalance = Number.isFinite(Number(body?.balance));
      const hasDelta = Number.isFinite(Number(body?.delta));
      if (!hasBalance && !hasDelta && typeof body?.note !== "string") {
        return c.json({ error: "Provide a balance, adjustment, or note" }, 400);
      }
      const requested = hasBalance ? Number(body.balance) : currentBalance + Number(body.delta || 0);
      fund.balance = Math.max(0, Math.min(1000000000, Math.round(requested)));
      fund.currency = "CR";
      if (typeof body?.note === "string") fund.note = String(body.note).slice(0, 300);
      fund.updatedAt = new Date().toISOString();
      fund.updatedBy = playerId;

      const currentRevision = Math.max(0, Math.floor(Number(current.revision) || 0));
      const stamped = stampOfficeState(next, playerId, currentRevision);
      await persistOfficeStateRecord(stamped);
      return c.json({ ok: true, state: stamped });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /session/i.test(message) ? 401 : /DM access only/i.test(message) ? 403 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post(`${prefix}/office/facility-expansion/action`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      const playerId = await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const action = body?.action === "fund" || body?.action === "complete" ? body.action as "fund" | "complete" : null;
      const facilityId = String(body?.facilityId || "").trim();
      const expansionId = String(body?.expansionId || "").trim();
      if (!action || !facilityId || !expansionId) return c.json({ error: "A valid facility expansion action is required" }, 400);

      const current = await loadOfficeStateRecord();
      if (!current) return c.json({ error: "Office state is not available" }, 404);
      const next = JSON.parse(JSON.stringify(current)) as JsonRecord;
      const facility = officeFacilityForScope(next, facilityId);
      if (!facility) return c.json({ error: "Facility was not found" }, 404);
      const map = facility.businessMap && typeof facility.businessMap === "object" ? facility.businessMap as JsonRecord : null;
      const expansion = Array.isArray(map?.expansions)
        ? map.expansions.find((entry: any) => String(entry?.id || "") === expansionId)
        : null;
      if (!expansion) return c.json({ error: "Expansion project was not found" }, 404);

      if (action === "fund") {
        if (String(facility.ownerPlayerId || "") !== playerId) return c.json({ error: "Only the assigned facility owner can fund this expansion" }, 403);
        if (expansion.status !== "available") return c.json({ error: "This expansion has already been funded" }, 409);
        const cost = Math.max(0, Math.round(Number(expansion.cost) || 0));
        const fund = officePersonalFund(next, playerId, false);
        const balance = Math.max(0, Math.round(Number(fund?.balance) || 0));
        if (!fund || balance < cost) return c.json({ error: "Insufficient Personal Funds" }, 409);
        fund.balance = balance - cost;
        fund.updatedAt = new Date().toISOString();
        fund.updatedBy = playerId;
        expansion.status = "funded";
        expansion.fundedBy = playerId;
        expansion.fundedAt = new Date().toISOString();
      } else {
        await requireDMSession(c);
        if (expansion.status !== "funded") return c.json({ error: "The owner must fund this expansion first" }, 409);
        expansion.status = "complete";
        expansion.completedBy = playerId;
        expansion.completedAt = new Date().toISOString();
        if (Array.isArray(map.sectors)) {
          const unlockIds = new Set(Array.isArray(expansion.unlockSectorIds) ? expansion.unlockSectorIds.map(String) : []);
          map.sectors.forEach((sector: any) => {
            if (unlockIds.has(String(sector?.id || "")) || String(sector?.unlockExpansionId || "") === expansionId) sector.state = "active";
          });
        }
      }

      const currentRevision = Math.max(0, Math.floor(Number(current.revision) || 0));
      const stamped = stampOfficeState(next, playerId, currentRevision);
      await persistOfficeStateRecord(stamped);
      return c.json({ ok: true, state: stamped });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /session/i.test(message) ? 401 : /DM access only/i.test(message) ? 403 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post(`${prefix}/business-map/assets/upload`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      await requireDMSession(c);

      const form = await c.req.formData();
      const file = form.get("file");
      const path = String(form.get("path") || "").trim();
      if (!(file instanceof File)) return c.json({ error: "Image file is required" }, 400);
      if (!path.startsWith("business-maps/") || path.includes("..")) {
        return c.json({ error: "Invalid business map storage path" }, 400);
      }
      if (file.size <= 0 || file.size > MAX_BUSINESS_MAP_IMAGE_BYTES) {
        return c.json({ error: "Business map images must be between 1 byte and 10 MB" }, 400);
      }
      const contentType = String(file.type || "").toLowerCase();
      if (!ALLOWED_BUSINESS_MAP_IMAGE_TYPES.has(contentType)) {
        return c.json({ error: "Use a PNG, JPEG, WebP, or GIF image" }, 400);
      }

      const storage = admin().storage.from(businessMapAssetBucket);
      const { error } = await storage.upload(path, file, {
        cacheControl: "31536000",
        contentType,
        upsert: false,
      });
      if (error) throw new Error(error.message);
      const { data } = storage.getPublicUrl(path);
      return c.json({
        ok: true,
        asset: {
          kind: "supabase-storage",
          bucket: businessMapAssetBucket,
          path,
          publicUrl: data.publicUrl,
          contentType,
          size: file.size,
          originalName: file.name,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /session/i.test(message) ? 401 : /DM access only/i.test(message) ? 403 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post(`${prefix}/business-map/assets/delete`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      await requireDMSession(c);
      const body = await c.req.json();
      const bucket = String(body?.bucket || "").trim();
      const path = String(body?.path || "").trim();
      if (bucket !== businessMapAssetBucket || !path.startsWith("business-maps/") || path.includes("..")) {
        return c.json({ error: "Invalid business map asset" }, 400);
      }
      const { error } = await admin().storage.from(bucket).remove([path]);
      if (error) throw new Error(error.message);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /session/i.test(message) ? 401 : /DM access only/i.test(message) ? 403 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post(`${prefix}/auth-codes/set`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      await requireDMSession(c);

      const { profileId, code } = await c.req.json();
      if (!profileId || typeof profileId !== "string") {
        return c.json({ error: "Missing or invalid profileId" }, 400);
      }
      if (!code || typeof code !== "string") {
        return c.json({ error: "Missing or invalid code" }, 400);
      }

      const hash = await sha256(code);
      await kv.set(authKey(profileId), { hash });
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/auth-codes/verify`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const body = await c.req.json();
      const { profileId, code } = body;
      if (!profileId || typeof profileId !== "string") {
        return c.json({ error: "Missing or invalid profileId" }, 400);
      }

      const attemptState = await getAuthAttemptState(c, profileId);
      if (attemptState.lockedUntil > Date.now()) {
        return c.json(
          {
            error: "Too many attempts. Try again shortly.",
            retryAfterMs: attemptState.lockedUntil - Date.now(),
          },
          429,
        );
      }

      const key = authKey(profileId);
      const stored = await kv.get(key);
      const playerId = profileId;

      await ensurePlayerExists(playerId, playerId === "dm" ? "DM" : undefined);

      if (!stored || !stored.hash) {
        await clearAuthAttempts(c, profileId);
        const session = await createSession(playerId);
        return c.json({
          valid: true,
          hasCode: false,
          playerId,
          sessionToken: session.rawToken,
        });
      }

      const inputHash = await sha256(code || "");
      const valid = inputHash === stored.hash;

      if (!valid) {
        await recordFailedAuthAttempt(c, profileId);
        return c.json({
          valid: false,
          hasCode: true,
        });
      }

      await clearAuthAttempts(c, profileId);
      const session = await createSession(playerId);

      return c.json({
        valid: true,
        hasCode: true,
        playerId,
        sessionToken: session.rawToken,
      });
    } catch (err) {
      console.log("VERIFY ERROR FULL:", err);
      return c.json({ error: String(err) }, 500);
    }
  });

  app.post(`${prefix}/auth-codes/status`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const body = await c.req.json();
      console.log("STATUS BODY:", body);

      const { profileIds } = body;
      if (!Array.isArray(profileIds)) {
        return c.json({ error: "profileIds must be an array" }, 400);
      }

      const statuses: Record<string, boolean> = {};

      if (profileIds.length > 0) {
        const keys = profileIds.map(authKey);
        console.log("STATUS KEYS:", keys);

        const values = await kv.mget(keys);
        console.log("STATUS VALUES:", values);

        profileIds.forEach((id, i) => {
          statuses[id] = !!(values[i] && values[i].hash);
        });
      }

      return c.json({ statuses });
    } catch (err) {
      console.log("STATUS ERROR FULL:", err);
      return c.json({ error: String(err) }, 500);
    }
  });

  app.get(`${prefix}/auth-codes/profiles`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      await ensureKnownProfiles();

      const supabase = admin();

      const { data, error } = await supabase
        .from("app_players")
        .select("id, data")
        .order("updated_at", { ascending: false });

      if (error) return c.json({ error: error.message }, 500);

      const profiles = (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.data?.name ?? row.id,
        class: row.data?.class ?? row.data?.className ?? null,
        level: row.data?.level ?? 1,
      }));

      return c.json({ profiles });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.delete(`${prefix}/auth-codes/:profileId`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      await requireDMSession(c);

      const profileId = c.req.param("profileId");
      if (!profileId) {
        return c.json({ error: "Missing profileId" }, 400);
      }

      await kv.del(authKey(profileId));
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/auth-codes/migrate`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      await requireDMSession(c);

      const { codes } = await c.req.json();
      if (!Array.isArray(codes)) {
        return c.json({ error: "codes must be an array" }, 400);
      }

      let migrated = 0;
      for (const { profileId, plainCode } of codes) {
        if (!profileId || !plainCode) continue;
        const existing = await kv.get(authKey(profileId));
        if (!existing || !existing.hash) {
          const hash = await sha256(plainCode);
          await kv.set(authKey(profileId), { hash });
          migrated++;
        }
      }

      return c.json({ success: true, migrated });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/profile-picture/upload`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const { userId, imageData } = await c.req.json();
      if (!userId || typeof userId !== "string") {
        return c.json({ error: "Missing or invalid userId" }, 400);
      }
      if (requesterId !== "dm" && requesterId !== userId) {
        return c.json({ error: "Cannot change another player's profile picture" }, 403);
      }
      if (!imageData || typeof imageData !== "string") {
        return c.json({ error: "Missing or invalid imageData" }, 400);
      }
      if (!imageData.startsWith("data:image/")) {
        return c.json({ error: "imageData must be a data:image/ URL" }, 400);
      }
      if (imageData.length > 200_000) {
        return c.json({ error: "Image too large" }, 400);
      }

      await kv.set(pfpKey(userId), { imageData, updatedAt: Date.now() });
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: String(err) }, 401);
    }
  });

  app.get(`${prefix}/profile-picture/:userId`, async (c) => {
    const unauthorized = requireApiKey(c);
    if (unauthorized) return unauthorized;

    const userId = c.req.param("userId");
    if (!userId) {
      return c.json({ error: "Missing userId" }, 400);
    }

    const stored = await kv.get(pfpKey(userId));
    if (!stored || !stored.imageData) {
      return c.json({ imageData: null });
    }

    return c.json({ imageData: stored.imageData, updatedAt: stored.updatedAt });
  });

  app.post(`${prefix}/profile-picture/batch`, async (c) => {
    const unauthorized = requireApiKey(c);
    if (unauthorized) return unauthorized;

    const { userIds } = await c.req.json();
    if (!Array.isArray(userIds)) {
      return c.json({ error: "userIds must be an array" }, 400);
    }

    const pictures: Record<string, string | null> = {};
    if (userIds.length > 0) {
      const keys = userIds.map(pfpKey);
      const values = await kv.mget(keys);
      userIds.forEach((id, i) => {
        pictures[id] = values[i]?.imageData || null;
      });
    }

    return c.json({ pictures });
  });

  app.delete(`${prefix}/profile-picture/:userId`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const userId = c.req.param("userId");
      if (!userId) {
        return c.json({ error: "Missing userId" }, 400);
      }
      if (requesterId !== "dm" && requesterId !== userId) {
        return c.json({ error: "Cannot change another player's profile picture" }, 403);
      }

      await kv.del(pfpKey(userId));
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: String(err) }, 401);
    }
  });

  app.post(`${prefix}/music/upload`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      await requireDMSession(c);

      const form = await c.req.formData();
      const file = form.get("file");
      const path = String(form.get("path") || "").trim();
      if (!(file instanceof File)) return c.json({ error: "Audio file is required" }, 400);
      if (!path.startsWith("combat/") || path.includes("..")) {
        return c.json({ error: "Invalid music storage path" }, 400);
      }
      if (file.size <= 0 || file.size > MAX_COMBAT_MUSIC_BYTES) {
        return c.json({ error: "Audio file must be between 1 byte and 50 MB" }, 400);
      }
      const contentType = String(file.type || "audio/mpeg").toLowerCase();
      if (!ALLOWED_COMBAT_MUSIC_TYPES.has(contentType)) {
        return c.json({ error: "Unsupported audio type" }, 400);
      }

      const storage = admin().storage.from(combatMusicBucket);
      const { error } = await storage.upload(path, file, {
        cacheControl: "31536000",
        contentType,
        upsert: false,
      });
      if (error) throw new Error(error.message);
      const { data } = storage.getPublicUrl(path);
      return c.json({
        storageRef: {
          kind: "supabase-storage",
          bucket: combatMusicBucket,
          path,
          publicUrl: data.publicUrl,
          contentType,
          sizeBytes: file.size,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/music/delete`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      await requireDMSession(c);

      const body = await c.req.json();
      const bucket = String(body?.bucket || "");
      const path = String(body?.path || "");
      if (bucket !== combatMusicBucket || !path.startsWith("combat/") || path.includes("..")) {
        return c.json({ error: "Invalid music storage reference" }, 400);
      }
      const { error } = await admin().storage.from(combatMusicBucket).remove([path]);
      if (error) throw new Error(error.message);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/data/collection/:table`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      const table = c.req.param("table");
      const meta = APP_COLLECTIONS[table];
      if (!meta) return c.json({ error: "Unknown application collection" }, 404);
      if (meta.read === "dm") requireDM(playerId);

      const rows = await listCollectionRows(table);
      return c.json({ rows });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/data/collection/:table/sync`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      const table = c.req.param("table");
      const meta = APP_COLLECTIONS[table];
      if (!meta) return c.json({ error: "Unknown application collection" }, 404);

      const body = await c.req.json();
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      const deleteIds = Array.isArray(body?.deleteIds) ? body.deleteIds : [];

      if (table === "app_players" && playerId !== "dm") {
        const incoming = rows.find((row: any) => String(row?.id || "") === playerId);
        if (!incoming) {
          return c.json({ error: "The current player's row is required" }, 400);
        }

        const supabase = admin();
        const { data: currentRow, error } = await supabase
          .from("app_players")
          .select("data")
          .eq("id", playerId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!currentRow) return c.json({ error: "Player profile not found" }, 404);

        const nextPlayer = { ...(currentRow.data ?? {}), id: playerId };
        for (const field of PLAYER_COMBAT_EDITABLE_FIELDS) {
          if (field in incoming) nextPlayer[field] = sanitizeStoredValue(incoming[field]);
        }
        const updatedAt = await syncCollectionRows("app_players", [nextPlayer], []);
        return c.json({ ok: true, updatedAt });
      }

      requireWriteAccess(playerId, meta.write, playerId);
      const filteredDeleteIds =
        table === "app_players" ? deleteIds.filter((id: string) => id !== "dm") : deleteIds;
      const updatedAt = await syncCollectionRows(table, rows, filteredDeleteIds);
      return c.json({ ok: true, updatedAt });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/data/tags/:kind`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      await resolveSessionPlayerId(c);

      const kind = assertTagKind(c.req.param("kind"));
      const rows = await listTagRows(kind);
      return c.json({ rows });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/data/tags/:kind/sync`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      await requireDMSession(c);

      const kind = assertTagKind(c.req.param("kind"));
      const body = await c.req.json();
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      const deleteIds = new Set(
        (Array.isArray(body?.deleteIds) ? body.deleteIds : [])
          .filter((id: unknown) => typeof id === "string")
          .map((id: string) => `${kind}:${id}`),
      );
      const sanitizedRows = rows.map((row: any) => sanitizeStoredValue(row));
      const supabase = admin();
      const now = new Date().toISOString();

      if (sanitizedRows.length > 0) {
        const { error } = await supabase.from("app_tags").upsert(
          sanitizedRows.map((row: any) => ({
            id: `${kind}:${row.id}`,
            kind,
            data: row,
            updated_at: now,
          })),
          { onConflict: "id" },
        );
        if (error) throw new Error(error.message);
      }
      if (deleteIds.size > 0) {
        const { error } = await supabase
          .from("app_tags")
          .delete()
          .in("id", Array.from(deleteIds));
        if (error) throw new Error(error.message);
      }

      return c.json({ ok: true, updatedAt: now });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/data/doc/:table/:id`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      await resolveSessionPlayerId(c);

      const table = c.req.param("table");
      if (!APP_SINGLETONS[table]) {
        return c.json({ error: "Unknown application document" }, 404);
      }
      const row = await loadSingletonCollectionRow(table, c.req.param("id"));
      return c.json(row);
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/data/doc/:table/:id`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      const table = c.req.param("table");
      const meta = APP_SINGLETONS[table];
      if (!meta) return c.json({ error: "Unknown application document" }, 404);
      const id = c.req.param("id");
      requireSingletonWriteAccess(playerId, table, id, meta.write);

      const body = await c.req.json();
      const data = sanitizeStoredValue(body?.data);
      const updatedAt = new Date().toISOString();
      const { error } = await admin().from(table).upsert(
        { id, data, updated_at: updatedAt },
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);
      return c.json({ ok: true, updatedAt });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.delete(`${prefix}/data/doc/:table/:id`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      const table = c.req.param("table");
      const meta = APP_SINGLETONS[table];
      if (!meta) return c.json({ error: "Unknown application document" }, 404);
      requireSingletonWriteAccess(playerId, table, c.req.param("id"), meta.write);

      const { error } = await admin().from(table).delete().eq("id", c.req.param("id"));
      if (error) throw new Error(error.message);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/data/player-doc/:table/:playerId`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const table = c.req.param("table");
      const playerId = c.req.param("playerId");
      if (!APP_PLAYER_DOCS.has(table)) {
        return c.json({ error: "Unknown player document" }, 404);
      }
      requireWriteAccess(requesterId, "player-self", playerId);

      const data = await loadPlayerScopedRow(table, playerId);
      return c.json({ data: data.data, updatedAt: data.updatedAt });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/data/player-doc/:table/:playerId`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const table = c.req.param("table");
      const playerId = c.req.param("playerId");
      if (!APP_PLAYER_DOCS.has(table)) {
        return c.json({ error: "Unknown player document" }, 404);
      }
      requireWriteAccess(requesterId, "player-self", playerId);

      const body = await c.req.json();
      const updatedAt = new Date().toISOString();
      const { error } = await admin().from(table).upsert(
        {
          player_id: playerId,
          data: sanitizeStoredValue(body?.data),
          updated_at: updatedAt,
        },
        { onConflict: "player_id" },
      );
      if (error) throw new Error(error.message);
      return c.json({ ok: true, updatedAt });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/player-state`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      const supabase = admin();

      const [
        playerRes,
        quickItemsRes,
        sourceUsageRes,
        activityLogRes,
        skillSettingsRes,
        skillProfRes,
        equipSlotsRes,
        statusEffectsRes,
        levelCategoriesRes,
        nodeUnlocksRes,
        magicListsRes,
      ] = await Promise.all([
        supabase.from("app_players").select("data").eq("id", playerId).maybeSingle(),
        supabase.from("player_quick_items").select("data").eq("player_id", playerId).maybeSingle(),
        supabase.from("player_source_usage_log").select("data").eq("player_id", playerId).maybeSingle(),
        supabase.from("player_activity_log").select("data").eq("player_id", playerId).maybeSingle(),
        supabase.from("player_skill_settings").select("data").eq("player_id", playerId).maybeSingle(),
        supabase.from("player_skill_proficiencies").select("data").eq("player_id", playerId).maybeSingle(),
        supabase.from("player_equipment_slots").select("data").eq("player_id", playerId).maybeSingle(),
        supabase.from("player_status_effects").select("data").eq("player_id", playerId).maybeSingle(),
        supabase.from("player_level_categories").select("data").eq("player_id", playerId).maybeSingle(),
        supabase.from("player_node_tree_unlocks").select("data").eq("player_id", playerId).maybeSingle(),
        kv.get(playerMagicListsKey(playerId)),
      ]);

      const firstError =
        playerRes.error || quickItemsRes.error || sourceUsageRes.error || activityLogRes.error ||
        skillSettingsRes.error || skillProfRes.error || equipSlotsRes.error || statusEffectsRes.error ||
        levelCategoriesRes.error || nodeUnlocksRes.error;

      if (firstError) return c.json({ error: firstError.message }, 500);

      return c.json({
        player: playerRes.data ? { id: playerId, ...(playerRes.data.data ?? {}) } : null,
        quickItems: quickItemsRes.data?.data ?? [],
        sourceUsage: sourceUsageRes.data?.data ?? [],
        activityLog: activityLogRes.data?.data ?? [],
        skillSettings: skillSettingsRes.data?.data ?? { proficiencyBonus: 2 },
        skillProficiencies: skillProfRes.data?.data ?? {},
        equipmentSlots: equipSlotsRes.data?.data ?? null,
        statusEffects: statusEffectsRes.data?.data ?? [],
        levelCategories: levelCategoriesRes.data?.data ?? [],
        nodeUnlocks: nodeUnlocksRes.data?.data ?? {},
        magicLists: Array.isArray(magicListsRes) ? magicListsRes : [],
      });
    } catch (err) {
      return c.json({ error: String(err) }, 401);
    }
  });

  app.post(`${prefix}/player-state`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const supabase = admin();
      const now = new Date().toISOString();

      const writes: Promise<any>[] = [];

      if ("quickItems" in body) {
        writes.push(
          supabase.from("player_quick_items").upsert(
            { player_id: playerId, data: sanitizeStoredValue(body.quickItems), updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("sourceUsage" in body) {
        writes.push(
          supabase.from("player_source_usage_log").upsert(
            { player_id: playerId, data: sanitizeStoredValue(body.sourceUsage), updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("activityLog" in body) {
        writes.push(
          supabase.from("player_activity_log").upsert(
            { player_id: playerId, data: sanitizeStoredValue(body.activityLog), updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("skillSettings" in body) {
        writes.push(
          supabase.from("player_skill_settings").upsert(
            { player_id: playerId, data: sanitizeStoredValue(body.skillSettings), updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("skillProficiencies" in body) {
        writes.push(
          supabase.from("player_skill_proficiencies").upsert(
            { player_id: playerId, data: sanitizeStoredValue(body.skillProficiencies), updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("equipmentSlots" in body) {
        writes.push(
          supabase.from("player_equipment_slots").upsert(
            { player_id: playerId, data: sanitizeStoredValue(body.equipmentSlots), updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("statusEffects" in body) {
        writes.push(
          supabase.from("player_status_effects").upsert(
            { player_id: playerId, data: sanitizeStoredValue(body.statusEffects), updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("levelCategories" in body) {
        writes.push(
          supabase.from("player_level_categories").upsert(
            { player_id: playerId, data: sanitizeStoredValue(body.levelCategories), updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("magicLists" in body) {
        writes.push(kv.set(playerMagicListsKey(playerId), body.magicLists));
      }

      if ("nodeUnlocks" in body) {
        writes.push(
          supabase.from("player_node_tree_unlocks").upsert(
            { player_id: playerId, data: sanitizeStoredValue(body.nodeUnlocks), updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("playerPatch" in body) {
        const { data: currentPlayerRow, error: currentPlayerError } = await supabase
          .from("app_players")
          .select("data")
          .eq("id", playerId)
          .maybeSingle();

        if (currentPlayerError) return c.json({ error: currentPlayerError.message }, 500);

        const currentPlayer = currentPlayerRow?.data ?? {};

        writes.push(
          supabase.from("app_players").upsert(
            {
              id: playerId,
              data: sanitizeStoredValue({ ...currentPlayer, ...body.playerPatch }),
              updated_at: now,
            },
            { onConflict: "id" },
          ),
        );
      }

      if ("saveItem" in body) {
        const item = body.saveItem;
        if (!item || !item.id) return c.json({ error: "Invalid saveItem payload" }, 400);

        writes.push(
          supabase.from("app_items").upsert(
            {
              id: item.id,
              data: sanitizeStoredValue(item),
              updated_at: now,
            },
            { onConflict: "id" },
          ),
        );
      }

      if ("deleteItemId" in body) {
        writes.push(supabase.from("app_items").delete().eq("id", body.deleteItemId));
      }

      const results = await Promise.all(writes);
      const firstError = results.find((r: any) => r?.error)?.error;
      if (firstError) return c.json({ error: firstError.message }, 500);

      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 401);
    }
  });

  app.post(`${prefix}/session/logout`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const rawToken = getSessionToken(c);
      if (!rawToken) return c.json({ error: "Missing session token" }, 400);

      const tokenHash = await sessionTokenKey(rawToken);
      const supabase = admin();

      const { error } = await supabase
        .from("app_sessions")
        .update({ revoked: true })
        .eq("token_hash", tokenHash);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.get(`${prefix}/session/me`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      return c.json({ playerId, isDM: playerId === "dm" });
    } catch (err) {
      return c.json({ error: String(err) }, 401);
    }
  });



  app.post(`${prefix}/player/report-notification`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const reporterId = await resolveSessionPlayerId(c);
      const body = await c.req.json();

      const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      const createdAt = typeof body?.createdAt === "string" && body.createdAt.trim()
        ? body.createdAt.trim()
        : new Date().toISOString();
      const playerName = typeof body?.playerName === "string" && body.playerName.trim()
        ? body.playerName.trim()
        : reporterId;
      const playerId = typeof body?.playerId === "string" && body.playerId.trim()
        ? body.playerId.trim()
        : reporterId;

      if (!message) {
        return c.json({ error: "Missing report message" }, 400);
      }

      const notificationId = `report-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const notification = {
        id: notificationId,
        subject: subject || `[Player Report] ${playerName}`,
        message: `${message}\n\n[Submitted by: ${playerName}${playerId ? ` / ${playerId}` : ""}]`,
        assignedTo: ["DM"],
        createdAt,
      };

      const supabase = admin();
      const now = new Date().toISOString();

      const { data: existingRows, error: loadError } = await supabase
        .from("app_notifications")
        .select("id, data")
        .order("updated_at", { ascending: false });

      if (loadError) return c.json({ error: loadError.message }, 500);

      const existingNotifications = (existingRows ?? []).map((row: any) => ({
        id: row.id,
        ...(row.data ?? {}),
      }));

      const deduped = Array.from(
        new Map([notification, ...existingNotifications].map((row: any) => [row.id, row])).values(),
      );

      const payload = deduped.map((row: any) => ({
        id: row.id,
        data: sanitizeStoredValue({ ...row, id: row.id }),
        updated_at: now,
      }));

      const { error: upsertError } = await supabase
        .from("app_notifications")
        .upsert(payload, { onConflict: "id" });

      if (upsertError) return c.json({ error: upsertError.message }, 500);

      return c.json({ ok: true, notificationId });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });


  async function listJsonRows(table: string) {
    const supabase = admin();
    const { data, error } = await supabase
      .from(table)
      .select("id, data")
      .order("updated_at", { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row: any) => ({
      id: row.id,
      ...(row.data ?? {}),
    }));
  }

  async function getPlayerScopedData(table: string, playerId: string, fallback: any) {
    const supabase = admin();
    const { data, error } = await supabase
      .from(table)
      .select("data")
      .eq("player_id", playerId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data?.data ?? fallback;
  }

  async function upsertPlayerScopedData(table: string, playerId: string, dataValue: any) {
    const supabase = admin();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from(table)
      .upsert(
        { player_id: playerId, data: sanitizeStoredValue(dataValue), updated_at: now },
        { onConflict: "player_id" },
      );

    if (error) throw new Error(error.message);
  }

  async function upsertJsonEntity(table: string, id: string, dataValue: any) {
    const supabase = admin();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from(table)
      .upsert(
        { id, data: sanitizeStoredValue({ ...(dataValue ?? {}), id }), updated_at: now },
        { onConflict: "id" },
      );

    if (error) throw new Error(error.message);
  }

  function stripWikiServerMetadata(site: any) {
    const next = { ...(site ?? {}) };
    delete next.serverUpdatedAt;
    return next;
  }

  function normalizeWikiUrl(value: unknown) {
    return String(value ?? "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/$/, "")
      .toLowerCase();
  }

  function getWikiVisibility(site: any, playerId: string) {
    if (playerId === "dm") return "visible";
    const mode = site?.playerVisibility?.[playerId];
    return mode === "hidden" || mode === "spoiler" ? mode : "visible";
  }

  function mapWikiSubcategories(nodes: any, mapNode: (node: any) => any): any[] {
    if (!Array.isArray(nodes)) return [];
    return nodes.map((rawNode) => {
      const node = { ...(rawNode ?? {}) };
      node.children = mapWikiSubcategories(node.children, mapNode);
      return mapNode(node);
    });
  }

  function cleanWikiReferences(site: any, targetId: string) {
    const next = stripWikiServerMetadata(site);
    if (Array.isArray(next.relatedArticleIds)) {
      next.relatedArticleIds = next.relatedArticleIds.filter((id: unknown) => id !== targetId);
    }
    if (Array.isArray(next.seeAlso)) {
      next.seeAlso = next.seeAlso.filter((id: unknown) => id !== targetId);
    }
    if (Array.isArray(next.relationships)) {
      next.relationships = next.relationships.filter((relationship: any) => relationship?.targetArticleId !== targetId);
    }
    if (Array.isArray(next.subcategories)) {
      next.subcategories = mapWikiSubcategories(next.subcategories, (node) => (
        node.articleId === targetId ? { ...node, articleId: undefined } : node
      ));
    }
    if (Array.isArray(next.blocks)) {
      next.blocks = next.blocks.map((block: any) => Array.isArray(block?.articleIds)
        ? { ...block, articleIds: block.articleIds.filter((id: unknown) => id !== targetId) }
        : block);
    }
    return next;
  }

  function captureWikiReferenceSnapshot(site: any) {
    return {
      id: site.id,
      relatedArticleIds: Array.isArray(site.relatedArticleIds) ? site.relatedArticleIds : [],
      seeAlso: Array.isArray(site.seeAlso) ? site.seeAlso : [],
      relationships: Array.isArray(site.relationships) ? site.relationships : [],
      subcategories: Array.isArray(site.subcategories) ? site.subcategories : [],
      blocks: (Array.isArray(site.blocks) ? site.blocks : []).map((block: any) => ({
        id: block?.id,
        articleIds: Array.isArray(block?.articleIds) ? block.articleIds : undefined,
      })),
    };
  }

  function restoreWikiSubcategoryReferences(currentNodes: any, archivedNodes: any, targetId: string): any[] {
    const archivedById = new Map(
      (Array.isArray(archivedNodes) ? archivedNodes : [])
        .filter((node: any) => node?.id)
        .map((node: any) => [node.id, node]),
    );
    return (Array.isArray(currentNodes) ? currentNodes : []).map((rawNode: any) => {
      const node = { ...(rawNode ?? {}) };
      const archived = archivedById.get(node.id) as any;
      if (archived?.articleId === targetId && !node.articleId) node.articleId = targetId;
      node.children = restoreWikiSubcategoryReferences(node.children, archived?.children, targetId);
      return node;
    });
  }

  function restoreWikiReferences(site: any, snapshot: any, targetId: string) {
    const next = stripWikiServerMetadata(site);
    if (snapshot?.relatedArticleIds?.includes(targetId)) {
      next.relatedArticleIds = Array.from(new Set([...(next.relatedArticleIds || []), targetId]));
    }
    if (snapshot?.seeAlso?.includes(targetId)) {
      next.seeAlso = Array.from(new Set([...(next.seeAlso || []), targetId]));
    }
    const archivedRelationships = (snapshot?.relationships || [])
      .filter((relationship: any) => relationship?.targetArticleId === targetId);
    const currentRelationships = Array.isArray(next.relationships) ? next.relationships : [];
    next.relationships = [
      ...currentRelationships,
      ...archivedRelationships.filter((archived: any) => !currentRelationships.some((current: any) => (
        current?.id === archived?.id || (
          current?.targetArticleId === archived?.targetArticleId
          && current?.type === archived?.type
        )
      ))),
    ];
    next.subcategories = restoreWikiSubcategoryReferences(
      next.subcategories,
      snapshot?.subcategories,
      targetId,
    );

    const archivedBlocks = new Map(
      (snapshot?.blocks || []).filter((block: any) => block?.id).map((block: any) => [block.id, block]),
    );
    next.blocks = (Array.isArray(next.blocks) ? next.blocks : []).map((block: any) => {
      const archived = archivedBlocks.get(block?.id) as any;
      if (!archived?.articleIds?.includes(targetId)) return block;
      const currentIds = Array.isArray(block.articleIds) ? block.articleIds : [];
      if (currentIds.includes(targetId)) return block;
      const restoredIds = [...currentIds];
      const archivedIndex = archived.articleIds.indexOf(targetId);
      restoredIds.splice(Math.min(Math.max(archivedIndex, 0), restoredIds.length), 0, targetId);
      return { ...block, articleIds: restoredIds };
    });
    return next;
  }

  async function upsertWikiSite(site: any) {
    const normalized = stripWikiServerMetadata(site);
    const now = new Date().toISOString();
    const { error } = await admin()
      .from("app_sites")
      .upsert(
        { id: normalized.id, data: { ...normalized, id: normalized.id }, updated_at: now },
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    return now;
  }

  async function deleteWikiSiteRow(id: string) {
    const { error } = await admin().from("app_sites").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  app.get(`${prefix}/wiki/bootstrap`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const [sites, players, wikiTags, customPanelStyles, imageStorage, wikiBlockPresets, wikiArticleRevisions, deletedSites, wikiTemplates, wikiBlockStylePresets] = await Promise.all([
        listWikiSiteRows(),
        listEntityRows("app_players"),
        listTagRows("wiki"),
        listCollectionRows("app_custom_panel_styles"),
        kv.get(imageStorageKey),
        kv.get(wikiBlockPresetsKey),
        kv.get(wikiArticleRevisionsKey),
        kv.get(wikiDeletedSitesKey),
        kv.get(wikiTemplatesKey),
        kv.get(wikiBlockStylePresetsKey),
      ]);

      return c.json({
        sites,
        players,
        wikiTags,
        customPanelStyles,
        imageStorage: Array.isArray(imageStorage) ? imageStorage : [],
        wikiBlockPresets: Array.isArray(wikiBlockPresets) ? wikiBlockPresets : [],
        wikiArticleRevisions: Array.isArray(wikiArticleRevisions) ? wikiArticleRevisions : [],
        deletedSites: Array.isArray(deletedSites) ? deletedSites : [],
        wikiTemplates: Array.isArray(wikiTemplates) ? wikiTemplates : [],
        wikiBlockStylePresets: Array.isArray(wikiBlockStylePresets) ? wikiBlockStylePresets : [],
      });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/wiki/player-bootstrap`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const [allSites, wikiTags, customPanelStyles] = await Promise.all([
        listWikiSiteRows(),
        listTagRows("wiki"),
        listCollectionRows("app_custom_panel_styles"),
      ]);
      const sites = requesterId === "dm"
        ? allSites
        : allSites.filter((site: any) => getWikiVisibility(site, requesterId) !== "hidden");

      return c.json({ sites, wikiTags, customPanelStyles });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/wiki/public-bootstrap`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const [sites, wikiTags, customPanelStyles] = await Promise.all([
        listWikiSiteRows(),
        listTagRows("wiki"),
        listCollectionRows("app_custom_panel_styles"),
      ]);

      return c.json({
        sites: sites.map(stripWikiServerMetadata),
        wikiTags,
        customPanelStyles,
      });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.get(`${prefix}/wiki/drafts`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);
      const drafts = await getPlayerScopedData("player_wiki_editor_drafts", requesterId, {});
      return c.json({ drafts: drafts && typeof drafts === "object" ? drafts : {} });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/wiki/drafts/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);
      const body = await c.req.json();
      const drafts = body?.drafts;
      if (!drafts || typeof drafts !== "object" || Array.isArray(drafts)) {
        return c.json({ error: "drafts must be an object" }, 400);
      }
      await upsertPlayerScopedData("player_wiki_editor_drafts", requesterId, drafts);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/wiki/site/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const body = await c.req.json();
      const site = body?.site;
      if (!site || typeof site !== "object" || typeof site.id !== "string" || !site.id.trim()) {
        return c.json({ error: "site with a valid id is required" }, 400);
      }

      const sites = await listWikiSiteRows();
      const current = sites.find((entry: any) => entry.id === site.id);
      const expectedUpdatedAt = String(body?.expectedUpdatedAt || "");
      if (current && expectedUpdatedAt && current.serverUpdatedAt !== expectedUpdatedAt) {
        return c.json({
          error: "This article changed in another tab or session. Reload before saving so those edits are not overwritten.",
          code: "WIKI_EDIT_CONFLICT",
          current,
        }, 409);
      }

      const normalizedUrl = normalizeWikiUrl(site.url);
      const duplicate = sites.find((entry: any) => (
        entry.id !== site.id && normalizedUrl && normalizeWikiUrl(entry.url) === normalizedUrl
      ));
      if (duplicate) {
        return c.json({ error: `Another article already uses this URL: ${duplicate.title || duplicate.id}` }, 409);
      }

      const cleanSite = stripWikiServerMetadata(site);
      const relatedIds = new Set(Array.isArray(cleanSite.relatedArticleIds) ? cleanSite.relatedArticleIds : []);
      await upsertWikiSite(cleanSite);

      for (const other of sites) {
        if (other.id === cleanSite.id) continue;
        const latestOther = await loadWikiSiteRow(other.id);
        if (!latestOther) continue;
        const otherRelated = new Set(Array.isArray(latestOther.relatedArticleIds) ? latestOther.relatedArticleIds : []);
        const shouldLink = relatedIds.has(other.id);
        const currentlyLinked = otherRelated.has(cleanSite.id);
        if (shouldLink === currentlyLinked) continue;
        if (shouldLink) otherRelated.add(cleanSite.id);
        else otherRelated.delete(cleanSite.id);
        await upsertWikiSite({ ...latestOther, relatedArticleIds: Array.from(otherRelated) });
      }

      const deletedSites = await kv.get(wikiDeletedSitesKey);
      if (Array.isArray(deletedSites) && deletedSites.some((entry: any) => entry?.id === cleanSite.id)) {
        await kv.set(wikiDeletedSitesKey, deletedSites.filter((entry: any) => entry?.id !== cleanSite.id));
      }

      return c.json({ ok: true, sites: await listWikiSiteRows() });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/wiki/site/delete`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);
      const body = await c.req.json();
      const siteId = String(body?.siteId || "").trim();
      if (!siteId) return c.json({ error: "siteId is required" }, 400);

      const sites = await listWikiSiteRows();
      const site = sites.find((entry: any) => entry.id === siteId);
      if (!site) return c.json({ error: "Article not found" }, 404);
      const expectedUpdatedAt = String(body?.expectedUpdatedAt || "");
      if (expectedUpdatedAt && site.serverUpdatedAt !== expectedUpdatedAt) {
        return c.json({ error: "This article changed before it could be deleted. Reload and review it first." }, 409);
      }

      const inboundReferenceSnapshots = sites
        .filter((entry: any) => entry.id !== siteId)
        .filter((entry: any) => (
          JSON.stringify(stripWikiServerMetadata(entry)) !== JSON.stringify(cleanWikiReferences(entry, siteId))
        ))
        .map(captureWikiReferenceSnapshot);
      const deletedSites = await kv.get(wikiDeletedSitesKey);
      const trashEntry = {
        id: siteId,
        site: stripWikiServerMetadata(site),
        inboundReferenceSnapshots,
        deletedAt: new Date().toISOString(),
        deletedBy: requesterId,
      };
      const nextTrash = [
        trashEntry,
        ...(Array.isArray(deletedSites) ? deletedSites : []).filter((entry: any) => entry?.id !== siteId),
      ];
      await kv.set(wikiDeletedSitesKey, nextTrash);

      for (const other of sites) {
        if (other.id === siteId) continue;
        const latestOther = await loadWikiSiteRow(other.id);
        if (!latestOther) continue;
        const cleaned = cleanWikiReferences(latestOther, siteId);
        if (JSON.stringify(stripWikiServerMetadata(latestOther)) !== JSON.stringify(cleaned)) {
          await upsertWikiSite(cleaned);
        }
      }
      await deleteWikiSiteRow(siteId);

      return c.json({ ok: true, sites: await listWikiSiteRows(), deletedSites: nextTrash });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/wiki/site/restore`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);
      const body = await c.req.json();
      const siteId = String(body?.siteId || "").trim();
      if (!siteId) return c.json({ error: "siteId is required" }, 400);

      const deletedSites = await kv.get(wikiDeletedSitesKey);
      const trash = Array.isArray(deletedSites) ? deletedSites : [];
      const entry = trash.find((item: any) => item?.id === siteId);
      if (!entry?.site) return c.json({ error: "Deleted article not found" }, 404);

      const currentSites = await listWikiSiteRows();
      if (currentSites.some((site: any) => site.id === siteId)) {
        return c.json({ error: "An active article already uses this id" }, 409);
      }
      const duplicateUrl = currentSites.find((site: any) => (
        normalizeWikiUrl(site.url) && normalizeWikiUrl(site.url) === normalizeWikiUrl(entry.site.url)
      ));
      if (duplicateUrl) {
        return c.json({ error: `Cannot restore because ${duplicateUrl.title || duplicateUrl.id} now uses the same URL.` }, 409);
      }

      await upsertWikiSite(entry.site);
      const snapshots = new Map(
        (entry.inboundReferenceSnapshots || []).map((snapshot: any) => [snapshot.id, snapshot]),
      );
      for (const current of currentSites) {
        const snapshot = snapshots.get(current.id);
        if (!snapshot) continue;
        const latestCurrent = await loadWikiSiteRow(current.id);
        if (!latestCurrent) continue;
        const restored = restoreWikiReferences(latestCurrent, snapshot, siteId);
        if (JSON.stringify(stripWikiServerMetadata(latestCurrent)) !== JSON.stringify(restored)) {
          await upsertWikiSite(restored);
        }
      }

      const nextTrash = trash.filter((item: any) => item?.id !== siteId);
      await kv.set(wikiDeletedSitesKey, nextTrash);
      return c.json({ ok: true, sites: await listWikiSiteRows(), deletedSites: nextTrash });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/wiki/block-presets`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const wikiBlockPresets = await kv.get(wikiBlockPresetsKey);
      return c.json({ wikiBlockPresets: Array.isArray(wikiBlockPresets) ? wikiBlockPresets : [] });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/wiki/article-revisions`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const wikiArticleRevisions = await kv.get(wikiArticleRevisionsKey);
      return c.json({ wikiArticleRevisions: Array.isArray(wikiArticleRevisions) ? wikiArticleRevisions : [] });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/wiki/sites/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const body = await c.req.json();
      const sites = Array.isArray(body?.sites) ? body.sites : null;
      if (!sites) return c.json({ error: "sites must be an array" }, 400);

      await syncCollectionRows("app_sites", sites, body?.deleteIds);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/wiki/custom-panel-styles/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const body = await c.req.json();
      const customPanelStyles = Array.isArray(body?.customPanelStyles)
        ? body.customPanelStyles
        : null;
      if (!customPanelStyles) {
        return c.json({ error: "customPanelStyles must be an array" }, 400);
      }

      await syncCollectionRows(
        "app_custom_panel_styles",
        customPanelStyles,
        body?.deleteIds,
      );
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/wiki/block-presets/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const body = await c.req.json();
      const wikiBlockPresets = Array.isArray(body?.wikiBlockPresets)
        ? body.wikiBlockPresets
        : null;
      if (!wikiBlockPresets) {
        return c.json({ error: "wikiBlockPresets must be an array" }, 400);
      }

      await kv.set(wikiBlockPresetsKey, wikiBlockPresets);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/wiki/templates/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);
      const body = await c.req.json();
      const wikiTemplates = Array.isArray(body?.wikiTemplates) ? body.wikiTemplates : null;
      if (!wikiTemplates) return c.json({ error: "wikiTemplates must be an array" }, 400);
      await kv.set(wikiTemplatesKey, wikiTemplates);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/wiki/block-style-presets/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);
      const body = await c.req.json();
      const wikiBlockStylePresets = Array.isArray(body?.wikiBlockStylePresets)
        ? body.wikiBlockStylePresets
        : null;
      if (!wikiBlockStylePresets) {
        return c.json({ error: "wikiBlockStylePresets must be an array" }, 400);
      }
      await kv.set(wikiBlockStylePresetsKey, wikiBlockStylePresets);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/wiki/article-revisions/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const body = await c.req.json();
      const wikiArticleRevisions = Array.isArray(body?.wikiArticleRevisions)
        ? body.wikiArticleRevisions
        : null;
      if (!wikiArticleRevisions) {
        return c.json({ error: "wikiArticleRevisions must be an array" }, 400);
      }

      await kv.set(wikiArticleRevisionsKey, wikiArticleRevisions);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });


  function normalizeLooseInventoryName(value: unknown): string {
    return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  }

  function getInventoryItemName(item: any): string {
    return String(item?.displayName || item?.name || item?.title || item?.label || item?.id || "").trim();
  }

  function getInventoryItemQuantity(item: any): number {
    const raw = item?.quantity ?? item?.count ?? item?.amount;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : 1;
  }

  function findInventoryItemIndex(items: any[], candidate: any): number {
    const candidateId = String(candidate?.id || "").trim();
    const candidateName = normalizeLooseInventoryName(getInventoryItemName(candidate));
    return items.findIndex((item) => {
      const itemId = String(item?.id || "").trim();
      if (candidateId && itemId && candidateId === itemId) return true;
      return candidateName && normalizeLooseInventoryName(getInventoryItemName(item)) === candidateName;
    });
  }

  app.get(`${prefix}/community/players`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      await resolveSessionPlayerId(c);

      const players = await listEntityRows("app_players");
      return c.json({
        players: players.map((player: any) => ({
          id: player.id,
          name: player.name || player.displayName || player.id,
        })),
      });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/community/messages`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      await resolveSessionPlayerId(c);

      const messages = await listJsonRows("community_messages");
      return c.json({ messages });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/community/message/send`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const message = body?.message;

      if (!message || typeof message?.id !== "string" || !message.id.trim()) {
        return c.json({ error: "message.id is required" }, 400);
      }

      const ownerId = String(message.senderId || "");
      if (requesterId !== "dm" && ownerId !== requesterId) {
        return c.json({ error: "Cannot send messages for another player" }, 403);
      }

      await upsertJsonEntity("community_messages", message.id.trim(), message);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/community/message/update`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const message = body?.message;

      if (!message || typeof message?.id !== "string" || !message.id.trim()) {
        return c.json({ error: "message.id is required" }, 400);
      }

      const supabase = admin();
      const { data: existing, error: existingError } = await supabase
        .from("community_messages")
        .select("data")
        .eq("id", message.id.trim())
        .maybeSingle();

      if (existingError) return c.json({ error: existingError.message }, 500);
      if (!existing?.data) return c.json({ error: "Message not found" }, 404);

      const current = existing.data ?? {};
      const senderId = String(current.senderId || message.senderId || "");
      if (requesterId !== "dm" && senderId !== requesterId) {
        return c.json({ error: "Cannot edit another player's message" }, 403);
      }

      const nextMessage = { ...current, ...message, id: message.id.trim() };
      await upsertJsonEntity("community_messages", nextMessage.id, nextMessage);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/community/message/delete`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const id = typeof body?.id === "string" ? body.id.trim() : "";
      if (!id) return c.json({ error: "id is required" }, 400);

      const supabase = admin();
      const { data: existing, error: existingError } = await supabase
        .from("community_messages")
        .select("data")
        .eq("id", id)
        .maybeSingle();

      if (existingError) return c.json({ error: existingError.message }, 500);
      if (!existing?.data) return c.json({ error: "Message not found" }, 404);

      const senderId = String(existing.data?.senderId || "");
      if (requesterId !== "dm" && senderId !== requesterId) {
        return c.json({ error: "Cannot delete another player's message" }, 403);
      }

      const { error } = await supabase
        .from("community_messages")
        .delete()
        .eq("id", id);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/community/read-state/:playerId`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const playerId = c.req.param("playerId");
      if (!playerId) return c.json({ error: "Missing playerId" }, 400);
      if (requesterId !== "dm" && requesterId !== playerId) {
        return c.json({ error: "Cannot read another player's read state" }, 403);
      }

      const channels = await getPlayerScopedData("community_read_state", playerId, {});
      return c.json({ channels });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/community/read-state/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const playerId = typeof body?.playerId === "string" ? body.playerId.trim() : "";
      const channels = body?.channels ?? {};
      if (!playerId) return c.json({ error: "playerId is required" }, 400);
      if (requesterId !== "dm" && requesterId !== playerId) {
        return c.json({ error: "Cannot save another player's read state" }, 403);
      }

      await upsertPlayerScopedData("community_read_state", playerId, channels);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/community/profile/:playerId`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const playerId = c.req.param("playerId");
      if (!playerId) return c.json({ error: "Missing playerId" }, 400);
      if (requesterId !== "dm" && requesterId !== playerId) {
        return c.json({ error: "Cannot read another player's profile" }, 403);
      }

      const profile = await getPlayerScopedData("player_community_profile", playerId, { playerId });
      return c.json({ profile: { playerId, ...(profile ?? {}) } });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/community/profile/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const playerId = typeof body?.playerId === "string" ? body.playerId.trim() : "";
      const profile = body?.profile ?? {};
      if (!playerId) return c.json({ error: "playerId is required" }, 400);
      if (requesterId !== "dm" && requesterId !== playerId) {
        return c.json({ error: "Cannot save another player's profile" }, 403);
      }

      await upsertPlayerScopedData("player_community_profile", playerId, { ...profile, playerId });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/community/profiles/bulk`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const playerIds = Array.isArray(body?.playerIds)
        ? body.playerIds.map((value: any) => String(value || "").trim()).filter(Boolean)
        : [];

      if (playerIds.length === 0) return c.json({ profiles: {} });

      const supabase = admin();
      const { data, error } = await supabase
        .from("player_community_profile")
        .select("player_id, data")
        .in("player_id", playerIds);

      if (error) return c.json({ error: error.message }, 500);

      const profiles: Record<string, any> = {};
      for (const playerId of playerIds) {
        profiles[playerId] = { playerId };
      }
      for (const row of data ?? []) {
        profiles[row.player_id] = { playerId: row.player_id, ...(row.data ?? {}) };
      }

      return c.json({ profiles });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/community/images`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      await resolveSessionPlayerId(c);

      const images = await listJsonRows("community_images");
      return c.json({ images });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/community/image/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const image = body?.image;
      if (!image || typeof image?.id !== "string" || !image.id.trim()) {
        return c.json({ error: "image.id is required" }, 400);
      }

      await upsertJsonEntity("community_images", image.id.trim(), image);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/community/image/delete`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const id = typeof body?.id === "string" ? body.id.trim() : "";
      if (!id) return c.json({ error: "id is required" }, 400);

      const supabase = admin();
      const { error } = await supabase
        .from("community_images")
        .delete()
        .eq("id", id);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/community/npcs`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      await resolveSessionPlayerId(c);

      const npcAccounts = await listJsonRows("community_npc_accounts");
      return c.json({ npcAccounts });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/community/npcs/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const body = await c.req.json();
      const npcAccounts = Array.isArray(body?.npcAccounts) ? body.npcAccounts : [];
      await syncCollectionRows(
        "community_npc_accounts",
        npcAccounts,
        body?.deleteIds,
      );
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/community/reactions`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      await resolveSessionPlayerId(c);

      const reactions = await listCollectionRows("community_custom_reactions");
      return c.json({ reactions });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });



  app.post(`${prefix}/community/inventory-transfer/respond`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      const body = await c.req.json();
      const messageId = typeof body?.messageId === "string" ? body.messageId.trim() : "";
      const action = body?.action === "decline" ? "decline" : "accept";
      if (!messageId) return c.json({ error: "messageId is required" }, 400);

      const supabase = admin();
      const { data: existing, error: existingError } = await supabase
        .from("community_messages")
        .select("data")
        .eq("id", messageId)
        .maybeSingle();

      if (existingError) return c.json({ error: existingError.message }, 500);
      const message = existing?.data ?? null;
      if (!message) return c.json({ error: "Transfer message not found" }, 404);
      if (message.kind !== "inventory_transfer_offer") return c.json({ error: "Message is not an inventory transfer offer" }, 400);

      const payload = message.commandPayload ?? {};
      const status = String(payload.status || "pending").toLowerCase();
      if (status !== "pending") {
        return c.json({ error: `Transfer already ${status}` }, 409);
      }

      const fromId = String(payload.fromId || "").trim();
      const toId = String(payload.toId || "").trim();
      if (!fromId || !toId) return c.json({ error: "Transfer payload is missing fromId or toId" }, 400);
      if (requesterId !== "dm" && requesterId !== toId) {
        return c.json({ error: "Only the recipient may respond to this transfer" }, 403);
      }

      if (action === "decline") {
        const nextMessage = {
          ...message,
          commandPayload: {
            ...payload,
            status: "declined",
            respondedAt: Date.now(),
            respondedBy: requesterId,
          },
        };
        await upsertJsonEntity("community_messages", messageId, nextMessage);
        return c.json({ ok: true, message: nextMessage });
      }

      const [senderRow, recipientRow] = await Promise.all([
        supabase.from("player_quick_items").select("data").eq("player_id", fromId).maybeSingle(),
        supabase.from("player_quick_items").select("data").eq("player_id", toId).maybeSingle(),
      ]);

      if (senderRow.error) return c.json({ error: senderRow.error.message }, 500);
      if (recipientRow.error) return c.json({ error: recipientRow.error.message }, 500);

      const senderItems = Array.isArray(senderRow.data?.data) ? [...senderRow.data.data] : [];
      const recipientItems = Array.isArray(recipientRow.data?.data) ? [...recipientRow.data.data] : [];
      const transferItem = payload.item ?? { id: payload.itemId, name: payload.itemName };
      const senderIndex = findInventoryItemIndex(senderItems, transferItem);
      if (senderIndex < 0) return c.json({ error: "Sender no longer has that item" }, 409);

      const senderItem = { ...senderItems[senderIndex] };
      const transferQty = Math.max(1, Number(payload.quantity ?? transferItem?.quantity ?? 1) || 1);
      const senderQty = getInventoryItemQuantity(senderItem);
      if (senderQty < transferQty) return c.json({ error: "Sender does not have enough quantity" }, 409);

      const recipientIndex = findInventoryItemIndex(recipientItems, senderItem);
      if (senderQty === transferQty) {
        senderItems.splice(senderIndex, 1);
      } else {
        senderItem.quantity = senderQty - transferQty;
        senderItems[senderIndex] = senderItem;
      }

      if (recipientIndex >= 0) {
        const recipientItem = { ...recipientItems[recipientIndex] };
        recipientItem.quantity = getInventoryItemQuantity(recipientItem) + transferQty;
        recipientItems[recipientIndex] = recipientItem;
      } else {
        const cloned = { ...senderItem, quantity: transferQty };
        if (senderQty !== transferQty) {
          cloned.quantity = transferQty;
        }
        recipientItems.push(cloned);
      }

      const now = new Date().toISOString();
      const [senderSave, recipientSave] = await Promise.all([
        supabase.from("player_quick_items").upsert({ player_id: fromId, data: senderItems, updated_at: now }, { onConflict: "player_id" }),
        supabase.from("player_quick_items").upsert({ player_id: toId, data: recipientItems, updated_at: now }, { onConflict: "player_id" }),
      ]);
      if (senderSave.error) return c.json({ error: senderSave.error.message }, 500);
      if (recipientSave.error) return c.json({ error: recipientSave.error.message }, 500);

      const updatedMessage = {
        ...message,
        commandPayload: {
          ...payload,
          status: "accepted",
          respondedAt: Date.now(),
          respondedBy: requesterId,
          quantity: transferQty,
          senderRemainingQuantity: senderIndex >= 0 && senderItems[senderIndex] ? getInventoryItemQuantity(senderItems[senderIndex]) : 0,
          recipientQuantity: recipientIndex >= 0 && recipientItems[recipientIndex] ? getInventoryItemQuantity(recipientItems[recipientIndex]) : transferQty,
        },
      };
      await upsertJsonEntity("community_messages", messageId, updatedMessage);
      return c.json({ ok: true, message: updatedMessage, senderRemainingQuantity: updatedMessage.commandPayload.senderRemainingQuantity, recipientQuantity: updatedMessage.commandPayload.recipientQuantity });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/dm/players`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      requireDM(playerId);

      const players = await listEntityRows("app_players");
      return c.json({ players });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/dm/players/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      requireDM(playerId);

      const body = await c.req.json();
      if (!Array.isArray(body?.players)) {
        return c.json({ error: "players must be an array" }, 400);
      }

      await syncEntityRows("app_players", body.players, body?.deleteIds);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });


  app.post(`${prefix}/dm/player/delete`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const sessionPlayerId = await resolveSessionPlayerId(c);
      requireDM(sessionPlayerId);

      const body = await c.req.json();
      const playerId = typeof body?.playerId === "string" ? body.playerId : "";
      if (!playerId) return c.json({ error: "playerId is required" }, 400);

      await movePlayerToDeleted(playerId);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        /Missing session token|Invalid session|Session revoked|Session expired/i.test(message)
      ) {
        return c.json({ error: message }, 401);
      }
      if (/DM access only|Cannot delete dm/i.test(message)) {
        return c.json({ error: message }, 403);
      }
      return c.json({ error: message }, 500);
    }
  });


  app.post(`${prefix}/dm/deleted-player/purge`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const sessionPlayerId = await resolveSessionPlayerId(c);
      requireDM(sessionPlayerId);

      const body = await c.req.json();
      const playerId = typeof body?.playerId === "string" ? body.playerId : "";
      if (!playerId) return c.json({ error: "playerId is required" }, 400);

      await purgeDeletedPlayer(playerId);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/dm/deleted-players/clear`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const sessionPlayerId = await resolveSessionPlayerId(c);
      requireDM(sessionPlayerId);

      await clearDeletedPlayers();
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/dm/deleted-players`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      requireDM(playerId);

      const players = await listEntityRows("app_deleted_players");
      return c.json({ players });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/dm/deleted-players/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      requireDM(playerId);

      const body = await c.req.json();
      if (!Array.isArray(body?.players)) {
        return c.json({ error: "players must be an array" }, 400);
      }

      await syncEntityRows(
        "app_deleted_players",
        body.players,
        body?.deleteIds,
      );
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/dm/image-storage`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      requireDM(playerId);

      const images = await kv.get(imageStorageKey);
      return c.json({ images: Array.isArray(images) ? images : [] });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/dm/image-storage/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      requireDM(playerId);

      const body = await c.req.json();
      if (!Array.isArray(body?.images)) {
        return c.json({ error: "images must be an array" }, 400);
      }

      const current = await kv.get(imageStorageKey);
      const nextImages = new Map(
        (Array.isArray(current) ? current : [])
          .filter((image: any) => typeof image?.id === "string" && image.id.trim())
          .map((image: any) => [image.id.trim(), image]),
      );
      const incomingIds = body.images
        .map((image: any) => typeof image?.id === "string" ? image.id.trim() : "")
        .filter(Boolean);
      for (const id of explicitDeleteIds(body?.deleteIds, incomingIds)) {
        nextImages.delete(id);
      }
      for (const image of body.images) {
        const id = typeof image?.id === "string" ? image.id.trim() : "";
        if (id) {
          nextImages.set(id, sanitizeStoredValue({ ...image, id }));
        }
      }
      const images = Array.from(nextImages.values());
      await kv.set(imageStorageKey, images);
      return c.json({ ok: true, images });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/dm/:collection`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      requireDM(playerId);

      const collection = c.req.param("collection");
      const meta = DM_COLLECTIONS[collection as DMCollectionKey];
      if (!meta || collection === "players" || collection === "deleted-players") {
        return c.json({ error: "Unknown DM collection" }, 404);
      }

      const rows = await listCollectionRows(meta.table);
      return c.json({ [meta.responseKey]: rows });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/dm/:collection/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      requireDM(playerId);

      const collection = c.req.param("collection");

      if (collection === "player-level-categories") {
        const body = await c.req.json();
        if (!body?.playerId || !Array.isArray(body?.levelCategories)) {
          return c.json({ error: "playerId and levelCategories are required" }, 400);
        }

        const supabase = admin();
        const now = new Date().toISOString();
        const { error } = await supabase
          .from("player_level_categories")
          .upsert(
            { player_id: body.playerId, data: sanitizeStoredValue(body.levelCategories), updated_at: now },
            { onConflict: "player_id" },
          );

        if (error) return c.json({ error: error.message }, 500);
        return c.json({ ok: true });
      }

      if (collection === "player-magic-lists") {
        const body = await c.req.json();
        if (!body?.playerId || !Array.isArray(body?.magicLists)) {
          return c.json({ error: "playerId and magicLists are required" }, 400);
        }

        await kv.set(playerMagicListsKey(body.playerId), body.magicLists);
        return c.json({ ok: true });
      }

      const meta = DM_COLLECTIONS[collection as DMCollectionKey];
      if (!meta || collection === "players" || collection === "deleted-players") {
        return c.json({ error: "Unknown DM collection" }, 404);
      }

      const body = await c.req.json();
      const rows = body?.[meta.requestKey];
      if (!Array.isArray(rows)) {
        return c.json({ error: `${meta.requestKey} must be an array` }, 400);
      }

      await syncCollectionRows(
        meta.table,
        rows,
        body?.deleteIds,
        { revokeSessions: meta.revokeSessions },
      );
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/dm/player-level-categories/:playerId`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const playerId = c.req.param("playerId");
      if (!playerId) return c.json({ error: "Missing playerId" }, 400);

      const supabase = admin();
      const { data, error } = await supabase
        .from("player_level_categories")
        .select("data")
        .eq("player_id", playerId)
        .maybeSingle();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ levelCategories: data?.data ?? [] });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/dm/player-level-categories/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const body = await c.req.json();
      if (!body?.playerId || !Array.isArray(body?.levelCategories)) {
        return c.json({ error: "playerId and levelCategories are required" }, 400);
      }

      const supabase = admin();
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("player_level_categories")
        .upsert(
          { player_id: body.playerId, data: sanitizeStoredValue(body.levelCategories), updated_at: now },
          { onConflict: "player_id" },
        );

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/dm/player-magic-lists/:playerId`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const playerId = c.req.param("playerId");
      if (!playerId) return c.json({ error: "Missing playerId" }, 400);

      const magicLists = await kv.get(playerMagicListsKey(playerId));
      return c.json({ magicLists: Array.isArray(magicLists) ? magicLists : [] });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/dm/player-magic-lists/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const body = await c.req.json();
      if (!body?.playerId || !Array.isArray(body?.magicLists)) {
        return c.json({ error: "playerId and magicLists are required" }, 400);
      }

      await kv.set(playerMagicListsKey(body.playerId), body.magicLists);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/dm/tags/:kind`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      requireDM(playerId);

      const kind = assertTagKind(c.req.param("kind"));
      const tags = await listTagRows(kind);
      return c.json({ tags });
    } catch (err) {
      const message = String(err);
      const authError = /session|DM access|Invalid API key/i.test(message);
      return c.json({ error: message }, authError ? 403 : 500);
    }
  });

  app.post(`${prefix}/dm/tags/:kind/save`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      requireDM(playerId);

      const kind = assertTagKind(c.req.param("kind"));
      const body = await c.req.json();
      const tags = Array.isArray(body?.tags) ? body.tags : [];

      await syncTagRows(kind, tags, body?.deleteIds);
      return c.json({ ok: true });
    } catch (err) {
      const message = String(err);
      const authError = /session|DM access|Invalid API key/i.test(message);
      return c.json({ error: message }, authError ? 403 : 500);
    }
  });

}

registerRoutes("/make-server-8a5950b5");

Deno.serve(app.fetch);
