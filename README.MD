# espalier

> _Espalier (n.):_ the horticultural practice of training a tree to grow into a deliberate, predetermined form against a supporting structure. The tree grows freely, but into the shape the gardener intended.

`espalier` is an architecture compiler for agent-driven software development.

It takes a single source-of-truth description of how a project should be shaped — where code goes, what it looks like, how it's written — and provides the two parts of a development loop:

- **documentation** placed where agent tools already look, describing what belongs where and how it should be written
- **deterministic validation** that catches drift when it happens

Both derive from the same rule modules. The guidance states the rules before a change; the linter runs their checks afterwards.

## The problem

Coding agents produce technically correct code. They struggle to produce _architecturally consistent_ code over long execution paths.

Even with detailed prompts and carefully written instructions, context dilutes over time. A button component that was supposed to live in `components/buttons/` ends up in `lib/ui/`. A new endpoint follows a pattern that doesn't match any of the existing ones. An import sneaks across a module boundary that's supposed to be closed. None of this is _wrong_ in the sense that the linter or the type checker would catch — but it gradually erodes the shape of the codebase.

The usual response is to write better prompts, longer rule files, more detailed architectural docs. These help, but they share a structural problem: they are _guidance only_. There is no mechanism that closes the loop between "the agent was told what to do" and "the agent actually did it." When the guidance fails, nothing notices.

`espalier` closes that loop.

## How it works

A project defines its intended architecture as a structured tree of rule modules:

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

Each `.mjs` file declares:

- a **content description** — what kind of file this represents
- a **rule** — the natural-language conventions that file must follow
- a **lint function** — the deterministic check that verifies adherence

From this single source, `espalier` produces two things:

**Documentation**, written into the repository by `espalier build`:

> Espalier places generated guidance at stable points in the repository tree. Each `AGENTS.MD` shows only the files and directories at its own level, then describes the rules placed there. A reader starts at the root and follows the nearest generated document as it moves into a subtree.

**Linters**, run deterministically against the working tree by `espalier lint`:

> After the agent writes or edits a file, `espalier lint` verifies the result. Violations are emitted as machine-readable issues, each carrying the rule text it violated. The agent revises until validation succeeds.

Guidance steers and the linter corrects. Both describe the same conventions, because both derive from the same rule module.

## The convergence loop

`espalier` does not try to make agents correct on the first attempt. It makes correctness _reachable through iteration_.

1. The agent reads the project map at the repository root — always present, small, architectural.
2. Working in a directory, it picks up that directory's `AGENTS.MD`: what belongs there, what is required, and the conventions for each.
3. After writing, `espalier lint` validates the result.
4. Drift is reported as precise, machine-readable issues, each carrying the rule it violated.
5. The agent revises until the project's constraints are satisfied.

Guidance steers; the linter corrects. Either half failing degrades the loop's efficiency, not its correctness. As long as the linter is deterministic, the loop converges.

## Quick start

Install Espalier in a project running Node.js 20 or later:

```bash
npm install --save-dev espalier
```

Initialize it. This command reads the project's existing `.gitignore`; use
`--no-ignore-file` only when the repository deliberately has none.

```bash
npx espalier init --lang javascript
```

`init` writes `espalier.config.yaml`, `.espalierignore`, and an empty
`espalier/` source directory. Add a minimal structural rule:

```text
espalier
└─ README.MD.mjs
```

```js
// espalier/README.MD.mjs

export const description = "the repository root README file";

export const rule = String.raw`
The root README must not be empty and should describe the project's purpose.
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
npx espalier build
```

Validate the repository:

```bash
npx espalier lint
```

The generated documentation is a build artifact. The espalier itself is the source of truth.

## Rule types

`espalier` distinguishes between two kinds of rules.

**Structural rules** describe _what code exists, and where_. They are positioned in the rule tree under root by their target file path:

```text
components/buttons/[button].tsx.mjs
```

This rule governs files matching `components/buttons/*.tsx`. The placeholder name is exposed to `lint` as `captures.button`.

Structural rules define the project's architectural shape. They appear in the project map, they carry the conventions written into each directory's documentation, and they are what makes an undeclared file a violation.

**Constraint rules** describe _how code is written_, regardless of position. They live on paths containing a recursive placeholder, and their filename is a rule name plus the extension they apply to:

```text
[...path]/no-as-any.ts.mjs
backend/[...path]/no-fetch.ts.mjs
```

The first applies to every TypeScript file in the project; the second only within `backend/`. Constraint rules do not declare that anything exists — they describe how files that do exist must be written, and appear in the documentation for the subtree they cover.

Every file in the repository is owned by exactly one structural rule, and by every constraint whose pattern matches it. Which rule wins, and which files are required to exist, is specified in [docs/MATCHING.MD](docs/MATCHING.MD).

A constraint can export `targets = ["*/queries.sql"]` to narrow its governed
candidates without redefining ownership or repository structure. The positive
globs form a union and apply equally to ordinary and aggregate constraints.

