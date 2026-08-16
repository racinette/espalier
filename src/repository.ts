// Everything both `lint` and `explain` need: the config, the compiled espalier,
// and the set of files espalier can see.

import { existsSync } from "node:fs";
import path from "node:path";
import { compile, type Espalier } from "./compile.js";
import { loadConfig, type Config } from "./config.js";
import { DEFAULT_IGNORE } from "./defaults.js";
import { fail } from "./errors.js";
import { collectCandidates, isGenerated, matchGlob } from "./files.js";
import { compileIgnore, ignores, type IgnoreRule } from "./ignore.js";
import { isOwnership, resolve, unconditionallyRequired, type Ownership, type Recognition } from "./match.js";

export interface Repository {
  config: Config;
  espalier: Espalier;
  /** Sorted, repo-relative, everything espalier governs. */
  visible: string[];
  visibleSet: Set<string>;
  /** User `ignore` only; the default list is a heuristic a declaration overrides. */
  ignoreRules: IgnoreRule[];
  resolve(filePath: string): Ownership | Recognition;
  /**
   * Which list excludes this path, or null when espalier governs it. `espalier`
   * covers the three things invisible unconditionally, which are grouped
   * together because a user cannot un-ignore any of them.
   */
  ungoverned(filePath: string): "ignore" | "defaultIgnore" | "espalier" | null;
}

function validateExamples(root: string, espalier: Espalier): void {
  const patterns = new Map<string, { patterns: string[]; example: string | null }>();

  const walk = (node: (typeof espalier)["root"]): void => {
    if (node.rule !== null) {
      patterns.set(node.rule.modulePath, {
        patterns: [node.rule.pattern],
        example: node.rule.module.example,
      });
    }
    for (const child of node.children.values()) walk(child);
  };
  walk(espalier.root);

  for (const constraint of espalier.constraints) {
    const entry = patterns.get(constraint.modulePath);
    if (entry === undefined) {
      patterns.set(constraint.modulePath, {
        patterns: [constraint.pattern],
        example: constraint.module.example,
      });
    } else {
      entry.patterns.push(constraint.pattern);
    }
  }

  for (const [modulePath, { patterns: globs, example }] of patterns) {
    if (example === null) continue;
    // The inline form is a source string rather than a path; only the path form
    // carries the guarantee that it cannot drift.
    if (example.includes("\n")) continue;

    if (!existsSync(path.join(root, example))) {
      fail("invalid_example", `${modulePath}: example "${example}" does not exist`);
    }
    if (!globs.some((glob) => matchGlob(glob, example))) {
      fail(
        "invalid_example",
        `${modulePath}: example "${example}" is not matched by this rule's own pattern`,
      );
    }
  }
}

export async function open(configOption: string | undefined, cwd: string): Promise<Repository> {
  const config = loadConfig(configOption, cwd);
  const espalier = await compile(config.root, config.espalierRoot);
  validateExamples(config.root, espalier);

  const ignoreRules = compileIgnore(config.ignore);
  const defaultRules = config.defaultIgnore ? compileIgnore(DEFAULT_IGNORE) : [];

  const espalierPrefix = `${config.espalierRoot}/`;
  const configRelative = path.relative(config.root, config.configPath).split(path.sep).join("/");

  const ownership = new Map<string, Ownership | Recognition>();
  const lookup = (filePath: string): Ownership | Recognition => {
    let found = ownership.get(filePath);
    if (found === undefined) {
      found = resolve(espalier, filePath);
      ownership.set(filePath, found);
    }
    return found;
  };

  const ungoverned = (candidate: string): "ignore" | "defaultIgnore" | "espalier" | null => {
    // Invisible unconditionally: espalier reporting on its own machinery is a
    // bug rather than a finding.
    if (candidate === configRelative) return "espalier";
    if (candidate === config.espalierRoot || candidate.startsWith(espalierPrefix)) return "espalier";
    if (candidate.split("/")[0] === ".git") return "espalier";
    if (path.basename(candidate) === config.build.filename && isGenerated(config.root, candidate)) {
      return "espalier";
    }

    if (ignores(ignoreRules, candidate)) return "ignore";

    // Explicit beats declared; declared beats heuristic. A path the espalier
    // declares overrides the default list, which `ignore` never does.
    if (defaultRules.length > 0 && ignores(defaultRules, candidate) && !isOwnership(lookup(candidate))) {
      return "defaultIgnore";
    }

    return null;
  };

  const visible: string[] = [];
  for (const candidate of collectCandidates(config.root)) {
    if (ungoverned(candidate) === null) visible.push(candidate);
  }

  // Ignoring is not declaring. A path both required and ignored is a
  // configuration that asks for both and gets neither.
  for (const required of unconditionallyRequired(espalier)) {
    if (ignores(ignoreRules, required)) {
      fail(
        "ignored_required_path",
        `${required} is required by the espalier and also matched by \`ignore\``,
        { path: required },
      );
    }
  }

  return {
    config,
    espalier,
    visible,
    visibleSet: new Set(visible),
    ignoreRules,
    resolve: lookup,
    ungoverned,
  };
}
