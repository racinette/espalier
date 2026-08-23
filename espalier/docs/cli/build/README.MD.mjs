export const description = "generating the agent-facing documentation";

export const rule = `Opens with the invocation as its level-one heading, then a
\`## Usage\` block listing every flag \`espalier build\` accepts. A reader
looking up a command should not have to read the parser.

The page and the implementation are two halves of one claim. \`src/build.ts\`
is what this page describes, and a page for a command nobody wrote is this tree
lying about what the tool does.`;

export async function lint({ read, files, emit }) {
  const text = await read();
  const heading = "# `espalier build`";

  if (!text.startsWith(heading)) {
    emit({ code: "wrong_heading", message: `must open with ${heading}`, line: 1 });
  }
  if (!text.includes("\n## Usage\n")) {
    emit({ code: "no_usage", message: "must carry a \`## Usage\` block listing every flag" });
  }
  if ((await files("src/build.ts")).length === 0) {
    emit({
      code: "undocumented_command",
      message: "documents \`build\`, which src/build.ts does not implement",
      metadata: { command: "build" },
    });
  }
}
