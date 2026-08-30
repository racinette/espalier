# lint: aggregate constraints analyze one complete group

The lint is scoped to `fixtures/alpha/`, but `element-frequency` receives both
owned JSON files. Aggregate statistics cannot change with CLI scope. Its
matches are sorted and keep the recursive capture belonging to each file.

The JSON aggregate reads both members and emits once at the stable static
prefix `fixtures/`. The YAML aggregate has no matches and still runs, allowing
it to enforce that a group must not be empty.

Pins: TYPES.MD "`aggregate`"; cli/lint/README.MD "Aggregate constraints".
