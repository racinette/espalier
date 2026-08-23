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
generated map both name them.

The map pins the suffixes from
[cli/build/README.MD](../../docs/cli/build/README.MD#suffixes): `notes.md` and
`webhook.ts` carry `optional`, `main.ts` and `client.ts` carry `required`, and
neither is a default. A rendering that left the optional ones unmarked, or that
marked requiredness only at the top of the map, fails here — `webhook.ts` is
optional inside every `[client]/`, and the line it sits on is where that has to
be said.
