export const instanceOf = "[module].ts.mjs";
export const description = "the lint command";

export const guidance = `The one lint implementation: \`cli.ts\` calls it, and \`api.ts\`'s \`check\` runs
it behind a collecting reporter. Anything said only through
\`reporter.warning\` or the exit code therefore never reaches an API caller.
Findings belong in issues, and failures belong in thrown \`OperationalError\`s.
Ownership, built-in issues and job assembly happen here in the coordinator.
Rule callbacks run only in workers through \`workers.ts\`, so the issue set
must not depend on how jobs are split across workers. Path arguments are
resolved to absolute paths once, here, and passed to children unchanged. A
child the scope does not reach is never started, and an aggregate or group
with any member in scope still gets its complete match set. See
\`docs/cli/lint/README.MD\` "Scoping", "Parallel execution", "Nested espaliers"
and "Exit codes", and \`docs/API.MD\` "\`check(options)\`".`;
