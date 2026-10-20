# lint: `read` refuses a path the espalier does not govern

`notes.txt` is a real file, readable, sitting in the root. The config ignores
it, so `context.read("notes.txt")` fails with `read_ungoverned` and the run
exits `2` without reporting the issue the rule was about to emit.

An ungoverned path is outside the run's source snapshot. `read` and `files`
use the same governed set, so preparation and workers receive consistent
inputs. A rule that needs this file as source data must bring it into
governance.

Pins: TYPES.MD "Execution"; CONFIG.MD "addons".
