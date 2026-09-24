// The incremental cache. docs/cli/lint/README.MD "Incremental runs".
//
// Nothing here may throw. A cache that cannot be read, parsed, trusted or
// written is a cache the run does without: the work is always available, and a
// linter that fails over its own bookkeeping is worse than a slow one.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listEntries } from "./compile.js";
import type { Config } from "./config.js";
import { compileIgnore } from "./ignore.js";
import {
  implementationMatches,
  type ImplementationObserver,
  type ImplementationSnapshot,
} from "./implementation.js";
import type { Issue, Severity } from "./output.js";

/** Bump when a line stops meaning what it meant. Older files are discarded. */
const FORMAT = 4;

const DIRECTORY = ".cache";
const FILENAME = "lint.jsonl";

/** An issue as stored: what `emit` produced, with nothing derived. */
export interface Stored {
  code: string;
  message: string;
  severity: Severity;
  path: string;
  line: number | null;
  column: number | null;
  metadata: Record<string, unknown>;
}

/** What one invocation looked at while it ran. */
export interface Dependencies {
  /** Repo-relative paths the rule read. Stamped when the entry is recorded. */
  reads: Set<string>;
  /** Glob, to a digest of the sorted list it returned. */
  globs: Map<string, string>;
  /** Digest of the actual selected group, for an aggregate invocation. */
  membership?: string;
}

export function dependencies(): Dependencies {
  return { reads: new Set(), globs: new Map() };
}

export function stored(issue: Issue): Stored {
  return {
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    path: issue.path,
    line: issue.line,
    column: issue.column,
    metadata: issue.metadata,
  };
}

interface Entry {
  rule: string;
  pattern: string;
  path: string;
  reads: Record<string, string>;
  globs: Record<string, string>;
  membership?: string;
  issues: Stored[];
}

interface ImplementationHeader {
  node: string;
  conditions: string[];
  /** Absolute path to size-and-mtime identity. */
  files: Record<string, string>;
  /** Resolution request identity to its final canonical URL. */
  edges: Record<string, string>;
  /** Explicit repository-relative pattern to its membership digest. */
  globs: Record<string, string>;
}

export interface Cache {
  /**
   * What this invocation concluded last time, if everything it depended on is
   * where it left it. Null means run the rule.
   */
  replay(rule: string, pattern: string, target: string, membership?: string): Stored[] | null;
  record(
    rule: string,
    pattern: string,
    target: string,
    deps: Dependencies,
    issues: Stored[],
    targetIsInput?: boolean,
  ): void;
  /**
   * `prune` drops entries this run did not visit. Only a run that was neither
   * scoped nor filtered may: an unvisited invocation cannot be told from one
   * that no longer exists.
   */
  write(prune: boolean): void;
}

const DISABLED: Cache = {
  replay: () => null,
  record: () => {},
  write: () => {},
};

