export const instanceOf = "../[group]";
let calls = 0;
export async function description({ config, pattern, path, captures }) {
  if (++calls !== 1 || pattern !== "flights" || path !== "flights" || captures.group !== "flights") throw new Error("named directory context");
  const text = `flight operations (${config.build.guidanceMode})`;
  config.build.guidanceMode = "changed";
  captures.group = "changed";
  return text;
}
export function guidance({ config, captures }) {
  if (captures.group !== "flights") throw new Error("isolated captures");
  return `Local directory guidance (${config.build.guidanceMode}).`;
}
