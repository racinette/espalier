// The human layout for `espalier explain`. docs/cli/explain/README.MD "Human layout".
//
// Separate from output.ts so the formatter stays a formatter, and separate from
// explain.ts so the answer is built once and encoded twice. The payload here is
// exactly what `--format jsonl` emits; nothing is computed for one format that
// the other does not get.

import type { CaptureValue } from "./match.js";
import { drawMap, type MapEntry, OWNED, readInside } from "./render.js";

/** Descriptions align here, on every line that has one. */
const COLUMN = 41;
/** A section rule is padded to this. */
const SECTION = 70;
/** Composed prose wraps here and is indented two, so nothing exceeds 80. */
const WIDTH = 78;

export interface ConstraintAnswer {
  name: string;
  rule: string;
  patterns: string[];
  description: string;
  ruleText: string;
  example: string | null;
  exampleSource: string | null;
  captures?: Record<string, CaptureValue>;
}

export interface RuleAnswer {
  path: string;
  pattern: string;
  rule: string;
  description: string | null;
  ruleText: string;
  example: string | null;
  exampleSource: string | null;
  required: boolean;
}

export interface PrefixAnswer {
  kind: "explanation";
  prefix: string;
  /** The espalier that answered, or null for the one the command loaded. */
  espalier?: string | null;
  description: string | null;
  body: string;
  captures: Record<string, CaptureValue>;
  rules: RuleAnswer[];
  /** The same subtree `build` draws, as data. */
  map: MapEntry[] | null;
  closedSet: string | null;
  /** Child espaliers inside the subtree, relative to the prefix. */
  governed: string[];
  constraints: ConstraintAnswer[];
}

export interface OwnedAnswer {
  kind: "explanation";
  path: string;
  /** The espalier that answered, or null for the one the command loaded. */
  espalier?: string | null;
  rule: string;
  pattern: string;
  captures: Record<string, CaptureValue>;
  description: string | null;
  ruleText: string;
  example: string | null;
  exampleSource: string | null;
  constraints: ConstraintAnswer[];
}

export interface UndeclaredAnswer {
  kind: "explanation";
  path: string;
  /** The espalier that answered, or null for the one the command loaded. */
  espalier?: string | null;
  rule: null;
  pattern: null;
  captures: Record<string, CaptureValue>;
  recognized: string | null;
  declared: string[];
  constraints: [];
}

export interface UngovernedAnswer {
  kind: "explanation";
  path: string;
  /** The espalier that answered, or null for the one the command loaded. */
  espalier?: string | null;
  /**
   * `"ignore"`, `"espalier"`, `"child"`, or the repo-relative path of the
   * `ignoreFiles` entry whose pattern excluded it.
   */
  ignoredBy: string;
  rule: null;
  pattern: null;
  captures: Record<string, CaptureValue>;
  constraints: [];
}

export type Explanation = PrefixAnswer | OwnedAnswer | UndeclaredAnswer | UngovernedAnswer;

export function isPrefixAnswer(answer: Explanation): answer is PrefixAnswer {
  return "prefix" in answer;
}

/**
 * `name` in a fixed column, followed by whatever comes after it.
 *
 * `padEnd` does nothing once the name is already at the column width, which
 * runs the two together with no separator at all — and a path deep enough to
 * overflow the column is exactly the path a reader most needs told apart from
 * its description. Two spaces is the minimum the rest of the layout uses.
 */
function column(name: string, width: number): string {
  return name.length >= width ? `${name}  ` : name.padEnd(width);
}

function head(name: string, description: string | null): string {
  return description === null ? name : column(name, COLUMN) + description;
}

function section(title: string): string {
  const opening = `── ${title} `;
  return opening + "─".repeat(Math.max(0, SECTION - opening.length));
}

function wrap(text: string, indent = "  "): string {
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(/\s+/).filter((entry) => entry !== "")) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (candidate.length <= WIDTH) {
      current = candidate;
    } else {
      if (current !== "") lines.push(current);
      current = word;
    }
  }

  if (current !== "") lines.push(current);
  return lines.map((line) => indent + line).join("\n");
}

function describeCaptures(captures: Record<string, CaptureValue>, indent: string): string[] {
  return Object.entries(captures).map(
    ([name, value]) =>
      `${indent}${name} = ${Array.isArray(value) ? `[${value.join(", ")}]` : `"${value}"`}`,
  );
}

/** The `Rule` and `Example` blocks a rule and a constraint share. */
function body(ruleText: string, example: string | null, source: string | null): string[] {
  const blocks: string[] = [];
  if (ruleText !== "") {
    blocks.push(`  Rule\n${ruleText.split("\n").map((line) => `    ${line}`).join("\n")}`);
  }
  // One heading and one indent for both: the reader wants the example, not the
  // mechanism that supplied it. docs/cli/explain/README.MD "Human layout".
  const shown = example ?? source;
  if (shown !== null) {
    blocks.push(`  Example\n${shown.trim().split("\n").map((line) => `    ${line}`).join("\n")}`);
  }
  return blocks;
}

