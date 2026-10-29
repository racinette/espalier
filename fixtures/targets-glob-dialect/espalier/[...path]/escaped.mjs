export const targets = ["src/literal\\?.ts"];
export const guidance = "Inspect the selected source files.";
export async function lint({ path, emit }) {
  emit({ code: "escaped", severity: "info", message: path });
}
