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
  statSync,
  utimesSync,
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
  writeFileSync(path.join(root, "espalier.config.yaml"), "version: 1\npin: 0.1.0\nroot: espalier\n");
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
    writeFileSync(path.join(child, "espalier.config.yaml"), "version: 1\npin: 0.1.0\nroot: espalier\n");
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
    // discovers for itself that what it depends on is gone. A deleted file is
    // no longer a candidate, so it fails the scope check before the open.
    assert.equal(warm.status, 2, "a rule replayed over a file that no longer exists");
    assert.equal(warm.failures[0]?.["code"], "read_ungoverned");
  } finally {
    discard(root);
  }
});

test("files never lists a path the espalier does not govern", () => {
  const root = repository(
    module(`  const found = await context.files("**/*");
  emit({ code: "listed", message: found.join(","), severity: "warning" });`),
  );
  try {
    writeFileSync(path.join(root, "notes.txt"), "not governed\n");
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    writeFileSync(path.join(root, ".espalierignore"), "notes.txt\n");

    // The glob matches `notes.txt` outright. What keeps it out of the listing
    // is the governed set, which is also the set the cache stamps.
    const listed = lint(root, "first");
    assert.deepEqual(listed, { "a.ts": "a.ts,b.ts", "b.ts": "a.ts,b.ts" });
  } finally {
    discard(root);
  }
});

test("read refuses a path the espalier does not govern", () => {
  const root = repository(
    module(`  await context.read("notes.txt");
  emit({ code: "token", message: ${token}, severity: "warning" });`),
  );
  try {
    writeFileSync(path.join(root, "notes.txt"), "not governed\n");
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    writeFileSync(path.join(root, ".espalierignore"), "notes.txt\n");

    // The file is there and readable. Being ungoverned is the whole objection:
    // nothing stamps it, so a rule that depended on it could never be replayed
    // safely.
    const failed = run(root, "first");
    assert.equal(failed.status, 2, "a rule read an ignored file");
    assert.equal(failed.failures[0]?.["code"], "read_ungoverned");
  } finally {
    discard(root);
  }
});

test("an edited config discards the cache", () => {
  const root = repository();
  try {
    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });

    // Nothing under the espalier moved, and neither file changed. The config
    // decides what is governed and what each rule may see, so an entry recorded
    // under the old one describes a run that no longer exists.
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    writeFileSync(path.join(root, ".espalierignore"), "notes.txt\n");

    assert.deepEqual(
      lint(root, "second"),
      { "a.ts": "second", "b.ts": "second" },
      "an entry recorded under a different config was replayed",
    );
  } finally {
    discard(root);
  }
});

test("an edited ignore file discards the cache", () => {
  const root = repository();
  try {
    // It excludes itself, so the espalier does not have to declare it.
    writeFileSync(path.join(root, ".gitignore"), ".gitignore\n");
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\nignoreFiles:\n  - .gitignore\n",
    );
    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });

    // `ignoreFiles` decides what is governed, and it lives outside the config.
    // An entry recorded before this line existed describes a different run.
    writeFileSync(path.join(root, ".gitignore"), ".gitignore\nnotes/\n");

    assert.deepEqual(
      lint(root, "second"),
      { "a.ts": "second", "b.ts": "second" },
      "an entry recorded under a different .gitignore was replayed",
    );
  } finally {
    discard(root);
  }
});

// The rest of the contract in cli/lint/README.MD "Incremental runs". Corruption
// here is expensive in a way a wrong answer elsewhere is not: a stale pass is
// silent, survives every subsequent run, and looks exactly like a clean
// repository. These are the clauses nothing else reaches.

