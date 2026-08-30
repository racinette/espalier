// The programmatic surface. docs/API.MD.
//
// The CLI writes issues to a stream and returns an exit code; this returns the
// issues. That is the whole difference, and it is what makes rule modules
// testable without espalier owning a test framework.

import type { RuleModule } from "./compile.js";
import { createEmit } from "./context.js";
import { fail, OperationalError } from "./errors.js";
import { matchGlob } from "./files.js";
import { lint as runLint } from "./lint.js";
import type { CaptureValue } from "./match.js";
import type { Issue, Reporter } from "./output.js";

export type { Issue } from "./output.js";
export type { CaptureValue } from "./match.js";
export { OperationalError } from "./errors.js";

export interface CheckOptions {
  /** Where config discovery starts. */
  cwd: string;
  config?: string;
  /** Limit the run to these paths. Defaults to every visible file. */
  paths?: string[];
  /** Run one rule module only, by espalier-relative path. */
  rule?: string;
  /** Read and write the incremental cache. Defaults to true. */
  cache?: boolean;
}

/**
 * Collects instead of printing. The exit code and the partial-run warning are
 * both ways of saying something to a person through a stream; a caller holding
 * the issues can decide for itself.
 */
function collector(into: Issue[], failures: OperationalError[]): Reporter {
  return {
    issue: (issue) => void into.push(issue),
    warning: () => {},
    // A child espalier's failure arrives here rather than being thrown, so that
    // its siblings still run. It is held and raised once they have: a caller
    // holding issues from a run where one espalier never compiled would have no
    // way to know which half of the repository the answer covers.
    failure: (code, message, detail, espalier) =>
      void failures.push(
        new OperationalError(code, espalier == null ? message : `${espalier}: ${message}`, detail),
      ),
    explanation: () => {},
    record: () => {},
    finish: () => {},
  };
}

/** Runs the same lint the CLI runs, over a real repository. docs/API.MD. */
export async function check(options: CheckOptions): Promise<Issue[]> {
  const issues: Issue[] = [];
  const failures: OperationalError[] = [];
  await runLint(
    {
      cwd: options.cwd,
      config: options.config,
      paths: options.paths ?? [],
      rule: options.rule,
      ruleText: true,
      cache: options.cache ?? true,
    },
    collector(issues, failures),
  );
  if (failures[0] !== undefined) throw failures[0];
  return issues;
}

export interface RuleContext {
  /** The file being linted. */
  path: string;
  /** The glob that matched it. Defaults to `path`. */
  pattern?: string;
  captures?: Record<string, CaptureValue>;
  /** A virtual repository backing both `read` and `files`. */
  tree?: Record<string, string>;
  read?: (path?: string) => Promise<string>;
  files?: (pattern: string) => Promise<string[]>;
  addons?: Record<string, unknown>;
  /** The module path to record on emitted issues. */
  rule?: string | null;
}

export interface AggregateMatch {
  path: string;
  captures?: Record<string, CaptureValue>;
}

export interface AggregateRuleContext {
  matches: AggregateMatch[];
  /** The aggregate glob. Defaults to the recursive all-files glob. */
  pattern?: string;
  /** Default path for emitted issues. Defaults to `.`. */
  at?: string;
  tree?: Record<string, string>;
  read?: (path: string) => Promise<string>;
  files?: (pattern: string) => Promise<string[]>;
  addons?: Record<string, unknown>;
  rule?: string | null;
}

function validateTargets(targets: unknown, caller: string): void {
  if (
    targets !== undefined &&
    (!Array.isArray(targets) ||
      targets.length === 0 ||
      targets.some(
        (target) =>
          typeof target !== "string" ||
          target.length === 0 ||
          target.startsWith("!") ||
          target.startsWith("/") ||
          target.split("/").includes(".."),
      ))
  ) {
    fail(
      "module_invalid_export",
      `${caller}: \`targets\` must be a non-empty array of non-empty relative positive glob strings`,
    );
  }
}

/**
 * Runs one module's `lint` against a context you supply. No config, no espalier
 * tree, no repository on disk: a module's position in the tree is the matcher's
 * business, pinned by conformance fixtures rather than by unit tests.
 */
