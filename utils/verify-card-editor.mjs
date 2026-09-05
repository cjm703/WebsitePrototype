import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = path.join(root, "src", "app", "components", "dm-card-manager-section.tsx");
const bundlePath = path.join(os.tmpdir(), `verify-card-editor-${process.pid}.mjs`);
await build({
  entryPoints: [componentPath],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  define: {
    "import.meta.env": JSON.stringify({
      DEV: true,
      PROD: false,
      VITE_SUPABASE_URL: "https://card-editor-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "card-editor-test-key",
    }),
    "process.env.NODE_ENV": '"test"',
  },
});
const { DMCardManagerSection } = await import(`${pathToFileURL(bundlePath).href}?run=${Date.now()}`);
const editor = DMCardManagerSection.__cardEditorTestApi;
await fs.unlink(bundlePath).catch(() => undefined);

assert.ok(editor, "Card editor test API must be attached in development builds");

const emptyBuilder = () => ({
  trigger: "",
  target: "",
  requirement: "",
  effect: "",
  duration: "",
  scaling: "",
  notes: "",
});

const makeCard = (overrides = {}) => ({
  id: "card-test",
  name: "Test Card",
  type: "Combat",
  actionCost: "1 Action",
  tags: [],
  effect: "<p>Deal damage.</p>",
  assignedTo: [],
  customFields: {},
  nodeTreeId: "",
  nodeId: "",
  ...overrides,
});

const attackTag = {
  id: "tag-attack",
  name: "Attack",
  description: "An attack card.",
  fields: [{ id: "field-damage", name: "Damage", type: "dice", required: true }],
};
const retiredTag = {
  id: "tag-retired",
  name: "Retired Tag",
  description: "Legacy compatibility fixture.",
  fields: [{ id: "field-legacy", name: "Legacy Value", type: "text" }],
};
const tags = [attackTag, retiredTag];

const created = editor.createCardFromTemplate({
  id: "attack",
  label: "Attack",
  description: "",
  focusPanel: "mechanics",
  name: "New Attack",
  type: "Combat",
  actionCost: "1 Action",
  effect: "<p><strong>Effect:</strong> Strike.</p>",
  suggestedTags: ["attack"],
  defaultFamily: "skill",
}, tags);
assert.equal(created.name, "New Attack", "Template creation must populate identity fields");
assert.equal(editor.getCardFamily(created), "skill", "Template creation must retain its card family");
assert.deepEqual(created.tags, ["Attack"], "Template creation must resolve suggested tags against the saved tag catalog");

const authoredProfile = makeCard({
  customFields: {
    [editor.keys.cardFamily]: "ability",
    "Use Profile::Primary Cost": "3 custom charges",
    "Use Profile::Origin": "Campaign reward",
  },
});
const changedFamily = editor.withCardFamilyDefaults(authoredProfile, "spell");
assert.equal(changedFamily.customFields[editor.keys.cardFamily], "spell", "Family changes must update the selected family");
assert.equal(changedFamily.customFields["Use Profile::Primary Cost"], "3 custom charges", "Family changes must preserve authored costs");
assert.equal(changedFamily.customFields["Use Profile::Origin"], "Campaign reward", "Family changes must preserve authored profile fields");
assert.equal(changedFamily.customFields["Use Profile::Magic Nature"], "Magical (Spell)", "Family changes may fill missing defaults");

