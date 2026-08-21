# invalid: a module exporting both example forms

`example` is a path and `exampleSource` is source. A module setting each has
said two things that could disagree, and nothing decides between them — so the
run stops rather than picking one.

Both values here are individually valid, which is the point: the error is the
pair, not either half. `example-inline` shows each doing its job in its own
module.

Pins: TYPES.MD "`example` and `exampleSource`".
