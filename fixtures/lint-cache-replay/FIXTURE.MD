# lint --cache: an unchanged repository does no rule work

Two runs, nothing between them but a different token. Both invocations of
`[file].ts.mjs` are replayed, so the second run reports what the first did.

This is the whole promise: a warm run over an unchanged repository reports
exactly what the cold run reported, and reaches no rule to find out. The two
files share one module, so the entries are per invocation rather than per
module — replaying one and re-running the other has to be expressible.

The rule modules are deliberately impure: each emits `ESPALIER_FIXTURE_TOKEN`
as an issue message. Warm and cold output are identical by design, so a rule
that lies is the only way a skip becomes visible — the environment is an input
the runner cannot see, so an invocation replayed from cache answers with the
token the cold run was given, and one that actually ran answers with the
current one.

Pins: cli/lint/README.MD "Incremental runs".
