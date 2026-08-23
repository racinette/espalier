# backreference-directory

Pins `{name}` in a **directory** segment. [MATCHING.MD](../../docs/MATCHING.MD#back-references)
says a back-reference "carries literal text like any other segment part" and
that "nothing stops it appearing in a directory segment either" — and
`backreference-leaf` only ever exercises it as a leaf, where a different code
path resolves it.

Two sentences elsewhere turn out to depend on that, and both were false.

**Every matching constraint runs.** [MATCHING.MD](../../docs/MATCHING.MD#ownership):
*"**Every** constraint whose pattern matches a file runs against it, in addition
to that file's structural owner."* The constraint here sits below the resolved
directory, so deciding whether it matches means resolving `{provider}` against
the captures collected on the way down. A matcher that dropped them finds no
match, and the constraint silently never runs — no error, no missing rule, just
a check that stopped happening. `refund.ts` calls `fetch` and is the one file
that makes the difference visible.

**A declared directory is not "not declared".** [cli/explain/README.MD](../../docs/cli/explain/README.MD#usage):
*"`espalier explain src/clients` should not answer 'not declared' about a
directory the espalier plainly describes."* `clients/stripe/stripe/` is such a
directory. Resolving a prefix walks the trie separately from resolving
ownership, so it needs the same three tiers — static, resolved, dynamic — or a
directory the espalier declares answers exit `1`.

Both are the same omission in two places, which is why one fixture pins both:
a resolved segment is a literal only *relative to an instance*, and every walk
that meets one has to be carrying the instance.

The `ownership` map is what holds the third claim — that the resolved directory
did not quietly stop being a directory. All three files are owned by
`[handler].ts.mjs`, reached through `{provider}`, and a walk that failed there
would report `null` for every one of them.
