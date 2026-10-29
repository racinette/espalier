export const description = "a module";
export const guidance = "Report the shared problem and its distinct variants.";
export function lint({ emit }) {
  const base = { path: "shared.ts", code: "problem", message: "shared problem", line: 3, column: 2 };
  for (let i = 0; i < 13; i++) emit(base);
  emit({ ...base, path: "./shared.ts", severity: "error", metadata: {} });
  emit({ ...base, severity: "warning" });
  emit({ ...base, line: 4 });
  emit({ ...base, column: 3 });
  emit({ ...base, path: "elsewhere.ts" });
  emit({ ...base, code: "other" });
  emit({ ...base, message: "other problem" });
  emit({ ...base, metadata: { a: 1, b: [2] } });
  emit({ ...base, metadata: { b: [2], a: 1 } });
  emit({ ...base, metadata: { a: 1, b: [3] } });
}
