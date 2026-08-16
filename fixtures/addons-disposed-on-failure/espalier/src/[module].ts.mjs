export const description = "a source module";
export const rule = `Export something.`;

export async function lint() {
  // A rule that throws is a bug in the rule, not a finding about the
  // repository: the run fails with exit 2.
  throw new Error("deliberate");
}
