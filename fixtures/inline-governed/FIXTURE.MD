# inline: one list of child espaliers, at the root

`build-governed-at-each-level` in the distributed form, with `build.inline`
turned on and nothing else changed. Distributed, `tools/reports/` is named
twice — once in `AGENTS.MD` and once in `tools/AGENTS.MD` — because each of
those files ends on its own absolute closed set and each is read alone.

Inline there is one file, one closed set, and one list. The folded `tools/`
section carries its prose and its rule sections and nothing else, exactly as
the distributed form's second `Governed elsewhere` would have been the same
directory named a second time in a document the reader has already read it in.

The name is the root's, `tools/reports/` rather than `reports/`, because it is
the root's closed set that defers. A folded section repeating it relative to
itself would be the one thing this mode exists to avoid: one rule stated twice
in words that differ.

The child is still its own run, and its document is written into its own
directory. Inline output is the outer espalier's configured decision about the outer
espalier's documentation; it says nothing about anybody else's.

Pins: cli/build/README.MD "Inline output", "Governed elsewhere".
