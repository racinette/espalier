export const instanceOf = "[module].ts.mjs";
export const description = "checking a change against a base revision's locks, frozen files and seals";

export const guidance = `Judges a change against a base revision: the espalier by the locks in force
there, so a change cannot unlock what it edits, and the files by what was
frozen and sealed there. \`docs/LOCKS.MD\` "Checking against a base revision" is the
specification. The base is opened as a repository of its own from a temporary
copy, so ownership, freezing and sealing are answered by the same code as
everywhere else; nothing here re-derives them. Files on both sides are
classified by the base's espalier, since that is what a change is judged by. A module is compared together with every
repository file it imports, read with \`es-module-lexer\`, never with patterns
over source text: a guessed import graph is a lock with a hole in it. The
temporary copy is always removed, whatever the outcome.`;
