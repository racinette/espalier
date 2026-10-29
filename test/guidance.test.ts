// Locks and the removed guidance mode: transitions and migration must
// preserve files and policy. Fixtures pin rendered prose; these tests observe
// drift checks and no-write guarantees across changes. docs/LOCKS.MD.

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

test("a root lock produces drift without writes, and a locked espalier permits normal creation", () => {
  scratch((root, put) => {
    rmSync(path.join(root, "espalier/ESPALIER.MD"));
    put("espalier/ESPALIER.mjs", 'export const guidance = "Authored policy stays here.";\n');
    const doc = path.join(root, "AGENTS.MD");
    const rule = readFileSync(path.join(root, "espalier/main.ts.mjs"), "utf8");
    assert.equal(run(root, ["build"]).status, 0);
    const unlocked = readFileSync(doc, "utf8");
    assert.doesNotMatch(unlocked, /🔒/);
    put("espalier/ESPALIER.mjs", 'export const guidance = "Authored policy stays here.";\nexport const locked = false;\n');
    assert.equal(run(root, ["build", "--check"]).status, 0, "an explicit false equals the default");
    put("espalier/ESPALIER.mjs", 'export const guidance = "Authored policy stays here.";\nexport const locked = true;\n');
    const drift = run(root, ["build", "--check", "--format", "jsonl"]);
    assert.equal(drift.status, 1, drift.stdout + drift.stderr);
    assert.match(drift.stdout, /"state":"changed"/);
    assert.equal(readFileSync(doc, "utf8"), unlocked);
    assert.equal(run(root, ["build"]).status, 0);
    const locked = readFileSync(doc, "utf8");
    assert.match(locked, /needs explicit authorization naming that change/);
    assert.match(locked, /main\.ts 🔒❗/);
    assert.match(locked, /Authored policy stays here/);
    assert.equal(run(root, ["create", "main.ts"]).status, 0);
    assert.equal(run(root, ["lint"]).status, 0);
    assert.equal(readFileSync(path.join(root, "espalier/main.ts.mjs"), "utf8"), rule);
    assert.equal(run(root, ["build", "--check"]).status, 0);
    put("espalier/ESPALIER.mjs", 'export const guidance = "Authored policy stays here.";\n');
    assert.equal(run(root, ["build"]).status, 0);
    assert.equal(readFileSync(doc, "utf8"), unlocked);
  });
});

test("a guidance mode in the config is refused by build and validated by migrate before any write", () => {
  for (const value of ["fixed", "strict", "true", "null", "[]", "{}"]) {
    scratch((root, put) => {
      const invalid = config(`  guidanceMode: ${value}\n  espalierGuidance: false\n`);
      put("espalier.config.yaml", invalid);
      const commands = value === "fixed" ? [["build"]] : [["build"], ["migrate"], ["migrate", "--dry-run"]];
      for (const args of commands) {
        const result = run(root, [...args, "--format", "jsonl"]);
        assert.equal(result.status, 2, result.stdout + result.stderr);
        assert.match(result.stdout, args[0] === "build" ? /"code":"config_unknown_key"/ : /"code":"config_invalid_value"/);
        assert.match(result.stdout, /build.guidanceMode/);
        assert.equal(readFileSync(path.join(root, "espalier.config.yaml"), "utf8"), invalid);
        assert.equal(existsSync(path.join(root, "AGENTS.MD")), false);
        assert.equal(existsSync(path.join(root, ".espalierignore")), false);
        assert.equal(existsSync(path.join(root, "espalier/AGENTS.MD")), false);
      }
    });
  }
});

test("a lock that is not a boolean is refused", () => {
  scratch((root, put) => {
    put("espalier/main.ts.mjs", 'export const description = "entry"; export const guidance = ""; export const locked = "yes";\n');
    const result = run(root, ["build", "--format", "jsonl"]);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stdout, /"code":"module_invalid_export"/);
  });
});

test("migration turns a fixed mode into a root lock through legacy folding, idempotently", () => {
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
    // The fixed mode moves into the espalier as a lock on its root.
    loadConfig(undefined, root);
    const next = readFileSync(path.join(root, "espalier.config.yaml"), "utf8");
    assert.doesNotMatch(next, /guidanceMode/);
    assert.doesNotMatch(next, /inline:/);
    const rootModule = readFileSync(path.join(root, "espalier/ESPALIER.mjs"), "utf8");
    assert.match(rootModule, /fold = true/);
    assert.match(rootModule, /export const locked = true;/);
    assert.equal(run(root, ["migrate"]).status, 0);
    assert.equal(readFileSync(path.join(root, "espalier.config.yaml"), "utf8"), next);
    assert.equal(run(root, ["build"]).status, 0);
    assert.match(readFileSync(path.join(root, "AGENTS.MD"), "utf8"), /Modules marked 🔒 in \*\*Project layout\*\* are locked/);
  });
});

test("suppressed guidance retains authored prose and adopting files leaves the root lock alone", () => {
  scratch((root, put) => {
    put("espalier.config.yaml", config("  espalierGuidance: false\n"));
    rmSync(path.join(root, "espalier/ESPALIER.MD"));
    put("espalier/ESPALIER.mjs", 'export const guidance = "Authored policy stays here.";\nexport const locked = true;\n');
    put("main.ts", "");
    put("lib/entry.ts", "export {};\n");
    const before = readFileSync(path.join(root, "espalier/ESPALIER.mjs"), "utf8");
    const adopted = run(root, ["adopt", "lib"]);
    assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
    assert.equal(readFileSync(path.join(root, "espalier/ESPALIER.mjs"), "utf8"), before);
    assert.equal(run(root, ["build"]).status, 0);
    const document = readFileSync(path.join(root, "AGENTS.MD"), "utf8");
    assert.match(document, /Authored policy stays here/);
    assert.doesNotMatch(document, /Working with Espalier|are locked\. Work inside|Architecture changes/);
  });
});
