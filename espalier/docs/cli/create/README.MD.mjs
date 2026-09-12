export const description = "the reference page";

export const rule = `Opens with the invocation as its level-one heading, then a
\`## Usage\` block spelling the path-first create and help forms for files and
directories. A reader looking up a command should not have to read the parser.

The page and the implementation are two halves of one claim. \`src/create.ts\`
is what this page describes, and a page for a command nobody wrote is this tree
lying about what the tool does.`;

export async function lint({ read, files, emit }) {
  const text = await read();
  const heading = "# `espalier create`";

  if (!text.startsWith(heading)) {
    emit({ code: "wrong_heading", message: `must open with ${heading}`, line: 1 });
  }
  if (!text.includes("\n## Usage\n")) {
    emit({ code: "no_usage", message: "must carry a `## Usage` block spelling both forms" });
  }
  if ((await files("src/create.ts")).length === 0) {
    emit({
      code: "undocumented_command",
      message: "documents `create`, which src/create.ts does not implement",
      metadata: { command: "create" },
    });
  }
}
