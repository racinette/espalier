export const rule = `
Go through the shared request helper. Never call \`fetch\` directly.
`;

export async function lint({ read, emit }) {
  const source = await read();
  if (source.includes("fetch(")) {
    emit({ code: "raw_fetch", message: "calls fetch directly" });
  }
}
