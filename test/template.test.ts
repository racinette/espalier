// Template definition and the create command's write boundary. These are unit
// tests rather than fixtures because the observable is a newly written source
// file, path-specific creation help, or the deliberate absence of a write.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createTemplate, type TemplateContext } from "../src/api.js";
import { templateDefinitionProblem } from "../src/template.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(packageRoot, "dist", "src", "cli.js");
const api = pathToFileURL(path.join(packageRoot, "dist", "src", "api.js")).href;

function run(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

function write(root: string, relative: string, contents: string): void {
  const at = path.join(root, relative);
  mkdirSync(path.dirname(at), { recursive: true });
  writeFileSync(at, contents, "utf8");
}

function repository(rule: string, modulePath = "src/[name].ts.mjs"): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-template-"));
  write(root, "espalier.config.yaml", "version: 1\npin: 0.3.0\nroot: espalier\n");
  write(root, `espalier/${modulePath}`, rule);
  return root;
}

function scratch(
  rule: string,
  body: (root: string) => void,
  modulePath?: string,
): void {
  const root = repository(rule, modulePath);
  try {
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const SCHEMA_TEMPLATE = `import { createTemplate } from ${JSON.stringify(api)};
export const description = "a generated source module";
export const rule = \`Keep it generated.\`;
export async function lint() {}
export const template = createTemplate({
  varname: {
    type: "string",
    required: true,
    metavar: "identifier",
    description: "Variable name to declare",
    examples: ["answer", "result"],
  },
  "with-export": {
    type: "flag",
    description: "Export the declaration",
    includeInExample: true,
  },
  camelCase: {
    type: "flag",
    description: "Preserve a camel-case flag",
  },
  declaration: {
    type: "string",
    choices: ["const", "let"],
    default: "const",
    description: "Declaration kind",
    examples: ["let", "const"],
  },
  tag: {
    type: "string",
    multiple: true,
    description: "Attach a tag; repeat for several",
    examples: ["public", "stable"],
  },
  label: {
    type: "string",
    description: "Human-readable label",
    examples: ["public API", "internal API"],
  },
}, async (args) => JSON.stringify(args) + "\\n");
`;

test("createTemplate infers required, optional, repeated, flag, and choice arguments", () => {
  createTemplate(
    {
      required: { type: "string", required: true, description: "Required" },
      optional: { type: "string", description: "Optional" },
      repeated: { type: "string", multiple: true, description: "Repeated" },
      enabled: { type: "flag", description: "Enabled", includeInExample: true },
      choice: {
        type: "string",
        choices: ["one", "two"],
        default: "one",
        description: "Choice",
      },
    },
    ({ required, optional, repeated, enabled, choice }) => {
      const requiredString: string = required;
      const optionalString: string | undefined = optional;
      const repeatedStrings: string[] = repeated;
      const enabledBoolean: boolean = enabled;
      const narrowedChoice: "one" | "two" = choice;
      return JSON.stringify({
        requiredString,
        optionalString,
        repeatedStrings,
        enabledBoolean,
        narrowedChoice,
      });
    },
  );

  createTemplate(
    { style: { type: "string", description: "Style" } },
    (_args, { path, captures }: TemplateContext<{ name: string }>) => {
      const concretePath: string = path;
      const capturedName: string = captures.name;
      return concretePath + capturedName;
    },
  );
});

test("template schema validation rejects every contradictory descriptor shape", () => {
  const factory = createTemplate as unknown as (...args: unknown[]) => unknown;
  const option = (overrides: Record<string, unknown> = {}) => ({
    type: "string",
    description: "A value",
    ...overrides,
  });
  const cases: Array<[unknown, RegExp]> = [
    [factory([], () => ""), /schema must be an object/],
    [factory({ "not_a_flag": option() }, () => ""), /long flag name/],
    [factory({ value: "string" }, () => ""), /must be an object/],
    [factory({ value: option({ typo: true }) }, () => ""), /unknown key/],
    [factory({ value: option({ type: "integer" }) }, () => ""), /type must be/],
    [factory({ value: option({ description: "" }) }, () => ""), /non-empty description/],
    [
      factory({ value: { type: "boolean", description: "A switch" } }, () => ""),
      /type must be `string` or `flag`/,
    ],
    [
      factory({ value: { type: "flag", description: "A switch", default: false } }, () => ""),
      /cannot set `default`/,
    ],
    [
      factory({ value: { type: "flag", description: "A switch", required: true } }, () => ""),
      /cannot set `required`/,
    ],
    [
      factory(
        { value: { type: "flag", description: "A switch", includeInExample: false } },
        () => "",
      ),
      /only be true/,
    ],
    [
      factory({ value: { type: "flag", description: "A switch", examples: ["yes"] } }, () => ""),
      /cannot set `examples`/,
    ],
    [factory({ value: option({ required: "yes" }) }, () => ""), /required must be a boolean/],
    [factory({ value: option({ multiple: "yes" }) }, () => ""), /multiple must be a boolean/],
    [factory({ value: option({ metavar: "" }) }, () => ""), /metavar must be a non-empty/],
    [factory({ value: option({ choices: [] }) }, () => ""), /choices must be a non-empty/],
    [factory({ value: option({ choices: ["a", "a"] }) }, () => ""), /must not contain duplicates/],
    [
      factory({ value: option({ required: true, default: "a" }) }, () => ""),
      /cannot be required and have a default/,
    ],
    [factory({ value: option({ default: [] }) }, () => ""), /default must be a string/],
    [
      factory({ value: option({ multiple: true, default: "a" }) }, () => ""),
      /default must be an array of strings/,
    ],
    [
      factory({ value: option({ choices: ["a"], default: "b" }) }, () => ""),
      /default must be one of its choices/,
    ],
    [
      factory({ value: option({ examples: "a" }) }, () => ""),
      /examples must be a non-empty array/,
    ],
    [
      factory({ value: option({ examples: [] }) }, () => ""),
      /examples must be a non-empty array/,
    ],
    [
      factory({ value: option({ examples: [""] }) }, () => ""),
      /examples must be a non-empty array/,
    ],
    [
      factory({ value: option({ includeInExample: true }) }, () => ""),
      /cannot set `includeInExample`/,
    ],
    [
      factory({ value: option({ choices: ["a"], examples: ["b"] }) }, () => ""),
      /examples must be among its choices/,
    ],
    [factory({ value: option() }, 42), /must have a render function/],
  ];

  for (const [definition, expected] of cases) {
    assert.match(templateDefinitionProblem(definition) ?? "", expected);
  }
});

test("create maps literal schema keys, defaults, and repeated values into the renderer", () => {
  scratch(SCHEMA_TEMPLATE, (root) => {
    const result = run(root, [
      "create",
      "src/answer.ts",
      "--varname",
      "answer",
      "--with-export",
      "--tag",
      "public",
      "--tag",
      "stable",
    ]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^written\s+src\/answer\.ts\n\n1 written\n$/);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, "src", "answer.ts"), "utf8")), {
      varname: "answer",
      "with-export": true,
      camelCase: false,
      declaration: "const",
      tag: ["public", "stable"],
    });
  });
});

