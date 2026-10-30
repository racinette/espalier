// `espalier create`. docs/cli/create/README.MD.

import { groupDeclared, groupModulePath } from "./compile.js";
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
  requirements,
  type RequiredCollection,
  resolveDirectory,
  structuralChecks,
  type DirectoryOwnership,
  type Ownership,
  type Recognition,
  type RequiredFile,
} from "./match.js";
import { delegated } from "./nested.js";
import type { Reporter } from "./output.js";
import { open, type Repository } from "./repository.js";
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
  /** `help`, `preview` plus template arguments, or ordinary creation arguments. */
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
    : ["espalier", "create", commandValue(target), "--", ...options].join(" ");
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
    `  espalier create ${target} preview${schema === null ? "" : " -- [template options]"}`,
    schema === null
      ? `  espalier create ${target}`
      : `  espalier create ${target} -- [template options]`,
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
  collections: RequiredCollection[],
  optional: DirectoryFile[],
  selection: string[],
): string {
  const schemas = files.filter(
    (file) =>
      file.template?.schema !== null && Object.keys(file.template?.schema ?? {}).length > 0,
  );
  const lines = [
    "Usage:",
    `  espalier create ${target} help [--with <leaf> | --with-optional]`,
    `  espalier create ${target} preview [--with <leaf> | --with-optional]${schemas.length === 0 ? "" : " -- [template options]"}`,
    schemas.length === 0
      ? `  espalier create ${target} [--with <leaf> | --with-optional]`
      : `  espalier create ${target} [--with <leaf> | --with-optional] -- [template options]`,
    "",
    `Creates ${target}/ and its required and selected files.`,
    "",
    "Directory:",
    `  ${owner}/ — ${description}`,
    "",
    selection.length === 0 ? "Required files:" : "Included files (required and selected):",
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

  lines.push("", "Optional files (paths relative to this directory):");
  if (optional.length === 0) lines.push("  (none)");
  for (const file of optional) {
    lines.push(`  ${file.relative} — ${file.rule.module.description ?? "an optional file"}${file.template === null ? " (empty file; no template defined)" : ""}`);
  }
  lines.push("", "Directory options:",
    "  --with <leaf>     include an optional file; repeat for several",
    "  --with-optional   include all listed optional files",
    "Selecting a file inside an optional directory also includes that directory's required contents.");

  if (collections.length > 0) {
    lines.push("", "Required collections (choose a filename and create separately):");
    for (const collection of collections) {
      lines.push(`  ${collection.declared} — ${collection.rule.module.minMatches === 1 ? "one or more" : `at least ${collection.rule.module.minMatches}`} owned files`);
    }
  }

  const example = ["espalier", "create", commandValue(target), ...selection.map(commandValue), "--"];
  const exampleStart = example.length;
  for (const file of files) {
    if (file.template?.schema === null || file.template?.schema === undefined) continue;
    example.push(...exampleOptions(file.template.schema, (name) => `${file.relative}:${name}`));
  }
  if (example.length > exampleStart) lines.push("", "Example:", `  ${example.join(" ")}`);

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
    lines.push("", selection.length === 0 ? "No required file template has options." : "No included file template has options.");
  }
  lines.push(
    "",
    "Select optional files before --; template options follow --.",
    "Dynamic collections need concrete names and are created separately.",
    `Inspect their declarations with: espalier explain ${commandValue(`${target}/`)} --concise`,
    "Choose a concrete file path, then run: espalier create <file> help",
    "",
  );
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
  if (args.length > 0 && args[0] !== "--") {
    fail("invalid_template_arguments", `template arguments must follow --; run \`espalier create ${displayTarget} help\` for usage`);
  }
  try {
    return (parseArgs({ args: args.slice(1), allowPositionals: false, strict: true, options }) as {
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

  const preview = args[0] === "preview";
  const values = parseTemplateOptions(
    preview ? args.slice(1) : args,
    parserOptions(template?.schema ?? null),
    displayTarget,
  );
  const contents =
    template === null
      ? ""
      : await render(template, values, owner.rule.modulePath, displayTarget, {
          path: target,
          captures: templateCaptures(owner.rule, target, owner.captures),
        });
  if (preview) {
    reporter.preview({ target, files: [{ path: target, contents }] });
    return 0;
  }
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

function directoryFiles(files: RequiredFile[], target: string): DirectoryFile[] {
  return files.sort((a, b) => a.path.localeCompare(b.path)).map((file) => ({
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
  repository: Repository,
): Promise<number> {
  const shownTarget = displayTarget.replace(/[\\/]+$/, "") || ".";
  const action = args[0] === "help" || args[0] === "preview" ? args[0] : null;
  const remaining = action === null ? args : args.slice(1);
  const boundary = remaining.indexOf("--");
  const framework = boundary === -1 ? remaining : remaining.slice(0, boundary);
  const templateArgs = boundary === -1 ? [] : remaining.slice(boundary);
  let chosen: string[];
  let all: boolean;
  try {
    const { values } = parseArgs({ args: framework, allowPositionals: false, strict: true, options: {
      with: { type: "string", multiple: true }, "with-optional": { type: "boolean" },
    } });
    chosen = values.with ?? [];
    all = values["with-optional"] === true;
  } catch (cause) {
    fail("invalid_template_arguments", `${(cause as Error).message}; template arguments must follow --; run \`espalier create ${shownTarget} help\` for usage`);
  }
  if (action === "help" && templateArgs.length > 0) {
    fail("invalid_template_arguments", `\`espalier create ${shownTarget} help\` does not accept template options`);
  }
  const base = requirements(directory.node, target, directory.captures);
  const required = new Set(base.files.map(file => file.path));
  const candidates = directoryFiles(requirements(directory.node, target, directory.captures, new Set(), () => true, true).files, target);
  const optional = candidates.filter(file => !required.has(file.path));
  const selections = new Set(all ? optional.map(file => file.path) : []);
  for (const relative of chosen) {
    const file = optional.find(file => file.relative === relative);
    if (file === undefined) fail("invalid_template_arguments", `${JSON.stringify(relative)} is not a listed optional leaf under ${shownTarget}; run \`espalier create ${shownTarget} help\` for choices`);
    selections.add(file.path);
  }
  const included = requirements(directory.node, target, directory.captures, selections);
  const planned = new Map(included.files.map(file => [file.path, file]));
  for (const file of optional) if (selections.has(file.path)) planned.set(file.path, file);
  const files = directoryFiles([...planned.values()], target);
  for (const entry of [...files.map(file => ({ path: file.path, directory: false })), ...included.directories.map(path => ({ path, directory: true }))]) {
    const excluded = repository.ungoverned(entry.path, entry.directory);
    if (excluded !== null) fail("invalid_create_target", `${entry.path} is excluded by ${excluded}`, { path: entry.path, excludedBy: excluded });
  }
  const selection = [...(all ? ["--with-optional"] : []), ...chosen.flatMap(leaf => ["--with", leaf])];

  if (action === "help") {
    reporter.help(
      directoryHelp(
        shownTarget,
        directory.path === "" ? "." : directory.path,
        description,
        files,
        requirements(directory.node, "", directory.captures, new Set([...selections].map(file => target === "" ? file : file.slice(target.length + 1)))).collections,
        optional,
        selection,
      ),
    );
    return 0;
  }

  if (existsSync(absolute)) {
    fail("create_target_exists", `${target || "."} already exists; create never overwrites`, {
      path: target,
    });
  }

  const preview = action === "preview";
  const values = parseTemplateOptions(
    templateArgs,
    directoryParserOptions(files),
    shownTarget,
  );
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
        { path: file.path, captures: templateCaptures(file.rule, file.path, file.captures) },
        (name) => `${file.relative}:${name}`,
      ),
    });
  }

  if (preview) {
    reporter.preview({
      target: `${target}/`,
      files: rendered.map(({ file, contents }) => ({ path: file.path, contents })),
    });
    return 0;
  }

  let created = false;
  try {
    const parent = path.dirname(absolute);
    mkdirSync(parent, { recursive: true });
    mkdirSync(absolute);
    created = true;
    for (const directoryPath of included.directories) {
      mkdirSync(path.join(absolute, path.posix.relative(target, directoryPath)), { recursive: true });
    }
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

/** Creates or previews one absent structurally declared file or complete directory. */
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

  const refuseUndeclared = (contract: string, declare: string): never =>
    fail("invalid_create_target", `${options.target} matches the abstract contract \`${contract}\` and is not declared; declare it in \`${repository.config.espalierRoot}/${declare}\` first, or see \`espalier help instances\``, {
      path: target, contract, declare: `${repository.config.espalierRoot}/${declare}`,
    });

  if (fileOwner !== null && (directory === null || !directorySpelling)) {
    const blocking = fileOwner.undeclared?.[0];
    if (blocking !== undefined) refuseUndeclared(`${blocking.contract}/`, `${blocking.path}/ESPALIER.mjs`);
    if (fileOwner.rule.module.abstract) refuseUndeclared(fileOwner.rule.pattern, `${target}.mjs`);
    const chain = structuralChecks(fileOwner.rule, target, fileOwner.captures);
    for (const { rule, captures } of chain) {
      for (const grouping of rule.module.groups) {
        if (!grouping.abstract || groupDeclared(chain.map((check) => check.rule), grouping, captures, path.posix.dirname(target).replace(/^\.$/, ""))) continue;
        const declare = groupModulePath(rule, grouping, captures);
        fail("invalid_create_target", `${options.target} would be in the ${grouping.name} group \`${declare.slice(declare.lastIndexOf("/") + 1, -".mjs".length)}\`, which the abstract grouping in \`${rule.pattern}\` needs declared; declare it in \`${repository.config.espalierRoot}/${declare}\` first, or see \`espalier help instances\``, {
          path: target, contract: rule.pattern, group: grouping.name, declare: `${repository.config.espalierRoot}/${declare}`,
        });
      }
    }
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
    const blocking = directory.undeclared?.[0];
    if (blocking !== undefined) refuseUndeclared(`${blocking.contract}/`, `${blocking.path}/ESPALIER.mjs`);
    const excluded = repository.ungoverned(target, true);
    if (excluded !== null) {
      fail("invalid_create_target", `${options.target} is excluded by ${excluded}`, {
        path: target,
        excludedBy: excluded,
      });
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
      repository,
    );
  }

  const recognition = (
    !isDirectoryOwnership(directoryAnswer) ? directoryAnswer : fileAnswer
  ) as Recognition;
  fail("invalid_create_target", `${options.target} resolves to ${target || "."} in project ${root}, which is not structurally declared (paths are relative to the working directory)`, {
    path: target,
    recognized: recognition.recognized,
    declared: recognition.declared,
  });
}

function templateCaptures(rule: Ownership["rule"], target: string, captures: Ownership["captures"]): Ownership["captures"] {
  const source = rule.templateRule ?? rule;
  return structuralChecks(rule, target, captures).find((entry) => entry.rule.modulePath === source.modulePath)?.captures ?? captures;
}
