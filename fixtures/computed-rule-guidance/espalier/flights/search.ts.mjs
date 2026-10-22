export const instanceOf = "[module].ts.mjs";
export function description({ config, pattern, path, captures }) {
  if (pattern !== "flights/search.ts" || path !== pattern || captures.group !== "flights" || captures.module !== "search") throw new Error("named file context");
  return `flight search (${config.build.guidanceMode})`;
}
export function rule({ config, pattern, path, captures }) {
  return `Local ${pattern}; path=${path}; captures=${JSON.stringify(captures)}; ${config.build.guidanceMode}.`;
}
export function lint({ emit }) {
  emit({ code: "local", message: "Local obligation." });
}
