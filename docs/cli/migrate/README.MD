# `espalier migrate`

Updates repository configuration and directory guidance modules for the
running CLI.

```bash
espalier migrate
```

Commands that load repository configuration require a `pin` matching this
package's version. `migrate` is the exception: it updates `pin`, removes
obsolete settings, and inserts missing required keys. After it runs, this CLI
owns the repository. An older CLI will refuse the result.

Migration preserves explicit `build.guidanceMode` and `lint.jobs` settings
and validates them before writing that project's migration files. It does not
switch between evolving and fixed guidance. The refreshed authoring contract reads the mode
from the governing configuration.

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

Ordinary pin updates edit the file as text. Removing `build.inline` or extending
an existing `skip` list uses a YAML document editor so block and flow forms are
both supported; comments and key order are retained, though YAML formatting
may be normalized.

**`pin`.** Set to the running package version. A pin that is already that version is left as a rewrite of the same line only when something else in the file still needs changing.

**`version`.** Removed. `pin` is the only version; other commands that load
repository configuration reject this leftover schema identifier as an unknown key.

**Directory guidance.** Converts each `ESPALIER.MD` to `ESPALIER.mjs`, then
removes the Markdown source. The prose becomes a string export; `description`
and non-default `fold` become exports. Guidance uses an editable template literal
with real line breaks; backticks, interpolation markers, backslashes, and carriage
returns are escaped to preserve the original text. Converted metadata is not
duplicated in comments. Authored comments and unrecognized frontmatter fields
are retained as comments. Default `fold = false` is omitted.
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

**It will not downgrade.** If `pin` is newer than the running CLI, the run stops with `cannot_downgrade` and the file is not touched. Install the recorded version, or run migrate with that newer CLI.

**It will not compile the espalier.** An older config may already hold an `AGENTS.MD` the current compiler would reject until `skip` is present. The rewrite is the whole of the command; `lint` and `build` run afterwards.

**Rule changes are limited to the literal cardinality conversion above.** A new CLI version may change how rule
filenames or selectors are interpreted, and the config alone cannot reveal the
author's intended match set. Review the rules against [MATCHING.MD](../../MATCHING.MD)
and [TYPES.MD](../../TYPES.MD) before relying on the new pin. `--dry-run`
reports configuration, exclusion-list, rule-module, directory-module, and
authoring-file writes and legacy-source removals; it does not validate rule
behavior.

Unknown keys other than `version` and `build.inline` still fail. Migration only
removes recognized obsolete settings; it does not guess at typos.

## Nested espaliers

A migrate at the root visits each child the way `lint` and `build` do: its own config, its own `.espalierignore`, and its own children beneath it. A child whose config is already current is skipped. A child that cannot be rewritten is reported and the walk continues, so one broken package does not hide another.

`--config` names the espalier to start from. Discovery below that file is unchanged.

`--dry-run` reports every path that would be written and writes none of them.

## After `migrate`

1. Install the CLI this repository now pins, if you have not already.
2. Run [`espalier lint`](../lint/README.MD) and [`espalier build`](../build/README.MD) the way any pin change requires.

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
