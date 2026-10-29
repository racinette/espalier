// Ownership, requiredness, and the deepest recognized node.
// docs/MATCHING.MD "Ownership", "What must exist", "The deepest recognized node".

import type { Constraint, Espalier, StructuralRule, TrieNode } from "./compile.js";
import { captureNames, isStrictSubset, matchSegment, resolveSegment, type CaptureValue } from "./pattern.js";

// Defined beside the parser, because what a capture can hold is a fact about
// segments rather than about matching. Re-exported here: every reader of an
// issue reaches for it through this module.
export type { CaptureValue } from "./pattern.js";

/** A concrete directory an abstract dynamic directory matched without a declaration. */
export interface UndeclaredDirectory {
  /** Concrete repository path, e.g. `app/blog`. */
  path: string;
  /** The authored contract it matched, e.g. `app/[route]`. */
  contract: string;
}

export interface Ownership {
  rule: StructuralRule;
  captures: Record<string, CaptureValue>;
  /** Directories on the way down that an abstract contract matched anonymously. */
  undeclared?: UndeclaredDirectory[];
}

export interface DirectoryOwnership {
  node: TrieNode;
  /** Authored directory path, e.g. `clients/[provider]`; empty at the root. */
  path: string;
  captures: Record<string, CaptureValue>;
  /** Directories on the way down, this one included, that an abstract contract matched anonymously. */
  undeclared?: UndeclaredDirectory[];
}

/** How far the espalier recognized a path before it stopped. */
export interface Recognition {
  /** Authored form, e.g. `clients/[provider]`. Null when the walk reached only the root. */
  recognized: string | null;
  captures: Record<string, CaptureValue>;
  declared: string[];
}

/** What is declared at a node: every child, directories with a trailing `/`, sorted. */
function declared(node: TrieNode): string[] {
  return [...node.children.values()]
    .map((child) => (child.rule === null ? `${child.display}/` : child.display))
    .sort();
}

/**
 * How far recognition got, for a walk that did not finish. Shared with
 * `explain`, so a prefix nothing declares is answered in the same terms as a
 * path nothing declares. docs/cli/explain/README.MD "A prefix the espalier
 * does not recognize".
 */
export function stopped(
  node: TrieNode,
  at: string[],
  captures: Record<string, CaptureValue>,
): Recognition {
  // Reaching only the root recognizes nothing, and there is nothing to report
  // beyond the violation itself.
  if (at.length === 0) return { recognized: null, captures: {}, declared: [] };
  return { recognized: at.join("/"), captures, declared: declared(node) };
}

/** One winner for ownership, directory queries, and requiredness. */
function selectChild(
  node: TrieNode,
  name: string,
  captures: Record<string, CaptureValue>,
  directory: boolean,
): { node: TrieNode; captures: Record<string, string> } | null {
  const usable = (child: TrieNode): boolean =>
    directory ? child.children.size > 0 || child.directory === true : child.rule !== null;
  const exact = node.children.get(name);
  if (exact !== undefined && !exact.segment.dynamic && !exact.segment.resolved && usable(exact)) {
    return { node: exact, captures: exact.baseSegment ? matchSegment(exact.baseSegment, name, captures) ?? {} : {} };
  }
  for (const child of node.children.values()) {
    if (child.segment.resolved && usable(child) && resolveSegment(child.segment, captures) === name) {
      return { node: child, captures: child.baseSegment ? matchSegment(child.baseSegment, name, captures) ?? {} : {} };
    }
  }
  let winner: { node: TrieNode; captures: Record<string, string> } | null = null;
  for (const child of node.children.values()) {
    if (!child.segment.dynamic || !usable(child)) continue;
    const found = matchSegment(child.segment, name, captures);
    if (found !== null && (winner === null || isStrictSubset(child.segment, winner.node.segment))) {
      winner = { node: child, captures: found };
    }
  }
  return winner;
}

