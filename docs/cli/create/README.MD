# `espalier create`

Creates one absent file owned by a structural rule, or one absent declared
directory together with every file required beneath it and any selected optional files. A rule template
renders source; a required rule without one contributes an empty file.

```bash
espalier create src/constants.ts -- --varname answer
```

The argument is a concrete file or directory path, resolved from the current
working directory. Config discovery finds the governing project; it does not
change the base for resolving the target. An undeclared-target diagnostic
names the resolved repository-relative path and project root. Espalier
resolves files and directories with the same
[structural specificity](../../MATCHING.MD#ownership) used by `lint` and
`explain`, including narrower placeholder patterns, so creation follows the
architecture that declares the path.

## Usage

```text
espalier create <path> help [directory options]
espalier create <path> preview [directory options] -- [template options]
espalier create <path> [directory options] -- [template options]

Directory options:
  --with <leaf>      include an optional leaf; repeat for several
  --with-optional    include all optional leaves with concrete paths
```

The path immediately follows `create`. The positional word `help` resolves the
target and shows how that concrete file or directory will be created without
rendering templates or writing source. File help states the target path and
then attaches the structural description to the authored owning rule, without requiring that
description to fit grammatically after “Creates.” Directory help names the
authored directory and enumerates its required and selectable optional files. For custom templates the
response includes metavars, choices, required flags, defaults, examples, and
repeatability. When schemas provide examples, help assembles them into one
invocation. A required file without a custom template is identified as an
empty file.

Creation, help, and preview all compile directory guidance, guidance, and
descriptions. Their callbacks receive the authored declaration context, not
the target file's captures. Template renderers receive the concrete target
path and its captures; see [callback contexts](../../TYPES.MD#guidance).

The positional action `preview`, immediately after the path, renders the
selected templates without writing target files. Its following arguments use
the same schema as creation. File and directory help list this invocation too.

For a file, arguments after `--` are parsed against the owning template's
schema. The separator follows the path or `preview` action. Schema keys become long flags exactly as authored: `varname`
becomes `--varname`, `withExport` becomes `--withExport`, and `"with-export"`
becomes `--with-export`. Espalier does not silently translate among naming
conventions.
After the `--` separator, all flags belong to the template: `--help`, `--config`,
`--format`, and `--out` are available to a template like any other schema key.
Configuration is always discovered upward from the working directory, and
creation reports in its one human format to standard output.

`espalier help create` is this page. `espalier create <path> help` describes
the selected template's options and the files included in creation. It does
not render a source preview. Use it when you need that information; a template
with known options, or none, can be invoked directly. Missing required options
are reported before any file is written, with a command to inspect their help.

For example, a component template may produce:

```text
Usage:
  espalier create components/AccountCard.tsx help
  espalier create components/AccountCard.tsx preview -- [template options]
  espalier create components/AccountCard.tsx -- [template options]

Creates components/AccountCard.tsx.

Owned by:
  components/[name].tsx — a React component

Example:
  espalier create components/AccountCard.tsx -- --style module --with-story --tag accessible --tag interactive

Template options:
  --style <css|module|none>  Styling strategy (default: module, examples: module, css)
  --with-story              Create a Storybook story
  --tag <value>             Component tag (repeatable, examples: accessible, interactive)
```

String options provide `examples` as a non-empty array. Help shows every value;
the generated invocation uses the first for a scalar option and repeats a
repeatable flag for every value. A presence-only option uses `type: "flag"`;
`includeInExample: true` includes it in the invocation. Examples are never
runtime defaults. A flag that is absent supplies `false` to the renderer and
one that is present supplies `true`, without the help text presenting that
implementation detail as a configurable default.

## Abstract contracts

A path admitted by an abstract contract and not declared as an instance is
refused with `invalid_create_target`, naming the module to write. Declaring is
authoring, so `create` never writes into the espalier on your behalf: declare
the instance, then create it as any declared path. See
[INSTANCES.MD](../../INSTANCES.MD).

## Creating a directory

A concrete directory selects the structural directory node that declares its
contents. Espalier recursively creates every required static or resolved leaf
beneath that node. A broader sibling contributes no required files or template
options to an independent winning branch. An `instanceOf` branch inherits
its base files and templates. A dynamic directory below it is an uninstantiated
collection, so creation does not invent a name for it or create anything under
it. Dynamic file collections are likewise absent. Optional leaves are absent
unless selected with `--with` or `--with-optional`. Required and selected named
instances count toward their inherited collections' `minMatches`. If they do
not satisfy a collection's minimum, create the remaining members separately:
Espalier cannot invent their filenames. Directory help lists positive minimums,
including those below static subdirectories. Preview and creation include the
named required and selected files.

Each included file keeps its own template. Their schemas form the directory
command's arguments, always namespaced as
`--<relative-file>:<declared-option>`. Both halves are literal:

```bash
espalier create clients/stripe -- \
  --client.ts:transport fetch \
  --requestModels.ts:format zod \
  --models/error.ts:withDocs
```

Its help is composed from the directory and the required file rules:

```text
Usage:
  espalier create clients/stripe help [--with <leaf> | --with-optional]
  espalier create clients/stripe preview [--with <leaf> | --with-optional] -- [template options]
  espalier create clients/stripe [--with <leaf> | --with-optional] -- [template options]

Creates clients/stripe/ and its required and selected files.

Directory:
  clients/[provider]/ — an API client integration

Required files:
  client.ts — the client implementation
  models/error.ts — client error types
  requestModels.ts — request payload types

Optional files (paths relative to this directory):
  README.md — optional client documentation (empty file; no template defined)

Directory options:
  --with <leaf>     include an optional file; repeat for several
  --with-optional   include all listed optional files
Selecting a file inside an optional directory also includes that directory's required contents.

Example:
  espalier create clients/stripe -- --client.ts:transport fetch --models/error.ts:withDocs --requestModels.ts:format zod

Template options:

  client.ts:
    --client.ts:transport <fetch|axios>  HTTP transport (required, examples: fetch)

  models/error.ts:
    --models/error.ts:withDocs  Include documentation comments

  requestModels.ts:
    --requestModels.ts:format <types|zod>  Model representation (default: types, examples: zod)

Select optional files before --; template options follow --.
Dynamic collections need concrete names and are created separately.
Inspect their declarations with: espalier explain clients/stripe/ --concise
Choose a concrete file path, then run: espalier create <file> help
```

A nested file retains `/` in the flag, and the option after `:` retains the
exact spelling from its schema. There is no filename flattening or case
conversion. The renderer for `models/error.ts` still receives
`{ withDocs: true }`; the namespace is composition at the CLI boundary, not a
change to the template API. Options with the same name on different files stay
independent rather than being coupled by an inferred shared value.

Directory help groups these qualified options by included file. Its example
invocation concatenates each template's examples in included-file order. A
required option with no example remains a qualified metavar. Shell quoting is
unchanged: quote a value containing spaces, not the option name.

### Including optional files

`--with <leaf>` selects a listed optional file by its exact path relative to
the target directory. Repeat it for several files; duplicate selections create
one file. `--with-optional` selects all listed optional files. These options
apply to directory creation, preview, and help, and must precede `--`.

```bash
espalier create clients/stripe help --with README.md
espalier create clients/stripe preview --with README.md -- --client.ts:transport fetch
espalier create clients/stripe --with-optional -- --client.ts:transport fetch
```

Help always lists optional paths and descriptions. Selection adds their
namespaced template options and examples to help. Only included templates
accept arguments or require their mandatory options. Selection is identical
for preview and creation; all templates render before any target is written.
An unknown selection, missing argument, excluded selected path, or failed
renderer leaves the target absent. Selecting an already required file is an
error. `--with` takes a leaf path, not a directory, glob, absolute path, or a
path containing `..`.

The list includes static and resolved leaves beneath concrete subdirectories,
including optional named directories. Selecting a leaf inside an optional
directory activates that directory and includes its required contents too.
No option invents dynamic names. To create a dynamic member, name its concrete
path separately, then select optional files beneath that concrete directory.
An empty optional directory is not selected by these file-selection flags.

A template may itself define `with` or `with-optional`; after `--` these are
ordinary template keys. Files created individually use their template options
without filename prefixes. For instance, use
`espalier create clients/stripe/README.md help` to inspect its own options.

The target directory itself must be absent. `create` is not a repair command
for adding missing required files to an existing instance. When one structural
name is declared as both a file and a directory, the unadorned spelling selects
the file and a trailing slash explicitly selects the directory.

## Selecting the template

Only a structural rule owns a file, so only a structural rule may export
`template`. A constraint applies to files owned elsewhere and cannot decide
where a new file belongs.

The requested path must not exist. Dynamic paths are resolved normally:
`espalier create components/Button.tsx` selects the template on
`components/[name].tsx.mjs`. The path must nevertheless be inside the nearest
repository, visible under its external ignore policy, governed rather than
excluded, and declared by one structural rule. A target inside a child
espalier is delegated to that child exactly as `explain` and `adopt` delegate.

The template renderer receives `{ path, captures }` after its schema-derived
arguments. Here `path` is relative to the repository that owns the rule and
`captures` is the same structural match data available to its linter. The
component example therefore gets `AccountCard` from `captures.name`; asking the
caller to repeat it as `--name AccountCard` would create two sources of truth.

A rule without a template still participates in `create`: its implicit template
is the empty string. Empty creation is useful because ownership often tells an
agent where a file belongs even when the rule has no opinion about its initial
contents. Export `template` only when a meaningful starting point or arguments
exist.

Review the created source and complete any placeholders the template author
has marked. Templates provide a starting point; creation does not establish
that the resulting code satisfies its rules or compiles with sibling files.
Run the project's checks after completing the change.

Guidance for a dynamic directory is shared at its longest static prefix. For
example, `src/features/[feature]/` uses guidance in `src/features/`; creating
another feature can leave `espalier build` with no document changes. Read the
nearest ancestor guidance as described in [build](../build/README.MD#where-files-go).

## Previewing source

```bash
espalier create src/constants.ts preview -- --varname answer
espalier create clients/stripe preview -- --client.ts:transport fetch
```

Preview uses the same structural owner, template options, defaults, captures,
and required and optional file selection as creation. The target must be absent
and governed; an existing or excluded target is refused before template
rendering. Include optional files with `--with` or `--with-optional`, or preview
one by naming its concrete path separately. Uninstantiated collections are
omitted from a directory preview.

Espalier renders every selected template before printing any preview source.
A missing or invalid argument, a thrown renderer, or a non-string result exits
`2` with the same operational error as creation and no partial preview. A
successful preview exits `0`. It creates no directories, writes no target
files, and reports no `written` events. It does not test write permissions or
reserve a target for a later creation.

Output is human text on stdout. Each file has a `Preview: "<path>"` header,
using a repository-relative path, followed by its source in a fenced `text`
block. Paths are quoted and special characters escaped to keep headers on
one line. The fence is longer than any backtick run in the source. Source is
neither indented nor reformatted. When it has no final newline, one is added
for the closing fence and `(no trailing newline)` follows the block; that
display newline is not part of the rendered file. An empty source is shown as
`(empty file)` instead of a fenced block. When no files are included, preview shows the directory path and
`(no required files)`. Selected optional files appear like required files.

The final line counts files: `1 file previewed.` or `N files previewed.`
For example:

````text
Preview: "src/constants.ts"
```text
export const answer = 42;
```

1 file previewed.
````

Preview imports rule modules and executes their renderers, just as creation
does. Those functions are ordinary JavaScript: side effects in template code
still run. Renderers should return source from their arguments and context
without changing the filesystem or depending on changing external state.
With the same inputs, preview and creation use the same rendered source;
preview does not cache it for a later invocation.

## Writing

When present, a renderer must return a string. Espalier writes that string—or
the implicit empty string—verbatim and adds no newline, marker, or formatting
of its own. A file renderer completes before the write. For a directory, every
included renderer completes before any target file is written. Espalier then
claims the target directory with an exclusive creation and removes that new
directory if a file write fails, so the failed operation leaves no partial
target behind.

`create` never overwrites. An existing file or directory is refused without
running a template renderer. The final file write and directory creation are
exclusive, so a target appearing concurrently is also preserved. There is deliberately no
`--force`: templates create source; they are not an update or migration
mechanism.

On success, file creation reports `written <path>`. Directory creation reports
each required and selected optional file after the whole directory is committed;
an empty directory reports the directory itself. The command does not run linters afterwards;
generation and validation remain the two separate halves of the development
loop, and `espalier lint <path>` supplies the latter.

## Argument boundary

Espalier options precede `--`; template options follow it. For example:

```sh
espalier create clients/stripe -- --client.ts:transport fetch
espalier create src/client.ts preview -- --transport fetch
```

The separator is optional when there are no template arguments. Template flags
before the separator are rejected with an explanation of the boundary. Help
and example invocations include the separator. A specialization creates the
same inherited required structure and uses inherited templates unless it
supplies its own template.
