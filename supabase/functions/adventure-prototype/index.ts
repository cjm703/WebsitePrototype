import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import {
  PROTOTYPE_MAX_PLAYERS,
  canViewPrototypeRoom,
  createPrototypeRoom,
  resolvePrototypeAction,
  type PrototypeActionRequest,
  type PrototypeRoom,
} from "../_shared/adventure-prototype.ts";

const app = new Hono();

const admin = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const allowedApiKeys = new Set(
  [Deno.env.get("SB_PUBLISHABLE_KEY"), Deno.env.get("SUPABASE_ANON_KEY")]
    .map((value) => (value || "").trim())
    .filter(Boolean),
);

app.use("*", logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization", "apikey", "X-Session-Token"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

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

async function sha256(plain: string) {
  const data = new TextEncoder().encode(plain);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function resolveSessionPlayerId(c: any) {
  const rawToken = (c.req.header("X-Session-Token") || "").trim();
  if (!rawToken) throw new Error("Missing session token");

  const tokenHash = await sha256(rawToken);
  const { data, error } = await admin()
    .from("app_sessions")
    .select("player_id, expires_at, revoked")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid session");
  if (data.revoked) throw new Error("Session revoked");
  if (new Date(data.expires_at).getTime() < Date.now()) throw new Error("Session expired");
  return String(data.player_id);
}

async function requireDMSession(c: any) {
  const playerId = await resolveSessionPlayerId(c);
  if (playerId !== "dm") throw new Error("DM access only");
  return playerId;
}

type PrototypeRoomRow = {
  id: string;
  host_player_id: string;
  invited_player_ids: string[];
  status: PrototypeRoom["status"];
  version: number;
  state: PrototypeRoom;
  created_at: string;
  updated_at: string;
};

function roomFromRow(row: PrototypeRoomRow): PrototypeRoom {
  return {
    ...row.state,
    id: row.id,
    hostPlayerId: row.host_player_id,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadRoomRow(roomId: string): Promise<PrototypeRoomRow | null> {
  const { data, error } = await admin()
    .from("adventure_prototype_rooms")
    .select("id, host_player_id, invited_player_ids, status, version, state, created_at, updated_at")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PrototypeRoomRow | null;
}

async function broadcastRoom(room: PrototypeRoom) {
  const client = admin();
  const channel = client.channel(`adventure-prototype:${room.id}`);
  try {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const timer = setTimeout(finish, 900);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          finish();
        }
      });
    });
    if (channel.state === "joined") {
      await channel.send({
        type: "broadcast",
        event: "room-updated",
        payload: { roomId: room.id, version: room.version, status: room.status },
      });
    }
  } catch (error) {
    console.warn("Adventure prototype broadcast failed", error);
  } finally {
    await client.removeChannel(channel).catch(() => undefined);
  }
}

function actionStatus(result: { code?: string }): 400 | 403 | 409 {
  if (result.code === "conflict") return 409;
  if (result.code === "forbidden") return 403;
  return 400;
}

function authFailureStatus(message: string): 401 | 403 | 500 {
  if (/missing session|invalid session|session revoked|session expired|invalid api key/i.test(message)) return 401;
  if (/DM access/i.test(message)) return 403;
  return 500;
}

