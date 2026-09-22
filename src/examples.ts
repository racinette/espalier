// `espalier examples`. docs/cli/examples/README.MD.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
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
  const lines = [
    "espalier examples [name] [--copy <directory>]",
    "espalier examples --help",
    "",
    "  --copy <directory>  copy a named example into a new directory",
    "  -h, --help          show usage and available examples",
    "",
  ];
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

export function examples(args: string[]): number {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        copy: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    }));
    if (positionals.length > 1) throw new Error("expected at most one example name");
    if (values.copy !== undefined && (values.copy === "" || positionals.length === 0)) {
      throw new Error("--copy requires an example name and a destination directory");
    }
  } catch (cause) {
    process.stderr.write(`espalier: ${(cause as Error).message}\n\n${catalog()}`);
    return 2;
  }

  if (values.help) {
    process.stdout.write(catalog());
    return 0;
  }

  const name = positionals[0];
  const root = examplesRoot();
  if (name === undefined) {
    process.stdout.write(`${root}\n`);
    return 0;
  }

  const listed = listExamples();
  if (!listed.includes(name)) {
    process.stderr.write(catalog(name));
    return 2;
  }

  const source = path.join(root, name);
  if (values.copy === undefined) {
    process.stdout.write(`${source}\n`);
    return 0;
  }

  const destination = path.resolve(values.copy);
  let created = false;
  try {
    mkdirSync(path.dirname(destination), { recursive: true });
    // Reserve the root exclusively: even an empty directory or dangling
    // symlink belongs to the caller and must not be merged into.
    mkdirSync(destination);
    created = true;
    cpSync(source, destination, {
      recursive: true,
      force: false,
      errorOnExist: true,
      verbatimSymlinks: true,
    });
  } catch (cause) {
    let cleanup = "";
    if (created) {
      try {
        rmSync(destination, { recursive: true, force: true });
      } catch (error) {
        cleanup = `; could not remove incomplete destination: ${(error as Error).message}`;
      }
    }
    process.stderr.write(`espalier: cannot copy example to ${destination}: ${(cause as Error).message}${cleanup}\n`);
    return 2;
  }

  process.stdout.write(`${destination}\n`);
  return 0;
}
