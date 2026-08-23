# matching: names are compared case-sensitively

The espalier declares `src/Client.ts`. The repository holds `src/client.ts`.
They are two different names, on every filesystem: the run reports the file as
undeclared and the rule as missing.

macOS and Windows would open one for the other, and a matcher that deferred to
the filesystem would answer differently depending on where it ran. An espalier
is a specification, so it decides this itself and decides it the same way
everywhere.

Both issues matter. Only `unexpected_path` would leave a matcher that folded
case looking correct on the file it found; only `missing_required_file` would
leave one that silently accepted the wrong name looking correct on the rule.

The two names differ in case alone, which a case-insensitive filesystem cannot
hold at once — so only one of them is a file here, and the other is the
declaration. That is the arrangement that stays legible everywhere.

`docs/Guide-[topic].md` is the other half, and the half that actually exercises
the matcher. A static name is compared as a string, so its case-sensitivity is
structural and cannot really be lost; a dynamic segment is compared by a regular
expression built from its literal parts, and that is where a stray `i` flag
would go unnoticed. `Guide-setup.md` is owned and `guide-intro.md` is not.

Pins: MATCHING.MD "Placeholders".
