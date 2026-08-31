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
const initialData = read("src/app/components/initial-data.tsx");
const dmArea = read("src/app/components/dm-area.tsx");
const dmWikiSection = read("src/app/components/dm-wiki-section.tsx");
const routes = read("src/app/routes.tsx");
const gamePage = read("src/app/components/game.tsx");
const routeErrorPage = read("src/app/components/route-error-page.tsx");
const lazyModule = read("src/lib/lazy-module.ts");
const vercelConfig = read("vercel.json");
const combatPage = read("src/app/components/combat-page.tsx");
const intelliMaps = read("src/app/components/intelli-maps.tsx");
const supabaseClient = read("src/lib/supabaseClient.ts");
const migration = read("supabase/migrations/20260723000000_secure_app_schema.sql");
const wikiBlocks = read("src/lib/wiki-article-blocks.ts");
const wikiEditor = read("src/app/components/wiki-editor.tsx");
const inetPage = read("src/app/components/inet-page.tsx");
const adventurePrototype = read("src/app/components/adventure-prototype.tsx");
const adventurePrototypeApi = read("src/lib/adventure-prototype-api.ts");
const adventurePrototypeEngine = read("supabase/functions/_shared/adventure-prototype.ts");
const adventurePrototypeMigration = read("supabase/migrations/20260818000000_adventure_prototype.sql");
const adventurePrototypeBotMigration = read("supabase/migrations/20260818010000_adventure_prototype_bots.sql");
const adventurePrototypeEdge = read("supabase/functions/adventure-prototype/index.ts");
const supabaseConfig = read("supabase/config.toml");
const legacyAdventureEntry = read("src/app/components/adventure-game.tsx");
const dmSystemStatus = read("src/app/components/dm-system-status.tsx");
const systemStatusHook = read("src/app/components/use-system-status.ts");
const nexusNomad = read("src/app/components/nexus-nomad.tsx");
const officeBusinessMap = read("src/app/components/office-business-map.tsx");
const intelliInterface = read("src/app/components/intelli-interface.tsx");
parse(adventurePrototypeEdge, { sourceType: "module", plugins: ["typescript"] });
parse(edge, { sourceType: "module", plugins: ["typescript"] });
parse(officeBusinessMap, { sourceType: "module", plugins: ["typescript", "jsx"] });

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
assert.match(commerce, /setShops\(Array\.isArray\(shopsData\) \? shopsData : \[\]\)/);
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
assert.match(gamePage, /const \{ isDM \} = useInterfaceSession\(\)/);
assert.match(gamePage, /\(isDM \|\| prototypeInvitationCount > 0\)/);
assert.match(gamePage, /<AdventurePrototype onBack=\{\(\) => setActiveAdventure\(false\)\} \/>/);
assert.doesNotMatch(gamePage, /import\("\.\/adventure-game"\)/);
assert.match(adventurePrototype, /useInterfaceSession\(\)/);
assert.match(adventurePrototype, /getPrototypeReachablePoints/);
assert.match(adventurePrototype, /BOT PLAYERS/);
assert.match(adventurePrototype, /createPrototypeBot/);
assert.match(adventurePrototypeApi, /\.on\("broadcast", \{ event: "room-updated" \}/);
assert.match(adventurePrototypeApi, /window\.setTimeout\(poll, 2500\)/);
assert.match(adventurePrototypeApi, /botIds: string\[\]/);
assert.match(adventurePrototypeEdge, /resolvePrototypeAction\(room, action, actorId/);
assert.match(adventurePrototypeEdge, /requireDMSession\(c\)/);
assert.match(adventurePrototypeEdge, /`\$\{prefix\}\/bots`/);
assert.match(adventurePrototypeEdge, /\.eq\("created_by", hostPlayerId\)/);
assert.match(adventurePrototypeEdge, /query\.contains\("invited_player_ids", \[playerId\]\)/);
assert.match(adventurePrototypeEdge, /\.eq\("version", room\.version\)/);
assert.match(adventurePrototypeEdge, /broadcastRoom\(savedRoom\)/);
assert.doesNotMatch(adventurePrototypeEdge, /body\?\.actorId/);
assert.doesNotMatch(edge, /adventure-prototype/);
assert.match(supabaseConfig, /\[functions\.adventure-prototype\][\s\S]*verify_jwt = false/);
assert.match(adventurePrototypeEngine, /if \(!canViewPrototypeRoom\(room, actorId\)\)/);
assert.match(adventurePrototypeEngine, /if \(!actorUnit \|\| !canControlPrototypeUnit\(actorUnit, actorId\)\)/);
assert.match(adventurePrototypeMigration, /revoke all on table public\.adventure_prototype_rooms from anon, authenticated/);
assert.match(adventurePrototypeBotMigration, /enable row level security/);
assert.match(adventurePrototypeBotMigration, /revoke all on table public\.adventure_prototype_bots from anon, authenticated/);
assert.match(legacyAdventureEntry, /\.\/adventure\/AdventureGame/);
assert.match(dmArea, /import\("\.\/adventure-game"\)/);
assert.match(routeErrorPage, /useRouteError\(\)/);
assert.match(lazyModule, /failed to fetch dynamically imported module/i);
assert.match(lazyModule, /window\.location\.reload\(\)/);
assert.match(vercelConfig, /no-cache, no-store, must-revalidate/);
assert.match(dmArea, /id: "system" as const, label: "System Status"/);
assert.match(dmArea, /<DMSystemStatus/);
assert.match(dmSystemStatus, /useSystemStatus\(\)/);
assert.match(dmSystemStatus, /Error &amp; Report Log/);
assert.match(systemStatusHook, /buildSupabasePublicHeaders\(false\)/);
assert.match(systemStatusHook, /subscribeErrorLog\(refreshMetrics\)/);
assert.match(nexusNomad, /DEFAULT_OFFICE_NAME = "Wasp Office and Business"/);
assert.match(nexusNomad, /id: "map" as const, label: "Business Map"/);
assert.match(nexusNomad, /businessMap: normalizeOfficeBusinessMap\(raw\.businessMap\)/);
assert.match(nexusNomad, /<OfficeBusinessMap/);
assert.doesNotMatch(nexusNomad, /Central operations hub/);
assert.doesNotMatch(intelliInterface, /active agent.*cataloged/);
assert.match(officeBusinessMap, /Link Existing Facility/);
assert.match(officeBusinessMap, /startPointerOperation/);
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
