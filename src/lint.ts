// `espalier lint`. docs/cli/lint/README.MD.

import path from "node:path";
import type { Constraint, StructuralRule } from "./compile.js";
import { loadConfig } from "./config.js";
import { fail } from "./errors.js";
import { startImplementations } from "./implementation.js";
import { prepareAddons, snapshot, type Invocation, type Job } from "./execution.js";
import { jobLimit, runJobs, type Jobs } from "./workers.js";
import { admitConstraint, admissionGlobs, issuePattern } from "./targets.js";
import { isOwnership, requirements, type CaptureValue } from "./match.js";
import type { Issue, Reporter } from "./output.js";
import { eachChild } from "./nested.js";
import { openConfig, type Repository } from "./repository.js";
import { ignores } from "./ignore.js";

export interface LintOptions {
  cwd: string;
  config: string | undefined;
  paths: string[];
  rule: string | undefined;
  ruleText: boolean;
  jobs?: Jobs;
}

/**
 * The outer espalier, then every child below it. docs/cli/lint/README.MD
 * "Nested espaliers".
 *
 * Scope arguments are resolved here and passed down absolute, because the
 * directory they were written relative to is this one and every run below has a
 * different root. A child the scope does not reach is not run at all.
 */
export async function lint(options: LintOptions, reporter: Reporter): Promise<number> {
  const limit = jobLimit(options.jobs);
  const config = loadConfig(options.config, options.cwd);
  const implementations = startImplementations(config.root, config.espalierRoot, config.addons);
  let repository: Repository;
  let here: number;
  try {
    repository = await openConfig(config);
    here = await lintOne(repository, { ...options, paths: options.paths }, reporter, limit);
  } finally {
    implementations.close();
  }
  const { root } = repository.config;

  const absolute = options.paths.map((entry) => path.resolve(options.cwd, entry));
  const reaches = (child: string): boolean => {
    if (absolute.length === 0) return true;
    const at = path.join(root, child);
    return absolute.some((target) => target === at || target.startsWith(`${at}${path.sep}`) || at.startsWith(`${target}${path.sep}`));
  };

  const below = await eachChild(root, repository.children.filter(reaches), reporter, (childRoot, childReporter) =>
    lint({ ...options, cwd: childRoot, config: undefined, paths: absolute }, childReporter),
  );

  return Math.max(here, below);
}

