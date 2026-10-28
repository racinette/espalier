export const description = "padded table migrations";
export const rule = "Create or alter tables; six-digit sequence, lowercase slug.";
export async function lint({ emit, captures }) {
  emit({ code: "padded_migration", message: "Padded migration matched.", severity: "info", metadata: captures });
}
