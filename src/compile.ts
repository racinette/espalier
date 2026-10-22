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
  resolveSegment,
  backrefNames,
  captureNames,
  intersectSegments,
  isStrictSubset,
  parseSegment,
  parseStructuralLeaf,
  trieKey,
  type Segment,
} from "./pattern.js";

export const NODE_DESCRIPTION = "ESPALIER.mjs";
export const LEGACY_NODE_DESCRIPTION = "ESPALIER.MD";

export interface RuleModule {
  description?: unknown;
  rule?: unknown;
  lint?: unknown;
  referenceImplementation?: unknown;
  optional?: unknown;
  minMatches?: unknown;
  instanceOf?: unknown;
  aggregate?: unknown;
  targets?: unknown;
  template?: unknown;
}

export interface LoadedModule {
  description: string | null;
  rule: string;
  ruleRenderer?: (context: RuleGuidanceContext) => unknown;
  lint: (context: unknown) => unknown;
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
}

/** The module kind determines requiredness defaults and valid exports. */
type ModuleKind = "constraint" | "static" | "dynamic";

export interface StructuralRule {
  /** Espalier-relative module path, e.g. `clients/[provider]/client.ts.mjs`. */
  modulePath: string;
  /** Normalized glob, e.g. `clients/*​/client.ts`. */
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
}

export interface Constraint {
  modulePath: string;
  /** The rule name before any extension selector, e.g. `no-as-any`. */
  name: string;
  /** Directory segments, containing exactly one recursive placeholder. */
  directory: Segment[];
  /** Filename extension selector; null when the module selects with `targets`. */
  extension: string | null;
  /** Normalized directory scope and optional extension, e.g. `src/**​/*.ts`. */
  pattern: string;
  module: LoadedModule;
}

/** Directory metadata and rendered prose, independently of file rules. */
export interface NodeDoc {
  /** Fold this directory and its descendants into an enclosing document. */
  fold: boolean;
  /** The one line that appears in the project map. */
  description: string | null;
  /** The rendered Markdown guidance. */
  body: string;
  render?: (context: DirectoryGuidanceContext) => unknown;
  source?: string;
  instanceOf?: string;
  optional?: boolean;
}

