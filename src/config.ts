// docs/CONFIG.MD. Discovery, validation, and the shape everything else reads.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { fail } from "./errors.js";

export const CONFIG_FILENAME = "espalier.config.yaml";
export const IGNORE_FILENAME = ".espalierignore";

export interface Config {
  /** Absolute path of the directory containing the config file. */
  root: string;
  /** Absolute path of the config file itself. */
  configPath: string;
  /** What the project is called, and what heads every generated document. */
  name: string | null;
  /** Repo-relative directory holding the espalier tree. */
  espalierRoot: string;
  /** Repo-relative paths holding further ignore patterns, in order. */
  ignoreFiles: string[];
  /** Lines of `.espalierignore`, or none when the file is not there. */
  ignore: string[];
  /** Repo-relative path to the addons module, or null. */
  addons: string | null;
  build: { filename: string; inline: boolean };
}

const KNOWN = new Set(["version", "name", "root", "ignoreFiles", "addons", "build"]);
const KNOWN_BUILD = new Set(["filename", "inline"]);

function findConfig(from: string): string {
  let at = path.resolve(from);
  for (;;) {
    const candidate = path.join(at, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const up = path.dirname(at);
    if (up === at) {
      fail(
        "config_not_found",
        `no ${CONFIG_FILENAME} found in ${from} or any parent directory`,
      );
    }
    at = up;
  }
}

/** Whether the config rooted at `from` sits beneath another Espalier config. */
export function hasAncestorConfig(from: string): boolean {
  let at = path.dirname(path.resolve(from));
  for (;;) {
    if (existsSync(path.join(at, CONFIG_FILENAME))) return true;
    const up = path.dirname(at);
    if (up === at) return false;
    at = up;
  }
}

function asString(value: unknown, key: string): string {
  if (typeof value !== "string") {
    fail("config_invalid_value", `${key} must be a string`);
  }
  return value;
}

function asBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") {
    fail("config_invalid_value", `${key} must be true or false`);
  }
  return value;
}

export function loadConfig(explicit: string | undefined, cwd: string): Config {
  let configPath: string;

  if (explicit === undefined) {
    configPath = findConfig(cwd);
  } else {
    configPath = path.resolve(cwd, explicit);
    if (!existsSync(configPath)) {
      fail("config_not_found", `no config file at ${explicit}`);
    }
  }

  const root = path.dirname(configPath);

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(configPath, "utf8"));
  } catch (cause) {
    fail("config_malformed", `${CONFIG_FILENAME} is not valid YAML: ${(cause as Error).message}`);
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    fail("config_malformed", `${CONFIG_FILENAME} must contain a mapping`);
  }

  const values = raw as Record<string, unknown>;

  for (const key of Object.keys(values)) {
    if (!KNOWN.has(key)) {
      // A typo in a config file is not something to discover three weeks later
      // when the rule it disabled turns out never to have run.
      fail("config_unknown_key", `unknown configuration key "${key}"`);
    }
  }

  if (!("version" in values)) {
    fail("config_missing_version", "version is required");
  }
  if (values["version"] !== 1) {
    fail(
      "config_unsupported_version",
      `unsupported version ${JSON.stringify(values["version"])}; this release understands version 1`,
    );
  }

  // A name rather than a description, so it is not re-wrapped, and one line
  // because a heading is one line. docs/CONFIG.MD "`name`".
  let name: string | null = null;
  if ("name" in values) {
    name = asString(values["name"], "name").trim();
    if (name === "" || name.includes("\n")) {
      fail("config_invalid_value", "name must be a single non-empty line");
    }
  }

  const written = "root" in values ? asString(values["root"], "root") : "espalier";
  if (path.isAbsolute(written) || written.split(/[\\/]/).includes("..")) {
    fail("config_invalid_value", "root must be a relative path inside the repository");
  }

  // `espalier/` and `./espalier` are the same directory, and the rest of the
  // file invites both spellings — `ignore` uses a trailing slash to *mean* a
  // directory. Every other use of this value compares it against a
  // repository-relative path, which carries neither, so a run configured with
  // one reported every rule module as `unexpected_path`: the espalier root is
  // invisible to matching, and a spelling was deciding whether it was.
  const espalierRoot = path.posix
    .normalize(written.split(path.sep).join("/"))
    .replace(/\/+$/, "");
  if (espalierRoot === "" || espalierRoot === ".") {
    fail("config_invalid_value", "root must name a directory inside the repository");
  }

  // Empty rather than `[".gitignore"]`: an entry here must exist, and a default
  // that must exist is a default that breaks every repository without one.
  // `init` decides once and writes down what it decided.
  let ignoreFiles: string[] = [];
  if ("ignoreFiles" in values) {
    const listed = values["ignoreFiles"];
    if (!Array.isArray(listed) || listed.some((entry) => typeof entry !== "string")) {
      fail("config_invalid_value", "ignoreFiles must be a list of strings");
    }
    for (const entry of listed as string[]) {
      if (path.isAbsolute(entry) || entry.split(/[\\/]/).includes("..")) {
        fail("config_invalid_value", `ignoreFiles entry "${entry}" must be inside the repository`);
      }
    }
    ignoreFiles = listed as string[];
  }

  // docs/CONFIG.MD "`.espalierignore`". Beside the config rather than inside
  // it, because entries carry comments and `build` reads those into the
  // documentation. Optional: a repository excluding nothing writes no file, and
  // an absent one is an empty list rather than a failure — unlike `ignoreFiles`,
  // which fails on a missing entry because the config claimed it exists.
  let ignore: string[] = [];
  const ignorePath = path.join(root, IGNORE_FILENAME);
  if (existsSync(ignorePath)) {
    ignore = readFileSync(ignorePath, "utf8").split("\n");
  }

  let addons: string | null = null;
  if ("addons" in values && values["addons"] !== null) {
    addons = asString(values["addons"], "addons");
  }

  let filename = "AGENTS.MD";
  let inline = false;
  if ("build" in values && values["build"] !== null) {
    const build = values["build"];
    if (typeof build !== "object" || Array.isArray(build)) {
      fail("config_invalid_value", "build must be a mapping");
    }
    const entries = build as Record<string, unknown>;
    for (const key of Object.keys(entries)) {
      if (!KNOWN_BUILD.has(key)) {
        fail("config_unknown_key", `unknown configuration key "build.${key}"`);
      }
    }
    if ("filename" in entries) filename = asString(entries["filename"], "build.filename");
    if ("inline" in entries) inline = asBoolean(entries["inline"], "build.inline");
  }

  const espalierAbsolute = path.join(root, espalierRoot);
  if (!existsSync(espalierAbsolute) || !statSync(espalierAbsolute).isDirectory()) {
    fail("espalier_root_missing", `the espalier root "${espalierRoot}" is not a directory`);
  }

  return {
    root,
    configPath,
    name,
    espalierRoot,
    ignoreFiles,
    ignore,
    addons,
    build: { filename, inline },
  };
}
