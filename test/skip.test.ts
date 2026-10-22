// Configured skip in the espalier tree. docs/CONFIG.MD "`skip`", MATCHING.MD
// "Node kinds".

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
      "pin: 0.9.2\nroot: espalier\nignoreFiles: []\nskip:\n  - AGENTS.MD\n",
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
      "pin: 0.9.2\nroot: espalier\nignoreFiles: []\nskip:\n  - AGENTS.MD\n",
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
      "pin: 0.9.2\nroot: espalier\nignoreFiles: []\nskip: []\n",
    );
    writeFileSync(path.join(root, "espalier", "notes.md"), "nope\n");
    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 2);
    assert.match(lint.stdout, /invalid_espalier_entry/);
  });
});

// A fixture can show the result, but cannot prove these directories were unread.
for (const directory of [".tools", "tools", "nested"]) {
  test(`skip prunes ${directory} before reading grammar or broken links`, () => {
    scratch((root) => {
      writeFileSync(path.join(root, "espalier.config.yaml"),
        `pin: 0.9.2\nroot: espalier\nignoreFiles: []\nskip: ["${directory}/"]\n`);
      const excluded = path.join(root, "espalier", directory);
      mkdirSync(excluded);
      writeFileSync(path.join(excluded, "ESPALIER.MD"), "---\ninvalid: [\n");
      writeFileSync(path.join(excluded, "danger.mjs"), 'throw new Error("must never import");');
      symlinkSync("missing", path.join(excluded, "broken.mjs"));
      const lint = run(root, ["lint", "--format", "jsonl"]);
      assert.equal(lint.status, 0, lint.stdout + lint.stderr);
    });
  });
}

test("skip excludes broken directory links before resolution", () => {
  scratch((root) => {
    writeFileSync(path.join(root, "espalier.config.yaml"),
      'pin: 0.9.2\nroot: espalier\nignoreFiles: []\nskip: [".tools/", "tools/"]\n');
    for (const name of [".tools", "tools"]) symlinkSync("missing", path.join(root, "espalier", name));
    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  });
});

test("adopt refuses skipped output before writing any modules", () => {
  scratch((root) => {
    writeFileSync(path.join(root, "espalier.config.yaml"),
      'pin: 0.9.2\nroot: espalier\nignoreFiles: []\nskip: [".settings/"]\n');
    mkdirSync(path.join(root, ".settings"));
    writeFileSync(path.join(root, ".settings", "config.json"), "{}\n");
    const adopted = run(root, ["adopt", ".settings", "--format", "jsonl"]);
    assert.equal(adopted.status, 2, adopted.stdout + adopted.stderr);
    assert.match(adopted.stdout, /invalid_adopt_target/);
    assert.equal(existsSync(path.join(root, "espalier", ".settings")), false);
  });
});
