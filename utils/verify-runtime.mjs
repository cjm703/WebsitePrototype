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
globalThis.localStorage = localStorage;
globalThis.window = {
  localStorage,
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

try {
  await testAuthRequests();
  await testSessionValidation();
  await testCollectionDeletionDiff();
  await testLegacyCollectionDeletionDiff();
  process.stdout.write("Runtime behavior checks passed.\n");
} finally {
  await vite.close();
}
