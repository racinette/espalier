export const instanceOf = "[module].ts.mjs";
export const description = "reading the espalier tree into a matcher";

export const guidance = `Turns the rule tree into the trie, constraints and directory metadata every
command reads, and refuses anything ambiguous before a repository file is
walked. \`docs/MATCHING.MD\` "Node kinds", "Classification" and "Ambiguity is
rejected" say what it accepts; \`docs/INSTANCES.MD\` says what instances and
declared groups compose into. Its passes are ordered. Every \`ESPALIER.mjs\` is
read before any rule module. Each module is imported before its path is parsed,
because \`literalName\` decides what its brackets are. Groups attach before
instances are cloned, so an inherited contract carries them, and sibling
ambiguity is checked only on the materialized tree. Function-valued
\`guidance\` and \`description\` render once per declaration, never per
instance. It walks the rule tree through \`files.ts\` under \`skip\` alone, never
\`.espalierignore\` or \`ignoreFiles\`. \`match.ts\` and \`pattern.ts\` match
without checking again, so every condition they would get wrong is rejected
here, through \`fail\`.`;
