# lint: a path that cannot be read fails the run

`src/dangling.ts` points at a file that is not there. The run exits `2` with
`unreadable_path` and lints nothing — not even `src/a.ts`, which is fine.

The reasoning is the one the rest of the tool runs on: something that could not
be read cannot be pronounced correct, and a run that stepped over it would
report a clean repository it never finished inspecting. The same code answers a
directory this process may not open, which is a condition an `ignore` entry
fixes rather than a bug in espalier.

An ignored path is never read, so it never fails this way — asserted in
`test/candidates.test.ts`, where the walk can be watched directly.

Pins: CONFIG.MD "Symlinks", ERRORS.MD.
