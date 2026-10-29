export function guidance({ config, pattern, path, captures, locked }) {
  return `Policy ${pattern}; path=${path}; captures=${JSON.stringify(captures)}; ${locked ? "locked" : "unlocked"}.`;
}
export function lint({ emit }) {
  emit({ code: "policy", message: "Flight policy." });
}
