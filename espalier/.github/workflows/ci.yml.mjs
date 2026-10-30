export const description = "the checks every push and pull request runs";

export const guidance = `Runs on every supported Node version. It holds a push to what a release must
pass, so a release never discovers a failure CI could have reported. A pull
request is also checked against its target branch with \`lint --base\`, so a
change to a locked module, a frozen file or a sealed collection fails until
someone authorized overrides it.`;

export async function lint({ read, emit }) {
  const text = await read();
  for (const [step, code] of [["npm test", "no_tests"], ["cli.js lint", "no_lint"], ["cli.js build --check", "no_build_check"]]) {
    if (!text.includes(`run: ${step.startsWith("npm") ? step : `node dist/src/${step}`}`)) {
      emit({ code, message: `must run \`${step}\`, which a release requires` });
    }
  }
  if (!text.includes("node dist/src/cli.js lint --base ") || !text.includes("github.event_name == 'pull_request'")) {
    emit({ code: "no_base_check", message: "must run `cli.js lint --base` against a pull request's target branch" });
  }
}
