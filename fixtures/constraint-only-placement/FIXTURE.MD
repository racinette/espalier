# build: a placement point that exists only because of a constraint

`backend/` has no structural rules — nothing declares a single file there. It
is a placement point because `backend/[...path]/no-fetch.ts` was assigned to
it, the longest static prefix of its directory.

So `backend/AGENTS.MD` has **no trie node**, and the two sections that come
from one are omitted along with their headings: no `## Structure`, no
closed-set sentence. There is nothing to say about what may exist under
`backend/`, because the espalier does not say. Writing an empty map, or a
closed-set sentence over an empty set, would be inventing an answer.

That is the general rule from cli/build/README.MD — "A section with nothing to
say is omitted entirely, along with its heading" — in the one place where it
removes something substantial rather than an `Example:` line.

## Generated extension labels

`no-fetch.ts.mjs` exports no `description`, so `espalier` writes one from the
pattern: **applies to TypeScript files under backend/**. This is the only
fixture exercising the alias table, including an uppercase known extension and
an unknown extension. Known-extension lookup is case-insensitive, while an
unknown extension retains its authored spelling and is rendered as code. It is
also the only fixture exercising the prefixed form — every other constraint in
the suite sits at the root and reads "throughout the project".

Pins: cli/build/README.MD "Where files go", "Rendering"; TYPES.MD
"`description`".
