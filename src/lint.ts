// `espalier lint`. docs/cli/lint/README.MD.

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { dependencies, listing, open as openCache, stored, type Dependencies } from "./cache.js";
import type { Constraint, StructuralRule } from "./compile.js";
import { loadConfig } from "./config.js";
import { createEmit, within } from "./context.js";
import { fail, OperationalError } from "./errors.js";
import { matchGlob } from "./files.js";
import { observeImplementations, type ImplementationObserver } from "./implementation.js";
import { admitConstraint, admissionGlobs, issuePattern } from "./targets.js";
import { isOwnership, requiredFiles, type CaptureValue } from "./match.js";
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
  /** Read and write the incremental cache. `--no-cache` turns it off. */
  cache: boolean;
}

async function startAddons(
  repository: Repository,
  implementations: ImplementationObserver,
): Promise<{
  addons: Record<string, unknown>;
  dispose: () => Promise<void>;
}> {
  const { config } = repository;
  if (config.addons === null) return { addons: {}, dispose: async () => {} };

  const absolute = path.resolve(config.root, config.addons);
  let module: { setup?: unknown; unobservedImplementationDependencies?: unknown };
  try {
    module = (await import(pathToFileURL(absolute).href)) as typeof module;
  } catch (cause) {
    fail("addons_import_failed", `addons module could not be imported: ${(cause as Error).message}`);
  }
  if (typeof module.setup !== "function") {
    fail("addons_missing_setup", "the addons module must export a `setup` function");
  }
  const declared = module.unobservedImplementationDependencies;
  if (
    declared !== undefined &&
    (!Array.isArray(declared) ||
      declared.some(
        (dependency) =>
          typeof dependency !== "string" ||
          dependency.length === 0 ||
          dependency.startsWith("!") ||
          path.isAbsolute(dependency) ||
          dependency.split(/[\\/]/).includes(".."),
      ))
  ) {
    fail(
      "addons_invalid_export",
      "the addons module's `unobservedImplementationDependencies` must be an array of non-empty relative positive glob strings",
    );
  }
  implementations.declare((declared ?? []) as string[]);

  let addons: Record<string, unknown>;
  try {
    addons = (await (module.setup as () => unknown)()) as Record<string, unknown>;
  } catch (cause) {
    fail("addons_setup_failed", `addons setup threw: ${(cause as Error).message}`);
  }

  return {
    addons: addons ?? {},
    dispose: async () => {
      const disposer = (addons as Record<symbol, unknown>)[Symbol.asyncDispose];
      if (typeof disposer === "function") await (disposer as () => unknown).call(addons);
    },
  };
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
  const implementations = observeImplementations(config.root, config.espalierRoot, config.addons);
  let repository: Repository;
  let here: number;
  try {
    repository = await openConfig(config);
    here = await lintOne(repository, { ...options, paths: options.paths }, reporter, implementations);
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
  implementations: ImplementationObserver,
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

  for (const required of requiredFiles(espalier, repository.visibleSet)) {
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

  const declaredModules = new Set<StructuralRule["module"]>();
  const collect = (node: (typeof espalier)["root"]): void => {
    if (node.rule !== null) declaredModules.add(node.rule.module);
    for (const child of node.children.values()) collect(child);
  };
  collect(espalier.root);
  for (const constraint of espalier.constraints) declaredModules.add(constraint.module);
  for (const module of declaredModules) {
    implementations.declare(module.unobservedImplementationDependencies);
  }

  const { addons, dispose } = await startAddons(repository, implementations);

  const globOf = (pattern: string): string =>
    listing(repository.visible.filter((target) => matchGlob(pattern, target)));

  const cache = openCache(config, options.cache, globOf, implementations);

  // What the invocation currently running has looked at. Rules run one at a
  // time, so one slot is enough; it is null while nothing is running, and the
  // context functions belong to whichever invocation is holding it.
  let watching: Dependencies | null = null;

  const contents = new Map<string, string>();
  const readFile = async (target: string, whose: string): Promise<string> => {
    const normalized = within(target, whose);
    // A file this espalier does not govern is a file it does not watch: nothing
    // stamps it, so a rule that read one would be replayed after it changed.
    if (!repository.visibleSet.has(normalized)) {
      fail(
        "read_ungoverned",
        `${whose}: "${normalized}" is not among the files this espalier governs — ignored, invisible, or absent`,
      );
    }
    watching?.reads.add(normalized);
    const cached = contents.get(normalized);
    if (cached !== undefined) return cached;
    let text: string;
    try {
      text = readFileSync(path.join(config.root, normalized), "utf8");
    } catch (cause) {
      fail("read_failed", `${whose}: could not read "${normalized}": ${(cause as Error).message}`);
    }
    contents.set(normalized, text);
    return text;
  };

  const listFiles = async (pattern: string): Promise<string[]> => {
    const found = repository.visible.filter((target) => matchGlob(pattern, target));
    watching?.globs.set(pattern, listing(found));
    return found;
  };

  const invoke = async (
    modulePath: string,
    module: StructuralRule["module"],
    pattern: string,
    target: string,
    captures: Record<string, CaptureValue>,
  ): Promise<void> => {
    if (options.rule !== undefined && options.rule !== modulePath) return;

    // Everything an issue carries beyond what `emit` was given is derived from
    // the module and the match, and both are pinned by the cache's key, so a
    // replayed issue is the issue the rule would have emitted again.
    const derived = {
      rule: modulePath,
      pattern,
      captures,
      ruleText: options.ruleText ? module.rule : null,
      description: module.description,
      referenceImplementation: module.referenceImplementation,
    };

    const replayed = cache.replay(modulePath, pattern, target);
    if (replayed !== null) {
      for (const issue of replayed) record({ ...issue, ...derived });
      return;
    }

    const produced: ReturnType<typeof stored>[] = [];
    const emit = createEmit({
      modulePath,
      pattern,
      path: target,
      captures,
      ruleText: options.ruleText ? module.rule : null,
      description: module.description,
      referenceImplementation: module.referenceImplementation,
      record: (issue) => {
        produced.push(stored(issue));
        record(issue);
      },
    });

    const watched = dependencies();
    watching = watched;
    try {
      await module.lint({
        path: target,
        pattern,
        captures,
        read: (where?: string) => readFile(where ?? target, modulePath),
        files: listFiles,
        emit,
        addons,
      });
    } catch (cause) {
      if (cause instanceof OperationalError) throw cause;
      // A rule that throws is a bug in the rule, not a finding about the
      // repository.
      fail("rule_threw", `${modulePath} threw while linting ${target}: ${(cause as Error).message}`);
    } finally {
      watching = null;
    }

    cache.record(modulePath, pattern, target, watched, produced);
  };

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

  const invokeAggregate = async (aggregate: AggregateInvocation): Promise<void> => {
    if (options.rule !== undefined && options.rule !== aggregate.modulePath) return;
    if (!aggregateInScope(aggregate)) return;

    const patterns = [...new Set(aggregate.constraints.flatMap((constraint) => admissionGlobs(constraint)))].sort(
      (left, right) => left.localeCompare(right),
    );
    const pattern = issuePattern(patterns);
    const target = aggregate.prefix === "" ? "." : `${aggregate.prefix}/`;
    const captures: Record<string, CaptureValue> = {};
    const derived = {
      rule: aggregate.modulePath,
      pattern,
      captures,
      ruleText: options.ruleText ? aggregate.module.rule : null,
      description: aggregate.module.description,
      referenceImplementation: aggregate.module.referenceImplementation,
    };

    const membership = listing([...aggregate.matches.keys()].sort());
    const replayed = cache.replay(aggregate.modulePath, pattern, target, membership);
    if (replayed !== null) {
      for (const issue of replayed) record({ ...issue, ...derived });
      return;
    }

    const produced: ReturnType<typeof stored>[] = [];
    const emit = createEmit({
      modulePath: aggregate.modulePath,
      pattern,
      path: target,
      captures,
      ruleText: options.ruleText ? aggregate.module.rule : null,
      description: aggregate.module.description,
      referenceImplementation: aggregate.module.referenceImplementation,
      record: (issue) => {
        produced.push(stored(issue));
        record(issue);
      },
    });

    const watched = dependencies();
    watched.membership = membership;
    watching = watched;
    try {
      await aggregate.module.lint({
        matches: [...aggregate.matches.values()].sort((left, right) => left.path.localeCompare(right.path)),
        patterns,
        read: (where?: string) => {
          if (where === undefined) {
            fail("read_failed", `${aggregate.modulePath}: an aggregate constraint must name the file to read`);
          }
          return readFile(where, aggregate.modulePath);
        },
        files: listFiles,
        emit,
        addons,
      });
    } catch (cause) {
      if (cause instanceof OperationalError) throw cause;
      fail(
        "rule_threw",
        `${aggregate.modulePath} threw while linting aggregate ${pattern}: ${(cause as Error).message}`,
      );
    } finally {
      watching = null;
    }

    // An aggregate's target is where its issues default, not an input. Its
    // selected membership is recorded separately from explicit files() calls.
    cache.record(aggregate.modulePath, pattern, target, watched, produced, false);
  };

  const applicable = (target: string): { constraint: Constraint; captures: Record<string, CaptureValue> }[] =>
    espalier.constraints.flatMap((constraint) => {
      if (constraint.module.aggregate) return [];
      const captures = admitConstraint(constraint, target);
      return captures === null ? [] : [{ constraint, captures }];
    });

  try {
    for (const file of owned) {
      await invoke(file.rule.modulePath, file.rule.module, file.rule.pattern, file.path, file.captures);

      // Every constraint whose pattern matches runs, in addition to the
      // structural owner — but only on a file that has one.
      for (const { constraint, captures } of applicable(file.path)) {
        await invoke(constraint.modulePath, constraint.module, constraint.pattern, file.path, captures);
      }
    }
    for (const aggregate of aggregates.values()) await invokeAggregate(aggregate);
  } finally {
    await dispose();
  }

  // Only a run that saw everything may drop what it did not see. A run that
  // failed does not get here at all: half a work list is not a record of one.
  cache.write(scope === null && options.rule === undefined);

  if (scope !== null) {
    reporter.warning(
      `partial run: ${considered} of ${repository.visible.length} file${repository.visible.length === 1 ? "" : "s"} checked. A scoped run cannot tell you the repository conforms.`,
    );
  }

  return errors > 0 ? 1 : 0;
}
