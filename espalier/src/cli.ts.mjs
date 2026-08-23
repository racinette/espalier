export const description = "argument parsing and dispatch";

export const rule = `Carries the flags every command accepts, and each one is also written into
that command's page under \`docs/cli/\`. The duplication is deliberate: a reader
looking up a command should not have to read the parser.`;

export async function lint() {}
