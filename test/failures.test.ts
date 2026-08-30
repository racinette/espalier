// Every operational failure, observed firing. docs/ERRORS.MD.
//
// `errors.test.ts` holds the registry and the source to each other: a code
// thrown and not documented fails, and so does a code documented and not
// thrown. Neither direction proves the condition is reachable. A validation
// whose predicate was inverted would satisfy both — the code exists, the
// document lists it, and nothing ever throws it — which is the failure mode
// that matters most here, because a check that silently accepts bad input is
// indistinguishable from a repository that is fine.
//
// These are not fixtures. A fixture is a repository whose *outcome* is being
// pinned, and the outcome of all of these is "nothing ran". What each one pins
// is the input that stops the run, which is a sentence rather than a tree —
// several are not expressible as a tree at all, since a config that will not
// parse or a command invoked with no argument has no repository to be.
//
// The cases that already have fixtures are the ones a reader learns something
// from by looking at the whole repository: an ambiguous espalier, a rule that
// throws, a required path that `ignore` also matches.
//
// One documented code is missing from this table, deliberately.
// `duplicate_structural_rule` fires where a second rule lands on a trie node
// that already has one, and nothing can put it there. A leaf's node is keyed by
// its shape and distinguished by its capture names, and both are derived from
// the filename — so two rules colliding on one node are two files with one name
// in one directory. Every near miss is caught earlier and by something else:
// `[a].ts.mjs` beside `[b].ts.mjs` is `inconsistent_capture_names`, and a
// linked subtree is a second path rather than a second rule. Contriving an
// input to reach it would pin the contrivance. The guard stays because it is
// the kind of invariant a future change to normalization could break quietly,
// and this note is here so the next reader does not derive it again.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."),
  "dist",
  "src",
  "cli.js",
);

const VALID_CONFIG = "version: 1\npin: 0.1.0\nroot: espalier\n";

interface Case {
  /** What the run is refusing, in a few words. */
  what: string;
  code: string;
  /** `espalier.config.yaml`. Omitted means a valid one; null means none. */
  config?: string | null;
  /** Files under the espalier root, by their path within it. */
  espalier?: Record<string, string>;
  /** Files in the repository, by repository-relative path. */
  files?: Record<string, string>;
  /** Defaults to `lint`. */
  args?: string[];
  /** Run from here rather than from the repository root. */
  cwd?: string;
}

function write(root: string, relative: string, contents: string): void {
  const at = path.join(root, relative);
  mkdirSync(path.dirname(at), { recursive: true });
  writeFileSync(at, contents, "utf8");
}

/** A rule module that is valid and does nothing, for the cases about something else. */
const INERT = 'export const description = "a file";\nexport const rule = `Nothing.`;\nexport async function lint() {}\n';

