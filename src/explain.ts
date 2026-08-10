// `espalier explain`. docs/cli/explain/README.MD.
//
// Deliberately minimal: enough of the file form to answer what owns a path,
// which is what the conformance fixtures pin. The prefix form, ESPALIER.MD
// bodies, and the constraint listing are not implemented yet.

import path from "node:path";
import { isOwnership } from "./match.js";
import type { Reporter } from "./output.js";
import { open } from "./repository.js";

export interface ExplainOptions {
  cwd: string;
  config: string | undefined;
  target: string;
}

export async function explain(options: ExplainOptions, reporter: Reporter): Promise<number> {
  const repository = await open(options.config, options.cwd);

  const absolute = path.resolve(options.cwd, options.target);
  const target = path.relative(repository.config.root, absolute).split(path.sep).join("/");

  const found = repository.resolve(target);

  if (isOwnership(found)) {
    reporter.object({
      kind: "explanation",
      path: target,
      rule: found.rule.modulePath,
      pattern: found.rule.pattern,
      captures: found.captures,
    });
    return 0;
  }

  reporter.object({
    kind: "explanation",
    path: target,
    rule: null,
    pattern: null,
    captures: found.captures,
    recognized: found.recognized,
    declared: found.declared,
  });
  return 1;
}
