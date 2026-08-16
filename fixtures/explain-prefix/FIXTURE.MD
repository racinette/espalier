# explain: prefixes, file paths, and telling them apart

Six queries against one repository, covering both forms of the answer and the
rule that decides which form you get.

## Which form

| Query | Form | Why |
|---|---|---|
| `components/` | prefix | trailing slash |
| `components` | prefix | the espalier has a directory node there |
| `.` | prefix | the root, which is a directory node |
| `main.ts` | file | a leaf node, not a directory |
| `components/buttons/SubmitButton.tsx` | file | no directory node at that path |
| `components/Modal.tsx` | file | nothing at that path at all |

`components` and `components/` return the same object, with `prefix`
normalized to the trailing-slash form. The alternative — answering "not
declared" for a directory the espalier plainly describes — is the behaviour
this case exists to prevent.

## The two shapes

A prefix answer carries `rules`, an array of every structural rule in the
subtree. A file answer carries `declared`, the names of the deepest recognized
node's children. They have different keys because they are different things:
`declared` already means "the immediate children of a node" everywhere else,
including in the `unexpected_path` metadata `lint` emits. Reusing it for a
flattened subtree listing would be one key with two shapes.

## Cardinality is not re-derived

The `cardinality` string comes from the same code that writes the closed-set
statement into `AGENTS.MD`. The root's sentence names both dynamic leaves by
their full relative paths and `components/`'s names them relative to itself —
the same relativity rule `build` uses, from the same function. `explain` and
the generated documentation cannot disagree, because there is nothing between
them to disagree.

It is asserted unwrapped. Line breaks belong to `build`, which is writing
prose into a file; a JSON consumer wants the sentence.

## Constraints

`no-as-any` applies to the whole project, so it appears under every prefix and
on every governed `.ts` and `.tsx` file. Its `captures` differ per file —
`[]` on `main.ts`, `["components", "buttons"]` on the button — which is the
recursive placeholder doing the only job it has.

`components/Modal.tsx` lists **no** constraints despite matching `**/*.tsx`. A
constraint only runs on a file with a structural owner, and this file has
none. Reporting it would describe a rule that will never run.

Pins: cli/explain/README.MD "Usage", "Output", "Exit codes";
MATCHING.MD "The deepest recognized node", "Ownership".

## The human layout is pinned too

`human/prefix.txt`, `human/owned.txt` and `human/undeclared.txt` hold the exact
stdout of three of these queries at `--format human`, compared byte for byte.
`human/prefix.txt` is the same bytes as the worked example in
cli/explain/README.MD; if they ever differ, one of them is wrong.

`components/ESPALIER.MD` has a two-paragraph body on purpose. Author prose is
copied verbatim and never re-wrapped, and a one-paragraph body that happens to
break where a greedy wrap would break proves nothing — an earlier draft of this
fixture had exactly that, and re-wrapping author prose passed it.
