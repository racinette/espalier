// `espalier lint`. docs/cli/lint/README.MD.

import { statSync } from "node:fs";
import path from "node:path";
import { declaredGroups, groupDeclared, groupModulePath, groupName, type Constraint, type StructuralRule } from "./compile.js";
import { loadConfig } from "./config.js";
import { fail } from "./errors.js";
import { startImplementations } from "./implementation.js";
import { prepareAddons, snapshot, type Invocation, type Job } from "./execution.js";
import { jobLimit, runJobs, type Jobs } from "./workers.js";
import { admitConstraint, admissionGlobs } from "./targets.js";
import { isOwnership, requirements, structuralChecks, type CaptureValue, type UndeclaredDirectory } from "./match.js";
import type { Issue, Reporter } from "./output.js";
import { eachChild } from "./nested.js";
import { openConfig, type Repository } from "./repository.js";
import { ignores } from "./ignore.js";
import { guardedModules } from "./guardMarks.js";
import { frozenViolations, loadBase, lockViolations, sealedViolations } from "./locks.js";

export interface LintOptions {
  cwd: string;
  config: string | undefined;
  paths: string[];
  rule: string | undefined;
  guidance: boolean;
  jobs?: Jobs;
  /** A git revision whose locks and frozen files the change is checked against. docs/LOCKS.MD. */
  base?: string;
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
  const config = loadConfig(options.config, options.cwd);
  const limit = jobLimit(options.jobs === undefined ? config.lint.jobs : options.jobs);
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
    lint({
      ...options, cwd: childRoot, config: undefined, paths: absolute,
      // The same revision holds every child at the same place.
      ...(options.base === undefined ? {} : { base: options.base }),
    }, childReporter),
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
    severity: "error" | "warning" = "error",
  ): void => {
    record({
      path: target,
      code,
      message,
      severity,
      rule: null,
      pattern: null,
      captures: {},
      line: null,
      column: null,
      metadata,
      guidance: null,
    });
  };

  const owned: { path: string; rule: StructuralRule; captures: Record<string, CaptureValue>; undeclared?: UndeclaredDirectory[] }[] = [];
  const allOwned: typeof owned = [];

  let considered = 0;

  for (const target of repository.visible) {
    const found = repository.resolve(target);
    if (isOwnership(found)) {
      const file = { path: target, rule: found.rule, captures: found.captures, ...(found.undeclared === undefined ? {} : { undeclared: found.undeclared }) };
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

  // An abstract contract admits a path, so the path is not unexpected, but it
  // asks every member to be declared. docs/INSTANCES.MD.
  const undeclaredDirectories = new Map<string, string>();
  const declareHint = (module: string): string => `declare it in \`${config.espalierRoot}/${module}\`, or see \`espalier help instances\``;
  for (const file of allOwned) {
    for (const entry of file.undeclared ?? []) undeclaredDirectories.set(entry.path, entry.contract);
    if (!file.rule.module.abstract || !inScope(file.path)) continue;
    builtin(file.path, "undeclared_instance",
      `this file matches the abstract contract \`${file.rule.pattern}\` and is not declared; ${declareHint(`${file.path}.mjs`)}`,
      { contract: file.rule.pattern, captures: file.captures });
  }
  for (const [directory, contract] of [...undeclaredDirectories].sort(([a], [b]) => a.localeCompare(b))) {
    if (!inScope(directory)) continue;
    builtin(`${directory}/`, "undeclared_instance",
      `this directory matches the abstract contract \`${contract}/\` and is not declared; ${declareHint(`${directory}/ESPALIER.mjs`)}`,
      { contract: `${contract}/` });
  }

  // A guard belongs to one branch's work; one still in place is reported so
  // it is not merged. docs/cli/guard/README.MD.
  for (const module of guardedModules(path.join(config.root, config.espalierRoot), espalier.modules.keys())) {
    const target = `${config.espalierRoot}/${module}`;
    if (!inScope(target)) continue;
    builtin(target, "guard_in_place", "this module carries a guard; run espalier unguard before the work is merged", { module }, "warning");
  }

  // A change is judged against its base revision, opt-in: the espalier by
  // the locks in force there, the files by what was frozen and sealed there.
  // docs/LOCKS.MD "Checking against a base revision".
  if (options.base !== undefined) {
    const base = await loadBase(config.root, options.base);
    if (base !== null) {
      try {
        const head = { config, espalier, rules: path.join(config.root, config.espalierRoot) };
        for (const violation of await lockViolations(base.side, head)) {
          const target = `${config.espalierRoot}/${violation.module}`;
          if (!inScope(target)) continue;
          builtin(target, violation.code, violation.message, {
            module: violation.module,
            lockedBy: violation.lockedBy,
            ...(violation.via === undefined ? {} : { via: violation.via }),
          });
        }
        for (const violation of frozenViolations(base, config.root)) {
          if (!inScope(violation.path)) continue;
          builtin(violation.path, "frozen_file_changed",
            `this file is frozen${violation.frozenBy === null ? "" : ` by ${violation.frozenBy}`} and ${violation.deleted ? "was removed" : "changed"} since ${options.base}; add a new file instead where the contract admits one`,
            { frozenBy: violation.frozenBy, deleted: violation.deleted, base: options.base });
        }
        for (const violation of sealedViolations(base, repository)) {
          if (!inScope(violation.path)) continue;
          const sealedBy = violation.sealedBy.join(", ");
          builtin(violation.path, "sealed_collection_changed", violation.added
            ? `this file joins a collection sealed by ${sealedBy} since ${options.base}; adding to it needs explicit authorization`
            : `this file leaves a collection sealed by ${sealedBy} since ${options.base}; removing or renaming it needs explicit authorization`,
            { sealedBy: violation.sealedBy, added: violation.added, base: options.base });
        }
      } finally {
        base.dispose();
      }
    }
  }

  const requiredEntries = requirements(espalier.root, "", {}, repository.visibleSet, (at) => {
    try { return statSync(path.join(config.root, at)).isDirectory(); } catch { return false; }
  });
  for (const directory of requiredEntries.directories) {
    if (!inScope(directory) || repository.ungoverned(directory, true) === "worktree") continue;
    let exists = false;
    try { exists = statSync(path.join(config.root, directory)).isDirectory(); } catch { /* absent */ }
    if (repository.ungoverned(directory, true) !== null) {
      fail("ignored_required_path", `${directory} is a required named directory and is excluded from governance`, { path: directory });
    }
    if (!exists) builtin(directory, "missing_required_directory", "this named directory instance is required but does not exist", {});
  }
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

  const populated = new Map<string, number>();
  for (const file of allOwned) {
    for (const source of new Set(structuralChecks(file.rule, file.path, file.captures).map((entry) => entry.rule.modulePath))) {
      const key = JSON.stringify([path.posix.dirname(file.path), source]);
      populated.set(key, (populated.get(key) ?? 0) + 1);
    }
  }
  for (const collection of requiredEntries.collections) {
    if (repository.ungoverned(collection.path, true) === "worktree") continue;
    if (!inScope(collection.path)) continue;
    const directory = collection.path || ".";
    const minimum = collection.rule.module.minMatches ?? 1;
    if ((populated.get(JSON.stringify([directory, collection.rule.modulePath])) ?? 0) >= minimum) continue;
    builtin(directory, "missing_required_match",
      minimum === 1 ? `at least one file owned by ${collection.declared} is required` : `at least ${minimum} files owned by ${collection.declared} are required`, {
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
    guidance: options.guidance ? module.guidance : null,
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
    const job: Job = structuralChecks(file.rule, file.path, file.captures).map(({ rule, captures }) => invocation(rule.modulePath, rule.module, rule.pattern, file.path, captures));
    for (const { constraint, captures } of applicable(file.path)) {
      job.push(invocation(constraint.modulePath, constraint.module, constraint.pattern, file.path, captures));
    }
    const selected = job.filter((item) => options.rule === undefined || options.rule === item.modulePath);
    if (selected.length > 0) jobs.push(selected);
  }
  // docs/cli/lint/README.MD "Groupings". A group is induced by the files that
  // exist, so it is never empty, and it is scoped like an aggregate: a run
  // that touches one member receives the whole group.
  interface GroupInvocation {
    rule: StructuralRule;
    grouping: StructuralRule["module"]["groups"][number];
    directory: string;
    captures: Record<string, CaptureValue>;
    /** The rules that check its members, contract first. */
    chain: StructuralRule[];
    matches: { path: string; captures: Record<string, CaptureValue> }[];
  }
  const groups = new Map<string, GroupInvocation>();
  for (const file of allOwned) {
    const directory = path.posix.dirname(file.path);
    const checks = structuralChecks(file.rule, file.path, file.captures);
    for (const { rule, captures } of checks) {
      for (const grouping of rule.module.groups) {
        const key = Object.fromEntries(grouping.by.map((name) => [name, captures[name]!]));
        const id = JSON.stringify([directory, rule.modulePath, grouping.name, grouping.by.map((name) => captures[name])]);
        let group = groups.get(id);
        if (group === undefined) {
          group = { rule, grouping, directory: directory === "." ? "" : directory, captures: key, chain: checks.map((check) => check.rule), matches: [] };
          groups.set(id, group);
        }
        group.matches.push({ path: file.path, captures });
      }
    }
  }
  for (const group of groups.values()) {
    if (scope !== null && !group.matches.some((match) => inScope(match.path))) continue;
    const at = group.directory === "" ? "." : `${group.directory}/`;
    const matches = group.matches.sort((left, right) => left.path.localeCompare(right.path));
    // A group an abstract grouping does not see declared is reported where a
    // missing member would be: on the directory that holds it.
    if (group.grouping.abstract && !groupDeclared(group.chain, group.grouping, group.captures, group.directory)) {
      const name = groupName(group.rule.pattern.slice(group.rule.pattern.lastIndexOf("/") + 1), group.captures);
      builtin(at, "undeclared_instance",
        `the ${group.grouping.name} group \`${name}\` of the abstract grouping in \`${group.rule.pattern}\` is not declared; ${declareHint(groupModulePath(group.rule, group.grouping, group.captures))}`,
        { contract: group.rule.pattern, group: group.grouping.name, captures: group.captures });
    }
    const job: Job = [];
    if (options.rule === undefined || options.rule === group.rule.modulePath) {
      job.push({
        ...invocation(group.rule.modulePath, group.rule.module, group.rule.pattern, at, group.captures),
        guidance: options.guidance ? group.grouping.guidance : null,
        description: group.grouping.description,
        group: group.grouping.name,
        matches,
      });
    }
    // A declared group's own check runs beside the grouping's, over the same
    // members; a group the contract and the instance both declare runs both.
    for (const declared of declaredGroups(group.grouping, group.directory, group.captures)) {
      if (declared.module.lint === undefined || (options.rule !== undefined && options.rule !== declared.modulePath)) continue;
      job.push({
        ...invocation(declared.modulePath, declared.module, declared.pattern, at, group.captures),
        group: group.grouping.name,
        declaredGroup: true,
        matches,
      });
    }
    if (job.length > 0) jobs.push(job);
  }
  for (const required of requiredEntries.groups) {
    const directory = required.path === "" ? "." : required.path;
    if (repository.ungoverned(required.path, true) === "worktree" || !inScope(required.path)) continue;
    const id = JSON.stringify([directory, required.rule.modulePath, required.grouping.name, required.grouping.by.map((name) => required.instance.captures[name])]);
    if (groups.has(id)) continue;
    const name = required.instance.pattern.slice(required.instance.pattern.lastIndexOf("/") + 1);
    builtin(required.path === "" ? "." : `${required.path}/`, "missing_required_group",
      `the declared ${required.grouping.name} group \`${name}\` has no files here; it is declared in \`${config.espalierRoot}/${required.instance.modulePath}\``, {
        rule: required.rule.modulePath,
        group: required.grouping.name,
        captures: required.instance.captures,
        declared: required.instance.modulePath,
      });
  }

  for (const aggregate of aggregates.values()) {
    if (options.rule !== undefined && options.rule !== aggregate.modulePath) continue;
    if (!aggregateInScope(aggregate)) continue;
    const patterns = [...new Set(aggregate.constraints.flatMap((constraint) => admissionGlobs(constraint)))].sort();
    const target = aggregate.prefix === "" ? "." : `${aggregate.prefix}/`;
    jobs.push([{
      ...invocation(aggregate.modulePath, aggregate.module, aggregate.constraints[0]!.pattern, target, {}),
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
