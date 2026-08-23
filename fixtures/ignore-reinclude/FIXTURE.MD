# config: re-including one file out of an ignored directory

`.gitignore.fixture` says `bundle/`, which is how a repository almost always
spells it. The espalier declares `bundle/index.js`, which is committed on purpose.
Three lines in `ignore` are what reconciles them, and all three are load-bearing:

- `!bundle/` stops the directory being pruned, so the walk enters it at all.
- `bundle/**` ignores what is inside without pruning the directory.
- `!bundle/index.js` re-includes the one file.

Drop the first and the walk never enters `bundle/`, so nothing under it is ever
looked at and the last line matches nothing — the run fails with
`ignored_required_path`, naming a leaf whose parent was the problem. Drop the
second and `bundle/other.js` and `bundle/nested/deep.js` become `unexpected_path`.

The distinction that makes this work is between a pattern naming a directory and
one naming its contents: `bundle/` prunes, `bundle/**` does not. Both report the same
paths in the ordinary case, so nothing else in the suite can tell them apart.

The directory is `bundle/` rather than the `dist/` the documentation uses,
because this repository's own `.gitignore` says `dist/` and would keep the
fixture out of every clone.

Pins: CONFIG.MD "ignore", CONFIG.MD "ignoreFiles".
