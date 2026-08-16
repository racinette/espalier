// Reading the espalier tree into a matcher. docs/MATCHING.MD "Node kinds",
// "Classification", "Ambiguity is rejected".

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { fail } from "./errors.js";
import { captureNames, intersects, parseSegment, type Segment } from "./pattern.js";

export const NODE_DESCRIPTION = "ESPALIER.MD";

export interface RuleModule {
  description?: unknown;
  rule?: unknown;
  lint?: unknown;
  example?: unknown;
}

export interface LoadedModule {
  description: string | null;
  rule: string;
  lint: (context: unknown) => unknown;
  example: string | null;
}

export interface StructuralRule {
  /** Espalier-relative module path, e.g. `clients/[provider]/client.ts.mjs`. */
  modulePath: string;
  /** Normalized glob, e.g. `clients/*​/client.ts`. */
  pattern: string;
  module: LoadedModule;
}

export interface TrieNode {
  /** Authored form of this segment: `clients`, `[provider]`, `client.ts`. */
  display: string;
  segment: Segment;
  captures: string[];
  children: Map<string, TrieNode>;
  /** Set when this node is a file leaf. */
  rule: StructuralRule | null;
}

export interface Constraint {
  modulePath: string;
  /** The rule name, e.g. `no-as-any`. */
  name: string;
  /** Directory segments, containing exactly one recursive placeholder. */
  directory: Segment[];
  extension: string;
  /** Normalized glob, e.g. `**​/*.ts`. */
  pattern: string;
  module: LoadedModule;
}

/** An `ESPALIER.MD`: what a directory is, rather than what any file in it is. */
export interface NodeDoc {
  /** The one line that appears in the project map. */
  description: string | null;
  /** The markdown long form. Empty when the file is frontmatter only. */
  body: string;
}

export interface Espalier {
  root: TrieNode;
  constraints: Constraint[];
  /**
   * Espalier-relative directory path to its `ESPALIER.MD`, with `""` for the
   * root. Kept beside the trie rather than on it: a directory may have prose
   * and no rules, and giving it a trie node would change what `lint` reports as
   * declared at its parent.
   */
  nodes: Map<string, NodeDoc>;
}

function emptyNode(display: string, segment: Segment): TrieNode {
  return { display, segment, captures: captureNames(segment), children: new Map(), rule: null };
}

function listEntries(absolute: string, prefix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...listEntries(path.join(absolute, entry.name), relative));
    } else if (entry.isFile()) {
      found.push(relative);
    }
  }
  return found;
}

