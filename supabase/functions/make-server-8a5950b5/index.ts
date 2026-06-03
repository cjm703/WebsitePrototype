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

const authKey = (profileId: string) => `inet-authcode::${profileId}`;
const pfpKey = (userId: string) => `inet-pfp::${userId}`;
const playerMagicListsKey = (playerId: string) => `inet-player-magic-lists::${playerId}`;
const imageStorageKey = "inet-image-storage";
const githubBackupStatusKey = "inet-github-backup-status";
const GITHUB_API_BASE = "https://api.github.com";


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

async function replaceEntityRows(
  table: "app_players" | "app_deleted_players",
  rows: Array<{ id: string; [key: string]: any }>,
) {
  const supabase = admin();
  const now = new Date().toISOString();

  const nextIds = rows
    .map((row) => typeof row?.id === "string" ? row.id.trim() : "")
    .filter(Boolean);

  const { data: existingRows, error: existingError } = await supabase
    .from(table)
    .select("id");

  if (existingError) throw new Error(existingError.message);

  const existingIds = (existingRows ?? []).map((row: any) => row.id as string);
  const idsToDelete = existingIds.filter((id) => !nextIds.includes(id));

  const payload = rows.map((row) => ({
    id: row.id,
    data: { ...row, id: row.id },
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

type GitHubBackupLastRun = {
  status: "idle" | "success" | "error";
  trigger: "manual" | "weekly";
  startedAt: string;
  finishedAt?: string;
  snapshotPath?: string;
  latestPath?: string;
  commitSha?: string;
  commitUrl?: string;
  error?: string;
};

type GitHubBackupConfig = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  basePath: string;
  triggerSecret: string;
};

function getGitHubBackupConfig(): GitHubBackupConfig {
  return {
    token: String(Deno.env.get("GITHUB_BACKUP_TOKEN") || "").trim(),
    owner: String(Deno.env.get("GITHUB_BACKUP_OWNER") || "").trim(),
    repo: String(Deno.env.get("GITHUB_BACKUP_REPO") || "").trim(),
    branch: String(Deno.env.get("GITHUB_BACKUP_BRANCH") || "main").trim() || "main",
    basePath: String(Deno.env.get("GITHUB_BACKUP_BASE_PATH") || "backups/inet").trim().replace(/^\/+|\/+$/g, "") || "backups/inet",
    triggerSecret: String(Deno.env.get("INET_BACKUP_TRIGGER_SECRET") || "").trim(),
  };
}

function getPublicGitHubBackupStatus(config: GitHubBackupConfig, lastBackup: GitHubBackupLastRun | null) {
  return {
    configured: !!(config.token && config.owner && config.repo),
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    basePath: config.basePath,
    triggerSecretConfigured: !!config.triggerSecret,
    lastBackup,
  };
}

function assertGitHubBackupConfigured(config: GitHubBackupConfig) {
  if (!config.token || !config.owner || !config.repo) {
    throw new Error("GitHub backup is not configured. Set GITHUB_BACKUP_TOKEN, GITHUB_BACKUP_OWNER, and GITHUB_BACKUP_REPO.");
  }
}

function ensureGitHubBackupApiKey(c: any) {
  const unauthorized = requireApiKey(c);
  if (unauthorized) throw unauthorized;
}

async function authorizeGitHubBackupRequest(c: any) {
  const unauthorized = requireApiKey(c);
  if (unauthorized) return unauthorized;

  const config = getGitHubBackupConfig();
  const providedSecret = String(c.req.header("X-Backup-Secret") || "").trim();
  if (config.triggerSecret && providedSecret && providedSecret === config.triggerSecret) {
    return null;
  }

  const playerId = await resolveSessionPlayerId(c);
  requireDM(playerId);
  return null;
}

function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function readGitHubFileSha(config: GitHubBackupConfig, path: string) {
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path}?ref=${encodeURIComponent(config.branch)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "inet-backup-bot",
      },
    },
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub read failed (${res.status}): ${body}`);
  }

  const body = await res.json();
  return typeof body?.sha === "string" ? body.sha : null;
}

async function writeGitHubFile(
  config: GitHubBackupConfig,
  path: string,
  content: string,
  message: string,
) {
  const sha = await readGitHubFileSha(config, path);
  const payload: Record<string, unknown> = {
    message,
    content: encodeBase64Utf8(content),
    branch: config.branch,
    committer: {
      name: "I-Net Backup Bot",
      email: "inet-backup-bot@users.noreply.github.com",
    },
  };
  if (sha) payload.sha = sha;

  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "inet-backup-bot",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub write failed (${res.status}): ${body}`);
  }

  return await res.json();
}

