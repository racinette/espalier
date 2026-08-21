# adopt: a target inside a child is the child's to adopt

`packages/web/src` sits below a child espalier, so the module goes into
`packages/web/espalier/`, not into the root's. The espalier that gains it is the
nearest one at or above the target — the same rule `explain` answers by, so
neither depends on the directory the command ran in.

Writing it into the outer espalier instead would declare a file that espalier
cannot see and will never lint: a rule that exists, matches nothing, and makes
the repository look more described than it is.

The report path is re-rooted to where the command was invoked, and `espalier`
names who wrote it.

Pins: cli/adopt/README.MD "Nested espaliers".
