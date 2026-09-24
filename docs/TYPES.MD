# Types

The contract between a rule module and the runner: what a module exports, and what its `lint` function receives.

For how a module's position in the tree becomes a pattern, see [MATCHING.MD](MATCHING.MD).

## Rule modules

Every rule module — structural or constraint — exports the same base shape.

```js
export const description = "a button component";

export const referenceImplementation = "components/buttons/SubmitButton.tsx";

export const rule = `
Default-export a single component named after the file.
Props must be a named exported interface \`<Name>Props\`.
`;

export async function lint(context) {
  // deterministic validation
}
```

The function export above is the complete runtime contract and remains valid.
For contextual TypeScript and editor types, the package also exports identity
helpers:

```js
import { createLinter } from "espalier";

export const lint = createLinter(async ({ path, captures, read, files, emit, addons }) => {
  const source = await read();
  // Every context member and emitted issue is typed here.
});
```

See [Typed linter helpers](#typed-linter-helpers) for specialization and the
aggregate form.

| Export | Required | |
|---|---|---|
| `description` | structural only | briefly describes the file, or summarizes a constraint's requirement |
| `rule` | yes | the natural-language conventions, in markdown |
| `lint` | yes | deterministic validation |
| `referenceImplementation` | no | a path to a canonical conforming file |
| `optional` | no | whether this file has to exist |
| `aggregate` | no | run a constraint once over its complete match set |
| `targets` | no | positive globs selecting files for an extensionless constraint; required when the filename has no extension selector |
| `unobservedImplementationDependencies` | no | explicit implementation inputs that module observation cannot see |
| `template` | no | a schema and renderer from which `espalier create` can create this kind of file |

### `description`

For a structural rule, `description` is required: briefly describe what the
governed file is, such as "a payment provider client."

For a constraint, `description` is optional: briefly summarize the requirement,
such as "checkout message IDs agree across locales." Put the full requirements
in `rule`.

### `rule`

The conventions the file must follow, in natural language. Markdown is supported.

An ordinary template literal is the right default. A backtick inside one has to be written `` \` `` either way — the literal would otherwise end — and an ordinary template literal resolves that escape, while `String.raw` keeps the backslash and puts it in your documentation. Reach for `String.raw` when the text contains backslashes and no backticks, which in practice means a regular expression.

```js
export const rule = `Props must be a named exported interface \`<Name>Props\`.`;
export const rule = String.raw`File names must match ^[A-Z][a-zA-Z0-9]*$.`;
```

The `rule` is **mode-invariant**: the same text applies whether the file is being created or edited. Exporters render it for each surface; they never rewrite it. It is also what a violation carries back to the agent, so write it as guidance rather than as a description of the check.

### `referenceImplementation`

One file that gets this right. Models follow an example far more reliably than they follow prose, and exported documentation is the only guidance available before a file is written.

```js
export const referenceImplementation = "components/buttons/SubmitButton.tsx";
```

**`referenceImplementation` is a path, and it is the form to reach for**,
because it cannot drift. The file it names must exist, be a governed file,
and actually be owned by this structural rule or covered by this constraint. It
is therefore linted by the rule on every full run; if it stops conforming you
get an ordinary issue on it. Espalier validates those conditions whenever it
opens the repository. A broken reference is a specification error and exits
`2` with `invalid_reference_implementation`.

The value is always a repository-relative path, never inline source. Source
embedded in a rule module would duplicate an implementation without subjecting
that copy to the rule's linter, allowing the supposed reference to drift. When
no conforming file exists yet, omit `referenceImplementation` and use
`template` to create the first one. It may become the reference after it exists
and passes lint.

### `template`

A structural rule may export a file-creation template:

```js
import { createTemplate, type TemplateContext } from "espalier";

interface ComponentCaptures {
  name: string;
}

