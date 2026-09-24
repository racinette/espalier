# adopt: entrypoints named after dotted directories

Pins cli/adopt/README.MD "A file named after its directory".

Dotted and undotted clients each have an entrypoint and a schema named after
that client. Adoption must infer {client}.ts and {client}.schema.json before
complete-extension grouping can split foo.bar from baz.qux.

Only the two dotted clients have an extra .debug.ts entrypoint. The third
client lacks it, so those files remain optional literal leaves rather than
becoming a required back-reference. Exact output also rules out duplicate
literal declarations for files already covered by the inferred back-references.