function digest(parts: Iterable<string>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * Everything that decides what the rules do, in one comparison: the config,
 * every file `ignoreFiles` names, every file under the espalier root, and the
 * addons module if there is one.
 * Telling them apart would mean walking the module graph, and rule modules are
 * ordinary ES modules that may import each other and anything else.
 *
 * `listEntries` skips dotfiles and configured `skip` patterns, so the cache is
 * never part of its own key and authoring files do not invalidate a run.
 */
function version(config: Config): string {
  const root = path.join(config.root, config.espalierRoot);
  const parts: string[] = [String(FORMAT), readFileSync(config.configPath, "utf8")];
  // `ignoreFiles` decides what is governed just as much as `ignore` does, and
  // it lives outside the config, so its contents belong in the key.
  //
  // `readIfPresent` rather than a plain read, though nothing can currently
  // reach the absent case: a named entry that is not there fails the run with
  // `ignore_file_missing` long before this. Kept because the alternative is a
  // throw on a path whose whole job is not to have one, and annotated so the
  // next reader does not go looking for the run that exercises it.
  for (const entry of config.ignoreFiles) {
    parts.push(entry, readIfPresent(path.join(config.root, entry)));
  }
  // The exclusion list decides what is governed, so it decides what the rules
  // are handed. Its comments are in here too, which costs nothing and means a
  // reworded reason reaches the next `build` rather than the one after.
  parts.push(...config.ignore);
  for (const entry of listEntries(root, compileIgnore(config.skip, "skip"))) {
    parts.push(entry, readFileSync(path.join(root, entry), "utf8"));
  }
  if (config.addons !== null) {
    parts.push(config.addons, readFileSync(path.resolve(config.root, config.addons), "utf8"));
  }
  return digest(parts);
}

function readIfPresent(at: string): string {
  try {
    return readFileSync(at, "utf8");
  } catch {
    return "";
  }
}

function key(rule: string, pattern: string, target: string): string {
  return JSON.stringify([rule, pattern, target]);
}

/**
 * Opens the cache for one espalier. `globOf` answers what a glob returns now,
 * so a listing dependency can be checked without the cache knowing anything
 * about how paths are matched.
 */
export function open(
  config: Config,
  enabled: boolean,
  globOf: (pattern: string) => string,
  implementations: ImplementationObserver,
): Cache {
  if (!enabled) return DISABLED;

  let stamp: string;
  try {
    stamp = version(config);
  } catch {
    // Something under the espalier could not be read, so there is nothing
    // dependable to key against. Unreachable in practice: compilation read the
    // same tree first and would have failed the run. Running without a cache is
    // the right answer if that ever stops being true.
    return DISABLED;
  }

  const at = path.join(config.root, config.espalierRoot, DIRECTORY, FILENAME);
  const loaded = new Map<string, Entry>();
  let acceptedImplementation: ImplementationHeader | null = null;

  const stampAbsolute = (target: string): string => {
    try {
      const found = statSync(target);
      return `${found.size}:${Math.trunc(found.mtimeMs)}`;
    } catch {
      return "-";
    }
  };

  const currentImplementation = implementations.snapshot();

  const validImplementation = (value: unknown): value is ImplementationHeader => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const found = value as Record<string, unknown>;
    if (
      found["node"] !== currentImplementation.node ||
      !Array.isArray(found["conditions"]) ||
      found["conditions"].some((entry) => typeof entry !== "string") ||
      found["files"] === null ||
      typeof found["files"] !== "object" ||
      Array.isArray(found["files"]) ||
      found["edges"] === null ||
      typeof found["edges"] !== "object" ||
      Array.isArray(found["edges"]) ||
      found["globs"] === null ||
      typeof found["globs"] !== "object" ||
      Array.isArray(found["globs"])
    ) {
      return false;
    }

    const header = value as ImplementationHeader;
    if (!currentImplementation.trustworthy) return false;
    if (!currentImplementation.conditions.every((condition) => header.conditions.includes(condition))) {
      return false;
    }
    for (const [filename, was] of Object.entries(header.files)) {
      if (typeof was !== "string" || stampAbsolute(filename) !== was) return false;
    }
    if (Object.values(header.edges).some((resolved) => typeof resolved !== "string")) return false;
    for (const [pattern, was] of Object.entries(header.globs)) {
      const members = implementationMatches(config.root, pattern);
      if (
        members === null ||
        typeof was !== "string" ||
        listing(members) !== was
      ) {
        return false;
      }
    }
    for (const filename of currentImplementation.files) {
      if (!(filename in header.files)) return false;
    }
    for (const [request, resolved] of currentImplementation.edges) {
      if (header.edges[request] !== resolved) return false;
    }
    for (const [pattern, members] of currentImplementation.globs) {
      if (header.globs[pattern] !== listing(members)) return false;
    }
    return true;
  };

  try {
    const lines = readFileSync(at, "utf8").split("\n").filter((line) => line !== "");
    const header = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
    // A header from another espalier, another format, or another tool
    // describes something that is not this run. Discard the lot.
    if (
      header["kind"] === "cache" &&
      header["version"] === FORMAT &&
      header["espalier"] === stamp &&
      validImplementation(header["implementation"])
    ) {
      acceptedImplementation = header["implementation"];
      for (const line of lines.slice(1)) {
        const entry = JSON.parse(line) as Entry;
        loaded.set(key(entry.rule, entry.pattern, entry.path), entry);
      }
    }
  } catch {
    loaded.clear();
  }

  const current = new Map<string, Entry>();

  const stampOf = (target: string): string => stampAbsolute(path.join(config.root, target));

  const implementationHeader = (snapshot: ImplementationSnapshot): ImplementationHeader => {
    const previous = acceptedImplementation;
    const filenames = new Set(previous === null ? [] : Object.keys(previous.files));
    for (const filename of snapshot.files) filenames.add(filename);

    const edges = new Map(previous === null ? [] : Object.entries(previous.edges));
    for (const edge of snapshot.edges) edges.set(...edge);

    const globs = new Map(previous === null ? [] : Object.entries(previous.globs));
    for (const [pattern, members] of snapshot.globs) globs.set(pattern, listing(members));

    return {
      node: snapshot.node,
      conditions: [...new Set([...(previous?.conditions ?? []), ...snapshot.conditions])].sort(),
      files: Object.fromEntries([...filenames].sort().map((filename) => [filename, stampAbsolute(filename)])),
      edges: Object.fromEntries([...edges].sort(([left], [right]) => left.localeCompare(right))),
      globs: Object.fromEntries([...globs].sort(([left], [right]) => left.localeCompare(right))),
    };
  };

  return {
    replay(rule, pattern, target, membership) {
      const id = key(rule, pattern, target);
      const found = loaded.get(id);
      if (found === undefined) return null;
      if (found.membership !== membership) return null;

      for (const [read, was] of Object.entries(found.reads)) {
        if (stampOf(read) !== was) return null;
      }
      for (const [glob, was] of Object.entries(found.globs)) {
        if (globOf(glob) !== was) return null;
      }

      // A replayed entry is one this run still stands behind, so it survives a
      // pruning write.
      current.set(id, found);
      return found.issues;
    },

    record(rule, pattern, target, deps, issues, targetIsInput = true) {
      // The file being linted is a dependency whether or not the rule read it:
      // its contents are what the rule was asked about.
      const reads: Record<string, string> = targetIsInput ? { [target]: stampOf(target) } : {};
      for (const read of deps.reads) reads[read] = stampOf(read);

      current.set(key(rule, pattern, target), {
        rule,
        pattern,
        path: target,
        reads,
        globs: Object.fromEntries(deps.globs),
        ...(deps.membership === undefined ? {} : { membership: deps.membership }),
        issues,
      });
    },

    write(prune) {
      const implementation = implementations.snapshot();
      if (!implementation.trustworthy) return;
      const keep = prune ? current : new Map([...loaded, ...current]);
      const lines = [
        JSON.stringify({
          kind: "cache",
          version: FORMAT,
          espalier: stamp,
          implementation: implementationHeader(implementation),
        }),
      ];
      for (const entry of keep.values()) lines.push(JSON.stringify(entry));

      const directory = path.join(config.root, config.espalierRoot, DIRECTORY);
      const temporary = path.join(directory, `${FILENAME}.${process.pid}`);
      try {
        mkdirSync(directory, { recursive: true });
        writeFileSync(temporary, `${lines.join("\n")}\n`);
        // Two runs at once end in last-writer-wins, which costs nothing: every
        // entry is re-derivable, and a rename is never half-applied.
        renameSync(temporary, at);
      } catch {
        // Read-only checkout, no permission, no disk. Not this run's problem.
      }
    },
  };
}

/** A digest of a sorted list of paths, for comparing a glob with itself. */
export function listing(paths: string[]): string {
  return digest(paths);
}
