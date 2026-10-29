export const instanceOf = "[module].ts.mjs";
export const description = "ownership, requiredness, and the deepest recognized node";

export const guidance = `Answers ownership, requiredness and how far a path was recognized, over an
espalier that \`compile.ts\` has already accepted. \`docs/MATCHING.MD\`
"Ownership", "What must exist" and "The deepest recognized node" specify the
answers, and \`docs/INSTANCES.MD\` "Declaring a group" specifies required groups.
It is pure and imports the compiler for types only. One \`selectChild\` chooses
the winner for files, directories and requirements alike, which keeps lint,
explain, create and the API in agreement about who owns a path. Keep it the
only place a child is chosen. It never backtracks to a broader sibling and
raises no failures. Ambiguity was compile's to reject, and a path that does not
resolve comes back as a \`Recognition\`, not an error. \`structuralChecks\` is
the one list of the checks a file answers to, inherited ones included. Each
check gets only the captures its own declaration names.`;
