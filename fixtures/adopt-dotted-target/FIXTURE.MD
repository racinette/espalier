# adopt-dotted-target

Pins the third refusal in [cli/adopt/README.MD](../../docs/cli/adopt/README.MD#what-it-refuses): a
target with a dot-prefixed segment fails with `invalid_adopt_target` and writes
nothing.

`MATCHING.MD` skips dot-prefixed entries anywhere in the espalier, directories
included, so a module at `espalier/.cursor/rules/backwards-compat.mdc.mjs` is
never read. Before this case, `adopt .cursor` wrote exactly that module,
reported it as `written`, and exited `0` — while `lint` went on reporting every
file under `.cursor/` as `unexpected_path`. Two commands disagreeing, with
nothing on either side saying so.

The absence of an `expected-adopt/` is half the assertion: the run must fail
before it writes, not partway through. `.cursor/rules/backwards-compat.mdc` is a
real file here rather than an empty placeholder, so a run that decided to infer
from it would have something to infer.
