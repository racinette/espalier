// `espalier guard` and `espalier unguard`. docs/cli/guard/README.MD,
// docs/cli/unguard/README.MD. A guard is judged by three things: what it
// writes into the espalier, what `lint --base` then reports, and that
// `unguard` gives every module back byte for byte.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "../src/api.js";
import { markExports, restoreSource } from "../src/guardMarks.js";

const cli = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), "dist", "src", "cli.js");

function run(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

function git(root: string, ...args: string[]): void {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

/** A repository with a component contract, a routes rule, migrations grouped in sets, and a reopened plugins directory. */
const PROJECT: Record<string, string> = {
  "espalier.config.yaml": "root: espalier\nignoreFiles: []\nskip: []\n",
  ".espalierignore": ".git\n",
  "espalier/components/[component]/index.tsx.mjs": 'export const description = "a component";\n',
  "espalier/routes/[route].ts.mjs": "",
  "espalier/migrations/[num=0000][ord=00]_[table=a+].sql.mjs":
    'export const groups = { set: { by: ["num", "table"] } };\n',
  "espalier/plugins/ESPALIER.mjs": 'export const description = "plugins";\nexport const locked = false;\nexport const frozen = (\n  false\n);\n',
  "espalier/plugins/[plugin].ts.mjs": "",
  "components/Button/index.tsx": "button\n",
  "routes/orders.ts": "orders\n",
  "routes/admin.ts": "admin\n",
  "migrations/000101_users.sql": "a\n",
  "migrations/000201_orders.sql": "a\n",
  "plugins/slack.ts": "slack\n",
};

function scratch(files: Record<string, string>, body: (root: string) => void | Promise<void>): Promise<void> | void {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-guard-"));
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), contents);
  }
  const done = (): void => rmSync(root, { recursive: true, force: true });
  try {
    const result = body(root);
    if (result instanceof Promise) return result.finally(done);
    done();
  } catch (error) {
    done();
    throw error;
  }
}

/** Every file under the espalier root, by path, for comparing before and after. */
function espalierFiles(root: string): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of spawnSync("find", [directory, "-type", "f"], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean)) {
      found[path.relative(root, entry)] = readFileSync(entry, "utf8");
    }
  };
  walk(path.join(root, "espalier"));
  return found;
}

const GUARD = [
  "guard", "--no-build",
  "--close", ".",
  "--open", "components/Checkout/",
  "--edit", "routes/orders.ts",
  "--edit", "migrations/0001[ord=00]_users.sql",
  "--add", "migrations/",
];

test("a guard closes the repository, opens what it names, and is checked against its commit", () =>
  scratch(PROJECT, async (root) => {
    const result = run(root, GUARD);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    // The root is closed, and the reopenings beneath it are taken away, marked.
    assert.match(readFileSync(path.join(root, "espalier/ESPALIER.mjs"), "utf8"), /^\/\/ espalier guard created [0-9a-f]+\nexport const locked = true;\nexport const frozen = true;\nexport const sealed = true;\n$/);
    const plugins = readFileSync(path.join(root, "espalier/plugins/ESPALIER.mjs"), "utf8");
    assert.match(plugins, /^\/\/ espalier guard: export const locked = false;$/m);
    assert.match(plugins, /^\/\/ espalier guard: {3}false$/m);
    // Openings are declarations of exactly what was named.
    assert.match(readFileSync(path.join(root, "espalier/components/Checkout/ESPALIER.mjs"), "utf8"), /export const instanceOf = "\.\.\/\[component\]";\nexport const frozen = false;\nexport const sealed = false;/);
    assert.match(readFileSync(path.join(root, "espalier/routes/orders.ts.mjs"), "utf8"), /export const instanceOf = "\[route\]\.ts\.mjs";\nexport const frozen = false;/);
    assert.match(readFileSync(path.join(root, "espalier/migrations/0001[ord=00]_users.sql.mjs"), "utf8"), /export const instanceOf = "\[num=0000\]\[ord=00\]_\[table=a\+\]\.sql\.mjs";\nexport const frozen = false;/);
    assert.match(readFileSync(path.join(root, "espalier/migrations/ESPALIER.mjs"), "utf8"), /export const sealed = false;/);

    const guarded = (await check({ cwd: root, jobs: 1 })).map((issue) => `${issue.code} ${issue.path}`);
    assert.ok(guarded.includes("guard_in_place espalier/ESPALIER.mjs"), guarded.join("\n"));
    // The declared component is the work to do: it must exist before the guard is lifted.
    assert.deepEqual(guarded.filter((line) => !line.startsWith("guard_in_place")).sort(),
      ["missing_required_directory components/Checkout", "missing_required_file components/Checkout/index.tsx"]);

    git(root, "init", "-q");
    git(root, "add", "-A");
    git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "guard");
    const change: Record<string, string> = {
      "components/Checkout/index.tsx": "checkout\n",
      "components/Cart/index.tsx": "cart\n",
      "routes/orders.ts": "orders, edited\n",
      "routes/admin.ts": "admin, edited\n",
      "routes/refunds.ts": "refunds\n",
      "migrations/000101_users.sql": "a, edited\n",
      "migrations/000201_orders.sql": "a, edited\n",
      "migrations/000301_items.sql": "a\n",
      "plugins/slack.ts": "slack, edited\n",
    };
    for (const [name, contents] of Object.entries(change)) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), contents);
    }
    const issues = (await check({ cwd: root, jobs: 1, base: "HEAD" }))
      .filter((issue) => issue.code === "frozen_file_changed" || issue.code === "sealed_collection_changed")
      .map((issue) => `${issue.code} ${issue.path}`).sort();
    assert.deepEqual(issues, [
      "frozen_file_changed migrations/000201_orders.sql",
      "frozen_file_changed plugins/slack.ts",
      "frozen_file_changed routes/admin.ts",
      "sealed_collection_changed components/Cart/index.tsx",
      "sealed_collection_changed routes/refunds.ts",
    ]);
  }));

