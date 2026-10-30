// The human layout for `espalier explain`. docs/cli/explain/README.MD "Human layout".
//
// Separate from output.ts so the formatter stays a formatter, and separate from
// explain.ts so the answer is built once and encoded twice. The payload here is
// exactly what `--format jsonl` emits; nothing is computed for one format that
// the other does not get.

import type { CaptureValue } from "./match.js";
import { drawMap, marksLegend, type MapEntry, readInside } from "./render.js";

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
  guidance: string;
  referenceImplementation: string | null;
  captures?: Record<string, CaptureValue>;
  aggregate?: true;
  targets?: string[];
}

/** One declared group: a module at the rule's name with the grouping's captures written in. */
export interface DeclaredGroupAnswer {
  rule: string;
  pattern: string;
  captures: Record<string, string>;
  description: string | null;
  guidance: string;
}

/** One grouping a rule declares, as `explain` reports it. */
export interface GroupAnswer {
  name: string;
  by: string[];
  description: string;
  guidance: string;
  /** Every group must be declared. docs/INSTANCES.MD "Abstract groupings". */
  abstract?: true;
  /** No group joins or leaves the grouping. docs/LOCKS.MD "Sealed collections". */
  sealed?: true;
  /** The group a file belongs to; absent in a prefix answer, where no file is in hand. */
  captures?: Record<string, CaptureValue>;
  /** In a prefix answer, every declared group of this grouping. */
  instances?: DeclaredGroupAnswer[];
  /** In a file answer, the declaration of the file's group, when it has one. */
  instance?: DeclaredGroupAnswer;
}

export interface RuleAnswer {
  inherited?: Array<Omit<InheritedAnswer, "captures">>;
  groups?: GroupAnswer[];
  /** Every match must be a declared instance. docs/INSTANCES.MD. */
  abstract?: true;
  /** The rule's module is locked. docs/LOCKS.MD. */
  locked?: true;
  path: string;
  pattern: string;
  rule: string;
  description: string | null;
  guidance: string;
  referenceImplementation: string | null;
  required: boolean;
}

export interface PrefixAnswer {
  kind: "explanation";
  prefix: string;
  /** The espalier that answered, or null for the one the command loaded. */
  espalier?: string | null;
  description: string | null;
  body: string;
  /** For a named instance directory, its contract, e.g. \`[group]/\`; its guidance is the contract's to state. */
  instanceOf?: string;
  /** The directory is locked, and which module's export decided it. docs/LOCKS.MD. */
  locked?: true;
  lockedBy?: string;
  /** Files beneath keep their content, and which module's export decided it. */
  frozen?: true;
  frozenBy?: string;
  /** The sealed directories it lies in, itself included. docs/LOCKS.MD "Sealed collections". */
  sealedBy?: string[];
  captures: Record<string, CaptureValue>;
  rules: RuleAnswer[];
  /** The same subtree `build` draws, as data. */
  map: MapEntry[] | null;
  closedSet: string | null;
  /** Child espaliers inside the subtree, relative to the prefix. */
  governed: string[];
  constraints: ConstraintAnswer[];
}

export interface InheritedAnswer {
  rule: string; pattern: string; captures: Record<string, CaptureValue>; guidance: string; description: string | null;
}

