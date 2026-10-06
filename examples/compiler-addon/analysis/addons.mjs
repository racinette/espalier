import { fileURLToPath } from "node:url";
import { createCompilerService } from "./compiler.mjs";
import { diagnosticIssue } from "./diagnostic.mjs";

// Compiler support is read by TypeScript, outside Node's module loader.
// Sources and compiler.json remain governed lint inputs, never support files.
export const unobservedImplementationDependencies = [
  "node_modules/typescript/lib/**/*.d.ts",
  "node_modules/**/package.json",
  "node_modules/**/*.d.ts",
  // Recursive wildcards skip symlinked packages. Name linked packages
  // explicitly; example-types is the tiny dependency used by the cache tests.
  "node_modules/example-types/**/*.d.ts",
  "node_modules/example-types/package.json",
];

export function setup() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const compiler = createCompilerService(root);
  return {
    compiler,
    diagnosticIssue: (diagnostic, location) => diagnosticIssue(diagnostic, { ...location, root }),
    [Symbol.dispose]() { compiler.dispose(); },
  };
}
