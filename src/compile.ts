// Reading the espalier tree into a matcher. docs/MATCHING.MD "Node kinds",
// "Classification", "Ambiguity is rejected".

import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import type { Config } from "./config.js";
import { fail } from "./errors.js";
import { inspect, readEntries } from "./files.js";
import { compileIgnore, ignores, type IgnoreRule } from "./ignore.js";
import {
  isTemplateDefinition,
  templateDefinitionProblem,
  type TemplateDefinition,
} from "./template.js";
import {
  matchSegment,
  optionalCaptureNames,
  resolveSegment,
  ambiguousSplit,
  backrefNames,
  captureNames,
  commonName,
  intersectSegments,
  isStrictSubset,
  parseSegment,
  parseStructuralLeaf,
  trieKey,
  type CaptureValue,
  type Segment,
} from "./pattern.js";

export const NODE_DESCRIPTION = "ESPALIER.mjs";
export const LEGACY_NODE_DESCRIPTION = "ESPALIER.MD";

export interface RuleModule {
  description?: unknown;
  guidance?: unknown;
  /** The old name of `guidance`, rejected with a pointer rather than ignored. */
  rule?: unknown;
  lint?: unknown;
  referenceImplementation?: unknown;
  optional?: unknown;
  minMatches?: unknown;
  instanceOf?: unknown;
  aggregate?: unknown;
  targets?: unknown;
  template?: unknown;
  groups?: unknown;
  literalName?: unknown;
  abstract?: unknown;
  locked?: unknown;
  frozen?: unknown;
  sealed?: unknown;
}

/** Brackets or braces, which a path segment otherwise reads as placeholders. */
export const PLACEHOLDER_SYNTAX = /[\[\]{}]/;

/**
 * One named grouping of a dynamic rule's files, by a subset of its captures.
 * docs/TYPES.MD "groups". The lint function stays on the module; workers
 * import the module and call `groups[name].lint`.
 */
export interface Grouping {
  name: string;
  /** Captures whose values identify a group; the rest vary within it. */
  by: string[];
  /** What one group is, for headings; null when the grouping does not say. */
  description: string | null;
  /** Empty when the grouping states no guidance. */
  guidance: string;
  /** Every group must be a declared instance; an undeclared one is reported. docs/INSTANCES.MD. */
  abstract: boolean;
  /** No group joins or leaves the grouping. docs/LOCKS.MD "Sealed collections". */
  sealed: boolean;
  /** Groups declared beside the rule, each with its own guidance, sorted by declaration. */
  instances: GroupInstance[];
  /**
   * In a rule restating an inherited one, the inherited grouping of the same
   * name this one adds to; null until materialization finds it. It only
   * tightens. docs/INSTANCES.MD "Adding to an inherited grouping".
   */
  extends?: Grouping | null;
}

/**
 * One group declared by a module at the rule's name with the grouping's
 * captures written as values: `0001[ord=00]_users.sql.mjs` is the `0001`,
 * `users` group of `[num=0000][ord=00]_[group=a+].sql.mjs`. It owns no file;
 * its members stay the rule's. docs/INSTANCES.MD "Declaring a group".
 */
export interface GroupInstance {
  modulePath: string;
  /** The declaration as authored, e.g. `migrations/0001[ord=00]_users.sql`. */
  pattern: string;
  /** The values it binds, one per capture of the grouping's `by`. */
  captures: Record<string, string>;
  /**
   * The one concrete directory it speaks for, when a named instance declares
   * a group of a grouping it inherits; null beside the grouping's own rule,
   * where it speaks for every directory the rule reaches.
   */
  directory: string | null;
  /** Its name as a generated document shows it, parsed: the captures it binds are text. */
  segment: Segment;
  module: LoadedModule;
}

export interface LoadedModule {
  description: string | null;
  descriptionRenderer?: (context: RuleGuidanceContext) => unknown;
  guidance: string;
  guidanceRenderer?: (context: RuleGuidanceContext) => unknown;
  /** Absent when the module has nothing to check; guidance alone is a rule. */
  lint?: (context: unknown) => unknown;
  /** Every match must be a declared instance; an anonymous one is reported. docs/INSTANCES.MD. */
  abstract: boolean;
  referenceImplementation: string | null;
  /** Named absence policy; on collections, derived from the minimum for rendering. */
  optional: boolean;
  minMatches?: number;
  instanceOf?: string;
  /** docs/TYPES.MD "aggregate". Always false for structural rules. */
  aggregate: boolean;
  targets: string[] | null;
  /** A file-creation template, available only on structural rules. */
  template: TemplateDefinition | null;
  /** Named groupings, available only on dynamic structural rules. */
  groups: Grouping[];
  /** The module's own `locked` export, when it has one. docs/LOCKS.MD. */
  lockExport?: boolean;
  /** Whether the module is locked, its own export or its directory's. */
  locked: boolean;
  /** The module whose `locked` export decided it; null when nothing did. */
  lockedBy: string | null;
  /** The module's own `frozen` export: its files keep their content. docs/LOCKS.MD "Frozen files". */
  frozenExport?: boolean;
  /** No file joins or leaves the module's files. docs/LOCKS.MD "Sealed collections". */
  sealed?: true;
}

/** A module's lock and the module that set it. docs/LOCKS.MD "Which lock applies". */
export interface Lock {
  locked: boolean;
  /** Espalier-relative path of the module whose export decided it; null for the unlocked default. */
  by: string | null;
}

/** The lock of an espalier directory: its own module's export, else the nearest enclosing one's. */
export function directoryLock(nodes: ReadonlyMap<string, NodeDoc>, at: string): Lock {
  for (let directory = at; ; directory = directory.includes("/") ? directory.slice(0, directory.lastIndexOf("/")) : "") {
    const lock = nodes.get(directory)?.lockExport;
    if (lock !== undefined) return { locked: lock, by: directory === "" ? NODE_DESCRIPTION : `${directory}/${NODE_DESCRIPTION}` };
    if (directory === "") return { locked: false, by: null };
  }
}

/**
 * The espalier directories that speak for the files of one, most specific
 * first: itself, then, where it or a directory above it is a declared
 * instance, the same place under the contract. Freezing and sealing protect
 * files, and declaring a member adds guidance without taking it out of its
 * contract's collection. Locks protect modules, so they do not follow this.
 * docs/LOCKS.MD "Frozen files".
 */
export function contractDirectories(nodes: ReadonlyMap<string, NodeDoc>, at: string): string[] {
  const parts = at.split("/").filter(Boolean);
  for (let depth = parts.length; depth > 0; depth -= 1) {
    const instance = parts.slice(0, depth).join("/");
    const reference = nodes.get(instance)?.instanceOf;
    if (reference === undefined) continue;
    const contract = path.posix.normalize(path.posix.join(instance, reference));
    return [at, ...contractDirectories(nodes, [contract, ...parts.slice(depth)].join("/"))];
  }
  return [at];
}

/**
 * The nearest directory module's statement about files beneath an espalier
 * directory, and which module made it: at each level the directory itself,
 * then its contract equivalents, then the level above.
 */
function nearestStatement(nodes: ReadonlyMap<string, NodeDoc>, at: string, statement: (doc: NodeDoc) => boolean | undefined): Lock {
  for (let directory = at; ; directory = directory.includes("/") ? directory.slice(0, directory.lastIndexOf("/")) : "") {
    for (const speaker of contractDirectories(nodes, directory)) {
      const doc = nodes.get(speaker);
      const said = doc === undefined ? undefined : statement(doc);
      if (said !== undefined) return { locked: said, by: speaker === "" ? NODE_DESCRIPTION : `${speaker}/${NODE_DESCRIPTION}` };
    }
    if (directory === "") return { locked: false, by: null };
  }
}

/** Whether files beneath an espalier directory are frozen, and which directory module said so. */
export function directoryFrozen(nodes: ReadonlyMap<string, NodeDoc>, at: string): Lock {
  return nearestStatement(nodes, at, (doc) => doc.frozenExport);
}

/**
 * Whether an espalier directory lies in a sealed directory, so no file joins
 * or leaves it, and which directory module sealed it: the nearest `sealed`
 * statement, since `sealed = false` takes a subtree out of the seals above.
 * docs/LOCKS.MD "Sealed collections".
 */
export function directorySealed(nodes: ReadonlyMap<string, NodeDoc>, at: string): Lock {
  return nearestStatement(nodes, at, (doc) => doc.sealed);
}

/** The lock of a module file: its own export, else its directory's. */
export function moduleLock(nodes: ReadonlyMap<string, NodeDoc>, modulePath: string, own: boolean | undefined): Lock {
  if (own !== undefined) return { locked: own, by: modulePath };
  const cut = modulePath.lastIndexOf("/");
  return directoryLock(nodes, cut === -1 ? "" : modulePath.slice(0, cut));
}

/**
 * The module kind determines requiredness defaults and valid exports. A
 * `group` module is a dynamic name with `instanceOf`: a declared group.
 */
type ModuleKind = "constraint" | "static" | "dynamic" | "group";

/**
 * What a rule reports as its `pattern`: the declaration exactly as authored,
 * relative to the rule-tree root. Placeholder names, masks and
 * back-references survive, where a glob would have lost them. The matched
 * `path` and the `captures` carry everything the declaration leaves open.
 */
export function declaration(modulePath: string): string {
  return modulePath.slice(0, -".mjs".length);
}

