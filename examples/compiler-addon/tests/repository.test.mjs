import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "espalier";

const example = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("./cli.js", import.meta.resolve("espalier")));
const target = "src/features/counter/model.ts";

// A few complete repositories test matching and persistent replay. Semantic
// counterexamples belong in the small virtual trees in compiler.test.mjs.
function repository() {
  const root = mkdtempSync(path.join(os.tmpdir(), "compiler-repository-"));
  cpSync(example, root, {
    recursive: true,
    filter: (file) => !path.relative(example, file).split(path.sep).some((part) => part === "node_modules" || part === ".cache"),
  });
  mkdirSync(path.join(root, "node_modules"));
  for (const name of ["typescript", "espalier"]) {
    symlinkSync(path.join(example, "node_modules", name), path.join(root, "node_modules", name), "dir");
  }
  return root;
}

function write(root, file, contents) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), contents);
}

test("matching rejects domain filenames; create builds a conforming feature", async () => {
  const root = repository();
  try {
    assert.deepEqual(await check({ cwd: root }), []);
    write(root, "src/features/counter/counter.ts", "export const count = 0;\n");
    assert.ok((await check({ cwd: root })).some((issue) => issue.code === "unexpected_path" && issue.path.endsWith("counter.ts")));
    rmSync(path.join(root, "src/features/counter/counter.ts"));
    const created = spawnSync(process.execPath, [cli, "create", "src/features/new"], { cwd: root, encoding: "utf8" });
    assert.equal(created.status, 0, created.stdout + created.stderr);
    assert.ok(existsSync(path.join(root, "src/features/new/model.ts")));
    assert.deepEqual(await check({ cwd: root }), []);
    write(root, "src/features/new/model.ts", "export const createModel = 0;\n");
    const invalid = await check({ cwd: root });
    assert.ok(invalid.some((issue) => issue.code === "missing_model_operation" && issue.path === "src/features/new/model.ts"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("optional cache follows source contents, settings, membership, support, and implementations", async () => {
  const root = repository();
  const errors = (issues) => issues.filter((issue) => issue.code.startsWith("typescript_")).map((issue) => issue.code);
  const cached = () => check({ cwd: root, paths: [target], cache: true });
  // Different sizes make each test edit observable even on coarse filesystems.
  try {
    assert.deepEqual(await cached(), []);
    assert.ok(existsSync(path.join(root, "espalier/.cache/lint.jsonl")));
    assert.deepEqual(await cached(), []);
    write(root, "src/shared/count.ts", "export type Count = string; // changed dependency\n");
    assert.ok(errors(await cached()).includes("typescript_2322"));
    write(root, "src/shared/count.ts", "export type Count = number;\n");
    assert.deepEqual(await cached(), []);

    write(root, target, "export function createModel(): number { return null; }\nexport function updateModel(value: number) { return value; }\n");
    assert.ok(errors(await cached()).includes("typescript_2322"));
    write(root, "compiler.json", JSON.stringify({ compilerOptions: { strict: false, types: [], skipLibCheck: true } }));
    assert.deepEqual(await cached(), []);

    write(root, target, "export function createModel(): number { return FEATURE_READY; }\nexport function updateModel(value: number) { return value; }\n");
    assert.ok(errors(await cached()).includes("typescript_2304"));
    write(root, "src/shared/globals.ts", "declare const FEATURE_READY: number;\n");
    assert.deepEqual(await cached(), []);
    rmSync(path.join(root, "src/shared/globals.ts"));
    assert.ok(errors(await cached()).includes("typescript_2304"));

    write(root, "node_modules/example-types/package.json", '{"name":"example-types","types":"index.d.ts"}\n');
    write(root, "node_modules/example-types/index.d.ts", "export type Count = number;\n");
    write(root, target, 'import type { Count } from "example-types";\nexport function createModel(): Count { return 0; }\nexport function updateModel(value: Count): Count { return value; }\n');
    assert.deepEqual(await cached(), []);
    write(root, "node_modules/example-types/index.d.ts", "export type Count = string; // native support changed\n");
    assert.ok(errors(await cached()).includes("typescript_2322"));
    write(root, "node_modules/example-types/alternate.d.ts", "export type Count = number;\n");
    write(root, "node_modules/example-types/package.json", '{"name":"example-types","types":"alternate.d.ts","version":"1.0.0"}\n');
    assert.deepEqual(await cached(), []);

    const helper = path.join(root, "analysis/snapshot.mjs");
    writeFileSync(helper, readFileSync(helper, "utf8").replace(
      'await context.read(file)',
      '(await context.read(file)).replace("return 0;", \'return "changed implementation";\')',
    ));
    assert.ok(errors(await cached()).includes("typescript_2322"));
    assert.deepEqual(errors(await cached()), errors(await check({ cwd: root, paths: [target] })));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
