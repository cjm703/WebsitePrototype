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
assert.ok(model.STARTER_WORKSHOP_COMPONENTS.length >= 14, "Starter component catalog should cover both designs");

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
assert.deepEqual(unavailableQuote.unavailable, ["Standard 9mm Barrel"], "A missing unorderable part must block construction instead of becoming a purchase");

const rebuildQuote = model.calculateWorkshopQuote({ ...firearmBuild, isRebuild: true }, firearm, model.STARTER_WORKSHOP_COMPONENTS, storage);
assert.equal(rebuildQuote.baseCost, 75, "Rebuilds should use the blueprint rebuild fee rather than its base construction price");

const [migration, edge, dmUi, playerUi, personalFiles] = await Promise.all([
  fs.readFile(path.join(root, "supabase", "migrations", "20260901000000_workshop_system.sql"), "utf8"),
  fs.readFile(path.join(root, "supabase", "functions", "make-server-8a5950b5", "index.ts"), "utf8"),
  fs.readFile(path.join(root, "src", "app", "components", "dm-workshop-manager.tsx"), "utf8"),
  fs.readFile(path.join(root, "src", "app", "components", "personal-files-workshop.tsx"), "utf8"),
  fs.readFile(path.join(root, "src", "app", "components", "personal-files.tsx"), "utf8"),
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
assert.match(edge, /workshop\/item\/scrap/, "Existing-item salvage endpoint must exist");
assert.match(dmUi, /Blueprint access/, "DM manager must expose individual blueprint grants");
assert.match(dmUi, /Complete Construction/, "DM manager must expose explicit completion");
assert.match(playerUi, /Construction is awaiting DM completion/, "Player UI must explain the Building lifecycle");
assert.match(personalFiles, /workshopBootstrap\?\.enabled/, "Personal Files must hide Workshop unless server-granted access is enabled");

console.log("Workshop verification passed: catalog, quotes, access, transactions, and UI contracts are intact.");