test("an unreadable cache directory is not an error", () => {
  const root = repository();
  const directory = path.join(root, "espalier", ".cache");
  try {
    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });

    // "A cache that cannot be used is not an error." The file being unreadable
    // is caught where the cache is read; the *directory* is not, because the
    // repository walk reaches it first — and every path it cannot read now
    // fails the run. The espalier root is not walked at all, which is what
    // keeps that rule and this one from colliding.
    chmodSync(directory, 0o000);
    assert.deepEqual(lint(root, "second"), { "a.ts": "second", "b.ts": "second" });
  } finally {
    chmodSync(directory, 0o700);
    discard(root);
  }
});

test("an unreadable cache file is not an error either", () => {
  const root = repository();
  const file = path.join(root, CACHE);
  try {
    lint(root, "first");
    chmodSync(file, 0o000);
    // Discarded and redone, silently: the token is fresh, so no rule replayed.
    assert.deepEqual(lint(root, "second"), { "a.ts": "second", "b.ts": "second" });
  } finally {
    chmodSync(file, 0o600);
    discard(root);
  }
});

test("an edited addons module discards the cache", () => {
  const root = repository();
  try {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\naddons: espalier.addons.mjs\n",
    );
    writeFileSync(path.join(root, ".espalierignore"), "espalier.addons.mjs\n");
    writeFileSync(
      path.join(root, "espalier.addons.mjs"),
      "export async function setup() { return { limit: 1 }; }\n",
    );

    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });
    assert.deepEqual(lint(root, "second"), { "a.ts": "first", "b.ts": "first" }, "replayed");

    // What the addons module returns decides what every rule is told, so it
    // counts as part of the espalier even though it lives outside the root.
    writeFileSync(
      path.join(root, "espalier.addons.mjs"),
      "export async function setup() { return { limit: 2 }; }\n",
    );
    assert.deepEqual(lint(root, "third"), { "a.ts": "third", "b.ts": "third" });
  } finally {
    discard(root);
  }
});

test("a deleted sibling invalidates a glob, as an added one does", () => {
  const root = repository(
    module(`  const seen = await context.files("*.ts");
  emit({ code: "peers", message: \`\${seen.length}:\${${token}}\`, severity: "warning" });`),
  );
  try {
    assert.deepEqual(lint(root, "first"), { "a.ts": "2:first", "b.ts": "2:first" });
    assert.deepEqual(lint(root, "second"), { "a.ts": "2:first", "b.ts": "2:first" }, "replayed");

    // "A `files` glob depends on which paths exist, not on what is in them.
    // Editing a sibling does not invalidate a peer comparison; adding or
    // deleting one does." Addition is pinned by `lint-cache-glob-dependency`;
    // deletion is the half that is easy to leave to a set that only grows.
    rmSync(path.join(root, "b.ts"));
    assert.deepEqual(lint(root, "third"), { "a.ts": "1:third" });
  } finally {
    discard(root);
  }
});

test("a read is invalidated by size, not only by modification time", () => {
  const root = repository(
    module(`  const body = await context.read("shared.ts");
  emit({ code: "read", message: \`\${body.trim().length}:\${${token}}\`, severity: "warning" });`),
  );
  try {
    const at = path.join(root, "shared.ts");
    // One timestamp, pinned before either run so both writes carry it exactly.
    // Restoring afterwards is not enough: `utimes` keeps whole milliseconds and
    // a fresh write does not, so putting the clock back would itself change the
    // stamp and the test would prove nothing about size.
    const frozen = new Date(1_700_000_000_000);

    writeFileSync(at, "export const s = 1;\n");
    utimesSync(at, frozen, frozen);
    // The rule reads it, so it must be governed; declare it rather than ignore
    // it, since `read` refuses an ungoverned path.
    writeFileSync(path.join(root, "espalier", "shared.ts.mjs"), EMITS);

    assert.equal(lint(root, "first")["a.ts"], "19:first");
    assert.equal(lint(root, "second")["a.ts"], "19:first", "replayed");

    // Rewritten to a different length under the same modification time. The
    // documented hole is a same-second edit to the *same* length, so a
    // different length has to be caught by size alone.
    writeFileSync(at, "export const s = 1234567;\n");
    utimesSync(at, frozen, frozen);
    assert.equal(statSync(at).mtimeMs, frozen.getTime(), "the test did not pin the timestamp");

    assert.equal(lint(root, "third")["a.ts"], "25:third");
  } finally {
    discard(root);
  }
});

