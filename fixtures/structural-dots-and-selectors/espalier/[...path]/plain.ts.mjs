export const guidance = "Inspect selected TypeScript implementations.";
export async function lint({ path, emit }) {
  emit({ code: "plain", severity: "info", message: path });
}
