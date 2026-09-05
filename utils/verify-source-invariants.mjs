import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const edge = read("supabase/functions/make-server-8a5950b5/index.ts");
const richEditor = read("src/app/components/rich-text-editor.tsx");
const commerce = read("src/app/components/commerce-page.tsx");
const dmItemManager = read("src/app/components/dm-item-manager-section.tsx");
const personalFiles = read("src/app/components/personal-files.tsx");
const itemCombatRules = read("src/lib/item-combat-rules.ts");
const initialData = read("src/app/components/initial-data.tsx");
const dmArea = read("src/app/components/dm-area.tsx");
const dmWikiSection = read("src/app/components/dm-wiki-section.tsx");
const routes = read("src/app/routes.tsx");
const gamePage = read("src/app/components/game.tsx");
const routeErrorPage = read("src/app/components/route-error-page.tsx");
const lazyModule = read("src/lib/lazy-module.ts");
const vercelConfig = read("vercel.json");
const supabaseEnv = read("src/lib/supabase-env.ts");
const combatPage = read("src/app/components/combat-page.tsx");
const intelliMaps = read("src/app/components/intelli-maps.tsx");
const supabaseClient = read("src/lib/supabaseClient.ts");
const migration = read("supabase/migrations/20260723000000_secure_app_schema.sql");
const wikiBlocks = read("src/lib/wiki-article-blocks.ts");
const wikiEditor = read("src/app/components/wiki-editor.tsx");
const inetPage = read("src/app/components/inet-page.tsx");
const supabaseConfig = read("supabase/config.toml");
const dmSystemStatus = read("src/app/components/dm-system-status.tsx");
const dmNotificationsManager = read("src/app/components/dm-notifications-manager.tsx");
const systemStatusHook = read("src/app/components/use-system-status.ts");
const safeStorage = read("src/app/components/safe-storage.tsx");
const storageStatusApi = read("src/lib/system-status-api.ts");
const storageStatusEdge = read("supabase/functions/system-status/index.ts");
const storageStatusMigration = read("supabase/migrations/20260830000000_system_storage_status.sql");
const adventureRemovalMigration = read("supabase/migrations/20260830010000_remove_adventure_prototype.sql");
const nexusNomad = read("src/app/components/nexus-nomad.tsx");
const officeBusinessMap = read("src/app/components/office-business-map.tsx");
const businessMapEditor = read("src/app/components/business-map-editor.tsx");
const mysticParkDecoration = read("src/app/components/mystic-park-zone-decoration.tsx");
const businessMapModel = read("src/lib/business-map-model.ts");
const businessMapStorage = read("src/lib/business-map-storage.ts");
const officeStateApi = read("src/lib/office-state-api.ts");
const facilityDepthModel = read("src/lib/facility-depth-model.ts");
const facilityOfficeState = read("src/lib/facility-office-state.ts");
const facilityMapPage = read("src/app/components/facility-map-page.tsx");
const facilityFinancePage = read("src/app/components/facility-finance-page.tsx");
const businessMapMigration = read("supabase/migrations/20260830020000_business_map_assets.sql");
const intelliInterface = read("src/app/components/intelli-interface.tsx");
parse(edge, { sourceType: "module", plugins: ["typescript"] });
parse(storageStatusEdge, { sourceType: "module", plugins: ["typescript"] });
parse(officeBusinessMap, { sourceType: "module", plugins: ["typescript", "jsx"] });
parse(businessMapEditor, { sourceType: "module", plugins: ["typescript", "jsx"] });
parse(mysticParkDecoration, { sourceType: "module", plugins: ["typescript", "jsx"] });
parse(businessMapModel, { sourceType: "module", plugins: ["typescript"] });
parse(businessMapStorage, { sourceType: "module", plugins: ["typescript"] });
parse(officeStateApi, { sourceType: "module", plugins: ["typescript"] });
parse(facilityDepthModel, { sourceType: "module", plugins: ["typescript"] });
parse(facilityOfficeState, { sourceType: "module", plugins: ["typescript"] });
parse(facilityMapPage, { sourceType: "module", plugins: ["typescript", "jsx"] });
parse(facilityFinancePage, { sourceType: "module", plugins: ["typescript", "jsx"] });
parse(dmItemManager, { sourceType: "module", plugins: ["typescript", "jsx"] });
parse(personalFiles, { sourceType: "module", plugins: ["typescript", "jsx"] });
parse(itemCombatRules, { sourceType: "module", plugins: ["typescript"] });

