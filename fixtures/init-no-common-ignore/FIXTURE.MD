# init --no-common-ignore: the ignore list is yours alone

`--lang go` still writes its block. The common one — version control
directories, repository metadata, CI, licences, editor and agent droppings —
is not written at all, and no key records that: the entries were only ever
copied, so declining them leaves nothing behind to decline.

The flag exists because the two halves are not the same kind of claim.
`--lang` is a guess about what a Go project keeps; the common block is a guess
about what every project keeps, and a project that genuinely governs its CI
definitions has no way to say so except by deleting lines from a file `init`
just wrote. This says it before the writing.

## What it costs

`.git/` is in that block and no `.gitignore` names it, so the config this
fixture produces walks the version control directory. That is the trade the
flag makes, and it is loud rather than subtle: several tens of thousands of
paths, reported the first time `lint` runs, fixed by one `ignore` line.

There is no matching config key, and there could not be a useful one. Nothing
here is applied at run time — the block is copied into `ignore` and then
belongs to the project — so after `init` the way to remove an entry is to
delete it. This flag is only about what gets written in the first place.

Pins: cli/init/README.MD "`--no-common-ignore`".
