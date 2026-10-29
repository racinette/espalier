export const description = "an auth source file";
export const guidance = `Nothing this fixture cares about.`;
export async function lint(context) {
  context.emit({ code: "auth", severity: "info", message: `auth saw ${context.path}` });
}
