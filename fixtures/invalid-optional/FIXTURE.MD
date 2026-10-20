# invalid-optional

Pins [TYPES.MD](../../docs/TYPES.MD#optional): `optional` must be a boolean,
including on a dynamic leaf. A string `"true"` is rejected as
`module_invalid_export` before lint or build can proceed.
