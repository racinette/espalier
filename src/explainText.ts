// The human layout for `espalier explain`. docs/cli/explain/README.MD "Human layout".
//
// Separate from output.ts so the formatter stays a formatter, and separate from
// explain.ts so the answer is built once and encoded twice. The payload here is
// exactly what `--format jsonl` emits; nothing is computed for one format that
// the other does not get.

import type { CaptureValue } from "./match.js";

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
  captures?: Record<string, CaptureValue>;
}

export interface RuleAnswer {
  path: string;
  pattern: string;
  rule: string;
  description: string | null;
  ruleText: string;
  example: string | null;
  required: boolean;
}

export interface PrefixAnswer {
  kind: "explanation";
  prefix: string;
  description: string | null;
  body: string;
  captures: Record<string, CaptureValue>;
  rules: RuleAnswer[];
  cardinality: string | null;
  constraints: ConstraintAnswer[];
}

export interface OwnedAnswer {
  kind: "explanation";
  path: string;
  rule: string;
  pattern: string;
  captures: Record<string, CaptureValue>;
  description: string | null;
  ruleText: string;
  example: string | null;
  constraints: ConstraintAnswer[];
}

export interface UndeclaredAnswer {
  kind: "explanation";
  path: string;
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
  ignoredBy: "ignore" | "defaultIgnore" | "espalier";
  rule: null;
  pattern: null;
  captures: Record<string, CaptureValue>;
  constraints: [];
}

export type Explanation = PrefixAnswer | OwnedAnswer | UndeclaredAnswer | UngovernedAnswer;

export function isPrefixAnswer(answer: Explanation): answer is PrefixAnswer {
  return "prefix" in answer;
}

function head(name: string, description: string | null): string {
  return description === null ? name : name.padEnd(COLUMN) + description;
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
function body(ruleText: string, example: string | null): string[] {
  const blocks: string[] = [];
  if (ruleText !== "") {
    blocks.push(`  Rule\n${ruleText.split("\n").map((line) => `    ${line}`).join("\n")}`);
  }
  if (example !== null) {
    blocks.push(
      example.includes("\n")
        ? `  Example\n${example.trim().split("\n").map((line) => `    ${line}`).join("\n")}`
        : `  Example\n    ${example}`,
    );
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
        `  ${constraint.name.padEnd(COLUMN - 2)}${constraint.patterns.join(", ")}`,
        ...constraint.ruleText.split("\n").map((line) => `    ${line}`),
      ].join("\n"),
    );
  }

  return blocks;
}

export function renderExplanation(answer: Explanation): string {
  const blocks: string[] = [];

  if (isPrefixAnswer(answer)) {
    const shown = answer.prefix === "" ? "./" : answer.prefix;
    blocks.push(head(shown, answer.description));
    if (answer.body !== "") blocks.push(answer.body);

    if (answer.rules.length > 0) {
      blocks.push(
        [
          "  Declared here:",
          ...answer.rules.map((rule) => `    ${rule.path.padEnd(COLUMN - 4)}${rule.description ?? ""}`.trimEnd()),
        ].join("\n"),
      );
    }

    if (answer.cardinality !== null) blocks.push(wrap(answer.cardinality));

    for (const rule of answer.rules) {
      blocks.push(section(rule.path));
      if (rule.description !== null) blocks.push(`  ${rule.description}`);
      blocks.push(...body(rule.ruleText, rule.example));
    }

    blocks.push(...constraintBlocks(answer.constraints, `under ${shown}`));
    return `${blocks.join("\n\n")}\n`;
  }

  if ("ignoredBy" in answer) {
    const reason = {
      ignore: "Ignored by the `ignore` list in espalier.config.yaml.",
      defaultIgnore: "Ignored by the default ignore list (defaultIgnore: true).",
      espalier: "Invisible unconditionally: espalier does not report on its own machinery.",
    }[answer.ignoredBy];
    return `${answer.path} is not governed by espalier.\n\n  ${reason}\n`;
  }

  if (answer.rule === null) {
    blocks.push(`${answer.path} is not declared.`);

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
  blocks.push(
    [
      `  Owned by  ${answer.rule.replace(/\.mjs$/, "")}`,
      ...describeCaptures(answer.captures, " ".repeat(12)),
    ].join("\n"),
  );
  blocks.push(...body(answer.ruleText, answer.example));
  blocks.push(...constraintBlocks(answer.constraints, `to ${answer.path}`));

  return `${blocks.join("\n\n")}\n`;
}
