export const literalName = true;
export const description = "the dynamic page of the pages router";
export const rule = "Exports `getStaticPaths` beside the component.";
export async function lint({ path, read, emit }) {
  if (!(await read(path)).includes("getStaticPaths")) emit({ code: "missing_static_paths", message: "a dynamic page must export getStaticPaths" });
}
