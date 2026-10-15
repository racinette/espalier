// Parse-location recovery's side effects and destination routing. Static
// locations live in fixtures; these checks observe execution counts, absent
// coordinates, and isolation from Node preloads across multiple CLI runs.
// docs/ERRORS.MD "Rule-module parse locations".

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

function scratch(body: (root: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-parse-location-"));
  try {
    mkdirSync(path.join(root, "espalier"));
    writeFileSync(path.join(root, "espalier.config.yaml"), "pin: 0.7.0\nroot: espalier\nignoreFiles: []\nskip: []\n");
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function run(root: string, args: string[], env = process.env) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", env });
  if (result.error) throw result.error;
  assert.equal(result.status, 2, result.stdout + result.stderr);
  return result;
}

test("a runtime SyntaxError is not evaluated twice or given parse coordinates", () => {
  scratch((root) => {
    writeFileSync(path.join(root, "espalier/a.ts.mjs"), String.raw`
import { appendFileSync } from 'node:fs';
appendFileSync(new URL('../executions', import.meta.url), 'ran\n');
throw new SyntaxError('runtime failure');
`);
    const result = run(root, ["lint", "--format", "jsonl"]);
    const failure = JSON.parse(result.stdout);
    assert.equal(failure.code, "module_import_failed");
    assert.match(failure.message, /runtime failure/);
    assert.deepEqual(failure.detail, { path: "espalier/a.ts.mjs" });
    assert.equal(readFileSync(path.join(root, "executions"), "utf8"), "ran\n");
    assert.equal(result.stderr, "");
  });
});

test("a helper's syntax failure does not get coordinates from the importing rule", () => {
  scratch((root) => {
    writeFileSync(path.join(root, "helper.mjs"), "export const broken = ;\n");
    writeFileSync(path.join(root, "espalier/a.ts.mjs"), "import '../helper.mjs';\n");
    const result = run(root, ["lint", "--format", "jsonl"]);
    const failure = JSON.parse(result.stdout);
    assert.equal(failure.code, "module_import_failed");
    assert.deepEqual(failure.detail, { path: "espalier/a.ts.mjs" });
    assert.match(failure.message, /Unexpected token/);
    assert.equal(result.stderr, "");
  });
});

test("syntax recovery keeps --out routing and does not run inherited preloads again", () => {
  scratch((root) => {
    writeFileSync(path.join(root, "espalier/a.ts.mjs"), "export const rule = 'Don't mutate';\n");
    const preload = path.join(root, "preload.mjs");
    writeFileSync(preload, `import { appendFileSync } from 'node:fs';
appendFileSync(new URL('./preloads', import.meta.url), 'loaded\\n');\n`);
    const env = { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` };
    for (const command of ["lint", "build"]) {
      const result = run(root, [command, "--format", "jsonl", "--out", "report.jsonl"], env);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
      const failure = JSON.parse(readFileSync(path.join(root, "report.jsonl"), "utf8"));
      assert.equal(failure.code, "module_import_failed");
      assert.deepEqual(failure.detail, { path: "espalier/a.ts.mjs", line: 1, column: 26 });
    }
    assert.equal(readFileSync(path.join(root, "preloads"), "utf8"), "loaded\nloaded\n");
  });
});
