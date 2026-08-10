// `espalier lint`. docs/cli/lint/README.MD.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Constraint, StructuralRule } from "./compile.js";
import { fail, OperationalError } from "./errors.js";
import { matchGlob } from "./files.js";
import { constraintCaptures, isOwnership, requiredFiles, type CaptureValue } from "./match.js";
import type { Issue, Reporter, Severity } from "./output.js";
import { open, type Repository } from "./repository.js";
import { ignores } from "./ignore.js";

export interface LintOptions {
  cwd: string;
  config: string | undefined;
  paths: string[];
  rule: string | undefined;
  staged: boolean;
  ruleText: boolean;
}

const SEVERITIES = new Set<Severity>(["error", "warning", "info"]);

/** Normalizes a repo-relative path and rejects anything outside the repository. */
function within(target: unknown, whose: string): string {
  if (typeof target !== "string" || target === "") {
    fail("invalid_issue_path", `${whose}: path must be a non-empty string`);
  }
  if (path.isAbsolute(target)) {
    fail("invalid_issue_path", `${whose}: "${target}" is absolute; paths are repository-relative`);
  }
  const normalized = path.posix.normalize(target.split(path.sep).join("/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    fail("invalid_issue_path", `${whose}: "${target}" escapes the repository`);
  }
  return normalized;
}

function stagedFiles(root: string): string[] {
  try {
    return execFileSync("git", ["diff", "--name-only", "--cached", "-z"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\0")
      .filter((entry) => entry !== "");
  } catch (cause) {
    fail("git_failed", `could not list staged files: ${(cause as Error).message}`);
  }
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

export async function lint(options: LintOptions, reporter: Reporter): Promise<number> {
  const repository = await open(options.config, options.cwd);
  const { config, espalier } = repository;

  let scope: string[] | null = null;
  if (options.staged) {
    scope = stagedFiles(config.root);
  } else if (options.paths.length > 0) {
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

  const cache = new Map<string, string>();
  const readFile = async (target: string, whose: string): Promise<string> => {
    const normalized = within(target, whose);
    const cached = cache.get(normalized);
    if (cached !== undefined) return cached;
    let contents: string;
    try {
      contents = readFileSync(path.join(config.root, normalized), "utf8");
    } catch (cause) {
      fail("read_failed", `${whose}: could not read "${normalized}": ${(cause as Error).message}`);
    }
    cache.set(normalized, contents);
    return contents;
  };

  const listFiles = async (pattern: string): Promise<string[]> =>
    repository.visible.filter((target) => matchGlob(pattern, target));

  const invoke = async (
    modulePath: string,
    module: StructuralRule["module"],
    pattern: string,
    target: string,
    captures: Record<string, CaptureValue>,
  ): Promise<void> => {
    if (options.rule !== undefined && options.rule !== modulePath) return;

    const emit = (raw: unknown): void => {
      if (raw === null || typeof raw !== "object") {
        fail("invalid_issue", `${modulePath}: emit expects an issue object`);
      }
      const issue = raw as Record<string, unknown>;

      if (typeof issue["code"] !== "string" || issue["code"] === "") {
        fail("invalid_issue", `${modulePath}: an issue needs a string \`code\``);
      }
      if (typeof issue["message"] !== "string") {
        fail("invalid_issue", `${modulePath}: an issue needs a string \`message\``);
      }

      const severity = issue["severity"] ?? "error";
      if (typeof severity !== "string" || !SEVERITIES.has(severity as Severity)) {
        fail("invalid_issue", `${modulePath}: severity must be error, warning or info`);
      }

      // The target may be any path inside the repository — governed, declared,
      // existing or not. The file that has to change is often one the espalier
      // has not described yet.
      const attachedTo = issue["path"] === undefined ? target : within(issue["path"], modulePath);

      record({
        path: attachedTo,
        code: issue["code"],
        message: issue["message"],
        severity: severity as Severity,
        rule: modulePath,
        pattern,
        captures,
        line: typeof issue["line"] === "number" ? issue["line"] : null,
        column: typeof issue["column"] === "number" ? issue["column"] : null,
        metadata: (issue["metadata"] ?? {}) as Record<string, unknown>,
        ruleText: options.ruleText ? module.rule : null,
        description: module.description,
        example: module.example,
      });
    };

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
    }
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

  if (scope !== null) {
    reporter.warning(
      `partial run: ${considered} of ${repository.visible.length} file${repository.visible.length === 1 ? "" : "s"} checked. A scoped run cannot tell you the repository conforms.`,
    );
  }

  return errors > 0 ? 1 : 0;
}
