# build: what is not described here, and why

The closed-set sentence is absolute — `Nothing else may exist under this
directory.` — and this section is what makes it true. Between the map above it,
`Governed elsewhere`, and this, every entry a reader can see in the directory is
named. A closed set that ended in *apart from* would not be closed.

Every branch of the rendering is here, because our own repository exercises them
and a demonstration is not an assertion:

- **A reason, quoted.** `vendor/` carries the comment above it in
  `.espalierignore`, verbatim.
- **A group.** `package.json` and `tsconfig.json` share one comment, and only
  the first of them carries the text. Repeating it would read as a refrain.
- **Wrapping.** That comment is longer than the column, so it wraps into it.
  Unlike a map line, where an alignment column that survived a wrap would not be
  one, here the column is what the continuation hangs from.
- **Ordering.** By reason, then by name, with the unexplained last. Ordering by
  name alone would scatter a group and leave its shared line landing wherever
  the alphabet put it.
- **A directory named directly.** `vendor/` is excluded as `vendor/`.
- **A directory excluded only by its contents.** `generated/**` never names the
  directory, so the walk enters it and finds every file excluded — and a reader
  still sees `generated/` sitting there. It is listed, with the reason from the
  entry that covers what is inside it.
- **An `ignoreFiles` exclusion, bare.** `logs/` comes from `.gitignore.fixture`,
  which has a comment above it. That comment does not appear. It was written for
  git by somebody answering a different question, and quoting it here would put
  words in their mouth — see [CONFIG.MD](../../docs/CONFIG.MD#espalierignore).
- **An entry nobody explained.** `notes.txt` is separated from the comment above
  it by a blank line, so it inherits nothing and the line is the path alone.
  `espalier` never invents a reason: it has patterns, not intent.
- **The document itself.** `AGENTS.MD` is added because a document sits in the
  directory it describes, not because the directory was read — on a first build
  it is not there yet, and a section that appeared on the second run would make
  `--check` report drift against a tree nobody touched.

The golden is compared byte for byte, so each of those is pinned by the same
assertion. `espalier.config.yaml`, `.espalierignore` and the espalier root are
described rather than quoted, since no comment introduces them: the tool may say
what its own machinery is, and may not say what a project's exclusions are for.

Pins: cli/build/README.MD "Not described here", CONFIG.MD "`.espalierignore`".
