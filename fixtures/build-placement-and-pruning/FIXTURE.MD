# build: placement, pruning, and the whole render

The specification's worked example, made executable: placement, maps,
directory prose, structural and constraint guidance, and reference paths.

## Placement

Five placement points exist on the static spine — the root, `components`,
`components/buttons`, `src`, `src/clients`. Two of them are dropped:
`components` and `src` have no rules of their own and no `ESPALIER.MD`, and an
intermediate directory whose content all lives deeper produces no file. Three
files are written. The root map therefore expands through the two dropped
points, names `components/buttons/` and `src/clients/`, and stops before the
contents repeated in those documents. It opens with `./`; the deeper maps open
with `components/buttons/` and `src/clients/`, so each handoff directory is the
one row shared by the two maps.

The constraint at `[...path]/no-as-any.{ts,tsx}` places at the root, because a
recursive placeholder truncates the static prefix exactly like any other
dynamic segment. It renders as its own rule section and appears in no map:
it declares no file, so it answers no question a map is asked.

## Ordering

This fixture checks directories before files and static before dynamic
patterns. There are no overlapping dynamic siblings here, so alphabetical
ordering resolves the remaining choices. `handlers/` precedes `client.ts` in
the map and guidance sections even though the espalier declares them the other
way round. `ownership-dynamic-subsets` pins narrower patterns appearing before
their broader fallbacks.

## Requiredness

`handlers/webhook.ts` is **required** for every instantiated provider, not
optional. Static descendants of a dynamic directory are required at any depth;
the `handlers/` level checks requiredness beyond the immediate children.
Pins MATCHING.MD "What must exist".

## Prose with nowhere else to go

`espalier/src/clients/[provider]/ESPALIER.MD` describes a dynamic directory,
which is never a placement point. Its `description` reaches the map and its
body reaches the directory guidance section in `src/clients/AGENTS.MD`.
Without that rule the body would be silently discarded, which is the failure
mode this case exists to make loud.

## What the golden tree pins

Byte for byte: the provenance marker and its `source:`, both forms of the
heading — `# demo-app` at the root and `# demo-app — src/clients/` below it —
the root map stopping at its two deeper
generated documents while both descendant maps begin at the handoff directory
and remain complete, the alignment column
(longest map-internal line plus two, before the code block's own indent), the
80-column greedy wrap of a map line's text, section headings carrying
paths relative to the placement point, the `Reference implementation:` line appearing only
where a module exports one, and the two fixed texts.

Pins: cli/build/README.MD "Where files go", "Generation", "Rendering",
"Ownership", and its worked example.
