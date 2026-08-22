// The parts of the incremental cache no fixture can see: what a narrowed run
// leaves behind, what a full run drops, what a replayed issue carries, and what
// happens when the file itself is unusable. See docs/cli/lint/README.MD
// "Incremental runs".
//
// Every assertion here is about a second or third run, so each test builds its
// own repository. The rule modules are impure on purpose, for the reason
// fixtures/README.MD gives: warm and cold output are identical by design, and a
// token the runner cannot see is the only way a skip becomes visible.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "../src/api.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(path.resolve(here, "..", ".."), "dist", "src", "cli.js");

const token = 'process.env.ESPALIER_TEST_TOKEN ?? "unset"';

function module(body: string): string {
  return `export const description = "a source file";

export const rule = \`Nothing this test cares about.\`;

export async function lint(context) {
  const { emit } = context;
${body}
}
`;
}

const EMITS = module(`  emit({ code: "token", message: ${token}, severity: "warning" });`);

const CACHE = path.join("espalier", ".cache", "lint.jsonl");

/** A repository with two files, both owned by one module. */
function repository(rule = EMITS): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-cache-"));
  mkdirSync(path.join(root, "espalier"));
  writeFileSync(path.join(root, "espalier.config.yaml"), "version: 1\nroot: espalier\n");
  writeFileSync(path.join(root, "espalier", "[file].ts.mjs"), rule);
  writeFileSync(path.join(root, "a.ts"), "export const a = 1;\n");
  writeFileSync(path.join(root, "b.ts"), "export const b = 2;\n");
  return root;
}

interface Run {
  status: number;
  issues: Record<string, unknown>[];
  failures: Record<string, unknown>[];
}

function run(root: string, value: string, args: string[] = []): Run {
  const result = spawnSync(process.execPath, [cli, "lint", "--format", "jsonl", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ESPALIER_TEST_TOKEN: value },
  });
  if (result.error) throw result.error;

  const lines = result.stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  return {
    status: result.status ?? -1,
    issues: lines.filter((line) => line["kind"] === "issue"),
    failures: lines.filter((line) => line["kind"] === "failure"),
  };
}

/** Lints, insisting the run was clean, and returns each path's message. */
function lint(root: string, value: string, args: string[] = []): Record<string, string> {
  const result = run(root, value, args);
  assert.equal(result.status, 0, `lint exited ${result.status}`);

  const reported: Record<string, string> = {};
  for (const issue of result.issues) reported[issue["path"] as string] = issue["message"] as string;
  return reported;
}

function entries(root: string, at = CACHE): string[] {
  return readFileSync(path.join(root, at), "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .slice(1)
    .map((line) => (JSON.parse(line) as { path: string }).path)
    .sort();
}

function discard(root: string): void {
  rmSync(root, { recursive: true, force: true });
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
    discard(root);
  }
});

test("a full run drops what is no longer there", () => {
  const root = repository();
  try {
    lint(root, "first");
    assert.deepEqual(entries(root), ["a.ts", "b.ts"]);

    rmSync(path.join(root, "b.ts"));
    lint(root, "second");
    assert.deepEqual(entries(root), ["a.ts"], "a full run kept an entry for a deleted file");
  } finally {
    discard(root);
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
    discard(root);
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
    discard(root);
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
    discard(root);
  }
});

test("a child espalier keeps its own cache", () => {
  const root = repository();
  try {
    const child = path.join(root, "packages", "web");
    mkdirSync(path.join(child, "espalier"), { recursive: true });
    writeFileSync(path.join(child, "espalier.config.yaml"), "version: 1\nroot: espalier\n");
    writeFileSync(path.join(child, "espalier", "[file].ts.mjs"), EMITS);
    writeFileSync(path.join(child, "c.ts"), "export const c = 3;\n");

    assert.deepEqual(lint(root, "first"), {
      "a.ts": "first",
      "b.ts": "first",
      "packages/web/c.ts": "first",
    });

    // A child shares nothing with its parent, here either: two caches, each
    // under its own espalier, each holding paths relative to its own root.
    assert.deepEqual(entries(root), ["a.ts", "b.ts"]);
    assert.deepEqual(entries(path.join(child), CACHE), ["c.ts"]);

    assert.deepEqual(lint(root, "second"), {
      "a.ts": "first",
      "b.ts": "first",
      "packages/web/c.ts": "first",
    });
  } finally {
    discard(root);
  }
});

