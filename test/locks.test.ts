// Locks checked against a base checkout. docs/LOCKS.MD "Enforcing locks".
// A fixture is one repository, and this check needs two: the base whose locks
// are in force and the change being judged, so each case builds both.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { check } from "../src/api.js";
import { VERSION } from "../src/version.js";

const RULE = 'export const description = "x"; export const guidance = "";\n';

/** A base repository, a copy of it as the head, and the lock issues the head's lint reports. */
async function compare(
  base: Record<string, string>,
  change: (put: (name: string, contents: string) => void, remove: (name: string) => void) => void,
  config = `pin: ${VERSION}\nroot: espalier\nignoreFiles: []\nskip: []\n`,
): Promise<string[]> {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "espalier-locks-"));
  try {
    const write = (root: string) => (name: string, contents: string) => {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), contents);
    };
    const baseRoot = path.join(scratch, "base");
    const headRoot = path.join(scratch, "head");
    write(baseRoot)("espalier.config.yaml", config);
    for (const [name, contents] of Object.entries(base)) write(baseRoot)(name, contents);
    cpSync(baseRoot, headRoot, { recursive: true });
    change(write(headRoot), (name) => rmSync(path.join(headRoot, name), { recursive: true }));
    const issues = await check({ cwd: headRoot, jobs: 1, base: baseRoot });
    return issues
      .filter((issue) => ["locked_module_changed", "locked_directory_changed", "locked_contract_changed", "lock_changed", "untraceable_import"].includes(issue.code))
      .map((issue) => `${issue.code} ${issue.path}`)
      .sort();
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const CLIENTS = {
  "espalier/clients/[provider].ts.mjs": `${RULE}export const abstract = true; export const locked = true;\n`,
  "espalier/clients/stripe.ts.mjs": 'export const instanceOf = "[provider].ts.mjs"; export const description = "stripe"; export const guidance = "Intents.";\n',
  "clients/stripe.ts": "",
};

test("a locked abstract contract freezes itself and its member list, not its members", async () => {
  assert.deepEqual(await compare(CLIENTS, (put) => {
    put("espalier/clients/stripe.ts.mjs", 'export const instanceOf = "[provider].ts.mjs"; export const description = "stripe"; export const guidance = "Intents only.";\n');
  }), []);
  assert.deepEqual(await compare(CLIENTS, (put) => {
    put("espalier/clients/adyen.ts.mjs", 'export const instanceOf = "[provider].ts.mjs"; export const description = "adyen"; export const guidance = "";\n');
    put("clients/adyen.ts", "");
  }), ["locked_contract_changed espalier/clients/adyen.ts.mjs"]);
  assert.deepEqual(await compare(CLIENTS, (put, remove) => {
    remove("espalier/clients/stripe.ts.mjs");
    remove("clients/stripe.ts");
    put("espalier/clients/[provider].ts.mjs", `${RULE}export const abstract = true; export const locked = true; // edited\n`);
  }), ["locked_contract_changed espalier/clients/stripe.ts.mjs", "locked_module_changed espalier/clients/[provider].ts.mjs"]);
});

test("a non-abstract contract's lock leaves its members to its directory", async () => {
  const open = { "espalier/[name].ts.mjs": `${RULE}export const locked = true;\n`, "a.ts": "" };
  assert.deepEqual(await compare(open, (put) => {
    put("espalier/b.ts.mjs", 'export const instanceOf = "[name].ts.mjs"; export const description = "b"; export const guidance = "";\n');
    put("b.ts", "");
  }), []);
});

const CORE = {
  "espalier/src/core/ESPALIER.mjs": "export const locked = true;\n",
  "espalier/src/core/http.ts.mjs": 'import { helper } from "../../../lib/helper.mjs";\nexport const description = "http"; export const guidance = helper;\n',
  "espalier/src/core/plugins/ESPALIER.mjs": "export const locked = false;\n",
  "lib/helper.mjs": 'export const helper = "Retry nothing.";\n',
  ".espalierignore": "lib/\n",
  "src/core/http.ts": "",
};

