# ownership: a dynamic directory beside a dynamic leaf

`[provider]` and `[summary].ts` are siblings whose names overlap —
"registry.ts" satisfies both shapes. They are not ambiguous, because only one
of them can own a file:

  clients/registry.ts        the leaf owns it; the directory cannot
  clients/stripe/client.ts   the directory is walked through; the leaf cannot

Ownership is decided by the role the segment needs, not by which sibling
matched the text first. A matcher that committed to the first match would
report clients/registry.ts as unexpected_path while [summary].ts sat unused.

The names are chosen so that `[provider]` is inserted into the trie before
`[summary].ts` — declaration order is alphabetical, and `p` precedes `s`.
That ordering is the whole point of the case: with the leaf first, a broken
matcher stumbles into the right answer and the fixture proves nothing.

Two dynamic leaves, or two dynamic directories, remain a compile error:
there is no role left to separate them. See invalid-overlapping-siblings.

Pins: MATCHING.MD "Ambiguity is rejected", the accepted case.
