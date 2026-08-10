# Implementation handoff — session two

Session one is done. **The matcher and `espalier lint` are implemented and the
ten conformance fixtures pass.** This document is the brief for what comes next.

**Read before touching anything**, in this order: `README.MD`,
`docs/MATCHING.MD` (normative — the matcher is a direct transcription of it),
`docs/CONFIG.MD`, `docs/TYPES.MD`, `docs/cli/lint/README.MD`,
`fixtures/README.MD`.

## What exists

`espalier lint` and enough of `espalier explain` to answer what owns a path.
Node 20+, ESM, TypeScript, `node:test`, one runtime dependency (`yaml`).

```text
src/pattern.ts      segments, placeholders, shape normalization, overlap
src/compile.ts      the espalier tree → a trie plus a constraint list
src/match.ts        ownership, requiredness, the deepest recognized node
src/repository.ts   config + compile + the visible file set
src/lint.ts         the run, the lint context, issue construction
src/explain.ts      the file form only
src/output.ts       human and jsonl formatters, --out destinations
src/cli.ts          argument parsing and exit codes
```

`npm test` builds and runs everything: ten fixtures plus seven unit tests for
the sibling-overlap decision procedure, which is subtle and only partly
fixtured.

**Nothing is committed.** The working tree holds the whole session.

## Decisions taken in session one

All of these are now in the documents; the reasoning is there too. They are
listed here only so nobody reopens them by accident.

- **Nothing is deduplicated, and the runner promises no ordering.** Collapsing
  two issues means discarding one of two findings that agreed on the key and
  disagreed on `captures`. Formatters may buffer and reorder; `human` groups by
  path, `jsonl` does not.
- **`--format` and `--out` are independent.** Everything the run says — issues,
  the partial-run warning, an operational failure — goes through the chosen
  format to the chosen destination. Every `jsonl` line carries a `kind`.
- **`emit({path})` accepts any path inside the repository**, governed or not,
  declared or not, existing or not. Only absolute and escaping paths fail.
- **Overlapping dynamic siblings conflict only when they compete for the same
  role** — two leaves, or two directories. A dynamic directory beside a dynamic
  leaf is legal, and the matcher picks by role rather than by first match.
- **Error codes are emergent.** They are chosen at the throw site with no
  central registry, because we do not yet know which failures surface in real
  codebases. Three are load-bearing, pinned by fixtures: `ambiguous_siblings`,
  `inconsistent_capture_names`, `ignored_required_path`.

## Order of work

1. **Fixtures for `build`, before any of it is written.** This is the same
   discipline session one ran on the matcher and it is why the matcher was
   right the first time. `build` has no fixtures at all, and it is the half of
   the product the README leads with — documentation and linters from one
   source, and only the linters exist. Expect to argue out the provenance
   marker, orphan deletion, and what `inline` renders before writing code.

2. **`espalier build`.** See `docs/cli/build/README.MD`. It must refuse to
   overwrite a documentation file that lacks the marker.

3. **Finish `espalier explain`.** The prefix form, `ESPALIER.MD` frontmatter and
   bodies, the constraint listing, and a human format — it currently prints its
   JSON payload in both formats, which is a stub, not a design. Cheap, and it is
   the surface an agent queries before writing anything.

`init`, `adopt`, and `test` come after, and `--watch` is explicitly planned
rather than pending.

## Open questions

- **The double-catch shape.** A directory holding both a catch-all directory and
  a catch-all file is decidable, and now legal, but it has no clean sentence
  available for "what may exist here" — the closed-set statement `explain`
  prints has to cover two open sets at once. That is an argument for
  discouraging the shape in generated documentation rather than rejecting it in
  the compiler. **Decide before `build` is written**, since `build` is where the
  sentence has to be produced.
- **Clean fixtures hide matcher bugs.** Three of the ten assert a clean run, and
  a clean run is exactly where a bad owner goes unnoticed. `explain` assertions
  are the only thing making ownership observable and they cover only the paths a
  fixture names. Tightening this means asserting an owner for *every* file in
  the clean fixtures, which is a change to how fixtures are written.
- **When to harvest the error codes into `docs/cli/lint/README.MD`.** Deferred
  deliberately. Do it once the set stops moving, in one pass.

## Known gaps

Carrying `TODO`s in the code:

- `DEFAULT_IGNORE` in `src/defaults.ts` is a minimal honest placeholder, not the
  real list. `CONFIG.MD` promises it is append-only within a major version, so
  every entry added is a commitment.
- `WALK_EXCLUSIONS` in `src/defaults.ts`, used when the root is not a git
  repository, is unsettled for the same reason.
- `src/ignore.ts` evaluates every ancestor level and lets the last match win.
  Git additionally refuses to re-include a path whose parent directory is
  excluded. Ours is more permissive and covers the documented cases.

Implemented but unfixtured, so treat as unproven: `addons` setup and disposal,
`--staged` (fixtures are not git repositories, so nothing exercises it), and the
compile-time `example` validation from `TYPES.MD`.

Not implemented at all: `lint`'s espalier-amendment detection — the warning when
`espalier/` changed in the same working tree as the files it newly legalises.
`README.MD` promises it under "Who changes the espalier".

## Constraints

- The docs are the specification. If the code and a document disagree, the
  document is right.
- If a document is genuinely ambiguous or contradictory, **stop and report it**
  rather than picking an interpretation.
- Do not change fixtures to make the code pass. A failing fixture is a bug in
  the code until proven otherwise. Session one changed one fixture, deliberately
  and with the architect's agreement, because a design decision invalidated it.
- **A fixture that passes is not the same as a fixture that guards.** Session one
  shipped a case that passed with the fix reverted, because the espalier's
  declaration order let a broken matcher stumble into the right answer. Revert
  your fix and watch the new fixture fail before you believe it.
- Do not add features, flags, or config keys that no document describes.
- Rule modules are user-authored `.mjs` and are ordinary ES modules — no
  sandbox, no bundling.
