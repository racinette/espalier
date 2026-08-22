export const description = "an implementation module";

export const rule = `Opens with a comment naming what the module is and, where
one exists, the document that specifies it — \`// What counts as a file.
docs/CONFIG.MD "What counts as a file".\` A shebang may come first.

A document named in that header must exist. The documents are the
specification, so a header pointing at a file nobody kept is a module whose
authority has quietly evaporated.`;

export async function lint({ path, read, files, emit }) {
  const text = await read();
  const lines = text.split("\n");
  const head = lines[0]?.startsWith("#!") ? lines.slice(1) : lines;
  const opening = head.find((line) => line.trim() !== "");

  if (opening === undefined || !(opening.startsWith("//") || opening.startsWith("/*"))) {
    emit({
      code: "no_header",
      message: "must open with a comment saying what this module is",
      line: 1,
    });
    return;
  }

  // The header runs until the first line that is not a comment.
  const header = [];
  for (const line of head) {
    if (line.trim() === "" && header.length === 0) continue;
    if (!(line.startsWith("//") || line.startsWith(" *") || line.startsWith("/*"))) break;
    header.push(line);
  }

  const named = new Set(header.join(" ").match(/docs\/[A-Za-z/]+\.MD/g) ?? []);
  for (const document of named) {
    if ((await files(document)).length === 0) {
      emit({
        code: "header_names_missing_document",
        message: `the header points at ${document}, which is not here`,
        metadata: { document },
      });
    }
  }
}
