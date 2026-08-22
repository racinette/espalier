export const description = "the file that lists its peers";

export const rule = `Nothing this fixture cares about.`;

// Deliberately impure. The token is an input the runner cannot see, so an
// invocation replayed from cache answers with the token the cold run was given
// and one that actually ran answers with the current one. That difference is
// the only way a skip is visible: warm and cold output are identical by design.
const token = () => process.env.ESPALIER_FIXTURE_TOKEN ?? "unset";

export async function lint(context) {
  const { emit } = context;
  await context.files("parts/*.ts");
  emit({ code: "token", message: token(), severity: "warning" });
}
