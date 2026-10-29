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

- a **description** — what kind of file this represents
- **guidance** — the natural-language conventions that file must follow
- optionally, a **lint function** — the deterministic check that verifies adherence
- optionally, a **template** — a typed, documented way to create that kind of file

From this single source, `espalier` produces two standing surfaces and an
optional construction entry point:

**Documentation**, written into the repository by `espalier build`:

> Espalier places generated guidance at stable points in the repository tree. Each `AGENTS.MD` maps the structure below it, stopping where another generated document takes over, then describes the rules placed there. A reader starts at the root and follows the nearest generated document as it moves into a subtree.

**Linters**, run deterministically against the working tree by `espalier lint`:

> After the agent writes or edits a file, `espalier lint` verifies the result. Findings include the applicable guidance text by default. Output is human-readable unless `--format jsonl` is selected for machine consumption. The agent revises until validation succeeds. See [`espalier lint`](docs/cli/lint/README.MD).

**Creation**, invoked for any structural rule by `espalier create`:

> Given a concrete absent path, Espalier creates either its structurally owned
> file or its complete declared directory. File templates supply source and CLI
> flags; a directory composes its required files and any optional files selected with `--with` or `--with-optional`. Creation
> never overwrites an existing path.

Guidance steers and the linter corrects. Both derive from the same rule file, so drift between the two is reviewable. Colocation does not prove the prose and the check are the same obligation.

`espalier create <path>` can create any structurally declared absent file or
directory. A file selects its owning template; a directory creates every
required descendant plus selected optional leaves, and namespaces each file's
flags with its relative path. Template arguments follow `--`.
A rule without a template creates an empty file. Every template renderer receives its
concrete path and the owning rule's placeholder captures.
`espalier create <path> help` describes either operation without writing. See
[`espalier create`](docs/cli/create/README.MD).

## The convergence loop

`espalier` does not try to make agents correct on the first attempt. It makes correctness _reachable through iteration_.

1. The agent reads the project map at the repository root — always present, small, architectural.
2. Working in a directory, it reads the nearest applicable generated guidance: what belongs there, what is required, and the conventions for each.
3. After writing, `espalier lint` validates the result.
4. Drift is reported as findings with the applicable guidance text; `--format jsonl` provides machine-readable output.
5. The agent revises until the project's constraints are satisfied.

Guidance steers; the linter corrects. Generated-document freshness prevents stale copies. Executable checks give the same answer for the same source inputs. Tests and review establish whether those checks implement the intended architecture. Incomplete, contradictory, or unsatisfiable policy remains the author's.

## Quick start

Install the CLI on a machine running Node.js 24 or later:

```bash
npm install --global espalier
```

The global installation is only provisioning. `espalier init` records its exact
version in the repository. Commands that load its configuration require that
version; `espalier migrate` updates the configuration for the CLI that is
running. `espalier --version` prints the installed version. It, `help`, and
`examples` work independently of repository configuration.
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

export const guidance = `
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

This rule can own files such as `components/buttons/Submit.tsx`, but not
`Submit.test.tsx`: the filename capture cannot contain dots. The captured name
is exposed to `lint` as `captures.button`. See
[Matching](docs/MATCHING.MD#placeholders) for literal
dots, back-references, and explicit suffix alternatives.

For both files and directories, a placeholder pattern matching a strict subset
of a sibling's names takes precedence; the broader sibling owns the rest.
Overlapping patterns with no provably narrower winner are rejected. See
[Ownership](docs/MATCHING.MD#ownership) for the full specificity rules.

Structural rules define the project's architectural shape. They appear in the project map, they carry the conventions written into each directory's documentation, and they are what makes an undeclared file a violation.

**Per-file constraints** check each selected file independently. Their paths
contain a recursive placeholder. The filename can select a file extension:

```text
[...path]/no-as-any.ts.mjs
backend/[...path]/no-fetch.ts.mjs
```

The first checks every owned, governed file with complete extension `.ts` in
the project; the second checks those within `backend/`. `foo.d.ts` is not
selected. To select both, write `no-as-any.{ts,d.ts}.mjs`.

**Aggregates** check selected files together and can enforce several conditions
on the group, such as equal translation key sets or a fixture corpus's mix
and averages. They use the same selection rules as per-file constraints and
export `aggregate = true`:

```text
src/[...path]/message-registry.json.mjs
```

Per-file constraints and aggregates do not own files. Every governed file
must have one structural owner; constraints apply additional checks to the
files they select. Which rule wins, and which files are required to exist, is
specified in [docs/MATCHING.MD](docs/MATCHING.MD) (`espalier help matching`).

A constraint with no filename extension must instead export `targets`, a
non-empty list of positive globs, such as `["*/queries.sql"]`. A filename
extension and `targets` cannot appear together. Both are selectors for
structurally owned, governed files; neither changes ownership. The globs are
relative to the prefix before `[...name]` and apply equally to per-file and
aggregate constraints. `targets = ["**/*"]` selects every file type in the
constraint's directory scope. In `rule.up.sql.mjs`, the entire `.up.sql`
suffix is the extension selector.

Unlike a filename selector, a `**/*.ts` target glob also matches names such
as `foo.d.ts`. Target globs use minimatch syntax, so `**/*.{ts,tsx}` selects
both suffixes. See [Glob syntax](docs/MATCHING.MD#glob-syntax).

An aggregate runs once over its complete selected set, including an empty
set. See [docs/TYPES.MD](docs/TYPES.MD) for selection and context details.

## Path placeholders

Square brackets define named path placeholders:

```text
clients
└─ [provider]
   └─ [implementation].ts.mjs
