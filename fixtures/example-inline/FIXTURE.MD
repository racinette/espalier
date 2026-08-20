# example-inline

Pins the second form of `example` in [TYPES.MD](../../docs/TYPES.MD#example):
*the inline form has no such guarantee*, and the sentence in
[cli/build/README.MD](../../docs/cli/build/README.MD#rule-sections) that the
`Example:` line *carries the path form or a fenced block for the inline form*.

Two nodes, because the two forms are one export and are told apart at runtime:

- `schema.sql` exports the path form. It exists, this rule's own pattern matches
  it, and it renders as a single `Example: src/schema.sql` line.
- `[migration].sql` exports the inline form. It is neither an existing path nor
  matched by the pattern, and it must be exempt from both compile-time checks —
  deleting the exemption fails this fixture with `invalid_example`. It renders
  as a fenced block.

`invalid-example` pins the other half: a path form that its own rule does not
match is a specification error and exits `2`. Between the pair, both branches of
the check are held.

The cardinality line in `src/AGENTS.MD` is exactly eighty characters, which is
not an accident of the names: it pins the bound in *greedily wrapped at 80
columns* as inclusive.
