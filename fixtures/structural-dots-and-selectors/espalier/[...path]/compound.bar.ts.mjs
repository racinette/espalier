export const rule = "Inspect selected TypeScript implementations.";
export async function lint({ path, emit }) {
  emit({ code: "compound", severity: "info", message: path });
}