function routeBody(routeMarker, nextMarker) {
  const start = edge.indexOf(routeMarker);
  assert.notEqual(start, -1, `Missing route ${routeMarker}`);
  const end = edge.indexOf(nextMarker, start + routeMarker.length);
  return edge.slice(start, end === -1 ? edge.length : end);
}

for (const [marker, next] of [
  ["/auth-codes/set", "/auth-codes/verify"],
  ["/auth-codes/:profileId", "/auth-codes/migrate"],
  ["/auth-codes/migrate", "/profile-picture/upload"],
]) {
  assert.match(routeBody(marker, next), /requireDMSession\(c\)/);
}
assert.doesNotMatch(edge, /VERIFY BODY|VERIFY STORED|debug-kv|debug-test/);
assert.match(routeBody("/auth-codes/verify", "/auth-codes/status"), /recordFailedAuthAttempt/);
assert.match(edge, /app\.get\(`\$\{prefix\}\/session\/me`/);
assert.match(edge, /sanitizeStoredValue/);
assert.match(edge, /\/data\/collection\/:table/);
assert.match(edge, /\/music\/upload/);
assert.doesNotMatch(edge, /replace(?:Collection|Entity|Tag)Rows/);
assert.match(edge, /explicitDeleteIds\(body\?\.deleteIds/);

assert.match(richEditor, /onChange\(sanitized\)/);
const sourceRoot = path.join(root, "src");
const sourceFiles = [];
const collectSourceFiles = (current) => {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) collectSourceFiles(fullPath);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(fullPath);
  }
};
collectSourceFiles(sourceRoot);
for (const filePath of sourceFiles) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (
      line.includes("dangerouslySetInnerHTML={{") &&
      !line.trimStart().startsWith("*") &&
      !line.includes("sanitizeRichHtml(")
    ) {
      assert.fail(
        `Unsanitized HTML sink in ${path.relative(root, filePath)}:${index + 1}`,
      );
    }
  });
}

assert.match(commerce, /useState<Shop\[]>\(\[\]\)/);
assert.match(commerce, /normalizeCommerceShops\(shopsData\)/);
assert.doesNotMatch(commerce, /deductCurrencyFromInventoryState|addPurchasesToInventoryState/);
assert.match(commerce, /onPersistTags=\{persistCommerceItemTags\}/);
assert.match(dmArea, /onPersistTags=\{\(next\) => persistTags\("item", next\)\}/);
assert.match(dmItemManager, /"Create Tag"/);
assert.match(dmItemManager, /Two-Handed Weapon/);
assert.match(dmItemManager, /Weapon Damage Roll/);
assert.match(dmItemManager, /activeInfoFieldId/);
assert.match(dmItemManager, /aria-expanded=\{expanded\}/);
assert.match(itemCombatRules, /ITEM_EQUIPMENT_HANDS_KEY = "Equipment::Hands"/);
assert.match(itemCombatRules, /ITEM_WEAPON_DAMAGE_KEY = "Weapon::Damage"/);
assert.match(itemCombatRules, /normalizedTags\(item\)\.includes\("versatile"\)/);
assert.match(personalFiles, /resolveWeaponDamageAttribute\(item, effectiveStats\)/);
assert.match(personalFiles, /assignToSlot\(assigningSlot, item\.id, isWeaponSlot && is2H \? true : undefined\)/);
assert.match(personalFiles, /renderWeaponDamageRoll\(item, true\)/);
assert.doesNotMatch(initialData, /testItemDefaults|testCardDefaults|Insert funny joke/);
assert.doesNotMatch(initialData, /missing = defaults\.filter/);

