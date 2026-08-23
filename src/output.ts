// Formats and destinations. docs/cli/lint/README.MD "Output".
//
// `--format` chooses the encoding and `--out` the destination, independently.
// Everything the run has to say goes through both: issues, the partial-run
// warning, an operational failure. There is no second channel.

import { closeSync, openSync, writeSync } from "node:fs";
import path from "node:path";
import type { Explanation } from "./explainText.js";
import { renderExplanation } from "./explainText.js";
import type { CaptureValue } from "./match.js";

export type Severity = "error" | "warning" | "info";

export interface Issue {
  path: string;
  code: string;
  message: string;
  severity: Severity;
  /** Espalier-relative module path, or null for built-in issues. */
  rule: string | null;
  pattern: string | null;
  captures: Record<string, CaptureValue>;
  line: number | null;
  column: number | null;
  metadata: Record<string, unknown>;
  ruleText: string | null;
  /**
   * Repo-relative directory of the espalier that reported this, or null for the
   * one the command loaded. docs/cli/lint/README.MD "Nested espaliers".
   */
  espalier?: string | null;
  /** Not reported; carried so the human formatter can show it. */
  description?: string | null;
  example?: string | null;
  exampleSource?: string | null;
}

export type Format = "human" | "jsonl";

/**
 * What the human formatter is summarizing. The encoding is the same either way;
 * "3 files written" and "no issues" are not interchangeable closing lines, and
 * only the caller knows which question was asked.
 */
export type Mode = "lint" | "build" | "explain" | "init" | "adopt";

export type DriftState = "missing" | "changed" | "stale";

/** What a `build` run did to the filesystem. docs/cli/build/README.MD "Output". */
export interface BuildEntry {
  kind: "written" | "deleted" | "drift" | "skipped" | "narrowed";
  path: string;
  /** `drift` only. */
  state?: DriftState;
  /** `written` only: the module declares the file optional. */
  optional?: boolean;
  /** The espalier that produced it, or null for the one the command loaded. */
  espalier?: string | null;
}

interface Destination {
  write(text: string): void;
  close(): void;
}

function openDestination(out: string, root: string): Destination {
  if (out === "stdout") return { write: (text) => void writeSync(1, text), close: () => {} };
  if (out === "stderr") return { write: (text) => void writeSync(2, text), close: () => {} };

  const handle = openSync(path.resolve(root, out), "w");
  return {
    write: (text) => void writeSync(handle, text),
    close: () => closeSync(handle),
  };
}

export interface Reporter {
  issue(issue: Issue): void;
  warning(message: string): void;
  failure(
    code: string,
    message: string,
    detail?: Record<string, unknown>,
    espalier?: string | null,
  ): void;
  explanation(answer: Explanation): void;
  record(entry: BuildEntry): void;
  finish(): void;
}

function serialize(issue: Issue): string {
  return JSON.stringify({
    kind: "issue",
    path: issue.path,
    espalier: issue.espalier ?? null,
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    rule: issue.rule,
    pattern: issue.pattern,
    captures: issue.captures,
    line: issue.line,
    column: issue.column,
    metadata: issue.metadata,
    ruleText: issue.ruleText,
  });
}

function indent(text: string, by: string): string {
  return text
    .trim()
    .split("\n")
    .map((line) => `${by}${line}`)
    .join("\n");
}

function describeCaptures(captures: Record<string, CaptureValue>): string {
  const entries = Object.entries(captures);
  if (entries.length === 0) return "";
  const rendered = entries
    .map(([name, value]) =>
      Array.isArray(value) ? `${name} = [${value.join(", ")}]` : `${name} = "${value}"`,
    )
    .join(", ");
  return `   (${rendered})`;
}

class JsonlReporter implements Reporter {
  constructor(private readonly destination: Destination) {}

  issue(issue: Issue): void {
    this.destination.write(`${serialize(issue)}\n`);
  }

  warning(message: string): void {
    this.destination.write(`${JSON.stringify({ kind: "warning", message })}\n`);
  }

  failure(
    code: string,
    message: string,
    detail: Record<string, unknown> = {},
    espalier: string | null = null,
  ): void {
    this.destination.write(
      `${JSON.stringify({ kind: "failure", espalier, code, message, detail })}\n`,
    );
  }

  explanation(answer: Explanation): void {
    this.destination.write(`${JSON.stringify(answer)}\n`);
  }

  record(entry: BuildEntry): void {
    this.destination.write(`${JSON.stringify({ espalier: null, ...entry })}\n`);
  }

  finish(): void {
    this.destination.close();
  }
}

class HumanReporter implements Reporter {
  private readonly issues: Issue[] = [];
  private readonly warnings: string[] = [];
  private readonly records: BuildEntry[] = [];
  private failed = false;
  /**
   * A failure of the run this reporter belongs to, as opposed to one inside a
   * child espalier. Only the first kind means there is nothing to summarize;
   * the second leaves every sibling's findings standing, and hiding them here
   * would be the broken package concealing a violation in another.
   */
  private failedHere = false;

  constructor(
    private readonly destination: Destination,
    private readonly mode: Mode,
  ) {}

  issue(issue: Issue): void {
    this.issues.push(issue);
  }

  warning(message: string): void {
    this.warnings.push(message);
  }

