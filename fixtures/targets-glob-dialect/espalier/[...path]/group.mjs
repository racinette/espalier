export const targets = ["**/*.{ts,tsx}"];
export const aggregate = true;
export const rule = "Inspect TypeScript sources together.";
export async function lint({ matches, files, emit }) {
  emit({ code: "group", severity: "info", message: matches.map(({ path }) => path).join(","), metadata: { listed: await files("**/*.{ts,tsx}") } });
}
