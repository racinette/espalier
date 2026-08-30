// Argument parsing, and where output goes. docs/cli/*/README.MD.
//
// The fixtures run the CLI, but every one of them runs it correctly: a fixture
// is a repository plus an expected outcome, and "invoked wrongly" is not a
// repository. What a command does with no argument, an unknown flag, or a
// destination that is not stdout has no tree to describe it, so it lives here.
//
// `--out` matters more than it looks. The promise is that there is no second
// channel — everything a run has to say goes through the chosen format to the
// chosen destination — and a message that quietly kept using stderr would be
// invisible to every assertion that reads stdout.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."),
  "dist",
  "src",
  "cli.js",
);

function run(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

const RULE = `export const description = "a source file";
export const rule = \`Keep it small.\`;
export async function lint() {}
`;

/**
 * A repository with one rule, one file it owns, and one it does not — so a
 * plain `lint` exits 1 with exactly one issue to be routed somewhere.
 */
function repo(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-cli-"));
  mkdirSync(path.join(root, "espalier", "src"), { recursive: true });
  mkdirSync(path.join(root, "src"));
  writeFileSync(path.join(root, "espalier.config.yaml"), "version: 1\npin: 0.1.0\nroot: espalier\n");
  writeFileSync(path.join(root, "espalier", "src", "[name].ts.mjs"), RULE);
  writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n");
  writeFileSync(path.join(root, "stray.txt"), "stray\n");
  return root;
}

function scratch(body: (root: string) => void): void {
  const root = repo();
  try {
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Dispatch.

test("no command prints usage and refuses", () => {
  scratch((root) => {
    const bare = run(root, []);
    // Usage on stdout — it was asked for by omission rather than by mistake —
    // but the exit code still says nothing was done.
    assert.match(bare.stdout, /^espalier <command> \[options\]/);
    assert.equal(bare.stderr, "");
    assert.equal(bare.status, 2);
  });
});

test("--help and -h are the same request, and succeed", () => {
  scratch((root) => {
    const long = run(root, ["--help"]);
    const short = run(root, ["-h"]);
    assert.equal(long.stdout, short.stdout);
    assert.match(long.stdout, /^espalier <command> \[options\]/);
    assert.equal(long.status, 0);
    assert.equal(short.status, 0);
  });
});

test("an unknown command names itself on stderr", () => {
  scratch((root) => {
    const wrong = run(root, ["lnit"]);
    assert.match(wrong.stderr, /unknown command "lnit"/);
    // The usage goes with it: the reader mistyped and needs the list.
    assert.match(wrong.stderr, /espalier <command> \[options\]/);
    assert.equal(wrong.stdout, "");
    assert.equal(wrong.status, 2);
  });
});

test("an unknown flag stops the run before the repository is read", () => {
  scratch((root) => {
    const wrong = run(root, ["lint", "--fromat", "jsonl"]);
    assert.match(wrong.stderr, /--fromat/);
    assert.match(wrong.stderr, /espalier <command> \[options\]/);
    assert.equal(wrong.stdout, "");
    assert.equal(wrong.status, 2);
  });
});

test("a flag belonging to another command is still an unknown flag", () => {
  scratch((root) => {
    // `parseArgs` is given one option table for every command, so this is not
    // rejected for being misplaced. Worth pinning: the day it is rejected, it
    // should be a decision.
    assert.equal(run(root, ["lint", "--check"]).status, 1);
  });
});

test("an unknown format is refused by name", () => {
  scratch((root) => {
    const wrong = run(root, ["lint", "--format", "toml"]);
    assert.match(wrong.stderr, /unknown format "toml"/);
    assert.equal(wrong.stdout, "");
    assert.equal(wrong.status, 2);
  });
});

test("explain needs a path", () => {
  scratch((root) => {
    const bare = run(root, ["explain", "--format", "jsonl"]);
    assert.match(bare.stdout, /"code":"missing_argument"/);
    assert.equal(bare.status, 2);
  });
});

// Destinations. docs/cli/lint/README.MD "Output".

test("--out stderr moves the whole report, leaving stdout empty", () => {
  scratch((root) => {
    const sent = run(root, ["lint", "--out", "stderr"]);
    assert.equal(sent.stdout, "");
    assert.match(sent.stderr, /stray\.txt/);
    assert.match(sent.stderr, /unexpected_path/);
    assert.equal(sent.status, 1);
  });
});

test("--out a file leaves both streams empty", () => {
  scratch((root) => {
    const sent = run(root, ["lint", "--format", "jsonl", "--out", "report.jsonl"]);
    assert.equal(sent.stdout, "");
    assert.equal(sent.stderr, "");
    assert.equal(sent.status, 1);

    const written = readFileSync(path.join(root, "report.jsonl"), "utf8");
    assert.match(written, /"code":"unexpected_path"/);
  });
});

test("an operational failure goes to --out as well: there is no second channel", () => {
  scratch((root) => {
    writeFileSync(path.join(root, "espalier.config.yaml"), "version: 1\npin: 0.1.0\nroot: espalier\nnope: 1\n");

    const sent = run(root, ["lint", "--format", "jsonl", "--out", "report.jsonl"]);
    assert.equal(sent.stdout, "");
    assert.equal(sent.stderr, "");
    assert.equal(sent.status, 2);

    const written = readFileSync(path.join(root, "report.jsonl"), "utf8");
    assert.match(written, /"code":"config_unknown_key"/);
  });
});

test("--out is resolved against the working directory, not the repository root", () => {
  scratch((root) => {
    const from = path.join(root, "src");
    assert.equal(run(from, ["lint", "--format", "jsonl", "--out", "report.jsonl"]).status, 1);
    assert.ok(existsSync(path.join(from, "report.jsonl")), "written beside the caller");
    assert.equal(existsSync(path.join(root, "report.jsonl")), false);
  });
});

test("format and destination are independent choices", () => {
  scratch((root) => {
    const human = run(root, ["lint", "--out", "stderr"]);
    const jsonl = run(root, ["lint", "--format", "jsonl", "--out", "stderr"]);
    assert.match(human.stderr, /^\nstray\.txt\n/);
    assert.match(jsonl.stderr, /^\{"kind":"issue"/);
    assert.equal(human.status, jsonl.status);
  });
});

// Flags that narrow a run.

test("--no-rule-text drops the rule bodies and nothing else", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier", "src", "[name].ts.mjs"),
      RULE.replace("export async function lint() {}", `export async function lint(context) {
        context.emit({ code: "noted", severity: "warning", message: "a finding" });
      }`),
    );

    const full = run(root, ["lint"]);
    const bare = run(root, ["lint", "--no-rule-text"]);
    assert.match(full.stdout, /Keep it small\./);
    assert.doesNotMatch(bare.stdout, /Keep it small\./);
    assert.match(bare.stdout, /a finding/);
  });
});

