export const description = "a source file";

export const rule = `Nothing this fixture cares about.`;

export async function lint(context) {
  if (context.path !== "src/a.ts") return;
  // Both halves of the claim in one line: the link is in the governed set, so
  // `files` returns it, and its content arrives through `read` under the path
  // the link occupies rather than the path it points at.
  const seen = await context.files("src/*.ts");
  const body = await context.read("src/linked.ts");
  context.emit({
    code: "through-the-link",
    severity: "info",
    message: `${seen.join(" ")} :: ${body.trim()}`,
  });
}
