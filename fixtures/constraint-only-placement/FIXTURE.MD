# build: a placement point that exists only because of a constraint

`backend/` has no structural rules — nothing declares a single file there. It
is a placement point because `backend/[...path]/no-fetch.ts` was assigned to
it, the longest static prefix of its directory.

So `backend/AGENTS.MD` has **no trie node**, and the two sections that come
from one are omitted along with their headings: no `## Project layout`, no
closed-set sentence. There is nothing to say about what may exist under
`backend/`, because the espalier does not say. Writing an empty map, or a
closed-set sentence over an empty set, would be inventing an answer.

That is the general rule from cli/build/README.MD — "A section with nothing to
say is omitted entirely, along with its heading" — in the one place where it
removes something substantial rather than a `Reference implementation:` line.

## Filename-selector guidance

`no-fetch.ts.mjs` omits the optional `description`. The generated guidance
still identifies the selected files and their individual obligation; that
selection sentence is supplied whether or not a description is authored.
The `.MD` and `.WEIRD` rules show that selectors preserve authored case
instead of substituting a language label. Each selection also identifies
`backend/` as its scope.

Pins: cli/build/README.MD "Where files go", "Rendering"; TYPES.MD
"`description`".
