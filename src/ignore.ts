// Gitignore-syntax matching for `.espalierignore` and `skip`, rule by rule so
// that the winning rule and its comment can be reported. docs/CONFIG.MD
// ".espalierignore". The patterns themselves are read by the `ignore` package,
// the same reader `ignoreFiles` uses, so one line means one thing wherever it
// is written.

import ignore from "ignore";

export interface IgnoreRule {
  matcher: { test(local: string): boolean };
  negated: boolean;
  dirOnly: boolean;
  /** The pattern as written, for reporting. */
  pattern: string;
  /**
   * Where the pattern came from, as a repo-relative path: `.espalierignore`, or
   * the `ignoreFiles` entry that held it. `explain` reports this, which is the
   * whole point of reading these lists from files a user can open.
   */
  origin: string;
  /** Repository-relative directory against which this file's patterns match. */
  base: string;
  /**
   * The comment block introducing this entry, or null when none does.
   *
   * `espalier build` writes it once beside its authored group —
   * docs/cli/build/README.MD "Not described here" — which is the reason the
   * list is a file rather than a key. The tool never supplies one of its own:
   * it has patterns, not intent.
   */
  comment: string | null;
  /** The authored comment-or-blank-delimited block this rule belongs to. */
  group: number;
}

/**
 * One pattern, matched the way git would match it, by the same library that
 * reads `ignoreFiles`. Negation, the directory-only slash and anchoring are
 * decided by `compileIgnore` and `excludedBy` so that a rule can be reported;
 * the pattern handed here has had them taken off, with a root anchor restored.
 */
function toMatcher(glob: string, rooted: boolean): { test(local: string): boolean } {
  const matcher = ignore({ ignoreCase: false }).add(rooted ? `/${glob}` : glob);
  // Callers ask about root-relative paths in whatever spelling they have,
  // including the root itself; the reader wants `a/b` and nothing else.
  return {
    test: (local) => {
      const relative = local.replace(/^(?:\.\/|\/)+/, "");
      return relative !== "" && relative !== "." && matcher.ignores(relative);
    },
  };
}

export function compileIgnore(
  patterns: string[],
  origin = ".espalierignore",
  base = "",
): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  // A comment introduces the entries beneath it and is closed by a blank line,
  // which is how a group written as one thought stays one thought. Lines
  // accumulate so a reason may run to several.
  let comment: string[] = [];
  let group = 0;

  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (trimmed === "") {
      comment = [];
      group += 1;
      continue;
    }
    if (trimmed.startsWith("#")) {
      comment.push(trimmed.slice(1).trim());
      continue;
    }

    const negated = trimmed.startsWith("!");
    let glob = negated ? trimmed.slice(1) : trimmed;

    const dirOnly = glob.endsWith("/");
    if (dirOnly) glob = glob.slice(0, -1);

    const rooted = glob.startsWith("/");
    if (rooted) glob = glob.slice(1);

    rules.push({
      matcher: toMatcher(glob, rooted),
      negated,
      dirOnly,
      pattern,
      origin,
      base,
      comment: comment.length === 0 ? null : comment.join(" "),
      group,
    });
  }

  return rules;
}

/** A repository-relative path as seen from the ignore file that owns a rule. */
function localPath(rule: IgnoreRule, relativePath: string): string | null {
  if (rule.base === "") return relativePath;
  const prefix = `${rule.base}/`;
  return relativePath.startsWith(prefix) ? relativePath.slice(prefix.length) : null;
}

/**
 * Later patterns win, and a rule matching an ancestor directory carries down to
 * everything beneath it.
 *
 * An excluded directory is final: nothing beneath it can be re-included. Git
 * has the same rule, and here it is not a choice — `collectCandidates` never
 * enters such a directory, so a negation that appeared to win would name a file
 * no run had looked at. Evaluating every level and letting the last match win
 * made `explain` answer "not declared" for a path `lint` could not see.
 */
export function excludedBy(
  rules: IgnoreRule[],
  relativePath: string,
  asDirectory = false,
  observed?: Set<IgnoreRule>,
): IgnoreRule | null {
  const segments = relativePath.split("/");
  let winner: IgnoreRule | null = null;

  for (let depth = 1; depth <= segments.length; depth += 1) {
    const partial = segments.slice(0, depth).join("/");
    // Every segment but the last names a directory. The last one usually names
    // a file — but `init` asks about directories by name, and a `.github/`
    // entry would never match if it were assumed otherwise.
    const isDirectory = depth < segments.length || asDirectory;

    for (const rule of rules) {
      if (rule.dirOnly && !isDirectory) continue;
      const local = localPath(rule, partial);
      if (local !== null && rule.matcher.test(local)) {
        const next = rule.negated ? null : rule;
        winner = next;
      }
    }

    // An ancestor settled it. Deeper patterns describe paths inside a directory
    // the walk never opened.
    if (winner !== null && depth < segments.length) {
      observed?.add(winner);
      return winner;
    }
  }

  if (winner !== null) observed?.add(winner);
  return winner;
}

export function ignores(
  rules: IgnoreRule[],
  relativePath: string,
  asDirectory = false,
): boolean {
  return excludedBy(rules, relativePath, asDirectory) !== null;
}
