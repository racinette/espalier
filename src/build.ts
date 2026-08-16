// `espalier build`. docs/cli/build/README.MD.
//
// Renders every document in memory first, then decides what to do with the
// filesystem. Nothing is written until every placement point has been checked,
// because a run that fails halfway leaves a half-built documentation set and
// the user cannot see which half.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fail } from "./errors.js";
import { collectCandidates, PROVENANCE } from "./files.js";
import type { Reporter } from "./output.js";
import { plan, renderDistributed, renderInline } from "./render.js";
import { open } from "./repository.js";

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

export async function build(options: BuildOptions, reporter: Reporter): Promise<number> {
  const repository = await open(options.config, options.cwd);
  const { root, build: settings } = repository.config;
  const inline = options.inline || settings.inline;

  const points = plan(repository.espalier);

  const planned = new Map<string, string>();
  if (inline) {
    planned.set(settings.filename, renderInline(repository.espalier, points, repository.config.espalierRoot));
  } else {
    for (const point of points) {
      const at = point.at === "" ? settings.filename : `${point.at}/${settings.filename}`;
      planned.set(at, renderDistributed(repository.espalier, point, repository.config.espalierRoot));
    }
  }

  // Every documentation file already on disk, and whether espalier wrote it.
  const existing = new Map<string, string>();
  for (const candidate of collectCandidates(root)) {
    if (path.basename(candidate) !== settings.filename) continue;
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

  const generated = [...existing]
    .filter(([, contents]) => contents.startsWith(PROVENANCE))
    .map(([at]) => at);

  const orphans = generated.filter((at) => !planned.has(at)).sort();
  const targets = [...planned.keys()].sort();

  if (options.check) {
    let drifted = 0;

    for (const at of targets) {
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

    return drifted === 0 ? 0 : 1;
  }

  for (const at of targets) {
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

  return 0;
}