test("a read is invalidated by modification time, not only by size", () => {
  const root = repository(
    module(`  const body = await context.read("shared.ts");
  emit({ code: "read", message: \`\${body.trim()}:\${${token}}\`, severity: "warning" });`),
  );
  try {
    const at = path.join(root, "shared.ts");
    writeFileSync(at, "export const s = 1;\n");
    writeFileSync(path.join(root, "espalier", "shared.ts.mjs"), EMITS);

    assert.equal(lint(root, "first")["a.ts"], "export const s = 1;:first");
    assert.equal(lint(root, "second")["a.ts"], "export const s = 1;:first", "replayed");

    // The mirror of the test above: same length, different content, so only the
    // modification time separates the two. Dropping size from the stamp fails
    // that one; dropping the time fails this one. Neither half is redundant,
    // and the documented hole — a same-second edit to the same length — is
    // exactly where both of them stop.
    writeFileSync(at, "export const s = 2;\n");
    utimesSync(at, new Date(1_700_000_000_000), new Date(1_700_000_000_000));

    assert.equal(lint(root, "third")["a.ts"], "export const s = 2;:third");
  } finally {
    discard(root);
  }
});

test("structural findings are fresh on a warm run", () => {
  const root = repository();
  try {
    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });

    // A file no rule reads and no glob lists: nothing in the cache depends on
    // it, so a run that trusted the cache for everything would not report it.
    // "Ownership resolution reads no file contents and runs in full every
    // time" is what makes that impossible.
    writeFileSync(path.join(root, "notes.txt"), "loose\n");

    const second = run(root, "second");
    assert.equal(second.status, 1);
    assert.deepEqual(
      second.issues.filter((issue) => issue["code"] === "unexpected_path").map((i) => i["path"]),
      ["notes.txt"],
    );
    // And the rules that did not change were still replayed.
    assert.deepEqual(
      second.issues.filter((issue) => issue["code"] === "token").map((i) => i["message"]),
      ["first", "first"],
    );
  } finally {
    discard(root);
  }
});

// The espalier key, one component at a time. "Any change under `root`, or to
// the config, discards the cache entirely" is a single comparison covering
// several things, and a comparison that quietly stopped covering one of them
// would still pass every test that changes a rule module.

test("an added rule module discards the cache", () => {
  const root = repository();
  try {
    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });
    // A module that owns nothing here — dynamic, so it requires no file to
    // exist. What changed is the espalier, and the espalier is all-or-nothing.
    writeFileSync(path.join(root, "espalier", "[note].md.mjs"), EMITS);
    assert.deepEqual(lint(root, "second"), { "a.ts": "second", "b.ts": "second" });
  } finally {
    discard(root);
  }
});

test("a deleted rule module discards the cache", () => {
  const root = repository();
  try {
    writeFileSync(path.join(root, "espalier", "[note].md.mjs"), EMITS);
    lint(root, "first");
    assert.deepEqual(lint(root, "second"), { "a.ts": "first", "b.ts": "first" }, "replayed");

    rmSync(path.join(root, "espalier", "[note].md.mjs"));
    assert.deepEqual(lint(root, "third"), { "a.ts": "third", "b.ts": "third" });
  } finally {
    discard(root);
  }
});

