# adopt-optional-directory

Pins what `adopt` does with a **directory** only some siblings have —
[cli/adopt/README.MD](../../docs/cli/adopt/README.MD#siblings-that-only-partly-match):
*"A directory only some siblings have is declared where it stands, and
everything inside it is optional too. It never joins a family."*

`adopt-partial-overlap` pins the same rule for files. This is the directory
case, and it reaches a branch of the inference that nothing else does: the
recursion that carries optionality **downward**.

Three claims:

- **It keeps its own name.** `handlers/` is declared as `handlers/`, not as a
  `[handler]/` placeholder. Two of a thing is a pattern, and one is not — a
  directory a single sibling has is not evidence of a repeating unit, so
  collapsing it would declare a shape nobody observed.
- **Optionality is inherited.** `webhook.ts` is required by nothing, even
  though every `handlers/` that exists contains one. A file inside a directory
  that only sometimes exists only sometimes exists, and declaring it required
  would report `missing_required_file` against `twilio/` — a directory that
  has no `handlers/` at all.
- **The family above it is unaffected.** `client.ts` is in both siblings, so
  it stays required, and `[client]/` is still the placeholder. Optionality
  travels down from the partly-present node, not up from it.

The config is left alone: nothing in `ignore` covers `src/clients`, so there
is no entry to narrow and no `narrowed` line in the report.
