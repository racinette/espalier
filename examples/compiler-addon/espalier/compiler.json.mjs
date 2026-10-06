export const description = "compiler settings supplied to the analysis service";
export const rule = `Contains a compilerOptions object. Source membership comes
from governed src files; settings have no extends, files, include, or exclude.`;
export async function lint({ read, emit }) {
  const value = JSON.parse(await read());
  if (Object.keys(value).some((key) => key !== "compilerOptions") ||
      !value.compilerOptions || Array.isArray(value.compilerOptions) ||
      typeof value.compilerOptions !== "object") {
    emit({ code: "compiler_settings", message: "Supply only a compilerOptions object." });
  }
}
