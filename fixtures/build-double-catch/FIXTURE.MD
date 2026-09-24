# build: describing two open sets at once

`clients/[provider]/` and `clients/[summary].ts` overlap — "registry.ts"
satisfies both shapes — and are legal, because a directory never owns a file.
`ownership-dynamic-directory-and-leaf` proves the matcher decides it. This
fixture answers the question that shape left open: whether `build` can say
what may exist there.

The map names both collections and states that each may be empty:

    ├─ [provider]/   (zero or more matching directories)
    │  │
    │  └─ client.ts  an integration with an external API (required)
    │
    └─ [summary].ts  a one-file summary of a provider (zero or more matching files)

    Every path under clients/ must fit the project layout or a documented
    repository-specific purpose.

The final account covers both collections and any documented repository-specific
purposes, without implying that directories and files compete for ownership.

## The root is never pruned

Nothing is placed at the root — no rules, no `ESPALIER.MD` — and the root file
is written anyway. It is the only file carrying the map of the whole repository
and the instruction to run `lint`, and it is the one file a tool that reads only
the root will find. Pruning it would be pruning the product.

Note that the root's map reaches the same two nodes through `clients/`, while
`clients/AGENTS.MD` starts at them. Both draw the authored shape relative to the
file the reader is holding.

Pins: cli/build/README.MD "The map", "Generation" step 3.
