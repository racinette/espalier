# `espalier examples`

Locates or copies the worked examples packed with this CLI version.

```bash
espalier examples
espalier examples authoring-corpus
espalier examples --help
espalier examples authoring-corpus --copy ./scratch/corpus
```

An example is a tree of files — modules, a helper, cases, generated guidance — not a Markdown page. `espalier help` prints a page; this command prints a directory on this machine, like `man -w`. The stable reference is the command. Agents should run `espalier examples`, not remember a path.

## Usage

```text
espalier examples [name] [--copy <directory>]
espalier examples --help
```

The command does not load a repository or a config. With no name, stdout is
the examples directory. With a name, stdout is that example. `--help` (or
`-h`) prints usage and the available example names, so discovery does not
require opening the installed directory. An unknown name prints the catalog
on stderr and exits `2`. Invalid arguments and copy failures also exit `2`,
with a diagnostic on stderr and no success path on stdout.

`--copy <directory>` requires an example name. It copies the complete
example into a new directory and prints that directory's absolute path.
Relative destinations resolve from the current working directory. The
destination is the example root: `--copy ./scratch/corpus` places the config
at `./scratch/corpus/espalier.config.yaml`, without another example-name
directory. Missing parent directories are created. An existing destination,
including an empty directory, is refused; files are never merged or
overwritten. If copying fails after creating the destination, that incomplete
destination is removed; newly created parent directories may remain.

The copy includes generated guidance exactly as shipped. It does not run
initialization, migration, dependency installation, or a documentation build.
This gives an agent a writable copy where its file tools can reach it, even
when they cannot open the installed path. The CLI must still be able to read
the installed examples.

When copied inside a repository with its own espalier config, the example is
a nested espalier. A later `build` may change its root guidance to describe
that boundary. The shipped root guidance describes a standalone example.

The tree is this package's `examples/` directory, next to `docs/`. It matches this CLI version the same way `espalier help` does.

## `authoring-corpus`

A structural owner, a per-file well-formedness constraint, and an aggregate over mix and averages. Toy JSON, so the evaluation unit is visible without a language toolchain. The helper parses a string it was given; it does not remember repository contents. Generated `AGENTS.MD` files in the tree are the presentation of those rules.

How to choose a rule's kind is [`espalier help authoring`](../help/README.MD).
