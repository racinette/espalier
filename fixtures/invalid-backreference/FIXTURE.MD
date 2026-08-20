# invalid-backreference

Pins the binding rule in
[MATCHING.MD](../../docs/MATCHING.MD#back-references): a `{name}` *must refer
to a `[name]` earlier in the same path*.

`clients/{provider}.ts.mjs` has no `[provider]` above it, so there is nothing
for the back-reference to stand for. Left alone it would match every filename
or none, depending on how the substitution failed, and either answer is a
guess. The espalier never compiles and the run exits `2`.

This is also what keeps the invariant in "What must exist" true — a
back-reference always sits beneath its placeholder, so a resolved leaf is
required per instance and never unconditionally.
