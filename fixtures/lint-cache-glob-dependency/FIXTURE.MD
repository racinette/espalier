# lint --cache: a rule re-runs when what `files` returns changed

`parts/two.ts` appears between the runs, and four invocations answer four
different ways:

- `index.ts` re-runs. Its rule called `files("parts/*.ts")` and the list it
  got back is no longer the list it would get now.
- `parts/two.ts` runs for the first time. The work list is the current set of
  invocations, not the set the cache holds, or a new file would never be
  linted at all.
- `parts/one.ts` is replayed. Its contents did not change, and a glob
  dependency is about which paths exist rather than what is in them.
- `other.ts` is replayed. Its rule never listed anything.

The rule modules are deliberately impure: each emits `ESPALIER_FIXTURE_TOKEN`
as an issue message. Warm and cold output are identical by design, so a rule
that lies is the only way a skip becomes visible — the environment is an input
the runner cannot see, so an invocation replayed from cache answers with the
token the cold run was given, and one that actually ran answers with the
current one.

Pins: cli/lint/README.MD "Incremental runs".
