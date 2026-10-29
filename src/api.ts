// The programmatic surface. docs/API.MD.
//
// The CLI writes issues to a stream and returns an exit code; this returns the
// issues. That is the whole difference, and it is what makes rule modules
// testable without espalier owning a test framework.

import path from "node:path";
import { renderRuleText, type RuleGuidanceContext, type RuleModule } from "./compile.js";
import { createEmit } from "./context.js";
import { fail, OperationalError } from "./errors.js";
import { matchGlob } from "./files.js";
import { lint as runLint } from "./lint.js";
import type { CaptureValue } from "./match.js";
import type { Issue, Reporter } from "./output.js";
import type { Jobs } from "./workers.js";
export type { DirectoryGuidanceContext, RuleGuidanceContext } from "./compile.js";
export type { Jobs } from "./workers.js";
export type { PrepareContext } from "./execution.js";
import { templateDefinitionProblem } from "./template.js";

export type { Issue } from "./output.js";
export type { CaptureValue } from "./match.js";
export { OperationalError } from "./errors.js";
export {
  createAggregateLinter,
  createGroupLinter,
  createLinter,
  type AggregateLintContext,
  type AggregateLinter,
  type AggregateReadFile,
  type EmitIssue,
  type GroupLintContext,
  type GroupLinter,
  type LintContext,
  type Linter,
  type LintIssue,
  type LintMatch,
  type ListFiles,
  type ReadFile,
} from "./linter.js";
export {
  createTemplate,
  type FlagTemplateOption,
  type StringTemplateOption,
  type TemplateArguments,
  type TemplateContext,
  type TemplateDefinition,
  type TemplateOption,
  type TemplateResult,
  type TemplateSchema,
} from "./template.js";

export interface CheckOptions {
  /** Where config discovery starts. */
  cwd: string;
  config?: string;
  /** Limit the run to these paths. Defaults to every visible file. */
  paths?: string[];
  /** Run one rule module only, by espalier-relative path. */
  rule?: string;
  /** Maximum lint workers; defaults to each project's lint.jobs setting. */
  jobs?: Jobs;
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
    help: () => {},
    preview: () => {},
    record: () => {},
    buildComplete: () => {},
    finish: () => {},
  };
}

/** Runs the same lint the CLI runs, over a real repository. docs/API.MD. */
export async function check(options: CheckOptions): Promise<Issue[]> {
  if ("cache" in options) fail("invalid_check_options", "cache is not supported; use jobs to control parallel execution");
  const issues: Issue[] = [];
  const failures: OperationalError[] = [];
  await runLint(
    {
      cwd: options.cwd,
      config: options.config,
      paths: options.paths ?? [],
      rule: options.rule,
      ruleText: true,
      jobs: options.jobs,
    },
    collector(issues, failures),
  );
  if (failures[0] !== undefined) throw failures[0];
  return issues;
}

export interface RuleContext {
  /** Required for function-valued rule prose or descriptions; separate from the lint match. */
  guidance?: RuleGuidanceContext;
  /** The file being linted. */
  path: string;
  /** The declaration recorded on issues. Defaults to `path`. */
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
  /** Required for function-valued rule prose or descriptions; no match represents the group. */
  guidance?: RuleGuidanceContext;
  matches: AggregateMatch[];
  /** Admission globs. Defaults to the recursive all-files glob. */
  patterns?: string[];
  /** Default path for emitted issues. Defaults to `.`. */
  at?: string;
  /** The declaration recorded on issues. Defaults to `at`. */
  pattern?: string;
  tree?: Record<string, string>;
  read?: (path: string) => Promise<string>;
  files?: (pattern: string) => Promise<string[]>;
  addons?: Record<string, unknown>;
  rule?: string | null;
}