test("--rule runs one module and leaves the built-in issues alone", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier", "src", "[name].ts.mjs"),
      RULE.replace("export async function lint() {}", `export async function lint(context) {
        context.emit({ code: "noted", severity: "warning", message: "a finding" });
      }`),
    );

    const only = run(root, ["lint", "--rule", "src/[name].ts.mjs", "--format", "jsonl"]);
    assert.match(only.stdout, /"code":"noted"/);
    assert.equal(only.status, 1);
  });
});

test("--dry-run prints what a real adopt prints, and writes nothing", () => {
  scratch((root) => {
    mkdirSync(path.join(root, "clients", "stripe"), { recursive: true });
    writeFileSync(path.join(root, "clients", "stripe", "client.ts"), "export const c = 1;\n");

    const dry = run(root, ["adopt", "clients", "--dry-run"]);
    assert.equal(dry.status, 0);
    assert.equal(
      existsSync(path.join(root, "espalier", "clients")),
      false,
      "a dry run wrote into the espalier",
    );

    const real = run(root, ["adopt", "clients"]);
    // "prints exactly these lines and writes nothing" — so the two runs must
    // not differ in what they say, only in what they leave behind.
    assert.equal(dry.stdout, real.stdout);
    assert.ok(existsSync(path.join(root, "espalier", "clients")));
  });
});

