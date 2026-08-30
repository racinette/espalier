// Constraint selectors narrow the structurally governed candidates admitted by a constraint.

import type { Constraint } from "./compile.js";
import { matchGlob } from "./files.js";

export function targetPatterns(constraint: Constraint): string[] {
  if (constraint.module.targets === null) return [constraint.pattern];
  const suffix = `**/*.${constraint.extension}`;
  const base = constraint.pattern.endsWith(suffix)
    ? constraint.pattern.slice(0, -suffix.length)
    : "";
  return constraint.module.targets.map((target) => `${base}${target}`);
}

export function admitsTarget(constraint: Constraint, target: string): boolean {
  return targetPatterns(constraint).some((pattern) => matchGlob(pattern, target));
}
