export const description = "a api module";

export const rule = `Whatever api requires.`;

export async function lint({ emit }) {
  emit({ code: "ran_api", message: "the api espalier ran", severity: "info" });
}