test("check caches unless the caller says otherwise", async () => {
  const root = repository();
  try {
    process.env["ESPALIER_TEST_TOKEN"] = "first";
    const cold = await check({ cwd: root });
    assert.deepEqual(cold.map((issue) => issue.message), ["first", "first"]);

    process.env["ESPALIER_TEST_TOKEN"] = "second";
    const warm = await check({ cwd: root });
    assert.deepEqual(
      warm.map((issue) => issue.message),
      ["first", "first"],
      "check ran the rules again, though nothing had changed",
    );

    const forced = await check({ cwd: root, cache: false });
    assert.deepEqual(forced.map((issue) => issue.message), ["second", "second"]);
  } finally {
    delete process.env["ESPALIER_TEST_TOKEN"];
    discard(root);
  }
});

test("a replayed issue is the issue that was emitted", () => {
  const root = repository(
    module(`  emit({
    code: "elsewhere",
    message: ${token},
    severity: "warning",
    path: "b.ts",
    line: 12,
    column: 3,
    metadata: { why: "because", how: [1, 2] },
  });`),
  );
  try {
    const cold = run(root, "first");
    const warm = run(root, "second");

    // Everything an issue carries beyond `emit`'s own fields is derived from
    // the module and the match, and both are pinned by the key — so a replayed
    // issue is not a reconstruction, it is the same issue.
    assert.deepEqual(warm.issues, cold.issues);
    assert.equal(cold.issues.length, 2);
    assert.ok(cold.issues.every((issue) => issue["path"] === "b.ts"));
    assert.ok(cold.issues.every((issue) => issue["line"] === 12 && issue["column"] === 3));
    assert.deepEqual(cold.issues[0]?.["metadata"], { why: "because", how: [1, 2] });
  } finally {
    discard(root);
  }
});

test("what an issue derives is derived again, not stored", () => {
  const root = repository();
  try {
    const cold = run(root, "first");
    assert.ok(cold.issues.every((issue) => typeof issue["ruleText"] === "string"));

    // `--no-rule-text` is a property of the run, not of the finding. A replayed
    // issue that carried the stored text would leak it into a run that asked
    // for the opposite.
    const warm = run(root, "second", ["--no-rule-text"]);
    assert.deepEqual(warm.issues.map((issue) => issue["message"]), ["first", "first"]);
    assert.ok(
      warm.issues.every((issue) => issue["ruleText"] === null),
      "a replayed issue carried rule text into a run that suppressed it",
    );
  } finally {
    discard(root);
  }
});

test("a replayed error still fails the run", () => {
  const root = repository(module(`  emit({ code: "bad", message: ${token} });`));
  try {
    assert.equal(run(root, "first").status, 1);

    const warm = run(root, "second");
    assert.equal(warm.status, 1, "a replayed error did not reach the exit code");
    assert.deepEqual(warm.issues.map((issue) => issue["message"]), ["first", "first"]);
  } finally {
    discard(root);
  }
});

test("a run that fails records nothing", () => {
  const root = repository(module(`  throw new Error("no");`));
  try {
    const failed = run(root, "first");
    assert.equal(failed.status, 2);
    assert.equal(failed.failures[0]?.["code"], "rule_threw");

    // Half a work list is not a record of one, and a pruning write over it
    // would throw away every entry the run never reached.
    assert.equal(existsSync(path.join(root, CACHE)), false, "a failed run wrote a cache");
  } finally {
    discard(root);
  }
});

test("a rule whose read is gone does not replay", () => {
  const root = repository(
    module(`  await context.read("b.ts");
  emit({ code: "token", message: ${token}, severity: "warning" });`),
  );
  try {
    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });

    rmSync(path.join(root, "b.ts"));
    const warm = run(root, "second");

    // A missing path cannot match the stamp it had, so the rule runs — and
    // discovers for itself that what it depends on is gone.
    assert.equal(warm.status, 2, "a rule replayed over a file that no longer exists");
    assert.equal(warm.failures[0]?.["code"], "read_failed");
  } finally {
    discard(root);
  }
});
