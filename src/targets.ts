// Constraint selectors admit structurally governed candidates by filename or exported globs.

import type { Constraint } from "./compile.js";
import { escape } from "minimatch";
import type { Segment } from "./pattern.js";
import { matchGlob } from "./files.js";
import { constraintCaptures, type CaptureValue } from "./match.js";

/** Only placeholders become wildcards; authored punctuation remains literal. */
function segmentGlob(segment: Segment): string {
  if (segment.recursive !== null) return "**";
  return segment.parts.map((part) => part.kind === "literal" ? escape(part.text) : "*").join("");
}

/** Compiled prefix before `[...name]`, from directory segments. */
export function selectorOrigin(constraint: Constraint): string {
  const at = constraint.directory.findIndex((segment) => segment.recursive !== null);
  return constraint.directory
    .slice(0, at)
    .map(segmentGlob)
    .join("/");
}

/**
 * Candidate globs for selection and context. A filename-extension glob is an
 * overapproximation: `*.ts` also admits `foo.d.ts` as a glob, while the exact
 * filename selector rejects it in `constraintCaptures`.
 */
export function admissionGlobs(constraint: Constraint): string[] {
  if (constraint.module.targets === null) {
    const directory = constraint.directory.map(segmentGlob).join("/");
    const suffix = constraint.extension === null ? "" : `.${escape(constraint.extension)}`;
    return [`${directory === "" ? "" : `${directory}/`}*${suffix}`];
  }
  const origin = selectorOrigin(constraint);
  return constraint.module.targets.map((target) => (origin === "" ? target : `${origin}/${target}`));
}

export function admitsTarget(constraint: Constraint, target: string): boolean {
  return admissionGlobs(constraint).some((pattern) => matchGlob(pattern, target));
}

export function admitConstraint(
  constraint: Constraint,
  filePath: string,
): Record<string, CaptureValue> | null {
  const captures = constraintCaptures(constraint, filePath);
  if (captures === null || !admitsTarget(constraint, filePath)) return null;
  return captures;
}

/** Issue `pattern`: the sole admission glob, or the sorted list joined with ` | `. */
export function issuePattern(patterns: string[]): string {
  return [...patterns].sort((left, right) => left.localeCompare(right)).join(" | ");
}
