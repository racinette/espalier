# Configuration

`espalier` is configured by a single `espalier.config.yaml` at the repository root.

```yaml
version: 1

root: espalier

ignoreFiles:
  - .gitignore

ignore:
  - src/api/*.generated.ts
  - vendor/**
  - db/migrations/**

addons: ./espalier.addons.mjs

build:
  filename: AGENTS.MD
  inline: false
```

Every key except `version` is optional. Unknown keys are errors — a typo in a config file is not something to discover three weeks later when the rule it disabled turns out never to have run.

## Discovery

`espalier` walks upward from the working directory until it finds `espalier.config.yaml`. **The directory containing that file is the repository root**, and every path in the config, every path in an issue, and every path in the espalier tree is relative to it.

`--config <path>` overrides discovery. The root becomes that file's directory, regardless of where the command was invoked.

If no config is found, `espalier` exits `2`. There is no implicit default configuration, because guessing a repository root is a good way to lint someone's home directory.

## Nested espaliers

A package in a monorepo may hold an `espalier.config.yaml` of its own. Finding one is how `espalier` learns where one espalier's authority ends and another's begins: **the boundary is discovered, never declared.** There is no `children` key and no list to keep in sync — putting a config in a directory is the whole act.

**A directory holding a config is a child espalier, and its subtree leaves the outer one.** Nothing under it is matched or owned, no constraint reaches in — a root `[...path]` rule stops at the boundary — nothing there is `unexpected_path`, and `build` neither places a document there nor sweeps one away.

**Every command then runs it.** `lint` and `build` at the root visit each child once the outer run is finished, and a visit is a complete separate run: its own config, its own espalier, its own `ignore`, `addons` and `build` settings, and its own children beneath it. Nothing is inherited and nothing crosses.

Those two halves are one feature. A subtree that left the outer espalier and were never visited would be ungoverned, which is the failure this tool exists to prevent. A subtree visited from inside the outer run would answer to two espaliers at once, and a path with two answers is worse than either. Together they say: **every file is governed by exactly one espalier, and one command still checks them all.**

The alternative was to let the outer espalier's rules reach in, which sounds like sharing and is not. A file's answer would then depend on which espalier you happened to run — the root's constraints in CI, the package's on a developer's machine — and a rule that means different things depending on where you stood is not a rule. Rules are shared the way code is shared: a rule module is an ES module, so several espaliers can `import` the same constraint and each declares that it applies.

The trade is explicit. The root can require nothing of a child, because it cannot see one. If every package must have a `README.MD`, each package's espalier says so.

### Suppressing discovery

`ignore` still wins. A config the outer `ignore` matches is not a child at all: the subtree is ignored the ordinary way and nothing recurses into it.

That is what a repository storing configs as data needs. `espalier`'s own `fixtures/` holds sixty of them, several deliberately invalid, and `espalier lint` at the root running all sixty is not what anyone means by it. Ignoring the config file alone is enough to demote a child to plain content, though ignoring the directory is usually what is wanted.

Patterns from `ignoreFiles` count here too, which is worth knowing before it surprises someone: a `.gitignore` entry covering a package directory stops that package's espalier from being discovered. Usually that is right — a directory git does not track is not a subtree anyone is governing — but it means a child can disappear from a change made in another tool's file. `espalier explain <dir>` says which pattern did it.

### Making one

`cd packages/web && espalier init`. The outer espalier stops governing that subtree the moment the config exists, and starts recursing into it in the same moment. Nothing at the root needs editing.

## `version`

Required. Currently `1`. An unrecognized version is an error rather than a warning — a config written for a future release will mean something different than what this release would do with it.

## `root`

The directory containing the espalier tree. Defaults to `espalier`.

The espalier root is invisible to matching. Rule modules are not themselves governed by the rules they define.

## `ignore`

Paths `espalier` does not govern. Gitignore syntax — leading `!` negates, later patterns win, a trailing `/` matches directories only.

This is the only escape from strict structural enforcement. Everything else in the repository must be owned by a structural rule or it is reported as `unexpected_path`.

Ignored files are invisible, not exempt. No structural rule owns them, no constraint runs against them, and they cannot satisfy a required leaf. If a path is both required by a static leaf in the espalier and matched by `ignore`, the configuration contradicts itself and `espalier` exits `2` rather than quietly passing.

