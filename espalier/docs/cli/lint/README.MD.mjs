export const description = "validating the repository against the espalier";

export const rule = `Opens with the invocation as its level-one heading, then a
\`## Usage\` block listing every flag \`espalier lint\` accepts. A reader
looking up a command should not have to read the parser.

The page and the implementation are two halves of one claim. \`src/lint.ts\`
is what this page describes, and a page for a command nobody wrote is this tree
lying about what the tool does.`;

export async function lint({ read, files, emit }) {
  const text = await read();
  const heading = "# `espalier lint`";

  if (!text.startsWith(heading)) {
    emit({ code: "wrong_heading", message: `must open with ${heading}`, line: 1 });
  }
  if (!text.includes("\n## Usage\n")) {
    emit({ code: "no_usage", message: "must carry a \`## Usage\` block listing every flag" });
  }
  if ((await files("src/lint.ts")).length === 0) {
    emit({
      code: "undocumented_command",
      message: "documents \`lint\`, which src/lint.ts does not implement",
      metadata: { command: "lint" },
    });
  }
}
