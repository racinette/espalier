export const description = "a web module";

export const rule = `Whatever web requires.`;

export async function lint({ emit }) {
  emit({ code: "ran_web", message: "the web espalier ran", severity: "info" });
}
