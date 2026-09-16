// What counts as a file. docs/CONFIG.MD "What counts as a file".
//
// The fixtures cover which paths a run reports; none of them can see whether an
// ignored directory was entered on the way to not reporting it. That is the
// whole reason candidacy takes the ignore rules at all, so it is asserted here
// against a tree whose ignored directory is unreadable: entering it throws, and
// a walk that does not enter it cannot.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { OperationalError } from "../src/errors.js";
import { collectCandidates } from "../src/files.js";
import { compileIgnore } from "../src/ignore.js";
import { compileVisibility, hiddenBy } from "../src/visibility.js";
import { VERSION } from "../src/version.js";

function tree(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-walk-"));
  mkdirSync(path.join(root, "src"));
  mkdirSync(path.join(root, "vendor", "deep"), { recursive: true });
  writeFileSync(path.join(root, "src", "a.ts"), "");
  writeFileSync(path.join(root, "vendor", "deep", "b.ts"), "");
  writeFileSync(path.join(root, "top.ts"), "");
  return root;
}

test("an ignored directory is never entered", () => {
  const root = tree();
  const closed = path.join(root, "vendor");
  try {
    // Nothing inside can be listed. A walk that enumerated first and filtered
    // afterwards would throw here; one that prunes on the way down never looks.
    chmodSync(closed, 0o000);

    assert.deepEqual(collectCandidates(root, compileIgnore(["vendor/"])), ["src/a.ts", "top.ts"]);
  } finally {
    chmodSync(closed, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

test("a negation cannot re-include what was pruned", () => {
  const root = tree();
  try {
    // Git has the same limitation and documents it. Stating it as a test means
    // the day it changes is a decision rather than an accident.
    const rules = compileIgnore(["vendor/", "!vendor/deep/b.ts"]);
    assert.deepEqual(collectCandidates(root, rules), ["src/a.ts", "top.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no rules means every file", () => {
  const root = tree();
  try {
    assert.deepEqual(collectCandidates(root, []), [
      "src/a.ts",
      "top.ts",
      "vendor/deep/b.ts",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ignored file is still a candidate", () => {
  const root = tree();
  try {
    // Only directories are pruned. A file that `ignore` matches is excluded by
    // `ungoverned`, one gate later, because that is the gate `explain` reports
    // from — pruning it here would leave nothing to explain.
    assert.deepEqual(collectCandidates(root, compileIgnore(["top.ts"])), [
      "src/a.ts",
      "top.ts",
      "vendor/deep/b.ts",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("external ignore files remove paths before Espalier exclusions", () => {
  const root = tree();
  try {
    writeFileSync(path.join(root, ".gitignore"), "*.log\n");
    writeFileSync(path.join(root, "hidden.log"), "");
    writeFileSync(path.join(root, "src", "hidden.log"), "");
    writeFileSync(path.join(root, "src", "keep.log"), "");
    writeFileSync(path.join(root, "src", ".gitignore"), "!keep.log\n");

    const visibility = [compileVisibility(["*.log"], ".gitignore")];
    const candidates = collectCandidates(
        root,
        [],
        undefined,
        undefined,
        undefined,
        visibility,
        (absolute, at) => {
          const filename = path.join(absolute, ".gitignore");
          if (!existsSync(filename)) return [];
          return [
            compileVisibility(readFileSync(filename, "utf8").split("\n"), `${at}/.gitignore`, at),
          ];
        },
      );
    assert.deepEqual(candidates, [
      ".gitignore",
      "src/.gitignore",
      "src/a.ts",
      "src/keep.log",
      "top.ts",
      "vendor/deep/b.ts",
    ]);

    assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
    for (const candidate of ["hidden.log", "src/hidden.log", "src/keep.log"]) {
      const git = spawnSync(
        "git",
        ["-c", "core.excludesFile=/dev/null", "check-ignore", "-q", "--", candidate],
        { cwd: root },
      );
      assert.equal(
        candidates.includes(candidate),
        git.status !== 0,
        `${candidate}: Espalier and git disagree about visibility`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("external ignore files use gitignore pattern semantics", () => {
  const visibility = [
    compileVisibility(["report-[0-9].log", "literal\\!.txt"], ".gitignore"),
  ];
  assert.equal(hiddenBy(visibility, "report-4.log")?.origin, ".gitignore");
  assert.equal(hiddenBy(visibility, "report-x.log"), null);
  assert.equal(hiddenBy(visibility, "literal!.txt")?.origin, ".gitignore");
});

// Symlinks. docs/CONFIG.MD "Symlinks". The fixtures cover what a run reports
// about a link; what they cannot show is a link the rules excused before it was
// resolved, or a directory that will not open at all — neither of which survives
// being committed to git.

test("a link the rules exclude is never resolved", () => {
  const root = tree();
  try {
    symlinkSync("./nowhere.ts", path.join(root, "dangling.ts"));

    // Resolving it would fail the run, and an ignored path is never read. Both
    // interpretations are consulted, because which one applies is exactly what
    // resolving would have answered: a link nobody can fix must stay
    // excludable, and `init` cannot write the entry that excuses it if the
    // walk refuses first.
    assert.deepEqual(collectCandidates(root, compileIgnore(["dangling.ts"])), [
      "src/a.ts",
      "top.ts",
      "vendor/deep/b.ts",
    ]);

    assert.throws(
      () => collectCandidates(root, []),
      (error: unknown) =>
        error instanceof OperationalError && error.code === "unreadable_path",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("init passes over a link it cannot follow", () => {
  const root = bare();
  try {
    symlinkSync("./gone.ts", path.join(root, "dangling.ts"));

    // `init` proposes rather than pronounces, so a link nothing can follow is
    // not something to infer an entry from — and refusing to run would be
    // refusing to write the `ignore` entry that excuses it. docs/CONFIG.MD
    // "Symlinks".
    const written = espalier(root, ["init", "--no-ignore-file", "--ignore-all"]);
    assert.equal(written.status, 0);

    const excluded = readFileSync(path.join(root, ".espalierignore"), "utf8");
    assert.ok(excluded.includes("main.ts"), "the real file was not listed");
    assert.ok(!excluded.includes("dangling"), "a link to nowhere was listed as a path");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a directory that will not open is a failure, not a bug report", () => {
  const root = tree();
  const closed = path.join(root, "vendor");
  try {
    chmodSync(closed, 0o000);

    // Before, this escaped as whatever `readdir` threw and was classified
    // `internal_error` — "please open an issue" — about a condition an `ignore`
    // entry fixes. The exit code was right and the guidance was not.
    assert.throws(
      () => collectCandidates(root, []),
      (error: unknown) =>
        error instanceof OperationalError && error.code === "unreadable_path",
    );
  } finally {
    chmodSync(closed, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

test("a linked directory is walked, and a cycle is not", () => {
  const root = tree();
  try {
    symlinkSync("../vendor", path.join(root, "src", "vendored"));
    // Two paths reach one file, and both of them exist: the link is reported
    // under the link, the original under the original. Deduplicating to
    // whichever the walk arrived by first would make the answer depend on the
    // order a `readdir` returned, which is not an order anything promises.
    symlinkSync("..", path.join(root, "src", "up"));

    assert.deepEqual(collectCandidates(root, []), [
      "src/a.ts",
      "src/vendored/deep/b.ts",
      "top.ts",
      "vendor/deep/b.ts",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// `ignoreFiles` and `--lang`: the parts that decide what a config says before
// any of the above runs. docs/CONFIG.MD "ignoreFiles", cli/init/README.MD.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cli = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), "dist", "src", "cli.js");

function espalier(root: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

function bare(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-init-"));
  writeFileSync(path.join(root, "main.ts"), "");
  return root;
}

test("a config that names no ignore file reads none", () => {
  const root = bare();
  try {
    mkdirSync(path.join(root, "espalier"));
    // Present, and deliberately not named. `ignoreFiles` is empty by default,
    // so a hand-written config assumes nothing and a `.gitignore` sitting in
    // the repository does not quietly become policy.
    writeFileSync(path.join(root, ".gitignore"), "main.ts\n.gitignore\n");
    writeFileSync(path.join(root, "espalier.config.yaml"), "version: 1\npin: 0.1.0\nroot: espalier\n");

    const run = espalier(root, ["lint", "--format", "jsonl"]);
    assert.equal(run.status, 1);
    assert.match(run.stdout, /unexpected_path/);
    assert.match(run.stdout, /main\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("init --lang writes the shipped list, and refuses an unknown one", () => {
  const root = bare();
  try {
    const bad = espalier(root, ["init", "--no-ignore-file", "--lang", "cobol", "--format", "jsonl"]);
    assert.equal(bad.status, 2);
    assert.match(bad.stdout, /"code":"unknown_language"/);
    // The available names come from the directory, not from a second copy of
    // the taxonomy that could drift from it.
    assert.match(bad.stdout, /javascript/);

    assert.equal(espalier(root, ["init", "--no-ignore-file", "-l", "go", "-l", "python"]).status, 0);
    const config = readFileSync(path.join(root, "espalier.config.yaml"), "utf8");
    assert.ok(config.includes(`pin: ${VERSION}`), "init did not pin the running CLI version");
    assert.ok(config.includes("ignoreFiles:"), "init wrote no ignoreFiles decision");
    const excluded = readFileSync(path.join(root, ".espalierignore"), "utf8");
    for (const entry of [".git/", "go.mod", "pyproject.toml"]) {
      assert.ok(excluded.includes(entry), `init -l go -l python did not write "${entry}"`);
    }
    assert.ok(!excluded.includes("package.json"), "init wrote a list nobody asked for");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every shipped list parses, and none is empty", () => {
  const directory = fileURLToPath(new URL("../../ignores/", import.meta.url));
  const files = readdirSync(directory).filter((name) => name.endsWith(".gitignore"));
  assert.ok(files.length > 1, "no shipped ignore lists found");

  for (const name of files) {
    const patterns = readFileSync(path.join(directory, name), "utf8").split("\n");
    const rules = compileIgnore(patterns);
    assert.ok(rules.length > 0, `${name} contributes no patterns`);
    // A stray `*` or `!` would parse here and break the YAML `init` writes, so
    // the round trip is what matters rather than the parse alone.
    for (const rule of rules) assert.equal(typeof rule.pattern, "string");
  }
});

// `init` reading `.gitignore` cannot be a fixture: git honours a fixture's own
// `.gitignore` too, so the files it excludes would never reach a clone. The
// fixtures that need one name it `.gitignore.fixture` and say so in
// `ignoreFiles`, which leaves the real filename to be exercised here, in a
// temporary directory git never sees.

test("init refuses to claim an ignore file that is not there", () => {
  const root = bare();
  try {
    // The default. Nothing is written: a config naming a file it does not have
    // would govern everything while looking correct.
    const missing = espalier(root, ["init", "--format", "jsonl"]);
    assert.equal(missing.status, 2);
    assert.match(missing.stdout, /"code":"ignore_file_missing"/);
    assert.match(missing.stdout, /--no-ignore-file/);
    assert.equal(existsSync(path.join(root, "espalier.config.yaml")), false);

    // A named one is held to the same rule, for the same reason: `-i .gitignor`
    // is a typo that would otherwise cost a repository its exclusions.
    assert.equal(espalier(root, ["init", "-i", ".nope", "--format", "jsonl"]).status, 2);
    assert.equal(existsSync(path.join(root, "espalier.config.yaml")), false);

    const both = espalier(root, ["init", "--no-ignore-file", "-i", ".x", "--format", "jsonl"]);
    assert.equal(both.status, 2);
    assert.match(both.stdout, /"code":"contradictory_flags"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("init records the ignore-file decision either way", () => {
  const declined = bare();
  const named = bare();
  try {
    assert.equal(espalier(declined, ["init", "--no-ignore-file"]).status, 0);
    const empty = readFileSync(path.join(declined, "espalier.config.yaml"), "utf8");
    // Written, not omitted. An absent key reads as a question nobody answered.
    assert.match(empty, /^ignoreFiles: \[\]$/m);

    writeFileSync(path.join(named, ".gitignore"), "dist/\n");
    assert.equal(espalier(named, ["init"]).status, 0);
    assert.match(
      readFileSync(path.join(named, "espalier.config.yaml"), "utf8"),
      /^ignoreFiles:\n {2}- \.gitignore$/m,
    );

    // The common block lands in both, in the file beside the config:
    // `.gitignore` never names `.git/`.
    for (const at of [declined, named]) {
      assert.ok(readFileSync(path.join(at, ".espalierignore"), "utf8").includes(".git/"));
    }
  } finally {
    rmSync(declined, { recursive: true, force: true });
    rmSync(named, { recursive: true, force: true });
  }
});

test("a config naming an ignore file that is gone fails every command", () => {
  const root = bare();
  try {
    mkdirSync(path.join(root, "espalier"));
    writeFileSync(path.join(root, ".gitignore"), "dist/\n");
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\nignoreFiles:\n  - .gitignore\n",
    );
    assert.equal(espalier(root, ["lint"]).status, 1, "a present ignore file stopped the run");

    // The rule outlives `init`. A deleted file is the same claim broken later.
    rmSync(path.join(root, ".gitignore"));
    const run = espalier(root, ["lint", "--format", "jsonl"]);
    assert.equal(run.status, 2);
    assert.match(run.stdout, /"code":"ignore_file_missing"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file ignoreFiles names is invisible, not merely ignored", () => {
  const root = bare();
  try {
    mkdirSync(path.join(root, "espalier"));
    writeFileSync(path.join(root, ".customignore"), "dist/\n");
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\nignoreFiles:\n  - .customignore\n",
    );
    writeFileSync(path.join(root, ".espalierignore"), "main.ts\n");

    // It is configuration this run read, so it answers `espalier` rather than
    // `ignore`, and a project naming a custom file does not have to ignore it
    // as well. With the default name the common list hid this.
    const shown = espalier(root, ["explain", ".customignore", "--format", "jsonl"]);
    assert.equal(shown.status, 1);
    assert.match(shown.stdout, /"ignoredBy":"espalier"/);
    assert.equal(espalier(root, ["lint"]).status, 0, "an ignore file was reported");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explain and lint agree about a path under a pruned directory", () => {
  const root = bare();
  try {
    mkdirSync(path.join(root, "espalier"));
    mkdirSync(path.join(root, "vendor", "deep"), { recursive: true });
    writeFileSync(path.join(root, "vendor", "deep", "lib.ts"), "");
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    writeFileSync(
      path.join(root, ".espalierignore"),
      "main.ts\nvendor/\n!vendor/deep/lib.ts\n",
    );

    // The negation cannot win: `collectCandidates` never opens `vendor/`, so a
    // path it appeared to re-include would be one no run had looked at. Before
    // this, `explain` said "not declared" about a file `lint` could not see.
    const shown = espalier(root, ["explain", "vendor/deep/lib.ts", "--format", "jsonl"]);
    assert.equal(shown.status, 1);
    assert.match(shown.stdout, /"ignoredBy":"\.espalierignore"/);
    assert.equal(espalier(root, ["lint"]).status, 0, "lint reported a pruned path");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a back-reference needs every instance, not two of them", () => {
  const root = bare();
  try {
    mkdirSync(path.join(root, "espalier"));
    writeFileSync(path.join(root, ".gitignore"), "");
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\nignoreFiles:\n  - .gitignore\n",
    );
    writeFileSync(
      path.join(root, ".espalierignore"),
      "main.ts\n.gitignore\nsrc/**\n!src/clients/\n!src/clients/**\n",
    );

    // Two clients name a file after themselves; the third does not. That is
    // not a convention, so the honest answer is the optional leaves — a
    // back-reference here would report `missing_required_file` against `plain/`
    // the first time the espalier ran.
    const clients: [string, string][] = [
      ["stripe", "stripe.ts"],
      ["twilio", "twilio.ts"],
      ["plain", "index.ts"],
    ];
    for (const [directory, file] of clients) {
      mkdirSync(path.join(root, "src", "clients", directory), { recursive: true });
      writeFileSync(path.join(root, "src", "clients", directory, file), "");
      writeFileSync(path.join(root, "src", "clients", directory, "README.MD"), "");
    }

    assert.equal(espalier(root, ["adopt", "src/clients"]).status, 0);
    const written = readdirSync(path.join(root, "espalier", "src", "clients", "[client]")).sort();
    assert.deepEqual(written, ["README.MD.mjs", "index.ts.mjs", "stripe.ts.mjs", "twilio.ts.mjs"]);
    assert.match(
      readFileSync(path.join(root, "espalier", "src", "clients", "[client]", "stripe.ts.mjs"), "utf8"),
      /export const optional = true;/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
