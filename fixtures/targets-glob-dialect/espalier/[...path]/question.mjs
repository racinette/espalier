export const targets = ["src/a?.ts"];
export const rule = "Inspect the selected source files.";
export async function lint({ path, emit }) {
  emit({ code: "question", severity: "info", message: path });
}
