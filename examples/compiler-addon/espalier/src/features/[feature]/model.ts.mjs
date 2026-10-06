import { createTemplate } from "espalier";
import { snapshotFor } from "../../../../analysis/snapshot.mjs";

export const description = "a feature's cohesive model operations";
export const rule = `Exports createModel and updateModel from model.ts.
Related model operations belong together in this module.`;
export const template = createTemplate(() =>
  "export function createModel() { return 0; }\n" +
  "export function updateModel(value: number) { return value + 1; }\n");

export async function lint(context) {
  const facts = context.addons.compiler.analyze(await snapshotFor(context));
  const names = facts.exportsOf(context.path);
  for (const required of ["createModel", "updateModel"]) {
    if (!names.includes(required)) context.emit({
      code: "missing_model_operation",
      message: `Export ${required} from the feature's model.ts.`,
    });
  }
}
