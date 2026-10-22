# required-dynamic-leaf

Pins [collection minimums](../../docs/TYPES.MD#minmatches) and
[requiredness](../../docs/MATCHING.MD#what-must-exist).

A shared factory supplies `optional: true` to a static leaf. The dynamic leaf imports the shared checks
without re-exporting `optional`.
Omitted and true dynamic exports allow empty collections. Explicit false
requires a file owned by that rule. Root and missing static-directory
collections report against their directory. Ignored files and more-specific
static leaves cannot satisfy the broad pattern. Dynamic directory instances
are separate, with static and narrow-dynamic siblings winning ownership.
Static descendants under an instance still require a member, while an absent
dynamic directory does not need an instance. An extension-list member satisfies
the collection regardless of which admitted extension it uses.

The second run adds a root member and removes exactly that missing-match finding.
The generated map distinguishes one-or-more and zero-or-more collections.