async function loadModule(absolute: string, modulePath: string, structural: boolean): Promise<LoadedModule> {
  let loaded: RuleModule;
  try {
    loaded = (await import(pathToFileURL(absolute).href)) as RuleModule;
  } catch (cause) {
    fail("module_import_failed", `${modulePath} could not be imported: ${(cause as Error).message}`);
  }

  if (typeof loaded.rule !== "string") {
    fail("module_missing_export", `${modulePath} must export a string \`rule\``);
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
  if (loaded.example !== undefined && typeof loaded.example !== "string") {
    fail("module_invalid_export", `${modulePath}: \`example\` must be a string`);
  }

  return {
    description: typeof loaded.description === "string" ? loaded.description : null,
    rule: loaded.rule,
    lint: loaded.lint as (context: unknown) => unknown,
    example: typeof loaded.example === "string" ? loaded.example : null,
  };
}

/**
 * Reads an `ESPALIER.MD`. YAML frontmatter carries the `description`; the
 * markdown body is the long form. Both parts are optional.
 */
function readNodeDoc(absolute: string, modulePath: string): NodeDoc {
  const text = readFileSync(absolute, "utf8");
  const framed = /^---[^\S\n]*\r?\n([\s\S]*?)\r?\n---[^\S\n]*(?:\r?\n|$)/.exec(text);

  if (framed === null) return { description: null, body: text.trim() };

  let front: unknown;
  try {
    front = parseYaml(framed[1]!);
  } catch (cause) {
    fail("malformed_node_description", `${modulePath}: frontmatter is not valid YAML: ${(cause as Error).message}`);
  }

  let description: string | null = null;
  if (front !== null && typeof front === "object" && !Array.isArray(front)) {
    const value = (front as Record<string, unknown>)["description"];
    if (value !== undefined && typeof value !== "string") {
      fail("malformed_node_description", `${modulePath}: \`description\` must be a string`);
    }
    if (typeof value === "string") description = value;
  }

  return { description, body: text.slice(framed[0].length).trim() };
}

/** `no-as-any.{ts,tsx}` → `{ name, extensions: ["ts", "tsx"] }`. */
function splitConstraintLeaf(leaf: string, modulePath: string): { name: string; extensions: string[] } {
  const braced = /^(.+)\.\{([^{}]*)\}$/.exec(leaf);
  if (braced !== null) {
    const extensions = braced[2]!.split(",").map((entry) => entry.trim());
    if (extensions.length === 0 || extensions.some((entry) => entry === "")) {
      fail("malformed_constraint_leaf", `${modulePath}: empty extension in "${leaf}"`);
    }
    return { name: braced[1]!, extensions };
  }

  const plain = /^(.+)\.([^.{}]+)$/.exec(leaf);
  if (plain === null) {
    fail(
      "malformed_constraint_leaf",
      `${modulePath}: a constraint filename is a rule name plus a target extension, but "${leaf}" is neither`,
    );
  }
  return { name: plain[1]!, extensions: [plain[2]!] };
}

function insert(root: TrieNode, segments: Segment[], rule: StructuralRule): void {
  let node = root;

  for (const [index, segment] of segments.entries()) {
    let child = node.children.get(segment.shape);

    if (child === undefined) {
      child = emptyNode(segment.source, segment);
      node.children.set(segment.shape, child);
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
 * Two dynamic siblings conflict when they compete for the same thing: two
 * leaves that could own one file, or two directories that could claim one
 * subtree. A dynamic directory beside a dynamic leaf is not a conflict, because
 * a directory never owns a file — the walk in match.ts picks whichever can play
 * the role the segment needs.
 */
function checkSiblings(node: TrieNode, at: string): void {
  const dynamic = [...node.children.values()].filter((child) => child.segment.dynamic);

  for (let i = 0; i < dynamic.length; i += 1) {
    for (let j = i + 1; j < dynamic.length; j += 1) {
      const left = dynamic[i]!;
      const right = dynamic[j]!;

      const bothLeaves = left.rule !== null && right.rule !== null;
      const bothDirectories = left.children.size > 0 && right.children.size > 0;
      if (!bothLeaves && !bothDirectories) continue;

      if (intersects(left.segment.shape, right.segment.shape)) {
        fail(
          "ambiguous_siblings",
          `${at === "" ? "" : `${at}/`}${left.display} and ${at === "" ? "" : `${at}/`}${right.display} can both match one name, so ownership would be undecidable`,
          { left: left.display, right: right.display },
        );
      }
    }
  }

  for (const child of node.children.values()) {
    checkSiblings(child, at === "" ? child.display : `${at}/${child.display}`);
  }
}

export async function compile(root: string, espalierRoot: string): Promise<Espalier> {
  const absolute = path.join(root, espalierRoot);
  const trie = emptyNode("", parseSegment("", "the espalier root"));
  const constraints: Constraint[] = [];
  const nodes = new Map<string, NodeDoc>();

  for (const modulePath of listEntries(absolute, "")) {
    const segments = modulePath.split("/");
    const leaf = segments[segments.length - 1]!;

    if (leaf === NODE_DESCRIPTION) {
      nodes.set(segments.slice(0, -1).join("/"), readNodeDoc(path.join(absolute, modulePath), modulePath));
      continue;
    }

    if (!leaf.endsWith(".mjs")) {
      fail(
        "invalid_espalier_entry",
        `${modulePath}: everything in the espalier is a rule module or an ${NODE_DESCRIPTION}`,
      );
    }

    const authored = [...segments.slice(0, -1), leaf.slice(0, -".mjs".length)];
    const parsed = authored.map((segment) => parseSegment(segment, modulePath));

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

    // A path containing `[...name]` is a constraint. Everything else is
    // structural. That single signal decides how the leaf is read.
    if (recursive.length === 1) {
      const directory = parsed.slice(0, -1);
      const { name, extensions } = splitConstraintLeaf(authored[authored.length - 1]!, modulePath);
      const module = await loadModule(absoluteModule, modulePath, false);
      const prefix = directory.map((segment) => segment.shape).join("/");

      for (const extension of extensions) {
        constraints.push({
          modulePath,
          name,
          directory,
          extension,
          pattern: `${prefix === "" ? "" : `${prefix}/`}*.${extension}`,
          module,
        });
      }
      continue;
    }

    const leafSegment = parsed[parsed.length - 1]!;
    if (/\{[^}]*\}/.test(leafSegment.source)) {
      fail(
        "extension_list_on_structural_leaf",
        `${modulePath}: only constraint leaves may list extensions; a structural leaf names one file`,
      );
    }

    insert(trie, parsed, {
      modulePath,
      pattern: parsed.map((segment) => segment.shape).join("/"),
      module: await loadModule(absoluteModule, modulePath, true),
    });
  }

  checkSiblings(trie, "");

  return { root: trie, constraints, nodes };
}
