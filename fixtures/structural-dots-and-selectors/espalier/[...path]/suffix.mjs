export const targets = ["**/*.ts"];
export const rule = "Inspect selected TypeScript implementations.";
export async function lint({ path, emit }) {
  emit({ code: "suffix", severity: "info", message: path });
}
