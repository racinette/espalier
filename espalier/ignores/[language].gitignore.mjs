export const description = "a shipped ignore list";

export const rule = `One file per language, named for the language in lower
case. \`_common\` is the exception: it belongs to no language and \`init\` writes
it every time.

Contents are gitignore syntax. Comments explain why a group is here, because
the reader deciding whether to delete a line is the point of shipping these as
data rather than applying them from inside the tool.`;

export async function lint({ captures, read, emit }) {
  const { language } = captures;
  if (language !== language.toLowerCase()) {
    emit({ code: "not_lowercase", message: `"${language}" must be lower case` });
  }

  const lines = (await read()).split("\n");
  const patterns = lines.filter((line) => line.trim() !== "" && !line.startsWith("#"));

  if (patterns.length === 0) {
    emit({ code: "empty_list", message: "contributes no patterns" });
  }
  if (!lines.some((line) => line.startsWith("#"))) {
    emit({
      code: "unexplained_list",
      message: "has no comment saying why these paths are not architecture",
    });
  }
  for (const [index, line] of lines.entries()) {
    if (line !== line.trimEnd() || line.startsWith(" ")) {
      emit({ code: "stray_whitespace", message: `"${line}" is indented or trails whitespace`, line: index + 1 });
    }
  }
}