`build` does not delete under an ignored path either. Generated documentation is identified by its provenance header rather than by its location, so a repository that keeps a copy of `espalier`'s output — a golden fixture, a vendored copy of another repository — holds files a run cannot tell from its own by looking. `ignore` is where you say they are not this run's to sweep.

`ignore` also decides what is *not* a child espalier. See [Nested espaliers](#nested-espaliers).

**An ignored directory is never entered.** The patterns are consulted during the filesystem walk, not after it, so `node_modules/` costs one `readdir` rather than forty thousand. This is the same behaviour git has, and it carries git's limitation with it: a negation cannot re-include something under a directory that was pruned. `!node_modules/keep/**` matches nothing, because nothing under `node_modules/` is ever looked at. Ignore the parent more narrowly instead.

Most of this list arrives written — from `ignoreFiles`, and from what `espalier init` put there. What you add by hand should be specific to this project, and a long list of those is a signal that the espalier describes less of the repository than it claims to. Better for that to be visibly annoying in the config than filed away in a document of its own.

## `ignoreFiles`

Other files holding ignore patterns, read and prepended to `ignore`. Empty by default; `espalier init` writes `.gitignore` into it.

```yaml
ignoreFiles:
  - .gitignore
```

Paths are relative to the repository root. Each is read in order, its contents parsed as `ignore` entries, and the result placed **before** anything in `ignore` — so your own list is what wins a disagreement.

**A file named here must exist.** A missing one is `ignore_file_missing` and the run stops. The alternative — contributing nothing and carrying on — turns a typo or a deleted file into a repository that governs everything and reports thousands of paths, with the cause several steps removed from the symptom. A configuration that names a file is a configuration that depends on it.

That is also why the key is empty rather than defaulting to `.gitignore`. A default that must exist is a default that breaks every repository without one, and a repository without a `.gitignore` is unusual rather than wrong. `init` decides, once, and writes down what it decided; the config never assumes.

Every repository already maintains a list of paths that are not source: build output, dependency directories, caches, editor droppings. Keeping a second copy of it inside `espalier.config.yaml` would be a list that goes stale the first time someone adds a bundler, and staleness here is expensive — an entry missing from `espalier`'s copy is a directory it walks and a thousand paths it reports.

**This reverses an earlier position.** Previous releases said `.gitignore` was not a policy input: it answers "what is a file in this repository," not "what does `espalier` govern." That distinction is real, and it is why the second question still has its own answer in `ignore`. What changed is the first question. `espalier` used to ask git — it shelled out to `git ls-files` — and a tool that needs another binary installed to know what a file is has a dependency it should not have. Reading the file directly removes the subprocess, removes the divergence between the two code paths that existed when git was absent, and leaves one definition of candidacy written in one place.

**It is read as `espalier`'s syntax, not as git's.** No compatibility is claimed and none should be relied on. Concretely: nested `.gitignore` files in subdirectories are not read, only the paths you list; character classes (`[a-z]`) and backslash escapes are unsupported. `espalier` is not a git client and a second, silently different implementation of gitignore is exactly what this was meant to avoid. What it reads is a list of patterns in a well-known shape.

`espalier init --no-ignore-file` writes an empty list for a repository that genuinely has none, and `--no-common-ignore` declines the entries `init` would otherwise put in `ignore`. See [cli/init/README.MD](cli/init/README.MD#--ignore-file-and---no-ignore-file).

**It does not cover files that are tracked on purpose.** `package.json`, `Cargo.toml`, `pnpm-lock.yaml` and `tsconfig.json` appear in no `.gitignore` anywhere, because they are meant to be committed — and they are also not architecture, so no rule should have to declare them. That list has no upstream to defer to; it is `espalier`'s own opinion, and `espalier init --lang` writes it into `ignore` where you can read it. See [cli/init/README.MD](cli/init/README.MD#--lang).

One consequence worth knowing. A path your `.gitignore` names and your espalier declares is a contradiction, and contradictions are `ignored_required_path` — an error, not a silent winner. A repository that commits something out of `dist/` and wants it governed re-includes it, which works because `ignore` is layered after `ignoreFiles`:

```yaml
ignoreFiles:
  - .gitignore
ignore:
  - "!dist/index.js"
```

### What is ignored without being configured

Four things are invisible unconditionally, because `espalier` reporting on its own machinery is a bug rather than a finding:

- `espalier.config.yaml` itself
- every file `ignoreFiles` names
- the `root` directory
- every file `espalier build` generated

`ignoreFiles` entries are on that list for the same reason the config is: they are configuration this run read. With the default name it never showed, because the common list `init` writes covers `.gitignore` anyway — but a project naming `.customignore` should not then have to ignore it as well.

These cannot be un-ignored. Generated documentation is identified by its provenance header, not by path, because `build` distributes files through the tree rather than confining them to one directory.

The VCS directory is **not** on this list, though it once was. `.git/` is excluded by an entry `espalier init` writes into `ignore` like any other, alongside the rest of the common block — CI definitions, licence files, editor droppings, and the repository metadata that is committed on purpose. All of it is visible, appealable, and deletable by anyone who has a reason. Nothing in `espalier` decides on your behalf which paths exist.

### What counts as a file

`espalier` walks the filesystem from the repository root, and does not descend into a directory `ignore` matches. That walk is the whole definition: there is no second code path, no query to another tool, and nothing that behaves differently depending on what is installed.

The consequence to keep in mind is that **an empty `ignore` means a total walk.** A configuration that names nothing will enumerate `.git/`, `node_modules/` and every build directory, and report each file in them as `unexpected_path`. That failure is slow and extremely loud, which is the intended shape: a repository's exclusions live in a file you can read, and their absence is obvious rather than compensated for.

Untracked files are candidates. The file an agent created ten seconds ago and has not committed is linted, because it is there.

Nothing here consults git. Earlier releases ran `git ls-files --cached --others --exclude-standard` in a git-backed root and walked the filesystem otherwise, which meant two definitions of candidacy that agreed most of the time. The two disagreed in ways nobody would find on purpose — a committed `node_modules` is tracked, so git listed it and the walk did not — and the tool never promised git compliance in the first place. One walk, in one language, is what a linter can explain.

## `addons`

A path to a module providing shared resources to every `lint` function, exposed as `context.addons`.

```js
// espalier.addons.mjs
export async function setup() {
  const parser = await startGoParser();
  return {
    parseGo: (source) => parser.parse(source),
    [Symbol.asyncDispose]: () => parser.stop(),
  };
}
```

`setup` runs once before any rule, the returned object is passed to every `lint` invocation, and disposal runs after the run completes — including when it fails. A `setup` that throws is an operational failure: `espalier` exits `2` and lints nothing.

Addons exist for **expensive out-of-process resources**: a language server, an AST parser in another language, anything whose startup cost cannot be paid per file. Anything available as a package should simply be imported by the rule module that needs it — rule modules are ordinary ES modules, and routing an npm dependency through a config indirection buys nothing.

The object must be safe for concurrent use by many rules in unspecified order. Internal state is fine — a parser is stateful — but nothing a rule does through an addon may change what another rule sees.

**An addon must not read the repository.** A parser handed a path opens a file the run never saw, and `lint` caches what each rule depended on: an unrecorded read becomes a stale pass. Hand it contents, as the example does. See [cli/lint/README.MD](cli/lint/README.MD#incremental-runs).

## `build`

| Key | Default | |
|---|---|---|
| `filename` | `AGENTS.MD` | name of the generated documentation file |
| `inline` | `false` | write one document at the root instead of distributing files |

`filename` exists because tools disagree about what to call the file they read — `AGENTS.MD` is converging, but a project whose tooling wants `CLAUDE.md` changes one string rather than gaining a second output format.

`inline` is for tools that read only the repository root. See [cli/build/README.MD](cli/build/README.MD).

### Ownership

Generated files carry a provenance header, and that marker is what `espalier` uses to decide what it may delete, what to ignore while matching, and what it must not touch.

Files bearing the marker are regenerated and, when the espalier no longer produces them, removed — a stale document that keeps steering agents after its rule was deleted is worse than no document. The removal is confined to the paths this configuration governs: a marked file matched by `ignore` is left where it is. A documentation file **without** the marker halts the build rather than being overwritten; move its content into the corresponding `ESPALIER.MD` and run again. First contact with a tool is not the right moment to lose your agent instructions.

## Errors

Everything in this document that fails — a missing config, an unknown key, an unrecognized version, an addon that will not start, an `ignore` pattern that contradicts a required leaf — is an operational failure. `espalier` exits `2` and reports nothing else. A broken configuration must not be able to look like a clean repository.

Every code is listed in [ERRORS.MD](ERRORS.MD).
