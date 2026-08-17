// The programmatic surface. docs/API.MD.
//
// The conformance suite drives the CLI as a subprocess and can say nothing
// about what a caller in-process receives. These pin the other half: that the
// issues come back rather than going to a stream, and that a rule tested
// through `runRule` fails for the same reasons it would fail in production.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check, OperationalError, runRule } from "../src/api.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(here, "..", "..", "fixtures");

async function rejects(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof OperationalError, `expected an OperationalError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

test("check returns the issues a run would have printed", async () => {
  const issues = await check({ cwd: path.join(fixturesDir, "unexpected-path-recognized-node") });

  assert.ok(issues.length > 0);
  assert.ok(issues.every((issue) => issue.code === "unexpected_path"));
  assert.ok(issues.every((issue) => typeof issue.path === "string"));
});

test("check reports nothing for a conforming repository", async () => {
  const issues = await check({ cwd: path.join(fixturesDir, "ownership-static-beats-dynamic") });

  assert.deepEqual(
    issues.filter((issue) => issue.severity === "error"),
    [],
  );
});

test("check scopes to the paths it is given", async () => {
  const cwd = path.join(fixturesDir, "unexpected-path-recognized-node");
  const all = await check({ cwd });
  const scoped = await check({ cwd, paths: [path.join(cwd, "components")] });

  assert.ok(scoped.length < all.length);
  assert.ok(scoped.every((issue) => issue.path.startsWith("components/")));
});

test("check throws an OperationalError rather than returning it", async () => {
  await rejects(
    () => check({ cwd: path.join(fixturesDir, "invalid-capture-names") }),
    "inconsistent_capture_names",
  );
});

test("runRule returns what the module emitted, in the runner's shape", async () => {
  const module = {
    description: "a button component",
    rule: "Name the component after its file.",
    example: "components/Button.tsx",
    lint({ path: target, captures, emit }: any) {
      emit({ code: "name_mismatch", message: `${target} is not ${captures["name"]}`, line: 3 });
    },
  };

  const issues = await runRule(module, {
    path: "components/Button.tsx",
    pattern: "components/*.tsx",
    captures: { name: "Button" },
    rule: "components/[name].tsx.mjs",
  });

  assert.deepEqual(issues, [
    {
      path: "components/Button.tsx",
      code: "name_mismatch",
      message: "components/Button.tsx is not Button",
      severity: "error",
      rule: "components/[name].tsx.mjs",
      pattern: "components/*.tsx",
      captures: { name: "Button" },
      line: 3,
      column: null,
      metadata: {},
      ruleText: "Name the component after its file.",
      description: "a button component",
      example: "components/Button.tsx",
    },
  ]);
});

test("runRule defaults the pattern to the path and the module path to null", async () => {
  const module = {
    rule: "anything",
    lint: ({ emit }: any) => void emit({ code: "ran", message: "ran", severity: "info" }),
  };

  const [issue] = await runRule(module, { path: "src/index.ts" });

  assert.equal(issue?.pattern, "src/index.ts");
  assert.equal(issue?.rule, null);
  assert.deepEqual(issue?.captures, {});
});

test("runRule serves read and files from the supplied tree", async () => {
  const module = {
    rule: "anything",
    async lint({ read, files, emit }: any) {
      const own = await read();
      const other = await read("components/Other.tsx");
      const listed = await files("components/*.tsx");
      emit({ code: "seen", message: `${own}|${other}`, metadata: { listed } });
    },
  };

  const [issue] = await runRule(module, {
    path: "components/Button.tsx",
    tree: {
      "components/Other.tsx": "other",
      "components/Button.tsx": "button",
      "README.MD": "docs",
    },
  });

  assert.equal(issue?.message, "button|other");
  assert.deepEqual(issue?.metadata["listed"], ["components/Button.tsx", "components/Other.tsx"]);
});

test("runRule fails rather than inventing contents for a file the tree lacks", async () => {
  const module = {
    rule: "anything",
    lint: ({ read }: any) => read(),
  };

  await rejects(() => runRule(module, { path: "src/index.ts" }), "read_failed");
});

test("runRule accepts an injected read and files", async () => {
  let reads = 0;
  const module = {
    rule: "anything",
    async lint({ read, files, emit }: any) {
      await read();
      await read();
      emit({ code: "counted", message: "counted", metadata: { reads, listed: await files("*") } });
    },
  };

  const [issue] = await runRule(module, {
    path: "src/index.ts",
    read: async () => {
      reads += 1;
      return "";
    },
    files: async () => ["one", "two"],
  });

  assert.deepEqual(issue?.metadata["reads"], 2);
  assert.deepEqual(issue?.metadata["listed"], ["one", "two"]);
});

test("runRule hands the addons through untouched", async () => {
  const parser = { parse: () => "parsed" };
  const module = {
    rule: "anything",
    lint: ({ addons, emit }: any) => void emit({ code: "used", message: addons["parser"].parse() }),
  };

  const [issue] = await runRule(module, { path: "src/index.ts", addons: { parser } });

  assert.equal(issue?.message, "parsed");
});

test("runRule validates emitted issues exactly as the runner does", async () => {
  const emitting = (issue: unknown) => ({
    rule: "anything",
    lint: ({ emit }: any) => void emit(issue),
  });

  await rejects(() => runRule(emitting("a string"), { path: "a.ts" }), "invalid_issue");
  await rejects(() => runRule(emitting({ message: "no code" }), { path: "a.ts" }), "invalid_issue");
  await rejects(() => runRule(emitting({ code: "c" }), { path: "a.ts" }), "invalid_issue");
  await rejects(
    () => runRule(emitting({ code: "c", message: "m", severity: "fatal" }), { path: "a.ts" }),
    "invalid_issue",
  );
  await rejects(
    () => runRule(emitting({ code: "c", message: "m", path: "/etc/passwd" }), { path: "a.ts" }),
    "invalid_issue_path",
  );
  await rejects(
    () => runRule(emitting({ code: "c", message: "m", path: "../outside.ts" }), { path: "a.ts" }),
    "invalid_issue_path",
  );
});

test("runRule treats a throwing lint as a bug in the rule", async () => {
  const module = {
    rule: "anything",
    lint: () => {
      throw new TypeError("cannot read properties of undefined");
    },
  };

  await rejects(() => runRule(module, { path: "a.ts" }), "rule_threw");
});

test("runRule rejects something that is not a rule module", async () => {
  await rejects(() => runRule({ rule: "anything" } as never, { path: "a.ts" }), "module_missing_export");
});
