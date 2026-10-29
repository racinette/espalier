# Programmatic API

`espalier` is a library as well as a CLI. The CLI writes issues to a stream and returns an exit code; the library returns the issues.

That is the whole difference, and it is what makes rule modules testable. There is no `espalier test` command and there will not be one: assertions, fixtures, reporting and watch mode are what a test framework already does, and reimplementing them inside a linter would produce a worse version of `node:test` with none of the tooling around it. What only `espalier` can supply is the lint context, so that is what it supplies.

```js
import {
  check,
  createAggregateLinter,
  createGroupLinter,
  createLinter,
  createTemplate,
  runAggregate,
  runGroup,
  runRule,
} from "espalier";
```

Four entry points answer four questions. **Does this repository conform?** is
`check`. **Does this per-file rule catch what it was written to catch?** is
`runRule`. **Does this collective rule analyze its group correctly?** is
`runAggregate`. **Does this grouping judge its group correctly?** is
`runGroup`.

`createTemplate` is the definition helper rule modules use for the separate
`espalier create` command; it performs no filesystem operation itself.

`createLinter`, `createAggregateLinter` and `createGroupLinter` are identity
helpers that provide contextual types to rule callbacks. They do not run a rule or change its
runtime contract; their complete type surface is documented in
[TYPES.MD](TYPES.MD#typed-linter-helpers).

## `createTemplate`

Defines the optional `template` export on a structural rule module. With a
schema, its keys are inferred into the renderer argument:

```js
import { createTemplate } from "espalier";

export const template = createTemplate(
  {
    name: {
      type: "string",
      required: true,
      description: "Name to place in the generated source",
      examples: ["answer", "result"],
    },
    exported: {
      type: "flag",
      description: "Export the declaration",
      includeInExample: true,
    },
  },
  ({ name, exported }, { path }) =>
    `${exported ? "export " : ""}const name = ${JSON.stringify(name)}; // ${path}\n`,
);
```

Without template arguments, omit the schema. The renderer receives only the
concrete path and structural captures:

```js
export const template = createTemplate(
  ({ captures }) => `export const name = ${JSON.stringify(captures.name)};\n`,
);
```

Both renderers may return either a string or `Promise<string>`, and may ignore
the context when it is unnecessary. `examples` is documentation metadata used
to render an invocation; it never acts as a default. The complete schema
contract and its CLI mapping are specified in
[TYPES.MD](TYPES.MD#template); path selection and write safety are specified in
[`espalier create`](cli/create/README.MD).

## `check(options)`

Runs the same lint the CLI runs, over a real repository, and returns what it found.

```js
import { check } from "espalier";
import { test } from "node:test";
import assert from "node:assert/strict";

test("the repository conforms", async () => {
  const issues = await check({ cwd: "." });
  assert.deepEqual(issues.filter((issue) => issue.severity === "error"), []);
});
```

| Option | Default | |
|---|---|---|
| `cwd` | required | where config discovery starts |
| `config` | discovered | an explicit config file path |
| `paths` | every visible file | limit the run to a subtree |
| `rule` | every rule | run one rule module only, by espalier-relative path |
| `jobs` | each project's `lint.jobs`, otherwise `"auto"` | positive safe integer worker limit, or automatic sizing; an explicit value overrides nested projects too |

The package exports `Jobs` and `PrepareContext` types for worker limits and
addon preparation:

```ts
type Jobs = number | "auto";
interface PrepareContext {
  files(pattern: string): Promise<string[]>;
  read(path: string): Promise<string>;
}
```

`PrepareContext` reads the full governed project snapshot, including during
scoped checks. It has no current file or `emit`; see [addons](CONFIG.MD#addons).

Returns `Promise<Issue[]>` in the order the runner produced them. Like the CLI,
it reports identical findings once per lint invocation; findings from separate
invocations remain separate. See [lint](cli/lint/README.MD#ordering-and-duplicates).

Child espaliers are visited exactly as the CLI visits them, and their issues arrive in the same array with paths relative to the outer project root and `espalier` naming the one that reported them. A failure inside a child raises, like any other, once the runs that could still complete have — the first in path order, with the child's directory on the front of the message.

Issue arrival order is unspecified, including across repeated calls. Compare
findings independently of order when testing equivalent runs.

Every selected rule runs on each call. `cache` is not a supported option.
`jobs` controls the worker pool; see [lint](cli/lint/README.MD#parallel-execution).

Each check loads fresh ES modules in the coordinator and starts fresh lint
workers. Within a worker, rules share imported helpers and its addon instance.
Separate workers have separate module instances. CommonJS preparation helpers
in the coordinator retain Node's process-level module caching.

There is no exit code and no partial-run warning. Both are ways of saying something to a person through a stream; a caller holding the issues can decide for itself. Everything else is identical, including `addons` preparation, worker setup and disposal: `check` is the runner with a collecting reporter, not a second implementation.

An operational failure — an espalier that does not compile, a rule that throws, an issue with no `code` — raises an `OperationalError` carrying the `code` from [ERRORS.MD](ERRORS.MD). It is thrown rather than returned because it is not a finding about the repository.

## `runRule(module, context)`

Runs one rule module's `lint` against a context you supply, without discovering
configuration or loading a repository. Computed prose and descriptions require
an explicit guidance context, described below.

```js
import { runRule } from "espalier";
import * as rule from "../espalier/components/[name].tsx.mjs";

