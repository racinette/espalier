export const description = "the route's page";
export const guidance = "Default-exports a React component.";
export async function lint({ path, read, emit }) {
  if (!(await read(path)).includes("export default")) emit({ code: "no_default_export", message: "a page must default-export its component" });
}
