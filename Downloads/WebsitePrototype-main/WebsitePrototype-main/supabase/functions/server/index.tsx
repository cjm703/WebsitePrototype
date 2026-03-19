import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
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

// ========================
// Utility: SHA-256 hashing (server-side only)
// ========================
async function sha256(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// KV key for auth codes
const authKey = (profileId: string) => `inet-authcode::${profileId}`;

// DM master password — only lives server-side, never sent to clients
const DM_PLAIN_PASSWORD = "Blobgorb";

// Seed the DM auth code into KV if it doesn't exist yet
async function ensureDmAuthCode(): Promise<void> {
  const existing = await kv.get(authKey("dm"));
  if (!existing) {
    const hash = await sha256(DM_PLAIN_PASSWORD);
    await kv.set(authKey("dm"), { hash });
    console.log("Seeded DM auth code into KV store");
  }
}

// Seed on startup
ensureDmAuthCode().catch((err) => console.log("Error seeding DM auth code:", err));

// Health check endpoint
app.get("/make-server-8a5950b5/health", (c) => {
  return c.json({ status: "ok" });
});

// ========================
// Auth code routes
// ========================

/**
 * POST /auth-codes/set
 * Body: { profileId: string, code: string }
 * Hashes the code server-side and stores it in KV.
 */
app.post("/make-server-8a5950b5/auth-codes/set", async (c) => {
  try {
    const { profileId, code } = await c.req.json();
    if (!profileId || typeof profileId !== "string") {
      return c.json({ error: "Missing or invalid profileId" }, 400);
    }
    if (!code || typeof code !== "string") {
      return c.json({ error: "Missing or invalid code" }, 400);
    }
    const hash = await sha256(code);
    await kv.set(authKey(profileId), { hash });
    console.log(`Auth code set for profile: ${profileId}`);
    return c.json({ success: true });
  } catch (err) {
    console.log("Error setting auth code:", err);
    return c.json({ error: `Failed to set auth code: ${err}` }, 500);
  }
});

/**
 * POST /auth-codes/verify
 * Body: { profileId: string, code: string }
 * Returns { valid: boolean, hasCode: boolean }
 */
app.post("/make-server-8a5950b5/auth-codes/verify", async (c) => {
  try {
    const { profileId, code } = await c.req.json();
    if (!profileId || typeof profileId !== "string") {
      return c.json({ error: "Missing or invalid profileId" }, 400);
    }

    const stored = await kv.get(authKey(profileId));
    if (!stored || !stored.hash) {
      // No auth code set — always valid (no code required)
      return c.json({ valid: true, hasCode: false });
    }

    const inputHash = await sha256(code || "");
    const valid = inputHash === stored.hash;
    return c.json({ valid, hasCode: true });
  } catch (err) {
    console.log("Error verifying auth code:", err);
    return c.json({ error: `Failed to verify auth code: ${err}` }, 500);
  }
});

/**
 * POST /auth-codes/status
 * Body: { profileIds: string[] }
 * Returns { statuses: Record<string, boolean> } — true if code is set
 */
app.post("/make-server-8a5950b5/auth-codes/status", async (c) => {
  try {
    const { profileIds } = await c.req.json();
    if (!Array.isArray(profileIds)) {
      return c.json({ error: "profileIds must be an array" }, 400);
    }

    const statuses: Record<string, boolean> = {};
    // Fetch all at once using mget
    if (profileIds.length > 0) {
      const keys = profileIds.map(authKey);
      const values = await kv.mget(keys);
      profileIds.forEach((id, i) => {
        statuses[id] = !!(values[i] && values[i].hash);
      });
    }

    return c.json({ statuses });
  } catch (err) {
    console.log("Error checking auth code statuses:", err);
    return c.json({ error: `Failed to check auth code statuses: ${err}` }, 500);
  }
});

/**
 * DELETE /auth-codes/:profileId
 * Removes the auth code for a profile.
 */
app.delete("/make-server-8a5950b5/auth-codes/:profileId", async (c) => {
  try {
    const profileId = c.req.param("profileId");
    if (!profileId) {
      return c.json({ error: "Missing profileId" }, 400);
    }
    await kv.del(authKey(profileId));
    console.log(`Auth code removed for profile: ${profileId}`);
    return c.json({ success: true });
  } catch (err) {
    console.log("Error removing auth code:", err);
    return c.json({ error: `Failed to remove auth code: ${err}` }, 500);
  }
});

/**
 * POST /auth-codes/migrate
 * Body: { codes: Array<{ profileId: string, plainCode: string }> }
 * Bulk-migrates plain-text codes from localStorage into the KV store.
 * Skips profiles that already have a server-side code set.
 */
app.post("/make-server-8a5950b5/auth-codes/migrate", async (c) => {
  try {
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
    console.log(`Migrated ${migrated} auth codes to KV store`);
    return c.json({ success: true, migrated });
  } catch (err) {
    console.log("Error migrating auth codes:", err);
    return c.json({ error: `Failed to migrate auth codes: ${err}` }, 500);
  }
});

// ========================
// Profile Picture routes
// ========================

const pfpKey = (userId: string) => `inet-pfp::${userId}`;

/**
 * POST /profile-picture/upload
 * Body: { userId: string, imageData: string }
 * imageData is a base64 data URL (resized client-side to ≤128×128).
 * Overwrites any existing profile picture for that user.
 */
app.post("/make-server-8a5950b5/profile-picture/upload", async (c) => {
  try {
    const { userId, imageData } = await c.req.json();
    if (!userId || typeof userId !== "string") {
      return c.json({ error: "Missing or invalid userId" }, 400);
    }
    if (!imageData || typeof imageData !== "string") {
      return c.json({ error: "Missing or invalid imageData" }, 400);
    }
    // Validate it looks like a data URL
    if (!imageData.startsWith("data:image/")) {
      return c.json({ error: "imageData must be a data:image/ URL" }, 400);
    }
    // Limit size (~200KB base64 max)
    if (imageData.length > 200_000) {
      return c.json({ error: "Image too large. Please use a smaller image." }, 400);
    }
    await kv.set(pfpKey(userId), { imageData, updatedAt: Date.now() });
    console.log(`Profile picture saved for user: ${userId} (${imageData.length} chars)`);
    return c.json({ success: true });
  } catch (err) {
    console.log("Error uploading profile picture:", err);
    return c.json({ error: `Failed to upload profile picture: ${err}` }, 500);
  }
});

/**
 * GET /profile-picture/:userId
 * Returns { imageData: string, updatedAt: number } or { imageData: null }
 */
app.get("/make-server-8a5950b5/profile-picture/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    if (!userId) {
      return c.json({ error: "Missing userId" }, 400);
    }
    const stored = await kv.get(pfpKey(userId));
    if (!stored || !stored.imageData) {
      return c.json({ imageData: null });
    }
    return c.json({ imageData: stored.imageData, updatedAt: stored.updatedAt });
  } catch (err) {
    console.log("Error fetching profile picture:", err);
    return c.json({ error: `Failed to fetch profile picture: ${err}` }, 500);
  }
});

/**
 * POST /profile-picture/batch
 * Body: { userIds: string[] }
 * Returns { pictures: Record<string, string | null> }
 */
app.post("/make-server-8a5950b5/profile-picture/batch", async (c) => {
  try {
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
  } catch (err) {
    console.log("Error fetching batch profile pictures:", err);
    return c.json({ error: `Failed to fetch batch profile pictures: ${err}` }, 500);
  }
});

/**
 * DELETE /profile-picture/:userId
 * Removes the profile picture for the given user.
 */
app.delete("/make-server-8a5950b5/profile-picture/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    if (!userId) {
      return c.json({ error: "Missing userId" }, 400);
    }
    await kv.del(pfpKey(userId));
    console.log(`Profile picture deleted for user: ${userId}`);
    return c.json({ success: true });
  } catch (err) {
    console.log("Error deleting profile picture:", err);
    return c.json({ error: `Failed to delete profile picture: ${err}` }, 500);
  }
});

Deno.serve(app.fetch);