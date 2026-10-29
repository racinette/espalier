import { createTemplate } from "espalier";

export const description = "the command's reference page";

export const guidance = `Opens with the invocation as its level-one heading, then a
\`## Usage\` block listing every flag the command accepts, then the reasoning.
The flag list is the one part duplicated from \`src/cli.ts\`, on purpose: a
reader looking up a command should not have to read the parser. Lint holds the
two to each other, in both directions.

The page and \`src/<command>.ts\` are two halves of one claim, and the module's
header names the page. A page for a command nobody wrote, or a module whose
page was never written, is this tree lying about what the tool does.`;

/** Flags a block of usage text names: `--check`, `--with-optional`. */
const flagsIn = (text) => new Set([...text.matchAll(/(?<![\w-])--([a-z][a-z-]*)/g)].map((found) => found[1]));

/** Commands whose page carries no repository options. src/cli.ts USAGE. */
const STANDALONE = new Set(["create", "help", "examples"]);

export async function lint({ captures, read, files, emit }) {
  const command = captures.command;
  const text = await read();
  const heading = `# \`espalier ${command}\``;

  if (!text.startsWith(heading)) {
    emit({ code: "wrong_heading", message: `must open with ${heading}`, line: 1 });
  }
  // The synopsis is the Usage section's first fenced block; prose after it
  // may show template flags, which belong to rules rather than to the command.
  const usage = /\n## Usage\n+```[a-z]*\n([\s\S]*?)\n```/.exec(text);
  if (usage === null) {
    emit({ code: "no_usage", message: "must carry a `## Usage` block listing every flag" });
  }
  const module = `src/${command}.ts`;
  if ((await files(module)).length === 0) {
    emit({
      code: "undocumented_command",
      message: `documents \`${command}\`, which ${module} does not implement`,
      metadata: { command },
    });
    return;
  }
  if (usage === null) return;

  // The parser's synopsis lists each command's own flags under "<command> only:",
  // and the repository options every command but the standalone ones shares.
  const cli = await read("src/cli.ts");
  const synopsis = /const USAGE = `([\s\S]*?)`;/.exec(cli)?.[1] ?? "";
  const own = new RegExp(`\\n  ${command} only:\\n([\\s\\S]*?)(?:\\n\\n|$)`).exec(synopsis)?.[1] ?? "";
  const shared = /options shared by every command[^\n]*\n([\s\S]*?)(?:\n\n|$)/.exec(synopsis)?.[1] ?? "";
  const expected = new Set([...flagsIn(own), ...(STANDALONE.has(command) ? [] : flagsIn(shared))]);
  const documented = flagsIn(usage[1]);
  for (const flag of [...expected].filter((flag) => !documented.has(flag)).sort()) {
    emit({
      code: "undocumented_flag",
      message: `src/cli.ts lists --${flag} for ${command}, and the Usage block does not`,
      metadata: { flag },
    });
  }
  const implementation = `${cli}\n${await read(module)}`;
  for (const flag of [...documented].filter((flag) => flag !== "help" && !implementation.includes(flag)).sort()) {
    emit({
      code: "unimplemented_flag",
      message: `the Usage block lists --${flag}, which neither src/cli.ts nor ${module} mentions`,
      metadata: { flag },
    });
  }
}

export const template = createTemplate(({ captures }) => `# \`espalier ${captures.command}\`

## Usage

\`\`\`text
espalier ${captures.command}
\`\`\`

TODO: what the command does, and why it works the way it does.
`);
