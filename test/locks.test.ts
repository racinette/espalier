// Locks, frozen files and sealed collections checked against a base revision. docs/LOCKS.MD
// "Checking against a base revision". A fixture is one tree, and this check
// needs a history: each case commits a base and changes the working tree.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { check } from "../src/api.js";

const RULE = 'export const description = "x"; export const guidance = "";\n';

const CHECKS = ["locked_module_changed", "locked_directory_changed", "locked_contract_changed", "lock_changed", "untraceable_import", "frozen_file_changed", "sealed_collection_changed"];

/** Runs git in a scratch repository, failing loudly. */
function git(root: string, ...args: string[]): void {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

/**
 * A repository committed as the base, then changed in the working tree, and
 * the lock and frozen issues `lint --base HEAD` reports for the change.
 */
async function compare(
  base: Record<string, string>,
  change: (put: (name: string, contents: string) => void, remove: (name: string) => void) => void,
  config = `root: espalier\nignoreFiles: []\nskip: []\n`,
): Promise<string[]> {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-locks-"));
  try {
    const put = (name: string, contents: string) => {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), contents);
    };
    put("espalier.config.yaml", config);
    put(".espalierignore", `.git\n${base[".espalierignore"] ?? ""}`);
    for (const [name, contents] of Object.entries(base)) if (name !== ".espalierignore") put(name, contents);
    git(root, "init", "-q");
    git(root, "add", "-A");
    git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
    change(put, (name) => rmSync(path.join(root, name), { recursive: true }));
    const issues = await check({ cwd: root, jobs: 1, base: "HEAD" });
    return issues.filter((issue) => CHECKS.includes(issue.code)).map((issue) => `${issue.code} ${issue.path}`).sort();
  } finally {
    rmSync(root, { recursive: true, force: true });
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
  const config = `root: espalier\nignoreFiles: []\nskip: []\naddons: tools/addons.mjs\n`;
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
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-locks-"));
  try {
    writeFileSync(path.join(root, "README"), "");
    git(root, "init", "-q");
    git(root, "add", "-A");
    git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
    mkdirSync(path.join(root, "espalier"));
    writeFileSync(path.join(root, "espalier.config.yaml"), `root: espalier\nignoreFiles: []\nskip: []\n`);
    writeFileSync(path.join(root, ".espalierignore"), ".git\nREADME\n");
    writeFileSync(path.join(root, "espalier/main.ts.mjs"), `${RULE}export const locked = true;\n`);
    writeFileSync(path.join(root, "main.ts"), "");
    // Introducing the espalier is a decision no lock was in force to cover.
    assert.deepEqual(await check({ cwd: root, jobs: 1, base: "HEAD" }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a base still recording a version is read, and a revision that is not there is refused", async () => {
  assert.deepEqual(await compare({ "espalier/main.ts.mjs": `${RULE}export const locked = true;\n`, "main.ts": "" }, (put) => {
    put("espalier.config.yaml", `root: espalier\nignoreFiles: []\nskip: []\n`);
    put("espalier/main.ts.mjs", `${RULE}export const locked = true; // edited\n`);
  }, `pin: 0.0.1\nversion: 1\nroot: espalier\nignoreFiles: []\nskip: []\n`), ["locked_module_changed espalier/main.ts.mjs"]);
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-locks-"));
  try {
    mkdirSync(path.join(root, "espalier"));
    writeFileSync(path.join(root, "espalier.config.yaml"), `root: espalier\nignoreFiles: []\nskip: []\n`);
    writeFileSync(path.join(root, ".espalierignore"), ".git\n");
    git(root, "init", "-q");
    await assert.rejects(check({ cwd: root, jobs: 1, base: "no-such-branch" }), { code: "base_unreadable" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const MIGRATIONS = {
  "espalier/migrations/[num=0000][ord=00]_[table=a+].sql.mjs": `${RULE}export const groups = { set: { by: ["num", "table"], description: "a set", guidance: "" } };\n`,
  "espalier/migrations/0001[ord=00]_users.sql.mjs": 'export const instanceOf = "[num=0000][ord=00]_[table=a+].sql.mjs"; export const description = "users"; export const guidance = ""; export const frozen = true;\n',
  "migrations/000101_users.sql": "create table users;\n",
  "migrations/000201_orders.sql": "create table orders;\n",
};

test("a frozen group keeps its files; other groups and new files stay open", async () => {
  assert.deepEqual(await compare(MIGRATIONS, (put) => {
    put("migrations/000201_orders.sql", "create table orders (id int);\n");
    put("migrations/000102_users.sql", "create index on users (id);\n");
  }), []);
  assert.deepEqual(await compare(MIGRATIONS, (put) => {
    put("migrations/000101_users.sql", "create table users (id int);\n");
  }), ["frozen_file_changed migrations/000101_users.sql"]);
});

test("a frozen directory keeps every file beneath it, and deleting or renaming one is a change", async () => {
  const vendor = {
    "espalier/vendor/ESPALIER.mjs": "export const frozen = true;\n",
    "espalier/vendor/[file].js.mjs": RULE,
    "vendor/a.js": "a\n",
    "vendor/b.js": "b\n",
  };
  assert.deepEqual(await compare(vendor, (put, remove) => {
    remove("vendor/a.js");
    put("vendor/c.js", "b\n");
    remove("vendor/b.js");
  }), ["frozen_file_changed vendor/a.js", "frozen_file_changed vendor/b.js"]);
  // frozen = false reopens a rule inside a frozen directory.
  assert.deepEqual(await compare({ ...vendor, "espalier/vendor/[file].js.mjs": `${RULE}export const frozen = false;\n` }, (put) => {
    put("vendor/a.js", "changed\n");
  }), []);
});

test("an instance's own frozen comes before its contract's", async () => {
  const base = {
    "espalier/clients/[provider].ts.mjs": `${RULE}export const frozen = true;\n`,
    "espalier/clients/stripe.ts.mjs": 'export const instanceOf = "[provider].ts.mjs"; export const description = "stripe"; export const guidance = ""; export const frozen = false;\n',
    "clients/stripe.ts": "a\n",
    "clients/adyen.ts": "a\n",
  };
  assert.deepEqual(await compare(base, (put) => {
    put("clients/stripe.ts", "b\n");
    put("clients/adyen.ts", "b\n");
  }), ["frozen_file_changed clients/adyen.ts"]);
});

test("a declared directory stays frozen and sealed by its contract, unless it reopens itself", async () => {
  const commands = {
    "espalier/docs/[command]/ESPALIER.mjs": 'export const description = "a command"; export const frozen = true; export const sealed = true;\n',
    "espalier/docs/[command]/[page].md.mjs": RULE,
    "espalier/docs/build/ESPALIER.mjs": 'export const instanceOf = "../[command]"; export const description = "build";\n',
    "docs/build/a.md": "a\n",
  };
  assert.deepEqual(await compare(commands, (put) => {
    put("docs/build/a.md", "b\n");
    put("docs/build/b.md", "b\n");
  }), ["frozen_file_changed docs/build/a.md", "sealed_collection_changed docs/build/b.md"]);
  const reopened = { ...commands, "espalier/docs/build/ESPALIER.mjs": 'export const instanceOf = "../[command]"; export const description = "build"; export const frozen = false;\n' };
  assert.deepEqual(await compare(reopened, (put) => {
    put("docs/build/a.md", "b\n");
  }), []);
});

test("a sealed directory or rule admits no file in or out, and its files stay editable", async () => {
  const locales = {
    "espalier/locales/[lang=a+].json.mjs": `${RULE}export const sealed = true;\n`,
    "espalier/docs/ESPALIER.mjs": "export const sealed = true;\n",
    "espalier/docs/[page].md.mjs": RULE,
    "locales/en.json": "{}\n",
    "locales/fr.json": "{}\n",
    "docs/a.md": "a\n",
  };
  assert.deepEqual(await compare(locales, (put) => {
    put("locales/en.json", '{"hello": "hello"}\n');
    put("docs/a.md", "b\n");
  }), []);
  assert.deepEqual(await compare(locales, (put, remove) => {
    put("locales/de.json", "{}\n");
    remove("locales/fr.json");
    put("docs/b.md", "b\n");
  }), ["sealed_collection_changed docs/b.md", "sealed_collection_changed locales/de.json", "sealed_collection_changed locales/fr.json"]);
});

const SETS = {
  "espalier/migrations/[num=0000][ord=00]_[table=a+].sql.mjs": `${RULE}export const groups = { set: { by: ["num", "table"], sealed: true, description: "a set", guidance: "" } };\n`,
  "migrations/000101_users.sql": "a\n",
  "migrations/000201_orders.sql": "a\n",
};

test("a sealed grouping admits no group in or out, and its groups admit new files", async () => {
  assert.deepEqual(await compare(SETS, (put) => {
    put("migrations/000102_users.sql", "b\n");
    put("migrations/000201_orders.sql", "b\n");
  }), []);
  assert.deepEqual(await compare(SETS, (put, remove) => {
    put("migrations/000301_items.sql", "a\n");
    put("migrations/000302_items.sql", "a\n");
    remove("migrations/000201_orders.sql");
  }), ["sealed_collection_changed migrations/000201_orders.sql", "sealed_collection_changed migrations/000301_items.sql", "sealed_collection_changed migrations/000302_items.sql"]);
});

test("a sealed declared group admits no file in or out, while other groups stay open", async () => {
  const sealed = {
    "espalier/migrations/[num=0000][ord=00]_[table=a+].sql.mjs": `${RULE}export const groups = { set: { by: ["num", "table"], description: "a set", guidance: "" } };\n`,
    "espalier/migrations/0001[ord=00]_users.sql.mjs": 'export const instanceOf = "[num=0000][ord=00]_[table=a+].sql.mjs"; export const description = "users"; export const guidance = ""; export const sealed = true;\n',
    "migrations/000101_users.sql": "a\n",
    "migrations/000201_orders.sql": "a\n",
  };
  assert.deepEqual(await compare(sealed, (put) => {
    put("migrations/000101_users.sql", "b\n");
    put("migrations/000202_orders.sql", "a\n");
    put("migrations/000301_items.sql", "a\n");
  }), []);
  assert.deepEqual(await compare(sealed, (put) => {
    put("migrations/000102_users.sql", "a\n");
  }), ["sealed_collection_changed migrations/000102_users.sql"]);
});