export const template = createTemplate(
  {
    style: {
      type: "string",
      choices: ["css", "module", "none"],
      default: "module",
      description: "Styling strategy",
      examples: ["module", "css"],
    },
    "with-story": {
      type: "flag",
      description: "Create a Storybook story",
      includeInExample: true,
    },
  },
  (
    { style, "with-story": withStory },
    { captures }: TemplateContext<ComponentCaptures>,
  ) =>
    `export function ${captures.name}() { return null; }\n` +
    `// style: ${style}; story: ${withStory}\n`,
);
```

`espalier create <path>` resolves the concrete path to its structural owner and
uses that rule's template. A template returns the file contents only; the
structural rule decides where the file may go. This keeps creation inside the
same ownership model that `lint`, `explain`, and generated documentation use.
When `template` is absent, `create` writes an empty file: every declared file
has a safe baseline creation behavior, while the export is reserved for rules
with a meaningful starting point or arguments. Constraints may not export
templates because they apply to files owned by structural rules and declare no
destination of their own.

When the concrete path is a directory, `create` composes the templates of every
required descendant. Each schema key appears at the CLI as
`--<relative-file>:<schema-key>` and is stripped back to its original key before
that file's renderer runs. The template definition and its inferred argument
type therefore remain local to one file; directory creation adds no second
renderer protocol and does not couple same-named options from different files.

The schema is a flat object because command-line flags are flat. Every key is
the exact long flag name: no camel-case or kebab-case conversion takes place.
Keys contain letters, numbers, and hyphens and begin with a letter. Every option
has a non-empty `description`, which is shown by
`espalier create <path> help`. Help is a positional action rather than a flag,
so no long flag names are reserved by the create command.

String options support:

| Field | Default | |
|---|---|---|
| `type` | required | `"string"` |
| `description` | required | help text |
| `required` | `false` | require the flag; cannot be combined with a default |
| `default` | none | a string, or an array when `multiple` is true |
| `examples` | none | a non-empty list of documentation-only values |
| `choices` | unrestricted | a non-empty list of accepted strings |
| `multiple` | `false` | collect repeated flags into an array |
| `metavar` | `"value"` | value name displayed by help; choices replace it when no metavar is set |

Presence-only options use `type: "flag"`, not `"boolean"`: the CLI accepts
`--with-export`, not a boolean value. A flag accepts `description` and optional
`includeInExample: true`; it has no configurable default. Its absence supplies
`false` to the renderer and its presence supplies `true`, so it is always
present in the renderer arguments. A repeated string is always an array. A
required string and a string with a default are also always present. An
optional string without a default may be absent.

Examples affect help only and never supply renderer arguments. When any option
has an example—or a required string needs a placeholder—creation help adds an
`Example:` invocation in schema order. A scalar string uses the first entry in
`examples`; a repeated option repeats its flag once for every entry; and
`includeInExample: true` includes a presence-only flag. Help displays every
declared example. Required strings without examples use their metavar, choices,
or `value` between angle brackets. Examples must be non-empty and must satisfy
`choices` when present.

The renderer's final argument is `{ path, captures }`. `path` is the concrete
path relative to the repository that owns the rule. `captures` contains the
values bound by that rule's structural placeholders, so a rule stored at
`components/[name].tsx.mjs` can derive `AccountCard` directly from a request for
`components/AccountCard.tsx`. Repeated captures are arrays, as they are for a
linter, and backreferences bind no additional value.

The renderer may be synchronous or asynchronous and must return a string.
Espalier writes it verbatim. A template with no options uses the overload that
omits the schema and the template-arguments object; its sole argument is still
the creation context:

```js
export const template = createTemplate(
  ({ captures }) => `export const name = ${JSON.stringify(captures.name)};\n`,
);
```

A zero-parameter callback remains valid when the template needs neither
arguments nor context.

`createTemplate` brands the definition so an arbitrary object that merely
resembles one is rejected as `module_invalid_export`. Schema contradictions,
unknown descriptor keys, invalid defaults, and a template exported from a
constraint are rejected at module compilation for the same reason.

### `optional`

```js
export const optional = true;
```

A static leaf is required: `main.ts.mjs` means `main.ts` must exist.
`optional = true` allows it to be absent. When present, the file remains
structurally owned and subject to its rule.

It exists for the file that some instances of a shape have and others do not. Without it, an espalier has two ways to describe `webhook.ts` when one client has one and another does not, and both say something false. Declare it and every client without a webhook is missing a required file. Leave it undeclared and the client that has one is reporting `unexpected_path` for a file everybody agrees belongs there. Optional is the third statement — *a client may have a webhook, and here is how to write it* — and it is the only one of the three that is true.

Only structural leaves take it. A dynamic leaf is already a collection that may be empty, and a constraint never requires anything, so `optional` on either has nothing to say and is rejected as `module_invalid_export` rather than ignored.

### `targets`

```js
export const targets = ["*/queries.sql"];
```

Every constraint selects files in exactly one way. A filename such as
`query-count.sql.mjs` selects the `.sql` extension. A filename such as
`query-count.mjs` must export `targets`. The two forms are mutually exclusive
for per-file and aggregate constraints alike. The filename selector matches
the complete extension exactly, so `.sql` does not include `.up.sql`. A
`**/*.sql` target glob does include both. Multiple dotted parts such as
`up.sql` stay together, and `{ts,tsx}` lists alternative complete extensions.
`targets` patterns form
an unordered positive union; Espalier deduplicates and sorts them. Either form
is intersected with the constraint's directory pattern. Neither can admit
ignored, ungoverned, or structurally unowned files, declare required paths,
or otherwise change repository structure.

Patterns are relative to the compiled prefix before the recursive placeholder.
For a constraint at `fixtures/[...fixture]/query-count.mjs`, the selector
above matches `fixtures/alpha/queries.sql` but not `fixtures/alpha/schema.sql`.
`targets` must be a non-empty array of non-empty relative patterns. Negation,
absolute patterns, and `..` segments are rejected.

Patterns use minimatch syntax, including brace alternatives:
`targets = ["**/*.{ts,tsx}"]`. See [Glob syntax](MATCHING.MD#glob-syntax) for
wildcards, escaping, and the platform-independent matching options.

