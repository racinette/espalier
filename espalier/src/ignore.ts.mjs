export const instanceOf = "[module].ts.mjs";
export const description = "gitignore-syntax matching";

export const guidance = `Reads the gitignore-syntax lists of \`.espalierignore\`, nested ones included,
and of \`skip\`. It reads them rule by rule, so \`explain\` can name the pattern,
file and comment that excluded a path, and \`build\` can quote the comment.
\`docs/CONFIG.MD\` "\`.espalierignore\`" and "\`skip\`" specify the syntax.
Patterns go through the same case-sensitive \`ignore\` package that
\`visibility.ts\` uses for \`ignoreFiles\`, so one line means one thing in every
file. The two remain separate modules because visibility and governance are
separate layers. In \`excludedBy\`, an exclusion settled at an ancestor
directory is final. That keeps its answer equal to what \`files.ts\` walked,
since the walk never enters an excluded directory. It is pure, raises nothing,
and never invents a comment: an entry's reason is what its author wrote, or
null.`;
