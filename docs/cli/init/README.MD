# `espalier init`

Bootstraps a repository: writes the configuration and creates the espalier root.

```bash
espalier init --lang javascript
```

`init` describes nothing. It does not read your code, infer patterns, or generate rule modules — that is [`espalier adopt`](../adopt/README.MD), and it runs later, one area at a time.

## Usage

```text
espalier init [--config <path>] [--root <dir>] [--lang <name>]...
              [--ignore-file <path>]... [--no-ignore-file]
              [--no-common-ignore] [--ignore-all]

  --root <dir>         espalier source directory (default: espalier)
  -l, --lang <n>       also write the ignore entries for this language;
                       repeat for a polyglot repository
  -i, --ignore-file    a file holding ignore patterns (default: .gitignore);
                       repeat to name several, read in the order given
  --no-ignore-file     write no `ignoreFiles` entry at all
  --no-common-ignore   write no common entries either; `.espalierignore`
                       is then yours alone
  --ignore-all         also write an ignore entry for every top-level path,
                       putting the existing tree out of scope
  --config <path>    write the config here instead of ./espalier.config.yaml
  --format <fmt>     human or jsonl (default: human)
  --out <dest>       stdout, stderr, or a file path (default: stdout)
```

`init` refuses to overwrite an existing configuration. Exit `2`, and nothing is written.

## What it writes

```yaml
version: 1

root: espalier

ignoreFiles:
  - .gitignore
```

And a `.espalierignore` beside it:

```
# Version control metadata. `.gitignore` never lists `.git/` — git has no need
# to ignore itself — so this is the one exclusion no other file supplies.
.git/
.hg/
.svn/

# Repository metadata. Tracked on purpose, and dictated by the tool that reads
# them rather than by this project's architecture.
.gitignore
.gitattributes
# …

# Continuous integration.
.github/
# …

# Licence and legal.
LICENSE
# …

# Editor, agent and operating system droppings. The agent directories are here
# for the same reason as the editor ones: dot-prefixed, so no rule could declare
# them even if a project wanted to.
.vscode/
# …
```

Plus `espalier/`, holding a `.gitkeep`.

`ignoreFiles` has no default — an empty key is what a hand-written config gets. `init` is where the choice is made, and writing it down is the whole of making it: a file quietly excluding paths is otherwise something you discover months later, wondering why a check never ran.

`.espalierignore` is `ignores/_common.gitignore`, copied verbatim, comments and all. It holds what belongs to no language and to no `.gitignore`: version control directories, the repository metadata that is committed on purpose, CI definitions, licence files, and editor droppings. Every entry is a line you can read and delete.

