export const description = "the template entry point";
export const guidance = String.raw`placeholder`;
export async function lint({ emit }) {
  emit({ code: "root_governed", message: "the root espalier owned this file", severity: "info" });
}
