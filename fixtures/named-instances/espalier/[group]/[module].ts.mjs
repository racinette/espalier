export const description = "a shared module";
export const rule = "Every module contains BASE.";
export const minMatches = 1;
export async function lint({path, pattern, captures, read, emit}) {
  if (pattern !== "*/*.ts") emit({code: "base_pattern", message: "Inherited pattern changed"});
  if (captures.group !== path.split('/')[0] || captures.module !== path.split('/').at(-1).slice(0, -3)) emit({code: "base_captures", message: "Wrong inherited captures"});
  if (!(await read()).includes('BASE')) emit({code: "base_required", message: "BASE missing"});
}