const cases: Case[] = [
  // Configuration. docs/CONFIG.MD.
  {
    what: "a config that is not YAML",
    code: "config_malformed",
    config: "version: 1\npin: 0.1.0\n  root: [unclosed\n",
  },
  {
    what: "a config that is valid YAML and not a mapping",
    code: "config_malformed",
    config: "- version\n- 1\n",
  },
  {
    what: "a key that does not exist — the typo this key exists for",
    code: "config_unknown_key",
    config: "version: 1\npin: 0.1.0\nroot: espalier\nignoreFile: .gitignore\n",
  },
  {
    what: "no version at all",
    code: "config_missing_version",
    config: "root: espalier\n",
  },
  {
    what: "no CLI version pin",
    code: "config_missing_pin",
    config: "version: 1\nroot: espalier\n",
  },
  {
    what: "a different CLI version than the repository pins",
    code: "version_mismatch",
    config: "version: 1\npin: 99.0.0\nroot: espalier\n",
  },
  {
    what: "a version this release does not implement",
    code: "config_unsupported_version",
    config: "version: 2\nroot: espalier\n",
  },
  {
    what: "a key holding the wrong type",
    code: "config_invalid_value",
    config: "version: 1\npin: 0.1.0\nroot: [espalier]\n",
  },
  {
    what: "a root that escapes the repository",
    code: "config_invalid_value",
    config: "version: 1\npin: 0.1.0\nroot: ../elsewhere\n",
  },
  {
    // A heading is one line, so a name is one line. An empty one would head
    // every document with a bare `#`.
    what: "a name that is not a single line",
    code: "config_invalid_value",
    config: 'version: 1\npin: 0.1.0\nname: "a\\nb"\nroot: espalier\n',
  },
  {
    what: "a name that is empty",
    code: "config_invalid_value",
    config: 'version: 1\npin: 0.1.0\nname: "   "\nroot: espalier\n',
  },
  {
    what: "a root that is not there",
    code: "espalier_root_missing",
    config: "version: 1\npin: 0.1.0\nroot: absent\n",
  },
  {
    // Normalized, not rejected — `./espalier/` is `espalier`, and
    // `config-root-spelling` pins that. What normalizes away to nothing is a
    // different matter: an espalier root equal to the repository root would
    // make every path invisible, which is not a configuration with a meaning.
    what: "a root that names the repository itself",
    code: "config_invalid_value",
    config: "version: 1\npin: 0.1.0\nroot: .\n",
  },

  // The espalier tree. docs/MATCHING.MD.
  {
    what: "an unmatched bracket in a rule path",
    code: "malformed_placeholder",
    espalier: { "src/[name.ts.mjs": INERT },
  },
  {
    what: "two recursive placeholders in one path",
    code: "multiple_recursive_placeholders",
    espalier: { "src/[...a]/[...b]/no-fetch.ts.mjs": INERT },
  },
  {
    what: "the same capture name twice in one path",
    code: "duplicate_placeholder_name",
    espalier: { "src/[name]/[name].ts.mjs": INERT },
  },
  {
    what: "an extension list on a leaf that names one file",
    code: "extension_list_on_structural_leaf",
    espalier: { "src/client.{ts,tsx}.mjs": INERT },
  },
  {
    what: "a constraint leaf with no extension after the rule name",
    code: "malformed_constraint_leaf",
    espalier: { "src/[...path]/no-fetch..mjs": INERT },
  },
  {
    what: "an ESPALIER.MD whose frontmatter will not parse",
    code: "malformed_node_description",
    espalier: {
      "src/ESPALIER.MD": "---\ndescription: [unclosed\n---\n\nProse.\n",
      "src/[name].ts.mjs": INERT,
    },
  },
  {
    what: "a module that throws while being imported",
    code: "module_import_failed",
    espalier: { "src/[name].ts.mjs": 'throw new Error("from the top level");\n' },
  },

  // What a rule module must export. docs/MATCHING.MD "Node kinds", TYPES.MD.
  // One code each was observed before; these are the individual checks behind
  // them, and an inverted predicate in any one would accept a module that then
  // misbehaves at run time rather than at load time.
  {
    what: "a module with no `rule`",
    code: "module_missing_export",
    espalier: {
      "src/[name].ts.mjs": 'export const description = "a file";\nexport async function lint() {}\n',
    },
  },
  {
    what: "a module with no `lint`",
    code: "module_missing_export",
    espalier: {
      "src/[name].ts.mjs": 'export const description = "a file";\nexport const rule = `R`;\n',
    },
  },
  {
    what: "a module with no `description`",
    code: "module_missing_export",
    espalier: {
      "src/[name].ts.mjs": "export const rule = `R`;\nexport async function lint() {}\n",
    },
  },
  {
    // On a constraint, where `description` is optional. A structural module
    // missing one is `module_missing_export`, and that check runs first — so
    // this branch is reachable only through the kind that does not require it.
    what: "a `description` that is present and not a string",
    code: "module_invalid_export",
    espalier: {
      "src/[name].ts.mjs": INERT,
      "[...path]/no-x.ts.mjs":
        "export const description = 42;\nexport const rule = `R`;\nexport async function lint() {}\n",
    },
  },
  {
    what: "an `example` that is not a string",
    code: "module_invalid_export",
    espalier: {
      "src/[name].ts.mjs":
        'export const description = "a file";\nexport const example = 1;\nexport const rule = `R`;\nexport async function lint() {}\n',
    },
  },
  {
    what: "an `exampleSource` that is not a string",
    code: "module_invalid_export",
    espalier: {
      "src/[name].ts.mjs":
        'export const description = "a file";\nexport const exampleSource = 1;\nexport const rule = `R`;\nexport async function lint() {}\n',
    },
  },
  {
    what: "an `optional` that is not a boolean",
    code: "module_invalid_export",
    espalier: {
      "src/client.ts.mjs":
        'export const description = "a file";\nexport const optional = "yes";\nexport const rule = `R`;\nexport async function lint() {}\n',
    },
  },
  {
    what: "a node description that parses but is not a string",
    code: "malformed_node_description",
    espalier: {
      "src/ESPALIER.MD": "---\ndescription:\n  - a list\n---\n\nProse.\n",
      "src/[name].ts.mjs": INERT,
    },
  },
  {
    what: "a config boolean that is not a boolean",
    code: "config_invalid_value",
    config: "version: 1\npin: 0.1.0\nroot: espalier\nbuild:\n  inline: yes please\n",
  },
  {
    what: "an Espalier-guidance setting that is not a boolean",
    code: "config_invalid_value",
    config: "version: 1\npin: 0.1.0\nroot: espalier\nbuild:\n  espalierGuidance: sometimes\n",
  },

  // Addons. docs/CONFIG.MD "addons".
  {
    what: "an addons module that is not there",
    code: "addons_import_failed",
    config: "version: 1\npin: 0.1.0\nroot: espalier\naddons: missing.addons.mjs\n",
  },
  {
    what: "an addons module exporting no setup",
    code: "addons_missing_setup",
    config: "version: 1\npin: 0.1.0\nroot: espalier\naddons: espalier.addons.mjs\n",
    files: { "espalier.addons.mjs": "export const teardown = () => {};\n" },
  },
  {
    what: "an addons setup that throws — nothing is linted",
    code: "addons_setup_failed",
    config: "version: 1\npin: 0.1.0\nroot: espalier\naddons: espalier.addons.mjs\n",
    files: {
      "espalier.addons.mjs": 'export async function setup() { throw new Error("no parser"); }\n',
    },
  },

  // Command-specific.
  {
    what: "explain, given a path outside the repository",
    code: "path_outside_repository",
    args: ["explain", "../elsewhere/file.ts"],
  },
  {
    what: "adopt, given a path outside the repository",
    code: "invalid_adopt_target",
    args: ["adopt", "../elsewhere"],
  },
  {
    what: "adopt, given a file rather than a directory",
    code: "invalid_adopt_target",
    files: { "notes.txt": "not a directory\n" },
    args: ["adopt", "notes.txt"],
  },
  {
    what: "adopt, given the espalier root",
    code: "invalid_adopt_target",
    args: ["adopt", "espalier"],
  },
  {
    what: "init, given a root outside the repository",
    code: "config_invalid_value",
    config: null,
    args: ["init", "--no-ignore-file", "--root", "../elsewhere"],
  },
  {
    what: "a rule emitting an issue whose path is not a string",
    code: "invalid_issue_path",
    espalier: {
      "src/[name].ts.mjs": `export const description = "a file";
export const rule = \`R\`;
export async function lint(context) {
  context.emit({ code: "bad", message: "m", path: 42 });
}
`,
    },
    files: { "src/a.ts": "export const a = 1;\n" },
  },
  {
    what: "adopt, given nothing to adopt",
    code: "missing_argument",
    args: ["adopt"],
  },
  {
    what: "init, where a configuration already is",
    code: "config_exists",
    args: ["init", "--no-ignore-file"],
  },
  {
    what: "build, over a documentation file nobody generated",
    code: "unmarked_documentation",
    espalier: {
      "ESPALIER.MD": "---\ndescription: the root\n---\n\nProse.\n",
      "src/[name].ts.mjs": INERT,
    },
    files: {
      "src/a.ts": "export const a = 1;\n",
      // Hand-written, and carrying no provenance header. First contact with a
      // tool is not the right moment to lose your agent instructions.
      "AGENTS.MD": "# House rules\n\nWritten by a person.\n",
    },
    args: ["build"],
  },
];