Use `targets = ["**/*"]` when every file type in the directory pattern belongs
to the group. The same selector origin applies to per-file and aggregate
constraints. Existing constraint captures are preserved for every selected path. See
[MATCHING.MD](MATCHING.MD#target-selectors).

### `unobservedImplementationDependencies`

```js
export const unobservedImplementationDependencies = [
  "src/query/worker/**/*",
  "src/query/**/*.wasm",
];
```

This is an explicit escape hatch for implementation inputs Node's module
loader cannot observe: worker and child-process code, native or WebAssembly
payloads, grammars and configuration opened internally by a library, and
similar support files. Ordinary JavaScript and TypeScript imports do not belong
here; Espalier observes those, including transitive and dynamic imports.

Patterns are positive globs relative to the repository root. They may match
ignored or otherwise ungoverned paths because implementation inputs are not
lint data. Node's `fs.globSync` discovers these paths; this is a filesystem
query, separate from the minimatch queries over known paths used by `targets`
and `files`. Espalier records both the matching path set and each member's size
and modification time. A change invalidates the complete lint cache.

The export grants no read or reporting capability. `read` remains limited to
governed files, and issue paths remain repository-relative. The deliberately
long name is a reminder that this is exceptional bookkeeping, not the ordinary
way for a rule to consume repository data.

### `aggregate`

```js
export const aggregate = true;
```

An ordinary constraint runs once per owned file it matches. An aggregate
constraint runs once with the complete matching set:

```js
export async function lint({ matches, patterns, read, emit }) {
  const contents = await Promise.all(matches.map(({ path }) => read(path)));
  // Compare or summarize the group and emit findings for any violations.
}
```

Only constraint modules take `aggregate`. Structural rules exist to describe
and lint one owned file at a time, so setting it there is
`module_invalid_export` rather than an execution mode with unclear ownership.

An aggregate has the same filename grammar and selection as a per-file
constraint. `message-registry.tolk.mjs` selects `.tolk` files;
`message-registry.mjs` requires `targets`. `aggregate = true` changes only the
invocation: one `lint` call receives the complete selected group, which may be
empty.

`matches` is a sorted array of `{ path, captures }`. Captures belong to each
match because a recursive placeholder usually binds a different value for every
file in the group. The aggregate context itself has no singular `path`,
`pattern`, or `captures`; `read` therefore always requires a path.
`patterns` is the admission glob list derived from the filename extension or
from `targets`, within the constraint's directory pattern. For filename
selectors these globs can overapproximate: `**/*.ts` admits `foo.d.ts` as a
glob, but a `.ts` filename selector rejects it.

The module runs once even when `matches` is empty. This lets a collective rule
enforce minimum population rather than silently disappearing in precisely the
case it was meant to reject. Its default issue path is the constraint's longest
static directory prefix, with a trailing slash, or `.` for a root constraint.
As with any issue, `emit({ path })` may attach it somewhere more specific.

An issue's `pattern` field remains one string: the sole admission glob, or the
sorted list joined with ` | ` when there are several.

## Typed linter helpers

`createLinter` supplies the ordinary per-file context type and returns the exact
function it receives:

```js
import { createLinter } from "espalier";

export const lint = createLinter(async ({
  path,
  pattern,
  captures,
  read,
  files,
  emit,
  addons,
}) => {
  // ...
});
```

It is optional and has no runtime protocol of its own. A previously written
`export async function lint(context) {}` remains valid, and compilation still
checks only that `lint` is a function.

`createAggregateLinter` supplies the distinct aggregate context:

```js
export const aggregate = true;

export const lint = createAggregateLinter(async ({
  matches,
  patterns,
  read,
  files,
  emit,
  addons,
}) => {
  // ...
});
```

The `aggregate = true` export remains the runtime declaration. The helper does
not infer or alter execution mode; using the ordinary or aggregate helper is a
typing choice, while the module export is what the compiler obeys.

Both helpers accept two optional type parameters, captures first and addons
second:

```ts
interface ProjectAddons {
  parser: Parser;
}

export const lint = createLinter<
  { component: string },
  ProjectAddons
>(async ({ captures, addons }) => {
  captures.component; // string
  addons.parser;       // Parser
});
```

Capture names come from the rule module's filename at runtime, which a
TypeScript declaration imported from `espalier` cannot inspect. The default is
therefore `Record<string, string | string[]>`; specializing it states what the
module's own path already promises. Addons similarly default to
`Record<string, unknown>` because their shape belongs to the configured addons
module rather than to Espalier.

The exported type surface is:

- `LintIssue` and `EmitIssue`
- `ReadFile`, `AggregateReadFile`, and `ListFiles`
- `LintContext<Captures, Addons>` and `Linter<Captures, Addons>`
- `LintMatch<Captures>`
- `AggregateLintContext<Captures, Addons>` and
  `AggregateLinter<Captures, Addons>`

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

A constraint's filename is a rule name with either an extension selector or `targets`, rather than a placeholder, so the matched filename is not captured. Read `context.path` on a per-file constraint, or each match's `path` on an aggregate.

Distinct placeholders capture independently: both `stripe/stripe.ts` and
`stripe/client.ts` match `[provider]/[implementation].ts`. When a later path
part must repeat an earlier capture, use a back-reference instead:
`[provider]/{provider}.ts` matches the first path but not the second. The
matcher enforces that relationship before `lint` runs.

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
 * reading an ungoverned path, or reading a file that does not exist, is
 * an operational failure — check with `files` first if a file's existence
 * is in question.
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
 * Accepts minimatch globs, including `*`, `**`, `?`, character classes,
 * brace alternatives and extglobs. See MATCHING.MD "Glob syntax".
 * Patterns match against the same file set `espalier lint` walks: ungoverned
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
 * @property {string[]} patterns
 * Admission globs derived from the filename extension or `targets`.
 * @property {(path: string) => Promise<string>} read
 * @property {ListFiles} files
 * @property {EmitIssue} emit
 * @property {Record<string, unknown>} addons
 */
```

## Execution

Rules execute independently, in unspecified order. Correctness cannot depend on execution order, mutable communication between rules, or unrecorded inputs. An aggregate constraint is collective only over its `matches`; it does not consume findings or state from per-file rules. A rule may `read` any governed file, but must not assume another rule has or has not run.

**Governed files are the lint-data universe.** `read` refuses a path outside that set with `read_ungoverned`, and `files` never returns one. Filesystem-visible paths are those that survive `ignoreFiles`. `.espalierignore`, child espaliers, and Espalier's own machinery then exclude paths from governance. An ungoverned path is one nothing stamps, so a rule that depended on one would be replayed unchanged after it changed. A rule that needs to consult an ignored file is a rule whose espalier should stop ignoring it.

Implementation dependencies are separate: imported modules, and paths declared in `unobservedImplementationDependencies`, affect whether a cached answer is still valid. They are not lint data. `read` still refuses them when they are ungoverned.

Process-local parser or addon infrastructure may reuse state when every answer remains a function of tracked lint data and observed or declared implementation dependencies.

**A `lint` function must be pure.** Its answer must follow from what it is handed — `path`, `pattern`, `captures` on an ordinary constraint, or `matches` and `patterns` on an aggregate, and whatever `read` and `files` return — plus its observed or explicitly declared implementation dependencies, and from nothing else. The clock, the network and the environment are not inputs the runner can see, so a rule that consults one will be replayed from cache with an answer it would no longer give. The failure is silent: a stale pass, not an error. See [cli/lint/README.MD](cli/lint/README.MD#incremental-runs).

Addons must receive repository data through their arguments, not read it
themselves. Read file contents with the lint context's `read` function and pass
the returned contents to the addon. This keeps those reads tracked for cache
invalidation.

Files used to implement the addon itself—such as worker code, parser grammars,
or WebAssembly binaries—belong in `unobservedImplementationDependencies` when
module observation cannot track them.

The process behind an addon may hold state; its answers must not depend on any
unrecorded input.


A `lint` function that throws is a bug in the rule, not a finding about the repository: the run fails with exit `2` and reports `rule_threw`. See [cli/lint/README.MD](cli/lint/README.MD) and [ERRORS.MD](ERRORS.MD).

A `lint` function is ordinary code and can be called from an ordinary test. [API.MD](API.MD) describes `runRule`, which builds this context from values you supply and returns the issues rather than printing them.
