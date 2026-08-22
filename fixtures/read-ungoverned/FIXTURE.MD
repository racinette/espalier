# lint: `read` refuses a path the espalier does not govern

`notes.txt` is a real file, readable, sitting in the root. The config ignores
it, so `context.read("notes.txt")` fails with `read_ungoverned` and the run
exits `2` without reporting the issue the rule was about to emit.

The bound is not tidiness. An ungoverned path is one no run stamps, so a rule
that read one would be replayed unchanged after that file changed — a stale
pass, and a silent one. `files` has always been scoped this way; this makes
`read` agree with it. A rule that genuinely needs such a file is a rule whose
espalier should stop ignoring it.

Pins: TYPES.MD "Execution", cli/lint/README.MD "Incremental runs".
