export const description = "an integration with an external API";
export const rule = String.raw`Every client must appear in the registry.`;
export async function lint({ read, emit }) {
  const registry = await read("clients/registry.ts");
  if (!registry.includes("providers")) {
    emit({
      path: "clients/registry.ts",
      code: "registry_empty",
      message: "the registry lists no providers",
    });
  }
}
