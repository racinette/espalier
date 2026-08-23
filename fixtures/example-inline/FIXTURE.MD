# example-inline

Pins `exampleSource` in [TYPES.MD](../../docs/TYPES.MD#example-and-examplesource):
*it carries none of the guarantees*, and the sentence in
[cli/build/README.MD](../../docs/cli/build/README.MD#rule-sections) that a module
exporting it *gets the source as a fenced block under the same heading*.

Two nodes, one for each export:

- `schema.sql` exports `example`. It exists, this rule's own pattern matches it,
  and it renders as a single `Example: src/schema.sql` line.
- `[migration].sql` exports `exampleSource`. It is neither an existing path nor
  matched by the pattern, and neither compile-time check applies to it —
  pointing them at `exampleSource` fails this fixture with `invalid_example`. It
  renders as a fenced block.

`invalid-example` pins the other half: a path form that its own rule does not
match is a specification error and exits `2`. Between the pair, both branches of
the check are held.

A map line in `src/AGENTS.MD` runs to exactly eighty characters, which is not an
accident of the names: it pins the bound in *greedily wrapped at 80 columns* as
inclusive.