test("a concrete dynamic path selects its structural owner's template", () => {
  scratch(SCHEMA_TEMPLATE, (root) => {
    const result = run(root, [
      "create",
      "src/deeply-named.ts",
      "--varname",
      "inside",
      "--declaration",
      "let",
    ]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(
      JSON.parse(readFileSync(path.join(root, "src", "deeply-named.ts"), "utf8")).declaration,
      "let",
    );
  });
});

test("creation help preserves authored flag spelling and writes nothing", () => {
  scratch(SCHEMA_TEMPLATE, (root) => {
    const result = run(root, ["create", "src/answer.ts", "help"]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^Usage:\n  espalier create src\/answer\.ts help/);
    assert.match(result.stdout, /espalier create src\/answer\.ts \[template options\]/);
    assert.match(
      result.stdout,
      /Example:\n  espalier create src\/answer\.ts --varname answer --with-export --declaration let --tag public --tag stable --label "public API"/,
    );
    assert.match(result.stdout, /--varname <identifier>\s+Variable name to declare \(required, examples: answer, result\)/);
    assert.match(result.stdout, /--with-export\s+Export the declaration$/m);
    assert.match(result.stdout, /--camelCase\s+Preserve a camel-case flag$/m);
    assert.match(result.stdout, /--declaration <const\|let>\s+Declaration kind \(default: const, examples: let, const\)/);
    assert.match(
      result.stdout,
      /--tag <value>\s+Attach a tag; repeat for several \(repeatable, examples: public, stable\)/,
    );
    assert.match(result.stdout, /--label <value>\s+Human-readable label \(examples: public API, internal API\)/);
    assert.doesNotMatch(result.stdout, /default: false/);
    assert.equal(existsSync(path.join(root, "src", "answer.ts")), false);
  });
});

test("the help action refuses trailing template options", () => {
  scratch(SCHEMA_TEMPLATE, (root) => {
    const result = run(root, ["create", "src/answer.ts", "help", "--varname", "answer"]);

    assert.equal(result.status, 2);
    assert.match(result.stdout, /does not accept template options/);
    assert.match(result.stdout, /\(invalid_template_arguments\)/);
    assert.equal(existsSync(path.join(root, "src", "answer.ts")), false);
  });
});

test("former framework flags are available to the template schema", () => {
  const rule = `import { createTemplate } from ${JSON.stringify(api)};
export const description = "a configurable module";
export const rule = \`Keep the configuration.\`;
export async function lint() {}
export const template = createTemplate({
  config: { type: "string", required: true, description: "Configuration name" },
  format: { type: "string", required: true, description: "Source format" },
  help: { type: "flag", description: "Include help" },
  out: { type: "string", required: true, description: "Export name" },
}, (args) => JSON.stringify(args));
`;
  scratch(rule, (root) => {
    const help = run(root, ["create", "src/example.ts", "help"]);

    assert.equal(help.status, 0, help.stdout + help.stderr);
    assert.match(
      help.stdout,
      /Example:\n  espalier create src\/example\.ts --config <value> --format <value> --out <value>/,
    );
    assert.doesNotMatch(help.stdout, /Example:\n[^\n]*--help/);

    const result = run(root, [
      "create",
      "src/answer.ts",
      "--config",
      "local",
      "--format",
      "esm",
      "--help",
      "--out",
      "answer",
    ]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, "src/answer.ts"), "utf8")), {
      config: "local",
      format: "esm",
      help: true,
      out: "answer",
    });
  });
});

