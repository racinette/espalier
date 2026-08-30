// `espalier explain`. docs/cli/explain/README.MD.
//
// The direct query. Everything it reports comes from the same functions `build`
// renders with and `lint` reports through, so the three cannot disagree about
// what the espalier says.

import path from "node:path";
import type { Espalier, TrieNode } from "./compile.js";
import { fail } from "./errors.js";
import type { ConstraintAnswer, RuleAnswer } from "./explainText.js";
import { constraintCaptures, isOwnership, type CaptureValue, stopped } from "./match.js";
import type { Reporter } from "./output.js";
import { matchSegment, resolveSegment } from "./pattern.js";
import { closedSet, constraintGroups, isDirectory, mapEntries, requiredUnder, subtree } from "./render.js";
import { delegated } from "./nested.js";
import { open } from "./repository.js";
import { admitsTarget } from "./targets.js";

export interface ExplainOptions {
  cwd: string;
  config: string | undefined;
  target: string;
}

interface Descent {
  /** The deepest node reached, which is the root when nothing matched. */
  node: TrieNode;
  /** Authored segments, e.g. `clients/[provider]` for a query about `clients/stripe`. */
  authored: string[];
  captures: Record<string, CaptureValue>;
  /** How many segments were recognized. Short of the query, the walk stopped. */
  reached: number;
}

/**
 * Walks a concrete directory path into the trie. Every segment must resolve to
 * a directory, which is what distinguishes `clients/stripe` — a prefix — from
 * `clients/stripe/client.ts`, a file.
 */
function descend(espalier: Espalier, segments: string[]): Descent {
  let node = espalier.root;
  const authored: string[] = [];
  const captures: Record<string, CaptureValue> = {};

  for (const segment of segments) {
    // static > resolved > dynamic, the same specificity order ownership
    // resolves by. A directory naming itself after the instance above it is a
    // directory the espalier declares, and answering "not declared" about one
    // would be this command disagreeing with `lint`.
    let next = node.children.get(segment);
    if (
      next !== undefined &&
      (next.segment.dynamic || next.segment.resolved || !isDirectory(next))
    ) {
      next = undefined;
    }

    // A resolved node is keyed by its authored form, so it is never the exact
    // hit above; it becomes a literal only once the captures collected on the
    // way down are substituted in.
    if (next === undefined) {
      for (const child of node.children.values()) {
        if (!child.segment.resolved || !isDirectory(child)) continue;
        if (resolveSegment(child.segment, captures) === segment) {
          next = child;
          break;
        }
      }
    }

    if (next === undefined) {
      for (const child of node.children.values()) {
        if (!child.segment.dynamic || !isDirectory(child)) continue;
        const bound = matchSegment(child.segment, segment, captures);
        if (bound !== null) {
          next = child;
          Object.assign(captures, bound);
          break;
        }
      }
    }

    if (next === undefined) return { node, authored, captures, reached: authored.length };
    node = next;
    authored.push(node.display);
  }

  return { node, authored, captures, reached: authored.length };
}

/**
 * A constraint is listed under a prefix when its static prefix and the queried
 * prefix are prefixes of one another — when the subtree could contain a file it
 * matches. Deliberately generous: a constraint that reaches a subtree but
 * happens to match nothing there today will match the next file added.
 */
function reaches(constraintPrefix: string, target: string): boolean {
  if (constraintPrefix === "" || target === "") return true;
  if (constraintPrefix === target) return true;
  return constraintPrefix.startsWith(`${target}/`) || target.startsWith(`${constraintPrefix}/`);
}

