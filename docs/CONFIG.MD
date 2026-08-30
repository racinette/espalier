# Configuration

`espalier` is configured by an `espalier.config.yaml` at the repository root, and by a `.espalierignore` beside it.

```yaml
version: 1

name: acme-web

root: espalier

ignoreFiles:
  - .gitignore

addons: ./espalier.addons.mjs

build:
  filename: AGENTS.MD
  inline: false
```

```
# .espalierignore — generated output, checked in so the build stays honest.
src/api/*.generated.ts

# Third-party source. Not ours to shape.
vendor/**

# Written by the migration tool, in the order it decides.
db/migrations/**
```

Two files rather than one because they answer to different readers. The config is settings, read once by whoever set the project up. `.espalierignore` is a list that grows and shrinks as the espalier does, it is line-oriented rather than nested, and its comments are read back out into the documentation `build` writes — a YAML key can hold the patterns but not the reasons.

Every key except `version` is optional. Unknown keys are errors — a typo in a config file is not something to discover three weeks later when the rule it disabled turns out never to have run.

## Discovery

`espalier` walks upward from the working directory until it finds `espalier.config.yaml`. **The directory containing that file is the repository root**, and every path in the config, every path in an issue, and every path in the espalier tree is relative to it.

`--config <path>` overrides discovery. The root becomes that file's directory, regardless of where the command was invoked.

If no config is found, `espalier` exits `2`. There is no implicit default configuration, because guessing a repository root is a good way to lint someone's home directory.

## Nested espaliers

A package in a monorepo may hold an `espalier.config.yaml` of its own. Finding one is how `espalier` learns where one espalier's authority ends and another's begins: **the boundary is discovered, never declared.** There is no `children` key and no list to keep in sync — putting a config in a directory is the whole act.

**A directory holding a config is a child espalier, and its subtree leaves the outer one.** Nothing under it is matched or owned, no constraint reaches in — a root `[...path]` rule stops at the boundary — nothing there is `unexpected_path`, and `build` neither places a document there nor sweeps one away.

**Every command then runs it.** `lint` and `build` at the root visit each child once the outer run is finished, and a visit is a complete separate run: its own config, its own espalier, its own `.espalierignore`, `addons` and `build` settings, and its own children beneath it. Nothing is inherited and nothing crosses.

Those two halves are one feature. A subtree that left the outer espalier and were never visited would be ungoverned, which is the failure this tool exists to prevent. A subtree visited from inside the outer run would answer to two espaliers at once, and a path with two answers is worse than either. Together they say: **every file is governed by exactly one espalier, and one command still checks them all.**

The alternative was to let the outer espalier's rules reach in, which sounds like sharing and is not. A file's answer would then depend on which espalier you happened to run — the root's constraints in CI, the package's on a developer's machine — and a rule that means different things depending on where you stood is not a rule. Rules are shared the way code is shared: a rule module is an ES module, so several espaliers can `import` the same constraint and each declares that it applies.

The trade is explicit. The root can require nothing of a child, because it cannot see one. If every package must have a `README.MD`, each package's espalier says so.

### Suppressing discovery

Exclusion still wins. A config the outer `.espalierignore` matches is not a child at all: the subtree is ignored the ordinary way and nothing recurses into it.

That is what a repository storing configs as data needs. `espalier`'s own `fixtures/` holds sixty of them, several deliberately invalid, and `espalier lint` at the root running all sixty is not what anyone means by it. Ignoring the config file alone is enough to demote a child to plain content, though ignoring the directory is usually what is wanted.

Patterns from `ignoreFiles` count here too, which is worth knowing before it surprises someone: a `.gitignore` entry covering a package directory stops that package's espalier from being discovered. Usually that is right — a directory git does not track is not a subtree anyone is governing — but it means a child can disappear from a change made in another tool's file. `espalier explain <dir>` says which pattern did it.

### Making one

`cd packages/web && espalier init`. The outer espalier stops governing that subtree the moment the config exists, and starts recursing into it in the same moment. Nothing at the root needs editing.

## `version`

Required. Currently `1`. An unrecognized version is an error rather than a warning — a config written for a future release will mean something different than what this release would do with it.

## `name`

