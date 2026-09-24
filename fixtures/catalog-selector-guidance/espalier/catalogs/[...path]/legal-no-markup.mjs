export const targets = ["*/legal-*.json"];
export const description = "legal copy stays plain text";
export const rule = `Every legal-* catalog contains plain-text legal copy,
never HTML markup. Legal screens render its values without HTML parsing.`;

export async function lint({ read, emit }) {
  let catalog;
  try {
    catalog = JSON.parse(await read());
  } catch {
    return;
  }
  if (catalog === null || Array.isArray(catalog) || typeof catalog !== "object") return;
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value === "string" && /<\/?[A-Za-z][^>]*>/.test(value)) {
      emit({ code: "legal_markup", severity: "error", message: `${key} contains markup` });
    }
  }
}
