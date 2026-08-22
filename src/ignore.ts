// Gitignore-syntax matching for `ignore` and for whatever `ignoreFiles` names.
// docs/CONFIG.MD "ignore".

export interface IgnoreRule {
  matcher: RegExp;
  negated: boolean;
  dirOnly: boolean;
  /** The pattern as written, for reporting. */
  pattern: string;
  /**
   * Where the pattern came from: `"ignore"`, or the repo-relative path of the
   * `ignoreFiles` entry that held it. `explain` reports this, which is the
   * whole point of reading these lists from files a user can open.
   */
  origin: string;
}

function escape(char: string): string {
  return /[.*+?^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

function toMatcher(glob: string, anchored: boolean): RegExp {
  let body = "";

  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i]!;

    if (char === "*") {
      if (glob[i + 1] === "*") {
        const afterSlash = i === 0 || glob[i - 1] === "/";
        const beforeSlash = glob[i + 2] === "/";
        if (afterSlash && beforeSlash) {
          // `**/` matches zero or more leading directories.
          body += "(?:.*/)?";
          i += 2;
        } else {
          body += ".*";
          i += 1;
        }
      } else {
        body += "[^/]*";
      }
      continue;
    }

    body += char === "?" ? "[^/]" : escape(char);
  }

  return new RegExp(`^${anchored ? body : `(?:.*/)?${body}`}$`);
}

export function compileIgnore(patterns: string[], origin = "ignore"): IgnoreRule[] {
  const rules: IgnoreRule[] = [];

  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const negated = trimmed.startsWith("!");
    let glob = negated ? trimmed.slice(1) : trimmed;

    const dirOnly = glob.endsWith("/");
    if (dirOnly) glob = glob.slice(0, -1);

    const rooted = glob.startsWith("/");
    if (rooted) glob = glob.slice(1);

    // A pattern with an interior slash is anchored to the repository root;
    // a bare name matches at any depth.
    const anchored = rooted || glob.includes("/");

    rules.push({ matcher: toMatcher(glob, anchored), negated, dirOnly, pattern, origin });
  }

  return rules;
}

/**
 * Later patterns win, and a rule matching an ancestor directory carries down to
 * everything beneath it.
 *
 * TODO: git additionally refuses to re-include a path whose parent directory is
 * excluded. We evaluate every level and let the last match win, which is more
 * permissive and covers the documented cases; revisit if a real espalier trips
 * over the difference.
 */
export function excludedBy(
  rules: IgnoreRule[],
  relativePath: string,
  asDirectory = false,
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
      if (rule.matcher.test(partial)) winner = rule.negated ? null : rule;
    }
  }

  return winner;
}

export function ignores(
  rules: IgnoreRule[],
  relativePath: string,
  asDirectory = false,
): boolean {
  return excludedBy(rules, relativePath, asDirectory) !== null;
}
