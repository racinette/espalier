// Template definition and the create command's write boundary. These are unit
// tests rather than fixtures because the observable is a newly written source
// tree, path-specific creation help, preview/create parity, or absence of a write.

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
  write(root, "espalier.config.yaml", "pin: 0.9.1\nroot: espalier\nignoreFiles: []\nskip: []\n");
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

function directoryRepository(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-directory-template-"));
  write(root, "espalier.config.yaml", "pin: 0.9.1\nroot: espalier\nignoreFiles: []\nskip: []\n");
  write(
    root,
    "espalier/clients/[provider]/ESPALIER.MD",
    "---\ndescription: an API client integration\n---\n",
  );
  write(
    root,
    "espalier/clients/[provider]/client.ts.mjs",
    `import { createTemplate } from ${JSON.stringify(api)};
export const description = "the client implementation";
export const rule = \`Implement the client.\`;
export async function lint() {}
export const template = createTemplate({
  transport: {
    type: "string",
    required: true,
    choices: ["fetch", "axios"],
    description: "HTTP transport",
    examples: ["fetch"],
  },
}, (args, context) => JSON.stringify({ args, context }) + "\\n");
`,
  );
  write(
    root,
    "espalier/clients/[provider]/requestModels.ts.mjs",
    `import { createTemplate } from ${JSON.stringify(api)};
export const description = "request payload types";
export const rule = \`Define requests.\`;
export async function lint() {}
export const template = createTemplate({
  format: {
    type: "string",
    choices: ["types", "zod"],
    default: "types",
    description: "Model representation",
    examples: ["zod"],
  },
  tag: {
    type: "string",
    multiple: true,
    description: "Model tag",
    examples: ["public", "stable"],
  },
}, (args) => JSON.stringify(args) + "\\n");
`,
  );
  write(
    root,
    "espalier/clients/[provider]/models/error.ts.mjs",
    `import { createTemplate } from ${JSON.stringify(api)};
export const description = "client error types";
export const rule = \`Define errors.\`;
export async function lint() {}
export const template = createTemplate({
  withDocs: {
    type: "flag",
    description: "Include documentation comments",
    includeInExample: true,
  },
}, (args) => JSON.stringify(args) + "\\n");
`,
  );
  write(
    root,
    "espalier/clients/[provider]/{provider}.config.ts.mjs",
    `import { createTemplate } from ${JSON.stringify(api)};
export const description = "provider configuration";
export const rule = \`Configure the provider.\`;
export async function lint() {}
export const template = createTemplate(({ path, captures }) =>
  JSON.stringify({ path, captures }) + "\\n"
);
`,
  );
  write(
    root,
    "espalier/clients/[provider]/notes.txt.mjs",
    `export const description = "integration notes";
export const rule = \`Notes may start empty.\`;
export async function lint() {}
`,
  );
  write(
    root,
    "espalier/clients/[provider]/README.md.mjs",
    `export const description = "optional client documentation";
export const rule = \`Document unusual clients.\`;
export const optional = true;
export async function lint() {}
`,
  );
  write(
    root,
    "espalier/clients/[provider]/[extension].ts.mjs",
    `export const description = "optional extension collection";
export const rule = \`Extensions are a collection.\`;
export async function lint() {}
`,
  );
  write(
    root,
    "espalier/clients/[provider]/plugins/[plugin]/index.ts.mjs",
    `export const description = "plugin entrypoint";
export const rule = \`Implement a plugin.\`;
export async function lint() {}
`,
  );
  return root;
}

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

