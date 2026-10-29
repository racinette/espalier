export const description = "flight manifest";
export function guidance({ pattern, path, captures }) {
  return `Resolved ${pattern}; path=${path}; captures=${JSON.stringify(captures)}.`;
}
export function lint({ emit }) {
  emit({ code: "resolved", message: "Resolved obligation." });
}
