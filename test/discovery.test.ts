// Finding the configuration. docs/CONFIG.MD "Discovery".
//
// A unit test rather than a fixture because the fixture harness always invokes
// the CLI from the fixture root, where the config already is. That is the one
// place discovery never has to do anything: the first candidate it tries is a
// hit, so the loop that walks upward — and the branch `--config` takes instead
// — had never run in the suite at all.
//
// This matters more than its size suggests. Every command begins here, and a
// developer running `espalier lint` from three directories inside a package is
// the ordinary case rather than the exotic one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, "..", "src", "cli.js");

/** A repository whose only rule governs `src/[name].ts`, plus a deep empty directory. */
function repository(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-discovery-"));
  mkdirSync(path.join(root, "espalier", "src"), { recursive: true });
  mkdirSync(path.join(root, "src", "deep", "nested"), { recursive: true });

  writeFileSync(path.join(root, "espalier.config.yaml"), "version: 1\npin: 0.1.0\n");
  writeFileSync(
    path.join(root, "espalier", "src", "[name].ts.mjs"),
    'export const description = "a module";\nexport const rule = "r";\nexport async function lint() {}\n',
  );
  writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n");
  return root;
}

function run(cwd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const done = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  return { status: done.status ?? -1, stdout: done.stdout, stderr: done.stderr };
}

test("discovery walks upward from the working directory", () => {
  const root = repository();
  try {
    // Three levels down, and past a directory the espalier does not describe,
    // so nothing but the upward walk can find the config.
    const from = path.join(root, "src", "deep", "nested");
    const lint = run(from, ["lint", "--format", "jsonl"]);

    assert.equal(lint.status, 0, `expected a clean run\nstdout:\n${lint.stdout}\nstderr:\n${lint.stderr}`);
    assert.equal(lint.stdout.trim(), "", "a conforming repository reports nothing");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("paths stay relative to the config's directory, not the working directory", () => {
  const root = repository();
  try {
    const from = path.join(root, "src", "deep", "nested");
    const explain = run(from, ["explain", "../../a.ts", "--format", "jsonl"]);
    const answer = JSON.parse(explain.stdout.trim()) as Record<string, unknown>;

    // The repository root is where the config is, so the answer is `src/a.ts`
    // however deep the caller stood. docs/CONFIG.MD "Discovery".
    assert.equal(answer["path"], "src/a.ts");
    assert.equal(answer["rule"], "src/[name].ts.mjs");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovery stops at the filesystem root", () => {
  // A directory with no config above it anywhere. `os.tmpdir()` is not a
  // repository, and neither is anything above it.
  const empty = mkdtempSync(path.join(os.tmpdir(), "espalier-nowhere-"));
  try {
    const lint = run(empty, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 2);
    const failure = JSON.parse(lint.stdout.trim()) as Record<string, unknown>;
    assert.equal(failure["kind"], "failure");
    assert.equal(failure["code"], "config_not_found");
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("--config overrides discovery, from anywhere", () => {
  const root = repository();
  const elsewhere = mkdtempSync(path.join(os.tmpdir(), "espalier-elsewhere-"));
  try {
    // Not inside the repository, and not above it: discovery from here would
    // find nothing, so a clean run is the flag doing the work.
    const lint = run(elsewhere, [
      "lint",
      "--config",
      path.join(root, "espalier.config.yaml"),
      "--format",
      "jsonl",
    ]);

    assert.equal(lint.status, 0, `stdout:\n${lint.stdout}\nstderr:\n${lint.stderr}`);
    assert.equal(lint.stdout.trim(), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("--config naming a file that is not there is config_not_found", () => {
  const empty = mkdtempSync(path.join(os.tmpdir(), "espalier-missing-"));
  try {
    const lint = run(empty, ["lint", "--config", "absent.yaml", "--format", "jsonl"]);
    assert.equal(lint.status, 2);
    const failure = JSON.parse(lint.stdout.trim()) as Record<string, unknown>;
    assert.equal(failure["code"], "config_not_found");
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});