test("edited prose discards the cache, though no rule changed", () => {
  const root = repository();
  try {
    writeFileSync(
      path.join(root, "espalier", "ESPALIER.MD"),
      "---\ndescription: the repository\n---\n\nProse.\n",
    );
    lint(root, "first");
    assert.deepEqual(lint(root, "second"), { "a.ts": "first", "b.ts": "first" }, "replayed");

    // Nothing a rule does depends on this. Telling it apart from a rule edit
    // would mean walking the module graph, and the trade is stated: the
    // architect changes the espalier far less often than the repository
    // changes under it.
    writeFileSync(
      path.join(root, "espalier", "ESPALIER.MD"),
      "---\ndescription: the repository\n---\n\nDifferent prose.\n",
    );
    assert.deepEqual(lint(root, "third"), { "a.ts": "third", "b.ts": "third" });
  } finally {
    discard(root);
  }
});

test("a dotfile under the espalier root is not part of the key", () => {
  const root = repository();
  try {
    lint(root, "first");
    // "`listEntries` skips dotfiles, so the cache is never part of its own
    // key." The cache is written *into* the espalier root, so a key that read
    // everything there could never match itself twice — the first warm run
    // would discard the file it had just written.
    writeFileSync(path.join(root, "espalier", ".DS_Store"), "junk\n");
    assert.deepEqual(lint(root, "second"), { "a.ts": "first", "b.ts": "first" });
  } finally {
    discard(root);
  }
});

test("an ignore file that appears discards the cache", () => {
  const root = repository();
  try {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\nignoreFiles:\n  - .espalierignore\n",
    );
    writeFileSync(path.join(root, ".espalierignore"), "");
    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });
    assert.deepEqual(lint(root, "second"), { "a.ts": "first", "b.ts": "first" }, "replayed");

    writeFileSync(path.join(root, ".espalierignore"), "b.ts\n");
    // `b.ts` is now ungoverned, so only `a.ts` is left — and it ran again.
    assert.deepEqual(lint(root, "third"), { "a.ts": "third" });
  } finally {
    discard(root);
  }
});

test("a cache with one unreadable line is discarded entirely", () => {
  const root = repository();
  try {
    lint(root, "first");
    const at = path.join(root, CACHE);
    const lines = readFileSync(at, "utf8").split("\n").filter((line) => line !== "");
    // Header intact, one entry mangled. Half a cache is not a cache: the
    // entries it still holds cannot be told from the ones it lost, so a run
    // that kept the readable half would replay a subset it could not name.
    writeFileSync(at, `${lines[0]}\n${lines[1]}\n{"rule":\n`);

    assert.deepEqual(lint(root, "second"), { "a.ts": "second", "b.ts": "second" });
  } finally {
    discard(root);
  }
});

test("an empty cache file is not an error", () => {
  const root = repository();
  try {
    lint(root, "first");
    writeFileSync(path.join(root, CACHE), "");
    assert.deepEqual(lint(root, "second"), { "a.ts": "second", "b.ts": "second" });
  } finally {
    discard(root);
  }
});

test("an edit to an ungoverned file leaves every entry replayed", () => {
  const root = repository();
  try {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    writeFileSync(path.join(root, ".espalierignore"), "notes.txt\n");
    writeFileSync(path.join(root, "notes.txt"), "one\n");
    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });

    // The key is deliberately coarse over the espalier and deliberately narrow
    // over the repository. Nothing stamps an ignored path — which is the same
    // reason `read` refuses one.
    writeFileSync(path.join(root, "notes.txt"), "two\n");
    assert.deepEqual(
      lint(root, "second"),
      { "a.ts": "first", "b.ts": "first" },
      "an ungoverned edit invalidated the cache",
    );
  } finally {
    discard(root);
  }
});

test("the file being linted is a dependency whether or not the rule read it", () => {
  const root = repository();
  try {
    assert.deepEqual(lint(root, "first"), { "a.ts": "first", "b.ts": "first" });

    // This rule never calls `read`. It still must not keep its verdict about a
    // file that changed underneath it: its contents are what the rule was asked
    // about, and a rule that answered without looking is still answering about
    // that file. `b.ts` replays, so the invalidation is per invocation rather
    // than a discarded cache.
    writeFileSync(path.join(root, "a.ts"), "export const a = 999;\n");
    assert.deepEqual(lint(root, "second"), { "a.ts": "second", "b.ts": "first" });
  } finally {
    discard(root);
  }
});

