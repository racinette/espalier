# lint: a symlink is what it points at

`src/linked.ts` is a link to `shared/b.ts`, which the config ignores. The link
is a file: `src/[name].ts` owns it, `files("src/*.ts")` returns it beside the
real `src/a.ts`, and `read` opens it under the path the link occupies.

That the target is ignored changes nothing. `ignore` excludes paths, and the
path here is `src/linked.ts` — a link pointing outside the governed set brings
what it points at in, which is the link's doing rather than the espalier's.

Skipping links instead would make a fifth thing invisible unconditionally, and
the only one nobody chose. It would also put `explain` in disagreement with
`lint`, which answered "owned" about a file `lint` never saw.

Pins: CONFIG.MD "Symlinks", MATCHING.MD "Files espalier does not see".
