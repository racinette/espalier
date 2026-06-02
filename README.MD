# espalier

> _Espalier (n.):_ the horticultural practice of training a tree to grow into a deliberate, predetermined form against a supporting structure. The tree grows freely, but into the shape the gardener intended.

`espalier` is an architecture compiler for agent-driven software development.

It takes a single source-of-truth description of how a project should be shaped — where code goes, what it looks like, how it's written — and emits everything an agent needs to build and maintain that project correctly:

- **skills** for creating new code in the right place, in the right shape
- **rules** for editing existing code without drifting from the intended form
- **linters** for catching drift deterministically when it happens

All three are generated from the same source. They cannot get out of sync, because they are not independently authored.

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
│  └─ [apiProvider]
│     ├─ [apiProvider].ts.mjs
│     ├─ requestModels.ts.mjs
│     └─ responseModels.ts.mjs
└─ main.ts.mjs
```

Each `.mjs` file declares:

- a **content description** — what kind of file this represents
- a **rule** — the natural-language conventions that file must follow
- a **lint function** — the deterministic check that verifies adherence

From this single source, `espalier` compiles three outputs:

**Skills**, surfaced to the agent when creating new code:

> When asked to create a button component, the agent invokes the _button component_ skill. The skill carries the placement (`components/buttons/[button].tsx`), the naming relationship (filename matches the component), and the conventions to follow.

**Rules**, attached to files when editing existing code:

> When the agent opens an existing button component to modify it, the corresponding rule is automatically attached to its context. The rule restates the conventions the file must continue to satisfy.

**Linters**, run deterministically against the working tree:

> After the agent writes or edits a file, `espalier run` verifies the result. Violations are emitted as machine-readable issues. The agent revises until validation succeeds.

The three outputs serve different moments of the development loop, but they all describe the same conventions — because they all derive from the same rule module.

## The convergence loop

`espalier` does not try to make agents correct on the first attempt. It makes correctness _reachable through iteration_.

1. The agent reads the project layout document — always present, small, architectural.
2. To create new code, the agent invokes the relevant skill. Placement and shape come from the skill.
3. To edit existing code, the agent receives the rule for that file automatically.
4. After writing, `espalier run` validates the result.
5. Drift is reported as precise, machine-readable issues.
6. The agent revises until the project's constraints are satisfied.

Guidance steers; the linter corrects. Either half failing degrades the loop's efficiency, not its correctness. As long as the linter is deterministic, the loop converges.

## Quick start

Define an `espalier/` directory at your project root. A minimal example:

```text
espalier
└─ README.MD.mjs
```

```js
// espalier/README.MD.mjs

export const contentDescription = "the repository root README file";

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

Validate the repository:

```bash
espalier lint
```

Compile guidance for your agent:

```bash
espalier export
```

The exported artifacts are generated outputs. The espalier itself is the source of truth.

## Rule types

`espalier` distinguishes between two kinds of rules.

**Structural rules** describe _what code exists, and where_. They are positioned in the rule tree under root by their target file path:

```text
components/buttons/[button].tsx.mjs
```

This rule governs files at `components/buttons/[button].tsx`. Capture segments (`[button]`) bind to variable path components and can be referenced elsewhere in the tree to enforce naming relationships.

Structural rules participate in **creation** (as skills) and **editing** (as path-attached rules). They define the project's architectural shape.

**Constraint rules** describe _how code is written_, regardless of position. They are attached to selectors. Rule module paths are relative to the configured root (see `espalier.config.yaml`):

```text
**/*.ts/no-as-any.mjs
backend/**/*.ts/no-fetch.mjs
```

The first applies to every TypeScript file in the project; the second only within `backend/`. Constraint rules participate in **editing** (as glob-attached rules) and **validation** (as linters). They do not appear as skills, because they describe properties rather than artifacts.

## Captures

Segments wrapped in square brackets define symbolic names that can be reused deeper in the tree (similar to dynamic segments in Next.js and other frameworks):

```text
clients
└─ [apiProvider]
   ├─ [apiProvider].ts.mjs
   ├─ requestModels.ts.mjs
   └─ responseModels.ts.mjs
```

