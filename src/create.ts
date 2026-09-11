// `espalier create`. docs/cli/create/README.MD.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { OperationalError, fail } from "./errors.js";
import { isOwnership } from "./match.js";
import { delegated } from "./nested.js";
import type { Reporter } from "./output.js";
import { open } from "./repository.js";
import type {
  FlagTemplateOption,
  StringTemplateOption,
  TemplateDefinition,
  TemplateContext,
  TemplateOption,
  TemplateSchema,
} from "./template.js";

export interface CreateOptions {
  cwd: string;
  target: string;
  /** `help`, or the template arguments after the concrete target. */
  args: string[];
  /** Original spelling retained while a target delegates into a child. */
  displayTarget?: string;
}

function optionLabel(name: string, option: TemplateOption): string {
  if (option.type === "flag") return `--${name}`;
  const value = option.metavar ?? option.choices?.join("|") ?? "value";
  return `--${name} <${value}>`;
}

function optionNotes(option: TemplateOption): string {
  const notes: string[] = [];
  if (option.type === "string" && option.required === true) notes.push("required");
  if (option.type === "string" && option.multiple === true) notes.push("repeatable");
  if (option.type === "string" && option.default !== undefined) {
    const fallback = Array.isArray(option.default)
      ? option.default.join(", ")
      : String(option.default);
    notes.push(`default: ${fallback}`);
  }
  if (option.type === "string" && option.examples !== undefined) {
    notes.push(`examples: ${option.examples.join(", ")}`);
  }
  return notes.length === 0 ? "" : ` (${notes.join(", ")})`;
}

function commandValue(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : JSON.stringify(value);
}

function exampleInvocation(target: string, schema: TemplateSchema): string | null {
  const words = ["espalier", "create", commandValue(target)];
  let illustrative = false;

  for (const [name, option] of Object.entries(schema)) {
    if (option.type === "flag") {
      if (option.includeInExample === true) {
        words.push(`--${name}`);
        illustrative = true;
      }
      continue;
    }

    let examples: readonly string[] = [];
    if (option.examples !== undefined) {
      examples = option.multiple === true ? option.examples : option.examples.slice(0, 1);
      illustrative = true;
    } else if (option.required === true) {
      words.push(
        `--${name}`,
        `<${option.metavar ?? option.choices?.join("|") ?? "value"}>`,
      );
      illustrative = true;
      continue;
    }
    for (const example of examples) words.push(`--${name}`, commandValue(example));
  }

  return illustrative ? words.join(" ") : null;
}

function templateHelp(
  target: string,
  description: string,
  schema: TemplateSchema | null,
  implicit: boolean,
): string {
  const lines = [
    "Usage:",
    `  espalier create ${target} help`,
    schema === null
      ? `  espalier create ${target}`
      : `  espalier create ${target} [template options]`,
    "",
    `Creates ${description}`,
  ];
  const entries = schema === null ? [] : Object.entries(schema);
  const invocation = schema === null ? null : exampleInvocation(target, schema);
  if (invocation !== null) lines.push("", "Example:", `  ${invocation}`);
  if (entries.length > 0) {
    const labels = entries.map(([name, option]) => optionLabel(name, option));
    const width = Math.max(...labels.map((label) => label.length)) + 2;
    lines.push("", "Template options:");
    for (const [[_name, option], label] of entries.map((entry, index) => [entry, labels[index]!] as const)) {
      lines.push(`  ${label.padEnd(width)}${option.description}${optionNotes(option)}`);
    }
  } else {
    lines.push(
      "",
      implicit
        ? "No template is defined; create writes an empty file."
        : "This template has no options.",
    );
  }
  lines.push("");
  return lines.join("\n");
}

function parserOptions(schema: TemplateSchema | null): ParseArgsOptionsConfig {
  const options: ParseArgsOptionsConfig = {};
  for (const [name, option] of Object.entries(schema ?? {})) {
    options[name] =
      option.type === "flag"
        ? { type: "boolean" }
        : { type: "string", multiple: option.multiple === true };
  }
  return options;
}

