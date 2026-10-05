# Espalier 0.4.0

Structural file and directory rules can now share a broad fallback with more
specific placeholder patterns. A pattern wins when every name it matches also
matches a sibling's broader pattern, and the broader pattern admits additional
names. The broader sibling owns the remaining names.

For example, `[name]-checksonly/` can sit beside `[world]/`, and
`test-[name].ts.mjs` can sit beside `[file].ts.mjs`. Disjoint specializations
can share one fallback; nested specializations select the narrowest matching
pattern. Extension unions follow the same rule: `[file].ts.mjs` wins its files
beside `[file].{ts,tsx}.mjs`, which owns the remaining `.tsx` files.

Only the winning directory branch declares its contents and required files.
An undeclared file inside a specialization does not fall back to a broader
branch. Ownership, requiredness, `explain`, and `create` use the same selection
rules. Generated guidance lists narrower patterns before their fallbacks.

Equivalent patterns and overlapping patterns with no provably narrower winner
remain errors. For example, `prefix-[name]/` and `[name]-suffix/` conflict
because both match `prefix-suffix`; adding `[world]/` does not resolve that
conflict. Shared back-references are respected, and comparisons that cannot be
proved safe remain rejected.

This release also preserves line breaks in directory captures and structural
extension-union stems, aligning concrete matching with containment proofs.
Regression coverage includes independent containment oracles, exhaustive short
pattern comparisons, seeded specialization chains, and CLI checks.

## Upgrading from 0.3.0

Install 0.4.0 and run `espalier migrate` to update the exact config pin and the
marked authoring contract. Existing valid rule trees do not need to be
rewritten. Add specializations alongside broad rules when a subset needs its
own structure or conventions; broader directory requirements are not inherited.

Run `espalier explain` on representative specialized and fallback paths, then
run `espalier lint`, `espalier build`, and `espalier build --check`. Review and
commit the regenerated guidance with any rule changes.
