# `espalier help`

Prints this CLI version's reference to stdout.

```bash
espalier help
espalier help authoring
espalier help types
```

The pages live in the installed package. The running binary prints its own copy, which is what `pin` already promises: `espalier help types` prints TYPES.MD from the running version. There is no machine path in the interface, and no GitHub URL. `--help` remains the short synopsis of commands and flags; this command is the manual. `espalier --version` prints the installed package version as a single line, without loading a repository or configuration.

## Usage

```text
espalier help [page]
```

No flags. The command does not load a repository or a config. An unknown page prints the catalog on stderr and exits `2`.

With no page, stdout is the catalog: every page this version can print, with a one-line summary. With a page, stdout is that file, verbatim.

`espalier help create` is the create command's spec. `espalier create <path> help` is what that creation will write. Different questions.

## Pages

Spec first, then one page per command. The catalog is the list; adding a page is adding a file this package ships and a name this command knows.

Choosing a rule's kind, keeping policy in the owning module, and testing it is `espalier help authoring`. The compact contract `init` vendors into `espalier/AGENTS.MD` names the same commands so an agent editing rules has an invocation, not a checkout path.

Generated root documents name `espalier help` in Working with Espalier. The working loop is the cycle; this command is the rest of the manual.

If the contract's example obligations are not enough, [`espalier examples`](../examples/README.MD) prints a worked tree packed with this version.
