export const description = "an api source file";
export const rule = `Nothing this fixture cares about.`;
export async function lint(context) {
  context.emit({ code: "api", severity: "info", message: `api saw ${context.path}` });
}
