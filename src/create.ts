// `espalier create`. docs/cli/create/README.MD.

import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { OperationalError, fail } from "./errors.js";
import {
  isDirectoryOwnership,
  isOwnership,
  requiredDescendants,
  resolveDirectory,
  type DirectoryOwnership,
  type Ownership,
  type Recognition,
  type RequiredFile,
} from "./match.js";
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

function exampleOptions(
  schema: TemplateSchema,
  qualify: (name: string) => string = (name) => name,
): string[] {
  const words: string[] = [];

  for (const [name, option] of Object.entries(schema)) {
    const flag = `--${qualify(name)}`;
    if (option.type === "flag") {
      if (option.includeInExample === true) {
        words.push(flag);
      }
      continue;
    }

    let examples: readonly string[] = [];
    if (option.examples !== undefined) {
      examples = option.multiple === true ? option.examples : option.examples.slice(0, 1);
    } else if (option.required === true) {
      words.push(flag, `<${option.metavar ?? option.choices?.join("|") ?? "value"}>`);
      continue;
    }
    for (const example of examples) words.push(flag, commandValue(example));
  }

  return words;
}

function exampleInvocation(target: string, schema: TemplateSchema): string | null {
  const options = exampleOptions(schema);
  return options.length === 0
    ? null
    : ["espalier", "create", commandValue(target), ...options].join(" ");
}

