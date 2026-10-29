export const targets = ["src/[ab].js"];
export const guidance = "Inspect the selected source files.";
export async function lint({ path, emit }) {
  emit({ code: "class", severity: "info", message: path });
}
