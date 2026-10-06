import { fileURLToPath } from "node:url";
import { createCompilerService } from "./compiler.mjs";

// Compiler support is read by TypeScript, outside Node's module loader.
// Sources and compiler.json remain governed lint inputs, never support files.
export const unobservedImplementationDependencies = [
  "node_modules/typescript/lib/**/*.d.ts",
  "node_modules/**/package.json",
  "node_modules/**/*.d.ts",
];

export function setup() {
  const compiler = createCompilerService(fileURLToPath(new URL("../", import.meta.url)));
  return {
    compiler,
    [Symbol.dispose]() { compiler.dispose(); },
  };
}