export interface StructuralRule {
  /** Espalier-relative module path, e.g. `clients/[provider]/client.ts.mjs`. */
  modulePath: string;
  /** The declaration as authored, e.g. `clients/[provider]/client.ts`: the module path without `.mjs`. */
  pattern: string;
  module: LoadedModule;
  segments?: Segment[];
  inherited?: StructuralRule[];
  templateRule?: StructuralRule;
}

export interface TrieNode {
  /** Authored form of this segment: `clients`, `[provider]`, `client.ts`. */
  display: string;
  segment: Segment;
  captures: string[];
  children: Map<string, TrieNode>;
  /** Set when this node is a file leaf. */
  rule: StructuralRule | null;
  directory?: boolean;
  baseSegment?: Segment;
  instanceOf?: string;
  optional?: boolean;
  /** A dynamic directory whose every match must be a declared instance. */
  abstract?: boolean;
}

export interface Constraint {
  modulePath: string;
  /** The rule name before any extension selector, e.g. `no-as-any`. */
  name: string;
  /** Directory segments, containing exactly one recursive placeholder. */
  directory: Segment[];
  /** Filename extension selector; null when the module selects with `targets`. */
  extension: string | null;
  /** The declaration as authored, e.g. `src/[...path]/no-as-any.{ts,tsx}`: the module path without `.mjs`. */
  pattern: string;
  module: LoadedModule;
}

/** Directory metadata and rendered prose, independently of file rules. */
export interface NodeDoc {
  /** Fold this directory and its descendants into an enclosing document. */
  fold: boolean;
  /** The one line that appears in the project map. */
  description: string | null;
  renderDescription?: (context: DirectoryGuidanceContext) => unknown;
  /** The rendered Markdown guidance. */
  body: string;
  render?: (context: DirectoryGuidanceContext) => unknown;
  source?: string;
  instanceOf?: string;
  optional?: boolean;
  /** The directory's name is literal, placeholder syntax and all. */
  literalName?: boolean;
  /** Every directory this pattern matches must be a declared instance. */
  abstract?: boolean;
  /** The directory module's own `locked` export. docs/LOCKS.MD. */
  lockExport?: boolean;
  /** The directory module's own `frozen` export: files beneath keep their content. */
  frozenExport?: boolean;
  /**
   * The directory module's own `sealed` export: true seals every file beneath,
   * false takes this subtree out of the seals above. docs/LOCKS.MD "Sealed collections".
   */
  sealed?: boolean;
}

/**
 * One module as the lock check sees it: what it says about locks, and what it
 * belongs to. docs/LOCKS.MD "Enforcing locks".
 */
export interface ModuleRecord {
  /** Espalier-relative path, e.g. `clients/[provider].ts.mjs` or `app/ESPALIER.mjs`. */
  path: string;
  /** Its own `locked` export, if any. */
  lockExport?: boolean;
  locked: boolean;
  lockedBy: string | null;
  /** The module path of the contract it declares an instance or group of. */
  contract?: string;
  /** Every match must be declared: its member list is part of what it declares. */
  abstract: boolean;
  /** Groupings whose declared groups are part of what it declares. */
  abstractGroupings: string[];
}

export interface Espalier {
  root: TrieNode;
  constraints: Constraint[];
  /** Every module read, by espalier-relative path. */
  modules: Map<string, ModuleRecord>;
  /**
   * Espalier-relative directory path to its directory metadata, with `""` for the
   * root. Kept beside the trie rather than on it: a directory may have prose
   * and no rules, and giving it a trie node would change what `lint` reports as
   * declared at its parent.
   */
  nodes: Map<string, NodeDoc>;
}

function emptyNode(display: string, segment: Segment): TrieNode {
  return { display, segment, captures: captureNames(segment), children: new Map(), rule: null };
}

export function listEntries(absolute: string, skip: IgnoreRule[] = []): string[] {
  return collectEntries(absolute, "", skip);
}

function collectEntries(
  absolute: string,
  prefix: string,
  skip: IgnoreRule[],
  ancestors?: Set<string>,
): string[] {
  const found: string[] = [];
  // The espalier tree follows links for the same reason the repository does —
  // docs/CONFIG.MD "Symlinks" — which is what lets two espaliers share a rule
  // module by linking it rather than copying it. Nothing here is subject to
  // `ignore`, so a link that will not resolve has no way to be excused: it is a
  // rule the run cannot read, and the run stops.
  const seen = ancestors ?? new Set<string>([identify(absolute)]);

  for (const entry of readEntries(absolute, prefix).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const at = path.join(absolute, entry.name);
    // This directory is reserved for tool bookkeeping, not authored rules.
    if (relative === ".cache") continue;
    if (entry.isDirectory() && ignores(skip, relative, true)) continue;
    // Resolve no excluded link, including a broken one. File-shaped grammar
    // exclusions still fail; a directory-only exclusion is a subtree boundary.
    if (entry.isSymbolicLink() && ignores(skip, relative, true)) {
      if (ignores(skip, relative) &&
          ((entry.name === NODE_DESCRIPTION || entry.name === LEGACY_NODE_DESCRIPTION) || entry.name.endsWith(".mjs"))) {
        fail("skip_hides_grammar", `${relative}: skip hides a rule module or ${NODE_DESCRIPTION}`, { path: relative });
      }
      continue;
    }
    const resolved = inspect(entry, at, relative);

    if (resolved.kind === "directory") {
      if (ignores(skip, relative, true)) continue;
      // A link onto an ancestor, which is the only arrangement that would not
      // terminate. Two links onto one directory are two rule paths, and an
      // espalier declaring the same rule twice is caught where every other
      // duplicate is — `duplicate_structural_rule`, with both paths named.
      if (seen.has(resolved.id!)) continue;
      seen.add(resolved.id!);
      found.push(...collectEntries(at, relative, skip, seen));
      seen.delete(resolved.id!);
    } else if (resolved.kind === "file") {
      if (ignores(skip, relative)) {
        // Excluded directories were pruned above. Grammar encountered in an
        // inspected directory cannot be individually hidden by a file pattern.
        if ((entry.name === NODE_DESCRIPTION || entry.name === LEGACY_NODE_DESCRIPTION) || entry.name.endsWith(".mjs")) {
          fail(
            "skip_hides_grammar",
            `${relative}: skip hides a rule module or ${NODE_DESCRIPTION}`,
            { path: relative },
          );
        }
        continue;
      }
      found.push(relative);
    }
  }

  return found;
}

/** The identity of a directory already known to open — the tree root. */
function identify(absolute: string): string {
  const stats = statSync(absolute);
  return `${stats.dev}:${stats.ino}`;
}

/** Recover V8's parse location without evaluating the failed module again.
 * docs/ERRORS.MD "Rule-module parse locations".
 */
function syntaxLocation(absolute: string, cause: unknown): { line: number; column?: number } | null {
  if (!(cause instanceof SyntaxError)) return null;
  try {
    const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], {
      input: readFileSync(absolute, "utf8"),
      encoding: "utf8",
      timeout: 3000,
      maxBuffer: 1024 * 1024,
      // Check only syntax: do not inherit preloads, loaders, or output caches.
      env: {
        ...process.env,
        NODE_OPTIONS: "",
        NODE_V8_COVERAGE: undefined,
        NODE_COMPILE_CACHE: undefined,
        NODE_DISABLE_COMPILE_CACHE: "1",
      },
    });
    if (checked.error || checked.status !== 1) return null;
    const lines = checked.stderr.split(/\r?\n/);
    const at = lines.findIndex((line) => /^\[stdin\]:\d+$/.test(line));
    if (at === -1) return null;
    const line = Number(lines[at]!.slice("[stdin]:".length));
    if (!Number.isSafeInteger(line) || line < 1) return null;
    const caret = /^([ \t]*)\^/.exec(lines[at + 2] ?? "");
    return { line, ...(caret === null ? {} : { column: caret[1]!.length + 1 }) };
  } catch {
    return null;
  }
}

/**
 * Node caches a module by its URL for the life of the process, so a command
 * that edits espalier modules and then compiles again, as `guard` does,
 * imports them under a new generation. Ordinary runs compile once and never
 * advance it.
 */
let generation = 0;

/** Read espalier modules afresh on the next compile. */
export function reimportModules(): void {
  generation += 1;
}

export function moduleUrl(absolute: string): string {
  const href = pathToFileURL(absolute).href;
  return generation === 0 ? href : `${href}?generation=${generation}`;
}

/** Import a rule module, turning a syntax error into a located failure. */
async function importRuleModule(absolute: string, modulePath: string, root: string): Promise<RuleModule> {
  try {
    return (await import(moduleUrl(absolute))) as RuleModule;
  } catch (cause) {
    const location = syntaxLocation(absolute, cause);
    const source = path.relative(root, absolute).split(path.sep).join("/");
    const label = location === null
      ? modulePath
      : `${source}:${location.line}${location.column === undefined ? "" : `:${location.column}`}`;
    fail(
      "module_import_failed",
      `${label} could not be imported: ${(cause as Error).message}`,
      { path: source, ...location },
    );
  }
}

