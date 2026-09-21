// `espalier migrate`. docs/cli/migrate/README.MD.
//
// Rewrites the configuration for the running CLI. Every other command dies in
// `loadConfig` on a pin mismatch; this one is allowed to see the old file,
// edit it as text, and visit children the way `lint` and `build` do.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findChildren } from "./children.js";
import {
  CONFIG_FILENAME,
  IGNORE_FILENAME,
  SHIPPED_SKIP,
  locateConfig,
  readConfigFile,
} from "./config.js";
import { fail } from "./errors.js";
import { collectCandidates } from "./files.js";
import { compileIgnore } from "./ignore.js";
import { eachChild } from "./nested.js";
import type { Reporter } from "./output.js";
import { readIgnoreFile } from "./repository.js";
import { VERSION } from "./version.js";
import { compileVisibility } from "./visibility.js";

const CURRENT_KEYS = new Set([
  "pin",
  "name",
  "root",
  "ignoreFiles",
  "skip",
  "addons",
  "build",
  "version",
]);

export interface MigrateOptions {
  cwd: string;
  config: string | undefined;
  dryRun: boolean;
}

function compareRelease(left: string, right: string): number {
  const parse = (value: string): number[] | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
    return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const a = parse(left);
  const b = parse(right);
  if (a === null || b === null) return left === right ? 0 : left < right ? -1 : 1;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}

/** Rewrite one config's YAML as text so comments and key order survive. */
export function rewriteConfigText(
  text: string,
  values: Record<string, unknown>,
  version: string,
): string {
  let lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines = lines.slice(0, -1);

  lines = lines.filter((line) => !/^version\s*:/.test(line));

  let sawPin = false;
  lines = lines.map((line) => {
    if (/^pin\s*:/.test(line)) {
      sawPin = true;
      return `pin: ${version}`;
    }
    return line;
  });
  if (!sawPin) lines = [`pin: ${version}`, "", ...lines];

  const additions: string[] = [];
  if (!("ignoreFiles" in values)) additions.push("ignoreFiles: []");
  if (!("skip" in values)) {
    additions.push(["skip:", ...SHIPPED_SKIP.map((entry) => `  - ${entry}`)].join("\n"));
  }

  let body = lines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
  if (additions.length > 0) body = `${body}\n\n${additions.join("\n\n")}`;
  return `${body}\n`;
}

function discoverChildren(
  root: string,
  configPath: string,
  values: Record<string, unknown>,
): string[] {
  const written = typeof values["root"] === "string" ? values["root"] : "espalier";
  const espalierRoot = path.posix
    .normalize(written.split(path.sep).join("/"))
    .replace(/\/+$/, "");

  let ignoreFiles: string[] = [];
  if ("ignoreFiles" in values) {
    const listed = values["ignoreFiles"];
    if (!Array.isArray(listed) || listed.some((entry) => typeof entry !== "string")) {
      fail("config_invalid_value", "ignoreFiles must be a list of strings");
    }
    ignoreFiles = listed as string[];
  }

  const ignorePath = path.join(root, IGNORE_FILENAME);
  const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, "utf8").split("\n") : [];
  const ignoreRules = compileIgnore(ignore);
  const visibilityRules = ignoreFiles.map((entry) =>
    compileVisibility(readIgnoreFile(root, entry), entry),
  );
  const discoverGitignores = ignoreFiles.includes(".gitignore");
  const configRelative = path.relative(root, configPath).split(path.sep).join("/");

  const candidates = collectCandidates(
    root,
    ignoreRules,
    espalierRoot === "" || espalierRoot === "." ? undefined : espalierRoot,
    (absolute, at) => {
      const origin = `${at}/${IGNORE_FILENAME}`;
      if (!existsSync(path.join(absolute, IGNORE_FILENAME))) return [];
      return compileIgnore(readFileSync(path.join(absolute, IGNORE_FILENAME), "utf8").split("\n"), origin, at);
    },
    undefined,
    visibilityRules,
    (absolute, at) => {
      if (!discoverGitignores || !existsSync(path.join(absolute, ".gitignore"))) return [];
      const origin = `${at}/.gitignore`;
      return [compileVisibility(readFileSync(path.join(root, origin), "utf8").split("\n"), origin, at)];
    },
  );

  return findChildren(candidates, configRelative, ignoreRules);
}

function migrateOne(options: MigrateOptions, reporter: Reporter): { root: string; children: string[] } {
  const configPath = locateConfig(options.config, options.cwd);
  const root = path.dirname(configPath);
  const { text, values } = readConfigFile(configPath);

  for (const key of Object.keys(values)) {
    if (!CURRENT_KEYS.has(key)) {
      fail("config_unknown_key", `unknown configuration key "${key}"`);
    }
  }

  if ("pin" in values) {
    if (typeof values["pin"] !== "string") {
      fail("config_invalid_value", "pin must be a string");
    }
    if (compareRelease(values["pin"], VERSION) > 0) {
      fail(
        "cannot_downgrade",
        `this repository pins espalier ${values["pin"]}, which is newer than ${VERSION}; install that version rather than migrating downward`,
        { pinned: values["pin"], running: VERSION },
      );
    }
  }

  const wanted = rewriteConfigText(text, values, VERSION);
  const reported = path.relative(root, configPath).split(path.sep).join("/") || CONFIG_FILENAME;
  if (wanted === text) {
    reporter.record({ kind: "skipped", path: reported });
  } else {
    if (!options.dryRun) writeFileSync(configPath, wanted, "utf8");
    reporter.record({ kind: "written", path: reported });
  }

  return { root, children: discoverChildren(root, configPath, values) };
}

export async function migrate(options: MigrateOptions, reporter: Reporter): Promise<number> {
  const { root, children } = migrateOne(options, reporter);
  return await eachChild(root, children, reporter, (childRoot, childReporter) =>
    migrate({ ...options, cwd: childRoot, config: undefined }, childReporter),
  );
}
