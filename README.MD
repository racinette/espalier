# espalier

> _Espalier (n.):_ the horticultural practice of training a tree to grow into a deliberate, predetermined form against a supporting structure. The tree grows freely, but into the shape the gardener intended.

`espalier` is an architecture compiler for agent-driven software development.

It takes a single source-of-truth description of how a project should be shaped — where code goes, what it looks like, how it's written — and provides the two parts of a development loop:

- **documentation** placed where agent tools already look, describing what belongs where and how it should be written
- **deterministic validation** that catches drift when it happens

Both derive from the same rule files. The guidance states the rules before a change; the linter runs their checks afterwards.

## The problem

Coding agents produce technically correct code. They struggle to produce _architecturally consistent_ code over long execution paths.

Even with detailed prompts and carefully written instructions, context dilutes over time. A button component that was supposed to live in `components/buttons/` ends up in `lib/ui/`. A new endpoint follows a pattern that doesn't match any of the existing ones. An import sneaks across a module boundary that's supposed to be closed. None of this is _wrong_ in the sense that the linter or the type checker would catch — but it gradually erodes the shape of the codebase.

The usual response is to write better prompts, longer rule files, more detailed architectural docs. These help, but they share a structural problem: they are _guidance only_. There is no mechanism that closes the loop between "the agent was told what to do" and "the agent actually did it." When the guidance fails, nothing notices.

`espalier` closes that loop.

## How it works

A project defines its intended architecture as a structured tree of rule files:

```text
espalier
├─ components
│  ├─ buttons
│  │  └─ [button].tsx.mjs
│  ├─ dropdowns
│  │  └─ [dropdown].tsx.mjs
│  └─ layouts
│     └─ [layout].tsx.mjs
├─ models
│  └─ [domain].ts.mjs
├─ endpoints
│  └─ [endpoint].ts.mjs
├─ clients
│  └─ [apiProviderDirectory]
│     └─ [apiProviderImplementation].ts.mjs
└─ main.ts.mjs
```

Each structural rule file in this tree declares:

- a **content description** — what kind of file this represents
- a **rule** — the natural-language conventions that file must follow
- a **lint function** — the deterministic check that verifies adherence
- optionally, a **template** — a typed, documented way to create that kind of file

From this single source, `espalier` produces two standing surfaces and an
optional construction entry point:

**Documentation**, written into the repository by `espalier build`:

> Espalier places generated guidance at stable points in the repository tree. Each `AGENTS.MD` maps the structure below it, stopping where another generated document takes over, then describes the rules placed there. A reader starts at the root and follows the nearest generated document as it moves into a subtree.

**Linters**, run deterministically against the working tree by `espalier lint`:

> After the agent writes or edits a file, `espalier lint` verifies the result. Findings include the applicable rule text by default. Output is human-readable unless `--format jsonl` is selected for machine consumption. The agent revises until validation succeeds. See [`espalier lint`](docs/cli/lint/README.MD).

**Creation**, invoked for any structural rule by `espalier create`:

> Given a concrete absent path, Espalier creates either its structurally owned
> file or its complete declared directory. File templates supply source and CLI
> flags; a directory composes the templates of all its required files. Creation
> never overwrites an existing path.

Guidance steers and the linter corrects. Both derive from the same rule file, so drift between the two is reviewable. Colocation does not prove the prose and the check are the same obligation.

`espalier create <path>` can create any structurally declared absent file or
directory. A file selects its owning template; a directory creates every
required descendant and namespaces each file's flags with its relative path.
A rule without a template creates an empty file. Every renderer receives its
concrete path and the owning rule's placeholder captures.
`espalier create <path> help` describes either operation without writing. See
[`espalier create`](docs/cli/create/README.MD).

## The convergence loop

`espalier` does not try to make agents correct on the first attempt. It makes correctness _reachable through iteration_.

1. The agent reads the project map at the repository root — always present, small, architectural.
2. Working in a directory, it reads the nearest applicable generated guidance: what belongs there, what is required, and the conventions for each.
3. After writing, `espalier lint` validates the result.
4. Drift is reported as findings with the applicable rule text; `--format jsonl` provides machine-readable output.
5. The agent revises until the project's constraints are satisfied.

Guidance steers; the linter corrects. Generated-document freshness prevents stale copies. Executable checks give the same answer for the same recorded inputs. Tests and review establish whether those checks implement the intended architecture. Incomplete, contradictory, or unsatisfiable policy remains the author's.

## Quick start

Install the CLI on a machine running Node.js 24 or later:

