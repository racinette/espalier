# `espalier test`

> **Planned.** Not implemented. This page records the intent so the runner and the lint context are not designed in a way that forecloses it.

Rule modules are code. A `lint` function can stop catching what it was written to catch — a refactor, a changed parser, a regex that never matched anything in the first place — and nothing about a passing `espalier lint` distinguishes "the repository is clean" from "the rule is broken." A rule that silently never fires is worse than no rule, because it looks like coverage.

`espalier test` runs rule modules against fixtures: sample file contents at sample paths, with the issues each is expected to produce. It reports rules whose behaviour changed, and rules that no fixture ever exercises.

The same harness is how the matcher's own semantics get verified — the grammar, precedence, and requiredness rules in [MATCHING.MD](../../MATCHING.MD) have enough edge cases that prose alone will not survive contact with an implementation.
