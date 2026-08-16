# build: orphans are deleted, unchanged files are left alone

Two assertions, both about what a *second* run does.

## The orphan

`src/legacy/AGENTS.MD` carries the provenance marker but this espalier no
longer produces it — the node it was rendered from is gone. It is deleted.

A stale document that keeps steering agents after its rule was removed is worse
than no document, because nothing about it looks stale: it is well-formed, it
is in the right place, and an agent reading `src/legacy/` will follow it.
Finding it is a scan of the file list `build` already has, for files matching
the configured `filename` and carrying the marker. There is no manifest.

`src/legacy/` is left behind, empty. `build` deletes files, not directories.

## The unchanged file

The root `AGENTS.MD` in this fixture is byte-for-byte what `build` renders, so
the run leaves it alone and reports no `written` line for it. `expected.json`
asserting a single `deleted` line and nothing else is the whole point: a run
that rewrote identical bytes would report a `written` line and fail this case.

Idempotence is what makes `--check` in CI and `build` in a pre-commit hook
tolerable to live with. A tool that touches every file on every run turns a
no-op into a diff, and people stop running it.

Pins: cli/build/README.MD "Generation" step 5, "Ownership", "Output".
