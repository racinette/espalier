# a one-line `exampleSource`

The value in TYPES.MD's own illustration of the inline form, which the espalier
could not compile: with one export told apart by "contains a newline", a
single-line source was read as a path, and the run exited `2` reporting that a
file named `export default function Submit() { … }` did not exist.

Two exports settle it. `exampleSource` is source whatever it looks like, and a
mistyped `example` is still a compile-time error rather than a code sample
nobody validates.

It renders fenced, as every `exampleSource` does. Nothing about the rendering
depends on how many lines it has, which is the point.

Pins: TYPES.MD "`example` and `exampleSource`".
