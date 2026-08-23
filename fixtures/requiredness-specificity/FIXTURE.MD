# matching: requiredness resolves by specificity, as ownership does

Two families at the same depth. `[area]/[module]/index.ts` describes any
directory two levels down; `clients/[provider]/client.ts` describes the ones
under `clients`. `clients` is a static sibling of `[area]`, so it wins — and
winning has to mean the same thing for both questions the espalier answers.

Ownership already resolved this way: `clients/stripe/client.ts` belongs to the
`clients` rule, not the `[area]` one. Requiredness did not, and instantiated
`[area]` for every first segment it saw. The run reported
`clients/stripe/index.ts` and `clients/twilio/index.ts` as
`missing_required_file` — files no rule had placed there, inside a directory
another rule describes.

The exit code is the assertion. Nothing here is missing and nothing here is
undeclared, so a run that answers the two questions from one tree in one order
has nothing to say. A dynamic pair that still reached across the static sibling
would produce two `missing_required_file` issues, and `ownership` would
disagree with them about who owns what.

The middle tier is here too. Under `clients/[provider]/`, a resolved directory
`{provider}/` sits beside a dynamic one `[env]/` — legal, and decided by
specificity rather than by guessing. `clients/stripe/stripe/` is the resolved
one's, so `[env]/` must not instantiate for it and demand a `config.ts` there.
Static and resolved are two tiers and each has to claim its own names, which is
why removing either half of the check fails this fixture.

`billing/invoices/` is the other half: no static sibling claims `billing`, so
`[area]/[module]/` does instantiate there, and its `index.ts` is required and
present. Removing it would report exactly one issue.

Pins: MATCHING.MD "What must exist", MATCHING.MD "Ownership".
