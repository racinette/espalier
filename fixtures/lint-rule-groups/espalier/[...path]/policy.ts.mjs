export const description = "source";
export const guidance = "Shared policy.";
export const referenceImplementation = "a.ts";
export function lint({ emit }) {
  emit({ code: "constraint", message: "another owner", severity: "warning", line: 3, column: 5 });
}
