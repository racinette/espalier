export const rule = String.raw`Never use \`as any\`.`;
export async function lint({ emit }) {
  emit({ code: "ran_no_as_any", message: "constraint ran", severity: "info" });
}
