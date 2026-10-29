export const description = "validating and publishing a GitHub release to npm";

export const guidance = `Runs when a release is published. Validation repeats CI's checks on the
tagged commit and refuses a tag that does not match \`package.json\`; only
then does the publish job run, with npm trusted publishing and no token.`;

export async function lint({ read, emit }) {
  const text = await read();
  for (const [step, code] of [["npm test", "no_tests"], ["cli.js lint", "no_lint"], ["cli.js build --check", "no_build_check"]]) {
    if (!text.includes(`run: ${step.startsWith("npm") ? step : `node dist/src/${step}`}`)) {
      emit({ code, message: `must run \`${step}\` before publishing` });
    }
  }
  if (!/needs: validate/.test(text)) {
    emit({ code: "unvalidated_publish", message: "the publish job must need the validate job" });
  }
}
