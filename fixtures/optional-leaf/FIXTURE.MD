# optional-leaf

Pins `export const optional = true` — [TYPES.MD](../../docs/TYPES.MD#optional)
and the requiredness rules in
[MATCHING.MD](../../docs/MATCHING.MD#what-must-exist).

Two optional leaves, in the two positions that behave differently:

- `notes.md` sits on the static spine and has no file. A required leaf there
  would report `missing_required_file`; this one reports nothing, and the run
  exits `0`.
- `[client]/webhook.ts` sits inside a dynamic directory. `stripe/` has one and
  `twilio/` does not, and both are conforming. This is the case the espalier
  could not state before: declaring it required makes `twilio/` incomplete,
  and leaving it undeclared makes `stripe/webhook.ts` an `unexpected_path`.

`main.ts` and `[client]/client.ts` are required and present, so a fix that
simply stopped requiring anything would still fail — the ownership map and the
cardinality paragraph both name them.

The paragraph pins both new sentences from
[cli/build/README.MD](../../docs/cli/build/README.MD#the-cardinality-paragraph):
`notes.md is optional.` on the spine, and `Each one may also have webhook.ts.`
per instance. They are separate sentences from the required ones deliberately —
one tells an agent what it must produce, the other what it may — so a rendering
that merged them would read as the same claim and fails here.
