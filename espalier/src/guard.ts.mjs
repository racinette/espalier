export const instanceOf = "[module].ts.mjs";
export const description = "the guard command";

export const guidance = `Closes parts of a repository for one piece of work by writing \`locked\`,
\`frozen\` and \`sealed\` exports, and the declarations an opening needs, into
the espalier. It resolves each target to the one module that speaks for exactly
what the target names, plans every write before making one, and compiles the
written espalier before reporting success, taking the guard back if it does
not. Every edit goes through \`guardMarks.ts\`, never around it, so \`unguard\`
can take all of it back. It never touches git. Specified in
\`docs/cli/guard/README.MD\`.`;
