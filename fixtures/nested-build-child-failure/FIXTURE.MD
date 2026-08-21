# build: one espalier that will not compile means no documents at all

`packages/broken` has a `notes.txt` in its espalier tree. The root espalier is
fine and so is `packages/web`, and neither gets a document. There is no
`expected-build/`, so the harness asserts the tree is untouched — which is what
a run that halts owes the user.

This is where `build` and `lint` part company. `lint` writes to a stream that
ends with the run, so a sibling's findings are worth having even when one
package is broken. `build` writes files that outlive the run, and the exit code
does not. A root document naming `packages/broken` under "Governed elsewhere"
and sending a reader to a directory with nothing in it is worse than no document
at all, and nothing in the file would say why.

The failure is still reported, with `espalier` naming whose it is: writing
nothing is not the same as saying nothing.

Pins: cli/build/README.MD "Nested espaliers".
