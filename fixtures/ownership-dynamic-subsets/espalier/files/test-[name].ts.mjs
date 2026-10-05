export const description = "simulation tests";
export const rule = "Exercise the named simulation behavior.";
export async function lint({ emit, captures }) {
  emit({ code: "test_rule_ran", message: "Test ownership selected.", severity: "info", metadata: { name: captures.name } });
}
