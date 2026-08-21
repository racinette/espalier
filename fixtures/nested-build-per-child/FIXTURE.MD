# build recurses, and each child builds as itself

Two packages, each with an espalier of its own, and a root that describes only
`main.ts`.

**The root names its children and stops.** `## Governed elsewhere` lists both
directories, because the closed set above it has just said nothing else may
exist under the repository root and the reader can see two directories that do.
It says who governs them and not what they contain.

**Each child renders in its own frame.** `packages/web/AGENTS.MD` says
`source: espalier` and closes with "under the repository root", because a reader
standing in the package is in the package's frame. `packages/api` uses
`build.filename: PACKAGE.MD`, which is its setting and reaches nothing else.

**The outer run does not sweep the child's document.** `packages/web/AGENTS.MD`
is planted, marked, byte-identical to what the child writes, and named exactly
what the root's own `build.filename` names. A sweep that reached into the child
would delete it and the child would write it back, leaving the tree correct and
the report carrying a `deleted` line nothing expects.

That the file is unchanged is also why it has no `written` line: only the root
document and `packages/api/PACKAGE.MD` are new.

Pins: cli/build/README.MD "Nested espaliers" and "Governed elsewhere".
