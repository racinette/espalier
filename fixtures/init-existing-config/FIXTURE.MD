# init: refusing to overwrite a configuration

The repository is already initialized. `init` exits `2` and writes nothing.

A configuration is the one file that says what everything else in a repository
means. A bootstrap command is the last thing that should be allowed to rewrite
it, and merging would be worse — the failure would be silent and the result
would be neither what was there nor what was asked for.

There is no `expected-init/`, which asserts the scratch tree is byte-identical
to what the run started from. "It refused" and "it refused without touching
anything" are different claims.

## The dotfile in the espalier

`espalier/.gitkeep` is here because this fixture also runs `lint`, and `lint`
compiles the espalier. `MATCHING.MD` makes any non-`.mjs` file in the espalier
an error, with dotfiles excepted — so without that exception the file `init`
itself writes would break every subsequent run.

`init-bare` proves `init` writes it. This proves the tool can then read the
repository it just created, which is the half that would otherwise go unnoticed
until someone ran the two commands in order.

Pins: cli/init/README.MD "Usage"; MATCHING.MD "Node kinds".
