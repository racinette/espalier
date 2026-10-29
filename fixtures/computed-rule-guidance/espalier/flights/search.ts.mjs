export const instanceOf = "[module].ts.mjs";
export function description({ config, pattern, path, captures, locked }) {
  if (pattern !== "flights/search.ts" || path !== pattern || captures.group !== "flights" || captures.module !== "search") throw new Error("named file context");
  return `flight search (${locked ? "locked" : "unlocked"})`;
}
export function guidance({ config, pattern, path, captures, locked }) {
  return `Local ${pattern}; path=${path}; captures=${JSON.stringify(captures)}; ${locked ? "locked" : "unlocked"}.`;
}
export function lint({ emit }) {
  emit({ code: "local", message: "Local obligation." });
}
