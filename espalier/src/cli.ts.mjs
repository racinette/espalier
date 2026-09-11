export const description = "argument parsing and dispatch";

export const rule = `Carries each command's grammar, and each one is also written into that
command's page under \`docs/cli/\`. The duplication is deliberate: a reader
looking up a command should not have to read the parser. Create reserves only
the positional \`help\` action; its long flags belong to the selected template.`;

export async function lint() {}
