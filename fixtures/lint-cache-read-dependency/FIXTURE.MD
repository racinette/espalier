# lint --cache: a rule re-runs when a file it read changed

`shared.ts` is rewritten between the runs. Three invocations, and they part
company:

- `shared.ts` re-runs, because its own file changed.
- `a.ts` re-runs, because its rule called `read("shared.ts")` and that is
  recorded as a dependency of the invocation, not of the file.
- `b.ts` is replayed. It read nothing, and nothing it depends on moved.

`b.ts` is the assertion that matters. A cache that invalidated everything on
any change would pass the first two and still be worthless.

The rule modules are deliberately impure: each emits `ESPALIER_FIXTURE_TOKEN`
as an issue message. Warm and cold output are identical by design, so a rule
that lies is the only way a skip becomes visible — the environment is an input
the runner cannot see, so an invocation replayed from cache answers with the
token the cold run was given, and one that actually ran answers with the
current one.

Pins: cli/lint/README.MD "Incremental runs".
