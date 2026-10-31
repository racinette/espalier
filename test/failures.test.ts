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
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(
  packageRoot,
  "dist",
  "src",
  "cli.js",
);
const api = pathToFileURL(path.join(packageRoot, "dist", "src", "api.js")).href;

const VALID_CONFIG = "root: espalier\nignoreFiles: []\nskip: []\n";

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
const INERT = 'export const description = "a file";\nexport const guidance = `Nothing.`;\nexport async function lint() {}\n';
const GROUPED = 'export const groups = { release: { by: ["a"], abstract: true, description: "a release", guidance: "" } };\n';
const DECLARE_GROUP = 'export const instanceOf = "[a=0+]_[b].ts.mjs";\nexport const description = "release 1";\nexport const guidance = "";\n';

function templated(definition: string): string {
  return `import { createTemplate } from ${JSON.stringify(api)};
export const description = "a generated file";
export const guidance = \`Generated.\`;
export async function lint() {}
export const template = ${definition};
`;
}

const cases: Case[] = [
  // Configuration. docs/CONFIG.MD.
  {
    what: "a config that is not YAML",
    code: "config_malformed",
    config: "version: 1\n  root: [unclosed\n",
  },
  {
    what: "a config that is valid YAML and not a mapping",
    code: "config_malformed",
    config: "- version\n- 1\n",
  },
  {
    what: "a key that does not exist — the typo this key exists for",
    code: "config_unknown_key",
    config: "root: espalier\nignoreFiles: []\nskip: []\nignoreFile: .gitignore\n",
  },
  {
    what: "no skip list",
    code: "config_missing_skip",
    config: "root: espalier\nignoreFiles: []\n",
  },
  {
    what: "no ignoreFiles list",
    code: "config_missing_ignore_files",
    config: "root: espalier\nskip: []\n",
  },
  {
    what: "a leftover pin",
    code: "config_unknown_key",
    config: "pin: 0.10.0\nroot: espalier\nignoreFiles: []\nskip: []\n",
  },
  {
    what: "a leftover version key",
    code: "config_unknown_key",
    config: "version: 1\nroot: espalier\nignoreFiles: []\nskip: []\n",
  },
  {
    what: "a skip pattern that would hide a rule module",
    code: "skip_hides_grammar",
    config: "root: espalier\nignoreFiles: []\nskip:\n  - \"*.mjs\"\n",
  },
  {
    what: "a key holding the wrong type",
    code: "config_invalid_value",
    config: "root: [espalier]\n",
  },
  {
    what: "a root that escapes the repository",
    code: "config_invalid_value",
    config: "root: ../elsewhere\n",
  },
  {
    // A heading is one line, so a name is one line. An empty one would head
    // every document with a bare `#`.
    what: "a name that is not a single line",
    code: "config_invalid_value",
    config: 'name: "a\\nb"\nroot: espalier\n',
  },
  {
    what: "a name that is empty",
    code: "config_invalid_value",
    config: 'name: "   "\nroot: espalier\n',
  },
  {
    what: "a root that is not there",
    code: "espalier_root_missing",
    config: "root: absent\nignoreFiles: []\nskip: []\n",
  },
  {
    // Normalized, not rejected — `./espalier/` is `espalier`, and
    // `config-root-spelling` pins that. What normalizes away to nothing is a
    // different matter: an espalier root equal to the repository root would
    // make every path invisible, which is not a configuration with a meaning.
    what: "a root that names the repository itself",
    code: "config_invalid_value",
    config: "root: .\n",
  },

  // The espalier tree. docs/MATCHING.MD.
  {
    what: "an unmatched bracket in a rule path",
    code: "malformed_placeholder",
    espalier: { "src/[name.ts.mjs": INERT },
  },
  {
    what: "a mask character outside the vocabulary",
    code: "malformed_placeholder",
    espalier: { "src/[seq=9+].ts.mjs": INERT },
  },
  {
    what: "two captures that could split a name two ways",
    code: "ambiguous_captures",
    espalier: { "src/[a]_[b].ts.mjs": INERT },
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
    what: "a constraint extension list repeating the same branch",
    code: "malformed_constraint_leaf",
    espalier: { "src/[...path]/no-fetch.{ts,ts}.mjs": INERT },
  },
  {
    what: "a file named by back-references declared an instance of a contract it can never match",
    code: "invalid_instance",
    espalier: {
      "src/[dir]/[name=0+].ts.mjs": INERT,
      "src/[dir]/{dir}x.ts.mjs": 'export const instanceOf = "[name=0+].ts.mjs";\n',
    },
  },
  {
    what: "a file named by back-references declared an instance where a narrower sibling could own its name",
    code: "invalid_instance",
    espalier: {
      "src/[dir]/[name].ts.mjs": INERT,
      "src/[dir]/[a]-x.ts.mjs": INERT,
      "src/[dir]/{dir}.ts.mjs": 'export const instanceOf = "[name].ts.mjs";\n',
    },
  },
  {
    what: "a directory named by a back-reference declared an instance",
    code: "invalid_instance",
    espalier: {
      "src/[dir]/[sub]/a.ts.mjs": INERT,
      "src/[dir]/{dir}/ESPALIER.mjs": 'export const instanceOf = "../[sub]";\n',
    },
  },
  {
    what: "overlapping structural extension unions with no narrower winner",
    code: "ambiguous_siblings",
    espalier: {
      "src/[file].{ts,d.ts}.mjs": INERT,
      "src/[name].{d.ts,tsx}.mjs": INERT,
    },
  },
  {
    what: "an extension-free constraint leaf without targets",
    code: "malformed_constraint_leaf",
    espalier: { "src/[...path]/registry.mjs": INERT },
  },
  {
    what: "an aggregate with neither selector",
    code: "malformed_constraint_leaf",
    espalier: { "src/[...path]/registry.mjs": `${INERT}export const aggregate = true;\n` },
  },
  {
    what: "groups on a static leaf, which has no captures",
    code: "module_invalid_export",
    espalier: { "src/main.ts.mjs": `${INERT}export const groups = { all: { by: [], description: "all", guidance: "", lint() {} } };\n` },
  },
  {
    what: "a grouping naming a capture the path does not declare",
    code: "module_invalid_export",
    espalier: { "src/[name].ts.mjs": `${INERT}export const groups = { kind: { by: ["kind"], description: "a kind", guidance: "", lint() {} } };\n` },
  },
  {
    what: "a grouping naming every capture, so each group is one file",
    code: "module_invalid_export",
    espalier: { "src/[name].ts.mjs": `${INERT}export const groups = { one: { by: ["name"], description: "one", guidance: "", lint() {} } };\n` },
  },
  {
    what: "alternatives nested inside alternatives",
    code: "malformed_placeholder",
    espalier: { "src/[a]{x,{y,z}}.ts.mjs": INERT },
  },
  {
    what: "an alternative written twice",
    code: "malformed_placeholder",
    espalier: { "src/[a]{x,x}.ts.mjs": INERT },
  },
  {
    what: "alternatives without a placeholder, naming several files",
    code: "extension_list_on_structural_leaf",
    espalier: { "src/README{,.local}.MD.mjs": INERT },
  },
  {
    what: "two alternatives that can match one name",
    code: "ambiguous_captures",
    espalier: { "src/{[x]-a,b-[x]}.ts.mjs": INERT },
  },
  {
    what: "a grouping by a capture an alternative leaves out",
    code: "module_invalid_export",
    espalier: { "src/[t=a+]{,.[role=a+]}.sql.mjs": `${INERT}export const groups = { g: { by: ["role"], description: "g", guidance: "" } };\n` },
  },
  {
    what: "a grouping whose abstract is not a boolean",
    code: "module_invalid_export",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}${GROUPED.replace("abstract: true", 'abstract: "yes"')}` },
  },
  {
    what: "an abstract grouping by no captures, whose one group has no name",
    code: "module_invalid_export",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}export const groups = { all: { by: [], abstract: true, description: "all", guidance: "" } };\n` },
  },
  {
    what: "a group declared beside a rule that has no groupings",
    code: "invalid_instance",
    espalier: { "src/[a=0+]_[b].ts.mjs": INERT, "src/1_[b].ts.mjs": DECLARE_GROUP },
  },
  {
    what: "a group declared against a contract that is not beside it",
    code: "invalid_instance",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}${GROUPED}`, "src/1_[b].ts.mjs": DECLARE_GROUP.replace("[a=0+]_[b].ts.mjs", "[c].ts.mjs") },
  },
  {
    what: "a group declared at a name that changes more than the captures",
    code: "invalid_instance",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}${GROUPED}`, "src/1-[b].ts.mjs": DECLARE_GROUP },
  },
  {
    what: "a group declared with a value its placeholder does not admit",
    code: "invalid_instance",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}${GROUPED}`, "src/x_[b].ts.mjs": DECLARE_GROUP },
  },
  {
    what: "a group declared by captures no grouping groups by",
    code: "invalid_instance",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}${GROUPED}`, "src/[a=0+]_users.ts.mjs": DECLARE_GROUP },
  },
  {
    what: "frozen on a grouping, which holds every file of its rule",
    code: "module_invalid_export",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}${GROUPED.replace("abstract: true", "frozen: true")}` },
  },
  {
    what: "a grouping whose sealed is not a boolean",
    code: "module_invalid_export",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}${GROUPED.replace("abstract: true", 'sealed: "yes"')}` },
  },
  {
    what: "two declared groups that could share a file, one frozen and one reopened",
    code: "conflicting_frozen",
    espalier: {
      "src/[a=0+]_[b].ts.mjs": `${INERT}export const groups = { release: { by: ["a"], description: "r", guidance: "" }, name: { by: ["b"], description: "n", guidance: "" } };\n`,
      "src/1_[b].ts.mjs": `${DECLARE_GROUP}export const frozen = true;\n`,
      "src/[a=0+]_users.ts.mjs": `${DECLARE_GROUP}export const frozen = false;\n`,
    },
  },
  {
    what: "a template on a declared group, which is a set of files",
    code: "module_invalid_export",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}${GROUPED}`, "src/1_[b].ts.mjs": `${DECLARE_GROUP}export const template = { schema: null, render() { return ""; } };\n` },
  },
  {
    what: "literalName that is not a boolean",
    code: "module_invalid_export",
    espalier: { "pages/[id].tsx.mjs": `${INERT}export const literalName = "yes";\n` },
  },
  {
    what: "literalName on a filename with nothing to take literally",
    code: "module_invalid_export",
    espalier: { "src/main.ts.mjs": `${INERT}export const literalName = true;\n` },
  },
  {
    what: "literalName on a constraint, whose filename is a selector",
    code: "module_invalid_export",
    espalier: { "src/[...path]/no-as-any.ts.mjs": `${INERT}export const literalName = true;\n` },
  },
  {
    what: "literalName on a directory with nothing to take literally",
    code: "malformed_node_description",
    espalier: { "src/ESPALIER.mjs": "export const literalName = true;\n" },
  },
  {
    what: "abstract that is not a boolean",
    code: "module_invalid_export",
    espalier: { "src/[name].ts.mjs": `${INERT}export const abstract = "yes";\n` },
  },
  {
    what: "abstract on a static leaf, which has nothing to instantiate",
    code: "module_invalid_export",
    espalier: { "src/main.ts.mjs": `${INERT}export const abstract = true;\n` },
  },
  {
    what: "abstract on a constraint",
    code: "module_invalid_export",
    espalier: { "src/[...path]/no-as-any.ts.mjs": `${INERT}export const abstract = true;\n` },
  },
  {
    what: "abstract on a static directory",
    code: "malformed_node_description",
    espalier: { "src/ESPALIER.mjs": "export const abstract = true;\n", "src/main.ts.mjs": INERT },
  },
  {
    what: "abstract on a dynamic directory that declares nothing",
    code: "malformed_node_description",
    espalier: { "[area]/ESPALIER.mjs": "export const abstract = true;\n", "main.ts.mjs": INERT },
  },
  {
    what: "abstract on the espalier root",
    code: "malformed_node_description",
    espalier: { "ESPALIER.mjs": "export const abstract = true;\n", "main.ts.mjs": INERT },
  },
  {
    what: "literalName on the espalier root, which has no name",
    code: "malformed_node_description",
    espalier: { "ESPALIER.mjs": "export const literalName = true;\n" },
  },
  {
    what: "two groupings by the same captures",
    code: "module_invalid_export",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}export const groups = { x: { by: ["a"], description: "x", guidance: "", lint() {} }, y: { by: ["a"], description: "y", guidance: "", lint() {} } };\n` },
  },
  {
    what: "a grouping whose lint is not a function",
    code: "module_invalid_export",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}export const groups = { x: { by: ["a"], description: "x", guidance: "", lint: 1 } };\n` },
  },
  {
    what: "a filename extension and targets together",
    code: "module_invalid_export",
    espalier: { "src/[...path]/registry.json.mjs": `${INERT}export const targets = ["**/*.json"];\n` },
  },
  {
    what: "an aggregate filename extension and targets together",
    code: "module_invalid_export",
    espalier: { "src/[...path]/registry.json.mjs": `${INERT}export const aggregate = true;\nexport const targets = ["**/*.json"];\n` },
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
    what: "a rule guidance callback that throws before any source exists",
    code: "rule_guidance_failed",
    espalier: {
      "src/[name].ts.mjs": 'export const description = "file"; export function guidance() { throw new Error("bad prose"); } export function lint() {}',
    },
  },
  {
    what: "a constraint guidance callback that rejects before any source exists",
    code: "rule_guidance_failed",
    espalier: {
      "[...files]/check.ts.mjs": 'export async function guidance() { throw new Error("bad prose"); } export function lint() {}',
    },
  },
  {
    what: "a rule guidance callback that returns a non-string",
    code: "module_invalid_export",
    espalier: {
      "src/[name].ts.mjs": 'export const description = "file"; export async function guidance() { return 42; } export function lint() {}',
    },
  },
  {
    what: "a file description callback that rejects before any source exists",
    code: "rule_guidance_failed",
    espalier: { "src/[name].ts.mjs": "export async function description() { throw new Error(\"bad label\"); } export const guidance = \"Text\"; export function lint() {}" },
  },
  {
    what: "a file description callback that returns a non-string before any source exists",
    code: "module_invalid_export",
    espalier: { "src/[name].ts.mjs": "export async function description() { return 42; } export const guidance = \"Text\"; export function lint() {}" },
  },
  {
    what: "a constraint description callback that rejects before any source exists",
    code: "rule_guidance_failed",
    espalier: { "[...files]/check.ts.mjs": "export async function description() { throw new Error(\"bad label\"); } export const guidance = \"Text\"; export function lint() {}" },
  },
  {
    what: "a constraint description callback that returns a non-string before any source exists",
    code: "module_invalid_export",
    espalier: { "[...files]/check.ts.mjs": "export async function description() { return 42; } export const guidance = \"Text\"; export function lint() {}" },
  },
  {
    what: "a directory description callback that rejects before any source exists",
    code: "malformed_node_description",
    espalier: { "src/ESPALIER.mjs": "export async function description() { throw new Error(\"bad label\"); }" },
  },
  {
    what: "a directory description callback that returns a non-string before any source exists",
    code: "malformed_node_description",
    espalier: { "src/ESPALIER.mjs": "export async function description() { return 42; }" },
  },
  {
    what: "a `guidance` that is neither a string nor a function",
    code: "module_invalid_export",
    espalier: { "src/[name].ts.mjs": "export const guidance = 42;\n" },
  },
  {
    what: "`rule`, the old name of `guidance`",
    code: "module_invalid_export",
    espalier: { "src/main.ts.mjs": `export const description = "a file";\nexport const ${"rule"} = \`R\`;\n` },
  },
  {
    what: "a grouping still saying `rule`",
    code: "module_invalid_export",
    espalier: { "src/[a=0+]_[b].ts.mjs": `${INERT}export const groups = { x: { by: ["a"], description: "x", rule: "" } };\n` },
  },
  {
    what: "a `lint` that is not a function",
    code: "module_invalid_export",
    espalier: {
      "src/[name].ts.mjs": 'export const description = "a file";\nexport const guidance = `R`;\nexport const lint = true;\n',
    },
  },
  {
    what: "a template-shaped object not created by the public factory",
    code: "module_invalid_export",
    espalier: {
      "src/[name].ts.mjs": `${INERT}export const template = { schema: null, render() { return ""; } };\n`,
    },
  },
  {
    what: "a template exported from a constraint",
    code: "module_invalid_export",
    espalier: {
      "src/[name].ts.mjs": INERT,
      "[...path]/generated.ts.mjs": `import { createTemplate } from ${JSON.stringify(api)};
export const guidance = \`Generated.\`;
export async function lint() {}
export const template = createTemplate(() => "");
`,
    },
  },
  {
    what: "a `description` that is present and not a string",
    code: "module_invalid_export",
    espalier: {
      "src/[name].ts.mjs": INERT,
      "[...path]/no-x.ts.mjs":
        "export const description = 42;\nexport const guidance = `R`;\nexport async function lint() {}\n",
    },
  },
  {
    what: "a `referenceImplementation` that is not a string",
    code: "module_invalid_export",
    espalier: {
      "src/[name].ts.mjs":
        'export const description = "a file";\nexport const referenceImplementation = 1;\nexport const guidance = `R`;\nexport async function lint() {}\n',
    },
  },
  {
    what: "a removed `example` export",
    code: "module_invalid_export",
    espalier: {
      "src/[name].ts.mjs": `${INERT}export const example = "src/reference.ts";\n`,
    },
  },
  {
    what: "a missing reference implementation",
    code: "invalid_reference_implementation",
    espalier: {
      "src/[name].ts.mjs":
        `${INERT}export const referenceImplementation = "src/missing.ts";\n`,
    },
  },
  {
    what: "a reference implementation excluded from governance",
    code: "invalid_reference_implementation",
    espalier: {
      "src/[name].ts.mjs":
        `${INERT}export const referenceImplementation = "src/reference.ts";\n`,
    },
    files: {
      ".espalierignore": "src/reference.ts\n",
      "src/reference.ts": "export {};\n",
    },
  },
  {
    what: "a reference implementation owned by a more specific rule",
    code: "invalid_reference_implementation",
    espalier: {
      "src/[name].ts.mjs":
        `${INERT}export const referenceImplementation = "src/special.ts";\n`,
      "src/special.ts.mjs": INERT,
    },
    files: { "src/special.ts": "export {};\n" },
  },
  {
    what: "a constraint reference implementation excluded by its targets",
    code: "invalid_reference_implementation",
    espalier: {
      "src/[name].ts.mjs": INERT,
      "[...path]/no-x.mjs": `export const guidance = \`No x.\`;
export const targets = ["src/allowed.ts"];
export const referenceImplementation = "src/reference.ts";
export async function lint() {}
`,
    },
    files: { "src/reference.ts": "export {};\n" },
  },
  {
    what: "an `optional` that is not a boolean",
    code: "module_invalid_export",
    espalier: {
      "src/client.ts.mjs":
        'export const description = "a file";\nexport const optional = "yes";\nexport const guidance = `R`;\nexport async function lint() {}\n',
    },
  },
  {
    what: "an unobserved implementation dependency that escapes the repository",
    code: "module_invalid_export",
    espalier: {
      "src/[name].ts.mjs":
        'export const description = "a file";\nexport const unobservedImplementationDependencies = ["../outside.wasm"];\nexport const guidance = `R`;\nexport async function lint() {}\n',
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
    what: "the removed build.inline setting",
    code: "config_unknown_key",
    config: "root: espalier\nignoreFiles: []\nskip: []\nbuild:\n  inline: true\n",
  },
  {
    what: "an Espalier-guidance setting that is not a boolean",
    code: "config_invalid_value",
    config: "root: espalier\nignoreFiles: []\nskip: []\nbuild:\n  espalierGuidance: sometimes\n",
  },

  // Addons. docs/CONFIG.MD "addons".
  {
    what: "an addons module that is not there",
    code: "addons_import_failed",
    config: "root: espalier\nignoreFiles: []\nskip: []\naddons: missing.addons.mjs\n",
  },
  {
    what: "an addons module exporting a non-function setup",
    code: "addons_invalid_export",
    config: "root: espalier\nignoreFiles: []\nskip: []\naddons: espalier.addons.mjs\n",
    files: { "espalier.addons.mjs": "export const setup = 42;\n" },
  },
  {
    what: "an addons module with malformed implementation dependencies",
    code: "addons_invalid_export",
    config: "root: espalier\nignoreFiles: []\nskip: []\naddons: espalier.addons.mjs\n",
    files: {
      "espalier.addons.mjs":
        'export const unobservedImplementationDependencies = "worker.wasm";\nexport function setup() { return {}; }\n',
    },
  },
  {
    what: "an addons setup that throws — nothing is linted",
    code: "addons_setup_failed",
    config: "root: espalier\nignoreFiles: []\nskip: []\naddons: espalier.addons.mjs\n",
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
export const guidance = \`R\`;
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
    what: "create, given a path no structural rule declares",
    code: "invalid_create_target",
    espalier: { "src/[name].ts.mjs": templated('createTemplate(() => "")') },
    args: ["create", "elsewhere/new.ts"],
  },
  {
    what: "create, missing one required template flag",
    code: "invalid_template_arguments",
    espalier: {
      "src/[name].ts.mjs": templated(
        'createTemplate({ name: { type: "string", required: true, description: "Name" } }, ({ name }) => name)',
      ),
    },
    args: ["create", "src/new.ts"],
  },
  {
    what: "create, whose target already exists",
    code: "create_target_exists",
    espalier: { "src/[name].ts.mjs": templated('createTemplate(() => "generated")') },
    files: { "src/existing.ts": "preserve me\n" },
    args: ["create", "src/existing.ts"],
  },
  {
    what: "create, whose template renderer throws",
    code: "template_threw",
    espalier: {
      "src/[name].ts.mjs": templated(
        'createTemplate(() => { throw new Error("cannot render"); })',
      ),
    },
    args: ["create", "src/new.ts"],
  },
  {
    what: "create, whose template renderer returns a non-string",
    code: "template_invalid_result",
    espalier: { "src/[name].ts.mjs": templated("createTemplate(() => 42)") },
    args: ["create", "src/new.ts"],
  },
  {
    what: "create, whose parent path is a file",
    code: "create_write_failed",
    espalier: {
      "blocked/[name].ts.mjs": templated('createTemplate(() => "generated")'),
    },
    files: { blocked: "not a directory\n" },
    args: ["create", "blocked/new.ts"],
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
export const guidance = \`R\`;
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

      const args = example.args ?? ["lint"];
      const create = args[0] === "create";
      const result = spawnSync(process.execPath, [cli, ...args, ...(create ? [] : ["--format", "jsonl"])], {
        cwd: path.join(root, example.cwd ?? "."),
        encoding: "utf8",
      });
      if (result.error) throw result.error;

      if (create) {
        assert.match(
          result.stdout,
          new RegExp(`\\(${example.code}\\)\\n$`),
          `stdout was:\n${result.stdout}${result.stderr}`,
        );
      } else {
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
      }
      // The exit code is the authority on whether the output means anything.
      assert.equal(result.status, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
