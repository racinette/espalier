# backreference-leaf

Pins `{name}` — [MATCHING.MD](../../docs/MATCHING.MD#back-references) — and the
sentence everything else in that section derives from: *a back-reference
resolves to exactly one name once its capture is bound.*

`clients/[provider]/{provider}.ts.mjs` says each provider directory holds a
file named after itself. `stripe/stripe.ts` and `twilio/twilio.ts` are owned by
it; `stripe/retry.ts` is not, and falls to the dynamic sibling beside it.

Three claims, and the exhaustive `ownership` map is what separates them:

- **It resolves.** If the back-reference did not bind, `stripe.ts` would be
  owned by `[helper].ts.mjs` like any other filename, and the map says
  otherwise.
- **It is required per instance.** `twilio/` holds nothing but `twilio.ts`, so
  a rule that failed to require the resolved leaf would still exit `0` here —
  but one that required the *authored* name would look for a literal
  `{provider}.ts` and report `missing_required_file` against both providers.
- **It coexists with a dynamic sibling.** `{provider}.ts` and `[helper].ts`
  share a shape and are not an ambiguity, because they sit in different tiers
  and specificity decides. Checking them against each other would reject this
  espalier at compile time.

The map orders them `{provider}.ts` before `[helper].ts` — static, then
resolved, then dynamic — and names the resolved leaf as authored, with the
suffix saying what the brace holds: `{provider} repeats what [provider]
matched`. The map describes the rule rather than any one provider, so it cannot
print `stripe.ts` and must say what the name will be instead.

`explain` pins the lossy normalization stated in
[MATCHING.MD](../../docs/MATCHING.MD#normalization): the pattern is
`clients/*/*.ts`, which matches more than the rule does, because no glob can
say *the same text as that other part*.
