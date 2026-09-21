# Authoring corpus: well-formed cases and a mixed set

One connected example of the four questions. Each `fixtures/<name>/case.json`
is a structural artifact. Each case is locally well-formed (ordinary
constraint). The corpus together keeps a mixed share of mutations and a
minimum mean depth and arity (aggregate). No single file can satisfy the
averages.

The helper at `helpers/case.mjs` parses a string. It does not open paths or
remember repository contents. Pins: docs/AUTHORING.MD; authoring/AGENTS.MD.
