# invalid-optional

Pins the last sentence of [TYPES.MD](../../docs/TYPES.MD#optional): only
structural leaves take `optional`, and a module exporting it anywhere else is
*rejected rather than ignored*.

Here it is on a dynamic leaf, which already matches nothing without complaint,
so the export cannot change what the espalier requires. Ignoring it would be
the quiet failure: the author has said something about requiredness and would
be left believing it took effect.

The espalier never compiles, so nothing is linted and the run exits `2`.
