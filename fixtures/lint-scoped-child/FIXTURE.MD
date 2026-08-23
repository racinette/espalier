# lint-scoped-child

Pins [cli/lint/README.MD](../../docs/cli/lint/README.MD#nested-espaliers):
*"**Scoping applies first.** A child whose directory does not intersect the
path arguments is not run at all. `espalier lint packages/api` visits the
espalier in `packages/api` and no other."*

`nested-lint-recursion` pins the unscoped half — every child is found and run.
This is the other half, and nothing exercised it: the predicate that decides
which children a path argument reaches had never been given a path argument.

That predicate is the kind that fails quietly. A scoped run reports what it
found and exits `0`; if the filter were wrong in the direction of skipping too
much, a package would simply go unchecked and the run would look clean. Every
espalier here is instrumented for that reason — each emits an `info` naming
itself, so the assertion is a list of who spoke rather than a contrived
violation.

Running `lint packages/api`:

- **The named child runs.** `ran_api`, with `espalier` set to `packages/api`
  and the path re-rooted to where the command was invoked.
- **The sibling child does not.** `ran_web` is absent. `packages/web` holds a
  file its espalier would report on, and the only reason nothing is reported
  is that the run never entered it.
- **The outer espalier is scoped too, not exempted.** `ran_root` is absent:
  `main.ts` is outside the argument, so the root's own rule does not run
  either. The partial-run warning says `0 of 1 file` for the outer run.

`ownership` is unscoped, as always, and is what shows the two packages really
do hold files with owners waiting to be asked.
