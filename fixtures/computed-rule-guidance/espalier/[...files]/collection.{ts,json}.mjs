import { isMainThread } from "node:worker_threads";
export const aggregate = true;
let calls = 0;
export async function guidance({ config, pattern, path, captures }) {
  if (!isMainThread || ++calls !== 1) throw new Error("render once across selectors");
  return `Collection ${pattern}; path=${path}; captures=${JSON.stringify(captures)}; ${config.build.guidanceMode}.`;
}
export function lint({ emit }) {
  emit({ code: "collection", message: "Collection obligation." });
}

let descriptions = 0;
export function description({ config, pattern, path, captures }) {
  if (!isMainThread || ++descriptions !== 1) throw new Error("describe once across selectors");
  if (pattern !== "[...files]/collection.{ts,json}" || path !== null || Object.keys(captures).length) throw new Error("constraint context");
  return `collection (${config.build.guidanceMode})`;
}
