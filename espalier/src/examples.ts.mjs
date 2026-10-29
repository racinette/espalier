export const instanceOf = "[module].ts.mjs";
export const description = "the examples command";

export const guidance = `Locates or copies the trees in the installed package's \`examples/\`
directory, beside \`docs/\`, and never loads a repository or configuration.
Stdout carries only a path, or the catalog for \`--help\`. Every diagnostic goes
to stderr, so an agent can use the output as a path. \`--copy\` reserves its
destination exclusively and copies entry by entry into absent paths, so
nothing existing is merged into or overwritten. On failure it removes only the
destination this run created. The command is specified in
\`docs/cli/examples/README.MD\`.`;
