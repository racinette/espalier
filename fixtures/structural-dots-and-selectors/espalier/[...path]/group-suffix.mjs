export const targets = ["**/*.ts"];
export const aggregate = true;
export const rule = "Inspect selected TypeScript implementations together.";
export async function lint({ matches, emit }) {
  emit({ code: "group-suffix", severity: "info", message: matches.map(({ path }) => path).join(",") });
}
