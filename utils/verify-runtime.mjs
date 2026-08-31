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
  const officeMap = await bundledModule("src/lib/business-map-model.ts");
  const defaults = officeMap.createDefaultOfficeBusinessMap();
  assert.equal(defaults.version, 3);
  assert.equal(defaults.sectors.length, 6);
  assert.ok(defaults.sectors.every((sector) => Array.isArray(sector.slots)));
  assert.ok(defaults.sectors.some((sector) => sector.slots.length > 0));
  assert.equal(defaults.layers.length, 5);
  assert.equal(defaults.background.mode, "solid");
  assert.equal(defaults.permissions.playerCanInstall, true);

  const facilityMap = officeMap.createFacilityBusinessMap("North Warehouse");
  assert.equal(facilityMap.name, "North Warehouse Layout");
  assert.equal(facilityMap.sectors.length, 1);
  assert.equal(facilityMap.sectors[0].name, "Main Floor");
  assert.deepEqual(
    {
      x: facilityMap.sectors[0].x,
      y: facilityMap.sectors[0].y,
      width: facilityMap.sectors[0].width,
      height: facilityMap.sectors[0].height,
    },
    { x: 0, y: 0, width: 12, height: 8 },
  );

  const normalized = officeMap.normalizeOfficeBusinessMap({
    version: 1,
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
      shapes: [{
        id: "area-test",
        kind: "area",
        points: [{ x: -4, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 99 }],
        fillColor: "#123456",
      }],
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
    { x: 0, y: 0, width: 12, height: 1 },
  );
  assert.equal(normalized.version, 3);
  assert.equal(normalized.sectors[0].slots[0].category, "Unassigned");
  assert.equal(normalized.sectors[0].slots[0].filled, true);
  assert.equal(normalized.sectors[0].slots[0].occupant, "Workshop");
  assert.deepEqual(normalized.sectors[0].slots[0].acceptedCategories, []);
  assert.equal(normalized.sectors[0].shapes[0].kind, "area");
  assert.equal(normalized.sectors[0].shapes[0].points[0].x, 0);
  assert.equal(normalized.sectors[0].shapes[0].points[2].y, 8);
  assert.ok(normalized.sectors[0].slots[0].x + normalized.sectors[0].slots[0].width <= 12);
  assert.ok(normalized.sectors[0].slots[0].y + normalized.sectors[0].slots[0].height <= 8);

  const additions = officeMap.normalizeFacilityAdditions([{
    id: "addition-generator",
    name: "Backup Generator",
    category: "Utility",
    tags: ["power", "exterior"],
    quantity: 2,
    width: 2,
    height: 2,
  }]);
  const addition = additions[0];
  const slot = {
    ...officeMap.createDefaultBusinessSlot("slot-generator", "Generator Pad", "Utility", 0, 0),
    acceptedCategories: ["Utility"],
    acceptedTags: ["power"],
    width: 3,
    height: 2,
  };
  const installMap = officeMap.createFacilityBusinessMap("Power Station");
  installMap.sectors[0].slots = [slot];
  assert.equal(officeMap.isFacilityAdditionCompatible(slot, addition), true);
  assert.equal(
    officeMap.isFacilityAdditionCompatible(slot, { ...addition, category: "Office" }),
    false,
  );
  const installed = officeMap.installFacilityAddition(installMap, installMap.sectors[0].id, slot.id, addition, "player-1");
  assert.equal(installed.sectors[0].slots[0].installedAdditionId, addition.id);
  assert.equal(installed.sectors[0].slots[0].installedBy, "player-1");
  const replacement = { ...addition, id: "addition-generator-quiet", name: "Quiet Generator" };
  const swapped = officeMap.installFacilityAddition(installed, installed.sectors[0].id, slot.id, replacement, "player-1");
  assert.equal(swapped.sectors[0].slots[0].installedAdditionId, replacement.id);
  assert.equal(swapped.sectors[0].slots[0].occupant, replacement.name);
  assert.deepEqual(officeMap.countInstalledFacilityAdditions([installed]), { [addition.id]: 1 });
  assert.deepEqual(officeMap.countInstalledFacilityAdditions(installed), { [addition.id]: 1 });
  assert.equal(officeMap.canPlayerEditBusinessMap(installed, "player-1", "install"), true);
  assert.equal(officeMap.canPlayerEditBusinessMap(installed, "player-1", "remove"), false);
  const restricted = {
    ...installed,
    permissions: { ...installed.permissions, allowedPlayerIds: ["player-2"] },
  };
  assert.equal(officeMap.canPlayerEditBusinessMap(restricted, "player-1", "install"), false);
  assert.equal(officeMap.canPlayerEditBusinessMap(restricted, "player-2", "install"), true);
  const removed = officeMap.removeFacilityAddition(installed, installed.sectors[0].id, slot.id);
  assert.equal(removed.sectors[0].slots[0].filled, false);
  assert.equal(removed.sectors[0].slots[0].installedAdditionId, "");

  const resized = officeMap.resizeOfficeBusinessMapGrid(defaults, { width: 8, height: 6 });
  assert.deepEqual({ width: resized.grid.width, height: resized.grid.height }, { width: 8, height: 6 });
  assert.ok(resized.sectors.every((sector) => sector.x + sector.width <= 8 && sector.y + sector.height <= 6));

  const recoveredBackground = officeMap.normalizeBusinessMapBackground({ mode: "image", imageUrl: "" });
  assert.equal(recoveredBackground.mode, "solid");
  const assetMap = {
    ...defaults,
    background: {
      ...defaults.background,
      mode: "image",
      imageUrl: "https://example.test/map.png",
      imageAsset: { kind: "supabase-storage", bucket: "business-map-assets", path: "business-maps/map.png", publicUrl: "https://example.test/map.png", contentType: "image/png", size: 12, originalName: "map.png", createdAt: "now" },
    },
  };
  assert.equal(officeMap.collectBusinessMapAssets(assetMap).length, 1);
}

