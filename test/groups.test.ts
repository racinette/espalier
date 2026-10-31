// Groupings of a dynamic rule's files. docs/TYPES.MD "groups". The fixture
// pins the lint, explain and build outcomes; these tests cover the API and the
// run options a fixture cannot express.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { check, runGroup } from "../src/api.js";

const rule = {
  description: "a step",
  guidance: "Per step.",
  lint() {},
  groups: {
    set: {
      by: ["num", "group"],
      description: "a migration set",
      guidance: "No gaps.",
      async lint({ group, captures, matches, read, emit }: { group: string; captures: Record<string, unknown>; matches: { path: string; captures: Record<string, unknown> }[]; read: (path: string) => Promise<string>; emit: (issue: unknown) => void }) {
        const sizes = await Promise.all(matches.map(({ path }) => read(path)));
        emit({ code: "seen", message: `${group} ${captures["num"]} ${matches.map(({ captures }) => captures["ord"]).join(",")} ${sizes.join("|")}` });
      },
    },
  },
};

test("runGroup runs one grouping with sorted members and records the grouping on issues", async () => {
  const issues = await runGroup(rule, {
    group: "set",
    captures: { num: "0001", group: "users" },
    matches: [
      { path: "migrations/000102_users.sql", captures: { num: "0001", ord: "02", group: "users" } },
      { path: "migrations/000101_users.sql", captures: { num: "0001", ord: "01", group: "users" } },
    ],
    at: "migrations/",
    tree: { "migrations/000101_users.sql": "a", "migrations/000102_users.sql": "b" },
    rule: "migrations/[num=0000][ord=00]_[group=a+].sql.mjs",
  });
  assert.equal(issues.length, 1);
  const [issue] = issues;
  assert.equal(issue!.message, "set 0001 01,02 a|b");
  assert.equal(issue!.path, "migrations/");
  assert.equal(issue!.group, "set");
  assert.deepEqual(issue!.captures, { num: "0001", group: "users" });
  assert.equal(issue!.guidance, "No gaps.");
  assert.equal(issue!.description, "a migration set");
  assert.equal(issue!.rule, "migrations/[num=0000][ord=00]_[group=a+].sql.mjs");
});

