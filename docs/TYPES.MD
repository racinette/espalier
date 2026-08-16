# Types

The contract between a rule module and the runner: what a module exports, and what its `lint` function receives.

For how a module's position in the tree becomes a pattern, see [MATCHING.MD](MATCHING.MD).

## Rule modules

Every rule module — structural or constraint — exports the same shape.

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
| `example` | no | a canonical conforming file |

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

### `example`

An optional pointer to one file that gets this right. Models follow an example far more reliably than they follow prose, and exported documentation is the only guidance available before a file is written.

```js
export const example = "components/buttons/SubmitButton.tsx";   // preferred
export const example = String.raw`export default function Submit() { … }`;
```

The path form is preferred because it cannot drift. The referenced file is a real file in the repository, so it is linted by this very rule on every run — if it stops conforming, you get an ordinary issue on it. Nothing extra is needed to keep it honest.

`espalier` checks at compile time that the path exists and that this rule's pattern matches it. A rule whose example does not match its own pattern is a specification error and exits `2`.

The inline form has no such guarantee and should be used only when no conforming file exists yet.

## Captures

Path placeholders are exposed to `lint` through `captures`.

- `[name]` captures a string from one path segment
- `[...name]` captures an array containing each matched path segment
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
 * Paths are repository-relative. Reading outside the repository, or
 * reading a file that does not exist, is an operational failure —
 * check with `files` first if a file's existence is in question.
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
 * Passed to every `lint` invocation.
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

## Execution

Rules execute independently, in unspecified order, with no shared state. A rule may read any visible file, but must not assume another rule has or has not run.

A `lint` function that throws is a bug in the rule, not a finding about the repository: the run fails with exit `2`. See [cli/lint/README.MD](cli/lint/README.MD).
