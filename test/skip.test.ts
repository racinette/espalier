// Configured skip in the espalier tree. docs/CONFIG.MD "`skip`", MATCHING.MD
// "Node kinds".

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

const INERT = `export const description = "a file";
export const rule = \`Nothing.\`;
export async function lint() {}
`;

function run(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

function scratch(body: (root: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-skip-"));
  try {
    mkdirSync(path.join(root, "espalier"));
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a skipped AGENTS.MD is not invalid_espalier_entry", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "pin: 0.1.0\nroot: espalier\nignoreFiles: []\nskip:\n  - AGENTS.MD\n",
    );
    writeFileSync(path.join(root, "espalier", "AGENTS.MD"), "Authoring notes.\n");
    writeFileSync(path.join(root, "espalier", "[name].ts.mjs"), INERT);
    writeFileSync(path.join(root, "a.ts"), "export const a = 1;\n");

    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  });
});

test("a nested AGENTS.MD is skipped by the bare name", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "pin: 0.1.0\nroot: espalier\nignoreFiles: []\nskip:\n  - AGENTS.MD\n",
    );
    mkdirSync(path.join(root, "espalier", "src"), { recursive: true });
    writeFileSync(path.join(root, "espalier", "src", "AGENTS.MD"), "Local notes.\n");
    writeFileSync(path.join(root, "espalier", "[name].ts.mjs"), INERT);
    writeFileSync(path.join(root, "a.ts"), "export const a = 1;\n");

    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  });
});

test("an unskipped notes file is still invalid_espalier_entry", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "pin: 0.1.0\nroot: espalier\nignoreFiles: []\nskip: []\n",
    );
    writeFileSync(path.join(root, "espalier", "notes.md"), "nope\n");
    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 2);
    assert.match(lint.stdout, /invalid_espalier_entry/);
  });
});
