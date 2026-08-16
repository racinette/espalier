# addons: disposal runs even when the run fails

The rule throws. `TYPES.MD` says that is a bug in the rule rather than a
finding about the repository, so the run fails with exit `2` and reports
`rule_threw`.

`CONFIG.MD` says disposal runs after the run completes — **including when it
fails**. That clause is the whole fixture. An addon holds an out-of-process
resource; leaking a language server because a rule had a typo is the kind of
failure that shows up as a machine slowly filling with orphaned processes,
long after anyone connects it to the tool that caused it.

`addons-shared-resource` pins disposal on the happy path. This pins the path
where it is easy to forget, because the code that runs it has to sit in a
`finally` rather than after the last statement.

Pins: CONFIG.MD "`addons`"; TYPES.MD "Execution".