export interface Espalier {
  root: TrieNode;
  constraints: Constraint[];
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

async function loadModule(
  absolute: string,
  modulePath: string,
  kind: ModuleKind,
  root: string,
): Promise<LoadedModule> {
  const structural = kind !== "constraint";
  let loaded: RuleModule;
  try {
    loaded = (await import(pathToFileURL(absolute).href)) as RuleModule;
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

  if ("unobservedImplementationDependencies" in loaded) fail("module_invalid_export", `${modulePath}: unobservedImplementationDependencies is not supported`);
  if (typeof loaded.rule !== "string" && typeof loaded.rule !== "function") {
    fail("module_missing_export", `${modulePath} must export a string or function \`rule\``);
  }
  if (typeof loaded.lint !== "function") {
    fail("module_missing_export", `${modulePath} must export a \`lint\` function`);
  }
  if (structural && typeof loaded.description !== "string") {
    fail("module_missing_export", `${modulePath} must export a string \`description\``);
  }
  if (loaded.description !== undefined && typeof loaded.description !== "string") {
    fail("module_invalid_export", `${modulePath}: \`description\` must be a string`);
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
  if (loaded.instanceOf !== undefined && (kind !== "static" ||
      typeof loaded.instanceOf !== "string" || loaded.instanceOf.length === 0)) {
    fail("module_invalid_export", `${modulePath}: instanceOf must name a contract on a static leaf`);
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

  return {
    description: typeof loaded.description === "string" ? loaded.description : null,
    rule: typeof loaded.rule === "string" ? loaded.rule : "",
    ...(typeof loaded.rule === "function"
      ? { ruleRenderer: loaded.rule as (context: RuleGuidanceContext) => unknown } : {}),
    lint: loaded.lint as (context: unknown) => unknown,
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
  };
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
          fail(
            "ambiguous_siblings",
            `${at === "" ? "" : `${at}/`}${left.display} and ${at === "" ? "" : `${at}/`}${right.display} can both match one name without a strictly narrower winner, so ownership would be undecidable`,
            { left: left.display, right: right.display },
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
  for (const modulePath of entries) {
    const segments = modulePath.split("/");
    const leaf = segments[segments.length - 1]!;

    if (leaf === NODE_DESCRIPTION || leaf === LEGACY_NODE_DESCRIPTION) {
      const at = segments.slice(0, -1).join("/");
      if (nodes.has(at)) fail("malformed_node_description", `${at}: declare only one directory guidance source`);
      const doc = leaf === LEGACY_NODE_DESCRIPTION
        ? readLegacyNodeDoc(path.join(absolute, modulePath), modulePath)
        : await readDirectoryModule(path.join(absolute, modulePath), modulePath);
      nodes.set(at, { ...doc, source: leaf });
      continue;
    }

    if (!leaf.endsWith(".mjs")) {
      fail(
        "invalid_espalier_entry",
        `${modulePath}: everything in the espalier is a rule module or an ${NODE_DESCRIPTION}`,
      );
    }

    const authored = [...segments.slice(0, -1), leaf.slice(0, -".mjs".length)];

    // A constraint leaf or dynamic structural leaf can list exact extensions.
    // A brace elsewhere is a back-reference.
    // Constraint-ness is a plain string test, decidable before any parsing.
    const constraintPath = authored.some((segment) => segment.includes("[..."));
    const parsed = authored.map((segment, index) => {
      if (index === authored.length - 1 && !constraintPath) return parseStructuralLeaf(segment, modulePath);
      return parseSegment(segment, modulePath, {
        backrefs: !(constraintPath && index === authored.length - 1),
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

    const names = parsed.flatMap((segment) => captureNames(segment));
    const duplicate = names.find((name, index) => names.indexOf(name) !== index);
    if (duplicate !== undefined) {
      fail(
        "duplicate_placeholder_name",
        `${modulePath}: "[${duplicate}]" appears twice; placeholder names must be unique within a path`,
      );
    }

    const absoluteModule = path.join(absolute, modulePath);

    // A path containing `[...name]` is a constraint. Its selector comes from
    // the filename or `targets`; `aggregate` changes only the invocation.
    if (recursive.length === 1) {
      const directory = parsed.slice(0, -1);
      const leaf = authored[authored.length - 1]!;
      const module = await loadModule(absoluteModule, modulePath, "constraint", root);
      const prefix = directory.map((segment) => segment.shape).join("/");

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
          pattern: `${prefix === "" ? "" : `${prefix}/`}*${extension === null ? "" : `.${extension}`}`,
          module,
        });
      }
      continue;
    }

    // Dynamic extension lists remain one structural leaf and one module. A
    // literal leaf still rejects a list: its requiredness would be ambiguous.
    const leafSegment = parsed[parsed.length - 1]!;

    insert(trie, parsed, {
      modulePath,
      segments: parsed,
      pattern: parsed.map((segment) => segment.shape).join("/"),
      module: await loadModule(absoluteModule, modulePath, leafSegment.dynamic ? "dynamic" : "static", root),
    });
  }

  materializeInstances(trie, nodes);
  validateBindings(trie, new Set());
  for (const constraint of constraints) validateSegments(constraint.directory, new Set(), constraint.modulePath);
  checkSiblings(trie, "");

  // Cloned inherited rules share their declaration's prose, not the context of
  // whichever concrete instance happens to be visited first.
  const renderedRules = new Map<string, string>();
  const renderModule = async (modulePath: string, module: LoadedModule, constraint = false): Promise<void> => {
    if (!module.ruleRenderer) return;
    if (!renderedRules.has(modulePath)) {
      const pattern = modulePath.slice(0, -".mjs".length);
      const context = ruleGuidanceContext(trie, config, pattern, constraint);
      renderedRules.set(modulePath, (await renderRuleText(module.ruleRenderer, context, modulePath))!);
    }
    module.rule = renderedRules.get(modulePath)!;
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

  for (const [at, doc] of nodes) {
    if (!doc.render) {
      if (doc.instanceOf) doc.body = `Shared contract: \`${path.posix.normalize(path.posix.join(at, doc.instanceOf))}/\`. Read the ancestor guidance for inherited requirements.\n\n${doc.body}`;
      continue;
    }
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
    try {
      const result = await doc.render({ config: structuredClone(config)!, pattern: at, path: concrete ? at : null, captures });
      if (typeof result !== "string") fail("malformed_node_description", `${at}/${NODE_DESCRIPTION}: guidance must return a string`);
      doc.body = doc.instanceOf ? `Shared contract: \`${path.posix.normalize(path.posix.join(at, doc.instanceOf))}/\`. Read the ancestor guidance for inherited requirements.\n\n${result}` : result;
    } catch (cause) {
      fail("malformed_node_description", `${at}/${NODE_DESCRIPTION}: guidance failed: ${(cause as Error).message}`);
    }
  }
  return { root: trie, constraints, nodes };
}

export interface DirectoryGuidanceContext {
  config: Readonly<Config>;
  pattern: string;
  path: string | null;
  captures: Readonly<Record<string, string>>;
}

/** Compile-time declaration context, independent of individual lint matches. */
export interface RuleGuidanceContext {
  config: Readonly<Config>;
  /** Authored rule path without its final .mjs, including constraint names. */
  pattern: string;
  /** Concrete structural path when known; always null for constraints. */
  path: string | null;
  captures: Readonly<Record<string, string>>;
}

function ruleGuidanceContext(root: TrieNode, config: Config, pattern: string, constraint: boolean): RuleGuidanceContext {
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
  return { config, pattern, path: concrete ? resolved.join("/") : null, captures };
}

/** Shared by compilation and standalone rule tests; neither guesses a context. */
export async function renderRuleText(value: unknown, context: RuleGuidanceContext | undefined, source: string): Promise<string | null> {
  if (typeof value !== "function") return typeof value === "string" ? value : null;
  if (!context) fail("module_invalid_export", `${source}: a function-valued rule requires a guidance context`);
  let result: unknown;
  try { result = await value(structuredClone(context)); }
  catch (cause) {
    fail("rule_guidance_failed", `${source}: rule guidance failed: ${cause instanceof Error ? cause.message : String(cause)}`, { path: source });
  }
  if (typeof result !== "string") fail("module_invalid_export", `${source}: rule guidance must return a string`, { path: source });
  return result;
}

async function readDirectoryModule(
  absolute: string, source: string,
): Promise<NodeDoc> {
  let module: Record<string, unknown>;
  try { module = await import(pathToFileURL(absolute).href); }
  catch (cause) { fail("module_import_failed", `${source} could not be imported: ${(cause as Error).message}`); }
  if (["rule", "lint", "template", "minMatches"].some((key) => key in module)) {
    fail("malformed_node_description", `${source}: ESPALIER.mjs is reserved for directory metadata; move structural rule exports to their governed filename`);
  }
  for (const key of ["description", "instanceOf"] as const) {
    if (module[key] !== undefined && (typeof module[key] !== "string" || (key === "instanceOf" && !module[key]))) {
      fail("malformed_node_description", `${source}: ${key} must be a nonempty string`);
    }
  }
  for (const key of ["fold", "optional"] as const) {
    if (module[key] !== undefined && typeof module[key] !== "boolean") {
      fail("malformed_node_description", `${source}: ${key} must be a boolean`);
    }
  }
  if (module.optional !== undefined && module.instanceOf === undefined) {
    fail("malformed_node_description", `${source}: optional applies only to a named directory instance`);
  }
  if (module.guidance !== undefined && typeof module.guidance !== "string" && typeof module.guidance !== "function") {
    fail("malformed_node_description", `${source}: guidance must be a string or function`);
  }
  return {
    description: (module.description as string | undefined) ?? null,
    fold: module.fold === true, body: typeof module.guidance === "string" ? module.guidance : "",
    instanceOf: module.instanceOf as string | undefined, optional: module.optional === true,
    ...(typeof module.guidance === "function" ? { render: module.guidance as (context: DirectoryGuidanceContext) => unknown } : {}),
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

/** Compile named instances into one effective tree, keeping source rule identity. */
function materializeInstances(root: TrieNode, docs: Map<string, NodeDoc>): void {
  // Directory metadata ordinarily does not declare structure. An instance does.
  for (const [at, doc] of docs) {
    if (!doc.instanceOf) continue;
    let node = root;
    for (const part of at.split("/")) {
      if (!part) fail("invalid_instance", "the project root cannot be an instance");
      const segment = parseSegment(part, at);
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
      for (const part of reference.split("/")) {
        const segment = parseSegment(part, reference);
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
      if (winner !== base) fail("invalid_instance", `${at}: the named contract would not own this instance`);
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
