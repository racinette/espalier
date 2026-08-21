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

The section carries no cardinality paragraph of its own. This fixture argued
the other way once — that an agent scrolled to the section for the directory it
is working in should find the closed-set statement there rather than screens up
— and the distance it assumed is not a distance this format produces. The whole
espalier is one file; the root paragraph is a scroll away, and it already says
what the section's would have said. Stated twice it reads as two rules, because
each is written relative to its own point: `[button].tsx` here against
`components/buttons/[button].tsx` above.

There is one map and one cardinality paragraph, both at the root, because the
root's were always the whole repository and the paragraph is that map restated
in prose. There is one amendment instruction, at the end, because there is one
file.

`--inline` and `build.inline: true` in the config mean the same thing; this
fixture uses the flag so that the config stays comparable with the others.

Pins: cli/build/README.MD "`--inline`", "Ownership".
