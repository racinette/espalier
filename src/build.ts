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

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fail } from "./errors.js";
import { collectCandidates, PROVENANCE } from "./files.js";
import { ignores } from "./ignore.js";
import type { Reporter } from "./output.js";
import { eachChild } from "./nested.js";
import { assignChildren, plan, renderDistributed, renderInline } from "./render.js";
import { open, type Repository } from "./repository.js";

export interface BuildOptions {
  cwd: string;
  config: string | undefined;
  check: boolean;
  inline: boolean;
}

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

function planFor(
  repository: Repository,
  options: BuildOptions,
  reporter: Reporter,
): Plan {
  const { root, build: settings } = repository.config;
  const inline = options.inline || settings.inline;

  const points = plan(repository.espalier);

  const assigned = assignChildren(points, repository.children);

  const planned = new Map<string, string>();
  if (inline) {
    planned.set(
      settings.filename,
      renderInline(repository.espalier, points, repository.config.espalierRoot, repository.children),
    );
  } else {
    for (const point of points) {
      const at = point.at === "" ? settings.filename : `${point.at}/${settings.filename}`;
      planned.set(
        at,
        renderDistributed(
          repository.espalier,
          point,
          repository.config.espalierRoot,
          assigned.get(point.at) ?? [],
          repository.children,
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
  for (const candidate of collectCandidates(root)) {
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
