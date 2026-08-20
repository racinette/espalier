// Ownership, requiredness, and the deepest recognized node.
// docs/MATCHING.MD "Ownership", "What must exist", "The deepest recognized node".

import type { Constraint, Espalier, StructuralRule, TrieNode } from "./compile.js";
import { matchSegment, resolveSegment, type CaptureValue } from "./pattern.js";

// Defined beside the parser, because what a capture can hold is a fact about
// segments rather than about matching. Re-exported here: every reader of an
// issue reaches for it through this module.
export type { CaptureValue } from "./pattern.js";

export interface Ownership {
  rule: StructuralRule;
  captures: Record<string, CaptureValue>;
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

function stopped(node: TrieNode, at: string[], captures: Record<string, CaptureValue>): Recognition {
  // Reaching only the root recognizes nothing, and there is nothing to report
  // beyond the violation itself.
  if (at.length === 0) return { recognized: null, captures: {}, declared: [] };
  return { recognized: at.join("/"), captures, declared: declared(node) };
}

/** Resolves the single structural owner of a path, or how far recognition got. */
export function resolve(espalier: Espalier, filePath: string): Ownership | Recognition {
  const segments = filePath.split("/");
  const walked: string[] = [];
  const captures: Record<string, CaptureValue> = {};
  let node = espalier.root;

  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;

    // A node is only a candidate if it can play the role this segment needs:
    // the final segment resolves against a file leaf, every earlier one against
    // a directory. This is what lets a dynamic directory and a dynamic leaf
    // share a parent — `clients/[provider]/client.ts` beside `clients/[list].ts`
    // — without either shadowing the other.
    const usable = (child: TrieNode): boolean =>
      last ? child.rule !== null : child.children.size > 0;

    // static > resolved > dynamic: a more specific node wins at every level.
    // docs/MATCHING.MD "Ownership".
    let next = node.children.get(segment);
    if (next !== undefined && (next.segment.dynamic || next.segment.resolved || !usable(next))) {
      next = undefined;
    }
    let bound: Record<string, string> = {};

    // A resolved node is keyed by its authored form, so it is never the exact
    // hit above; it becomes a literal only once the captures collected on the
    // way down are substituted in.
    if (next === undefined) {
      for (const child of node.children.values()) {
        if (!child.segment.resolved || !usable(child)) continue;
        if (resolveSegment(child.segment, captures) === segment) {
          next = child;
          break;
        }
      }
    }

    if (next === undefined) {
      for (const child of node.children.values()) {
        if (!child.segment.dynamic || !usable(child)) continue;
        const found = matchSegment(child.segment, segment, captures);
        if (found !== null) {
          next = child;
          bound = found;
          break;
        }
      }
    }

    if (next === undefined) return stopped(node, walked, captures);

    node = next;
    walked.push(node.display);
    Object.assign(captures, bound);

    if (last) {
      if (node.rule === null) return stopped(node, walked, captures);
      return { rule: node.rule, captures };
    }
  }

  return stopped(node, walked, captures);
}

export function isOwnership(result: Ownership | Recognition): result is Ownership {
  return "rule" in result;
}

export interface RequiredFile {
  path: string;
  rule: StructuralRule;
  captures: Record<string, CaptureValue>;
}

/**
 * Every file the espalier requires to exist.
 *
 * Static leaves are required unless their module marks them `optional`.
 * Dynamic leaves are collections and require nothing. A dynamic directory
 * requires nothing until it is instantiated — after which its static
 * descendants are required, for that instance only.
 */
export function requiredFiles(espalier: Espalier, visible: Set<string>): RequiredFile[] {
  const required: RequiredFile[] = [];
  const paths = [...visible];

  const descend = (
    node: TrieNode,
    prefix: string,
    captures: Record<string, CaptureValue>,
  ): void => {
    for (const child of node.children.values()) {
      // A resolved segment is one filename per instance, so the path it
      // requires is the substituted one rather than the authored one.
      const here = child.segment.resolved ? resolveSegment(child.segment, captures) : child.display;
      if (here === null) continue;
      const at = prefix === "" ? here : `${prefix}/${here}`;

      if (child.rule !== null && !child.segment.dynamic && !child.rule.module.optional) {
        required.push({ path: at, rule: child.rule, captures: { ...captures } });
      }

      if (child.children.size === 0) continue;

      if (!child.segment.dynamic) {
        descend(child, at, captures);
        continue;
      }

      // Any visible file beneath an instance instantiates it.
      const instances = new Map<string, Record<string, string>>();
      const root = prefix === "" ? "" : `${prefix}/`;
      for (const candidate of paths) {
        if (!candidate.startsWith(root)) continue;
        const rest = candidate.slice(root.length);
        const cut = rest.indexOf("/");
        if (cut === -1) continue;
        const name = rest.slice(0, cut);
        if (instances.has(name)) continue;
        const bound = matchSegment(child.segment, name);
        if (bound !== null) instances.set(name, bound);
      }

      for (const [name, bound] of instances) {
        descend(child, prefix === "" ? name : `${prefix}/${name}`, { ...captures, ...bound });
      }
    }
  };

  descend(espalier.root, "", {});
  return required;
}

/**
 * Static leaves required regardless of what the repository contains. An
 * optional leaf is absent here for the same reason it is absent from
 * `requiredFiles`: nothing promises it exists, so `ignore` covering it is a
 * configuration choice rather than a contradiction.
 */
export function unconditionallyRequired(espalier: Espalier): string[] {
  const found: string[] = [];

  const descend = (node: TrieNode, prefix: string): void => {
    for (const child of node.children.values()) {
      if (child.segment.dynamic) continue;
      const under = prefix === "" ? child.display : `${prefix}/${child.display}`;
      if (child.rule !== null && !child.rule.module.optional) found.push(under);
      if (child.children.size > 0) descend(child, under);
    }
  };

  descend(espalier.root, "");
  return found;
}

/**
 * Whether a constraint applies to a path, and what its directory portion
 * captures. The leaf of a constraint is a rule name and an extension, so the
 * filename is never captured.
 */
export function constraintCaptures(
  constraint: Constraint,
  filePath: string,
): Record<string, CaptureValue> | null {
  const segments = filePath.split("/");
  const filename = segments[segments.length - 1]!;
  if (!filename.endsWith(`.${constraint.extension}`)) return null;
  if (filename.length <= constraint.extension.length + 1) return null;

  const directories = segments.slice(0, -1);
  const pattern = constraint.directory;
  const at = pattern.findIndex((segment) => segment.recursive !== null);
  const before = pattern.slice(0, at);
  const after = pattern.slice(at + 1);

  if (directories.length < before.length + after.length) return null;

  const captures: Record<string, CaptureValue> = {};

  for (const [index, segment] of before.entries()) {
    const bound = matchSegment(segment, directories[index]!);
    if (bound === null) return null;
    Object.assign(captures, bound);
  }

  const tail = directories.length - after.length;
  for (const [index, segment] of after.entries()) {
    const bound = matchSegment(segment, directories[tail + index]!);
    if (bound === null) return null;
    Object.assign(captures, bound);
  }

  captures[pattern[at]!.recursive!] = directories.slice(before.length, tail);
  return captures;
}
