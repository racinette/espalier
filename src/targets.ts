// Constraint selectors narrow the structurally governed candidates admitted by a constraint.

import type { Constraint } from "./compile.js";
import { matchGlob } from "./files.js";
import { constraintCaptures, type CaptureValue } from "./match.js";

/** Compiled prefix before `[...name]`, from directory segments. */
export function selectorOrigin(constraint: Constraint): string {
  const at = constraint.directory.findIndex((segment) => segment.recursive !== null);
  return constraint.directory
    .slice(0, at)
    .map((segment) => segment.shape)
    .join("/");
}

/**
 * Globs that describe the selected population. The compiled scope when
 * `targets` is omitted, otherwise each selector rooted at the origin.
 */
export function admissionGlobs(constraint: Constraint): string[] {
  if (constraint.module.targets === null) return [constraint.pattern];
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
