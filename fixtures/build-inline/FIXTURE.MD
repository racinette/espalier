# build --inline: one document, and the other mode's files removed

The repository starts in the distributed state — `components/buttons/AGENTS.MD`
exists and carries the marker, as a previous run left it. `--inline` writes the
single root document and removes the distributed one.

That removal needs no rule of its own. The file carries the marker and this run
did not produce it, so it is an orphan, and the orphan rule deletes it. A mode
switch that left the other mode's files behind would leave two documents
disagreeing about the same directory, with the agent reading whichever it
reached first.

## The folded section

`components/buttons/` becomes a `##` section inside the root document, its rule
demoted from `##` to `###`. The rule body itself is the same bytes it would
have been distributed — `--inline` is a placement decision, not a second
rendering.

The section keeps its own cardinality paragraph, scoped to
`components/buttons/`, even though the root paragraph above already covers the
same subtree. The redundancy is the point: an agent that has scrolled to the
section describing the directory it is working in should find the closed-set
statement there, not three screens up in different words.

There is one map, at the root, because the root's map was always the whole
repository. There is one amendment instruction, at the end, because there is
one file.

`--inline` and `build.inline: true` in the config mean the same thing; this
fixture uses the flag so that the config stays comparable with the others.

Pins: cli/build/README.MD "`--inline`", "Ownership".
