import { isMainThread } from "node:worker_threads";
export const aggregate = true;
let calls = 0;
export async function rule({ config, pattern, path, captures }) {
  if (!isMainThread || ++calls !== 1) throw new Error("render once across selectors");
  return `Collection ${pattern}; path=${path}; captures=${JSON.stringify(captures)}; ${config.build.guidanceMode}.`;
}
export function lint({ emit }) {
  emit({ code: "collection", message: "Collection obligation." });
}
