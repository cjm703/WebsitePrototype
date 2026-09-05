import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1))), "..");
const modelPath = path.join(root, "src", "lib", "workshop-model.ts");
const bundled = await build({ entryPoints: [modelPath], bundle: true, format: "esm", platform: "node", write: false });
const model = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);

const robot = model.STARTER_WORKSHOP_BLUEPRINTS.find((entry) => entry.id === "blueprint-humanoid-robot");
const firearm = model.STARTER_WORKSHOP_BLUEPRINTS.find((entry) => entry.id === "blueprint-modular-firearm");
assert.ok(robot, "Humanoid Robot starter blueprint is required");
assert.ok(firearm, "Modular Firearm starter blueprint is required");
assert.ok(model.STARTER_WORKSHOP_COMPONENTS.length >= 24, "Starter component catalog should cover both designs, firearm families, and Abyss ammunition");

const frameCases = [
  ["component-pistol-frame", "pistol", "Standard Pistol Frame"],
  ["component-revolver-frame", "revolver", "Standard Revolver Frame"],
  ["component-shotgun-frame", "shotgun", "Standard Shotgun Frame"],
  ["component-rifle-frame", "rifle", "Standard Rifle Frame"],
  ["component-automatic-frame", "automatic", "Standard Automatic Frame"],
];
for (const [componentId, expectedType, expectedName] of frameCases) {
  const frame = model.STARTER_WORKSHOP_COMPONENTS.find((entry) => entry.id === componentId);
  assert.ok(frame, `${componentId} starter frame is required`);
  assert.equal(frame.name, expectedName, `${componentId} must use the plain standard naming scheme`);
  assert.equal(model.workshopFirearmFrameType(frame), expectedType, `${componentId} must control the firearm silhouette and output type`);
}

const firearmBalanceCases = [
  ["component-pistol-frame", 350, "2d6 piercing damage", "Capacity 10", 1150],
  ["component-revolver-frame", 400, "2d8 piercing damage", "Capacity 6", 1200],
  ["component-shotgun-frame", 650, "3d6 piercing within 15 ft", "Capacity 2", 1450],
  ["component-rifle-frame", 1000, "2d10 piercing damage", "Capacity 5", 1800],
  ["component-automatic-frame", 900, "2d6 piercing damage", "Capacity 15", 1700],
];
for (const [componentId, expectedPrice, damageText, capacityText, requiredBuildCost] of firearmBalanceCases) {
  const frame = model.STARTER_WORKSHOP_COMPONENTS.find((entry) => entry.id === componentId);
  assert.equal(frame?.price, expectedPrice, `${componentId} must use its balanced frame price`);
  assert.ok(frame?.effects.some((entry) => entry.kind === "dice" && entry.text.includes(damageText)), `${componentId} must define its own damage profile`);
  assert.ok(frame?.effects.some((entry) => entry.text.includes(capacityText)), `${componentId} must define capacity and reload behavior`);
  assert.equal(500 + expectedPrice + 80 + 220, requiredBuildCost, `${componentId} required build cost must match the balance sheet`);
}

const componentById = (id) => model.STARTER_WORKSHOP_COMPONENTS.find((entry) => entry.id === id);
const robotSlot = (id) => robot.slots.find((entry) => entry.id === id);
const firearmSlot = (id) => firearm.slots.find((entry) => entry.id === id);
assert.equal(componentById("component-basic-chest")?.name, "Standard Robot Frame", "Robot chassis naming must identify the part as a frame");
assert.equal(componentById("component-steel-plating")?.name, "Standard Steel Armor", "Robot plating naming must identify the part as armor");
assert.deepEqual(robotSlot("robot-chest")?.acceptedCategories, ["Robot Frame"], "Robot frame must have its own slot category");
assert.deepEqual(robotSlot("robot-plating")?.acceptedCategories, ["Robot Armor"], "Robot armor must have its own slot category");
assert.deepEqual(robotSlot("robot-aux-chest")?.acceptedCategories, ["Robot Chest Auxiliary"], "Chest auxiliaries must be position-locked");
assert.equal(model.isWorkshopComponentCompatible(robotSlot("robot-aux-chest"), componentById("component-heavy-chest-mount")), true, "Large firearm mount must fit the chest auxiliary bay");
assert.equal(model.isWorkshopComponentCompatible(robotSlot("robot-back"), componentById("component-heavy-chest-mount")), false, "Large firearm mount must not fit the back bay");