async function testFacilityDepthState() {
  const officeMap = await bundledModule("src/lib/business-map-model.ts");
  const depth = await bundledModule("src/lib/facility-depth-model.ts");
  const stateModel = await bundledModule("src/lib/facility-office-state.ts");

  const park = depth.createMysticLandsParkFacility();
  assert.equal(park.businessMap.sectors.length, 10);
  assert.equal(
    park.businessMap.sectors.filter((sector) => officeMap.isBusinessSectorUnlocked(park.businessMap, sector)).length,
    8,
  );
  assert.equal(park.businessMap.expansions.length, 1);
  assert.equal(park.businessMap.expansions[0].status, "available");
  assert.deepEqual(park.businessMap.expansions[0].unlockSectorIds, ["mystic-expansion-west", "mystic-expansion-east"]);

  const additions = depth.ensureMysticLandsAdditions([]);
  assert.equal(additions.length, 10);
  const gatehouse = additions.find((addition) => addition.id === "mystic-add-gatehouse");
  assert.ok(gatehouse);
  const installedMap = officeMap.installFacilityAddition(park.businessMap, "mystic-entrance", "entrance-gates", gatehouse, "player-1");
  const stats = depth.calculateFacilityStats(park.baseStats, installedMap, additions);
  assert.equal(stats.capacity, park.baseStats.capacity + 180);
  assert.equal(stats.revenue, park.baseStats.revenue + 350);

  const migrated = stateModel.normalizeFacilityOfficeState({
    id: "default",
    version: 4,
    facilities: [{ id: "legacy-facility", name: "Old Workshop", type: "Facility" }],
    facilityCats: [{ id: "legacy", name: "Legacy", facilityIds: ["legacy-facility"] }],
    facilityAdditions: [],
  });
  assert.equal(migrated.version, 5);
  assert.ok(migrated.facilities.some((facility) => facility.id === "legacy-facility"));
  assert.ok(migrated.facilities.some((facility) => facility.id === "facility-mystic-lands-park"));

  const legacyParkMap = officeMap.createFacilityBusinessMap("Mystic Lands Park");
  legacyParkMap.sectors[0].id = "legacy-custom-park-sector";
  const mergedParkState = stateModel.normalizeFacilityOfficeState({
    facilities: [{ ...park, businessMap: legacyParkMap }],
    facilityCats: [],
    facilityAdditions: [],
  });
  const mergedParkMap = mergedParkState.facilities.find((facility) => facility.id === park.id).businessMap;
  assert.ok(mergedParkMap.sectors.some((sector) => sector.id === "legacy-custom-park-sector"));
  assert.ok(mergedParkMap.sectors.some((sector) => sector.id === "mystic-center"));
  assert.equal(mergedParkMap.grid.width, 28);
  assert.equal(mergedParkMap.grid.height, 22);

  const owned = stateModel.normalizeFacilityOfficeState({
    ...migrated,
    facilities: migrated.facilities.map((facility) => facility.id === park.id ? { ...facility, ownerPlayerId: "player-1" } : facility),
    personalFunds: [{ playerId: "player-1", balance: 20000 }],
  });
  const localPark = owned.facilities.find((facility) => facility.id === park.id);
  localPark.businessMap.description = "Locally edited map description";
  const remote = structuredClone(owned);
  remote.revision = 7;
  remote.personalFunds[0].balance = 5000;
  remote.facilities.find((facility) => facility.id === park.id).businessMap = installedMap;
  const rebased = stateModel.rebaseFacilityOfficeEdits(owned, remote, park.id);
  const rebasedPark = rebased.facilities.find((facility) => facility.id === park.id);
  assert.equal(rebased.revision, 7);
  assert.equal(rebased.personalFunds[0].balance, 5000);
  assert.equal(rebasedPark.businessMap.description, "Locally edited map description");
  assert.equal(rebasedPark.businessMap.sectors.find((sector) => sector.id === "mystic-entrance").slots.find((slot) => slot.id === "entrance-gates").installedAdditionId, gatehouse.id);
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
  await testFacilityDepthState();
  process.stdout.write("Runtime behavior checks passed.\n");
} finally {
  await vite.close();
}
