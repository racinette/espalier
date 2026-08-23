# matching: an espalier that declares nothing

An `ESPALIER.MD` and no rules. Every file in the repository is reported as
`unexpected_path`, and the deepest recognized node is the root — so there is
nothing to report beyond the violation itself, and no `Declared there:` list to
print.

This is the state `espalier init` leaves behind, and it is meant to be loud.
The alternative reading — an empty espalier governs nothing, so everything
passes — would make the first run of a new installation indistinguishable from
a repository that had been fully described, which is the one outcome this tool
exists to prevent.

`--ignore-all` is the escape for a repository already in CI, and `init-ignore-all`
is where that is pinned. This fixture is the same situation without it.

Pins: MATCHING.MD "The deepest recognized node", CONFIG.MD "What counts as a file".
