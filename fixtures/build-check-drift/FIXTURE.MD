# build --check: the three drift states

One repository holding all three at once, because a `--check` that reports only
the state it happened to hit first is worse than useless in CI.

| Path | State | Why |
|---|---|---|
| `AGENTS.MD` | `changed` | marked, present, and not what this espalier renders |
| `components/buttons/AGENTS.MD` | `missing` | a placement point with no file on disk |
| `src/legacy/AGENTS.MD` | `stale` | marked, but this espalier no longer produces it |

`stale` is the same condition `build` reports as `deleted` when it is writing.
The state and the action are separate words on purpose: `--check` never acts,
so naming its finding `deleted` would be a lie about what happened.

Exit is `1` — the output differs — and not `2`, which is reserved for a run
that could not answer the question at all.

## Nothing is written

There is no `expected-build/`, which asserts the scratch tree is byte-identical
to what the run started from: `AGENTS.MD` still holds its wrong content,
`components/buttons/AGENTS.MD` still does not exist, and the orphan is still
there. `--check` in CI is run against a working tree someone else owns, and a
check that edits it is not a check.

Pins: cli/build/README.MD "`--check`", "Output".