async function loadModule(
  absolute: string,
  modulePath: string,
  kind: ModuleKind,
  root: string,
  imported?: RuleModule,
): Promise<LoadedModule> {
  const structural = kind !== "constraint";
  const loaded = imported ?? await importRuleModule(absolute, modulePath, root);
  const leafName = modulePath.slice(modulePath.lastIndexOf("/") + 1, -".mjs".length);
  if (loaded.literalName !== undefined && typeof loaded.literalName !== "boolean") {
    fail("module_invalid_export", `${modulePath}: \`literalName\` must be a boolean`);
  }
  if (loaded.literalName !== undefined && !structural) {
    fail("module_invalid_export", `${modulePath}: \`literalName\` has no meaning on a constraint; a constraint's filename is a selector, not a path`);
  }
  if (loaded.literalName === true && !PLACEHOLDER_SYNTAX.test(leafName)) {
    fail("module_invalid_export", `${modulePath}: \`literalName\` applies to a name containing placeholder syntax; "${leafName}" has none`);
  }
  if (loaded.abstract !== undefined && typeof loaded.abstract !== "boolean") {
    fail("module_invalid_export", `${modulePath}: \`abstract\` must be a boolean`);
  }
  if (loaded.abstract === true && kind !== "dynamic") {
    fail("module_invalid_export", `${modulePath}: \`abstract\` applies to a dynamic structural rule, whose every match must then be a declared instance`);
  }

  if (loaded.locked !== undefined && typeof loaded.locked !== "boolean") {
    fail("module_invalid_export", `${modulePath}: \`locked\` must be a boolean`);
  }
  if (loaded.frozen !== undefined && typeof loaded.frozen !== "boolean") {
    fail("module_invalid_export", `${modulePath}: \`frozen\` must be a boolean`);
  }
  if (loaded.frozen !== undefined && kind === "constraint") {
    fail("module_invalid_export", `${modulePath}: \`frozen\` has no meaning on a constraint, which owns no files; freeze the rule or directory that owns them`);
  }
  if (loaded.sealed !== undefined && typeof loaded.sealed !== "boolean") {
    fail("module_invalid_export", `${modulePath}: \`sealed\` must be a boolean`);
  }
  if (loaded.sealed !== undefined && kind === "constraint") {
    fail("module_invalid_export", `${modulePath}: \`sealed\` has no meaning on a constraint, which owns no files; seal the rule or directory that owns them`);
  }

  if ("unobservedImplementationDependencies" in loaded) fail("module_invalid_export", `${modulePath}: unobservedImplementationDependencies is not supported`);
  if ("rule" in loaded) {
    fail("module_invalid_export", `${modulePath}: \`rule\` was renamed to \`guidance\`; espalier migrate rewrites it`);
  }
  if (loaded.guidance !== undefined && typeof loaded.guidance !== "string" && typeof loaded.guidance !== "function") {
    fail("module_invalid_export", `${modulePath}: \`guidance\` must be a string or function`);
  }
  if (loaded.lint !== undefined && typeof loaded.lint !== "function") {
    fail("module_invalid_export", `${modulePath}: \`lint\` must be a function`);
  }
  if (loaded.description !== undefined && typeof loaded.description !== "string" && typeof loaded.description !== "function") {
    fail("module_invalid_export", `${modulePath}: \`description\` must be a string or function`);
  }
  if ("example" in loaded) {
    fail(
      "module_invalid_export",
      `${modulePath}: \`example\` was renamed to \`referenceImplementation\``,
    );
  }
  if (
    loaded.referenceImplementation !== undefined &&
    typeof loaded.referenceImplementation !== "string"
  ) {
    fail(
      "module_invalid_export",
      `${modulePath}: \`referenceImplementation\` must be a string`,
    );
  }
  if (loaded.optional !== undefined && typeof loaded.optional !== "boolean") {
    fail("module_invalid_export", `${modulePath}: \`optional\` must be a boolean`);
  }
  if (loaded.optional !== undefined && kind === "constraint") {
    fail(
      "module_invalid_export",
      `${modulePath}: \`optional\` has no meaning on a constraint; constraints never require a file`,
    );
  }
  if (kind === "dynamic" && loaded.optional !== undefined) {
    fail("module_invalid_export", `${modulePath}: use minMatches on dynamic collections; optional applies only to named members`);
  }
  if (loaded.minMatches !== undefined && (kind !== "dynamic" ||
      !Number.isSafeInteger(loaded.minMatches) || (loaded.minMatches as number) < 0)) {
    fail("module_invalid_export", `${modulePath}: minMatches must be a nonnegative safe integer on a dynamic leaf`);
  }
  if (loaded.instanceOf !== undefined && ((kind !== "static" && kind !== "group") ||
      typeof loaded.instanceOf !== "string" || loaded.instanceOf.length === 0)) {
    fail("module_invalid_export", `${modulePath}: instanceOf must name a contract on a static leaf or a group's name`);
  }
  if (kind === "group") {
    for (const key of ["template", "referenceImplementation"] as const) {
      if (loaded[key] !== undefined) {
        fail("module_invalid_export", `${modulePath}: \`${key}\` describes one file, and a declared group is a set of files; it stays on the rule`);
      }
    }
  }
  if (loaded.aggregate !== undefined && typeof loaded.aggregate !== "boolean") {
    fail("module_invalid_export", `${modulePath}: \`aggregate\` must be a boolean`);
  }
  if (
    loaded.targets !== undefined &&
    (!Array.isArray(loaded.targets) ||
      loaded.targets.length === 0 ||
      loaded.targets.some(
        (target) =>
          typeof target !== "string" ||
          target.length === 0 ||
          target.startsWith("!") ||
          target.startsWith("/") ||
          target.split("/").includes("..")
      ))
  ) {
    fail(
      "module_invalid_export",
      `${modulePath}: \`targets\` must be a non-empty array of non-empty relative positive glob strings`
    );
  }
  if (loaded.template !== undefined) {
    const problem = templateDefinitionProblem(loaded.template);
    if (problem !== null) {
      fail("module_invalid_export", `${modulePath}: \`template\` ${problem}`);
    }
    if (!structural) {
      fail(
        "module_invalid_export",
        `${modulePath}: \`template\` has no meaning on a constraint; templates create structurally owned files`,
      );
    }
  }
  if (loaded.aggregate !== undefined && kind !== "constraint") {
    fail(
      "module_invalid_export",
      `${modulePath}: \`aggregate\` has no meaning on a structural rule; structural rules run once per owned file`,
    );
  }
  if (loaded.targets !== undefined && kind !== "constraint") {
    fail(
      "module_invalid_export",
      `${modulePath}: \`targets\` is available only to constraint modules; structural rules define ownership`
    );
  }
  const groups = loaded.groups === undefined ? [] : parseGroups(loaded.groups, modulePath, kind);

  return {
    description: typeof loaded.description === "string" ? loaded.description : null,
    ...(typeof loaded.description === "function"
      ? { descriptionRenderer: loaded.description as (context: RuleGuidanceContext) => unknown } : {}),
    guidance: typeof loaded.guidance === "string" ? loaded.guidance : "",
    ...(typeof loaded.guidance === "function"
      ? { guidanceRenderer: loaded.guidance as (context: RuleGuidanceContext) => unknown } : {}),
    ...(loaded.lint === undefined ? {} : { lint: loaded.lint as (context: unknown) => unknown }),
    abstract: loaded.abstract === true,
    referenceImplementation:
      typeof loaded.referenceImplementation === "string"
        ? loaded.referenceImplementation
        : null,
    optional: kind === "dynamic" ? (loaded.minMatches ?? 0) === 0 : loaded.optional === true,
    minMatches: kind === "dynamic" ? loaded.minMatches as number | undefined : undefined,
    instanceOf: loaded.instanceOf as string | undefined,
    aggregate: loaded.aggregate === true,
    targets:
      loaded.targets === undefined
        ? null
        : [...new Set(loaded.targets as string[])].sort((left, right) => left.localeCompare(right)),
    template: isTemplateDefinition(loaded.template) ? loaded.template : null,
    groups,
    ...(loaded.locked === undefined ? {} : { lockExport: loaded.locked as boolean }),
    ...(loaded.frozen === undefined ? {} : { frozenExport: loaded.frozen as boolean }),
    ...(loaded.sealed === true ? { sealed: true as const } : {}),
    // Resolved once every directory module is read. docs/LOCKS.MD.
    locked: false,
    lockedBy: null,
  };
}

const GROUP_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * The shape of `groups`, without reference to the rule's path: which captures
 * exist is checked where the path is parsed, so a wrong name is reported
 * beside the names that do exist.
 */
