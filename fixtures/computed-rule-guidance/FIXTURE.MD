# Computed rule guidance

TYPES.MD "rule": structural and constraint prose is evaluated once per authored
declaration, with known named bindings and no invented dynamic matches. The
shared and local contexts survive inheritance, extension-list aggregates share
one rendering, and lint, explain, and generated guidance use the same text.

TYPES.MD "description" and "Directory modules": synchronous and asynchronous
descriptions use the same declaration contexts as prose and render once per
declaration, including across inheritance and extension selectors. Callbacks
receive isolated config and captures; directory and file labels, constraint
summaries, explain, and findings contain the rendered strings.
