export const description = "group manifest";
export function rule({ pattern, path, captures }) {
  return `Manifest ${pattern}; path=${path}; captures=${JSON.stringify(captures)}.`;
}
export function lint() {}
