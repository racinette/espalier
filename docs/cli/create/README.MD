# `espalier create`

Creates one absent file owned by a structural rule, or one absent declared
directory together with every file required beneath it. A rule template
renders source; a required rule without one contributes an empty file.

```bash
espalier create src/constants.ts --varname answer
```

The argument is a concrete repository path, not a template name. Espalier
resolves files and directories with the same structural tiers used by `lint`
and `explain`, so creation cannot place source outside the architecture that
declares it.

## Usage

```text
espalier create <path> help
espalier create <path> [template options]
```

The path immediately follows `create`. The positional word `help` resolves the
target and shows how that concrete file or directory will be created without
rendering or writing it. File help states the target path and then attaches the
structural description to the authored owning rule, without requiring that
description to fit grammatically after “Creates.” Directory help names the
authored directory and enumerates its required files. For custom templates the
response includes metavars, choices, required flags, defaults, examples, and
repeatability. When schemas provide examples, help assembles them into one
invocation. A required file without a custom template is identified as an
empty file.

For a file, every other argument after the path is parsed against the owning
template's schema. Schema keys become long flags exactly as authored: `varname`
becomes `--varname`, `withExport` becomes `--withExport`, and `"with-export"`
becomes `--with-export`. Espalier does not silently translate among naming
conventions.
There are no framework flags in this position: `--help`, `--config`,
`--format`, and `--out` are available to a template like any other schema key.
Configuration is always discovered upward from the working directory, and
creation reports in its one human format to standard output.

`espalier help create` is this page. `espalier create <path> help` is what
that creation will write.

For example, a component template may produce:

```text
Usage:
  espalier create components/AccountCard.tsx help
  espalier create components/AccountCard.tsx [template options]

Creates components/AccountCard.tsx.

Owned by:
  components/[name].tsx — a React component

Example:
  espalier create components/AccountCard.tsx --style module --with-story --tag accessible --tag interactive

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

## Creating a directory

A concrete directory selects the structural directory node that declares its
contents. Espalier recursively creates every required static or resolved leaf
beneath that node. A dynamic directory below it is an uninstantiated
collection, so creation does not invent a name for it or create anything under
it. Dynamic file collections and leaves marked `optional` are likewise absent:
neither is required for the new directory to be valid.

Each required file keeps its own template. Their schemas form the directory
command's arguments, always namespaced as
`--<relative-file>:<declared-option>`. Both halves are literal:

```bash
espalier create clients/stripe \
  --client.ts:transport fetch \
  --requestModels.ts:format zod \
  --models/error.ts:withDocs
```

Its help is composed from the directory and the required file rules:

```text
Usage:
  espalier create clients/stripe help
  espalier create clients/stripe [template options]

Creates clients/stripe/ and its required files.

Directory:
  clients/[provider]/ — an API client integration

Required files:
  client.ts — the client implementation
  models/error.ts — client error types
  requestModels.ts — request payload types

Example:
  espalier create clients/stripe --client.ts:transport fetch --models/error.ts:withDocs --requestModels.ts:format zod

Template options:

  client.ts:
    --client.ts:transport <fetch|axios>  HTTP transport (required, examples: fetch)

  models/error.ts:
    --models/error.ts:withDocs  Include documentation comments

  requestModels.ts:
    --requestModels.ts:format <types|zod>  Model representation (default: types, examples: zod)
```

A nested file retains `/` in the flag, and the option after `:` retains the
exact spelling from its schema. There is no filename flattening or case
conversion. The renderer for `models/error.ts` still receives
`{ withDocs: true }`; the namespace is composition at the CLI boundary, not a
change to the template API. Options with the same name on different files stay
independent rather than being coupled by an inferred shared value.

Directory help groups these qualified options by required file. Its example
invocation concatenates each template's examples in required-file order. A
required option with no example remains a qualified metavar. Shell quoting is
unchanged: quote a value containing spaces, not the option name.

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

## Writing

When present, a renderer must return a string. Espalier writes that string—or
the implicit empty string—verbatim and adds no newline, marker, or formatting
of its own. A file renderer completes before the write. For a directory, every
required renderer completes before any target file is written. Espalier then
claims the target directory with an exclusive creation and removes that new
directory if a file write fails, so the failed operation leaves no partial
target behind.

`create` never overwrites. An existing file or directory is refused without
running a renderer. The final file write and directory creation are exclusive,
so a target appearing concurrently is also preserved. There is deliberately no
`--force`: templates create source; they are not an update or migration
mechanism.

On success, file creation reports `written <path>`. Directory creation reports
each required file after the whole directory is committed; an empty directory
reports the directory itself. The command does not run linters afterwards;
generation and validation remain the two separate halves of the development
loop, and `espalier lint <path>` supplies the latter.