test("template arguments reject values outside their declared choices", () => {
  scratch(SCHEMA_TEMPLATE, (root) => {
    const result = run(root, [
      "create",
      "src/answer.ts",
      "--varname",
      "answer",
      "--declaration",
      "var",
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stdout, /\(invalid_template_arguments\)/);
    assert.match(result.stdout, /must be one of const, let/);
    assert.equal(existsSync(path.join(root, "src", "answer.ts")), false);
  });
});

test("the no-schema overload omits only the template arguments", () => {
  const definition = createTemplate(() => "export {};\n");
  assert.equal(definition.schema, null);

  const rule = `import { createTemplate } from ${JSON.stringify(api)};
export const description = "an empty module";
export const rule = \`No exports.\`;
export async function lint() {}
export const template = createTemplate(() => "export {};\\n");
`;
  scratch(rule, (root) => {
    const result = run(root, ["create", "src/empty.ts"]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(readFileSync(path.join(root, "src", "empty.ts"), "utf8"), "export {};\n");
  });
});

test("template renderers receive the concrete path and structural captures", () => {
  const rule = `import { createTemplate } from ${JSON.stringify(api)};
export const description = "a component";
export const rule = \`Name the component after its file.\`;
export async function lint() {}
export const template = createTemplate(({ path, captures }) =>
  JSON.stringify({ path, captures }) + "\\n",
);
`;
  scratch(
    rule,
    (root) => {
      const result = run(root, ["create", "components/AccountCard.tsx"]);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.deepEqual(
        JSON.parse(readFileSync(path.join(root, "components/AccountCard.tsx"), "utf8")),
        {
          path: "components/AccountCard.tsx",
          captures: { name: "AccountCard" },
        },
      );
    },
    "components/[name].tsx.mjs",
  );
});

test("a declared file without a template is created empty", () => {
  const rule = `export const description = "an unopinionated source module";
export const rule = \`Any contents are allowed.\`;
export async function lint() {}
`;
  scratch(rule, (root) => {
    const help = run(root, ["create", "src/blank.ts", "help"]);

    assert.equal(help.status, 0, help.stdout + help.stderr);
    assert.match(help.stdout, /espalier create src\/blank\.ts help/);
    assert.match(help.stdout, /espalier create src\/blank\.ts\n/);
    assert.match(help.stdout, /Creates an unopinionated source module/);
    assert.match(help.stdout, /No template is defined; create writes an empty file\./);
    assert.equal(existsSync(path.join(root, "src", "blank.ts")), false);

    const result = run(root, ["create", "src/blank.ts"]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^written\s+src\/blank\.ts\n\n1 written\n$/);
    assert.equal(readFileSync(path.join(root, "src", "blank.ts"), "utf8"), "");
  });
});

test("create refuses an existing file before it calls the renderer", () => {
  const rule = `import { createTemplate } from ${JSON.stringify(api)};
export const description = "a source module";
export const rule = \`Preserve it.\`;
export async function lint() {}
export const template = createTemplate(() => { throw new Error("renderer ran"); });
`;
  scratch(rule, (root) => {
    write(root, "src/kept.ts", "hand written\n");
    const result = run(root, ["create", "src/kept.ts"]);

    assert.equal(result.status, 2);
    assert.match(result.stdout, /\(create_target_exists\)/);
    assert.doesNotMatch(result.stdout, /renderer ran/);
    assert.equal(readFileSync(path.join(root, "src", "kept.ts"), "utf8"), "hand written\n");
  });
});

test("create delegates a target to its nearest child espalier", () => {
  const root = repository(SCHEMA_TEMPLATE);
  try {
    write(
      root,
      "packages/web/espalier.config.yaml",
      "version: 1\npin: 0.3.0\nroot: espalier\n",
    );
    write(root, "packages/web/espalier/src/[name].ts.mjs", SCHEMA_TEMPLATE);

    const result = run(root, [
      "create",
      "packages/web/src/child.ts",
      "--varname",
      "child",
    ]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /packages\/web\/src\/child\.ts/);
    assert.equal(
      JSON.parse(readFileSync(path.join(root, "packages/web/src/child.ts"), "utf8")).varname,
      "child",
    );

    const help = run(root, ["create", "packages/web/src/other.ts", "help"]);
    assert.match(
      help.stdout,
      /^Usage:\n  espalier create packages\/web\/src\/other\.ts help/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("create refuses a declared path excluded by repository policy", () => {
  scratch(SCHEMA_TEMPLATE, (root) => {
    write(root, ".espalierignore", "src/hidden.ts\n");
    const result = run(root, [
      "create",
      "src/hidden.ts",
      "--varname",
      "hidden",
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stdout, /\(invalid_create_target\)/);
    assert.equal(existsSync(path.join(root, "src", "hidden.ts")), false);
  });
});

test("top-level help advertises path-specific create help", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-template-help-"));
  try {
    const result = run(root, ["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /create <path> help\s+show how that file will be created/);

    const missing = run(root, ["create"]);
    assert.equal(missing.status, 2);
    assert.match(missing.stdout, /create needs a file path/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
