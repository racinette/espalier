# ignoreFiles: external files define visibility

`ignoreFiles` names the external policy that defines which filesystem paths
exist to Espalier. This fixture names two files and exercises ordering within a
source, ordering between sources, and source reporting.

| Path | Outcome | Decided by |
|---|---|---|
| `build/nested/out.js` | ignored | `.gitignore.fixture` says `build/` |
| `vendor/lib.ts` | ignored | `.customignore` says `vendor/` |
| `src/generated.ts` | governed | `.gitignore.fixture` excludes it, then re-includes it |
| `src/kept.ts` | governed | `.customignore` excludes it, then re-includes it |

`src/kept.ts` pins that an external source's patterns remain ordered rather than
being collapsed into a set. `.espalierignore` cannot restore a path an external
source hides; that file governs only paths that survive this visibility layer.

`src/generated.ts` pins the same behavior in the first source.
`vendor/lib.ts` pins that more than one file can be named, and that `explain`
reports which of them hid a path.

`build/` is a directory, so the walk prunes it rather than enumerating and
discarding. Nothing here can see that from the outside; `test/candidates.test.ts`
asserts it against a directory that cannot be read.

Both external files are listed in `.espalierignore` only so the fixture's
control files stay outside structural matching. Espalier treats files named by
`ignoreFiles` as machinery regardless.

Neither is called `.gitignore`. Git would honour that name and hide `build/` and
`vendor/` from the repository, so the fixture would arrive at the next clone
missing the files it is about. `ignoreFiles` reads whatever the config names, so
the name is free — see this directory's README.

Pins: CONFIG.MD "`ignoreFiles`", "What counts as a file".