A constraint exporting `aggregate = true` runs once over its complete matching
set instead of once per file. This covers invariants that only exist at group
scale: identifier uniqueness, translation parity, dependency cycles, or whether
a fixture suite exercises every element often enough.

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

The matcher normalizes `[name]` to `*`, `[...name]` to `**`, and `{name}` to `*`. The normalized glob is exposed as `context.pattern`; the matched values are exposed as `context.captures`.

Full grammar, matching precedence, and requiredness: [docs/MATCHING.MD](docs/MATCHING.MD).

## Writing rules

Every rule module exports the same shape:

```js
export const description =
  "a concise description of what this file represents";

export const rule = String.raw`
The natural-language guidance. Markdown is supported.
`;

export async function lint(context) {
  // deterministic validation
}
```

The `description` is one line, and it is what appears in the project map beside the path. Because the map is the part of the documentation that is always in context, write it in the vocabulary of the task rather than of the architecture — an agent asked to add a `User` type will not necessarily connect that to the phrase "a domain model."

The `rule` describes what the file must look like. It is _mode-invariant_: the same conventions apply whether the file is being created or edited, and the same text is written into the documentation and returned attached to a violation.

The `lint` function receives a context with the matched `path`, normalized `pattern`, and named `captures`. See `docs/TYPES.MD` for the full shape.

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

// constraint rule (e.g. [...path]/no-as-any.ts.mjs)
async function lint({ path, pattern, captures, read, emit }) {
  const code = await read();
}
```

Rules execute independently, in unspecified order, with no shared state. A rule may read other files via the runner's APIs, but must not assume any other rule has or has not run.

## The project layout

`espalier build` writes a deterministic `## Project layout` into each generated
document. The root shows only its own level:

```text
    ./
    ├─ clients/
    ├─ components/
    ├─ endpoints/
    ├─ models/
    └─ main.ts      the application entry point (required)
```

Entering `components/` moves the reader to that subtree's generated document,
whose map starts at `components/` and lists `buttons/`, `dropdowns/`, and
`layouts/`. Rule headings beneath it are relative to that established scope.

Names remain in authored form. Each entry states whether a static file is
required or optional, whether a placeholder accepts any name, and which capture
a back-reference repeats. Siblings use the same deterministic order as the
matcher. Each map stays small because deeper structure and rule bodies live in
the guidance nearest to that work.

See [docs/cli/build/README.MD](docs/cli/build/README.MD) for how files are placed and what each contains.

## CI/CD integration

This catches the case where the espalier changed but the committed documentation did not, preventing agents from being guided by stale guidance.

```bash
npx espalier build --check
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

- The structural model is strict. Files not matching the espalier are violations. Exemptions go in `espalier.config.yaml`, in gitignore syntax, and your `.gitignore` is read into them.
- Severity is decided by the rule, not by configuration. Reusable checks ship as library functions that expose severity as an argument; the project's rule file passes the value it wants. Policy lives where the rule lives.
- Issue codes are free-form strings. `espalier` does not validate uniqueness or namespace them automatically. Projects adopt their own conventions.

Every additional knob is a place where deterministic behavior leaks. The value `espalier` offers — architectural convergence you can rely on — is preserved by keeping escape hatches few and coarse.

## Testing rule modules

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

There is no `espalier test` command. Fixtures, assertions, reporting and watch mode are what a test framework already does, and a linter reimplementing them would ship a worse `node:test` with none of the tooling around it. The lint context is the only part nobody else can supply, so that is the part `espalier` exposes. See [docs/API.MD](docs/API.MD).

## What `espalier` is not

- **Not a replacement for general-purpose linters.** ESLint, ruff, golangci-lint, and their peers do excellent work on language-specific code quality. `espalier` is about _architectural_ enforcement: where code lives, what shape it takes, how modules relate. The two are complementary.
- **Not an agent.** `espalier` does not write code, generate suggestions, or decide architecture. It enforces decisions you have already made.
- **Not an attempt to constrain agents.** The goal is not to prevent agents from doing things — it is to give them a clear, machine-verifiable target so that their iteration converges. A well-shaped espalier makes the agent's job _easier_, not harder.
