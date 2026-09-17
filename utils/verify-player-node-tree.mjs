import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viewerPath = path.join(root, "src", "app", "components", "node-trees.tsx");
const bundlePath = path.join(os.tmpdir(), `verify-player-node-tree-${process.pid}.mjs`);
await build({
  entryPoints: [viewerPath],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  define: {
    "import.meta.env": JSON.stringify({ DEV: true, PROD: false, VITE_SUPABASE_URL: "https://node-tree-test.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "node-tree-test-key" }),
    "process.env.NODE_ENV": '"test"',
  },
});
const { collectRevealedTreeCardIds } = await import(`${pathToFileURL(bundlePath).href}?run=${Date.now()}`);
await fs.unlink(bundlePath).catch(() => undefined);

const tree = {
  nodes: [
    { id: "root", cardIds: ["starter", "shared"] },
    { id: "locked", cardIds: ["secret"] },
    { id: "shrouded", shrouded: true, cardIds: ["hidden", "shared", "deleted"] },
  ],
};
const existingCards = new Set(["starter", "shared", "secret", "hidden"]);
assert.deepEqual([...collectRevealedTreeCardIds(tree, [], existingCards)], [], "Locked nodes must not reveal cards");
assert.deepEqual([...collectRevealedTreeCardIds(tree, ["root"], existingCards)].sort(), ["shared", "starter"], "Only unlocked-node cards may count as revealed");
assert.deepEqual([...collectRevealedTreeCardIds(tree, ["root", "shrouded"], existingCards)].sort(), ["hidden", "shared", "starter"], "Unlocked shrouded cards should reveal once and missing cards should not count");
assert.deepEqual([...collectRevealedTreeCardIds(null, ["root"], existingCards)], [], "No selected tree has no revealed rewards");

const source = await fs.readFile(viewerPath, "utf8");
assert.match(source, /selectedNode && isNodeUnlocked\(selectedNode\.id\)/, "Selected locked nodes must not display card details");
assert.match(source, /const cardCount = unlocked \?/, "Locked nodes must not display card-count badges");
assert.match(source, /Unlock Unknown Node/, "A ready shrouded node must still be unlockable");
assert.match(source, /prefers-reduced-motion: reduce/, "Map animation must honor reduced-motion preferences");
assert.match(source, /aria-label="Fit map to width"/, "Small screens must have a fit-map control");

console.log("Player Node Tree verification passed: reveal gating, stale-card filtering, shrouded unlocks, and accessible map controls.");
