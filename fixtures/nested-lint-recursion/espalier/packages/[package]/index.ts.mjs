// The natural monorepo mistake: the root describes what a package looks like,
// and the package describes itself. Exactly one of them governs the file.
export const description = "a package entry point";
export const rule = String.raw`placeholder`;
export async function lint({ emit }) {
  emit({ code: "root_reached", message: "the root espalier owned this file", severity: "info" });
}
