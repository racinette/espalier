# build: describing two open sets at once

`clients/[provider]/` and `clients/[summary].ts` overlap — "registry.ts"
satisfies both shapes — and are legal, because a directory never owns a file.
`ownership-dynamic-directory-and-leaf` proves the matcher decides it. This
fixture answers the question that shape left open: whether `build` can say
what may exist there.

It can, and the answer is unremarkable: two lines, each saying `(zero or more,
any name)` for itself, under one sentence covering both.

    ├─ [provider]/   (zero or more, any name)
    │
    │  └─ client.ts  an integration with an external API (required)
    │
    └─ [summary].ts  a one-file summary of a provider (zero or more, any name)

    Nothing else may exist under clients/.

The closed set stays closed because the sentence closing it covers both. That
was the open question from session one, and the reason for keeping the shape
legal rather than rejecting it in the compiler.

## The root is never pruned

Nothing is placed at the root — no rules, no `ESPALIER.MD` — and the root file
is written anyway. It is the only file carrying the map of the whole repository
and the instruction to run `lint`, and it is the one file a tool that reads only
the root will find. Pruning it would be pruning the product.

Note that the root's map reaches the same two nodes through `clients/`, while
`clients/AGENTS.MD` starts at them. Both draw the authored shape relative to the
file the reader is holding.

Pins: cli/build/README.MD "The map", "Generation" step 3.
