export const description = "the workspace readme";
export const rule = `Nothing this fixture cares about.`;
export async function lint(context) {
  context.emit({ code: "root", severity: "info", message: "the root espalier ran" });
}
