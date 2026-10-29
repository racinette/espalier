// Guidance mode transitions and migration must preserve files and policy.
// Fixtures pin rendered prose; these tests observe drift checks and no-write
// guarantees across configuration changes. docs/CONFIG.MD "Architecture guidance modes".

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../src/version.js";
import { loadConfig } from "../src/config.js";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
function run(root: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}
function scratch(body: (root: string, put: (at: string, contents: string) => void) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-guidance-"));
  const put = (at: string, contents: string) => {
    mkdirSync(path.dirname(path.join(root, at)), { recursive: true });
    writeFileSync(path.join(root, at), contents);
  };
  try {
    put("espalier.config.yaml", config());
    put("espalier/ESPALIER.MD", "Authored policy stays here.\n");
    put("espalier/main.ts.mjs", `export const description = "entry";
export const guidance = "Entry policy.";
export function lint() {}
`);
    body(root, put);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function config(build = "") {
  return `pin: ${VERSION}\nroot: espalier\nignoreFiles: []\nskip: []\n${build ? `build:\n${build}` : ""}`;
}

test("mode changes produce drift without writes, and fixed mode permits normal creation", () => {
  scratch((root, put) => {
    const doc = path.join(root, "AGENTS.MD");
    const rule = readFileSync(path.join(root, "espalier/main.ts.mjs"), "utf8");
    assert.equal(run(root, ["build"]).status, 0);
    const evolving = readFileSync(doc, "utf8");
    put("espalier.config.yaml", config("  guidanceMode: evolving\n"));
    assert.equal(run(root, ["build", "--check"]).status, 0, "explicit evolving equals the default");
    put("espalier.config.yaml", config("  guidanceMode: fixed\n"));
    const drift = run(root, ["build", "--check", "--format", "jsonl"]);
    assert.equal(drift.status, 1, drift.stdout + drift.stderr);
    assert.match(drift.stdout, /"state":"changed"/);
    assert.equal(readFileSync(doc, "utf8"), evolving);
    assert.equal(run(root, ["build"]).status, 0);
    const fixed = readFileSync(doc, "utf8");
    assert.match(fixed, /until architecture work is explicitly authorized/);
    assert.match(fixed, /Explicitly authorized architecture work may proceed in fixed mode/);
    assert.doesNotMatch(fixed, /or add one when/);
    assert.match(fixed, /Authored policy stays here/);
    assert.equal(run(root, ["create", "main.ts"]).status, 0);
    assert.equal(run(root, ["lint"]).status, 0);
    assert.equal(readFileSync(path.join(root, "espalier/main.ts.mjs"), "utf8"), rule);
    assert.equal(run(root, ["build", "--check"]).status, 0);
    put("espalier.config.yaml", config());
    assert.equal(run(root, ["build"]).status, 0);
    assert.equal(readFileSync(doc, "utf8"), evolving);
  });
});

test("invalid modes cannot write build or migration outputs, even with guidance disabled", () => {
  for (const value of ["strict", "true", "null", "[]", "{}"]) {
    scratch((root, put) => {
      const invalid = config(`  guidanceMode: ${value}\n  espalierGuidance: false\n`);
      put("espalier.config.yaml", invalid);
      for (const args of [["build"], ["migrate"], ["migrate", "--dry-run"]]) {
        const result = run(root, [...args, "--format", "jsonl"]);
        assert.equal(result.status, 2, result.stdout + result.stderr);
        assert.match(result.stdout, /"code":"config_invalid_value"/);
        assert.match(result.stdout, /build.guidanceMode/);
        assert.equal(readFileSync(path.join(root, "espalier.config.yaml"), "utf8"), invalid);
        assert.equal(existsSync(path.join(root, "AGENTS.MD")), false);
        assert.equal(existsSync(path.join(root, ".espalierignore")), false);
        assert.equal(existsSync(path.join(root, "espalier/AGENTS.MD")), false);
      }
    });
  }
});

test("migration preserves a fixed mode through legacy folding and is idempotent", () => {
  scratch((root, put) => {
    const old = config("  inline: true\n  guidanceMode: fixed # keep this decision\n")
      .replace(`pin: ${VERSION}`, "pin: 0.6.0");
    put("espalier.config.yaml", old);
    const dry = run(root, ["migrate", "--dry-run"]);
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.equal(readFileSync(path.join(root, "espalier.config.yaml"), "utf8"), old);
    assert.equal(readFileSync(path.join(root, "espalier/ESPALIER.MD"), "utf8"), "Authored policy stays here.\n");
    const migrated = run(root, ["migrate"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.equal(loadConfig(undefined, root).build.guidanceMode, "fixed");
    const next = readFileSync(path.join(root, "espalier.config.yaml"), "utf8");
    assert.match(next, /guidanceMode: fixed # keep this decision/);
    assert.doesNotMatch(next, /inline:/);
    assert.match(readFileSync(path.join(root, "espalier/ESPALIER.mjs"), "utf8"), /fold = true/);
    assert.equal(run(root, ["migrate"]).status, 0);
    assert.equal(readFileSync(path.join(root, "espalier.config.yaml"), "utf8"), next);
    assert.equal(run(root, ["build"]).status, 0);
    assert.match(readFileSync(path.join(root, "AGENTS.MD"), "utf8"), /fixed architecture guidance/);
  });
});

test("fixed suppression retains authored prose and adopting files preserves the mode", () => {
  scratch((root, put) => {
    put("espalier.config.yaml", config("  guidanceMode: fixed\n  espalierGuidance: false\n"));
    put("main.ts", "");
    put("lib/entry.ts", "export {};\n");
    const before = readFileSync(path.join(root, "espalier.config.yaml"), "utf8");
    const adopted = run(root, ["adopt", "lib"]);
    assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
    assert.equal(readFileSync(path.join(root, "espalier.config.yaml"), "utf8"), before);
    assert.equal(run(root, ["build"]).status, 0);
    const document = readFileSync(path.join(root, "AGENTS.MD"), "utf8");
    assert.match(document, /Authored policy stays here/);
    assert.doesNotMatch(document, /Working with Espalier|fixed architecture guidance|Architecture changes/);
  });
});