function registerRoutes(prefix: string) {
  app.get(`${prefix}/health`, (c) => c.json({ status: "ok" }));

  app.get(`${prefix}/profiles`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      await requireDMSession(c);
      const { data, error } = await admin()
        .from("app_players")
        .select("id, data")
        .neq("id", "dm")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return c.json({ profiles: (data ?? []).map((row: any) => ({
        id: String(row.id),
        name: String(row.data?.name || row.id),
      })) });
    } catch (error) {
      const message = String(error);
      return c.json({ error: message }, authFailureStatus(message));
    }
  });

  app.get(`${prefix}/rooms`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      const playerId = await resolveSessionPlayerId(c);
      let query = admin()
        .from("adventure_prototype_rooms")
        .select("id, host_player_id, invited_player_ids, status, version, state, created_at, updated_at")
        .neq("status", "closed")
        .order("updated_at", { ascending: false })
        .limit(20);
      if (playerId !== "dm") query = query.contains("invited_player_ids", [playerId]);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return c.json({ rooms: (data ?? []).map((row: any) => roomFromRow(row as PrototypeRoomRow)) });
    } catch (error) {
      const message = String(error);
      return c.json({ error: message }, authFailureStatus(message));
    }
  });

  app.post(`${prefix}/rooms`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      const hostPlayerId = await requireDMSession(c);
      const body = await c.req.json();
      const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
      const invitedPlayerIds = Array.from(new Set(
        (Array.isArray(body?.invitedPlayerIds) ? body.invitedPlayerIds : [])
          .map((value: unknown) => typeof value === "string" ? value.trim() : "")
          .filter((value: string) => value && value !== "dm"),
      )).slice(0, PROTOTYPE_MAX_PLAYERS) as string[];
      if (invitedPlayerIds.length === 0) return c.json({ error: "Invite at least one player." }, 400);

      const { data: playerRows, error: playerError } = await admin()
        .from("app_players")
        .select("id, data")
        .in("id", invitedPlayerIds);
      if (playerError) throw new Error(playerError.message);
      if ((playerRows ?? []).length !== invitedPlayerIds.length) {
        return c.json({ error: "One or more invited profiles no longer exist." }, 400);
      }
      const profileById = new Map<string, any>(
        (playerRows ?? []).map((row: any): [string, any] => [String(row.id), row]),
      );
      const now = new Date().toISOString();
      const room = createPrototypeRoom({
        id: crypto.randomUUID(),
        name: name || "Adventure Prototype",
        hostPlayerId,
        members: invitedPlayerIds.map((playerId) => ({
          playerId,
          displayName: String(profileById.get(playerId)?.data?.name || playerId),
        })),
        now,
      });
      const { error } = await admin().from("adventure_prototype_rooms").insert({
        id: room.id,
        host_player_id: room.hostPlayerId,
        invited_player_ids: invitedPlayerIds,
        status: room.status,
        version: room.version,
        state: room,
        created_at: room.createdAt,
        updated_at: room.updatedAt,
      });
      if (error) throw new Error(error.message);
      await broadcastRoom(room);
      return c.json({ room }, 201);
    } catch (error) {
      const message = String(error);
      return c.json({ error: message }, authFailureStatus(message));
    }
  });

  app.get(`${prefix}/rooms/:roomId`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      const playerId = await resolveSessionPlayerId(c);
      const row = await loadRoomRow(c.req.param("roomId"));
      if (!row) return c.json({ error: "Adventure room not found." }, 404);
      const room = roomFromRow(row);
      if (!canViewPrototypeRoom(room, playerId)) return c.json({ error: "You are not invited to this room." }, 403);
      return c.json({ room });
    } catch (error) {
      const message = String(error);
      return c.json({ error: message }, authFailureStatus(message));
    }
  });

  app.post(`${prefix}/rooms/:roomId/actions`, async (c) => {
    try {
      const unauthorized = requireApiKey(c);
      if (unauthorized) return unauthorized;
      const actorId = await resolveSessionPlayerId(c);
      const row = await loadRoomRow(c.req.param("roomId"));
      if (!row) return c.json({ error: "Adventure room not found." }, 404);
      const room = roomFromRow(row);
      const body = await c.req.json();
      const action: PrototypeActionRequest = {
        id: typeof body?.id === "string" ? body.id : "",
        type: body?.type,
        expectedVersion: Number(body?.expectedVersion),
        payload: body?.payload,
      };
      const result = resolvePrototypeAction(room, action, actorId, new Date().toISOString());
      if (!result.ok) {
        return c.json({ error: result.reason, code: result.code, room: result.room }, actionStatus(result));
      }
      if (!result.changed) return c.json({ room: result.room, duplicate: true });

      const nextRoom = result.room;
      const { data, error } = await admin()
        .from("adventure_prototype_rooms")
        .update({
          status: nextRoom.status,
          version: nextRoom.version,
          state: nextRoom,
          updated_at: nextRoom.updatedAt,
        })
        .eq("id", room.id)
        .eq("version", room.version)
        .select("id, host_player_id, invited_player_ids, status, version, state, created_at, updated_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        const latestRow = await loadRoomRow(room.id);
        const latest = latestRow ? roomFromRow(latestRow) : room;
        return c.json({ error: "The room changed before this action was saved.", code: "conflict", room: latest }, 409);
      }
      const savedRoom = roomFromRow(data as PrototypeRoomRow);
      await broadcastRoom(savedRoom);
      return c.json({ room: savedRoom });
    } catch (error) {
      const message = String(error);
      return c.json({ error: message }, authFailureStatus(message));
    }
  });
}

registerRoutes("/adventure-prototype");

Deno.serve(app.fetch);
