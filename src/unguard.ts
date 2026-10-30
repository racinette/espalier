// `espalier unguard`: take back the guard in place, in one pass.
// docs/cli/unguard/README.MD.
//
// It reads the espalier's files rather than compiling them, so a guard is
// taken back even from an espalier that no longer compiles. Every module is
// restored in memory first; one whose marks were edited after the guard is
// refused, and then nothing is written.

import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "./build.js";
import { listEntries, reimportModules } from "./compile.js";
import { loadConfig } from "./config.js";
import { fail } from "./errors.js";
import { createdIntact, hasMarks, restoreSource } from "./guardMarks.js";
import { compileIgnore } from "./ignore.js";
import type { Reporter } from "./output.js";

export interface UnguardOptions {
  cwd: string;
  config: string | undefined;
  dryRun: boolean;
  /** Rebuild the generated documents afterwards. */
  build: boolean;
}

export async function unguard(options: UnguardOptions, reporter: Reporter): Promise<number> {
  const config = loadConfig(options.config, options.cwd);
  const rulesRoot = path.join(config.root, config.espalierRoot);
  const shown = (module: string): string => `${config.espalierRoot}/${module}`;

  const restores: { module: string; contents: string | null }[] = [];
  for (const module of listEntries(rulesRoot, compileIgnore(config.skip, "skip")).filter((entry) => entry.endsWith(".mjs"))) {
    const source = readFileSync(path.join(rulesRoot, module), "utf8");
    const created = createdIntact(source);
    if (created === false) {
      fail("guard_tampered", `${shown(module)} was created by the guard and edited since; delete it by hand, then run unguard again`, { module: shown(module) });
    }
    if (created === true) {
      restores.push({ module, contents: null });
    } else if (hasMarks(source)) {
      restores.push({ module, contents: restoreSource(source, shown(module)) });
    }
  }
  if (restores.length === 0) {
    reporter.warning("No guard is in place; nothing was changed.");
    return 0;
  }

  for (const { module, contents } of restores) {
    reporter.record({ kind: contents === null ? "deleted" : "written", path: shown(module) });
    if (options.dryRun) continue;
    const absolute = path.join(rulesRoot, module);
    if (contents !== null) {
      writeFileSync(absolute, contents, "utf8");
      continue;
    }
    rmSync(absolute);
    // A declaration the guard created may have needed directories of its own.
    for (let directory = path.dirname(absolute); directory.startsWith(`${rulesRoot}${path.sep}`); directory = path.dirname(directory)) {
      if (!existsSync(directory) || readdirSync(directory).length > 0) break;
      rmdirSync(directory);
    }
  }
  if (options.dryRun || !options.build) return 0;
  reimportModules();
  return await build({ cwd: options.cwd, config: options.config, check: false, force: false }, reporter);
}
