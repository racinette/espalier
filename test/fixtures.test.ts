// The conformance suite. Each directory under fixtures/ is a miniature
// repository; this runs the real CLI against it and compares the result with
// its expected.json. See fixtures/README.MD for the comparison rules.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const cli = path.join(root, "dist", "src", "cli.js");
const fixturesDir = path.join(root, "fixtures");

interface Expected {
  exit: number;
  error?: string;
  issues?: unknown[];
  explain?: Record<string, unknown>;
}

/**
 * Compares `actual` against `expected`, ignoring anything `expected` does not
 * mention. The rule applies at every depth, so an expected `metadata` naming
 * two keys asserts nothing about a third. Arrays are compared in order and by
 * length — a declared list is sorted, so its order is meaningful.
 *
 * Returns a description of the first mismatch, or null when it matches.
 */
function mismatch(actual: unknown, expected: unknown, at: string): string | null {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return `${at}: expected an array, got ${JSON.stringify(actual)}`;
    }
    if (actual.length !== expected.length) {
      return `${at}: expected ${expected.length} entries, got ${actual.length}`;
    }
    for (const [i, value] of expected.entries()) {
      const found = mismatch(actual[i], value, `${at}[${i}]`);
      if (found) return found;
    }
    return null;
  }

  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
      return `${at}: expected an object, got ${JSON.stringify(actual)}`;
    }
    const target = actual as Record<string, unknown>;
    for (const [key, value] of Object.entries(expected)) {
      if (!(key in target)) return `${at}.${key}: absent`;
      const found = mismatch(target[key], value, `${at}.${key}`);
      if (found) return found;
    }
    return null;
  }

  if (actual !== expected) {
    return `${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  return null;
}

/**
 * Issues are compared as an unordered multiset: the runner promises no order,
 * but two identical issues are not one issue. Matching is greedy, which is
 * sufficient while no fixture expects two issues where one expectation is a
 * strict refinement of another.
 */
function compareIssues(actual: unknown[], expected: unknown[]): string[] {
  const unmatched = [...actual];
  const problems: string[] = [];

  for (const [i, want] of expected.entries()) {
    const at = unmatched.findIndex((got) => mismatch(got, want, "issue") === null);
    if (at === -1) {
      problems.push(`no issue matched expected[${i}]: ${JSON.stringify(want)}`);
    } else {
      unmatched.splice(at, 1);
    }
  }

  for (const extra of unmatched) {
    problems.push(`unexpected issue: ${JSON.stringify(extra)}`);
  }
  return problems;
}

function run(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function parseLines(stdout: string, what: string): Record<string, unknown>[] {
  return stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, i) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        throw new Error(`${what}: line ${i + 1} is not JSON: ${line}`);
      }
    });
}

const fixtures = readdirSync(fixturesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const name of fixtures) {
  test(name, () => {
    const dir = path.join(fixturesDir, name);
    const expected = JSON.parse(
      readFileSync(path.join(dir, "expected.json"), "utf8"),
    ) as Expected;

    const lint = run(dir, ["lint", "--format", "jsonl"]);
    const lines = parseLines(lint.stdout, "lint");

    assert.equal(
      lint.status,
      expected.exit,
      `exit code\nstdout:\n${lint.stdout}\nstderr:\n${lint.stderr}`,
    );

    if (expected.error !== undefined) {
      const failures = lines.filter((line) => line.kind === "failure");
      assert.ok(
        failures.some((failure) => failure.code === expected.error),
        `expected a failure with code ${expected.error}, got ${JSON.stringify(failures)}`,
      );
    }

    const problems = compareIssues(
      lines.filter((line) => line.kind === "issue"),
      expected.issues ?? [],
    );
    assert.ok(problems.length === 0, problems.join("\n"));

    for (const [target, want] of Object.entries(expected.explain ?? {})) {
      const explain = run(dir, ["explain", target, "--format", "jsonl"]);
      const objects = parseLines(explain.stdout, `explain ${target}`);
      assert.equal(
        objects.length,
        1,
        `explain ${target} should emit one object, got ${objects.length}\nstderr:\n${explain.stderr}`,
      );
      const found = mismatch(objects[0], want, `explain[${target}]`);
      assert.equal(found, null, found ?? undefined);
    }
  });
}
