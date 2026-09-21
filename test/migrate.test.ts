// `espalier migrate`. docs/cli/migrate/README.MD.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHIPPED_SKIP } from "../src/config.js";
import { rewriteConfigText } from "../src/migrate.js";
import { VERSION } from "../src/version.js";

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

function scratch(body: (root: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-migrate-"));
  try {
    mkdirSync(path.join(root, "espalier"));
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("rewrite drops version, keeps comments, and inserts omitted keys", () => {
  const text = `# the project
version: 1
pin: 0.0.9

name: demo
# keep me
root: espalier
`;
  const values = { version: 1, pin: "0.0.9", name: "demo", root: "espalier" };
  const next = rewriteConfigText(text, values, "0.1.0");
  assert.equal(
    next,
    `# the project
pin: 0.1.0

name: demo
# keep me
root: espalier

ignoreFiles: []

skip:
  - AGENTS.MD
  - AGENTS.md
  - CLAUDE.md
`,
  );
  assert.deepEqual(SHIPPED_SKIP, ["AGENTS.MD", "AGENTS.md", "CLAUDE.md"]);
});

test("rewrite leaves an existing skip and ignoreFiles alone", () => {
  const text = `pin: 0.1.0
root: espalier
ignoreFiles: []
skip: []
`;
  const values = { pin: "0.1.0", root: "espalier", ignoreFiles: [], skip: [] };
  assert.equal(rewriteConfigText(text, values, "0.1.0"), text);
});

test("migrate rewrites an old config and is then loadable", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    const migrated = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.match(migrated.stdout, /"kind":"written"/);

    const written = readFileSync(path.join(root, "espalier.config.yaml"), "utf8");
    assert.equal(written.includes("version:"), false);
    assert.match(written, /^pin: 0\.1\.0$/m);
    assert.match(written, /^ignoreFiles: \[\]$/m);
    assert.match(written, /^skip:$/m);
    for (const name of SHIPPED_SKIP) {
      assert.match(written, new RegExp(`^ {2}- ${name}$`, "m"));
    }

    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  });
});

test("migrate --dry-run writes nothing", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    const dry = run(root, ["migrate", "--dry-run", "--format", "jsonl"]);
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.match(dry.stdout, /"kind":"written"/);
    assert.equal(
      readFileSync(path.join(root, "espalier.config.yaml"), "utf8"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
  });
});

test("migrate visits a child config", () => {
  scratch((root) => {
    writeFileSync(path.join(root, "espalier.config.yaml"), "version: 1\npin: 0.1.0\nroot: espalier\n");
    mkdirSync(path.join(root, "packages", "web", "espalier"), { recursive: true });
    writeFileSync(
      path.join(root, "packages", "web", "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    const migrated = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.match(migrated.stdout, /packages\/web\/espalier\.config\.yaml/);
    assert.equal(
      readFileSync(path.join(root, "packages", "web", "espalier.config.yaml"), "utf8").includes("skip:"),
      true,
    );
  });
});

test("a current config is skipped", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      `pin: ${VERSION}\nroot: espalier\nignoreFiles: []\nskip: []\n`,
    );
    const migrated = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.match(migrated.stdout, /"kind":"skipped"/);
  });
});
