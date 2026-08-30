// Filesystem visibility supplied by external ignore files. Unlike
// `.espalierignore`, these rules define the repository Espalier receives as
// input: matching paths do not become candidates and are never documented as
// governance exclusions.

import ignore, { type Ignore } from "ignore";

export interface VisibilityRules {
  matcher: Ignore;
  /** Repository-relative path of the file supplying these rules. */
  origin: string;
  /** Repository-relative directory against which its patterns are evaluated. */
  base: string;
}

export function compileVisibility(
  patterns: string[],
  origin: string,
  base = "",
): VisibilityRules {
  // Git's case-folding is configured outside the repository. Espalier cannot
  // consult that machine-local setting, so matching stays case-sensitive and
  // deterministic on every filesystem.
  return {
    matcher: ignore({ ignoreCase: false }).add(patterns),
    origin,
    base,
  };
}

/** A repository-relative path as seen from the ignore file that owns a rule. */
function localPath(rule: VisibilityRules, relativePath: string): string | null {
  if (rule.base === "") return relativePath;
  const prefix = `${rule.base}/`;
  return relativePath.startsWith(prefix) ? relativePath.slice(prefix.length) : null;
}

/**
 * The last external ignore source deciding this path, or null when the path is
 * visible. Separate sources are evaluated in authored/discovery order so a
 * deeper `.gitignore` can override the files above it.
 */
export function hiddenBy(
  rules: VisibilityRules[],
  relativePath: string,
  asDirectory = false,
): VisibilityRules | null {
  let winner: VisibilityRules | null = null;

  for (const rule of rules) {
    const local = localPath(rule, relativePath);
    if (local === null || local === "") continue;
    const result = rule.matcher.test(asDirectory ? `${local}/` : local);
    if (result.ignored) winner = rule;
    else if (result.unignored) winner = null;
  }

  return winner;
}