```

`[name]` matches within one path segment and captures the matched text as a string. `[...name]` matches across zero or more complete path segments, captures them as an array of strings, and marks the rule as a constraint. A path whose real name holds brackets, such as a Next.js `app/[slug]/` route, is declared by a module exporting `literalName = true`.

Two different placeholders never constrain each other. In the example above, both `stripe/stripe.ts` and `stripe/client.ts` match, because the second name captures whatever is there. When two parts of a path must agree, `{name}` says so:

```text
clients
└─ [provider]
   └─ {provider}.ts.mjs
```

`clients/stripe/stripe.ts` matches. `clients/stripe/client.ts` does not. A back-reference captures nothing and introduces no name — it matches the text a `[name]` earlier in the path already captured, and it makes that file required for every provider directory that exists.

A placeholder can say what shape of text it accepts. After `=`, a mask pictures the text one character at a time, and braces list the names allowed:

```text
migrations
├─ [seq=0(6)]_[name=x+].tables.sql.mjs      six digits, an underscore, a lowercase slug
└─ [kind={tables,views}].sql.mjs            exactly tables.sql and views.sql
```

`0` is a digit, `#` an optional digit, `A` a letter, `a` a lowercase letter, `X` a letter or digit, `x` a lowercase letter or digit, and `-` or `_` itself; `+` repeats the previous element one or more times and `(n)` exactly n times. A masked placeholder is a strict subset of a bare one, so `[seq=0+]_[name].tables.sql.mjs` and `[stem].tables.sql.mjs` can sit beside it and own what it does not. Two captures in one name must be separated by text neither can absorb; `[a]_[b]` is rejected at compile time with a name that splits two ways.

The alternative is guidance asking politely and a `lint` function checking afterwards, for a fact the espalier can simply state. Stating it also puts the requirement in the generated documentation, where an agent reads it before writing the file rather than after.

Structural rules and per-file constraints receive their declaration as
`context.pattern`, placeholders and all, and the matched values in
`context.captures`. Aggregates receive `context.patterns` for their admission
globs and `context.matches` for the selected files, each with its own path and
captures.

