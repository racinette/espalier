// `espalier examples`. docs/cli/examples/README.MD.

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PACKAGE_ROOT } from "./version.js";

export function examplesRoot(): string {
  return path.join(PACKAGE_ROOT, "examples");
}

export function listExamples(): string[] {
  const root = examplesRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => {
      try {
        return statSync(path.join(root, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

function catalog(unknown?: string): string {
  const listed = listExamples();
  const lines = ["espalier examples [name]", ""];
  if (unknown !== undefined) {
    lines.unshift(`espalier: unknown example "${unknown}"`, "");
  }
  lines.push(`  ${examplesRoot()}`, "");
  if (listed.length > 0) {
    for (const name of listed) lines.push(`  ${name}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function examples(name: string | undefined): number {
  const root = examplesRoot();
  if (name === undefined || name === "--help" || name === "-h") {
    process.stdout.write(`${root}\n`);
    return 0;
  }

  const listed = listExamples();
  if (!listed.includes(name)) {
    process.stderr.write(catalog(name));
    return 2;
  }

  process.stdout.write(`${path.join(root, name)}\n`);
  return 0;
}
