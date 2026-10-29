export const description = "dated notes";
export const guidance = "A note is dated.";
export async function lint({ emit, captures }) {
  emit({ code: "dated_note", message: "Dated note matched.", severity: "info", metadata: captures });
}
