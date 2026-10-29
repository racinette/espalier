export const description = "one command";
export const abstract = true;
export const guidance = `
A directory per command, named for it, and \`src/<command>.ts\` implements it.
Every command is declared here as an instance, because adding one is a
decision about what the tool is: an undeclared directory is reported rather
than let through by a placeholder that would have accepted any name.
`;