/** Resolves the single structural owner of a path, or how far recognition got. */
export function resolve(espalier: Espalier, filePath: string): Ownership | Recognition {
  const segments = filePath.split("/");
  const walked: string[] = [];
  const captures: Record<string, CaptureValue> = {};
  const undeclared: UndeclaredDirectory[] = [];
  let node = espalier.root;

  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;

    // A node is only a candidate if it can play the role this segment needs:
    // the final segment resolves against a file leaf, every earlier one against
    // a directory. This is what lets a dynamic directory and a dynamic leaf
    // share a parent — `clients/[provider]/client.ts` beside `clients/[list].ts`
    // — without either shadowing the other.
    const next = selectChild(node, segment, captures, !last);
    if (next === null) return stopped(node, walked, captures);

    node = next.node;
    walked.push(node.display);
    Object.assign(captures, next.captures);

    if (last) {
      if (node.rule === null) return stopped(node, walked, captures);
      return { rule: node.rule, captures, ...(undeclared.length === 0 ? {} : { undeclared }) };
    }
    if (node.abstract === true && node.segment.dynamic) {
      undeclared.push({ path: segments.slice(0, index + 1).join("/"), contract: walked.join("/") });
    }
  }

  // Unreachable: `split` yields at least one segment, and the last iteration
  // always returns. Present because the compiler cannot see that, and left
  // consistent with the in-loop answer so it stays harmless if that changes.
  return stopped(node, walked, captures);
}

export function isOwnership(result: Ownership | Recognition): result is Ownership {
  return "rule" in result;
}

/** Resolves one concrete directory to the structural node that declares its contents. */
export function resolveDirectory(
  espalier: Espalier,
  directoryPath: string,
): DirectoryOwnership | Recognition {
  if (directoryPath === "") return { node: espalier.root, path: "", captures: {} };

  const segments = directoryPath.split("/");
  const walked: string[] = [];
  const captures: Record<string, CaptureValue> = {};
  const undeclared: UndeclaredDirectory[] = [];
  let node = espalier.root;

  for (const [index, segment] of segments.entries()) {
    const next = selectChild(node, segment, captures, true);
    if (next === null) return stopped(node, walked, captures);
    node = next.node;
    walked.push(node.display);
    Object.assign(captures, next.captures);
    if (node.abstract === true && node.segment.dynamic) {
      undeclared.push({ path: segments.slice(0, index + 1).join("/"), contract: walked.join("/") });
    }
  }

  return { node, path: walked.join("/"), captures, ...(undeclared.length === 0 ? {} : { undeclared }) };
}

export function isDirectoryOwnership(
  result: DirectoryOwnership | Recognition,
): result is DirectoryOwnership {
  return "node" in result;
}

export interface RequiredFile {
  path: string;
  rule: StructuralRule;
  captures: Record<string, CaptureValue>;
}

export interface RequiredCollection {
  /** Concrete containing directory; empty at the repository root. */
  path: string;
  /** Declaration with concrete directory instances and an authored leaf pattern. */
  declared: string;
  rule: StructuralRule;
  captures: Record<string, CaptureValue>;
}

/**
 * Required named files and collections under a concrete directory.
 * Visible files instantiate dynamic directories using the ownership winner.
 * Without a visible set (as in create), only static/resolved directories descend.
 */
export function requirements(
  node: TrieNode,
  prefix: string,
  captures: Record<string, CaptureValue>,
  visible: ReadonlySet<string> = new Set(),
  directoryExists: (path: string) => boolean = () => false,
  includeOptionalFiles = false,
): { files: RequiredFile[]; collections: RequiredCollection[]; directories: string[] } {
  const files: RequiredFile[] = [];
  const directories: string[] = [];
  const collections: RequiredCollection[] = [];
  const paths = [...visible];

  const descend = (
    parent: TrieNode,
    prefix: string,
    captures: Record<string, CaptureValue>,
  ): void => {
    for (const child of parent.children.values()) {
      const here = child.segment.resolved ? resolveSegment(child.segment, captures) : child.display;
      if (here === null) continue;
      const at = prefix === "" ? here : `${prefix}/${here}`;

      if (child.rule !== null && (!child.rule.module.optional || includeOptionalFiles)) {
        if (child.segment.dynamic) {
          if (!child.rule.module.optional) collections.push({ path: prefix, declared: at, rule: child.rule, captures: { ...captures } });
        } else {
          files.push({ path: at, rule: child.rule, captures: { ...captures, ...(child.baseSegment ? matchSegment(child.baseSegment, here, captures) ?? {} : {}) } });
        }
      }

      if (child.instanceOf !== undefined) {
        const present = directoryExists(at) || paths.some((candidate) => candidate.startsWith(`${at}/`));
        if (child.optional && !present) continue;
        if (!child.optional) directories.push(at);
      }
      if (child.children.size === 0) continue;
      if (!child.segment.dynamic) {
        const bound = child.baseSegment ? matchSegment(child.baseSegment, here, captures) ?? {} : {};
        descend(child, at, { ...captures, ...bound });
        continue;
      }

      // Any governed file beneath the winning instance instantiates it.
      const instances = new Map<string, Record<string, string>>();
      const root = prefix === "" ? "" : `${prefix}/`;
      for (const candidate of paths) {
        if (!candidate.startsWith(root)) continue;
        const rest = candidate.slice(root.length);
        const cut = rest.indexOf("/");
        if (cut === -1) continue;
        const name = rest.slice(0, cut);
        if (instances.has(name)) continue;
        const winner = selectChild(parent, name, captures, true);
        if (winner?.node === child) instances.set(name, winner.captures);
      }
      for (const [name, bound] of instances) {
        descend(child, prefix === "" ? name : `${prefix}/${name}`, { ...captures, ...bound });
      }
    }
  };

  descend(node, prefix, captures);
  return { files, collections, directories };
}

