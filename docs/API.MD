# Programmatic API

`espalier` is a library as well as a CLI. The CLI writes issues to a stream and returns an exit code; the library returns the issues.

That is the whole difference, and it is what makes rule modules testable. There is no `espalier test` command and there will not be one: assertions, fixtures, reporting and watch mode are what a test framework already does, and reimplementing them inside a linter would produce a worse version of `node:test` with none of the tooling around it. What only `espalier` can supply is the lint context, so that is what it supplies.

```js
import { check, runRule } from "espalier";
```

Two entry points, because there are two questions. **Does this repository conform?** is `check`. **Does this rule catch what it was written to catch?** is `runRule`.

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
| `cache` | `true` | `false` is `--no-cache`: re-run every rule, and write nothing |

Returns `Promise<Issue[]>` — every issue, in the order the runner produced them, deduplicated no more than the CLI deduplicates them, which is not at all.

Child espaliers are visited exactly as the CLI visits them, and their issues arrive in the same array with paths re-rooted to `cwd` and `espalier` naming the one that reported them. A failure inside a child raises, like any other, once the runs that could still complete have — the first in path order, with the child's directory on the front of the message.

The cache is read and written exactly as the CLI reads and writes it, in the same place. A caller that wants a cold run for its own reasons passes `cache: false`.

There is no exit code and no partial-run warning. Both are ways of saying something to a person through a stream; a caller holding the issues can decide for itself. Everything else is identical, including `addons` setup and disposal: `check` is the runner with a collecting reporter, not a second implementation.

An operational failure — an espalier that does not compile, a rule that throws, an issue with no `code` — raises an `OperationalError` carrying the `code` from [ERRORS.MD](ERRORS.MD). It is thrown rather than returned because it is not a finding about the repository.

## `runRule(module, context)`

Runs one rule module's `lint` against a context you supply. No config, no espalier tree, no repository on disk.

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
| `pattern` | `path` | the glob that matched it |
| `captures` | `{}` | placeholder values |
| `tree` | `{}` | a virtual repository: path → contents |
| `read` | derived from `tree` | override for an exotic reader |
| `files` | derived from `tree` | override for an exotic lister |
| `addons` | `{}` | whatever the rule expects to find there |
| `rule` | `null` | the module path to record on emitted issues |

`tree` is the common case and backs both `read` and `files`. Reading a path it does not hold fails with `read_failed`, exactly as reading a missing file does in a real run; globbing matches its keys with the same matcher `context.files` uses, and returns them sorted. Supply `read` or `files` directly when a test needs something a map cannot express — a reader that counts its calls, a lister that returns thousands of paths without holding their contents.

Nothing is inferred from `path`. A rule reading a file it was not given gets `read_failed` rather than an empty string, because a test that silently linted nothing is the failure mode this exists to prevent.

### What comes back

The same `Issue` objects `check` returns, with the same fields, so an assertion written against one transfers to the other. `pattern`, `captures` and `rule` echo the context; `ruleText`, `description` and `example` come off the module.

`emit` is the runner's own, with the runner's validation. A rule emitting an issue with no `code`, an unknown `severity`, or an absolute `path` fails here for the same reason and with the same code it would fail for in production — which is most of the value of testing through this rather than by calling `lint` with a hand-written stub.

A `lint` that throws throws out of `runRule`, wrapped as `rule_threw`. The real run treats that as a bug in the rule rather than a finding, and so does this; a test framework will report it as the error it is.

## Coverage

`espalier` does not report which rules have tests. A rule with no test is a module nothing imports, and every language already has tooling that finds those — the same tooling the rest of the project's coverage runs through. A bespoke report would only cover rule modules, only when someone remembered to run it, and would be one more thing to keep true.
