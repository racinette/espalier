export const rule = String.raw`A root constraint, live and scoped to the whole repository.`;
export async function lint({ emit }) {
  emit({ code: "root_constraint_ran", message: "constraint ran", severity: "info" });
}
