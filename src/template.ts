// File-creation template definitions. docs/TYPES.MD "`template`".

import type { CaptureValue } from "./match.js";

// A rule may import a project-local copy while a globally provisioned CLI runs
// another copy of the same pinned version. The registry keeps the brand stable
// across those two module instances.
const TEMPLATE = Symbol.for("espalier.template");

export interface StringTemplateOption {
  type: "string";
  description: string;
  required?: boolean;
  default?: string | string[];
  /** Documentation-only sample values used to render an invocation. */
  examples?: readonly string[];
  choices?: readonly string[];
  multiple?: boolean;
  metavar?: string;
}

export interface FlagTemplateOption {
  type: "flag";
  description: string;
  /** Include this flag in the rendered example invocation. */
  includeInExample?: true;
}

export type TemplateOption = StringTemplateOption | FlagTemplateOption;
export type TemplateSchema = Readonly<Record<string, TemplateOption>>;
export type TemplateResult = string | Promise<string>;

export interface TemplateContext<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
> {
  /** Concrete path relative to the repository that owns the rule. */
  path: string;
  /** Values bound by placeholders in the owning structural rule. */
  captures: Captures;
}

type StringTemplateValue<Option extends StringTemplateOption> = Option extends {
  choices: readonly (infer Choice extends string)[];
}
  ? Choice
  : string;

type TemplateValue<Option extends TemplateOption> = Option extends FlagTemplateOption
  ? boolean
  : Option extends StringTemplateOption
    ? Option["multiple"] extends true
      ? StringTemplateValue<Option>[]
      : StringTemplateValue<Option>
    : never;

type AlwaysPresent<Option extends TemplateOption> = Option extends FlagTemplateOption
  ? true
  : Option extends { multiple: true }
    ? true
    : Option extends { required: true }
      ? true
      : Option extends { default: string | string[] }
        ? true
        : false;

type RequiredTemplateKeys<Schema extends TemplateSchema> = {
  [Key in keyof Schema]: AlwaysPresent<Schema[Key]> extends true ? Key : never;
}[keyof Schema];

type OptionalTemplateKeys<Schema extends TemplateSchema> = Exclude<
  keyof Schema,
  RequiredTemplateKeys<Schema>
>;

export type TemplateArguments<Schema extends TemplateSchema> = {
  [Key in RequiredTemplateKeys<Schema>]: TemplateValue<Schema[Key]>;
} & {
  [Key in OptionalTemplateKeys<Schema>]?: TemplateValue<Schema[Key]>;
};

export interface TemplateDefinition<
  Schema extends TemplateSchema | null = TemplateSchema | null,
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
> {
  readonly schema: Schema;
  readonly render: Schema extends TemplateSchema
    ? (args: TemplateArguments<Schema>, context: TemplateContext<Captures>) => TemplateResult
    : (context: TemplateContext<Captures>) => TemplateResult;
}

/** Defines a template with no command-line arguments. */
export function createTemplate<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
>(render: (context: TemplateContext<Captures>) => TemplateResult): TemplateDefinition<null, Captures>;

/** Defines a template whose flat schema becomes command-line flags. */
export function createTemplate<
  const Schema extends TemplateSchema,
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
>(
  schema: Schema,
  render: (
    args: TemplateArguments<Schema>,
    context: TemplateContext<Captures>,
  ) => TemplateResult,
): TemplateDefinition<Schema, Captures>;

export function createTemplate(
  schemaOrRender: TemplateSchema | ((context: TemplateContext) => TemplateResult),
  render?: unknown,
): TemplateDefinition {
  if (typeof schemaOrRender === "function" && render === undefined) {
    return Object.freeze({
      [TEMPLATE]: true as const,
      schema: null,
      render: schemaOrRender,
    });
  }

  return Object.freeze({
    [TEMPLATE]: true as const,
    schema: schemaOrRender as TemplateSchema,
    render: render as (
      args: TemplateArguments<TemplateSchema>,
      context: TemplateContext,
    ) => TemplateResult,
  });
}

export function isTemplateDefinition(value: unknown): value is TemplateDefinition {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as Record<symbol, unknown>)[TEMPLATE] === true
  );
}

const OPTION_KEYS = new Set([
  "type",
  "description",
  "required",
  "default",
  "examples",
  "includeInExample",
  "choices",
  "multiple",
  "metavar",
]);