```bash
npm install --global espalier
```

The global installation is only provisioning. `espalier init` records its exact
version in the repository. Commands that load its configuration require that
version; `espalier migrate` updates the configuration for the CLI that is
running. `help` and `examples` work independently of repository configuration.
See [`espalier migrate`](docs/cli/migrate/README.MD) for what migration changes.
Projects may instead provide the same pinned executable
through a local dependency, package runner, container, or system toolchain.

Start with an empty demonstration directory. It has no `.gitignore`, so this
invocation explicitly declines reading one:

```bash
mkdir espalier-demo
cd espalier-demo
espalier init --lang javascript --no-ignore-file
```

`init` writes `espalier.config.yaml`, `.espalierignore`, and `espalier/`
holding a `.gitkeep` and the compact authoring contract at `AGENTS.MD`.
Create `README.MD` with this content:

```markdown
# Espalier demo

A minimal repository governed by Espalier.
```

Then create this structural rule file:

```text
espalier
└─ README.MD.mjs
```

```js
// espalier/README.MD.mjs

export const description = "the repository root README file";

export const rule = `
The root README must not be empty.
`;

export async function lint({ read, emit }) {
  const text = await read();
  if (text.trim().length === 0) {
    emit({ code: "empty_readme", message: "README is empty" });
  }
}
```

Generate the documentation your agent reads:

```bash
espalier build
```

Validate the repository:

```bash
espalier lint
```

The generated documentation is a build artifact. The espalier itself is the source of truth.

For an existing project with a `.gitignore`, use
`espalier init --lang javascript`. Declaring only `README.MD` does not cover
existing source files: each visible, governed file needs a structural owner.
Add rules for those files, or use [`espalier adopt`](docs/cli/adopt/README.MD)
to infer a directory's structure and then fill in its requirements and checks.
See [`espalier init`](docs/cli/init/README.MD) for initialization options.

Projects that want only repository-specific guidance can omit Espalier's canned
operational sections:

```yaml
build:
  espalierGuidance: false
```

## Rule types

There are three kinds of rule: structural rules, per-file constraints, and
aggregates.

**Structural rules** describe _what code exists, and where_. They are positioned in the rule tree under root by their target file path:

```text
components/buttons/[button].tsx.mjs
```

This rule can own files matching `components/buttons/*.tsx`; a more specific
sibling takes precedence. The placeholder name is exposed to `lint` as
`captures.button`.

Structural rules define the project's architectural shape. They appear in the project map, they carry the conventions written into each directory's documentation, and they are what makes an undeclared file a violation.

**Per-file constraints** check each matching file independently. Their paths
contain a recursive placeholder, and their filenames give the check's name
and the extension it applies to, followed by `.mjs`:

```text
[...path]/no-as-any.ts.mjs
backend/[...path]/no-fetch.ts.mjs
```

The first checks every owned, governed TypeScript file in the project; the
second checks those within `backend/`.

**Aggregates** check matching files together and can enforce several conditions
on the group, such as equal translation key sets or a fixture corpus's mix
and averages. They use a recursive-placeholder path and export
`aggregate = true`. Their filename is the rule name followed by `.mjs`:

```text
src/[...path]/message-registry.mjs
```

Per-file constraints and aggregates do not own files. Every governed file
must have one structural owner; constraints apply additional checks to the
files they select. Which rule wins, and which files are required to exist, is
specified in [docs/MATCHING.MD](docs/MATCHING.MD) (`espalier help matching`).

A constraint can export `targets = ["*/queries.sql"]` to narrow its governed
candidates without redefining ownership or repository structure. The positive
globs are relative to the prefix before `[...name]` and apply equally to
ordinary and aggregate constraints. An aggregate without `targets` selects
every owned governed file in its scope.

An aggregate runs once over its complete selected set, including an empty
set. See [docs/TYPES.MD](docs/TYPES.MD) for selection and context details.

## Path placeholders

Square brackets define named path placeholders:

```text
clients
└─ [provider]
   └─ [implementation].ts.mjs
```

`[name]` matches within one path segment and captures the matched text as a string. `[...name]` matches across zero or more complete path segments, captures them as an array of strings, and marks the rule as a constraint.

Two different placeholders never constrain each other. In the example above, both `stripe/stripe.ts` and `stripe/client.ts` match, because the second name captures whatever is there. When two parts of a path must agree, `{name}` says so:

```text
clients
└─ [provider]
   └─ {provider}.ts.mjs
```

