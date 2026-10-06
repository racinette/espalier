import { snapshotFor } from "../../../analysis/snapshot.mjs";

export const rule = `Governed TypeScript source must have no compiler errors
under compiler.json's settings.`;
export async function lint(context) {
  const facts = context.addons.compiler.analyze(await snapshotFor(context));
  for (const diagnostic of facts.diagnosticsFor(context.path)) {
    // This check requests diagnostics for the current source. A complete
    // origin-aware adapter is supplied in the diagnostic recipe.
    context.emit({
      code: `typescript_${diagnostic.code}`,
      message: diagnostic.message,
      line: diagnostic.line,
      column: diagnostic.column,
    });
  }
}
