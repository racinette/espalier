// Everything both `lint` and `explain` need: the config, the compiled espalier,
// and the set of files espalier can see.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { findChildren } from "./children.js";
import { compile, type Espalier } from "./compile.js";
import { loadConfig, type Config } from "./config.js";
import { fail } from "./errors.js";
import { collectCandidates, isGenerated, matchGlob } from "./files.js";
import { compileIgnore, excludedBy, ignores, type IgnoreRule } from "./ignore.js";
import { isOwnership, resolve, unconditionallyRequired, type Ownership, type Recognition } from "./match.js";

export interface Repository {
  config: Config;
  espalier: Espalier;
  /** Sorted, repo-relative, everything espalier governs. */
  visible: string[];
  visibleSet: Set<string>;
  /** User `ignore` only; the default list is a heuristic a declaration overrides. */
  ignoreRules: IgnoreRule[];
  /** Repo-relative directories holding an espalier of their own, sorted. */
  children: string[];
  resolve(filePath: string): Ownership | Recognition;
  /**
   * What excludes this path, or null when espalier governs it: `"ignore"`, the
   * repo-relative path of the `ignoreFiles` entry whose pattern won, `"child"`,
   * or `"espalier"` for the three things invisible unconditionally, which are
   * grouped together because a user cannot un-ignore any of them.
   */
  ungoverned(filePath: string): string | null;
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
    // `exampleSource` is source and has no file behind it; only `example` is a
    // path, and only a path can be checked. docs/TYPES.MD.
    if (example === null) continue;

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

/**
 * The contents of one `ignoreFiles` entry, as patterns.
 *
 * A file that is not there is an error rather than an empty contribution.
 * Carrying on would turn a typo or a deleted file into a repository that
 * governs everything and reports thousands of paths, with the cause several
 * steps removed from the symptom. A config that names a file depends on it.
 */
function readIgnoreFile(root: string, entry: string): string[] {
  try {
    return readFileSync(path.join(root, entry), "utf8").split("\n");
  } catch {
    fail("ignore_file_missing", `ignoreFiles names "${entry}", which is not here`, {
      path: entry,
    });
  }
}

export async function open(configOption: string | undefined, cwd: string): Promise<Repository> {
  const config = loadConfig(configOption, cwd);
  const espalier = await compile(config.root, config.espalierRoot);
  validateExamples(config.root, espalier);

  // Patterns from `ignoreFiles` first, `ignore` last: later rules win, so the
  // config is what settles a disagreement with another tool's file.
  const ignoreRules = [
    ...config.ignoreFiles.flatMap((entry) => compileIgnore(readIgnoreFile(config.root, entry), entry)),
    ...compileIgnore(config.ignore),
  ];

  const espalierPrefix = `${config.espalierRoot}/`;
  const configRelative = path.relative(config.root, config.configPath).split(path.sep).join("/");

  const candidates = collectCandidates(config.root, ignoreRules, config.espalierRoot);
  const children = findChildren(candidates, configRelative, ignoreRules);
  const childPrefixes = children.map((child) => `${child}/`);

  const ownership = new Map<string, Ownership | Recognition>();
  const lookup = (filePath: string): Ownership | Recognition => {
    let found = ownership.get(filePath);
    if (found === undefined) {
      found = resolve(espalier, filePath);
      ownership.set(filePath, found);
    }
    return found;
  };

  const ungoverned = (candidate: string): string | null => {
    // Invisible unconditionally: espalier reporting on its own machinery is a
    // bug rather than a finding. The VCS directory is not among these — it is
    // an `ignore` entry like any other, which is how a user can see it.
    if (candidate === configRelative) return "espalier";
    // A file `ignoreFiles` names is configuration this run read, the same as
    // the config itself. Reporting it would be espalier reporting on its own
    // input — and `_common` covering `.gitignore` only ever hid that for the
    // default name.
    if (config.ignoreFiles.includes(candidate)) return "espalier";
    if (candidate === config.espalierRoot || candidate.startsWith(espalierPrefix)) return "espalier";

    // A child espalier's subtree is not this espalier's to describe. Checked
    // before anything else it could be, because the answer is not that this
    // run excused the path — it is that the path was never this run's.
    if (childPrefixes.some((prefix) => candidate.startsWith(prefix))) return "child";
    if (path.basename(candidate) === config.build.filename && isGenerated(config.root, candidate)) {
      return "espalier";
    }

    // `origin` names the file the pattern came from, so `explain` can answer
    // with something the user can open rather than the name of a list.
    return excludedBy(ignoreRules, candidate)?.origin ?? null;
  };

  const visible: string[] = [];
  for (const candidate of candidates) {
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
    children,
    resolve: lookup,
    ungoverned,
  };
}
