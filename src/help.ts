// `espalier help`. docs/cli/help/README.MD.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PACKAGE_ROOT, VERSION } from "./version.js";

export interface HelpPage {
  name: string;
  file: string;
  summary: string;
}

/**
 * Pages `espalier help` can print. Spec first, then one page per command.
 * Each `file` is relative to the package root and packed with this version.
 */
export const PAGES: HelpPage[] = [
  { name: "authoring", file: "docs/AUTHORING.MD", summary: "how to write a rule module" },
  { name: "types", file: "docs/TYPES.MD", summary: "what a rule module exports and receives" },
  { name: "matching", file: "docs/MATCHING.MD", summary: "how a path claims a file" },
  { name: "api", file: "docs/API.MD", summary: "using espalier as a library" },
  { name: "config", file: "docs/CONFIG.MD", summary: "the configuration file and the ignore list" },
  { name: "errors", file: "docs/ERRORS.MD", summary: "every operational failure and what it means" },
  { name: "adopt", file: "docs/cli/adopt/README.MD", summary: "infer a directory's shape and write stub rule modules" },
  { name: "build", file: "docs/cli/build/README.MD", summary: "generate the repository's agent-facing documentation" },
  { name: "create", file: "docs/cli/create/README.MD", summary: "create a structurally declared absent file or directory" },
  { name: "examples", file: "docs/cli/examples/README.MD", summary: "print the local path to a worked example" },
  { name: "explain", file: "docs/cli/explain/README.MD", summary: "what the espalier says about a path" },
  { name: "help", file: "docs/cli/help/README.MD", summary: "print this version's reference" },
  { name: "init", file: "docs/cli/init/README.MD", summary: "write the configuration and create the espalier root" },
  { name: "lint", file: "docs/cli/lint/README.MD", summary: "validate the repository against the espalier" },
  { name: "migrate", file: "docs/cli/migrate/README.MD", summary: "rewrite the configuration for this CLI version" },
];

const LOOKUP = new Map(PAGES.map((page) => [page.name, page]));

export function catalog(): string {
  const width = Math.max(...PAGES.map((page) => page.name.length));
  const lines = [
    "espalier help [page]",
    "",
    `  Reference for espalier ${VERSION}. These pages are this CLI version.`,
    "",
  ];
  for (const page of PAGES) {
    lines.push(`  ${page.name.padEnd(width)}  ${page.summary}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function help(page: string | undefined): number {
  if (page === undefined || page === "--help" || page === "-h") {
    process.stdout.write(catalog());
    return 0;
  }

  const found = LOOKUP.get(page);
  if (found === undefined) {
    process.stderr.write(`espalier: unknown help page "${page}"\n\n${catalog()}`);
    return 2;
  }

  const at = path.join(PACKAGE_ROOT, found.file);
  if (!existsSync(at)) {
    process.stderr.write(`espalier: ${found.file} is missing from this package\n`);
    return 2;
  }

  const text = readFileSync(at, "utf8");
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  return 0;
}
