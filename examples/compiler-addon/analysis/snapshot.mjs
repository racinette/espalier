// Every invocation gathers its own inputs, even on a shared analysis hit.
export async function snapshotFor(context) {
  const paths = await context.files("src/**/*.ts");
  const sources = await Promise.all(paths.map(async (file) => [file, await context.read(file)]));
  const settings = JSON.parse(await context.read("compiler.json"));
  if (Object.keys(settings).some((key) => key !== "compilerOptions") ||
      !settings.compilerOptions || typeof settings.compilerOptions !== "object" ||
      Array.isArray(settings.compilerOptions)) {
    throw new Error("Supply only a compilerOptions object in compiler.json.");
  }
  return { sources, compilerOptions: settings.compilerOptions };
}
