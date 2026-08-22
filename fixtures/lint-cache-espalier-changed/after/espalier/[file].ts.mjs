export const description = "a source file";

export const rule = `Rewritten between the two runs.`;

// Deliberately impure. The token is an input the runner cannot see, so an
// invocation replayed from cache answers with the token the cold run was given
// and one that actually ran answers with the current one. That difference is
// the only way a skip is visible: warm and cold output are identical by design.
const token = () => process.env.ESPALIER_FIXTURE_TOKEN ?? "unset";

export async function lint(context) {
  const { emit } = context;
  emit({ code: "token", message: token(), severity: "warning" });
}
