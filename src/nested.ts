// Running the espaliers below this one. docs/cli/lint/README.MD "Nested
// espaliers".
//
// A child is a complete separate run — its own config, espalier, ignore lists
// and addons — so nothing here reaches into one. All this does is start them in
// order and translate what comes back into the frame the command was invoked
// in.

import path from "node:path";
import { OperationalError } from "./errors.js";
import type { BuildEntry, Issue, Reporter } from "./output.js";

function under(at: string, target: string): string {
  return target === "" ? at : `${at}/${target}`;
}

/**
 * A view of `reporter` for a run happening inside `at`. Paths arrive relative
 * to the child and leave relative to here, so one report reads as one
 * repository however many espaliers wrote it, and `espalier` names who spoke.
 *
 * Re-rooting the origin as well is what makes this compose: a grandchild's run
 * is wrapped twice and ends up named by its whole path.
 */
export function delegated(reporter: Reporter, at: string): Reporter {
  const origin = (found: string | null | undefined): string =>
    found === null || found === undefined ? at : under(at, found);

  return {
    issue(issue: Issue): void {
      reporter.issue({ ...issue, path: under(at, issue.path), espalier: origin(issue.espalier) });
    },
    warning(message: string): void {
      reporter.warning(message);
    },
    failure(code, message, detail, espalier): void {
      reporter.failure(code, message, detail, origin(espalier));
    },
    explanation(answer): void {
      const where =
        "prefix" in answer
          ? { prefix: answer.prefix === "" ? `${at}/` : under(at, answer.prefix) }
          : { path: under(at, answer.path) };
      reporter.explanation({ ...answer, ...where, espalier: origin(answer.espalier) });
    },
    record(entry: BuildEntry): void {
      reporter.record({ ...entry, path: under(at, entry.path), espalier: origin(entry.espalier) });
    },
    // The command owns the destination and closes it once, when everything
    // that had something to say has said it.
    finish(): void {},
  };
}

/**
 * Runs `visit` against every child in turn, and returns the worst exit code of
 * the lot.
 *
 * A child that fails is reported and the walk carries on. This is the one place
 * a failure is not the end of the run, and the partition is why: every sibling
 * is complete without the broken one, and one broken package hiding a violation
 * in another would be a worse report than the one naming both.
 */
export async function eachChild(
  root: string,
  children: string[],
  reporter: Reporter,
  visit: (childRoot: string, childReporter: Reporter) => Promise<number>,
): Promise<number> {
  let worst = 0;

  for (const at of children) {
    const scoped = delegated(reporter, at);
    try {
      worst = Math.max(worst, await visit(path.join(root, at), scoped));
    } catch (cause) {
      if (cause instanceof OperationalError) {
        scoped.failure(cause.code, cause.message, cause.detail);
      } else {
        scoped.failure("internal_error", (cause as Error).stack ?? String(cause));
      }
      worst = 2;
    }
  }

  return worst;
}