test("a component must be named after its file", async () => {
  const issues = await runRule(rule, {
    path: "components/Button.tsx",
    captures: { name: "Button" },
    tree: { "components/Button.tsx": "export default function Other() {}" },
  });

  assert.deepEqual(issues.map((issue) => issue.code), ["name_mismatch"]);
});
```

The first argument is the module — whatever `import` gave you. It is not looked up, compiled, or matched against the espalier: `runRule` is for testing the `lint` function, and a module's position in the tree is the matcher's business, pinned by conformance fixtures rather than by unit tests.

### The context

| Field | Default | |
|---|---|---|
| `path` | required | the file being linted |
| `pattern` | `path` | the declaration recorded on issues |
| `captures` | `{}` | placeholder values |
| `tree` | `{}` | a virtual repository: path → contents |
| `read` | derived from `tree` | override for an exotic reader |
| `files` | derived from `tree` | override for an exotic lister |
| `addons` | `{}` | whatever the rule expects to find there |
| `rule` | `null` | the module path to record on emitted issues |
| `guidance` | absent | explicit `RuleGuidanceContext`, required when the module's `guidance` or `description` is a function |

`tree` is the common case and backs both `read` and `files`. Reading a path it does not hold fails with `read_failed`; a real run instead uses `read_ungoverned` for a path absent from its governed snapshot. Globbing matches its keys with the same matcher `context.files` uses, and returns them sorted. Supply `read` or `files` directly when a test needs something a map cannot express — a reader that counts its calls, a lister that returns thousands of paths without holding their contents.

Nothing is inferred from `path`. A rule reading a file it was not given gets `read_failed` rather than an empty string, because a test that silently linted nothing is the failure mode this exists to prevent.

For a function-valued `guidance` or `description`, supply
`guidance: { config, pattern, path, captures }` with the declaration context you
want to test. The helper evaluates each callback once before lint, using an
isolated copy of that context. It does not discover
configuration or infer declaration bindings from the lint match. Omitting
`guidance` for a function-valued `guidance` or `description` fails with `module_invalid_export`.
Callback failures and invalid results use the same errors as compilation.
String prose and descriptions need no guidance context. A module with no
`lint` is accepted and returns no issues; its prose is still rendered and
validated, which is the case for `runAggregate` and `runGroup` too.

### What comes back

The same `Issue` objects `check` returns, with the same fields, so an assertion
written against one transfers to the other. `pattern`, `captures` and `rule`
echo the context; `guidance` and `description` contain the module's rendered
strings, and `referenceImplementation` comes from its export. The API includes
the description and reference fields even though
[JSONL lint issues](cli/lint/README.MD#issues) omit them.

`emit` is the runner's own, with the same validation and per-invocation
deduplication. A rule emitting an issue with no `code`, an unknown `severity`, or an absolute `path` fails here for the same reason and with the same code it would fail for in production — which is most of the value of testing through this rather than by calling `lint` with a hand-written stub.

A `lint` that throws throws out of `runRule`, wrapped as `rule_threw`. The real run treats that as a bug in the rule rather than a finding, and so does this; a test framework will report it as the error it is.

`runRule` refuses a module exporting `aggregate = true`; a test that silently
turned a collective rule into a one-file rule would prove the wrong behavior.

If the module exports `targets`, `runRule` validates the export but does not
perform repository matching. The supplied context is already one selected
invocation; repository-level selector behavior belongs to `check` and `lint`.

### Shared compiler tests

`runRule`, `runAggregate` and `runGroup` use the addon object you supply. They never call
`prepare` or `setup`, start workers, or dispose the supplied object. Give each
fixture its own service and release it even if an assertion fails:

```js
import { setup } from "../analysis/addons.mjs";

const addons = await setup();
try {
  const issues = await runRule(rule, { path, tree: tinyTree, addons });
  assert.deepEqual(issues, []);
} finally {
  addons[Symbol.dispose]();
}
```

This example assumes setup needs no prepared data and returns a synchronous
disposer. Supply prepared data yourself when the addon requires it, and use
`await addons[Symbol.asyncDispose]()` for an asynchronous disposer.
These tests run in the caller's process; use `check` to exercise preparation,
worker isolation, and structured-clone transfer of prepared data and findings.

Keep semantic counterexamples small: only the imports and declarations needed
to establish the behavior. A few real-repository tests then prove ownership,
selection, and creation. Changing a static filename needs a matching test
that rejects the former name and a creation test that produces the declared
name; `runRule` cannot establish either.

`espalier examples compiler-addon` supplies both kinds of executable test,
including changed snapshots, rule order, separate service instances, and
fresh findings after source and implementation changes. Test semantic reuse before measuring
whole-repository performance; copying the entire application into every
counterexample repeats compiler work without establishing these boundaries.

## `runAggregate(module, context)`

Runs one aggregate constraint over a complete match set supplied by the test:

```js
import { runAggregate } from "espalier";
import * as rule from "../espalier/fixtures/[...fixture]/frequency.mjs";

