import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const edge = read("supabase/functions/make-server-8a5950b5/index.ts");
const richEditor = read("src/app/components/rich-text-editor.tsx");
const commerce = read("src/app/components/commerce-page.tsx");
const initialData = read("src/app/components/initial-data.tsx");
const dmArea = read("src/app/components/dm-area.tsx");
const migration = read("supabase/migrations/20260723000000_secure_app_schema.sql");
const parserPackage = fs
  .readdirSync(path.join(root, "node_modules", ".pnpm"))
  .find((name) => name.startsWith("@babel+parser@"));
assert.ok(parserPackage, "@babel/parser is required for source verification");
const parserPath = path.join(
  root,
  "node_modules",
  ".pnpm",
  parserPackage,
  "node_modules",
  "@babel",
  "parser",
  "lib",
  "index.js",
);
const { parse } = await import(pathToFileURL(parserPath).href);
parse(edge, { sourceType: "module", plugins: ["typescript"] });

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
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table/);
assert.match(migration, /drop policy if exists "combat_music_upload"/);

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
