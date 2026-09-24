# build: extglob suffixes remain patterns

Pins cli/build/README.MD "Rendering" and MATCHING.MD "Glob syntax".

An @(ts|tsx) per-file selector and a +(ts|tsx) aggregate selector both match
TypeScript sources. Their guidance must retain the actual globs, not claim
that filenames end in literal .@(ts|tsx) or .+(ts|tsx) text.

A plain .ts suffix glob keeps its concise suffix description. Explain checks
pin the distinction independently of the generated-document golden.
