# build: placement, pruning, and the whole render

The workhorse. It is the specification's own worked example, made executable,
and it is the only fixture that renders every part of the document.

## Placement

Five placement points exist on the static spine — the root, `components`,
`components/buttons`, `src`, `src/clients`. Two of them are dropped:
`components` and `src` have no rules of their own and no `ESPALIER.MD`, and an
intermediate directory whose content all lives deeper produces no file. Three
files are written.

The constraint at `[...path]/no-as-any.{ts,tsx}` places at the root, because a
recursive placeholder truncates the static prefix exactly like any other
dynamic segment. It renders under `## Constraints` and appears in no map:
it declares no file, so it answers no question a map is asked.

## Ordering

Every sibling list is directories before files, then static before dynamic,
then lexicographic. That is why `handlers/` precedes `client.ts` in the map
even though the espalier declares them the other way round, and why the
cardinality sentence lists `handlers/webhook.ts` first — a reader comparing
the sentence against the map should not have to re-sort it.

## Requiredness

`handlers/webhook.ts` is **required** for every instantiated provider, not
optional. Static descendants of a dynamic directory are required at any depth,
and this is the only fixture where that depth is more than one.
Pins MATCHING.MD "What must exist".

## Prose with nowhere else to go

`espalier/src/clients/[provider]/ESPALIER.MD` describes a dynamic directory,
which is never a placement point. Its `description` reaches the map and its
body reaches `src/clients/AGENTS.MD` as a `## src/clients/[provider]/` section.
Without that rule the body would be silently discarded, which is the failure
mode this case exists to make loud.

## What the golden tree pins

Byte for byte: the provenance marker and its `source:`, the alignment column
(longest map-internal name plus two, before the code block's own indent), the
80-column greedy wrap of the cardinality paragraph, section headings carrying
the full path from the repository root, the `Example:` line appearing only
where a module exports one, and the two fixed texts.

Pins: cli/build/README.MD "Where files go", "Generation", "Rendering",
"Ownership", and its worked example.
