import { isMainThread } from "node:worker_threads";
let descriptions = 0;
export async function description({ config, pattern, path, captures }) {
  if (!isMainThread || ++descriptions !== 1) throw new Error("describe once in coordinator");
  if (pattern !== "[group]/[module].ts" || path !== null || Object.keys(captures).length) throw new Error("base declaration context");
  const text = `shared operation (${config.build.guidanceMode})`;
  config.build.guidanceMode = "changed";
  return text;
}
let calls = 0;
export async function rule({ config, pattern, path, captures }) {
  if (!isMainThread || ++calls !== 1) throw new Error("render once in coordinator");
  const text = `Base ${pattern}; path=${path}; captures=${JSON.stringify(captures)}; ${config.build.guidanceMode}.`;
  config.build.guidanceMode = "evolving"; // Prove the callback gets its own copy.
  return text;
}
export function lint({ emit }) {
  emit({ code: "shared", message: "Shared obligation." });
}
