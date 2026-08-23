export const description = "the application entry point";

export const rule = `Wire the packages together and nothing else.`;

export async function lint({ emit }) {
  emit({ code: "ran_root", message: "the root espalier ran", severity: "info" });
}
