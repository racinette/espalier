export const description = "the package entry point";
export const rule = String.raw`placeholder`;
export async function lint({ emit }) {
  emit({ code: "child_ran", message: "the child espalier owned this file", severity: "info" });
}
