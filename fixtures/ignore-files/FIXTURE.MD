# ignoreFiles: patterns from files the config names

`ignoreFiles` reads other files the same way `.espalierignore` is read. This
fixture names two and uses each of the four routes a path can take through the
layering.

| Path | Outcome | Decided by |
|---|---|---|
| `build/nested/out.js` | ignored | `.gitignore.fixture` says `build/` |
| `vendor/lib.ts` | ignored | `.customignore` says `vendor/` |
| `src/generated.ts` | governed | `.gitignore.fixture` excludes it, then re-includes it |
| `src/kept.ts` | governed | `.customignore` excludes it, `.espalierignore` re-includes it |

`src/kept.ts` is the one that pins the layering order. Patterns from
`ignoreFiles` are placed **before** anything in `ignore`, and later patterns
win, so the config settles a disagreement with another tool's file. Reversing
the two would make `ignore` unable to re-include anything, which is the single
escape hatch the design promises.

`src/generated.ts` pins that a file's patterns are read in order among
themselves, not collapsed into a set. `vendor/lib.ts` pins that more than one
file can be named, and that `explain` reports which of them won — the whole
reason the origin is tracked at all.

`build/` is a directory, so the walk prunes it rather than enumerating and
discarding. Nothing here can see that from the outside; `test/candidates.test.ts`
asserts it against a directory that cannot be read.

Both ignore files list themselves in the config's `ignore` rather than in their
own contents, because a file that hid itself would leave nothing to explain.

Neither is called `.gitignore`. Git would honour that name and hide `build/` and
`vendor/` from the repository, so the fixture would arrive at the next clone
missing the files it is about. `ignoreFiles` reads whatever the config names, so
the name is free — see this directory's README.

Pins: CONFIG.MD "`ignoreFiles`", "`ignore`".
