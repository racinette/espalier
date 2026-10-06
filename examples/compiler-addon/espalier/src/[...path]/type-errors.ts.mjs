import { snapshotFor } from "../../../analysis/snapshot.mjs";

export const rule = `Governed TypeScript source must have no compiler errors
under compiler.json's settings.`;
export async function lint(context) {
  const snapshot = await snapshotFor(context);
  const facts = context.addons.compiler.analyze(snapshot);
  for (const diagnostic of facts.diagnosticsFor(context.path)) {
    context.emit(context.addons.diagnosticIssue(diagnostic, {
      checkedPath: context.path,
      governedPaths: snapshot.sources.map(([file]) => file),
    }));
  }
}
