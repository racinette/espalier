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
}

/**
 * Collects instead of printing. The exit code and the partial-run warning are
 * both ways of saying something to a person through a stream; a caller holding
 * the issues can decide for itself.
 */
function collector(into: Issue[]): Reporter {
  return {
    issue: (issue) => void into.push(issue),
    warning: () => {},
    failure: () => {},
    object: () => {},
    explanation: () => {},
    record: () => {},
    finish: () => {},
  };
}

/** Runs the same lint the CLI runs, over a real repository. docs/API.MD. */
export async function check(options: CheckOptions): Promise<Issue[]> {
  const issues: Issue[] = [];
  await runLint(
    {
      cwd: options.cwd,
      config: options.config,
      paths: options.paths ?? [],
      rule: options.rule,
      ruleText: true,
    },
    collector(issues),
  );
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
