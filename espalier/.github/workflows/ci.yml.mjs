export const description = "the checks every push and pull request runs";

export const guidance = `Runs on every supported Node version. It holds a push to what a release must
pass, so a release never discovers a failure CI could have reported.`;

export async function lint({ read, emit }) {
  const text = await read();
  for (const [step, code] of [["npm test", "no_tests"], ["cli.js lint", "no_lint"], ["cli.js build --check", "no_build_check"]]) {
    if (!text.includes(`run: ${step.startsWith("npm") ? step : `node dist/src/${step}`}`)) {
      emit({ code, message: `must run \`${step}\`, which a release requires` });
    }
  }
}
