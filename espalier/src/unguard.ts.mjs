export const instanceOf = "[module].ts.mjs";
export const description = "the unguard command";

export const guidance = `Takes back the guard in place by reading the espalier's files, never by
compiling them, so a guard comes back out of an espalier that no longer
compiles. Every module is restored in memory first; one edited since the guard
is refused before anything is written. Specified in \`docs/cli/unguard/README.MD\`.`;
