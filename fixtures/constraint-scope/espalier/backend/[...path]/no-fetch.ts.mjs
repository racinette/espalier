export const rule = String.raw`Do not call fetch directly.`;
export async function lint({ captures, emit }) {
  emit({
    code: "ran_no_fetch",
    message: "constraint ran",
    severity: "info",
    metadata: { path: captures.path },
  });
}
