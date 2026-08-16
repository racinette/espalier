// `espalier init`. docs/cli/init/README.MD.
//
// Writes the configuration and creates the espalier root. It describes nothing:
// inferring shape from an existing tree is `espalier adopt`, one area at a time,
// where each guess is small enough to check.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONFIG_FILENAME } from "./config.js";
import { DEFAULT_IGNORE, WALK_EXCLUSIONS } from "./defaults.js";
import { fail } from "./errors.js";
import { compileIgnore, ignores } from "./ignore.js";
import type { Reporter } from "./output.js";

export interface InitOptions {
  cwd: string;
  config: string | undefined;
  root: string | undefined;
  ignoreAll: boolean;
}

/**
 * One entry per top-level path — directories as `<dir>/**`, files by name —
 * in the same order everything else in `espalier` lists siblings: directories
 * before files, then lexicographic.
 *
 * Paths the default list already covers are left out, and so is the espalier
 * root. Listing either would be writing down something that was never going to
 * be reported, which is how a backlog turns into a junk drawer.
 */
function topLevelIgnores(root: string, espalierRoot: string): string[] {
  const defaults = compileIgnore(DEFAULT_IGNORE);
  const directories: string[] = [];
  const files: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === espalierRoot) continue;
    if (entry.name === CONFIG_FILENAME) continue;
    if (WALK_EXCLUSIONS.has(entry.name)) continue;

    if (entry.isDirectory()) {
      // A directory is covered only if the list excludes the directory itself;
      // `package.json` says nothing about `src/`.
      if (ignores(defaults, entry.name, true)) continue;
      directories.push(`${entry.name}/**`);
    } else if (entry.isFile()) {
      if (ignores(defaults, entry.name)) continue;
      files.push(entry.name);
    }
  }

  const collate = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return [...directories.sort(collate), ...files.sort(collate)];
}

function render(espalierRoot: string, ignore: string[]): string {
  const lines = ["version: 1", "", `root: ${espalierRoot}`, "", "defaultIgnore: true"];

  if (ignore.length > 0) {
    lines.push(
      "",
      "# espalier governs nothing yet.",
      "# Remove entries as you bring each area under the espalier — see `espalier adopt`.",
      "ignore:",
      ...ignore.map((entry) => `  - ${entry}`),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function init(options: InitOptions, reporter: Reporter): number {
  const configPath =
    options.config === undefined
      ? path.join(options.cwd, CONFIG_FILENAME)
      : path.resolve(options.cwd, options.config);
  const root = path.dirname(configPath);
  const espalierRoot = options.root ?? "espalier";

  if (path.isAbsolute(espalierRoot) || espalierRoot.split(/[\\/]/).includes("..")) {
    fail("config_invalid_value", "root must be a relative path inside the repository");
  }

  // Refusing rather than merging. A configuration is the one file in a
  // repository that says what everything else means, and a bootstrap command
  // is the last thing that should be allowed to rewrite it.
  if (existsSync(configPath)) {
    fail("config_exists", `${path.relative(root, configPath)} already exists`, {
      path: path.relative(root, configPath),
    });
  }

  const ignore = options.ignoreAll ? topLevelIgnores(root, espalierRoot) : [];

  writeFileSync(configPath, render(espalierRoot, ignore), "utf8");
  reporter.record({ kind: "written", path: path.relative(root, configPath) });

  // Git does not track empty directories, so without this the espalier root
  // vanishes on the first commit and the next clone fails before anyone has
  // written a line. Dotfiles in the espalier are skipped rather than read.
  mkdirSync(path.join(root, espalierRoot), { recursive: true });
  const keep = path.join(root, espalierRoot, ".gitkeep");
  if (!existsSync(keep)) {
    writeFileSync(keep, "", "utf8");
    reporter.record({ kind: "written", path: `${espalierRoot}/.gitkeep` });
  }

  return 0;
}