/** Features matched by a contract, none of them declared. */
const FEATURES: Record<string, string> = {
  "espalier.config.yaml": "root: espalier\nignoreFiles: []\nskip: []\n",
  ".espalierignore": ".git\n",
  "espalier/features/[feature]/api.ts.mjs": "",
  "espalier/features/[feature]/components/[component]/index.tsx.mjs": "",
  "espalier/features/[feature]/routes/[route].ts.mjs": "",
  "espalier/features/[feature]/steps/[num=0000]_[t=a+].sql.mjs": 'export const groups = { step: { by: ["num"] } };\n',
  "features/checkout/api.ts": "checkout\n",
  "features/checkout/components/Button/index.tsx": "button\n",
  "features/checkout/routes/pay.ts": "pay\n",
  "features/checkout/steps/0001_users.sql": "a\n",
  "features/orders/api.ts": "orders\n",
  "features/orders/routes/list.ts": "list\n",
  "features/orders/steps/0001_items.sql": "a\n",
};

test("a guard declares the directories a contract admits on the way to its targets", () =>
  scratch(FEATURES, async (root) => {
    const before = espalierFiles(root);
    const result = run(root, ["guard", "--no-build", "--close", ".",
      "--open", "features/checkout/components/Cart/", "--edit", "features/checkout/api.ts", "--edit", "features/checkout/routes/pay.ts"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(readFileSync(path.join(root, "espalier/features/checkout/ESPALIER.mjs"), "utf8"), /^\/\/ espalier guard created [0-9a-f]+\nexport const instanceOf = "\.\.\/\[feature\]";\n$/);
    // A fixed name the contract carries is taken over at its own name; a pattern's file is declared as its instance.
    assert.doesNotMatch(readFileSync(path.join(root, "espalier/features/checkout/api.ts.mjs"), "utf8"), /instanceOf/);
    assert.match(readFileSync(path.join(root, "espalier/features/checkout/routes/pay.ts.mjs"), "utf8"), /instanceOf = "\[route\]\.ts\.mjs"/);

    git(root, "init", "-q");
    git(root, "add", "-A");
    git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "guard");
    for (const name of ["features/checkout/api.ts", "features/checkout/routes/pay.ts", "features/orders/api.ts", "features/orders/routes/list.ts"]) {
      writeFileSync(path.join(root, name), "edited\n");
    }
    mkdirSync(path.join(root, "features/checkout/components/Cart"));
    writeFileSync(path.join(root, "features/checkout/components/Cart/index.tsx"), "cart\n");
    writeFileSync(path.join(root, "features/checkout/routes/refund.ts"), "refund\n");
    const issues = (await check({ cwd: root, jobs: 1, base: "HEAD" }))
      .filter((issue) => issue.code === "frozen_file_changed" || issue.code === "sealed_collection_changed")
      .map((issue) => `${issue.code} ${issue.path}`).sort();
    assert.deepEqual(issues, [
      "frozen_file_changed features/orders/api.ts",
      "frozen_file_changed features/orders/routes/list.ts",
      "sealed_collection_changed features/checkout/routes/refund.ts",
    ]);

    git(root, "checkout", "-q", ".");
    git(root, "clean", "-qfd");
    assert.equal(run(root, ["unguard", "--no-build"]).status, 0);
    assert.deepEqual(espalierFiles(root), before);
    assert.equal(existsSync(path.join(root, "espalier/features/checkout")), false);
  }));

test("a group inside a directory a contract admits is declared there, and opens only that directory's files", () =>
  scratch(FEATURES, async (root) => {
    const result = run(root, ["guard", "--no-build", "--close", ".", "--edit", "features/checkout/steps/0001_[t=a+].sql"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(readFileSync(path.join(root, "espalier/features/checkout/steps/0001_[t=a+].sql.mjs"), "utf8"), /instanceOf = "\[num=0000\]_\[t=a\+\]\.sql\.mjs"/);

    git(root, "init", "-q");
    git(root, "add", "-A");
    git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "guard");
    for (const name of ["features/checkout/steps/0001_users.sql", "features/orders/steps/0001_items.sql"]) {
      writeFileSync(path.join(root, name), "edited\n");
    }
    const issues = (await check({ cwd: root, jobs: 1, base: "HEAD" }))
      .filter((issue) => issue.code === "frozen_file_changed").map((issue) => issue.path);
    assert.deepEqual(issues, ["features/orders/steps/0001_items.sql"]);
  }));

test("unguard gives every module back byte for byte, and deletes what the guard created", () =>
  scratch(PROJECT, (root) => {
    const before = espalierFiles(root);
    assert.equal(run(root, GUARD).status, 0);
    assert.notDeepEqual(espalierFiles(root), before);
    const result = run(root, ["unguard", "--no-build"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(espalierFiles(root), before);
    assert.equal(existsSync(path.join(root, "espalier/components/Checkout")), false);
    const again = run(root, ["unguard", "--no-build", "--format", "jsonl"]);
    assert.equal(again.status, 0);
    assert.match(again.stdout, /No guard is in place/);
  }));

test("a guard is refused, and nothing written, when it cannot be applied as asked", () =>
  scratch(PROJECT, (root) => {
    const before = espalierFiles(root);
    const refused = (args: string[], code: string): void => {
      const result = run(root, ["guard", "--no-build", "--format", "jsonl", ...args]);
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stdout, new RegExp(`"code":"${code}"`));
      assert.deepEqual(espalierFiles(root), before);
    };
    refused([], "missing_argument");
    refused(["--close", "nowhere/at/all.txt"], "guard_unknown_target");
    refused(["--close", "espalier/routes/"], "guard_unknown_target");
    refused(["--close", "routes/", "--add", "routes/"], "guard_conflict");
    refused(["--close", ".", "--add", "routes/orders.ts"], "guard_invalid_target");
    refused(["--close", ".", "--edit", "routes/checkout.ts"], "guard_invalid_target");

    assert.equal(run(root, ["guard", "--no-build", "--close", "."]).status, 0);
    const twice = run(root, ["guard", "--no-build", "--format", "jsonl", "--close", "."]);
    assert.equal(twice.status, 2);
    assert.match(twice.stdout, /"code":"already_guarded"/);
  }));

test("unguard refuses a module the guard wrote and someone edited since, and writes nothing", () =>
  scratch(PROJECT, (root) => {
    assert.equal(run(root, GUARD).status, 0);
    const created = path.join(root, "espalier/routes/orders.ts.mjs");
    writeFileSync(created, `${readFileSync(created, "utf8")}export const description = "orders";\n`);
    const guarded = espalierFiles(root);
    const result = run(root, ["unguard", "--no-build", "--format", "jsonl"]);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /"code":"guard_tampered"/);
    assert.deepEqual(espalierFiles(root), guarded);
  }));

test("a guard sets an export however the module wrote it, and restores it exactly", () => {
  const forms: [string, string, Record<string, boolean | null>][] = [
    ["a literal", 'export const description = "x";\nexport const frozen = false;\n', { frozen: true }],
    ["a computed value over lines", "const x = 1;\nexport const frozen = (\n  x > 0\n);\nexport const g = frozen;\n", { frozen: false }],
    ["several declarators", "export const frozen = false, sealed = true, tag = `a\nb`;\n", { frozen: null }],
    ["a local export list", "const frozen = false;\nexport { frozen, frozen as other };\n", { frozen: true }],
    ["a re-export", 'export { frozen, locked } from "./shared.mjs";\n', { locked: true }],
    ["a star export", 'export * from "./shared.mjs";\n', { frozen: true }],
    ["statements sharing a line", "export const a = 1; export const frozen = false; export const b = 2;\n", { frozen: true }],
    ["a local name it does not export", "const sealed = 1;\nexport const g = sealed;", { sealed: true }],
    ["CRLF line endings", "export const frozen = false;\r\nexport const x = 1;\r\n", { frozen: true, locked: true }],
    ["a mark-like line inside a string", "export const guidance = `\n// espalier guard begin\n`;\n", { locked: true }],
  ];
  for (const [what, source, settings] of forms) {
    const guarded = markExports(source, settings, what);
    assert.notEqual(guarded, source, what);
    assert.equal(restoreSource(guarded, what), source, what);
  }
  assert.equal(markExports("export const frozen = true;\n", { frozen: true }, "equal"), "export const frozen = true;\n");
  assert.throws(() => markExports("export const { frozen } = settings;\n", { frozen: true }, "destructured"), { code: "guard_unsupported_export" });
  const fenced = markExports("export const frozen = false;\n", { frozen: true }, "fenced");
  assert.throws(() => restoreSource(fenced.replace("// espalier guard end", "// end"), "unfenced"), { code: "guard_tampered" });
});
