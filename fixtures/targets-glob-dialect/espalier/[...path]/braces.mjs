export const targets = ["**/*.{ts,tsx}"];
export const guidance = "Inspect the selected source files.";
export async function lint({ path, emit }) {
  emit({ code: "braces", severity: "info", message: path });
}
