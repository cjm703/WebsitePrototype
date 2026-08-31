import assert from "node:assert/strict";
import { createServer } from "vite";

const root = process.cwd();

class MemoryStorage {
  values = new Map();
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
  key(index) {
    return Array.from(this.values.keys())[index] ?? null;
  }
  get length() {
    return this.values.size;
  }
}

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();
let reloadCount = 0;
globalThis.localStorage = localStorage;
globalThis.window = {
  localStorage,
  sessionStorage,
  location: {
    pathname: "/interface/game",
    search: "",
    hash: "",
    reload() {
      reloadCount += 1;
    },
  },
  dispatchEvent() {},
};

const vite = await createServer({
  configFile: false,
  envFile: false,
  root,
  appType: "custom",
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { "@": `${root}/src` } },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      "https://project.example.test",
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("public-key"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": "undefined",
    "import.meta.env.VITE_SUPABASE_FUNCTION_BASE": JSON.stringify(
      "https://functions.example.test/custom",
    ),
  },
});

async function bundledModule(relativePath) {
  return vite.ssrLoadModule(`/${relativePath.replaceAll("\\", "/")}`);
}

async function testAuthRequests() {
  localStorage.setItem("inet-session-token", "dm-session");
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const valid = String(url).endsWith("/verify");
    return new Response(
      JSON.stringify(
        valid
          ? {
              valid: true,
              hasCode: true,
              playerId: "dm",
              sessionToken: "verified-session",
            }
          : { success: true },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const auth = await bundledModule("src/app/components/auth-utils.tsx");

  const login = await auth.verifyAuthCode("dm", "correct-code");
  assert.equal(login.valid, true);
  assert.equal(login.sessionToken, "verified-session");
  assert.equal(
    requests[0].url,
    "https://functions.example.test/custom/auth-codes/verify",
  );
  assert.equal(new Headers(requests[0].init.headers).get("X-Session-Token"), null);

  await auth.setAuthCode("player-1", "new-code");
  assert.equal(
    new Headers(requests[1].init.headers).get("X-Session-Token"),
    "dm-session",
  );

  await auth.removeAuthCode("player-1");
  assert.equal(
    new Headers(requests[2].init.headers).get("X-Session-Token"),
    "dm-session",
  );

  await auth.migrateAuthCodes([{ profileId: "player-1", plainCode: "legacy" }]);
  assert.equal(
    new Headers(requests[3].init.headers).get("X-Session-Token"),
    "dm-session",
  );
}

async function testSessionValidation() {
  localStorage.setItem("inet-session-token", "player-session");
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://functions.example.test/custom/session/me");
    return new Response(JSON.stringify({ playerId: "player-1", isDM: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const api = await bundledModule("src/lib/player-state-api.ts");
  assert.deepEqual(await api.validatePlayerSession(), {
    playerId: "player-1",
    isDM: false,
  });
}

async function testCollectionDeletionDiff() {
  localStorage.setItem("inet-session-token", "dm-session");
  const writes = [];
  globalThis.fetch = async (url, init = {}) => {
    if ((init.method || "GET") === "GET") {
      return new Response(JSON.stringify({ rows: [{ id: "a" }, { id: "b" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    writes.push({ url: String(url), body: JSON.parse(String(init.body || "{}")) });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const db = await bundledModule("src/lib/db-core.ts");
  await db.listCollection("app_items");
  await db.replaceCollection("app_items", [{ id: "a" }, { id: "c" }]);

  assert.equal(
    writes[0].url,
    "https://functions.example.test/custom/data/collection/app_items/sync",
  );
  assert.deepEqual(writes[0].body.deleteIds, ["b"]);
  assert.deepEqual(
    writes[0].body.rows.map((row) => row.id),
    ["a", "c"],
  );
}

async function testLegacyCollectionDeletionDiff() {
  localStorage.setItem("inet-session-token", "dm-session");
  const writes = [];
  globalThis.fetch = async (url, init = {}) => {
    if ((init.method || "GET") === "GET") {
      return new Response(JSON.stringify({ items: [{ id: "a" }, { id: "b" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    writes.push({ url: String(url), body: JSON.parse(String(init.body || "{}")) });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const api = await bundledModule("src/lib/player-state-api.ts");
  await api.loadDMItems();
  await api.saveDMItems([{ id: "a" }, { id: "c" }]);

  assert.equal(
    writes[0].url,
    "https://functions.example.test/custom/dm/items/save",
  );
  assert.deepEqual(writes[0].body.deleteIds, ["b"]);
  assert.deepEqual(
    writes[0].body.items.map((row) => row.id),
    ["a", "c"],
  );
}

async function testStaleChunkDetection() {
  const lazyModule = await bundledModule("src/lib/lazy-module.ts");
  assert.equal(
    lazyModule.isStaleChunkError(
      new TypeError("Failed to fetch dynamically imported module: https://example.test/assets/game-old.js"),
    ),
    true,
  );
  assert.equal(
    lazyModule.isStaleChunkError(new Error("ChunkLoadError: Loading chunk game failed")),
    true,
  );
  assert.equal(lazyModule.isStaleChunkError(new Error("Game data was invalid")), false);
  assert.equal(
    lazyModule.reloadOnceForStaleChunk(
      new TypeError("Failed to fetch dynamically imported module: /assets/game-old.js"),
    ),
    true,
  );
  assert.equal(reloadCount, 1);
  assert.equal(
    lazyModule.reloadOnceForStaleChunk(
      new TypeError("Failed to fetch dynamically imported module: /assets/game-old.js"),
    ),
    false,
  );
  assert.equal(reloadCount, 1);
}

async function testOfficeBusinessMapState() {
  const officeMap = await bundledModule("src/app/components/office-business-map.tsx");
  const defaults = officeMap.createDefaultOfficeBusinessMap();
  assert.equal(defaults.version, 1);
  assert.equal(defaults.sectors.length, 6);
  assert.ok(defaults.sectors.every((sector) => Array.isArray(sector.slots)));
  assert.ok(defaults.sectors.some((sector) => sector.slots.length > 0));

  const normalized = officeMap.normalizeOfficeBusinessMap({
    name: "Test Business",
    sectors: [{
      id: "sector-test",
      name: "Testing",
      description: "A test sector",
      color: "#123456",
      x: 99,
      y: -5,
      width: 99,
      height: 0,
      slots: [{
        id: "slot-test",
        name: "Test Slot",
        category: "not-a-category",
        x: 11,
        y: 7,
        width: 4,
        height: 3,
        filled: true,
        occupant: "Workshop",
      }],
    }],
  });
  assert.equal(normalized.name, "Test Business");
  assert.deepEqual(
    { x: normalized.sectors[0].x, y: normalized.sectors[0].y, width: normalized.sectors[0].width, height: normalized.sectors[0].height },
    { x: 0, y: 0, width: 12, height: 3 },
  );
  assert.equal(normalized.sectors[0].slots[0].category, "Unassigned");
  assert.equal(normalized.sectors[0].slots[0].filled, true);
  assert.equal(normalized.sectors[0].slots[0].occupant, "Workshop");
  assert.ok(normalized.sectors[0].slots[0].x + normalized.sectors[0].slots[0].width <= 12);
  assert.ok(normalized.sectors[0].slots[0].y + normalized.sectors[0].slots[0].height <= 8);
}

async function testStorageSafetyAndStatusApi() {
  const storage = await bundledModule("src/app/components/safe-storage.tsx");
  localStorage.setItem("inet-session-token", "dm-session");
  localStorage.setItem("inet-user", "DM");
  localStorage.setItem("inet-activity-log-player-1", "temporary activity");
  localStorage.setItem("inet-error-log", "[]");
  localStorage.setItem("inet-combat-state", "saved state");

  assert.deepEqual(storage.classifyStorageKey("inet-session-token"), {
    importance: "critical",
    clearable: false,
    description: "Session, identity, or unsaved editor data",
  });
  assert.equal(storage.classifyStorageKey("inet-activity-log-player-1").importance, "cache");
  assert.equal(storage.classifyStorageKey("inet-combat-state").importance, "saved");
  assert.equal(storage.clearPrunableStorageKey("inet-session-token"), false);
  localStorage.setItem("inet-adventure-sessions", "retired data");
  assert.equal(storage.clearRetiredStorage(), 1);
  assert.equal(localStorage.getItem("inet-adventure-sessions"), null);
  const cleared = storage.clearPrunableStorage();
  assert.equal(cleared.keysRemoved >= 2, true);
  assert.equal(localStorage.getItem("inet-session-token"), "dm-session");
  assert.equal(localStorage.getItem("inet-combat-state"), "saved state");
  assert.equal(localStorage.getItem("inet-error-log"), null);

  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({
      checkedAt: "2026-08-30T00:00:00.000Z",
      database: { bytes: 1024, tables: [] },
      objectStorage: { bytes: 2048, objects: 2, buckets: [] },
      sessions: { active: 1, total: 3 },
      warnings: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const statusApi = await bundledModule("src/lib/system-status-api.ts");
  const result = await statusApi.loadSupabaseStorageStatus();
  assert.equal(result.database.bytes, 1024);
  assert.equal(requests[0].url, "https://project.example.test/functions/v1/system-status/storage");
  assert.equal(new Headers(requests[0].init.headers).get("X-Session-Token"), "dm-session");
}

try {
  await testAuthRequests();
  await testSessionValidation();
  await testCollectionDeletionDiff();
  await testLegacyCollectionDeletionDiff();
  await testStaleChunkDetection();
  await testStorageSafetyAndStatusApi();
  await testOfficeBusinessMapState();
  process.stdout.write("Runtime behavior checks passed.\n");
} finally {
  await vite.close();
}
