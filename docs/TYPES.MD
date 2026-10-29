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
| `description` | structural only | string or sync/async function briefly describing the file or a constraint's requirement |
| `rule` | yes | Markdown string or function returning the natural-language conventions |
| `lint` | yes | deterministic validation |
| `referenceImplementation` | no | a path to a canonical conforming file |
| `optional` | no | whether a named file may be absent |
| `instanceOf` | no | matching inherited contract for a named member |
| `minMatches` | no | minimum membership of a dynamic collection |
| `literalName` | no | the filename's brackets or braces are the name, not placeholders |
| `aggregate` | no | run a constraint once over its complete match set |
| `targets` | no | positive globs selecting files for an extensionless constraint; required when the filename has no extension selector |
| `template` | no | a schema and renderer from which `espalier create` can create this kind of file |
| `groups` | no | named groupings of a dynamic rule's files by shared captures, each with its own rule and `lint` |

### `description`

For a structural rule, `description` is required: briefly describe what the
governed file is, such as "a payment provider client."

For a constraint, `description` is optional: briefly summarize the requirement,
such as "checkout message IDs agree across locales." Put the full requirements
in `rule`.

The export accepts a string or a synchronous or asynchronous function returning
a string. Functions receive `RuleGuidanceContext`, with the same declaration
context and evaluation timing as [`rule`](#rule). Each callback gets its own
isolated context. Descriptions are rendered once per declaration before lint
workers start, including when no files match; maps, creation help, explain, and
findings use that rendered string. A thrown or rejected callback is
`rule_guidance_failed`; a non-string result is `module_invalid_export`.

### `rule`

The conventions the file must follow, in natural language. Markdown is supported.

An ordinary template literal is the right default. A backtick inside one has to be written `` \` `` either way — the literal would otherwise end — and an ordinary template literal resolves that escape, while `String.raw` keeps the backslash and puts it in your documentation. Reach for `String.raw` when the text contains backslashes and no backticks, which in practice means a regular expression.

```js
export const rule = `Props must be a named exported interface \`<Name>Props\`.`;
export const rule = String.raw`File names must match ^[A-Z][a-zA-Z0-9]*$.`;
```

Creation and editing use the same rendered requirements. Exporters format
them for each surface without rewriting them. A violation carries that text
back to the agent, so write it as guidance rather than as a description of the
check.

A structural rule or constraint may instead export a synchronous or asynchronous
function returning a string:

```js
/** @param {import("espalier").RuleGuidanceContext} context */
export function rule({ config }) {
  return config.build.guidanceMode === "fixed"
    ? "Changes to this file's responsibilities require architecture authorization."
    : "Discuss changes to this file's responsibilities before implementing them.";
}
```

`RuleGuidanceContext` contains `{ config, pattern, path, captures }`:

- `config` is an isolated snapshot of the resolved configuration, with defaults
  applied. Its `root` is the absolute repository path; `espalierRoot` is the
  configured rule-tree path relative to that repository.
- `pattern` is the authored declaration relative to the rule-tree root, without
  the final `.mjs`. For constraints it includes the rule name and selector; it
  is not an individual admission glob or matched filename.
- `path` is the concrete structural file path when fully known from the
  declaration, otherwise null. Constraints always receive null.
- `captures` contains bindings known from named specializations along the
  authored path, including a named file's inherited capture. Unbound dynamic
  and recursive placeholders are absent.

Each authored declaration's function runs once during repository compilation,
before lint workers start, including when no source file matches it. Inherited
base prose keeps its base declaration context; local prose uses the local
declaration context. The result is shared by build, explain, and lint findings.
It is not recomputed for each discovered file, inherited copy, extension selector,
or worker. Functions must be deterministic and free of side effects. They have
no lint inputs or addon state. `build --check` detects stale rendered prose.
A thrown or rejected callback is `rule_guidance_failed`; a non-string result is
`module_invalid_export`.

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

```ts
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
required descendant of the selected structural directory. Each schema key
appears at the CLI as `--<relative-file>:<schema-key>` and is stripped back to
its original key before that file's renderer runs. The template definition and its inferred argument
type therefore remain local to one file; directory creation adds no second
renderer protocol and does not couple same-named options from different files.

The schema is a flat object because command-line flags are flat. Every key is
the exact long flag name: no camel-case or kebab-case conversion takes place.
Keys contain letters, numbers, and hyphens and begin with a letter. Every option
has a non-empty `description`, which is shown by
`espalier create <path> help`. `help` and `preview` are positional actions rather
than flags, so no long flag names are reserved by the create command.

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
`components/AccountCard.tsx`. Structural captures are strings, and
back-references introduce no additional capture.

The renderer may be synchronous or asynchronous and must return a string.
`espalier create <path> preview` calls the same renderer with the same options
and context, displaying its result without writing target files. Renderers
should compute source without side effects so preview and creation agree for
the same inputs. Preview runs ordinary template code; it does not sandbox it.
See [create](cli/create/README.MD#previewing-source) for the display format.

Espalier writes source verbatim when creating files. Rendered source need not
parse or pass lint: a template provides the node's meaningful starting shape,
with TODO comments or format-appropriate placeholders for work the author must
complete. It need not invent an implementation to satisfy checks before that
work is done.

A template with no options
uses the overload that omits the schema and the template-arguments object; its
sole argument is still the creation context:

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

Named leaves and named directory instances accept a boolean `optional`:
false or omitted requires the member; true permits absence. An existing member
must satisfy its inherited contract. Optional directory instances retain
required contents when present. Required inherited named members cannot be
made optional. Dynamic leaves and constraints reject `optional`.

### `minMatches`

```js
export const minMatches = 1;
```

A dynamic structural leaf accepts a nonnegative safe integer, defaulting to
zero. The minimum applies in each existing owning directory. It does not
instantiate dynamic directories. Named specializations remain members of their
inherited collections; unrelated static owners do not. A collection can require
some member while a particular named member is optional. Named leaves and
constraints reject `minMatches`.

### `instanceOf`

`instanceOf` is a nonempty contract reference on a named structural leaf or
on a directory module. It is not valid on constraints or dynamic leaves.
Named structural rules keep their `description`, `rule`, and `lint` exports;
their lint adds to inherited checks. Their optional `template` replaces the
inherited creation recipe, without replacing checks. Without a local template,
creation uses the inherited template and its original captures.

See [Named instances](MATCHING.MD#named-instances) for composition and requiredness.

### `literalName`

```js
// espalier/pages/[id].tsx.mjs
export const literalName = true;
```

The module's filename is a name, not a pattern: `[id].tsx` matches exactly
the file called `[id].tsx`, as a Next.js pages router names its dynamic page.
The leaf is static, so it is required by default, accepts `optional` and
`instanceOf`, and captures nothing. The flag must be a boolean, is rejected on
a constraint, and is rejected on a filename with no bracket or brace. The same
export on a directory module makes the directory's name literal.
See [Literal names](MATCHING.MD#literal-names).

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

An aggregate's issues record the constraint's declaration as `pattern`, as
every rule's issues do; the admission globs stay on `context.patterns`.

### `groups`

A dynamic structural rule describes one file at a time. Some obligations hold
over several of its files together: the steps of one migration set, every
language of one page, every page of one language. A grouping names such a
collection by the captures its members share:

```js
// migrations/[num=0000][ord=00]_[group=a+].sql.mjs
export const groups = {
  set: {
    by: ["num", "group"],
    description: "a migration set",
    rule: "Steps are numbered from 01 with no gaps.",
    async lint({ captures, matches, emit }) {
      // captures = { num: "0001", group: "users" }
      // matches  = every file with those two values, with its full captures
    },
  },
  release: {
    by: ["num"],
    description: "one release's migrations",
    rule: "Every group in a release is listed in RELEASES.txt.",
    async lint({ captures, matches, read, emit }) { /* … */ },
  },
};
```

Each key is the grouping's name, an identifier that appears in guidance, in
`explain`, and on the issues it emits. Each value has:

| Field | |
|---|---|
| `by` | captures of this rule's path whose values identify a group; the others vary within it |
| `description` | what one group is, for headings |
| `rule` | the Markdown obligation the group as a whole must satisfy |
| `lint` | runs once per group with that group's members |

`by` may be empty, which groups every file the rule owns in one directory.
It may not name every capture, since each group would then hold one file,
and two groupings may not name the same set of captures. A capture `by`
names must be one the rule's path declares. Any of these is
`module_invalid_export`, as is `groups` on a static leaf or a constraint,
which have no captures to group by.

Groups are per directory: files in two directories matched by the same
dynamic path are in different groups even when their captures agree. A group
is induced by the files that exist, so `lint` never sees an empty group; a
group that must exist is the containing directory's `minMatches` or a static
sibling's business. A named instance of the rule contributes its file to the
base rule's groups, with the captures the base path binds.

The `lint` context is:

| Field | |
|---|---|
| `group` | the grouping's name |
| `captures` | the values of the `by` captures, shared by every member |
| `matches` | the members as sorted `{ path, captures }`, each with its full captures |
| `path` | the directory holding the group with a trailing slash, or `.`; the default issue path |
| `pattern` | the rule's declaration, e.g. `migrations/[num=0000][ord=00]_[group=a+].sql` |
| `read` | reads a governed file; a path is required, since no one member is the group |
| `files`, `emit`, `addons` | as for every rule |

Issues a grouping emits carry the rule's module path, the grouping's name as
`group`, the shared captures, and the grouping's own `rule` text and
`description`. Attach an issue to a member or another file with `path` when
one file has to change; the directory is the right address when the group as
a whole is wrong. Groupings run as jobs beside aggregates and follow the same
scoping rule: a scoped lint that reaches one member runs the whole group.

## Directory modules

`ESPALIER.mjs` describes its containing directory. It does not export a
structural `rule`, `lint`, or `template`. Its exports are:

| Export | Default | Meaning |
|---|---|---|
| `description` | absent | string or sync/async function returning the directory description for maps |
| `guidance` | empty | Markdown string or function returning a string, synchronously or asynchronously |
| `fold` | `false` | fold this subtree's generated documents into its enclosing document |
| `instanceOf` | absent | a matching sibling dynamic directory contract, such as `"../[feature]"` |
| `optional` | `false` | permit a named directory instance to be absent; valid only with `instanceOf` |
| `literalName` | `false` | the directory's brackets or braces are its name, as in a Next.js `[slug]` route; see [Literal names](MATCHING.MD#literal-names) |

For example, computed guidance can follow the configured architecture mode:

```js
/** @param {import("espalier").DirectoryGuidanceContext} context */
export function description({ config }) {
  return "shared application runtime" + (config.build.guidanceMode === "fixed" ? " (read-only)" : "");
}

/** @param {import("espalier").DirectoryGuidanceContext} context */
export function guidance({ config }) {
  return config.build.guidanceMode === "fixed"
    ? "Use the established runtime. Report missing capabilities before changing its architecture."
    : "Discuss missing runtime capabilities and agree on placement before changing its architecture.";
}
```

Both `description` and `guidance` functions receive `DirectoryGuidanceContext`:
`{ config, pattern, path, captures }`. `config` has the same resolved shape
described for [`RuleGuidanceContext`](#rule), including `build` and `lint`
settings. `pattern` is the authored directory path, relative to the rule-tree
root. `path` is the concrete repository-relative path when known at compile
time, otherwise null; both paths are the empty string at the root. `captures`
contains known inherited bindings. An ordinary `[feature]` declaration does
not acquire a different context for each directory discovered on disk.

Each description or guidance function runs once per authored declaration during
repository compilation, with its own isolated context, including commands that
only inspect or lint the tree. Keep them deterministic and free of side
effects; return prose from their explicit inputs. A thrown error or a
non-string result is `malformed_node_description`. `build --check` compares
the rendered result with generated output and detects stale guidance.

See [matching](MATCHING.MD#named-instances) for inheritance and
[build placement](cli/build/README.MD#where-files-go) for static prefixes,
named instances, and folding. Legacy `ESPALIER.MD` remains readable during
migration, but a directory cannot contain both formats.

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

`createGroupLinter` types one grouping's `lint` inside `groups`:

```js
export const groups = {
  set: {
    by: ["num", "group"],
    description: "a migration set",
    rule: "Steps are numbered from 01 with no gaps.",
    lint: createGroupLinter(async ({ group, captures, matches, read, emit }) => {
      // ...
    }),
  },
};
```

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
- `GroupLintContext<Captures, Addons>` and `GroupLinter<Captures, Addons>`

## Captures

Path placeholders are exposed to `lint` through `captures`.

- `[name]` captures a string from one path segment
- `[...name]` captures an array containing each matched path segment
- `{name}` captures nothing; it matches what `[name]` already captured
- an independent exact path produces an empty object
- a named specialization retains captures bound by its inherited contract

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
 * Identical findings within one lint invocation are reported once, after
 * normalizing paths and defaults. Identity includes code, message, path,
 * severity, line, column, and deeply equal metadata (object key order does
 * not matter). Findings from separate invocations remain separate.
 *
 * @property {number} [line]
 * 1-based line number associated with the issue.
 *
 * @property {number} [column]
 * 1-based column number associated with the issue.
 *
 * @property {Record<string, unknown>} [metadata]
 * Additional structured issue data.
 * Findings cross a worker boundary during lint/check, so metadata must
 * support structured cloning. Use data rather than functions or handles.
 */

/**
 * Called once for every detected issue.
 *
 * @callback EmitIssue
 * @param {LintIssue} issue
 * @returns {void}
 */

/**
 * Reads UTF-8 file contents from the run's governed source snapshot.
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
 * Preparation and rules use the same snapshot. Repeated calls return the
 * captured contents; changes on disk during execution are not reread.
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
 * The rule's declaration as authored, relative to the rule-tree root and
 * without `.mjs`: `clients/[provider]/client.ts`. Placeholder names, masks and
 * back-references are kept; `path` is the file that matched.
 * `pattern === path` for a local exact structural rule. Inherited checks
 * retain their base declaration and capture names, even for a named instance.
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
 * Worker-local resources returned by the configured addon's `setup`.
 * Jobs in one worker share this object; other workers have their own
 * instances. Resources can include a compiler service or language server.
 *
 * Import packages and ordinary helpers directly. An addon may import a
 * compiler package while owning its expensive instances. Construct them
 * lazily from prepared data or contents and settings supplied by rules.
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

## Compiler diagnostic locations

Compiler diagnostics often name absolute files or dependency declarations.
Convert locations to repository-relative paths before emitting. An in-repository
dependency path is permitted even when ungoverned; an absolute or escaping path
is not. For a dependency type rejected by an application policy, attach the
finding to the application's import, annotation, or checked file and retain the
declaration origin in the message or `metadata`.

Line and column belong to the primary file. When falling back from a declaration
to an application file, omit the declaration's coordinates unless the analyzer
has an actual application location. `espalier examples compiler-addon` includes
an adapter and tests for application, dependency, external, and global locations.

## Execution

Rules execute independently, in unspecified order. An aggregate checks its
selected `matches`, and a grouping its group's; neither consumes findings or
state left by per-file rules. Each rule's answer must follow from its source inputs and implementation,
regardless of previous calls or which other rules execute.

**Read governed repository data through `read` and `files`.** `read` refuses
paths outside the governed set with `read_ungoverned`; `files` never returns
them. A rule that needs such a file as lint data must bring it into governance.
Imported implementation code does not become lint data.

Helpers and addons receive repository contents through their arguments instead
of opening governed files themselves. They may memoize analysis for identical
inputs, provided a cache hit produces the same answer as a fresh computation.
Internal resource state must not change rule results.

Every selected rule executes on every run, in a bounded worker pool. See
[parallel execution](cli/lint/README.MD#parallel-execution) and the addon
[prepare/setup lifecycle](CONFIG.MD#addons).

An ordinary exception from `lint` fails the run with exit `2` and `rule_threw`.
Context validation failures preserve their specific codes, such as
`invalid_issue` or `read_ungoverned`. Neither is a finding about the repository. See [cli/lint/README.MD](cli/lint/README.MD) and [ERRORS.MD](ERRORS.MD).

A `lint` function is ordinary code and can be called from an ordinary test. [API.MD](API.MD) describes `runRule`, `runAggregate` and `runGroup`, which build these contexts from values you supply and return the issues rather than printing them.