const issues = await runAggregate(rule, {
  matches: [
    { path: "fixtures/a/case.json", captures: { fixture: ["a"] } },
    { path: "fixtures/b/case.json", captures: { fixture: ["b"] } },
  ],
  patterns: ["fixtures/**/*.json"],
  at: "fixtures/",
  tree: {
    "fixtures/a/case.json": "[]",
    "fixtures/b/case.json": "[]",
  },
});
```

| Field | Default | |
|---|---|---|
| `matches` | required | complete `{ path, captures }` set; sorted before `lint` runs |
| `patterns` | `["**/*"]` | admission globs given to `lint` |
| `at` | `.` | default issue path |
| `pattern` | `at` | the declaration recorded on issues |
| `tree` | `{}` | virtual repository backing `read` and `files` |
| `read` | derived from `tree` | reader requiring an explicit path |
| `files` | derived from `tree` | additional visible-file queries |
| `addons` | `{}` | shared resources expected by the rule |
| `rule` | `null` | module path recorded on issues |
| `guidance` | absent | explicit `RuleGuidanceContext` for function-valued prose or descriptions; use `path: null` for a constraint |

The module must export `aggregate = true`. Emitted issues have empty top-level
`captures`, because no one match represents the group; a rule that needs to
report per-match capture data puts it in `metadata` or attaches the issue to a
specific path.

As with `runRule`, `runAggregate` validates `targets` but treats the supplied
sorted match set as already selected.

The unsupported `unobservedImplementationDependencies` export is rejected by
all three rule-testing functions and by compilation. All checks evaluate current
inputs; there are no persistent dependency declarations.

## `runGroup(module, context)`

Runs one grouping of a dynamic structural rule over the members supplied by
the test:

```js
import { runGroup } from "espalier";
import * as rule from "../espalier/migrations/[num=0000][ord=00]_[group=a+].sql.mjs";

const issues = await runGroup(rule, {
  group: "set",
  captures: { num: "0002", group: "users" },
  matches: [
    { path: "migrations/000201_users.sql", captures: { num: "0002", ord: "01", group: "users" } },
    { path: "migrations/000203_users.sql", captures: { num: "0002", ord: "03", group: "users" } },
  ],
  at: "migrations/",
});
```

| Field | Default | |
|---|---|---|
| `group` | required | the grouping's name in `groups` |
| `captures` | `{}` | the shared `by` values, recorded on issues and given to `lint` |
| `matches` | required | the members as `{ path, captures }`; sorted before `lint` runs |
| `at` | `.` | default issue path, normally the group's directory with a trailing slash |
| `pattern` | `at` | the declaration recorded on issues |
| `tree` | `{}` | virtual repository backing `read` and `files` |
| `read` | derived from `tree` | reader requiring an explicit path |
| `files` | derived from `tree` | additional visible-file queries |
| `addons` | `{}` | shared resources expected by the rule |
| `rule` | `null` | module path recorded on issues |

The module must export `groups` with the named grouping. Issues carry the
grouping's name as `group` and the grouping's `guidance` and `description`, as
they do in a lint run. Given a module that declares one group with
`instanceOf`, `runGroup` runs that module's own `lint` instead, and its issues
carry the declaration's `guidance` and `description`. `runGroup` does not check `by` against the module's
path, which it cannot see; compilation does.

## Coverage

`espalier` does not report which rules have tests. A rule with no test is a module nothing imports, and every language already has tooling that finds those — the same tooling the rest of the project's coverage runs through. A bespoke report would only cover rule modules, only when someone remembered to run it, and would be one more thing to keep true.

## Computed guidance and inheritance

`DirectoryGuidanceContext` types a directory module's `guidance` and
`description` functions. It contains an isolated `config` snapshot, the authored directory `pattern`, a
concrete `path` when known (otherwise null), and known `captures`. Both functions may
return a string or a promise of one. See the
[directory module contract](TYPES.MD#directory-modules) for an executable
example, evaluation timing, and path semantics.

`RuleGuidanceContext` types a file rule or constraint's `guidance` and `description`
functions. It has the same four fields, with declaration-specific semantics described in
[guidance](TYPES.MD#guidance). Repository commands render each declaration once
before distributing lint jobs; workers receive the rendered string. Standalone
`runRule` and `runAggregate` callers supply that context explicitly through
`guidance`.

`check` resolves and checks complete inheritance chains. `runRule` renders the
supplied module's computed text and tests its own `lint` function; it does not
load or resolve `instanceOf`. Use `check`
against a fixture to verify inherited structure, requiredness, and base checks.
