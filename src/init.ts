// `espalier init`. docs/cli/init/README.MD.
//
// Writes the configuration and creates the espalier root. It describes nothing:
// inferring shape from an existing tree is `espalier adopt`, one area at a time,
// where each guess is small enough to check.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_FILENAME } from "./config.js";
import { fail } from "./errors.js";
import { probe } from "./files.js";
import { compileIgnore, ignores } from "./ignore.js";
import type { Reporter } from "./output.js";

/**
 * The shipped ignore lists, as data rather than as code. One file per language,
 * plus `_common` for what belongs to no language and is written every time.
 *
 * They are copied into the config, never read at lint time, so upgrading
 * `espalier` cannot change what a repository governs. See
 * docs/cli/init/README.MD "--lang".
 */
const IGNORES = fileURLToPath(new URL("../../ignores/", import.meta.url));
const COMMON = "_common";

function listNames(): string[] {
  return readdirSync(IGNORES)
    .filter((entry) => entry.endsWith(".gitignore") && !entry.startsWith("_"))
    .map((entry) => entry.slice(0, -".gitignore".length))
    .sort();
}

/** One shipped list, verbatim: comments and blank lines are part of it. */
function readList(name: string): string[] {
  try {
    return readFileSync(path.join(IGNORES, `${name}.gitignore`), "utf8").trimEnd().split("\n");
  } catch {
    fail(
      "unknown_language",
      `no ignore list for "${name}". Available: ${listNames().join(", ")}`,
      { language: name, available: listNames() },
    );
  }
}

export interface InitOptions {
  cwd: string;
  config: string | undefined;
  root: string | undefined;
  /** Shipped list names from `--lang`, in the order given. */
  languages: string[];
  /** Paths from `--ignore-file`, in the order given, or undefined for the default. */
  ignoreFiles: string[] | undefined;
  /** `--no-ignore-file`: write an empty list rather than looking for one. */
  noIgnoreFile: boolean;
  /** `--no-common-ignore`: write none of the common block either. */
  noCommonIgnore: boolean;
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
/** One `ignoreFiles` entry's patterns, or nothing when it is not there. */
function readIgnoreFile(root: string, entry: string): string[] {
  try {
    return readFileSync(path.join(root, entry), "utf8").split("\n");
  } catch {
    return [];
  }
}

function topLevelIgnores(root: string, espalierRoot: string, written: string[]): string[] {
  const covered = compileIgnore(written);
  const directories: string[] = [];
  const files: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === espalierRoot) continue;
    if (entry.name === CONFIG_FILENAME) continue;

    // A link counts as what it points at, and one pointing nowhere is passed
    // over: this list is a proposal, and `lint` is where an unreadable path
    // becomes a verdict. docs/CONFIG.MD "Symlinks".
    const kind = probe(entry, path.join(root, entry.name));

    if (kind === "directory") {
      // A directory is covered only if the list excludes the directory itself;
      // `package.json` says nothing about `src/`.
      if (ignores(covered, entry.name, true)) continue;
      directories.push(`${entry.name}/**`);
    } else if (kind === "file") {
      if (ignores(covered, entry.name)) continue;
      files.push(entry.name);
    }
  }

  const collate = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return [...directories.sort(collate), ...files.sort(collate)];
}

/**
 * A pattern that YAML would read as something other than a string. `*.swp`
 * opens an alias, `!foo` a tag, and a bare `:` or `#` ends the scalar early.
 */
function quoted(pattern: string): string {
  const plain = /^[A-Za-z0-9._/]/.test(pattern) && !/[:#]/.test(pattern);
  return plain ? pattern : `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** A shipped list's own comments survive; its patterns become YAML entries. */
function asEntries(lines: string[]): string[] {
  return lines.map((line) =>
    line === "" || line.startsWith("#") ? `  ${line}`.trimEnd() : `  - ${quoted(line)}`,
  );
}

function render(espalierRoot: string, ignoreFiles: string[], blocks: string[][]): string {
  const lines = ["version: 1", "", `root: ${espalierRoot}`, ""];
  // Written even when empty. `--no-ignore-file` is a decision, and a config
  // that omitted the key would leave the next reader to wonder whether one was
  // made at all.
  lines.push(
    ignoreFiles.length === 0 ? "ignoreFiles: []" : "ignoreFiles:",
    ...ignoreFiles.map((entry) => `  - ${quoted(entry)}`),
  );

  const written = blocks.filter((block) => block.length > 0);
  if (written.length > 0) {
    lines.push("", "ignore:");
    written.forEach((block, index) => {
      if (index > 0) lines.push("");
      lines.push(...block);
    });
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

  if (options.noIgnoreFile && options.ignoreFiles !== undefined) {
    fail(
      "contradictory_flags",
      "--no-ignore-file and --ignore-file cannot both be honoured; drop one",
    );
  }

  // The choice is made here, once, and written down. A config that named a
  // file it does not have would govern everything while looking correct, so
  // the check belongs at the moment the claim is made.
  const ignoreFiles = options.noIgnoreFile ? [] : (options.ignoreFiles ?? [".gitignore"]);
  for (const entry of ignoreFiles) {
    if (!existsSync(path.join(root, entry))) {
      fail(
        "ignore_file_missing",
        `${entry} is not here. Name another with --ignore-file, or decline one with --no-ignore-file.`,
        { path: entry },
      );
    }
  }

  // `_common` unless declined: `.gitignore` never lists `.git/`, so the walk
  // would otherwise descend into it, and nothing else supplies that entry.
  // Declining it is a decision the flag exists to make, not an accident.
  const wanted = options.noCommonIgnore ? options.languages : [COMMON, ...options.languages];
  const shipped = wanted.flatMap((name) => readList(name));
  // What the config will already exclude once written: the shipped lists, plus
  // whatever the `ignoreFiles` default is going to bring in. Listing a path
  // twice is how a backlog turns into a junk drawer.
  const covered = [
    ...shipped,
    // The ignore files themselves are invisible once the config names them.
    ...ignoreFiles,
    ...ignoreFiles.flatMap((entry) => readIgnoreFile(root, entry)),
  ];
  const blocks = wanted.map((name) =>
    asEntries(name === COMMON ? readList(name) : [`# ${name}`, ...readList(name)]),
  );

  if (options.ignoreAll) {
    const backlog = topLevelIgnores(root, espalierRoot, covered);
    if (backlog.length > 0) {
      blocks.push([
        "  # espalier governs nothing yet.",
        "  # Remove entries as you bring each area under the espalier — see `espalier adopt`.",
        ...backlog.map((entry) => `  - ${quoted(entry)}`),
      ]);
    }
  }

  writeFileSync(configPath, render(espalierRoot, ignoreFiles, blocks), "utf8");
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
