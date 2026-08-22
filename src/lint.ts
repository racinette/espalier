// `espalier lint`. docs/cli/lint/README.MD.

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { dependencies, listing, open as openCache, stored, type Dependencies } from "./cache.js";
import type { Constraint, StructuralRule } from "./compile.js";
import { createEmit, within } from "./context.js";
import { fail, OperationalError } from "./errors.js";
import { matchGlob } from "./files.js";
import { constraintCaptures, isOwnership, requiredFiles, type CaptureValue } from "./match.js";
import type { Issue, Reporter } from "./output.js";
import { eachChild } from "./nested.js";
import { open, type Repository } from "./repository.js";
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

async function startAddons(repository: Repository): Promise<{
  addons: Record<string, unknown>;
  dispose: () => Promise<void>;
}> {
  const { config } = repository;
  if (config.addons === null) return { addons: {}, dispose: async () => {} };

  const absolute = path.resolve(config.root, config.addons);
  let module: { setup?: unknown };
  try {
    module = (await import(pathToFileURL(absolute).href)) as { setup?: unknown };
  } catch (cause) {
    fail("addons_import_failed", `addons module could not be imported: ${(cause as Error).message}`);
  }
  if (typeof module.setup !== "function") {
    fail("addons_missing_setup", "the addons module must export a `setup` function");
  }

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
  const repository = await open(options.config, options.cwd);
  const { root } = repository.config;

  const absolute = options.paths.map((entry) => path.resolve(options.cwd, entry));
  const reaches = (child: string): boolean => {
    if (absolute.length === 0) return true;
    const at = path.join(root, child);
    return absolute.some((target) => target === at || target.startsWith(`${at}${path.sep}`) || at.startsWith(`${target}${path.sep}`));
  };

  const here = await lintOne(repository, { ...options, paths: absolute }, reporter);

  const below = await eachChild(root, repository.children.filter(reaches), reporter, (childRoot, childReporter) =>
    lint({ ...options, cwd: childRoot, config: undefined, paths: absolute }, childReporter),
  );

  return Math.max(here, below);
}

async function lintOne(
  repository: Repository,
  options: LintOptions,
  reporter: Reporter,
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

  let considered = 0;

  for (const target of repository.visible) {
    if (!inScope(target)) continue;
    considered += 1;
    const found = repository.resolve(target);
    if (isOwnership(found)) {
      owned.push({ path: target, rule: found.rule, captures: found.captures });
      continue;
    }
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

  const { addons, dispose } = await startAddons(repository);

  const globOf = (pattern: string): string =>
    listing(repository.visible.filter((target) => matchGlob(pattern, target)));

  const cache = openCache(config, options.cache, globOf);

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
      example: module.example,
      exampleSource: module.exampleSource,
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
      example: module.example,
      exampleSource: module.exampleSource,
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

  const applicable = (target: string): { constraint: Constraint; captures: Record<string, CaptureValue> }[] =>
    espalier.constraints.flatMap((constraint) => {
      const captures = constraintCaptures(constraint, target);
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