async function loadLastGitHubBackupRun() {
  const value = await kv.get(githubBackupStatusKey);
  return value && typeof value === "object" ? value as GitHubBackupLastRun : null;
}

async function saveLastGitHubBackupRun(status: GitHubBackupLastRun) {
  await kv.set(githubBackupStatusKey, status);
}

async function buildGitHubBackupPayload() {
  const players = await listEntityRows("app_players");
  const playerIds = players
    .map((player) => String(player?.id || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const [
    quickItems,
    sourceUsage,
    activityLog,
    skillSettings,
    skillProficiencies,
    equipmentSlots,
    statusEffects,
    levelCategories,
    nodeUnlocks,
    customization,
    placedStickers,
    wikiDrafts,
    sites,
    customPanelStyles,
    wikiTags,
    news,
    sessionLogState,
    sessionPlayerNotes,
    campaignTimelineState,
    timelineCalendarPresets,
    deletedPlayers,
    items,
    cards,
    infos,
    infoSubTabs,
    nodeTrees,
    notifications,
    itemTags,
    cardTags,
    infoTags,
    statusTags,
    communityMessages,
    communityImages,
    communityNpcAccounts,
    communityCustomReactions,
    communityReadState,
    playerCommunityProfiles,
    commerceShops,
    commerceLedger,
    commerceCarts,
    nexusNomadState,
    intelliMapsState,
    partyColorState,
    partyColorCursors,
    calendarWeatherState,
    dmCustomizeState,
    arcadeCatalogState,
    arcadeLeaderboardState,
    playerArcadeProfiles,
    imageStorage,
  ] = await Promise.all([
    listPlayerScopedRows("player_quick_items"),
    listPlayerScopedRows("player_source_usage_log"),
    listPlayerScopedRows("player_activity_log"),
    listPlayerScopedRows("player_skill_settings"),
    listPlayerScopedRows("player_skill_proficiencies"),
    listPlayerScopedRows("player_equipment_slots"),
    listPlayerScopedRows("player_status_effects"),
    listPlayerScopedRows("player_level_categories"),
    listPlayerScopedRows("player_node_tree_unlocks"),
    listPlayerScopedRows("player_customization"),
    listPlayerScopedRows("player_placed_stickers"),
    listPlayerScopedRows("player_wiki_editor_drafts"),
    listCollectionRows("app_sites"),
    listCollectionRows("app_custom_panel_styles"),
    listTagRows("wiki"),
    listCollectionRows("app_news"),
    loadSingletonCollectionRow("app_session_log_state"),
    loadSingletonCollectionRow("app_session_player_notes"),
    loadSingletonCollectionRow("app_campaign_timeline_state"),
    loadSingletonCollectionRow("app_timeline_calendar_presets"),
    listEntityRows("app_deleted_players"),
    listCollectionRows("app_items"),
    listCollectionRows("app_cards"),
    listCollectionRows("app_infos"),
    listCollectionRows("app_info_subtabs"),
    listCollectionRows("app_node_trees"),
    listCollectionRows("app_notifications"),
    listTagRows("item"),
    listTagRows("card"),
    listTagRows("info"),
    listTagRows("status"),
    listCollectionRows("community_messages"),
    listCollectionRows("community_images"),
    listCollectionRows("community_npc_accounts"),
    listCollectionRows("community_custom_reactions"),
    listPlayerScopedRows("community_read_state"),
    listPlayerScopedRows("player_community_profile"),
    listCollectionRows("app_commerce_shops"),
    listCollectionRows("app_commerce_ledger"),
    listPlayerScopedRows("player_commerce_cart"),
    listCollectionRows("app_nexus_nomad_state"),
    loadSingletonCollectionRow("app_intelli_maps_state"),
    loadSingletonCollectionRow("app_party_color_state"),
    loadSingletonCollectionRow("app_party_color_cursors"),
    loadSingletonCollectionRow("app_calendar_weather_state"),
    loadSingletonCollectionRow("app_dm_customize_state"),
    loadSingletonCollectionRow("app_arcade_catalog_state"),
    loadSingletonCollectionRow("app_arcade_leaderboard_state"),
    listPlayerScopedRows("player_arcade_profiles"),
    kv.get(imageStorageKey),
  ]);

  const magicLists = await Promise.all(
    playerIds.map(async (playerId) => {
      const value = await kv.get(playerMagicListsKey(playerId));
      return {
        playerId,
        data: Array.isArray(value) ? value : [],
      };
    }),
  );

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: "inet-dm-backup",
    includes: [
      "site-content",
      "personal-files",
      "wiki",
      "news",
      "session-log",
      "campaign-timeline",
      "community",
      "commerce",
      "site-states",
      "arcade",
    ],
    siteContent: {
      deletedPlayers,
      items,
      cards,
      infos,
      infoSubTabs,
      nodeTrees,
      notifications,
      imageStorage: Array.isArray(imageStorage) ? imageStorage : [],
      tags: {
        item: itemTags,
        card: cardTags,
        info: infoTags,
        status: statusTags,
        wiki: wikiTags,
      },
    },
    personalFiles: {
      players,
      quickItems,
      sourceUsage,
      activityLog,
      skillSettings,
      skillProficiencies,
      equipmentSlots,
      statusEffects,
      levelCategories,
      nodeUnlocks,
      customization,
      placedStickers,
      wikiDrafts,
      magicLists,
    },
    wiki: {
      sites,
      customPanelStyles,
      wikiTags,
    },
    community: {
      messages: communityMessages,
      images: communityImages,
      npcAccounts: communityNpcAccounts,
      customReactions: communityCustomReactions,
      readState: communityReadState,
      playerProfiles: playerCommunityProfiles,
    },
    commerce: {
      shops: commerceShops,
      ledger: commerceLedger,
      carts: commerceCarts,
    },
    news,
    sessionLog: {
      state: sessionLogState,
      playerNotes: sessionPlayerNotes,
    },
    campaignTimeline: {
      state: campaignTimelineState,
      calendarPresets: timelineCalendarPresets,
    },
    siteStates: {
      nexusNomad: nexusNomadState,
      intelliMaps: intelliMapsState,
      partyColor: {
        state: partyColorState,
        cursors: partyColorCursors,
      },
      calendarWeather: calendarWeatherState,
      dmCustomize: dmCustomizeState,
    },
    arcade: {
      catalogState: arcadeCatalogState,
      leaderboardState: arcadeLeaderboardState,
      playerProfiles: playerArcadeProfiles,
    },
  };
}

async function runGitHubBackup(trigger: "manual" | "weekly") {
  const config = getGitHubBackupConfig();
  assertGitHubBackupConfigured(config);

  const startedAt = new Date().toISOString();
  const payload = await buildGitHubBackupPayload();
  const timestamp = startedAt.replace(/[:.]/g, "-");
  const datePrefix = startedAt.slice(0, 10);
  const snapshotPath = `${config.basePath}/snapshots/${datePrefix}/inet-backup-${timestamp}.json`;
  const latestPath = `${config.basePath}/latest.json`;

  try {
    const content = JSON.stringify(payload, null, 2);
    const snapshotWrite = await writeGitHubFile(
      config,
      snapshotPath,
      content,
      `[I-Net Backup] ${trigger} snapshot ${startedAt}`,
    );
    const latestWrite = await writeGitHubFile(
      config,
      latestPath,
      content,
      `[I-Net Backup] update latest backup (${trigger})`,
    );

    const commitSha =
      snapshotWrite?.commit?.sha ||
      latestWrite?.commit?.sha ||
      "";

    const status: GitHubBackupLastRun = {
      status: "success",
      trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      snapshotPath,
      latestPath,
      commitSha: commitSha || undefined,
      commitUrl: commitSha
        ? `https://github.com/${config.owner}/${config.repo}/commit/${commitSha}`
        : undefined,
    };
    await saveLastGitHubBackupRun(status);
    return status;
  } catch (err) {
    const status: GitHubBackupLastRun = {
      status: "error",
      trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      snapshotPath,
      latestPath,
      error: err instanceof Error ? err.message : String(err),
    };
    await saveLastGitHubBackupRun(status);
    throw err;
  }
}

async function replaceCollectionRows(
  table: string,
  rows: Array<{ id: string; [key: string]: any }>,
  opts?: { revokeSessions?: boolean },
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

  const nextIds = dedupedRows.map((row) => row.id);

  const { data: existingRows, error: existingError } = await supabase
    .from(table)
    .select("id");

  if (existingError) throw new Error(existingError.message);

  const existingIds = (existingRows ?? []).map((row: any) => row.id as string);
  const idsToDelete = existingIds.filter((id) => !nextIds.includes(id));

  const payload = dedupedRows.map((row) => ({
    id: row.id,
    data: { ...row, id: row.id },
    updated_at: now,
  }));

  if (payload.length > 0) {
    const { error: upsertError } = await supabase
      .from(table)
      .upsert(payload, { onConflict: "id" });

    if (upsertError) throw new Error(upsertError.message);
  }

  if (idsToDelete.length > 0) {
    if (opts?.revokeSessions) {
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

async function replaceTagRows(kind: DMTagKind, rows: Array<{ id: string; [key: string]: any }>) {
  const supabase = admin();
  const now = new Date().toISOString();

  const dedupedRows = Array.from(
    new Map(
      rows
        .filter((row) => typeof row?.id === "string" && row.id.trim())
        .map((row) => [row.id.trim(), { ...row, id: row.id.trim() }])
    ).values()
  );

  const { data: existingRows, error: existingError } = await supabase
    .from("app_tags")
    .select("id")
    .eq("kind", kind);

  if (existingError) throw new Error(existingError.message);

  const nextIds = dedupedRows.map((row) => `${kind}:${row.id}`);
  const existingIds = (existingRows ?? []).map((row: any) => String(row.id));
  const idsToDelete = existingIds.filter((id) => !nextIds.includes(id));

  const payload = dedupedRows.map((row) => ({
    id: `${kind}:${row.id}`,
    kind,
    data: { ...row, id: row.id },
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

function registerRoutes(prefix: string) {
  app.get(`${prefix}/health`, (c) => {
    return c.json({ status: "ok", prefix });
  });

  app.post(`${prefix}/auth-codes/set`, async (c) => {
    const unauthorized = requireApiKey(c);
    if (unauthorized) return unauthorized;

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
  });

  app.post(`${prefix}/auth-codes/verify`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const body = await c.req.json();
      console.log("VERIFY BODY:", body);

      const { profileId, code } = body;
      if (!profileId || typeof profileId !== "string") {
        return c.json({ error: "Missing or invalid profileId" }, 400);
      }

      const key = authKey(profileId);
      console.log("VERIFY KEY:", key);

      const stored = await kv.get(key);
      console.log("VERIFY STORED:", stored);

      const playerId = profileId;

      await ensurePlayerExists(playerId, playerId === "dm" ? "DM" : undefined);

      if (!stored || !stored.hash) {
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
        return c.json({
          valid: false,
          hasCode: true,
        });
      }

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
    const unauthorized = requireApiKey(c);
    if (unauthorized) return unauthorized;

    const profileId = c.req.param("profileId");
    if (!profileId) {
      return c.json({ error: "Missing profileId" }, 400);
    }

    await kv.del(authKey(profileId));
    return c.json({ success: true });
  });

  app.post(`${prefix}/auth-codes/migrate`, async (c) => {
    const unauthorized = requireApiKey(c);
    if (unauthorized) return unauthorized;

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
  });

  app.post(`${prefix}/profile-picture/upload`, async (c) => {
    const unauthorized = requireApiKey(c);
    if (unauthorized) return unauthorized;

    const { userId, imageData } = await c.req.json();
    if (!userId || typeof userId !== "string") {
      return c.json({ error: "Missing or invalid userId" }, 400);
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
    const unauthorized = requireApiKey(c);
    if (unauthorized) return unauthorized;

    const userId = c.req.param("userId");
    if (!userId) {
      return c.json({ error: "Missing userId" }, 400);
    }

    await kv.del(pfpKey(userId));
    return c.json({ success: true });
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
            { player_id: playerId, data: body.quickItems, updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("sourceUsage" in body) {
        writes.push(
          supabase.from("player_source_usage_log").upsert(
            { player_id: playerId, data: body.sourceUsage, updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("activityLog" in body) {
        writes.push(
          supabase.from("player_activity_log").upsert(
            { player_id: playerId, data: body.activityLog, updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("skillSettings" in body) {
        writes.push(
          supabase.from("player_skill_settings").upsert(
            { player_id: playerId, data: body.skillSettings, updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("skillProficiencies" in body) {
        writes.push(
          supabase.from("player_skill_proficiencies").upsert(
            { player_id: playerId, data: body.skillProficiencies, updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("equipmentSlots" in body) {
        writes.push(
          supabase.from("player_equipment_slots").upsert(
            { player_id: playerId, data: body.equipmentSlots, updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("statusEffects" in body) {
        writes.push(
          supabase.from("player_status_effects").upsert(
            { player_id: playerId, data: body.statusEffects, updated_at: now },
            { onConflict: "player_id" },
          ),
        );
      }

      if ("levelCategories" in body) {
        writes.push(
          supabase.from("player_level_categories").upsert(
            { player_id: playerId, data: body.levelCategories, updated_at: now },
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
            { player_id: playerId, data: body.nodeUnlocks, updated_at: now },
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
              data: { ...currentPlayer, ...body.playerPatch },
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
              data: item,
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
        data: { ...row, id: row.id },
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
        { player_id: playerId, data: dataValue, updated_at: now },
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
        { id, data: { ...(dataValue ?? {}), id }, updated_at: now },
        { onConflict: "id" },
      );

    if (error) throw new Error(error.message);
  }

  app.get(`${prefix}/wiki/bootstrap`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const [sites, players, wikiTags, customPanelStyles, imageStorage] = await Promise.all([
        listCollectionRows("app_sites"),
        listEntityRows("app_players"),
        listTagRows("wiki"),
        listCollectionRows("app_custom_panel_styles"),
        kv.get(imageStorageKey),
      ]);

      return c.json({ sites, players, wikiTags, customPanelStyles, imageStorage: Array.isArray(imageStorage) ? imageStorage : [] });
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

      await replaceCollectionRows("app_sites", sites);
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

      await replaceCollectionRows("app_custom_panel_styles", customPanelStyles);
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
      await replaceCollectionRows("community_npc_accounts", npcAccounts);
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

      await replaceEntityRows("app_players", body.players);
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

      await replaceEntityRows("app_deleted_players", body.players);
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

      await kv.set(imageStorageKey, body.images);
      return c.json({ ok: true });
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
            { player_id: body.playerId, data: body.levelCategories, updated_at: now },
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

      await replaceCollectionRows(meta.table, rows, { revokeSessions: meta.revokeSessions });
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
          { player_id: body.playerId, data: body.levelCategories, updated_at: now },
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

  app.get(`${prefix}/dm/backups/github/status`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const requesterId = await resolveSessionPlayerId(c);
      requireDM(requesterId);

      const config = getGitHubBackupConfig();
      const lastBackup = await loadLastGitHubBackupRun();
      return c.json({
        status: getPublicGitHubBackupStatus(config, lastBackup),
      });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.post(`${prefix}/dm/backups/github/run`, async (c) => {
    try {
      const unauthorized = await authorizeGitHubBackupRequest(c);
      if (unauthorized) return unauthorized;

      const body = await c.req.json().catch(() => ({}));
      const trigger = body?.trigger === "weekly" ? "weekly" : "manual";
      const status = await runGitHubBackup(trigger);
      const config = getGitHubBackupConfig();

      return c.json({
        ok: true,
        status,
        config: getPublicGitHubBackupStatus(config, status),
      });
    } catch (err) {
      const config = getGitHubBackupConfig();
      const lastBackup = await loadLastGitHubBackupRun();
      return c.json(
        {
          error: err instanceof Error ? err.message : String(err),
          status: getPublicGitHubBackupStatus(config, lastBackup),
        },
        500,
      );
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

      await replaceTagRows(kind, tags);
      return c.json({ ok: true });
    } catch (err) {
      const message = String(err);
      const authError = /session|DM access|Invalid API key/i.test(message);
      return c.json({ error: message }, authError ? 403 : 500);
    }
  });

  app.get(`${prefix}/dm/test`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const playerId = await resolveSessionPlayerId(c);
      requireDM(playerId);

      return c.json({ ok: true, dm: true });
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }
  });

  app.get(`${prefix}/debug-kv`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;

      const testKey = "debug-test";
      await kv.set(testKey, { ok: true, time: Date.now() });
      const value = await kv.get(testKey);

      return c.json({
        success: true,
        value,
      });
    } catch (err) {
      console.log("DEBUG KV ERROR:", err);
      return c.json({ error: String(err) }, 500);
    }
  });
}

registerRoutes("/make-server-8a5950b5");

Deno.serve(app.fetch);
