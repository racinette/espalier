export const description = "the module index";
export const rule = `Nothing this fixture cares about.`;
export async function lint(context) {
  context.emit({ code: "captured", severity: "info", message: JSON.stringify(context.captures) });
}
