// Aggregate constraint execution and caching. docs/TYPES.MD "aggregate".

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { check, OperationalError, runAggregate, runRule } from "../src/api.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(path.resolve(here, "..", ".."), "dist", "src", "cli.js");

function write(root: string, relative: string, contents: string): void {
  const at = path.join(root, relative);
  mkdirSync(path.dirname(at), { recursive: true });
  writeFileSync(at, contents);
}

function repository(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-aggregate-"));
  write(root, "espalier.config.yaml", "version: 1\nroot: espalier\n");
  write(
    root,
    "espalier/[name].json.mjs",
    'export const description = "a data file";\nexport const rule = `Valid JSON.`;\nexport async function lint() {}\n',
  );
  write(
    root,
    "espalier/[...path]/count.json.mjs",
    `export const aggregate = true;
export const rule = \`Count the data files together.\`;
export async function lint({ matches, emit }) {
  emit({ code: "count", message: \`\${matches.length}:\${process.env.ESPALIER_TEST_TOKEN}\`, severity: "warning" });
}
`,
  );
  write(root, "a.json", "{}\n");
  return root;
}

function aggregateMessage(root: string, token: string): string {
  const result = spawnSync(process.execPath, [cli, "lint", "--format", "jsonl"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ESPALIER_TEST_TOKEN: token },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const issue = result.stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find((line) => line["code"] === "count");
  assert.ok(issue);
  return issue["message"] as string;
}

test("runAggregate supplies one sorted group context", async () => {
  const module = {
    aggregate: true,
    rule: "Compare the group.",
    async lint(context: Record<string, unknown>) {
      const matches = context["matches"] as { path: string }[];
      const read = context["read"] as (path: string) => Promise<string>;
      const emit = context["emit"] as (issue: unknown) => void;
      emit({
        code: "grouped",
        message: `${matches.map((match) => match.path).join(",")}:${await read(matches[0]!.path)}`,
      });
    },
  };

  const issues = await runAggregate(module, {
    matches: [{ path: "fixtures/b.json" }, { path: "fixtures/a.json", captures: { fixture: ["a"] } }],
    pattern: "fixtures/**/*.json",
    at: "fixtures/",
    tree: { "fixtures/a.json": "a", "fixtures/b.json": "b" },
    rule: "fixtures/[...fixture]/group.json.mjs",
  });

  assert.deepEqual(issues.map(({ path, pattern, captures, message }) => ({ path, pattern, captures, message })), [
    {
      path: "fixtures/",
      pattern: "fixtures/**/*.json",
      captures: {},
      message: "fixtures/a.json,fixtures/b.json:a",
    },
  ]);
});

test("runRule refuses aggregate modules", async () => {
  await assert.rejects(
    () => runRule({ aggregate: true, lint() {} }, { path: "a.json" }),
    (error: unknown) => error instanceof OperationalError && error.code === "module_invalid_export",
  );
});

test("aggregate is valid only as a boolean on constraints", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-aggregate-export-"));
  try {
    write(root, "espalier.config.yaml", "version: 1\nroot: espalier\n");
    write(
      root,
      "espalier/[name].ts.mjs",
      'export const aggregate = true;\nexport const description = "a file";\nexport const rule = `r`;\nexport async function lint() {}\n',
    );
    await assert.rejects(
      () => check({ cwd: root }),
      (error: unknown) => error instanceof OperationalError && error.code === "module_invalid_export",
    );

    rmSync(path.join(root, "espalier"), { recursive: true });
    write(
      root,
      "espalier/[...path]/group.ts.mjs",
      'export const aggregate = "yes";\nexport const rule = `r`;\nexport async function lint() {}\n',
    );
    await assert.rejects(
      () => check({ cwd: root }),
      (error: unknown) => error instanceof OperationalError && error.code === "module_invalid_export",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("aggregate cache entries depend on group membership", () => {
  const root = repository();
  try {
    assert.equal(aggregateMessage(root, "first"), "1:first");
    assert.equal(aggregateMessage(root, "second"), "1:first", "the aggregate was not replayed");
    write(root, "b.json", "{}\n");
    assert.equal(aggregateMessage(root, "third"), "2:third");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