function parseGroups(raw: unknown, modulePath: string, kind: ModuleKind): Grouping[] {
  const bad = (reason: string): never => fail("module_invalid_export", `${modulePath}: \`groups\` ${reason}`);
  if (kind !== "dynamic") bad("has meaning only on a dynamic structural rule, whose captures identify the groups");
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) bad("must be an object naming each grouping");
  const groups: Grouping[] = [];
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!GROUP_NAME.test(name)) bad(`names a grouping "${name}", which is not an identifier`);
    if (value === null || typeof value !== "object" || Array.isArray(value)) bad(`.${name} must be an object with by`);
    const grouping = value as Record<string, unknown>;
    const by = grouping["by"];
    // Without `by`, it adds to the inherited grouping of that name; materialization finds it.
    const extending = by === undefined;
    if (!extending && (!Array.isArray(by) || by.some((entry) => typeof entry !== "string") || new Set(by).size !== by.length)) {
      bad(`.${name}.by must be an array of distinct capture names`);
    }
    if (extending && grouping["description"] !== undefined) {
      bad(`.${name} has no \`by\`, so it adds to the inherited grouping of that name, whose description it cannot replace`);
    }
    if (extending && (grouping["abstract"] === false || grouping["sealed"] === false)) {
      bad(`.${name} adds to an inherited grouping, and may only tighten it: set abstract or sealed to true, or leave it out`);
    }
    if (grouping["description"] !== undefined && (typeof grouping["description"] !== "string" || grouping["description"].trim() === "")) {
      bad(`.${name}.description must be a non-empty string`);
    }
    if ("rule" in grouping) bad(`.${name}.rule was renamed to guidance; espalier migrate rewrites it`);
    if (grouping["guidance"] !== undefined && typeof grouping["guidance"] !== "string") bad(`.${name}.guidance must be a string`);
    if (grouping["lint"] !== undefined && typeof grouping["lint"] !== "function") bad(`.${name}.lint must be a function`);
    if (grouping["abstract"] !== undefined && typeof grouping["abstract"] !== "boolean") bad(`.${name}.abstract must be a boolean`);
    if (grouping["sealed"] !== undefined && typeof grouping["sealed"] !== "boolean") bad(`.${name}.sealed must be a boolean`);
    if ("frozen" in grouping) {
      bad(`.${name}.frozen: a grouping holds every file of its rule, so freezing it would freeze the rule; freeze the rule, or one declared group`);
    }
    if (!extending && grouping["abstract"] === true && (by as string[]).length === 0) {
      bad(`.${name} groups by no captures, so its one group per directory has no name to declare it by; it cannot be abstract`);
    }
    const key = JSON.stringify([...((by ?? []) as string[])].sort());
    const twin = extending ? undefined : groups.find((other) => other.extends !== null && JSON.stringify([...other.by].sort()) === key);
    if (twin !== undefined) bad(`.${name} and .${twin.name} group by the same captures; one grouping can carry both rules`);
    groups.push({
      name, by: extending ? [] : by as string[], description: typeof grouping["description"] === "string" ? grouping["description"].trim() : null,
      guidance: typeof grouping["guidance"] === "string" ? grouping["guidance"] : "",
      abstract: grouping["abstract"] === true, sealed: grouping["sealed"] === true, instances: [],
      ...(extending ? { extends: null } : {}),
    });
  }
  return groups;
}

/**
 * Reads an `ESPALIER.MD`. YAML frontmatter carries `description` and `fold`;
 * the markdown body is the long form. All three fields are optional.
 */
export function readLegacyNodeDoc(absolute: string, modulePath: string): NodeDoc {
  const text = readFileSync(absolute, "utf8");
  const framed = /^---[^\S\n]*\r?\n(?:([\s\S]*?)\r?\n)?---[^\S\n]*(?:\r?\n|$)/.exec(text);

  if (framed === null) return { description: null, body: text.trim(), fold: false };

  let front: unknown;
  try {
    front = parseYaml(framed[1] ?? "");
  } catch (cause) {
    fail("malformed_node_description", `${modulePath}: frontmatter is not valid YAML: ${(cause as Error).message}`);
  }

  let description: string | null = null;
  let fold = false;
  if (front !== null && typeof front === "object" && !Array.isArray(front)) {
    const folded = (front as Record<string, unknown>)["fold"];
    if (folded !== undefined && typeof folded !== "boolean") {
      fail("malformed_node_description", `${modulePath}: \`fold\` must be a boolean`);
    }
    fold = folded === true;
    const value = (front as Record<string, unknown>)["description"];
    if (value !== undefined && typeof value !== "string") {
      fail("malformed_node_description", `${modulePath}: \`description\` must be a string`);
    }
    if (typeof value === "string") description = value;
  }

  return { description, body: text.slice(framed[0].length).trim(), fold };
}

/** The first dot separates the rule name from a possibly compound extension. */
function splitConstraintLeaf(leaf: string, modulePath: string): { name: string; extensions: string[] | null } {
  const dot = leaf.indexOf(".");
  const name = dot === -1 ? leaf : leaf.slice(0, dot);
  if (name === "" || /[\[\]{}]/.test(name)) {
    fail("malformed_constraint_leaf", `${modulePath}: "${leaf}" needs a rule name before its selector`);
  }
  if (dot === -1) return { name, extensions: null };

  const suffix = leaf.slice(dot + 1);
  const braced = /^\{([^{}]*)\}$/.exec(suffix);
  const extensions = braced === null ? [suffix] : braced[1]!.split(",").map((entry) => entry.trim());
  if (
    extensions.some((extension) =>
      extension.split(".").some((part) => part === "" || /[\[\]{},*?/]/.test(part))
    ) || new Set(extensions).size !== extensions.length
  ) {
    fail("malformed_constraint_leaf", `${modulePath}: malformed extension selector in "${leaf}"`);
  }
  return { name, extensions };
}

function insert(root: TrieNode, segments: Segment[], rule: StructuralRule): void {
  let node = root;

  for (const [index, segment] of segments.entries()) {
    const key = trieKey(segment);
    let child = node.children.get(key);

    if (child === undefined) {
      child = emptyNode(segment.source, segment);
      node.children.set(key, child);
    } else if (child.captures.join("|") !== captureNames(segment).join("|")) {
      // A dynamic directory is one node in the trie, so it has one name.
      fail(
        "inconsistent_capture_names",
        `${rule.modulePath}: "${segment.source}" and "${child.display}" describe the same directory under two names`,
        { here: segment.source, there: child.display },
      );
    }

    node = child;

    if (index === segments.length - 1) {
      if (node.rule !== null) {
        fail(
          "duplicate_structural_rule",
          `${rule.modulePath} and ${node.rule.modulePath} both govern the same path`,
        );
      }
      node.rule = rule;
    }
  }
}

/**
 * Overlapping dynamic siblings conflict unless strict containment chooses a
 * winner. Only peers competing for the same role need comparison: two leaves
 * owning files or two directories claiming subtrees. A directory beside a leaf
 * is not a conflict: a directory never owns a file, and match.ts selects the
 * role the segment needs.
 */
function checkSiblings(node: TrieNode, at: string): void {
  const children = [...node.children.values()];

  // Within a tier only. Static names cannot collide with each other, and a
  // static or resolved sibling beside a dynamic one is settled by specificity
  // rather than by guessing. docs/MATCHING.MD "Ambiguity is rejected".
  const tiers = [
    children.filter((child) => child.segment.dynamic),
    children.filter((child) => child.segment.resolved),
  ];

  for (const peers of tiers) {
    for (let i = 0; i < peers.length; i += 1) {
      for (let j = i + 1; j < peers.length; j += 1) {
        const left = peers[i]!;
        const right = peers[j]!;

        const bothLeaves = left.rule !== null && right.rule !== null;
        const bothDirectories = (left.children.size > 0 || left.directory === true) && (right.children.size > 0 || right.directory === true);
        if (!bothLeaves && !bothDirectories) continue;

        if (!intersectSegments(left.segment, right.segment)) continue;
        const narrowerWinner = left.segment.dynamic && right.segment.dynamic
          && (isStrictSubset(left.segment, right.segment) || isStrictSubset(right.segment, left.segment));
        if (!narrowerWinner) {
          const name = commonName(left.segment, right.segment);
          fail(
            "ambiguous_siblings",
            `${at === "" ? "" : `${at}/`}${left.display} and ${at === "" ? "" : `${at}/`}${right.display} can both match one name${name === null ? "" : `, such as "${name}",`} without a strictly narrower winner, so ownership would be undecidable`,
            { left: left.display, right: right.display, ...(name === null ? {} : { name }) },
          );
        }
      }
    }
  }

  for (const child of node.children.values()) {
    checkSiblings(child, at === "" ? child.display : `${at}/${child.display}`);
  }
}

