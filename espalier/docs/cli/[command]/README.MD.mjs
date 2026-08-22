export const description = "the page for one command";

export const rule = `One directory per command, named for the command, holding
a \`README.MD\` that opens with the invocation as its heading and carries a
\`## Usage\` block showing every flag.

The command must exist: \`src/<command>.ts\` implements it. A page for a command
nobody wrote, or a command whose page was never written, are the two ways this
tree lies about what the tool does.`;

export async function lint({ captures, read, files, emit }) {
  const { command } = captures;
  const text = await read();

  if (!text.startsWith(`# \`espalier ${command}\``)) {
    emit({
      code: "wrong_heading",
      message: `must open with \`# \\\`espalier ${command}\\\`\``,
      line: 1,
    });
  }
  if (!text.includes("\n## Usage\n")) {
    emit({ code: "no_usage", message: "must carry a `## Usage` block listing every flag" });
  }
  if ((await files(`src/${command}.ts`)).length === 0) {
    emit({
      code: "undocumented_command",
      message: `documents \`${command}\`, which src/${command}.ts does not implement`,
      metadata: { command },
    });
  }
}
