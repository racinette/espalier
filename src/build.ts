// `espalier build`. docs/cli/build/README.MD.
//
// Renders every document in memory first, then decides what to do with the
// filesystem. Nothing is written until every placement point of every espalier
// has been checked, because a run that fails halfway leaves a half-built
// documentation set and the user cannot see which half.
//
// The set, not this espalier's: a child that will not compile means no
// documents at all. Unlike `lint`, which writes to a stream that ends with the
// run, what `build` writes outlives it — and a root document sending readers
// into a directory with nothing in it says nothing about why.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fail } from "./errors.js";
import { IGNORE_FILENAME } from "./config.js";
import { collectCandidates, PROVENANCE } from "./files.js";
import { ignores, type IgnoreRule } from "./ignore.js";
import type { Reporter } from "./output.js";
import { eachChild } from "./nested.js";
import {
  assignChildren,
  plan,
  renderDistributed,
  renderInline,
  type ExclusionGroup,
  type Outside,
  type Placement,
} from "./render.js";
import { open, type Repository } from "./repository.js";

export interface BuildOptions {
  cwd: string;
  config: string | undefined;
  check: boolean;
  inline: boolean;
}

/**
 * A documentation file's contents, or null when it will not open.
 *
 * Unreachable in a single run: the walk found the path a moment ago. It guards
 * the gap between finding and reading, which is a gap only another process can
 * widen — and a `build` that threw there would be a build that failed over a
 * file it was about to overwrite anyway.
 */
function read(absolute: string): string | null {
  try {
    return readFileSync(absolute, "utf8");
  } catch {
    return null;
  }
}

/**
 * The outer espalier, then every child below it. docs/cli/build/README.MD
 * "Nested espaliers".
 *
 * `--inline` is the invocation's, not the configuration's, so it is not passed
 * down: a child renders as its own config says to. Everything else about a
 * child run is the child's already.
 */
/** One espalier's rendered documents, and what is already on disk beside them. */
interface Plan {
  /** Absolute root of the espalier this belongs to. */
  root: string;
  /** Reports through it, already re-rooted to where the command was invoked. */
  reporter: Reporter;
  planned: Map<string, string>;
  existing: Map<string, string>;
  orphans: string[];
}

/**
 * Plans every espalier, then applies them — or, if any one of them could not be
 * planned, applies none.
 *
 * `--inline` is the invocation's, not the configuration's, so it is not passed
 * down: a child renders as its own config says to. Everything else about a
 * child run is the child's already.
 */
export async function build(options: BuildOptions, reporter: Reporter): Promise<number> {
  const repository = await open(options.config, options.cwd);
  const plans: Plan[] = [];

  const collect = async (
    where: Repository,
    inline: boolean,
    into: Reporter,
  ): Promise<number> => {
    plans.push(planFor(where, { ...options, inline }, into));

    // A child that cannot be planned is reported and the walk carries on, so a
    // run that writes nothing still names all of what is wrong.
    return await eachChild(
      where.config.root,
      where.children,
      into,
      async (childRoot, childReporter) =>
        await collect(await open(undefined, childRoot), false, childReporter),
    );
  };

  const failed = await collect(repository, options.inline, reporter);

  if (options.check) {
    // Nothing durable is produced either way, so a failure elsewhere is no
    // reason to withhold the drift this found.
    const drifted = plans.reduce((count, entry) => count + reportDrift(entry), 0);
    return failed === 2 ? 2 : drifted === 0 ? 0 : 1;
  }

  if (failed === 2) return 2;

  for (const entry of plans) apply(entry);
  return 0;
}

/**
 * Materialized exclusion policy at its narrowest scope, and the entries
 * espalier itself owns beside each generated document. Only positive rules that
 * finally excluded something during the repository walk are useful to a reader
 * of the generated document.
 * docs/cli/build/README.MD "Other repository paths".
 */
interface ScopedExclusionGroup extends ExclusionGroup {
  scopes: string[];
}

