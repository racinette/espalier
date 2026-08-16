# defaultIgnore: what the built-in list covers, and what it does not

The list in `src/defaults.ts` is append-only within a major version. An entry
omitted today costs a project one line of `ignore` and can be added in any
minor release; an entry included wrongly is stuck until the next major. This
fixture pins both halves of that bet.

## Covered

One path per category, chosen so a whole category cannot quietly disappear:

| Path | Category |
|---|---|
| `package.json` | manifests |
| `pnpm-lock.yaml` | lockfiles |
| `tsconfig.json` | tool configuration |
| `.github/workflows/ci.yml` | CI |
| `LICENSE` | licence |
| `.vscode/settings.json` | editor metadata |

`packages/web/package.json` is the one that pins matching semantics rather than
membership. Entries are gitignore syntax, so a bare name matches at any depth —
a manifest in a monorepo package is as much a manifest as the one at the root.
Anchoring it would have made the list useless for exactly the repositories that
most need it.

`.github/workflows/ci.yml` pins the directory form: the entry is `.github/`,
and the match has to happen against the ancestor rather than the file.

## Deliberately not covered

`README.MD`, `CHANGELOG.MD`, `Makefile` and `Dockerfile` are common enough that
their absence from the list looks like an oversight. It is not. Each is a file
some projects place on purpose, and a README per package directory is exactly
the kind of convention an espalier exists to hold.

So this fixture declares `[doc].MD`, and `README.MD` and `CHANGELOG.MD` are
**owned** — proving they were available to govern rather than silently
excluded. `Makefile` and `Dockerfile` are declared by nothing and are reported
as `unexpected_path`, which is the correct outcome for a tool whose claim is
that nothing goes unaccounted for.

Their `explain` answers assert `recognized: null` rather than the absence of an
`ignoredBy` key, which partial comparison cannot express. `recognized` appears
only on the undeclared branch and never on the ungoverned one, so asserting it
proves which branch answered.

Pins: CONFIG.MD "`defaultIgnore`", "What is deliberately absent".
