# Types

The contract between a rule module and the runner: what a module exports, and what its `lint` function receives.

For how a module's position in the tree becomes a pattern, see [MATCHING.MD](MATCHING.MD).

## Rule modules

Every rule module — structural or constraint — exports the same base shape.

```js
export const description = "a button component";

export const example = "components/buttons/SubmitButton.tsx";

export const rule = `
Default-export a single component named after the file.
Props must be a named exported interface \`<Name>Props\`.
`;

export async function lint(context) {
  // deterministic validation
}
```

| Export | Required | |
|---|---|---|
| `description` | structural only | what this file is, in one phrase |
| `rule` | yes | the natural-language conventions, in markdown |
| `lint` | yes | deterministic validation |
| `example` | no | a path to a canonical conforming file |
| `exampleSource` | no | source for one, when no conforming file exists yet |
| `optional` | no | whether this file has to exist |
| `aggregate` | no | run a constraint once over its complete match set |
| `targets` | no | positive globs that narrow the governed files admitted by a constraint |

### `description`

One phrase, no trailing period, reading naturally after "a" or "the": `"a button component"`, `"the application entry point"`.

It appears in the project map, which is the only part of the exported documentation that is always in an agent's context. That makes it a retrieval surface rather than a caption — write it in the vocabulary of the task, not of the architecture:

```text
models/[domain].ts        a business entity — User, Invoice, Subscription
clients/[provider]/client.ts   an integration with an external API
```

An agent that needs to add a `User` type will not necessarily connect that to the phrase "a domain model."

Constraint modules may omit it. When absent, `espalier` generates one from the pattern, using built-in aliases for common extensions:

```text
**/*.ts               applies to TypeScript files throughout the project
backend/**/*.ts       applies to TypeScript files under backend/
**/*.{ts,tsx}         applies to TypeScript files throughout the project
**/*.zig              applies to .zig files throughout the project
```

Extensions sharing an alias collapse to one word, and an extension with no alias is named by its suffix. Supply your own `description` when the generated phrasing is wrong for the project.

### `rule`

The conventions the file must follow, in natural language. Markdown is supported.

An ordinary template literal is the right default. A backtick inside one has to be written `` \` `` either way — the literal would otherwise end — and an ordinary template literal resolves that escape, while `String.raw` keeps the backslash and puts it in your documentation. Reach for `String.raw` when the text contains backslashes and no backticks, which in practice means a regular expression.

```js
export const rule = `Props must be a named exported interface \`<Name>Props\`.`;
export const rule = String.raw`File names must match ^[A-Z][a-zA-Z0-9]*$.`;
```

The `rule` is **mode-invariant**: the same text applies whether the file is being created or edited. Exporters render it for each surface; they never rewrite it. It is also what a violation carries back to the agent, so write it as guidance rather than as a description of the check.

### `example` and `exampleSource`

One file that gets this right. Models follow an example far more reliably than they follow prose, and exported documentation is the only guidance available before a file is written.

```js
export const example = "components/buttons/SubmitButton.tsx";
```

**`example` is a path, and it is the form to reach for**, because it cannot drift. The file it names is a real file in the repository, linted by this very rule on every run — if it stops conforming you get an ordinary issue on it, and nothing extra is needed to keep it honest. `espalier` checks at compile time that the path exists and that this rule's own pattern matches it; a rule whose example does not is a specification error and exits `2`.

```js
export const exampleSource = String.raw`
export default function Submit() { … }
`;
```

**`exampleSource` is the source itself**, for the case the path form cannot serve: no conforming file exists yet. It carries none of the guarantees — there is no file to check, nothing to lint, and nothing that notices when it goes stale. Replace it with a path as soon as one file conforms.

They are two exports rather than one because a value has to say which it is. Deciding by inspection means a rule that looks like a path is a path, and a mistyped path then becomes a code sample nobody validates — trading a compile-time error for a silent one. **Setting both is a specification error**: two examples that could disagree is worse than either, and the run exits `2` with `module_invalid_export`.

### `optional`

```js
export const optional = true;
```

A static leaf is required: `main.ts.mjs` means `main.ts` must exist. `optional` says this one does not have to, while keeping everything else a rule module gives you — a line in the map, a rule body in the generated documentation, and a `lint` that runs whenever the file is there.

It exists for the file that some instances of a shape have and others do not. Without it, an espalier has two ways to describe `webhook.ts` when one client has one and another does not, and both say something false. Declare it and every client without a webhook is missing a required file. Leave it undeclared and the client that has one is reporting `unexpected_path` for a file everybody agrees belongs there. Optional is the third statement — *a client may have a webhook, and here is how to write it* — and it is the only one of the three that is true.

The payoff is in the generated documentation, where an agent reads it before the file exists. `webhook.ts is optional` in a directory's `AGENTS.MD` is a standing invitation with a rule attached; the alternative is prose nobody wrote and a violation nobody expected.

Only structural leaves take it. A dynamic leaf is already a collection that may be empty, and a constraint never requires anything, so `optional` on either has nothing to say and is rejected as `module_invalid_export` rather than ignored.

### `targets`

```js
export const targets = ["*/queries.sql"];
```

A constraint normally admits every governed file matched by its structural
scope and extension. `targets` narrows those candidates with positive globs.
The patterns form an unordered union; Espalier deduplicates and sorts them.
They cannot admit ignored, ungoverned, or extension-mismatched files, declare
required paths, or otherwise change repository structure.

Patterns are relative to the root of the constraint's recursive reach. For a
constraint at `fixtures/[...fixture]/query-count.sql.mjs`, the selector above
matches `fixtures/alpha/queries.sql` but not `fixtures/alpha/schema.sql`.
`targets` must be a non-empty array of non-empty relative patterns. Negation,
absolute patterns, and `..` segments are rejected. Omitting the export retains
the extension-wide behavior.

The same selector semantics apply to ordinary and aggregate constraints.
Existing constraint captures are preserved for every selected path.

### `aggregate`

```js
export const aggregate = true;
```

An ordinary constraint runs once per owned file it matches. An aggregate
constraint runs once with the complete matching set:

```js
export async function lint({ matches, read, emit }) {
  const contents = await Promise.all(matches.map(({ path }) => read(path)));
  // Compare or summarize the group, then emit once.
}
```

Only constraint modules take `aggregate`. Structural rules exist to describe
and lint one owned file at a time, so setting it there is
`module_invalid_export` rather than an execution mode with unclear ownership.

`matches` is a sorted array of `{ path, captures }`. Captures belong to each
match because a recursive placeholder usually binds a different value for every
file in the group. The aggregate context itself has no singular `path` or
`captures`; `read` therefore always requires a path.

The module runs once even when `matches` is empty. This lets a collective rule
enforce minimum population rather than silently disappearing in precisely the
case it was meant to reject. Its default issue path is the constraint's longest
static directory prefix, with a trailing slash, or `.` for a root constraint.
As with any issue, `emit({ path })` may attach it somewhere more specific.

All extensions in one constraint leaf form one group. A module named
`coverage.{ts,tsx}.mjs` receives the combined TypeScript and TSX match set, not
one invocation per extension.

## Captures

Path placeholders are exposed to `lint` through `captures`.

- `[name]` captures a string from one path segment
- `[...name]` captures an array containing each matched path segment
- `{name}` captures nothing; it matches what `[name]` already captured
- an exact path produces an empty object

Matching `clients/stripe/stripe.ts` against `clients/[provider]/[implementation].ts`:

```js
{
  provider: "stripe",
  implementation: "stripe",
}
```

Matching `backend/deep/nested/example.ts` against the constraint `backend/[...directories]/no-fetch.ts`:

```js
{
  directories: ["deep", "nested"],
}
```

A constraint's filename is a rule name and an extension rather than a placeholder, so the matched filename is not captured — read `context.path` for it.

Captures name values. They never constrain the relationship between them: both `stripe/stripe.ts` and `stripe/client.ts` match `[provider]/[implementation].ts`. If two captured values must agree, say so in `rule` and check it in `lint`.

## Reference

```js
/**
 * A value captured from a path placeholder.
 *
 * @typedef {string | string[]} CaptureValue
 */

