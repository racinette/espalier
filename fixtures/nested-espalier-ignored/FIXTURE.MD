# a nested espalier the root has given up

The same repository as `invalid-conflicting-espaliers`, with `packages/**`
ignored. The second config is now somebody else's, so the root run says nothing
about it — not the config, not the rule modules beside it, not the source it
governs.

This is the half that makes the halt a rule rather than a ban. A run that
stopped on any second config it could see would pass the invalid fixture and
fail this one.

Pins: CONFIG.MD "Nested espaliers".
