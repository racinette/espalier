# adopt: a second run does not eat the first run's work

`espalier/components/[tsx].tsx.mjs` already exists and carries a real `rule`
body. `adopt` would infer exactly that module from `Submit.tsx` and
`Modal.tsx`. It reports `skipped` and writes nothing.

The `rule` body is the expensive part and the entire point of the exercise —
`adopt` produces structure, and only a person produces meaning. A re-run that
overwrote one would be worse than no command at all, because the loss is
silent and the file still looks generated.

This is what makes `adopt` safe to run repeatedly on a directory that is still
growing: it adds what is new and touches nothing else.

There is no narrowing here. No `ignore` entry covers `components`, so there is
nothing to narrow, and no `narrowed` line is reported. The `expected-adopt/`
tree contains only the untouched module, and the config is absent from it
because it was never rewritten.

Pins: cli/adopt/README.MD "Usage".
