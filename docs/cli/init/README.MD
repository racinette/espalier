# `espalier init`

Bootstraps a repository: writes the configuration and creates the espalier root.

```bash
espalier init
```

`init` describes nothing. It does not read your code, infer patterns, or generate rule modules — that is [`espalier adopt`](../adopt/README.MD), and it runs later, one area at a time.

## Usage

```text
espalier init [--config <path>] [--root <dir>] [--ignore-all]

  --root <dir>     espalier source directory (default: espalier)
  --ignore-all     also write an ignore entry for every top-level path,
                   putting the existing tree out of scope
  --config <path>  write the config here instead of ./espalier.config.yaml
  --format <fmt>   human or jsonl (default: human)
  --out <dest>     stdout, stderr, or a file path (default: stdout)
```

`init` refuses to overwrite an existing configuration. Exit `2`, and nothing is written.

## What it writes

```yaml
version: 1

root: espalier

defaultIgnore: true
```

Plus `espalier/`, holding a `.gitkeep`.

`defaultIgnore: true` is written out even though it is the default, so the mechanism is visible. A built-in list quietly excluding files is otherwise something you discover months later, wondering why a check never ran.

The `.gitkeep` is there because git does not track empty directories. Without it the espalier root vanishes on the first commit and the next person to clone gets `espalier_root_missing` before they have written a line. Dotfiles in the espalier are skipped rather than read, so it costs nothing — see [MATCHING.MD](../../MATCHING.MD#node-kinds).

## Why no ignore list by default

Structural enforcement is total: every file `espalier` can see must be declared, or it is reported as `unexpected_path`. On a repository that already exists, the first run therefore reports every source file at once.

That is loud, and it is also honest, and at this moment nobody is listening. You have just run `init` on a repository that declares nothing; you are not going to wire that into CI before describing anything. The noise is visible only to the person who caused it, who knows exactly why it is there and what it is a list of.

Writing an ignore list here would mean guessing your source layout before anyone has said what matters, and leaving `adopt` to unpick a coarse `src/**` into `src/api/**`, `src/lib/**` and the rest each time it runs. Better to add entries when the noise starts costing you something, and to add the ones you actually want.

## `--ignore-all`

Writes one entry per top-level path — directories as `<dir>/**`, files by name — so `espalier lint` passes from the first run:

```yaml
ignore:
  - public/**
  - src/**
  - test/**
  - main.ts
```

Paths already covered by `defaultIgnore` are left out; so is the espalier root.

Use it when you are introducing `espalier` to a repository that is already in CI and a red build would be a problem. The list is a **backlog, not a junk drawer**: entries arrive generated and leave by hand, and the list shrinking is what progress looks like.

Note that this is not only a bootstrap concern. A repository is never expected to end up fully described, so a partial espalier reports its undescribed areas for as long as it stays partial. `ignore` is what makes that liveable, whenever you decide you want it.

## After `init`

1. Write `espalier/ESPALIER.MD` — what this project is. It becomes the preamble of the generated root documentation.
2. Bring one area under the espalier with [`espalier adopt`](../adopt/README.MD), or by hand.
3. Run [`espalier build`](../build/README.MD) to generate the documentation agents read.
4. Run [`espalier lint`](../lint/README.MD) to check the areas you have described.

Repeat step 2 for as long as it stays useful. There is no expectation that a repository ends up fully described — an espalier covering the three directories where architecture actually matters is worth more than one covering everything shallowly.
