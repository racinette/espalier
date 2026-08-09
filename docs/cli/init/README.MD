# `espalier init`

Bootstraps a repository: writes the configuration, creates the espalier root, and puts the existing source tree out of scope so the first run is clean.

```bash
espalier init
```

`init` describes nothing. It does not read your code, infer patterns, or generate rule modules — that is [`espalier adopt`](../adopt/README.MD), and it runs later, one area at a time.

## Usage

```text
espalier init [--config <path>] [--root <dir>]

  --root <dir>     espalier source directory (default: espalier)
  --config <path>  write the config here instead of ./espalier.config.yaml
```

## What it writes

```yaml
version: 1

root: espalier

defaultIgnore: true

# espalier governs nothing yet.
# Remove entries as you bring each area under the espalier — see `espalier adopt`.
ignore:
  - public/**
  - src/**
  - test/**
```

Plus an empty `espalier/` directory.

`defaultIgnore: true` is written out even though it is the default, so the mechanism is visible. A built-in list quietly excluding files is otherwise something you discover months later, wondering why a check never ran.

## Why the ignore list

Structural enforcement is total: every file `espalier` can see must be declared, or it is reported as `unexpected_path`. On a repository that already exists, that means the first run reports every source file at once — hundreds of issues, none actionable, and the tool gets closed.

`defaultIgnore` already covers manifests, lockfiles, CI definitions and tool configuration. What remains is the code, and `init` puts it out of scope so `espalier lint` passes from the first run.

The generated list is deliberately coarse — top-level source directories, not individual files. It is a **backlog, not a junk drawer**: entries arrive generated and leave by hand, and the list shrinking is what progress looks like. Three or four lines that each mean *this area is not described yet* is a readable state to be in.

## After `init`

1. Write `espalier/ESPALIER.MD` — what this project is. It becomes the preamble of the generated root documentation.
2. Bring one area under the espalier with [`espalier adopt`](../adopt/README.MD), or by hand.
3. Run [`espalier build`](../build/README.MD) to generate the documentation agents read.
4. Run [`espalier lint`](../lint/README.MD) to check the areas you have described.

Repeat step 2 for as long as it stays useful. There is no expectation that a repository ends up fully described — an espalier covering the three directories where architecture actually matters is worth more than one covering everything shallowly.
