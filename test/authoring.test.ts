// The authoring contract's worked example. docs/AUTHORING.MD.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { check, runAggregate, runRule } from "../src/api.js";
import type { RuleModule } from "../src/compile.js";
import {
  AUTHORING_SENTINEL,
  shippedAuthoring,
  skipCoversAuthoring,
} from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const fixture = path.join(repo, "fixtures", "authoring-corpus");
const cli = path.join(repo, "dist", "src", "cli.js");

const cold: typeof check = (options) => check({ ...options, cache: false });

async function load(relative: string): Promise<RuleModule> {
  return (await import(pathToFileURL(path.join(fixture, relative)).href)) as RuleModule;
}

test("the packed example shares its modules with the authoring-corpus fixture", () => {
  const example = path.join(repo, "examples", "authoring-corpus");
  const shared = [
    "espalier/fixtures/[name]/case.json.mjs",
    "espalier/fixtures/[...path]/well-formed.json.mjs",
    "espalier/fixtures/[...path]/corpus-mix.mjs",
    "helpers/case.mjs",
    "fixtures/alpha/case.json",
    "fixtures/beta/case.json",
    "fixtures/gamma/case.json",
  ];
  for (const relative of shared) {
    assert.equal(
      readFileSync(path.join(example, relative), "utf8"),
      readFileSync(path.join(fixture, relative), "utf8"),
      relative,
    );
  }
});

test("the shipped contract, this repository's copy, and the sentinel agree", () => {
  const shipped = shippedAuthoring();
  assert.equal(shipped.startsWith(AUTHORING_SENTINEL), true);
  assert.equal(readFileSync(path.join(repo, "espalier", "AGENTS.MD"), "utf8"), shipped);
  assert.equal(skipCoversAuthoring(["AGENTS.MD"]), true);
  assert.equal(skipCoversAuthoring([]), false);
});

test("runRule catches a malformed case", async () => {
  const wellFormed = await load("espalier/fixtures/[...path]/well-formed.json.mjs");
  const issues = await runRule(wellFormed, {
    path: "fixtures/alpha/case.json",
    tree: { "fixtures/alpha/case.json": "{not json" },
    rule: "fixtures/[...path]/well-formed.json.mjs",
  });
  assert.deepEqual(
    issues.map((issue) => issue.code),
    ["malformed_case"],
  );
});

test("runAggregate rejects an empty population", async () => {
  const mix = await load("espalier/fixtures/[...path]/corpus-mix.mjs");
  const issues = await runAggregate(mix, {
    matches: [],
    patterns: ["fixtures/*/case.json"],
    at: "fixtures/",
    tree: {},
    rule: "fixtures/[...path]/corpus-mix.mjs",
  });
  assert.deepEqual(
    issues.map((issue) => issue.code),
    ["corpus_too_small"],
  );
});

test("runAggregate rejects a corpus that is not mixed enough", async () => {
  const mix = await load("espalier/fixtures/[...path]/corpus-mix.mjs");
  const issues = await runAggregate(mix, {
    matches: [
      { path: "fixtures/a/case.json" },
      { path: "fixtures/b/case.json" },
      { path: "fixtures/c/case.json" },
    ],
    patterns: ["fixtures/*/case.json"],
    at: "fixtures/",
    tree: {
      "fixtures/a/case.json": '{"kind":"query","depth":2,"args":2}',
      "fixtures/b/case.json": '{"kind":"query","depth":2,"args":2}',
      "fixtures/c/case.json": '{"kind":"query","depth":2,"args":2}',
    },
    rule: "fixtures/[...path]/corpus-mix.mjs",
  });
  assert.deepEqual(
    issues.map((issue) => issue.code),
    ["mutation_share"],
  );
});

test("check reports nothing for the conforming corpus", async () => {
  const issues = await cold({ cwd: fixture });
  assert.deepEqual(
    issues.filter((issue) => issue.severity === "error"),
    [],
  );
});

test("a scoped check still receives the full aggregate population", async () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "espalier-authoring-"));
  try {
    cpSync(fixture, scratch, { recursive: true });
    writeFileSync(
      path.join(scratch, "fixtures", "gamma", "case.json"),
      '{"kind":"query","depth":0,"args":0}\n',
    );
    const issues = await cold({ cwd: scratch, paths: ["fixtures/alpha"] });
    assert.ok(issues.some((issue) => issue.code === "mean_depth"));
    assert.ok(issues.some((issue) => issue.code === "mean_args"));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("editing a shared helper invalidates a scoped check of its caller", () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "espalier-authoring-cache-"));
  try {
    cpSync(fixture, scratch, { recursive: true });
    const first = spawnSync(process.execPath, [cli, "lint", "--format", "jsonl"], {
      cwd: scratch,
      encoding: "utf8",
    });
    assert.equal(first.status, 0, first.stdout + first.stderr);

    writeFileSync(
      path.join(scratch, "helpers", "case.mjs"),
      `export function parseCase() {
  return { ok: false, error: "helper changed" };
}
`,
    );
    const second = spawnSync(
      process.execPath,
      [cli, "lint", "fixtures/alpha", "--format", "jsonl"],
      { cwd: scratch, encoding: "utf8" },
    );
    assert.equal(second.status, 1, second.stdout + second.stderr);
    assert.match(second.stdout, /helper changed/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
