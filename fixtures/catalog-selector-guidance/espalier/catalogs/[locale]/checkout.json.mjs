export const description = "the checkout message catalog for one locale";
export const rule = `Each locale has a checkout catalog with non-empty plain-text
messages for pay_now, payment_failed, and order_confirmed. The checkout UI
uses these IDs directly and does not render HTML from catalog values.`;

const REQUIRED = ["pay_now", "payment_failed", "order_confirmed"];

export async function lint({ read, emit }) {
  let catalog;
  try {
    catalog = JSON.parse(await read());
  } catch {
    emit({ code: "invalid_checkout_json", severity: "error", message: "checkout catalog is not valid JSON" });
    return;
  }
  if (catalog === null || Array.isArray(catalog) || typeof catalog !== "object") {
    emit({ code: "invalid_checkout_shape", severity: "error", message: "checkout catalog must be an object" });
    return;
  }
  for (const key of REQUIRED) {
    if (typeof catalog[key] !== "string" || catalog[key].trim() === "") {
      emit({ code: "missing_checkout_message", severity: "error", message: `${key} is missing or blank` });
    }
  }
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== "string" || value.trim() === "") {
      emit({ code: "invalid_checkout_message", severity: "error", message: `${key} must be a non-empty string` });
    } else if (/<\/?[A-Za-z][^>]*>/.test(value)) {
      emit({ code: "checkout_markup", severity: "error", message: `${key} contains markup` });
    }
  }
}
