#!/usr/bin/env node

import { parseArgs } from "node:util";
import { build } from "./build.js";
import { OperationalError } from "./errors.js";
import { explain } from "./explain.js";
import { lint } from "./lint.js";
import { createReporter, type Format, type Mode } from "./output.js";

const USAGE = `espalier <command> [options]

  build                 generate the repository's agent-facing documentation
  lint [paths...]       validate the repository against the espalier
  explain <path>        what the espalier says about a path

  --format human|jsonl  output format (default: human)
  --out <dest>          stdout, stderr, or a file path (default: stdout)
  --config <path>       use this config file instead of discovering one

  build only:
  --check               compare against what is on disk and write nothing
  --inline              write one document at the root

  lint only:
  --rule <module>       run one rule module only
  --staged              lint git-staged files only
  --no-rule-text        omit rule bodies from output
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return command === undefined ? 2 : 0;
  }

  if (command !== "lint" && command !== "explain" && command !== "build") {
    process.stderr.write(`espalier: unknown command "${command}"\n\n${USAGE}`);
    return 2;
  }

  let values: Record<string, unknown>;
  let positionals: string[];

  try {
    ({ values, positionals } = parseArgs({
      args: argv.slice(1),
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: "string" },
        out: { type: "string" },
        config: { type: "string" },
        check: { type: "boolean" },
        inline: { type: "boolean" },
        rule: { type: "string" },
        staged: { type: "boolean" },
        "no-rule-text": { type: "boolean" },
      },
    }) as { values: Record<string, unknown>; positionals: string[] });
  } catch (cause) {
    process.stderr.write(`espalier: ${(cause as Error).message}\n\n${USAGE}`);
    return 2;
  }

  const format = (values["format"] ?? "human") as Format;
  if (format !== "human" && format !== "jsonl") {
    process.stderr.write(`espalier: unknown format "${String(values["format"])}"\n`);
    return 2;
  }

  const out = (values["out"] ?? "stdout") as string;
  const cwd = process.cwd();
  const reporter = createReporter(format, out, cwd, command as Mode);

  try {
    if (command === "build") {
      return await build(
        {
          cwd,
          config: values["config"] as string | undefined,
          check: values["check"] === true,
          inline: values["inline"] === true,
        },
        reporter,
      );
    }

    if (command === "explain") {
      const target = positionals[0];
      if (target === undefined) {
        reporter.failure("missing_argument", "explain needs a path");
        return 2;
      }
      return await explain({ cwd, config: values["config"] as string | undefined, target }, reporter);
    }

    return await lint(
      {
        cwd,
        config: values["config"] as string | undefined,
        paths: positionals,
        rule: values["rule"] as string | undefined,
        staged: values["staged"] === true,
        ruleText: values["no-rule-text"] !== true,
      },
      reporter,
    );
  } catch (cause) {
    if (cause instanceof OperationalError) {
      reporter.failure(cause.code, cause.message, cause.detail);
    } else {
      reporter.failure("internal_error", (cause as Error).stack ?? String(cause));
    }
    return 2;
  } finally {
    reporter.finish();
  }
}

process.exit(await main());
