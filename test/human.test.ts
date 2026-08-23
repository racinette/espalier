// The format a person reads. docs/cli/lint/README.MD "Output".
//
// Every operational failure in this suite is asserted in `jsonl`, because that
// is the format an assertion is cheap against. The consequence had gone
// unnoticed: the human formatter's failure path, its warnings, and the block it
// prints under an unrecognized path were reached by no test at all. A formatter
// is the whole of what most people ever see of a tool, and a regression in one
// is invisible to every consumer written against the other.
//
// Asserted here rather than as fixture goldens because each case needs a
// repository shaped to produce one line, and a golden compares a whole run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

function write(root: string, at: string, contents: string): void {
  mkdirSync(path.join(root, path.dirname(at)), { recursive: true });
  writeFileSync(path.join(root, at), contents, "utf8");
}

function scratch(body: (root: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-human-"));
  try {
    mkdirSync(path.join(root, "espalier"));
    writeFileSync(path.join(root, "espalier.config.yaml"), "version: 1\nroot: espalier\n");
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const RULE = `export const description = "a client";
export const rule = \`Every client wraps one provider.\`;
export async function lint() {}
`;

test("an operational failure prints one line and no summary", () => {
  scratch((root) => {
    writeFileSync(path.join(root, "espalier.config.yaml"), "version: 1\nroot: espalier\nnope: 1\n");

    const shown = run(root, ["lint"]);
    // "An operational failure here means the run produced nothing to
    // summarize." No "no issues", no tally, no blank-line ceremony.
    assert.equal(
      shown.stdout,
      'espalier: unknown configuration key "nope"  (config_unknown_key)\n',
    );
    assert.equal(shown.status, 2);
  });
});

test("an unrecognized path shows where recognition stopped, and what it captured", () => {
  scratch((root) => {
    write(root, "espalier/clients/[provider]/client.ts.mjs", RULE);
    write(root, "clients/stripe/client.ts", "export const c = 1;\n");
    write(root, "clients/stripe/refund.ts", "export const r = 1;\n");

    const shown = run(root, ["lint"]);
    // The captures are the part no other test reaches: an agent told a path is
    // undeclared needs to know which instance it was undeclared *in*.
    assert.match(shown.stdout, /The espalier recognizes {2}clients\/\[provider\]\/ {3}\(provider = "stripe"\)/);
    assert.match(shown.stdout, /Declared there:\n {6}client\.ts\n/);
    assert.equal(shown.status, 1);
  });
});

test("a path recognized nowhere shows no block at all", () => {
  scratch((root) => {
    write(root, "espalier/clients/[provider]/client.ts.mjs", RULE);
    write(root, "clients/stripe/client.ts", "export const c = 1;\n");
    write(root, "stray.txt", "loose\n");

    const shown = run(root, ["lint"]);
    // "Then there is nothing to report beyond the violation itself." An empty
    // "Declared there:" heading would be worse than none.
    assert.match(shown.stdout, /stray\.txt\n {2}error {2}unexpected_path/);
    assert.doesNotMatch(shown.stdout, /recognizes {2}\/|Declared there:\n\n/);
    assert.equal(shown.status, 1);
  });
});

test("a scoped run says how much of the repository it checked", () => {
  scratch((root) => {
    write(root, "espalier/clients/[provider]/client.ts.mjs", RULE);
    write(root, "clients/stripe/client.ts", "export const c = 1;\n");
    write(root, "clients/twilio/client.ts", "export const c = 2;\n");

    const shown = run(root, ["lint", "clients/stripe"]);
    // "A scoped run cannot tell you the repository conforms — only that the
    // part you asked about does. The human summary says so explicitly."
    assert.match(shown.stdout, /partial run: 1 of 2 files checked/);
    assert.equal(shown.status, 0);
  });
});

test("a writing command prints a tally, and nothing when it wrote nothing", () => {
  scratch((root) => {
    rmSync(path.join(root, "espalier.config.yaml"));
    rmSync(path.join(root, "espalier"), { recursive: true });

    const written = run(root, ["init", "--no-ignore-file"]);
    assert.equal(written.status, 0);
    // Label padded to a fixed width, then the path; the tally last. `build`,
    // `init` and `adopt` share this, so one of them exercising it is enough —
    // but none of them was exercising it in human form.
    assert.match(written.stdout, /^written {3}espalier\.config\.yaml$/m);
    assert.match(written.stdout, /^written {3}\.espalierignore$/m);
    assert.match(written.stdout, /\n3 written\n$/);

    // "A build that had no work to do should not look like a build that did
    // some, so an empty run prints nothing at all." The first build writes the
    // root document; the second has nothing left to do.
    assert.match(run(root, ["build"]).stdout, /\n1 written\n$/);
    const again = run(root, ["build"]);
    assert.equal(again.status, 0);
    assert.equal(again.stdout, "");
  });
});

test("an issue carries its position ahead of its severity", () => {
  scratch((root) => {
    write(
      root,
      "espalier/[file].ts.mjs",
      `export const description = "a file";
export const rule = \`R\`;
export async function lint(context) {
  context.emit({ code: "positioned", message: "here", severity: "warning", line: 12, column: 3 });
}
`,
    );
    write(root, "a.ts", "export const a = 1;\n");

    const shown = run(root, ["lint"]);
    assert.match(shown.stdout, /^ {2}12:3 {2}warning {2}positioned {3}here$/m);
    assert.equal(shown.status, 0);
  });
});

test("issues are grouped under their path, in path order", () => {
  scratch((root) => {
    write(
      root,
      "espalier/[file].ts.mjs",
      `export const description = "a file";
export const rule = \`R\`;
export async function lint(context) {
  context.emit({ code: "one", message: "first", severity: "warning" });
  context.emit({ code: "two", message: "second", severity: "warning" });
}
`,
    );
    write(root, "b.ts", "export const b = 1;\n");
    write(root, "a.ts", "export const a = 1;\n");

    const shown = run(root, ["lint"]);
    // Grouping is a formatter's business rather than the runner's — the runner
    // promises no order, so this is the one place order is a claim.
    const paths = [...shown.stdout.matchAll(/^([ab]\.ts)$/gm)].map((match) => match[1]);
    assert.deepEqual(paths, ["a.ts", "b.ts"]);
    // Both of `a.ts`'s issues appear under it, in the order they were emitted,
    // each with its own rule block between them.
    assert.match(
      shown.stdout,
      /a\.ts\n {2}warning {2}one {3}first\n[\s\S]*? {2}warning {2}two {3}second\n[\s\S]*?\nb\.ts\n/,
    );
  });
});

test("a name too long for its column is still told apart from what follows", () => {
  scratch((root) => {
    // Deep enough to overflow the fixed column `explain` lays out against.
    // `padEnd` is a no-op there, so the path ran straight into its description:
    // `...leaf.tsa source file`. The one path a reader most needs separated is
    // the one long enough to have caused this.
    const deep = Array.from({ length: 40 }, (_, i) => `d${i}`).join("/");
    write(root, `espalier/${deep}/leaf.ts.mjs`, RULE);
    write(root, `${deep}/leaf.ts`, "export const a = 1;\n");

    const shown = run(root, ["explain", `${deep}/leaf.ts`]);
    assert.equal(shown.status, 0);
    assert.match(shown.stdout, /leaf\.ts {2}a client\n/);

    // The prefix form draws the map instead, which aligns against its own
    // longest line — so depth cannot run a name into its text there at all.
    const prefix = run(root, ["explain", `${deep}/`]);
    assert.match(prefix.stdout, /└─ leaf\.ts {2}a client \(required\)\n/);
    assert.equal(prefix.status, 0);
  });
});

test("rule text is indented beneath the issue that cited it", () => {
  scratch((root) => {
    write(
      root,
      "espalier/[file].ts.mjs",
      `export const description = "a client";
export const rule = \`Every client wraps one provider.
It does not wrap two.\`;
export async function lint(context) {
  context.emit({ code: "noted", message: "a finding", severity: "warning" });
}
`,
    );
    write(root, "a.ts", "export const a = 1;\n");

    const shown = run(root, ["lint"]);
    assert.match(shown.stdout, /Rule \(a client\):\n {6}Every client wraps one provider\.\n {6}It does not wrap two\./);
  });
});
