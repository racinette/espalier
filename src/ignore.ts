// Gitignore-syntax matching for the `ignore` list and the built-in default
// list. docs/CONFIG.MD "ignore".

export interface IgnoreRule {
  matcher: RegExp;
  negated: boolean;
  dirOnly: boolean;
  source: string;
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

export function compileIgnore(patterns: string[]): IgnoreRule[] {
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

    rules.push({ matcher: toMatcher(glob, anchored), negated, dirOnly, source: pattern });
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
export function ignores(rules: IgnoreRule[], relativePath: string): boolean {
  const segments = relativePath.split("/");
  let ignored = false;

  for (let depth = 1; depth <= segments.length; depth += 1) {
    const partial = segments.slice(0, depth).join("/");
    const isDirectory = depth < segments.length;

    for (const rule of rules) {
      if (rule.dirOnly && !isDirectory) continue;
      if (rule.matcher.test(partial)) ignored = !rule.negated;
    }
  }

  return ignored;
}
