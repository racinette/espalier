# build recurses, and each child builds as itself

Two packages, each with an espalier of its own, and a root that describes only
`main.ts`.

**The root names its children and stops.** The closed-set sentence defers —
"apart from the directories that
already have an espalier of their own" — and `## Governed elsewhere` lists
both. Deferring rather than listing after an absolute sentence is the point: a
reader who can see two directories under "nothing else may exist" is reading a
lie, and a section further down does not retract it. It says who governs them
and not what they contain.

**Each child renders in its own frame.** `packages/web/AGENTS.MD` says
`source: espalier`, states the governance boundary, and closes its account with
"under this directory". It does not repeat the root's development loop.
`packages/api` uses
`build.filename: PACKAGE.MD`, which is its setting and reaches nothing else.

**The outer run does not sweep the child's document.** `packages/web/AGENTS.MD`
is planted, marked, byte-identical to what the child writes, and named exactly
what the root's own `build.filename` names. A sweep that reached into the child
would delete it and the child would write it back, leaving the tree correct and
the report carrying a `deleted` line nothing expects.

That the file is unchanged is also why it has no `written` line: only the root
document and `packages/api/PACKAGE.MD` are new.

Pins: cli/build/README.MD "Nested espaliers" and "Governed elsewhere".
