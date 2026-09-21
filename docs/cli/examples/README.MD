# `espalier examples`

Prints the local path to the worked examples packed with this CLI version.

```bash
espalier examples
espalier examples authoring-corpus
```

An example is a tree of files — modules, a helper, cases, generated guidance — not a Markdown page. `espalier help` prints a page; this command prints a directory on this machine, like `man -w`. The stable reference is the command. Agents should run `espalier examples`, not remember a path.

## Usage

```text
espalier examples [name]
```

No flags. The command does not load a repository or a config. With no name, stdout is the examples directory. With a name, stdout is that example. An unknown name prints the catalog on stderr and exits `2`.

The tree is this package's `examples/` directory, next to `docs/`. It matches this CLI version the same way `espalier help` does.

## `authoring-corpus`

A structural owner, a per-file well-formedness constraint, and an aggregate over mix and averages. Toy JSON, so the evaluation unit is visible without a language toolchain. The helper parses a string it was given; it does not remember repository contents. Generated `AGENTS.MD` files in the tree are the presentation of those rules.

How to choose a rule's kind is [`espalier help authoring`](../help/README.MD).
