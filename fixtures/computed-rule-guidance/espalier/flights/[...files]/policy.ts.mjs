export function guidance({ config, pattern, path, captures }) {
  return `Policy ${pattern}; path=${path}; captures=${JSON.stringify(captures)}; ${config.build.guidanceMode}.`;
}
export function lint({ emit }) {
  emit({ code: "policy", message: "Flight policy." });
}
