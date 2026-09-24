export const description = "shipped copy has no editorial placeholders";
export const rule = `No catalog ships TODO or TBD as display copy. Finish each
message in its language before publishing the catalog.`;

export async function lint({ read, emit }) {
  let catalog;
  try {
    catalog = JSON.parse(await read());
  } catch {
    return;
  }
  if (catalog === null || Array.isArray(catalog) || typeof catalog !== "object") return;
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value === "string" && /\b(?:TODO|TBD)\b/i.test(value)) {
      emit({ code: "placeholder_copy", severity: "error", message: `${key} still contains an editorial placeholder` });
    }
  }
}
