// Everything both `lint` and `explain` need: the config, the compiled espalier,
// and the set of files espalier can see.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { findChildren } from "./children.js";
import { compile, type Espalier } from "./compile.js";
import { IGNORE_FILENAME, loadConfig, type Config } from "./config.js";
import { fail } from "./errors.js";
import { collectCandidates, isGenerated, matchGlob } from "./files.js";
import { compileIgnore, excludedBy, ignores, type IgnoreRule } from "./ignore.js";
import { isOwnership, resolve, unconditionallyRequired, type Ownership, type Recognition } from "./match.js";
import { compileVisibility, hiddenBy, type VisibilityRules } from "./visibility.js";

export interface Repository {
  config: Config;
  espalier: Espalier;
  /** Sorted, repo-relative, everything espalier governs. */
  visible: string[];
  visibleSet: Set<string>;
  /** User `ignore` only; the default list is a heuristic a declaration overrides. */
  ignoreRules: IgnoreRule[];
  /** External ignore files defining which filesystem paths Espalier can see. */
  visibilityRules: VisibilityRules[];
  /** Ignore rules that finally exclude at least one encountered entry. */
  activeIgnoreRules: IgnoreRule[];
  /** Repo-relative directories holding an espalier of their own, sorted. */
  children: string[];
  resolve(filePath: string): Ownership | Recognition;
  /**
   * What excludes this path, or null when espalier governs it: `"ignore"`, the
   * repo-relative path of the `ignoreFiles` entry whose pattern won, `"child"`,
   * or `"espalier"` for the three things invisible unconditionally, which are
   * grouped together because a user cannot un-ignore any of them.
   */
  ungoverned(filePath: string, asDirectory?: boolean): string | null;
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

/** A per-directory `.espalierignore`, discovered only after its directory opens. */
function readNestedIgnoreFile(root: string, entry: string): string[] {
  try {
    return readFileSync(path.join(root, entry), "utf8").split("\n");
  } catch (cause) {
    fail("unreadable_path", `${entry} could not be read: ${(cause as Error).message}`);
  }
}

export async function open(configOption: string | undefined, cwd: string): Promise<Repository> {
  const config = loadConfig(configOption, cwd);
  const espalier = await compile(config.root, config.espalierRoot);
  validateExamples(config.root, espalier);

  // External ignore files define the repository presented to Espalier.
  // `.espalierignore` is a separate, subsequent governance decision and alone
  // supplies the exclusions `build` explains to readers.
  const visibilityRules = config.ignoreFiles.map((entry) =>
    compileVisibility(readIgnoreFile(config.root, entry), entry),
  );
  const ignoreRules = compileIgnore(config.ignore);
  const discoverGitignores = config.ignoreFiles.includes(".gitignore");

  const espalierPrefix = `${config.espalierRoot}/`;
  const configRelative = path.relative(config.root, config.configPath).split(path.sep).join("/");

  const observedIgnoreRules = new Set<IgnoreRule>();
  const candidates = collectCandidates(
    config.root,
    ignoreRules,
    config.espalierRoot,
    (absolute, at) => {
      const origin = `${at}/${IGNORE_FILENAME}`;
      if (!existsSync(path.join(absolute, IGNORE_FILENAME))) return [];
      if (hiddenBy(visibilityRules, origin) !== null) return [];
      return compileIgnore(readNestedIgnoreFile(config.root, origin), origin, at);
    },
    observedIgnoreRules,
    visibilityRules,
    (absolute, at) => {
      if (!discoverGitignores || !existsSync(path.join(absolute, ".gitignore"))) return [];
      const origin = `${at}/.gitignore`;
      return [compileVisibility(readNestedIgnoreFile(config.root, origin), origin, at)];
    },
  );
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

  const ungoverned = (candidate: string, asDirectory = false): string | null => {
    // Invisible unconditionally: espalier reporting on its own machinery is a
    // bug rather than a finding. The VCS directory is not among these — it is
    // an `ignore` entry like any other, which is how a user can see it.
    if (candidate === configRelative) return "espalier";
    // Configuration, like the file above it — and dot-prefixed, so no rule
    // could declare it even if a project wanted to. A file that cannot be
    // declared and is not invisible is one every run reports forever.
    if (path.basename(candidate) === IGNORE_FILENAME) return "espalier";
    // A file `ignoreFiles` names is configuration this run read, the same as
    // the config itself. Reporting it would be espalier reporting on its own
    // input — and `_common` covering `.gitignore` only ever hid that for the
    // default name.
    if (config.ignoreFiles.includes(candidate)) return "espalier";
    if (visibilityRules.some((rule) => rule.origin === candidate)) return "espalier";
    if (candidate === config.espalierRoot || candidate.startsWith(espalierPrefix)) return "espalier";

    // External ignores define the input universe. `explain` still names the
    // source for a path explicitly requested by the user, but the path never
    // reaches structure matching or generated exclusion documentation.
    const hidden = hiddenBy(visibilityRules, candidate, asDirectory);
    if (hidden !== null) return hidden.origin;

    // A child espalier's subtree is not this espalier's to describe. Checked
    // before anything else it could be, because the answer is not that this
    // run excused the path — it is that the path was never this run's.
    if (childPrefixes.some((prefix) => candidate.startsWith(prefix))) return "child";
    if (path.basename(candidate) === config.build.filename && isGenerated(config.root, candidate)) {
      return "espalier";
    }

    // `origin` names the file the pattern came from, so `explain` can answer
    // with something the user can open rather than the name of a list.
    return excludedBy(ignoreRules, candidate, asDirectory)?.origin ?? null;
  };

  const visible: string[] = [];
  for (const candidate of candidates) {
    if (ungoverned(candidate) === null) visible.push(candidate);
  }

  // Ignoring is not declaring. A path both required and ignored is a
  // configuration that asks for both and gets neither.
  for (const required of unconditionallyRequired(espalier)) {
    if (hiddenBy(visibilityRules, required) !== null || ignores(ignoreRules, required)) {
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
    visibilityRules,
    activeIgnoreRules: ignoreRules.filter((rule) => observedIgnoreRules.has(rule)),
    children,
    resolve: lookup,
    ungoverned,
  };
}