function ignoreScope(rule: IgnoreRule): string {
  let glob = rule.pattern.trim();
  if (glob.startsWith("!")) glob = glob.slice(1);
  const rooted = glob.startsWith("/");
  if (rooted) glob = glob.slice(1);
  if (glob.endsWith("/")) glob = glob.slice(0, -1);

  // A bare name floats at every depth below its ignore file. An anchored path
  // can be narrowed only through literal segments before its first wildcard.
  if (!rooted && !glob.includes("/")) return rule.base;
  const fixed: string[] = [];
  for (const segment of glob.split("/")) {
    if (segment === "" || /[*?[]/.test(segment)) break;
    fixed.push(segment);
  }
  return [rule.base, ...fixed].filter(Boolean).join("/");
}

function exclusionGroups(rules: IgnoreRule[]): ScopedExclusionGroup[] {
  const groups: ScopedExclusionGroup[] = [];
  let previous: IgnoreRule | null = null;

  for (const rule of rules) {
    const sameGroup =
      previous !== null &&
      previous.origin === rule.origin &&
      previous.group === rule.group &&
      previous.comment === rule.comment;
    if (sameGroup) {
      groups[groups.length - 1]!.rules.push(rule.pattern);
      groups[groups.length - 1]!.scopes.push(ignoreScope(rule));
    } else {
      groups.push({ rules: [rule.pattern], reason: rule.comment, scopes: [ignoreScope(rule)] });
    }
    previous = rule;
  }

  return groups;
}

function commonScope(scopes: string[]): string {
  if (scopes.length === 0) return "";
  const parts = scopes.map((scope) => (scope === "" ? [] : scope.split("/")));
  const shared: string[] = [];
  for (let index = 0; index < parts[0]!.length; index += 1) {
    const segment = parts[0]![index]!;
    if (!parts.every((entry) => entry[index] === segment)) break;
    shared.push(segment);
  }
  return shared.join("/");
}

function pointFor(points: Placement[], scope: string): Placement {
  return points
    .filter((point) => point.at === "" || scope === point.at || scope.startsWith(`${point.at}/`))
    .sort((left, right) => left.at.length - right.at.length)
    .at(-1)!;
}

function linkFrom(at: string, target: string): string {
  const relative = path.posix.relative(at === "" ? "." : at, target);
  return relative
    .split("/")
    .map((segment) => (segment === ".." ? segment : encodeURIComponent(segment)))
    .join("/");
}

function generatedReason(repository: Repository, point: Placement): string {
  const source =
    point.at === ""
      ? repository.config.espalierRoot
      : `${repository.config.espalierRoot}/${point.at}`;
  const fixed = "Generated repository guidance; edits here will be overwritten.";
  const href = linkFrom(point.at, `${source}/ESPALIER.MD`);
  return point.doc === null
    ? `${fixed} Create [\`ESPALIER.MD\`](${href}) to add persistent guidance to this document.`
    : `${fixed} Modify [\`ESPALIER.MD\`](${href}) to change this document's persistent guidance.`;
}

function outsideAt(
  repository: Repository,
  points: Placement[],
  filename: string,
  inline: boolean,
): Map<string, Outside> {
  const { root, espalierRoot, configPath } = repository.config;
  const configRelative = path.relative(root, configPath).split(path.sep).join("/");
  const MACHINERY = "Sources used to generate and check this repository guidance.";
  const machinery = new Set([configRelative, espalierRoot, ...repository.config.ignoreFiles]);
  if (existsSync(path.join(root, IGNORE_FILENAME))) machinery.add(IGNORE_FILENAME);

  const exclusions = new Map<string, ExclusionGroup[]>();
  for (const point of points) exclusions.set(point.at, []);
  for (const group of exclusionGroups(repository.activeIgnoreRules)) {
    const target = inline ? points[0]! : pointFor(points, commonScope(group.scopes));
    exclusions.get(target.at)!.push({ rules: group.rules, reason: group.reason });
  }

  const localMachinery = new Map<string, Set<string>>();
  for (const point of points) localMachinery.set(point.at, new Set());
  for (const rule of repository.ignoreRules) {
    if (rule.base === "" || path.posix.basename(rule.origin) !== IGNORE_FILENAME) continue;
    const target = inline ? points[0]! : pointFor(points, path.posix.dirname(rule.origin));
    localMachinery.get(target.at)!.add(path.posix.relative(target.at || ".", rule.origin));
  }
  const found = new Map<string, Outside>();
  for (const point of points) {
    if (inline && point.at !== "") continue;

    const toolOwned = [
      { entries: [filename], reason: generatedReason(repository, point) },
    ];
    if (point.at === "") {
      toolOwned.push({ entries: [...machinery].sort(), reason: MACHINERY });
    }
    const nestedMachinery = localMachinery.get(point.at)!;
    if (nestedMachinery.size > 0) {
      toolOwned.push({ entries: [...nestedMachinery].sort(), reason: MACHINERY });
    }
    toolOwned.sort((left, right) =>
      left.entries[0]! < right.entries[0]! ? -1 : left.entries[0]! > right.entries[0]! ? 1 : 0,
    );

    found.set(point.at, {
      exclusions: exclusions.get(point.at)!,
      toolOwned,
    });
  }

  return found;
}

function planFor(
  repository: Repository,
  options: BuildOptions,
  reporter: Reporter,
): Plan {
  const { root, build: settings } = repository.config;
  const inline = options.inline || settings.inline;

  const points = plan(repository.espalier);

  const assigned = assignChildren(points, repository.children);
  const outside = outsideAt(repository, points, settings.filename, inline);

  const planned = new Map<string, string>();
  if (inline) {
    planned.set(
      settings.filename,
      renderInline(
        repository.espalier,
        points,
        repository.config.espalierRoot,
        repository.config.name,
        repository.children,
        outside,
      ),
    );
  } else {
    for (const point of points) {
      const at = point.at === "" ? settings.filename : `${point.at}/${settings.filename}`;
      planned.set(
        at,
        renderDistributed(
          repository.espalier,
          points,
          point,
          repository.config.espalierRoot,
          repository.config.name,
          assigned.get(point.at) ?? [],
          outside.get(point.at) ?? { exclusions: [], toolOwned: [] },
        ),
      );
    }
  }

  // Every documentation file already on disk, and whether espalier wrote it.
  // The raw walk rather than `repository.visible`, which excludes generated
  // files by design — they would otherwise be `unexpected_path` in every run —
  // and so would hide the very files this is looking for.
  const childPrefixes = repository.children.map((child) => `${child}/`);
  const existing = new Map<string, string>();
  for (const candidate of collectCandidates(root, repository.ignoreRules, repository.config.espalierRoot)) {
    if (path.basename(candidate) !== settings.filename) continue;
    // A child espalier's subtree is not this run's to read, describe or delete.
    if (childPrefixes.some((prefix) => candidate.startsWith(prefix))) continue;
    const contents = read(path.join(root, candidate));
    if (contents !== null) existing.set(candidate, contents);
  }

  // Checked before anything is written. `build` will not eat a hand-written
  // file, and it will not leave a half-built tree behind while declining to.
  for (const [at, contents] of [...existing].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (contents.startsWith(PROVENANCE)) continue;
    if (!planned.has(at)) continue;
    fail(
      "unmarked_documentation",
      `${at} exists without a provenance marker; move its content into the corresponding ESPALIER.MD and run again`,
      { path: at },
    );
  }

  // Confined to what the configuration governs, and narrowed here rather than
  // above so that an unmarked file is still refused wherever it sits. The
  // marker says a file is generated documentation, not that it is this run's,
  // and a repository holding a copy of espalier's output — a golden fixture, a
  // vendored package — would lose it otherwise.
  // docs/cli/build/README.MD "Ownership".
  const generated = [...existing]
    .filter(([, contents]) => contents.startsWith(PROVENANCE))
    .filter(([at]) => !ignores(repository.ignoreRules, at))
    .map(([at]) => at);

  const orphans = generated.filter((at) => !planned.has(at)).sort();

  return { root, reporter, planned, existing, orphans };
}

/** What `--check` found, as a count of drifted files. Writes nothing. */
function reportDrift({ reporter, planned, existing, orphans }: Plan): number {
  let drifted = 0;

  for (const at of [...planned.keys()].sort()) {
    const found = existing.get(at);
    if (found === undefined) {
      reporter.record({ kind: "drift", path: at, state: "missing" });
      drifted += 1;
    } else if (found !== planned.get(at)) {
      reporter.record({ kind: "drift", path: at, state: "changed" });
      drifted += 1;
    }
  }

  for (const at of orphans) {
    reporter.record({ kind: "drift", path: at, state: "stale" });
    drifted += 1;
  }

  return drifted;
}

/** The only part that touches the filesystem, and it runs for every espalier or none. */
function apply({ root, reporter, planned, existing, orphans }: Plan): void {
  for (const at of [...planned.keys()].sort()) {
    const wanted = planned.get(at)!;
    // A file whose rendered bytes already match is left alone, so a second run
    // touches nothing and reports nothing.
    if (existing.get(at) === wanted) continue;
    const absolute = path.join(root, at);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, wanted, "utf8");
    reporter.record({ kind: "written", path: at });
  }

  // Only files are deleted. A directory left empty stays: git does not track
  // it, and a tool that removes directories it did not create is one bad path
  // away from removing something it should not have.
  for (const at of orphans) {
    rmSync(path.join(root, at), { force: true });
    reporter.record({ kind: "deleted", path: at });
  }
}
