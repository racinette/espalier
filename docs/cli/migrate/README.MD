# `espalier migrate`

Rewrites `espalier.config.yaml` for the running CLI.

```bash
espalier migrate
```

Commands that load repository configuration require a `pin` matching this
package's version. `migrate` is the exception: it updates `pin`, removes the
obsolete `version` key, and inserts missing required keys. After it runs,
this CLI owns the repository. An older CLI will refuse the result.

## Usage

```text
espalier migrate [--dry-run]

  --dry-run        print what would be written, write nothing
  --config <path>  use this config file instead of discovering one
  --format <fmt>   human or jsonl (default: human)
  --out <dest>     stdout, stderr, or a file path (default: stdout)
```

## What it rewrites

The file is edited as text so comments and key order survive. `migrate` does not stringify a parsed mapping back out.

**`pin`.** Set to the running package version. A pin that is already that version is left as a rewrite of the same line only when something else in the file still needs changing.

**`version`.** Removed. `pin` is the only version; other commands that load
repository configuration reject this leftover schema identifier as an unknown key.

**`ignoreFiles`.** Inserted as `[]` when the key is absent. That is what omit used to mean: do not read a sitting `.gitignore`. The list is not filled with `.gitignore` — a repository that was not reading one must not start reading one because it upgraded. A key that is already present, empty list included, is left alone.

**`skip`.** Inserted as `AGENTS.MD`, `AGENTS.md`, and `CLAUDE.md` when the key is absent. Those are the instruction files `init` writes, and the reason skip exists. A key that is already present, `[]` included, is left alone: `[]` is an explicit decline.

**Root `espalier/AGENTS.MD`.** When `skip` would skip `AGENTS.MD` — the shipped list, or a list that already names it — and the espalier root exists, `migrate` writes the compact authoring contract there if the file is absent or still starts with the shipped sentinel. A customized copy (sentinel removed) is left alone. Nested `AGENTS.MD` files are the project's; migrate never creates or overwrites those. `skip: []` is an explicit decline, and no authoring file is written. See [AUTHORING.MD](../../AUTHORING.MD).

Nothing else is inserted. Optional keys with defaults — `root`, `build.filename`, `build.inline` — stay omitted if they were omitted. Dumping those defaults into every file would fight the rule that they are optional.

A config that is already current is reported `skipped` and not written. The authoring file is considered separately: a current config whose root `AGENTS.MD` is still missing can still be written.

## What it will not do

**It will not downgrade.** If `pin` is newer than the running CLI, the run stops with `cannot_downgrade` and the file is not touched. Install the recorded version, or run migrate with that newer CLI.

**It will not compile the espalier.** An older config may already hold an `AGENTS.MD` the current compiler would reject until `skip` is present. The rewrite is the whole of the command; `lint` and `build` run afterwards.

**It will not rewrite rule modules.** A new CLI version may change how rule
filenames or selectors are interpreted, and the config alone cannot reveal the
author's intended match set. Review the rules against [MATCHING.MD](../../MATCHING.MD)
and [TYPES.MD](../../TYPES.MD) before relying on the new pin. `--dry-run`
reports config and authoring-file writes; it does not validate rule behavior.

Unknown keys other than `version` still fail. Migrate removes the one key this release dropped; it does not guess at typos.

## Nested espaliers

A migrate at the root visits each child the way `lint` and `build` do: its own config, its own `.espalierignore`, and its own children beneath it. A child whose config is already current is skipped. A child that cannot be rewritten is reported and the walk continues, so one broken package does not hide another.

`--config` names the espalier to start from. Discovery below that file is unchanged.

`--dry-run` reports every path that would be written and writes none of them.

## After `migrate`

1. Install the CLI this repository now pins, if you have not already.
2. Run [`espalier lint`](../lint/README.MD) and [`espalier build`](../build/README.MD) the way any pin change requires.

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
