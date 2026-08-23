export const description = "a source file";

export const rule = `Nothing this fixture cares about.`;

export async function lint(context) {
  context.emit({ code: "unreachable", message: "the walk was supposed to fail" });
}
