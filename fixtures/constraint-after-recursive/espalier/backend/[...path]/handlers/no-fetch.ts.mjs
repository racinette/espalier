export const rule = `Go through the shared request helper, never \`fetch\`.`;

export async function lint({ path, captures, emit }) {
  emit({
    code: "ran_no_fetch",
    message: "constraint ran",
    severity: "info",
    metadata: { on: path, path: captures.path },
  });
}
