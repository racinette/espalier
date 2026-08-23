# constraint-after-recursive

Pins a constraint whose directory path carries segments **after** the recursive
placeholder — [MATCHING.MD](../../docs/MATCHING.MD#placeholders): *"Segments may
follow it. `backend/[...path]/handlers/no-fetch.ts` applies to
`backend/**/handlers/*.ts`."*

Every other constraint in this suite puts `[...path]` last, so the half of the
matcher that walks the segments after it had never run. That half is not
symmetric with the half before it: it counts backwards from the end of the
directory path, because the recursive placeholder is what absorbs the
difference in length.

Three claims, and `queries/` is what separates them from an accident:

- **The trailing segment is required to match.** `backend/orders/queries/list.ts`
  is a `.ts` file under `backend/`, and a matcher that stopped at the recursive
  placeholder would constrain it. It has a structural owner, so nothing else
  suppresses the constraint — only the `handlers` segment does.
- **The capture spans the placeholder only.** `path` is `["orders"]`, not
  `["orders", "handlers"]`. The trailing segment is matched, not captured.
- **It works at more than one depth.** `billing/` and `orders/` are both one
  segment deep here; the `handlers` segment is found by counting from the end
  either way.

The constraint is instrumented — it reports `info`, so the run still exits `0`
and the assertion is about which files it ran on rather than about a
contrived violation.