// `read_failed` needs a file that is a candidate and still will not open, which
// no tree written by the table above can be: the walk has to see it, and then
// the read has to fail. A mode change between the two is the only way in.
test("read_failed: a governed file the process may not open", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-failure-"));
  const at = path.join(root, "src", "a.ts");
  try {
    writeFileSync(path.join(root, "espalier.config.yaml"), VALID_CONFIG, "utf8");
    write(
      root,
      path.join("espalier", "src", "[name].ts.mjs"),
      `export const description = "a file";
export const rule = \`R\`;
export async function lint(context) {
  await context.read();
}
`,
    );
    write(root, path.join("src", "a.ts"), "export const a = 1;\n");
    chmodSync(at, 0o000);

    const result = spawnSync(process.execPath, [cli, "lint", "--format", "jsonl"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.match(result.stdout, /"code":"read_failed"/);
    // Distinct from `read_ungoverned`, and the distinction is the useful part:
    // one says the espalier will not let you, the other that the filesystem
    // would not. The message names the path either way.
    assert.match(result.stdout, /src\/a\.ts/);
    assert.equal(result.status, 2);
  } finally {
    chmodSync(at, 0o600);
    rmSync(root, { recursive: true, force: true });
  }
});

for (const example of cases) {
  test(`${example.code}: ${example.what}`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "espalier-failure-"));
    try {
      if (example.config !== null) {
        writeFileSync(
          path.join(root, "espalier.config.yaml"),
          example.config ?? VALID_CONFIG,
          "utf8",
        );
      }
      mkdirSync(path.join(root, "espalier"), { recursive: true });
      for (const [at, contents] of Object.entries(example.espalier ?? {})) {
        write(root, path.join("espalier", at), contents);
      }
      for (const [at, contents] of Object.entries(example.files ?? {})) {
        write(root, at, contents);
      }

      const result = spawnSync(
        process.execPath,
        [cli, ...(example.args ?? ["lint"]), "--format", "jsonl"],
        { cwd: path.join(root, example.cwd ?? "."), encoding: "utf8" },
      );
      if (result.error) throw result.error;

      const failures = result.stdout
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((line) => line["kind"] === "failure");

      assert.deepEqual(
        failures.map((line) => line["code"]),
        [example.code],
        `stdout was:\n${result.stdout}${result.stderr}`,
      );
      // The exit code is the authority on whether the output means anything.
      assert.equal(result.status, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