function stringArguments(
  schema: TemplateSchema,
  values: Record<string, unknown>,
  displayTarget: string,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(schema)) {
    if (raw.type === "flag") {
      const option = raw as FlagTemplateOption;
      args[name] = values[name] ?? false;
      continue;
    }

    const option = raw as StringTemplateOption;
    let value = values[name];
    if (value === undefined) {
      if (option.default !== undefined) {
        value = Array.isArray(option.default) ? [...option.default] : option.default;
      } else if (option.required === true) {
        fail(
          "invalid_template_arguments",
          `missing required template option \`--${name}\`; run \`espalier create ${displayTarget} help\` for usage`,
        );
      } else if (option.multiple === true) {
        value = [];
      }
    }

    if (option.choices !== undefined && value !== undefined) {
      const supplied = Array.isArray(value) ? value : [value];
      const invalid = supplied.find((entry) => !option.choices!.includes(entry as string));
      if (invalid !== undefined) {
        fail(
          "invalid_template_arguments",
          `template option \`--${name}\` must be one of ${option.choices.join(", ")}, got ${JSON.stringify(invalid)}`,
        );
      }
    }
    if (value !== undefined) args[name] = value;
  }
  return args;
}

async function render(
  template: TemplateDefinition,
  values: Record<string, unknown>,
  modulePath: string,
  displayTarget: string,
  context: TemplateContext,
): Promise<string> {
  let result: unknown;
  try {
    result =
      template.schema === null
        ? await (template.render as (context: TemplateContext) => unknown)(context)
        : await (template.render as (
            args: Record<string, unknown>,
            context: TemplateContext,
          ) => unknown)(
            stringArguments(template.schema, values, displayTarget),
            context,
          );
  } catch (cause) {
    if (cause instanceof OperationalError) throw cause;
    fail("template_threw", `${modulePath}: template threw: ${(cause as Error).message}`);
  }
  if (typeof result !== "string") {
    fail("template_invalid_result", `${modulePath}: template must return a string`);
  }
  return result;
}

/** Creates one absent, structurally owned file from its owner's template. */
export async function create(options: CreateOptions, reporter: Reporter): Promise<number> {
  const repository = await open(undefined, options.cwd);
  const { root } = repository.config;
  const absolute = path.resolve(options.cwd, options.target);
  const target = path.relative(root, absolute).split(path.sep).join("/");
  const displayTarget = options.displayTarget ?? options.target;

  if (target === "" || target === ".." || target.startsWith("../") || path.isAbsolute(target)) {
    fail("invalid_create_target", `${options.target} is outside the repository or does not name a file`);
  }

  const child = repository.children.find((at) => target === at || target.startsWith(`${at}/`));
  if (child !== undefined) {
    return await create(
      {
        ...options,
        cwd: path.join(root, child),
        target: absolute,
        displayTarget,
      },
      delegated(reporter, child),
    );
  }

  const excluded = repository.ungoverned(target);
  if (excluded !== null) {
    fail("invalid_create_target", `${options.target} is excluded by ${excluded}`, {
      path: target,
      excludedBy: excluded,
    });
  }

  const owner = repository.resolve(target);
  if (!isOwnership(owner)) {
    fail("invalid_create_target", `${options.target} is not declared by a structural rule`, {
      path: target,
      recognized: owner.recognized,
      declared: owner.declared,
    });
  }
  const template = owner.rule.module.template;

  if (options.args[0] === "help") {
    if (options.args.length > 1) {
      fail(
        "invalid_template_arguments",
        `\`espalier create ${displayTarget} help\` does not accept template options`,
      );
    }
    reporter.help(
      templateHelp(
        displayTarget,
        owner.rule.module.description ?? "the requested file",
        template?.schema ?? null,
        template === null,
      ),
    );
    return 0;
  }

  let parsed: { values: Record<string, unknown> };
  try {
    parsed = parseArgs({
      args: options.args,
      allowPositionals: false,
      strict: true,
      options: parserOptions(template?.schema ?? null),
    }) as { values: Record<string, unknown> };
  } catch (cause) {
    fail(
      "invalid_template_arguments",
      `${(cause as Error).message}; run \`espalier create ${displayTarget} help\` for usage`,
    );
  }

  if (existsSync(absolute)) {
    fail("create_target_exists", `${target} already exists; create never overwrites a file`, {
      path: target,
    });
  }

  const contents =
    template === null
      ? ""
      : await render(template, parsed.values, owner.rule.modulePath, displayTarget, {
          path: target,
          captures: { ...owner.captures },
        });
  try {
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, { encoding: "utf8", flag: "wx" });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST" && existsSync(absolute)) {
      fail("create_target_exists", `${target} already exists; create never overwrites a file`, {
        path: target,
      });
    }
    fail("create_write_failed", `${target} could not be written: ${(cause as Error).message}`, {
      path: target,
    });
  }

  reporter.record({ kind: "written", path: target });
  return 0;
}
