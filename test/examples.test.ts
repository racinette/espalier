// `espalier examples`. docs/cli/examples/README.MD. These tests inspect the
// installed example catalog and copies outside any configured repository.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("examples help lists names and copying without opening the installed tree", () => {
  for (const flag of ["--help", "-h"]) {
    const printed = run(os.tmpdir(), ["examples", flag]);
    assert.equal(printed.status, 0, printed.stderr);
    assert.match(printed.stdout, /--copy <directory>/);
    assert.match(printed.stdout, /authoring-corpus/);
  }
});

function assertSameTree(source: string, copy: string): void {
  const names = readdirSync(source).sort();
  assert.deepEqual(readdirSync(copy).sort(), names);
  for (const name of names) {
    const from = path.join(source, name);
    const to = path.join(copy, name);
    if (lstatSync(from).isDirectory()) assertSameTree(from, to);
    else assert.deepEqual(readFileSync(to), readFileSync(from), name);
  }
}

test("copy creates the complete example at the destination root and leaves it editable", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "espalier-example-copy-"));
  try {
    const destination = path.join(cwd, "scratch", "my corpus");
    const printed = run(cwd, ["examples", "authoring-corpus", "--copy", "scratch/my corpus"]);
    assert.equal(printed.status, 0, printed.stderr);
    assert.equal(printed.stdout, `${destination}\n`);
    assert.equal(printed.stderr, "");
    const source = path.join(examplesRoot(), "authoring-corpus");
    assertSameTree(source, destination);
    const original = readFileSync(path.join(source, "fixtures/alpha/case.json"));
    writeFileSync(path.join(destination, "fixtures/alpha/case.json"), "changed\n");
    assert.deepEqual(readFileSync(path.join(source, "fixtures/alpha/case.json")), original);

    const absolute = path.join(cwd, "absolute");
    assert.equal(run(cwd, ["examples", "authoring-corpus", "--copy", absolute]).status, 0);
    assertSameTree(source, absolute);
    assert.equal(run(absolute, ["lint", "--no-cache"]).status, 0);
    assert.equal(run(absolute, ["build", "--check"]).status, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("copy refuses existing files, directories, and dangling symlinks without changing them", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "espalier-example-existing-"));
  try {
    mkdirSync(path.join(cwd, "empty"));
    mkdirSync(path.join(cwd, "occupied"));
    writeFileSync(path.join(cwd, "occupied/keep"), "keep");
    writeFileSync(path.join(cwd, "file"), "keep");
    symlinkSync("absent", path.join(cwd, "link"));
    for (const destination of ["empty", "occupied", "file", "link"]) {
      const printed = run(cwd, ["examples", "authoring-corpus", "--copy", destination]);
      assert.equal(printed.status, 2);
      assert.equal(printed.stdout, "");
      assert.match(printed.stderr, /cannot copy example/);
    }
    assert.deepEqual(readdirSync(path.join(cwd, "empty")), []);
    assert.deepEqual(readdirSync(path.join(cwd, "occupied")), ["keep"]);
    assert.equal(readFileSync(path.join(cwd, "occupied/keep"), "utf8"), "keep");
    assert.equal(readFileSync(path.join(cwd, "file"), "utf8"), "keep");
    assert.equal(readlinkSync(path.join(cwd, "link")), "absent");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("invalid copy arguments and filesystem failures produce no success path", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "espalier-example-invalid-"));
  try {
    writeFileSync(path.join(cwd, "file"), "keep");
    for (const args of [
      ["--copy", "destination"],
      ["authoring-corpus", "--copy"],
      ["authoring-corpus", "--copy="],
      ["authoring-corpus", "extra"],
      ["authoring-corpus", "--unknown"],
      ["unknown", "--copy", "destination"],
      ["authoring-corpus", "--copy", "file/child"],
    ]) {
      const printed = run(cwd, ["examples", ...args]);
      assert.equal(printed.status, 2, args.join(" "));
      assert.equal(printed.stdout, "");
      assert.notEqual(printed.stderr, "");
    }
    assert.deepEqual(readdirSync(cwd), ["file"]);
    assert.equal(readFileSync(path.join(cwd, "file"), "utf8"), "keep");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
