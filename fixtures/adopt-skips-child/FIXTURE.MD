# adopt: a child inside the target is passed over

`packages/` holds `lib/`, an ordinary package, and `web/`, which has an espalier
of its own. Adopting `packages` declares the first and says nothing about the
second — not its files, not its config, not its rule modules.

They are not declared optional either. Optionality is what the inference says
about a file it could have declared and did not always find; a child's contents
are not this espalier's to declare at all, and a stub inviting the architect to
revisit one would be inviting them to break the boundary.

`lib/` is alone once `web/` is out, so nothing becomes a placeholder — one of a
thing is not a pattern. Its two files have different extensions, so neither do
they collapse.

Pins: cli/adopt/README.MD "Nested espaliers".