function constraintBlocks(constraints: ConstraintAnswer[], applying: string): string[] {
  if (constraints.length === 0) return [];
  const blocks = [section(`Constraints applying ${applying}`)];

  for (const constraint of constraints) {
    // No captures here, unlike the owning rule's block. A constraint's captures
    // are the directory segments of the path the reader just typed; repeating
    // them back is noise. `--format jsonl` carries them for anything that wants
    // them.
    blocks.push(
      [
        `  ${column(constraint.name, COLUMN - 2)}${constraint.patterns.join(", ")}`,
        ...constraint.ruleText.split("\n").map((line) => `    ${line}`),
      ].join("\n"),
    );
  }

  return blocks;
}

export function renderExplanation(answer: Explanation): string {
  const blocks: string[] = [];

  // Which espalier is speaking, before what it says. Only ever present in a
  // repository with children, and the answer for a path does not depend on the
  // directory the command ran in — so this names the espalier, not the caller.
  const answeredBy =
    answer.espalier === null || answer.espalier === undefined
      ? null
      : `  Answered by  ${answer.espalier}`;

  if (isPrefixAnswer(answer)) {
    const shown = answer.prefix === "" ? "./" : answer.prefix;
    blocks.push(head(shown, answer.description));
    if (answeredBy !== null) blocks.push(answeredBy);
    if (answer.body !== "") blocks.push(answer.body);

    // The map `build` draws, from the same code and to the same width less
    // this indent. docs/cli/explain/README.MD "A prefix".
    if (answer.map !== null && answer.map.length > 0) {
      blocks.push(
        [
          "  Declared here:",
          ...drawMap(answer.map, WIDTH + 2 - 4).map((line) => `    ${line}`.trimEnd()),
        ].join("\n"),
      );
    }

    if (answer.closedSet !== null) blocks.push(wrap(answer.closedSet));

    if (answer.governed.length > 0) {
      const width = Math.max(...answer.governed.map((name) => name.length)) + 2;
      blocks.push(
        [
          "  Governed elsewhere:",
          ...answer.governed.map((name) => `    ${column(name, width)}${OWNED}`),
          "",
          `  ${readInside(answer.governed.length)}`,
        ].join("\n"),
      );
    }

    for (const rule of answer.rules) {
      blocks.push(section(rule.path));
      if (rule.description !== null) blocks.push(`  ${rule.description}`);
      blocks.push(...body(rule.ruleText, rule.example, rule.exampleSource));
    }

    blocks.push(...constraintBlocks(answer.constraints, `under ${shown}`));
    return `${blocks.join("\n\n")}\n`;
  }

  if ("ignoredBy" in answer) {
    const reason =
      {
        ".espalierignore": "Excluded by a pattern in .espalierignore.",
        espalier: "Invisible unconditionally: espalier does not report on its own machinery.",
        child: "Inside an espalier of its own, which is what answers for this path.",
      }[answer.ignoredBy] ??
      // Anything else is the path of the `ignoreFiles` entry that held the
      // winning pattern — a file the reader can open and edit.
      `Excluded by a pattern from ${answer.ignoredBy}, read because \`ignoreFiles\` names it.`;
    const whose = answeredBy === null ? "" : `${answeredBy}\n\n`;
    return `${answer.path} is not governed by espalier.\n\n${whose}  ${reason}\n`;
  }

  if (answer.rule === null) {
    blocks.push(`${answer.path} is not declared.`);
    if (answeredBy !== null) blocks.push(answeredBy);

    if (answer.recognized === null) {
      blocks.push("  The espalier recognizes nothing on this path.");
    } else {
      const lines = [
        `  The espalier recognizes ${answer.recognized}/`,
        ...describeCaptures(answer.captures, "    "),
      ];
      if (answer.declared.length > 0) {
        lines.push("  Declared there:", ...answer.declared.map((entry) => `    ${entry}`));
      }
      blocks.push(lines.join("\n"));
    }

    return `${blocks.join("\n\n")}\n`;
  }

  blocks.push(head(answer.path, answer.description));
  if (answeredBy !== null) blocks.push(answeredBy);
  blocks.push(
    [
      `  Owned by  ${answer.rule.replace(/\.mjs$/, "")}`,
      ...describeCaptures(answer.captures, " ".repeat(12)),
    ].join("\n"),
  );
  blocks.push(...body(answer.ruleText, answer.example, answer.exampleSource));
  blocks.push(...constraintBlocks(answer.constraints, `to ${answer.path}`));

  return `${blocks.join("\n\n")}\n`;
}
