export const description = "never loaded: this config is data, not a child";
export const rule = String.raw`placeholder`;
export async function lint({ emit }) {
  emit({ code: "child_ran", message: "a demoted child was run anyway", severity: "error" });
}