`clients/stripe/stripe.ts` matches. `clients/stripe/client.ts` does not. A back-reference captures nothing and introduces no name — it matches the text a `[name]` earlier in the path already captured, and it makes that file required for every provider directory that exists.

The alternative is a rule body asking politely and a `lint` function checking afterwards, for a fact the espalier can simply state. Stating it also puts the requirement in the generated documentation, where an agent reads it before writing the file rather than after.

The matcher normalizes `[name]` to `*`, `[...name]` to `**`, and `{name}` to
`*`. Structural rules and per-file constraints receive a normalized
`context.pattern` and matched values in `context.captures`. Aggregates receive
`context.patterns` for their admission globs and `context.matches` for the
selected files, each with its own path and captures.

Full grammar, matching precedence, and requiredness: [docs/MATCHING.MD](docs/MATCHING.MD) (`espalier help matching`).

## Writing rules

Every rule file exports `rule` and `lint`. Structural rules also require a
`description`. This structural example shows the exports; its check is an
outline, not an implementation:

```js
export const description =
  "a concise description of what this file represents";

export const rule = `Props must be a named exported interface \`<Name>Props\`.`;

import { createLinter } from "espalier";

export const lint = createLinter(async (context) => {
  // deterministic validation
});
```

That `rule` renders as: Props must be a named exported interface `<Name>Props`.

An ordinary template literal is the default. Reach for `String.raw` when the text contains backslashes and no backticks:

```js
export const rule = String.raw`File names must match ^[A-Z][a-zA-Z0-9]*$.`;
```

`createLinter` provides contextual editor and TypeScript types and returns the
same function unchanged. It is optional: ordinary `export function lint(...)`
rules remain valid. Aggregate constraints have the corresponding
`createAggregateLinter` helper.

The `description` is one line, and it is what appears in the project map beside the path. Because the map is the part of the documentation that is always in context, write it in the vocabulary of the task rather than of the architecture — an agent asked to add a `User` type will not necessarily connect that to the phrase "a domain model."

The `rule` describes the requirements for the file or selected group. The same
requirements apply whether files are being created or edited, and the same
text appears in generated guidance and reported findings.

The context for structural rules and per-file constraints describes one file.
An aggregate receives the selected files together, with no singular `path`,
`pattern`, or `captures`; its `read` calls must name a path. See
[docs/TYPES.MD](docs/TYPES.MD) (`espalier help types`) for the full shapes.
Choosing a rule's kind, keeping policy in the rule file, and testing it is
[docs/AUTHORING.MD](docs/AUTHORING.MD) (`espalier help authoring`). `espalier init`
writes the compact contract to `espalier/AGENTS.MD`, where an agent editing
rules can read it.

To import helpers such as `createLinter` or the testing API from `"espalier"`,
install Espalier as a local development dependency at the exact version in
`espalier.config.yaml`'s `pin`. A global CLI installation alone does not make
the package available to project imports.

Find or copy the examples packed with this CLI version:

```bash
espalier examples --help
espalier examples authoring-corpus
espalier examples authoring-corpus --copy ./scratch/corpus
```

The named command prints the installed path; `--copy` creates a writable copy
in a new directory. See [`espalier examples`](docs/cli/examples/README.MD).

```js
// structural rule (e.g. components/buttons/[button].tsx.mjs)
async function lint({
  path,
  pattern,
  captures,
  read,
  emit,
}) {
  const code = await read();
}

// per-file constraint (e.g. [...path]/no-as-any.ts.mjs)
async function lint({ path, pattern, captures, read, emit }) {
  const code = await read();
}

// aggregate (e.g. fixtures/[...path]/corpus-mix.mjs)
async function lint({ matches, patterns, read, emit }) {
  const contents = await Promise.all(matches.map(({ path }) => read(path)));
}
```

Rules execute independently, in unspecified order. Correctness cannot depend on execution order, mutable communication between rules, or unrecorded inputs. A rule may `read` governed files, but must not assume any other rule has or has not run. Process-local parser or addon infrastructure may reuse state when every answer remains a function of tracked lint data and observed or declared implementation dependencies.

## The project layout

`espalier build` writes a deterministic `## Project layout` into each generated
document. In the default distributed layout, each map expands through
directories until another generated document takes over. For example:

```text
    ./
    ├─ clients/
    ├─ components/
    │  ├─ buttons/
    │  ├─ dropdowns/
    │  └─ layouts/
    ├─ endpoints/
    ├─ models/
    └─ main.ts      the application entry point (required)
```

