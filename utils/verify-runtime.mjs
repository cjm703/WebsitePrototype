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

async function testAdventurePrototypeEngine() {
  const engine = await bundledModule("supabase/functions/_shared/adventure-prototype.ts");
  let room = engine.createPrototypeRoom({
    id: "room-1",
    name: "Sync Test",
    hostPlayerId: "dm",
    members: [
      { playerId: "player-1", displayName: "Player One" },
      { playerId: "player-2", displayName: "Player Two" },
    ],
    now: "2026-08-18T00:00:00.000Z",
  });

  assert.equal(room.status, "lobby");
  assert.equal(room.version, 1);
  assert.equal(room.members.length, 2);
  assert.equal(engine.canViewPrototypeRoom(room, "player-1"), true);
  assert.equal(engine.canViewPrototypeRoom(room, "stranger"), false);

  const joinAction = { id: "join-1", type: "join", expectedVersion: 1 };
  let result = engine.resolvePrototypeAction(room, joinAction, "player-1", "2026-08-18T00:00:01.000Z");
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  room = result.room;
  assert.equal(room.version, 2);
  assert.ok(room.members.find((member) => member.playerId === "player-1").joinedAt);

  result = engine.resolvePrototypeAction(room, joinAction, "player-1", "2026-08-18T00:00:02.000Z");
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.room.version, 2);

  result = engine.resolvePrototypeAction(
    room,
    { id: "start-player", type: "start", expectedVersion: room.version },
    "player-1",
    "2026-08-18T00:00:03.000Z",
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "forbidden");

  result = engine.resolvePrototypeAction(
    room,
    { id: "start-dm", type: "start", expectedVersion: room.version },
    "dm",
    "2026-08-18T00:00:04.000Z",
  );
  assert.equal(result.ok, true);
  room = result.room;
  assert.equal(room.status, "active");
  assert.equal(room.units.some((unit) => unit.ownerId === "player-2"), false);
  assert.equal(engine.getPrototypeActiveUnit(room).ownerId, "player-1");

  const skipped = engine.resolvePrototypeAction(
    room,
    { id: "skip-dm", type: "skip_turn", expectedVersion: room.version },
    "dm",
    "2026-08-18T00:00:04.500Z",
  );
  assert.equal(skipped.ok, true);
  assert.equal(engine.getPrototypeActiveUnit(skipped.room).ownerId, "dm");
  const playerSkip = engine.resolvePrototypeAction(
    room,
    { id: "skip-player", type: "skip_turn", expectedVersion: room.version },
    "player-1",
    "2026-08-18T00:00:04.750Z",
  );
  assert.equal(playerSkip.ok, false);
  assert.equal(playerSkip.code, "forbidden");

  result = engine.resolvePrototypeAction(
    room,
    { id: "wrong-turn", type: "move", expectedVersion: room.version, payload: { position: { x: 6, y: 2 } } },
    "dm",
    "2026-08-18T00:00:05.000Z",
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "forbidden");

  const playerUnit = engine.getPrototypeUnitForActor(room, "player-1");
  const reachable = engine.getPrototypeReachablePoints(room, playerUnit);
  assert.equal(reachable.some((point) => point.x === 1 && point.y === 4), true);
  const wallTestRoom = {
    ...room,
    units: room.units.map((unit) => unit.ownerId === "player-1"
      ? { ...unit, position: { x: 3, y: 2 } }
      : unit),
  };
  const wallReachable = engine.getPrototypeReachablePoints(
    wallTestRoom,
    engine.getPrototypeUnitForActor(wallTestRoom, "player-1"),
  );
  assert.equal(wallReachable.some((point) => point.x === 3 && point.y === 3), false);
  assert.equal(wallReachable.some((point) => point.x === 3 && point.y === 4), false);

  result = engine.resolvePrototypeAction(
    room,
    { id: "move-1", type: "move", expectedVersion: room.version, payload: { position: { x: 1, y: 4 } } },
    "player-1",
    "2026-08-18T00:00:06.000Z",
  );
  assert.equal(result.ok, true);
  room = result.room;
  assert.deepEqual(engine.getPrototypeUnitForActor(room, "player-1").position, { x: 1, y: 4 });
  assert.equal(engine.getPrototypeUnitForActor(room, "player-1").moveRemaining, 1);

  result = engine.resolvePrototypeAction(
    room,
    { id: "stale", type: "end_turn", expectedVersion: room.version - 1 },
    "player-1",
    "2026-08-18T00:00:07.000Z",
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "conflict");

  room = {
    ...room,
    version: 20,
    activeTurnIndex: 0,
    units: room.units.map((unit) => unit.ownerId === "player-1"
      ? { ...unit, position: { x: 1, y: 1 }, moveRemaining: 3, actionTaken: false }
      : { ...unit, position: { x: 1, y: 2 }, moveRemaining: 3, actionTaken: false }),
  };

  for (let attackIndex = 0; attackIndex < 4; attackIndex += 1) {
    const dmUnit = engine.getPrototypeUnitForActor(room, "dm");
    result = engine.resolvePrototypeAction(
      room,
      { id: `attack-${attackIndex}`, type: "attack", expectedVersion: room.version, payload: { targetUnitId: dmUnit.id } },
      "player-1",
      `2026-08-18T00:01:0${attackIndex}.000Z`,
    );
    assert.equal(result.ok, true);
    room = result.room;
    if (attackIndex < 3) {
      result = engine.resolvePrototypeAction(
        room,
        { id: `repeat-${attackIndex}`, type: "attack", expectedVersion: room.version, payload: { targetUnitId: dmUnit.id } },
        "player-1",
        `2026-08-18T00:01:1${attackIndex}.000Z`,
      );
      assert.equal(result.ok, false);

      result = engine.resolvePrototypeAction(
        room,
        { id: `end-player-${attackIndex}`, type: "end_turn", expectedVersion: room.version },
        "player-1",
        `2026-08-18T00:01:2${attackIndex}.000Z`,
      );
      assert.equal(result.ok, true);
      room = result.room;
      assert.equal(engine.getPrototypeActiveUnit(room).ownerId, "dm");

      result = engine.resolvePrototypeAction(
        room,
        { id: `end-dm-${attackIndex}`, type: "end_turn", expectedVersion: room.version },
        "dm",
        `2026-08-18T00:01:3${attackIndex}.000Z`,
      );
      assert.equal(result.ok, true);
      room = result.room;
      assert.equal(engine.getPrototypeActiveUnit(room).ownerId, "player-1");
    }
  }

  assert.equal(room.status, "completed");
  assert.equal(room.winner, "players");
  assert.equal(engine.getPrototypeUnitForActor(room, "dm").hp, 0);

  result = engine.resolvePrototypeAction(
    room,
    { id: "close-player", type: "close", expectedVersion: room.version },
    "player-1",
    "2026-08-18T00:02:00.000Z",
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "forbidden");
  result = engine.resolvePrototypeAction(
    room,
    { id: "close-dm", type: "close", expectedVersion: room.version },
    "dm",
    "2026-08-18T00:02:01.000Z",
  );
  assert.equal(result.ok, true);
  assert.equal(result.room.status, "closed");
}

