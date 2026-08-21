# a child that fails does not stop its siblings

`packages/broken` has a `notes.txt` in its espalier tree, so its espalier does
not compile. Children are visited in path order, so it fails before
`packages/ok` is reached.

The run reports the failure with `espalier` naming who could not be built,
carries on, and still reports `stray.ts` from the sibling. The exit code is `2`,
the worst of the three runs.

This is the one place a failure is not the end of the run, and the partition is
why: the outer espalier and every sibling are complete without the broken one.
A run that stopped here would let one broken package hide a violation in
another, which is a worse report than the one naming both.

Pins: cli/lint/README.MD "Nested espaliers" and "Failures are not issues".