Verbatim includes the comments, and that now costs something to get wrong. `espalier build` writes each comment into the documentation for the directory the entry sits in — see [cli/build/README.MD](../build/README.MD#not-described-here) — so a shipped list is also the wording an agent reads when it asks why `node_modules/` is not described. The comments in `ignores/` are written to be read twice: once by the person editing the file, once by whoever the documents are for.

The VCS entries are the reason it is written unconditionally. `.gitignore` does not list `.git/` — git has no need to ignore itself — so it is the one exclusion no external file supplies. Delete that line and `espalier` walks several tens of thousands of objects and reports every one of them, which is a mistake you will notice within a second.

The `.gitkeep` is there because git does not track empty directories. Without it the espalier root vanishes on the first commit and the next person to clone gets `espalier_root_missing` before they have written a line. Dotfiles in the espalier are skipped rather than read, so it costs nothing — see [MATCHING.MD](../../MATCHING.MD#node-kinds).

## `--ignore-file` and `--no-ignore-file`

`init` writes `ignoreFiles: [.gitignore]` and expects to find one. If there is none, it stops:

```text
espalier: .gitignore is not here. Name another with --ignore-file, or
decline one with --no-ignore-file.  (ignore_file_missing)
```

Nothing is written. A repository without a `.gitignore` is unusual rather than wrong, so this is not a judgement about how you keep your repository — it is that `ignoreFiles` is what stops `espalier` walking `node_modules/`, and a config claiming a file that is not there governs everything while looking correct. The failure belongs at the moment the claim is made, not at the first `lint` on somebody else's machine.

Both ways out are one flag:

```bash
espalier init --ignore-file .customignore --ignore-file .gitignore
espalier init --no-ignore-file
```

`-i` writes exactly the paths given, in the order given, and each must exist for the same reason `.gitignore` must. `--no-ignore-file` writes `ignoreFiles: []` — recorded rather than omitted, so the config says a decision was made rather than leaving the next reader to wonder. The two together are a contradiction and are refused as `contradictory_flags` rather than resolved by precedence.

After `init`, the rule still holds: a file named in `ignoreFiles` that is not there fails any command that loads the config. See [CONFIG.MD](../../CONFIG.MD#ignorefiles).

## `--no-common-ignore`

Writes none of the common block. `.espalierignore` is then whatever `--lang` and `--ignore-all` put there, and nothing else:

```bash
espalier init --no-common-ignore
```

```yaml
version: 1

root: espalier

ignoreFiles:
  - .gitignore
```

Use it when the common list is wrong for this repository — a project that genuinely governs its CI definitions, or one whose exclusions are all in `.gitignore` already and wants no second copy.

**The consequence to know before reaching for it.** `.git/` is in that block, and no `.gitignore` names it, so a config without either walks several tens of thousands of objects and reports every one of them. That is loud and immediate rather than subtle, and one `ignore` line fixes it — but it is yours to write.

There is no matching config key. Nothing here is applied at run time: the block is copied into `.espalierignore` and then belongs to you, so the way to remove an entry after the fact is to delete the line. This flag exists for the case where you did not want it written in the first place.

## `--lang`

Writes the ignore entries for a language's tooling — manifests, lockfiles, and the configuration files that come with them:

```bash
espalier init --lang javascript --lang python
```

```
# … the common block, as above …

# javascript
package.json
package-lock.json
yarn.lock
pnpm-lock.yaml
tsconfig.json
  - tsconfig.*.json
  # …

  # python
  - pyproject.toml
  - setup.cfg
  - requirements.txt
  # …
```

These are not files `.gitignore` knows about. A lockfile is committed on purpose, and `pyproject.toml` is the point of a Python project — but neither is a placement decision anyone made, and a structural rule declaring them would be describing a package manager rather than an architecture.

The lists ship as data, one file per language, under `ignores/` in the installed package. `_common` is the one written every time; its leading underscore is what keeps it out of the language names. `--lang go` writes `ignores/go.gitignore`; the set of legal names is what that directory contains, and an unrecognized one is `unknown_language` with the available names listed. They are `.gitignore`-suffixed for the same reason [github/gitignore](https://github.com/github/gitignore) names its files that way — the syntax is gitignore's, and editors highlight it.

**They are copied, not referenced.** `init` reads them once and writes their contents into your `.espalierignore`. Nothing at lint time opens them, no config points at a file inside `node_modules`, and upgrading `espalier` never changes what your repository governs. The cost is that a config written in 2026 does not learn about a lockfile invented in 2027; the benefit is that a config says what it does, and `espalier explain` can answer with a line number instead of "a built-in list."

### What the lists hold, and what they deliberately do not

In: lockfiles, manifests, tool configuration, and the editor and CI metadata that comes with a given ecosystem. None of them is a placement decision; all of them are dictated by something other than the project's architecture.

Out: `README.MD`, `CHANGELOG.MD`, `Makefile`, `Dockerfile`, `CMakeLists.txt`. Each is common enough to look like an oversight, and each is a file some projects genuinely place on purpose — a README per package directory is exactly the kind of convention an espalier exists to hold. Being reported as `unexpected_path` until you say what they are is the correct outcome for a tool whose whole claim is that nothing goes unaccounted for.

The bar is **is this file ever a project's own structural decision**, not is it common. An entry that is missing costs you one line; an entry that is wrong costs you a file you meant to govern, and you will not go looking for it. Because the lists are copied rather than applied, both mistakes are yours to fix in your own config with a text editor, and neither arrives in an upgrade.

## Why no ignore list for your source

Structural enforcement is total: every file `espalier` can see must be declared, or it is reported as `unexpected_path`. On a repository that already exists, the first run therefore reports every source file at once.

That is loud, and it is also honest, and at this moment nobody is listening. You have just run `init` on a repository that declares nothing; you are not going to wire that into CI before describing anything. The noise is visible only to the person who caused it, who knows exactly why it is there and what it is a list of.

Writing an ignore list for your own tree here would mean guessing your source layout before anyone has said what matters, and leaving `adopt` to unpick a coarse `src/**` into `src/api/**`, `src/lib/**` and the rest each time it runs. Better to add entries when the noise starts costing you something, and to add the ones you actually want.

## `--ignore-all`

Writes one entry per top-level path — directories as `<dir>/**`, files by name — so `espalier lint` passes from the first run:

```
# espalier governs nothing yet.
# Remove entries as you bring each area under the espalier — see `espalier adopt`.
public/**
src/**
test/**
main.ts
```

Paths already covered by `ignoreFiles` or by `--lang` are left out; so is the espalier root.

Use it when you are introducing `espalier` to a repository that is already in CI and a red build would be a problem. The list is a **backlog, not a junk drawer**: entries arrive generated and leave by hand, and the list shrinking is what progress looks like.

Note that this is not only a bootstrap concern. A repository is never expected to end up fully described, so a partial espalier reports its undescribed areas for as long as it stays partial. `.espalierignore` is what makes that liveable, whenever you decide you want it.

## After `init`

1. Write `espalier/ESPALIER.MD` — what this project is. It becomes the preamble of the generated root documentation.
2. Bring one area under the espalier with [`espalier adopt`](../adopt/README.MD), or by hand.
3. Run [`espalier build`](../build/README.MD) to generate the documentation agents read.
4. Run [`espalier lint`](../lint/README.MD) to check the areas you have described.

Repeat step 2 for as long as it stays useful. There is no expectation that a repository ends up fully described — an espalier covering the three directories where architecture actually matters is worth more than one covering everything shallowly.

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
