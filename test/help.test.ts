// `espalier help`. docs/cli/help/README.MD.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalog, PAGES } from "../src/help.js";
import { PACKAGE_ROOT, VERSION } from "../src/version.js";

const cli = path.join(PACKAGE_ROOT, "dist", "src", "cli.js");

function run(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

test("help lists this version's pages without a repository", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "espalier-help-"));
  try {
    const printed = run(cwd, ["help"]);
    assert.equal(printed.status, 0, printed.stderr);
    assert.equal(printed.stderr, "");
    assert.equal(printed.stdout, catalog());
    assert.match(printed.stdout, new RegExp(`Reference for espalier ${VERSION}`));
    for (const page of PAGES) {
      assert.match(printed.stdout, new RegExp(`^ {2}${page.name} `, "m"));
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("help prints a packed page verbatim", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "espalier-help-page-"));
  try {
    const printed = run(cwd, ["help", "authoring"]);
    assert.equal(printed.status, 0, printed.stderr);
    assert.equal(
      printed.stdout,
      readFileSync(path.join(PACKAGE_ROOT, "docs", "AUTHORING.MD"), "utf8"),
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("an unknown help page names itself and prints the catalog", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "espalier-help-unknown-"));
  try {
    const printed = run(cwd, ["help", "no-such-page"]);
    assert.equal(printed.status, 2);
    assert.equal(printed.stdout, "");
    assert.match(printed.stderr, /unknown help page "no-such-page"/);
    assert.match(printed.stderr, /espalier help \[page\]/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("--help still prints the short synopsis", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "espalier-help-synopsis-"));
  try {
    const printed = run(cwd, ["--help"]);
    assert.equal(printed.status, 0, printed.stderr);
    assert.match(printed.stdout, /^espalier <command> \[options\]/);
    assert.match(printed.stdout, /^ {2}help \[page\]/m);
    assert.match(printed.stdout, /^ {2}examples \[name\]/m);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
