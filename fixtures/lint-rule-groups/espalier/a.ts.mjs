export const description = "source";
export const guidance = "Shared policy.";
export const referenceImplementation = "a.ts";
export function lint({ emit }) {
  emit({ code: "duplicate", message: "same location", severity: "warning", line: 3, column: 5, metadata: { item: 1 } });
  emit({ code: "duplicate", message: "same location", severity: "warning", line: 3, column: 5, metadata: { item: 2 } });
  emit({ code: "different", message: "another violation", line: 3, column: 5 });
}
