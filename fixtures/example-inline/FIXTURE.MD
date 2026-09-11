# example-inline

Pins `referenceImplementationSource` in [TYPES.MD](../../docs/TYPES.MD#referenceimplementation-and-referenceimplementationsource):
*it carries none of the guarantees*, and the sentence in
[cli/build/README.MD](../../docs/cli/build/README.MD#rule-sections) that a module
exporting it *gets the source as a fenced block under the same heading*.

Two nodes, one for each export:

- `schema.sql` exports `referenceImplementation`. It exists, this rule owns it,
  and it renders as a single `Reference implementation: src/schema.sql` line.
- `[migration].sql` exports `referenceImplementationSource`. It is source rather
  than a path, so path validation does not apply. It renders as a fenced block.

`invalid-example` pins the other half: a path form that its own rule does not
own is a specification error and exits `2`. Between the pair, both branches of
the check are held.

A map line in `src/AGENTS.MD` runs to exactly eighty characters, which is not an
accident of the names: it pins the bound in *greedily wrapped at 80 columns* as
inclusive.
