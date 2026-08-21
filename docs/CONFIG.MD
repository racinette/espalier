# Configuration

`espalier` is configured by a single `espalier.config.yaml` at the repository root.

```yaml
version: 1

root: espalier

defaultIgnore: true

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

## `version`

Required. Currently `1`. An unrecognized version is an error rather than a warning — a config written for a future release will mean something different than what this release would do with it.

## `root`

The directory containing the espalier tree. Defaults to `espalier`.

The espalier root is invisible to matching. Rule modules are not themselves governed by the rules they define.

## `ignore`

Paths `espalier` does not govern. Gitignore syntax — leading `!` negates, later patterns win, a trailing `/` matches directories only.

This is the only escape from strict structural enforcement. Everything else in the repository must be owned by a structural rule or it is reported as `unexpected_path`.

Ignored files are invisible, not exempt. No structural rule owns them, no constraint runs against them, and they cannot satisfy a required leaf. If a path is both required by a static leaf in the espalier and matched by `ignore`, the configuration contradicts itself and `espalier` exits `2` rather than quietly passing.

`build` does not delete under an ignored path either. Generated documentation is identified by its provenance header rather than by its location, so a repository that keeps a copy of `espalier`'s output — a golden fixture, a vendored package, a nested project with an espalier of its own — holds files a run cannot tell from its own by looking. `ignore` is where you say they are not this run's to sweep.

Keep this list short. Boilerplate is handled by `defaultIgnore`, so what remains should be things specific to this project — and a long list of those is a signal that the espalier describes less of the repository than it claims to. Better for that to be visibly annoying in the config than filed away in a document of its own.

### Nested espaliers

One file, one owner. A repository holding a second `espalier.config.yaml` — a monorepo package that wants an espalier of its own — has to say which of the two governs that subtree, and the only available answer is the outer one giving it up. Any `espalier.config.yaml` other than the one this run loaded is a `conflicting_espaliers` failure unless `ignore` matches it.

There is no composing them. If the root espalier declared `packages/web/src/` and the package's own espalier declared something else under `src/`, both would be right and one path would have two answers — worse than either alone. So the boundary is a partition rather than an overlay: `ignore: [packages/web/**]` hands the subtree over whole, and `espalier lint` run inside `packages/web` governs it in full.

Ignore the package, not just its config. Ignoring the file alone leaves the rule modules beneath it visible to the outer run, which reports every one of them as `unexpected_path`.

None of this stops packages sharing rules. A rule module is an ES module, so one espalier can `import` from another — put the constraints everyone follows in a single file and have each espalier pull them in. What a partition cannot give you is enforcement across the boundary: a subtree the root has ignored is a subtree the root can require nothing of.

## `defaultIgnore`

Applies a built-in list of paths no project wants to govern: manifests and lockfiles, tool configuration, CI definitions, licence and editor files. Defaults to `true`.

Nobody should hand-write `package.json`, `tsconfig.json`, `.github/**` and a lockfile into every project they start, and a generated config listing forty such entries reads as "this tool is complicated" before anyone has used it. Keeping the list in `espalier` also means it can be corrected centrally rather than frozen into every config that ran `init` two years ago.

The list is universal rather than detected per language. Ignoring `Cargo.lock` in a JavaScript project costs nothing, while detection is a guess that fails on polyglot repositories.

Layering is: the default list first, then `ignore`. Because `ignore` uses gitignore syntax, a project that wants to govern something the default list covers re-includes it rather than turning the whole list off:

```yaml
defaultIgnore: true
ignore:
  - "!package.json"
```

A lint rule enforcing the shape of `package.json` is a reasonable thing to want, and wanting it should not cost you the other thirty-nine entries. `defaultIgnore: false` remains available for projects that want to specify everything themselves.

**A path the espalier declares overrides the default list.** Declaring `package.json.mjs` is an unambiguous statement that you want to govern `package.json`, so the built-in list steps aside. This differs from `ignore`, where a declaration and an ignore together are a contradiction and an error — your `ignore` is an explicit statement about this repository, while the default list is a heuristic the tool ships. Explicit beats declared; declared beats heuristic.

**The list is append-only within a major version.** Adding an entry can only make a run quieter: files you declared stay governed, and files you did not were being reported as `unexpected_path` anyway. Removing one can only make a run noisier, producing violations from an upgrade nobody asked for — so removals are breaking changes and require a major version. A project depending on `^2` never sees its governed set grow underneath it.

That asymmetry decides what belongs. An entry omitted today costs a project one line of `ignore` and can be added in any minor release; an entry included wrongly is stuck until the next major. So the bar is **is this file ever a project's own structural decision**, not is it common. A file matched here and wanted back costs one line too — `ignore: ["!Dockerfile"]` — but the shipped list should not be making that bet on anyone's behalf.

### What is deliberately absent

`README.MD`, `CHANGELOG.MD`, `Makefile`, `Dockerfile`, `CMakeLists.txt`. Each is common enough to look like an oversight, and each is a file some projects genuinely place on purpose — a README per package directory is exactly the kind of convention an espalier exists to hold. Being reported as `unexpected_path` until you say what they are is the correct outcome for a tool whose whole claim is that nothing goes unaccounted for.

Lockfiles, manifests, tool configuration, CI definitions, licences, and editor and VCS metadata are in. None of them is a placement decision; all of them are dictated by something other than the project's architecture.

`espalier explain <path>` reports which list excluded a path — how you find out without reading this document, and the answer to a question otherwise discovered months later.

### What is ignored without being configured

Four things are invisible unconditionally, because `espalier` reporting on its own machinery is a bug rather than a finding:

- the VCS directory
- `espalier.config.yaml` itself
- the `root` directory
- every file `espalier build` generated

These cannot be un-ignored. Generated documentation is identified by its provenance header, not by path, because `build` distributes files through the tree rather than confining them to one directory.

### What counts as a file

The set of candidate files is what git already knows about:

```bash
git ls-files --cached --others --exclude-standard
```

Tracked files, plus untracked files that are not gitignored. This means `node_modules`, `dist`, and every other build artifact are excluded without anyone configuring it, and — importantly — the file an agent created ten seconds ago and has not committed is still linted.

`.gitignore` is not a policy input. It answers "what is a file in this repository," not "what does `espalier` govern." The second question is `ignore`, and the two lists are unrelated: a committed generated file is invisible to git's ignore rules and very much something you want `espalier` to skip.

The root is git-backed when it contains a `.git` entry of its own. Otherwise `espalier` walks the filesystem with a small built-in exclusion list.

Small, and it stays small. Unlike `defaultIgnore`, nothing can re-include what this list skips — a path excluded here is not a file as far as `espalier` is concerned, and no configuration brings it back. So it holds only directories that are machinery rather than content: the VCS directory, `node_modules`, `__pycache__`, `.venv`. A build output directory is not on it, because `build/` and `target/` are real source directories in enough projects that skipping them would silently un-govern a subtree.

The test is deliberately local rather than asking git. A directory nested inside some larger repository is not thereby a repository — asking git would answer about the enclosing one, and every path would resolve against a root the config never named.

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
