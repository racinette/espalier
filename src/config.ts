// docs/CONFIG.MD. Discovery, validation, and the shape everything else reads.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { fail } from "./errors.js";
import { compileIgnore, excludedBy } from "./ignore.js";
import { VERSION } from "./version.js";

export const CONFIG_FILENAME = "espalier.config.yaml";
export const IGNORE_FILENAME = ".espalierignore";

export interface Config {
  /** Absolute path of the directory containing the config file. */
  root: string;
  /** Absolute path of the config file itself. */
  configPath: string;
  /** Exact Espalier CLI version this repository was authored against. */
  pin: string;
  /** What the project is called, and what heads every generated document. */
  name: string | null;
  /** Repo-relative directory holding the espalier tree. */
  espalierRoot: string;
  /** Repo-relative paths holding further ignore patterns, in order. */
  ignoreFiles: string[];
  /**
   * Gitignore-syntax patterns relative to the espalier root. Matching files
   * are not compiled. docs/CONFIG.MD "`skip`".
   */
  skip: string[];
  /** Lines of `.espalierignore`, or none when the file is not there. */
  ignore: string[];
  /** Repo-relative path to the addons module, or null. */
  addons: string | null;
  build: { filename: string; inline: boolean; espalierGuidance: boolean };
}

const KNOWN = new Set(["pin", "name", "root", "ignoreFiles", "skip", "addons", "build"]);
const KNOWN_BUILD = new Set(["filename", "inline", "espalierGuidance"]);

/** Instruction files `init` and `migrate` write into `skip`. docs/CONFIG.MD "`skip`". */
export const SHIPPED_SKIP = ["AGENTS.MD", "AGENTS.md", "CLAUDE.md"];

/** Paths a `skip` pattern must not match, at the root or one directory down. */
const GRAMMAR_PROBES = ["ESPALIER.MD", "placeholder.mjs", "nested/ESPALIER.MD", "nested/placeholder.mjs"];

export function locateConfig(explicit: string | undefined, cwd: string): string {
  if (explicit !== undefined) {
    const configPath = path.resolve(cwd, explicit);
    if (!existsSync(configPath)) {
      fail("config_not_found", `no config file at ${explicit}`);
    }
    return configPath;
  }

  let at = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(at, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const up = path.dirname(at);
    if (up === at) {
      fail(
        "config_not_found",
        `no ${CONFIG_FILENAME} found in ${cwd} or any parent directory`,
      );
    }
    at = up;
  }
}

export function readConfigFile(configPath: string): { text: string; values: Record<string, unknown> } {
  const text = readFileSync(configPath, "utf8");
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (cause) {
    fail("config_malformed", `${CONFIG_FILENAME} is not valid YAML: ${(cause as Error).message}`);
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    fail("config_malformed", `${CONFIG_FILENAME} must contain a mapping`);
  }

  return { text, values: raw as Record<string, unknown> };
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
  const configPath = locateConfig(explicit, cwd);
  const root = path.dirname(configPath);
  const { values } = readConfigFile(configPath);

  for (const key of Object.keys(values)) {
    if (key === "version") continue;
    if (!KNOWN.has(key)) {
      // A typo in a config file is not something to discover three weeks later
      // when the rule it disabled turns out never to have run.
      fail("config_unknown_key", `unknown configuration key "${key}"`);
    }
  }

  if (!("pin" in values)) {
    fail("config_missing_pin", "pin is required");
  }
  const pin = asString(values["pin"], "pin");
  if (pin !== VERSION) {
    fail(
      "version_mismatch",
      `this repository pins espalier ${pin}, but ${VERSION} is running; install espalier@${pin} or run espalier migrate`,
      { pinned: pin, running: VERSION },
    );
  }

  if ("version" in values) {
    fail(
      "config_unknown_key",
      `unknown configuration key "version"; pin is the only version. Run espalier migrate`,
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

  const ignoreFiles = requiredPathList(values, "ignoreFiles");
  const skip = requiredPathList(values, "skip");
  refuseSkipHidingGrammar(skip);

  // docs/CONFIG.MD "`.espalierignore`". Beside the config rather than inside
  // it, because entries carry comments and `build` reads those into the
  // documentation. Optional: a repository excluding nothing writes no file, and
  // an absent one is an empty list rather than a failure — unlike `ignoreFiles`
  // and `skip`, which fail when omitted because omit is not a decision, and
  // unlike a named `ignoreFiles` entry, which fails when the file is not there
  // because the config claimed it exists.
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
  let espalierGuidance = true;
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
    if ("espalierGuidance" in entries) {
      espalierGuidance = asBoolean(entries["espalierGuidance"], "build.espalierGuidance");
    }
  }

  const espalierAbsolute = path.join(root, espalierRoot);
  if (!existsSync(espalierAbsolute) || !statSync(espalierAbsolute).isDirectory()) {
    fail("espalier_root_missing", `the espalier root "${espalierRoot}" is not a directory`);
  }

  return {
    root,
    configPath,
    pin,
    name,
    espalierRoot,
    ignoreFiles,
    skip,
    ignore,
    addons,
    build: { filename, inline, espalierGuidance },
  };
}

function requiredPathList(values: Record<string, unknown>, key: "ignoreFiles" | "skip"): string[] {
  if (!(key in values)) {
    if (key === "ignoreFiles") {
      fail(
        "config_missing_ignore_files",
        "ignoreFiles is required. An empty list is []. Run espalier migrate if this configuration predates the key",
      );
    }
    fail(
      "config_missing_skip",
      "skip is required. An empty list is []. Run espalier migrate if this configuration predates the key",
    );
  }
  const listed = values[key];
  if (!Array.isArray(listed) || listed.some((entry) => typeof entry !== "string")) {
    fail("config_invalid_value", `${key} must be a list of strings`);
  }
  for (const entry of listed as string[]) {
    if (entry === "" || path.isAbsolute(entry) || entry.split(/[\\/]/).includes("..")) {
      fail(
        "config_invalid_value",
        `${key} entry ${JSON.stringify(entry)} must be a relative path inside the repository`,
      );
    }
  }
  return listed as string[];
}

function refuseSkipHidingGrammar(skip: string[]): void {
  const rules = compileIgnore(skip, "skip");
  for (const probe of GRAMMAR_PROBES) {
    const rule = excludedBy(rules, probe);
    if (rule !== null) {
      fail(
        "skip_hides_grammar",
        `skip pattern "${rule.pattern}" would hide a rule module or ESPALIER.MD`,
        { pattern: rule.pattern },
      );
    }
  }
}
