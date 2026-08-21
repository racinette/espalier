# a child espalier is found, and then run

`packages/web` holds a config of its own, so its subtree is the child's and the
root run visits it afterwards. Three claims, in one run:

**The boundary holds.** The root espalier declares `packages/[package]/index.ts`
and carries a `[...path]` constraint — the natural monorepo mistake, both of
which would reach `packages/web/index.ts` if the subtree had not left. Neither
does. `root_reached` never fires, and `root_constraint_ran` fires on `main.ts`
only, which is also what proves the constraint is live rather than absent.

**The child is run.** `child_ran` and the `unexpected_path` for `stray.ts` come
from an espalier the command was never pointed at. Without recursion the subtree
would be governed by nobody and the run would exit `0`.

**Paths are re-rooted, and the origin is named.** The child reports `stray.ts`;
what arrives is `packages/web/stray.ts` with `espalier` naming who said it.

`explain` answers from the espalier nearest the path, so the same query gives
the same answer from the root or from inside the package. Its closed set defers
the same way `build`'s does — the two share one function precisely so they
cannot say different things about the same espalier.

Pins: CONFIG.MD "Nested espaliers", cli/lint/README.MD "Nested espaliers",
cli/explain/README.MD "Nested espaliers".