async function testAdventurePrototypeApi() {
  localStorage.setItem("inet-session-token", "player-session");
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ room: { id: "room-1", version: 8 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const api = await bundledModule("src/lib/adventure-prototype-api.ts");
  await api.sendPrototypeAction({ id: "room-1", version: 7 }, "end_turn");
  assert.equal(requests[0].url, "https://project.example.test/functions/v1/adventure-prototype/rooms/room-1/actions");
  const body = JSON.parse(String(requests[0].init.body));
  assert.equal(body.type, "end_turn");
  assert.equal(body.expectedVersion, 7);
  assert.equal("actorId" in body, false);
  assert.equal(new Headers(requests[0].init.headers).get("X-Session-Token"), "player-session");

  globalThis.fetch = async () => new Response(
    JSON.stringify({
      error: "The room changed before this action was saved.",
      code: "conflict",
      room: { id: "room-1", version: 9 },
    }),
    { status: 409, headers: { "Content-Type": "application/json" } },
  );
  await assert.rejects(
    () => api.sendPrototypeAction({ id: "room-1", version: 8 }, "end_turn"),
    (error) => error?.status === 409 && error?.body?.room?.version === 9,
  );
}

try {
  await testAuthRequests();
  await testSessionValidation();
  await testCollectionDeletionDiff();
  await testLegacyCollectionDeletionDiff();
  await testStaleChunkDetection();
  await testAdventurePrototypeEngine();
  await testAdventurePrototypeApi();
  process.stdout.write("Runtime behavior checks passed.\n");
} finally {
  await vite.close();
}
