// Worker concurrency, initialization barriers, snapshots and cleanup need
// thread identity and lifecycle instrumentation beyond conformance fixtures.
// docs/cli/lint/README.MD "Parallel execution"; docs/CONFIG.MD "addons".

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { check, OperationalError } from "../src/api.js";
import { PACKAGE_ROOT } from "../src/version.js";

function write(root: string, file: string, contents: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), contents);
}
function repository(rule: string, addon = ""): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-parallel-"));
  write(root, "espalier.config.yaml", `pin: 0.9.0\nroot: espalier\nignoreFiles: []\nskip: []\n${addon ? "addons: addon.mjs\n" : ""}`);
  write(root, ".espalierignore", "addon.mjs\ntrace.txt\nhelper.mjs\n");
  write(root, "espalier/[file].ts.mjs", `export const description = "a file";\nexport const rule = "Check the source.";\n${rule}`);
  write(root, "a.ts", "original a");
  write(root, "b.ts", "original b");
  if (addon) write(root, "addon.mjs", addon);
  return root;
}
async function rejects(root: string, code: string, jobs = 2): Promise<void> {
  await assert.rejects(check({ cwd: root, jobs }), (error: unknown) => {
    assert.ok(error instanceof OperationalError, String(error));
    assert.equal(error.code, code, error.message);
    return true;
  });
}
const tracing = `import { appendFileSync } from "node:fs";
const trace = (text) => appendFileSync(new URL("trace.txt", import.meta.url), text + "\\n");`;

test("prepare runs once, all setups finish first, and synchronous jobs execute on different threads", async () => {
  const root = repository(`import { threadId } from "node:worker_threads";
export function lint({ addons, emit }) {
  const gate = new Int32Array(addons.gate);
  if (Atomics.load(gate, 0) !== 2) throw Error("setup barrier was skipped");
  Atomics.add(gate, 1, 1);
  Atomics.notify(gate, 1);
  while (Atomics.load(gate, 1) < 2) {
    if (Atomics.wait(gate, 1, 1, 5000) === "timed-out") throw Error("jobs did not run in parallel");
  }
  emit({code:"parallel", message:"ran", severity:"info", metadata:{threadId, paths:addons.paths}});
}`, `${tracing}
import { isMainThread, threadId } from "node:worker_threads";
export async function prepare({files}) {
  if (!isMainThread) throw Error("prepare ran in a worker");
  trace("prepare");
  return { gate:new SharedArrayBuffer(8), paths:await files("*.ts") };
}
export async function setup(data) {
  if (isMainThread) throw Error("setup ran in coordinator");
  await new Promise(resolve => setTimeout(resolve, threadId % 2 ? 25 : 5));
  Atomics.add(new Int32Array(data.gate), 0, 1);
  trace("setup");
  return {...data, [Symbol.asyncDispose]() { trace("dispose"); }};
}`);
  try {
    const issues = await check({ cwd: root, jobs: 2 });
    assert.equal(issues.length, 2);
    assert.equal(new Set(issues.map(issue => issue.metadata.threadId)).size, 2);
    for (const issue of issues) assert.deepEqual(issue.metadata.paths, ["a.ts", "b.ts"]);
    assert.deepEqual(readFileSync(path.join(root,"trace.txt"),"utf8").trim().split("\n"), ["prepare","setup","setup","dispose","dispose"]);
  } finally { rmSync(root, { recursive:true, force:true }); }
});