const legacy = makeCard({
  id: "legacy-card",
  tags: [],
  assignedTo: ["player-a"],
  nodeTreeId: "tree-a",
  nodeId: "node-b",
  effect: "<p><strong>Target:</strong> One enemy</p><p><strong>Effect:</strong> Deal 2d6 damage.</p>",
  customFields: {
    "Legacy Campaign Field": "Keep this forever",
    "Retired Tag::Legacy Value": "Keep this while hidden",
    [editor.keys.cardDescription]: "<p>Legacy description.</p>",
    [editor.keys.trackerBucket]: "ability",
    [editor.keys.trackerName]: "Legacy Tracker",
    [editor.keys.trackerDuration]: "3 rounds",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollLabel}`]: "Damage",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollExpression}`]: "2d6+KNOW",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollPotency}`]: "2",
  },
});
assert.equal(editor.getStoredRulesMode(legacy), "manual", "Cards without editor metadata must remain manual cards");
assert.equal(editor.parseStoredMechanicsBuilder(legacy).effect, "Deal 2d6 damage.", "Legacy effect text must seed the guided builder without changing save mode");
assert.deepEqual(editor.parseStoredSectionBlocks(legacy), [], "Legacy cards without sections must open safely");

const legacyRolls = editor.buildQuickRollSlots(legacy.customFields);
assert.deepEqual(legacyRolls, [{ slotId: "1", label: "Damage", expression: "2d6+KNOW", potency: "2" }], "Existing quick rolls must round-trip through the redesigned Rules stage");

const manualSaved = editor.withPersistedEditorStructure(legacy, editor.parseStoredMechanicsBuilder(legacy), [], "manual", tags);
assert.equal(manualSaved.effect, legacy.effect, "Manual saves must preserve the authored effect HTML");
assert.equal(manualSaved.customFields["Legacy Campaign Field"], "Keep this forever", "Unknown legacy fields must survive a save");
assert.equal(manualSaved.customFields["Retired Tag::Legacy Value"], "Keep this while hidden", "Inactive tag fields must remain recoverable");
assert.equal(manualSaved.customFields[editor.keys.trackerName], "Legacy Tracker", "Tracker configuration must survive a save");
assert.deepEqual(manualSaved.assignedTo, ["player-a"], "Player assignment must survive a save");
assert.equal(manualSaved.nodeId, "node-b", "Progression assignment must survive a save");

const guidedBuilder = { ...emptyBuilder(), target: "One ally", effect: "Restore 2d8 health." };
const guidedBlocks = [{ id: "section-1", title: "Limitation", content: "Once per rest.", tone: "limitation" }];
const guidedSaved = editor.withPersistedEditorStructure(makeCard({ effect: "Old manual text" }), guidedBuilder, guidedBlocks, "guided", tags);
assert.match(guidedSaved.effect, /<strong>Target:<\/strong> One ally/, "Guided saves must generate effect text from structured rules");
assert.match(guidedSaved.effect, /<strong>Limitation:<\/strong> Once per rest\./, "Additive section blocks must join the guided rules output");
assert.equal(editor.parseStoredMechanicsBuilder(guidedSaved).target, "One ally", "Guided mechanics must round-trip through editor metadata");
assert.equal(editor.parseStoredSectionBlocks(guidedSaved)[0].tone, "limitation", "Section tone and content must round-trip");

const baseline = editor.buildEditorSnapshot(legacy, editor.parseStoredMechanicsBuilder(legacy), [], "manual", false);
const editedSnapshot = editor.buildEditorSnapshot({ ...legacy, name: "Edited Card" }, editor.parseStoredMechanicsBuilder(legacy), [], "manual", false);
assert.notEqual(editedSnapshot, baseline, "Editing any saved field must mark the workspace dirty");

const createdList = editor.upsertManagedCard([legacy], created, true);
assert.deepEqual(createdList.map((card) => card.id), ["legacy-card", created.id], "Create must append a new card without replacing existing cards");
const editedList = editor.upsertManagedCard(createdList, { ...legacy, name: "Edited Legacy Card" }, false);
assert.equal(editedList.find((card) => card.id === "legacy-card")?.name, "Edited Legacy Card", "Edit must replace only the matching card");
assert.equal(editedList.find((card) => card.id === created.id)?.name, created.name, "Edit must leave every other card intact");

const trees = [{
  id: "tree-a",
  name: "Test Progression",
  assignedTo: ["player-a"],
  connections: [],
  nodes: [
    { id: "node-a", label: "Old Node", x: 20, y: 80, rank: 0, cardIds: ["legacy-card"], prerequisites: [] },
    { id: "node-b", label: "New Node", x: 50, y: 30, rank: 1, cardIds: ["other-card"], prerequisites: [] },
  ],
}];
const synchronized = editor.synchronizeCardNodeTrees(trees, legacy);
assert.equal(synchronized.changed, true, "Changing progression placement must mark node trees for persistence");
assert.deepEqual(synchronized.nextTrees[0].nodes[0].cardIds, [], "Progression save must remove a card from its previous node");
assert.deepEqual(synchronized.nextTrees[0].nodes[1].cardIds, ["other-card", "legacy-card"], "Progression save must add a card to its selected node");
assert.equal(editor.getNodeCapacityState({ ...trees[0].nodes[1], cardIds: ["a", "b", "c"] }, "new-card").isFullForSelection, true, "A different card cannot enter a full node");
assert.equal(editor.getNodeCapacityState({ ...trees[0].nodes[1], cardIds: ["a", "b", "legacy-card"] }, "legacy-card").isFullForSelection, false, "A card may keep its current full node assignment");

const invalid = makeCard({
  name: "",
  tags: ["Attack"],
  customFields: {
    [editor.keys.cardFamily]: "skill",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollLabel}`]: "Damage",
  },
});
const invalidIssues = editor.collectCardValidationIssues(invalid, emptyBuilder(), [], "manual", trees, tags);
assert.ok(invalidIssues.some((issue) => issue.id === "card-name"), "Basics validation must report a missing name beside the affected control");
assert.ok(invalidIssues.some((issue) => issue.id === "tag-required-Attack::Damage"), "Tag validation must report missing required fields");
assert.ok(invalidIssues.some((issue) => issue.id === "quick-roll-expression-1"), "Roll validation must report a missing expression");

const repaired = makeCard({
  tags: ["Attack"],
  customFields: {
    [editor.keys.cardFamily]: "skill",
    "Attack::Damage": "2d6",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollLabel}`]: "Damage",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollExpression}`]: "2d6",
    [editor.keys.trackerBucket]: "status",
    [editor.keys.trackerName]: "Burning",
  },
});
const repairedIssues = editor.collectCardValidationIssues(repaired, emptyBuilder(), [], "manual", [], tags);
assert.equal(repairedIssues.filter((issue) => issue.level === "error").length, 0, "A complete manual card with tags, rolls, and tracker must be saveable");

console.log("Card editor verification passed: creation, editing, saves, tags, rolls, trackers, assignment, progression, and legacy data are intact.");
