import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(os.tmpdir(), `verify-office-signals-${process.pid}.mjs`);

const supabaseMock = `
export const signalMetrics = { channelCalls: 0, onCalls: 0, subscribeCalls: 0, httpSends: 0 };
let joined = false;
const handlers = new Map();
const channel = {
  state: "closed",
  on(type, _filter, callback) {
    if (joined) throw new Error("cannot add callbacks after subscribe()");
    signalMetrics.onCalls += 1;
    handlers.set(type, callback);
    return this;
  },
  subscribe() {
    joined = true;
    this.state = "joined";
    signalMetrics.subscribeCalls += 1;
    return this;
  },
  httpSend() {
    signalMetrics.httpSends += 1;
    return Promise.resolve("ok");
  },
};
export const supabase = {
  channel() {
    signalMetrics.channelCalls += 1;
    return channel;
  },
};
export function emitPostgresSignal() {
  handlers.get("postgres_changes")?.();
}
`;

await build({
  stdin: {
    contents: `
      export { subscribeToOfficeStateSignals } from "./src/lib/office-state-api.ts";
      export { emitPostgresSignal, signalMetrics } from "./src/lib/supabaseClient.ts";
    `,
    resolveDir: root,
    sourcefile: "office-signal-test-entry.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  plugins: [{
    name: "office-signal-mocks",
    setup(buildApi) {
      buildApi.onResolve({ filter: /(?:^|\/)supabaseClient(?:\.ts)?$/ }, () => ({ path: "supabase-client", namespace: "office-test" }));
      buildApi.onLoad({ filter: /^supabase-client$/, namespace: "office-test" }, () => ({ contents: supabaseMock, loader: "js" }));
      buildApi.onResolve({ filter: /(?:^|\/)api-client$/ }, () => ({ path: "api-client", namespace: "office-test" }));
      buildApi.onLoad({ filter: /^api-client$/, namespace: "office-test" }, () => ({
        contents: "export async function sessionApiFetch() { throw new Error('Unexpected API request in signal test'); }",
        loader: "js",
      }));
    },
  }],
});

const testModule = await import(`${pathToFileURL(bundlePath).href}?run=${Date.now()}`);
await fs.unlink(bundlePath).catch(() => undefined);

const received = [];
const first = testModule.subscribeToOfficeStateSignals(() => received.push("first"));
const second = testModule.subscribeToOfficeStateSignals(() => received.push("second"));

assert.deepEqual(testModule.signalMetrics, {
  channelCalls: 1,
  onCalls: 2,
  subscribeCalls: 1,
  httpSends: 0,
}, "Concurrent Office views must share one fully configured channel");

testModule.emitPostgresSignal();
assert.deepEqual(received, ["first", "second"]);

first.unsubscribe();
first.unsubscribe();
testModule.emitPostgresSignal();
assert.deepEqual(received, ["first", "second", "second"], "Cleanup must be idempotent and remove only its own listener");

const remounted = testModule.subscribeToOfficeStateSignals(() => received.push("remounted"));
testModule.emitPostgresSignal();
assert.deepEqual(received.slice(-2), ["second", "remounted"], "A remount must reuse the channel without adding realtime callbacks");
assert.equal(testModule.signalMetrics.channelCalls, 1);
assert.equal(testModule.signalMetrics.onCalls, 2);
assert.equal(testModule.signalMetrics.subscribeCalls, 1);

await second.notify();
assert.equal(testModule.signalMetrics.httpSends, 1);
second.unsubscribe();
remounted.unsubscribe();

process.stdout.write("Office signal verification passed: concurrent views, cleanup, remounts, and notifications share one subscribed channel.\n");