// Listing dependencies. "A `files` glob depends on which paths exist, not on
// what is in them" is two claims, and the negative half — that editing a
// sibling changes nothing — is the one a digest over contents would break
// while every other test still passed.

const PEERS = module(`  const seen = await context.files("*.ts");
  emit({ code: "peers", message: \`\${seen.join(",")}:\${${token}}\`, severity: "warning" });`);

test("editing a sibling does not invalidate a peer comparison", () => {
  const root = repository(PEERS);
  try {
    assert.equal(lint(root, "first")["a.ts"], "a.ts,b.ts:first");

    // `b.ts` is in the list `a.ts` depends on. Its contents are not.
    writeFileSync(path.join(root, "b.ts"), "export const b = 999;\n");
    // `b.ts` itself re-runs — it is the file being linted — but `a.ts`, which
    // only listed it, keeps its answer.
    assert.equal(lint(root, "second")["a.ts"], "a.ts,b.ts:first");
  } finally {
    discard(root);
  }
});

test("a glob that matched nothing notices when it starts matching", () => {
  const root = repository(
    module(`  const seen = await context.files("generated/*.ts");
  emit({ code: "peers", message: \`\${seen.length}:\${${token}}\`, severity: "warning" });`),
  );
  try {
    assert.equal(lint(root, "first")["a.ts"], "0:first");
    assert.equal(lint(root, "second")["a.ts"], "0:first", "replayed");

    // An empty list is a recorded answer, not an absent dependency. A cache
    // that only stamped globs with results would replay this one forever.
    mkdirSync(path.join(root, "generated"));
    mkdirSync(path.join(root, "espalier", "generated"));
    writeFileSync(path.join(root, "generated", "x.ts"), "export const x = 1;\n");
    writeFileSync(path.join(root, "espalier", "generated", "[name].ts.mjs"), EMITS);
    assert.equal(lint(root, "third")["a.ts"], "1:third");
  } finally {
    discard(root);
  }
});

// Constraints. A constraint is invoked through the same path a structural rule
// is, and is cached under its own module and pattern — so a file carries one
// entry per rule that ran on it, not one entry. Nothing above reaches a
// constraint, because every module those tests install is structural.

/** A constraint over every `.ts` file, beside whatever rule owns the file. */
function constraint(body: string): string {
  return `export const rule = \`Nothing this test cares about.\`;

export async function lint(context) {
  const { emit } = context;
${body}
}
`;
}

/** The two-file repository, with a constraint reaching both files. */
function constrained(rule: string, applies: string): string {
  const root = repository(rule);
  mkdirSync(path.join(root, "espalier", "[...path]"));
  writeFileSync(path.join(root, "espalier", "[...path]", "pinned.{ts}.mjs"), applies);
  return root;
}

/** Every issue on one path, as `rule` to message. */
function byRule(result: Run, target: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const issue of result.issues) {
    if (issue["path"] === target) found[issue["rule"] as string] = issue["message"] as string;
  }
  return found;
}

test("a constraint replays, under its own key", () => {
  const root = constrained(
    EMITS,
    constraint(`  emit({ code: "held", message: ${token}, severity: "warning" });`),
  );
  try {
    const first = run(root, "first");
    assert.deepEqual(byRule(first, "a.ts"), {
      "[file].ts.mjs": "first",
      "[...path]/pinned.{ts}.mjs": "first",
    });

    // Two invocations on one file, cached apart. A cache keyed by path alone
    // would replay one of them and drop the other.
    assert.deepEqual(byRule(run(root, "second"), "a.ts"), {
      "[file].ts.mjs": "first",
      "[...path]/pinned.{ts}.mjs": "first",
    });
    assert.deepEqual(entries(root), ["a.ts", "a.ts", "b.ts", "b.ts"]);
  } finally {
    discard(root);
  }
});

