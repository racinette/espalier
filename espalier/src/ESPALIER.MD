---
description: the implementation
---

One direction of dependency, and it is worth knowing before editing anything.
`config.ts` finds and validates the configuration, `files.ts` walks the tree,
`ignore.ts` decides what that walk may enter, and `compile.ts` reads the
espalier into a matcher over segments from `pattern.ts`. `repository.ts` joins
those into the one object every command works from, and the commands sit above
it.

Nothing below `repository.ts` reaches back up, and a change that would need it
to is a change to think about twice.

The rest is shared machinery, and what each piece must hold to is written on
the module itself rather than here — a list of module invariants kept in one
place is a list that stops matching the modules.
