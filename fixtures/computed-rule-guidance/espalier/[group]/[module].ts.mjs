import { isMainThread } from "node:worker_threads";
export const description = "shared operation";
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
