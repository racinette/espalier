# build: a hand-written documentation file halts the run

`components/buttons/AGENTS.MD` exists and carries no provenance marker, so it
is not `build`'s to rewrite. The run fails with exit `2`.

## Why the unmarked file is the deeper one

The root document is a placement point too, and a naive implementation renders
and writes in tree order — root first, then `components/buttons/`, discovering
the conflict only after the root file is already on disk. That run failed, but
it did not fail cleanly, and the user is left with a half-built tree from a
command that reported an error.

So this fixture carries no `expected-build/`, which asserts the scratch tree is
byte-identical to what the run started from. Every placement point must be
checked before any of them is written.

## Why it halts rather than skipping

`build` could write everything else and warn about the one file. It does not.
A documentation set with a hole in it is worse than one that was never
generated, because the hole is invisible — the agent reads what is there and
has no way to know what is missing. Move the content into the corresponding
`ESPALIER.MD` and run again.

Pins: cli/build/README.MD "Ownership", CONFIG.MD "Ownership".
