export const description = "the reference page";

export const rule = `Opens with the invocation as its level-one heading, then a
\`## Usage\` block listing every flag \`espalier explain\` accepts. A reader
looking up a command should not have to read the parser.

The page and the implementation are two halves of one claim. \`src/explain.ts\`
is what this page describes, and a page for a command nobody wrote is this tree
lying about what the tool does.`;

export async function lint({ read, files, emit }) {
  const text = await read();
  const heading = "# `espalier explain`";

  if (!text.startsWith(heading)) {
    emit({ code: "wrong_heading", message: `must open with ${heading}`, line: 1 });
  }
  if (!text.includes("\n## Usage\n")) {
    emit({ code: "no_usage", message: "must carry a \`## Usage\` block listing every flag" });
  }
  if ((await files("src/explain.ts")).length === 0) {
    emit({
      code: "undocumented_command",
      message: "documents \`explain\`, which src/explain.ts does not implement",
      metadata: { command: "explain" },
    });
  }
}