test("an edited file re-runs the constraints on it, not only its own rule", () => {
  const root = constrained(
    EMITS,
    constraint(`  emit({ code: "held", message: ${token}, severity: "warning" });`),
  );
  try {
    run(root, "first");
    writeFileSync(path.join(root, "a.ts"), "export const a = 999;\n");

    const second = run(root, "second");
    assert.deepEqual(
      byRule(second, "a.ts"),
      { "[file].ts.mjs": "second", "[...path]/pinned.{ts}.mjs": "second" },
      "the constraint replayed against a file that had changed under it",
    );
    assert.deepEqual(byRule(second, "b.ts"), {
      "[file].ts.mjs": "first",
      "[...path]/pinned.{ts}.mjs": "first",
    });
  } finally {
    discard(root);
  }
});

test("a constraint's own listing is a dependency", () => {
  const root = constrained(
    EMITS,
    constraint(`  const seen = await context.files("*.md");
  emit({ code: "held", message: \`\${seen.length}:\${${token}}\`, severity: "warning" });`),
  );
  try {
    writeFileSync(path.join(root, "espalier", "[note].md.mjs"), EMITS);
    assert.equal(byRule(run(root, "first"), "a.ts")["[...path]/pinned.{ts}.mjs"], "0:first");

    // Nothing about `a.ts` changed. What the constraint looked at did, and it
    // is the constraint's entry that has to notice.
    writeFileSync(path.join(root, "notes.md"), "# notes\n");
    assert.equal(byRule(run(root, "second"), "a.ts")["[...path]/pinned.{ts}.mjs"], "1:second");
    assert.equal(
      byRule(run(root, "third"), "a.ts")["[file].ts.mjs"],
      "first",
      "the file's own rule re-ran over a listing it never made",
    );
  } finally {
    discard(root);
  }
});

test("one changed glob re-runs an invocation that listed two", () => {
  const root = repository(
    module(`  const ts = await context.files("*.ts");
  const md = await context.files("*.md");
  emit({ code: "peers", message: \`\${ts.length}/\${md.length}:\${${token}}\`, severity: "warning" });`),
  );
  try {
    writeFileSync(path.join(root, "espalier", "[note].md.mjs"), EMITS);
    assert.equal(lint(root, "first")["a.ts"], "2/0:first");

    writeFileSync(path.join(root, "notes.md"), "# notes\n");
    assert.equal(lint(root, "second")["a.ts"], "2/1:second");
  } finally {
    discard(root);
  }
});

test("a glob never sees an ignored path, so one appearing changes nothing", () => {
  const root = repository(PEERS);
  try {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    writeFileSync(path.join(root, ".espalierignore"), "vendor/\n");
    assert.equal(lint(root, "first")["a.ts"], "a.ts,b.ts:first");

    // "`files` never returns one — an ignored or invisible path is one nothing
    // stamps, so a rule that depended on one would be replayed unchanged after
    // it changed." The list is the same list, so the entry stands.
    mkdirSync(path.join(root, "vendor"));
    writeFileSync(path.join(root, "vendor", "c.ts"), "export const c = 1;\n");
    assert.equal(lint(root, "second")["a.ts"], "a.ts,b.ts:first");
  } finally {
    discard(root);
  }
});

// The file itself: header, directory, and what a run leaves behind.

test("a header that is not this tool's is discarded", () => {
  const root = repository();
  try {
    lint(root, "first");
    const lines = readFileSync(path.join(root, CACHE), "utf8").split("\n");
    // Valid JSON, valid entries, and no claim to be a cache. Anything may end
    // up at this path; only a line that says what it is may be trusted.
    writeFileSync(
      path.join(root, CACHE),
      [JSON.stringify({ kind: "notes", version: 1 }), ...lines.slice(1)].join("\n"),
    );
    assert.deepEqual(lint(root, "second"), { "a.ts": "second", "b.ts": "second" });
  } finally {
    discard(root);
  }
});

