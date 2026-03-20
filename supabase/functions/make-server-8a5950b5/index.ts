import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";

const app = new Hono();

app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
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

const authKey = (profileId: string) => `inet-authcode::${profileId}`;
const pfpKey = (userId: string) => `inet-pfp::${userId}`;

function registerRoutes(prefix: string) {
  app.get(`${prefix}/health`, (c) => {
    return c.json({ status: "ok", prefix });
  });

  app.post(`${prefix}/auth-codes/set`, async (c) => {
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

    if (!stored || !stored.hash) {
      return c.json({ valid: true, hasCode: false });
    }

    const inputHash = await sha256(code || "");
    const valid = inputHash === stored.hash;

    return c.json({
      valid,
      hasCode: true,
    });
  } catch (err) {
    console.log("VERIFY ERROR FULL:", err);
    return c.json({ error: String(err) }, 500);
  }
});

  app.post(`${prefix}/auth-codes/status`, async (c) => {
    try {
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

  app.delete(`${prefix}/auth-codes/:profileId`, async (c) => {
    const profileId = c.req.param("profileId");
    if (!profileId) {
      return c.json({ error: "Missing profileId" }, 400);
    }

    await kv.del(authKey(profileId));
    return c.json({ success: true });
  });

  app.post(`${prefix}/auth-codes/migrate`, async (c) => {
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
    const userId = c.req.param("userId");
    if (!userId) {
      return c.json({ error: "Missing userId" }, 400);
    }

    await kv.del(pfpKey(userId));
    return c.json({ success: true });
  });

  app.get(`${prefix}/debug-kv`, async (c) => {
    try {
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