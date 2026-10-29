export const instanceOf = "[module].ts.mjs";
export const description = "finding where one espalier's authority ends";

export const guidance = `Decides where one espalier's authority ends, for \`repository.ts\` and for
\`migrate.ts\`, which finds children without opening a repository. Keeping that
decision in this one function is what stops the two from disagreeing about a
boundary. Ignore rules are consulted first, so an ignored config is plain
content rather than a boundary; that is how this repository keeps its
\`fixtures/\` configs. Only the nearest children are returned, and the function
relies on candidates arriving sorted. Depth comes from each child's own run
finding its children the same way, so do not recurse here. See
\`docs/CONFIG.MD\` "Nested espaliers" and "Suppressing discovery".`;