async function lintOne(
  repository: Repository,
  options: LintOptions,
  reporter: Reporter,
  limit: number,
): Promise<number> {
  const { config, espalier } = repository;

  let scope: string[] | null = null;
  if (options.paths.length > 0) {
    scope = options.paths.map((entry) => {
      const absolute = path.resolve(options.cwd, entry);
      return path.relative(config.root, absolute).split(path.sep).join("/");
    });
  }

  const inScope = (target: string): boolean =>
    scope === null || scope.some((entry) => entry === "" || target === entry || target.startsWith(`${entry}/`));

  let errors = 0;
  const record = (issue: Issue): void => {
    if (issue.severity === "error") errors += 1;
    reporter.issue(issue);
  };

  const builtin = (
    target: string,
    code: string,
    message: string,
    metadata: Record<string, unknown>,
  ): void => {
    record({
      path: target,
      code,
      message,
      severity: "error",
      rule: null,
      pattern: null,
      captures: {},
      line: null,
      column: null,
      metadata,
      ruleText: null,
    });
  };

  const owned: { path: string; rule: StructuralRule; captures: Record<string, CaptureValue> }[] = [];
  const allOwned: typeof owned = [];

  let considered = 0;

  for (const target of repository.visible) {
    const found = repository.resolve(target);
    if (isOwnership(found)) {
      const file = { path: target, rule: found.rule, captures: found.captures };
      allOwned.push(file);
      if (inScope(target)) owned.push(file);
      if (inScope(target)) considered += 1;
      continue;
    }
    if (!inScope(target)) continue;
    considered += 1;
    builtin(target, "unexpected_path", "this path is not declared in the espalier", {
      recognized: found.recognized,
      captures: found.captures,
      declared: found.declared,
    });
  }

  const requiredEntries = requirements(espalier.root, "", {}, repository.visibleSet);
  for (const required of requiredEntries.files) {
    const excluded = repository.ungoverned(required.path);
    if (excluded === "worktree") continue;
    if (!inScope(required.path)) continue;
    if (repository.visibleSet.has(required.path)) continue;
    if (ignores(repository.ignoreRules, required.path)) {
      fail(
        "ignored_required_path",
        `${required.path} is required by the espalier and also matched by \`ignore\``,
        { path: required.path },
      );
    }
    builtin(required.path, "missing_required_file", "this file is required but does not exist", {});
  }

  const populated = new Set(allOwned.map((file) =>
    JSON.stringify([path.posix.dirname(file.path), file.rule.modulePath])));
  for (const collection of requiredEntries.collections) {
    if (repository.ungoverned(collection.path, true) === "worktree") continue;
    if (!inScope(collection.path)) continue;
    const directory = collection.path || ".";
    if (populated.has(JSON.stringify([directory, collection.rule.modulePath]))) continue;
    builtin(directory, "missing_required_match",
      `at least one file owned by ${collection.declared} is required`, {
        declared: collection.declared,
        rule: collection.rule.modulePath,
        captures: collection.captures,
      });
  }

  const sources = snapshot(config.root, repository.visible);
  const addon = config.addons === null ? null : path.resolve(config.root, config.addons);
  const prepared = await prepareAddons(addon, sources);
  const jobs: Job[] = [];
  const invocation = (
    modulePath: string, module: StructuralRule["module"], pattern: string,
    target: string, captures: Record<string, CaptureValue>,
  ): Invocation => ({
    modulePath, pattern, path: target, captures,
    ruleText: options.ruleText ? module.rule : null,
    description: module.description, referenceImplementation: module.referenceImplementation,
  });

  interface AggregateInvocation {
    modulePath: string;
    module: StructuralRule["module"];
    constraints: Constraint[];
    matches: Map<string, { path: string; captures: Record<string, CaptureValue> }>;
    prefix: string;
  }

  const aggregates = new Map<string, AggregateInvocation>();
  for (const constraint of espalier.constraints) {
    if (!constraint.module.aggregate) continue;
    let aggregate = aggregates.get(constraint.modulePath);
    if (aggregate === undefined) {
      const fixed: string[] = [];
      for (const segment of constraint.directory) {
        if (segment.dynamic || segment.resolved) break;
        fixed.push(segment.source);
      }
      aggregate = {
        modulePath: constraint.modulePath,
        module: constraint.module,
        constraints: [],
        matches: new Map(),
        prefix: fixed.join("/"),
      };
      aggregates.set(constraint.modulePath, aggregate);
    }
    aggregate.constraints.push(constraint);
  }

  for (const file of allOwned) {
    for (const aggregate of aggregates.values()) {
      for (const constraint of aggregate.constraints) {
        const captures = admitConstraint(constraint, file.path);
        if (captures === null) continue;
        aggregate.matches.set(file.path, { path: file.path, captures });
        break;
      }
    }
  }

  const pathsIntersect = (left: string, right: string): boolean =>
    left === "" ||
    right === "" ||
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`);

  const aggregateInScope = (aggregate: AggregateInvocation): boolean =>
    scope === null ||
    scope.some((entry) => {
      if (aggregate.matches.size === 0) return pathsIntersect(entry, aggregate.prefix);
      return [...aggregate.matches.keys()].some((target) => pathsIntersect(entry, target));
    });

  const applicable = (target: string): { constraint: Constraint; captures: Record<string, CaptureValue> }[] =>
    espalier.constraints.flatMap((constraint) => {
      if (constraint.module.aggregate) return [];
      const captures = admitConstraint(constraint, target);
      return captures === null ? [] : [{ constraint, captures }];
    });

  for (const file of owned) {
    const job: Job = [invocation(file.rule.modulePath, file.rule.module, file.rule.pattern, file.path, file.captures)];
    for (const { constraint, captures } of applicable(file.path)) {
      job.push(invocation(constraint.modulePath, constraint.module, constraint.pattern, file.path, captures));
    }
    const selected = job.filter((item) => options.rule === undefined || options.rule === item.modulePath);
    if (selected.length > 0) jobs.push(selected);
  }
  for (const aggregate of aggregates.values()) {
    if (options.rule !== undefined && options.rule !== aggregate.modulePath) continue;
    if (!aggregateInScope(aggregate)) continue;
    const patterns = [...new Set(aggregate.constraints.flatMap((constraint) => admissionGlobs(constraint)))].sort();
    const target = aggregate.prefix === "" ? "." : `${aggregate.prefix}/`;
    jobs.push([{
      ...invocation(aggregate.modulePath, aggregate.module, issuePattern(patterns), target, {}),
      patterns,
      matches: [...aggregate.matches.values()].sort((left, right) => left.path.localeCompare(right.path)),
    }]);
  }
  await runJobs({ ruleRoot: path.resolve(config.root, config.espalierRoot), addon, prepared, sources }, jobs, limit, record);

  if (scope !== null) {
    reporter.warning(
      `partial run: ${considered} of ${repository.visible.length} file${repository.visible.length === 1 ? "" : "s"} checked. A scoped run cannot tell you the repository conforms.`,
    );
  }

  return errors > 0 ? 1 : 0;
}
