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
const wikiBlockPresetsKey = "inet-wiki-block-presets";
const wikiArticleRevisionsKey = "inet-wiki-article-revisions";
const wikiDeletedSitesKey = "inet-wiki-deleted-sites";
const wikiTemplatesKey = "inet-wiki-templates";
const wikiBlockStylePresetsKey = "inet-wiki-block-style-presets";


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
