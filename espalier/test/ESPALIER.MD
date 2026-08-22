---
description: the argument that the tool works
---

Two kinds of test, and the division is not stylistic.

`fixtures.test.ts` runs the conformance suite: every directory under
`fixtures/` is a miniature repository with an `expected.json`, and a
`FIXTURE.MD` naming the sentence of which document it pins. That is where
behaviour belongs, because a fixture is readable by someone who has never seen
the implementation.

Everything else here is for what a fixture cannot see. A cache that was not
written, a directory that was never entered, a run that refused before writing
anything: the observable output is identical either way, so the assertion has
to reach past it. If a case can be a fixture, it should be.

A test that passes is not the same as a test that guards. Break the code and
watch the new test fail before believing it — this suite has shipped cases that
passed with the fix reverted.
