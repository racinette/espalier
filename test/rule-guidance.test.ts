// Callback lifecycle, API context isolation, and build/check transitions cannot
// be observed by a single conformance run. fixtures/computed-rule-guidance pins
// the shared CLI output and inherited declaration contexts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check, runRule, runAggregate, type RuleGuidanceContext, type LintContext } from "../src/api.js";
import { loadConfig } from "../src/config.js";

const fixture = fileURLToPath(new URL("../../fixtures/computed-rule-guidance/", import.meta.url));
const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

function run(root: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

test("guidance is fresh per compilation and shared by serial and parallel findings", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-rule-guidance-"));
  try {
    cpSync(fixture, root, { recursive: true });
    const first = await check({ cwd: root, jobs: 1 });
    const sorted = (issues: typeof first) => issues.map(({path, code, ruleText, description}) =>
      JSON.stringify({path, code, ruleText, description})).sort();
    assert.deepEqual(sorted(await check({ cwd: root, jobs: 3 })), sorted(first));
    assert.ok(first.some(({ruleText}) => ruleText?.includes("; fixed.")));
    assert.ok(first.some(({description}) => description === "shared operation (fixed)"));
    const help = run(root, ["create", "flights", "help"]);
    assert.equal(help.status, 0, help.stdout + help.stderr);
    assert.match(help.stdout, /flight search \(fixed\)/);
    const built = run(root, ["build"]);
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const before = readFileSync(path.join(root, "AGENTS.MD"), "utf8");
    assert.equal(run(root, ["build", "--check"]).status, 0);
    const configPath = path.join(root, "espalier.config.yaml");
    writeFileSync(configPath, readFileSync(configPath, "utf8").replace("fixed", "evolving"));
    assert.equal(run(root, ["build", "--check"]).status, 1);
    assert.equal(readFileSync(path.join(root, "AGENTS.MD"), "utf8"), before);
    const next = await check({ cwd: root, jobs: 2 });
    assert.ok(next.some(({ruleText}) => ruleText?.includes("; evolving.")));
    assert.ok(next.every(({ruleText}) => !ruleText?.includes("; fixed.")));
    assert.ok(next.some(({description}) => description === "shared operation (evolving)"));
    assert.equal(run(root, ["build"]).status, 0);
    assert.match(readFileSync(path.join(root, "AGENTS.MD"), "utf8"), /flight operations \(evolving\)/);
    assert.equal(run(root, ["build", "--check"]).status, 0);
    assert.equal(existsSync(path.join(root, "hotels/AGENTS.MD")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("standalone helpers render explicit declaration contexts without changing lint matches", async () => {
  const guidance: RuleGuidanceContext = {
    config: loadConfig(undefined, fixture), pattern: "[group]/[module].ts", path: null, captures: {},
  };
  const original = structuredClone(guidance);
  let calls = 0;
  let descriptions = 0;
  const module = {
    description(context: RuleGuidanceContext) {
      descriptions++;
      assert.deepEqual(context, original);
      (context.captures as Record<string, string>).changed = "local";
      return "Shared description.";
    },
    async rule(context: RuleGuidanceContext) {
      calls++;
      assert.deepEqual(context, original);
      context.config.build.guidanceMode = "evolving";
      return "Shared declaration prose.";
    },
    lint({ path, captures, emit }: LintContext) {
      assert.equal(path, "flights/search.ts");
      assert.equal(captures.module, "search");
      emit({ code: "test", message: "Finding." });
    },
  };
  const issues = await runRule(module, {
    path: "flights/search.ts", captures: {module: "search"}, guidance,
  });
  assert.equal(issues[0]?.ruleText, "Shared declaration prose.");
  assert.equal(issues[0]?.description, "Shared description.");
  assert.deepEqual(guidance, original);
  assert.equal(calls, 1);
  const aggregate = { ...module, aggregate: true, lint({ emit }: Pick<LintContext, "emit">) {
    emit({ code: "group", message: "Group finding." });
  } };
  const collective = await runAggregate(aggregate, { matches: [], guidance });
  assert.equal(collective[0]?.ruleText, "Shared declaration prose.");
  assert.equal(calls, 2);
  assert.equal(descriptions, 2);
  assert.equal(collective[0]?.description, "Shared description.");
  assert.deepEqual(guidance, original);
  await assert.rejects(runRule(module, {path: "anything.ts"}), {code: "module_invalid_export"});
  await assert.rejects(runAggregate(aggregate, {matches: []}), {code: "module_invalid_export"});
  assert.equal(calls, 2);
});

test("guidance failure stops standalone lint with the compiler's error codes", async () => {
  const guidance: RuleGuidanceContext = {
    config: loadConfig(undefined, fixture), pattern: "file.ts", path: "file.ts", captures: {},
  };
  for (const [rule, code] of [
    [() => { throw new Error("broken"); }, "rule_guidance_failed"],
    [async () => { throw "rejected"; }, "rule_guidance_failed"],
    [async () => 42, "module_invalid_export"],
  ] as const) {
    let linted = false;
    const module = {rule, lint() { linted = true; }};
    await assert.rejects(runRule(module, {path: "file.ts", guidance}), {code});
    await assert.rejects(runAggregate({...module, aggregate: true}, {matches: [], guidance}), {code});
    assert.equal(linted, false);
  }
  const empty = await runRule({rule: () => "", lint({emit}: LintContext) {
    emit({code: "empty", message: "Empty prose is valid."});
  }}, {path: "file.ts", guidance});
  assert.equal(empty[0]?.ruleText, "");
});

test("standalone computed descriptions require context and fail before lint", async () => {
  const guidance: RuleGuidanceContext = {
    config: loadConfig(undefined, fixture), pattern: "file.ts", path: "file.ts", captures: {},
  };
  for (const [description, code] of [
    [() => { throw new Error("broken label"); }, "rule_guidance_failed"],
    [async () => { throw "rejected label"; }, "rule_guidance_failed"],
    [async () => 42, "module_invalid_export"],
  ] as const) {
    let linted = false;
    const module = {description, rule: "Static prose.", lint() { linted = true; }};
    await assert.rejects(runRule(module, {path: "file.ts", guidance}), {code});
    await assert.rejects(runAggregate({...module, aggregate: true}, {matches: [], guidance}), {code});
    assert.equal(linted, false);
  }
  const module = {description: () => "Label", rule: "Static prose.", lint() {}};
  await assert.rejects(runRule(module, {path: "file.ts"}), {code: "module_invalid_export"});
  await assert.rejects(runAggregate({...module, aggregate: true}, {matches: []}), {code: "module_invalid_export"});
});

for (const computed of ["directory", "file"]) {
  test(`a ${computed} description alone makes generated guidance stale`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "espalier-description-drift-"));
    try {
      mkdirSync(path.join(root, "espalier/area"), {recursive: true});
      mkdirSync(path.join(root, "area"));
      writeFileSync(path.join(root, "area/file.ts"), "");
      const config = readFileSync(path.join(fixture, "espalier.config.yaml"), "utf8");
      writeFileSync(path.join(root, "espalier.config.yaml"), config);
      const label = 'export function description({config}) { return `Label (${config.build.guidanceMode})`; }';
      writeFileSync(path.join(root, "espalier/area/ESPALIER.mjs"),
        computed === "directory" ? label : 'export const description = "Area";');
      writeFileSync(path.join(root, "espalier/area/file.ts.mjs"),
        (computed === "file" ? label : 'export const description = "File";') +
        'export const rule = "Static requirements."; export function lint() {}');
      const built = run(root, ["build"]);
      assert.equal(built.status, 0, built.stdout + built.stderr);
      assert.equal(run(root, ["build", "--check"]).status, 0);
      writeFileSync(path.join(root, "espalier.config.yaml"), config.replace("fixed", "evolving"));
      assert.equal(run(root, ["build", "--check"]).status, 1);
      assert.equal(run(root, ["build"]).status, 0);
      assert.equal(run(root, ["build", "--check"]).status, 0);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });
}
