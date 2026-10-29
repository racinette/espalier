// Groupings of a dynamic rule's files. docs/TYPES.MD "groups". The fixture
// pins the lint, explain and build outcomes; these tests cover the API and the
// run options a fixture cannot express.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { check, runGroup } from "../src/api.js";
import { VERSION } from "../src/version.js";

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
    put("espalier.config.yaml", `pin: ${VERSION}\nignoreFiles: []\nskip: []\n`);
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
    put("espalier.config.yaml", `pin: ${VERSION}\nignoreFiles: []\nskip: []\n`);
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
