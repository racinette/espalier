export const targets = ["src/literal\\?.ts"];
export const rule = "Inspect the selected source files.";
export async function lint({ path, emit }) {
  emit({ code: "escaped", severity: "info", message: path });
}
