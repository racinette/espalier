export const instanceOf = "[module].ts.mjs";
export const description = "the explain command";

export const guidance = `Answers from the same functions \`build\` and \`lint\` use, so it cannot
disagree with either about matching. Those are \`mapEntries\`, \`closedSet\`,
\`constraintGroups\`, \`requiredUnder\` and \`subtree\` from \`render.ts\`, and
ownership and admission from \`repository.ts\`, \`match.ts\` and \`targets.ts\`.
Never decide here something one of those already decides. The path picks the
espalier that answers, not the working directory: a path inside a child is
asked again of that child through \`nested.ts\`'s \`delegated\`, and children are
never visited otherwise. Every query ends in exactly one
\`reporter.explanation\` call, carrying the payload \`explainText.ts\` types.
Exclusion is checked before declaration for a prefix just as for a file, so
the two spellings of one question cannot answer differently. See
\`docs/cli/explain/README.MD\` "Usage", "Nested espaliers" and "Exit codes".`;
