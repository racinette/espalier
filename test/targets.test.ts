// Constraint target selectors narrow governed files without defining repository structure.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { spawnSync } from "node:child_process";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

function write(root: string, relative: string, contents: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function rule(body = ""): string {
  return `
export const description = "a test rule";
export const rule = "test rule";
export async function lint(context) { ${body} }
`;
}

function repository(): string {
  const root = mkdtempSync(path.join(tmpdir(), "espalier-targets-"));
  write(root, "espalier.config.yaml", "version: 1\npin: 0.1.0\nroot: espalier\n");
  for (const name of ["queries", "schema", "data"]) {
    write(root, `espalier/fixtures/[fixture]/${name}.sql.mjs`, rule());
  }
  for (const fixture of ["alpha", "beta"]) {
    for (const name of ["queries", "schema", "data"]) {
      write(root, `fixtures/${fixture}/${name}.sql`, `-- ${fixture} ${name}\n`);
    }
  }
  return root;
}

function lint(root: string, scopes: string[] = [], token?: string) {
  return spawnSync(
    process.execPath,
    [cli, "lint", "--format", "jsonl", ...scopes],
    {
      cwd: root,
      encoding: "utf8",
      env: token === undefined ? process.env : { ...process.env, TARGET_TOKEN: token },
    },
  );
}

test("targets narrow ordinary and aggregate constraints while preserving the complete group", () => {
  const root = repository();
  try {
    write(
      root,
      "espalier/fixtures/[...fixture]/ordinary.sql.mjs",
      `
export const description = "queries individually";
export const rule = "queries individually";
export const targets = ["*/queries.sql"];
export async function lint({ read, emit }) {
  const source = await read();
  emit({ code: "ordinary", severity: "error", message: "ordinary:" + source.trim() });
}
`,
    );
    write(
      root,
      "espalier/fixtures/[...fixture]/aggregate.sql.mjs",
      `
export const description = "queries together";
export const rule = "queries together";
export const aggregate = true;
export const targets = ["*/queries.sql"];
export async function lint({ matches, emit }) {
  emit({ code: "aggregate", severity: "error", message: "aggregate:" + matches.map(({ path }) => path).join(",") });
}
`,
    );

    const full = lint(root);
    assert.equal(full.status, 1, full.stderr);
    assert.match(full.stdout, /ordinary:-- alpha queries/);
    assert.match(full.stdout, /ordinary:-- beta queries/);
    assert.doesNotMatch(full.stdout, /ordinary:-- .* (schema|data)/);
    assert.match(full.stdout, /aggregate:fixtures\/alpha\/queries\.sql,fixtures\/beta\/queries\.sql/);

    const fixtureScope = lint(root, ["fixtures/alpha"]);
    assert.equal(fixtureScope.status, 1, fixtureScope.stderr);
    assert.match(fixtureScope.stdout, /ordinary:-- alpha queries/);
    assert.doesNotMatch(fixtureScope.stdout, /ordinary:-- beta queries/);
    assert.match(
      fixtureScope.stdout,
      /aggregate:fixtures\/alpha\/queries\.sql,fixtures\/beta\/queries\.sql/,
    );

    const rejectedSibling = lint(root, ["fixtures/alpha/schema.sql"]);
    assert.equal(rejectedSibling.status, 0, rejectedSibling.stderr);
    assert.doesNotMatch(rejectedSibling.stdout, /ordinary:|aggregate:/);

    const explainedQuery = spawnSync(
      process.execPath,
      [cli, "explain", "--format", "jsonl", "fixtures/alpha/queries.sql"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(explainedQuery.status, 0, explainedQuery.stderr);
    assert.match(explainedQuery.stdout, /"targets":\["\*\/queries\.sql"\]/);

    const explainedSchema = spawnSync(
      process.execPath,
      [cli, "explain", "--format", "jsonl", "fixtures/alpha/schema.sql"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(explainedSchema.status, 0, explainedSchema.stderr);
    assert.doesNotMatch(explainedSchema.stdout, /queries individually|queries together/);

    const built = spawnSync(process.execPath, [cli, "build", "--force"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    assert.match(
      readFileSync(path.join(root, "fixtures/AGENTS.MD"), "utf8"),
      /Only governed paths matching `\*\/queries\.sql` under this constraint's scope are selected\./,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("targets must be a non-empty array of relative positive globs", () => {
  const invalid = ["queries.sql", [], ["!queries.sql"], ["/queries.sql"], ["../queries.sql"]];
  for (const targets of invalid) {
    const root = repository();
    try {
      write(
        root,
        "espalier/fixtures/[...fixture]/invalid.sql.mjs",
        `${rule()}\nexport const targets = ${JSON.stringify(targets)};\n`,
      );
      const result = lint(root);
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /module_invalid_export/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("targets are invalid on structural rules", () => {
  const root = repository();
  try {
    write(
      root,
      "espalier/fixtures/[fixture]/queries.sql.mjs",
      `${rule()}\nexport const targets = ["queries.sql"];\n`,
    );
    const result = lint(root);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /module_invalid_export/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("aggregate cache membership follows targets rather than the broad extension", () => {
  const root = repository();
  try {
    rmSync(path.join(root, "fixtures/beta"), { recursive: true, force: true });
    write(
      root,
      "espalier/fixtures/[...fixture]/aggregate.sql.mjs",
      `
export const description = "queries together";
export const rule = "queries together";
export const aggregate = true;
export const targets = ["*/queries.sql"];
export async function lint({ emit }) {
  emit({ code: "aggregate", severity: "error", message: process.env.TARGET_TOKEN });
}
`,
    );

    assert.match(lint(root, [], "first").stdout, /first/);
    assert.match(lint(root, [], "second").stdout, /first/);

    write(root, "fixtures/beta/schema.sql", "-- beta schema\n");
    assert.match(lint(root, [], "third").stdout, /first/);

    write(root, "fixtures/beta/queries.sql", "-- beta queries\n");
    assert.match(lint(root, [], "fourth").stdout, /fourth/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