If `components/` has no rules or directory guidance assigned directly to it,
it needs no document of its own: the root map continues through it to
`buttons/`, `dropdowns/`, and `layouts/`, where generated documents take over.
Directories matched by placeholders share guidance in an ancestor rather
than receiving one document per instance. Rule headings are relative to the
directory their document describes.

Names remain in authored form. Each entry states whether a static file is
required or optional, whether a placeholder accepts any name, and which capture
a back-reference repeats. Siblings use the same deterministic order as the
matcher. Setting `build.inline: true` instead collects the guidance into one
root document.

See [docs/cli/build/README.MD](docs/cli/build/README.MD) for how files are placed and what each contains.

## CI/CD integration

This catches the case where the espalier changed but the committed documentation did not, preventing agents from being guided by stale guidance.

```bash
espalier build --check
```

## Who changes the espalier

An agent that hits `unexpected_path` has two ways to make the error go away. It can move the file, or it can edit the espalier until the path becomes legal.

It will try the second. It is the same instinct that deletes a failing test, and it is worse here, because nothing notices: the repository still lints clean while the espalier quietly comes to mean less every week.

So the espalier is not the agent's to change. The two roles are separate:

- **The architect** — a human, or an agent explicitly acting in that role — decides what the project's shape is and edits `espalier/`.
- **The developer** — usually an agent — builds within that shape. When a task does not fit the declared structure, the correct move is to stop and report the gap, not to widen the pattern.

The generated root document explains this workflow once. Nested Espalier roots
state their independent governance boundary, while ordinary placement documents
inherit that context instead of repeating it. Every generated document points
from its `Other repository paths` table to the corresponding `ESPALIER.MD` to
modify or create when its persistent guidance must change.

That is as far as the tool goes, and deliberately so. `espalier` cannot stop an agent editing `espalier/`, and a warning it emitted afterwards would be worse than nothing. The architect widening a pattern and an agent widening a pattern are the same edit; a check that fired on both would fire constantly on the intended workflow and be muted within a week. Telling them apart means reconstructing the previous espalier and diffing what each one legalises — a real mechanism, but one whose only output is a note in a log that nobody is obliged to read.

**Enforcement belongs where the power to refuse is.** An agent harness that denies writes under `espalier/`. A `CODEOWNERS` entry requiring a human on that path. A CI job that fails when a pull request touches both `espalier/` and the files it governs. Those can say no. A linter reporting on its own configuration can only nag, and this project would rather ship a sharp instruction than a dull alarm.

## Design philosophy

`espalier` is strict by default and provides exactly one escape hatch per concern.

- The structural model is strict. Governed files not matching the espalier are violations. `ignoreFiles` defines which paths Espalier can see; `.espalierignore` documents repository paths that remain visible but sit outside the project layout.
- Severity is decided by the rule, not by configuration. Reusable checks ship as library functions that expose severity as an argument; the project's rule file passes the value it wants. Policy lives where the rule lives.
- Issue codes are free-form strings. `espalier` does not validate uniqueness or namespace them automatically. Projects adopt their own conventions.

Every additional knob is a place where deterministic behavior leaks. Repeatable feedback is preserved by keeping escape hatches few and coarse.

## Testing rules

Rules are code, and a `lint` function that quietly stops catching what it was written to catch is worse than no rule at all: the repository still lints clean, and nothing distinguishes that from conformance.

So `espalier` is a library as well as a CLI, and returns issues instead of printing them.

```js
import { runRule } from "espalier";
import * as rule from "../espalier/components/[name].tsx.mjs";

const issues = await runRule(rule, {
  path: "components/Button.tsx",
  captures: { name: "Button" },
  tree: { "components/Button.tsx": "export default function Other() {}" },
});
```

Use `runAggregate` for a supplied set of matches and `check` for repository
matching and selection. There is no `espalier test` command; these functions
work with the project's existing test framework. See [docs/API.MD](docs/API.MD)
(`espalier help api`).

## What `espalier` is not

- **Not a replacement for general-purpose linters.** ESLint, ruff, golangci-lint, and their peers do excellent work on language-specific code quality. `espalier` is about _architectural_ enforcement: where code lives, what shape it takes, how modules relate. The two are complementary.
- **Not an agent.** `espalier` does not invent code, generate suggestions, or decide architecture. It enforces decisions you have already made; `create` can write initial source from templates you supply.
- **Not an attempt to constrain agents.** The goal is not to prevent agents from doing things — it is to give them a clear, machine-verifiable target so that correction is reachable through iteration. A well-shaped espalier makes the agent's job _easier_, not harder.