/**
 * A single issue reported by a linter.
 *
 * @typedef {Object} LintIssue
 *
 * @property {string} code
 * Stable machine-readable issue identifier.
 *
 * @property {string} message
 * Human-readable issue description.
 *
 * @property {'error'|'warning'|'info'} [severity='error']
 * Issue severity level. Decided by the rule, never by configuration.
 *
 * @property {string} [path]
 * Attach the issue to a different file than the one being linted.
 * Defaults to the context's `path`.
 *
 * Use this when a rule discovers, while examining one file, a problem
 * that must be fixed in another — a client that is missing from the
 * registry belongs on the registry, not on the client.
 *
 * Must be a repository-relative path inside the repository. It need not
 * be governed, declared, or existing — the file that has to change is
 * often one the espalier has not described yet. An absolute path, or one
 * escaping the root, fails the run.
 *
 * Nothing is deduplicated. A rule that reaches the same conclusion from
 * forty files reports it forty times; emitting once is the rule's job.
 *
 * @property {number} [line]
 * 1-based line number associated with the issue.
 *
 * @property {number} [column]
 * 1-based column number associated with the issue.
 *
 * @property {Record<string, unknown>} [metadata]
 * Additional structured issue data.
 */

/**
 * Called once for every detected issue.
 *
 * @callback EmitIssue
 * @param {LintIssue} issue
 * @returns {void}
 */