const suppressor = componentById("component-suppressor");
const standardAmmo = componentById("component-9mm-ammo");
const standardBarrel = componentById("component-9mm-barrel");
assert.equal(standardAmmo?.name, "Standard Crystal Ammunition System", "Standard ammunition must work with every frame family");
assert.ok(standardAmmo?.effects.every((entry) => entry.kind !== "dice"), "Standard ammunition must not add a second base damage roll");
assert.equal(standardBarrel?.name, "Standard Modular Barrel", "The starter barrel must not imply one caliber for every frame");
assert.ok(standardBarrel?.effects.some((entry) => entry.value === 30 && entry.text.includes("normal and maximum")), "The standard barrel must state how it changes both ranges");
assert.ok(suppressor?.effects.some((entry) => entry.text.includes("Reduce normal range by 10 ft")), "The suppressor must include its range tradeoff");
assert.deepEqual(firearmSlot("gun-muzzle")?.acceptedCategories, ["Muzzle Attachment"], "Muzzle attachments need a distinct compatibility category");
assert.deepEqual(firearmSlot("gun-underbarrel")?.acceptedCategories, ["Underbarrel Attachment"], "Underbarrel attachments need a distinct compatibility category");
assert.deepEqual(firearmSlot("gun-side")?.acceptedCategories, ["Side Attachment"], "Side attachments need a distinct compatibility category");
assert.equal(model.isWorkshopComponentCompatible(firearmSlot("gun-muzzle"), suppressor), true, "Suppressor must fit the muzzle bay");
assert.equal(model.isWorkshopComponentCompatible(firearmSlot("gun-underbarrel"), suppressor), false, "Suppressor must not fit the underbarrel bay");

const abyssAmmo = model.STARTER_WORKSHOP_COMPONENTS.filter((entry) => entry.tags.includes("abyss-fabricator"));
assert.equal(abyssAmmo.length, 6, "All six Abyss Fabricator ammunition settings must be available");
assert.ok(abyssAmmo.every((entry) => entry.category === "Ammunition" && entry.orderable && entry.price === 0), "Abyss magazines must be compatible, orderable, and free");

const saintReadiness = model.workshopBuildReadiness(model.SAINT_GREGORY_SAMPLE, robot, model.STARTER_WORKSHOP_COMPONENTS);
assert.equal(saintReadiness.ready, true, "Saint Gregory should fill every required Humanoid Robot slot compatibly");

const taggedSlot = model.normalizeWorkshopSlot({ acceptedTags: ["optic", "magic"], acceptedCategories: [] });
const magicPart = model.normalizeWorkshopComponent({ category: "Accessory", tags: ["magic"], active: true });
assert.equal(model.isWorkshopComponentCompatible(taggedSlot, magicPart), true, "Compatible tags intentionally use any-one matching");