/** Returns the first schema defect, phrased for `module_invalid_export`. */
export function templateDefinitionProblem(value: unknown): string | null {
  if (!isTemplateDefinition(value)) return "must be created with `createTemplate`";
  if (typeof value.render !== "function") return "must have a render function";
  if (value.schema === null) return null;
  if (typeof value.schema !== "object" || Array.isArray(value.schema)) {
    return "schema must be an object";
  }

  for (const [name, raw] of Object.entries(value.schema)) {
    if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(name)) {
      return `schema key ${JSON.stringify(name)} must be a long flag name containing only letters, numbers, and hyphens`;
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return `schema option ${JSON.stringify(name)} must be an object`;
    }

    const option = raw as unknown as Record<string, unknown>;
    const unknown = Object.keys(option).find((key) => !OPTION_KEYS.has(key));
    if (unknown !== undefined) {
      return `schema option ${JSON.stringify(name)} has unknown key ${JSON.stringify(unknown)}`;
    }
    if (option["type"] !== "string" && option["type"] !== "flag") {
      return `schema option ${JSON.stringify(name)} type must be \`string\` or \`flag\``;
    }
    if (typeof option["description"] !== "string" || option["description"].trim() === "") {
      return `schema option ${JSON.stringify(name)} must have a non-empty description`;
    }

    if (option["type"] === "flag") {
      if (option["includeInExample"] !== undefined && option["includeInExample"] !== true) {
        return `flag schema option ${JSON.stringify(name)} includeInExample can only be true`;
      }
      for (const key of ["required", "default", "examples", "choices", "multiple", "metavar"] as const) {
        if (option[key] !== undefined) {
          return `flag schema option ${JSON.stringify(name)} cannot set \`${key}\``;
        }
      }
      continue;
    }

    if (option["required"] !== undefined && typeof option["required"] !== "boolean") {
      return `string schema option ${JSON.stringify(name)} required must be a boolean`;
    }
    if (option["multiple"] !== undefined && typeof option["multiple"] !== "boolean") {
      return `string schema option ${JSON.stringify(name)} multiple must be a boolean`;
    }
    if (option["includeInExample"] !== undefined) {
      return `string schema option ${JSON.stringify(name)} cannot set \`includeInExample\``;
    }
    if (
      option["metavar"] !== undefined &&
      (typeof option["metavar"] !== "string" || option["metavar"].trim() === "")
    ) {
      return `string schema option ${JSON.stringify(name)} metavar must be a non-empty string`;
    }
    if (
      option["choices"] !== undefined &&
      (!Array.isArray(option["choices"]) ||
        option["choices"].length === 0 ||
        option["choices"].some((choice) => typeof choice !== "string" || choice === ""))
    ) {
      return `string schema option ${JSON.stringify(name)} choices must be a non-empty array of non-empty strings`;
    }
    if (
      Array.isArray(option["choices"]) &&
      new Set(option["choices"]).size !== option["choices"].length
    ) {
      return `string schema option ${JSON.stringify(name)} choices must not contain duplicates`;
    }
    if (option["required"] === true && option["default"] !== undefined) {
      return `string schema option ${JSON.stringify(name)} cannot be required and have a default`;
    }

    const multiple = option["multiple"] === true;
    const fallback = option["default"];
    if (
      fallback !== undefined &&
      (multiple
        ? !Array.isArray(fallback) || fallback.some((entry) => typeof entry !== "string")
        : typeof fallback !== "string")
    ) {
      return `string schema option ${JSON.stringify(name)} default must be ${multiple ? "an array of strings" : "a string"}`;
    }
    if (Array.isArray(option["choices"]) && fallback !== undefined) {
      const choices = option["choices"] as unknown[];
      const defaults = Array.isArray(fallback) ? fallback : [fallback];
      if (defaults.some((entry) => !choices.includes(entry))) {
        return `string schema option ${JSON.stringify(name)} default must be one of its choices`;
      }
    }

    const examples = option["examples"];
    if (
      examples !== undefined &&
      (!Array.isArray(examples) ||
        examples.length === 0 ||
        examples.some((entry) => typeof entry !== "string" || entry === ""))
    ) {
      return `string schema option ${JSON.stringify(name)} examples must be a non-empty array of non-empty strings`;
    }
    if (Array.isArray(option["choices"]) && examples !== undefined) {
      const choices = option["choices"] as unknown[];
      if ((examples as unknown[]).some((entry) => !choices.includes(entry))) {
        return `string schema option ${JSON.stringify(name)} examples must be among its choices`;
      }
    }
  }

  return null;
}
