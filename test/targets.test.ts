// Filename and exported selectors admit governed files without defining repository structure.

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
  write(root, "espalier.config.yaml", "pin: 0.3.0\nroot: espalier\nignoreFiles: []\nskip: []\n");
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

test("targets select per-file and aggregate constraints while preserving the complete group", () => {
  const root = repository();
  try {
    write(
      root,
      "espalier/fixtures/[...fixture]/ordinary.mjs",
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
      "espalier/fixtures/[...fixture]/aggregate.mjs",
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
    const guidance = readFileSync(path.join(root, "fixtures/AGENTS.MD"), "utf8");
    assert.doesNotMatch(guidance, /## Per-file constraints|## Aggregate constraints/);
    assert.match(guidance, /Each path matching `\*\/queries\.sql` under `fixtures\/` must follow this rule\./);
    assert.match(guidance.replace(/\s+/g, " "), /Together, paths matching `\*\/queries\.sql` under `fixtures\/` must follow this rule\./);
    assert.doesNotMatch(guidance, /Scope:/);
    assert.doesNotMatch(guidance, /Selected files:/);
    assert.doesNotMatch(guidance, /Evaluation:/);
    assert.doesNotMatch(guidance, /These rules apply to all/);
    assert.doesNotMatch(guidance, /this constraint's scope/);
    assert.doesNotMatch(guidance, /owned paths/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exact filename extensions and broad target globs select and describe different files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "espalier-selector-distinction-"));
  try {
    write(root, "espalier.config.yaml", "pin: 0.3.0\nroot: espalier\nignoreFiles: []\nskip: []\n");
    write(root, "espalier/[name].{json,schema.json}.mjs", rule());
    write(root, "espalier/[name].md.mjs", rule());
    write(root, "a.json", "{}\n");
    write(root, "a.schema.json", "{}\n");
    write(root, "b.md", "# b\n");
    for (const [name, selector] of [
      ["filename.json", ""],
      ["exported", 'export const targets = ["**/*.json"];'],
    ]) {
      write(root, `espalier/[...path]/${name}.mjs`, `
export const rule = "JSON only";
${selector}
export async function lint({ emit }) {
  emit({ code: "${name}", severity: "info", message: "selected" });
}
`);
    }
    for (const [name, selector] of [
      ["group-file.json", ""],
      ["group-target", 'export const targets = ["**/*.json"];'],
    ]) {
      write(root, `espalier/[...path]/${name}.mjs`, `
export const aggregate = true;
export const rule = "JSON together";
${selector}
export async function lint({ matches, emit }) {
  emit({ code: "${name}", severity: "info", message: matches.map(({ path }) => path).join(",") });
}
`);
    }

    const result = lint(root);
    assert.equal(result.status, 0, result.stderr);
    const issues = result.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.deepEqual(
      issues.filter((issue) => issue.code === "filename.json").map((issue) => issue.path),
      ["a.json"],
    );
    assert.deepEqual(
      issues.filter((issue) => issue.code === "exported").map((issue) => issue.path),
      ["a.json", "a.schema.json"],
    );
    assert.equal(issues.find((issue) => issue.code === "group-file.json")?.message, "a.json");
    assert.equal(issues.find((issue) => issue.code === "group-target")?.message, "a.json,a.schema.json");

    const explained = spawnSync(process.execPath, [cli, "explain", "--format", "jsonl", "a.json"], {
      cwd: root, encoding: "utf8",
    });
    assert.equal(explained.status, 0, explained.stderr);
    const answer = JSON.parse(explained.stdout) as { constraints: { name: string; description: string; patterns: string[] }[] };
    const byName = new Map(answer.constraints.map((constraint) => [constraint.name, constraint]));
    assert.notEqual(byName.get("filename")?.description, byName.get("exported")?.description);
    assert.notEqual(byName.get("group-file")?.description, byName.get("group-target")?.description);
    assert.match(byName.get("filename")!.description, /exactly `\.json` as their extension/);
    assert.match(byName.get("exported")!.description, /names end in `\.json`/);
    for (const constraint of answer.constraints) assert.deepEqual(constraint.patterns, ["**/*.json"]);

    const explainedCompound = spawnSync(process.execPath, [cli, "explain", "--format", "jsonl", "a.schema.json"], {
      cwd: root, encoding: "utf8",
    });
    assert.equal(explainedCompound.status, 0, explainedCompound.stderr);
    const compound = JSON.parse(explainedCompound.stdout) as { pattern: string; captures: Record<string, string>; constraints: { name: string }[] };
    assert.equal(compound.pattern, "*.schema.json");
    assert.deepEqual(compound.captures, { name: "a" });
    assert.deepEqual(compound.constraints.map((constraint) => constraint.name), ["exported", "group-target"]);

    const built = spawnSync(process.execPath, [cli, "build"], { cwd: root, encoding: "utf8" });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const guidance = readFileSync(path.join(root, "AGENTS.MD"), "utf8");
    assert.doesNotMatch(guidance, /## Per-file constraints|## Aggregate constraints|^### Files with complete extension/m);
    assert.match(guidance, /^## filename/m);
    assert.match(guidance, /^## exported/m);
    assert.match(guidance, /Each file whose name ends in `\.json` in this project must\s+follow this rule\./);
    assert.match(guidance.replace(/\s+/g, " "), /Each file with exactly `\.json` as its extension in this project must follow this rule\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a compound filename suffix selects its full dotted extension", () => {
  const root = mkdtempSync(path.join(tmpdir(), "espalier-compound-suffix-"));
  try {
    write(root, "espalier.config.yaml", "pin: 0.3.0\nroot: espalier\nignoreFiles: []\nskip: []\n");
    for (const suffix of ["up.sql", "down.sql"]) {
      write(root, `espalier/migrations/[migration].${suffix}.mjs`, rule());
      write(root, `migrations/001.${suffix}`, "-- migration\n");
    }
    write(root, "espalier/migrations/[migration].sql.mjs", rule());
    write(root, "migrations/002.sql", "-- other\n");
    write(root, "espalier/migrations/001.sql.mjs", rule());
    write(root, "migrations/001.sql", "-- other\n");
    write(root, "espalier/migrations/[...path]/only-up.up.sql.mjs", `
export const rule = "up migrations";
export async function lint({ emit }) { emit({ code: "up", severity: "info", message: "up" }); }
`);
    write(root, "espalier/migrations/[...path]/pair.{up.sql,down.sql}.mjs", `
export const aggregate = true;
export const rule = "migration pairs";
export async function lint({ matches, emit }) {
  emit({ code: "pair", severity: "info", message: matches.map(({ path }) => path).join(",") });
}
`);

    const result = lint(root);
    assert.equal(result.status, 0, result.stderr);
    const issues = result.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.deepEqual(issues.filter((issue) => issue.code === "up").map((issue) => issue.path), ["migrations/001.up.sql"]);
    assert.equal(issues.find((issue) => issue.code === "pair")?.message, "migrations/001.down.sql,migrations/001.up.sql");
    assert.deepEqual(issues.find((issue) => issue.code === "pair")?.pattern, "migrations/**/*.down.sql | migrations/**/*.up.sql");

    const explainedPlain = spawnSync(process.execPath, [cli, "explain", "--format", "jsonl", "migrations/002.sql"], {
      cwd: root, encoding: "utf8",
    });
    assert.equal(explainedPlain.status, 0, explainedPlain.stderr);
    assert.equal(JSON.parse(explainedPlain.stdout).rule, "migrations/[migration].sql.mjs");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("structural unions and constraint lists match complete extensions once", () => {
  const root = mkdtempSync(path.join(tmpdir(), "espalier-exact-extensions-"));
  try {
    write(root, "espalier.config.yaml", "pin: 0.3.0\nroot: espalier\nignoreFiles: []\nskip: []\n");
    write(root, "espalier/[file].{ts,d.ts,tsx}.mjs", rule());
    write(root, "espalier/[file].test.ts.mjs", rule());
    for (const name of ["foo.ts", "foo.d.ts", "foo.tsx", "foo.test.ts"]) write(root, name, "export {};\n");
    write(root, "espalier/[...path]/exact.{ts,d.ts,tsx}.mjs", `
export const rule = "Check these complete extensions.";
export async function lint({ emit }) { emit({ code: "exact", severity: "info", message: "selected" }); }
`);
    write(root, "espalier/[...path]/glob.mjs", `
export const targets = ["**/*.ts"];
export const rule = "Check names ending in .ts.";
export async function lint({ emit }) { emit({ code: "glob", severity: "info", message: "selected" }); }
`);

    const result = lint(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const issues = result.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.deepEqual(issues.filter((issue) => issue.code === "exact").map((issue) => issue.path),
      ["foo.d.ts", "foo.ts", "foo.tsx"]);
    assert.deepEqual(issues.filter((issue) => issue.code === "glob").map((issue) => issue.path),
      ["foo.d.ts", "foo.test.ts", "foo.ts"]);

    const explained = spawnSync(process.execPath, [cli, "explain", "--format", "jsonl", "foo.d.ts"], {
      cwd: root, encoding: "utf8",
    });
    assert.equal(explained.status, 0, explained.stderr);
    const answer = JSON.parse(explained.stdout) as { rule: string; pattern: string; captures: Record<string, string> };
    assert.equal(answer.rule, "[file].{ts,d.ts,tsx}.mjs");
    assert.equal(answer.pattern, "*.d.ts");
    assert.deepEqual(answer.captures, { file: "foo" });

    const built = spawnSync(process.execPath, [cli, "build"], { cwd: root, encoding: "utf8" });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const guidance = readFileSync(path.join(root, "AGENTS.MD"), "utf8");
    assert.match(guidance.replace(/\s+/g, " "), /Each file with exactly `\.ts`, `\.d\.ts` or `\.tsx` as its extension in this project must follow this rule\./);
    assert.match(guidance.replace(/\s+/g, " "), /Each file whose name ends in `\.ts` in this project must follow this rule\./);
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
        "espalier/fixtures/[...fixture]/invalid.mjs",
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

test("aggregate cache membership follows the selector", () => {
  const root = repository();
  try {
    rmSync(path.join(root, "fixtures/beta"), { recursive: true, force: true });
    write(
      root,
      "espalier/fixtures/[...fixture]/aggregate.mjs",
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