Here `[apiProvider]` matches a directory name, and `[apiProvider].ts` requires a file whose name matches that same value. This lets `espalier` enforce naming relationships across the repository structure, not just file placement.

Capture names should communicate intent. Prefer `[apiProvider]` over `[name]`; the names appear verbatim in generated documentation and provide context to both humans and agents.

## Writing rules

Every rule module exports the same shape:

```js
export const contentDescription =
  "a concise description of what this file represents";

export const rule = String.raw`
The natural-language guidance. Markdown is supported.
`;

export async function lint(context) {
  // deterministic validation
}
```

The `contentDescription` is used in the generated project layout document, where it appears as an inline annotation. It should read naturally in that context: `"a button component"`, `"a domain model"`, `"the application entry point"`.

The `rule` describes what the file must look like. It is _mode-invariant_: the same conventions apply whether the file is being created or edited. The exporter renders it appropriately for each output surface.

The `lint` function receives a context. Structural rules get path and capture metadata; constraint rules get a selector. See `docs/TYPES.MD` for the full shapes.

```js
// structural rule (e.g. components/buttons/[button].tsx.mjs)
async function lint({
  path,
  pattern,
  captures,
  allCaptures,
  segments,
  read,
  emit,
}) {
  const code = await read();
  const { button } = allCaptures;
}

// constraint rule (e.g. **/*.ts/no-as-any.mjs under root)
async function lint({ path, selector, read, emit }) {
  const code = await read();
}
```

Rules execute independently, in unspecified order, with no shared state. A rule may read other files via the runner's APIs, but must not assume any other rule has or has not run.

## The project layout document

`espalier` generates a repository-wide architectural overview deterministically from the structural portion of the espalier:

```text
├─ components
│  ├─ buttons
│  │  └─ [button].tsx         // a button component
│  ├─ dropdowns
│  │  └─ [dropdown].tsx       // a dropdown component
│  └─ layouts
│     └─ [layout].tsx         // a layout component
├─ models
│  └─ [domain].ts             // a domain model
├─ endpoints
│  └─ [endpoint].ts           // an endpoint implementation
├─ clients
│  └─ [apiProvider]
│     ├─ [apiProvider].ts     // an HTTP client implementation
│     ├─ requestModels.ts     // request models for an HTTP client
│     └─ responseModels.ts    // response models for an HTTP client
└─ main.ts                    // the application entry point
```

This document is always present in the agent's context. It is the architectural map: small, stable, and sufficient to orient any decision about where new code should go.

## Export targets

`espalier export` compiles the espalier into agent-readable artifacts. Each target receives the form most suited to its capabilities. Targets are configurable in `espalier.config.yaml`.

## CI/CD integration

This catches the case where the source has changed but the committed exports have not, preventing agents from being guided by stale rules.

```bash
espalier export check
```

## Design philosophy

`espalier` is strict by default and provides exactly one escape hatch per concern.

- The structural model is strict. Files not matching the espalier are violations. Exemptions go in `espalier.config.yaml`, with gitignore-compatible syntax.
- Severity is decided by the rule, not by configuration. Reusable checks ship as library functions that expose severity as an argument; the project's rule file passes the value it wants. Policy lives where the rule lives.
- Issue codes are free-form strings. `espalier` does not validate uniqueness or namespace them automatically. Projects adopt their own conventions.

Every additional knob is a place where deterministic behavior leaks. The value `espalier` offers — architectural convergence you can rely on — is preserved by keeping escape hatches few and coarse.

## What `espalier` is not

- **Not a replacement for general-purpose linters.** ESLint, ruff, golangci-lint, and their peers do excellent work on language-specific code quality. `espalier` is about _architectural_ enforcement: where code lives, what shape it takes, how modules relate. The two are complementary.
- **Not an agent.** `espalier` does not write code, generate suggestions, or decide architecture. It enforces decisions you have already made.
- **Not an attempt to constrain agents.** The goal is not to prevent agents from doing things — it is to give them a clear, machine-verifiable target so that their iteration converges. A well-shaped espalier makes the agent's job _easier_, not harder.