export async function runRule(module: RuleModule, context: RuleContext): Promise<Issue[]> {
  if (module === null || typeof module !== "object") {
    fail("module_invalid_export", "runRule expects a rule module");
  }
  if (typeof module.lint !== "function") {
    fail("module_missing_export", "the module must export a `lint` function");
  }
  validateTargets(module.targets, "runRule");
  if (module.aggregate !== undefined && typeof module.aggregate !== "boolean") {
    fail("module_invalid_export", "`aggregate` must be a boolean");
  }
  if (module.aggregate === true) {
    fail("module_invalid_export", "runRule cannot run an aggregate constraint; use runAggregate");
  }

  const modulePath = context.rule ?? null;
  const whose = modulePath ?? "rule";
  const tree = context.tree ?? {};
  const issues: Issue[] = [];

  // A rule reading a file it was not given gets `read_failed` rather than an
  // empty string: a test that silently linted nothing is the failure mode this
  // exists to prevent.
  const read =
    context.read ??
    (async (where?: string): Promise<string> => {
      const target = where ?? context.path;
      const contents = tree[target];
      if (contents === undefined) {
        fail("read_failed", `${whose}: could not read "${target}": not in the supplied tree`);
      }
      return contents;
    });

  const files =
    context.files ??
    (async (pattern: string): Promise<string[]> =>
      Object.keys(tree)
        .filter((target) => matchGlob(pattern, target))
        .sort());

  const emit = createEmit({
    modulePath,
    pattern: context.pattern ?? context.path,
    path: context.path,
    captures: context.captures ?? {},
    ruleText: typeof module.rule === "string" ? module.rule : null,
    description: typeof module.description === "string" ? module.description : null,
    example: typeof module.example === "string" ? module.example : null,
    exampleSource: typeof module.exampleSource === "string" ? module.exampleSource : null,
    record: (issue) => void issues.push(issue),
  });

  try {
    await (module.lint as (context: unknown) => unknown)({
      path: context.path,
      pattern: context.pattern ?? context.path,
      captures: context.captures ?? {},
      read,
      files,
      emit,
      addons: context.addons ?? {},
    });
  } catch (cause) {
    if (cause instanceof OperationalError) throw cause;
    // A rule that throws is a bug in the rule, not a finding about the
    // repository — the same judgement the runner makes.
    fail("rule_threw", `${whose} threw while linting ${context.path}: ${(cause as Error).message}`);
  }

  return issues;
}

/** Runs one aggregate constraint against a complete match set supplied by a test. */
export async function runAggregate(
  module: RuleModule,
  context: AggregateRuleContext,
): Promise<Issue[]> {
  if (module === null || typeof module !== "object") {
    fail("module_invalid_export", "runAggregate expects a rule module");
  }
  if (typeof module.lint !== "function") {
    fail("module_missing_export", "the module must export a `lint` function");
  }
  validateTargets(module.targets, "runAggregate");
  if (module.aggregate !== true) {
    fail("module_invalid_export", "runAggregate expects a module exporting `aggregate = true`");
  }

  const modulePath = context.rule ?? null;
  const whose = modulePath ?? "rule";
  const tree = context.tree ?? {};
  const pattern = context.pattern ?? "**/*";
  const at = context.at ?? ".";
  const issues: Issue[] = [];
  const matches = context.matches
    .map((match) => ({ path: match.path, captures: match.captures ?? {} }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  const read =
    context.read ??
    (async (target: string): Promise<string> => {
      const contents = tree[target];
      if (contents === undefined) {
        fail("read_failed", `${whose}: could not read "${target}": not in the supplied tree`);
      }
      return contents;
    });
  const files =
    context.files ??
    (async (glob: string): Promise<string[]> =>
      Object.keys(tree)
        .filter((target) => matchGlob(glob, target))
        .sort());
  const emit = createEmit({
    modulePath,
    pattern,
    path: at,
    captures: {},
    ruleText: typeof module.rule === "string" ? module.rule : null,
    description: typeof module.description === "string" ? module.description : null,
    example: typeof module.example === "string" ? module.example : null,
    exampleSource: typeof module.exampleSource === "string" ? module.exampleSource : null,
    record: (issue) => void issues.push(issue),
  });

  try {
    await (module.lint as (context: unknown) => unknown)({
      matches,
      pattern,
      read,
      files,
      emit,
      addons: context.addons ?? {},
    });
  } catch (cause) {
    if (cause instanceof OperationalError) throw cause;
    fail("rule_threw", `${whose} threw while linting aggregate ${pattern}: ${(cause as Error).message}`);
  }

  return issues;
}
