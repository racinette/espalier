export const instanceOf = "[module].ts.mjs";
export const description = "the init command";

export const guidance = `Writes the configuration, \`.espalierignore\` and the espalier root, and
describes nothing; inferring shape is \`adopt\`'s job. Every refusal happens
before the first write, and an existing configuration is never merged into.
The lists under \`ignores/\` are read from the installed package and copied
verbatim, comments included: \`build\` renders those comments as the reason a
path is not described, and nothing reads the package's lists at lint time, so
upgrading cannot change what a repository governs. \`vendorAuthoring\` is shared
with \`migrate\`, so its sentinel and \`skip\` conditions are one rule for both
commands (\`docs/AUTHORING.MD\`). It neither loads a repository nor imports rule
modules. The command is specified in \`docs/cli/init/README.MD\`.`;
