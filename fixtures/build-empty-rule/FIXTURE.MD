# build-empty-rule

Pins the assembly sentence in [cli/build/README.MD](../../docs/cli/build/README.MD#rendering):
*a section with nothing to say is omitted entirely, along with its heading; no
placeholder text is ever written.*

`espalier adopt` writes `export const rule = ``;` as a TODO, so this is the
state of every node in a freshly adopted project rather than an exotic one.
`build` was rendering the heading anyway, giving `src/AGENTS.MD` a
`## src/[module].ts — a module` followed by nothing — a document whose most
visible feature was its own incompleteness.

Two nodes, because "nothing to say" and "an empty `rule`" are not the same
claim:

- `[module].ts` has an empty `rule` and no `example`. Its section is omitted,
  heading and all, and only the map still names it.
- `registry.ts` has a whitespace-only `rule` and an `example`. Its section
  survives with the example alone, so the fix cannot be "drop any section whose
  rule is empty".

The map and the cardinality paragraph are unaffected either way. What a node
declares is a matcher question, and an empty `rule` does not make a file less
required.
