export const targets = ["src/@(a1|a2).*"];
export const rule = "Inspect the selected source files.";
export async function lint({ path, emit }) {
  emit({ code: "extglob", severity: "info", message: path });
}
