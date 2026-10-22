export const instanceOf = "[module].ts.mjs";
export const description = "flight search";
export function rule({ config, pattern, path, captures }) {
  return `Local ${pattern}; path=${path}; captures=${JSON.stringify(captures)}; ${config.build.guidanceMode}.`;
}
export function lint({ emit }) {
  emit({ code: "local", message: "Local obligation." });
}
