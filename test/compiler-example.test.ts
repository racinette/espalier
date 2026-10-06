// The packed compiler example executes its own semantic recipes in a copy.
// This test guards delivery and dependency isolation rather than runner internals.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PACKAGE_ROOT } from "../src/version.js";

test("the shipped compiler addon example runs its semantic tests and conforms", () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "espalier-compiler-example-"));
  try {
    cpSync(path.join(PACKAGE_ROOT, "examples/compiler-addon"), scratch, { recursive: true });
    mkdirSync(path.join(scratch, "node_modules"));
    symlinkSync(PACKAGE_ROOT, path.join(scratch, "node_modules/espalier"), "dir");
    symlinkSync(path.join(PACKAGE_ROOT, "node_modules/typescript"), path.join(scratch, "node_modules/typescript"), "dir");
    const execute = (args: string[]) => {
      const result = spawnSync(process.execPath, args, { cwd: scratch, encoding: "utf8" });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return result.stdout;
    };
    const tested = execute(["--test", "--test-isolation=none", "--test-concurrency=1", "tests/compiler.test.mjs", "tests/repository.test.mjs", "tests/locations.test.mjs"]);
    assert.match(tested, /tests 8\b/, "all eight recipe tests must execute");
    const cli = path.join(PACKAGE_ROOT, "dist/src/cli.js");
    execute([cli, "lint"]);
    execute([cli, "build", "--check"]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
