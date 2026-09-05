import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src", "app", "components", "player-theme.tsx");
const bundlePath = path.join(os.tmpdir(), `verify-interface-stickers-${process.pid}.mjs`);

await build({
  entryPoints: [sourcePath],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  define: {
    "import.meta.env": JSON.stringify({
      DEV: true,
      PROD: false,
      VITE_SUPABASE_URL: "https://interface-sticker-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "interface-sticker-test-key",
    }),
    "process.env.NODE_ENV": '"test"',
  },
});

const theme = await import(`${pathToFileURL(bundlePath).href}?run=${Date.now()}`);
await fs.unlink(bundlePath).catch(() => undefined);

const legacyImage = {
  id: "legacy-image",
  stickerId: "gnarpy",
  slotId: "if-title-right",
  scale: 1.25,
};
let randomIndex = 0;
const randomValues = [0.08, 0.91, 0.35, 0.62, 0.14, 0.78, 0.47, 0.26, 0.83, 0.54];
const deterministicRandom = () => randomValues[(randomIndex += 1) % randomValues.length];
const created = theme.createInterfaceNoteSticker("You're late", [legacyImage], deterministicRandom);

assert.equal(created.kind, "note");
assert.equal(created.stickerId, theme.INTERFACE_NOTE_STICKER_ID);
assert.equal(created.slotId, "if-random");
assert.equal(created.text, "You're late");
assert.ok(created.x >= 12 && created.x <= 88, "Sticker x position stays inside the Interface");
assert.ok(created.y >= 7 && created.y <= 93, "Sticker y position stays inside the Interface");
assert.ok(created.scale >= 0.72 && created.scale <= 1.08, "DM stickers remain fairly small");
assert.ok(created.rotation >= -9 && created.rotation <= 9, "Sticker rotation remains restrained");
assert.deepEqual(legacyImage, {
  id: "legacy-image",
  stickerId: "gnarpy",
  slotId: "if-title-right",
  scale: 1.25,
}, "Creating a note does not mutate existing image stickers");

const normalized = theme.normalizePlacedStickers([
  legacyImage,
  { ...created, scale: 9, x: 200, y: -50, rotation: 90 },
  { id: "invalid" },
]);
assert.equal(normalized.length, 2, "Invalid entries are discarded without affecting valid stickers");
assert.deepEqual(normalized[0], legacyImage, "Legacy image sticker data remains compatible");
assert.equal(normalized[1].scale, 1.08);
assert.equal(normalized[1].x, 96);
assert.equal(normalized[1].y, 4);
assert.equal(normalized[1].rotation, 12);
assert.equal(theme.isInterfaceNoteSticker(normalized[1]), true);

const second = theme.createInterfaceNoteSticker("Second warning", normalized, () => 0.5);
assert.notEqual(second.id, created.id, "Repeated awards receive distinct placement ids");
assert.equal(second.text, "Second warning");

process.stdout.write("Interface sticker verification passed: random sizing, placement, repetition, and legacy image preservation are intact.\n");
