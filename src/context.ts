// The parts of the lint context that both the runner and the API build.
//
// `emit` lives here rather than inside `lint` because docs/API.MD promises that
// a rule tested through `runRule` fails for the same reason and with the same
// code it would fail for in production. Two implementations of that validation
// would make the promise a coincidence.

import path from "node:path";
import { fail } from "./errors.js";
import type { CaptureValue } from "./match.js";
import type { Issue, Severity } from "./output.js";

const SEVERITIES = new Set<Severity>(["error", "warning", "info"]);

/** Normalizes a repo-relative path and rejects anything outside the repository. */
export function within(target: unknown, whose: string): string {
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

export interface EmitOptions {
  /** Espalier-relative module path, or null when the caller has none. */
  modulePath: string | null;
  pattern: string;
  path: string;
  captures: Record<string, CaptureValue>;
  /** The module's `rule` text, or null when the caller suppressed it. */
  ruleText: string | null;
  description?: string | null;
  example?: string | null;
  record: (issue: Issue) => void;
}

export function createEmit(options: EmitOptions): (raw: unknown) => void {
  const whose = options.modulePath ?? "rule";

  return (raw: unknown): void => {
    if (raw === null || typeof raw !== "object") {
      fail("invalid_issue", `${whose}: emit expects an issue object`);
    }
    const issue = raw as Record<string, unknown>;

    if (typeof issue["code"] !== "string" || issue["code"] === "") {
      fail("invalid_issue", `${whose}: an issue needs a string \`code\``);
    }
    if (typeof issue["message"] !== "string") {
      fail("invalid_issue", `${whose}: an issue needs a string \`message\``);
    }

    const severity = issue["severity"] ?? "error";
    if (typeof severity !== "string" || !SEVERITIES.has(severity as Severity)) {
      fail("invalid_issue", `${whose}: severity must be error, warning or info`);
    }

    // The target may be any path inside the repository — governed, declared,
    // existing or not. The file that has to change is often one the espalier
    // has not described yet.
    const attachedTo = issue["path"] === undefined ? options.path : within(issue["path"], whose);

    options.record({
      path: attachedTo,
      code: issue["code"],
      message: issue["message"],
      severity: severity as Severity,
      rule: options.modulePath,
      pattern: options.pattern,
      captures: options.captures,
      line: typeof issue["line"] === "number" ? issue["line"] : null,
      column: typeof issue["column"] === "number" ? issue["column"] : null,
      metadata: (issue["metadata"] ?? {}) as Record<string, unknown>,
      ruleText: options.ruleText,
      description: options.description,
      example: options.example,
    });
  };
}
