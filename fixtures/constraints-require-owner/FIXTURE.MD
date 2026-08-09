# constraints only run on owned files

`**/*.ts` matches both files. Only src/main.ts has a structural owner, so
only src/main.ts is constrained. scripts/deploy.ts reports exactly one
issue — unexpected_path — and no constraint issue.

In a conforming repository this distinction is invisible. It exists so that
one undeclared file does not produce an issue per matching constraint.

Pins: MATCHING.MD "Ownership", final paragraphs.
