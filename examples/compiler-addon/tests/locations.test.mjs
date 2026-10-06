import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runRule } from "espalier";
import { diagnosticIssue } from "../analysis/diagnostic.mjs";
import { createCompilerService } from "../analysis/compiler.mjs";

test("compiler locations remain valid application findings with readable origins", async () => {
  const root = path.resolve(os.tmpdir(), "compiler-location");
  const checkedPath = "src/features/tiny/model.ts";
  const other = "src/shared/value.ts";
  const location = { root, checkedPath, governedPaths: [checkedPath, other] };
  const issueFor = (file, line = 4, column = 7) => diagnosticIssue({ code: 2322, message: "Type mismatch", file, line, column }, location);
  const application = issueFor(path.join(root, other));
  assert.equal(application.path, other);
  assert.equal(application.line, 4);
  assert.equal(application.column, 7);
  for (const file of [path.join(root, "node_modules/types/index.d.ts"), path.join(root, "../external/index.d.ts")]) {
    const fallback = issueFor(file);
    assert.equal(fallback.path, checkedPath);
    assert.equal("line" in fallback, false);
    assert.equal("column" in fallback, false);
    assert.match(fallback.message, /from .*index\.d\.ts:4:7/);
    assert.equal(fallback.metadata.origin.line, 4);
    const issues = await runRule({ rule: "Reports an adapted compiler finding.", lint: ({ emit }) => emit(fallback) }, { path: checkedPath });
    assert.equal(issues.length, 1);
  }
  const global = issueFor(undefined);
  assert.equal(global.path, checkedPath);
  assert.equal(global.message, "Type mismatch");
  assert.equal("line" in global, false);
  const invalidCoordinates = issueFor(path.join(root, other), 0, -1);
  assert.equal("line" in invalidCoordinates, false);
  assert.equal("column" in invalidCoordinates, false);
});

test("linked declarations keep logical identity; matching names do not grant trust", () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "compiler-linked-"));
  const root = path.join(scratch, "repository");
  const provider = path.join(scratch, "installed-provider");
  mkdirSync(path.join(root, "node_modules"), { recursive: true });
  mkdirSync(provider);
  writeFileSync(path.join(provider, "package.json"), '{"name":"reviewed-types","types":"index.d.ts"}\n');
  writeFileSync(path.join(provider, "index.d.ts"), "export interface Approved { value: number }\n");
  symlinkSync(provider, path.join(root, "node_modules/reviewed-types"), "dir");
  mkdirSync(path.join(root, "node_modules/pretender"));
  writeFileSync(path.join(root, "node_modules/pretender/package.json"), '{"name":"pretender","types":"index.d.ts"}\n');
  writeFileSync(path.join(root, "node_modules/pretender/index.d.ts"), "export interface Approved { value: number }\n");
  const compiler = createCompilerService(root);
  try {
    const file = "src/model.ts";
    const facts = compiler.analyze({
      sources: [[file, 'import type { Approved as Real } from "reviewed-types";\nimport type { Approved as Fake } from "pretender";\nexport const real: Real = { value: 1 };\nexport const fake: Fake = { value: 1 };\n']],
      compilerOptions: { strict: true, types: [], skipLibCheck: true, moduleResolution: "Node10" },
    });
    assert.deepEqual(facts.diagnosticsFor(file), []);
    const real = facts.declarationOfImport(file, "Real");
    const fake = facts.declarationOfImport(file, "Fake");
    const reviewed = path.join(root, "node_modules/reviewed-types/index.d.ts");
    assert.equal(real.file, reviewed);
    assert.equal(real.name, "Approved");
    assert.equal(fake.name, "Approved");
    assert.notEqual(fake.file, reviewed);
    assert.equal(facts.declarationOfImport(file, "Missing"), undefined);
  } finally {
    compiler.dispose();
    rmSync(scratch, { recursive: true, force: true });
  }
});