export interface OwnedAnswer {
  inherited?: InheritedAnswer[];
  groups?: GroupAnswer[];
  /** The owner is abstract and this path is not declared. docs/INSTANCES.MD. */
  abstract?: true;
  /** The owning module is locked, and which module's export decided it. docs/LOCKS.MD. */
  locked?: true;
  lockedBy?: string;
  /** The file keeps its content, and which module's export decided it. docs/LOCKS.MD "Frozen files". */
  frozen?: true;
  frozenBy?: string;
  /** The sealed collections it belongs to. docs/LOCKS.MD "Sealed collections". */
  sealedBy?: string[];
  kind: "explanation";
  path: string;
  /** The espalier that answered, or null for the one the command loaded. */
  espalier?: string | null;
  rule: string;
  pattern: string;
  captures: Record<string, CaptureValue>;
  description: string | null;
  guidance: string;
  referenceImplementation: string | null;
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
   * external ignore file whose pattern hid it.
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

/**
 * Labelled rows, such as `Owned by` and `Locked by`, with their values in one
 * column: the widest label present sets it. Returns the lines and the column,
 * so continuation lines can align with the values.
 */
function labelled(rows: ReadonlyArray<readonly [label: string, value: string] | null>): { lines: string[]; column: number } {
  const present = rows.filter((row) => row !== null);
  const width = Math.max(...present.map(([label]) => label.length));
  return { lines: present.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`), column: width + 4 };
}

/** The lock, freeze and seals an answer reports, as labelled rows. docs/LOCKS.MD. */
function protections(answer: { locked?: true; lockedBy?: string; frozen?: true; frozenBy?: string; sealedBy?: string[] }): Array<readonly [string, string] | null> {
  return [
    answer.locked === true ? ["Locked by", answer.lockedBy!] : null,
    answer.frozen === true ? ["Frozen by", answer.frozenBy!] : null,
    answer.sealedBy !== undefined ? ["Sealed by", answer.sealedBy.join(", ")] : null,
  ];
}

/** The rule and reference-implementation blocks a rule and constraint share. */
function body(
  guidance: string,
  referenceImplementation: string | null,
): string[] {
  const blocks: string[] = [];
  if (guidance !== "") {
    blocks.push(`  Guidance\n${guidance.split("\n").map((line) => `    ${line}`).join("\n")}`);
  }
  if (referenceImplementation !== null) {
    blocks.push(
      `  Reference implementation\n    ${referenceImplementation}`,
    );
  }
  return blocks;
}

/** The groupings a rule declares, and for a file, which group it is in. */
function groupBlocks(groups: GroupAnswer[], concise: boolean): string[] {
  return groups.map((group) => {
    const by = group.by.length === 0 ? "the directory" : group.by.join(", ");
    const lines = [`  Grouped as ${group.name} by ${by}${group.abstract ? ", every group declared" : ""}${group.sealed ? ", sealed" : ""}  ${group.description}`];
    if (group.captures !== undefined) lines.push(...describeCaptures(group.captures, " ".repeat(12)));
    if (!concise && group.guidance !== "") lines.push("", ...group.guidance.split("\n").map((line) => `    ${line}`));
    if (group.instance !== undefined) {
      lines.push("", `  Declared as ${group.instance.pattern}${group.instance.description === null ? "" : `  ${group.instance.description}`}`);
      if (!concise && group.instance.guidance !== "") lines.push("", ...group.instance.guidance.split("\n").map((line) => `    ${line}`));
    }
    if (group.abstract && group.captures !== undefined && group.instance === undefined) {
      lines.push("", "  Undeclared: this group must be declared; see `espalier help instances`");
    }
    for (const instance of group.instances ?? []) {
      lines.push(`    Declared ${instance.pattern}${instance.description === null ? "" : `  ${instance.description}`}`);
    }
    return lines.join("\n");
  });
}

function constraintBlocks(
  constraints: ConstraintAnswer[],
  applying: string,
  concise: boolean,
): string[] {
  if (constraints.length === 0) return [];
  if (concise) {
    const lines = [
      "  Constraints:",
      ...constraints.map((constraint) => `    ${constraint.name}  ${constraint.rule}`),
    ];
    return [lines.join("\n")];
  }
  const blocks = [section(`Constraints applying ${applying}`)];

  for (const constraint of constraints) {
    // No captures here, unlike the owning rule's block. A constraint's captures
    // are the directory segments of the path the reader just typed; repeating
    // them back is noise. `--format jsonl` carries them for anything that wants
    // them.
    blocks.push(
      [
        `  ${column(constraint.name, COLUMN - 2)}${constraint.patterns.join(", ")}`,
        ...constraint.guidance.split("\n").map((line) => `    ${line}`),
      ].join("\n"),
    );
  }

  return blocks;
}

export function renderExplanation(answer: Explanation, concise = false): string {
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
    if (answer.instanceOf !== undefined) blocks.push(`  An instance of ${answer.instanceOf}`);
    const protectedBy = labelled(protections(answer)).lines;
    if (protectedBy.length > 0) blocks.push(protectedBy.join("\n"));
    if (!concise && answer.body !== "") blocks.push(answer.body);
    if (concise && Object.keys(answer.captures).length > 0) {
      blocks.push(["  Captures:", ...describeCaptures(answer.captures, "    ")].join("\n"));
    }

    // The map `build` draws, from the same code and to the same width less
    // this indent. docs/cli/explain/README.MD "A prefix".
    if (answer.map !== null && answer.map.length > 0) {
      blocks.push(
        [
          "  Declared here:",
          ...drawMap(answer.map, WIDTH + 2 - 4).map((line) => `    ${line}`.trimEnd()),
        ].join("\n"),
      );
      const legend = marksLegend(answer.map);
      if (legend !== null) blocks.push(wrap(legend));
    }

    if (answer.closedSet !== null) blocks.push(wrap(answer.closedSet));

    if (answer.governed.length > 0) {
      blocks.push(
        [
          "  Governed elsewhere:",
          ...answer.governed.map((name) => `    ${name}`),
          "",
          `  ${readInside(answer.governed.length)}`,
        ].join("\n"),
      );
    }

    if (!concise) {
      for (const rule of answer.rules) {
        blocks.push(section(rule.path));
        if (rule.description !== null) blocks.push(`  ${rule.description}`);
        blocks.push(
          ...body(rule.guidance, rule.referenceImplementation),
          ...groupBlocks(rule.groups ?? [], false),
        );
      }
    }

    blocks.push(...constraintBlocks(answer.constraints, `under ${shown}`, concise));
    return `${blocks.join("\n\n")}\n`;
  }

  if ("ignoredBy" in answer) {
    const reason =
      {
        ".espalierignore": "Excluded by a pattern in .espalierignore.",
        worktree: "This path belongs to a linked Git worktree. Run Espalier inside that worktree.",
        espalier: "Invisible unconditionally: espalier does not report on its own machinery.",
        child: "Inside an espalier of its own, which is what answers for this path.",
      }[answer.ignoredBy] ??
      // Anything else is the external ignore file that removed the path from
      // the repository Espalier receives as input.
      `Not visible to espalier because of a pattern from ${answer.ignoredBy}.`;
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
  const owner = labelled([
    ["Owned by", answer.rule.replace(/\.mjs$/, "")],
    answer.abstract === true ? ["Undeclared", "the contract is abstract; declare this path, or see `espalier help instances`"] : null,
    ...protections(answer),
  ]);
  blocks.push(
    [
      owner.lines[0]!,
      ...describeCaptures(answer.captures, " ".repeat(owner.column)),
      ...owner.lines.slice(1),
    ].join("\n"),
  );
  blocks.push(
    ...body(concise ? "" : answer.guidance, answer.referenceImplementation),
    ...(answer.inherited ?? []).flatMap((base) => [
      `  Inherits ${base.rule}`,
      ...body(concise ? "" : base.guidance, null),
    ]),
    ...groupBlocks(answer.groups ?? [], concise),
  );
  blocks.push(...constraintBlocks(answer.constraints, `to ${answer.path}`, concise));

  return `${blocks.join("\n\n")}\n`;
}
