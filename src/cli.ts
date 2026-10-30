#!/usr/bin/env node

// Argument parsing and dispatch. Every command's own page is under docs/cli/,
// and the flags below are the same list each of those pages carries. `help`
// and `examples` read this package and do not load a repository.

import { parseArgs } from "node:util";
import { adopt } from "./adopt.js";
import { build } from "./build.js";
import { create } from "./create.js";
import { examples } from "./examples.js";
import { OperationalError } from "./errors.js";
import { explain } from "./explain.js";
import { guard } from "./guard.js";
import { help } from "./help.js";
import { init } from "./init.js";
import { lint } from "./lint.js";
import { migrate } from "./migrate.js";
import { unguard } from "./unguard.js";
import { createReporter, type Format, type Mode } from "./output.js";
import { VERSION } from "./version.js";

const USAGE = `espalier <command> [options]

  init                  write the configuration and create the espalier root
  migrate               rewrite the configuration for this CLI version
  build                 generate the repository's agent-facing documentation
  adopt <path>          infer a directory's shape and write stub rule modules
  create <path>         create a structurally declared absent file or directory
  create <path> help    show creation options and required files
  create <path> preview render source without writing target files
  lint [paths...]       validate the repository against the espalier
  explain <path>        what the espalier says about a path
  guard                 close parts of the repository for one piece of work
  unguard               take back the guard in place
  help [page]           print this version's reference
  examples [name]       locate a worked example; --copy <dir> copies it

  top-level options:
  -h, --help            print this short synopsis
  --version             print the installed package version

  options shared by every command except create, help, and examples:
  --format human|jsonl  output format (default: human)
  --out <dest>          stdout, stderr, or a file path (default: stdout)
  --config <path>       use this config file instead of discovering one

  init only:
  --root <dir>          espalier source directory (default: espalier)
  -l, --lang <name>     write a shipped ignore list; repeat for a polyglot repo
  -i, --ignore-file     a file holding ignore patterns (default: .gitignore)
  --no-ignore-file      write ignoreFiles: [] rather than naming a file
  --no-common-ignore    write no common ignore entries either
  --ignore-all          put every top-level path out of scope

  migrate only:
  --dry-run             print what would be written, write nothing

  build only:
  --check               compare against what is on disk and write nothing
  --force               overwrite an unmarked planned documentation file

  adopt only:
  --dry-run             print what would be written, write nothing
  --force               migrate conflicting generated-output files into ESPALIER.mjs

  lint only:
  --rule <module>       run one rule module only
  --no-guidance         omit guidance bodies from output
  --jobs <n|auto>       maximum workers (default: lint.jobs, otherwise auto)
  --base <rev>          check locks, frozen files and seals against a git revision

  explain only:
  --concise             show a human summary without authored prose

  guard only:
  --close <target>      lock, freeze and seal it; repeat for more
  --freeze <target>     existing files keep their content
  --seal <target>       no file joins or leaves
  --lock <target>       its espalier modules need authorization
  --open <dir>          inside what is closed: edit, add and remove files
  --edit <target>       inside what is closed: edit existing files
  --add <dir>           inside what is closed: add and remove files
  --no-build            do not rebuild the generated documentation
  --dry-run             print what would be written, write nothing

  unguard only:
  --no-build            do not rebuild the generated documentation
  --dry-run             print what would be written, write nothing
`;

