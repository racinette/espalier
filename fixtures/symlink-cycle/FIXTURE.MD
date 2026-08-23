# lint: a directory is walked once, however many paths reach it

`src/up` points at the fixture root, so following links naively re-enters the
whole repository under `src/up/`, and again under `src/up/src/up/`, until the
kernel refuses at around forty levels of indirection. The run terminates either
way. What it reports is the difference: one `unexpected_path` for `stray.txt`,
or forty-one of them.

Only an ancestor is refused, and nothing is lost by refusing it: the directory
the link points at is one the walk is already inside. `dev:ino` is what makes
the link recognizable as the same directory, and the walk root is seeded into
that set so a link straight to it is cut on arrival rather than after one more
pass over everything.

Two links onto the *same* directory are a different case and are both followed
— see `test/candidates.test.ts`. Reporting the file under whichever path
arrived first would make the answer depend on the order a `readdir` returned.

The count is the assertion. `issues` compares length, so a fixture expecting
one `unexpected_path` fails the moment the same file is reported twice.

Pins: CONFIG.MD "Symlinks".
