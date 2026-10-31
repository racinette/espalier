# `espalier migrate`

Rewrites an older repository's configuration and espalier into the shape the
running CLI reads.

```bash
espalier migrate
```

Other commands reject settings that have been removed. `migrate` is the
exception: it removes obsolete settings, converts what replaced them, and
inserts missing required keys. It reads the files themselves, so it works the
same whether the previous upgrade was migrated or edited by hand, and running
it on a current repository changes nothing.

Migration preserves an explicit `lint.jobs` setting and validates it before
writing that project's migration files. It removes `build.guidanceMode`: a
`fixed` mode becomes `export const locked = true;` on the espalier root's
`ESPALIER.mjs`, created when there is none, and `evolving`, the unlocked
default, needs nothing. See [LOCKS.MD](../../LOCKS.MD).

## Usage

```text
espalier migrate [--dry-run]

  --dry-run        print what would be written, write nothing
  --config <path>  use this config file instead of discovering one
  --format <fmt>   human or jsonl (default: human)
  --out <dest>     stdout, stderr, or a file path (default: stdout)
```

A successful `--dry-run` simulates the normal file records and summary, including
`written` and `skipped`, and adds one notice:
“Dry run: no migration files will be changed.”
Human output places the notice after the summary; JSONL emits it as a `warning`
record. The notice appears once per invocation, including when child espaliers
are visited or no changes are needed. It follows `--out` like the other output.

## What it rewrites

Removing a version record edits the file as text. Removing `build.inline` or extending
an existing `skip` list uses a YAML document editor so block and flow forms are
both supported; comments and key order are retained, though YAML formatting
may be normalized.

**`pin` and `version`.** Removed, with the blank line after each. Neither
means anything now, and other commands reject them as unknown keys. A `pin`
below 0.7.0, or a `version` key, is read once first: such a config predates
dot-prefixed paths becoming eligible, so `migrate` also excludes `.git` and
reviews the rule tree's hidden entries.

**`A` and `X` masks.** In a config that still records a `pin` or `version`,
a mask's `A` becomes `l` and its `X` becomes `w`: since 0.11.0 `A` and `X`
are capitals only, and `l` and `w` match what they did. Every module whose
path holds one is renamed, a directory that empties is removed, and an
`instanceOf` written as a literal path is rewritten to the new name. A list
such as `[kind={A,X}]` and a literal name keep their letters. The version
record is removed in the same run, so a later `migrate` leaves an `A` written
since alone.

**`rule` to `guidance`.** A rule module's `rule` export, string or function,
is renamed `guidance`, and so is `rule` inside each entry of `groups`. Only a
direct declaration is rewritten; a destructured or re-exported `rule` is
reported, since its source has no single line to change. Prose that happens
to contain the words is untouched.

**Directory guidance.** Converts each `ESPALIER.MD` to `ESPALIER.mjs`, then
removes the Markdown source. The prose becomes a string export; `description`
and non-default `fold` become exports. Guidance uses an editable template literal
with real line breaks; backticks, interpolation markers, backslashes, and carriage
returns are escaped to preserve the original text. Converted metadata is not
duplicated in comments. Authored comments and unrecognized frontmatter fields
are retained as comments. Default `fold = false` and an empty guidance body
are omitted. This formatting applies to converted Markdown; migration does
not reformat existing `ESPALIER.mjs` prose. The `build.inline` migration below
can still update an existing module's folding export.
Malformed frontmatter and conflicting destination modules fail before any
planned source or configuration writes within that project. Migration never
imports authored code.

**Dynamic collection cardinality.** Rewrites direct literal dynamic-leaf
`optional = false` to `minMatches = 1`, and true to zero. Computed or re-exported
values require a manual conversion; migration reports the source and stops
before writing. Named leaves retain their optional semantics. For example:

```js
// Dynamic leaf before migration:
export const optional = false;

// Dynamic leaf after migration:
export const minMatches = 1;
```

