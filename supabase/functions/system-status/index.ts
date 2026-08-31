import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const app = new Hono();
const MAX_OBJECTS_PER_BUCKET = 10000;

const admin = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const allowedApiKeys = new Set(
  [Deno.env.get("SB_PUBLISHABLE_KEY"), Deno.env.get("SUPABASE_ANON_KEY")]
    .map((value) => (value || "").trim())
    .filter(Boolean),
);

app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization", "apikey", "X-Session-Token"],
  allowMethods: ["GET", "OPTIONS"],
  maxAge: 600,
}));

async function sha256(value: string) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireApiKey(c: any) {
  const apiKey = String(c.req.header("apikey") || "").trim();
  const authorization = String(c.req.header("Authorization") || "").trim();
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const provided = apiKey || bearer;
  if (!provided || allowedApiKeys.size === 0 || !allowedApiKeys.has(provided)) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  return null;
}

async function requireDMSession(c: any) {
  const rawToken = String(c.req.header("X-Session-Token") || "").trim();
  if (!rawToken) throw new Error("Missing session token");
  const { data, error } = await admin()
    .from("app_sessions")
    .select("player_id, expires_at, revoked")
    .eq("token_hash", await sha256(rawToken))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid session");
  if (data.revoked) throw new Error("Session revoked");
  if (new Date(data.expires_at).getTime() < Date.now()) throw new Error("Session expired");
  if (data.player_id !== "dm") throw new Error("DM access only");
}

async function readBucketUsage(bucketName: string) {
  const storage = admin().storage.from(bucketName);
  const pendingPaths = [""];
  let bytes = 0;
  let objects = 0;
  let truncated = false;

  while (pendingPaths.length > 0 && !truncated) {
    const path = pendingPaths.shift() || "";
    let offset = 0;
    while (!truncated) {
      const { data, error } = await storage.list(path, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`${bucketName}: ${error.message}`);
      const entries = Array.isArray(data) ? data : [];
      for (const entry of entries) {
        if (entry.id) {
          objects += 1;
          bytes += Math.max(0, Number(entry.metadata?.size || 0));
          if (objects >= MAX_OBJECTS_PER_BUCKET) {
            truncated = true;
            break;
          }
        } else if (entry.name) {
          pendingPaths.push(path ? `${path}/${entry.name}` : entry.name);
        }
      }
      if (entries.length < 100) break;
      offset += entries.length;
    }
  }
  return { bytes, objects, truncated };
}

app.get("/system-status/health", (c) => c.json({ status: "ok" }));

app.get("/system-status/storage", async (c) => {
  try {
    const unauthorized = requireApiKey(c);
    if (unauthorized) return unauthorized;
    await requireDMSession(c);

    const supabase = admin();
    const warnings: string[] = [];
    let databaseBytes: number | null = null;
    let tables: Array<{ name: string; bytes: number; estimatedRows: number }> = [];
    const { data: rawDatabaseStatus, error: databaseError } = await supabase.rpc("app_system_storage_status");
    if (databaseError) {
      warnings.push(`Database telemetry unavailable: ${databaseError.message}`);
    } else {
      const databaseStatus = rawDatabaseStatus as { databaseBytes?: number; tables?: unknown[] } | null;
      databaseBytes = databaseStatus ? Math.max(0, Number(databaseStatus.databaseBytes || 0)) : null;
      tables = Array.isArray(databaseStatus?.tables)
        ? databaseStatus.tables.map((rawTable) => {
            const table = rawTable as { name?: unknown; bytes?: unknown; estimatedRows?: unknown };
            return {
              name: String(table.name || "Unknown"),
              bytes: Math.max(0, Number(table.bytes || 0)),
              estimatedRows: Math.max(0, Number(table.estimatedRows || 0)),
            };
          })
        : [];
    }

    const [{ data: buckets, error: bucketError }, activeSessions, allSessions] = await Promise.all([
      supabase.storage.listBuckets(),
      supabase.from("app_sessions").select("token_hash", { count: "exact", head: true }).eq("revoked", false).gt("expires_at", new Date().toISOString()),
      supabase.from("app_sessions").select("token_hash", { count: "exact", head: true }),
    ]);
    if (bucketError) warnings.push(`Storage bucket list unavailable: ${bucketError.message}`);
    if (activeSessions.error) warnings.push(`Active session count unavailable: ${activeSessions.error.message}`);
    if (allSessions.error) warnings.push(`Session count unavailable: ${allSessions.error.message}`);

    const bucketMetrics: Array<{ name: string; bytes: number; objects: number; public: boolean; truncated: boolean }> = [];
    for (const bucket of buckets || []) {
      try {
        bucketMetrics.push({ name: bucket.name, public: Boolean(bucket.public), ...await readBucketUsage(bucket.name) });
      } catch (error) {
        warnings.push(`Could not inspect bucket ${bucket.name}: ${String(error)}`);
        bucketMetrics.push({ name: bucket.name, public: Boolean(bucket.public), bytes: 0, objects: 0, truncated: false });
      }
    }

    return c.json({
      checkedAt: new Date().toISOString(),
      database: { bytes: databaseBytes, tables },
      objectStorage: {
        bytes: bucketMetrics.reduce((sum, bucket) => sum + bucket.bytes, 0),
        objects: bucketMetrics.reduce((sum, bucket) => sum + bucket.objects, 0),
        buckets: bucketMetrics,
      },
      sessions: { active: activeSessions.count || 0, total: allSessions.count || 0 },
      warnings,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 403);
  }
});

Deno.serve(app.fetch);