async function runCreate(argv: string[]): Promise<number> {
  const reporter = createReporter("human", "stdout", process.cwd(), "create");
  try {
    const target = argv[0];
    if (target === undefined || target.startsWith("-")) {
      reporter.failure("missing_argument", "create needs a file or directory path");
      return 2;
    }
    return await create({
      cwd: process.cwd(),
      target,
      args: argv.slice(1),
    }, reporter);
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

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return command === undefined ? 2 : 0;
  }
  if (command === "--version") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const COMMANDS = new Set([
    "lint",
    "explain",
    "build",
    "guard",
    "unguard",
    "init",
    "migrate",
    "adopt",
    "create",
    "help",
    "examples",
  ]);
  if (!COMMANDS.has(command)) {
    process.stderr.write(`espalier: unknown command "${command}"\n\n${USAGE}`);
    return 2;
  }

  if (command === "help") return help(argv[1]);
  if (command === "examples") return examples(argv.slice(1));
  if (command === "create") return await runCreate(argv.slice(1));

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
        force: { type: "boolean" },
        root: { type: "string" },
        "ignore-all": { type: "boolean" },
        lang: { type: "string", short: "l", multiple: true },
        "ignore-file": { type: "string", short: "i", multiple: true },
        "no-ignore-file": { type: "boolean" },
        "no-common-ignore": { type: "boolean" },
        "dry-run": { type: "boolean" },
        rule: { type: "string" },
        "no-guidance": { type: "boolean" },
        ...(command === "lint" ? { jobs: { type: "string" as const }, base: { type: "string" as const } } : {}),
        ...(command === "explain" ? { concise: { type: "boolean" as const } } : {}),
        ...(command === "guard" ? Object.fromEntries(["close", "freeze", "seal", "lock", "open", "edit", "add"]
          .map((flag) => [flag, { type: "string" as const, multiple: true as const }])) : {}),
        ...(command === "guard" || command === "unguard" ? { "no-build": { type: "boolean" as const } } : {}),
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
  const reporter = createReporter(format, out, cwd, command as Mode, {
    concise: values["concise"] === true,
  });

  try {
    if (command === "init") {
      return init(
        {
          cwd,
          config: values["config"] as string | undefined,
          root: values["root"] as string | undefined,
          languages: (values["lang"] as string[] | undefined) ?? [],
          ignoreFiles: values["ignore-file"] as string[] | undefined,
          noIgnoreFile: values["no-ignore-file"] === true,
          noCommonIgnore: values["no-common-ignore"] === true,
          ignoreAll: values["ignore-all"] === true,
        },
        reporter,
      );
    }

    if (command === "migrate") {
      if (values["dry-run"] === true) {
        reporter.warning("Dry run: no migration files will be changed.");
      }
      return await migrate(
        {
          cwd,
          config: values["config"] as string | undefined,
          dryRun: values["dry-run"] === true,
        },
        reporter,
      );
    }

    if (command === "adopt") {
      const found = positionals[0];
      if (found === undefined) {
        reporter.failure("missing_argument", "adopt needs a directory");
        return 2;
      }
      return await adopt(
        {
          cwd,
          config: values["config"] as string | undefined,
          target: found,
          dryRun: values["dry-run"] === true,
          force: values["force"] === true,
        },
        reporter,
      );
    }

    if (command === "build") {
      return await build(
        {
          cwd,
          config: values["config"] as string | undefined,
          check: values["check"] === true,
          force: values["force"] === true,
        },
        reporter,
      );
    }

    if (command === "guard" || command === "unguard") {
      if (positionals.length > 0) {
        reporter.failure("unexpected_argument", `${command} takes no paths; name each one with a flag such as --close or --open`);
        return 2;
      }
      if (values["dry-run"] === true) reporter.warning("Dry run: no files will be changed.");
      const common = {
        cwd,
        config: values["config"] as string | undefined,
        dryRun: values["dry-run"] === true,
        build: values["no-build"] !== true,
      };
      if (command === "unguard") return await unguard(common, reporter);
      const list = (flag: string): string[] => (values[flag] as string[] | undefined) ?? [];
      return await guard({
        ...common,
        close: list("close"), freeze: list("freeze"), seal: list("seal"), lock: list("lock"),
        open: list("open"), edit: list("edit"), add: list("add"),
      }, reporter);
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
        guidance: values["no-guidance"] !== true,
        jobs: values["jobs"] === undefined ? undefined : values["jobs"] === "auto" ? "auto"
          : /^\d+$/.test(String(values["jobs"])) ? Number(values["jobs"]) : NaN,
        ...(values["base"] === undefined ? {} : { base: values["base"] as string }),
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
