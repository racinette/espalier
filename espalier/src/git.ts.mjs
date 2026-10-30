export const instanceOf = "[module].ts.mjs";
export const description = "reading a base revision from git";

export const guidance = `The one module that runs git, and only for \`lint --base\`: the repository
walk stays a pure function of the working tree, and nothing else may import
this. Every git failure becomes \`base_unreadable\` through \`fail\`, never a
silent empty answer, because a check that quietly read nothing would pass.
Working-tree content is hashed by git itself, with the repository's filters,
so a line-ending conversion is never reported as an edit.
\`docs/LOCKS.MD\` "Checking against a base revision" is the specification.`;
