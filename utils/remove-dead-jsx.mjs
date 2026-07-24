import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const pnpmDir = path.join(root, "node_modules", ".pnpm");
const parserPackage = fs
  .readdirSync(pnpmDir)
  .find((name) => name.startsWith("@babel+parser@"));

if (!parserPackage) {
  throw new Error("@babel/parser is required to inspect TSX");
}

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

const write = process.argv.includes("--write");
const sourceRoot = path.join(root, "src");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function containsFalseAnd(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "BooleanLiteral") return node.value === false;
  return (
    node.type === "LogicalExpression" &&
    node.operator === "&&" &&
    (containsFalseAnd(node.left) || containsFalseAnd(node.right))
  );
}

function collectDeadContainers(node, ranges) {
  if (!node || typeof node !== "object") return;
  if (
    node.type === "JSXExpressionContainer" &&
    node.expression?.type === "LogicalExpression" &&
    node.expression.operator === "&&" &&
    containsFalseAnd(node.expression) &&
    Number.isInteger(node.start) &&
    Number.isInteger(node.end)
  ) {
    ranges.push([node.start, node.end]);
    return;
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => collectDeadContainers(entry, ranges));
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      collectDeadContainers(value, ranges);
    }
  }
}

let deadBlockCount = 0;
for (const file of sourceFiles(sourceRoot)) {
  const source = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: false,
    });
  } catch (error) {
    throw new Error(`${path.relative(root, file)}: ${error.message}`, { cause: error });
  }
  const ranges = [];
  collectDeadContainers(ast, ranges);
  if (ranges.length === 0) continue;

  deadBlockCount += ranges.length;
  process.stdout.write(`${path.relative(root, file)}: ${ranges.length}\n`);
  if (!write) continue;

  let next = source;
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
    next = `${next.slice(0, start)}${next.slice(end)}`;
  }
  fs.writeFileSync(file, next, "utf8");
}

if (!write && deadBlockCount > 0) {
  process.exitCode = 1;
}
