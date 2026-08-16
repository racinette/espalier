export const description = "a source module";
export const rule = `Export something.`;

export async function lint({ path, emit, addons }) {
  addons.note(path);
  emit({
    code: "addon_state",
    message: `setup ran ${addons.started} time(s); ${addons.seen.length} file(s) noted so far`,
    severity: "info",
    metadata: { started: addons.started, noted: addons.seen.length },
  });
}
