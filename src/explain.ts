// `espalier explain`. docs/cli/explain/README.MD.
//
// The direct query. Everything it reports comes from the same functions `build`
// renders with and `lint` reports through, so the three cannot disagree about
// what the espalier says.

import path from "node:path";
import type { Espalier, TrieNode } from "./compile.js";
import { fail } from "./errors.js";
import type { ConstraintAnswer, RuleAnswer } from "./explainText.js";
import { constraintCaptures, isOwnership, type CaptureValue } from "./match.js";
import type { Reporter } from "./output.js";
import { matchSegment, resolveSegment } from "./pattern.js";
import { cardinality, constraintGroups, isDirectory, requiredUnder, subtree } from "./render.js";
import { delegated } from "./nested.js";
import { open } from "./repository.js";

export interface ExplainOptions {
  cwd: string;
  config: string | undefined;
  target: string;
}

interface Descent {
  node: TrieNode;
  /** Authored path, e.g. `clients/[provider]` for a query about `clients/stripe`. */
  authored: string;
  captures: Record<string, CaptureValue>;
}

/**
 * Walks a concrete directory path into the trie. Every segment must resolve to
 * a directory, which is what distinguishes `clients/stripe` — a prefix — from
 * `clients/stripe/client.ts`, a file.
 */
function descend(espalier: Espalier, segments: string[]): Descent | null {
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

    if (next === undefined) return null;
    node = next;
    authored.push(node.display);
  }

  return { node, authored: authored.join("/"), captures };
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
  const found = descend(espalier, segments);

  // A trailing slash always means a prefix. Without one, it is a prefix if the
  // espalier recognizes a directory there and no structural rule owns the path
  // as a file. Both can be true at once: where a dynamic directory sits beside
  // a dynamic leaf, `clients/registry.ts` matches `clients/[provider]` as
  // readily as `clients/[summary].ts`, and the file is the better answer —
  // something owns it, and that owner is what the reader asked about.
  const asPrefix =
    options.target.endsWith("/") ||
    options.target === "." ||
    target === "" ||
    (found !== null && !isOwnership(repository.resolve(target)));

  if (asPrefix) {
    const prefix = target === "" ? "" : `${target}/`;
    const doc = found === null ? undefined : espalier.nodes.get(found.authored);
    const required = found === null ? new Set<string>() : new Set(requiredUnder(found.node));

    const rules: RuleAnswer[] =
      found === null
        ? []
        : [...subtree(found.node)]
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
      captures: found?.captures ?? {},
      rules,
      cardinality:
        found === null
          ? null
          : cardinality(
              found.node,
              target,
              repository.children.some(
                (child) => target === "" || child === target || child.startsWith(`${target}/`),
              ),
            ),
      constraints: groups
        .filter((group) => reaches(group.prefix, target))
        .map(({ members: _members, prefix: _prefix, ...summary }) => summary),
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
  for (const { members, prefix: _prefix, ...summary } of groups) {
    for (const member of members) {
      const captures = constraintCaptures(member, target);
      if (captures === null) continue;
      constraints.push({ ...summary, captures });
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
