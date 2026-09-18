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
const { collectRevealedTreeCardIds, treeMapWidth, getTreeBranches, treeConnectionPath, getNodePrerequisiteStatuses, areNodePrerequisitesMet } = await import(`${pathToFileURL(bundlePath).href}?run=${Date.now()}`);
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

const wideNodes = Array.from({ length: 11 }, (_, index) => ({ id: `n${index}`, rank: 2, x: index * 10, label: `Node ${index}` }));
assert.ok(treeMapWidth(wideNodes) >= 1200, "A crowded rank should expand the logical map width");
assert.equal(treeMapWidth([{ id: "one", rank: 0, x: 50 }]), 500, "A small tree should retain a compact map");

const branchingTree = {
  nodes: [
    { id: "root", rank: 0, x: 50, label: "Root" },
    { id: "sea", rank: 1, x: 25, label: "One with the Sea" },
    { id: "blood", rank: 1, x: 70, label: "Sea Blood" },
    { id: "shared", rank: 2, x: 48, label: "Brineclad" },
  ],
  connections: [
    { from: "root", to: "sea" }, { from: "root", to: "blood" },
    { from: "sea", to: "shared" }, { from: "blood", to: "shared" },
  ],
};
const branches = getTreeBranches(branchingTree, 700);
assert.equal(branches.length, 2, "Root children should become focusable lanes");
assert.ok(branches.every((branch) => branch.memberIds.has("shared")), "A shared node should remain visible when either branch is focused");
assert.ok(treeConnectionPath(100, 400, 300, 100).startsWith("M 100 378 C"), "Routed paths should begin outside the source node, not at its center");

const waterTree = {
  id: "water", assignedTo: ["lotus"], connections: [],
  nodes: [
    { id: "sea", label: "One with the Sea", prerequisites: [] },
    { id: "blood", label: "Sea Blood", prerequisites: [] },
    { id: "brine", label: "Brineclad", prerequisites: ["sea", "blood"] },
    { id: "erlang", label: "Erlang Weapon Arts", prerequisites: ["sea"], crossTreePrerequisites: [{ treeId: "astrablade", nodeId: "astral" }] },
  ],
};
const astrabladeTree = { id: "astrablade", assignedTo: ["lotus"], nodes: [{ id: "astral", label: "Astrablade", prerequisites: [] }], connections: [] };
const combinedTrees = [waterTree, astrabladeTree];
const brine = waterTree.nodes[2];
const erlang = waterTree.nodes[3];
assert.equal(areNodePrerequisitesMet(brine, "water", combinedTrees, { water: ["sea"] }, "lotus"), false, "Legacy nodes must still require all listed prerequisites");
assert.equal(areNodePrerequisitesMet(brine, "water", combinedTrees, { water: ["sea", "blood"] }, "lotus"), true, "All mode must accept both unlocked parents");
assert.equal(areNodePrerequisitesMet({ ...brine, prerequisiteMode: "any" }, "water", combinedTrees, { water: ["sea"] }, "lotus"), true, "Any mode must accept either local parent");
assert.equal(areNodePrerequisitesMet({ ...brine, prerequisiteMode: "any" }, "water", combinedTrees, {}, "lotus"), false, "Any mode still requires one unlocked parent");
assert.equal(areNodePrerequisitesMet(erlang, "water", combinedTrees, { water: ["sea"] }, "lotus"), false, "Local unlock alone must not satisfy an all-mode cross-tree requirement");
assert.equal(areNodePrerequisitesMet(erlang, "water", combinedTrees, { astrablade: ["astral"] }, "lotus"), false, "Cross-tree unlock alone must not satisfy an all-mode local requirement");
assert.equal(areNodePrerequisitesMet(erlang, "water", combinedTrees, { water: ["sea"], astrablade: ["astral"] }, "lotus"), true, "Local and cross-tree unlocks should combine in all mode");
assert.equal(areNodePrerequisitesMet({ ...erlang, prerequisiteMode: "any" }, "water", combinedTrees, { astrablade: ["astral"] }, "lotus"), true, "Any mode must accept a cross-tree prerequisite");
assert.equal(areNodePrerequisitesMet(erlang, "water", [{ ...waterTree }, { ...astrabladeTree, assignedTo: ["alice"] }], { water: ["sea"], astrablade: ["astral"] }, "lotus"), false, "A tree not assigned to this player cannot satisfy a cross-tree requirement");
assert.equal(areNodePrerequisitesMet({ ...erlang, prerequisiteMode: "any" }, "water", [{ ...waterTree }, { ...astrabladeTree, assignedTo: ["alice"] }], { water: ["sea"], astrablade: ["astral"] }, "lotus"), true, "Any mode should still accept an accessible local alternative");
assert.equal(areNodePrerequisitesMet(erlang, "water", [waterTree], { water: ["sea"], astrablade: ["astral"] }, "lotus"), false, "A deleted tree cannot satisfy a stale prerequisite ID");
assert.equal(areNodePrerequisitesMet({ ...brine, prerequisites: ["missing"] }, "water", combinedTrees, { water: ["missing"] }, "lotus"), false, "A missing node cannot satisfy a stale prerequisite ID");
assert.equal(areNodePrerequisitesMet(waterTree.nodes[0], "water", combinedTrees, {}, "lotus"), true, "A node with no prerequisites remains a valid root");
assert.equal(getNodePrerequisiteStatuses(erlang, "water", combinedTrees, { astrablade: ["astral"] }, "lotus").length, 2, "The detail panel should enumerate local and cross-tree requirements");

const source = await fs.readFile(viewerPath, "utf8");
assert.match(source, /selectedNode && isNodeUnlocked\(selectedNode\.id\)/, "Selected locked nodes must not display card details");
assert.match(source, /const cardCount = unlocked \?/, "Locked nodes must not display card-count badges");
assert.match(source, /Unlock Unknown Node/, "A ready shrouded node must still be unlockable");
assert.match(source, /prefers-reduced-motion: reduce/, "Map animation must honor reduced-motion preferences");
assert.match(source, /aria-label="Fit entire map"/, "Small screens must have a whole-map fit control");
assert.match(source, /aria-label="Navigate the node tree minimap"/, "Players need an accessible overview navigator");
assert.match(source, /aria-label="Navigate the editor minimap"/, "The DM editor should also handle wide maps");
assert.match(source, /selectedNode\.hint/, "Hints should appear in the selected-node detail panel");
assert.match(source, /Hint \(shown after a player clicks this node\)/, "The DM should be able to edit click-to-see hints");
assert.match(source, /Visual links do not set unlock prerequisites/, "The editor should distinguish drawn links from unlock rules");
assert.match(source, /All are unlocked/, "The DM needs an all-prerequisites option");
assert.match(source, /Any one is unlocked/, "The DM needs an either-prerequisite option");
assert.match(source, /Choose prerequisite tree/, "The DM must be able to select a cross-tree prerequisite");

console.log("Node Tree verification passed: reveal gating, wide layout, shared branches, all/any local and cross-tree prerequisites, click-to-see hints, and map navigation.");
