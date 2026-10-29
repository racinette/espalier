export const instanceOf = "[module].ts.mjs";
export const description = "path segments and what they match";

export const guidance = `Parses one path segment and answers what it matches. It transcribes
\`docs/MATCHING.MD\` "Placeholders" and its subsections, so a change to the
grammar starts in that document. It is pure: it uses no filesystem, trie or
repository, so \`compile.ts\`, \`match.ts\`, \`targets.ts\`, \`render.ts\` and
\`migrate.ts\` share one reading of a segment. The overlap and containment tests
decide whether compilation rejects two siblings, so they may err in one
direction only. An overlap may be over-reported but never missed, and
\`isStrictSubset\` is true only when containment is proven. \`matchSegment\`
relies on compilation having proven that every segment splits one way
("Captures must be unambiguous"). \`trieKey\` is internal identity, not a glob:
a placeholder keys with a NUL, so a literal bracketed name never shares a node
with a capture.`;