test("a grouping needs only its by: description and guidance are optional", async () => {
  const issues = await runGroup({ groups: { set: { by: ["num"], lint: ({ emit }: { emit: (issue: { code: string; message: string }) => void }) => emit({ code: "x", message: "m" }) } } }, {
    group: "set", captures: { num: "0001" }, matches: [], at: "migrations/",
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.guidance, "");
  assert.equal(issues[0]!.description, null);
});

test("runGroup refuses a module without the named grouping", async () => {
  await assert.rejects(runGroup({ ...rule, groups: {} }, { group: "set", matches: [] }), { code: "module_invalid_export" });
  await assert.rejects(runGroup({ description: "x", guidance: "x", lint() {} }, { group: "set", matches: [] }), { code: "module_invalid_export" });
});

test("a grouping runs once per directory and key, and --rule selects it with its rule", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-groups-"));
  const put = (name: string, contents: string) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), contents);
  };
  try {
    put("espalier.config.yaml", `ignoreFiles: []\nskip: []\n`);
    put("espalier/[area]/[num=0000][ord=00]_[group=a+].sql.mjs", `export const description = "a step"; export const guidance = "Per step.";
export function lint({ emit }) { emit({ code: "file", message: "file", severity: "info" }); }
export const groups = {
  set: { by: ["num", "group"], description: "a set", guidance: "", async lint({ path, captures, matches, emit }) {
    emit({ code: "set", message: path + " " + captures.num + " " + captures.group + " " + matches.length, severity: "info" });
  } },
  all: { by: [], description: "a directory", guidance: "", async lint({ path, matches, emit }) {
    emit({ code: "all", message: path + " " + matches.length, severity: "info" });
  } },
};
`);
    for (const file of ["a/000101_users.sql", "a/000102_users.sql", "a/000101_orders.sql", "b/000101_users.sql"]) put(file, "");
    const messages = (issues: { code: string; message: string }[]) => issues.map((issue) => `${issue.code}: ${issue.message}`).sort();
    assert.deepEqual(messages(await check({ cwd: root, jobs: 1 })), [
      "all: a/ 3", "all: b/ 1",
      "file: file", "file: file", "file: file", "file: file",
      "set: a/ 0001 orders 1", "set: a/ 0001 users 2", "set: b/ 0001 users 1",
    ]);
    assert.deepEqual(messages(await check({ cwd: root, jobs: 2, paths: ["a/000102_users.sql"] })), [
      "all: a/ 3", "file: file", "set: a/ 0001 users 2",
    ]);
    assert.deepEqual(messages(await check({ cwd: root, jobs: 1, rule: "[area]/[num=0000][ord=00]_[group=a+].sql.mjs", paths: ["b"] })), [
      "all: b/ 1", "file: file", "set: b/ 0001 users 1",
    ]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("runGroup runs a declared group's own lint with its own prose", async () => {
  const declared = {
    instanceOf: "[num=0000][ord=00]_[group=a+].sql.mjs",
    description: "create users",
    guidance: "Creates the users table.",
    lint({ group, captures, matches, emit }: { group: string; captures: Record<string, unknown>; matches: unknown[]; emit: (issue: unknown) => void }) {
      emit({ code: "declared", message: `${group} ${captures["group"]} ${matches.length}` });
    },
  };
  const [issue, ...rest] = await runGroup(declared, {
    group: "set",
    captures: { num: "0001", group: "users" },
    matches: [{ path: "migrations/000101_users.sql" }],
    at: "migrations/",
    rule: "migrations/0001[ord=00]_users.sql.mjs",
  });
  assert.equal(rest.length, 0);
  assert.equal(issue!.message, "set users 1");
  assert.equal(issue!.group, "set");
  assert.equal(issue!.guidance, "Creates the users table.");
  assert.equal(issue!.description, "create users");
});

test("a declared group is required in every directory its rule reaches, and --rule selects its own check", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-declared-groups-"));
  const put = (name: string, contents: string) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), contents);
  };
  try {
    put("espalier.config.yaml", `ignoreFiles: []\nskip: []\n`);
    put("espalier/[area]/[num=0000][ord=00]_[group=a+].sql.mjs", `export const description = "a step"; export const guidance = "Per step.";
export const groups = {
  set: { by: ["num", "group"], description: "a set", guidance: "", lint({ path, emit }) { emit({ code: "set", message: path, severity: "info" }); } },
};
`);
    put("espalier/[area]/0001[ord=00]_users.sql.mjs", `export const instanceOf = "[num=0000][ord=00]_[group=a+].sql.mjs";
export const description = "create users"; export const guidance = "Users.";
export function lint({ path, matches, emit }) { emit({ code: "users", message: path + " " + matches.length, severity: "info" }); }
`);
    for (const file of ["a/000101_users.sql", "a/000102_users.sql", "b/000101_orders.sql"]) put(file, "");
    const messages = (issues: { code: string; message: string; path: string }[]) => issues.map((issue) => `${issue.code}: ${issue.path} ${issue.message.split(";")[0]}`).sort();
    assert.deepEqual(messages(await check({ cwd: root, jobs: 1 })), [
      "missing_required_group: b/ the declared set group `0001[ord=00]_users.sql` has no files here",
      "set: a/ a/", "set: b/ b/",
      "users: a/ a/ 2",
    ]);
    assert.deepEqual(messages(await check({ cwd: root, jobs: 1, rule: "[area]/0001[ord=00]_users.sql.mjs", paths: ["a"] })), [
      "users: a/ a/ 2",
    ]);
    put("espalier/[area]/0001[ord=00]_users.sql.mjs", `export const instanceOf = "[num=0000][ord=00]_[group=a+].sql.mjs";
export const optional = true; export const description = "create users"; export const guidance = "Users.";
`);
    assert.deepEqual(messages(await check({ cwd: root, jobs: 1 })), ["set: a/ a/", "set: b/ b/"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a named instance declares a group of a grouping it inherits for its own files only", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-instance-groups-"));
  const put = (name: string, contents: string) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), contents);
  };
  try {
    put("espalier.config.yaml", `ignoreFiles: []\nskip: []\n`);
    put("espalier/[area]/[num=0000][ord=00]_[group=a+].sql.mjs", `export const groups = {
  set: { by: ["num", "group"], lint({ path, emit }) { emit({ code: "set", message: path, severity: "info" }); } },
};
`);
    put("espalier/a/ESPALIER.mjs", `export const instanceOf = "../[area]";\n`);
    put("espalier/a/0001[ord=00]_users.sql.mjs", `export const instanceOf = "[num=0000][ord=00]_[group=a+].sql.mjs";
export function lint({ path, matches, emit }) { emit({ code: "users", message: path + " " + matches.length, severity: "info" }); }
`);
    for (const file of ["a/000101_users.sql", "a/000201_orders.sql", "b/000201_orders.sql"]) put(file, "");
    const messages = (issues: { code: string; message: string; path: string }[]) => issues.map((issue) => `${issue.code}: ${issue.path} ${issue.message.split(";")[0]}`).sort();
    // b has no users group, and nothing requires one there.
    assert.deepEqual(messages(await check({ cwd: root, jobs: 1 })), [
      "set: a/ a/", "set: a/ a/", "set: b/ b/",
      "users: a/ a/ 1",
    ]);

    // The instance restates the rule to make the inherited grouping abstract
    // and add a check; b keeps the contract's grouping as it is.
    put("espalier/a/[num=0000][ord=00]_[group=a+].sql.mjs", `export const groups = {
  set: { abstract: true, lint({ path, emit }) { emit({ code: "a-set", message: path, severity: "info" }); } },
};
`);
    assert.deepEqual(messages(await check({ cwd: root, jobs: 1 })), [
      "a-set: a/ a/", "a-set: a/ a/",
      "set: a/ a/", "set: a/ a/", "set: b/ b/",
      "undeclared_instance: a/ the set group `0002[ord=00]_orders.sql` of the abstract grouping in `a/[num=0000][ord=00]_[group=a+].sql` is not declared",
      "users: a/ a/ 1",
    ]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an instance adds to an inherited grouping and never replaces or loosens it", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-extend-groups-"));
  const put = (name: string, contents: string) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), contents);
  };
  try {
    put("espalier.config.yaml", `ignoreFiles: []\nskip: []\n`);
    put("espalier/[area]/[num=0000]_[group=a+].sql.mjs", `export const groups = { set: { by: ["num"], abstract: true } };\n`);
    put("espalier/a/ESPALIER.mjs", `export const instanceOf = "../[area]";\n`);
    const refused = async (groups: string, code: string, message: RegExp) => {
      put("espalier/a/[num=0000]_[group=a+].sql.mjs", `export const groups = ${groups};\n`);
      await assert.rejects(check({ cwd: root, jobs: 1 }), (error: { code: string; message: string }) => error.code === code && message.test(error.message));
    };
    await refused(`{ set: { by: ["group"] } }`, "invalid_instance", /would replace the grouping/);
    await refused(`{ other: { abstract: true } }`, "invalid_instance", /no grouping of that name to add to/);
    await refused(`{ set: { description: "x" } }`, "module_invalid_export", /whose description it cannot replace/);
    await refused(`{ set: { abstract: false } }`, "module_invalid_export", /may only tighten it/);
    rmSync(path.join(root, "espalier/a"), { recursive: true });
    put("espalier/[num=0000]_[group=a+].sql.mjs", `export const groups = { set: { sealed: true } };\n`);
    await assert.rejects(check({ cwd: root, jobs: 1 }), { code: "module_invalid_export" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a group counts as declared from the contract or the instance, and one group answers to one declaration", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-instance-declared-"));
  const put = (name: string, contents: string) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), contents);
  };
  const step = `export const instanceOf = "[num=0000]_[t=a+].sql.mjs";\n`;
  try {
    put("espalier.config.yaml", `ignoreFiles: []\nskip: []\n`);
    put("espalier/[area]/[num=0000]_[t=a+].sql.mjs", `export const groups = { step: { by: ["num"], abstract: true } };\n`);
    put("espalier/[area]/0009_[t=a+].sql.mjs", `${step}export const optional = true;\n`);
    put("espalier/a/ESPALIER.mjs", `export const instanceOf = "../[area]";\n`);
    put("espalier/a/0001_[t=a+].sql.mjs", step);
    // Tightening what the contract already makes abstract states nothing new.
    put("espalier/a/[num=0000]_[t=a+].sql.mjs", `export const groups = { step: { abstract: true } };\n`);
    for (const file of ["a/0001_x.sql", "a/0002_x.sql", "a/0009_x.sql", "b/0001_x.sql", "b/0009_x.sql"]) put(file, "");
    const messages = async () => (await check({ cwd: root, jobs: 1 })).map((issue) => `${issue.code}: ${issue.path} ${issue.message.split(" of the")[0]}`).sort();
    assert.deepEqual(await messages(), [
      "undeclared_instance: a/ the step group `0002_[t=a+].sql`",
      "undeclared_instance: b/ the step group `0001_[t=a+].sql`",
    ]);

    // The contract's declaration and the instance's name one group in a:
    // both checks run there, and it is required once, as the instance's.
    const said = (who: string) => `export function lint({ path, emit }) { emit({ code: "${who}", message: path, severity: "info" }); }\n`;
    put("espalier/[area]/0001_[t=a+].sql.mjs", step + said("contract"));
    put("espalier/a/0001_[t=a+].sql.mjs", step + said("instance"));
    assert.deepEqual((await check({ cwd: root, jobs: 1 })).filter((issue) => issue.severity === "info").map((issue) => `${issue.code} ${issue.path}`).sort(),
      ["contract a/", "contract b/", "instance a/"]);
    rmSync(path.join(root, "a/0001_x.sql"));
    assert.deepEqual((await check({ cwd: root, jobs: 1 })).filter((issue) => issue.code === "missing_required_group")
      .map((issue) => `${issue.path} ${(issue.metadata as { declared: string }).declared}`), ["a/ a/0001_[t=a+].sql.mjs"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a group of an inherited grouping is declared beside its rule or in one named instance, never under a pattern", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-instance-pattern-"));
  const put = (name: string, contents: string) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), contents);
  };
  try {
    put("espalier.config.yaml", `ignoreFiles: []\nskip: []\n`);
    put("espalier/[g]/[feature]/[num=0000]_[t=a+].sql.mjs", `export const groups = { step: { by: ["num"] } };\n`);
    put("espalier/a/ESPALIER.mjs", `export const instanceOf = "../[g]";\n`);
    put("espalier/a/[feature]/0001_[t=a+].sql.mjs", `export const instanceOf = "[num=0000]_[t=a+].sql.mjs";\n`);
    await assert.rejects(check({ cwd: root, jobs: 1 }), (error: { code: string; message: string }) =>
      error.code === "invalid_instance" && /away from it/.test(error.message));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