test("a cache holding only a header is a cold run", () => {
  const root = repository();
  try {
    lint(root, "first");
    const header = readFileSync(path.join(root, CACHE), "utf8").split("\n")[0]!;
    writeFileSync(path.join(root, CACHE), `${header}\n`);
    assert.deepEqual(lint(root, "second"), { "a.ts": "second", "b.ts": "second" });
    // And it refills, rather than staying empty.
    assert.deepEqual(entries(root), ["a.ts", "b.ts"]);
  } finally {
    discard(root);
  }
});

test("the cache directory is created, and only when there is something to put in it", () => {
  const root = repository();
  try {
    assert.equal(existsSync(path.join(root, "espalier", ".cache")), false, "created too early");
    lint(root, "first");
    assert.ok(existsSync(path.join(root, CACHE)));
  } finally {
    discard(root);
  }
});

test("a warm run rewrites the cache to the same bytes", () => {
  const root = repository();
  try {
    lint(root, "first");
    const after = readFileSync(path.join(root, CACHE), "utf8");
    lint(root, "second");
    // Nothing changed, so nothing about the record should change either. Churn
    // here would be a reordering or a re-stamp, and either means the file is
    // recording something other than what it claims to.
    assert.equal(readFileSync(path.join(root, CACHE), "utf8"), after);
  } finally {
    discard(root);
  }
});

// Nesting. Each espalier keys on its own tree, so a change in one must not
// reach the other's cache — in either direction. A shared key would be the
// expensive kind of wrong: correct answers, silently recomputed forever.

/** A repository with a child espalier in `packages/web`. */
function nested(): { root: string; child: string } {
  const root = repository();
  const child = path.join(root, "packages", "web");
  mkdirSync(path.join(child, "espalier"), { recursive: true });
  writeFileSync(path.join(child, "espalier.config.yaml"), "version: 1\npin: 0.1.0\nroot: espalier\n");
  writeFileSync(path.join(child, "espalier", "[file].ts.mjs"), EMITS);
  writeFileSync(path.join(child, "c.ts"), "export const c = 3;\n");
  return { root, child };
}

test("a parent espalier edit leaves the child's cache standing", () => {
  const { root, child } = nested();
  try {
    lint(root, "first");
    writeFileSync(path.join(root, "espalier", "[note].md.mjs"), EMITS);

    assert.deepEqual(lint(root, "second"), {
      "a.ts": "second",
      "b.ts": "second",
      "packages/web/c.ts": "first",
    });
    void child;
  } finally {
    discard(root);
  }
});

test("a child espalier edit leaves the parent's cache standing", () => {
  const { root, child } = nested();
  try {
    lint(root, "first");
    writeFileSync(path.join(child, "espalier", "[note].md.mjs"), EMITS);

    assert.deepEqual(lint(root, "second"), {
      "a.ts": "first",
      "b.ts": "first",
      "packages/web/c.ts": "second",
    });
  } finally {
    discard(root);
  }
});

test("--no-cache reaches every espalier in the run", () => {
  const { root } = nested();
  try {
    lint(root, "first");
    const before = readFileSync(path.join(root, CACHE), "utf8");

    assert.deepEqual(lint(root, "second", ["--no-cache"]), {
      "a.ts": "second",
      "b.ts": "second",
      "packages/web/c.ts": "second",
    });
    // "does the work regardless and writes nothing" — in the child as well as
    // here, or a hook that distrusts the cache would still be trusting one.
    assert.equal(readFileSync(path.join(root, CACHE), "utf8"), before);
  } finally {
    discard(root);
  }
});

// Scoping, which is where merging matters: a narrowed run sees part of the
// repository and must leave its record of the rest exactly as it found it.

