export const instanceOf = "[module].ts.mjs";
export const description = "the marks a guard leaves in espalier modules";

export const guidance = `The one place that edits module source for a guard and reads it back. A change
comments out the statement it replaces and fences its replacement, so restoring
is a pass over comments that acorn confirms are comments, never text inside a
string. Every edit is restored in memory before it is returned, and one that
would not come back byte for byte is refused. Specified in
\`docs/cli/guard/README.MD\` "What it writes".`;
