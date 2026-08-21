export const description = "a button component";

export const rule = String.raw`Default-export a single component named after the file.`;

// One line, and source rather than a path. Under the old rule — an example
// containing a newline is source, anything else is a path — this was read as a
// path, failed `existsSync`, and exited 2.
export const exampleSource = String.raw`export default function Submit() { … }`;

export async function lint({ emit }) {
  // Only so the report has something to attach the example to: the layout of
  // `exampleSource` in a lint issue is the other half of what this pins.
  emit({ code: "seen", message: "the rule ran", severity: "info" });
}