assert.match(dmArea, /const DMCardManagerSection = lazy/);
assert.doesNotMatch(dmArea, /import \{ DMCardManagerSection \}/);
assert.match(dmWikiSection, /expandedFamilyArticleIds/);
assert.match(dmWikiSection, /Boolean\(normalizedQuery\) \|\| expandedFamilyArticleIds\.has\(pageId\)/);
assert.match(dmWikiSection, /aria-expanded=\{isExpanded\}/);
assert.match(routes, /lazyRoute\(\(\) => import\("\.\/components\/game"\)/);
assert.doesNotMatch(routes, /lazy:\s*\(\)\s*=>\s*import\(/);
assert.match(routes, /errorElement:\s*<RouteErrorPage \/>/);
assert.match(gamePage, /importWithStaleChunkRecovery\(\(\) => import\("\.\/snake-game"\)\)/);
assert.doesNotMatch(gamePage, /AdventurePrototype|activeAdventure|adventure-prototype/i);
assert.doesNotMatch(edge, /adventure-prototype/);
assert.doesNotMatch(supabaseConfig, /functions\.adventure-prototype/);
assert.doesNotMatch(dmArea, /Adventure Creator|id: "adventure"|adventure-game/i);
assert.equal(fs.existsSync(path.join(root, "src/app/components/adventure")), false);
assert.equal(fs.existsSync(path.join(root, "src/app/components/adventure-prototype.tsx")), false);
assert.equal(fs.existsSync(path.join(root, "src/lib/adventure-prototype-api.ts")), false);
assert.match(adventureRemovalMigration, /drop table if exists public\.adventure_prototype_bots/);
assert.match(adventureRemovalMigration, /delete from public\.app_arcade_catalog_state where id = 'adventure-sessions'/);
assert.match(routeErrorPage, /useRouteError\(\)/);
assert.match(lazyModule, /failed to fetch dynamically imported module/i);
assert.match(lazyModule, /window\.location\.reload\(\)/);
assert.match(vercelConfig, /no-cache, no-store, must-revalidate/);
const parsedVercelConfig = JSON.parse(vercelConfig);
assert.deepEqual(parsedVercelConfig.rewrites[0], {
  source: "/api/inet-server/:path*",
  destination: "https://fkfwnkbzgktvhdbybgrw.supabase.co/functions/v1/make-server-8a5950b5/:path*",
});
assert.ok(
  parsedVercelConfig.headers.some(
    (rule) =>
      rule.source === "/api/inet-server/:path*" &&
      rule.headers.some(
        (header) => header.key === "Cache-Control" && header.value === "no-store",
      ),
  ),
);
assert.match(supabaseEnv, /import\.meta\.env\.PROD[\s\S]*configuredProductionFunctionBase/);
assert.match(supabaseEnv, /productionFunctionProxy = "\/api\/inet-server"/);
assert.match(supabaseEnv, /rawSupabaseFunctionBase\.startsWith\("\/"\)/);
assert.match(dmArea, /id: "system" as const, label: "System Status"/);
assert.match(dmArea, /<DMSystemStatus/);
assert.doesNotMatch(dmArea, /id: "notifs"|activeSection === "notifs"/);
assert.match(dmArea, /notificationsContent=\{/);
assert.match(dmSystemStatus, /useSystemStatus\(\)/);
assert.match(dmSystemStatus, /Error &amp; Report Log/);
assert.match(dmSystemStatus, /id: "notifications", label: "Notifications"/);
assert.match(dmSystemStatus, /Clear Disposable Cache/);
assert.match(dmSystemStatus, /loadSupabaseStorageStatus\(\)/);
assert.match(dmNotificationsManager, /Manage Notifications/);
assert.match(dmNotificationsManager, /notifications\.filter\(\(notification\) => !isPlayerReport\(notification\)\)/);
assert.match(systemStatusHook, /buildSupabasePublicHeaders\(false\)/);
assert.match(systemStatusHook, /subscribeErrorLog\(refreshMetrics\)/);
assert.match(systemStatusHook, /classifyStorageKey\(key\)/);
assert.match(safeStorage, /clearPrunableStorage\(\)/);
assert.match(safeStorage, /RETIRED_STORAGE_KEYS = \["inet-adventure-sessions"\]/);
assert.match(safeStorage, /importance: "critical"/);
assert.match(storageStatusApi, /functions\/v1\/system-status/);
assert.match(storageStatusApi, /sessionApiFetchAt\(SYSTEM_STATUS_API_BASE, "\/storage"/);
assert.match(storageStatusEdge, /app\.get\("\/system-status\/storage"/);
assert.match(storageStatusEdge, /await requireDMSession\(c\)/);
assert.match(storageStatusEdge, /app_system_storage_status/);
assert.match(supabaseConfig, /\[functions\.system-status\][\s\S]*verify_jwt = false/);
assert.match(storageStatusMigration, /pg_database_size\(current_database\(\)\)/);
assert.match(storageStatusMigration, /grant execute on function public\.app_system_storage_status\(\) to service_role/);
assert.match(nexusNomad, /DEFAULT_OFFICE_NAME = "Wasp Office and Business"/);
assert.match(nexusNomad, /id: "map" as const, label: "Business Map"/);
assert.match(nexusNomad, /businessMap: normalizeOfficeBusinessMap\(raw\.businessMap\)/);
assert.match(nexusNomad, /<OfficeBusinessMap/);
assert.match(nexusNomad, /businessMap\?: OfficeBusinessMapState/);
assert.match(nexusNomad, /createFacilityBusinessMap\(fac\.name\)/);
assert.match(nexusNomad, /onMoveUp=\{\(\) => moveFacCategory\(cat\.id, -1\)\}/);
assert.match(nexusNomad, /Open Facility Map/);
assert.match(nexusNomad, /assignFacilityOwner/);
assert.match(nexusNomad, /Player Accounts/);
assert.doesNotMatch(nexusNomad, />Personal Funds</);
assert.match(nexusNomad, /facilityAdditions: facilityState\.facilityAdditions/);
assert.match(nexusNomad, /countInstalledFacilityAdditions/);
assert.match(nexusNomad, /countInstalledFacilityAdditionSlots\(fac\.businessMap\)/);
assert.match(nexusNomad, /saveOfficeState\(persistentState, persistentState\.revision\)/);
assert.match(nexusNomad, /subscribeToOfficeStateSignals/);
assert.match(nexusNomad, /onPlayerAction=\{handleFacilityAdditionAction\}/);
assert.doesNotMatch(nexusNomad, /Central operations hub/);
assert.doesNotMatch(intelliInterface, /active agent.*cataloged/);
assert.match(officeBusinessMap, /from "@\/lib\/business-map-model"/);
assert.match(businessMapModel, /export function createFacilityBusinessMap/);
assert.match(businessMapModel, /version: 3/);
assert.match(businessMapModel, /isFacilityAdditionCompatible/);
assert.match(businessMapModel, /isBusinessSectorUnlocked/);
assert.match(businessMapModel, /BusinessSectorVisualShape/);
assert.match(businessMapModel, /BUSINESS_SECTOR_DECORATION_THEMES/);
assert.match(businessMapModel, /FACILITY_ADDITION_CATEGORIES/);
assert.match(businessMapModel, /FACILITY_SLOT_ROLES/);
assert.match(businessMapModel, /acceptedAdditionCategories/);
assert.match(businessMapModel, /target\.tier === "major"/);
assert.match(businessMapEditor, /Facility Addition Storage/);
assert.match(businessMapEditor, /selectedSlot && selectedSlot\.tier === "minor" && <div ref=\{additionLibraryRef\}>/);
assert.match(businessMapEditor, /function EmptySlotIcon/);
assert.match(businessMapEditor, /Create Facility Addition/);
assert.match(businessMapEditor, /acceptedAdditionCategories\[0\]/);
assert.match(businessMapEditor, /additionLibraryRef\.current\?\.scrollIntoView/);
assert.match(businessMapEditor, /SWITCH TO/);
assert.match(businessMapEditor, /onExpansionAction/);
assert.match(businessMapEditor, /application\/x-facility-addition/);
assert.match(businessMapEditor, /startRectOperation/);
assert.match(businessMapEditor, /finishDrawing/);
assert.match(businessMapEditor, /uploadBusinessMapImage/);
assert.match(businessMapEditor, /sectorShapeStyle/);
assert.match(businessMapEditor, /walkwayWidth/);
assert.doesNotMatch(businessMapEditor, /strokeDasharray="4 4"/);
assert.match(businessMapEditor, /const compact = sector\.width <= 2 \|\| sector\.height <= 1/);
assert.match(businessMapEditor, /shape\.id === "park-ring"/);
assert.match(businessMapEditor, /shape\.id\.startsWith\("perimeter-"\)/);
assert.match(businessMapEditor, /organicShapeProfile/);
assert.match(businessMapEditor, /function overviewZoom/);
assert.match(businessMapEditor, /layer: "sector" \| "slot" \| "expansion"/);
assert.match(businessMapEditor, /ExpansionInspector/);
assert.match(businessMapEditor, /Save successful\./);
assert.match(businessMapEditor, /min-h-\[88px\]/);
assert.match(businessMapEditor, /const radiusX =/);
assert.match(businessMapEditor, /const radiusY =/);
assert.match(businessMapEditor, /Area Shape/);
assert.match(businessMapEditor, /operationsPanel\?: React\.ReactNode/);
assert.match(businessMapEditor, /rightPanelTab/);
assert.match(businessMapEditor, /viewport\.scrollTop = Math\.max/);
assert.match(businessMapEditor, /overflow-x-hidden overflow-y-auto/);
assert.match(businessMapEditor, /aria-label="Recenter map"/);
assert.match(businessMapEditor, /\(viewport\.scrollHeight - viewport\.clientHeight\) \/ 2/);
assert.match(businessMapEditor, /MysticParkZoneDecoration/);
assert.match(businessMapEditor, /value\.name === "Mystic Lands Park"/);
assert.match(businessMapEditor, /Math\.max\(10\.4, shape\.strokeWidth \* 5\.6\)/);
assert.match(businessMapEditor, /path-light-/);
assert.match(businessMapEditor, /strokeDasharray="0\.1 0\.12"/);
assert.match(businessMapEditor, /strokeDasharray="0\.12 0\.18"/);
assert.match(businessMapEditor, /AREA CONTENTS & SLOTS/);
assert.match(businessMapEditor, /SLOT COMPATIBILITY/);
assert.match(businessMapEditor, /COMPATIBLE TAGS/);
assert.doesNotMatch(businessMapEditor, /Required Tags|REQUIRED TAGS/);
assert.match(businessMapEditor, /Edit Interior Layout/);
assert.doesNotMatch(businessMapEditor, /Open Sector/);
assert.doesNotMatch(businessMapEditor, /if \(!editMode && !locked\) setActiveSectorId/);
[
  "enchanted-gardens",
  "magic-mountain",
  "dream-land",
  "world-tree",
  "stormlands",
  "mushroom-forest",
  "whispering-woods",
].forEach((theme) => assert.match(mysticParkDecoration, new RegExp(theme)));
assert.match(mysticParkDecoration, /function BlossomTree/);
assert.match(mysticParkDecoration, /function DreamStorefront/);
assert.match(mysticParkDecoration, /function GardenEntrance/);
assert.match(mysticParkDecoration, /function DreamPizzeria/);
assert.match(mysticParkDecoration, /function GiantMushroom/);
assert.match(mysticParkDecoration, /attributeName="cx"/);
assert.doesNotMatch(mysticParkDecoration, /function WhimsyTree/);
assert.doesNotMatch(mysticParkDecoration, /fairyGlow|greenGround|woods:/);
assert.match(businessMapStorage, /business-map\/assets\/upload/);
assert.match(officeStateApi, /office\/facility-addition\/action/);
assert.match(officeStateApi, /office\/facility-expansion\/action/);
assert.match(officeStateApi, /office\/personal-funds\/update/);
assert.match(officeStateApi, /office\/facility-month\/advance/);
assert.match(officeStateApi, /channel\.httpSend\("office-state-updated"/);
assert.doesNotMatch(officeStateApi, /channel\.send\(/);
assert.match(routes, /nexus-nomad\/facility\/:facilityId\/map/);
assert.match(routes, /nexus-nomad\/facility\/:facilityId\/finances/);
assert.match(facilityMapPage, /FacilityOperationsPanel/);
assert.match(facilityMapPage, /operationsPanel=\{currentStats/);
assert.match(facilityMapPage, /canManageAdditions=\{canManage\}/);
assert.match(facilityMapPage, /rebaseFacilityOfficeEdits/);
assert.match(facilityMapPage, /saveLoopPromiseRef/);
assert.match(facilityMapPage, /const flushDMSave/);
assert.match(facilityMapPage, /onSave=\{saveNow\}/);
assert.match(facilityMapPage, /Monthly Revenue &amp; Expenses/);
assert.match(facilityFinancePage, /Advance to Month/);
assert.match(facilityFinancePage, /Base Economy Settings/);
assert.match(facilityDepthModel, /calculateFacilityEconomy/);
assert.match(facilityDepthModel, /staffRequired/);
assert.match(facilityDepthModel, /staffProvided/);
assert.doesNotMatch(facilityDepthModel, /maintenance: \{ label:/);
assert.match(facilityDepthModel, /Mystic Lands Park/);
assert.match(facilityDepthModel, /Northern Future Parkland/);
assert.match(facilityDepthModel, /Future Parkland West/);
assert.match(facilityDepthModel, /Future Parkland East/);
assert.match(facilityDepthModel, /mystic-lands-park-v14/);
assert.match(facilityDepthModel, /THIRTEENTH_MYSTIC_LANDS_PARK_PRESET_ID/);
assert.match(facilityDepthModel, /Dream Land Pizzeria/);
assert.match(facilityDepthModel, /Reception Slot/);
assert.match(facilityDepthModel, /Flexible Addition Slot/);
assert.match(facilityDepthModel, /role: "Ride", tier: "major"/);
assert.match(facilityDepthModel, /Guest Walkway/);
assert.match(facilityDepthModel, /Area Perimeter Walkway/);
assert.match(facilityDepthModel, /const walkway =/);
assert.match(facilityDepthModel, /fence-north/);
assert.match(facilityDepthModel, /park-ring/);
[
  "Enchanted Gardens",
  "Magic Mountain",
  "Dream Land",
  "World Tree",
  "Stormlands",
  "Mushroom Forest",
  "Whispering Woods",
].forEach((name) => assert.match(facilityDepthModel, new RegExp(name)));
assert.match(facilityDepthModel, /World Tree Service Access/);
[
  "Moonstone Entrance",
  "Aetherheart Commons",
  "Whisperwood Gardens",
  "Dragonspire Heights",
  "Crystal Carnival",
  "Starlight Promenade",
  "Runebrook Hollow",
  "Wayfarer Alley",
  "Celestial Wilds",
  "Astral Frontier",
].forEach((name) => assert.doesNotMatch(facilityDepthModel, new RegExp(name)));
assert.match(facilityDepthModel, /LEGACY_MYSTIC_ADDITION_IDS/);
assert.doesNotMatch(facilityDepthModel, /MYSTIC_ADDITION_SEEDS/);
assert.match(facilityOfficeState, /version: Math\.max\(6/);
assert.match(facilityOfficeState, /isGeneratedMainFloor/);
assert.match(facilityOfficeState, /existing\.presetId === MYSTIC_LANDS_PARK_PRESET_ID/);
assert.match(facilityOfficeState, /businessMap: existingMap \|\| presetMap/);
assert.match(facilityOfficeState, /existing\.presetId === ELEVENTH_MYSTIC_LANDS_PARK_PRESET_ID/);
assert.match(facilityOfficeState, /existing\.presetId === TWELFTH_MYSTIC_LANDS_PARK_PRESET_ID/);
assert.match(facilityOfficeState, /existing\.presetId === THIRTEENTH_MYSTIC_LANDS_PARK_PRESET_ID/);
assert.match(facilityOfficeState, /preservedCustomSlots/);
assert.match(facilityOfficeState, /canonicalizePresentation/);
assert.match(facilityOfficeState, /point\.x - 3/);
assert.match(edge, /app_nexus_nomad_state: \{ write: "dm" \}/);
assert.match(edge, /office\/state\/save/);
assert.match(edge, /office\/facility-addition\/action/);
assert.match(edge, /office\/facility-expansion\/action/);
assert.match(edge, /office\/personal-funds\/update/);
assert.match(edge, /office\/facility-month\/advance/);
assert.match(routeBody("/office/facility-month/advance", "/office/facility-expansion/action"), /await requireDMSession\(c\)/);
assert.match(routeBody("/office/facility-month/advance", "/office/facility-expansion/action"), /FACILITY_MONTH_CONFLICT/);
assert.match(routeBody("/office/facility-month/advance", "/office/facility-expansion/action"), /\.\.\.economy\.baseStats/);
assert.match(edge, /preserveFacilityMonthlyLedgers/);
assert.match(routeBody("/office/facility-expansion/action", "/business-map/assets/upload"), /Only the assigned facility owner/);
assert.match(routeBody("/office/facility-expansion/action", "/business-map/assets/upload"), /await requireDMSession\(c\)/);
assert.match(edge, /additionFitsBusinessSlot/);
assert.match(edge, /acceptedAdditionCategories/);
assert.match(edge, /Major rides and attractions are permanent/);
assert.match(edge, /installedAdditionCount/);
assert.match(edge, /business-map\/assets\/upload/);
assert.match(businessMapMigration, /business-map-assets/);
assert.match(businessMapMigration, /alter publication supabase_realtime add table public\.app_nexus_nomad_state/);
assert.match(intelliMaps, /addEventListener\("wheel", handleWheel, \{ passive: false \}\)/);
assert.doesNotMatch(intelliMaps, /onWheel=\{handleWheel\}/);
assert.match(combatPage, /YOUTUBE_EMBED_HOST = "https:\/\/www\.youtube\.com"/);
assert.doesNotMatch(combatPage, /youtube-nocookie/);
assert.match(supabaseClient, /channel\.state === "joining"/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table/);
assert.match(migration, /drop policy if exists "combat_music_upload"/);
assert.match(
  wikiBlocks,
  /locked:\s*tier\.id === "level-7" \|\| tier\.id === "level-8"/,
);
assert.match(
  wikiBlocks,
  /separatorBefore:\s*tier\.id === "level-7"/,
);
assert.match(wikiEditor, /tab\.separatorBefore/);
assert.match(wikiEditor, /tab\.locked/);
assert.match(inetPage, /tab\.separatorBefore/);
assert.match(inetPage, /tab\.locked/);

const removedUiDirectory = path.join(root, "src/app/components/ui");
assert.equal(
  fs.existsSync(removedUiDirectory) &&
    fs.readdirSync(removedUiDirectory, { withFileTypes: true }).some((entry) =>
      entry.isFile(),
    ),
  false,
);
for (const removed of [
  "src/app/components/use-entity-manager.tsx",
  "src/lib/community-store.ts",
  "src/lib/player-store.ts",
]) {
  assert.equal(fs.existsSync(path.join(root, removed)), false);
}

const badEncoding = /(?:Â|â€|â˜|ðŸ|\uFFFD)/;
for (const directory of ["src", "supabase/functions"]) {
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (/\.(?:ts|tsx|css)$/.test(entry.name)) {
        assert.doesNotMatch(
          fs.readFileSync(fullPath, "utf8"),
          badEncoding,
          `Mojibake remains in ${path.relative(root, fullPath)}`,
        );
      }
    }
  };
  visit(path.join(root, directory));
}

process.stdout.write("Source invariant checks passed.\n");
