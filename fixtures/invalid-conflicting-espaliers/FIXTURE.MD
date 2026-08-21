# invalid: two espaliers claiming one subtree

`packages/web` has an `espalier.config.yaml` of its own and the root config does
not ignore it. Both espaliers govern `packages/web/index.ts`, and there is no
composing them, so the run stops before either gets an answer.

The halt is not the absence of a rule for `packages/web`: adding one would not
help. Only `ignore` resolves it, because only `ignore` gives the subtree up.

Pins: CONFIG.MD "Nested espaliers", ERRORS.MD `conflicting_espaliers`.