For factories or re-exports, remove `optional` from each dynamic leaf's public
exports and export `minMatches` instead. Use zero for a collection allowed to
be empty. Static leaves may continue exporting `optional`; a shared factory
must expose the appropriate fields for each node kind. Migration does not
execute the factory to guess its intent.

**`build.inline`.** Removed. A true value sets the root directory module's
`fold = true`, creating the module when absent. A false value leaves authored
folding unchanged. Unsupported computed folding declarations require a manual
update. `--dry-run` reports writes and removals without changing the files.
Run `build` afterwards to update generated output.

**`ignoreFiles`.** Inserted as `[]` when the key is absent. That is what omit used to mean: do not read a sitting `.gitignore`. The list is not filled with `.gitignore` — a repository that was not reading one must not start reading one because it upgraded. A key that is already present, empty list included, is left alone.

**`skip`.** When absent, inserted with the defaults from `init`: `AGENTS.MD`,
`AGENTS.md`, `CLAUDE.md`, `.git`, and `.gitkeep`. Upgrading from before 0.7.0
also appends `.git` and `.gitkeep` to existing lists, including `[]`, unless
already excluded. This preserves their formerly implicit exclusion. Current
configs retain their explicit choices.

**Dot-prefixed paths (0.7.0).** For upgrades from older versions, `.git` is added
to `.espalierignore` unless already excluded, preserving metadata exclusion for
both files and directories. Other previously hidden rule-tree entries are
reported for review without importing modules or adding blanket dot exclusions.
Keep them as rules or exclude tooling directories explicitly with `skip`.
`--dry-run` reports the same changes and review warnings without writing files.
Nested discovery uses the planned exclusions even during a dry run.

**Root `espalier/AGENTS.MD`.** When `skip` would skip `AGENTS.MD` — the shipped list, or a list that already names it — and the espalier root exists, `migrate` writes the compact authoring contract there if the file is absent or still starts with the shipped sentinel. A customized copy (sentinel removed) is left alone. Nested `AGENTS.MD` files are the project's; migrate never creates or overwrites those. `skip: []` is an explicit decline, and no authoring file is written. See [AUTHORING.MD](../../AUTHORING.MD).

Nothing else is inserted. Optional keys with defaults — `root`, `build.filename` — stay omitted if they were omitted. Dumping those defaults into every file would fight the rule that they are optional.

A config that is already current is reported `skipped` and not written. The authoring file is considered separately: a current config whose root `AGENTS.MD` is still missing can still be written.

## What it will not do

**It will not compile the espalier.** An older config may already hold an `AGENTS.MD` the current compiler would reject until `skip` is present. The rewrite is the whole of the command; `lint` and `build` run afterwards.

**Rule changes are limited to the `rule` to `guidance` rename and the literal cardinality conversion above.** A new CLI version may change how rule
filenames or selectors are interpreted, and the config alone cannot reveal the
author's intended match set. Review the rules against [MATCHING.MD](../../MATCHING.MD)
and [TYPES.MD](../../TYPES.MD) before relying on the new version. `--dry-run`
reports configuration, exclusion-list, rule-module, directory-module, and
authoring-file writes and legacy-source removals; it does not validate rule
behavior.

Unknown keys other than `pin`, `version` and the removed `build` settings still fail. Migration only
removes recognized obsolete settings; it does not guess at typos.

## Nested espaliers

A migrate at the root visits each child the way `lint` and `build` do: its own config, its own `.espalierignore`, and its own children beneath it. A child whose config is already current is skipped. A child that cannot be rewritten is reported and the walk continues, so one broken package does not hide another.

`--config` names the espalier to start from. Discovery below that file is unchanged.

`--dry-run` reports every path that would be written and writes none of them.

## After `migrate`

1. Run [`espalier lint`](../lint/README.MD) and [`espalier build`](../build/README.MD), as any version change requires.
2. Review the generated documents before committing the upgrade.

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
