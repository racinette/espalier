export const rule = "Inspect sources in the literal-question directory.";
export async function lint({ path, emit }) {
  emit({ code: "scoped.ts", severity: "info", message: path });
}
