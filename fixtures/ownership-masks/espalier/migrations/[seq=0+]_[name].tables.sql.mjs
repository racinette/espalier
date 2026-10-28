export const description = "unpadded table migrations";
export const rule = "Legacy migrations whose sequence is not padded or whose slug is not a lowercase slug.";
export async function lint({ emit, captures }) {
  emit({ code: "unpadded_migration", message: "Unpadded migration matched.", severity: "info", metadata: captures });
}
