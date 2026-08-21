# adopt: the espalier root is not inferred from

`root: tools/espalier`, so adopting `tools` walks over the espalier's own tree.
It is invisible unconditionally — espalier does not report on its own machinery
— and inferring from it would declare the rule modules as though they were the
project's files.

It is not evidence either. `tools/` holds `espalier/` and `lib/`, and two of a
thing is a pattern: counting the espalier root would collapse them into one
dynamic directory and describe a shape nobody chose.

`adopt` refuses the espalier root as a *target* already. This is the other
direction — a target that contains it.

Pins: cli/adopt/README.MD "Nested espaliers", CONFIG.MD "root".