function templateHelp(
  target: string,
  owner: string,
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
    `Creates ${target}.`,
    "",
    "Owned by:",
    `  ${owner} — ${description}`,
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

interface DirectoryFile extends RequiredFile {
  /** Concrete path relative to the directory being created. */
  relative: string;
  template: TemplateDefinition | null;
}

function directoryHelp(
  target: string,
  owner: string,
  description: string,
  files: DirectoryFile[],
): string {
  const schemas = files.filter(
    (file) =>
      file.template?.schema !== null && Object.keys(file.template?.schema ?? {}).length > 0,
  );
  const lines = [
    "Usage:",
    `  espalier create ${target} help`,
    schemas.length === 0
      ? `  espalier create ${target}`
      : `  espalier create ${target} [template options]`,
    "",
    `Creates ${target}/ and its required files.`,
    "",
    "Directory:",
    `  ${owner}/ — ${description}`,
    "",
    "Required files:",
  ];

  if (files.length === 0) {
    lines.push("  (none)");
  } else {
    for (const file of files) {
      const description = file.rule.module.description ?? "the required file";
      const implicit = file.template === null ? " (empty file; no template defined)" : "";
      lines.push(`  ${file.relative} — ${description}${implicit}`);
    }
  }

  const example = ["espalier", "create", commandValue(target)];
  for (const file of files) {
    if (file.template?.schema === null || file.template?.schema === undefined) continue;
    example.push(...exampleOptions(file.template.schema, (name) => `${file.relative}:${name}`));
  }
  if (example.length > 3) lines.push("", "Example:", `  ${example.join(" ")}`);

  if (schemas.length > 0) {
    lines.push("", "Template options:");
    for (const file of schemas) {
      const entries = Object.entries(file.template!.schema!);
      const labels = entries.map(([name, option]) =>
        optionLabel(`${file.relative}:${name}`, option),
      );
      const width = Math.max(...labels.map((label) => label.length)) + 2;
      lines.push("", `  ${file.relative}:`);
      for (const [[_name, option], label] of entries.map(
        (entry, index) => [entry, labels[index]!] as const,
      )) {
        lines.push(`    ${label.padEnd(width)}${option.description}${optionNotes(option)}`);
      }
    }
  } else {
    lines.push("", "No required file template has options.");
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

function directoryParserOptions(files: DirectoryFile[]): ParseArgsOptionsConfig {
  const options: ParseArgsOptionsConfig = {};
  for (const file of files) {
    for (const [name, option] of Object.entries(file.template?.schema ?? {})) {
      options[`${file.relative}:${name}`] =
        option.type === "flag"
          ? { type: "boolean" }
          : { type: "string", multiple: option.multiple === true };
    }
  }
  return options;
}

function stringArguments(
  schema: TemplateSchema,
  values: Record<string, unknown>,
  displayTarget: string,
  qualify: (name: string) => string = (name) => name,
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
          `missing required template option \`--${qualify(name)}\`; run \`espalier create ${displayTarget} help\` for usage`,
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
          `template option \`--${qualify(name)}\` must be one of ${option.choices.join(", ")}, got ${JSON.stringify(invalid)}`,
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
  qualify: (name: string) => string = (name) => name,
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
            stringArguments(template.schema, values, displayTarget, qualify),
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

function parseTemplateOptions(
  args: string[],
  options: ParseArgsOptionsConfig,
  displayTarget: string,
): Record<string, unknown> {
  try {
    return (parseArgs({ args, allowPositionals: false, strict: true, options }) as {
      values: Record<string, unknown>;
    }).values;
  } catch (cause) {
    fail(
      "invalid_template_arguments",
      `${(cause as Error).message}; run \`espalier create ${displayTarget} help\` for usage`,
    );
  }
}

async function createFile(
  absolute: string,
  target: string,
  displayTarget: string,
  owner: Ownership,
  args: string[],
  reporter: Reporter,
): Promise<number> {
  const template = owner.rule.module.template;

  if (args[0] === "help") {
    if (args.length > 1) {
      fail(
        "invalid_template_arguments",
        `\`espalier create ${displayTarget} help\` does not accept template options`,
      );
    }
    reporter.help(
      templateHelp(
        displayTarget,
        owner.rule.modulePath.replace(/\.mjs$/, ""),
        owner.rule.module.description ?? "the requested file",
        template?.schema ?? null,
        template === null,
      ),
    );
    return 0;
  }

  if (existsSync(absolute)) {
    fail("create_target_exists", `${target} already exists; create never overwrites`, {
      path: target,
    });
  }

  const values = parseTemplateOptions(args, parserOptions(template?.schema ?? null), displayTarget);
  const contents =
    template === null
      ? ""
      : await render(template, values, owner.rule.modulePath, displayTarget, {
          path: target,
          captures: { ...owner.captures },
        });
  try {
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, { encoding: "utf8", flag: "wx" });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST" && existsSync(absolute)) {
      fail("create_target_exists", `${target} already exists; create never overwrites`, {
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

function directoryFiles(directory: DirectoryOwnership, target: string): DirectoryFile[] {
  return requiredDescendants(directory.node, target, directory.captures).map((file) => ({
    ...file,
    relative: target === "" ? file.path : file.path.slice(target.length + 1),
    template: file.rule.module.template,
  }));
}

async function createDirectory(
  absolute: string,
  target: string,
  displayTarget: string,
  directory: DirectoryOwnership,
  description: string,
  args: string[],
  reporter: Reporter,
): Promise<number> {
  const files = directoryFiles(directory, target);
  const shownTarget = displayTarget.replace(/[\\/]+$/, "") || ".";

  if (args[0] === "help") {
    if (args.length > 1) {
      fail(
        "invalid_template_arguments",
        `\`espalier create ${shownTarget} help\` does not accept template options`,
      );
    }
    reporter.help(
      directoryHelp(
        shownTarget,
        directory.path === "" ? "." : directory.path,
        description,
        files,
      ),
    );
    return 0;
  }

  if (existsSync(absolute)) {
    fail("create_target_exists", `${target || "."} already exists; create never overwrites`, {
      path: target,
    });
  }

  const values = parseTemplateOptions(args, directoryParserOptions(files), shownTarget);
  const rendered: Array<{ file: DirectoryFile; contents: string }> = [];
  for (const file of files) {
    if (file.template === null) {
      rendered.push({ file, contents: "" });
      continue;
    }
    const local: Record<string, unknown> = {};
    for (const name of Object.keys(file.template.schema ?? {})) {
      const value = values[`${file.relative}:${name}`];
      if (value !== undefined) local[name] = value;
    }
    rendered.push({
      file,
      contents: await render(
        file.template,
        local,
        file.rule.modulePath,
        shownTarget,
        { path: file.path, captures: { ...file.captures } },
        (name) => `${file.relative}:${name}`,
      ),
    });
  }

  let created = false;
  try {
    const parent = path.dirname(absolute);
    mkdirSync(parent, { recursive: true });
    mkdirSync(absolute);
    created = true;
    for (const { file, contents } of rendered) {
      const output = path.join(absolute, ...file.relative.split("/"));
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, contents, { encoding: "utf8", flag: "wx" });
    }
  } catch (cause) {
    if (created) rmSync(absolute, { recursive: true, force: true });
    if (!created && existsSync(absolute)) {
      fail("create_target_exists", `${target || "."} already exists; create never overwrites`, {
        path: target,
      });
    }
    fail(
      "create_write_failed",
      `${target || "."} could not be written: ${(cause as Error).message}`,
      { path: target },
    );
  }

  if (files.length === 0) reporter.record({ kind: "written", path: `${target}/` });
  for (const file of files) reporter.record({ kind: "written", path: file.path });
  return 0;
}

/** Creates one absent structurally declared file or complete directory. */
export async function create(options: CreateOptions, reporter: Reporter): Promise<number> {
  const repository = await open(undefined, options.cwd);
  const { root } = repository.config;
  const absolute = path.resolve(options.cwd, options.target);
  const target = path.relative(root, absolute).split(path.sep).join("/");
  const displayTarget = options.displayTarget ?? options.target;

  if (target === ".." || target.startsWith("../") || path.isAbsolute(target)) {
    fail(
      "invalid_create_target",
      `${options.target} is outside the repository or does not name a file or directory`,
    );
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

  const fileAnswer = target === "" ? null : repository.resolve(target);
  const directoryAnswer = resolveDirectory(repository.espalier, target);
  const fileOwner = fileAnswer !== null && isOwnership(fileAnswer) ? fileAnswer : null;
  const directory = isDirectoryOwnership(directoryAnswer) ? directoryAnswer : null;
  const directorySpelling = /[\\/]$/.test(displayTarget);

  if (fileOwner !== null && (directory === null || !directorySpelling)) {
    const excluded = repository.ungoverned(target);
    if (excluded !== null) {
      fail("invalid_create_target", `${options.target} is excluded by ${excluded}`, {
        path: target,
        excludedBy: excluded,
      });
    }
    return await createFile(absolute, target, displayTarget, fileOwner, options.args, reporter);
  }

  if (directory !== null) {
    const excluded = repository.ungoverned(target, true);
    if (excluded !== null) {
      fail("invalid_create_target", `${options.target} is excluded by ${excluded}`, {
        path: target,
        excludedBy: excluded,
      });
    }
    const files = directoryFiles(directory, target);
    for (const file of files) {
      const fileExcluded = repository.ungoverned(file.path);
      if (fileExcluded !== null) {
        fail("invalid_create_target", `${file.path} is excluded by ${fileExcluded}`, {
          path: file.path,
          excludedBy: fileExcluded,
        });
      }
    }
    const description =
      repository.espalier.nodes.get(directory.path)?.description ??
      "a structurally declared directory";
    return await createDirectory(
      absolute,
      target,
      displayTarget,
      directory,
      description,
      options.args,
      reporter,
    );
  }

  const recognition = (
    !isDirectoryOwnership(directoryAnswer) ? directoryAnswer : fileAnswer
  ) as Recognition;
  fail("invalid_create_target", `${options.target} is not structurally declared`, {
    path: target,
    recognized: recognition.recognized,
    declared: recognition.declared,
  });
}
