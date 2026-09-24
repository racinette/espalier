// Aggregate selectors: all-file targets, filename suffixes, and trailing segments.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { check } from "../src/api.js";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

function write(root: string, relative: string, contents: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function issues(root: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [cli, "lint", "--format", "jsonl", ...args], {
    cwd: root,
    encoding: "utf8",
  });
  const lines = result.stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { result, lines };
}

test("an explicit all-file selector admits every owned governed file in scope", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "espalier-aggregate-omitted-"));
  try {
    write(root, "espalier.config.yaml", "pin: 0.3.0\nroot: espalier\nignoreFiles: []\nskip: []\n");
    write(root, ".espalierignore", "secret.txt\n");
    write(
      root,
      "espalier/[name].json.mjs",
      'export const description = "a json file";\nexport const rule = `owned`;\nexport async function lint() {}\n',
    );
    write(
      root,
      "espalier/[name].md.mjs",
      'export const description = "a markdown file";\nexport const rule = `owned`;\nexport async function lint() {}\n',
    );
    write(
      root,
      "espalier/[...path]/inventory.mjs",
      `export const aggregate = true;
export const targets = ["**/*"];
export const rule = "inventory";
export async function lint({ matches, patterns, emit }) {
  emit({
    code: "inventory",
    severity: "info",
    message: matches.map(({ path }) => path).join(",") + "@" + patterns.join(","),
    metadata: { captures: matches.map(({ path, captures }) => ({ path, captures })) },
  });
}
`,
    );
    write(root, "a.json", "{}\n");
    write(root, "b.md", "# b\n");
    write(root, "secret.txt", "hidden\n");
    write(root, "orphan.xyz", "unowned\n");

    const { result, lines } = issues(root);
    assert.equal(result.status, 1, result.stderr);
    const inventory = lines.find((line) => line["code"] === "inventory");
    assert.ok(inventory);
    assert.equal(inventory["pattern"], "**/*");
    assert.equal(inventory["message"], "a.json,b.md@**/*");
    assert.ok(lines.some((line) => line["code"] === "unexpected_path" && line["path"] === "orphan.xyz"));
    assert.doesNotMatch(JSON.stringify(inventory), /secret\.txt|orphan\.xyz/);

    const scoped = issues(root, ["b.md"]);
    assert.equal(scoped.lines.find((line) => line["code"] === "inventory")?.["message"], "a.json,b.md@**/*");

    const built = spawnSync(process.execPath, [cli, "build", "--force"], { cwd: root, encoding: "utf8" });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const guidance = readFileSync(path.join(root, "AGENTS.MD"), "utf8");
    assert.doesNotMatch(guidance, /## Aggregate constraints/);
    assert.match(guidance, /Together, files in this project must follow this rule\./);
    assert.doesNotMatch(guidance, /Scope:/);
    assert.doesNotMatch(guidance, /owned paths/);

    write(
      root,
      "espalier/[...path]/inventory.mjs",
      `export const aggregate = true;
export const targets = ["**/*"];
export const rule = "inventory";
export const referenceImplementation = "a.json";
export async function lint() {}
`,
    );
    await check({ cwd: root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("selector origin stays before the recursive placeholder when directories follow it", () => {
  const root = mkdtempSync(path.join(tmpdir(), "espalier-aggregate-trailing-"));
  try {
    write(root, "espalier.config.yaml", "pin: 0.3.0\nroot: espalier\nignoreFiles: []\nskip: []\n");
    write(
      root,
      "espalier/backend/[area]/handlers/[name].ts.mjs",
      'export const description = "a handler";\nexport const rule = `handler`;\nexport async function lint() {}\n',
    );
    write(root, "espalier/backend/[area]/[name].ts.mjs", 'export const description = "an area file";\nexport const rule = `owned`;\nexport async function lint() {}\n');
    write(
      root,
      "espalier/backend/[...path]/handlers/registry.mjs",
      `export const aggregate = true;
export const rule = "handlers together";
export const targets = ["**/create.ts"];
export async function lint({ matches, patterns, emit }) {
  emit({
    code: "registry",
    severity: "info",
    message: matches.map(({ path, captures }) => path + ":" + captures.path.join("/")).join(";") + "@" + patterns.join(","),
  });
}
`,
    );
    write(root, "backend/orders/handlers/create.ts", "export {};\n");
    write(root, "backend/orders/handlers/other.ts", "export {};\n");
    write(root, "backend/billing/handlers/create.ts", "export {};\n");
    write(root, "backend/orders/create.ts", "export {};\n");

    const { result, lines } = issues(root);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const registry = lines.find((line) => line["code"] === "registry");
    assert.ok(registry);
    assert.equal(
      registry["message"],
      "backend/billing/handlers/create.ts:billing;backend/orders/handlers/create.ts:orders@backend/**/create.ts",
    );
    assert.equal(registry["pattern"], "backend/**/create.ts");

    const explained = spawnSync(process.execPath, [cli, "explain", "--format", "jsonl", "backend/orders/handlers/other.ts"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(explained.status, 0, explained.stderr);
    assert.doesNotMatch(explained.stdout, /handlers together/);

    const explainedOutsideDirectory = spawnSync(
      process.execPath,
      [cli, "explain", "--format", "jsonl", "backend/orders/create.ts"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(explainedOutsideDirectory.status, 0, explainedOutsideDirectory.stderr);
    assert.doesNotMatch(explainedOutsideDirectory.stdout, /handlers together/);

    const explainedCreate = spawnSync(
      process.execPath,
      [cli, "explain", "--format", "jsonl", "backend/orders/handlers/create.ts"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(explainedCreate.status, 0, explainedCreate.stderr);
    assert.match(explainedCreate.stdout, /"patterns":\["backend\/\*\*\/create\.ts"\]/);
    assert.match(explainedCreate.stdout, /analyzes paths matching `backend\/\*\*\/create\.ts` within `backend\/\*\*\/handlers\/\*` together/);

    const built = spawnSync(process.execPath, [cli, "build", "--force"], { cwd: root, encoding: "utf8" });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const guidance = readFileSync(path.join(root, "backend/AGENTS.MD"), "utf8");
    assert.doesNotMatch(guidance, /## Aggregate constraints/);
    assert.match(guidance.replace(/\s+/g, " "), /Together, paths matching `backend\/\*\*\/create\.ts` within `backend\/\*\*\/handlers\/\*` must follow this rule\./);
    assert.doesNotMatch(guidance, /Scope:/);
    assert.doesNotMatch(guidance, /all TypeScript files/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an extension-selected aggregate with trailing directories names the complete extension", () => {
  const root = mkdtempSync(path.join(tmpdir(), "espalier-aggregate-trailing-omitted-"));
  try {
    write(root, "espalier.config.yaml", "pin: 0.3.0\nroot: espalier\nignoreFiles: []\nskip: []\n");
    write(
      root,
      "espalier/backend/[area]/handlers/[name].ts.mjs",
      'export const description = "a handler";\nexport const rule = `handler`;\nexport async function lint() {}\n',
    );
    write(
      root,
      "espalier/backend/[...path]/handlers/inventory.ts.mjs",
      `export const aggregate = true;
export const rule = "handlers together";
export async function lint() {}
`,
    );
    write(root, "backend/orders/handlers/create.ts", "export {};\n");

    const built = spawnSync(process.execPath, [cli, "build", "--force"], { cwd: root, encoding: "utf8" });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const guidance = readFileSync(path.join(root, "backend/AGENTS.MD"), "utf8");
    assert.match(guidance.replace(/\s+/g, " "), /Together, files with exactly `\.ts` as their extension in directories matching `backend\/\*\*\/handlers\/` must follow this rule\./);
    assert.doesNotMatch(guidance, /Every file under `backend\/`/);
    assert.doesNotMatch(guidance, /Scope:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a dotted aggregate name selects its extension", () => {
  const root = mkdtempSync(path.join(tmpdir(), "espalier-aggregate-dotted-"));
  try {
    write(root, "espalier.config.yaml", "pin: 0.3.0\nroot: espalier\nignoreFiles: []\nskip: []\n");
    write(
      root,
      "espalier/[name].mjs",
      'export const description = "a file";\nexport const rule = `owned`;\nexport async function lint() {}\n',
    );
    write(
      root,
      "espalier/[...path]/group.json.mjs",
      `export const aggregate = true;
export const rule = "the leftover name";
export async function lint({ matches, emit }) {
  emit({ code: "group", severity: "info", message: matches.map(({ path }) => path).join(",") });
}
`,
    );
    write(root, "a.json", "{}\n");
    write(root, "b.md", "# b\n");

    const { result, lines } = issues(root);
    assert.equal(result.status, 0, result.stderr);
    const group = lines.find((line) => line["code"] === "group");
    assert.ok(group);
    assert.equal(group["rule"], "[...path]/group.json.mjs");
    assert.equal(group["message"], "a.json");

    const built = spawnSync(process.execPath, [cli, "build", "--force"], { cwd: root, encoding: "utf8" });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const guidance = readFileSync(path.join(root, "AGENTS.MD"), "utf8");
    assert.match(guidance, /## group/);
    assert.match(guidance.replace(/\s+/g, " "), /Together, files with exactly `\.json` as their extension in this project must follow this rule\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
