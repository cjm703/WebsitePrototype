import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const pnpmDir = path.join(root, "node_modules", ".pnpm");
const parserPackage = fs
  .readdirSync(pnpmDir)
  .find((name) => name.startsWith("@babel+parser@"));
if (!parserPackage) throw new Error("@babel/parser is required to inspect dependencies");

const parserPath = path.join(
  pnpmDir,
  parserPackage,
  "node_modules",
  "@babel",
  "parser",
  "lib",
  "index.js",
);
const { parse } = await import(pathToFileURL(parserPath).href);

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(fullPath);
    return /\.(?:js|mjs|ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function packageName(specifier) {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("@/")) {
    return null;
  }
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

const used = new Set();
for (const file of [...filesIn(path.join(root, "src")), path.join(root, "vite.config.ts")]) {
  const source = fs.readFileSync(file, "utf8");
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (
      (node.type === "ImportDeclaration" ||
        node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration") &&
      typeof node.source?.value === "string"
    ) {
      const name = packageName(node.source.value);
      if (name) used.add(name);
    }
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Import" &&
      typeof node.arguments?.[0]?.value === "string"
    ) {
      const name = packageName(node.arguments[0].value);
      if (name) used.add(name);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object" && typeof value.type === "string") visit(value);
    }
  };
  visit(ast);
}

const declared = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
};
const toolDependencies = new Set(["supabase", "tailwindcss"]);
const unused = Object.keys(declared)
  .filter((name) => !used.has(name) && !toolDependencies.has(name))
  .sort();

if (unused.length > 0) {
  process.stdout.write(`${unused.join("\n")}\n`);
  process.exitCode = 1;
}