test("a scoped run records what it visited for the first time", () => {
  const root = repository();
  try {
    lint(root, "first");
    writeFileSync(path.join(root, "c.ts"), "export const c = 3;\n");

    // Scoped to the new file alone. Its entry has to arrive, or the next full
    // run pays for it again — and the run after that, forever.
    run(root, "second", ["c.ts"]);
    assert.deepEqual(entries(root), ["a.ts", "b.ts", "c.ts"]);

    assert.deepEqual(lint(root, "third"), { "a.ts": "first", "b.ts": "first", "c.ts": "second" });
  } finally {
    discard(root);
  }
});

test("a scope that matches nothing leaves the cache exactly as it was", () => {
  const root = repository();
  try {
    lint(root, "first");
    const before = readFileSync(path.join(root, CACHE), "utf8");

    run(root, "second", ["does/not/exist"]);
    assert.equal(readFileSync(path.join(root, CACHE), "utf8"), before);
  } finally {
    discard(root);
  }
});

test("a scoped run does not prune what a later full run still wants", () => {
  const root = repository();
  try {
    lint(root, "first");
    rmSync(path.join(root, "b.ts"));

    // Scoped, so no pruning: `b.ts` is gone from the repository but its entry
    // is not this run's to drop, because this run never looked for it.
    run(root, "second", ["a.ts"]);
    assert.deepEqual(entries(root), ["a.ts", "b.ts"]);

    // The full run is the one that decides.
    lint(root, "third");
    assert.deepEqual(entries(root), ["a.ts"]);
  } finally {
    discard(root);
  }
});

// What a failure leaves behind. A cache damaged by a run that could not finish
// is worse than no cache: it survives, and it is wrong.

test("a failing run leaves the previous cache intact", () => {
  const root = repository();
  try {
    lint(root, "first");
    const before = readFileSync(path.join(root, CACHE), "utf8");

    // A rule that throws is an operational failure, and the run reports
    // nothing else. What it must also not do is take the record with it.
    writeFileSync(
      path.join(root, "espalier", "[file].ts.mjs"),
      module(`  throw new Error("from the rule");`),
    );
    assert.equal(run(root, "second").status, 2);
    assert.equal(readFileSync(path.join(root, CACHE), "utf8"), before);
  } finally {
    discard(root);
  }
});

test("a replayed issue carries its position and metadata", () => {
  const root = repository(
    module(`  emit({
    code: "positioned",
    message: ${token},
    severity: "warning",
    line: 12,
    column: 3,
    metadata: { nested: { depth: 2 }, list: ["a", "b"] },
  });`),
  );
  try {
    const cold = run(root, "first").issues.find((issue) => issue["path"] === "a.ts")!;
    const warm = run(root, "second").issues.find((issue) => issue["path"] === "a.ts")!;

    // Everything `emit` was given, through a JSON round trip and back out.
    // Both formats are identical warm and cold, and that has to include the
    // fields nothing else in the suite looks at.
    assert.deepEqual(warm, cold);
    assert.equal(warm["line"], 12);
    assert.equal(warm["column"], 3);
    assert.deepEqual(warm["metadata"], { nested: { depth: 2 }, list: ["a", "b"] });
  } finally {
    discard(root);
  }
});

test("an issue attached to another file replays against that file", () => {
  const root = repository(
    module(`  if (context.path !== "a.ts") return;
  emit({ code: "elsewhere", message: ${token}, severity: "warning", path: "b.ts" });`),
  );
  try {
    // The entry is keyed by the invocation, not by the path the issue landed
    // on. Replaying it has to put the issue back where the rule sent it.
    assert.deepEqual(lint(root, "first"), { "b.ts": "first" });
    assert.deepEqual(lint(root, "second"), { "b.ts": "first" });

    // And editing the file the issue points at does not re-run the rule that
    // emitted it: `a.ts` is what that invocation depended on.
    writeFileSync(path.join(root, "b.ts"), "export const b = 999;\n");
    assert.deepEqual(lint(root, "third"), { "b.ts": "first" });
  } finally {
    discard(root);
  }
});
