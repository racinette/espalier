/**
 * The built-in ignore list applied when `defaultIgnore` is true: things no
 * project wants to govern.
 *
 * TODO: this list is not settled. docs/CONFIG.MD promises a universal,
 * language-agnostic set covering manifests and lockfiles, tool configuration,
 * CI definitions, licence and editor files — and promises it is append-only
 * within a major version, which makes every entry added here a commitment.
 * What follows is a minimal honest starting point rather than the real list.
 */
export const DEFAULT_IGNORE: string[] = [
  // manifests and lockfiles
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Cargo.toml",
  "Cargo.lock",
  "go.mod",
  "go.sum",
  "pyproject.toml",
  "poetry.lock",
  "requirements.txt",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock",

  // tool configuration
  "tsconfig.json",
  "tsconfig.*.json",
  "jsconfig.json",

  // CI
  ".github/**",
  ".gitlab-ci.yml",
  ".circleci/**",

  // licence, editor, VCS metadata
  "LICENSE",
  "LICENSE.*",
  "LICENCE",
  "LICENCE.*",
  ".editorconfig",
  ".gitignore",
  ".gitattributes",
  ".vscode/**",
  ".idea/**",
  ".DS_Store",
];

/**
 * Directories skipped by the filesystem walk used when the root is not a git
 * repository. Git's own ignore rules do this job when they are available.
 *
 * TODO: also unsettled, and for the same reason.
 */
export const WALK_EXCLUSIONS = new Set([".git", "node_modules"]);