/** Required named leaves for creation, without inventing dynamic instances. */
export function requiredDescendants(
  node: TrieNode,
  prefix: string,
  captures: Record<string, CaptureValue>,
): RequiredFile[] {
  return requirements(node, prefix, captures).files.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Static leaves required regardless of what the repository contains. An
 * optional leaf is absent here for the same reason it is absent from
 * `requirements`: nothing promises it exists, so `ignore` covering it is a
 * configuration choice rather than a contradiction.
 */
export function unconditionallyRequired(espalier: Espalier): string[] {
  return requirements(espalier.root, "", {}).files.map((entry) => entry.path);
}

/**
 * Whether a constraint applies to a path, and what its directory portion
 * captures. The leaf is a rule name, not a placeholder, so the filename is
 * never captured. Either execution mode may require a target extension.
 */
export function constraintCaptures(
  constraint: Constraint,
  filePath: string,
): Record<string, CaptureValue> | null {
  const segments = filePath.split("/");
  const filename = segments[segments.length - 1]!;
  if (constraint.extension !== null) {
    const suffix = `.${constraint.extension}`;
    if (!filename.endsWith(suffix)) return null;
    const stem = filename.slice(0, -suffix.length);
    if (stem === "" || stem.includes(".")) return null;
  }

  const directories = segments.slice(0, -1);
  const pattern = constraint.directory;
  const at = pattern.findIndex((segment) => segment.recursive !== null);
  const before = pattern.slice(0, at);
  const after = pattern.slice(at + 1);

  if (directories.length < before.length + after.length) return null;

  // Segments are matched in path order, and each is handed what the ones
  // before it captured: a `{name}` resolves against the text its `[name]`
  // already bound. Compilation guarantees the placeholder comes first, and
  // excludes the recursive one, so nothing here refers forward.
  const captures: Record<string, CaptureValue> = {};

  for (const [index, segment] of before.entries()) {
    const bound = matchSegment(segment, directories[index]!, captures);
    if (bound === null) return null;
    Object.assign(captures, bound);
  }

  const tail = directories.length - after.length;
  for (const [index, segment] of after.entries()) {
    const bound = matchSegment(segment, directories[tail + index]!, captures);
    if (bound === null) return null;
    Object.assign(captures, bound);
  }

  captures[pattern[at]!.recursive!] = directories.slice(before.length, tail);
  return captures;
}

/** Every inherited check keeps its authored pattern and capture namespace. */
export function structuralChecks(rule: StructuralRule, target: string, bindings: Record<string, CaptureValue>): Ownership[] {
  return [...(rule.inherited ?? []), rule].map((source) => {
    const captures: Record<string, CaptureValue> = { ...bindings };
    const parts = target.split("/");
    for (const [index, segment] of (source.segments ?? []).entries()) {
      Object.assign(captures, matchSegment(segment, parts[index] ?? "", captures) ?? {});
    }
    // Base callbacks receive only captures declared by their own source path.
    const names = new Set((source.segments ?? []).flatMap(captureNames));
    const own = source === rule ? captures : Object.fromEntries(Object.entries(captures).filter(([name]) => names.has(name)));
    return { rule: source, captures: own };
  });
}