export interface GroupRuleContext {
  /** Required for function-valued rule prose or descriptions. */
  guidance?: RuleGuidanceContext;
  /** The grouping to run, by its name in `groups`. */
  group: string;
  /** The values of the `by` captures the members share. */
  captures?: Record<string, CaptureValue>;
  matches: AggregateMatch[];
  /** The declaration recorded on issues. Defaults to `at`. */
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

function validateTemplate(template: unknown, caller: string): void {
  if (template === undefined) return;
  const problem = templateDefinitionProblem(template);
  if (problem !== null) {
    fail("module_invalid_export", `${caller}: \`template\` ${problem}`);
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
  if ("unobservedImplementationDependencies" in module) fail("module_invalid_export", "unobservedImplementationDependencies is not supported");
  if (typeof module.lint !== "function") {
    fail("module_missing_export", "the module must export a `lint` function");
  }
  validateTargets(module.targets, "runRule");
  validateTemplate(module.template, "runRule");
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
    ruleText: await renderRuleText(module.rule, context.guidance, whose),
    description: await renderRuleText(module.description, context.guidance, whose, "description"),
    referenceImplementation:
      typeof module.referenceImplementation === "string"
        ? module.referenceImplementation
        : null,
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
  if ("unobservedImplementationDependencies" in module) fail("module_invalid_export", "unobservedImplementationDependencies is not supported");
  if (typeof module.lint !== "function") {
    fail("module_missing_export", "the module must export a `lint` function");
  }
  validateTargets(module.targets, "runAggregate");
  validateTemplate(module.template, "runAggregate");
  if (module.template !== undefined) {
    fail(
      "module_invalid_export",
      "runAggregate: `template` has no meaning on a constraint; templates create structurally owned files",
    );
  }
  if (module.aggregate !== true) {
    fail("module_invalid_export", "runAggregate expects a module exporting `aggregate = true`");
  }

  const modulePath = context.rule ?? null;
  const whose = modulePath ?? "rule";
  const tree = context.tree ?? {};
  const patterns = context.patterns ?? ["**/*"];
  const at = context.at ?? ".";
  const pattern = context.pattern ?? at;
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
    ruleText: await renderRuleText(module.rule, context.guidance, whose),
    description: await renderRuleText(module.description, context.guidance, whose, "description"),
    referenceImplementation:
      typeof module.referenceImplementation === "string"
        ? module.referenceImplementation
        : null,
    record: (issue) => void issues.push(issue),
  });

  try {
    await (module.lint as (context: unknown) => unknown)({
      matches,
      patterns,
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

/** Runs one grouping of a dynamic structural rule over the members a test supplies. */
export async function runGroup(module: RuleModule, context: GroupRuleContext): Promise<Issue[]> {
  if (module === null || typeof module !== "object") {
    fail("module_invalid_export", "runGroup expects a rule module");
  }
  if ("unobservedImplementationDependencies" in module) fail("module_invalid_export", "unobservedImplementationDependencies is not supported");
  const groups = module.groups;
  if (groups === null || typeof groups !== "object" || Array.isArray(groups)) {
    fail("module_invalid_export", "runGroup expects a module exporting `groups`");
  }
  const grouping = (groups as Record<string, unknown>)[context.group];
  if (grouping === null || typeof grouping !== "object" || typeof (grouping as Record<string, unknown>)["lint"] !== "function") {
    fail("module_invalid_export", `runGroup: \`groups.${context.group}\` must be a grouping with a lint function`);
  }
  const { description, rule, lint } = grouping as { description?: unknown; rule?: unknown; lint: (context: unknown) => unknown };
  if (typeof description !== "string" || typeof rule !== "string") {
    fail("module_invalid_export", `runGroup: \`groups.${context.group}\` needs a string description and rule`);
  }
  validateTemplate(module.template, "runGroup");

  const modulePath = context.rule ?? null;
  const whose = modulePath ?? "rule";
  const tree = context.tree ?? {};
  const at = context.at ?? ".";
  const pattern = context.pattern ?? at;
  const captures = context.captures ?? {};
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
    captures,
    ruleText: rule,
    description,
    referenceImplementation:
      typeof module.referenceImplementation === "string"
        ? module.referenceImplementation
        : null,
    group: context.group,
    record: (issue) => void issues.push(issue),
  });

  try {
    await lint({ group: context.group, path: at, pattern, captures, matches, read, files, emit, addons: context.addons ?? {} });
  } catch (cause) {
    if (cause instanceof OperationalError) throw cause;
    fail("rule_threw", `${whose} threw while linting group ${context.group} at ${at}: ${(cause as Error).message}`);
  }

  return issues;
}