const firearmBuild = model.normalizeWorkshopBuild({
  id: "quote-test",
  playerId: "player-test",
  blueprintId: firearm.id,
  assignments: [
    { slotId: "gun-frame", componentId: "component-pistol-frame" },
    { slotId: "gun-ammo", componentId: "component-9mm-ammo" },
    { slotId: "gun-barrel", componentId: "component-9mm-barrel" },
  ],
});
const storage = model.normalizeWorkshopStorage({ playerId: "player-test", quantities: { "component-pistol-frame": 1 } });
const quote = model.calculateWorkshopQuote(firearmBuild, firearm, model.STARTER_WORKSHOP_COMPONENTS, storage);
assert.equal(quote.baseCost, 500, "Initial firearm build should use its base construction price");
assert.equal(quote.ownedParts, 1, "Owned parts should be consumed before ordering");
assert.equal(quote.orderedParts, 2, "Missing orderable parts should be purchased at completion");
assert.equal(quote.totalCost, 800, "Quote should combine the base price with ordered ammunition and barrel costs");
assert.deepEqual(quote.storageReservation, { "component-pistol-frame": 1 }, "Owned parts should be explicitly reserved");

const unavailableComponents = model.STARTER_WORKSHOP_COMPONENTS.map((entry) => entry.id === "component-9mm-barrel" ? { ...entry, orderable: false } : entry);
const unavailableQuote = model.calculateWorkshopQuote(firearmBuild, firearm, unavailableComponents, storage);
assert.deepEqual(unavailableQuote.unavailable, ["Standard Modular Barrel"], "A missing unorderable part must block construction instead of becoming a purchase");

const rebuildQuote = model.calculateWorkshopQuote({ ...firearmBuild, isRebuild: true }, firearm, model.STARTER_WORKSHOP_COMPONENTS, storage);
assert.equal(rebuildQuote.baseCost, 75, "Rebuilds should use the blueprint rebuild fee rather than its base construction price");

const [migration, edge, serverWorkshop, dmUi, playerUi, blueprintVisual, personalFiles, interfaceUi, catalogAlignmentMigration, firearmBalanceMigration, firearmBalanceSheet, workshopApi] = await Promise.all([
  fs.readFile(path.join(root, "supabase", "migrations", "20260901000000_workshop_system.sql"), "utf8"),
  fs.readFile(path.join(root, "supabase", "functions", "make-server-8a5950b5", "index.ts"), "utf8"),
  fs.readFile(path.join(root, "supabase", "functions", "make-server-8a5950b5", "workshop.ts"), "utf8"),
  fs.readFile(path.join(root, "src", "app", "components", "dm-workshop-manager.tsx"), "utf8"),
  fs.readFile(path.join(root, "src", "app", "components", "personal-files-workshop.tsx"), "utf8"),
  fs.readFile(path.join(root, "src", "app", "components", "workshop-blueprint-visual.tsx"), "utf8"),
  fs.readFile(path.join(root, "src", "app", "components", "personal-files.tsx"), "utf8"),
  fs.readFile(path.join(root, "src", "app", "components", "intelli-interface.tsx"), "utf8"),
  fs.readFile(path.join(root, "supabase", "migrations", "20260901020000_workshop_catalog_alignment.sql"), "utf8"),
  fs.readFile(path.join(root, "supabase", "migrations", "20260901030000_workshop_firearm_balance.sql"), "utf8"),
  fs.readFile(path.join(root, "docs", "modular-firearm-balance.md"), "utf8"),
  fs.readFile(path.join(root, "src", "lib", "workshop-api.ts"), "utf8"),
]);
const salvageSafetyMigration = await fs.readFile(path.join(root, "supabase", "migrations", "20260901010000_workshop_salvage_assignment_safety.sql"), "utf8");