What the project is called. It heads every document `espalier build` writes — see [cli/build/README.MD](cli/build/README.MD#the-heading).

One line, and a name rather than a description: it is read by someone who already has the repository open, so `acme-web` earns its place and *the Acme customer-facing web application* does not. The prose under the heading is where a description belongs, and the root `ESPALIER.MD` is where that prose is written.

Optional, and a project that has not named itself gets no heading rather than a guessed one. `espalier init` writes the directory's own name, which is a guess an author can see and correct rather than one buried in the tool.

In a monorepo each espalier names itself, and each names something different: the package, not the workspace. A document is read in the directory it was written into, and the name is what tells a reader which project that directory belongs to.

## `root`

The directory containing the espalier tree. Defaults to `espalier`.

The espalier root is invisible to matching. Rule modules are not themselves governed by the rules they define.

The value is a directory path, and is read as one: `espalier`, `./espalier` and `espalier/` all name the same place. A path naming the repository root itself is refused — every path would then be invisible, which is not a configuration with a meaning.

## `.espalierignore`

Paths `espalier` does not govern, one per line, in a file beside `espalier.config.yaml`. Gitignore syntax — leading `!` negates, later patterns win, a trailing `/` matches directories only, and `#` at the start of a line opens a comment.

This is the only escape from strict structural enforcement. Everything else in the repository must be owned by a structural rule or it is reported as `unexpected_path`.

**A repository is not expected to end up fully described**, and that is worth saying plainly because everything else here reads as though it were. Partial adoption is the normal state: `espalier adopt` exists to move one directory at a time, `espalier init --ignore-all` exists to put a whole tree out of scope while you start, and both would be incoherent if the tool claimed every file. What an exclusion means is *outside this project layout*, not *a place for work that does not fit elsewhere*. See [cli/build/README.MD](cli/build/README.MD#other-repository-paths) for how generated guidance accounts for those paths.

**The comments are the reason this is a file.** An exclusion without a reason is a decision nobody can review, and the two kinds are indistinguishable once written: `node_modules/` will never have a rule, while `src/legacy/` does not have one *yet*. Only the person excluding it knows which, and only a file with room to say so lets them.

```
# Not this project's architecture. Their shape is dictated by the tools
# that read them.
package.json
tsconfig.json

# Not described yet. Adopt one directory at a time; this list shrinking
# is what progress looks like.
src/legacy/
```

A comment introduces the entries beneath it, up to the next blank line. There are no trailing comments: `dist/ # build output` is a pattern containing a hash, matching a file nobody has, which is git's rule and a good one — a reason worth writing is a reason worth a line.

**`espalier build` reads those comments into the documentation it generates.** That is what makes the list reviewable: an agent opening a directory sees which materialized paths sit outside the project layout and why, in the same file that describes what belongs there. See [cli/build/README.MD](cli/build/README.MD#other-repository-paths). Nothing else in the repository is read this way — a comment in a `.gitignore` was written for git, by someone answering a different question, and quoting it into your architecture would put words in their mouth.

Ignored files are invisible, not exempt. No structural rule owns them, no constraint runs against them, and they cannot satisfy a required leaf. If a path is both required by a static leaf in the espalier and excluded, the configuration contradicts itself and `espalier` exits `2` rather than quietly passing.

`build` does not delete under an ignored path either. Generated documentation is identified by its provenance header rather than by its location, so a repository that keeps a copy of `espalier`'s output — a golden fixture, a vendored copy of another repository — holds files a run cannot tell from its own by looking. This file is where you say they are not this run's to sweep.

It also decides what is *not* a child espalier. See [Nested espaliers](#nested-espaliers).

**An ignored directory is never entered.** The patterns are consulted during the filesystem walk, not after it, so `node_modules/` costs one `readdir` rather than forty thousand. This is the same behaviour git has, and it carries git's limitation with it: a negation cannot re-include something under a directory that was pruned. `!node_modules/keep/**` matches nothing, because nothing under `node_modules/` is ever looked at. Un-prune the parent first — see [the recipe below](#ignorefiles).

**Only a pattern naming the directory prunes it.** `dist/` and `dist` do; `dist/**` does not, because it says what is inside is ignored rather than that the directory is. Both report the same paths and the difference is otherwise invisible, which is why it is worth stating: `dist/**` is the form a negation can reach into, and `dist/` is the form that costs nothing to skip. A path that cannot be read is the other place it shows — see [Symlinks](#symlinks).

Most of this arrives written — from `ignoreFiles`, and from what `espalier init` put here. What you add by hand should be specific to this project, and a long list of those is a signal that the espalier describes less of the repository than it claims to.

A list this long is easy to let grow, and a growing one means the espalier describes less of the repository than it claims to. The comments are what keep that reviewable: each entry says why it is there, `build` puts those reasons in front of whoever reads the documentation, and an entry nobody can justify is one somebody can delete.

## `ignoreFiles`

Other files holding ignore patterns, read and prepended to `.espalierignore`. Empty by default; `espalier init` writes `.gitignore` into it.

```yaml
ignoreFiles:
  - .gitignore
```

Paths are relative to the repository root. Each is read in order, its contents parsed the same way, and the result placed **before** `.espalierignore` — so your own list is what wins a disagreement. Their comments are read as comments and go no further: only `.espalierignore` supplies the reasons `build` writes down.

**A file named here must exist.** A missing one is `ignore_file_missing` and the run stops. The alternative — contributing nothing and carrying on — turns a typo or a deleted file into a repository that governs everything and reports thousands of paths, with the cause several steps removed from the symptom. A configuration that names a file is a configuration that depends on it.

That is also why the key is empty rather than defaulting to `.gitignore`. A default that must exist is a default that breaks every repository without one, and a repository without a `.gitignore` is unusual rather than wrong. `init` decides, once, and writes down what it decided; the config never assumes.

Every repository already maintains a list of paths that are not source: build output, dependency directories, caches, editor droppings. Keeping a second copy of it inside `espalier.config.yaml` would be a list that goes stale the first time someone adds a bundler, and staleness here is expensive — an entry missing from `espalier`'s copy is a directory it walks and a thousand paths it reports.

**It answers a different question from `.espalierignore`.** A `.gitignore` says what is a file in this repository; `.espalierignore` says what `espalier` governs. The two questions are genuinely separate, which is why each keeps its own answer — and reading the first one directly rather than asking git for it means no second binary has to be installed before `espalier` knows what a file is.

**It is read as `espalier`'s syntax, not as git's.** No compatibility is claimed and none should be relied on. Concretely: nested `.gitignore` files in subdirectories are not read, only the paths you list; character classes (`[a-z]`) and backslash escapes are unsupported. `espalier` is not a git client and a second, silently different implementation of gitignore is exactly what this was meant to avoid. What it reads is a list of patterns in a well-known shape.

`espalier init --no-ignore-file` writes an empty list for a repository that genuinely has none, and `--no-common-ignore` declines the entries `init` would otherwise write. See [cli/init/README.MD](cli/init/README.MD#--ignore-file-and---no-ignore-file).

**It does not cover files that are tracked on purpose.** `package.json`, `Cargo.toml`, `pnpm-lock.yaml` and `tsconfig.json` appear in no `.gitignore` anywhere, because they are meant to be committed — and they are also not architecture, so no rule should have to declare them. That list has no upstream to defer to; it is `espalier`'s own opinion, and `espalier init --lang` writes it into `.espalierignore` where you can read it. See [cli/init/README.MD](cli/init/README.MD#--lang).

One consequence worth knowing. A path your `.gitignore` names and your espalier declares is a contradiction, and contradictions are `ignored_required_path` — an error, not a silent winner. A repository that commits something out of `dist/` and wants it governed re-includes it, which is possible because `.espalierignore` is layered after `ignoreFiles`:

`espalier.config.yaml`:

```yaml
ignoreFiles:
  - .gitignore
```

`.espalierignore`:

```
# `dist/index.js` is committed on purpose and the espalier declares it.
# All three lines are load-bearing; see below.
!dist/
dist/**
!dist/index.js
```

**All three lines are needed**, and the first is the one that is easy to miss. A `.gitignore` almost always spells this `dist/`, which excludes the directory itself — and a directory that is excluded is never entered, so nothing under it is ever looked at and `!dist/index.js` alone matches nothing. That is git's rule as much as this one's, and it is why the negation has to un-prune the directory before it can say anything about a file inside.

The failure when you skip it is `ignored_required_path`, which names the leaf rather than the parent that shadowed it. Read it as: something above this path is pruned.

### What is ignored without being configured

Five things are invisible unconditionally, because `espalier` reporting on its own machinery is a bug rather than a finding:

- `espalier.config.yaml` itself
- `.espalierignore`
- every file `ignoreFiles` names
- the `root` directory
- every file `espalier build` generated

`.espalierignore` is on the list for the same reason the config is, and could not be anywhere else: it is dot-prefixed, so no rule can declare it — see [MATCHING.MD](MATCHING.MD#node-kinds) — and a file that cannot be declared and is not invisible is a file every run reports forever.

`ignoreFiles` entries are on that list for the same reason the config is: they are configuration this run read. With the default name it never showed, because the common list `init` writes covers `.gitignore` anyway — but a project naming `.customignore` should not then have to ignore it as well.

These cannot be un-ignored. Generated documentation is identified by its provenance header, not by path, because `build` distributes files through the tree rather than confining them to one directory.

The VCS directory is **not** on this list. `.git/` is excluded by an entry `espalier init` writes into `.espalierignore` like any other, alongside the rest of the common block — CI definitions, licence files, editor droppings, and the repository metadata that is committed on purpose. All of it is visible, appealable, and deletable by anyone who has a reason. Nothing in `espalier` decides on your behalf which paths exist.

### What counts as a file

`espalier` walks the filesystem from the repository root, and does not descend into a directory an exclusion matches. That walk is the whole definition: there is no second code path, no query to another tool, and nothing that behaves differently depending on what is installed.

The consequence to keep in mind is that **excluding nothing means a total walk.** A configuration that names nothing will enumerate `.git/`, `node_modules/` and every build directory, and report each file in them as `unexpected_path`. That failure is slow and extremely loud, which is the intended shape: a repository's exclusions live in a file you can read, and their absence is obvious rather than compensated for.

Untracked files are candidates. The file an agent created ten seconds ago and has not committed is linted, because it is there.

Every candidate is a file to be read, and reading means UTF-8. There is no binary detection and no extension list: a PNG handed to a rule arrives as the characters UTF-8 decoding produces, replacement characters and all. Rules match on paths, so a rule only sees what its own pattern claimed — and a directory of binaries is a directory to exclude, which is the same answer as for anything else nothing declares.

Nothing here consults git. Asking it would mean two definitions of candidacy — one for a git-backed root and one for everywhere else — agreeing most of the time and parting where nobody would look: a committed `node_modules` is tracked, so git would list it and the walk would not. No git compliance is promised, and one walk, in one language, is what a linter can explain.

### Symlinks

**A symlink is followed.** A link to a file is a file, a link to a directory is walked, and neither is a category of its own.

Skipping them would make a sixth thing invisible unconditionally, and it would be the only one invisible without anybody having decided so. `espalier` never writes to the files it governs, so a link is nothing more than a second path to something it reads. A link you do not want governed is an `.espalierignore` entry, like everything else you do not want governed.

The consequence is worth stating plainly: **a link pointing outside the repository brings what it points at into the governed set.** Its content is linted under the path the link occupies, and a rule can `read` it there. That is the link's doing rather than `espalier`'s, and it is undone the way any other unwanted path is.

**A link onto a directory containing it is not followed.** A link to an ancestor otherwise re-enters everything above it, and again, until the kernel refuses at around forty levels of indirection — the walk terminates either way, but a single file under such a link is reported forty-one times before it does. Nothing is lost by cutting it: the directory it points at is one the walk is already inside.

**Two links onto the same directory are two directories**, and everything under them is governed twice, under both paths. Deduplicating would mean reporting a file under whichever path the walk happened to reach it by first, and directory listings are not returned in an order anything promises — the same repository would answer differently on two machines. Both paths exist; a repository that does not want both says so in `.espalierignore`.

**A link pointing nowhere is a failure**, and so is a file or directory this process may not read. `espalier` exits `2` with `unreadable_path` and lints nothing. Something that could not be read cannot be pronounced correct, and a run that quietly stepped over it would report a clean repository it never finished inspecting — the same reasoning as [Errors](#errors) below.

A path the rules exclude is never read, so it never fails this way. For a directory that means the *pruning* form: `vendor/` skips it unopened, while `vendor/**` ignores what is inside and still opens it to find out what that is. A directory you cannot read at all is excluded with `vendor/`.

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

Files bearing the marker are regenerated and, when the espalier no longer produces them, removed — a stale document that keeps steering agents after its rule was deleted is worse than no document. The removal is confined to the paths this configuration governs: a marked file that is excluded is left where it is. A documentation file **without** the marker halts the build rather than being overwritten; move its content into the corresponding `ESPALIER.MD` and run again. First contact with a tool is not the right moment to lose your agent instructions.

## Errors

Everything in this document that fails — a missing config, an unknown key, an unrecognized version, an addon that will not start, an exclusion that contradicts a required leaf — is an operational failure. `espalier` exits `2` and reports nothing else. A broken configuration must not be able to look like a clean repository.

Every code is listed in [ERRORS.MD](ERRORS.MD).
