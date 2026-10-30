export const instanceOf = "[module].ts.mjs";
export const description = "the migrate command";

export const guidance = `The one command that must read a configuration holding removed settings, so it
never calls \`loadConfig\` or opens a repository. It edits the configuration and
rule sources as text, which keeps comments and key order, and never imports
authored code or compiles the espalier. Within each project, every check on
what it rewrites runs before the first write, so a refusal leaves that
project's files untouched. \`--dry-run\` takes the same path as a real run and
differs only at the write calls, and discovers children from the planned
\`.espalierignore\`. The dry-run notice comes from \`cli.ts\` once per
invocation, never from here, because this function recurses into every child.
What it rewrites and refuses is specified in \`docs/cli/migrate/README.MD\`.`;
