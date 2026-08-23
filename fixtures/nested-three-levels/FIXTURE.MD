# nested: a child of a child

Three espaliers, each inside the one above it: the workspace, `packages/api`,
and `packages/api/plugins/auth`. Every existing nested fixture stops at two.

What the third level pins is that delegation is a rule rather than a special
case for the first hop. `packages/api` treats `plugins/auth` exactly as the
workspace treats `packages/api` — its subtree is not this espalier's to
describe, so it is neither linted here nor reported as undeclared here — and
each issue is stamped with the espalier that produced it, at whatever depth.

The stamps are the assertion. A run that flattened the three into one would
still lint every file and still exit `0`; only which espalier is credited
separates it from one that delegated twice.

Each rule is instrumented, because a clean nested run is otherwise silent and
silence cannot be attributed to anyone.

The two `path` fields in each issue are worth reading together: the reported
path is relative to the repository root, while the `message` carries the
`context.path` the rule was handed, which is relative to its own espalier. A
rule is written against its own package and does not know how deeply it is
nested; the report is read from outside and must say where the file is.

Pins: cli/lint/README.MD "Nested espaliers", CONFIG.MD "Nested espaliers".
