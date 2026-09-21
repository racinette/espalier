export const description = "argument parsing and dispatch";

export const rule = `Carries each command's grammar, and each one is also written into that
command's page under \`docs/cli/\`. The duplication is deliberate: a reader
looking up a command should not have to read the parser. Create reserves only
the positional \`help\` action; its long flags belong to the selected template.
\`help\` and \`examples\` read this package and do not load a repository.`;

export async function lint() {}
