# build: every covering document names the child

Three levels, and a placement point between two of them. The workspace declares
`main.ts` and `tools/[tool].ts`; `espalier/tools/ESPALIER.MD` makes `tools/` a
placement point of its own; and `tools/reports/` holds an espalier.

`tools/reports/` sits inside the closed set of both generated documents, and
both end on the same absolute sentence — so both name it, each at its own path:

    AGENTS.MD        tools/reports/  has an espalier of its own
    tools/AGENTS.MD  reports/        has an espalier of its own

Naming it only in `tools/AGENTS.MD`, the deepest file above it, would leave the
root saying nothing else may exist under this directory while a reader standing
in it can see a directory the root does not describe. The alternative — an
exception appended to the closed set — is a sentence that has stopped being
terminal, and enumerating what it defers to is what keeps it absolute.

`nested-build-per-child` covers the shape without an intervening point: there
the root is the only document covering the children, so it names them whether
the rule is *every covering document* or *the deepest one*. Only a fixture with
a point in between separates the two, which is why this one exists.

The child is built by the same run, as its own espalier, and its document is
stamped `source: espalier` relative to itself.

Pins: cli/build/README.MD "Governed elsewhere", "The closed set".
