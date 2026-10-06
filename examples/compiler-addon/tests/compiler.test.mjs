import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runRule } from "espalier";
import { setup } from "../analysis/addons.mjs";
import { createCompilerService } from "../analysis/compiler.mjs";
import { snapshotFor } from "../analysis/snapshot.mjs";
import * as model from "../espalier/src/features/[feature]/model.ts.mjs";
import * as types from "../espalier/src/[...path]/type-errors.ts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = "src/features/tiny/model.ts";
const valid = "export function createModel() { return 0; }\nexport function updateModel(value: number) { return value + 1; }\n";
const treeFor = (source) => ({
  "compiler.json": JSON.stringify({ compilerOptions: { strict: true, types: [], skipLibCheck: true } }),
  [target]: source,
});

test("small semantic fixtures explicitly own and dispose their addon", async () => {
  const addons = setup();
  try {
    assert.deepEqual(await runRule(model, { path: target, tree: treeFor(valid), addons }), []);
    const missing = await runRule(model, { path: target, tree: treeFor("export const createModel = 0;"), addons });
    assert.deepEqual(missing.map((issue) => issue.code), ["missing_model_operation"]);
    const invalid = await runRule(types, { path: target, tree: treeFor('export const value: number = "wrong";'), addons });
    assert.ok(invalid.some((issue) => issue.code === "typescript_2322"));
    assert.deepEqual(await runRule(types, { path: target, tree: treeFor(valid), addons }), []);
    // This file exists on disk in the example, but is absent from the virtual
    // snapshot. The compiler must not fill the gap with an untracked read.
    const absent = await runRule(types, {
      path: target, tree: treeFor('export { createModel } from "../counter/model.js";'), addons,
    });
    assert.ok(absent.some((issue) => issue.code === "typescript_2307"));
  } finally {
    addons[Symbol.dispose]();
  }
  assert.throws(() => addons.compiler.analyze({ sources: [], compilerOptions: {} }), /disposed/);
});

test("identical inputs reuse a lazy program; changed snapshots and options rebuild", () => {
  let builds = 0;
  const compiler = createCompilerService(root, { onBuild: () => builds++ });
  try {
    assert.equal(builds, 0);
    const snapshot = { sources: [[target, valid]], compilerOptions: { types: [], strict: true } };
    const first = compiler.analyze(snapshot);
    assert.equal(compiler.analyze(structuredClone(snapshot)), first);
    assert.equal(builds, 1);
    const changed = compiler.analyze({ ...snapshot, sources: [[target, 'export const value: number = "wrong";']] });
    assert.notEqual(changed, first);
    assert.ok(changed.diagnosticsFor(target).some((item) => item.code === 2322));
    compiler.analyze({ ...snapshot, compilerOptions: { types: [], strict: false } });
    assert.equal(builds, 3);
  } finally { compiler.dispose(); }
});

test("each snapshot request records reads even when the analysis is shared", async () => {
  const addons = setup();
  const reads = [];
  let listings = 0;
  const tree = treeFor(valid);
  const context = {
    files: async () => { listings++; return [target]; },
    read: async (file) => { reads.push(file); return tree[file]; },
  };
  try {
    const first = addons.compiler.analyze(await snapshotFor(context));
    assert.equal(addons.compiler.analyze(await snapshotFor(context)), first);
    assert.equal(listings, 2);
    assert.deepEqual(reads, [target, "compiler.json", target, "compiler.json"]);
  } finally { addons[Symbol.dispose](); }
});

test("rule order and separate repositories cannot change facts", async () => {
  const good = setup();
  const bad = setup();
  const reversed = setup();
  try {
    const run = (rule, addons, tree) => runRule(rule, { path: target, tree, addons });
    const goodTree = treeFor(valid);
    const badTree = treeFor('export const value: number = "wrong";');
    const expectedModel = await run(model, good, goodTree);
    const expectedTypes = await run(types, good, goodTree);
    assert.deepEqual(await run(types, reversed, goodTree), expectedTypes);
    assert.deepEqual(await run(model, reversed, goodTree), expectedModel);
    assert.equal((await run(types, bad, badTree)).length > 0, true);
    assert.equal((await run(model, bad, badTree)).length, 2);
    assert.deepEqual(await run(types, good, goodTree), expectedTypes);
    assert.deepEqual(await run(model, good, goodTree), expectedModel);
  } finally {
    good[Symbol.dispose]();
    bad[Symbol.dispose]();
    reversed[Symbol.dispose]();
  }
});
