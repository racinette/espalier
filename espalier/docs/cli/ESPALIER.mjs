// ---
// description: one page per command
// ---
export const description = "one page per command";
export const fold = false;
export const guidance = `
Each command has a reference page here, and the commands are an abstract
contract: \`[command]/\` states what every page holds to, and each command is
declared as its instance. \`espalier create docs/cli/<command>/README.MD\`
starts a page once the command is declared.

Both halves of a command are checked, from both ends. A page reports
\`undocumented_command\` when \`src/<command>.ts\` is not there, and each
command module opens with a header naming its page, which reports
\`header_names_missing_document\` when the page is not there.
`;
