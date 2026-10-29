export const instanceOf = "[module].ts.mjs";
export const description = "walking the repository";

export const guidance = `Walks the repository and supplies the entry primitives that \`compile.ts\` walks
the rule tree with. The decisions of \`docs/CONFIG.MD\` "What counts as a file",
"Symlinks" and "Linked worktrees" are made here once, for every command. It
does not decide which ignore files exist: the rules it applies in each
directory come from loaders its callers pass. Visibility is loaded before
governance, so a hidden \`.espalierignore\` governs nothing. Exclusion is
decided before a link is resolved, so a broken link can still be excluded, and
an excluded directory is never opened. Ignored files are still returned, so
\`explain\` can name the rule. \`inspect\` and \`readEntries\` fail with
\`unreadable_path\`, because a path that cannot be read cannot be pronounced
correct. \`probe\` is the tolerant counterpart for \`init\` and \`adopt\`, which
propose rather than pronounce. \`matchGlob\` is the one implementation of the
dialect in \`docs/MATCHING.MD\` "Glob syntax", and \`targets.ts\` and the API
both use it.`;
