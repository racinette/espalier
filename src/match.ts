// Ownership, requiredness, and the deepest recognized node.
// docs/MATCHING.MD "Ownership", "What must exist", "The deepest recognized node".

import { contractDirectories, declaredGroup, declaredGroups, directoryFrozen, rootGrouping, NODE_DESCRIPTION, type Constraint, type Espalier, type GroupInstance, type Grouping, type StructuralRule, type TrieNode } from "./compile.js";
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

/** A declared group that must have members in one concrete directory. docs/INSTANCES.MD "Declaring a group". */
export interface RequiredGroup {
  /** Concrete containing directory; empty at the repository root. */
  path: string;
  /** The rule that declares the grouping, which may be inherited. */
  rule: StructuralRule;
  grouping: Grouping;
  instance: GroupInstance;
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
): { files: RequiredFile[]; collections: RequiredCollection[]; directories: string[]; groups: RequiredGroup[] } {
  const files: RequiredFile[] = [];
  const groups: RequiredGroup[] = [];
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

      if (child.rule !== null && child.segment.dynamic) {
        // A group the contract and the instance both declare is required once,
        // when either requires it, and named by the nearest declaration.
        const seen = new Map<Grouping, Set<string>>();
        for (const rule of [...(child.rule.inherited ?? []), child.rule].reverse()) {
          for (const grouping of rule.module.groups) {
            const named = seen.get(rootGrouping(grouping)) ?? new Set<string>();
            seen.set(rootGrouping(grouping), named);
            for (const instance of declaredGroups(grouping, prefix)) {
              const key = JSON.stringify(grouping.by.map((name) => instance.captures[name]));
              if (instance.module.optional || named.has(key)) continue;
              named.add(key);
              groups.push({ path: prefix, rule, grouping, instance });
            }
          }
        }
      }
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
  return { files, collections, directories, groups };
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

/** Whether a file keeps its content, and the module whose `frozen` export decided it. */
export interface Freeze {
  frozen: boolean;
  by: string | null;
}

/**
 * Whether an owned file is frozen. The most specific statement wins: a rule
 * before the contract it declares an instance of, and a rule's declared
 * groups, which hold some of its files, before the rule itself; then the
 * nearest directory module above it. Declared groups that share a file agree
 * on `frozen`, as compilation checks. docs/LOCKS.MD "Frozen files".
 */
export function fileFrozen(espalier: Espalier, filePath: string, owner: Ownership): Freeze {
  const cut = filePath.lastIndexOf("/");
  const directory = cut === -1 ? "" : filePath.slice(0, cut);
  for (const { rule, captures } of structuralChecks(owner.rule, filePath, owner.captures).reverse()) {
    for (const grouping of rule.module.groups) {
      const declared = declaredGroup(grouping, captures, directory);
      if (declared?.module.frozenExport !== undefined) return { frozen: declared.module.frozenExport, by: declared.modulePath };
    }
    if (rule.module.frozenExport !== undefined) return { frozen: rule.module.frozenExport, by: rule.modulePath };
  }
  const found = resolveDirectory(espalier, directory);
  if (!isDirectoryOwnership(found)) return { frozen: false, by: null };
  const decided = directoryFrozen(espalier.nodes, found.path);
  return { frozen: decided.locked, by: decided.by };
}

/** One sealed collection a file belongs to. docs/LOCKS.MD "Sealed collections". */
export interface Seal {
  /** Which collection: its module, and for a directory or grouping, which one. */
  key: string;
  /** The module whose `sealed` export sealed it; a grouping as `module groups.name`. */
  by: string;
  /** For a grouping, the file's group: only a group joining or leaving changes it. */
  group?: string;
}

/**
 * The sealed directories a directory lies in, itself included, outermost
 * first. At each level the directory's own statement comes before its
 * contract's, as for `frozen`; one saying `sealed = false` takes the subtree
 * out of every seal above it, and a seal below it counts again.
 */
export function directorySeals(espalier: Espalier, directoryPath: string): Seal[] {
  const parts = directoryPath.split("/").filter(Boolean);
  const found = resolveDirectory(espalier, parts.join("/"));
  const authored = (isDirectoryOwnership(found) ? found.path : found.recognized ?? "").split("/").filter(Boolean);
  const seals: Seal[] = [];
  levels: for (let depth = authored.length; depth >= 0; depth -= 1) {
    for (const at of contractDirectories(espalier.nodes, authored.slice(0, depth).join("/"))) {
      const sealed = espalier.nodes.get(at)?.sealed;
      if (sealed === undefined) continue;
      if (!sealed) break levels;
      seals.unshift({ key: `directory ${parts.slice(0, depth).join("/")}`, by: at === "" ? NODE_DESCRIPTION : `${at}/${NODE_DESCRIPTION}` });
      break;
    }
  }
  return seals;
}

/**
 * Every sealed collection a path belongs to. A sealed directory holds every
 * file beneath it, owned or not; a sealed rule the files it owns, a contract
 * its instances' too; a sealed grouping its groups; a sealed declared group
 * its files. Seals are never inherited: each is the collection's own.
 */
export function fileSeals(espalier: Espalier, filePath: string, owner: Ownership | Recognition): Seal[] {
  const cut = filePath.lastIndexOf("/");
  const directory = cut === -1 ? "" : filePath.slice(0, cut);
  const seals = directorySeals(espalier, directory);
  if (!isOwnership(owner)) return seals;
  for (const { rule, captures } of structuralChecks(owner.rule, filePath, owner.captures)) {
    if (rule.module.sealed === true) seals.push({ key: `rule ${rule.modulePath}`, by: rule.modulePath });
    for (const grouping of rule.module.groups) {
      if (grouping.sealed) {
        seals.push({
          key: `grouping ${rule.modulePath} ${grouping.name}`,
          by: `${rule.modulePath} groups.${grouping.name}`,
          group: JSON.stringify([directory, ...grouping.by.map((name) => captures[name] ?? null)]),
        });
      }
      const declared = declaredGroup(grouping, captures, directory);
      if (declared?.module.sealed === true) seals.push({ key: `group ${declared.modulePath}`, by: declared.modulePath });
    }
  }
  return seals;
}
