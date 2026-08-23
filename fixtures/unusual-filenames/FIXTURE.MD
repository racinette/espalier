# matching: names with spaces, accents, scripts, and no extension

A placeholder matches one character or more of anything that is not a slash, so
`[title].md` owns `getting started.md`, `mise-à-jour.md` and `日本語.md` alike.
Nothing here normalizes a name, splits on a space, or asks what alphabet it is
in — and a repository is entitled to all three.

`bin/release` is a static leaf with no extension. The espalier declares files by
name and a name without a dot is a name; only a *constraint* leaf needs an
extension, because an extension is what a constraint selects on.

`.cursor/` is the other half. A dot-prefixed segment cannot be declared — the
compiler never reads a dot-prefixed path, so a module for it would silently
never load — and `ignore` is the one legal resting place for it. Here that is
asserted from the repository side: the entry is what keeps a file the espalier
*could not* declare from being reported as undeclared.

Pins: MATCHING.MD "Placeholders", MATCHING.MD "Node kinds".
