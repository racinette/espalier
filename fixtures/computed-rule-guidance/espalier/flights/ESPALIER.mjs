export const instanceOf = "../[group]";
let calls = 0;
export async function description({ config, pattern, path, captures, locked }) {
  if (++calls !== 1 || pattern !== "flights" || path !== "flights" || captures.group !== "flights") throw new Error("named directory context");
  const text = `flight operations (${locked ? "locked" : "unlocked"})`;
  config.build.filename = "changed";
  captures.group = "changed";
  return text;
}
export function guidance({ config, captures, locked }) {
  if (captures.group !== "flights") throw new Error("isolated captures");
  return `Local directory guidance (${locked ? "locked" : "unlocked"}).`;
}