export async function compile(root: string, espalierRoot: string, skip: string[], config: Config): Promise<Espalier> {
  const absolute = path.join(root, espalierRoot);
  const trie = emptyNode("", parseSegment("", "the espalier root"));
  const constraints: Constraint[] = [];
  const nodes = new Map<string, NodeDoc>();
  const skipRules = compileIgnore(skip, "skip");

  const entries = listEntries(absolute, skipRules);
  const isDescription = (leaf: string): boolean => leaf === NODE_DESCRIPTION || leaf === LEGACY_NODE_DESCRIPTION;

  // Directory modules first: a directory that declares `literalName` changes
  // how every rule path through it is read.
  for (const modulePath of entries) {
    const segments = modulePath.split("/");
    const leaf = segments[segments.length - 1]!;
    if (!isDescription(leaf)) continue;
    const at = segments.slice(0, -1).join("/");
    if (nodes.has(at)) fail("malformed_node_description", `${at}: declare only one directory guidance source`);
    const doc = leaf === LEGACY_NODE_DESCRIPTION
      ? readLegacyNodeDoc(path.join(absolute, modulePath), modulePath)
      : await readDirectoryModule(path.join(absolute, modulePath), modulePath);
    nodes.set(at, { ...doc, source: leaf });
  }
  const literalDirectory = (parts: string[], depth: number): boolean => nodes.get(parts.slice(0, depth + 1).join("/"))?.literalName === true;
  const groupDeclarations: GroupDeclaration[] = [];
  const extensions: { modulePath: string; grouping: Grouping }[] = [];
  // Every directory module is read by now, so a module's lock is decidable
  // the moment it loads.
  const modules = new Map<string, ModuleRecord>();
  const settleLock = (module: LoadedModule, modulePath: string): LoadedModule => {
    const lock = moduleLock(nodes, modulePath, module.lockExport);
    module.locked = lock.locked;
    module.lockedBy = lock.by;
    const cut = modulePath.lastIndexOf("/");
    modules.set(modulePath, {
      path: modulePath,
      ...(module.lockExport === undefined ? {} : { lockExport: module.lockExport }),
      locked: lock.locked,
      lockedBy: lock.by,
      ...(module.instanceOf === undefined ? {} : {
        contract: `${modulePath.slice(0, cut + 1)}${module.instanceOf.replace(/^\.\//, "").replace(/\.mjs$/, "")}.mjs`,
      }),
      abstract: module.abstract,
      abstractGroupings: module.groups.filter((grouping) => grouping.abstract).map((grouping) => grouping.name),
    });
    return module;
  };
  for (const [at, doc] of nodes) {
    const modulePath = at === "" ? (doc.source ?? NODE_DESCRIPTION) : `${at}/${doc.source ?? NODE_DESCRIPTION}`;
    const lock = directoryLock(nodes, at);
    modules.set(modulePath, {
      path: modulePath,
      ...(doc.lockExport === undefined ? {} : { lockExport: doc.lockExport }),
      locked: lock.locked,
      lockedBy: lock.by,
      ...(doc.instanceOf === undefined ? {} : {
        contract: `${path.posix.normalize(path.posix.join(at, doc.instanceOf))}/${NODE_DESCRIPTION}`,
      }),
      abstract: doc.abstract === true,
      abstractGroupings: [],
    });
  }

  for (const modulePath of entries) {
    const segments = modulePath.split("/");
    const leaf = segments[segments.length - 1]!;
    if (isDescription(leaf)) continue;

    if (!leaf.endsWith(".mjs")) {
      fail(
        "invalid_espalier_entry",
        `${modulePath}: everything in the espalier is a rule module or an ${NODE_DESCRIPTION}`,
      );
    }

    const authored = [...segments.slice(0, -1), leaf.slice(0, -".mjs".length)];
    const absoluteModule = path.join(absolute, modulePath);

    // The module is imported before its path is parsed, because `literalName`
    // decides whether the filename's brackets are a placeholder or a name.
    const imported = await importRuleModule(absoluteModule, modulePath, root);
    const last = authored.length - 1;
    const isLiteral = (index: number): boolean => index === last ? imported.literalName === true : literalDirectory(authored, index);

    // A constraint leaf or dynamic structural leaf can list exact extensions.
    // A brace elsewhere is a back-reference.
    // Constraint-ness is a plain string test, decidable before any parsing.
    const constraintPath = authored.some((segment, index) => !isLiteral(index) && segment.includes("[..."));
    const parsed = authored.map((segment, index) => {
      if (index === last && !constraintPath) return parseStructuralLeaf(segment, modulePath, { literal: isLiteral(index) });
      return parseSegment(segment, modulePath, {
        backrefs: !(constraintPath && index === last),
        literal: isLiteral(index),
      });
    });

    // A `{name}` matches what a `[name]` above it captured, so the placeholder
    // has to come first. `[...name]` is excluded deliberately: it captures an
    // array, and there is no text for a back-reference to stand for.

    const recursive = parsed.filter((segment) => segment.recursive !== null);
    if (recursive.length > 1) {
      fail(
        "multiple_recursive_placeholders",
        `${modulePath}: a path may contain at most one recursive placeholder`,
      );
    }

    for (const segment of parsed) {
      const split = ambiguousSplit(segment);
      if (split === null) continue;
      const shown = split.parses.map((parse) => Object.entries(parse).map(([name, value]) => `${name} = "${value}"`).join(", ")).join("  or  ");
      fail(
        "ambiguous_captures",
        `${modulePath}: "${segment.source}" would split "${split.text}" two ways: ${shown}; constrain a capture so the name has one reading`,
        { segment: segment.source, name: split.text, parses: split.parses },
      );
    }

    const names = parsed.flatMap((segment) => captureNames(segment));
    const duplicate = names.find((name, index) => names.indexOf(name) !== index);
    if (duplicate !== undefined) {
      fail(
        "duplicate_placeholder_name",
        `${modulePath}: "[${duplicate}]" appears twice; placeholder names must be unique within a path`,
      );
    }

    // A path containing `[...name]` is a constraint. Its selector comes from
    // the filename or `targets`; `aggregate` changes only the invocation.
    if (recursive.length === 1) {
      const directory = parsed.slice(0, -1);
      const leaf = authored[authored.length - 1]!;
      const module = settleLock(await loadModule(absoluteModule, modulePath, "constraint", root, imported), modulePath);

      const { name, extensions } = splitConstraintLeaf(leaf, modulePath);
      if (extensions === null && module.targets === null) {
        fail("malformed_constraint_leaf", `${modulePath}: an extensionless constraint must export \`targets\``);
      }
      if (extensions !== null && module.targets !== null) {
        fail("module_invalid_export", `${modulePath}: a filename extension and \`targets\` are alternative selectors`);
      }
      for (const extension of extensions ?? [null]) {
        constraints.push({
          modulePath,
          name,
          directory,
          extension,
          pattern: declaration(modulePath),
          module,
        });
      }
      continue;
    }

    // Dynamic extension lists remain one structural leaf and one module. A
    // literal leaf still rejects a list: its requiredness would be ambiguous.
    const leafSegment = parsed[parsed.length - 1]!;

    // A dynamic name naming a contract is not a rule of its own: it declares
    // one group of that contract's files. docs/INSTANCES.MD "Declaring a group".
    if (leafSegment.dynamic && imported.instanceOf !== undefined) {
      const module = settleLock(await loadModule(absoluteModule, modulePath, "group", root, imported), modulePath);
      groupDeclarations.push({ modulePath, directory: parsed.slice(0, -1), name: authored[last]!, module });
      continue;
    }

    const module = settleLock(await loadModule(absoluteModule, modulePath, leafSegment.dynamic ? "dynamic" : "static", root, imported), modulePath);
    for (const grouping of module.groups) {
      if (grouping.extends === null) {
        extensions.push({ modulePath, grouping });
        continue;
      }
      const unknown = grouping.by.find((name) => !names.includes(name));
      if (unknown !== undefined) {
        fail("module_invalid_export", `${modulePath}: \`groups.${grouping.name}.by\` names "${unknown}", which this path does not capture; it captures ${names.map((name) => `"${name}"`).join(", ")}`);
      }
      const optional = grouping.by.find((name) => parsed.some((segment) => optionalCaptureNames(segment).includes(name)));
      if (optional !== undefined) {
        fail("module_invalid_export", `${modulePath}: \`groups.${grouping.name}.by\` names "${optional}", which an alternative leaves out, so some files would have no value for it; group by captures every match binds`);
      }
      if (grouping.by.length === names.length) {
        fail("module_invalid_export", `${modulePath}: \`groups.${grouping.name}.by\` names every capture, so each group would hold one file; leave at least one capture to vary`);
      }
    }

    insert(trie, parsed, {
      modulePath,
      segments: parsed,
      pattern: declaration(modulePath),
      module,
    });
  }

  markAbstract(trie, nodes);
  materializeInstances(trie, nodes);
  for (const { modulePath, grouping } of extensions) {
    if (grouping.extends !== null) continue;
    fail("module_invalid_export", `${modulePath}: \`groups.${grouping.name}\` has no \`by\`; only a rule restating an inherited one leaves it out, to add to the inherited grouping of that name`);
  }
  // After instances are filled in, so a named instance can declare a group
  // of a grouping it inherits. Instances share their contract's rule, so a
  // group declared beside the contract reaches every one of them.
  const declaredGroupings = new Set<Grouping[]>();
  for (const entry of groupDeclarations) declaredGroupings.add(attachGroup(trie, entry, modules));
  for (const groupings of declaredGroupings) checkGroupFreezes(groupings);
  validateBindings(trie, new Set());
  for (const constraint of constraints) validateSegments(constraint.directory, new Set(), constraint.modulePath);
  checkSiblings(trie, "");

  // Cloned inherited rules share their declaration's prose, not the context of
  // whichever concrete instance happens to be visited first.
  const renderedRules = new Map<string, { guidance: string; description: string | null }>();
  const renderModule = async (modulePath: string, module: LoadedModule, constraint = false): Promise<void> => {
    if (!module.guidanceRenderer && !module.descriptionRenderer) return;
    if (!renderedRules.has(modulePath)) {
      const context = ruleGuidanceContext(trie, config, declaration(modulePath), constraint, module.locked);
      renderedRules.set(modulePath, {
        guidance: (await renderRuleText(module.guidanceRenderer ?? module.guidance, context, modulePath))!,
        description: await renderRuleText(module.descriptionRenderer ?? module.description, context, modulePath, "description"),
      });
    }
    Object.assign(module, renderedRules.get(modulePath)!);
  };
  const visitedRules = new Set<StructuralRule>();
  const renderStructural = async (rule: StructuralRule): Promise<void> => {
    if (visitedRules.has(rule)) return;
    visitedRules.add(rule);
    for (const base of rule.inherited ?? []) await renderStructural(base);
    await renderModule(rule.modulePath, rule.module);
  };
  const renderTree = async (node: TrieNode): Promise<void> => {
    if (node.rule) await renderStructural(node.rule);
    for (const child of node.children.values()) await renderTree(child);
  };
  await renderTree(trie);
  for (const constraint of constraints) await renderModule(constraint.modulePath, constraint.module, true);
  for (const { module } of groupDeclarations) {
    if (!module.guidanceRenderer && !module.descriptionRenderer) continue;
    const instance = groupInstances.get(module)!;
    const context: RuleGuidanceContext = { config, pattern: instance.pattern, path: null, captures: instance.captures, locked: module.locked };
    module.guidance = (await renderRuleText(module.guidanceRenderer ?? module.guidance, context, instance.modulePath))!;
    module.description = await renderRuleText(module.descriptionRenderer ?? module.description, context, instance.modulePath, "description");
  }

  for (const [at, doc] of nodes) {
    if (!doc.render && !doc.renderDescription) continue;
    let node = trie;
    const captures: Record<string, string> = {};
    let concrete = true;
    for (const part of at.split("/").filter(Boolean)) {
      const child = [...node.children.values()].find((entry) => entry.display === part);
      if (child === undefined) { concrete = !/[\[{}]/.test(at); break; }
      if (child.segment.dynamic || child.segment.resolved) concrete = false;
      if (child.baseSegment && !child.segment.dynamic && !child.segment.resolved) Object.assign(captures, matchSegment(child.baseSegment, part, captures));
      node = child;
    }
    const context: DirectoryGuidanceContext = { config, pattern: at, path: concrete ? at : null, captures, locked: directoryLock(nodes, at).locked };
    for (const [field, renderer] of [["description", doc.renderDescription], ["guidance", doc.render]] as const) {
      if (!renderer) continue;
      let result: unknown;
      try { result = await renderer(structuredClone(context)); }
      catch (cause) {
        fail("malformed_node_description", `${at}/${NODE_DESCRIPTION}: ${field} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      if (typeof result !== "string") fail("malformed_node_description", `${at}/${NODE_DESCRIPTION}: ${field} must return a string`);
      if (field === "description") doc.description = result;
      else doc.body = result.trim();
    }
  }
  return { root: trie, constraints, nodes, modules };
}

export interface DirectoryGuidanceContext {
  config: Readonly<Config>;
  pattern: string;
  path: string | null;
  captures: Readonly<Record<string, string>>;
  /** Whether this directory is locked. docs/LOCKS.MD. */
  locked: boolean;
}

/** Compile-time declaration context, independent of individual lint matches. */
export interface RuleGuidanceContext {
  config: Readonly<Config>;
  /** Authored rule path without its final .mjs, including constraint names. */
  pattern: string;
  /** Concrete structural path when known; always null for constraints. */
  path: string | null;
  captures: Readonly<Record<string, string>>;
  /** Whether the declaring module is locked. docs/LOCKS.MD. */
  locked: boolean;
}

function ruleGuidanceContext(root: TrieNode, config: Config, pattern: string, constraint: boolean, locked: boolean): RuleGuidanceContext {
  let node = root;
  let concrete = !constraint;
  const captures: Record<string, string> = {};
  const resolved: string[] = [];
  for (const part of pattern.split("/")) {
    const child = [...node.children.values()].find((entry) => entry.display === part);
    if (!child) { concrete = false; break; }
    const name = child.segment.dynamic ? null
      : child.segment.resolved ? resolveSegment(child.segment, captures) : part;
    if (name === null) concrete = false;
    else {
      resolved.push(name);
      if (child.baseSegment) Object.assign(captures, matchSegment(child.baseSegment, name, captures));
    }
    node = child;
  }
  return { config, pattern, path: concrete ? resolved.join("/") : null, captures, locked };
}

/** Shared by compilation and standalone rule tests; neither guesses a context. */
export async function renderRuleText(value: unknown, context: RuleGuidanceContext | undefined, source: string, field: "guidance" | "description" = "guidance"): Promise<string | null> {
  if (typeof value !== "function") return typeof value === "string" ? value : null;
  if (!context) fail("module_invalid_export", `${source}: a function-valued ${field} requires a guidance context`);
  let result: unknown;
  try { result = await value(structuredClone(context)); }
  catch (cause) {
    fail("rule_guidance_failed", `${source}: ${field} guidance failed: ${cause instanceof Error ? cause.message : String(cause)}`, { path: source });
  }
  if (typeof result !== "string") fail("module_invalid_export", `${source}: ${field} guidance must return a string`, { path: source });
  return result;
}

async function readDirectoryModule(
  absolute: string, source: string,
): Promise<NodeDoc> {
  let module: Record<string, unknown>;
  try { module = await import(moduleUrl(absolute)); }
  catch (cause) { fail("module_import_failed", `${source} could not be imported: ${(cause as Error).message}`); }
  if (["rule", "lint", "template", "minMatches"].some((key) => key in module)) {
    fail("malformed_node_description", `${source}: ESPALIER.mjs is reserved for directory metadata; move structural rule exports to their governed filename`);
  }
  if (module.instanceOf !== undefined && (typeof module.instanceOf !== "string" || !module.instanceOf)) {
    fail("malformed_node_description", `${source}: instanceOf must be a nonempty string`);
  }
  for (const key of ["fold", "optional", "literalName", "abstract", "locked", "frozen", "sealed"] as const) {
    if (module[key] !== undefined && typeof module[key] !== "boolean") {
      fail("malformed_node_description", `${source}: ${key} must be a boolean`);
    }
  }
  if (module.literalName === true) {
    const parts = source.split("/");
    const name = parts.length > 1 ? parts[parts.length - 2]! : null;
    if (name === null) fail("malformed_node_description", `${source}: the espalier root has no name for literalName to apply to`);
    if (!PLACEHOLDER_SYNTAX.test(name)) {
      fail("malformed_node_description", `${source}: literalName applies to a name containing placeholder syntax; "${name}" has none`);
    }
  }
  if (module.optional !== undefined && module.instanceOf === undefined) {
    fail("malformed_node_description", `${source}: optional applies only to a named directory instance`);
  }
  for (const key of ["description", "guidance"] as const) {
    if (module[key] !== undefined && typeof module[key] !== "string" && typeof module[key] !== "function") {
      fail("malformed_node_description", `${source}: ${key} must be a string or function`);
    }
  }
  return {
    description: typeof module.description === "string" ? module.description : null,
    fold: module.fold === true, body: typeof module.guidance === "string" ? module.guidance.trim() : "",
    instanceOf: module.instanceOf as string | undefined, optional: module.optional === true,
    ...(module.literalName === true ? { literalName: true } : {}),
    ...(module.abstract === true ? { abstract: true } : {}),
    ...(typeof module.locked === "boolean" ? { lockExport: module.locked } : {}),
    ...(typeof module.frozen === "boolean" ? { frozenExport: module.frozen } : {}),
    ...(typeof module.sealed === "boolean" ? { sealed: module.sealed } : {}),
    ...(typeof module.guidance === "function" ? { render: module.guidance as (context: DirectoryGuidanceContext) => unknown } : {}),
    ...(typeof module.description === "function" ? { renderDescription: module.description as (context: DirectoryGuidanceContext) => unknown } : {}),
  };
}

function validateSegments(segments: Segment[], known: Set<string>, source: string): Set<string> {
  const bound = new Set(known);
  for (const segment of segments) {
    for (const name of backrefNames(segment)) {
      if (!bound.has(name)) fail("unbound_backreference", `${source}: "{${name}}" refers to a capture no earlier segment declares`, { name });
    }
    for (const name of captureNames(segment)) {
      if (bound.has(name)) fail("duplicate_placeholder_name", `${source}: "[${name}]" appears twice; placeholder names must be unique within a path`);
      bound.add(name);
    }
  }
  return bound;
}

function validateBindings(node: TrieNode, bound: Set<string>): void {
  for (const child of node.children.values()) {
    const next = validateSegments([child.baseSegment ?? child.segment], bound, child.rule?.modulePath ?? child.display);
    validateBindings(child, next);
  }
}

/** A module found at a dynamic name that names a contract, before it is resolved. */
interface GroupDeclaration {
  modulePath: string;
  /** Its directory, as parsed; the contract is a sibling in the same one. */
  directory: Segment[];
  /** The authored name, e.g. `0001[ord=00]_users.sql`. */
  name: string;
  module: LoadedModule;
}

/** A dynamic name as authored, split into literal text and `[name…]` placeholders. */
function nameTokens(name: string): Array<{ text: string; capture?: string }> {
  const tokens: Array<{ text: string; capture?: string }> = [];
  let last = 0;
  for (const found of name.matchAll(/\[([A-Za-z_][A-Za-z0-9_]*)(?:[=@][^\]]*)?\]/g)) {
    if (found.index! > last) tokens.push({ text: name.slice(last, found.index) });
    tokens.push({ text: found[0], capture: found[1]! });
    last = found.index! + found[0].length;
  }
  if (last < name.length) tokens.push({ text: name.slice(last) });
  return tokens;
}

/** A contract's name with some captures written as values: the name that declares that group. */
export function groupName(contract: string, values: Readonly<Record<string, CaptureValue>>): string {
  return nameTokens(contract)
    .map((token) => token.capture !== undefined && typeof values[token.capture] === "string" ? values[token.capture] : token.text)
    .join("");
}

/** Where a group of `rule` is declared, as an espalier-relative module path. */
export function groupModulePath(rule: StructuralRule, grouping: Grouping, captures: Readonly<Record<string, CaptureValue>>): string {
  const cut = rule.pattern.lastIndexOf("/");
  const values = Object.fromEntries(grouping.by.map((name) => [name, captures[name]!]));
  return `${rule.pattern.slice(0, cut + 1)}${groupName(rule.pattern.slice(cut + 1), values)}.mjs`;
}

/**
 * The declared group of `grouping` these captures name in `directory`, if one
 * is declared for it. A named instance's own declaration is the more specific
 * statement, so it answers before one beside the contract.
 */
export function declaredGroup(grouping: Grouping, captures: Readonly<Record<string, CaptureValue>>, directory: string): GroupInstance | undefined {
  return declaredGroups(grouping, directory, captures)[0];
}

/**
 * The declarations of `grouping` that speak for `directory`, the instance's
 * own first; with `captures`, only those of that one group. Their checks and
 * prose add up; the first one decides `frozen` and `sealed`.
 */
export function declaredGroups(grouping: Grouping, directory: string, captures?: Readonly<Record<string, CaptureValue>>): GroupInstance[] {
  const named = (instance: GroupInstance): boolean => captures === undefined || grouping.by.every((name) => instance.captures[name] === captures[name]);
  return [
    ...grouping.instances.filter((instance) => instance.directory === directory && named(instance)),
    ...grouping.instances.filter((instance) => instance.directory === null && named(instance)),
  ];
}

/**
 * Whether a group is declared in `directory` by any grouping along a rule's
 * chain that adds to the same one: an abstract grouping is satisfied by a
 * declaration beside the contract or inside the instance alike.
 */
export function groupDeclared(chain: readonly StructuralRule[], grouping: Grouping, captures: Readonly<Record<string, CaptureValue>>, directory: string): boolean {
  const root = rootGrouping(grouping);
  return chain.some((rule) => rule.module.groups.some((other) => rootGrouping(other) === root && declaredGroup(other, captures, directory) !== undefined));
}

/**
 * Which captures `name` writes as values in place of `contract`'s
 * placeholders, or null when it is not the contract's name with some of them
 * filled in. Every other character must be the contract's own.
 */
export function boundCaptures(contract: string, name: string): Record<string, string> | null {
  const tokens = nameTokens(contract);
  const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = tokens.map((token, index) => token.capture === undefined
    ? escape(token.text)
    : `(?:${escape(token.text)}|(?<v${index}>[^\\[\\]{}/]+))`).join("");
  const found = new RegExp(`^${source}$`).exec(name);
  if (found === null) return null;
  const bound: Record<string, string> = {};
  for (const [index, token] of tokens.entries()) {
    const value = found.groups?.[`v${index}`];
    if (token.capture !== undefined && value !== undefined) bound[token.capture] = value;
  }
  return bound;
}

/** The resolved group of each declaring module, for rendering its prose. */
const groupInstances = new WeakMap<LoadedModule, GroupInstance>();

/**
 * Resolve a group declaration against its sibling contract and attach it to
 * the grouping whose `by` it binds, the nearest along the contract's chain.
 * Two groupings of one rule never share a capture set, so the captures
 * written as values choose exactly one. A declaration inside a named
 * instance of a grouping it inherits speaks only for that directory.
 * Returns the groupings of the rule that defines it.
 */
function attachGroup(root: TrieNode, entry: GroupDeclaration, modules: Map<string, ModuleRecord>): Grouping[] {
  const { modulePath, module } = entry;
  let parent: TrieNode | undefined = root;
  for (const segment of entry.directory) parent = parent?.children.get(trieKey(segment));
  const reference = module.instanceOf!.replace(/^\.\//, "").replace(/\.mjs$/, "");
  const contract = parent === undefined ? undefined
    : [...parent.children.values()].find((child) => child.rule !== null && child.display === reference);
  if (contract === undefined || !contract.segment.dynamic) {
    fail("invalid_instance", `${modulePath}: instanceOf must name a sibling dynamic rule; ${reference} is not one beside it`);
  }
  const chain = [...(contract.rule!.inherited ?? []), contract.rule!].reverse();
  if (chain.every((rule) => rule.module.groups.length === 0)) {
    fail("invalid_instance", `${modulePath}: ${reference} declares no groupings, so a narrower name declares no group of it; a single file is declared at its full name`);
  }
  const bound = boundCaptures(reference, entry.name);
  if (bound === null || Object.keys(bound).length === 0) {
    fail("invalid_instance", `${modulePath}: a group of ${reference} is declared at that name with its grouping's captures written as values and every other character unchanged`);
  }
  for (const [name, value] of Object.entries(bound)) {
    const placeholder = nameTokens(reference).find((token) => token.capture === name)!.text;
    const admitted = matchSegment(parseSegment(placeholder, modulePath), value, {}) !== null
      && !(contract.segment.dotlessCaptures === true && value.includes("."));
    if (!admitted) fail("invalid_instance", `${modulePath}: "${value}" is not a value ${placeholder} admits`);
  }
  const names = Object.keys(bound).sort().join();
  const binds = (candidate: Grouping): boolean => [...candidate.by].sort().join() === names;
  const owner = chain.find((rule) => rule.module.groups.some(binds));
  if (owner === undefined) {
    const known = chain.flatMap((rule) => rule.module.groups)
      .map((candidate) => `${candidate.name} by ${candidate.by.length === 0 ? "nothing" : candidate.by.join(", ")}`).join("; ");
    fail("invalid_instance", `${modulePath}: binds ${Object.keys(bound).sort().join(", ")}, and no grouping of ${reference} groups by exactly those captures (${known})`);
  }
  const grouping = owner.module.groups.find(binds)!;
  const directory = directoryOf(modulePath);
  const scoped = directory !== directoryOf(owner.modulePath);
  if (scoped && entry.directory.some((segment) => segment.dynamic || segment.resolved)) {
    fail("invalid_instance", `${modulePath}: declares a group of ${owner.pattern} away from it; declare it beside that rule, or in one named instance directory`);
  }
  const instance: GroupInstance = {
    modulePath,
    pattern: declaration(modulePath),
    captures: bound,
    directory: scoped ? directory : null,
    segment: parseStructuralLeaf(entry.name, modulePath),
    module,
  };
  groupInstances.set(module, instance);
  grouping.instances.push(instance);
  grouping.instances.sort((left, right) => left.pattern.localeCompare(right.pattern));
  modules.get(modulePath)!.contract = owner.modulePath;
  return owner.module.groups;
}

const directoryOf = (modulePath: string): string => modulePath.includes("/") ? modulePath.slice(0, modulePath.lastIndexOf("/")) : "";

/**
 * A rule restating an inherited one adds to the groupings it inherits and
 * never replaces one: a grouping without `by` names an inherited grouping and
 * may make it abstract or sealed, and add guidance and a check. Tightening
 * what is already tight states nothing new, and would report every finding
 * twice. docs/INSTANCES.MD "Adding to an inherited grouping".
 */
function extendGroupings(local: StructuralRule, base: StructuralRule): void {
  const inherited = [...(base.inherited ?? []), base].reverse().flatMap((rule) => rule.module.groups);
  for (const grouping of local.module.groups) {
    const same = inherited.find((candidate) => candidate.name === grouping.name);
    if (grouping.extends !== null) {
      if (same !== undefined) {
        fail("invalid_instance", `${local.modulePath}: \`groups.${grouping.name}\` would replace the grouping ${base.pattern} defines under that name; leave out \`by\` to add to it, or give a grouping of its own another name`);
      }
      continue;
    }
    if (same === undefined) {
      fail("invalid_instance", `${local.modulePath}: \`groups.${grouping.name}\` has no \`by\`, and ${base.pattern} has no grouping of that name to add to`);
    }
    grouping.by = same.by;
    grouping.extends = same;
    grouping.abstract &&= !tightened(same, "abstract");
    grouping.sealed &&= !tightened(same, "sealed");
  }
}

/** Whether a grouping, or one it adds to, sets `key`. */
function tightened(grouping: Grouping, key: "abstract" | "sealed"): boolean {
  for (let at: Grouping | null | undefined = grouping; at; at = at.extends) if (at[key]) return true;
  return false;
}

/** Whether a grouping is abstract, by itself or by the grouping it adds to. */
export function groupingAbstract(grouping: Grouping): boolean {
  return tightened(grouping, "abstract");
}

/** The grouping that defines what `grouping` adds to: itself, unless it extends one. */
export function rootGrouping(grouping: Grouping): Grouping {
  let at = grouping;
  while (at.extends) at = at.extends;
  return at;
}

/**
 * Two declared groups of different groupings may share files, and a file
 * cannot be both frozen and reopened. Groups that could share one, because
 * they agree on every capture both groupings group by, must agree on
 * `frozen`. A file that does not exist yet is still covered: the
 * contradiction is in the espalier. docs/LOCKS.MD "Frozen files".
 */
function checkGroupFreezes(groupings: Grouping[]): void {
  for (const [index, grouping] of groupings.entries()) {
    for (const other of groupings.slice(index + 1)) {
      for (const one of grouping.instances) {
        for (const two of other.instances) {
          if (one.directory !== null && two.directory !== null && one.directory !== two.directory) continue;
          const [a, b] = [one.module.frozenExport, two.module.frozenExport];
          if (a === undefined || b === undefined || a === b) continue;
          if (Object.keys(one.captures).some((name) => name in two.captures && one.captures[name] !== two.captures[name])) continue;
          const [frozen, reopened] = a ? [one, two] : [two, one];
          fail("conflicting_frozen", `${frozen.modulePath} freezes the files it shares with ${reopened.modulePath}, which reopens them; set \`frozen\` on only one of them, or make them agree`, {
            frozen: frozen.modulePath, reopened: reopened.modulePath,
          });
        }
      }
    }
  }
}

/** An abstract directory module marks its dynamic node before instances are cloned from it. */
function markAbstract(root: TrieNode, docs: Map<string, NodeDoc>): void {
  for (const [at, doc] of docs) {
    if (!doc.abstract) continue;
    if (at === "") fail("malformed_node_description", "abstract applies to a dynamic directory, not the espalier root");
    let node: TrieNode | undefined = root;
    for (const part of at.split("/")) {
      node = node === undefined ? undefined : [...node.children.values()].find((child) => child.display === part && child.rule === null);
    }
    if (node === undefined) fail("malformed_node_description", `${at}: abstract applies to a dynamic directory that declares contents; this one declares none`);
    if (!node.segment.dynamic) fail("malformed_node_description", `${at}: only a dynamic directory such as \`[name]/\` can be abstract`);
    node.abstract = true;
  }
}

/** Compile named instances into one effective tree, keeping source rule identity. */
function materializeInstances(root: TrieNode, docs: Map<string, NodeDoc>): void {
  // Directory metadata ordinarily does not declare structure. An instance does.
  for (const [at, doc] of docs) {
    if (!doc.instanceOf) continue;
    let node = root;
    const parts = at.split("/");
    for (const [depth, part] of parts.entries()) {
      if (!part) fail("invalid_instance", "the project root cannot be an instance");
      const segment = parseSegment(part, at, { literal: docs.get(parts.slice(0, depth + 1).join("/"))?.literalName === true });
      if (segment.recursive !== null) fail("invalid_instance", `${at}: named instances cannot be declared under a recursive constraint path`);
      const key = trieKey(segment);
      let child = node.children.get(key);
      if (!child) { child = emptyNode(part, segment); node.children.set(key, child); }
      child.directory = true;

      node = child;
    }
    if (node.segment.dynamic || node.segment.resolved) fail("invalid_instance", `${at}: only a static directory can declare instanceOf`);
    node.instanceOf = doc.instanceOf;
    const reference = path.posix.normalize(path.posix.join(at, doc.instanceOf));
    if (docs.has(reference)) {
      let base = root;
      const referenceParts = reference.split("/");
      for (const [depth, part] of referenceParts.entries()) {
        const segment = parseSegment(part, reference, { literal: docs.get(referenceParts.slice(0, depth + 1).join("/"))?.literalName === true });
        const key = trieKey(segment);
        let child = base.children.get(key);
        if (!child) { child = emptyNode(part, segment); base.children.set(key, child); }
        child.directory = true;
        base = child;
      }
    }
    node.optional = doc.optional;
  }
  const completed = new Set<TrieNode>();
  const active = new Set<TrieNode>();
  const clone = (node: TrieNode): TrieNode => ({ ...node, children: new Map([...node.children].map(([key, child]) => [key, clone(child)])) });
  const referenceName = (reference: string, directory: boolean): string => {
    const name = directory ? reference.replace(/^\.\.\//, "") : reference.replace(/^\.\//, "").replace(/\.mjs$/, "");
    if (!name || name.includes("/") || name === "." || name === "..") fail("invalid_instance", `${reference}: instanceOf must name a sibling contract`);
    return name;
  };
  const choose = (parent: TrieNode, child: TrieNode, captures: Record<string, string>): TrieNode | undefined => {
    const directory = child.rule === null;
    const usable = (node: TrieNode) => directory ? node.rule === null : node.rule !== null;
    const exact = [...parent.children.values()].find((node) => usable(node) && !node.segment.dynamic &&
      (node.segment.resolved ? resolveSegment(node.segment, captures) === child.display : node.display === child.display));
    if (exact) return exact;
    const unresolved = [...parent.children.values()].find((node) => usable(node) && node.segment.resolved &&
      resolveSegment(node.segment, captures) === null && intersectSegments(node.segment, child.segment));
    if (unresolved) fail("invalid_instance", `${child.display}: may shadow inherited back-reference ${unresolved.display}; specialize only where its binding is known`);
    if (child.segment.dynamic || child.segment.resolved) return undefined;
    return [...parent.children.values()].filter((node) => usable(node) && node.segment.dynamic && matchSegment(node.segment, child.display, captures) !== null)
      .sort((a, b) => isStrictSubset(a.segment, b.segment) ? -1 : isStrictSubset(b.segment, a.segment) ? 1 : 0)[0];
  };
  const compose = (local: TrieNode, base: TrieNode, at: string, captures: Record<string, string>): void => {
    if (local.rule !== null) {
      if (base.rule === null) fail("invalid_instance", `${at}: a file must specialize a file`);
      extendGroupings(local.rule, base.rule);
      if (!base.segment.dynamic && !base.rule.module.optional && local.rule.module.optional) {
        fail("invalid_instance", `${at}: a required inherited file cannot become optional`);
      }
      local.rule = { ...local.rule,
        inherited: [...(base.rule.inherited ?? []), base.rule],
        module: { ...local.rule.module, template: local.rule.module.template ?? base.rule.module.template,
          ...(local.segment.dynamic ? { minMatches: local.rule.module.minMatches ?? base.rule.module.minMatches,
            optional: (local.rule.module.minMatches ?? base.rule.module.minMatches ?? 0) === 0 } : {}),
        },
        templateRule: local.rule.module.template !== null ? local.rule : base.rule.templateRule ?? base.rule,
      };
      local.baseSegment = base.baseSegment ?? base.segment;
      return;
    }
    if (base.rule !== null) fail("invalid_instance", `${at}: a directory must specialize a directory`);
    const namedCaptures = local.segment.dynamic ? {} : matchSegment(base.baseSegment ?? base.segment, local.display, captures);
    const bound = { ...captures, ...namedCaptures };
    local.baseSegment = base.baseSegment ?? base.segment;
    local.directory = true;
    const children = new Map([...base.children].map(([key, child]) => [key, clone(child)]));
    for (const [key, child] of local.children) {
      const target = `${at}/${child.display}`;
      const same = base.children.get(key);
      const matched = same ?? choose(base, child, bound);
      if (!matched) fail("invalid_instance", `${target}: no child in the inherited contract admits this path`);
      const ref = child.rule?.module.instanceOf ?? docs.get(target)?.instanceOf;
      if (ref !== undefined && referenceName(ref, child.rule === null) !== matched.display) {
        fail("invalid_instance", `${target}: instanceOf must name its owning inherited contract ${matched.display}`);
      }
      if (matched.segment.dynamic && !child.segment.dynamic && ref === undefined) {
        fail("invalid_instance", `${target}: naming a dynamic member requires instanceOf`);
      }
      if (child.segment.dynamic && child.display !== matched.display) fail("invalid_instance", `${target}: inherited collections cannot be replaced`);
      if (child.rule !== null && child.segment.dynamic) {
        if ((child.rule.module.minMatches ?? matched.rule?.module.minMatches ?? 0) < (matched.rule?.module.minMatches ?? 0)) fail("invalid_instance", `${target}: minMatches cannot weaken the inherited minimum`);
      }
      compose(child, matched, target, bound);
      children.set(key, child);
    }
    local.children = children;
  };
  const expand = (node: TrieNode, at: string, parent?: TrieNode): void => {
    if (completed.has(node)) return;
    if (active.has(node)) fail("invalid_instance", `${at}: cyclic instanceOf reference`);
    active.add(node);
    const ref = node.rule?.module.instanceOf ?? node.instanceOf;
    if (ref !== undefined) {
      if (node.segment.dynamic || node.segment.resolved) fail("invalid_instance", `${at}: instanceOf requires a static name`);
      const name = referenceName(ref, node.rule === null);
      const base = parent && [...parent.children.values()].find((candidate) => candidate.display === name);
      if (!base || !base.segment.dynamic || base.segment.recursive !== null || base === node) fail("invalid_instance", `${at}: instanceOf must name a matching sibling dynamic contract`);
      expand(base, at.split("/").slice(0, -1).concat(base.display).join("/"), parent);
      const winner = parent && choose({ ...parent, children: new Map([...parent.children].filter(([, child]) => child !== node)) }, node, {});
      if (winner === undefined) fail("invalid_instance", `${at}: the name does not match the named contract ${base.display}`);
      if (winner !== base) fail("invalid_instance", `${at}: the named contract ${base.display} would not own this instance; ${winner.display} would`);
      compose(node, base, at, {});
    } else {
      for (const child of node.children.values()) expand(child, at ? `${at}/${child.display}` : child.display, node);
    }
    active.delete(node);
    completed.add(node);
  };
  expand(root, "");
}

/** Mask comments and strings so migration cannot rewrite prose containing JS. */
export function sourceCode(source: string): string {
  const masked = source.split("");
  const blank = (start: number, end: number): void => {
    for (let i = start; i < end; i++) if (masked[i] !== "\n" && masked[i] !== "\r") masked[i] = " ";
  };
  const quoted = (start: number): number => {
    const quote = source[start];
    let i = start + 1;
    while (i < source.length) {
      if (source[i] === "\\") { i += 2; continue; }
      if (source[i] === quote) return i + 1;
      if (quote === "`" && source.slice(i, i + 2) === "${") { i = expression(i + 2); continue; }
      i++;
    }
    return i;
  };
  const comment = (start: number): number => source[start + 1] === "/"
    ? (source.indexOf("\n", start) === -1 ? source.length : source.indexOf("\n", start))
    : (source.indexOf("*/", start + 2) === -1 ? source.length : source.indexOf("*/", start + 2) + 2);
  const expression = (start: number): number => {
    let depth = 1;
    for (let i = start; i < source.length;) {
      if (["'", '"', "`"].includes(source[i]!)) { i = quoted(i); continue; }
      if (source[i] === "/" && ["/", "*"].includes(source[i + 1]!)) { i = comment(i); continue; }
      if (source[i] === "{") depth++;
      if (source[i] === "}" && --depth === 0) return i + 1;
      i++;
    }
    return source.length;
  };
  for (let i = 0; i < source.length;) {
    if (["'", '"', "`"].includes(source[i]!)) {
      const end = quoted(i); blank(i, end); i = end;
    } else if (source[i] === "/" && ["/", "*"].includes(source[i + 1]!)) {
      const end = comment(i); blank(i, end); i = end;
    } else i++;
  }
  return masked.join("");
}
