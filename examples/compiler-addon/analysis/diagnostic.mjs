import path from "node:path";

const positive = (value) => Number.isInteger(value) && value > 0;

// Prefer a location in supplied application sources. Compiler support and
// external locations retain their origin without borrowing its coordinates.
export function diagnosticIssue(diagnostic, { root, checkedPath, governedPaths }) {
  const relative = diagnostic.file === undefined ? undefined :
    path.relative(root, path.resolve(root, diagnostic.file)).split(path.sep).join("/");
  const inside = relative !== undefined && relative !== "" &&
    relative !== ".." && !relative.startsWith("../") && !path.isAbsolute(relative);
  const primary = inside && governedPaths.includes(relative);
  const origin = diagnostic.file === undefined ? undefined : {
    file: inside ? relative : diagnostic.file,
    ...(positive(diagnostic.line) ? { line: diagnostic.line } : {}),
    ...(positive(diagnostic.column) ? { column: diagnostic.column } : {}),
  };
  const label = origin ? `${origin.file}${origin.line ? `:${origin.line}` : ""}${origin.line && origin.column ? `:${origin.column}` : ""}` : undefined;
  return {
    code: `typescript_${diagnostic.code}`,
    message: `${diagnostic.message}${!primary && label ? ` (from ${label})` : ""}`,
    path: primary ? relative : checkedPath,
    ...(primary && positive(diagnostic.line) ? { line: diagnostic.line } : {}),
    ...(primary && positive(diagnostic.column) ? { column: diagnostic.column } : {}),
    ...(origin ? { metadata: { origin } } : {}),
  };
}
