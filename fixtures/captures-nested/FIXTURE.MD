# matching: dynamic directories nest, and both captures reach the leaf

`[area]/[module]/` is two dynamic directories in one path, and
`{area}-{module}.ts` is one leaf referring to both. Every capture bound on the
way down is in scope at the bottom, not only the nearest one.

`billing/ledger/billing-invoices.ts` is the assertion. It has the right shape —
two words, a hyphen, `.ts` — and it belongs to the wrong instance: `[area]`
bound `billing` and `[module]` bound `ledger`, so the only name that resolves
here is `billing-ledger.ts`. The file is `unexpected_path` and the one that
should exist is `missing_required_file`. A back-reference that matched any
two-part name would report neither.

A resolved leaf is required per instance, which is why the second issue is
there at all: `{area}-{module}.ts` is a single filename once its captures are
bound, so it is required exactly as a static leaf would be.

The rules are instrumented so the captures themselves are observable. An
espalier this shape is otherwise silent about which text went into which name,
and that is the whole of what this fixture is about.

**Nesting is a wide claim.** `[area]/[module]/index.ts` says every directory
two levels down has an index — every one, not only the ones this fixture
happens to contain. That is what the espalier says, and it is why no second
family of rules lives here: any rule at this depth would collide with it.

Pins: MATCHING.MD "Captures", MATCHING.MD "Back-references".