test("directory help unions required file schemas under lossless path prefixes", () => {
  const root = directoryRepository();
  try {
    const result = run(root, ["create", "clients/stripe", "help"]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^Usage:\n  espalier create clients\/stripe help/);
    assert.match(result.stdout, /espalier create clients\/stripe preview .* -- \[template options\]/);
    assert.match(result.stdout, /Creates clients\/stripe\/ and its required and selected files\./);
    assert.match(
      result.stdout,
      /Directory:\n  clients\/\[provider\]\/ — an API client integration/,
    );
    assert.match(result.stdout, /Required files:[\s\S]*stripe\.config\.ts — provider configuration/);
    assert.match(result.stdout, /client\.ts — the client implementation/);
    assert.match(result.stdout, /models\/error\.ts — client error types/);
    assert.match(
      result.stdout,
      /notes\.txt — integration notes \(empty file; no template defined\)/,
    );
    assert.match(result.stdout, /README\.md — optional client documentation/);
    assert.doesNotMatch(result.stdout, /plugins\/\[plugin\]/);
    assert.match(
      result.stdout,
      /Example:\n  espalier create clients\/stripe -- --client\.ts:transport fetch --models\/error\.ts:withDocs --requestModels\.ts:format zod --requestModels\.ts:tag public --requestModels\.ts:tag stable/,
    );
    assert.match(
      result.stdout,
      /client\.ts:\n    --client\.ts:transport <fetch\|axios>\s+HTTP transport \(required, examples: fetch\)/,
    );
    assert.match(
      result.stdout,
      /models\/error\.ts:\n    --models\/error\.ts:withDocs\s+Include documentation comments/,
    );
    assert.equal(existsSync(path.join(root, "clients", "stripe")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory help leads to optional file options without creating or rendering them", () => {
  const rule = `import { createTemplate } from ${JSON.stringify(api)};
import { writeFileSync } from 'node:fs';
export const description = "optional notes";
export const rule = \`Document the group.\`;
export const optional = true;
export function lint() {}
export const template = createTemplate({
  title: { type: "string", required: true, description: "Notes heading" },
}, ({ title }) => {
  writeFileSync(new URL('../../../rendered', import.meta.url), 'yes');
  return title;
});
`;
  scratch(rule, (root) => {
    const directoryHelp = run(root, ["create", "groups/new", "help"]);
    assert.equal(directoryHelp.status, 0, directoryHelp.stdout);
    assert.match(directoryHelp.stdout, /No required file template has options\./);
    assert.match(directoryHelp.stdout, /Select optional files before --; template options follow --\./);
    const command = /^Inspect their declarations with: espalier (.+)$/m.exec(directoryHelp.stdout);
    assert.ok(command, directoryHelp.stdout);
    const declarations = run(root, command[1]!.split(" "));
    assert.equal(declarations.status, 0, declarations.stdout);
    assert.match(declarations.stdout, /notes\.md.*optional/);

    const fileHelp = run(root, ["create", "groups/new/notes.md", "help"]);
    assert.equal(fileHelp.status, 0, fileHelp.stdout);
    assert.match(fileHelp.stdout, /--title <value>\s+Notes heading \(required\)/);
    assert.equal(existsSync(path.join(root, "groups")), false);
    assert.equal(existsSync(path.join(root, "rendered")), false);

    const directory = run(root, ["create", "groups/new"]);
    assert.equal(directory.status, 0, directory.stdout);
    assert.equal(existsSync(path.join(root, "groups/new/notes.md")), false);
    assert.equal(existsSync(path.join(root, "rendered")), false);

    const file = run(root, ["create", "groups/new/notes.md", "--", "--title", "New group"]);
    assert.equal(file.status, 0, file.stdout);
    assert.equal(readFileSync(path.join(root, "groups/new/notes.md"), "utf8"), "New group");
    assert.equal(readFileSync(path.join(root, "rendered"), "utf8"), "yes");
  }, "groups/[group]/notes.md.mjs");
});

test("create directory renders every required file with its own local arguments", () => {
  const root = directoryRepository();
  try {
    const result = run(root, [
      "create",
      "clients/stripe",
      "--", "--client.ts:transport",
      "axios",
      "--requestModels.ts:format",
      "zod",
      "--requestModels.ts:tag",
      "public",
      "--requestModels.ts:tag",
      "stable",
      "--models/error.ts:withDocs",
    ]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /written\s+clients\/stripe\/client\.ts/);
    assert.match(result.stdout, /written\s+clients\/stripe\/models\/error\.ts/);
    assert.match(result.stdout, /written\s+clients\/stripe\/notes\.txt/);
    assert.match(result.stdout, /written\s+clients\/stripe\/requestModels\.ts/);
    assert.match(result.stdout, /written\s+clients\/stripe\/stripe\.config\.ts/);
    assert.match(result.stdout, /5 written\n$/);

    assert.deepEqual(
      JSON.parse(readFileSync(path.join(root, "clients/stripe/client.ts"), "utf8")),
      {
        args: { transport: "axios" },
        context: {
          path: "clients/stripe/client.ts",
          captures: { provider: "stripe" },
        },
      },
    );
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(root, "clients/stripe/requestModels.ts"), "utf8")),
      { format: "zod", tag: ["public", "stable"] },
    );
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(root, "clients/stripe/models/error.ts"), "utf8")),
      { withDocs: true },
    );
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(root, "clients/stripe/stripe.config.ts"), "utf8")),
      {
        path: "clients/stripe/stripe.config.ts",
        captures: { provider: "stripe" },
      },
    );
    assert.equal(readFileSync(path.join(root, "clients/stripe/notes.txt"), "utf8"), "");
    assert.equal(existsSync(path.join(root, "clients/stripe/README.md")), false);
    assert.equal(existsSync(path.join(root, "clients/stripe/plugins")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory arguments report their qualified names and never leak across files", () => {
  const root = directoryRepository();
  try {
    const missing = run(root, ["create", "clients/stripe"]);
    assert.equal(missing.status, 2);
    assert.match(missing.stdout, /missing required template option `--client\.ts:transport`/);
    assert.equal(existsSync(path.join(root, "clients/stripe")), false);

    const unqualified = run(root, [
      "create",
      "clients/stripe",
      "--", "--transport",
      "fetch",
    ]);
    assert.equal(unqualified.status, 2);
    assert.match(unqualified.stdout, /Unknown option '--transport'/);
    assert.equal(existsSync(path.join(root, "clients/stripe")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory creation refuses an existing target before rendering", () => {
  const root = directoryRepository();
  try {
    write(root, "clients/stripe/kept.txt", "hand written\n");
    const result = run(root, [
      "create",
      "clients/stripe",
      "--", "--client.ts:transport",
      "fetch",
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stdout, /\(create_target_exists\)/);
    assert.equal(readFileSync(path.join(root, "clients/stripe/kept.txt"), "utf8"), "hand written\n");
    assert.equal(existsSync(path.join(root, "clients/stripe/client.ts")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a directory render failure leaves no partial target", () => {
  const root = directoryRepository();
  try {
    write(
      root,
      "espalier/clients/[provider]/requestModels.ts.mjs",
      `import { createTemplate } from ${JSON.stringify(api)};
export const description = "request payload types";
export const rule = \`Define requests.\`;
export async function lint() {}
export const template = createTemplate(() => { throw new Error("cannot render requests"); });
`,
    );
    const result = run(root, [
      "create",
      "clients/stripe",
      "--", "--client.ts:transport",
      "fetch",
      "--models/error.ts:withDocs",
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stdout, /cannot render requests/);
    assert.equal(existsSync(path.join(root, "clients/stripe")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory creation refuses an excluded required descendant", () => {
  const root = directoryRepository();
  try {
    write(root, ".espalierignore", "clients/stripe/notes.txt\n");
    const result = run(root, [
      "create",
      "clients/stripe",
      "--", "--client.ts:transport",
      "fetch",
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stdout, /clients\/stripe\/notes\.txt is excluded/);
    assert.match(result.stdout, /\(invalid_create_target\)/);
    assert.equal(existsSync(path.join(root, "clients/stripe")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("create uses the narrowest dynamic directory and file, including help and captures", () => {
  const template = (body: string): string =>
    `import { createTemplate } from ${JSON.stringify(api)};
export const description = "simulation source";
export const rule = "Declare the named simulation source.";
export async function lint() {}
export const template = createTemplate(${body});
`;
  scratch(template('() => "world\\n"'), (root) => {
    write(root, "espalier/worlds/[name]-checksonly/{name}.sql.mjs",
      template('({ captures }) => JSON.stringify(captures) + "\\n"'));
    write(root, "espalier/files/[file].ts.mjs", template('() => "ordinary\\n"'));
    write(root, "espalier/files/test-[name].ts.mjs",
      template('({ captures }) => JSON.stringify(captures) + "\\n"'));

    const help = run(root, ["create", "worlds/011_flight_arrivals-checksonly/", "help"]);
    assert.equal(help.status, 0, help.stdout + help.stderr);
    assert.match(help.stdout, /011_flight_arrivals\.sql/);
    assert.doesNotMatch(help.stdout, /world\.json/);

    const checks = run(root, ["create", "worlds/011_flight_arrivals-checksonly/"]);
    assert.equal(checks.status, 0, checks.stdout + checks.stderr);
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(root,
        "worlds/011_flight_arrivals-checksonly/011_flight_arrivals.sql"), "utf8")),
      { name: "011_flight_arrivals" },
    );
    assert.equal(existsSync(path.join(root, "worlds/011_flight_arrivals-checksonly/world.json")), false);

    const ordinary = run(root, ["create", "worlds/earth/"]);
    assert.equal(ordinary.status, 0, ordinary.stdout + ordinary.stderr);
    assert.equal(readFileSync(path.join(root, "worlds/earth/world.json"), "utf8"), "world\n");

    const fileHelp = run(root, ["create", "files/test-arrivals.ts", "help"]);
    assert.equal(fileHelp.status, 0, fileHelp.stdout + fileHelp.stderr);
    assert.match(fileHelp.stdout, /files\/test-\[name\]\.ts/);
    const file = run(root, ["create", "files/test-arrivals.ts"]);
    assert.equal(file.status, 0, file.stdout + file.stderr);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, "files/test-arrivals.ts"), "utf8")),
      { name: "arrivals" });
    const fallback = run(root, ["create", "files/arrivals.ts"]);
    assert.equal(fallback.status, 0, fallback.stdout + fallback.stderr);
    assert.equal(readFileSync(path.join(root, "files/arrivals.ts"), "utf8"), "ordinary\n");
  }, "worlds/[world]/world.json.mjs");
});

test("directory create and lint preserve newline captures through specialized back-references", () => {
  const template = `import { createTemplate } from ${JSON.stringify(api)};
export const description = "simulation source";
export const rule = "Declare the named simulation source.";
export async function lint() {}
export const template = createTemplate(({ captures }) => JSON.stringify(captures) + "\\n");
`;
  scratch(template, (root) => {
    write(root, "espalier/worlds/line\n-[name]/{name}.json.mjs", template);
    const directory = "worlds/line\n-checks\nnight/";
    const created = run(root, ["create", directory]);
    assert.equal(created.status, 0, created.stdout + created.stderr);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, directory, "checks\nnight.json"), "utf8")),
      { name: "checks\nnight" });
    assert.equal(existsSync(path.join(root, directory, "world.json")), false);

    const broad = "worlds/earth\nsouth/";
    const ordinary = run(root, ["create", broad]);
    assert.equal(ordinary.status, 0, ordinary.stdout + ordinary.stderr);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, broad, "world.json"), "utf8")),
      { world: "earth\nsouth" });
    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  }, "worlds/[world]/world.json.mjs");
});

test("file create and explain support a newline stem with an extension union", () => {
  const template = `import { createTemplate } from ${JSON.stringify(api)};
export const description = "simulation source";
export const rule = "Declare the named simulation source.";
export async function lint() {}
export const template = createTemplate(({ captures }) => JSON.stringify(captures) + "\\n");
`;
  scratch(template, (root) => {
    const owner = "files/line\n-[name].{ts,tsx}.mjs";
    write(root, `espalier/${owner}`, template);
    for (const extension of ["ts", "tsx"]) {
      const target = `files/line\n-checks\nnight.${extension}`;
      const created = run(root, ["create", target]);
      assert.equal(created.status, 0, created.stdout + created.stderr);
      assert.deepEqual(JSON.parse(readFileSync(path.join(root, target), "utf8")), { name: "checks\nnight" });
      const explained = run(root, ["explain", target, "--format", "jsonl"]);
      assert.equal(explained.status, 0, explained.stdout + explained.stderr);
      const result = JSON.parse(explained.stdout);
      assert.equal(result.rule, owner);
      assert.deepEqual(result.captures, { name: "checks\nnight" });
    }
    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  }, "files/[file].{ts,tsx}.mjs");
});

test("a trailing slash selects a directory when the same spelling can be a file", () => {
  const make = (): string => {
    const root = mkdtempSync(path.join(os.tmpdir(), "espalier-create-role-"));
    write(root, "espalier.config.yaml", "pin: 0.9.1\nroot: espalier\nignoreFiles: []\nskip: []\n");
    write(
      root,
      "espalier/widgets/item.mjs",
      `import { createTemplate } from ${JSON.stringify(api)};
export const description = "the item file";
export const rule = \`An item file.\`;
export async function lint() {}
export const template = createTemplate(() => "file\\n");
`,
    );
    write(
      root,
      "espalier/widgets/item/index.ts.mjs",
      `import { createTemplate } from ${JSON.stringify(api)};
export const description = "the item entrypoint";
export const rule = \`An item directory.\`;
export async function lint() {}
export const template = createTemplate(() => "directory\\n");
`,
    );
    return root;
  };

  const fileRoot = make();
  try {
    const file = run(fileRoot, ["create", "widgets/item"]);
    assert.equal(file.status, 0, file.stdout + file.stderr);
    assert.equal(readFileSync(path.join(fileRoot, "widgets/item"), "utf8"), "file\n");
  } finally {
    rmSync(fileRoot, { recursive: true, force: true });
  }

  const directoryRoot = make();
  try {
    const directory = run(directoryRoot, ["create", "widgets/item/"]);
    assert.equal(directory.status, 0, directory.stdout + directory.stderr);
    assert.equal(
      readFileSync(path.join(directoryRoot, "widgets/item/index.ts"), "utf8"),
      "directory\n",
    );
  } finally {
    rmSync(directoryRoot, { recursive: true, force: true });
  }
});

test("directory help lists nonempty collections while create leaves their filenames to the author", () => {
  const root = repository(`export const description = "a member";
export const rule = "Each group has at least one member.";
export const minMatches = 1;
export function lint() {}
`, "groups/[group]/[member].js.mjs");
  try {
    const rule = `export const description = "a test";
export const rule = "Each group has a test.";
export const minMatches = 1;
export function lint() {}
`;
    write(root, "espalier/groups/[group]/tests/[test].ts.mjs", rule);
    write(root, "espalier/groups/[group]/future/[instance]/[test].ts.mjs", rule);
    write(root, "espalier/groups/[group]/notes.md.mjs", rule.replace("export const minMatches = 1;", "export const optional = false;"));
    const help = run(root, ["create", "groups/new", "help"]);
    assert.equal(help.status, 0, help.stdout + help.stderr);
    assert.match(help.stdout, /Required collections \(choose a filename and create separately\):/);
    assert.match(help.stdout, /\[member\]\.js — one or more owned files/);
    assert.match(help.stdout, /tests\/\[test\]\.ts — one or more owned files/);
    assert.doesNotMatch(help.stdout, /future\/\[instance\]/);
    assert.equal(existsSync(path.join(root, "groups/new")), false);

    const preview = run(root, ["create", "groups/new", "preview"]);
    assert.equal(preview.status, 0, preview.stdout + preview.stderr);
    assert.match(preview.stdout, /groups\/new\/notes\.md/);
    assert.doesNotMatch(preview.stdout, /\[member\]|\[test\]/);
    assert.equal(existsSync(path.join(root, "groups/new")), false);
    const created = run(root, ["create", "groups/new"]);
    assert.equal(created.status, 0, created.stdout + created.stderr);
    assert.equal(readFileSync(path.join(root, "groups/new/notes.md"), "utf8"), "");
    assert.equal(existsSync(path.join(root, "groups/new/tests")), false);
    assert.equal(existsSync(path.join(root, "groups/new/[member].js")), false);
    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 1, lint.stdout + lint.stderr);
    const issues = lint.stdout.trim().split("\n").map((line) => JSON.parse(line))
      .filter((line) => line.kind === "issue");
    assert.deepEqual(issues.map((issue) => [issue.path, issue.code]).sort(), [
      ["groups/new", "missing_required_match"],
      ["groups/new/tests", "missing_required_match"],
    ]);
    for (const target of ["groups/new/a.js", "groups/new/tests/one.ts"]) {
      const result = run(root, ["create", target]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    const complete = run(root, ["lint"]);
    assert.equal(complete.status, 0, complete.stdout + complete.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a declared directory with no required leaves is created empty", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-create-empty-directory-"));
  try {
    write(root, "espalier.config.yaml", "pin: 0.9.1\nroot: espalier\nignoreFiles: []\nskip: []\n");
    write(
      root,
      "espalier/groups/[group]/notes.md.mjs",
      `export const description = "optional notes";
export const rule = \`Notes are optional.\`;
export const optional = true;
export async function lint() {}
`,
    );

    const help = run(root, ["create", "groups/new", "help"]);
    assert.equal(help.status, 0, help.stdout + help.stderr);
    assert.match(help.stdout, /Required files:\n  \(none\)/);
    assert.match(help.stdout, /No required file template has options\./);

    const result = run(root, ["create", "groups/new"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^written\s+groups\/new\/\n\n1 written\n$/);
    assert.equal(existsSync(path.join(root, "groups/new")), true);
    assert.equal(existsSync(path.join(root, "groups/new/notes.md")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("create maps literal schema keys, defaults, and repeated values into the renderer", () => {
  scratch(SCHEMA_TEMPLATE, (root) => {
    const result = run(root, [
      "create",
      "src/answer.ts",
      "--", "--varname",
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
      "--", "--varname",
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
    assert.match(result.stdout, /espalier create src\/answer\.ts preview -- \[template options\]/);
    assert.match(result.stdout, /espalier create src\/answer\.ts -- \[template options\]/);
    assert.match(
      result.stdout,
      /Creates src\/answer\.ts\.\n\nOwned by:\n  src\/\[name\]\.ts — a generated source module/,
    );
    assert.match(
      result.stdout,
      /Example:\n  espalier create src\/answer\.ts -- --varname answer --with-export --declaration let --tag public --tag stable --label "public API"/,
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
      /Example:\n  espalier create src\/example\.ts -- --config <value> --format <value> --out <value>/,
    );
    assert.doesNotMatch(help.stdout, /Example:\n[^\n]*--help/);

    const result = run(root, [
      "create",
      "src/answer.ts",
      "--", "--config",
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
      "--", "--varname",
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
    assert.match(
      help.stdout,
      /Creates src\/blank\.ts\.\n\nOwned by:\n  src\/\[name\]\.ts — an unopinionated source module/,
    );
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
      "pin: 0.9.1\nroot: espalier\nignoreFiles: []\nskip: []\n",
    );
    write(root, "packages/web/espalier/src/[name].ts.mjs", SCHEMA_TEMPLATE);

    const result = run(root, [
      "create",
      "packages/web/src/child.ts",
      "--", "--varname",
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
    assert.match(
      help.stdout,
      /Owned by:\n  src\/\[name\]\.ts — a generated source module/,
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
      "--", "--varname",
      "hidden",
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stdout, /\(invalid_create_target\)/);
    assert.equal(existsSync(path.join(root, "src", "hidden.ts")), false);
  });
});

test("file preview renders creation arguments without creating its parent", () => {
  scratch(SCHEMA_TEMPLATE, (root) => {
    const args = ["--varname", "answer", "--with-export", "--tag", "public", "--tag", "stable"];
    const result = run(root, ["create", "src/answer.ts", "preview", "--", ...args]);
    const contents = JSON.stringify({
      varname: "answer", "with-export": true, camelCase: false,
      declaration: "const", tag: ["public", "stable"],
    }) + "\n";
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout, 'Preview: "src/answer.ts"\n```text\n' + contents + "```\n\n1 file previewed.\n");
    assert.equal(existsSync(path.join(root, "src")), false);

    const created = run(root, ["create", "src/answer.ts", "--", ...args]);
    assert.equal(created.status, 0, created.stdout + created.stderr);
    assert.equal(readFileSync(path.join(root, "src/answer.ts"), "utf8"), contents);
  });
});

test("directory preview matches every created source and omits optional collections", () => {
  const root = directoryRepository();
  try {
    const args = ["--client.ts:transport", "axios", "--requestModels.ts:tag", "public",
      "--requestModels.ts:tag", "stable", "--models/error.ts:withDocs"];
    const result = run(root, ["create", "clients/stripe", "preview", "--", ...args]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const headers = [...result.stdout.matchAll(/^Preview: (.+)$/gm)].map((match) => JSON.parse(match[1]!));
    assert.deepEqual(headers, [
      "clients/stripe/client.ts", "clients/stripe/models/error.ts", "clients/stripe/notes.txt",
      "clients/stripe/requestModels.ts", "clients/stripe/stripe.config.ts",
    ]);
    assert.match(result.stdout, /Preview: "clients\/stripe\/notes.txt"\n\(empty file\)/);
    assert.match(result.stdout, /\n\n5 files previewed\.\n$/);
    assert.equal(existsSync(path.join(root, "clients")), false);

    const created = run(root, ["create", "clients/stripe", "--", ...args]);
    assert.equal(created.status, 0, created.stdout + created.stderr);
    const blocks = [...result.stdout.matchAll(/^Preview: (.+)\n```text\n([\s\S]*?)\n```$/gm)];
    assert.equal(blocks.length, 4);
    for (const [, quotedPath, source] of blocks) {
      assert.equal(readFileSync(path.join(root, JSON.parse(quotedPath!)), "utf8"), source + "\n");
    }
    assert.equal(readFileSync(path.join(root, "clients/stripe/notes.txt"), "utf8"), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preview preserves source whitespace and escapes paths and embedded fences", () => {
  const contents = "  leading\r\n```text\r\n````\r\n\ttail  ";
  const target = 'src/line\n"quoted".ts';
  scratch(`import { createTemplate } from ${JSON.stringify(api)};
export const description = "source with significant whitespace";
export const rule = "Preserve source whitespace.";
export async function lint() {}
export const template = createTemplate(() => ${JSON.stringify(contents)});
`, (root) => {
    const result = run(root, ["create", target, "preview"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout, `Preview: ${JSON.stringify(target)}\n\`\`\`\`\`text\n${contents}\n\`\`\`\`\`\n(no trailing newline)\n\n1 file previewed.\n`);
    assert.equal(existsSync(path.join(root, "src")), false);
    const created = run(root, ["create", target]);
    assert.equal(created.status, 0, created.stdout + created.stderr);
    assert.equal(readFileSync(path.join(root, target), "utf8"), contents);
  });
});

test("preview identifies empty files and directories without writing either", () => {
  for (const template of ["", `export const template = createTemplate(() => "");`]) {
    scratch(`import { createTemplate } from ${JSON.stringify(api)};
export const description = "optional notes";
export const rule = "Document the group.";
export async function lint() {}
export const optional = true;
${template}
`, (root) => {
      const file = run(root, ["create", "groups/new/notes.md", "preview"]);
      assert.equal(file.status, 0, file.stdout + file.stderr);
      assert.equal(file.stdout, 'Preview: "groups/new/notes.md"\n(empty file)\n\n1 file previewed.\n');
      const directory = run(root, ["create", "groups/new", "preview"]);
      assert.equal(directory.status, 0, directory.stdout + directory.stderr);
      assert.equal(directory.stdout, 'Preview: "groups/new/"\n(no required files)\n\n0 files previewed.\n');
      assert.equal(existsSync(path.join(root, "groups")), false);
    }, "groups/[group]/notes.md.mjs");
  }
});

test("preview keeps all long flags and option values available to templates", () => {
  scratch(`import { createTemplate } from ${JSON.stringify(api)};
export const description = "configurable source";
export const rule = "Keep the selected configuration.";
export async function lint() {}
export const template = createTemplate({
  preview: { type: "flag", description: "Include preview support" },
  help: { type: "flag", description: "Include help" },
  format: { type: "string", description: "Source format" },
  out: { type: "string", description: "Export name" },
}, (args) => JSON.stringify(args) + "\\n");
`, (root) => {
    const args = ["--preview", "--help", "--format", "jsonl", "--out", "preview"];
    const result = run(root, ["create", "src/options.ts", "preview", "--", ...args]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^Preview: "src\/options.ts"\n```text\n/);
    assert.match(result.stdout, /"preview":true,"help":true,"format":"jsonl","out":"preview"/);
    assert.equal(existsSync(path.join(root, "src")), false);
    assert.equal(existsSync(path.join(root, "preview")), false);
    const created = run(root, ["create", "src/options.ts", "--", ...args]);
    assert.equal(created.status, 0, created.stdout + created.stderr);
    assert.ok(result.stdout.includes(readFileSync(path.join(root, "src/options.ts"), "utf8")));
  });
});

test("preview argument failures produce neither partial source nor target directories", () => {
  scratch(SCHEMA_TEMPLATE, (root) => {
    for (const args of [[], ["--varname", "answer", "--declaration", "var"], ["--unknown"]]) {
      const result = run(root, ["create", "src/answer.ts", "preview", "--", ...args]);
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stdout, /\(invalid_template_arguments\)/);
      assert.doesNotMatch(result.stdout, /Preview:|files? previewed\./);
      assert.equal(existsSync(path.join(root, "src")), false);
    }
  });
  const root = directoryRepository();
  try {
    const result = run(root, ["create", "clients/stripe", "preview",
      "--", "--client.ts:transport", "fetch", "--requestModels.ts:format", "invalid"]);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stdout, /\(invalid_template_arguments\)/);
    assert.doesNotMatch(result.stdout, /Preview:|files? previewed\./);
    assert.equal(existsSync(path.join(root, "clients")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preview renderer failures produce no partial source or target directories", () => {
  for (const body of ['throw new Error("render failed");', "return 42;"]) {
    const rule = `import { createTemplate } from ${JSON.stringify(api)};
export const description = "source that cannot render";
export const rule = "Render the source.";
export async function lint() {}
export const template = createTemplate(() => { ${body} });
`;
    scratch(rule, (root) => {
      const result = run(root, ["create", "src/answer.ts", "preview"]);
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stdout, /render failed|must return a string/);
      assert.doesNotMatch(result.stdout, /Preview:|files? previewed\./);
      assert.equal(existsSync(path.join(root, "src")), false);
    });
    const root = directoryRepository();
    try {
      write(root, "espalier/clients/[provider]/requestModels.ts.mjs", rule);
      const result = run(root, ["create", "clients/stripe", "preview", "--", "--client.ts:transport", "fetch"]);
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stdout, /render failed|must return a string/);
      assert.doesNotMatch(result.stdout, /Preview:|files? previewed\./);
      assert.equal(existsSync(path.join(root, "clients")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("preview refuses existing and excluded targets before rendering", () => {
  scratch(`import { createTemplate } from ${JSON.stringify(api)};
export const description = "kept source";
export const rule = "Preserve existing source.";
export async function lint() {}
export const template = createTemplate(() => { throw new Error("renderer ran"); });
`, (root) => {
    write(root, "groups/kept/index.ts", "hand written\n");
    write(root, ".espalierignore", "groups/hidden/index.ts\n");
    for (const [target, code] of [
      ["groups/kept/index.ts", "create_target_exists"], ["groups/kept", "create_target_exists"],
      ["groups/hidden/index.ts", "invalid_create_target"], ["groups/hidden", "invalid_create_target"],
    ] as const) {
      const result = run(root, ["create", target, "preview"]);
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.ok(result.stdout.includes(`(${code})`), result.stdout);
      assert.doesNotMatch(result.stdout, /renderer ran|Preview:|files? previewed\./);
    }
    assert.equal(readFileSync(path.join(root, "groups/kept/index.ts"), "utf8"), "hand written\n");
    assert.equal(existsSync(path.join(root, "groups/hidden")), false);
  }, "groups/[group]/index.ts.mjs");
});

test("preview delegates nested paths while keeping renderer context child-relative", () => {
  const root = repository(SCHEMA_TEMPLATE);
  try {
    for (const child of ["packages/web", "packages/web/tools/worker"]) {
      write(root, `${child}/espalier.config.yaml`, "pin: 0.9.1\nroot: espalier\nignoreFiles: []\nskip: []\n");
      write(root, `${child}/espalier/groups/[group]/index.ts.mjs`, `import { createTemplate } from ${JSON.stringify(api)};
export const description = "group source";
export const rule = "Use the group context.";
export async function lint() {}
export const template = createTemplate((context) => JSON.stringify(context) + "\\n");
`);
    }
    for (const target of ["groups/new/index.ts", "groups/new"]) {
      const result = run(root, ["create", `packages/web/tools/worker/${target}`, "preview"]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(result.stdout, 'Preview: "packages/web/tools/worker/groups/new/index.ts"\n```text\n' +
        '{"path":"groups/new/index.ts","captures":{"group":"new"}}\n```\n\n1 file previewed.\n');
      assert.equal(existsSync(path.join(root, "packages/web/tools/worker/groups")), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("top-level help advertises path-specific create help", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-template-help-"));
  try {
    const result = run(root, ["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /create <path> help\s+show creation options and required files/);
    assert.match(result.stdout, /create <path> preview\s+render source without writing target files/);

    const missing = run(root, ["create"]);
    assert.equal(missing.status, 2);
    assert.match(missing.stdout, /create needs a file or directory path/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [modulePath, target] of [
  [".env.mjs", ".env"],
  [".github/workflows/[workflow].yml.mjs", ".github/workflows/verify.yml"],
  [".[name]/settings.json.mjs", ".editor/settings.json"],
]) {
  test(`dotted target ${target} has preview/create parity without preview writes`, () => {
    scratch(`import { createTemplate } from ${JSON.stringify(api)};
export const description = "Dotted target";
export const rule = "Keep the concrete target.";
export function lint() {}
export const template = createTemplate({}, (_args, context) => context.path + "\\n");
`, (root) => {
      const preview = run(root, ["create", target!, "preview"]);
      assert.equal(preview.status, 0, preview.stdout + preview.stderr);
      assert.ok(preview.stdout.includes(target!));
      assert.equal(existsSync(path.join(root, target!)), false);
      if (target!.includes("/")) assert.equal(existsSync(path.join(root, target!.split("/")[0]!)), false);
      const create = run(root, ["create", target!]);
      assert.equal(create.status, 0, create.stdout + create.stderr);
      assert.equal(readFileSync(path.join(root, target!), "utf8"), target + "\n");
      assert.equal(run(root, ["lint"]).status, 0);
    }, modulePath);
  });
}

test("directory optional selection composes schemas, previews, and writes only selected leaves", () => {
  const root = directoryRepository();
  try {
    write(root, "espalier/clients/[provider]/README.md.mjs", `import { createTemplate } from ${JSON.stringify(api)};
export const description = 'client notes';
export const optional = true; export const rule = 'Local notes'; export function lint() {}
export const template = createTemplate({ title: { type: 'string', required: true, description: 'Notes title', examples: ['Stripe'] } }, ({title}, {captures}) => title + ':' + captures.provider);
`);
    const help = run(root, ["create", "clients/stripe", "help", "--with", "README.md"]);
    assert.equal(help.status, 0, help.stdout);
    assert.match(help.stdout, /--README.md:title/);
    assert.match(help.stdout, /create clients\/stripe --with README.md -- /);
    const args = ["--with", "README.md", "--with", "README.md", "--", "--client.ts:transport", "fetch", "--README.md:title", "Stripe"];
    const preview = run(root, ["create", "clients/stripe", "preview", ...args]);
    assert.equal(preview.status, 0, preview.stdout);
    assert.match(preview.stdout, /Stripe:stripe/);
    assert.equal(existsSync(path.join(root, "clients")), false);
    const created = run(root, ["create", "clients/stripe", ...args]);
    assert.equal(created.status, 0, created.stdout);
    assert.equal(readFileSync(path.join(root, "clients/stripe/README.md"), "utf8"), "Stripe:stripe");
    assert.equal(existsSync(path.join(root, "clients/stripe/plugins")), false);
    assert.equal((created.stdout.match(/written\s+clients\/stripe\/README.md/g) ?? []).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("all optional leaves include resolved names but do not invent dynamic members", () => {
  const root = directoryRepository();
  try {
    write(root, "espalier/clients/[provider]/{provider}.notes.md.mjs", "export const description = 'notes'; export const optional = true; export const rule = 'Local notes'; export function lint() {}");
    const result = run(root, ["create", "clients/stripe", "--with-optional", "--", "--client.ts:transport", "fetch"]);
    assert.equal(result.status, 0, result.stdout);
    for (const file of ["README.md", "stripe.notes.md", "client.ts"]) assert.ok(existsSync(path.join(root, "clients/stripe", file)));
    assert.equal(existsSync(path.join(root, "clients/stripe/plugins")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("optional selection failures leave no partial directory", () => {
  const root = directoryRepository();
  try {
    for (const selected of ["../README.md", "/README.md", "missing.md", "client.ts", "extra.ts", "plugins/new/index.ts"]) {
      const result = run(root, ["create", "clients/stripe", "--with", selected, "--", "--client.ts:transport", "fetch"]);
      assert.equal(result.status, 2, selected + result.stdout);
      assert.match(result.stdout, /not a listed optional leaf/);
      assert.equal(existsSync(path.join(root, "clients")), false);
    }
    write(root, ".espalierignore", "clients/stripe/README.md\n");
    const excluded = run(root, ["create", "clients/stripe", "--with-optional", "--", "--client.ts:transport", "fetch"]);
    assert.equal(excluded.status, 2, excluded.stdout);
    assert.match(excluded.stdout, /README.md is excluded/);
    assert.equal(existsSync(path.join(root, "clients")), false);
    write(root, ".espalierignore", "");
    write(root, "espalier/clients/[provider]/README.md.mjs", `import { createTemplate } from ${JSON.stringify(api)};
export const optional = true; export const rule = 'Local notes'; export function lint() {}
export const description = 'notes';
export const template = createTemplate({ title: { type: 'string', required: true, description: 'Title' } }, () => { throw Error('optional renderer failed'); });`);
    const missing = run(root, ["create", "clients/stripe", "--with", "README.md", "--", "--client.ts:transport", "fetch"]);
    assert.equal(missing.status, 2, missing.stdout);
    assert.match(missing.stdout, /missing required template option.*README.md:title/);
    const failed = run(root, ["create", "clients/stripe", "--with", "README.md", "--", "--client.ts:transport", "fetch", "--README.md:title", "Notes"]);
    assert.equal(failed.status, 2, failed.stdout);
    assert.match(failed.stdout, /optional renderer failed/);
    assert.equal(existsSync(path.join(root, "clients")), false);
    const defaultResult = run(root, ["create", "clients/stripe", "--", "--client.ts:transport", "fetch"]);
    assert.equal(defaultResult.status, 0, defaultResult.stdout);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("selecting a leaf activates optional named directories with inherited requirements", () => {
  const root = repository("export const description = 'required sibling'; export const rule = 'Required'; export function lint() {}", "groups/[group]/[part]/required.ts.mjs");
  try {
    write(root, "espalier/groups/[group]/[part]/notes.md.mjs", "export const description = 'notes'; export const optional = true; export const rule = 'Local notes'; export function lint() {}");
    write(root, "espalier/groups/[group]/extra/ESPALIER.mjs", "export const instanceOf = '../[part]'; export const optional = true;");
    const help = run(root, ["create", "groups/new", "help"]);
    assert.equal(help.status, 0, help.stdout);
    assert.match(help.stdout, /extra\/notes.md/);
    const result = run(root, ["create", "groups/new", "--with", "extra/notes.md"]);
    assert.equal(result.status, 0, result.stdout);
    assert.ok(existsSync(path.join(root, "groups/new/extra/required.ts")));
    assert.ok(existsSync(path.join(root, "groups/new/extra/notes.md")));
    assert.equal(run(root, ["lint", "--jobs", "1"]).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
