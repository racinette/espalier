// The parts of the incremental cache no fixture can see: what a narrowed run
// leaves behind, what a full run drops, and what happens when the file itself
// is unusable. See docs/cli/lint/README.MD "Incremental runs".
//
// Every assertion here is about a second or third run, so each test builds its
// own repository. The rule module is impure on purpose, for the reason
// fixtures/README.MD gives: warm and cold output are identical by design, and
// a token the runner cannot see is the only way a skip becomes visible.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(path.resolve(here, "..", ".."), "dist", "src", "cli.js");

const MODULE = `export const description = "a source file";

export const rule = \`Nothing this test cares about.\`;

export async function lint({ emit }) {
  emit({
    code: "token",
    message: process.env.ESPALIER_TEST_TOKEN ?? "unset",
    severity: "warning",
  });
}
`;

const CACHE = path.join("espalier", ".cache", "lint.jsonl");

/** A repository with two files, both owned by one module. */
function repository(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-cache-"));
  mkdirSync(path.join(root, "espalier"));
  writeFileSync(path.join(root, "espalier.config.yaml"), "version: 1\nroot: espalier\n");
  writeFileSync(path.join(root, "espalier", "[file].ts.mjs"), MODULE);
  writeFileSync(path.join(root, "a.ts"), "export const a = 1;\n");
  writeFileSync(path.join(root, "b.ts"), "export const b = 2;\n");
  return root;
}

/** Lints, and returns the message each path was reported with. */
function lint(root: string, token: string, args: string[] = []): Record<string, string> {
  const result = spawnSync(process.execPath, [cli, "lint", "--format", "jsonl", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ESPALIER_TEST_TOKEN: token },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `lint exited ${result.status}\n${result.stdout}${result.stderr}`);

  const reported: Record<string, string> = {};
  for (const line of result.stdout.split("\n").filter((entry) => entry.trim() !== "")) {
    const issue = JSON.parse(line) as Record<string, string>;
    if (issue["kind"] === "issue") reported[issue["path"]!] = issue["message"]!;
  }
  return reported;
}

function entries(root: string): string[] {
  return readFileSync(path.join(root, CACHE), "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .slice(1)
    .map((line) => (JSON.parse(line) as { path: string }).path);
}

test("a narrowed run refreshes what it visited and keeps the rest", () => {
  const root = repository();
  try {
    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });

    // Neither of these visits `b.ts`. Its entry has to survive both, because
    // an invocation a run did not reach is not an invocation that went away.
    lint(root, "second", ["a.ts"]);
    lint(root, "third", ["--rule", "[file].ts.mjs", "a.ts"]);

    assert.deepEqual(
      lint(root, "fourth"),
      { "a.ts": "first", "b.ts": "first" },
      "a narrowed run pruned an entry it never looked at",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a full run drops what is no longer there", () => {
  const root = repository();
  try {
    lint(root, "first");
    assert.deepEqual(entries(root).sort(), ["a.ts", "b.ts"]);

    rmSync(path.join(root, "b.ts"));
    lint(root, "second");
    assert.deepEqual(entries(root), ["a.ts"], "a full run kept an entry for a deleted file");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a cache that cannot be parsed is discarded, not reported", () => {
  const root = repository();
  try {
    lint(root, "first");
    writeFileSync(path.join(root, CACHE), "this is not a cache\n{ also not\n");

    // Exit `0` with the current token: the run did the work rather than
    // failing over its own bookkeeping, and there is no code for this.
    assert.deepEqual(lint(root, "second"), { "a.ts": "second", "b.ts": "second" });
    assert.deepEqual(lint(root, "third"), { "a.ts": "second", "b.ts": "second" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a cache that cannot be written is not an error", () => {
  const root = repository();
  const directory = path.join(root, "espalier", ".cache");
  try {
    mkdirSync(directory);
    chmodSync(directory, 0o500);

    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });
    assert.deepEqual(lint(root, "second"), { "a.ts": "second", "b.ts": "second" });
  } finally {
    chmodSync(directory, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

test("--no-cache neither reads nor writes", () => {
  const root = repository();
  try {
    lint(root, "first");
    assert.deepEqual(lint(root, "second", ["--no-cache"]), { "a.ts": "second", "b.ts": "second" });

    // The run before this one saw a different answer and wrote nothing, so
    // what the first run recorded is still what comes back.
    assert.deepEqual(lint(root, "third"), { "a.ts": "first", "b.ts": "first" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
