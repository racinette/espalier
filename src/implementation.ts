// Rule implementation dependency observation. docs/cli/lint/README.MD
// "Implementation dependencies".

import { globSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCKFILES = [
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

type ResolveContext = Parameters<NonNullable<Parameters<typeof registerHooks>[0]["resolve"]>>[1];

export interface ImplementationSnapshot {
  trustworthy: boolean;
  node: string;
  conditions: string[];
  /** Absolute filesystem paths, including absent resolution metadata candidates. */
  files: Set<string>;
  /** A stable description of resolutions actually made by rule and addon code. */
  edges: Map<string, string>;
  /** Repository-relative explicit patterns to their current absolute matches. */
  globs: Map<string, string[]>;
}

export interface ImplementationObserver {
  declare(patterns: Iterable<string>): void;
  snapshot(): ImplementationSnapshot;
  close(): void;
}

interface Session {
  token: string;
  root: string;
  ruleRoot: string;
  addon: string | null;
  tracked: Set<string>;
  files: Set<string>;
  edges: Map<string, string>;
  conditions: Set<string>;
  declarations: Set<string>;
  trustworthy: boolean;
}

const sessions = new Set<Session>();
const graph = new Map<string, Set<string>>();
let registration: ReturnType<typeof registerHooks> | null = null;
let nextToken = 1;

function canonical(url: string | undefined): string | null {
  if (url === undefined) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      parsed.search = "";
      parsed.hash = "";
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function fileOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:" ? path.resolve(fileURLToPath(parsed)) : null;
  } catch {
    return null;
  }
}

function inheritedToken(url: string | undefined): string | null {
  if (url === undefined) return null;
  try {
    return new URL(url).searchParams.get("__espalier_run");
  } catch {
    return null;
  }
}

function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function addPackageMetadata(session: Session, filename: string): void {
  let at = path.dirname(filename);
  for (;;) {
    session.files.add(path.join(at, "package.json"));
    const up = path.dirname(at);
    if (up === at) break;
    at = up;
  }
}

function addBareResolutionCandidates(session: Session, parent: string | null, specifier: string): void {
  if (
    parent === null ||
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("#") ||
    /^[A-Za-z][A-Za-z+.-]*:/.test(specifier)
  ) {
    return;
  }
  const from = fileOf(parent);
  if (from === null) return;
  const segments = specifier.split("/");
  const packageName = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]!;
  let at = path.dirname(from);
  for (;;) {
    session.files.add(path.join(at, "node_modules", packageName, "package.json"));
    const up = path.dirname(at);
    if (up === at) break;
    at = up;
  }
}

function track(session: Session, url: string): void {
  if (session.tracked.has(url)) return;
  session.tracked.add(url);

  const filename = fileOf(url);
  if (filename !== null) {
    session.files.add(filename);
    addPackageMetadata(session, filename);
  } else {
    const protocol = new URL(url).protocol;
    // Builtins are supplied by the runtime (whose exact version is in the
    // manifest), and data URLs carry their immutable source in their identity.
    if (protocol !== "node:" && protocol !== "data:") session.trustworthy = false;
  }

  for (const child of graph.get(url) ?? []) track(session, child);
}

function isSeed(session: Session, url: string): boolean {
  const filename = fileOf(url);
  if (filename === null) return false;
  return inside(session.ruleRoot, filename) || filename === session.addon;
}

function edgeKey(parent: string | null, specifier: string, context: ResolveContext): string {
  return JSON.stringify([
    parent,
    specifier,
    [...context.conditions].sort(),
    Object.entries(context.importAttributes ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  ]);
}

function install(): void {
  if (registration !== null) return;
  registration = registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      const parent = canonical(context.parentURL);
      const child = canonical(result.url);
      if (child === null) {
        for (const session of sessions) {
          if (parent !== null && session.tracked.has(parent)) session.trustworthy = false;
        }
        return result;
      }

      if (parent !== null) {
        let children = graph.get(parent);
        if (children === undefined) {
          children = new Set();
          graph.set(parent, children);
        }
        children.add(child);
      }

      const relevant: Session[] = [];
      for (const session of sessions) {
        if (!isSeed(session, child) && (parent === null || !session.tracked.has(parent))) continue;
        relevant.push(session);
        for (const condition of context.conditions) session.conditions.add(condition);
        session.edges.set(edgeKey(parent, specifier, context), child);
        addBareResolutionCandidates(session, parent, specifier);
        track(session, child);
      }
      if (relevant.length === 0 || fileOf(child) === null) return result;

      // `check()` may be called repeatedly in one process. Node would otherwise
      // return the old module instance after the disk cache correctly decided
      // to execute again. One stable token per session preserves singleton
      // identity within a run while giving the next run a fresh implementation.
      const loaded = new URL(result.url);
      loaded.searchParams.set(
        "__espalier_run",
        inheritedToken(context.parentURL) ?? relevant[0]!.token,
      );
      return { ...result, url: loaded.href };
    },
  });
}

function matches(root: string, pattern: string): string[] | null {
  try {
    return globSync(pattern, { cwd: root })
      .map((entry) => path.resolve(root, entry))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return null;
  }
}

/**
 * Starts one Espalier's observation window. Hooks are process-global, while
 * sessions keep nested/programmatic runs attributed to their own cache.
 */
export function observeImplementations(
  root: string,
  espalierRoot: string,
  addon: string | null,
): ImplementationObserver {
  install();
  const absoluteRoot = path.resolve(root);
  const session: Session = {
    token: String(nextToken++),
    root: absoluteRoot,
    ruleRoot: path.resolve(root, espalierRoot),
    addon: addon === null ? null : path.resolve(root, addon),
    tracked: new Set(),
    files: new Set(),
    edges: new Map(),
    conditions: new Set(),
    declarations: new Set(),
    trustworthy: true,
  };

  session.files.add(path.join(absoluteRoot, "package.json"));
  for (const lockfile of LOCKFILES) session.files.add(path.join(absoluteRoot, lockfile));
  sessions.add(session);

  return {
    declare(patterns) {
      for (const pattern of patterns) session.declarations.add(pattern);
    },
    snapshot() {
      const globs = new Map<string, string[]>();
      for (const pattern of session.declarations) {
        const found = matches(session.root, pattern);
        if (found === null) {
          session.trustworthy = false;
          continue;
        }
        globs.set(pattern, found);
        for (const filename of found) session.files.add(filename);
      }
      return {
        trustworthy: session.trustworthy,
        node: process.versions.node,
        conditions: [...session.conditions].sort(),
        files: new Set(session.files),
        edges: new Map(session.edges),
        globs,
      };
    },
    close() {
      sessions.delete(session);
    },
  };
}

/** Current matches for a previously declared implementation pattern. */
export function implementationMatches(root: string, pattern: string): string[] | null {
  return matches(root, pattern);
}
