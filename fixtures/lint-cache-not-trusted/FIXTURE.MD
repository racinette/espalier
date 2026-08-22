# lint --cache: a cache from another espalier is discarded

The fixture ships `espalier/.cache/lint.jsonl` with a header naming an
espalier that is not this one, and an entry claiming an issue no rule here
emits. Neither run reports it.

The entry depends on nothing — no reads, no globs — on purpose. An entry that
named a file would be discarded for a stale stamp rather than for its header,
and the fixture would pass while guarding nothing: this one has to be turned
away at the header or not at all.

A cache is not evidence. It is a record of what *this* espalier concluded, and
a header that does not match means the record describes something else — so
the run discards it, does the work, and says nothing. There is no failure code
for this: a linter that stops because of its own bookkeeping is worse than a
slow one.

The second run is the other half. Having thrown the foreign cache away, the
run wrote its own, and the replay proves it — the token moved and the answer
did not.

The cache sits under the espalier root, which is invisible to matching and
skipped when the tree is compiled, so it is neither an `unexpected_path` nor a
rule module without anyone saying so.

The rule modules are deliberately impure: each emits `ESPALIER_FIXTURE_TOKEN`
as an issue message. Warm and cold output are identical by design, so a rule
that lies is the only way a skip becomes visible — the environment is an input
the runner cannot see, so an invocation replayed from cache answers with the
token the cold run was given, and one that actually ran answers with the
current one.

Pins: cli/lint/README.MD "Incremental runs".
