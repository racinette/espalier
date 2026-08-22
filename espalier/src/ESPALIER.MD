---
description: the implementation
---

One direction of dependency, and it is worth knowing before editing anything.
`config.ts` finds and validates `espalier.config.yaml`. `files.ts` walks the
tree and `ignore.ts` decides what that walk may enter. `compile.ts` reads the
espalier into a matcher, over segments from `pattern.ts`. `repository.ts` joins
those three into the one object both `lint` and `explain` work from: the
visible set, what excluded everything else, and who owns each path.

Above that sit the commands — `lint.ts`, `build.ts`, `explain.ts`, `init.ts`,
`adopt.ts` — each with a page under `docs/cli/`. Nothing below `repository.ts`
reaches back up, and a change that would need it to is a change to think about
twice.

The rest are shared machinery. `errors.ts` holds `fail()`, which every
operational failure goes through; a code it raises that `docs/ERRORS.MD` does
not list fails the suite, and so does a documented code nothing raises.
`output.ts` owns formats and destinations, so no module writes to a stream
itself. `context.ts` builds the parts of a lint context that both the runner
and the programmatic API hand to rules, because `docs/API.MD` promises a rule
fails under test for the reason it fails in production, and two implementations
would make that a coincidence.

`cache.ts` is the exception to everything: nothing in it may throw. A cache that
cannot be read, parsed, trusted or written is a cache the run does without.
