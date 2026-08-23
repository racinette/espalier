export const description = "no `as any`";

export const rule = `An escape hatch that silences the checker everywhere below it.`;

export async function lint(context) {
  // Instrumented: an `info` on every file the constraint runs against is how a
  // fixture observes which patterns the extension list produced.
  context.emit({ code: "ran", severity: "info", message: `ran on ${context.path}` });
}
