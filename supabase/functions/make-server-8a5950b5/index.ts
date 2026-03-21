import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.ts";

const app = new Hono();

const KNOWN_PROFILE_SEEDS = [
  { id: "dm", name: "DM" },
  { id: "player-1", name: "Player 1" },
  { id: "player-2", name: "Player 2" },
  { id: "player-3", name: "Player 3" },
];

const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

const expectedApiKey = (
  Deno.env.get("SB_PUBLISHABLE_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY") ||
  ""
).trim();

function requireApiKey(c: any) {
  const apiKey = (c.req.header("apikey") || "").trim();
  if (!expectedApiKey || apiKey !== expectedApiKey) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  return null;
}

app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "X-Session-Token"],
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