/**
 * Reads file contents from the working tree.
 *
 * If the optional `path` argument is provided, reads that file.
 * Otherwise (or if `path` is `undefined`), reads the file indicated
 * by the context's `path` property.
 *
 * Paths are repository-relative, and must name a file this espalier
 * governs — the same set `files` lists. Reading outside the repository,
 * reading an ignored or invisible path, or reading a file that does not
 * exist, is an operational failure — check with `files` first if a
 * file's existence is in question.
 *
 * The result is cached for the duration of the lint run,
 * so repeated calls do not re-read the file.
 *
 * @callback ReadFile
 * @param {string} [path]
 * @returns {Promise<string>}
 */

/**
 * Lists repository files matching a glob.
 *
 * Accepts `*` (within one segment) and `**` (across segments), matched
 * against the same file set `espalier lint` walks: ignored and invisible
 * paths are never returned. Results are repository-relative and sorted.
 *
 * This is what makes peer comparison possible — checks that compare a
 * file against its siblings rather than against itself:
 *
 *     const siblings = await files("components/buttons/*.tsx");
 *
 * Existence is the degenerate case: `(await files(p)).length > 0`.
 *
 * @callback ListFiles
 * @param {string} pattern
 * @returns {Promise<string[]>}
 */

/**
 * Passed to every ordinary per-file `lint` invocation.
 *
 * @typedef {Object} LintContext
 *
 * @property {string} path
 * Repo-relative path of the file currently being linted.
 *
 * @property {string} pattern
 * Normalized glob that matched `path`.
 * `[name]` placeholders are represented as `*`; `[...name]`
 * placeholders are represented as `**`.
 * `pattern === path` for exact structural rules.
 *
 * @property {Record<string, CaptureValue>} captures
 * Values extracted from named placeholders in the rule's path.
 * Single-segment placeholders produce strings. Recursive placeholders
 * produce arrays of path segments and may be empty.
 *
 * @property {ReadFile} read
 *
 * @property {ListFiles} files
 *
 * @property {EmitIssue} emit
 *
 * @property {Record<string, unknown>} addons
 * Shared resources built once per run by the module named in
 * `espalier.config.yaml`. Intended for expensive out-of-process
 * dependencies — a language server, an AST parser in another language —
 * whose startup cost cannot be paid per file.
 *
 * Anything available as a package should simply be imported by the rule
 * module that needs it; rule modules are ordinary ES modules.
 *
 * Addons may hold internal state, but nothing a rule does through an
 * addon may change what another rule sees. Rules execute in unspecified
 * order, and a run must produce the same issues regardless of it.
 *
 * See [CONFIG.MD](CONFIG.MD).
 */
```

An aggregate constraint instead receives:

```js
/**
 * @typedef {Object} AggregateMatch
 * @property {string} path
 * @property {Record<string, CaptureValue>} captures
 */

/**
 * @typedef {Object} AggregateLintContext
 * @property {AggregateMatch[]} matches
 * Sorted complete match set, possibly empty.
 * @property {string} pattern
 * The normalized aggregate glob. An extension list remains one brace glob.
 * @property {(path: string) => Promise<string>} read
 * @property {ListFiles} files
 * @property {EmitIssue} emit
 * @property {Record<string, unknown>} addons
 */
```

## Execution

Rules execute independently, in unspecified order, with no shared state. An aggregate constraint is collective only over its `matches`; it does not consume findings or state from per-file rules. A rule may read any visible file, but must not assume another rule has or has not run.

**Visible is the whole of what a rule may see.** `read` refuses a path outside the governed set with `read_ungoverned`, and `files` never returns one. This is not tidiness: an ungoverned path is one nothing stamps, so a rule that depended on one would be replayed unchanged after it changed. A rule that needs to consult an ignored file is a rule whose espalier should stop ignoring it.

**A `lint` function must be pure.** Its answer must follow from what it is handed — `path`, `pattern`, `captures`, and whatever `read` and `files` return — and from nothing else. The clock, the network and the environment are not inputs the runner can see, so a rule that consults one will be replayed from cache with an answer it would no longer give. The failure is silent: a stale pass, not an error. See [cli/lint/README.MD](cli/lint/README.MD#incremental-runs).

`addons` are held to the same standard and carry one obligation of their own: **an addon must not read the repository.** A parser handed a path opens a file the run never saw, and that dependency goes unrecorded. Hand it contents, or `read` the path first and throw the string away. The process behind an addon may hold state; its answers must not depend on any.


A `lint` function that throws is a bug in the rule, not a finding about the repository: the run fails with exit `2` and reports `rule_threw`. See [cli/lint/README.MD](cli/lint/README.MD) and [ERRORS.MD](ERRORS.MD).

A `lint` function is ordinary code and can be called from an ordinary test. [API.MD](API.MD) describes `runRule`, which builds this context from values you supply and returns the issues rather than printing them.