test("a locked directory freezes its modules and their imports, and an unlocked subtree stays open", async () => {
  assert.deepEqual(await compare(CORE, (put) => {
    put("espalier/src/core/plugins/slack.ts.mjs", RULE);
    put("src/core/plugins/slack.ts", "");
  }), []);
  assert.deepEqual(await compare(CORE, (put) => {
    put("lib/helper.mjs", 'export const helper = "Retry twice.";\n');
    put("espalier/src/core/retry.ts.mjs", RULE);
    put("src/core/retry.ts", "");
  }), ["locked_directory_changed espalier/src/core/retry.ts.mjs", "locked_module_changed espalier/src/core/http.ts.mjs"]);
});

test("changing a lock always needs authorization, unlocking included", async () => {
  assert.deepEqual(await compare(CORE, (put) => {
    put("espalier/src/core/plugins/ESPALIER.mjs", "export const locked = true;\n");
  }), ["lock_changed espalier/src/core/plugins/ESPALIER.mjs"]);
  // Removing a lock is judged by the base, where the directory was locked.
  assert.deepEqual(await compare(CORE, (put) => {
    put("espalier/src/core/ESPALIER.mjs", "");
  }), ["lock_changed espalier/src/core/ESPALIER.mjs", "locked_module_changed espalier/src/core/ESPALIER.mjs"]);
});

test("a locked module that imports a computed path is reported, since nothing can follow it", async () => {
  assert.deepEqual(await compare(CORE, (put) => {
    put("espalier/src/core/plugins/dynamic.ts.mjs", `${RULE}export const load = (name) => import(name);\n`);
    put("src/core/plugins/dynamic.ts", "");
  }), []);
  const issues = await compare(CORE, (put) => {
    put("espalier/src/core/http.ts.mjs", 'export const description = "http"; export const guidance = ""; export const load = (name) => import(name);\n');
  });
  assert.deepEqual(issues, ["locked_module_changed espalier/src/core/http.ts.mjs", "untraceable_import espalier/src/core/http.ts.mjs"]);
});

test("the addons module counts as part of every locked rule", async () => {
  const config = `pin: ${VERSION}\nroot: espalier\nignoreFiles: []\nskip: []\naddons: tools/addons.mjs\n`;
  const base = {
    "espalier/main.ts.mjs": `${RULE}export const locked = true;\n`,
    "tools/addons.mjs": "export default { prepare: () => ({}) };\n",
    ".espalierignore": "tools/\n",
    "main.ts": "",
  };
  assert.deepEqual(await compare(base, (put) => {
    put("tools/addons.mjs", "export default { prepare: () => ({ more: true }) };\n");
  }, config), ["locked_module_changed espalier/main.ts.mjs"]);
});

test("a base without an espalier has no locks", async () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "espalier-locks-"));
  try {
    mkdirSync(path.join(scratch, "base"));
    mkdirSync(path.join(scratch, "head/espalier"), { recursive: true });
    writeFileSync(path.join(scratch, "head/espalier.config.yaml"), `pin: ${VERSION}\nroot: espalier\nignoreFiles: []\nskip: []\n`);
    writeFileSync(path.join(scratch, "head/espalier/main.ts.mjs"), `${RULE}export const locked = true;\n`);
    writeFileSync(path.join(scratch, "head/main.ts"), "");
    const issues = await check({ cwd: path.join(scratch, "head"), jobs: 1, base: path.join(scratch, "base") });
    // Introducing the espalier is a decision no lock was in force to cover.
    assert.deepEqual(issues, []);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("a base pinned to another version is refused rather than misread", async () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "espalier-locks-"));
  try {
    for (const [side, pin] of [["base", "0.0.1"], ["head", VERSION]] as const) {
      mkdirSync(path.join(scratch, side, "espalier"), { recursive: true });
      writeFileSync(path.join(scratch, side, "espalier.config.yaml"), `pin: ${pin}\nroot: espalier\nignoreFiles: []\nskip: []\n`);
      writeFileSync(path.join(scratch, side, "espalier/main.ts.mjs"), RULE);
      writeFileSync(path.join(scratch, side, "main.ts"), "");
    }
    await assert.rejects(check({ cwd: path.join(scratch, "head"), jobs: 1, base: path.join(scratch, "base") }), { code: "base_unreadable" });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