  failure(
    code: string,
    message: string,
    _detail?: Record<string, unknown>,
    espalier: string | null = null,
  ): void {
    this.failed = true;
    if (espalier === null) this.failedHere = true;
    // A person reading a monorepo run needs to know which package could not be
    // built; the path in the message is relative to that package, not to here.
    const whose = espalier === null ? "" : `${espalier}: `;
    this.destination.write(`espalier: ${whose}${message}  (${code})\n`);
  }

  explanation(answer: Explanation): void {
    this.destination.write(renderExplanation(answer));
  }

  record(entry: BuildEntry): void {
    this.records.push(entry);
  }

  private summarizeBuild(): void {
    // A build that had no work to do should not look like a build that did
    // some, so an empty run prints nothing at all.
    if (this.records.length === 0) return;

    const counts = new Map<string, number>();
    for (const entry of [...this.records].sort((a, b) => (a.path < b.path ? -1 : 1))) {
      const label = entry.state ?? entry.kind;
      // Ten, not the longest label plus two: `uncovered` was nine characters
      // and ran straight into the path when this padded to nine. The width
      // outlived the label, and narrowing it now would re-fix nothing and
      // reflow every golden.
      // The marker rather than a fifth label: what happened to the file is
      // still that it was written, and the tally should say so. What differs
      // is how much the run is claiming, which belongs beside the path.
      const marker = entry.optional === true ? "  (optional)" : "";
      this.destination.write(`${label.padEnd(10)}${entry.path}${marker}\n`);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    const summary = [...counts.entries()].map(([label, count]) => `${count} ${label}`).join(", ");
    this.destination.write(`\n${summary}\n`);
  }

  finish(): void {
    // An operational failure here means the run produced nothing to summarize.
    if (this.failedHere) {
      this.destination.close();
      return;
    }

    if (this.mode === "build" || this.mode === "init" || this.mode === "adopt") {
      this.summarizeBuild();
      // Warnings outlive the tally here as they do for `lint`: advice about
      // what was written rather than part of the record of it. No writing
      // command emits one today; the branch is here because the summary and
      // the advice are separate things, and putting the tally last is the
      // decision, not which commands happen to have advice to give.
      for (const warning of this.warnings) this.destination.write(`\n${warning}\n`);
      this.destination.close();
      return;
    }

    // `explain` writes its own payload and has no tally to add.
    if (this.mode === "explain") {
      this.destination.close();
      return;
    }

    // Grouping by path is inherently a buffering operation, which is a
    // formatter's business rather than the runner's.
    const grouped = new Map<string, Issue[]>();
    for (const issue of this.issues) {
      const bucket = grouped.get(issue.path);
      if (bucket === undefined) grouped.set(issue.path, [issue]);
      else bucket.push(issue);
    }

    for (const [target, issues] of [...grouped.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      this.destination.write(`\n${target}\n`);

      for (const issue of issues) {
        const position =
          issue.line === null
            ? ""
            : `${issue.line}${issue.column === null ? "" : `:${issue.column}`}  `;
        this.destination.write(`  ${position}${issue.severity}  ${issue.code}   ${issue.message}\n`);

        const recognized = issue.metadata["recognized"];
        if (typeof recognized === "string") {
          const captures = (issue.metadata["captures"] ?? {}) as Record<string, CaptureValue>;
          this.destination.write(
            `\n    The espalier recognizes  ${recognized}/${describeCaptures(captures)}\n`,
          );
          const declared = (issue.metadata["declared"] ?? []) as string[];
          if (declared.length > 0) {
            this.destination.write(`    Declared there:\n`);
            for (const entry of declared) this.destination.write(`      ${entry}\n`);
          }
        }

        if (issue.ruleText !== null) {
          const heading = issue.description == null ? "Rule:" : `Rule (${issue.description}):`;
          this.destination.write(`\n    ${heading}\n${indent(issue.ruleText, "      ")}\n`);
        }

        // A path is one line and reads as one. Source goes under the heading and
        // is indented like the rule body — interpolating it into a sentence
        // breaks the indentation a fixed layout exists to keep.
        // docs/cli/lint/README.MD "human".
        if (issue.example != null) {
          this.destination.write(`\n    Reference implementation: ${issue.example}\n`);
        } else if (issue.exampleSource != null) {
          this.destination.write(
            `\n    Reference implementation:\n${indent(issue.exampleSource, "      ")}\n`,
          );
        }
      }
    }

    const counts = { error: 0, warning: 0, info: 0 };
    for (const issue of this.issues) counts[issue.severity] += 1;

    const summary = (["error", "warning", "info"] as const)
      .filter((severity) => counts[severity] > 0)
      .map((severity) => `${counts[severity]} ${severity}${counts[severity] === 1 ? "" : "s"}`)
      .join(", ");

    this.destination.write(`\n${summary === "" ? "no issues" : summary}\n`);
    for (const warning of this.warnings) this.destination.write(`${warning}\n`);

    this.destination.close();
  }
}

export function createReporter(format: Format, out: string, root: string, mode: Mode): Reporter {
  const destination = openDestination(out, root);
  return format === "jsonl" ? new JsonlReporter(destination) : new HumanReporter(destination, mode);
}