A dynamic rule can also judge its files in groups. `groups` names the
captures a group shares, such as a migration set's number and name, and each
grouping carries its own guidance and, optionally, a `lint` that runs once per
group with the members. One group can be declared with guidance of its own,
and an abstract grouping requires that of every group. See
[groups](docs/TYPES.MD#groups) and
[declaring a group](docs/INSTANCES.MD#declaring-a-group).

Full grammar, matching precedence, and requiredness: [docs/MATCHING.MD](docs/MATCHING.MD) (`espalier help matching`).

Named directory and file instances can specialize dynamic contracts with
`instanceOf`. They retain inherited structure and checks while supplying
domain-specific guidance and additional requirements. Named members are
required by default; `optional` controls their presence and `minMatches`
controls dynamic collection size. A contract exporting `abstract = true`
insists on declarations, reporting any member that lacks one. See [named instances](docs/MATCHING.MD#named-instances)
for the complete contract and [migration](docs/cli/migrate/README.MD) for
converting Markdown directory guidance to `ESPALIER.mjs`.

## Writing rules

Every rule file exports `guidance`; most also export `lint`. Structural rules also require a
`description`. This structural example shows the exports; its check is an
outline, not an implementation:

```js
export const description =
  "a concise description of what this file represents";

export const guidance = `Props must be a named exported interface \`<Name>Props\`.`;

import { createLinter } from "espalier";

export const lint = createLinter(async (context) => {
  // deterministic validation
});
```

That `guidance` renders as: Props must be a named exported interface `<Name>Props`.

An ordinary template literal is the default. Reach for `String.raw` when the text contains backslashes and no backticks:

```js
export const guidance = String.raw`File names must match ^[A-Z][a-zA-Z0-9]*$.`;
```

`createLinter` provides contextual editor and TypeScript types and returns the
same function unchanged. It is optional: ordinary `export function lint(...)`
rules remain valid. Aggregate constraints have the corresponding
`createAggregateLinter` helper.

For a structural rule, `description` briefly describes what the file is.
For a constraint, it optionally summarizes the requirement. Use the project's
vocabulary: "a payment provider client" or "checkout message IDs agree across
locales." Put the full requirements in `guidance`.

The `guidance` describes the requirements for the file or selected group. The same
requirements apply whether files are being created or edited, and the same
text appears in generated guidance and reported findings.

Rule [`description`](docs/TYPES.MD#description) and [`guidance`](docs/TYPES.MD#guidance)
exports can also be sync/async functions. Directory modules accept computed
[`description` and `guidance`](docs/TYPES.MD#directory-modules). These callbacks
run once per authored declaration during compilation, using configuration and
declaration context rather than an individual lint match.

The `lint` context for structural rules and per-file constraints describes one file.
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

// aggregate (e.g. fixtures/[...path]/corpus-mix.mjs with targets)
async function lint({ matches, patterns, read, emit }) {
  const contents = await Promise.all(matches.map(({ path }) => read(path)));
}
```

Rules execute independently, in unspecified order. Read governed repository data through `read` and `files`, and pass contents to helpers and addons. Shared analysis may memoize identical inputs when answers remain independent of rule order and previous calls.

Every selected rule runs on each invocation. `espalier lint --jobs auto` uses a
bounded worker pool; `--jobs 1` selects serial execution. Set
[`lint.jobs`](docs/CONFIG.MD#lintjobs) for a project default. Addons can prepare
shared data once and initialize local services in each worker. See
[parallel execution](docs/cli/lint/README.MD#parallel-execution) and
[addons](docs/CONFIG.MD#addons).

## The project layout

Generated guidance includes a map of the project's declared structure. For
example:

```text
    ./
    ├─ clients/
    ├─ components/
    │  ├─ buttons/
    │  ├─ dropdowns/
    │  └─ layouts/
    ├─ endpoints/
    ├─ models/
    └─ main.ts ❗    the application entry point
```

Espalier handles document placement and presentation. Authors declare the
structure and write the guidance; readers can discover what belongs where
and which files are required. Set `fold = true` in the root `ESPALIER.mjs` when your tooling needs
all guidance in one root document, or in a subtree to fold its guidance upward. See [the build reference](docs/cli/build/README.MD)
for output details.

## CI/CD integration

This catches the case where the espalier changed but the committed documentation did not, preventing agents from being guided by stale guidance.

```bash
espalier build --check
```

## Who changes the espalier

Any module of the espalier can be locked with `export const locked = true`,
a directory module for its whole subtree. A locked module needs explicit
authorization before anything it declares changes; an unlocked one takes the
changes a task implies, and proposals for open designs. Locks never apply to
the project's files, and `espalier lint --base <dir>` reports every change
that touches a lock, so a project can require approval for it. See
[locks](docs/LOCKS.MD).

Authorized architecture changes are design decisions to discuss. Before changing rules,
architectural guidance, or configuration policy, the agent explains the gap,
presents reasonable options and tradeoffs, and recommends an approach. The
proposal identifies changes to placement, requiredness, checks, and exclusions,
including guarantees it would remove. A path that passes lint can still be
the wrong architectural home.

Once the design is agreed, the agent implements it without repeatedly asking
for approval. Rules and governed code can change together to realize that
design. A materially different design needs renewed discussion; ordinary code
changes that follow the agreed architecture can proceed.

Prefer static nodes for known roles and dynamic patterns for instances sharing
a defined responsibility and contract. Review inferred structure from `adopt`
before treating it as the intended architecture.

Edit the corresponding `ESPALIER.mjs`, rule files, or configuration, then
regenerate guidance. Review the generated documents, test affected rules, run
`espalier lint`, and check freshness with `espalier build --check`. Generated
documents are outputs, not edit targets.

Espalier checks the current policy; it cannot establish that a policy change
was agreed. Projects needing enforced review can require approval for rule and
configuration changes through repository permissions and code review.

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
