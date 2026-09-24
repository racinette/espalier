export const description = "a message catalog for one locale and domain";
export const rule = `Each domain catalog is a JSON object from message IDs to
non-empty strings. Its filename is the domain identifier used by the storefront.`;

export async function lint({ read, emit }) {
  let catalog;
  try {
    catalog = JSON.parse(await read());
  } catch {
    emit({ code: "invalid_catalog_json", severity: "error", message: "catalog is not valid JSON" });
    return;
  }
  if (catalog === null || Array.isArray(catalog) || typeof catalog !== "object") {
    emit({ code: "invalid_catalog_shape", severity: "error", message: "catalog must be an object" });
    return;
  }
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== "string" || value.trim() === "") {
      emit({ code: "invalid_catalog_message", severity: "error", message: `${key} must be a non-empty string` });
    }
  }
}