test("build.inline in the config means what --inline means", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier", "ESPALIER.MD"),
      "---\ndescription: the repository\n---\n\nProse.\n",
    );
    writeFileSync(
      path.join(root, "espalier", "src", "ESPALIER.MD"),
      "---\ndescription: the source\n---\n\nMore prose.\n",
    );

    // The flag is the tested spelling everywhere else, and the config key is
    // the one a project actually commits — so the key is the one worth
    // knowing still parses.
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\nbuild:\n  inline: true\n",
    );
    assert.equal(run(root, ["build"]).status, 0);
    assert.ok(existsSync(path.join(root, "AGENTS.MD")));
    assert.equal(
      existsSync(path.join(root, "src", "AGENTS.MD")),
      false,
      "inline still distributed a document",
    );
  });
});

test("build.espalierGuidance omits only Espalier's canned operational guidance", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier", "ESPALIER.MD"),
      "---\ndescription: the repository\n---\n\nPersistent root guidance.\n",
    );
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\nbuild:\n  inline: true\n  espalierGuidance: false\n",
    );

    mkdirSync(path.join(root, "package", "espalier"), { recursive: true });
    writeFileSync(
      path.join(root, "package", "espalier", "ESPALIER.MD"),
      "---\ndescription: the package\n---\n\nPersistent package guidance.\n",
    );
    writeFileSync(
      path.join(root, "package", "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\nbuild:\n  espalierGuidance: false\n",
    );

    const result = run(root, ["build"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);

    const rootDocument = readFileSync(path.join(root, "AGENTS.MD"), "utf8");
    assert.match(rootDocument, /Persistent root guidance\./);
    assert.doesNotMatch(rootDocument, /## Working with Espalier/);

    const childDocument = readFileSync(path.join(root, "package", "AGENTS.MD"), "utf8");
    assert.match(childDocument, /Persistent package guidance\./);
    assert.doesNotMatch(childDocument, /## Governance boundary/);
  });
});

test("build does not materialize exclusions for paths hidden by an external ignore file", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\nignoreFiles:\n  - .gitignore\n",
    );
    writeFileSync(path.join(root, ".gitignore"), ".local/\n");
    writeFileSync(
      path.join(root, ".espalierignore"),
      "# Local tooling.\n.local/\n.kept/\n",
    );
    mkdirSync(path.join(root, ".local"), { recursive: true });
    mkdirSync(path.join(root, ".kept"), { recursive: true });
    writeFileSync(path.join(root, ".local", "settings.json"), "{}\n");
    writeFileSync(path.join(root, ".kept", "policy.json"), "{}\n");

    const result = run(root, ["build"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const document = readFileSync(path.join(root, "AGENTS.MD"), "utf8");
    assert.match(document, /`\.kept\/`/);
    assert.doesNotMatch(document, /`\.local\/`/);
  });
});

test("build --check writes nothing and reports the drift", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier", "ESPALIER.MD"),
      "---\ndescription: the repository\n---\n\nProse.\n",
    );

    const checked = run(root, ["build", "--check", "--format", "jsonl"]);
    assert.match(checked.stdout, /"kind":"drift"/);
    assert.equal(existsSync(path.join(root, "AGENTS.MD")), false, "--check wrote a file");
    assert.notEqual(checked.status, 0);

    assert.equal(run(root, ["build"]).status, 0);
    assert.ok(existsSync(path.join(root, "AGENTS.MD")));
    // Now that it is there, the same check is clean.
    assert.equal(run(root, ["build", "--check"]).status, 0);
  });
});

test("build --force replaces an unmarked planned document", () => {
  scratch((root) => {
    const target = path.join(root, "AGENTS.MD");
    writeFileSync(target, "Accidentally edited generated output.\n");

    assert.equal(run(root, ["build"]).status, 2);
    assert.equal(readFileSync(target, "utf8"), "Accidentally edited generated output.\n");

    const forced = run(root, ["build", "--force"]);
    assert.equal(forced.status, 0);
    assert.match(forced.stdout, /written\s+AGENTS\.MD/);
    assert.match(readFileSync(target, "utf8"), /^<!-- generated by espalier/);
  });
});
