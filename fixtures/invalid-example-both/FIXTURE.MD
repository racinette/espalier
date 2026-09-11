# invalid: a module exporting both reference implementation forms

`referenceImplementation` is a path and `referenceImplementationSource` is source. A module setting each has
said two things that could disagree, and nothing decides between them — so the
run stops rather than picking one.

Both values here are individually valid, which is the point: the error is the
pair, not either half. `example-inline` shows each doing its job in its own
module.

Pins: TYPES.MD "`referenceImplementation` and `referenceImplementationSource`".
