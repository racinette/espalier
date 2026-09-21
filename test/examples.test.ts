// `espalier examples`. docs/cli/examples/README.MD.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { examplesRoot } from "../src/examples.js";
import { PACKAGE_ROOT } from "../src/version.js";

const cli = path.join(PACKAGE_ROOT, "dist", "src", "cli.js");

function run(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

test("examples prints the packed directory without a repository", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "espalier-examples-"));
  try {
    const printed = run(cwd, ["examples"]);
    assert.equal(printed.status, 0, printed.stderr);
    assert.equal(printed.stdout, `${examplesRoot()}\n`);
    assert.equal(existsSync(examplesRoot()), true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("examples authoring-corpus prints that tree", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "espalier-examples-named-"));
  try {
    const printed = run(cwd, ["examples", "authoring-corpus"]);
    const at = path.join(examplesRoot(), "authoring-corpus");
    assert.equal(printed.status, 0, printed.stderr);
    assert.equal(printed.stdout, `${at}\n`);
    assert.equal(existsSync(path.join(at, "espalier", "fixtures", "[name]", "case.json.mjs")), true);
    assert.equal(existsSync(path.join(at, "helpers", "case.mjs")), true);
    assert.equal(existsSync(path.join(at, "AGENTS.MD")), true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("an unknown example names itself", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "espalier-examples-unknown-"));
  try {
    const printed = run(cwd, ["examples", "no-such-tree"]);
    assert.equal(printed.status, 2);
    assert.equal(printed.stdout, "");
    assert.match(printed.stderr, /unknown example "no-such-tree"/);
    assert.match(printed.stderr, /authoring-corpus/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
