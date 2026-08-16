/**
 * The built-in ignore list applied when `defaultIgnore` is true. See
 * docs/CONFIG.MD "defaultIgnore" for the promise this list makes and the rule
 * that decides what belongs on it.
 *
 * The short version: the list is append-only within a major version, so an
 * omission is a one-line fix in any release and an inclusion is stuck until the
 * next major. The bar is therefore **is this file ever a project's own
 * structural decision**, not is it common. That is why `README.MD`,
 * `CHANGELOG.MD`, `Makefile`, `Dockerfile` and `CMakeLists.txt` are absent
 * despite being everywhere: some projects place them on purpose, and a tool
 * claiming nothing goes unaccounted for should not quietly account for them.
 *
 * Entries are gitignore syntax. A bare name matches at any depth, which is what
 * a monorepo needs — `packages/web/package.json` is as much a manifest as the
 * one at the root. A trailing slash matches directories only.
 */
export const DEFAULT_IGNORE: string[] = [
  // ── Manifests ────────────────────────────────────────────────────────────
  // Dictated by a package manager rather than by the project's architecture.
  "package.json",
  "deno.json",
  "deno.jsonc",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "setup.cfg",
  "requirements.txt",
  "requirements-*.txt",
  "Pipfile",
  "Gemfile",
  "*.gemspec",
  "composer.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradle.properties",
  "gradlew",
  "gradlew.bat",
  "gradle/wrapper/",
  "*.csproj",
  "*.fsproj",
  "*.vbproj",
  "*.sln",
  "mix.exs",
  "pubspec.yaml",
  "Package.swift",

  // ── Lockfiles ────────────────────────────────────────────────────────────
  // Nobody hand-writes one, and nobody has an opinion about where it goes.
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "bun.lock",
  "bun.lockb",
  "deno.lock",
  "Cargo.lock",
  "go.sum",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "Gemfile.lock",
  "composer.lock",
  "gradle.lockfile",
  "mix.lock",
  "pubspec.lock",
  "Package.resolved",
  ".terraform.lock.hcl",

  // ── Tool configuration ───────────────────────────────────────────────────
  // The tool decides the filename; the project only decides the contents.
  "tsconfig.json",
  "tsconfig.*.json",
  "jsconfig.json",
  ".eslintrc",
  ".eslintrc.*",
  "eslint.config.*",
  ".prettierrc",
  ".prettierrc.*",
  "prettier.config.*",
  ".babelrc",
  ".babelrc.*",
  "babel.config.*",
  ".npmrc",
  ".nvmrc",
  ".node-version",
  ".python-version",
  ".ruby-version",
  ".tool-versions",
  ".dockerignore",
  "rustfmt.toml",
  ".rustfmt.toml",
  "clippy.toml",
  ".golangci.yml",
  ".golangci.yaml",
  "ruff.toml",
  ".ruff.toml",
  "mypy.ini",
  ".flake8",
  "tox.ini",
  "pytest.ini",
  ".rubocop.yml",
  ".swiftlint.yml",

  // ── Continuous integration ───────────────────────────────────────────────
  ".github/",
  ".gitlab/",
  ".gitlab-ci.yml",
  ".circleci/",
  ".buildkite/",
  ".travis.yml",
  "azure-pipelines.yml",
  "Jenkinsfile",
  ".drone.yml",
  ".woodpecker.yml",

  // ── Licence and legal ────────────────────────────────────────────────────
  "LICENSE",
  "LICENSE.*",
  "LICENCE",
  "LICENCE.*",
  "COPYING",
  "NOTICE",
  "AUTHORS",
  "CONTRIBUTORS",

  // ── Editor, OS, and VCS metadata ─────────────────────────────────────────
  ".editorconfig",
  ".vscode/",
  ".idea/",
  ".fleet/",
  ".zed/",
  "*.swp",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".mailmap",
  ".git-blame-ignore-revs",
];

/**
 * Directories skipped by the filesystem walk used when the root is not a git
 * repository. Git's own ignore rules do this job when they are available.
 *
 * Nothing can re-include what this list skips — a path excluded here is not a
 * file as far as `espalier` is concerned, and no configuration brings it back.
 * So it holds only machinery, never anything that could be content. A build
 * output directory is deliberately absent: `build/` and `target/` are real
 * source directories in enough projects that skipping them would silently
 * un-govern a subtree, which is the one failure this tool must not have.
 */
export const WALK_EXCLUSIONS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "__pycache__",
  ".venv",
]);
