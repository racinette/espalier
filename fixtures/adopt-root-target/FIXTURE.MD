# adopt: the repository root has no name to borrow

`alpha/` and `beta/` hold the same filename, so they collapse — and the rule for
naming the node is "the parent directory, singularised", which at the root has
no answer. Paths are root-relative, so the root's name is the empty string, and
singularising it produced `[]`: not a valid capture name, so `adopt` reported
success and the next command could not compile the espalier.

`[directory]` is the same kind of guess as `[client]`. Renaming it is step one
of "After adopting", as it is for every name this command invents.

The written path is pinned too. Joining an empty prefix produced
`espalier//[directory]/handler.ts.mjs` in the report while `path.join`
normalised it on disk, so the command named a file it had not written to.

Pins: cli/adopt/README.MD "Placeholder names".
