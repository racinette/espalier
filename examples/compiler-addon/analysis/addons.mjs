import { fileURLToPath } from "node:url";
import { createCompilerService } from "./compiler.mjs";
import { diagnosticIssue } from "./diagnostic.mjs";

import { snapshotFor } from "./snapshot.mjs";

export async function prepare(context) {
  return snapshotFor(context);
}

export function setup(snapshot) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const compiler = createCompilerService(root);
  return {
    snapshot,
    compiler,
    diagnosticIssue: (diagnostic, location) => diagnosticIssue(diagnostic, { ...location, root }),
    [Symbol.dispose]() { compiler.dispose(); },
  };
}
