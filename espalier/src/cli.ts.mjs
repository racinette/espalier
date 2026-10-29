export const description = "argument parsing and dispatch";

export const guidance = `Carries each command's grammar, and each one is also written into that
command's page under \`docs/cli/\`. The duplication is deliberate: a reader
looking up a command should not have to read the parser. Create reserves the
positional \`help\` and \`preview\` actions; flags after -- belong to the selected template.
\`help\` and \`examples\` read this package and do not load a repository.`;

export async function lint() {}
