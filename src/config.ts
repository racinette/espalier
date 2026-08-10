// docs/CONFIG.MD. Discovery, validation, and the shape everything else reads.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { fail } from "./errors.js";

export const CONFIG_FILENAME = "espalier.config.yaml";

export interface Config {
  /** Absolute path of the directory containing the config file. */
  root: string;
  /** Absolute path of the config file itself. */
  configPath: string;
  /** Repo-relative directory holding the espalier tree. */
  espalierRoot: string;
  defaultIgnore: boolean;
  ignore: string[];
  /** Repo-relative path to the addons module, or null. */
  addons: string | null;
  build: { filename: string; inline: boolean };
}

const KNOWN = new Set(["version", "root", "defaultIgnore", "ignore", "addons", "build"]);
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

  const espalierRoot = "root" in values ? asString(values["root"], "root") : "espalier";
  if (path.isAbsolute(espalierRoot) || espalierRoot.split(/[\\/]/).includes("..")) {
    fail("config_invalid_value", "root must be a relative path inside the repository");
  }

  let ignore: string[] = [];
  if ("ignore" in values) {
    const listed = values["ignore"];
    if (!Array.isArray(listed) || listed.some((entry) => typeof entry !== "string")) {
      fail("config_invalid_value", "ignore must be a list of strings");
    }
    ignore = listed as string[];
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
    espalierRoot,
    defaultIgnore:
      "defaultIgnore" in values ? asBoolean(values["defaultIgnore"], "defaultIgnore") : true,
    ignore,
    addons,
    build: { filename, inline },
  };
}