test("scoped prepare sees the full snapshot and workers read that same snapshot", async () => {
  const root = repository(`export async function lint({read, addons, emit}) {
  emit({code:"snapshot", message:await read("b.ts"), severity:"info", metadata:{prepared:addons.source}});
}`, `import { writeFileSync } from "node:fs";
export async function prepare({read, files}) {
  return { source:await read("b.ts"), paths:await files("*.ts") };
}
export function setup(data) {
  if (data.paths.length !== 2) throw Error("preparation was scoped");
  writeFileSync(new URL("b.ts",import.meta.url), "changed after snapshot");
  return data;
}`);
  try {
    const [issue] = await check({ cwd:root, jobs:2, paths:["a.ts"] });
    assert.equal(issue?.message, "original b");
    assert.equal(issue?.metadata.prepared, "original b");
    assert.equal(readFileSync(path.join(root,"b.ts"),"utf8"),"changed after snapshot");
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test("one failing setup prevents lint and disposes other initialized workers", async () => {
  const root = repository(`import { appendFileSync } from "node:fs";
export function lint() { appendFileSync(new URL("../trace.txt",import.meta.url), "lint\\n"); }`, `${tracing}
export function prepare() { return new SharedArrayBuffer(4); }
export async function setup(buffer) {
  if (Atomics.add(new Int32Array(buffer), 0, 1) === 0) {
    await new Promise(resolve => setTimeout(resolve, 50));
    throw Error("setup failed");
  }
  trace("setup");
  return {[Symbol.dispose]() { trace("dispose"); }};
}`);
  try {
    await rejects(root,"addons_setup_failed");
    assert.equal(readFileSync(path.join(root,"trace.txt"),"utf8"),"setup\ndispose\n");
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test("rule failure disposes workers and unexpected zero exit fails instead of hanging", async () => {
  for (const [body, code] of [[`throw Error("broken rule")`,"rule_threw"],["process.exit(0)","worker_failed"]]) {
    const root = repository(`export function lint() { ${body}; }`, `${tracing}\nexport function setup() { trace("setup"); return {[Symbol.asyncDispose]() { trace("dispose"); }}; }`);
    try {
      await rejects(root,code!,1);
      if (code === "rule_threw") assert.equal(readFileSync(path.join(root,"trace.txt"),"utf8"),"setup\ndispose\n");
    } finally { rmSync(root,{recursive:true,force:true}); }
  }
});

test("preparation validates governed access and cloneability before starting workers", async () => {
  for (const [body, code] of [
    ['return { fn() {} }', 'addons_invalid_prepared'],
    ['throw Error("bad preparation")', 'addons_prepare_failed'],
    ['return await read("helper.mjs")', 'read_ungoverned'],
  ]) {
    const root = repository('export function lint() {}', `${tracing}\nexport async function prepare({read}) { ${body}; }\nexport function setup() { trace("setup"); }`);
    try {
      write(root,"helper.mjs","ignored data");
      await rejects(root,code!);
      assert.equal(existsSync(path.join(root,"trace.txt")),false);
    } finally { rmSync(root,{recursive:true,force:true}); }
  }
});

test("an idle worker dying while another job runs fails the run", async () => {
  const root = repository(`export async function lint({path}) {
    if (path === "a.ts") setTimeout(() => process.exit(0), 20);
    else await new Promise(resolve => setTimeout(resolve, 150));
  }`);
  try { await rejects(root, "worker_failed"); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("disposal failure is reported after every worker releases its resources", async () => {
  const root = repository("export function lint() {}", `${tracing}
export function setup() {
  return {
    [Symbol.dispose]() { trace("wrong disposer"); },
    [Symbol.asyncDispose]() { trace("dispose"); throw Error("cannot close"); }
  };
}`);
  try {
    await rejects(root, "addons_dispose_failed");
    assert.equal(readFileSync(path.join(root, "trace.txt"), "utf8"), "dispose\ndispose\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("workers inherit the TypeScript loader for rule and addon helpers", () => {
  const root = repository(`import { answer } from "../helper.ts";
export function lint({emit, addons}) {
  emit({code:"typed", severity:"info", message:answer + addons.answer});
}`, `import { answer } from "./helper.ts";
export function prepare() { return answer; }
export function setup(answer) { return { answer }; }`);
  try {
    write(root, ".espalierignore", "addon.mjs\nhelper.ts\n");
    const cli = path.join(PACKAGE_ROOT, "dist/src/cli.js");
    for (const value of ["first", "changed"]) {
      write(root, "helper.ts", `export const answer: string = "${value}";`);
      const result = spawnSync(process.execPath,
        ["--import", import.meta.resolve("tsx"), cli, "lint", "--jobs", "2", "--format", "jsonl"],
        { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const issues = result.stdout.trim().split("\n").map(line => JSON.parse(line));
      assert.deepEqual(issues.map(issue => issue.message), [value + value, value + value]);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a failed disposer cannot keep the command alive with an open handle", () => {
  const root = repository("export function lint() {}", `export function setup() {
    setInterval(() => {}, 1000);
    return { [Symbol.dispose]() { throw Error("broken cleanup"); } };
  }`);
  try {
    const result = spawnSync(process.execPath,
      [path.join(PACKAGE_ROOT, "dist/src/cli.js"), "lint", "--jobs", "1"],
      { cwd: root, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 2, String(result.error) + result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /addons_dispose_failed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("programmatic checks work from module-mode eval callers", () => {
  const root = repository("export function lint() {}");
  try {
    const script = `import { check } from ${JSON.stringify(import.meta.resolve("../src/api.js"))};
      await check({ cwd: process.argv[1], jobs: 2 });`;
    for (const mode of [["--input-type=module"], ["--input-type", "module"]]) {
      const result = spawnSync(process.execPath, [...mode, "--eval", script, root], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("serial and parallel findings agree and every check loads current helpers", async () => {
  const root = repository(`import { value } from "../helper.mjs";
export async function lint({emit, files, read}) {
  const siblings = await files("*.ts");
  emit({code:"fresh",message:value+":"+await read("b.ts"),metadata:{siblings}});
}`);
  try {
    write(root,"helper.mjs",'export const value = "first";');
    const order = (issues: Awaited<ReturnType<typeof check>>) => issues.sort((a,b) => a.path.localeCompare(b.path));
    assert.deepEqual(order(await check({cwd:root,jobs:1})),order(await check({cwd:root,jobs:2})));
    write(root,"helper.mjs",'export const value = "changed";');
    write(root,"b.ts","updated source");
    const changed = await check({cwd:root,jobs:2});
    assert.deepEqual(changed.map(issue=>issue.message),["changed:updated source","changed:updated source"]);
    assert.equal(existsSync(path.join(root,"espalier/.cache")),false);
    write(root,"espalier/.cache/lint.jsonl","old findings\n");
    await check({cwd:root,jobs:1});
    assert.equal(readFileSync(path.join(root,"espalier/.cache/lint.jsonl"),"utf8"),"old findings\n");
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test("job limits are validated and removed cache options are rejected", async () => {
  const root=repository('export function lint() {}');
  try {
    for (const jobs of [0,-1,1.5,NaN,Infinity,"2"]) {
      await assert.rejects(check({cwd:root,jobs:jobs as never}), (error:unknown) => error instanceof OperationalError && error.code==="invalid_jobs");
    }
    await assert.rejects(check({cwd:root,...{cache:true}}), (error:unknown) => error instanceof OperationalError && error.code==="invalid_check_options");
    const cli=path.join(PACKAGE_ROOT,"dist/src/cli.js");
    for (const args of [["--cache"],["--jobs","0"],["--jobs","invalid"]]) {
      const result=spawnSync(process.execPath,[cli,"lint",...args],{cwd:root,encoding:"utf8"});
      assert.equal(result.status,2,result.stdout+result.stderr);
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("configured jobs controls worker setup counts and explicit API or CLI options override it", async () => {
  const root = repository('export function lint() {}', `${tracing}\nexport function setup() { trace('setup'); }`);
  const config = readFileSync(path.join(root, "espalier.config.yaml"), "utf8");
  const cli = path.join(PACKAGE_ROOT, "dist/src/cli.js");
  const count = () => readFileSync(path.join(root, "trace.txt"), "utf8").trim().split("\n").length;
  const clear = () => rmSync(path.join(root, "trace.txt"), { force: true });
  try {
    write(root, "espalier.config.yaml", config + "lint:\n  jobs: 1\n");
    await check({ cwd: root });
    assert.equal(count(), 1);
    clear();
    const automatic = Math.min(2, os.availableParallelism());
    for (const [jobs, expected] of [[2, 2], ["auto", automatic]] as const) {
      await check({ cwd: root, jobs });
      assert.equal(count(), expected);
      clear();
    }
    for (const [args, expected] of [[[], 1], [["--jobs", "2"], 2], [["--jobs", "auto"], automatic]] as const) {
      const result = spawnSync(process.execPath, [cli, "lint", ...args], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(count(), expected);
      clear();
    }
    write(root, "espalier.config.yaml", config + "lint:\n  jobs: 2\n");
    await check({ cwd: root, jobs: 1 });
    assert.equal(count(), 1);
    clear();
    for (const setting of ["", "lint: {}\n", "lint:\n  jobs: auto\n"]) {
      write(root, "espalier.config.yaml", config + setting);
      await check({ cwd: root });
      assert.equal(count(), automatic);
      clear();
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("nested projects use their own jobs defaults unless the invocation overrides them", async () => {
  const root = repository('export function lint() {}', `${tracing}\nexport function setup() { trace('setup'); }`);
  const child = path.join(root, "packages/child");
  try {
    const config = readFileSync(path.join(root, "espalier.config.yaml"), "utf8");
    write(root, "espalier.config.yaml", config + "lint:\n  jobs: 1\n");
    write(child, "espalier.config.yaml", config + "lint:\n  jobs: 2\n");
    for (const file of [".espalierignore", "addon.mjs", "espalier/[file].ts.mjs", "a.ts", "b.ts"]) {
      write(child, file, readFileSync(path.join(root, file), "utf8"));
    }
    for (const jobs of [undefined, 1, 2] as const) {
      await check({ cwd: root, jobs });
      for (const [project, expected] of [[root, jobs ?? 1], [child, jobs ?? 2]] as const) {
        const trace = path.join(project, "trace.txt");
        assert.equal(readFileSync(trace, "utf8").trim().split("\n").length, expected);
        rmSync(trace);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
