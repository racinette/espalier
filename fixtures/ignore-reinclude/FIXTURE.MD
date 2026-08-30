# config: re-including one file out of an ignored directory

`.gitignore.fixture` hides the contents of `bundle/`, while the espalier
declares `bundle/index.js`, which is committed on purpose. The exception must
live in the external ignore source itself:

- `bundle/*` hides the directory's children without pruning `bundle/` itself.
- `!bundle/index.js` re-includes the declared file.

Spelling the first rule as `bundle/` would prune the directory, preventing the
negation from reaching `index.js`; the run would fail with
`ignored_required_path`. Putting the negation in `.espalierignore` would fail
for the same reason at a different layer: paths hidden by the external policy
never reach Espalier governance.

The distinction that makes this work is between a pattern naming a directory and
one naming its contents: `bundle/` prunes, `bundle/*` does not. Both report the same
paths in the ordinary case, so nothing else in the suite can tell them apart.

The directory is `bundle/` rather than the `dist/` the documentation uses,
because this repository's own `.gitignore` says `dist/` and would keep the
fixture out of every clone.

Pins: CONFIG.MD "ignoreFiles".
