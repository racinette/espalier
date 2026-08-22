export const description = "a source file";

export const rule = `Nothing this fixture cares about.`;

export async function lint(context) {
  // `notes.txt` exists and is perfectly readable. The espalier ignores it, so
  // the run refuses rather than opening it.
  await context.read("notes.txt");
  context.emit({ code: "unreachable", message: "the read was supposed to fail" });
}