for (const functionName of ["workshop_complete_build", "workshop_return_components", "workshop_scrap_existing_item", "workshop_adjust_storage"]) {
  assert.match(migration, new RegExp(`create or replace function public\\.${functionName}\\(`), `${functionName} transaction must be defined`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}\\(`), `${functionName} must only be callable through the service role path`);
}
assert.match(migration, /Player does not have enough credits\. Required:/, "Completion must return the agreed insufficient-credit message");
assert.match(salvageSafetyMigration, /jsonb_array_length\(v_assigned\) > 1/, "Shared legacy item salvage must preserve other players' assignments");
assert.match(edge, /workshop\/admin\/build\/complete/, "DM completion endpoint must exist");
assert.match(edge, /workshop\/build\/rebuild/, "Player rebuild endpoint must exist");
assert.match(edge, /workshop\/build\/delete-draft/, "Player draft deletion endpoint must exist");
assert.match(edge, /Only Draft work orders can be deleted/, "Server must refuse deletion after construction begins");
assert.match(edge, /workshop\/item\/scrap/, "Existing-item salvage endpoint must exist");
assert.match(dmUi, /Blueprint access/, "DM manager must expose individual blueprint grants");
assert.match(dmUi, /Complete Construction/, "DM manager must expose explicit completion");
assert.match(playerUi, /Construction is awaiting DM completion/, "Player UI must explain the Building lifecycle");
assert.match(playerUi, /localDraftsRef/, "Player Workshop must retain unsaved work orders across bootstrap refreshes");
assert.match(playerUi, /UNSAVED/, "Player Workshop must expose retained local drafts in the work-order list");
assert.match(playerUi, /WorkshopBlueprintVisual/, "Player Workshop must mount the visual assembly editor");
assert.match(playerUi, /Delete Draft/, "Player Workshop must expose draft deletion");
assert.match(playerUi, /serverBacked/, "Draft deletion must distinguish unsaved local drafts from persisted drafts");
assert.match(workshopApi, /deleteWorkshopDraft/, "Workshop API must expose persisted draft deletion");
assert.match(blueprintVisual, /Assembly projection/, "Visual editor must expose the central blueprint projection");
assert.match(blueprintVisual, /Parts Bay/, "Visual editor must keep compatible owned and orderable parts in the bottom bay");
assert.match(blueprintVisual, /isWorkshopComponentCompatible/, "Visual part choices must use the canonical compatibility rules");
assert.match(blueprintVisual, /Automatic configuration/, "Firearm projection must expose frame-driven visual families");
assert.match(blueprintVisual, /if \(frameType === "receiver"\) return null;/, "An empty firearm frame must not render a weapon decoration");
assert.match(blueprintVisual, /<g pointerEvents="none">/, "Connector lines must stay outside the interactive marker layer");
assert.match(blueprintVisual, /textLength=/, "Long module-bay labels must fit inside the compact selected label box");
assert.doesNotMatch(blueprintVisual, /stroke="transparent" strokeWidth="7"/, "Connector hit strokes must not cover module-bay buttons");
assert.doesNotMatch(interfaceUi, /Personal Files now sits ahead of Commerce/, "The temporary System Modules notice must be removed");
assert.match(catalogAlignmentMigration, /component-heavy-chest-mount.*Robot Chest Auxiliary/, "Existing chest-mount catalog data must migrate without deleting builds");
assert.match(catalogAlignmentMigration, /gun-underbarrel.*Underbarrel Attachment/, "Existing firearm slots must migrate to distinct attachment categories");
for (const [componentId] of firearmBalanceCases) {
  assert.match(firearmBalanceMigration, new RegExp(componentId), `${componentId} must be updated for existing Supabase catalogs`);
}
assert.match(firearmBalanceMigration, /Custom components, Workshop builds, storage, assignments, and salvage data are untouched/, "Balance migration must document its data-preserving scope");
assert.match(firearmBalanceSheet, /## Starter Frame Baselines/, "The firearm balance sheet must document frame baselines");
assert.match(firearmBalanceSheet, /## Part Influence/, "The firearm balance sheet must document module influence");
assert.match(firearmBalanceSheet, /## Stacking Rules/, "The firearm balance sheet must document effect stacking");
assert.match(serverWorkshop, /Workshop::Firearm Type/, "Completed firearm items must retain their frame-defined type");
assert.match(personalFiles, /workshopBootstrap\?\.enabled/, "Personal Files must hide Workshop unless server-granted access is enabled");

console.log("Workshop verification passed: catalog, quotes, access, transactions, visual assembly, and UI contracts are intact.");