export async function explain(options: ExplainOptions, reporter: Reporter): Promise<number> {
  const repository = await open(options.config, options.cwd);
  const { espalier } = repository;

  const absolute = path.resolve(options.cwd, options.target);
  const target = path.relative(repository.config.root, absolute).split(path.sep).join("/");

  if (target === ".." || target.startsWith("../") || path.isAbsolute(target)) {
    fail("path_outside_repository", `${options.target} is outside the repository`);
  }

  // The espalier that answers is the nearest one at or above the path, so the
  // answer does not depend on the directory the command ran in.
  // docs/cli/explain/README.MD "Nested espaliers".
  const child = repository.children.find(
    (at) => target === at || target.startsWith(`${at}/`),
  );
  if (child !== undefined) {
    return await explain(
      {
        cwd: path.join(repository.config.root, child),
        config: undefined,
        // A trailing slash is the reader asking for a prefix, and resolving the
        // path away would silently change the question.
        target: absolute + (options.target.endsWith("/") ? "/" : ""),
      },
      delegated(reporter, child),
    );
  }

  const groups = constraintGroups(espalier);
  const segments = target === "" ? [] : target.split("/");
  const walk = descend(espalier, segments);
  // A prefix the espalier declares. Short of that, the walk stopped somewhere
  // above, and what it reached is the answer rather than the prefix.
  const found = walk.reached === segments.length ? walk : null;

  // A trailing slash always means a prefix. Without one, it is a prefix if the
  // espalier recognizes a directory there and no structural rule owns the path
  // as a file. Both can be true at once: where a dynamic directory sits beside
  // a dynamic leaf, `clients/registry.ts` matches `clients/[provider]` as
  // readily as `clients/[summary].ts`, and the file is the better answer —
  // something owns it, and that owner is what the reader asked about.
  // A trailing slash, or `.`, asks about a directory. The question stands even
  // where nothing answers it: a name the espalier declares as a file is not a
  // directory, and reporting its rule would answer something else.
  const spelled = options.target.endsWith("/") || options.target === "." || target === "";
  const asPrefix = spelled || (found !== null && !isOwnership(repository.resolve(target)));

  // Exclusion is checked before declaration for a prefix exactly as it is for a
  // path below, so the two forms of one question cannot give two answers.
  const ignored = repository.ungoverned(target, true);
  if (asPrefix && ignored !== null) {
    reporter.explanation({
      kind: "explanation",
      espalier: null,
      path: `${target}/`,
      ignoredBy: ignored,
      rule: null,
      pattern: null,
      captures: {},
      constraints: [],
    });
    return 1;
  }

  if (asPrefix) {
    // Nothing declares this prefix. The same answer a path nothing declares
    // gets, in the same words, and no constraints — a constraint runs on files
    // a structural rule owns, and nothing here owns anything.
    // docs/cli/explain/README.MD "A prefix the espalier does not recognize".
    if (found === null) {
      const recognition = stopped(walk.node, walk.authored, walk.captures);
      reporter.explanation({
        kind: "explanation",
        espalier: null,
        path: `${target}/`,
        rule: null,
        pattern: null,
        captures: recognition.captures,
        recognized: recognition.recognized,
        declared: recognition.declared,
        constraints: [],
      });
      return 1;
    }

    const prefix = target === "" ? "" : `${target}/`;
    const doc = espalier.nodes.get(found.authored.join("/"));
    const required = new Set(requiredUnder(found.node));

    const rules: RuleAnswer[] = [...subtree(found.node)]
      .filter((visit) => visit.node.rule !== null)
      .map((visit) => ({
        path: `${prefix}${visit.at}`,
        pattern: visit.node.rule!.pattern,
        rule: visit.node.rule!.modulePath,
        description: visit.node.rule!.module.description,
        ruleText: visit.node.rule!.module.rule.trim(),
        example: visit.node.rule!.module.example,
        exampleSource: visit.node.rule!.module.exampleSource,
        required: required.has(visit.at),
      }));

    reporter.explanation({
      kind: "explanation",
      espalier: null,
      prefix,
      description: doc?.description ?? null,
      body: doc?.body ?? "",
      captures: found.captures,
      rules,
      map: mapEntries(espalier, found.node, found.authored.join("/")),
      closedSet: closedSet(target),
      // Named for the reason a generated document names them: the sentence
      // above is absolute, and a boundary the reader can see has to be one the
      // answer accounts for. docs/cli/build/README.MD "Governed elsewhere".
      governed: repository.children
        .filter((child) => target === "" || child === target || child.startsWith(`${target}/`))
        .map((child) => `${child.slice(prefix.length)}/`)
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
      constraints: groups
        .filter((group) => reaches(group.prefix, target))
        .map(({ members: _members, prefix: _prefix, aggregate, targets, ...summary }) => ({
          ...summary,
          ...(aggregate ? { aggregate: true as const } : {}),
          ...(targets === null ? {} : { targets }),
        })),
    });

    return rules.length > 0 ? 0 : 1;
  }

  const excluded = repository.ungoverned(target);
  if (excluded !== null) {
    reporter.explanation({
      kind: "explanation",
      espalier: null,
      path: target,
      ignoredBy: excluded,
      rule: null,
      pattern: null,
      captures: {},
      constraints: [],
    });
    return 1;
  }

  const owner = repository.resolve(target);

  if (!isOwnership(owner)) {
    // A constraint only runs on a file that has a structural owner, so listing
    // the ones whose patterns happen to match would describe rules that will
    // never run on it.
    reporter.explanation({
      kind: "explanation",
      espalier: null,
      path: target,
      rule: null,
      pattern: null,
      captures: owner.captures,
      recognized: owner.recognized,
      declared: owner.declared,
      constraints: [],
    });
    return 1;
  }

  const constraints: ConstraintAnswer[] = [];
  for (const { members, prefix: _prefix, aggregate, targets, ...summary } of groups) {
    for (const member of members) {
      const captures = constraintCaptures(member, target);
      if (captures === null || !admitsTarget(member, target)) continue;
      constraints.push({
        ...summary,
        captures,
        ...(aggregate ? { aggregate: true as const } : {}),
        ...(targets === null ? {} : { targets }),
      });
      break;
    }
  }

  reporter.explanation({
    kind: "explanation",
    espalier: null,
    path: target,
    rule: owner.rule.modulePath,
    pattern: owner.rule.pattern,
    captures: owner.captures,
    description: owner.rule.module.description,
    ruleText: owner.rule.module.rule.trim(),
    example: owner.rule.module.example,
    exampleSource: owner.rule.module.exampleSource,
    constraints,
  });

  return 0;
}
