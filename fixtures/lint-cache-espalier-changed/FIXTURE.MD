# lint --cache: an edited espalier discards everything

`espalier/[file].ts.mjs` is rewritten between the runs and both invocations
re-run, though neither `a.ts` nor `b.ts` was touched.

The espalier is all-or-nothing on purpose. Tracking which rule changed would
mean tracking what each rule imports, and the modules under the root are
ordinary ES modules that may import each other and anything else in the tree.
One comparison covers a rule body, a helper it imports, a renamed node and a
changed setting. The architect edits the espalier far less often than the
repository changes under it, so the coarse answer costs little and is never
wrong.

The rule modules are deliberately impure: each emits `ESPALIER_FIXTURE_TOKEN`
as an issue message. Warm and cold output are identical by design, so a rule
that lies is the only way a skip becomes visible — the environment is an input
the runner cannot see, so an invocation replayed from cache answers with the
token the cold run was given, and one that actually ran answers with the
current one.

Pins: cli/lint/README.MD "Incremental runs".
